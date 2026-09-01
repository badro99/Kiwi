// /api/ai/shift-debrief — Structuration du débriefing vocal ou écrit de fin de service.
//
// Analyse les notes ou la transcription de clôture du responsable de service/gérant,
// extrait les faits marquants, incidents clients, pannes de matériel et consignes pour demain.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.2;
const DAILY_CAP = 100;

const SYSTEM_PROMPT = `Tu es un assistant de gestion opérationnelle de restaurant et commerce au Maroc.
Analyse le débriefing oral ou textuel de fin de service et structure-le au format JSON strict :
{
  "summary": "Résumé concis en 2 phrases du service",
  "serviceMood": "fluide | rush | calme | difficile",
  "incidents": [
    { "type": "client | cuisine | caisse | attente", "description": "Détail de l'incident", "table": "T4 si mentionnée", "severity": "basse | moyenne | haute" }
  ],
  "maintenance": [
    "Machine à glaçons qui fuit", "Climatiseur terrasse faible"
  ],
  "handoverTomorrow": [
    "Commander 2 cartons de lait à l'ouverture", "Vérifier le stock de menthe"
  ]
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Capture fidèlement les remarques en français ou darija/arabe marocain.`;

export function validateDebriefData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const incidents = Array.isArray(raw.incidents)
    ? raw.incidents.map((inc) => ({
      type: String(inc.type || 'service').slice(0, 30).trim(),
      description: String(inc.description || '').slice(0, 200).trim(),
      table: String(inc.table || '').slice(0, 20).trim(),
      severity: String(inc.severity || 'moyenne').slice(0, 20).trim(),
    })).filter((i) => i.description).slice(0, 20)
    : [];

  const maintenance = Array.isArray(raw.maintenance)
    ? raw.maintenance.map((m) => String(m || '').slice(0, 150).trim()).filter(Boolean).slice(0, 10)
    : [];

  const handoverTomorrow = Array.isArray(raw.handoverTomorrow)
    ? raw.handoverTomorrow.map((h) => String(h || '').slice(0, 150).trim()).filter(Boolean).slice(0, 10)
    : [];

  return {
    summary: String(raw.summary || 'Service terminé.').slice(0, 300).trim(),
    serviceMood: String(raw.serviceMood || 'fluide').slice(0, 30).trim(),
    incidents,
    maintenance,
    handoverTomorrow,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'debrief', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  const text = typeof b?.text === 'string' ? b.text.trim().slice(0, 4000) : '';
  if (!text) return json({ error: 'text-required' }, 400);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Débriefing du service : ${text}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-debrief-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateDebriefData(parsed);
  if (!clean) return json({ error: 'unparseable-debrief', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
