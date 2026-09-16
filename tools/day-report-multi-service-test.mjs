#!/usr/bin/env node
/* Restaurant MixMax, 12 septembre 2026 : deux services dans la même journée
 * commerciale. Le Z du second service (587 MAD) remplaçait celui du premier
 * (15 209 MAD), et la journée entière affichait 587 MAD. Le même soir, un
 * encaissement arrivé sous plusieurs ids gonflait le calcul du tableau de bord.
 * Ce test rejoue les deux défauts avec la forme réelle des données. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'assets/day-report.js'), 'utf8');

let pass = 0;
function ok(v, msg) {
  if (!v) { console.error('  ✗ ' + msg); process.exitCode = 1; return; }
  pass++;
}

const memory = new Map();
const ls = {
  getItem: (k) => memory.has(k) ? memory.get(k) : null,
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
ls.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'resto-test', name: 'Resto test', type: 'restaurant' }));
const ctx = vm.createContext({
  window: { localStorage: ls, addEventListener: () => {} },
  localStorage: ls, Date, Math, JSON, RegExp, Array, Object, String, Number,
});
ctx.window.window = ctx.window;
vm.runInContext(src, ctx);
const DR = ctx.window.KiwiDayReport;
ok(DR.isReal(), 'fixture is a real paired till, so save() writes');

const store = { slug: 'resto-test', name: 'Resto test', type: 'restaurant' };
const day = '2026-09-12';
const at = (iso) => Date.parse(iso);
const line = (id, name, qty, total) => ({ itemId: id, name, qty, total });

/* ── Service 1 : 19:14 → 23:24 heure de Casablanca (UTC+1) ── */
const s1Sales = [
  { id: 'a1', ts: at('2026-09-12T18:42:00Z'), amount: 150, method: 'cash', ref: '1', lines: [line('it_30', 'King Shawarma', 2, 120), line('it_87', 'Soda', 3, 30)] },
  { id: 'a2', ts: at('2026-09-12T20:19:32.039Z'), amount: 50, method: 'cash', ref: 'Table 3 #250', lines: [line('it_96', 'Tiramisu', 2, 50)] },
  /* Même règlement, autre id : même ticket, même milliseconde, même panier. */
  { id: 'visit-tsx-dup', ts: at('2026-09-12T20:19:32.039Z'), amount: 50, method: 'cash', ref: 'Table 3 #250', lines: [line('it_96', 'Tiramisu', 2, 50)] },
  /* Même panier et même ticket, mais PAS la même milliseconde : deux ventes. */
  { id: 'a3', ts: at('2026-09-12T21:00:00Z'), amount: 50, method: 'cash', ref: 'Table 3 #250', lines: [line('it_96', 'Tiramisu', 2, 50)] },
  /* Deux parts égales d'un paiement partagé : deux encaissements réels. */
  { id: 'visit-s1-split-0-emp', ts: at('2026-09-12T21:30:00Z'), amount: 40, method: 'cash', ref: 'T5', lines: [line('it_40', 'Tacos Poulet', 1, 40)] },
  { id: 'visit-s1-split-1-emp', ts: at('2026-09-12T21:30:00Z'), amount: 40, method: 'card', ref: 'T5', lines: [line('it_40', 'Tacos Poulet', 1, 40)] },
];
const s1 = DR.build({
  day, store, source: 'caisse', sales: s1Sales,
  session: { sessionId: 'shift-1', terminalId: 't1', openedAt: at('2026-09-12T18:14:00Z'), closedAt: at('2026-09-12T22:24:00Z'), openedBy: 'Hafid', closedBy: 'Hafid', openingFloat: 0, countedCash: 290 },
});
ok(s1.txns === 5 && s1.gross === 330, `exact duplicate settlement is excluded (txns ${s1.txns}, gross ${s1.gross})`);
ok(s1.duplicates && s1.duplicates.count === 1 && s1.duplicates.amount === 50, 'the excluded duplicate is disclosed with its amount');
ok(s1.methods.card === 40, 'equal split parts are both kept');
DR.save(s1, { by: 'Hafid' });

/* ── Service 2 : ouvert à 01:36 (même journée commerciale, seuil 5 h) ── */
const s2 = DR.build({
  day, store, source: 'caisse',
  sales: [
    { id: 'b1', ts: at('2026-09-13T00:36:40Z'), amount: 60, method: 'cash', ref: '9', lines: [line('it_30', 'King Shawarma', 1, 60)] },
    { id: 'b2', ts: at('2026-09-13T00:36:49Z'), amount: -20, method: 'cash', ref: 'R1', kind: 'refund' },
  ],
  session: { sessionId: 'shift-2', terminalId: 't1', openedAt: at('2026-09-13T00:36:00Z'), closedAt: at('2026-09-13T00:43:00Z'), openedBy: 'Hafid', closedBy: 'Hafid', openingFloat: 0, countedCash: 40 },
});
ok(s2.gross === 60 && s2.txns === 1, 'the second service alone sees only its own sales');
DR.save(s2, { by: 'Hafid' });

