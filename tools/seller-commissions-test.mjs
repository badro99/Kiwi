#!/usr/bin/env node
/* Commissions vendeurs (boutique) : l'attribution d'une vente de caisse à qui a
 * saisi son code, le calcul (functions/api/_commissions.js), la route
 * /api/commissions, et les deux portes : l'option « Commissions vendeurs » de
 * kiwi-admin (features.sellerCommissions) et le design 2027 (caisse et tableau
 * de bord). Données entièrement synthétiques. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { commissionsReport, nameKey, memberRate } from '../functions/api/_commissions.js';
import { sellerOf, tillSellerProof, readTillSellerProof } from '../functions/api/_seller.js';
import * as sale from '../functions/api/sale.js';
import * as route from '../functions/api/commissions.js';
import { routeMinTier } from '../functions/auth/_session-tier.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import { businessBoundary, businessDate } from '../functions/api/_business-day.js';
import { sellerCommissionsOn, commissionBoard, createSellerCommissions } from '../assets/planning/seller-commissions.js';
import { sellerDayOn, sellerDayRows } from '../assets/pos-boutique/seller-day.js';
import { sellerPickOn, sellerStripHtml, loadSellers, cachedSellers } from '../assets/pos-boutique/seller-pick.js';
import { topSellersOn, periodDays, rankSellers, topSellersHtml } from '../assets/home-top-sellers.js';
import * as sellersRoute from '../functions/api/sellers.js';

let controls = 0;
const check = (label, value, detail) => { assert.ok(value, label + (detail ? '\n    ' + detail : '')); controls++; console.log('  ✓ ' + label); };
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* ── 1. Le calcul pur ─────────────────────────────────────────────────────── */
console.log('■ 1. Calcul');
const members = [
  { id: 'm-1', firstName: 'Salma', lastName: 'Idrissi', commissionRate: 5 },
  { id: 'm-2', firstName: 'Rania', lastName: 'Tazi', commissionRate: 2.5 },
  { id: 'm-3', firstName: 'Aïcha', lastName: 'Benali' },                    // sans taux
  { id: 'm-4', firstName: 'Nour', lastName: 'Alami', commissionRate: 3 },  // sans vente
];
const r = commissionsReport({
  members,
  sales: [
    { seller_id: 'pin-x', seller_name: 'salma  idrissi', n: 3, cents: 100000 },
    { seller_id: 'pin-y', seller_name: 'Salma Idrissi', n: 1, cents: 20000 },   // id de code republié : même personne
    { seller_id: 'pin-r', seller_name: 'Rania Tazi', n: 2, cents: 40000 },
    { seller_id: '', seller_name: 'Aicha Benali', n: 1, cents: 15000 },          // accent oublié à la saisie
    { seller_id: 'm-2', seller_name: null, n: 1, cents: 1000 },                   // app employé : id de fiche
    { seller_id: null, seller_name: null, n: 4, cents: 9000 },                    // ventes d'avant
    { seller_id: 'pin-z', seller_name: 'Ancien Vendeur', n: 1, cents: 5000 },     // parti de l'équipe
  ],
  refunds: [{ seller_id: 'pin-x', seller_name: 'Salma Idrissi', cents: 20000 }, { seller_id: null, seller_name: null, cents: 1000 }],
});
const by = Object.fromEntries(r.sellers.map((s) => [s.name, s]));
check('one seller per person, whatever the code id or the spacing', by['Salma Idrissi'].tickets === 4 && by['Salma Idrissi'].salesCents === 120000);
check('a refund takes the commission back from who sold, on the net', by['Salma Idrissi'].netCents === 100000 && by['Salma Idrissi'].commissionCents === 5000);
check('an employee-app sale joins its member by id', by['Rania Tazi'].tickets === 3 && by['Rania Tazi'].commissionCents === Math.round(41000 * 0.025));
check('a name matches its member without accents or case', by['Aïcha Benali'] && by['Aïcha Benali'].inTeam && by['Aïcha Benali'].salesCents === 15000);
check('no rate means « à définir » (null), never an invented zero', by['Aïcha Benali'].commissionCents === null && r.totals.unrated === 2);
check('a rated member with no sale is listed at zero', by['Nour Alami'] && by['Nour Alami'].netCents === 0 && by['Nour Alami'].commissionCents === 0);
check('a seller who left keeps their sales, outside the team, without a rate', by['Ancien Vendeur'] && !by['Ancien Vendeur'].inTeam && by['Ancien Vendeur'].commissionCents === null);
check('sales with no seller stay unattributed, net of their refunds', r.unattributed.tickets === 4 && r.unattributed.netCents === 8000);
check('the total due adds only rated sellers', r.totals.commissionCents === 5000 + 1025 + 0);
check('sellers come sorted by net sales', r.sellers[0].name === 'Salma Idrissi');
const twins = commissionsReport({ members: [{ id: 'a', firstName: 'Sara', lastName: 'B', commissionRate: 5 }, { id: 'b', firstName: 'Sara', lastName: 'B', commissionRate: 9 }],
  sales: [{ seller_id: 'pin', seller_name: 'Sara B', n: 1, cents: 1000 }] });
