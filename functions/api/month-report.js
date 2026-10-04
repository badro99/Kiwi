// Read-only, owner-authorized source reader for the monthly accountant dossier.
// No DDL, repairs, settlements, closure writes, rounded daily-total aggregation,
// external uploads or public financial data. Pagination has no total-row cap.
import { entitledMerchant, activeAccountSession, isOperator, json } from '../auth/_lib.js';
import { merchantZone, merchantCutoff, businessBoundary, businessDate } from './_business-day.js';

export const SOURCES = Object.freeze({
  sales: { table: 'sales', time: 'ts', columns: 'id merchant amount amount_cents gross_amount_cents discount_amount_cents discount_reason method payment_parts label ref ts channel session_id split_flow_id lines void_ts void_reason void_note void_actor_id' },
  audits: { table: 'sale_audit', time: 'ts', columns: 'id merchant sale_id action reason note actor actor_id amount amount_cents method ref sale_ts impact ts' },
  invoices: { table: 'sale_invoices', time: 'created_ts', history: true, allTime: true, columns: 'merchant seq number sale_id customer snapshot created_ts' },
  receiptValues: { table: 'sale_receipts', time: 'created_ts', history: true, allTime: true, columns: 'merchant sale_id gross_ticket_cents consigned_cents created_ts' },
  cash: { table: 'cash_session_events', time: 'occurred_ts', history: true, columns: 'id merchant session_id terminal_id event_type expected_cents counted_cents gap_cents movement_kind movement_amount_cents movement_reason actor_id counterparty_actor_id opened_ts occurred_ts' },
  movements: { table: 'inventory_movements', time: 'occurred_ts', history: true, columns: 'id merchant item_id variant_id location_id qty_milli reason unit_cost_cents unit_cost_rate currency ref_type ref_id note actor occurred_ts srv_ts reversal_of meta created_ts' },
  counts: { table: 'inventory_counts', time: 'submitted_at', history: true, columns: 'id merchant engine status store_id store_name employee_id employee_name submitted_at reviewed_at reviewer_id review_decision review_note applied_at total_lines total_counted total_system total_diff total_variance_cost_mad abs_variance_cost_mad lines_json meta_json created_ts updated_ts' },
  purchaseOrders: { table: 'purchase_orders', time: 'created_ts', history: true, columns: 'id merchant seq number supplier status currency expected_date total_cents invoiced_cents created_ts updated_ts' },
  purchaseLines: { table: 'purchase_order_lines', time: 'created_ts', history: true, columns: 'id merchant number line_no sku label item_id variant_id location_id unit qty unit_cents received_qty returned_qty created_ts' },
  creditEvents: { table: 'store_credit_events', time: 'ts', columns: 'id merchant credit_id action amount_cents balance_after_cents ref_id actor detail ts' },
  balanceReceipts: { table: 'retail_balance_receipts', time: 'created_ts', columns: 'merchant balance_id sale_id amount_cents method status created_ts' },
});
export const DOCUMENTS = ['business', 'receipt', 'costs', 'recipes', 'expenses', 'procurement', 'suppliers', 'dayreports', 'monthreport', 'reservations', 'payroll'];
export function clockLabels(values, zone, cutoff) {
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }), result = {};
  for (const ts of new Set(values)) { if (ts == null || !Number.isFinite(ts)) continue; const p = Object.fromEntries(clock.formatToParts(ts).map(p => [p.type,p.value])); result[ts] = { civil: `${p.year}-${p.month}-${p.day}`, local: `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`, day: businessDate(ts, cutoff, zone) }; }
  return result;
}
export function documentTimes(value) {
  const fields = new Set(['ts','issuedTs','createdTs','createdAt','issuedAt','receivedAt','returnedAt','occurredAt','submitted_at','openedAt','closedAt','at']);
  const values = [];
  function visit(v) { if (!v || typeof v !== 'object') return; for (const [k,x] of Object.entries(v)) { if (fields.has(k) && typeof x === 'number' && Number.isFinite(x) && Number.isFinite(new Date(x).getTime())) values.push(x); else if (x && typeof x === 'object') visit(x); } }
  visit(value); return values;
}
export function nextMonth(month) { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; }
const integer = v => /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
export async function manifest(env, merchant, from, to, asOf) {
  const sources = {};
  for (const [key, spec] of Object.entries(SOURCES)) {
    const cols = (await env.DB.prepare(`PRAGMA table_info(${spec.table})`).all()).results || [];
    if (!cols.length) { sources[key] = { status: 'not-recorded', count: null }; continue; }
    const names = new Set(cols.map(c => c.name));
    if (!names.has('merchant') || !names.has(spec.time)) throw new Error('source-schema-unavailable');
    const selected = spec.columns.split(' ').filter(c => names.has(c));
    const where = `merchant = ? AND (${spec.time} < ? OR ${spec.time} IS NULL)` + (spec.history ? '' : ` AND (${spec.time} >= ? OR ${spec.time} IS NULL)`);
    const values = spec.history ? [merchant, (spec.allTime ? asOf + 1 : Math.min(to, asOf + 1))] : [merchant, (spec.allTime ? asOf + 1 : Math.min(to, asOf + 1)), from];
    // Detect concurrent changes at the end instead of claiming a frozen SQL
    // snapshot across paginated requests. rowid fences exclude later inserts.
    const sums = ['amount_cents', 'amount', 'void_ts', 'updated_ts', 'qty_milli', 'total_cents', 'counted_cents', 'expected_cents', 'gap_cents'].filter(c => names.has(c));
    const stat = await env.DB.prepare(`SELECT COUNT(*) AS count, COALESCE(MAX(rowid),0) AS maxRowid, COALESCE(SUM(rowid),0) AS rowSum, MAX(${spec.time}) AS lastTs${sums.map(c => `, TOTAL(${c}) AS ${c}`).join('')} FROM ${spec.table} WHERE ${where}`).bind(...values).first();
    sources[key] = { status: 'available', ...stat, columns: selected, missingColumns: spec.columns.split(' ').filter(c => !names.has(c)) };
  }
  return sources;
}
export async function onRequestGet({ request, env }) {
  if (!env?.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url), merchant = String(url.searchParams.get('merchant') || '');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(merchant)) return json({ error: 'invalid-merchant' }, 400);
  if (!(await activeAccountSession(request, env)) && !(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (await entitledMerchant(request, env, merchant) !== merchant) return json({ error: 'forbidden' }, 403);
  let month = url.searchParams.get('month') || '';
  if (month !== 'auto' && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'invalid-month' }, 400);
  try {
    const zone = await merchantZone(env, merchant), cutoff = await merchantCutoff(env, merchant);
    const asOf = url.searchParams.has('asOf') ? integer(url.searchParams.get('asOf')) : Date.now();
    if (asOf == null || asOf > Date.now() + 5000 || asOf < 0) return json({ error: 'invalid-snapshot' }, 400);
    const businessToday = businessDate(asOf, cutoff, zone), [cy, cm] = businessToday.slice(0,7).split('-').map(Number), lastCompletedMonth = cm === 1 ? `${cy-1}-12` : `${cy}-${String(cm-1).padStart(2,'0')}`;
    if (url.searchParams.get('clock') === '1') return json({ merchant, zone, cutoff, businessToday, lastCompletedMonth });
    if (month === 'auto') month = lastCompletedMonth;
    if (month > businessDate(asOf, cutoff, zone).slice(0, 7)) return json({ error: 'future-month' }, 400);
    const from = businessBoundary(month + '-01', cutoff, zone), to = businessBoundary(nextMonth(month) + '-01', cutoff, zone);
    const source = url.searchParams.get('source');
    if (source) {
      const spec = SOURCES[source], cursor = integer(url.searchParams.get('cursor') || '0'), fence = integer(url.searchParams.get('fence'));
      if (!spec || cursor == null || fence == null) return json({ error: 'invalid-page' }, 400);
      const cols = (await env.DB.prepare(`PRAGMA table_info(${spec.table})`).all()).results || [];
      if (!cols.length) return json({ error: 'source-not-recorded' }, 409);
      const names = new Set(cols.map(c => c.name));
      const selected = spec.columns.split(' ').filter(c => names.has(c));
      const where = `merchant = ? AND (${spec.time} < ? OR ${spec.time} IS NULL)` + (spec.history ? '' : ` AND (${spec.time} >= ? OR ${spec.time} IS NULL)`);
      const args = spec.history ? [merchant, (spec.allTime ? asOf + 1 : Math.min(to, asOf + 1))] : [merchant, (spec.allTime ? asOf + 1 : Math.min(to, asOf + 1)), from];
      const result = await env.DB.prepare(`SELECT rowid AS _rowid, ${selected.join(',')} FROM ${spec.table} WHERE ${where} AND rowid > ? AND rowid <= ? ORDER BY rowid LIMIT 501`).bind(...args, cursor, fence).all();
      const rows = result.results || [], more = rows.length > 500;
      if (more) rows.pop();
      return json({ merchant, source, asOf, rows, clocks: clockLabels(rows.flatMap(r => { let snapshot = {}; try { snapshot = typeof r.snapshot === 'string' ? JSON.parse(r.snapshot) : r.snapshot || {}; } catch (_) {} return Object.keys(r).filter(k => k === spec.time || /(_ts|_at)$/.test(k)).map(k => r[k]).filter(v => typeof v === 'number').concat(documentTimes(snapshot)); }), zone, cutoff), next: more ? rows.at(-1)._rowid : null });
    }
    const sources = await manifest(env, merchant, from, to, asOf);
    const docs = {}, docRevisions = {};
    for (const feature of DOCUMENTS) {
      const row = await env.DB.prepare('SELECT data, rev, updated_ts FROM store_docs WHERE merchant = ? AND feature = ?').bind(merchant, feature).first();
      if (!row) { docs[feature] = null; docRevisions[feature] = null; continue; }
      try { docs[feature] = JSON.parse(row.data); } catch (_) { return json({ error: 'invalid-source-document', feature }, 409); }
      docRevisions[feature] = { rev: row.rev, updatedAt: row.updated_ts };
    }
    const info = await env.DB.prepare('SELECT name, type FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    return json({ merchant, month, from, to, asOf, zone, cutoff, businessToday, clock: clockLabels([from,to,asOf,...documentTimes(docs)],zone,cutoff), sources, docs, docRevisions, establishment: info || {} });
  } catch (_) { return json({ error: 'monthly-source-unavailable' }, 503); }
}
