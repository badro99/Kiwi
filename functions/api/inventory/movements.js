// /api/inventory/movements — registre de stock append-only, par établissement.
//
// GET  ?merchant=slug&since=<cursor>  → mouvements incrémentaux
// GET  ?merchant=slug&summary=1       → solde courant par article/lieu
// POST { merchant, movements:[...] }  → écriture idempotente, jamais d'UPDATE

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';

const PAGE = 500;
const REASONS = new Set([
  'opening', 'receipt', 'supplier-return', 'sale', 'sale-reversal',
  'production-input', 'production-output', 'transfer-out', 'transfer-in',
  'loss', 'expiry', 'gift', 'staff-meal', 'count', 'return', 'manual',
]);

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : null;

async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, item_id TEXT NOT NULL,
      variant_id TEXT NOT NULL DEFAULT '', location_id TEXT NOT NULL DEFAULT 'principal',
      qty_milli INTEGER NOT NULL, reason TEXT NOT NULL, unit_cost_cents INTEGER,
      currency TEXT NOT NULL DEFAULT 'MAD', ref_type TEXT NOT NULL DEFAULT '',
      ref_id TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '',
      occurred_ts INTEGER NOT NULL, srv_ts INTEGER NOT NULL, reversal_of TEXT NOT NULL DEFAULT '',
      meta TEXT, created_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS inventory_sync_sequences (merchant TEXT PRIMARY KEY, last_ts INTEGER NOT NULL)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant_cursor ON inventory_movements (merchant, srv_ts)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant_item ON inventory_movements (merchant, item_id, occurred_ts)'
  ).run();
}

async function nextCursor(env, merchant) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO inventory_sync_sequences (merchant, last_ts) VALUES (?, 0)'
  ).bind(merchant).run();
  const row = await env.DB.prepare(
    `UPDATE inventory_sync_sequences
        SET last_ts = CASE WHEN last_ts >= ? THEN last_ts + 1 ELSE ? END
      WHERE merchant = ? RETURNING last_ts AS value`
  ).bind(now, now, merchant).first();
  return Number(row && row.value) || now;
}

function sanitize(raw, now) {
  const id = str(raw && raw.id, 80);
  const itemId = str(raw && (raw.itemId ?? raw.item_id), 80);
  const reason = str(raw && raw.reason, 32).toLowerCase();
  const qty = finite(raw && (raw.qty ?? raw.quantity));
  const qtyMilli = raw && raw.qtyMilli != null
    ? Math.round(Number(raw.qtyMilli))
    : Math.round((qty == null ? 0 : qty) * 1000);
  const cost = finite(raw && (raw.unitCost ?? raw.unit_cost));
  let meta = null;
  try {
    if (raw && raw.meta && typeof raw.meta === 'object') {
      const encoded = JSON.stringify(raw.meta);
      if (encoded.length <= 4000) meta = encoded;
    }
  } catch (_) {}
  const occurred = Math.round(finite(raw && (raw.occurredTs ?? raw.occurred_ts)) || now);
  return {
    id, itemId, reason,
    variantId: str(raw && (raw.variantId ?? raw.variant_id), 80),
    locationId: str(raw && (raw.locationId ?? raw.location_id), 80) || 'principal',
    qtyMilli,
    unitCostCents: cost != null && cost >= 0 ? Math.round(cost * 100) : null,
    currency: str(raw && raw.currency, 3).toUpperCase() || 'MAD',
    refType: str(raw && (raw.refType ?? raw.ref_type), 32),
    refId: str(raw && (raw.refId ?? raw.ref_id), 100),
    note: str(raw && raw.note, 500), actor: str(raw && raw.actor, 100),
    occurredTs: occurred > 0 && occurred <= now + 86400000 ? occurred : now,
    reversalOf: str(raw && (raw.reversalOf ?? raw.reversal_of), 80),
    meta,
  };
}

