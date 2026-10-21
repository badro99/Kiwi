#!/usr/bin/env node
/* Livraisons à recevoir (functions/api/receivables.js), sur le vrai schéma.
 *
 * Une vente partie en livraison est à 0 MAD : le tableau de bord ne la voyait
 * nulle part et rien ne permettait de dire que le transporteur avait payé. On
 * vérifie qu'elle est listée avec ce qui reste dû, qu'une encaisse écrit UNE
 * vente du montant reçu avec son panier, qu'on ne reçoit pas deux fois, et que
 * seuls le propriétaire ou un opérateur peuvent le dire. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost, dueCents } from '../functions/api/receivables.js';
import { onRequestGet as feedGet } from '../functions/api/feed.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const MERCHANT = 'boutique-delivery-test';
const OTHER = 'boutique-other-test';
const SECRET = 'receivables-test-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
      first() { return sqlite.prepare(sql).get(...args) || null; },
      all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return statement;
  },
  batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = statements.map((s) => s.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
const now = Date.now();
for (const [m, acc] of [[MERCHANT, 'acc-dlv-owner'], [OTHER, 'acc-other-owner']]) {
  sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, updated_ts)
    VALUES (?, '{}', 'TEST KIWI', 'boutique', 'active', 0, ?)`).run(m, now);
  sqlite.prepare(`INSERT INTO accounts (id, email, business, salt, hash, created_ts, status)
    VALUES (?, ?, 'TEST KIWI', 'salt', 'hash', ?, 'active')`).run(acc, acc + '@example.test', now);
  sqlite.prepare('UPDATE merchant_config SET account_id=? WHERE merchant=?').run(acc, m);
}
const sale = (id, cents, method, parts, ts, extra = {}) => {
  sqlite.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, payment_parts, label, ref, ts, void_ts, lines, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivery')`).run(id, extra.merchant || MERCHANT, Math.round(cents / 100), cents, method,
    parts ? JSON.stringify(parts) : null, extra.label || 'Robe lin', extra.ref || id.toUpperCase(), ts, extra.void || null,
    JSON.stringify([{ n: 'Robe lin M', q: 1, t: 450, c: 'Robes' }]));
};
const receipt = (id, cents, m = MERCHANT) => sqlite.prepare(`INSERT INTO sale_receipts (merchant, sale_id, gross_ticket_cents, consigned_cents, created_ts)
  VALUES (?, ?, ?, 0, ?)`).run(m, id, cents, now);

// Entièrement en livraison : 450 MAD à recevoir.
sale('dlv-a', 0, 'delivery', [{ method: 'delivery', amountCents: 45000 }], now - 3600e3); receipt('dlv-a', 45000);
// Acompte 100 en espèces, le reste (250) en livraison.
sale('dlv-b', 10000, 'split', [{ method: 'cash', amountCents: 10000 }, { method: 'delivery', amountCents: 25000 }], now - 1800e3); receipt('dlv-b', 35000);
// Ancienne vente sans détail des parts : le total du ticket fait foi.
sale('dlv-legacy', 0, 'delivery', null, now - 86400e3); receipt('dlv-legacy', 12000);
// Livraison annulée (vente d'essai sortie des livres) : jamais à recevoir.
sale('dlv-void', 0, 'delivery', [{ method: 'delivery', amountCents: 9900 }], now - 600e3, { void: now }); receipt('dlv-void', 9900);
// Vente ordinaire, et livraison d'un autre commerce.
sale('cash-1', 20000, 'cash', [{ method: 'cash', amountCents: 20000 }], now - 500e3);
sale('dlv-other', 0, 'delivery', [{ method: 'delivery', amountCents: 7000 }], now - 400e3, { merchant: OTHER }); receipt('dlv-other', 7000, OTHER);

const owner = `${SESS_COOKIE}=${await makeSession('acc-dlv-owner', SECRET)}`;
const otherOwner = `${SESS_COOKIE}=${await makeSession('acc-other-owner', SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;
let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls++; console.log('  ✓ ' + message); };
async function get(cookie, merchant = MERCHANT) {
  const r = await onRequestGet({ request: new Request(`https://kiwi.test/api/receivables?merchant=${merchant}`, { headers: { cookie } }), env });
  return { status: r.status, body: await r.json() };
}
async function post(body, cookie = owner) {
  const r = await onRequestPost({ request: new Request('https://kiwi.test/api/receivables', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: MERCHANT, ...body }) }), env });
  return { status: r.status, body: await r.json() };
}

console.log('■ Livraisons à recevoir · lecture');
let r = await get(owner);
ok(r.status === 200, 'the owner reads the open deliveries');
const due = Object.fromEntries(r.body.open.map((d) => [d.saleId, d.dueCents]));
ok(due['dlv-a'] === 45000, 'a full delivery is owed its whole ticket (450 MAD)');
ok(due['dlv-b'] === 25000, 'a deposit + delivery ticket is owed only the delivery part (250 MAD)');
ok(due['dlv-legacy'] === 12000, 'a ticket without tender detail falls back to the receipt total');
ok(!('dlv-void' in due), 'a voided delivery is never owed');
ok(!('cash-1' in due) && !('dlv-other' in due), 'ordinary sales and another store\'s deliveries stay out');
ok((await get(till)).status === 200, 'the paired till may read the list');
{ const o = await get(otherOwner); ok(!(o.body.open || []).some((d) => d.saleId.startsWith('dlv-a') || d.saleId === 'dlv-b'), 'another merchant\'s owner never sees this store\'s deliveries'); }

console.log('■ Livraisons à recevoir · encaisser (tableau de bord)');
ok((await post({ saleId: 'dlv-a', method: 'cash' })).body.error === 'cash-at-till-only', 'the owner cannot record cash from the dashboard (it belongs in a till drawer)');
ok((await post({ saleId: 'cash-1', method: 'transfer' })).status === 404, 'an ordinary sale is not a delivery');
ok((await post({ saleId: 'dlv-void', method: 'transfer' })).status === 404, 'a voided delivery cannot be collected');
ok((await post({ saleId: 'dlv-other', method: 'transfer' })).status === 404, 'another store\'s delivery cannot be collected');
ok((await post({ saleId: 'dlv-a', method: 'transfer' }, otherOwner)).status === 403, 'another merchant\'s owner cannot collect this store\'s delivery');
r = await post({ saleId: 'dlv-a', method: 'transfer' });
ok(r.status === 200 && r.body.sale.amountCents === 45000 && r.body.sale.id === 'dlv-dlv-a' && r.body.dueCents === 0, 'the courier transfer is recorded for the whole 450 MAD');
const row = sqlite.prepare('SELECT amount_cents, method, ref, lines, channel, void_ts FROM sales WHERE id = ?').get('dlv-dlv-a');
ok(row && row.amount_cents === 45000 && row.method === 'transfer' && row.void_ts === null, 'it is ONE ordinary transfer sale of 450 MAD');
ok(row.ref === 'DLV-A' && row.channel === 'delivery', 'it keeps the delivery ticket reference and channel');
ok(JSON.parse(row.lines)[0].n === 'Robe lin M', 'it carries the original basket, so products count once, when paid');
const first = r.body;
r = await post({ saleId: 'dlv-a', method: 'cheque' });
ok(r.status === 200 && r.body.already === true && JSON.stringify(r.body.sale) === JSON.stringify(first.sale), 'a retry returns the same sale, 200, not a second one');
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM sales WHERE id LIKE 'dlv-dlv-a%'").get().n === 1, 'still exactly one collection sale');
r = await post({ saleId: 'dlv-b', method: 'cheque' });
ok(r.status === 200 && r.body.sale.amountCents === 25000, 'the delivery part of a split ticket is collected by cheque (250 MAD)');
ok(sqlite.prepare('SELECT lines FROM sales WHERE id = ?').get('dlv-dlv-b').lines === null, 'its basket is not copied: the deposit sale already carried it to the dashboard');

console.log('■ Livraisons à recevoir · encaisser (caisse appairée)');
sale('dlv-t', 0, 'delivery', [{ method: 'delivery', amountCents: 30000 }], now - 900e3); receipt('dlv-t', 30000);
const staff = { id: 'staff-7', name: 'Sara', role: 'Caissière' };
r = await post({ saleId: 'dlv-t', method: 'cash', amount: 200, id: 'till1-col-0001', collectedBy: staff }, till);
ok(r.status === 200 && r.body.sale.id === 'till1-col-0001' && r.body.sale.method === 'cash' && r.body.sale.amount === 200, 'the paired till records 200 MAD cash handed back by the courier');
ok(r.body.dueCents === 10000, 'a partial payment leaves the rest open (100 MAD)');
ok(typeof r.body.sale.ts === 'number' && r.body.sale.amountCents === 20000, 'the response is the sale as written, for the till\'s day book and Z');
const by = sqlite.prepare('SELECT collected_by_id, collected_by_name FROM delivery_collections WHERE collection_sale_id = ?').get('till1-col-0001');
ok(by.collected_by_id === 'staff-7' && by.collected_by_name === 'Sara', 'who collected it is the staff identity, never a code');
const replay = await post({ saleId: 'dlv-t', method: 'cash', amount: 200, id: 'till1-col-0001', collectedBy: staff }, till);
ok(replay.status === 200 && replay.body.already === true && JSON.stringify(replay.body.sale) === JSON.stringify(r.body.sale), 'an offline retry of the same id returns the same sale');
ok((await post({ saleId: 'dlv-t', method: 'cash', amount: 150, id: 'till1-col-0002' }, till)).body.error === 'exceeds-due', 'more than what is still owed is refused');
ok((await post({ saleId: 'dlv-a', method: 'cash', amount: 1, id: 'till1-col-0001' }, till)).body.error === 'id-conflict', 'one id never names two deliveries');
ok((await post({ saleId: 'dlv-t', method: 'cash', amount: 0, id: 'till1-col-0003' }, till)).body.error === 'bad-amount', 'a zero amount is refused');
/* sales.id est unique pour tous les commerces : un identifiant déjà pris par la vente d'un autre
 * magasin ne doit ni perdre la vente en silence ni baisser le dû. */
