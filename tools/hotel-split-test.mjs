/* Preuve de découpe : reconstruction exacte et exécution des fichiers réels. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import mergedPart from './merged-source.cjs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { hotelTestSource, hotelFiles, hotelParts } from './hotel-test-source.mjs';
const read = file => fs.readFileSync(file, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/hotel/original.js.gz')).toString();
const map = JSON.parse(read('tools/fixtures/hotel/split.json'));
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
assert.equal(hotelTestSource(), original, 'live bodies rebuild original byte for byte');
assert.equal(read('assets/hotel-language.js'), map.prefix + original.slice(map.start, map.end) + map.suffix);
let expectedCore = original.slice(0, map.start) + map.replacement + original.slice(map.end);
for (const part of hotelParts.parts) {
  let expected = part.prefix;
  for (const f of part.fragments) {
    const body = original.slice(f.start, f.end);
    expected += body + '\n\n';
    assert.ok(expectedCore.includes(body));
    expectedCore = expectedCore.replace(body, f.replacement);
  }
  assert.equal(read(part.file), expected + part.suffix, part.file + ': every function byte unchanged');
}
expectedCore = expectedCore.replace("  'use strict';\n\n", "  'use strict';\n\n" + hotelParts.bind);
assert.equal(read('assets/hotel.js'), expectedCore);
const mergedOriginals = JSON.parse(gunzipSync(fs.readFileSync('tools/fixtures/hotel/merged-originals.json.gz')));
for (const [parent, children] of [
  ['assets/month-report.js', ['assets/month-report-tools.js', 'assets/month-report-pdf.js', 'assets/month-report-ui.js']],
  ['assets/agent-voice.js', ['assets/agent-vision.js', 'assets/agent-skin.js']],
]) {
  let expected = mergedOriginals[parent];
  for (const old of children) expected += "/* ── Ci-dessous, l'ancien " + old + " (réuni ici le 23 octobre 2026, corps inchangé). ── */\n" + mergedOriginals[old];
  assert.equal(read(parent), expected, parent + ': only byte-identical ordered concatenation');
  assert.equal(mergedPart(parent), mergedOriginals[parent]);
  for (const old of children) {
    assert.equal(mergedPart(parent, old), mergedOriginals[old], old + ': byte-identical concatenation');
    assert.ok(!fs.existsSync(old), old + ': obsolete file removed');
  }
}
const html = read('dashboard.html');
// The split added its five part tags and merged five files away: net zero at the time (161). Later work may add
// unrelated tags (the shell total is pinned by file-size-ratchet-test), so compare only the tags this split knew.
const splitTags = (html.match(/<script\b[^>]*\bsrc=[^>]*><\/script>/g) || []);
const removed = ['agent-vision.js', 'agent-skin.js', 'month-report-tools.js', 'month-report-pdf.js', 'month-report-ui.js'];
const expectedTags = hotelParts.scriptsBefore.filter(tag => !removed.some(file => tag.includes('/' + file + '?v=')));
const hotelAt = expectedTags.findIndex(tag => tag.includes('assets/hotel.js?'));
expectedTags.splice(hotelAt, 0, ...hotelParts.parts.map(p => '<script src="' + p.file + '?v=1" defer fetchpriority="low"></script>'));
const unstamped = tags => tags.map(tag => tag.replace(/\?v=\d+/, '?v=N'));
const known = new Set(unstamped(expectedTags));
assert.deepEqual(unstamped(splitTags).filter(tag => known.has(tag)), unstamped(expectedTags), 'all surviving shell tags retain their exact order and attributes (stamps move freely; tags added later are ignored)');
const tags = hotelFiles.map(file => '<script src="' + file + '?v=');
let last = -1;
for (let i = 0; i < tags.length; i++) {
  const at = html.indexOf(tags[i]);
  assert.ok(at > last, 'hotel parts load in their original dependency order');
  const end = html.indexOf('</script>', at) + 9;
  assert.match(html.slice(at, end), /\bdefer\b/);
  if (last >= 0) assert.equal(html.slice(last, at).trim(), '', 'adjacent ordered deferred scripts');
  last = end;
}
for (const file of hotelFiles) assert.ok(read('kiwi-sw.js').includes("'/" + file + '?v='), file + ': precached');

