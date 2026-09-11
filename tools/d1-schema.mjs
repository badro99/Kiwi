#!/usr/bin/env node
/* tools/d1-schema.mjs — dire ce qui manque à la base DÉPLOYÉE, et le poser.
 *
 * ── Pourquoi cet outil existe ──────────────────────────────────────────────
 * `schema.sql` décrit la base d'un déploiement NEUF. Une base déjà en service,
 * elle, ne reçoit jamais un `CREATE TABLE IF NOT EXISTS` : par définition il ne
 * touche pas une table qui existe. Les colonnes ajoutées après coup vivaient
 * donc en commentaire, en bas de fichier, sous la forme d'ALTER que quelqu'un
 * devait remarquer puis passer à la main.
 *
 * Ce mécanisme a échoué trois fois, et jamais bruyamment :
 *   · 2026-07-28 — `merchant_config.status` manquait : /api/config a rendu
 *     `{features:{}, pins:[]}` à TOUS les commerçants pendant 45 minutes.
 *   · 2026-08-08 — la même colonne manquait toujours : /api/employee répondait
 *     « Email ou code personnel incorrect. » à chaque employé, avec le bon code.
 *   · en continu — `orders.client_ref` porte l'unique garde-fou contre le
 *     doublon de commande. Absente, le code retombe en silence sur un INSERT
 *     sans idempotence : l'application a l'air parfaitement saine et n'a plus
 *     AUCUNE protection contre le double envoi.
 *
 * Le point commun n'est pas la colonne, c'est le silence. Chaque lecture qui
 * nomme une colonne absente échoue à l'intérieur d'un `catch` qui la traduit en
 * réponse vide ou en refus. Un outil qui RÉPOND À LA QUESTION — « qu'est-ce qui
 * manque, là, maintenant ? » — vaut mieux qu'une liste d'ALTER à ne pas oublier.
 *
 * ── Pourquoi il DÉDUIT au lieu de lire une liste ───────────────────────────
 * Une liste de migrations écrite à la main dérive de `schema.sql` dès qu'on
 * ajoute une colonne en oubliant la ligne correspondante — c'est-à-dire le
 * problème d'origine, déplacé d'un fichier. On lit donc `schema.sql` lui-même :
 * il redevient la seule source de vérité, et l'oubli devient impossible par
 * construction. `tools/d1-schema-test.mjs` verrouille cette propriété.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *   node tools/d1-schema.mjs                      # état de la base distante
 *   node tools/d1-schema.mjs --apply --yes        # poser ce qui manque
 *   node tools/d1-schema.mjs --sqlite ./local.db  # sur un fichier local
 *
 * Distant = les trois variables déjà utilisées par migrate-d1-to-supabase.mjs :
 *   CLOUDFLARE_ACCOUNT_ID · CLOUDFLARE_D1_DATABASE_ID · CLOUDFLARE_API_TOKEN
 *
 * Sortie : 0 si la base est à jour, 1 s'il manque quelque chose. Utilisable
 * tel quel dans un contrôle de déploiement.
 */

import { readFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const execFile = promisify(execFileCallback);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '..', 'schema.sql');

/* ═══════════════════ 1. LIRE schema.sql ═══════════════════════════════════ */

/* Les commentaires partent AVANT toute autre analyse, ligne par ligne.
 *
 * Le piège : ce fichier est commenté en français, donc plein d'apostrophes
 * (« l'index », « d'une base »). Une apostrophe est aussi le délimiteur de
 * chaîne SQL. On ne coupe donc au `--` que si le nombre d'apostrophes qui le
 * PRÉCÈDENT sur la ligne est pair — hors chaîne. Les apostrophes du commentaire
 * lui-même viennent après la coupe et ne comptent jamais. */
