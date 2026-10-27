import fs from 'node:fs';
import teamOwners from './team-owners-test-source.cjs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ctx = vm.createContext({ console, Date, Math, JSON, Set, Map, document:{ addEventListener(){} }, addEventListener(){}, setTimeout(){}, localStorage:{getItem(){return 'en';}}, Kiwi:{} });
ctx.window = ctx;
for (const file of ['assets/field-merge.js', 'assets/planning-core.js', 'assets/team/merge.js', 'assets/reservations.js', 'assets/floorplan-core.js']) vm.runInContext(read(file), ctx);
const M = ctx.KiwiFieldMerge, P = ctx.KiwiPlanningCore, R = ctx.KiwiReservations;
const TeamMerge = ctx.Kiwi.__teamMerge; // captured now: a later case swaps ctx.Kiwi for a toast stub
const clone = x => JSON.parse(JSON.stringify(x));
const equal = (x,y) => assert.deepEqual(clone(x),clone(y));
let failures = 0;
function test(name, fn) { try { fn(); console.log('✓ ' + name); } catch(e) { failures++; console.error('✗ ' + name + ': ' + (e.cause || e).message.slice(0,600)); } }
function property(fn) { fc.assert(fc.property(fc.integer({min:1,max:500}), fc.integer({min:501,max:1000}), fn), {seed:20261026,numRuns:60}); }
// Extract the shipped team merge with its pure dependencies, not a rewritten model.
const team = teamOwners.originalFile('assets/team.js');
function grab(name) { const start=team.indexOf('  function '+name+'('); let d=0; for(let i=team.indexOf('{',start);i<team.length;i++){if(team[i]==='{')d++;if(team[i]==='}'&&!--d)return team.slice(start,i+1);} throw Error(name); }
vm.runInContext('const REMOVED_CAP=200; const LOCK_KEY_RE=/^(week|fortnight|month):\\d{4}-\\d{2}-\\d{2}:\\d{4}-\\d{2}-\\d{2}$/; function teamSlug(){return "";} function fillCodes(m){return m;} '+['cleanRemoved','mergeRemoved','cleanLocks','mergeLocks','memberBelongsToStore','scopeTeamDoc','mergeByDay','mergeTeamDoc'].map(grab).join('\n')+'; globalThis.teamMerge=mergeTeamDoc;',ctx);
test('team#0 profile fields retain independent edits and converge',()=>property((x,y)=>{
 const base={members:[{id:'a',salary:0,role:'staff'}],hours:{},shifts:{}};
 const a=M.stamp({...clone(base),members:[{id:'a',salary:x,role:'staff'}]},base,10);
 const b=M.stamp({...clone(base),members:[{id:'a',salary:0,role:'manager'}]},base,20);
 const ab=ctx.teamMerge(a,b); equal(ab,ctx.teamMerge(b,a)); assert.equal(ab.members[0].salary,x); assert.equal(ab.members[0].role,'manager');
}));
for(const kind of ['hours','shifts'])test(kind==='hours'?'team#1 attendance conflict keeps newest and alternative':'planning#1 stale cells cannot overwrite a correction',()=>property((x,y)=>{
 const base={members:[{id:'a'}],hours:{},shifts:{}}; base[kind]={a:{'2026-10-26':0}};
 const a=clone(base),b=clone(base); a[kind].a['2026-10-26']=x;b[kind].a['2026-10-26']=y;
 const aa=M.stamp(a,base,10),bb=M.stamp(b,base,20),out=ctx.teamMerge(aa,bb);
 equal(out,ctx.teamMerge(bb,aa));assert.equal(out[kind].a['2026-10-26'],y);assert.ok(out.fieldEdits.conflicts.length);
 assert.equal(ctx.teamMerge(base,bb)[kind].a['2026-10-26'],y);
}));
test('planning#0 publications and settings converge at equal clocks',()=>property((x,y)=>{
 const base=P.blank();base.availability.a={weekdays:{'1':{start:'09:00',end:'17:00'}}};const a=clone(base),b=clone(base);a.availability.a.weekdays['1'].start='10:00';b.availability.a.weekdays['1'].end='18:00';a.settings.minRestHours=x;b.settings.minRestHours=y;a.publications.week={hash:'a'};b.publications.week={hash:'b'};
 const aa=M.stamp(a,base,10),bb=M.stamp(b,base,10),out=P.merge(aa,bb);equal(out,P.merge(bb,aa));assert.ok(out.fieldEdits.conflicts.length);assert.equal(out.availability.a.weekdays['1'].start,'10:00');assert.equal(out.availability.a.weekdays['1'].end,'18:00');
 equal(P.merge(base,aa).settings,aa.settings);
}));
test('booking#1 equal timestamps converge and stale fields survive normalization',()=>property((x,y)=>{
 const base=R.blank();base.bookings=[{id:'booking',customer:{name:'Client'},serviceId:'svc',startAt:1000,endAt:2000,note:'initial',updatedAt:0}];const a=clone(base),b=clone(base);a.bookings[0].note='a'+x;b.bookings[0].note='b'+y;a.bookings[0].customer.phone='contact';b.bookings[0].partySize=3;a.settings.minNoticeMinutes=x;b.settings.minNoticeMinutes=y;a.settings.updatedAt=b.settings.updatedAt=10;
 const aa=M.stamp(a,base,10),bb=M.stamp(b,base,10),out=R.merge(aa,bb);equal(out,R.merge(bb,aa));assert.ok(out.fieldEdits.conflicts.length);assert.ok(R.normalize(out).fieldEdits);assert.equal(out.bookings[0].customer.phone,'contact');assert.equal(out.bookings[0].partySize,3);
}));
test('floor#2 same table different fields survive with a visible same-field conflict',()=>property((x,y)=>{
 const base={tables:[{id:'t',x:0,y:0}],elements:[],zones:[]};
 const a=clone(base),b=clone(base);a.tables[0].x=x;b.tables[0].y=y;
 ctx.KiwiFloorCore.stamp(a,base);ctx.KiwiFloorCore.stamp(b,base);
 const union=(a,b)=>({...b,...a});
 const out=ctx.KiwiFloorCore.mergePlans(a,b,union);equal(out,ctx.KiwiFloorCore.mergePlans(b,a,union));assert.equal(out.tables[0].x,x);assert.equal(out.tables[0].y,y);
 b.tables[0].x=y;ctx.KiwiFloorCore.stamp(b,base);
 const c=ctx.KiwiFloorCore.mergePlans(a,b,union);assert.ok(c.fieldEdits.conflicts.length);assert.equal(c.tables[0].x,y);equal(c,ctx.KiwiFloorCore.mergePlans(b,a,union));
 let notice='';ctx.Kiwi={toast(t){notice=t;}};M.notice(c);assert.ok(notice.includes('Concurrent'));ctx.Kiwi=null;
}));
test('booking#1 review blocks the first stale submit and requires another explicit save',()=>{
 const source=read('assets/reservations.js'), start=source.indexOf('  function reviewBeforeSave(');
 assert.ok(start>=0,'editor must review concurrent changes');
 let depth=0,end=0;for(let i=source.indexOf('{',start);i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth){end=i+1;break;}}
 vm.runInContext('function t(k){return k;} '+source.slice(start,end)+';globalThis.reviewForm=reviewBeforeSave;',ctx);
 const error={textContent:''}, form={querySelector(){return error;}};
 assert.equal(ctx.reviewForm(form,{note:'old'},{note:'remote'}),true);
 assert.ok(error.textContent);
 assert.equal(ctx.reviewForm(form,{note:'old'},{note:'remote'}),false);
 assert.equal(ctx.reviewForm(form,{note:'old'},{note:'new remote'}),true);
 assert.match(source,/reviewBeforeSave\(form,existing,current.bookings/);
 assert.match(source,/set\(d,doc\);m.close/);
});
test('persistence, no-op reads and deletion registers retain provenance',()=>{
 const state={byVenue:{v:[{id:'a',salary:0}]},hoursByVenue:{v:{a:{day:1}}},shiftsByVenue:{},planningByVenue:{}};
 TeamMerge.remember(state,'v');state.hoursByVenue.v.a.day=2;TeamMerge.stamp(state,'v');
 const before=clone(state.mergeByVenue.v);TeamMerge.stamp(state,'v');equal(before,state.mergeByVenue.v);
 const disk=clone(state);TeamMerge.remember(disk,'v');disk.byVenue.v[0].salary=10;TeamMerge.stamp(disk,'v');
 equal(disk.mergeByVenue.v.fields.find(v=>v[0]==='["hours","a","day"]'),before.fields.find(v=>v[0]==='["hours","a","day"]'));
 const base={members:[{id:'a'}],hours:{a:{day:1}},shifts:{}};
 const edited=M.stamp({...clone(base),hours:{a:{day:2}}},base,10);
 const deleted=M.stamp({...clone(base),hours:{a:{}}},edited,20);
 equal(M.merge(deleted,edited),M.merge(edited,deleted));assert.equal(M.merge(deleted,edited).hours.a.day,undefined);
 const serialized=JSON.stringify(ctx.KiwiFloorCore.stamp({tables:[{id:'t',x:1}],zones:[],elements:[]},{tables:[{id:'t',x:0}],zones:[],elements:[]}),function(k,v){return k[0]==='_'?undefined:v;});
 assert.ok(JSON.parse(serialized).fieldEdits,'floor local serializer must retain provenance');
});
test('field provenance stays within the real store sanitizer for a monthly roster',()=>{
 const source=read('functions/api/store.js'),start=source.indexOf('function bounded(');let d=0,end=0;
 for(let i=source.indexOf('{',start);i<source.length;i++){if(source[i]==='{')d++;if(source[i]==='}'&&!--d){end=i+1;break;}}
 vm.runInContext(['MAX_DEPTH','MAX_NODES','MAX_STR','MAX_ARRAY','MAX_KEYS'].map(k=>source.match(new RegExp('const '+k+' = [^;]+;'))[0]).join('\n')+source.slice(start,end)+';globalThis.boundDoc=bounded;',ctx);
 const base={members:[],hours:{},shifts:{}};
 for(let n=0;n<20;n++){const id='member-'+n;base.members.push({id,role:'staff',salary:0});base.hours[id]={};base.shifts[id]={};for(let day=1;day<=30;day++){const date='2026-10-'+String(day).padStart(2,'0');base.hours[id][date]=8;base.shifts[id][date]={start:'09:00',end:'17:00'};}}
 const doc=M.stamp(base,{},100);
 assert.equal(ctx.boundDoc(doc).ok,true);
 assert.ok(JSON.stringify(doc).length<600000,'provenance must fit the existing team byte budget');
});
process.exitCode=failures?1:0;
