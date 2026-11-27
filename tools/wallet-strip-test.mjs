#!/usr/bin/env node
// The card's strip is a live picture of the count: one coin per stamp of the
// target (earned ones struck mint with the Kiwi leaf, the last one the reward), or
// a lit bar for points, on the web card's atlas glow. functions/api/wallet/_png.js draws it in pure JS and encodes the PNG
// with CompressionStream, so a Pages Function needs no canvas.
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { stampStrip, pointsBar, stripLayout } from '../functions/api/wallet/_png.js';

let pass = 0;
const ok = async (name, fn) => { await fn(); pass++; console.log('  ✓', name); };

function decode(png) {
  const b = Buffer.from(png);
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let p = 8, w = 0, h = 0;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') { w = b.readUInt32BE(p + 8); h = b.readUInt32BE(p + 12); assert.equal(b[p + 16], 8); assert.equal(b[p + 17], 6); }
    if (type === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = (x, y) => { const o = y * (w * 4 + 1) + 1 + x * 4; return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]]; };
  return { w, h, px, rowFilters: Array.from({ length: h }, (_, y) => raw[y * (w * 4 + 1)]) };
}

const MINT = '#7DF2B0', NUIT = '#031A13', NUIT_RGB = [0x03, 0x1A, 0x13];
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

await ok('the strip is Apple\'s store-card size: 1125 × 432 at 3x, filter 0 rows', async () => {
  const img = decode(await stampStrip({ filled: 3, target: 10, color: MINT, bg: NUIT, scale: 3 }));
  assert.equal(img.w, 1125); assert.equal(img.h, 432);
  assert.ok(img.rowFilters.every((f) => f === 0));
});

await ok('top and bottom rows are the pass background, so the strip has no seam', async () => {
  for (const img of [decode(await stampStrip({ filled: 4, target: 10, color: MINT, bg: NUIT, scale: 2 })), decode(await pointsBar({ value: 120, threshold: 300, color: MINT, bg: NUIT, scale: 2 }))]) {
    for (const x of [0, Math.round(img.w * 0.2), Math.round(img.w / 2), img.w - 1]) {
      assert.deepEqual(img.px(x, 0).slice(0, 3), NUIT_RGB);
      assert.deepEqual(img.px(x, img.h - 1).slice(0, 3), NUIT_RGB);
    }
  }
});

await ok('an earned stamp is a mint coin struck with the dark Kiwi leaf; an empty well stays dark', async () => {
  const img = decode(await stampStrip({ filled: 1, target: 10, color: MINT, bg: NUIT, scale: 2 }));
  const L = stripLayout(10, 2), c0 = L.discs[0], c1 = L.discs[1];
  const rim = img.px(Math.round(c0.cx - c0.r * 0.72), Math.round(c0.cy));
  assert.ok(rim[1] > 150 && rim[1] > rim[0], `coin face is mint ${rim}`);
  let leaf = 0;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (lum(img.px(Math.round(c0.cx + dx * c0.r / 20), Math.round(c0.cy + dy * c0.r / 20))) < 70) leaf++;
  assert.ok(leaf > 20, `the leaf is printed on the coin (${leaf} dark samples)`);
  assert.ok(lum(img.px(Math.round(c1.cx - c1.r * 0.72), Math.round(c1.cy))) < 60, 'empty well is dark');
});

await ok('ten stamps sit in two rows of five; six fit on one row; all inside 375 × 144', () => {
  const ten = stripLayout(10, 1), six = stripLayout(6, 1);
  assert.equal(new Set(ten.discs.map((d) => Math.round(d.cy))).size, 2);
  assert.equal(new Set(six.discs.map((d) => Math.round(d.cy))).size, 1);
  assert.ok(ten.discs.every((d) => d.cx - d.r >= 0 && d.cx + d.r <= 375 && d.cy - d.r >= 0 && d.cy + d.r <= 144));
});

await ok('the reward well carries the gift and looks different from a plain well', async () => {
  const img = decode(await stampStrip({ filled: 0, target: 10, color: MINT, bg: NUIT, scale: 2 }));
  const L = stripLayout(10, 2);
  let gift = 0, plain = 0;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    const at = (d) => lum(img.px(Math.round(d.cx + dx * d.r / 24), Math.round(d.cy + dy * d.r / 24)));
    if (at(L.discs[9]) > 120) gift++;
    if (at(L.discs[8]) > 120) plain++;
  }
  assert.ok(gift > 15 && plain === 0, `gift ${gift}, plain ${plain}`);
});

await ok('a full card: every coin is struck, the reward coin turns paper', async () => {
  const img = decode(await stampStrip({ filled: 10, target: 10, color: MINT, bg: NUIT, scale: 1 }));
  const L = stripLayout(10, 1);
  for (const d of L.discs.slice(0, 9)) { const p = img.px(Math.round(d.cx - d.r * 0.72), Math.round(d.cy)); assert.ok(p[1] > 150 && p[1] > p[0], `coin ${p}`); }
  const r = L.discs[9], paper = img.px(Math.round(r.cx - r.r * 0.72), Math.round(r.cy));
  assert.ok(paper[0] > 200 && paper[1] > 200 && paper[2] > 190, `reward coin is paper ${paper}`);
});

await ok('points bar fills to the ratio, under the number, inset like the fields', async () => {
  const img = decode(await pointsBar({ value: 50, threshold: 100, color: MINT, bg: NUIT, scale: 1 }));
  assert.equal(img.h, 144);
  /* The bar runs in the band under the points number, which Apple paints over the strip's top. */
  const y = Math.round(img.h * 122 / 144);
  const filled = img.px(Math.round(img.w * 0.3), y), track = img.px(Math.round(img.w * 0.75), y);
  assert.ok(filled[1] > 120, `filled part is lit ${filled}`);
  assert.ok(lum(track) < lum(filled) - 40, 'past the fill, a darker track');
  assert.deepEqual(img.px(Math.round(img.w * 0.75), y).slice(0, 3), img.px(Math.round(img.w * 0.9), y).slice(0, 3), 'one even track');
  for (const yy of [0.2, 0.45, 0.65]) for (const xx of [0.1, 0.3, 0.6]) assert.ok(lum(img.px(Math.round(img.w * xx), Math.round(img.h * yy))) < 70, 'the number\'s area stays dark: only a glow');
  assert.ok(lum(img.px(3, y)) < 70, 'side margin');
});

console.log(`wallet-strip: ${pass} passed`);
