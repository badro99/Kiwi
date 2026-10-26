import { DateTimeFormat } from '../_cached-clock.js';
import { merchantZone } from '../_business-day.js';
// Contrat : lecture des horaires publiés ; aucune mutation.
/* ── Les horaires publiés, appliqués ici aussi ─────────────────────────────
 * La page de commande (kiwi-order.html › shopClosed) refuse d'envoyer quand
 * le commerce est fermé d'après les horaires publiés avec sa carte. L'API, elle,
 * ne regardait que le comptoir (deskOpen) : une caisse restée allumée après la
 * fermeture, et une requête faite à la main, un onglet resté ouvert ou la page
 * Order Pro, qui ne lit pas les horaires, passaient. Même règle que la page,
 * même document (menus.data.hours, recopié champ par champ par /api/menu), même
 * horloge (le fuseau que la caisse a déclaré). Aucun horaire publié : rien ne se
 * bloque, exactement comme la page.
 *
 * Portage de assets/hours.js › statusOf, réduit à « ouvert maintenant ? » :
 * créneaux de la veille (un service qui passe minuit) et du jour même,
 * exception datée prioritaire sur la semaine type, 24:00 = fin de journée. */
const H_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const H_MIN_DAY = 24 * 60;
function hMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h === 24 && mi === 0) return H_MIN_DAY;
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function hSpan(p) {
  const a = hMin(p && p.from), b = hMin(p && p.to);
  if (a == null || b == null) return 0;
  if (b === H_MIN_DAY) return H_MIN_DAY - a;
  return b > a ? b - a : b + H_MIN_DAY - a;
}
/* L'heure murale du magasin, lue comme une date UTC : y, m, d, h, min. */
function wallClock(ts, zone) {
  try {
    const o = {};
    new DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ts)).forEach((x) => { o[x.type] = +x.value; });
    return Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute);
  } catch (_) { return null; }
}
/* true / false, ou null quand aucun horaire n'est configuré. */
export function hoursOpenAt(hours, ts, zone) {
  if (!hours || typeof hours !== 'object' || !hours.week) return null;
  const week = hours.week;
  const configured = H_DAYS.some((d) => week[d] && week[d].open && (week[d].periods || []).some((p) => hSpan(p) > 0));
  if (!configured) return null;
  const t = wallClock(ts, zone || 'Africa/Casablanca');
  if (t == null) return null;
  const day0 = Math.floor(t / 864e5) * 864e5;
  for (const base of [day0 - 864e5, day0]) {
    const d = new Date(base);
    const key = d.toISOString().slice(0, 10);
    /** @type {{kind?: string, periods?: {from: string, to: string}[]} | null} Selected by the synchronous exception scan. */
    let ex = null;
    (Array.isArray(hours.exceptions) ? hours.exceptions : []).forEach((e) => { if (e && key >= e.from && key <= e.to) ex = e; });
    const wd = week[H_DAYS[d.getUTCDay()]];
    const periods = ex ? (ex.kind === 'closed' ? [] : (ex.periods || [])) : ((wd && wd.open) ? (wd.periods || []) : []);
    for (const p of periods) {
      const a = hMin(p.from), len = hSpan(p);
      if (a == null || !len) continue;
      const start = base + a * 60000;
      if (start <= t && t < start + len * 60000) return true;
    }
  }
  return false;
}
export async function hoursClosed(env, merchant, now = Date.now()) {
  let hours = null;
  try {
    const row = await env.DB.prepare('SELECT data FROM menus WHERE merchant = ?').bind(merchant).first();
    hours = row && row.data ? (JSON.parse(row.data) || {}).hours : null;
  } catch (_) { return false; }
  if (!hours) return false;
  return hoursOpenAt(hours, now, await merchantZone(env, merchant)) === false;
}

