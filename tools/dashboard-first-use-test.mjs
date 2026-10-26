import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { analyse } from './ownership-lib.mjs';
import dashboardDependencies from './dashboard-dependencies.cjs';
const read = file => fs.readFileSync(file, 'utf8');
const code = read('assets/pages/dashboard-loader.js');
const workspace = code.match(/workspace: \{ dependencies: \[\], scripts: \[([\s\S]*?)\n    \] \}/);
assert.ok(workspace, 'the shell needs an explicit first-use owner graph');
const urls = [...workspace[1].matchAll(/'(assets\/[^']+)'/g)].map(m => m[1]);
// Execute the parser owner exactly as the page does. A late document.write
// could replace the live POS document, so reject that path explicitly.
const startupCode = read('assets/pages/dashboard-startup.js');
let emitted = '';
vm.runInNewContext(startupCode, { document: { readyState: 'loading', write: html => { emitted += html; } } });
assert.throws(() => vm.runInNewContext(startupCode, { document: { readyState: 'complete', write() { assert.fail('late parser write'); } } }), /requires the HTML parser/);
const startupTags = [...emitted.matchAll(/<script src="([^"]+)"([^>]*)><\/script>/g)];
assert.equal(startupTags.length, 45, 'startup providers retain one classic deferred execution each');
for (const [, url, attributes] of startupTags) {
  assert.match(attributes, /\bdefer\b/);
  assert.ok(fs.existsSync(url.split('?')[0]));
  assert.ok(read('kiwi-sw.js').includes("'/" + url + "'"), 'offline startup: ' + url);
}
assert.ok(read('dashboard.html').includes('<script src="assets/pages/dashboard-startup.js'), 'startup record is parser blocking');
const before = JSON.parse(read('tools/fixtures/dashboard-first-use.json'));
const shell = [...dashboardDependencies.eager(read('dashboard.html')).matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m => m[1]);
assert.equal(urls.length, 6, 'only optional drawer owners leave the eager shell');
assert.equal(new Set(urls).size, urls.length);
assert.ok([...read('dashboard.html').matchAll(/<script\b[^>]*src=/g)].length <= 122);
const asset = url => url.split('?')[0];
assert.deepEqual(before.filter(u => urls.includes(u)), urls, 'moved dependencies retain their proven relative order and versions');
assert.deepEqual(shell.map(asset).filter(u => before.map(asset).includes(u)), before.filter(u => !urls.includes(u)).map(asset), 'remaining startup order is unchanged across restamps');
for (const url of urls) {
  assert.ok(!shell.includes(url), 'first-use owner is absent at startup: ' + url);
  assert.ok(fs.existsSync(url.split('?')[0]));
  assert.ok(read('kiwi-sw.js').includes("'/" + url + "'"), 'offline first use: ' + url);
}
// A drawer move cannot strand a retained module's startup dependency. Inspect
// all retained scripts, including modules outside the twelve ownership units.
const moved = new Map(), eagerDefinitions = new Set(), retained = [];
for (const url of urls) for (const name of analyse(read(url.split('?')[0]), url).definitions) moved.set(name, url);
const inlineBoot = [...read('dashboard.html').matchAll(/\bjs\("(assets\/[^\"]+\.js\?v=\d+)"\)/g)].map(m => m[1]);
for (const url of [...shell, ...inlineBoot].filter(url => url.startsWith('assets/'))) {
  const parsed = analyse(read(url.split('?')[0]), url);
  retained.push([url, parsed]);
  for (const name of parsed.definitions) eagerDefinitions.add(name);
}
for (const [url, parsed] of retained) for (const [name, eager] of parsed.reads) {
  const reactive = {
    'assets/kit/dash-report.js': ['KiwiReportPage', 'report'],
    'assets/kit/dash-customers.js': ['KiwiClientsPage', 'customers'],
    'assets/kit/dash-retention.js': ['KiwiRetentionPage', 'retention'],
    'assets/kit/dash-compliance.js': ['KiwiConformite', 'compliance'],
  }[url.split('?')[0]];
  if (reactive && name === reactive[0]) {
    // This adapter rereads its provider on every model event, rather than
    // capturing an absent API at startup. Prove both halves of that contract.
    const source = read(url.split('?')[0]);
    const getter = name === 'KiwiConformite' ? /function model\(\) \{\s*var C = root.KiwiConformite;/
      : new RegExp('function api\\(\\) \\{ return root\\.' + name + ' \\|\\| null; \\}');
    assert.match(source, getter);
    assert.ok(source.includes("addEventListener('kiwi:" + reactive[1] + "-model', paint)"));
    continue;
  }
  assert.ok(!eager || !moved.has(name) || eagerDefinitions.has(name), `${url} captures deferred ${name} at startup`);
}
for (const file of ['assets/dateRange.js', 'assets/daterange/renderers.js', 'assets/design-vexel-layout.js', 'assets/kit/dash-home.js']) {
  for (const [name] of analyse(read(file), file).reads) {
    assert.ok(!moved.has(name) || eagerDefinitions.has(name), `${file} needs ${name} for unchanged home figures before drawer use`);
  }
}
const requests = [], removed = [], events = new Map();
let guarded = false;
const win = { Kiwi: {handlers:{} }, addEventListener(type, fn) { events.set(type, fn); } };
const doc = { baseURI:'https://kiwi.test/dashboard.html', currentScript:null,
  addEventListener(type, fn) { assert.notEqual(type, 'click', 'first use precedes the legacy document capture router'); events.set(type, fn); },
  dispatchEvent(event) { assert.equal(event.type, 'kiwi:dashboard-owners-ready'); guarded = true; },
  createElement() { return {remove() { removed.push(this.src); }}; },
  head: {appendChild(node) { requests.push(node); }},
};
vm.runInNewContext(code, { window:win, document:doc, URL, Map, Promise, Event });
assert.equal(requests.length, 0);
events.get('click')({target:{closest:()=>({getAttribute:key=>key==='data-nav'?'accueil':'',hasAttribute:()=>false})},
  preventDefault(){assert.fail('home navigation must not be deferred');},stopImmediatePropagation(){assert.fail();}});
assert.equal(requests.length, 0, 'returning home does not load drawer owners');
for (const action of ['open-date-picker', 'nav-finance', 'stock-open']) {
  events.get('click')({ target: { closest: () => ({ getAttribute: key => key === 'data-action' ? action : '', hasAttribute: () => false }) },
    preventDefault() { assert.fail(action + ' must remain synchronous'); }, stopImmediatePropagation() { assert.fail(); } });
}
assert.equal(requests.length, 0, 'eager actions never wait for optional owners');
const first = win.KiwiDashboardLoader.load('workspace');
const concurrent = win.KiwiDashboardLoader.load('workspace');
assert.equal(first, concurrent, 'single flight');
async function waitRequest(n) {
  for (let spin=0;spin<1000 && requests.length<n;spin++) await Promise.resolve();
  assert.equal(requests.length,n);
}
// Fail the third file: successful owners are never executed a second time.
for (let i=0;i<2;i++) { await waitRequest(i+1); assert.equal(requests[i].src,urls[i]); requests[i].onload(); }
await waitRequest(3); requests[2].onerror(); await assert.rejects(first); await assert.rejects(concurrent);
assert.deepEqual(removed,[urls[2]]);
let replayed=0, prevented=0;
const target={isConnected:true, getAttribute:key=>key==='data-action'?'mx-import':'', hasAttribute:()=>false, click(){assert.ok(guarded,'guards precede intent replay');replayed++;}};
events.get('click')({target:{closest:()=>target}, preventDefault(){prevented++;}, stopImmediatePropagation(){prevented++;}});
const retry=win.KiwiDashboardLoader.load('workspace');
for(let i=2;i<urls.length;i++){ await waitRequest(i+2); assert.equal(requests[i+1].src,urls[i]); requests[i+1].onload(); }
await retry; await Promise.resolve();
assert.equal(prevented,2); assert.equal(replayed,1,'replay the user intent once, after all owners register');
await win.KiwiDashboardLoader.load('workspace'); assert.equal(requests.length,urls.length+1,'only the failed dependency was retried');
// Enter in the home question form opens the same drawer without a nav click.
const formRequests = [], formEvents = new Map();
const formWindow = {Kiwi:{handlers:{}},addEventListener(type, fn){formEvents.set(type,fn);}};
const formDocument = {...doc,head:{appendChild(node){formRequests.push(node);}}};
vm.runInNewContext(code,{window:formWindow,document:formDocument,URL,Map,Promise,Event});
let submitted=0;
const form={isConnected:true,requestSubmit(){submitted++;}};
formEvents.get('submit')({target:{closest:()=>form},preventDefault(){},stopImmediatePropagation(){}});
for(let i=0;i<urls.length;i++) {
  for(let spin=0;spin<1000 && formRequests.length<=i;spin++) await Promise.resolve();
  assert.equal(formRequests.length,i+1); assert.equal(formRequests[i].src,urls[i]);
  assert.equal(submitted,0,'question waits for its owners'); formRequests[i].onload();
}
await formWindow.KiwiDashboardLoader.load('workspace'); await Promise.resolve();
assert.equal(submitted,1,'one question submit after dependencies are ready');
// These controls can be reached through synchronous page APIs as well as nav.
// Their first click must load the optional owner before the existing router sees it.
for (const action of ['mx-import', 'bqx-import', 'rmw-menu-scan', 'clients-directory', 'scan-salle', 'cd-campaign']) {
  const queue = [], listeners = new Map();
  const root = { Kiwi: { handlers: {} }, addEventListener(type, fn) { listeners.set(type, fn); } };
  vm.runInNewContext(code, { window: root, document: { ...doc, head: { appendChild(node) { queue.push(node); } } }, URL, Map, Promise, Event });
  let clicked = 0, stopped = 0;
  const optional = action === 'scan-salle' || action === 'cd-campaign';
  const control = { isConnected: true, getAttribute: key => key === 'data-action' && !optional ? action : '', hasAttribute: () => false,
    matches: () => optional, click() { clicked++; } };
  listeners.get('click')({ target: { closest: () => control }, preventDefault() { stopped++; }, stopImmediatePropagation() { stopped++; } });
  assert.equal(stopped, 2, action + ': intercept before the page router');
  for (let i = 0; i < urls.length; i++) {
    for (let spin = 0; spin < 1000 && queue.length <= i; spin++) await Promise.resolve();
    assert.equal(queue.length, i + 1); assert.equal(clicked, 0); queue[i].onload();
  }
  await root.KiwiDashboardLoader.load('workspace'); await Promise.resolve();
  assert.equal(clicked, 1, action + ': replay once after owner registration');
}
assert.match(read('assets/view-link.js'), /load\('workspace'\)\)[\s\S]*?\.then\(\(\) => restoreReady\(target\)/, 'deep links await the same first-use owner graph');
console.log('PASS dashboard dependencies: ordered deferred startup; 6 offline optional owners, single flight, retry and one intent replay');
