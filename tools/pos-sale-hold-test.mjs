#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · les quinze métiers (assets/pos-sale.js) : une vente refusée repart
 *
 * postSale() répond {ok:true, queued:true} quand la file de Live Link a pris la
 * vente. Un refus (stockage plein, caisse réappairée, commerce pas encore
 * résolu) était ignoré : la vente restait au comptoir, le serveur n'en savait
 * rien. Elle est maintenant gardée dans sa propre file (kiwi:posHeld), avec le
 * commerce où elle a été encaissée, et renvoyée avant la vente suivante, au
 * démarrage, chaque minute et au retour du réseau, une seule fois.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import vm from 'node:vm';

let failures = 0;
const ok = (label, cond, detail) => {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++; console.log('  ✗ ' + label + (detail ? ' · ' + detail : ''));
};
console.log('■ métiers · une vente refusée par la file repart (tools/pos-sale-hold-test.mjs)');

const source = fs.readFileSync(new URL('../assets/pos-sale.js', import.meta.url), 'utf8');

function boot({ merchant = 'amira-snack', answer = () => ({ ok: true, queued: true, id: 's' }) } = {}) {
  const rows = new Map([['kiwiPairedVenue', JSON.stringify({ merchant: 'amira-snack' })], ['kiwi:posDevice', 'A7']]);
  const localStorage = {
    getItem: (k) => rows.has(k) ? rows.get(k) : null, setItem: (k, v) => rows.set(k, String(v)),
    removeItem: (k) => rows.delete(k), key: (i) => [...rows.keys()][i] || null, get length() { return rows.size; },
  };
  const posted = [], timers = [], intervals = [], listeners = {};
  const live = { merchant, on: true };
  const window = {
    localStorage, document: { hidden: false, addEventListener() {}, dispatchEvent() { return true; }, querySelectorAll: () => [] },
    KiwiEnv: { isReal: () => true },
    KiwiLive: {
      isOn: () => live.on, merchant: () => live.merchant,
      postSale: (p) => { posted.push(p); return answer(p, posted.length); },
    },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent() { return true; },
  };
  window.window = window;
  const context = {
    console, window, document: window.document, localStorage,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Date, Map, Set, Uint8Array, crypto: { getRandomValues(a) { a[0] = 1; return a; } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval: (fn) => { intervals.push(fn); return intervals.length; }, clearInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({ sales: [] }) }),
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'pos-sale.js' });
  const held = () => JSON.parse(rows.get('kiwi:posHeld') || '[]');
  return { api: window.KiwiPosSale, posted, held, rows, live, timers, intervals, listeners };
}

/* 1 · une vente refusée (stockage plein) est gardée, avec son commerce. */
let answers = [{ ok: false, reason: 'queue-storage-full' }];
let t = boot({ answer: () => answers.shift() || { ok: true, queued: true } });
t.api.record('epicerie', { total: 84.5, method: 'especes', label: 'Pain +3 art.', ref: 'T-1' });
ok('une vente que la file refuse est gardée', t.held().length === 1 && t.held()[0].ref === 'T-1-A7', JSON.stringify(t.held()));
ok('… avec le commerce où elle a été encaissée et son heure', t.held()[0].merchant === 'amira-snack' && Number.isFinite(t.held()[0].time));

/* 2 · elle repart avant la vente suivante, la plus ancienne d'abord, puis la file est vide. */
t.api.record('epicerie', { total: 12, method: 'especes', label: 'Lait', ref: 'T-2' });
ok('la vente retenue repart avant la suivante, dans l\'ordre',
  t.posted.length === 3 && t.posted[1].ref === 'T-1-A7' && t.posted[2].ref === 'T-2-A7', t.posted.map((p) => p.ref).join(','));
ok('… et quitte la file une fois prise', t.held().length === 0);
ok('… avec la même référence, donc le même identifiant serveur', t.posted[0].ref === t.posted[1].ref);

