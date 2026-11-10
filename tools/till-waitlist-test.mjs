/* The till's waiting list (En attente), redesigned 2026-11-10.
 *
 * The owner asked for the screens that still needed a redesign; the list was
 * one thin row per party across the whole screen. It now reads the line at a
 * glance and gives each party a card. Two behaviours matter more than the
 * look, and this file holds them:
 *  - the 30 s clock moves the wait text in place (renderWaitlist(true)), it never
 *    rebuilds the cards: a rebuild under a finger swallowed a tap on Attabler,
 *    the same bug the Plus panel had;
 *  - every word on the screen goes through the till's translator and has its
 *    English and Arabic.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed += 1; console.log('  ✓ ' + msg); };

const part = read('assets/caisse-floor/new-table-waitlist.js');
const app = read('assets/caisse-app.js');
const lang = read('assets/caisse-lang.js');
const css = read('assets/caisse-screens.css');

/* 1 · the clock never rebuilds */
ok(/setInterval\(\(\) => \{ if \(mode === 'waitlist'\) renderWaitlist\(true\); \}, 30000\)/.test(app), 'the 30 s clock calls renderWaitlist(true)');
ok(!/setInterval\([^\n]*renderWaitlist\(\)/.test(app), 'and no timer rebuilds the list');
const render = /function renderWaitlist\(clockOnly\) \{[\s\S]*?\n {4}\}/.exec(part)[0];
const clock = /if \(clockOnly[\s\S]*?\n {8}return;\n {6}\}/.exec(render);
ok(!!clock && !/innerHTML/.test(clock[0]), 'the clock path changes text and classes only, never innerHTML');

/* 2 · the tone of a wait, and its words */
const waitFn = /const wait = \(m\) => (\(\{[^\n]*\}\));/.exec(render);
ok(!!waitFn, 'one helper gives a wait its words and its tone');
const sb = {};
vm.runInNewContext('const tr = (s) => s; const wait = (m) => ' + waitFn[1] + '; this.out = { t: [0, 14, 15, 29, 30, 90].map((m) => wait(m).tone), w: [0, 7].map((m) => wait(m).text) };', sb);
ok(JSON.stringify(sb.out.t) === JSON.stringify(['', '', 'is-warm', 'is-warm', 'is-long', 'is-long']), 'a wait warms at 15 min and turns red at 30');
ok(sb.out.w[0] === "à l'instant" && sb.out.w[1] === '7 min', 'a new party reads « à l\'instant », then N min');

/* 3 · the screen: summary, cards, one Attabler and a named Retirer */
ok(/wl-summary/.test(render) && /attente la plus longue/.test(render) && /tables libres/.test(render), 'the list opens on its totals: parties, people, longest wait, free tables');
ok(/data-wl-seat=/.test(render) && /data-wl-remove=[^>]*aria-label=/.test(render), 'each card keeps Attabler and a Retirer that names the party');
ok(/data-wl-add/.test(render) && /closest\('\[data-wl-add\]'\)\) openWaitlistModal\(\)/.test(app), 'the empty state carries its own Add button, wired to the form');
ok(/#waitlist-list \.wl-card\.is-long/.test(css) && /#waitlist-modal #wl-size-chips \{ display: grid; grid-template-columns: repeat\(8/.test(css), 'the styles are scoped to the list and the form (eight sizes on one row)');

/* 4 · English and Arabic for every new word */
const keys = ['Attabler', 'Peu importe', 'Intérieur', 'Nom du client', "à l'instant", 'groupe', 'groupes', 'personne', 'personnes',
  'attente la plus longue', 'table libre', 'tables libres', 'Ajoutez un groupe dès qu’il arrive sans réservation. La file garde son ordre et son temps d’attente.'];
const missing = keys.filter((k) => !lang.includes('DICT.en[' + JSON.stringify(k) + ']') || !lang.includes('DICT.ar[' + JSON.stringify(k) + ']'));
ok(!missing.length, 'every new word has English and Arabic' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));

console.log(`\ntill-waitlist: ${passed} passed`);
