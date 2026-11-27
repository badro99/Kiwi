/* ── SERVICES ET MOUVEMENTS DE CAISSE D'AVANT KIWI ───────────────────────────
 * Jon's Burgers, 27 nov. 2026 : « importer nos anciennes données : tickets,
 * entrées et sorties de caisse, services ». Les tickets passent par
 * /api/past-sales ; ici, les services (ouverture, fond de caisse, attendu,
 * compté, écart) et les entrées / sorties d'espèces.
 *
 * Ils s'écrivent dans cash_session_events, comme ceux d'une vraie caisse, sous
 * un poste qui n'existe pas : terminal_id = 'historique'. Aucune caisse ne lit
 * jamais que son propre poste (cash-sessions.js, lecture caisse), et
 * /api/cash-sessions refuse ce poste et le préfixe hist: à toute caisse : un
 * service importé ne peut ni rouvrir un tiroir, ni entrer dans un Z. Les
 * lectures du compte, elles, le voient : sorties dans les dépenses, services et
 * écarts dans les livres du comptable et le rapport du mois.
 *
 * Mêmes jours que les ventes antérieures : passés, deux ans au plus, et avant
 * le premier jour tenu sur Kiwi (première vente de caisse OU premier mouvement
 * d'un vrai tiroir). Un jour réimporté remplace tout ce que cet import avait
 * écrit ce jour-là ; un jour envoyé vide est retiré. Ce sont des lignes que
 * seul cet import a écrites (poste 'historique', id hist:<commerçant>:<jour>:…),
 * jamais celles d'une caisse.
 *
 * GET  /api/past-cash?merchant=…  → { days: [{ day, shifts, moves, inCents, outCents, gapCents }], firstLiveDay, cutoff, zone, today }
 * POST /api/past-cash { merchant, days: [{ day,
 *        shifts: [{ ref, open: 'AAAA-MM-JJ HH:MM', close?, openingCents, expectedCents?, countedCents?,
 *                   moves?: [{ at?, kind: 'in'|'out', cents, reason? }] }],
 *        moves:  [{ at, kind, cents, reason? }] }] }   ← mouvements hors service
 * ─────────────────────────────────────────────────────────────────────────── */
import { json } from '../auth/_lib.js';
import { authorise, dayRefusal, firstTillDay, validDay, wallEpoch } from './past-sales.js';
import { addBusinessDays, businessDate, merchantCutoff, merchantZone } from './_business-day.js';

export const PAST_TERMINAL = 'historique';
const ACTOR = 'historique';
const MAX_DAYS = 31;
const MAX_EVENTS = 600;           // par envoi : l'écran découpe un gros fichier
const MAX_CENTS = 1_000_000_000;
const MAX_SHIFT_MS = 48 * 3600000;
const PER_INSERT = 8;             // 12 valeurs par événement, D1 en accepte 100 par requête

const prefix = (merchant, day) => 'hist:' + merchant + ':' + day + ':';
const money = (v, nullable) => {
  if (v == null || v === '') return nullable ? null : NaN;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTS ? n : NaN;
};
const reasonText = (v, kind) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 80) || (kind === 'in' ? 'Entrée' : 'Sortie');

/* Premier jour tenu sur Kiwi : la première vente de caisse, ou le premier
   événement d'un vrai tiroir s'il est plus ancien. */
async function firstLiveDay(env, merchant, cutoff, zone) {
  const sale = await firstTillDay(env, merchant, cutoff, zone);
  let drawer = '';
  try {
    const row = await env.DB.prepare(
      'SELECT MIN(occurred_ts) AS ts FROM cash_session_events WHERE merchant = ? AND terminal_id <> ?'
    ).bind(merchant, PAST_TERMINAL).first();
    const ts = row && Number(row.ts);
    drawer = ts > 0 ? businessDate(ts, cutoff, zone) : '';
  } catch (_) { drawer = ''; }
  if (!sale) return drawer;
  if (!drawer) return sale;
  return sale < drawer ? sale : drawer;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = await authorise(request, env, url.searchParams.get('merchant'), false);
  if (!merchant) return json({ error: 'forbidden' }, 403);
  const [cutoff, zone] = await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]);
  const { results } = await env.DB.prepare(
    `SELECT id, event_type, gap_cents, movement_kind, movement_amount_cents FROM cash_session_events
      WHERE merchant = ? AND terminal_id = ? AND id LIKE ? ORDER BY occurred_ts`
  ).bind(merchant, PAST_TERMINAL, 'hist:' + merchant + ':%').all();
  const days = new Map();
  for (const r of results || []) {
    const m = /^hist:.+:(\d{4}-\d{2}-\d{2}):[^:]+:[^:]+$/.exec(String(r.id || ''));
    if (!m) continue;
    const d = days.get(m[1]) || { day: m[1], shifts: 0, moves: 0, inCents: 0, outCents: 0, gapCents: 0 };
    if (r.event_type === 'open') d.shifts++;
    else if (r.event_type === 'close') d.gapCents += Number(r.gap_cents) || 0;
    else if (r.event_type === 'movement') {
      d.moves++;
      if (r.movement_kind === 'in') d.inCents += Number(r.movement_amount_cents) || 0;
      else d.outCents += Number(r.movement_amount_cents) || 0;
    }
    days.set(m[1], d);
  }
  return json({
    ok: true, days: [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    firstLiveDay: await firstLiveDay(env, merchant, cutoff, zone),
    today: businessDate(Date.now(), cutoff, zone), cutoff, zone,
  });
}

