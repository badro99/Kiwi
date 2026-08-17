#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LIVE AMIRA VENUE VERIFICATION PASS
 * End-to-end validation of:
 *   1. Text-only "sans oignon" allergy modifier rendered on KDS screen.
 *   2. Waiter tablet table transfer and line void (verifying 200 OK, not 403).
 *   3. Production D1 schema migration verification for audit ledgers.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';
import { parseSchema, diff } from './d1-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'amira-live-verification-secret';
const MERCHANT = 'amira-cafe';
const STAFF_ID = 'mem-amira-waiter';

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

function makeDB() {
  const db = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  const facade = { _db: db };
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() {
        const r = db.prepare(query).run(...args);
        return { success: true, meta: { changes: r.changes } };
      },
    };
    return st;
  };
  facade.prepare = prepare;
  return facade;
}

const db = makeDB();
const env = { DB: db, AUTH_SECRET };
const exec = (sql, ...args) => db._db.prepare(sql).run(...args);

function doc(feature, data) {
  exec('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)',
    MERCHANT, feature, JSON.stringify(data), Date.now());
}

async function setupAmiraVenue() {
  // Amira Café configuration
  exec('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)',
    MERCHANT, JSON.stringify({ orderpro: true }), 'Amira Café', Date.now());

  // Amira's menu with stations
  exec('INSERT INTO menus (merchant, data, updated_ts) VALUES (?, ?, ?)', MERCHANT, JSON.stringify({
    stations: [{ id: 'kitchen', name: 'Cuisine' }, { id: 'bar', name: 'Bar' }],
    kitchenId: 'kitchen',
    cats: [
      { id: 'cat-shawarma', name: 'Shawarma', station: 'kitchen' },
      { id: 'cat-drinks', name: 'Boissons', station: 'bar' },
    ],
    items: [
      { id: 'it-shawarma', name: 'Shawarma Poulet', price: 45, catId: 'cat-shawarma', avail: true },
      { id: 'it-the', name: 'Thé à la menthe', price: 15, catId: 'cat-drinks', avail: true },
    ],
  }), Date.now());

  // Waiter staff member
  const member = {
    id: STAFF_ID, firstName: 'Karim', lastName: 'Serveur', email: 'karim@amira.test',
    pinCode: '4321', function: 'Serveur', department: 'Salle', venueSlug: MERCHANT,
  };
  doc('employee-access', { members: [member] });
  doc('attendance', {
    entries: [{
      id: 'att-karim', memberId: STAFF_ID, staffId: STAFF_ID, name: 'Karim Serveur',
      inTs: Date.now() - 7200000, outTs: null, pauseTs: null,
    }],
  });
  doc('floorplan', {
    staff: [{ id: STAFF_ID, name: 'Karim Serveur' }],
    tables: [
      { id: 'T4', num: '4', covers: 2, servers: [STAFF_ID] },
      { id: 'T6', num: '6', covers: 4, servers: [STAFF_ID] },
    ],
  });
}

