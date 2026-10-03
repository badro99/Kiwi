#!/usr/bin/env node
// Static storyboard counterpart of the existing native alpha-only logo mask.
// Nothing runs on import. Default/--check is read-only; --write requires owner
// approval and only creates the separate launch imageset, never source artwork.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { decodeScreenshot } from './painted-png.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_DIR = 'app/ios/App/App/Assets.xcassets/KiwiBrandIcon.imageset';
export const OUTPUT_DIR = 'app/ios/App/App/Assets.xcassets/KiwiLaunchMark.imageset';
export const SOURCES = Object.freeze([
  { name: 'kiwi-brand.png', output: 'kiwi-launch.png', scale: '1x', size: 256,
    sha256: 'c2a722d3c7b35edb996c15954c1d2daee39d295291cfd5d2a637fbe42d8ec482' },
  { name: 'kiwi-brand@2x.png', output: 'kiwi-launch@2x.png', scale: '2x', size: 512,
    sha256: '265f3ed5eb17a5e545d0f701960b3b05a8ca1186ea358e53c45ad56d00c3f4c4' },
  { name: 'kiwi-brand@3x.png', output: 'kiwi-launch@3x.png', scale: '3x', size: 768,
    sha256: '94dfd6c844db23fbe91d75988f21d7c0d655d65fd5051cd81e504ba2c3970de9' },
]);
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const COLOUR_CHUNKS = new Set(['gAMA', 'cHRM', 'sRGB', 'iCCP']);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function coverageAlpha(green) {
  assert.ok(Number.isInteger(green) && green >= 0 && green <= 255, '8-bit green channel required');
  // Straight-alpha PNG: never divide RGB by this coverage or premultiply it.
  return Math.round(255 * Math.max(0, Math.min(1, 6.375 * green / 255 - 0.8)));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, 4, 'ascii');
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, data.length + 8)), data.length + 8);
  return result;
}

export function pngChunks(bytes) {
  const png = Buffer.from(bytes), result = [];
  assert.ok(png.subarray(0, 8).equals(SIGNATURE), 'PNG signature required');
  let offset = 8;
  while (offset < png.length) {
    assert.ok(offset + 12 <= png.length, 'Complete PNG chunk required');
    const length = png.readUInt32BE(offset), end = offset + length + 12;
    assert.ok(end <= png.length, 'PNG chunk length is in bounds');
    const type = png.toString('ascii', offset + 4, offset + 8);
    assert.equal(png.readUInt32BE(end - 4), crc32(png.subarray(offset + 4, end - 4)), type + ': valid CRC');
    result.push({ type, data: png.subarray(offset + 8, end - 4), bytes: png.subarray(offset, end) });
    offset = end;
    if (type === 'IEND') break;
  }
  assert.equal(offset, png.length, 'No trailing PNG bytes');
  assert.equal(result.at(-1)?.type, 'IEND', 'PNG has an end chunk');
  return result;
}

export function approvedSource(spec) {
  const bytes = fs.readFileSync(path.join(ROOT, SOURCE_DIR, spec.name));
  assert.equal(sha256(bytes), spec.sha256, spec.name + ': approved source bytes unchanged');
  const png = decodeScreenshot(bytes);
  assert.equal(png.width, spec.size, spec.name + ': original width');
  assert.equal(png.height, spec.size, spec.name + ': original height');
  assert.equal(png.channels, 3, spec.name + ': approved opaque RGB source');
  return { bytes, png };
}

