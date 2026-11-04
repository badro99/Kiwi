import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read, run, html, elements, esc } from './ui-runtime-harness.mjs';
const window={};vm.runInNewContext(read('assets/stock/strings.js'),{window});
for(const L of ['fr','en','ar']) {
 let modal;
 const context={window:{Kiwi:{modal:m=>{modal=m;return {el:{querySelector:()=>null}};}}},STR:window.KiwiStockStrings,lang:()=>L,t:k=>window.KiwiStockStrings[L][k] || k,esc,wireDismiss(){},allCategories:()=>[]};
 run('assets/stock/catalog.js',['openAddCategory'],context).openAddCategory();
 let input=elements(html(modal.body),'input')[0];assert.equal(input.getAttribute('placeholder'),window.KiwiStockStrings[L].categoryExample);
 run('assets/stock/purchasing.js',['openSupplierForm'],context).openSupplierForm();
 const inputs=elements(html(modal.body),'input');
 for(const [attr,key] of [['data-stock-sup-deliv','deliveryExample'],['data-stock-sup-name','supplierExample'],['data-stock-sup-loc','cityExample']]) {
  input=inputs.find(x=>x.hasAttribute(attr));assert.equal(input.getAttribute('placeholder'),window.KiwiStockStrings[L][key]);
 }
}
console.log('✓ stock: real category/supplier forms render example placeholders from FR/EN/AR label owner');
