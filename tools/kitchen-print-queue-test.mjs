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
const printed = [];

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
    KiwiPrinter: {
      isConnected: () => true,
      printKitchen(payload) {
        printed.push(payload);
        if (printerMode === 'throw') return Promise.reject(new Error('bridge-offline'));
        return Promise.resolve(printerMode === 'ok' ? { ok: true, via: 'bridge' } : { ok: false, reason: 'paper-out' });
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

app.KiwiKitchenPrint.setHub(true);
result = app.KiwiKitchenPrint.enqueue([
  { id: 'ord-before-hub:cuisson', createdAt: Date.now() - 60_000, payload: { title: 'ANCIEN', items: [] } },
], { remote: true });
ok('activer le hub au milieu du service ne réimprime pas les anciens bons', result.accepted === 0 && printed.length === 0);

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
ok('chaque poste reçoit son propre bon', printed.length === 2 && printed[0].title === 'CUISSON' && printed[1].title === 'BAR');
ok('un article réservé aux formules imprime comme tout autre composant de formule',
  printed[0].items.some((item) => item.name === 'Dessert formule' && item.kind === 'formula-part' && item.price === 0));
ok('le reçu conserve son contrat parent-only sans règle spéciale formulaOnly',
  /l\.kind !== 'formula-part'/.test(caisse) && !/formulaOnly/.test(receipt));
ok('la file est vide seulement après les deux confirmations réelles', app.KiwiKitchenPrint.pending() === 0);

app.KiwiKitchenPrint.enqueue([
  { id: 'ord-server-2:cuisson', createdAt: now, payload: { title: 'CUISSON', items: [] } },
], { remote: true });
await wait();
ok('le même ordre revenu du polling ne ressort jamais', printed.length === 2);

app = boot();
app.KiwiKitchenPrint.enqueue([
  { id: 'ord-server-2:bar', createdAt: now, payload: { title: 'BAR', items: [] } },
], { remote: true });
await wait();
ok('le registre anti-doublon survit à un rafraîchissement', printed.length === 2);

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

merchantState.value = 'restaurant-rival';
app = boot();
ok('la file et les confirmations sont isolées par commerçant', app.KiwiKitchenPrint.pending() === 0 && !app.KiwiKitchenPrint._alreadyDone('ord-server-2:bar'));

ok('la caisse charge la file durable après le relais canonique',
  /kitchen-relay\.js[^]*kitchen-print-queue\.js/.test(caisse));
ok('les commandes distantes acceptées appellent bien le papier',
  /o\.status === 'accepted'\) printKitchenTickets\(t, t\.items, \{[^]*?remote: true/.test(caisse));
ok('une commande en attente devenue acceptée déclenche aussi son bon',
  /o\.status === 'accepted' && known\.status === 'held'[^]*?printKitchenTickets\(known/.test(caisse));
ok('l’impression locale relaie d’abord l’ordre pour partager son identifiant idempotent',
  /relayToKitchen\(order\);\s*printKitchenTickets\(order, items\)/.test(caisse));
ok('le réglage explique qu’un seul ordinateur doit être hub',
  /Activez cette option sur un seul ordinateur par établissement/.test(bridge));
const stampMatch = caisse.match(/assets\/kitchen-print-queue\.js\?v=(\d+)/);
ok('la caisse charge la file d’impression avec estampille', !!stampMatch);
ok('la caisse et le service worker s’accordent sur l’estampille de la file d’impression',
  !!(stampMatch && sw.includes(`'/assets/kitchen-print-queue.js?v=${stampMatch[1]}'`)));

if (fail.length) {
  fail.forEach((line) => console.error('  ✗ ' + line));
  console.error(`\n✗ impression cuisine automatique : ${pass} ok, ${fail.length} échec(s)`);
  process.exit(1);
}
console.log(`  ✓ impression cuisine automatique (${pass} contrôles : hub unique, activation sans rejeu, postes, déduplication, panne/reprise, multi-tenant, câblage hors ligne)`);
