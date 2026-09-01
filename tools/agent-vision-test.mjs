// agent-vision-test — l'attachement photo et analyse visuelle de l'assistant :
// l'endpoint est fermé (session, quota, models @cf/), le client gère le drop/coller/resize,
// et le câblage HTML/SW porte le nouveau fichier avec estampille.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const vision = read('assets/agent-vision.js');
const fn = read('functions/api/ai/vision-inspect.js');
const quota = read('functions/api/ai/_quota.js');
const dashboard = read('dashboard.html');
const sw = read('kiwi-sw.js');

const controls = [
  // ── l'endpoint : fermé, borné, fail-soft ──────────────────────────────
  ['vision inspection requires a tenant session', fn.includes('tenantFor(request, env, b?.merchant)') && fn.includes("json({ ok: false, error: 'auth' }, 401)")],
  ['a missing AI binding is named, never a 500', fn.includes("json({ ok: false, error: 'unbound' }, 503)")],
  ['the daily quota uses visioninspect kind in _quota.js', fn.includes("quotaOk(env, who, 'visioninspect'") && /visioninspect:\s*\d+/.test(quota)],
  ['image input is size-bounded', fn.includes('MAX_IMAGE_DATAURL')],
  ['primary model is @cf/zai-org/glm-5.3-flash with vision fallback', fn.includes("'@cf/zai-org/glm-5.3-flash'") && fn.includes("'@cf/meta/llama-3.2-11b-vision-instruct'")],
  ['the model call rides the shared AI gateway', fn.includes('runAiWithGateway')],
  ['output validator sanitizes docType, entities, and actions', fn.includes('validateVisionData') && fn.includes('safeDocType') && fn.includes('suggestedActions')],
  // ── le client : interface, interactions, ergonomie ───────────────────
  ['the attach button reaches both the hero box and the assistant drawer', vision.includes(".querySelectorAll('.fa-inputwrap')") && vision.includes(".querySelectorAll('.hai-input')")],
  ['client handles drag and drop with dragover highlighting', vision.includes('dragenter') && vision.includes('dragover') && vision.includes('kv-dragover')],
  ['client handles clipboard paste of images', vision.includes("input.addEventListener('paste'") && vision.includes('clipboardData')],
  ['client resizes oversized photos before upload', vision.includes('MAX_DIM') && vision.includes('canvas.toDataURL')],
  ['preview chip allows user to review and remove attachment before sending', vision.includes('kv-attach-chip') && vision.includes('kv-attach-del')],
  ['result renders interactive 1-click action buttons', vision.includes('data-kv-action') && vision.includes('handleActionResult')],
  ['drawer composer born after load is still wired', vision.includes('MutationObserver')],
  // ── le câblage : la coquille et le HTML s'accordent ───────────────────
  ['dashboard loads the vision layer with a stamp', /assets\/agent-vision\.js\?v=\d+/.test(dashboard)],
  ['the offline shell precaches the same stamped URL', (() => {
    const m = dashboard.match(/assets\/agent-vision\.js\?v=(\d+)/);
    return !!m && sw.includes(`'/assets/agent-vision.js?v=${m[1]}'`);
  })()],
];

for (const [name, ok] of controls) assert.equal(ok, true, name);
console.log(`agent-vision-test: ${controls.length} controls passed`);
