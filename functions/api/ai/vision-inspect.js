// /api/ai/vision-inspect — Inspection visuelle et classification universelle de photos & documents.
//
// Reçoit une image (photo de facture, ticket de caisse, menu, plan de salle, ticket TPE,
// produit boutique, vêtement pressing, document d'entreprise), détecte automatiquement
// la nature du document et extrait les données métier avec actions 1-clic directes.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk, quotaBody, DAILY_CAPS } from './_quota.js';
import { GATEWAY_OPTS, aiText, runAiWithGateway } from './_run.js';
import { runVisionPair } from './_vision.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/google/gemma-4-26b-a4b-it';

const MAX_TOKENS = 1800;
const TEMPERATURE = 0.1;
const TOP_P = 0.9;
const DAILY_CAP = DAILY_CAPS.visioninspect || 150;
const MAX_IMAGE_DATAURL = 3_500_000;

const SYSTEM_PROMPT = `Tu es le copilote d'intelligence opérationnelle pour commerçants, restaurants, boutiques et pressings au Maroc (Kiwi OS).
L'utilisateur te fournit une photo ou un scan de document sans forcément préciser ce que c'est.

Ta mission :
1. Identifier avec précision le TYPE DE DOCUMENT parmi :
   - "invoice" : Facture fournisseur avec lignes d'articles, TVA, fournisseur, total
   - "expense_receipt" : Reçu de caisse, ticket de caisse, bon d'achat marché, dépense du jour
   - "restaurant_menu" : Menu, carte de restaurant, ardoise de plats, liste de boissons et prix
   - "floorplan" : Plan de salle, disposition des tables de restaurant / café
   - "tpe_slip" : Ticket de télécollecte TPE bancaire (CMI, carte bancaire)
   - "boutique_product" : Photo d'article ou vêtement pour catalogue boutique
   - "pressing_garment" : Vêtement de pressing avec étiquette d'entretien ou défaut
   - "general_document" : Autre document d'entreprise, contrat, planning, etc.

2. Extraire toutes les données structurées pertinentes en Dirhams marocains (MAD).

3. Rédiger une explication claire et bienveillante dans la langue UI sélectionnée, indépendamment de la langue du document, avec un résumé des montants et des détails clés.

Signale incomplete:true si une page, ligne ou portion est illisible, omise ou coupée. Ne limite jamais les lignes extraites.

4. Proposer les ACTIONS 1-CLIC les plus adaptées pour le commerçant.

Réponds UNIQUEMENT avec un objet JSON valide structuré exactement ainsi :
{
  "docType": "invoice | expense_receipt | restaurant_menu | floorplan | tpe_slip | boutique_product | pressing_garment | general_document",
  "categoryLabel": "Nom lisible du type (ex: Facture fournisseur)",
  "title": "Titre court descriptif (ex: Facture Centrale Danone · 1 450 MAD)",
  "confidence": 0.95,
  "incomplete": false,
  "summary": "Explication claire en 2-4 phrases de ce qui a été détecté et calculé.",
  "entities": {
    "supplier": "Nom du fournisseur ou bénéficiaire",
    "date": "AAAA-MM-JJ si visible",
    "invoiceNumber": "Numéro de pièce",
    "totalMad": 1450.0,
    "taxMad": 290.0,
    "category": "alimentation | marche | fournitures | entretien | transport | loyer | salaires | divers",
    "paymentMethod": "especes | virement | cheque | carte | non_specifie",
    "items": [
      { "name": "Nom article", "qty": 10, "unitPrice": 15.0, "total": 150.0, "category": "Boissons" }
    ],
    "tpeTotal": 0.0,
    "tpeCount": 0,
    "tablesCount": 0,
    "notes": "Mentions utiles"
  },
  "suggestedActions": [
    {
      "id": "action-1",
      "type": "stock-receive | expense-add | menu-import | floorplan-apply | tpe-reconcile | product-add | generic-action",
      "label": "Libellé du bouton d'action (ex: Enregistrer la réception en stock)",
      "primary": true
    }
  ]
}`;

