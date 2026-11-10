/* Layout of the till's ticket picker and day report (2026-11-10). The
 * picker's behaviour (payment tiles, chevron, search from five tickets, the
 * tip line that makes a ticket add up) runs in tools/pos-reprint-test.js
 * against the real module; this file holds only what is CSS and markup:
 *  - the picker paints from the kit tokens, no pure white;
 *  - the day report is 520 wide and never breaks a ticket number.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed += 1; console.log('  ✓ ' + msg); };

const rp = read('assets/pos-reprint.js');
const jv = read('assets/caisse-accounting/journal-view.js');
const screens = read('assets/caisse-screens.css');

ok(!/#kx-rp-veil[^']*background:\s*#fff/i.test(rp) && /--kx-rp-accent: var\(--k-accent/.test(rp), 'the picker paints from the kit tokens, no pure white');
ok(/<span class="jr-ref">\$\{rpEsc\(e\.ref\)\}<\/span>/.test(jv) && /#journal-drawer \.jr-ref \{ white-space: nowrap; \}/.test(screens), 'the day report keeps a ticket number whole (and escapes it)');
ok(/#journal-drawer \.drawer \{ width: 520px; \}/.test(screens), 'the day report drawer is 520 wide');

console.log(`\ntill-cancel-picker: ${passed} passed`);
