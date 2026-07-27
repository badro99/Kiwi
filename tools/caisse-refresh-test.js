#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU du bouton « Rafraîchir » (assets/caisse-refresh.js)
 * ---------------------------------------------------------------------------
 * Un bouton de synchronisation n'a qu'une façon de nuire : dire « à jour »
 * quand il n'a parlé à personne. Le commerçant lit ça, conclut que son stock
 * est bien celui de l'écran, et vend ce qu'il n'a plus.
 *
 * Ce fichier tient donc UNE promesse, sur deux fronts :
 *   · la phrase — « Déjà à jour » ne sort jamais sans `reached` ;
 *   · le calcul de `reached` — il vient d'une VRAIE réponse du serveur, pas
 *     du simple fait que les appels se soient terminés.
 *
 * Le module est du navigateur : on lui donne le strict minimum de DOM (il n'en
 * touche qu'au montage et pour les toasts, jamais dans run()).
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'assets', 'caisse-refresh.js');

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) pass++; else fails.push(label); }
function eq(label, got, want) {
  if (got === want) pass++;
  else fails.push(`${label} — attendu ${JSON.stringify(want)}, obtenu ${JSON.stringify(got)}`);
}

/* Un DOM de poche : le module n'appelle rien de tout ça depuis run(). */
function stubDom() {
  const node = () => ({
    style: {}, className: '', disabled: false, innerHTML: '',
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, insertBefore() {}, setAttribute() {}, addEventListener() {},
    querySelector: () => null, remove() {},
  });
  return {
    getElementById: () => null,
    createElement: node,
    querySelector: () => null,
    head: { appendChild() {} },
  };
}

function load(globals) {
  const ctx = {
    window: Object.assign({}, globals),
    document: stubDom(),
    setTimeout, clearTimeout, Promise, Date, Math, JSON,
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'caisse-refresh.js' });
  return ctx.window.KiwiCaisseRefresh;
}

/* ── 1. la phrase ───────────────────────────────────────────────────────── */
const M = load({}).message;

eq('démo → dit que c’est une démo',
  M({ real: false, reached: false, changed: [], orders: -1 }),
  "Démo locale, il n'y a pas de serveur à interroger");

eq('serveur muet → ne prétend PAS être à jour',
  M({ real: true, reached: false, changed: [], orders: -1 }),
  "Serveur injoignable, l'écran garde ce que sait cette tablette");

eq('joint et rien de neuf → à jour',
  M({ real: true, reached: true, changed: [], orders: 0 }), 'Déjà à jour');

eq('inventaire changé', M({ real: true, reached: true, changed: ['inventaire'], orders: 0 }),
  'Rafraîchi · inventaire à jour');

eq('deux sources changées', M({ real: true, reached: true, changed: ['inventaire', 'documents'], orders: 0 }),
  'Rafraîchi · inventaire, documents à jour');

eq('une commande — singulier', M({ real: true, reached: true, changed: [], orders: 1 }),
  'Rafraîchi · 1 nouvelle commande');

eq('deux commandes — pluriel', M({ real: true, reached: true, changed: [], orders: 2 }),
  'Rafraîchi · 2 nouvelles commandes');

eq('inventaire + commandes', M({ real: true, reached: true, changed: ['inventaire'], orders: 3 }),
  'Rafraîchi · inventaire à jour · 3 nouvelles commandes');

/* -1 veut dire « pas pu demander », surtout pas « zéro nouvelle ». */
ok('file injoignable ne s’annonce pas comme zéro',
  !/commande/.test(M({ real: true, reached: true, changed: [], orders: -1 })));

/* La règle, dite autrement : aucune entrée sans `reached` ne peut produire la
 * phrase rassurante. On balaie tout ce qui pourrait tromper la fonction. */
[[], ['inventaire'], ['inventaire', 'documents']].forEach((ch) => {
  [-1, 0, 1, 5].forEach((n) => {
    ok(`jamais « Déjà à jour » sans réponse (changed=${ch.length}, orders=${n})`,
      M({ real: true, reached: false, changed: ch, orders: n }) !== 'Déjà à jour');
    ok(`jamais « Rafraîchi » sans réponse (changed=${ch.length}, orders=${n})`,
      !/^Rafraîchi/.test(M({ real: true, reached: false, changed: ch, orders: n })));
  });
});

