// GET /api/me — the identity the dashboard should show for THIS viewer.
//
// Two callers, both server-authoritative (never trust a query param on its own):
//
//   1. The operator (God mode) scoped into a client via ?merchant=slug. This
//      cross-account read is unlocked ONLY by a valid operator cookie (kiwi_op /
//      staff gate); a caller without one gets nothing back for the param and
//      falls through to case 2. Returns the scoped client's identity + business
//      type so the dashboard can show THAT client (not the demo "Rachid" /
//      "Café Atlas"), with operator:true so the client-side knows it's a God-mode
//      view. authenticated reflects whether an account exists for the slug yet.
//
//   2. A real merchant, signed in with their own session cookie. The account is
//      derived from the signed cookie only, so a caller can only ever read
//      themselves → { authenticated:true, scoped:false, name, business, email }.
//
// Case 1 is checked FIRST: the operator console is opened from a browser that is
// usually also signed in as a merchant, and with the session first that account
// answered every scoped request — see the note at the branch.
//
// Anything else → { authenticated:false } and the caller leaves the demo identity
// in place. No DB / not configured (static host) ⇒ also false. Never cached.
//
// For a signed-in merchant the answer also carries `onboarded` + `stores` — the
// question the setup wizard has to ask and could not (see establishments below).

import { json, readSession, readCookie, SESS_COOKIE, isOperator, slugMerchant } from '../auth/_lib.js';

/* One store row, on a database that may not have run the registry ALTERs.
 * `name` and `account_id` were added to merchant_config later (see schema.sql);
 * where they don't exist the rich SELECT throws, so fall back to the columns
 * that have always been there rather than losing the row entirely. */
