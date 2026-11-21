#!/usr/bin/env node
/* Kiwi · /api/reports — les rapports d'une période, côté serveur.
 *
 * Tenu ici, sur la vraie base (schema.sql) et les vraies requêtes SQL :
 *   · le résumé au centime : brut, remises, remboursements, net, TVA par taux
 *     (taux daté du rayon, sinon taux du ticket), coût, marge, panier, articles ;
 *   · la journée commerciale : une vente de 02:00 appartient à la veille, une
 *     vente annulée et la vente d'un autre commerçant ne comptent jamais ;
 *   · la comparaison avec la période d'avant (et la phrase qui l'annonce) ;
 *   · le multi-site : le total est exactement la somme des boutiques ;
 *   · l'isolation : un commerçant ne voit jamais la boutique d'un autre, une
 *     caisse ou un anonyme n'ouvrent rien, un gérant ne voit pas les coûts ;
 *   · le CSV : BOM, point-virgule, guillemets doublés, formules neutralisées ;
 *   · la pagination, la limite des 100 paramètres de D1. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie, tillToken, operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import * as route from '../functions/api/reports.js';
import { resolvePeriod, windowFor, hourClock } from '../functions/api/_reports-period.js';
import { cell, toCsv, BOM } from '../functions/api/_reports-csv.js';
import { summarySentence, rankingSentence } from '../functions/api/_reports-words.js';
import { routeMinTier } from '../functions/auth/_session-tier.js';
import { businessBoundary } from '../functions/api/_business-day.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const check = (ok, label, detail) => { assert.ok(ok, label + (detail !== undefined ? ' · ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); n++; console.log('  ✓ ' + label); };

const sql = new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
let maxParams = 0;
const d1 = {
  prepare(q) {
    let a = [];
    const st = {
      bind(...v) {
        a = v.map((x) => (x === undefined ? null : x));
        maxParams = Math.max(maxParams, a.length);
        if (a.length > 100) throw new Error('too many SQL variables');
        return st;
      },
      async first() { return sql.prepare(q).get(...a) ?? null; },
      async all() { return { results: sql.prepare(q).all(...a) }; },
      async run() { const r = sql.prepare(q).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return st;
  },
  async batch(list) { const out = []; for (const s of list) out.push(await s.all()); return out; },
};
const SECRET = 'reports-fixture-secret-0123456789';
const env = { AUTH_SECRET: SECRET, DB: d1 };
const now = Date.now();

/* ── Le décor ── deux comptes : « Atlas » (Casablanca + Rabat), « Rival ». */
const account = (id, email, business) => sql.prepare('INSERT INTO accounts (id, email, business, salt, hash, created_ts, status, session_epoch) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
  .run(id, email, business, 's', 'h', now, 'active');
account('acc-atlas', 'o@atlas.ma', 'Atlas Groupe');
account('acc-rival', 'o@rival.ma', 'Rival');
const store = (m, name, aid, features = {}) => sql.prepare(
  'INSERT INTO merchant_config (merchant, features, status, account_id, name, type, updated_ts, timezone, business_cutoff) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
).run(m, JSON.stringify(features), 'active', aid, name, 'restaurant', now, 'Africa/Casablanca', 5);
store('atlas-casa', 'Atlas Casablanca', 'acc-atlas');
store('atlas-rabat', 'Atlas Rabat', 'acc-atlas');
store('rival', 'Rival', 'acc-rival');
sql.prepare('INSERT INTO operators (id, label, salt, hash, created_ts) VALUES (?, ?, ?, ?, ?)').run('op-1', 'Support', '', '', 1);

const doc = (m, feature, data) => sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)').run(m, feature, JSON.stringify(data), now);
doc('atlas-casa', 'receipt', { vat: { mode: 'rate', rate: 10, included: true } });
doc('atlas-casa', 'monthreport', { taxPeriods: [{ id: 'p1', category: 'Boissons', rate: 20, effectiveFrom: '2026-01-01', recordedAt: 1 }] });
doc('atlas-casa', 'team', { members: [{ id: 'm1', firstName: 'Sara', pinCode: '1234' }, { id: 'm2', firstName: 'Youssef', password: 'secret' }] });

