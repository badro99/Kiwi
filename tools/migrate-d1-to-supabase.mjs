#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const PAGE_SIZE = 500;
const EXPECTED_CONFIRMATION = 'kiwi-staging';
const execFile = promisify(execFileCallback);

export const TABLES = [
  { name: 'accounts', conflict: 'id' },
  { name: 'operators', conflict: 'id' },
  { name: 'merchant_config', conflict: 'merchant', json: ['features'] },
  { name: 'sales', conflict: 'id', json: ['lines'] },
  { name: 'staff_pins', conflict: 'id' },
  { name: 'pairings', conflict: 'id' },
  { name: 'pair_attempts', conflict: 'ip' },
  { name: 'menus', conflict: 'merchant', json: ['data'] },
  { name: 'orders', conflict: 'id', json: ['lines', 'customer'] },
  { name: 'channel_links', conflict: 'id', json: ['config'] },
  { name: 'catalogs', conflict: 'merchant', json: ['data'] },
  { name: 'store_docs', conflict: 'merchant,feature', json: ['data'] },
  { name: 'clients', conflict: 'merchant,id' },
  { name: 'config_audit', conflict: 'id' },
  { name: 'sale_audit', conflict: 'id', json: ['impact'] },
  /* `detail` se parse comme `impact`, et pour la même raison. Les quatre
     écrivains de cette colonne (functions/api/admin/{account,clients,reset}.js
     et functions/auth/reset.js) y posent tous un `JSON.stringify({…})` : c'est
     un objet, stocké en TEXT faute de mieux côté SQLite.
     Recopié tel quel dans une colonne `jsonb`, il y devient une CHAÎNE JSON —
     valide, ronde, et définitivement muette : `detail->>'field'` rend NULL pour
     toujours. Rien n'est perdu, mais la seule raison de choisir `jsonb` l'est. */
  { name: 'account_audit', conflict: 'id', json: ['detail'] },
  { name: 'reset_tokens', conflict: 'selector' },
  { name: 'table_sessions', conflict: 'id' },
  { name: 'order_desk', conflict: 'merchant' },
];

function required(name, env = process.env) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function parseJsonValue(value, table, column) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`${table}.${column} contains invalid JSON: ${error.message}`);
  }
}

/* Le curseur de pagination voyage AVEC la ligne (`select rowid as _rowid, *`),
   parce que c'est la seule façon de savoir où reprendre sans recompter. Il ne
   doit pas suivre jusqu'à PostgREST, qui refuse net une colonne inconnue —
   400 sur le lot entier, donc sur la table entière. On le retire ici, au seul
   endroit que TOUTE ligne traverse. */
export function normalizeRow(spec, row) {
  const normalized = { ...row };
  delete normalized._rowid;
  for (const column of spec.json || []) {
    if (Object.prototype.hasOwnProperty.call(normalized, column)) {
      normalized[column] = parseJsonValue(normalized[column], spec.name, column);
    }
  }
  return normalized;
}

function migrationConfig(env = process.env) {
  const confirmation = required('MIGRATION_CONFIRM', env);
  if (confirmation !== EXPECTED_CONFIRMATION) {
    throw new Error(`MIGRATION_CONFIRM must equal ${EXPECTED_CONFIRMATION}`);
  }

  const supabaseUrl = required('SUPABASE_URL', env).replace(/\/$/, '');
  const expectedRef = required('SUPABASE_EXPECTED_PROJECT_REF', env);
  const host = new URL(supabaseUrl).hostname;
  if (host !== `${expectedRef}.supabase.co`) {
    throw new Error(`Refusing target ${host}; expected ${expectedRef}.supabase.co`);
  }

  const d1SqlitePath = String(env.D1_SQLITE_PATH || '').trim();
  const source = d1SqlitePath
    ? { d1SqlitePath }
    : {
        cloudflareAccountId: required('CLOUDFLARE_ACCOUNT_ID', env),
        cloudflareDatabaseId: required('CLOUDFLARE_D1_DATABASE_ID', env),
        cloudflareToken: required('CLOUDFLARE_API_TOKEN', env),
      };

  return {
    ...source,
    supabaseUrl,
    supabaseSecret: required('SUPABASE_SECRET_KEY', env),
  };
}

