// /api/ai/vision-inspect — Inspection visuelle et classification universelle de photos & documents.
//
// Reçoit une image (photo de facture, ticket de caisse, menu, plan de salle, ticket TPE,
// produit boutique, vêtement pressing, document d'entreprise), détecte automatiquement
// la nature du document et extrait les données métier avec actions 1-clic directes.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk, DAILY_CAPS } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

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

3. Rédiger une explication claire et bienveillante en français (ou arabe si le texte est en arabe), avec un résumé des montants et des détails clés.

4. Proposer les ACTIONS 1-CLIC les plus adaptées pour le commerçant.

Réponds UNIQUEMENT avec un objet JSON valide structuré exactement ainsi :
{
  "docType": "invoice | expense_receipt | restaurant_menu | floorplan | tpe_slip | boutique_product | pressing_garment | general_document",
  "categoryLabel": "Nom lisible du type (ex: Facture fournisseur)",
  "title": "Titre court descriptif (ex: Facture Centrale Danone · 1 450 MAD)",
  "confidence": 0.95,
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

async function runVisionInspect(env, dataUrl, promptText) {
  const userContent = [
    { type: 'text', text: promptText && promptText.trim() ? promptText.trim() : "Analyse cette photo ou ce document et dis-moi directement ce qu'il faut faire." },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    top_p: TOP_P,
  };

  try {
    const res = await runAiWithGateway(env, MODEL, payload);
    return { result: res, model: MODEL };
  } catch (_) {
    const res = await runAiWithGateway(env, FALLBACK_MODEL, payload);
    return { result: res, model: FALLBACK_MODEL };
  }
}

export function validateVisionData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const docType = String(raw.docType || 'general_document').toLowerCase().trim();
  const validTypes = new Set(['invoice', 'expense_receipt', 'restaurant_menu', 'floorplan', 'tpe_slip', 'boutique_product', 'pressing_garment', 'general_document']);
  const safeDocType = validTypes.has(docType) ? docType : 'general_document';

  const title = String(raw.title || 'Document analysé').slice(0, 140);
  const summary = String(raw.summary || '').slice(0, 1000);
  const categoryLabel = String(raw.categoryLabel || 'Document').slice(0, 80);
  const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0.9));

  const entities = typeof raw.entities === 'object' && raw.entities ? raw.entities : {};
  const totalMad = Math.max(0, Math.round((Number(entities.totalMad) || 0) * 100) / 100);

  const items = Array.isArray(entities.items)
    ? entities.items.slice(0, 60).map(it => ({
        name: String(it?.name || '').slice(0, 120),
        qty: Math.max(0, Number(it?.qty) || 1),
        unitPrice: Math.max(0, Math.round((Number(it?.unitPrice) || 0) * 100) / 100),
        total: Math.max(0, Math.round((Number(it?.total) || 0) * 100) / 100),
        category: String(it?.category || '').slice(0, 60),
      })).filter(it => it.name.length > 0)
    : [];

  const suggestedActions = Array.isArray(raw.suggestedActions)
    ? raw.suggestedActions.slice(0, 4).map((act, idx) => ({
        id: String(act?.id || `act-${idx}`).slice(0, 40),
        type: String(act?.type || 'generic-action').slice(0, 40),
        label: String(act?.label || 'Exécuter').slice(0, 80),
        primary: !!act?.primary,
      }))
    : [];

  return {
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
      taxMad: Math.max(0, Math.round((Number(entities.taxMad) || 0) * 100) / 100),
      category: String(entities.category || 'divers').slice(0, 40),
      paymentMethod: String(entities.paymentMethod || 'non_specifie').slice(0, 30),
      items,
      tpeTotal: Math.max(0, Number(entities.tpeTotal) || 0),
      tpeCount: Math.max(0, Math.round(Number(entities.tpeCount) || 0)),
      tablesCount: Math.max(0, Math.round(Number(entities.tablesCount) || 0)),
      notes: String(entities.notes || '').slice(0, 300),
    },
    suggestedActions,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ ok: false, error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  if (!(await quotaOk(env, who, 'visioninspect', DAILY_CAP))) {
    return json({ ok: false, error: 'quota' }, 429);
  }

  const image = b?.image;
  if (!image || typeof image !== 'string') return json({ ok: false, error: 'missing-image' }, 400);
  if (image.length > MAX_IMAGE_DATAURL) return json({ ok: false, error: 'image-too-large' }, 413);

  try {
    const { result, model } = await runVisionInspect(env, image, b?.prompt);
    const content = result?.response || result?.choices?.[0]?.message?.content || (typeof result === 'string' ? result : '');

    let parsed = null;
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (_) {}

    const validated = validateVisionData(parsed) || {
      docType: 'general_document',
      categoryLabel: 'Document analysé',
      title: 'Analyse visuelle',
      confidence: 0.8,
      summary: content ? String(content).slice(0, 800) : 'Document traité avec succès.',
      entities: { totalMad: 0, items: [] },
      suggestedActions: [],
    };

    return json({ ok: true, data: validated, model }, 200, {
      'x-kiwi-ai-model': model,
    });
  } catch (err) {
    return json({ ok: false, error: 'model-failed', message: err?.message || 'Inference error' }, 502);
  }
}
