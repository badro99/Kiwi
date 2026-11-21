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
import { sellerCommissionsOn } from '../assets/planning/seller-commissions.js';
import { sellerDayOn, sellerDayRows } from '../assets/pos-boutique/seller-day.js';

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
check('a till sale carries the person /api/pin/verify signed for', JSON.stringify(await sellerOf(null, { seller: { proof } }, KEY, 'shop-a')) === JSON.stringify({ id: 'pin-1', name: 'Salma Idrissi' }));
check('a name typed into the request is ignored: no proof, no seller', await sellerOf(null, { seller: { id: 'pin-1', name: 'Salma Idrissi' } }, KEY, 'shop-a') === null);
const [payload, sig] = proof.split('.');
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), name: 'Rania Tazi' })).toString('base64url') + '.' + sig;
check('a proof whose name was edited is refused', await sellerOf(null, { seller: { proof: forged } }, KEY, 'shop-a') === null);
check('a proof from another store or another key is refused', await sellerOf(null, { seller: { proof } }, KEY, 'shop-b') === null && await sellerOf(null, { seller: { proof } }, 'other-key', 'shop-a') === null);
check('a proof lives one shift plus three days of offline queue, then expires', await readTillSellerProof(proof, KEY, 'shop-a', Date.now() + 80 * 3600000) && !(await readTillSellerProof(proof, KEY, 'shop-a', Date.now() + 90 * 3600000)));
check('the employee app wins over anything the body says', (await sellerOf({ session: { staffId: 'm-9' } }, { seller: { proof } }, KEY, 'shop-a')).id === 'm-9');
check('no proof is signed without a person', await tillSellerProof(KEY, 'shop-a', { id: 'x', name: '  ' }) === '' && await tillSellerProof(KEY, 'shop-a', null) === '');

/* ── 3. La base : la vente garde son vendeur, la route rend la période ─────── */
console.log('■ 3. Route');
const SECRET = 'seller-commissions-test-secret';
const M = 'synthetic-boutique';
function world(features) {
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
  db.prepare("INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'team', ?, 1, 1)").run(M, JSON.stringify({ members, removed: [{ id: 'm-gone' }] }));
  return { db, env: { DB, AUTH_SECRET: SECRET } };
}
const w = world({ sellerCommissions: true });
const till = `${TILL_COOKIE}=${await tillToken(SECRET, M)}`;
const owner = `${SESS_COOKIE}=${await makeSession('acc-owner', SECRET)}`;
const zone = 'Africa/Casablanca';
const day = businessDate(Date.now(), 5, zone);
const at = businessBoundary(day, 5, zone) + 3 * 3600000;
const proofFor = (id, name) => tillSellerProof(SECRET, M, { id, name });
async function pay(id, cents, seller) {
  const res = await sale.onRequestPost({ env: w.env, request: new Request('https://kiwi.test/api/sale', { method: 'POST',
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
const payroll = read('assets/planning/payroll-view.js');
check('the Commissions tab and pane sit behind the same two gates', /const commissionsOn = \(\) => window\.KiwiConfig\?\.features\?\.sellerCommissions === true\s*&& document\.documentElement\.getAttribute\('data-skin-2027'\) === 'dashboard'/.test(payroll)
  && /commissionsOn\(\) \? `<button[^`]*data-arg="commissions"/.test(payroll) && /payTab === 'commissions' && commissionsOn\(\)/.test(payroll)
  && /kind === 'commissions' && commissionsOn\(\)/.test(payroll));
const boutique = read('assets/pos-boutique.js');
check('the till sends the signed proof of who unlocked it, never a name', /const sellerProof = !IS_DEMO && window\.KiwiStaff && window\.KiwiStaff\.sellerProof;/.test(boutique) && /if \(typeof sellerProof === 'string' && sellerProof\) payload\.seller = \{ proof: sellerProof \};/.test(boutique));
check('the queue forwards only the proof to /api/sale', /body\.seller = \{ proof: entry\.seller\.proof\.slice\(0, 2048\) \};/.test(read('assets/live-link/queue-store.js')));
check('/api/pin/verify signs the proof for a till role, the pairing keeps it on KiwiStaff', /sellerProof: await tillSellerProof\(env\.AUTH_SECRET, merchant, verified\.staff\)/.test(read('functions/api/pin/verify.js'))
  && /s\.sellerProof = p\.sellerProof/.test(read('assets/caisse-pairing.js')) && (read('assets/caisse-pairing.js').match(/d\.sellerProof \? \{ sellerProof/g) || []).length === 2
  && /who\.sellerProof = String\(reply\.body\.sellerProof\)/.test(read('assets/kit/pin-flow.js')));
const saleSrc = read('functions/api/sale.js');
check('every sales INSERT path writes the seller columns', (saleSrc.match(/\.\.\.sellerVals/g) || []).length === 3 && (saleSrc.match(/sellerCols/g) || []).length >= 4 && !/sellerId\b/.test(saleSrc));

console.log(`\nseller-commissions-test · ${controls} contrôles`);
