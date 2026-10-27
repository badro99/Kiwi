#!/usr/bin/env node
/* Un bon de cuisine déposé sur le relais expire au bout de dix minutes si le
 * pont est hors ligne. La liste « Non imprimé » des réglages Imprimante le
 * gardait 24 h, avec le genre brut (« kitchen »), l'heure du format de
 * l'appareil et aucune table : et rien, au comptoir, ne disait qu'un bon ne
 * sortirait jamais. On vérifie ici que le poste retient la table de chaque bon
 * déposé, le dit une fois, et que la liste l'affiche dans la langue de l'écran. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0; const fail = [];
const ok = (label, cond, detail = '') => { if (cond) pass += 1; else fail.push(label + (detail ? ' · ' + detail : '')); };
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

const memory = new Map();
const localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
const toasts = [], events = [], all = [];
const requests = { get length() { return all.filter((u) => /api\/print\/jobs/.test(u)).length; }, 0: undefined };
let serverJobs = [];
let printerReply = { ok: true, queued: true, id: 'pj_abcdef01' };
const listeners = Object.create(null);
const context = {
  console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, localStorage,
  document: { readyState: 'complete', hidden: false, getElementById: () => null, addEventListener() {} },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
  addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  dispatchEvent(ev) { events.push(ev); (listeners[ev.type] || []).forEach((fn) => fn(ev)); },
  KiwiKitchenRelay: { merchant: () => 'amira-cafe' },
  KiwiCaisseToast: (title, ms, kind, desc) => toasts.push({ title, kind, desc }),
  KiwiCaisseLang: { tr: (s) => s },
  KiwiPrinter: { isConnected: () => true, printKitchen: () => Promise.resolve(printerReply) },
  fetch: (url) => { all.push(url); return Promise.resolve({ json: () => Promise.resolve({ ok: true, jobs: serverJobs }) }); },
};
context.window = context;
vm.runInNewContext(read('assets/kitchen-print-queue.js'), context, { filename: 'kitchen-print-queue.js' });
const K = context.KiwiKitchenPrint;

/* Sans dépôt sur le relais, le poste ne sonde rien (pas de lecture inutile). */
await K.pollUnprinted();
ok('un poste qui ne dépose pas sur le relais ne sonde pas le serveur', requests.length === 0);

/* Un bon part sur le relais : le poste retient sa table. */
K.setHub(true);
K.enqueue([{ id: 'ord-7:cuisson', createdAt: Date.now(), payload: { title: 'CUISSON', table: 'Table 7', order: '#12', items: [{ name: 'Tajine' }] } }], { remote: 'connected' });
await wait(120);
ok('la table et la commande du bon déposé sont retenues', K.relayLabel('pj_abcdef01') === 'Table 7 · #12', K.relayLabel('pj_abcdef01'));
ok('un bon inconnu n\'a pas de table', K.relayLabel('pj_inconnu') === '');

/* Le bon expire côté serveur : le comptoir l'apprend, une seule fois. */
serverJobs = [{ id: 'pj_abcdef01', kind: 'kitchen', status: 'expired', created_ts: Date.now() - 700000, expires_ts: Date.now() + 86e6 }];
await K.pollUnprinted();
ok('le poste interroge la liste des tickets non imprimés', requests.length === 1 && all.some((u) => /\/api\/print\/jobs\?merchant=amira-cafe/.test(u)), all.join(' '));
ok('le comptoir est averti avec la table', toasts.length === 1 && toasts[0].kind === 'warn' && /Table 7 · #12/.test(toasts[0].desc) && /non imprimé/.test(toasts[0].title), JSON.stringify(toasts));
ok('l\'avertissement dit où réimprimer', /Réimprimez depuis les réglages Imprimante/.test(toasts[0].desc));
ok('un événement porte le nombre de bons non imprimés', events.some((e) => e.type === 'kiwi:kitchen-print-unprinted' && e.detail.count === 1));
await K.pollUnprinted();
ok('le même bon n\'est pas annoncé deux fois', toasts.length === 1);

/* Plusieurs bons d'un coup : un seul message, le compte. Un ticket de caisse n'y entre pas. */
serverJobs = [
  { id: 'pj_abcdef01', kind: 'kitchen', status: 'expired' },
  { id: 'pj_two00002', kind: 'kitchen', status: 'uncertain' },
  { id: 'pj_three003', kind: 'kitchen', status: 'expired' },
  { id: 'pj_receipt04', kind: 'receipt', status: 'expired' },
];
await K.pollUnprinted();
ok('deux nouveaux bons de cuisine donnent un seul message avec le compte', toasts.length === 2 && /^2 bons de cuisine non imprimés/.test(toasts[1].title), toasts[1] && toasts[1].title);

/* Un serveur muet ne casse rien. */
context.fetch = () => Promise.reject(new Error('offline'));
ok('un serveur injoignable ne lève rien', (await K.pollUnprinted()).length === 0);

/* La liste des réglages : genre, table et heure dans la langue de l'écran. */
const ui = read('assets/printer/pairing-ui.js');
const from = ui.indexOf('    var KIND_FR = {');
const to = ui.indexOf('    function fmtAgo(ts)');
ok('la liste a son aide de lecture', from > 0 && to > from);
const job = { id: 'pj_abcdef01', kind: 'kitchen', created_ts: Date.UTC(2026, 9, 27, 14, 14) };
const langStore = new Map();
const langWindow = { localStorage: { getItem: (k) => langStore.get(k) || null, setItem: (k, v) => langStore.set(k, String(v)), removeItem: (k) => langStore.delete(k) } };
const inert = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, attributes: [], childNodes: [], children: [], setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {}, appendChild() {}, insertBefore() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const langContext = { window: langWindow, document: { readyState: 'complete', documentElement: inert(), body: inert(), head: inert(), createElement: inert, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }) },
  localStorage: langWindow.localStorage, console, MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
  WeakMap, Map, Set, Array, Object, String, Number, JSON, Math, RegExp, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 };
vm.runInNewContext(read('assets/caisse-lang.js'), langContext, { filename: 'caisse-lang.js' });
for (const [lang, kind, locale] of [['fr', 'Bon de cuisine', /27 oct/], ['en', 'Kitchen ticket', /27 Oct/], ['ar', 'بون المطبخ', /27/]]) {
  langWindow.KiwiCaisseLang.set(lang);
  const sandbox = { window: { KiwiCaisseLang: langWindow.KiwiCaisseLang, KiwiKitchenPrint: K }, Date, String, Array, say: (fr) => langWindow.KiwiCaisseLang.tr(fr) };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(ui.slice(from, to), sandbox);
  const what = vm.runInNewContext('unprintedWhat(' + JSON.stringify(job) + ')', Object.assign(sandbox, { window: sandbox.window }));
  ok(`[${lang}] le genre est écrit dans la langue (${what})`, what.startsWith(kind) && !/kitchen\b/.test(what.replace(/Kitchen ticket/, '')));
  ok(`[${lang}] la table du bon est affichée`, what.includes('Table 7 · #12'), what);
  ok(`[${lang}] la date suit la langue, pas l'appareil`, locale.test(what) && !/AM|PM|\d+\/\d+\/\d{4}/.test(what), what);
}
ok('l\'ancien affichage brut est retiré', !/job\.kind \+ ' · ' \+ new Date\(job\.created_ts\)\.toLocaleString\(\)/.test(ui));

if (fail.length) { console.error(fail.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log(`  ✓ kitchen-unprinted: ${pass} contrôles`);
process.exit(0);
