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
import { canonicalMenuLang, isMenuLang, NATIVE_NAMES, RTL } from '../_menu-langs.js';

export const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const FALLBACK_MODEL = '@cf/zai-org/glm-4.7-flash';

const MAX_TOKENS = 4000;
const TEMPERATURE = 0.1;
const TOP_P = 0.9;
const DAILY_CAP = 120;

export const GLOSSARY = Object.freeze({
  halal: { fr:'halal',ar:'حلال',en:'halal',es:'halal',de:'halal',it:'halal',pt:'halal',nl:'halal',ru:'халяль','zh-Hans':'清真','zh-Hant':'清真',ja:'ハラール',ko:'할랄',tr:'helal',he:'חלאל',pl:'halal',sv:'halal',no:'halal',da:'halal',hi:'हलाल',id:'halal',el:'χαλάλ',uk:'халяль' },
  vegetarian: { fr:'végétarien',ar:'نباتي',en:'vegetarian',es:'vegetariano',de:'vegetarisch',it:'vegetariano',pt:'vegetariano',nl:'vegetarisch',ru:'вегетарианское','zh-Hans':'素食','zh-Hant':'素食',ja:'ベジタリアン',ko:'채식',tr:'vejetaryen',he:'צמחוני',pl:'wegetariańskie',sv:'vegetarisk',no:'vegetarisk',da:'vegetarisk',hi:'शाकाहारी',id:'vegetarian',el:'χορτοφαγικό',uk:'вегетаріанське' },
  vegan: { fr:'vegan',ar:'نباتي صرف',en:'vegan',es:'vegano',de:'vegan',it:'vegano',pt:'vegano',nl:'veganistisch',ru:'веганское','zh-Hans':'纯素','zh-Hant':'純素',ja:'ヴィーガン',ko:'비건',tr:'vegan',he:'טבעוני',pl:'wegańskie',sv:'vegansk',no:'vegansk',da:'vegansk',hi:'वीगन',id:'vegan',el:'βίγκαν',uk:'веганське' },
  glutenFree: { fr:'sans gluten',ar:'خال من الغلوتين',en:'gluten-free',es:'sin gluten',de:'glutenfrei',it:'senza glutine',pt:'sem glúten',nl:'glutenvrij',ru:'без глютена','zh-Hans':'无麸质','zh-Hant':'無麩質',ja:'グルテンフリー',ko:'글루텐 프리',tr:'glütensiz',he:'ללא גלוטן',pl:'bez glutenu',sv:'glutenfri',no:'glutenfri',da:'glutenfri',hi:'ग्लूटेन-मुक्त',id:'bebas gluten',el:'χωρίς γλουτένη',uk:'без глютену' },
  spicy: { fr:'épicé',ar:'حار',en:'spicy',es:'picante',de:'scharf',it:'piccante',pt:'picante',nl:'pittig',ru:'острое','zh-Hans':'辣','zh-Hant':'辣',ja:'辛口',ko:'매운맛',tr:'acı',he:'חריף',pl:'ostre',sv:'stark',no:'sterk',da:'stærk',hi:'मसालेदार',id:'pedas',el:'πικάντικο',uk:'гостре' },
  lactoseFree: { fr:'sans lactose',ar:'خال من اللاكتوز',en:'lactose-free',es:'sin lactosa',de:'laktosefrei',it:'senza lattosio',pt:'sem lactose',nl:'lactosevrij',ru:'без лактозы','zh-Hans':'无乳糖','zh-Hant':'無乳糖',ja:'ラクトースフリー',ko:'유당 무첨가',tr:'laktozsuz',he:'ללא לקטוז',pl:'bez laktozy',sv:'laktosfri',no:'laktosefri',da:'laktosefri',hi:'लैक्टोज-मुक्त',id:'bebas laktosa',el:'χωρίς λακτόζη',uk:'без лактози' },
  nuts: { fr:'contient des noix',ar:'يحتوي على المكسرات',en:'contains nuts',es:'contiene frutos secos',de:'enthält Nüsse',it:'contiene frutta a guscio',pt:'contém frutos secos',nl:'bevat noten',ru:'содержит орехи','zh-Hans':'含坚果','zh-Hant':'含堅果',ja:'ナッツを含む',ko:'견과류 함유',tr:'kuruyemiş içerir',he:'מכיל אגוזים',pl:'zawiera orzechy',sv:'innehåller nötter',no:'inneholder nøtter',da:'indeholder nødder',hi:'मेवे शामिल हैं',id:'mengandung kacang',el:'περιέχει ξηρούς καρπούς',uk:'містить горіхи' },
});

