// /api/shop/catalog — the online shop's catalogue, as the till knows it now.
//
//   GET  Authorization: Bearer kwc.<id>.<secret>   (a `storefront` channel key)
//     →  { ok, shop: { categories, products, variants, colors } }
//
// /api/menu serves the copy the dashboard publishes, and only a browser with
// the dashboard open publishes it: a price changed at the till, or a size
// sold this morning, would wait there until someone opens the dashboard. The
// storefront reads this instead — the same `catalogs` row that
// /api/shop/orders checks prices against — so the page and the check agree.
// The published copy still lends its colour names, and its photo when the
// live record has none. Shape: functions/api/menu.js › sanitizeShop.
import { json } from '../../auth/_lib.js';
import { storeSuspended, storeSubscriptionPending } from '../_private.js';
import { storefrontLink, commerceEnabled, readCatalog, str } from './_lib.js';

const media = (v) => { const s = str(v, 300); return s.indexOf('/api/media/') === 0 ? s : ''; };

export function liveShop(catalog, published) {
  const pub = published && typeof published === 'object' ? published : {};
  const pubPhoto = new Map((Array.isArray(pub.products) ? pub.products : []).map((p) => [String(p && p.id), p]));
  const products = (catalog.products || []).filter((p) => p && p.id && p.name && !p.archived).slice(0, 1000);
  const keep = new Set(products.map((p) => p.id));
  const out = {
    categories: (catalog.categories || []).slice(0, 60).map((c) => ({ id: str(c.id, 40), name: str(c.name, 80) })).filter((c) => c.id),
    products: products.map((p) => {
      const was = pubPhoto.get(String(p.id)) || {};
      return {
        id: str(p.id, 40), name: str(p.name, 120), categoryId: str(p.categoryId, 40) || null,
        priceMAD: Math.max(0, Math.min(1e7, Number(p.priceMAD) || 0)),
        photo: media(p.photo) || media(was.photo), video: media(p.video) || media(was.video),
        ...(typeof p.online === 'boolean' ? { online: p.online } : {}),
      };
    }),
    variants: (catalog.variants || []).filter((v) => v && v.id && keep.has(v.productId)).slice(0, 6000).map((v) => ({
      id: str(v.id, 40), productId: str(v.productId, 40),
      // Le client voit la famille de couleur, comme sur la page publiée.
      colorId: str(v.colorFamily || v.colorId, 40), size: str(v.size, 12),
      stock: Math.floor(Math.max(0, Math.min(1e6, Number(v.stock) || 0))),
    })),
    colors: [],
  };
  const named = new Map((Array.isArray(pub.colors) ? pub.colors : []).map((c) => [String(c && c.id), c]));
  const seen = new Set();
  for (const v of catalog.variants || []) {
    const id = str(v && (v.colorFamily || v.colorId), 40);
    if (!id || seen.has(id) || seen.size >= 60) continue;
    seen.add(id);
    const c = named.get(id) || {};
    out.colors.push({ id, label: str(c.label || (v.colorFamily ? '' : v.colorLabel) || id, 40), hex: str(c.hex || (v.colorFamily ? '' : v.colorHex) || '', 9) });
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const link = await storefrontLink(request, env);
  if (!link) return json({ error: 'unauthorized' }, 401);
  const merchant = String(link.merchant || '').toLowerCase();
  if (await storeSuspended(env, merchant) || await storeSubscriptionPending(env, merchant)) return json({ error: 'unauthorized' }, 401);
  if (!await commerceEnabled(env, merchant)) return json({ error: 'commerce-off' }, 403);
  let catalog = null;
  try { catalog = await readCatalog(env, merchant); } catch (_) { catalog = null; }
  if (!catalog) return json({ error: 'no-catalog' }, 503);
  let published = null;
  try {
    const row = await env.DB.prepare('SELECT data FROM menus WHERE merchant = ?').bind(merchant).first();
    published = row && row.data ? JSON.parse(row.data) : null;
  } catch (_) { published = null; }
  return json({ ok: true, shop: liveShop(catalog, published) });
}
