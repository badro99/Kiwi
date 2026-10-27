import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { world, load } from './retail-money-harness.cjs';
import sharedRules from './shared-rules-source.cjs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as loyalty from '../functions/api/_rules-loyalty.js';
import * as pricing from '../functions/api/_rules-promotion-pricing.js';
import { priceOrder } from '../functions/api/order/_lib.js';
import { sanitizeMenu } from '../functions/api/menu.js';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet as clientsGet, onRequestPost as clientsPost } from '../functions/api/clients.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'loyalty-truth-secret';
const MERCHANT = 'loyalty-truth-merchant';
let checks = 0;
const check = (ok, msg) => { checks += 1; assert.ok(ok, msg); console.log(`  ✓ ${msg}`); };

function facade(raw) {
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...v) { args = v.map((x) => x === undefined ? null : x); return st; },
        async first() { return raw.prepare(sql).get(...args) || null; },
        async all() { return { results: raw.prepare(sql).all(...args) }; },
        async run() { const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes || 0) } }; },
      };
      return st;
    },
    async batch(list) {
      raw.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const s of list) out.push(await s.run()); raw.exec('COMMIT'); return out; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}

const owner = sessionCookie(await makeSession('loyalty-owner', SECRET)).split(';')[0];

function store(cfg) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const now = Date.now();
  raw.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .run('loyalty-owner', 'loyalty@example.test', 'Owner', 'Store', 's', 'h', now);
  raw.prepare('INSERT INTO merchant_config (merchant,features,type,status,name,account_id,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(MERCHANT, '{}', 'restaurant', 'active', 'Store', 'loyalty-owner', now);
  if (cfg) raw.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(MERCHANT, 'fidelity', JSON.stringify(cfg), 1, now);
  raw.prepare('INSERT INTO clients (merchant,id,name,points,stamps,visits,spend,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'c1', 'Client', 0, 0, 0, 0, now, now);
  const env = { DB: facade(raw), AUTH_SECRET: SECRET };
  const post = async (body) => {
    const res = await clientsPost({ env, request: new Request('https://kiwi.test/api/clients', {
      method: 'POST', headers: { cookie: owner, 'content-type': 'application/json' },
      body: JSON.stringify({ merchant: MERCHANT, ...body }),
    }) });
    return { status: res.status, body: await res.json() };
  };
  const row = () => raw.prepare('SELECT points, stamps, visits, spend FROM clients WHERE merchant=? AND id=?').get(MERCHANT, 'c1');
  return { post, row, raw, env };
}


const fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check');
const source = process.env.KIWI_A2_OLD === '1'
  ? execFileSync('git', ['show', 'HEAD:assets/clients-store.js'], { encoding: 'utf8' })
  : fs.readFileSync('assets/clients-store.js', 'utf8');
function till(cfg, responder, savedBook) {
  const storage = new Map([['kiwiLive', '1'], ['kiwiLiveMerchant', MERCHANT]]), stores = {};
  const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)) };
  const define = (name, options) => stores[name] ||= {
    data: name === 'clients' && savedBook ? savedBook : options.blank?.(), get() { return this.data; }, set(v) { this.data = v; }, subscribe() {} };
  const window = { localStorage, KiwiStore: { define, currentVenue: () => MERCHANT },
    KiwiEnv: { isReal: () => true }, addEventListener() {} };
  vm.runInNewContext(source, { window, localStorage, KiwiStore: window.KiwiStore,
    console, setInterval() {}, fetch: responder || (async () => ({ ok: false })) });
  const api = window.KiwiClients;
  api.setConfig(cfg, MERCHANT);
  if (!api.get('c1',MERCHANT)) api.upsert({ name: 'Client' }, MERCHANT).id = 'c1';
  return { api, stores, storage };
}
const amountCfg = rate => ({ model: 'amount', amount: { perMad: rate, threshold: 100 } });
// Regression first: this assertion must fail against the old till implementation.
{
  const server = store(amountCfg(3)), { api } = till(amountCfg(3));
  const purchase = { clientId: 'c1', ref: 'p:historical', eventRef: 'historical', saleRef: 'historical', amount: 10 };
  await server.post({ purchase }); api.recordPurchase('c1', purchase, MERCHANT);
  server.raw.prepare("UPDATE store_docs SET data=? WHERE feature='fidelity'").run(JSON.stringify(amountCfg(1)));
  api.setConfig(amountCfg(1), MERCHANT);
  for (let i = 1; i <= 3; i++) {
    const refund = { clientId: 'c1', ref: 'refund:c1:r'+i, eventRef: 'r'+i, saleRef: 'historical', amount: i === 3 ? 20 : 3.33 };
    const result = await server.post({ refund }); assert.equal(result.status, 200);
    api.recordRefund('c1', refund, MERCHANT);
    assert.equal(api.get('c1', MERCHANT).points, Number(server.row().points), 'historical rate and capped cumulative prorata');
    assert.equal(api.get('c1', MERCHANT).spend, Number(server.row().spend));
  }
  server.raw.close();
}
// Acknowledgement and reload must retain the server's actual earning, never today's estimate.
{
  const s = store(amountCfg(3));
  const {api,storage,stores} = till(amountCfg(1), async (_url,opts) => {
    const body = JSON.parse(opts?.body || '{}');
    if (!body.purchase && !body.refund) return {ok:false};
    const result = await s.post(body);
    return {ok:result.status===200,status:result.status,json:async()=>result.body};
  });
  api.recordPurchase('c1',{amount:10,saleRef:'ack',eventRef:'ack'},MERCHANT);
  for (let i=0;i<10;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.parse(storage.get('kiwi:clients-purchases:v1:'+MERCHANT)).length,0);
  assert.equal(api.get('c1',MERCHANT).points,30);
  assert.equal(api.get('c1',MERCHANT).loyaltySales.ack.earned,30);
  const restored = till(amountCfg(1),undefined,JSON.parse(JSON.stringify(stores.clients.data))).api;
  restored.recordRefund('c1',{amount:3.33,saleRef:'ack',eventRef:'ack-refund'},MERCHANT);
  assert.equal(restored.get('c1',MERCHANT).points,20,'historical earning survives reload');
  api.recordRefund('c1',{amount:3.33,saleRef:'ack',eventRef:'ack-refund'},MERCHANT);
  assert.equal(api.get('c1',MERCHANT).points,20);
  for (let i=0;i<10;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.get('c1',MERCHANT).points,Number(s.row().points));
  s.raw.close();
}
// The same earning/matching/refund inputs go through the public till and real SQLite route.
const server = store(amountCfg(1));
await fc.assert(fc.asyncProperty(fc.integer({min:1,max:100000}), fc.integer({min:1,max:8}),
  fc.constantFrom('amount','product','visit'), fc.integer({min:0,max:100}), async (cents, rate, model, percent) => {
    const cfg = { ...amountCfg(rate), model, product: { item: 'Café', target: 10 }, visit: { target: 10 } };
    server.raw.exec('DELETE FROM client_purchase_events; DELETE FROM employee_loyalty_events; UPDATE clients SET points=0,stamps=0,visits=0,spend=0;');
    server.raw.prepare("UPDATE store_docs SET data=? WHERE feature='fidelity'").run(JSON.stringify(cfg));
    const { api } = till(cfg), items = [{ name: 'CAFE crème', qty: 3 }, { name: 'Décaféiné', qty: 8 }];
    const purchase = { clientId: 'c1', ref: 'p:case', eventRef: 'case', saleRef: 'case', amount: cents/100, items };
    assert.equal((await server.post({ purchase })).status, 200);
    api.recordPurchase('c1', purchase, MERCHANT);
    for (const key of ['points','stamps','visits','spend']) assert.equal(Math.round(api.get('c1', MERCHANT)[key]*100), Math.round(Number(server.row()[key])*100));
    const refund = { clientId: 'c1', ref: 'refund:c1:case', eventRef: 'case', saleRef: 'case', amount: Math.max(.01,Math.round(cents*percent/100)/100), items: [{ name:'Café noir', qty:1 }] };
    assert.equal((await server.post({ refund })).status, 200);
    api.recordRefund('c1', refund, MERCHANT);
    for (const key of ['points','stamps','visits','spend']) assert.equal(Math.round(api.get('c1', MERCHANT)[key]*100), Math.round(Number(server.row()[key])*100));
  }), { numRuns: 100, seed: 20261026 });
