// /api/ai/audio-order — Conversion de commandes WhatsApp / vocales en bons de cuisine.
//
// Reçoit le texte ou la transcription d'un message client (WhatsApp, appel téléphonique, note vocale en français, arabe ou darija),
// structure les articles commandés, quantités, options/sauces, type de commande et adresse de livraison pour la caisse et la cuisine.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.1;
const DAILY_CAP = 150;

const SYSTEM_PROMPT = `Tu es un serveur de restaurant et caissier expérimenté au Maroc.
Analyse le message vocal ou textuel d'un client (en français, arabe ou darija marocaine) et structure la commande au format JSON strict :
{
  "customerName": "Nom du client si mentionné",
  "phone": "Téléphone si mentionné (ex: 06XXXXXXXX)",
  "orderType": "livraison | emporter | sur_place",
  "deliveryAddress": "Adresse de livraison ou quartier si mentionné",
  "items": [
    { "name": "Nom de l'article (ex: Tacos Poulet L)", "qty": 2, "modifications": ["Sans oignons", "Sauce Algérienne", "Frites"], "priceEstimateMad": 45.0 }
  ],
  "specialNotes": "Précisions sur la préparation ou l'heure souhaitée",
  "suggestedTotalMad": 90.0
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Comprends le darija marocain (ex: "jib liya 2 tacos m3a frites o coca", "bghit 1 pizza fruits de mer bla fromage").
- Les quantités doivent être des entiers positifs >= 1.`;

export function validateAudioOrderData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const items = Array.isArray(raw.items)
    ? raw.items.map((it) => ({
      name: String(it.name || 'Article').slice(0, 80).trim(),
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
      modifications: Array.isArray(it.modifications) ? it.modifications.map(m => String(m || '').slice(0, 50).trim()).filter(Boolean) : [],
      priceEstimateMad: Math.max(0, Math.round((Number(it.priceEstimateMad) || 0) * 100) / 100),
    })).filter((i) => i.name).slice(0, 30)
    : [];

  const suggestedTotalMad = Math.max(0, Math.round((Number(raw.suggestedTotalMad) || items.reduce((s, i) => s + (i.priceEstimateMad * i.qty), 0)) * 100) / 100);
  const allowedTypes = new Set(['livraison', 'emporter', 'sur_place']);
  let orderType = String(raw.orderType || 'emporter').toLowerCase().trim();
  if (!allowedTypes.has(orderType)) orderType = 'emporter';

  return {
    customerName: String(raw.customerName || '').slice(0, 80).trim(),
    phone: String(raw.phone || '').slice(0, 30).trim(),
    orderType,
    deliveryAddress: String(raw.deliveryAddress || '').slice(0, 200).trim(),
    items,
    specialNotes: String(raw.specialNotes || '').slice(0, 200).trim(),
    suggestedTotalMad,
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'audioorder', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  const text = typeof b?.text === 'string' ? b.text.trim().slice(0, 3000) : '';
  if (!text) return json({ error: 'text-required' }, 400);

  const menuHint = Array.isArray(b?.menu) ? `\nCarte du restaurant : ${b.menu.slice(0, 50).map(m => m.name).join(', ')}` : '';

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Message commande client : ${text}${menuHint}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-audio-order-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateAudioOrderData(parsed);
  if (!clean || !clean.items.length) return json({ error: 'unparseable-order', raw: rawText.slice(0, 300) }, 422);

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
