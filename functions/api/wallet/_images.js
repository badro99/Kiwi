// Every picture inside a pass: icon (required by Apple), logo, and the live
// stamp strip, at 1x/2x/3x. The logo is decoded and fitted once per logo
// version and kept in the Cache API (and in memory for the isolate's life);
// strips are cheap and cached the same way by their count.
import { stampStrip, pointsBar } from './_png.js';
import { kiwiArt } from './_kiwi-art.js';

const memo = new Map();
let decodes = 0;
export const _logoDecodes = () => decodes; /* tools/wallet-routes-test.mjs: one decode per logo version */

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
  return { color: '#7df2b0', bg: '#053b2c', key: '7df2b0-053b2c' };
}

export function stripPng({ view, colors, scale }) {
  const k = `strip/${view.model === 'amount' ? 'p' + Math.min(view.balance, view.target) : view.balance}-${view.target}-${colors.key}@${scale}`;
  return cached(k, () => view.model === 'amount'
    ? pointsBar({ value: view.balance, threshold: view.target, color: colors.color, bg: colors.bg, scale })
    : stampStrip({ filled: view.balance, target: view.target, color: colors.color, bg: colors.bg, scale }));
}

export async function passImages({ merchant, view }) {
  const colors = stripColors(merchant), images = {};
  for (const [s, suffix] of [[1, ''], [2, '@2x'], [3, '@3x']]) {
    for (const kind of ['icon', 'logo']) images[kind + suffix + '.png'] = kiwiArt(kind + suffix + '.png');
    images['strip' + suffix + '.png'] = await stripPng({ view, colors, scale: s });
  }
  return images;
}

export async function programLogo() { return kiwiArt('icon@3x.png'); }
