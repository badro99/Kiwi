#!/usr/bin/env node
/* Un drapeau « en cours » ne doit jamais rester levé pour toujours.
 *
 * Cinq endroits posaient un verrou avant un appel réseau et ne le rendaient
 * qu'à la réponse. Une requête qui ne répond jamais (wifi qui change, tablette
 * qui sort de veille, proxy qui garde la connexion ouverte) laissait donc le
 * verrou levé jusqu'au rechargement de la page :
 *   · la synchro du stock          assets/inventory-ledger.js   (`syncing`)
 *   · la lecture de la carte       assets/menu-catalog/state.js (`pulling`)
 *   · le rafraîchissement auto     assets/caisse-refresh.js     (`busy`)
 *   · les paires « Souvent avec »  assets/caisse-pairs.js       (`inflight`)
 *   · le sondage des retraits      assets/live-link/parts/operator.js (`busy`)
 * Même famille que la file des ventes (tools/outbox-stale-lock-test.mjs).
 *
 * Chaque cas : un premier appel reste sans réponse, le temps passe, et l'appel
 * suivant doit repartir vers le serveur. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import menuCatalogSource from './menu-catalog-test-source.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
function ok(name, value) {
  if (!value) { console.error('  ✗ ' + name); process.exitCode = 1; return; }
  pass++;
}
const settle = () => new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r))));
async function state(p) {
  let s = 'pending';
  Promise.resolve(p).then(() => { s = 'done'; }, () => { s = 'failed'; });
  await settle();
  return s;
}
/* La valeur d'une promesse si elle est déjà tenue, sinon undefined : un test
 * rouge ne doit pas rester suspendu à la promesse qu'il accuse. */
