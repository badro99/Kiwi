#!/usr/bin/env node
/* tools/till-shift-proof-test.mjs · the manager on shift does not retype their code.
 *
 * Owner, 27 Nov 2026: when a manager or owner code opened the till, protected
 * acts stop asking for a code. The server hands the unlock a shift proof
 * (functions/auth/_till-shift.js) and accepts it wherever a code is accepted;
 * the till presents it instead of opening the pad (assets/staff-perms-till.js,
 * assets/caisse/settings.js). This suite holds the server's rules for that
 * proof and the till's fall-back to the pad.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as verifyPost } from '../functions/api/pin/verify.js';
import { onRequestPost as cancelPost } from '../functions/api/sale/cancel.js';
import { tillDeviceToken, tillToken, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { tillShiftProof, verifyStaffCredential } from '../functions/auth/_till-shift.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { migrated } = require('./fixtures/migrated-tables.cjs');

const failures = [];
function check(desc, cond) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + desc);
  if (!cond) failures.push(desc);
}

const AUTH_SECRET = 'shift-test-secret-32-chars-long!!';
const sqlite = migrated(new DatabaseSync(':memory:'));
const now = Date.now();
sqlite.prepare(`INSERT INTO merchant_config (merchant, features, account_id, name, updated_ts) VALUES
  ('cafe-atlas', '{}', 'acc-1', 'Café Atlas', ?), ('atlas-medina', '{}', 'acc-1', 'Atlas Médina', ?),
  ('other-shop', '{}', 'acc-2', 'Other Shop', ?)`).run(now, now, now);
sqlite.prepare(`INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES
  ('pin-mgr', 'cafe-atlas', '1234', 'Karim B.', 'Manager', ?),
  ('pin-cash', 'cafe-atlas', '5678', 'Samira L.', 'Caissier', ?),
  ('pin-own', 'atlas-medina', '4321', 'Rachid O.', 'Proprietaire', ?),
  ('pin-far', 'other-shop', '9999', 'Other Boss', 'Proprietaire', ?)`).run(now, now, now, now);
sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines)
  VALUES ('sale-1', 'cafe-atlas', 100, 10000, 'cash', 'Table 1', '0001', ?, '[{"n":"Couscous","q":1,"t":100}]')`).run(now);

const env = {
  AUTH_SECRET,
  DB: {
    prepare(query) {
      const stmt = sqlite.prepare(query);
      const bound = (params) => ({
        async first() { return stmt.get(...params); },
        async all() { return { results: stmt.all(...params) }; },
        async run() { const r = stmt.run(...params); return { meta: { changes: r.changes, last_row_id: r.lastInsertRowid }, changes: r.changes, success: true }; },
      });
      return Object.assign(bound([]), { bind: (...params) => bound(params) });
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
      catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  },
};

const DEVICE = 'term_front_desk_x';
const OTHER_DEVICE = 'term_back_room_x';
const deviceCookie = async (device = DEVICE, merchant = 'cafe-atlas') => `kiwi_till=${await tillDeviceToken(AUTH_SECRET, merchant, 0, device)}`;
let ipN = 0;
async function verify(body, cookie) {
  const res = await verifyPost({ request: new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '10.9.0.' + (++ipN) },
    body: JSON.stringify(body) }), env });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const reqWith = async (cookie) => new Request('https://kiwi.test/x', { headers: { Cookie: cookie } });

console.log('\n1 · The unlock hands out a shift proof to managers and owners only');
const mgr = await verify({ merchant: 'cafe-atlas', pin: '1234' }, await deviceCookie());
check('a manager code opening a paired till gets a shift proof', mgr.status === 200 && /^ks1\./.test(mgr.body.shiftProof || ''));
check('the proof carries no code', !String(mgr.body.shiftProof || '').includes('1234') && !JSON.stringify(mgr.body).includes('"pin"'));
const cash = await verify({ merchant: 'cafe-atlas', pin: '5678' }, await deviceCookie());
check('a cashier code gets none', cash.status === 200 && !cash.body.shiftProof);
const withAct = await verify({ merchant: 'cafe-atlas', pin: '1234', action: { kind: 'discount', pct: 20 } }, await deviceCookie());
check('an approval for one act gets none (only an unlock does)', withAct.status === 200 && !withAct.body.shiftProof);
const legacy = await verify({ merchant: 'cafe-atlas', pin: '1234' }, `kiwi_till=${await tillToken(AUTH_SECRET, 'cafe-atlas')}`);
check('an old till cookie without a device id gets none', legacy.status === 200 && !legacy.body.shiftProof);
const owner = await verify({ merchant: 'cafe-atlas', pin: '4321' }, await deviceCookie());
check('the owner, whose code lives under a sibling store, gets one', owner.status === 200 && /^ks1\./.test(owner.body.shiftProof || ''));
let shift = mgr.body.shiftProof;
const unlockAsManager = async () => (await verify({ merchant: 'cafe-atlas', pin: '1234' }, await deviceCookie())).body.shiftProof;
check('the owner\'s unlock replaced the manager\'s proof on this till', !(await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', shift)).ok);
shift = await unlockAsManager();

console.log('\n2 · The proof stands in for the code, on this till only');
const disc = await verify({ merchant: 'cafe-atlas', pin: shift, action: { kind: 'discount', pct: 20 } }, await deviceCookie());
check('a protected act is approved with the proof', disc.status === 200 && disc.body.staff && disc.body.staff.name === 'Karim B.');
check('and the server signs the act like after a code', !!disc.body.actProof);
check('a proof never mints another proof', !disc.body.shiftProof);
const refund = await verify({ merchant: 'cafe-atlas', pin: shift, action: { kind: 'refund', refundId: 'r-1', originalSaleId: 'sale-1', amountCents: 5000, refundMethod: 'cash' } }, await deviceCookie());
check('a refund gets its signed manager approval', refund.status === 200 && !!refund.body.approval);
const elsewhere = await verify({ merchant: 'cafe-atlas', pin: shift, action: { kind: 'discount', pct: 20 } }, await deviceCookie(OTHER_DEVICE));
check('another paired device of the same shop cannot use it', elsewhere.status === 401);
const otherShop = await verify({ merchant: 'other-shop', pin: shift, action: { kind: 'discount', pct: 20 } }, await deviceCookie(DEVICE, 'other-shop'));
check('another shop cannot use it', otherShop.status === 401);
const [payload, sig] = shift.slice(4).split('.');
const tampered = 'ks1.' + Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), id: 'pin-far' })).toString('base64url') + '.' + sig;
check('a tampered proof is refused', (await verify({ merchant: 'cafe-atlas', pin: tampered, action: { kind: 'discount', pct: 20 } }, await deviceCookie())).status === 401);
const bare = await verify({ merchant: 'cafe-atlas', pin: shift }, await deviceCookie());
check('without an act the proof is refused: it can never reopen the till as the manager', bare.status === 400 && !bare.body.staff && !bare.body.sellerProof);
const sess = await makeSession('acc-1', AUTH_SECRET);
const fromSession = await verifyStaffCredential(await reqWith(sessionCookie(sess).split(';')[0]), env, 'cafe-atlas', shift);
check('a browser session without the till cookie cannot use it', !fromSession.ok && fromSession.status === 403);

console.log('\n3 · The proof ages, follows the team list and dies when someone else opens the till');
const old = await tillShiftProof(await reqWith(await deviceCookie()), env, 'cafe-atlas', { id: 'pin-mgr', name: 'Karim B.', role: 'Manager' }, Date.now() - 13 * 3600000);
const aged = await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', old);
check('a proof older than twelve hours is refused', !aged.ok && aged.status === 401);
shift = await unlockAsManager();
check('a fresh manager unlock works again', (await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', shift)).ok === true);
await verify({ merchant: 'cafe-atlas', pin: '5678' }, await deviceCookie());
const replaced = await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', shift);
check('a cashier opening the same till kills the manager\'s proof at once', !replaced.ok && replaced.status === 401);
const first = await unlockAsManager(), second = await unlockAsManager();
check('each unlock replaces the previous proof', !(await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', first)).ok
  && (await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', second)).ok);
await verify({ merchant: 'cafe-atlas', pin: '5678' }, await deviceCookie(OTHER_DEVICE));
check('another till opening does not touch this till\'s proof', (await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', second)).ok === true);
shift = second;
sqlite.prepare("UPDATE staff_pins SET role = 'Caissier' WHERE id = 'pin-mgr'").run();
const demoted = await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', shift);
check('a manager demoted to cashier loses it at once', !demoted.ok && demoted.status === 403);
sqlite.prepare("UPDATE staff_pins SET role = 'Manager' WHERE id = 'pin-mgr'").run();
sqlite.prepare("UPDATE staff_pins SET id = 'pin-mgr-gone' WHERE id = 'pin-mgr'").run();
const removed = await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', shift);
check('a manager removed from the team loses it at once', !removed.ok && removed.status === 401);
sqlite.prepare("UPDATE staff_pins SET id = 'pin-mgr' WHERE id = 'pin-mgr-gone'").run();
check('a four-digit code still goes to the code verifier', (await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', '5678')).ok === true);

console.log('\n3b · Only known acts, an explicit end of shift, and no silent rotation failure');
const made = await verify({ merchant: 'cafe-atlas', pin: shift, action: { kind: 'anything-goes' } }, await deviceCookie());
check('an invented act name is refused, with no identity or author proof', made.status === 400 && !made.body.staff && !made.body.actorProof);
const generic = await verify({ merchant: 'cafe-atlas', pin: shift, action: { kind: 'manager-op' } }, await deviceCookie());
check('a pad with no act context uses the generic manager act and passes', generic.status === 200 && generic.body.staff && generic.body.staff.name === 'Karim B.');
const stale = await unlockAsManager(); const live = await unlockAsManager();
const staleEnd = await verify({ merchant: 'cafe-atlas', pin: stale, action: { kind: 'end-shift' } }, await deviceCookie());
check('an old pass cannot end the shift that replaced it', staleEnd.status === 401
  && (await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', live)).ok === true);
const ended = await verify({ merchant: 'cafe-atlas', pin: live, action: { kind: 'end-shift' } }, await deviceCookie());
check('locking the till ends the shift on the server at once', ended.status === 200 && ended.body.ended === true
  && !(await verifyStaffCredential(await reqWith(await deviceCookie()), env, 'cafe-atlas', live)).ok);
{
  const failing = { ...env, DB: { ...env.DB, prepare(q) { if (/INSERT INTO store_docs/.test(q)) throw new Error('d1 write down'); return env.DB.prepare(q); } } };
  const call = async (device) => verifyPost({ request: new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await deviceCookie(device), 'CF-Connecting-IP': '10.9.2.' + (++ipN) },
    body: JSON.stringify({ merchant: 'cafe-atlas', pin: '5678' }) }), env: failing });
  check('a failed rotation on a till that held a pass fails the unlock (503, retry) instead of leaving the pass alive', (await call(DEVICE)).status === 503);
  const fresh = await call('term_never_shift_x');
  check('a till that never held a pass still opens when the rotation fails', fresh.status === 200);
}
shift = await unlockAsManager();

console.log('\n4 · Routes that compare a code themselves accept it too');
const cancel = await cancelPost({ request: new Request('https://kiwi.test/api/sale/cancel', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await deviceCookie(), 'CF-Connecting-IP': '10.9.1.1' },
  body: JSON.stringify({ merchant: 'cafe-atlas', id: 'sale-1', pin: shift, source: 'cashier' }) }), env, waitUntil() {} });
const cancelled = await cancel.json().catch(() => ({}));
check('a sale is cancelled with the proof, in the manager\'s name', cancel.status === 200 && cancelled.ok === true
  && /Karim/.test(String((sqlite.prepare("SELECT void_actor FROM sales WHERE id = 'sale-1'").get() || {}).void_actor || '')));
for (const rel of ['functions/api/sale/cancel.js', 'functions/api/credit/till.js', 'functions/api/pressing/cancel.js', 'functions/api/channel/glovo/till.js', 'functions/api/hotel/stays.js']) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  check(rel + ' checks codes through verifyStaffCredential', /verifyStaffCredential\(/.test(src) && !/verifyStaffPin\(/.test(src));
}

console.log('\n5 · The till uses the proof, and falls back to the pad');
function loadPerms({ staff, online = true }) {
  const listeners = {};
  const doc = {
    readyState: 'complete', head: { appendChild() {} }, getElementById: () => null, createElement: () => ({}),
    querySelectorAll: () => [], addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: (ev) => { (listeners[ev.type] || []).forEach((fn) => fn(ev)); return true; },
  };
  const P = {};
  const win = {
    document: doc, KiwiStaff: staff, KiwiCaissePairing: P, navigator: { onLine: online },
    addEventListener() {}, fetch: () => Promise.resolve({ ok: false }), CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, document: doc, localStorage: { getItem: () => null, setItem() {} }, fetch: (...a) => win.fetch(...a),
    setInterval: () => ({}), CustomEvent: win.CustomEvent, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/staff-perms-till.js'), 'utf8'), ctx);
  const ask = () => { const d = { code: '', name: '' }; doc.dispatchEvent(new win.CustomEvent('kiwi-shift-code', { detail: d })); return d; };
  return { win, P, ask };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
{
  const t = loadPerms({ staff: { id: 'pin-mgr', name: 'Karim B.', role: 'Manager', shiftProof: shift } });
  check('the side pads get the proof and the name', t.ask().code === shift && t.ask().name === 'Karim B.');
  let approved = null, fell = 0;
  t.P.authorizeManager = (code, action) => Promise.resolve(code === shift && action && action.kind === 'discount');
  t.P.lastManager = () => ({ id: 'pin-mgr', name: 'Karim B.', role: 'Manager', actProof: 'p' });
  t.P.lastOperator = () => null;
  const took = t.P.shiftApprove('manager', { kind: 'discount', pct: 20 }, {}, (who) => { approved = who; }, () => { fell++; });
  await tick(); await tick();
  check('the manager pad is skipped and the act approved in their name', took === true && approved && approved.name === 'Karim B.' && approved.viaShift === true && fell === 0);
  approved = null;
  t.P.authorizeManager = () => Promise.resolve(false);
  t.P.shiftApprove('manager', { kind: 'cash' }, {}, (who) => { approved = who; }, () => { fell++; });
  await tick(); await tick();
  check('a refusal from the server opens the pad instead', approved === null && fell === 1);
  t.P.authorizeManager = () => Promise.resolve(true);
  t.P.shiftApprove('manager', { kind: 'cash' }, { validate: () => 'Karim n’a pas le droit' }, (who) => { approved = who; }, () => { fell++; });
  await tick(); await tick();
  check('a right the person lacks opens the pad instead', approved === null && fell === 2);
  check('a shift change (another person must type their own code) keeps the pad', t.P.shiftApprove('manager', null, { incoming: { name: 'Sara' } }, () => {}, () => {}) === false);
}
{
  const sent = [];
  const t = loadPerms({ staff: { id: 'pin-mgr', name: 'Karim B.', role: 'Manager', shiftProof: shift } });
  t.win.fetch = (url, o) => { sent.push(JSON.parse(o.body)); return Promise.resolve({ ok: true }); };
  t.P.pairedVenue = () => ({ merchant: 'cafe-atlas' });
  t.win.KiwiStaff = { id: 'pin-cash', name: 'Samira L.', role: 'Caissier' };
  t.win.document.dispatchEvent({ type: 'kiwi-staff' });
  check('when someone else takes the till, the old pass is sent back to end the shift', sent.length === 1 && sent[0].action.kind === 'end-shift' && sent[0].pin === shift);
  t.win.KiwiStaff = null;
  t.win.document.dispatchEvent({ type: 'kiwi-staff' });
  check('and it is sent once, not again at the next change', sent.length === 1);
}
{
  const t = loadPerms({ staff: { id: 'pin-mgr', name: 'Karim B.', role: 'Manager', shiftProof: shift }, online: false });
  check('offline, no proof: the pad as before', t.ask().code === '' && t.P.shiftApprove('manager', null, {}, () => {}, () => {}) === false);
}
{
  const t = loadPerms({ staff: { id: 'pin-cash', name: 'Samira L.', role: 'Caissier' } });
  check('a cashier on shift has no proof: the pad as before', t.ask().code === '');
}
{
  const settings = fs.readFileSync(path.join(ROOT, 'assets/caisse/settings.js'), 'utf8');
  const pairing = fs.readFileSync(path.join(ROOT, 'assets/caisse-pairing.js'), 'utf8');
  check('the manager pad asks shiftApprove before it opens', /shiftApprove\?\.\(access/.test(settings) && settings.indexOf('shiftApprove') < settings.indexOf('KiwiTillPin.approve'));
  check('a fall-back reopens the pad without trying the proof again', /noShift: true/.test(settings));
  check('the till keeps the proof only for a server-proven unlock', /!p\.offline && typeof p\.shiftProof === 'string'/.test(pairing));
  check('the proof never becomes an offline verifier', /if \(!staff \|\| !\/\^\\d\{4\}\$\/\.test\(String\(code/.test(pairing));
}

if (failures.length) { console.error(`\n❌ ${failures.length} shift-proof controls failed.`); process.exit(1); }
console.log('\n✓ The manager on shift is trusted for exactly what a code would prove.');