// The GET snapshot supplies historical earnings even after the pending queue is empty.
{
  const response = await clientsGet({ env: server.env, request: new Request('https://kiwi.test/api/clients?merchant='+MERCHANT, { headers: {cookie:owner} }) });
  assert.equal(response.status,200);
  const body = await response.json();
  const ledger = body.clients[0].loyalty_sales.case;
  assert.ok(ledger && ledger.paid > 0);
  assert.equal(Number(ledger.earned) - Number(ledger.clawed), Number(server.row().points));
}
server.raw.close();
// Exercise the public restaurant till resolver against the actual server pricing route.
const menuContext = vm.createContext({ KiwiZoneLaw: globalThis.KiwiZoneLaw });
vm.runInContext(fs.readFileSync('assets/promo-rules.js','utf8') + '\n' + fs.readFileSync('assets/menu-promos.js','utf8'), menuContext);
await fc.assert(fc.asyncProperty(fc.integer({min:1,max:100000}), fc.integer({min:1,max:100}), fc.integer({min:0,max:23}), async (cents,pct,hour) => {
  const now = Date.UTC(2026,9,26,hour);
  const menu = sanitizeMenu({cats:[{id:'c',name:'Cat'}],items:[{id:'i',name:'Item',price:cents/100,catId:'c'}],
    promos:[{id:'p',name:'Promo',kind:'percent',value:pct,all:true,days:[1],start:'17:00',end:'20:00'},
      {id:'p2',name:'Other',kind:'amount',value:1,all:true}]});
  const data = JSON.stringify(menu);
  const env = {DB:{prepare:()=>({bind:()=>({first:async()=>({data,updated_ts:1})})})}};
  const result = await priceOrder(env,'m',[{id:'i',qty:2}],{now});
  const hit = menuContext.KiwiMenuPromos.resolve(menu.promos,{itemId:'i',catId:'c'},cents/100,now);
  assert.equal(result.lines[0].unitPrice,hit ? hit.price : cents/100);
  assert.equal(JSON.stringify(result.lines[0].promo || null),JSON.stringify(hit?.promo || null));
}), {numRuns:100,seed:20261026});
if (process.env.KIWI_A2_OLD_PROMO === '1') {
  const old = execFileSync('git',['show','HEAD:assets/pos-boutique.js'],{encoding:'utf8'});
  assert.match(old,/GENERATED SHARED KiwiPromotionPricing BEGIN/, 'promotion pricing must have one owner');
}
// VM-executed generated copies and server exports see identical property inputs.
const targets = ['assets/clients-store.js','assets/pos-boutique.js','assets/librairie-loyalty.js','assets/menu-promos.js','assets/promo-rules.js','assets/promos.js'];
for (const file of targets) {
  const ctx = vm.createContext({}); vm.runInContext(sharedRules(fs.readFileSync(file,'utf8')), ctx);
  await fc.assert(fc.property(fc.integer({min:0,max:1000000}), fc.integer({min:0,max:100}), (cents,pct) => {
    if (ctx.KiwiLoyaltyRules) {
      const reward = {clientId:'c',kind:'percent',value:pct};
      for (const policy of ['boutique','librairie']) assert.equal(ctx.KiwiLoyaltyRules.rewardDiscount(reward,'c',cents/100,[],policy), loyalty.rewardDiscount(reward,'c',cents/100,[],policy));
    }
    if (ctx.KiwiPromotionPricing) {
      for (const kind of ['percent','amount','fixed']) {
        const p = {kind,value:pct};
        assert.equal(ctx.KiwiPromotionPricing.price(p,cents/100),pricing.price(p,cents/100));
      }
      const ln = {remise:pct,promo:{price:cents/200}};
      const deal = ctx.KiwiPromotionPricing.lineDeal(ln,cents/100,null);
      assert.equal(ctx.KiwiPromotionPricing.lineUnit(deal.price,pct), pricing.lineUnit(pricing.lineDeal(ln,cents/100,null).price,pct));
      const p = {id:'p',name:'Promo',kind:'percent',value:pct,all:true,items:[],cats:[],days:[1],start:'23:00',end:'02:00'};
      for (const min of [60,120,1380]) for (const kind of ['item','formula','formula-part']) {
        const moment = {date:'2026-10-26',weekday:1,min};
        assert.equal(JSON.stringify(ctx.KiwiPromotionPricing.resolveMenu([p],{kind},cents/100,moment)),JSON.stringify(pricing.resolveMenu([p],{kind},cents/100,moment)));
      }
    }
  }), {numRuns:300,seed:20261026});
}
console.log('✓ A2 parity: historical refunds, matching/earning, snapshot ledger, reward policies and promotion eligibility/rounding/stacking');