const value = (p) => Promise.race([p, settle().then(() => undefined)]);
/* Une horloge de poche : les minuteries s'empilent, `ring()` les fait sonner. */
function clock() {
  const timers = [];
  let seq = 0;
  return {
    timers,
    setTimeout(fn, ms) { timers.push({ id: ++seq, fn, ms: +ms || 0 }); return seq; },
    clearTimeout(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    ring() { const due = timers.splice(0); due.forEach((t) => t.fn()); return due; },
  };
}
/* Une requête qui ne répond jamais, mais qui obéit à son signal d'abandon,
 * comme le vrai fetch. */
function mute(calls) {
  return (url, opts) => {
    calls.push(String(url));
    return new Promise((_, reject) => {
      const s = opts && opts.signal;
      if (s) s.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  };
}
const sane = (due) => due.length > 0 && due.every((t) => t.ms >= 10000 && t.ms <= 60000);

/* ── 1 · la synchro du stock ─────────────────────────────────────────────── */
{
  const memory = new Map();
  const localStorage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
  const window = {
    localStorage, KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => 'audit-shop' }, addEventListener() {},
  };
  window.window = window;
  const c = clock();
  const calls = [];
  let answer = mute(calls);
  const context = vm.createContext({
    window, localStorage, navigator: { onLine: true }, crypto: globalThis.crypto,
    console, Date, Math, JSON, Map, Set, Promise, AbortController,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, setInterval() { return 0; },
    fetch: (u, o) => answer(u, o),
  });
  vm.runInContext(read('assets/inventory-ledger.js'), context, { filename: 'inventory-ledger.js' });
  const I = window.KiwiInventory;
  c.timers.length = 0;                       // les réveils du chargement ne nous regardent pas

  const first = I.sync();
  await settle();
  ok('stock · la synchro part vers le serveur', calls.length === 1);
  ok('stock · sans réponse, elle attend (pas d’abandon immédiat)', (await state(first)) === 'pending');
  const due = c.ring();
  ok('stock · un délai d’abandon raisonnable est posé sur la requête', sane(due));
  ok('stock · le délai passé, la synchro muette se termine', (await state(first)) === 'done');
  ok('stock · et elle dit qu’elle a échoué', (await value(first)) === false);

  answer = (url) => { calls.push(String(url)); return Promise.resolve({ ok: true, status: 200, json: async () => ({ movements: [], cursor: 5 }) }); };
  const second = await value(I.sync());
  ok('stock · la synchro suivante repart vers le serveur', calls.length === 2);
  ok('stock · et aboutit', second === true);
}

/* ── 2 · la lecture de la carte ──────────────────────────────────────────── */
{
  const classes = new Set();
  const subs = [];
  let data = { seq: 0, cats: [], items: [], stations: [], kitchenId: '', opts: [] };
  const document = {
    readyState: 'complete', visibilityState: 'visible',
    body: { classList: { add: (x) => classes.add(x), remove: (x) => classes.delete(x), contains: (x) => classes.has(x), toggle() {} } },
    head: { appendChild() {} },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ id: '', textContent: '', style: {}, appendChild() {} }),
    addEventListener(type, fn) { (this._ls || (this._ls = {}))[type] = fn; },
  };
  const venue = { id: 'v-amira-cafe', name: 'Amira Café', type: 'restaurant' };
  const window = {
    Kiwi: { handlers: {}, pageShell() {} },
    KiwiEnv: { isReal: () => true },
    KiwiStore: { define: () => ({
      get: () => data, set: (d) => { data = d; subs.forEach((fn) => fn(venue.id)); },
      isEmpty: (d) => !d || (!(d.cats || []).length && !(d.items || []).length),
      subscribe: (fn) => { subs.push(fn); }, loadExample() {},
    }) },
    KiwiVenue: {
      isCustom: () => true, getCurrentVenueData: () => venue, getVenueData: () => venue,
      showMenu() {}, refreshMenu() {}, subscribe() {},
    },
    addEventListener() {},
  };
  window.window = window; window.document = document;
  const c = clock();
  const calls = [];
  let answer = mute(calls);
  /* Le retour sur l'onglet ne relit qu'une fois par 20 s : l'heure est à nous. */
  let now = Date.UTC(2026, 10, 21, 13, 0, 0);
  class Clock extends Date {
    constructor(...a) { if (a.length) super(...a); else super(now); }
    static now() { return now; }
  }
  const later = () => { now += 21000; };
  const context = vm.createContext({
    window, document, console, AbortController, Date: Clock,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
    fetch: (u, o) => answer(u, o),
  });
  new vm.Script(menuCatalogSource()).runInContext(context);
  const revisit = () => { const fn = document._ls && document._ls.visibilitychange; if (fn) fn(); };

  revisit();                                  // le retour sur l'onglet lance la lecture
  await settle();
  const before = calls.filter((u) => u.indexOf('/api/menu') === 0).length;
  ok('carte · la lecture part vers le serveur', before === 1);
  later(); revisit(); await settle();
  ok('carte · une lecture en cours n’est pas doublée', calls.filter((u) => u.indexOf('/api/menu') === 0).length === 1);
  const due = c.ring().filter((t) => t.ms >= 5000);
  await settle();
  ok('carte · un délai d’abandon raisonnable est posé sur la requête', sane(due));

  answer = (url) => {
    calls.push(String(url));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      merchant: 'amira-cafe', updatedTs: 1,
      menu: { langs: ['fr'], cats: [{ id: 'cat_1', name: 'Boissons' }], items: [{ id: 'it_1', name: 'Café', price: 12, catId: 'cat_1', avail: true }] },
    }) });
  };
  later(); revisit(); await settle();
  ok('carte · le délai passé, la lecture suivante repart vers le serveur', calls.filter((u) => u.indexOf('/api/menu') === 0).length === 2);
  ok('carte · et la carte du serveur est adoptée', (data.items || []).length === 1);
}

/* ── 3 · le rafraîchissement automatique de la caisse ────────────────────── */
{
  const node = () => ({
    style: {}, className: '', disabled: false, innerHTML: '',
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, insertBefore() {}, setAttribute() {}, addEventListener() {},
    querySelector: () => null, remove() {},
  });
  const document = {
    hidden: false, getElementById: () => null, createElement: node, querySelector: () => null,
    addEventListener() {}, head: { appendChild() {} },
  };
  let hang = true, catalog = 0, config = 0;
  const window = {
    addEventListener() {}, document,
    KiwiEnv: { isReal: () => true },
    KiwiBoutiqueCatalog: { sync() { catalog++; return hang ? new Promise(() => {}) : Promise.resolve(false); } },
    KiwiConfig: { reload() { config++; return Promise.resolve(true); } },
  };
  const c = clock();
  const context = vm.createContext({
    window, document, navigator: { onLine: true }, location: { search: '' }, URLSearchParams,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, Promise, Date, Math, JSON,
  });
  vm.runInContext(read('assets/caisse-refresh.js'), context, { filename: 'caisse-refresh.js' });
  const R = window.KiwiCaisseRefresh;
  c.timers.length = 0;

  const first = R.run();
  ok('caisse · un double appui partage le même aller-retour', R.run() === first);
  ok('caisse · tant qu’un module n’a pas répondu, le tour attend', (await state(first)) === 'pending');
  const due = c.ring();
  ok('caisse · un délai raisonnable borne le tour', sane(due));
  ok('caisse · le délai passé, le tour se termine sans le module muet', (await state(first)) === 'done');
  const out = await value(first);
  ok('caisse · la réponse de la config compte toujours', out && out.real === true && out.reached === true);

  hang = false;
  const second = R.run();
  ok('caisse · le tour suivant est un nouveau tour', second !== first);
  await value(second);
  ok('caisse · et il réinterroge chaque module', catalog === 2 && config === 2);
}

