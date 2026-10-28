import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let failed = 0;
const test = (name, fn) => { try { fn(); console.log('✓ ' + name); } catch (e) { failed++; console.error('✗ ' + name + ': ' + e.message); } };
const window = { KiwiCatalogImport: null, KiwiBoutiqueCatalog: { listProducts: () => [{id:'p',name:'Article'}], listCategories: () => [], colors: () => [], listVariants: () => [{id:'v',size:'TU',colorId:'sans_couleur',stock:17}] } };
vm.runInNewContext(read('assets/catalog-import.js'), {window, document:{}, console, TextDecoder});
const I = window.KiwiCatalogImport;
test('catalogue#0 refuses unreadable stock instead of proposing zero', () => {
  const plan = I.analyseBoutique(I.parse('produit;stock\nArticle;inconnu'));
  assert.equal(plan.products[0].variants[0].stockGiven, false);
  assert.ok(plan.issues.length);
});
test('catalogue#1 rejects malformed whole cells', () => {
  for (const value of ['12oops', '1.2.3', '12-3', '1,23,456', '1.23,45', '1 2']) assert.ok(Number.isNaN(I._num(value)), value);
  for (const [value,n] of [['1 234,50',1234.5],['1.234,50',1234.5],['1,234.50',1234.5],['12,50',12.5]]) assert.equal(I._num(value),n,value);
});
test('i18n#0 vision#1 normalize Arabic and Persian digits and separators', () => {
  for (const [value,n] of [['١٢٣',123],['١٬٢٣٤٫٥٠',1234.5],['۱۲٫۵۰',12.5],['١٢,٥٠',12.5]]) assert.equal(I._num(value),n,value);
});
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [2026,9,28,4])); } }
const calcContext = vm.createContext({STALE_DAYS:90,today:()=> '2026-10-27',Date:FixedDate});
vm.runInContext(read('assets/simple-food-cost/calc.js') + '\nglobalThis.compute = compute;', calcContext);
const compute = calcContext.compute;
const sheet = {portions:2,sellingPrice:20,lines:[{packPrice:10,packQty:1,useQty:1,packUnit:'kg',priceDate:'2026-10-26'}]};
test('analysis#0 negative inputs cannot produce negative cost or contribution', () => {
  for (const field of ['packPrice','useQty']) { const c=compute({...sheet,lines:[{...sheet.lines[0],[field]:-1}]}); assert.equal(c.status,'incomplete'); assert.equal(c.total,null); }
  assert.equal(compute({...sheet,sellingPrice:-1}).contribution,null);
});
test('analysis#1 default price age uses merchant business day and honors explicit day', () => {
  assert.equal(compute(sheet).lines[0].age,1);
  assert.equal(compute(sheet,{today:'2026-10-29'}).lines[0].age,3);
  const standalone = vm.runInNewContext(read('assets/simple-food-cost/calc.js') + '\ncompute', {STALE_DAYS:90,Date:FixedDate});
  assert.equal(standalone(sheet).lines[0].age,1);
});
test('analysis#2 invalid batch yield is incomplete rather than rounded', () => {
  for (const portions of [1.5,0,-1,'oops',null]) { const c=compute({...sheet,portions}); assert.equal(c.status,'incomplete'); assert.equal(c.portions,null); assert.equal(c.perPortion,null); assert.equal(c.knownPerPortion,null); }
  assert.equal(compute(sheet).perPortion,5);
});
const loadFactory = (file,name,context) => vm.runInNewContext(read(file).replace('export function ', 'function ') + '\n' + name,context);
test('planning#0 every applied assignment is visible in review', () => {
  const handlers={}, result={assignments:Array.from({length:45},(_,i)=>({memberId:'m'+i,day:'2026-10-28',start:'09:00',end:'17:00'})),unresolved:[],shifts:{}};
  let shown;
  const win={KiwiPlanningCore:{optimize:()=>result},__kiwiTeamV2:{shiftsByVenue:{}}};
  loadFactory('assets/planning/optimiser.js','createOptimiser',{window:win})({handlers,esc:String,memberFullName:m=>m.id,modal:o=>(shown=o,{el:{addEventListener(){}},close(){}}),planningContext:()=>({period:{days:[]},members:[],key:'venue'}),planningCopy:()=>({}),planningHoursKey:()=> 'venue',planningHolidaysByDay:()=>({}),trLang:()=> 'en',t:()=>({}),saveCustomTeams(){},render(){},toast(){}});
  handlers['kt-plan-optimize']();
  assert.equal((shown.body.match(/class="kt-opt-row"/g)||[]).length,45);
  handlers['kt-plan-optimize-confirm'](); assert.equal(win.__kiwiTeamV2.shiftsByVenue.venue,result.shifts);
});
function payroll(locale) {
  const win={__kiwiTeamV2:{}};
  const factory=loadFactory('assets/planning/payroll-view.js','createPayrollView',{window:win,document:{addEventListener(){}}});
  const dep={handlers:{},AVATAR_COLORS:{},IC:{},esc:s=>String(s??'').replaceAll('"','&quot;'),buildPeriod:()=>({days:['2026-10-28']}),getHours:()=>({}),dateLocale:()=>locale,pad:n=>String(n).padStart(2,'0'),toISO:()=>'',deferredMark:()=>'',payCents:n=>n*100,fmtHours:String,memberFullName:m=>m.name,initials:()=>'',jobName:()=>'',periodPillsHtml:()=>'',correctionsHtml:()=>'',periodNavigatorHtml:()=>'',svgIcon:()=>''};
  return factory(dep).renderHoursPane({hPeriodLabel:()=>'',tabHours:'Heures'},null,'venue',[{id:'m',name:'Employé'}]);
}
test('planning#1 hour inputs identify employee and date in all host locales', () => {
  for (const locale of ['fr-FR','en-GB','ar-MA']) { const html=payroll(locale); const input=html.match(/<input[^>]+>/)[0]; assert.match(input,/aria-label="[^"]*Employé[^"]*2026-10-28/); }
});
test('planning#2 calendar headers stay on the chosen date west of UTC', () => {
  const previous=process.env.TZ; process.env.TZ='America/Los_Angeles';
  try { assert.match(payroll('en-GB'),/<span class="d">28<\/span><span class="m">Wed<\/span>/); } finally { if(previous===undefined) delete process.env.TZ; else process.env.TZ=previous; }
});
if (failed) process.exitCode=1;
