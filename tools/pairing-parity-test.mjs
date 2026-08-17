#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES DEUX PORTES D'APPAIRAGE LAISSENT LE MÊME ÉTAT
 * ---------------------------------------------------------------------------
 * Un appareil change de commerçant sans que personne ne se connecte. La caisse
 * le fait (assets/caisse-pairing.js → applyPairing) ; l'écran du passe le fait
 * aussi (kiwi-cuisine.html → redeem), sur la MÊME route /api/pair/redeem.
 *
 * Pendant un temps, la cuisine écrivait les quatre clés de l'appairage à la
 * main. Les quatre clés sont la partie visible ; ce qui protège, c'est de
 * CONSTATER le changement de commerce et de faire partir l'état du précédent.
 * La cuisine ne le faisait pas : une tablette ré-appairée du restaurant A au
 * restaurant B gardait, sous le nom de B, les ventes de A (kiwiSales:*), son
 * catalogue, ses établissements, son service en cours — mêmes clés, même
 * origine que la caisse, aucune serrure.
 *
 * Ce contrôle tient l'invariant : UN SEUL écrivain (assets/pairing-commit.js),
 * et les deux portes laissent un localStorage identique.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const COMMIT_SRC = read('assets/pairing-commit.js');
const PURGE_SRC = read('assets/tenant-purge.js');
const CAISSE_SRC = read('assets/caisse-pairing.js');
const CUISINE_SRC = read('kiwi-cuisine.html');
const SW_SRC = read('kiwi-sw.js');

let pass = 0;
function ok(v, msg) {
  if (!v) { console.error('  ✗ ' + msg); process.exitCode = 1; return false; }
  pass++; return true;
}

/* ── 1 · un seul écrivain ────────────────────────────────────────────────────
 * L'invariant qui a été faux. On vise les ÉCRITURES (setItem/put), jamais les
 * lectures : les deux surfaces ont parfaitement le droit de relire l'appairage. */
