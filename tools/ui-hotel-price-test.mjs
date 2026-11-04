import assert from 'node:assert/strict';
import { run, html, elements, esc } from './ui-runtime-harness.mjs';
if (!process.argv.includes('--mean-only')) {
let body;
const modalRoot={classList:{add(){}},querySelector:()=>null};
const context={esc,scope:{},K:()=>({modal:m=>{body=m.body;return {el:{querySelector:()=>modalRoot}};}}),cuState:()=>({roomTypes:{}}),tx:s=>s,cuRenderPhotoEditor(){}};
run('assets/hotel/editors.js',['cuTypeEditor'],context).cuTypeEditor();
const prices=elements(html(body),'input').filter(x=>x.getAttribute('inputmode')==='decimal');
assert.equal(prices.length,5);
for(const input of prices) assert.equal(input.getAttribute('step'),'0.01','all rate controls increment and validate centimes');
}
for(const language of ['fr-FR','en-GB','ar-MA-u-nu-latn']) {
 const ctx={scope:{},cuEconomatBody:()=>'',cuWarmStays(){},cuState:()=>({rooms:{one:{}},folios:{},baseRate:10.01}),cuTonight:()=>({known:true,sold:0}),cuToday:()=>'',cuAllStays:()=>new Map(),cuRoomStatus:()=>({key:'free'}),folioTotal:()=>0,cuTypes:()=>[{rate:12.50},{rate:null}],cuChannelState:{loaded:false},tx:s=>s,ltr:s=>s,MAD:String,esc,txn:String,hxLocale:()=>language,Intl};
 ctx.fmt=run('assets/hotel.js',['fmt'],{window:{},document:{documentElement:{lang:language.startsWith('en')?'en':'fr'}}}).fmt;
 const result=run('assets/hotel/editors.js',['cuIntelBody'],ctx).cuIntelBody();
 const doc=html(result);const labels=elements(doc,'div');const kpi=labels.find(x=>x.getAttribute('class')==='l' && x.textContent==='Tarif moyen configuré').parentNode;
 assert.ok(kpi.textContent.includes(new Intl.NumberFormat(language,{minimumFractionDigits:2,maximumFractionDigits:2}).format(11.26)),kpi.textContent);
}
console.log('✓ hotel: five centime steps; integer-centime mean and locale rendering retain fractional rates');
