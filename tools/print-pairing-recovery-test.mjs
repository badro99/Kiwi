import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const pairing = fs.readFileSync('assets/caisse-pairing.js', 'utf8');
const ui = fs.readFileSync('assets/printer/pairing-ui.js', 'utf8');
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('✓ ' + name); } catch(e) { failures++; console.error('✗ ' + name + ': ' + e.message); } }
await test('empty successful roster removes an online identity', async () => {
  let handler, cleared = false, asked = false;
  const window = { KiwiStaff: {id:'departed'}, KiwiRoles: {rosterHolds: rows => rows.length > 0}, addEventListener: (_, fn) => handler = fn };
  vm.runInNewContext(pairing.slice(pairing.indexOf("  if (window.addEventListener) window.addEventListener('online'"), pairing.indexOf('  if (pairedVenue()) offlinePinRows')), {window, activeVenue:()=>({merchant:'fixture'}), pinsFor:async()=>({pins:[]}), setStaff:()=>{cleared=true;}, askStaff:()=>{asked=true;}});
  handler(); await new Promise(resolve=>setImmediate(resolve));
  assert.ok(cleared && asked);
});
await test('stalled roster response and body have a bounded deadline', async () => {
  const fn = pairing.slice(pairing.indexOf('  function pinsFor('), pairing.indexOf('  // Gate a fresh register'));
  for (const bodyStalls of [false,true]) {
    let timeout, cleared = false, signal;
    const ctx = {Promise, Error, AbortController, encodeURIComponent, setTimeout:fn=>{timeout=fn;return 1;}, clearTimeout:()=>{cleared=true;}, offlinePinRows(){}, window:{}, fetch:(_,opts)=>{signal=opts.signal;return bodyStalls ? Promise.resolve({ok:true,json:()=>new Promise(()=>{})}) : new Promise(()=>{});}};
    vm.createContext(ctx); vm.runInContext(fn,ctx);
    const result = ctx.pinsFor('fixture'); await Promise.resolve();
    assert.equal(typeof timeout,'function'); timeout();
    await assert.rejects(result,/timeout/); assert.ok(signal.aborted && cleared);
  }
});
await test('refused and network reprints announce retry and retain the row', async () => {
  /* relayJobRow (pairing-ui.js) draws one relay job with its « Réimprimer » button, for the
     relay list and the « Tickets non imprimés » view alike: run the function itself. */
  const start = ui.indexOf('    function relayJobRow(');
  const end = ui.indexOf('    /* La liste du mode « recovery »', start);
  assert.ok(start > 0 && end > start, 'relayJobRow is in pairing-ui.js');
  for (const answer of [{status:0,j:null},{status:409,j:{ok:false}},null,{status:200,j:{ok:true}}]) {
    let removed=false, done=0; const btn={}, messages=[];
    const row={className:'',set innerHTML(_){},querySelector:selector=>selector==='button'?btn:selector==='[role="alert"]'?messages[0]||null:null,remove:()=>{removed=true;},appendChild:node=>messages.push(node)};
    const ctx={relayMerchantQS:()=>'',relayFetch:()=>answer===null?Promise.reject(Error('offline')):Promise.resolve(answer),say:s=>s,unprintedWhat:()=>'',esc:String,window:{},
      document:{createElement:(tag)=>tag==='div'?row:({setAttribute(){}})},JSON};
    vm.createContext(ctx); vm.runInContext(ui.slice(start,end), ctx);
    const out = ctx.relayJobRow({id:'fixture',status:'expired'}, () => { done++; });
    assert.equal(out, row);
    btn.onclick.call(btn); await new Promise(resolve=>setImmediate(resolve));
    if (answer && answer.j && answer.j.ok) { assert.ok(removed && done === 1, 'an accepted reprint removes the row and reports it'); continue; }
    assert.equal(btn.disabled,false); assert.equal(removed,false); assert.equal(done,0);
    assert.ok(messages.some(node=>node.textContent && /réessayez/.test(node.textContent)));
  }
});
process.exitCode = failures ? 1 : 0;
