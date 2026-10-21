import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = fs.readFileSync('assets/pages-pro.js', 'utf8');
const registry = source.slice(source.indexOf('/* First-use sections.'), source.indexOf('/* ═══ Section 2 spa · practitioners'));
const entries = [...registry.matchAll(/url: '([^']+)', handlers: (\[[^\]]+\])/g)];
assert.equal(entries.length, 1);
for (const [, url, list] of entries) {
  const chunk = fs.readFileSync(url.split('?')[0], 'utf8');
  // Render against the frozen unsplit output without a DOM or browser.
  let output;
  const originalH = {};
  vm.runInNewContext(chunk, {window:{Kiwi:{handlers:originalH,appPage:(_name,opts)=>{output=opts; return {el:{}};}}},document:{documentElement:{lang:'fr'}},setTimeout(){}});
  originalH['nav-appointments']();
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex'),JSON.parse(fs.readFileSync('tools/pages-pro-spa-reference.json','utf8')).sha);
  assert.deepEqual(JSON.parse(list).sort(), [...chunk.matchAll(/handlers\['([^']+)'\]\s*=/g)].map(m => m[1]).sort());
  assert.equal(require('./stamps.js').scan().get(url.split('?')[0]).sites.some(s => s.kind === 'lazy'), true);
  const tags = [], toasts = [], H = {};
  const document = { baseURI: 'https://kiwi.test/dashboard.html', currentScript: null, createElement: () => ({ remove() {} }), head: { appendChild: s => tags.push(s) } };
  const ctx = vm.createContext({ window: { Kiwi: { handlers: H, toast: (...a) => toasts.push(a) } }, document, URL });
  vm.runInContext(registry, ctx);
  const captured = H['nav-appointments'];
  H['nav-appointments'] = function () { return captured.apply(this, arguments); };
  const wrapper = H['nav-appointments'];
  const self = {}, args = [{}, 'arg'];
  const a = captured.apply(self, args), b = H['nav-services']();
  assert.equal(tags.length, 1, 'concurrent handlers deduplicate');
  tags[0].onerror();
  await Promise.all([a,b]);
  assert.equal(toasts.length, 2, 'failure resolves with existing error toast');
  const retry = captured.apply(self, args);
  assert.equal(tags.length, 2, 'failed request retries');
  document.currentScript = { src: new URL(url, document.baseURI).href };
  let calls = 0;
  for (const name of JSON.parse(list)) H[name] = function (...received) {
    if (name === 'nav-appointments') { calls++; assert.equal(this, self); assert.deepEqual(received, args); }
    return 'real';
  };
  document.currentScript = null;
  assert.equal(H['nav-appointments'], wrapper, 'registration preserves captured wrapper');
  tags[1].onload();
  assert.equal(await retry, 'real');
  assert.equal(calls, 1, 'captured stub reaches real handler without recursion');
  assert.equal(captured.apply(self, args), 'real');
  assert.equal(tags.length, 2, 'success stays loaded');
}
console.log('✓ pages-pro lazy registry, deduplication, retry, captured wrappers and this/arguments');