/* Lundi 12 octobre 2026 (Maroc en UTC depuis le 20 septembre : 05:00 locale = 05:00 UTC). */
const D = '2026-10-12';
const at = (day, h, m = 0) => Date.parse(day + 'T00:00:00Z') + h * 3600000 + m * 60000;
const insert = sql.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, gross_amount_cents, discount_amount_cents, method, payment_parts,
  label, ts, lines, channel, tip_cents, void_ts, seller_id, seller_name, client_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const sale = (o) => insert.run(o.id, o.m || 'atlas-casa', Math.round((o.c || 0) / 100), o.c, o.gross ?? null, o.disc ?? null, o.method || 'cash',
  o.parts ? JSON.stringify(o.parts) : null, o.label || 'Vente', o.ts, o.lines ? JSON.stringify(o.lines) : null, o.channel ?? null,
  o.tip ?? null, o.void ?? null, o.seller ?? null, o.sellerName ?? null, o.client ?? null);

sale({ id: 's1', c: 10000, gross: 12000, disc: 2000, method: 'split', parts: [{ method: 'cash', amountCents: 6000 }, { method: 'card', amountCents: 4000 }],
  ts: at(D, 10), channel: 'surplace', tip: 500, seller: 'm1', sellerName: 'Sara', client: 'cl1',
  lines: [{ n: 'Tajine kefta', c: 'Plats', q: 1, t: 80, k: 30 }, { n: 'Thé "menthe"; nana', c: 'Boissons', q: 2, t: 40, k: 5 }] });
sale({ id: 's2', c: 5000, method: 'cash', ts: at(D, 20), channel: 'emporter', seller: 'm2', client: 'cl1',
  lines: [{ n: 'Tajine kefta', c: 'Plats', q: 1, t: 50, k: 30 }] });
sale({ id: 's3', c: 3000, method: 'card', ts: at(D, 26), channel: 'surplace', lines: [{ n: 'Café', c: 'Boissons', q: 1, t: 30 }] }); // 02:00 le 13 → journée du 12
sale({ id: 'r1', c: -2000, method: 'cash', ts: at(D, 21), channel: 'refund', label: 'Remboursement · Vente' });
sql.prepare("INSERT INTO sale_audit (merchant, sale_id, action, note, amount, amount_cents, method, ts) VALUES ('atlas-casa', 's2', 'refund', 'r1', -20, -2000, 'cash', ?)").run(at(D, 21));
sale({ id: 'v1', c: 9999, ts: at(D, 12), void: at(D, 13), lines: [{ n: 'Annulée', q: 1, t: 99.99 }] });                       // annulée
sale({ id: 's5', c: 7000, ts: at(D, 30), lines: [{ n: 'Brunch', c: 'Plats', q: 1, t: 70 }] });                                  // 06:00 le 13 → journée du 13
sale({ id: 'x1', m: 'rival', c: 50000, ts: at(D, 12), lines: [{ n: 'Secret rival', q: 1, t: 500 }] });                         // autre commerçant
sale({ id: 'p1', c: 8000, ts: at('2026-10-11', 13), lines: [{ n: 'Couscous', c: 'Plats', q: 1, t: 80, k: 40 }] });               // la veille
sale({ id: 'rb1', m: 'atlas-rabat', c: 4000, ts: at(D, 13), method: 'card', lines: [{ n: 'Pastilla', c: 'Plats', q: 1, t: 40 }] });
sale({ id: 'rb2', m: 'atlas-rabat', c: -500, ts: at(D, 14), method: 'card', channel: 'refund' });
sql.prepare("INSERT INTO clients (merchant, id, name) VALUES ('atlas-casa', 'cl1', 'Nadia')").run();

const owner = sessionCookie(await makeSession('acc-atlas', SECRET));
const rival = sessionCookie(await makeSession('acc-rival', SECRET));
const SID_MGR = 'a'.repeat(32);
sql.prepare('INSERT INTO session_tiers (sid, account_id, tier, staff_id, updated_ts) VALUES (?, ?, ?, ?, ?)').run(SID_MGR, 'acc-atlas', 'manager', 'm2', now);
const manager = sessionCookie(await makeSession('acc-atlas', SECRET, 0, SID_MGR));
const till = `kiwi_till=${await tillToken(SECRET, 'atlas-casa')}`;
const operator = `kiwi_op=${await operatorToken(SECRET)}; kiwi_op_id=${await operatorIdToken(SECRET, 'op-1')}`;

