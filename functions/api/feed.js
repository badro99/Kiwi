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
//   · account session  → the store it asked for when the registry confirms the
//     account owns it, otherwise that account's own slug. It used to be ALWAYS
//     the account slug, which is what leaked the boutique's sales into the
//     restaurant's Commandes — see entitledMerchant() in auth/_lib.js, which now
//     holds this rule for every endpoint that touches money.
//   · operator (God mode, kiwi_op) → ?merchant= is honoured, that is the point.
//   · neither (pitch demo on the staff passcode) → only the demo tenant.
//
// An empty/unknown merchant returns an empty feed. It must NEVER fall back to a
// shared literal bucket ('default'), which two different unresolved stores would
// both read and write — a cross-tenant channel by construction.

import {
  json, readSession, readCookie, SESS_COOKIE, slugMerchant, entitledMerchant,
} from '../auth/_lib.js';

/* ── THE PRE-SPLIT BUCKET ─────────────────────────────────────────────────────
 * Before stores had their own tenant, every sale an account rang up landed under
 * slugMerchant(accounts.business) whichever shop it came from. Scoping per store
 * is right going forward, but on its own it would open an empty history for the
 * merchant whose ONE shop is simply named differently from the business ("Cafe
 * Amira" the account, "Cafe Amira · Tanger" the store) — their whole till roll
 * would vanish from the dashboard the day this deploys.
 *
 * So a store ALSO reads the old account bucket when the account has exactly one
 * registered store: there is nowhere else those sales could have come from, so
 * nothing is being guessed. An account with SEVERAL stores gets the clean split
 * and its pre-split rows stay parked under the account slug — which shop rang
 * them up is genuinely unknowable, and inventing an answer would just recreate
 * the leak this fixes. Fails closed (no union) on any error. */
async function preSplitBucket(env, aid, merchant, accSlug) {
  if (!aid || !accSlug || merchant === accSlug) return '';
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM merchant_config WHERE account_id = ?'
    ).bind(aid).first();
    return (row && Number(row.n) === 1) ? accSlug : '';
  } catch (_) { return ''; }
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ sales: [], cursor: 0 });

  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const since = Number(url.searchParams.get('since')) || 0;

  const merchant = await entitledMerchant(request, env, asked);
  if (!merchant) return json({ sales: [], cursor: since, merchant: '' });

  /* Which buckets this store reads: its own, plus the account's pre-split one
   * when that is unambiguous. Binding `merchant` twice when there is no second
   * bucket keeps ONE query shape — an IN (?, ?) with a duplicate is exactly the
   * same result set as an equality test. */
  let legacy = '';
  try {
    const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (sess && sess.aid) {
      const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
      if (acc && acc.business) {
        legacy = await preSplitBucket(env, sess.aid, merchant, slugMerchant(acc.business));
      }
    }
  } catch (_) { /* no session (operator / demo) → own bucket only */ }

  let rows = [];
  try {
    const rs = await env.DB.prepare(
      'SELECT rowid AS cursor, id, amount, method, label, ref, ts, lines ' +
      'FROM sales WHERE merchant IN (?, ?) AND rowid > ? ORDER BY rowid ASC LIMIT 50'
    ).bind(merchant, legacy || merchant, since).all();
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
          'FROM sales WHERE merchant IN (?, ?) AND rowid > ? ORDER BY rowid ASC LIMIT 50'
        ).bind(merchant, legacy || merchant, since).all();
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
      /* `cat` n'est présent que sur les ventes écrites depuis que /api/sale
       * accepte la catégorie. Absent = inconnu, et le rapport journalier
       * repêche alors dans le catalogue actuel — jamais 'Divers' par défaut
       * ici, ce qui reviendrait à affirmer une classification qu'on n'a pas. */
      r.lines = Array.isArray(arr)
        ? arr.map((l) => ({ name: l && l.n, qty: l && l.q, total: l && l.t, cat: (l && l.c) || '' }))
        : null;
    } catch (_) { r.lines = null; }
    return r;
  });

  /* `merchant` is the tenant actually SERVED, which is not always the one asked
   * for — an unclaimed store still snaps back to the account slug. Reporting it
   * makes a mis-scoped feed visible from the outside instead of something you
   * have to infer from whose sales showed up. */
  const cursor = rows.length ? rows[rows.length - 1].cursor : since;
  return json({ sales: rows, cursor, merchant });
}
