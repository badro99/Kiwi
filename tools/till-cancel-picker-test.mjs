/* The ticket picker behind « Annuler une vente » and « Réimprimer »
 * (assets/pos-reprint.js), redesigned 2026-11-10 to match Remboursement:
 * the payment method as an icon tile, one detail line, the amount and a
 * chevron, a search field once the list is longer than four, and a ticket
 * detail that adds up (the tip is its own line; a 23 MAD ticket showed 18 MAD
 * of items and nothing else).
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
const app = read('assets/caisse-app.js');

ok(/class="kx-rp-row" data-kx-rp="' \+ i \+ '" data-kx-rp-q="/.test(rp), 'each row keeps data-kx-rp (the tests and the taps use it) and carries its search text');
ok(/kx-rp-ic kx-rp-ic--' \+ kind/.test(rp) && /'payments' : kind === 'card' \? 'credit_card'/.test(rp), 'the payment method is an icon tile: cash, card or other');
ok(/class="kx-rp-go" data-icon="chevron_right"/.test(rp), 'a chevron says the row opens');
ok(/list\.length > 4 \? `<label class="kx-rp-search">/.test(rp), 'a search field once the list is longer than four');
const search = /q\.addEventListener\('input', function \(\) \{[\s\S]*?\n {4}\}\);/.exec(rp);
ok(!!search && !/innerHTML/.test(search[0]) && /head\.hidden = !seen/.test(search[0]), 'searching hides rows and empty day headers, it never redraws');
ok(/tip: money\(Number\(entry\.tip \|\| 0\)\)/.test(app), 'the restaurant passes the tip with each ticket');
ok(/Number\(entry\.tip\) > 0\) lines \+= '<div class="kx-rp-ticket-line kx-rp-tip">/.test(rp), 'the detail shows the tip as its own line, so it adds up');
ok(!/#kx-rp-veil[^']*background:\s*#fff/i.test(rp) && /--kx-rp-accent: var\(--k-accent/.test(rp), 'colours come from the kit tokens, no pure white');

/* Rapport du jour, the drawer behind « Ventes du service »: at 420 the detail
   line broke inside the ticket number. */
const jv = read('assets/caisse-accounting/journal-view.js');
const screens = read('assets/caisse-screens.css');
ok(/<span class="jr-ref">\$\{rpEsc\(e\.ref\)\}<\/span>/.test(jv) && /#journal-drawer \.jr-ref \{ white-space: nowrap; \}/.test(screens), 'the day report keeps a ticket number whole (and escapes it)');
ok(/#journal-drawer \.drawer \{ width: 520px; \}/.test(screens), 'the day report drawer is 520 wide');

console.log(`\ntill-cancel-picker: ${passed} passed`);