export function deriveLaunchMark(sourceBytes) {
  const source = decodeScreenshot(sourceBytes);
  assert.equal(source.channels, 3, 'Derivation accepts the opaque RGB master only');
  const stride = source.width * 4, rows = Buffer.alloc(source.height * (stride + 1));
  for (let y = 0; y < source.height; y++) {
    // Each row uses PNG filter 0. Compression is lossless; RGB is byte-exact.
    for (let x = 0; x < source.width; x++) {
      const from = (y * source.width + x) * 3, to = y * (stride + 1) + 1 + x * 4;
      rows[to] = source.pixels[from];
      rows[to + 1] = source.pixels[from + 1];
      rows[to + 2] = source.pixels[from + 2];
      rows[to + 3] = coverageAlpha(source.pixels[from + 1]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(source.width, 0); header.writeUInt32BE(source.height, 4);
  header[8] = 8; header[9] = 6; // Eight-bit, straight-alpha RGBA, no interlace.
  // Preserve colour interpretation too, not only pixel bytes. Do not copy
  // authoring metadata, EXIF dimensions, or the opaque master's text chunks.
  const colour = pngChunks(sourceBytes).filter(c => COLOUR_CHUNKS.has(c.type)).map(c => c.bytes);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), ...colour,
    chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function imageSetContents() {
  return JSON.stringify({
    images: SOURCES.map(s => ({ filename: s.output, idiom: 'universal', scale: s.scale })),
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n';
}

export function verifyLaunchMark(spec) {
  const { bytes, png: source } = approvedSource(spec);
  const destination = path.join(ROOT, OUTPUT_DIR, spec.output);
  assert.ok(fs.existsSync(destination), spec.output + ': static launch derivative missing (no auto-generation)');
  const outputBytes = fs.readFileSync(destination), output = decodeScreenshot(outputBytes);
  assert.equal(output.width, source.width, spec.output + ': width unchanged');
  assert.equal(output.height, source.height, spec.output + ': height unchanged');
  assert.equal(output.channels, 4, spec.output + ': RGBA required');
  for (let pixel = 0; pixel < source.width * source.height; pixel++) {
    const from = pixel * 3, to = pixel * 4;
    assert.ok(source.pixels[from] === output.pixels[to] &&
      source.pixels[from + 1] === output.pixels[to + 1] &&
      source.pixels[from + 2] === output.pixels[to + 2], spec.output + ': RGB changed at pixel ' + pixel);
    assert.equal(output.pixels[to + 3], coverageAlpha(source.pixels[from + 1]),
      spec.output + ': alpha differs from native coverage at pixel ' + pixel);
  }
  const profiles = png => pngChunks(png).filter(c => COLOUR_CHUNKS.has(c.type)).map(c => c.bytes.toString('hex'));
  assert.deepEqual(profiles(outputBytes), profiles(bytes), spec.output + ': colour interpretation unchanged');
  return output;
}

export function verifyImageSet() {
  for (const source of SOURCES) verifyLaunchMark(source);
  const contents = fs.readFileSync(path.join(ROOT, OUTPUT_DIR, 'Contents.json'), 'utf8');
  assert.deepEqual(JSON.parse(contents), JSON.parse(imageSetContents()), 'Exact scale-to-file image catalog mapping');
}

function writeImageSet() {
  // Prepare and validate every approved source before creating any destination.
  const files = SOURCES.map(s => ({ name: s.output, bytes: deriveLaunchMark(approvedSource(s).bytes) }));
  files.push({ name: 'Contents.json', bytes: Buffer.from(imageSetContents()) });
  const destination = path.join(ROOT, OUTPUT_DIR);
  for (const file of files) {
    const target = path.join(destination, file.name);
    if (fs.existsSync(target)) assert.ok(fs.readFileSync(target).equals(file.bytes),
      file.name + ': refusing to overwrite a different existing derivative');
  }
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) {
    const target = path.join(destination, file.name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, file.bytes, { flag: 'wx' });
  }
  verifyImageSet();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 1 && (!args.length || ['--check', '--write'].includes(args[0])),
    'Usage: node tools/native-launch-mark.mjs [--check | --write]');
  if (args[0] === '--write') writeImageSet(); // Owner-approved execution only.
  else verifyImageSet();
  console.log('Static launch mark: approved RGB, dimensions, colour metadata and alpha verified');
}
