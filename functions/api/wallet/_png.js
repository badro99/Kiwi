// The card's strip image, drawn in pure JS (no canvas, no font): the web card's
// look carried into Apple Wallet, whose pass is otherwise one flat colour and the
// system font. An atlas glow that fades to the pass colour at the top and bottom
// edges (no seam), then one coin per stamp (earned ones struck mint with the Kiwi
// leaf, the reward a well with the gift, a paper coin once earned) or, for points,
// a lit bar in the band under the number Apple paints over the strip's top.
// CompressionStream does the deflate. Apple's storeCard strip is 375 × 144 points
// (a 123-point strip is scaled to fill and loses its sides).
import { crc32 } from './_zip.js';
import { decodePng } from './_png-read.js';
import { masks } from './_strip-art.js';

const W = 375, H = 144;
const RIAD = [0x05, 0x3B, 0x2C], ATLAS = [0x0B, 0x6E, 0x4F], PAPER = [0xF7, 0xF5, 0xF0], DEEP = [0x02, 0x11, 0x0C];

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const n = m ? parseInt(m[1], 16) : 0x053B2C;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

export function stripLayout(target, scale = 1) {
  const n = Math.max(1, Math.min(24, Math.round(Number(target) || 1)));
  const w = W * scale, h = H * scale, pad = 16 * scale, top = 6 * scale;
  const rows = n <= 6 ? 1 : 2, perRow = Math.ceil(n / rows);
  const slot = (w - 2 * pad) / perRow, rowH = (h - 2 * top) / rows;
  const r = Math.min(slot * 0.4, rowH * 0.4);
  const discs = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
    const left = (w - inRow * slot) / 2;
    discs.push({ cx: left + slot * ((i % perRow) + 0.5), cy: top + rowH * (row + 0.5), r });
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

let maskCache = null;
async function shapes() {
  if (!maskCache) {
    const b64 = (t) => Uint8Array.from(atob(t), (ch) => ch.charCodeAt(0));
    maskCache = { leaf: await decodePng(b64(masks.leaf)), redeem: await decodePng(b64(masks.redeem)) };
  }
  return maskCache;
}

/* Coverage of a white-on-clear mask at a point of its unit square, bilinear. */
function maskAt(m, u, v) {
  if (!m || u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  const x = u * m.w - 0.5, y = v * m.h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = (xx, yy) => (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) ? 0 : m.rgba[(yy * m.w + xx) * 4 + 3] / 255;
  return (a(x0, y0) * (1 - fx) + a(x0 + 1, y0) * fx) * (1 - fy) + (a(x0, y0 + 1) * (1 - fx) + a(x0 + 1, y0 + 1) * fx) * fy;
}

/* The field: the pass colour lit by an atlas glow from the left, faded to the
   flat colour at the top and bottom rows so the strip meets the pass seamlessly. */
function field(w, h, bg, glow) {
  const cv = canvas(w, h, bg), gx = w * glow.x, gy = h * glow.y, rx = w * glow.rx, ry = h * glow.ry;
  for (let y = 0; y < h; y++) {
    const fade = Math.pow(Math.sin(Math.PI * (y + 0.5) / h), 1.4), ny = (y - gy) / ry;
    for (let x = 0; x < w; x++) {
      const nx = (x - gx) / rx, a = glow.a * Math.exp(-(nx * nx + ny * ny)) * fade;
      if (a > 0.004) cv.blend(x, y, ATLAS, a);
    }
  }
  return cv;
}

function stops(t, list) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < list.length; i++) if (t <= list[i][0]) { const [t0, c0] = list[i - 1], [t1, c1] = list[i]; return mix(c0, c1, (t - t0) / Math.max(1e-6, t1 - t0)); }
  return list[list.length - 1][1];
}

/* A soft round shadow or halo: alpha falls off with the square of the distance. */
function halo(cv, cx, cy, radius, color, alpha) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < radius) cv.blend(x, y, color, alpha * (1 - d / radius) ** 2);
    }
  }
}

