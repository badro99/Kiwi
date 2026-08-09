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
const caisseJs = read('assets/pressing-caisse.js');
const pairingJs = read('assets/caisse-pairing.js');
const dispatchJs = read('assets/pos-dispatch.js');
const storeApi = read('functions/api/store.js');

ok(/pressing:\s*\{\s*base:\s*'boutique'/.test(venues), 'pressing has an exact subtype profile');
['pressing-orders','pressing-workshop','pressing-pickup','pressing-services','pressing-quality','pressing-delivery']
  .forEach((id) => ok(venues.includes("nav: '" + id + "'"), id + ' is in the pressing navigation'));
ok(venues.includes("v.subtype !== 'pressing'"), 'generic boutique Sold is not appended to pressing');
ok(venues.includes('active.subtype = exactSubtype'), 'server type keeps the exact pressing subtype');
ok(pairingJs.includes("if (t && ids[t]) return { kind: 'vertical', id: t }"), 'operator hand-off routes an exact pressing type into the pressing till');
ok(caisse.includes('assets/caisse-pairing.js?v=2') && sw.includes("'/assets/caisse-pairing.js?v=2'"), 'pressing route fix bypasses the old cached pairing router');
ok(caisse.includes('assets/pos-dispatch.js?v=5') && dispatchJs.includes("file: 'pressing-caisse', rev: '5'") && sw.includes("'/assets/pressing-caisse.js?v=5'"), 'pressing lazy assets use a deploy-stable cache revision');
ok(dashboard.includes('assets/pressing-dashboard.js?v=5'), 'dashboard loads the pressing subpages');
ok(dashboard.includes('assets/pressing-ops.js?v=2') && caisse.includes('assets/pressing-ops.js?v=2'), 'dashboard and till share the same operations bridge');
ok(sw.includes("'/assets/pressing-dashboard.css?v=5'") && sw.includes("'/assets/pressing-dashboard.js?v=5'"), 'pressing workspace is available offline');
ok(!css.includes('body.is-pressing .page-head') && css.includes('.pressing-home { display: none !important; }'), 'pressing keeps the shared dashboard visible');
ok(pressingJs.includes("window.addEventListener('click'") && pressingJs.includes('open.dataset.pxdOpen') && pressingJs.includes('page.dataset.pxdPage'), 'pressing subpage actions claim sidebar routing before the generic dashboard');
ok(css.includes('@media (max-width: 390px)') && css.includes('@media (max-width: 760px)'), 'phone breakpoints cover narrow screens');
ok(!/font-style\s*:\s*italic/.test(css), 'pressing workspace uses roman type only');
ok(caisseJs.includes("PRESSING_STORE_PREFIX = 'kiwi:pressing-store:v1:'") && caisseJs.includes("feature: 'pressing-orders'"), 'full garment tickets persist locally and through the tenant cloud document');
ok(caisseJs.indexOf('ticketSeq++;\n        syncOwnerOps();') > 0, 'the next ticket number is persisted before a pay-at-pickup reload');
ok(storeApi.includes("'pressing-orders': { keys: ['customers', 'orders', 'seq']"), 'the store API accepts the bounded pressing ticket document');
ok(caisseJs.includes("notes: (ln.notes || []).slice(), freeNote: ln.freeNote || ''") && caisseJs.includes('px-dt-care-summary') && caisseJs.includes('px-piece-care') && caisseJs.includes('px-tag-care'), 'care instructions survive into the visible workshop summary, detail and physical labels');
ok(caisseJs.includes('J’ai envoyé le message') && caisseJs.indexOf("window.open('', '_blank')") < caisseJs.indexOf('o.notified = true'), 'WhatsApp notification is confirmed only after opening the draft');
ok(!caisseJs.includes("jusqu'à 20h00") && !caisseJs.includes('merci envoyé sur WhatsApp'), 'customer messages and handover confirmations make no false claims');
ok(!caisseJs.includes('Date promise') && !caisseJs.includes('date promise'), 'withdrawal copy is idiomatic French');
ok(caisseJs.includes('aria-pressed="${c.id === sheet.color}"') && caisseJs.includes('aria-pressed="${sheet.notes.includes(n)}"'), 'care selections expose their state to assistive technology');
ok(/id: 'P-1031'[\s\S]{0,180}paid: 102/.test(caisseJs), 'delivered demo orders cannot retain an impossible balance');

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
  { id:'P-1', droppedAt:new Date(now - 1000), readyAt:new Date(now - 500), pay:{mode:'pickup',paid:20}, pieces:[{pid:'1',label:'Veste',status:'trait',photos:0,notes:['Tache col'],svcs:['sec']}] },
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
ok(s.attention === 1 && s.services.sec === 1, 'dashboard derives care and treatment load from real pieces');
const snapshotText = [...store.values()].join('');
ok(!snapshotText.includes('"pin"') && !snapshotText.includes('"code"'), 'operations snapshot contains no credential fields');
ok(!snapshotText.includes('Tache col'), 'dashboard snapshot records a vigilance without leaking the customer instruction');

console.log('\n✓ pressing workspace gate green (' + n + ' checks)');
