#!/usr/bin/env node
/* LA CAISSE CHOISIT SON ÉTABLISSEMENT UNE FOIS — et le tableau de bord ne le
 * déplace plus.
 *
 * `kiwiLiveMerchant` désigne le locataire : sous quel commerce la vente part,
 * quel carnet client s'ouvre. Quarante fichiers le lisent — et le tableau de
 * bord le réécrit à chaque changement d'établissement, dans n'importe quel
 * onglet. Sur le compte d'Amira, qui tient un café ET une boutique, la caisse
 * de la boutique ouverte dans ce navigateur a encaissé sous « amira-cafe » :
 * des articles de boutique dans les ventes du café, et le client crédité dans
 * le carnet du café — d'où, sur le tableau de bord de la boutique, un client
 * « pas venu depuis 4 jours » dont la vente venait d'être faite.
 *
 * Ce banc tient quatre choses : la caisse appairée ne demande rien, la caisse
 * d'un compte à un seul établissement ne demande rien, celle d'un compte qui
 * en a plusieurs demande et n'écrit nulle part avant la réponse, et une fois
 * la réponse donnée le tableau de bord ne peut plus la déplacer.
 *
 *   node tools/till-store-identity-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };
const eq = (name, a, b) => ok(name + ' (' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b) + ')', a === b);

/* ── le comptoir ────────────────────────────────────────────────────────────
 * assets/till-tenant.js tourne en tête de kiwi-caisse.html, SANS defer : il
 * répond avant que le moindre module différé ne lise le locataire. On lui donne
 * donc un document encore sans body, comme à l'exécution. */
function till(storage, opts) {
  opts = opts || {};
  const ls = new Map(Object.entries(storage || {}));
  const localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => { ls.set(k, String(v)); },
    removeItem: (k) => { ls.delete(k); },
    key: (i) => Array.from(ls.keys())[i] ?? null,
    get length() { return ls.size; },
  };
  const listeners = {};
  const nodes = [];
  const el = (tag) => {
    const node = {
      tagName: String(tag).toUpperCase(), id: '', className: '', hidden: false, isConnected: false,
      style: {}, children: [], innerHTML: '', parentNode: null, inert: false,
      attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild(c) { this.children.push(c); c.parentNode = this; c.isConnected = true; return c; },
      remove() { this.isConnected = false; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); },
      addEventListener() {}, querySelector: () => null, closest: () => null,
      get textContent() { return ''; }, set textContent(_v) {},
    };
    nodes.push(node);
    return node;
  };
  const body = opts.body === false ? null : el('body');
  const head = el('head');
  const document = {
    body, head, documentElement: el('html'),
    createElement: el,
    getElementById: (id) => nodes.find((n) => n.id === id && n.isConnected) || null,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
  };
  const timers = [];
  const window = {
    KiwiEnv: { isReal: () => opts.real !== false },
    localStorage, document,
    addEventListener() {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    setInterval: () => 0, clearTimeout() {},
    location: { href: 'https://kiwi-os.com/kiwi-caisse.html', origin: 'https://kiwi-os.com', search: '', reload: () => { window.__reloaded = (window.__reloaded || 0) + 1; } },
    navigator: {}, XMLHttpRequest: null, fetch: null, URL, ProgressEvent: class {},
  };
  window.window = window;
  const context = { window, document, localStorage, console, Date, Math, Number, String, JSON, Object, Array, URL,
    setTimeout: window.setTimeout, setInterval: window.setInterval, clearTimeout: window.clearTimeout,
    navigator: window.navigator, location: window.location, ProgressEvent: window.ProgressEvent };
  vm.createContext(context);
  vm.runInContext(src('assets/till-tenant.js'), context, { filename: 'till-tenant.js' });
  return {
    window, document, ls,
    T: window.KiwiTillTenant,
    pin: () => { try { return JSON.parse(ls.get('kiwiTillStore') || 'null'); } catch (_) { return null; } },
    tenant: () => ls.get('kiwiLiveMerchant') ?? null,
    boot: () => { listeners.DOMContentLoaded?.forEach((fn) => fn()); timers.splice(0).forEach((fn) => fn()); },
    tick: () => window.KiwiTillTenant.check(),
    pickers: () => nodes.filter((n) => n.id === 'tt-lock' && n.isConnected && !n.hidden),
  };
}

/* Le carnet client (bookId) et le journal des ventes (merchant) lisent la
   même épingle. On les juge sur la source : ces deux-là sont les chemins de
   l'argent et du carnet, et aucun autre ne doit deviner. */
const BOOK = code('assets/clients-store/profile.js');
const SALES = code('assets/live-link/parts/merchant.js');

console.log('· la caisse appairée ne demande rien');
{
  const t = till({ kiwiPaired: '1', kiwiLiveMerchant: 'amira-cafe',
    kiwiPairedVenue: JSON.stringify({ merchant: 'amira-boutique', name: 'Amira Boutique' }),
    kiwiCustomVenues: JSON.stringify([{ slug: 'amira-cafe', name: 'Amira Café' }, { slug: 'amira-boutique', name: 'Amira Boutique' }]) });
  eq("l'appairage répond pour elle", t.pin()?.slug, 'amira-boutique');
  eq('et le locataire suit tout de suite', t.tenant(), 'amira-boutique');
  t.boot();
  eq('aucune question posée', t.pickers().length, 0);
}

