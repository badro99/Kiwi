// /api/ai/reservation-parse — Extraction de réservations depuis des messages WhatsApp / SMS / Instagram.
//
// Reçoit un texte libre collé depuis une conversation client,
// extrait le nom, le nombre de couverts, la date/heure et les souhaits d'emplacement pour reservations.js.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 800;
const TEMPERATURE = 0.1;
const DAILY_CAP = 200;

const SYSTEM_PROMPT = `Tu es un réceptionniste de restaurant au Maroc.
Analyse le message de réservation (WhatsApp, SMS ou DM en français, arabe ou darija) et extrais les faits au format JSON strict :
{
  "name": "Nom du client",
  "covers": 4,
  "date": "AAAA-MM-JJ si identifiable",
  "time": "HH:MM",
  "phone": "Numéro de téléphone marocain si présent (ex: 06XXXXXXXX)",
  "zone": "terrasse | salle | etage | jardin | quelconque",
  "notes": "Demandes particulières (anniversaire, chaise bébé, vue, etc.)"
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- covers doit être un entier positif (par défaut 2 si non précisé mais évident).
- Si la date indique "ce soir" ou "demain", convertis en date relative si possible ou laisse la mention dans notes.`;

export function validateReservationData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const covers = Math.max(1, Math.min(100, Math.round(Number(raw.covers) || 2)));
  return {
    name: String(raw.name || 'Client').slice(0, 80).trim(),
    covers,
    date: String(raw.date || '').slice(0, 20).trim(),
    time: String(raw.time || '20:00').slice(0, 10).trim(),
    phone: String(raw.phone || '').slice(0, 30).trim(),
    zone: String(raw.zone || 'quelconque').slice(0, 30).trim(),
    notes: String(raw.notes || '').slice(0, 200).trim(),
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'reservation', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const text = typeof b?.text === 'string' ? b.text.trim().slice(0, 2000) : '';
  if (!text) return json({ error: 'text-required' }, 400);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Message reçu : ${text}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-reservation-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateReservationData(parsed);
  if (!clean || !clean.name) return json({ error: 'unparseable-reservation', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
