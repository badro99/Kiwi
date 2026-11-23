import { budgetRoute } from './_budget-route.js';
import { VISION_PRIMARY as MODEL, VISION_FALLBACK as FALLBACK_MODEL } from './_models.js';
export { MODEL, FALLBACK_MODEL };
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

Étiquette de carton, de colis ou liste de colisage avec un assortiment de tailles ou de pointures (ART NO., COLOUR, SIZE 36 37 38 avec une quantité sous chaque taille, QTY 12 PRS) : docType "boutique_product". sizeRun porte UNE entrée par taille avec sa quantité, dans l'ordre imprimé ; reference le numéro d'article, color la couleur, packQty la quantité totale imprimée. L'assortiment va dans sizeRun, jamais dans notes ni dans items. Aucun prix n'est imprimé : n'en invente pas. Si l'étiquette n'imprime qu'une plage de tailles sans quantité sous chaque taille (SIZE: 36-41, 12 PRS), sizeRun contient UNE seule entrée, la plage telle qu'imprimée avec la quantité totale ({ \"size\": \"36-41\", \"qty\": 12 }) : n'invente jamais une répartition par taille. « SIZE: ASSORTED » sans liste de tailles : sizeRun reste vide.

totalMad est le montant TTC à payer (taxes comprises), jamais le total HT ; taxMad est la TVA.

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
    "reference": "Numéro d'article d'une étiquette de carton (ex: 1986-10)",
    "color": "Couleur imprimée sur l'étiquette",
    "packQty": 12,
    "sizeRun": [
      { "size": "36", "qty": 1 }
    ],
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

/* Une facture fournisseur va au stock ET aux dépenses, un ticket aux dépenses
 * (propriétaire, 23 nov. 2026 : le modèle ne proposait que le stock, et « add to
 * expenses » tapé ensuite tombait sur une réponse générale sur les charges). Ces
 * actions passent devant celles du modèle, dans la langue de l'écran. */
const DOC_ACTIONS = { invoice: ['stock-receive', 'expense-add'], expense_receipt: ['expense-add'] };
const DOC_ACTION_LABEL = {
  fr: { 'stock-receive': 'Ajouter les articles au stock', 'expense-add': 'Ajouter aux dépenses' },
  en: { 'stock-receive': 'Add the items to stock', 'expense-add': 'Add to expenses' },
  ar: { 'stock-receive': 'أضف السلع إلى المخزون', 'expense-add': 'أضف إلى المصاريف' },
};
function withDocActions(docType, actions, locale) {
  const need = DOC_ACTIONS[docType];
  if (!need) return actions;
  const words = DOC_ACTION_LABEL[locale] || DOC_ACTION_LABEL.fr;
  const first = need.map((type, i) => actions.find((a) => a.type === type)
    || { id: 'doc-' + type, type, label: words[type], primary: i === 0 && !actions.some((a) => a.primary) });
  return first.concat(actions.filter((a) => !need.includes(a.type))).slice(0, 4);
}

