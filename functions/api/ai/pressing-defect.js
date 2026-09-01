// /api/ai/pressing-defect — Scan d'étiquette d'entretien et détection de défauts pour Pressing.
//
// Analyse la photo d'un vêtement déposé ou de son étiquette d'entretien,
// extrait les symboles de lavage, matière et défauts préalables (taches, accrocs) pour le ticket pressing.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const VISION_MODEL = '@cf/zai-org/glm-5.3-flash';
export const VISION_FALLBACK_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.1;
const DAILY_CAP = 150;
const MAX_IMAGE_DATAURL = 2_600_000;

const SYSTEM_PROMPT = `Tu es un maître teinturier et expert pressing / blanchisserie au Maroc.
Analyse la photo du vêtement ou de son étiquette d'entretien textile et structure le constat au format JSON :
{
  "garmentType": "Costume | Djellaba | Caftan | Chemise | Manteau | Pantalon | Robe | Tapis",
  "fabric": "Laine | Soie | Coton | Lin | Synthétique | Cuir",
  "color": "Couleur",
  "dryCleanOnly": true,
  "careInstructions": ["Nettoyage à sec au perchloréthylène", "Repassage doux à 110°C"],
  "preExistingDefects": [
    { "type": "tache | accroc | bouton_manquant | usure | brulure", "location": "Manche droite | Col | Bas", "description": "Tache de gras visible" }
  ],
  "riskWarning": "Attention : tissu délicat, risque de dégorgement des couleurs"
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Sois très précis sur les défauts visibles pour protéger le commerçant contre les litiges.`;

export function validatePressingData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const preExistingDefects = Array.isArray(raw.preExistingDefects)
    ? raw.preExistingDefects.map((d) => ({
      type: String(d.type || 'autre').slice(0, 30).trim(),
      location: String(d.location || '').slice(0, 50).trim(),
      description: String(d.description || '').slice(0, 150).trim(),
    })).filter((d) => d.description).slice(0, 10)
    : [];

  const careInstructions = Array.isArray(raw.careInstructions)
    ? raw.careInstructions.map((c) => String(c || '').slice(0, 100).trim()).filter(Boolean).slice(0, 10)
    : [];

  return {
    garmentType: String(raw.garmentType || 'Vêtement').slice(0, 60).trim(),
    fabric: String(raw.fabric || '').slice(0, 60).trim(),
    color: String(raw.color || '').slice(0, 40).trim(),
    dryCleanOnly: Boolean(raw.dryCleanOnly),
    careInstructions,
    preExistingDefects,
    riskWarning: String(raw.riskWarning || '').slice(0, 200).trim(),
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'pressing', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const image = typeof b?.image === 'string' ? b.image.trim() : '';
  if (!image.startsWith('data:image/')) return json({ error: 'image-required' }, 400);
  if (image.length > MAX_IMAGE_DATAURL) return json({ error: 'image-too-large' }, 413);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: 'Analyse ce vêtement/étiquette pressing et relève l’entretien et les défauts préalables.' },
        { type: 'image_url', image_url: { url: image } },
      ] },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, VISION_MODEL, VISION_FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-pressing-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validatePressingData(parsed);
  if (!clean) return json({ error: 'unparseable-pressing-scan', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
