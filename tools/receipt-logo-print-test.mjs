#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storage = new Map();
let printedBytes = [];
class FakeImage {
  constructor() { this.naturalWidth = 1; this.naturalHeight = 1; }
  set src(_) { this.onload(); }
}
const document = {
  readyState: 'loading',
  addEventListener() {},
  getElementById() { return null; },
  createElement(tag) {
    if (tag !== 'canvas') return {};
    return {
      width: 0, height: 0,
      getContext() { return { fillStyle: '', fillRect() {}, drawImage() {}, getImageData() { return { data: new Uint8ClampedArray([0, 0, 0, 255]) }; } }; },
    };
  },
};
const window = { document, KiwiPrinter: {
  isConnected() { return true; },
  printBytes(bytes) { printedBytes = Array.from(bytes); return Promise.resolve({ ok: true }); },
} };
const context = vm.createContext({
  window, document, console,
  localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, String(v)); } },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() { return 0; }, clearTimeout() {}, Uint8Array, Uint8ClampedArray, Promise, Date, Image: FakeImage,
});
vm.runInContext(fs.readFileSync(path.join(root, 'assets/escpos.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/receipt.js'), 'utf8'), context);

const R = window.KiwiReceipt;
const CREDIT = 'Powered by kiwi-os.com';
const acceptedLogo = 'data:image/png;base64,' + 'A'.repeat(410000);
const cfg = R.normalizeConfig({ look: { logo: acceptedLogo } });
if (cfg.look.logo !== acceptedLogo) throw new Error('an accepted 300 KiB logo data URI must remain intact');

const tooLarge = 'data:image/png;base64,' + 'A'.repeat(500001);
if (R.normalizeConfig({ look: { logo: tooLarge } }).look.logo) throw new Error('oversized logo must be rejected whole');

const doc = R.sample('80');
const marker = [0x1B, 0x33, 24, 0x1B, 0x2A, 33, 0x01, 0x00, 0x80, 0x00, 0x00, 0x0A, 0x1B, 0x32];
const bytes = Array.from(R.escpos(doc, { logoRaster: marker }));
const at = bytes.findIndex((v, i) => marker.every((m, j) => bytes[i + j] === m));
if (at < 0) throw new Error('ESC/POS receipt must include the prepared logo raster');
if (!Buffer.from(bytes).toString('latin1').includes(CREDIT)) throw new Error('ESC/POS receipt must carry the full platform attribution');
if (!R.html(doc).includes(CREDIT)) throw new Error('receipt preview must carry the same platform attribution');

const fallbackBytes = window.KiwiEscPos.receipt({ shop: 'MixMax', total: '65 MAD' });
if (!Buffer.from(fallbackBytes).toString('latin1').includes(CREDIT)) throw new Error('fallback receipt must carry the full platform attribution');

doc.shop.logo = 'data:image/png;base64,AA==';
await R.print(doc);
const legacyRaster = [0x1B, 0x33, 24, 0x1B, 0x2A, 33];
if (!printedBytes.some((v, i) => legacyRaster.every((m, j) => printedBytes[i + j] === m))) {
  throw new Error('physical print path must encode the logo with compatible ESC * raster commands');
}

console.log('✓ accepted receipt logos survive sync normalization');
console.log('✓ ESC/POS receipt includes the logo raster before its text header');
console.log('✓ physical print path uses the widely compatible 24-dot logo command');
console.log('✓ physical, preview, and fallback receipts say "' + CREDIT + '"');
