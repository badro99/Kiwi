#!/usr/bin/env node
/* r21 employee A1/A2/B0: the real phone client (assets/employee-live.js, assets/queue-recovery.js) against the real
 * /api/employee and /api/team/live routes on node:sqlite.
 *  A1  a punch captured then lost with the page (kill before the commit, lost answer) comes back after a reload:
 *      same opId, original captured time, written once.
 *  A2  a late punch goes to the manager; approval or refusal returns to the phone with the ORIGINAL day and time.
 *  B0  a punch queue the phone could not read is kept byte for byte and offered through the shared recovery panel.
 * Proves: real client code, real server rules, a fresh client over the same storage (a reload).
 * Does not prove: OS suspension itself (the page is simply discarded between capture and commit). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fixture } from './server-money-fixture.mjs';
import { employeeToken, employeeCookie, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as teamLive } from '../functions/api/team/live.js';
import { onRequestGet as get, onRequestPost as post } from '../functions/api/employee.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const H = 3600000;
const f = await fixture(ROOT), { sql, merchant } = f;
const prepare = f.DB.prepare.bind(f.DB);
f.DB.prepare = (query) => { const statement = prepare(query); for (const method of ['first', 'all']) { const run = statement[method].bind(statement); statement[method] = async (...a) => run(...a); } return statement; };
const clientSource = fs.readFileSync(path.join(ROOT, 'assets/employee-live.js'), 'utf8').replace(/import\('\.\/request-deadline\.mjs'\)/g, 'Promise.resolve({ deadlineFetch: (u, o) => fetch(u, o) })');
const recoverySource = fs.readFileSync(path.join(ROOT, 'assets/queue-recovery.js'), 'utf8');
const put = (feature, data) => sql.prepare('INSERT OR REPLACE INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,?)').run(merchant, feature, JSON.stringify(data), Date.now());
const doc = (feature) => JSON.parse(sql.prepare('SELECT data FROM store_docs WHERE merchant=? AND feature=?').get(merchant, feature)?.data || '{}');
let cookie, code;
async function reset() {
  sql.exec('DELETE FROM store_docs; DELETE FROM employee_auth_versions; DELETE FROM pair_attempts; DELETE FROM staff_pins');
  sql.prepare("UPDATE merchant_config SET status='active'").run();
  code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const a = { id: 'a', firstName: 'Alice', function: 'serveur', pinCode: '4821', authVersion: 0 };
  put('team', { members: [a], hours: { a: {} }, shifts: { a: {} } }); put('employee-access', { members: [a] });
  put('attendance-code', { code, createdTs: Date.now(), expiresTs: Date.now() + 3600000 }); put('attendance', { entries: [] });
  cookie = employeeCookie(await employeeToken(f.env.AUTH_SECRET, { merchant, staffId: 'a', authVersion: 0 }));
}
async function route(handler, url, method, body, who = cookie) {
  return handler({ env: f.env, request: new Request('https://kiwi.test' + url, { method, headers: { Cookie: who, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
}

/* A phone: the real client code over a storage that outlives it. */
function node(tag, doc) {
  const n = { tag, id: '', style: { cssText: '' }, children: [], attrs: {}, parent: null, textContent: '', disabled: false, listeners: {},
    append(...kids) { kids.forEach((k) => { k.parent = n; n.children.push(k); }); },
    appendChild(k) { n.append(k); return k; },
    prepend(k) { k.parent = n; n.children.unshift(k); },
    remove() { if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n); n.parent = null; },
    click() {}, setAttribute(k, v) { n.attrs[k] = v; }, addEventListener(name, fn) { (n.listeners[name] ||= []).push(fn); }, focus() { doc.active = n; } };
  return n;
}
const texts = (n) => [n.textContent].concat(n.children.flatMap(texts));
const find = (n, pred) => { if (pred(n)) return n; for (const c of n.children) { const h = find(c, pred); if (h) return h; } return null; };
function phone(disk, { fetchImpl, hang = false } = {}) {
  const doc = { readyState: 'complete', visibilityState: 'visible', documentElement: { lang: 'fr' }, addEventListener() {}, dispatchEvent() {} };
  doc.createElement = (t) => node(t, doc);
  doc.body = node('body', doc);
  const main = node('div', doc); main.id = 'main-content'; doc.body.append(main);
  doc.getElementById = (id) => find(doc.body, (n) => n.id === id);
  const listeners = {}, blobs = [], posts = [];
  const localStorage = { get length() { return disk.size; }, key: (i) => [...disk.keys()][i] ?? null, getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k) };
  const context = { document: doc, localStorage, navigator: { onLine: true }, console: { warn() {}, log() {} }, setTimeout, clearTimeout, Date, Intl, JSON, Promise, Math, Number, String, Object, Array, Map, Set, Error, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class { constructor(parts) { blobs.push(parts); } }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }, Event: class { constructor(type) { this.type = type; } },
    fetch: async (url, options = {}) => {
      const method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : undefined;
      if (method === 'POST') posts.push(body);
      if (hang && method === 'POST') return new Promise(() => {});
      const res = await (fetchImpl ? fetchImpl(url, method, body) : route(method === 'GET' ? get : post, url, method, body));
      return res;
    } };
  context.window = Object.assign(context, { addEventListener(name, fn) { (listeners[name] ||= []).push(fn); }, dispatchEvent(event) { (listeners[event.type] || []).forEach((fn) => fn(event)); }, localStorage });
  vm.runInNewContext(clientSource, context);
  return { context, doc, main, blobs, posts, listeners, live: context.KiwiEmployeeLive, fire: (type, detail) => context.window.dispatchEvent({ type, detail }), loadRecovery: () => vm.runInNewContext(recoverySource, context) };
}
async function until(check, what, ms = 4000) {
  const end = Date.now() + ms;
  for (;;) { const v = await check(); if (v) return v; if (Date.now() > end) throw new Error('timeout: ' + what); await new Promise((r) => setTimeout(r, 20)); }
}
const panelText = (p) => { const panel = p.doc.getElementById('employee-punch-corrections'); return panel ? texts(panel).join(' | ') : ''; };
const QUEUE = `kiwiEmployeePunchQueue:${merchant}:a`;

