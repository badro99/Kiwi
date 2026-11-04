import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fixture } from './server-money-fixture.mjs';
import { getVerticalOps } from '../functions/api/_credit-book-store.js';
const f=await fixture(path.resolve('.'));
const req=new Request('https://kiwi.test/api/store');
let response=await getVerticalOps(req,f.env,f.merchant);
assert.equal(response.status,200,'a truly absent book is empty');
const failing={...f.env,DB:{prepare(q){if(q.includes('length(data)')) throw Error('D1 unavailable');return f.DB.prepare(q);}}};
response=await getVerticalOps(req,failing,f.merchant);
assert.equal(response.status,503,'database failure must never return an empty book');
assert.equal((await response.json()).error,'credit-book-unavailable');
f.sql.prepare("INSERT INTO store_docs VALUES(?,'creditbook','broken json',1,1)").run(f.merchant);
assert.equal((await getVerticalOps(req,f.env,f.merchant)).status,503,'corrupt book is unavailable');
const source=fs.readFileSync('assets/pos-epicerie.js','utf8');
const context={};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function balanceOf('),source.indexOf('  /* Deux caisses hors ligne')),context);
const old=new Date('2026-01-01'),later=new Date('2026-01-02');
const hist=[{type:'debt',amt:.10,at:old},{type:'debt',amt:.20,at:old},{type:'pay',amt:.30,at:later},{type:'debt',amt:.01,at:later}];
assert.equal(context.oldestDebt({hist}),later,'settled decimal debt must not retain its older date');
const oldExpression=source.slice(source.indexOf('  function ardoiseCard(')).match(/const old = (.*);/)[1];
for (const [days,expected] of [[14.5,false],[15,true]]) {
  const value=vm.runInNewContext(oldExpression,{oldest:new Date(Date.now()-days*86400000),Date,DAY:86400000,bal:1});
  assert.equal(value,expected,'aging thresholds count completed days');
}
// Exercise the real read transport and the configured UI error callback.
const cloud=fs.readFileSync('assets/cloud-doc.js','utf8');
const vertical=fs.readFileSync('assets/vertical-state.js','utf8');
const notices=[];
const ui={window:{Kiwi:{toast:(...a)=>notices.push(a)}},feature:'verticalops',slugOf:()=>f.merchant,on:()=>true,
 document:{documentElement:{lang:'fr'}},fetch:async()=>response,opts:{},Promise,Error,encodeURIComponent};
vm.createContext(ui);
const callback=vertical.slice(vertical.indexOf('    onPullError: function'),vertical.indexOf('    onRefused: function')).trim().replace(/^onPullError:/,'(').replace(/,$/,')');
ui.opts.onPullError=vm.runInContext(callback,ui);
vm.runInContext(cloud.slice(cloud.indexOf('    function pull(first)'),cloud.indexOf('    function push(delay')),ui);
assert.equal(await ui.pull(true),false);
assert.match(notices[0]?.[0]||'',/indisponible/,'failed read visibly says unavailable');
console.log('✓ Real D1 failure/corruption return 503; UI announces unavailable; FIFO debt aging uses exact centimes.');
f.close();
