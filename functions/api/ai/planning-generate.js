// /api/ai/planning-generate — Génération automatique de plannings d'équipe par consigne naturelle.
//
// Reçoit une consigne du manager (ex: "Karim en repos mardi, Leila ouvre vendredi...") et la liste des employés,
// génère un planning hebdomadaire optimisé pour employee-planning.js et planning-core.js.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 2200;
const TEMPERATURE = 0.2;
const DAILY_CAP = 60;

const SYSTEM_PROMPT = `Tu es un gestionnaire de planning RH pour restaurants et commerces au Maroc.
Génère le planning hebdomadaire (Lundi à Dimanche) respectant les consignes et les règles de repos hebdomadaire :
{
  "shifts": [
    { "memberId": "emp-1", "name": "Prénom", "day": "lundi | mardi | mercredi | jeudi | vendredi | samedi | dimanche", "start": "09:00", "end": "17:00", "role": "Service | Cuisine | Caisse", "breakMin": 30 }
  ],
  "summary": "Résumé de la couverture (ex: 2 ouvertures, 3 fermetures par jour)",
  "warnings": ["Karim a 1 seul jour de repos cette semaine"]
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Utilise les memberId fournis pour chaque employé.`;

export function validatePlanningData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const shifts = Array.isArray(raw.shifts)
    ? raw.shifts.map((s) => ({
      memberId: String(s.memberId || '').slice(0, 40).trim(),
      name: String(s.name || '').slice(0, 80).trim(),
      day: String(s.day || 'lundi').toLowerCase().trim(),
      start: String(s.start || '09:00').slice(0, 10).trim(),
      end: String(s.end || '17:00').slice(0, 10).trim(),
      role: String(s.role || 'Général').slice(0, 40).trim(),
      breakMin: Math.max(0, Math.min(120, Math.round(Number(s.breakMin) || 0))),
    })).filter((s) => s.memberId && s.day).slice(0, 100)
    : [];

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.map((w) => String(w || '').slice(0, 150).trim()).filter(Boolean).slice(0, 10)
    : [];

  return {
    shifts,
    summary: String(raw.summary || 'Planning généré.').slice(0, 300).trim(),
    warnings,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'planning', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const prompt = typeof b?.prompt === 'string' ? b.prompt.trim().slice(0, 2000) : '';
  const staff = Array.isArray(b?.staff) ? b.staff.slice(0, 50) : [];

  if (!prompt && !staff.length) return json({ error: 'prompt-or-staff-required' }, 400);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Consigne : ${prompt || 'Génère un planning équilibré'}\nÉquipe disponible : ${JSON.stringify(staff)}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-planning-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validatePlanningData(parsed);
  if (!clean || !clean.shifts.length) return json({ error: 'unparseable-planning', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
