#!/usr/bin/env node
/* Un ticket arabe que l'appareil ne sait pas dessiner ne sort pas en « ? ».
 *
 * assets/escpos.js dessine l'arabe sur un canvas. Sans canvas (WebView bridée,
 * protection anti-empreinte), il retombait en silence sur CP1252 : le papier
 * disait « ????? », et en cuisine un bon illisible envoie un autre plat.
 * Désormais l'encodeur compte les lignes perdues (unsupportedLines) et le pont
 * d'impression (assets/printer-bridge.js) refuse d'envoyer ces octets, avec une
 * raison explicite et un avis à l'écran. On le prouve en exécutant les deux
 * fichiers réels, sans canvas, avec des transports espions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* Un DOM minimal : de quoi poser l'avis, pas de canvas. */
const notices = [];
function el(tag) {
  return { tagName: tag, style: {}, children: [], dataset: {}, setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); if (c && c.textContent) notices.push(c.textContent); return c; }, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    getContext() { return null; }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } };
}
const store = new Map();
const document = { createElement: el, body: el('body'), documentElement: el('html'), head: el('head'), addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, readyState: 'complete', visibilityState: 'visible' };
const writes = [];
const window = {
  document, navigator: { userAgent: 'node' }, location: { href: 'https://kiwi-os.com/kiwi-caisse.html', hostname: 'kiwi-os.com', protocol: 'https:', origin: 'https://kiwi-os.com', search: '' },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() {},
  fetch: (url, init) => { writes.push({ via: 'fetch', url: String(url) }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('') }); },
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  CustomEvent: function () {}, Event: function () {},
};
window.window = window; window.self = window; window.globalThis = window;
const ctx = vm.createContext(Object.assign(window, { console, Promise, Uint8Array, Array, Object, JSON, Math, Date, String, Number, RegExp, Error, Map, Set, encodeURIComponent, decodeURIComponent, TextEncoder }));
vm.runInContext(read('assets/escpos.js'), ctx, { filename: 'escpos.js' });
const E = window.KiwiEscPos;

const latin = E.kitchenTicket({ paper: '80', title: 'CUISINE', table: 'T4', items: [{ qty: 2, name: 'Tajine poulet citron' }] });
const arabic = E.kitchenTicket({ paper: '80', title: 'CUISINE', table: 'T4', items: [{ qty: 1, name: 'طاجين' }, { qty: 1, name: 'Harira', note: 'بدون بصل' }] });
check(E.unsupportedLines(latin) === 0, 'a ticket without Arabic reports no lost line');
check(E.unsupportedLines(arabic) === 2, 'without a canvas every Arabic line is counted as lost (2 lines)');
check(Array.from(arabic).includes(0x3F), 'the encoder still answers with bytes, it never throws');

vm.runInContext(read('assets/printer-bridge.js'), ctx, { filename: 'printer-bridge.js' });
const P = window.KiwiPrinter;
check(P && typeof P.printBytes === 'function' && typeof P.printKitchen === 'function', 'the real printer bridge loads');

const before = writes.length;
const r1 = await P.printBytes(arabic);
check(r1 && r1.ok === false && r1.reason === 'text-not-drawable' && r1.lines === 2, 'printBytes refuses the ticket with an explicit reason and the lost-line count');
const r2 = await P.printKitchen({ title: 'CUISINE', items: [{ qty: 1, name: 'كسكس' }] }, { station: 'cuisson' });
check(r2 && r2.ok === false && r2.reason === 'text-not-drawable', 'printKitchen refuses an Arabic kitchen ticket it cannot draw');
const r3 = await P.printReceipt({ shop: 'Amira', lines: [{ name: 'شاي', price: '15.00' }], total: '15.00' });
check(r3 && r3.ok === false && r3.reason === 'text-not-drawable', 'printReceipt refuses an Arabic receipt it cannot draw');
check(writes.length === before, 'nothing reached any transport');
check(notices.length === 3 && notices.every((n) => /arabe/.test(n) && /« \? »/.test(n)), 'each refused ticket shows one notice that names the cause');
await P.printBytes(arabic);
check(notices.length === 3, 'retrying the same bytes does not stack a second notice');

const r4 = await P.printBytes(latin);
check(!(r4 && r4.reason === 'text-not-drawable'), 'a Latin ticket goes on to the transports as before');

const lang = read('assets/caisse-lang.js');
check(lang.includes("'Impression arrêtée · cet appareil ne sait pas dessiner l’arabe de ce ticket. Rien n’est sorti en « ? ».': ['Printing stopped"), 'the till translates the notice (EN, AR)');
console.log(`escpos-unsupported: ${checks} passed`);