const WRITES_VENUE = /(?:setItem|put|set)\(\s*['"]kiwiPairedVenue['"]/g;

ok((COMMIT_SRC.match(WRITES_VENUE) || []).length === 1,
  'pairing-commit.js écrit kiwiPairedVenue exactement une fois');
ok(!WRITES_VENUE.test(CUISINE_SRC.replace(/\/\*[\s\S]*?\*\//g, '')),
  'kiwi-cuisine.html n’écrit plus kiwiPairedVenue directement');
ok(!/(?:setItem|put|set)\(\s*['"]kiwiPairedVenue['"]/.test(CAISSE_SRC),
  'caisse-pairing.js n’écrit plus kiwiPairedVenue directement');
ok(/KiwiPairingCommit\s*&&\s*window\.KiwiPairingCommit\.commit|KiwiPairingCommit\.commit/.test(CAISSE_SRC),
  'caisse-pairing.js passe par KiwiPairingCommit.commit');
ok(/KiwiPairingCommit\.commit/.test(CUISINE_SRC),
  'kiwi-cuisine.html passe par KiwiPairingCommit.commit');

/* Hors-ligne : la cuisine est une coquille pré-cachée. Un module d'appairage
 * absent du SHELL, c'est un ré-appairage qui échoue dans une cuisine sans wifi. */
ok(/<script src="assets\/pairing-commit\.js\?v=\d+" defer><\/script>/.test(CUISINE_SRC),
  'kiwi-cuisine.html charge pairing-commit.js');
ok(/<script src="assets\/tenant-purge\.js\?v=\d+" defer><\/script>/.test(CUISINE_SRC),
  'kiwi-cuisine.html charge tenant-purge.js');

/* Les deux copies d'une estampille doivent s'accorder, sinon l'entrée
 * pré-cachée ne répond jamais à la balise et le hors-ligne tombe en silence.
 * tenant-purge.js était SANS estampille : la liste des clés purgées ne pouvait
 * donc plus bouger — un ajout n'atteignait jamais un navigateur déjà venu. */
for (const asset of ['pairing-commit', 'tenant-purge']) {
  const page = (CUISINE_SRC.match(new RegExp(`assets/${asset}\\.js\\?v=(\\d+)`)) || [])[1];
  const shell = (SW_SRC.match(new RegExp(`'/assets/${asset}\\.js\\?v=(\\d+)'`)) || [])[1];
  ok(page && shell && page === shell,
    `l’estampille ${asset}.js s’accorde entre la page et le SHELL (page=${page} sw=${shell})`);
}

/* La file du passe est la donnée d'un commerçant : elle doit partir à la purge. */
ok(/kiwiCuisineCookingV2/.test(PURGE_SRC),
  'tenant-purge.js emporte la file du passe (kiwiCuisineCookingV2)');
ok(!/['"]kiwiCuisineMute['"]/.test(PURGE_SRC.split('PRESERVE')[0]),
  'tenant-purge.js NE purge PAS le son coupé — préférence de l’appareil');

/* ── 2 · l'environnement ─────────────────────────────────────────────────── */
const FIXED_NOW = 1_755_000_000_000;

function makeStore(seed = {}) {
  const memory = new Map(Object.entries(seed));
  return {
    memory,
    api: {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
      key: (i) => Array.from(memory.keys())[i] ?? null,
      get length() { return memory.size; },
    },
  };
}

function boot(store) {
  const events = [];
  const window = {
    localStorage: store.api,
    KiwiReportError: () => {},
  };
  window.window = window;
  const ctx = vm.createContext({
    window,
    localStorage: store.api,
    document: { dispatchEvent: (e) => events.push(e) },
    CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
    Date: { now: () => FIXED_NOW },
    JSON, String, Object, Array, Number, Boolean, Math, console,
  });
  vm.runInContext(PURGE_SRC, ctx);
  vm.runInContext(COMMIT_SRC, ctx);
  return { commit: window.KiwiPairingCommit.commit, purge: window.KiwiTenantPurge, events, window };
}

/* Ce que /api/pair/redeem renvoie réellement — merchant/type/subtype/name, pas
   davantage (functions/api/pair/redeem.js). Les deux surfaces reçoivent CECI. */
const API_RESPONSE_B = { ok: true, merchant: 'restaurant-b', type: 'restaurant', subtype: 'pizzeria', name: 'Chez B' };

/* L'état qu'une tablette accumule chez le commerce A. */
function residueOfA() {
  return {
    kiwiPaired: '1',
    kiwiLive: '1',
    kiwiLiveMerchant: 'restaurant-a',
    kiwiPairedVenue: JSON.stringify({ merchant: 'restaurant-a', venueId: 'v-a', type: 'restaurant', subtype: '', name: 'Chez A', location: 'Casablanca' }),
    'kiwiSales:scoped@restaurant-a': '[{"total":450}]',
    'kiwi:bqDay': '{"count":7}',
    'kiwiBoutiqueCatalog:restaurant-a': '[{"sku":"A-1"}]',
    kiwiCustomVenues: '[{"slug":"restaurant-a"}]',
    kiwiPins: '[{"name":"Amira"}]',
    'kiwi-caisse-shift': '{"journal":"A"}',
    kiwiCuisineCookingV2: '["bon-A-12"]',
    /* Ce qui doit SURVIVRE : l'appareil, pas le commerçant. */
    'kiwi:posDevice': 'tablette-passe-01',
    kiwiCuisineMute: '1',
    kiwiTheme: 'dark',
  };
}

/* ── 3 · la porte cuisine purge bien le commerce précédent ───────────────── */
{
  const store = makeStore(residueOfA());
  const { commit } = boot(store);
  let hookSawSwitch = false;
  const res = commit('123456', API_RESPONSE_B, { onTenantSwitch: () => { hookSawSwitch = true; } });

  ok(res.ok && res.switched === true, 'cuisine : un autre commerce est constaté comme un changement');
  ok(hookSawSwitch, 'cuisine : le crochet local est appelé au changement');
  ok(store.memory.get('kiwiLiveMerchant') === 'restaurant-b', 'cuisine : le nouveau commerçant est posé');

  for (const dead of ['kiwiSales:scoped@restaurant-a', 'kiwi:bqDay', 'kiwiBoutiqueCatalog:restaurant-a',
    'kiwiCustomVenues', 'kiwiPins', 'kiwi-caisse-shift', 'kiwiCuisineCookingV2']) {
    ok(!store.memory.has(dead), `cuisine : « ${dead} » du commerce précédent est parti`);
  }
  ok(store.memory.get('kiwi:posDevice') === 'tablette-passe-01',
    'cuisine : l’identité matérielle de la tablette survit à la purge');
  ok(store.memory.get('kiwiCuisineMute') === '1', 'cuisine : le son coupé survit (préférence appareil)');
  ok(store.memory.get('kiwiTheme') === 'dark', 'cuisine : le thème survit (préférence appareil)');
}

/* ── 4 · LE CONTRÔLE : les deux portes laissent le MÊME état ─────────────────
 * Même résidu de départ, même réponse serveur, deux surfaces. Ce qui diffère
 * légitimement est le crochet local de chacune ; l'état partagé, lui, doit être
 * identique clé pour clé. C'est l'invariant que la duplication avait rompu. */
{
  const caisse = makeStore(residueOfA());
  const cuisine = makeStore(residueOfA());

  // Porte caisse : le crochet oublie le caissier (hors localStorage partagé).
  boot(caisse).commit('123456', API_RESPONSE_B, {
    onTenantSwitch: () => { /* setStaff(null) — sessionStorage, pas localStorage */ },
  });
  // Porte cuisine : le crochet vide la mémoire vive de la page.
  boot(cuisine).commit('123456', API_RESPONSE_B, {
    onTenantSwitch: () => { /* S.cooking/S.orders — mémoire vive, pas localStorage */ },
  });

  const snap = (s) => JSON.stringify(Object.fromEntries([...s.memory.entries()].sort()));
  ok(snap(caisse) === snap(cuisine),
    'PARITÉ : caisse et cuisine laissent un localStorage identique après appairage');

  const venue = JSON.parse(caisse.memory.get('kiwiPairedVenue'));
  ok(['merchant', 'venueId', 'type', 'subtype', 'name', 'location'].every((k) => k in venue),
    'les deux portes écrivent la forme canonique à six champs');
  ok(venue.merchant === 'restaurant-b' && venue.venueId === '' && venue.location === '',
    'les champs absents de la réponse serveur sont posés vides, jamais undefined');

  const map = JSON.parse(caisse.memory.get('kiwiPairings'));
  ok(map['123456'] && map['123456'].status === 'connected',
    'les deux portes reflètent « connectée » dans kiwiPairings');
}

/* ── 5 · ré-appairage au MÊME commerce : on ne purge pas ─────────────────── */
{
  const store = makeStore({
    kiwiPairedVenue: JSON.stringify({ merchant: 'restaurant-b', venueId: '', type: '', subtype: '', name: 'Chez B', location: '' }),
    'kiwiSales:scoped@restaurant-b': '[{"total":120}]',
  });
  const { commit } = boot(store);
  const res = commit('123456', API_RESPONSE_B, {});
  ok(res.switched === false, 'même commerce ⇒ aucun changement de locataire');
  ok(store.memory.get('kiwiSales:scoped@restaurant-b') === '[{"total":120}]',
    'même commerce ⇒ ses propres ventes ne sont PAS effacées');
}

/* ── 6 · un premier appairage ne purge rien ─────────────────────────────── */
{
  const store = makeStore({ kiwiTheme: 'dark' });
  const { commit, events } = boot(store);
  const res = commit('123456', API_RESPONSE_B, {});
  ok(res.switched === false, 'appareil vierge ⇒ aucun changement de locataire');
  ok(store.memory.get('kiwiPaired') === '1', 'appareil vierge ⇒ l’appairage est posé');
  ok(events.some((e) => e.type === 'kiwi-paired' && e.detail.merchant === 'restaurant-b'),
    'l’événement kiwi-paired est annoncé pour que les surfaces repeignent');
}

if (process.exitCode) console.error(`\n  ${pass} contrôles verts, au moins un rouge`);
else console.log(`  ✓ pairing-parity — ${pass} contrôles verts`);
