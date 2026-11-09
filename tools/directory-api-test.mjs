#!/usr/bin/env node
/* Annuaire Kiwi · les routes réelles sur SQLite en mémoire (schema.sql).
 *
 * Ce que le propriétaire a demandé, et ce qui ne doit jamais arriver :
 *   · gratuit pour tous : un commerce s'inscrit sans compte, la fiche attend
 *     la modération et n'est visible qu'une fois approuvée ;
 *   · le piège, le temps de saisie, le limiteur, les doublons et les liens
 *     dans le texte arrêtent les robots sans service payant ;
 *   · un client Kiwi n'apparaît qu'après avoir allumé sa fiche (session
 *     propriétaire), passe devant avec son badge, et disparaît quand il éteint ;
 *   · rien de privé dans le HTML ni le sitemap (contact, e-mail, téléphone non
 *     affiché, identifiants internes) ;
 *   · table absente (migration pas encore appliquée) : 200 vide, jamais 500 ;
 *   · « signaler » remplit la file, et l'opérateur retire la fiche en un geste.
 *
 *   node tools/directory-api-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie, operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import { onRequestPost as submit } from '../functions/api/directory/submit.js';
import { onRequestPost as report } from '../functions/api/directory/report.js';
import { onRequest as listingApi } from '../functions/api/directory/listing.js';
import { onRequestGet as adminGet, onRequestPatch as adminPatch } from '../functions/api/admin/directory.js';
import { onRequest as sitemap } from '../functions/sitemap-annuaire.xml.js';
import { onRequest as frPages } from '../functions/fr/annuaire/[[path]].js';
import { onRequest as arPages } from '../functions/ar/annuaire/[[path]].js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { isPublicDirectoryRequest } from '../functions/_public-pages.js';
import { TRADES, CITIES, formToken, sanitizeListing, cleanWebsite, baseSlug } from '../functions/api/_directory.js';
import { normalizePhone } from '../functions/api/_phone.js';
import { directoryDb } from './directory-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secret = 'directory-test-secret-0123456789abcdef0123';

/* The same D1 shim as the pages and browser suites, without their fixture rows. */
const database = () => directoryDb({ seed: false });
const { sql, DB } = database();
const env = { DB, AUTH_SECRET: secret };

sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-atlas', 'owner@test', 'TEST KIWI Atlas', 's', 'h', 1);
sql.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-other', 'other@test', 'TEST KIWI Autre', 's', 'h', 1);
sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, account_id, updated_ts) VALUES (?,?,?,?,?,?)")
  .run('test-kiwi-atlas', '{"orderpro":true}', 'TEST KIWI Atlas', 'cafe', 'acc-atlas', 1);
sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, account_id, updated_ts) VALUES (?,?,?,?,?,?)")
  .run('test-kiwi-autre', '{}', 'TEST KIWI Autre', 'restaurant', 'acc-other', 1);
sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,?,?)")
  .run('test-kiwi-atlas', 'hours', JSON.stringify({ week: { mon: { open: true, periods: [{ from: '08:00', to: '20:00' }] }, sun: { open: false, periods: [] } } }), 1, 1);
sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,?,?)")
  .run('test-kiwi-atlas', 'reservations', JSON.stringify({ settings: { published: true } }), 1, 1);
sql.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,?,?)")
  .run('test-kiwi-atlas', 'team', JSON.stringify({ members: [{ name: 'Secret Staff', pinCode: '4821', password: 'hunter2' }] }), 1, 1);
sql.prepare("INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?,?,?,?,?)")
  .run('test-kiwi-atlas', 'TEST KIWI Atlas', 'cafe', JSON.stringify({ cats: [], items: [{ id: 'i1', name: 'Café', price: 12 }] }), 1);

let passed = 0, failed = 0;
const ok = async (label, fn) => { try { await fn(); passed++; console.log('  ✓ ' + label); } catch (e) { failed++; console.log('  ✗ ' + label + '\n      ' + String(e && e.message || e).split('\n').slice(0, 3).join('\n      ')); } };

