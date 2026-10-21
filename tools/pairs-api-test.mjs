#!/usr/bin/env node
import serveurTestSource from './serveur-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
/* « Souvent avec… » côté serveur et côté caisse, sans navigateur.
 *
 *   1 · functions/api/pairs.js sur une vraie base SQLite bâtie depuis
 *       schema.sql : qui peut lire, quels tickets comptent (28 jours, non
 *       annulés, lignes avec un id d'article, hors éléments de formule), les
 *       seuils, le cache.
 *   2 · assets/caisse-pairs.js dans un bac à sable : la suggestion suit le
 *       dernier article entré, ne propose jamais ce qui est déjà commandé ni
 *       ce qui ne se vend pas, oublie ce qu'on a écarté à la commande suivante,
 *       et ne lit que les paires du commerce de CETTE caisse. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE, employeeToken, EMPLOYEE_COOKIE } from '../functions/auth/_lib.js';
import * as pairsApi from '../functions/api/pairs.js';
import { computePairs, MIN_BASKETS } from '../functions/api/_pairs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'pairs-api-test-secret';
const M = 'pairs-test-bistro', OTHER = 'pairs-other-cafe';
let failures = 0, passed = 0;
const check = (label, ok, detail) => { if (ok) { passed++; console.log('  ✓ ' + label); } else { failures++; console.log('  ✗ ' + label + (detail ? '\n      ' + detail : '')); } };

const sql = new DatabaseSync(':memory:');
for (const stmt of fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8').replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) sql.exec(stmt);
const DB = {
  reads: 0,
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { DB.reads++; return { results: sql.prepare(query).all(...args) }; },
      run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  },
};
const env = { DB, AUTH_SECRET: SECRET };
for (const m of [M, OTHER]) {
  sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)').run(m, '{}', m, Date.now());
}
const NOW = Date.parse('2026-10-13T12:00:00Z');
let seq = 0;
const L = (i, n, q = 1, extra = {}) => ({ i, n, q, t: 10 * q, ...extra });
function sale(merchant, lines, { ts = NOW - 3600e3, voided = false } = {}) {
  seq++;
  sql.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, void_ts)
               VALUES (?, ?, 20, 2000, 'cash', 'Vente', ?, ?, ?, ?)`)
    .run(`s-${seq}`, merchant, `R${seq}`, ts, lines == null ? null : JSON.stringify(lines), voided ? ts + 1 : null);
}
const THE = () => L('it_the', 'Thé à la menthe'), MSEMEN = () => L('it_msemen', 'Msemen miel'),
  CAFE = () => L('it_cafe', 'Café noir'), JUS = () => L('it_jus', 'Orange pressée');

/* 24 tickets à plusieurs articles dans la fenêtre. */
for (let k = 0; k < 12; k++) sale(M, [MSEMEN(), THE()]);
for (let k = 0; k < 6; k++) sale(M, [CAFE(), JUS()]);
for (let k = 0; k < 6; k++) sale(M, [CAFE(), THE()]);
for (let k = 0; k < 10; k++) sale(M, [CAFE()]);                                   // le café seul, souvent
for (let k = 0; k < 9; k++) sale(M, [MSEMEN(), JUS()], { voided: true });        // annulés : ne comptent pas
for (let k = 0; k < 9; k++) sale(M, [MSEMEN(), JUS()], { ts: NOW - 40 * 864e5 }); // trop anciens
for (let k = 0; k < 9; k++) sale(M, [L('', 'Sans id'), L('', 'Autre sans id')]);   // pas ajoutables
for (let k = 0; k < 9; k++) sale(M, [L('it_menu', 'Menu midi'), L('it_salade', 'Salade', 1, { kd: 'formula-part' }), THE()]);
sale(M, null);
for (let k = 0; k < 30; k++) sale(OTHER, [L('x_a', 'A'), L('x_b', 'B')]);

const cookieFor = async (m) => `${TILL_COOKIE}=${await tillToken(SECRET, m)}`;
async function get(merchant, cookie, deps = {}) {
  const req = new Request('https://kiwi-os.com/api/pairs?merchant=' + encodeURIComponent(merchant), { headers: cookie ? { Cookie: cookie } : {} });
  const res = await pairsApi.onRequestGet({ request: req, env }, { now: () => NOW, ...deps });
  return { status: res.status, cache: res.headers.get('Cache-Control'), body: await res.json() };
}

