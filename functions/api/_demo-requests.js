/* Demandes de démo du site public · ce que la route publique et la console
 * opérateur partagent.
 *
 * Avant (ticket #0171), « Demander une démo » préparait un message WhatsApp que
 * le visiteur devait encore envoyer lui-même : une demande remplie puis jamais
 * envoyée n'arrivait nulle part. Désormais la demande est enregistrée ici, dans
 * D1, dès que le visiteur valide ; WhatsApp n'est plus qu'une suite possible.
 *
 * La table se crée d'elle-même au premier usage, comme le support
 * (functions/api/_support.js) : la base de production retarde toujours sur
 * schema.sql, et une demande de démo ne doit pas se perdre pour ça. */

export const DEMO_STATUSES = ['new', 'contacted', 'scheduled', 'done', 'lost', 'spam'];
export const DEMO_DAYS = ['today', 'tomorrow', 'week', 'later'];
export const DEMO_PARTS = ['morning', 'afternoon', 'evening', 'any'];

const TABLE = `CREATE TABLE IF NOT EXISTS demo_requests (
  id          TEXT PRIMARY KEY,
  reference   TEXT NOT NULL UNIQUE,
  created_ts  INTEGER NOT NULL,
  first_name  TEXT NOT NULL,
  business    TEXT NOT NULL,
  trade       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL,
  email       TEXT NOT NULL DEFAULT '',
  slot_day    TEXT NOT NULL DEFAULT '',
  slot_part   TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  lang        TEXT NOT NULL DEFAULT '',
  page        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',
  handled_by  TEXT NOT NULL DEFAULT '',
  notified    TEXT NOT NULL DEFAULT '',
  updated_ts  INTEGER NOT NULL DEFAULT 0
)`;
const INDEX = 'CREATE INDEX IF NOT EXISTS idx_demo_requests_created ON demo_requests(created_ts)';

const ready = new WeakSet();
export async function ensureDemoRequests(env) {
  if (!env || !env.DB) throw new Error('no-db');
  if (ready.has(env.DB)) return;
  await env.DB.prepare(TABLE).run();
  await env.DB.prepare(INDEX).run();
  ready.add(env.DB);
}

const text = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, max);

/* Un numéro joignable : chiffres, au plus un « + » en tête. 06 12 34 56 78,
 * +212 6 12 34 56 78 et 00212… sont tous acceptés ; 8 à 15 chiffres. */
export function cleanPhone(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!/^[+\d][\d\s().-]*$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return (raw.startsWith('+') ? '+' : '') + digits;
}

export function cleanEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase().slice(0, 160);
  if (!e) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/* Le contenu d'une demande, borné et typé. Renvoie { ok, value } ou
 * { ok:false, field } : le champ fautif, pour que la page le désigne. */
export function sanitizeDemoRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const value = {
    first_name: text(b.firstName, 60),
    business: text(b.business, 80),
    trade: /^[a-z0-9-]{1,40}$/.test(String(b.trade || '')) ? String(b.trade) : '',
    phone: cleanPhone(b.phone),
    email: cleanEmail(b.email),
    slot_day: DEMO_DAYS.includes(b.day) ? b.day : 'any',
    slot_part: DEMO_PARTS.includes(b.part) ? b.part : 'any',
    note: text(b.note, 500),
    lang: /^[a-z]{2}$/.test(String(b.lang || '')) ? String(b.lang) : '',
    page: text(b.page, 200),
  };
  if (value.slot_day === 'any') value.slot_day = '';
  if (!value.first_name) return { ok: false, field: 'firstName' };
  if (!value.business) return { ok: false, field: 'business' };
  if (!value.phone) return { ok: false, field: 'phone' };
  if (value.email === null) return { ok: false, field: 'email' };
  return { ok: true, value };
}

/* Une référence lisible au téléphone : D-2610-7K3Q (jour, mois, puis quatre
 * signes sans 0/O ni 1/I). Le jour est celui de Casablanca, lu dans le fuseau
 * (le Maroc est passé de UTC+1 à UTC+0 en 2026), pas celui du serveur : une
 * demande faite à 00 h 30 porte la date du visiteur. */
export function demoReference(now = Date.now()) {
  const civil = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca', day: '2-digit', month: '2-digit',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  const d = { getUTCDate: () => Number(civil.day), getUTCMonth: () => Number(civil.month) - 1 };
  const p = (n) => String(n).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const tail = Array.from(bytes, (x) => alphabet[x % alphabet.length]).join('');
  return `D-${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}-${tail}`;
}

export const DAY_LABELS = { today: 'aujourd’hui', tomorrow: 'demain', week: 'cette semaine', later: 'plus tard' };
export const PART_LABELS = { morning: 'le matin', afternoon: 'l’après-midi', evening: 'en fin de journée', any: 'à tout moment' };

/* « Demain » ne veut rien dire trois jours plus tard. Le visiteur choisit un
 * jour relatif au moment où il écrit ; l'équipe lit la demande le lendemain
 * matin, ou après le week-end. On écrit donc la vraie date à côté, au jour
 * civil du Maroc (le site dit « Heure du Maroc ») de l'envoi :
 *   aujourd'hui, mer. 21 oct., le matin
 *   demain, jeu. 22 oct., l'après-midi
 *   cette semaine, jusqu'au dim. 25 oct.
 * Sans horodatage (une ancienne ligne), le libellé relatif seul, comme avant.
 * La console (assets/admin-demo-requests.js) applique la même règle ;
 * tools/demo-request-api-test.mjs compare les deux. */
export function slotDate(slotDay, ts) {
  if (!Number(ts) || !['today', 'tomorrow', 'week'].includes(slotDay)) return '';
  const civil = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(Number(ts)).map((x) => [x.type, x.value]));
  const day = new Date(Date.UTC(Number(civil.year), Number(civil.month) - 1, Number(civil.day), 12));
  if (slotDay === 'tomorrow') day.setUTCDate(day.getUTCDate() + 1);
  if (slotDay === 'week') day.setUTCDate(day.getUTCDate() + ((7 - day.getUTCDay()) % 7));
  const text = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(day);
  return slotDay === 'week' ? 'jusqu’au ' + text : text;
}

export function slotText(row, ts = row && row.created_ts) {
  const day = DAY_LABELS[row.slot_day] || '';
  const date = day ? slotDate(row.slot_day, ts) : '';
  const part = row.slot_part && row.slot_part !== 'any' ? PART_LABELS[row.slot_part] : '';
  return [day, date, part].filter(Boolean).join(', ') || 'à convenir';
}
