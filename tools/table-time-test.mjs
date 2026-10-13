#!/usr/bin/env node
/* « Temps moyen à table » : une mesure, plus un tiret.
 *
 * La tuile affichait « · » chez un vrai restaurant, faute de source. La
 * source existe : chaque visite de table (table_sessions) a son heure
 * d'ouverture, sa fermeture et la raison de cette fermeture. Ce test tient :
 *   1 · le calcul pur (functions/api/_table-time.js) : seuls les vrais
 *       départs comptent, les durées absurdes sont écartées, et sous cinq
 *       visites il n'y a pas de moyenne ;
 *   2 · le vrai gestionnaire /api/table-time sur une base bâtie depuis
 *       schema.sql : la fenêtre, le mode « table », l'autorisation par
 *       commerce, une base sans la table ;
 *   3 · la tuile du tableau de bord, extraite du VRAI assets/dateRange.js :
 *       « … » en attente, « · » sans mesure, la moyenne et sa variation
 *       sinon, une seule lecture par fenêtre, la bande repeinte à l'arrivée.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { dwellStats, isDeparture, MIN_VISITS } from '../functions/api/_table-time.js';
import { onRequestGet } from '../functions/api/table-time.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0, passed = 0;
const check = (label, ok, detail) => { if (ok) { passed++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (detail ? '\n      ' + detail : '')); } };
const MIN = 60000;

console.log('■ The pure measure');
{
  check('real departures: settled, settled at the till, paid from the waiter app, freed by a waiter',
    ['settle', 'settled-at-till', 'service-payment', 'service-payment-pending', 'service:w1', 'caisse'].every(isDeparture));
  check('never a visit that says nothing about when the guests left',
    !['expiry', 'cancelled', 'prune-stale', 'merged-into-T4', 'takeout-handover', 'served', '', 'service:', 'whatever'].some(isDeparture));
  const v = (min, why = 'settle') => ({ opened_ts: 1e12, closed_ts: 1e12 + min * MIN, closed_by: why });
  const s = dwellStats([v(40), v(50), v(60), v(45), v(55), v(30, 'expiry'), v(2), v(400), v(70, 'merged-into-T2')]);
  check('five departures between 5 min and 5 h: mean 50, median 50', s.visits === 5 && s.avgMin === 50 && s.medianMin === 50, JSON.stringify(s));
  check('an expired, a 2-minute, a 6-hour and a merged visit are left out', s.skipped === 4, JSON.stringify(s));
  const four = dwellStats([v(40), v(50), v(60), v(45)]);
  check(`under ${MIN_VISITS} visits there is no average`, four.visits === 4 && four.avgMin === null && four.medianMin === null);
  const even = dwellStats([v(10), v(20), v(30), v(40), v(50), v(200)]);
  check('the median of an even count is the middle pair', even.medianMin === 35 && even.avgMin === 58, JSON.stringify(even));
  check('a visit closed before it opened is ignored', dwellStats([{ opened_ts: 5, closed_ts: 4, closed_by: 'settle' }]).skipped === 1);
}

console.log('\n■ The real /api/table-time handler');
const SECRET = 'table-time-secret';
const M = 'table-time-bistro', OTHER = 'table-time-ailleurs';
const sql = new DatabaseSync(':memory:');
for (const stmt of fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean)) sql.exec(stmt);
const DB = {
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      first() { const r = sql.prepare(query).get(...args); return Promise.resolve(r === undefined ? null : r); },
      all() { return Promise.resolve({ results: sql.prepare(query).all(...args) }); },
      run() { const r = sql.prepare(query).run(...args); return Promise.resolve({ meta: { changes: r.changes } }); },
    };
    return st;
  },
};
const env = { DB, AUTH_SECRET: SECRET };
for (const m of [M, OTHER]) sql.prepare("INSERT INTO merchant_config (merchant, features, name, type, updated_ts) VALUES (?, '{}', ?, 'restaurant', ?)").run(m, m, Date.now());
const T0 = Date.parse('2026-10-12T05:00:00Z'), T1 = Date.parse('2026-10-13T05:00:00Z');
let n = 0;
const visit = (merchant, closedAt, minutes, why = 'settle', mode = 'table', status = 'closed') => sql.prepare(
  `INSERT INTO table_sessions (id, merchant, mode, table_no, status, closed_by, opened_ts, seen_ts, closed_ts) VALUES (?, ?, ?, 'T1', ?, ?, ?, ?, ?)`)
  .run('tsx-' + (++n), merchant, mode, status, why, closedAt - minutes * MIN, closedAt, status === 'closed' ? closedAt : null);
[30, 40, 50, 60, 70].forEach((m, i) => visit(M, T0 + (i + 1) * 3600e3, m));
visit(M, T0 + 7 * 3600e3, 90, 'expiry');                       // abandonnée
visit(M, T0 + 8 * 3600e3, 25, 'served', 'takeout');            // à emporter
visit(M, T0 - 3600e3, 200);                                    // la veille : hors fenêtre
visit(M, T1 + 3600e3, 200);                                    // le lendemain : hors fenêtre
visit(OTHER, T0 + 3600e3, 5);                                  // un autre commerce
const cookie = `${TILL_COOKIE}=${await tillToken(SECRET, M)}`;
const get = async (q, c = cookie, e = env) => {
  const res = await onRequestGet({ request: new Request('https://kiwi-os.com/api/table-time?' + new URLSearchParams(q), { headers: c ? { Cookie: c } : {} }), env: e });
  return { status: res.status, body: await res.json(), cache: res.headers.get('Cache-Control') };
};
{
  const r = await get({ merchant: M, from: T0, to: T1 });
  check('five visits of that day, mean 50 min', r.status === 200 && r.body.ok && r.body.visits === 5 && r.body.avgMin === 50 && r.body.medianMin === 50, JSON.stringify(r.body));
  check('the expired visit counts as skipped; take-away, other days and other stores never enter',
    r.body.skipped === 1, JSON.stringify(r.body));
  check('nothing nominal leaves the server (no table, no waiter, no visit)',
    Object.keys(r.body).sort().join(',') === 'avgMin,from,medianMin,merchant,ok,skipped,to,visits', Object.keys(r.body).join(','));
  check('private, five-minute cache', r.cache === 'private, max-age=300');
  const other = await get({ merchant: OTHER, from: T0, to: T1 });
  check('another store with this till: 403', other.status === 403, JSON.stringify(other));
  const anon = await get({ merchant: M, from: T0, to: T1 }, '');
  check('no proof at all: 403', anon.status === 403, JSON.stringify(anon));
  check('a window that is missing, reversed or over 400 days: 400',
    (await get({ merchant: M, from: T1, to: T0 })).status === 400
    && (await get({ merchant: M, from: 'x', to: T1 })).status === 400
    && (await get({ merchant: M, from: T0, to: T0 + 401 * 864e5 })).status === 400);
  check('no merchant: 400', (await get({ from: T0, to: T1 })).status === 400);
  const broken = { DB: { prepare: (q) => (/table_sessions/.test(q) ? { bind: () => ({ all: () => Promise.reject(new Error('no such table: table_sessions')) }) } : DB.prepare(q)) }, AUTH_SECRET: SECRET };
  const r503 = await get({ merchant: M, from: T0, to: T1 }, cookie, broken);
  check('a database without table_sessions answers « unavailable », never a number', r503.status === 503 && r503.body.error === 'unavailable', JSON.stringify(r503));
}

console.log('\n■ The dashboard tile (extracted from assets/dateRange.js)');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');
const from = SRC.indexOf('  const TABLE_TIME_TTL');
const to = SRC.indexOf('  function renderKpiBand() {', from);
check('the table-time block is extractable', from > 0 && to > from);
if (failures) process.exit(1);
{
  const calls = [];
  let renders = 0, now = T1 + 3600e3;
  const pending = [];
  const ctx = vm.createContext({
    window: {}, Map, JSON, Math, Number, String, Infinity, URLSearchParams,
    Date: class extends Date { static now() { return now; } },
    hotelMerchant: () => M, activeMerchantSlug: () => M,
    rangeBounds: (r) => (r === 'aujourdhui' ? [T1, Infinity] : [T0, T1]),
    merchantDayKey: () => '2026-10-13', merchantDayBounds: () => ({ from: T1, to: T1 + 864e5 }),
    renderKpiBand: () => { renders++; },
    fetch: (url) => { calls.push(url); return new Promise((res) => pending.push({ url, res })); },
  });
  vm.runInContext(SRC.slice(from, to) + '\nthis.__tile = tableTimeTile; this.__from = tableTimeTileFrom;', ctx);
  const answer = async (i, ok, body) => { pending[i].res({ ok, json: () => Promise.resolve(body) }); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };

  let t = ctx.__tile('hier');
  check('before any answer: « … », not a zero', t.text === '…' && t.delta === null);
  check('one read for the period and one for the period before it', calls.length === 2
    && /from=1791781200000&to=1791867600000/.test(calls[0]) && /from=1791694800000&to=1791781200000/.test(calls[1]), calls.join(' | '));
  ctx.__tile('hier');
  check('a second paint does not read again while the first read is in flight', calls.length === 2);
  await answer(0, true, { ok: true, visits: 12, avgMin: 48 });
  check('the band is repainted when the answer arrives', renders === 1);
  t = ctx.__tile('hier');
  check('48 min, no comparison while the previous period is unknown', t.text === null && t.value === 48 && t.unit === 'min' && t.fmt === 'int' && t.delta === null, JSON.stringify(t));
  await answer(1, true, { ok: true, visits: 9, avgMin: 40 });
  t = ctx.__tile('hier');
  check('then the variation against the period before: +20 %', t.delta === 20, JSON.stringify(t));
  check('no new read within five minutes', calls.length === 2);

  ctx.__tile('aujourdhui');
  check('an open period (today) stops at the end of the business day: a stable key, not « now »',
    /from=1791867600000&to=1791954000000/.test(calls[2]), calls[2]);

  const F = ctx.__from;
  check('fewer than five visits: « · »', F({ data: { visits: 3, avgMin: null } }, null).text === '·');
  check('the server cannot tell: « · »', F({ data: null, error: 'unavailable' }, null).text === '·');
  check('a previous period at zero is no comparison', F({ data: { visits: 6, avgMin: 30 } }, { data: { visits: 0, avgMin: 0 } }).delta === null);
}

console.log('\n■ Wiring');
{
  const m = SRC.match(/const REAL_DELTAS = new Set\(\[([^\]]*)\]\)/);
  check('its variation reaches the screen (tempsTable in REAL_DELTAS)', !!m && /'tempsTable'/.test(m[1]));
  check('the server is asked only when the tile is on this store\'s band',
    /if \(Array\.isArray\(shown\) && shown\.includes\('tempsTable'\)\) data = \{ \.\.\.data, tempsTable: \{ \.\.\.data\.tempsTable, \.\.\.tableTimeTile\(rng\) \} \};/.test(SRC));
  check('the zeroed demo clone still starts at « · » (a spa cabin has no table visit)',
    /tempsTable: data\.tempsTable \? \{ \.\.\.data\.tempsTable, text: '·', unit: '', delta: null \}/.test(SRC));
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : `\n✓ ${passed} table-time checks green`);
process.exit(failures ? 1 : 0);
