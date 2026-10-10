// GET /api/admin/report?merchant=<slug>&month=YYYY-MM — le rapport du mois d'un
// établissement, tel qu'on le remet au commerçant (kiwi-report.html).
//
// Réservé à l'opérateur, comme tout /api/admin/*. Lecture seule.
//
// Le mois suit l'horloge du MAGASIN, pas celle du serveur : du premier jour à
// la coupure (5 h par défaut, ou celle publiée par la caisse) au premier jour
// du mois suivant à la même coupure, dans le fuseau que la caisse a déclaré.
// C'est la même frontière que le Z et que le tableau de bord ; sinon les
// ventes de 1 h du matin le 1er tomberaient dans le mauvais mois et le
// rapport ne recouperait pas la caisse.
//
// Les règles d'honnêteté de overview.js s'appliquent :
//  - une vente annulée (`void_ts`) ne compte pas dans le chiffre ; elle est
//    rapportée à part, en nombre et en montant, parce que le commerçant doit
//    pouvoir la retrouver ;
//  - un ticket sans détail de lignes (anciennes ventes, lien de paiement) n'est
//    pas un ticket « sans article » : le classement des produits dit sur
//    combien de tickets il repose ;
//  - aucun nom de client, aucun code, aucun identifiant de personnel.
import { isOperator, json } from '../../auth/_lib.js';
import { businessBoundary, businessDate, merchantCutoff, merchantZone, addBusinessDays } from '../_business-day.js';

const ROW_CAP = 20000;
const amountSql = 'COALESCE(amount_cents, amount * 100)';

function monthBounds(month, cutoff, zone) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return {
    first, next, prevMonth,
    from: businessBoundary(first, cutoff, zone),
    to: businessBoundary(next, cutoff, zone),
    prevFrom: businessBoundary(`${prevMonth}-01`, cutoff, zone),
  };
}

function hourIn(ts, zone) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(ts));
}
function weekdayIn(day) {
  return new Date(day + 'T12:00:00Z').getUTCDay(); // 0 = dimanche, sur la date commerciale
}

export async function onRequestGet({ request, env }) {
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '');
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(merchant)) return json({ error: 'merchant-required' }, 400);

  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
  const now = Date.now();
  let month = String(url.searchParams.get('month') || '');
  if (!month) {
    // Par défaut : le dernier mois CLOS. Un rapport du mois en cours se lit
    // comme un mois raté.
    const today = businessDate(now, cutoff, zone);
    const [y, m] = today.split('-').map(Number);
    month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'invalid-month' }, 400);
  const b = monthBounds(month, cutoff, zone);
  if (b.from > now) return json({ error: 'future-month' }, 400);

  try {
    const profile = await env.DB.prepare(
      `SELECT mc.merchant, mc.name, mc.type, mc.plan, mc.city, a.business
         FROM merchant_config mc LEFT JOIN accounts a ON a.id = mc.account_id WHERE mc.merchant = ?`)
      .bind(merchant).first();
    if (!profile) return json({ error: 'not-found' }, 404);

    const [rowsRes, prev, voids] = await Promise.all([
      env.DB.prepare(`SELECT ts, ${amountSql} AS cents, method, lines FROM sales
         WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL ORDER BY ts LIMIT ?`)
        .bind(merchant, b.from, b.to, ROW_CAP + 1).all(),
      env.DB.prepare(`SELECT COALESCE(SUM(${amountSql}),0) AS cents,
           SUM(CASE WHEN ${amountSql} > 0 THEN 1 ELSE 0 END) AS count
         FROM sales WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL`)
        .bind(merchant, b.prevFrom, b.from).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(${amountSql}),0) AS cents
         FROM sales WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NOT NULL`)
        .bind(merchant, b.from, b.to).first(),
    ]);
    const all = rowsRes.results || [];
    const truncated = all.length > ROW_CAP;
    const rows = truncated ? all.slice(0, ROW_CAP) : all;

    // Une entrée par journée du mois, y compris les jours sans vente.
    const days = [];
    for (let d = b.first; d < b.next; d = addBusinessDays(d, 1)) days.push({ d, cents: 0, count: 0 });
    const dayIndex = new Map(days.map((x, i) => [x.d, i]));
    const methods = new Map();
    const hours = Array.from({ length: 24 }, (_, h) => ({ h, cents: 0, count: 0 }));
    const weekdays = Array.from({ length: 7 }, (_, w) => ({ w, cents: 0, count: 0 }));
    const products = new Map();
    let cents = 0, count = 0, refundsCents = 0, refunds = 0, detailed = 0;

    for (const r of rows) {
      const c = Number(r.cents) || 0;
      const d = businessDate(r.ts, cutoff, zone);
      const i = dayIndex.get(d);
      cents += c;
      if (c > 0) count++; else if (c < 0) { refunds++; refundsCents += c; }
      if (i !== undefined) { days[i].cents += c; if (c > 0) days[i].count++; }
      const m = String(r.method || 'autre').slice(0, 16);
      const mm = methods.get(m) || { method: m, cents: 0, count: 0 };
      mm.cents += c; if (c > 0) mm.count++; methods.set(m, mm);
      if (c > 0) {
        const h = hours[hourIn(r.ts, zone)]; h.cents += c; h.count++;
        const w = weekdays[weekdayIn(d)]; w.cents += c; w.count++;
      }
      if (c > 0 && r.lines) {
        let lines = null;
        try { lines = JSON.parse(r.lines); } catch (_) {}
        if (Array.isArray(lines) && lines.length) {
          detailed++;
          for (const l of lines.slice(0, 40)) {
            const name = String((l && (l.n || l.name)) || '').trim().slice(0, 80);
            if (!name) continue;
            const key = name.toLocaleLowerCase('fr');
            const p = products.get(key) || { name, qty: 0, cents: 0 };
            p.qty += Number(l.q ?? l.qty) || 0;
            p.cents += Math.round((Number(l.t) || 0) * 100);
            products.set(key, p);
          }
        }
      }
    }

    const top = [...products.values()].sort((a, b2) => b2.cents - a.cents || b2.qty - a.qty).slice(0, 10);
    const best = days.reduce((a, x) => (x.cents > (a ? a.cents : -Infinity) ? x : a), null);
    const open = days.filter((x) => x.count > 0).length;
    const prevCents = Number(prev && prev.cents) || 0;

    return json({
      merchant,
      store: { name: profile.business || profile.name || merchant, type: profile.type || '', plan: profile.plan || '', city: profile.city || '' },
      month, zone, cutoff,
      window: { from: b.from, to: b.to },
      complete: b.to <= now,              // un mois en cours n'est pas un mois clos
      truncated, rowCap: ROW_CAP,
      currency: 'MAD',
      totals: {
        cents, count, basketCents: count ? Math.round(cents / count) : 0,
        refunds, refundsCents,
        openDays: open, avgOpenDayCents: open ? Math.round(cents / open) : 0,
        best: best && best.cents > 0 ? { d: best.d, cents: best.cents } : null,
      },
      previous: { month: b.prevMonth, cents: prevCents, count: Number(prev && prev.count) || 0,
        changePct: prevCents > 0 ? Math.round(((cents - prevCents) / prevCents) * 1000) / 10 : null },
      voided: { count: Number(voids && voids.count) || 0, cents: Number(voids && voids.cents) || 0 },
      days, methods: [...methods.values()].sort((a, b2) => b2.cents - a.cents),
      hours, weekdays,
      products: { top, detailedTickets: detailed, tickets: count },
      generated_ts: now,
    });
  } catch (e) {
    return json({ error: 'query-failed' }, 500);
  }
}
