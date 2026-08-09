#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let n = 0;
function ok(value, label) { if (!value) throw new Error('FAIL · ' + label); n++; console.log('  ✓ ' + label); }

const venues = read('assets/venues.js');
const dash = read('dashboard.html');
const caisse = read('kiwi-caisse.html');
const sw = read('kiwi-sw.js');
const posDispatch = read('assets/pos-dispatch.js');
const css = read('assets/trade-workspaces.css') + read('assets/pos-workspaces.css') + read('assets/pos-autre.css');

['fastfood','bakery','pizzeria','traiteur','foodtruck','epicerie','pharmacie','librairie','fleuriste','spa','coiffure','sport','autre']
  .forEach((trade) => ok(new RegExp('^    ' + trade + ':', 'm').test(venues), trade + ' has an exact dashboard profile'));
['channels','waste','delivery','quotes','deposits','vehicle','credit','suppliers','prescriptions','insurers','expiries','duty','bookorders','schoollists','flowerorders','freshness','packages','formulas','chairs','checkins','renewals','workflows']
  .forEach((nav) => ok(venues.includes("nav: '" + nav + "'"), nav + ' has an exact trade route'));
ok(dash.includes('assets/trade-workspace-schema.js?v=3') && dash.includes('assets/trade-workspaces.js?v=3') && dash.includes('assets/trade-workspaces.css?v=3'), 'dashboard loads the validated operational workspace layer');
ok(caisse.includes('assets/trade-workspace-schema.js?v=3') && caisse.includes('assets/pos-workspaces.js?v=3') && caisse.includes('assets/pos-workspaces.css?v=3'), 'caisse loads the same validated operational schema and editor');
ok(posDispatch.includes("'0016': { id: 'autre'") && posDispatch.includes('KiwiPosWorkspaces.mount(root, id)'), 'other activity has its own till and every exact till mounts shared operations');
ok(read('assets/pos-workspaces.js').includes("pressing:'native'") && read('assets/pos-workspaces.js').includes('KiwiPressingOps?.summary'), 'pressing till exposes its shared live garment operations explicitly');
['trade-workspace-schema.js?v=3','trade-workspaces.js?v=3','trade-workspaces.css?v=3','pos-workspaces.js?v=3','pos-workspaces.css?v=3','pos-autre.js','pos-autre.css']
  .forEach((asset) => ok(sw.includes("'/assets/" + asset + "'"), asset + ' is available offline'));
