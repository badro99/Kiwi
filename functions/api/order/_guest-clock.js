import { merchantZone, businessDate, businessBoundary, addBusinessDays, DEFAULT_ZONE } from '../_business-day.js';
// Contrat : bornes civiles et allocation du numéro ; aucune écriture cuisine.
/* ── Le jour d'ouverture ───────────────────────────────────────────────────
 * Les limites de file repartent à 1 chaque jour, à minuit à l'heure civile du
 * magasin : une commande de 00h30 appartient au jour qui commence, pas aux
 * limites de la veille. La frontière se lit dans le fuseau (Intl), jamais par
 * un décalage fixe : le Maroc est passé de UTC+1 à UTC+0 en 2026, et un
 * « +1 h » écrit en dur remettait les limites à zéro à 23 h.
 * (Ce n'est PAS le « jour commercial » du rapport Z, qui suit la coupure
 * saisie par le commerçant — deux notions voisines et volontairement distinctes.) */
export function startOfDay(now, zone = DEFAULT_ZONE) {
  return businessBoundary(businessDate(now, 0, zone), 0, zone);
}

/* Les numéros lisibles des commandes restaurant repartent à 1 chaque lundi
 * à 00:00, heure du magasin. Cette borne est distincte du jour commercial et
 * ne touche pas aux tickets boutique, dont la séquence sert aux retours. */
export function startOfWeek(now, zone = DEFAULT_ZONE) {
  const day = businessDate(now, 0, zone);                       // date civile du magasin
  const dow = new Date(day + 'T00:00:00Z').getUTCDay();         // 0 dim. … 6 sam.
  return businessBoundary(addBusinessDays(day, -((dow + 6) % 7)), 0, zone);
}

/* Allocate the next human-facing restaurant order number. The counter is
 * independent from deletable order rows: cancellation/support cleanup leaves a
 * deliberate gap and can never make a number reappear. The MAX query is only a
 * one-time migration floor for weeks already in progress when this ships. */
export async function nextOrderNumber(env, merchant, now) {
  const period = startOfWeek(now, await merchantZone(env, merchant));
  const stamp = Date.now();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS order_sequences (' +
    'merchant TEXT NOT NULL, period INTEGER NOT NULL, next_value INTEGER NOT NULL, ' +
    'updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, period))'
  ).run();
  const old = await env.DB.prepare(
    'SELECT COALESCE(MAX(number), 0) + 1 AS n FROM orders WHERE merchant = ? AND created_ts >= ?'
  ).bind(merchant, period).first();
  /* The same week can carry a second key when its Monday midnight moves:
   * the fixed +1 h boundary of before 2026-10, a store whose zone changed, a
   * country that changes its clock. Continue that week's counter rather than
   * restarting at MAX(number) + 1, which could hand out a deleted number again. */
  const near = await env.DB.prepare(
    'SELECT MAX(next_value) AS n FROM order_sequences WHERE merchant = ? AND period BETWEEN ? AND ? AND period <> ?'
  ).bind(merchant, period - 3 * 3600000, period + 3 * 3600000, period).first();
  const floor = Math.max(1, Number(old && old.n) || 1, Number(near && near.n) || 1);
  await env.DB.prepare(
    'INSERT OR IGNORE INTO order_sequences (merchant, period, next_value, updated_ts) VALUES (?, ?, ?, ?)'
  ).bind(merchant, period, floor, stamp).run();
  const row = await env.DB.prepare(
    'UPDATE order_sequences SET next_value = ' +
    '(CASE WHEN next_value < ? THEN ? ELSE next_value END) + 1, updated_ts = ? ' +
    'WHERE merchant = ? AND period = ? RETURNING next_value - 1 AS number'
  ).bind(floor, floor, stamp, merchant, period).first();
  if (!row || !Number.isFinite(Number(row.number))) throw new Error('order-number-allocation-failed');
  return Number(row.number);
}

