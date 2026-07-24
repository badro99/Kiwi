// GET /api/admin/clients — operator roster.
//
// One row per STORE: today's sales total + count + last-sale time (from the
// `sales` table), the plan and business type (from `merchant_config`), and the
// account contact. Stores are the union of everything that appears in sales,
// config, or accounts — so a brand-new account with no sales still shows, and a
// merchant selling without an account still shows. Operator-gated.
//
// A store is NOT the same thing as a client. One login can hold several
// établissements — a boutique and a restaurant — and each is its own store with
// its own slug, till, staff and money. So every row also carries who owns it:
//   owner       — the account's email, the key the console groups rows by
//   owner_name  — the contact's name
//   owner_business — the account's own établissement name
//   primary     — true when this store is the one the account signed up with
// Two stores of the same client share an `owner` and are drawn under one card;
// a store with no owner is a demo. Ownership comes from merchant_config
// .account_id (the store registry, claimed at sync time), with the historical
// slug match on accounts.business kept for the primary store so nothing that
// worked before the registry stops working now.

import { isOperator, slugMerchant, json } from '../../auth/_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);

  // Start of "today" in the server's clock (UTC on Workers). Good enough for a
  // pilot; the console shows the day's running tally, not an accounting close.
  const now = Date.now();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  const map = new Map(); // merchant slug → row
  function row(m) {
    let r = map.get(m);
    // demo:true until an account claims this merchant (see the accounts loop).
    // A merchant that only ever appears via demo sales / config is a demo.
    if (!r) {
      r = { merchant: m, business: '', email: '', name: '', plan: '', type: '',
            today_amount: 0, today_count: 0, last_ts: 0, demo: true, status: 'active',
            owner: '', owner_name: '', owner_business: '', primary: false };
      map.set(m, r);
    }
    return r;
  }

  try {
    // Sales aggregate per merchant.
    const sales = await env.DB.prepare(
      `SELECT merchant,
              COALESCE(SUM(CASE WHEN ts >= ? THEN amount ELSE 0 END), 0) AS today_amount,
              COALESCE(SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END), 0)      AS today_count,
              MAX(ts) AS last_ts
       FROM sales GROUP BY merchant`
    ).bind(dayStart, dayStart).all();
    for (const s of (sales.results || [])) {
      const r = row(s.merchant);
      r.today_amount = s.today_amount || 0;
      r.today_count = s.today_count || 0;
      r.last_ts = s.last_ts || 0;
    }

    // Plans / config (incl. the business type that drives the console's module
    // set, plus the store registry: who owns this slug, and what the store calls
    // itself). A database that hasn't run the registry ALTERs yet has neither
    // account_id nor name, so the query is retried without them — the roster then
    // behaves exactly as it did before, one row per slug with no grouping.
    const ownerOf = new Map(); // merchant slug → accounts.id
    let cfg;
    try {
      cfg = await env.DB.prepare(`SELECT merchant, plan, type, account_id, name FROM merchant_config`).all();
    } catch (_) {
      cfg = await env.DB.prepare(`SELECT merchant, plan, type FROM merchant_config`).all();
    }
    for (const c of (cfg.results || [])) {
      const r = row(c.merchant);
      r.plan = c.plan || '';
      r.type = c.type || '';
      if (c.name) r.business = c.name;              // the store's own name
      if (c.account_id) ownerOf.set(c.merchant, c.account_id);
    }

    // Accounts → contact + ensure a row exists even with zero sales.
    const accts = await env.DB.prepare(`SELECT id, email, name, business, status FROM accounts`).all();
    const byId = new Map();
    for (const a of (accts.results || [])) {
      byId.set(a.id, a);
      // The store the account signed up with. Matched by slug rather than through
      // the registry, so an account that has never synced still lands on its own
      // row — this is the pre-registry behaviour, kept.
      const m = slugMerchant(a.business || a.email);
      const r = row(m);
      r.business = a.business || r.business;
      r.primary = true;
      ownerOf.set(m, a.id);
    }

    // Attach the owner to every store, primary or not. This is what turns a flat
    // list of slugs into a list of CLIENTS: two stores of the same merchant now
    // carry the same `owner`, and a store with no owner stays a demo.
    for (const [m, aid] of ownerOf) {
      const a = byId.get(aid);
      if (!a) continue;                              // account deleted, store orphaned
      const r = row(m);
      r.owner = a.email || '';
      r.owner_name = a.name || '';
      r.owner_business = a.business || '';
      r.email = a.email || r.email;
      r.name = a.name || r.name;
      r.status = a.status || 'active'; // active | suspended (frozen for non-payment)
      r.demo = false; // real email+password signup → a real client
      if (!r.business) r.business = a.business || '';
    }
  } catch (e) {
    return json({ error: 'query-failed', detail: String(e) }, 500);
  }

  const clients = [...map.values()].sort((a, b) => (b.last_ts || 0) - (a.last_ts || 0));
  return json({ clients, dayStart, now });
}

