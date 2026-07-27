// GET /api/config?merchant=slug — the client apps' own config read.
//
// Returns { features, pins } for one merchant so the caisse/serveur/dashboard can
// (a) hide modules an operator toggled off and (b) resolve PINs the operator
// manages remotely. This is NOT operator-gated: any authenticated same-origin
// session reaches it (the site gate already stands in front of every request), and
// a merchant only ever reads its own slug. Absent config ⇒ empty, and every app
// falls back to its current hardcoded behavior — so this endpoint being missing
// (GitHub Pages, local static) changes nothing.

import { json, readSession, readCookie, SESS_COOKIE, slugMerchant, isOperator, isTillFor } from '../auth/_lib.js';

const VALID_PIN = /^\d{4}$/;

/* ── Ce qu'un établissement TOUT NEUF reçoit ────────────────────────────────
 * Cinq modules qui ne servent qu'à une partie des clients : un snack de quartier
 * n'a ni terminal de paiement à recenser, ni dossier de conformité, ni carnet de
 * réservations, ni cartes de dépenses, et Order Pro ouvre la carte au téléphone
 * des passants. Les laisser allumés d'office, c'est livrer un labyrinthe et
 * quatre pages vides ; l'opérateur les rallume module par module quand le client
 * en a réellement besoin (kiwi-admin.html › Fonctionnalités).
 *
 * L'inverse de tout le reste : ailleurs une clé absente veut dire ALLUMÉ. Ici on
 * écrit `false` EXPLICITEMENT dans la fiche, et seulement à sa création. C'est ce
 * qui permet de ne toucher à aucun client existant — leur fiche est déjà là, elle
 * n'est jamais réécrite (le ON CONFLICT ne touche pas `features`), et un client
 * qui utilise déjà ses réservations les garde.
 */
const NEW_STORE_FEATURES = {
  terminaux: false,
  conformite: false,
  reservations: false,
  depenses: false,
  orderpro: false,
};

/* La date à partir de laquelle un COMPTE est « nouveau ».
 * Un client qui s'inscrit après cette date n'a jamais connu l'ancienne
 * configuration, donc sa première boutique part avec les cinq modules coupés,
 * même si le navigateur ne nous dit rien (vieux cache, deuxième appareil).
 * Pour un compte plus ancien on ne devine pas : seul un signal explicite du
 * client (`fresh`, envoyé à la création d'un établissement) déclenche les
 * valeurs par défaut. Un compte d'avant qui recharge simplement son tableau de
 * bord ne doit rien voir changer. */
const NEW_ACCOUNT_FROM = 1785110400000;   // 2026-07-27T00:00:00Z

/* Une fiche « vide » = créée mais jamais configurée. Deux appels concurrents
 * arrivent à la création d'un établissement (l'enregistrement du magasin et la
 * synchro du type), et c'est une course : si l'anodin gagne, la fiche naît avec
 * '{}' et le signal `fresh` arrive une milliseconde trop tard. On rattrape donc
 * une fiche encore vierge — jamais une fiche que quelqu'un a déjà réglée. */
function isBlankFeatures(v) {
  const s = String(v == null ? '' : v).trim();
  return s === '' || s === '{}';
}

/* Who owns a store slug?
 *   '<acc-id>' → claimed by that account
 *   ''         → a row exists but is unclaimed (a pre-registry row, or a store an
 *                operator seeded) — adoptable by the first account that syncs it
 *   null       → no row at all (a brand-new store, or the registry columns aren't
 *                migrated yet) — also adoptable
 * Never throws: on a database that hasn't run the ALTERs, the SELECT fails and we
 * answer null, which lands every caller back on exactly today's behaviour. */
async function storeOwner(env, slug) {
  try {
    const row = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
    return row ? (row.account_id || '') : null;
  } catch (_) { return null; }
}

/* Stamp the store's identity — owner + display name — without touching its
 * features, plan or type. First write wins on account_id: once a store belongs to
 * an account it is locked to it, so a second merchant can never take over a slug
 * that is already someone's shop. (Two merchants who pick the identical store
 * name still race for the free slug, exactly as they already race for it in
 * `sales`; the loser's sync is refused with 403 rather than silently merged.)
 * Fail-soft: pre-migration this throws and is swallowed — the config write that
 * follows still works, we just cannot group the store under its owner yet. */
