// /api/ai/product-enhance — Studio photo et rédaction marketing d'articles pour boutique.
//
// Analyse la photo d'un produit (caftan, sac cuir, poterie, bijou),
// génère un titre valorisant, une description e-commerce haut de gamme en français et darija, et un post Instagram/WhatsApp prêt à poster.

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
const TEMPERATURE = 0.3;
const DAILY_CAP = 100;
const MAX_IMAGE_DATAURL = 2_600_000;

const SYSTEM_PROMPT = `Tu es un directeur artistique et copywriter pour boutiques de mode et artisanat d'art au Maroc.
Analyse la photo de l'article et rédige son contenu de vente au format JSON strict :
{
  "title": "Titre élégant du produit",
  "pitchFr": "Description fluide et vendeuse en 2 phrases",
  "pitchDarija": "Description chaleureuse en darija marocaine",
  "keyFeatures": [
    "Broderie traditionnelle fil de soie (Sfifa)", "Tissu velours de soie doux au toucher"
  ],
  "instagramPost": "✨ Nouvelle création : [Titre]... Disponible en boutique et livraison partout au Maroc 🇲🇦 📲 WhatsApp en bio.",
  "hashtags": ["#CaftanMarocain", "#ModeMarocaine", "#ArtisanatDuMaroc"]
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Vocabulaire valorisant, adapté au luxe ou à l'artisanat marocain.`;

export function validateProductEnhanceData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const keyFeatures = Array.isArray(raw.keyFeatures)
    ? raw.keyFeatures.map((f) => String(f || '').slice(0, 100).trim()).filter(Boolean).slice(0, 8)
    : [];

  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags.map((h) => String(h || '').slice(0, 40).trim()).filter(Boolean).slice(0, 15)
    : [];

  return {
    title: String(raw.title || 'Nouvelle création').slice(0, 100).trim(),
    pitchFr: String(raw.pitchFr || '').slice(0, 300).trim(),
    pitchDarija: String(raw.pitchDarija || '').slice(0, 300).trim(),
    keyFeatures,
    instagramPost: String(raw.instagramPost || '').slice(0, 500).trim(),
    hashtags,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'productenhance', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const image = typeof b?.image === 'string' ? b.image.trim() : '';
  const productName = typeof b?.name === 'string' ? b.name.trim() : '';

  if (!image && !productName) return json({ error: 'image-or-name-required' }, 400);

  let runRes;
  try {
    if (image) {
      if (image.length > MAX_IMAGE_DATAURL) return json({ error: 'image-too-large' }, 413);
      const payload = {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: productName ? `Article : ${productName}. Rédige la fiche e-commerce et le post social.` : 'Analyse cet article et rédige sa fiche e-commerce.' },
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
          { role: 'user', content: `Rédige la description marketing pour cet article : ${productName}` },
        ],
        max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
      };
      runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
    }
  } catch (err) {
    return json({ error: 'ai-product-enhance-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateProductEnhanceData(parsed);
  if (!clean || !clean.title) return json({ error: 'unparseable-enhancement', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