console.log('■ /api/pairs (tools/pairs-api-test.mjs)');
const ok = await get(M, await cookieFor(M), { noCache: true });
check('the paired till reads its own pairs', ok.status === 200 && ok.body.merchant === M, JSON.stringify(ok).slice(0, 200));
check('multi-item tickets counted: 33 (voided, older than 28 days and id-less tickets left out)', ok.body.baskets === 33, String(ok.body.baskets));
const msemen = ok.body.pairs.it_msemen || [];
check('after a msemen: the thé (12 of its 12 tickets)', msemen[0] && msemen[0].i === 'it_the' && msemen[0].together === 12 && msemen[0].share === 1, JSON.stringify(msemen));
check('voided and old msemen + jus tickets do not make a pair', !msemen.some((p) => p.i === 'it_jus'));
const cafe = ok.body.pairs.it_cafe || [];
check('after a café: jus and thé, 6 tickets each, 27 % of its 22 tickets', cafe.length === 2 && cafe.every((p) => p.together === 6 && Math.round(p.share * 100) === 27), JSON.stringify(cafe));
const the = ok.body.pairs.it_the || [];
check('after a thé: nothing reaches a quarter of its 27 tickets except msemen (12) and the lunch menu (9)', the.map((p) => p.i).join(',') === 'it_msemen,it_menu', JSON.stringify(the));
check('a formula part is not suggested next to its own formula', !JSON.stringify(ok.body.pairs).includes('it_salade'));
check('id-less lines never become a suggestion', !JSON.stringify(ok.body.pairs).includes('Sans id'));
check('the answer may be cached by the till for a quarter of an hour, privately', ok.cache === 'private, max-age=900');

const other = await get(M, await cookieFor(OTHER), { noCache: true });
check('a till paired to another store gets a 403, nothing else', other.status === 403 && !other.body.pairs, JSON.stringify(other));
const anon = await get(M, '', { noCache: true });
check('no proof at all: 403', anon.status === 403);
const none = await pairsApi.onRequestGet({ request: new Request('https://kiwi-os.com/api/pairs'), env }, { now: () => NOW });
check('no merchant asked: 400', none.status === 400);
const otherOwn = await get(OTHER, await cookieFor(OTHER), { noCache: true });
check('each store sees only its own tickets', otherOwn.status === 200 && Object.keys(otherOwn.body.pairs).every((k) => k.startsWith('x_')), JSON.stringify(otherOwn.body.pairs));

console.log('\n■ The waiter app (a clocked-in service employee)');
{
  const doc = (merchant, feature, data) => sql.prepare('INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)')
    .run(merchant, feature, JSON.stringify(data), Date.now());
  doc(M, 'team', { members: [
    { id: 'w-on', name: 'Salle', function: 'serveur' },
    { id: 'w-off', name: 'Repos', function: 'serveur' },
    { id: 'k-on', name: 'Cuisine', function: 'cuisinier' },
  ] });
  doc(M, 'attendance', { entries: [{ memberId: 'w-on', inTs: NOW - 3600e3 }, { memberId: 'k-on', inTs: NOW - 3600e3 }] });
  doc(OTHER, 'team', { members: [{ id: 'w-x', name: 'Ailleurs', function: 'serveur' }] });
  doc(OTHER, 'attendance', { entries: [{ memberId: 'w-x', inTs: NOW - 3600e3 }] });
  const emp = async (merchant, staffId) => `${EMPLOYEE_COOKIE}=${await employeeToken(SECRET, { merchant, staffId, authVersion: 0 })}`;
  const on = await get(M, await emp(M, 'w-on'), { noCache: true });
  check('a waiter on shift reads the pairs of their store', on.status === 200 && on.body.merchant === M && !!on.body.pairs.it_msemen, JSON.stringify(on).slice(0, 160));
  const off = await get(M, await emp(M, 'w-off'), { noCache: true });
  check('a waiter who is not clocked in: 403', off.status === 403, JSON.stringify(off));
  const kitchen = await get(M, await emp(M, 'k-on'), { noCache: true });
  check('kitchen staff on shift: 403 (not a service role)', kitchen.status === 403, JSON.stringify(kitchen));
  const elsewhere = await get(M, await emp(OTHER, 'w-x'), { noCache: true });
  check('a waiter of another store: 403', elsewhere.status === 403, JSON.stringify(elsewhere));
}