/* A2: a 13 h old punch, decided by the manager, comes back to the phone with its original time. */
for (const decision of ['approved', 'rejected']) {
  await reset();
  const disk = new Map(), at = Date.now() - 13 * H;
  disk.set(QUEUE, JSON.stringify([{ kind: 'clock-in', opId: 'late-' + decision, at, code: '', progress: null }]));
  const p = phone(disk);
  const first = await p.live.refresh();
  await until(() => JSON.parse(disk.get(QUEUE) || '[]')[0]?.reported === true, 'the late punch reaches the manager');
  const pending = doc('attendance-corrections').items;
  assert.equal(pending.length, 1); assert.equal(pending[0].status, 'pending');
  assert.ok(Math.abs(pending[0].claimedTs - at) < 5000, 'the server keeps the captured time, not the receive time');
  const zone = first.store.timezone;
  const when = new Date(at).toLocaleString('fr-FR', { timeZone: zone, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const seen = await p.live.refresh();
  assert.deepEqual(seen.corrections.map((c) => [c.opId, c.status]), [['late-' + decision, 'pending']], 'the phone is told it is pending, and only its own');
  assert.ok(!JSON.stringify(seen.corrections).match(/actor|deviceId|staffId/), 'no manager identity or device in the phone projection');
  assert.match(panelText(p), /Transmis au responsable/);
  const owner = sessionCookie(await makeSession('money-owner', f.env.AUTH_SECRET));
  const decided = await route(teamLive, '/api/team/live', 'POST', { merchant, action: 'attendance-correction-decision', correctionId: pending[0].id, decision }, owner);
  assert.equal(decided.status, 200);
  await p.live.refresh();
  const words = decision === 'approved' ? /Approuvé par le responsable/ : /Refusé par le responsable/;
  await until(() => words.test(panelText(p)), 'the decision reaches the phone (' + decision + ')');
  const text = panelText(p);
  assert.ok(text.includes(when), decision + ': the phone still shows the original day and time (' + when + ') in: ' + text);
  const entries = doc('attendance').entries;
  if (decision === 'approved') {
    assert.equal(entries.length, 1); assert.equal(entries[0].inTs, pending[0].claimedTs, 'the hours start at the captured time');
    assert.equal(new Date(entries[0].inTs).toLocaleDateString('fr-FR', { timeZone: zone }), new Date(at).toLocaleDateString('fr-FR', { timeZone: zone }), 'on the original day');
  } else assert.equal(entries.length, 0, 'a refusal counts no hours');
  assert.equal(p.posts.filter((b) => b.opId === 'late-' + decision).length, 1, 'the late punch was sent to the manager once');
}

/* A1: captured, then the page dies before the commit; a reload sends it under the same opId at the captured time, once. */
{
  await reset();
  const disk = new Map();
  const first = phone(disk, { hang: true });
  await first.live.refresh();
  const t0 = Date.now();
  const pendingPunch = first.live.clockIn(code, 'persisted-in');
  await until(() => JSON.parse(disk.get(QUEUE) || '[]').some((i) => i.opId === 'persisted-in'), 'the capture is on the phone before any commit');
  void pendingPunch.catch(() => {});
  assert.deepEqual(doc('attendance').entries, [], 'nothing reached the server: the page is discarded here');
  await new Promise((r) => setTimeout(r, 300));
  // Reload 1: the answer is lost after the server applied it.
  let lose = true;
  const second = phone(disk, { fetchImpl: async (url, method, body) => { const res = await route(method === 'GET' ? get : post, url, method, body); if (method === 'POST' && lose) { lose = false; throw new TypeError('network lost'); } return res; } });
  await second.live.refresh();
  await until(() => second.posts.length >= 1, 'the reloaded phone sends the persisted punch');
  assert.equal(second.posts[0].opId, 'persisted-in', 'same opId');
  assert.ok(Math.abs((Date.now() - second.posts[0].capturedAgoMs) - t0) < 250 || Math.abs(second.posts[0].capturedAt - t0) < 250, 'the captured time travels, not the reload time');
  assert.equal(doc('attendance').entries.length, 1, 'the server applied it');
  // Reload 2: the phone does not know it was applied; it resends and the server recognises the opId.
  const third = phone(disk);
  await third.live.refresh();
  await until(() => JSON.parse(disk.get(QUEUE) || '[]').every((i) => i.opId !== 'persisted-in' || i.done) || !disk.get(QUEUE), 'the queue is cleared');
  const entries = doc('attendance').entries;
  assert.equal(entries.length, 1, 'written once across two reloads and a lost answer');
  assert.ok(Math.abs(entries[0].inTs - t0) < 250, 'at the original captured time (' + (entries[0].inTs - t0) + ' ms off)');
  // Reload 3: nothing left to send.
  const fourth = phone(disk); await fourth.live.refresh(); await new Promise((r) => setTimeout(r, 150));
  assert.equal(fourth.posts.length, 0, 'a settled punch is never sent again');
}

/* B0: an unreadable punch queue is kept byte for byte and reaches the shared recovery panel. */
{
  await reset();
  const disk = new Map(); disk.set(QUEUE, '{not json: 08:02 in');
  const p = phone(disk);
  p.loadRecovery();
  await p.live.refresh();
  const copies = await until(() => { const c = p.context.KiwiEmployeePunchQueue.recoveryCopies(); return c.length ? c : null; }, 'the unreadable queue is set aside');
  assert.equal(copies.length, 1, 'one copy set aside');
  assert.equal(p.context.KiwiEmployeePunchQueue.recoveryCopies(copies[0].key), '{not json: 08:02 in', 'byte for byte');
  assert.ok(!disk.has(QUEUE) && disk.get(QUEUE + ':recovery') === '1', 'the live key is cleared and the recovery flag is set');
  const box = find(p.doc.body, (n) => n.tag === 'details');
  assert.ok(box, 'the shared recovery panel opens on the phone');
  const all = texts(box).join(' | ');
  assert.match(all, /Copies à vérifier · 1/); assert.match(all, /Pointages à vérifier/);
  assert.ok(!/kiwiEmployeePunchQueue/.test(all), 'no storage key is shown');
  const save = find(box, (n) => n.tag === 'button' && n.textContent === 'Exporter');
  save.onclick(); assert.equal(p.blobs[0][0], '{not json: 08:02 in', 'export carries the raw bytes');
  assert.ok(!find(box, (n) => n.tag === 'button' && /Accuser/.test(n.textContent)), 'on the phone a copy is only exported: deleting it needs a manager');
  assert.match(panelText(p), /illisible/, 'the punch panel still warns');
  p.context.requireManager = (label, ok) => ok();
  p.fire('kiwi:langchange');
  const ack = find(find(p.doc.body, (n) => n.tag === 'details'), (n) => n.tag === 'button' && /Accuser/.test(n.textContent));
  assert.ok(ack, 'with a manager code the copy can be acknowledged');
  ack.onclick();
  assert.equal(p.context.KiwiEmployeePunchQueue.recoveryCopies().length, 0, 'acknowledged copy is gone');
  assert.ok(!disk.has(QUEUE + ':recovery'), 'and the recovery flag with it');
  assert.ok(!/illisible/.test(panelText(p)), 'the warning leaves the punch panel');
}
console.log('PASS employee punch journey: reload after capture, manager decision back on the phone, unreadable queue recoverable');
process.exit(0);
