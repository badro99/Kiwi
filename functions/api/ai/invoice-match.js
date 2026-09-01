// /api/ai/invoice-match — Rapprochement 3-voies et détection des hausses de prix fournisseur.
//
// Compare les lignes d'une facture reçue avec l'historique d'achat ou le bon de commande,
// calcule les dérives de prix unitaire (> 5%), et alerte le gérant sur les augmentations abusives.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 1400;
const TEMPERATURE = 0.1;
const DAILY_CAP = 150;

const SYSTEM_PROMPT = `Tu es un contrôleur de gestion et acheteur pour restaurants et commerces au Maroc.
Compare les lignes de la facture actuelle avec l'historique des prix d'achat et génère une analyse d'écart :
{
  "matchedLines": [
    { "label": "Huile d'olive", "currentUnitCost": 85.0, "historicalUnitCost": 75.0, "deltaPct": 13.3, "status": "hausse | stable | baisse | nouveau" }
  ],
  "alerts": [
    "Huile d'olive en hausse de +13.3% (+10 MAD/L) par rapport au dernier achat"
  ],
  "totalPriceImpactMad": 120.0,
  "recommendation": "Contester la hausse d'huile d'olive ou demander une remise sur volume."
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- deltaPct est le pourcentage d'évolution ((current - hist) / hist * 100).
- Statut "hausse" si deltaPct >= 3%, "baisse" si deltaPct <= -3%, "stable" sinon.`;

export function validateInvoiceMatchData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const matchedLines = Array.isArray(raw.matchedLines)
    ? raw.matchedLines.map((l) => ({
      label: String(l.label || 'Article').slice(0, 100).trim(),
      currentUnitCost: Math.max(0, Math.round((Number(l.currentUnitCost) || 0) * 100) / 100),
      historicalUnitCost: Math.max(0, Math.round((Number(l.historicalUnitCost) || 0) * 100) / 100),
      deltaPct: Math.round((Number(l.deltaPct) || 0) * 10) / 10,
      status: String(l.status || 'stable').slice(0, 20).trim(),
    })).slice(0, 50)
    : [];

  const alerts = Array.isArray(raw.alerts)
    ? raw.alerts.map((a) => String(a || '').slice(0, 200).trim()).filter(Boolean).slice(0, 15)
    : [];

  return {
    matchedLines,
    alerts,
    totalPriceImpactMad: Math.round((Number(raw.totalPriceImpactMad) || 0) * 100) / 100,
    recommendation: String(raw.recommendation || '').slice(0, 300).trim(),
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'invoicematch', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const currentLines = Array.isArray(b?.currentLines) ? b.currentLines.slice(0, 40) : [];
  const historicalItems = Array.isArray(b?.historicalItems) ? b.historicalItems.slice(0, 40) : [];

  if (!currentLines.length) return json({ error: 'current-lines-required' }, 400);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Facture actuelle : ${JSON.stringify(currentLines)}\nHistorique prix : ${JSON.stringify(historicalItems)}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-invoice-match-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateInvoiceMatchData(parsed);
  if (!clean || !clean.matchedLines.length) return json({ error: 'unparseable-match', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
