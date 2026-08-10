// /api/sale/cancel
//
// POST — a paired till cancels one completed sale after verifying the staff
// member's personal PIN. The sale is never deleted: it is marked void so every
// revenue surface drops it, while sale_audit keeps the complete trail.
// GET  — the signed-in owner reads those cancellations for the Ventes page.

import { entitledMerchant, isTillFor, json, employeeRoleOpensTill } from '../../auth/_lib.js';

function cleanLines(raw) {
  if (!raw) return [];
  try {
    const rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(rows) ? rows.map((l) => ({
      name: String((l && (l.n ?? l.name)) || 'Article').slice(0, 80),
      qty: Math.max(0, Number(l && (l.q ?? l.qty)) || 0),
      total: Math.max(0, Number(l && (l.t ?? l.total)) || 0),
      cat: String((l && (l.c ?? l.cat)) || '').slice(0, 40),
      itemId: String((l && (l.i ?? l.itemId)) || '').slice(0, 80),
      variantId: String((l && (l.v ?? l.variantId)) || '').slice(0, 80),
      unit: String((l && (l.u ?? l.unit)) || '').slice(0, 24),
      kind: String((l && (l.kd ?? l.kind)) || '').slice(0, 24),
      unitCost: Number.isFinite(Number(l && (l.k ?? l.unitCost))) ? Number(l && (l.k ?? l.unitCost)) : null,
      recipeVersionId: String((l && (l.r ?? l.recipeVersionId)) || '').slice(0, 80),
    })) : [];
  } catch (_) { return []; }
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ cancellations: [] });
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = await entitledMerchant(request, env, asked);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
  try {
    const rs = await env.DB.prepare(
      `SELECT a.sale_id AS id, a.actor, a.actor_id, a.amount, a.method, a.ref,
              a.sale_ts, a.ts, a.reason, a.note, s.label, s.lines
         FROM sale_audit a LEFT JOIN sales s ON s.id = a.sale_id AND s.merchant = a.merchant
        WHERE a.merchant = ? AND a.action = 'void' AND a.ts >= ?
        ORDER BY a.ts DESC LIMIT 200`
    ).bind(merchant, from).all();
    const cancellations = ((rs && rs.results) || []).map((r) => ({
      ...r, lines: cleanLines(r.lines),
    }));
    return json({ merchant, cancellations });
  } catch (_) {
    // Deploying code before the audit migration must not break Ventes.
    return json({ merchant, cancellations: [] });
  }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = String((body && body.merchant) || '').slice(0, 64);
  const id = String((body && body.id) || '').slice(0, 64);
  const pin = String((body && body.pin) || '');
  if (!merchant || !id) return json({ error: 'sale-required' }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ error: 'bad-pin' }, 401);
  if (!(await isTillFor(request, env, merchant))) return json({ error: 'forbidden-till' }, 403);

  let staff;
  try {
    staff = await env.DB.prepare(
      'SELECT id, name, role FROM staff_pins WHERE merchant = ? AND pin = ? LIMIT 1'
    ).bind(merchant, pin).first();
  } catch (_) { return json({ error: 'staff-unavailable' }, 503); }
  if (!staff) return json({ error: 'bad-pin' }, 401);
  if (!employeeRoleOpensTill(staff.role)) return json({ error: 'role-not-authorized' }, 403);

  let sale;
  try {
    sale = await env.DB.prepare(
      `SELECT id, amount, method, label, ref, ts, lines, void_ts
         FROM sales WHERE id = ? AND merchant = ? LIMIT 1`
    ).bind(id, merchant).first();
  } catch (e) {
    return json({ error: 'migration-needed', detail: String((e && e.message) || e) }, 503);
  }
  if (!sale) return json({ error: 'sale-not-found' }, 404);
  if (sale.void_ts) return json({ error: 'already-cancelled' }, 409);

  // The reprint screen only offers today's sales. Keep a second server-side
  // boundary so a modified client cannot cancel old accounting periods.
  if (Date.now() - Number(sale.ts || 0) > 36 * 60 * 60 * 1000) {
    return json({ error: 'sale-too-old' }, 409);
  }

  const ts = Date.now();
  const actor = String(staff.name || staff.role || 'Employé').slice(0, 80);
  const actorId = String(staff.id || '').slice(0, 80);
  const reason = 'employee-cancel';
  const impact = JSON.stringify({
    source: 'cashier-reprint', totals: { amount: Number(sale.amount) || 0, count: 1 },
    lines: cleanLines(sale.lines), role: String(staff.role || '').slice(0, 80),
  });
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE sales SET void_ts = ?, void_reason = ?, void_note = '', void_actor = ?, void_actor_id = ?
          WHERE id = ? AND merchant = ? AND void_ts IS NULL`
      ).bind(ts, reason, actor, actorId, id, merchant),
      env.DB.prepare(
        `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id,
                                 amount, method, ref, sale_ts, impact, ts)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(merchant, id, 'void', reason, '', actor, actorId, Number(sale.amount) || 0,
             sale.method || '', sale.ref || '', Number(sale.ts) || 0, impact, ts),
    ]);
  } catch (e) {
    return json({ error: 'cancel-failed', detail: String((e && e.message) || e) }, 500);
  }

  return json({ ok: true, id, ref: sale.ref || '', amount: Number(sale.amount) || 0,
                actor, actor_id: actorId, ts });
}
