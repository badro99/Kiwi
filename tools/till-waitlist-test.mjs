/* The till's waiting list (En attente), redesigned 2026-11-10.
 *
 * The owner asked for the screens that still needed a redesign; the list was
 * one thin row per party across the whole screen. It now reads the line at a
 * glance and gives each party a card. This file loads the real part
 * (assets/caisse-floor/new-table-waitlist.js) and runs renderWaitlist():
 *  - the full render: totals, one card per party, the wait's tone, Attabler,
 *    a Retirer that names the party, an empty state with its own Add button;
 *  - the 30 s clock, renderWaitlist(true): it moves the wait text and its tone
 *    in place and never writes innerHTML. A rebuild under a finger swallowed a
 *    tap on Attabler, the same bug the Plus panel had.
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

const MIN = 60000, NOW = Date.now();
function till(waitlist, list) {
  const ctx = {
    waitlist, tables: { T1: { status: 'khawya' }, T2: { status: 'khawya' }, T3: { status: 'occupee' } },
    WL_PREFS: { terrasse: { label: 'Terrasse', icon: 'sun' }, 'peu-importe': { label: 'Peu importe', icon: 'check' } },
    kdsEsc: (s) => String(s).replace(/</g, '&lt;'), lucide: { createIcons() {} },
    $: (sel) => (sel === '#waitlist-list' ? list : null), Math, Date, Number, Object, String,
  };
  ctx.globalThis = ctx;
  ctx.window = { KiwiCaisseLang: { tr: (s) => s } };
  vm.createContext(ctx);
  vm.runInContext(read('assets/caisse-floor/new-table-waitlist.js'), ctx, { filename: 'new-table-waitlist.js' });
  return ctx;
}
const htmlList = () => ({ writes: 0, html: '', set innerHTML(v) { this.writes += 1; this.html = v; }, get innerHTML() { return this.html; }, querySelector: () => null });

/* 1 · empty */
let list = htmlList();
till([], list).renderWaitlist();
ok(list.html.includes('Personne en attente') && /<button[^>]*data-wl-add/.test(list.html), 'nobody waiting: a clear empty state with its own Add button');

/* 2 · three parties */
const parties = [
  { id: 1, name: 'Famille Alaoui', size: 4, pref: 'terrasse', addedAt: NOW - 34 * MIN },
  { id: 2, name: 'Yassine', size: 2, pref: 'peu-importe', addedAt: NOW - 17 * MIN },
  { id: 3, name: 'Karim', size: 1, pref: 'peu-importe', addedAt: NOW },
];
list = htmlList();
till(parties, list).renderWaitlist();
const h = list.html;
ok(/<b>3<\/b><span>groupes<\/span>/.test(h) && /<b>7<\/b><span>personnes<\/span>/.test(h), 'the line on top: 3 groupes, 7 personnes');
ok(/data-wl-longest>34 min<\/b>/.test(h) && /wl-stat is-free"><b>2<\/b><span>tables libres/.test(h), 'then the longest wait (34 min) and the 2 free tables');
ok((h.match(/<article class="wl-card/g) || []).length === 3, 'one card per party');
ok(/wl-card is-long" data-wl-id="1"/.test(h) && /wl-card is-warm" data-wl-id="2"/.test(h) && /wl-card " data-wl-id="3"/.test(h), 'a wait warms at 15 min and turns red at 30');
ok(h.includes("à l'instant") && h.includes('<b>1</b> personne<'), 'a party that just arrived reads « à l\'instant », one person in the singular');
ok(/data-wl-seat="1"[^>]*>[\s\S]*?Attabler/.test(h) && /data-wl-remove="1" aria-label="Retirer Famille Alaoui"/.test(h), 'each card has Attabler and a Retirer that names the party');

/* 3 · the clock moves text in place */
function node(addedAt) {
  const cls = new Set(['wl-card']);
  const card = { classList: { remove: (...c) => c.forEach((x) => cls.delete(x)), add: (c) => cls.add(c) }, cls };
  return { dataset: { wlAt: String(addedAt) }, closest: () => card, lastElementChild: { textContent: '' }, card };
}
const clocks = [node(NOW - 31 * MIN), node(NOW - 16 * MIN), node(NOW - 2 * MIN)];
const longest = { textContent: '', parentElement: { className: '' } };
list = htmlList();
list.querySelector = (sel) => (sel === '[data-wl-at]' ? clocks[0] : sel === '[data-wl-longest]' ? longest : null);
list.querySelectorAll = () => clocks;
till(parties, list).renderWaitlist(true);
ok(list.writes === 0, 'the 30 s clock never writes innerHTML');
ok(clocks.map((c) => c.lastElementChild.textContent).join() === '31 min,16 min,2 min', 'it moves each wait text in place');
ok(clocks[0].card.cls.has('is-long') && clocks[1].card.cls.has('is-warm') && !clocks[2].card.cls.has('is-warm'), 'and each card\'s tone');
ok(longest.textContent === '31 min' && longest.parentElement.className.trim() === 'wl-stat is-long', 'and the longest wait on top');

/* 4 · wiring, styles and words (read as text) */
const app = read('assets/caisse-app.js');
ok(/setInterval\(\(\) => \{ if \(mode === 'waitlist'\) renderWaitlist\(true\); \}, 30000\)/.test(app), 'the till\'s 30 s timer is that clock');
ok(/#waitlist-modal #wl-size-chips \{ display: grid; grid-template-columns: repeat\(8/.test(read('assets/caisse-screens.css')), 'the form puts the eight sizes on one row');
const lang = read('assets/caisse-lang.js');
const keys = ['Attabler', 'Peu importe', 'Intérieur', 'Nom du client', "à l'instant", 'groupe', 'groupes', 'personne', 'personnes',
  'attente la plus longue', 'table libre', 'tables libres', 'Ajoutez un groupe dès qu’il arrive sans réservation. La file garde son ordre et son temps d’attente.'];
ok(keys.every((k) => lang.includes('DICT.en[' + JSON.stringify(k) + ']') && lang.includes('DICT.ar[' + JSON.stringify(k) + ']')), 'every new word has English and Arabic');

console.log(`\ntill-waitlist: ${passed} passed`);
