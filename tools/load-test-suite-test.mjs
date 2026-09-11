#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const production = read('tests/load/k6/production-readonly.js');
const local = read('tests/load/k6/local-operations.js');
const orderPro = read('tests/load/k6/orderpro-pressure.js');
const mock = read('tools/live-mock-server.mjs');
const docs = read('docs/ops/LOAD_TESTING.md');
let failures = 0;

function ok(label, condition) {
  if (condition) console.log(`  ✓ ${label}`);
  else { failures++; console.log(`  ✗ ${label}`); }
}

console.log('\nKiwi capacity-suite safety contract\n');
ok('production script contains no HTTP write call', !/http\.(?:post|put|patch|del)\s*\(/.test(production));
ok('production script is locked to Amira for kiwi-os.com', /MERCHANT !== 'amira-cafe'/.test(production));
ok('higher production profiles require an explicit read-only acknowledgement',
  /KIWI_PRODUCTION_ACK/.test(production) && /amira-read-only/.test(production));
ok('production thresholds abort on a rising failure rate',
  /kiwi_route_failures/.test(production) && /abortOnFail:\s*true/.test(production));
ok('operational script refuses every non-loopback target',
  /127\\\.0\\\.0\\\.1\|localhost/.test(local) && /hard-locked to a loopback/.test(local));
ok('operational script verifies the synthetic tenant before writes',
  /X-Kiwi-Load-Fixture/.test(local) && /amira-loadtest/.test(local));
ok('OrderPro pressure test is loopback-only and verifies the synthetic tenant',
  /127\\\.0\\\.0\\\.1\|localhost/.test(orderPro) && /X-Kiwi-Load-Fixture/.test(orderPro)
    && /amira-loadtest/.test(orderPro));
ok('OrderPro pressure test covers the real guest and staff lifecycle',
  /\/api\/order`/.test(orderPro) && /\/api\/order\/queue/.test(orderPro)
    && ['accepted', 'ready', 'served'].every((state) => orderPro.includes(`'${state}'`)));
ok('OrderPro pressure teardown verifies uniqueness and an empty pending queue',
  /orderProOrders === stats\.orderProRefs/.test(orderPro)
    && /orderProPending === 0/.test(orderPro));
ok('local fixture is opt-in and uses an in-memory synthetic merchant',
  /KIWI_LOAD_TEST/.test(mock) && /LOAD_MERCHANT = 'amira-loadtest'/.test(mock));
ok('credential-bearing fixture server is bound to loopback',
  /server\.listen\(PORT, '127\.0\.0\.1', announce\)/.test(mock));
ok('suite covers sale, stock, external order, Shopify and live-feed paths',
  ['/api/sale', 'feature=stock', '/api/channel/order', '/api/channel/shopify/', '/api/feed']
    .every((needle) => local.includes(needle)));
ok('teardown checks idempotency and accepted-stock preservation',
  /channelOrders === 1/.test(local) && /shopifyOrders === 1/.test(local)
    && /stockMovements === stats.stockAccepted/.test(local));
ok('runbook forbids real merchant writes', /Never run operational writes against production/.test(docs));

console.log(failures ? `\n✗ ${failures} capacity-suite contract failure(s)\n` : '\n✓ Capacity-suite contract green.\n');
process.exitCode = failures ? 1 : 0;
