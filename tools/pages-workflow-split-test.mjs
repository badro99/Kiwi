/* A move proof over production bodies, plus execution of the actual table factories. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import reconstructed from './pages-tables-test-source.cjs';
const read = file => fs.readFileSync(file, 'utf8');
const map = JSON.parse(read('tools/fixtures/pages/tables.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/pages/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.originalSha);
const boundary = original.indexOf('/* First-use sections.');
assert.equal(reconstructed().slice(0, boundary), original.slice(0, boundary), 'all original table/menu/KDS bodies rebuild byte for byte');
const tableBody = original.slice(map.begin + map.pre.length, map.end);
let expected = tableBody;
for (const f of [...map.fragments].sort((a,b) => b.start - a.start)) expected = expected.slice(0,f.start) + f.replacement + expected.slice(f.end);
assert.equal(reconstructed.tableOwnerSource(), map.prefix + map.binding + expected + map.suffix);
for (const [file,prefix,suffix] of [
  ['assets/pages/tables-data.js',map.dataPrefix,map.dataSuffix],
  ['assets/pages/tables-drawing.js',map.drawingPrefix,map.drawingSuffix],
]) assert.equal(read(file),prefix + map.fragments.filter(f => f.file === file).map(f => tableBody.slice(f.start,f.end)).join('\n\n') + suffix, file + ': exact original bodies');
// The extracted factory must never snapshot a reassignable owner binding.
const require = (await import('node:module')).createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const ast = ts.createSourceFile('tables.js', read('assets/pages/tables.js'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let owner;
function findOwner(n) { if (!owner && ts.isFunctionExpression(n)) owner = n.body; ts.forEachChild(n, findOwner); }
findOwner(ast);
const mutable = new Set();
for (const st of owner.statements) if (ts.isVariableStatement(st) && !(st.declarationList.flags & ts.NodeFlags.Const)) {
  for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) mutable.add(d.name.text);
}
const dependencies = map.drawingPrefix.match(/const \{ ([^}]+) \} = scope/)[1].split(', ');
for (const name of dependencies) assert.ok(!mutable.has(name), name + ': no snapshot of mutable table state');
const operations = read('assets/pages/tables-operations.js');
const operationDependencies = operations.match(/const \{ ([^}]+) \} = scope/)[1].split(', ');
for (const name of operationDependencies) assert.ok(!mutable.has(name), name + ': no snapshot of mutable operations state');
for (const file of ['assets/pages/tables.js','assets/pages/tables-data.js','assets/pages/tables-drawing.js','assets/pages/tables-operations.js']) assert.ok(read(file).split('\n').length - 1 <= 3000, file + ': below 3000 lines');
for (const file of ['assets/pages/tables.js','assets/pages/tables-data.js','assets/pages/tables-drawing.js']) {
  assert.ok(require('./stamps.js').scan().get(file).sites.some(site => site.kind === 'lazy'), file + ': discoverable by stamp tooling');
}
const noop = () => {};
const window = { Kiwi: { handlers: {}, drawer:noop, fullpage:noop, modal:noop, toast:noop, menu:noop, confetti:noop }, addEventListener:noop };
const context = vm.createContext({ window, document: { documentElement:{dataset:{},lang:'fr'}, addEventListener:noop }, localStorage:{removeItem:noop,getItem:()=>null}, setTimeout:noop, setInterval:noop, clearInterval:noop, clearTimeout:noop, console });
for (const file of ['assets/pages/tables-data.js','assets/pages/tables-drawing.js','assets/pages/tables-operations.js','assets/pages/tables.js']) vm.runInContext(read(file),context,{filename:file});
assert.equal(typeof window.Kiwi.handlers['nav-tables'],'function','actual owner registers tables');
const drawing = window.__kiwiPagesTables.drawing(Object.fromEntries(dependencies.map(name => [name, undefined])));
for (const f of map.fragments.filter(f => f.file.endsWith('tables-drawing.js'))) {
  const name = f.replacement.match(/^function (\w+)/)[1];
  assert.equal(String(drawing[name]), tableBody.slice(f.start, f.end), name + ': actual extracted function source unchanged');
}

assert.equal(window.__kiwiPagesTables.createData({PDS_CANVAS_W:880,PDS_CANVAS_H:540}).PDS_STR.fr.title,'Plan de salle');
const registry = read('assets/pages-pro.js').slice(read('assets/pages-pro.js').indexOf('/* First-use sections.'));
const tags=[],handlers={},toasts=[];
const document={baseURI:'https://kiwi.test/dashboard.html',currentScript:null,createElement:()=>({remove:noop}),head:{appendChild:s=>tags.push(s)}};
vm.runInNewContext(registry,{window:{Kiwi:{handlers,toast:(...a)=>toasts.push(a)}},document,URL});
const stub=handlers['nav-tables'];
const first=stub(),concurrent=stub();
await Promise.resolve(); await Promise.resolve();
assert.equal(tags.length,1,'one prerequisite request for concurrent opens');
assert.match(tags[0].src,/tables-data.js/);
tags[0].onerror(); await Promise.all([first,concurrent]);
assert.equal(toasts.length,2,'each failed open receives the existing error toast');
const self={},args=[{},'arg'];let calls=0;
handlers['nav-tables']=function(){return stub.apply(this,arguments);};
const wrapped=handlers['nav-tables'];
const retry=wrapped.apply(self,args);
await Promise.resolve(); await Promise.resolve();
tags[1].onload();
for(let i=0;i<8 && tags.length<3;i++)await Promise.resolve();
assert.match(tags[2].src,/tables-drawing.js/); tags[2].onload();
for(let i=0;i<8 && tags.length<4;i++)await Promise.resolve();
assert.match(tags[3].src,/tables-operations.js/); tags[3].onload();
for(let i=0;i<8 && tags.length<5;i++)await Promise.resolve();
assert.match(tags[4].src,/tables.js/);
document.currentScript={src:new URL(tags[4].src,document.baseURI).href};
handlers['nav-tables']=function(...received){calls++;assert.equal(this,self);assert.deepEqual(received,args);return 'real';};
document.currentScript=null;
assert.equal(handlers['nav-tables'],wrapped,'late registration retains role/production guards');
tags[4].onload();assert.equal(await retry,'real');assert.equal(calls,1);
assert.equal(wrapped.apply(self,args),'real');assert.equal(tags.length,5,'loaded section reused');
console.log('✓ pages workflow split: exact bodies, actual owner boot, ordered prerequisites, concurrent opens, retry and captured guard parity');
