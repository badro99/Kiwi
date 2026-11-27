// Every picture inside a pass: icon (required by Apple), logo, and the live
// stamp strip, at 1x/2x/3x. The logo is decoded and fitted once per logo
// version and kept in the Cache API (and in memory for the isolate's life);
// strips are cheap and cached the same way by their count.
import { stampStrip, pointsBar, encodePng } from './_png.js';
import { decodePng, trim, fit, keyOut } from './_png-read.js';
import { logoBytes } from './_merchant.js';
import { kiwiArt } from './_kiwi-art.js';

const memo = new Map();
let decodes = 0;
export const _logoDecodes = () => decodes; /* tools/wallet-routes-test.mjs: one decode per logo version */

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
  return { color: '#7df2b0', bg: '#031a13', key: '7df2b0-031a13' };
}

export function stripPng({ view, colors, scale }) {
  const k = `strip/${view.model === 'amount' ? 'p' + Math.min(view.balance, view.target) : view.balance}-${view.target}-${colors.key}@${scale}`;
  return cached(k, () => view.model === 'amount'
    ? pointsBar({ value: view.balance, threshold: view.target, color: colors.color, bg: colors.bg, scale })
    : stampStrip({ filled: view.balance, target: view.target, color: colors.color, bg: colors.bg, scale }));
}

export async function passImages({ merchant, view }) {
  const colors = stripColors(merchant), images = {};
  const lockups = [];
  for (const s of [1, 2, 3]) lockups.push(await lockupLogo(merchant, s));
  const lockup = lockups.every(Boolean);
  for (const [s, suffix] of [[1, ''], [2, '@2x'], [3, '@3x']]) {
    images['icon' + suffix + '.png'] = kiwiArt('icon' + suffix + '.png');
    images['logo' + suffix + '.png'] = lockup ? lockups[s - 1] : kiwiArt('logo' + suffix + '.png');
    images['strip' + suffix + '.png'] = await stripPng({ view, colors, scale: s });
  }
  /* not a file: tells the pass to drop its logo text, the image already names the shop */
  Object.defineProperty(images, 'lockup', { value: lockup });
  return images;
}

/* Straight-alpha « over » of src onto dst (W wide) at (ox, oy). */
function over(dst, W, src, ox, oy) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const q = (y * src.w + x) * 4, a = src.rgba[q + 3] / 255;
    if (!a) continue;
    const o = ((y + oy) * W + x + ox) * 4, b = dst[o + 3] / 255, al = a + b * (1 - a);
    for (let k = 0; k < 3; k++) dst[o + k] = Math.round((src.rgba[q + k] * a + dst[o + k] * b * (1 - a)) / al);
    dst[o + 3] = Math.round(al * 255);
  }
}

/* The pass logo when the shop has one: « kiwi × SHOP » inside Apple's 160 × 50 pt
   box, the Kiwi wordmark, a fading mint hairline, the shop's mark in paper white. */
async function lockupLogo(merchant, s) {
  const markPng = await shopTile(merchant);
  if (!markPng) return null;
  return cached(`lockup/${await hex(merchant.logoUrl)}@${s}`, async () => {
    const kiwi = await decodePng(kiwiArt('logo@3x.png')), mark = await decodePng(markPng);
    if (!kiwi || !mark) return null;
    const H = 50 * s, kh = 30 * s, kw = Math.round(kiwi.w * kh / kiwi.h), gap = 11 * s, c = s;
    const room = 160 * s - kw - 2 * gap - c, k = Math.min((mark.w < mark.h * 1.6 ? 42 : 28) * s / mark.h, room / mark.w);   /* a near-square mark stands taller */
    const mw = Math.max(1, Math.round(mark.w * k)), mh = Math.max(1, Math.round(mark.h * k)), W = kw + 2 * gap + c + mw;
    const out = new Uint8Array(W * H * 4);
    over(out, W, fit(kiwi, kw, kh), 0, Math.round((H - kh) / 2));
    /* the hairline: one point wide, mint at its middle, fading to nothing at both ends */
    const lx = kw + gap, lh = 34 * s, top = Math.round((H - lh) / 2);
    for (let y = 0; y < lh; y++) {
      const a = 0.8 * Math.max(0, 1 - Math.abs(y + 0.5 - lh / 2) / (lh / 2));
      for (let x = 0; x < c; x++) if (a) over(out, W, { w: 1, h: 1, rgba: new Uint8Array([125, 242, 176, Math.round(a * 255)]) }, lx + x, top + y);
    }
    over(out, W, fit(mark, mw, mh), kw + 2 * gap + c, Math.round((H - mh) / 2));
    return encodePng(W, H, out);
  });
}

export async function programLogo() { return kiwiArt('icon@3x.png'); }

/* The shop's mark for the web card's « Kiwi × shop » lockup, drawn like the
   Kiwi wordmark beside it: its silhouette in paper white on transparency, in a
   wide box (logos are rarely square). Decoded once per logo version; null when
   the shop has none or it cannot be read. */
export async function shopTile(merchant) {
  const bytes = logoBytes(merchant.logoUrl);
  if (!bytes) return null;
  const out = await cached(`mark/${await hex(merchant.logoUrl)}`, async () => {
    decodes++;
    const d = await decodePng(bytes);
    if (!d) return new Uint8Array(0);
    const k = keyOut(trim(d)), px = k.rgba;
    for (let q = 0; q < px.length; q += 4) { px[q] = 247; px[q + 1] = 245; px[q + 2] = 240; }
    const s = Math.min(1, 480 / k.w, 160 / k.h), f = fit(k, Math.max(1, Math.round(k.w * s)), Math.max(1, Math.round(k.h * s)));
    return encodePng(f.w, f.h, f.rgba);
  });
  return out.length ? out : null;
}
