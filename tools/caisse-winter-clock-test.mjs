#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { businessDate, businessBoundary } from '../functions/api/_business-day.js';

const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const start = source.indexOf('    function tickClock() {');
const end = source.indexOf('    tickClock();', start);
assert.ok(start > 0 && end > start);
const code = source.slice(start, end);
const fields = new Map();
let now = '2026-02-15T01:30:00Z';
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
const context = vm.createContext({
  Date: FixedDate, Intl, window: { KiwiDayReport: { timezone: () => 'Africa/Casablanca' } },
  dafrDays: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  monthsEn: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  currentMerchantSlug: () => 'fixture', $: selector => {
    if (!fields.has(selector)) fields.set(selector, { textContent: '' });
    return fields.get(selector);
  },
});
vm.runInContext(code, context);
context.tickClock();
assert.equal(fields.get('#clock-time').textContent, '02:30');
now = '2026-02-15T02:30:00Z';
context.tickClock();
assert.equal(fields.get('#clock-time').textContent, '02:30', 'winter fallback repeats the civil hour');
assert.equal(fields.get('#clock-date').textContent, 'dimanche 15 février');
now = '2026-03-22T02:30:00Z';
context.tickClock();
assert.equal(fields.get('#clock-time').textContent, '03:30', 'spring jump uses the new civil offset');
assert.equal(businessDate(businessBoundary('2026-02-15')), '2026-02-15');
console.log('✓ till clock follows Casablanca winter/spring transitions and the 05:00 Z boundary');
