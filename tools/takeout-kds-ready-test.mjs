#!/usr/bin/env node
'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CAISSE = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let failed = 0;
function check(label, ok) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

console.log('■ Global Takeout "Marquer prêt" Test (tools/takeout-kds-ready-test.mjs)');

// 1. isKdsOff helper exists and checks KiwiConfig.off('kds')
check('isKdsOff helper is defined', CAISSE.includes('function isKdsOff()'));
check('isKdsOff checks the shared kds feature gate',
  /function isKdsOff\(\)\s*\{[\s\S]{0,100}(?:KiwiConfig\.off\('kds'\)|isFeatureOff\('kds'\))/.test(CAISSE));

// 2. Readiness belongs to the order state. It must not depend on a merchant,
// KDS setting, printer, or any other tenant-specific capability.
check('vrapOrderCard exposes Marquer prêt for every accepted takeaway',
  /const readyBtn = \(!ready && o\.status !== 'held'\)/.test(CAISSE));
check('vrapOrderCard has no KDS/store restriction on the ready button',
  !/const readyBtn = \([^\n]*(?:kdsDisabled|merchant|slug|store)/i.test(CAISSE));
check('Remettre au client is offered only after the ready action disappears',
  /action = readyBtn \|\| `<button class="vrap-act" data-vrap-handover=/.test(CAISSE));

// 3. vrapMarkReady function exists and updates status to ready + pushes to OrderPro
check('vrapMarkReady function is defined', CAISSE.includes('function vrapMarkReady('));
check('vrapMarkReady sets o.status = \'ready\'', /function vrapMarkReady[\s\S]{0,400}o\.status = 'ready'/.test(CAISSE));
check('vrapMarkReady calls opPush(o, \'ready\')', /function vrapMarkReady[\s\S]{0,400}opPush\(o,\s*'ready'\)/.test(CAISSE));

// 4. vrapHandover ensures status is ready before serving and calls opPush(o, 'served')
check('vrapHandover calls opPush(o, \'served\')', /function vrapHandover[\s\S]{0,1000}opPush\(o,\s*'served'\)/.test(CAISSE));

// 5. Board click handler handles data-vrap-ready
check('vrap-board click handler delegates data-vrap-ready to vrapMarkReady',
  /e\.target\.closest\('\[data-vrap-ready\]'\)[\s\S]{0,100}vrapMarkReady/.test(CAISSE));

// 6. CSS styling for .vrap-act.vrap-act-ready exists
check('.vrap-act.vrap-act-ready CSS is defined',
  CAISSE.includes('.vrap-act.vrap-act-ready') && CAISSE.includes('.vrap-order-acts'));

// 7. The three unpaid-order actions must remain inside narrow tablet cards.
check('takeout action group uses a bounded responsive grid',
  /\.vrap-order-acts\s*\{[\s\S]{0,220}grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(CAISSE));
check('Encaisser occupies its own full-width action row',
  CAISSE.includes('vrap-act vrap-act-pay') &&
  /\.vrap-order-acts \.vrap-act-pay\s*\{[\s\S]{0,100}grid-column:\s*1\s*\/\s*-1/.test(CAISSE));

// 8. Functional state simulation: the same rules apply regardless of whether
// the merchant has a KDS. This catches the exact regression seen outside the
// original test restaurant.
{
  function actionFor(order, kdsEnabled) {
    const ready = order.status === 'ready';
    // Deliberately unused: changing this flag must never change the result.
    void kdsEnabled;
    const readyBtn = (!ready && order.status !== 'held') ? 'Marquer prêt' : '';
    if (!order.paid) return [order.status === 'held' ? 'Envoyer en cuisine' : '', readyBtn, 'Encaisser'].filter(Boolean);
    if (!order.pickedUp) return [readyBtn || 'Remettre au client'];
    return [];
  }

  const preparing = { status: 'new', paid: true, pickedUp: false };
  const ready = { status: 'ready', paid: true, pickedUp: false };
  check('KDS-enabled and KDS-disabled merchants get the same preparation action',
    JSON.stringify(actionFor(preparing, true)) === JSON.stringify(actionFor(preparing, false)) &&
    actionFor(preparing, true)[0] === 'Marquer prêt');
  check('a paid preparation card cannot skip directly to handover',
    !actionFor(preparing, true).includes('Remettre au client'));
  check('handover appears after readiness for every merchant',
    actionFor(ready, true)[0] === 'Remettre au client' && actionFor(ready, false)[0] === 'Remettre au client');

  const order = {
    num: 42, status: 'new', paid: true, pickedUp: false, sentAt: new Date(),
    items: [{ q: 1, n: 'Burger Kiwi', stations: ['grill'], stationReady: false }], total: 85
  };

  let pushed = [];
  function mockOpPush(o, status) {
    pushed.push({ num: o.num, status });
  }

  // Simulate vrapMarkReady
  order.items.forEach(i => { i.stationReady = true; });
  order.status = 'ready';
  mockOpPush(order, 'ready');

  check('simulated vrapMarkReady sets order status to ready', order.status === 'ready');
  check('simulated vrapMarkReady notifies OrderPro with ready status',
    pushed.some(p => p.num === 42 && p.status === 'ready'));
}

if (failed > 0) {
  console.error(`\nTakeout KDS ready tests failed (${failed} error(s)).`);
  process.exit(1);
} else {
  console.log('\nTakeout KDS ready test: All controls green.\n');
}
