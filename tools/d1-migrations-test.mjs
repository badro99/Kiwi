#!/usr/bin/env node
/* tools/d1-migrations-test.mjs — migrations/ et schema.sql ne peuvent plus diverger.
 *
 * La production D1 a retardé sur schema.sql pendant des mois, parce que rien ne
 * liait les deux : on ajoutait une colonne au fichier, et la base déployée ne la
 * recevait que si quelqu'un passait le bon ALTER à la main. Ce test ferme la
 * boucle, sans réseau et en mémoire (node:sqlite) :
 *
 *   1. migrations/ ne contient que des NNNN_nom.sql contigus — wrangler applique
 *      TOUT .sql du dossier, un fichier daté posé là partirait en production ;
 *   2. aucune migration n'ouvre de transaction (D1 les refuse) ni n'efface de
 *      données sans le dire ;
 *   3. 0001…N appliquées à une base vide donnent EXACTEMENT schema.sql :
 *      tables, colonnes (type, NOT NULL, défaut, clé), index, clés étrangères ;
 *   4. 0001 est rejouable sur une base déjà à jour — c'est ce qui la rend sans
 *      effet sur la production, qui l'a déjà ;
 *   5. le comparateur voit bien un écart quand il y en a un ;
 *   6. MISE À NIVEAU D'UNE BASE REMPLIE : une base à la baseline, avec des lignes
 *      synthétiques dans les tables qui portent l'argent et les clients, reçoit
 *      toutes les migrations suivantes (celles qui existent, dans l'ordre) :
 *      aucune ligne ne disparaît ni ne change de valeur, et toute colonne
 *      ajoutée NOT NULL porte son défaut sur les lignes déjà là. Le point 3
 *      prouve la forme sur une base vide, il ne voit pas une migration qui
 *      efface ou réécrit des lignes.
 *
 * `node tools/d1-migrations-test.mjs`
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ROOT, MIGRATIONS_DIR, MIGRATION_NAME,
  listMigrations, freshDb, applyMigrations, applySchema, shapeOf, compareShapes,
} from './d1-migrations.mjs';
import { stripComments } from './d1-schema.mjs';

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

const files = listMigrations();
const read = (name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8');

console.log('\n■ Noms : ce que wrangler appliquera');
const misnamed = files.filter((name) => !MIGRATION_NAME.test(name));
check('chaque .sql de migrations/ suit NNNN_nom.sql', !misnamed.length,
  `${misnamed.join(', ')} — un fichier historique va dans migrations/legacy/, wrangler ne lit pas les sous-dossiers`);
const numbers = files.map((name) => Number(name.slice(0, 4)));
// Wave D uses 0015 at the owner's request; 0013/0014 belong to concurrent branches.
const reserved = [13, 14].filter(n => !numbers.includes(n));
const numbered = [...numbers, ...reserved].sort((a,b) => a-b);
check('numérotation contiguë depuis 0001, sans doublon (0013/0014 réservées)',
  numbered.every((n, i) => n === i + 1),
  `trouvé : ${numbers.map((n) => String(n).padStart(4, '0')).join(', ')}`);
check('au moins la baseline et la migration d\'écart', files.length >= 2, `${files.length} fichier(s)`);

// The annual constraint rebuild also preserves already issued manual/till numbers.
{
  const db = freshDb();
  for (const file of files.filter(n => n < '0011_')) db.exec(read(file));
  db.exec("INSERT INTO invoice_series VALUES ('synth-annual','F',7,'F-2025-0007','doc-old',1)");
  const before = JSON.stringify(db.prepare('SELECT * FROM invoice_series').all());
  db.exec(read('0011_annual_invoice_series.sql'));
  check('annual rebuild preserves historical series rows byte for byte', JSON.stringify(db.prepare('SELECT * FROM invoice_series').all()) === before);
  db.exec("INSERT INTO invoice_series VALUES ('synth-annual','F',1,'F-2026-0001','doc-new',2)");
  check('annual series accepts January sequence 1 after prior-year sequence 7', db.prepare('SELECT COUNT(*) n FROM invoice_series').get().n === 2);
  db.close();
}

console.log('\n■ Contenu : ce que D1 accepte, ce qui touche aux données');
for (const name of files) {
  const sql = stripComments(read(name));
  check(`${name} n'ouvre pas de transaction`, !/^(?:[ \t]*)(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/im.test(sql),
    'wrangler enveloppe déjà chaque migration ; D1 refuse BEGIN/COMMIT explicites');
  const destructive = /\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|\bALTER\s+TABLE\s+\w+\s+RENAME\b/i.test(sql);
  const approved = /^--\s*destructive:\s*approved by owner\b/im.test(read(name));
  check(`${name} n'efface rien sans accord écrit`, !destructive || approved,
    'la production porte de vraies écritures financières ; ajoute « -- destructive: approved by owner AAAA-MM-JJ » une fois l\'accord donné');
}
const baseline = files.find((name) => name.startsWith('0001_'));
if (baseline) {
  const creates = stripComments(read(baseline)).match(/^\s*CREATE\s+.*$/gim) || [];
  const bare = creates.filter((line) => !/IF\s+NOT\s+EXISTS/i.test(line));
  check(`${baseline} : chaque CREATE est IF NOT EXISTS (${creates.length})`, !bare.length, bare.slice(0, 3).join(' | '));
}

console.log('\n■ Migrations appliquées = schema.sql');
let migrated = null;
try {
  migrated = applyMigrations(freshDb());
  check(`${files.length} migration(s) s'appliquent sur une base vide`, true);
} catch (error) {
  check('les migrations s\'appliquent sur une base vide', false, error.message);
}
if (migrated) {
  const want = shapeOf(applySchema(freshDb()));
  const gaps = compareShapes(want, shapeOf(migrated));
  check(`même forme que schema.sql (${want.tables.size} tables, ${want.indexes.size} index)`, !gaps.length,
    `${gaps.slice(0, 12).join('\n      ')}${gaps.length > 12 ? `\n      … et ${gaps.length - 12} autre(s)` : ''}`
    + '\n      → node tools/d1-migrations.mjs --draft écrit le brouillon de la migration qui manque');

  try {
    migrated.exec(read(baseline));
    check(`${baseline} rejouée sur une base à jour : sans effet, sans erreur`, true);
  } catch (error) {
    check(`${baseline} rejouée sur une base à jour`, false, error.message);
  }
}

console.log('\n■ Mise à niveau d\'une base remplie : les lignes survivent');

/* Valeurs entièrement synthétiques : aucun commerce, aucun code, aucun hash réel. */
const SEED = {
  accounts: [
    { id: 'acc-synth-1', email: 'synth-1@example.test', name: 'Synth Un', business: 'Boutique Synth', salt: 'synth-salt', hash: 'synth-hash', created_ts: 1760000000000, status: 'active', session_epoch: 3 },
    { id: 'acc-synth-2', email: 'synth-2@example.test', name: null, business: null, salt: 'synth-salt', hash: 'synth-hash', created_ts: 1760000001000, status: 'suspended', session_epoch: 0 },
  ],
  merchant_config: [
    { merchant: 'synth-shop-a', features: '{"stock":true}', plan: 'basic', updated_ts: 1760000002000, account_id: 'acc-synth-1', name: 'Synth A', status: 'active', mrr: 15000, till_epoch: 2, timezone: 'Africa/Casablanca', business_cutoff: 5 },
    { merchant: 'synth-shop-b', features: '{}', plan: null, updated_ts: 1760000003000, account_id: 'acc-synth-2' },
  ],
  sales: [
    { id: 'sale-synth-1', merchant: 'synth-shop-a', amount: 120, method: 'cash', label: 'Synth', ref: 'R-1', ts: 1760000010000, lines: '[{"id":"p1","qty":2,"price":60}]', amount_cents: 12000, gross_amount_cents: 12000, discount_amount_cents: 0, payment_parts: '[{"method":"cash","amount_cents":12000}]', tip_cents: 0, seller_id: 'sel-1', seller_name: 'Vendeuse' },
    { id: 'sale-synth-2', merchant: 'synth-shop-a', amount: 99, method: 'split', ts: 1760000020000, amount_cents: 9950, gross_amount_cents: 10000, discount_amount_cents: 50, discount_reason: 'synth', payment_parts: '[{"method":"cash","amount_cents":5000},{"method":"card","amount_cents":4950}]', tip_cents: 200 },
    { id: 'sale-synth-3', merchant: 'synth-shop-b', amount: 10, method: 'card', ts: 1760000030000, amount_cents: 1000, void_ts: 1760000040000, void_reason: 'synth', void_actor_id: 'sel-9', channel: 'till' },
  ],
  sale_invoices: [
    {merchant:'synth-shop-a',seq:7,number:'F-2025-0007',sale_id:'sale-synth-1',snapshot:'{"totals":{"ttc":120}}',created_ts:1760000010000},
  ],
  sale_receipts: [
    { merchant: 'synth-shop-a', sale_id: 'sale-synth-1', gross_ticket_cents: 12000, consigned_cents: 0, created_ts: 1760000011000 },
    { merchant: 'synth-shop-a', sale_id: 'sale-synth-2', gross_ticket_cents: 10000, consigned_cents: 300, created_ts: 1760000021000 },
  ],
  sale_audit: [
    { merchant: 'synth-shop-b', sale_id: 'sale-synth-3', action: 'void', amount: 10, ts: 1760000040000, amount_cents: 1000 },
  ],
  clients: [
    { merchant: 'synth-shop-a', id: 'cli-synth-1', name: 'Cliente Synth', phone: '0600000000', points: 40, stamps: 2, visits: 5, spend: 25000, consent: 1, first_seen: 1759000000000, last_seen: 1760000010000, updated_ts: 1760000010000, srv_ts: 1760000010001, hospitality: '{"room":"12"}' },
    { merchant: 'synth-shop-a', id: 'cli-synth-2', name: 'Client Supprimé', deleted: 1, srv_ts: 1760000012000 },
    { merchant: 'synth-shop-b', id: 'cli-synth-1', name: 'Même id, autre magasin', srv_ts: 1760000013000 },
  ],
  store_docs: [
    { merchant: 'synth-shop-a', feature: 'menu', data: '{"items":[{"id":"i1","price":12.5}]}', rev: 4, updated_ts: 1760000050000 },
    { merchant: 'synth-shop-a', feature: 'stock', data: '{"n":1}', rev: 1, updated_ts: 1760000051000 },
    { merchant: 'synth-shop-b', feature: 'menu', data: '{}', rev: 0, updated_ts: 1760000052000 },
  ],
  inventory_movements: [
    { id: 'mov-synth-1', merchant: 'synth-shop-a', item_id: 'i1', qty_milli: -2000, reason: 'sale', ref_type: 'sale', ref_id: 'sale-synth-1', occurred_ts: 1760000010000, srv_ts: 1760000010002, created_ts: 1760000010002, unit_cost_cents: 3000 },
  ],
  hotel_stay_events: [
    { merchant: 'synth-shop-a', id: 'hev-synth-1', stay_id: 'stay-synth-1', event_type: 'check_in', payload_json: '{"room":"12"}', occurred_ts: 1760000060000, srv_cursor: 1, event_ordinal: 0, actor_id: 'sel-1', actor_role: 'reception' },
    { merchant: 'synth-shop-a', id: 'hev-synth-2', stay_id: 'stay-synth-1', event_type: 'check_out', payload_json: '{}', occurred_ts: 1760000070000, srv_cursor: 2, event_ordinal: 0, actor_id: 'sel-1', actor_role: 'reception' },
  ],
  hotel_room_charge_events: [
    { merchant: 'synth-shop-a', id: 'rce-synth-1', kind: 'charge', sale_id: 'sale-synth-1', outlet_id: 'bar', shift_id: 'sh-1', cashier_id: 'sel-1', cashier_name: 'Vendeuse', amount_cents: 12000, occurred_ts: 1760000010000 },
    { merchant: 'synth-shop-a', id: 'rce-synth-2', kind: 'reversal', sale_id: 'sale-synth-1', outlet_id: 'bar', shift_id: 'sh-1', cashier_id: 'sel-1', amount_cents: 12000, occurred_ts: 1760000080000, reversal_of: 'rce-synth-1' },
  ],
  hotel_internal_requests: [
    { merchant: 'synth-shop-a', id: 'req-synth-1', unit_id: 'unit-1', state: 'submitted', revision: 2, create_key: 'ck-synth-1', created_ts: 1760000090000, updated_ts: 1760000091000, submitted_ts: 1760000091000 },
  ],
  hotel_internal_request_lines: [
    { merchant: 'synth-shop-a', request_id: 'req-synth-1', line_no: 1, item_id: 'i1', unit: 'kg', conversion_snapshot: '{"factor":1}', qty_requested_base_milli: 2500, qty_requested: 2.5, substitute_for: '' },
    { merchant: 'synth-shop-a', request_id: 'req-synth-1', line_no: 2, item_id: 'i2', unit: 'pc', conversion_snapshot: '{}', qty_requested_base_milli: 4000, qty_requested: 4, qty_approved: 3, resolution: 'partial', note: 'synth' },
  ],
  print_jobs: [
    { id: 'job-synth-1', merchant: 'synth-shop-a', bridge_id: null, kind: 'receipt', target: '{"ip":"192.0.2.10","port":9100}', data_b64: 'U1lOVEg=', status: 'queued', created_ts: 1760000100000, expires_ts: 1760000700000 },
    { id: 'job-synth-2', merchant: 'synth-shop-a', bridge_id: 'br-synth', kind: 'kitchen', target: '{"osPrinter":"synth"}', data_b64: 'U1lOVEg=', status: 'done', created_ts: 1760000101000, expires_ts: 1760000701000, claimed_ts: 1760000102000, done_ts: 1760000103000, bytes: 5 },
  ],
  push_tokens: [
    { merchant: 'synth-shop-a', token: 'tok-synth-1', role: 'caisse', platform: 'ios', created_at: 1760000110000, updated_at: 1760000110000 },
    { merchant: 'synth-shop-a', token: 'tok-synth-2', role: 'employee', employee_id: 'emp-1', platform: 'web', device_id: 'dev-1', created_at: 1760000111000, updated_at: 1760000112000 },
  ],
};

