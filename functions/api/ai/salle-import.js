// /api/ai/salle-import — lecture d'une photo de salle pour préparer le plan de salle.
//
// Le restaurateur photographie sa salle (ou un croquis dessiné à la main) et le
// modèle vision suggère les tables et leur ordre approximatif, de gauche à
// droite et de l’avant vers le fond. Aucune mesure n’est reconstruite. Le
// commerçant vérifie les positions et confirme avant toute écriture du plan.
//
// Même modèle de sécurité que /api/ai/menu-import :
// - tenantFor() obligatoire (session gérant, caisse appairée, ou opérateur)
// - quota partagé dans ai_usage_kind(merchant, day, kind) via _quota.js
// - fail-soft : code d'erreur précis, le questionnaire du plan reste le repli
// - AUCUN log du contenu de la photo (confidentialité marchande absolue)

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk, quotaBody, DAILY_CAPS } from './_quota.js';
import { runWithFallback } from './_run.js';
import { visionMessages, runVisionPair } from './_vision.js';
import { parseModelResponse } from './invoice.js';

/* Le même duo vision que le scan de cartes : GLM 5.3 Flash (natif multimodal)
 * d'abord, Gemma 4 26B en secours. Avant : llama-3.2-11b-vision (2024) seul.
 * Les formes de requête par modèle vivent dans _vision.js. */
/* Lecture de photo : GLM 5.3 Flash devant, Gemma 4 26B en secours, comme les
 * sept autres routes vision. Mesuré le 2026-10-11 par `node tools/ai-model-eval.mjs`
 * (vrais modèles, 6 fixtures × 2 passages) : GLM 100 % de prix exacts et
 * PRIMARY-READY ; Llama 3.2 vision, l'ancien lecteur, lisait la carte mais la
 * rendait en Markdown au lieu du JSON demandé (3 % de prix exacts), et ce
 * n'est pas une erreur d'appel : le secours ne se déclenchait jamais, le
 * marchand voyait « lecture impossible ». Gemma lit juste quand il répond
 * (0,965 à 1,000) mais lentement (médiane 41 s) : il ne sert que si GLM tombe. */
export const VISION_MODEL = '@cf/zai-org/glm-5.3-flash';
export const VISION_FALLBACK_MODEL = '@cf/google/gemma-4-26b-a4b-it';
/* Le duo texte du repêchage : le modèle vision décrit parfois la salle en
 * prose française au lieu du JSON demandé (vérifié sur croquis réel : « 8
 * tables rondes de 4 places et 4 tables carrées de 2 places » — la bonne
 * réponse, dans le mauvais format). Le modèle texte structure alors cette
 * prose ; sa discipline JSON est prouvée par menu-import. */
export const TEXT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const TEXT_FALLBACK_MODEL = '@cf/zai-org/glm-4.7-flash';

/* Le JSON d'une salle est minuscule, mais GLM raisonne avant de répondre
 * (reasoning_effort 'low' le borne, pas à zéro) : 2 200 laissait peu de marge. */
const MAX_TOKENS = 3000;
const TEMPERATURE = 0.1;
const DAILY_CAP = DAILY_CAPS.salleimport;
const MAX_IMAGE_DATAURL = 2_600_000; // ~1,9 Mo binaire — le client réduit avant envoi

/* ── Validation et bornage strict des faits extraits ─────────────────────────
 * Garantit : formes dans la liste blanche, 1–12 places, 1–60 tables par ligne,
 * 120 tables au total, type d'établissement connu. Le générateur en aval ne
 * voit jamais une valeur hors bornes. */
