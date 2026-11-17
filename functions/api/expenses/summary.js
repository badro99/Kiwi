// GET /api/expenses/summary?merchant=<slug>&month=YYYY-MM
//
// Ce que la page Dépenses ne peut pas savoir seule : l'argent entré ce mois-là,
// journée commerciale par journée commerciale (coupure du commerce, 05:00 par
// défaut, dans son fuseau), et les retraits que l'équipe a faits au tiroir.
//
// Les ventes viennent de la table `sales`, celle des KPI : remboursements
// (lignes négatives) déduits, ventes annulées exclues. Les retraits sont les
// mouvements « sortie » de cash_session_events ; la page décide lesquels sont
// des dépenses (un dépôt en banque n'en est pas une, assets/expenses/engine.js).
//
// Réservé au patron et aux opérateurs Kiwi (./_owner.js).
import { json } from '../../auth/_lib.js';
import { businessBoundary, businessDate, merchantCutoff, merchantZone } from '../_business-day.js';
import { legacyBucketFor } from '../_sales-scope.js';
import { expensesReader } from './_owner.js';

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

function nextMonth(month) {
  const [, y, m] = month.match(MONTH);
  return Number(m) === 12 ? `${Number(y) + 1}-01` : `${y}-${String(Number(m) + 1).padStart(2, '0')}`;
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const month = String(url.searchParams.get('month') || '');
  if (!(await expensesReader(request, env, merchant))) return json({ error: 'owner-required' }, 403);
  if (!MONTH.test(month)) return json({ error: 'bad-month' }, 400);

  /* Les ventes d'avant un changement de nom restent sous l'ancien slug du
     compte : le patron les retrouve ici comme dans ses KPI (sales-summary.js),
     jamais une autre session. */
  const [zone, cutoff, legacy] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant), legacyBucketFor(request, env, merchant)]);
  const from = businessBoundary(month + '-01', cutoff, zone);
  const to = businessBoundary(nextMonth(month) + '-01', cutoff, zone);
  try {
    const [sales, moves] = await Promise.all([
      env.DB.prepare(`SELECT ts, COALESCE(amount_cents, CAST(ROUND(amount * 100) AS INTEGER)) AS cents
        FROM sales WHERE merchant IN (?, ?) AND ts >= ? AND ts < ? AND void_ts IS NULL`).bind(merchant, legacy || merchant, from, to).all(),
      env.DB.prepare(`SELECT id, occurred_ts, movement_amount_cents, movement_reason, actor_id
        FROM cash_session_events WHERE merchant = ? AND event_type = 'movement' AND movement_kind = 'out'
          AND occurred_ts >= ? AND occurred_ts < ? ORDER BY occurred_ts ASC LIMIT 3000`).bind(merchant, from, to).all(),
    ]);
    const perDay = new Map();
    for (const row of (sales && sales.results) || []) {
      const day = businessDate(Number(row.ts), cutoff, zone);
      perDay.set(day, (perDay.get(day) || 0) + (Number(row.cents) || 0));
    }
    const salesDays = [...perDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, salesCents]) => ({ day, salesCents }));
    const cashOuts = ((moves && moves.results) || []).map((row) => ({
      id: String(row.id), occurred_ts: Number(row.occurred_ts), day: businessDate(Number(row.occurred_ts), cutoff, zone),
      movement_kind: 'out', movement_amount_cents: Number(row.movement_amount_cents) || 0,
      movement_reason: String(row.movement_reason || ''), actor_id: String(row.actor_id || ''),
    }));
    return json({ ok: true, month, zone, cutoff, salesDays, cashOuts });
  } catch (_) {
    return json({ error: 'summary-unavailable' }, 503);
  }
}