async function runVisionInspect(env, dataUrl, promptText, locale) {
  const userContent = [
    { type: 'text', text: promptText && promptText.trim() ? promptText.trim() : "Analyse cette photo ou ce document et dis-moi directement ce qu'il faut faire." },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + '\nSelected UI language: ' + ({ en: 'English', ar: 'Arabic', fr: 'French' }[locale] || 'French') + '. Write categoryLabel, title, summary, notes and action labels only in this language. Preserve original proper names.' },
      { role: 'user', content: userContent },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    top_p: TOP_P,
    reasoning_effort: 'low',
  };

  return runVisionPair(env, MODEL, FALLBACK_MODEL, payload);
}

export function validateVisionData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const docType = String(raw.docType || 'general_document').toLowerCase().trim();
  const validTypes = new Set(['invoice', 'expense_receipt', 'restaurant_menu', 'floorplan', 'tpe_slip', 'boutique_product', 'pressing_garment', 'general_document']);
  const safeDocType = validTypes.has(docType) ? docType : 'general_document';

  const title = String(raw.title || '').slice(0, 140);
  const summary = String(raw.summary || '').slice(0, 1000);
  const categoryLabel = String(raw.categoryLabel || 'Document').slice(0, 80);
  /* Une confiance de 0 est une réponse (« je ne suis pas sûr du tout »), pas une
   * valeur absente. Une valeur manquante ou non numérique est INCONNUE : null, et
   * l'écran n'affiche alors aucune fiabilité. Jamais de chiffre inventé. */
  const rawConfidence = typeof raw.confidence === 'string' && raw.confidence.trim() === '' ? NaN : Number(raw.confidence);
  const confidence = raw.confidence == null || typeof raw.confidence === 'boolean' || !Number.isFinite(rawConfidence)
    ? null : Math.min(1, Math.max(0, rawConfidence));

  const entities = typeof raw.entities === 'object' && raw.entities ? raw.entities : {};
  const issues = [];
  function number(value, fallback = 0, money = false) {
    if (value == null) return fallback;
    const n = !['number', 'string'].includes(typeof value) || String(value).trim() === '' ? NaN : Number(value);
    if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER / 100) {
      issues.push('invalid-number'); return fallback;
    }
    return money ? Math.round(n * 100) / 100 : n;
  }
  const totalMad = number(entities.totalMad, 0, true);

  const items = Array.isArray(entities.items)
    ? entities.items.map(it => ({
        name: String(it?.name || '').slice(0, 120),
        qty: number(it?.qty, 1),
        unitPrice: number(it?.unitPrice, 0, true),
        total: number(it?.total, 0, true),
        category: String(it?.category || '').slice(0, 60),
      })).filter(it => it.name.length > 0)
    : [];

  const suggestedActions = Array.isArray(raw.suggestedActions)
    ? raw.suggestedActions.slice(0, 4).map((act, idx) => ({
        id: String(act?.id || `act-${idx}`).slice(0, 40),
        type: String(act?.type || 'generic-action').slice(0, 40),
        label: String(act?.label || '').slice(0, 80),
        primary: !!act?.primary,
      }))
    : [];

  const taxMad = number(entities.taxMad, 0, true);
  const tpeTotal = number(entities.tpeTotal, 0, true);
  const tpeCount = Math.round(number(entities.tpeCount));
  const tablesCount = Math.round(number(entities.tablesCount));
  if (raw.incomplete || raw.reviewNeeded) issues.push('incomplete');
  const clipped = (value, limit) => String(value || '').length > limit;
  if (clipped(raw.title, 140) || clipped(raw.summary, 1000) || clipped(raw.categoryLabel, 80)
    || clipped(entities.supplier, 120) || clipped(entities.date, 20) || clipped(entities.invoiceNumber, 60)
    || clipped(entities.category, 40) || clipped(entities.paymentMethod, 30) || clipped(entities.notes, 300)
    || (Array.isArray(entities.items) && entities.items.some(it => clipped(it?.name, 120) || clipped(it?.category, 60)))
    || (raw.suggestedActions || []).length > 4
    || (Array.isArray(raw.suggestedActions) && raw.suggestedActions.some(act => clipped(act?.id, 40) || clipped(act?.type, 40) || clipped(act?.label, 80)))) issues.push('truncated-fields');
  if (Array.isArray(entities.items) && items.length !== entities.items.length) issues.push('unreadable-lines');
  if (['invoice', 'expense_receipt'].includes(safeDocType) && items.length && entities.totalMad != null) {
    const sum = Math.round(items.reduce((n, it) => n + it.total, 0) * 100);
    const total = Math.round(totalMad * 100);
    if (Math.abs(sum - total) > 1 && Math.abs(sum + Math.round(taxMad * 100) - total) > 1) issues.push('total-mismatch');
  }
  return {
    ...(issues.length ? { reviewNeeded: true } : {}),
    reviewReasons: [...new Set(issues)],
    docType: safeDocType,
    categoryLabel,
    title,
    confidence,
    summary,
    entities: {
      supplier: String(entities.supplier || '').slice(0, 120),
      date: String(entities.date || '').slice(0, 20),
      invoiceNumber: String(entities.invoiceNumber || '').slice(0, 60),
      totalMad,
      taxMad,
      category: String(entities.category || 'divers').slice(0, 40),
      paymentMethod: String(entities.paymentMethod || 'non_specifie').slice(0, 30),
      items,
      tpeTotal,
      tpeCount,
      tablesCount,
      notes: String(entities.notes || '').slice(0, 300),
    },
    suggestedActions: issues.length ? [] : suggestedActions,
  };
}

