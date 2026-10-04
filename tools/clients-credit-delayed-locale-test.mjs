#!/usr/bin/env node
// Pure actual credit renderer and public locale transport, including delayed GET repaint.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(root+'/assets/clients-book.js','utf8');
const dictionary=fs.readFileSync(root+'/assets/caisse-lang.js','utf8');
const fixtureSource=fs.readFileSync(root+'/tools/boutique-closing-locale-test.mjs','utf8');
const domFixture=fixtureSource.slice(fixtureSource.indexOf('const decode='),fixtureSource.indexOf('function decl('));
function fn(name){const start=source.indexOf('  function '+name+'(');if(start<0)throw Error('missing '+name);const end=source.indexOf('\n  }',start);return source.slice(start,end+4);}
const renderer=fn('loadClientCredits');
let passed=0,failed=0;
function check(ok,label){if(ok){passed++;console.log('✓ '+label);}else{failed++;console.error('✗ '+label);}}
const expected={fr:['Avoirs · solde','Aucun avoir','Les crédits boutique émis à ce client apparaîtront ici.'],en:['Store credit · balance','No store credit','Store credits issued to this customer will appear here.'],ar:['أرصدة المتجر · الرصيد','لا يوجد رصيد متجر','ستظهر هنا أرصدة المتجر الصادرة لهذا الزبون.']};
for(const initial of ['fr','en','ar'])for(const lang of ['fr','en','ar'])for(const populated of [false,true]){
  const store=new Map([['kiwiLiveMerchant','stale-cafe'],['kiwi:bqAvoirs','[]']]);
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(k!=='kiwiCaisseLang')throw Error('no record writes');store.set(k,String(v));}};
  const window={localStorage:storage,KiwiCaissePairing:{isPaired:()=>true,pairedVenue:()=>({merchant:'fixture-boutique'})}};
  let resolveFetch;const requests=[];
  const context=vm.createContext({window,assert,localStorage:storage,Date,Intl,Number,Array,JSON,Math,String,RegExp,WeakMap,Map,Set,Object,console,NodeFilter:{SHOW_TEXT:4,SHOW_ELEMENT:1},MutationObserver:class{observe(){}disconnect(){}},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,fetch:(url,options)=>{requests.push({url,options});return new Promise(resolve=>{resolveFetch=resolve;});}});
  vm.runInContext(domFixture+';globalThis.document=documentFixture();document.body.className="is-pos-boutique";',context,{filename:'existing:pure-dom-fixture'});
  const document=context.document;
  vm.runInContext(dictionary,context,{filename:'actual:caisse-lang.js'});context.KiwiCaisseLang=window.KiwiCaisseLang;
  for(const name of ['esc','fmt','dataMarkup','referenceMarkup','uiMarkup','historyLocale','historyDate','historyDateMarkup','validCreditMerchant','creditMerchant','localAvoirs','localCreditView','clientLocalCredits'])vm.runInContext(fn(name),context,{filename:'actual:clients-book.js:'+name});
  vm.runInContext(renderer,context,{filename:'actual:clients-book.js:loadClientCredits'});
  const L=window.KiwiCaisseLang;L.set(initial);
  const host=document.createElement('div');host.isConnected=true;document.body.appendChild(host);
  const label=initial+'→'+lang+' '+(populated?'credit':'empty');
  function copy(language,stage,hasCredit){
    const section=host.querySelector('.kcb-section');
    check(section.children[0].textContent===expected[language][0],label+' '+stage+' heading localized');
    check(section.children[0].tagName==='SPAN',label+' '+stage+' heading keeps span');
    const nodes=[section.children[0]];
    if(!hasCredit){const empty=host.querySelector('.kcb-empty');nodes.push(empty.children[0],empty.children[1]);
      check(empty.children[0].textContent===expected[language][1],label+' '+stage+' empty label localized');
      check(empty.children[1].textContent===expected[language][2],label+' '+stage+' empty hint localized');
      check(empty.children[0].tagName==='B'&&empty.children[1].tagName==='DIV',label+' '+stage+' original empty tags retained');}
    check(nodes.every((node,i)=>node.getAttribute('data-caisse-copy')===expected.fr[i]),label+' '+stage+' static nodes declare exact French original');
  }
  context.loadClientCredits('fixture-client',host);
  copy(initial,'initial immediate',false);
  L.set(lang);
  const credit={code:'AV-<fixture>',status:'active',amountCents:9000,balanceCents:9000,originalRef:'11502',reason:'Aucun avoir <merchant>',issuedBy:'Avoirs · solde <merchant>',events:[]};
  const remote=populated?[credit]:[],snapshot=JSON.stringify(remote);
  resolveFetch({ok:true,json:async()=>({credits:remote})});await new Promise(resolve=>setImmediate(resolve));
  copy(lang,'delayed GET immediate',populated);
  const balanceNode=host.querySelector('.kcb-section').children[1],balanceText=balanceNode.textContent;
  check(balanceText===(populated?'90 MAD':'0 MAD'),label+' numeric balance unchanged');
  const dataNodes=host.querySelectorAll('[data-nolang]'),dataTexts=dataNodes.map(n=>n.textContent);
  if(populated){check(dataTexts.includes('AV-<fixture>')&&dataTexts.includes('Aucun avoir <merchant>')&&dataTexts.includes('Avoirs · solde <merchant>'),label+' merchant code/reason/actor remain literal escaped text');check(!host.querySelector('merchant')&&!host.querySelector('fixture'),label+' merchant markup not parsed as elements');check(JSON.stringify(remote)===snapshot,label+' credit data not mutated');}
  for(const next of ['en','ar','fr']){L.set(next);copy(next,'public set '+next,populated);
    check(host.querySelector('.kcb-section').children[1]===balanceNode&&balanceNode.textContent===balanceText,label+' '+next+' balance node and amount preserved');
    check(dataNodes.every((node,i)=>node.textContent===dataTexts[i])&&host.querySelectorAll('[data-nolang]').every((node,i)=>node===dataNodes[i]),label+' '+next+' merchant data nodes and bytes preserved');}
  check(new URL(requests[0].url,'https://fixture.invalid').searchParams.get('merchant')==='fixture-boutique'&&!requests[0].options.method&&!requests[0].options.body,label+' original scoped GET only');
  check([...store.keys()].every(k=>['kiwiLiveMerchant','kiwi:bqAvoirs','kiwiCaisseLang'].includes(k)),label+' no customer or credit record writes');
}
console.log(`\n${failed ? '✗' : '✓'} Client credit delayed locale: ${passed} passed, ${failed} failed (${passed+failed} checks)`);process.exitCode=failed?1:0;
