import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { balanceOf, displayStatus } from '../functions/api/invoices/_documents.js';
const read = f => fs.readFileSync(f, 'utf8');
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('PASS', name); } catch(e) { failures++; console.error('FAIL', name, e.message); } }
function reportHarness() {
 const window = { KiwiDayReport: { timezone: () => 'Africa/Casablanca', dayBounds: () => ({from:0,to:9e15}) } };
 vm.runInNewContext(read('assets/day-report-export.js').replace('window.KiwiDayReportExport={', 'window.private={hm,bounds};window.KiwiDayReportExport={'), {window, Intl, Date});
 return window;
}
await test('dayreport#0 merchant clock independent of device', () => {
 const w=reportHarness(); assert.equal(w.private.hm(Date.UTC(2026,9,20,12), {store:{slug:'m'}}), '13:00');
});
await test('dayreport#1 boundary failure is unavailable', () => {
 const w=reportHarness(); w.KiwiDayReport.dayBounds=()=>{throw Error('unavailable');};
 assert.equal(w.KiwiDayReportExport.build({day:'2026-10-20',store:{slug:'m'}},{summary:true}), null);
});
await test('home#0 refresh rejection clears previous hotel figures', async () => {
 const window={}; const state={ hotelMerchant:()=> 'm',hotelPerf:new Map(),HOTEL_PERF_TTL:1,renderKpiBand:()=>{},hotelDelta:()=>null };
 vm.runInNewContext(read('assets/daterange/kpi.js'), {window,fetch:()=>Promise.reject(Error('offline')),Date,URLSearchParams});
 const api=window.__kiwiHomeRenderers.kpi(state), e={data:{occupancyPct:90},ts:0,error:'',loading:false};
 state.hotelPerf.set('m|1|2',e); api.hotelPerfEntry({from:1,to:2});
 await new Promise(r=>setImmediate(r)); assert.equal(e.error,'unavailable'); assert.equal(e.data,null);
 assert.equal(api.hotelTilesFrom(e,null,null).occupation.text,'·');
});
await test('home#2 derive failure renders unavailable instead of aborting band', () => {
 const text=read('assets/daterange/kpi.js'); const body=text.slice(text.indexOf('const deriveTile ='),text.indexOf('const derived ='));
 const derive=Function('__state','data','ctx',body+'return deriveTile;')({KPI_CATALOG:{tx:{derive(){throw Error('ledger unavailable');}}}},{tx:{value:123}},{});
 const tile=derive('tx'); assert.equal(tile.text,'·'); assert.equal(tile.delta,null); assert.equal(tile.value,undefined);
});
const sqlite=new DatabaseSync(':memory:'); sqlite.exec(read('schema.sql'));
const db={prepare(sql){const st=sqlite.prepare(sql);return {bind(...p){return {all:async()=>({results:st.all(...p)}),first:async()=>st.get(...p)}}};}};
await test('invoices#0 and invoices#2 full register summary, payment month and tenant isolation', async () => {
 // Use the route's actual read handler with the same D1 adapter as other invoice suites.
 const src=read('functions/api/invoices.js'); const start=src.indexOf('async function read(ctx, url)'); const end=src.indexOf('/* Le curseur est opaque',start);
 const fn=Function('todayFor','json','balanceOf','displayStatus','MAX_LIST','DOC_TYPES','validDay','readListCursor','writeListCursor','parseJson','registerSummary',src.slice(start,end)+'return read;');
 let summary; try { summary=(await import('../functions/api/invoices/_summary.js')).registerSummary; } catch {}
 const handler=fn(async()=> '2026-10-20',x=>x,balanceOf,displayStatus,500,['invoice','quote','credit_note'],()=>true,()=>null,()=>null,JSON.parse,summary);
 const ins=sqlite.prepare("INSERT INTO invoice_docs(id,merchant,type,status,number,issue_date,due_date,customer,lines,totals,ttc_cents,created_ts,updated_ts) VALUES(?,?,'invoice','issued',?,'2026-09-01','2026-09-20','{}','[]','{}',1000,1,1)");
 for(let i=0;i<505;i++) ins.run('d'+i,'m','F'+i);
 ins.run('other','other','F-other');
 sqlite.prepare("INSERT INTO invoice_payments(id,merchant,doc_id,amount_cents,date,method,created_ts) VALUES('p','m','d0',300,'2026-10-03','cash',1)").run();
 sqlite.prepare("INSERT INTO invoice_payments(id,merchant,doc_id,amount_cents,date,method,created_ts) VALUES('p2','other','other',999,'2026-10-03','cash',1)").run();
 sqlite.exec("INSERT INTO invoice_payments(id,merchant,doc_id,amount_cents,date,method,created_ts) VALUES('old','m','d1',200,'2026-09-02','cash',1)");
 sqlite.exec("INSERT INTO invoice_docs(id,merchant,type,status,number,original_id,customer,lines,totals,ttc_cents,created_ts,updated_ts) VALUES('credit','m','credit_note','issued','AV1','d0','{}','[]','{}',100,1,1)");
 const out=await handler({db,merchant:'m'},new URL('https://local/api/invoices?summary=1'));
 assert.equal(out.summary?.outstanding,504400); assert.equal(out.summary.late,504400); assert.equal(out.summary.total,506); assert.equal(out.summary.paidMonth,300);
});
await test('invoices#1 stable sale pagination beyond 200 with tenant scope', async () => {
 const source=read('functions/api/invoice.js');
 const handler=Function('tenantFor','ensureInvoiceSchema','json','atob','btoa', source.slice(source.indexOf('export async function onRequestGet')).replace('export async','async')+';return onRequestGet;')(async()=> 'm',async()=>{},(x,status)=>({status:status||200,json:async()=>x}),atob,btoa);
 const ins=sqlite.prepare('INSERT INTO sale_invoices(merchant,seq,number,sale_id,snapshot,created_ts) VALUES(?,?,?,?,?,?)');
 for(let i=0;i<405;i++) ins.run('m',i+1,'F'+String(i).padStart(4,'0'),'s'+i,'{}',123);
 ins.run('other',1,'OTHER','other','{}',123);
 const seen=new Set(); let cursor='', pages=0;
 do { const response=await handler({request:new Request('https://local/api/invoice?merchant=m'+(cursor?'&cursor='+encodeURIComponent(cursor):'')),env:{DB:db}});
 const data=await response.json(); assert.equal(response.status,200); for(const r of data.invoices) {assert.ok(!seen.has(r.saleId));assert.notEqual(r.saleId,'other');seen.add(r.saleId);} cursor=data.nextCursor; pages++; assert.ok(pages<5);
 } while(cursor);
 assert.equal(seen.size,405); assert.equal(pages,3);
 const bad=await handler({request:new Request('https://local/api/invoice?merchant=m&cursor=garbage'),env:{DB:db}}); assert.equal(bad.status,400);
});
await test('invoices#0 rendered summary does not change when cached pages grow', async () => {
 const history=await import('../assets/invoicing/history.js');
 const registerStats={outstanding:504400,late:504400,paidMonth:300,waiting:505,lateCount:505,total:506};
 const box={}; const deps={T:()=>({}),esc:String,money:String,overlay:{querySelector:()=>box},stats:()=>history.stats({registerStats})};
 history.paintStats(deps); const before=box.innerHTML;
 assert.ok(before.includes('data-stat="docs">506'));
 deps.rowsFor=()=>Array(505).fill({balanceCents:1000}); history.paintStats(deps);
 assert.equal(box.innerHTML,before);
});
await test('invoices#1 sales tab loads the next server page into its register', async () => {
 const declaration=(await import('./live-declaration.cjs')).default;
 const body=declaration(read('assets/invoicing.js'),'loadMore');
 const execute=Function('api', 'cache', `let tab='sales', nextCursor={sales:'cursor'},loadingMore=false,refreshToken=1,overlay={}; const paintRegister=()=>{},paintAll=()=>{},toast=()=>{},errText=String,normRow=x=>x; ${body}; return loadMore().then(()=>({cache,nextCursor}));`);
 const result=await execute(async(method,p)=>{assert.equal(p.cursor,'cursor');return {invoices:[{saleId:'next',snapshot:{number:'F2',issuedTs:2}}],nextCursor:null};},{sales:[{saleId:'first',number:'F1'}]});
 assert.equal(result.cache.sales.length,2); assert.equal(result.cache.sales[1].number,'F2'); assert.equal(result.nextCursor.sales,null);
});
if(failures) process.exitCode=1;
