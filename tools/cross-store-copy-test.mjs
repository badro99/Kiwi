#!/usr/bin/env node
/* No store may publish another store's records (functions/api/_tenant-guard.js).
 *
 * Replays, through the real /api/store and /api/menu routes, the three leaks
 * found in production on 2026-09-26 — a whole carte swapped for a neighbour's,
 * a first upload that was another store's document, a union merge that folded
 * another store's bookings into this one's — and the honest writes that must
 * keep working around them: seeded templates, a store's own new records, an
 * old leak already on the row, briefing.
 *
 * Synthetic data only. `node tools/cross-store-copy-test.mjs`
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestPost: storePost } = await import(path.join(ROOT, 'functions/api/store.js'));
const { onRequestPost: menuPost } = await import(path.join(ROOT, 'functions/api/menu.js'));
const G = await import(path.join(ROOT, 'functions/api/_tenant-guard.js'));
const { makeSession, sessionCookie, DEMO_MERCHANTS } = await import(path.join(ROOT, 'functions/auth/_lib.js'));

let fails = 0, passed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); return; }
  fails++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\n      ${detail}` : ''}`);
}

const AUTH_SECRET = 'tenant-guard-secret-0123456789abcdef';
const now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));

const stmt = (q, p) => {
  const st = db.prepare(q);
  const select = /^\s*select/i.test(q);
  return {
    async first() { const r = st.get(...p); return r === undefined ? null : r; },
    async all() { return { results: st.all(...p) }; },
    async run() { if (select) return { results: st.all(...p), success: true }; const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
  };
};
const env = { AUTH_SECRET, DB: {
  prepare(q) { return { bind(...p) { return stmt(q, p); }, ...stmt(q, []) }; },
  async batch(list) {
    db.exec('BEGIN');
    try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; }
    catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
} };

/* Four stores, three accounts. cafe-nord and cafe-nord-2 share an owner — the
 * Art de Table case: same account, still two books. */
const STORES = [
  ['acc-nord', 'cafe-nord', 'Cafe Nord', 'restaurant'],
  ['acc-nord', 'cafe-nord-2', 'Cafe Nord 2', 'restaurant'],
  ['acc-sud', 'resto-sud', 'Resto Sud', 'restaurant'],
  ['acc-est', 'shop-est', 'Shop Est', 'boutique'],
];
const accounts = new Set();
for (const [acc, slug, name, type] of STORES) {
  if (!accounts.has(acc)) {
    accounts.add(acc);
    db.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES (?,?,?,?,?,?,?)')
      .run(acc, acc + '@example.test', name, 's', 'h', now, 'active');
  }
  db.prepare("INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,subscription_kind,updated_ts) VALUES (?,'{}','pro',?,?,?,'active','paid',?)")
    .run(slug, type, acc, name, now);
}
const cookie = {};
for (const acc of accounts) cookie[acc] = sessionCookie(await makeSession(acc, AUTH_SECRET));

const post = (fn, acc, body) => fn({ env, request: new Request('https://kiwi.test/api/x', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie[acc], 'CF-Connecting-IP': '10.0.0.9' },
  body: JSON.stringify(body),
}) });
const doc = (m, f) => { const r = db.prepare('SELECT data, rev FROM store_docs WHERE merchant=? AND feature=?').get(m, f); return r ? { data: JSON.parse(r.data), rev: r.rev } : null; };
const put = async (acc, merchant, feature, data) => {
  const cur = doc(merchant, feature);
  const res = await post(storePost, acc, { feature, merchant, baseRev: cur ? cur.rev : 0, data });
  return { status: res.status, body: await res.json() };
};
const events = () => db.prepare('SELECT * FROM tenant_guard_events ORDER BY ts').all();

/* Realistic records: ids, names, and the millisecond timestamps a person's
 * edit stamps. */
const booking = (id, who, t) => ({ id, code: 'R-' + id.toUpperCase(), customer: { name: who, phone: '+2126000000' + id.length },
  serviceId: 'svc-1', startAt: t, endAt: t + 5400000, partySize: 2, status: 'confirmed', createdAt: t - 86400000, updatedAt: t - 86400000 });
const cost = (id, name, t) => ({ id, name, unit: 'kg', unitCost: 42.5, supplier: 'Marché central', updatedAt: t });

console.log('\n\x1b[1mTenant guard · no store publishes another store\'s records\x1b[0m');
for (const [, slug] of STORES) ok(`${slug} is not a demo slug (a demo slug lets anyone in)`, !DEMO_MERCHANTS[slug]);

