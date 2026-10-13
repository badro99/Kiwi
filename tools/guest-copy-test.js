#!/usr/bin/env node
/* Guest-page copy · design 2027, §9.6.
 *
 *   node tools/guest-copy-test.js
 *
 * The guest pages no longer vibrate (their navigator.vibrate calls were removed
 * at stage 1, §20.3), so no dictionary value or HTML default may promise a
 * vibration. Fails on "vibr" (vibrate, vibre, vibration, vibrer), the Darija
 * "يهز" and "تهز", and the Arabic word for vibration, "اهتز". It scans the
 * whole file, code comments included, so the promise cannot come back in a
 * string, a default or a comment. Also pins the three rewritten strings. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg); } };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const GUEST_PAGES = ['OrderPro.html', 'kiwi-order.html'];
const FORBIDDEN = [/vibr/i, /يهز/, /تهز/, /اهتز/];

for (const page of GUEST_PAGES) {
  const src = read(page);
  const bad = FORBIDDEN.filter((re) => re.test(src)).map(String);
  ok(!bad.length, `${page} promises no vibration${bad.length ? ' (' + bad.join(', ') + ')' : ''}`);
  ok(!/navigator\.vibrate/.test(src), `${page} calls no navigator.vibrate`);
  ok(/Notification\.permission === 'granted'/.test(src) && /playChime\(\)/.test(src), `${page} keeps its chime and its system notification`);
}

const PINS = [
  ['OrderPro.html', 'EN prep_note_post', ". A notification tells you the moment it's ready, with a chime while this page is open."],
  ['OrderPro.html', 'FR prep_note_post', ". Une notification vous prévient dès que c'est prêt, avec un son tant que cette page est ouverte."],
  ['OrderPro.html', 'AR prep_note_post', '. غادي يوصلك إشعار ملي يكون واجد، مع صوت إلا كانت هاد الصفحة محلولة.'],
  ['kiwi-order.html', 'EN prep_note_post', ". It chimes the moment it's ready, as long as this page stays open."],
  ['kiwi-order.html', 'FR prep_note_post', ". Elle sonne dès que c'est prêt, tant que cette page reste ouverte."],
  ['kiwi-order.html', 'AR prep_note_post', '. غادي تصوّت ملي يكون واجد، إلا بقات هاد الصفحة محلولة.'],
  ['OrderPro.html', 'EN prep_perm_denied', 'Notifications are off. Keep this page open and it will chime when your order is ready.'],
  ['OrderPro.html', 'FR prep_perm_denied', "Notifications désactivées. Gardez cette page ouverte : elle sonnera quand votre commande sera prête."],
  ['OrderPro.html', 'AR prep_perm_denied', 'الإشعارات مسدودة. خلّي هاد الصفحة محلولة وغادي تصوّت ملي تكون الطلبية واجدة.'],
  ['kiwi-order.html', 'EN prep_perm_denied', 'Notifications are off. Keep this page open and it will chime when your order is ready.'],
  ['kiwi-order.html', 'FR prep_perm_denied', "Notifications désactivées. Gardez cette page ouverte : elle sonnera quand votre commande sera prête."],
  ['kiwi-order.html', 'AR prep_perm_denied', 'الإشعارات مسدودة. خلّي هاد الصفحة محلولة وغادي تصوّت ملي تكون الطلبية واجدة.']
];
for (const [page, label, text] of PINS) ok(read(page).includes(text), `${page} · ${label} is the §9.6 copy`);

/* The HTML default (FR) is the same sentence as the FR dictionary entry. */
ok(read('OrderPro.html').includes('data-i18n="prep_note_post">. Une notification vous prévient dès que c\'est prêt, avec un son tant que cette page est ouverte.</span>'), 'OrderPro.html · the HTML default matches the FR entry');
ok(read('kiwi-order.html').includes('data-i18n="prep_note_post">. Elle sonne dès que c\'est prêt, tant que cette page reste ouverte.</span>'), 'kiwi-order.html · the HTML default matches the FR entry');
for (const page of GUEST_PAGES) ok(!/—/.test(PINS.filter((p) => p[0] === page).map((p) => p[2]).join('')), `${page} · the rewritten copy has no em dash`);

console.log('\n' + (failures ? `guest-copy-test: ${failures} FAILED, ${passed} passed` : `guest-copy-test: ${passed} controls passed`));
process.exit(failures ? 1 : 0);
