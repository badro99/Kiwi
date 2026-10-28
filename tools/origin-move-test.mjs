// functions/_middleware.js, functions/_origin-move.js, functions/api/origin-move.js,
// functions/api/admin/origin-devices.js, assets/origin-move.js, assets/admin-origin-devices.js,
// dashboard.html, kiwi-caisse.html, kiwi-cuisine.html, kiwi-serveur.html, kiwi-admin.html, schema.sql.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { visitorRedirect, recordOldOrigin, digest } from '../functions/_origin-move.js';
import { onRequestPost as move, queuesMovable, safePreferences } from '../functions/api/origin-move.js';
import { onRequestGet as devices } from '../functions/api/admin/origin-devices.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { tillDeviceToken, tillToken, tillCookie, tillStoreCookie, terminalToken, terminalCookie, employeeToken, employeeCookie,
  operatorToken, operatorIdToken, forgetTillEpoch, makeSession, sessionCookie } from '../functions/auth/_lib.js';
const old = 'https://kiwi-maroc.pages.dev', target = 'https://kiwi-os.com';
const request = (path, options = {}) => new Request(old + path, { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate', ...options.headers }, method: options.method || 'GET' });
for (const path of ['/', '/fr/', '/en/index.html', '/pricing', '/terms.html', '/booking?merchant=test', '/signup', '/login?lang=ar']) {
  const r = visitorRedirect(request(path));
  assert.equal(r?.status, 302); assert.equal(r.headers.get('Location'), target + path);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
}
for (const path of ['/api/config', '/assets/a.js', '/fr/image.png', '/fr/index.txt', '/_next/a.js', '/dashboard.html', '/kiwi-caisse', '/kiwi-cuisine', '/kiwi-serveur', '/origin-move', '/booking.js']) {
  assert.equal(visitorRedirect(request(path)), null);
}
for (const cookie of ['kiwi_till=x', 'kiwi_session=x', 'kiwiLang=ar', 'other=1; kiwi_lang=fr']) {
  assert.equal(visitorRedirect(request('/login', { headers: { Cookie: cookie } })), null);
}
assert.equal(visitorRedirect(request('/login', { method: 'POST' })), null);
assert.equal(visitorRedirect(request('/login', { method: 'HEAD' })), null);
assert.equal(visitorRedirect(new Request(old + '/pricing')), null);
assert.equal(visitorRedirect(new Request(target + '/pricing', { headers: { Accept: 'text/html' } })), null);
let passed = false;
assert.equal((await middleware({ request: request('/pricing'), env: {}, next: () => { throw new Error('redirect must precede gate'); } })).status, 302);
await middleware({ request: request('/assets/a.js'), env: {}, next: async () => { passed = true; return new Response('asset'); } });
assert.ok(passed);
console.log('✓ Public navigation redirects preserve path/query and exempt cookies, shells, APIs and assets');

const sql = new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const secret = crypto.randomUUID();
let writes = 0;
class Statement {
  constructor(query) { this.query = query; this.args = []; }
  bind(...args) { this.args = args.map(v => v === undefined ? null : v); return this; }
  async first() { return sql.prepare(this.query).get(...this.args) || null; }
  async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
  async run() { if (this.query.startsWith('INSERT INTO origin_devices')) writes++; const r = sql.prepare(this.query).run(...this.args); return { meta: { changes: Number(r.changes) } }; }
}
const env = { DB: { prepare: query => new Statement(query) }, AUTH_SECRET: secret };
for (const merchant of ['move-a', 'move-b']) sql.prepare('INSERT INTO merchant_config (merchant, features, name, till_epoch, updated_ts) VALUES (?, ?, ?, 0, 1)').run(merchant, '{}', merchant);
const deviceId = 'term_originmove0001';
const sourceCookie = [tillCookie(await tillDeviceToken(secret, 'move-a', 0, deviceId)), tillStoreCookie('move-a')].map(s => s.split(';')[0]).join('; ');
const zero = { sales: 0, prints: 0, other: 0, unknown: 0 };
async function call(body, { origin = old, cookie = sourceCookie, headers = {} } = {}) {
  return move({ env, request: new Request(origin + '/api/origin-move', { method: 'POST', headers: { Origin: origin, Cookie: cookie, ...headers }, body: JSON.stringify(body) }) });
}
async function issue(role = 'till', options) {
  const r = await call({ action: 'issue', role, queues: zero }, options);
  assert.equal(r.status, 200); const data = await r.json(); assert.ok(/^[a-f0-9]{64}$/.test(data.token)); return data.token;
}
const exchange = (token, extra = {}) => call({ action: 'exchange', token, queues: zero, ...extra }, { origin: target, cookie: '' });
assert.equal((await call({ action: 'issue', role: 'till', queues: zero }, { cookie: '' })).status, 403);
assert.equal((await call({ action: 'issue', role: 'till', queues: zero }, { headers: { Origin: 'https://elsewhere.invalid' } })).status, 403);
assert.equal((await call({ action: 'issue', role: 'owner', queues: zero })).status, 400);
let token = await issue();
let stored = sql.prepare('SELECT * FROM origin_handoffs').get();
assert.ok(stored.token_hash !== token && stored.token_hash === await digest(token));
assert.ok(stored.expires_ts <= Date.now() + 120000 && stored.expires_ts > Date.now());
assert.equal((await exchange(token, { merchant: 'move-b' })).status, 422);
assert.equal((await exchange(token, { role: 'kitchen' })).status, 422);
const success = await exchange(token);
assert.equal(success.status, 200);
const pairing = await success.json();
assert.equal(pairing.merchant, 'move-a'); assert.equal(pairing.role, 'till'); assert.equal(pairing.deviceId, deviceId);
assert.ok(success.headers.get('Set-Cookie').includes('HttpOnly'));
assert.equal((await exchange(token)).status, 422);
assert.equal((await exchange('0'.repeat(64))).status, 422);
token = await issue(); sql.prepare('UPDATE origin_handoffs SET expires_ts = ? WHERE token_hash = ?').run(Date.now() - 1, await digest(token));
assert.equal((await exchange(token)).status, 422);
token = await issue();
const race = await Promise.all([exchange(token), exchange(token)]);
assert.deepEqual(race.map(r => r.status).sort(), [200, 422]);
token = await issue('kitchen');
assert.equal((await (await exchange(token)).json()).path, '/kiwi-cuisine.html');
token = await issue('waiter');
const waiterExchange = await exchange(token);
assert.ok(waiterExchange.headers.get('Set-Cookie').includes('kiwi_till='));
assert.equal((await waiterExchange.json()).path, '/kiwi-serveur.html');
// Revocation between issuance and redemption must not restore a removed device.
token = await issue();
sql.prepare('INSERT INTO till_devices (merchant, device_id, revoked_ts) VALUES (?, ?, ?)').run('move-a', deviceId, Date.now());
assert.equal((await exchange(token)).status, 422);
sql.prepare('DELETE FROM till_devices').run();
token = await issue(); sql.prepare("UPDATE merchant_config SET till_epoch = 1 WHERE merchant = 'move-a'").run(); forgetTillEpoch('move-a');
assert.equal((await exchange(token)).status, 422);
sql.prepare("UPDATE merchant_config SET till_epoch = 0 WHERE merchant = 'move-a'").run(); forgetTillEpoch('move-a');
token = await issue(); sql.prepare("UPDATE merchant_config SET status = 'suspended' WHERE merchant = 'move-a'").run();
assert.equal((await exchange(token)).status, 422);
sql.prepare("UPDATE merchant_config SET status = 'active' WHERE merchant = 'move-a'").run();
const legacy = [tillCookie(await tillToken(secret, 'move-a')), tillStoreCookie('move-a'), terminalCookie(await terminalToken(secret, 'move-a', deviceId, 0))].map(s => s.split(';')[0]).join('; ');
assert.equal((await call({ action: 'issue', role: 'till', queues: zero, terminalId: deviceId }, { cookie: legacy })).status, 200);
console.log('✓ Handoffs are hashed, short-lived, tenant/role bound, single-use and revocation-safe, including concurrent replay');

// Deterministic generative property, every blocking dimension over many magnitudes.
for (const field of ['sales', 'prints', 'unknown']) {
  for (const count of [1, 2, 7, 100, 1000000, NaN, -1, '0', null]) {
    const q = { ...zero, [field]: count };
    assert.equal(queuesMovable(q), false);
    assert.equal((await call({ action: 'issue', role: 'till', queues: q })).status, 409);
  }
}
// A non-financial command is left behind, never a reason to hold a working shop shut.
for (const count of [1, 2, 7, 100, 1000000]) {
  assert.equal(queuesMovable({ ...zero, other: count }), true);
  assert.equal((await call({ action: 'issue', role: 'till', queues: { ...zero, other: count } })).status, 200);
}
assert.equal((await call({ action: 'exchange', token: 'b'.repeat(64), queues: { ...zero, other: 3 } },
  { origin: target, cookie: '' })).status, 422);
token = await issue();
assert.equal((await exchange(token, { queues: { ...zero, prints: 1 } })).status, 409);
assert.equal((await exchange(token)).status, 200);
sql.prepare(`INSERT INTO print_jobs (id, merchant, kind, target, data_b64, status, created_ts, expires_ts)
  VALUES ('origin-print', 'move-a', 'receipt', '', '', 'queued', ?, ?)`).run(Date.now(), Date.now() + 100000);
assert.equal((await call({ action: 'issue', role: 'till', queues: zero })).status, 409);
assert.equal((await (await call({ action: 'status', role: 'till' })).json()).prints, 1);
sql.prepare('DELETE FROM print_jobs').run();
console.log('✓ Money, paper and unreadable queues refuse movement and preserve the handoff for retry');

// Settings cross through a fixed projection, with no queue or credential buckets.
const preferences = safePreferences({ kiwiLang: 'ar', kiwiTheme: 'dark', kiwiSaleQueue: '[{}]',
  kiwiPrinterCfg: JSON.stringify({ ip: '192.168.1.20', port: 9100, paper: '80', model: 'escpos', password: crypto.randomUUID() }),
  kiwiSession: crypto.randomUUID() });
assert.deepEqual(Object.keys(preferences).sort(), ['kiwiLang', 'kiwiPrinterCfg', 'kiwiTheme']);
assert.deepEqual(Object.keys(JSON.parse(preferences.kiwiPrinterCfg)).sort(), ['ip', 'model', 'paper', 'port']);
let prefResponse = await call({ action: 'issue', role: 'till', queues: zero, preferences });
let prefToken = (await prefResponse.json()).token;
assert.deepEqual((await (await exchange(prefToken)).json()).preferences, preferences);
console.log('✓ Only explicitly projected language, theme, device and printer settings cross origins');

// Employee claims are revalidated against the current roster on both origins.
const put = (feature, data) => sql.prepare('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run('move-a', feature, JSON.stringify(data), Date.now());
put('employee-access', { members: [{ id: 'move-staff', authVersion: 0 }] });
const employee = employeeCookie(await employeeToken(secret, { merchant: 'move-a', staffId: 'move-staff' })).split(';')[0];
token = await issue('employee', { cookie: employee });
const employeeExchange = await exchange(token);
assert.equal(employeeExchange.status, 200); assert.ok(employeeExchange.headers.get('Set-Cookie').startsWith('kiwi_employee='));
token = await issue('employee', { cookie: employee });
put('employee-access', { members: [] }); put('team', { members: [], removedIds: ['move-staff'] });
assert.equal((await exchange(token)).status, 422);
console.log('✓ Employee handoffs preserve employee-only authority and refuse removed staff');

await Promise.all(Array.from({ length: 12 }, () => recordOldOrigin(new Request(old + '/api/config', { headers: { Cookie: sourceCookie } }), env)));
assert.equal(writes, 1);
// A fresh isolate/cache must still respect the database throttle.
await recordOldOrigin(new Request(old + '/api/config', { headers: { Cookie: sourceCookie } }), { ...env, DB: { prepare: q => new Statement(q) } });
assert.equal(writes, 1);
await recordOldOrigin(new Request(old + '/api/config'), env);
await recordOldOrigin(new Request(target + '/api/config', { headers: { Cookie: sourceCookie } }), env);
assert.equal(writes, 1);
sql.prepare("UPDATE origin_devices SET last_seen = ?").run(Date.now() - 3600001);
await recordOldOrigin(new Request(old + '/kiwi-cuisine', { headers: { Cookie: sourceCookie } }), { ...env, DB: { prepare: q => new Statement(q) } });
assert.equal(writes, 2);
assert.equal(sql.prepare('SELECT role FROM origin_devices').get().role, 'kitchen');
sql.prepare("INSERT INTO operators (id, label, salt, hash, created_ts) VALUES ('origin-op', 'Operator', '', '', 1)").run();
const op = 'kiwi_op=' + await operatorToken(secret) + '; kiwi_op_id=' + await operatorIdToken(secret, 'origin-op');
const listing = cookie => devices({ env, request: new Request(target + '/api/admin/origin-devices', { headers: { Cookie: cookie } }) });
assert.equal((await listing(sourceCookie)).status, 403);
let projection = await (await listing(op)).json();
assert.equal(projection.devices.length, 1);
assert.deepEqual(Object.keys(projection.devices[0]).sort(), ['last_seen', 'name', 'role']);
sql.prepare('UPDATE origin_devices SET last_seen = ?').run(Date.now() - 8 * 86400000);
assert.equal((await (await listing(op)).json()).devices.length, 0);
// Owner sightings use validated sessions, never a submitted merchant claim.
sql.prepare("INSERT INTO accounts (id, email, salt, hash, created_ts) VALUES ('origin-owner', 'origin@example.invalid', '', '', 1)").run();
sql.prepare("UPDATE merchant_config SET account_id = 'origin-owner' WHERE merchant = 'move-a'").run();
await recordOldOrigin(new Request(old + '/dashboard', { headers: { Cookie: sessionCookie(await makeSession('origin-owner', secret)).split(';')[0] } }), env);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM origin_devices WHERE role = 'owner'").get().n, 1);
console.log('✓ Sightings throttle D1 writes to one/device/hour, require live auth, and project no secrets');

// Execute the real early script in a minimal browser context, without a browser suite.
const source = readFileSync(new URL('../assets/origin-move.js', import.meta.url), 'utf8');
function client(entries = {}, databases = [], factory = {}, options = {}) {
  const localStorage = { ...entries };
  Object.defineProperty(localStorage, 'getItem', { value: key => localStorage[key] || null });
  Object.defineProperty(localStorage, 'setItem', { value: (key, value) => { localStorage[key] = String(value); } });
  let domReady;
  function element(tag) {
    return { tag, children: [], handlers: {}, classList: { add() {}, remove() {} },
      setAttribute() {}, addEventListener(name, fn) { this.handlers[name] = fn; },
      append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); },
      querySelector(tagName) { return this.children.find(node => node.tag === tagName); } };
  }
  const document = { readyState: 'loading', documentElement: { lang: 'en' }, head: element('head'), body: element('body'),
    createElement: element, addEventListener: (_, fn) => { domReady = fn; } };
  const location = { hostname: options.receiving ? 'kiwi-os.com' : 'kiwi-maroc.pages.dev',
    pathname: options.receiving ? '/origin-move' : '/kiwi-caisse', search: '?pair=1', hash: options.hash || '',
    replace: url => { location.replaced = url; }, assign: url => { location.assigned = url; } };
  const indexedDB = { databases: async () => databases, ...factory };
  const posts = [], events = [];
  const fetch = async (_, opts) => {
    const body = JSON.parse(opts.body); posts.push(body); events.push('post');
    return { ok: true, json: async () => body.action === 'status' ? { prints: 0, login: false } :
      body.action === 'issue' ? { token: 'a'.repeat(64) } : { ok: true, merchant: 'move-a', role: 'till', path: '/kiwi-caisse', preferences: {} } };
  };
  const history = { replaceState() { events.push('strip'); } };
  const context = { document, location, localStorage, indexedDB, fetch, history,
    window: { indexedDB, addEventListener() {}, KiwiPairingCommit: { commit() { events.push('pair'); return { ok: true }; } } },
    setTimeout, clearTimeout, setInterval() {}, Promise, URLSearchParams };
  vm.runInNewContext(source, context);
  return { context, location, posts, events, button: () => document.body.children[0].children.at(-1), run: () => domReady(), api: context.window.KiwiOriginMove };
}
let c = client(); assert.ok(c.api.movable(await c.api.queues())); c.run();
await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(c.location.replaced, target + '/kiwi-caisse?pair=1');
for (const field of ['sales', 'prints', 'unknown']) for (let n = 1; n < 100; n++) assert.equal(c.api.movable({ ...zero, [field]: n }), false);
for (let n = 1; n < 100; n++) assert.ok(c.api.movable({ ...zero, other: n }));
c = client({ kiwiSaleQueue: '[{}]', 'kiwiKitchenPrintQueueV1:other-tenant': '[{}]' });
let queue = await c.api.queues(); assert.equal(queue.sales, 1); assert.equal(queue.prints, 1); assert.equal(c.api.movable(queue), false);
c = client({ kiwiSaleQueue: 'broken' }); assert.ok((await c.api.queues()).unknown > 0);
c = client({}, [], { databases: undefined }); assert.ok((await c.api.queues()).unknown > 0);
c = client({}, [{ name: 'kiwi-runtime-v1' }], { open() { const req = {}; queueMicrotask(() => req.onerror()); return req; } });
assert.ok((await c.api.queues()).unknown > 0);
// Exercise the actual Move handler, including programmatic clicks on disabled buttons.
for (const key of ['kiwiSaleQueue', 'kiwiKitchenPrintQueueV1:move-a']) {
  for (const n of [1, 2, 10]) {
    c = client({ [key]: JSON.stringify(Array.from({ length: n }, () => ({}))) });
    c.run(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(c.button().disabled);
    await c.button().handlers.click();
    assert.ok(!c.posts.some(body => body.action === 'issue'));
    assert.ok(!c.location.assigned);
  }
}
// A read-only fake IndexedDB drives the real cursor scanner, including foreign tenant debt.
function outbox(rows) {
  return { open() {
    const req = {};
    queueMicrotask(() => {
      const db = { close() {}, objectStoreNames: { contains: () => true }, transaction() {
        const tx = { objectStore() { return { openCursor() {
          const cursor = {}; let i = 0;
          function step() {
            cursor.result = i < rows.length ? { value: rows[i++], continue() { queueMicrotask(step); } } : null;
            cursor.onsuccess();
            if (!cursor.result) queueMicrotask(() => tx.oncomplete());
          }
          queueMicrotask(step); return cursor;
        } }; } }; return tx;
      } };
      req.result = db; req.onsuccess();
    }); return req;
  } };
}
c = client({}, [{ name: 'kiwi-runtime-v1' }], outbox([{ tenant: 'foreign', channel: 'sale' }, { tenant: 'foreign', channel: 'order' }]));
queue = await c.api.queues(); assert.equal(queue.sales, 1); assert.equal(queue.other, 1);
c.run(); await new Promise(resolve => setTimeout(resolve, 0)); assert.ok(!c.location.replaced);
await c.button().handlers.click(); assert.ok(!c.posts.some(body => body.action === 'issue'));
// Santos Store, 26 Oct: fifteen stale heartbeats and server-refused operations held the button shut.
const heartbeat = state => ({ tenant: 'move-a', channel: 'operations', state, payload: { domain: 'device', action: 'heartbeat' } });
c = client({ kiwiLang: 'en' }, [{ name: 'kiwi-runtime-v1' }], outbox([...Array.from({ length: 15 }, (_, i) => heartbeat(i % 2 ? 'blocked' : 'pending')),
  { tenant: 'move-a', channel: 'operations', state: 'blocked', payload: { domain: 'device', action: 'rename' } }]));
queue = await c.api.queues(); assert.equal(queue.other, 0); assert.equal(queue.refused, 1); assert.ok(c.api.movable(queue));
c.run(); await new Promise(resolve => setTimeout(resolve, 0));
assert.ok(!c.button().disabled);
assert.match(c.context.document.body.children[0].children[2].textContent, /1 non-financial operations stay on this device/);
await c.button().handlers.click(); assert.ok(c.location.assigned.startsWith(target + '/origin-move#kiwi-move='));
// A refused sale is money the ledger may not have seen: it still blocks.
c = client({}, [{ name: 'kiwi-runtime-v1' }], outbox([{ tenant: 'move-a', channel: 'sale', state: 'blocked', payload: {} }]));
assert.equal(c.api.movable(await c.api.queues()), false);
c.run(); await new Promise(resolve => setTimeout(resolve, 0)); assert.ok(c.button().disabled);
// Santos Store, 28 Oct: one pending non-financial command kept a selling shop on the old origin.
c = client({ kiwiLang: 'en' }, [{ name: 'kiwi-runtime-v1' }], outbox([{ tenant: 'move-a', channel: 'operations', state: 'pending', payload: { domain: 'device', action: 'rename' } }]));
queue = await c.api.queues(); assert.equal(queue.other, 1); assert.ok(c.api.movable(queue));
c.run(); await new Promise(resolve => setTimeout(resolve, 0));
assert.ok(!c.button().disabled);
assert.match(c.context.document.body.children[0].children[2].textContent, /1 non-financial operations stay on this device/);
await c.button().handlers.click(); assert.ok(c.location.assigned.startsWith(target + '/origin-move#kiwi-move='));
// The notice can be put away so the counter keeps selling while the move waits.
c = client({ kiwiSaleQueue: '[{}]' }); c.run(); await new Promise(resolve => setTimeout(resolve, 0));
const notice = c.context.document.body.children[0];
assert.ok(!notice.hidden);
notice.children.find(node => node.className === 'origin-move-hide').handlers.click();
assert.equal(notice.hidden, true);
const iconHtml = source.slice(source.indexOf("icon.innerHTML"), source.indexOf("var title"));
assert.ok(!/move_up|material-symbols/.test(source) && /<svg viewBox="0 -960 960 960"/.test(iconHtml), 'the banner icon is an inline SVG, never icon-font text');
console.log('✓ Heartbeats, refusals and pending non-financial commands never hold the Move button; sales and prints still do');
c = client({ kiwiLang: 'en' }); c.run(); await new Promise(resolve => setTimeout(resolve, 0));
await c.button().handlers.click(); assert.ok(c.location.assigned.startsWith(target + '/origin-move#kiwi-move='));
c = client({}, [], {}, { receiving: true, hash: '#kiwi-move=' + 'a'.repeat(64) });
c.run(); await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(c.events.slice(0, 2), ['strip', 'post']); assert.ok(c.events.includes('pair'));
assert.equal(c.location.replaced, '/kiwi-caisse');
c = client({ kiwiSaleQueue: '[{}]' }, [], {}, { receiving: true, hash: '#kiwi-move=' + 'a'.repeat(64) });
c.run(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(c.posts.length, 0);
console.log('✓ Actual Move handler refuses local/IndexedDB debt, including other tenants, and strips incoming fragments before POST');
for (const shell of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html', 'kiwi-cuisine.html']) {
  const html = readFileSync(new URL('../' + shell, import.meta.url), 'utf8');
  assert.ok(html.indexOf('/assets/origin-move.js') < html.indexOf('</head>'));
}
assert.ok(source.indexOf('history.replaceState') < source.indexOf("action: 'exchange'"));
console.log('✓ Real early client redirects empty origins, blocks on money, paper and unreadable storage, and can be put away');
sql.close();
