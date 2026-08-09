#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let n = 0;
function ok(value, label) {
  if (!value) throw new Error('FAIL · ' + label);
  n++; console.log('  ✓ ' + label);
}

const venues = read('assets/venues.js');
const dashboard = read('dashboard.html');
const caisse = read('kiwi-caisse.html');
const sw = read('kiwi-sw.js');
const css = read('assets/pressing-dashboard.css');
const pressingJs = read('assets/pressing-dashboard.js');
const pairingJs = read('assets/caisse-pairing.js');

ok(/pressing:\s*\{\s*base:\s*'boutique'/.test(venues), 'pressing has an exact subtype profile');
['pressing-orders','pressing-workshop','pressing-pickup','pressing-services','pressing-quality','pressing-delivery']
  .forEach((id) => ok(venues.includes("nav: '" + id + "'"), id + ' is in the pressing navigation'));
ok(venues.includes("v.subtype !== 'pressing'"), 'generic boutique Sold is not appended to pressing');
ok(venues.includes('active.subtype = exactSubtype'), 'server type keeps the exact pressing subtype');
ok(pairingJs.includes("if (t && ids[t]) return { kind: 'vertical', id: t }"), 'operator hand-off routes an exact pressing type into the pressing till');
ok(caisse.includes('assets/caisse-pairing.js?v=2') && sw.includes("'/assets/caisse-pairing.js?v=2'"), 'pressing route fix bypasses the old cached pairing router');
ok(dashboard.includes('assets/pressing-dashboard.js?v=3'), 'dashboard loads the pressing subpages');
ok(dashboard.includes('assets/pressing-ops.js?v=1') && caisse.includes('assets/pressing-ops.js?v=1'), 'dashboard and till share the same operations bridge');
ok(sw.includes("'/assets/pressing-dashboard.css?v=4'") && sw.includes("'/assets/pressing-dashboard.js?v=3'"), 'pressing workspace is available offline');
ok(!css.includes('body.is-pressing .page-head') && css.includes('.pressing-home { display: none !important; }'), 'pressing keeps the shared dashboard visible');
ok(pressingJs.includes('open.dataset.pxdOpen') && pressingJs.includes('page.dataset.pxdPage'), 'pressing subpage actions use their real data attributes');
ok(css.includes('@media (max-width: 390px)') && css.includes('@media (max-width: 760px)'), 'phone breakpoints cover narrow screens');
ok(!/font-style\s*:\s*italic/.test(css), 'pressing workspace uses roman type only');

const store = new Map();
const context = {
  console,
  Date,
  Set,
  JSON,
  Math,
  Number,
  String,
  Array,
  Object,
  CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
  localStorage: {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
  },
  addEventListener() {},
  dispatchEvent() {},
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'v1', slug: 'pressing-amira', subtype: 'pressing' }) },
};
context.window = context;
vm.runInNewContext(read('assets/pressing-ops.js'), context, { filename: 'pressing-ops.js' });

const now = Date.now();
const orders = [
  { id:'P-1', droppedAt:new Date(now - 1000), readyAt:new Date(now - 500), pay:{mode:'pickup',paid:20}, pieces:[{pid:'1',label:'Veste',status:'trait',photos:2}] },
  { id:'P-2', droppedAt:new Date(now - 1000), readyAt:new Date(now + 5000), pay:{mode:'pickup',paid:0}, rack:'B-07', notified:false, pieces:[{pid:'1',label:'Robe',status:'pret',photos:0}] },
];
context.KiwiPressingOps.replace(orders, {
  customer: (o) => ({ name: o.id === 'P-1' ? 'Amal' : 'Youssef', phone: '0600000000' }),
  total: (o) => o.id === 'P-1' ? 100 : 80,
});
const s = context.KiwiPressingOps.summary();
ok(s.pieces === 2 && s.treating === 1 && s.ready === 1, 'summary follows real garment states');
ok(s.late === 1, 'late promise is derived from the promised date');
ok(s.due === 160, 'outstanding balance is derived from totals and payments');
ok(s.racks === 1 && s.unnotified === 1, 'rack and notification queues stay in sync');
const snapshotText = [...store.values()].join('');
ok(!snapshotText.includes('"pin"') && !snapshotText.includes('"code"'), 'operations snapshot contains no credential fields');

console.log('\n✓ pressing workspace gate green (' + n + ' checks)');
