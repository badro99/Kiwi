/* ── VENTES ANTÉRIEURES ───────────────────────────────────────────────────────
 * Ce qu'un établissement a vendu AVANT de travailler sur Kiwi (Jon's Burgers,
 * 26 nov. 2026 : « où peut-on ajouter les ventes de la période précédente ? »).
 *
 * Choix du propriétaire : ces ventes comptent dans les RAPPORTS seulement
 * (chiffre d'affaires, produits les plus vendus, comparaisons, rapport d'un
 * jour passé). Elles n'entrent ni dans un tiroir de caisse, ni dans un Z, ni
 * dans le stock :
 *   · une ligne par jour (par tranche de 40 articles), écrite par la session
 *     propriétaire : written_by = 'account', que le Z d'une caisse ne certifie
 *     jamais (z-reconciliation.js) ;
 *   · canal 'historique' et libellé « Ventes antérieures », visibles partout ;
 *   · midi du jour commercial : la caisse n'importe une vente du serveur que si
 *     elle date de son service ouvert, et un jour antérieur au premier ticket de
 *     caisse précède forcément tout service ;
 *   · seulement les jours AVANT la première vente de caisse du magasin : un jour
 *     déjà tenu en caisse serait compté deux fois.
 *
 * Ressaisir un jour le remplace ; un jour vidé est annulé (void_ts), jamais
 * effacé : ce sont des lignes de la table des ventes, et une vente ne se
 * supprime pas (voir schema.sql › void_ts).
 *
 * GET  /api/past-sales?merchant=…   → { days: [{ day, method, totalCents, lines, tickets }], firstTillDay, cutoff, zone }
 * POST /api/past-sales  { merchant, method, days: [{ day, lines: [{ name, qty, unitCents, cat? }] }] }
 *      (ou { merchant, day, method, lines } pour un seul jour) ; lines vide = retirer ce jour.
 *      Tout est vérifié avant la première écriture, et tout s'écrit d'un bloc.
 *
 * TICKETS (27 nov. 2026, Jon's Burgers : « ses tickets d'avant, un par un ») :
 * POST /api/past-sales  { merchant, kind: 'tickets', days: [{ day, tickets: [
 *        { ref, at: 'AAAA-MM-JJ HH:MM', method, totalCents, lines?: [{ name, qty, unitCents, cat? }] } ] }] }
 *      Une ligne de ventes par ticket, à son heure (heure murale de
 *      l'établissement), son numéro d'origine dans ref (« HIST-T-… ») : le
 *      nombre de ventes et le panier moyen d'avant Kiwi deviennent justes. Un
 *      jour importé en tickets remplace ce jour, quelle que soit la saisie
 *      d'avant (grille ou tickets) ; mêmes règles de jours que ci-dessus.
 * ─────────────────────────────────────────────────────────────────────────── */
import { isOperator, json } from '../auth/_lib.js';
import { ownerMerchant, storeOperationalState } from './_private.js';
import {
  addBusinessDays, businessBoundary, businessDate, merchantCutoff, merchantZone,
} from './_business-day.js';

export const PAST_CHANNEL = 'historique';
export const PAST_LABEL = 'Ventes antérieures';
const METHODS = new Set(['cash', 'card', 'other']);
/* Un ticket importé garde son vrai moyen de paiement quand le fichier le dit. */
const TICKET_METHODS = new Set(['cash', 'card', 'transfer', 'cheque', 'other']);
const MAX_TICKETS = 400;        // par envoi : l'écran découpe un gros fichier
const MAX_TICKET_DAYS = 31;
const PER_INSERT = 12;          // 8 valeurs par ticket, D1 en accepte 100 par requête
const MAX_LINES = 400;          // une carte entière, par jour
const PER_ROW = 40;             // le plafond de lignes d'une vente (sale.js)
const MAX_QTY = 100000;
const MAX_UNIT_CENTS = 10000000;          // 100 000 MAD l'article
const MAX_DAY_CENTS = 1000000000;         // 10 000 000 MAD la journée
const MAX_BACK_DAYS = 731;                // deux ans
const MAX_DAYS = 92;                      // un trimestre par envoi

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const validDay = (d) => DAY_RE.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const prefix = (merchant) => 'hist:' + merchant + ':';
const rowId = (merchant, day, k) => prefix(merchant) + day + ':' + k;

