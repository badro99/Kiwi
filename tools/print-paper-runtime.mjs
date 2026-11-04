// Actual printer core, transport factory and setup UI with inert device edges.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
export function printerWorld() {
  const nodes = new Map(), disk = new Map(), timers = [], notices = [];
  const element = tag => {
    const children = new Map(), listeners = new Map(), attrs = new Map();
    const el = { tag, style: { setProperty() {} }, value: '', innerHTML: '', textContent: '', disabled: false,
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      setAttribute(k,v) { attrs.set(k,v); }, getAttribute: k => attrs.get(k),
      addEventListener: (event, fn) => listeners.set(event, fn),
      click() { return listeners.get('click')?.call(el, { target: el }); },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, element(selector)); return children.get(selector); },
      querySelectorAll: () => [], focus() {},
      remove() { nodes.delete(el.id); },
      insertAdjacentHTML(_where, html) { el.innerHTML += html; },
    };
    return el;
  };
  const document = { createElement: element, getElementById: id => nodes.get(id) || null,
    head: { appendChild: el => nodes.set(el.id, el) }, body: { appendChild: el => nodes.set(el.id, el) },
    addEventListener() {}, documentElement: { lang: 'fr' } };
  let printed = 0;
  const c = vm.createContext(deadlineVmContext({ console, document, navigator: {}, Uint8Array,
    localStorage: { getItem: k => disk.get(k) || null, setItem: (k,v) => disk.set(k,String(v)), removeItem: k => disk.delete(k) },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {},
    requestIdleCallback() {}, addEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
    Kiwi: { toast: message => notices.push(message) },
    fetch: async () => ({ ok: false, status: 503, json: async () => null }),
    print: () => { printed++; },
  }));
  c.window = c;
  for (const file of ['assets/printer/transports.js', 'assets/printer-bridge.js', 'assets/printer/pairing-lang.js', 'assets/printer/pairing-ui.js'])
    vm.runInContext(deadlineVmSource(read(file)), c, { filename: file });
  return { c, nodes, disk, timers, notices, printed: () => printed };
}
export async function checkPrinterPaper() {
  const w = printerWorld(), api = w.c.KiwiPrinter;
  api.setConfig({ osPrinter: 'Old OS printer', paper: '58' });
  await api.openSetup({ kind: 'receipt' });
  let panel = w.nodes.get('kpr-ov');
  const input = (id, value) => { panel.querySelector('#kpr-' + id).value = value; };
  input('ip', '999.1.2.3'); input('port', '9100');
  panel.querySelector('#kpr-save').click();
  assert.equal(api.getConfig().osPrinter, 'Old OS printer', 'invalid IP preserves the previous target');
  assert.equal(w.nodes.get('kpr-ov'), panel, 'validation keeps the editor open');
  input('ip', '192.168.1.50'); input('port', '65536');
  panel.querySelector('#kpr-save').click();
  assert.equal(api.getConfig().ip, '', 'invalid port never saves');
  input('port', '9100'); input('paper', '58'); input('model', 'escpos'); input('label', '50x20');
  panel.querySelector('#kpr-save').click();
  assert.equal(api.getConfig().ip, '192.168.1.50');
  assert.equal(api.getConfig().osPrinter, '', 'network choice clears the OS target');
  assert.equal(api.getConfig().paper, '58');
  await api.openSetup({ kind: 'receipt' }); panel = w.nodes.get('kpr-ov');
  panel.querySelector('#kpr-os-sel').value = 'New OS printer';
  panel.querySelector('#kpr-os-save').click();
  assert.equal(api.getConfig().ip, '', 'OS choice clears the network target');
  assert.equal(api.getConfig().osPrinter, 'New OS printer');
  const persisted = JSON.parse(w.disk.get('kiwiPrinterCfg'));
  assert.equal(persisted.osPrinter, 'New OS printer');
  assert.equal(persisted.paper, '58', 'changing transport retains paper width');
  const result = api.browserPrintHTML('<article>Credit AV-test · 12.55 MAD</article>', '58', 'Credit AV-test');
  assert.equal(result.ok, true);
  const root = w.nodes.get('kpr-print-root');
  assert.equal(root.getAttribute('data-print-title'), 'Credit AV-test');
  assert.ok(root.innerHTML.includes('12.55 MAD'));
  w.timers.find(t => t.delay === 60).fn();
  assert.equal(w.printed(), 1, 'assembled document reaches system print');
  w.timers.find(t => t.delay === 600).fn();
  assert.equal(w.nodes.has('kpr-print-root'), false, 'printed document is cleaned up');
  console.log('✓ printer paper: real setup validation, mutually exclusive targets, durable width and document print lifecycle');
}