/* ── 1. Seed cafe-nord's real books ────────────────────────────────────── */
const NORD_COSTS = { items: Object.fromEntries(['tomates', 'oignons', 'semoule', 'agneau', 'poulet', 'olives', 'citrons']
  .map((n, i) => [n, cost('c-' + n, n, now - 3e9 + i * 1000)])) };
const NORD_RES = { v: 1, settings: {}, services: [], resources: [], blocked: [],
  bookings: ['aaa1', 'bbb2', 'ccc3', 'ddd4'].map((id, i) => booking(id, 'Client Nord ' + i, now + i * 3600000)) };
ok('cafe-nord saves its costs', (await put('acc-nord', 'cafe-nord', 'costs', NORD_COSTS)).status === 200);
ok('cafe-nord saves its reservations', (await put('acc-nord', 'cafe-nord', 'reservations', NORD_RES)).status === 200);

/* ── 2. First upload that is another store's document (Pasta Corner, Santos) */
{
  const r = await put('acc-sud', 'resto-sud', 'costs', NORD_COSTS);
  ok('a first upload identical to another store\'s costs is refused', r.status === 409 && r.body.error === 'foreign-document', JSON.stringify(r));
  ok('…and nothing is written', doc('resto-sud', 'costs') === null);
  const e = events().at(-1);
  ok('…and the refusal is logged with the source store', e && e.merchant === 'resto-sud' && e.source_merchant === 'cafe-nord' && e.feature === 'costs', JSON.stringify(e));
}

/* ── 3. Union merge: own bookings plus another store's ───────────────────── */
{
  const own = { ...NORD_RES, bookings: [booking('sud1', 'Client Sud', now + 7200000)] };
  ok('resto-sud saves its own reservations', (await put('acc-sud', 'resto-sud', 'reservations', own)).status === 200);
  const merged = { ...own, bookings: own.bookings.concat(NORD_RES.bookings) };
  const r = await put('acc-sud', 'resto-sud', 'reservations', merged);
  ok('a save that folds in another store\'s bookings is refused', r.status === 409 && r.body.error === 'foreign-document', JSON.stringify(r));
  ok('…the device gets the server copy back to adopt', r.body.data && r.body.data.bookings.length === 1 && r.body.data.bookings[0].id === 'sud1');
  const withOne = { ...own, bookings: own.bookings.concat(NORD_RES.bookings.slice(0, 1)) };
  const r1 = await put('acc-sud', 'resto-sud', 'reservations', withOne);
  ok('even a single copied booking with its timestamps is refused', r1.status === 409, JSON.stringify(r1));
}

/* ── 4. Same owner, other store (Art de Table ← Amira Boutique) ─────────── */
{
  const r = await put('acc-nord', 'cafe-nord-2', 'reservations', NORD_RES);
  ok('the same owner\'s second store cannot take the first store\'s bookings', r.status === 409 && r.body.error === 'foreign-document');
}

/* ── 5. Honest writes keep working ─────────────────────────────────────── */
{
  const cur = doc('resto-sud', 'reservations').data;
  const next = { ...cur, bookings: cur.bookings.concat([booking('sud2', 'Client Sud 2', now + 9e6)]) };
  ok('a store adding its own new booking is accepted', (await put('acc-sud', 'resto-sud', 'reservations', next)).status === 200);
  const nordNext = { ...NORD_RES, bookings: NORD_RES.bookings.concat([booking('eee5', 'Client Nord 5', now + 5e6)]) };
  ok('the true owner keeps saving its own document', (await put('acc-nord', 'cafe-nord', 'reservations', nordNext)).status === 200);

  // Templates stamp updatedAt: 0 (assets/reservations.js › tpl-*).
  const TEMPLATE = { v: 1, settings: { confirmation: 'instant' }, services: ['classic-lunch', 'classic-dinner', 'groups-meal']
    .map((id) => ({ id: 'tpl-' + id, name: id, duration: 90, price: 0, deposit: 0, capacity: 1, resourceIds: [], active: true, updatedAt: 0 })),
  resources: [], blocked: [], bookings: [] };
  ok('a seeded template identical in two stores is accepted (first store)', (await put('acc-nord', 'cafe-nord-2', 'reservations', TEMPLATE)).status === 200);
  ok('…and in the next store', (await put('acc-est', 'shop-est', 'reservations', TEMPLATE)).status === 200);

  // Content held by two or more other stores is a shared template.
  const SHARED = { list: [{ id: 'ret-shared', kind: 'avoir', amount: 10, reason: 'Modèle partagé', ts: now - 1e9, actor: 'Kiwi' }] };
  await put('acc-nord', 'cafe-nord', 'returns', SHARED);
  db.prepare("INSERT INTO store_docs VALUES ('cafe-nord-2','returns',?,1,?)").run(JSON.stringify(SHARED), now);
  ok('content already shared by two other stores is not treated as a copy', (await put('acc-sud', 'resto-sud', 'returns', SHARED)).status === 200);
}

