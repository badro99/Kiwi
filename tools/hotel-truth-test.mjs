#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* Kiwi · hôtel : la bande du tableau de bord dit ce que le registre contient.
 *
 * Avant : « Taux d'occupation 0,0 % · ADR 0 MAD · RevPAR 0 MAD · 0 / 0 » écrits
 * à la main dans dateRange.js. Deux chambres vendues sur huit se lisaient 0 %.
 *
 * Ici, sans navigateur :
 *   · les définitions (nuitée vendue, inventaire, ADR, RevPAR, arrivées/départs)
 *     sur des cas dont le résultat se calcule de tête ;
 *   · le vrai handler GET /api/hotel/performance sur schema.sql en SQLite :
 *     garde (propriétaire seulement), plage, séjours à cheval, statuts exclus,
 *     day-use, séjours à 0 MAD, inventaire absent, registre illisible ;
 *   · le côté tableau de bord : hotelTilesFrom (extrait de dateRange.js et
 *     exécuté tel quel) rend « · » ou « … » pour l'inconnu, jamais 0, et le
 *     delta compare deux plages de même durée ;
 *   · le fichier ne contient plus les zéros codés en dur. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet } from '../functions/api/hotel/performance.js';
import { hotelPerformance, performanceWindow, roomInventory, SOLD } from '../functions/api/hotel/_performance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stay = (id, ci, co, total, status = 'confirmed', raw = {}) => ({ id, check_in: ci, check_out: co, status, total, raw_json: JSON.stringify(raw) });
const rooms = (n, hs = 0) => ({ rooms: Array.from({ length: n }, (_, i) => ({ id: 'r' + i, status: i < hs ? 'hs' : 'sale' })) });

test('performanceWindow · bornes incluses, plage bornée, dates réelles', () => {
  const w = performanceWindow('2027-03-01', '2027-03-07');
  assert.equal(w.days, 7); assert.equal(w.end, '2027-03-08');
  assert.equal(performanceWindow('2027-03-01', '2027-03-01').days, 1);
  assert.throws(() => performanceWindow('2027-03-02', '2027-03-01'), /bad-range/);
  assert.throws(() => performanceWindow('2027-02-30', '2027-03-01'), /bad-range/);
  assert.throws(() => performanceWindow(null, '2027-03-01'), /bad-range/);
  assert.throws(() => performanceWindow('2025-01-01', '2027-01-01'), /range-too-long/);
});

test('roomInventory · chambres actives, hors-service à part, absent n\'est pas zéro', () => {
  assert.deepEqual(roomInventory(rooms(8, 1)), { total: 8, outOfService: 1 });
  assert.deepEqual(roomInventory(JSON.stringify({ rooms: [{ id: 'a' }, { id: 'b', deletedAt: 5 }] })), { total: 1, outOfService: 0 });
  assert.equal(roomInventory(null), null);
  assert.equal(roomInventory('{broken'), null);
  assert.equal(roomInventory({ nothing: true }), null);
  assert.deepEqual(roomInventory({ rooms: [] }), { total: 0, outOfService: 0 });
});

test('hotelPerformance · occupation, ADR, RevPAR, arrivées et départs', () => {
  // 8 chambres, 7 nuits. A: 3 nuits à 1 500 (500/nuit). B: 2 nuits à 1 000 (500). C déborde avant la plage.
  const w = performanceWindow('2027-03-01', '2027-03-07');
  const p = hotelPerformance([
    stay('a', '2027-03-01', '2027-03-04', 1500),
    stay('b', '2027-03-05', '2027-03-07', 1000, 'checked_in'),
    stay('c', '2027-02-27', '2027-03-02', 1500, 'completed'), // 3 nuits (27, 28, 1er) dont 1 dans la plage
  ], w, { total: 8, outOfService: 0 });
  assert.equal(p.nights, 6); assert.equal(p.availableNights, 56);
  assert.equal(p.occupancyPct, 10.7);
  assert.equal(p.revenue, 3000); // 1500 + 1000 + 500
  assert.equal(p.adr, 500); assert.equal(p.revpar, 53.57);
  assert.equal(p.arrivals, 2, 'a et b arrivent dans la plage, c est arrivé avant');
  assert.equal(p.departures, 3, 'a, b et c partent dans la plage');
  assert.equal(p.perDay[0].nights, 2); assert.equal(p.perDay[3].nights, 0);
});

