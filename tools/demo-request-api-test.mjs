#!/usr/bin/env node
/* POST /api/demo-request and /api/admin/demo-requests, run as the real Pages
 * Functions on in-memory SQLite built from schema.sql. A visitor's request is
 * stored before anything else happens; a robot filling the trap gets a fake
 * "received"; a flood from one address is cut; only an operator reads or
 * moves a request, and the public route is the only one the gate lets
 * through.
 *
 *   node tools/demo-request-api-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { operatorToken, operatorIdToken, makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as submit } from '../functions/api/demo-request.js';
import { onRequestGet as list, onRequestPatch as patch } from '../functions/api/admin/demo-requests.js';
import { sanitizeDemoRequest, cleanPhone, demoReference, slotText } from '../functions/api/_demo-requests.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const secret = 'demo-request-secret-0123456789012345678';
sql.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('op-demo','Salma (équipe)','','',1)");
sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-d', 'd@test', 'Café Démo', 's', 'h', 1);
class Statement {
  constructor(q) { this.q = q; this.args = []; }
  bind(...a) { this.args = a.map((x) => (x === undefined ? null : x)); return this; }
  async first() { return sql.prepare(this.q).get(...this.args) ?? null; }
  async all() { return { results: sql.prepare(this.q).all(...this.args) }; }
  async run() { const r = sql.prepare(this.q).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
}
const env = { DB: { prepare: (q) => new Statement(q) }, AUTH_SECRET: secret };

let passed = 0, failed = 0;
const ok = async (label, fn) => { try { await fn(); passed++; console.log('  ✓ ' + label); } catch (e) { failed++; console.log('  ✗ ' + label + '\n      ' + String(e.message).split('\n')[0]); } };

let ipSeq = 0;
const post = async (body, { ip = '10.0.0.' + (++ipSeq), origin = 'https://kiwi.test', raw } = {}) => {
  const waits = [];
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  const r = await submit({ env, waitUntil: (p) => waits.push(p),
    request: new Request('https://kiwi.test/api/demo-request', { method: 'POST', headers, body: raw ?? JSON.stringify(body) }) });
  await Promise.all(waits);
  return { status: r.status, data: await r.json() };
};
const GOOD = { firstName: 'Salma', business: 'TEST KIWI Café', trade: 'cafe', phone: '06 12 34 56 78', email: '',
  day: 'tomorrow', part: 'afternoon', note: 'La caisse et le stock', lang: 'fr', page: '/fr/', website: '' };
const rows = () => sql.prepare('SELECT * FROM demo_requests ORDER BY created_ts').all();

const opCookie = `kiwi_op=${await operatorToken(secret)}; kiwi_op_id=${await operatorIdToken(secret, 'op-demo')}`;
const owner = sessionCookie(await makeSession('acc-d', secret)).split(';')[0];
const adminGet = async (q = '', cookie = opCookie) => {
  const r = await list({ env, request: new Request('https://kiwi.test/api/admin/demo-requests' + q, { headers: { Cookie: cookie } }) });
  return { status: r.status, data: await r.json() };
};
const adminPatch = async (body, cookie = opCookie, origin = 'https://kiwi.test') => {
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  const r = await patch({ env, request: new Request('https://kiwi.test/api/admin/demo-requests', { method: 'PATCH', headers, body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json() };
};

console.log('■ demo request · the rules');
await ok('phones: local, international and 00 forms accepted; letters and short numbers refused', () => {
  assert.equal(cleanPhone('06 12 34 56 78'), '0612345678');
  assert.equal(cleanPhone('+212 6 12-34-56-78'), '+212612345678');
  assert.equal(cleanPhone('00212612345678'), '00212612345678');
  assert.equal(cleanPhone('06 12 AB'), '');
  assert.equal(cleanPhone('1234567'), '');
});
await ok('each missing or bad field is named, so the page can point at it', () => {
  assert.deepEqual(sanitizeDemoRequest({ ...GOOD, firstName: '  ' }), { ok: false, field: 'firstName' });
  assert.deepEqual(sanitizeDemoRequest({ ...GOOD, business: '' }), { ok: false, field: 'business' });
  assert.deepEqual(sanitizeDemoRequest({ ...GOOD, phone: 'call me' }), { ok: false, field: 'phone' });
  assert.deepEqual(sanitizeDemoRequest({ ...GOOD, email: 'not-an-email' }), { ok: false, field: 'email' });
});
await ok('fields are bounded and typed: an unknown slot, trade or language becomes empty', () => {
  const v = sanitizeDemoRequest({ ...GOOD, firstName: 'x'.repeat(200), day: 'yesterday', part: 'night', trade: '<b>', lang: 'french', note: 'n'.repeat(900) }).value;
  assert.equal(v.first_name.length, 60);
  assert.equal(v.note.length, 500);
  assert.deepEqual([v.slot_day, v.slot_part, v.trade, v.lang], ['', 'any', '', '']);
  assert.equal(slotText(v), 'à convenir');
});
await ok('« demain » carries its real date: the team reads a request days later', () => {
  /* Friday 23 October, 23:30 in Morocco. Read on Monday, a bare « demain » would
     point at Tuesday; the line now names Saturday. */
  const fri = Date.UTC(2026, 9, 23, 22, 30);
  assert.equal(slotText({ slot_day: 'today', slot_part: 'morning', created_ts: fri }), 'aujourd’hui, ven. 23 oct., le matin');
  assert.equal(slotText({ slot_day: 'tomorrow', slot_part: 'afternoon', created_ts: fri }), 'demain, sam. 24 oct., l’après-midi');
  assert.equal(slotText({ slot_day: 'week', slot_part: 'any', created_ts: fri }), 'cette semaine, jusqu’au dim. 25 oct.');
  assert.equal(slotText({ slot_day: 'later', slot_part: 'evening', created_ts: fri }), 'plus tard, en fin de journée');
  // 23:30 UTC on the 21st is still the 21st in Casablanca.
  assert.equal(slotText({ slot_day: 'tomorrow', slot_part: 'any' }, Date.UTC(2026, 9, 21, 23, 30)), 'demain, jeu. 22 oct.');
  // An older row with no timestamp keeps the relative label alone.
  assert.equal(slotText({ slot_day: 'tomorrow', slot_part: 'evening' }), 'demain, en fin de journée');
  const route = fs.readFileSync(path.join(root, 'functions/api/demo-request.js'), 'utf8');
  assert.equal((route.match(/slotText\(v, now\)/g) || []).length, 2, 'the e-mail and the partner lead both date the slot from the request time');
});
await ok('references are readable over the phone and dated in Casablanca', () => {
  assert.match(demoReference(Date.UTC(2026, 9, 12, 23, 30)), /^D-1210-[A-HJ-NP-Z2-9]{4}$/);
});

