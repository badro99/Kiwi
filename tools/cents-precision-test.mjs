import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = f => fs.readFileSync(new URL('../assets/' + f, import.meta.url), 'utf8');
function declaration(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  for (let end = src.indexOf('}', start); end >= 0; end = src.indexOf('}', end + 1)) {
    const text = src.slice(start, end + 1);
    try { new vm.Script('(' + text + ')'); return text; } catch {}
  }
  throw Error(name);
}
let failed = 0;
function test(name, run) { try { run(); console.log('PASS ' + name); } catch(e) { failed++; console.error('FAIL ' + name + ': ' + e.message); } }
const sold = read('sold-insights.js');
test('home quantities preserve stored fractions', () => {
  const ctx = { window: { addEventListener() {} }, document: {}, localStorage: { getItem() {} }, setTimeout() {}, console };
  vm.runInNewContext(sold, ctx);
  const a = ctx.window.KiwiSoldInsights.analyze([{ts: Date.now(), ref:'fraction', amount:10.25, lines:[{name:'Dish',qty:0.333,total:10.25}]}], 7);
  assert.equal(a.units, 0.333);
});
test('home revenue displays centimes and keeps whole style', () => {
  const fmt = vm.runInNewContext('(' + declaration(sold, 'fmt') + ')', { window:{}, document:{documentElement:{lang:'en'}} });
  assert.equal(fmt(10.25), '10.25'); assert.equal(fmt(10), '10'); assert.equal(fmt(10.5), '10.50');
  assert.equal(fmt(-1.005), '-1.01'); assert.equal(fmt(1e-8), '0');
});
test('dayreport preserves three decimal quantities', () => {
  const qty = vm.runInNewContext('(' + declaration(read('day-report-dash.js'), 'qty') + ')');
  for (const v of [0.333, 0.334, 1.125, 2]) assert.equal(qty(v), String(v));
});
test('tables reopening preserves quantity and total', () => {
  const src = read('caisse-app.js');
  const start = src.indexOf('snap.lines.slice(0, 40).map(');
  const end = src.indexOf('}));', start);
  const map = vm.runInNewContext('(snap) => ' + src.slice(start, end + 2));
  for (const qty of [0.001, 0.333, 0.334, 1.125, 2]) {
    const line = map({lines:[{name:'Dish', qty, total:10.25}]})[0];
    assert.equal(line.qty, qty); assert.equal(line.price * qty, 10.25);
  }
});
for (const file of ['pos-boutique.js', 'pos-maison.js']) test(file + ' return history keeps centimes', () => {
  const ctx = { IS_DEMO:false, P:{}, STAFF:{}, RETURN_LOG:[], saleClient:()=>null, persistReturnLog(){}, ensureReturnCloud:()=>null };
  vm.runInNewContext(declaration(read(file), 'recordReturn') + '\nglobalThis.record = recordReturn;', ctx);
  for (const [unit, qty, expected] of [[10.25,1,10.25],[1.005,1,1.01],[2.01,0.5,1.01],[-1.005,1,-1.01],[0.01,0.000001,0]]) {
    ctx.record({id:'test',lines:[{name:'Dish',unit}]}, [0], unit * qty, '', 'refund', '', new Map([[0,qty]]));
    assert.equal(ctx.RETURN_LOG[0].amount, expected); assert.equal(ctx.RETURN_LOG[0].items[0].amount, expected);
  }
});
test('returns voucher formatter keeps centimes and whole style', () => {
  const src = read('pos-boutique/sales.js');
  const line = src.split('\n').find(l => l.includes('const fmtMAD ='));
  const fmt = vm.runInNewContext(line + '\nfmtMAD');
  assert.equal(fmt(10.25), '10,25 MAD'); assert.equal(fmt(10), '10 MAD'); assert.equal(fmt(-1.005), '-1,01 MAD');
});
process.exitCode = failed ? 1 : 0;