let ipSeq = 0;
const oldToken = () => formToken(env, Date.now() - 10_000);
const form = (fields) => new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, String(v)])).toString();
async function post(handler, url, body, { ip = '10.1.0.' + (++ipSeq), origin = 'https://kiwi-os.com', asForm = false, cookie = '' } = {}) {
  const headers = { 'CF-Connecting-IP': ip, 'Content-Type': asForm ? 'application/x-www-form-urlencoded' : 'application/json' };
  if (origin) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  const r = await handler({ env, request: new Request('https://kiwi-os.com' + url, { method: 'POST', headers, body: asForm ? form(body) : JSON.stringify(body) }) });
  const type = r.headers.get('Content-Type') || '';
  return { status: r.status, headers: r.headers, data: type.includes('json') ? await r.json() : await r.text() };
}
const page = async (p, handler = frPages, e = env) => {
  const r = await handler({ env: e, request: new Request('https://kiwi-os.com' + p) });
  return { status: r.status, headers: r.headers, html: await r.text() };
};
const GOOD = async (over = {}) => ({
  name: 'TEST KIWI Épicerie du Coin', trade: 'epicerie', city: 'rabat', address: '12 rue des Orangers, Agdal',
  description: 'Fruits, légumes et produits du terroir.', website: 'epicerie-test.example.ma', phone: '06 12 34 56 78',
  showPhone: '', whatsapp: '', contactName: 'Salma Test', email: 'salma.private@example.com', lang: 'fr', homepage: '', t: await oldToken(), ...over,
});
const rows = () => sql.prepare('SELECT * FROM directory_listings ORDER BY created_ts').all();
const ownerCookie = sessionCookie(await makeSession('acc-atlas', secret)).split(';')[0];
const otherCookie = sessionCookie(await makeSession('acc-other', secret)).split(';')[0];
const opCookie = `kiwi_op=${await operatorToken(secret)}; kiwi_op_id=${await operatorIdToken(secret, 'op-dir')}`;
sql.exec("INSERT INTO operators(id,label,salt,hash,created_ts) VALUES('op-dir','Salma (équipe)','','',1)");
const admin = async (method, q, body) => {
  const headers = { Cookie: opCookie, Origin: 'https://kiwi-os.com', 'Content-Type': 'application/json' };
  const req = new Request('https://kiwi-os.com/api/admin/directory' + q, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const r = await (method === 'GET' ? adminGet : adminPatch)({ env, request: req });
  return { status: r.status, data: await r.json() };
};

console.log('■ annuaire · les règles');
await ok('the trades are assets/trades.js trades, same ids and same FR/EN/AR labels', () => {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/trades.js'), 'utf8'), { window: w, localStorage: { getItem: () => null } });
  const byId = Object.fromEntries(w.KiwiTrades.LIST.map((t) => [t.id, t]));
  for (const t of TRADES) {
    assert.ok(byId[t.id], t.id + ' is a Kiwi trade');
    for (const l of ['fr', 'en', 'ar']) assert.equal(t.label[l], byId[t.id].label[l], `${t.id} ${l}`);
    assert.ok(fs.existsSync(path.join(root, 'assets/icons/material', t.icon + '.svg')), t.icon + '.svg is vendored');
  }
  assert.equal(new Set(TRADES.map((t) => t.slug)).size, TRADES.length);
  assert.equal(new Set(CITIES.map((c) => c.slug)).size, CITIES.length);
});
await ok('fields are bounded; links in text, bad sites and bad phones are named', () => {
  const s = (o) => sanitizeListing({ name: 'Café', trade: 'cafe', city: 'fes', ...o }, normalizePhone);
  assert.equal(s({ description: 'visit http://spam.example' }).field, 'description');
  assert.equal(s({ name: 'x' }).field, 'name');
  assert.equal(s({ trade: 'casino' }).field, 'trade');
  assert.equal(s({ city: 'paris' }).field, 'city');
  assert.equal(s({ website: 'javascript:alert(1)' }).field, 'website');
  assert.equal(s({ phone: 'call me' }).field, 'phone');
  assert.equal(s({ showPhone: '1' }).field, 'phone', 'showing a phone needs one');
  assert.equal(s({ description: 'a'.repeat(900) }).value.description.length, 600);
  assert.equal(cleanWebsite('https://user:pw@example.com'), null);
  assert.equal(cleanWebsite('example.ma/menu'), 'https://example.ma/menu');
  assert.equal(baseSlug('El', 'cafe', 'jadida'), 'el-jadida-1', 'a business slug never takes a city slug');
});

console.log('■ annuaire · table absente (migration pas encore appliquée)');
await ok('hub, city, listing and sitemap answer without the tables, never 500', async () => {
  const bare = new DatabaseSync(':memory:');
  bare.exec('CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, status TEXT, test_account INTEGER)');
  bare.exec('CREATE TABLE pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, first_ts INTEGER NOT NULL, blocked_until INTEGER)');
  const benv = { DB: { prepare: (q) => ({ a: [], bind(...a) { this.a = a.map((x) => (x === undefined ? null : x)); return this; }, async first() { return bare.prepare(q).get(...this.a) ?? null; }, async all() { return { results: bare.prepare(q).all(...this.a) }; }, async run() { bare.prepare(q).run(...this.a); return { meta: { changes: 1 } }; } }) }, AUTH_SECRET: secret };
  const hub = await page('/fr/annuaire/', frPages, benv);
  assert.equal(hub.status, 200);
  assert.match(hub.html, /L’annuaire ouvre ses portes/);
  assert.equal((await page('/fr/annuaire/casablanca/', frPages, benv)).status, 404);
  assert.equal((await page('/fr/annuaire/quelque-chose/', frPages, benv)).status, 404);
  assert.equal((await page('/fr/annuaire/ajouter/', frPages, benv)).status, 200);
  const sm = await sitemap({ env: benv, request: new Request('https://kiwi-os.com/sitemap-annuaire.xml') });
  assert.equal(sm.status, 200);
  assert.match(await sm.text(), /<loc>https:\/\/kiwi-os\.com\/fr\/annuaire\/<\/loc>/);
  const sub = await submit({ env: benv, request: new Request('https://kiwi-os.com/api/directory/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.77.0.1' }, body: JSON.stringify(await GOOD()) }) });
  assert.equal(sub.status, 503, 'a submission says unavailable instead of pretending');
});

