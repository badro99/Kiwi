// /api/ai/expense-ocr — OCR et extraction de bons de caisse et reçus de dépenses.
//
// Reçoit une image de reçu manuscrit, ticket de caisse ou bon de dépenses (marché, taxi, réparation),
// extrait les montants et catégories de dépenses pour alimenter directement depenses.js.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const VISION_MODEL = '@cf/zai-org/glm-5.3-flash';
export const VISION_FALLBACK_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.1;
const TOP_P = 0.9;
const DAILY_CAP = 200;
const MAX_IMAGE_DATAURL = 2_600_000;

const SYSTEM_PROMPT = `Tu es un assistant comptable pour commerces et restaurants au Maroc.
Analyse la photo du reçu, bon de caisse ou ticket de dépense, et extrais les informations au format JSON strict :
{
  "supplier": "Nom du fournisseur ou bénéficiaire",
  "date": "AAAA-MM-JJ si identifiable",
  "amount": 250.0,
  "category": "marche | fournitures | entretien | transport | alimentation | loyer | salaires | divers",
  "items": ["Tomates 5kg", "Menthe 2 bottes"],
  "notes": "Précisions utiles ou mention manuscrite",
  "ice": "ICE si présent"
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte superflu.
- amount doit être un nombre décimal positif en MAD.
- Choisis la catégorie la plus pertinente parmi la liste proposée.`;

async function runExpenseVision(env, dataUrl) {
  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: 'Voici la photo du reçu ou bon de dépense. Extrais le montant et les informations.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ] },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE, top_p: TOP_P,
  };
  try { return { result: await runAiWithGateway(env, VISION_MODEL, payload), model: VISION_MODEL }; }
  catch (_) { return { result: await runAiWithGateway(env, VISION_FALLBACK_MODEL, payload), model: VISION_FALLBACK_MODEL }; }
}

export function validateExpenseData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const amount = Math.max(0, Math.round((Number(raw.amount) || 0) * 100) / 100);
  const allowedCats = new Set(['marche', 'fournitures', 'entretien', 'transport', 'alimentation', 'loyer', 'salaires', 'divers']);
  let cat = String(raw.category || 'divers').toLowerCase().trim();
  if (!allowedCats.has(cat)) cat = 'divers';

  const items = Array.isArray(raw.items)
    ? raw.items.map((it) => String(it || '').slice(0, 100).trim()).filter(Boolean).slice(0, 30)
    : [];

  return {
    supplier: String(raw.supplier || '').slice(0, 100).trim(),
    date: String(raw.date || '').slice(0, 20).trim(),
    amount,
    category: cat,
    items,
    notes: String(raw.notes || '').slice(0, 200).trim(),
    ice: String(raw.ice || '').slice(0, 30).trim(),
    currency: 'MAD',
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'expense', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const image = typeof b?.image === 'string' ? b.image.trim() : '';
  if (!image.startsWith('data:image/')) return json({ error: 'image-required' }, 400);
  if (image.length > MAX_IMAGE_DATAURL) return json({ error: 'image-too-large' }, 413);

  let runRes;
  try {
    runRes = await runExpenseVision(env, image);
  } catch (err) {
    return json({ error: 'ai-vision-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateExpenseData(parsed);
  if (!clean || !clean.amount) {
    return json({ error: 'unreadable-receipt', raw: rawText.slice(0, 300) }, 422);
  }

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
