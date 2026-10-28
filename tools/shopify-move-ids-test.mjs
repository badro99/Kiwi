#!/usr/bin/env node
/* Shopify stock movement ids have one builder (functions/api/shopify/_move-ids.js),
 * used by the order webhook, the catch-up replay and the cancel/refund reversal
 * (note 13, shopify#1). Two things must hold:
 *   1 · the ids are byte-for-byte the ones already stored in merchants'
 *       catalogues by the three former builders (numeric REST ids);
 *   2 · the same order line gives the same id whether Shopify sent a number or
 *       a gid://shopify/… id, which the former reversal builder did not.
 * The end-to-end path (catch-up sale, then refund webhook) runs in
 * tools/shopify-sync-properties-test.mjs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { saleMoveId, reversalMoveId, lineKey } from '../functions/api/shopify/_move-ids.js';

const ROOT = new URL('../', import.meta.url).pathname;
let fc; try { fc = createRequire(ROOT + 'app/package.json')('fast-check'); } catch { console.log('○ skip fast-check unavailable'); process.exit(process.env.CI ? 1 : 0); }
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ✓ ' + m); };

/* The three builders as they stood before note 13, kept here as the record of
   what is stored in production journals. */
const legacy = {
  webhook: (ref, lineId) => `so-${String(ref).slice(0, 36).slice(-24)}-${String(lineId).slice(-24)}`.slice(0, 64),
  replay: (orderGid, lineGid) => { const tail = (g) => String(g || '').split('/').pop(); return `so-${tail(orderGid).slice(-24)}-${tail(lineGid).slice(-24)}`.slice(0, 64); },
  key: (ref, lineId) => `${String(ref).slice(0, 64).slice(-24)}-${String(lineId).slice(0, 64).slice(-24)}`,
  reversal: (kind, key, refundId) => (kind === 'refund' ? `sr-${String(refundId).slice(0, 64).slice(-10)}-${key}` : `sx-${key}`).slice(0, 64),
};
const id = fc.bigInt({ min: 1n, max: 99999999999999999999n }).map(String);
fc.assert(fc.property(id, id, id, (order, line, refund) => {
  const sale = saleMoveId(order, line);
  assert.equal(sale, legacy.webhook(order, line));
  assert.equal(sale, legacy.replay(`gid://shopify/Order/${order}`, `gid://shopify/LineItem/${line}`));
  assert.equal(sale, `so-${legacy.key(order, line)}`.slice(0, 64));
  assert.equal(lineKey(order, line), legacy.key(order, line));
  assert.equal(reversalMoveId('refund', lineKey(order, line), refund), legacy.reversal('refund', legacy.key(order, line), refund));
  assert.equal(reversalMoveId('cancel', lineKey(order, line)), legacy.reversal('cancel', legacy.key(order, line)));
}), { numRuns: 500, seed: 20261028 });
ok(true, 'numeric ids: sale, cancel and refund ids equal the three former builders (500 cases), so stored journals still match');

fc.assert(fc.property(id, id, (order, line) => {
  assert.equal(saleMoveId(`gid://shopify/Order/${order}`, `gid://shopify/LineItem/${line}`), saleMoveId(order, line));
  assert.equal(lineKey(order, `gid://shopify/LineItem/${line}`), lineKey(order, line));
}), { numRuns: 300, seed: 20261028 });
ok(true, 'a gid and its number name the same order line (300 cases)');
ok(legacy.key('501', 'gid://shopify/LineItem/901') !== legacy.key('501', '901'), 'the former reversal key split a gid from its number; the shared one does not');

for (const f of ['functions/api/channel/shopify/[link].js', 'functions/api/shopify/_replay-orders.js', 'functions/api/shopify/_order-reversal.js']) {
  const src = fs.readFileSync(ROOT + f, 'utf8');
  ok(/from '[./]+(?:shopify\/)?_move-ids\.js'/.test(src) && !/`s[oxr]-\$\{/.test(src), `${f} builds no movement id of its own`);
}
console.log(`\n✓ shopify-move-ids: ${n} checks`);
