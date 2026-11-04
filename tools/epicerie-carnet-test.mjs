// Exercise the shipped book and language layer, with no browser or storage migration.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { unionBook } from '../functions/api/_credit-book-store.js';
import { creditRefundEdit } from '../functions/api/_credit-book-refund.js';
const read = p => fs.readFileSync(p, 'utf8');
const language = read('assets/caisse-lang.js'), source = read('assets/pos-epicerie/carnet.js');
const epoch = Date.parse('2026-11-04T12:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } }
function runtime(lang, code = source) {
  const nodes = new Map();
  const element = () => ({ style:{},dataset:{},classList:{values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);},toggle(){},contains(v){return this.values.has(v);}},attributes:[],childNodes:[],children:[],value:'',innerHTML:'',setAttribute(){},getAttribute(){return null;},hasAttribute(){return false;},removeAttribute(){},appendChild(){},insertBefore(){},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];} });
  const document = { readyState:'loading',documentElement:element(),body:element(),head:element(),addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},getElementById(){return null;},createElement:element,createTreeWalker(){return {nextNode(){return null;}};} };
  const store = new Map([['kiwiCaisseLang',lang]]);
  const localStorage = {getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const window = {KiwiPosDispatch:{},crypto:webcrypto,localStorage,KiwiDayReport:{businessDay:ts=>new Date(+new Date(ts)-5*3600000).toISOString().slice(0,10)}};
  const context = vm.createContext({window,document,localStorage,Date:Clock,console,Intl,setTimeout(){},clearTimeout(){},requestAnimationFrame(){},NodeFilter:{SHOW_TEXT:4,SHOW_ELEMENT:1}});
  vm.runInContext(language,context); vm.runInContext(code,context);
  const $ = selector => { if (!nodes.has(selector)) nodes.set(selector,element()); return nodes.get(selector); };
  const notices=[];
  const full=element(); full.dataset.epSettle='full';
  const partial=element(); partial.dataset.epSettle='partial';
  const host={ $, $$:selector=>selector==='[data-ep-settle]'?[full,partial]:[],esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),r2:n=>Math.round(n*100)/100,icons(){},initials:()=> 'TK',politeName:s=>s,pvReal:()=>true,pvName:()=>'',toast:s=>notices.push(s),state:{ticket:{lines:[]},carnetQuery:''},day:{especes:0,carte:0,creditAdded:0},epicerieOps:null,root:{},ITEMS:{},ticketTotal:()=>12.5,ticketCount:()=>2,openVeil:id=>$(id).classList.add('is-open'),closeVeil:id=>$(id).classList.remove('is-open'),focusModal(){},postDay(){},queueIfOffline(){},renderBadges(){}};
  const book=window.KiwiPosDispatch.createEpicerieCarnet(host);
  // The dependency must initialize before the real till registers, including demo seeds.
  let registered;
  window.KiwiPosDispatch.register = spec => { registered=spec; };
  vm.runInContext(read('assets/pos-epicerie.js'),context);
  assert.equal(registered.id,'epicerie');
  return {book,host,nodes,$,notices,window,full,partial};
}
const legacy = [{type:'debt',amt:12.1,at:'2026-10-01T10:00:00Z',label:'TEST KIWI'},{type:'debt',amt:3.2,at:'2026-11-01T10:00:00Z',label:'TEST KIWI'},{type:'pay',amt:5.3,at:'2026-11-02T10:00:00Z',label:'TEST KIWI'}];
const customer = hist => ({id:'test-client',name:'TEST KIWI',phone:'0600000000',hist:hist.map(h=>({...h,at:new Date(h.at)}))});
const a=runtime('en'), b=runtime('ar');
const before=JSON.stringify(legacy), c=customer(legacy), beforeCustomer=JSON.stringify(customer(legacy));
assert.equal(a.book.balanceOf(c),10);
assert.equal(a.book.entryId(c.hist[0]),b.book.entryId(customer(legacy).hist[0]));
assert.equal(a.book.entryId(c.hist[0]),JSON.stringify(['debt',12.1,new Date(legacy[0].at).toISOString(),'TEST KIWI']));
assert.equal(JSON.stringify(legacy),before,'identity never rewrites old history');
assert.equal(JSON.stringify(c),beforeCustomer,'reading a legacy key never adds persisted fields');
const persisted=JSON.parse(JSON.stringify(c));
assert.equal(unionBook([persisted],[persisted]).carnet[0].hist.length,3);
const doc=carnet=>({verticals:{epicerie:{data:{carnet}}}});
assert.equal(creditRefundEdit(doc([persisted]),doc([persisted])),false,'legacy identity remains compatible with immutable server history');
const e1=a.book.histEntry('debt','TEST KIWI',.01),e2=b.book.histEntry('debt','TEST KIWI',.02);
assert.equal(+e1.at,+e2.at);assert.notEqual(e1.id,e2.id,'two devices at the same millisecond have distinct IDs');
const merged=unionBook([{...persisted,hist:[...persisted.hist,JSON.parse(JSON.stringify(e1))]}],[{...persisted,hist:[...persisted.hist,JSON.parse(JSON.stringify(e2))]}]).carnet[0];
assert.equal(a.book.balanceOf(merged),10.03,'both devices retain their exact centimes');
assert.equal(a.book.debtDays(new Date('2026-11-04T04:59:59Z')),1,'5 h boundary, even less than 24 hours ago');
assert.equal(a.book.debtDays(new Date('2026-11-04T05:00:00Z')),0);
const french=/depuis|mouvement|trop-perçu|à jour|Ouvrir|ardoise|Règlement|règlement|voisin|Montant|carnet|crédit|Espèces|Ajouter|moitié|Bonjour|journée|solde|régl|reçues|Fermer/;
for (const lang of ['en','ar']) {
  const r=runtime(lang),{book}=r;
  for (const hist of [...[0,1,3,8,21,40,90].map(days=>[{type:'debt',amt:1,at:new Date(epoch-days*86400000).toISOString(),label:'TEST KIWI'}]),legacy,[{type:'pay',amt:12.5,at:legacy[0].at,label:'TEST KIWI'}],[]]) {
    const html=book.ardoiseCard(customer(hist));
    const visible=html.replace(/<[^>]*>/g,'');
    assert.doesNotMatch(visible,french,lang+' card has no French');
    assert.match(html,lang==='en'?/Open/:/فتح/);
  }
  assert.match(book.ardoiseCard(customer([{type:'debt',amt:1234.5,at:legacy[0].at,label:'TEST KIWI'}])),lang==='en'?/1,234\.50 MAD/:/1\s234,50 MAD/,'language number convention, Arabic keeps Western digits');
  const c=customer(legacy);book.CARNET.push(c);book.CRED[c.id]=c;
  const clean = () => { for (const [selector,node] of r.nodes) assert.doesNotMatch(node.innerHTML.replace(/<[^>]*>/g,''),french,lang+' '+selector); };
  book.renderCarnet();clean();book.openCarnetPick();clean();r.$('#ep-cp-new').onclick();clean();book.quickDebt(c);clean();book.openSettle(c);clean();
  // Trigger the real full-payment handler and verify the cash/card screen too.
  r.full.onclick();
  for (const [selector,node] of r.nodes) {
    const visible=node.innerHTML.replace(/<[^>]*>/g,'');
    assert.doesNotMatch(visible,french,lang+' '+selector+' has no French');
    assert.doesNotMatch(node.innerHTML,/aria-label="Fermer"|placeholder="Nom/);
  }
  assert.doesNotMatch(book.waMessage(c),french,lang+' WhatsApp draft is translated');
  book.openSettle(c);r.partial.onclick();
  r.$('#ep-settle-amt').oninput({target:{value:'3.2'}});
  r.$('#ep-settle-in').oninput({target:{value:'5'}});
  r.window.KiwiCaisseLang.set(lang==='en'?'ar':'en');
  assert.match(r.$('#ep-paym').innerHTML,/value="3.2"/,'language switch preserves partial repayment');
  { const input = r.$('#ep-paym').innerHTML.match(/<input[^>]*id="ep-settle-amt"[^>]*>/)[0];
    assert.match(input,/step="0\.01"/,'a partial repayment is typed to the centime, the way the debt is held');
    assert.match(input,/inputmode="decimal"/,'and the keypad offers the decimal point'); }
  assert.match(r.$('#ep-paym').innerHTML,/value="5"/,'language switch preserves received cash');
  assert.doesNotMatch(r.$('#ep-paym').innerHTML.replace(/<[^>]*>/g,''),french);
  r.window.KiwiCaisseLang.set('fr');
  assert.match(r.$('#ep-paym').innerHTML,/Règlement partiel/,'French can be restored');
}
// Mutation proofs: these checks must catch loss of each new guarantee.
assert.throws(() => assert.doesNotMatch(runtime('en',source.replace('return markup.replace(', 'return markup; return markup.replace(')).book.ardoiseCard(c).replace(/<[^>]*>/g,''),french));
assert.throws(() => assert.equal(runtime('en',source.replace('const entryId = h => h.id || JSON.stringify([h.type, h.amt, h.at, h.label]);','const entryId = h => h.id;')).book.entryId(c.hist[0]),a.book.entryId(c.hist[0])));
const timestampOnly=source.replace(/const uid = \(p\) => [^\n]+/,"const uid = (p) => p + Date.now();");
assert.throws(() => assert.notEqual(runtime('en',timestampOnly).book.histEntry('debt','TEST KIWI',1).id,runtime('ar',timestampOnly).book.histEntry('debt','TEST KIWI',1).id));
assert.throws(() => assert.equal(runtime('en',source.replace('const days = debtDays(d);','const days = Math.floor((Date.now() - d.getTime()) / DAY);')).book.sinceLabel(new Date('2026-11-04T04:59:59Z')),'hier'));
function withHistoryImport(code) { return code.replace(/import\('\.\.\/credit-history-page\.js\?v=\d+'\)/,'window.__importHistory()'); }
// A customer sheet first opened offline: the failed history import is not kept, the next open loads it once.
{
  const sheetTill=runtime('fr',withHistoryImport(source)); let calls=0;
  sheetTill.window.__importHistory=()=>++calls===1?Promise.reject(new Error('offline')):Promise.resolve({bindHistoryPages(){}});
  let firstError=null;
  try { await sheetTill.book.openArdoise('nobody'); } catch (e) { firstError=e; }
  assert.equal(firstError&&firstError.message,'offline','the offline open fails');
  await sheetTill.book.openArdoise('nobody');
  assert.equal(calls,2,'a failed history import is retried on the next open');
  await sheetTill.book.openArdoise('nobody');
  assert.equal(calls,2,'once loaded, the history module is never imported again');
}
console.log('✓ carnet: EN/AR cards and forms, locale amounts, immutable legacy keys, same-millisecond device IDs, centimes, 5 h debt age, history import retried after an offline failure');
