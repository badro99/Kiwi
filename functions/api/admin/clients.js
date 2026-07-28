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

import { isOperator, isSeniorOperator, slugMerchant, json, operatorActor } from '../../auth/_lib.js';

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
      r = { merchant: m, business: '', email: '', name: '', plan: '', type: '', city: '',
            today_amount: 0, today_count: 0, last_ts: 0, demo: true, status: 'active',
            /* `status` est l'état du COMPTE (accounts.status), partagé par toutes
             * les boutiques du même client. `store_status` est celui de CETTE
             * boutique-là (merchant_config.status). Les deux existent parce que
             * les deux gestes existent : couper l'accès d'un client, ou fermer
             * l'un de ses établissements en laissant l'autre ouvert. */
            store_status: 'active',
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
      // `city` est posée par l'opérateur (voir /api/admin/overview) : la console
      // la montre dans le roster ET la cherche, donc elle voyage avec la ligne.
      cfg = await env.DB.prepare(`SELECT merchant, plan, type, account_id, name, status, city FROM merchant_config`).all();
    } catch (_0) {
    try {
      cfg = await env.DB.prepare(`SELECT merchant, plan, type, account_id, name, status FROM merchant_config`).all();
    } catch (_) {
      try {
        cfg = await env.DB.prepare(`SELECT merchant, plan, type, account_id, name FROM merchant_config`).all();
      } catch (__) {
        cfg = await env.DB.prepare(`SELECT merchant, plan, type FROM merchant_config`).all();
      }
    }
    }
    for (const c of (cfg.results || [])) {
      const r = row(c.merchant);
      r.plan = c.plan || '';
      r.type = c.type || '';
      r.city = c.city || '';
      if (c.status === 'suspended') r.store_status = 'suspended';
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
  let merchant = '';
  let status = '';
  try {
    const b = await request.json();
    email = (b.email || '').toString().trim().toLowerCase();
    merchant = (b.merchant || '').toString().trim().slice(0, 64);
    status = (b.status || '').toString().trim();
  } catch (_) { /* no body */ }
  if (status !== 'active' && status !== 'suspended') return json({ error: 'bad-status' }, 400);

  /* ── UN ÉTABLISSEMENT, ou TOUT LE COMPTE ──────────────────────────────────
   * `merchant` gèle UNE boutique ; `email` gèle le login, donc toutes.
   *
   * Il n'y avait que le second, et c'était le mauvais instrument dans la main
   * la plupart du temps : un client qui tient une boutique et un café, et qui
   * cesse de payer pour le café, voyait sa boutique fermer avec. La console
   * proposait pourtant « Suspendre » sur la ligne de CHAQUE établissement — le
   * bouton disait donc quelque chose que le serveur ne savait pas faire.
   *
   * Rien n'est effacé dans les deux cas. Une suspension retire le droit d'agir,
   * pas les données : la boutique rouvre intacte à la réactivation. */
  if (merchant) {
    try {
      const r = await env.DB.prepare(
        'UPDATE merchant_config SET status = ?, updated_ts = ? WHERE merchant = ?'
      ).bind(status, Date.now(), merchant).run();
      if (!((r.meta && r.meta.changes) || 0)) return json({ error: 'not-found' }, 404);
    } catch (e) {
      // Colonne absente = base pas encore migrée. Le dire, plutôt que de
      // répondre « c'est fait » à un geste qui n'a rien fait.
      return json({ error: 'store-status-unavailable', detail: String(e) }, 503);
    }
    await logStoreAction(context, merchant, 'store-status', status,
      status === 'suspended' ? 'suspension établissement' : 'réactivation établissement');
    return json({ ok: true, merchant, status });
  }

  if (!email) return json({ error: 'email-or-merchant-required' }, 400);

  try {
    const r = await env.DB.prepare('UPDATE accounts SET status = ? WHERE email = ?').bind(status, email).run();
    if (!((r.meta && r.meta.changes) || 0)) return json({ error: 'not-found' }, 404);
  } catch (e) {
    return json({ error: 'update-failed', detail: String(e) }, 500);
  }
  return json({ ok: true, email, status });
}

/* Le journal des gestes d'opérateur. Jamais bloquant : une table d'audit absente
 * ne doit pas faire échouer une suspension qui, elle, a bien eu lieu. */
async function logStoreAction(context, merchant, action, next, detail) {
  try {
    const actor = await operatorActor(context.request, context.env);
    await context.env.DB.prepare(
      `INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
       VALUES ('', ?, ?, '', ?, '', ?, ?, ?, ?)`
    ).bind(merchant, action, String(next || ''), actor.label, actor.id, String(detail || ''), Date.now()).run();
  } catch (_) { /* pas de table d'audit sur cette base → on n'échoue pas le geste */ }
}

