// /api/ai/menu-rank — Optimisation dynamique et classement des cartes QR (OrderPro & Tables).
//
// Réordonne les plats du menu digital en fonction de l'heure (matin/midi/soir), de la température extérieure et de la marge brute,
// pour maximiser le panier moyen et mettre en avant les plats les plus rentables.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.2;
const DAILY_CAP = 200;

const SYSTEM_PROMPT = `Tu es un expert en ingénierie de menu (Menu Engineering) et yield management pour restaurants.
Analyse les articles de la carte et les conditions de service (heure, météo, marges) pour optimiser le classement QR au format JSON :
{
  "boostedItems": [
    { "id": "it_1", "name": "Thé Glacé Maison Pêche", "badge": "Coup de cœur fraîcheur", "boostReason": "Forte chaleur (34°C) + marge 82%", "highlightScore": 95 }
  ],
  "featuredCategory": "Boissons fraîches & Salades",
  "upsellSuggestion": {
    "trigger": "Café",
    "suggest": "Tartelette Citron Meringuée",
    "pitch": "Accompagnez votre café d'une douceur du chef"
  }
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Privilégie les articles à forte marge brute et forte pertinence horaire/climatique.`;

export function validateMenuRankData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const boostedItems = Array.isArray(raw.boostedItems)
    ? raw.boostedItems.map((b) => ({
      id: String(b.id || '').slice(0, 40).trim(),
      name: String(b.name || '').slice(0, 80).trim(),
      badge: String(b.badge || 'Recommandé').slice(0, 40).trim(),
      boostReason: String(b.boostReason || '').slice(0, 150).trim(),
      highlightScore: Math.max(0, Math.min(100, Math.round(Number(b.highlightScore) || 50))),
    })).filter((b) => b.name).slice(0, 10)
    : [];

  const upsellSuggestion = raw.upsellSuggestion && typeof raw.upsellSuggestion === 'object'
    ? {
      trigger: String(raw.upsellSuggestion.trigger || '').slice(0, 60).trim(),
      suggest: String(raw.upsellSuggestion.suggest || '').slice(0, 60).trim(),
      pitch: String(raw.upsellSuggestion.pitch || '').slice(0, 150).trim(),
    }
    : null;

  return {
    boostedItems,
    featuredCategory: String(raw.featuredCategory || '').slice(0, 60).trim(),
    upsellSuggestion,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'menurank', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const items = Array.isArray(b?.items) ? b.items.slice(0, 30) : [];
  const hour = typeof b?.hour === 'string' ? b.hour : '13:00';
  const temperatureC = Number.isFinite(Number(b?.temperatureC)) ? Number(b.temperatureC) : 28;

  if (!items.length) return json({ error: 'items-required' }, 400);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Heure : ${hour}\nTempérature : ${temperatureC}°C\nArticles disponibles : ${JSON.stringify(items)}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-menu-rank-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateMenuRankData(parsed);
  if (!clean || !clean.boostedItems.length) return json({ error: 'unparseable-menu-rank', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