/* ── 4 · « Souvent avec… », les paires du comptoir ───────────────────────── */
{
  const memory = new Map();
  const localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) };
  const window = { KiwiPairsMerchant: () => 'amira-cafe', addEventListener() {} };
  const c = clock();
  const calls = [];
  let answer = mute(calls);
  const context = vm.createContext({
    window, localStorage, AbortController,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, setInterval() { return 0; },
    fetch: (u, o) => answer(u, o),
  });
  vm.runInContext(read('assets/caisse-pairs.js'), context, { filename: 'caisse-pairs.js' });
  const P = window.KiwiPairs;
  c.timers.length = 0;

  const first = P.refresh();
  ok('paires · une lecture en cours est partagée', P.refresh() === first && calls.length === 1);
  ok('paires · sans réponse, elle attend', (await state(first)) === 'pending');
  ok('paires · un délai d’abandon raisonnable est posé sur la requête', sane(c.ring()));
  ok('paires · le délai passé, la lecture muette se termine', (await state(first)) === 'done');
  answer = (url) => {
    calls.push(String(url));
    return Promise.resolve({ ok: true, json: async () => ({ merchant: 'amira-cafe', at: 5, pairs: { msemen: [{ i: 'the', n: 'Thé', together: 9, share: 0.6 }] } }) });
  };
  await value(P.refresh());
  ok('paires · la lecture suivante repart vers le serveur', calls.length === 2);
  ok('paires · et les paires du commerce sont retenues', !!P._state().pairs.msemen);
}

/* ── 5 · les ventes retirées, apprises par la caisse ─────────────────────── */
{
  const part = read('assets/live-link/parts/operator.js');
  const from = part.indexOf('  function watchVoids() {');
  const tail = '    tick();\n  }\n';
  const body = part.slice(from, part.indexOf(tail, from) + tail.length);
  ok('retraits · le sondage est bien celui que la caisse charge', from > 0 && read('assets/live-link.js').includes(body));
  const listeners = {};
  const document = { hidden: false, addEventListener(type, fn) { listeners[type] = fn; } };
  const c = clock();
  const calls = [];
  const applied = [];
  let answer = mute(calls);
  const context = vm.createContext({
    document, window: { addEventListener() {} }, console,
    on: () => true, merchant: () => 'amira-cafe', applyVoids: (v) => applied.push(v),
    /* Le vrai AbortSignal.timeout suit l'horloge du système ; celui-ci suit la nôtre. */
    AbortSignal: { timeout(ms) { const ctl = new AbortController(); c.setTimeout(() => ctl.abort(), ms); return ctl.signal; } },
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
    fetch: (u, o) => answer(u, o),
  });
  vm.runInContext('var VOID_MS = 15000;\n' + body + '\nwatchVoids();', context, { filename: 'operator.js' });
  await settle();
  ok('retraits · le sondage part au chargement', calls.length === 1);
  listeners.visibilitychange(); await settle();
  ok('retraits · un sondage en cours n’est pas doublé', calls.length === 1);
  ok('retraits · un délai d’abandon raisonnable est posé sur la requête', sane(c.ring()));
  await settle();
  answer = (url) => { calls.push(String(url)); return Promise.resolve({ ok: true, json: async () => ({ voided: [{ i: 's1', vts: 9 }] }) }); };
  listeners.visibilitychange(); await settle();
  ok('retraits · le délai passé, le sondage suivant repart vers le serveur', calls.length === 2);
  ok('retraits · et les retraits sont appliqués', applied.length === 1);
}

if (!process.exitCode) console.log('✓ stuck-guard: ' + pass + ' vérifications, aucun verrou ne survit à une requête muette');
