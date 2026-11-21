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
 *   · les remboursements : un retour rendu en avoir (ligne à 0 centime) est un
 *     remboursement, jamais un ticket ; un retour rattaché revient sur ses produits,
 *     et le classement des produits se raccorde au résumé ;
 *   · la TVA datée suit la journée commerciale, pas la journée UTC ;
 *   · une journée seule se lit à l'heure, avec son heure de pointe ;
 *   · la pagination, l'export CSV complet, la limite des 100 paramètres de D1,
 *     et chaque requête prépare sur le schéma minimum de production. */
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
import { summarize } from '../functions/api/sales-summary.js';
import { reconcileNote } from '../functions/api/_reports-words.js';
import { baseCte, Q, LINES_CTE } from '../functions/api/_reports-sql.js';
import { listMigrations, MIGRATIONS_DIR } from './d1-migrations.mjs';

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
doc('atlas-casa', 'monthreport', { taxPeriods: [{ id: 'p1', category: 'Boissons', rate: 20, effectiveFrom: '2026-01-01', recordedAt: 1 },
  { id: 'p2', category: '*', rate: 14, effectiveFrom: '2026-10-14', recordedAt: 2 }] });
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
sql.prepare("INSERT INTO sale_audit (merchant, sale_id, action, note, amount, amount_cents, method, ts) VALUES ('atlas-casa', 's2', 'refund', 'r1', 20, 2000, 'cash', ?)").run(at(D, 21));
sale({ id: 'v1', c: 9999, ts: at(D, 12), void: at(D, 13), lines: [{ n: 'Annulée', q: 1, t: 99.99 }] });                       // annulée
sale({ id: 's5', c: 7000, ts: at(D, 30), lines: [{ n: 'Brunch', c: 'Plats', q: 1, t: 70 }] });                                  // 06:00 le 13 → journée du 13
sale({ id: 'x1', m: 'rival', c: 50000, ts: at(D, 12), lines: [{ n: 'Secret rival', q: 1, t: 500 }] });                         // autre commerçant
sale({ id: 'p1', c: 8000, ts: at('2026-10-11', 13), lines: [{ n: 'Couscous', c: 'Plats', q: 1, t: 80, k: 40 }] });               // la veille
sale({ id: 'rb1', m: 'atlas-rabat', c: 4000, ts: at(D, 13), method: 'card', lines: [{ n: 'Pastilla', c: 'Plats', q: 1, t: 40 }] });
sale({ id: 'rb2', m: 'atlas-rabat', c: -500, ts: at(D, 14), method: 'card', channel: 'refund' });
sql.prepare("INSERT INTO clients (merchant, id, name) VALUES ('atlas-casa', 'cl1', 'Nadia')").run();
/* Le 13 : une vente de 03:00 le 14 appartient encore à la journée du 13 (TVA d'avant le taux du 14). */
sale({ id: 'e1', c: 1000, ts: at('2026-10-14', 3), lines: [{ n: 'Brunch', c: 'Plats', q: 1, t: 10 }] });
/* Le 14 : un pull rendu en avoir (sale/refund.js écrit 0 centime, canal 'refund'), une vente sans détail et son retour en espèces. */
const D2 = '2026-10-14';
const audit = sql.prepare("INSERT INTO sale_audit (merchant, sale_id, action, note, amount, amount_cents, method, ts) VALUES ('atlas-casa', ?, 'refund', ?, ?, ?, ?, ?)");
sale({ id: 'c1', c: 6000, method: 'card', ts: at(D2, 11), lines: [{ n: 'Pull', c: 'Mode', q: 2, t: 60, k: 20 }] });
sale({ id: 'rc', c: 0, method: 'cash', ts: at(D2, 12), channel: 'refund', label: 'Remboursement · Vente' });
audit.run('c1', 'rc', 30, 3000, 'cash', at(D2, 12));
sale({ id: 'b1', c: 1500, method: 'cash', ts: at(D2, 13) });
sale({ id: 'rb', c: -500, method: 'cash', ts: at(D2, 14), channel: 'refund' });
audit.run('b1', 'rb', 5, 500, 'cash', at(D2, 14));
/* Le 16 : 210 produits différents, pour l'export complet. */
const D3 = '2026-10-16';
for (let i = 0; i < 210; i++) {
  sale({ id: 'bulk' + i, c: 100 + i, ts: at(D3, 12, i % 60), client: 'bc' + i, lines: [{ n: 'Produit ' + String(i).padStart(3, '0'), c: 'Vrac', q: 1, t: (100 + i) / 100 }] });
  sql.prepare('INSERT INTO clients (merchant, id, name) VALUES (?, ?, ?)').run('atlas-casa', 'bc' + i, 'Client ' + String(i).padStart(3, '0'));
}

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
check(k.cogs === 5800 && k.margin === 7200 && k.marginPct === 55.4, 'coût 58 MAD (70 vendus, 12 revenus avec le tajine rendu), marge 72 MAD (55,4 %)', k);
check(k.costCoverage === 81.3, 'le coût est connu pour 81,3 % des ventes nettes (le café n’a pas de coût)', k.costCoverage);
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
check(Array.isArray(r.body.sites) && r.body.sites.map((x) => x.merchant).join() === 'atlas-casa,atlas-rabat' && r.body.perSite.length === 1,
  'le résumé garde la liste de TOUS les établissements du compte (sélecteur), le détail par boutique est sous perSite', { sites: r.body.sites, perSite: r.body.perSite && r.body.perSite.length });