const before = DB.reads;
const later = () => NOW + 31 * 60 * 1000;                 // the earlier answer has expired
await get(M, await cookieFor(M), { now: later });
await get(M, await cookieFor(M), { now: later });
check('thirty minutes of cache: two reads in a row cost one query', DB.reads - before === 1, String(DB.reads - before));

console.log('\n■ Thresholds (functions/api/_pairs.js)');
const few = computePairs(Array.from({ length: MIN_BASKETS - 1 }, () => [THE(), MSEMEN()]));
check(`below ${MIN_BASKETS} multi-item tickets: no pair at all`, Object.keys(few.pairs).length === 0 && few.baskets === MIN_BASKETS - 1);
const four = computePairs([...Array.from({ length: 4 }, () => [THE(), MSEMEN()]), ...Array.from({ length: 20 }, (_, k) => [L('a' + k, 'A'), L('b' + k, 'B')])]);
check('a pair seen 4 times is not one', !four.pairs.it_the);
const crowd = computePairs([
  ...Array.from({ length: 20 }, () => [L('lead', 'Lead'), L('p1', 'P1'), L('p2', 'P2'), L('p3', 'P3'), L('p4', 'P4')]),
]);
check('three suggestions per article at most', crowd.pairs.lead.length === 3);
const qty0 = computePairs(Array.from({ length: 20 }, () => [THE(), { ...MSEMEN(), q: 0 }, CAFE()]));
check('a line at quantity 0 is not in the basket', !JSON.stringify(qty0.pairs).includes('it_msemen'));

