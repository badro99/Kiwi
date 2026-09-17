#!/usr/bin/env node
'use strict';

/* Production honesty gate for assets/caisse-hardware.js.
 * A normal card tender may be recorded against a standalone external TPE, but
 * must say that no bank authorization occurred. Authorization-only operations,
 * printing, drawer opening and barcode scans still fail without hardware. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'caisse-hardware.js'), 'utf8');

function runtime(real, printer) {
  const ctx = {
    navigator: {}, JSON, Promise, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; } },
    document: { createElement(tag) { return { tag, setAttribute() {} }; } },
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
  ok(card.approved === true && card.recordOnly === true && card.externalTerminal === true && card.mock !== true,
    'real till: standalone TPE sale is recorded as card without fabricating a device response');

  const classes = new Set(['is-pulsing']);
  const disc = {
    classList: { add(x) { classes.add(x); }, remove(...xs) { xs.forEach((x) => classes.delete(x)); } },
    replaceChildren() {},
  };
  const status = { textContent: '', classList: { add() {}, remove() {} } };
  const guarded = await real.authorizeCard(125, disc, status);
  ok(guarded.approved === true && guarded.recordOnly === true && classes.has('is-success') && /terminal externe/.test(status.textContent),
    'real till: shared card UI identifies the record-only external-terminal path');

  const preauth = await real.authorizeCard(125, disc, status, { capture: false, purpose: 'deposit' });
  ok(preauth.approved === false && preauth.reason === 'payment-terminal-not-configured',
    'real till: hotel pre-authorization still requires a connected payment terminal');

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

  /* Every production checkout must pass through the shared verdict. The
     boutique is the deliberate exception: it requires a human tap confirming
     an external reader and never auto-commits from its timer. */
  const ROOT = path.join(__dirname, '..');
  const guardedPos = [
    'fastfood', 'foodtruck', 'coiffure', 'traiteur', 'gym', 'pharmacie', 'spa',
    'fleuriste', 'epicerie', 'pizzeria', 'librairie', 'boulangerie', 'hotel',
  ];
  guardedPos.forEach((name) => {
    const body = fs.readFileSync(path.join(ROOT, 'assets', 'pos-' + name + '.js'), 'utf8');
    ok(body.includes('.authorizeCard('), name + ': card tender uses the shared external/connected-terminal verdict');
  });
  const main = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
  ok(main.includes('hw.authorizeCard(currentTotal() + payTipAmount()'),
    'restaurant checkout uses the shared external/connected-terminal verdict');
  ok(/settled = await finalizeTender\(cardTenderMethod\)/.test(main) &&
     main.includes("if (action === 'close') closeCardModal();") &&
     /const sale = lastSaleEntry\(\);\s*closeCardModal\(\);\s*printSaleTicket\(sale\)/.test(main),
    'card approval commits and prints once; closing a rejected modal cannot mark it paid');
  const cardCommit = (main.match(/async function triggerCardSuccess[\s\S]*?function settledOrderLabel/) || [''])[0];
  ok(cardCommit.includes('finalizeTender(cardTenderMethod)') && !cardCommit.includes('openCashDrawer()'),
    'record-only card tender saves the sale without opening or increasing the cash drawer');
  ok(/recordSale\(tenderBase, method, saleLabel, tenderTip, lines/.test(main),
    'card tender reaches the ordinary sale journal used by KPIs and analytics');
  const boutique = fs.readFileSync(path.join(ROOT, 'assets', 'pos-boutique.js'), 'utf8');
  ok(boutique.includes("ok.onclick = () => settle({ m: 'carte', amount })"),
    'boutique external-reader flow requires explicit cashier confirmation');

  console.log('\n' + (fail ? `✗ ${fail} failure(s) on ${pass + fail}.` : `✓ ${pass} hardware honesty checks passed.`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
