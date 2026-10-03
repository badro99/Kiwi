// Read-only PNG decoding for screenshot contrast checks. No image editing.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

export function decodeScreenshot(bytes) {
  const png = Buffer.from(bytes), chunks = [];
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG screenshot required');
  let width, height, channels;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8, '8-bit screenshot required');
      assert.ok(data[9] === 2 || data[9] === 6, 'RGB or RGBA screenshot required');
      assert.equal(data[12], 0, 'Non-interlaced screenshot required');
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') chunks.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  assert.equal(raw.length, height * (stride + 1), 'Complete screenshot scanlines');
  const pixels = new Uint8Array(width * height * channels);
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0, offset = 0; y < height; y++) {
    const filter = raw[offset++]; assert.ok(filter <= 4, 'Known PNG filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const a = x >= channels ? pixels[index - channels] : 0;
      const b = y ? pixels[index - stride] : 0;
      const c = y && x >= channels ? pixels[index - stride - channels] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[index] = (raw[offset++] + prediction) & 255;
    }
  }
  return { width, height, channels, pixels };
}

export function paintedActionColours(bytes, expectedInk, bounds = null) {
  const { width, height, channels, pixels } = decodeScreenshot(bytes);
  const counts = new Map();
  let nearestInk, distance = Infinity;
  // Exclude rounded corners, border and shadow; the label and fill remain.
  const box = bounds ? { x: Math.floor(bounds.x), y: Math.floor(bounds.y),
    width: Math.floor(bounds.width), height: Math.floor(bounds.height) } : { x: 0, y: 0, width, height };
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
    'Painted action must be inside the captured frame');
  const inset = Math.min(5, Math.floor(Math.min(box.width, box.height) / 8));
  for (let y = box.y + inset; y < box.y + box.height - inset; y++) for (let x = box.x + inset; x < box.x + box.width - inset; x++) {
    const offset = (y * width + x) * channels;
    const colour = [...pixels.subarray(offset, offset + 3)];
    if (channels === 4 && pixels[offset + 3] !== 255) continue;
    const key = colour.join(','); counts.set(key, (counts.get(key) || 0) + 1);
    const d = colour.reduce((sum, c, i) => sum + (c - expectedInk[i]) ** 2, 0);
    if (d < distance) { distance = d; nearestInk = colour; }
  }
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.ok(dominant && nearestInk, 'Opaque action pixels required');
  assert.ok(distance <= 12, 'The declared action ink must actually appear in the screenshot');
  return { background: dominant[0].split(',').map(Number), foreground: nearestInk,
    backgroundPixels: dominant[1], inkDistance: distance };
}
