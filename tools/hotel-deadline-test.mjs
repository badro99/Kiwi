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
// hotel#0: the OTA calendar read/sync ends in the visible error state when the request or its body hangs, and refresh is enabled again.
{
  const realFetch = globalThis.fetch, realTimer = globalThis.setTimeout;
  const channelsSource = fs.readFileSync('assets/hotel-channels.js', 'utf8');
  async function run(mode, sync) {
    let factory; const state = { loading: false, error: '', rows: [], loaded: false }; const toasts = [];
    const window = { __kiwiHotelInternal: { define(_n, fn) { factory = fn; } } };
    new vm.Script(channelsSource, { filename: new URL('../assets/hotel-channels.js', import.meta.url).pathname, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER }).runInNewContext({ window });
    const scope = { CHANNELS: [], DIRECT_TREND: [], MAD: String, cuChannelState: state, cuMerchantSlug: () => 'riad', cuStarter: () => ({}), cuState: () => ({}), donutCss: () => '', esc: String, hxLocale: () => 'fr', rerender() {}, toast: (m) => toasts.push(m), tx: (s) => s, txk: (s) => s };
    const api = factory(scope);
    globalThis.setTimeout = (fn, ms) => realTimer(fn, Math.min(ms, 5));
    globalThis.fetch = (url, options) => {
      if (mode === 'fetch') return new Promise(() => {});
      if (mode === 'body') return Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
      if (mode === 'shapeless') return Promise.resolve({ ok: true, status: 200, json: async () => null });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ channels: [{ id: 'c1' }], processed: 1 }) });
    };
    try {
      const settled = await Promise.race([api.cuLoadChannels(sync).then(() => 'settled'), new Promise((r) => realTimer(() => r('hung'), 1500))]);
      return { settled, state, toasts };
    } finally { globalThis.fetch = realFetch; globalThis.setTimeout = realTimer; }
  }
  for (const sync of [false, true]) for (const mode of ['fetch', 'body', 'shapeless']) {
    const out = await run(mode, sync);
    assert.equal(out.settled, 'settled', 'channels ' + mode + ' sync=' + sync + ' settles');
    assert.equal(out.state.loading, false, 'refresh is enabled again after ' + mode);
    assert.ok(out.state.error, 'a visible error replaces the list state after ' + mode);
    assert.equal(out.state.loaded, false);
  }
  const good = await run('good', false);
  assert.equal(good.state.error, '');
  assert.equal(good.state.rows.length, 1);
}
console.log('✓ hotel deadlines: all seven call classes and both import fallbacks settle hung transport/body; uncertain writes reread and block unsafe retries');
