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
ok(dash.includes('assets/trade-workspaces.js?v=1') && dash.includes('assets/trade-workspaces.css?v=1'), 'dashboard loads the operational workspace layer');
ok(caisse.includes('assets/pos-workspaces.js?v=1') && caisse.includes('assets/pos-workspaces.css?v=1'), 'caisse loads the shared operational bridge');
ok(posDispatch.includes("'0016': { id: 'autre'") && posDispatch.includes('KiwiPosWorkspaces.mount(root, id)'), 'other activity has its own till and every exact till mounts shared operations');
ok(read('assets/pos-workspaces.js').includes("pressing:'native'") && read('assets/pos-workspaces.js').includes('KiwiPressingOps?.summary'), 'pressing till exposes its shared live garment operations explicitly');
['trade-workspaces.js?v=1','trade-workspaces.css?v=1','pos-workspaces.js?v=1','pos-workspaces.css?v=1','pos-autre.js','pos-autre.css']
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
vm.runInNewContext(read('assets/trade-workspaces.js'), context, { filename:'trade-workspaces.js' });
const W = context.KiwiTradeWorkspaces;
ok(W.pages.length >= 45, 'workspace catalogue covers the full operational surface');
ok(W.config('kds').trade === 'fastfood' && W.config('channels').trade === 'fastfood', 'exact subtype resolves its own pages');
ok(W.config('appointments') === null, 'an unrelated generic page is never replaced');
const merged = W.merge(
  { trade:'fastfood', records:{ kds:[{id:'a',title:'old',updatedAt:1}] } },
  { trade:'fastfood', records:{ kds:[{id:'a',title:'new',updatedAt:2},{id:'b',title:'kept',updatedAt:1,deletedAt:4}] } },
);
ok(merged.records.kds.length === 2 && merged.records.kds[0].title === 'new', 'newest device edit wins without dropping other records');
ok(merged.records.kds.some((r) => r.id === 'b' && r.deletedAt === 4), 'deletion tombstones survive cross-device merge');

console.log('\n✓ exact-trade workspace gate green (' + n + ' checks)');
