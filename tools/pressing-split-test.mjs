import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import source from './pressing-test-source.cjs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const map = JSON.parse(read('tools/fixtures/pressing/split.json'));
const original = gunzipSync(fs.readFileSync(new URL('fixtures/pressing/original.js.gz', import.meta.url))).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), read('tools/fixtures/pressing/sha256').trim());
assert.equal(source.pressingTestSource(), original, 'rebuild original byte for byte from live owner and UI files');
for (const part of map.parts) for (const fragment of part.fragments) {
  const live = read(part.file), start = live.indexOf('export function create(owner)');
  const relative = fragment.offset - part.prefix.indexOf('export function create(owner)');
  assert.equal(live.slice(start + relative, start + relative + fragment.length), original.slice(fragment.start, fragment.end), fragment.name + ': exact moved declaration');
}
assert.match(read('assets/pressing-caisse.js'), /import \{\} from '\.\/pressing\/custody\.js\?v=\d+';/);
assert.match(read('assets/pos-dispatch.js'), /file: 'pressing-caisse', rev: '\d+', module: true/);
for (const file of [map.owner.file, ...map.parts.map(p => p.file)]) assert.ok(read('kiwi-sw.js').includes("'/" + file + '?v='), file + ': precached');
for (const [file, count] of Object.entries(map.scriptCounts)) assert.equal((read(file).match(/<script\b[^>]*\bsrc=/g) || []).length, count, file + ': no added script tags');
// Run the genuine ESM graph in the historical harness realm, with the same seed.
if (!process.execArgv.includes('--experimental-vm-modules')) {
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', import.meta.filename], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
} else {
  const edge = read('tools/pressing-edge-test.mjs');
  const setup = edge.slice(edge.indexOf('let registered = null;'), edge.indexOf('vm.runInContext(phoneSource'));
  const boot = () => {
    const realm = vm.createContext({ vm, console, Intl });
    vm.runInContext(setup + '\nglobalThis.fixture = { context, getRegistered: () => registered };', realm);
    return realm.fixture;
  };
  const before = boot(), after = boot();
  vm.runInContext(original.replace(/\}\)\(\);\n$/, 'window.__custodyProof = { orderTotals, saleLines, orderStatus };\n})();\n'), before.context);
  const reference = before.context.window.__custodyProof;
  delete before.context.window.__custodyProof;
  const modules = new Map();
  function load(file) {
    file = file.replace(/\?v=\d+$/, '');
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(read(file), { context: after.context, identifier: file }));
    return modules.get(file);
  }
  const entry = load('assets/pressing-caisse.js');
  await entry.link((specifier, parent) => load(path.posix.join(path.posix.dirname(parent.identifier), specifier)));
  await entry.evaluate();
  assert.equal(after.getRegistered().id, before.getRegistered().id);
  assert.deepEqual(Object.keys(after.context.window), Object.keys(before.context.window), 'no new window state');
  const model = load(map.owner.file).namespace.custody;
  assert.ok(Object.isFrozen(model));
  for (const cents of [1, 99, 1000, 1250, 99999]) for (const b2b of [false, true]) {
    const order = { lines: [{ itemId: 'chemise', unitPrice: cents / 100, qty: 3, services: ['lavage'] }], b2b, pieces: [{ status: 'recu' }], readyAt: new Date(1) };
    assert.equal(JSON.stringify(model.orderTotals(order)), JSON.stringify(reference.orderTotals(order)));
    for (const received of [0, 10, cents / 100]) assert.equal(JSON.stringify(model.saleLines(order, received)), JSON.stringify(reference.saleLines(order, received)));
    assert.equal(model.orderStatus(order), reference.orderStatus(order));
    order.pieces[0].status = 'pret';
    assert.equal(model.orderStatus(order), reference.orderStatus(order));
  }
  const a = after.context.window.KiwiPressing.rules, b = before.context.window.KiwiPressing.rules;
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const key of Object.keys(a)) assert.equal(String(a[key]), String(b[key]), key + ': unchanged public rule');
}
console.log('✓ pressing split: byte-exact reconstruction, original function bodies, ESM loading and startup parity');
