import dashboardDependencies from './dashboard-dependencies.cjs';
/* Preuve de découpe : reconstruction exacte et exécution des fichiers réels. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import mergedPart from './merged-source.cjs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { hotelTestSource, hotelFiles, hotelParts, hotelCoreSource, hotelSections } from './hotel-test-source.mjs';
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
assert.equal(hotelCoreSource(), expectedCore);
for (const part of hotelSections.parts) {
  let expected = part.prefix;
  for (const f of part.fragments) {
    let body = expectedCore.slice(f.start, f.end);
    for (const m of [...f.mutations].sort((a,b) => b.start-a.start)) {
      assert.equal(body.slice(m.start,m.end),m.original);
      body = body.slice(0,m.start) + m.replacement + body.slice(m.end);
    }
    expected += body + '\n\n';
  }
  assert.equal(read(part.file), expected + part.suffix, part.file + ': only explicit live state access changes');
}
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
const html = dashboardDependencies.eager(read('dashboard.html'));
// The split added its five part tags and merged five files away: net zero at the time (161). Later work may add
// unrelated tags (the shell total is pinned by file-size-ratchet-test), so compare only the tags this split knew.
const splitTags = (html.match(/<script\b[^>]*\bsrc=[^>]*><\/script>/g) || []);
const removed = ['agent-vision.js', 'agent-skin.js', 'month-report-tools.js', 'month-report-pdf.js', 'month-report-ui.js'];
const lazyLoader = read('assets/pages/dashboard-loader.js');
const isLazy = tag => { const file = tag.match(/src="([^?]+)/)?.[1]; return file && lazyLoader.includes("'" + file + '?v='); };
const expectedTags = hotelParts.scriptsBefore.filter(tag => !removed.some(file => tag.includes('/' + file + '?v=')));
const hotelAt = expectedTags.findIndex(tag => tag.includes('assets/hotel.js?'));
expectedTags.splice(hotelAt, 0, ...hotelParts.parts.map(p => '<script src="' + p.file + '?v=1" defer fetchpriority="low"></script>'));
const unstamped = tags => tags.map(tag => tag.replace(/\?v=\d+/, '?v=N'));
const known = new Set(unstamped(expectedTags));
assert.deepEqual(unstamped(splitTags).filter(tag => known.has(tag)), unstamped(expectedTags.filter(tag => !isLazy(tag))), 'all surviving shell tags retain their exact order and attributes (stamps move freely; tags added later are ignored)');
for (const file of hotelFiles.filter(file => lazyLoader.includes("'" + file + '?v='))) {
  assert.ok(!html.includes('<script src="' + file + '?v='), file + ': first-use only');
  assert.ok(requireLazySite(file), file + ': explicit loader ownership');
}
function requireLazySite(file) { return lazyLoader.includes("'" + file + '?v='); }
const tags = hotelFiles.filter(file => !requireLazySite(file)).map(file => '<script src="' + file + '?v=');
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
  const firstPaint = run(hotelFiles.filter(file => !requireLazySite(file)).map(read), lang);
  assert.equal(firstPaint.state, before.state, 'room model available before UI loading');
  assert.deepEqual(JSON.stringify(firstPaint.window.KiwiHotelRooms.housekeeping()), JSON.stringify(before.window.KiwiHotelRooms.housekeeping()), 'housekeeping KPI available before UI loading');
  assert.equal(after.state, before.state);
  assert.equal(after.effects, before.effects);
  assert.deepEqual(after.functions, before.functions);
  assert.deepEqual(Object.keys(after.window).filter(k => k !== '__kiwiHotelInternal' && k !== '__kiwiHotelSections'), Object.keys(before.window));
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

// Execute the real first-use loader: no startup requests, one ordered chain for concurrent opens.
{
  const requests = [], calls = [];
  const H = { 'nav-reception': function (...args) { calls.push([this, args]); return 'opened'; }, 'hx-group-new': () => 'group' };
  const doc = { addEventListener() {}, dispatchEvent() {}, baseURI:'https://kiwi.test/dashboard.html', currentScript:null, createElement:() => ({ remove() {} }), head:{appendChild:node => requests.push(node)} };
  const win = { Kiwi:{handlers:H}, addEventListener() {} };
  vm.runInNewContext(lazyLoader, { window:win, document:doc, URL, Map, Promise, Event });
  assert.equal(requests.length,0,'hotel UI does not load at first paint');
  const self = {}, args = ['one'];
  const first = H['nav-reception'].apply(self,args), second = H['nav-reception'].apply(self,args);
  for (let i=0;i<5;i++) {
    for(let spin=0;spin<40 && requests.length<=i;spin++) await Promise.resolve();
    assert.equal(requests.length,i+1,'one dependency at a time, shared by concurrent opens');
    requests[i].onload();
  }
  assert.equal(await first,'opened'); assert.equal(await second,'opened');
  assert.equal(calls.length,2); assert.equal(calls[0][0],self); assert.deepEqual(calls[0][1],args);
  const group=H['hx-group-new']();
  for(let spin=0;spin<40 && requests.length<6;spin++) await Promise.resolve();
  assert.match(requests[5].src,/hotel\/groups.js/);
  requests[5].onerror(); await assert.rejects(group);
  const retry=H['hx-group-new']();
  for(let spin=0;spin<40 && requests.length<7;spin++) await Promise.resolve();
  requests[6].onload(); assert.equal(await retry,'group');
  console.log('✓ hotel lazy loader: first use, ordered dependencies, concurrency, live handler context and retry');
}