export function validateVisionData(raw, locale = 'fr') {
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
  /* L'assortiment d'une étiquette de carton : une entrée par taille, des unités
   * entières. Une entrée illisible n'est ni devinée ni arrondie, et une somme
   * qui ne tombe pas sur la quantité imprimée rend toute la lecture « à
   * vérifier » : ce sont des pièces qui entreraient en stock. */
  const rawRun = Array.isArray(entities.sizeRun) ? entities.sizeRun : [];
  const sizeRun = [];
  for (const row of rawRun.slice(0, 40)) {
    const size = String(row?.size ?? '').trim().slice(0, 12);
    const qty = ['number', 'string'].includes(typeof row?.qty) && String(row.qty).trim() !== '' ? Number(row.qty) : NaN;
    if (!size || !Number.isSafeInteger(qty) || qty < 0 || qty > 100000 || sizeRun.some(r => r.size === size)) issues.push('invalid-size-run');
    else sizeRun.push({ size, qty });
  }
  const rawPack = entities.packQty == null || entities.packQty === '' ? null : Number(entities.packQty);
  const packQty = Number.isSafeInteger(rawPack) && rawPack > 0 ? rawPack : null;
  if (rawRun.length > 40 || (rawPack != null && rawPack !== 0 && packQty == null)) issues.push('invalid-size-run');
  if (sizeRun.length && packQty != null && sizeRun.reduce((sum, r) => sum + r.qty, 0) !== packQty) issues.push('size-run-mismatch');
  const clipped = (value, limit) => String(value || '').length > limit;
  if (clipped(raw.title, 140) || clipped(raw.summary, 1000) || clipped(raw.categoryLabel, 80)
    || clipped(entities.supplier, 120) || clipped(entities.date, 20) || clipped(entities.invoiceNumber, 60)
    || clipped(entities.category, 40) || clipped(entities.paymentMethod, 30) || clipped(entities.notes, 300)
    || clipped(entities.reference, 60) || clipped(entities.color, 40)
    || (Array.isArray(entities.items) && entities.items.some(it => clipped(it?.name, 120) || clipped(it?.category, 60)))
    || (raw.suggestedActions || []).length > 4
    || (Array.isArray(raw.suggestedActions) && raw.suggestedActions.some(act => clipped(act?.id, 40) || clipped(act?.type, 40) || clipped(act?.label, 80)))) issues.push('truncated-fields');
  if (Array.isArray(entities.items) && items.length !== entities.items.length) issues.push('unreadable-lines');
  let totalTtc = totalMad;
  if (['invoice', 'expense_receipt'].includes(safeDocType) && items.length && entities.totalMad != null) {
    const sum = Math.round(items.reduce((n, it) => n + it.total, 0) * 100);
    const total = Math.round(totalMad * 100);
    if (Math.abs(sum - total) > 1 && Math.abs(sum + Math.round(taxMad * 100) - total) > 1) issues.push('total-mismatch');
    /* Le total HT (= les lignes) rendu comme total, avec une TVA lue : ce qui est dû est le TTC. */
    else if (Math.abs(sum - total) <= 1 && taxMad > 0) totalTtc = Math.round((totalMad + taxMad) * 100) / 100;
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
      totalMad: totalTtc,
      taxMad,
      category: String(entities.category || 'divers').slice(0, 40),
      paymentMethod: String(entities.paymentMethod || 'non_specifie').slice(0, 30),
      items,
      tpeTotal,
      tpeCount,
      tablesCount,
      reference: String(entities.reference || '').trim().slice(0, 60),
      color: String(entities.color || '').trim().slice(0, 40),
      packQty,
      sizeRun,
      notes: String(entities.notes || '').slice(0, 300),
    },
    suggestedActions: issues.length ? [] : withDocActions(safeDocType, suggestedActions, locale),
  };
}

/* Ce que le modèle a répondu, lu honnêtement. Un JSON lisible passe par le
 * validateur ; une réponse illisible (texte libre, JSON cassé, rien du tout)
 * n'est PAS un document « traité avec succès » : elle revient marquée
 * « à vérifier », sans confiance inventée (null, jamais 0,8) et sans aucune
 * action 1-clic, pour que l'écran ne dise jamais « fait » sur une lecture ratée. */
export function interpretVisionOutput(content, locale = 'fr') {
  const text = typeof content === 'string' ? content : '';
  let parsed = null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch (_) {}
  const validated = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? validateVisionData(parsed, locale) : null;
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
  return { model, ...interpretVisionOutput(aiText(result), locale) };
}

async function budgetHandler(context) {
  const { request, env } = context;
  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ ok: false, error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant, { strict: true });
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  // The input is checked first: a request that cannot be inspected spends no allowance.
  const image = b?.image;
  if (!image || typeof image !== 'string') return json({ ok: false, error: 'missing-image' }, 400);
  if (image.length > MAX_IMAGE_DATAURL) return json({ ok: false, error: 'image-too-large' }, 413);

  if (!(await quotaOk(env, who, 'visioninspect', DAILY_CAP, { models: [MODEL, FALLBACK_MODEL], maxTokens: Math.max(MAX_TOKENS) }))) {
    return json(quotaBody('visioninspect'), 429);
  }

  try {
    const { data, model, status } = await inspectImage(env, image, b?.prompt, String(b?.locale || 'fr').slice(0, 2));
    return json({ ok: true, status, data, model }, 200, {
      'x-kiwi-ai-model': model,
    });
  } catch (err) {
    /* La raison part aussi au journal de la fonction : le 21 nov. 2026 deux photos
     * ont répondu 502 et rien ne disait pourquoi. Jamais l'image, jamais le prompt. */
    console.warn('[vision-inspect] model-failed', who, String(err?.message || err).slice(0, 300));
    return json({ ok: false, error: 'model-failed', message: err?.message || 'Inference error' }, 502);
  }
}

export const onRequestPost = budgetRoute(budgetHandler, 'visioninspect');
