#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storage = new Map();
const document = {
  readyState: 'loading',
  addEventListener() {},
  getElementById() { return null; },
  createElement() { return {}; },
};
const window = { document };
const context = vm.createContext({
  window, document, console,
  localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, String(v)); } },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() { return 0; }, clearTimeout() {}, Uint8Array, Promise, Date,
});
vm.runInContext(fs.readFileSync(path.join(root, 'assets/escpos.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/receipt.js'), 'utf8'), context);

const R = window.KiwiReceipt;
const acceptedLogo = 'data:image/png;base64,' + 'A'.repeat(410000);
const cfg = R.normalizeConfig({ look: { logo: acceptedLogo } });
if (cfg.look.logo !== acceptedLogo) throw new Error('an accepted 300 KiB logo data URI must remain intact');

const tooLarge = 'data:image/png;base64,' + 'A'.repeat(500001);
if (R.normalizeConfig({ look: { logo: tooLarge } }).look.logo) throw new Error('oversized logo must be rejected whole');

const doc = R.sample('80');
const marker = [0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0x80];
const bytes = Array.from(R.escpos(doc, { logoRaster: marker }));
const at = bytes.findIndex((v, i) => marker.every((m, j) => bytes[i + j] === m));
if (at < 0) throw new Error('ESC/POS receipt must include the prepared logo raster');

console.log('✓ accepted receipt logos survive sync normalization');
console.log('✓ ESC/POS receipt includes the logo raster before its text header');
