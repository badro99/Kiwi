// /api/ai/whatsapp-campaign — Génération de campagnes de fidélisation WhatsApp localisées.
//
// Reçoit l'objectif promotionnel ou événementiel du commerçant,
// génère les messages WhatsApp percutants en français et darija marocaine (avec balises de publipostage {prenom}).

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

export const MODEL = '@cf/zai-org/glm-5.3-flash';
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.3;
const DAILY_CAP = 60;

const SYSTEM_PROMPT = `Tu es un expert en marketing direct et fidélisation client pour restaurants et commerces au Maroc.
Génère une campagne WhatsApp attractive, personnalisée et respectueuse, en français et en darija marocaine au format JSON :
{
  "title": "Nom de la campagne",
  "audienceTarget": "Tous les clients | Clients inactifs > 30j | Meilleurs clients VIP",
  "frenchMessage": "Bonjour {prenom} ! 👋 ...",
  "darijaMessage": "Salam {prenom} ! 👋 ...",
  "suggestedTiming": "Vendredi à 11h30",
  "tips": "Ajouter une photo haute définition du plat/produit"
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Inclus impérativement la variable {prenom} dans les messages pour la personnalisation.
- Style chaleureux et engageant, adapté à la culture marocaine.`;

export function validateCampaignData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    title: String(raw.title || 'Campagne WhatsApp').slice(0, 80).trim(),
    audienceTarget: String(raw.audienceTarget || 'Tous les clients').slice(0, 80).trim(),
    frenchMessage: String(raw.frenchMessage || '').slice(0, 800).trim(),
    darijaMessage: String(raw.darijaMessage || '').slice(0, 800).trim(),
    suggestedTiming: String(raw.suggestedTiming || 'En journée').slice(0, 60).trim(),
    tips: String(raw.tips || '').slice(0, 200).trim(),
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const who = await tenantFor(request, env, b?.merchant);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const allowed = await quotaOk(env, who, 'campaign', DAILY_CAP);
  if (!allowed) return json({ error: 'daily-quota-exceeded' }, 429);

  const objective = typeof b?.objective === 'string' ? b.objective.trim().slice(0, 1000) : '';
  const offer = typeof b?.offer === 'string' ? b.offer.trim().slice(0, 500) : '';

  if (!objective && !offer) return json({ error: 'objective-or-offer-required' }, 400);

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Objectif de la campagne : ${objective || 'Fidélisation'}\nOffre spéciale / Détail : ${offer || 'Aucune'}` },
    ],
    max_tokens: MAX_TOKENS, temperature: TEMPERATURE,
  };

  let runRes;
  try {
    runRes = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
  } catch (err) {
    return json({ error: 'ai-campaign-failed', details: String(err?.message || err) }, 502);
  }

  const rawText = runRes?.result?.response || runRes?.result?.description || JSON.stringify(runRes?.result || '');
  let parsed = null;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (_) {}

  const clean = validateCampaignData(parsed);
  if (!clean || (!clean.frenchMessage && !clean.darijaMessage)) {
    return json({ error: 'unparseable-campaign', raw: rawText.slice(0, 300) }, 422);
  }

  return json({ ok: true, data: clean }, 200, { 'x-kiwi-ai-model': runRes.model });
}