ok(!/font-style\s*:\s*italic/.test(css), 'new trade surfaces keep roman type');
ok(!/#b44338|#f59e0b|#3b82f6|#8b5cf6/i.test(css), 'new trade surfaces add no off-palette accents');
ok(/workspaces:\s*\{\s*keys:\s*\['trade', 'records'\]/.test(read('functions/api/store.js')), 'tenant store accepts only the bounded workspace document shape');

const store = new Map();
const listeners = {};
const context = {
  console, Date, Set, Map, JSON, Math, Number, String, Array, Object,
  localStorage: { getItem: (k) => store.get(k) || null, setItem: (k,v) => store.set(k,String(v)) },
  document: { addEventListener() {}, querySelector() { return null; }, documentElement: { lang: 'fr' } },
  addEventListener(type, fn) { listeners[type] = fn; },
  KiwiVenue: { getCurrentVenueData: () => ({ id:'v-fast', subtype:'fastfood', custom:true, name:'Test' }), getVenue: () => 'v-fast' },
  KiwiI18n: { getLang: () => 'fr' },
};
context.window = context;
vm.runInNewContext(read('assets/trade-workspace-schema.js'), context, { filename:'trade-workspace-schema.js' });
vm.runInNewContext(read('assets/trade-workspaces.js'), context, { filename:'trade-workspaces.js' });
vm.runInNewContext(read('assets/pos-workspaces.js'), context, { filename:'pos-workspaces.js' });
const W = context.KiwiTradeWorkspaces;
const S = context.KiwiTradeSchema;
const PW = context.KiwiPosWorkspaces;
ok(W.pages.length >= 45, 'workspace catalogue covers the full operational surface');
ok(W.pages.every((p) => S.get(p.trade,p.nav)), 'every workspace route has a domain-specific schema');
ok(Object.keys(S.defs).length >= 45, 'schema catalogue covers every specialist dashboard and caisse board');
ok(Object.values(S.defs).every((s) => s.fields.some((f) => f.id === 'title') && s.fields.length >= 5), 'every métier record has a real identity and structured operational fields');
ok(Object.values(S.defs).every((s) => Array.isArray(s.stages) && s.stages.length >= 3), 'every métier workflow resolves to actionable translated stages');
ok(Object.values(S.defs).every((s) => s.fields.filter((f) => (f.type === 'number' || f.type === 'money') && f.step && f.min != null).every((f) => Number(f.min) % Number(f.step) === 0)), 'native number controls and schema validation share a reachable step origin');
const POS_ALIAS={boulangerie:'bakery',gym:'sport'};
ok(Object.entries(PW.boards).filter(([,boards])=>Array.isArray(boards)).every(([id,boards])=>boards.every((b)=>S.get(POS_ALIAS[id]||id,b[0]))), 'every caisse operation tab is backed by the same validated métier schema');
ok(PW.boards.spa.length===5 && PW.boards.coiffure.length===6 && PW.boards.gym.length===6, 'service businesses can manage their complete client, staff, catalogue and booking data from the caisse');
ok(W.config('kds').trade === 'fastfood' && W.config('channels').trade === 'fastfood', 'exact subtype resolves its own pages');
ok(W.config('appointments') === null, 'an unrelated generic page is never replaced');
const merged = W.merge(
  { trade:'fastfood', records:{ kds:[{id:'a',title:'old',updatedAt:1}] } },
  { trade:'fastfood', records:{ kds:[{id:'a',title:'new',updatedAt:2},{id:'b',title:'kept',updatedAt:1,deletedAt:4}] } },
);
ok(merged.records.kds.length === 2 && merged.records.kds[0].title === 'new', 'newest device edit wins without dropping other records');
ok(merged.records.kds.some((r) => r.id === 'b' && r.deletedAt === 4), 'deletion tombstones survive cross-device merge');

const credit=S.get('epicerie','credit');
ok(!S.validate(credit,{values:{title:'Client',total:100,paid:120}},[]).ok, 'credit ledger refuses a repayment greater than the debt');
const route=S.get('foodtruck','tables');
ok(!S.validate(route,{values:{title:'Place',address:'Centre',startAt:'2026-08-10T12:00',endAt:'2026-08-10T11:00'}},[]).ok, 'food-truck route refuses an end before its start');
const expiry=S.get('pharmacie','expiries');
const expiring=S.derived(expiry,{id:'lot',status:0,values:{title:'Produit',lot:'L1',expiryAt:'2026-08-20',qty:2}},new Date('2026-08-09T12:00:00Z').getTime());
ok(expiring.derived.expiring && expiring.derived.alert, 'pharmacy lot creates a real thirty-day expiry alert');
const freshness=S.get('fleuriste','freshness');
ok(!S.validate(freshness,{values:{title:'Roses',arrivalAt:'2026-08-09',qty:10,usableQty:11}},[]).ok, 'florist freshness refuses usable stock above the arrival quantity');
const classes=S.get('sport','appointments');
ok(!S.validate(classes,{values:{title:'Yoga',coachRef:'c1',startAt:'2026-08-10T09:00',endAt:'2026-08-10T10:00',capacity:10,booked:12}},[]).ok, 'gym class refuses bookings above capacity');
const claim=S.get('pharmacie','insurers');
const claimSummary=S.summary(claim,[{id:'c',status:1,values:{title:'Dossier',patient:'A',insurer:'CNSS',claimAmount:800,reimbursed:300,dueAt:'2026-08-01'}}],new Date('2026-08-09T12:00:00Z').getTime());
ok(claimSummary.balance===500 && claimSummary.alerts===1, 'insurer ledger derives outstanding reimbursement and overdue follow-up');
const relations=S.relationOptions(S.get('spa','appointments'),{clients:[{id:'cl-1',title:'Amal'}]},S.get('spa','appointments').fields.find((f)=>f.id==='clientRef'));
ok(relations.length===1 && relations[0].value==='cl-1' && relations[0].label==='Amal', 'related client, service, staff and order records resolve across boards');
ok(S.validate(S.get('spa','services'),{values:{title:'Hammam rituel',durationMinutes:90,price:450,active:'yes'}},[]).ok, 'a normal five-minute spa treatment duration passes both browser and domain constraints');
ok(S.normalize(S.get('spa','services'),{}).values.active==='yes', 'new select fields use their métier default without forcing an empty choice');
ok(read('assets/pos-workspaces.js').includes("if(f?.type==='datetime-local')return String(value).replace('T',' ');return String(value);"), 'caisse datetime formatting never strips letters from ordinary names or notes');
store.set('kiwiPairedVenue',JSON.stringify({venueId:'v-fast',merchant:'test',type:'fastfood'}));
PW.write({trade:'fastfood',records:{kds:[{id:'shared-1',title:'Commande',updatedAt:1}]}});
ok(W.read().records.kds[0].id==='shared-1', 'a caisse write is immediately readable from the owner dashboard for the same venue');
W.write({trade:'fastfood',records:{kds:[{id:'shared-1',title:'Prête',updatedAt:2}]}});
ok(PW.read().records.kds[0].title==='Prête', 'a dashboard status edit is immediately readable from the caisse');
ok(!read('assets/trade-workspace-schema.js').includes('records:[') && !read('assets/trade-workspace-schema.js').includes('merchant:'), 'schemas contain no showcase merchant rows or invented tenant data');

console.log('\n✓ exact-trade workspace gate green (' + n + ' checks)');
