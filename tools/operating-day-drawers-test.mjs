import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const memory = new Map();
const storage = { getItem:k=>memory.get(k)||null, setItem:(k,v)=>memory.set(k,String(v)) };
const node = () => ({
  dataset:{}, style:{}, classList:{add(){},remove(){},toggle(){}},
  addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){},
  setAttribute(){}, removeAttribute(){}, getAttribute(){return null;},
  querySelector(){return null;}, querySelectorAll(){return [];},
  textContent:'', innerHTML:'', id:'', click(){},
});
const document = {
  head:node(), body:node(), documentElement:node(),
  createElement:node, getElementById(){return null;},
  querySelector(){return null;}, querySelectorAll(){return [];},
};
let dashPage = null;
const ctx = { console, Date, Intl, localStorage:storage, setTimeout(){},
  window:{ localStorage:storage, KiwiEnv:{isReal:()=>true}, addEventListener(){},
    KiwiCloudDoc:null, KiwiI18n:{getLang:()=> 'fr'},
    KiwiVenue:{ isCustom:()=>true, getCurrentVenue:()=> 'qa-drawers', getCurrentVenueData:()=>({slug:'qa-drawers',name:'QA'}) },
    Kiwi:{ handlers:{}, appPage:(_nav,data)=>{ dashPage=data; return {el:node()}; } },
  }, document };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../assets/day-report.js',import.meta.url),'utf8'),ctx);
const R=ctx.window.KiwiDayReport;
const day='2026-09-08',store={slug:'qa-drawers',name:'QA'};
const ts=h=>Date.parse('2026-09-08T'+h+':00Z');
const sale=(id,amount,h,kind)=>({id,amount,ts:ts(h),method:'cash',kind});
const morning=[sale('a',70,'11:30'),sale('b',35,'11:33'),sale('c',25,'11:40'),sale('d',10,'11:46')];
const afternoon=[sale('e',45,'12:09'),sale('r',-10,'12:10','refund')];
const build=(sales,session)=>R.build({day,store,sales,session});
const one=build(morning,{sessionId:'s1',openedAt:ts('11:28'),closedAt:ts('11:56'),openingFloat:500,countedCash:640,closedBy:'Owner'});
assert.equal(one.cash.ecart,0); R.save(one);
const twoSession={sessionId:'s2',openedAt:ts('12:03'),openingFloat:500,closedBy:'Wrong current cashier',cashMovements:[{ts:ts('12:11'),type:'in',amount:50}]};
const open=build(afternoon,twoSession);
assert.equal(open.closedBy,'');
R.save(open,{reopen:false,note:'en cours'});
R.save(build(afternoon,twoSession),{reopen:false,note:'en cours'});
assert.equal(R.load(day,store.slug).closedCount,1);
assert.equal(R.closureRevisions(R.load(day,store.slug)).length,1);
const two=build(afternoon,{...twoSession,closedAt:ts('12:12'),countedCash:585,closedBy:'Owner'});
assert.equal(two.cash.ecart,0);R.save(two);R.save({...two});
const snap=R.load(day,store.slug);
assert.equal(snap.closedCount,2,'retry of same close is idempotent');
assert.equal(R.closureRevisions(snap).length,2,'autosaves are not closures');
assert.equal(snap.drawerSessions.length,2,'both drawers retained');
assert.deepEqual(Array.from(snap.drawerSessions,s=>s.cash.ecart),[0,0]);
const daily=R.inheritDrawers(build(morning.concat(afternoon),{...twoSession,closedAt:two.closedAt,countedCash:585}),snap);
assert.equal(daily.net,175);assert.equal(daily.gross,185);assert.equal(daily.txns,5);
assert.equal(daily.cash.expected,585,'daily refresh must not invent725 expected');
assert.equal(daily.cash.ecart,0);
assert.deepEqual(Array.from(R.drawerSessions(daily),s=>s.cash.expected),[640,585]);
assert.equal(R.closureRevisions({revisions:[{at:1,note:'en cours'},{at:2,note:'clôture'},{at:2,note:'clôture'},{at:3,note:'réouverture'}]}).length,2);
const legacy={...two};delete legacy.drawerSessions;delete legacy.sessionId;
const legacyDay=R.inheritDrawers(build(morning.concat(afternoon),{}),legacy);
assert.equal(legacyDay.cash.ecart,0,'legacy drawer evidence survives feed rebuild');
assert.equal(R.drawerSessions(legacyDay).length,1,'do not invent missing historical drawers');

/* Session identity is terminal + session, not sessionId alone. Two terminals
 * can legitimately reuse the same till session key without collapsing their
 * counted evidence into one drawer. */
const collisionDay='2026-09-09';
const collision=(reportDay,terminalId,openedAt,closedAt,countedCash)=>R.build({day:reportDay,store,sales:[],session:{
  sessionId:'same-session-key', terminalId, openedAt, closedAt,
  openingFloat:500, countedCash, closedBy:'Owner',
}});
R.save(collision(collisionDay,'terminal-a',ts('13:00'),ts('13:10'),500));
R.save(collision(collisionDay,'terminal-b',ts('13:20'),ts('13:30'),500));
const collisionSnap=R.load(collisionDay,store.slug);
assert.equal(R.drawerSessions(collisionSnap).length,2,'same session key on distinct terminals stays distinct');
assert.equal(R.closureRevisions(collisionSnap).length,2,'terminal/session collision keeps both closure events');