function coin(cv, d, kind, mint, k, art) {
  const { cx, cy, r } = d, s = r / 27;
  if (kind === 'on' || kind === 'ready') halo(cv, cx, cy + 4 * s, r + 8 * s, [0, 0, 0], 0.55);
  if (kind === 'ready') halo(cv, cx, cy, r + 16 * s, mint, 0.5);
  const lx = cx - 0.3 * r, ly = cy - 0.55 * r;
  for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) {
    for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const px = x + 0.5, py = y + 0.5, dist = Math.hypot(px - cx, py - cy), inside = cover(r - dist);
      if (!inside) continue;
      const edge = r - dist, below = (py - cy) / r;
      if (kind === 'on') {
        let c = stops(Math.hypot(px - lx, py - ly) / (1.6 * r), [[0, [0x9A, 0xF5, 0xC4]], [0.4, mint], [1, [0x2F, 0xA2, 0x73]]]);
        if (below > 0) c = mix(c, RIAD, 0.45 * below * Math.max(0, 1 - edge / (6 * s)));   /* inner shadow at the bottom rim */
        cv.blend(x, y, c, inside);
        cv.blend(x, y, RIAD, 0.12 * cover(3 * s - edge) * inside);                       /* struck edge */
        if (below < -0.2) cv.blend(x, y, PAPER, 0.7 * cover(1.2 * s - edge) * inside);    /* top highlight */
      } else if (kind === 'ready') {
        cv.blend(x, y, stops(Math.hypot(px - lx, py - ly) / (1.6 * r), [[0, PAPER], [0.55, PAPER], [1, [0xD9, 0xEF, 0xE2]]]), inside);
        cv.blend(x, y, mint, cover(2 * s - edge) * inside);
      } else {
        let c = mix(DEEP, mint, 0.06 * Math.max(0, below));                               /* a little light from below */
        c = mix(c, [0, 0, 0], 0.5 * Math.max(0, -below) * Math.max(0, 1 - edge / (5 * s))); /* recessed: dark under the top rim */
        cv.blend(x, y, c, inside * 0.9);
        cv.blend(x, y, mint, (kind === 'reward' ? 0.55 : 0.2) * cover(1.2 * s - edge) * inside);
      }
    }
  }
  const mark = kind === 'on' ? art.leaf : kind === 'reward' || kind === 'ready' ? art.redeem : null;
  if (!mark) return;
  const box = r * (kind === 'on' ? 1.05 : 0.8), ink = kind === 'reward' ? mint : RIAD, alpha = kind === 'reward' ? 0.9 : 1;
  for (let y = Math.floor(cy - box / 2); y <= Math.ceil(cy + box / 2); y++) {
    for (let x = Math.floor(cx - box / 2); x <= Math.ceil(cx + box / 2); x++) {
      const a = maskAt(mark, (x + 0.5 - (cx - box / 2)) / box, (y + 0.5 - (cy - box / 2)) / box);
      if (a > 0) cv.blend(x, y, ink, a * alpha);
    }
  }
}

export async function stampStrip({ filled = 0, target = 10, color, bg, scale = 1 }) {
  const L = stripLayout(target, scale), mint = rgb(color), art = await shapes();
  const cv = field(Math.round(L.w), Math.round(L.h), rgb(bg), { x: 0.08, y: 0.1, rx: 0.75, ry: 1.1, a: 0.5 });
  const got = Math.max(0, Math.min(L.discs.length, Math.round(Number(filled) || 0))), last = L.discs.length - 1;
  L.discs.forEach((d, i) => coin(cv, d, i === last ? (i < got ? 'ready' : 'reward') : (i < got ? 'on' : 'off'), mint, scale, art));
  return encodePng(cv.w, cv.h, cv.px);
}

export async function pointsBar({ value = 0, threshold = 100, color, bg, scale = 1 }) {
  /* Apple paints the points number and its label over the top of the strip, so
     the bar runs in the free band under them (y 118 to 126 of 144 points), inset
     like the fields, atlas to the brand colour, with a lit head. */
  const w = W * scale, h = H * scale, c = rgb(color), b = rgb(bg);
  const cv = field(w, h, b, { x: 0.12, y: 0.42, rx: 0.6, ry: 0.75, a: 0.55 });
  const pad = 18 * scale, bh = 8 * scale, y0 = 118 * scale, rad = bh / 2, cy = y0 + rad;
  const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / Math.max(1, Number(threshold) || 1)));
  const fillEnd = pad + (w - 2 * pad) * ratio, track = mix(b, PAPER, 0.10);
  for (let y = Math.floor(y0 - 1); y <= Math.ceil(y0 + bh + 1); y++) {
    for (let x = Math.floor(pad - 1); x <= Math.ceil(w - pad + 1); x++) {
      const px = x + 0.5, py = y + 0.5;
      const cx = Math.max(pad + rad, Math.min(w - pad - rad, px));
      const a = cover(rad - Math.hypot(px - cx, py - cy));
      if (!a) continue;
      cv.blend(x, y, track, a);
      if (ratio > 0 && px <= fillEnd) cv.blend(x, y, mix(ATLAS, c, Math.min(1, (px - pad) / Math.max(1, fillEnd - pad))), a);
    }
  }
  if (ratio > 0) {   /* the head: a brighter dot with a soft halo, where the fill stops */
    const hx = Math.max(pad + rad, fillEnd - rad), head = mix(c, PAPER, 0.45);
    halo(cv, hx, cy, 13 * scale, c, 0.3);
    for (let y = Math.floor(cy - 8 * scale); y <= Math.ceil(cy + 8 * scale); y++) {
      for (let x = Math.floor(hx - 8 * scale); x <= Math.ceil(hx + 8 * scale); x++) {
        const a = cover(7 * scale - Math.hypot(x + 0.5 - hx, y + 0.5 - cy));
        if (a) cv.blend(x, y, head, a);
      }
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