export function stripComments(sql) {
  return sql.split('\n').map((line) => {
    let quotes = 0;
    for (let i = 0; i < line.length - 1; i++) {
      if (line[i] === "'") { quotes++; continue; }
      if (line[i] === '-' && line[i + 1] === '-' && quotes % 2 === 0) return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

/* Découpe une liste SQL sur les virgules de PREMIER niveau. `NUMERIC(10, 2)`
 * ou un `WHERE a IN (1, 2)` ne doivent pas être coupés en deux. */
function splitTopLevel(body) {
  const out = [];
  let depth = 0, quoted = false, current = '';
  for (const ch of body) {
    if (ch === "'") quoted = !quoted;
    if (!quoted) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
    }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/* Une entrée du corps d'un CREATE TABLE qui n'est PAS une colonne : la
 * contrainte de table (`PRIMARY KEY (merchant, feature)` dans store_docs et
 * clients). La confondre avec une colonne ferait proposer un
 * `ALTER TABLE … ADD COLUMN PRIMARY …`, qui ne veut rien dire. */
const TABLE_CONSTRAINT = /^(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|CONSTRAINT)\b/i;

export function parseSchema(sqlText) {
  const sql = stripComments(sqlText);
  const tables = new Map();
  const indexes = new Map();

  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g;
  for (const m of sql.matchAll(tableRe)) {
    const name = m[1];
    const columns = [];
    for (const entry of splitTopLevel(m[2])) {
      if (TABLE_CONSTRAINT.test(entry)) continue;
      const parts = entry.split(/\s+/);
      const column = parts[0].replace(/["`\[\]]/g, '');
      if (!column) continue;
      columns.push({ name: column, definition: entry.replace(/\s+/g, ' ').trim() });
    }
    tables.set(name, { name, columns, sql: m[0].trim() });
  }

  const indexRe = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w]*)\s+ON\s+([A-Za-z_][\w]*)([\s\S]*?);/g;
  for (const m of sql.matchAll(indexRe)) {
    indexes.set(m[2], {
      name: m[2], table: m[3], unique: !!m[1],
      sql: m[0].trim().replace(/\s+/g, ' '),
    });
  }

  return { tables, indexes };
}

/* ═══════════════════ 2. LIRE LA BASE VIVANTE ══════════════════════════════ */

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} manque.\n\n`
      + `Base distante : exporte les trois variables (les mêmes que\n`
      + `tools/migrate-d1-to-supabase.mjs) —\n`
      + `  CLOUDFLARE_ACCOUNT_ID · CLOUDFLARE_D1_DATABASE_ID · CLOUDFLARE_API_TOKEN\n\n`
      + `Le jeton se crée sur dash.cloudflare.com › My Profile › API Tokens,\n`
      + `avec la permission « D1: Edit » sur ce compte.\n\n`
      + `Base locale : node tools/d1-schema.mjs --sqlite <fichier.db>`,
    );
  }
  return value;
}

function remoteTarget() {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID');
  const databaseId = required('CLOUDFLARE_D1_DATABASE_ID');
  const token = required('CLOUDFLARE_API_TOKEN');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}`
    + `/d1/database/${databaseId}/query`;
  return {
    label: `D1 ${databaseId}`,
    async query(sql, params = []) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        const detail = (payload.errors || []).map((e) => e.message).join('; ') || response.statusText;
        throw new Error(`D1: ${detail}`);
      }
      return payload.result?.[0]?.results || [];
    },
  };
}

function sqliteTarget(path) {
  return {
    label: `sqlite ${path}`,
    async query(sql, params = []) {
      /* Le CLI sqlite3 ne prend pas de paramètres liés. Les seuls appels
       * paramétrés ici passent un nom de table issu de schema.sql — jamais une
       * entrée extérieure — et on le cite malgré tout. */
      let text = sql;
      for (const param of params) text = text.replace('?', `'${String(param).replaceAll("'", "''")}'`);
      const { stdout } = await execFile('sqlite3', ['-json', path, text], { maxBuffer: 64 * 1024 * 1024 });
      return stdout.trim() ? JSON.parse(stdout) : [];
    },
  };
}

async function readLive(target, expected) {
  const tableRows = await target.query("SELECT name FROM sqlite_master WHERE type = 'table'");
  const indexRows = await target.query("SELECT name FROM sqlite_master WHERE type = 'index'");
  const tables = new Map();
  for (const row of tableRows) {
    const name = row.name;
    if (!expected.tables.has(name)) continue;      // tables hors schema.sql : pas notre affaire
    const cols = await target.query('SELECT name FROM pragma_table_info(?)', [name]);
    tables.set(name, new Set(cols.map((c) => c.name)));
  }
  return { tables, indexes: new Set(indexRows.map((r) => r.name)) };
}

/* ═══════════════════ 3. COMPARER ══════════════════════════════════════════ */

/* Une colonne se pose par ALTER TABLE … ADD COLUMN, qui accepte moins de choses
 * qu'un CREATE TABLE. SQLite refuse notamment PRIMARY KEY et UNIQUE, et refuse
 * NOT NULL sans DEFAULT (il faudrait bien remplir les lignes existantes). On
 * nettoie ce qu'on peut, et on REFUSE de fabriquer un ordre qu'on sait faux :
 * mieux vaut le dire que faire échouer la migration au milieu. */
export function addColumnStatement(table, column) {
  const definition = column.definition
    .replace(/\bPRIMARY\s+KEY\b/i, '')
    .replace(/\bUNIQUE\b/i, '')
    .replace(/\bAUTOINCREMENT\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const notNull = /\bNOT\s+NULL\b/i.test(definition);
  const hasDefault = /\bDEFAULT\b/i.test(definition);
  if (notNull && !hasDefault) {
    return { sql: null, reason: 'NOT NULL sans DEFAULT — à poser à la main, avec une valeur de remplissage' };
  }
  return { sql: `ALTER TABLE ${table} ADD COLUMN ${definition};`, reason: null };
}

export function diff(expected, live) {
  const missingTables = [];
  const missingColumns = [];
  const missingIndexes = [];
  const blocked = [];

  for (const [name, table] of expected.tables) {
    if (!live.tables.has(name)) { missingTables.push(table); continue; }
    const present = live.tables.get(name);
    for (const column of table.columns) {
      if (present.has(column.name)) continue;
      const statement = addColumnStatement(name, column);
      if (statement.sql) missingColumns.push({ table: name, column: column.name, sql: statement.sql });
      else blocked.push({ table: name, column: column.name, reason: statement.reason });
    }
  }
  for (const [name, index] of expected.indexes) {
    if (!live.indexes.has(name)) missingIndexes.push(index);
  }
  return { missingTables, missingColumns, missingIndexes, blocked };
}

/* ═══════════════════ 4. RAPPORTER ET POSER ════════════════════════════════ */

const BOLD = '[1m', DIM = '[2m', RED = '[31m';
const GREEN = '[32m', YELLOW = '[33m', OFF = '[0m';

/* Les colonnes dont l'absence ne se voit PAS — le code retombe en silence sur
 * un chemin dégradé et l'application a l'air saine. Ce sont exactement celles
 * qui ont déjà coûté une panne, donc elles se signalent plus fort que les
 * autres. La liste est courte et explicite : une colonne banale n'a pas besoin
 * d'un avertissement, et tout signaler reviendrait à ne rien signaler. */
const SILENT_FAILURES = {
  'orders.client_ref': 'AUCUNE protection contre le doublon de commande — le double-tap crée deux tickets',
  'orders.session_id': "l'app employé n'affiche aucune commande, et les additions se mélangent entre services",
  'orders.paid_ts': 'une commande réglée peut revenir dans une addition suivante',
  'merchant_config.status': '/api/config se vide · connexion employé refusée avec le bon code',
  'sales.lines': 'les ventes se stockent sans leur panier — marges et stock aveugles',
};

function report(result, target) {
  const { missingTables, missingColumns, missingIndexes, blocked } = result;
  const total = missingTables.length + missingColumns.length + missingIndexes.length;

  console.log(`\n${BOLD}Schéma · ${target.label}${OFF}\n`);

  if (!total && !blocked.length) {
    console.log(`${GREEN}✓ La base déployée a tout ce que schema.sql déclare.${OFF}\n`);
    return 0;
  }

  if (missingTables.length) {
    console.log(`${BOLD}Tables absentes (${missingTables.length})${OFF}`);
    for (const t of missingTables) console.log(`  ${RED}✗${OFF} ${t.name}`);
    console.log('');
  }
  if (missingColumns.length) {
    console.log(`${BOLD}Colonnes absentes (${missingColumns.length})${OFF}`);
    for (const c of missingColumns) {
      const key = `${c.table}.${c.column}`;
      const danger = SILENT_FAILURES[key];
      console.log(`  ${RED}✗${OFF} ${key}`);
      if (danger) console.log(`      ${YELLOW}⚠ ${danger}${OFF}`);
    }
    console.log('');
  }
  if (missingIndexes.length) {
    console.log(`${BOLD}Index absents (${missingIndexes.length})${OFF}`);
    for (const i of missingIndexes) {
      console.log(`  ${RED}✗${OFF} ${i.name} ${DIM}sur ${i.table}${OFF}`);
      if (i.name === 'orders_client_ref') {
        console.log(`      ${YELLOW}⚠ sans lui, deux envois simultanés créent deux commandes${OFF}`);
      }
      if (i.name === 'table_sessions_live') {
        console.log(`      ${YELLOW}⚠ sans lui, deux serveurs ouvrent deux sessions sur la même table${OFF}`);
      }
    }
    console.log('');
  }
  if (blocked.length) {
    console.log(`${BOLD}À poser à la main (${blocked.length})${OFF}`);
    for (const b of blocked) console.log(`  ${YELLOW}!${OFF} ${b.table}.${b.column} — ${b.reason}`);
    console.log('');
  }

  console.log(`${DIM}Pour poser ce qui manque :  node tools/d1-schema.mjs --apply --yes${OFF}\n`);
  return 1;
}

function plan(result) {
  return [
    ...result.missingTables.map((t) => t.sql),
    ...result.missingColumns.map((c) => c.sql),
    ...result.missingIndexes.map((i) => i.sql),
  ];
}

async function apply(target, result) {
  const statements = plan(result);
  if (!statements.length) { console.log(`${GREEN}Rien à poser.${OFF}\n`); return 0; }

  /* Le journal est un AUDIT, jamais la décision : ce qui fait foi est la base
   * elle-même (la colonne existe, ou non). Une table de suivi perdue ou
   * incohérente ne doit pas pouvoir bloquer une réparation. */
  await target.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY, statement TEXT NOT NULL, applied_ts INTEGER NOT NULL)`,
  );

  let done = 0;
  for (const sql of statements) {
    process.stdout.write(`  ${sql.slice(0, 96)}${sql.length > 96 ? '…' : ''}  `);
    try {
      await target.query(sql);
      await target.query(
        'INSERT OR REPLACE INTO schema_migrations (id, statement, applied_ts) VALUES (?, ?, ?)',
        [sql.slice(0, 200), sql, Date.now()],
      );
      console.log(`${GREEN}ok${OFF}`);
      done++;
    } catch (error) {
      /* « duplicate column name » veut dire que quelqu'un l'a posée à la main
       * entre la lecture et maintenant : c'est le résultat voulu, pas un échec. */
      if (/duplicate column|already exists/i.test(String(error.message))) {
        console.log(`${DIM}déjà là${OFF}`);
        done++;
        continue;
      }
      console.log(`${RED}échec${OFF}\n    ${error.message}`);
      console.log(`\n${RED}Arrêt.${OFF} ${done}/${statements.length} posés. `
        + `Les ordres déjà passés sont additifs et sans effet de bord.\n`);
      return 1;
    }
  }
  console.log(`\n${GREEN}✓ ${done} ordre(s) posé(s).${OFF} Relance sans --apply pour vérifier.\n`);
  return 0;
}

/* ═══════════════════ 5. ENTRÉE ════════════════════════════════════════════ */

async function main(argv) {
  const args = new Set(argv);
  const sqliteIndex = argv.indexOf('--sqlite');
  const target = sqliteIndex >= 0 ? sqliteTarget(argv[sqliteIndex + 1]) : remoteTarget();

  const expected = parseSchema(await readFile(SCHEMA_PATH, 'utf8'));
  const live = await readLive(target, expected);
  const result = diff(expected, live);

  if (!args.has('--apply')) return report(result, target);

  const statements = plan(result);
  console.log(`\n${BOLD}Plan · ${target.label}${OFF}\n`);
  if (!statements.length) { console.log(`${GREEN}✓ Rien à poser.${OFF}\n`); return 0; }
  for (const sql of statements) console.log(`  ${sql}`);
  if (result.blocked.length) {
    console.log(`\n${YELLOW}Non couvert par ce plan :${OFF}`);
    for (const b of result.blocked) console.log(`  ${b.table}.${b.column} — ${b.reason}`);
  }
  if (!args.has('--yes')) {
    console.log(`\n${DIM}Ajoute --yes pour exécuter. Tous ces ordres sont additifs :`
      + ` aucun ne réécrit ni n'efface de données.${OFF}\n`);
    return 1;
  }
  console.log('');
  return apply(target, result);
}

/* `process.argv[1]` est absent quand ce module est importé par `node -e`, par un
 * test, ou par un chargeur. Sans cette garde, la simple IMPORTATION du fichier
 * plantait avant d'exécuter quoi que ce soit. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((error) => { console.error(`\n${RED}${error.message}${OFF}\n`); process.exitCode = 2; });
}