check(r.body.hourly && r.body.hourly.length === 24 && r.body.hourly[0].hour === 5 && r.body.hourly[23].hour === 4, 'une journée se lit à l’heure, de 05:00 à 04:00', r.body.hourly && r.body.hourly.map((x) => x.hour));
check(r.body.peakHour && r.body.peakHour.hour === 10 && r.body.peakHour.net === 10000 && / Pic de la journée à 10 h\.$/.test(r.body.headline.fr)
  && /Busiest hour: 10:00\.$/.test(r.body.headline.en) && /ذروة اليوم على الساعة 10:00/.test(r.body.headline.ar), 'l’heure de pointe est dite dans la phrase', [r.body.peakHour, r.body.headline]);
const hourSum = r.body.hourly.reduce((a, x) => a + x.net, 0);
check(hourSum === k.net, 'les heures refont les ventes nettes de la journée', hourSum);

r = await get(`merchant=atlas-casa&report=summary&${day('2026-10-13')}`, owner);
check(r.body.totals.cur.tickets === 2 && r.body.totals.cur.sales === 8000, 'la vente de 06:00 ouvre la journée du 13, celle de 03:00 le 14 la ferme', r.body.totals.cur);
check(r.body.totals.cur.vat.ttc === 8000 && r.body.totals.cur.vat.vat === 727, 'TVA du 13 : tout à 10 %, la vente de 03:00 le 14 garde le taux de sa journée commerciale (14 % ne commence que le 14)', r.body.totals.cur.vat);
r = await get(`merchant=atlas-casa&report=vat&${day('2026-10-13')}`, owner);
check(r.body.rows.length === 1 && r.body.rows[0].rate === 10 && r.body.rows[0].ttc === 8000, 'rapport TVA du 13 : un seul taux, 10 %', r.body.rows);
r = await get(`merchant=atlas-casa&report=vat&${day(D2)}`, owner);
check(r.body.rows.length === 1 && r.body.rows[0].rate === 14 && r.body.totals.ttc === 4000, 'le 14, le nouveau taux (14 %) s’applique, retours compris', r.body.rows);

console.log('\nRemboursements en avoir et raccord des produits');
r = await get(`merchant=atlas-casa&report=summary&${day(D2)}`, owner);
const k2 = r.body.totals.cur;
check(k2.tickets === 2 && k2.sales === 7500, 'le retour en avoir (0 centime, canal refund) n’est pas un ticket : deux ventes, 75 MAD', k2);
check(k2.refundCount === 2 && k2.refunds === 3500 && k2.net === 4000, 'il compte comme remboursement pour sa valeur (30 MAD d’avoir + 5 MAD espèces), net 40 MAD', k2);
check(k2.basket === 3750, 'le panier moyen ignore les remboursements', k2.basket);
r = await get(`merchant=atlas-casa&report=payments&${day(D2)}`, owner);
const credit = r.body.rows.find((x) => x.method === 'credit'), cash2 = r.body.rows.find((x) => x.method === 'cash');
check(credit && credit.refunds === 3000 && credit.cents === 0 && cash2.refunds === 500 && cash2.cents === 1500, 'encaissements : l’avoir rendu sur « Avoir », l’argent rendu sur son moyen', r.body.rows);
r = await get(`merchant=atlas-casa&report=channels&${day(D2)}`, owner);
check(!r.body.rows.find((x) => x.channel === 'refund') && r.body.totals.cents === 7500, 'le retour n’est pas un canal de vente', r.body.rows);
r = await get(`merchant=atlas-casa&report=products&${day(D2)}`, owner);
const pull = r.body.rows.find((x) => x.name === 'Pull');
check(pull && pull.qty === 1 && pull.sold === 6000 && pull.refunded === 3000 && pull.refundedQty === 1 && pull.net === 3000 && pull.cost === 2000,
  'le pull rendu revient sur le pull : 2 vendus, 1 rendu, 30 MAD nets, coût d’un seul', pull);