async function get(qs, cookie) {
  const request = new Request('https://k.invalid/api/reports?' + qs, { headers: cookie ? { Cookie: cookie } : {} });
  const res = await route.onRequestGet({ request, env });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  return { status: res.status, type: res.headers.get('Content-Type') || '', text, bom: bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, body: /json/.test(res.headers.get('Content-Type') || '') ? JSON.parse(text.replace(/^\uFEFF/, '')) : null };
}
const day = (d) => `from=${d}&to=${d}`;

console.log('Résumé au centime');
let r = await get(`merchant=atlas-casa&report=summary&${day(D)}`, owner);
check(r.status === 200, 'le patron lit le résumé', r.body);
const k = r.body.totals.cur;
check(k.tickets === 3 && k.sales === 18000, 'trois tickets, 180 MAD encaissés : la vente de 02:00 est dans la journée, l’annulée et celle de 06:00 n’y sont pas', k);
check(k.discounts === 2000 && k.gross === 20000, 'brut = encaissé + remises (200 + 20 MAD)', k);
check(k.refunds === 2000 && k.refundCount === 1 && k.net === 16000, 'net = encaissé − remboursements = 160 MAD', k);
check(k.basket === 6000, 'panier moyen 60 MAD (encaissé ÷ tickets)', k.basket);
check(k.items === 5 && k.itemsPerTicket === 1.7, '5 articles, 1,7 par ticket détaillé', k);
check(k.cogs === 7000 && k.margin === 8000 && k.marginPct === 53.3, 'coût 70 MAD sur les lignes au coût connu, marge 80 MAD (53,3 %)', k);
check(k.costCoverage === 83.3, 'le coût est connu pour 83,3 % des ventes (le café n’a pas de coût)', k.costCoverage);
check(k.tips === 500 && k.knownClients === 2, 'pourboires 5 MAD, 2 tickets rattachés à un client', k);
check(k.vat && k.vat.ttc === 16000 && k.vat.vat === 1934 && k.vat.unknown === 0,
  'TVA : 10 % (taux du ticket) sur les plats et le remboursement, 20 % (rayon Boissons daté) : 19,34 MAD, TTC = net', k.vat);
check(r.body.totals.prev.net === 8000 && Math.round(r.body.totals.change) === 100, 'la veille (80 MAD) sert de comparaison : +100 %', r.body.totals.prev);
check(r.body.previous.fromDay === '2026-10-11' && r.body.previous.toDay === '2026-10-11', 'la période comparée est la journée d’avant', r.body.previous);
check(/hausse de 100 % par rapport à la veille, portées par Tajine kefta/.test(r.body.headline.fr), 'la phrase dit ce qui a changé et pourquoi', r.body.headline.fr);
check(/^Net sales up 100% vs the day before, driven by Tajine kefta/.test(r.body.headline.en) && /ارتفعت المبيعات الصافية/.test(r.body.headline.ar), 'en anglais et en arabe aussi', r.body.headline);
check(!/—/.test(JSON.stringify(r.body)), 'aucun tiret cadratin dans les textes');
check(r.body.series.length === 1 && r.body.series[0].net === 16000 && r.body.series[0].prevNet === 8000, 'la série par journée porte la comparaison', r.body.series);
check(!/Secret rival/.test(r.text) && !/1234|secret/.test(r.text), 'rien d’un autre commerçant, aucun code d’équipe dans la réponse');

r = await get(`merchant=atlas-casa&report=summary&${day('2026-10-13')}`, owner);
check(r.body.totals.cur.tickets === 1 && r.body.totals.cur.sales === 7000, 'la vente de 06:00 ouvre la journée du 13, seule', r.body.totals.cur);

