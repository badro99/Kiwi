#!/usr/bin/env node
// The card's strip is a live picture of the stamp count: one disc per stamp of
// the target, earned ones filled in the shop's colour, the last one marked as the
// reward. functions/api/wallet/_png.js draws it in pure JS and encodes the PNG
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

const GREEN = '#0B6E4F', BONE = '#F7F5F0', BONE_RGB = [0xF7, 0xF5, 0xF0];

await ok('3x strip is 1125 × 369 RGBA with filter 0 rows', async () => {
  const img = decode(await stampStrip({ filled: 3, target: 10, color: GREEN, bg: BONE, scale: 3 }));
  assert.equal(img.w, 1125); assert.equal(img.h, 369);
  assert.ok(img.rowFilters.every((f) => f === 0));
});

await ok('a filled disc is the shop colour, an empty one is not', async () => {
  const img = decode(await stampStrip({ filled: 1, target: 10, color: GREEN, bg: BONE, scale: 2 }));
  const L = stripLayout(10, 2);
  const probe = (d) => img.px(Math.round(d.cx), Math.round(d.cy - d.r * 0.6));
  assert.deepEqual(probe(L.discs[0]).slice(0, 3), [0x0B, 0x6E, 0x4F]);
  assert.notDeepEqual(probe(L.discs[1]).slice(0, 3), [0x0B, 0x6E, 0x4F]);
  assert.deepEqual(img.px(2, 2).slice(0, 3), [0xF7, 0xF5, 0xF0]);
});

await ok('ten stamps sit in two rows of five; six fit on one row', () => {
  const ten = stripLayout(10, 1), six = stripLayout(6, 1);
  assert.equal(new Set(ten.discs.map((d) => Math.round(d.cy))).size, 2);
  assert.equal(new Set(six.discs.map((d) => Math.round(d.cy))).size, 1);
  assert.ok(ten.discs.every((d) => d.cx - d.r >= 0 && d.cx + d.r <= 375 && d.cy - d.r >= 0 && d.cy + d.r <= 123));
});

await ok('the reward disc looks different from a plain empty disc', async () => {
  const img = decode(await stampStrip({ filled: 0, target: 10, color: GREEN, bg: BONE, scale: 2 }));
  const L = stripLayout(10, 2);
  const ring = (d) => img.px(Math.round(d.cx + d.r * 0.8), Math.round(d.cy));
  assert.notDeepEqual(ring(L.discs[9]), ring(L.discs[8]));
});

await ok('a full card fills every disc', async () => {
  const img = decode(await stampStrip({ filled: 10, target: 10, color: GREEN, bg: BONE, scale: 1 }));
  const L = stripLayout(10, 1);
  for (const d of L.discs) assert.deepEqual(img.px(Math.round(d.cx), Math.round(d.cy - d.r * 0.6)).slice(0, 3), [0x0B, 0x6E, 0x4F]);
});

await ok('points bar fills to the ratio', async () => {
  const img = decode(await pointsBar({ value: 50, threshold: 100, color: GREEN, bg: BONE, scale: 1 }));
  /* The bar runs in the band under the points number, which Apple paints over the strip's top. */
  const y = Math.round(img.h * 107 / 123);
  assert.notDeepEqual(img.px(Math.round(img.w * 0.3), y).slice(0, 3), BONE_RGB, 'filled part painted');
  assert.deepEqual(img.px(Math.round(img.w * 0.75), y).slice(0, 3), img.px(Math.round(img.w * 0.9), y).slice(0, 3), 'past the fill, one even track');
  assert.notDeepEqual(img.px(Math.round(img.w * 0.3), y).slice(0, 3), img.px(Math.round(img.w * 0.75), y).slice(0, 3));
  for (const yy of [0.2, 0.5, 0.7]) for (const xx of [0.1, 0.3, 0.6]) assert.deepEqual(img.px(Math.round(img.w * xx), Math.round(img.h * yy)).slice(0, 3), BONE_RGB, 'the number\'s area stays clear');
  assert.deepEqual(img.px(2, y).slice(0, 3), BONE_RGB, 'side margin');
});

console.log(`wallet-strip: ${pass} passed`);