check(r.body.totals.unattributed === 1000 && r.body.totals.net === k2.net
  && r.body.rows.reduce((a, x) => a + x.net, 0) + r.body.totals.unattributed === k2.net,
  'produits + ventes sans détail (15 MAD − 5 MAD rendus) = ventes nettes du résumé, au centime', r.body.totals);
/* Le raccord avec le Z et l'accueil : leur net se calcule avec LEUR fonction
   (/api/sales-summary › summarize), sur les mêmes lignes. */
const zNet = (fromDay, toDay) => {
  const w = windowFor(fromDay, toDay, null, 'Africa/Casablanca', 5);
  const rows = sql.prepare('SELECT ts, amount, amount_cents, method, payment_parts, tip_cents, channel, label FROM sales WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL').all('atlas-casa', w.from, w.to);
  return summarize(rows, w.from, w.to, 5, 'Africa/Casablanca').days.reduce((a, x) => a + x.cents - x.refundCents, 0);
};
r = await get(`merchant=atlas-casa&report=summary&${day(D2)}`, owner);
const rc = r.body.reconcile;
check(rc && rc.z === zNet(D2, D2) && rc.credit === 3000 && rc.z - rc.credit === rc.net && rc.net === k2.net,
  'raccord : Z et accueil (70 MAD, leur propre calcul) − retours en avoir (30 MAD) = ventes nettes du rapport (40 MAD), au centime', [rc, zNet(D2, D2)]);
/* Le sens de la phrase : l'argent d'un retour en avoir RESTE en caisse et il est dû au client ; jamais « ne reste pas ». */
const NOTE = { fr: [/reste en caisse/, /dû au client/, /ne reste pas|sort de la caisse|quitte la caisse/],
  en: [/stays in the till/, /owed to the customer/, /does not stay|leaves the till|not in the till/],
  ar: [/يبقى في الصندوق/, /دَين/, /لا يبقى|ولا يبقى|يخرج من الصندوق/] };
for (const l of ['fr', 'en', 'ar']) {
  check(rc.note && NOTE[l][0].test(rc.note[l]) && NOTE[l][1].test(rc.note[l]) && !NOTE[l][2].test(rc.note[l]),
    `raccord (${l}) : l’argent reste en caisse et il est dû au client ; la phrase ne dit plus que la caisse est à découvert`, rc.note && rc.note[l]);
}
const zDays = (() => { const w = windowFor(D2, D2, null, 'Africa/Casablanca', 5);
  return summarize(sql.prepare('SELECT ts, amount, amount_cents, method, payment_parts, tip_cents, channel, label FROM sales WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL').all('atlas-casa', w.from, w.to), w.from, w.to, 5, 'Africa/Casablanca').days; })();
check(rc.tickets === 1 && zDays.reduce((a, x) => a + x.count, 0) - k2.tickets === rc.tickets
  && rc.ticketsNote.fr === 'dont 1 retour en avoir, non compté comme ticket ici' && /not counted as a ticket here/.test(rc.ticketsNote.en) && /لا يُحتسب هنا كتذكرة/.test(rc.ticketsNote.ar),
  'la carte dit combien de retours en avoir le Z compte comme tickets et pas ce rapport (1)', [rc.tickets, rc.ticketsNote]);
check(/dont 3 retours en avoir, non comptés comme tickets ici/.test(reconcileNote(3).ticketsNote.fr) && /منها مرجوعان/.test(reconcileNote(2).ticketsNote.ar) && reconcileNote(0).ticketsNote === null,
  'accord du pluriel dans les trois langues');
r = await get(`merchant=atlas-casa&report=summary&from=${D}&to=${D2}`, owner);
check(r.body.reconcile && r.body.reconcile.z === zNet(D, D2) && r.body.reconcile.z - r.body.reconcile.credit === r.body.totals.cur.net,
  'sur trois journées aussi, X − Y = net au centime', [r.body.reconcile, zNet(D, D2)]);