// PATCH /api/admin/clients — freeze or reactivate an account.
// Body { email, status:'active'|'suspended' }. Suspending flips accounts.status;
// the site gate then revokes the client's live session on their next request
// (see accountActive in _middleware.js) WITHOUT deleting any data, so a client
// who stops paying is locked out instantly and can be thawed the moment they do.
// Keyed by email (the account's unique login key). Irreversible? No — that's the
// point vs. delete. Operator-gated.
export async function onRequestPatch(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);

  let email = '';
  let status = '';
  try {
    const b = await request.json();
    email = (b.email || '').toString().trim().toLowerCase();
    status = (b.status || '').toString().trim();
  } catch (_) { /* no body */ }
  if (!email) return json({ error: 'email-required' }, 400);
  if (status !== 'active' && status !== 'suspended') return json({ error: 'bad-status' }, 400);

  try {
    const r = await env.DB.prepare('UPDATE accounts SET status = ? WHERE email = ?').bind(status, email).run();
    if (!((r.meta && r.meta.changes) || 0)) return json({ error: 'not-found' }, 404);
  } catch (e) {
    return json({ error: 'update-failed', detail: String(e) }, 500);
  }
  return json({ ok: true, email, status });
}

// DELETE /api/admin/clients?merchant=slug[&email=…] — nuke an entire account so
// the operator can start it fresh. Removes, in one shot:
//   · the login row              (accounts, matched by email — the unique key)
//   · all sales                  (sales     WHERE merchant = slug)
//   · all staff PINs             (staff_pins WHERE merchant = slug)
//   · the feature/plan config    (merchant_config WHERE merchant = slug)
//   · every OTHER store the account owns — same three wipes per store, so a
//     client with a boutique and a restaurant is cleared whole rather than
//     leaving the second shop trading with nobody attached to it
// merchant (the slug the roster already computed) drives the merchant-keyed
// wipes; email removes the account itself and finds its other stores. Either
// alone is accepted — a demo with no account is cleared by merchant only; an
// orphan account with a renamed business is cleared by email only. Irreversible;
// operator-gated. The console's type-the-name confirmation is the guard against
// an accidental call.
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);

  const url = new URL(request.url);
  let merchant = (url.searchParams.get('merchant') || '').trim();
  let email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!merchant && !email) {
    try {
      const b = await request.json();
      merchant = (b.merchant || '').toString().trim();
      email = (b.email || '').toString().trim().toLowerCase();
    } catch (_) { /* no body */ }
  }
  if (!merchant && !email) return json({ error: 'merchant-or-email-required' }, 400);

  const deleted = { sales: 0, pins: 0, config: 0, account: 0, stores: 0 };
  async function wipeStore(slug) {
    const s = await env.DB.prepare(`DELETE FROM sales WHERE merchant = ?`).bind(slug).run();
    const p = await env.DB.prepare(`DELETE FROM staff_pins WHERE merchant = ?`).bind(slug).run();
    const c = await env.DB.prepare(`DELETE FROM merchant_config WHERE merchant = ?`).bind(slug).run();
    deleted.sales += (s.meta && s.meta.changes) || 0;
    deleted.pins += (p.meta && p.meta.changes) || 0;
    deleted.config += (c.meta && c.meta.changes) || 0;
    deleted.stores += 1;
  }

  try {
    if (merchant) await wipeStore(merchant);
    if (email) {
      // A client can hold several établissements. Wiping only the slug the console
      // had selected would leave the second shop behind — still in the roster,
      // still trading, now with no owner to attach it to. Take every store the
      // registry says this account owns. Pre-migration this finds nothing and the
      // single-store wipe above stands on its own.
      try {
        const acc = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first();
        if (acc && acc.id) {
          const owned = await env.DB.prepare('SELECT merchant FROM merchant_config WHERE account_id = ?')
            .bind(acc.id).all();
          for (const s of (owned.results || [])) {
            if (s.merchant && s.merchant !== merchant) await wipeStore(s.merchant);
          }
        }
      } catch (_) { /* no registry column → nothing extra to clean */ }
    }
    if (email) {
      const a = await env.DB.prepare(`DELETE FROM accounts WHERE email = ?`).bind(email).run();
      deleted.account = (a.meta && a.meta.changes) || 0;
    }
  } catch (e) {
    return json({ error: 'delete-failed', detail: String(e) }, 500);
  }
  return json({ ok: true, merchant, email, deleted });
}
