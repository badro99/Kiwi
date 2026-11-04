import { clean } from './_workspace.js';

// Rowid cursor gives each source a stable, bounded walk, including timestamp ties.
export async function workspacePage(env, name, merchant, before = '') {
  const tables = { print: ['print_jobs', 'id,merchant,bridge_id,kind,status,created_ts,done_ts'],
    errors: ['client_errors', 'id,merchant,message,file,version,count,first_seen_ts,last_seen_ts'],
    integrations: ['operational_commands', 'id,merchant,status,attempt_count,domain,action,updated_ts'] };
  if (!Object.hasOwn(tables, name) || (before && !/^[1-9][0-9]*$/.test(before))) return null;
  const cursor = before ? Number(before) : null;
  if (cursor !== null && !Number.isSafeInteger(cursor)) return null;
  const [table, columns] = tables[name], filters = [], args = [];
  if (merchant) { filters.push('merchant=?'); args.push(merchant); }
  if (cursor !== null) { filters.push('rowid<?'); args.push(cursor); }
  if (name === 'integrations') filters.push("domain!='quarantine' AND status NOT IN ('succeeded','completed','cancelled')");
  const result = await env.DB.prepare(`SELECT rowid AS cursor,${columns} FROM ${table}
    ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''} ORDER BY rowid DESC LIMIT 201`).bind(...args).all();
  const all = result.results || [], rows = all.slice(0, 200);
  if (name === 'errors') for (const row of rows) row.message = clean(String(row.message || '').split('\n')[0], 160)
    .replace(/[^\s@]+@[^\s@]+/g, '•••@•••').replace(/\d{4,}/g, '••••');
  return { source: name, rows, next: all.length > 200 ? String(rows.at(-1).cursor) : null };
}
