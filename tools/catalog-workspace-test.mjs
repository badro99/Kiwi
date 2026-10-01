#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../assets/stock.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  function supplierHistory(s){'),source.indexOf('  function renderSupplierCard'));
let receipts=[];let movements=[];
const history=new Function('window','getInv','itemHistory',body+';return supplierHistory;')({KiwiProcurement:{doc:()=>({receipts})}},()=>[{id:'i1'}],()=>movements);
receipts=[{id:'r-old',supplierId:'s1',receivedAt:'2026-09-01',lines:[{qty:2,unitCost:30}]},{id:'r-new',supplierId:'s1',receivedAt:'2026-10-01',lines:[{qty:3,unitCost:10}]},{id:'unrelated',supplierId:'s2',receivedAt:Date.now(),lines:[]}];
assert.deepEqual(history({id:'s1'}).map(r=>r.reference),['r-new','r-old']);
assert.equal(history({id:'s1'})[0].total,30);
receipts=[];movements=[{id:'m1',refId:'receipt1',reason:'receipt',qty:2,unitCost:30,occurredTs:10,meta:{supplierId:'s1'}},{id:'m2',refId:'receipt1',reason:'receipt',qty:3,unitCost:10,occurredTs:10,meta:{supplierId:'s1'}},{id:'foreign',refId:'receipt2',reason:'receipt',qty:999,unitCost:99,meta:{supplierId:'s2'}}];
assert.equal(history({id:'s1'}).length,1);
assert.equal(history({id:'s1'})[0].total,90);
movements=[];assert.deepEqual(history({id:'s1'}),[]);
console.log('✓ supplier history: persisted receipts, ISO chronology, grouping, supplier scope and honest empty state');
