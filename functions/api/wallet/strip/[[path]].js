// GET /api/wallet/strip/<n>-<target>-<ink>-<bg>@<scale>.png   the stamp strip
// GET /api/wallet/strip/p<n>-<threshold>-<ink>-<bg>@<scale>.png  the points bar
// GET /api/wallet/strip/logo-<shop>.png                         the shop's tile on the web card
// The strip URL carries everything it draws, so it is stateless and immutable:
// the web card and Google's hero image point at it and every CDN may keep it.
import { stripPng, shopTile } from '../_images.js';
import { loadMerchant } from '../_merchant.js';

const RE = /^(p?)(\d{1,7})-(\d{1,7})-([0-9a-f]{6})-([0-9a-f]{6})@([123])\.png$/;
const png = (bytes, maxAge) => new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${maxAge}${maxAge > 86400 ? ', immutable' : ''}` } });

export async function onRequestGet(context) {
  const name = String((Array.isArray(context.params.path) ? context.params.path : [context.params.path]).join('/'));
  const m = RE.exec(name);
  if (m) {
    const points = !!m[1], n = Number(m[2]), target = Number(m[3]), scale = Number(m[6]);
    if (!target || n > target || (!points && target > 24)) return new Response(null, { status: 404 });
    const view = points ? { model: 'amount', balance: n, target } : { model: 'visit', balance: n, target };
    return png(await stripPng({ view, colors: { color: '#' + m[4], bg: '#' + m[5], key: m[4] + '-' + m[5] }, scale }), 31536000);
  }
  const logo = /^logo-([a-z0-9][a-z0-9-]{0,63})\.png$/.exec(name);
  if (logo && context.env && context.env.DB) {
    const shop = await loadMerchant(context.env.DB, logo[1]);
    if (!shop || !shop.on) return new Response(null, { status: 404 });
    const tile = await shopTile(shop);
    return tile ? png(tile, 3600) : new Response(null, { status: 404 });
  }
  return new Response(null, { status: 404 });
}
