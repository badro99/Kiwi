#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const source = read('assets/briefing.js');
const shell = read('dashboard.html');
const sw = read('kiwi-sw.js');
const agent = read('assets/agent.js');
const storeSource = read('functions/api/store.js');

const callbacks = {};
const memory = {};
const localStorage = { getItem: (k) => memory[k] || null, setItem: (k, v) => { memory[k] = String(v); }, removeItem: (k) => { delete memory[k]; } };
const document = {
  readyState: 'loading', documentElement: { lang: 'fr' }, head: { appendChild() {} },
  querySelector() { return null; }, createElement() { return { setAttribute() {}, addEventListener() {}, className: '', textContent: '' }; },
  addEventListener(name, fn) { callbacks[name] = fn; }
};
const window = {
  document, localStorage, KiwiEnv: { isReal: () => true }, KiwiMe: { accountId: 'acc-7' },
  KiwiCloudDoc: { currentSlug: () => 'amira-cafe' }, KiwiDayReport: { businessDay: () => '2026-08-20', cutoff: () => 5 },
  KiwiAgentTier: () => 'manager', addEventListener() {}
};
window.window = window;
vm.runInNewContext(source, { window, document, localStorage, console, Date, setTimeout, clearTimeout }, { filename: 'assets/briefing.js' });
const B = window.KiwiBriefing;

assert.ok(B, 'briefing API is exposed');
assert.equal(B._test.scopeKey(), 'acc-7:amira-cafe:2026-08-20', 'cache is account + venue + business day scoped');
assert.equal(B._test.businessDay(new Date('2026-08-21T03:30:00Z').getTime()), '2026-08-20', 'business day comes from KiwiDayReport');

for (const q of ['le point du matin', 'morning briefing', 'ملخص الصباح', 'point dyal sbah', 'شنو خاصني نعرف اليوم']) {
  assert.equal(B.canHandle(q), true, `briefing route: ${q}`);
}
for (const q of ["qu'est-ce que tu surveilles ?", 'what do you monitor?', 'شنو كتراقب']) {
  assert.equal(B.canHandle(q), true, `coverage route: ${q}`);
  assert.equal(B.reply(q, { lang: q.includes('what') ? 'en' : 'fr', role: 'owner' }).stats.length, 2, 'coverage lists connected and blocked families');
}

const withEvidence = B._test.normalizeLine({ id: 'x', kind: 'test', roles: ['owner'], copy: { fr: 'Mesure' }, evidence: { count: 4, window: 'jour', source: 'fixture' } });
assert.ok(withEvidence, 'a measured line is accepted');
assert.equal(B._test.normalizeLine({ id: 'x', copy: { fr: 'Sans preuve' } }), null, 'no line without evidence');
assert.equal(B._test.visibleLines([withEvidence], 'manager').length, 0, 'role filtering hides owner lines');
assert.equal(B._test.visibleLines([withEvidence], 'owner').length, 1, 'role filtering keeps entitled lines');
const empty = B._test.compute([]);
assert.ok(empty && empty.lines.length === 0, 'zero rules produce a calm empty briefing');
assert.ok(memory['kiwi:briefing:v1:acc-7:amira-cafe:2026-08-20'], 'empty result is cached for the business day');

window.KiwiEnv.isReal = () => false;
assert.equal(B._test.compute([]), null, 'demo mode computes no briefing');
assert.ok(/demo never fabricates alerts/i.test(B.reply('morning briefing', { lang: 'en' }).text), 'demo route refuses fabricated alerts');

assert.ok(agent.includes("lastRouteKind = 'briefing'") && agent.includes("return 'briefing'"), 'assistant delegates both answers and route labels');
assert.ok(/assets\/briefing\.js\?v=\d+/.test(shell), 'dashboard loads stamped briefing asset');
const stamp = shell.match(/assets\/briefing\.js\?v=(\d+)/)[1];
assert.ok(sw.includes(`/assets/briefing.js?v=${stamp}`), 'service worker precaches the same briefing stamp');
assert.ok(/briefing:\s*\{ keys: \['days'\]/.test(storeSource), 'briefing document is allow-listed');
assert.ok(/REDACT[^\n]*briefing:\s*stripBriefing/.test(storeSource), 'briefing money cache is redacted');

const { onRequestGet, onRequestPost } = await import(path.join(ROOT, 'functions/api/store.js'));
const { tillToken, makeSession, sessionCookie } = await import(path.join(ROOT, 'functions/auth/_lib.js'));
const AUTH_SECRET = 'briefing-test-secret-0123456789';
const SHOP = 'briefing-fixture-shop';
const now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);
CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER, first_ts INTEGER, blocked_until INTEGER);
`);
db.prepare(`INSERT INTO accounts VALUES ('acc-1','owner@example.test','Briefing Fixture','s','h',?,'active')`).run(now);
db.prepare(`INSERT INTO merchant_config VALUES (?, '{}','pro','restaurant','acc-1','Briefing Fixture','active',?)`).run(SHOP, now);
const privateDoc = { days: [{ id: 'acc-1:' + SHOP + ':2026-08-20', day: '2026-08-20', lines: [{ id: 'sales', amount: 12000 }] }] };
db.prepare(`INSERT INTO store_docs VALUES (?,'briefing',?,1,?)`).run(SHOP, JSON.stringify(privateDoc), now);
const DB = { prepare(q) { const st = db.prepare(q); return { bind(...p) { return { async first() { return st.get(...p); }, async all() { return { results: st.all(...p) }; }, async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; } }; } }; }, async batch(stmts) { return Promise.all(stmts); } };
const env = { AUTH_SECRET, DB };
const till = `kiwi_till=${await tillToken(AUTH_SECRET, SHOP)}`;
const owner = sessionCookie(await makeSession('acc-1', AUTH_SECRET));
const callGet = (cookie) => onRequestGet({ request: new Request(`https://k/api/store?feature=briefing&merchant=${SHOP}`, { headers: { Cookie: cookie } }), env });

let res = await callGet(till); let body = await res.json();
assert.equal(res.status, 200); assert.deepEqual(body.data, { days: [] }, 'paired till reads a redacted briefing');
res = await callGet(owner); body = await res.json();
assert.equal(res.status, 200); assert.equal(body.data.days[0].lines[0].amount, 12000, 'owner reads the measured briefing');
res = await onRequestPost({ request: new Request('https://k/api/store', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: till }, body: JSON.stringify({ feature: 'briefing', merchant: SHOP, data: { days: [] }, baseRev: 1 }) }), env });
assert.equal(res.status, 403, 'read-redacted paired till is write-refused');
assert.match(db.prepare(`SELECT data FROM store_docs WHERE merchant=? AND feature='briefing'`).get(SHOP).data, /12000/, 'refused write leaves private figures intact');

console.log('briefing-test: 24 controls passed');
