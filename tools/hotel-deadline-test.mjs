import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
const editors=fs.readFileSync('assets/hotel/editors.js','utf8');
const model=fs.readFileSync('assets/hotel/model.js','utf8');
const classes=[['performance','GET'],['billing-draft','GET'],['stays','GET'],['billing-draft','POST'],['stays','POST'],['cancel','POST'],['production','GET']];
assert.equal((editors.match(/await cuEditorRequest\(/g)||[]).length,7,'every editor transport uses the deadline owner');
assert.equal((model.match(/deadlineFetch: cuModelDeadlineFetch/g)||[]).length,2,'both failed imports retain bounded fallback');
for(const mode of ['fetch','body']) {
  for(const [route,method] of classes) {
    const calls=[],timings=[],cache=new Map();let recover=false;
    const context=vm.createContext({AbortController,URLSearchParams,Promise,Set,Error,
      setTimeout(fn,ms){timings.push(ms);return setTimeout(fn,2);},clearTimeout,
      tx:s=>s,cuStayScope:()=>'fixture-hotel',cuStayCache:()=>cache,cuStaysChanged(){},
      fetch:async(url,options)=>{calls.push([url,options]);
        if(recover)return {ok:true,json:async()=>({stays:[{id:'stay-test'}]})};
        if(mode==='fetch')return new Promise(()=>{});
        return {ok:true,json:()=>new Promise(()=>{})};}
    });
    vm.runInContext(split.declaration(editors,'cuDeadlineFetch')+'\n'+split.declaration(editors,'cuUncertainWrites')+'\n'+split.declaration(editors,'cuEditorRequest'),context);
    context.url='/api/hotel/'+(route==='cancel'?'stays':route);
    context.options={method,...(method==='POST'?{body:JSON.stringify({merchant:'fixture-hotel',id:'stay-test',action:route==='cancel'?'cancel':'save'})}:{})};
    await assert.rejects(vm.runInContext('cuEditorRequest(url,options)',context),method==='POST'?/Résultat incertain/:/request-timeout/,mode+' '+route+' settles');
    assert.equal(timings[0],method==='POST'?20000:15000,'read/write budget');
    if(method==='POST') {
      assert.ok(calls.some(([url,opts])=>url.includes('/stays?')&&!opts.method),'write uncertainty triggers stay reread');
      const writes=calls.filter(([,o])=>o.method==='POST').length;
      context.options.body = JSON.stringify({ ...JSON.parse(context.options.body), note: 'changed after lost response' });
      await assert.rejects(vm.runInContext('cuEditorRequest(url,options)',context),/Résultat incertain/);
      assert.equal(calls.filter(([,o])=>o.method==='POST').length,writes,'failed reread blocks retry');
      recover=true;await vm.runInContext('cuEditorRequest(url,options)',context);
      assert.ok(cache.has('stay-test'),'successful reread refreshes stay before retry');
    }
  }
  const c=vm.createContext({AbortController,Promise,Error,setTimeout:fn=>setTimeout(fn,2),clearTimeout,fetch:()=>mode==='fetch'?new Promise(()=>{}):Promise.resolve({json:()=>new Promise(()=>{})})});
  vm.runInContext(split.declaration(model,'cuModelDeadlineFetch'),c);
  for(const route of ['window','in-house'])await assert.rejects(vm.runInContext('cuModelDeadlineFetch("'+route+'")',c),/request-timeout/,'model fallback '+route+' '+mode);
}
console.log('✓ hotel deadlines: all seven call classes and both import fallbacks settle hung transport/body; uncertain writes reread and block unsafe retries');
