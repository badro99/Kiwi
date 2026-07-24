// GET /api/me — the identity the dashboard should show for THIS viewer.
//
// Two callers, both server-authoritative (never trust a query param on its own):
//
//   1. A real merchant, signed in with their own session cookie. The account is
//      derived from the signed cookie only, so a caller can only ever read
//      themselves → { authenticated:true, scoped:false, name, business, email }.
//
//   2. The operator (God mode) scoped into a client via ?merchant=slug. This
//      cross-account read is unlocked ONLY by a valid operator cookie (kiwi_op /
//      staff gate); a plain merchant never reaches here (it returned in step 1)
//      and a client without an operator cookie gets nothing back for the param.
//      Returns the scoped client's identity + business type so the dashboard can
//      show THAT client (not the demo "Rachid" / "Café Atlas"), with operator:true
//      so the client-side knows it's a God-mode view. authenticated reflects
//      whether an account actually exists for the slug yet.
//
// Anything else → { authenticated:false } and the caller leaves the demo identity
// in place. No DB / not configured (static host) ⇒ also false. Never cached.

import { json, readSession, readCookie, SESS_COOKIE, isOperator, slugMerchant } from '../auth/_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ authenticated: false });

  // 1) Real merchant session — can only ever read itself.
  const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
  if (sess && sess.aid) {
    let acc = null;
    try {
      acc = await env.DB.prepare('SELECT name, business, email FROM accounts WHERE id = ?')
        .bind(sess.aid).first();
    } catch (_) { /* table missing / db error → fall through to demo */ }
    if (acc) {
      // The business subtype (boutique|restaurant|…) the operator/onboarding stored
      // for THIS merchant, keyed by its own slug — same convention the config/roster
      // use. The dashboard applies it so a boutique is never rendered as a restaurant
      // (the empty "own" venue synthesized at boot defaults to restaurant otherwise).
      let type = '';
      try {
        const slug = slugMerchant(acc.business || acc.email);
        const c = await env.DB.prepare('SELECT type FROM merchant_config WHERE merchant = ?')
          .bind(slug).first();
        type = (c && c.type) || '';
      } catch (_) { /* no config row yet → no type, dashboard keeps its default */ }
      return json({
        authenticated: true, scoped: false, type,
        name: acc.name || '', business: acc.business || '', email: acc.email || '',
      });
    }
  }

  // 2) Operator (God mode) scoped into a client via ?merchant=slug.
  const url = new URL(request.url);
  const slug = (url.searchParams.get('merchant') || '').trim();
  if (slug && await isOperator(request, env)) {
    let acc = null;
    try {
      // Accounts are keyed by id/email; the roster maps them to merchants by
      // slugifying the business name (same convention as clients.js), so match
      // the requested slug the same way.
      const rs = await env.DB.prepare('SELECT name, business, email FROM accounts').all();
      for (const a of (rs.results || [])) {
        if (slugMerchant(a.business || a.email) === slug) { acc = a; break; }
      }
    } catch (_) { /* ignore — treated as no account yet */ }
    let type = '';
    try {
      const c = await env.DB.prepare('SELECT type FROM merchant_config WHERE merchant = ?')
        .bind(slug).first();
      type = (c && c.type) || '';
    } catch (_) { /* ignore */ }
    return json({
      authenticated: !!acc, operator: true, scoped: true, slug, type,
      name: (acc && acc.name) || '', business: (acc && acc.business) || '', email: (acc && acc.email) || '',
    });
  }

  return json({ authenticated: false });
}