const GLOSSARY_ALIASES = new Map([
  ['halal','halal'],['végétarien','vegetarian'],['vegetarian','vegetarian'],['vegan','vegan'],
  ['sans gluten','glutenFree'],['gluten-free','glutenFree'],['épicé','spicy'],['spicy','spicy'],
  ['sans lactose','lactoseFree'],['lactose-free','lactoseFree'],['contient des noix','nuts'],['contains nuts','nuts'],
]);

function glossaryValue(value, targetLang) {
  const key = GLOSSARY_ALIASES.get(String(value || '').trim().toLowerCase());
  return key && GLOSSARY[key] && GLOSSARY[key][targetLang] ? GLOSSARY[key][targetLang] : null;
}

export function applyGlossary(translated, original, targetLang) {
  const byId = (list) => new Map((list || []).filter((x) => x && x.id).map((x) => [String(x.id), x]));
  const patch = (out, source) => {
    if (!out || !source) return;
    const name = glossaryValue(source.name, targetLang); if (name) out.name = name;
    const desc = glossaryValue(source.desc, targetLang); if (desc) out.desc = desc;
  };
  const cats = byId(original && original.cats), items = byId(original && original.items), opts = byId(original && original.opts);
  (translated.cats || []).forEach((c) => { const src = cats.get(String(c.id)); patch(c, src); const subs = byId(src && src.sub); (c.sub || []).forEach((s) => patch(s, subs.get(String(s.id)))); });
  (translated.items || []).forEach((it) => patch(it, items.get(String(it.id))));
  (translated.opts || []).forEach((g) => { const src = opts.get(String(g.id)); patch(g, src); const choices = byId(src && src.choices); (g.choices || []).forEach((c) => patch(c, choices.get(String(c.id)))); });
  return translated;
}

