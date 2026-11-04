import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost as hook, __test as inbound } from '../functions/api/channel/shopify/[link].js';
import { enqueueInboundStock, flushInboundStock } from '../functions/api/shopify/_inbound-stock.js';
import { onRequestGet as status } from '../functions/api/shopify/status.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
const f=await fixture(path.resolve('.'));
const secret='synthetic-webhook-secret',shop='truth.myshopify.com';
f.sql.prepare("INSERT INTO channel_links(id,merchant,channel,hash,config,status,created_ts) VALUES('truth-link',?,'shopify','fake',?,'active',1)").run(f.merchant,JSON.stringify({oauth:true,shop}));
f.sql.prepare("INSERT INTO shopify_connections(merchant,shop_domain,access_token_enc,status,connected_ts,updated_ts) VALUES(?,?,'fake','active',1,1)").run(f.merchant,shop);
const DB={...f.DB,prepare(q){const st=f.DB.prepare(q);return {bind(...v){st.bind(...v);return this;},async first(){return st.first();},async all(){return st.all();},async run(){return st.run();}};}};
const env={...f.env,DB,SHOPIFY_CLIENT_SECRET:secret};
async function send(topic,payload,id,db=DB){
 const raw=JSON.stringify(payload);
 return hook({env:{...env,DB:db},params:{link:'truth-link'},request:new Request('https://kiwi.test/api/channel/shopify/truth-link',{method:'POST',body:raw,headers:{
 'X-Shopify-Hmac-Sha256':crypto.createHmac('sha256',secret).update(raw).digest('base64'),
 'X-Shopify-Topic':topic,'X-Shopify-Shop-Domain':shop,'X-Shopify-Webhook-Id':id,
 }})});
}
for(const op of ['SELECT 1 AS seen','INSERT OR IGNORE INTO shopify_webhook_events']) {
 const db={...DB,prepare(q){if(q.includes(op)) return {bind(){return this;},async first(){throw Error('D1 read failure');},async run(){throw Error('D1 write failure');}};return DB.prepare(q);}};
 const r=await send('inventory_levels/update',{inventory_item_id:1,location_id:1,available:1},'failed-'+op,db);
 assert.equal(r.status,503,'dedupe '+op+' failure must ask Shopify to retry');
}
console.log('✓ Dedupe read and write failures fail closed with retryable 503.');
let r=await send('orders/create',{id:81,currency:'EUR',total_price:'12.34',line_items:[]},'currency-81');
assert.equal(r.status,200,'unsupported currency must be acknowledged');
assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM orders').get().n,0,'unsupported currency never enters MAD orders');
r=await send('orders/create',{id:81,currency:'EUR'},'currency-81');
assert.equal((await r.json()).duplicate,true,'acknowledged issue replays once');
const cookie=`${SESS_COOKIE}=${await makeSession('money-owner',env.AUTH_SECRET)}`;
// Never allow this health request to contact Shopify.
const realFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No network in test');};
async function health(){return (await status({env,request:new Request('https://kiwi.test/api/shopify/status?merchant='+f.merchant,{headers:{Cookie:cookie}})})).json();}
try {
 let h=await health();
 assert.equal(h.orderIssues[0].code,'unsupported-currency');assert.equal(h.connection.lastError,'unsupported-currency');
 const context={window:{},localStorage:{getItem:()=> 'fr'}};vm.createContext(context);
 vm.runInContext(fs.readFileSync('assets/channel-health.js','utf8').replace('export function','function'),context);
 const err={};context.paint(err,h.connection.lastError,h.connection.lastErrorContext);
 assert.match(err.textContent,/devise non prise en charge/);assert.match(err.textContent,/81/);
 console.log('✓ Non-MAD order acknowledged once, excluded from MAD ledger, durable issue visible in merchant health.');
 f.sql.prepare('INSERT INTO shopify_variant_links(merchant,kiwi_variant_id,shopify_variant_id,inventory_item_id,location_id,match_method,status,updated_ts) VALUES(?,?,?,?,?,?,?,?)')
 .run(f.merchant,'variant-truth','gid://shopify/ProductVariant/901','gid://shopify/InventoryItem/1','gid://shopify/Location/1','sku','active',1);
 f.sql.prepare('INSERT INTO catalogs(merchant,data,rev,updated_ts) VALUES(?,?,1,1)').run(f.merchant,JSON.stringify({products:[{id:'product-truth',name:'TEST KIWI',priceMAD:10,createdAt:1}],variants:[{id:'variant-truth',productId:'product-truth',stock:1,base:1,baseAt:1,colorId:'default',colorFamily:'default',size:'U',barcodes:[]}],moves:[]}));
 const order={id:82,created_at:new Date().toISOString(),line_items:[{id:1,variant_id:901,quantity:3}]};
 await enqueueInboundStock(env,f.merchant,order);await flushInboundStock(env,inbound.applyShopifyOrderStock);
 const durable=f.sql.prepare('SELECT last_error FROM shopify_inbound_stock WHERE order_ref=?').get('82').last_error;
 assert.match(durable,/stock-short/,'oversell must survive in its durable order row');
 assert.equal(JSON.parse(durable).short,2,'durable issue retains exact shortfall');
 f.sql.prepare("UPDATE shopify_connections SET last_error='',updated_ts=?").run(Date.now());
 // Also exercise a subsequent healthy inventory webhook, which clears the old transient error.
 r=await send('inventory_levels/update',{inventory_item_id:1,location_id:1,available:0},'healthy-stock');assert.equal(r.status,200);
 h=await health();
 const issue=h.orderIssues.find(i=>i.code==='stock-short');assert.equal(issue.orderRef,'82');assert.equal(issue.short,2);
 assert.equal(h.connection.lastError,'stock-short','health still displays oversell after successful update');
 assert.equal(h.orderIssues.filter(i=>i.code==='unsupported-currency').length,1,'currency issue also survives health updates');
 context.paint(err,h.connection.lastError,h.connection.lastErrorContext);assert.match(err.textContent,/Survente/);assert.match(err.textContent,/82/);
 await flushInboundStock(env,inbound.applyShopifyOrderStock);h=await health();assert.equal(h.orderIssues.filter(i=>i.code==='stock-short').length,1);
 console.log('✓ Oversell persists across healthy updates and remains visible, with order reference and exact shortfall.');
}finally{globalThis.fetch=realFetch;f.close();}
