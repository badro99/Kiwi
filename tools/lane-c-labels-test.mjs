import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
export function grab(file, name) {
  const s = fs.readFileSync(file, 'utf8'), i = s.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let depth = 0;
  for (let k = s.indexOf('{', i); k < s.length; k++) {
    if (s[k] === '{') depth++;
    if (s[k] === '}' && --depth === 0) return s.slice(i, k + 1);
  }
  throw Error(name);
}
export function named(html, attr) {
  const input = html.match(new RegExp('<(?:input|select)\\b[^>]*' + attr + '[^>]*>'))?.[0];
  assert.ok(input, attr);
  const id = input.match(/\bid="([^"]+)"/)?.[1];
  assert.ok(/aria-label="[^"]+"/.test(input) || (id && html.includes('for="' + id + '"')), attr + ' accessible name');
  return input;
}
let failures = 0;
async function test(name, run) { try { await run(); console.log('✓ ' + name); } catch (e) { failures++; console.error('✗ ' + name + ': ' + e.message); } }
await test('clients#0 hotel#2 generated hotel form labels', () => {
  let html;
  const node = {};
  const ctx = { hospitalityMode: () => true, esc: String, genderOpts: () => '', sheet: h => { html = h; }, document: { getElementById: () => ({ querySelector: () => node }) }, closeSheet() {} };
  // Stop after rendering: subsequent code wires save handlers and loads loyalty controls.
  const body = grab('assets/clients-book/profiles.js', 'openForm').split("    var sh = document.getElementById('kcb-sheet');")[0] + '}';
  vm.runInNewContext(body + ';openForm(null)', ctx);
  for (const id of ['doc-type','doc-number','nationality','language','room','food','allergies','access']) named(html, 'id="kcb-f-' + id + '"');
});
for (const semantics of [true, false]) await test(semantics ? 'stock#0 movement field associations' : 'stock#1 explicit movement translations in all locales', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync('assets/stock/strings.js', 'utf8'), { window });
  for (const lang of ['fr','en','ar']) {
    let html;
    const calls = [];
    const ctx = { wireDismiss() {}, getInv: () => [{ id: 'x', name: 'Test', unit: 'kg' }], window: { Kiwi: { modal: o => { html = o.body; return { el: { querySelector: () => null } }; } } }, esc: String, fmtUnit: String, currentStockFor: () => 0, svg: () => '', t: (k) => { calls.push(k); return window.KiwiStockStrings[lang][k]; } };
    vm.runInNewContext(grab('assets/stock/catalog.js','openItemMovement') + ';openItemMovement("x")',ctx);
    if (semantics) for (const key of ['qty','note','dlc']) named(html, 'data-stock-move-' + key + '\\b');
    if (!semantics) assert.ok(calls.includes('moveQty') && calls.includes('moveNote') && calls.includes('moveExpiry'), lang + ' explicit lookups');
    assert.ok(!html.includes('undefined'));
  }
});
await test('till#1 tables#0 both table renderers localize accessible names', () => {
  for (const lang of ['fr','en','ar']) for (const status of ['khawya','a-commander','ka-yaklo','bgha-ykhlass','khlass']) {
    const tr = s => '[' + lang + ':' + s + ']';
    const ctx = { window: { KiwiCaisseLang: { tr } }, servers: {}, escTeam: String, phoneBadgeHTML: () => '', caisseRing: () => ({}), caisseNoirChairs: () => '', caisseNoirTableBody: () => '', caisseJour: () => true };
    for (const render of ['designedTableHTML','caisseNoirCellHTML']) {
      const call = render === 'designedTableHTML' ? `designedTableHTML("A", {status:"${status}", covers:2})` : `caisseNoirCellHTML({id:"A",status:"${status}",covers:2,x:0,y:0,w:50,h:50})`;
      const html = vm.runInNewContext(grab('assets/caisse-floor/plan-drawing.js',render) + ';' + call,ctx);
      const label = html.match(/aria-label="([^"]+)"/)[1];
      const statusLabel = ['Libre','À commander','En cours','Addition','Réglée'][['khawya','a-commander','ka-yaklo','bgha-ykhlass','khlass'].indexOf(status)];
      assert.equal(label, `${tr('Table')} A, ${tr(statusLabel)}, 2 ${tr('couverts')}`, render + ' ' + lang);
    }
  }
});
await test('kitchen#0 skins#2 print#2 history icons match vendored Material paths', () => {
  const nodes = {};
  const ctx = { $: s => nodes[s] ||= {}, kdsOrders: [], kdsStationBar: () => '', kdsGroup: () => [], kdsKitOn: () => false, kdsEmpty: () => '', updateKdsCount() {}, kdsEsc: String, window: { KiwiCaisseLang: { tr: s => s } } };
  vm.runInNewContext(grab('assets/caisse-kitchen/kds-board.js','kdsPaint') + ';kdsPaint()',ctx);
  for (const [sel, icon] of [['#kit-history-toggle','history'],['#kit-history-inner','close']]) {
    const d = fs.readFileSync('assets/icons/material/' + icon + '.svg','utf8').match(/d="([^"]+)"/)[1];
    assert.ok(nodes[sel].innerHTML.includes(d), icon);
    assert.ok(!nodes[sel].innerHTML.includes('stroke='));
  }
});
await test('kitchen#1 generated recipe close name uses host locale', () => {
  const bd = { classList: { add() {} }, addEventListener() {} };
  const ctx = { document: { querySelectorAll: () => [], createElement: () => bd, body: { appendChild() {} } }, KDS_RECIPES: {}, KDS_SVG: {}, kdsEsc: String, requestAnimationFrame() {}, window: { KiwiCaisseLang: { tr: () => 'Close translated' } } };
  vm.runInNewContext(grab('assets/caisse-kitchen/kds-board.js','kdsOpenRecipe') + ';kdsOpenRecipe("Test")',ctx);
  assert.ok(bd.innerHTML.includes('aria-label="Close translated"'));
});
await test('kitchen#2 rejected recall explains failure and restores ticket', async () => {
  const o = { num: 1, opId: 'test', status: 'ready', readyAt: '12:00', items: [{ stationReady: true, stationAccepted: false, stations: [] }] }, messages = [];
  const ctx = { kdsOrders: [o], kdsActiveStation: 'all', kdsViewStatus: o => o.status, kdsPaint() {}, ticketNo: () => '1', toast: s => messages.push(s), opPush: () => Promise.reject(Error('offline')), window: { KiwiCaisseLang: { tr: s => s } } };
  vm.runInNewContext(grab('assets/caisse-kitchen/kds-board.js','kdsRecall') + ';kdsRecall(1)',ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(messages.some(s => /non confirmé/.test(s)), 'operator failure explanation');
  assert.equal(o.status, 'ready'); assert.equal(o.readyAt,'12:00'); assert.equal(o.items[0].stationReady,true); assert.equal(o.recallPendingUntil,0);
});
if (failures) process.exitCode = 1;
