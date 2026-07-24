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

const str = (v, n) => String(v == null ? '' : v).slice(0, n);

// Media are stored as URLs (uploaded to R2 via /api/media), never as bytes. Only
// same-origin /api/media/ paths are kept: a published menu is rendered on a
// stranger's phone, so it must never be able to point that phone at an
// arbitrary external host.
function mediaUrl(v) {
  const s = str(v, 300);
  return s.indexOf('/api/media/') === 0 ? s : '';
}

// Keep the stored menu small and well-shaped. We trust the merchant (it's their
// own carte) but still bound sizes so a runaway client can't bloat the row.
function sanitizeMenu(raw) {
  const out = { cats: [], items: [] };
  if (!raw || typeof raw !== 'object') return out;
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
    // OrderPro additions — a dish photo or a short vertical clip. Absent for
    // every menu published before they existed, and both pages fall back to
    // their icon tile, so this is purely additive.
    photo: mediaUrl(it && it.photo),
    video: mediaUrl(it && it.video),
  })).filter((it) => it.id && it.name);
  return out;
}

// A boutique publishes stock, not a carte: products × colour × size, each with a
// count and its barcodes. Same trust model and the same bounding as sanitizeMenu.
// Shape mirrors assets/boutique-catalog.js so OrderPro's boutique vertical can
// answer the only two questions a shopper has — how much, and is my size left.
function sanitizeShop(raw) {
  const out = { categories: [], products: [], variants: [], colors: [] };
  if (!raw || typeof raw !== 'object') return out;
  out.categories = (Array.isArray(raw.categories) ? raw.categories.slice(0, 60) : [])
    .map((c) => ({ id: str(c && c.id, 40), name: str(c && c.name, 80) }))
    .filter((c) => c.id);
  out.products = (Array.isArray(raw.products) ? raw.products.slice(0, 1000) : [])
    .map((p) => ({
      id: str(p && p.id, 40),
      name: str(p && p.name, 120),
      categoryId: str(p && p.categoryId, 40) || null,
      priceMAD: Math.max(0, Math.min(1e7, Number(p && p.priceMAD) || 0)),
      photo: mediaUrl(p && p.photo),
      video: mediaUrl(p && p.video),
    }))
    .filter((p) => p.id && p.name);
  out.variants = (Array.isArray(raw.variants) ? raw.variants.slice(0, 6000) : [])
    .map((v) => ({
      id: str(v && v.id, 40),
      productId: str(v && v.productId, 40),
      colorId: str(v && v.colorId, 40),
      size: str(v && v.size, 12),
      stock: Math.max(0, Math.min(1e6, Number(v && v.stock) || 0)),
      barcodes: (Array.isArray(v && v.barcodes) ? v.barcodes.slice(0, 8) : [])
        .map((b) => str((b && b.code) != null ? b.code : b, 40)).filter(Boolean),
    }))
    .filter((v) => v.id && v.productId);
  out.colors = (Array.isArray(raw.colors) ? raw.colors.slice(0, 60) : [])
    .map((c) => ({ id: str(c && c.id, 40), label: str(c && c.label, 40), hex: str(c && c.hex, 9) }))
    .filter((c) => c.id);
  return out;
}

const isShop = (type) => String(type || '').toLowerCase() === 'boutique';

// Is the Order Pro add-on switched on for this merchant?
//
// NOTE this inverts the usual merchant_config rule. Everywhere else a MISSING
// key means the module is ON, because those modules are part of the interface a
// client already pays for. Order Pro is a paid add-on that turns a phone into an
// ordering terminal, so it is OFF unless an operator explicitly set it true.
// Absent row, missing key, bad JSON, DB error → false.
async function orderProEnabled(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT features FROM merchant_config WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row || !row.features) return false;
    return (JSON.parse(row.features) || {}).orderpro === true;
  } catch (_) { return false; }
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
  let shop = null;
  try {
    const row = await env.DB.prepare(
      `SELECT name, type, data FROM menus WHERE merchant = ?`
    ).bind(merchant).first();
    if (row) {
      name = row.name || '';
      type = row.type || '';
      if (row.data) {
        try {
          const parsed = JSON.parse(row.data);
          // A boutique publishes stock instead of a carte. Both live in the same
          // row; `type` says which one to read back.
          if (isShop(type)) shop = sanitizeShop(parsed);
          else menu = sanitizeMenu(parsed);
        } catch (_) { menu = null; shop = null; }
      }
    }
  } catch (_) { /* table missing / db error → neutral (menu stays null) */ }

  // A published-but-empty menu is treated as "nothing to show yet" too.
  if (menu && !(menu.items && menu.items.length)) menu = null;
  if (shop && !(shop.products && shop.products.length)) shop = null;

  // `orderpro` is additive: kiwi-order.html (the QR page) ignores it and keeps
  // working for every merchant exactly as before. OrderPro.html — the NFC
  // white-label app — refuses to open unless it is true, and POST /api/order
  // enforces the same rule server-side.
  const orderpro = await orderProEnabled(env, merchant);
  return json({ name, type, menu, shop, orderpro });
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

  // The display name defaults to the account's own business; a client may send a
  // trimmed override but never another merchant's identity (slug is session-bound).
  const name = String((body && body.name) || acc.business || '').trim().slice(0, 80) || (acc.business || '');
  const type = String((body && body.type) || '').trim().slice(0, 24);

  // One row, two payload shapes — a restaurant publishes its carte, a boutique
  // publishes its stock. `type` decides which sanitizer runs, so a boutique's
  // products can never be flattened by the menu sanitizer (or vice-versa).
  const shop = isShop(type);
  const raw = (body && body.data) || {};

  // Shape guard. Two modules publish into this row (menu-catalog.js for a carte,
  // orderpro-publish.js for stock) and they run in the same page. If one of them
  // posts the WRONG shape for the declared type — a boutique labelled payload
  // carrying {cats,items} instead of {products} — the sanitizer would happily
  // reduce it to empty and wipe the store's real catalogue. That is a silent
  // data loss, so refuse it rather than write it. An honestly empty catalogue
  // still publishes: this only rejects a mismatch, never emptiness.
  const looksShop = Array.isArray(raw.products) || Array.isArray(raw.variants);
  const looksMenu = Array.isArray(raw.items) || Array.isArray(raw.cats);
  if (shop && !looksShop && looksMenu) return json({ error: 'shape-mismatch', expected: 'shop' }, 409);
  if (!shop && !looksMenu && looksShop) return json({ error: 'shape-mismatch', expected: 'menu' }, 409);

  const data = shop ? sanitizeShop(raw) : sanitizeMenu(raw);

  try {
    await env.DB.prepare(
      `INSERT INTO menus (merchant, name, type, data, updated_ts)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(merchant) DO UPDATE SET
         name = excluded.name, type = excluded.type,
         data = excluded.data, updated_ts = excluded.updated_ts`
    ).bind(merchant, name, type, JSON.stringify(data), Date.now()).run();
  } catch (_) { return json({ error: 'write-failed' }, 500); }

  return shop
    ? json({ ok: true, merchant, products: data.products.length, variants: data.variants.length })
    : json({ ok: true, merchant, items: data.items.length, cats: data.cats.length });
}