/* Ce que le modèle a répondu, lu honnêtement. Un JSON lisible passe par le
 * validateur ; une réponse illisible (texte libre, JSON cassé, rien du tout)
 * n'est PAS un document « traité avec succès » : elle revient marquée
 * « à vérifier », sans confiance inventée (null, jamais 0,8) et sans aucune
 * action 1-clic, pour que l'écran ne dise jamais « fait » sur une lecture ratée. */
export function interpretVisionOutput(content) {
  const text = typeof content === 'string' ? content : '';
  let parsed = null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch (_) {}
  const validated = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? validateVisionData(parsed) : null;
  if (validated) return { status: validated.reviewNeeded ? 'review-needed' : 'parsed', data: validated };
  return {
    status: 'review-needed',
    data: {
      reviewNeeded: true,
      docType: 'general_document',
      categoryLabel: '',
      title: '',
      confidence: null,
      summary: text.trim().slice(0, 800),
      entities: { totalMad: 0, items: [] },
      suggestedActions: [],
    },
  };
}

/* Un passage complet : le duo vision, puis la lecture ci-dessus. Exporté pour
 * les tests, qui simulent env.AI (aucun modèle réel n'est appelé). */
export async function inspectImage(env, dataUrl, promptText, locale) {
  const { result, model } = await runVisionInspect(env, dataUrl, promptText, locale);
  return { model, ...interpretVisionOutput(aiText(result)) };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ ok: false, error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  if (!(await quotaOk(env, who, 'visioninspect', DAILY_CAP))) {
    return json(quotaBody('visioninspect'), 429);
  }

  const image = b?.image;
  if (!image || typeof image !== 'string') return json({ ok: false, error: 'missing-image' }, 400);
  if (image.length > MAX_IMAGE_DATAURL) return json({ ok: false, error: 'image-too-large' }, 413);

  try {
    const { data, model, status } = await inspectImage(env, image, b?.prompt, String(b?.locale || 'fr').slice(0, 2));
    return json({ ok: true, status, data, model }, 200, {
      'x-kiwi-ai-model': model,
    });
  } catch (err) {
    return json({ ok: false, error: 'model-failed', message: err?.message || 'Inference error' }, 502);
  }
}