sale('dlv-x', 0, 'delivery', [{ method: 'delivery', amountCents: 30000 }], now - 700e3); receipt('dlv-x', 30000);
sale('taken-by-other-0001', 500, 'cash', null, now - 600e3, { merchant: OTHER });
r = await post({ saleId: 'dlv-x', method: 'cash', amount: 100, id: 'taken-by-other-0001' }, till);
ok(r.status === 409 && r.body.error === 'id-taken', 'an id already held by another store\'s sale is refused (409 id-taken)');
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM delivery_collections WHERE collection_sale_id = 'taken-by-other-0001'").get().n === 0, 'no collection row is left behind: the whole write is rolled back');
ok(sqlite.prepare("SELECT merchant FROM sales WHERE id = 'taken-by-other-0001'").get().merchant === OTHER, 'the other store\'s sale is untouched');
r = await post({ saleId: 'dlv-x', method: 'cash', amount: 100, id: 'till1-col-x001' }, till);
ok(r.status === 200 && r.body.dueCents === 20000, 'with a fresh id the same delivery is collected normally (200 MAD still due)');
r = await post({ saleId: 'dlv-t', method: 'cash', id: 'till1-col-0004' }, till);
ok(r.status === 200 && r.body.sale.amountCents === 10000 && r.body.dueCents === 0, 'without an amount, the till collects the rest (100 MAD)');
ok(sqlite.prepare("SELECT lines FROM sales WHERE id = 'till1-col-0004'").get().lines === null, 'only the first collection carries the basket');
ok(sqlite.prepare("SELECT SUM(amount_cents) AS c FROM sales WHERE id IN ('till1-col-0001','till1-col-0004')").get().c === 30000, 'two cash sales, 300 MAD in all, exactly the delivery');