export async function authorise(request, env, asked, write) {
  asked = String(asked == null ? '' : asked).slice(0, 64).trim();
  if (!asked) return '';
  const owner = await ownerMerchant(request, env, asked, write ? { strict: true } : undefined);
  if (owner) return owner;
  let operator = false;
  try { operator = await isOperator(request, env); } catch (_) { operator = false; }
  if (!operator) return '';
  if (write) {
    const state = await storeOperationalState(env, asked);
    if (!state.ok || state.suspended) return '';
  }
  return asked;
}

/* Le premier jour commercial où la caisse (ou l'app serveur, ou OrderPro) a
   encaissé une vente vivante : rien à partir de lui ne s'écrit ici. */
export async function firstTillDay(env, merchant, cutoff, zone) {
  const row = await env.DB.prepare(
    `SELECT MIN(ts) AS ts FROM sales WHERE merchant = ? AND void_ts IS NULL AND NOT (id LIKE 'hist:%' AND channel = '${PAST_CHANNEL}' AND written_by = 'account')`
  ).bind(merchant).first();
  const ts = row && Number(row.ts);
  return ts > 0 ? businessDate(ts, cutoff, zone) : '';
}

function cleanLines(raw) {
  if (!Array.isArray(raw)) return { error: 'lines' };
  if (raw.length > MAX_LINES) return { error: 'too-many-lines' };
  const merged = new Map();
  for (const l of raw) {
    const name = String(l && l.name != null ? l.name : '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const qty = Number(l && l.qty);
    const unit = Number(l && l.unitCents);
    if (!name) return { error: 'line-name' };
    if (!Number.isFinite(qty) || qty < 0 || qty > MAX_QTY || Math.round(qty * 1000) !== qty * 1000) return { error: 'line-qty', name };
    if (!Number.isSafeInteger(unit) || unit < 0 || unit > MAX_UNIT_CENTS) return { error: 'line-price', name };
    if (!qty) continue;
    const cat = String(l && l.cat != null ? l.cat : '').trim().slice(0, 40);
    const key = name.toLowerCase() + '\u0000' + unit;
    const prev = merged.get(key);
    if (prev) prev.qty = Math.round((prev.qty + qty) * 1000) / 1000;
    else merged.set(key, { name, qty, unit, cat });
  }
  const lines = [...merged.values()].map((l) => ({ ...l, cents: Math.round(l.qty * l.unit) }));
  const total = lines.reduce((s, l) => s + l.cents, 0);
  if (total > MAX_DAY_CENTS) return { error: 'day-too-large' };
  return { lines, total };
}

function readRows(rows) {
  const days = new Map();
  for (const r of rows) {
    const m = /^hist:.+:(\d{4}-\d{2}-\d{2}):\d+$/.exec(String(r.id || ''));
    if (!m) continue;
    const d = days.get(m[1]) || { day: m[1], method: r.method, totalCents: 0, lines: [], tickets: 0 };
    d.totalCents += Number(r.amount_cents) || 0;
    if (d.method !== r.method) d.method = 'mixed';
    if (/^HIST-T-/.test(String(r.ref || ''))) d.tickets++;
    try {
      for (const l of JSON.parse(r.lines || '[]')) {
        d.lines.push({ name: l.n, qty: l.q, totalCents: Math.round((Number(l.t) || 0) * 100), cat: l.c || '' });
      }
    } catch (_) { /* une ligne illisible n'efface pas le total du jour */ }
    days.set(m[1], d);
  }
  return [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = await authorise(request, env, url.searchParams.get('merchant'), false);
  if (!merchant) return json({ error: 'forbidden' }, 403);
  const [cutoff, zone] = await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]);
  const { results } = await env.DB.prepare(
    `SELECT id, method, amount_cents, lines, ref FROM sales WHERE merchant = ? AND id LIKE ? AND channel = '${PAST_CHANNEL}' AND written_by = 'account' AND void_ts IS NULL ORDER BY id`
  ).bind(merchant, prefix(merchant) + '%').all();
  return json({
    ok: true,
    days: readRows(results || []),
    firstTillDay: await firstTillDay(env, merchant, cutoff, zone),
    today: businessDate(Date.now(), cutoff, zone),
    cutoff, zone,
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await authorise(request, env, b && b.merchant, true);
  if (!merchant) return json({ error: 'forbidden' }, 403);

  if (b && b.kind === 'tickets') return postTickets(env, merchant, b);
  const method = METHODS.has(String(b && b.method)) ? String(b.method) : 'cash';
  const asked = Array.isArray(b && b.days) ? b.days : [{ day: b && b.day, lines: b && b.lines }];
  if (!asked.length || asked.length > MAX_DAYS) return json({ error: 'days' }, 400);

  const [cutoff, zone] = await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]);
  const today = businessDate(Date.now(), cutoff, zone);
  const first = await firstTillDay(env, merchant, cutoff, zone);
  const plan = [], seen = new Set();
  for (const entry of asked) {
    const day = String(entry && entry.day || '');
    if (!validDay(day)) return json({ error: 'day', day }, 400);
    if (seen.has(day)) return json({ error: 'day-twice', day }, 400);
    seen.add(day);
    const refused = dayRefusal(day, today, first);
    if (refused) return refused;
    const clean = cleanLines(entry && entry.lines);
    if (clean.error) return json({ error: clean.error, day, name: clean.name || undefined }, 400);
    plan.push({ day, ...clean });
  }

  const now = Date.now();
  const statements = [];
  for (const { day, lines } of plan) {
    statements.push(...dayStatements(env, merchant, day, lines, method, now, businessBoundary(day, cutoff, zone) + 7 * 3600000));
  }
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const s of statements) await s.run();

  return json({
    ok: true, method, days: plan.map((p) => ({ day: p.day, totalCents: p.total, lines: p.lines.length })),
    totalCents: plan.reduce((sum, p) => sum + p.total, 0),
  });
}

