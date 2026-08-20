// /api/ai/salle-import — lecture d'une photo de salle pour préparer le plan de salle.
//
// Le restaurateur photographie sa salle (ou un croquis dessiné à la main) et le
// modèle vision en extrait les FAITS : combien de tables, quelles formes,
// combien de places, intérieur ou terrasse, comptoir visible. Jamais de
// coordonnées — un modèle vision compte bien mais place mal. C'est le
// générateur de plans existant (assets/floorplan-core.js › pdsGeneratePlan)
// qui transforme ces faits en trois plans propres, allées garanties, que le
// commerçant compare et confirme. RIEN n'est écrit dans le plan avant cela.
//
// Même modèle de sécurité que /api/ai/menu-import :
// - tenantFor() obligatoire (session gérant, caisse appairée, ou opérateur)
// - quota partagé dans ai_usage_kind(merchant, day, kind) via _quota.js
// - fail-soft : code d'erreur précis, le questionnaire du plan reste le repli
// - AUCUN log du contenu de la photo (confidentialité marchande absolue)

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { runAiWithGateway, runWithFallback } from './_run.js';
import { parseModelResponse } from './invoice.js';

/* Le même modèle vision que le scan de cartes — vérifié sur photos réelles. */
export const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
/* Le duo texte du repêchage : le modèle vision décrit parfois la salle en
 * prose française au lieu du JSON demandé (vérifié sur croquis réel : « 8
 * tables rondes de 4 places et 4 tables carrées de 2 places » — la bonne
 * réponse, dans le mauvais format). Le modèle texte structure alors cette
 * prose ; sa discipline JSON est prouvée par menu-import. */
export const TEXT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const TEXT_FALLBACK_MODEL = '@cf/zai-org/glm-4.7-flash';

const MAX_TOKENS = 2200;
const TEMPERATURE = 0.1;
const DAILY_CAP = 20;
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
  for (let i = 0; i < Math.min(rows.length, 24); i++) {
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
    tables.push({ shape, seats, count });
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

const SYSTEM_PROMPT = `Tu analyses la photo d'un espace de restauration (salle, terrasse, café, snack…) ou le croquis d'un plan de salle, pour préparer un plan de salle numérique.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte d'introduction ni commentaire, avec cette structure exacte :
{
  "venue": "restaurant",
  "outdoor": false,
  "counter": false,
  "tables": [ { "shape": "round", "seats": 4, "count": 3 } ]
}
Règles :
- "venue" : "restaurant", "cafe", "snack", "patisserie" ou "rooftop" — le type d'établissement le plus probable.
- "outdoor" : true si l'espace est en extérieur (terrasse, patio, toit).
- "counter" : true si un comptoir ou un bar de service est visible.
- "tables" regroupe les tables par forme et nombre de places : "count" = combien de tables identiques.
- "shape" : "round" (ronde), "square" (carrée), "rect" (rectangulaire), "bar" (place assise au comptoir), "high" (mange-debout / table haute).
- "seats" = places assises par table, chaises visibles comprises ; estime si une table est partiellement visible.
- Compte TOUTES les tables visibles, même partiellement ou en arrière-plan.
- Si l'image ne montre ni un espace de restauration ni un croquis de salle, réponds {"error":"not-a-room"}.`;

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
 * l'autre : forme OpenAI, puis repli sur la forme native — même stratégie
 * multi-formes que menu-import.js. */
async function runVision(env, dataUrl) {
  try { return await runVisionOnce(env, dataUrl); }
  catch (e) {
    if (await agreeIfGated(env, e)) return await runVisionOnce(env, dataUrl);
    throw e;
  }
}

async function runVisionOnce(env, dataUrl) {
  const openaiShape = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Voici la photo de la salle. Extrais les faits.' },
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
    const nativeShape = { prompt: SYSTEM_PROMPT + '\n\nVoici la photo de la salle. Extrais les faits.', image: bytes, max_tokens: MAX_TOKENS };
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

  /* Photos uniquement : une salle ne se décrit pas par URL, et le repli texte
   * existe déjà — c'est le questionnaire du générateur. */
  const dataUrl = String(body.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return json({ ok: false, error: 'bad-image' }, 400);
  if (dataUrl.length > MAX_IMAGE_DATAURL) return json({ ok: false, error: 'image-too-big' }, 413);

  if (!(await quotaOk(env, who, 'salleimport', DAILY_CAP))) return json({ ok: false, error: 'quota' }, 429);

  let aiRes;
  try {
    const r = await runVision(env, dataUrl);
    aiRes = r.result;
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
      } catch (_) { /* le « illisible » ci-dessous reste le repli */ }
    }
  }

  if (!validated) {
    /* Le début brut de la réponse du modèle, borné, rendu au commerçant
     * authentifié qui vient de l'engendrer — c'est SA photo et SA réponse.
     * Sans lui, « illisible » est indiagnosticable depuis le navigateur. */
    let raw = '';
    try { raw = (typeof aiRes === 'string' ? aiRes : JSON.stringify(aiRes)).slice(0, 240); } catch (_) {}
    return json({ ok: false, reason: 'unparsed', detail: raw }, 200, { 'x-kiwi-ai-model': VISION_MODEL });
  }
  if (validated.error) {
    return json({ ok: false, reason: 'not-a-room' }, 200, { 'x-kiwi-ai-model': VISION_MODEL });
  }

  return json({
    ok: true,
    venue: validated.venue,
    outdoor: validated.outdoor,
    counter: validated.counter,
    tables: validated.tables,
    tableCount: validated.tableCount,
  }, 200, { 'x-kiwi-ai-model': VISION_MODEL });
}
