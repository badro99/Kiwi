import assert from 'node:assert/strict';
import path from 'node:path';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { fixture } from './server-money-fixture.mjs';
import { closeVisit } from '../functions/api/order/_queue-payments.js';
import { settleCoveredOrders } from '../functions/api/_visit-cover.js';
import { creditsIssuedCents, refundsIssuedCents } from '../functions/api/_store-credit-ledger.js';
import { onRequestGet as credits } from '../functions/api/store-credits.js';
const f = await fixture(path.resolve('.'));
const tests = {
 async credit() {
  f.sql.exec('DROP TABLE store_credit_events');
  await assert.rejects(()=>creditsIssuedCents(f.env,f.merchant,'sale'),/store-credit-unavailable/);
  f.sql.exec('DROP TABLE sale_audit');
  await assert.rejects(()=>refundsIssuedCents(f.env,f.merchant,'sale'),/store-credit-unavailable/);
  f.sql.exec('DROP TABLE store_credits');
  const response=await credits({env:f.env,request:new Request('https://kiwi.test/api/store-credits?merchant='+f.merchant,{headers:{Cookie:SESS_COOKIE+'='+await makeSession('money-owner',f.env.AUTH_SECRET)}})});
  assert.equal(response.status,503);assert.equal((await response.json()).error,'store-credit-unavailable');
 }
};
let failed=0;
for(const [name,run] of Object.entries(tests)) {if(process.env.MONEY_CASE && process.env.MONEY_CASE!==name)continue;try{await run();console.log('✓ '+name);}catch(e){failed++;console.error('✗ '+name,e);}}
f.close();if(failed)process.exitCode=1;
