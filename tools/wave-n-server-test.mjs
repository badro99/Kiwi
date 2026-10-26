import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import * as triage from '../functions/api/_support-triage.js';
import * as replay from '../functions/api/shopify/_replay-orders.js';
const { planReplay, writeUnresolved } = replay;
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const cases = {
 async lease() {
  assert.equal(typeof triage.claimAlert, 'function');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE support_tickets(id TEXT, triage_alert TEXT)');
  db.prepare('INSERT INTO support_tickets VALUES (?,?)').run('ticket', JSON.stringify({state:'unconfirmed',ts:1}));
  const env={DB:{prepare(sql){return {bind(...args){return {async run(){return {meta:db.prepare(sql).run(...args)}}}}}}}};
  assert.equal(await triage.claimAlert(env,'ticket',120002),true);
  assert.equal(await triage.claimAlert(env,'ticket',120003),false);
  db.prepare('UPDATE support_tickets SET triage_alert=?').run(JSON.stringify({state:'sent',ts:1}));
  assert.equal(await triage.claimAlert(env,'ticket',999999),false);
  db.close();
 },
 async image() {
  const notes=[];
  const env={AI:{},DB:{prepare(sql){return {bind(...args){notes.push({sql,args});return {async run(){}}}}}}};
  const r=await triage.triageAfterImage(env,{id:'ticket'},'image/png',new ArrayBuffer(5*1024*1024));
  assert.equal(r.reason,'image-too-large');
  assert.ok(notes.some(n=>n.sql.includes('support_messages')&&n.args.some(a=>typeof a==='string'&&a.includes('4 Mio'))));
 },
 async replay() {
  const p=planReplay({variants:[],moves:[]},new Map(),[{id:'order',createdAt:'2026-01-01',lineItems:{nodes:[{id:'line',currentQuantity:1,variant:{id:'missing'}}]}}]);
  assert.deepEqual(p.exceptions,[{orderId:'order',lineId:'line',code:'shopify-unmapped-line'}]);
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE store_docs(merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY(merchant,feature))');
  const env={DB:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)},async run(){return db.prepare(sql).run(...args)}}}}}}};
  const entries=Array.from({length:75},(_,i)=>({orderId:'order-'+i,code:'shopify-order-too-many-lines'}));
  await writeUnresolved(env,'merchant',[],entries);
  await writeUnresolved(env,'merchant',[],p.exceptions);
  let saved=()=>JSON.parse(db.prepare('SELECT data FROM store_docs WHERE merchant=?').get('merchant').data);
  assert.equal(saved().length,76);
  await writeUnresolved(env,'merchant',[{id:'order-0'}],[]);
  assert.equal(saved().length,75);
  assert.ok(saved().some(e=>e.lineId==='line'));
  db.close();
  const s=read('functions/api/shopify/_replay-orders.js');
  assert.ok(s.includes('shopify-replay-unresolved'));
  assert.ok(s.includes('await writeUnresolved'));
 },
 async health() {
  const s=read('assets/admin-workspace.js');
  const fn=s.slice(s.indexOf('  function allSignals(){'),s.indexOf('  function queue('));
  const now=Date.now(), merchant='merchant';
  for (const [reports,expected] of [[[],true],[[{updated_ts:now-86400001,sync:{},stock:{}}],true],[[{updated_ts:now,sync:{}}],true],[[{updated_ts:now,sync:{},stock:{}}],false]]) {
   const c={merchant};
   const context={P:{signals:()=>[]},state:{clients:[c],data:{now}},client:()=>c,rows:k=>k==='caisseSync'?reports.map(r=>({...r,merchant,app:'caisse',deviceId:'device'})):[],Date,Set};
   const signals=vm.runInNewContext(fn+';allSignals()',context);
   assert.equal(signals.some(s=>s.signal_key==='unobserved:queues'),expected,JSON.stringify(reports));
  }
 },
 async sizes() {
  const base=JSON.parse(read('tools/file-size-baseline.json'));
  for(const p of ['assets/boutique-catalog-parts.js','assets/caisse-floor.js','assets/caisse-kitchen.js']) assert.equal(typeof base.lines[p],'number',p);
 },
 async schema() {
  const s=read('functions/api/foodcost.js');
  assert.ok(!s.includes('Tables créées à la première utilisation'));
  assert.ok(s.includes('wrangler d1 migrations'));
 }
};
for(const [name,run] of Object.entries(cases)) if(!process.env.KIWI_WAVE_CASE||process.env.KIWI_WAVE_CASE===name){await run();console.log('✓ wave-n '+name);}
