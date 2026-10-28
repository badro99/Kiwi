import { ticketsTestSource } from './tickets-test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(p, 'utf8');
function fn(file, name, end, globals = {}) {
  const source = file === 'assets/tickets.js' ? ticketsTestSource() : read(file); const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name);
  return vm.runInNewContext(source.slice(start, source.indexOf(end, start)) + '\n' + name, globals);
}
const cases = {
  'onboarding#0': async () => {
    const source = read('assets/onboarding.js');
    assert.match(source, /catch \(error\) \{ submitError = error; \}/);
    const body = source.slice(source.indexOf('      const reason ='), source.indexOf('      if (kit) return { error: failed }'));
    for (const [error, expected] of [[{status:409},'already exists'],[{status:403},'Sign in again'],[{status:422},'Check the information'],[{name:'QuotaExceededError'},'Storage is unavailable']]) {
      const text = vm.runInNewContext(body + '\nfailed', {submitError:error, tr:o=>o.en});
      assert.ok(text.includes(expected), text);
    }
    for (const status of [400, 401, 403, 409, 422, 503]) {
      const register = fn('assets/merchant-config.js', 'registerNewStore', '  /* Push this store', {
        slugMerchant:()=> 'synthetic', postRaw:async()=>({ok:false,status,json:async()=>({})}), window:{}, freshDrop:()=>{}
      });
      await assert.rejects(register({name:'Synthetic',throwOnError:true}), e=>e.status===status);
      assert.equal(await register({name:'Synthetic'}),false);
    }
    assert.match(read('assets/venues.js'), /if \(cfg.throwOnError\) throw error/);
    // The submit layer must pass the original error to finish.
    const data = (await import('../assets/onboarding-data.js')).default;
    const error = Object.assign(new Error('synthetic'), {status:409});
    await assert.rejects(data.submit({S:{pins:[],bizName:'Synthetic',city:'',ownerName:'',goals:[]}, t:{}, tr:o=>o.en, venueApi:{createVenue:async()=>{throw error;}}}), e=>e===error);
  },
  'onboarding#1': () => {
    const source = read('assets/onboarding.js').split('  function celebrate()')[1].split('  function enterApp()')[0];
    const path = read('assets/icons/material/check.svg').match(/d="([^"]+)"/)[1];
    assert.ok(source.includes("mi('" + path + "')")); assert.match(source,/kob-hero-mark kob-mint/); assert.match(read('assets/onboarding.css'),/\.kob-hero-mark\.kob-mint\{color:var\(--mint\);\}/); assert.doesNotMatch(source,/#7DF2B0|stroke=/);
  },
  'employee#1': () => {
    const saved = new Map();
    const globals = {records:()=>[], merge:a=>a, Date, copies:{}, store:()=>({setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}), QUEUE_PREFIX:'q:', idb:async()=>true};
    const write = fn('assets/employee-live.js','writeQueue','  function dropItem',globals);
    return Promise.resolve().then(async()=>{
      const record={opId:'synthetic-op',at:Date.now(),done:true,outcome:{result:'rejected',reason:'employee-request-failed'}};
      await write('synthetic',[record]);
      assert.deepEqual(JSON.parse(saved.get('q:synthetic:outcomes')), [record]);
      const restored = fn('assets/employee-live.js', 'records', '  function readQueue', {
        store:()=>({getItem:k=>saved.get(k)}), QUEUE_PREFIX:'q:', copies:{}, merge:(a,b)=>a.concat(b)
      });
      assert.equal(restored('synthetic')[0].outcome.result, 'rejected');
      assert.equal(restored('other-owner').length, 0);
      assert.match(read('assets/employee-live.js'), /punchOutcomes: function/);
    });
  },
  'vision#1': () => {
    const source=read('functions/api/ai/salle-import.js');
    const block=source.slice(source.indexOf('      } catch (_)',source.indexOf('const r2 =')),source.indexOf('\n    }\n  }',source.indexOf('const r2 =')));
    const result=vm.runInNewContext('(function(){try{throw Error()'+block.trim()+'})()', {json:o=>o,usedModel:'synthetic'});
    assert.equal(result.reason,'model'); assert.equal(result.stage,'interpretation');
  },
  'economat#0': async () => {
    const host={innerHTML:''}; let retry;
    const mount=fn('assets/hotel-economat.js','mountRequests', '  /* Le stock lu ici',{
      document:{querySelector:()=>host},window:{},Kiwi:{activePage:'economat'},handlers:new Proxy({}, {set:(o,k,v)=>{retry=v;return true;}}),
      loadRequests:()=>Promise.reject(Error('synthetic')),text:()=>({requestsFail:'failed',retry:'Retry'}),esc:s=>s
    });
    mount(); await new Promise(r=>setImmediate(r));
    assert.match(host.innerHTML,/role="alert"/); assert.match(host.innerHTML,/eco-requests-retry/); assert.equal(typeof retry,'function');
  },
  'app#1': async () => {
    const source=read('app/src/native-runtime.js'); assert.match(source,/N.callResult = callResult/);
    const call=fn('app/src/native-runtime.js','callResult','  function call(');
    assert.equal((await call(null,'run')).reason,'unsupported');
    for(const [error,reason] of [[{code:'USER_CANCELLED'},'cancelled'],[{code:'UNIMPLEMENTED'},'unsupported'],[Error('synthetic'),'failure']]) {
      assert.equal((await call({run:()=>{throw error;}},'run')).reason,reason);
      assert.equal((await call({run:()=>Promise.reject(error)},'run')).reason,reason);
    }
    assert.equal((await call({run:()=>42},'run')).value,42);
  },
  'shopify#1': () => {
    const source=read('functions/api/shopify/_replay-orders.js');
    const line=source.match(/  const exceptions = .*;/)[0];
    const previous={exceptions:Array.from({length:70},(_,i)=>({order:String(i)}))};
    const listed={exceptions:[{order:'last'}]};
    const result=vm.runInNewContext(line+'\nexceptions',{previous,listed});
    assert.equal(result.length,71); assert.equal(result[0].order,'0');
  },
  'tickets#1': () => {
    for(const [name,field,end] of [['addFiles','files','  function renderFollowupImages'],['addFollowupFiles','followupFiles','  function newIdempotencyKey']]) {
      const state={files:[],followupFiles:[]}, error={};
      const add=fn('assets/tickets.js',name,end,{state,Array,MAX_IMAGES:3,MAX_IMAGE_BYTES:100, fileKey:f=>f.name,t:s=>s,$:()=>error,fileInput:{},followupFileInput:{},renderSelectedImages:()=>{},renderFollowupImages:()=>{},draft:{save:()=>{}}});
      const file={name:'synthetic.png',type:'image/png',size:1};
      add([file,file,file,file]); assert.equal(state[field].length,1); assert.equal(error.textContent,'');
    }
  }
};
let failed=0;
for(const [name,test] of Object.entries(cases)) {
  if(process.argv[2] && process.argv[2]!==name)continue;
  try {await test();console.log('PASS '+name);} catch(e){failed++;console.error('FAIL '+name+': '+e.message);}
}
process.exitCode=failed?1:0;
