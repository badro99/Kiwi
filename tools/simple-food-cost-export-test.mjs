#!/usr/bin/env node
import { deadlineVmSource } from './deadline-vm-source.mjs';
/* Coût simple · l'export CSV suit la langue et dit quand le fichier n'a pas pu être créé.
 *
 * r20 : n2() écrivait toujours « 60,00 » (fr-FR), même pour un export anglais ;
 * download() avalait l'échec du Blob / de l'URL et rendait le texte sans rien
 * dire. On exécute le vrai simple-food-cost.js, on clique les vrais boutons
 * d'export et on lit le fichier créé et la bannière. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const listeners = {};
const stub = () => ({ innerHTML: '', children: {}, querySelector(sel) { const m = sel.match(/^\[data-sfc-linecost="(\d+)"\]$/); if (m) return (this.children['lc' + m[1]] ||= stub()); if (sel === '[data-sfc-summary-host]') return (this.children.s ||= stub()); return null; } });
const root = stub();
let mounted = false, lang = 'fr';
const document = { documentElement: { lang: 'fr' }, head: { appendChild() {} }, body: { appendChild() {} }, getElementById: () => null,
  createElement: () => ({ click() { downloads.push(this.download); }, remove() {}, set href(v) {}, get download() { return this._d; }, set download(v) { this._d = v; } }),
  querySelector: (sel) => (sel === '[data-sfc-root]' && mounted ? root : null), addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); } };
const disk = new Map([['kiwiAccountKey', 'Owner@Resto.ma']]);
const downloads = [], blobs = [];
let urlMode = 'ok';
const URLStub = { createObjectURL: () => { if (urlMode === 'blocked') throw new Error('blocked'); return 'blob:x'; }, revokeObjectURL() {} };
class BlobStub { constructor(p) { this.text = p.join(''); blobs.push(this); } }
const base = { name: 'Tajine poulet', sellingPrice: 110, vatIncluded: true, vatRate: 10, portions: 4, targetPct: 30,
  lines: [{ id: 'a', name: 'Poulet', type: 'food', packPrice: 60, packQty: 1, packUnit: 'kg', useQty: 800, useUnit: 'g', yieldPct: 80, priceDate: '2026-10-01' }] };
const SHEET = { id: 'fc-1', name: 'Tajine poulet', kind: 'sheet', version: 2, archived: false, updatedTs: Date.UTC(2026, 9, 10, 9), updatedBy: 'Propriétaire', data: base };
const win = { KiwiEnv: { isReal: () => true }, KiwiConfig: { features: { simple_food_cost: true } }, KiwiI18n: { getLang: () => lang }, KiwiCloudDoc: { currentSlug: () => 'resto-test' },
  KiwiMenuStore: { items: () => [] }, KiwiReceipt: { config: () => ({ vat: { mode: 'rate', rate: 10, included: true } }) }, KiwiDayReport: { today: () => '2026-10-11' },
  addEventListener() {}, Kiwi: { modal() {} } };
win.window = win;
const fetch = async () => ({ status: 200, json: async () => ({ enabled: true, canEdit: true, sheets: [SHEET] }) });
const ctx = vm.createContext({ window: win, document, navigator: { onLine: true }, fetch, localStorage: { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k) }, console, setTimeout: (fn, ms) => (ms ? 0 : fn()), clearTimeout() {}, Intl, URL: URLStub, Blob: BlobStub });
vm.runInContext(R('assets/restaurant-units.js'), ctx);
vm.runInContext(deadlineVmSource(R('assets/simple-food-cost.js')), ctx);
const flush = () => new Promise((r) => setImmediate(r));
const click = async (attrs) => { const el = { getAttribute: (k) => attrs[k], closest: (s) => (s === '[data-sfc]' ? el : s === '[data-sfc-root]' ? root : null) }; for (const fn of listeners.click) await fn({ target: el }); await flush(); };
win.KiwiSimpleFoodCost.panel(); mounted = true; await flush(); await flush();
await click({ 'data-sfc': 'retry' });

/* 1 · les nombres de l'export suivent la langue (ligne Poulet : 60 MAD le kg × 800 g ÷ 80 % = 60) */
await click({ 'data-sfc': 'open', 'data-id': 'fc-1' });
const csvOf = async (l) => { lang = l; blobs.length = 0; await click({ 'data-sfc': 'export-sheet' }); return blobs[blobs.length - 1].text.replace(/^﻿/, ''); };
let csv = await csvOf('fr');
assert.match(csv, /;60,00\r?\n/, 'fr : 60,00');
assert.match(csv, /Total du lot;60,00/, 'fr : en-têtes français');
csv = await csvOf('en');
assert.match(csv, /Batch total;60\.00/, 'en : en-tête et nombre anglais (60.00)');
assert.ok(!/60,00/.test(csv), 'en : plus de virgule décimale française');
assert.match(csv, /Per portion;15\.00/, 'en : coût par portion 15.00');
csv = await csvOf('ar');
assert.match(csv, /مجموع الدفعة;60,00/, 'ar : chiffres latins, virgule décimale (règle de la maison)');
lang = 'fr';

/* 2 · un téléchargement refusé se dit, dans la fiche et dans la liste */
urlMode = 'blocked';
downloads.length = 0;
await click({ 'data-sfc': 'export-sheet' });
assert.match(root.innerHTML, /data-sfc-state="export-error"[^>]*>[^<]*téléchargement/, 'fiche : bannière d’échec d’export');
assert.match(root.innerHTML, /role="alert"/);
urlMode = 'ok';
await click({ 'data-sfc': 'export-sheet' });
assert.ok(!/export-error/.test(root.innerHTML), 'un export réussi efface la bannière');
await click({ 'data-sfc': 'back' });
urlMode = 'blocked';
await click({ 'data-sfc': 'export-all' });
assert.match(root.innerHTML, /data-sfc-state="export-error"/, 'liste : l’échec de « Exporter les fiches » se dit aussi');
lang = 'en'; await click({ 'data-sfc': 'export-all' });
assert.match(root.innerHTML, /could not be created/, 'en : message anglais');
console.log('✓ simple food cost export: numbers follow the language, a refused download is announced');
