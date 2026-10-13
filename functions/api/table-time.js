// GET /api/table-time?merchant=<slug>&from=<ms>&to=<ms> — le temps moyen à
// table d'une période, pour la tuile du tableau de bord.
//
// Lit les visites de table FERMÉES dans la période [from, to) (table_sessions,
// mode 'table') et rend leur durée moyenne et médiane en minutes, selon les
// règles de functions/api/_table-time.js (seuls les vrais départs comptent).
// Rien de nominatif ne sort : ni table, ni serveur, ni client.
//
// Lecture seule, pour le seul commerce demandé (tenantFor non strict : la
// session du propriétaire, une caisse appairée, un opérateur). Une base sans
// la table, ou une erreur de lecture, répond « unavailable » : la tuile dit
// alors « · », jamais un chiffre inventé.

import { json } from '../auth/_lib.js';
import { tenantFor } from './_private.js';
import { dwellStats } from './_table-time.js';

const MAX_SPAN_MS = 400 * 864e5;
const MAX_ROWS = 20000;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').trim().toLowerCase();
  const from = Math.floor(Number(url.searchParams.get('from')));
  const to = Math.floor(Number(url.searchParams.get('to')));
  if (!asked) return json({ error: 'merchant-required' }, 400);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= from || to - from > MAX_SPAN_MS) {
    return json({ error: 'bad-window' }, 400);
  }
  if (!env || !env.DB) return json({ ok: false, error: 'unavailable' }, 503);
  const who = await tenantFor(request, env, asked);
  if (who !== asked) return json({ error: 'forbidden-merchant' }, 403);
  let rows;
  try {
    const rs = await env.DB.prepare(
      `SELECT opened_ts, closed_ts, closed_by FROM table_sessions
        WHERE merchant = ? AND mode = 'table' AND status = 'closed'
          AND closed_ts >= ? AND closed_ts < ?
        ORDER BY closed_ts DESC LIMIT ${MAX_ROWS}`
    ).bind(asked, from, to).all();
    rows = (rs && rs.results) || [];
  } catch (_) {
    return json({ ok: false, error: 'unavailable' }, 503);
  }
  return json({ ok: true, merchant: asked, from, to, ...dwellStats(rows) }, 200, { 'Cache-Control': 'private, max-age=300' });
}
