#!/usr/bin/env node
/* Kiwi · automatic kitchen-paper queue
 * Durable paper is tested separately from the network order relay: a retry
 * must not become a duplicate, a refresh must remember completed jobs, and a
 * newly activated hub must not replay the restaurant's recent service. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
const caisse = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const bridge = fs.readFileSync(path.join(ROOT, 'assets/printer-bridge.js'), 'utf8');
const receipt = fs.readFileSync(path.join(ROOT, 'assets/receipt.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
let pass = 0; const fail = [];
function ok(label, condition, detail = '') {
  if (condition) pass += 1;
  else fail.push(label + (detail ? ' — ' + detail : ''));
}
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const memory = new Map();
const localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
const merchantState = { value: 'amira-cafe' };
let printerMode = 'ok';
let printerConnected = true;
const printed = [];
const receipts = [];
const legacyReceipts = [];

function boot() {
  const listeners = Object.create(null);
  const context = {
    console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean,
    localStorage,
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((fn) => fn(event)); },
    KiwiKitchenRelay: { merchant: () => merchantState.value },
    KiwiReceipt: {
      print(payload) {
        receipts.push(payload);
        if (printerMode === 'throw') return Promise.reject(new Error('bridge-offline'));
        return Promise.resolve(printerMode === 'ok' ? { ok: true, via: 'socket' } : { ok: false, reason: 'paper-out' });
      },
    },
    KiwiPrinter: {
      isConnected: () => printerConnected,
      printKitchen(payload) {
        printed.push(payload);
        if (printerMode === 'throw') return Promise.reject(new Error('bridge-offline'));
        return Promise.resolve(printerMode === 'ok' ? { ok: true, via: 'bridge' } : { ok: false, reason: 'paper-out' });
      },
      printReceipt(payload) {
        legacyReceipts.push(payload);
        if (printerMode === 'throw') return Promise.reject(new Error('bridge-offline'));
        return Promise.resolve(printerMode === 'ok' ? { ok: true, via: 'socket' } : { ok: false, reason: 'paper-out' });
      },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'assets/kitchen-print-queue.js' });
  return context;
}

let app = boot();
let result = app.KiwiKitchenPrint.enqueue([
  { id: 'ord-phone-1:cuisson', createdAt: Date.now(), payload: { title: 'CUISSON', items: [] } },
], { remote: true });
ok('un poste non désigné ne vole pas les bons des autres caisses', result.skipped === 'not-print-hub');
ok('aucun papier distant ne sort sans hub explicite', printed.length === 0);

result = app.KiwiKitchenPrint.enqueue([
  { id: 'ord-employee-connected:cuisson', createdAt: Date.now(), payload: { title: 'CUISSON', items: [{ name: 'Tajine serveur' }] } },
], { remote: 'connected' });
ok('Lancer la commande imprime sur la caisse dont la cuisine est connectée', result.accepted === 1);
await wait(90);
ok('le bon employé sort sans confirmation caisse ni hub manuel',
  printed.length === 1 && printed[0].items[0].name === 'Tajine serveur');
app.KiwiKitchenPrint.enqueue([
  { id: 'ord-employee-connected:cuisson', createdAt: Date.now(), payload: { title: 'CUISSON', items: [{ name: 'Tajine serveur' }] } },
], { remote: 'connected' });
await wait();
ok('le polling du même bon employé ne le réimprime pas', printed.length === 1);

app.KiwiKitchenPrint.setHub(true);
result = app.KiwiKitchenPrint.enqueue([
  { id: 'ord-before-hub:cuisson', createdAt: Date.now() - 60_000, payload: { title: 'ANCIEN', items: [] } },
], { remote: true });
ok('activer le hub au milieu du service ne réimprime pas les anciens bons', result.accepted === 0 && printed.length === 1);

const now = Date.now() + 20;
result = app.KiwiKitchenPrint.enqueue([
  { id: 'ord-server-2:cuisson', createdAt: now, payload: { title: 'CUISSON', items: [
    { name: 'Tajine' },
    { name: 'Dessert formule', kind: 'formula-part', formulaName: 'Brunch', price: 0 },
  ] } },
  { id: 'ord-server-2:bar', createdAt: now, payload: { title: 'BAR', items: [{ name: 'Thé' }] } },
], { remote: true });
ok('un bon accepté sur téléphone entre dans la file du hub', result.accepted === 2);
await wait(190);
ok('chaque poste reçoit son propre bon', printed.length === 3 && printed[1].title === 'CUISSON' && printed[2].title === 'BAR');
ok('un article réservé aux formules imprime comme tout autre composant de formule',
  printed[1].items.some((item) => item.name === 'Dessert formule' && item.kind === 'formula-part' && item.price === 0));
ok('le reçu conserve son contrat parent-only sans règle spéciale formulaOnly',
  /l\.kind !== 'formula-part'/.test(caisse) && !/formulaOnly/.test(receipt));
ok('la file est vide seulement après les deux confirmations réelles', app.KiwiKitchenPrint.pending() === 0);

app.KiwiKitchenPrint.enqueue([
  { id: 'ord-server-2:cuisson', createdAt: now, payload: { title: 'CUISSON', items: [] } },
], { remote: true });
await wait();
ok('le même ordre revenu du polling ne ressort jamais', printed.length === 3);

app = boot();
app.KiwiKitchenPrint.enqueue([
  { id: 'ord-server-2:bar', createdAt: now, payload: { title: 'BAR', items: [] } },
], { remote: true });
await wait();
ok('le registre anti-doublon survit à un rafraîchissement', printed.length === 3);

printerMode = 'fail';
app.KiwiKitchenPrint.enqueue([
  { id: 'ord-local-3:cuisson', createdAt: Date.now(), payload: { title: 'PANNE PAPIER', items: [] } },
]);
await wait();
ok('une panne conserve le bon au lieu de prétendre qu’il est imprimé', app.KiwiKitchenPrint.pending() === 1 && app.KiwiKitchenPrint.status().lastError === 'paper-out');
const attemptsAfterFailure = printed.length;
printerMode = 'ok';
await app.KiwiKitchenPrint.retryNow();
await wait();
ok('la relance imprime le bon conservé', printed.length === attemptsAfterFailure + 1 && app.KiwiKitchenPrint.pending() === 0);
app.KiwiKitchenPrint.retryNow();
await wait();
ok('relancer après succès ne fabrique pas une copie', printed.length === attemptsAfterFailure + 1);

// The bridge readiness hint can briefly be stale while its merchant/printer
// configuration is loading. Encaisser must still attempt the real transport
// immediately; otherwise the ticket waits for an unrelated later UI action.
printerConnected = false;
const beforeStaleHint = printed.length;
app.KiwiKitchenPrint.enqueue([
  { id: 'op-takeout-paid-stale-hint:cuisson', createdAt: Date.now(), payload: { title: 'CUISSON', items: [{ name: 'Tajine' }] } },
]);
await wait();
ok('encaisser un OrderPro à emporter tente immédiatement le transport même si le témoin de connexion est périmé',
  printed.length === beforeStaleHint + 1 && app.KiwiKitchenPrint.pending() === 0);
printerConnected = true;

merchantState.value = 'restaurant-rival';
app = boot();
ok('la file et les confirmations sont isolées par commerçant', app.KiwiKitchenPrint.pending() === 0 && !app.KiwiKitchenPrint._alreadyDone('ord-server-2:bar'));

merchantState.value = 'amira-cafe';
app = boot();
const receiptDoc = {
  shop: { name: 'Amira Cafe', contact: ['Casablanca'], legal: ['ICE 001122334455667'] },
  lines: [{ name: 'Ice Tea', qty: 1, total: 28 }],
  totals: { subtotal: 28, discount: 0, promo: 0, tip: 0, total: 28, vat: null },
  ref: 'R-1042', customer: 'ne-doit-pas-sortir',
};
result = app.KiwiKitchenPrint.enqueueReceipt('sale-1042', receiptDoc, 'original');
await wait();
ok('le reçu original utilise la même file durable', result.accepted === 1 && app.KiwiKitchenPrint._alreadyDone('sale-1042:original'));
ok('la file confie le document structuré au moteur de reçu canonique',
  receipts.some((doc) => doc.shop && doc.shop.name === 'Amira Cafe'
    && doc.lines && doc.lines[0].total === 28 && doc.totals && doc.totals.total === 28));
ok('le document structuré ne passe jamais dans l’ancien encodeur plat', legacyReceipts.length === 0);
result = app.KiwiKitchenPrint.enqueueReceipt('sale-1042', receiptDoc, 'original');
await wait();
ok('un retry du reçu original garde le même identifiant logique', result.accepted === 0 && app.KiwiKitchenPrint._alreadyDone('sale-1042:original'));
app.KiwiKitchenPrint.enqueueReceipt('sale-1042', receiptDoc, 'manual-reprint');
app.KiwiKitchenPrint.enqueueReceipt('sale-1042', receiptDoc, 'manual-reprint');
await wait(190);
ok('les réimpressions volontaires reçoivent une séquence monotone par vente',
  app.KiwiKitchenPrint._alreadyDone('sale-1042:manual-reprint:1') && app.KiwiKitchenPrint._alreadyDone('sale-1042:manual-reprint:2'));
const diagnostic = app.KiwiKitchenPrint.exportDiagnostics();
ok('le recorder exporte les transitions sans contenu de reçu', /"state"/.test(diagnostic) && !diagnostic.includes('ne-doit-pas-sortir') && !diagnostic.includes('R-1042'));

const ownDevice = memory.get('kiwi:caisse:terminal-id:v1');
memory.set('kiwiKitchenPrintHubV1', JSON.stringify({ enabled: true, merchant: 'amira-cafe', deviceId: 'other-device', expiresAt: Date.now() + 30000 }));
ok('un second appareil ne vole pas un bail vivant', app.KiwiKitchenPrint.setHub(true) === false);
memory.set('kiwiKitchenPrintHubV1', JSON.stringify({ enabled: true, merchant: 'amira-cafe', deviceId: 'other-device', expiresAt: Date.now() - 1 }));
ok('le même appareil reprend le hub seulement après expiration', app.KiwiKitchenPrint.setHub(true) === true && memory.get('kiwiKitchenPrintHubV1').includes(ownDevice));

/* An OrderPro order accepted or paid on this caisse is no longer a passive
   remote replay: the operator explicitly chose this device, so it must print
   here even when another device owns the remote-hub lease. The canonical
   OrderPro id still makes a retry a no-op. */
