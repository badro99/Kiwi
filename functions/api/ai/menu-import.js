// /api/ai/menu-import — lecture et extraction structurée d'une carte de restaurant.
//
// Le commerçant apporte sa carte sous la forme qu'il a : photo, PDF, lien vers
// un menu en ligne, ou texte collé. Le serveur normalise tout en texte (ou en
// image pour le modèle vision), appelle Workers AI pour structurer la carte en
// JSON strict, valide et borne chaque champ, puis renvoie des lignes prêtes
// pour la revue d'import côté navigateur (KiwiCatalogImport) — RIEN n'est
// écrit dans la carte avant que le commerçant confirme le plan.
//
// Même modèle de sécurité que /api/ai/invoice :
// - tenantFor() obligatoire (session gérant, caisse appairée, ou opérateur)
// - quota partagé dans ai_usage_kind(merchant, day, kind) via _quota.js
// - fail-soft : code d'erreur précis pour permettre un repli (photo, CSV, saisie)
// - AUCUN log du contenu du menu (confidentialité marchande absolue)

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { runWithFallback, runAiWithGateway } from './_run.js';
// Une seule lecture des réponses Workers AI pour toutes les routes : la forme
// varie (objet déjà parsé, chaîne, clôture ```json, choices[0].message) et
// invoice.js a déjà payé pour l'apprendre.
import { parseModelResponse } from './invoice.js';

/* Même duo que le lecteur de factures : vérifié sur documents réels,
 * ~0,0006 $ l'appel, secours chez un autre éditeur. */
export const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const FALLBACK_MODEL = '@cf/zai-org/glm-4.7-flash';
/* Les photos de menus passent par le modèle vision Cloudflare. */
export const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

const MAX_TOKENS = 4000;
const TEMPERATURE = 0.1;
const TOP_P = 0.9;
const DAILY_CAP = 60;
const MAX_TEXT_CHARS = 40000;
const MAX_IMAGE_DATAURL = 2_600_000; // ~1,9 Mo binaire — le client réduit avant envoi
const MAX_HTML_BYTES = 900_000;
const URL_TIMEOUT_MS = 8000;
/* Sous ce seuil de texte utile, la page est une coquille JavaScript (SPA) que
 * le serveur ne peut pas rendre — on répond 'js-only' et le navigateur propose
 * la photo ou le PDF à la place. */
const MIN_URL_TEXT = 180;

/* ── URL → texte ─────────────────────────────────────────────────────────────
 * Garde SSRF : https uniquement, jamais d'hôte local ou privé. */
export function urlAllowed(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch (_) { return false; }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (h.startsWith('[')) return false; // littéral IPv6
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false; // IP nue : un menu public a un nom
  return true;
}

/* HTML → texte lisible. Pas un parseur complet : on retire ce qui n'est pas du
 * contenu, on préserve les retours de ligne des blocs, on décode les entités
 * courantes. Suffisant pour un menu — le modèle fait le reste. */
export function htmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|head|template)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(br|\/p|\/li|\/tr|\/h[1-6]|\/div|\/section|\/article)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { const c = +n; return c > 31 && c < 65536 ? String.fromCharCode(c) : ' '; })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 31 && c < 65536 ? String.fromCharCode(c) : ' '; });
  s = s.replace(/[ \t\r\f]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

async function fetchUrlText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), URL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KiwiMenuImport/1.0)', 'Accept': 'text/html,*/*' },
    });
    if (!res.ok) return { error: 'url-status' };
    const buf = await res.arrayBuffer();
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_HTML_BYTES));
    const text = htmlToText(html);
    if (text.length < MIN_URL_TEXT) return { error: 'js-only' };
    return { text };
  } catch (_) {
    return { error: 'url-fetch' };
  } finally {
    clearTimeout(timer);
  }
}

/* ── Validation et bornage strict des articles extraits ──────────────────────
 * Garantit : <= 400 articles, nom obligatoire <= 120 car., prix borné et
 * arrondi, catégories courtes, description jamais inventée côté serveur. */