console.log('■ Deux caisses en même temps');
sale('dlv-race', 0, 'delivery', [{ method: 'delivery', amountCents: 10000 }], now - 800e3); receipt('dlv-race', 10000);
const race = await Promise.all([
  post({ saleId: 'dlv-race', method: 'cash', amount: 80, id: 'race-a-0001' }, till),
  post({ saleId: 'dlv-race', method: 'cash', amount: 80, id: 'race-b-0001' }, till),
]);
const got = sqlite.prepare("SELECT COALESCE(SUM(amount_cents),0) AS c FROM delivery_collections WHERE sale_id = 'dlv-race'").get().c;
ok(race.filter((x) => x.status === 200).length === 1 && got === 8000, 'two tills collecting 80 MAD of a 100 MAD delivery: one wins, never 160');
ok(sqlite.prepare("SELECT COUNT(*) AS n FROM sales WHERE id IN ('race-a-0001','race-b-0001')").get().n === 1, 'and only one cash sale is written');

r = await get(owner);
ok(!r.body.open.some((d) => ['dlv-a', 'dlv-b', 'dlv-t'].includes(d.saleId)), 'fully collected deliveries leave the open list');
ok(r.body.collected.some((d) => d.saleId === 'dlv-t' && d.collections.length === 2 && d.collected.amountCents === 30000), 'and show each payment');
ok(r.body.open.some((d) => d.saleId === 'dlv-race' && d.dueCents === 2000), 'a partly collected delivery stays open for what is left (20 MAD)');

console.log('■ Le flux du tableau de bord');
const feed = await feedGet({ request: new Request(`https://kiwi.test/api/feed?merchant=${MERCHANT}&since=0`, { headers: { cookie: owner } }), env });
const fb = await feed.json();
const coll = (fb.sales || []).find((s) => s.id === 'dlv-dlv-a');
ok(coll && coll.amountCents === 45000 && coll.method === 'transfer', 'the collection reaches /api/feed as a 450 MAD transfer sale');
ok(Array.isArray(coll.lines) && coll.lines[0].name === 'Robe lin M', 'with its basket');

