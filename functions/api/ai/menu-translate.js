// /api/ai/menu-translate — traduction et adaptation intelligente de la carte d'un restaurant.
//
// Permet au restaurateur de traduire automatiquement l'intégralité de sa carte
// (sections, sous-sections, articles, descriptions, modificateurs) vers la langue
// utilisée dans l'application (Français, Arabe, Anglais), tout en préservant
// les termes culinaires universels (Espresso, Latte, Matcha...).

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { runWithFallback } from './_run.js';
import { parseModelResponse } from './invoice.js';

export const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const FALLBACK_MODEL = '@cf/zai-org/glm-4.7-flash';

const MAX_TOKENS = 4000;
const TEMPERATURE = 0.1;
const TOP_P = 0.9;
const DAILY_CAP = 60;

function translatePrompt(targetLang, payload) {
  const langNames = {
    fr: 'français',
    ar: 'arabe (darija/marocain ou arabe standard)',
    en: 'anglais',
  };
  const targetLabel = langNames[targetLang] || 'français';

  return `Tu es un traducteur expert en restauration et hôtellerie au Maroc.
Traduis NATURELLEMENT tous les libellés de la carte fournie (sections, sous-sections, articles, descriptions, groupes d'options) vers la langue cible : ${targetLabel}.

Règles de traduction :
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte d'introduction ni markdown autre que le JSON.
- Conserve EXACTEMENT tous les identifiants ("id", "catId", "subId", etc.) et tous les prix ("price"). Ne modifie AUCUN chiffre ni identifiant.
- Traduis fidèlement les noms génériques et sections :
  * Ex: "Hot Drinks" -> "Boissons chaudes", "Cold Drinks" -> "Boissons fraîches", "Brunch & Breakfast" -> "Brunch & Petit-déjeuner", "Sweets" -> "Desserts & Douceurs", "Lunch & Snack" -> "Déjeuner & En-cas".
  * Ex: "Salted Caramel Latte" -> "Latte Caramel Beurre Salé", "Coconut Matcha" -> "Matcha Coco", "Matcha Mango" -> "Matcha Mangue", "Scrambled eggs" -> "Œufs brouillés", "Fresh Orange Juice" -> "Jus d'orange frais".
- Conserve les termes culinaires universels ou signatures de café qui ne se traduisent pas (ex: "Espresso", "Matcha", "Latte", "Cappuccino", "Smoothie", "Mocha", "Americano", "Tiramisu", "Burger", "Tacos", "Speculoos", "Croissant").
- Traduis les noms et choix de groupes d'options (ex: "Choice of milk" -> "Choix du lait", "Oat milk" -> "Lait d'avoine", "Sugar level" -> "Niveau de sucre").

Structure JSON exacte à retourner :
{
  "cats": [
    { "id": "id_section", "name": "Nom traduit de la section", "sub": [ { "id": "id_sous_section", "name": "Nom traduit" } ] }
  ],
  "items": [
    { "id": "id_article", "name": "Nom traduit de l'article", "desc": "Description traduite" }
  ],
  "opts": [
    { "id": "id_groupe", "name": "Nom traduit du groupe", "choices": [ { "id": "id_choix", "name": "Nom traduit du choix" } ] }
  ]
}`;
}

export function validateTranslation(raw, original) {
  if (!raw || typeof raw !== 'object') return null;
  const outCats = [];
  const origCats = (original && Array.isArray(original.cats)) ? original.cats : [];
  const catMap = new Map();
  (Array.isArray(raw.cats) ? raw.cats : []).forEach(c => { if (c && c.id) catMap.set(String(c.id), c); });

  origCats.forEach(c => {
    const t = catMap.get(String(c.id));
    const subMap = new Map();
    if (t && Array.isArray(t.sub)) t.sub.forEach(s => { if (s && s.id) subMap.set(String(s.id), s); });
    outCats.push({
      id: c.id,
      name: (t && t.name ? String(t.name).slice(0, 60).trim() : c.name),
      station: c.station || '',
      sub: (c.sub || []).map(s => {
        const ts = subMap.get(String(s.id));
        return { id: s.id, name: (ts && ts.name ? String(ts.name).slice(0, 60).trim() : s.name) };
      }),
    });
  });

  const itemMap = new Map();
  (Array.isArray(raw.items) ? raw.items : []).forEach(it => { if (it && it.id) itemMap.set(String(it.id), it); });
  const outItems = [];
  const origItems = (original && Array.isArray(original.items)) ? original.items : [];

  origItems.forEach(it => {
    const t = itemMap.get(String(it.id));
    outItems.push(Object.assign({}, it, {
      name: (t && t.name ? String(t.name).slice(0, 120).trim() : it.name),
      desc: (t && t.desc != null ? String(t.desc).slice(0, 400).trim() : (it.desc || '')),
    }));
  });

  const optMap = new Map();
  (Array.isArray(raw.opts) ? raw.opts : []).forEach(g => { if (g && g.id) optMap.set(String(g.id), g); });
  const outOpts = [];
  const origOpts = (original && Array.isArray(original.opts)) ? original.opts : [];

  origOpts.forEach(g => {
    const tg = optMap.get(String(g.id));
    const chMap = new Map();
    if (tg && Array.isArray(tg.choices)) tg.choices.forEach(ch => { if (ch && ch.id) chMap.set(String(ch.id), ch); });
    outOpts.push(Object.assign({}, g, {
      name: (tg && tg.name ? String(tg.name).slice(0, 80).trim() : g.name),
      choices: (g.choices || []).map(ch => {
        const tch = chMap.get(String(ch.id));
        return Object.assign({}, ch, {
          name: (tch && tch.name ? String(tch.name).slice(0, 80).trim() : ch.name),
        });
      }),
    }));
  });

  return { cats: outCats, items: outItems, opts: outOpts };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = null;
  try { body = await request.json(); } catch (_) { body = null; }
  if (!body) return json({ ok: false, error: 'body' }, 400);

  const who = await tenantFor(request, env, body.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  if (!(await quotaOk(env, who, 'menutranslate', DAILY_CAP))) {
    return json({ ok: false, error: 'quota' }, 429);
  }

  const targetLang = String(body.targetLang || body.lang || 'fr').toLowerCase();
  const inputData = {
    cats: Array.isArray(body.cats) ? body.cats : [],
    items: Array.isArray(body.items) ? body.items.map(it => ({ id: it.id, name: it.name, desc: it.desc || '' })) : [],
    opts: Array.isArray(body.opts) ? body.opts.map(g => ({ id: g.id, name: g.name, choices: (g.choices || []).map(c => ({ id: c.id, name: c.name })) })) : [],
  };

  const payload = {
    messages: [
      { role: 'system', content: translatePrompt(targetLang, inputData) },
      { role: 'user', content: `Voici la carte à traduire :\n\n${JSON.stringify(inputData)}` },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    top_p: TOP_P,
  };

  let aiRes;
  let usedModel = MODEL;
  try {
    const r = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
    aiRes = r.result;
    usedModel = r.model;
  } catch (_) {
    return json({ ok: false, reason: 'model' }, 200);
  }

  const parsed = parseModelResponse(aiRes);
  const validated = parsed ? validateTranslation(parsed, body) : null;
  if (!validated) {
    return json({ ok: false, reason: 'unparsed' }, 200, { 'x-kiwi-ai-model': usedModel });
  }

  return json({
    ok: true,
    targetLang,
    cats: validated.cats,
    items: validated.items,
    opts: validated.opts,
  }, 200, { 'x-kiwi-ai-model': usedModel });
}
