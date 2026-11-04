import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { run } from './ui-runtime-harness.mjs';
const require=createRequire(import.meta.url);
const owner=run('assets/i18n.js',['numberLocale','formatNumber'],{getLang:()=> 'fr',Intl});
const calls=[];
const rules=require('../assets/briefing-rules.js').createRules({number:(v,L,o)=>{calls.push([v,L]);return owner.formatNumber(v,o || {maximumFractionDigits:2},L);},limit:()=>1});
const line=rules.cashGapRule({rows:[{event_type:'close',opened_ts:1,gap_cents:-125050}],day:'today',threshold:10001,dayOf:()=> 'today'});
for(const L of ['fr','en','ar']) {
 assert.ok(line.copy[L].includes(owner.formatNumber(-1250.5,{minimumFractionDigits:2,maximumFractionDigits:2},L)));
 assert.ok(line.copy[L].includes(owner.formatNumber(100.01,{minimumFractionDigits:2,maximumFractionDigits:2},L)));
 assert.ok(calls.some(([v,l])=>v===-1250.5 && l===L),'delegates to shared owner per language');
}
assert.equal(owner.formatNumber(12.5,{},'ar'),owner.formatNumber(12.5,{},'fr'),'preserves the owner’s Arabic convention');
console.log('✓ briefing cash gaps delegate per-language centimes to the real shared number owner');
