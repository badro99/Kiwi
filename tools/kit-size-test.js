#!/usr/bin/env node
'use strict';
/* Kiwi · kit-size-test · the size rows of §19 that a file can answer.
 *
 *   Kit JS core (elements, motion, haptics, format, ledger reader, lens)
 *       ≤ 35 KB gzip. "Elements" is core.js, the KiwiKit.Element runtime every
 *       component stands on; the components themselves (elements.js,
 *       dashboard.js, till.js, …) load per surface and are printed, not held.
 *   Icon sprite per surface ≤ 25 KB gzip (every assets/icons/material/sprite.*.svg).
 *
 * Measured as shipped: the files are served as they are in the tree, comments
 * included, so that is what is gzipped (level 9, each set concatenated as a
 * page would cache them together). The CSS inside the shadow roots (≤ 18 KB)
 * is measured in a browser by kit-budget-browser-test, from the sheets the
 * roots actually adopt; the string bundles by strings-completeness-test.
 *
 *   node tools/kit-size-test.js */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const KB = 1024;
let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ✓ ' + m); };
const bad = (m) => { failures++; checks++; console.log('  ✗ ' + m); };
const gz = (files) => zlib.gzipSync(Buffer.concat(files.map((f) => fs.readFileSync(path.join(ROOT, f)))), { level: 9 }).length;
const kb = (n) => (n / KB).toFixed(1) + ' KB';

console.log('kit-size-test');

const CORE = ['core.js', 'motion.js', 'haptics.js', 'format.js', 'ledger.js', 'lens.js'].map((f) => 'assets/kit/' + f);
const core = gz(CORE);
(core <= 35 * KB ? ok : bad)(`kit JS core (core, motion, haptics, format, ledger, lens): ${core} B = ${kb(core)} gzip, budget 35 KB (${kb(35 * KB - core)} left)`);

/* Printed for the record: what a kit page loads before its own components. */
const controls = fs.readdirSync(path.join(ROOT, 'assets/kit/controls')).filter((f) => f.endsWith('.js')).sort().map((f) => 'assets/kit/controls/' + f);
const runtime = CORE.concat(controls, ['assets/kit/actions.js', 'assets/kit/business-day.js', 'assets/kit/strings.js']);
console.log(`  ○ with the controls, actions, business day and strings runtime: ${kb(gz(runtime))} gzip (not a §19 row)`);
const components = ['elements', 'segment', 'layout', 'nav', 'overlays', 'pin', 'dashboard', 'till', 'kds'].map((f) => `assets/kit/${f}.js`);
components.forEach((f) => console.log(`  ○ ${path.basename(f)}: ${kb(gz([f]))} gzip`));

const SPRITES = fs.readdirSync(path.join(ROOT, 'assets/icons/material')).filter((f) => /^sprite\.[a-z0-9-]+\.svg$/.test(f)).sort();
if (!SPRITES.length) bad('no sprite.<surface>.svg found');
for (const f of SPRITES) {
  const n = gz(['assets/icons/material/' + f]);
  (n <= 25 * KB ? ok : bad)(`${f}: ${kb(n)} gzip, budget 25 KB`);
}

/* The gate must be able to fail: a set past the budget is refused. */
const big = require('crypto').randomBytes(40 * KB);
(zlib.gzipSync(big, { level: 9 }).length > 35 * KB ? ok : bad)('negative check: 40 KB of noise is over the 35 KB budget');

console.log(failures ? `✗ kit-size-test · ${failures} of ${checks} failed` : `✓ kit-size-test · ${checks} contrôles`);
process.exit(failures ? 1 : 0);