async function postQueue(body, cookieHeader) {
  const req = new Request('https://kiwi-os.com/api/order/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
  const res = await queue.onRequestPost({ request: req, env });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function getQueue(urlParams, cookieHeader) {
  const req = new Request(`https://kiwi-os.com/api/order/queue?${urlParams}`, {
    method: 'GET',
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
  const res = await queue.onRequestGet({ request: req, env });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Emulate KDS card rendering from kiwi-cuisine.html
function renderKdsCard(order) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const items = (order.lines || []).map((l) => {
    const note = String(l.note || '').trim();
    const visuals = (Array.isArray(l.visuals) ? l.visuals : []).filter((v) => v && (v.name || v.label || v.cn)).map((v) => ({
      emoji: v.emoji || v.e || '',
      name: v.name || v.label || v.cn,
    }));
    const visualHtml = visuals.length ? '<span class="tk-visuals">' + visuals.map((v) => {
      return '<span class="tk-visual">' + (v.emoji ? '<span class="tk-visual-emoji">' + esc(v.emoji) + '</span>' : '') + '<span>' + esc(v.name) + '</span></span>';
    }).join('') + '</span>' : '';
    return '<li class=""><span class="tk-q">' + (l.qty || 1) + '×</span>'
      + '<span class="tk-n">' + esc(l.name) + visualHtml + (note ? '<span class="tk-note">' + esc(note) + '</span>' : '') + '</span></li>';
  }).join('');
  return items;
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('  AMIRA CAFÉ — LIVE OPERATIONAL VERIFICATION PASS');
console.log('═══════════════════════════════════════════════════════════════════════\n');

await setupAmiraVenue();

const karimToken = await employeeToken(AUTH_SECRET, { memberId: STAFF_ID, staffId: STAFF_ID, merchant: MERCHANT });
const karimCookie = `${EMPLOYEE_COOKIE}=${karimToken}`;

/* ── 1. SEND DISH WITH TEXT-ONLY "SANS OIGNON" ALLERGY MODIFIER ───────────── */
console.log('■ 1. Allergy modifier fidelity on KDS (text-only "sans oignon")');

// Waiter sends Shawarma with text-only modifier "sans oignon" (no emoji)
const orderSendRes = await postQueue({
  merchant: MERCHANT,
  create: true,
  mode: 'table',
  table: '4',
  server: 'Karim Serveur',
  lines: [
    {
      id: 'it-shawarma',
      name: 'Shawarma Poulet',
      qty: 1,
      unitPrice: 45,
      note: 'Allergie sévère',
      visuals: [{ name: 'sans oignon', emoji: '' }],
      station: 'kitchen',
    },
  ],
}, karimCookie);

check('Waiter sends order from tablet (200 OK)', orderSendRes.status === 200 && orderSendRes.data.ok === true);

// Kitchen displays the order
const kdsFeed = await getQueue(`merchant=${MERCHANT}&since=0`, karimCookie);
check('KDS polling receives the active order', kdsFeed.status === 200 && Array.isArray(kdsFeed.data.orders) && kdsFeed.data.orders.length > 0);

const kdsOrder = kdsFeed.data.orders.find(o => o.table === '4');
check('Order found in KDS queue', !!kdsOrder);
check('KDS order line contains text-only visual "sans oignon"',
  kdsOrder && kdsOrder.lines[0].visuals.some(v => v.name === 'sans oignon' && v.emoji === ''));

const renderedHtml = renderKdsCard(kdsOrder);
check('Rendered KDS card includes `<span class="tk-visual"><span>sans oignon</span></span>` badge',
  renderedHtml.includes('<span class="tk-visual"><span>sans oignon</span></span>'));
check('Rendered KDS card includes allergy note `<span class="tk-note">Allergie sévère</span>`',
  renderedHtml.includes('<span class="tk-note">Allergie sévère</span>'));

console.log(`\n      Rendered KDS HTML snippet:\n      ${renderedHtml}\n`);

/* ── 2. WAITER TABLET TABLE TRANSFER & LINE VOID ─────────────────────────── */
console.log('■ 2. Waiter tablet table transfer & kitchen void (verifying 200 OK, not 403)');

// Transfer Table 4 to Table 6 from waiter tablet
const transferRes = await postQueue({
  merchant: MERCHANT,
  transferTable: { from: '4', to: '6', covers: 2, server: 'Karim Serveur' },
}, karimCookie);

check('Waiter tablet transfers Table 4 to Table 6 (200 OK — NOT 403)', transferRes.status === 200 && transferRes.data.ok === true);

const auditTransferRow = db._db.prepare('SELECT from_table, to_table, is_merge FROM table_transfers WHERE merchant = ?').get(MERCHANT);
check('Audit row written to table_transfers ledger in D1',
  auditTransferRow && auditTransferRow.from_table === '4' && auditTransferRow.to_table === '6');

// Waiter voids the Shawarma line on Table 6 from waiter tablet
const voidRes = await postQueue({
  merchant: MERCHANT,
  voidLine: {
    orderId: kdsOrder.id,
    table: '6',
    itemId: 'it-shawarma',
    qty: 1,
    reason: 'client_change',
    actor: 'Karim Serveur',
  },
}, karimCookie);

check('Waiter tablet voids line on Table 6 (200 OK — NOT 403)', voidRes.status === 200 && voidRes.data.ok === true);

const auditVoidRow = db._db.prepare('SELECT order_id, table_no, item_name, reason, status FROM kitchen_voids WHERE merchant = ?').get(MERCHANT);
check('Audit row written to kitchen_voids pertes ledger in D1 with status approved',
  auditVoidRow && auditVoidRow.order_id === kdsOrder.id && auditVoidRow.table_no === '6' && auditVoidRow.status === 'approved');

/* ── 3. D1 SCHEMA MIGRATION INTEGRITY ────────────────────────────────────── */
console.log('\n■ 3. Production D1 Schema Migration Integrity');

const schemaSql = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
const parsed = parseSchema(schemaSql);

check('schema.sql defines table_transfers', parsed.tables.has('table_transfers'));
check('schema.sql defines idx_table_transfers_live index', parsed.indexes.has('idx_table_transfers_live'));
check('schema.sql defines kitchen_voids', parsed.tables.has('kitchen_voids'));
check('schema.sql defines idx_kitchen_voids_live index', parsed.indexes.has('idx_kitchen_voids_live'));

const migrationTransfers = fs.existsSync(path.join(ROOT, 'migrations', '2026-08-17-table-transfers.sql'));
const migrationVoids = fs.existsSync(path.join(ROOT, 'migrations', '2026-08-17-kitchen-voids.sql'));
check('Migration file for table_transfers exists in migrations/', migrationTransfers);
check('Migration file for kitchen_voids exists in migrations/', migrationVoids);

console.log(failures ? `\n✗ ${failures} failure(s)\n` : `\n✓ All live Amira verification checks green.\n`);
process.exitCode = failures ? 1 : 0;
