import { budgetRoute } from './_budget-route.js';
import { GLM_FLASH as MODEL, GLM_FLASH as VISION_MODEL, GEMMA_VISION as VISION_FALLBACK_MODEL, QWEN as FALLBACK_MODEL } from './_models.js';
export { MODEL, VISION_MODEL, VISION_FALLBACK_MODEL, FALLBACK_MODEL };
// /api/ai/pressing-defect — Scan d'étiquette d'entretien et détection de défauts pour Pressing.
//
// Analyse la photo d'un vêtement déposé ou de son étiquette d'entretien,
// extrait les symboles de lavage, matière et défauts préalables (taches, accrocs) pour le ticket pressing.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk, quotaBody, DAILY_CAPS } from './_quota.js';
import { runVisionPair } from './_vision.js';
import { GATEWAY_OPTS, aiText, runAiWithGateway } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };


const MAX_TOKENS = 1200;
const TEMPERATURE = 0.1;
const DAILY_CAP = DAILY_CAPS.pressing;
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

async function budgetHandler(context) {
  const { request, env } = context;

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'pressing', DAILY_CAP, { models: [MODEL, FALLBACK_MODEL, VISION_MODEL, VISION_FALLBACK_MODEL], maxTokens: Math.max(MAX_TOKENS) });
  if (!allowed) return json(quotaBody('pressing', 'daily-quota-exceeded'), 429);

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
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE, reasoning_effort: 'low',
  };

  let runRes;
  try {
    runRes = await runVisionPair(env, VISION_MODEL, VISION_FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-pressing-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = aiText(runRes?.result);
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validatePressingData(parsed);
  if (!clean) return json({ error: 'unparseable-pressing-scan', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}

export const onRequestPost = budgetRoute(budgetHandler, 'pressing', 'daily-quota-exceeded');
