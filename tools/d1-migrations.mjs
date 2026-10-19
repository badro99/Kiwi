#!/usr/bin/env node
/* tools/d1-migrations.mjs — migrations/ est l'histoire, schema.sql le portrait.
 *
 * ── Le problème ────────────────────────────────────────────────────────────
 * La production D1 retardait toujours sur schema.sql (CLAUDE.md §3). Un
 * `CREATE TABLE IF NOT EXISTS` ne touche jamais une table déjà là, et les
 * fichiers datés de migrations/legacy/ se passaient à la main, un par un, quand
 * quelqu'un y pensait. Personne ne pouvait dire lesquels la production avait
 * reçus.
 *
 * ── La règle ───────────────────────────────────────────────────────────────
 * migrations/NNNN_nom.sql, au format de `wrangler d1 migrations` : wrangler
 * tient lui-même la table d1_migrations et n'applique que ce qui manque. Une
 * base neuve qui reçoit 0001…N doit être EXACTEMENT schema.sql (tables,
 * colonnes, index, clés étrangères). tools/d1-migrations-test.mjs le prouve à
 * chaque `check.js`, sans réseau : changer schema.sql sans écrire la migration,
 * ou l'inverse, met le gate au rouge.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *   node tools/d1-migrations.mjs            # écart migrations → schema.sql
 *   node tools/d1-migrations.mjs --draft    # le SQL de la prochaine migration
 *
 * Le brouillon reprend la logique de tools/d1-schema.mjs (tables, colonnes,
 * index qui manquent). Ce qu'un ALTER ne sait pas faire — changer une
 * contrainte, retirer une colonne — est listé, jamais deviné.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { parseSchema, diff } from './d1-schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const MIGRATIONS_DIR = join(ROOT, 'migrations');
export const SCHEMA_PATH = join(ROOT, 'schema.sql');

/* Le nom que wrangler attend : quatre chiffres, un souligné, un nom. Wrangler
 * lit TOUT fichier .sql du dossier ; un fichier daté posé là par habitude
 * deviendrait une migration appliquée à la production au prochain `apply`. */
export const MIGRATION_NAME = /^(\d{4})_[a-z0-9][a-z0-9_]*\.sql$/;

export function listMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

export function freshDb() {
  return new DatabaseSync(':memory:');
}

export function applyMigrations(db, dir = MIGRATIONS_DIR) {
  for (const name of listMigrations(dir)) {
    try { db.exec(readFileSync(join(dir, name), 'utf8')); }
    catch (error) { throw new Error(`${name} : ${error.message}`); }
  }
  return db;
}

export function applySchema(db, path = SCHEMA_PATH) {
  db.exec(readFileSync(path, 'utf8'));
  return db;
}

/* ═══════════════════ FORME D'UNE BASE ═════════════════════════════════════ */

const INTERNAL = /^(sqlite_|_cf_|d1_migrations$)/;

/* L'ordre des colonnes n'est PAS comparé : ALTER TABLE … ADD COLUMN pose
 * toujours en fin de table, alors que schema.sql range une colonne à sa place
 * logique. Ce qui compte pour le code est le nom, le type, NOT NULL, le défaut
 * et la clé. */