console.log('· un seul établissement : pas de question non plus');
{
  const t = till({ kiwiLiveMerchant: 'santos-store',
    kiwiCustomVenues: JSON.stringify([{ slug: 'santos-store', name: 'Santos Store' }]) });
  eq('épinglé en silence', t.pin()?.slug, 'santos-store');
  t.boot();
  eq('aucune question posée', t.pickers().length, 0);
}

console.log('· plusieurs établissements, caisse non appairée : le bug du 28 octobre');
{
  const venues = JSON.stringify([{ slug: 'amira-cafe', name: 'Amira Café', location: 'Tanger' },
    { slug: 'amira-boutique', name: 'Amira Boutique', location: 'Tanger' }]);
  const t = till({ kiwiLiveMerchant: 'amira-cafe', kiwiCustomVenues: venues });
  ok('rien n’est épinglé : la question est ouverte', !t.pin()?.slug);
  eq('et elle est marquée comme telle', t.pin()?.pending, 1);
  t.boot();
  eq('la caisse demande, une fois', t.pickers().length, 1);
  eq('et les deux établissements sont proposés',
    (t.pickers()[0].innerHTML.match(/data-tt-store="/g) || []).length, 2);
  t.tick(); t.tick();
  eq('elle ne redemande pas à chaque tour (le clic survivrait)', t.pickers().length, 1);
  ok('rien n’a été écrit sous un magasin', t.tenant() === 'amira-cafe');

  /* La réponse. Elle recharge la page : quarante modules ont déjà lu. */
  t.T.chooseStore('amira-boutique');
  eq('le magasin choisi est épinglé', t.pin()?.slug, 'amira-boutique');
  eq('le locataire devient celui de la caisse', t.tenant(), 'amira-boutique');
  eq('et la page repart proprement', t.window.__reloaded, 1);

  /* Le tableau de bord change de vue — dans cet onglet ou dans un autre. */
  t.ls.set('kiwiLiveMerchant', 'amira-cafe');
  t.tick();
  eq('le tableau de bord ne déplace plus la caisse', t.tenant(), 'amira-boutique');
  eq('et la question ne revient pas', t.pickers().length, 0);
}

console.log('· un nom qui ne figure pas sur le compte est refusé');
{
  const t = till({ kiwiCustomVenues: JSON.stringify([{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }]) });
  eq('choisir un magasin inconnu ne fait rien', t.T.chooseStore('cafe-atlas'), false);
  ok('et rien n’est épinglé', !t.pin()?.slug);
}

console.log('· en démonstration, rien de tout ceci');
{
  const t = till({ kiwiLiveMerchant: 'cafe-atlas',
    kiwiCustomVenues: JSON.stringify([{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }]) }, { real: false });
  ok('aucune épingle', !t.pin());
  t.boot();
  eq('aucune question', t.pickers().length, 0);
  eq('le locataire de la démo est intact', t.tenant(), 'cafe-atlas');
}

console.log('· on ne devine pas ce qu’on ne sait pas');
{
  const t = till({ kiwiLiveMerchant: 'santos-store' });   // pas de liste d'établissements ici
  ok('sans liste, pas d’épingle', !t.pin());
  eq('et l’ancien chemin reste intact', t.tenant(), 'santos-store');
}

console.log('· les deux lecteurs : le carnet et l’argent');
{
  ok('le carnet client lit l’épingle de la caisse', /kiwiTillStore/.test(BOOK));
  /* profile.js lit aussi kiwiLiveMerchant plus haut, pour la reprise d'un
     ancien carnet : c'est l'ordre DANS bookId() qui compte. */
  const bookId = BOOK.slice(BOOK.indexOf('function bookId('));
  ok('… avant kiwiLiveMerchant',
    bookId.indexOf('kiwiTillStore') > -1 && bookId.indexOf('kiwiTillStore') < bookId.indexOf("ls('kiwiLiveMerchant')"));
  ok('… et il s’abstient tant que la question est ouverte',
    /tsd\.pending\) return null/.test(BOOK));
  ok('le journal des ventes lit la même épingle', /kiwiTillStore/.test(SALES));
  ok('… et ne poste rien tant que la question est ouverte',
    /tsd\.pending\) return ''/.test(SALES));
  ok('les deux ne le font que là où il n’y a pas de tableau de bord',
    (BOOK.match(/!window\.KiwiVenue/g) || []).length >= 1 && (SALES.match(/!window\.KiwiVenue/g) || []).length >= 1);
  ok('la caisse réaffirme son locataire à chaque tour',
    /lsGet\('kiwiLiveMerchant'\) !== mine/.test(code('assets/till-tenant.js')));
}

console.log(`\n${fail ? '✗' : '✓'} till-store-identity · ${pass} checks, ${fail} failed`);
assert.equal(fail, 0);
