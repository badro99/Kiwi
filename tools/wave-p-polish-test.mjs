import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = f => fs.readFileSync(f, 'utf8');
let failures = 0;
async function test(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message.split('\n')[0]); } }
await test('invoice brand tokens', () => {
 const css = read('assets/invoicing.css');
 assert.match(css, /--inv-deep:\s*var\(--riad\)/);
 assert.match(css, /--inv-paper:\s*var\(--paper\)/);
 assert.match(css, /\.inv-preview\s*\{[^}]*background:\s*var\(--paper\)/);
 assert.doesNotMatch(css, /background:\s*#fff\s*[;}]/i);
 assert.doesNotMatch(css, /font-weight:\s*(?:750|800|900)/);
});
await test('planning weights and both phone presentations', () => {
 const css = read('assets/planning-ui.css');
 assert.doesNotMatch(css, /font-weight:\s*800/);
 for (const selector of ['kt-period-arrow','kt-period-current','kt-pd-pill','kt-pd-row','kt-plan-cell'])
  assert.ok([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(([,selectors,body]) => selectors.includes('.'+selector) && body.includes('min-height:44px')), selector);
 assert.doesNotMatch(css, /grid-template-columns:34px/);
});
await test('visible base skin with bounded enhancement', () => {
 for (const f of fs.readdirSync('.').filter(f => f.endsWith('.html') && !/ \d+\.html$/.test(f))) {
  const html = read(f); if (!html.includes("s.id = 'k-cloak'")) continue;
  assert.doesNotMatch(html, /body\{visibility:hidden;opacity:0\}/, f);
  assert.match(html, /setTimeout\(go, (?:[1-9]\d?|[1-4]\d\d|500)\)/, f);
 }
});
await test('legacy rows purged before boot and never accepted', () => {
 const source = read('assets/caisse-pairing.js');
 assert.doesNotMatch(source, /row\.digest \|\|/);
 assert.match(source, /offlinePinRows\(pairedVenue\(\)\.merchant\)/);
 assert.doesNotMatch(source, /if \(!v2\) rememberOfflinePin/);
});
await test('device coverage and unavailable crypto', async () => {
 const {coverageText} = await import('../assets/offline-pin-coverage.js');
 assert.match(coverageText(['Alice'], s=>s), /Alice/);
 assert.match(coverageText(['Alice'], s=>s), /une fois/);
 assert.doesNotMatch(coverageText(['Alice'], s=>s, false), /Alice/);
 assert.match(coverageText(['Alice'], s=>s, false), /indisponible/);
});
await test('bounded controller interfaces reject a new owner', async () => {
 assert.match(read('tools/file-size-ratchet-test.mjs'), /const fail = checkInterfaces/);
 const {checkInterfaces} = await import('./controller-interfaces.mjs');
 const baseline = JSON.parse(read('tools/controller-interfaces.json'));
 assert.deepEqual(checkInterfaces(read, baseline), []);
 const file = Object.keys(baseline)[0];
 assert.ok(checkInterfaces(f => read(f) + (f === file ? '\nwindow.UnrelatedFeature = {};\n' : ''), baseline).length);
 assert.ok(checkInterfaces(f => read(f) + (f === file ? '\nfunction unrelatedFeature() {}\n' : ''), baseline).length);
});
if (failures) process.exitCode = 1;