check((await get(`merchant=atlas-casa&report=summary&${day(D)}`, owner)).body.reconcile === null && zNet(D, D) === 16000,
  'sans retour en avoir, rien à raccorder : le Z et le rapport disent 160 MAD', zNet(D, D));
r = await get(`merchant=atlas-casa&report=summary&${day(D2)}&format=csv`, owner);
check(r.text.includes('"Rapport journalier (Z) et accueil (MAD)";"70,00"') && r.text.includes('"Retours rendus en avoir (MAD)";"-30,00"') && r.text.includes('"Ventes nettes du rapport (MAD)";"40,00"'),
  'le CSV du résumé porte les trois lignes du raccord', r.text.slice(0, 900));
check(r.text.includes('cet argent reste en caisse, mais il est dû au client') && r.text.includes('dont 1 retour en avoir') && !/ne reste pas en caisse/.test(r.text),
  'le CSV porte la phrase corrigée et le nombre de retours en avoir');
r = await get(`merchant=atlas-casa&report=summary&${day(D2)}&format=csv&lang=ar`, owner);
check(r.text.includes('مرجوعات رُدّت رصيدا للزبون (درهم)') && r.text.includes('يبقى في الصندوق') && !/ولا يبقى/.test(r.text), 'en arabe aussi, phrase corrigée');
r = await get(`merchant=atlas-casa&report=summary&${day(D2)}&format=csv&lang=en`, owner);
check(r.text.includes('that money stays in the till, but it is owed to the customer'), 'en anglais aussi');
r = await get(`merchant=atlas-casa&report=staff&${day(D2)}`, owner);
check(r.body.rows.reduce((a, x) => a + x.refunds, 0) === 3500 && r.body.rows.reduce((a, x) => a + x.tickets, 0) === 2, 'vendeurs : deux tickets, 35 MAD rendus', r.body.rows);
r = await get(`merchant=atlas-casa&report=products&${day(D2)}&format=csv`, owner);
const lines2 = r.text.split('\r\n').filter(Boolean);
check(/Ventes sans détail d’article et retours non rattachés";"";"";"";"";"10,00"/.test(r.text) && /^"Total";"";"";"";"30,00";"40,00"/.test(lines2[lines2.length - 1]),
  'le CSV des produits se raccorde au résumé : ligne sans détail, puis le total des ventes nettes', lines2.slice(-2));

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
check(tajine.name === 'Tajine kefta' && tajine.sold === 11667 && tajine.refunded === 2000 && tajine.net === 9667 && tajine.qty === 1.6 && tajine.cost === 4800,
  'Tajine kefta en tête : 116,67 MAD vendus (remise répartie), 20 MAD rendus sur sa vente, 96,67 nets, 1,6 gardé, coût 48 MAD', tajine);
check(r.body.page.total === 4 && r.body.rows[3].name === 'Couscous' && r.body.rows[3].change === -100, 'quatre produits : le couscous de la veille reste, à −100 %', r.body.rows);
check(Math.abs(r.body.rows.reduce((a, x) => a + x.net, 0) - 16000) <= 1 && r.body.totals.unattributed === 0 && r.body.totals.net === 16000,
  'les ventes nettes des produits refont les ventes nettes du résumé (160 MAD, retour déduit)', r.body.totals);
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
check(r.body.headline.ar.startsWith('حصة الأداء نقدا من المداخيل 61%'), 'en arabe, un nom ouvre la phrase (« حصة الأداء نقدا »), pas l’adverbe « نقدا »', r.body.headline.ar);
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
check(r.body.average.net === 9750 && Math.round(r.body.rows[0].vsAverage.net) === 64 && Math.round(r.body.rows[1].vsAverage.net) === -64,
  'chaque établissement se place face à la moyenne du groupe (97,50 MAD) : +64 % et −64 %', [r.body.average, r.body.rows.map((x) => x.vsAverage)]);
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
check(r.body.rows[0].vsAverage === null, 'une seule boutique qui vend : pas d’écart à une « moyenne du groupe »', r.body.rows[0]);
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
r = await get(`merchant=atlas-casa&report=products&${day(D3)}&format=csv`, owner);
check(r.text.split('\r\n').filter(Boolean).length === 1 + 210 + 1 && r.text.includes('"Produit 209"') && r.text.includes('"Produit 000"'),
  'le CSV exporte les 210 produits, pas la page affichée (plus de coupure à 200)', r.text.split('\r\n').length);