function cleanMove(m, floor, ceil, zone) {
  const kind = m && m.kind === 'in' ? 'in' : m && m.kind === 'out' ? 'out' : '';
  if (!kind) return { error: 'move-kind' };
  const cents = money(m.cents);
  if (Number.isNaN(cents) || !cents) return { error: 'move-amount' };
  /* Sans heure (le total « sorties » d'un service), une minute après
     l'ouverture : jamais au même instant qu'elle, l'ordre des lectures reste
     ouverture, mouvements, clôture. */
  let ts = Math.min(floor + 60000, ceil);
  if (m.at) {
    ts = wallEpoch(m.at, zone);
    if (!Number.isFinite(ts) || ts < floor || ts > ceil) return { error: 'move-time' };
  }
  return { kind, cents, ts, reason: reasonText(m.reason, kind) };
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await authorise(request, env, b && b.merchant, true);
  if (!merchant) return json({ error: 'forbidden' }, 403);
  const asked = Array.isArray(b && b.days) ? b.days : [];
  if (!asked.length || asked.length > MAX_DAYS) return json({ error: 'days' }, 400);

  const [cutoff, zone] = await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]);
  const today = businessDate(Date.now(), cutoff, zone);
  const first = await firstLiveDay(env, merchant, cutoff, zone);
  const events = [], seen = new Set(), summary = [];
  for (const entry of asked) {
    const day = String(entry && entry.day || '');
    if (!validDay(day)) return json({ error: 'day', day }, 400);
    if (seen.has(day)) return json({ error: 'day-twice', day }, 400);
    seen.add(day);
    const refused = dayRefusal(day, today, first);
    if (refused) return refused;
    const pre = prefix(merchant, day);
    const dayStart = wallEpoch(day + ' 00:00', zone);
    const dayEnd = wallEpoch(addBusinessDays(day, 2) + ' 00:00', zone);
    const sum = { day, shifts: 0, moves: 0 };
    const shifts = Array.isArray(entry.shifts) ? entry.shifts : [];
    for (let i = 0; i < shifts.length; i++) {
      const s = shifts[i] || {};
      const ref = String(s.ref == null ? '' : s.ref).replace(/[^\w./#-]+/g, '').slice(0, 24);
      const open = wallEpoch(s.open, zone);
      if (!Number.isFinite(open) || businessDate(open, cutoff, zone) !== day) return json({ error: 'shift-open', day, ref }, 400);
      let close = null;
      if (s.close) {
        close = wallEpoch(s.close, zone);
        if (!Number.isFinite(close) || close < open || close - open > MAX_SHIFT_MS) return json({ error: 'shift-close', day, ref }, 400);
      }
      const opening = money(s.openingCents, true);
      const expected = money(s.expectedCents, true);
      const counted = money(s.countedCents, true);
      if ([opening, expected, counted].some(Number.isNaN)) return json({ error: 'shift-amount', day, ref }, 400);
      const session = 'hist:' + day + ':s' + i;
      const base = { session, opened: open };
      events.push({ ...base, id: pre + 's' + i + ':open', type: 'open', expected: opening == null ? 0 : opening, at: open });
      const moves = Array.isArray(s.moves) ? s.moves : [];
      for (let j = 0; j < moves.length; j++) {
        const mv = cleanMove(moves[j], open, close == null ? open + MAX_SHIFT_MS : close, zone);
        if (mv.error) return json({ error: mv.error, day, ref }, 400);
        events.push({ ...base, id: pre + 's' + i + ':m' + j, type: 'movement', kind: mv.kind, amount: mv.cents, reason: mv.reason, at: mv.ts });
        sum.moves++;
      }
      if (close != null) {
        const gap = expected != null && counted != null ? counted - expected : null;
        events.push({ ...base, id: pre + 's' + i + ':close', type: 'close', expected, counted, gap, at: close });
      }
      sum.shifts++;
    }
    const loose = Array.isArray(entry.moves) ? entry.moves : [];
    for (let j = 0; j < loose.length; j++) {
      const mv = cleanMove(loose[j], dayStart, dayEnd, zone);
      if (mv.error) return json({ error: mv.error, day }, 400);
      if (businessDate(mv.ts, cutoff, zone) !== day) return json({ error: 'move-day', day }, 400);
      events.push({ session: 'hist:' + day + ':d', opened: mv.ts, id: pre + 'd:m' + j, type: 'movement', kind: mv.kind, amount: mv.cents, reason: mv.reason, at: mv.ts });
      sum.moves++;
    }
    if (events.length > MAX_EVENTS) return json({ error: 'too-many-events' }, 400);
    summary.push(sum);
  }

  const statements = [];
  for (const day of seen) {
    statements.push(env.DB.prepare(
      'DELETE FROM cash_session_events WHERE merchant = ? AND terminal_id = ? AND id LIKE ?'
    ).bind(merchant, PAST_TERMINAL, prefix(merchant, day) + '%'));
  }
  for (let i = 0; i < events.length; i += PER_INSERT) {
    const part = events.slice(i, i + PER_INSERT);
    const binds = [];
    for (const e of part) {
      binds.push(e.id, merchant, e.session, e.type,
        e.expected == null ? null : e.expected, e.counted == null ? null : e.counted, e.gap == null ? null : e.gap,
        e.kind || null, e.amount == null ? null : e.amount, e.reason || null, e.opened, e.at);
    }
    statements.push(env.DB.prepare(
      `INSERT INTO cash_session_events (id, merchant, session_id, event_type, expected_cents, counted_cents, gap_cents,
         movement_kind, movement_amount_cents, movement_reason, opened_ts, occurred_ts, terminal_id, actor_id)
       VALUES ${part.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '${PAST_TERMINAL}', '${ACTOR}')`).join(', ')}`
    ).bind(...binds));
  }
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const s of statements) await s.run();
  return json({ ok: true, days: summary, events: events.length });
}
