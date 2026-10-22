// Ce que les gestes de la file (/api/order/queue) ont en commun : les petites
// briques que la caisse, la salle, la cuisine et l'encaissement réutilisent.
// Déplacées telles quelles depuis queue.js ; le préfixe « _ » garde ce fichier
// hors du routage de Pages.

import { newSessionId } from './_lib.js';

export function deferCourse(context, promise) {
  const safe = Promise.resolve(promise).catch(() => false);
  if (context && typeof context.waitUntil === 'function') context.waitUntil(safe);
}

export const ORDER_ID = /^ord-[a-z0-9-]{6,48}$/;

export function storedOrderLines(row) {
  try {
    const lines = JSON.parse(row && row.lines);
    return Array.isArray(lines) ? lines : [];
  } catch (_) { return []; }
}

export function displayMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

export function operationId(raw, prefix) {
  const clean = String(raw || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 72);
  return clean ? `${prefix}-${clean}` : `${prefix}-${crypto.randomUUID()}`;
}

export async function atomicStatements(env, statements) {
  if (!env.DB || typeof env.DB.batch !== 'function') throw new Error('atomic-batch-required');
  return env.DB.batch(statements);
}

export function statement(env, sql, ...args) {
  return env.DB.prepare(sql).bind(...args);
}

export const MAX_LINES = 60;              // une commande, généreusement
export function employeeName(member) {
  return [member && member.firstName, member && member.lastName].filter(Boolean).join(' ').trim();
}
export async function ensureServiceTableSession(env, merchant, table, now) {
  try {
    let row = await env.DB.prepare(
      `SELECT id, opened_ts, seen_ts FROM table_sessions
        WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'
        ORDER BY opened_ts DESC LIMIT 1`
    ).bind(merchant, table).first();
    if (row && row.id) {
      /* Une commande de plus sur cette table EST un signe de vie. Sans cette
       * ligne, `seen_ts` restait figé à l'ouverture de la session : la fenêtre
       * de présence du GET (PRESENCE_MS) la laissait tomber au bout de deux
       * heures, et la caisse cessait alors d'attacher les tournées suivantes à
       * l'addition — le dessert et la deuxième bouteille n'étaient jamais
       * facturés. Voir aussi le pointage du service dans le GET. */
      try {
        await env.DB.prepare('UPDATE table_sessions SET seen_ts = ? WHERE id = ?')
          .bind(now, row.id).run();
      } catch (_) {}
      row.seen_ts = now;
      return row;
    }
    const id = newSessionId();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts)
       VALUES (?, ?, 'table', ?, 'open', ?, ?)`
    ).bind(id, merchant, table, now, now).run();
    row = await env.DB.prepare(
      `SELECT id, opened_ts, seen_ts FROM table_sessions
        WHERE merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'
        ORDER BY opened_ts DESC LIMIT 1`
    ).bind(merchant, table).first();
    return row && row.id ? row : null;
  } catch (_) { return null; }
}
