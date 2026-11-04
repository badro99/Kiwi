import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=file=>fs.readFileSync('assets/booking-'+file+'.js','utf8').replace('export function ','function ').replace(/import\('\.\/request-deadline.mjs'\)/g,'loadDeadline()');
let mode='import-failure',fetches=0;const sent=[];
const state={lang:'fr',service:{id:'room',total:123},slot:100,partySize:2,checkIn:'2026-11-10',checkOut:'2026-11-12'};
const storage=new Map(),error={textContent:''},button={disabled:false};
const form={querySelector:selector=>selector==='[data-error]'?error:button};
const context={owner:{getState:()=>state},app:{querySelector:()=>({})},merchant:'test',party:()=>2,ssGet:k=>storage.get(k),ssSet:(k,v)=>storage.set(k,v),ssDel:k=>storage.delete(k),t:k=>k,ht:k=>k};
const sandbox={FormData:class{get(k){return {name:'Test',email:'test@example.com',note:'note'}[k]||''}},crypto:{randomUUID:()=>String(Math.random())},window:{},setTimeout,clearTimeout,
 fetch:async()=>{fetches++;return {ok:true,json:async()=>({})}},
 loadDeadline:async()=>{if(mode==='import-failure')throw Error('module-unavailable');return {deadlineFetch:async(u,o)=>{sent.push(JSON.parse(o.body));return {ok:false,json:async()=>({error:'request-timeout'})}}}}};
const create=vm.runInNewContext(read('submission')+';createBookingSubmission',sandbox),api=create(context);
for(const name of ['submit','submitHotel']){
 error.textContent='';await api[name]({preventDefault(){},currentTarget:form});
 assert.equal(error.textContent,'error');assert.equal(button.disabled,false);
}
assert.equal(fetches,0,'import failure must not fall back to a request');
mode='timeout';
for(const name of ['submit','submitHotel']){
 await api[name]({preventDefault(){},currentTarget:form});await api[name]({preventDefault(){},currentTarget:form});
 assert.equal(error.textContent,'timeout');assert.equal(button.disabled,false);
 assert.equal(sent.at(-1).ref,sent.at(-2).ref,'retry keeps its idempotency ref');
 assert.equal(sent.at(-1).customer.email,'test@example.com');
}
assert.equal(sent[2].expectedTotal,123,'hotel total passes through unchanged');
assert.deepEqual(sent.map(b=>b.lang),['fr','fr','fr','fr'],'service and hotel requests both carry the page language');
state.lang='ar';await api.submitHotel({preventDefault(){},currentTarget:form});assert.equal(sent.at(-1).lang,'ar','a language switch reaches the next request');state.lang='fr';
mode='import-failure';state.config={};
const hotel=vm.runInNewContext(read('hotel')+';createBookingHotel',sandbox)({...context,layout(){},head:()=>'',esc:String,fmt:()=>'',app:{querySelectorAll:()=>[]}});
await hotel.loadHotelRooms();assert.equal(state.error,'error');assert.equal(state.loading,false);assert.equal(fetches,0);
console.log('✓ service/hotel share retry-safe submission; failed imports never send, hotel search fails closed');
