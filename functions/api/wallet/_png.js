// The card's strip image, drawn in pure JS: one disc per stamp of the target,
// earned ones filled in the shop's colour with a check, the reward disc marked
// by an inner ring. Only each disc's bounding box is painted, so a 3x strip
// costs a few hundred thousand pixel operations, then CompressionStream does the
// deflate. Apple's storeCard strip is 375 × 123 points.
import { crc32 } from './_zip.js';

const W = 375, H = 123;

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const n = m ? parseInt(m[1], 16) : 0x053B2C;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

export function stripLayout(target, scale = 1) {
  const n = Math.max(1, Math.min(24, Math.round(Number(target) || 1)));
  const w = W * scale, h = H * scale, pad = 14 * scale;
  const rows = n <= 6 ? 1 : 2, perRow = Math.ceil(n / rows);
  const slot = (w - 2 * pad) / perRow, rowH = h / rows;
  const r = Math.min(slot * 0.4, rowH * 0.38);
  const discs = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
    const left = (w - inRow * slot) / 2;
    discs.push({ cx: left + slot * ((i % perRow) + 0.5), cy: rowH * (row + 0.5), r });
  }
  return { w, h, discs };
}

function canvas(w, h, bg) {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255; }
  return {
    w, h, px,
    blend(x, y, c, a) {
      if (a <= 0 || x < 0 || y < 0 || x >= w || y >= h) return;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(px[o + k] + (c[k] - px[o + k]) * Math.min(1, a));
    },
  };
}

const cover = (edge) => Math.max(0, Math.min(1, edge + 0.5));

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function drawDisc(cv, d, state, color, bg) {
  const { cx, cy, r } = d;
  const tint = mix(bg, color, 0.12), faint = mix(bg, color, 0.38);
  const ringW = Math.max(1.5, r * 0.08);
  const check = [[-0.36, 0.02], [-0.1, 0.28], [0.38, -0.24]].map(([x, y]) => [cx + x * r, cy + y * r]);
  const checkW = r * 0.09;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const px = x + 0.5, py = y + 0.5, dist = Math.hypot(px - cx, py - cy);
      const inside = cover(r - dist);
      if (!inside) continue;
      if (state.filled) {
        cv.blend(x, y, color, inside);
        const c = Math.min(segDist(px, py, ...check[0], ...check[1]), segDist(px, py, ...check[1], ...check[2]));
        cv.blend(x, y, bg, cover(checkW - c));
      } else {
        cv.blend(x, y, tint, inside);
        cv.blend(x, y, faint, Math.min(inside, cover(dist - (r - ringW))));
        if (state.reward) {                     /* inner ring: the reward slot */
          const band = Math.min(cover(dist - r * 0.72), cover(r * 0.86 - dist));
          cv.blend(x, y, color, band);
        }
      }
    }
  }
}

export async function encodePng(w, h, rgba) {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w); iv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function stampStrip({ filled = 0, target = 10, color, bg, scale = 1 }) {
  const L = stripLayout(target, scale), c = rgb(color), b = rgb(bg);
  const cv = canvas(Math.round(L.w), Math.round(L.h), b);
  const got = Math.max(0, Math.min(L.discs.length, Math.round(Number(filled) || 0)));
  L.discs.forEach((d, i) => drawDisc(cv, d, { filled: i < got, reward: i === L.discs.length - 1 }, c, b));
  return encodePng(cv.w, cv.h, cv.px);
}

export async function pointsBar({ value = 0, threshold = 100, color, bg, scale = 1 }) {
  const w = W * scale, h = H * scale, c = rgb(color), b = rgb(bg);
  const cv = canvas(w, h, b);
  const pad = 22 * scale, bh = h * 0.22, y0 = (h - bh) / 2, rad = bh / 2;
  const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / Math.max(1, Number(threshold) || 1)));
  const fillEnd = pad + (w - 2 * pad) * ratio, tint = mix(b, c, 0.14);
  for (let y = Math.floor(y0 - 1); y <= Math.ceil(y0 + bh + 1); y++) {
    for (let x = Math.floor(pad - 1); x <= Math.ceil(w - pad + 1); x++) {
      const px = x + 0.5, py = y + 0.5;
      const cx = Math.max(pad + rad, Math.min(w - pad - rad, px));
      const a = cover(rad - Math.hypot(px - cx, py - (y0 + rad)));
      if (!a) continue;
      cv.blend(x, y, tint, a);
      if (px <= fillEnd) cv.blend(x, y, c, a);
    }
  }
  return encodePng(cv.w, cv.h, cv.px);
}

/* The pass icon when the shop has no logo: one earned stamp on the card colour. */
export async function stampIcon({ color, bg, size }) {
  const c = rgb(color), b = rgb(bg), cv = canvas(size, size, b);
  drawDisc(cv, { cx: size / 2, cy: size / 2, r: size * 0.36 }, { filled: true }, c, b);
  return encodePng(size, size, cv.px);
}