async function claimStore(env, merchant, accountId, name, seed) {
  try {
    await env.DB.prepare(
      `INSERT INTO merchant_config (merchant, features, plan, type, account_id, name, updated_ts)
       VALUES (?, ?, NULL, NULL, ?, ?, ?)
       ON CONFLICT(merchant) DO UPDATE SET
         account_id = COALESCE(merchant_config.account_id, excluded.account_id),
         name       = COALESCE(NULLIF(excluded.name, ''), merchant_config.name),
         updated_ts = excluded.updated_ts`
    ).bind(merchant, seed ? JSON.stringify(NEW_STORE_FEATURES) : '{}',
           accountId, String(name || ''), Date.now()).run();
    return true;
  } catch (_) { return false; }
}

/* Rattrapage de la course décrite plus haut : la fiche existait déjà, mais
 * personne ne l'avait encore réglée. N'écrase JAMAIS une configuration —
 * la condition SQL exige que `features` soit encore vide. */
async function seedBlankFeatures(env, merchant) {
  try {
    await env.DB.prepare(
      `UPDATE merchant_config SET features = ?, updated_ts = ?
        WHERE merchant = ? AND (features IS NULL OR TRIM(features) = '' OR TRIM(features) = '{}')`
    ).bind(JSON.stringify(NEW_STORE_FEATURES), Date.now(), merchant).run();
  } catch (_) { /* pré-migration → on reste sur le comportement d'avant */ }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!env.DB) return json({ features: {}, pins: [] }); // no backend → neutral
  let merchant = (url.searchParams.get('merchant') || '').trim();

  // Whose config is this? The response carries staff PINs — the credential that
  // opens a till — so the slug must never be taken on the client's word when we
  // can do better. The signed-in account is authoritative and OVERRIDES an
  // explicit ?merchant=: the site gate admits every merchant (and the shared
  // staff passcode), so honouring the parameter let any account read any other
  // account's till PINs just by knowing its slug. It also fixes the "code
  // incorrect" case where a stale kiwiLiveMerchant from a different account in
  // the same browser made the lock validate against the wrong store's PINs.
  //   · account session → that account's own slug, always.
  //   · operator (God mode) → ?merchant= honoured; that is what the console is.
  //   · no session (a paired caisse) → ?merchant= is still honoured for the
  //     FEATURE FLAGS and the type, which are not secrets and which a till needs
  //     to hide modules the operator switched off. PINs, however, are now only
  //     returned when the caller can PROVE it is that merchant: an account
  //     session, an operator, or the httpOnly till token that /api/pair/redeem
  //     hands out (see isTillFor). Knowing a slug is no longer enough to read a
  //     store's staff PINs.
  //
  //     Tills paired BEFORE this shipped carry no token, so they receive an
  //     empty `pins` until they re-pair. That degrades gracefully and opens
  //     nothing: the only PIN-validating surface is the dashboard lock, which
  //     always has an account session and is unaffected. A session-less caisse
  //     uses these rows for staff NAMES (kiwi-caisse.html) and for the optional
  //     role match in kiwi-serveur.html, both of which already fall back to
  //     "Caissier" / "Serveur N" when the list is empty.
  let sessionMerchant = '';
  let sessionAid = '';
  if (env.AUTH_SECRET) {
    try {
      const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
      if (sess && sess.aid) {
        const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
        if (acc && acc.business) { sessionMerchant = slugMerchant(acc.business); sessionAid = sess.aid; }
      }
    } catch (_) { /* fall through to neutral */ }
  }
  const operator = await isOperator(request, env);

  // A login can hold SEVERAL établissements, and each one is its own store with
  // its own type, its own modules and its own staff. So the account slug is no
  // longer the only slug a merchant may read — it may read any store it OWNS.
  // That is what the registry is for: ownership is checked against the database,
  // never taken on the client's word, so this widens what a merchant can reach by
  // exactly their own shops and nothing else. An unowned slug still snaps back to
  // the account's own store, which is what closed the cross-account PIN read.
  let ownsRequested = false;
  if (sessionAid && merchant && merchant !== sessionMerchant) {
    ownsRequested = (await storeOwner(env, merchant)) === sessionAid;
  }
  if (sessionMerchant && !operator && !ownsRequested) merchant = sessionMerchant;
  if (!merchant) return json({ features: {}, pins: [] });

  // May this caller read THIS merchant's staff PINs? Its own session, another of
  // its own stores, the operator console, or a till that redeemed a pairing code
  // for this store.
  const mayReadPins = (merchant === sessionMerchant) || ownsRequested || operator
    || (await isTillFor(request, env, merchant));

  let features = {};
  let pins = [];
  let type = '';
  try {
    const cfg = await env.DB.prepare(
      `SELECT features, type FROM merchant_config WHERE merchant = ?`
    ).bind(merchant).first();
    if (cfg && cfg.features) { try { features = JSON.parse(cfg.features) || {}; } catch (_) {} }
    if (cfg && cfg.type) type = cfg.type;

    if (mayReadPins) {
      const rows = await env.DB.prepare(
        `SELECT pin, name, role FROM staff_pins WHERE merchant = ? ORDER BY created_ts`
      ).bind(merchant).all();
      pins = rows.results || [];
    }
  } catch (_) { /* table missing / db error → neutral config */ }

  return json({ features, pins, type });
}

