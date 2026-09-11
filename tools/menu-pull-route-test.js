#!/usr/bin/env node
'use strict';

/* La lecture réseau de la carte ne doit jamais décider de la page affichée.
 *
 * `pull()` va relire /api/menu — 1,2 s après CHAQUE chargement, à chaque retour
 * sur l'onglet et à chaque changement d'établissement. Quand elle réussissait,
 * elle appelait `render()`, qui passe par `KiwiVenue.showMenu()` : ce n'est pas
 * un rafraîchissement, c'est une NAVIGATION (elle pose `page-menu`, éteint
 * l'Accueil, déplace le curseur de la barre latérale). Le patron se connectait,
 * et deux secondes plus tard la page Menu lui sautait au visage par-dessus son
 * Accueil.
 *
 * Le repaint reste dû quand la page Menu est DÉJÀ ouverte — il passe alors par
 * `store.subscribe → KiwiVenue.refreshMenu()`, câblé dans `boot()`. */

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(process.argv[2] || 'assets/menu-catalog.js', 'utf8');

const CARTE = {
  merchant: 'amira-cafe',
  updatedTs: 1,
  menu: {
    langs: ['fr', 'ar', 'en', 'es'],
    cats: [{ id: 'cat_1', name: 'Boissons' }],
    items: [{ id: 'it_1', name: 'Café', price: 12, catId: 'cat_1', avail: true }],
  },
};

/* Monte le module dans un contexte isolé. `onMenuPage` dit si le patron regarde
 * déjà la page Menu au moment où la réponse du serveur arrive. */
function boot(onMenuPage) {
  const classes = new Set(onMenuPage ? ['page-menu'] : []);
  const timers = [];
  const paints = { showMenu: 0, refreshMenu: 0 };
  const subs = [];
  let data = { seq: 0, cats: [], items: [], stations: [], kitchenId: '', opts: [] };

  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    body: {
      classList: {
        add: (c) => { classes.add(c); },
        remove: (c) => { classes.delete(c); },
        contains: (c) => classes.has(c),
        toggle() {},
      },
    },
    head: { appendChild() {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ id: '', textContent: '', style: {}, appendChild() {} }),
    addEventListener(type, fn) { (this._ls || (this._ls = {}))[type] = fn; },
  };

  const window = {
    Kiwi: { handlers: {}, pageShell() {} },
    KiwiEnv: { isReal: () => true },                       // vrai commerçant connecté
    KiwiStore: {
      define: () => ({
        get: () => data,
        set: (d) => { data = d; subs.forEach((fn) => fn('v-amira-cafe')); },
        isEmpty: (d) => !d || (!(d.cats || []).length && !(d.items || []).length),
        subscribe: (fn) => { subs.push(fn); },
        loadExample() {},
      }),
    },
    KiwiVenue: {
      isCustom: () => true,
      getCurrentVenueData: () => ({ id: 'v-amira-cafe', name: 'Amira Café', type: 'restaurant' }),
      getVenueData: () => ({ id: 'v-amira-cafe', name: 'Amira Café', type: 'restaurant' }),
      showMenu() { paints.showMenu += 1; classes.add('page-menu'); },
      refreshMenu() { if (classes.has('page-menu')) paints.refreshMenu += 1; },
      subscribe() {},
    },
    addEventListener() {},
  };
  window.window = window;
  window.document = document;

  const context = {
    window, document, console,
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(CARTE) }),
  };
  vm.createContext(context);
  new vm.Script(source).runInContext(context);

  return {
    classes, paints, timers,
    data: () => data,
    /* Fait sonner les minuteries dans l'ordre, en bornant : `schedulePublish()`
     * en replante une à chaque écriture. */
    drain(cap) {
      let fired = 0;
      while (timers.length && fired < cap) { timers.shift().fn(); fired += 1; }
      return fired;
    },
    /* Le retour sur l'onglet — le second déclencheur de pull(). */
    revisit() { const fn = document._ls && document._ls.visibilitychange; if (fn) fn(); },
  };
}

const settle = () => new Promise((r) => setImmediate(() => setImmediate(() => setImmediate(r))));

(async () => {
  /* 1 · Le patron est sur l'Accueil quand la lecture aboutit. La carte doit
   * rentrer en mémoire, et la page ne doit PAS bouger. */
  {
    const t = boot(false);
    t.drain(4);                                     // la lecture à 1,2 s
    await settle();
    assert.equal(t.data().items.length, 1, 'la carte du serveur doit être adoptée localement');
    assert.equal(t.data().langs.join(','), 'fr,ar,en,es', 'la liste de langues doit suivre la carte dans le store');
    assert.equal(t.paints.showMenu, 0, 'une lecture réseau ne doit jamais naviguer vers la page Menu');
    assert.equal(t.classes.has('page-menu'), false, 'page-menu ne doit pas apparaître derrière le patron');
  }

  /* 2 · Même scénario au retour sur l'onglet : c'est ce déclencheur-là que le
   * patron voyait le plus, en passant d'une fenêtre à l'autre. */
  {
    const t = boot(false);
    t.revisit();
    await settle();
    assert.equal(t.paints.showMenu, 0, 'revenir sur l’onglet ne doit pas ouvrir la page Menu');
    assert.equal(t.classes.has('page-menu'), false, 'page-menu ne doit pas apparaître au retour sur l’onglet');
  }

  /* 3 · Page Menu déjà ouverte : la carte fraîche doit s'afficher. Peu importe
   * par quel chemin — render() ou l'abonné du store — mais quelque chose doit
   * repeindre, sinon la correction aurait coûté la mise à jour en direct. */
  {
    const t = boot(true);
    t.drain(4);
    await settle();
    assert.ok(t.paints.showMenu + t.paints.refreshMenu > 0,
      'la page Menu ouverte doit être repeinte quand la carte arrive du serveur');
    assert.equal(t.data().items.length, 1, 'la carte du serveur doit être adoptée localement');
  }

  console.log('✓ menu pull: la carte rentre en mémoire sans jamais voler la page au patron');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
