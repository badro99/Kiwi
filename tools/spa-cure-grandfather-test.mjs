#!/usr/bin/env node
/* Ruling 6 (owner, 4 Nov 2026): a legacy spa cure without an expiry date is never
 * expired silently or retroactively. On the first read after the update it gets
 * the standard validity (180 days) counted from that day, recorded with
 * expirySource 'legacy-grandfathered' and the date; staff can edit it; the card
 * shows the date. Real schema, the real pos-spa.js restore and the real editor. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { declaration: scan } = require('./js-declarations.cjs');
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const at = (iso) => Date.parse(iso);

function world(nowIso) {
  let now = at(nowIso);
  class FixedDate extends Date { static now() { return now; } constructor(...a) { if (a.length) super(...a); else super(now); } }
  const saved = [];
  let opts = null;
  const win = { KiwiDayReport: { timezone: () => 'Africa/Casablanca' }, KiwiEnv: { isReal: () => true }, addEventListener() {},
    KiwiVerticalState: { open: (_name, o) => { opts = o; return { save: (label) => saved.push(label), hydrate() {} }; } } };
  const ctx = vm.createContext({ window: win, Date: FixedDate, Intl, Math, Number, String, Object, Array, JSON, RegExp, isFinite, Promise, console, setTimeout, setInterval() {},
    document: { addEventListener() {}, querySelector: () => null, createElement: () => ({ style: {} }), documentElement: {} }, localStorage: { getItem: () => null, setItem() {} }, navigator: {} });
  vm.runInContext(read('assets/kit/haptics.js'), ctx);                 // the zone law: Casablanca is UTC+0
  vm.runInContext(read('assets/trade-workspace-schema.js'), ctx);
  try { vm.runInContext(read('assets/pos-spa.js'), ctx); } catch (error) { if (!/register/.test(error.message)) throw error; }   // stops at the dispatcher registration, after the state is opened
  assert.ok(opts, 'the till opened its state');
  return { win, ctx, opts, saved, setNow: (iso) => { now = at(iso); } };
}
const legacy = () => ({ id: 'CU-1', clientId: 'c1', familyId: 'fh', size: 10, used: 3, boughtDays: -200, expiresDays: 180 });
const dated = () => ({ id: 'CU-2', clientId: 'c1', familyId: 'fh', size: 5, used: 1, expiresOn: '2027-01-05', expirySource: undefined });
const doc = (cures) => ({ v: 2, cures, clients: [{ id: 'c1', name: 'Test', phone: '0600', visits: 0, lastDays: 0 }], appointments: [], freeItems: [] });

const w = world('2026-10-20T10:00:00Z');
w.opts.restore(doc([legacy(), dated()]));
let cures = w.opts.snapshot().cures;
assert.equal(cures[0].expiresOn, '2027-04-18', 'a legacy cure gets 180 days from the day of the update (20 Oct + 180)');
assert.equal(cures[0].expirySource, 'legacy-grandfathered');
assert.equal(cures[0].expirySourceOn, '2026-10-20', 'with the date the validity was granted');
assert.equal(cures[1].expiresOn, '2027-01-05', 'a cure that already has its date is untouched'); assert.ok(!cures[1].expirySource);
assert.equal(w.win.KiwiTradeSchema.cureDaysLeft(cures[0].expiresOn, at('2026-10-20T10:00:00Z')), 180, 'not expired, not retroactive: 180 days left today');
await Promise.resolve();
assert.equal(w.saved.length, 1, 'the grant is saved once, so every till and the server see the same date');
// A later read does not move the date.
w.setNow('2026-12-01T10:00:00Z');
w.opts.restore(doc(cures.map((c) => ({ ...c }))));
cures = w.opts.snapshot().cures; await Promise.resolve();
assert.equal(cures[0].expiresOn, '2027-04-18', 'the granted date is stable on the next read'); assert.equal(w.saved.length, 1, 'and nothing is saved again');
// The 05:00 business day: a first read at 03:00 counts from the previous business day.
const early = world('2026-10-21T03:00:00Z'); early.opts.restore(doc([legacy()]));
assert.equal(early.opts.snapshot().cures[0].expiresOn, '2027-04-18', 'at 03:00 on 21 Oct the business day is still 20 Oct');
// An empty or unreadable list does not save anything.
const none = world('2026-10-20T10:00:00Z'); none.opts.restore(doc([])); await Promise.resolve(); assert.equal(none.saved.length, 0);

// Staff edit: the real editor module, run with a minimal DOM.
const src = read('assets/pos-spa.js');
globalThis.window = { KiwiTradeSchema: { businessDayKey: () => '2026-10-22' } };
const { openExpiryEditor } = await import('../assets/pos-spa-cure-expiry.js?v=2');
function editor(cure) {
  const input = { value: '' }, ok = { onclick: null }, closes = [], toasts = [], saved = [];
  const el = { innerHTML: '', querySelectorAll: () => [], querySelector: (sel) => (sel === '#sp-exp-date' ? input : sel === '#sp-exp-ok' ? ok : null) };
  openExpiryEditor({ cure, label: 'Forfait × 10 · Test', el, openVeil() {}, closeVeil: (v) => closes.push(v), icons() {}, toast: (m) => toasts.push(m), esc: String, onSaved: () => saved.push(1) });
  return { el, input, ok, closes, toasts, saved };
}
const cu = { ...legacy(), expiresOn: '2027-04-18', expirySource: 'legacy-grandfathered', expirySourceOn: '2026-10-20' };
const e = editor(cu);
assert.match(e.el.innerHTML, /value="2027-04-18"/, 'the editor starts from the granted date');
e.input.value = 'not-a-date'; e.ok.onclick(); assert.equal(cu.expiresOn, '2027-04-18', 'an invalid date changes nothing'); assert.equal(e.saved.length, 0); assert.equal(e.toasts.length, 1);
e.input.value = '2027-06-30'; e.ok.onclick();
assert.equal(cu.expiresOn, '2027-06-30', 'staff can move the date'); assert.equal(cu.expirySource, 'staff-edited'); assert.equal(cu.expirySourceOn, '2026-10-22');
assert.equal(e.saved.length, 1, 'and the change is saved'); assert.equal(e.closes.length, 1);

// The cure card shows the customer the date, and says when it was granted on update.
{
  const ctx = vm.createContext({ CL: { c1: { name: 'Test', phone: '0600' } }, FORFAIT: { fh: { name: 'Hammam' } }, cureExpired: () => false, esc: String, fmtRel: () => 'il y a 6 mois', punchRow: () => '', initials: () => 'T',
    barcode: () => '', ffSaving: () => 0, fmtMAD: String, fmtDay: (d) => d.toISOString().slice(0, 10), inDays: () => '?' });
  vm.runInContext(scan(src.slice(src.indexOf('  function cureCard(')).trimStart(), 'cureCard') + '\nglobalThis.run = cureCard;', ctx);
  const granted = ctx.run({ ...legacy(), expiresOn: '2027-04-18', expirySource: 'legacy-grandfathered', expirySourceOn: '2026-10-20' });
  assert.match(granted, /Valable jusqu'au <b>2027-04-18<\/b>/, 'the card shows the date');
  assert.match(granted, /date accordée à la mise à jour du 2026-10-20/, 'and says it was granted at the update');
  assert.match(granted, /data-sp-exp="CU-1"/, 'with an action to edit it');
  assert.ok(!ctx.run({ ...legacy(), expiresOn: '2027-04-18' }).includes('mise à jour'), 'a cure sold with its date carries no such note');
}
console.log('✓ spa legacy cures: granted from the day of the update, never retroactive, stable, saved once, editable by staff');
