#!/usr/bin/env node
// Local SQLite D1, shipped handlers, and a closed Shopify transport simulator.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {fixture} from './server-money-fixture.mjs';
import {onRequestPost as webhook} from '../functions/api/channel/shopify/[link].js';
import {replayShopifyOrders, planReplay} from '../functions/api/shopify/_replay-orders.js';
import {encryptToken, enqueueStockChanges, flushShopifyOutbox} from '../functions/api/shopify/_lib.js';
const ROOT=new URL('../',import.meta.url).pathname;
let fc;try{fc=createRequire(ROOT+'app/package.json')('fast-check');}catch{console.log('○ skip fast-check unavailable; Shopify properties not executed');process.exit(0);}
const RUNS=+process.env.KIWI_PROPERTY_RUNS||100, SEED=+process.env.KIWI_PROPERTY_SEED||20261022;
let passed=0,failed=0,known=0;
const selected=name=>!process.env.KIWI_PROPERTY_ONLY||new RegExp(process.env.KIWI_PROPERTY_ONLY).test(name);
async function strict(name,p,examples=[]){if(!selected(name))return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(r.failed){failed++;console.error('✗ '+name,fc.stringify(r.counterexample),r.errorInstance,'seed='+r.seed+' path='+r.counterexamplePath);}else{passed++;console.log('✓ '+name);}}
async function knownIssue(id,name,p,examples=[]){if(!selected(name))return;const r=await fc.check(p,{numRuns:RUNS,seed:SEED,examples});if(!r.failed){failed++;console.error('✗ promote '+id+' to strict');}else if(r.errorInstance?.message!=='Property failed by returning false'){failed++;console.error('✗ unexpected '+id,r.errorInstance);}else{known++;console.log('◦ '+id+' '+name+'; shrunk='+fc.stringify(r.counterexample)+' seed='+r.seed+' path='+r.counterexamplePath);}}
const f=await fixture(ROOT),merchant=f.merchant,other='server-other-shop',T=1700000000000;
const secret='fake-shopify-property-signature',gid=(type,id)=>`gid://shopify/${type}/${id}`;
f.env.SHOPIFY_CLIENT_SECRET=secret;f.env.SHOPIFY_TOKEN_KEY='fake-property-encryption-key-at-least-24';
const token=await encryptToken('fake-local-token',f.env.SHOPIFY_TOKEN_KEY);
// D1 methods always return promises. Keep real SQLite SQL/CAS semantics.
let gate=null;
f.env.DB={prepare(q){const s=f.DB.prepare(q);const wrap={bind(...a){s.bind(...a);return wrap;},async run(){return s.run();},async all(){return s.all();},async first(){const row=s.first();if(gate&&q==='SELECT data, rev FROM catalogs WHERE merchant = ?'){const g=gate;g.rows++;if(g.rows===2){gate=null;g.release();}await g.ready;}return row;}};return wrap;},batch:ss=>f.DB.batch(ss)};
let orders=[],calls=[],provider=new Map(),lose=false,gone=false;
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{
 assert.match(String(url),/^https:\/\/properties\.myshopify\.com\/admin\/api\//);
 const body=JSON.parse(opts.body);
 if(body.query.includes('KiwiMissedOrders'))return Response.json({data:{orders:{nodes:orders,pageInfo:{hasNextPage:false}}}});
 assert.ok(body.query.includes('inventorySetQuantities'));
 calls.push(body.variables);
 if(gone&&body.variables.input.quantities[0].inventoryItemId===gid('InventoryItem',1))return Response.json({data:{inventorySetQuantities:{userErrors:[{code:'INVALID_INVENTORY_ITEM',message:'missing fixture item'}]}}});
 if(!provider.has(body.variables.key))provider.set(body.variables.key,body.variables.input);
 if(lose){lose=false;throw Error('fixture response lost after provider commit');}
 return Response.json({data:{inventorySetQuantities:{userErrors:[]}}});
};
function reset(stock=10){
 f.sql.exec('DELETE FROM orders; DELETE FROM catalogs; DELETE FROM channel_links; DELETE FROM shopify_connections; DELETE FROM shopify_variant_links; DELETE FROM shopify_sync_outbox; DELETE FROM shopify_inbound_stock; DELETE FROM shopify_webhook_events;');
 for(const m of [merchant,other]){
  f.sql.prepare('INSERT INTO catalogs(merchant,data,rev,updated_ts) VALUES(?,?,1,1)').run(m,JSON.stringify({v:2,products:[{id:'p',name:'Fixture',priceMAD:1}],variants:[{id:'v',productId:'p',size:'S',colorId:'noir',base:stock,stock,baseAt:1},{id:'w',productId:'p',size:'M',colorId:'noir',base:stock,stock,baseAt:1}],moves:[]}));
  for(const [i,v]of ['v','w'].entries())f.sql.prepare("INSERT INTO shopify_variant_links(merchant,kiwi_variant_id,shopify_variant_id,inventory_item_id,location_id,match_method,last_shopify_quantity,status,updated_ts) VALUES(?,?,?,?,?,'sku',?,'active',1)").run(m,v,gid('ProductVariant',i+1),gid('InventoryItem',i+1),gid('Location',1),stock);
 }
 f.sql.prepare("INSERT INTO channel_links(id,merchant,channel,label,hash,config,status,created_ts) VALUES('fixture-link',?,'shopify','Fixture','fake',?,'active',1)").run(merchant,JSON.stringify({oauth:true,shop:'alias.myshopify.com',myshopifyDomain:'properties.myshopify.com'}));
 f.sql.prepare("INSERT INTO shopify_connections(merchant,shop_domain,access_token_enc,token_expires_ts,location_id,status,connected_ts,updated_ts) VALUES(?,'properties.myshopify.com',?,? ,?,'active',1,1)").run(merchant,token,Date.now()+86400000,gid('Location',1));
 orders=[];calls=[];provider.clear();lose=false;gone=false;
}
const doc=(m=merchant)=>JSON.parse(f.sql.prepare('SELECT data FROM catalogs WHERE merchant=?').get(m).data);
function order(q=1,cents=123){return{id:501,name:'#501',created_at:new Date(T).toISOString(),currency:'MAD',total_price:(cents/100).toFixed(2),line_items:[{id:901,variant_id:1,title:'Fixture',quantity:q,price:(cents/100).toFixed(2)}]};}
function replayOrder(o){return{id:gid('Order',o.id),createdAt:o.created_at,lineItems:{nodes:o.line_items.map(l=>({id:gid('LineItem',l.id),currentQuantity:l.quantity,variant:l.variant_id?{id:gid('ProductVariant',l.variant_id)}:null}))}};}
async function hook(o,signature='valid',shop='properties.myshopify.com',topic='orders/create'){
 const raw=JSON.stringify(o),headers={'X-Shopify-Topic':topic,'X-Shopify-Shop-Domain':shop,'Content-Type':'application/json'};
 if(signature!=='missing')headers['X-Shopify-Hmac-Sha256']=createHmac('sha256',signature==='valid'?secret:'fake-wrong-key').update(raw).digest('base64');
 const r=await webhook({env:f.env,params:{link:'fixture-link'},request:new Request('https://kiwi.test/api/channel/shopify/fixture-link',{method:'POST',headers,body:raw})});return{status:r.status,body:await r.json()};
}
async function race(work){let release;const ready=new Promise(r=>release=r);gate={ready,release,rows:0};let timer;try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('catalog read barrier not reached')),3000);})]);}finally{clearTimeout(timer);gate=null;release();}}
const qty=fc.integer({min:1,max:40}),stock=fc.integer({min:0,max:40});
try{
await strict('duplicate signed webhook and catch-up decrement once with journal and tenant isolation',fc.asyncProperty(qty,fc.boolean(),async(q,first)=>{reset(q+3);const o=order(q),b=doc(other);orders=[replayOrder(o)];if(first)await replayShopifyOrders(f.env,merchant);assert.equal((await hook(o)).status,200);assert.equal((await hook(o)).status,200);await replayShopifyOrders(f.env,merchant);assert.equal(doc().variants[0].stock,3);assert.equal(doc().moves.length,1);assert.equal(doc().moves[0].d,-q);assert.equal(doc().moves[0].at,T);assert.deepEqual(doc(other),b);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM shopify_sync_outbox').get().n,0);}));
await strict('webhook and catch-up race at the same catalog revision decrement once',fc.asyncProperty(qty,async(q)=>{reset(q+1);const o=order(q);orders=[replayOrder(o)];const [h,r]=await race(()=>Promise.all([hook(o),replayShopifyOrders(f.env,merchant)]));assert.equal(h.status,200);assert.ok(r.applied===0||r.applied===1);assert.equal(doc().variants[0].stock,1);assert.equal(doc().moves.length,1);}));
await strict('webhook caps all lines to available stock and journals every applied piece',fc.asyncProperty(stock,qty,qty,async(have,a,b)=>{reset(have);const o=order(a);o.line_items.push({...o.line_items[0],id:902,quantity:b});assert.equal((await hook(o)).status,200);const d=doc(),taken=Math.min(have,a+b);assert.equal(d.variants[0].stock,have-taken);assert.equal(d.moves.reduce((n,m)=>n-m.d,0),taken);assert.ok(d.moves.every(m=>m.d<0&&m.why==='vente'));}),[[0,1,1],[1,2,1]]);
await strict('undated legacy retry retains stock floor and stable movement identity',fc.asyncProperty(qty,async(q)=>{reset(q+1);const o=order(q);delete o.created_at;assert.equal((await hook(o)).status,200);assert.equal((await hook(o)).status,200);assert.equal(doc().variants[0].stock,1);assert.equal(doc().moves.length,1);assert.equal(doc().moves[0].id,'so-501-901');}));
await strict('delayed webhook preserves a stock count made after the order',fc.asyncProperty(qty,async(q)=>{reset(q+2);const d=doc();d.variants[0].baseAt=T+1000;f.sql.prepare('UPDATE catalogs SET data=? WHERE merchant=?').run(JSON.stringify(d),merchant);assert.equal((await hook(order(q))).status,200);assert.equal(doc().variants[0].stock,q+2);assert.equal(doc().moves.length,0);const queued=JSON.parse(f.sql.prepare('SELECT payload FROM shopify_inbound_stock').get().payload);assert.equal(queued.created_at,new Date(T).toISOString());}));
await strict('deleted Shopify variant never aborts replay or blocks later valid lines',fc.asyncProperty(qty,async(q)=>{reset(q+2);const o=order(q);o.line_items.unshift({id:900,variant_id:null,quantity:1});orders=[replayOrder(o)];const r=await replayShopifyOrders(f.env,merchant);assert.equal(r.unmatched,1);assert.equal(doc().variants[0].stock,2);}));
await strict('unmapped webhook line leaves later mapped line durable and retryable',fc.asyncProperty(qty,async(q)=>{reset(q+2);const o=order(q);o.line_items.unshift({id:900,variant_id:999,quantity:1,title:'Gone',price:'1.00'});assert.equal((await hook(o)).status,200);assert.equal(doc().variants[0].stock,2);assert.equal(doc().moves.length,1);assert.equal(f.sql.prepare('SELECT status FROM shopify_inbound_stock').get().status,'pending');}));
await strict('unsigned wrong signature and wrong shop leave stock orders and queues unchanged',fc.asyncProperty(qty,fc.constantFrom('missing','wrong','shop'),async(q,mode)=>{reset(q);const before=doc(),b=doc(other);const r=await hook(order(q),mode==='shop'?'valid':mode,mode==='shop'?'other.myshopify.com':'properties.myshopify.com');assert.equal(r.status,401);assert.deepEqual(doc(),before);assert.deepEqual(doc(other),b);for(const t of ['orders','shopify_inbound_stock','shopify_sync_outbox'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+t).get().n,0);}));
await strict('inventory webhook observes only its merchant and never changes catalog stock',fc.asyncProperty(stock,async(q)=>{reset(10);const before=doc(),b=doc(other);const r=await hook({inventory_item_id:1,location_id:1,available:q},'valid','properties.myshopify.com','inventory_levels/update');assert.equal(r.status,200);assert.deepEqual(doc(),before);assert.deepEqual(doc(other),b);assert.equal(f.sql.prepare("SELECT last_shopify_quantity FROM shopify_variant_links WHERE merchant=? AND kiwi_variant_id='v'").get(merchant).last_shopify_quantity,q);assert.equal(f.sql.prepare("SELECT last_shopify_quantity FROM shopify_variant_links WHERE merchant=? AND kiwi_variant_id='v'").get(other).last_shopify_quantity,10);}));
await strict('permanent-domain signed order conserves stored total and line centimes',fc.asyncProperty(fc.integer({min:1,max:20000000}),async(c)=>{reset();const o=order(1,c);assert.equal((await hook(o)).status,200);const row=f.sql.prepare('SELECT total,lines FROM orders').get();assert.equal(Math.round(row.total*100),c);assert.equal(Math.round(JSON.parse(row.lines)[0].unitPrice*100),c);}));
await strict('lost outbound acknowledgement retries identical idempotency key and quantity once',fc.asyncProperty(stock,async(q)=>{reset(q+1);await enqueueStockChanges(f.env,merchant,doc(),{variants:[{id:'v',stock:q}]},2);lose=true;assert.equal((await flushShopifyOutbox(f.env,merchant)).failed,1);f.sql.exec('UPDATE shopify_sync_outbox SET next_attempt_ts=0');assert.equal((await flushShopifyOutbox(f.env,merchant)).processed,1);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(provider.size,1);assert.equal([...provider.values()][0].quantities[0].quantity,q);}));
await strict('deleted outbound item does not block another variant in the batch',fc.asyncProperty(stock,async(q)=>{reset(q+1);await enqueueStockChanges(f.env,merchant,doc(),{variants:[{id:'v',stock:q},{id:'w',stock:q}]},2);gone=true;const r=await flushShopifyOutbox(f.env,merchant);assert.equal(r.failed,1);assert.equal(r.processed,1);assert.equal(f.sql.prepare('SELECT status FROM shopify_sync_outbox').get().status,'cancelled');assert.equal(f.sql.prepare("SELECT status FROM shopify_variant_links WHERE merchant=? AND kiwi_variant_id='v'").get(merchant).status,'missing');}));
await strict('replay dry run respects counts current quantity cancellations and stock floor',fc.asyncProperty(stock,qty,async(have,q)=>{reset(have);const o=replayOrder(order(q));orders=[o,{...o,id:gid('Order',502),cancelledAt:new Date(T).toISOString()},{...o,id:gid('Order',503),test:true}];const before=doc();const r=await replayShopifyOrders(f.env,merchant,{dryRun:true});assert.deepEqual(doc(),before);assert.equal(r.pieces,Math.min(have,q));assert.equal(r.short,Math.max(0,q-have));const counted=planReplay({...before,variants:before.variants.map(v=>({...v,baseAt:T+1}))},new Map([[gid('ProductVariant',1),'v']]),[o]);assert.equal(counted.apply.length,0);assert.equal(counted.counted.length,1);}));
// Une ligne arrivée sur un stock Kiwi déjà à zéro laisse un mouvement à zéro :
// un rattrapage fait après un réassort ne consomme pas la nouvelle marchandise.
await strict('SH-1 historical shortage stays settled after replenishment',fc.asyncProperty(qty,async(q)=>{reset(0);orders=[replayOrder(order(q))];const first=await replayShopifyOrders(f.env,merchant);assert.equal(first.applied,0);assert.equal(first.short,q);const d=doc();d.moves.push({id:'receipt',vid:'v',d:q,at:T+1000,why:'achat'});f.sql.prepare('UPDATE catalogs SET data=?,rev=rev+1 WHERE merchant=?').run(JSON.stringify(d),merchant);const again=await replayShopifyOrders(f.env,merchant);assert.equal(again.applied,0);assert.equal(again.already,1);const d2=doc();assert.equal(d2.variants[0].base+d2.moves.filter(m=>m.vid==="v"&&m.at>d2.variants[0].baseAt).reduce((n,m)=>n+m.d,0),q);const plan=planReplay(doc(),new Map([[gid('ProductVariant',1),'v']]),orders);assert.equal(plan.apply.length,0);}));
}finally{globalThis.fetch=realFetch;f.close();}
console.log(`Shopify properties: ${passed} strict, ${known} known, ${failed} failures; runs=${RUNS}; seed=${SEED}`);if(failed)process.exitCode=1;