/* ── 6. An old leak already on the row does not lock the store out ─────── */
{
  const leaked = { v: 1, settings: {}, services: [], resources: [], blocked: [], bookings: [NORD_RES.bookings[1]] };
  db.prepare("INSERT INTO store_docs VALUES ('shop-est','old-leak-probe',?,1,?)").run('{}', now);
  db.prepare("UPDATE store_docs SET data=?, rev=rev+1 WHERE merchant='shop-est' AND feature='reservations'").run(JSON.stringify(leaked));
  const cur = doc('shop-est', 'reservations').data;
  const next = { ...cur, bookings: cur.bookings.concat([booking('est1', 'Client Est', now + 4e6)]) };
  ok('a store whose row already carries an old copy can still add its own records', (await put('acc-est', 'shop-est', 'reservations', next)).status === 200);
}

/* ── 7. Briefing is exempt (cross-filed empty days, known) ─────────────── */
{
  const day = (v, d) => ({ id: `session:${v}:${d}`, accountId: 'session', venue: v, day: d, generatedAt: now - 1e8, updatedAt: now - 1e8, lines: [], dismissed: {}, handled: {} });
  const B = { days: [day('cafe-nord', '2026-09-20'), day('cafe-nord', '2026-09-21')] };
  await put('acc-nord', 'cafe-nord', 'briefing', B);
  ok('briefing days are not judged', (await put('acc-sud', 'resto-sud', 'briefing', B)).status === 200);
}

/* ── 8. The carte (Pasta Corner ← Amira Café) ──────────────────────────── */
const dish = (id, name, price, cat) => ({ id, name, price, catId: cat, subId: '', desc: 'Préparé maison chaque matin, servi avec pain', avail: true });
const NORD_MENU = { cats: [{ id: 'c1', name: 'Plats' }, { id: 'c2', name: 'Boissons' }],
  items: [['it_1', 'Tajine poulet citron', 85], ['it_2', 'Couscous sept légumes', 90], ['it_3', 'Pastilla au poulet', 95],
    ['it_4', 'Harira', 30], ['it_5', 'Salade marocaine', 35], ['it_6', 'Thé à la menthe', 15]].map(([id, n, p], i) => dish(id, n, p, i < 5 ? 'c1' : 'c2')) };
const SUD_MENU = { cats: [{ id: 'c1', name: 'Pâtes' }],
  items: [['it_1', 'Lasagna', 95], ['it_2', 'Penne arrabbiata', 80], ['it_3', 'Tiramisu', 45]].map(([id, n, p]) => dish(id, n, p, 'c1')) };
const menuRow = (m) => db.prepare('SELECT data, updated_ts FROM menus WHERE merchant=?').get(m);
const publish = async (acc, merchant, data) => {
  const row = menuRow(merchant);
  const res = await post(menuPost, acc, { merchant, type: 'restaurant', data, expectedUpdatedTs: row ? row.updated_ts : 0 });
  return { status: res.status, body: await res.json() };
};
{
  ok('cafe-nord publishes its carte', (await publish('acc-nord', 'cafe-nord', NORD_MENU)).status === 200);
  ok('resto-sud publishes its carte', (await publish('acc-sud', 'resto-sud', SUD_MENU)).status === 200);
  const before = menuRow('resto-sud').data;
  const r = await publish('acc-sud', 'resto-sud', NORD_MENU);
  ok('a carte replaced by a neighbour\'s is refused', r.status === 409 && r.body.error === 'foreign-document', JSON.stringify(r));
  ok('…the real carte stays in place', menuRow('resto-sud').data === before);
  ok('…and the browser gets it back to adopt', r.body.data && r.body.data.items.some((i) => i.name === 'Lasagna'));
  const oneDish = { ...SUD_MENU, items: SUD_MENU.items.concat([dish('it_9', 'Harira', 30, 'c1')]) };
  oneDish.items[3] = NORD_MENU.items[3];
  ok('one dish that happens to match a neighbour\'s is still accepted', (await publish('acc-sud', 'resto-sud', oneDish)).status === 200);
  const own = { ...SUD_MENU, items: SUD_MENU.items.concat([dish('it_4', 'Carbonara', 90, 'c1')]) };
  ok('a restaurant adding its own dish is accepted', (await publish('acc-sud', 'resto-sud', own)).status === 200);
  ok('a fresh restaurant cannot publish a neighbour\'s carte as its first', (await publish('acc-nord', 'cafe-nord-2', NORD_MENU)).status === 409);
}

