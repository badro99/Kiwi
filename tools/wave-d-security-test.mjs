import assert from 'node:assert/strict';
import path from 'node:path';
import { fixture } from './server-money-fixture.mjs';
import { creditRefundEdit } from '../functions/api/_credit-book-refund.js';
import { refuseReward, mayRecordReward } from '../functions/api/_client-audit.js';
import { makeSession, tillToken, operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import { onRequestPost as clientsPost } from '../functions/api/clients.js';
const f = await fixture(path.resolve(import.meta.dirname, '..'));
let failed = 0;
async function test(name, fn) { try { await fn(); console.log('✓ '+name); } catch(e) { failed++; console.error('✗ '+name+': '+e.message); } }
const doc = hist => ({verticals:{epicerie:{data:{carnet:[{id:'client',hist}]}}}});
await test('advance balance cannot be reduced by an innocently labelled debt', () => {
 const h = [{id:'pay',type:'pay',amt:100,label:'Advance'}];
 assert.equal(creditRefundEdit(doc(h),doc([...h,{id:'debt',type:'debt',amt:1,label:'Groceries'}])),true);
 assert.equal(creditRefundEdit(doc([{id:'d',type:'debt',amt:100}]),doc([{id:'d',type:'debt',amt:100},{id:'p',type:'pay',amt:10}])),false);
});
await test('all persisted credit entries remain byte-identical', () => {
 const h = {id:'d',type:'debt',amt:100,label:'Original',at:'yesterday'};
 assert.equal(creditRefundEdit(doc([h]),doc([{...h,label:'Changed'}])),true);
});
await test('partial deposit refund preserves delivery due and requires owner review', async () => {
 f.insert('deposit',10000,{method:'split',parts:[{method:'cash',amountCents:10000},{method:'delivery',amountCents:20000}]});
 assert.equal((await f.refund('partial-refund','deposit',5000)).status,200);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM sale_audit WHERE action='delivery-writeoff'").get().n,0);
 const r = await f.call('receivables',{},'owner');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM sale_audit WHERE action='delivery-review'").get().n,1);
 assert.equal(r.body.open[0].dueCents,20000); assert.equal(r.body.open[0].needsReview,true);
 assert.equal((await f.call('collect',{action:'writeoff',saleId:'deposit'},'till')).status,403);
 assert.equal((await f.call('collect',{action:'writeoff',saleId:'deposit'},'operator')).status,403);
 assert.equal((await f.call('collect',{action:'writeoff',saleId:'deposit'},'owner')).status,200);
 assert.equal((await f.call('collect',{action:'writeoff',saleId:'deposit'},'owner')).status,200);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM sale_audit WHERE action='delivery-writeoff'").get().n,1);
 assert.equal(f.net(),5000);
});
await test('full deposit return automatically writes off delivery separately', async () => {
 await f.reset(); f.insert('full-deposit',10000,{method:'split',parts:[{method:'cash',amountCents:10000},{method:'delivery',amountCents:20000}]});
 assert.equal((await f.refund('full-refund','full-deposit',10000)).status,200);
 assert.equal(f.sql.prepare("SELECT amount_cents FROM sale_audit WHERE action='delivery-writeoff'").get().amount_cents,20000);
});
await test('refusals require existing tenant client, bounded ref and fixed errors', async () => {
 for(const [client,ref,error] of [['missing','abc','reward-not-ready'],['client-fixture','bad ref','reward-not-ready'],['client-fixture','x'.repeat(97),'reward-not-ready'],['client-fixture','abc','arbitrary']]) await refuseReward(f.env,f.merchant,client,ref,error);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM client_reward_refusals').get().n,0);
});
await test('refusal key includes client and daily merchant budget is atomic', async () => {
 f.sql.exec('DELETE FROM client_reward_refusals');
 f.sql.prepare("INSERT INTO clients(merchant,id,name) VALUES(?,'other-client','Other')").run(f.merchant);
 await refuseReward(f.env,f.merchant,'client-fixture','same','reward-not-ready');
 await refuseReward(f.env,f.merchant,'other-client','same','reward-not-ready');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM client_reward_refusals').get().n,2);
 for(let i=0;i<510;i++) await refuseReward(f.env,f.merchant,'client-fixture','ref:'+i,'reward-not-ready');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM client_reward_refusals').get().n,500);
});
await test('reward refusals only accept owner or paired merchant till', async () => {
 const secret=f.env.AUTH_SECRET;
 const cookies = [
  ['kiwi_sess='+await makeSession('money-owner',secret),true],
  ['kiwi_till='+await tillToken(secret,f.merchant),true],
  ['kiwi_till='+await tillToken(secret,'server-other-shop'),false],
  ['kiwi_op='+await operatorToken(secret)+'; kiwi_op_id='+await operatorIdToken(secret,'money-operator'),false],
  ['',false],
 ];
 for(const [cookie,allowed] of cookies) {
  const request=new Request('https://kiwi.test/api/clients',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({merchant:f.merchant,redemption:{clientId:'client-fixture',ref:'auth-ref'}})});
  assert.equal(await mayRecordReward(request,f.env,f.merchant),allowed);
  const response=await clientsPost({request,env:f.env});
  assert.equal(response.status < 400 || response.status===409,allowed);
 }
});
f.close(); if(failed) process.exitCode=1;
