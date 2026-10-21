// Which sales buckets a request may read for one store.
//
// Shared by /api/feed and /api/sales-summary so the two can never disagree on
// whose money they count. The store itself comes from entitledMerchant() in
// auth/_lib.js; this module only adds the account's pre-split bucket when that
// is unambiguous.

import { readSession, readCookie, SESS_COOKIE, accountSlug } from '../auth/_lib.js';

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
export async function preSplitBucket(env, aid, merchant, accSlug) {
  if (!aid || !accSlug || merchant === accSlug) return '';
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM merchant_config WHERE account_id = ?'
    ).bind(aid).first();
    return (row && Number(row.n) === 1) ? accSlug : '';
  } catch (_) { return ''; }
}

/* The second bucket for an already-entitled store, or '' (own bucket only).
 * No session (operator, demo, paired till) → own bucket only. */
export async function legacyBucketFor(request, env, merchant) {
  try {
    const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (sess && sess.aid) {
      const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
      if (acc && acc.business) {
        return await preSplitBucket(env, sess.aid, merchant, await accountSlug(env, acc.business, sess.aid));
      }
    }
  } catch (_) { /* fall through */ }
  return '';
}
