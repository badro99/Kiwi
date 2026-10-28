import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const document = {readyState:'loading',documentElement:{lang:'fr'},addEventListener(){},querySelector(){return null;},createElement(){return {setAttribute(){}};}};
const localStorage = {getItem(){return null;},setItem(){}};
const window = {document,localStorage,addEventListener(){},KiwiEnv:{isReal:()=>true},KiwiCloudDoc:{currentSlug:()=> 'fixture'},KiwiDayReport:{businessDay:()=> '2026-10-28'}};
const context = vm.createContext({window,document,localStorage,console,Date,Intl,setTimeout,clearTimeout});
for (const file of ['briefing-rules.js','briefing-persistence.js','briefing.js']) {
  const url = new URL('../assets/'+file,import.meta.url);
  if (fs.existsSync(url)) vm.runInContext(fs.readFileSync(url,'utf8'),context);
}
const T=window.KiwiBriefing._test;
const input={items:[{id:'a',name:'Café',tracked:true,balance:0.9,threshold:1,par:1,supplier:'S',unit:'kg'}]};
const line=T.lowStockRule(input);
assert.equal(line.kind,'low-stock');
assert.equal(line.evidence.count,1);
assert.equal(line.action.args.lines[0].qty,0.1);
T.write({days:[{id:'a',day:'2026-10-28',venue:'fixture',updatedAt:1,lines:[]},{id:'b',day:'2026-10-28',venue:'other',lines:[]}]});
assert.equal(T.read().days.length,1);
assert.deepEqual(JSON.parse(JSON.stringify(T.mergeDocs(T.read(),T.read()))),JSON.parse(JSON.stringify(T.read())));
console.log('PASS: current stock evaluation, tenant filtering and idempotent persistence');
if (!process.env.KIWI_BRIEFING_BEHAVIOR_ONLY) {
  const {createRules}=require('../assets/briefing-rules.js');
  const rules=createRules({limit:()=>1,businessDay:()=> '2026-10-28',now:()=>0});
  assert.deepEqual(JSON.parse(JSON.stringify(rules.lowStockRule(input))),JSON.parse(JSON.stringify(line)));
  assert.equal(typeof require('../assets/briefing-persistence.js').createPersistence,'function');
  console.log('PASS: extracted modules execute without browser globals');
}