const columnsOf = (db, table) => db.prepare('SELECT * FROM pragma_table_info(?)').all(table);
const rowKey = (row) => JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]));

function insertAll(db, seed) {
  for (const [table, rows] of Object.entries(seed)) {
    for (const row of rows) {
      const cols = Object.keys(row);
      db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
    }
  }
}

/* Lit chaque table semée telle qu'elle est à la baseline : toutes ses colonnes
 * d'alors, chaque ligne en clé stable (l'ordre des lignes peut changer si une
 * future migration reconstruit la table). */
function snapshot(db, seed) {
  const out = new Map();
  for (const table of Object.keys(seed)) {
    const cols = columnsOf(db, table).map((c) => c.name);
    const rows = db.prepare(`SELECT ${cols.join(',')} FROM ${table}`).all().map((r) => rowKey(r));
    out.set(table, { cols, rows: rows.sort() });
  }
  return out;
}

/* Met à niveau une base remplie avec `laterSqls` (dans l'ordre) et rend les écarts. */
function upgradeProblems(baselineSql, laterSqls, seed = SEED) {
  const db = freshDb();
  db.exec(baselineSql);
  insertAll(db, seed);
  const before = snapshot(db, seed);
  const colsBefore = new Map([...before.keys()].map((t) => [t, new Set(columnsOf(db, t).map((c) => c.name))]));
  for (const sql of laterSqls) db.exec(sql);

  const problems = [];
  const added = new Map();
  for (const [table, { cols, rows }] of before) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
      problems.push(`${table} : la table a disparu`); continue;
    }
    const nowCols = new Set(columnsOf(db, table).map((c) => c.name));
    const lost = cols.filter((c) => !nowCols.has(c));
    if (lost.length) { problems.push(`${table} : colonne(s) retirée(s) ${lost.join(', ')}`); continue; }
    const count = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    if (count !== rows.length) problems.push(`${table} : ${rows.length} ligne(s) avant, ${count} après`);
    const after = new Set(db.prepare(`SELECT ${cols.join(',')} FROM ${table}`).all().map((r) => rowKey(r)));
    const missing = rows.filter((r) => !after.has(r));
    if (missing.length) problems.push(`${table} : ${missing.length} ligne(s) changée(s) ou perdue(s), par ex. ${missing[0].slice(0, 160)}`);

    /* Colonnes ajoutées : NOT NULL ne doit jamais rester NULL sur l'existant,
     * et un défaut littéral doit y être posé. */
    for (const c of columnsOf(db, table).filter((col) => !colsBefore.get(table).has(col.name))) {
      added.set(`${table}.${c.name}`, c);
      if (c.notnull) {
        const nulls = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${c.name} IS NULL`).get().n;
        if (nulls) problems.push(`${table}.${c.name} : NOT NULL mais NULL sur ${nulls} ligne(s) déjà là`);
      }
      if (c.dflt_value != null) {
        const off = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${c.name} IS NOT (${c.dflt_value})`).get().n;
        if (off) problems.push(`${table}.${c.name} : défaut ${c.dflt_value} absent de ${off} ligne(s) déjà là`);
      }
    }
  }
  return { problems, db, added };
}

