#!/usr/bin/env node
// Real Pages handlers, local SQLite only. Failure output deliberately omits credentials.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fixture} from './server-money-fixture.mjs';
import {employeeToken,employeeCookie,tillToken,TILL_COOKIE,makeSession,sessionCookie} from '../functions/auth/_lib.js';
import {onRequestPost as teamLive} from '../functions/api/team/live.js';
import {onRequestGet as get,onRequestPost as post} from '../functions/api/employee.js';
import {onRequestGet as storeGet,onRequestPost as storePost} from '../functions/api/store.js';
const ROOT=path.resolve(import.meta.dirname,'..');
let fc;try{fc=createRequire(path.join(ROOT,'app/package.json'))('fast-check');}catch{console.log('○ skip fast-check unavailable; employee properties not executed');process.exit(0);}
const RUNS=Number(process.env.KIWI_PROPERTY_RUNS)||100,SEED=Number(process.env.KIWI_PROPERTY_SEED)||20261022;
let passed=0,failed=0,known=0;
async function strict(label,p){const r=await fc.check(p,{numRuns:RUNS,seed:SEED});if(r.failed){failed++;console.error(`✗ ${label}; seed=${r.seed}; path=${r.counterexamplePath}; details suppressed`);}else{passed++;console.log('✓ '+label);}}
async function knownIssue(id,label,p){const r=await fc.check(p,{numRuns:RUNS,seed:SEED});if(!r.failed||r.errorInstance?.message!=='Property failed by returning false'){failed++;console.error('✗ '+id+' changed or fixture failed');}else{known++;console.log(`◦ known ${id}: ${label}; seed=${r.seed}; path=${r.counterexamplePath}`);}}
const f=await fixture(ROOT),{sql,merchant}=f,other='server-other-shop';
// D1 methods return promises, including callers that attach .catch directly.
const prepare=f.DB.prepare.bind(f.DB);
f.DB.prepare=query=>{const statement=prepare(query);for(const method of ['first','all']){const execute=statement[method].bind(statement);statement[method]=async(...args)=>execute(...args);}return statement;};
const secret=()=>crypto.randomUUID(),pin=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0');
let cookie,attendanceCode;
function put(feature,data,m=merchant,ts=Date.now()){sql.prepare('INSERT OR REPLACE INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,?)').run(m,feature,JSON.stringify(data),ts);}
function doc(feature,m=merchant){return JSON.parse(sql.prepare('SELECT data FROM store_docs WHERE merchant=? AND feature=?').get(m,feature)?.data||'{}');}
async function reset(){sql.exec('DELETE FROM store_docs; DELETE FROM employee_auth_versions; DELETE FROM pair_attempts; DELETE FROM staff_pins');sql.prepare("UPDATE merchant_config SET status='active'").run();attendanceCode=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');const a={id:'a',firstName:'Alice',function:'serveur',pinCode:pin(),authVersion:0},b={id:'b',firstName:'Bob',function:'serveur',pinCode:pin(),phone:secret(),baseSalary:98765};put('team',{members:[a,b],hours:{a:{'2026-10-01':1},b:{'2026-10-01':99}},shifts:{a:{},b:{}},planning:{requests:[{id:'private-request',memberId:'b',reason:secret()}]}});put('employee-access',{members:[a,b]});put('attendance-code',{code:attendanceCode,createdTs:Date.now(),expiresTs:Date.now()+3600000});put('attendance',{entries:[]});put('team',{members:[{id:'a',firstName:'Foreign',pinCode:pin()}]},other);cookie=employeeCookie(await employeeToken(f.env.AUTH_SECRET,{merchant,staffId:'a',authVersion:0}));}
async function call(body,route=body===undefined?get:post,url='/api/employee?merchant='+other){const r=await route({env:f.env,request:new Request('https://kiwi.test'+url,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})});return{status:r.status,body:await r.json()};}
const ok=r=>assert.equal(r.status,200),leave={action:'planning-request',type:'leave',startDate:'2026-11-01',endDate:'2026-11-02'};
const actions=['clock-in','clock-out','pause','resume','planning-request','planning-request-cancel','planning-open-shift-claim','planning-swap-request','planning-swap-claim','planning-opportunity-cancel'];
try{
await strict('signed identity wins over duplicate PIN and name when reading and requesting leave',fc.asyncProperty(fc.boolean(),async collision=>{await reset();const t=doc('team');t.members[0].pinCode=t.members[1].pinCode;if(collision)t.members[0].firstName=t.members[1].firstName;put('employee-access',{members:t.members});t.members.reverse();put('team',t);const r=await call();ok(r);assert.equal(r.body.employee.id,'a');assert.deepEqual(r.body.hours,{'2026-10-01':1});ok(await call({...leave,memberId:'b',merchant:other}));assert.equal(doc('team').planning.requests.at(-1).memberId,'a');}));
await strict('suspended and unpaid pending stores refuse every employee mutation without writing',fc.asyncProperty(fc.constantFrom('suspended','pending'),fc.constantFrom(...actions),async(status,action)=>{await reset();sql.prepare('UPDATE merchant_config SET status=? WHERE merchant=?').run(status,merchant);const before=sql.prepare('SELECT * FROM store_docs ORDER BY merchant,feature').all();const r=await call({...leave,action,attendanceCode});assert.equal(r.status,status==='pending'?402:403);assert.equal(r.body.error,status==='pending'?'subscription-required':'store-suspended');assert.deepEqual(sql.prepare('SELECT * FROM store_docs ORDER BY merchant,feature').all(),before);}));
await strict('stale durable auth revision and removal tombstones refuse reads and all writes',fc.asyncProperty(fc.boolean(),fc.constantFrom(...actions),async(removed,action)=>{await reset();if(removed){const t=doc('team');t.removed=[{id:'a',ts:Date.now()}];put('team',t);}else sql.prepare('INSERT INTO employee_auth_versions VALUES(?,?,?,?,?)').run(merchant,'a',1,secret(),Date.now());assert.equal((await call()).status,401);assert.equal((await call({...leave,action,attendanceCode})).status,401);}));
await strict('private projection isolates tenant and member and contains no roster credentials',fc.asyncProperty(fc.nat({max:100}),async n=>{await reset();const t=doc('team'),hidden=[t.members[0].pinCode,t.members[1].pinCode,t.members[1].phone,t.planning.requests[0].reason];put('attendance',{entries:[{id:'foreign-punch',staffId:'b',memberId:'b',inTs:1,outTs:2}]});put('employee-progress',{members:{b:{lifetimeXP:n+1}}});const r=await call();ok(r);assert.equal(r.body.merchant,merchant);assert.equal(r.body.employee.id,'a');assert.equal(r.body.attendance.recent.length,0);assert.equal(r.body.planning.requests.length,0);assert.equal(r.body.progress.lifetimeXP,0);const text=JSON.stringify(r.body),leaves=value=>value&&typeof value==='object'?Object.values(value).flatMap(leaves):[value];for(const value of hidden)assert.ok(!leaves(r.body).includes(value));for(const k of ['pinCode','password','phone','baseSalary'])assert.ok(!text.includes('"'+k+'"'));}));
await strict('employee cookie cannot read or overwrite owner documents through store API',fc.asyncProperty(fc.constantFrom('team','employee-access','payroll'),async feature=>{await reset();for(const route of [storeGet,storePost]){const r=await call(route===storeGet?undefined:{merchant,feature,data:{members:[]}},route,'/api/store?merchant='+merchant+'&feature='+feature);assert.ok([400,401,403].includes(r.status));}}));
await strict('employee pause/resume never mutate attendance, whether on or off shift',fc.asyncProperty(fc.boolean(),fc.constantFrom('pause','resume'),async(open,action)=>{await reset();if(open)put('attendance',{entries:[{id:'p',staffId:'a',memberId:'a',inTs:Date.now()-60000,outTs:0}]});const before=doc('attendance');assert.equal((await call({action,attendanceCode})).status,403);assert.deepEqual(doc('attendance'),before);}));
await strict('planning cancellation cannot cancel another member request and leave retries deduplicate',fc.asyncProperty(fc.integer({min:1,max:5}),async retries=>{await reset();ok(await call({action:'planning-request-cancel',requestId:'private-request',memberId:'b'}));assert.equal(doc('team').planning.requests[0].status,undefined);for(let i=0;i<retries;i++)ok(await call(leave));assert.equal(doc('team').planning.requests.filter(r=>r.memberId==='a').length,1);}));
await strict('invalid presence code refuses both punch actions without attendance changes',fc.asyncProperty(fc.constantFrom('clock-in','clock-out'),async action=>{await reset();const before=doc('attendance');assert.equal((await call({action,attendanceCode:'invalid'})).status,403);assert.deepEqual(doc('attendance'),before);}));
await strict('mixed two-device punch retries keep at most one open shift and nonnegative closed intervals',fc.asyncProperty(fc.array(fc.tuple(fc.constantFrom('clock-in','clock-out','pause','resume'),fc.constantFrom('clock-in','clock-out','pause','resume')),{minLength:1,maxLength:12}),async steps=>{await reset();for(const pair of steps){const rs=await Promise.all(pair.map(action=>call({action,attendanceCode,staffId:'b',memberId:'b',merchant:other})));rs.forEach((r,i)=>assert.equal(r.status,['pause','resume'].includes(pair[i])?403:200));const entries=doc('attendance').entries;assert.ok(entries.filter(e=>!e.outTs).length<=1);for(const e of entries){assert.equal(e.staffId,'a');assert.equal(e.memberId,'a');assert.ok(!e.outTs||e.outTs>=e.inTs);assert.ok(!e.pauseTs);assert.deepEqual(e.breaks||[],[]);}const closed=entries.filter(e=>e.outTs).sort((a,b)=>a.inTs-b.inTs);for(let i=1;i<closed.length;i++)assert.ok(closed[i].inTs>=closed[i-1].outTs);}}));
// Existing payroll suite owns same-action clock races and paid minute arithmetic.
// EP-1 tient : chaque pointage d'arrivée porte l'identité du geste (opId), gardée pour ses nouvelles tentatives.
await strict('EP-1 · a delayed clock-in retry after clock-out returns the shift it opened; a new tap opens the next one',fc.asyncProperty(fc.integer({min:1,max:3}),async retries=>{await reset();const opId=crypto.randomUUID();ok(await call({action:'clock-in',attendanceCode,opId}));ok(await call({action:'clock-out',attendanceCode}));for(let i=0;i<retries;i++){const r=await call({action:'clock-in',attendanceCode,opId});ok(r);assert.ok(r.body.entry.outTs>0);}assert.equal(doc('attendance').entries.length,1);ok(await call({action:'clock-in',attendanceCode,opId:crypto.randomUUID()}));const es=doc('attendance').entries;assert.equal(es.length,2);assert.equal(es.filter(e=>!e.outTs).length,1);}));
// EP-2 · un pointage gardé hors ligne garde son heure réelle, bornée : jamais dans le futur,
// jamais plus de 12 h automatiquement (sinon correction en attente), jamais avant le pointage précédent, et il porte
// la mention `deferred` avec le délai déclaré, que le gérant voit.
const H=3600000;
await strict('EP-2 · a deferred punch keeps its captured time, is marked deferred with its declared delay, never in the future, stale punches never count automatically, never before the previous punch',fc.asyncProperty(fc.integer({min:-2*H,max:16*H}),fc.integer({min:0,max:14*H}),fc.integer({min:0,max:H}),async(agoIn,prevOutAgo,stay)=>{
  await reset();const t=Date.now(),prevOut=t-prevOutAgo;
  // Un code de présence dont la fenêtre couvre tout l'essai : seules les bornes d'heure sont en jeu.
  put('attendance-code',{code:attendanceCode,createdTs:t-31*H,expiresTs:t+H});
  put('attendance',{entries:[{id:'prev',staffId:'a',memberId:'a',inTs:prevOut-H,outTs:prevOut}]});
  const before=doc('attendance'),t0=Date.now(),r=await call({action:'clock-in',attendanceCode,opId:crypto.randomUUID(),capturedAgoMs:agoIn}),t1=Date.now();
  const unchanged=error=>{assert.equal(r.status,409);assert.equal(r.body.error,error);assert.deepEqual(doc('attendance'),before);};
  if(agoIn>12*H){ok(r);assert.equal(r.body.pendingApproval,true);assert.deepEqual(doc('attendance'),before);return;}
  const ago=Math.max(0,agoIn);
  if(ago>0&&t1-ago<prevOut)return unchanged('attendance-capture-overlaps');
  if(ago>0&&t0-ago<prevOut)return;
  ok(r);const e=r.body.entry,inTs=e.inTs;
  assert.ok(inTs<=t1&&inTs>=prevOut);assert.ok(inTs>=Math.max(t0-ago,prevOut)&&inTs<=Math.max(t1-ago,prevOut));
  if(ago>0){assert.equal(e.deferred,true);assert.equal(e.inDeferredMs,ago);}else assert.ok(!e.deferred&&!e.inDeferredMs);
  const agoOut=Math.max(0,ago-stay),o=await call({action:'clock-out',attendanceCode,opId:crypto.randomUUID(),capturedAgoMs:agoOut}),t2=Date.now();
  ok(o);const x=o.body.entry,outTs=x.outTs;assert.ok(outTs<=t2&&outTs>=inTs);assert.ok(outTs>=Math.max(t1-agoOut,inTs)&&outTs<=Math.max(t2-agoOut,inTs));
  if(agoOut>0){assert.equal(x.deferred,true);assert.equal(x.outDeferredMs,agoOut);}else assert.ok(!x.outDeferredMs);}));
await strict('EP-7 · stale punches are durably retained once for manager approval without automatic hours',fc.asyncProperty(fc.constantFrom('clock-in','clock-out'),fc.integer({min:13,max:72}),async(action,age)=>{
  await reset();const before=doc('attendance'),hours=doc('team').hours,opId=crypto.randomUUID();
  for(let n=0;n<2;n++){const r=await call({action,opId,capturedAgoMs:age*H,deviceId:'synthetic-device',capturedAt:Date.now()-age*H});ok(r);assert.equal(r.body.pendingApproval,true);}
  assert.deepEqual(doc('attendance'),before);assert.deepEqual(doc('team').hours,hours);
  const items=doc('attendance-corrections').items;assert.equal(items.length,1);assert.equal(items[0].staffId,'a');assert.equal(items[0].status,'pending');assert.equal(items[0].deviceId,'synthetic-device');assert.ok(items[0].claimedTs<items[0].receivedTs-12*H);
}));
await strict('EP-7b · one person cannot flood the approval queue, and decided items older than 90 days leave the document',fc.asyncProperty(fc.integer({min:0,max:3}),async(extra)=>{
  await reset();const now=Date.now(),old={id:'old',opId:'old',staffId:'b',memberId:'b',action:'clock-in',claimedTs:1,capturedTs:1,receivedTs:1,status:'approved',decidedAt:now-91*24*H},recent={...old,id:'recent',opId:'recent',decidedAt:now-10*24*H};
  put('attendance-corrections',{items:[old,recent]});
  for(let n=0;n<20;n++){const r=await call({action:'clock-in',opId:'q'+n,capturedAgoMs:13*H});ok(r);assert.equal(r.body.pendingApproval,true);}
  for(let n=0;n<=extra;n++)assert.equal((await call({action:'clock-in',opId:'over'+n,capturedAgoMs:13*H})).status,429);
  const items=doc('attendance-corrections').items;
  assert.equal(items.filter(i=>i.status==='pending'&&i.staffId==='a').length,20);
  assert.ok(!items.some(i=>i.id==='old'),'a decision older than 90 days is pruned');assert.ok(items.some(i=>i.id==='recent'),'a recent decision stays');
}));
await strict('EP-8 · only attendance owners decide, self decisions fail, decisions are audited and atomic retries credit exactly once',fc.asyncProperty(fc.boolean(),fc.integer({min:1,max:4}),async(approve,retries)=>{
  await reset();const ts=Date.now();put('attendance',{entries:[{id:'old-open',staffId:'a',memberId:'a',inTs:ts-16*H,outTs:0}]});
  const retained=await call({action:'clock-out',opId:crypto.randomUUID(),capturedAgoMs:13*H,deviceId:'test-device'});ok(retained);
  const id=retained.body.correction.id,decision=approve?'approved':'rejected',body={merchant,action:'attendance-correction-decision',correctionId:id,decision};
  const before=doc('team').hours,employeeCookieValue=cookie;
  assert.equal((await call(body,teamLive)).status,403);
  cookie=TILL_COOKIE+'='+await tillToken(f.env.AUTH_SECRET,merchant);assert.equal((await call(body,teamLive)).status,403);
  const owner=sessionCookie(await makeSession('money-owner',f.env.AUTH_SECRET));
  cookie=owner+'; '+employeeCookieValue;assert.equal((await call(body,teamLive)).status,403);
  cookie=owner;
  const roster=doc('team');roster.members[0].email='money@example.test';put('team',roster);
  assert.equal((await call(body,teamLive)).status,403);
  delete roster.members[0].email;put('team',roster);
  const rs=await Promise.all(Array.from({length:retries},()=>call(body,teamLive)));rs.forEach(ok);
  const record=doc('attendance-corrections').items[0];assert.equal(record.status,decision);assert.equal(record.actor.id,'money-owner');assert.ok(record.decidedAt>=ts);
  const hours=JSON.stringify(doc('team').hours);ok(await call(body,teamLive));assert.equal(JSON.stringify(doc('team').hours),hours);
  if(approve){assert.ok(doc('attendance').entries[0].outTs>0);const added=Object.values(doc('team').hours.a).reduce((a,b)=>a+b,0)-Object.values(before.a).reduce((a,b)=>a+b,0);assert.ok(Math.abs(added-3)<0.001);}else{assert.equal(doc('attendance').entries[0].outTs,0);assert.deepEqual(doc('team').hours,before);}
  assert.equal((await call({...body,decision:approve?'rejected':'approved'},teamLive)).status,409);
}));
await strict('EP-9 · failed atomic approval leaves pending audit, attendance and hours intact',fc.asyncProperty(fc.integer({min:13,max:24}),async age=>{
  await reset();put('attendance',{entries:[{id:'open',staffId:'a',memberId:'a',inTs:Date.now()-(age+2)*H,outTs:0}]});
  const r=await call({action:'clock-out',opId:crypto.randomUUID(),capturedAgoMs:age*H});ok(r);
  const snapshot=['attendance-corrections','attendance','team'].map(feature=>doc(feature));
  sql.exec("CREATE TRIGGER fail_correction_credit BEFORE UPDATE ON store_docs WHEN NEW.feature='team' BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END");
  cookie=sessionCookie(await makeSession('money-owner',f.env.AUTH_SECRET));
  try {assert.equal((await call({merchant,action:'attendance-correction-decision',correctionId:r.body.correction.id,decision:'approved'},teamLive)).status,503);assert.deepEqual(['attendance-corrections','attendance','team'].map(feature=>doc(feature)),snapshot);} finally {sql.exec('DROP TRIGGER fail_correction_credit');}
}));
await strict('EP-10 · approved stale arrival and departure apply claimed times once while preserving legacy documents',fc.asyncProperty(fc.integer({min:14,max:72}),async age=>{
  await reset();const legacy={id:'legacy',staffId:'b',memberId:'b',inTs:1,outTs:2,custom:'preserved'};put('attendance',{entries:[legacy],custom:'preserved'});
  const inOp=crypto.randomUUID(),outOp=crypto.randomUUID();
  const a=await call({action:'clock-in',opId:inOp,capturedAgoMs:(age+2)*H}),b=await call({action:'clock-out',opId:outOp,capturedAgoMs:age*H});ok(a);ok(b);
  cookie=sessionCookie(await makeSession('money-owner',f.env.AUTH_SECRET));
  for(const r of [a,b])ok(await call({merchant,action:'attendance-correction-decision',correctionId:r.body.correction.id,decision:'approved'},teamLive));
  const attendance=doc('attendance'),e=attendance.entries.find(e=>e.staffId==='a');assert.deepEqual(attendance.entries[0],legacy);assert.equal(attendance.custom,'preserved');assert.equal(e.inTs,a.body.correction.claimedTs);assert.equal(e.outTs,b.body.correction.claimedTs);
}));
// EP-5 · un départ différé ne fait pas un service plus long que le plafond quotidien du planning.
await strict('EP-5 · a deferred clock-out never makes a shift longer than the planning maximum daily hours',fc.asyncProperty(fc.integer({min:4,max:12}),fc.integer({min:1,max:14}),fc.integer({min:1,max:60}),async(maxH,openH,agoMin)=>{
  await reset();const t=Date.now(),team=doc('team');team.planning={...team.planning,settings:{maxDailyHours:maxH}};put('team',team);
  put('attendance-code',{code:attendanceCode,createdTs:t-31*H,expiresTs:t+H});
  put('attendance',{entries:[{id:'open',staffId:'a',memberId:'a',inTs:t-openH*H,outTs:0}]});
  const before=doc('attendance'),hours=JSON.stringify(doc('team').hours),r=await call({action:'clock-out',attendanceCode,opId:crypto.randomUUID(),capturedAgoMs:agoMin*60000});
  const shift=openH*H-agoMin*60000;
  if(shift>maxH*H+5000){assert.equal(r.status,409);assert.equal(r.body.error,'attendance-shift-too-long');assert.deepEqual(doc('attendance'),before);assert.equal(JSON.stringify(doc('team').hours),hours);}
  else if(shift<maxH*H-5000){ok(r);assert.ok(r.body.entry.outTs>0);}}));
// EP-6 · un pointage différé ajoute, il ne déplace jamais un pointage déjà enregistré, et
// quand il est accepté il porte exactement l'heure déclarée.
await strict('EP-6 · a deferred punch only adds: recorded punches never move, and an accepted one carries its declared time',fc.asyncProperty(fc.array(fc.record({action:fc.constantFrom('clock-in','clock-out'),ago:fc.oneof(fc.constant(0),fc.integer({min:1,max:3*H}))}),{minLength:1,maxLength:8}),async steps=>{
  await reset();const t=Date.now();put('attendance-code',{code:attendanceCode,createdTs:t-31*H,expiresTs:t+H});
  for(const step of steps){
    const snap=doc('attendance').entries||[],t0=Date.now(),r=await call({action:step.action,attendanceCode,opId:crypto.randomUUID(),capturedAgoMs:step.ago}),t1=Date.now();
    const now=doc('attendance').entries||[];
    for(const e of snap){const k=now.find(x=>x.id===e.id);assert.ok(k);assert.equal(k.inTs,e.inTs);if(e.outTs)assert.equal(k.outTs,e.outTs);}
    if(!step.ago||r.status!==200||!r.body.entry)continue;
    const fresh=step.action==='clock-in'?!snap.some(e=>e.id===r.body.entry.id):!snap.find(e=>e.id===r.body.entry.id)?.outTs;
    if(!fresh)continue;
    const ts=step.action==='clock-in'?r.body.entry.inTs:r.body.entry.outTs;
    assert.ok(ts>=t0-step.ago&&ts<=t1-step.ago);}}));
// EP-3 · différé, le code de présence se vérifie à l'instant du geste : le code remplacé ne
// vaut que dans SA fenêtre, et en direct seul le code courant passe.
await strict('EP-3 · a deferred punch is checked against the presence code that was live when it was captured',fc.asyncProperty(fc.oneof(fc.constant(0),fc.integer({min:2*H-7*60000,max:2*H+60000}),fc.integer({min:1,max:3*H})),fc.boolean(),async(ago,useOld)=>{
  await reset();sql.exec("DELETE FROM store_docs WHERE feature='attendance-code'");
  const till=TILL_COOKIE+'='+await tillToken(f.env.AUTH_SECRET,merchant);
  const draw=async()=>(await teamLive({env:f.env,request:new Request('https://kiwi.test/api/team/live',{method:'POST',headers:{Cookie:till,'Content-Type':'application/json'},body:JSON.stringify({merchant,action:'generate-attendance-code'})})})).json();
  // A a vécu il y a deux heures ; la caisse l'a remplacé depuis par B.
  const A=await draw(),lived=doc('attendance-code');lived.createdTs-=2*H;lived.expiresTs-=2*H;put('attendance-code',lived);
  const B=await draw(),aStart=A.createdTs-2*H,aEnd=A.expiresTs-2*H;
  assert.ok(A.code!==B.code);assert.ok(!('recent' in B));
  const t0=Date.now(),r=await call({action:'clock-in',attendanceCode:useOld?A.code:B.code,opId:crypto.randomUUID(),capturedAgoMs:ago}),t1=Date.now();
  const lo=t0-ago,hi=t1-ago,refused=()=>{assert.equal(r.status,403);assert.equal(doc('attendance').entries.length,0);};
  if(useOld){
    if(ago>0&&lo>=aStart&&hi<=aEnd){ok(r);assert.ok(r.body.entry.inTs>=lo&&r.body.entry.inTs<=hi);}
    else if(ago===0||hi<aStart||lo>aEnd+10000)refused();
  }else if(ago===0)ok(r);
  // Le code lu maintenant ne date pas un geste d'avant sa naissance.
  else if(hi<B.createdTs)refused();}));
// EP-4 · un départ rejoué (réponse perdue) ne ferme pas le service suivant et ne crédite pas deux fois.
await strict('EP-4 · a replayed clock-out returns the shift it closed; it never closes the next shift or credits hours twice',fc.asyncProperty(fc.integer({min:1,max:3}),async retries=>{await reset();put('attendance-code',{code:attendanceCode,createdTs:Date.now()-3*H,expiresTs:Date.now()+H});const out=crypto.randomUUID();ok(await call({action:'clock-in',attendanceCode,opId:crypto.randomUUID(),capturedAgoMs:2*H}));ok(await call({action:'clock-out',attendanceCode,opId:out,capturedAgoMs:H}));const hours=JSON.stringify(doc('team').hours),xp=JSON.stringify(doc('employee-progress'));ok(await call({action:'clock-in',attendanceCode,opId:crypto.randomUUID()}));for(let i=0;i<retries;i++){const r=await call({action:'clock-out',attendanceCode,opId:out,capturedAgoMs:H});ok(r);assert.ok(r.body.entry.outTs>0);}const es=doc('attendance').entries;assert.equal(es.length,2);assert.equal(es.filter(e=>!e.outTs).length,1);assert.equal(JSON.stringify(doc('team').hours),hours);assert.equal(JSON.stringify(doc('employee-progress')),xp);}));
// No per-member suspension field or owner action exists in the team model.
// Revocation is tested above via tombstones and durable auth revisions.
}finally{f.close();}
console.log(`employee-properties: ${passed} strict passed, ${failed} failed, ${known} known; ${RUNS} cases/property; seed=${SEED}`);if(failed)process.exitCode=1;
