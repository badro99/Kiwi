import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const vision = await import('../functions/api/ai/vision-inspect.js');
const fixture = items => ({ docType:'invoice', entities:{totalMad:items.length, items}, suggestedActions:[{type:'stock-receive'}] });
test('vision#0 retains 61 lines and marks declared incomplete extraction', () => {
 const rows = Array.from({length:61}, (_,i) => ({name:'Line '+i,qty:1,total:1,unitPrice:1}));
 assert.equal(vision.validateVisionData(fixture(rows)).entities.items.length,61);
 const result = vision.validateVisionData({...fixture(rows), incomplete:true});
 assert.equal(result.reviewNeeded,true); assert.deepEqual(result.suggestedActions,[]);
});
test('vision#1 zero stays zero, nonfinite and mismatched totals require review', () => {
 const zero = vision.validateVisionData(fixture([{name:'Zero',qty:0,total:0}]));
 assert.equal(zero.entities.items[0].qty,0);
 for (const value of [Infinity,'Infinity',-1,'bad']) {
  const result = vision.validateVisionData({entities:{totalMad:value,items:[]}});
  assert.equal(result.reviewNeeded,true); assert.ok(Number.isFinite(result.entities.totalMad));
 }
 const result = vision.validateVisionData(fixture([{name:'Mismatch',qty:1,total:20}]));
 assert.equal(result.reviewNeeded,true); assert.deepEqual(result.suggestedActions,[]);
});
test('vision#2 / i18n#0 selected locale reaches generated prose prompt', async () => {
 let payload;
 const env = {AI:{run:async (_m,p) => {payload=p; return {response:'{}'};}}};
 for (const [locale,language] of [['fr','French'],['en','English'],['ar','Arabic']]) {
  await vision.inspectImage(env,'data:image/png;base64,AA==','',locale);
  assert.ok(payload.messages[0].content.includes('Selected UI language: '+language));
 }
 assert.match(read('assets/agent-voice.js'),/locale:\s*document.documentElement/);
});
test('i18n#1 all sold dates follow selected language', () => {
 const src = read('assets/sold-insights.js');
 assert.doesNotMatch(src,/toLocale(?:DateString|String)\('fr-FR'/);
 const expression=src.match(/new Date\(p.last\)\.toLocaleDateString\([^;]+?month:'short'\}\)/)[0];
 const date=new Date('2026-10-26T12:00:00Z');
 for(const [lang,locale] of [['en','en-GB'],['ar','ar-MA'],['fr','fr-FR']]) {
  const actual=new Function('document','p','return '+expression)({documentElement:{lang}},{last:date.getTime()});
  assert.equal(actual,date.toLocaleDateString(locale,{day:'numeric',month:'short'}));
 }
});
test('menu#2 rejects overflow before processing files', () => {
 const src=read('assets/menu-scan.js');
 assert.doesNotMatch(src,/\[\.\.\.files\]\.slice\(0, MAX_FILES\)/);
 assert.match(src,/files.length > MAX_FILES/);
 for(const locale of ['Too many files','Trop de fichiers','عدد الملفات']) assert.ok(src.includes(locale));
});
test('clients#0 both merge paths preserve notes and tags beyond old caps', () => {
 for(const path of ['functions/api/clients.js','functions/api/_client-merge.js']) {
  const src=read(path);
  const merging = path.endsWith('/clients.js') ? src.slice(src.indexOf('function mergedText('),src.indexOf('function mergedHospitality(')) : src;
  assert.doesNotMatch(merging,/slice\(0, (?:MERGED_NOTES_MAX|MERGED_TAGS_MAX|8000|100)\)/);
 }
 const src=read('functions/api/clients.js');
 const part=src.slice(src.indexOf('function mergedText('),src.indexOf('function mergedHospitality('));
 const {mergedText,mergedTags}=new Function('tagsList',part+';return {mergedText,mergedTags}')(JSON.parse);
 assert.equal(mergedText('a'.repeat(8000),'b').length,8002);
 assert.equal(JSON.parse(mergedTags(JSON.stringify(Array.from({length:100},(_,i)=>String(i))), '["extra"]')).length,101);
});
test('sync#2 consumer update failures identify operation and stay actionable', () => {
 const src=read('assets/live-link.js');
 const section=src.slice(src.indexOf('function applyVoids('),src.indexOf('/* The pump.'));
 assert.doesNotMatch(section,/catch \(_\) \{\}/);
 assert.match(section,/consumer/);
});
test('briefing#1 saves await actual push and persist scoped cloud result', () => {
 const src=read('assets/briefing.js');
 const section=src.slice(src.indexOf('function save()'),src.indexOf('function compute('));
 assert.match(section,/pushNow/); assert.match(section,/localStorage.setItem/);
 assert.match(src,/cloudFailed:/); assert.match(src,/retryCloud/);
});

