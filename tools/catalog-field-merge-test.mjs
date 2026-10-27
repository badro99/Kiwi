#!/usr/bin/env node
/* catalog-field-merge-test · two devices, one product, two edits.
 *
 * The catalogue used to keep a whole product from the device with the newer
 * metaAt. A price changed offline on the till was lost as soon as the
 * dashboard renamed the same product later, and nobody was told. The shared
 * rule (functions/api/_rules-catalog.js) now merges field by field:
 *   1. two devices changing DIFFERENT fields both keep their edit;
 *   2. two devices changing the SAME field without having seen each other keep
 *      the later value, and the other one is filed on the record under
 *      `conflicts` for the merchant to review, on every device;
 *   3. a device that had seen the first edit before making its own is not a
 *      conflict;
 *   4. a later edit of the field settles the review everywhere;
 *   5. a record written by older code (no per-field clocks) merges whole, as
 *      before;
 *   6. property: any history of edits and syncs on three devices converges to
 *      one copy, each field holding the edit with the latest clock.
 * Cases 1 and 2 are red on the rule before this change:
 *   KIWI_RULES_CATALOG=<old copy> node tools/catalog-field-merge-test.mjs */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const rules = await import(pathToFileURL(process.env.KIWI_RULES_CATALOG || path.join(ROOT, 'functions/api/_rules-catalog.js')).href);
const clone = (x) => JSON.parse(JSON.stringify(x));
let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ✓ ' + label); };

const T0 = Date.now() - 6 * 3600e3;
const shop = () => ({
  v: 1, seq: 0, removed: {}, moves: [],
  categories: [{ id: 'c0', name: 'Rayon', color: 'atlas', order: 0, metaAt: T0 }],
  products: [{ id: 'p0', name: 'Chemise lin', categoryId: 'c0', priceMAD: 300, sku: 'CH-1', metaAt: T0 }],
  variants: [{ id: 'v0', productId: 'p0', size: 'M', colorId: 'noir', note: '', stock: 4, base: 4, baseAt: T0, metaAt: T0, barcodes: [], barcodeRemoved: {} }],
});
const FIELDS = { categories: rules.CATEGORY_FIELDS, products: rules.PRODUCT_FIELDS, variants: rules.VARIANT_FIELDS };
/* An edit as the app makes it: copy, change, stamp field by field. */
function edit(doc, kind, id, patch, t) {
  const rec = doc[kind].find((r) => r.id === id);
  if (!rules.touchFields) { Object.assign(rec, patch); rec.metaAt = t; return; }   // the old rule: one clock per record
  const before = clone(rec);
  Object.assign(rec, patch);
  rules.touchFields(rec, before, FIELDS[kind], t);
}
const merge = (mine, theirs, t) => rules.mergeDocs(clone(mine), clone(theirs), t).doc;
/* A device pushes: the server keeps the merge; the device takes it back. */
function sync(dev, srv, t) { const out = merge(dev, srv, t); return [clone(out), clone(out)]; }
const product = (doc) => doc.products.find((p) => p.id === 'p0');

console.log('catalog-field-merge-test');

check('two devices change different fields offline: both edits survive', () => {
  let srv = shop(), till = clone(srv), dash = clone(srv);
  edit(till, 'products', 'p0', { priceMAD: 320 }, T0 + 1000);       // the till changes the price
  edit(dash, 'products', 'p0', { name: 'Chemise lin bleue' }, T0 + 5000);   // later, the dashboard renames
  [till, srv] = sync(till, srv, T0 + 6000);
  [dash, srv] = sync(dash, srv, T0 + 7000);
  [till, srv] = sync(till, srv, T0 + 8000);
  assert.equal(product(srv).priceMAD, 320, 'the price set on the till is kept');
  assert.equal(product(srv).name, 'Chemise lin bleue', 'the name set on the dashboard is kept');
  for (const doc of [till, dash]) { assert.equal(product(doc).priceMAD, 320); assert.equal(product(doc).name, 'Chemise lin bleue'); }
  assert.equal(product(srv).conflicts, undefined, 'different fields are not a disagreement');
});

