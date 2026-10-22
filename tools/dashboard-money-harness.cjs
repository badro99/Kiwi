// Real named declarations plus complete namespace initialization for private caches.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {declaration}=require('./js-declarations.cjs');
const ROOT=process.env.KIWI_ROOT||path.resolve(__dirname,'..'),texts=new Map();
function read(file){if(!texts.has(file))texts.set(file,fs.readFileSync(path.join(ROOT,file),'utf8'));return texts.get(file);}
function body(file,index=0){const sections=read(file).split(/^(?:\(function \(\) \{|\(\(\) => \{)/m);if(sections.length===1)throw Error('Missing wrapper '+file);const part=sections[index+1];return part.slice(0,part.lastIndexOf('})();'));}
function load(c,file,names,index=0){const s=body(file,index);vm.runInContext(names.map(n=>declaration(s,n)).join('\n')+'\nObject.assign(globalThis,{'+names.join(',')+'});',c,{filename:file});}
const formatters=new Map();function CachedFormat(locales,options){const key=JSON.stringify([locales,options]);if(!formatters.has(key))formatters.set(key,new Intl.DateTimeFormat(locales,options));return formatters.get(key);}
CachedFormat.supportedLocalesOf=Intl.DateTimeFormat.supportedLocalesOf;
function world(zone='UTC'){
 const state={zone,now:Date.parse('2026-10-22T12:00:00Z'),scope:'scoped@property-shop'},storage=new Map(),events=[],requests=[];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[state.now]));}static now(){return state.now;}}
 const no=()=>{},window={addEventListener:no,dispatchEvent:no,KiwiConfig:{timezone:zone,type:'boutique'},
   KiwiVenue:{getVenue:()=> 'scoped',isCustom:()=>true,getCurrentVenueData:()=>({id:'scoped',slug:'property-shop',type:'boutique',timezone:state.zone}),getVenueType:()=> 'boutique'},KiwiEnv:{isReal:()=>true},KiwiLive:{merchant:()=> 'property-shop'}};
 const common={console,window,Date:Clock,Intl:{...Intl,DateTimeFormat:CachedFormat,NumberFormat:Intl.NumberFormat},Math,Number,String,Object,Array,Map,Set,JSON,URL,URLSearchParams,
   localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
   document:{addEventListener:no,dispatchEvent:e=>events.push(e),querySelector:()=>({})},location:{pathname:'/dashboard.html',search:''},
   navigator:{onLine:true},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail;}},setTimeout:no,clearTimeout:no,setInterval:no};
 const report=vm.createContext({...common});vm.runInContext(body('assets/day-report.js'),report);
 // Execute named entrypoints in the initialized scope, preserving their helpers.
 load(report,'assets/day-report.js',['businessDay','dayBounds','build']);window.KiwiDayReport.businessDay=report.businessDay;window.KiwiDayReport.dayBounds=report.dayBounds;window.KiwiDayReport.build=report.build;
 const store=vm.createContext({...common,currentVenue:'scoped',TRANSIENT_IDS:['own','scoped'],slugOf:()=> 'property-shop',ledgerCache:new Map(),salesSubs:new Set(),refundSubs:new Set()});
 load(store,'assets/venues.js',['salesTenant','SALES_KEY','deepFreeze','cachedLedger','salesList','salesWrite','salesEntry','salesAdd','salesAddMany','annotatedEntry','salesAnnotateMany','salesRemove','salesRetainCursors','REFUNDS_KEY','refundsList','refundsWrite','refundsAdd','refundsRetainCursors','refundsRemove']);
 window.KiwiSales={list:store.salesList,add:store.salesAdd,addMany:store.salesAddMany,remove:store.salesRemove,annotateMany:store.salesAnnotateMany,retainCursors:store.salesRetainCursors,scope:()=>state.scope};window.KiwiRefunds={list:store.refundsList,add:store.refundsAdd,remove:store.refundsRemove,retainCursors:store.refundsRetainCursors};
 const history=vm.createContext({...common,fetch:(...args)=>{requests.push(args);return common.fetch(...args);}});
 vm.runInContext(read('assets/sales-history.js'),history);
 // Named copies are checked against the actual exported closure, never substituted.
 for(const [index,namespace,names]of [[0,'KiwiSalesMath',['statsFromSales','statsFromSummary']],[1,'KiwiSalesSummary',['coverageStart','get','stats']],[2,'KiwiSalesWindow',['fetchRaw']],[3,'KiwiSalesReconcile',['retain','reconcile','verify']]])
   for(const name of names){const named=declaration(body('assets/sales-history.js',index),name);if(window[namespace][name].toString()!==named)throw Error('Named source mismatch '+namespace+'.'+name);}
 const bridge=vm.createContext({...common,merchant:()=> 'property-shop',feedSales:[],feedSeen:{},feedComplete:{},moneySignal:no,voidedRefs:[],voidedIds:[],voidedEvents:[]});
 load(bridge,'assets/live-link.js',['accumulateFeed','bridgeToStore','applyVoids']);
 const c=vm.createContext({...common,getCurrentVenue:()=> 'scoped',currentRange:'septJours',customRange:null,
   frInt:String,getLang:()=> 'fr',getSim:()=>null,ownData:()=>true,isLiveDemo:()=>false,guardOperatorFigures:()=>false,
   kpiByVenue:{},vData:()=>({tx:{},panier:{}}),KPI_DELTA_SUFFIX:{fr:{}},screenBook:()=>null,realGrossProfit:()=>null});
 load(c,'assets/dateRange.js',['DEFAULT_MERCHANT_TZ','z2','dateToIso','RANGE_DAYS','DAY_ABBR','salesMath','tenderBucket','tenderAmounts','deliveryDue',
   'activeMerchantSlug','merchantTimeZone','merchantParts','addMerchantDays','merchantBoundary','merchantDayKey','merchantDayBounds','dayCutoffH','dayStartMs','realSalesList','realRefundList','realMoneyList','calendarStartKey','calendarBounds','rangeBounds','closedBounds','shiftedBusinessBounds','realWindowStats','realSalesTotals','windowDays','realClientMix','realDeltaPct','halfUpDiv','deltaTenths','basketCents','niceCeil','hourlyCumul','dailyTotals','realRevSeries','renderKpiBand']);
 let tiles;const stop={};Object.defineProperty(c,'lastBand',{set(v){tiles=v;throw stop;},configurable:true});
 vm.runInContext(read('assets/channel-sales.js'),vm.createContext(common));
 const channel=vm.createContext({...common,realSession:()=>true,activeTrade:()=> 'boutique'});
 // This file is a root-parameter IIFE; its function remains extracted by name.
 const channelSource=read('assets/design-vexel-layout.js').replace(/^[\s\S]*?\(function[^\n]*\{/, '').replace(/\}\)\([^]*$/,'');
 vm.runInContext(declaration(channelSource,'channelAmounts'),channel);
 window.KiwiDateRange={bounds:()=>c.rangeBounds(c.currentRange)};
 function reset(){window.KiwiSalesSummary.invalidate('property-shop');window.KiwiSalesWindow.invalidate('property-shop');storage.clear();requests.length=0;bridge.feedComplete={};bridge.feedSales=[];bridge.feedSeen={};store.ledgerCache.clear();}
 function ingest(rows){bridge.accumulateFeed(rows,'property-shop');bridge.bridgeToStore();bridge.applyVoids(rows.filter(r=>r.voided).map(r=>({c:r.cursor,i:r.id,ts:r.ts,vts:r.ts+1})),'property-shop');}
 return{c,window,report,store,bridge,history,state,storage,requests,reset,ingest,
   set(zone,now){state.zone=zone;state.now=now;window.KiwiConfig.timezone=zone;},
   tiles(range){c.currentRange=range;try{c.renderKpiBand();}catch(e){if(e!==stop)throw e;}return tiles.data;},
   channels:()=>channel.channelAmounts([{id:'counter'},{id:'delivery'},{id:'pickup'}]),
   fetch(fn){common.fetch=fn;history.fetch=(...args)=>{requests.push(args);return fn(...args);};},
 };
}
module.exports={world,load,read,body};
