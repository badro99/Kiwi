// /api/ai/prep-forecast — Feuille de mise en place prédictive pour la cuisine.
//
// Calcule les quantités exactes à préparer le matin (sauces, viandes marinées, pâtes, découpes)
// en croisant l'historique des ventes du jour de la semaine, les réservations confirmées et la météo.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 1500;
const TEMPERATURE = 0.2;
const DAILY_CAP = 60;

const SYSTEM_PROMPT = `Tu es un chef de cuisine et gestionnaire des approvisionnements en restauration au Maroc.
Génère la feuille de mise en place du matin (Prep List) au format JSON strict :
{
  "day": "Vendredi",
  "expectedCovers": 140,
  "prepItems": [
    { "name": "Poulet mariné", "prepQty": 18.0, "unit": "kg", "rationne": "Moyenne vendredi midi (35 tagines)", "stockBuffer": "3 kg" },
    { "name": "Sauce Tomate maison", "prepQty": 12.0, "unit": "L", "rationne": "Pizzas + pâtes prévues", "stockBuffer": "2 L" }
  ],
  "wasteAlerts": [
    "Ne pas surproduire la crème brûlée : consommation plus faible les vendredis midi"
  ],
  "chefTip": "Anticiper le coup de feu de 13h15 avec le service du couscous."
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Quantités réalistes et unités métriques adaptées (kg, L, portions, pièces).`;

export function validatePrepForecastData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const prepItems = Array.isArray(raw.prepItems)
    ? raw.prepItems.map((p) => ({
      name: String(p.name || 'Article').slice(0, 80).trim(),
      prepQty: Math.max(0.1, Math.round((Number(p.prepQty) || 1) * 10) / 10),
      unit: String(p.unit || 'portions').slice(0, 20).trim(),
      rationne: String(p.rationne || '').slice(0, 150).trim(),
      stockBuffer: String(p.stockBuffer || '').slice(0, 40).trim(),
    })).filter((p) => p.name).slice(0, 40)
    : [];

  const wasteAlerts = Array.isArray(raw.wasteAlerts)
    ? raw.wasteAlerts.map((w) => String(w || '').slice(0, 200).trim()).filter(Boolean).slice(0, 10)
    : [];

  return {
    day: String(raw.day || 'Aujourd’hui').slice(0, 30).trim(),
    expectedCovers: Math.max(1, Math.round(Number(raw.expectedCovers) || 50)),
    prepItems,
    wasteAlerts,
    chefTip: String(raw.chefTip || '').slice(0, 250).trim(),
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const who = await tenantFor(context);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'prepforecast', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const dayOfWeek = typeof b?.dayOfWeek === 'string' ? b.dayOfWeek : 'Vendredi';
  const reservations = Number(b?.reservationsCount) || 0;
  const topSales = Array.isArray(b?.topSales) ? b.topSales.slice(0, 20) : [];
  const weather = typeof b?.weather === 'string' ? b.weather : 'Ensoleillé 28°C';

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Jour : ${dayOfWeek}\nCouverts réservés : ${reservations}\nMétéo : ${weather}\nVentes moyennes récentes : ${JSON.stringify(topSales)}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-prep-forecast-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validatePrepForecastData(parsed);
  if (!clean || !clean.prepItems.length) return json({ error: 'unparseable-prep-forecast', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
