import { DatabaseSync } from 'node:sqlite';
import {
  EMPLOYEE_COOKIE, SESS_COOKIE, employeeToken, makeSession,
} from '../../functions/auth/_lib.js';
import {
  onRequestGet, onRequestPost,
} from '../../functions/api/inventory/internal-requests.js';

export const SECRET = 'hotel-request-suite-secret-32b';
export const MERCHANT = 'hotel-atlas-suite';

class Statement {
  constructor(db, sql) { this.db = db; this.sql = String(sql); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
}

class D1Sqlite {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Statement(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

const units = {
  confirmationSide: 'recipient',
  units: [
    { id: 'economat', name: 'Economat', kind: 'economat', locationId: 'u-economat', active: true },
    { id: 'rooftop', name: 'Rooftop', kind: 'outlet', storeType: 'bar', locationId: 'u-bar-rooftop', active: true },
  ],
};
const catalogue = { items: [
  { itemId: 'whisky', name: 'Whisky', baseUnit: 'bouteille', purchaseUnit: 'caisse', purchaseToBase: 12, issueUnit: 'bouteille', issueToBase: 1, consumptionUnit: 'bouteille', consumptionToBase: 1, active: true },
  { itemId: 'cola', name: 'Cola', baseUnit: 'bouteille', purchaseUnit: 'caisse', purchaseToBase: 24, issueUnit: 'bouteille', issueToBase: 1, consumptionUnit: 'bouteille', consumptionToBase: 1, active: true },
  { itemId: 'verrerie', name: 'Verrerie', baseUnit: 'unite', purchaseUnit: 'unite', purchaseToBase: 1, issueUnit: 'unite', issueToBase: 1, consumptionUnit: 'unite', consumptionToBase: 1, active: true },
] };
const department = { unitId: 'rooftop', items: catalogue.items.map((item) => ({
  itemId: item.itemId, visibility: 'visible', active: true, countingUnit: item.issueUnit,
  packaging: { unit: item.issueUnit, quantity: 1 }, countingFrequency: 'daily', recipeUse: false,
})) };
const members = [
  { id: 'econ-a', firstName: 'Amina', role: 'Econome', unitId: 'economat' },
  { id: 'econ-b', firstName: 'Brahim', role: 'Econome', unitId: 'economat' },
  { id: 'econ-c', firstName: 'Chaima', role: 'Econome', unitId: 'economat' },
  { id: 'roof-manager', firstName: 'Rania', role: 'Manager', unitId: 'rooftop' },
];

function setup(db) {
  db.exec(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY, business TEXT);
    CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, account_id TEXT, type TEXT);
    CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER,
      PRIMARY KEY (merchant, feature));
    CREATE TABLE inventory_movements (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, item_id TEXT NOT NULL,
      variant_id TEXT NOT NULL DEFAULT '', location_id TEXT NOT NULL DEFAULT 'principal',
      qty_milli INTEGER NOT NULL, reason TEXT NOT NULL, unit_cost_cents INTEGER,
      currency TEXT NOT NULL DEFAULT 'MAD', ref_type TEXT NOT NULL DEFAULT '',
      ref_id TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '',
      occurred_ts INTEGER NOT NULL, srv_ts INTEGER NOT NULL, reversal_of TEXT NOT NULL DEFAULT '',
      meta TEXT, created_ts INTEGER NOT NULL
    );
    CREATE TABLE inventory_sync_sequences (merchant TEXT PRIMARY KEY, last_ts INTEGER NOT NULL);
  `);
  db.prepare('INSERT INTO accounts (id, business) VALUES (?, ?)').run('owner-1', MERCHANT);
  db.prepare('INSERT INTO merchant_config (merchant, account_id, type) VALUES (?, ?, ?)').run(MERCHANT, 'owner-1', 'hotel');
  const putDoc = db.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, 1)');
  putDoc.run(MERCHANT, 'hotel-units', JSON.stringify(units));
  putDoc.run(MERCHANT, 'economat-catalogue', JSON.stringify(catalogue));
  putDoc.run(MERCHANT, 'hotel-dept:rooftop', JSON.stringify(department));
  putDoc.run(MERCHANT, 'employee-access', JSON.stringify({ members }));
  putDoc.run(MERCHANT, 'team', JSON.stringify({ members }));
  db.prepare('INSERT INTO inventory_sync_sequences (merchant, last_ts) VALUES (?, ?)').run(MERCHANT, 1000);
  const movement = db.prepare(`INSERT INTO inventory_movements
    (id, merchant, item_id, location_id, qty_milli, reason, unit_cost_cents, occurred_ts, srv_ts, meta, created_ts)
    VALUES (?, ?, ?, 'u-economat', ?, 'opening', ?, ?, ?, ?, ?)`);
  movement.run('seed-whisky-a', MERCHANT, 'whisky', 6000, 12000, 10, 10, JSON.stringify({ expiresAt: 1000 }), 10);
  movement.run('seed-whisky-b', MERCHANT, 'whisky', 6000, 15000, 11, 11, JSON.stringify({ expiresAt: 2000 }), 11);
  movement.run('seed-cola', MERCHANT, 'cola', 24000, 400, 12, 12, '{}', 12);
  movement.run('seed-verrerie', MERCHANT, 'verrerie', 40000, null, 13, 13, '{}', 13);
}

export async function createHotelRequestHarness() {
  const raw = new DatabaseSync(':memory:');
  setup(raw);
  const DB = new D1Sqlite(raw);
  let clock = 2000000;
  const env = { AUTH_SECRET: SECRET, DB, NOW: () => ++clock };
  const ownerCookie = `${SESS_COOKIE}=${await makeSession('owner-1', SECRET)}`;
  const employeeCookie = async (id) => `${EMPLOYEE_COOKIE}=${await employeeToken(SECRET, { merchant: MERCHANT, staffId: id })}`;
  const post = (body, cookie = ownerCookie) => onRequestPost({
    request: new Request('https://kiwi.test/api/inventory/internal-requests', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), env,
  });
  const get = (id, cookie = ownerCookie) => onRequestGet({
    request: new Request(`https://kiwi.test/api/inventory/internal-requests?merchant=${MERCHANT}&id=${id}`, { headers: { cookie } }), env,
  });
  const rows = (sql, ...args) => raw.prepare(sql).all(...args);
  const one = (sql, ...args) => raw.prepare(sql).get(...args) || null;
  const addMovement = ({ id, itemId, qty, locationId = 'u-economat', unitCost = 0, reason = 'sale', ts = ++clock }) => {
    const cursor = Number(one('SELECT last_ts FROM inventory_sync_sequences WHERE merchant = ?', MERCHANT).last_ts) + 1;
    raw.prepare('UPDATE inventory_sync_sequences SET last_ts = ? WHERE merchant = ?').run(cursor, MERCHANT);
    raw.prepare(`INSERT INTO inventory_movements
      (id, merchant, item_id, location_id, qty_milli, reason, unit_cost_cents, occurred_ts, srv_ts, meta, created_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`)
      .run(id, MERCHANT, itemId, locationId, Math.round(qty * 1000), reason,
        unitCost == null ? null : Math.round(unitCost * 100), ts, cursor, ts);
  };
  const createSubmitted = async (id, itemId, qty) => {
    let response = await post({
      action: 'create', merchant: MERCHANT, id, unitId: 'rooftop', idempotencyKey: `create:${id}`,
      lines: [{ itemId, unit: itemId === 'verrerie' ? 'unite' : 'bouteille', qtyRequested: qty }],
    });
    if (response.status !== 200) throw new Error(`create ${id}: ${response.status}`);
    response = await post({ action: 'submit', merchant: MERCHANT, id, revision: 1, idempotencyKey: `submit:${id}` });
    if (response.status !== 200) throw new Error(`submit ${id}: ${response.status}`);
    return response.json();
  };
  const ready = async (id, itemId, qty) => {
    await createSubmitted(id, itemId, qty);
    let response = await post({
      action: 'review', merchant: MERCHANT, id, revision: 2, idempotencyKey: `review:${id}`,
      data: { lines: [{ itemId, qtyApproved: qty, resolution: 'approved' }] },
    });
    if (response.status !== 200) throw new Error(`review ${id}: ${response.status} ${await response.text()}`);
    response = await post({
      action: 'prepare', merchant: MERCHANT, id, revision: 3, idempotencyKey: `prepare:${id}`,
      data: { fulfilmentMethod: 'pickup', handover: true, lines: [{ itemId, qtyPrepared: qty }] },
    });
    if (response.status !== 200) throw new Error(`prepare ${id}: ${response.status}`);
    return response.json();
  };
  const balance = (itemId, locationId) => Number(one(
    'SELECT COALESCE(SUM(qty_milli), 0) AS qty FROM inventory_movements WHERE merchant = ? AND item_id = ? AND location_id = ?',
    MERCHANT, itemId, locationId,
  ).qty) / 1000;
  return { raw, DB, env, ownerCookie, employeeCookie, post, get, rows, one, addMovement, createSubmitted, ready, balance };
}

