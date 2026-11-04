/* r19 loyalty: the 2 000 linked-product ruling holds on the server (a full
 * programme saves, 2 001 is refused with a named error, never truncated), the
 * client-store write path refuses it too, and the word/weight rules behave. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { stampsFor, qualifyingQty } from '../functions/api/_rules-loyalty.js';

const root = new URL('..', import.meta.url).pathname;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };
const f = await fixture(root);
const save = async (ids) => {
  const doc = { model: 'product', product: { item: 'Café', target: 10, reward: '1 offert', ids } };
  const res = await storePost({ env: f.env, request: new Request('https://kiwi.test/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: f.cookies ? f.cookies.owner : '' },
    body: JSON.stringify({ merchant: f.merchant, feature: 'fidelity', data: doc, baseRev: 0 }) }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const { makeSession, SESS_COOKIE } = await import('../functions/auth/_lib.js');
f.cookies = { owner: `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}` };
const ids = (n) => Array.from({ length: n }, () => randomUUID());

let r = await save(ids(2000));
ok(r.status === 200, 'a programme with 2 000 UUID-linked products saves (was a generic 413 near 500)');
const stored = JSON.parse(f.sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='fidelity'").get(f.merchant).data);
ok(stored.product.ids.length === 2000, 'all 2 000 ids are stored, none truncated');
r = await save(ids(2001));
ok(r.status === 400 && r.body.error === 'link-limit' && r.body.max === 2000, 'the server refuses 2 001 linked products with a named error');

// the client-store write path
const part = fs.readFileSync('assets/clients-store/profile.js', 'utf8');
const start = part.indexOf('function setConfig(patch, book)'), end = part.indexOf('/* ── normalisation');
const body = part.slice(start, end);
let written = null;
const ctx = vm.createContext({ config: () => ({ model: 'product', product: { ids: [] } }), bookId: () => 'b', fidelityStore: { set: (v) => { written = v; } } });
vm.runInContext(body + ';this.setConfig = setConfig;', ctx);
ok(ctx.setConfig({ product: { ids: ids(2001) } }) === null && written === null, 'setConfig refuses more than 2 000 linked ids and writes nothing');
ok(ctx.setConfig({ product: { ids: ids(2000) } }) !== null && written && written.product.ids.length === 2000, 'setConfig accepts exactly 2 000');

// weighed lines
const cfg = { model: 'product', product: { item: 'Fromage', ids: ['p1'] } };
for (const unit of ['kilo', 'kilogram', 'gr', 'litre', '', undefined]) {
  ok(stampsFor(cfg, [{ id: 'p1', qty: 0.4, unit }]) === 1, `0.4 with unit "${unit === undefined ? 'none' : unit}" earns one stamp (weighed)`);
}
ok(stampsFor(cfg, [{ id: 'p1', qty: 2.9, unit: 'unit' }]) === 2, 'a unit product with a fractional quantity still counts whole units');
ok(stampsFor(cfg, [{ id: 'p1', qty: 3, unit: '' }]) === 3, 'whole quantities keep counting units');

// word matching
const tea = { model: 'product', product: { item: 'Thé', ids: [] } };
ok(qualifyingQty(tea, [{ name: 'The Burger', qty: 1 }]) === 0, 'a "Thé" programme does not stamp "The Burger"');
ok(qualifyingQty(tea, [{ name: 'Thé à la menthe', qty: 2 }]) === 2, 'it still stamps "Thé à la menthe"');
ok(qualifyingQty({ model: 'product', product: { item: 'the', ids: [] } }, [{ name: 'Thé vert', qty: 1 }]) === 1, 'an unaccented entry still folds accents');
ok(qualifyingQty({ model: 'product', product: { item: 'Café', ids: [] } }, [{ name: 'Cafe noir', qty: 1 }]) === 1, 'longer words keep folding accents');
f.close();
console.log(`loyalty-link-limit: ${checks} checks passed`);
