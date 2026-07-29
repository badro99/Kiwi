#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const PAGE_SIZE = 500;
const EXPECTED_CONFIRMATION = 'kiwi-staging';

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

export function normalizeRow(spec, row) {
  const normalized = { ...row };
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

  return {
    cloudflareAccountId: required('CLOUDFLARE_ACCOUNT_ID', env),
    cloudflareDatabaseId: required('CLOUDFLARE_D1_DATABASE_ID', env),
    cloudflareToken: required('CLOUDFLARE_API_TOKEN', env),
    supabaseUrl,
    supabaseSecret: required('SUPABASE_SECRET_KEY', env),
  };
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
  const rows = await d1Query(
    config,
    "select name from sqlite_master where type = 'table' and name = ?",
    [table],
  );
  return rows.length === 1;
}

async function d1Count(config, table) {
  const rows = await d1Query(config, `select count(*) as count from \"${table}\"`);
  return Number(rows[0]?.count || 0);
}

async function d1Page(config, table, offset) {
  return d1Query(
    config,
    `select * from \"${table}\" order by rowid limit ? offset ?`,
    [PAGE_SIZE, offset],
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
    source: 'cloudflare-d1',
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
      for (let offset = 0; offset < sourceCount; offset += PAGE_SIZE) {
        await supabaseUpsert(config, spec, await d1Page(config, spec.name, offset));
      }
      const targetCount = await supabaseCount(config, spec.name);
      counts[spec.name] = { source: sourceCount, target: targetCount };
      if (targetCount !== sourceCount) {
        throw new Error(`${spec.name} count mismatch: D1=${sourceCount}, Supabase=${targetCount}`);
      }
      console.log(`${spec.name}: ${sourceCount} rows verified`);
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
