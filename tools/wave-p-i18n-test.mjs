import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), read=p=>fs.readFileSync(p,'utf8');
const job=process.argv[2];
if(!job||job==='identity'){
 const I=require('../assets/stock-identity.js');
 assert.equal(I.fold('أَلْفَة إ آ ؤ ئ ى ة'),'الفه ا ا و ي ي ه');
 assert.equal(I.fold('Crème fraîche 12'),'creme fraiche 12');
 assert.equal(I.fold('Crème ø ß Æ'),'creme');
 const oldFold=v=>v.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 for(const name of ['Crème fraîche','Œuf','Café 12','Øresund','Straße']) assert.equal(I.fold(name),oldFold(name));
 const rows=[{name:'دقيق',unit:'kg'},{name:'سكر',unit:'kg'}];
 assert.equal(I.resolve({name:'دَقِيق'},rows)?.name,'دقيق');
 const ids=I.ensureRows(rows);assert.notEqual(ids[0].id,ids[1].id);
 assert.equal(I.ensureRows([...rows].reverse())[1].id,ids[0].id);
 assert.equal(I.resolve({name:'دقيق'},[rows[0],{name:'دَقِيق',unit:'g'}]),null);
 assert.equal(I.resolve({stockId:'chosen',name:'دقيق'},[{id:'chosen',name:'دقيق'},rows[0]])?.id,'chosen');
 assert.equal(I.resolve({name:'Creme'},[{name:'Crème'},{name:'Creme'}]),null);
 assert.equal(I.bindRecipe({ingredients:[{name:'سُكّر'}]},rows).ingredients[0].stockId,ids[1].id);
 console.log('✓ identity Arabic normalization, stable Latin, ambiguity and recipe binding');
}
if(!job||job==='console'){
 const s=read('assets/admin-workspace.js');
 for(const lang of ['fr','en','ar']){
  const ctx=vm.createContext({window:{KiwiAdminPolicy:{},KiwiOperator:{},KiwiAdminI18n:{lang}},document:{getElementById(){return {};},documentElement:{lang,dir:lang==='ar'?'rtl':'ltr'}},Intl,URLSearchParams,location:{search:''},localStorage:{getItem(){return lang;}}});
  vm.runInContext(s.slice(0,s.indexOf('  function client('))+';globalThis.result={labels,tabs,routes,date:date(1793016000000)};})();',ctx);
  assert.equal(ctx.result.labels.open,{fr:'À faire',en:'To do',ar:'للإنجاز'}[lang]);
  assert.equal(ctx.result.tabs.summary,{fr:'Synthèse',en:'Summary',ar:'ملخص'}[lang]);
  assert.equal(ctx.result.date,new Date(1793016000000).toLocaleString({fr:'fr-FR',en:'en-GB',ar:'ar-MA'}[lang],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}));
 }
 console.log('✓ console selected-language labels, routes and dates');
}
if(!job||job==='economat'){
 const s=read('assets/hotel-economat-requests.js'), when=s.slice(s.indexOf('  function when('),s.indexOf('  /* « req'));
 const originalTZ=process.env.TZ;
 try {
  for(const device of ['America/Los_Angeles','Asia/Tokyo']){
   process.env.TZ=device;
   let zone='Africa/Casablanca', lang='en', constructions=0;
   const w={KiwiDayReport:{timezone:slug=>{assert.equal(slug,'hotel');return zone;}},KiwiZoneLaw:{DateTimeFormat:function(l,o){constructions++;assert.ok(o.timeZone);return new Intl.DateTimeFormat(l,o);}}};
   const ctx=vm.createContext({window:w,Intl,lang:()=>lang,timeFmt:{},merchant:()=> 'hotel',Date});
   vm.runInContext(when+';globalThis.format=when',ctx);
   const expected=(z,l='en-GB')=>new Intl.DateTimeFormat(l,{timeZone:z,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(1793057400000));
   assert.equal(ctx.format(1793057400000),expected(zone));
   ctx.format(1793057400000);assert.equal(constructions,1,'formatter cached for locale and zone');
   zone='Asia/Tokyo';assert.equal(ctx.format(1793057400000),expected(zone));
   lang='ar';assert.equal(ctx.format(1793057400000),expected(zone,'ar-MA'));
   zone='';assert.equal(ctx.format(1793057400000),expected('Africa/Casablanca','ar-MA'));
   delete w.KiwiDayReport;w.KiwiVenue={getCurrentVenueData:()=>({timeZone:'Europe/Paris'})};
   assert.equal(ctx.format(1793057400000),expected('Europe/Paris','ar-MA'));
   w.KiwiVenue.getCurrentVenueData=()=>({timezone:'invalid-zone'});
   assert.equal(ctx.format(1793057400000),expected('Africa/Casablanca','ar-MA'));
   assert.equal(ctx.format('invalid'), '');
  }
 }finally{if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ;}
 console.log('✓ economat explicit hotel zone and zone law formatter');
}
if(!job||job==='console'){
 const source=read('assets/admin-workspace.js');
 const policy=require('../assets/admin-policy.js');
 for(const lang of ['fr','en','ar']){
  const elements=new Map();const element=()=>({innerHTML:'',hidden:false,contains:()=>false,querySelector:()=>null});
  let dialog;
  const document={documentElement:{lang,dir:lang==='ar'?'rtl':'ltr'},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll:()=>[],activeElement:null,body:{appendChild(el){dialog=el;}},createElement(){return {innerHTML:'',setAttribute(){},querySelector(selector){return selector==='[name="outcome"]'?null:{};},addEventListener(){},showModal(){}};}};
  const window={KiwiAdminPolicy:policy,KiwiOperator:{},KiwiAdminI18n:{lang}};
  const context=vm.createContext({window,document,Intl,Date,crypto:{randomUUID:()=> 'test-id'}});
  vm.runInContext(source.slice(0,source.indexOf("  document.addEventListener('click'"))+`;window.test={state,copy,L,policyText,today,fleet,dossierView,taskDialog,day,ago};})();`,context);
  const t=window.test, sources=Object.fromEntries(['quarantine','bridges','print','errors','support','integrations','caisseSync','shopify','shopifyLink','receivables','unpaidTables','zChecks','conflicts','tenantGuard','discountPolicy','activity','board','tasks','notes','events'].map(k=>[k,{available:true,rows:[]}]));
  const merchant={merchant:'fixture',business:'Établissement',type:'hotel',city:'Rabat',store_status:'active',plan:'pro',last_ts:Date.now(),today_amount:10};
  Object.assign(t.state,{live:true,clients:[merchant],merchant:'fixture',data:{sources,now:Date.now(),actor:{id:'test'}}});
  const today=t.today();assert.ok(today.includes({fr:'Votre file de travail',en:'Your work queue',ar:'قائمة عملك'}[lang]));
  assert.ok(today.includes({fr:'État des établissements',en:'Store health',ar:'حالة المؤسسات'}[lang]));
  assert.ok(today.includes('>Établissement</button>'),'merchant-authored label is untouched');
  const fleet=t.fleet('fixture');assert.ok(fleet.includes({fr:'Synchronisation financière des caisses',en:'Till financial sync',ar:'المزامنة المالية للصناديق'}[lang]));
  t.state.tab='summary';t.dossierView();assert.ok(elements.get('op-dossier-summary').innerHTML.includes({fr:'Note interne',en:'Internal note',ar:'ملاحظة داخلية'}[lang]));
  await t.taskDialog();assert.ok(dialog.innerHTML.includes({fr:'Prochaine étape',en:'Next step',ar:'الخطوة القادمة'}[lang]));assert.ok(dialog.innerHTML.includes({fr:'Enregistrer',en:'Save',ar:'حفظ'}[lang]));
  assert.ok(dialog.innerHTML.includes({fr:'Sans responsable',en:'Unassigned',ar:'بدون مسؤول'}[lang]));
  await t.taskDialog({id:'task',version:1,title:'Note interne',merchant:'fixture',status:'open'});
  assert.ok(dialog.innerHTML.includes('>Note interne</p>'),'persisted task content is untouched');
  assert.ok(dialog.innerHTML.includes({fr:'Résultat / preuve (requis pour résoudre)',en:'Outcome / evidence (required to resolve)',ar:'النتيجة / الدليل (مطلوب للحل)'}[lang]));
  assert.equal(t.policyText('Échéance dans 3 j'),{fr:'Échéance dans 3 j',en:'Due in 3 days',ar:'الأجل خلال 3 أيام'}[lang]);
  assert.equal(t.L('<span data-label="État">Aujourd’hui</span>'),{fr:'<span data-label="État">Aujourd’hui</span>',en:'<span data-label="Status">Today</span>',ar:'<span data-label="الحالة">اليوم</span>'}[lang]);
  for(const [key,row] of Object.entries(t.copy))for(const l of ['fr','en','ar'])assert.ok(row[l]?.length,`${key}: ${l}`);
 }
 console.log('✓ console FR/EN/AR queue, health, diagnostics, dossier, task forms, policy copy and raw content');
}
