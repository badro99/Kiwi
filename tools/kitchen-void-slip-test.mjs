#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
/* « ANNULÉ » sur le papier de la cuisine (kiwi-caisse.html · printKitchenVoid).
 *
 * Un plat annulé après son envoi n'était annoncé qu'à l'écran cuisine. Une
 * cuisine qui travaille au papier gardait le bon imprimé et préparait le
 * plat. On prouve, avec les vraies fonctions de la caisse :
 *   · le bon part par la même file que l'envoi, vers la station du plat ;
 *   · il dit ANNULÉ, la table, une unité du plat et sa note ;
 *   · rejouer la même annulation produit le même identifiant de bon (la file
 *     déduplique : pas de second bon) ;
 *   · une formule part avec ses choix pour une unité, à chaque station ;
 *   · rien n'est imprimé avant que le serveur ait confirmé l'annulation, ni
 *     quand elle attend l'accord de la cuisine, ni quand elle a échoué. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const caisse = caisseTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓ ' + msg); };

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

const jobs = [];
const ctx = {
  window: {}, console, Date, Math, Map, String, Number, Array, Object,
  cart: [], tableOrders: {},
  KiwiKitchenPrint: null,
  kdsStations: () => [{ id: 'kitchen', name: 'Cuisine' }, { id: 'bar', name: 'Bar' }],
  kdsStationFor: () => 'kitchen',
  menuLineFind: () => null,
  optVisuals: () => [],
  kitchenNote: (l) => (l.note || '').trim(),
  pad2HO: (n) => String(n).padStart(2, '0'),
  toast: () => {},
};
ctx.window.KiwiKitchenPrint = { enqueue: (plan, opts) => { jobs.push({ plan, opts }); return { accepted: plan.length }; } };
ctx.KiwiKitchenPrint = ctx.window.KiwiKitchenPrint;
vm.createContext(ctx);
for (const fn of ['kitchenPaperItems', 'kitchenItemsFromLines', 'printKitchenTickets', 'printKitchenVoid']) vm.runInContext(extractFunction(caisse, fn), ctx);

console.log('\n■ Le bon d’annulation');
{
  ctx.tableOrders = { 4: [{ id: 'taj', name: 'Tajine poulet', qty: 3, price: 70, note: 'sans olives', sent: true, station: 'kitchen' }] };
  const line = ctx.tableOrders[4][0];
  ctx.printKitchenVoid('4', line, 'voi-abc', { tableId: '4' }, 3);
  ok(jobs.length === 1 && jobs[0].plan.length === 1, 'one slip, for the one station that cooks the dish');
  const job = jobs[0].plan[0];
  ok(job.id === 'void-voi-abc:kitchen' && job.station === 'kitchen', `keyed by the cancellation, on the dish's station (${job.id})`);
  ok(job.payload.title === 'ANNULÉ · CUISINE', `it says ANNULÉ first (${job.payload.title})`);
  ok(job.payload.table === 'Table 4' && job.payload.order === '', 'it names the table, and prints no « #undefined »');
  ok(JSON.stringify(job.payload.items) === JSON.stringify([{ qty: 1, name: 'Tajine poulet', note: 'sans olives' }]), 'one unit of the dish, with its note to find the right plate');
  ok(jobs[0].opts.force === false, 'a normal job: the queue still deduplicates it');
  ctx.printKitchenVoid('4', line, 'voi-abc', { tableId: '4' }, 3);
  ok(jobs[1].plan[0].id === job.id, 'the same cancellation replayed is the same job id: the queue prints it once');
}
{
  jobs.length = 0;
  ctx.tableOrders = { 7: [
    { id: 'menu', name: 'Menu midi', qty: 2, price: 90, kind: 'formula', formulaUid: 'f1', formulaName: 'Menu midi', sent: true, station: 'kitchen' },
    { id: 'pasta', name: 'Gnocchi', qty: 2, price: 0, kind: 'formula-part', formulaUid: 'f1', formulaName: 'Menu midi', slotLabel: 'Plat', sent: true, station: 'kitchen' },
    { id: 'coca', name: 'Coca-Cola', qty: 2, price: 0, kind: 'formula-part', formulaUid: 'f1', formulaName: 'Menu midi', slotLabel: 'Boisson', sent: true, station: 'bar' },
  ] };
  ctx.printKitchenVoid('7', ctx.tableOrders[7][0], 'voi-f', { tableId: '7' }, 2);
  const byStation = Object.fromEntries(jobs[0].plan.map((j) => [j.station, j.payload]));
  ok(byStation.kitchen && byStation.bar, 'a formula reaches every station that prepares a part of it');
  ok(byStation.kitchen.items[0].qty === 1 && byStation.kitchen.items[0].formulaChoices.map((c) => c.name).join() === 'Gnocchi', 'kitchen: one menu, its pasta');
  ok(byStation.bar.title === 'ANNULÉ · BAR' && byStation.bar.items[0].formulaChoices[0].name === 'Coca-Cola', 'bar: ANNULÉ, its drink');
  jobs.length = 0;
  ctx.printKitchenVoid('7', ctx.tableOrders[7][1], 'voi-p', { tableId: '7' }, 2);
  ok(jobs.length === 0, 'a formula part alone prints nothing: the formula carries it');
}

console.log('\n■ Seulement quand l’annulation est faite');
{
  const fn = extractFunction(caisse, 'cancelCaisseLineImmediately');
  const at = (s) => fn.indexOf(s);
  const call = at('printKitchenVoid(tableId, line, voidRequestId');
  ok(call > at("if (!Array.isArray(data.remainingLines)) throw"), 'printed only after the server returned the remaining lines');
  ok(call > at('if (data && data.alertSent)') && fn.slice(at('if (data && data.alertSent)'), at('if (!Array.isArray(data.remainingLines))')).indexOf('printKitchenVoid') < 0, 'not while the cancellation waits for the kitchen');
  ok(fn.slice(at('} catch (err) {')).split('/* Local demo')[0].indexOf('printKitchenVoid') < 0, 'not when the cancellation failed');
  ok(at('const voidRequestId = line.cancelRequestId;') > 0 && at('const voidRequestId = line.cancelRequestId;') < at('delete line.cancelRequestId;\n          toast(`${line.name} annulé en cuisine`)'), 'keyed by the request id, read before it is cleared');
}

console.log('\n■ Sur le papier');
{
  const w = {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/escpos.js'), 'utf8'), vm.createContext({ window: w }));
  const bytes = Buffer.from(w.KiwiEscPos.kitchenTicket({ paper: '80', title: 'ANNULÉ · CUISINE', table: 'Table 4', items: [{ qty: 1, name: 'Tajine poulet', note: 'sans olives' }] }));
  const text = bytes.toString('latin1');
  ok(text.includes('ANNULÉ \u0097 CUISINE') || text.includes('ANNULÉ'), 'the printer gets « ANNULÉ » in its own code page');
  ok(text.includes('1× Tajine poulet') || text.includes('1× Tajine poulet'), 'and the dish, one unit');
}

console.log(`\nkitchen-void-slip: ${pass} passed`);