console.log('■ annuaire · inscription publique');
await ok('a good submission is stored as pending, with its private contact, and is not public', async () => {
  const r = await post(submit, '/api/directory/submit', await GOOD());
  assert.deepEqual([r.status, r.data.ok], [200, true]);
  const row = rows()[0];
  assert.equal(row.status, 'pending');
  assert.equal(row.kind, 'public');
  assert.equal(row.contact_email, 'salma.private@example.com');
  assert.equal(row.slug, 'test-kiwi-epicerie-du-coin-rabat');
  assert.equal((await page('/fr/annuaire/test-kiwi-epicerie-du-coin-rabat/')).status, 404, 'pending is not visible');
  assert.doesNotMatch((await page('/fr/annuaire/')).html, /Épicerie du Coin/);
});
await ok('the HTML form gets a 303 to the thank-you page', async () => {
  const r = await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Pressing Form', trade: 'pressing', phone: '0522000001', email: '' }), { asForm: true });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('Location'), '/fr/annuaire/ajouter/?merci=1');
  const thanks = await page('/fr/annuaire/ajouter/?merci=1');
  assert.match(thanks.html, /Merci, votre demande est envoyée/);
});
await ok('a form error re-renders the form with the values kept and the field marked', async () => {
  const r = await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Linky', description: 'go to www.spam.example' }), { asForm: true });
  assert.equal(r.status, 400);
  assert.match(r.data, /role="alert"/);
  assert.match(r.data, /value="TEST KIWI Linky"/);
  assert.match(r.data, /id="f-description"[^>]*aria-invalid="true"/);
});
await ok('the honeypot gets a fake thank-you and nothing is written', async () => {
  const before = rows().length;
  const r = await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Robot', homepage: 'http://spam.example' }));
  assert.equal(r.status, 200);
  assert.equal(rows().length, before);
});
await ok('a form sent too fast, too late, or with a forged time is refused', async () => {
  const before = rows().length;
  for (const t of [await formToken(env), await formToken(env, Date.now() - 3 * 86400_000), String(Date.now() - 10_000), String(Date.now() - 10_000) + '.deadbeef']) {
    const r = await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Fast ' + t.slice(-4), t }));
    assert.deepEqual([r.status, r.data.error], [400, 'expired']);
  }
  assert.equal(rows().length, before);
});
await ok('no contact at all is refused; a duplicate (same name or same phone in the city) is refused', async () => {
  assert.equal((await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Nobody', phone: '', email: '' }))).data.error, 'contact');
  assert.deepEqual([(await post(submit, '/api/directory/submit', await GOOD())).status], [409]);
  assert.equal((await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Other Name', phone: '+212 6 12 34 56 78' }))).data.error, 'duplicate');
});
await ok('another origin is refused', async () => {
  assert.equal((await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Cross' }), { origin: 'https://evil.example' })).status, 403);
});
await ok('one address is cut off after 5 submissions in a quarter hour', async () => {
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Flood ' + i, phone: '06000000' + (10 + i), email: '' }), { ip: '10.9.9.9' })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

console.log('■ annuaire · modération');
const pendingId = rows().find((r) => r.slug === 'test-kiwi-epicerie-du-coin-rabat').id;
await ok('only an operator reads the queue; it carries the private contact', async () => {
  const anon = await adminGet({ env, request: new Request('https://kiwi-os.com/api/admin/directory') });
  assert.equal(anon.status, 403);
  const owner = await adminGet({ env, request: new Request('https://kiwi-os.com/api/admin/directory', { headers: { Cookie: ownerCookie } }) });
  assert.equal(owner.status, 403, 'a merchant session is not an operator');
  const r = await admin('GET', '?view=pending');
  assert.equal(r.status, 200);
  assert.ok(r.data.listings.some((l) => l.id === pendingId && l.contact_email === 'salma.private@example.com'));
  assert.ok(r.data.counts.pending >= 2);
});
await ok('approval makes it visible on the hub, its city, its trade page and its own page', async () => {
  assert.equal((await admin('PATCH', '', { id: pendingId, action: 'approve' })).status, 200);
  const hub = await page('/fr/annuaire/');
  assert.match(hub.html, /TEST KIWI Épicerie du Coin/);
  assert.equal((await page('/fr/annuaire/rabat/')).status, 200);
  assert.equal((await page('/fr/annuaire/rabat/epicerie/')).status, 200);
  const one = await page('/fr/annuaire/test-kiwi-epicerie-du-coin-rabat/');
  assert.equal(one.status, 200);
  assert.match(one.html, /"@type":"GroceryStore"/);
  assert.match(one.html, /<link rel="canonical" href="https:\/\/kiwi-os\.com\/fr\/annuaire\/test-kiwi-epicerie-du-coin-rabat\/">/);
  assert.match(one.html, /hreflang="ar" href="https:\/\/kiwi-os\.com\/ar\/annuaire\/test-kiwi-epicerie-du-coin-rabat\/"/);
  assert.match(one.html, /Signaler ou demander la suppression \/ correction/);
});
await ok('private fields never reach a page: contact email, contact name, hidden phone, internal id', async () => {
  const one = await page('/fr/annuaire/test-kiwi-epicerie-du-coin-rabat/');
  for (const secretBit of ['salma.private@example.com', 'Salma Test', '06 12 34 56 78', '0612345678', pendingId, 'dedupe']) {
    assert.ok(!one.html.includes(secretBit), 'leaks ' + secretBit);
  }
  assert.doesNotMatch(one.html, /"telephone"/);
});
await ok('a phone shown by choice appears, with tel: and WhatsApp links', async () => {
  await post(submit, '/api/directory/submit', await GOOD({ name: 'TEST KIWI Snack Phone', trade: 'fastfood', city: 'fes', phone: '0661000002', showPhone: '1', whatsapp: '1' }));
  const id = rows().find((r) => r.name === 'TEST KIWI Snack Phone').id;
  await admin('PATCH', '', { id, action: 'approve' });
  const one = await page('/fr/annuaire/test-kiwi-snack-phone-fes/');
  assert.match(one.html, /href="tel:0661000002"/);
  assert.match(one.html, /href="https:\/\/wa\.me\/212661000002"/);
  assert.match(one.html, /"telephone":"\+212661000002"/);
});
await ok('a rejected listing stays invisible', async () => {
  const id = rows().find((r) => r.name === 'TEST KIWI Pressing Form').id;
  await admin('PATCH', '', { id, action: 'reject' });
  assert.equal((await page('/fr/annuaire/test-kiwi-pressing-form-rabat/')).status, 404);
});

console.log('■ annuaire · client Kiwi (opt-in)');
await ok('a client is absent until the owner switches the listing on', async () => {
  const hub = await page('/fr/annuaire/');
  assert.doesNotMatch(hub.html, /TEST KIWI Atlas/);
  const get = await listingApi({ env, request: new Request('https://kiwi-os.com/api/directory/listing?merchant=test-kiwi-atlas', { headers: { Cookie: ownerCookie } }) });
  const j = await get.json();
  assert.equal(get.status, 200);
  assert.equal(j.listing, null);
  assert.equal(j.suggested.name, 'TEST KIWI Atlas');
  assert.equal(j.suggested.trade, 'cafe');
});
await ok('only the owner session may switch it: no session, another account, a cross origin are refused', async () => {
  const body = { merchant: 'test-kiwi-atlas', on: true, name: 'TEST KIWI Atlas', trade: 'cafe', city: 'rabat' };
  assert.equal((await post(listingApi, '/api/directory/listing', body)).status, 403);
  assert.equal((await post(listingApi, '/api/directory/listing', body, { cookie: otherCookie })).status, 403);
  assert.equal((await post(listingApi, '/api/directory/listing', body, { cookie: ownerCookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(listingApi, '/api/directory/listing', body, { cookie: opCookie })).status, 403, 'an operator alone does not switch a client on');
});
await ok('switched on: listed first with the badge, hours, menu and booking; no staff, code or sale', async () => {
  const r = await post(listingApi, '/api/directory/listing', { merchant: 'test-kiwi-atlas', on: true, name: 'TEST KIWI Atlas', trade: 'cafe', city: 'rabat',
    address: '3 avenue Fal Ould Oumeir', description: 'Café de quartier.', phone: '0537000003', showPhone: true }, { cookie: ownerCookie });
  assert.equal(r.status, 200);
  assert.equal(r.data.url, 'https://kiwi-os.com/fr/annuaire/test-kiwi-atlas-rabat/');
  const city = await page('/fr/annuaire/rabat/');
  const first = city.html.indexOf('TEST KIWI Atlas'), other = city.html.indexOf('TEST KIWI Épicerie');
  assert.ok(first > 0 && other > first, 'the client comes first');
  assert.match(city.html, /dir-card--client/);
  const one = await page('/fr/annuaire/test-kiwi-atlas-rabat/');
  assert.match(one.html, /Client Kiwi/);
  assert.match(one.html, /href="\/order\?s=test-kiwi-atlas"/, 'OrderPro menu link');
  assert.match(one.html, /href="\/booking\?merchant=test-kiwi-atlas"/, 'booking link');
  assert.match(one.html, /08:00 – 20:00/);
  assert.match(one.html, /"openingHoursSpecification"/);
  for (const secretBit of ['Secret Staff', '4821', 'hunter2', 'acc-atlas', 'owner@test']) assert.ok(!one.html.includes(secretBit), 'leaks ' + secretBit);
});
await ok('a suspended or test-account store is hidden even when switched on', async () => {
  sql.exec("UPDATE merchant_config SET status = 'suspended' WHERE merchant = 'test-kiwi-atlas'");
  assert.equal((await page('/fr/annuaire/test-kiwi-atlas-rabat/')).status, 404);
  sql.exec("UPDATE merchant_config SET status = NULL, test_account = 1 WHERE merchant = 'test-kiwi-atlas'");
  assert.equal((await page('/fr/annuaire/test-kiwi-atlas-rabat/')).status, 404);
  sql.exec("UPDATE merchant_config SET test_account = 0 WHERE merchant = 'test-kiwi-atlas'");
  assert.equal((await page('/fr/annuaire/test-kiwi-atlas-rabat/')).status, 200);
});
await ok('switched off: gone from every page, row kept', async () => {
  const r = await post(listingApi, '/api/directory/listing', { merchant: 'test-kiwi-atlas', on: false }, { cookie: ownerCookie });
  assert.equal(r.status, 200);
  assert.equal(r.data.listing.on, false);
  assert.equal((await page('/fr/annuaire/test-kiwi-atlas-rabat/')).status, 404);
  assert.doesNotMatch((await page('/fr/annuaire/rabat/')).html, /TEST KIWI Atlas/);
  await post(listingApi, '/api/directory/listing', { merchant: 'test-kiwi-atlas', on: true, name: 'TEST KIWI Atlas', trade: 'cafe', city: 'rabat' }, { cookie: ownerCookie });
  assert.equal((await page('/fr/annuaire/test-kiwi-atlas-rabat/')).status, 200);
});

console.log('■ annuaire · signaler, retirer');
await ok('a report files a request; an operator removes the listing in one action', async () => {
  const r = await post(report, '/api/directory/report', { slug: 'test-kiwi-epicerie-du-coin-rabat', kind: 'removal', message: 'Je suis le gérant, merci de retirer la fiche.', contact: 'gerant@example.com', lang: 'fr', t: await oldToken(), homepage: '' });
  assert.deepEqual([r.status, r.data.ok], [200, true]);
  const q = await admin('GET', '?view=requests');
  const req = q.data.requests.find((x) => x.slug === 'test-kiwi-epicerie-du-coin-rabat');
  assert.ok(req && req.kind === 'removal' && req.contact === 'gerant@example.com');
  assert.equal(q.data.counts.requests, 1);
  assert.equal((await admin('PATCH', '', { requestId: req.id, action: 'remove' })).status, 200);
  assert.equal((await page('/fr/annuaire/test-kiwi-epicerie-du-coin-rabat/')).status, 404);
  assert.equal((await admin('GET', '?view=requests')).data.counts.requests, 0, 'the request is closed with the removal');
});
await ok('a report on a missing listing is 404; the HTML report form round-trips with a 303', async () => {
  assert.equal((await post(report, '/api/directory/report', { slug: 'nope-rabat', kind: 'correction', message: 'faux', lang: 'fr', t: await oldToken() })).status, 404);
  const f = await post(report, '/api/directory/report', { slug: 'test-kiwi-snack-phone-fes', kind: 'correction', message: 'Le numéro a changé.', lang: 'fr', t: await oldToken() }, { asForm: true });
  assert.equal(f.status, 303);
  assert.equal(f.headers.get('Location'), '/fr/annuaire/test-kiwi-snack-phone-fes/signaler/?merci=1');
});
await ok('an operator can remove a client listing too, and the owner cannot switch it back on', async () => {
  const id = rows().find((r) => r.merchant === 'test-kiwi-atlas').id;
  await admin('PATCH', '', { id, action: 'remove' });
  const r = await post(listingApi, '/api/directory/listing', { merchant: 'test-kiwi-atlas', on: true, name: 'TEST KIWI Atlas', trade: 'cafe', city: 'rabat' }, { cookie: ownerCookie });
  assert.deepEqual([r.status, r.data.error], [409, 'removed-by-kiwi']);
  await admin('PATCH', '', { id, action: 'restore' });
  assert.equal(rows().find((x) => x.id === id).status, 'off', 'restore hands the decision back to the owner');
});

console.log('■ annuaire · sitemap, arabe, porte');
await ok('the sitemap lists the visible pages in three languages, nothing pending or private', async () => {
  const xml = await (await sitemap({ env, request: new Request('https://kiwi-os.com/sitemap-annuaire.xml') })).text();
  assert.match(xml, /<loc>https:\/\/kiwi-os\.com\/fr\/annuaire\/test-kiwi-snack-phone-fes\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/kiwi-os\.com\/en\/directory\/fes\/snack\/<\/loc>/);
  assert.match(xml, /hreflang="ar" href="https:\/\/kiwi-os\.com\/ar\/annuaire\/fes\/"/);
  assert.doesNotMatch(xml, /epicerie-du-coin|pressing-form|flood|@/i);
  for (const loc of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) assert.ok(loc[1].endsWith('/'), loc[1]);
});
await ok('the Arabic pages are RTL with Arabic chrome; a business text stays as written', async () => {
  const ar = await page('/ar/annuaire/test-kiwi-snack-phone-fes/', arPages);
  assert.equal(ar.status, 200);
  assert.match(ar.html, /<html lang="ar" dir="rtl">/);
  assert.match(ar.html, /الإبلاغ أو طلب الحذف/);
  assert.match(ar.html, /TEST KIWI Snack Phone/);
});
await ok('a path without its slash is redirected; a search is noindex; a filter has its own URL', async () => {
  const r = await frPages({ env, request: new Request('https://kiwi-os.com/fr/annuaire/fes') });
  assert.deepEqual([r.status, r.headers.get('Location')], [308, '/fr/annuaire/fes/']);
  assert.match((await page('/fr/annuaire/?q=snack')).html, /<meta name="robots" content="noindex, follow">/);
  const f = await frPages({ env, request: new Request('https://kiwi-os.com/fr/annuaire/?ville=fes&metier=snack') });
  assert.deepEqual([f.status, f.headers.get('Location')], [302, '/fr/annuaire/fes/snack/']);
});
await ok('the gate opens exactly the two public posts and the sitemap, not the owner or operator routes', async () => {
  assert.equal(isPublicDirectoryRequest('POST', '/api/directory/submit'), true);
  assert.equal(isPublicDirectoryRequest('POST', '/api/directory/report'), true);
  assert.equal(isPublicDirectoryRequest('GET', '/sitemap-annuaire.xml'), true);
  for (const [m, p] of [['POST', '/api/directory/listing'], ['GET', '/api/directory/listing'], ['GET', '/api/admin/directory'], ['PATCH', '/api/admin/directory'], ['GET', '/api/directory/submit'], ['DELETE', '/sitemap-annuaire.xml']]) {
    assert.equal(isPublicDirectoryRequest(m, p), false, `${m} ${p}`);
  }
  const SERVED = 'served';
  const call = (p, method = 'GET') => middleware({
    request: new Request('https://kiwi-os.com' + p, { method, headers: { Accept: 'text/html' } }),
    env: { AUTH_SECRET: secret, ASSETS: { fetch: async () => new Response('x', { status: 200 }) } },
    next: async () => new Response(SERVED, { status: 200 }),
  });
  for (const [p, m] of [['/fr/annuaire/', 'GET'], ['/en/directory/fes/', 'GET'], ['/ar/annuaire/ajouter/', 'GET'], ['/sitemap-annuaire.xml', 'GET'], ['/api/directory/submit', 'POST'], ['/api/directory/report', 'POST']]) {
    assert.equal(await (await call(p, m)).text(), SERVED, `${m} ${p} passes the gate`);
  }
  for (const [p, m] of [['/api/directory/listing', 'POST'], ['/api/admin/directory', 'GET']]) {
    assert.notEqual((await call(p, m)).status, 200, `${m} ${p} stays behind the gate`);
  }
  assert.match(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/kiwi-os\.com\/sitemap-annuaire\.xml/);
});

console.log(`\n${failed ? '✗' : '✓'} directory api · ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