console.log('■ demo request · POST /api/demo-request');
await ok('a good request is stored with every field and answered with its reference', async () => {
  const r = await post(GOOD);
  assert.equal(r.status, 200);
  assert.match(r.data.reference, /^D-\d{4}-[A-Z2-9]{4}$/);
  const [row] = rows();
  assert.equal(row.reference, r.data.reference);
  assert.deepEqual([row.first_name, row.business, row.trade, row.phone, row.slot_day, row.slot_part, row.lang, row.page, row.status],
    ['Salma', 'TEST KIWI Café', 'cafe', '0612345678', 'tomorrow', 'afternoon', 'fr', '/fr/', 'new']);
  assert.equal(row.notified, 'unconfigured', 'no mail webhook here, and the request still stands');
});
await ok('the honeypot gets a fake "received" and nothing is written', async () => {
  const before = rows().length;
  const r = await post({ ...GOOD, website: 'http://spam.example' });
  assert.equal(r.status, 200);
  assert.ok(r.data.ok && r.data.reference);
  assert.equal(rows().length, before);
});
await ok('a bad field answers 400 with the field, and nothing is written', async () => {
  const before = rows().length;
  const r = await post({ ...GOOD, phone: '12' });
  assert.deepEqual([r.status, r.data.error, r.data.field], [400, 'invalid', 'phone']);
  assert.equal(rows().length, before);
});
await ok('another origin is refused; broken JSON is refused', async () => {
  assert.equal((await post(GOOD, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(null, { raw: '{nope' })).status, 400);
});
await ok('one address is cut off after 8 requests in a quarter hour', async () => {
  const statuses = [];
  for (let i = 0; i < 9; i++) statuses.push((await post({ ...GOOD, business: 'TEST KIWI Flood ' + i }, { ip: '10.9.9.9' })).status);
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(200));
  assert.equal(statuses[8], 429);
  assert.equal((await post(GOOD)).status, 200, 'another address is unaffected');
});