/* ── LES JOURNAUX QUI SURVIVENT À LA SUPPRESSION ────────────────────────────
 * Ces trois tables portent une colonne `merchant`, mais elles n'appartiennent
 * pas au client : elles enregistrent ce que NOUS avons fait — un module coupé,
 * une vente sortie des livres, un établissement supprimé. Effacer un magasin ne
 * doit pas effacer la trace des gestes posés dessus, sinon la seule opération
 * qu'on ne peut plus auditer est justement la plus lourde. La réponse le dit
 * explicitement plutôt que de laisser croire à un effacement total. */
const AUDIT_TABLES = ['account_audit', 'config_audit', 'sale_audit'];

/* L'inventaire des tables à purger, LU DANS LE SCHÉMA et pas écrit à la main.
 *
 * C'est la raison pour laquelle cette route avait été condamnée : la version
 * précédente effaçait le compte, les ventes, les codes et la configuration, et
 * laissait derrière elle store_docs, clients, catalogs, orders… Une liste écrite
 * à la main vieillit mal — la table ajoutée le mois prochain n'y sera pas, et
 * personne ne s'en apercevra. Ici, toute table qui possède une colonne
 * `merchant` entre d'office dans le périmètre, aujourd'hui comme dans deux ans. */
async function merchantTables(env) {
  const out = [];
  const rs = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name"
  ).all();
  for (const t of (rs.results || [])) {
    const name = String(t.name || '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;   // rien d'interpolable
    if (AUDIT_TABLES.indexOf(name) >= 0) continue;
    try {
      const cols = await env.DB.prepare(`SELECT name FROM pragma_table_info('${name}')`).all();
      if ((cols.results || []).some((c) => c.name === 'merchant')) out.push(name);
    } catch (_) { /* table illisible → on ne la touche pas */ }
  }
  return out;
}

/* DELETE /api/admin/clients?merchant=slug — supprimer UN établissement.
 *
 * La suppression d'un COMPTE reste fermée (voir plus bas) : elle traverse des
 * tables qui ne portent pas de slug et demande son propre inventaire. Celle d'un
 * établissement, elle, se laisse borner exactement — le slug est la clé de tout
 * ce qui lui appartient — et il fallait bien qu'elle existe : un renommage
 * pouvait fabriquer un établissement fantôme, et la console n'offrait aucun
 * moyen de le retirer.
 *
 * Trois garde-fous, parce que c'est irréversible :
 *   · code opérateur nommé (senior), pas le laissez-passer d'équipe ;
 *   · `confirm` doit répéter le slug — on ne supprime pas d'un doigt qui glisse ;
 *   · tout part en un seul batch (atomique côté D1) : pas de magasin à moitié
 *     effacé si la connexion lâche au milieu.
 *
 * La réponse est un CONSTAT, pas une promesse : elle liste chaque table touchée
 * avec le nombre de lignes réellement retirées, et les journaux conservés. */
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);
  if (!(await isSeniorOperator(request, env))) {
    return json({ error: 'operator-code-required' }, 403);
  }

  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').trim().slice(0, 64);
  const confirm = String(url.searchParams.get('confirm') || '').trim().slice(0, 64);

  if (!merchant) {
    /* Toujours condamnée : supprimer un COMPTE veut dire traverser accounts,
       reset_tokens, les sessions et tous ses magasins d'un coup. Tant que cet
       inventaire-là n'est pas écrit et vérifié comme celui ci-dessus, la
       suspension reste le geste sûr. */
    return json({
      error: 'account-deletion-disabled',
      detail: 'Supprimez les établissements un par un (?merchant=slug), ou suspendez le compte.',
    }, 423);
  }
  if (confirm !== merchant) {
    return json({ error: 'confirm-mismatch', detail: 'Répétez le slug exact dans ?confirm=' }, 400);
  }

  let tables;
  try { tables = await merchantTables(env); }
  catch (e) { return json({ error: 'inventory-failed', detail: String(e) }, 500); }
  if (!tables.length) return json({ error: 'inventory-empty' }, 500);

  /* Ce qu'on efface, compté AVANT — après, il n'y a plus rien à compter, et un
     rapport qui n'annonce que « c'est fait » ne vaut rien. */
  const removed = {};
  for (const t of tables) {
    try {
      const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE merchant = ?`).bind(merchant).first();
      const n = (c && Number(c.n)) || 0;
      if (n) removed[t] = n;
    } catch (_) { /* illisible → elle sortira du batch aussi */ }
  }

  try {
    await env.DB.batch(tables.map((t) =>
      env.DB.prepare(`DELETE FROM ${t} WHERE merchant = ?`).bind(merchant)));
  } catch (e) {
    return json({ error: 'delete-failed', detail: String(e) }, 500);
  }

  await logStoreAction(context, merchant, 'store-delete', 'deleted',
    'suppression définitive · ' + JSON.stringify(removed));

  return json({
    ok: true, merchant,
    scanned: tables,          // tout ce qui porte une colonne `merchant`
    removed,                  // table → lignes réellement retirées
    kept: AUDIT_TABLES,       // les journaux d'opérateur, conservés exprès
  });
}
