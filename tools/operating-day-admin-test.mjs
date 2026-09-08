import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../kiwi-admin.html', import.meta.url), 'utf8');
const match = source.match(/  var featuresRenderGeneration = 0;\n  async function renderFeatures\(\)\{[\s\S]*?\n  \}\n\n  \/\/ Libellé lisible/);
assert.ok(match, 'extracts the shipped renderFeatures generation guard');
const production = match[0].replace(/\n\n  \/\/ Libellé lisible[\s\S]*$/, '');

const featureList = { children: [], appendChild(node) { this.children.push(node); } };
const typeRow = { children: [], appendChild(node) { this.children.push(node); } };
const document = { getElementById(id) { return id === 'feat-list' ? featureList : typeRow; } };
const clear = (node) => { node.children = []; };
const h = (tag, attrs = {}, ...children) => ({ tag, attrs, children, addEventListener() {} });
const renderTypeRow = () => { clear(typeRow); typeRow.appendChild({ tag: 'select' }); };
const modulesForType = () => [{ title: 'Core', items: [{ key: 'orderpro', label: 'Order Pro' }] }];
const featState = (features, mod) => ({ on: features[mod.key] === true, explicit: true });
const renderAudit = () => {};
const notify = () => {};
const api = null;
const LIVE = false;
const SENIOR = true;
const selected = { merchant: 'cafe-atlas', type: 'restaurant', plan: 'pro' };
const pending = [];
const store = { config() { return new Promise((resolve, reject) => pending.push({ resolve, reject })); } };

const renderFeatures = new Function(
  'document', 'clear', 'h', 'renderTypeRow', 'modulesForType', 'featState',
  'renderAudit', 'notify', 'api', 'LIVE', 'SENIOR', 'selected', 'store',
  `${production}; return renderFeatures;`
)(document, clear, h, renderTypeRow, modulesForType, featState,
  renderAudit, notify, api, LIVE, SENIOR, selected, store);

const first = renderFeatures();
const second = renderFeatures();
assert.equal(typeRow.children.length, 1, 'concurrent renders keep one type row');
pending[1].resolve({ orderpro: true });
pending[0].resolve({ orderpro: false });
await Promise.all([first, second]);
assert.equal(featureList.children.filter((node) => node.tag === 'div').length, 1,
  'latest same-merchant response renders one feature row');
assert.equal(featureList.children.at(-1).children[1].children[0], 'Activé',
  'latest same-merchant response wins after an older response arrives');

const staleFailure = renderFeatures();
const latest = renderFeatures();
pending[3].resolve({ orderpro: false });
pending[2].reject(new Error('stale response failed'));
await Promise.all([staleFailure, latest]);
assert.equal(featureList.children.filter((node) => node.tag === 'p' && node.attrs.class === 'empty').length, 0,
  'stale failure does not append an unavailable message over the latest response');
assert.equal(featureList.children.at(-1).children[1].children[0], 'Désactivé',
  'latest successful response remains rendered after stale failure');

const pinsSource = source.match(/  var pinsRenderGeneration = 0;\n  async function renderPins\(\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(pinsSource, 'extracts the shipped PIN-list concurrency guard');
const pinList = { children:[], appendChild(node){this.children.push(node);} };
const pinAdd = {};
const pinReads = [];
const renderPins = new Function('document','clear','h','renderPinRoles','roleLabel','SENIOR','selected','store',
  `${pinsSource}; return renderPins;`)(
    {getElementById:id=>id==='pin-list'?pinList:pinAdd},clear,h,()=>{},String,true,selected,
    {pins:()=>new Promise((resolve,reject)=>pinReads.push({resolve,reject}))});
const oldPins=renderPins(), newPins=renderPins();
pinReads[1].resolve([{id:'qa-new',name:'Latest QA',role:'manager',pin:'0000'}]);
pinReads[0].resolve([{id:'qa-old',name:'Old QA',role:'manager',pin:'0000'}]);
await Promise.all([oldPins,newPins]);
assert.equal(pinList.children.length,1,'parallel same-merchant reads do not duplicate PIN rows');
assert.ok(JSON.stringify(pinList.children).includes('Latest QA'));
assert.ok(!JSON.stringify(pinList.children).includes('Old QA'));
const failedPins=renderPins(), goodPins=renderPins();
pinReads[3].resolve([]);pinReads[2].reject(new Error('stale'));
await Promise.all([failedPins,goodPins]);
assert.equal(pinList.children.length,1,'a stale failure does not append a second PIN-list notice');
console.log('operating-day-admin-test: concurrent features and PIN lists latest-wins checks passed');