test('hotelPerformance · la nuit du départ, les statuts non vendus et le day-use ne comptent pas', () => {
  const w = performanceWindow('2027-03-01', '2027-03-01');
  const rows = [
    stay('out', '2027-02-28', '2027-03-01', 800),                   // part le 1er : 0 nuit le 1er
    stay('in', '2027-03-01', '2027-03-02', 700),                    // dort le 1er
    ...['cancelled', 'no_show', 'requested'].map((s) => stay(s, '2027-03-01', '2027-03-03', 900, s)),
    stay('day', '2027-03-01', '2027-03-01', 300, 'confirmed', { hotel: { dayUse: true } }),
  ];
  assert.deepEqual([...SOLD], ['confirmed', 'checked_in', 'completed']);
  const p = hotelPerformance(rows, w, { total: 4, outOfService: 0 });
  assert.equal(p.nights, 1); assert.equal(p.occupancyPct, 25); assert.equal(p.adr, 700);
  assert.equal(p.arrivals, 1, 'les annulations ne sont pas des arrivées');
  assert.equal(p.departures, 1);
});

test('hotelPerformance · l\'inconnu est null, jamais 0', () => {
  const w = performanceWindow('2027-03-01', '2027-03-02');
  // aucun inventaire déclaré
  let p = hotelPerformance([stay('a', '2027-03-01', '2027-03-03', 400)], w, null);
  assert.equal(p.occupancyPct, null); assert.equal(p.revpar, null); assert.equal(p.rooms, null);
  assert.equal(p.adr, 200, 'l\'ADR n\'a pas besoin de l\'inventaire');
  // nuits vendues mais jamais chiffrées : ni ADR ni RevPAR
  p = hotelPerformance([stay('free', '2027-03-01', '2027-03-03', 0)], w, { total: 2, outOfService: 0 });
  assert.equal(p.nights, 2); assert.equal(p.unpricedNights, 2);
  assert.equal(p.occupancyPct, 50); assert.equal(p.adr, null); assert.equal(p.revpar, null);
  // registre vide, inventaire connu : 0 % et RevPAR 0 sont des mesures
  p = hotelPerformance([], w, { total: 2, outOfService: 0 });
  assert.equal(p.occupancyPct, 0); assert.equal(p.revpar, 0); assert.equal(p.adr, null);
  // un séjour offert ne tire pas l'ADR vers le bas
  p = hotelPerformance([stay('a', '2027-03-01', '2027-03-03', 600), stay('free', '2027-03-01', '2027-03-03', 0)], w, { total: 4, outOfService: 0 });
  assert.equal(p.adr, 300); assert.equal(p.unpricedNights, 2);
});

test('hotelPerformance · une ligne illisible est un échec, pas un total partiel', () => {
  const w = performanceWindow('2027-03-01', '2027-03-02');
  const inv = { total: 1, outOfService: 0 };
  const row = stay('a', '2027-03-01', '2027-03-02', 100);
  assert.throws(() => hotelPerformance([row, row], w, inv), /performance-data-invalid/);
  assert.throws(() => hotelPerformance([{ ...row, raw_json: 'broken' }], w, inv), /performance-data-invalid/);
  assert.throws(() => hotelPerformance([{ ...row, check_out: '2027-02-30' }], w, inv), /performance-data-invalid/);
  assert.throws(() => hotelPerformance([{ ...row, check_in: '2027-03-05', check_out: '2027-03-04' }], w, inv), /performance-data-invalid/);
});

