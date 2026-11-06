import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/caisse-print-recovery.js', 'utf8');
const listeners = {}, nodes = new Map(), opens = [];
const stack = { appendChild(el) { nodes.set(el.id, el); } };
const document = { body: stack, getElementById: id => id === 'toast-stack' ? stack : nodes.get(id), createElement: () => ({ style: {}, addEventListener(name, fn) { this[name] = fn; }, remove() { nodes.delete(this.id); } }) };
const window = { addEventListener: (name, fn) => { listeners[name] = fn; }, KiwiCaisseLang: { tr: s => 'translated:' + s }, KiwiPrinter: { openSetup: opts => opens.push(opts) } };
vm.runInNewContext(source, { window, document });
listeners['kiwi:kitchen-print-unprinted']({ detail: { count: 2 } });
const button = nodes.get('caisse-print-recovery');
assert.equal(button.textContent, 'translated:Voir les tickets non imprimés (2)');
assert.equal(button.style.pointerEvents, 'auto', 'recovery entry remains clickable inside the informational toast stack');
button.click();
assert.equal(opens[0].kind, 'recovery', 'opens the same printer recovery UI');
listeners['kiwi:kitchen-print-unprinted']({ detail: { count: 0 } });
assert.equal(nodes.size, 0, 'resolved failures remove the entry');
assert.match(fs.readFileSync('assets/printer-bridge.js', 'utf8'), /assets\/caisse-print-recovery.js/);
console.log('PASS caisse failure entry is translated, counted and opens existing UI');
// The first failed receipt loads and opens the entry without an extra shell tag.
{
  const bridge = fs.readFileSync('assets/printer-bridge.js', 'utf8');
  const marker = bridge.indexOf('/* Recovery entry is loaded');
  assert.ok(marker >= 0);
  const callbacks = {}, scripts = [], elements = new Map();
  const document = { body: { appendChild(el) { elements.set(el.id, el); } },
    head: { appendChild(el) { scripts.push(el); } },
    getElementById(id) { return elements.get(id) || scripts.find(el => el.id === id); },
    createElement() { return { style: {}, addEventListener(name, fn) { this[name] = fn; }, remove() {} }; } };
  const window = { KiwiCaisseLang: { tr: s => 'translated:' + s }, KiwiPrinter: { openSetup() {} },
    addEventListener(name, fn) { (callbacks[name] ||= []).push(fn); },
    dispatchEvent(event) { for (const fn of callbacks[event.type] || []) fn(event); } };
  const context = vm.createContext({ window, document, Promise, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(bridge.slice(marker), context);
  window.dispatchEvent({ type: 'kiwi:toast', detail: { title: 'translated:Impression échouée' } });
  assert.equal(scripts.length, 0, 'a toast title alone no longer loads the entry: the outcome is data, not copy');
  window.dispatchEvent({ type: 'kiwi:receipt-print', detail: { ok: false } });
  assert.equal(scripts.length, 1, 'first failed receipt lazily loads the entry');
  vm.runInContext(source, context); scripts[0].onload(); await Promise.resolve();
  assert.ok(elements.has('caisse-print-recovery'), 'first failure is replayed after loading');
}

// Le texte d'un toast ne décide plus : seul le résultat structuré de receipt.js compte.
{
  const lis = {}, nodes2 = new Map();
  const st = { appendChild(el) { nodes2.set(el.id, el); } };
  const doc = { body: st, getElementById: id => id === 'toast-stack' ? st : nodes2.get(id), createElement: () => ({ style: {}, addEventListener() {}, remove() { nodes2.delete(this.id); } }) };
  const win = { addEventListener: (n, fn) => { lis[n] = fn; }, KiwiCaisseLang: { tr: s => s }, KiwiPrinter: { openSetup() {} } };
  vm.runInNewContext(source, { window: win, document: doc });
  assert.equal(lis['kiwi:toast'], undefined, 'no toast-title listener left');
  lis['kiwi:receipt-print']({ detail: { ok: false } });
  assert.match(nodes2.get('caisse-print-recovery').textContent, /\(1\)$/, 'a failed receipt adds one entry');
  lis['kiwi:receipt-print']({ detail: { ok: false } });
  assert.match(nodes2.get('caisse-print-recovery').textContent, /\(1\)$/, 'a second failure is still one entry');
  lis['kiwi:receipt-print']({ detail: { ok: true } });
  assert.ok(!nodes2.has('caisse-print-recovery'), 'a printed receipt clears it');
  // Par identité : le reçu suivant ne cache pas le précédent, seule sa réimpression l'efface.
  lis['kiwi:receipt-print']({ detail: { ok: false, id: 'T-1' } });
  lis['kiwi:receipt-print']({ detail: { ok: false, id: 'T-2' } });
  assert.match(nodes2.get('caisse-print-recovery').textContent, /\(2\)$/, 'two customers, two entries');
  lis['kiwi:receipt-print']({ detail: { ok: true, id: 'T-3' } });
  assert.match(nodes2.get('caisse-print-recovery').textContent, /\(2\)$/, 'another customer printing fine hides neither');
  lis['kiwi:receipt-print']({ detail: { ok: true, id: 'T-1' } });
  assert.match(nodes2.get('caisse-print-recovery').textContent, /\(1\)$/, 'reprinting T-1 clears only T-1');
  lis['kiwi:receipt-print']({ detail: { ok: true, id: 'T-2' } });
  assert.ok(!nodes2.has('caisse-print-recovery'));
  // receipt.js annonce le résultat, réussi ou non.
  const receiptSrc = fs.readFileSync('assets/receipt.js', 'utf8');
  const events = [];
  const rctx = vm.createContext({ window: { dispatchEvent: e => events.push(e.detail.ok), KiwiPrinter: null }, document: { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {} }, head: { appendChild() {} } }, CustomEvent: class { constructor(t, o) { this.detail = o.detail; } }, console, Promise, setTimeout, clearTimeout, Math, Date, Number, String, Object, Array, JSON, RegExp, isFinite, parseFloat, parseInt, Intl, Error });
  try { vm.runInContext(receiptSrc, rctx); } catch (_) {}
  const K = rctx.window.KiwiReceipt;
  assert.ok(K && K.print, 'receipt.js loads in the sandbox');
  {
    await K.print({ shop: {}, lines: [], paper: '80' }).catch(() => {});
    assert.ok(events.length === 1, 'receipt.js announces every print outcome once');
  }
}
