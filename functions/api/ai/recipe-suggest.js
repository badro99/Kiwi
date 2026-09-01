// /api/ai/recipe-suggest — Génération et estimation de fiches techniques de recettes par IA.
//
// Reçoit une photo de plat ou un intitulé/description culinaire,
// génère les ingrédients, grammages, et coûts théoriques pour Kiwi Fiches Recettes.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const VISION_MODEL = '@cf/zai-org/glm-5.3-flash';
export const VISION_FALLBACK_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

const MAX_TOKENS = 1600;
const TEMPERATURE = 0.2;
const DAILY_CAP = 100;
const MAX_IMAGE_DATAURL = 2_600_000;

const SYSTEM_PROMPT = `Tu es un chef exécutif et expert en food-cost pour restaurants et cafés au Maroc.
À partir du plat soumis, génère une fiche technique détaillée au format JSON strict :
{
  "name": "Nom du plat",
  "category": "entree | plat | dessert | boisson | cafe | snack",
  "portion": 1,
  "prepTimeMin": 15,
  "targetMarginPct": 70,
  "ingredients": [
    { "name": "Nom ingrédient", "qty": 150, "unit": "g | ml | cl | piece | portion", "estimatedUnitCostMad": 0.08, "costMad": 12.0 }
  ],
  "estimatedFoodCostMad": 25.0,
  "suggestedPriceMad": 85.0
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Les ingrédients doivent avoir des unités culinaires claires (g, ml, cl, piece).
- Les prix et coûts sont en Dirhams Marocains (MAD).`;

export function validateRecipeData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map((ing) => ({
      name: String(ing.name || 'Ingrédient').slice(0, 80).trim(),
      qty: Math.max(0.01, Math.round((Number(ing.qty) || 1) * 100) / 100),
      unit: String(ing.unit || 'g').slice(0, 20).trim(),
      costMad: Math.max(0, Math.round((Number(ing.costMad || 0)) * 100) / 100),
    })).slice(0, 40)
    : [];

  const estimatedFoodCostMad = Math.max(0, Math.round((Number(raw.estimatedFoodCostMad) || ingredients.reduce((sum, i) => sum + i.costMad, 0)) * 100) / 100);
  const suggestedPriceMad = Math.max(0, Math.round((Number(raw.suggestedPriceMad) || (estimatedFoodCostMad * 3.3)) * 100) / 100);

  return {
    name: String(raw.name || 'Plat').slice(0, 100).trim(),
    category: String(raw.category || 'plat').slice(0, 40).trim(),
    portion: Math.max(1, Math.round(Number(raw.portion) || 1)),
    prepTimeMin: Math.max(1, Math.round(Number(raw.prepTimeMin) || 15)),
    targetMarginPct: Math.max(10, Math.min(95, Math.round(Number(raw.targetMarginPct) || 70))),
    ingredients,
    estimatedFoodCostMad,
    suggestedPriceMad,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'recipe', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const image = typeof b?.image === 'string' ? b.image.trim() : '';
  const text = typeof b?.text === 'string' ? b.text.trim().slice(0, 500) : '';

  if (!image && !text) return json({ error: 'image-or-text-required' }, 400);

  let runRes;
  try {
    if (image) {
      if (image.length > MAX_IMAGE_DATAURL) return json({ error: 'image-too-large' }, 413);
      const payload = {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: text ? `Plat : ${text}. Analyse la photo et génère la fiche technique.` : 'Analyse la photo de ce plat et génère la fiche technique.' },
            { type: 'image_url', image_url: { url: image } },
          ] },
        ],
        max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
      };
      runRes = await runWithFallback(env, VISION_MODEL, VISION_FALLBACK_MODEL, payload);
    } else {
      const payload = {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Génère la fiche technique pour ce plat : ${text}` },
        ],
        max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
      };
      runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
    }
  } catch (err) {
    return json({ error: 'ai-recipe-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateRecipeData(parsed);
  if (!clean || !clean.ingredients.length) {
    return json({ error: 'unparseable-recipe', raw: rawText.slice(0, 300) }, 422);
  }

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
