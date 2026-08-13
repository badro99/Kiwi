import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const venues = fs.readFileSync(path.join(root, 'assets/venues.js'), 'utf8');
const caisse = fs.readFileSync(path.join(root, 'kiwi-caisse.html'), 'utf8');

let passed = 0;
function ok(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS: ${message}`);
}

ok(
  /const DASHBOARD_HIDDEN_NAV = new Set\(\['kds'\]\)/.test(venues),
  'dashboard declares KDS as a hidden operational navigation target',
);
ok(
  /sect\.items\.filter\(it => !DASHBOARD_HIDDEN_NAV\.has\(it\.nav\)\)\.map/.test(venues),
  'all vertical and subtype sidebars omit the KDS dashboard shortcut',
);
ok(
  /id="kds-screen"/.test(caisse),
  'the actual caisse kitchen screen remains available',
);

console.log(`\n${passed} dashboard KDS navigation controls passed.`);