function quoteIdentifier(value) {
  return `\"${String(value).replaceAll('"', '""')}\"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function sqliteQuery(config, sql) {
  const { stdout } = await execFile('sqlite3', ['-json', config.d1SqlitePath, sql], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = stdout.trim();
  return output ? JSON.parse(output) : [];
}

async function d1Query(config, sql, params = []) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}`
    + `/d1/database/${config.cloudflareDatabaseId}/query`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.cloudflareToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const detail = payload.errors?.map((item) => item.message).join('; ') || response.statusText;
    throw new Error(`D1 query failed: ${detail}`);
  }
  return payload.result?.[0]?.results || [];
}

async function d1TableExists(config, table) {
  if (config.d1SqlitePath) {
    const rows = await sqliteQuery(
      config,
      `select name from sqlite_master where type = 'table' and name = ${quoteLiteral(table)}`,
    );
    return rows.length === 1;
  }
  const rows = await d1Query(
    config,
    "select name from sqlite_master where type = 'table' and name = ?",
    [table],
  );
  return rows.length === 1;
}

async function d1Count(config, table) {
  if (config.d1SqlitePath) {
    const rows = await sqliteQuery(config, `select count(*) as count from ${quoteIdentifier(table)}`);
    return Number(rows[0]?.count || 0);
  }
  const rows = await d1Query(config, `select count(*) as count from \"${table}\"`);
  return Number(rows[0]?.count || 0);
}

/* Pagination par CURSEUR, pas par `offset`.
 *
 * `limit/offset` suppose que la fenêtre ne bouge pas entre deux pages. Sur un
 * export figé c'est vrai ; sur la base de PRODUCTION — le chemin par l'API
 * Cloudflare, celui qui reste possible — c'est faux. Une seule ligne effacée
 * pendant l'import décale tout ce qui suit d'un cran : la page suivante saute
 * une ligne, personne ne la lit, et rien ne le signale puisque la ligne sautée
 * n'a jamais existé pour le compteur.
 *
 * `where rowid > ?` ne décale pas. Le curseur désigne une ligne, pas un rang :
 * insérer ou supprimer ailleurs ne déplace pas ce qui reste à lire. */
async function d1Page(config, table, afterRowid) {
  if (config.d1SqlitePath) {
    return sqliteQuery(
      config,
      `select rowid as _rowid, * from ${quoteIdentifier(table)}`
      + ` where rowid > ${Number(afterRowid)} order by rowid limit ${PAGE_SIZE}`,
    );
  }
  return d1Query(
    config,
    `select rowid as _rowid, * from \"${table}\" where rowid > ? order by rowid limit ?`,
    [afterRowid, PAGE_SIZE],
  );
}

function supabaseHeaders(config, extra = {}) {
  return {
    apikey: config.supabaseSecret,
    Authorization: `Bearer ${config.supabaseSecret}`,
    ...extra,
  };
}

async function supabaseUpsert(config, spec, rows) {
  if (!rows.length) return;
  const endpoint = `${config.supabaseUrl}/rest/v1/${spec.name}`
    + `?on_conflict=${encodeURIComponent(spec.conflict)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(config, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(rows.map((row) => normalizeRow(spec, row))),
  });
  if (!response.ok) {
    throw new Error(`Supabase upsert ${spec.name} failed (${response.status}): ${await response.text()}`);
  }
}

async function supabaseCount(config, table) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?select=*`, {
    method: 'HEAD',
    headers: supabaseHeaders(config, {
      Prefer: 'count=exact',
      Range: '0-0',
    }),
  });
  if (!response.ok) throw new Error(`Supabase count ${table} failed (${response.status})`);
  const range = response.headers.get('content-range') || '';
  const count = Number(range.split('/')[1]);
  if (!Number.isFinite(count)) throw new Error(`Supabase count ${table} returned ${range || 'no range'}`);
  return count;
}

async function recordImportRun(config, values) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/import_runs`, {
    method: 'POST',
    headers: supabaseHeaders(config, {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Could not record import run: ${await response.text()}`);
  return (await response.json())[0];
}

async function patchImportRun(config, id, values) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/import_runs?id=eq.${id}`, {
    method: 'PATCH',
    headers: supabaseHeaders(config, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Could not update import run ${id}: ${await response.text()}`);
}

