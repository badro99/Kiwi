#!/usr/bin/env node
/* Garde : un changement de compte efface les remboursements et les données de
 * l'historique à fenêtre d'un magasin (2026-10-22). Les ventes (kiwiSales:)
 * l'étaient déjà ; kiwiRefunds: ne l'était pas, et les clés du résumé serveur
 * (kiwiSalesSummary:, kiwiSalesCoverage:) sont nées sans y être. Sur un
 * appareil partagé, les totaux d'un commerçant restaient chez le suivant. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

const store = new Map(Object.entries({
  'kiwiSales:scoped@santos-store': '[]',
  'kiwiRefunds:scoped@santos-store': '[]',
  'kiwiRefunds:own': '[]',
  'kiwiSalesSummary:v1:santos-store': '[]',
  'kiwiSalesCoverage:santos-store': '1760000000000',
  kiwiLang: 'fr', kiwiTheme: 'dark', kiwiPrinterCfg: '{}',
}));
const localStorage = {
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const window = {};
vm.runInNewContext(read('assets/tenant-purge.js'), { window, localStorage, console });
window.KiwiTenantPurge.purge();
for (const k of ['kiwiSales:scoped@santos-store', 'kiwiRefunds:scoped@santos-store', 'kiwiRefunds:own', 'kiwiSalesSummary:v1:santos-store', 'kiwiSalesCoverage:santos-store']) {
  ok(!store.has(k), k + ' effacée au changement de compte');
}
for (const k of ['kiwiLang', 'kiwiTheme', 'kiwiPrinterCfg']) ok(store.has(k), k + ' (préférence d’appareil) gardée');

/* Toute clé localStorage écrite par sales-history.js tombe sous un préfixe purgé. */
const prefixes = window.KiwiTenantPurge.prefixes;
const src = read('assets/sales-history.js');
const literals = [...src.matchAll(/'(kiwi[A-Za-z]*:[A-Za-z0-9:]*)'/g)].map((m) => m[1]);
ok(literals.length >= 2, 'clés de sales-history.js trouvées (' + literals.join(', ') + ')');
for (const k of literals) ok(prefixes.some((p) => k.startsWith(p)), k + ' couverte par la purge');

console.log('tenant-purge-sales-test: ' + checks + ' contrôles OK');