console.log('\n■ assets/caisse-pairs.js');
const MOD = fs.readFileSync(path.join(ROOT, 'assets/caisse-pairs.js'), 'utf8');
function sandbox({ paired = true, merchant = M, live = 'someone-else', body = ok.body, store = {} } = {}) {
  const calls = [];
  const window = {
    KiwiCaissePairing: { isPaired: () => paired, pairedVenue: () => (paired ? { merchant } : null) },
    KiwiLive: { merchant: () => live },
    addEventListener() {},
  };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ctx = vm.createContext({
    window, localStorage, JSON, Math, Set, Object, Array, String, Number, Date, Promise, encodeURIComponent,
    setTimeout: () => 0, setInterval: () => 0,
    fetch: (url) => { calls.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(body) }); },
  });
  vm.runInContext(MOD, ctx);
  return { P: window.KiwiPairs, calls, store };
}
{
  const { P, calls, store } = sandbox();
  await P.refresh();
  check('it asks for the pairs of the store this till is paired to, not the browser-wide merchant', calls[0] === '/api/pairs?merchant=' + M, calls[0]);
  check('the cache lives under « kiwi: », so unpairing purges it', Object.keys(store).includes('kiwi:pairs:' + M));
  const all = () => true;
  const s1 = P.suggest(['it_msemen'], all, 'cart');
  check('msemen in the order: suggest the thé', s1 && s1.id === 'it_the' && s1.lead === 'it_msemen', JSON.stringify(s1));
  const s0 = P.suggest(['it_msemen', 'it_the'], all, 'cart');
  check('never what is already ordered (thé → msemen is skipped, the lunch menu comes next)', s0 && s0.id === 'it_menu', JSON.stringify(s0));
  check('and nothing when every partner is ordered or unsellable', P.suggest(['it_msemen', 'it_the'], (id) => id !== 'it_menu', 'cart') === null);
  const s2 = P.suggest(['it_msemen', 'it_cafe'], all, 'cart');
  check('the last item entered leads (café → jus, not msemen → thé)', s2 && s2.lead === 'it_cafe' && s2.id === 'it_jus', JSON.stringify(s2));
  check('an item that cannot be sold now is skipped for the next one', P.suggest(['it_cafe'], (id) => id !== 'it_jus', 'cart').id === 'it_the');
  check('a sellable check that throws counts as « no »', P.suggest(['it_msemen'], () => { throw new Error('x'); }, 'cart') === null);
  P.dismiss('cart', 'it_the');
  check('dismissed in this order: not proposed again', P.suggest(['it_msemen'], all, 'cart') === null);
  check('another order (a table) is not affected', P.suggest(['it_msemen'], all, 'table:4').id === 'it_the');
  P.suggest([], all, 'cart');
  check('an empty order starts afresh', P.suggest(['it_msemen'], all, 'cart').id === 'it_the');
  P.dismiss('table:4', 'it_the');
  P.reset('table:4');
  check('reset() forgets the dismissals of that order only', P.suggest(['it_msemen'], all, 'table:4').id === 'it_the');
}
{
  const CA0 = caisseTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
  check('an emptied take-away order resets its dismissals before showing the empty till',
    /if \(cart\.length === 0\) \{\s*try \{ window\.KiwiPairs && KiwiPairs\.reset\('cart'\); \}/.test(CA0));
  check('so does an emptied table order', /KiwiPairs\.reset\('table:' \+ tableId\)/.test(CA0));
}
{
  const { P, calls } = sandbox({ paired: false });
  await P.refresh();
  check('an unpaired (demo) till asks nothing and suggests nothing', calls.length === 0 && P.suggest(['it_msemen'], () => true, 'cart') === null);
}
{
  const { P } = sandbox({ body: { ...ok.body, merchant: OTHER } });
  await P.refresh();
  check('an answer about another store is thrown away', P.suggest(['it_msemen'], () => true, 'cart') === null);
}
{
  const cached = { ['kiwi:pairs:' + M]: JSON.stringify({ merchant: M, pairs: { it_msemen: [{ i: 'it_the', n: 'Thé', together: 9, share: 0.5 }] }, at: 1 }) };
  const { P } = sandbox({ store: cached, body: null });
  check('offline at boot: the last pairs of THIS store are used', P.suggest(['it_msemen'], () => true, 'cart').id === 'it_the');
  const { P: P2 } = sandbox({ store: cached, merchant: OTHER, body: null });
  check('a till paired elsewhere never reads that cache', P2.suggest(['it_msemen'], () => true, 'cart') === null);
}

console.log('\n■ Wiring in kiwi-caisse.html');
const CA = caisseTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
check('the till loads the module', /<script src="assets\/caisse-pairs\.js\?v=\d+" defer><\/script>/.test(CA));
check('take-away and table orders both offer it', /pairSuggestHtml\(cart, 'cart'\)/.test(CA) && /pairSuggestHtml\(order, 'table:' \+ tableId\)/.test(CA));
check('never on the demo till', /if \(IS_DEMO \|\| !window\.KiwiPairs/.test(CA));
check('a tap adds through the normal path (options, formula, sold-out)', /data-pair-add[\s\S]{0,400}addToTableOrder\(selectedId, id\)[\s\S]{0,80}addToCart\(id\)/.test(CA));
check('names are escaped, in the till language (menuName), words from KiwiPairs.say(carteLang())',
  /const lName = kdsEsc\(menuName\(lead\)\), mName = kdsEsc\(menuName\(m\)\);/.test(CA) && /KiwiPairs\.say\(carteLang\(\)\)/.test(CA));

{
  const { calls } = sandbox({ paired: false });
  const window2 = {};
  const store2 = {};
  const calls2 = [];
  const ctx2 = vm.createContext({
    window: Object.assign(window2, { KiwiPairsMerchant: () => 'waiter-store', addEventListener() {} }),
    localStorage: { getItem: (k) => store2[k] ?? null, setItem: (k, v) => { store2[k] = v; } },
    JSON, Math, Set, Object, Array, String, Number, Date, Promise, encodeURIComponent, setTimeout: () => 0, setInterval: () => 0,
    fetch: (url) => { calls2.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({ merchant: 'waiter-store', pairs: { a: [{ i: 'b', n: 'B', together: 6, share: 0.5 }] } }) }); },
  });
  vm.runInContext(MOD, ctx2);
  await window2.KiwiPairs.refresh();
  check('the waiter app declares its own store (KiwiPairsMerchant), no till pairing needed', calls2[0] === '/api/pairs?merchant=waiter-store' && window2.KiwiPairs.suggest(['a'], () => true, 'table:3').id === 'b');
  check('and calls was untouched on the unpaired till', calls.length === 0);
  const say = window2.KiwiPairs.say;
  check('say(fr) is the French copy', say('fr').lead('A', 'B') === 'Souvent avec A · <b>B</b>' && say('fr').why(86, 'A') === '86 % des tickets avec A · 28 derniers jours');
  check('say(en) and say(ar) speak their language', say('en').lead('A', 'B') === 'Often with A · <b>B</b>' && /^غالباً مع A/.test(say('ar').lead('A', 'B')) && say('ary') === say('ar'));
  check('an unknown language falls back to French', say('xx') === say('fr') && say(undefined) === say('fr'));
  check('« × » names what it sets aside: order, table, ticket',
    / pour cette commande$/.test(say('fr').dismiss('B')) && / pour cette table$/.test(say('fr').dismiss('B', 'table')) && / for this ticket$/.test(say('en').dismiss('B', 'ticket')));
  check('no em dash in any of the copy', !/\u2014/.test(JSON.stringify(['fr', 'en', 'ar'].map((l) => [say(l).lead('a', 'b'), say(l).why(1, 'a'), say(l).add('b'), say(l).dismiss('b'), say(l).dismiss('b', 'table'), say(l).dismiss('b', 'ticket')]))));
}
const SV = serveurTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8'));
check('the waiter app loads the module and declares its store only outside the demo',
  /<script src="assets\/caisse-pairs\.js\?v=\d+" defer><\/script>/.test(SV) && /window\.KiwiPairsMerchant = function \(\) \{ return svReal\(\) \? svMerchant\(\) : ''; \};/.test(SV));
