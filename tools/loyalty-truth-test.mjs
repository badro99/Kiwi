#!/usr/bin/env node
/* Loyalty truth (2026-10-20). Runs the real /api/clients handlers on node:sqlite
 * and the real assets/clients-store.js in a vm, and holds four rules that were
 * broken in production code:
 *
 *  1. « 10 cafés = 1 offert » stamped every sale, coffee or not. A product card
 *     now earns one stamp per qualifying item, matched by word, accents ignored.
 *  2. A redemption was accepted with no programme switched on (100 points by
 *     default). The API now refuses it, like the till.
 *  3. Points rounded to the nearest point: 99,50 MAD crossed a 100-point
 *     threshold. They now round down, like prices.
 *  4. A return never took a stamp back. It now takes back what that ticket
 *     earned, never more.
 *
 * Plus the boutique and maison tills: the ticket-level loyalty discount and the
 * points toast follow the same round-down rule.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as clientsPost } from '../functions/api/clients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'loyalty-truth-secret';
const MERCHANT = 'loyalty-truth-merchant';
let checks = 0;
const check = (ok, msg) => { checks += 1; assert.ok(ok, msg); console.log(`  ✓ ${msg}`); };

function facade(raw) {
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...v) { args = v.map((x) => x === undefined ? null : x); return st; },
        async first() { return raw.prepare(sql).get(...args) || null; },
        async all() { return { results: raw.prepare(sql).all(...args) }; },
        async run() { const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
      };
      return st;
    },
    async batch(list) {
      raw.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const s of list) out.push(await s.run()); raw.exec('COMMIT'); return out; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}

const owner = sessionCookie(await makeSession('loyalty-owner', SECRET)).split(';')[0];

function store(cfg) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('loyalty-owner', 'loyalty@example.test', 'Owner', 'Store', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Store', 'loyalty-owner', now);
  if (cfg) raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'fidelity', JSON.stringify(cfg), 1, now);
  raw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'c1', 'Client', 0, 0, 0, 0, now, now);
  const env = { DB: facade(raw), AUTH_SECRET: SECRET };
  const post = async (body) => {
    const res = await clientsPost({ env, request: new Request('https://kiwi.test/api/clients', {
      method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
      body: JSON.stringify({ merchant: MERCHANT, ...body }),
    }) });
    return { status: res.status, body: await res.json() };
  };
  const row = () => raw.prepare('SELECT points, stamps, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'c1');
  return { post, row, raw };
}

console.log('\nCarte produit : un tampon par article choisi, pas par passage');
{
  const s = store({ model: 'product', product: { item: 'Café', target: 10, reward: '1 offert' } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:1', amount: 95, saleRef: 'T1', items: [{ name: 'Tajine poulet citron', qty: 1, total: 95 }] } });
  check(Number(s.row().stamps) === 0 && Number(s.row().visits) === 1, 'a tajine alone earns no coffee stamp (the visit still counts)');
  await s.post({ purchase: { clientId: 'c1', ref: 'p:2', amount: 36, saleRef: 'T2',
    items: [{ name: 'Café noir', qty: 2, total: 24 }, { name: 'CAFE CREME', qty: 1, total: 12 }] } });
  check(Number(s.row().stamps) === 3, 'two « Café noir » and one « CAFE CREME » earn 3 stamps (accents and case ignored)');
  await s.post({ purchase: { clientId: 'c1', ref: 'p:3', amount: 60, saleRef: 'T3', items: [{ name: 'Décaféiné', qty: 5, total: 60 }] } });
  check(Number(s.row().stamps) === 3, '« Décaféiné » is not « Café »: matching is by whole word');
  await s.post({ purchase: { clientId: 'c1', ref: 'p:4', amount: 0 } });
  check(Number(s.row().stamps) === 4, 'a visit recorded by hand, with no lines, still earns one stamp');

  let r = await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:r1', amount: 12, saleRef: 'T2', items: [{ name: 'Café noir', qty: 1, total: 12 }] } });
  check(r.status === 200 && Number(s.row().stamps) === 3, 'returning one « Café noir » takes back one stamp');
  r = await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:r2', amount: 24, saleRef: 'T2', items: [{ name: 'Café noir', qty: 5, total: 24 }] } });
  check(Number(s.row().stamps) === 1, 'a return never takes back more stamps than that ticket earned (3 earned, 3 taken in all)');
  r = await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:r2', amount: 24, saleRef: 'T2', items: [{ name: 'Café noir', qty: 5, total: 24 }] } });
  check(Number(s.row().stamps) === 1, 'a replayed return applies once');
}

console.log('\nCarte passages : un retour complet reprend le tampon du passage');
{
  const s = store({ model: 'visit', visit: { target: 10, reward: '1 offert' } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:1', amount: 100, saleRef: 'V1', items: [{ name: 'Robe', qty: 1, total: 100 }] } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:2', amount: 50, saleRef: 'V2', items: [{ name: 'Foulard', qty: 1, total: 50 }] } });
  check(Number(s.row().stamps) === 2, 'one stamp per visit, whatever was bought');
  await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:v1', amount: 40, saleRef: 'V1' } });
  check(Number(s.row().stamps) === 2, 'a partial return keeps the visit stamp');
  await s.post({ refund: { clientId: 'c1', ref: 'refund:c1:v2', amount: 50, saleRef: 'V2' } });
  check(Number(s.row().stamps) === 1, 'a whole ticket returned takes its visit stamp back');
}

console.log('\nPoints : arrondis vers le bas, comme les prix');
{
  const s = store({ model: 'amount', amount: { perMad: 1, threshold: 100, reward: '−10 %' } });
  await s.post({ purchase: { clientId: 'c1', ref: 'p:1', amount: 99.5, saleRef: 'A1' } });
  check(Number(s.row().points) === 99, '99,50 MAD at one point a dirham earns 99 points, not 100');
  const r = await s.post({ redemption: { clientId: 'c1', ref: 'redemption:1' } });
  check(r.status === 409 && r.body.error === 'reward-not-ready', '99 points do not unlock a 100-point reward');
}

console.log('\nRécompense : rien à remettre sans programme');
for (const [label, cfg] of [['no programme saved', null], ['the till\'s deduced default', { auto: true, model: 'amount', amount: { perMad: 1, threshold: 100 } }]]) {
  const s = store(cfg);
  s.raw.prepare('UPDATE clients SET points = 500 WHERE merchant=? AND id=?').run(MERCHANT, 'c1');
  const r = await s.post({ redemption: { clientId: 'c1', ref: 'redemption:off' } });
  check(r.status === 409 && r.body.error === 'loyalty-off' && Number(s.row().points) === 500,
    `${label}: a redemption is refused and old points stay untouched`);
}

console.log('\nCaisse : la même règle avant la réponse du serveur');
{
  const storage = new Map([['kiwiLive', '1'], ['kiwiLiveMerchant', MERCHANT]]);
  const stores = {};
  const define = (name, options) => {
    const st = stores[name] || { data: {}, listeners: [] };
    st.get = (key) => st.data[key] || (options.blank ? options.blank() : null);
    st.set = (value, key) => { st.data[key] = value; st.listeners.forEach((fn) => fn(key)); };
    st.subscribe = (fn) => { st.listeners.push(fn); return () => {}; };
    return (stores[name] = st);
  };
  const localStorage = { getItem: (k) => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  const window = { localStorage, KiwiStore: { define, currentVenue: () => MERCHANT }, KiwiEnv: { isReal: () => true }, addEventListener: () => {} };
  const context = { window, KiwiStore: window.KiwiStore, KiwiEnv: window.KiwiEnv, localStorage, console, Math, Date, JSON,
    setInterval: () => 1, clearInterval: () => {}, fetch: async () => ({ ok: false, json: async () => ({ clients: [], cursor: 0 }) }) };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/clients-store.js'), 'utf8'), context, { filename: 'assets/clients-store.js' });
  const KC = context.window.KiwiClients;
  KC.setConfig({ model: 'product', product: { item: 'Café', target: 10, reward: '1 offert' } }, MERCHANT);
  const c = KC.upsert({ name: 'Client', phone: '0612345678' }, MERCHANT);
  KC.recordPurchase(c.id, { amount: 95, saleRef: 'T1', eventRef: 'T1', items: [{ name: 'Tajine', qty: 1, total: 95 }] }, MERCHANT);
  KC.recordPurchase(c.id, { amount: 24, saleRef: 'T2', eventRef: 'T2', items: [{ name: 'Café noir', qty: 3, total: 36 }] }, MERCHANT);
  check(Number(KC.get(c.id, MERCHANT).stamps) === 3, 'the till counts 3 stamps for a tajine then three coffees, as the server will');
  KC.recordRefund(c.id, { amount: 12, saleRef: 'T2', eventRef: 'R1', items: [{ name: 'Café noir', qty: 1, total: 12 }] }, MERCHANT);
  check(Number(KC.get(c.id, MERCHANT).stamps) === 2, 'the till takes a stamp back when a coffee is returned');
  KC.setConfig({ model: 'amount', amount: { perMad: 1, threshold: 100 } }, MERCHANT);
  const before = Number(KC.get(c.id, MERCHANT).points) || 0;
  KC.recordPurchase(c.id, { amount: 99.5, saleRef: 'A1', eventRef: 'A1' }, MERCHANT);
  check(Number(KC.get(c.id, MERCHANT).points) - before === 99, 'the till credits 99 points for 99,50 MAD');
}

console.log('\nBoutique et maison : la remise fidélité et le toast');
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const f of ['assets/pos-boutique.js', 'assets/pos-maison.js']) {
    const src = read(f);
    const fn = src.slice(src.indexOf('function rewardDiscount('), src.indexOf('function rewardDiscount(') + 900);
    check(/base - shelf\(base \* \(100 - \(r\.value \|\| 0\)\) \/ 100\)/.test(fn) && !/Math\.round\(base \*/.test(fn),
      `${f}: a percent reward leaves the total rounded down, never up to 0,50 over`);
    check(!/Math\.round\(receivedNow \* \(\(cfg\.amount/.test(src) && !/Math\.round\(receivedNow \/ 10\)/.test(src),
      `${f}: the points toast never rounds up nor assumes one point per 10 MAD`);
  }
  // The rule itself, on the boutique's shelf(): 10 % off 245 is 220,50 → 220 paid.
  const shelf = (n) => Math.max(0, Math.floor((+n || 0) + 1e-6));
  const reward = (base, pct) => base - shelf(base * (100 - pct) / 100);
  check(245 - reward(245, 10) === 220 && 249 - reward(249, 10) === 224, '10 % off 245 charges 220 and off 249 charges 224');
}

console.log(`\n✓ loyalty truth: ${checks} checks`);
