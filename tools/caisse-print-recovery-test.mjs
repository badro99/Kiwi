import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/caisse-print-recovery.js', 'utf8');
/* A fake element that knows its parts by selector, enough for the alert's innerHTML. */
function fakeEl(onRemove) {
  const parts = {};
  return { style: {}, attrs: {}, hidden: false, disabled: false, textContent: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(name, fn) { this[name] = fn; },
    querySelector(sel) { return parts[sel] || (parts[sel] = fakeEl()); },
    remove() { if (onRemove) onRemove(this); } };
}
const text = (entry) => entry.querySelector('[data-msg]').textContent;
const view = (entry) => entry.querySelector('[data-view]');
const again = (entry) => entry.querySelector('[data-reprint]');
const listeners = {}, nodes = new Map(), opens = [], reprints = [];
let reprintAnswer = { ok: true, sent: 1, failed: 0 };
const stack = { appendChild(el) { nodes.set(el.id, el); } };
const document = { body: stack, getElementById: id => id === 'toast-stack' ? stack : nodes.get(id), createElement: () => fakeEl((el) => nodes.delete(el.id)) };
const window = { addEventListener: (name, fn) => { listeners[name] = fn; }, KiwiCaisseLang: { tr: s => 'translated:' + s }, KiwiPrinter: { openSetup: opts => opens.push(opts) },
  KiwiKitchenPrint: { reprintUnprinted: (ids) => { reprints.push(ids); return Promise.resolve(reprintAnswer); } } };
vm.runInNewContext(source, { window, document, setTimeout: () => 0 });
listeners['kiwi:kitchen-print-unprinted']({ detail: { count: 2, ids: ['pj_a', 'pj_b'], labels: 'Table 4 · #12, Table 9' } });
const entry = nodes.get('caisse-print-recovery');
assert.equal(view(entry).textContent, 'translated:Voir les tickets non imprimés (2)');
assert.equal(entry.style.pointerEvents, 'auto', 'recovery entry remains clickable inside the informational toast stack');
assert.equal(entry.attrs.role, 'alert', 'the alert is announced');
assert.match(text(entry), /2 bons de cuisine non imprimés · Table 4 · #12, Table 9$/, 'the alert names the tables the kitchen never got');
assert.equal(again(entry).hidden, false, 'a lost kitchen ticket offers Reprint on the alert itself');
assert.equal(again(entry).textContent, 'translated:Réimprimer');
view(entry).click();
assert.equal(opens[0].kind, 'recovery', 'View still opens the same printer recovery UI');
again(entry).click();
assert.deepEqual(reprints[0], ['pj_a', 'pj_b'], 'Reprint sends exactly the unprinted kitchen tickets');
assert.equal(again(entry).disabled, true, 'a second tap while sending does nothing');
again(entry).click();
assert.equal(reprints.length, 1, 'no double reprint');
await Promise.resolve(); await Promise.resolve();
assert.match(text(entry), /Réimpression envoyée\.$/, 'the till says the reprint left');
listeners['kiwi:kitchen-print-unprinted']({ detail: { count: 0, ids: [] } });
assert.equal(nodes.size, 0, 'resolved failures remove the entry');
/* The bridge is offline: the server refuses (the copy would expire unseen) and the alert says what to do. */
reprintAnswer = { ok: false, sent: 0, failed: 1, why: 'relay-offline' };
listeners['kiwi:kitchen-print-unprinted']({ detail: { count: 1, ids: ['pj_c'], labels: 'Table 2' } });
again(nodes.get('caisse-print-recovery')).click();
await Promise.resolve(); await Promise.resolve();
assert.match(text(nodes.get('caisse-print-recovery')), /pont d’impression est hors ligne/, 'an offline bridge is named, not a generic failure');
assert.equal(again(nodes.get('caisse-print-recovery')).disabled, false, 'Reprint can be tried again');
listeners['kiwi:kitchen-print-unprinted']({ detail: { count: 0, ids: [] } });
assert.equal(nodes.size, 0);
/* A failed receipt alone: no Reprint button (receipts recover from their own sheet), View stays. */
listeners['kiwi:receipt-print']({ detail: { ok: false, id: 'R-1' } });
assert.equal(again(nodes.get('caisse-print-recovery')).hidden, true, 'no kitchen ticket, no kitchen Reprint');
listeners['kiwi:receipt-print']({ detail: { ok: true, id: 'R-1' } });
assert.equal(nodes.size, 0);
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
    createElement() { return fakeEl(); } };
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
  const doc = { body: st, getElementById: id => id === 'toast-stack' ? st : nodes2.get(id), createElement: () => fakeEl((el) => nodes2.delete(el.id)) };
  const win = { addEventListener: (n, fn) => { lis[n] = fn; }, KiwiCaisseLang: { tr: s => s }, KiwiPrinter: { openSetup() {} } };
  vm.runInNewContext(source, { window: win, document: doc });
  assert.equal(lis['kiwi:toast'], undefined, 'no toast-title listener left');
  lis['kiwi:receipt-print']({ detail: { ok: false } });
  assert.match(view(nodes2.get('caisse-print-recovery')).textContent, /\(1\)$/, 'a failed receipt adds one entry');
  lis['kiwi:receipt-print']({ detail: { ok: false } });
  assert.match(view(nodes2.get('caisse-print-recovery')).textContent, /\(1\)$/, 'a second failure is still one entry');
  lis['kiwi:receipt-print']({ detail: { ok: true } });
  assert.ok(!nodes2.has('caisse-print-recovery'), 'a printed receipt clears it');
  // Par identité : le reçu suivant ne cache pas le précédent, seule sa réimpression l'efface.
  lis['kiwi:receipt-print']({ detail: { ok: false, id: 'T-1' } });
  lis['kiwi:receipt-print']({ detail: { ok: false, id: 'T-2' } });
  assert.match(view(nodes2.get('caisse-print-recovery')).textContent, /\(2\)$/, 'two customers, two entries');
  lis['kiwi:receipt-print']({ detail: { ok: true, id: 'T-3' } });
  assert.match(view(nodes2.get('caisse-print-recovery')).textContent, /\(2\)$/, 'another customer printing fine hides neither');
  lis['kiwi:receipt-print']({ detail: { ok: true, id: 'T-1' } });
  assert.match(view(nodes2.get('caisse-print-recovery')).textContent, /\(1\)$/, 'reprinting T-1 clears only T-1');
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
