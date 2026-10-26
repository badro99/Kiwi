import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync('assets/trade-workspaces.js', 'utf8');
let calls = [], pulls = 0;
const client = { id: 'advance-client', hist: [{type:'pay',amt:20},{type:'debt',amt:7.5}] };
const window = {
  addEventListener(){}, KiwiEnv:{isReal:()=>true},
  KiwiIdentity:{state:{authenticated:true, stores:[{merchant:'test-shop'}]}} ,
  KiwiVenue:{getVenue:()=> 'test-shop',getCurrentVenueData:()=>({id:'test-shop',type:'epicerie'})},
  KiwiVerticalState:{store:{get:()=>({verticals:{epicerie:{data:{carnet:[client]}}}})}},
  KiwiCloudDoc:{currentSlug:()=> 'test-shop',pullAll:async()=>{pulls++;}},
};
const context = vm.createContext({window,document:{addEventListener(){}},console,Date,Math,JSON,Set,Map,URLSearchParams,
  fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})};}});
vm.runInContext(src,context);
const api=window.KiwiTradeWorkspaces;
assert.equal(typeof api.refundAdvance,'function','owner refund action exists');
assert.equal(api.refundAvailable(client),1250,'remaining refundable cents account for consumed advance');
assert.equal(api.refundAllowed(),true,'merchant owner is allowed');
await assert.rejects(api.refundAdvance(client.id,1251,'refund-test'),/refund-exceeds-advance/);
assert.equal(calls.length,0,'over-cap refusal happens before network');
window.KiwiIdentity.state.operator=true;
await assert.rejects(api.refundAdvance(client.id,1250,'refund-test'),/owner-required/);
assert.equal(calls.length,0,'operator cannot send refund');
delete window.KiwiIdentity.state.operator;
window.KiwiIdentity.state.stores=[];
await assert.rejects(api.refundAdvance(client.id,1250,'refund-test'),/owner-required/);
window.KiwiIdentity.state.stores=[{merchant:'test-shop'}];
await api.refundAdvance(client.id,1250,'refund-test');
assert.deepEqual(calls[0],{merchant:'test-shop',feature:'verticalops',action:'credit-book-refund',clientId:client.id,id:'refund-test',amountCents:1250,method:'transfer'});
assert.equal(pulls,1,'success refreshes authoritative ledger without fabricating local entries');
context.fetch=async()=>({ok:false,json:async()=>({error:'refund-exceeds-advance',availableCents:250})});
await assert.rejects(api.refundAdvance(client.id,500,'refund-race'),e=>e.message==='refund-exceeds-advance'&&e.availableCents===250);
assert.equal(pulls,2,'server refusal also refreshes the current advance');
console.log('credit-book-refund-ui · owner, cap, request, refresh and concurrent cap: PASS');
