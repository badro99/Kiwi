import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const feedSource = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const invoiceSource = fs.readFileSync(new URL('../assets/invoice.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 15; i++) await new Promise(r => setImmediate(r)); };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('✓ ' + name); }
function feedHarness(reply) {
  const timers = new Map(), seen = [], requests = []; let id = 0;
  const storage = new Map([['kiwiLive', '1']]);
  const localStorage = { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
  const document = { hidden: false, readyState: 'loading', addEventListener() {} };
  const window = { KiwiEnv: { isReal: () => true }, KiwiMe: { business: 'Fixture A' }, addEventListener() {}, dispatchEvent() {} };
  const state = { reply };
  vm.runInNewContext(feedSource, { window, document, localStorage, navigator: { onLine: false },
    location: { search: '', hostname: 'kiwi.test' }, URLSearchParams, AbortController,
    CustomEvent: class { constructor(type, init) { this.type=type; this.detail=init?.detail; } },
    setTimeout(fn, ms) { timers.set(++id, {fn,ms}); return id; }, clearTimeout: id => timers.delete(id),
    fetch(url, options) { requests.push({url, options}); return state.reply(url, options); },
  });
  const stop = window.KiwiLive.watchFeed((sales, backfill, tenant) => seen.push({ sales, backfill, tenant }));
  return { window, document, timers, seen, requests, state, stop,
    run(ms) { const timer = [...timers.entries()].find(([,t]) => t.ms === ms); assert.ok(timer, 'timer ' + ms); timers.delete(timer[0]); timer[1].fn(); },
  };
}
const page = (sales = [], merchant = 'fixture-a') => ({ ok: true, json: async () => ({merchant, sales, cursor: sales.at(-1)?.cursor || 0, voided: []}) });
let h = feedHarness(async () => page()); await settle();
h.state.reply = async () => page(Array.from({length:50},(_,i)=>({cursor:i+1,amount:1})));
h.run(2500); await settle();
check('50 new receipts at the live edge drain immediately, not one background interval per page', () => {
  assert.equal(h.seen.at(-1).backfill,false); assert.ok([...h.timers.values()].some(t=>t.ms===0));
});
h.state.reply = async () => page([{cursor:128, amountCents:4900, amount:49}]); h.run(0); await settle();
check('sale #128 arrives on the immediate next page under the same tenant/cursor', () => {
  assert.equal(h.seen.at(-1).sales[0].amountCents,4900); assert.match(h.requests.at(-1).url,/since=50/);
  assert.equal(h.requests.at(-1).options.cache,'no-store');
}); h.stop();
for (const phase of ['headers','body']) {
  let release;
  h = feedHarness(() => phase === 'headers' ? new Promise(r=>release=r) : Promise.resolve({ok:true,json:()=>new Promise(r=>release=r)}));
  await settle(); h.run(12000); await settle();
  check('stalled '+phase+' releases the feed lock after 12 seconds without advancing the cursor', () => {
    assert.equal(h.seen.length,0); assert.equal(h.window.KiwiLive.status().lastSync,0); assert.equal(h.window.KiwiLive.status().feedError,'timeout');
  });
  release(phase==='headers'?page([{cursor:99}]):{sales:[{cursor:99}],cursor:99,merchant:'fixture-a'}); await settle();
  assert.equal(h.seen.length,0, 'late body cannot win the deadline race');
  h.state.reply=async()=>page([{cursor:128,amountCents:4900}]); h.run(2500); await settle();
  check('recovery after stalled '+phase+' reads the original cursor and clears only the feed error', () => {
    assert.equal(h.seen[0].sales[0].cursor,128); assert.match(h.requests.at(-1).url,/since=0/); assert.equal(h.window.KiwiLive.status().feedError,'');
  }); h.stop();
}
let release; h = feedHarness(()=>new Promise(r=>release=r)); await settle();
h.window.KiwiMe.business='Fixture B'; release(page([{cursor:500}])); await settle();
check('a late response from the previous store is never applied or called fresh',()=>{assert.equal(h.seen.length,0);assert.equal(h.window.KiwiLive.status().lastSync,0);});
h.state.reply=async()=>page([], 'fixture-b'); h.run(2500); await settle();
check('store switch restarts the new store at cursor zero',()=>assert.match(h.requests.at(-1).url,/merchant=fixture-b&since=0/)); h.stop();
h=feedHarness(async()=>({ok:false,status:403})); await settle();
check('refused feed remains an explicit auth error, not a successful zero-sales read',()=>{assert.equal(h.seen.length,0);assert.equal(h.window.KiwiLive.status().feedError,'auth');});h.stop();
function invoiceHarness({blocked=false,native=false,status=200}={}) {
  const values=new Map(), windows=[], requests=[], notices=[], nodes=[], exports=[], timers=new Map();let timerId=0; let activated=true, tenant='fixture-a';
  const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  function node(tag) { const fields=new Map(); const n={tag,children:[],style:{},value:'',setAttribute(){},appendChild(x){this.children.push(x);},querySelector(s){if(!fields.has(s))fields.set(s,node(s));return fields.get(s);},focus(){},remove(){this.removed=true;}}; nodes.push(n); return n; }
  const document={baseURI:'https://kiwi.test/',body:node('body'),createElement:node,getElementById:()=>null,dispatchEvent(){}};
  const window={
    KiwiLive:{merchant:()=>tenant,saleIdFor:e=>'hashed-'+e.id,canonicalSaleId:(_m,id)=>id==='hashed-local-128'?'server-128':id},
    KiwiReceipt:{business:()=>({name:'Fixture A',ice:'001234567000089'}),config:()=>({vat:{mode:'none'}})},
    Kiwi:{toast:(msg)=>notices.push(msg)},
    open(){assert.ok(activated,'window must open under original click, never after awaited network');if(blocked)return null;
      const w={closed:false,close(){this.closed=true;},document:{title:'',open(){},write(html){w.html=html;},close(){}}};windows.push(w);return w;},
  };
  if(native)window.Capacitor={Plugins:{KiwiPrinterSocket:{exportInvoice:async args=>{exports.push(args);return {ok:true,presented:true};}}}};
  let resolve;
  const response=new Promise(r=>resolve=r);
  const context={window,document,localStorage,Date,AbortController,CustomEvent:class{},setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),fetch:async(_url,opts)=>{requests.push(JSON.parse(opts.body));return response;}};
  vm.runInNewContext(invoiceSource,context);
  return {api:window.KiwiInvoice,values,windows,requests,notices,nodes,exports,timers,
    deactivate(){activated=false;},tenant(v){tenant=v;},
    reply(){const draft=requests[0]?.snapshot;resolve({ok:status===200,status,json:async()=>status===200?{invoice:{number:'F-2026-0128',seq:128,snapshot:draft}}:{error:'unknown-sale'}});},
  };
}
const entry={id:'local-128',ref:'128',time:new Date('2026-09-30T21:31:00Z'),amountCents:4900,customer:{name:'Test fixture'}};
let i=invoiceHarness();let pending=i.api.makeSaleInvoice(entry,'pdf');await settle();
check('cashier uses the hashed canonical server ID, never its local journal ID',()=>assert.equal(i.requests[0].saleId,'server-128'));
check('cashier invoice keeps the original receipt timestamp and exact cents',()=>{assert.equal(i.requests[0].snapshot.issuedTs,entry.time.getTime());assert.equal(i.requests[0].snapshot.totals.ttc,49);});
i.deactivate();i.reply();await pending;
check('reserved click window is filled after D1 responds, without a blocked asynchronous popup',()=>{assert.equal(i.windows.length,1);assert.equal(i.windows[0].document.title,'F-2026-0128');assert.match(i.windows[0].html,/49,00 MAD/);});
const cachedKeys=[...i.values.keys()]; check('invoice cache is isolated per merchant',()=>assert.deepEqual(cachedKeys,['kiwi:sale_invoices:v1:fixture-a']));
i.tenant('fixture-b');assert.equal(Object.keys(i.api.getCachedInvoices()).length,0);
i=invoiceHarness({blocked:true});pending=i.api.makeSaleInvoice(entry);await settle();i.reply();await pending;
check('popup denial displays the actual numbered document in a dismissible on-page viewer',()=>{assert.ok(i.nodes.some(n=>n.className==='kiwi-invoice-preview'));assert.match(i.nodes.find(n=>n.tag==='iframe').srcdoc,/F-2026-0128/);});
i=invoiceHarness({status:404});pending=i.api.makeSaleInvoice(entry);await settle();i.reply();assert.equal(await pending,null);
check('unsynced sale closes its reserved window and cannot fabricate a legal invoice',()=>{assert.equal(i.windows[0].closed,true);assert.equal(i.values.size,0);});
i=invoiceHarness({native:true});pending=i.api.makeSaleInvoice({...entry,serverSaleId:'known-server-id'});await settle();i.reply();await pending;
check('known D1 journal IDs are preserved, not hashed again',()=>assert.equal(i.requests[0].saleId,'known-server-id'));
check('native export gets a numbered HTML document with no browser print script or popup dependency',()=>{assert.equal(i.windows.length,0);assert.equal(i.exports[0].name,'F-2026-0128');assert.ok(!i.exports[0].html.includes('window.print()'));});
i=invoiceHarness();pending=i.api.makeSaleInvoice(entry);await settle();i.tenant('fixture-b');i.reply();
check('store switch during numbering cannot cache or display the previous merchant invoice',()=>assert.equal(i.values.size,0));
assert.equal(await pending,null);assert.equal(i.values.size,0);assert.equal(i.windows[0].closed,true);
i=invoiceHarness();pending=i.api.makeSaleInvoice({...entry,customer:null});await settle();
check('customer prompt stays in the original tab before any window is reserved',()=>{assert.equal(i.windows.length,0);assert.equal(i.requests.length,0);});
i.nodes.find(n=>n.className==='modal-veil is-open').querySelector('[data-inv-cust-skip]').onclick();await settle();
assert.equal(i.windows.length,1);i.deactivate();i.reply();await pending;
check('customer confirmation reserves under that real click, then fills the same window',()=>assert.equal(i.windows[0].document.title,'F-2026-0128'));
i=invoiceHarness();pending=i.api.makeSaleInvoice(entry);await settle();[...i.timers.values()].find(t=>t.ms===12000).fn();
assert.equal(await pending,null);
check('stalled invoice numbering closes the waiting popup after 12 seconds without fabricating a number',()=>{assert.equal(i.windows[0].closed,true);assert.equal(i.values.size,0);});
const apiBaseSource=fs.readFileSync(new URL('../assets/api-base.js',import.meta.url),'utf8');
const nativeRequests=[];
const nativeWindow={Capacitor:{isNativePlatform:()=>true},fetch:(url,init)=>{nativeRequests.push({url,init});return Promise.resolve({});}};
vm.runInNewContext(apiBaseSource,{window:nativeWindow,document:{querySelectorAll:()=>[],addEventListener(){}},URL,Request});
await nativeWindow.fetch('/api/feed?merchant=fixture-a',{credentials:'include'});
await nativeWindow.fetch('/api/invoice',{credentials:'include',method:'POST'});
check('native API rewrite keeps credentials included for both new requests',()=>{
 assert.ok(nativeRequests.every(r=>r.url.startsWith('https://kiwi-os.com/api/')&&r.init.credentials==='include'));
 assert.ok(invoiceSource.includes("credentials: 'include'"));assert.ok(feedSource.includes("credentials: 'include'"));
});
const swift=fs.readFileSync(new URL('../app/plugins/kiwi-printer-socket/ios/Sources/KiwiPrinterSocket/KiwiPrinterSocketPlugin.swift',import.meta.url),'utf8');
check('native export renders every A4 page and presents a local protected PDF, not automatic sharing',()=>{assert.match(swift,/for page in 0\.\.<pages/);assert.match(swift,/\.completeFileProtection/);assert.match(swift,/UIActivityViewController\(activityItems: \[file\]/);});
console.log(`Ticket 141: ${checks} focused behavioral/contract checks passed.`);
