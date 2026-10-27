import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import sourceHelper from './orderpro-split-source.cjs';
import stamps from './stamps.js';
const read = file => fs.readFileSync(file, 'utf8');
const map = JSON.parse(read('tools/fixtures/orderpro/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/orderpro/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), read('tools/fixtures/orderpro/sha256').trim());
assert.equal(map.sha256, read('tools/fixtures/orderpro/sha256').trim());
assert.equal(sourceHelper.orderProScriptSource(), original, 'live files rebuild the entire original byte for byte');
for (const extension of map.extensions) {
  const archived = gunzipSync(fs.readFileSync('tools/fixtures/orderpro/' + extension.name + '.js.gz')).toString();
  assert.equal(createHash('sha256').update(archived).digest('hex'), extension.sha256);
  assert.equal(read(extension.file), extension.header + archived + extension.footer, extension.file + ': exact original bodies inside explicit scope bridge');
}
const stampSites = stamps.scan();
for (const part of map.parts) {
  const source = read(part.file);
  assert.equal(source, part.header + part.fragments.map(f => original.slice(f.start, f.end) + '\n').join('') + part.footer, part.file + ': every moved byte retained');
  assert.ok(stampSites.has(part.file), part.file + ': stamped loader dependency');
  assert.ok(read('kiwi-sw.js').includes('/' + part.file + '?v='), part.file + ': offline shell');
}
for (const [file, count] of Object.entries(map.shellScripts)) assert.ok((read(file).match(/<script\b[^>]*\bsrc=/g) || []).length <= count, file + ': no extra script tags');
// A dependency can finish on either side of DOMContentLoaded.
{
  const readiness = map.prefix.slice(map.prefix.indexOf('  function onReady('), map.prefix.indexOf('  function start()'));
  for (const readyState of ['loading', 'interactive', 'complete']) {
    let called = 0, listener;
    const document = { readyState, addEventListener(name, fn) { assert.equal(name, 'DOMContentLoaded'); listener = fn; } };
    vm.runInNewContext(readiness + '\nonReady(callback);', { document, callback: () => called++ });
    if (readyState === 'loading') { assert.equal(called, 0); listener(); }
    assert.equal(called, 1, 'bootstrap runs exactly once for ' + readyState);
  }
}
const names = map.parts.flatMap(p => p.exports);
const fields = map.states.map(s => s.name);
function boot(split, lang) {
  const events = [], effects = [], storage = new Map(), nodes = new Map(), instances = {};
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { id, value: '', textContent: '', innerHTML: '', hidden: false, dataset: {}, style: { setProperty() {} }, classList: { add(...xs) { xs.forEach(x => classes.add(x)); }, remove(...xs) { xs.forEach(x => classes.delete(x)); }, contains: x => classes.has(x), toggle(x, on) { if (on) classes.add(x); else classes.delete(x); } }, setAttribute() {}, removeAttribute() {}, getAttribute() { return ''; }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, closest() { return null; }, scrollTo() {} });
    }
    return nodes.get(id);
  }
  const doc = { createElement: () => ({}), head: { appendChild: script => effects.push(['scripts', script]) }, hidden: false, readyState: 'loading', querySelector: node, querySelectorAll: () => [], getElementById: id => node('#' + id), addEventListener: (name, fn) => events.push(['document', name, fn]), write: text => effects.push(['scripts', text]) };
  const sandbox = { document: doc, location: { search: '?s=test&t=7' }, URLSearchParams, console, TextEncoder, Uint8Array, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, requestAnimationFrame: () => 1, navigator: {}, localStorage: { get length() { return storage.size; }, key: i => [...storage.keys()][i], getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, fetch: async (url, options) => { effects.push(['fetch', url, options]); return { ok: true, json: async () => ({ ok: true }) }; }, addEventListener: (name, fn) => events.push(['window', name, fn]) };
  sandbox.window = sandbox;
  sandbox.localStorage.setItem('kiwiLang', lang);
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read('assets/orderpro-menu.js'), ctx);
  let owner;
  if (!split) {
    const proof = `\nglobalThis.proof = { ${names.join(', ')}, ${fields.map(n => `get ${n}() { return ${n}; }, set ${n}(v) { ${n} = v; }`).join(', ')} };`;
    vm.runInContext(original + proof, ctx);
  } else {
    vm.runInContext(read('assets/orderpro-page.js'), ctx);
    assert.equal(effects.length, 5, 'only static dependency URLs emitted before initialization');
    assert.ok(effects.every(e => e[1].async === false), 'classic dependencies execute in order');
    const urls = effects.map(e => e[1].src);
    assert.deepEqual(urls.map(url => url.split('?')[0]), map.parts.map(p => p.file), 'ordered lazy dependencies');
    const create = ctx.KiwiOrderMenu.orderProParts.create;
    ctx.KiwiOrderMenu.orderProParts.create = function (name, scope) { return instances[name] = create(name, scope); };
    for (const url of urls) {
      vm.runInContext(read(url.split('?')[0]), ctx);
      if (!owner && ctx.KiwiOrderMenu.orderProParts.owner) {
        const factory = ctx.KiwiOrderMenu.orderProParts.owner;
        ctx.KiwiOrderMenu.orderProParts.owner = () => owner = factory();
      }
    }
    sandbox.proof = Object.assign({}, ...Object.values(instances));
    for (const name of fields) Object.defineProperty(sandbox.proof, name, { get: () => owner.read(name), set: v => owner.write(name, v) });
    assert.ok(Object.isFrozen(ctx.KiwiOrderMenu.orderProParts));
    assert.throws(() => owner.read('privateSiblingState'), /not initialized/);
  }
  for (const extension of map.extensions) {
    const source = read(extension.file);
    vm.runInContext(split ? source : source.slice(extension.header.length, -extension.footer.length), ctx);
  }
  return { api: sandbox.proof, guest: sandbox.KiwiGuest, boutique: split ? ctx.KiwiOrderMenu.orderProParts.extension('boutique', 'bootBoutique') : ctx.bootBoutique, events, effects: effects.filter(e => e[0] !== 'scripts'), storage, node };
}
for (const lang of ['fr', 'en', 'ar']) {
  const before = boot(false, lang), after = boot(true, lang);
  assert.deepEqual(after.events.map(e => e.slice(0, 2)), before.events.map(e => e.slice(0, 2)), 'same listener order');
  assert.deepEqual(after.effects, before.effects, 'no added API requests');
  for (const part of map.parts) for (const f of part.fragments) if (typeof after.api[f.name] === 'function') assert.equal(String(after.api[f.name]), String(before.api[f.name]), f.name + ': unchanged executable body');
  for (const app of [before, after]) {
    const a = app.api;
    a.pressKey('7'); a.pressKey('2'); a.pressKey('del');
    a.addLineToCart({ id: 'dish', options: {}, note: '', qty: 2, unitPrice: 12.5 });
    a.incFromCart([...a.cart.keys()][0]);
    a.decFromCart([...a.cart.keys()][0]);
    a.SESSION.id = 'visit-test';
    a.sentOrders = [{ id: 'order-test', number: '1', status: 'accepted', total: 25, lines: [...a.cart.values()] }];
    a.rebuildSent(); a.saveSent(); a.sentOrders = []; a.loadSent('visit-test');
    a.onOrderStatus('order-test', 'rejected');
    assert.equal(await a.sendServiceRequest('call-server'), true);
    a.OPT.size = { choices: [{ id: 'large', delta: 3.5 }] };
    assert.equal(app.guest._test.unitPriceOf({ price: 12.5 }, { size: 'large' }), 16, 'guest bridge sees live option state');
    assert.equal(app.boutique({ products: [{ id: 'p', name: 'Product', priceMAD: 25 }], variants: [] }), true);
    const options = [{ key: 'size', type: 'single', required: true }];
    const selections = a.initialCustomizerSelections(options);
    assert.equal(selections.size, '');
    assert.equal(a.unansweredRequiredOption({ options }, selections).key, 'size');
  }
  assert.equal(after.guest._test.unitPriceOf({ price: 12.5, options: [] }), before.guest._test.unitPriceOf({ price: 12.5, options: [] }), 'guest bridge reads the live menu');
  assert.equal(after.node('#bq-list').innerHTML, before.node('#bq-list').innerHTML, 'same boutique output through explicit bridge');
  assert.equal(after.api.tableNumber, before.api.tableNumber);
  assert.equal(JSON.stringify(after.api.totals()), JSON.stringify(before.api.totals()));
  assert.equal(JSON.stringify(after.api.sentOrders), JSON.stringify(before.api.sentOrders));
  assert.equal(after.api.sessionTotal, before.api.sessionTotal);
  assert.equal(JSON.stringify(after.effects), JSON.stringify(before.effects), 'same service request and payload');
  assert.deepEqual([...after.storage], [...before.storage]);
}
console.log('✓ orderpro split: exact live reconstruction, unchanged executable bodies, ordered loading, state/cart/persistence/status parity in FR/EN/AR');
