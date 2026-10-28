import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as api from '../assets/hotel-economat-transport.js';
const originalFetch = globalThis.fetch, originalTimer = globalThis.setTimeout;
const calls = [];
try {
  for (const operation of ['getJson', 'post']) {
    const invoke = () => operation === 'getJson' ? api.getJson('/api/fixture') : api.post({action:'review',revision:3,idempotencyKey:'fixture-key'}, 'fixture');
    for (const status of [200, 400, 409, 503]) {
      calls.length = 0;
      globalThis.fetch = async (url, options) => { calls.push({url,options}); return {ok:status===200,status,json:async()=>({error:'mapped',value:1})}; };
      if (status === 200) assert.equal((await invoke()).value,1);
      else await assert.rejects(invoke(), e => e.message==='mapped' && e.status===status && e.body.value===1);
      assert.equal(calls.length,1, 'no automatic retries');
      assert.equal(calls[0].options.credentials,'same-origin');
      if (operation==='post') {
        assert.equal(calls[0].url,'/api/inventory/internal-requests');
        assert.deepEqual(JSON.parse(calls[0].options.body),{merchant:'fixture',action:'review',revision:3,idempotencyKey:'fixture-key'});
      } else assert.equal(calls[0].options.cache,'no-store');
    }
    globalThis.fetch = async () => ({ok:false,status:502,json:async()=>{throw Error('invalid-json');}});
    await assert.rejects(invoke(),e=>e.message==='http-502' && e.status===502);
    globalThis.fetch = async () => ({ok:true,status:200,json:async()=>{throw Error('invalid-json');}});
    assert.equal(Object.keys(await invoke()).length,0);
    globalThis.setTimeout = (fn, ms) => originalTimer(fn, Math.min(ms, 5));
    for (const bodyTimeout of [false,true]) {
      calls.length=0;
      globalThis.fetch = (url,options) => {calls.push({options});return bodyTimeout ? Promise.resolve({ok:true,json:()=>new Promise(()=>{})}) : new Promise(()=>{});};
      await assert.rejects(invoke(),e=>e.code==='request-timeout');
      assert.equal(calls.length,1);
      assert.equal(calls[0].options.signal.aborted,true);
    }
    globalThis.setTimeout = originalTimer;
  }
  const window = {Kiwi:{handlers:{}},KiwiInventory:{merchant:()=> 'fixture'}};
  const document = {querySelector:()=>null};
  const urls=[];
  globalThis.fetch=async url => {
    urls.push(url);
    const body=url.includes('internal-requests') ? {requests:[{request:{id:'existing'}}],confirmationSide:'economat'} : {data:{units:[{id:'department'}],items:[{itemId:'linen'}]}};
    return {ok:true,json:async()=>body};
  };
  new vm.Script(fs.readFileSync('assets/hotel-economat-requests.js','utf8'), {
    filename:fileURLToPath(new URL('../assets/hotel-economat-requests.js',import.meta.url)),
    importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER
  }).runInNewContext({window,document});
  const controller=window.KiwiEconomatRequests;
  await controller.reload();
  assert.equal(controller.state().error,'');
  assert.equal(controller.state().requests[0].request.id,'existing');
  assert.equal(controller.state().side,'economat');
  assert.equal(controller.state().units[0].id,'department');
  assert.equal(controller.state().catalogue[0].itemId,'linen');
  assert.equal(urls.length,3);
  controller.reset();
  assert.equal(controller.state().loaded,false);
} finally { globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer; }
console.log('PASS economat transport: payloads, no retries, 4xx/5xx, malformed JSON, fetch/body deadlines');
