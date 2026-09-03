// /api/ai/invoice — lecture et extraction structurée de factures fournisseur.
//
// Reçoit le texte extrait côté client par pdf.js (ou plus tard les images de scan),
// appelle Workers AI pour structurer le document en JSON strict, valide et borne
// chaque champ avant de renvoyer le résultat pré-rempli au navigateur.
//
// Même modèle de sécurité que /api/ai/ask :
// - tenantFor() obligatoire (session gérant, caisse appairée, ou opérateur)
// - quota partagé dans ai_usage_kind(merchant, day, kind) via functions/api/ai/_quota.js
// - fail-soft : code d'erreur précis pour permettre un repli sur la table manuelle
// - AUCUN log du texte de facture (confidentialité marchande absolue)

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

/* Qwen3-30b reste le lecteur de factures : vérifié sans faute sur une vraie
 * facture le 2026-08-19, 0,0006 $ l'appel. On ne change pas ce qui marche ;
 * le copilote (ask.js) a ses propres raisons de passer à gpt-oss. */
export const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
/* Secours : autre éditeur, même gamme de prix, appel de fonctions — une panne
 * Qwen ne couche pas les deux. */
export const FALLBACK_MODEL = '@cf/zai-org/glm-4.7-flash';

const MAX_TOKENS = 2500;
const TEMPERATURE = 0.1;
const TOP_P = 0.9;
const DAILY_CAP = 200;
const MAX_TEXT_CHARS = 40000;

/* Validation et bornage strict des données extraites.
   Garantit : <= 200 lignes, label <= 120 car., nombres >= 0, format propre. */
export function validateInvoiceData(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const supRaw = raw.supplier || {};
  const supplier = {
    name: String(supRaw.name || '').slice(0, 120).trim(),
    ice: supRaw.ice ? String(supRaw.ice).slice(0, 30).trim() : '',
  };

  const number = String(raw.number || '').slice(0, 60).trim();
  const date = String(raw.date || '').slice(0, 20).trim();
  const currency = String(raw.currency || 'MAD').slice(0, 10).trim() || 'MAD';

  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  const lines = [];

  for (let i = 0; i < Math.min(rawLines.length, 200); i++) {
    const l = rawLines[i];
    if (!l || typeof l !== 'object') continue;
    const label = String(l.label || l.name || l.designation || '').slice(0, 120).trim();
    if (!label) continue;

    const qty = Math.max(0, Math.round((Number(l.qty) || 0) * 1000) / 1000);
    const unit = String(l.unit || 'unité').slice(0, 24).trim() || 'unité';
    /* Le coût unitaire est un TAUX, pas un montant affiché : 4 décimales,
     * comme le registre (inventory-ledger.js) qui le conserve tel quel.
     * Arrondi à 2, un ingrédient à 0,0045 MAD/g tombe à 0,00 et fausse le
     * coût de recette d'environ 25 % (symptôme HOTEL_ECONOMAT_PLAN.md).
     * Les TOTAUX restent à 2 décimales : ce sont eux qui s'affichent. */
    const unitCost = Math.max(0, Math.round((Number(l.unitCost != null ? l.unitCost : l.price) || 0) * 10000) / 10000);
    const total = Math.max(0, Math.round((Number(l.total != null ? l.total : (qty * unitCost)) || 0) * 100) / 100);

    /* Une remise de ligne vit dans le TOTAL, pas dans le prix unitaire : « 2 ×
     * 780, remise 5 %, total 1 482 ». Comparer 780 au prix d'achat de référence
     * signale une hausse que le commerçant n'a pas payée, et la confirmer
     * inscrirait 780 comme nouveau coût. Le prix retenu est donc le NET payé
     * (total ÷ qté) dès que le total s'écarte du brut de plus de 0,5 % ; le
     * brut reste disponible dans grossUnitCost. Un total ABSENT (qty × unitCost
     * recalculé ci-dessus) ne déclenche rien : net = brut. */
    let netUnitCost = unitCost;
    if (qty > 0 && total > 0 && unitCost > 0) {
      const gross = qty * unitCost;
      if (Math.abs(gross - total) / gross > 0.005) netUnitCost = Math.round((total / qty) * 10000) / 10000;
    }
    const line = {
      label,
      qty,
      unit,
      unitCost: netUnitCost,
      total,
    };
    if (netUnitCost !== unitCost) line.grossUnitCost = unitCost;
    if (l.ref) line.ref = String(l.ref).slice(0, 60).trim();
    if (l.ean) line.ean = String(l.ean).slice(0, 30).trim();

    lines.push(line);
  }

  const computedTotal = lines.reduce((acc, l) => acc + l.total, 0);
  const total = raw.total != null && Number.isFinite(+raw.total) && +raw.total >= 0
    ? Math.round(+raw.total * 100) / 100
    : Math.round(computedTotal * 100) / 100;

  return {
    supplier,
    number,
    date,
    currency,
    lines,
    total,
  };
}

