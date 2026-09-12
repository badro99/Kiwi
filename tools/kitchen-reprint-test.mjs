#!/usr/bin/env node
/* #0063 · « la réimpression manuelle d'un bon de cuisine ne marche pas ».
 *
 * Deux ruptures dans la même chaîne :
 *  1. `printKitchenTickets` construisait `force` et le JETAIT · il ne passait
 *     à la file que `{ remote }`, donc la demande n'atteignait jamais la file ;
 *  2. `enqueue` refuse tout identifiant déjà présent au registre `done`. Cette
 *     garde est ce qui empêche la cuisine de recevoir deux fois le même plat,
 *     et elle a raison · sauf quand un humain demande expressément un
 *     deuxième papier, y compris quand le premier n'est jamais sorti
 *     (bourrage, imprimante éteinte, ticket perdu).
 *
 * Résultat : le caissier appuyait, la caisse affichait « Impression du bon
 * envoyée », et il ne se passait rien du tout.
 *
 * On exécute la vraie file.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
const caisse = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const memory = new Map();
const printed = [];
let printerMode = 'ok';

function boot() {
  const listeners = Object.create(null);
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Promise, Date, JSON, Math, Object, Array, String, Number, Boolean,
    localStorage: {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
    },
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((fn) => fn(event)); },
    KiwiKitchenRelay: { merchant: () => 'mixmax' },
    KiwiPrinter: {
      isConnected: () => true,
      printKitchen(payload) {
        printed.push(payload);
        return Promise.resolve(printerMode === 'ok' ? { ok: true } : { ok: false, reason: 'paper-out' });
      },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'assets/kitchen-print-queue.js' });
  return context;
}

const app = boot();
const job = (extra) => [{
  id: 'ord-table-13:cuisson', createdAt: Date.now(),
  station: 'cuisson', payload: { title: 'CUISSON', order: '#155', items: [{ q: 1, n: 'Pizza' }] },
  ...extra,
}];

/* 1 · Le bon part une fois, et le sondage ne le rejoue pas · la garde qu'on
 *     ne veut surtout pas casser. */
app.KiwiKitchenPrint.enqueue(job(), { remote: false });
await wait();
ok('le bon sort une première fois', printed.length === 1);

app.KiwiKitchenPrint.enqueue(job(), { remote: false });
await wait();
ok('le sondage automatique ne le fait pas ressortir', printed.length === 1);

/* 2 · Le caissier demande expressément un autre papier. */
const reprint = app.KiwiKitchenPrint.enqueue(job(), { remote: false, force: true });
await wait();
ok('une réimpression demandée à la main est acceptée', reprint.accepted === 1);
ok('et le papier sort vraiment', printed.length === 2);
ok('c’est bien le même bon qui ressort',
  printed[1].order === '#155' && printed[1].title === 'CUISSON');

/* 3 · Deux réimpressions de suite · un caissier qui appuie deux fois parce
 *     que la première feuille est partie sous le passe veut deux feuilles. */
app.KiwiKitchenPrint.enqueue(job(), { remote: false, force: true });
await wait();
ok('deux demandes donnent deux papiers', printed.length === 3);

/* 4 · Et le chemin automatique n'a rien perdu de sa garde après tout ça. */
app.KiwiKitchenPrint.enqueue(job(), { remote: false });
await wait();
ok('le registre de déduplication reste intact pour le chemin automatique',
  printed.length === 3);

/* 5 · Le câblage : la caisse doit transmettre `force` à la file. C'est la
 *     moitié qui manquait · elle le construisait puis le jetait. */
ok('la caisse transmet la demande de réimpression à la file',
  /KiwiKitchenPrint\.enqueue\(plan, \{[\s\S]{0,160}?force: !!\(options && options\.force\),/.test(caisse));
ok('le bouton « imprimer le bon » demande bien une réimpression forcée',
  /printKitchenTickets\(local, local\.items \|\| \[\], \{ remote: false, force: true \}\)/.test(caisse));

console.log(`\nkitchen-reprint-test: ${passed} controls passed\n`);
