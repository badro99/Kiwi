#!/usr/bin/env node
'use strict';

/* Production honesty gate for assets/caisse-hardware.js.
 * A real till must never turn missing hardware into an approved card payment,
 * a successful print, a drawer opening or a fabricated barcode. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caisse-hardware.js'), 'utf8');

function runtime(real, printer) {
  const ctx = {
    navigator: {}, JSON, Promise, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; } },
    document: {},
    KiwiEnv: { isReal() { return real; } },
  };
  ctx.window = ctx;
  if (printer) ctx.KiwiPrinter = printer;
  vm.createContext(ctx);
  new vm.Script(src, { filename: 'assets/caisse-hardware.js' }).runInContext(ctx);
  return ctx.KiwiHardware;
}

let pass = 0, fail = 0;
function ok(condition, label) {
  if (condition) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
}

(async function () {
  const real = runtime(true);
  const print = await real.print({ title:'Test', lines:[], total:'1 MAD' });
  ok(print.ok === false && print.reason === 'printer-not-configured',
    'real till: missing printer is a failure');

  const drawer = await real.openDrawer();
  ok(drawer.ok === false && drawer.reason === 'drawer-not-configured',
    'real till: missing drawer transport is a failure');

  let scanned = false;
  const scan = await real.scan(function () { scanned = true; });
  await new Promise((resolve) => setTimeout(resolve, 280));
  ok(scan.ok === false && !scanned, 'real till: no fabricated barcode callback');

  const card = await real.readCard(125);
  ok(card.approved === false && card.reason === 'payment-terminal-not-configured',
    'real till: no fabricated card approval');

  const failedPrinter = runtime(true, {
    isConnected() { return true; },
    printReceipt() { return Promise.resolve({ ok:false, reason:'bridge-down' }); },
  });
  const failedPrint = await failedPrinter.print({ title:'Test' });
  ok(failedPrint.ok === false && failedPrint.reason === 'bridge-down',
    'real till: transport failure stays a failure');

  const workingPrinter = runtime(true, {
    isConnected() { return true; },
    printReceipt() { return Promise.resolve({ ok:true, via:'usb' }); },
  });
  const printed = await workingPrinter.print({ title:'Test' });
  ok(printed.ok === true && printed.printed === true && printed.via === 'usb',
    'real till: confirmed transport reports success');

  const demo = runtime(false);
  const demoCard = await demo.readCard(50);
  ok(demoCard.approved === true && demoCard.mock === true,
    'local demo: explicit mock behavior remains available');

  console.log('\n' + (fail ? `✗ ${fail} failure(s) on ${pass + fail}.` : `✓ ${pass} hardware honesty checks passed.`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

