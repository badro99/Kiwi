#!/usr/bin/env node
/* Kiwi · une impression qui ne rend jamais la main ne bloque plus la file.
 *
 * Browse, 25 nov. 2026 : de 13:03 à la fin du service, la caisse n'a plus
 * déposé un seul bon ni reçu, alors que les tickets test et la réimpression
 * directe sortaient. Un appel d'impression resté sans réponse laissait la file
 * « occupée » pour toujours. Ce test tient trois choses :
 *  1. après STUCK_MS, l'appel est abandonné et le bon suivant part ;
 *  2. le bon abandonné reste en file (relancé, pas perdu) ;
 *  3. diag() dit tout cela au serveur, sans contenu de bon ;
 * et que assets/printer/print-diag.js écrit une entrée par appareil dans
 * le document « printdiag », que functions/api/store.js accepte. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
let pass = 0; const fail = [];
const ok = (label, cond, detail = '') => { if (cond) pass += 1; else fail.push(label + (detail ? ' · ' + detail : '')); };
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));

let now = Date.parse('2026-11-25T13:03:00Z');
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [now])); }
  static now() { return now; }
}

const memory = new Map();
const localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const printed = [];
const intervals = [];
const listeners = Object.create(null);
const context = {
  console, Promise, Date: FakeDate, JSON, Math, Object, Array, String, Number, Boolean,
  localStorage,
  document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  setInterval: (fn) => { intervals.push(fn); return intervals.length; }, clearInterval() {},
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(Number(ms) || 0, 5)), clearTimeout,
  addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  dispatchEvent(event) { (listeners[event.type] || []).forEach((fn) => fn(event)); },
  KiwiKitchenRelay: { merchant: () => 'browse' },
  KiwiPrinter: {
    isConnected: () => true,
    printKitchen(payload) {
      printed.push(payload.order);
      /* Le premier bon ne reçoit jamais de réponse ; les suivants sortent. */
      if (payload.order === '#110') return new Promise(() => {});
      return Promise.resolve({ ok: true, via: 'bridge' });
    },
  },
};
context.window = context;
vm.runInNewContext(source, context, { filename: 'assets/kitchen-print-queue.js' });
const K = context.KiwiKitchenPrint;

K.enqueue([{ id: 'o110:st_1', createdAt: now, station: 'st_1', payload: { order: '#110', items: [{ name: 'Secret dish' }] } }]);
await wait();
ok('le premier bon est parti à l’imprimante', printed.includes('#110'));
K.enqueue([{ id: 'o111:st_1', createdAt: now, station: 'st_1', payload: { order: '#111', items: [] } }]);
await wait();
ok('avant le délai, la file attend encore la réponse', !printed.includes('#111') && K.status().running === true);

let d = K.diag();
ok('diag dit que la file est occupée et depuis quand', d.running === true && d.jobs.length === 2);
ok('diag ne porte aucun contenu de bon', !JSON.stringify(d).includes('Secret dish'));

now += 46000;   // au-delà de STUCK_MS
intervals.forEach((fn) => { try { fn(); } catch (_) {} });
await wait(40);
ok('après 45 s, l’appel est abandonné et le bon suivant sort', printed.includes('#111'), JSON.stringify(printed));
d = K.diag();
ok('le bon abandonné reste en file pour être relancé', d.jobs.some((j) => /o110/.test(j.id) && j.err === 'print-call-hung'), JSON.stringify(d.jobs));
ok('le journal garde la trace de l’abandon', d.log.some((r) => r[1] === 'stuck-released'));
ok('le bon sorti a quitté la file', !d.jobs.some((j) => /o111/.test(j.id)));

/* ── print-diag.js : une entrée par appareil dans « printdiag » ── */
const diagSrc = fs.readFileSync(path.join(ROOT, 'assets/printer/print-diag.js'), 'utf8');
const posts = [];
let stored = { ok: true, rev: 3, data: { diag: { other: { at: now - 60000, hub: false }, stale: { at: now - 13 * 3600000 } } } };
const dctx = {
  console, Promise, Date: FakeDate, JSON, Math, Object, Array, String, Number, RegExp,
  localStorage: { getItem: (k) => (k === 'kiwi:caisse:terminal-id:v1' ? 'kid_ipad' : null) },
  document: { hidden: false, title: 'Kiwi Caisse · Browse', scripts: [{ src: 'https://kiwi-os.com/assets/kitchen-print-queue.js?v=45' }] },
  setTimeout: () => 0, setInterval: () => 0,
  KiwiKitchenRelay: { merchant: () => 'browse' },
  KiwiKitchenPrint: K,
  KiwiPrinter: { getStationConfig: () => ({ profiles: [{}, {}, {}], bindings: { st_1: 'a', st_27: 'b' } }) },
  fetch: (url, init) => {
    if (init && init.method === 'POST') { posts.push(JSON.parse(init.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, rev: 4 }) }); }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(stored) });
  },
};
dctx.window = dctx;
vm.runInNewContext(diagSrc, dctx, { filename: 'assets/printer/print-diag.js' });
dctx.KiwiPrintDiag.tick(true);
await wait(30);
const sent = posts[0];
ok('print-diag écrit le document printdiag sur la dernière révision', sent && sent.feature === 'printdiag' && sent.merchant === 'browse' && sent.baseRev === 3);
ok('une entrée par appareil, les autres appareils gardés', sent && sent.data.diag.kid_ipad && sent.data.diag.other && !sent.data.diag.stale);
ok('l’entrée dit le routage et la version chargée', sent && sent.data.diag.kid_ipad.routing.profiles === 3 && sent.data.diag.kid_ipad.stamps['kitchen-print-queue'] === 45);
dctx.KiwiPrintDiag.tick();
await wait(30);
ok('rien ne repart quand rien n’a changé', posts.length === 1, String(posts.length));

const store = fs.readFileSync(path.join(ROOT, 'functions/api/store.js'), 'utf8');
ok('le serveur accepte le document printdiag', /printdiag: \{ keys: \['diag'\], max: \d+ \}/.test(store));
const queue = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
const a = queue.match(/print-diag\.js\?v=(\d+)/), b = sw.match(/print-diag\.js\?v=(\d+)/);
ok('la file charge print-diag.js sur l’estampille du service worker (bump-stamp ne voit pas cette chaîne)', a && b && a[1] === b[1]);

if (fail.length) {
  fail.forEach((l) => console.error('  ✗ ' + l));
  console.error(`\n✗ print-queue-stuck : ${pass} ok, ${fail.length} échec(s)`);
  process.exit(1);
}
console.log(`  ✓ print-queue-stuck : ${pass} contrôles (appel sans réponse abandonné, file qui repart, diagnostic à distance)`);
process.exit(0);   // la file garde des minuteries de relance : on ne les attend pas
