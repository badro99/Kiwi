// Real production functions and node:sqlite routes; CASE selects a regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { declaration } from './js-declarations.cjs';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { fixture } from './server-money-fixture.mjs';
import { paintIssues } from '../assets/channel-health.js';
import { createPayrollView } from '../assets/planning/payroll-view.js';
import { onRequestGet as bookingGet, onRequestPost as bookingPost } from '../functions/api/booking.js';
import { onRequestPost as shopPost, onRequestGet as shopGet } from '../functions/api/shopify/status.js';
import { enqueueInboundStock, flushInboundStock } from '../functions/api/shopify/_inbound-stock.js';
import { __test as inbound } from '../functions/api/channel/shopify/[link].js';
const read = f => fs.readFileSync(f, 'utf8');
const run = async (id, fn) => { if (!process.env.CASE || process.env.CASE === id) { await fn(); console.log('PASS #' + id); } };
function load(file, names, globals = {}) { const ctx = vm.createContext(globals); vm.runInContext(names.map(n => declaration(read(file).slice(read(file).indexOf('function ' + n + '(')), n)).join('\n'), ctx); return ctx; }
await run('8', () => {
  globalThis.window = { __kiwiTeamV2: {} }; globalThis.document = { addEventListener() {} };
  for (const [lang, label] of [['fr','Total partiel'],['en','Partial total'],['ar','مجموع جزئي']]) {
    const noop = () => '', hours = { a: { '2026-11-04': 1 }, b: { '2026-11-04': 8 } };
    const deps = new Proxy({ handlers: {}, live: {}, AVATAR_COLORS: {}, IC: {}, buildPeriod: () => ({ days: ['2026-11-04'] }), getHours: () => hours, memberFullName: m => m.name, trLang: () => lang, hourlyPayFor: (m,h) => m.hourlyRate*h, payCents: v => Math.round(v*100), fmtPay: v => v.toFixed(2), dateLocale: () => 'fr', esc: String, fmtHours: String }, { get: (o,k) => k in o ? o[k] : noop });
    const api = createPayrollView(deps);
    const html = api.renderHoursPane({ hPeriodLabel: noop }, {}, 'restaurant', [{ id:'a',name:'Rated',hourlyRate:12.34 },{ id:'b',name:'Excluded',hourlyRate:0 }]);
    const footer = html.slice(html.indexOf('<tfoot>'));
    assert.ok(footer.includes('12.34') && footer.includes(label) && footer.includes('Excluded'));
    assert.ok(!footer.includes('Rated'));
  }
  delete globalThis.window; delete globalThis.document;
});
await run('20', () => {
  const c = load('assets/caisse/split-tender.js', ['splitItemTotals'], { minor: n => Math.round(n*100), fmtMADcents: String });
  const lines = [{name:'Tea',itemId:'a',qty:1,total:12.34},{name:'Tea',itemId:'b',qty:2,total:24.68},{name:'Tea',itemId:'a',qty:2,total:24.68},{name:'Tea',itemId:'a',qty:1,total:13}];
  const values = Object.values(c.splitItemTotals(lines));
  assert.equal(values.length,3); assert.equal(values.find(v => v.itemId==='a' && v.unitPrice===12.34).totalQty,3);
  assert.equal(values.find(v => v.itemId==='b').totalQty,2);
  assert.equal(values.reduce((n,v) => n+Math.round(v.unitPrice*100)*v.totalQty,0),7470);
});
await run('30', () => {
  const c = load('assets/boutique-promos-dashboard.js', ['dayReport','zoneOf','wall','dayKey','boundary'], { window:{}, FALLBACK_ZONE:'Africa/Casablanca',wallFormats:{} });
  for (const key of ['2026-03-21','2026-11-04']) {
    const from = c.boundary(key,false), to = c.boundary(key,true);
    assert.equal(c.wall(from).hour,'05'); assert.equal(c.wall(to+1).hour,'05');
    assert.equal(c.dayKey(from-1),new Date(Date.parse(key)-86400000).toISOString().slice(0,10));
    assert.equal(c.dayKey(from),key); assert.equal(c.dayKey(to),key);
  }
});
await run('15', async () => {
  const source = read('assets/booking-recover.js');
  for (const lang of ['fr','en','ar']) {
    let failure;
    const ctx = vm.createContext({ location:{ search:'?merchant=test' }, URLSearchParams, document:{documentElement:{lang},getElementById:()=>null}, deadlineFetch: async () => { if (failure instanceof Error) throw failure; return failure; } });
    vm.runInContext(source.replace("import { deadlineFetch } from './request-deadline.mjs';",'').replace('export function','function')+'\nthis.copy=S; this.submit=submit;',ctx);
    const msg={},btn={}, form={matches:()=>true,elements:{code:{value:'R-123'},contact:{value:'a@b.test'}},querySelector:s=>s==='button'?btn:msg};
    for (const [response,key] of [[{ok:false,status:404,json:async()=>({})},'miss'],[{ok:false,status:503,json:async()=>({})},'unavailable'],[new Error('network'),'unavailable'],[{ok:true,status:200,json:async()=>{throw Error('bad-json');}},'unavailable'],[{ok:false,status:429,json:async()=>({})},'busyServer'],[new Error('request-timeout'),'slow']]) {
      failure=response; await ctx.submit({target:form,preventDefault(){}}); assert.equal(msg.textContent,ctx.copy[lang][key]); assert.equal(btn.disabled,false);
    }
  }
});
const f = await fixture(process.cwd()), { sql, env, merchant } = f;
const cookies={owner:`${SESS_COOKIE}=${await makeSession('money-owner',env.AUTH_SECRET)}`};
// The money harness batches writes; booking also batches SELECT statements.
env.DB = { prepare(q) { const st=f.DB.prepare(q); return { query:q, bind(...args){st.bind(...args);return this;}, async first(){return st.first();},async all(){return st.all();},async run(){return st.run();} }; }, async batch(stmts){return Promise.all(stmts.map(st => st.query.trimStart().startsWith('SELECT') ? st.all() : st.run()));} };
const noNetwork = globalThis.fetch;
globalThis.fetch = async () => { throw Error('No network in this suite'); };
const put = (feature,data) => sql.prepare('INSERT OR REPLACE INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,1)').run(merchant,feature,JSON.stringify(data));
await run('14', async () => {
  const week = Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(d=>[d,{open:true,periods:[{from:'09:00',to:'18:00'}]}]));
  put('reservations',{settings:{published:true,confirmation:'instant',windowDays:365,minNoticeMinutes:0},services:[{id:'svc',name:'Service',duration:30,capacity:1,resourceIds:['res'],active:true}],resources:[{id:'res',name:'Staff',kind:'person',active:true,week}],bookings:[],blocked:[]});
  const day = new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  const slots = await (await bookingGet({env,request:new Request(`https://kiwi.test/api/booking?merchant=${merchant}&service=svc&date=${day}`)})).json();
  assert.ok(slots.slots?.length, JSON.stringify(slots));
  const original = globalThis.fetch; let signal;
  globalThis.fetch = async (_,init) => { signal=init.signal; return new Promise(()=>{}); }; env.MAIL_WEBHOOK='https://mail.test';
  let timer;
  try {
    const req=new Request('https://kiwi.test/api/booking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchant,ref:'bounded-mail-ref',serviceId:'svc',startAt:slots.slots[0].startAt,customer:{name:'Guest',email:'guest@example.test'},partySize:1})});
    const res=await Promise.race([bookingPost({env,request:req}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('committed booking hidden by stalled mail')),2500);})]);
    assert.equal(res.status,200); const body=await res.json(); assert.equal(body.ok,true); assert.equal(body.confirmationSent,false); assert.ok(signal.aborted);
    assert.equal(JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='reservations'").get(merchant).data).bookings[0].id,body.id);
  } finally {clearTimeout(timer);globalThis.fetch=original;}
});
const order = (id,v) => ({id,created_at:new Date().toISOString(),line_items:[{id:1,variant_id:v,quantity:1}]});
async function setupShop() {
  sql.prepare("INSERT OR REPLACE INTO shopify_connections(merchant,shop_domain,access_token_enc,status,connected_ts,updated_ts,last_error) VALUES(?,'test.myshopify.com','fake','active',1,1,'')").run(merchant);
  sql.prepare('INSERT OR REPLACE INTO catalogs(merchant,data,rev,updated_ts) VALUES(?,?,1,1)').run(merchant,JSON.stringify({products:[{id:'p',name:'Tea'}],variants:[{id:'v',productId:'p',stock:5,base:5,baseAt:1}],moves:[]}));
}
const health = async () => (await shopGet({env,request:new Request('https://kiwi.test/api/shopify/status?merchant='+merchant,{headers:{Cookie:cookies.owner}})})).json();
await run('35', async () => {
  await setupShop(); await enqueueInboundStock(env,merchant,order('dead',901)); sql.exec('UPDATE shopify_inbound_stock SET attempts=19');
  await flushInboundStock(env,inbound.applyShopifyOrderStock,merchant);
  await enqueueInboundStock(env,merchant,order('pending',902)); await flushInboundStock(env,inbound.applyShopifyOrderStock,merchant);
  const h=await health(); assert.ok(h.orderIssues.some(i=>i.code==='stock-dead'&&i.orderRef==='dead')); assert.ok(h.orderIssues.some(i=>i.code==='stock-pending'&&i.orderRef==='pending'));
  // All exceptions, beyond the former 100 row limit, stay accessible.
  for(let i=0;i<101;i++)await enqueueInboundStock(env,merchant,order('extra'+i,903));
  assert.equal((await health()).orderIssues.length,103);
  globalThis.window = {}; globalThis.localStorage={getItem:()=> 'fr'};
  globalThis.document={createElement:()=>({})};
  try {
    const children=[], root={appendChild:node=>children.push(node)};
    paintIssues(root,h.orderIssues,h.connection);
    assert.ok(children.some(n=>n.textContent.includes('dead')));
    assert.ok(children.some(n=>n.textContent.includes('pending')));
    assert.equal(children.length,2,'latest connection error does not duplicate an order exception');
  } finally { delete globalThis.window; delete globalThis.document; delete globalThis.localStorage; }

});
await run('36', async () => {
  await setupShop(); sql.exec('DELETE FROM shopify_inbound_stock');
  await enqueueInboundStock(env,merchant,order('repaired',901)); await enqueueInboundStock(env,merchant,order('unrepaired',902)); sql.exec("UPDATE shopify_inbound_stock SET status='dead', attempts=20");
  const retry=async()=>shopPost({env,request:new Request('https://kiwi.test/api/shopify/status',{method:'POST',headers:{Cookie:cookies.owner,'Content-Type':'application/json'},body:JSON.stringify({action:'retry',merchant})})});
  assert.equal((await retry()).status,200); assert.equal(sql.prepare("SELECT COUNT(*) n FROM shopify_inbound_stock WHERE status='dead'").get().n,2);
  sql.prepare("INSERT INTO shopify_variant_links(merchant,kiwi_variant_id,shopify_variant_id,inventory_item_id,location_id,match_method,status,updated_ts) VALUES(?,'v','gid://shopify/ProductVariant/901','i','l','sku','active',1)").run(merchant);
  assert.equal((await retry()).status,200);
  const rows=sql.prepare('SELECT order_ref,status,attempts FROM shopify_inbound_stock ORDER BY order_ref').all();
  assert.equal(rows[0].status,'done');assert.equal(rows[0].attempts,1);assert.equal(rows[1].status,'dead');assert.equal(rows[1].attempts,20);
  const data=JSON.parse(sql.prepare('SELECT data FROM catalogs WHERE merchant=?').get(merchant).data);assert.equal(data.variants[0].stock,4);assert.equal(data.moves.length,1);
  await retry();assert.equal(JSON.parse(sql.prepare('SELECT data FROM catalogs WHERE merchant=?').get(merchant).data).moves.length,1);
});
globalThis.fetch = noNetwork; sql.close();