test('sync#2 real bridge continues to the other consumer and records both failures', async () => {
 const {reportConsumerFailure} = await import('../assets/live-consumer-errors.js');
 const src=read('assets/live-link.js');
 const section=src.slice(src.indexOf('  function bridgeToStore()'),src.indexOf('  /* The pump.'))
  .replaceAll("import('./live-consumer-errors.js')",'Promise.resolve({reportConsumerFailure})');
 const stored=new Map(),events=[];
 const host={KiwiVenue:{isCustom:()=>true,getVenue:()=> 'fixture'},
  KiwiSales:{list:()=>[],add(){throw Error('fixture');}},
  KiwiRefunds:{list:()=>[],add(){throw Error('fixture');}},
  localStorage:{setItem:(k,v)=>stored.set(k,v)},
  document:{documentElement:{lang:'en'},dispatchEvent:e=>events.push(e)},
  CustomEvent:class {constructor(name,o){this.detail=o.detail;}}};
 const bridge=new Function('window','merchant','feedSales','feedComplete','reportConsumerFailure', section+';return bridgeToStore;')(
  host,()=> 'fixture',[{tenant:'fixture',s:{cursor:1,amountCents:100}},{tenant:'fixture',s:{cursor:2,amountCents:-100}}],{},reportConsumerFailure);
 bridge(); await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(events.map(e=>e.detail.consumer).sort(),['KiwiRefunds','KiwiSales']);
 assert.equal(stored.size,2);
 let refundRemoved=false;
 host.KiwiSales.remove=()=>{throw Error('fixture');};
 host.KiwiRefunds.remove=()=>{refundRemoved=true;};
 const voids=src.slice(src.indexOf('  function applyVoids('),src.indexOf('  function accumulateFeed('))
  .replaceAll("import('./live-consumer-errors.js')",'Promise.resolve({reportConsumerFailure})');
 const apply=new Function('window','document','CustomEvent','feedSeen','feedSales','reportConsumerFailure',
  'var voidedRefs,voidedIds,voidedEvents;'+voids+';return applyVoids;')(
  host,host.document,host.CustomEvent,{},[],reportConsumerFailure);
 apply([{c:1}], 'fixture'); await new Promise(r=>setTimeout(r,0));
 assert.equal(refundRemoved,true,'sales removal failure must not block refunds');
 assert.ok(events.some(e=>e.detail.consumer==='KiwiSales' && e.detail.operation==='remove'));
});
test('briefing#1 failed cloud save survives reload, retry clears only confirmed save', async () => {
 const vm=await import('node:vm');const memory=new Map();let fail=true, bindFails=false;
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 const document={readyState:'loading',documentElement:{lang:'en'},addEventListener(){},querySelector(){return null;}};
 const host={document,localStorage:storage,KiwiEnv:{isReal:()=>true},KiwiMe:{accountId:'fixture'},
  KiwiCloudDoc:{currentSlug:()=> 'fixture',attach:()=>({bind:async()=>{if(bindFails)throw Error('fixture');return true;},pushNow:async()=>({ok:!fail})})},addEventListener(){}};
 const context=vm.createContext({window:host,document,localStorage:storage,console,setTimeout,clearTimeout});
 // Boot attaches the real save adapter, without needing a DOM surface.
 document.readyState='complete';document.head={appendChild(){}};document.createElement=()=>({setAttribute(){}});
 vm.runInContext(read('assets/briefing.js'),context);
 await new Promise(r=>setTimeout(r,0));
 const result=await host.KiwiBriefing._test.save(); assert.equal(result.ok,false);
 assert.ok([...memory.keys()].some(k=>k.endsWith(':cloud-save')));
 assert.match(host.KiwiBriefing._test.unsavedNote(host.KiwiBriefing._test.copy()),/Retry/);
 const reloaded={...host};delete reloaded.KiwiBriefing;
 vm.runInContext(read('assets/briefing.js'),vm.createContext({window:reloaded,document,localStorage:storage,console,setTimeout,clearTimeout}));
 await new Promise(r=>setTimeout(r,0));
 assert.match(reloaded.KiwiBriefing._test.unsavedNote(reloaded.KiwiBriefing._test.copy()),/Retry/);
 bindFails=true;assert.equal((await reloaded.KiwiBriefing._test.save()).ok,false);
 bindFails=false;fail=false;assert.equal((await reloaded.KiwiBriefing._test.retryCloud()).ok,true);
 assert.equal([...memory.keys()].some(k=>k.endsWith(':cloud-save')),false);
});
test('menu#2 real file handler makes no API calls on overflow', async () => {
 const src=read('assets/menu-scan.js');
 const section=src.slice(src.indexOf('    async function runFiles('),src.indexOf('    async function runUrl('));
 const notices=[];let calls=0;
 const run=new Function('toast','ui','callApi','MAX_FILES','busy','COPY','language',section+';return runFiles;')(
  msg=>notices.push(msg),key=>key,()=>{calls++;},6,false,{fr:{overflow:'overflow'}},()=>'fr');
 await run(Array.from({length:7},()=>({name:'page.png',type:'image/png'})));
 assert.deepEqual(notices,['overflow']);assert.equal(calls,0);
});
