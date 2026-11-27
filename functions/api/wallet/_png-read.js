// Reads the shop's receipt logo (a PNG data URL) so the card can carry it:
// decode, trim the empty margin around the drawing, fit into Apple's boxes.
// PNG of every colour type at 8 bits, palettes at 1–8 bits, plain or Adam7.
// Anything else returns null and the card goes without a logo.

const MAX_PX = 8_000_000; /* a 2 800 × 2 800 logo; Santos's is 2 500 × 2 500 */

/* Inflates at most `cap` bytes: a few kilobytes of crafted deflate can expand
   a thousandfold, so the stream stops (null) past what the header allows. */
async function inflate(bytes, cap) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const parts = []; let n = 0;
  for (;;) {
    let r;
    try { r = await reader.read(); } catch (_) { break; }   /* trailing junk after a complete image is tolerated */
    if (r.done) break;
    n += r.value.length;
    if (n > cap) { try { await reader.cancel(); } catch (_) {} return null; }
    parts.push(r.value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const c of parts) { out.set(c, o); o += c.length; }
  return out;
}

export async function decodePng(bytes) {
  try {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (b.length < 33 || b[0] !== 137 || b[1] !== 80) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
    const idat = [];
    while (p + 8 <= b.length) {
      const len = dv.getUint32(p), t = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      const d = b.subarray(p + 8, p + 8 + len);
      if (t === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = d[8]; type = d[9]; interlace = d[12]; }
      else if (t === 'PLTE') plte = d;
      else if (t === 'tRNS') trns = d;
      else if (t === 'IDAT') idat.push(d);
      else if (t === 'IEND') break;
      p += 12 + len;
    }
    if (!w || !h || w * h > MAX_PX || interlace > 1) return null;
    const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
    if (!ch || (type !== 3 && depth !== 8) || (type === 3 && ![1, 2, 4, 8].includes(depth))) return null;
    const all = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of idat) { all.set(c, o); o += c.length; }
    /* Rows of filter byte + packed pixels; Adam7's seven passes add at most a filter byte per row per pass. */
    const rowBytes = Math.ceil((w * ch * depth) / 8) + 1;
    const raw = await inflate(all, h * rowBytes + (interlace ? 7 * (h + 8) * 2 + 7 * 8 : 0));
    if (!raw) return null;
    const bpp = Math.max(1, (ch * depth) >> 3), out = new Uint8Array(w * h * 4);
    /* Adam7 sends seven reduced images, each filtered on its own; a plain PNG is
       the one pass that covers every pixel. */
    const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
    let at = 0;
    for (const [x0, y0, dx, dy] of passes) {
      const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
      if (pw <= 0 || ph <= 0) continue;
      const stride = Math.ceil((pw * ch * depth) / 8);
      const cur = new Uint8Array(stride), prev = new Uint8Array(stride);
      for (let py = 0; py < ph; py++, at += stride + 1) {
        const f = raw[at], row = raw.subarray(at + 1, at + 1 + stride);
        for (let x = 0; x < stride; x++) {
          const a = x >= bpp ? cur[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
          let v = row[x];
          if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
          else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
          cur[x] = v & 255;
        }
        const y = y0 + py * dy;
        for (let px = 0; px < pw; px++) {
          const q = (y * w + x0 + px * dx) * 4;
          if (type === 3) {
            const bit = px * depth, idx = (cur[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
            out[q] = plte ? plte[idx * 3] : 0; out[q + 1] = plte ? plte[idx * 3 + 1] : 0; out[q + 2] = plte ? plte[idx * 3 + 2] : 0;
            out[q + 3] = trns && idx < trns.length ? trns[idx] : 255;
          } else if (type === 0 || type === 4) {
            const g = cur[px * ch]; out[q] = out[q + 1] = out[q + 2] = g; out[q + 3] = type === 4 ? cur[px * ch + 1] : 255;
          } else {
            out[q] = cur[px * ch]; out[q + 1] = cur[px * ch + 1]; out[q + 2] = cur[px * ch + 2]; out[q + 3] = type === 6 ? cur[px * ch + 3] : 255;
          }
        }
        prev.set(cur);
      }
    }
    return { w, h, rgba: out };
  } catch (_) { return null; }
}

/* The bounding box of what is drawn: alpha above 16, and on an opaque image
   anything that differs from the corner colour (a white square around a logo). */
export function trim(img) {
  const { w, h, rgba } = img, bg = [rgba[0], rgba[1], rgba[2], rgba[3]];
  const opaque = bg[3] > 240;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = (y * w + x) * 4;
    const ink = rgba[q + 3] > 16 && (!opaque || Math.abs(rgba[q] - bg[0]) + Math.abs(rgba[q + 1] - bg[1]) + Math.abs(rgba[q + 2] - bg[2]) > 36);
    if (ink) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return img;
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, out = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) out.set(rgba.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * tw * 4);
  return { w: tw, h: th, rgba: out, opaqueBg: opaque ? bg : null };
}

/* Area-average resample into a boxW × boxH canvas, centred, aspect kept.
   `fill` paints the canvas first (an icon); without it the margin is clear. */
export function fit(img, boxW, boxH, { fill = null, pad = 0 } = {}) {
  const out = new Uint8Array(boxW * boxH * 4);
  if (fill) for (let i = 0; i < boxW * boxH; i++) out.set([fill[0], fill[1], fill[2], 255], i * 4);
  const s = Math.min((boxW - 2 * pad) / img.w, (boxH - 2 * pad) / img.h);
  const dw = Math.max(1, Math.round(img.w * s)), dh = Math.max(1, Math.round(img.h * s));
  const ox = Math.floor((boxW - dw) / 2), oy = Math.floor((boxH - dh) / 2);
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y / s), sy1 = Math.max(sy0 + 1, Math.min(img.h, Math.floor((y + 1) / s)));
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x / s), sx1 = Math.max(sx0 + 1, Math.min(img.w, Math.floor((x + 1) / s)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) {
        const q = (yy * img.w + xx) * 4, al = img.rgba[q + 3];
        r += img.rgba[q] * al; g += img.rgba[q + 1] * al; b += img.rgba[q + 2] * al; a += al; n++;
      }
      const q = ((y + oy) * boxW + x + ox) * 4, al = a / n / 255;
      if (!a) continue;
      const src = [r / a, g / a, b / a];
      if (!fill) { for (let k = 0; k < 3; k++) out[q + k] = Math.round(src[k]); out[q + 3] = Math.round(al * 255); continue; }
      for (let k = 0; k < 3; k++) out[q + k] = Math.round(out[q + k] * (1 - al) + src[k] * al);
    }
  }
  return { w: boxW, h: boxH, rgba: out };
}

