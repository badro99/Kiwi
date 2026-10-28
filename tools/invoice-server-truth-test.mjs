#!/usr/bin/env node
/* invoice-server-truth-test · POST /api/invoice does not print what the till
 * says, it prints what the sale says.
 *
 * The till's snapshot used to be stored as sent: TTC compared only when
 * totals.ttc was present, HT and TVA only checked to add up, lines never
 * compared with the sale, any rate accepted, while the number comes from series
 * F shared with the server-computed v2 engine. Now the TTC is the sale's
 * amount, the rate must be one v2 accepts, HT and TVA are recomputed, the lines
 * are the sale's and every correction is written on the snapshot. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getOrCreateSaleInvoice } from '../functions/api/invoice.js';
import { computeTotals } from '../functions/api/invoices/_tax.js';
import { splitTtc } from '../functions/api/_invoice-reconcile.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const ts = Date.UTC(2026, 9, 20, 12);
const ins = sqlite.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ref, ts, lines) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const basket = JSON.stringify([{ n: 'Menu', q: 1, t: 95.5 }, { n: 'Soda', q: 2, t: 30 }]);
ins.run('s1', 'm', 126, 12550, 'cash', 'R1', ts, basket);
ins.run('s2', 'm', 100, 10000, 'cash', 'R2', ts, basket);
ins.run('s3', 'm', 20, 2000, 'cash', 'R3', ts, null);
ins.run('s4', 'm', 100, 10000, 'cash', 'R4', ts, null);
ins.run('s5', 'm', 50, 5000, 'cash', 'R5', ts, null);
const db = {
  prepare(q) {
    const st = sqlite.prepare(q);
    const bound = (p) => ({
      async first() { const r = st.get(...p); return r === undefined ? null : r; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    });
    return Object.assign(bound([]), { bind: (...p) => bound(p) });
  },
  async batch(stmts) {
    sqlite.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
};
const env = { DB: db };
const make = (id, snap) => getOrCreateSaleInvoice(env, 'm', id, null, snap);
const refuse = async (id, snap) => { try { await make(id, snap); } catch (e) { return e; } return null; };

// The engine's own rate list is the contract; the split matches the till's.
for (const rate of [0, 7, 10, 14, 20]) {
  for (const cents of [1, 99, 12550, 10000, 33333]) {
    const { htCents, vatCents } = splitTtc(cents, rate);
    assert.equal(htCents + vatCents, cents);
    if (rate) {
      const v2 = computeTotals([{ description: 'x', qty: 1, unitHT: htCents, discountPct: 0, vatRate: rate }]);
      assert.ok(Math.abs(v2.ttcCents - cents) <= 1, `v2 engine agrees within a centime (rate ${rate}, ${cents})`);
    }
  }
}

// A till that lies about everything it can.
let res = await make('s1', {
  tvaRate: 20, issuedTs: ts,
  totals: { ht: 1, tva: 124.5, ttc: 125.5 },
  lines: [{ name: 'Caftan de luxe', qty: 1, unitTTC: 125.5, totalTTC: 125.5 }],
});
assert.deepEqual(res.snapshot.totals, { ht: 104.58, tva: 20.92, ttc: 125.5 }, 'HT and TVA are recomputed from the sale TTC and the rate');
assert.equal(res.snapshot.tvaRate, 20);
assert.deepEqual(res.snapshot.lines.map(l => [l.name, l.totalTTC]), [['Menu', 95.5], ['Soda', 30]], 'lines are the sale\'s, not the till\'s');
assert.deepEqual(res.snapshot.reconciled, ['totals', 'lines'], 'the corrections are written on the document');
const stored = JSON.parse(sqlite.prepare('SELECT snapshot FROM sale_invoices WHERE sale_id=?').get('s1').snapshot);
assert.deepEqual(stored.totals, res.snapshot.totals, 'and what is stored is what was reconciled');

// An honest till is left as it is.
res = await make('s2', { tvaRate: 20, issuedTs: ts,
  totals: { ht: 83.33, tva: 16.67, ttc: 100 },
  lines: [{ name: 'Menu', qty: 1, unitTTC: 95.5, totalTTC: 95.5 }, { name: 'Soda', qty: 2, unitTTC: 15, totalTTC: 30 },
    { name: 'Remise', qty: 1, unitTTC: -25.5, totalTTC: -25.5 }] });
assert.equal(res.snapshot.reconciled, undefined, 'a consistent snapshot is not touched');
assert.deepEqual(res.snapshot.totals, { ht: 83.33, tva: 16.67, ttc: 100 });

// No TTC sent: the sale's amount is used instead of whatever is missing.
res = await make('s3', { tvaRate: 0, issuedTs: ts });
assert.deepEqual(res.snapshot.totals, { ht: 20, tva: 0, ttc: 20 }, 'TTC comes from the sale even when the till sent none');
assert.equal(res.snapshot.lines.length, 1);
assert.equal(res.snapshot.lines[0].totalTTC, 20, 'no basket anywhere: one line « Vente <ref> »');

// A rate the v2 engine would refuse.
let err = await refuse('s4', { tvaRate: 33, issuedTs: ts, totals: { ttc: 100 } });
assert.equal(err && err.message, 'invalid-vat-rate');
assert.equal(err.status, 409);
assert.equal(sqlite.prepare("SELECT count(*) n FROM sale_invoices WHERE sale_id='s4'").get().n, 0, 'nothing is numbered');
// Another TTC than the sale's is still refused.
err = await refuse('s4', { tvaRate: 20, issuedTs: ts, totals: { ttc: 99 } });
assert.equal(err && err.message, 'total-mismatch');
// Lines that do not add up to the money, on a sale with no stored basket.
res = await make('s5', { tvaRate: 20, issuedTs: ts, totals: { ttc: 50 },
  lines: [{ name: 'Tout', qty: 1, unitTTC: 500, totalTTC: 500 }] });
assert.equal(res.snapshot.lines[0].totalTTC, 50);
assert.ok(res.snapshot.reconciled.includes('lines'));
// All invoices went through the shared series, in order.
assert.deepEqual(sqlite.prepare('SELECT seq FROM sale_invoices ORDER BY seq').all().map(r => r.seq), [1, 2, 3, 4]);
console.log('✓ invoice server truth: TTC, rate, HT/TVA and lines come from the sale, corrections are recorded');