export function validateMenuItems(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = [];
  for (let i = 0; i < Math.min(rawItems.length, 400); i++) {
    const it = rawItems[i];
    if (!it || typeof it !== 'object') continue;
    const name = String(it.name || it.label || '').slice(0, 120).trim();
    if (!name) continue;
    let price = Number(it.price);
    if (!Number.isFinite(price) || price < 0) price = 0;
    price = Math.min(99999, Math.round(price * 100) / 100);
    const entry = {
      name,
      price,
      cat: String(it.cat || it.category || '').slice(0, 60).trim(),
      sub: String(it.sub || it.subcategory || '').slice(0, 60).trim(),
      desc: String(it.desc || it.description || '').slice(0, 400).trim(),
    };
    items.push(entry);
  }
  if (!items.length) return null;
  const currency = String(raw.currency || 'MAD').slice(0, 10).trim() || 'MAD';
  return { currency, items };
}

export function buildSystemPrompt(targetLang = 'fr') {
  const langNames = {
    fr: 'français',
    ar: 'arabe (darija/marocain ou arabe standard)',
    en: 'anglais',
  };
  const targetLabel = langNames[targetLang] || 'français';

  // La cible n'est plus une langue de traduction : on lit la carte telle
  // qu'elle est écrite. La traduction se fait APRÈS, par entrée et par langue,
  // avec une empreinte (assets/menu-i18n.js + /api/ai/menu-translate) — sinon
  // la langue d'origine du patron est perdue à la première lecture.
  void targetLabel;
  return `Tu es un extracteur fidèle de cartes (menus) pour restaurants et cafés au Maroc.
Lis la carte fournie et recopie ses libellés EXACTEMENT tels qu'ils sont écrits, dans leur langue d'origine (français, anglais, arabe, espagnol…) : ne traduis rien, ne reformule rien, ne corrige que les coquilles évidentes de lecture.

Structure JSON stricte à retourner :
{
  "currency": "MAD",
  "items": [
    { "name": "Nom de l'article", "price": 45, "cat": "Catégorie du menu", "sub": "Sous-section si le menu en a", "desc": "Description écrite sur le menu" }
  ]
}
Règles :
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte d'introduction ni commentaire.
- "price" est un nombre (pas une chaîne). Si le prix est absent ou illisible, mets 0.
- Les sections "cat", sous-sections "sub", noms "name" et descriptions "desc" sont recopiés dans la langue où ils sont écrits sur la carte — même si la carte mélange deux langues. La traduction est faite ensuite, ailleurs.
- "sub" seulement si le menu a des sous-sections (ex. "Matcha", "Classics", "All Day Brunch"), sinon chaîne vide.
- "desc" uniquement si une description est écrite sur la carte — sans rien inventer.
- Ignore les adresses, téléphones, horaires, slogans, réseaux sociaux et mentions légales.
- N'omets aucun article : chaque plat ou boisson avec ou sans prix devient une entrée.`;
}

export const SYSTEM_PROMPT = buildSystemPrompt('fr');

function textPayload(text, targetLang = 'fr') {
  const prompt = buildSystemPrompt(targetLang);
  return {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: `Voici la carte :\n\n${text.slice(0, MAX_TEXT_CHARS)}` },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    top_p: TOP_P,
  };
}

/* Les modèles Meta sont sous licence : le premier appel du COMPTE doit être
 * le prompt littéral « agree » (erreur 5016 sinon). Une fois accepté, c'est
 * acquis pour toujours — mais un compte neuf (staging, migration) retombe
 * dessus, donc l'acceptation se rejoue d'elle-même au lieu d'exiger une
 * manipulation console. */
async function agreeIfGated(env, err) {
  if (!/5016|submit the prompt 'agree'/i.test(String((err && err.message) || err || ''))) return false;
  try { await runAiWithGateway(env, VISION_MODEL, { prompt: 'agree' }); return true; }
  catch (_) { return false; }
}

