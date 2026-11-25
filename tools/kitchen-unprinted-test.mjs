#!/usr/bin/env node
/* Un bon de cuisine déposé sur le relais expire au bout de dix minutes si le
 * pont est hors ligne. La liste « Non imprimé » des réglages Imprimante le
 * gardait 24 h, avec le genre brut (« kitchen »), l'heure du format de
 * l'appareil et aucune table : et rien, au comptoir, ne disait qu'un bon ne
 * sortirait jamais. On vérifie ici que le poste retient la table de chaque bon
 * déposé, le dit une fois, et que la liste l'affiche dans la langue de l'écran. */
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
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
vm.runInNewContext(deadlineVmSource(read('assets/kitchen-print-queue.js')), deadlineVmContext(context), { filename: 'kitchen-print-queue.js' });
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
ok('l\'avertissement dit où réimprimer', /Réimprimer » sur l’alerte/.test(toasts[0].desc), toasts[0].desc);
ok('un événement porte le nombre de bons non imprimés', events.some((e) => e.type === 'kiwi:kitchen-print-unprinted' && e.detail.count === 1));
events.length = 0;
await K.pollUnprinted();
ok('le même bon n\'est pas annoncé deux fois', toasts.length === 1);
const still = events.filter((e) => e.type === 'kiwi:kitchen-print-unprinted').pop();
ok('mais l\'alerte le garde : chaque sondage redit les bons encore non imprimés, avec leurs ids et tables',
  still && still.detail.count === 1 && still.detail.ids[0] === 'pj_abcdef01' && still.detail.labels === 'Table 7 · #12', JSON.stringify(still && still.detail));

/* La caisse se recharge (Browse, 25 nov.) : un nouveau poste, la même mémoire. L'alerte revient, sans re-sonner. */
{
  const ev2 = [], toasts2 = [], l2 = Object.create(null);
  const ctx2 = { ...context, KiwiCaisseToast: (t) => toasts2.push(t), addEventListener(type, fn) { (l2[type] ||= []).push(fn); }, dispatchEvent(ev) { ev2.push(ev); } };
  ctx2.window = ctx2;
  vm.runInNewContext(deadlineVmSource(read('assets/kitchen-print-queue.js')), deadlineVmContext(ctx2), { filename: 'kitchen-print-queue.js' });
  await ctx2.KiwiKitchenPrint.pollUnprinted();
  const back = ev2.filter((e) => e.type === 'kiwi:kitchen-print-unprinted').pop();
  ok('après un rechargement, le bon perdu est de nouveau signalé', back && back.detail.count === 1 && back.detail.labels === 'Table 7 · #12');
  ok('…sans rejouer le toast', toasts2.length === 0);
}

/* « Réimprimer » sur l'alerte : une copie par bon via reprint-expired, la table suit la copie. */
{
  const posts = [];
  const saved = context.fetch;
  context.fetch = (url, init) => {
    all.push(url);
    if (init && init.method === 'POST') {
      const body = JSON.parse(init.body); posts.push(body);
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, id: 'pj_copy0001' }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, jobs: serverJobs }) });
  };
  serverJobs = [{ id: 'pj_abcdef01', kind: 'kitchen', status: 'expired' }];
  const before = posts.length;
  const first = K.reprintUnprinted(['pj_abcdef01']);
  serverJobs = [];   // the server hides a source once its copy exists
  const r = await first;
  ok('Réimprimer dépose une copie du bon expiré', posts.length === before + 1 && posts[0].action === 'reprint-expired' && posts[0].id === 'pj_abcdef01', JSON.stringify(posts));
  ok('et répond « envoyé »', r.ok && r.sent === 1 && r.failed === 0, JSON.stringify(r));
  ok('la copie garde la table du bon', K.relayLabel('pj_copy0001') === 'Table 7 · #12', K.relayLabel('pj_copy0001'));
  const after = events.filter((e) => e.type === 'kiwi:kitchen-print-unprinted').pop();
  ok('la liste est relue tout de suite : plus rien en attente, l\'alerte peut partir', after && after.detail.count === 0);
  context.fetch = (url, init) => (init && init.method === 'POST'
    ? Promise.resolve({ json: () => Promise.resolve({ ok: false, error: 'relay-offline' }) })
    : Promise.resolve({ json: () => Promise.resolve({ ok: true, jobs: [] }) }));
  const off = await K.reprintUnprinted(['pj_abcdef01']);
  ok('un pont hors ligne est dit comme tel', !off.ok && off.why === 'relay-offline', JSON.stringify(off));
  ok('sans bon, rien n\'est envoyé', (await K.reprintUnprinted([])).sent === 0);
  context.fetch = saved;
}

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
