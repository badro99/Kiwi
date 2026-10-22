#!/usr/bin/env node
// Régression du 22 octobre : même zone IANA, deux versions de tzdata.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {declaration} from './js-declarations.cjs';
import {fixture} from './server-money-fixture.mjs';
import {businessBoundary,businessDate,merchantZone,merchantCutoff} from '../functions/api/_business-day.js';
import {onRequestPost as timezone} from '../functions/api/timezone.js';
import {tillToken,TILL_COOKIE} from '../functions/auth/_lib.js';
const ROOT=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const hostTZ=process.env.TZ,RealDate=Date,RealIntl=Intl,BASE=RealDate.parse('2026-10-22T04:45:00Z');
let epoch=BASE;
class Clock extends RealDate{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}}
function named(text,name){const match=new RegExp('(?:^|\\n)[ \\t]*(?:async\\s+)?(?:function\\s+'+name+'\\s*\\(|(?:const|let|var)\\s+'+name+'\\s*=)').exec(text);assert.ok(match,name);return declaration(text.slice(match.index).trimStart(),name);}
// Chrome >= tzdata 2026c : Casablanca est à UTC+0 depuis le 20 septembre.
// Node 24/tzdata 2026b : +01. Forcer les deux tables rend le témoin durable.
function intl(offset){function DTF(locale,opts){const original=opts?.timeZone||'Africa/Casablanca',mapped=original==='Africa/Casablanca'?{...opts,timeZone:offset?'Etc/GMT-1':'UTC'}:opts;const fmt=new RealIntl.DateTimeFormat(locale,mapped);const resolve=fmt.resolvedOptions.bind(fmt);fmt.resolvedOptions=()=>({...resolve(),timeZone:original});return fmt;}DTF.supportedLocalesOf=RealIntl.DateTimeFormat.supportedLocalesOf;return Object.assign(Object.create(RealIntl),{DateTimeFormat:DTF});}
const src=read('tools/sync-ledger-browser-test.mjs');
let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
async function scenario(f,at,{prepare=true,offset=0,part='boutique',closed=false}={}){
 epoch=at;await f.reset();f.sql.prepare('UPDATE merchant_config SET timezone=NULL,business_cutoff=NULL WHERE merchant=?').run(f.merchant);check(await merchantZone(f.env,f.merchant)==='Africa/Casablanca'&&await merchantCutoff(f.env,f.merchant)===5,'fresh store NULL settings resolve to Casablanca / 5');
 const cookie=`${TILL_COOKIE}=${await tillToken(f.env.AUTH_SECRET,f.merchant)}`,storage=new Map([['kiwiPaired','1'],['kiwiPairedVenue',JSON.stringify({merchant:f.merchant})]]),requests=[],jobs=[];
 let completed;const settled=new Promise(resolve=>completed=resolve);
 const ctx=vm.createContext({Date:Clock,Intl:intl(offset),console,Map,Set,Promise,location:{pathname:'/kiwi-caisse.html',search:''},navigator:{onLine:true,serviceWorker:{}},document:{readyState:'loading',addEventListener(){}},setInterval:()=>1,clearInterval(){},setTimeout:()=>0,CustomEvent:class{},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},PART:part,SALES:[],bqShift:{openedAt:at-30*3600000},IS_DEMO:false});ctx.window=ctx;ctx.addEventListener=()=>{};ctx.dispatchEvent=()=>{};
 const page={setViewport:async()=>{},setBypassServiceWorker:async()=>{},emulateTimezone:async z=>assert.equal(z,'Africa/Casablanca'),on(){},setDefaultTimeout(){},setDefaultNavigationTimeout(){},evaluateOnNewDocument:async(fn,...args)=>{ctx.args=args;new vm.Script('('+fn.toString()+')(...args)').runInContext(ctx);return{identifier:'clock'};}};
 if(prepare){new vm.Script(['BOUTIQUE_TRADING_AT','setClock','preparePage'].filter(n=>n!=='BOUTIQUE_TRADING_AT'||src.includes('const BOUTIQUE_TRADING_AT =')).map(n=>named(src,n)).join('\n')).runInContext(ctx);await ctx.preparePage({watch(){}},page);}
 const live={merchant:()=>f.merchant,saleIdFor:e=>e.id,canonicalSaleId:(_s,id)=>id};ctx.KiwiLive=live;ctx.KiwiCaissePairing={pairedVenue:()=>({merchant:f.merchant})};
 ctx.KiwiOffline={available:()=>true,enqueue:async(_channel,_scope,payload)=>{jobs.push({id:'job',leaseToken:'lease',payload});},claim:async()=>jobs.shift()||null,acknowledge:async()=>completed(),reject:async()=>completed()};
 ctx.fetch=async(url,opts)=>{assert.equal(url,'/api/z-reconciliation');const body=JSON.parse(opts.body),r=await f.call('z',body);requests.push({body,result:r});return new Response(JSON.stringify(r.body),{status:r.status,headers:{'Content-Type':'application/json'}});};
 for(const file of ['assets/day-report.js','assets/kit/business-day.js','assets/kit/ledger.js','assets/z-reconciliation.js'])new vm.Script(read(file),{filename:file}).runInContext(ctx);
 const R=ctx.KiwiDayReport;
 const cutoff=R.cutoff(f.merchant),zone=R.timezone(f.merchant),ts=ctx.Date.now();
 check(cutoff===5&&zone==='Africa/Casablanca','till keeps cutoff 5 / Casablanca');
 const tzRes=await timezone({env:f.env,request:new Request('https://kiwi.test/api/timezone',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({merchant:f.merchant,timeZone:zone,businessCutoff:cutoff})})});check(tzRes.status===200,'real timezone publisher accepts same zone/cutoff');
 const amounts=[24900,14900,33900,12900,14900,7000];
 for(const[i,amountCents]of amounts.entries()){
  const id='clock-sale-'+i,parts=i===2?[{m:'carte',amount:169},{m:'espèces',amount:170}]:i===5?[{m:'avoir',amount:149},{m:'espèces',amount:70}]:[{m:'espèces',amount:amountCents/100}],method=i===2||i===5?'split':'cash';
  const r=await f.call('sale',{id,ref:id,ts,amountCents,method,ticketAmountCents:parts.reduce((s,p)=>s+Math.round(p.amount*100),0),paymentParts:parts.map(p=>({method:p.m==='avoir'?'credit':p.m==='carte'?'card':'cash',amountCents:Math.round(p.amount*100)}))});check(r.status===200,'real sale handler accepts receipt');check(f.row(id).ts===ts,'server preserves original sale epoch');ctx.SALES.push({syncId:id,serverId:id,at:new ctx.Date(ts),parts});
 }
 const bq=read('assets/pos-boutique.js');new vm.Script(['BQ_SRV_METHOD','businessDayKey','isToday','bqPaymentParts','bqPaymentMethod','bqZJournal','bqZQueue'].map(n=>named(bq,n)).join('\n')).runInContext(ctx);
 const queued=await ctx.bqZQueue(closed);assert.ok(queued.ok,JSON.stringify(queued));await settled;
 const {body,result}=requests[0];check(result.status===200,'real Z POST responds successfully');check(body.count===6&&body.totalCents===108500,'real boutique + Z outbox send 6 / 108500 cents');check(body.cutoff===5,'Z explicitly carries 5, never legacy fallback or 6');
 const ledgerDay=ctx.KiwiLedger._businessDate(ts,5,zone);check(ledgerDay===body.day,'kit ledger and till name the same day');
 return{body,result:result.body,ts,tillDay:R.businessDay(ts),bounds:R.dayBounds(body.day),serverDay:businessDate(ts,5,await merchantZone(f.env,f.merchant)),serverBounds:{from:businessBoundary(body.day,5,await merchantZone(f.env,f.merchant)),to:businessBoundary(ctx.KiwiBusinessDay.addBusinessDays(body.day,1),5,await merchantZone(f.env,f.merchant))},cutoff:await merchantCutoff(f.env,f.merchant)};
}
process.env.TZ='Europe/Paris';globalThis.Date=Clock;globalThis.Intl=intl(1);
const f=await fixture(ROOT);
try{
 // La vraie route lit NULL puis Africa/Casablanca ; seule sa table ICU est simulée.
 const raw=await scenario(f,BASE,{prepare:false});
 assert.deepEqual([raw.tillDay,raw.serverDay],['2026-10-21','2026-10-22']);
 assert.deepEqual([raw.result.status,raw.result.serverCount,raw.result.serverCents,raw.result.missing.length,raw.result.mismatched.length],['mismatch',0,0,6,0]);checks++;
 assert.equal(raw.bounds.to,RealDate.parse('2026-10-22T05:00:00Z'));assert.equal(raw.serverBounds.to,RealDate.parse('2026-10-22T04:00:00Z'));checks+=2;
 console.log('✓ witness 04:45Z: till day 21 (ends 05Z), server day 22 (day 21 ends 04Z): 6 / 108500 versus 0 / 0, missing 6');
 for(const iso of ['2026-10-22T04:45:00Z','2026-10-22T03:50:00Z','2026-10-22T04:00:00Z','2026-10-22T04:59:59Z','2026-10-22T05:00:00Z']){
  const r=await scenario(f,RealDate.parse(iso));check(r.result.status==='matched'&&r.result.serverCount===6&&r.result.serverCents===108500&&r.result.missing.length===0,'prepared boutique trading hour reconciles at '+iso);check(r.tillDay===r.serverDay,'prepared day agrees at '+iso);
 }
 const aligned=await scenario(f,BASE,{prepare:false,offset:1});check(aligned.result.status==='matched','same tzdata on both sides matches without any clock pin');
 const close=await scenario(f,BASE,{closed:true});check(close.result.status==='matched'&&close.result.closed===true,'closing Z matches too');
 const restaurant=await scenario(f,BASE,{part:'resto'});check(restaurant.ts===BASE,'restaurant explicit-clock scenarios are not pinned');check(restaurant.result.status==='mismatch','raw tzdata skew remains visible, not patched in product');
 check(src.includes("if (PART === 'boutique') await setClock(page, BOUTIQUE_TRADING_AT);"),'browser suite reuses its existing clock helper');
 console.log(`✓ boutique clock: ${checks} checks; real DayReport, boutique journal, ledger, Z outbox, timezone, sale and Z handlers; no socket`);
}finally{f.close();globalThis.Date=RealDate;globalThis.Intl=RealIntl;if(hostTZ==null)delete process.env.TZ;else process.env.TZ=hostTZ;}