const require = (await import('node:module')).createRequire(import.meta.url);
for (const file of hotelFiles) assert.ok(require('./stamps.js').scan().has(file), file + ': stamp-discoverable');
// Une fabrique ne capture jamais une liaison réassignable du cœur.
const ts = require('../app/node_modules/typescript');
const ast = ts.createSourceFile('hotel-original.js', original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const outer = ast.statements.find(ts.isExpressionStatement).expression.expression.expression.body;
const mutable = [];
const bindingNames = n => {
  if (ts.isIdentifier(n)) mutable.push(n.text);
  else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) for (const e of n.elements) if (ts.isBindingElement(e)) bindingNames(e.name);
};
for (const st of outer.statements) if (ts.isVariableStatement(st) && !(st.declarationList.flags & ts.NodeFlags.Const)) {
  for (const d of st.declarationList.declarations) bindingNames(d.name);
}
for (const part of hotelParts.parts) for (const dep of part.deps) assert.ok(!mutable.includes(dep), part.name + ': no stale snapshot of ' + dep);

// Le même harnais de registre, avec l'original puis les deux vrais scripts.
const roomSuite = read('tools/hotel-rooms-test.mjs');
const boot = roomSuite.slice(roomSuite.indexOf('function boot(saved)'), roomSuite.indexOf('\nfunction editor('));
function run(parts, lang) {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [1792710000000])); }
    static now() { return 1792710000000; }
  }
  const realm = vm.createContext({ console, vm, Date: Clock });
  vm.runInContext(`const source = ${JSON.stringify(parts.join('\n'))};\n${boot}\nglobalThis.result = boot();`, realm);
  const { window, data, handlers } = realm.result;
  const state = JSON.stringify(window.KiwiHotelRooms.current());
  const effects = JSON.stringify([...data]);
  const functions = Object.fromEntries(Object.entries(handlers).map(([k, v]) => [k, String(v)]));
  window.KiwiI18n = { getLang: () => lang };
  return { state, effects, functions, window };
}
for (const lang of ['fr', 'en', 'ar']) {
  const before = run([original], lang);
  const after = run(hotelFiles.map(read), lang);
  assert.equal(after.state, before.state);
  assert.equal(after.effects, before.effects);
  assert.deepEqual(after.functions, before.functions);
  assert.deepEqual(Object.keys(after.window).filter(k => k !== '__kiwiHotelInternal'), Object.keys(before.window));
  assert.ok(Object.isFrozen(after.window.__kiwiHotelInternal));
  assert.deepEqual(Object.keys(after.window.__kiwiHotelInternal), ['define', 'bind', 'part', 'language']);
  for (const part of hotelParts.parts) {
    const instance = after.window.__kiwiHotelInternal.part(part.name);
    assert.ok(Object.isFrozen(instance));
    for (const f of part.fragments) assert.equal(String(instance[f.name]), original.slice(f.start, f.end).trimStart(), f.name + ': exact original function source');
  }
  const a = after.window.__kiwiHotelInternal.language();
  const ctx = vm.createContext({ window: before.window });
  vm.runInContext(`(() => { 'use strict';\n${original.slice(map.start, map.end)}\nwindow.languageProof = { hxLang, hxLocale, tx, txk, HX_N, txn, ltr, hxTo, hxColon, HX_T }; })();`, ctx);
  const b = before.window.languageProof;
  for (const [key, value] of Object.entries(a)) {
    assert.equal(typeof value === 'function' ? String(value) : JSON.stringify(value), typeof b[key] === 'function' ? String(b[key]) : JSON.stringify(b[key]), key + ': exact source/data');
  }
  for (const key of Object.keys(a.HX_T)) assert.equal(a.tx(key), b.tx(key));
  for (const noun of Object.keys(a.HX_N)) for (const n of [0, 1, 2, 3, 10, 11, 99, 100, -1]) assert.equal(a.txn(n, noun), b.txn(n, noun));
}
// Les suites historiques lisent aussi les vrais préambules et le cœur ensemble.
for (const suite of ['hotel-rooms', 'hotel-room-plan', 'hotel-stays-group', 'hotel-reception-journal', 'hotel-direct-pricing']) {
  execFileSync(process.execPath, ['tools/' + suite + '-test.mjs'], {
    env: { ...process.env, KIWI_HOTEL_TEST_RUNTIME: '1' }, stdio: 'pipe',
  });
}
console.log('✓ hotel-split: exact reconstruction, ordered deferred loading, stamp discovery, startup/state/handlers and FR/EN/AR parity');
