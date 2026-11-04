import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
import { deadlineVmSource } from './deadline-vm-source.mjs';
const read = f => fs.readFileSync(f, 'utf8');
const fn = (file, name) => split.declaration(read(file), name);
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
function realm(fetch) {
  const timers = new Map(); let id = 0;
  const c = vm.createContext({ fetch, AbortController, URLSearchParams, location: { search: '?s=test' },
    setTimeout(f) { timers.set(++id, f); return id; }, clearTimeout(i) { timers.delete(i); },
    encodeURIComponent, console });
  return { c, run: s => vm.runInContext(deadlineVmSource(s), c), async expire() { await flush(); for (const f of [...timers.values()]) f(); await flush(); } };
}
const never = () => new Promise(() => {});
for (const stage of ['fetch', 'body']) {
  const fetch = stage === 'fetch' ? never : async () => ({ ok: true, status: 200, json: never });
  for (const method of ['catalog', 'placeOrder', 'openSession']) {
    const h = realm(fetch);
    h.run(fn('assets/orderpro/transport.js', 'create') + '; globalThis.net = create({location, fetch, demo:()=>null});');
    let done = false, result;
    h.c.net[method]({}).then(r => { done = true; result = r; });
    await h.expire(); assert.ok(done, method + ' settles ' + stage);
    if (method !== 'catalog') assert.equal(result.uncertain, true);
  }
  const h = realm(fetch);
  h.run(fn('assets/simple-food-cost/network.js', 'api') + ';globalThis.api=api;');
  let failed = false; h.c.api('POST', '', {}).catch(() => { failed = true; });
  await h.expire(); assert.ok(failed, 'foodcost rejects ' + stage);
}
{
  const h = realm(async () => ({ ok: true, status: 200, json: async () => { throw Error('bad'); } }));
  h.run(fn('assets/orderpro/transport.js', 'create') + ';globalThis.net=create({location,fetch,demo:()=>null});');
  assert.equal((await h.c.net.placeOrder({})).uncertain, true);
}
for (const change of ['merchant', 'sheet', 'edit']) {
  let resolve;
  const h = realm(never), S = { merchant: 'a', draft: {name:'A'}, openId:'one', baseVersion:1, dirty:true, sheets:[] };
  Object.assign(h.c, { S, merchant: () => S.merchant, online:()=>true, paint(){}, tr:x=>x, rememberDraft(){}, replaceSheet(){ throw Error('stale mutation'); },
    api:()=>new Promise(r=>{resolve=r;}) });
  h.run(fn('assets/simple-food-cost/network.js', 'save'));
  const pending = h.c.save(false);
  if (change==='merchant') S.merchant='b';
  if (change==='sheet') { S.openId='two'; S.draft={name:'B'}; }
  if (change==='edit') S.draft.name='edited';
  resolve({status:200,data:{sheet:{id:'one',version:2}}}); await pending;
  assert.equal(S.dirty,true); assert.equal(S.saving,false); assert.equal(S.message,'');
}
{
  let resolve;
  const h = realm(never), S={merchant:'a',draft:null};
  Object.assign(h.c,{S,merchant:()=>S.merchant,paint(){},changed(){},restoreDraft(){return false;},online:()=>true,api:()=>new Promise(r=>{resolve=r;})});
  h.run(fn('assets/simple-food-cost/network.js','load'));
  const p=h.c.load(); S.merchant='b'; S.sheets=['new']; resolve({status:200,data:{sheets:['old']}}); await p;
  assert.deepEqual(S.sheets,['new']);
}
for (const stage of ['fetch','body']) {
  const h=realm(stage==='fetch'?never:async()=>({ok:true,status:200,json:never}));
  Object.assign(h.c,{remote:{pending:null},merchant:()=> 'a',hubQS:()=>'',HUB_FEATURE:'hub'});
  h.run(fn('assets/kitchen-print-queue.js','claimRemote'));
  const p=h.c.claimRemote(true); await h.expire(); await p; assert.equal(h.c.remote.pending,null);
  const q=h.c.claimRemote(true); assert.ok(h.c.remote.pending); await h.expire(); await q;
}
for (const response of [{}, {rev:0,data:null}]) {
  const h=realm(async()=>({ok:true,json:async()=>response}));
  Object.assign(h.c,{core:{VENUE:'a',db:{products:[]}},cloud:{read:{},dirty:false},cloudOn:()=>true,dirtyToken:()=>'',load(){},schedulePush(){}});
  h.run(fn('assets/boutique-catalog-parts.js','pull'));
  await h.c.pull(true); assert.equal(!!h.c.cloud.read.a,'rev' in response);
}
console.log('✓ net1: real main ordering, foodcost, catalogue and lease request behavior');
for (const stage of ['fetch','body']) {
  const h=realm(stage==='fetch'?never:async()=>({ok:true,status:200,json:never}));
  Object.assign(h.c,{cloud:{read:{a:1},busy:false},core:{VENUE:'a',db:{}},cloudOn:()=>true,dirtyToken:()=> 'dirty',schedulePush(){}});
  h.run(fn('assets/boutique-catalog-parts.js','pushNow'));
  h.c.pushNow(); assert.equal(h.c.cloud.busy,true); await h.expire(); assert.equal(h.c.cloud.busy,false);
}
{
  let fetched=0;
  const h=realm(()=>{fetched++;return never();});
  Object.assign(h.c,{inflight:false,subs:[()=>{}],document:{visibilityState:'visible'},slug:()=> 'a',isReal:()=>true,idleDelay:1000,currentRoom:()=>null,emit(){},schedule(){},rejectImport:()=>Promise.reject(Error('module unavailable'))});
  vm.runInContext(fn('assets/floorplan-live.js','poll').replaceAll('import(', 'rejectImport('),h.c);
  h.c.poll();await flush();assert.equal(h.c.inflight,false);assert.equal(fetched,0);assert.equal(h.c.last.ok,false);
}
{
  const source=read('assets/pressing/workshop.js');
  const start=source.indexOf('cancelB.onclick = ')+ 'cancelB.onclick = '.length;
  // Extract the genuine callback using the same parser as the split suites.
  const {createRequire}=await import('node:module');
  const require=createRequire(import.meta.url), ts=require('../app/node_modules/typescript');
  const ast=ts.createSourceFile('workshop.js',source,ts.ScriptTarget.Latest,true);
  let callback;
  function visit(n){if(ts.isArrowFunction(n) && n.getStart(ast)===start) callback=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
  assert.ok(callback);
  let fetched=0;const messages=[];
  const h=realm(()=>{fetched++;return never();});
  Object.assign(h.c,{document:{createElement:()=>({setAttribute(){},removeAttribute(){},remove(){},addEventListener(){},appendChild(pad){queueMicrotask(()=>pad.onsubmit('1234'));}}),body:{appendChild(){}}},cancelB:{focus(){}},notifyTr:s=>s,pressingScope:()=> 'a',o:{id:'one'},toast:s=>messages.push(s),rejectImport:()=>Promise.reject(Error('module unavailable'))});
  const cancel=vm.runInContext('('+callback.replaceAll('import(', 'rejectImport(')+')',h.c);
  await cancel();assert.equal(fetched,0);assert.equal(messages.length,1);
}
