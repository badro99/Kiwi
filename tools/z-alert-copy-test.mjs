#!/usr/bin/env node
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/z-reconciliation.js',import.meta.url),'utf8');
const storage=new Map();let checks=0;
function instance(lang,summary){const toasts=[],window={KiwiI18n:{getLang:()=>lang},KiwiLive:{merchant:()=> 'copy-fixture-'+lang},KiwiDateRange:{selectedBusinessDay:()=> '2026-09-30'},KiwiDashboardBoot:{whenUnlocked:go=>go()},Kiwi:{handlers:{'nav-transactions-day':(_e,day)=>window.openedDay=day},toast:(t,o)=>toasts.push({t,o})},addEventListener(){},dispatchEvent(){}};
 const ctx=vm.createContext({window,KiwiLive:window.KiwiLive,Kiwi:window.Kiwi,KiwiDateRange:window.KiwiDateRange,KiwiDashboardBoot:window.KiwiDashboardBoot,document:{documentElement:{lang,getAttribute:()=>null},readyState:'complete',getElementById:()=>({}),querySelector:()=>null,addEventListener(){}},location:{pathname:'/dashboard.html'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval(){},CustomEvent:class {},fetch:async()=>({ok:true,json:async()=>({daySummary:summary})}),console});vm.runInContext(source,ctx);return {api:window.KiwiZReconciliation,toasts,window};}
const gap={day:'2026-09-30',source:'open-z',reportedCents:3200,recordedCents:3200,comparisonCents:0,gapCents:3200,missingCount:1,unqueuedCount:0,blocked:[],terminalIds:['fixture-till-123456']};
for(const lang of ['fr','en','ar']){
 let first=instance(lang,gap);await first.api.showDashboard();assert.equal(first.toasts.length,1);checks++;
 const text=first.api.referenceText(gap);assert.ok(text.includes('2026-09-30')&&text.includes('123456'));assert.ok(!text.includes('0 reçu')&&!text.includes('hors file'));checks+=2;
 assert.match(text,lang==='fr'?/Compté en caisse/:lang==='en'?/Counted at the till/:/المبلغ في الصندوق/);checks++;
 assert.ok(first.api.notificationHtml().includes('data-action="z-view-sales"'));first.toasts[0].o.action.onClick();assert.equal(first.window.openedDay,'2026-09-30');checks+=2;
 await first.api.showDashboard();assert.equal(first.toasts.length,1);let reload=instance(lang,gap);await reload.api.showDashboard();assert.equal(reload.toasts.length,0,'re-entry does not nag even after a reload');checks+=2;
 const matched={...gap,source:'live-ledger',reportedCents:0,comparisonCents:0,gapCents:0,missingCount:0};let resolved=instance(lang,matched);await resolved.api.showDashboard();assert.equal(resolved.toasts.length,0);assert.ok(resolved.api.notificationHtml().includes('resolved'));assert.equal(resolved.api.referenceText(matched),'');checks+=3;
 // The same discrepancy stays acknowledged after resolution, while a new amount gets one toast.
 const next=instance(lang,{...gap,gapCents:5700,reportedCents:5700});await next.api.showDashboard();assert.equal(next.toasts.length,1);checks++;
}
console.log(`✓ z-alert-copy-test: ${checks} translation, truthful scope, action, deduplication and resolution assertions`);
