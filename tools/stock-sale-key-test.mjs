// Sorties de stock d'une vente : la clé est la vente, pas le numéro imprimé (audit du 26 nov. 2026).
//
// Le numéro de commande revient chaque lundi, le compteur hors ligne à chaque
// service, et toutes les parts d'une division le partagent. Les mouvements
// étaient nommés d'après ce numéro : le registre et le serveur ignorent un
// identifiant déjà vu, donc la deuxième vente « #74 » ne sortait rien, et
// annuler le #74 de cette semaine rendait aussi celui de la semaine passée.
// Rejoué sur les vrais inventory-ledger.js et inventory-consumption.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledger = fs.readFileSync(path.join(ROOT, 'assets/inventory-ledger.js'), 'utf8');
const cons = fs.readFileSync(path.join(ROOT, 'assets/inventory-consumption.js'), 'utf8');
let checks = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); checks += 1; };
function harness() {
  const memory = new Map();
  const localStorage = { getItem: (k) => memory.get(k) ?? null, setItem(k, v) { memory.set(k, String(v)); }, removeItem(k) { memory.delete(k); } };
  const window = { KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'stock-key-resto' }, addEventListener() {} };
  const ctx = vm.createContext({ window, localStorage, navigator: { onLine: false }, console, async fetch() { return { ok: false, status: 0, json: async () => ({}) }; }, Date, setTimeout() {}, clearTimeout() {}, setInterval() {} });
  vm.runInContext(ledger, ctx);
  const I = window.KiwiInventory;
  I.add({ id: 'open-coca', itemId: 'coca', qty: 100, unitCost: 3, reason: 'receipt', occurredTs: 1 });
  I.add({ id: 'open-poulet', itemId: 'poulet', qty: 100, unitCost: 40, reason: 'receipt', occurredTs: 1 });
  window.KiwiCost = { doc: () => ({ ingredients: [{ id: 'stock:poulet', useCost: 40 }], recipes: { tajine: { status: 'complete', lines: [{ ing: 'stock:poulet', qty: 0.25 }] } } }) };
  vm.runInContext(cons, ctx);
  return { I, C: window.KiwiInventoryConsumption };
}
const coca = (qty) => ({ itemId: 'coca', name: 'Coca', qty, total: 15 * qty });
{
  const { I, C } = harness();
  C.record({ id: 'sale-uuid-1', ref: '74', time: Date.parse('2026-11-17T12:00:00Z'), lines: [coca(1)] });
  C.record({ id: 'sale-uuid-2', ref: '74', time: Date.parse('2026-11-24T12:00:00Z'), lines: [coca(2)] });
  eq(I.balance('coca'), 97, 'ticket #74 two Mondays apart takes 1 then 2 Cocas off');
}
{
  const { I, C } = harness();
  for (let i = 0; i < 3; i++) C.record({ id: 'sale-u-split-' + i, ref: 'Table 5 #56', time: Date.now(), lines: [{ itemId: 'tajine', name: 'Tajine · 1/3', qty: Math.round(4 / 3 * 1000) / 1000, total: 120 }, coca(1)] });
  eq(Math.round(I.balance('poulet') * 100) / 100, 99, 'an equal split in three takes the whole recipe off, once per part (to the gram the thirds allow)');
  eq(I.balance('coca'), 97, 'and every part\'s Coca');
}
{
  const { I, C } = harness();
  for (let i = 0; i < 3; i++) C.record({ id: 'sale-a-' + i, ref: 'Table 2 #57', time: Date.now(), lines: [coca(1)] });
  eq(I.balance('coca'), 97, 'a split by article, one Coca per diner');
}
{
  const { I, C } = harness();
  C.record({ id: 's1', ref: '74', time: Date.parse('2026-11-17T12:00:00Z'), lines: [coca(5)] });
  C.record({ id: 's2', ref: '74', time: Date.parse('2026-11-24T12:00:00Z'), lines: [{ itemId: 'tajine', name: 'Tajine', qty: 1, total: 90 }] });
  C.reverse('74', 'Vente sortie des livres', 's2');
  eq(I.balance('coca'), 95, 'voiding this week\'s #74 leaves last week\'s Cocas out');
  eq(Math.round(I.balance('poulet') * 1000) / 1000, 100, 'and gives this week\'s recipe back');
}
{
  const { I, C } = harness();
  const s = { ref: 'Table 5 #56', time: Date.now(), lines: [coca(2)] };
  C.record({ ...s, id: 'pay-1' });
  C.reverse(s.ref, 'Vente sortie des livres', 'pay-1');
  C.record({ ...s, id: 'pay-2' });
  eq(I.balance('coca'), 98, 'a bill voided then paid again takes its Cocas off again');
}
{
  // Une ligne écrite avant la clé par vente ne connaît que le numéro : elle revient encore.
  const { I, C } = harness();
  I.add({ id: 'legacy-row', itemId: 'coca', qty: -3, unitCost: 3, reason: 'sale', refType: 'sale', refId: 'old-9', occurredTs: 2 });
  C.reverse('old-9', 'Vente sortie des livres', 'some-sale-id');
  eq(I.balance('coca'), 100, 'a pre-fix row is still reversed by its ticket number');
}
console.log(`✓ stock-sale-key-test : ${checks} contrôles (numéro réutilisé, divisions, annulation de la bonne vente, ancienne ligne)`);