async function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(coreTestSource.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const DB = { prepare(q) { let args = []; return {
    bind(...v) { args = v; return this; },
    async first() { return sql.prepare(q).get(...args) || null; },
    async all() { return { results: sql.prepare(q).all(...args) }; },
    async run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  }; } };
  const SECRET = 'hotel-truth-secret';
  const env = { DB, AUTH_SECRET: SECRET };
  const now = Date.now();
  const put = (q, ...a) => sql.prepare(q).run(...a);
  put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)', 'acc-1', 'o@t.ma', 'O', 'Riad Test', 's', 'h', now);
  put('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)', 'acc-2', 'x@t.ma', 'X', 'Autre Riad', 's', 'h', now);
  put('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)', 'riad-test', '{}', 'hotel', 'active', 'Riad Test', 'acc-1', now);
  put('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)', 'autre-riad', '{}', 'hotel', 'active', 'Autre Riad', 'acc-2', now);
  put('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)', 'cafe-test', '{}', 'restaurant', 'active', 'Cafe', 'acc-1', now);
  const reservation = (merchant, id, ci, co, status, total, raw = '{}') => put(
    `INSERT INTO hotel_reservations (merchant,id,code,room_id,room_type_id,start_at,end_at,check_in,check_out,status,total,raw_json,created_ts,updated_ts)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    merchant, id, id, '', 'std', Date.parse(ci + 'T12:00:00Z'), Date.parse(co + 'T12:00:00Z'), ci, co, status, total, raw, now, now);
  const owner = sessionCookie(await makeSession('acc-1', SECRET)).split(';')[0];
  const stranger = sessionCookie(await makeSession('acc-2', SECRET)).split(';')[0];
  const get = async (cookie, query, merchant = 'riad-test') => {
    const res = await onRequestGet({ request: new Request(`https://kiwi.test/api/hotel/performance?merchant=${merchant}&${query}`, { headers: cookie ? { Cookie: cookie } : {} }), env });
    return { status: res.status, body: await res.json() };
  };
  return { sql, env, put, reservation, owner, stranger, get };
}

test('GET /api/hotel/performance · le registre réel, calculé côté serveur', async () => {
  const f = await fixture();
  f.put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', 'riad-test', 'rooms', JSON.stringify(rooms(8, 1)), 1, Date.now());
  f.reservation('riad-test', 's1', '2027-03-01', '2027-03-04', 'confirmed', 1500);
  f.reservation('riad-test', 's2', '2027-03-02', '2027-03-03', 'checked_in', 600);
  f.reservation('riad-test', 's3', '2027-03-02', '2027-03-04', 'cancelled', 900);
  f.reservation('riad-test', 's4', '2027-03-03', '2027-03-03', 'confirmed', 200, JSON.stringify({ hotel: { dayUse: true } }));
  f.reservation('riad-test', 's5', '2027-04-10', '2027-04-12', 'confirmed', 999);           // hors plage
  f.reservation('autre-riad', 'x1', '2027-03-01', '2027-03-05', 'confirmed', 4000);          // un autre hôtel

  let r = await f.get(f.owner, 'from=2027-03-01&to=2027-03-03');
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.coverage, 'ledger');
  assert.deepEqual(r.body.rooms, { total: 8, outOfService: 1 });
  assert.equal(r.body.nights, 4, 's1 : 3 nuits, s2 : 1 nuit ; ni annulé, ni day-use, ni autre hôtel');
  assert.equal(r.body.availableNights, 24);
  assert.equal(r.body.occupancyPct, 16.7);
  assert.equal(r.body.revenue, 2100); assert.equal(r.body.adr, 525); assert.equal(r.body.revpar, 87.5);
  assert.equal(r.body.arrivals, 2); assert.equal(r.body.departures, 1, 's2 part le 3 ; s1 part le 4, hors plage');
  assert.doesNotMatch(JSON.stringify(r.body), /customer|phone|email|raw_json/i);

  // la même plage décalée d'un mois ne voit rien : 0 % est ici une mesure
  r = await f.get(f.owner, 'from=2027-05-01&to=2027-05-03');
  assert.equal(r.status, 200); assert.equal(r.body.nights, 0); assert.equal(r.body.occupancyPct, 0);
  assert.equal(r.body.adr, null, 'aucune nuit chiffrée, pas de prix moyen');

  // garde et plage
  assert.equal((await f.get('', 'from=2027-03-01&to=2027-03-03')).status, 401, 'sans session');
  assert.equal((await f.get(f.stranger, 'from=2027-03-01&to=2027-03-03')).status, 401, 'un autre propriétaire');
  assert.equal((await f.get(f.owner, 'from=2027-03-01&to=2027-03-03', 'cafe-test')).status, 401, 'un commerce qui n\'est pas un hôtel');
  assert.equal((await f.get(f.owner, 'from=2027-03-03&to=2027-03-01')).body.error, 'bad-range');
  assert.equal((await f.get(f.owner, 'from=2020-01-01&to=2027-03-01')).body.error, 'range-too-long');
  assert.equal((await f.get(f.owner, 'from=oops&to=2027-03-01')).status, 400);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM hotel_reservations').get().n, 6, 'la route ne modifie rien');
});

