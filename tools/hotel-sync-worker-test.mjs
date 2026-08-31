#!/usr/bin/env node
import assert from 'node:assert/strict';
import worker,{run} from './hotel-sync-worker/src/index.js';
let controls=0;const ok=(v,l)=>{assert.ok(v,l);controls++;console.log('  ✓ '+l)};
let seen;
const env={HOTEL_CRON_SECRET:'test-cron-secret',KIWI_BASE_URL:'https://kiwi.test/',HOTEL_CRON_FETCH:async(url,init)=>{seen={url,init};return Response.json({ok:true,sync:{processed:3,failed:0},cleanup:{processed:2,deleted:1}})}};
const result=await run(env);
ok(result.sync.processed===3&&result.cleanup.deleted===1&&seen.url==='https://kiwi.test/api/hotel/cron','scheduled worker runs channel sync and scoped media cleanup through one bounded route');
ok(seen.init.headers.Authorization==='Bearer test-cron-secret'&&JSON.parse(seen.init.body).action==='maintenance','invocation carries a dedicated bearer secret and explicit maintenance action');
const health=await worker.fetch(new Request('https://worker.test/health'));
ok(health.status===200&&(await health.json()).scheduled==='every 15 minutes','worker exposes read-only scheduling health');
console.log(`hotel-sync-worker-test: ${controls} controls passed`);