async function finalizeSequences(config) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/finalize_d1_import`, {
    method: 'POST',
    headers: supabaseHeaders(config, { 'Content-Type': 'application/json' }),
    body: '{}',
  });
  if (!response.ok) throw new Error(`Could not finalize identity sequences: ${await response.text()}`);
}

export async function main(env = process.env) {
  const config = migrationConfig(env);
  const run = await recordImportRun(config, {
    source: config.d1SqlitePath ? 'cloudflare-d1-snapshot' : 'cloudflare-d1',
    source_snapshot: new Date().toISOString(),
    status: 'running',
  });
  const counts = {};

  try {
    for (const spec of TABLES) {
      if (!(await d1TableExists(config, spec.name))) {
        counts[spec.name] = { source: 0, target: 0, skipped: true };
        continue;
      }

      const sourceCount = await d1Count(config, spec.name);
      let cursor = 0;
      let moved = 0;
      for (;;) {
        const page = await d1Page(config, spec.name, cursor);
        if (!page.length) break;
        /* Un curseur illisible ne doit PAS se contenter d'arrêter la boucle.
           Sans ce garde, `rowid > null` ne rend jamais rien : la page suivante
           revient vide, la boucle sort, et l'import se déclare réussi avec une
           seule page importée sur cinquante. Le contrôle de comptage ne le
           rattrape pas — il compare au nombre de lignes LUES, qui a diminué en
           même temps. Une panne qui fait baisser la mesure et la référence
           ensemble est invisible : il faut la nommer là où elle naît. */
        const last = Number(page[page.length - 1]._rowid);
        if (!Number.isFinite(last)) {
          throw new Error(`${spec.name}: page sans curseur rowid exploitable — pagination interrompue`);
        }
        cursor = last;
        await supabaseUpsert(config, spec, page);
        moved += page.length;
      }

      /* Un export figé ne rétrécit pas. Lire moins de lignes que le comptage
         d'ouverture n'y a donc qu'une explication : on s'est arrêté trop tôt.
         Sur la base vivante, en revanche, une suppression pendant l'import rend
         l'écart légitime — d'où les deux traitements. */
      if (moved < sourceCount) {
        const short = `${spec.name}: ${sourceCount} lignes annoncées, ${moved} lues`;
        if (config.d1SqlitePath) throw new Error(`${short} — l'export est figé, la pagination a décroché`);
        console.warn(`⚠ ${short} (base vivante : suppression pendant l'import ?)`);
      }

      /* Le contrôle porte sur ce qu'on a VRAIMENT lu (`moved`), pas sur le
         comptage d'ouverture : entre les deux, la production a pu encaisser.
         Et il est asymétrique, parce que les deux écarts ne disent pas la même
         chose. Manquer des lignes est une perte — on s'arrête. En avoir plus
         est attendu : la recette du cloisonnement (porte 5) crée ses propres
         commerçants d'essai dans le même schéma, et un import antérieur a pu
         laisser des lignes que ce D1-ci ne contient plus. L'égalité stricte
         faisait échouer un import correct sur la présence de ses propres
         témoins de test. */
      const targetCount = await supabaseCount(config, spec.name);
      counts[spec.name] = { source: sourceCount, moved, target: targetCount };
      if (targetCount < moved) {
        throw new Error(
          `${spec.name}: ${moved} lignes lues depuis D1, ${targetCount} en base Supabase — des lignes manquent`,
        );
      }
      const extra = targetCount - moved;
      console.log(`${spec.name}: ${moved} rows verified`
        + (extra ? ` (+${extra} déjà en staging, hors de cet import)` : ''));
    }

    await finalizeSequences(config);
    await patchImportRun(config, run.id, {
      status: 'complete',
      row_counts: counts,
      completed_at: new Date().toISOString(),
    });
    console.log('Staging import complete. Production D1 was read only and remains authoritative.');
  } catch (error) {
    await patchImportRun(config, run.id, {
      status: 'failed',
      row_counts: counts,
      completed_at: new Date().toISOString(),
      error: String(error.message || error).slice(0, 2000),
    }).catch(() => {});
    throw error;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
