import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(p, 'utf8');
const flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
let failed=0;
async function test(name, fn) { try { await fn(); console.log('PASS '+name); } catch(e) { failed++; console.error('FAIL '+name+': '+e.message); } }
function requests() {
  const pending=[];
  return { pending, fetch: () => new Promise((resolve,reject)=>pending.push({resolve,reject})),
    reply(i, data) { pending[i].resolve({ok:true,json:async()=>data}); },
    /* The floor poll loads its deadline helper first, so its request starts a few microtasks later. */
    async at(i) { for (let k=0;k<50&&!pending[i];k++) await Promise.resolve(); return pending[i]; } };
}
function booking() {
  const src=read('assets/booking.js'), net=requests();
  const c=vm.createContext({ ...net, merchant:'fixture', state:{service:{id:'service'},date:'2026-10-26',partySize:2},
    party:()=>2, renderTimes:()=>{}, hotelRoomList:()=>{}, t:x=>x, ht:x=>x,
    app:{querySelector:()=>null}, setTimeout });
  vm.runInContext(src.slice(src.indexOf('  var slotSeq='),src.indexOf('  function times()'))+
    src.slice(src.lastIndexOf('\n',src.indexOf('  async function loadHotelRooms'))+1,src.indexOf('\n',src.indexOf('  async function loadHotelRooms'))),c);
  return {c,net};
}
await test('booking#0 obsolete slot config cannot replace newest service',async()=>{
  const {c,net}=booking(); const a=c.loadSlots(), b=c.loadSlots();
  await net.at(1);net.reply(1,{services:[{id:'service',price:20}],slots:[2]});await b;
  net.reply(0,{services:[{id:'service',price:10}],slots:[1]});await a;
  assert.equal(c.state.service.price,20);assert.equal(c.state.config.services[0].price,20);
});
await test('booking#1 obsolete hotel success and failure cannot replace newer search',async()=>{
  for(const reject of [false,true]) {
    const {c,net}=booking();c.state.checkIn='2026-10-27';const a=c.loadHotelRooms();
    c.state.checkIn='2026-10-28';c.state.partySize=4;const b=c.loadHotelRooms();
    await net.at(1);net.reply(1,{hotel:{categories:[{id:'new'}]}});await b;
    if(reject)net.pending[0].reject(new Error('offline'));else net.reply(0,{hotel:{categories:[{id:'old'}]}});
    await a;assert.equal(c.state.hotelRooms[0].id,'new');assert.ok(!c.state.error);
  }
});
await test('tickets#0 newest board read survives older success or failure',async()=>{
  for(const reject of [false,true]) {
    const src=read('assets/tickets.js'), net=requests();let renders=0;
    const c=vm.createContext({...net,API:'/api/tickets',state:{filters:{}},renderLoading:()=>{},render:()=>renders++,configureComposerClassification:()=>{},lists:{}});
    vm.runInContext(src.slice(src.indexOf('  async function loadTickets'),src.indexOf('  const draftController')),c);
    const a=c.loadTickets({quiet:true}), b=c.loadTickets();
    (await net.at(1)).resolve({ok:true,json:async()=>({taxonomy:{version:2,kinds:[],areas:[]},tickets:[{id:'new'}]})});await b;
    if(reject)(await net.at(0)).reject(new Error('offline'));else (await net.at(0)).resolve({ok:true,json:async()=>({taxonomy:{version:1,kinds:[],areas:[]},tickets:[{id:'old'}]})});
    await a;assert.equal(c.state.tickets[0].id,'new');assert.equal(c.state.taxonomy.version,2);assert.equal(renders,1);
  }
});
function floor() {
  let slug='a';const net=requests(),seen=[];
  const window={KiwiEnv:{isReal:()=>true},KiwiCloudDoc:{currentSlug:()=>slug},addEventListener(){}};
  vm.runInNewContext(read('assets/floorplan-live.js'),{window,document:{addEventListener(){},visibilityState:'visible'},fetch:net.fetch,setTimeout:()=>1,clearTimeout(){}});
  const api=window.KiwiFloorLive;api.watch(x=>seen.push(x));
  return {api,net,seen,switchTo:s=>{slug=s;}};
}
await test('tables#2 new watchers never receive the previous venue room',async()=>{
  const f=floor();(await f.net.at(0)).resolve({ok:true,json:async()=>({ok:true,tables:{private:{status:'occupied'}}})});await flush();
  f.switchTo('b');const seen=[];f.api.watch(x=>seen.push(x));
  assert.ok(seen.every(x=>!x.tables.private));assert.equal(f.api.last(),null);
});
await test('floor#0 failures cannot reuse or emit another venue snapshot',async()=>{
  const f=floor();(await f.net.at(0)).resolve({ok:true,json:async()=>({ok:true,tables:{private:{status:'occupied'}}})});await flush();
  f.api.refresh();f.switchTo('b');const count=f.seen.length;
  (await f.net.at(1)).reject(new Error('offline'));await flush();assert.equal(f.seen.length,count);
  f.api.refresh();(await f.net.at(2)).reject(new Error('offline'));await flush();
  assert.ok(!f.seen.at(-1).tables.private);assert.equal(f.seen.at(-1).live,false);
});
await test('same venue retains cached room and marks it stale offline',async()=>{
  const f=floor();(await f.net.at(0)).resolve({ok:true,json:async()=>({ok:true,tables:{local:{status:'occupied'}}})});await flush();
  const seen=[];f.api.watch(x=>seen.push(x));assert.equal(seen[0].tables.local.status,'occupied');
  f.api.refresh();(await f.net.at(1)).reject(new Error('offline'));await flush();
  assert.equal(f.api.last().stale,true);assert.equal(f.api.last().tables.local.status,'occupied');
});
if(failed)process.exitCode=1;