check('two members with the same name: neither takes the other’s sales', twins.sellers.find((s) => s.tickets === 1 && !s.inTeam));
check('rates are bounded: 0, negative or junk means none; over 100 is 100', memberRate({ commissionRate: 0 }) === null && memberRate({ commissionRate: -3 }) === null
  && memberRate({ commissionRate: 'x' }) === null && memberRate({ commissionRate: 140 }) === 100);
check('name keys fold accents, case and spaces', nameKey('  Aïcha   BENALI ') === nameKey('aicha benali'));

/* ── 2. Qui a vendu ──────────────────────────────────────────────────────── */
console.log('■ 2. Attribution');
const KEY = 'seller-proof-test-secret';
const proof = await tillSellerProof(KEY, 'shop-a', { id: 'pin-1', name: ' Salma  Idrissi ' });
check('a till sale carries the person /api/pin/verify signed for', JSON.stringify(await sellerOf(null, { seller: { proof } }, { AUTH_SECRET: KEY }, 'shop-a')) === JSON.stringify({ id: 'pin-1', name: 'Salma Idrissi' }));
check('a name typed into the request is ignored: no proof, no seller', await sellerOf(null, { seller: { id: 'pin-1', name: 'Salma Idrissi' } }, { AUTH_SECRET: KEY }, 'shop-a') === null);
const [payload, sig] = proof.split('.');
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), name: 'Rania Tazi' })).toString('base64url') + '.' + sig;
check('a proof whose name was edited is refused', await sellerOf(null, { seller: { proof: forged } }, { AUTH_SECRET: KEY }, 'shop-a') === null);
check('a proof from another store or another key is refused', await sellerOf(null, { seller: { proof } }, { AUTH_SECRET: KEY }, 'shop-b') === null && await sellerOf(null, { seller: { proof } }, { AUTH_SECRET: 'other-key' }, 'shop-a') === null);
check('a proof lives one shift plus three days of offline queue, then expires', await readTillSellerProof(proof, KEY, 'shop-a', Date.now() + 80 * 3600000) && !(await readTillSellerProof(proof, KEY, 'shop-a', Date.now() + 90 * 3600000)));
check('the employee app wins over anything the body says', (await sellerOf({ session: { staffId: 'm-9' } }, { seller: { proof } }, { AUTH_SECRET: KEY }, 'shop-a')).id === 'm-9');
check('no proof is signed without a person', await tillSellerProof(KEY, 'shop-a', { id: 'x', name: '  ' }) === '' && await tillSellerProof(KEY, 'shop-a', null) === '');

