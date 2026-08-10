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

/* Every module that BUILDS a CSV must neutralise spreadsheet formulas. The list
 * used to be hardcoded, and that hid two things at once: when the dashboard
 * report moved to assets/report.js the check kept passing against a file that no
 * longer produced CSVs, while the margins export inside dashboard-extra.js had
 * never been guarded at all — the file-level grep was satisfied by an unrelated
 * export sitting next to it. Derive the list from the code instead, so a new CSV
 * producer is covered the day it is written rather than the day someone
 * remembers to add it here. */
/* Files that hand the rows to a guarded builder elsewhere instead of quoting
 * them inline. Keep this list SHORT and justified — each entry is a promise that
 * the real escaping happens in the named module, which is itself checked below. */
const DELEGATES = {
  'assets/pages-pro.js': 'assets/boutique-catalog.js', // bqx-export → CAT().exportCsv()
};

/* Producers whose CSV contains NO merchant data, so there is nothing to escape.
 * Justify every entry — "it looked fine" is not a reason. */
const STATIC_ONLY = new Set([
  // downloadTemplate() serves a hardcoded blank example for the merchant to
  // fill in (TEMPLATES, assets/catalog-import.js:570). No dynamic value reaches it.
  'assets/catalog-import.js',
]);

const csvProducers = fs.readdirSync(path.join(ROOT, 'assets'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => 'assets/' + f)
  .filter((rel) => /type:\s*['"]text\/csv/.test(read(rel)));

ok('CSV producers discovered by scan', csvProducers.length >= 4);
for (const rel of csvProducers.filter((r) => !STATIC_ONLY.has(r))) {
  const target = DELEGATES[rel] || rel;
  const label = target === rel
    ? `${rel} neutralises spreadsheet formulas`
    : `${rel} delegates CSV escaping to ${target}`;
  ok(label, /\[=\+\\-@\]/.test(read(target)));
}

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`✓ ${passed} rendering/export security checks green`);
