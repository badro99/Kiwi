// Every picture inside a pass: icon (required by Apple), logo, and the live
// stamp strip, at 1x/2x/3x. The logo is decoded and fitted once per logo
// version and kept in the Cache API (and in memory for the isolate's life);
// strips are cheap and cached the same way by their count.
import { stampStrip, pointsBar, stampIcon, encodePng } from './_png.js';
import { decodePng, trim, fit, keyOut, inkOn } from './_png-read.js';
import { logoBytes } from './_merchant.js';
import { palette, contrast } from './_card.js';

const memo = new Map();
const hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join('');

async function cached(key, make) {
  if (memo.has(key)) return memo.get(key);
  const url = 'https://wallet-cache.kiwi-os.com/' + key;
  const store = typeof caches !== 'undefined' && caches.default;
  if (store) {
    try { const hit = await store.match(url); if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); memo.set(key, b); return b; } } catch (_) {}
  }
  const bytes = await make();
  if (memo.size > 200) memo.clear();
  memo.set(key, bytes);
  if (store && bytes) {
    try { await store.put(url, new Response(bytes, { headers: { 'Cache-Control': 'public, max-age=31536000' } })); } catch (_) {}
  }
  return bytes;
}

/* The disc colour: the brand colour when it shows on the card, else the text colour. */
export function stripColors(merchant) {
  const pal = palette(merchant);
  const ink = contrast(pal.brand, pal.bg) >= 2 ? pal.brand : pal.fg;
  const h = (c) => c.map((v) => v.toString(16).padStart(2, '0')).join('');
  return { color: '#' + h(ink), bg: '#' + h(pal.bg), key: h(ink) + '-' + h(pal.bg) };
}

export function stripPng({ view, colors, scale }) {
  const k = `strip/${view.model === 'amount' ? 'p' + Math.min(view.balance, view.target) : view.balance}-${view.target}-${colors.key}@${scale}`;
  return cached(k, () => view.model === 'amount'
    ? pointsBar({ value: view.balance, threshold: view.target, color: colors.color, bg: colors.bg, scale })
    : stampStrip({ filled: view.balance, target: view.target, color: colors.color, bg: colors.bg, scale }));
}

async function logoSet(merchant, colors) {
  const bytes = logoBytes(merchant.logoUrl), pal = palette(merchant);
  if (!bytes) return null;
  const id = await hex(merchant.logoUrl + colors.key);
  const names = ['logo.png', 'logo@2x.png', 'logo@3x.png', 'icon.png', 'icon@2x.png', 'icon@3x.png'];
  const out = {};
  let img;
  for (const [i, name] of names.entries()) {
    out[name] = await cached(`logo/${id}/${name}`, async () => {
      if (img === undefined) { const d = await decodePng(bytes); img = d ? inkOn(keyOut(trim(d)), pal.bg, pal.fg) : null; }
      if (!img) return new Uint8Array(0);
      const s = (i % 3) + 1;
      const f = i < 3 ? fit(img, 160 * s, 50 * s) : fit(img, 29 * s, 29 * s, { fill: pal.bg, pad: 2 * s });
      return encodePng(f.w, f.h, f.rgba);
    });
    if (!out[name].length) return null;
  }
  return out;
}

export async function passImages({ merchant, view }) {
  const colors = stripColors(merchant);
  const images = (await logoSet(merchant, colors)) || {};
  for (const [s, suffix] of [[1, ''], [2, '@2x'], [3, '@3x']]) {
    if (!images['icon' + suffix + '.png']) images['icon' + suffix + '.png'] = await cached(`icon/${colors.key}@${s}`, () => stampIcon({ color: colors.color, bg: colors.bg, size: 29 * s }));
    images['strip' + suffix + '.png'] = await stripPng({ view, colors, scale: s });
  }
  return images;
}