/* ── 3. La base : la vente garde son vendeur, la route rend la période ─────── */
console.log('■ 3. Route');
const SECRET = 'seller-commissions-test-secret';
const M = 'synthetic-boutique';
function world(features, team = members) {
  const db = new DatabaseSync(':memory:');
  db.exec(read('schema.sql'));
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first: async () => db.prepare(query).get(...args) ?? null,
      all: async () => ({ results: db.prepare(query).all(...args) }),
      run: async () => { const x = db.prepare(query).run(...args); return { success: true, meta: { changes: x.changes } }; },
    };
    return st;
  };
  const DB = { prepare, batch: async (list) => { db.exec('BEGIN IMMEDIATE'); try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
  db.prepare('INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)').run('acc-owner', 'owner@example.invalid', 'Synthetic', 's', 'h', 1);
  db.prepare('INSERT INTO merchant_config (merchant, features, name, account_id, type, updated_ts) VALUES (?,?,?,?,?,?)').run(M, JSON.stringify(features), 'Synthetic', 'acc-owner', 'boutique', 1);
  db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'team', ?, 1, 1)").run(M, JSON.stringify({ members: team, removed: [{ id: 'm-gone' }] }));
  return { db, env: { DB, AUTH_SECRET: SECRET } };
}
const w = world({ sellerCommissions: true });
const till = `${TILL_COOKIE}=${await tillToken(SECRET, M)}`;
const owner = `${SESS_COOKIE}=${await makeSession('acc-owner', SECRET)}`;
const zone = 'Africa/Casablanca';
const day = businessDate(Date.now(), 5, zone);
const at = businessBoundary(day, 5, zone) + 3 * 3600000;
const proofFor = (id, name) => tillSellerProof(SECRET, M, { id, name });
async function pay(id, cents, seller, env = w.env) {
  const res = await sale.onRequestPost({ env, request: new Request('https://kiwi.test/api/sale', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: till },
    body: JSON.stringify({ merchant: M, id, amount: cents / 100, amountCents: cents, method: 'cash', label: 'Caftan', ref: id, ts: at, channel: 'counter',
      lines: [{ n: 'Caftan', q: 1, t: cents / 100 }], ...(seller ? { seller } : {}) }) }) });
  return res.status;
}
check('a till sale with its seller proof is stored', await pay('s-1', 150000, { proof: await proofFor('pin-a', 'Salma Idrissi') }) === 200);
await pay('s-2', 50000, { proof: await proofFor('pin-b', 'Rania Tazi') });
await pay('s-3', 30000, null);
await pay('s-4', 7000, { id: 'pin-z', name: 'Salma Idrissi' });   // un nom déclaré sans preuve
const row = w.db.prepare('SELECT seller_id, seller_name FROM sales WHERE id = ?').get('s-1');
check('sales.seller_name and seller_id hold the person, never a code', row.seller_name === 'Salma Idrissi' && row.seller_id === 'pin-a');
check('a sale without a seller stays without one', w.db.prepare('SELECT seller_name FROM sales WHERE id = ?').get('s-3').seller_name === null);
check('a sale that only names a seller is stored without one', w.db.prepare('SELECT seller_name FROM sales WHERE id = ?').get('s-4').seller_name === null);
w.db.prepare("INSERT INTO sale_audit (merchant, sale_id, action, amount, amount_cents, ts) VALUES (?, 's-1', 'refund', 500, 50000, ?)").run(M, at + 60000);
w.db.prepare("UPDATE sales SET void_ts = ? WHERE id = 's-2'").run(at + 1);
const ask = (cookie, from = day, to = day, env = w.env) => route.onRequestGet({ env, request: new Request(`https://kiwi.test/api/commissions?merchant=${M}&from=${from}&to=${to}`, { headers: { Cookie: cookie } }) });
const res = await ask(owner);
const body = await res.json();
const salma = body.sellers.find((s) => s.name === 'Salma Idrissi');
check('the owner reads the day: sales minus the refund, at the member’s rate', res.status === 200 && salma && salma.netCents === 100000 && salma.commissionCents === 5000, JSON.stringify(body));
check('a voided sale earns no commission', !body.sellers.some((s) => s.name === 'Rania Tazi' && s.tickets > 0));
check('the sales without a proven seller are reported apart', body.unattributed.netCents === 37000);
check('nothing credential-shaped leaves the route', !/pinCode|password|"pin"/.test(JSON.stringify(body)));
check('the paired till reads its own single day (day close)', (await ask(till)).status === 200);
const weekFrom = new Date(Date.parse(day + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
check('the paired till cannot read a longer period', (await ask(till, weekFrom, day)).status === 403);
check('the paired till cannot walk back through past days one at a time', (await ask(till, weekFrom, weekFrom)).status === 403);
const yesterday = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
check('the paired till may read yesterday, for a close past the cutoff', (await ask(till, yesterday, yesterday)).status === 200);
check('the owner still reads any past day', (await ask(owner, weekFrom, weekFrom)).status === 200);
check('no cookie, no figures', (await ask('')).status === 403);
check('a malformed or reversed range is refused', (await ask(owner, '2026-13-01', day)).status === 400 && (await ask(owner, day, weekFrom)).status === 400);
const off = world({});
check('switch off in kiwi-admin: the route answers feature-off', (await ask(owner, day, day, off.env)).status === 403
  && (await (await ask(owner, day, day, off.env)).json()).error === 'feature-off');
const loose = world({ sellerCommissions: 'true' });
check('only an explicit true turns it on', (await ask(owner, day, day, loose.env)).status === 403);
check('an account session needs the owner tier (pay amounts)', routeMinTier('/api/commissions') === 'owner' && routeMinTier('/API/Commissions/') === 'owner');

/* ── 4. Les portes : option + design 2027 ─────────────────────────────────── */
console.log('■ 4. Portes');
const docWith = (skin) => ({ documentElement: { getAttribute: (k) => (k === 'data-skin-2027' ? skin : null) } });
const on = { features: { sellerCommissions: true } }, offCfg = { features: {} };
check('dashboard tab: option on AND the 2027 dashboard kit', sellerCommissionsOn(docWith('dashboard'), on) && !sellerCommissionsOn(docWith(null), on) && !sellerCommissionsOn(docWith('dashboard'), offCfg));
check('till day close: option on AND the 2027 till', sellerDayOn(docWith('till'), on) && !sellerDayOn(docWith(null), on) && !sellerDayOn(docWith('till'), offCfg) && !sellerDayOn(docWith('dashboard'), on));
const rows = sellerDayRows({ sellers: [{ name: 'Salma Idrissi', tickets: 2, netCents: 100000, commissionCents: 5000 }, { name: 'Aïcha', tickets: 1, netCents: 2000, commissionCents: null }, { name: 'Nour', tickets: 0, netCents: 0, commissionCents: 0 }], unattributed: { netCents: 3000 } }, (v) => v.toFixed(2) + ' MAD');
check('the day close lists who sold, their commission or « à définir », and the rest', rows.length === 3 && /2 tickets/.test(rows[0][0]) && /commission 50\.00/.test(rows[0][1]) && /à définir/.test(rows[1][1]) && rows[2][0] === 'Sans vendeur identifié');
const admin = read('kiwi-admin.html');
check('kiwi-admin offers « Commissions vendeurs » under Boutique, off by default', /boutique:\s*\[[\s\S]*key:'sellerCommissions', label:'Commissions vendeurs', off:true/.test(admin));
const profile = read('assets/team/profile-ui.js');
check('the Team rate field exists only when the option is on', /sellerCommissions !== true \? '' : edField\(T, 'commissionRate'/.test(profile));
const rules = read('assets/team/access-rules.js');
check('saving a member with the field hidden keeps their rate', /data\.commissionRate == null\s*\?[^:]*prev && prev\.commissionRate/.test(rules));
const payroll = read('assets/planning/payroll-view.js'), teamCore = read('assets/team.js');
check('the Commissions tab lives in Équipe, behind the same two gates', /const commissionsOn = \(\) => window\.KiwiConfig\?\.features\?\.sellerCommissions === true\s*&& document\.documentElement\.getAttribute\('data-skin-2027'\) === 'dashboard'/.test(payroll)
  && /teamHours\.commissionsOn\?\.\(\) \? `<button[^`]*data-arg="commissions"/.test(teamCore) && /activeTab === 'commissions' && teamHours\.commissionsOn\?\.\(\) \? teamHours\.renderCommissionsPane\(T\)/.test(teamCore)
  && /kind === 'commissions' && teamHours\.commissionsOn\?\.\(\)/.test(teamCore));
check('Paie & planning no longer carries a Commissions tab', !/data-arg="commissions"/.test(payroll) && !/payTab === 'commissions'/.test(payroll));
const boutique = read('assets/pos-boutique.js');
check('the till sends the signed proof of who unlocked it, never a name', /const sellerProof = !IS_DEMO && window\.KiwiStaff && window\.KiwiStaff\.sellerProof;/.test(boutique) && /if \(typeof sellerProof === 'string' && sellerProof\) payload\.seller = \{ proof: sellerProof \};/.test(boutique));
check('the queue forwards only the proof to /api/sale', /body\.seller = \{ proof: entry\.seller\.proof\.slice\(0, 2048\) \};/.test(read('assets/live-link/queue-store.js')));
check('/api/pin/verify signs the proof for a till role, the pairing keeps it on KiwiStaff', /sellerProof: await tillSellerProof\(env\.AUTH_SECRET, merchant, verified\.staff\)/.test(read('functions/api/pin/verify.js'))
  && /s\.sellerProof = p\.sellerProof/.test(read('assets/caisse-pairing.js')) && (read('assets/caisse-pairing.js').match(/d\.sellerProof \? \{ sellerProof/g) || []).length === 2
  && /who\.sellerProof = String\(reply\.body\.sellerProof\)/.test(read('assets/kit/pin-flow.js')));
const saleSrc = read('functions/api/sale.js');
check('every sales INSERT path writes the seller columns', (saleSrc.match(/\.\.\.sellerVals/g) || []).length === 3 && (saleSrc.match(/sellerCols/g) || []).length >= 4 && !/sellerId\b/.test(saleSrc));

/* ── 5. Vendeur choisi à l'encaissement (features.sellerPicker) ───────────── */
console.log('■ 5. Vendeur choisi à l’encaissement');
const team5 = [...members, { id: 'm-gone', firstName: 'Parti', lastName: 'Avant', commissionRate: 4 }, { id: 'm-del', firstName: 'Effacé', lastName: 'Aussi', commissionRate: 4, deleted: true }];
const p5 = world({ sellerCommissions: true, sellerPicker: true }, team5);
const seller5 = (id) => p5.db.prepare('SELECT seller_id, seller_name FROM sales WHERE id = ?').get(id);
check('a picked team member is stored by id, with the name from the Team file', await pay('p-1', 80000, { member: 'm-1' }, p5.env) === 200
  && seller5('p-1').seller_id === 'm-1' && seller5('p-1').seller_name === 'Salma Idrissi');
await pay('p-2', 9000, { member: 'm-2', name: 'Quelqu’un d’autre' }, p5.env);
check('a name sent with the pick is ignored', seller5('p-2').seller_name === 'Rania Tazi');
await pay('p-3', 9000, { member: 'm-nobody' }, p5.env);
await pay('p-4', 9000, { member: 'm-gone' }, p5.env);
await pay('p-5', 9000, { member: 'm-del' }, p5.env);
check('an unknown, removed or deleted member is never credited', [seller5('p-3'), seller5('p-4'), seller5('p-5')].every((x) => x.seller_name === null && x.seller_id === null));
await pay('p-6', 9000, { proof: await proofFor('pin-a', 'Salma Idrissi') }, p5.env);
check('in picker mode the cashier’s own proof credits nobody: unpicked stays unattributed', seller5('p-6').seller_name === null);
await pay('p-7', 9000, { member: 'm-1' }, w.env);
check('without the picker option a member id in the body is ignored', w.db.prepare('SELECT seller_name FROM sales WHERE id = ?').get('p-7').seller_name === null);
const p5off = world({ sellerPicker: true }, team5);
await pay('p-8', 9000, { member: 'm-1' }, p5off.env);
check('the picker needs « Commissions vendeurs » on too', p5off.db.prepare('SELECT seller_name FROM sales WHERE id = ?').get('p-8').seller_name === null);
const rep5 = await (await ask(owner, day, day, p5.env)).json();
check('the commissions report counts a picked sale on its member', rep5.sellers.find((x) => x.memberId === 'm-1').netCents === 80000);
const roster = (cookie, env = p5.env) => sellersRoute.onRequestGet({ env, request: new Request(`https://kiwi.test/api/sellers?merchant=${M}`, { headers: { Cookie: cookie } }) });
const r5 = await roster(till), b5 = await r5.json();
check('the paired till reads the sellers: rated, active members only, by name', r5.status === 200 && b5.sellers.map((x) => x.name).join('|') === 'Nour Alami|Rania Tazi|Salma Idrissi', JSON.stringify(b5));
check('the list carries an id and a name, never a rate or a code', b5.sellers.every((x) => Object.keys(x).join() === 'id,name'));
check('the owner reads it too; no cookie reads nothing', (await roster(owner)).status === 200 && (await roster('')).status === 403);
check('the list answers feature-off unless both options are on', (await roster(till, w.env)).status === 403 && (await roster(till, p5off.env)).status === 403);

const docSkin = (skin) => ({ documentElement: { getAttribute: (k) => (k === 'data-skin-2027' ? skin : null) } });
const both = { features: { sellerCommissions: true, sellerPicker: true } };
check('the till picker needs both options and the 2027 till', sellerPickOn(docSkin('till'), both) && !sellerPickOn(docSkin(null), both)
  && !sellerPickOn(docSkin('till'), { features: { sellerCommissions: true } }) && !sellerPickOn(docSkin('till'), { features: { sellerPicker: true } }));
const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const strip = sellerStripHtml([{ id: 'm-1', name: 'Salma' }, { id: 'm-2', name: '<b>Rania</b>' }], { id: 'm-2' }, escHtml);
check('the strip is one row of chips, the picked one marked, names escaped', (strip.match(/data-bq-seller=/g) || []).length === 2
  && /aria-checked="true" data-bq-seller="m-2"/.test(strip) && !/<b>Rania/.test(strip) && /class="bq-split bq-seller" role="radiogroup"/.test(strip));
check('no sellers, no strip (nothing to tap, nothing drawn)', sellerStripHtml([], null, escHtml) === '');
const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const got = await loadSellers('shop-x', { storage, fetchImpl: async () => ({ ok: true, json: async () => ({ sellers: [{ id: 'a', name: 'Amal' }, { id: 7, name: 'bad' }] }) }) });
check('the list is cleaned and kept per store for the offline till', got.length === 1 && JSON.parse(mem.get('kiwiSellers@shop-x'))[0].name === 'Amal');
const again = await loadSellers('shop-x', { storage, now: Date.now() + 10 * 60000, fetchImpl: async () => { throw new Error('offline'); } });
check('offline, the last list stays', again.length === 1 && cachedSellers('shop-x', storage)[0].id === 'a');

const b5src = read('assets/pos-boutique.js');
check('picker mode sends only the picked member id, and no proof when nobody was picked', /if \(!IS_DEMO && sellerPickOn\(\)\) \{ if \(t\.seller && t\.seller\.id\) payload\.seller = \{ member: t\.seller\.id \}; \}\s*\/\/[^\n]*\n\s*else if \(typeof sellerProof === 'string' && sellerProof\) payload\.seller = \{ proof: sellerProof \};/.test(b5src)
  && /afterMethods: \(el\) => mountSellerPick\(el, t, \{ slug: merchantSlug\(\), esc \}\)/.test(b5src));
check('the payment sheet calls the hook after drawing its methods', /icons\(\); closeBtns\(\); if \(opts\.afterMethods\) opts\.afterMethods\(el\);/.test(read('assets/pos-boutique/checkout.js')));
check('the queue forwards the member id, the server takes the name', /body\.seller = \{ member: entry\.seller\.member\.slice\(0, 96\) \};/.test(read('assets/live-link/queue-store.js')));
check('kiwi-admin offers « Vendeur choisi à l’encaissement », off by default', /key:'sellerPicker', label:'Vendeur choisi à l’encaissement', off:true/.test(read('kiwi-admin.html')));

/* ── 6. L'onglet du propriétaire : taux tapés sur place, mise en place ────── */
console.log('■ 6. Onglet Commissions');
const crew = [
  { id: 'a', firstName: 'Salma', lastName: 'Idrissi', commissionRate: 6 },
  { id: 'b', firstName: 'Rania', lastName: 'Tazi' },
  { id: 'c', firstName: 'Nour', lastName: 'Alami', commissionRate: 3 },
  { id: 'd', firstName: 'Karim', lastName: 'Berrada' },
  { id: 'e', firstName: 'Effacé', lastName: 'X', commissionRate: 9, deleted: true },
];
const full = (m) => `${m.firstName} ${m.lastName}`;
const rep6 = { sellers: [
  { key: 'm:a', memberId: 'a', name: 'Salma Idrissi', rate: 5, inTeam: true, tickets: 4, salesCents: 110000, refundCents: 10000, netCents: 100000, commissionCents: 5000 },
  { key: 'm:b', memberId: 'b', name: 'Rania Tazi', rate: null, inTeam: true, tickets: 2, salesCents: 30000, refundCents: 0, netCents: 30000, commissionCents: null },
  { key: 'n:old', memberId: '', name: 'Ancien', rate: null, inTeam: false, tickets: 1, salesCents: 5000, refundCents: 0, netCents: 5000, commissionCents: null }],
  unattributed: { tickets: 3, netCents: 15000 } };
const bd = commissionBoard(rep6, crew, full);
const row6 = Object.fromEntries(bd.board.map((r) => [r.key, r]));
check('the rate the owner just typed wins over the one the server computed with', row6['m:a'].rate === 6 && row6['m:a'].commissionCents === 6000);
check('a seller without a rate shows their sales and no invented commission', row6['m:b'].commissionCents === null && row6['m:b'].netCents === 30000);
check('a rated seller with no sale is on the board at zero', row6['m:c'] && row6['m:c'].netCents === 0 && row6['m:c'].commissionCents === 0);
check('nobody else is on the board; deleted members appear nowhere', bd.others.map((m) => m.id).join() === 'd' && !bd.board.some((r) => r.memberId === 'e'));
check('the total due, the attributed net and the share with a seller add up', bd.dueCents === 6000 && bd.netCents === 135000 && bd.sharePct === 90 && bd.sellers === 3);
check('the total counts only sellers with a rate; the others are named apart', bd.countedCents === 100000 && bd.counted === 1 && bd.pending.netCents === 35000 && bd.pending.names.join() === 'Rania Tazi,Ancien');
check('the board sorts by what each one sold', bd.board[0].key === 'm:a' && bd.board[bd.board.length - 1].key === 'm:c');

const escH = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt6 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const crew2 = crew.map((m) => ({ ...m }));
let saves = 0, renders = 0, toasts = [];
const view = (fetchImpl, slugV = 'shop', list = crew2) => createSellerCommissions({ esc: escH, fmtPay: fmt6, trLang: () => 'fr', slug: () => slugV, render: () => { renders++; }, fetchImpl,
  members: () => list, saveMembers: () => { saves++; }, memberName: full, toast: (m) => toasts.push(m), pickerMode: () => true });
const period6 = { days: ['2026-11-16', '2026-11-22'], startFr: '16/11', endFr: '22/11' };
const v6 = view(async () => ({ ok: true, json: async () => rep6 }));
check('the tab first says it is working', /data-kt-commissions="loading"/.test(v6.pane(period6)));
await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
const html6 = v6.pane(period6);
check('then the board: total due, who sold, the math on each line', /data-kt-commissions="ok"/.test(html6) && /60\.00/.test(html6) && /6 % de 1000\.00/.test(html6) && /Donnez un taux/.test(html6));
check('the headline sums only rated sellers and names the missing rates', /sur 1000\.00\u00a0MAD de ventes attribuées à 1 vendeur,/.test(html6) && /2 vendeurs · 350\.00\u00a0MAD pas encore comptés : taux manquant/.test(html6));
check('« Donnez un taux » is a label that focuses that seller’s box', /<label class="is-unset" for="kt-com-r-b">Donnez un taux<\/label>/.test(html6) && /id="kt-com-r-b"/.test(html6));
check('every team member’s rate is a box typed in place, labelled for screen readers', (html6.match(/data-kt-com-rate="/g) || []).length === 4 && /aria-label="Taux de commission de Rania Tazi"/.test(html6));
check('the tab explains how sales reach a seller in this store (picker mode)', /la caissière touche le nom du vendeur/.test(html6));
v6.setRate('b', '4,5');
check('typing a rate saves it on the member and redraws', crew2[1].commissionRate === 4.5 && saves === 1 && renders >= 2 && /Rania Tazi : 4.5 %/.test(toasts[0]));
v6.setRate('b', '250'); const capped = crew2[1].commissionRate;
v6.setRate('b', ''); 
check('rates are capped at 100, and an empty box removes the commission', capped === 100 && crew2[1].commissionRate === 0 && saves === 3);
v6.setRate('b', '0');
check('re-typing the same value does not save again', saves === 3);
const bare = crew.map((m) => ({ ...m, commissionRate: undefined }));
const demo = view(null, '', bare).pane(period6);
check('no store (demo) and no rate: the three-step setup with the team, never an error', /data-kt-commissions="setup"/.test(demo) && /Tapez un taux à côté de chaque vendeur/.test(demo) && (demo.match(/data-kt-com-rate="/g) || []).length === 4);
const failed = view(async () => ({ ok: false }));
failed.pane(period6); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
check('a failed load offers to try again on the same tab', /data-kt-commissions="error"[\s\S]*data-arg="commissions"/.test(failed.pane(period6)));
check('the Commissions tab is the owner’s: managers (planning access) never see it', /=== 'dashboard' && payrollAccess\(\) === 'full';/.test(read('assets/planning/payroll-view.js')));
check('no em dash in the tab’s copy', !/—/.test(read('assets/planning/seller-commissions.js')));


/* ── 7. Accueil : « Meilleurs vendeurs » ──────────────────────────────────── */
console.log('■ 7. Carte d’accueil');
check('home card: option on, 2027 dashboard kit, owner only', topSellersOn(docWith('dashboard'), on, 'owner') && topSellersOn(docWith('dashboard'), on, undefined)
  && !topSellersOn(docWith('dashboard'), on, 'manager') && !topSellersOn(docWith(null), on, 'owner') && !topSellersOn(docWith('dashboard'), offCfg, 'owner'));
const oppo = read('assets/oppo-cards.js');
check('the card’s code loads only for a store with the option (no extra tag on the dashboard)', /features\?\.sellerCommissions !== true\) return;[\s\S]{0,80}import\('\.\/home-top-sellers\.js\?v=\d+'\)/.test(oppo) && !/home-top-sellers/.test(read('dashboard.html')));
const dayDR = { getDateRange: () => 'aujourdhui', selectedBusinessDay: () => '2026-11-21', bounds: () => null };
const weekDR = { getDateRange: () => '7j', selectedBusinessDay: () => null,
  bounds: () => [new Date(2026, 10, 15, 5).getTime(), new Date(2026, 10, 22, 5).getTime()] };
const midDR = { getDateRange: () => 'mois', selectedBusinessDay: () => null, bounds: () => [new Date(2026, 10, 1).getTime(), new Date(2026, 11, 1).getTime()] };
const pw = periodDays(weekDR, new Date(2026, 11, 30).getTime()), pm = periodDays(midDR, new Date(2026, 11, 30).getTime());
check('the home period becomes business days: a single day stays one day, 5 h and midnight bounds end the day before', JSON.stringify(periodDays(dayDR)) === '{"from":"2026-11-21","to":"2026-11-21"}'
  && pw.from === '2026-11-15' && pw.to === '2026-11-21' && pm.from === '2026-11-01' && pm.to === '2026-11-30');
check('a period that runs past today stops at tomorrow at most', periodDays(midDR, new Date(2026, 10, 10, 12).getTime()).to === '2026-11-11');
const rk = rankSellers({ sellers: [
  { name: 'Nour', tickets: 1, netCents: 20000, commissionCents: null },
  { name: 'Salma', tickets: 5, netCents: 90000, commissionCents: 4500 },
  { name: 'Idle', tickets: 0, netCents: 0, commissionCents: 0 },
  { name: 'Rania', tickets: 3, netCents: 50000, commissionCents: 2000 },
  { name: 'Karim', tickets: 2, netCents: 10000, commissionCents: 300 }], unattributed: { tickets: 2, netCents: 7000 } });
check('the ranking: who sold most first, nobody who sold nothing, the commissions due summed', rk.rows.map((r) => r.name).join() === 'Salma,Rania,Nour,Karim' && rk.dueCents === 6800 && rk.loose.netCents === 7000);
const hh = topSellersHtml({ sellers: [
  { name: 'Salma <b>', tickets: 5, netCents: 90000, commissionCents: 4500 }, { name: 'Rania', tickets: 3, netCents: 50000, commissionCents: 2000 },
  { name: 'Nour', tickets: 1, netCents: 20000, commissionCents: null }, { name: 'Karim', tickets: 2, netCents: 10000, commissionCents: 300 }],
  unattributed: { tickets: 2, netCents: 7000 } }, { lang: 'fr', period: 'Aujourd’hui' });
check('a podium of three, the rest in a list, names escaped', (hh.match(/class="tsl-p is-/g) || []).length === 3 && (hh.match(/class="tsl-row"/g) || []).length === 1
  && /Salma &lt;b&gt;/.test(hh) && !/Salma <b>/.test(hh) && /En tête/.test(hh));
check('the header says the period and the commissions due; a missing rate reads « taux à définir », never 0', /Aujourd’hui · 68\.00\u00a0MAD de commissions/.test(hh) && /taux à définir/.test(hh) && /commission 45\.00\u00a0MAD/.test(hh));
check('sales with no seller are counted apart, under the podium', /2 tickets · 70\.00\u00a0MAD sans vendeur/.test(hh));
check('one tap opens Équipe › Commissions', /data-action="home-commissions"/.test(hh) && /H\['nav-equipe'\]\(\)[\s\S]{0,120}H\['kt-tab'\]\(null, 'commissions'\)/.test(read('assets/home-top-sellers.js')));
const emptyH = topSellersHtml({ sellers: [{ name: 'Idle', tickets: 0, netCents: 0 }] }, { lang: 'en', period: 'Today' });
check('no sale yet: one plain sentence, no empty podium', /tsl-empty/.test(emptyH) && !/tsl-podium/.test(emptyH) && /No attributed sales/.test(emptyH));
check('Arabic copy is there and no em dash anywhere on the card', /أفضل البائعين/.test(topSellersHtml({ sellers: [] }, { lang: 'ar' })) && !/—/.test(read('assets/home-top-sellers.js')));

console.log(`\nseller-commissions-test · ${controls} contrôles`);