const saved = DR.load(day, 'resto-test');
ok(saved.gross === 390, `the day keeps both services (gross ${saved.gross}, expected 330 + 60)`);
ok(saved.txns === 6, `transactions add up (${saved.txns})`);
ok(saved.net === 370 && saved.refunds.count === 1 && saved.refunds.amount === 20, `refunds and net add up (net ${saved.net})`);
ok(saved.methods.cash === 330 && saved.methods.card === 40, 'payment methods add up');
ok(saved.duplicates && saved.duplicates.count === 1, 'the earlier duplicate stays disclosed');
const shawarma = (saved.categories.flatMap((c) => c.products)).find((p) => p.name === 'King Shawarma');
ok(shawarma && shawarma.qty === 3 && shawarma.total === 180, 'product lines add up across services');
ok(saved.openedAt === s2.openedAt && saved.dayOpenedAt === at('2026-09-12T18:14:00Z'), 'service opening stays per drawer; the day opening is kept separately');
ok(DR.drawerSessions(saved).length === 2, 'both drawers remain listed');
ok(DR.closureRevisions(saved).length === 2, 'both closures remain in the history');

/* Rouvrir et reclôturer le DERNIER service ne doit pas ré-ajouter le premier. */
const s2again = DR.build({
  day, store, source: 'caisse',
  sales: [
    { id: 'b1', ts: at('2026-09-13T00:36:40Z'), amount: 60, method: 'cash', ref: '9', lines: [line('it_30', 'King Shawarma', 1, 60)] },
    { id: 'b2', ts: at('2026-09-13T00:36:49Z'), amount: -20, method: 'cash', ref: 'R1', kind: 'refund' },
    { id: 'b3', ts: at('2026-09-13T00:50:00Z'), amount: 25, method: 'cash', ref: '10', lines: [line('it_17', 'Shawarma', 1, 25)] },
  ],
  session: { sessionId: 'shift-2', terminalId: 't1', openedAt: at('2026-09-13T00:36:00Z'), closedAt: at('2026-09-13T00:55:00Z'), openedBy: 'Hafid', closedBy: 'Hafid', openingFloat: 0, countedCash: 65 },
});
DR.save(s2again, { by: 'Hafid' });
const reopened = DR.load(day, 'resto-test');
ok(reopened.gross === 415 && reopened.txns === 7, `reclosing the last service recomputes on the same base (gross ${reopened.gross})`);

/* Un service qui chevauche la clôture précédente n'est PAS additionné : on ne
   peut pas prouver que ses ventes sont distinctes. */
const memory2 = new Map([['kiwiPairedVenue', ls.getItem('kiwiPairedVenue')]]);
const ls2 = { getItem: (k) => memory2.has(k) ? memory2.get(k) : null, setItem: (k, v) => memory2.set(k, String(v)), removeItem: (k) => memory2.delete(k) };
const ctx2 = vm.createContext({ window: { localStorage: ls2, addEventListener: () => {} }, localStorage: ls2, Date, Math, JSON, RegExp, Array, Object, String, Number });
ctx2.window.window = ctx2.window;
vm.runInContext(src, ctx2);
const DR2 = ctx2.window.KiwiDayReport;
DR2.save(DR2.build({ day, store, sales: s1Sales, session: { sessionId: 'shift-1', openedAt: at('2026-09-12T18:14:00Z'), closedAt: at('2026-09-12T22:24:00Z') } }), {});
DR2.save(DR2.build({
  day, store,
  sales: s1Sales.concat([{ id: 'c1', ts: at('2026-09-12T22:30:00Z'), amount: 10, method: 'cash', ref: '11' }]),
  session: { sessionId: 'shift-x', openedAt: at('2026-09-12T19:00:00Z'), closedAt: at('2026-09-12T22:40:00Z') },
}), {});
const overlap = DR2.load(day, 'resto-test');
ok(overlap.gross === 340 && !overlap.carried, `an overlapping service replaces instead of double counting (gross ${overlap.gross})`);

if (process.exitCode) process.exit(process.exitCode);
console.log(`  ✓ day report keeps every service of a business day and excludes proven duplicate settlements (${pass} controls)`);
