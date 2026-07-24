// /api/menu — the customer self-order menu, published per merchant.
//
// Two halves, mirroring /api/config's trust model:
//
//   GET /api/menu?merchant=<slug>   — PUBLIC read. A customer who scanned a table
//     QR (kiwi-order.html?merchant=<slug>) has NO account and NO gate cookie, so
//     this path is allow-listed past the site gate (functions/_middleware.js).
//     It returns ONLY what a customer is meant to see — the display name, the
//     trade type, and the menu itself. It reads the `menus` table and NOTHING
//     else: never PINs, sales, or account data. Absent row / no DB ⇒ a neutral
//     200 { name:'', type:'', menu:null } so the client shows a clean
//     "menu coming soon" state instead of an error.
//
//   POST /api/menu                  — the merchant's dashboard mirrors ITS OWN
//     menu up. The merchant is derived from the authenticated session, NEVER from
//     the body — a client can only ever publish its own slug (same rule as
//     /api/config POST). No session / no DB ⇒ neutral no-op (503) so static hosts
//     (GitHub Pages, local) are unaffected.

import { json, readSession, readCookie, SESS_COOKIE, slugMerchant } from '../auth/_lib.js';

// Keep the stored menu small and well-shaped. We trust the merchant (it's their
// own carte) but still bound sizes so a runaway client can't bloat the row.
function sanitizeMenu(raw) {
  const out = { cats: [], items: [] };
  if (!raw || typeof raw !== 'object') return out;
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const cats = Array.isArray(raw.cats) ? raw.cats.slice(0, 60) : [];
  out.cats = cats.map((c) => ({
    id: str(c && c.id, 40),
    name: str(c && c.name, 80),
    sub: Array.isArray(c && c.sub) ? c.sub.slice(0, 40).map((s) => ({
      id: str(s && s.id, 40),
      name: str(s && s.name, 80),
    })) : [],
  })).filter((c) => c.id);
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 1000) : [];
  out.items = items.map((it) => ({
    id: str(it && it.id, 40),
    name: str(it && it.name, 120),
    price: Math.max(0, Math.min(1e7, Number(it && it.price) || 0)),
    catId: str(it && it.catId, 40) || null,
    subId: str(it && it.subId, 40) || null,
    desc: str(it && it.desc, 400),
    avail: !(it && it.avail === false),
  })).filter((it) => it.id && it.name);
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!env.DB) return json({ name: '', type: '', menu: null }); // no backend → neutral

  let name = '';
  let type = '';
  let menu = null;
  try {
    const row = await env.DB.prepare(
      `SELECT name, type, data FROM menus WHERE merchant = ?`
    ).bind(merchant).first();
    if (row) {
      name = row.name || '';
      type = row.type || '';
      if (row.data) { try { menu = sanitizeMenu(JSON.parse(row.data)); } catch (_) { menu = null; } }
    }
  } catch (_) { /* table missing / db error → neutral (menu stays null) */ }

  // A published-but-empty menu is treated as "nothing to show yet" too.
  if (menu && !(menu.items && menu.items.length)) menu = null;
  return json({ name, type, menu });
}

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

  const menu = sanitizeMenu(body && body.data);
  // The display name defaults to the account's own business; a client may send a
  // trimmed override but never another merchant's identity (slug is session-bound).
  const name = String((body && body.name) || acc.business || '').trim().slice(0, 80) || (acc.business || '');
  const type = String((body && body.type) || '').trim().slice(0, 24);

  try {
    await env.DB.prepare(
      `INSERT INTO menus (merchant, name, type, data, updated_ts)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(merchant) DO UPDATE SET
         name = excluded.name, type = excluded.type,
         data = excluded.data, updated_ts = excluded.updated_ts`
    ).bind(merchant, name, type, JSON.stringify(menu), Date.now()).run();
  } catch (_) { return json({ error: 'write-failed' }, 500); }

  return json({ ok: true, merchant, items: menu.items.length, cats: menu.cats.length });
}