check((await get(`merchant=atlas-casa&report=products&${day(D3)}`, owner)).body.rows.length === 50, 'à l’écran, la même liste reste paginée par 50');
r = await get(`merchant=atlas-casa&report=customers&${day(D3)}&format=csv`, owner);
check(r.text.split('\r\n').filter(Boolean).length === 1 + 210 && r.text.includes('"Client 000"') && r.text.includes('"Client 209"'),
  'le CSV des clients exporte les 210 clients, pas la page affichée', r.text.split('\r\n').length);
check((await get(`merchant=atlas-casa&report=customers&${day(D3)}`, owner)).body.page.total === 210, 'à l’écran, 210 clients au total, paginés');
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

const REPORTS_ALL = route.REPORTS;
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
check(/^Cash accounts for 61% of payments/.test(r.body.headline.en) && /^حصة الأداء نقدا/.test(r.body.headline.ar), 'le moyen de paiement est nommé dans la langue de la phrase', r.body.headline);

console.log('\nLa démo et l’impression');
{
  const vm = await import('node:vm');
  const box = { window: { KiwiI18n: { getLang: () => 'fr' } }, URL, document: { baseURI: 'https://k.invalid/dashboard.html' } };
  vm.createContext(box);
  for (const f of ['reports-views.js', 'reports-demo.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/pages-pro', f), 'utf8'), box);
  const Demo = box.window.KiwiReportDemo, Views = box.window.KiwiReportViews;
  const at0 = Date.parse('2026-11-21T19:00:00Z');
  const build = (report, extra) => Demo.build(Object.assign({ report, preset: 'septJours', site: 'cafeAtlas', anchor: 'cafeAtlas', offset: 0 }, extra || {}), at0);
  const ds = build('sites');
  check(ds.demo === true && ds.rows.length === 3 && ds.rows.reduce((a, x) => a + x.cur.net, 0) === ds.totals.cur.net && ds.average && ds.rows.every((x) => x.vsAverage),
    'démo : trois établissements, le total est leur somme, chacun face à la moyenne', ds.rows.map((x) => x.name));
  const dp = build('products', { site: 'all' });
  check(Math.abs(dp.rows.reduce((a, x) => a + x.net, 0) - dp.totals.net) <= 1 && dp.page.total > 20, 'démo : les produits refont les ventes nettes', [dp.rows.reduce((a, x) => a + x.net, 0), dp.totals.net]);
  const dt = build('summary', { preset: 'aujourdhui' });
  check(dt.hourly && dt.hourly.reduce((a, x) => a + x.net, 0) === dt.totals.cur.net && dt.peakHour, 'démo : une journée se lit à l’heure, les heures refont le net', dt.peakHour);
  check(REPORTS_ALL.every((rep) => { const d = build(rep); return d.headline && d.headline.fr && d.headline.en && d.headline.ar; }), 'démo : chaque rapport a sa phrase dans les trois langues');
  check(Demo.csv(build('products', { csv: true }), 'fr').startsWith(BOM), 'démo : le CSV est fait sur place, BOM compris');
  check(/typeof window\.KiwiEnv\?\.isReal === 'function' && !window\.KiwiEnv\.isReal\(\)/.test(hub), 'les chiffres de démo ne s’affichent que si KiwiEnv dit « pas réel » (jamais sans KiwiEnv)');
  const page = Views.printable('Rapport', 'Café Atlas', '<p>corps</p>', dt, { summary: dt, vat: build('vat', { preset: 'aujourdhui' }) });
  const page2 = Views.printable('Rapport', 'Atlas', '', dt, { summary: Object.assign({}, dt, { reconcile: Object.assign({ z: 7000, credit: 3000, net: 4000, tickets: 1 }, reconcileNote(1)) }), vat: null });
  check(/Raccord avec le rapport journalier/.test(page2) && /Retours rendus en avoir/.test(page2) && /reste en caisse, mais il est dû au client/.test(page2), 'la page de garde imprimée porte le raccord avec le Z');
  check(/Synthèse pour le comptable/.test(page) && /TVA par taux/.test(page) && page.indexOf('Synthèse') < page.indexOf('corps'), 'l’impression commence par une page de garde pour le comptable (totaux, TVA par taux)');
  const rk = Views.ranking({ showCost: false, rows: [{ name: 'Pull', category: 'Mode', qty: 1.5, sold: 9000, refunded: 1500, refundedQty: 2.5, net: 7500, prevNet: 0, share: 100 },
    { name: 'Robe', category: 'Mode', qty: 1, sold: 3000, refunded: 1000, refundedQty: 1, net: 2000, prevNet: 0, share: 20 }], totals: { net: 9500 }, page: { offset: 0, limit: 50, total: 2 } }, 'products');
  check(/2,5 rendus/.test(rk) && /1 rendu</.test(rk) && !/rendu\(s\)|2,50/.test(rk), 'quantité rendue : « 2,5 rendus », « 1 rendu », jamais « 2,50 rendu(s) »');
  const sum2 = Demo.build({ report: 'summary', preset: 'aujourdhui', site: 'cafeAtlas', anchor: 'cafeAtlas' }, at0);
  check(/<polyline class="tk"/.test(Views.summary(sum2)), 'la courbe à l’heure porte les tickets de chaque heure en fine ligne');
  const recData = Object.assign({ z: 7000, credit: 3000, net: 4000, tickets: 1 }, reconcileNote(1));
  const recHtml = Views.summary(Object.assign({}, sum2, { reconcile: recData }));
  check(/cet argent reste en caisse, mais il est dû au client/.test(recHtml) && /dont 1 retour en avoir/.test(recHtml)
    && !/ne reste pas en caisse/.test(fs.readFileSync(path.join(ROOT, 'assets/pages-pro/reports-views.js'), 'utf8') + recHtml), 'la carte du résumé dit la phrase corrigée, l’ancienne a disparu du code');
  const neg = Views.ranking({ showCost: false, rows: [{ name: 'X', category: '', qty: -0.5, sold: 0, refunded: 500, refundedQty: 0.5, net: -500, prevNet: 0, share: -0.9 }], totals: { net: -500 }, page: { offset: 0, limit: 50, total: 1 } }, 'products');
  check(/\u22120,5</.test(neg) && /\u22120,9/.test(neg) && !/>-0,5|-0,9/.test(neg), 'quantités et parts négatives avec le vrai signe moins');
  check((neg.match(/class="n rp-s"/g) || []).length === 4 && /<th>Produit<\/th>/.test(neg) && /\.rp-table \.rp-s\{display:none\}/.test(fs.readFileSync(path.join(ROOT, 'assets/pages-pro/reports-views.js'), 'utf8')),
    'sur téléphone, Vendu, Retours et Part se replient : la vente nette reste à l’écran');
  check(/Raccord avec le rapport journalier/.test(recHtml) && /data-action="rp-open" data-arg="z"/.test(recHtml), 'le résumé affiche le raccord et ouvre le Z d’un clic');
  const lede = Views.lede(dt, 'comparé à', { title: 'Résumé' });
  check(/href="https:\/\/wa\.me\/\?text=/.test(lede) && !/api\.whatsapp|graph\.facebook/.test(lede), 'la phrase se partage en brouillon wa.me (rien n’est envoyé, aucun service payant)');
}

