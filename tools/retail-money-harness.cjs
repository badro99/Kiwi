// Real named declarations; browser/network/storage edges are explicit stubs.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sharedRules = require('./shared-rules-source.cjs');
const { declaration } = require('./js-declarations.cjs');
const KiwiMoney = require('../assets/money-cents.js');
const ROOT = process.env.KIWI_ROOT || path.resolve(__dirname, '..');
function source(file) {
  return fs.readFileSync(path.join(ROOT,file),'utf8').replace(/^(?:import .*;\n)+/,'').replace(/\nexport \{[^\n]+\};\n$/,'')
    .replace(/^[\s\S]*?\(function \(\) \{\s*['"]use strict['"];?/, '').replace(/\}\)\(\);\s*$/, '');
}
function load(c,file,names) { vm.runInContext(sharedRules(source(file))+'\n'+names.map(name=>declaration(source(file),name)).join('\n')+'\nObject.assign(globalThis,{'+names.join(',')+'});',c,{filename:file}); }
const TS=Date.parse('2026-10-22T12:00:00Z');
function world(vertical) {
  const prefix=vertical==='maison'?'mz':'bq', nodes=new Map(), storage=new Map(), timers=[], events=[];
  const no=()=>{};
  function element(attrs={}) {
    let html='';
    const el={...attrs,dataset:{},style:{},value:'',textContent:'',disabled:false,hidden:false,
      classList:{add:no,remove:no,toggle:no,contains:()=>true},focus:no,select:no,closest:()=>({classList:{contains:()=>true}})};
    Object.defineProperty(el,'innerHTML',{get:()=>html,set(value){html=String(value);if(el.isPanel)nodes.clear();
      for(const tag of html.matchAll(/<([\w-]+)\b([^>]*)>/g)){
        const child=element();child.tag=tag[1];
        for(const [,key,value]of tag[2].matchAll(/([\w-]+)="([^"]*)"/g)){
          child[key]=value;if(key.startsWith('data-'))child.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
        }
        if(/\bdisabled(?:\s|$)/.test(tag[2]))child.disabled=true;
        nodes.set(child.id||'node'+nodes.size,child);
      }
    }}); return el;
  }
  const panel=element({isPanel:true}), exchange=element({isPanel:true});
  const $=s=>s===`#${prefix}-paym`?panel:s===`#${prefix}-exchm`?exchange:nodes.get(s.replace(/^#/,''))||null;
  const $$=s=>{const m=/^\[([\w-]+)\]$/.exec(s);return m?[...nodes.values()].filter(n=>Object.hasOwn(n,m[1])):[];};
  class Clock extends Date { constructor(...args){super(...(args.length?args:[TS]));} static now(){return TS;} }
  const c=vm.createContext({console,Date:Clock,Math,Number,String,Array,Object,Map,Set,JSON,Promise,KiwiMoney,M:KiwiMoney,
    root:{},$, $$,setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout:no,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},navigator:{onLine:false},
    SALES:[],AVOIRS:[],P:{},state:{},STAFF:{caissiere:{name:'Test'}},bqOutstandingCents:0,
    renderEchanges:no,icons:no,openVeil:no,closeVeil:no,toast:no,persistDay:no,persistAvoirs:no,bqSaveProvisional:no,renderAll:no,
    creditIntent:()=> 'test-intent',IS_DEMO:true,activeAvoirs:()=>c.AVOIRS.filter(a=>a.balance>0),avoirExpired:()=>false,
    printReceiptNow:(...args)=>events.push(['print',...args]),fmtMAD:n=>String(n),fmtDayY:()=>'',fmtValidUntil:()=>'',esc:s=>String(s??''),
    sizesOf:()=>['TU'],merchantSlug:()=> 'test-shop',rayonOf:()=>'',lineDeal:ln=>({price:ln.promoPrice}),
    depotOn:()=>false,artOf:()=>'',colorDot:()=>'',colorLabel:()=>'',saleClient:()=>({id:'customer',name:'Test'}),
    findSale:id=>c.SALES.find(s=>s.id===id),newSaleId:()=> 'new-sale',
  });c.window=c;c.KiwiLive={saleIdFor:({id})=>id};
  const core=`assets/pos-${vertical}.js`, checkout=`assets/pos-${vertical}/checkout.js`;
  load(c,`assets/pos-${vertical}/sales.js`,['shelf']);
  load(c,core,['lineBase','lineUnit','lineTotal','rewardDiscount',...(vertical==='maison'?['isConsigned','consignedOf']:[]),'ticketTotals',
    'RETAIN_DAYS','srvMethod','remoteLine',...(vertical==='boutique'?['remoteMoney']:[]),'syncReturnSales','bqLineTotals','bqFoldBasket','BQ_SRV_METHOD','bqPaymentParts','bqPaymentMethod','originalSalePayload',
    'businessDayKey','isToday','salesToday','notCashedOf',...(vertical==='maison'?['cashedOf']:[]),'caToday','bqMoneyParts','bqDayTotals','bqZJournal']);
  load(c,checkout,['lineReturnedQty','lineAvailableQty','pickedQty','markLineReturned','returnRatio','paidUnit','doAvoir','openExchSummary','openPay',...(vertical==='boutique'?['recordDeliveryCash']:[])]);
  const api={c,prefix,nodes,storage,timers,events,panel,exchange,$,$$};
  api.start=(amount,extra={})=>{api.receipts=[];timers.length=0;c.openPay({title:'Test',subtitle:'Test',amount,customerId:'customer',sale:{id:'sale'},
    onPaid:(parts,meta)=>{api.receipts.push({parts:JSON.parse(JSON.stringify(parts)),meta});return {};},...extra});};
  api.click=s=>{const el=$(s);if(!el||typeof el.onclick!=='function')throw Error('Missing button '+s);if(!el.disabled)el.onclick();};
  api.part=(amount,method='cash',given=amount)=>{
    const input=$(`#${prefix}-split-in`);if(input){input.value=String(amount);input.oninput();}
    const m=$$(`[data-${prefix}-m]`).find(n=>n.dataset[prefix+'M']===(method==='cash'?'especes':method==='card'?'carte':method));
    if(!m)throw Error('Missing tender '+method);m.onclick();
    if(method==='cash'){const n=$(`#${prefix}-cash-in`);n.value=String(given);n.oninput({target:n});api.click(`#${prefix}-cash-ok`);}
    else if(method==='card'){while(timers.length)timers.shift()();api.click(`#${prefix}-card-ok`);}
    else if(method==='virement'||method==='cheque')api.click(`#${prefix}-external-ok`);
  };
  api.voucher=code=>{const m=$$(`[data-${prefix}-m]`).find(n=>n.dataset[prefix+'M']==='avoir');m.onclick();const input=$(`#${prefix}-av-code`);input.value=code;$(`#${prefix}-av-code-form`).onsubmit({preventDefault:no});};
  return api;
}
module.exports={world,load,source,TS};