ok('entrée vide ne casse pas la phrase', typeof M(null) === 'string' && typeof M({}) === 'string');

/* ── 2. le calcul de `reached` ──────────────────────────────────────────── */
function scenario(opts) {
  const calls = [];
  const fail = () => Promise.reject(new Error('offline'));
  const R = load({
    KiwiEnv: { isReal: () => opts.real !== false },
    KiwiPosDispatch: { repaint() { calls.push('repaint'); } },
    KiwiBoutiqueCatalog: opts.noCatalog ? null : {
      sync() { calls.push('catalog'); return opts.down ? fail() : Promise.resolve(!!opts.catChanged); },
    },
    KiwiCloudDoc: {
      pullAll() { calls.push('docs'); return opts.down ? fail() : Promise.resolve(!!opts.docsChanged); },
    },
    KiwiConfig: {
      reload() { calls.push('config'); return opts.down || opts.configDown ? fail() : Promise.resolve(true); },
    },
    KiwiOrderInbox: {
      refresh() { calls.push('orders'); return opts.down ? fail() : Promise.resolve(opts.orders == null ? -1 : opts.orders); },
    },
  });
  return R.run().then((out) => ({ out, calls }));
}

const suite = [
  scenario({ real: false }).then(({ out, calls }) => {
    eq('démo : aucun appel réseau', calls.length, 0);
    ok('démo : reached faux', out.reached === false && out.real === false);
  }),

  scenario({ down: true }).then(({ out }) => {
    ok('tout échoue : reached faux', out.reached === false);
    eq('tout échoue : la phrase avoue', M(out),
      "Serveur injoignable, l'écran garde ce que sait cette tablette");
  }),

  scenario({ orders: 0 }).then(({ out, calls }) => {
    ok('config répond : reached vrai', out.reached === true);
    ok('les quatre sources sont interrogées',
      ['catalog', 'docs', 'config', 'orders'].every((c) => calls.includes(c)));
    ok('l’écran se redessine', calls.includes('repaint'));
  }),

  /* La file répond mais la config non : une réponse suffit à dire « joint ». */
  scenario({ configDown: true, orders: 0 }).then(({ out }) => {
    ok('une seule source jointe suffit', out.reached === true);
  }),

  /* Aucune réponse exploitable : ni config, ni file, ni changement. */
  scenario({ configDown: true, orders: null }).then(({ out }) => {
    ok('rien de joint : on ne conclut rien', out.reached === false);
    ok('… et on ne dit pas « à jour »', M(out) !== 'Déjà à jour');
  }),

  scenario({ catChanged: true, orders: 2 }).then(({ out }) => {
    eq('inventaire changé listé', out.changed.join(','), 'inventaire');
    eq('commandes comptées', out.orders, 2);
  }),

  /* La config a répondu « oui » : elle ne doit PAS être annoncée comme un
   * changement, sinon le bouton dirait « modules à jour » à chaque appui. */
  scenario({ orders: 0 }).then(({ out }) => {
    ok('la config ne se compte pas comme un changement', out.changed.length === 0);
  }),

  /* Un métier sans inventaire (spa, gym…) : le module absent est sauté. */
  scenario({ noCatalog: true, orders: 1 }).then(({ out, calls }) => {
    ok('module absent : sauté sans erreur', !calls.includes('catalog') && out.reached === true);
  }),
];

Promise.all(suite).then(() => {
  if (fails.length) {
    console.log(`\n  ✗ rafraîchir caisse — ${fails.length} échec(s) sur ${pass + fails.length}`);
    fails.forEach((f) => console.log(`     · ${f}`));
    process.exit(1);
  }
  console.log(`  ✓ rafraîchir caisse (${pass} contrôles : honnêteté du message, calcul de « joint », modules absents)`);
}).catch((e) => {
  console.log(`\n  ✗ rafraîchir caisse — ${e && e.message}`);
  process.exit(1);
});