function normalizeIndexSql(sql) {
  return sql
    .replace(/\bIF\s+NOT\s+EXISTS\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim();
}

export function shapeOf(db) {
  const tables = new Map();
  const indexes = new Map();
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
    .map((row) => row.name)
    .filter((name) => !INTERNAL.test(name));

  for (const table of names) {
    const columns = new Map();
    for (const c of db.prepare('SELECT * FROM pragma_table_info(?)').all(table)) {
      columns.set(c.name, `${String(c.type).toUpperCase()} · notnull=${c.notnull} · default=${c.dflt_value} · pk=${c.pk}`);
    }
    const foreignKeys = db.prepare('SELECT * FROM pragma_foreign_key_list(?)').all(table)
      .map((fk) => `${fk.from}→${fk.table}.${fk.to} on delete ${fk.on_delete}`)
      .sort();
    tables.set(table, { columns, foreignKeys });

    for (const index of db.prepare('SELECT * FROM pragma_index_list(?)').all(table)) {
      const cols = db.prepare('SELECT name FROM pragma_index_info(?)').all(index.name).map((r) => r.name).join(',');
      if (index.origin === 'c') {
        const { sql } = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(index.name);
        indexes.set(index.name, { table, describe: normalizeIndexSql(sql) });
      } else {
        /* Index implicites (PRIMARY KEY / UNIQUE de table) : leur nom
         * sqlite_autoindex_x_N dépend de l'ordre de déclaration, on les clé
         * donc par ce qu'ils garantissent. */
        const key = `${table} · ${index.origin === 'pk' ? 'PRIMARY KEY' : 'UNIQUE'}(${cols})`;
        indexes.set(key, { table, describe: key });
      }
    }
  }
  return { tables, indexes };
}

/* Chaque écart, dans le sens « ce que schema.sql veut » ← « ce que les
 * migrations donnent ». Une liste vide = les deux sont identiques. */
export function compareShapes(want, got) {
  const out = [];
  for (const [table, w] of want.tables) {
    const g = got.tables.get(table);
    if (!g) { out.push(`table ${table} : dans schema.sql, aucune migration ne la crée`); continue; }
    for (const [column, definition] of w.columns) {
      if (!g.columns.has(column)) out.push(`colonne ${table}.${column} : dans schema.sql, absente des migrations`);
      else if (g.columns.get(column) !== definition) {
        out.push(`colonne ${table}.${column} : schema.sql « ${definition} » ≠ migrations « ${g.columns.get(column)} »`);
      }
    }
    for (const column of g.columns.keys()) {
      if (!w.columns.has(column)) out.push(`colonne ${table}.${column} : créée par les migrations, absente de schema.sql`);
    }
    if (w.foreignKeys.join('|') !== g.foreignKeys.join('|')) {
      out.push(`clés étrangères de ${table} : schema.sql [${w.foreignKeys}] ≠ migrations [${g.foreignKeys}]`);
    }
  }
  for (const table of got.tables.keys()) {
    if (!want.tables.has(table)) out.push(`table ${table} : créée par les migrations, absente de schema.sql`);
  }
  for (const [name, w] of want.indexes) {
    const g = got.indexes.get(name);
    if (!g) out.push(`index ${name} : dans schema.sql, absent des migrations`);
    else if (g.describe !== w.describe) out.push(`index ${name} : schema.sql « ${w.describe} » ≠ migrations « ${g.describe} »`);
  }
  for (const name of got.indexes.keys()) {
    if (!want.indexes.has(name)) out.push(`index ${name} : créé par les migrations, absent de schema.sql`);
  }
  return out;
}

/* ═══════════════════ BROUILLON DE LA PROCHAINE MIGRATION ══════════════════ */

/* Le texte BRUT d'un CREATE TABLE de schema.sql, commentaires compris : une
 * migration se relit, et ses commentaires sont souvent la seule trace du
 * pourquoi. */
function rawCreateTable(schemaText, name) {
  const re = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${name}\\s*\\([\\s\\S]*?\\n\\s*\\)\\s*;`);
  const match = schemaText.match(re);
  return match ? match[0] : null;
}

export function draftNextMigration(db, schemaText) {
  const expected = parseSchema(schemaText);
  const live = { tables: new Map(), indexes: new Set() };
  for (const { name, type } of db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','index')").all()) {
    if (type === 'index') { live.indexes.add(name); continue; }
    live.tables.set(name, new Set(db.prepare('SELECT name FROM pragma_table_info(?)').all(name).map((c) => c.name)));
  }
  const result = diff(expected, live);
  const statements = [
    ...result.missingTables.map((t) => rawCreateTable(schemaText, t.name) || t.sql),
    ...result.missingColumns.map((c) => c.sql),
    ...result.missingIndexes.map((i) => i.sql),
  ];
  return { statements, blocked: result.blocked };
}

/* ═══════════════════ ENTRÉE ═══════════════════════════════════════════════ */

function main(argv) {
  const schemaText = readFileSync(SCHEMA_PATH, 'utf8');
  const migrated = applyMigrations(freshDb());
  const gaps = compareShapes(shapeOf(applySchema(freshDb())), shapeOf(migrated));

  if (argv.includes('--draft')) {
    const { statements, blocked } = draftNextMigration(migrated, schemaText);
    const next = String(listMigrations().length + 1).padStart(4, '0');
    if (!statements.length && !blocked.length && !gaps.length) {
      console.log('-- Rien à écrire : les migrations donnent déjà schema.sql.');
      return 0;
    }
    console.log(`-- migrations/${next}_<nom>.sql — brouillon, à relire avant de l'écrire.\n`);
    for (const sql of statements) console.log(`${sql}\n`);
    for (const b of blocked) console.log(`-- À ÉCRIRE À LA MAIN : ${b.table}.${b.column} — ${b.reason}`);
    if (gaps.length && !statements.length) {
      console.log('-- Aucun ALTER ne couvre ces écarts (contrainte, type, objet en trop) :');
      for (const g of gaps) console.log(`--   ${g}`);
    }
    return 0;
  }

  if (!gaps.length) {
    console.log(`✓ ${listMigrations().length} migration(s) → exactement schema.sql`);
    return 0;
  }
  console.log(`✗ ${gaps.length} écart(s) entre migrations/ et schema.sql :`);
  for (const g of gaps) console.log(`  · ${g}`);
  console.log('\n  Brouillon de la migration qui manque : node tools/d1-migrations.mjs --draft');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
