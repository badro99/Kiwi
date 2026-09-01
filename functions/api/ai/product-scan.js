// /api/ai/product-scan — Ingestion d'articles sans code-barres depuis une photo.
//
// Analyse une photo d'article (vêtement, caftan, maroquinerie, poterie, artisanat),
// extrait le nom commercial, catégorie, matière, couleur, tailles suggérées et prix indicatif pour boutique-catalog.js.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const VISION_MODEL = '@cf/zai-org/glm-5.3-flash';
export const VISION_FALLBACK_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

const MAX_TOKENS = 1400;
const TEMPERATURE = 0.2;
const DAILY_CAP = 150;
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

export async function onRequestPost(context) {
  const { request, env } = context;

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'product', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

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
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, VISION_MODEL, VISION_FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-product-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateProductData(parsed);
  if (!clean || !clean.name) return json({ error: 'unparseable-product', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
