#!/usr/bin/env node
// #100/#97: daily report and restaurant orders must mount the same day picker
// from dateRange.js, not independent native-date controls or calendar skins.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const range = read('assets/dateRange.js');
const report = read('assets/day-report-dash.js');
const orders = read('assets/pages.js');
const restaurantOrders = read('assets/pages-pro.js');
assert.match(range, /mountDaySelector:\s*mountDaySelector/, 'shared date selector exported');
assert.match(range, /mode:\s*'day'/, 'main dashboard picker supports single-day selection');
assert.match(report, /KiwiDateRange\?\.mountDaySelector/, 'daily report mounts shared picker');
assert.doesNotMatch(report, /<input type="date" data-kdr="pick"/, 'daily report does not use OS-native picker');
assert.match(orders, /KiwiDateRange\?\.mountDaySelector/, 'restaurant orders mounts shared picker');
assert.match(orders, /\[0,\s*1,\s*2\]/, 'restaurant orders offers today/yesterday/day before');
assert.match(restaurantOrders, /KiwiDateRange\?\.mountDaySelector/, 'visible restaurant Commandes mounts shared picker');
assert.match(restaurantOrders, /offsets:\s*\[0,\s*1,\s*2\]/, 'visible Commandes offers three relative days');
assert.doesNotMatch(restaurantOrders, /class="rtx-days"/, 'visible Commandes does not retain duplicate seven-day pills');
assert.match(range, /\.dash-date-range \.dr-pill/, 'global range render does not reset day-selector pills');
console.log('✓ shared day selector: ten report/orders wiring assertions');