console.log('■ demo request · operator console');
await ok('only an operator reads the requests', async () => {
  assert.equal((await adminGet('', owner)).status, 403, 'a merchant session is not an operator');
  assert.equal((await adminGet('', '')).status, 403, 'anonymous refused');
  const r = await adminGet();
  assert.equal(r.status, 200);
  assert.equal(r.data.requests.length, rows().length);
  assert.equal(r.data.counts.new, rows().length);
  assert.ok(r.data.requests[0].created_ts >= r.data.requests.at(-1).created_ts, 'newest first');
});
await ok('an operator moves a request, signed with their name; the filter follows', async () => {
  const id = rows()[0].id;
  assert.equal((await adminPatch({ id, status: 'contacted' }, owner)).status, 403);
  assert.equal((await adminPatch({ id, status: 'contacted' }, opCookie, 'https://evil.example')).status, 403);
  assert.equal((await adminPatch({ id, status: 'booked' })).status, 400);
  assert.equal((await adminPatch({ id: 'nope', status: 'contacted' })).status, 404);
  const r = await adminPatch({ id, status: 'contacted' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.request.status, r.data.request.handled_by], ['contacted', 'Salma (équipe)']);
  const f = await adminGet('?status=contacted');
  assert.deepEqual(f.data.requests.map((x) => x.id), [id]);
  assert.equal(f.data.counts.contacted, 1);
});

await ok('the console button sits in God Mode, stamped, and counts the new requests', () => {
  const admin = fs.readFileSync(path.join(root, 'kiwi-admin.html'), 'utf8');
  const stamps = JSON.parse(fs.readFileSync(path.join(root, 'tools/asset-stamps.json'), 'utf8'));
  assert.match(admin, /<button type="button" id="demo-console">Démos<\/button>/);
  assert.ok(admin.includes('assets/admin-demo-requests.js?v=' + stamps['assets/admin-demo-requests.js'].v));
  const js = fs.readFileSync(path.join(root, 'assets/admin-demo-requests.js'), 'utf8');
  assert.match(js, /req\('\/api\/admin\/demo-requests\?status=new'\)/);
});
await ok('the console writes on WhatsApp to the international number, in the visitor\'s language', () => {
  const ctx = { window: {}, document: { getElementById: () => ({ addEventListener() {}, setAttribute() {}, set innerHTML(_) {} }) }, setTimeout: () => 0, encodeURIComponent, JSON, String, Number, Date, Object, Intl };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/kit/haptics.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/admin-demo-requests.js'), 'utf8'), ctx);
  const C = ctx.window.KiwiDemoConsole;
  assert.deepEqual(['0612345678', '+212612345678', '00212612345678', '33612345678'].map(C._intl), ['212612345678', '212612345678', '212612345678', '33612345678']);
  const fr = decodeURIComponent(C._waLink({ phone: '0612345678', first_name: 'Salma', reference: 'D-1310-ABCD', lang: 'fr' }));
  assert.ok(fr.startsWith('https://wa.me/212612345678?text=Bonjour Salma') && fr.includes('D-1310-ABCD'));
  assert.match(decodeURIComponent(C._waLink({ phone: '0612345678', first_name: 'Sam', reference: 'R', lang: 'en' })), /text=Hello Sam/);
  assert.equal(C._slot({ slot_day: '', slot_part: 'any' }), 'à convenir');
  // The console dates the slot by the same rule as the server's e-mail.
  const fri = Date.UTC(2026, 9, 23, 22, 30);
  for (const [day, part] of [['today', 'morning'], ['tomorrow', 'afternoon'], ['week', 'any'], ['later', 'evening'], ['tomorrow', 'any']]) {
    const row = { slot_day: day, slot_part: part, created_ts: fri };
    assert.equal(C._slot(row), slotText(row), `console and e-mail agree for ${day}/${part}`);
  }
  assert.equal(C._slot({ slot_day: 'tomorrow', slot_part: 'any', created_ts: Date.UTC(2026, 9, 21, 23, 30) }), 'demain, jeu. 22 oct.');
});

console.log('■ demo request · the gate');
await ok('the middleware lets exactly the public POST through, not the admin route', () => {
  const mw = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
  assert.match(mw, /if \(method === 'POST' && path === '\/api\/demo-request'\) return next\(\);/);
  assert.doesNotMatch(mw, /\/api\/admin\/demo-requests/);
});

console.log(`\ndemo-request-api: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