/* Un jour qu'aucune saisie d'avant Kiwi ne peut toucher : pas encore passé,
   plus vieux que deux ans, ou déjà tenu en caisse. */
export function dayRefusal(day, today, first) {
  if (day >= today) return json({ error: 'day-not-past', day, today }, 400);
  if (day < addBusinessDays(today, -MAX_BACK_DAYS)) return json({ error: 'day-too-old', day }, 400);
  if (first && day >= first) return json({ error: 'day-has-till-sales', day, firstTillDay: first }, 409);
  return null;
}

/* « AAAA-MM-JJ HH:MM[:SS] », heure murale de l'établissement → epoch ms.
   Minuit local (frontière à 0 h) plus l'heure du jour : un changement d'heure
   au milieu de la nuit décale au pire d'une heure un ticket de cette nuit-là. */
const WALL_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
export function wallEpoch(wall, zone) {
  const m = WALL_RE.exec(String(wall || '').trim());
  if (!m || !validDay(m[1]) || +m[2] > 23 || +m[3] > 59 || +(m[4] || 0) > 59) return NaN;
  return businessBoundary(m[1], 0, zone) + ((+m[2]) * 3600 + (+m[3]) * 60 + (+(m[4] || 0))) * 1000;
}

async function postTickets(env, merchant, b) {
  const asked = Array.isArray(b.days) ? b.days : [];
  if (!asked.length || asked.length > MAX_TICKET_DAYS) return json({ error: 'days' }, 400);
  const [cutoff, zone] = await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]);
  const today = businessDate(Date.now(), cutoff, zone);
  const first = await firstTillDay(env, merchant, cutoff, zone);
  const plan = [], seen = new Set();
  let count = 0;
  for (const entry of asked) {
    const day = String(entry && entry.day || '');
    if (!validDay(day)) return json({ error: 'day', day }, 400);
    if (seen.has(day)) return json({ error: 'day-twice', day }, 400);
    seen.add(day);
    const refused = dayRefusal(day, today, first);
    if (refused) return refused;
    const raw = Array.isArray(entry.tickets) ? entry.tickets : null;
    if (!raw || !raw.length) return json({ error: 'tickets', day }, 400);
    count += raw.length;
    if (count > MAX_TICKETS) return json({ error: 'too-many-tickets' }, 400);
    const noon = businessBoundary(day, cutoff, zone) + 7 * 3600000;
    const tickets = [];
    let dayTotal = 0;
    for (const t of raw) {
      const ref = String(t && t.ref != null ? t.ref : '').replace(/[^\w./#-]+/g, '').slice(0, 32);
      const total = Number(t && t.totalCents);
      if (!Number.isSafeInteger(total) || total < 0 || total > MAX_DAY_CENTS) return json({ error: 'ticket-total', day, ref }, 400);
      let ts = noon;
      if (t && t.at) {
        ts = wallEpoch(t.at, zone);
        if (!Number.isFinite(ts)) return json({ error: 'ticket-time', day, ref }, 400);
        if (businessDate(ts, cutoff, zone) !== day) return json({ error: 'ticket-day', day, ref }, 400);
      }
      const method = TICKET_METHODS.has(String(t && t.method)) ? String(t.method) : 'other';
      let lines = [];
      if (t && Array.isArray(t.lines) && t.lines.length) {
        const clean = cleanLines(t.lines.slice(0, PER_ROW));
        if (clean.error) return json({ error: clean.error, day, ref, name: clean.name || undefined }, 400);
        lines = clean.lines;
      }
      dayTotal += total;
      tickets.push({ ref, total, ts, method, lines });
    }
    if (dayTotal > MAX_DAY_CENTS) return json({ error: 'day-too-large', day }, 400);
    plan.push({ day, tickets, total: dayTotal });
  }

  const now = Date.now();
  const statements = [];
  for (const { day, tickets } of plan) {
    for (let i = 0; i < tickets.length; i += PER_INSERT) {
      const part = tickets.slice(i, i + PER_INSERT);
      const binds = [];
      part.forEach((t, j) => {
        const k = i + j;
        binds.push(rowId(merchant, day, k), merchant, Math.round(t.total / 100), t.total, t.method,
          'HIST-T-' + (t.ref || String(k + 1)), t.ts,
          t.lines.length ? JSON.stringify(t.lines.map((l) => (l.cat ? { n: l.name, q: l.qty, t: l.cents / 100, c: l.cat } : { n: l.name, q: l.qty, t: l.cents / 100 }))) : null);
      });
      statements.push(env.DB.prepare(
        `INSERT INTO sales (id, merchant, amount, amount_cents, method, ref, ts, lines, label, channel, written_by)
         VALUES ${part.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, '${PAST_LABEL}', '${PAST_CHANNEL}', 'account')`).join(', ')}
         ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, amount_cents = excluded.amount_cents,
           method = excluded.method, ref = excluded.ref, lines = excluded.lines, ts = excluded.ts,
           void_ts = NULL, void_reason = NULL, void_note = NULL, void_actor = NULL, void_actor_id = NULL
         WHERE sales.merchant = excluded.merchant AND sales.channel = '${PAST_CHANNEL}' AND sales.written_by = 'account'`
      ).bind(...binds));
    }
    statements.push(voidBeyond(env, merchant, day, tickets.length, now));
  }
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const s of statements) await s.run();
  return json({
    ok: true, kind: 'tickets', days: plan.map((p) => ({ day: p.day, totalCents: p.total, tickets: p.tickets.length })),
    totalCents: plan.reduce((sum, p) => sum + p.total, 0), tickets: count,
  });
}

/* Les écritures d'un jour : ses tranches de 40 lignes (ts = midi du jour),
   puis l'annulation des tranches d'une saisie précédente plus longue. */
function dayStatements(env, merchant, day, lines, method, now, ts) {
  const chunks = [];
  for (let i = 0; i < lines.length; i += PER_ROW) chunks.push(lines.slice(i, i + PER_ROW));
  const statements = chunks.map((chunk, k) => {
    const cents = chunk.reduce((s, l) => s + l.cents, 0);
    const lines = JSON.stringify(chunk.map((l) => {
      const o = { n: l.name, q: l.qty, t: l.cents / 100 };
      if (l.cat) o.c = l.cat;
      return o;
    }));
    return env.DB.prepare(
      `INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, written_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'account')
       ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, amount_cents = excluded.amount_cents,
         method = excluded.method, ref = excluded.ref, lines = excluded.lines, ts = excluded.ts,
         void_ts = NULL, void_reason = NULL, void_note = NULL, void_actor = NULL, void_actor_id = NULL
       WHERE sales.merchant = excluded.merchant AND sales.channel = '${PAST_CHANNEL}' AND sales.written_by = 'account'`
    ).bind(rowId(merchant, day, k), merchant, Math.round(cents / 100), cents, method, PAST_LABEL,
      'HIST-' + day.replace(/-/g, '') + (chunks.length > 1 ? '-' + (k + 1) : ''), ts, lines, PAST_CHANNEL);
  });
  /* Les tranches au-delà de la nouvelle saisie (un jour raccourci, ou vidé)
     sortent des chiffres ; la ligne reste. */
  statements.push(voidBeyond(env, merchant, day, chunks.length, now));
  return statements;
}
function voidBeyond(env, merchant, day, kept, now) {
  return env.DB.prepare(
    `UPDATE sales SET void_ts = ?, void_reason = 'autre', void_note = 'ventes antérieures remplacées', void_actor = 'proprietaire'
     WHERE merchant = ? AND id LIKE ? AND channel = '${PAST_CHANNEL}' AND written_by = 'account' AND void_ts IS NULL
       AND CAST(substr(id, ?) AS INTEGER) >= ?`
  ).bind(now, merchant, prefix(merchant) + day + ':%', prefix(merchant).length + day.length + 2, kept);
}