/* ── 9. History: the previous version survives an overwrite ────────────── */
{
  const hist = (m, k, f) => db.prepare('SELECT data, saved_ts FROM doc_history WHERE merchant=? AND kind=? AND feature=? ORDER BY saved_ts').all(m, k, f);
  ok('an overwritten document leaves its previous version in doc_history', hist('cafe-nord', 'store', 'reservations').length === 1
    && JSON.parse(hist('cafe-nord', 'store', 'reservations')[0].data).bookings.length === 4);
  ok('an overwritten carte leaves its previous version', hist('resto-sud', 'menu', 'menu').length === 1
    && JSON.parse(hist('resto-sud', 'menu', 'menu')[0].data).items.length === 3);
  const cur = doc('cafe-nord', 'reservations').data;
  await put('acc-nord', 'cafe-nord', 'reservations', { ...cur, bookings: cur.bookings.concat([booking('fff6', 'Client Nord 6', now + 6e6)]) });
  ok('a burst keeps the version from before the burst (one per 10 minutes)', hist('cafe-nord', 'store', 'reservations').length === 1);
  for (let i = 0; i < 35; i++) db.prepare("INSERT INTO doc_history VALUES ('cafe-nord','store','costs','{}',1,?,?)").run(now, now - (i + 1) * 3600000);
  await G.keepHistory({ DB: env.DB }, 'store', 'cafe-nord', 'costs');
  ok('history keeps the 30 most recent versions', hist('cafe-nord', 'store', 'costs').length === 30);
  ok('…the newest of which is the one just saved', hist('cafe-nord', 'store', 'costs').at(-1).data === JSON.stringify(NORD_COSTS));
}

/* ── 10. Pure rules and failure mode ───────────────────────────────────── */
{
  ok('records without a timestamp never count for store documents', !G.distinctive(JSON.stringify({ id: 'tpl-classic', name: 'Déjeuner classique', duration: 90, price: 0, updatedAt: 0, capacity: 1 })));
  ok('judge: two exclusive matches from one store is a copy', G.judge([['a'], ['a'], []], null)?.from === 'a');
  ok('judge: a sample held by two stores is ignored', G.judge([['a', 'b'], ['a', 'b']], null) === null);
  ok('judge (carte): two dishes are not enough', G.judge([['a'], ['a'], [], [], [], []], null, true) === null);
  ok('judge (carte): half the samples, at least three', G.judge([['a'], ['a'], ['a'], [], [], []], null, true)?.from === 'a');
  const broken = { DB: { prepare() { return { bind() { return this; } }; }, async batch() { throw new Error('D1 down'); } } };
  ok('a database error lets the write through (the guard is never the outage)',
    await G.foreignCopy(broken, { table: 'store', merchant: 'x', feature: 'costs', next: NORD_COSTS, current: null, text: JSON.stringify(NORD_COSTS) }) === null);
}

/* ── 11. The browsers drop a refused copy instead of retrying it ───────── */
{
  const menuSrc = fs.readFileSync(path.join(ROOT, 'assets/menu-catalog.js'), 'utf8');
  ok('the carte editor adopts the server carte on foreign-document', /err\.error === 'stale-menu' \|\| err\.error === 'foreign-document'\) && err\.data\)/.test(menuSrc));
  const docSrc = fs.readFileSync(path.join(ROOT, 'assets/cloud-doc.js'), 'utf8');
  ok('store documents adopt the server copy on foreign-document', /error === 'foreign-document'[\s\S]{0,200}opts\.write\(/.test(docSrc));
  const storeSrc = fs.readFileSync(path.join(ROOT, 'functions/api/store.js'), 'utf8');
  ok('the store route judges before its first write statement',
    storeSrc.indexOf('foreignCopy(env') > 0 && storeSrc.indexOf('foreignCopy(env') < storeSrc.indexOf("'UPDATE store_docs SET data=?"));
}

console.log(`\n${fails ? '\x1b[31m' : '\x1b[32m'}cross-store-copy: ${passed} passed, ${fails} failed\x1b[0m`);
process.exit(fails ? 1 : 0);