if (baseline) {
  const baselineSql = read(baseline);
  const laterSqls = files.filter((n) => n !== baseline).map(read);
  const real = upgradeProblems(baselineSql, laterSqls);
  check(`${laterSqls.length} migration(s) après la baseline gardent chaque ligne de ${Object.keys(SEED).length} tables`,
    !real.problems.length, real.problems.slice(0, 8).join('\n      '));
  check('le test sème bien des lignes dans chaque table',
    Object.values(SEED).every((rows) => rows.length > 0));

  /* Les colonnes que 0002 ajoute sur des tables déjà peuplées prouvent que la
   * vérification regarde vraiment les colonnes ajoutées. */
  for (const key of ['push_tokens.lang', 'hotel_room_charge_events.stay_id', 'hotel_internal_request_lines.substitute_unit']) {
    const col = real.added.get(key);
    check(`${key} (ajoutée sur des lignes existantes) est examinée : NOT NULL avec défaut`,
      !!col && col.notnull === 1 && col.dflt_value != null, col ? `notnull=${col.notnull} default=${col.dflt_value}` : 'colonne ajoutée introuvable');
  }
  check('les lignes d\'avant lisent le défaut des colonnes ajoutées (lang vide, substitute_conversion_snapshot « {} »)',
    real.db.prepare("SELECT COUNT(*) AS n FROM push_tokens WHERE lang = ''").get().n === SEED.push_tokens.length
    && real.db.prepare("SELECT COUNT(*) AS n FROM hotel_internal_request_lines WHERE substitute_conversion_snapshot = '{}'").get().n === SEED.hotel_internal_request_lines.length);

  /* Les ventes d'avant restent lisibles avec leurs montants et leurs parts de
   * paiement, et le journal de changements suit les écritures d'après. */
  const sale = real.db.prepare('SELECT amount_cents, payment_parts, tip_cents FROM sales WHERE id = ?').get('sale-synth-2');
  check('une vente mixte garde amount_cents, payment_parts et tip_cents',
    !!sale && sale.amount_cents === 9950 && sale.tip_cents === 200
    && JSON.parse(sale.payment_parts).reduce((sum, part) => sum + part.amount_cents, 0) === 9950);
  const receipts = real.db.prepare('SELECT SUM(gross_ticket_cents) AS g, SUM(consigned_cents) AS c FROM sale_receipts').get();
  check('les reçus gardent leurs sommes au centime', receipts.g === 22000 && receipts.c === 300);
  if (real.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sale_changes'").get()) {
    real.db.prepare("UPDATE sales SET label = 'après mise à niveau' WHERE id = 'sale-synth-1'").run();
    const logged = real.db.prepare("SELECT COUNT(*) AS n FROM sale_changes WHERE sale_id = 'sale-synth-1'").get().n;
    check('une écriture sur une vente d\'avant est enregistrée dans sale_changes', logged >= 1);
  }

  /* Le contrôle doit voir une migration qui abîme les données. */
  const hurts = (sql) => upgradeProblems(baselineSql, [...laterSqls, sql]).problems;
  check('une migration qui efface des ventes est signalée',
    hurts("DELETE FROM sales WHERE id = 'sale-synth-3'").some((p) => p.startsWith('sales :')));
  check('une migration qui réécrit un montant est signalée',
    hurts("UPDATE sales SET amount_cents = amount_cents + 1 WHERE id = 'sale-synth-1'").some((p) => p.startsWith('sales :')));
  check('une migration qui retire une colonne est signalée',
    hurts('ALTER TABLE clients DROP COLUMN hospitality').some((p) => p.includes('clients : colonne')));
  check('une colonne ajoutée dont le défaut manque sur l\'existant est signalée',
    hurts("ALTER TABLE accounts ADD COLUMN probe TEXT NOT NULL DEFAULT 'x'; UPDATE accounts SET probe = 'y' WHERE id = 'acc-synth-1'")
      .some((p) => p.includes('accounts.probe')));
  check('une table reconstruite en perdant des lignes est signalée',
    hurts("CREATE TABLE print_jobs_new AS SELECT * FROM print_jobs WHERE status = 'queued'; DROP TABLE print_jobs; ALTER TABLE print_jobs_new RENAME TO print_jobs")
      .some((p) => p.startsWith('print_jobs :')));
}

