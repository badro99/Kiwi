#!/usr/bin/env node
/* Kiwi · home-kpi-async-ownership-test.mjs · home#2.
 *
 * The home KPI band (assets/dateRange.js + assets/daterange/kpi.js) assembles
 * one tile from several caches that are filled asynchronously and owned by
 * different identities: the sales ledger (per venue), the credit-notes ledger
 * (assets/returns-ledger.js, per merchant AND venue), the window it was read
 * for, and the time it was read. This drives the REAL renderKpiBand (the
 * dashboard money harness) against the REAL returns ledger module while two
 * stores overlap in time, and reads what the "Taux retour" tile says:
 *
 *   · a slow credit read of the store we LEFT never changes the tile of the
 *     store on screen, not when it lands, not after the new store's own read;
 *   · the new store's tile is "unknown" until its own read lands, never the
 *     other store's number, never 0;
 *   · switching back finds the right owner or nothing, never the last writer;
 *   · a covered ledger older than a minute is shown as not current, not as a
 *     figure;
 *   · a read that fails after a good one keeps the tile honest (stale), and
 *     the next good read repaints it.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { world } = require('./dashboard-money-harness.cjs');

const w = world('UTC');
const NOW = Date.parse('2026-10-22T12:00:00Z');
w.set('UTC', NOW);

const store = new Map();
globalThis.localStorage = w.window.localStorage ?? { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let venue = 'scoped', slug = 'property-shop';
const env = { KiwiVenue: { getVenue: () => venue }, KiwiCloudDoc: { currentSlug: () => slug } };
globalThis.window = Object.assign(globalThis.window || {}, env);
globalThis.window.KiwiDateRange = { bounds: () => w.c.rangeBounds('aujourdhui') };
const ledger = await import('../assets/returns-ledger.js');
const real = Date.now;
let clockAt = NOW;
Date.now = () => clockAt;
const setClock = (ms) => { clockAt = ms; w.state.now = ms; };
w.c.renderKpiBand.returnsLedger = ledger;
/* the harness rewrites `__state.x` only where it lifts a declaration; creditStats reads it inside a closure */
w.c.__state = new Proxy({}, { get: (_, k) => w.c[k] });

/* A till can change merchant by pairing while the venue id stays the transient
   'scoped' (CLAUDE.md section 6): the venue id alone cannot tell two merchants
   apart, the slug the ledger was read for must. */
const setStore = (v, s) => { venue = v; slug = s; };
w.c.vData = () => ({ tx: {}, panier: {}, tauxRetour: { value: 0, unit: '%', fmt: 'pct1' } });

const sale = (cents) => ({ id: 'r1', cursor: 1, ref: 't1', ts: NOW - 3600000, amountCents: cents, method: 'cash', channel: 'counter', tipCents: 0, voided: false });
const tile = () => w.tiles('aujourdhui').tauxRetour;
const ts = NOW - 1800000;
const reply = (list) => ({ ok: true, json: async () => ({ ok: true, list, next: null }) });
const gated = () => { let release; const gate = new Promise((r) => { release = r; }); return { gate, release }; };

w.reset();
w.ingest([sale(100000)]);                       /* 1 000 MAD sold today */
const KEY = 'kiwi:returnsLedger';

console.log('■ Taux retour : registre des avoirs, deux commerces qui se chevauchent');

/* 1 · store A has its credit read: the tile counts it */
setStore('scoped', 'property-shop');
globalThis.fetch = async () => reply([{ kind: 'avoir', ts, amount: 50 }]);
await ledger.readReturnsLedger('property-shop', w.c.rangeBounds('aujourdhui'));
let t = tile();
assert.equal(t.value, 5, 'A: 50 MAD of credit notes on 1 000 MAD sold reads 5 %');
assert.equal(t.text, undefined);

/* 2 · a slow read for A is in flight while the owner switches to store B */
const slow = gated();
globalThis.fetch = async () => { await slow.gate; return reply([{ kind: 'avoir', ts, amount: 400 }]); };
store.clear(); ledger.ledgerSnapshot();          /* force a cold ledger for the in-flight scenario */
const inflight = ledger.readReturnsLedger('property-shop', w.c.rangeBounds('aujourdhui'));
setStore('scoped', 'shop-b');
slow.release();
await inflight;
w.reset(); w.ingest([sale(100000)]);              /* B's own 1 000 MAD of sales */
t = tile();
assert.equal(ledger.ledgerFor('scoped'), null, 'B owns no ledger yet: the late read of A published nothing under it');
assert.ok(t.text === '·' && !t.unit, 'B tile is unknown (a dot), not A\'s 40 % and not a false 0 %');
assert.equal(store.get(KEY), undefined, 'the late result of the store we left was not written to the shared key');

/* 3 · B's own read lands: only B's credit counts */
globalThis.fetch = async () => reply([{ kind: 'avoir', ts, amount: 20 }]);
await ledger.readReturnsLedger('shop-b', w.c.rangeBounds('aujourdhui'));
t = tile();
assert.equal(t.value, 2, 'B: 20 MAD of credit notes reads 2 %');

/* 4 · back to A: B's ledger is not A's, whatever wrote last */
setStore('scoped', 'property-shop');
w.reset(); w.ingest([sale(100000)]);
t = tile();
assert.equal(ledger.ledgerFor('scoped'), null, 'the ledger in memory belongs to B, A does not borrow it');
assert.equal(t.text, '·', 'A tile is unknown until A is read again, never B\'s 2 %');
globalThis.fetch = async () => reply([{ kind: 'avoir', ts, amount: 50 }]);
await ledger.readReturnsLedger('property-shop', w.c.rangeBounds('aujourdhui'));
assert.equal(tile().value, 5, 'A read again: A\'s own 5 %');

/* 5 · a covered ledger older than a minute is "not current", not a figure */
setClock(NOW + 61000);
t = tile();
assert.ok(t.text === '·' && /non actualisé/.test(t.note || ''), 'a figure older than 60 s is flagged, not shown as current');
setClock(NOW);

/* 6 · a failed refresh after a good read keeps it honest, the next good one repaints */
globalThis.fetch = async () => { throw new Error('offline'); };
setClock(NOW + 120000);
const before = ledger.ledgerSnapshot().at;
assert.equal(await ledger.warmCreditReturns(w.c.rangeBounds('aujourdhui')).catch(() => 'threw'), true, 'a failed refresh reports a change (the figure became stale)');
assert.equal(ledger.ledgerSnapshot().stale, true);
assert.equal(ledger.ledgerSnapshot().at, before, 'the old read time is kept, not renewed by the failure');
assert.ok(/non actualisé/.test(tile().note || ''), 'tile says not current after the failed refresh');
globalThis.fetch = async () => reply([{ kind: 'avoir', ts, amount: 70 }]);
await ledger.warmCreditReturns([w.c.rangeBounds('aujourdhui')[0] - 1, w.c.rangeBounds('aujourdhui')[1]]);
setClock(NOW + 121000);
assert.equal(tile().value, 7, 'the next good read repaints with its own figure');
Date.now = real;
console.log('  ✓ home KPI : le registre des avoirs reste à son commerce à travers lectures tardives, retour, péremption et échec');
