import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => fs.readFileSync('assets/' + name, 'utf8');
let failures=0;
function test(name, run) { try { run(); console.log('PASS '+name); } catch(e) { failures++; console.error('FAIL '+name+': '+e.message.split('\n')[0]); } }
const planning=read('employee-planning.js');
test('employee/serveur modal containment',()=>{
  assert.match(planning,/node.inert = true/); assert.match(planning,/node.inert = inert/);
  assert.match(planning,/event.key !== 'Tab'/); assert.match(planning,/stops.at\(-1\)/);
  assert.match(planning,/back.focus/);
});
test('earlier chronological notices',()=>{assert.match(planning,/<details>/);assert.match(planning,/if \(historyOpen\)[^\n]*history\.open = true/);assert.match(planning,/allNotices.slice\(0,-3\).map/);});
test('menu native switch',()=>{assert.match(read('menu-catalog.js'),/<button type="button" class="sw /);});
test('onboarding semantic handoff',()=>{
 const s=read('onboarding.js');assert.doesNotMatch(s,/setTimeout\(enterApp/);assert.doesNotMatch(s,/setTimeout\([^\n]*first.focus/);assert.match(s,/destination.focus/);
});
test('returns amount confirmation',()=>{assert.doesNotMatch(read('pages-pro/boutique-promos-returns.js'),/window.confirm/);assert.match(read('credit-cancel-dialog.js'),/credit.balanceCents/);});
test('creditbook bounded history',()=>{
 assert.match(read('pos-epicerie.js'),/bindHistoryPages\(el, hist/);assert.doesNotMatch(read('pos-epicerie.js'),/hist.map/);
 const s=read('credit-history-page.js');const fn=s.slice(s.indexOf('function historyPage'),s.indexOf('export function bind'));
 const context={};vm.runInNewContext(fn,context);const rows=Array.from({length:123},(_,i)=>i);
 assert.equal(context.historyPage(rows).length,50);assert.equal(context.historyPage(rows,2).length,23);assert.equal(context.historyPage(rows,1)[0],50);
});
test('console refresh preserves note and selection',()=>{
 const s=read('admin-workspace.js');const poll=s.slice(s.indexOf('  setInterval(function(){freshness()'));
 assert.doesNotMatch(poll,/state.route!==.merchant/);assert.match(s,/panel.innerHTML=fresh.querySelector/);assert.match(s,/if\(state.tab==='summary'&&note&&note.dataset.note===state.merchant\)/);assert.match(s,/dossier actualisé automatiquement/);
});
if(failures)process.exit(1);
