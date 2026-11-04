import { budgetRoute } from './_budget-route.js';
import { GLM_FLASH as MODEL, GLM_FLASH as VISION_MODEL, GEMMA_VISION as VISION_FALLBACK_MODEL, QWEN as FALLBACK_MODEL } from './_models.js';
export { MODEL, VISION_MODEL, VISION_FALLBACK_MODEL, FALLBACK_MODEL };
// /api/ai/product-scan — Ingestion d'articles sans code-barres depuis une photo.
//
// Analyse une photo d'article (vêtement, caftan, maroquinerie, poterie, artisanat),
// extrait le nom commercial, catégorie, matière, couleur, tailles suggérées et prix indicatif pour boutique-catalog.js.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk, quotaBody, DAILY_CAPS } from './_quota.js';
import { runVisionPair } from './_vision.js';
import { GATEWAY_OPTS, aiText, runAiWithGateway } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };


const MAX_TOKENS = 1400;
const TEMPERATURE = 0.2;
const DAILY_CAP = DAILY_CAPS.product;
const MAX_IMAGE_DATAURL = 2_600_000;

const SYSTEM_PROMPT = `Tu es un expert en merchandising et gestion de catalogue pour boutiques et commerces de détail au Maroc.
Analyse la photo de l'article et génère sa fiche produit au format JSON strict :
{
  "name": "Nom commercial clair de l'article",
  "category": "vetements | maroquinerie | chaussures | artisanat | accessoires | cosmetique | epicerie_fine",
  "color": "Couleur dominante",
  "material": "Matière ou tissu (ex: Coton, Soie, Cuir, Céramique)",
  "suggestedPriceMad": 350.0,
  "variants": [
    { "size": "TU | S | M | L | XL", "color": "Couleur", "stock": 1 }
  ],
  "description": "Description courte et vendeuse en 1 phrase",
  "tags": ["caftan", "artisanal", "broderie"]
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- suggestedPriceMad est un montant réaliste en Dirhams Marocains (MAD).
- Si l'article est à taille unique (sac, objet, bijou), mets "TU" en taille.`;

export function validateProductData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const suggestedPriceMad = Math.max(0, Math.round((Number(raw.suggestedPriceMad) || 0) * 100) / 100);
  const variants = Array.isArray(raw.variants)
    ? raw.variants.map((v) => ({
      size: String(v.size || 'TU').slice(0, 20).trim(),
      color: String(v.color || raw.color || '').slice(0, 30).trim(),
      stock: Math.max(0, Math.round(Number(v.stock) || 1)),
    })).slice(0, 20)
    : [{ size: 'TU', color: String(raw.color || ''), stock: 1 }];

  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => String(t || '').slice(0, 30).trim()).filter(Boolean).slice(0, 10)
    : [];

  return {
    name: String(raw.name || 'Nouvel article').slice(0, 100).trim(),
    category: String(raw.category || 'vetements').slice(0, 40).trim(),
    color: String(raw.color || '').slice(0, 40).trim(),
    material: String(raw.material || '').slice(0, 60).trim(),
    suggestedPriceMad,
    variants,
    description: String(raw.description || '').slice(0, 300).trim(),
    tags,
  };
}

async function budgetHandler(context) {
  const { request, env } = context;

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'product', DAILY_CAP, { models: [MODEL, FALLBACK_MODEL, VISION_MODEL, VISION_FALLBACK_MODEL], maxTokens: Math.max(MAX_TOKENS) });
  if (!allowed) return json(quotaBody('product', 'daily-quota-exceeded'), 429);

  const image = typeof b?.image === 'string' ? b.image.trim() : '';
  if (!image.startsWith('data:image/')) return json({ error: 'image-required' }, 400);
  if (image.length > MAX_IMAGE_DATAURL) return json({ error: 'image-too-large' }, 413);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: 'Analyse la photo de cet article et génère les informations produit.' },
        { type: 'image_url', image_url: { url: image } },
      ] },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE, reasoning_effort: 'low',
  };

  let runRes;
  try {
    runRes = await runVisionPair(env, VISION_MODEL, VISION_FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-product-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = aiText(runRes?.result);
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateProductData(parsed);
  if (!clean || !clean.name) return json({ error: 'unparseable-product', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}

export const onRequestPost = budgetRoute(budgetHandler, 'product', 'daily-quota-exceeded');
