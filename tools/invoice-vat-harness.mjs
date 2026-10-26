import invoicingSourceHelper from './invoicing-test-source.cjs';
// Les déclarations réelles, les entrées/sorties du navigateur seulement simulées.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import sharedRules from './shared-rules-source.cjs';
import {declaration} from './js-declarations.cjs';
import {fixture} from './server-money-fixture.mjs';
import {makeSession,SESS_COOKIE} from '../functions/auth/_lib.js';
import {onRequestPost as invoices} from '../functions/api/invoices.js';
import {onRequestPost as invoice} from '../functions/api/invoice.js';
export const ROOT=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..');
export const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
export function named(text,name){text=text.replace(/^[ \t]*\/\* GENERATED SHARED (Kiwi\w+) BEGIN \*\/[\s\S]*?^[ \t]*\/\* GENERATED SHARED \1 END \*\//gm,'');const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=new RegExp('(?:^|\\n)[ \\t]*(?:async\\s+)?(?:function\\s+'+escaped+'\\s*\\(|(?:const|let|var)\\s+'+escaped+'\\s*=)').exec(text);if(!m)throw Error(name);return declaration(text.slice(m.index).trimStart(),name);}
export function declarations(file,names,stubs={}){const text=file==='assets/invoicing.js'?invoicingSourceHelper.invoicingTestSource(ROOT):read(file),c=vm.createContext({...stubs});c.window=c;new vm.Script(sharedRules(text)+'\n'+names.map(n=>named(text,n)).join('\n')).runInContext(c);return c;}
export function clients(){
 const preview=declarations('assets/invoicing.js',['lineHT','computeTotals','totalsBlock','printable'],{Math,Number,BigInt,Map,document:{baseURI:'https://kiwi.test/'},T:()=>new Proxy({totalHT:'HT',totalTTC:'TTC',vatOn:'TVA {rate} {base}'},{get:(o,k)=>o[k]||String(k)}),esc:String,money:c=>(c/100).toFixed(2),tpl:(s,o)=>s.replace(/\{(\w+)\}/g,(_,k)=>o[k]),lang:()=> 'fr',dmy:String,termsText:()=>'',renderSellerLogo:()=>'',businessName:()=> 'Fixture',getSeller:()=>({name:'Fixture'})});
 const sale=declarations('assets/invoice.js',['round2','validIce','build'],{Math,Number,Date,JSON,String,getSellerBusiness:()=>({name:'Fixture'}),getTvaRate:()=>20});
 const r=vm.createContext({console,Intl,Date,Math,Number,Map,Set,URL,localStorage:{getItem:()=>null},document:{readyState:'loading',addEventListener(){},querySelector:()=>null},setTimeout:()=>0,clearTimeout(){}});r.window=r;r.addEventListener=()=>{};new vm.Script(read('assets/receipt.js')).runInContext(r);
 const nodes=new Map(),$=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}}});return nodes.get(s);};
 const legacy=declarations('assets/caisse-accounting.js',['renderReceipt'],{$,Date,Math,Array,String,currentCashier:{name:'Fixture'},receiptDocFor:()=>null,storeIsReal:()=>true,storeName:()=> 'Fixture',storeCity:()=>'',escTeam:String,fmtMAD:n=>Number(n).toFixed(2)+' MAD'});
 return{preview,sale,receipt:r.KiwiReceipt,legacy,legacyTotals(cents){legacy.renderReceipt({amount:cents/100,time:new Date(),ref:'r',label:'Table',method:'cash'});const out={};for(const m of $('#receipt-body').innerHTML.matchAll(/<span class="rct-tot-k">([^<]+)<\/span><span class="rct-tot-v">([^<]+)<\/span>/g))out[m[1]]=Math.round(Number(m[2].replace(/[^0-9.,+-]/g,'').replace(',','.'))*100);return out;}};
}
export async function server(){
 const f=await fixture(ROOT),cookie=`${SESS_COOKIE}=${await makeSession('money-owner',f.env.AUTH_SECRET)}`;
 async function call(body,sale=false){const request=new Request('https://kiwi.test/api/'+(sale?'invoice':'invoices'),{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({merchant:f.merchant,...body})});const r=await(sale?invoice:invoices)({request,env:f.env});return{status:r.status,body:await r.json()};}
 async function reset(){await f.reset();f.sql.exec('DELETE FROM invoice_payments; DELETE FROM invoice_docs; DELETE FROM invoice_series;');}
 async function draft(lines,extra={}){return call({action:'save',type:'invoice',customer:{name:'Client'},exemptionMention:'Fixture exemption',lines,...extra});}
 // Deux lectures de pré-vol terminées avant le premier lot transactionnel.
 async function race(work){const orig=f.DB.batch,waiters=[];let seen=0,timer;f.DB.batch=function(stmts){if(seen++>=2)return orig.call(this,stmts);return new Promise((resolve,reject)=>{waiters.push(()=>Promise.resolve(orig.call(f.DB,stmts)).then(resolve,reject));if(seen===2){clearTimeout(timer);waiters.forEach(fn=>queueMicrotask(fn));}});};try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Invoice race barrier not reached')),5000);})]);}finally{clearTimeout(timer);f.DB.batch=orig;}}
 return{...f,call,reset,draft,race};
}
