// /api/ai/voice — la dictée vocale de l'assistant : un enregistrement audio
// entre, un texte transcrit sort. Whisper sur Workers AI, même binding, même
// passerelle, même discipline que /api/ai/ask.
//
// Pourquoi côté serveur et pas l'API du navigateur ? La reconnaissance du
// navigateur (webkitSpeechRecognition) comprend un français d'école et perd
// pied dès que le commerçant glisse en darija ou mélange les deux dans la même
// phrase — ce qui est la façon dont nos clients parlent réellement.
// whisper-large-v3-turbo est multilingue, détecte la langue tout seul et tient
// le mélange. Le navigateur reste le SECOURS côté client quand cet endpoint
// répond 503/429 — jamais l'inverse.
//
// Confiance : tenantFor(), la même règle unique que /api/store et /api/ai/ask.
// Un endpoint facturé à l'appel n'a rien à faire ouvert ; une session de démo
// et un anonyme prennent un 401.
//
// Fail-soft, comme tout functions/ : binding absent → 'unbound' 503, quota du
// jour épuisé → 'quota' 429, modèle en panne → 'model' 502. Jamais une pile
// d'erreur — le client sait retomber sur la reconnaissance du navigateur.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk, DAILY_CAPS } from './_quota.js';
import { runAiWithGateway } from './_run.js';

/* Turbo d'abord : ~8× plus rapide que le grand modèle pour une qualité
 * multilingue équivalente sur de la dictée courte. Le whisper historique en
 * secours — il prend l'audio en tableau d'octets, pas en base64, d'où le
 * second payload dans transcribe(). */
export const MODEL = '@cf/openai/whisper-large-v3-turbo';
export const FALLBACK_MODEL = '@cf/openai/whisper';

/* Une dictée à l'assistant dure quelques secondes ; le client coupe à 60 s.
 * 2 Mo de base64 (~1,5 Mo d'audio, plusieurs minutes d'opus) est déjà large —
 * au-delà c'est un client bricolé, pas un micro. */
const MAX_B64 = 2 * 1024 * 1024;
const B64_RX = /^[A-Za-z0-9+/=]+$/;

/* Indice de langue optionnel. Whisper détecte seul — on ne transmet que ce
 * qu'on connaît, tout le reste est ignoré, jamais relayé au modèle. */
const LANGS = new Set(['fr', 'ar', 'en', 'es']);

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = null;
  try { body = await request.json(); } catch (_) { body = null; }
  if (!body) return json({ ok: false, error: 'body' }, 400);

  const who = await tenantFor(request, env, body.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  const audio = typeof body.audio === 'string' ? body.audio : '';
  if (!audio || audio.length > MAX_B64 || !B64_RX.test(audio)) {
    return json({ ok: false, error: 'audio' }, 400);
  }

  if (!(await quotaOk(env, who, 'transcribe', DAILY_CAPS.transcribe))) {
    return json({ ok: false, error: 'quota' }, 429);
  }

  const language = LANGS.has(body.lang) ? body.lang : '';

  let text = '';
  try {
    text = await transcribe(env, audio, language);
  } catch (_) {
    return json({ ok: false, error: 'model' }, 502);
  }

  return json({ ok: true, text: String(text || '').trim() }, 200, { 'x-kiwi-ai': 'cloud' });
}

/* Les deux Whisper de Workers AI ne parlent pas le même format d'entrée :
 * turbo veut { audio: <base64> }, l'historique veut { audio: [octets…] }.
 * On ne décode le base64 que si le turbo a échoué. */
async function transcribe(env, b64, language) {
  try {
    const payload = { audio: b64 };
    if (language) payload.language = language;
    const r = await runAiWithGateway(env, MODEL, payload);
    return r && r.text;
  } catch (_) {
    const bin = atob(b64);
    const bytes = new Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const r = await runAiWithGateway(env, FALLBACK_MODEL, { audio: bytes });
    return r && r.text;
  }
}
