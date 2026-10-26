import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import helper from './invoicing-test-source.cjs';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const read = file => fs.readFileSync(file, 'utf8');
const map = JSON.parse(read('tools/fixtures/invoicing/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/invoicing/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
assert.equal(read('tools/fixtures/invoicing/sha256').trim(), map.sha256);
assert.equal(helper.invoicingTestSource(), original, 'live files rebuild original byte for byte');
const modules = {};
for (const part of map.parts) {
  const source = read(part.file);
  for (const e of part.entries) assert.equal(source.slice(e.offset,e.offset+e.length),original.slice(e.start,e.end),e.name + ': unchanged declaration and body');
  // The parser checks both dot and bracket reads, including optional chains.
  const tree = ts.createSourceFile(part.file,source,ts.ScriptTarget.Latest,true);
  function visit(n) {
    if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && ['window','globalThis'].includes(n.expression.getText(tree))) {
      const key = ts.isPropertyAccessExpression(n) ? n.name.text : ts.isStringLiteral(n.argumentExpression) ? n.argumentExpression.text : null;
      assert.ok(part.windowReads.includes(key),part.file + ': undeclared global ' + key);
    }
    ts.forEachChild(n,visit);
  }
  visit(tree);
  assert.ok(!/\bimport\s*(?:\(|.*from)/.test(source),part.file + ': no private sibling imports');
  modules[part.group] = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.ok(read('kiwi-sw.js').includes('/'+part.file+'?v='),part.file+': offline shell');
  assert.ok(require('./stamps.js').scan().has(part.file),part.file+': stamp discovery');
}
// Run the actual module exports with dependencies from the original lexical scope.
const names = [...new Set(map.parts.flatMap(p=>p.entries.filter(e=>!e.fragment).flatMap(e=>[e.name,...e.deps])))];
const context = vm.createContext({console, Intl, Date, Math, Number, URL, URLSearchParams, setTimeout, clearTimeout,
  localStorage:{getItem:()=>null,setItem(){}},document:{readyState:'loading',documentElement:{lang:'fr'},baseURI:'https://kiwi.test/',addEventListener(){},querySelectorAll:()=>[]}});
context.window=context; context.addEventListener=()=>{};
vm.runInContext(original.replace(/\}\)\(\);\s*$/, 'globalThis.proof = {'+names.join(',')+'};\n})();'),context);
const deps = context.proof;
globalThis.window = context; globalThis.document = context.document;
for (const language of ['fr','en','ar']) {
  context.KiwiI18n={getLang:()=>language};
  const doc={type:'invoice',status:'draft',customer:{name:'Fixture'},issueDate:'2026-10-26',termsDays:30,lines:[{description:'Fixture',qty:3,unitHT:12345,discountPct:7,vatRate:20}]};
  for (const [group,name,args] of [['print','printable',[doc,{}]],['composer','formState',[doc]],['composer','vatOptions',[20]],['history','stats',[]],['history','visibleRows',[]]]) {
    assert.equal(JSON.stringify(modules[group][name](deps,null,args)),JSON.stringify(deps[name](...args)),language+': live '+name+' parity');
  }
}
const transport = modules.transport.createTransport(deps);
assert.ok(Object.isFrozen(transport));
assert.deepEqual(Object.keys(transport), ['api','loadCache','saveCache','rows','cursors']);
const saved=await transport.api('POST',{action:'save',type:'invoice',customer:{name:'Fixture'},lines:[{description:'Fixture',qty:3,unitHT:12345,discountPct:7,vatRate:20}]});
assert.equal(saved.doc.totals.ttcCents,deps.computeTotals(saved.doc.lines).ttcCents,'real transport demo keeps centime totals');
const owner = transport.rows(); transport.loadCache(); assert.equal(transport.rows(),owner,'one stable cache owner');
console.log('✓ invoicing split: exact reconstruction, unchanged bodies, declared boundaries, live FR/EN/AR parity and transport/cache ownership');
// Execute the live entry bootstrap. Guards can capture its public handler before
// module requests finish; boot must preserve that captured registration.
{
  const listeners = new Map();
  const win = {addEventListener(){}};
  const doc = {readyState:'loading',documentElement:{lang:'fr'},querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners.set(name,fn)};
  const realm = vm.createContext({window:win,document:doc,Intl,Date,Math,Number,setTimeout,clearTimeout});
  const entry = read('assets/invoicing.js').replace(/import\('\.\/invoicing\/(\w+)\.js\?v=\d+'\)/g, (_,name)=>'Promise.resolve(modules.'+name+')');
  realm.modules = modules;
  vm.runInContext(entry,realm);
  const captured = win.Kiwi.handlers.invoicing;
  const guarded = (...args)=>captured(...args);
  win.Kiwi.handlers.invoicing = guarded;
  for(let turn=0;turn<10;turn++) await Promise.resolve();
  listeners.get('DOMContentLoaded')?.();
  assert.equal(win.Kiwi.handlers.invoicing,guarded,'module boot preserves guards that captured the entry handler');
  assert.equal(JSON.stringify(win.KiwiInvoicing.list()),'[]','live entry exposes empty initial cache');
  assert.deepEqual(Object.keys(win).sort(),['Kiwi','KiwiInvoicing','addEventListener'],'no private state globals');
}
// Bare global names cannot evade the window-property boundary either.
const program = ts.createProgram(map.parts.map(p=>p.file),{allowJs:true,noLib:true});
const checker = program.getTypeChecker();
const browserNames = new Set(['Error','window','document','Date','Math','Number','String','Boolean','Object','Array','JSON','Set','Map','Intl','Promise','URL','URLSearchParams','Blob','fetch','AbortController','setTimeout','clearTimeout','isFinite','undefined']);
for(const part of map.parts) {
  const tree = program.getSourceFile(part.file);
  function visit(n) {
    if(ts.isIdentifier(n) && !checker.getSymbolAtLocation(n)) {
      const p=n.parent;
      const propertyName=(ts.isPropertyAccessExpression(p)&&p.name===n)||((ts.isPropertyAssignment(p)||ts.isMethodDeclaration(p))&&p.name===n);
      if(!propertyName) assert.ok(browserNames.has(n.text),part.file+': undeclared free global '+n.text);
    }
    ts.forEachChild(n,visit);
  }
  visit(tree);
}
console.log('✓ invoicing entry boot: stable guarded registration, no private globals, closed free-name boundary');
for(const [file,count] of Object.entries(map.scriptsBefore)) assert.equal((read(file).match(/<script\b[^>]*\bsrc=/g)||[]).length,count,file+': no added script tags');
// Stamp a newly imported module in isolation, including its first offline URL.
{
  const {mkdtempSync,mkdirSync,writeFileSync,rmSync} = fs;
  const {tmpdir} = await import('node:os');
  const path = await import('node:path');
  const {execFileSync} = await import('node:child_process');
  const root = mkdtempSync(path.join(tmpdir(),'kiwi-invoicing-stamps-'));
  try {
    mkdirSync(path.join(root,'assets/invoicing'),{recursive:true});
    writeFileSync(path.join(root,'assets/invoicing.js'),"import('./invoicing/print.js?v=1');\n");
    writeFileSync(path.join(root,'assets/invoicing/print.js'),'export const printable = () => 1;\n');
    writeFileSync(path.join(root,'dashboard.html'),'<script src="assets/invoicing.js?v=1"></script>');
    writeFileSync(path.join(root,'kiwi-sw.js'),"var SHELL = [\n  '/assets/invoicing.js?v=1',\n];\n");
    mkdirSync(path.join(root,'tools'));
    execFileSync(process.execPath,['tools/bump-stamp.js','assets/invoicing/print.js'],{env:{...process.env,KIWI_STAMPS_ROOT:root},stdio:'pipe'});
    const entry=fs.readFileSync(path.join(root,'assets/invoicing.js'),'utf8');
    const sw=fs.readFileSync(path.join(root,'kiwi-sw.js'),'utf8');
    assert.ok(entry.includes("import('./invoicing/print.js?v=2')"));
    assert.ok(sw.includes("'/assets/invoicing/print.js?v=2'"),'stamp tool adds and versions new module offline URL');
  } finally { rmSync(root,{recursive:true,force:true}); }
}
console.log('✓ invoicing loading: shell tag counts unchanged; stamp tool discovers dynamic imports and adds offline modules');
