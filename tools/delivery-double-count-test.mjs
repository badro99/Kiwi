// Tableau de bord : une livraison ne compte qu'une fois, et le résumé serveur dit
// la même chose que le registre local (audit du 26 nov. 2026).
//
//  D1 · le ticket livré à 0 MAD et la vente « Livraison reçue » faisaient deux
//       commandes (panier divisé par deux) ;
//  D2 · en « chiffre à la vente », la livraison comptait au ticket puis encore
//       à « Livraison reçue », et sa part restait en créance pour toujours ;
//  D5 · le résumé serveur reconstruisait les ventes sans leurs parts : un ticket
//       divisé donnait un autre Encaissé / Créances que le registre local.
// Les mêmes lignes passent par functions/api/sales-summary.js › summarize puis
// statsFromSummary, et par statsFromSales comme dateRange.js les lit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { summarize } = await import(pathToFileURL(path.join(ROOT, 'functions/api/sales-summary.js')).href);
const src = fs.readFileSync(path.join(ROOT, 'assets/sales-history.js'), 'utf8');
let checks = 0;
const eq = (a, b, m) => { assert.equal(Math.round(a * 100) / 100, b, m); checks += 1; };
const DAY = 86400000, t = Date.UTC(2026, 10, 3, 12);
const rows = [
  { id: 'dlv-1', ts: t, amount: 0, amount_cents: 0, method: 'delivery', label: 'Robe', channel: 'delivery', payment_parts: JSON.stringify([{ method: 'delivery', amountCents: 50000 }]) },
  { id: 'split-1', ts: t + DAY, amount: 400, amount_cents: 40000, method: 'split', label: 'Caftan', channel: 'counter', payment_parts: JSON.stringify([{ method: 'cash', amountCents: 40000 }, { method: 'compte', amountCents: 60000 }]) },
  { id: 'col-1', ts: t + 7 * DAY, amount: 500, amount_cents: 50000, method: 'transfer', label: 'Livraison reçue · Robe', channel: 'delivery', payment_parts: null },
];
for (const atSale of [false, true]) {
  const win = { KiwiVenue: { revenueAtSale: () => atSale } }; win.window = win;
  vm.runInContext(src.split('/* Optional historical read model')[0], vm.createContext(win));
  const M = win.KiwiSalesMath;
  const probe = summarize(rows, t - 2 * DAY, t + 10 * DAY, 5, 'Africa/Casablanca', atSale).days;
  const from = probe[0].from, to = probe[probe.length - 1].to;
  const { days, splits } = summarize(rows, from, to, 5, 'Africa/Casablanca', atSale);
  const entries = rows.map((r) => ({ ts: r.ts, amount: r.amount_cents / 100, method: r.method, label: r.label, paymentParts: r.payment_parts ? JSON.parse(r.payment_parts) : undefined }));
  // dateRange.js › realSalesList, à la vente : sans les règlements, au prix du ticket.
  const list = atSale ? entries.filter((e) => !M.isSettlement(e)).map((e) => ({ ...e, amount: M.saleValue(e) })) : entries;
  const local = M.statsFromSales(list, [], from, to);
  const server = M.statsFromSummary(days, splits, from, to);
  const mode = atSale ? 'à la vente' : 'encaissé';
  eq(local.count, 2, `${mode} : the delivery is one order (its ticket), the courier's payment is not a second one`);
  eq(local.revenue, atSale ? 1500 : 900, `${mode} : the delivery's 500 counts once`);
  eq(local.basket, atSale ? 750 : 450, `${mode} : the basket is not halved`);
  eq(local.receivable, atSale ? 600 : 0, `${mode} : the courier's part is not a ticket receivable (the deliveries ledger follows it)`);
  for (const k of ['count', 'revenue', 'collected', 'receivable']) eq(server[k], Math.round(local[k] * 100) / 100, `${mode} : the server summary agrees on ${k}`);
}
console.log(`✓ delivery-double-count-test : ${checks} contrôles (une livraison, une commande ; à la vente sans double compte ; résumé serveur = registre local)`);
