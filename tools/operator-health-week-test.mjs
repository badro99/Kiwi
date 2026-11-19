/* Console opérateur · « N j actifs sur 7 » ne dépasse jamais 7.
 *
 * 19 nov. 2026 : la console affichait « 8 j actifs sur 7 » pour Santos Store
 * et Pasta Corner. La fenêtre « 7 jours » était glissante (maintenant moins
 * 7 × 24 h) : elle touche huit journées métier, la journée en cours et un
 * morceau de la huitième. La fenêtre commence désormais au début de la
 * journée métier d'il y a six jours (coupure à 05 h), soit sept journées.
 *   node tools/operator-health-week-test.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { workspace } from '../functions/api/admin/_workspace.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { let args = []; const stmt = { bind(...v) { args = v; return stmt; }, all() { return { results: db.prepare(sql).all(...args) }; } }; return stmt; } };

const DAY = 86400000, CUT = 5 * 3600000, now = Date.now();
const dayStart = Math.floor((now - CUT) / DAY) * DAY + CUT;
const insert = db.prepare("INSERT INTO sales (id, merchant, ts, amount, amount_cents, method) VALUES (?, ?, ?, ?, ?, 'cash')");
/* A sale on each of the last seven business days, today included. */
for (let i = 0; i < 7; i++) insert.run('s' + i, 'shop', Math.min(now - 1000, dayStart - i * DAY + 1000), 10, 1000);
/* One more, 7 × 24 h minus a minute ago: inside a rolling week, but on the eighth business day back. */
insert.run('s-old', 'shop', now - 7 * DAY + 60000, 10, 1000);

const ws = await workspace({ DB }, 'shop');
const row = ws.sources.activity.rows.find(r => r.merchant === 'shop');
assert.ok(row, 'the shop has an activity row');
assert.equal(row.active_days_7d, 7, 'seven business days at most, never eight');
assert.equal(row.sales_7d, 7, 'the sale on the eighth business day back is outside the week');
console.log('✓ operator health week: 7 business days, never 8');
