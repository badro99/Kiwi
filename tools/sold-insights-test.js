#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let pass = 0; const fail = [];
function ok(name, yes) { if (yes) pass++; else fail.push(name); }

const products = [
  { id:'shirt', name:'Chemise', categoryId:'tops' },
  { id:'jean', name:'Jean', categoryId:'bottoms' },
  { id:'belt', name:'Ceinture', categoryId:'accessories' },
];
const stocks = { shirt:4, jean:8, belt:1 };
const window = {
  KiwiBoutiqueCatalog: {
    listCategories: () => [{id:'tops',name:'Hauts'},{id:'bottoms',name:'Bas'},{id:'accessories',name:'Accessoires'}],
    listProducts: () => products.map(p => ({...p})),
    listVariants: id => [{ stock:stocks[id] }],
  },
  addEventListener() {},
};
const context = { window, document:{ getElementById(){return null;} }, localStorage:{getItem(){return null;}}, console, Date, Intl, Number, String, Math, Set, Array, Object, JSON, Promise, fetch:undefined, setTimeout(){} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'assets','sold-insights.js'),'utf8'), context);

const now = Date.now();
const sales = [
  { ref:'A', ts:now-1000, amount:700, lines:[{name:'Chemise M',qty:2,total:400},{name:'Jean 40',qty:1,total:300}] },
  { ref:'B', ts:now-2000, amount:450, lines:[{name:'Chemise L',qty:1,total:200},{name:'Ceinture TU',qty:1,total:250}] },
  { ref:'B', ts:now-2000, amount:450, lines:[{name:'Chemise L',qty:1,total:200},{name:'Ceinture TU',qty:1,total:250}] }, // replay
];
const a = window.KiwiSoldInsights.analyze(sales, 7);
ok('counts distinct tickets', a.tickets === 2);
ok('deduplicates server/local replay', a.units === 5);
ok('ranks real products', a.products[0] && a.products[0].name === 'Chemise' && a.products[0].qty === 3);
ok('maps product category', a.categories.some(c => c.name === 'Hauts' && c.qty === 3));
ok('finds products bought together', a.pairs.some(p => p.a === 'Chemise' && p.b === 'Jean' && p.count === 1));
ok('carries current stock', a.products.find(p => p.name === 'Ceinture').stock === 1);

const src = fs.readFileSync(path.join(ROOT,'assets','sold-insights.js'),'utf8');
const venues = fs.readFileSync(path.join(ROOT,'assets','venues.js'),'utf8');
const caisse = fs.readFileSync(path.join(ROOT,'assets','pos-boutique.js'),'utf8');
ok('dashboard reads existing KiwiSales ledger', /KiwiSales\.list/.test(src));
ok('cashier backfills authenticated store feed', /api\/feed\?merchant=/.test(src) && /credentials:'same-origin'/.test(src));
ok('cashier rejects a differently stamped local journal', /b\.m\s*&&\s*slug\(\)\s*&&\s*b\.m\s*!==\s*slug\(\)/.test(src));
ok('dashboard nav sits after returns', /nav:\s*'returns'[\s\S]{0,300}nav:\s*'sold'/.test(venues));
ok('cashier has Vendus panel', /data-bq-view="vendus"/.test(caisse) && /data-bq-panel="vendus"/.test(caisse));
ok('dashboard keeps only its page-level Vendus title', /\(owner\?'':'<h1>Vendus<\/h1>'\)/.test(src));
ok('recommendations are evidence gated', /pairs\[0\][\s\S]{0,80}count\s*>=\s*2/.test(src));

if (fail.length) { fail.forEach(x => console.log('  ✗ '+x)); process.exit(1); }
console.log('  ✓ Vendus ('+pass+' contrôles : historique existant, produits, catégories, paniers, stock, isolation, recommandations)');