console.log('\n■ Le comparateur voit un écart');
{
  const want = shapeOf(applySchema(freshDb()));
  const drifted = applySchema(freshDb());
  drifted.exec('ALTER TABLE sales ADD COLUMN drift_probe TEXT');
  drifted.exec('DROP INDEX idx_sales_merchant');
  drifted.exec('DROP TRIGGER sales_change_log');
  const gaps = compareShapes(want, shapeOf(drifted));
  check('une colonne en trop est signalée', gaps.some((g) => g.includes('sales.drift_probe')), gaps.join(' | '));
  check('un trigger manquant est signalé', gaps.some(g => g.includes('trigger sales_change_log')), gaps.join(' | '));
  drifted.exec('CREATE TRIGGER sales_change_log AFTER UPDATE ON sales BEGIN SELECT 1; END;');
  check('un trigger modifié est signalé', compareShapes(want, shapeOf(drifted)).some(g => g.includes('trigger sales_change_log') && g.includes('différente')));
  check('un index manquant est signalé', gaps.some((g) => g.includes('idx_sales_merchant')), gaps.join(' | '));
}

console.log('\n■ wrangler sait où appliquer');
{
  const toml = readFileSync(join(ROOT, 'wrangler.d1.toml'), 'utf8');
  check('wrangler.d1.toml vise kiwi-sales', /database_name\s*=\s*"kiwi-sales"/.test(toml));
  check('wrangler.d1.toml lit migrations/', /migrations_dir\s*=\s*"migrations"/.test(toml));
  check('wrangler.d1.toml reste hors du déploiement Pages (pas de pages_build_output_dir)',
    !/pages_build_output_dir/.test(toml));
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ migrations/ et schema.sql décrivent la même base\n');
process.exit(failures ? 1 : 0);
