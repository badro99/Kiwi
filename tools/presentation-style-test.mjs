// Presentation rules that live in stylesheets and markup (text checks only; the
// behaviour half is tools/presentation-language-test.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = f => fs.readFileSync(f, 'utf8');
const booking = read('assets/booking.css');
assert.match(booking,/\.bk-party\{[^}]*padding-inline:14px 9px/);
assert.match(booking,/\.bk-party>span\{margin-inline-end:8px/);
assert.doesNotMatch(booking,/\.bk-closed-mark span:(?:before|after)/);
assert.match(booking,/icons\/material\/event_busy.svg/);
assert.match(read('assets/booking-view.js'),/bk-closed-symbol/);
const plot = read('assets/restaurant-menu/styles.js').match(/\.rmw-perf[^{}]*\{[^{}]*\}/g).join('\n');
assert.doesNotMatch(plot, /#[\da-f]{3,8}\b|\b(?:left|right|top|bottom|margin-top|padding-top|border-top):/i);
assert.match(plot,/background:var\(--atlas\)/);
assert.match(plot,/background:var\(--inverse-surface\);color:var\(--inverse-ink\)/);
const promos = read('assets/boutique-promos-dashboard.js');
assert.doesNotMatch(promos,/createElement\('style'\)|function L\(/);
assert.match(promos,/i && i.T/);
for (const f of ['dashboard.html','kiwi-sw.js']) assert.match(read(f),/boutique-promos-dashboard.css\?v=\d+/);
assert.doesNotMatch(read('assets/boutique-promos-dashboard.css'),/#[\da-f]{3,8}\b|rgba?\(/i);
const employee = read('assets/employee-live.js');
assert.match(employee,/getElementById\('main-content'\)/);
assert.match(employee,/container.prepend\(panel\)/);
assert.match(employee,/panel.className = 'employee-punch-corrections'/);
assert.doesNotMatch(employee,/panel.style.cssText|document.body.prepend\(panel\)/);
assert.match(read('assets/employee-trade-shell.css'),/employee-punch-corrections button:focus-visible/);
const phone = read('assets/hotel-economat-requests.css').split('@media(max-width:400px)')[1];
assert.match(phone,/grid-template-columns:minmax\(0,1fr\)/);
assert.match(phone,/min-inline-size:0/);
assert.match(phone,/min-height:44px/);
assert.match(read('tools/surface-matrix-states-economat-browser-test.mjs'),/width:375/);

console.log('✓ presentation styles: logical/token styles, Material icon, promo stylesheet, employee layout, stacked phone fields');
