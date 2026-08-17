import { json, activeServiceEmployee } from '../auth/_lib.js';

function text(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
function parse(raw) { try { return JSON.parse(raw || '{}') || {}; } catch (_) { return {}; } }

async function ensureEvents(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS employee_loyalty_events (
    merchant TEXT NOT NULL, ref TEXT NOT NULL, client_id TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0, created_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, ref))`).run();
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const asked = text(url.searchParams.get('merchant'), 64).toLowerCase();
  const employee = await activeServiceEmployee(request, env, asked);
  if (!employee) return json({ error: 'on-shift-service-required' }, 403);
  const rawQ = text(url.searchParams.get('q'), 80).toLowerCase();
  const escapedQ = rawQ.replace(/[%_\\]/g, '\\$&');
  const q = '%' + escapedQ + '%';
  try {
    const rows = await env.DB.prepare(`SELECT id, name, phone, points, stamps, visits, spend
      FROM clients WHERE merchant = ? AND deleted = 0
        AND (LOWER(name) LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')
      ORDER BY last_seen DESC, name LIMIT 100`).bind(employee.merchant, q, q).all();
    return json({ ok: true, clients: rows.results || [] });
  } catch (_) { return json({ ok: true, clients: [], unmigrated: true }); }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body = {};
  try { body = await request.json() || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = text(body.merchant, 64).toLowerCase();
  const employee = await activeServiceEmployee(request, env, asked);
  if (!employee) return json({ error: 'on-shift-service-required' }, 403);
  const id = text(body.clientId, 64);
  const ref = text(body.ref, 96).replace(/[^A-Za-z0-9:_-]/g, '');
  const amount = Math.max(0, Math.min(200000, Math.round(Number(body.amount) || 0)));
  if (!id || !ref) return json({ error: 'client-and-ref-required' }, 400);
  try {
    await ensureEvents(env);
    const client = await env.DB.prepare('SELECT id FROM clients WHERE merchant = ? AND id = ? AND deleted = 0')
      .bind(employee.merchant, id).first();
    if (!client) return json({ error: 'client-not-found' }, 404);
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO employee_loyalty_events
      (merchant, ref, client_id, amount, created_ts) VALUES (?, ?, ?, ?, ?)`)
      .bind(employee.merchant, ref, id, amount, Date.now()).run();
    if (!Number(inserted && inserted.meta && inserted.meta.changes)) return json({ ok: true, replayed: true });
    const cfgRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'fidelity'")
      .bind(employee.merchant).first();
    const cfg = parse(cfgRow && cfgRow.data);
    const points = cfg.model === 'amount' || !cfg.model
      ? Math.round(amount * Math.max(0, Number(cfg.amount && cfg.amount.perMad) || 1)) : 0;
    const stamps = cfg.model === 'visit' || cfg.model === 'product' ? 1 : 0;
    const now = Date.now();
    await env.DB.prepare(`UPDATE clients SET points = points + ?, stamps = stamps + ?,
      visits = visits + 1, spend = spend + ?, last_seen = ?, updated_ts = ?, srv_ts = ?
      WHERE merchant = ? AND id = ? AND deleted = 0`)
      .bind(points, stamps, amount, now, now, now, employee.merchant, id).run();
    return json({ ok: true, points, stamps });
  } catch (_) { return json({ error: 'loyalty-write-failed' }, 503); }
}
