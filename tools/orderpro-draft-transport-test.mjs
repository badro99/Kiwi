import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import source from './orderpro-split-source.cjs';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const original = gunzipSync(fs.readFileSync('tools/fixtures/orderpro/original.js.gz')).toString();
assert.equal(source.orderProScriptSource(), original, 'live extracted code reconstructs the shipped original byte for byte');
function expression(name) {
  const file = ts.createSourceFile('old.js', original, ts.ScriptTarget.Latest, true);
  let result;
  function visit(node) {
    if (!result && ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(file);
    if (!result && ts.isVariableDeclaration(node) && node.name.getText(file) === name) result = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(result, name);
  return result;
}
const factory = context => vm.runInNewContext(`({${['lineKey','totals','initialCustomizerSelections','unansweredRequiredOption','customizerUnitPrice','addLineToCart','incFromCart','decFromCart'].map(n => `${n}: ${expression(n)}`).join(',')}, makeLinesPayload: ${expression('makeLinesPayload')}})`, context);
const options = [{ key: 'size', type: 'single', required: true }, { key: 'parts', type: 'multi', formulaSlotId: 'parts', min: 1 }];
const context = { refreshCartUI() {}, showToast() {}, t: k => k, customizerItem: { price: 10, options: [{key:'size',type:'single',choices:[{id:'large',delta:2.5}]}] }, customizerSelections: {size:'large'}, cart: new Map(), linesCopy: [], itemOf: id => ({ options: id === 'formula' ? options : [] }), nameOf: id => id, describeOptionChoices: () => [], describeOptionVisuals: () => [], groupLabel: g => g };
const old = factory(context);
context.lineKey = old.lineKey;
assert.equal(old.unansweredRequiredOption({options}, old.initialCustomizerSelections(options)).key, 'size');
assert.equal(JSON.stringify(old.totals()), '{"count":0,"total":0}');
assert.equal(old.customizerUnitPrice(), 12.5);
console.log('PASS before extraction: executing shipped totals and required-option rules');
const libraries = {};
const load = file => {
  const ctx = { URLSearchParams, Date: { now: () => 1000 }, Math: Object.assign(Object.create(Math), { random: () => 0.25 }), KiwiOrderMenu: { orderProParts: { run: (name, factory) => { libraries[name] = factory(); } } } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
};
load('assets/orderpro/draft.js');
load('assets/orderpro/transport.js');
const draft = libraries.draft.create(context);
assert.equal(draft.customizerUnitPrice(), old.customizerUnitPrice());
draft.selectChoice('size', 'large', 'single');
assert.equal(draft.customizerUnitPrice(), 10);
draft.addDraftLine({id:'dish', qty:2, unitPrice:12.5, options:{}});
draft.addDraftLine({id:'dish', qty:1, unitPrice:12.5, options:{}});
const key = draft.lineKey('dish', {}, '');
assert.equal(context.cart.get(key).qty, 3);
draft.incDraftLine(key); draft.decDraftLine(key);
assert.equal(context.cart.get(key).qty, 3);
for(let i=0;i<3;i++) draft.decDraftLine(key);
assert.equal(context.cart.size, 0);
for (const lines of [[], [{id:'dish',qty:2,unitPrice:12.5,options:{size:'large'},note:'sans sel'}], [{id:'formula',qty:3,unitPrice:19.95,options:{size:'large',parts:['a','b']}}, {id:'dish',qty:1,unitPrice:0.1,options:{}}]]) {
  context.cart.clear(); context.linesCopy.splice(0, context.linesCopy.length, ...lines);
  for (const line of lines) old.addLineToCart(line);
  const oldTotal = JSON.stringify(old.totals());
  const oldPayloads = ['', 'retry-identity'].map(ref => JSON.stringify(old.makeLinesPayload(ref)));
  context.cart.clear();
  for (const line of lines) draft.addDraftLine(line);
  assert.equal(JSON.stringify(draft.totals()), oldTotal);
  for (const [i, ref] of ['', 'retry-identity'].entries()) assert.equal(JSON.stringify(draft.makeLinesPayload(ref)), oldPayloads[i]);
  assert.equal(JSON.stringify(draft.initialCustomizerSelections(options)), JSON.stringify(old.initialCustomizerSelections(options)));
  for (const selections of [{}, {size:'large'}, {size:'large',parts:['a']}]) assert.equal(JSON.stringify(draft.unansweredRequiredOption({options},selections)), JSON.stringify(old.unansweredRequiredOption({options},selections)));
}
for (const scenario of ['ok','http','empty','offline','bad-json']) {
  const run = async create => {
    const calls = [];
    const fetch = async (url, init) => { calls.push([url,init]); if (scenario === 'offline') throw Error(); return {ok: scenario !== 'http', status:409, json: async () => {if(scenario === 'bad-json') throw Error(); return scenario === 'empty' ? null : scenario === 'http' ? {error:'invalid-options'} : {ok:true};}}; };
    const net = create({ location:{search:'?s=test&t=7'}, fetch, demo:()=>null });
    const results = [];
    for (let i=0;i<2;i++) results.push(await net.placeOrder({mode:'table',table:'7',session:'visit',ref:'retry-identity',lines:[]}));
    results.push(await net.catalog());
    return JSON.stringify({calls,results});
  };
  const oldCreate = ({location,fetch}) => vm.runInNewContext(expression('NET'), {location,fetch,URLSearchParams,globalThis:{}});
  assert.equal(await run(libraries.transport.create), await run(oldCreate), scenario);
}
console.log('✓ draft cart/formula/totals/payload byte parity; transport retries, request bytes and error mapping');

for (const durable of [false, true]) {
  const run = async modern => {
    const storage = new Map();
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    const capabilities = { crypto: durable ? webcrypto : undefined, localStorage, TextEncoder, Uint8Array };
    const NET = { slug: 'test' };
    const legacy = vm.runInNewContext('(' + expression('SESSION') + ')', { NET, ...capabilities, globalThis: { crypto: capabilities.crypto }, Date: { now: () => 1000 }, Math: Object.assign(Object.create(Math), { random: () => 0.25 }) });
    const session = modern ? Object.assign({ id:'', mode:'', table:'', pendingSend:null, retiredSendRefs:new Set() }, libraries.transport.retry({ NET }, capabilities)) : legacy;
    session.id = 'visit'; session.mode = 'table'; session.table = '7';
    const first = await session.prepareSend([{ id:'dish', qty:2 }]);
    const second = await session.prepareSend([{ id:'dish', qty:2 }]);
    assert.equal(first.ref, second.ref, 'retry keeps its identity');
    session.clearPendingSend(second);
    assert.equal(session.pendingSend, null);
    return JSON.stringify({ first, second, storage:[...storage], retired:[...session.retiredSendRefs] });
  };
  assert.equal(await run(true), await run(false), 'retry identity and durable retirement parity');
}
console.log('✓ extracted retry identity and persistence execute with and without durable crypto');
{
  const capabilities = { crypto: webcrypto, TextEncoder, Uint8Array, get localStorage() { throw new Error('storage denied'); } };
  const session = Object.assign({ id:'visit', mode:'table', table:'7', pendingSend:null, retiredSendRefs:new Set() }, libraries.transport.retry({ NET:{slug:'test'} }, capabilities));
  const first = await session.prepareSend([{id:'dish',qty:1}]);
  assert.equal(first.durable, false, 'blocked storage keeps the in-page retry available');
  assert.equal((await session.prepareSend([{id:'dish',qty:1}])).ref, first.ref);
  session.clearPendingSend();
  assert.equal(session.pendingSend, null);
}
console.log('✓ storage access remains lazy and fail-soft when the browser denies it');
