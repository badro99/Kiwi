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

import { isOperator, isSeniorOperator, slugMerchant, json } from '../../auth/_lib.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);

  /* La console apprend ici son propre niveau de droits. Les gestes sensibles —
     sortir une vente des livres, corriger une adresse de connexion, envoyer une
     réinitialisation — exigent un CODE OPÉRATEUR nommé, pas le laissez-passer
     d'équipe partagé (auth/_lib.js › isSeniorOperator). Le savoir dès le
     chargement permet d'expliquer pourquoi un bouton est fermé, au lieu de le
     griser sans raison ou de laisser découvrir un 403 après avoir tout saisi. */
  const senior = await isSeniorOperator(request, env);

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
  return json({ clients, dayStart, now, senior, mail: !!env.MAIL_WEBHOOK });
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
  if (!(await isSeniorOperator(request, env))) {
    return json({ error: 'operator-code-required' }, 403);
  }

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

// DELETE is intentionally unavailable. The former implementation deleted only
// accounts, sales, PINs and merchant_config while leaving other client-owned
// records behind. Suspension is the production-safe reversible control until a
// complete, transactional deletion inventory and verification report exist.
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);
  if (!(await isSeniorOperator(request, env))) {
    return json({ error: 'operator-code-required' }, 403);
  }

  /* Disabled until the deletion workflow covers every merchant-owned table and
   * can complete transactionally. The previous route removed the account,
   * sales, PINs and config but left store_docs, clients, catalogs, orders and
   * device data behind. Claiming "permanent deletion" while those records can
   * be resurrected is worse than offering no destructive button at all. */
  return json({
    error: 'account-deletion-disabled',
    detail: 'Use suspension while complete deletion and verification are being implemented.',
  }, 423);
}
