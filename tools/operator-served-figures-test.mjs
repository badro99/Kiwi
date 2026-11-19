#!/usr/bin/env node
/* Vue opérateur : les chiffres du serveur pendant la relecture du journal.
 *
 * Santos, 19 nov. 2026 : la vue opérateur restait sur « Chargement du
 * journal… » 15 s (8 pages de 1,5 s, 3 628 tickets) alors que le serveur compte
 * la journée en 0,4 s (/api/sales-summary). La règle tenue ici, sur le vrai
 * operatorLedgerPending (assets/daterange/ledger.js) et le vrai animateNumber
 * (assets/daterange/presentation.js) :
 *  - journal en relecture du commerce demandé + fenêtre comptée par le serveur :
 *    la bande, le montant et l'objectif s'affichent ('served') ;
 *  - tout le reste (marge, clients, courbe horaire) attend la fin, comme avant ;
 *  - un autre commerce, une fenêtre que le serveur ne compte pas, une erreur
 *    de relecture : « … », comme avant.
 *   node tools/operator-served-figures-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const ok = (label, fn) => { fn(); passed++; console.log('  ✓ ' + label); };
function setup({ phase = 'loading', snapMerchant = 'santos-store', venueSlug = 'santos-store', liveMerchant = 'santos-store', serves = true, search = '?op=1&merchant=santos-store', snapVenue } = {}) {
  const asked = [];
  const window = {
    KiwiLive: { snapshotStatus: () => ({ phase, merchant: snapMerchant, venue: snapVenue }), merchant: () => liveMerchant },
    KiwiVenue: { getCurrentVenueData: () => ({ slug: venueSlug }), getVenue: () => 'scoped' },
    KiwiSalesHistory: { serves: (from, to) => { asked.push([from, to]); return serves; } },
    __kiwiHomeRenderers: Object.create(null),
  };
  const c = vm.createContext({ window, location: { search }, URLSearchParams, document: { hidden: true } });
  for (const f of ['assets/daterange/ledger.js', 'assets/daterange/presentation.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), c);
  const state = { closedBounds: () => [100, 200], currentRange: 'aujourdhui' };
  const ledger = window.__kiwiHomeRenderers.ledger(state);
  state.operatorLedgerPending = ledger.operatorLedgerPending;
  const pres = window.__kiwiHomeRenderers.presentation(state);
  return { pending: ledger.operatorLedgerPending, animate: pres.animateNumber, asked };
}
const el = (inServed) => ({ textContent: '0', closest: (sel) => inServed && /data-kpi-band/.test(sel) ? {} : null });

ok('loading, server counts the window: KPI band / hero / goal show, the rest waits', () => {
  const t = setup();
  assert.equal(t.pending('served'), false);
  assert.equal(t.pending(), true, 'margin, clients and the hourly curve still wait');
  assert.deepEqual(t.asked.at(-1), [100, 200], 'asks for the window on screen');
});
ok('the server has not answered yet: « … » everywhere', () => {
  assert.equal(setup({ serves: false }).pending('served'), true);
});
ok('another store, or a venue that is not the requested one: « … »', () => {
  assert.equal(setup({ snapMerchant: 'amira-boutique' }).pending('served'), true);
  assert.equal(setup({ venueSlug: 'amira-boutique' }).pending('served'), true);
  assert.equal(setup({ liveMerchant: 'amira-boutique' }).pending('served'), true);
});
ok('a failed or incomplete replay is never covered by the server figures', () => {
  for (const phase of ['error', 'incomplete']) assert.equal(setup({ phase }).pending('served'), true, phase);
});
ok('replay complete for this venue: everything shows, as before', () => {
  const t = setup({ phase: 'complete', snapVenue: 'scoped' });
  assert.equal(t.pending(), false); assert.equal(t.pending('served'), false);
  assert.equal(setup({ phase: 'complete', snapVenue: 'other' }).pending(), true, 'complete for another venue still waits');
});
ok('not an operator URL: never pending', () => {
  assert.equal(setup({ search: '?merchant=santos-store', phase: 'error' }).pending(), false);
});
ok('animateNumber: a KPI tile animates during the replay, any other number keeps « … »', () => {
  const t = setup();
  const kpi = el(true), other = el(false);
  t.animate(kpi, 0, 3050, { duration: 0, format: (v) => String(v) });
  t.animate(other, 0, 12, { duration: 0, format: (v) => String(v) });
  assert.notEqual(kpi.textContent, '…', 'KPI tile painted');
  assert.equal(other.textContent, '…', 'non-served number waits');
});
console.log(`operator-served-figures: ${passed} passed`);
