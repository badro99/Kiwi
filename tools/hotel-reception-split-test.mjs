import splitFunctions from './split-functions.cjs';
const sameSplit = (actual, expected, message) => assert.deepEqual(splitFunctions.tokens(actual), splitFunctions.tokens(expected), message);
/* C1 extends, rather than replaces, the three historical split proofs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { hotelC1, hotelC1Source } from './hotel-c1-source.mjs';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const read = f => fs.readFileSync(f,'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/hotel/c1-original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'),hotelC1.sha256);
sameSplit(hotelC1Source('assets/hotel.js'),original,'live files reconstruct the pre-C1 controller byte for byte');
for (const p of hotelC1.parts) {
  const expected = (p.base ? p.base + '\n' : '') + p.prefix + p.fragments.map(f => original.slice(f.start,f.end)+'\n\n').join('') + p.suffix;
  sameSplit(read(p.file),expected,p.file+': every moved function body is byte identical');
  for (const f of p.fragments) sameSplit(splitFunctions.declaration(read(p.file),f.name),original.slice(f.start,f.end));
}
const interfaces = JSON.parse(read('tools/fixtures/hotel/reception-interfaces.json'));
function accesses(source) {
  const ast=ts.createSourceFile('boundary.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS), globals=new Set(), scope=new Set();
  function path(n) {
    if (ts.isIdentifier(n)) return n.text;
    if (ts.isPropertyAccessExpression(n)) { const base=path(n.expression); return base && base+'.'+n.name.text; }
    return '';
  }
  function walk(n) {
    if (ts.isPropertyAccessExpression(n)) {
      const full=path(n);
      if (full.startsWith('window.')) globals.add(full.slice(7));
      if (full.startsWith('scope.')) scope.add(full.slice(6));
    }
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      if (n.expression.text==='window') globals.add(n.name.text);
      if (n.expression.text==='scope') scope.add(n.name.text);
    }
    if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && ['window','scope'].includes(n.expression.text)) {
      assert.ok(ts.isStringLiteral(n.argumentExpression),'no computed global or scope access');
      (n.expression.text==='window'?globals:scope).add(n.argumentExpression.text);
    }
    ts.forEachChild(n,walk);
  }
  walk(ast);return { globals:[...globals].sort(),scope:[...scope].sort() };
}
assert.notDeepEqual(accesses('window.__kiwiHotelSections.views.privateState'), accesses('window.__kiwiHotelSections'), 'a sibling registry read must fail the boundary');
for (const [file,contract] of Object.entries(interfaces)) {
  assert.deepEqual(accesses(read(file)),contract,file+': declared browser reads and scope interface only; sibling private state is forbidden');
}
const owner=hotelC1.parts.find(p=>p.name==='receptionState');
for (const field of ['CUSTOM_HX','cuD1Stays','HX_STORE_PREFIX']) assert.ok(!read('assets/hotel.js').includes(field),field+': one private state owner');
assert.ok(owner.suffix.includes('replaceState') && owner.suffix.includes('setCloud'),'named state and cloud methods');
console.log('✓ hotel-reception-split: live C1 reconstruction, historical bodies outside reviewed fixes and explicit module boundaries');

// Exercise the production factory: one state identity, cloud acknowledgements and tenant caches.
const window = { __kiwiHotelSections: {}, KiwiVenue: {} }, stored = new Map();
const context = vm.createContext({ window, console, localStorage: { getItem: k => stored.get(k) || null, setItem: (k,v) => stored.set(k,v) } });
vm.runInContext(read('assets/hotel/model.js'), context);
let venue = 'first';
const state = window.__kiwiHotelSections.receptionState({
  cuVenueId: () => venue, cuStayScope: () => venue, cuEnsureFilterVenue() {},
  cuSeed: () => ({rooms:{},folios:{}}), cuDocument: s => s, cuHydrate: s => s,
  cuStamp: () => 17, toast() {}, trL: copy => copy.en,
});
const first = state.cuState();
assert.equal(state.cuState(), first);
const firstCache = state.cuStayCache();
let pushes = 0;
state.setCloud({push: () => pushes++, save: async data => ({ok:true,data})});
assert.equal(state.cuSave(first), true); assert.equal(pushes,1);
assert.equal((await state.cuSaveCloud(first)).ok,true);
const draft = {rooms:{a:{}},folios:{}};
assert.equal(await state.cuCommitDraft(draft),draft);
assert.equal(state.cuState(),draft);
venue = 'second';
assert.notEqual(state.cuState(),draft);
assert.notEqual(state.cuStayCache(),firstCache);
venue = 'first';
assert.equal(state.cuState(),draft); assert.equal(state.cuStayCache(),firstCache);
console.log('✓ reception state runtime: state identity, named cloud writes and tenant cache isolation');
