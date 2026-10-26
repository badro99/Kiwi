#!/usr/bin/env node
/* Le pourboire saisi à l'encaissement arrive en base, et revient au tableau de bord.
 *
 * La table `sales` n'avait pas de colonne pourboire : le tableau de bord ne
 * l'apprenait qu'à la clôture (le Z), donc une journée ouverte n'en montrait
 * aucun. Ce banc passe par le vrai POST /api/sale et le vrai GET /api/feed, sur
 * une base construite depuis schema.sql, colonne retirée (la base de production
 * retarde toujours sur le fichier) : c'est sale.js qui la pose au premier
 * pourboire, comme payment_parts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost } from '../functions/api/sale.js';
import { onRequestGet } from '../functions/api/feed.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
/* La base de production retarde sur schema.sql : on retire la colonne pour
   prouver que sale.js la pose lui-même au premier pourboire. */
sqlite.exec('ALTER TABLE sales DROP COLUMN tip_cents');
const DB = { prepare(sql) { let args = []; return {
  bind(...values) { args = values.map(value => value === undefined ? null : value); return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() { return { results: sqlite.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; }, async batch(statements) {
  sqlite.exec('BEGIN IMMEDIATE');
  try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
  catch (error) { sqlite.exec('ROLLBACK'); throw error; }
} };
const merchant = 'sale-tip-fixture';
const secret = 'synthetic-sale-tip-only';
const env = { DB, AUTH_SECRET: secret };
sqlite.prepare("INSERT INTO merchant_config(merchant, features, status, updated_ts) VALUES (?, ?, 'active', ?)").run(merchant, '{}', Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
async function post(id, amountCents, tipCents) {
  const body = { merchant, id, method: 'cash', amountCents, amount: amountCents / 100, label: 'TEST KIWI', ref: id, ts: Date.now(),
    lines: [{ name: 'TEST KIWI', qty: 1, total: amountCents / 100 }] };
  if (tipCents !== undefined) body.tipCents = tipCents;
  const response = await onRequestPost({ request: new Request('https://kiwi.test/api/sale', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, waitUntil() {} });
  return { status: response.status, body: await response.json() };
}
const col = () => sqlite.prepare('PRAGMA table_info(sales)').all().some(c => c.name === 'tip_cents');

let n = 0;
const ok = (label, fn) => { fn(); n++; console.log('  ✓ ' + label); };

console.log('■ Pourboire en base (tools/sale-tip-d1-test.mjs)');
const plain = await post('tip-none', 4500);
ok('une vente sans pourboire n\'ajoute rien, pas même la colonne', () => { assert.equal(plain.status, 200, JSON.stringify(plain)); assert.equal(col(), false); });
const tipped = await post('tip-one', 12000, 1550);
ok('une vente avec pourboire : 200, la colonne est posée, le pourboire écrit à part du montant', () => {
  assert.equal(tipped.status, 200, JSON.stringify(tipped));
  const row = sqlite.prepare('SELECT amount_cents, tip_cents FROM sales WHERE id = ?').get('tip-one');
  assert.equal(row.amount_cents, 12000); assert.equal(row.tip_cents, 1550);
});
await post('tip-one', 12000, 9999);
ok('rejouer la même vente avec un autre pourboire ne réécrit pas le premier', () => assert.equal(sqlite.prepare('SELECT tip_cents FROM sales WHERE id = ?').get('tip-one').tip_cents, 1550));
/* §10.26 (étape 4) : un pourboire hors de 0 au montant de la vente est
   refusé, la vente avec ; il n'est plus avalé en silence. */
const neg = await post('tip-neg', 3000, -500);
const over = await post('tip-over', 3000, 100001);
// A 30 MAD haircut with a 50 MAD tip is a real sale: the tip sits beside the amount (wave Q).
const generous = await post('tip-generous', 3000, 5000);
ok('un pourboire plus grand que la prestation, sous 1 000 MAD, est accepté', () => assert.equal(generous.status, 200, JSON.stringify(generous)));
const junk = await post('tip-junk', 3000, 'beaucoup');
ok('un pourboire négatif, supérieur à la vente ou illisible est refusé (bad-tip), rien n\'est écrit', () => {
  for (const r of [neg, over, junk]) { assert.equal(r.status, 400, JSON.stringify(r)); assert.equal(r.body.error, 'bad-tip'); }
  for (const id of ['tip-neg', 'tip-over', 'tip-junk']) assert.equal(sqlite.prepare('SELECT id FROM sales WHERE id = ?').get(id), undefined);
});
const zero = await post('tip-zero', 3000, 0);
const whole = await post('tip-whole', 3000, 3000);
ok('0 est « pas de pourboire » ; un pourboire égal à la vente est accepté', () => {
  assert.equal(zero.status, 200); assert.equal(whole.status, 200);
  assert.equal(sqlite.prepare('SELECT tip_cents FROM sales WHERE id = ?').get('tip-zero').tip_cents, null);
  assert.equal(sqlite.prepare('SELECT tip_cents FROM sales WHERE id = ?').get('tip-whole').tip_cents, 3000);
});
const feed = await onRequestGet({ request: new Request(`https://kiwi.test/api/feed?merchant=${merchant}`, { headers: { Cookie: cookie } }), env });
const ledger = await feed.json();
ok('le flux du tableau de bord rend tipCents sur la vente qui en a un, et seulement elle', () => {
  assert.equal(feed.status, 200);
  const byId = Object.fromEntries(ledger.sales.map(s => [s.id, s]));
  assert.equal(byId['tip-one'].tipCents, 1550);
  assert.equal('tipCents' in byId['tip-none'], false);
  assert.equal('tipCents' in byId['tip-zero'], false);
});
console.log(`✓ ${n} sale tip checks green`);
