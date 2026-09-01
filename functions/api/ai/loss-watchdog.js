// /api/ai/loss-watchdog — Détection d'anomalies de caisse, fraudes et pertes d'exploitation.
//
// Analyse les journaux de caisse (annulations après encaissement, remises manuelles répétées, ouvertures tiroir sans vente),
// identifie les schémas anormaux par serveur/caisse et alerte le gérant dans le point du matin.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.1;
const DAILY_CAP = 100;

const SYSTEM_PROMPT = `Tu es un auditeur interne et expert en prévention des pertes (loss prevention) pour la restauration et le commerce au Maroc.
Analyse les logs de service et identifie les anomalies statistiques selon ce format JSON strict :
{
  "riskLevel": "faible | modere | eleve",
  "anomalyCount": 2,
  "flaggedStaff": [
    { "name": "Yassine", "pin": "1234", "reason": "4 annulations de tickets après impression de l'addition", "amountMad": 340.0 }
  ],
  "patterns": [
    "Pic inhabituel d'ouvertures manuelles de tiroir-caisse sans vente enregistrée (6 fois)"
  ],
  "recommendation": "Vérifier le total espèces en fin de service et restreindre le droit d'annulation au manager."
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Ne lève d'alerte que sur des anomalies chiffrées réelles (ex: ratio d'annulation > 3x la moyenne).`;

export function validateWatchdogData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const flaggedStaff = Array.isArray(raw.flaggedStaff)
    ? raw.flaggedStaff.map((s) => ({
      name: String(s.name || 'Staff').slice(0, 80).trim(),
      pin: String(s.pin || '').slice(0, 10).trim(),
      reason: String(s.reason || '').slice(0, 150).trim(),
      amountMad: Math.max(0, Math.round((Number(s.amountMad) || 0) * 100) / 100),
    })).filter((s) => s.reason).slice(0, 10)
    : [];

  const patterns = Array.isArray(raw.patterns)
    ? raw.patterns.map((p) => String(p || '').slice(0, 200).trim()).filter(Boolean).slice(0, 10)
    : [];

  const allowedRisks = new Set(['faible', 'modere', 'eleve']);
  let riskLevel = String(raw.riskLevel || 'faible').toLowerCase().trim();
  if (!allowedRisks.has(riskLevel)) riskLevel = 'faible';

  return {
    riskLevel,
    anomalyCount: Math.max(0, Math.round(Number(raw.anomalyCount) || flaggedStaff.length)),
    flaggedStaff,
    patterns,
    recommendation: String(raw.recommendation || '').slice(0, 300).trim(),
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'watchdog', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const metrics = b?.metrics || {};
  const logs = Array.isArray(b?.logs) ? b.logs.slice(0, 50) : [];

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Métriques du jour : ${JSON.stringify(metrics)}\nÉvénements récents : ${JSON.stringify(logs)}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-watchdog-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateWatchdogData(parsed);
  if (!clean) return json({ error: 'unparseable-watchdog', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