async function storeRow(env, slug) {
  try {
    return await env.DB.prepare('SELECT merchant, name, type FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
  } catch (_) { /* no `name` column on this database */ }
  try {
    return await env.DB.prepare('SELECT merchant, type FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
  } catch (_) { return null; }
}

/* Does this account already have a business, and which stores does it own?
 *
 * This is the only question the setup wizard needs answered, and until now
 * nothing on the server could answer it: the wizard read a localStorage flag, so
 * an established merchant on a new device, in another browser, in a private
 * window or after clearing site data was taken for a brand-new signup and asked
 * to create their shop a second time.
 *
 * Derived from rows that already exist — no new column, no migration — with each
 * probe guarded on its own so a pre-registry database degrades instead of
 * failing. The evidence, strongest first:
 *
 *   1. merchant_config.account_id = <account>  — the store registry. Written when
 *      the merchant's own app syncs a store (api/config.js → claimStore) or when
 *      an operator attaches one to a client. Absent before the ALTERs.
 *   2. merchant_config.merchant = <account slug>  — how a single store was keyed
 *      before the registry existed, and still where a one-shop merchant lives.
 *   3. staff_pins  — the wizard's mandatory output: it cannot be finished without
 *      the owner's own 4-digit code, and finishing syncs the set up.
 *   4. sales  — they have actually traded. Whatever the config says, a shop with
 *      takings is not a shop waiting to be created.
 *
 * A row at the account slug that carries NO owner and has neither PINs nor sales
 * is an operator-PREPARED shell (api/admin/config.js inserts one without an
 * account_id). It is listed as a store, but deliberately does NOT count as
 * onboarded — the merchant it was prepared for has still set nothing up, and has
 * to reach the wizard.
 *
 * Never throws. A database that is missing, unreachable or unmigrated answers
 * { onboarded:false, stores:[] }, which lands the client back on exactly today's
 * local behaviour rather than acting on a guess. */
async function establishments(env, aid, slug) {
  const out = { onboarded: false, stores: [] };
  const seen = new Set();
  const push = (r) => {
    const m = r && String(r.merchant || '').trim();
    if (!m || seen.has(m)) return;
    seen.add(m);
    out.stores.push({ merchant: m, name: String(r.name || ''), type: String(r.type || '') });
  };

  try {
    const rs = await env.DB.prepare(
      'SELECT merchant, name, type FROM merchant_config WHERE account_id = ?').bind(aid).all();
    for (const r of (rs.results || [])) { push(r); out.onboarded = true; }
  } catch (_) { /* registry not migrated → judge from the evidence below */ }

  if (!slug) return out;

  const own = await storeRow(env, slug);
  if (own) push(own);

  if (!out.onboarded) {
    try {
      const pin = await env.DB.prepare('SELECT 1 AS x FROM staff_pins WHERE merchant = ? LIMIT 1')
        .bind(slug).first();
      if (pin) out.onboarded = true;
    } catch (_) { /* table missing → no evidence either way */ }
  }
  if (!out.onboarded) {
    try {
      const sale = await env.DB.prepare('SELECT 1 AS x FROM sales WHERE merchant = ? LIMIT 1')
        .bind(slug).first();
      if (sale) out.onboarded = true;
    } catch (_) { /* ditto */ }
  }
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ authenticated: false });

  // 1) Operator (God mode) scoped into a client via ?merchant=slug.
  //
  // Checked BEFORE the account session on purpose. The console is opened from a
  // browser that is normally ALSO signed in as a merchant — the site gate admits
  // real accounts, and that is how the operator reaches the app at all — so with
  // the session first that account answered every scoped request: "Ouvrir
  // dashboard" on ANY client rendered the operator's own store, name, trade and
  // venue, whichever client had been picked.
  //
  // Ordering only, not a widening: isOperator() is a signed cookie (kiwi_op /
  // staff gate), so a plain merchant sending ?merchant=<someone-else> still fails
  // here, falls through to step 2, and can still only ever read itself.
  const url = new URL(request.url);
  const scopedSlug = (url.searchParams.get('merchant') || '').trim();
  if (scopedSlug && await isOperator(request, env)) {
    let acc = null;
    try {
      // Accounts are keyed by id/email; the roster maps them to merchants by
      // slugifying the business name (same convention as clients.js), so match
      // the requested slug the same way.
      const rs = await env.DB.prepare('SELECT name, business, email FROM accounts').all();
      for (const a of (rs.results || [])) {
        if (slugMerchant(a.business || a.email) === scopedSlug) { acc = a; break; }
      }
    } catch (_) { /* ignore — treated as no account yet */ }
    let type = '';
    try {
      const c = await env.DB.prepare('SELECT type FROM merchant_config WHERE merchant = ?')
        .bind(scopedSlug).first();
      type = (c && c.type) || '';
    } catch (_) { /* ignore */ }
    return json({
      authenticated: !!acc, operator: true, scoped: true, slug: scopedSlug, type,
      name: (acc && acc.name) || '', business: (acc && acc.business) || '', email: (acc && acc.email) || '',
    });
  }

  // 2) Real merchant session — can only ever read itself.
  const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
  if (sess && sess.aid) {
    let acc = null;
    try {
      acc = await env.DB.prepare('SELECT name, business, email FROM accounts WHERE id = ?')
        .bind(sess.aid).first();
    } catch (_) { /* table missing / db error → fall through to demo */ }
    if (acc) {
      // Which établissements this account owns, and whether it has ever set one
      // up. Server-authoritative, so the wizard stops guessing from localStorage.
      const slug = slugMerchant(acc.business || acc.email);
      const est = await establishments(env, sess.aid, slug);
      // The business subtype (boutique|restaurant|…) the operator/onboarding stored
      // for THIS merchant, keyed by its own slug — same convention the config/roster
      // use. The dashboard applies it so a boutique is never rendered as a restaurant
      // (the empty "own" venue synthesized at boot defaults to restaurant otherwise).
      const ownStore = est.stores.find((s) => s.merchant === slug);
      const type = (ownStore && ownStore.type) || '';
      return json({
        authenticated: true, scoped: false, type,
        name: acc.name || '', business: acc.business || '', email: acc.email || '',
        onboarded: est.onboarded, stores: est.stores,
      });
    }
  }

  return json({ authenticated: false });
}
