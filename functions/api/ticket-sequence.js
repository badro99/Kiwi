// POST /api/ticket-sequence — reserve a numeric receipt-number range.
//
// A displayed receipt reference is not an idempotency key and MAX(ref)+1 is not
// an allocator: two tills can read the same maximum before either writes. This
// endpoint owns the merchant's monotonic counter and advances it atomically.
// Tills reserve a small range so an established counter can keep selling during
// a network outage without inventing a second, conflicting sequence.

import { entitledMerchant, json } from '../auth/_lib.js';

const FIRST_TICKET = 1000;
const LAST_TICKET = 99999;
const DEFAULT_SIZE = 100;
const MAX_SIZE = 500;

function boundedInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export async function reserveTicketRange(env, merchant, requestedSize, requestedFloor, requestedPeriod) {
  const size = boundedInt(requestedSize, DEFAULT_SIZE, 1, MAX_SIZE);
  const clientFloor = boundedInt(requestedFloor, FIRST_TICKET, FIRST_TICKET, LAST_TICKET);
  const currentYear = new Date().getUTCFullYear();
  const period = boundedInt(requestedPeriod, currentYear, 2020, 2100);
  const periodStart = Date.UTC(period, 0, 1);
  const periodEnd = Date.UTC(period + 1, 0, 1);
  const now = Date.now();

  /* Self-healing for databases deployed before schema.sql is applied. The
   * statement is idempotent and keeps a code deploy from bricking checkout
   * while the D1 migration is rolling out. */
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ticket_sequences (' +
    'merchant TEXT NOT NULL, period INTEGER NOT NULL, next_value INTEGER NOT NULL, ' +
    'updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, period))'
  ).run();

  /* Bootstrap above every numeric reference already present in the old sales
   * ledger. The exact digit predicate matters: SQLite's `[0-9]*` only means
   * "starts with a digit" and would accept values such as `1000-X`. */
  const old = await env.DB.prepare(
    "SELECT MAX(CAST(ref AS INTEGER)) AS n FROM sales " +
    "WHERE merchant = ? AND ts >= ? AND ts < ? AND ref <> '' AND ref NOT GLOB '*[^0-9]*' " +
    'AND CAST(ref AS INTEGER) BETWEEN 1 AND 99999'
  ).bind(merchant, periodStart, periodEnd).first();
  const dbFloor = Math.max(FIRST_TICKET, ((old && Number(old.n)) || 0) + 1);
  const floor = Math.max(clientFloor, dbFloor);

  /* L'INSERT écrivait le plancher AVANT que l'UPDATE ne vérifie qu'une plage y
   * tienne encore. Une demande impossible — plancher au ras de LAST_TICKET —
   * échouait donc en 500 tout en PERSISTANT son plancher : la caisse ne pouvait
   * plus tirer un seul numéro de l'année, alors que la requête fautive n'avait
   * rien obtenu. On refuse maintenant avant d'écrire quoi que ce soit ; une
   * demande refusée laisse le compteur exactement où il était. */
  const seen = await env.DB.prepare(
    'SELECT next_value FROM ticket_sequences WHERE merchant = ? AND period = ?'
  ).bind(merchant, period).first();
  const start = seen ? Math.max(Number(seen.next_value) || 0, floor) : floor;
  if (!Number.isFinite(start) || start + size - 1 > LAST_TICKET) {
    throw new Error('allocation-failed');
  }

  if (!seen) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO ticket_sequences (merchant, period, next_value, updated_ts) VALUES (?, ?, ?, ?)'
    ).bind(merchant, period, floor, now).run();
  }

  /* One UPDATE is the allocation boundary. SQLite serializes writers to this
   * row, so concurrent tills receive disjoint ranges. `next_value` always
   * means the first number that has never been reserved. */
  const row = await env.DB.prepare(
    'UPDATE ticket_sequences SET ' +
      'next_value = (CASE WHEN next_value < ? THEN ? ELSE next_value END) + ?, updated_ts = ? ' +
      'WHERE merchant = ? AND period = ? AND ' +
      '(CASE WHEN next_value < ? THEN ? ELSE next_value END) + ? - 1 <= ? ' +
      'RETURNING next_value - ? AS start, next_value - 1 AS end'
  ).bind(floor, floor, size, now, merchant, period, floor, floor, size, LAST_TICKET, size).first();

  if (!row || !Number.isFinite(Number(row.start)) || !Number.isFinite(Number(row.end))) {
    throw new Error('allocation-failed');
  }
  return { start: Number(row.start), end: Number(row.end), merchant, period };
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const asked = String((body && body.merchant) || '').slice(0, 64);
  if (!asked) return json({ error: 'no-merchant' }, 400);

  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  try {
    return json(await reserveTicketRange(env, merchant, body && body.size, body && body.floor, body && body.period));
  } catch (e) {
    return json({ error: 'db', detail: String((e && e.message) || e) }, 500);
  }
}

export function onRequestGet() {
  return json({ error: 'method-not-allowed' }, 405);
}
