// POST /auth/signup — create a merchant account, start a session, mirror the
// lead. Body JSON: { email, name, business, password }.
import { PASSWORD_MAX, hashPassword, makeSession, sessionCookie, json, normEmail, mirrorLead } from './_lib.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env.AUTH_SECRET;
  if (!env.DB || !secret) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const email = normEmail(body.email);
  const name = String(body.name || '').trim().slice(0, 120);
  const business = String(body.business || '').trim().slice(0, 120);
  const password = String(body.password || '');

  if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: 'email' }, 400);
  if (!name) return json({ error: 'name' }, 400);
  if (password.length < 8 || password.length > PASSWORD_MAX) return json({ error: 'weak' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first();
  if (existing) return json({ error: 'exists' }, 409);

  const { salt, hash } = await hashPassword(password);
  const id = 'acc-' + crypto.randomUUID();
  const ts = Date.now();

  try {
    await env.DB.prepare(
      'INSERT INTO accounts (id, email, name, business, salt, hash, created_ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, email, name, business, salt, hash, ts).run();
  } catch (e) {
    // UNIQUE(email) race → treat as already-registered.
    return json({ error: 'exists' }, 409);
  }

  // Best-effort lead mirror to the Google Sheet — never blocks the response.
  context.waitUntil(mirrorLead(env, { email, name, business, ts }));

  const token = await makeSession(id, secret);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token),
    },
  });
}
