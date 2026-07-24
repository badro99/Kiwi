// GET /api/config?merchant=slug — the client apps' own config read.
//
// Returns { features, pins } for one merchant so the caisse/serveur/dashboard can
// (a) hide modules an operator toggled off and (b) resolve PINs the operator
// manages remotely. This is NOT operator-gated: any authenticated same-origin
// session reaches it (the site gate already stands in front of every request), and
// a merchant only ever reads its own slug. Absent config ⇒ empty, and every app
// falls back to its current hardcoded behavior — so this endpoint being missing
// (GitHub Pages, local static) changes nothing.

import { json, readSession, readCookie, SESS_COOKIE, slugMerchant } from '../auth/_lib.js';

const VALID_PIN = /^\d{4}$/;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!env.DB) return json({ features: {}, pins: [] }); // no backend → neutral
  let merchant = (url.searchParams.get('merchant') || '').trim();

  // No explicit ?merchant= slug → a real merchant reading its OWN config on the
  // dashboard. Derive the slug from the authenticated session (the SAME rule the
  // POST uses), so a signed-in merchant always resolves ITS OWN pins/features
  // without depending on a client-supplied slug — which can be a stale
  // kiwiLiveMerchant left by a different account in the same browser (the exact
  // cause of "code incorrect" when the lock fell back to another account's PINs).
  // An operator (God mode) or a paired caisse passes ?merchant= explicitly and
  // keeps that path untouched. No slug AND no session → neutral empty, so the
  // local/hosted demo is byte-identical.
  if (!merchant && env.AUTH_SECRET) {
    try {
      const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
      if (sess && sess.aid) {
        const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
        if (acc && acc.business) merchant = slugMerchant(acc.business);
      }
    } catch (_) { /* fall through to neutral */ }
  }
  if (!merchant) return json({ features: {}, pins: [] });

  let features = {};
  let pins = [];
  let type = '';
  try {
    const cfg = await env.DB.prepare(
      `SELECT features, type FROM merchant_config WHERE merchant = ?`
    ).bind(merchant).first();
    if (cfg && cfg.features) { try { features = JSON.parse(cfg.features) || {}; } catch (_) {} }
    if (cfg && cfg.type) type = cfg.type;

    const rows = await env.DB.prepare(
      `SELECT pin, name, role FROM staff_pins WHERE merchant = ? ORDER BY created_ts`
    ).bind(merchant).all();
    pins = rows.results || [];
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
