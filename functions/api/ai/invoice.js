// /api/ai/invoice — lecture et extraction structurée de factures fournisseur.
//
// Reçoit le texte extrait côté client par pdf.js (ou plus tard les images de scan),
// appelle Workers AI pour structurer le document en JSON strict, valide et borne
// chaque champ avant de renvoyer le résultat pré-rempli au navigateur.
//
// Même modèle de sécurité que /api/ai/ask :
// - tenantFor() obligatoire (session gérant, caisse appairée, ou opérateur)
// - quota partagé dans ai_usage(merchant, day, calls)
// - fail-soft : code d'erreur précis pour permettre un repli sur la table manuelle
// - AUCUN log du texte de facture (confidentialité marchande absolue)

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';

const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const MAX_TOKENS = 2500;
const TEMPERATURE = 0.1;
const TOP_P = 0.9;
const DAILY_CAP = 200;
const MAX_TEXT_CHARS = 40000;

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function quotaOk(env, merchant) {
  if (!env.DB) return true;
  try {
    const row = await env.DB.prepare(
      'SELECT calls FROM ai_usage WHERE merchant = ? AND day = ?'
    ).bind(merchant, today()).first();
    if (row && row.calls >= DAILY_CAP) return false;
    await env.DB.prepare(
      'INSERT INTO ai_usage (merchant, day, calls) VALUES (?, ?, 1) ' +
      'ON CONFLICT(merchant, day) DO UPDATE SET calls = calls + 1'
    ).bind(merchant, today()).run();
    return true;
  } catch (_) {
    return true;
  }
}

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
    const unitCost = Math.max(0, Math.round((Number(l.unitCost != null ? l.unitCost : l.price) || 0) * 100) / 100);
    const total = Math.max(0, Math.round((Number(l.total != null ? l.total : (qty * unitCost)) || 0) * 100) / 100);

    const line = {
      label,
      qty,
      unit,
      unitCost,
      total,
    };
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

  if (!(await quotaOk(env, who))) return json({ ok: false, error: 'quota' }, 429);

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

  let aiRes;
  try {
    aiRes = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Voici le texte de la facture :\n\n${cleanText}` },
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      top_p: TOP_P,
    });
  } catch (_) {
    return json({ ok: false, error: 'model' }, 502);
  }

  const responseText = aiRes?.response || (typeof aiRes === 'string' ? aiRes : '');
  if (!responseText) {
    return json({ ok: false, reason: 'unparsed' });
  }

  let parsed = null;
  try {
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }
    parsed = JSON.parse(jsonStr);
  } catch (_) {
    parsed = null;
  }

  const validated = validateInvoiceData(parsed);
  if (!validated || !validated.lines.length) {
    return json({ ok: false, reason: 'unparsed' });
  }

  return json({
    ok: true,
    ...validated,
  });
}
