#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · sales ledger centime precision & regression test suite.
 *
 * Verifies end-to-end centime accuracy across:
 *   1. KiwiLive.postSale client-side payload assembly (no silent drop on < 1 MAD)
 *   2. /api/sale ingest (amountCents, legacy amount, ceiling, floor, collision)
 *   3. D1 storage (sales.amount_cents + sales.amount)
 *   4. /api/feed egress (decimal amount + amountCents)
 *   5. live-link feed bridging back to window.KiwiSales
 *   6. /api/sale/cancel voiding & sale_audit centime precision
 *   7. Mixed-vintage aggregation across legacy and centime rows
 * ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestGet as feedGet } from '../functions/api/feed.js';
import { onRequestPost as cancelPost, onRequestGet as cancelGet } from '../functions/api/sale/cancel.js';
import { onRequestGet as overviewGet } from '../functions/api/admin/overview.js';
import { onRequestGet as auditGet } from '../functions/api/admin/audit.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');

let passed = 0;
const failures = [];
function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failures.push({ label, detail });
    console.log('  ✗ ' + label + (detail ? ` (${detail})` : ''));
  }
}

/* ── 1. Set up in-memory D1 mock ── */
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(schema);

const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...values) { args = values; return st; },
      run() {
        const r = sqlite.prepare(sql).run(...args);
        return { meta: { changes: r.changes } };
      },
      first() {
        return sqlite.prepare(sql).get(...args) || null;
      },
      all() {
        return { results: sqlite.prepare(sql).all(...args) };
      },
    };
    return st;
  },
};

const env = { DB, AUTH_SECRET: 'test-secret-42' };

/* ── 2. Client-side KiwiLive.postSale test in VM ── */
console.log('\n1 · Client-side Live Link (assets/live-link.js)');
{
  const liveLinkCode = fs.readFileSync(path.join(ROOT, 'assets', 'live-link.js'), 'utf8');

  function createLiveLinkContext(merchantSlug) {
    const payloads = [];
    const store = {
      kiwiLive: '1',
      kiwiPairedVenue: JSON.stringify({ merchant: merchantSlug, name: merchantSlug }),
    };
    const mockWindow = {
      location: { hostname: 'app.kiwi.local', search: '' },
      document: { readyState: 'complete', addEventListener() {}, dispatchEvent() {}, getElementById: () => null },
      localStorage: {
        getItem(k) { return store[k] || null; },
        setItem(k, v) { store[k] = String(v); },
        removeItem(k) { delete store[k]; },
      },
      fetch: async (url, opts) => {
        if (opts && opts.body) payloads.push({ url, body: JSON.parse(opts.body) });
        return { ok: true, json: async () => ({ ok: true }) };
      },
      KiwiEnv: { isReal: () => true },
      KiwiVenue: { getVenue: () => 'own', isCustom: () => true },
      KiwiSales: { list: () => [], add: () => {}, annotate: () => {} },
      Kiwi: { toast: () => {} },
    };

    const ctx = vm.createContext({
      window: mockWindow,
      document: mockWindow.document,
      localStorage: mockWindow.localStorage,
      fetch: mockWindow.fetch,
      location: mockWindow.location,
      console: console,
      Date: Date,
      Math: Math,
      Number: Number,
      String: String,
      Array: Array,
      JSON: JSON,
      setTimeout: () => 1,
      setInterval: () => 1,
      clearTimeout: () => {},
      clearInterval: () => {},
    });

    vm.runInContext(liveLinkCode, ctx);
    return { KiwiLive: ctx.window.KiwiLive, payloads };
  }

  // Test A: Sub-dirham sale (0.30 MAD)
  const envA = createLiveLinkContext('cafe-atlas');
  envA.KiwiLive.postSale({
    id: 'sale-sub-dirham',
    ref: 'REF-SUB-1',
    amount: 0.30,
    method: 'cash',
    label: 'Bonbon 0.30',
  });

  const subPayload = envA.payloads.find((p) => p.body.label === 'Bonbon 0.30');
  check('sub-dirham sale (0.30 MAD) is NOT silently dropped and generates request',
    !!subPayload,
    JSON.stringify(subPayload?.body));
  check('sub-dirham payload carries amountCents = 30 and legacy amount = 0',
    subPayload && subPayload.body.amountCents === 30 && subPayload.body.amount === 0);

  // Test B: 12.50 MAD sale
  const envB = createLiveLinkContext('cafe-atlas');
  envB.KiwiLive.postSale({
    id: 'sale-centimes',
    ref: 'REF-CENT-1',
    amount: 12.50,
    method: 'card',
    label: 'Espresso + Croissant',
  });

  const centPayload = envB.payloads.find((p) => p.body.label === 'Espresso + Croissant');
  check('12.50 MAD sale generates payload with amountCents = 1250 and legacy amount = 13',
    centPayload && centPayload.body.amountCents === 1250 && centPayload.body.amount === 13);
}