/* A logo drawn on an opaque square (white, usually) becomes ink on transparency:
   each pixel's alpha is its distance from the square's colour, relative to the
   strongest ink, and its colour is recovered from the blend. */
export function keyOut(img) {
  if (!img.opaqueBg) return img;
  const bg = img.opaqueBg, src = img.rgba, out = new Uint8Array(src.length);
  const dist = (q) => Math.max(Math.abs(src[q] - bg[0]), Math.abs(src[q + 1] - bg[1]), Math.abs(src[q + 2] - bg[2]));
  let D = 1;
  for (let q = 0; q < src.length; q += 4) D = Math.max(D, dist(q));
  for (let q = 0; q < src.length; q += 4) {
    const a = Math.min(1, dist(q) / D);
    out[q + 3] = Math.round(a * 255);
    for (let k = 0; k < 3; k++) out[q + k] = a ? Math.max(0, Math.min(255, Math.round((src[q + k] - bg[k] * (1 - a)) / a))) : 0;
  }
  return { w: img.w, h: img.h, rgba: out };
}

/* Ink that would vanish on the card (black logo, dark card) takes the card's
   text colour instead; readable ink keeps its own colours. */
import { contrast } from './_card.js';
export function inkOn(img, bg, fg) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let q = 0; q < img.rgba.length; q += 4) { const a = img.rgba[q + 3]; r += img.rgba[q] * a; g += img.rgba[q + 1] * a; b += img.rgba[q + 2] * a; n += a; }
  if (!n || contrast([r / n, g / n, b / n], bg) >= 2) return img;
  const out = new Uint8Array(img.rgba);
  for (let q = 0; q < out.length; q += 4) { out[q] = fg[0]; out[q + 1] = fg[1]; out[q + 2] = fg[2]; }
  return { w: img.w, h: img.h, rgba: out };
}