console.log('\nPériodes et journée commerciale');
const zone = 'Africa/Casablanca';
const nowSat = at('2026-10-17', 15);                                         // samedi 15:00
let p = resolvePeriod({ preset: 'aujourdhui' }, nowSat, zone, 5);
check(p.fromDay === '2026-10-17' && p.prev.fromDay === '2026-10-16' && p.cutMs === 10 * 3600000, 'aujourd’hui se compare à hier, arrêté à la même heure', p);
const w = windowFor(p.prev.fromDay, p.prev.toDay, p.cutMs, zone, 5);
check(w.from === at('2026-10-16', 5) && w.to === at('2026-10-16', 15), 'hier de 05:00 à 15:00', w);
p = resolvePeriod({ preset: 'aujourdhui' }, at('2026-10-17', 3), zone, 5);
check(p.fromDay === '2026-10-16', 'à 03:00, « aujourd’hui » est encore la journée de la veille', p.fromDay);
p = resolvePeriod({ preset: 'septJours' }, nowSat, zone, 5);
check(p.fromDay === '2026-10-11' && p.prev.fromDay === '2026-10-04' && p.prev.toDay === '2026-10-10' && p.days === 7, '7 jours contre les 7 précédents', p);
p = resolvePeriod({ preset: 'moisDernier' }, nowSat, zone, 5);
check(p.fromDay === '2026-09-01' && p.toDay === '2026-09-30' && p.prev.fromDay === '2026-08-01' && p.prev.toDay === '2026-08-31' && p.cutMs == null, 'mois dernier contre le mois d’avant', p);
p = resolvePeriod({ preset: 'annee' }, nowSat, zone, 5);
check(p.fromDay === '2026-01-01' && p.prev.fromDay === '2025-01-01' && p.prev.days === p.days, 'l’année en cours contre l’an dernier à la même date', p);
p = resolvePeriod({ preset: 'trimestre' }, nowSat, zone, 5);
check(p.fromDay === '2026-10-01' && p.prev.fromDay === '2026-07-01' && p.prev.days === p.days, 'le trimestre contre le précédent au même stade', p);
check(resolvePeriod({ from: '2025-01-01', to: '2026-10-17' }, nowSat, zone, 5).error === 'range-too-long', 'plus de 400 jours : refusé');
check(resolvePeriod({ from: '2027-01-01', to: '2027-01-02' }, nowSat, zone, 5).error === 'future', 'une plage dans le futur : refusée');
const summer = resolvePeriod({ from: '2026-07-10', to: '2026-07-10' }, nowSat, zone, 5);
const ww = windowFor(summer.fromDay, summer.toDay, null, zone, 5);
check(ww.from === businessBoundary('2026-07-10', 5, zone) && ww.to - ww.from === 86400000, 'avant la réforme (été 2026, UTC+1), la journée suit l’heure légale du moment', ww);
const clock = hourClock(zone, 5);
const h = clock(Math.floor(at(D, 26) / 3600000));
check(h.day === D && h.hour === 2 && h.weekday === 0, 'l’heure 02:00 du mardi est rangée dans la journée du lundi', h);

