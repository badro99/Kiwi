#!/usr/bin/env node
/* Credit issue date in the MERCHANT zone (r18 clients#1 / creditbook#2).
 *
 * The client record shows when a store credit was issued next to its expiry.
 * The expiry already follows the merchant's business day; the issue time used
 * the device's zone, so a travelling owner read a date the books do not carry.
 * This runs the real loadClientCredits from assets/clients-book/credit.js. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { shippedFunction } from './shipped-function.mjs';

process.env.TZ = 'Asia/Tokyo'; // the "travelling owner's" device
const source = fs.readFileSync(new URL('../assets/clients-book/credit.js', import.meta.url), 'utf8');
const baseSource = fs.readFileSync(new URL('../assets/clients-book/base.js', import.meta.url), 'utf8');
const CREATED = Date.UTC(2026, 0, 15, 2, 30); // 14 Jan 18:30 in Los Angeles, 15 Jan 11:30 in Tokyo
const FORMAT = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };

function render(zoneOf) {
  const host = { isConnected: true, innerHTML: '', querySelector: () => null };
  const window = { KiwiDayReport: { timezone: zoneOf, businessDay: () => '2026-02-10' }, KiwiClientNumbers: { quantity: String } };
  const globals = {
    window, document: { documentElement: { lang: 'fr' } }, Intl, Date, Number, Array, String, Math,
    esc: (s) => String(s), tr: (s) => s, fmt: (n) => String(n), fetch: undefined,
    creditMerchant: () => 'santos', creditZone: undefined, creditLastDay: () => new Date(2026, 1, 10, 12),
    clientLocalCredits: () => [{ code: 'AV-1', status: 'active', amountCents: 5000, balanceCents: 5000, createdAt: CREATED, expiresAt: 1, events: [] }],
  };
  const zoneLine = baseSource.match(/^ *var creditZone = .*$/m)[0]; // the real zone helper, run as shipped
  globals.creditZone = vm.runInNewContext('(function(){' + zoneLine + ' return creditZone; })()', globals);
  const load = shippedFunction(source, 'loadClientCredits', globals);
  vm.runInNewContext('load("c1", host)', { load, host });
  return host.innerHTML;
}

const tokyo = new Intl.DateTimeFormat('fr-FR', FORMAT).format(new Date(CREATED));
const la = new Intl.DateTimeFormat('fr-FR', { ...FORMAT, timeZone: 'America/Los_Angeles' }).format(new Date(CREATED));
assert.notEqual(tokyo, la, 'the fixture really separates device and merchant zones');

const html = render(() => 'America/Los_Angeles');
assert.ok(html.includes(la), 'issue time is written in the merchant zone: ' + la);
assert.ok(!html.includes(tokyo), 'and not in the device zone');
assert.ok(render(() => { throw new Error('no config'); }).includes(tokyo), 'with no merchant zone known it falls back to the device, not to a crash');
console.log('✓ credit-issue-zone-test : la date d\'émission d\'un avoir suit le fuseau du commerce, comme son échéance');