export function translatePrompt(targetLang, payload) {
  const targetLabel = NATIVE_NAMES[targetLang];
  const scriptRule = RTL.includes(targetLang) || ['ru','zh-Hans','zh-Hant','ja','ko','hi','el','uk'].includes(targetLang)
    ? 'Translittère les noms propres et plats signature dans l’écriture de la langue cible.'
    : 'Garde les noms propres et plats signature sans translittération.';

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
- Un libellé DÉJÀ dans la langue cible est recopié tel quel (même casse, même orthographe) — ne le reformule pas.
- Un nom propre, une marque ou un plat signature (ex: "Msemen Hajja Fatima", "Burger Atlas") garde son nom ; en arabe, translittère-le.
- ${scriptRule}
- Les mentions alimentaires fixes (halal, végétarien, vegan, sans gluten, épicé, sans lactose, contient des noix) sont normalisées après ta réponse par une table déterministe dans Kiwi.
- Traduis TOUTES les entrées reçues, aucune omission : la réponse contient exactement les mêmes identifiants que l'entrée.

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

function extractJson(aiRes) {
  if (!aiRes) return null;
  if (typeof aiRes === 'object') {
    if (aiRes.cats || aiRes.items || aiRes.opts) return aiRes;
    if (aiRes.response != null && typeof aiRes.response === 'object') return aiRes.response;
    if (aiRes.response != null && typeof aiRes.response === 'string') {
      const p = extractJson(aiRes.response);
      if (p) return p;
    }
    if (Array.isArray(aiRes.choices) && aiRes.choices[0]) {
      const c = aiRes.choices[0];
      const p = extractJson((c.message && c.message.content) || c.text || '');
      if (p) return p;
    }
  }
  let str = String(aiRes || '').trim();
  if (!str) return null;
  str = str.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const a = str.indexOf('{'), b = str.lastIndexOf('}');
  if (a >= 0 && b > a) str = str.slice(a, b + 1);
  try { return JSON.parse(str); } catch (_) {
    try {
      const cleaned = str.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(cleaned);
    } catch (_) { return null; }
  }
}

export function validateTranslation(raw, original) {
  if (!raw || typeof raw !== 'object') return null;
  const outCats = [];
  const origCats = (original && Array.isArray(original.cats)) ? original.cats : [];
  const catMap = new Map();
  const catNameMap = new Map();
  (Array.isArray(raw.cats) ? raw.cats : []).forEach(c => {
    if (c && c.id) catMap.set(String(c.id), c);
    if (c && c.name) catNameMap.set(String(c.name).trim().toLowerCase(), c);
  });

  origCats.forEach(c => {
    const t = catMap.get(String(c.id)) || catNameMap.get(String(c.name).trim().toLowerCase());
    const subMap = new Map();
    const subNameMap = new Map();
    if (t && Array.isArray(t.sub)) {
      t.sub.forEach(s => {
        if (s && s.id) subMap.set(String(s.id), s);
        if (s && s.name) subNameMap.set(String(s.name).trim().toLowerCase(), s);
      });
    }
    outCats.push({
      id: c.id,
      name: (t && t.name ? String(t.name).slice(0, 60).trim() : c.name),
      station: c.station || '',
      sub: (c.sub || []).map(s => {
        const ts = subMap.get(String(s.id)) || subNameMap.get(String(s.name).trim().toLowerCase());
        return { id: s.id, name: (ts && ts.name ? String(ts.name).slice(0, 60).trim() : s.name) };
      }),
    });
  });

  const itemMap = new Map();
  const itemNameMap = new Map();
  (Array.isArray(raw.items) ? raw.items : []).forEach(it => {
    if (it && it.id) itemMap.set(String(it.id), it);
    if (it && it.name) itemNameMap.set(String(it.name).trim().toLowerCase(), it);
  });
  const outItems = [];
  const origItems = (original && Array.isArray(original.items)) ? original.items : [];

  origItems.forEach(it => {
    const t = itemMap.get(String(it.id)) || itemNameMap.get(String(it.name).trim().toLowerCase());
    outItems.push(Object.assign({}, it, {
      name: (t && t.name ? String(t.name).slice(0, 120).trim() : it.name),
      desc: (t && t.desc != null ? String(t.desc).slice(0, 400).trim() : (it.desc || '')),
    }));
  });

  const optMap = new Map();
  const optNameMap = new Map();
  (Array.isArray(raw.opts) ? raw.opts : []).forEach(g => {
    if (g && g.id) optMap.set(String(g.id), g);
    if (g && g.name) optNameMap.set(String(g.name).trim().toLowerCase(), g);
  });
  const outOpts = [];
  const origOpts = (original && Array.isArray(original.opts)) ? original.opts : [];

  origOpts.forEach(g => {
    const tg = optMap.get(String(g.id)) || optNameMap.get(String(g.name).trim().toLowerCase());
    const chMap = new Map();
    const chNameMap = new Map();
    if (tg && Array.isArray(tg.choices)) {
      tg.choices.forEach(ch => {
        if (ch && ch.id) chMap.set(String(ch.id), ch);
        if (ch && ch.name) chNameMap.set(String(ch.name).trim().toLowerCase(), ch);
      });
    }
    outOpts.push(Object.assign({}, g, {
      name: (tg && tg.name ? String(tg.name).slice(0, 80).trim() : g.name),
      choices: (g.choices || []).map(ch => {
        const tch = chMap.get(String(ch.id)) || chNameMap.get(String(ch.name).trim().toLowerCase());
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

  const targetLang = canonicalMenuLang(body.targetLang || body.lang || 'fr');
  if (!targetLang || !isMenuLang(targetLang)) return json({ ok: false, error: 'target-lang' }, 400);

  const who = await tenantFor(request, env, body.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  if (!(await quotaOk(env, who, 'menutranslate', DAILY_CAP))) {
    return json({ ok: false, error: 'quota' }, 429);
  }

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

  const parsed = extractJson(aiRes) || parseModelResponse(aiRes);
  const validated = parsed ? applyGlossary(validateTranslation(parsed, body), body, targetLang) : null;
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