check('two devices change the same price offline: the later one is kept, the other is filed for review on every device', () => {
  let srv = shop(), till = clone(srv), dash = clone(srv);
  edit(till, 'products', 'p0', { priceMAD: 320 }, T0 + 1000);
  edit(dash, 'products', 'p0', { priceMAD: 350 }, T0 + 2000);
  [till, srv] = sync(till, srv, T0 + 3000);
  [dash, srv] = sync(dash, srv, T0 + 4000);
  [till, srv] = sync(till, srv, T0 + 5000);
  for (const doc of [srv, till, dash]) {
    assert.equal(product(doc).priceMAD, 350, 'the later edit is the price');
    assert.ok(product(doc).conflicts && product(doc).conflicts.priceMAD, 'the other price is filed');
    assert.deepEqual(product(doc).conflicts.priceMAD, { other: 320, otherAt: T0 + 1000, keptAt: T0 + 2000 });
  }
});

check('a device that had seen the first price before changing it is not a disagreement', () => {
  let srv = shop(), till = clone(srv), dash = clone(srv);
  edit(till, 'products', 'p0', { priceMAD: 320 }, T0 + 1000);
  [till, srv] = sync(till, srv, T0 + 1500);
  [dash, srv] = sync(dash, srv, T0 + 1600);          // the dashboard reads 320
  edit(dash, 'products', 'p0', { priceMAD: 350 }, T0 + 2000);
  [dash, srv] = sync(dash, srv, T0 + 3000);
  [till, srv] = sync(till, srv, T0 + 4000);
  assert.equal(product(srv).priceMAD, 350);
  assert.equal(product(srv).conflicts, undefined);
  assert.equal(product(till).conflicts, undefined);
});

check('keeping one of the two prices settles the review on every device', () => {
  let srv = shop(), till = clone(srv), dash = clone(srv);
  edit(till, 'products', 'p0', { priceMAD: 320 }, T0 + 1000);
  edit(dash, 'products', 'p0', { priceMAD: 350 }, T0 + 2000);
  [till, srv] = sync(till, srv, T0 + 3000);
  [dash, srv] = sync(dash, srv, T0 + 4000);
  [till, srv] = sync(till, srv, T0 + 5000);
  // The merchant picks the till's price on the dashboard.
  edit(dash, 'products', 'p0', { priceMAD: product(dash).conflicts.priceMAD.other }, T0 + 6000);
  assert.equal(product(dash).conflicts, undefined, 'settled where it was chosen');
  [dash, srv] = sync(dash, srv, T0 + 7000);
  [till, srv] = sync(till, srv, T0 + 8000);
  for (const doc of [srv, till, dash]) {
    assert.equal(product(doc).priceMAD, 320);
    assert.equal(product(doc).conflicts, undefined, 'and gone everywhere');
  }
  // Keeping the current value is an edit too: it settles without changing the price.
  let s2 = shop(), a = clone(s2), b = clone(s2);
  edit(a, 'products', 'p0', { priceMAD: 320 }, T0 + 1000);
  edit(b, 'products', 'p0', { priceMAD: 350 }, T0 + 2000);
  [a, s2] = sync(a, s2, T0 + 3000); [b, s2] = sync(b, s2, T0 + 4000);
  assert.ok(product(b).conflicts.priceMAD);
  rules.settleField(product(b), 'priceMAD', FIELDS.products, T0 + 5000);
  [b, s2] = sync(b, s2, T0 + 6000); [a, s2] = sync(a, s2, T0 + 7000);
  assert.equal(product(a).priceMAD, 350); assert.equal(product(a).conflicts, undefined);
});

check('variants and categories merge field by field too', () => {
  let srv = shop(), till = clone(srv), dash = clone(srv);
  edit(till, 'variants', 'v0', { note: 'ourlet' }, T0 + 1000);
  edit(dash, 'variants', 'v0', { size: 'L' }, T0 + 2000);
  edit(till, 'categories', 'c0', { color: 'mint' }, T0 + 1100);
  edit(dash, 'categories', 'c0', { name: 'Chemises' }, T0 + 2100);
  [till, srv] = sync(till, srv, T0 + 3000);
  [dash, srv] = sync(dash, srv, T0 + 4000);
  const v = srv.variants[0], c = srv.categories[0];
  assert.equal(v.note, 'ourlet'); assert.equal(v.size, 'L');
  assert.equal(c.color, 'mint'); assert.equal(c.name, 'Chemises');
});

