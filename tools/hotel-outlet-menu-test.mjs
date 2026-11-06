// r20 hotel#A0/A2: an outlet menu longer than 200 articles is paged to its last article.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { hotelTestSource } from './hotel-test-source.mjs';
const source = hotelTestSource();
const handlers = {};
let modalHost;
const window = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {},
  Kiwi: { handlers, appPage() { return { el: { querySelector: () => null }, close() {} }; }, toast() {},
    modal() { modalHost = { innerHTML:'', listeners:{}, addEventListener(type, fn) { this.listeners[type] = fn; } }; return { close() {}, el:{ querySelector: (sel) => sel === '[data-hx-outlet-menu]' ? modalHost : { classList:{ add() {} } } } }; } },
  KiwiVenue: { getVenue: () => 'vhotel', getCurrentVenueData: () => ({ id:'vhotel', name:'Hôtel Test', type:'hotel', subtype:'hotel', custom:true, profileInfo:null }),
    getVenueType: () => 'hotel', isCustom: () => true, subscribe: () => () => {} },
  KiwiCloudDoc: { attach: () => ({ bind() {}, push() {}, save: async () => ({ ok:true }), pushNow: async () => ({ ok:true }) }), slugFor: (id) => 'slug-' + id },
};
let products = [];
const context = { window, localStorage: window.localStorage, console, document:{ addEventListener() {} },
  fetch: async () => ({ ok:true, status:200, json: async () => ({ data:{ products } }) }), setTimeout() { return 0; }, clearTimeout() {}, Date, Math, JSON, Object, Array, String, Number, Map, Set };
vm.runInNewContext(source, context, { filename:'assets/hotel.js' });
const names = (html) => [...html.matchAll(/<span>(art-\d+)<\/span>/g)].map((m) => m[1]);

for (const count of [150, 450]) {
  products = Array.from({ length:count }, (_, i) => ({ id:'p' + i, name:'art-' + i, priceMAD:10 + i }));
  await handlers['hx-outlet-menu']({}, 'any');
  const host = modalHost;
  assert.ok(names(host.innerHTML).length <= 100, count + ': first page is a page, not the catalogue');
  assert.ok(host.innerHTML.includes('data-hx-outlet-more'), count + ': there is a way to the next articles');
  let guard = 0;
  while (host.innerHTML.includes('data-hx-outlet-more') && guard++ < 20) host.listeners.click({ target:{ closest: (sel) => sel === '[data-hx-outlet-more]' ? {} : null } });
  const seen = names(host.innerHTML);
  assert.equal(seen.length, count, count + ': every article is reachable, none past 200 is dropped');
  assert.ok(seen.includes('art-' + (count - 1)), count + ': the last article is listed');
  assert.ok(!host.innerHTML.includes('data-hx-outlet-more'), 'no button once everything is shown');
  assert.ok(host.innerHTML.includes('hx-outlet-edit-menu'), 'the shared-catalogue footer stays');
}
products = Array.from({ length:40 }, (_, i) => ({ id:'p' + i, name:'art-' + i, priceMAD:5 }));
await handlers['hx-outlet-menu']({}, 'any');
assert.equal(names(modalHost.innerHTML).length, 40);
assert.ok(!modalHost.innerHTML.includes('data-hx-outlet-more'), 'a short menu has no pager');
console.log('PASS hotel outlet menu pages through a catalogue of any size');
