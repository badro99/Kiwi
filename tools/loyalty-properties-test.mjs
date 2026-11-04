import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { stampsFor } from '../functions/api/_rules-loyalty.js';
const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('assets/loyalty-rules.js', 'utf8').replace(/^export .*$/mg, ''), ctx);
const client = ctx.KiwiLoyaltyRules;
const cfg = {model: 'product', product: {item: 'Café', ids: ['p1']}};
for (const rules of [{stampsFor}, client]) {
  assert.equal(rules.stampsFor(cfg, []), 0);
  assert.equal(rules.stampsFor({model: 'visit'}, []), 1);
  for (const qty of [0.4, 0.6, 2.4]) assert.equal(rules.stampsFor(cfg, [{id: 'p1', qty, unit: 'kg'}]), 1);
  assert.equal(rules.stampsFor(cfg, [{id: 'p1', qty: 2.9, unit: 'unit'}]), 2);
  assert.equal(rules.stampsFor(cfg, [{id: 'p1', qty: 0, unit: 'kg'}]), 0);
}
fc.assert(fc.property(fc.array(fc.record({id: fc.constantFrom('p1', 'other'), name: fc.constantFrom('Café', 'Thé'), qty: fc.integer({min: -1000, max: 10000}).map(n => n / 1000), unit: fc.constantFrom('kg', 'weigh', 'unit', '')}), {maxLength: 30}), fc.constantFrom('product', 'visit', 'amount'), fc.boolean(), (items, model, auto) => {
  const config = {...cfg, model, auto};
  assert.equal(client.stampsFor(config, items), stampsFor(config, items));
}), {numRuns: 1000, seed: 4112026});
// Execute the shipped manual-entry handler with a selected catalogue product.
const source = fs.readFileSync('assets/clients-book/profiles.js', 'utf8');
const handler = source.split("sh.querySelector('#kcb-rec').onclick = function () {")[1].split('\n    };')[0];
let purchase;
vm.runInNewContext('(function(){' + handler + '})()', {cfg, c: {id:'c'}, products:[{id:'p1',name:'Café',unit:'kg'}], sh:{querySelector:()=>({value:'0'})}, KC:{recordPurchase:(id,p)=>{purchase=p;return {};}}, renderList(){},ensureChip(){},openDetail(){},toast(){},tr:s=>s});
assert.equal(stampsFor(cfg, purchase.items), 1);
// Execute the actual save guard; overflow must return before any persistence.
const feature = fs.readFileSync('assets/features.js', 'utf8');
const guard = feature.slice(feature.indexOf('        const next = readCfg();'), feature.indexOf('        let saved = false;', feature.indexOf('        const next = readCfg();')));
for (const lang of ['fr','en','ar']) {
  let message, continued = false;
  vm.runInNewContext('(function(){' + guard + '; continued();})()', {readCfg:()=>({product:{ids:Array(2001)}}),toast:s=>{message=s;},C: {linkLimit: lang},trLang:()=>lang,continued:()=>{continued=true;}});
  assert.ok(message); assert.equal(continued,false);
}
console.log('✓ loyalty properties: 1000 server/client tickets, evidence, weight, manual selection and translated overflow refusal');
