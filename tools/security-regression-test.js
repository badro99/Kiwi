#!/usr/bin/env node
/* Kiwi · rendering and spreadsheet-export injection regressions. */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
const failed = [];
const ok = (label, condition) => condition ? passed++ : failed.push(label);

const server = read('kiwi-serveur.html');
[
  '${esc(r.name)}', '${esc(l.name)}', '${esc(m.name)}',
  '${esc(catLabels[m.cat] || \'\')}', '${esc(s.name)}',
].forEach((needle) => ok(`server POS rendering contains ${needle}`, server.includes(needle)));
ok('server POS no longer renders a raw merchant menu item name',
  !server.includes('<span class="menu-item-name">${m.name}</span>'));
ok('server POS does not interpolate merchant ids into a CSS selector',
  !server.includes('data-menu-id="${item.id}"'));

const caisse = read('kiwi-caisse.html');
ok('kitchen greeting escapes the merchant store name',
  caisse.includes('${escTeam(storeName())} <em>·</em> file de préparation'));
const clients = read('assets/clients-book.js');
ok('client ids are escaped in HTML attributes',
  clients.includes('data-id="\' + esc(c.id) + \'"'));

const middleware = read('functions/_middleware.js');
for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Strict-Transport-Security']) {
  ok(`middleware applies ${header}`, middleware.includes(`headers.set('${header}'`));
}

for (const rel of [
  'assets/clients-directory.js', 'assets/growth-crm.js',
  'assets/day-report-dash.js', 'assets/boutique-catalog.js', 'assets/dashboard-extra.js',
]) {
  ok(`${rel} neutralises spreadsheet formulas`, /\[=\+\\-@\]/.test(read(rel)));
}

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} rendering/export security checks green`);