console.log('■ dueCents');
ok(dueCents({ method: 'delivery', payment_parts: 'not json', gross_ticket_cents: 5000, amount_cents: 0 }) === 5000, 'corrupt tender detail falls back to the receipt');
ok(dueCents({ method: 'card', payment_parts: null, gross_ticket_cents: 5000, amount_cents: 5000 }) === 0, 'a card sale owes nothing');


/* ── Le module du tableau de bord (assets/delivery-receivables.js) ── */
console.log('■ Tableau de bord · KiwiDeliveries');
{
  const vm = await import('node:vm');
  const src = fs.readFileSync(new URL('../assets/delivery-receivables.js', import.meta.url), 'utf8');
  const events = [];
  const listeners = {};
  let isReal = true, currentSlug = MERCHANT;
  const calls = [];
  const win = {
    KiwiEnv: { isReal: () => isReal },
    KiwiLive: { merchant: () => currentSlug },
    addEventListener: (n, fn) => { (listeners[n] ||= []).push(fn); },
    dispatchEvent: (e) => { events.push(e.type); (listeners[e.type] || []).forEach((fn) => fn(e)); return true; },
  };
  const ctx = vm.createContext({
    window: win, document: { addEventListener: () => {}, visibilityState: 'visible', head: { appendChild() {} }, createElement: () => ({}) },
    CustomEvent: class { constructor(t) { this.type = t; } }, setTimeout, setInterval: () => 1, Date, JSON, Math, String, Number, Promise,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const cookie = owner;
      if (String(url).startsWith('/api/receivables?')) {
        const r = await onRequestGet({ request: new Request('https://kiwi.test' + url, { headers: { cookie } }), env });
        return { ok: r.ok, json: () => r.json() };
      }
      const r = await onRequestPost({ request: new Request('https://kiwi.test' + url, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: init.body }), env });
      return { ok: r.ok, json: () => r.json() };
    },
  });
  vm.runInContext(src, ctx);
  const D = win.KiwiDeliveries;
  await D.load(true);
  const legacy = D.open().find((d) => d.saleId === 'dlv-legacy');
  ok(legacy && D.open().some((d) => d.saleId === 'dlv-race'), 'the dashboard module lists the open deliveries from the server');
  ok(events.includes('kiwi:deliveries'), 'loading announces kiwi:deliveries so the KPI band redraws');
  const t = legacy.ts;
  ok(D.dueIn(t, t + 1) === 120, 'dueIn counts the owed MAD of deliveries sold in the window (120)');
  ok(D.dueIn(t + 1, t + 2) === 0, 'and nothing outside it');
  sale('dlv-c', 0, 'delivery', [{ method: 'delivery', amountCents: 6000 }], now - 60e3); receipt('dlv-c', 6000);
  await D.load(true);
  const res = await D.collect('dlv-c', 'transfer');
  ok(res.sale.amountCents === 6000 && !D.open().some((d) => d.saleId === 'dlv-c'), 'collecting from the dashboard records 60 MAD and drops it from the list');
  ok(calls.some((c) => c.init && c.init.method === 'POST' && JSON.parse(c.init.body).merchant === MERCHANT), 'the POST names this store');
  currentSlug = OTHER;
  ok(D.dueIn(0, Infinity) === 0, 'switching store hides the previous store\'s deliveries before any reply');
  isReal = false; currentSlug = MERCHANT;
  ok(D.dueIn(0, Infinity) === 0, 'demo: nothing owed, never invented');
}
{
  const DR = fs.readFileSync(new URL('../assets/dateRange.js', import.meta.url), 'utf8');
  ok((DR.match(/receivable \+= deliveryDue\(from, to\);/g) || []).length === 2 && /const \{ card, cash, \.\.\.totals \} = realWindowStats\(from, to\)/.test(DR), 'dashboard totals add open deliveries once, with realSalesTotals delegating');
  ok(/layout\.includes\('receivable'\)[\s\S]{0,200}deriveTile\('receivable'\)/.test(DR), 'a default band shows Créances while money is owed');
  ok(/addEventListener\('kiwi:deliveries', \(\) => \{ renderKpiBand\(\); renderHero\(\); \}\)/.test(DR), 'the band redraws when deliveries change');
  const HTML = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
  ok(/assets\/delivery-receivables\.js\?v=\d+/.test(HTML), 'dashboard.html loads the module');
}
console.log(`\n✓ receivables-test · ${controls} controls`);
