#!/usr/bin/env node
/* tools/d1-schema-test.mjs — la boucle de dérive, fermée.
 *
 * Ce test existe pour UNE propriété : `schema.sql` reste la seule source de
 * vérité. Trois fois de suite, une colonne a été ajoutée au fichier sans que la
 * base déployée la reçoive, et chaque fois la panne s'est présentée sous un
 * autre visage (config vide, code employé refusé, doublons de commande).
 *
 * On vérifie donc, sans toucher à la production :
 *   1. une base construite depuis schema.sql est déclarée À JOUR — c'est-à-dire
 *      que le lecteur de schema.sql comprend bien tout ce que le fichier écrit.
 *      Une colonne ajoutée demain dans une forme que le lecteur ne sait pas lire
 *      fait échouer ce test-là, tout de suite, au lieu de la production ;
 *   2. une base à laquelle on retire ce qu'il manque à la vraie production est
 *      diagnostiquée exactement, réparée, et redevient à jour.
 *
 * Aucune variable d'environnement, aucun réseau : sqlite3 et un fichier
 * temporaire. `node tools/d1-schema-test.mjs`
 */

import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseSchema, diff, addColumnStatement, stripComments } from './d1-schema.mjs';

const execFile = promisify(execFileCallback);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCHEMA_PATH = resolve(ROOT, 'schema.sql');
const TOOL = resolve(HERE, 'd1-schema.mjs');

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

