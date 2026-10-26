import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute shipped functions in isolated devices, without a browser or network.
const stores = {}, storage = new Map([['kiwiLive','1']]);
const window = { KiwiStore: { define(name, opts) { return stores[name] = {
  get(k) { return this[k] || opts.blank(); }, set(v,k) { this[k] = v; }, subscribe() {} }; }, currentVenue: () => 'display-fixture' },
  Kiwi: { handlers: {} }, addEventListener() {} };
const document = { documentElement: { lang: 'fr' }, createElement: () => ({}), head: { appendChild() {} } };
const ctx = vm.createContext({ fetch: async () => ({ok:false}), window, KiwiStore: window.KiwiStore, document, console, Intl, localStorage: {
  getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)
}, setInterval() {}, setTimeout() {}, navigator: { onLine: false } });
vm.runInContext(fs.readFileSync('assets/clients-store.js','utf8'),ctx);
// Expose lexical functions before UI boot, leaving their production bodies intact.
for (const [file, stop, expose] of [
  ['book', '  /* Dernière journée', 'window.bookFmt = fmt;'],
  ['directory', '  /* Customer retention', 'window.directoryFmt = fmt; window.csvExport = csvExport; window.strings = STR;']
]) {
  const src = fs.readFileSync(`assets/clients-${file}.js`,'utf8');
  vm.runInContext(src.slice(0,src.indexOf(stop)) + expose + '\n})();',ctx);
}
let seed = 71237;
const random = max => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed % max; };
const parse = (s,lang) => Number(s.replace(/[\s\u061c\u200e\u200f]/g,'').replace(lang === 'en' ? /,/g : lang === 'ar' ? /[.\u066c]/g : /\u066c/g,'').replace(/[,\u066b]/g,'.'));
for (const lang of ['fr','en','ar']) {
  document.documentElement.lang = lang;
  for (let i=0;i<1000;i++) {
    // Half the runs with the dashboard's shared formatter (same body as i18n.js formatNumber), half without it.
    const shared = lang === 'en' ? 'en-GB' : 'fr-FR';
    window.KiwiNumber = i % 2 ? { format: (n, o = {}) => new Intl.NumberFormat(shared, o).format(n) } : undefined;
    const edges = [50, 0, 1200, 1250, 1, 99999999];
    const cents = i < edges.length ? edges[i] : random(100000000);
    const locale = window.KiwiNumber ? shared : lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR';
    for (const fmt of [window.bookFmt,window.directoryFmt]) {
      const shown = fmt(cents/100);
      assert.equal(Math.round(parse(shown,lang)*100),cents,`${lang}: ${shown}`);
      assert.match(shown, /[0-9]/);
      assert.equal(shown, new Intl.NumberFormat(locale,{minimumFractionDigits:cents % 100 ? 2 : 0,maximumFractionDigits:cents % 100 ? 2 : 0}).format(cents/100).replace(/\u202f/g,'\u00a0'));
    }
  }
}
// Quantities with an explicit language: the till, where the dashboard formatter is absent.
window.KiwiNumber = undefined;
const client = window.KiwiClients.upsert({ name: 'Display fixture' },'display-fixture');
for (let i=0;i<200;i++) {
  const qty = i === 0 ? 0.5 : random(100000)/1000;
  const result = window.KiwiClients.recordPurchase(client.id,{ amount:12.50, saleId:'display-'+i, items:[{name:'Bulk',qty,total:12.50}] },'display-fixture');
  assert.equal(result.client.history[0].items[0].qty,qty);
  for (const lang of ['fr','en','ar']) {
    assert.equal(Math.round(parse(window.KiwiClientNumbers.quantity(qty,lang),lang)*1000),Math.round(qty*1000));
  }
  const refund = window.KiwiClients.recordRefund(client.id,{ amount:0.50, eventRef:'refund-'+i, saleRef:'display-'+i, items:[{name:'Bulk',qty,total:0.50}] },'display-fixture');
  assert.ok(refund);
  const events = JSON.parse(storage.get('kiwi:clients-purchases:v1:display-fixture'));
  assert.equal(events.at(-1).items[0].qty,qty);
}
let csv;
ctx.Blob = class { constructor(parts) { csv = parts.join(''); } };
ctx.URL = { createObjectURL() { return 'blob:fixture'; } };
document.createElement = () => ({ click() {}, remove() {} });
document.body = { appendChild() {} };
window.csvExport([{name:'Fixture',spend:1234.50}],window.strings.fr);
assert.ok(csv.includes('"1234.5"') || csv.includes('"1234.50"'),csv);
console.log('✓ client money round trips in fr/en/ar, fractional purchase/refund quantities, exact CSV');
