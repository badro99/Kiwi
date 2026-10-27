#!/usr/bin/env node
/* invoice-series-year-test · l'année d'un numéro de facture est l'année civile du
 * commerce, jamais celle de l'horloge du Worker (UTC).
 *
 * formatNumber() et nextSeq() retombaient sur new Date().getFullYear() quand on
 * ne leur donnait pas d'année : un appelant oublieux rangeait alors un document
 * du 1er janvier (heure de Casablanca) dans la série de l'année précédente.
 * Maintenant l'année est exigée, et les deux chemins d'émission (la vente de
 * comptoir, la saisie v2) la tirent du fuseau de l'établissement. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { formatNumber, nextSeq, allocateNumber } from '../functions/api/_invoice-series.js';
import { formatInvoiceNumber, getOrCreateSaleInvoice } from '../functions/api/invoice.js';
import { businessBoundary } from '../functions/api/_business-day.js';
import { save, issue } from '../functions/api/invoices/_lifecycle.js';

const { migrated } = createRequire(import.meta.url)('./fixtures/migrated-tables.cjs');

// 1. Pas de repli sur l'horloge : une année absente ou absurde est refusée.
for (const bad of [undefined, null, 0, '', 'abc', NaN, 1999, 3000, 2026.5]) {
  assert.throws(() => formatNumber('F', bad, 1), /invalid-series-year/, `formatNumber refuse ${String(bad)}`);
  assert.throws(() => formatInvoiceNumber(bad, 1), /invalid-series-year/, `formatInvoiceNumber refuse ${String(bad)}`);
  await assert.rejects(() => nextSeq({ prepare() { throw new Error('ne doit pas lire'); } }, 'm', 'F', bad), /invalid-series-year/);
  await assert.rejects(() => allocateNumber({ DB: {} }, 'm', 'F', bad), /invalid-series-year/);
}
assert.equal(formatNumber('F', 2027, 1), 'F-2027-0001');
assert.equal(formatNumber('AV', '2026', 12), 'AV-2026-0012');
assert.equal(formatInvoiceNumber(2027, 3), 'F-2027-0003');

// 2. Une base réelle au schéma des migrations, avec le transport d'un lot comme D1.
const sqlite = migrated(new DatabaseSync(':memory:'));
const db = {
  prepare(q) {
    const st = sqlite.prepare(q);
    const bound = (p) => ({
      async first() { const r = st.get(...p); return r === undefined ? null : r; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: Number(r.changes) }, success: true }; },
    });
    return Object.assign(bound([]), { bind: (...p) => bound(p) });
  },
  async batch(stmts) {
    sqlite.exec('BEGIN');
    try { const out = []; for (const s of stmts) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
    catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
};
const env = { DB: db };
const stamp = Date.now();
sqlite.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc','a@serie.test','Serie','s','h',?,'active')`).run(stamp);
const zones = { cas: 'Africa/Casablanca', auck: 'Pacific/Auckland', la: 'America/Los_Angeles' };
// La vente de comptoir et la saisie v2 partagent la série F : un commerce par chemin.
for (const [merchant, zone] of Object.entries({ ...zones })) zones[merchant + '2'] = zone;
for (const [merchant, zone] of Object.entries(zones)) {
  sqlite.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts,timezone) VALUES (?,'{}','boutique','acc',?,'active',0,?,?)`)
    .run(merchant, merchant, stamp, zone);
}

// 3. La vente de comptoir : l'année vient du jour civil de la vente dans la zone du commerce.
const insSale = sqlite.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ref, ts, lines) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
let n = 0;
async function saleNumber(merchant, ts) {
  const id = 's' + (++n);
  insSale.run(id, merchant, 100, 10000, 'cash', 'R' + n, ts, null);
  return (await getOrCreateSaleInvoice(env, merchant, id, null, { tvaRate: 20, issuedTs: ts })).number;
}
// Minuit de Casablanca, tel que la loi de zone le dit (indépendant du tzdata de Node).
const midnightCas = businessBoundary('2027-01-01', 0, zones.cas);
assert.match(await saleNumber('cas', midnightCas - 1), /^F-2026-\d{4}$/, 'une seconde avant minuit à Casablanca : série 2026');
assert.match(await saleNumber('cas', midnightCas), /^F-2027-0001$/, 'à minuit à Casablanca : la série 2027 repart à 1');
// Là où le calendrier civil et l'UTC divergent à l'année près.
assert.equal(await saleNumber('auck', Date.UTC(2026, 11, 31, 12)), 'F-2027-0001', 'Auckland est déjà en 2027 quand l\'UTC est encore en 2026');
assert.equal(await saleNumber('la', Date.UTC(2027, 0, 1, 3)), 'F-2026-0001', 'Los Angeles est encore en 2026 quand l\'UTC est déjà en 2027');

// 4. La saisie v2 : la date d'émission du jour suit la zone, donc l'année du numéro aussi.
const RealDate = Date;
function atClock(epoch) {
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(epoch); }
    static now() { return epoch; }
  };
}
async function issueNumber(merchant, epoch) {
  atClock(epoch);
  try {
    const ctx = { env, db, merchant, actor: 'test' };
    const saved = await (await save(ctx, { type: 'invoice', customer: { name: 'Client Test' }, lines: [{ description: 'Prestation', qty: 1, unitHT: 10000, vatRate: 20 }] })).json();
    assert.ok(saved.ok, 'brouillon enregistré');
    const out = await (await issue(ctx, { id: saved.doc.id })).json();
    assert.ok(out.ok, 'facture émise');
    return out.doc.number;
  } finally { globalThis.Date = RealDate; }
}
assert.match(await issueNumber('cas2', midnightCas - 60000), /^F-2026-0001$/, 'v2 : à 23:59 le 31 décembre à Casablanca, série 2026');
assert.equal(await issueNumber('auck2', Date.UTC(2026, 11, 31, 12)), 'F-2027-0001', 'v2 : Auckland émet en 2027 alors que l\'UTC est en 2026');
assert.equal(await issueNumber('la2', Date.UTC(2027, 0, 1, 3)), 'F-2026-0001', 'v2 : Los Angeles émet en 2026 alors que l\'UTC est en 2027');
// La série de l'année suivante repart de 1 pour Casablanca, qui ne mélange pas les deux.
assert.equal(await issueNumber('cas2', midnightCas + 60000), 'F-2027-0001', 'v2 : la minute suivante, Casablanca est en 2027 et sa série repart à 1');

console.log('✓ numéros de facture : année exigée, jamais l\'horloge du Worker ; vente et saisie suivent le fuseau du commerce autour du 1er janvier');