/* ── 3. Server Ingestion (/api/sale) ── */
console.log('\n2 · Server Ingest (/api/sale)');
{
  async function callSale(body, headers = {}) {
    const req = new Request('https://kiwi.test/api/sale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'kiwi_gate=1',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return salePost({ request: req, env });
  }

  const now = Date.now();

  // 12.50 MAD sale with amountCents
  let r = await callSale({
    id: 'sale-1250',
    merchant: 'cafe-atlas',
    amountCents: 1250,
    amount: 13,
    method: 'card',
    label: 'Espresso',
    ref: 'T-101',
    ts: now,
  });
  check('ingest accepts 12.50 MAD (1250 cents)', r.status === 200);

  const row1 = sqlite.prepare('SELECT amount, amount_cents FROM sales WHERE id=?').get('sale-1250');
  check('D1 stores amount_cents = 1250 and amount = 13',
    row1 && row1.amount_cents === 1250 && row1.amount === 13);

  // 0.30 MAD sub-dirham sale
  r = await callSale({
    id: 'sale-30cents',
    merchant: 'cafe-atlas',
    amountCents: 30,
    amount: 0,
    method: 'cash',
    label: 'Sachet',
    ref: 'T-102',
    ts: now,
  });
  check('ingest accepts 0.30 MAD sub-dirham sale', r.status === 200);

  const rowSub = sqlite.prepare('SELECT amount, amount_cents FROM sales WHERE id=?').get('sale-30cents');
  check('D1 stores sub-dirham sale amount_cents = 30 and amount = 0',
    rowSub && rowSub.amount_cents === 30 && rowSub.amount === 0);

  // Legacy client passing float amount: 45.75
  r = await callSale({
    id: 'sale-legacy-float',
    merchant: 'cafe-atlas',
    amount: 45.75,
    method: 'cash',
    label: 'Dejeuner',
    ref: 'T-103',
    ts: now,
  });
  check('ingest accepts legacy float amount (45.75 MAD)', r.status === 200);

  const rowLegacy = sqlite.prepare('SELECT amount, amount_cents FROM sales WHERE id=?').get('sale-legacy-float');
  check('D1 populates amount_cents = 4575 and amount = 46 from legacy float',
    rowLegacy && rowLegacy.amount_cents === 4575 && rowLegacy.amount === 46);

  // Conflicting amounts (contradiction > 1 MAD)
  r = await callSale({
    id: 'sale-conflict',
    merchant: 'cafe-atlas',
    amount: 10,
    amountCents: 5000,
    method: 'cash',
  });
  check('ingest rejects conflicting amount and amountCents', r.status === 400);

  // Ceiling and floor checks
  r = await callSale({ id: 'sale-zero', merchant: 'cafe-atlas', amountCents: 0 });
  check('ingest rejects 0 amountCents', r.status === 400);

  r = await callSale({ id: 'sale-over-max', merchant: 'cafe-atlas', amountCents: 20000001 });
  check('ingest rejects amountCents above 20,000,000 (200k MAD)', r.status === 400);

  r = await callSale({ id: 'sale-at-max', merchant: 'cafe-atlas', amountCents: 20000000, method: 'cash', ts: now });
  check('ingest accepts exact max ceiling (20,000,000 cents)', r.status === 200);
}

/* ── 4. Server Egress & Feed (/api/feed) ── */
console.log('\n3 · Server Egress (/api/feed)');
{
  const req = new Request('https://kiwi.test/api/feed?merchant=cafe-atlas&since=0', {
    headers: { cookie: 'kiwi_gate=1' },
  });
  const res = await feedGet({ request: req, env });
  check('feed endpoint responds 200', res.status === 200);

  const data = await res.json();
  const s1250 = (data.sales || []).find((s) => s.id === 'sale-1250');
  const s30 = (data.sales || []).find((s) => s.id === 'sale-30cents');
  const sLegacy = (data.sales || []).find((s) => s.id === 'sale-legacy-float');

  check('feed returns 12.50 MAD as amount = 12.5 and amountCents = 1250',
    s1250 && s1250.amount === 12.5 && s1250.amountCents === 1250);
  check('feed returns 0.30 MAD as amount = 0.3 and amountCents = 30',
    s30 && s30.amount === 0.3 && s30.amountCents === 30);
  check('feed returns legacy float as amount = 45.75 and amountCents = 4575',
    sLegacy && sLegacy.amount === 45.75 && sLegacy.amountCents === 4575);
}

/* ── 5. End-to-end Feed Ingestion into KiwiSales ── */
console.log('\n4 · End-to-end KiwiSales Ingestion');
{
  const liveLinkCode = fs.readFileSync(path.join(ROOT, 'assets', 'live-link.js'), 'utf8');
  let addedSales = [];

  const mockWindow = {
    location: { hostname: 'app.kiwi.local', search: '' },
    document: { readyState: 'complete', addEventListener() {}, dispatchEvent() {}, getElementById: () => null },
    localStorage: {
      _store: {
        kiwiLive: '1',
        kiwiPairedVenue: JSON.stringify({ merchant: 'cafe-atlas', name: 'Café Atlas' }),
      },
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        sales: [
          { cursor: 1, id: 'sale-1250', amount: 12.5, amountCents: 1250, method: 'card', ts: 1785000000000 },
          { cursor: 2, id: 'sale-30cents', amount: 0.3, amountCents: 30, method: 'cash', ts: 1785000001000 },
        ],
        cursor: 2,
        merchant: 'cafe-atlas',
        voided: [],
      }),
    }),
    KiwiEnv: { isReal: () => true },
    KiwiVenue: { getVenue: () => 'own', isCustom: () => true },
    KiwiSales: {
      list: () => [],
      add: (vid, s) => { addedSales.push(s); },
      annotate: () => {},
    },
    Kiwi: { toast: () => {} },
  };

  const context = vm.createContext({
    window: mockWindow,
    document: mockWindow.document,
    localStorage: mockWindow.localStorage,
    fetch: mockWindow.fetch,
    location: mockWindow.location,
    console: console,
    Date: Date,
    Math: Math,
    Number: Number,
    String: String,
    Array: Array,
    JSON: JSON,
    setTimeout: (fn) => 1,
    setInterval: () => 1,
    clearTimeout: () => {},
    clearInterval: () => {},
  });

  vm.runInContext(liveLinkCode, context);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const stored1250 = addedSales.find((s) => s.cursor === 1);
  const stored30 = addedSales.find((s) => s.cursor === 2);

  check('KiwiSales receives 12.50 MAD (not rounded to 13)',
    stored1250 && stored1250.amount === 12.5 && stored1250.amountCents === 1250);
  check('KiwiSales receives 0.30 MAD (not rounded to 0)',
    stored30 && stored30.amount === 0.3 && stored30.amountCents === 30);
}