function valid(m) {
  return !!(m.id && m.itemId && REASONS.has(m.reason)
    && Number.isSafeInteger(m.qtyMilli) && m.qtyMilli !== 0
    && Math.abs(m.qtyMilli) <= 1e12);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env || !env.DB) return json({ merchant: '', movements: [], cursor: 0 });
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  try { await ensureSchema(env); } catch (_) { return json({ merchant, movements: [], cursor: 0, unmigrated: true }); }

  if (url.searchParams.get('summary') === '1') {
    try {
      const res = await env.DB.prepare(
        `SELECT item_id, variant_id, location_id, SUM(qty_milli) AS qty_milli,
                MAX(srv_ts) AS cursor
           FROM inventory_movements
          WHERE merchant = ?
          GROUP BY item_id, variant_id, location_id
          ORDER BY item_id, variant_id, location_id`
      ).bind(merchant).all();
      const balances = ((res && res.results) || []).map((r) => ({
        itemId: r.item_id, variantId: r.variant_id, locationId: r.location_id,
        qty: Number(r.qty_milli || 0) / 1000, cursor: Number(r.cursor || 0),
      }));
      return json({ merchant, balances });
    } catch (_) { return json({ error: 'db' }, 503); }
  }

  const since = Math.max(0, Math.round(Number(url.searchParams.get('since')) || 0));
  try {
    const res = await env.DB.prepare(
      `SELECT id, item_id, variant_id, location_id, qty_milli, reason,
              unit_cost_cents, currency, ref_type, ref_id, note, actor,
              occurred_ts, srv_ts, reversal_of, meta
         FROM inventory_movements
        WHERE merchant = ? AND srv_ts > ?
        ORDER BY srv_ts ASC LIMIT ?`
    ).bind(merchant, since, PAGE).all();
    const rows = (res && res.results) || [];
    let cursor = since;
    const movements = rows.map((r) => {
      cursor = Math.max(cursor, Number(r.srv_ts || 0));
      let meta = null; try { meta = r.meta ? JSON.parse(r.meta) : null; } catch (_) {}
      return {
        id: r.id, itemId: r.item_id, variantId: r.variant_id, locationId: r.location_id,
        qty: Number(r.qty_milli || 0) / 1000, reason: r.reason,
        unitCost: r.unit_cost_cents == null ? null : Number(r.unit_cost_cents) / 100,
        currency: r.currency, refType: r.ref_type, refId: r.ref_id, note: r.note,
        actor: r.actor, occurredTs: r.occurred_ts, cursor: r.srv_ts,
        reversalOf: r.reversal_of, meta,
      };
    });
    return json({ merchant, movements, cursor, more: rows.length === PAGE });
  } catch (_) { return json({ error: 'db' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const raw = Array.isArray(body && body.movements) ? body.movements : [body && body.movement || body];
  if (!raw.length || raw.length > 200) return json({ error: 'bad-count' }, 400);
  const now = Date.now();
  const movements = raw.map((m) => sanitize(m, now));
  if (movements.some((m) => !valid(m))) return json({ error: 'bad-movement' }, 400);
  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }

  const accepted = [];
  try {
    for (const m of movements) {
      const cursor = await nextCursor(env, merchant);
      await env.DB.prepare(
        `INSERT OR IGNORE INTO inventory_movements
          (id, merchant, item_id, variant_id, location_id, qty_milli, reason,
           unit_cost_cents, currency, ref_type, ref_id, note, actor, occurred_ts,
           srv_ts, reversal_of, meta, created_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        m.id, merchant, m.itemId, m.variantId, m.locationId, m.qtyMilli, m.reason,
        m.unitCostCents, m.currency, m.refType, m.refId, m.note, m.actor,
        m.occurredTs, cursor, m.reversalOf, m.meta, now
      ).run();
      // INSERT OR IGNORE is deliberately idempotent. When another device has
      // already sent this UUID, return the cursor of the existing row rather
      // than the unused sequence value allocated for this retry.
      const stored = await env.DB.prepare(
        'SELECT srv_ts AS cursor FROM inventory_movements WHERE id = ? AND merchant = ?'
      ).bind(m.id, merchant).first();
      accepted.push({ id: m.id, cursor: Number(stored && stored.cursor) || cursor });
    }
  } catch (_) { return json({ error: 'db' }, 503); }
  return json({ ok: true, merchant, accepted });
}