test('GET /api/hotel/performance · sans chambres déclarées l\'occupation est inconnue, pas 0', async () => {
  const f = await fixture();
  f.reservation('riad-test', 's1', '2027-03-01', '2027-03-02', 'confirmed', 500);
  const r = await f.get(f.owner, 'from=2027-03-01&to=2027-03-01');
  assert.equal(r.status, 200); assert.equal(r.body.rooms, null);
  assert.equal(r.body.occupancyPct, null); assert.equal(r.body.revpar, null);
  assert.equal(r.body.nights, 1); assert.equal(r.body.adr, 500);
});

test('GET /api/hotel/performance · un registre illisible répond 503, jamais un total partiel', async () => {
  const f = await fixture();
  f.put('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)', 'riad-test', 'rooms', JSON.stringify(rooms(2)), 1, Date.now());
  f.reservation('riad-test', 's1', '2027-03-01', '2027-03-02', 'confirmed', 500, '{broken');
  const r = await f.get(f.owner, 'from=2027-03-01&to=2027-03-01');
  assert.equal(r.status, 503); assert.equal(r.body.error, 'performance-unavailable');
});

/* ── Tableau de bord : la fonction pure qui fabrique les tuiles ────────────── */
function loadTiles() {
  const src = coreTestSource.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');
  const a = src.indexOf('const hotelDelta =');
  const b = src.indexOf('function hotelBandTiles(');
  assert.ok(a > 0 && b > a, 'hotelDelta + hotelTilesFrom sont dans dateRange.js');
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(a, b) + '\nthis.hotelTilesFrom = hotelTilesFrom; this.hotelDelta = hotelDelta;', ctx);
  return ctx;
}

test('dateRange · la bande hôtel dit ce que le serveur sait', () => {
  const { hotelTilesFrom, hotelDelta } = loadTiles();
  const data = { occupancyPct: 25, adr: 700, revpar: 175, arrivals: 2, departures: 3 };
  const prev = { data: { occupancyPct: 20, adr: 700, revpar: 140, arrivals: 0, departures: 0 } };
  const t = hotelTilesFrom({ data }, prev, { total: 8, toClean: 3 });
  assert.equal(t.occupation.value, 25); assert.equal(t.occupation.unit, '%'); assert.equal(t.occupation.delta, 25);
  assert.equal(t.adr.value, 700); assert.equal(t.adr.delta, 0);
  assert.equal(t.revpar.value, 175); assert.equal(t.revpar.delta, 25);
  assert.equal(t.arrdep.text, '2 / 3');
  assert.equal(t.menage.value, 3); assert.equal(t.menage.unit, '/ 8');
  assert.equal(t.mixRev.text, '·', 'aucune source n\'attribue le revenu par point de vente');
  assert.equal(hotelDelta(10, 0), null, 'pas de delta sur une base nulle');
  assert.equal(hotelDelta(null, 5), null);
});

test('dateRange · inconnu = « · », en attente = « … », jamais 0', () => {
  const { hotelTilesFrom } = loadTiles();
  let t = hotelTilesFrom({ data: { occupancyPct: null, adr: null, revpar: null, arrivals: 0, departures: 0 } }, null, null);
  for (const k of ['occupation', 'adr', 'revpar']) { assert.equal(t[k].text, '·', k); assert.equal(t[k].value, undefined, k); }
  assert.equal(t.arrdep.text, '0 / 0', 'aucun mouvement est une mesure');
  assert.equal(t.menage.text, '·', 'aucune chambre connue');
  t = hotelTilesFrom({ data: null, error: 'unavailable' }, null, null);
  assert.deepEqual(['occupation', 'adr', 'revpar', 'arrdep'].map((k) => t[k].text), ['·', '·', '·', '·']);
  t = hotelTilesFrom({ data: null, error: '' }, null, { loading: true });
  assert.deepEqual(['occupation', 'adr', 'revpar', 'arrdep', 'menage'].map((k) => t[k].text), ['…', '…', '…', '…', '…']);
});

test('dateRange · plus aucun zéro écrit à la main pour un hôtel réel', () => {
  const src = coreTestSource.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');
  assert.match(src, /hotelBandTiles\(rng\)/);
  assert.doesNotMatch(src, /occupation:\s*\{\s*value:\s*0[,\s]/, 'occupation 0 codé en dur');
  assert.doesNotMatch(src, /arrdep:\s*\{\s*text:\s*'0 \/ 0'/, 'arrivées/départs 0 / 0 codé en dur');
  assert.match(src, /REAL_DELTAS = new Set\(\[[^\]]*'occupation'[^\]]*'adr'[^\]]*'revpar'/, 'les deltas hôtel sont réels');
});
