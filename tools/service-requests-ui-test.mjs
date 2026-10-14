#!/usr/bin/env node
/* Demandes de service (addition, appel serveur) · la vraie interface partagée.
 * Ported from Playwright (never a dependency here, so this suite could not run)
 * to puppeteer-core, which the rest of tools/ already uses. Same scenarios.
 * 2026-10-12. */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the service request UI');
const source = fs.readFileSync(path.join(root, 'assets/service-requests.js'), 'utf8');
const FIXTURE = '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Service request QA</title><body style="margin:0;background:#f2f5ef;font:16px system-ui"><main style="padding:32px"><h1>Kiwi · Service</h1><p>Test local · caisse et équipe</p></main></body></html>';
const browser = await puppeteer.launch({headless:true, executablePath:bin, args:['--no-sandbox']});
const context = await browser.createBrowserContext();
const errors=[];
const data={ok:true,rev:1,requests:[
  {id:'bill-1',table:'7',action:'ask-bill',ts:Date.now()},
  {id:'call-1',table:'12',action:'call-server',ts:Date.now()},
]};
let rejectAck=false;
const reply = (req, status, body) => req.respond({status, contentType:'application/json', body:JSON.stringify(body)});
async function pageFor() {
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  /* Playwright dismissed native dialogs on its own; an alert() would block here. Any dialog is a failure. */
  page.on('dialog',d=>{errors.push('dialog: '+d.message());d.dismiss().catch(()=>{});});
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u === 'https://kiwi.test/fixture') return req.respond({status:200, contentType:'text/html; charset=utf-8', body:FIXTURE});
    if (u === 'https://kiwi.test/api/service/events') {
      if (req.method() !== 'POST') return reply(req, 200, data);
      const body = JSON.parse(req.postData() || '{}');
      if (rejectAck) return reply(req, 503, {error:'offline'});
      data.requests=data.requests.filter(r=>r.id!==body.ackRequest);data.rev++;
      return reply(req, 200, {ok:true,rev:data.rev});
    }
    return req.abort();
  });
  await page.goto('https://kiwi.test/fixture');await page.addScriptTag({content:source});return page;
}
async function ingest(page,snapshot=data) {
  await page.evaluate(snapshot=>{window.alerts=window.alerts||[];KiwiServiceRequests.ingest(snapshot,{merchant:'fixture',notify:message=>alerts.push(message),openTable:table=>window.openedTable=table});},snapshot);
}
const count = (page, sel) => page.$$eval(sel, (n) => n.length);
const isHidden = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return true; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return e.hidden || s.display === 'none' || s.visibility === 'hidden' || (r.width === 0 && r.height === 0); }, sel);
const dialogOpen = (page) => page.$eval('#ksr-dialog', (el) => el.open);
/* Two pages share one browser: Chrome runs no animation frame for the tab
 * behind, and a click waits on one. Each device is brought forward before it
 * is used, as a person would pick it up. */
const use = async (page) => { await page.bringToFront(); return page; };
try {
  const cashier=await pageFor(),waiter=await pageFor();
  await ingest(cashier);await ingest(waiter);
  assert.equal(await cashier.$eval('#ksr-chip strong', (e) => e.textContent),'2');
  await ingest(cashier);assert.equal(await cashier.evaluate(()=>alerts.length),1,'Polling must not repeat alerts');
  await use(cashier);
  for(const [name,width,height] of [['desktop',1440,900],['tablet',834,1112],['phone',390,844]]){
    await cashier.setViewport({width,height});await cashier.click('#ksr-chip');
    assert.equal(await dialogOpen(cashier),true);
    const geometry=await (await cashier.$('#ksr-dialog')).boundingBox();
    assert.ok(geometry.x>=0&&geometry.x+geometry.width<=width&&geometry.y>=0&&geometry.y+geometry.height<=height);
    for(const box of await cashier.$$eval('#ksr-dialog button', nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height})))) assert.ok(box.height>=44);
    for(let i=0;i<9;i++){await cashier.keyboard.press('Tab');assert.ok(await cashier.evaluate(()=>document.querySelector('#ksr-dialog').contains(document.activeElement)));}
    if(process.env.KIWI_TEST_ARTIFACT_DIR)await cashier.screenshot({path:path.join(process.env.KIWI_TEST_ARTIFACT_DIR,'requests-'+name+'.png')});
    await cashier.keyboard.press('Escape');assert.equal(await dialogOpen(cashier),false);
  }
  await cashier.click('#ksr-chip');
  rejectAck=true;await cashier.click('[data-done="bill-1"]');
  await cashier.waitForFunction(() => (document.querySelector('#ksr-notice')?.textContent || '').includes('Non enregistré'), {timeout:5000});
  assert.equal(await count(cashier,'#ksr-list article'),2,'Failed acknowledgement keeps request visible');
  rejectAck=false;await cashier.click('[data-done="bill-1"]');
  await cashier.waitForFunction(() => !document.querySelector('[data-done="bill-1"]'), {timeout:5000});
  await use(waiter);await ingest(waiter);await waiter.click('#ksr-chip');
  assert.equal(await count(waiter,'#ksr-list article'),1,'Caisse handling clears the waiter inbox');
  await use(cashier);await ingest(cashier,{ok:true,rev:1,requests:[{id:'bill-1',table:'7',action:'ask-bill'}]});
  assert.equal(await count(cashier,'[data-done="bill-1"]'),0,'Old in-flight poll cannot resurrect handled request');
  await use(waiter);await waiter.click('[data-done="call-1"]');await waiter.waitForFunction(() => { const e = document.querySelector('#ksr-chip'); return !e || e.hidden || getComputedStyle(e).display === 'none'; }, {timeout:5000});
  await use(cashier);await ingest(cashier);assert.ok(await isHidden(cashier,'#ksr-chip'));
  await ingest(cashier,{ok:true,rev:10,requests:[{id:'unsafe',table:'<img src=x onerror=alert(1)>',action:'ask-bill',ts:Date.now()}]});
  assert.equal(await count(cashier,'#ksr-list img'),0,'Table labels are escaped');
  await cashier.evaluate(()=>KiwiServiceRequests.reset());assert.ok(await isHidden(cashier,'#ksr-chip'));
  assert.equal(await dialogOpen(cashier),false);
  assert.deepEqual(errors,[]);
  console.log('✓ Shared request UI: desktop/tablet/phone, 44px targets, keyboard modal, dedup, failed acknowledgement, cross-device handling, stale polls, escaping, reset');
} finally {await browser.close();}
