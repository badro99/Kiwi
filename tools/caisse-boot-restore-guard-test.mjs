#!/usr/bin/env node
/* #0069 · Pasta Corner, 00h55 : « tout l'écran est blanc, on rafraîchit, et
 * toutes les commandes ont disparu ».
 *
 * La reprise du service (`restoreShift` puis `enterShellDirectly`) était
 * appelée à nu au premier niveau du script en ligne de kiwi-caisse.html. Les
 * deux relisent un instantané ET PEIGNENT AVEC. Une exception · un champ
 * inattendu dans le snapshot · remontait hors de l'IIFE, et TOUT ce qui est
 * déclaré en dessous ne s'exécutait jamais : autosave, beforeunload, sondage
 * de salle, écouteurs. Page blanche, muette, définitive. Puis on rouvre un
 * service et le premier autosave écrase l'instantané : la soirée est perdue.
 *
 * Ce contrôle exécute la VRAIE tranche de boot dans un bac à sable et lui fait
 * subir un snapshot qui explose.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

const START = '    /* On load · if a recent shift was saved, resume straight into the shell */';
const END = '    /* Autosave · covers refresh, tab close and crashes.';
const a = source.indexOf(START);
const b = source.indexOf(END, a);
assert.notEqual(a, -1, 'boot restore block found');
assert.notEqual(b, -1, 'autosave block follows it');
const boot = source.slice(a, b);

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };

function run({ snapshot, restoreThrows, session }) {
  const store = new Map([['kiwi-caisse-shift:pasta-corner', JSON.stringify(snapshot)]]);
  const sess = new Map(Object.entries(session || {}));
  const log = { toasts: [], reloads: 0, restored: 0, shell: 0, errors: 0 };
  const ctx = vm.createContext({
    KC_STORE: 'kiwi-caisse-shift:pasta-corner',
    SERVICE_BILL_SYNC_VERSION: 4, ORDER_BRIDGE_SYNC_VERSION: 2,
    journal: [],
    serviceFloorLegacyTables: new Set(),
    operatorCaisseRequested: () => false,
    loadPersistedShift: () => JSON.parse(store.get('kiwi-caisse-shift:pasta-corner')),
    storeIsReal: () => true,
    storePaired: () => ({ merchant: 'pasta-corner' }),
    restoreShift() { log.restored++; if (restoreThrows) throw new TypeError("Cannot read properties of undefined (reading 'name')"); },
    enterShellDirectly() { log.shell++; },
    toast: (msg, kind) => log.toasts.push([msg, kind]),
    setTimeout: (fn) => { try { fn(); } catch (_) {} },
    console: { error() { log.errors++; }, warn() {}, log() {} },
    location: { reload() { log.reloads++; } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    sessionStorage: {
      getItem: (k) => (sess.has(k) ? sess.get(k) : null),
      setItem: (k, v) => sess.set(k, v),
    },
  });
  /* Aucun try/catch autour de l'évaluation : si la tranche de boot laisse
     échapper quoi que ce soit, ce test meurt · exactement comme la caisse. */
  vm.runInContext(boot, ctx);
  return { log, store, sess };
}

const snapshot = {
  v: 1, savedAt: Date.now(), openedAt: new Date().toISOString(),
  merchant: 'pasta-corner', journal: [{ id: 'sale-1' }],
  tableOrders: { 12: [{ name: 'Pasta' }] }, orders: {},
  serviceBillSyncVersion: 4, orderBridgeSyncVersion: 2,
};

/* 1 · Le service se reprend normalement · le chemin de tous les jours. */
{
  const { log } = run({ snapshot, restoreThrows: false });
  ok('un instantané sain reprend le service et entre dans la coquille',
    log.restored === 1 && log.shell === 1 && log.reloads === 0);
  ok('la reprise réussie annonce le nombre de transactions',
    /Service restauré/.test(log.toasts.map((t) => t[0]).join('|')));
}

/* 2 · Un instantané qui fait exploser la peinture. */
const crash = run({ snapshot, restoreThrows: true });
ok('une reprise qui explose ne fait plus tomber le reste du script',
  crash.log.restored === 1);
ok('le service illisible est mis à l’abri avant toute réécriture',
  crash.store.get('kiwi-caisse-shift:pasta-corner:rescue') === JSON.stringify(snapshot));
ok('l’instantané d’origine n’est jamais supprimé',
  crash.store.has('kiwi-caisse-shift:pasta-corner'));
ok('la caisse repart d’une mémoire propre plutôt que de rester blanche',
  crash.log.reloads === 1);
ok('la panne est tracée pour le support', crash.log.errors === 1);

/* 3 · Le tour d'après : le drapeau évite la boucle, la caisse ouvre quand même. */
{
  const { log } = run({
    snapshot, restoreThrows: true,
    session: { kiwiCaisseRestoreFailed: String(snapshot.savedAt) },
  });
  ok('le second passage ne retente pas l’instantané qui tue',
    log.restored === 0 && log.shell === 0);
  ok('et ne recharge pas en boucle', log.reloads === 0);
  ok('le commerçant est prévenu que son service est conservé',
    /conservé/.test(log.toasts.map((t) => t[0]).join('|')) && log.toasts.some((t) => t[1] === 'danger'));
}

/* 4 · Un drapeau d'un AUTRE service ne doit pas bloquer celui-ci. */
{
  const { log } = run({
    snapshot, restoreThrows: false,
    session: { kiwiCaisseRestoreFailed: '1' },
  });
  ok('un échec d’hier ne condamne pas le service d’aujourd’hui', log.restored === 1);
}

/* 5 · Sans sessionStorage (navigation privée), on ne recharge pas : une boucle
 *     de rechargement serait pire que la panne qu'elle prétend soigner. */
{
  const store = new Map([['k', JSON.stringify(snapshot)]]);
  const log = { reloads: 0, toasts: [] };
  const ctx = vm.createContext({
    KC_STORE: 'k', SERVICE_BILL_SYNC_VERSION: 4, ORDER_BRIDGE_SYNC_VERSION: 2,
    journal: [], serviceFloorLegacyTables: new Set(),
    operatorCaisseRequested: () => false,
    loadPersistedShift: () => JSON.parse(store.get('k')),
    storeIsReal: () => true, storePaired: () => ({ merchant: 'pasta-corner' }),
    restoreShift() { throw new Error('boom'); },
    enterShellDirectly() {},
    toast: (m, k) => log.toasts.push([m, k]),
    setTimeout: (fn) => { try { fn(); } catch (_) {} },
    console: { error() {}, warn() {}, log() {} },
    location: { reload() { log.reloads++; } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k),
    },
    sessionStorage: {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    },
  });
  vm.runInContext(boot, ctx);
  ok('sans drapeau possible, la caisse ne se recharge pas en boucle', log.reloads === 0);
  ok('et elle le dit quand même au comptoir', log.toasts.length === 1);
}

console.log(`\ncaisse-boot-restore-guard-test: ${passed} controls passed\n`);