/* ── 6. Voiding & sale_audit Precision (/api/sale/cancel) ── */
console.log('\n5 · Void & sale_audit Centime Precision');
{
  // Insert staff PIN for manager void
  sqlite.prepare("INSERT OR REPLACE INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES ('pin-1', 'cafe-atlas', '1234', 'Directeur', 'gerant', 1785000000000)").run();

  const token = await tillToken(env.AUTH_SECRET, 'cafe-atlas');
  const cancelReq = new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `kiwi_gate=1; ${TILL_COOKIE}=${token}`,
    },
    body: JSON.stringify({
      merchant: 'cafe-atlas',
      id: 'sale-1250',
      pin: '1234',
      source: 'cashier',
    }),
  });

  const cancelRes = await cancelPost({ request: cancelReq, env });
  check('sale cancellation succeeds', cancelRes.status === 200);

  const cancelData = await cancelRes.json();
  check('cancellation response returns amount = 12.5 and amountCents = 1250',
    cancelData.amount === 12.5 && cancelData.amountCents === 1250);

  const auditRow = sqlite.prepare('SELECT amount, amount_cents FROM sale_audit WHERE sale_id=?').get('sale-1250');
  check('sale_audit table stores amount_cents = 1250 and legacy amount = 13',
    auditRow && auditRow.amount_cents === 1250 && auditRow.amount === 13);

  // Read back from GET /api/sale/cancel
  const getCancelReq = new Request('https://kiwi.test/api/sale/cancel?merchant=cafe-atlas&from=0', {
    headers: { cookie: `kiwi_gate=1; ${TILL_COOKIE}=${token}` },
  });
  const getCancelRes = await cancelGet({ request: getCancelReq, env });
  const getCancelData = await getCancelRes.json();
  const cEntry = (getCancelData.cancellations || []).find((c) => c.id === 'sale-1250');
  check('GET /api/sale/cancel preserves amount = 12.5 and amountCents = 1250',
    cEntry && cEntry.amount === 12.5 && cEntry.amountCents === 1250);
}

/* ── 7. Mixed-Vintage Aggregation ── */
console.log('\n6 · Mixed-Vintage Aggregation (COALESCE fallback)');
{
  // Insert legacy row with amount_cents = NULL
  sqlite.prepare(
    "INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts) VALUES (?, ?, ?, NULL, 'cash', 'Legacy Ticket', 'OLD-1', ?)"
  ).run('sale-legacy-null-cents', 'cafe-atlas', 100, Date.now());

  // Query aggregation directly via SQL COALESCE
  const agg = sqlite.prepare(
    "SELECT COALESCE(SUM(COALESCE(amount_cents, amount * 100)), 0) AS total_cents FROM sales WHERE merchant = 'cafe-atlas' AND void_ts IS NULL"
  ).get();

  // Active sales: sale-30cents (30) + sale-legacy-float (4575) + sale-at-max (20000000) + legacy-null-cents (10000) = 20014605 cents
  check('mixed-vintage SQL aggregation sums legacy amount * 100 and new amount_cents seamlessly',
    agg && agg.total_cents === (30 + 4575 + 20000000 + 10000));
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} check(s) failed:`);
  failures.forEach((f) => console.error(`  - ${f.label}${f.detail ? `: ${f.detail}` : ''}`));
  process.exit(1);
}

console.log(`\n✓ All ${passed} centime precision and regression controls passed.`);
