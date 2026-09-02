#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const caisse = read('kiwi-caisse.html');
const orderPro = read('OrderPro.html');
const serveur = read('kiwi-serveur.html');

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

const kitchenPaperItems = new Function(`return (${extractFunction(caisse, 'kitchenPaperItems')});`)();
const source = [
  { q: 1, n: 'Prépare ton Plat', kind: 'formula', formulaUid: 'f-1', formulaName: 'Prépare ton Plat', stations: ['kitchen'] },
  { q: 1, n: 'Gnocchi', kind: 'formula-part', formulaUid: 'f-1', formulaName: 'Prépare ton Plat', slotLabel: 'Choose your Pasta', note: '[Prépare ton Plat · Choose your Pasta]', paperNote: '[Prépare ton Plat · Choose your Pasta]', stations: ['kitchen'] },
  { q: 1, n: 'Crema di Formaggi', kind: 'formula-part', formulaUid: 'f-1', formulaName: 'Prépare ton Plat', slotLabel: 'Choose your Sauce', note: '[Prépare ton Plat · Choose your Sauce] · sans ail', paperNote: '[Prépare ton Plat · Choose your Sauce] · sans ail', stations: ['kitchen'] },
  { q: 1, n: 'Coca-Cola', kind: 'formula-part', formulaUid: 'f-1', formulaName: 'Prépare ton Plat', slotLabel: 'Boisson', note: '[Prépare ton Plat · Boisson]', stations: ['bar'] },
  { q: 2, n: 'Harira', note: 'bien chaude', stations: ['kitchen'] },
];

const kitchen = kitchenPaperItems(source, 'kitchen', 'kitchen');
assert.equal(kitchen.length, 2, 'formula is one paper row plus the ordinary dish');
assert.deepEqual(kitchen[0], {
  qty: 1,
  name: 'Prépare ton Plat',
  note: '',
  formulaChoices: [
    { name: 'Gnocchi', note: '' },
    { name: 'Crema di Formaggi', note: 'sans ail' },
  ],
});
assert.deepEqual(kitchen[1], { qty: 2, name: 'Harira', note: 'bien chaude' }, 'ordinary dishes keep their exact paper shape');

const bar = kitchenPaperItems(source, 'bar', 'kitchen');
assert.equal(bar.length, 1, 'the bar receives one headed formula group');
assert.equal(bar[0].name, 'Prépare ton Plat');
assert.deepEqual(bar[0].formulaChoices, [{ name: 'Coca-Cola', note: '' }], 'each station sees only its own formula choices');

const escContext = { window: {} };
vm.createContext(escContext);
vm.runInContext(read('assets/escpos.js'), escContext);
const bytes = escContext.window.KiwiEscPos.kitchenTicket({
  title: 'CUISINE', order: '#5', time: '11:03', paper: '80', items: kitchen,
});
const raw = Buffer.from(bytes);
const text = raw.toString('latin1');
const parentAt = text.indexOf('1× Prépare ton Plat');
const gnocchiAt = text.indexOf('> Gnocchi');
const sauceAt = text.indexOf('> Crema di Formaggi');
assert.ok(parentAt >= 0 && gnocchiAt > parentAt && sauceAt > gnocchiAt, 'paper reads header, then > choices');
assert.equal(text.includes('[Prépare ton Plat'), false, 'technical formula group labels never reach paper');
assert.ok(raw.subarray(Math.max(0, gnocchiAt - 12), gnocchiAt).includes(0x00), 'formula choices use the small 1×1 ESC/POS text size');
assert.ok(text.includes('2× Harira') && text.includes('> bien chaude'), 'ordinary item and note layout remains unchanged');

assert.ok(orderPro.includes("kind: 'formula-part'") && orderPro.includes('formulaUid'), 'OrderPro sends formula identity');
assert.ok(serveur.includes('if (l.kind) linePayload.kind = l.kind') && serveur.includes('if (l.formulaUid) linePayload.formulaUid = l.formulaUid'), 'employee app sends formula identity');
assert.ok(caisse.includes('kind: l.kind || \'\'') && caisse.includes('formulaUid: l.formulaUid || \'\''), 'caisse ingests formula identity from remote inputs');
assert.ok(caisse.includes('byStation.set(sid, kitchenPaperItems(items, sid, fallback))'), 'all paper paths share the same hierarchy formatter');

console.log('✓ Formula kitchen paper hierarchy verified for caisse, OrderPro, and employee orders');
