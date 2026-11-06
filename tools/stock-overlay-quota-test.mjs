#!/usr/bin/env node
/* Kiwi · stock-overlay-quota-test.mjs · stock#2.
 *
 * The stock overlay (what the merchant typed: articles, suppliers, counts) is
 * written to localStorage by stSaveOverlay(), mirrored to the server by
 * cloud-doc, and re-read from localStorage by the cloud-doc `read` hook and by
 * stEnsureOverlay() when the screen is entered again. When the write is refused
 * (quota, private mode) the edit used to exist only in the live variables: the
 * server push then sent the OLD document, and the next pull or the next visit
 * to the screen rebuilt the live variables from the old copy, so the edit
 * vanished with no word.
 *
 * This runs the real functions lifted from assets/stock.js with the real
 * assets/cloud-doc.js and a refusing localStorage:
 *   · the push carries the edit;
 *   · leaving and re-entering the screen (stEnsureOverlay after a venue
 *     round trip) still shows the edit;
 *   · a pull that brings the server copy (which has the push) does not drop it;
 *   · once storage accepts writes again the edit reaches the disk.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('assets/stock.js');
function grabFn(start, optional) {
  const i = SRC.indexOf(start);
  if (i < 0) { if (optional) return ''; throw new Error(start + ' not found'); }
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

const disk = new Map();
let refuse = false;
const localStorage = {
  getItem: (k) => (disk.has(k) ? disk.get(k) : null),
  setItem: (k, v) => { if (refuse) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); disk.set(k, String(v)); },
  removeItem: (k) => { disk.delete(k); }, key: (i) => [...disk.keys()][i] || null, get length() { return disk.size; },
};
const server = { rev: 0, data: null, posts: [] };
const resp = (status, body) => ({ ok: status < 300, status, json: async () => body });
const fetchImpl = async (url, opts = {}) => {
  if (opts.method === 'POST') { const b = JSON.parse(opts.body); server.posts.push(b); server.rev++; server.data = b.data; return resp(200, { ok: true, rev: server.rev }); }
  return resp(200, { rev: server.rev, data: server.data });
};
const listeners = {};
const document = { visibilityState: 'visible', addEventListener(t, f) { (listeners[t] ||= []).push(f); } };
const fired = [], toasts = [];
const window = { document, localStorage, addEventListener(t, f) { (listeners[t] ||= []).push(f); }, dispatchEvent(e) { fired.push(e.type); }, Kiwi: { toast: (m) => toasts.push(m) },
  KiwiEnv: { isReal: () => true }, KiwiVenue: { getVenue: () => 'v-shop', isCustom: () => true } };
window.window = window;
new Function('window', 'document', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout', read('assets/cloud-doc.js'))(window, document, localStorage, fetchImpl, setTimeout, clearTimeout);
window.KiwiCloudDoc.slugFor = () => 'shop';

const ctx = vm.createContext({ window, localStorage, document, console, JSON, Object, Array, Set, Map, Date, Math, Number, String, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
  normalizeStockItem: (x) => x, stockUnit: (u) => u, render() {}, stMergeOverlay: (a, b) => a || b,
  stOverlayKey: () => 'kiwi:stockOverlay:v-shop', stOverlayScope: () => 'v-shop', stShowReal: () => true, currentVenueId: () => 'v-shop' });
vm.runInContext([
  'let stUserItems = [], stUserSuppliers = [], stUserCategories = [], stOverlayLoadedFor = null, stPageActive = false, stDoc = null;',
  'const stItemOverrides = Object.create(null), stSupOverrides = Object.create(null), stCategoryOverrides = Object.create(null), stStockOverrides = Object.create(null);',
  'const stDeletedItems = new Set(), stDeletedSups = new Set(), stDeletedCategories = new Set();',
  'let stOverlayMem = null; const t = (k) => k;',
  grabFn('function migrateStockDocV2('),
  (SRC.match(/^  const stOverlayStore = .*$/m) || [''])[0], (SRC.match(/^  const stOverlayText = .*$/m) || [''])[0],
  grabFn('function stSaveOverlay('), grabFn('function stOverlayRaw('), grabFn('function stCloud('), grabFn('function stEnsureOverlay('),
  'this.api = { stSaveOverlay, stOverlayRaw, stCloud, stEnsureOverlay, items: () => stUserItems, addItem: (x) => stUserItems.push(x), setLoadedFor: (v) => { stOverlayLoadedFor = v; }, ov: stItemOverrides };',
].join('\n'), ctx);
const A = ctx.api;
const flush = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 20)); const r = await A.stCloud().pushNow(); if (!(r && r.error === 'busy')) return r; } };
const names = (list) => JSON.stringify(Array.from(list, (i) => i.name));

console.log('■ Stock : la surcouche ne se perd pas quand le stockage refuse l’écriture');
await A.stCloud().bind();                                 /* first read: the server has nothing yet */
A.stEnsureOverlay();
A.addItem({ id: 'it-1', name: 'Farine', unit: 'kg', currentStock: 3 });
A.stSaveOverlay();
await flush();
assert.equal(server.posts.length >= 1 && JSON.stringify(server.data).includes('Farine'), true, 'baseline: with storage working, the server gets the article');
const postsBefore = server.posts.length;

refuse = true;                                              /* storage now refuses every write */
A.addItem({ id: 'it-2', name: 'Semoule', unit: 'kg', currentStock: 5 });
A.stSaveOverlay();
assert.equal(disk.get('kiwi:stockOverlay:v-shop').includes('Semoule'), false, 'the disk indeed could not take the edit');
assert.ok(fired.includes('kiwi:stock-unsaved'), 'a refused write announces that the edit is held in memory only (lost on reload)');
assert.deepEqual(toasts, ['stockLocalOnly'], 'the merchant is told once, in plain words');
A.stSaveOverlay();
assert.equal(toasts.length, 1, 'the warning is not repeated on every save');
const sent = await flush();
assert.ok(server.posts.length > postsBefore, 'a push was sent');
assert.ok(JSON.stringify(server.data).includes('Semoule'), 'the push carries the edit the disk refused (it used to send the old document)');

/* leaving and re-entering the screen: the live variables are rebuilt from storage */
A.setLoadedFor(null); A.stEnsureOverlay();
assert.equal(names(A.items()), JSON.stringify(['Farine', 'Semoule']), 'coming back to the screen still shows the edit');

/* a pull that brings the server copy must not drop it either */
await A.stCloud().pull(true);
A.setLoadedFor(null); A.stEnsureOverlay();
assert.ok(names(A.items()).includes('Semoule'), 'after a pull the edit is still there');

/* storage recovers: the next save lands on disk */
refuse = false;
A.addItem({ id: 'it-3', name: 'Huile', unit: 'L', currentStock: 2 });
A.stSaveOverlay();
const onDisk = disk.get('kiwi:stockOverlay:v-shop');
assert.ok(onDisk.includes('Semoule') && onDisk.includes('Huile'), 'once storage accepts writes, the whole overlay reaches the disk');
console.log('  ✓ stock : une écriture refusée par le stockage ne perd plus la saisie (envoi serveur, retour sur l’écran, relecture)');
process.exit(0);
