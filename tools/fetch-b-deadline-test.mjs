import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = p => fs.readFileSync(p, 'utf8');
const sources = Object.fromEntries(['booking.js', 'floorplan-live.js', 'hotel/model.js', 'hotel-economat-requests.js', 'pressing-caisse.js', 'tickets.js'].map(p => [p, read('assets/' + p)]));
function extract(file, name) {
  const source = sources[file];
  const start = source.indexOf('async function ' + name + '(');
  assert.ok(start >= 0, name);
  let text = '';
  for (const line of source.slice(start).split('\n')) {
    text += line + '\n';
    try { new vm.Script('(' + text + ')'); return text; } catch {}
  }
  throw Error('Cannot extract ' + name);
}
function setup(extra = {}) {
  const timers = new Map(), calls = [], messages = [];
  let serial = 0;
  const c = vm.createContext({ AbortController, FormData: class { constructor() {} get(k) { return ({name:'Guest',phone:'+212600000000'})[k] || ''; } append() {} },
    setTimeout(fn, ms) { timers.set(++serial, {fn, ms}); return serial; }, clearTimeout(id) { timers.delete(id); },
    fetch(url, options) { calls.push({url, options}); return new Promise(() => {}); },
    messages, console, ...extra });
  vm.runInContext(read('assets/request-deadline.mjs').replace('export ', '') + '\nconst net = {deadlineFetch};', c);
  const run = text => vm.runInContext(text.replace(/import\('[^']*request-deadline.mjs'\)/g, 'Promise.resolve(net)'), c);
  async function expire(p) {
    for (let i = 0; i < 25; i++) await Promise.resolve();
    const deadline = [...timers.values()].find(t => t.ms >= 14900);
    assert.ok(deadline, 'request installs a deadline (old code fails here)');
    deadline.fn();
    for (let i = 0; i < 35; i++) await Promise.resolve();
    assert.ok(calls[0].options.signal.aborted, 'transport aborted');
    if (p) await p;
  }
  return {c, run, expire, calls, timers, messages};
}
const event = {preventDefault() {}};
for (const name of ['submit', 'submitHotel']) {
  const button = {}, error = {}, refs = new Map();
  const h = setup({ state:{service:{id:'room'},lang:'fr'}, merchant:'demo', party:()=>1, phoneValue:x=>x, emailOk:()=>true,
    t:x=>x, ht:x=>x, ssGet:k=>refs.get(k), ssSet:(k,v)=>refs.set(k,v), crypto:{randomUUID:()=> 'attempt'},
    ssDel:()=>assert.fail('must retain retry identity'), success:()=>assert.fail(), hotelSuccess:()=>assert.fail() });
  const fn = h.run('(' + extract('booking.js', name) + ')');
  await h.expire(fn({...event,currentTarget:{querySelector:s=>s==='[type=submit]'?button:error}}));
  assert.equal(button.disabled,false); assert.equal(error.textContent,'timeout'); assert.equal(refs.size,1);
  console.log('PASS booking ' + name);
}
{
  const h = setup({window:{KiwiEnv:{isReal:()=>true},KiwiCloudDoc:{currentSlug:()=> 'demo'},addEventListener(){}},document:{addEventListener(){}}});
  h.run(sources['floorplan-live.js']); h.c.window.KiwiFloorLive.watch(()=>{});
  await h.expire(); assert.equal(h.c.window.KiwiFloorLive.last().reason,'offline');
  h.c.window.KiwiFloorLive.refresh();
  for(let i=0;i<15;i++) await Promise.resolve();
  assert.equal(h.calls.length,2); console.log('PASS floor retry');
}
{
  const loads = new Map();
  const h = setup({window:{KiwiStore:{slugFor:()=> 'demo'}},cuVenueId:()=> 'v',cuStayScope:()=> 's',cuStayCache:()=>new Map(),cuStayLoads:loads,txk:x=>x});
  const fn=h.run('('+extract('hotel/model.js','cuFetchStaysForWindow')+')');
  await h.expire(fn('a','b')); assert.equal(loads.get('s').loading,false); assert.match(loads.get('s').error,/réessayez/);
  console.log('PASS hotel stale warning');
}
for (const operation of ['getJson','post']) {
  const btn={isConnected:true,setAttribute(){},removeAttribute(){}};
  const h=setup({pending:false,sheet:{ref:{el:{querySelector:()=>btn}}},merchant:()=> 'demo',key:()=> 'identity',T:()=>({}),errorText:()=> 'retry',Kiwi:{toast:x=>h.messages.push(x)}});
  h.run(extract('hotel-economat-requests.js',operation));
  if(operation==='getJson') {
    const p=h.run("getJson('/api/test')"); const caught=p.catch(e=>e);
    await h.expire(); assert.equal((await caught).code,'request-timeout');
  } else {
    const fn=h.run('('+extract('hotel-economat-requests.js','run')+')');
    await h.expire(fn({request:{id:'r',revision:1}},'review',{},'ok'));
    assert.equal(h.c.pending,false); assert.equal(btn.disabled,false); assert.deepEqual(h.messages,['retry']);
  }
  console.log('PASS economat '+operation);
}
{
  const source=sources['pressing-caisse.js'];
  const body=source.slice(source.indexOf('cancelB.onclick = async () => {')+'cancelB.onclick = '.length,source.indexOf('\n    };',source.indexOf('cancelB.onclick = async () => {'))+6);
  const h=setup({prompt:()=>String(10**3),toast:x=>h.messages.push(x),pressingScope:()=> 'demo',o:{id:'order'}});
  await h.expire(h.run('('+body+')')()); assert.equal(h.messages.length,1); console.log('PASS pressing cancellation recovery');
}
for(const name of ['publish','publishFollowup','moveTicket','saveClassification']) {
  const nodes=new Map(); const node=k=>{if(!nodes.has(k))nodes.set(k,{value:'text',textContent:'Send',innerHTML:'Send',isConnected:true,hidden:true});return nodes.get(k);};
  const ticket={id:1};
  const h=setup({state:{files:[],followupFiles:[],tickets:[ticket],followupTicketId:1},API:'/api/tickets',draftController:Promise.resolve({store:null}),saveDraft:async()=>{},draft:{save:async()=>{},restore:async()=>{}},$:node,t:x=>x,newIdempotencyKey:()=> 'attempt',friendlyError:()=> 'retry',showToast:x=>h.messages.push(x),loadTickets:async()=>{}});
  const fn=h.run('('+extract('tickets.js',name)+')');
  const editor={dataset:{classificationForm:'1'},querySelector:()=>node('classification')};
  const p=name==='moveTicket'?fn(ticket,'fixed',node('move')):fn({...event,target:{closest:()=>editor}});
  await h.expire(p);
  const key=({publish:'publishTicket',publishFollowup:'publishFollowup',moveTicket:'move',saveClassification:'classification'})[name];
  assert.equal(node(key).disabled,false); assert.ok(h.messages.includes('retry')||node('formError').textContent==='retry'||node('followupError').textContent==='retry');
  if(name==='publish')assert.equal(h.c.state.publishAttempt.key,'attempt');
  console.log('PASS tickets '+name);
}
// The same absolute deadline also bounds a stalled body, and cleans successful timers.
{
  const h=setup();
  h.c.fetch=async()=>({ok:true,json:async()=>({ok:true})});
  const result=await h.run("deadlineFetch('/ok').then(r=>r.json())");
  assert.equal(result.ok,true); assert.equal(h.timers.size,0);
  h.c.fetch=async(url, options)=>{h.calls.push({url,options});return {ok:true,json:()=>new Promise(()=>{})};};
  const p=h.run("deadlineFetch('/body').then(r=>r.json())").catch(e=>e);
  await h.expire(); assert.equal((await p).code,'request-timeout'); assert.equal(h.timers.size,0);
  console.log('PASS success cleanup and stalled response body');
}