console.log('\nProduits, rayons, vendeurs, encaissements, canaux, clients, rythme');
r = await get(`merchant=atlas-casa&report=products&${day(D)}`, owner);
const tajine = r.body.rows[0];
check(tajine.name === 'Tajine kefta' && tajine.qty === 2 && tajine.net === 11667 && tajine.cost === 6000, 'Tajine kefta en tête : 2 vendus, 116,67 MAD nets (remise répartie), coût 60 MAD', tajine);
check(r.body.page.total === 4 && r.body.rows[3].name === 'Couscous' && r.body.rows[3].change === -100, 'quatre produits : le couscous de la veille reste, à −100 %', r.body.rows);
check(Math.abs(r.body.rows.reduce((a, x) => a + x.net, 0) - 18000) <= 1, 'les ventes nettes des produits refont l’encaissé au centime près', r.body.rows);
r = await get(`merchant=atlas-casa&report=products&${day(D)}&limit=1&offset=1`, owner);
check(r.body.rows.length === 1 && r.body.page.total === 4 && r.body.rows[0].name === 'Thé "menthe"; nana', 'pagination : une ligne, la deuxième, le total reste 4', r.body);
r = await get(`merchant=atlas-casa&report=categories&${day(D)}`, owner);
check(r.body.rows.map((x) => x.name).join() === 'Plats,Boissons' && r.body.rows[0].prevNet === 8000, 'rayons : Plats puis Boissons, Plats comparé aux 80 MAD de la veille', r.body.rows);
r = await get(`merchant=atlas-casa&report=staff&${day(D)}`, owner);
const sara = r.body.rows.find((x) => x.id === 'm1'), you = r.body.rows.find((x) => x.id === 'm2'), none = r.body.rows.find((x) => x.unassigned);
check(sara && sara.name === 'Sara' && sara.sales === 10000 && sara.discounts === 2000 && sara.tips === 500, 'Sara : 100 MAD, 20 MAD de remise, 5 MAD de pourboire', sara);
check(you && you.name === 'Youssef' && you.refunds === 2000 && you.refundCount === 1, 'Youssef (nom repris de l’équipe) porte le remboursement de SA vente', you);
check(none && none.sales === 3000 && r.body.rows[r.body.rows.length - 1] === none, 'la vente sans vendeur reste à part, en dernier', none);
r = await get(`merchant=atlas-casa&report=payments&${day(D)}`, owner);
const cash = r.body.rows.find((x) => x.method === 'cash'), card = r.body.rows.find((x) => x.method === 'card');
check(cash.cents === 11000 && card.cents === 7000 && cash.refunds === 2000, 'le paiement mixte compte chaque part sur son moyen ; remboursement en espèces', r.body.rows);
check(/Espèces représente 61 % des encaissements/.test(r.body.headline.fr), 'la phrase nomme le premier moyen', r.body.headline.fr);
r = await get(`merchant=atlas-casa&report=channels&${day(D)}`, owner);
check(r.body.rows[0].channel === 'surplace' && r.body.rows[0].cents === 13000 && !r.body.rows.find((x) => x.channel === 'refund'), 'canaux : sur place d’abord, le remboursement n’est pas un canal', r.body.rows);
r = await get(`merchant=atlas-casa&report=customers&${day(D)}`, owner);
check(r.body.rows.length === 1 && r.body.rows[0].name === 'Nadia' && r.body.rows[0].spend === 15000 && r.body.totals.anonymousShare === 33.3, 'clients : Nadia 150 MAD, un ticket sur trois sans client', r.body);
r = await get(`merchant=atlas-casa&report=heatmap&${day(D)}`, owner);
check(r.body.peak.weekday === 0 && r.body.peak.hour === 10 && r.body.grid[0][2] === 3000, 'rythme : pic le lundi à 10 h, la vente de 02:00 dans la ligne du lundi', r.body.peak);
r = await get(`merchant=atlas-casa&report=vat&${day(D)}`, owner);
check(r.body.rows.length === 2 && r.body.rows[0].rate === 10 && r.body.rows[1].rate === 20 && r.body.totals.ttc === 16000, 'TVA par taux : 10 % et 20 %', r.body.rows);

console.log('\nMulti-site');
r = await get(`merchant=atlas-casa&report=sites&${day(D)}`, owner);
check(r.status === 200 && r.body.rows.length === 2, 'le patron voit ses deux établissements côte à côte', r.body.rows && r.body.rows.map((x) => x.merchant));
const sum = (f) => r.body.rows.reduce((a, x) => a + f(x), 0);
for (const key of ['net', 'sales', 'tickets', 'refunds', 'discounts', 'gross', 'tips']) {
  check(r.body.totals.cur[key] === sum((x) => x.cur[key]), `le total « ${key} » est la somme des établissements`, [r.body.totals.cur[key], sum((x) => x.cur[key])]);
}
check(r.body.totals.cur.net === 16000 + 3500 && r.body.best === 'atlas-casa' && r.body.worst === 'atlas-rabat', 'Casablanca meilleure, Rabat moins bonne', r.body);
check(!/rival/i.test(JSON.stringify(r.body.sites)), 'la liste des établissements ne contient que ceux du compte');
const all = await get(`merchant=atlas-casa&report=summary&site=all&${day(D)}`, owner);
check(all.body.totals.cur.net === 19500 && all.body.scope === 'all', 'le résumé « tous les établissements » additionne les deux', all.body.totals.cur.net);
const rabat = await get(`merchant=atlas-casa&report=summary&site=atlas-rabat&${day(D)}`, owner);
check(rabat.status === 200 && rabat.body.totals.cur.net === 3500, 'une autre boutique du même compte se lit depuis le même tableau de bord', rabat.body.totals.cur);

