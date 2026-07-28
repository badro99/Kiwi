// POST /api/pair/create — the DASHBOARD half of caisse pairing.
//
// The caller asks for a live 6-digit code that binds a till to a store. Two ways
// in (see the identity block below): a signed-in MERCHANT gets a code for its own
// store (merchant derived from the account, never the body — a client can only
// pair itself); Kiwi STAFF/OPERATOR (God mode, no account — how the pitch demo
// runs) gets a code for a store it declares by name. Either way the merchant key
// is slugMerchant(name) — the same slug the dashboard, the caisse
// (kiwiLiveMerchant) and the D1 roster compute, so they line up with no stored map.
//
// The store's trade (type/subtype/name) rides along on the code so the caisse can
// boot the matching vertical on redeem with no second lookup.
//
// Fail-soft contract with assets/caisse-link.js:
//   · 401 only when the caller is NEITHER a merchant session NOR staff/operator
//     (the client keeps its localStorage code → same-browser loop still works).
//   · On success returns { ok:true, code, expires_ts }. The `ok:true` is REQUIRED:
//     backendCreate() only adopts the server code when j.ok && j.code are truthy.
//
// Runs behind the passcode gate (functions/_middleware.js). No DB / no secret ⇒
// 503 so a static host (GitHub Pages, local) is unaffected.

import { json, readSession, readCookie, SESS_COOKIE, slugMerchant, isOperator } from '../../auth/_lib.js';

const TTL = 15 * 60 * 1000; // a code is live for 15 minutes

function code6() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000)); // always 6 digits, no leading zero
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);

  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { body = {}; }
  const type = String(body.type || '').trim().slice(0, 24) || null;
  const subtype = String(body.subtype || '').trim().slice(0, 40) || null;
  let name = String(body.name || '').trim().slice(0, 120) || null;

  // Who is issuing this code, and for which store?
  //   · A real account session owns its stores — possibly SEVERAL of them, a
  //     boutique and a restaurant under one login. The account decides WHO; the
  //     `name` the panel sends decides WHICH, but only after the registry
  //     confirms that store belongs to this account. An unrecognised name falls
  //     back to the account's own store, so a client can still only ever pair
  //     itself. This is the primary path for a signed-in merchant.
  //   · Kiwi staff / operator (God mode) has NO account but is already fully
  //     privileged across every merchant. It pairs a demo store it declares by
  //     name — the same slug the dashboard and caisse compute (slugMerchant of
  //     the venue name) — so the pitch demo (staff-gated, no login) works too.
  //   · Anyone else → 401. (This is what the caisse's fail-soft path expects.)
  //
  // Getting the store right matters here more than anywhere: the till redeems
  // this code and then posts every sale under the merchant it carries. Deriving
  // it from the account alone sent a second shop's till into the FIRST shop's
  // books, while its dashboard sat listening on a slug nothing was writing to.
  let merchant = '';
  let accountId = null;
  if (sess && sess.aid) {
    const acc = await env.DB.prepare('SELECT business, email FROM accounts WHERE id = ?')
      .bind(sess.aid).first();
    if (!acc) return json({ error: 'unauthorized' }, 401);
    merchant = slugMerchant(acc.business || acc.email);
    accountId = sess.aid;
    /* QUEL magasin ? Le panneau l'envoie maintenant en clair (`merchant`) parce
     * que le déduire du nom affiché ne marche que tant que personne n'a corrigé
     * son enseigne : « Cafe Amira » renommé « Amira Café » ne donnait plus
     * `cafe-amira`, la vérification de propriété échouait, et on retombait
     * silencieusement sur l'établissement principal du compte — la caisse du
     * café s'est ainsi appairée sous la boutique, et ses ventes avec elle.
     * Le slug reste une DEMANDE : la ligne ci-dessous n'y consent que si le
     * registre confirme que ce magasin appartient bien à ce compte. */
    const asked = String((body && body.merchant) || '').trim().slice(0, 64) || slugMerchant(name || '');
    if (asked) {
      const wanted = asked;
      if (wanted && wanted !== merchant) {
        try {
          const owned = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?')
            .bind(wanted).first();
          if (owned && owned.account_id === sess.aid) merchant = wanted;
        } catch (_) { /* no registry yet → the account's own store, as before */ }
      }
    }
    if (!name) name = String(acc.business || '').trim().slice(0, 120) || null;
  } else if (await isOperator(request, env)) {
    if (!name) return json({ error: 'name-required' }, 400);
    merchant = slugMerchant(name);
  } else {
    return json({ error: 'unauthorized' }, 401);
  }

  const now = Date.now();
  const expires = now + TTL;

  // Revoke this merchant's prior live codes so only the newest one redeems.
  try {
    await env.DB.prepare('UPDATE pairings SET used_ts = ? WHERE merchant = ? AND used_ts IS NULL')
      .bind(now, merchant).run();
  } catch (_) { return json({ error: 'write-failed' }, 500); }

  // Insert a fresh code, retrying on the (rare) partial-unique-index collision
  // between two simultaneously-live codes.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = code6();
    try {
      await env.DB.prepare(
        `INSERT INTO pairings (code, merchant, type, subtype, name, account_id, created_ts, expires_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(code, merchant, type, subtype, name, accountId, now, expires).run();
      return json({ ok: true, code, expires_ts: expires });
    } catch (_) { /* unique collision (or transient) → try another code */ }
  }
  return json({ error: 'code-generation-failed' }, 500);
}
