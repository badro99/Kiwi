#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.KIWI_PLAYWRIGHT_PATH || 'playwright');
const source = fs.readFileSync(new URL('../assets/service-requests.js',import.meta.url),'utf8');
const browser = await chromium.launch({headless:true, executablePath:process.env.KIWI_CHROME_PATH || undefined});
const context = await browser.newContext();
const errors=[];
const data={ok:true,rev:1,requests:[
  {id:'bill-1',table:'7',action:'ask-bill',ts:Date.now()},
  {id:'call-1',table:'12',action:'call-server',ts:Date.now()},
]};
let rejectAck=false;
await context.route('https://kiwi.test/api/service/events',async route=>{
  const body=route.request().postDataJSON();
  if(rejectAck) return route.fulfill({status:503,json:{error:'offline'}});
  data.requests=data.requests.filter(r=>r.id!==body.ackRequest);data.rev++;
  await route.fulfill({json:{ok:true,rev:data.rev}});
});
async function pageFor() {
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.route('https://kiwi.test/fixture',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Service request QA</title><body style="margin:0;background:#f2f5ef;font:16px system-ui"><main style="padding:32px"><h1>Kiwi · Service</h1><p>Test local · caisse et équipe</p></main></body></html>'}));
  await page.goto('https://kiwi.test/fixture');await page.addScriptTag({content:source});return page;
}
async function ingest(page,snapshot=data) {
  await page.evaluate(snapshot=>{window.alerts=window.alerts||[];KiwiServiceRequests.ingest(snapshot,{merchant:'fixture',notify:message=>alerts.push(message),openTable:table=>window.openedTable=table});},snapshot);
}
try {
  const cashier=await pageFor(),waiter=await pageFor();
  await ingest(cashier);await ingest(waiter);
  assert.equal(await cashier.locator('#ksr-chip strong').textContent(),'2');
  await ingest(cashier);assert.equal(await cashier.evaluate(()=>alerts.length),1,'Polling must not repeat alerts');
  for(const [name,width,height] of [['desktop',1440,900],['tablet',834,1112],['phone',390,844]]){
    await cashier.setViewportSize({width,height});await cashier.locator('#ksr-chip').click();
    assert.equal(await cashier.locator('#ksr-dialog').evaluate(el=>el.open),true);
    const geometry=await cashier.locator('#ksr-dialog').boundingBox();
    assert.ok(geometry.x>=0&&geometry.x+geometry.width<=width&&geometry.y>=0&&geometry.y+geometry.height<=height);
    for(const box of await cashier.locator('#ksr-dialog button').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height})))) assert.ok(box.height>=44);
    for(let i=0;i<9;i++){await cashier.keyboard.press('Tab');assert.ok(await cashier.evaluate(()=>document.querySelector('#ksr-dialog').contains(document.activeElement)));}
    if(process.env.KIWI_TEST_ARTIFACT_DIR)await cashier.screenshot({path:path.join(process.env.KIWI_TEST_ARTIFACT_DIR,'requests-'+name+'.png')});
    await cashier.keyboard.press('Escape');assert.equal(await cashier.locator('#ksr-dialog').evaluate(el=>el.open),false);
  }
  await cashier.locator('#ksr-chip').click();
  rejectAck=true;await cashier.locator('[data-done="bill-1"]').click();
  await cashier.locator('#ksr-notice').filter({hasText:'Non enregistré'}).waitFor();
  assert.equal(await cashier.locator('#ksr-list article').count(),2,'Failed acknowledgement keeps request visible');
  rejectAck=false;await cashier.locator('[data-done="bill-1"]').click();
  await cashier.locator('[data-done="bill-1"]').waitFor({state:'detached'});
  await ingest(waiter);await waiter.locator('#ksr-chip').click();
  assert.equal(await waiter.locator('#ksr-list article').count(),1,'Caisse handling clears the waiter inbox');
  await ingest(cashier,{ok:true,rev:1,requests:[{id:'bill-1',table:'7',action:'ask-bill'}]});
  assert.equal(await cashier.locator('[data-done="bill-1"]').count(),0,'Old in-flight poll cannot resurrect handled request');
  await waiter.locator('[data-done="call-1"]').click();await waiter.locator('#ksr-chip').waitFor({state:'hidden'});
  await ingest(cashier);assert.ok(await cashier.locator('#ksr-chip').isHidden());
  await ingest(cashier,{ok:true,rev:10,requests:[{id:'unsafe',table:'<img src=x onerror=alert(1)>',action:'ask-bill',ts:Date.now()}]});
  assert.equal(await cashier.locator('#ksr-list img').count(),0,'Table labels are escaped');
  await cashier.evaluate(()=>KiwiServiceRequests.reset());assert.ok(await cashier.locator('#ksr-chip').isHidden());
  assert.equal(await cashier.locator('#ksr-dialog').evaluate(el=>el.open),false);
  assert.deepEqual(errors,[]);
  console.log('✓ Shared request UI: desktop/tablet/phone, 44px targets, keyboard modal, dedup, failed acknowledgement, cross-device handling, stale polls, escaping, reset');
} finally {await browser.close();}