/* 3 · commerce pas encore résolu au démarrage : postSale ne répond rien, la vente est gardée. */
t = boot({ merchant: '', answer: (p) => (t && t.live.merchant ? { ok: true, queued: true } : undefined) });
t.api.record('pressing', { total: 60, method: 'carte', label: 'Chemise', ref: 'P-1' });
ok('commerce non résolu : la vente est gardée', t.held().length === 1);
t.live.merchant = 'amira-snack';
t.timers.forEach((fn) => fn());
ok('au démarrage (4 s), la vente gardée repart', t.held().length === 0 && t.posted.length === 2);

/* 4 · réseau revenu et minuterie : renvoi sans nouvelle vente. */
answers = [{ ok: false, reason: 'queue-storage-full' }, { ok: false, reason: 'queue-storage-full' }];
t = boot({ answer: () => answers.shift() || { ok: true, queued: true } });
t.api.record('boulangerie', { total: 20, method: 'especes', label: 'Pain', ref: 'B-1' });
(t.listeners.online || []).forEach((fn) => fn());
ok('au retour du réseau, encore refusée : elle reste gardée', t.held().length === 1);
t.intervals.forEach((fn) => fn());
ok('à la minute suivante, prise : la file se vide', t.held().length === 0);

/* 5 · une vente prise n'est jamais gardée ; Live Link coupé n'est pas un refus. */
t = boot();
t.api.record('epicerie', { total: 9, method: 'especes', label: 'Eau', ref: 'E-1' });
ok('une vente prise par la file n\'est pas gardée', t.held().length === 0 && t.posted.length === 1);
t = boot(); t.live.on = false;
t.api.record('epicerie', { total: 9, method: 'especes', label: 'Eau', ref: 'E-2' });
ok('Live Link coupé : rien n\'est posté ni gardé', t.held().length === 0 && t.posted.length === 0);

/* 6 · une caisse réappairée : la vente de l'ancien commerce reste gardée, jamais postée ailleurs. */
t = boot({ answer: (p) => (p.merchant && p.merchant !== t.live.merchant ? { ok: false, reason: 'tenant-mismatch' } : (t.live.merchant === 'amira-snack' && !p.merchant ? { ok: false, reason: 'tenant-mismatch' } : { ok: true, queued: true })) });
t.api.record('epicerie', { total: 30, method: 'especes', label: 'Riz', ref: 'R-1' });
ok('refus tenant-mismatch : la vente est gardée avec son commerce d\'origine', t.held().length === 1 && t.held()[0].merchant === 'amira-snack');
t.live.merchant = 'autre-commerce';
t.intervals.forEach((fn) => fn());
ok('… et elle n\'est pas acceptée par un autre commerce : elle reste gardée, sous son commerce', t.held().length === 1 && t.held()[0].merchant === 'amira-snack' && t.posted.slice(1).every((p) => p.merchant === 'amira-snack'));

/* 7 · un même ticket refusé deux fois n'est gardé qu'une fois. */
answers = [{ ok: false, reason: 'queue-storage-full' }, { ok: false, reason: 'queue-storage-full' }, { ok: false, reason: 'queue-storage-full' }];
t = boot({ answer: () => answers.shift() || { ok: false, reason: 'queue-storage-full' } });
t.api.record('epicerie', { total: 5, method: 'especes', label: 'Pain', ref: 'D-1' });
t.api.record('epicerie', { total: 5, method: 'especes', label: 'Pain', ref: 'D-1' });
ok('un ticket refusé deux fois n\'est gardé qu\'une fois', t.held().filter((h) => h.ref === 'D-1-A7').length === 1, JSON.stringify(t.held().map((h) => h.ref)));
ok('la file se lit de l\'extérieur', t.api.heldCount() === t.held().length);

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ métiers : une vente refusée par la file repart, une fois, tout est vert.\n');
process.exitCode = failures ? 1 : 0;