/* Ce que Workers AI renvoie n'a pas UNE forme. Qwen3 sur l'API REST renvoie
 * `response` déjà PARSÉ (un objet) quand le modèle a produit du JSON ; d'autres
 * chemins renvoient une chaîne, avec ou sans clôture ```json ; la forme
 * OpenAI-compatible met le texte dans choices[0].message.content. Une seule
 * de ces formes traitée = toutes les factures en « unparsed » sur les autres,
 * et le commerçant retombe en saisie manuelle sans savoir pourquoi.
 * (Vérifié le 2026-08-19 sur une vraie facture : `response` est un objet.) */
export function parseModelResponse(aiRes) {
  if (!aiRes) return null;
  let raw = aiRes;
  if (typeof aiRes === 'object') {
    if (aiRes.response != null && aiRes.response !== '') raw = aiRes.response;
    else if (Array.isArray(aiRes.choices) && aiRes.choices[0]) {
      const c = aiRes.choices[0];
      raw = (c.message && c.message.content) || c.text || '';
    } else raw = '';
  }
  if (raw && typeof raw === 'object') return raw;
  let str = String(raw || '').trim();
  if (!str) return null;
  if (str.startsWith('```')) str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = str.indexOf('{'), b = str.lastIndexOf('}');
  if (a >= 0 && b > a) str = str.slice(a, b + 1);
  try { return JSON.parse(str); } catch (_) { return null; }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = null;
  try { body = await request.json(); } catch (_) { body = null; }
  if (!body) return json({ ok: false, error: 'body' }, 400);

  const who = await tenantFor(request, env, body.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  const kind = body.kind || 'text';
  if (kind !== 'text') {
    return json({ ok: false, error: 'unsupported-kind' }, 400);
  }

  const text = String(body.text || '').trim();
  if (!text) return json({ ok: false, error: 'empty-text' }, 400);

  if (!(await quotaOk(env, who, 'invoice', DAILY_CAP))) return json({ ok: false, error: 'quota' }, 429);

  const cleanText = text.slice(0, MAX_TEXT_CHARS);

  const systemPrompt = `Tu es un extracteur de factures et bons de livraison pour commerces et restaurants au Maroc.
Analyse le texte de la facture et extrais les informations au format JSON strict avec cette structure exacte :
{
  "supplier": { "name": "Nom du fournisseur", "ice": "ICE si présent" },
  "number": "Numéro de facture ou BL",
  "date": "AAAA-MM-JJ si identifiable, sinon date trouvée",
  "currency": "MAD",
  "lines": [
    {
      "label": "Nom de l'article",
      "qty": 10,
      "unit": "kg / unité / carton / pack / l / etc.",
      "unitCost": 45.5,
      "total": 455.0,
      "ref": "Référence fournisseur si présente",
      "ean": "Code-barres EAN si présent"
    }
  ],
  "total": 455.0
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte d'introduction ni commentaire.
- Si un champ est inconnu, mets une chaîne vide ou omet-le.
- Les nombres (qty, unitCost, total) doivent être des nombres numériques (pas de chaînes).`;

  const payload = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Voici le texte de la facture :\n\n${cleanText}` },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    top_p: TOP_P,
  };

  let aiRes;
  let usedModel = MODEL;
  try {
    const r = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
    aiRes = r.result;
    usedModel = r.model;
  } catch (_) {
    return json({ ok: false, error: 'model' }, 502);
  }

  const parsed = parseModelResponse(aiRes);
  if (!parsed) {
    return json({ ok: false, reason: 'unparsed' }, 200, { 'x-kiwi-ai-model': usedModel });
  }

  const validated = validateInvoiceData(parsed);
  if (!validated || !validated.lines.length) {
    return json({ ok: false, reason: 'unparsed' }, 200, { 'x-kiwi-ai-model': usedModel });
  }

  return json({
    ok: true,
    ...validated,
  }, 200, { 'x-kiwi-ai-model': usedModel });
}
