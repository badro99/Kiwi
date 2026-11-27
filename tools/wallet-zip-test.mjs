#!/usr/bin/env node
// A Wallet pass (.pkpass) is a plain zip. functions/api/wallet/_zip.js writes it
// without compression (Apple accepts stored entries) so a Worker needs no library.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { crc32, storeZip } from '../functions/api/wallet/_zip.js';

const utf8 = (s) => new TextEncoder().encode(s);
let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

ok('crc32 matches the standard check value', () => {
  assert.equal(crc32(utf8('123456789')), 0xCBF43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

const files = [
  { name: 'pass.json', data: utf8('{"formatVersion":1}') },
  { name: 'manifest.json', data: utf8('{"pass.json":"x"}') },
  { name: 'icon@2x.png', data: new Uint8Array([137, 80, 78, 71, 0, 255, 1, 2]) },
];
const zip = storeZip(files);

/* Read it back through the central directory, the way unzip does. */
function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'end of central directory found');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    assert.equal(dv.getUint32(local, true), 0x04034b50);
    const lnl = dv.getUint16(local + 26, true), lel = dv.getUint16(local + 28, true);
    const data = buf.subarray(local + 30 + lnl + lel, local + 30 + lnl + lel + size);
    out.push({ name, data, crc });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

ok('every entry reads back byte for byte with its crc', () => {
  const got = readZip(zip);
  assert.deepEqual(got.map((e) => e.name), files.map((f) => f.name));
  got.forEach((e, i) => { assert.deepEqual([...e.data], [...files[i].data]); assert.equal(e.crc, crc32(files[i].data)); });
});

ok('unzip -t accepts the archive', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-zip-'));
  const f = path.join(dir, 'a.pkpass');
  fs.writeFileSync(f, zip);
  const r = spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.error) { console.log('  ○ skip unzip absent'); return; }
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /No errors detected/);
});

console.log(`wallet-zip: ${pass} passed`);
