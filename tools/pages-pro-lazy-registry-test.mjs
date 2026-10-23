import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import pagesProSource from './pages-pro-test-source.cjs'; // pages-pro.js en quatre fichiers depuis le 22 octobre 2026
const require = createRequire(import.meta.url);
const stripActivation = (s) => String(s).replace(/data-activation=(?:\\?")?(?:write|money)(?:\\?")? /g, ''); // marqueurs d'installation ajoutés le 23 octobre, absents du rendu de référence
const source = pagesProSource();
const regStart = source.indexOf('/* First-use sections.');
const registry = source.slice(regStart, source.indexOf('/* ═══ Section', regStart));
/* Per chunk: the handler that renders a page, and the unsplit render it must match. */
const REFERENCES = {
  'assets/pages-pro/spa-appointments.js': ['nav-appointments', 'tools/pages-pro-spa-reference.json'],
  'assets/pages-pro/spa-practitioners.js': ['nav-practitioners', 'tools/pages-pro-spa-practitioners-reference.json'],
  'assets/pages-pro/boutique-promos-returns.js': ['nav-returns', 'tools/pages-pro-boutique-returns-reference.json'],
  /* Its menu page is a full page; the kitchen display is checked painted, in the browser test. */
  'assets/pages-pro/restaurant-stations.js': ['nav-menu', 'tools/pages-pro-restaurant-stations-reference.json'],
};
const entries = [...registry.matchAll(/url: '([^']+)', handlers: (\[[^\]]+\])/g)];
assert.ok(entries.length >= 1, 'registry lists its chunks');
assert.equal(entries.length, Object.keys(REFERENCES).length, 'every chunk has a render reference');
for (const [, url, list] of entries) {
  const file = url.split('?')[0];
  const chunk = fs.readFileSync(file, 'utf8');
  assert.ok(REFERENCES[file], file + ' has a render reference');
  const [navName, refFile] = REFERENCES[file];
  const names = JSON.parse(list);
  const other = names.find((n) => n !== navName);
  // Render against the frozen unsplit output without a DOM or browser.
  let output;
  const originalH = {};
  /* A do-nothing element: enough for a page to wire its listeners after rendering. */
  const node = () => ({ innerHTML: '', textContent: '', value: '', dataset: {}, style: { setProperty() {} }, hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => node(), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    appendChild() {}, remove() {}, setAttribute() {}, getAttribute: () => null, closest: () => null, focus() {} });
  const capture = (opts) => { output = opts; return { el: node(), close() {} }; };
  vm.runInNewContext(chunk, {window:{Kiwi:{handlers:originalH,appPage:(_name,opts)=>capture(opts),fullpage:capture,drawer:capture,modal:capture,toast(){}}},document:{documentElement:{lang:'fr'},body:node(),getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>node(),head:{appendChild(){}}},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},requestAnimationFrame(){}});
  originalH[navName]();
  assert.equal(crypto.createHash('sha256').update(stripActivation(JSON.stringify(output))).digest('hex'),JSON.parse(fs.readFileSync(refFile,'utf8')).sha, file + ' renders like the unsplit file');
  assert.deepEqual(JSON.parse(list).sort(), [...chunk.matchAll(/handlers\['([^']+)'\]\s*=/g)].map(m => m[1]).sort());
  assert.equal(require('./stamps.js').scan().get(url.split('?')[0]).sites.some(s => s.kind === 'lazy'), true);
  const tags = [], toasts = [], H = {};
  const document = { baseURI: 'https://kiwi.test/dashboard.html', currentScript: null, createElement: () => ({ remove() {} }), head: { appendChild: s => tags.push(s) } };
  const ctx = vm.createContext({ window: { Kiwi: { handlers: H, toast: (...a) => toasts.push(a) } }, document, URL });
  vm.runInContext(registry, ctx);
  const captured = H[navName];
  H[navName] = function () { return captured.apply(this, arguments); };
  const wrapper = H[navName];
  const self = {}, args = [{}, 'arg'];
  const a = captured.apply(self, args), b = H[other]();
  assert.equal(tags.length, 1, 'concurrent handlers deduplicate');
  tags[0].onerror();
  await Promise.all([a,b]);
  assert.equal(toasts.length, 2, 'failure resolves with existing error toast');
  const retry = captured.apply(self, args);
  assert.equal(tags.length, 2, 'failed request retries');
  document.currentScript = { src: new URL(url, document.baseURI).href };
  let calls = 0;
  for (const name of JSON.parse(list)) H[name] = function (...received) {
    if (name === navName) { calls++; assert.equal(this, self); assert.deepEqual(received, args); }
    return 'real';
  };
  document.currentScript = null;
  assert.equal(H[navName], wrapper, 'registration preserves captured wrapper');
  tags[1].onload();
  assert.equal(await retry, 'real');
  assert.equal(calls, 1, 'captured stub reaches real handler without recursion');
  assert.equal(captured.apply(self, args), 'real');
  assert.equal(tags.length, 2, 'success stays loaded');
}
console.log('✓ pages-pro lazy registry, deduplication, retry, captured wrappers and this/arguments');
