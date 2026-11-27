#!/usr/bin/env node
// The shop's receipt logo goes on the card (functions/api/wallet/_png-read.js).
// Real logos come in every PNG flavour: Santos's is a 2500 × 2500 interlaced
// RGB, others are palettes. Each one here is encoded by hand, decoded back and
// compared pixel for pixel; then trim and fit are checked.
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { decodePng, trim, fit, keyOut, inkOn } from '../functions/api/wallet/_png-read.js';

let pass = 0;
const ok = async (name, fn) => { await fn(); pass++; console.log('  ✓', name); };

function crc(buf) { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; }
function chunk(type, data) { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; }
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/* pixel(x, y) → array of channel values (or a palette index) */
function png({ w, h, type, depth = 8, interlace = 0, pixel, plte, trns, filter = 0 }) {
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const rows = [];
  const scan = (xs) => {
    const bits = Buffer.alloc(Math.ceil(xs.length * ch * depth / 8));
    xs.forEach(([x, y], i) => pixel(x, y).forEach((v, k) => {
      const bit = (i * ch + k) * depth;
      if (depth === 8) bits[bit >> 3] = v; else bits[bit >> 3] |= v << (8 - depth - (bit & 7));
    }));
    const bpp = Math.max(1, ch * depth >> 3), out = Buffer.alloc(bits.length);
    for (let i = 0; i < bits.length; i++) out[i] = filter === 1 ? (bits[i] - (i >= bpp ? bits[i - bpp] : 0)) & 255 : bits[i];
    rows.push(Buffer.from([filter]), out);
  };
  if (!interlace) for (let y = 0; y < h; y++) scan(Array.from({ length: w }, (_, x) => [x, y]));
  else for (const [x0, y0, dx, dy] of ADAM7) for (let y = y0; y < h; y += dy) { const xs = []; for (let x = x0; x < w; x += dx) xs.push([x, y]); if (xs.length) scan(xs); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = type; ihdr[12] = interlace;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    ...(plte ? [chunk('PLTE', Buffer.from(plte))] : []), ...(trns ? [chunk('tRNS', Buffer.from(trns))] : []),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]));
}
const rgbAt = (x, y) => [(x * 37) & 255, (y * 53) & 255, (x * y) & 255];
const same = (img, f) => { for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) assert.deepEqual([...img.rgba.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)], f(x, y), `${x},${y}`); };

await ok('RGB, sub filter', async () => same(await decodePng(png({ w: 13, h: 9, type: 2, filter: 1, pixel: rgbAt })), (x, y) => [...rgbAt(x, y), 255]));
await ok('RGBA', async () => same(await decodePng(png({ w: 7, h: 5, type: 6, pixel: (x, y) => [...rgbAt(x, y), x * 30] })), (x, y) => [...rgbAt(x, y), x * 30]));
await ok('interlaced RGB (Adam7), odd sizes', async () => {
  for (const [w, h] of [[13, 9], [1, 1], [9, 2], [3, 17]]) same(await decodePng(png({ w, h, type: 2, interlace: 1, pixel: rgbAt })), (x, y) => [...rgbAt(x, y), 255]);
});
await ok('palette at 4 bits with transparency', async () => {
  const plte = [255, 0, 0, 0, 255, 0, 0, 0, 255], trns = [255, 128];
  same(await decodePng(png({ w: 5, h: 3, type: 3, depth: 4, plte, trns, pixel: (x, y) => [(x + y) % 3] })), (x, y) => { const i = (x + y) % 3; return [...plte.slice(i * 3, i * 3 + 3), i < 2 ? trns[i] : 255]; });
});
await ok('grey with alpha, interlaced', async () => same(await decodePng(png({ w: 6, h: 6, type: 4, interlace: 1, pixel: (x, y) => [x * 40, y * 40] })), (x, y) => [x * 40, x * 40, x * 40, y * 40]));
await ok('16-bit or garbage is refused, not thrown', async () => {
  assert.equal(await decodePng(new Uint8Array([1, 2, 3])), null);
  const p = png({ w: 2, h: 2, type: 2, pixel: rgbAt }); p[24] = 16;
  assert.equal(await decodePng(p), null);
});
await ok('trim cuts a white square around the drawing; fit keeps the aspect', async () => {
  const img = await decodePng(png({ w: 40, h: 30, type: 2, pixel: (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 15 ? [200, 0, 0] : [255, 255, 255]) }));
  const t = trim(img);
  assert.equal(t.w, 20); assert.equal(t.h, 5); assert.deepEqual(t.opaqueBg, [255, 255, 255, 255]);
  const f = fit(t, 160, 50);
  assert.equal(f.w, 160); assert.equal(f.rgba[(25 * 160 + 80) * 4], 200);
  assert.equal(f.rgba[(2 * 160 + 80) * 4 + 3], 0, 'margin stays transparent');
});

await ok('a logo drawn on a white square sits on any card: the white turns transparent', async () => {
  const img = trim(await decodePng(png({ w: 5, h: 1, type: 2, pixel: (x) => [[255, 255, 255], [0, 0, 0], [255, 255, 255], [128, 128, 128], [255, 255, 255]][x] })));
  assert.equal(img.w, 3);
  const k = keyOut(img);
  assert.equal(k.rgba[3], 255, 'black ink stays opaque');
  assert.equal(k.rgba[7], 0, 'white goes transparent');
  assert.ok(k.rgba[11] > 100 && k.rgba[11] < 160, 'grey edge is half transparent');
  assert.deepEqual([...k.rgba.subarray(8, 11)], [0, 0, 0], 'its colour is the ink behind the blend');
});

await ok('dark ink on a dark card is recoloured to the card text colour', () => {
  const img = { w: 1, h: 1, rgba: new Uint8Array([10, 10, 10, 255]) };
  assert.deepEqual([...inkOn(img, [5, 59, 44], [255, 255, 255]).rgba], [255, 255, 255, 255]);
  assert.deepEqual([...inkOn(img, [255, 248, 240], [10, 15, 13]).rgba], [10, 10, 10, 255], 'readable ink is left alone');
});

await ok('a logo whose data inflates past what its header allows is refused, never fully inflated', async () => {
  /* IHDR says 10 × 10 RGBA (about 410 bytes of pixels); the IDAT inflates to 64 MB of zeros. */
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(t, 'latin1'), d])) >>> 0, 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(10, 0); ihdr.writeUInt32BE(10, 4); ihdr[8] = 8; ihdr[9] = 6;
  const bomb = zlib.deflateSync(Buffer.alloc(64 * 1024 * 1024), { level: 9 });
  const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', bomb), chunk('IEND', Buffer.alloc(0))]);
  assert.ok(file.length < 200_000, 'a small file');
  const before = process.memoryUsage().arrayBuffers;
  assert.equal(await decodePng(new Uint8Array(file)), null);
  assert.ok(process.memoryUsage().arrayBuffers - before < 32 * 1024 * 1024, 'inflate stopped early');
});

console.log(`wallet-logo: ${pass} passed`);
