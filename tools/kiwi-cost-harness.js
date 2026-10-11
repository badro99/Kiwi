'use strict';
/* Charge le VRAI assets/cost.js dans un contexte vm de test, sur un KiwiStore
 * en mémoire (un document par établissement, lu et écrit tel quel).
 *
 * Les pages d'analyse du restaurant (Performance, Heures de pointe, vue
 * d'ensemble) lisent toutes KiwiCost.ledger : un test qui les rend sans le
 * vrai moteur testerait une copie. On ne teste pas venue-store.js ici.
 *
 *   loadCost(context, { costs, vat })
 *     costs : document `costs` de départ ({ items, recipes, ingredients… })
 *     vat   : { mode:'rate', rate, included } pour KiwiReceipt.config().vat */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCost(context, opts) {
  const o = opts || {};
  const win = context.window;
  const docs = new Map();
  win.KiwiStore = {
    currentVenue: () => 'v-test',
    define(feature, def) {
      const subs = new Set();
      const read = () => (docs.has(feature) ? JSON.parse(docs.get(feature)) : def.blank());
      const write = (d) => { docs.set(feature, JSON.stringify(d)); subs.forEach((f) => f()); return d; };
      return {
        get: read, set: write,
        update(fn) { const d = read(); const n = fn(d); return write(n === undefined ? d : n); },
        subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
        cloud: () => null,
      };
    },
  };
  if (o.costs) docs.set('costs', JSON.stringify(o.costs));
  if (o.vat) win.KiwiReceipt = { config: () => ({ vat: o.vat }) };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'cost.js'), 'utf8'), context, { filename: 'cost.js' });
  return win.KiwiCost;
}

module.exports = { loadCost };
