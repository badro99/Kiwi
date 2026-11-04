#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=fs.readFileSync(path.join(root,'assets/day-report-export.js'),'utf8');
const layoutSrc=fs.readFileSync(path.join(root,'assets/design-vexel-layout.js'),'utf8');
const interactiveSrc=coreTestSource.readFileSync(path.join(root,'assets/interactive.js'),'utf8');
let pass=0;function ok(v,msg){if(!v)throw new Error(msg);pass++;}
const ctx={console,setTimeout:function(){},window:{},document:{},Blob:function(){},URL:{}};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(src,ctx);
const X=ctx.KiwiDayReportExport;
ok(X&&X.kinds.length===10,'ten selectable factual sections');
['sales','materials','margins','team','stock','reservations'].forEach(id=>ok(X.kinds.some(x=>x.id===id),'section '+id));
ctx.KiwiDayReport={timezone:()=> 'Africa/Casablanca',dayBounds:()=>({from:1000,to:2000})};
ctx.KiwiSales={list:()=>[{ts:1500,ref:'T-1',amount:100,method:'cash',channel:'salle',cashier:'Sara',lines:[{itemId:'p1',name:'Tajine',cat:'Plats',qty:2,total:100}]}]};
ctx.KiwiCost={of:()=>({mad:20,src:'recipe'}),netOf:n=>n,basis:()=>({}),doc:()=>({recipes:{},ingredients:[]})};
ctx.KiwiTeam={daySnapshot:()=>[{name:'Sara',role:'Serveuse',plannedStart:'12:00',plannedEnd:'20:00',plannedHours:8,workedHours:7.5}]};
ctx.KiwiInventory={between:()=>[{occurredTs:1500,itemId:'ing1',qty:-2,reason:'sale'}]};
ctx.KiwiReservations={get:()=>({bookings:[],services:[],resources:[]})};
const report={day:'2026-08-13',store:{slug:'amira-cafe',name:'Amira Cafe'},closed:true,source:'caisse',net:100,gross:100,txns:1,basket:100,coverage:100,methods:{cash:100},cash:{opening:200,sales:100,expected:300,counted:300,ecart:0,movements:[]},cashiers:[{name:'Sara',net:100,txns:1}],categories:[],handovers:[],revisions:[]};
const csv=X.build(report,{summary:true,sales:true,products:true,margins:true,team:true,stock:true});
ok(csv.includes('VENTES DÉTAILLÉES'),'sales detail exported');
ok(csv.includes('CONTRÔLE')&&csv.includes('Rapproché'),'ticket ledger reconciled against closure');
ok(csv.includes('MARGES PAR ARTICLE'),'margin section exported');
ok(csv.includes('60'),'measured margin exported');
ok(csv.includes('Sara')&&csv.includes('7.5'),'historical worked hours exported');
ok(csv.includes('MOUVEMENTS DE STOCK')&&csv.includes('ing1'),'stock movements exported');
ctx.KiwiCost.of=()=>({mad:null,src:null});
const missing=X.build(report,{margins:true,materials:true});
ok(missing.includes('Non chiffré'),'unknown cost is explicit');
ok(missing.split('\r\n').some(line=>line.includes('Tajine')&&(line.match(/Non chiffré/g)||[]).length>=2), 'unknown cost does not fabricate a margin');
ok(src.includes("/^[\\t\\r ]*[=+\\-@]/"),'spreadsheet injection guard retained');
ok(src.includes("['service','tip','tax','payment','class','pt']"),'non-stock service lines excluded from material coverage');
const html=X.reportHtml(report,{summary:true,sales:true,margins:true,team:true,stock:true});
ok(html.includes('RAPPORT JOURNALIER DÉTAILLÉ')&&html.includes('kr-hero'),'branded printable report generated');
ok(html.includes('@page{size:A4')&&html.includes('@media print'),'A4 print layout retained');
ok(html.includes('Ventes détaillées')&&html.includes('Marges par article'),'selected sections rendered into report');
ok(html.includes('Fiabilité des données')&&!html.includes('## SYNTHÈSE'),'client report uses visual hierarchy, not CSV markers');
ok(src.includes('Rapport professionnel · PDF')&&src.includes('Données brutes · CSV'),'professional report is default and raw data remains explicit');
ctx.KiwiDayReport.storeSlug=()=> 'amira-cafe';
ctx.KiwiDayReport.today=()=> '2026-08-13';
ctx.KiwiDayReport.load=()=> null;
ctx.KiwiDayReport.build=(opts)=>Object.assign({},report,{day:opts.day,store:opts.store,gross:opts.sales.reduce((n,s)=>n+s.amount,0),txns:opts.sales.length});
ctx.KiwiDayReport.categoryIndex=()=>({});
ctx.KiwiVenue={getCurrentVenueData:()=>({name:'Amira Cafe',slug:'amira-cafe',type:'restaurant'}),getCurrentVenue:()=> 'v-amira-cafe'};
const current=X.resolveCurrent();
ok(current&&current.day==='2026-08-13'&&current.store.name==='Amira Cafe','home CTA resolves the current business day and venue');
ok(current.gross===100&&current.txns===1&&current.live===true,'home CTA derives its report from the real current sales ledger');
ok(layoutSrc.includes("button.dataset.action = 'day-report-export'"),'prominent home CTA uses the dedicated report action');
ok(interactiveSrc.includes("'day-report-export': (el) =>")&&interactiveSrc.includes('api.openCurrent(el)'),'dashboard router opens the shared configurable composer');
/* r18 dayreport#1 : le CSV suit la langue de l'interface (FR/EN/AR), titres, statuts
   et explications de donnée absente comprises. */
{
  const every=Object.keys(X.csvDictionary.en);
  ok(every.length>120&&Object.keys(X.csvDictionary.ar).length===every.length,'EN and AR dictionaries cover the same wording');
  const cells=text=>{const out=[];text.split('\r\n').forEach(line=>{line.replace(/"((?:[^"]|"")*)"/g,(_,v)=>{out.push(v.replace(/""/g,'"'));return '';});});return out;};
  const all={summary:true,sales:true,payments:true,products:true,materials:true,margins:true,team:true,stock:true,reservations:true,adjustments:true};
  const rich=Object.assign({},report,{closedAt:1500,closedBy:'Sara',openedBy:'Sara',openedAt:1100,refunds:{amount:10,count:1},discounts:{amount:5,count:2},cancels:{count:1},handovers:[{from:'Sara',to:'Nour',ecart:0,ts:1600}],cashiers:[{name:'Sara',net:100,txns:1},{name:'Inès',net:0,txns:0}]});
  const sparse={};
  for(const lang of ['en','ar']){
    ctx.KiwiI18n={getLang:()=>lang};
    for(const [label,rep,seed] of [['data',rich,true],['no data',Object.assign({},report,{methods:{},cashiers:[]}),false]]){
      if(seed){
        ctx.KiwiCost.of=()=>({mad:20,src:'vente'});
        ctx.KiwiInventory={between:()=>[{occurredTs:1500,itemId:'ing1',qty:-2,reason:'waste',refType:'breakage',refId:'r1'}]};
        ctx.KiwiReservations={get:()=>({bookings:[{startAt:1500,customer:{name:'Karim'},partySize:2,status:'no_show',source:'public',serviceId:'s',resourceId:'r'}],services:[{id:'s',name:'Dîner'}],resources:[{id:'r',name:'Table 4'}]})};
        ctx.KiwiSales={list:()=>[{ts:1500,ref:'T-1',amount:100,method:'cash',channel:'salle',cashier:'Sara',lines:[{itemId:'p1',name:'Tajine',cat:'Plats',qty:2,total:100}]}]};ctx.KiwiTeam={daySnapshot:()=>[{name:'Sara',role:'Ouverture',plannedStart:'12:00',plannedEnd:'20:00',plannedHours:8,workedHours:7.5}]};
      }
      if(!seed){ctx.KiwiSales={list:()=>[]};ctx.KiwiTeam={daySnapshot:()=>[]};ctx.KiwiInventory={between:()=>[]};ctx.KiwiReservations={get:()=>({bookings:[],services:[],resources:[]})};ctx.KiwiCost.of=()=>({mad:null,src:null});}
      const csv=X.build(rep,all), got=cells(csv);
      const dict=X.csvDictionary[lang];
      const leaked=every.filter(k=>dict[k]!==k&&(got.includes(k)||got.includes('## '+k)));
      ok(leaked.length===0,lang+' '+label+': no French heading, status or explanation is left ('+leaked.slice(0,4).join(' | ')+')');
      ok(got.includes('## '+dict['VENTES DÉTAILLÉES'])&&got.includes('## '+dict['MARGES PAR ARTICLE'])&&got.includes('## '+dict['ÉQUIPE & HEURES']),lang+' '+label+': section titles in the UI language');
      if(!seed){
        ['Détail des tickets indisponible dans le grand livre pour cette journée. Les agrégats de clôture restent disponibles.','Aucun détail produit disponible.','Aucune matière dérivable : aucune fiche technique complète reliée aux ventes détaillées.','Aucune présence, heure réalisée ou responsabilité tracée pour cette journée.','Aucun mouvement de stock enregistré pour cette journée.','Aucune réservation enregistrée pour cette journée.'].forEach(k=>ok(got.includes(dict[k]),lang+': missing-data explanation translated · '+dict[k].slice(0,40)));
      } else {
        ok(got.includes(lang==='en'?'No-show':'لم يحضر')&&got.includes(lang==='en'?'Online':'عبر الإنترنت'),lang+': reservation status and source in the UI language');
        ok(got.includes(dict['Casse / perte'])&&got.includes(dict['casse']+' · r1'),lang+': stock reason and reference type in the UI language');
        ok(got.includes('Tajine')&&got.includes('Sara')&&got.includes('Karim')&&got.includes('Table 4'),lang+': merchant data is never translated');
      }
    }
  }
  ctx.KiwiI18n={getLang:()=> 'fr'};
  ctx.KiwiSales={list:()=>[]};
  const fr=X.build(report,{products:true,sales:true});
  ok(fr.includes('Aucun détail produit disponible.')&&fr.includes('ARTICLES VENDUS'),'FR stays French');
}
console.log(`✓ day-report export builder (${pass} controls)`);