check('a record written by older code merges whole, as before', () => {
  const srv = shop(), a = clone(srv), b = clone(srv);
  Object.assign(product(a), { priceMAD: 320, metaAt: T0 + 1000 });
  Object.assign(product(b), { name: 'Chemise', metaAt: T0 + 2000 });
  const out = merge(a, b, T0 + 3000);
  assert.equal(product(out).name, 'Chemise'); assert.equal(product(out).priceMAD, 300, 'old records keep the old rule');
  // A per-field record that older code rewrote (metaAt moved, map not) counts as one edit at its metaAt.
  const c = clone(srv), d = clone(srv);
  edit(c, 'products', 'p0', { priceMAD: 320 }, T0 + 1000);
  Object.assign(product(c), { name: 'Rebaptisée', metaAt: T0 + 4000 });   // older code: no map update
  edit(d, 'products', 'p0', { priceMAD: 350 }, T0 + 2000);
  const out2 = merge(d, c, T0 + 5000);
  assert.equal(product(out2).name, 'Rebaptisée'); assert.equal(product(out2).priceMAD, 320, 'the whole stale-map record is one edit at its metaAt');
});

/* 6 · property: three devices, random field edits and syncs, converge. */
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { fc = null; }
if (!fc) {
  if (process.env.KIWI_ALLOW_PROPERTY_SKIP !== '1' && process.argv.includes('--require-properties')) { console.error('✗ fast-check absent'); process.exit(1); }
  console.log('  ○ fast-check absent; convergence property not executed');
} else {
  const opArb = fc.oneof(
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('edit'), dev: fc.nat(2), field: fc.constantFrom('priceMAD', 'name', 'sku'), value: fc.nat(3) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('variant'), dev: fc.nat(2), field: fc.constantFrom('note', 'size'), value: fc.nat(3) }) },
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('sync'), dev: fc.nat(2) }) },
  );
  const r = fc.check(fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
    let srv = shop(); const devs = [clone(srv), clone(srv), clone(srv)];
    let t = T0; const last = {};
    for (const op of ops) {
      t += 7;
      if (op.kind === 'sync') { [devs[op.dev], srv] = sync(devs[op.dev], srv, t); continue; }
      const value = op.field === 'priceMAD' ? 100 + op.value : op.field + op.value;
      const rec = op.kind === 'edit' ? product(devs[op.dev]) : devs[op.dev].variants[0];
      if (rec[op.field] === value) continue;     // saving the value already there is not an edit
      if (op.kind === 'edit') edit(devs[op.dev], 'products', 'p0', { [op.field]: value }, t);
      else edit(devs[op.dev], 'variants', 'v0', { [op.field]: value }, t);
      last[(op.kind === 'edit' ? 'p.' : 'v.') + op.field] = value;
    }
    for (let round = 0; round < 2; round++) for (let i = 0; i < 3; i++) { t += 7; [devs[i], srv] = sync(devs[i], srv, t); }
    const view = (d) => JSON.stringify([d.products, d.variants.map(({ stock, ...v }) => v)]);
    assert.ok(devs.every((d) => view(d) === view(srv)), 'every copy is the same');
    for (const [key, value] of Object.entries(last)) {
      const [kind, field] = key.split('.');
      const rec = kind === 'p' ? product(srv) : srv.variants[0];
      assert.deepEqual(rec[field], value, key + ' holds the latest edit');
    }
    for (const rec of [product(srv), srv.variants[0]]) for (const f of Object.keys(rec.conflicts || {})) {
      assert.notDeepEqual(rec.conflicts[f].other, rec[f], 'a filed value differs from the kept one');
    }
  }), { numRuns: Number(process.env.KIWI_PROPERTY_RUNS) || 300, seed: Number(process.env.KIWI_PROPERTY_SEED) || 20261027 });
  if (r.failed) { console.error('✗ convergence', fc.stringify(r.counterexample).slice(0, 1500), r.errorInstance && r.errorInstance.message); process.exit(1); }
  passed++; console.log('  ✓ property: any history of field edits and syncs on three devices converges, each field holding its latest edit');
}
console.log(`✓ catalog-field-merge-test · ${passed} held`);