/* Cloud snapshots are not additive reports. A stale open snapshot for the
 * same terminal/session may have a later client clock, but it must not erase
 * the already-counted final drawer or its author. The production merge helper
 * keeps the explicit closure revision and marks the contradictory overlap. */
const cloudDay='2026-09-10';
const cloudTs=h=>Date.parse('2026-09-10T'+h+':00Z');
const finalDrawer=R.build({day:cloudDay,store,sales:[{id:'cloud-sale',amount:85,ts:cloudTs('14:05'),method:'cash'}],session:{
  sessionId:'same-session-key', terminalId:'cloud-terminal', openedAt:cloudTs('14:00'),
  closedAt:cloudTs('14:10'), openingFloat:500, countedCash:585, closedBy:'Owner',
}});
R.save(finalDrawer,{by:'Owner'});
const finalSnapshot=R.load(cloudDay,store.slug);
const staleSnapshot=R.build({day:cloudDay,store,sales:[],session:{
  sessionId:'same-session-key', terminalId:'cloud-terminal', openedAt:cloudTs('14:00'),
  openingFloat:500, countedCash:725, closedBy:'Wrong stale actor',
}});
staleSnapshot.builtAt=Number(finalSnapshot.builtAt)+100000;
staleSnapshot.cash.expected=725;
const merged=R.mergeDaySnapshots(finalSnapshot,staleSnapshot);
assert.equal(R.drawerSessions(merged)[0].cash.expected,585,'stale cloud snapshot cannot replace final drawer expected');
assert.equal(merged.closed,true,'stale open snapshot cannot reopen final aggregate');
assert.equal(merged.closedBy,'Owner','stale snapshot cannot erase closure actor');
assert.equal(merged.closedCount,1,'overlapping snapshots do not double-count closure');
assert.equal(R.closureRevisions(merged).length,1,'overlapping snapshots keep one explicit closure revision');
assert.equal(merged.snapshotConflicts.length,1,'contradictory same-session snapshots are explicitly flagged');

/* Load the production dashboard resolver and both export surfaces. The seam is
 * the same local report store and KiwiSales/KiwiRefunds adapters used by the
 * shipped modules; no resolver or export arithmetic is copied into this test. */
const feedSales=morning.concat([sale('e',45,'12:09')]);
ctx.window.KiwiSales={list:()=>feedSales};
ctx.window.KiwiRefunds={list:()=>[sale('r',10,'12:10','refund')]};
ctx.window.KiwiLive={status:()=>({on:false,backfillComplete:false})};
R.today=()=>day;
R.lastClosedDay=()=>day;
for (const file of ['../assets/day-report-export.js','../assets/day-report-dash.js']) {
  vm.runInContext(fs.readFileSync(new URL(file,import.meta.url),'utf8'),ctx,{filename:file});
}
assert.equal(typeof ctx.window.Kiwi.handlers['nav-rapport'],'function','dashboard report route is installed');
ctx.window.Kiwi.handlers['nav-rapport']();
assert.ok(dashPage && dashPage.body,'dashboard resolver rendered a report page');
assert.match(dashPage.body,/175(?:[.,]00)?\s*MAD/,'dashboard displays net 175');
assert.match(dashPage.body,/185(?:[.,]00)?\s*MAD/,'dashboard displays gross 185');
assert.match(dashPage.body,/640(?:[.,]00)?\s*MAD/,'dashboard displays first drawer expected 640');
assert.match(dashPage.body,/585(?:[.,]00)?\s*MAD/,'dashboard displays latest drawer expected 585, not 725');
assert.doesNotMatch(dashPage.body,/Wrong current cashier/,'open-session actor is absent from the closed-actor surface');

const Export=ctx.window.KiwiDayReportExport;
const resolved=Export.resolveCurrent();
assert.equal(resolved.net,175,'export resolver returns net 175');
assert.equal(resolved.gross,185,'export resolver returns gross 185');
assert.equal(resolved.cash.expected,585,'export resolver keeps latest expected 585');
assert.deepEqual(Array.from(R.drawerSessions(resolved),s=>s.cash.expected),[640,585],'export resolver keeps both drawer expected values');
const csv=Export.build(resolved,{summary:true,payments:true});
const html=Export.reportHtml(resolved,{summary:true,payments:true});
assert.match(csv,/"Attendu","640"/,'CSV contains first drawer expected 640');
assert.match(csv,/"Attendu","585"/,'CSV contains latest drawer expected 585');
assert.match(html,/640(?:,00)?\s*MAD/,'HTML contains first drawer expected 640');
assert.match(html,/585(?:,00)?\s*MAD/,'HTML contains latest drawer expected 585');
const openHtml=ctx.window.KiwiDayReportExport.reportHtml(open,{summary:true,payments:true});
assert.doesNotMatch(openHtml,/Wrong current cashier/,'HTML export omits closed actor while drawer is open');
R.save(open,{reopen:false,note:'en cours'});
dashPage=null;
ctx.window.Kiwi.handlers['nav-rapport']();
assert.ok(dashPage && dashPage.body,'dashboard resolver rendered the open report');
assert.match(dashPage.body,/175(?:[.,]00)?\s*MAD/,'open dashboard resolver keeps net 175');
assert.doesNotMatch(dashPage.body,/Fermé par|Wrong current cashier/,'open dashboard resolver omits closed actor');
console.log('✓ operating-day drawers: two services, refund, movement, reopen, close retries and legacy snapshot');
