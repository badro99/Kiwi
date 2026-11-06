#!/usr/bin/env node
// The pressing camera's software Code 39 reader (assets/pressing/code39-scan.js)
// decodes images drawn the way the till draws its tags (custody.js barcode():
// narrow 1, wide 3, one narrow gap between characters), through blur, noise,
// low contrast, a mirrored frame and several module widths; refuses noise and a
// value seen on a single row only.
import assert from 'node:assert/strict';
import { decodeGray, decodeRuns, rowRuns } from '../assets/pressing/code39-scan.js';

const P = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
  '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  '-':'nwnnnnwnw','*':'nwnnwnwnn',
};
// A seeded generator so a red run reproduces.
let seed = 20261106;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

function draw(text, { module = 2, wide = 3, width = 640, height = 240, contrast = 1, noise = 0, blur = 0, rowsFrom = 0, rowsTo = 1, mirror = false } = {}) {
  const bars = [];
  for (const ch of `*${text}*`) {
    P[ch].split('').forEach((w, i) => bars.push({ dark: i % 2 === 0, len: (w === 'w' ? wide : 1) * module }));
    bars.push({ dark: false, len: module });
  }
  const total = bars.reduce((s, b) => s + b.len, 0);
  const line = new Float32Array(width).fill(255);
  let x = Math.round((width - total) / 2);
  for (const b of bars) { if (b.dark) for (let i = Math.round(x); i < Math.round(x + b.len); i++) line[i] = 0; x += b.len; }
  if (mirror) line.reverse();
  const blurred = new Float32Array(width);
  for (let i = 0; i < width; i++) {
    let s = 0, n = 0;
    for (let k = -blur; k <= blur; k++) { const j = i + k; if (j >= 0 && j < width) { s += line[j]; n++; } }
    blurred[i] = s / n;
  }
  const gray = new Uint8Array(width * height).fill(255);
  for (let y = Math.floor(height * rowsFrom); y < Math.floor(height * rowsTo); y++) {
    for (let i = 0; i < width; i++) {
      const v = 128 + (blurred[i] - 128) * contrast + (rand() - 0.5) * 2 * noise;
      gray[y * width + i] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return gray;
}

const cases = [
  ['1037', {}],
  ['1054-1', { module: 3, blur: 1, noise: 18 }],
  ['20488', { module: 2, wide: 2.5, contrast: 0.45, noise: 12 }],
  ['1037', { mirror: true, blur: 1 }],
  ['998-12', { module: 4, wide: 2.4, blur: 2, noise: 25, width: 800 }],
];
for (const [text, opts] of cases) {
  const g = draw(text, opts);
  assert.equal(decodeGray(g, opts.width || 640, opts.height || 240), text, `${text} ${JSON.stringify(opts)}`);
}

// A barcode seen on one row only is not trusted.
const one = draw('1037', { rowsFrom: 120 / 240, rowsTo: 121 / 240 }); // exactly the middle sampled row
assert.equal(decodeGray(one, 640, 240), null, 'one row agreeing is not enough');

// Random bars, a blank frame and a flat grey frame decode to nothing.
for (let k = 0; k < 200; k++) {
  const runs = Array.from({ length: 40 + Math.floor(rand() * 60) }, () => 1 + Math.floor(rand() * 7));
  const got = decodeRuns(runs);
  assert.ok(got === null || /^[0-9A-Z .$/+%-]+$/.test(got), 'only Code 39 characters ever come out');
}
assert.equal(decodeGray(new Uint8Array(640 * 240).fill(255), 640, 240), null);
assert.equal(decodeGray(new Uint8Array(640 * 240).fill(128), 640, 240), null);
assert.deepEqual(rowRuns(new Uint8Array([250, 250, 10, 10, 250, 10, 250])), [2, 1, 1], "starts dark, a trailing light run is dropped");

// A start guard without a stop guard is not a value.
const half = draw('1037', {});
const cut = new Uint8Array(half);
for (let y = 0; y < 240; y++) for (let i = 330; i < 640; i++) cut[y * 640 + i] = 255;
assert.equal(decodeGray(cut, 640, 240), null, 'a cut barcode reads as nothing');

console.log('✓ code39-scan · tags decoded through blur, noise, low contrast and mirroring; noise and one-row reads refused');