merchantState.value = 'operator-action-cafe';
app = boot();
const beforeLocalOrderPro = printed.length;
result = app.KiwiKitchenPrint.enqueue([
  { id: 'orderpro-local-action:cuisson', createdAt: Date.now(), payload: { title: 'CUISSON', items: [{ name: 'Pasta' }] } },
], { remote: false });
await wait(90);
ok('le clic caisse imprime le bon OrderPro sans bail de hub',
  result.accepted === 1 && printed.length === beforeLocalOrderPro + 1);
app.KiwiKitchenPrint.enqueue([
  { id: 'orderpro-local-action:cuisson', createdAt: Date.now(), payload: { title: 'CUISSON', items: [{ name: 'Pasta' }] } },
], { remote: false });
await wait();
ok('le même identifiant OrderPro ne réimprime jamais le bon', printed.length === beforeLocalOrderPro + 1);

ok('la caisse charge la file durable après le relais canonique',
  /kitchen-relay\.js[^]*kitchen-print-queue\.js/.test(caisse));
ok('les commandes distantes acceptées appellent bien le papier',
  /o\.status === 'accepted'\) printKitchenTickets\(t, t\.items, \{[^]*?o\.mode === 'table' && o\.session && o\.server \? 'connected' : true/.test(caisse));
ok('une commande lancée ou acceptée par un serveur imprime sans second geste caisse',
  /options\.remote === 'connected' && !isHub\(\) && !printerReady\(\)/.test(source)
  && /remote: options\.remote === true \|\| options\.remote === 'connected'/.test(source));
ok('la caisse qui accepte imprime localement sans exiger le bail du hub',
  /confirmAccepted\(order\)[^]*?localKitchenAction: true/.test(caisse));
ok('une commande en attente devenue acceptée déclenche aussi son bon',
  /o\.status === 'accepted' && known\.status === 'held'[^]*?printKitchenTickets\(known/.test(caisse));
ok('l’impression locale relaie d’abord l’ordre pour partager son identifiant idempotent',
  /relayToKitchen\(order\)\.then\(\(\) => printKitchenTickets\(order, items\)\)/.test(caisse));
ok('le réglage explique qu’un seul ordinateur doit être hub',
  /Activez cette option sur un seul ordinateur par établissement/.test(bridge));
const stampMatch = caisse.match(/assets\/kitchen-print-queue\.js\?v=(\d+)/);
ok('la caisse charge la file d’impression avec estampille', !!stampMatch);
ok('la caisse et le service worker s’accordent sur l’estampille de la file d’impression',
  !!(stampMatch && sw.includes(`'/assets/kitchen-print-queue.js?v=${stampMatch[1]}'`)));
ok('la persistance native écrit un registre app-support et importe le stockage web une fois',
  /ledgerRead/.test(source) && /ledgerWrite/.test(source) && /native-restored/.test(source));
ok('la caisse route désormais les reçus vers la file partagée',
  /enqueueReceipt\(entry\.id, doc, opts && opts\.copy \? 'manual-reprint' : 'original'\)/.test(caisse));

if (fail.length) {
  fail.forEach((line) => console.error('  ✗ ' + line));
  console.error(`\n✗ impression cuisine automatique : ${pass} ok, ${fail.length} échec(s)`);
  process.exit(1);
}
console.log(`  ✓ impression cuisine automatique (${pass} contrôles : hub unique, activation sans rejeu, postes, déduplication, panne/reprise, multi-tenant, câblage hors ligne)`);