console.log('\nIsolation');
check((await get(`merchant=atlas-casa&report=summary&${day(D)}`)).status === 403, 'sans session : refusé');
check((await get(`merchant=atlas-casa&report=summary&${day(D)}`, rival)).status === 403, 'un autre commerçant : refusé, même pas replié sur sa propre boutique');
check((await get(`merchant=atlas-casa&report=summary&site=rival&${day(D)}`, owner)).status === 403, 'demander la boutique d’un autre compte comme « site » : refusé');
check((await get(`merchant=atlas-casa&report=summary&${day(D)}`, till)).status === 403, 'une caisse appairée n’ouvre pas les rapports');
r = await get(`merchant=rival&report=sites&${day(D)}`, rival);
check(r.status === 200 && r.body.rows.length === 1 && r.body.totals.cur.net === 50000, 'le concurrent ne voit que sa boutique', r.body.rows);
r = await get(`merchant=atlas-casa&report=summary&${day(D)}`, manager);
check(r.status === 200 && r.body.showCost === false && r.body.totals.cur.cogs === null && r.body.totals.cur.margin === null, 'un gérant voit les ventes, pas les coûts ni les marges', r.body.totals.cur);
r = await get(`merchant=atlas-casa&report=products&${day(D)}`, manager);
check(r.body.rows.every((x) => x.cost === null && x.margin === null), 'ni dans le classement des produits');
r = await get(`merchant=atlas-casa&report=sites&${day(D)}`, operator);
check(r.status === 200 && r.body.rows.length === 2 && r.body.showCost === true, 'un opérateur nommé voit les établissements du propriétaire', r.body.rows.length);
check(routeMinTier('/api/reports') === 'manager', 'la porte du site demande au moins un gérant (palier de session)');
check(!route.onRequestPost && !route.onRequest, 'la route n’exporte que GET');

console.log('\nCSV');
check(cell('=SUM(A1)') === '"\'=SUM(A1)"' && cell('+212 600') === '"\'+212 600"' && cell('@x') === '"\'@x"', 'une cellule qui commence par = + @ ne devient pas une formule');
check(cell('Thé "menthe"; nana') === '"Thé ""menthe""; nana"', 'guillemets doublés, point-virgule protégé');
check(toCsv(['a'], [['b']]).startsWith(BOM) && toCsv(['a'], [['b']]).endsWith('\r\n'), 'BOM UTF-8 en tête, CRLF');
r = await get(`merchant=atlas-casa&report=products&${day(D)}&format=csv`, owner);
check(r.status === 200 && /text\/csv; charset=utf-8/.test(r.type) && r.bom, 'l’export est un CSV UTF-8 avec BOM', r.type);
check(r.text.includes('"Thé ""menthe""; nana";"Boissons"') && r.text.includes('"116,67"'), 'le nom est échappé, les montants ont la virgule décimale', r.text.slice(0, 300));
r = await get(`merchant=atlas-casa&report=summary&${day(D)}&format=csv&lang=ar`, owner);
check(r.text.includes('المبيعات الصافية (درهم)') && r.text.includes('"160,00"'), 'en arabe, les en-têtes arabes passent intacts', r.text.slice(0, 200));
r = await get(`merchant=atlas-casa&report=sites&${day(D)}&format=csv`, owner);
check(r.text.split('\r\n').filter(Boolean).length === 4 && r.text.includes('"Total";"195,00"'), 'le CSV multi-site finit sur le total', r.text);
check((await get(`merchant=atlas-casa&report=summary&${day(D)}&format=csv`)).status === 403, 'pas de CSV sans droit de lecture');

