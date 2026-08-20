// agent-voice-test — la dictée vocale de l'assistant tient ses trois murs :
// l'endpoint est fermé (session, quota, binding nommé), le client sait
// retomber sur le navigateur, et le câblage HTML/SW porte le nouveau fichier.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const voice = read('assets/agent-voice.js');
const fn = read('functions/api/ai/voice.js');
const quota = read('functions/api/ai/_quota.js');
const dashboard = read('dashboard.html');
const sw = read('kiwi-sw.js');

const controls = [
  // ── l'endpoint : fermé, borné, fail-soft ──────────────────────────────
  ['transcription requires a tenant session', fn.includes('tenantFor(request, env, body.merchant)') && fn.includes("json({ ok: false, error: 'auth' }, 401)")],
  ['a missing AI binding is named, never a 500', fn.includes("json({ ok: false, error: 'unbound' }, 503)")],
  ['the daily quota uses the reserved transcribe kind', fn.includes("quotaOk(env, who, 'transcribe', DAILY_CAPS.transcribe)") && /transcribe:\s*\d+/.test(quota)],
  ['audio input is size- and shape-bounded', fn.includes('MAX_B64') && fn.includes('B64_RX.test(audio)')],
  ['whisper turbo first, legacy whisper as fallback', fn.includes("'@cf/openai/whisper-large-v3-turbo'") && fn.includes("'@cf/openai/whisper'")],
  ['a language hint is whitelisted, never relayed raw', fn.includes('LANGS.has(body.lang)')],
  ['the model call rides the shared AI gateway', fn.includes('runAiWithGateway')],
  // ── le client : deux compositeurs, un secours, jamais d'erreur brute ──
  ['the mic reaches both the hero box and the assistant drawer', voice.includes(".querySelectorAll('.fa-inputwrap')") && voice.includes(".querySelectorAll('.hai-input')")],
  ['the transcript is delivered and sent, not just typed', voice.includes('ctx.send.click()')],
  ['browser speech recognition is the fallback path', voice.includes('webkitSpeechRecognition') && voice.includes('browserDictate')],
  ['a dead endpoint flips later dictations to the browser', voice.includes('preferBrowser = true')],
  ['recording is capped so a stuck mic cannot upload forever', voice.includes('MAX_RECORD_MS')],
  ['the drawer composer born after load is still wired', voice.includes('MutationObserver')],
  ['the toast does not depend on window.Kiwi.toast', voice.includes('function toast(') && voice.includes('document.createElement')],
  // ── le câblage : la coquille et le HTML s'accordent ───────────────────
  ['dashboard loads the voice layer with a stamp', /assets\/agent-voice\.js\?v=\d+/.test(dashboard)],
  ['the offline shell precaches the same stamped URL', (() => {
    const m = dashboard.match(/assets\/agent-voice\.js\?v=(\d+)/);
    return !!m && sw.includes(`'/assets/agent-voice.js?v=${m[1]}'`);
  })()],
];

for (const [name, ok] of controls) assert.equal(ok, true, name);
console.log(`agent-voice-test: ${controls.length} controls passed`);
