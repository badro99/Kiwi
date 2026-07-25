// GET /api/feed?merchant=<id>&since=<cursor> — real sales after a cursor.
//
// The dashboard polls this every few seconds; `since` is the last rowid it saw,
// so each poll returns only new sales. SQLite's implicit rowid is a monotonic
// cursor — cheap and reliable. Behind the passcode gate like /api/sale.
//
// ── TENANT SCOPING (why ?merchant= is not trusted) ───────────────────────────
// The site gate admits every signed-in merchant AND the shared staff passcode,
// so "past the gate" is not "entitled to this store's data". Honouring a
// client-supplied ?merchant= therefore let ANY account read ANY other account's
// full sales feed just by knowing its slug (slugs are derived from the business
// name, so they are guessable). It also meant a dashboard whose identity had not
// resolved yet — falling back to a stale kiwiLiveMerchant a previous account left
// in the same browser — silently ingested the PREVIOUS merchant's sales into the
// new merchant's KPIs. Both are fixed the same way: the server decides.
//
//   · account session  → ALWAYS that account's own slug; ?merchant= is ignored.
//   · operator (God mode, kiwi_op) → ?merchant= is honoured, that is the point.
//   · neither (pitch demo on the staff passcode) → only the demo tenant.
//
// An empty/unknown merchant returns an empty feed. It must NEVER fall back to a
// shared literal bucket ('default'), which two different unresolved stores would
// both read and write — a cross-tenant channel by construction.

import { json, readSession, readCookie, SESS_COOKIE, slugMerchant, isOperator } from '../auth/_lib.js';

// The only tenant a gate-only (no account) caller may read: the pitch demo.
const DEMO_MERCHANTS = { 'cafe-atlas': 1 };

// The slug this request is entitled to, or '' when it is entitled to nothing.
async function scopeMerchant(request, env, asked) {
  // No auth configured at all (local static server / GitHub Pages) → this whole
  // gate is inert, so keep the historical behaviour and serve what was asked.
  if (!env.AUTH_SECRET) return asked;

  try {
    const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (sess && sess.aid) {
      const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
      // A signed-in merchant only ever reads itself — no matter what it asked for.
      if (acc && acc.business) return slugMerchant(acc.business);
      return '';
    }
  } catch (_) { /* fall through to the operator / demo paths */ }

  if (await isOperator(request, env)) return asked;
  return DEMO_MERCHANTS[asked] ? asked : '';
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ sales: [], cursor: 0 });

  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const since = Number(url.searchParams.get('since')) || 0;

  const merchant = await scopeMerchant(request, env, asked);
  if (!merchant) return json({ sales: [], cursor: since });

  let rows = [];
  try {
    const rs = await env.DB.prepare(
      'SELECT rowid AS cursor, id, amount, method, label, ref, ts, lines ' +
      'FROM sales WHERE merchant = ? AND rowid > ? ORDER BY rowid ASC LIMIT 50'
    ).bind(merchant, since).all();
    rows = (rs && rs.results) || [];
  } catch (e) {
    /* Older database, no `lines` column yet: serve the sales without the basket
     * rather than serve nothing. A dashboard that shows no revenue because a
     * migration has not run is a far worse failure than one that cannot rank
     * products yet. */
    if (String((e && e.message) || e).includes('lines')) {
      try {
        const rs = await env.DB.prepare(
          'SELECT rowid AS cursor, id, amount, method, label, ref, ts ' +
          'FROM sales WHERE merchant = ? AND rowid > ? ORDER BY rowid ASC LIMIT 50'
        ).bind(merchant, since).all();
        rows = (rs && rs.results) || [];
      } catch (_) {
        return json({ sales: [], cursor: since, error: 'db', detail: String(e && e.message || e) }, 500);
      }
    } else {
      return json({ sales: [], cursor: since, error: 'db', detail: String(e && e.message || e) }, 500);
    }
  }
  /* Hand the basket back as an array, in the shape the till sent it and the
   * dashboard's own journal already uses ({name, qty, total}). Parsing here
   * means no consumer has to know the column is JSON, and a corrupt row costs
   * that one basket instead of throwing the whole poll. */
  rows = rows.map((r) => {
    if (!r || r.lines == null) return r;
    try {
      const arr = JSON.parse(r.lines);
      r.lines = Array.isArray(arr)
        ? arr.map((l) => ({ name: l && l.n, qty: l && l.q, total: l && l.t }))
        : null;
    } catch (_) { r.lines = null; }
    return r;
  });

  const cursor = rows.length ? rows[rows.length - 1].cursor : since;
  return json({ sales: rows, cursor });
}