console.log('\nPhrases');
const flat = summarySentence({ period: { preset: 'septJours', days: 7 }, cur: { net: 10000, tickets: 3 }, prev: { net: 10050 }, drivers: {}, slots: {} });
check(/stables/.test(flat.fr) && /steady/.test(flat.en) && /مستقرة/.test(flat.ar), 'moins de 1 % d’écart : « stables »', flat);
const none2 = summarySentence({ period: { preset: 'septJours', days: 7 }, cur: { net: 0, tickets: 0, refundCount: 0 }, prev: { net: 0 }, drivers: {}, slots: {} });
check(/Aucune vente/.test(none2.fr), 'aucune vente : la phrase le dit');
const down = summarySentence({ period: { preset: 'septJours', days: 7 }, cur: { net: 9000, tickets: 3 }, prev: { net: 10000 },
  drivers: { down: { name: 'Couscous' } }, slots: { down: { weekday: 5, part: 'evening' } } });
check(down.fr === 'Ventes nettes en baisse de 10 % par rapport aux 7 jours précédents, freinées par Couscous et le samedi soir.', 'la baisse est expliquée', down.fr);
check(down.en === 'Net sales down 10% vs the previous 7 days, dragged by Couscous and Saturday evening.', 'en anglais', down.en);
const lead = rankingSentence('products', { top: { name: 'X', value: 0, prev: 0 }, total: 0 });
check(/Rien à classer/.test(lead.fr), 'un classement vide le dit');

console.log('\nLimite D1');
const many = [];
for (let i = 0; i < 12; i++) { const m = 'atlas-s' + i; store(m, 'Atlas ' + i, 'acc-atlas'); many.push(m); }
maxParams = 0;
for (const rep of route.REPORTS) {
  r = await get(`merchant=atlas-casa&report=${rep}&site=all&${day(D)}`, owner);
  check(r.status === 200, `« ${rep} » sur 12 établissements passe`, r.body);
}
check(maxParams <= 100, 'aucune requête ne lie plus de 100 paramètres', maxParams);
r = await get(`merchant=atlas-casa&report=sites&${day(D)}`, owner);
check(r.body.rows.length === route.MAX_SITES && r.body.rows[0].merchant === 'atlas-casa', 'au plus 12 établissements, la boutique ouverte en premier', r.body.rows.length);

console.log('\nLe hub du tableau de bord');
const pagesPro = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');
const entry = pagesPro.match(/\{ url: 'assets\/pages-pro\/reports-hub\.js\?v=\d+'[^\n]*handlers: \[([^\]]*)\]/);
const listed = entry ? entry[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1)).sort() : [];
const hub = fs.readFileSync(path.join(ROOT, 'assets/pages-pro/reports-hub.js'), 'utf8');
const views = fs.readFileSync(path.join(ROOT, 'assets/pages-pro/reports-views.js'), 'utf8');
const registered = [...hub.matchAll(/handlers\['([a-z-]+)'\] = /g)].map((m) => m[1]).sort();
check(listed.length > 0 && listed.join() === registered.join(), 'la section paresseuse liste exactement les handlers que le hub enregistre', { listed, registered });
const actions = [...(hub + views).matchAll(/data-action="([a-z-]+)"/g)].map((m) => m[1]);
check(actions.every((a) => registered.includes(a) || a === 'venue-enter-fusion' || a === '${action}'), 'chaque data-action du hub a son handler', actions);
check(!/\u2014/.test(hub + views) && !/font-style:\s*italic/.test(hub + views) && !/!important/.test(hub + views), 'ni tiret cadratin, ni italique, ni !important');
check(/data-nav="reports"/.test(fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8')), 'le lien « Rapports » est dans la barre latérale');
check(/data-action="reports-sites"/.test(fs.readFileSync(path.join(ROOT, 'assets/venues.js'), 'utf8')), 'le sélecteur d’établissement ouvre la vraie vue multi-site');
r = await get(`merchant=atlas-casa&report=payments&${day(D)}`, owner);
check(/^Cash accounts for 61% of payments/.test(r.body.headline.en) && /^نقدا يمثل/.test(r.body.headline.ar), 'le moyen de paiement est nommé dans la langue de la phrase', r.body.headline);

console.log(`\n${n} checks passed`);
