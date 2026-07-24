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
  if (env.AUTH_SECRET) {
    try {
      const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
      if (sess && sess.aid) {
        const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
        if (acc && acc.business) sessionMerchant = slugMerchant(acc.business);
      }
    } catch (_) { /* fall through to neutral */ }
  }
  const operator = await isOperator(request, env);
  if (sessionMerchant && !operator) merchant = sessionMerchant;
  if (!merchant) return json({ features: {}, pins: [] });

  // May this caller read THIS merchant's staff PINs? Its own session, the
  // operator console, or a till that redeemed a pairing code for this store.
  const mayReadPins = (merchant === sessionMerchant) || operator || (await isTillFor(request, env, merchant));

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

// POST /api/config — a merchant syncs ITS OWN state up to the server so the
// operator console (God mode) can see it. The merchant is derived from the
// authenticated session, NEVER from the request body — a client can only ever
// write its own slug. Body JSON (both fields optional, sent independently):
//   { pins: [{ code|pin, name, role }] }   — full replace of this merchant's PINs
//   { type: "boutique" }                   — the onboarding business subtype
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

  const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
  if (!acc) return json({ error: 'unauthorized' }, 401);
  const merchant = slugMerchant(acc.business);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

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
         VALUES (?, '{}', NULL, ?, ?)
         ON CONFLICT(merchant) DO UPDATE SET type = excluded.type, updated_ts = excluded.updated_ts`
      ).bind(merchant, type, Date.now()).run();
      result.type = type;
    } catch (_) { return json({ error: 'write-failed' }, 500); }
  }

  return json(result);
}
