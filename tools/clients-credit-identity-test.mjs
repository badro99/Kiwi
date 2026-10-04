#!/usr/bin/env node
// #0154 actual-source credit/return identity guard. Pure VM, no HTTP or writes.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(root+'/assets/clients-book.js','utf8');
function fn(name){const start=source.indexOf('  function '+name+'(');if(start<0)throw Error('missing '+name);const end=source.indexOf('\n  }',start);return source.slice(start,end+4);}
let passed=0,failed=0;
const check=(ok,label)=>{if(ok){passed++;console.log('✓ '+label);}else{failed++;console.error('✗ '+label);}};
const record={saleId:'11502',clientId:'customer-fixture',creditCode:'AV-2032',amount:90};
const cases=[
  {label:'actual no KiwiVenue stale live Cafe paired Boutique',body:'is-pos is-pos-boutique is-unlocked',pv:{merchant:'amira-boutique'},want:'amira-boutique'},
  {label:'injected dashboard Cafe cannot override paired till',body:'is-pos is-pos-boutique',pv:{merchant:'amira-boutique'},kv:{slug:'amira-cafe'},want:'amira-boutique'},
  {label:'legitimate owner dashboard current Cafe',body:'page-clients kiwi-native-owner',pv:{merchant:'amira-boutique'},kv:{slug:'amira-cafe'},want:'amira-cafe'},
  {label:'legitimate owner dashboard live fallback Cafe',body:'page-clients',pv:{merchant:'amira-boutique'},want:'amira-cafe'},
  {label:'native owner dashboard unlocked state remains current Cafe',body:'page-clients kiwi-native-owner is-unlocked',pv:{merchant:'amira-boutique'},kv:{slug:'amira-cafe'},want:'amira-cafe'},
  {label:'paired underscore ID stays exact',body:'is-pos-boutique',pv:{merchant:'store_Boutique'},want:'store_Boutique'},
  {label:'paired dot ID stays exact',body:'is-pos-boutique',pv:{merchant:'store.Boutique'},want:'store.Boutique'},
  {label:'paired colon ID stays exact',body:'is-pos-boutique',pv:{merchant:'store:Boutique'},want:'store:Boutique'},
  {label:'oversized merchant ID fails closed',body:'is-pos-boutique',pv:{merchant:'a'.repeat(65)},want:''},
  {label:'main restaurant till paired Boutique wins stale metadata',body:'is-unlocked',pv:{merchant:'amira-boutique'},kv:{slug:'amira-cafe'},want:'amira-boutique'},
  {label:'paired identity missing fails closed',body:'is-pos-boutique',pv:null,want:''},
  {label:'pairing object merchant missing cannot use venue ID',body:'is-pos-boutique',pv:{venueId:'v-amira-boutique'},want:''},
  {label:'nonstring merchant fails closed',body:'is-pos-boutique',pv:{merchant:{slug:'amira-boutique'}},want:''},
  {label:'path-like merchant fails closed',body:'is-pos-boutique',pv:{merchant:'../amira-cafe'},want:''},
  {label:'empty merchant fails closed',body:'is-pos-boutique',pv:{merchant:''},want:''},
  {label:'unbound till cannot use owner fallback',body:'is-pos-boutique',bound:false,pv:{merchant:'amira-boutique'},want:''},
  {label:'malformed persisted pairing fails closed',body:'is-pos-boutique',raw:'{broken',api:false,want:''},
  {label:'valid persisted pairing fallback',body:'is-pos-boutique',raw:JSON.stringify({merchant:'amira-boutique'}),api:false,want:'amira-boutique'},
  {label:'malformed dashboard identity fails closed',body:'page-clients',kv:{slug:{}},want:''},
];
for(const c of cases){
  const store=new Map([['kiwiLiveMerchant','amira-cafe'],['kiwiPaired',c.bound===false?'0':'1'],['kiwiPairedVenue',c.raw??JSON.stringify(c.pv)],['kiwi:bqAvoirs','[]']]);
  const storage={getItem:k=>store.get(k)??null,setItem:()=>{throw Error('identity must not adopt or write data');}};
  const calls=[],document={body:{className:c.body},documentElement:{lang:'fr'}};
  const window={};if(c.api!==false)window.KiwiCaissePairing={isPaired:()=>c.bound!==false,pairedVenue:()=>c.pv};if(c.kv)window.KiwiVenue={getCurrentVenueData:()=>c.kv};
  const context=vm.createContext({window,document,localStorage:storage,KiwiVenue:window.KiwiVenue,Date,Number,Array,JSON,Math,String,KC:{bookId:()=>{throw Error('must not trigger legacy adoption');}},fetch:(url,options)=>{calls.push({url,options});return Promise.resolve({ok:true,json:async()=>({credits:[]})});}});
  for(const name of ['esc','fmt','localAvoirs','localCreditView','clientLocalCredits','loadClientCredits'])vm.runInContext(fn(name),context);
  if(source.includes('  function validCreditMerchant('))vm.runInContext(fn('validCreditMerchant'),context);
  vm.runInContext(fn('creditMerchant')+'\n'+fn('localReturns'),context);
  check(context.creditMerchant()===c.want,c.label+' resolved identity');
  const identitySnapshot=JSON.stringify([...store]);
  for(const [journalMerchant,wantLength] of [['amira-boutique',c.want==='amira-boutique'?1:0],['amira-cafe',c.want==='amira-cafe'?1:0],...(c.want&&c.want!=='amira-boutique'&&c.want!=='amira-cafe'?[[c.want,1]]:[]),[undefined,0],['',0]]){
    store.set('kiwi:bqReturns',JSON.stringify({m:journalMerchant,list:[record]}));
    check(context.localReturns().length===wantLength,c.label+' journal scope '+String(journalMerchant));
  }
  store.delete('kiwi:bqReturns');
  check(JSON.stringify([...store])===identitySnapshot,c.label+' no storage adoption/mutation');
  const host={isConnected:true,innerHTML:''};context.loadClientCredits('customer-fixture',host);await new Promise(resolve=>setImmediate(resolve));
  check(calls.length===(c.want?1:0),c.label+' cloud GET allowed only with identity');
  if(c.want){check(new URL(calls[0].url,'https://fixture.invalid').searchParams.get('merchant')===c.want,c.label+' exact cloud GET merchant');check(!calls[0].options.method&&!calls[0].options.body,c.label+' read-only GET');}
}
console.log((failed?'✗':'✓')+' clients-credit-identity-test: '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
