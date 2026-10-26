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
  const start = ui.indexOf("            var i18n = window.KiwiI18n, dict");
  const end = ui.indexOf('            list.appendChild(row);',start);
  for (const answer of [{status:0,j:null},{status:409,j:{ok:false}},null]) {
    let removed=false; const btn={}, messages=[];
    const row={querySelector:selector=>selector==='button'?btn:null,remove:()=>{removed=true;},appendChild:node=>messages.push(node)};
    vm.runInNewContext(ui.slice(start,end), {row,job:{id:'fixture'},relayMerchantQS:()=>'',relayFetch:()=>answer===null?Promise.reject(Error('offline')):Promise.resolve(answer),say:s=>s,esc:String,window:{},document:{createElement:()=>({setAttribute(){}})}});
    btn.onclick.call(btn); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(btn.disabled,false); assert.equal(removed,false);
    assert.ok(messages.some(node=>node.textContent && /réessayez/.test(node.textContent)));
  }
});
process.exitCode = failures ? 1 : 0;
