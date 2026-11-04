#!/usr/bin/env node
/* Rulings 2 and 3, dashboard half: the return-window field and the pressing
 * B2B rate are real settings on a live account. Runs the real editor modules
 * and the real policy module against a stubbed store and a minimal DOM. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let doc = {}, saves = [], pulls = 0, cloudAnswer = { ok: true, status: 200 };
const store = { get: () => doc, set: (next) => { doc = next; }, subscribe() {},
  cloud: () => ({ pull: async () => { pulls++; }, save: async (data) => { saves.push(data); return cloudAnswer; } }) };
let real = true;
globalThis.KiwiStore = { currentVenue: () => 'v1', define: () => store };
globalThis.KiwiEnv = { isReal: () => real };
const toasts = [];
const input = (value) => ({ value, min: '', max: '', step: '', parentElement: null });
let returnsInput = input('');
const host = { _html: '', set innerHTML(h) { this._html = h; returnsInput = input(/value="(\d+)"/.exec(h)?.[1] || ''); }, get innerHTML() { return this._html; } };
globalThis.document = { activeElement: null, visibilityState: 'hidden', addEventListener() {},
  querySelector: (sel) => sel === '[data-ret-policy-real]' ? host : sel === '#retPolicy input[type="number"]' ? returnsInput : null };
globalThis.window = globalThis;
globalThis.Kiwi = { toast: (title, o) => toasts.push({ title, ...o }) };
globalThis.setInterval = () => 0;       // the policy module re-reads the owner copy every minute: no timer in a test
globalThis.KiwiPolicies = require('../assets/merchant-policies.js');
const P = globalThis.KiwiPolicies;
const returns = await import('../assets/pages-pro/returns-policy.js?v=2');

// Policy module: a live account pulls first, keeps the other field, sends one explicit save.
doc = { pressingB2bPercent: 12 };
let r = await P.save({ returnWindowDays: 21 });
assert.equal(r.ok, true); assert.ok(pulls >= 1, 'it reads the owner copy first');
assert.deepEqual(saves.at(-1), { pressingB2bPercent: 12, returnWindowDays: 21 }, 'both settings travel, neither is lost');
assert.equal(P.returnWindowDays(), 21); assert.equal(P.pressingB2bPercent(), 12);
await assert.rejects(() => P.save({}), /policies-empty/);
// A demo account stays local and never calls the server.
real = false; saves = [];
r = await P.save({ returnWindowDays: 5 }); assert.equal(r.localOnly, true); assert.equal(saves.length, 0); assert.equal(P.returnWindowDays(), 5);
real = true;
// Out-of-range input is clamped when written, never stored raw.
await P.save({ returnWindowDays: 400, pressingB2bPercent: 80 });
assert.deepEqual(saves.at(-1), { returnWindowDays: 90, pressingB2bPercent: 50 });

// Return-policy editor.
doc = { returnWindowDays: 14 };
await returns.mount();
assert.equal(returnsInput.value, '14', 'the field shows the stored window, not a hard-coded 7');
assert.ok(host.innerHTML.includes('data-action="ret-policy-save"'));
saves = [];
for (const bad of ['', '91', '-1', '2.5', 'abc']) { returnsInput.value = bad; toasts.length = 0; await returns.save(); assert.equal(saves.length, 0, `"${bad}" is not sent`); assert.equal(toasts[0].type, 'warn'); }
returnsInput.value = '0'; toasts.length = 0; await returns.save();
assert.equal(saves.at(-1).returnWindowDays, 0, '0 is a valid window');
assert.equal(toasts[0].type, 'success'); assert.match(toasts[0].desc, /accord/);
cloudAnswer = { ok: false, status: 0, offline: true }; toasts.length = 0; returnsInput.value = '10';
await returns.save(); assert.equal(toasts[0].type, 'warn', 'an unconfirmed save is reported as not saved, never as success');
cloudAnswer = { ok: true, status: 200 };

// Pressing B2B card.
const card = { _html: '', setAttribute() {}, set innerHTML(h) { this._html = h; this.rate = input(/data-pxd-b2b-rate value="([\d.]+)"/.exec(h)?.[1]); this.save = { onclick: null }; this.note = { textContent: '' }; }, get innerHTML() { return this._html; },
  querySelector(sel) { return sel === '[data-pxd-b2b-rate]' ? this.rate : sel === '[data-pxd-b2b-save]' ? this.save : sel === '[data-pxd-b2b-note]' ? this.note : null; } };
const editor = { parentElement: { querySelector: () => null, insertBefore() {} } };
globalThis.document.createElement = () => card;
const pressing = await import('../assets/pressing-b2b-card.js?v=2');
doc = { pressingB2bPercent: 12.5 };
await pressing.mount(editor);
assert.equal(card.rate.value, '12.5', 'the card shows the stored rate');
saves = []; card.rate.value = '60'; await card.save.onclick(); assert.equal(saves.length, 0, '60 % is refused'); assert.match(card.note.textContent, /0 et 50/);
card.rate.value = '12,5'; await card.save.onclick(); assert.equal(saves.at(-1).pressingB2bPercent, 12.5, 'a decimal comma is read');
card.rate.value = '0'; await card.save.onclick(); assert.equal(saves.at(-1).pressingB2bPercent, 0, '0 % is a valid rate');
console.log('✓ policy editors: live return window and B2B rate, validation, honest failure');