export function validateSalle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.error) return { error: String(raw.error).slice(0, 40) };
  const SHAPES = new Set(['round', 'square', 'rect', 'bar', 'high']);
  const VENUES = new Set(['restaurant', 'cafe', 'snack', 'patisserie', 'rooftop']);
  const rows = Array.isArray(raw.tables) ? raw.tables : [];
  const tables = [];
  let total = 0;
  for (let i = 0; i < Math.min(rows.length, 120); i++) {
    const r = rows[i];
    if (!r || typeof r !== 'object') continue;
    const shape = String(r.shape || '').toLowerCase().trim();
    if (!SHAPES.has(shape)) continue;
    let seats = Math.round(Number(r.seats));
    if (!Number.isFinite(seats)) seats = 4;
    seats = Math.max(1, Math.min(12, seats));
    let count = Math.round(Number(r.count));
    if (!Number.isFinite(count) || count < 1) count = 1;
    count = Math.min(60, count);
    if (total + count > 120) count = 120 - total;
    if (count < 1) break;
    total += count;
    const placement = {};
    for (const key of ['row', 'column']) {
      if (Number.isInteger(r[key]) && r[key] >= 0 && r[key] <= 119) placement[key] = r[key];
    }
    if (['front', 'middle', 'back'].includes(r.zone)) placement.zone = r.zone;
    tables.push({ shape, seats, count, ...placement });
  }
  if (!tables.length) return null;
  const venueRaw = String(raw.venue || '').toLowerCase().trim();
  return {
    venue: VENUES.has(venueRaw) ? venueRaw : 'restaurant',
    outdoor: raw.outdoor === true,
    counter: raw.counter === true,
    tables,
    tableCount: total,
  };
}

/* Le texte brut d'une réponse Workers AI, quelle que soit sa forme — pour le
 * repêchage prose→JSON, là où parseModelResponse ne cherche que du JSON. */
function rawText(aiRes) {
  if (typeof aiRes === 'string') return aiRes;
  if (aiRes && typeof aiRes.response === 'string') return aiRes.response;
  const c = aiRes && aiRes.choices && aiRes.choices[0];
  if (c && c.message && typeof c.message.content === 'string') return c.message.content;
  return '';
}

export const SYSTEM_PROMPT = `Tu analyses la photo d'un espace de restauration (salle, terrasse, café, snack…) ou le croquis d'un plan de salle, pour préparer un plan de salle numérique.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte d'introduction ni commentaire, avec cette structure exacte :
{
  "venue": "restaurant",
  "outdoor": false,
  "counter": false,
  "tables": [ { "shape": "round", "seats": 4, "count": 1, "row": 0, "column": 0, "zone": "front" } ]
}
Règles :
- "venue" : "restaurant", "cafe", "snack", "patisserie" ou "rooftop" · le type d'établissement le plus probable.
- "outdoor" : true si l'espace est en extérieur (terrasse, patio, toit).
- "counter" : true si un comptoir ou un bar de service est visible.
- "tables" suit l’ordre visible, de gauche à droite et de l’avant vers le fond. Une entrée par table si possible (count: 1). Indique row et column (entiers de 0 à 119) ou zone (front, middle, back) pour conserver le placement approximatif. Ne fournis aucune mesure ni reconstruction métrique. Ce sera un plan suggéré à vérifier dans la salle.
- "shape" : "round" (ronde), "square" (carrée), "rect" (rectangulaire), "bar" (place assise au comptoir), "high" (mange-debout / table haute).
- "seats" = places assises par table, chaises visibles comprises ; estime si une table est partiellement visible.
- Compte TOUTES les tables visibles, même partiellement ou en arrière-plan.
- Si l'image ne montre ni un espace de restauration ni un croquis de salle, réponds {"error":"not-a-room"}.`;

/* La requête vision, au format GLM : le secours Gemma la reçoit traduite par
 * payloadForModel() (sans reasoning_effort, absent de son schéma). Exportée
 * pour tools/ai-model-eval.mjs, qui rejoue le VRAI prompt. */
export function buildSallePayload(dataUrl) {
  return {
    messages: visionMessages({
      system: SYSTEM_PROMPT,
      text: 'Voici la photo de la salle. Extrais les faits.',
      dataUrl,
    }),
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    reasoning_effort: 'low',
  };
}

