import { budgetRoute } from './_budget-route.js';
import { GLM_FLASH as MODEL, GLM_FLASH as VISION_MODEL, GEMMA_VISION as VISION_FALLBACK_MODEL, QWEN as FALLBACK_MODEL } from './_models.js';
export { MODEL, VISION_MODEL, VISION_FALLBACK_MODEL, FALLBACK_MODEL };
// /api/ai/tpe-reconcile — OCR et réconciliation du ticket de télécollecte TPE / CMI.
//
// Reçoit une image de ticket TPE (télécollecte de clôture ou récapitulatif bancaire),
// extrait les montants et le nombre de transactions par GLM-5.3 Flash Vision,
// et calcule automatiquement l'écart avec les ventes carte enregistrées dans Kiwi.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk, quotaBody, DAILY_CAPS } from './_quota.js';
import { GATEWAY_OPTS, aiText, runAiWithGateway } from './_run.js';
import { runVisionPair } from './_vision.js';
export { GATEWAY_OPTS, runAiWithGateway };


const MAX_TOKENS = 1200;
const TEMPERATURE = 0.1;
const TOP_P = 0.9;
const DAILY_CAP = DAILY_CAPS.tpe;
const MAX_IMAGE_DATAURL = 2_600_000;

const SYSTEM_PROMPT = `Tu es un extracteur spécialisé pour les tickets de télécollecte bancaire et TPE (CMI, Attijariwafa, BCP, BMCE, CIH, etc.) au Maroc.
Analyse la photo du ticket TPE et extrais les informations au format JSON strict avec cette structure exacte :
{
  "bank": "Nom de la banque ou acquéreur (ex: CMI, BCP, Attijariwafa)",
  "terminalId": "Numéro du terminal ou TPE",
  "date": "AAAA-MM-JJ si identifiable",
  "time": "HH:MM si identifiable",
  "batchNumber": "Numéro de télécollecte / lot",
  "txCount": 15,
  "totalAmount": 4250.0,
  "currency": "MAD"
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte d'introduction ni markdown superflu.
- txCount doit être un entier positif (nombre de transactions).
- totalAmount doit être un nombre décimal positif (montant total en MAD).
- Si un champ est illisible, utilise une chaîne vide ou 0 pour les nombres.`;

async function runTpeVision(env, dataUrl) {
  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: 'Voici la photo du ticket de télécollecte TPE. Extrais les chiffres exacts.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ] },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE, reasoning_effort: 'low', top_p: TOP_P,
  };
  return runVisionPair(env, VISION_MODEL, VISION_FALLBACK_MODEL, payload);
}

export function validateTpeData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const txCount = Math.max(0, Math.round(Number(raw.txCount) || 0));
  const totalAmount = Math.max(0, Math.round((Number(raw.totalAmount) || 0) * 100) / 100);
  return {
    bank: String(raw.bank || 'CMI').slice(0, 60).trim(),
    terminalId: String(raw.terminalId || '').slice(0, 40).trim(),
    date: String(raw.date || '').slice(0, 20).trim(),
    time: String(raw.time || '').slice(0, 10).trim(),
    batchNumber: String(raw.batchNumber || '').slice(0, 40).trim(),
    txCount,
    totalAmount,
    currency: 'MAD',
  };
}

async function budgetHandler(context) {
  const { request, env } = context;

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'tpe', DAILY_CAP, { models: [MODEL, FALLBACK_MODEL, VISION_MODEL, VISION_FALLBACK_MODEL], maxTokens: Math.max(MAX_TOKENS) });
  if (!allowed) return json(quotaBody('tpe', 'daily-quota-exceeded'), 429);

  const image = typeof b?.image === 'string' ? b.image.trim() : '';
  if (!image.startsWith('data:image/')) return json({ error: 'image-required' }, 400);
  if (image.length > MAX_IMAGE_DATAURL) return json({ error: 'image-too-large' }, 413);

  let runRes;
  try {
    runRes = await runTpeVision(env, image);
  } catch (err) {
    return json({ error: 'ai-vision-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = aiText(runRes?.result);
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateTpeData(parsed);
  if (!clean || (!clean.totalAmount && !clean.txCount)) {
    return json({ error: 'unreadable-slip', raw: rawText.slice(0, 300) }, 422);
  }

  const kiwiCardTotal = Number.isFinite(Number(b?.kiwiCardTotal)) ? Number(b.kiwiCardTotal) : null;
  const delta = kiwiCardTotal != null ? Math.round((clean.totalAmount - kiwiCardTotal) * 100) / 100 : null;

  return json({
    ok: true,
    data: clean,
    reconciliation: {
      kiwiCardTotal,
      tpeTotal: clean.totalAmount,
      delta,
      matched: delta != null ? Math.abs(delta) < 0.01 : null,
    }
  }, 200, { 'x-kiwi-ai-model': runRes.model });
}

export const onRequestPost = budgetRoute(budgetHandler, 'tpe', 'daily-quota-exceeded');