/* Le schéma d'entrée des modèles vision varie d'un modèle Workers AI à
 * l'autre : forme OpenAI (content en tableau de blocs image_url/text) ou forme
 * native (prompt + image en tableau d'octets). On tente la première, on se
 * replie sur la seconde — même philosophie multi-formes que parseModelResponse. */
async function runVision(env, dataUrl, targetLang = 'fr') {
  try { return await runVisionOnce(env, dataUrl, targetLang); }
  catch (e) {
    if (await agreeIfGated(env, e)) return await runVisionOnce(env, dataUrl, targetLang);
    throw e;
  }
}

async function runVisionOnce(env, dataUrl, targetLang = 'fr') {
  const prompt = buildSystemPrompt(targetLang);
  const openaiShape = {
    messages: [
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Voici la photo de la carte. Extrais tous les articles et traduis-les si besoin.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  };
  try {
    return { result: await runAiWithGateway(env, VISION_MODEL, openaiShape), model: VISION_MODEL };
  } catch (_) {
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bin = atob(b64);
    const bytes = new Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const nativeShape = { prompt: prompt + '\n\nVoici la photo de la carte. Extrais tous les articles.', image: bytes, max_tokens: MAX_TOKENS };
    return { result: await runAiWithGateway(env, VISION_MODEL, nativeShape), model: VISION_MODEL };
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = null;
  try { body = await request.json(); } catch (_) { body = null; }
  if (!body) return json({ ok: false, error: 'body' }, 400);

  const who = await tenantFor(request, env, body.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  const kind = String(body.kind || 'text');
  if (kind !== 'text' && kind !== 'url' && kind !== 'image') {
    return json({ ok: false, error: 'unsupported-kind' }, 400);
  }

  if (!(await quotaOk(env, who, 'menuimport', DAILY_CAP))) return json({ ok: false, error: 'quota' }, 429);

  const targetLang = String(body.targetLang || body.lang || 'fr').toLowerCase();

  let aiRes;
  let usedModel = MODEL;

  if (kind === 'image') {
    const dataUrl = String(body.image || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return json({ ok: false, error: 'bad-image' }, 400);
    if (dataUrl.length > MAX_IMAGE_DATAURL) return json({ ok: false, error: 'image-too-big' }, 413);
    try {
      const r = await runVision(env, dataUrl, targetLang);
      aiRes = r.result;
      usedModel = r.model;
    } catch (e) {
      /* Jamais un statut 5xx ici : l'edge Cloudflare REMPLACE un 502 rendu
       * par la Function par sa propre page HTML, et le navigateur ne voit
       * jamais notre JSON. Un 200 { ok:false } passe intact. */
      const detail = String((e && e.message) || e || '').slice(0, 200);
      return json({ ok: false, reason: 'model', detail }, 200, { 'x-kiwi-ai-model': VISION_MODEL });
    }
  } else {
    let text = '';
    if (kind === 'url') {
      const url = String(body.url || '').trim();
      if (!urlAllowed(url)) return json({ ok: false, error: 'bad-url' }, 400);
      const fetched = await fetchUrlText(url);
      if (fetched.error) return json({ ok: false, reason: fetched.error }, 200);
      text = fetched.text;
    } else {
      text = String(body.text || '').trim();
      if (!text) return json({ ok: false, error: 'empty-text' }, 400);
    }
    try {
      const r = await runWithFallback(env, MODEL, FALLBACK_MODEL, textPayload(text, targetLang));
      aiRes = r.result;
      usedModel = r.model;
    } catch (_) {
      return json({ ok: false, reason: 'model' }, 200);
    }
  }

  const parsed = parseModelResponse(aiRes);
  const validated = parsed ? validateMenuItems(parsed) : null;
  if (!validated) {
    return json({ ok: false, reason: 'unparsed' }, 200, { 'x-kiwi-ai-model': usedModel });
  }

  return json({
    ok: true,
    currency: validated.currency,
    count: validated.items.length,
    items: validated.items,
  }, 200, { 'x-kiwi-ai-model': usedModel });
}
