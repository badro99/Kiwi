import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {invoicingTestSource} from './invoicing-test-source.cjs';
const require=createRequire(import.meta.url), declaration=require('./live-declaration.cjs');
const read=f=>fs.readFileSync(f,'utf8');
const history=await import('../assets/invoicing/history.js');
const {createTransport}=await import('../assets/invoicing/transport.js');
const NativeURL=globalThis.URL;
// A separate CSV reader consumes the actual downloaded UTF-8 Blob, with quoted
// delimiters, escaped quotes and embedded newlines, as a spreadsheet import does.
function parseCsv(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=1;i<text.length;i++) {
    const c=text[i];
    if(c==='"'&&(quoted||cell==='')) { if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(c===';'&&!quoted){row.push(cell);cell='';}
    else if(c==='\r'&&text[i+1]==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';i++;}
    else cell+=c;
  }
  assert.equal(quoted,false);row.push(cell);rows.push(row);return rows;
}
for(const lang of ['fr','en','ar']) {
  const realm=vm.createContext({console,Intl,Date,Math,Number,setTimeout,clearTimeout,localStorage:{getItem:()=>null},document:{readyState:'loading',documentElement:{lang},addEventListener(){},querySelectorAll:()=>[]}});
  realm.window=realm;realm.addEventListener=()=>{};
  vm.runInContext(invoicingTestSource().replace(/\}\)\(\);\s*$/, 'globalThis.proof={T,normRow,csvMoney,statusLabel,NO_OF,today};})();'),realm);
  const p=realm.proof,t=p.T(), pages=[],notices=[],progress=[];let blob,downloads=0,fail=false,repeat=false;
  const button={disabled:false,setAttribute(){},removeAttribute(){},set textContent(v){progress.push(v);}};
  const doc=(id,name='Match; "عميل"\nclient')=>({id,number:'F-'+id,type:'invoice',customer:{name,ice:'001234567890123'},issueDate:'2026-11-04',dueDate:'2026-11-04',displayStatus:'paid',ttcCents:12345,balanceCents:0});
  const loaded=[doc('loaded')];
  const transport=createTransport({ownData:()=>true,merchantSlug:()=> 'fixture'});
  globalThis.fetch=async(url,options)=>{
    assert.ok(options.signal instanceof AbortSignal,'shared deadline owns the request');
    const request=new NativeURL(url,'https://fixture.test');assert.equal(request.pathname,'/api/invoices');
    const payload=Object.fromEntries(request.searchParams);assert.equal(payload.type,'invoice');pages.push(payload);
    if(fail&&payload.cursor)throw Error('offline');
    const page=payload.cursor?{docs:[doc('a'),doc('b'),doc('excluded','Other')],nextCursor:repeat?'next':null}:{docs:[doc('a')],nextCursor:'next'};
    return {ok:true,json:async()=>page};
  };
  const deps={...p,filter:'paid',query:'Match',tab:'invoice',overlay:{querySelector:()=>button},csvCell:(...args)=>history.csvCell({},null,args),visibleRows:()=>loaded,toast:s=>notices.push(s),api:transport.api};
  globalThis.URL={createObjectURL:b=>{blob=b;return 'blob:test';},revokeObjectURL(){}};
  globalThis.document={createElement:()=>({click(){downloads++;}})};
  const csv=await history.exportCsv(deps,null,[true]);
  assert.equal(pages.length,2);assert.equal(pages[1].cursor,'next');assert.equal(downloads,1);
  assert.ok(progress.some(s=>s===t.exportProgress.replace('{n}',1)));
  assert.equal(button.disabled,false);assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),new TextEncoder().encode(csv));
  const sheet=parseCsv(csv);assert.equal(sheet.length,3);assert.equal(sheet[1][1],'Match; "عميل"\nclient');
  assert.equal(sheet[1][2],'="001234567890123"');assert.equal(sheet[2][6],'123,45');assert.equal(sheet[2][7],'0,00');
  assert.equal(loaded.length,1,'full export never mutates loaded cache');
  fail=true;await history.exportCsv(deps,null,[true]);assert.equal(downloads,1,'failed page never downloads partial register');assert.equal(notices.at(-1),t.exportFailed);
  history.exportCsv(deps,null,[]);assert.equal(downloads,2,'loaded export still works after failure');
  fail=false;repeat=true;await history.exportCsv(deps,null,[true]);assert.equal(downloads,2,'repeated cursor fails instead of looping');
}
console.log('✓ full invoice export: pages, progress, deduplication, filtering, CSV import, centimes, failure and loaded fallback in FR/EN/AR');
// Run the production tip renderer and shortage renderer with the real formatter.
const payment=read('assets/caisse/payment.js'),catalogue=read('assets/caisse/catalogue.js');
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){},toggle(){}},dataset:{}});return nodes.get(id);};
const context=vm.createContext({window:{KiwiCaisseLang:{tr:s=>'translated:'+s}},$:node,$$:()=>[],splitPayCallback:null,payTipMode:'5',payTipCustom:0,currentTotal:()=>47,payTipAmount:()=>2.38,cashInput:{value:'49.37'},cashRendu:node('rendu'),cashRenduVal:node('value'),cashConfirm:{}});
vm.runInContext(declaration(catalogue,'money')+';'+declaration(catalogue,'minor')+';'+declaration(catalogue,'fmtMAD')+';'+declaration(catalogue,'fmtMADcents')+';'+declaration(payment,'renderPayTip')+';'+declaration(payment,'updateRendu'),context);
context.renderPayTip();context.updateRendu();
for(const which of ['cash','card']) {
 const html=node('#'+which+'-tip-breakdown').innerHTML;
 for(const amount of [47,2.38,49.38]) assert.ok(html.includes(vm.runInContext('fmtMADcents('+amount+')',context)));
 assert.ok(html.includes('translated:Pourboire'));assert.ok(node('#'+which+'-tip-chips').innerHTML.includes('translated:Sans pourboire'));
}
assert.ok(context.cashRenduVal.textContent.includes('0,01 MAD'));assert.equal(context.cashConfirm.disabled,true);
const win={};vm.runInNewContext(read('assets/restaurant-menu/strings.js'),{window:win});vm.runInNewContext(read('assets/restaurant-menu/recipes.js'),{window:win});
const strings=win.KiwiMenuWorkspaceParts.strings().UI_I18N;
for(const lang of ['fr','en','ar']) {
 const ui=key=>strings[lang][key], recipes=win.KiwiMenuWorkspaceParts.recipes({ui,esc:s=>s,venue:()=>null});
 const html=recipes.recipeNutrition({ingredients:[{qty:1}]},{nutrition:()=>({complete:true,nutrition:{kcal:12,protein:1,carbs:2,fat:3},allergens:[]})},false);
 for(const key of ['nutritionProtein','nutritionCarbs','nutritionFat'])assert.ok(html.includes(ui(key)));
}
const {TICKET_TAXONOMY}=await import('../functions/api/tickets/_taxonomy.js');
for(const kind of TICKET_TAXONOMY.kinds) assert.ok(kind.description.ar?.length>5,kind.id+' Arabic description');
// Resolve the actual declaration cascade for both controls at the phone breakpoint.
const {parse}=require('./kit-css.js');const rules=parse(read('assets/planning-ui.css')).rules;
for(const selector of ['.briefing-actions button','.briefing-reset']){
 const style={};for(const rule of rules)if(rule.selectors.includes(selector))for(const d of rule.decls)style[d.prop]=d.value;
 assert.ok(parseFloat(style['min-block-size'])>=44);assert.ok(parseFloat(style['min-inline-size'])>=44);
}
console.log('✓ real payment presentation, localized recipe output, Arabic taxonomy and parsed briefing target cascade');
