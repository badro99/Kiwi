#!/usr/bin/env node
/* invoice-long-basket-test · a detailed invoice for a basket longer than the
 * sale line limit keeps every centime.
 *
 * /api/sale keeps 40 lines and folds the rest into one « N autres articles »
 * line (the till folds the same way); the invoice built from that sale must carry
 * that folded line with its pieces and total, add up to the sale to the centime,
 * and add no « Ajustement » line. A legacy sale that stored more than 40 lines
 * keeps all of them: nothing on the invoice path truncates. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getOrCreateSaleInvoice } from '../functions/api/invoice.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const ts = Date.UTC(2026, 9, 20, 12);
const row = (n, i) => ({ n: 'Article ' + i, q: 1 + (i % 2), t: 10.1 + (i % 3) });
const sum = (rows) => rows.reduce((c, l) => c + Math.round(l.t * 100), 0);
const ins = sqlite.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ref, ts, lines) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

/* 60 articles as the sale route stores them: 39 lines + « 21 autres articles ». */
const raw = Array.from({ length: 60 }, row);
const tail = raw.slice(39);
const folded = raw.slice(0, 39).concat([{ n: tail.length + ' autres articles', q: tail.reduce((n, l) => n + l.q, 0), t: sum(tail) / 100 }]);
ins.run('long', 'm', sum(raw) / 100, sum(raw), 'cash', 'R-LONG', ts, JSON.stringify(folded));
/* An older sale that kept every line (more than the 40 the route now keeps). */
ins.run('legacy', 'm', sum(raw) / 100, sum(raw), 'cash', 'R-OLD', ts, JSON.stringify(raw));

const db = { prepare(q) { const st = sqlite.prepare(q); const bound = (p) => ({ async first() { const r = st.get(...p); return r === undefined ? null : r; }, async all() { return { results: st.all(...p) }; }, async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; } }); return Object.assign(bound([]), { bind: (...p) => bound(p) }); },
  async batch(stmts) { sqlite.exec('BEGIN'); try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
const make = (id) => getOrCreateSaleInvoice({ DB: db }, 'm', id, null, { tvaRate: 20, issuedTs: ts, lines: [{ name: 'Panier', qty: 1, unitTTC: 1, totalTTC: 1 }] });
const cents = (lines) => lines.reduce((c, l) => c + Math.round(l.totalTTC * 100), 0);

let res = await make('long');
let lines = res.snapshot.lines;
assert.equal(lines.length, 40, 'the invoice carries the 40 lines the sale kept');
assert.equal(lines[39].name, '21 autres articles', 'the folded line is named, with its count');
assert.equal(lines[39].qty, tail.reduce((n, l) => n + l.q, 0), 'and its pieces');
assert.equal(cents(lines), sum(raw), 'lines add up to the sale to the centime');
assert.equal(res.snapshot.totals.ttc, sum(raw) / 100);
assert.ok(!lines.some((l) => l.name === 'Ajustement' || l.name === 'Remise'), 'no balancing line is invented');
assert.ok(res.snapshot.reconciled.includes('lines'), 'the till sent one line; the sale own lines replace it and say so');

res = await make('legacy');
lines = res.snapshot.lines;
assert.equal(lines.length, 60, 'a legacy 60-line sale keeps every line');
assert.equal(cents(lines), sum(raw));
assert.equal(lines[59].name, 'Article 59');
console.log('✓ invoice long basket: folded and legacy long baskets keep every line and every centime');