// POST /api/config — a merchant syncs ONE OF ITS STORES up to the server so the
// operator console (God mode) can see it. Body JSON (all fields optional, sent
// independently):
//   { merchant: "cafe-nord" }              — WHICH store this sync is about
//   { name: "Café Nord" }                  — that store's display name
//   { pins: [{ code|pin, name, role }] }   — full replace of this store's PINs
//   { type: "boutique" }                   — the onboarding business subtype
//   { fresh: true }                        — this store is being CREATED right now
//
// `fresh` is the only thing that distinguishes "a shop that has just been opened"
// from "a shop that has existed for months and is merely saying hello". It decides
// whether the row is born with NEW_STORE_FEATURES (five modules off) or with the
// historic everything-on. Never trust it to turn anything ON: it only ever writes
// defaults into a row that has no configuration at all.
//
// `merchant` is a request, not a fact: the server accepts it only when the slug
// is free or already belongs to this account (see storeOwner/claimStore), and
// answers 403 otherwise. Anything else — absent, or another merchant's shop —
// falls back to the account's own slug, which is the pre-registry behaviour.
//
// It has to work this way because one login holds several établissements. The
// merchant used to be derived from accounts.business alone, so a client who added
// a second shop wrote BOTH shops into one row: the boutique's onboarding
// overwrote the restaurant's type, and the two shared a single staff list. The
// session still decides WHO is writing; the body now says WHICH of their stores.
//
// Each field is applied ONLY when present: a type-only sync never touches PINs,
// and a pins-only sync never touches the type. (Before, an absent `pins` was read
// as an empty list and wiped every PIN — so a type sync would have deleted them.)
// No session / no DB ⇒ neutral no-op so static hosts are unaffected.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
  if (!sess || !sess.aid) return json({ error: 'unauthorized' }, 401);

  const acc = await env.DB.prepare('SELECT business, created_ts FROM accounts WHERE id = ?').bind(sess.aid).first();
  if (!acc) return json({ error: 'unauthorized' }, 401);
  const accSlug = slugMerchant(acc.business);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  // Which of this account's stores is being synced?
  let merchant = accSlug;
  let storeName = String(acc.business || '').trim().slice(0, 120);
  const wanted = String((body && body.merchant) || '').trim().slice(0, 80);
  const wantedName = String((body && body.name) || '').trim().slice(0, 120);
  if (wanted && wanted !== accSlug) {
    const owner = await storeOwner(env, wanted);
    // A slug already claimed by someone else is refused outright rather than
    // quietly redirected — a sync that lands on the wrong store is how the
    // two-shop corruption happened.
    if (owner !== null && owner !== '' && owner !== sess.aid) {
      return json({ error: 'merchant-not-yours' }, 403);
    }
    /* '' = une fiche existe déjà mais n'appartient à personne : c'est une
       boutique PRÉPARÉE PAR L'OPÉRATEUR pour un client (admin/config.js insère
       sans account_id). Elle était adoptable par le premier venu — et `wanted`
       arrive tel quel du corps de la requête. N'importe quel commerçant connecté
       pouvait donc envoyer {merchant:"cafe-rif"}, prendre la boutique que
       l'opérateur venait de configurer pour un autre, écrire SES codes PIN
       dedans et les relire ensuite. Le vrai commerçant, lui, se prenait un 403
       sur sa propre boutique. Les slugs se devinent : ils dérivent du nom
       commercial.
       Une fiche réservée ne se prend donc plus que par le compte dont le nom
       commercial donne ce slug. Un slug SANS fiche (null) reste librement
       créable : personne n'a rien préparé dessus. L'opérateur garde la main pour
       rattacher explicitement une fiche à un compte (admin/config.js). */
    if (owner === '') {          // on est déjà dans la branche wanted !== accSlug
      return json({ error: 'merchant-reserved' }, 403);
    }
    merchant = wanted;
    storeName = wantedName || wanted;
  } else if (wantedName) {
    storeName = wantedName;
  }
  // Register the store against its owner before writing anything into it, so a
  // shop the console has never seen shows up under the right client the moment it
  // syncs — even if this particular call carries neither pins nor a type.
  //
  // If the claim CANNOT be recorded (the registry columns aren't migrated yet on
  // this database), stay on the account's own slug. There would otherwise be a
  // window — new code deployed, ALTERs not yet run — where writes went to the
  // store slug while reads still came from the account slug, and a merchant would
  // watch their own PINs and modules vanish. Better to keep the old single-store
  // behaviour intact until the column exists.
  /* Cet établissement naît-il maintenant ?
   *   · `fresh` — le client vient de créer la boutique (onboarding, ou le
   *     sélecteur d'établissement du tableau de bord). C'est le signal qui couvre
   *     la deuxième boutique d'un client déjà installé.
   *   · compte récent — une inscription postérieure à NEW_ACCOUNT_FROM. Filet de
   *     sécurité pour un navigateur qui tourne encore sur un ancien cache : un
   *     nouveau client repart toujours de la bonne configuration.
   * Ni l'un ni l'autre ⇒ on ne présume rien, et la fiche naît « tout allumé »,
   * exactement comme avant. */
  const wantSeed = (body && body.fresh === true)
    || Number(acc.created_ts || 0) >= NEW_ACCOUNT_FROM;

  const claimed = await claimStore(env, merchant, sess.aid, storeName, wantSeed);
  if (!claimed && merchant !== accSlug) merchant = accSlug;
  if (wantSeed && claimed) await seedBlankFeatures(env, merchant);

  const result = { ok: true, merchant };

  // ── PINs (only when the client actually sent a list) ───────────────────────
  if (Array.isArray(body && body.pins)) {
    const seen = new Set();
    const clean = [];
    for (const p of body.pins) {
      if (!p) continue;
      const code = String(p.code || p.pin || '').trim();
      if (!VALID_PIN.test(code) || seen.has(code)) continue;
      seen.add(code);
      clean.push({
        code,
        name: String(p.name || '').trim().slice(0, 60),
        role: String(p.role || '').trim().slice(0, 24) || 'staff',
      });
      if (clean.length >= 20) break;
    }
    // Atomic replace. created_ts is offset per index so the GET's ORDER BY
    // created_ts preserves the submitted order.
    const base = Date.now();
    const stmts = [env.DB.prepare('DELETE FROM staff_pins WHERE merchant = ?').bind(merchant)];
    clean.forEach((p, i) => {
      stmts.push(env.DB.prepare(
        'INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)'
      ).bind('pin-' + crypto.randomUUID(), merchant, p.code, p.name, p.role, base + i));
    });
    try { await env.DB.batch(stmts); }
    catch (_) { return json({ error: 'write-failed' }, 500); }
    result.pins = clean.length;
  }

  // ── Business type (only when sent) — upsert without disturbing features/plan ─
  if (typeof (body && body.type) === 'string' && body.type.trim()) {
    const type = body.type.trim().slice(0, 24);
    try {
      await env.DB.prepare(
        `INSERT INTO merchant_config (merchant, features, plan, type, updated_ts)
         VALUES (?, ?, NULL, ?, ?)
         ON CONFLICT(merchant) DO UPDATE SET type = excluded.type, updated_ts = excluded.updated_ts`
        // Sur une base pré-migration claimStore() a échoué : c'est CETTE requête
        // qui crée la fiche, et elle doit donc semer les mêmes valeurs par défaut.
      ).bind(merchant, wantSeed ? JSON.stringify(NEW_STORE_FEATURES) : '{}', type, Date.now()).run();
      result.type = type;
    } catch (_) { return json({ error: 'write-failed' }, 500); }
  }

  return json(result);
}
