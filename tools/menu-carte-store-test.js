#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LA CARTE SUIT L'ÉTABLISSEMENT (assets/menu-catalog.js)
 * ---------------------------------------------------------------------------
 * Un compte tient plusieurs établissements et on passe de l'un à l'autre sans
 * recharger la page. Ce fichier tient la seule promesse qui compte alors :
 * l'écran montre la carte DU magasin affiché, et ce qu'on publie repart dans
 * la fiche DE CE magasin.
 *
 * Trois pannes réelles sont gelées ici, toutes filles de la même cause — un
 * état « nuage » unique pour une maison qui compte plusieurs boutiques :
 *
 *   1. LA LECTURE N'AVAIT LIEU QU'UNE FOIS, 1,2 s après le chargement de la
 *      page. Le patron ouvrait sa boutique (qui n'a pas de carte, donc la
 *      lecture se court-circuite), passait à son café — et le café n'allait
 *      jamais chercher la sienne. Page Carte vide alors que le serveur la
 *      détenait. Et comme l'état vide n'offrait aucun bouton, il n'avait plus
 *      non plus par où récupérer ses liens Order Pro : c'est le symptôme par
 *      lequel le bug a été signalé.
 *
 *   2. LE COURT-CIRCUIT DE LA BOUTIQUE posait `read = true` pour TOUT LE
 *      MONDE. Même sans changement d'établissement, il suffisait d'ouvrir sur
 *      la boutique pour que le restaurant se croie déjà lu.
 *
 *   3. LE SLUG DU DERNIER MAGASIN LU servait de cible à la publication
 *      suivante. Deux restaurants sur un compte, et la carte du second partait
 *      écraser la fiche du premier. C'est la panne la plus chère : elle ne se
 *      voit pas, et elle détruit des données.
 *
 * On exécute le VRAI module dans un bac à sable — pas une imitation de sa
 * logique, qui prouverait seulement que l'imitation est cohérente avec
 * elle-même.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'assets', 'menu-catalog.js');

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) pass++; else fails.push(label); }
function eq(label, got, want) {
  if (got === want) pass++;
  else fails.push(`${label} — attendu ${JSON.stringify(want)}, obtenu ${JSON.stringify(got)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Combien de produits ce navigateur détient pour CE magasin. Tolérant à
 * l'absence : quand la panne est là, l'enregistrement du second magasin n'a
 * jamais été créé, et le test doit dire « 0 au lieu de 1 » plutôt que
 * s'écrouler sur un `undefined` — un plantage ne nomme pas le bug. */
function itemsOf(world, vid) {
  const d = world.mem && world.mem[vid];
  return ((d && d.items) || []).length;
}

/* ── un DOM de poche ────────────────────────────────────────────────────────
 * Le module n'y touche que pour injecter sa feuille de style et pour rendre
 * une page ; on capte le HTML rendu, c'est tout ce qu'on a à inspecter. */
function stubDom() {
  const node = () => ({
    id: '', textContent: '', innerHTML: '', style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, setAttribute() {}, addEventListener() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
  });
  return {
    readyState: 'loading',
    documentElement: { lang: 'fr', dir: 'ltr' },
    head: { appendChild() {} },
    body: node(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: node,
    addEventListener() {},
    dispatchEvent() {},
  };
}

/* ── un magasin local par établissement ─────────────────────────────────────
 * Reproduit le contrat de assets/venue-store.js : `get(vid)` / `set(data, vid)`
 * où un vid absent veut dire « l'établissement affiché ». C'est précisément ce
 * repli qui décide où atterrit une carte lue sur le réseau. */
function stubStore(world) {
  const mem = Object.create(null);
  const blank = () => ({ seq: 0, cats: [], items: [], stations: [], kitchenId: '' });
  const resolve = (vid) => vid || world.currentVid;
  const empty = (d) => !((d.cats || []).length || (d.items || []).length);
  return {
    define(feature, opts) {
      const api = {
        feature,
        get(vid) { const k = resolve(vid); return (mem[k] || (mem[k] = blank())); },
        set(data, vid) { mem[resolve(vid)] = data; return data; },
        update(fn, vid) { const k = resolve(vid); const d = api.get(k); const n = fn(d); mem[k] = (n === undefined ? d : n); return mem[k]; },
        subscribe() {},
        loadExample(vid) { const ex = opts.example && opts.example(); if (ex) api.set(ex, vid); return ex; },
        clear(vid) { return api.set(blank(), vid); },
        isEmpty(vid) { return empty(api.get(vid)); },
        hasData(vid) { return !empty(api.get(vid)); },
      };
      world.mem = mem;
      return api;
    },
  };
}

/* ── le monde : deux ou trois établissements sur un seul compte ─────────────
 * `venues` est la liste ; `setVenue` prévient les abonnés exactement comme
 * assets/venues.js. `config` imite merchant-config.js, qui s'abonne au MÊME
 * évènement : sa relecture est asynchrone, donc au moment où le module réagit
 * au changement, le type du magasin PRÉCÉDENT est encore en place. C'est ce
 * décalage qui faisait sauter la lecture du restaurant. */
function makeWorld(venues, opts) {
  opts = opts || {};
  const subs = [];
  const world = {
    venues,
    currentVid: venues[0].id,
    calls: [],            // toutes les requêtes réseau
    pages: [],            // tout ce que le module a rendu
    serverMenus: opts.serverMenus || {},
    orderProOn: opts.orderProOn !== false,
    configLagMs: opts.configLagMs == null ? 250 : opts.configLagMs,
    mem: null,
  };
  const cur = () => venues.find((v) => v.id === world.currentVid) || venues[0];

  const cfg = { features: {}, type: '', loaded: false, storeSlug: () => cur().slug };
  function syncConfig() {
    const v = cur();
    cfg.type = v.serverType == null ? v.subtype : v.serverType;
    cfg.features = v.features || {};
    cfg.loaded = true;
  }
  syncConfig();

  world.window = {
    KiwiEnv: { isReal: () => true },
    KiwiI18n: { getLang: () => 'fr' },
    KiwiConfig: cfg,
    KiwiVenue: {
      isCustom: () => true,
      getCurrentVenueData: () => cur(),
      getVenueData: (id) => venues.find((v) => v.id === id) || cur(),
      slugOf: () => cur().slug,
      subscribe: (fn) => subs.push(fn),
      showMenu: () => { world.pages.push({ name: 'menu-v2', body: '' }); },
      refreshMenu: () => { world.pages.push({ name: 'menu-v2-refresh', body: '' }); },
    },
    KiwiOrderProPanel: { enabled: () => world.orderProOn },
    Kiwi: {
      handlers: {},
      appPage: (name, spec) => { world.pages.push({ name, body: String(spec && spec.body || '') }); },
    },
    addEventListener(evt, fn) { (world.onLoad = world.onLoad || []).push({ evt, fn }); },
  };

  world.setVenue = function (vid) {
    world.currentVid = vid;
    // venues.js prévient ses abonnés tout de suite…
    subs.forEach((fn) => { try { fn(vid); } catch (_) {} });
    // …et merchant-config.js ne rapporte la config du nouveau magasin qu'après
    // un aller-retour réseau. Le module doit survivre à ce décalage.
    setTimeout(syncConfig, world.configLagMs);
  };

  world.fetch = function (url, init) {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    let body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) {}
    world.calls.push({ url: u, method, body });
    if (method === 'GET' && u.indexOf('/api/menu') === 0) {
      const m = /merchant=([^&]+)/.exec(u);
      const slug = m ? decodeURIComponent(m[1]) : '';
      const menu = world.serverMenus[slug];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(menu
          ? { merchant: slug, menu, published: true, updatedTs: 1234 }
          : { merchant: slug, published: false, updatedTs: 0 }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  };
  return world;
}

function load(world) {
  const ctx = {
    window: world.window,
    document: stubDom(),
    fetch: world.fetch,
    console: { warn() {}, log() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Date, Math, JSON, String, Number, Object, Array, RegExp, Intl,
  };
  ctx.window.window = ctx.window;
  ctx.window.document = ctx.document;
  ctx.window.KiwiStore = stubStore(world);
  ctx.window.fetch = world.fetch;
  ctx.window.setTimeout = setTimeout;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'menu-catalog.js' });
  // le module s'amorce sur 'load'
  (world.onLoad || []).filter((h) => h.evt === 'load').forEach((h) => h.fn());
  return ctx.window.KiwiMenuStore;
}

const CARTE = (n) => ({
  seq: 9, kitchenId: '', stations: [],
  cats: [{ id: 'cat_1', name: 'Boissons', sub: [] }],
  items: [{ id: 'it_1', name: 'Café ' + n, price: 10, catId: 'cat_1', avail: true }],
});

const BOUTIQUE = { id: 'v-bq', name: 'Amira Boutique', slug: 'amira-boutique', type: 'boutique', subtype: 'boutique', features: { orderpro: true } };
const CAFE = { id: 'v-cf', name: 'Amira Café', slug: 'amira-cafe', type: 'restaurant', subtype: 'cafe', serverType: '', features: { orderpro: true } };
const RESTO2 = { id: 'v-r2', name: 'Le Second', slug: 'le-second', type: 'restaurant', subtype: 'restaurant', serverType: '', features: { orderpro: true } };

const menuGets = (w) => w.calls.filter((c) => c.method === 'GET' && c.url.indexOf('/api/menu') === 0);
const menuPosts = (w) => w.calls.filter((c) => c.method === 'POST' && c.url.indexOf('/api/menu') === 0);

const suite = [

  /* 1 — LE BUG SIGNALÉ, de bout en bout. Ouvrir sur la boutique, passer au
   *     café : la carte du café doit descendre du serveur. */
  (async () => {
    const w = makeWorld([BOUTIQUE, CAFE], { serverMenus: { 'amira-cafe': CARTE('café') } });
    load(w);
    await sleep(1500);
    eq('boutique à l’ouverture : aucune carte n’est demandée', menuGets(w).length, 0);

    w.setVenue('v-cf');
    await sleep(2600);
    const gets = menuGets(w);
    ok('passer au café va lire SA carte', gets.some((c) => c.url.indexOf('merchant=amira-cafe') !== -1));
    eq('la carte atterrit chez le café', itemsOf(w, 'v-cf'), 1);
    eq('la boutique n’a pas été touchée', itemsOf(w, 'v-bq'), 0);
  })(),

  /* 2 — Le court-circuit de la boutique ne doit pas verrouiller les autres.
   *     Même sans changement : le café ouvert en second lit quand même. */
  (async () => {
    const w = makeWorld([BOUTIQUE, CAFE], { serverMenus: { 'amira-cafe': CARTE('x') } });
    load(w);
    await sleep(1500);
    w.setVenue('v-cf');
    await sleep(2600);
    ok('le « déjà lu » de la boutique ne déteint pas sur le café',
       menuGets(w).some((c) => c.url.indexOf('merchant=amira-cafe') !== -1));
  })(),

  /* 3 — LE DÉCALAGE DE CONFIG. Au moment du changement, KiwiConfig porte encore
   *     le type du magasin précédent ('boutique'). Prendre ce type périmé
   *     faisait sauter la lecture du restaurant qu'on venait d'ouvrir. */
  (async () => {
    const w = makeWorld([BOUTIQUE, CAFE], { serverMenus: { 'amira-cafe': CARTE('lent') }, configLagMs: 1800 });
    load(w);
    await sleep(1500);
    w.setVenue('v-cf');
    await sleep(3000);
    ok('un type de magasin périmé ne fait pas sauter la lecture',
       menuGets(w).some((c) => c.url.indexOf('merchant=amira-cafe') !== -1));
    eq('la carte est bien arrivée malgré le décalage', itemsOf(w, 'v-cf'), 1);
  })(),

  /* 4 — DEUX RESTAURANTS. Le slug du premier ne doit pas servir de cible à la
   *     publication du second. C'est la panne qui détruisait des données. */
  (async () => {
    const w = makeWorld([CAFE, RESTO2], {
      serverMenus: { 'amira-cafe': CARTE('un'), 'le-second': CARTE('deux') },
    });
    const API = load(w);
    await sleep(1500);                       // le café est lu à l'amorçage
    w.setVenue('v-r2');
    await sleep(2600);                       // le second est lu à son tour
    w.calls.length = 0;
    API.publish('v-r2');
    await sleep(300);
    const posts = menuPosts(w);
    ok('publier le second restaurant émet bien un envoi', posts.length === 1);
    eq('…et vise SA fiche, pas celle du premier', posts[0] && posts[0].body && posts[0].body.merchant, 'le-second');
  })(),

  /* 5 — LE STORE NE POSSÈDE PLUS UNE DEUXIÈME PAGE MENU. Vide ou remplie,
   *     render() délègue au seul écran visuel porté par venues.js. */
  (async () => {
    const w = makeWorld([CAFE], { serverMenus: {}, orderProOn: true });
    const API = load(w);
    await sleep(1500);
    eq('un navigateur neuf ne publie jamais une carte vide au démarrage', menuPosts(w).length, 0);
    w.pages.length = 0;
    API.render();
    const page = w.pages[w.pages.length - 1] || {};
    eq('la carte vide ouvre le menu v2', page.name, 'menu-v2');
    ok('la carte vide ne ressuscite pas l’ancien écran', page.body.indexOf('mx-empty') === -1);
  })(),

  /* 6 — Le choix du renderer ne dépend d'aucun feature flag Order Pro. */
  (async () => {
    const w = makeWorld([CAFE], { serverMenus: {}, orderProOn: false });
    const API = load(w);
    await sleep(1500);
    w.pages.length = 0;
    API.render();
    eq('option coupée : le menu v2 reste le seul renderer',
       (w.pages[w.pages.length - 1] || {}).name, 'menu-v2');
  })(),

  /* 7 — Une carte remplie suit exactement la même route unique. */
  (async () => {
    const on = makeWorld([CAFE], { serverMenus: { 'amira-cafe': CARTE('plein') }, orderProOn: true });
    const A = load(on);
    await sleep(1600);
    on.pages.length = 0; A.render();

    const off = makeWorld([CAFE], { serverMenus: { 'amira-cafe': CARTE('plein') }, orderProOn: false });
    const B = load(off);
    await sleep(1600);
    off.pages.length = 0; B.render();
    eq('carte remplie + option allumée : menu v2',
       (on.pages[on.pages.length - 1] || {}).name, 'menu-v2');
    eq('carte remplie + option coupée : menu v2',
       (off.pages[off.pages.length - 1] || {}).name, 'menu-v2');
  })(),

  /* 8 — Une boutique n'est jamais lue comme une carte : son stock a son propre
   *     éditeur (orderpro-publish.js), et une lecture ici ferait deux
   *     publieurs pour une seule ligne. */
  (async () => {
    const w = makeWorld([CAFE, BOUTIQUE], { serverMenus: { 'amira-cafe': CARTE('c') } });
    load(w);
    await sleep(1500);
    w.calls.length = 0;
    w.setVenue('v-bq');
    await sleep(2600);
    eq('passer à la boutique ne demande aucune carte', menuGets(w).length, 0);
  })(),

  /* 9 — Le réseau qui ne répond pas ne doit RIEN écraser : la copie locale
   *     reste la vérité de travail, et on ne publie pas dans le vide. */
  (async () => {
    const w = makeWorld([CAFE], { serverMenus: {} });
    w.fetch = function () { return Promise.reject(new Error('hors ligne')); };
    const API = load(w);
    await sleep(1600);
    w.mem['v-cf'] = CARTE('local');
    API.render();
    eq('hors ligne : la carte locale est intacte', itemsOf(w, 'v-cf'), 1);
  })(),

  /* 10 — Renommer et retirer une sous-catégorie ne doit jamais jeter ses plats.
   *      Ils reviennent dans « À classer » au sein de la même section. */
  (async () => {
    const w = makeWorld([CAFE], { serverMenus: {} });
    w.fetch = function () { return Promise.reject(new Error('hors ligne')); };
    const API = load(w);
    API.addCategory('Sweets');
    const cid = API.data('v-cf').cats[0].id;
    API.addSubcategory(cid, 'Cookies');
    const sid = API.data('v-cf').cats[0].sub[0].id;
    API.addItem({ name:'Brookie', price:30, catId:cid, subId:sid });
    API.renameSubcategory(cid, sid, 'Cookies & Brownies');
    eq('une sous-catégorie se renomme dans le document partagé', API.data('v-cf').cats[0].sub[0].name, 'Cookies & Brownies');
    API.deleteSubcategory(cid, sid);
    eq('supprimer la sous-catégorie retire seulement le groupe', API.data('v-cf').cats[0].sub.length, 0);
    eq('le plat reste dans sa section', API.data('v-cf').items[0].catId, cid);
    eq('le plat devient non classé au lieu d’être supprimé', API.data('v-cf').items[0].subId, null);
  })(),
];

Promise.all(suite).then(() => {
  if (fails.length) {
    console.log(`\n  ✗ carte par établissement — ${fails.length} échec(s) sur ${pass + fails.length}`);
    fails.forEach((f) => console.log(`     · ${f}`));
    process.exit(1);
  }
  console.log(`  ✓ carte par établissement (${pass} contrôles : relecture au changement, isolation des magasins, cible de publication, route menu v2)`);
}).catch((e) => {
  console.log(`\n  ✗ carte par établissement — ${e && e.stack}`);
  process.exit(1);
});
