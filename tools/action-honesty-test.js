#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'production-action-guard.js'), 'utf8');
let calls = 0;
const toasts = [];
const handlers = {
  'ret-refund-original': () => { calls += 1; return 'refunded'; },
  'spa-cli-wa-send': () => { calls += 1; return 'sent'; },
  'appt-filter': () => { calls += 1; return 'filtered'; }
};
let real = true;
const window = {
  KiwiEnv: { isReal: () => real },
  KiwiVenue: { isCustom: () => false },
  KiwiI18n: { getLang: () => 'en' },
  Kiwi: { handlers, toast: (title, opts) => toasts.push({ title, opts }) },
  addEventListener: () => {}
};
vm.runInNewContext(source, { window, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1 }, { filename: 'production-action-guard.js' });

function check(ok, label) {
  if (!ok) { console.error(`  ✗ ${label}`); process.exitCode = 1; return; }
  console.log(`  ✓ ${label}`);
}

const refund = handlers['ret-refund-original']();
check(refund && refund.ok === false && refund.reason === 'not-connected', 'real refund is blocked');
check(calls === 0, 'blocked action never reaches demo implementation');
check(toasts.length === 1 && /No payment/.test(toasts[0].opts.desc), 'warning states that nothing happened');
handlers['spa-cli-wa-send']();
check(calls === 0 && toasts.length === 2, 'real WhatsApp claim is blocked');
check(handlers['appt-filter']() === 'filtered' && calls === 1, 'non-effect filter remains usable');
real = false;
check(handlers['ret-refund-original']() === 'refunded' && calls === 2, 'local demo action remains available');

if (!process.exitCode) console.log('\n✓ 6 production action honesty checks passed.');
