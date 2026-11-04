import assert from 'node:assert/strict';
import { run, html, elements, esc } from './ui-runtime-harness.mjs';
let markup;
const product={id:'p',name:'Coat',kind:'taille',priceMAD:12.50};
const cat={listCategories:()=>[],countCodeless:()=>0,getProduct:()=>({product,variants:[]}),sizePresets:()=>[]};
const context={intake:{},state:{},catDB:()=>cat,invSetModal:body=>{markup=body;},intakeHeader:()=>'',esc,symBadge:()=>'',catSelectOptions:()=>'',kindSelectOptions:()=>'',colorPicker:()=>'',tillInventoryAllowed:()=>true,iconPickerHtml:()=>''};
const funcs=run('assets/pos-boutique/inventory.js',['intakeNew','intakeAddVariantHere','openRegisterOnVariant','intakeFix','openEditProduct'],context);
for(const invoke of [()=>funcs.intakeNew({code:'scan'},{}),()=>funcs.intakeAddVariantHere('p'),()=>funcs.openRegisterOnVariant('v','p'),()=>funcs.intakeFix('p'),()=>funcs.openEditProduct('p')]) {
 invoke();const doc=html(markup);const controls=[...elements(doc,'input'),...elements(doc,'select')];
 for(const input of controls) {
  const id=input.getAttribute('id');
  assert.ok(elements(doc,'label').some(label=>label.getAttribute('for')===id),'explicit visible label for '+id);
 }
}
console.log('✓ inventory: real intake, precision, barcode, variant and edit controls have explicit labels');
