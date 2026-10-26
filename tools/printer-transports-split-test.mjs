/* Preuve exacte et exécution des suites comportementales sur l’assemblage livré. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import printerSource from './printer-test-source.cjs';
const read = file => fs.readFileSync(file, 'utf8');
const map = JSON.parse(read('tools/fixtures/printer/transports/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/printer/transports/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
assert.equal(printerSource(), original, 'reconstruction intégrale exacte depuis les corps actuels');
const part = read('assets/printer/transports.js');
const core = read('assets/printer-bridge.js');
for (const segment of map.segments) {
  const start = '  /* transport-part:' + segment.name + ' */\n';
  const end = '  /* /transport-part:' + segment.name + ' */';
  const body = part.slice(part.indexOf(start) + start.length, part.indexOf(end));
  assert.ok(original.includes(body));
  assert.ok(!core.includes(body));
}
const inert = { window: {} };
vm.runInNewContext(part, inert);
assert.deepEqual(Object.keys(inert.window), ['__kiwiPrinterTransports'], 'enregistrement sans aucun accès matériel');
// Doubles matériels uniquement : vérifier le partage d’état et les écritures découpées.
{
  const context = { window: {}, navigator: {}, Promise, Uint8Array,
    setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {} };
  vm.runInNewContext(part, context);
  const transport = context.window.__kiwiPrinterTransports({});
  const bluetooth = [], usb = [];
  transport.bt.device = { gatt: { connected: true } };
  transport.bt.chr = { properties: { writeWithoutResponse: true },
    writeValueWithoutResponse: bytes => { bluetooth.push(bytes.length); return Promise.resolve(); } };
  assert.equal(transport.btConnected(), true);
  await transport.btWrite(new Uint8Array(400));
  assert.deepEqual(bluetooth, [180, 180, 40]);
  transport.usb.ep = 2;
  transport.usb.device = { opened: true, transferOut: (ep, bytes) => {
    assert.equal(ep, 2); usb.push(bytes.length); return Promise.resolve();
  } };
  assert.equal(transport.usbConnected(), true);
  await transport.usbWrite(new Uint8Array(40000));
  assert.equal(usb.reduce((a, b) => a + b, 0), 40000);
  assert.ok(usb.length > 1);
  assert.equal(transport.nativeSocket(), null);
}
for (const file of fs.readdirSync('.').filter(f => f.endsWith('.html'))) {
  const html = read(file);
  if (!/<script[^>]+src=["'][^"']*assets\/printer-bridge\.js/.test(html)) continue;
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)];
  const index = tags.findIndex(t => /assets\/printer-bridge\.js/.test(t[1]));
  assert.match(tags[index - 1][1], /^assets\/printer\/transports\.js\?v=\d+$/);
  assert.ok(!/\basync\b/.test(tags[index - 1][0]));
  assert.equal(/\bdefer\b/.test(tags[index - 1][0]), /\bdefer\b/.test(tags[index][0]));
}
assert.match(read('kiwi-sw.js'), /'\/assets\/printer\/transports\.js\?v=\d+'/);   // any stamp: bump-stamp moves it
for (const file of ['printer-station-unicode-test.mjs', 'station-printer-routing-test.mjs', 'escpos-unsupported-test.mjs', 'print-slow-bridge-test.mjs', 'print-relay-idempotency-test.mjs', 'relay-print-verdict-test.mjs']) {
  const result = spawnSync(process.execPath, ['tools/' + file], { encoding: 'utf8', env: { ...process.env, KIWI_PRINTER_RUNTIME: '1' } });
  assert.equal(result.status, 0, file + '\n' + result.stdout + result.stderr);
}
console.log('✓ transports : reconstruction exacte, fabrique inerte, ordre exhaustif, précache et 6 suites sur le code livré');
