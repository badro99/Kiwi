import { json, activeServiceEmployee } from '../auth/_lib.js';
import { nextSrvTs } from './clients.js';

/* Un encaissement de salle ne dépasse pas ces bornes. Elles ne remplacent pas le
 * lien avec une vente (voir plus bas), elles empêchent seulement qu'un appel
 * sans vente n'accorde un solde de points sans limite.
 *   MAX_AMOUNT_MAD : une addition de restaurant, pas un montant libre ;
 *   MAX_POINTS     : plafond de points d'un seul appel SANS vente liée, quel
 *                    que soit le coefficient du programme ;
 *   MAX_UNTIED_PER_HOUR : nombre d'appels sans vente liée accordés à un même
 *                    client en une heure ;
 *   SALE_WINDOW_MS : une vente se lie à la fidélité le jour même, pas un mois
 *                    plus tard. */
const MAX_AMOUNT_MAD = 20000;
const MAX_POINTS = 5000;
const MAX_UNTIED_PER_HOUR = 4;
const SALE_WINDOW_MS = 24 * 60 * 60 * 1000;

function text(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
function parse(raw) { try { return JSON.parse(raw || '{}') || {}; } catch (_) { return {}; } }

export async function ensureEmployeeLoyaltyEvents(env) {
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
  const saleId = text(body.saleId, 96).replace(/[^A-Za-z0-9:._-]/g, '');
  let ref = text(body.ref, 96).replace(/[^A-Za-z0-9:_-]/g, '');
  /* Quand la vente est nommée, la fidélité se tire de CETTE vente : son montant
     vient de la base, jamais du corps de la requête, et la référence
     d'idempotence est celle de la vente, donc deux appels sur la même vente ne
     créditent qu'une fois. Sans vente nommée (anciennes tablettes), le montant
     reste déclaratif mais borné. */
  if (saleId) ref = ('employee-sale:' + saleId).slice(0, 96);
  if (!id || !ref) return json({ error: 'client-and-ref-required' }, 400);
  let amount = Math.max(0, Math.min(MAX_AMOUNT_MAD, Math.round(Number(body.amount) || 0)));
  let spend = amount;
  try {
    await ensureEmployeeLoyaltyEvents(env);
    if (saleId) {
      const sale = await env.DB.prepare(
        `SELECT amount, amount_cents, ts FROM sales
          WHERE merchant = ? AND id = ? AND void_ts IS NULL AND channel IS NOT 'refund' LIMIT 1`
      ).bind(employee.merchant, saleId).first();
      if (!sale) return json({ error: 'sale-not-found' }, 404);
      const cents = sale.amount_cents != null ? Number(sale.amount_cents) : Math.round(Number(sale.amount || 0) * 100);
      if (!(cents > 0)) return json({ error: 'sale-not-eligible' }, 409);
      if (Date.now() - Number(sale.ts || 0) > SALE_WINDOW_MS) return json({ error: 'sale-too-old' }, 409);
      amount = Math.min(MAX_AMOUNT_MAD, Math.round(cents / 100));
      // Spend is money, not the legacy whole-dirham loyalty basis.
      spend = Math.min(MAX_AMOUNT_MAD, cents / 100);
    }
    const client = await env.DB.prepare('SELECT id FROM clients WHERE merchant = ? AND id = ? AND deleted = 0')
      .bind(employee.merchant, id).first();
    if (!client) return json({ error: 'client-not-found' }, 404);
    const previous = await env.DB.prepare(
      'SELECT client_id FROM employee_loyalty_events WHERE merchant = ? AND ref = ?'
    ).bind(employee.merchant, ref).first();
    if (previous) {
      if (previous.client_id !== id) return json({ error: 'ref-conflict' }, 409);
      return json({ ok: true, replayed: true });
    }
    if (!saleId) {
      const recent = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM employee_loyalty_events WHERE merchant = ? AND client_id = ? AND created_ts > ?'
      ).bind(employee.merchant, id, Date.now() - 3600000).first();
      if (Number(recent && recent.n) >= MAX_UNTIED_PER_HOUR) return json({ error: 'loyalty-rate-limited' }, 429);
    }
    const cfgRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'fidelity'")
      .bind(employee.merchant).first();
    const cfg = parse(cfgRow && cfgRow.data);
    /* Pas de programme enregistré = pas de programme (même règle que
       /api/clients). Le passage et la dépense comptent ; les points et les
       tampons seulement si le commerçant a choisi un programme, jamais le
       défaut déduit `auto`. */
    const on = !!(cfg && cfg.model && !cfg.auto);
    const perMad = Math.max(0, Math.min(10, Number(cfg.amount && cfg.amount.perMad) || 1));
    const points = on && cfg.model === 'amount'
      ? Math.min(saleId ? MAX_AMOUNT_MAD * 10 : MAX_POINTS, Math.round(amount * perMad)) : 0;
    const stamps = on && (cfg.model === 'visit' || cfg.model === 'product') ? 1 : 0;
    const now = Date.now();
    const srv = await nextSrvTs(env, employee.merchant);
    const statements = [env.DB.prepare(`UPDATE clients SET points = points + ?, stamps = stamps + ?,
      visits = visits + 1, spend = spend + ?, last_seen = ?, updated_ts = ?, srv_ts = ?
      WHERE merchant = ? AND id = ? AND deleted = 0
        AND NOT EXISTS (SELECT 1 FROM employee_loyalty_events WHERE merchant = ? AND ref = ?)
        AND (? = '' OR EXISTS (SELECT 1 FROM sales WHERE merchant = ? AND id = ? AND void_ts IS NULL))`)
      .bind(points, stamps, spend, now, now, srv, employee.merchant, id, employee.merchant, ref, saleId, employee.merchant, saleId),
    env.DB.prepare(`INSERT OR IGNORE INTO employee_loyalty_events
      (merchant, ref, client_id, amount, created_ts)
      SELECT ?, ?, ?, ?, ?
       WHERE changes() > 0`)
      .bind(employee.merchant, ref, id, spend, now)];
    const results = await env.DB.batch(statements);
    if (!Number(results[0] && results[0].meta && results[0].meta.changes)) {
      const replay = await env.DB.prepare(
        'SELECT client_id FROM employee_loyalty_events WHERE merchant = ? AND ref = ?'
      ).bind(employee.merchant, ref).first();
      if (replay && replay.client_id === id) return json({ ok: true, replayed: true });
      return json({ error: 'loyalty-write-failed' }, 503);
    }
    if (!Number(results[1] && results[1].meta && results[1].meta.changes)) {
      return json({ error: 'loyalty-write-failed' }, 503);
    }
    return json({ ok: true, points, stamps });
  } catch (_) { return json({ error: 'loyalty-write-failed' }, 503); }
}