console.log('\nSchéma');
const reportsSql = fs.readFileSync(path.join(ROOT, 'functions/api/_reports-sql.js'), 'utf8');
check(!/PRAGMA|table_info|ALTER\s+TABLE|CREATE\s+TABLE/i.test(reportsSql), 'aucune sonde de colonnes ni repli de schéma : les requêtes lisent schema.sql');
const minimum = Number(/MINIMUM_SCHEMA_VERSION\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(ROOT, 'functions/_schema-version.js'), 'utf8'))[1]);
const prod = new DatabaseSync(':memory:');
for (const f of listMigrations().filter((x) => Number(x.slice(0, 4)) <= minimum)) prod.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
const win = { from: 1, to: 2 };
const base = baseCte({ sites: [{ buckets: ['a', 'b'], cur: win, prev: win, atSale: true }, { buckets: ['c'], cur: win, prev: win }] });
const pg = { limit: 10, offset: 0 };
const queries = [Q.hours(), Q.lineTotals(), Q.ranking('name', pg), Q.ranking('cat', pg), Q.drivers('name'), Q.staff(), Q.staffRefunds(), Q.payments(),
  Q.refundMethods(), Q.channels(), Q.vatLines([[5, 9], []]), Q.vatRest([[5], [7]]), Q.customers(pg), Q.topTen()];
for (const q of queries) prod.prepare(base.sql + '\n' + q);
check(queries.length === 14 && LINES_CTE.includes('o.lines'), `les ${queries.length} requêtes préparent sur le schéma minimum de production (migrations jusqu’à ${String(minimum).padStart(4, '0')})`);

console.log(`\n${n} checks passed`);
