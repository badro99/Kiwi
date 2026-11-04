#!/usr/bin/env node
/* Hotel monthly review: the manager code and the corrective reason are asked in
 * the product's modal, not window.prompt (r18 hotel#1).
 *
 * Runs the real sheet (assets/hotel/review-proof.mjs) on a minimal DOM, and the
 * real postReview lifted from the shipped assets/hotel.js with a
 * window.prompt that throws: the old flow would blow up on the first call. The
 * code is only ever sent to the server request, never compared or logged here. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { shippedFunction } from './shipped-function.mjs';

const ROOT = new URL('../', import.meta.url);
const tx = (s) => s;

function sheet({ withReason }) {
  let mutate = () => {};
  globalThis.MutationObserver = class { constructor(cb) { mutate = cb; } observe() {} disconnect() {} };
  const state = { in: true, connected: true, closed: 0, bodyHtml: '' };
  const errorBox = { textContent: '' };
  const form = { onsubmit: null, elements: { pin: { value: '' }, reason: { value: '', focus() { state.focused = true; } } } };
  const el = { classList: { contains: () => state.in }, get isConnected() { return state.connected; },
    querySelector: (sel) => (sel === 'form' ? form : sel === '[data-review-error]' ? errorBox : null) };
  const kit = { modal: (opts) => { state.bodyHtml = opts.body; state.title = opts.title; return { el, close: () => { state.closed++; } }; } };
  return import(pathToFileURL(new URL('assets/hotel/review-proof.mjs', ROOT).pathname).href).then(({ reviewProof }) => {
    const promise = reviewProof(kit, tx, { withReason });
    return { promise, form, errorBox, state, dismiss: () => { state.in = false; mutate(); }, submit: () => form.onsubmit({ preventDefault() {} }) };
  });
}

// 1. A finalize asks for the code only and hands it back, then clears the field.
{
  const s = await sheet({ withReason: false });
  assert.ok(!s.state.bodyHtml.includes('name="reason"'), 'finalize: no reason field');
  assert.ok(s.state.bodyHtml.includes('name="pin"') && s.state.bodyHtml.includes('type="password"'), 'the code is a masked field');
  s.form.elements.pin.value = '4321';
  s.submit();
  assert.deepEqual(await s.promise, { pin: '4321', reason: '' });
  assert.equal(s.form.elements.pin.value, '', 'the code does not stay in the field after the sheet');
  assert.equal(s.state.closed, 1);
}
// 2. A corrective revision needs a reason of 10 characters; a short one keeps the sheet open and says why.
{
  const s = await sheet({ withReason: true });
  assert.ok(s.state.bodyHtml.includes('name="reason"'));
  s.form.elements.reason.value = 'trop bref';
  s.submit();
  assert.equal(s.errorBox.textContent, 'Un motif d’au moins 10 caractères est obligatoire.');
  assert.equal(s.state.closed, 0, 'the sheet stays open');
  s.form.elements.reason.value = '  Erreur de saisie sur deux séjours  ';
  s.form.elements.pin.value = '1111';
  s.submit();
  assert.deepEqual(await s.promise, { pin: '1111', reason: 'Erreur de saisie sur deux séjours' });
}
// 3. Dismissing the sheet (close button, Escape, Annuler) resolves null.
{
  const s = await sheet({ withReason: false });
  s.form.elements.pin.value = '9999';
  s.dismiss();
  assert.equal(await s.promise, null);
  assert.equal(s.form.elements.pin.value, '');
}

// 4. The shipped flow: postReview asks, then sends the code to the server, nothing prompts.
const hotel = fs.readFileSync(new URL('assets/hotel.js', ROOT), 'utf8');
function flow({ proof }) {
  const requests = [], toasts = [];
  const pending = new Map();
  const globals = {
    prompt: () => { throw new Error('window.prompt must not be used'); },
    tx, pendingReviewKeys: pending, activeMonth: '2026-10', slug: 'riad-test',
    crypto: { randomUUID: () => 'uuid-1' }, JSON, Map, Object, String,
    m: { el: { querySelector: () => null } }, toast: (...a) => toasts.push(a), load: () => {}, esc: String,
    serverExceptionsHtml: () => '',
    fetch: async (url, init) => { requests.push([url, JSON.parse(init.body)]); return { ok: true, status: 200, json: async () => ({ declaration: { revision: 2 } }) }; },
  };
  const postReview = shippedFunction(hotel, 'postReview', globals);
  const asked = [];
  const ask = async (opts) => { asked.push(opts); return proof; };
  const btn = { disabled: false };
  return { run: () => postReview(globals._action, btn, ask), requests, asked, toasts, set: (a) => { globals._action = a; } };
}
{
  const f = flow({ proof: { pin: '2468', reason: '' } }); f.set('finalize');
  await f.run();
  assert.equal(JSON.stringify(f.asked), '[{"withReason":false}]');
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0][0], '/api/hotel/declarations');
  assert.equal(f.requests[0][1].pin, '2468', 'the code travels to the server for verification');
  assert.equal(f.requests[0][1].action, 'finalize');
}
{
  const f = flow({ proof: { pin: '', reason: 'Erreur de saisie sur deux séjours' } }); f.set('rectify');
  await f.run();
  assert.equal(JSON.stringify(f.asked), '[{"withReason":true}]');
  assert.equal(f.requests[0][1].rectificationReason, 'Erreur de saisie sur deux séjours');
  assert.equal(f.requests[0][1].pin, '');
}
{
  const f = flow({ proof: null }); f.set('finalize');
  await f.run();
  assert.equal(f.requests.length, 0, 'a dismissed sheet sends nothing');
}
console.log('✓ hotel-review-proof-test : le code manager et le motif se demandent dans la fenêtre Kiwi, jamais window.prompt');