export async function runVision(env, dataUrl) {
  return runVisionPair(env, VISION_MODEL, VISION_FALLBACK_MODEL, buildSallePayload(dataUrl));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = null;
  try { body = await request.json(); } catch (_) { body = null; }
  if (!body) return json({ ok: false, error: 'body' }, 400);

  const who = await tenantFor(request, env, body.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  /* Photos uniquement : une salle ne se décrit pas par URL, et le repli texte
   * existe déjà — c'est le questionnaire du générateur. */
  const dataUrl = String(body.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return json({ ok: false, error: 'bad-image' }, 400);
  if (dataUrl.length > MAX_IMAGE_DATAURL) return json({ ok: false, error: 'image-too-big' }, 413);

  if (!(await quotaOk(env, who, 'salleimport', DAILY_CAP))) return json(quotaBody('salleimport'), 429);

  let aiRes;
  let usedModel = VISION_MODEL;
  try {
    const r = await runVision(env, dataUrl);
    aiRes = r.result;
    usedModel = r.model;
  } catch (e) {
    /* Jamais un statut 5xx ici : l'edge Cloudflare REMPLACE un 502 rendu par
     * la Function par sa propre page HTML, et le navigateur ne voit jamais
     * notre JSON. Un 200 { ok:false } passe intact. Le détail est le message
     * d'erreur du binding AI (jamais le contenu de la photo). */
    const detail = String((e && e.message) || e || '').slice(0, 200);
    return json({ ok: false, reason: 'model', detail }, 200, { 'x-kiwi-ai-model': VISION_MODEL });
  }

  let parsed = parseModelResponse(aiRes);
  let validated = parsed ? validateSalle(parsed) : null;

  /* Repêchage : la réponse vision est de la prose, pas du JSON. Le modèle
   * texte la structure avec le même schéma — un appel de plus, seulement
   * quand le premier format a échoué. */
  if (!validated) {
    const prose = rawText(aiRes);
    if (prose && prose.length > 20) {
      /* Le repêchage est un deuxième appel de modèle : il se compte comme le
       * premier, et le plafond du jour le borne aussi. */
      if (!(await quotaOk(env, who, 'salleimport', DAILY_CAP))) return json(quotaBody('salleimport'), 429);
      try {
        const r2 = await runWithFallback(env, TEXT_MODEL, TEXT_FALLBACK_MODEL, {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: 'Voici la description de la salle :\n\n' + prose.slice(0, 4000) },
          ],
          max_tokens: 900,
          temperature: TEMPERATURE,
        });
        parsed = parseModelResponse(r2.result);
        validated = parsed ? validateSalle(parsed) : null;
      } catch (_) {
        return json({ ok: false, reason: 'model', stage: 'interpretation', detail: 'interpretation-service-failed' }, 200, { 'x-kiwi-ai-model': usedModel });
      }
    }
  }

  if (!validated) {
    /* Le début brut de la réponse du modèle, borné, rendu au commerçant
     * authentifié qui vient de l'engendrer — c'est SA photo et SA réponse.
     * Sans lui, « illisible » est indiagnosticable depuis le navigateur. */
    let raw = '';
    try { raw = (typeof aiRes === 'string' ? aiRes : JSON.stringify(aiRes)).slice(0, 240); } catch (_) {}
    return json({ ok: false, reason: 'unparsed', detail: raw }, 200, { 'x-kiwi-ai-model': usedModel });
  }
  if (validated.error) {
    return json({ ok: false, reason: 'not-a-room' }, 200, { 'x-kiwi-ai-model': usedModel });
  }

  return json({
    ok: true,
    venue: validated.venue,
    outdoor: validated.outdoor,
    counter: validated.counter,
    tables: validated.tables,
    tableCount: validated.tableCount,
  }, 200, { 'x-kiwi-ai-model': usedModel });
}