async function sqlite(db, sql) {
  const { stdout } = await execFile('sqlite3', ['-json', db, sql], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : [];
}

async function runTool(args) {
  try {
    const { stdout } = await execFile('node', [TOOL, ...args], { maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout || '' };
  }
}

/* Ce qui manque réellement à la base de production d'après les ALTER restés en
 * commentaire — on le REPRODUIT pour vérifier que l'outil le voit. */
const SIMULATED_GAP = {
  columns: [
    ['orders', 'session_id'], ['orders', 'server_name'], ['orders', 'menu_rev'],
    ['orders', 'priced_ts'], ['orders', 'client_ref'], ['orders', 'paid_ts'],
    ['orders', 'channel'], ['orders', 'ext_ref'], ['orders', 'customer'],
    ['merchant_config', 'status'], ['merchant_config', 'city'], ['merchant_config', 'mrr'],
    ['sales', 'lines'], ['sales', 'void_ts'],
  ],
  indexes: ['orders_client_ref', 'orders_ext_ref', 'idx_orders_session', 'table_sessions_live', 'idx_table_transfers_live', 'idx_kitchen_voids_live'],
  tables: ['order_desk', 'table_transfers', 'kitchen_voids'],
};

async function main() {
  const schemaText = await readFile(SCHEMA_PATH, 'utf8');
  const expected = parseSchema(schemaText);
  const dir = await mkdtemp(join(tmpdir(), 'kiwi-schema-'));
  const fresh = join(dir, 'fresh.db');
  const aged = join(dir, 'aged.db');

  try {
    console.log('\nLecture de schema.sql');
    check('des tables sont trouvées', expected.tables.size >= 20,
      `${expected.tables.size} table(s) — attendu au moins 20`);
    check('des index sont trouvés', expected.indexes.size >= 15,
      `${expected.indexes.size} index — attendu au moins 15`);
    check('les commentaires français ne cassent pas la lecture',
      !stripComments(schemaText).includes("l'index"));
    check('la contrainte de table n\'est pas prise pour une colonne',
      !(expected.tables.get('store_docs')?.columns || []).some((c) => /^PRIMARY$/i.test(c.name)));
    check('orders.client_ref est bien déclarée dans schema.sql',
      (expected.tables.get('orders')?.columns || []).some((c) => c.name === 'client_ref'));

    /* La consigne « pense à passer cet ALTER » a échoué trois fois. Elle ne
     * revient pas : une colonne se déclare dans son CREATE TABLE, et l'outil
     * s'occupe de la base déployée. Un ALTER en commentaire est une consigne
     * que personne n'exécute — ce test la refuse. */
    const strayAlters = [...schemaText.matchAll(/^--\s*ALTER TABLE (\w+) ADD COLUMN (\w+)/gm)];
    check('aucun ALTER ne subsiste en commentaire', strayAlters.length === 0,
      strayAlters.map((m) => `${m[1]}.${m[2]}`).join(', '));

    /* Le vrai risque de l'ancien système : une colonne qui n'existe QUE dans un
     * ALTER commenté. Une base neuve ne la reçoit jamais, et le repli en
     * cascade masque l'absence. C'est exactement ce qui est arrivé à
     * orders.channel/ext_ref/customer. */
    for (const [, table, column] of strayAlters) {
      check(`${table}.${column} est aussi dans son CREATE TABLE`,
        (expected.tables.get(table)?.columns || []).some((c) => c.name === column),
        'une base neuve ne recevrait jamais cette colonne');
    }

    /* ── 1. Une base neuve, construite depuis schema.sql, est à jour ──────── */
    console.log('\nBase neuve construite depuis schema.sql');
    await execFile('sqlite3', [fresh, `.read '${SCHEMA_PATH.replace(/'/g, "''")}'`]);
    const freshCheck = await runTool(['--sqlite', fresh]);
    check('l\'outil la déclare à jour (code 0)', freshCheck.code === 0,
      freshCheck.stdout.split('\n').filter((l) => l.includes('✗')).join('\n      '));
    check('le rapport le dit', freshCheck.stdout.includes('a tout ce que schema.sql déclare'));

    /* ── 2. Une base vieillie est diagnostiquée puis réparée ─────────────── */
    console.log('\nBase vieillie (ce qui manque à la production)');
    /* Construite depuis un schema.sql SANS commentaires, et non copiée depuis
     * `fresh`. SQLite conserve le texte original du CREATE TABLE et le relit
     * quand DROP COLUMN reconstruit la table : le commentaire qui suivait la
     * dernière colonne se retrouve alors orphelin et rend l'ordre illisible
     * (« incomplete input »). C'est une limite de la mise en scène, pas de
     * l'outil — la vraie base de production, elle, n'a jamais eu ces colonnes. */
    await execFile('sqlite3', [aged, stripComments(schemaText)]);
    for (const name of SIMULATED_GAP.indexes) await sqlite(aged, `DROP INDEX IF EXISTS ${name};`);
    for (const name of SIMULATED_GAP.tables) await sqlite(aged, `DROP TABLE IF EXISTS ${name};`);
    for (const [table, column] of SIMULATED_GAP.columns) {
      await sqlite(aged, `ALTER TABLE ${table} DROP COLUMN ${column};`);
    }

    const agedCheck = await runTool(['--sqlite', aged]);
    check('l\'outil signale un écart (code 1)', agedCheck.code === 1);
    check('orders.client_ref est nommée', agedCheck.stdout.includes('orders.client_ref'));
    check('le danger silencieux est expliqué',
      agedCheck.stdout.includes('AUCUNE protection contre le doublon'));
    check('merchant_config.status est nommée', agedCheck.stdout.includes('merchant_config.status'));
    check('la table absente est nommée', agedCheck.stdout.includes('order_desk'));
    check('l\'index unique est nommé', agedCheck.stdout.includes('orders_client_ref'));

    const planned = await runTool(['--sqlite', aged, '--apply']);
    check('sans --yes, rien n\'est posé (code 1)', planned.code === 1);
    check('sans --yes, le plan est montré', planned.stdout.includes('ALTER TABLE orders ADD COLUMN'));
    const stillMissing = await sqlite(aged, "SELECT name FROM pragma_table_info('orders')");
    check('sans --yes, la base est intacte',
      !stillMissing.some((c) => c.name === 'client_ref'));

    console.log('\nRéparation');
    const applied = await runTool(['--sqlite', aged, '--apply', '--yes']);
    check('l\'application réussit (code 0)', applied.code === 0,
      applied.stdout.split('\n').slice(-6).join('\n      '));

    const after = await runTool(['--sqlite', aged]);
    check('la base réparée est déclarée à jour', after.code === 0,
      after.stdout.split('\n').filter((l) => l.includes('✗')).join('\n      '));

    const cols = await sqlite(aged, "SELECT name FROM pragma_table_info('orders')");
    check('orders.client_ref existe', cols.some((c) => c.name === 'client_ref'));
    check('orders.session_id existe', cols.some((c) => c.name === 'session_id'));
    const idx = await sqlite(aged, "SELECT name FROM sqlite_master WHERE type = 'index'");
    check('l\'index orders_client_ref existe', idx.some((i) => i.name === 'orders_client_ref'));
    check('l\'index orders_ext_ref existe', idx.some((i) => i.name === 'orders_ext_ref'));
    check('l\'index table_sessions_live existe', idx.some((i) => i.name === 'table_sessions_live'));

    /* L'index unique partiel doit réellement MORDRE — c'est lui, et pas la
     * colonne seule, qui empêche le doublon de commande. */
    await sqlite(aged, `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines,
      status, created_ts, updated_ts, client_ref)
      VALUES ('ord-a', 'm', 1, 'table', '3', 10, '[]', 'accepted', 1, 1, 'ref-1');`);
    let refused = false;
    try {
      await sqlite(aged, `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines,
        status, created_ts, updated_ts, client_ref)
        VALUES ('ord-b', 'm', 2, 'table', '3', 10, '[]', 'accepted', 1, 1, 'ref-1');`);
    } catch (_) { refused = true; }
    check('un doublon de client_ref est refusé par la base', refused);

    await sqlite(aged, `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines,
      status, created_ts, updated_ts, channel, ext_ref)
      VALUES ('ord-ext-a', 'm', 3, 'delivery', '', 10, '[]', 'pending', 1, 1, 'shopify', 'ext-1');`);
    let extRefused = false;
    try {
      await sqlite(aged, `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines,
        status, created_ts, updated_ts, channel, ext_ref)
        VALUES ('ord-ext-b', 'm', 4, 'delivery', '', 10, '[]', 'pending', 1, 1, 'shopify', 'ext-1');`);
    } catch (_) { extRefused = true; }
    check('un doublon de référence prestataire est refusé par la base', extRefused);

    /* ── 3. Le garde-fou sur ADD COLUMN ──────────────────────────────────── */
    console.log('\nGarde-fous');
    const notNull = addColumnStatement('t', { name: 'x', definition: 'x TEXT NOT NULL' });
    check('NOT NULL sans DEFAULT est refusé, pas fabriqué', notNull.sql === null);
    const withDefault = addColumnStatement('t', {
      name: 'x', definition: "x TEXT NOT NULL DEFAULT 'active'",
    });
    check('NOT NULL avec DEFAULT passe', /ADD COLUMN x TEXT NOT NULL DEFAULT 'active'/.test(withDefault.sql || ''));
    const pk = addColumnStatement('t', { name: 'x', definition: 'x TEXT PRIMARY KEY' });
    check('PRIMARY KEY est retiré de l\'ADD COLUMN', !/PRIMARY/i.test(pk.sql || 'PRIMARY'));

    /* Une base identique à l'attendu ne doit RIEN proposer : sans ça, chaque
     * exécution reposerait les mêmes ordres. */
    const empty = diff(expected, {
      tables: new Map([...expected.tables].map(([n, t]) => [n, new Set(t.columns.map((c) => c.name))])),
      indexes: new Set(expected.indexes.keys()),
    });
    check('aucun faux positif sur une base conforme',
      !empty.missingTables.length && !empty.missingColumns.length && !empty.missingIndexes.length);

    /* ── 4. Le runbook exige l'attestation, pas seulement l'outil ──────────
     * docs/ops/DEPLOY.md doit prescrire `node tools/d1-schema.mjs` après
     * chaque release qui touche schema.sql, documenter les sorties, et
     * séparer l'autorisation de migration (--apply --yes) de l'attestation
     * (lecture seule). Sans cette phrase, l'outil existe mais personne ne
     * le lance — c'est exactement comme ça que les trois dérives ont eu lieu. */
    const deploy = await readFile(resolve(ROOT, 'docs/ops/DEPLOY.md'), 'utf8');
    check('DEPLOY.md prescrit node tools/d1-schema.mjs après release schéma',
      /node tools\/d1-schema\.mjs/.test(deploy) && /schema-affecting releases|touche schema\.sql/.test(deploy));
    check('DEPLOY.md documente les sorties 0/1/2',
      /Exit \*\*0\*\*|sortie 0/.test(deploy) && /Exit \*\*1\*\*|dérive|drift/.test(deploy)
      && /Exit \*\*2\*\*|erreur/i.test(deploy));
    check('DEPLOY.md sépare --apply --yes de l\u2019attestation',
      /--apply --yes/.test(deploy) && /SEPARATE|jamais.*écrit|never writes|n'écrit/i.test(deploy));
    check('DEPLOY.md ne duplique pas la vérité schéma en listes PRAGMA',
      !/pragma_table_info/i.test(deploy));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  console.log(failures ? `\n${failures} échec(s)\n` : '\nTout passe.\n');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => { console.error(error); process.exitCode = 2; });
