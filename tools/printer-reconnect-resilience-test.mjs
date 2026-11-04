import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/printer/transports.js', 'utf8');
for (const mode of ['throw', 'reject', 'open']) {
  const navigator = { usb: { requestDevice() {}, getDevices() {
    const error = Object.assign(new Error('refused'), { name: 'NetworkError' });
    if (mode === 'throw') throw error;
    if (mode === 'reject') return Promise.reject(error);
    return Promise.resolve([{ open: () => Promise.reject(error) }]);
  } } };
  const window = {};
  vm.runInNewContext(source, { window, navigator, Promise, Date });
  const transport = window.__kiwiPrinterTransports({});
  assert.equal(await transport.reconnectUsb(), null);
  assert.match(transport.usb.failure.reason, /usb-(enumeration|reconnect)-NetworkError/);
  assert.ok(transport.usb.failure.at > 0);
  assert.equal(transport.usb.failures.length, 1, 'failure recorded in transport state');
}
console.log('PASS USB enumeration and reconnect failures retain reason and time');