check('it shows the chip above the order bar, never in the demo', /if \(order && order\.length && !SV_DEMO && window\.KiwiPairs/.test(SV));
check('« + » goes through the same path as a tap on the dish (formula, options, add)',
  /data-pair-add[\s\S]{0,200}itemHasFormula\(id\)\) openFormulaSheet\(id\);\s*else if \(itemHasOptions\(id\)\) openOptionsSheet\(id\);\s*else addToTableOrder\(menuContextId, id\)/.test(SV));
check('leaving the menu or emptying the table hides it and resets what was dismissed',
  /currentTab !== 'menu'\) \{\s*bar\.classList\.remove\('is-visible'\);\s*svRenderPair\(null\);/.test(SV) && /KiwiPairs\.reset\('table:' \+ menuContextId\)/.test(SV));

const BQ = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique.js'), 'utf8');
check('the boutique ticket offers it after its lines, never in the demo nor in an exchange',
  /lineRow\(ln, i\)\)\.join\(''\) \+ pairRow\(t\)/.test(BQ) && /if \(isDemoStore\(\) \|\| state\.exchange \|\| !window\.KiwiPairs/.test(BQ));
check('boutique « + » opens the article sheet (size, colour, stock), like a tap in the grid',
  /data-bq-pair-add[\s\S]{0,120}openSheet\(pairAdd\.dataset\.bqPairAdd\)/.test(BQ));
check('its own attributes, so the restaurant handler (data-pair-add) never fires on it',
  !/data-pair-add=/.test(BQ.slice(BQ.indexOf('function pairRow'), BQ.indexOf('/* central add'))));
check('an article with no piece left in any colour is never offered',
  /function pairSellable\(id\)[\s\S]{0,260}firstFreeFor\(p, c\)/.test(BQ));
check('an emptied ticket forgets what was set aside', /if \(!t\.lines\.length\) \{ try \{ window\.KiwiPairs && KiwiPairs\.reset\('ticket'\)/.test(BQ));

console.log(failures ? `\n✗ ${failures} check(s) failed` : `\n✓ ${passed} pairs checks green`);
process.exit(failures ? 1 : 0);
