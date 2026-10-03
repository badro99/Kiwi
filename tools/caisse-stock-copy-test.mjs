#!/usr/bin/env node
/* Run actual inventory renderer functions with local read-only catalog data. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root,'assets/pos-boutique.js'),'utf8');
const inventory = source.slice(source.indexOf('  /* ─── the inventory panel'), source.indexOf('  /* ─── single-veil modal host'));
const detail = source.slice(source.indexOf('  function openInvProduct('), source.indexOf('  /* ─── new product'));
let count = 0; const failures = [];
function check(label, condition) { count++; if (!condition) failures.push(label); }
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unesc = value => value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
const protectedValue = (html,value) => html.includes('<bdi data-nolang>' + esc(value) + '</bdi>');
const expected = {
  en:['Scanner + label printer','shared catalog with the dashboard','Stock value','Units in stock','Low stock / out of stock','colours','sizes','barcodes','Edit in the dashboard','Stock movements'],
  ar:['ماسح + طابعة ملصقات','كتالوج مشترك مع لوحة التحكم','قيمة المخزون','القطع في المخزون','مخزون منخفض / نفاد المخزون','ألوان','مقاسات','رموز شريطية','التعديل في لوحة التحكم','حركات المخزون'],
};
const copy = [
  ['Scannez un article, ou tapez un code…','Scan an item, or type a code…','امسح منتجًا أو اكتب رمزًا…'],
  ['Articles et prix se gèrent dans le tableau de bord','Manage items and prices in the dashboard','تُدار المنتجات والأسعار في لوحة التحكم'],
  ['Articles et prix se gèrent dans le tableau de bord.','Manage items and prices in the dashboard.','تُدار المنتجات والأسعار في لوحة التحكم.'],
  ["Base d'inventaire indisponible.",'Inventory unavailable.','قاعدة المخزون غير متاحة.'],
  ['couleur','colour','لون'],
  ['couleurs','colours','ألوان'],
  ['taille','size','مقاس'],
  ['tailles','sizes','مقاسات'],
  ['codes-barres','barcodes','رموز شريطية'],
  ['Votre stock porte déjà des codes-barres ?','Does your stock already have barcodes?','هل تحمل منتجات مخزونك رموزًا شريطية بالفعل؟'],
  ['Touchez « Reprendre le stock » et scannez vos articles un par un : Kiwi garde le code du fournisseur tel quel. Aucune étiquette à réimprimer.','Tap “Enter stock” and scan your items one by one: Kiwi keeps the supplier’s code unchanged. No labels to reprint.','اضغط على «إدخال المخزون» وامسح منتجاتك واحدًا تلو الآخر: يحتفظ كيوي برمز المورد كما هو. لا حاجة لإعادة طباعة الملصقات.'],
  ['Pour créer un article ou modifier un prix, ouvrez le tableau de bord. Ici, vous pouvez reprendre le stock et les codes existants.','To create an item or change a price, open the dashboard. Here you can enter stock and existing codes.','لإنشاء منتج أو تعديل سعر، افتح لوحة التحكم. يمكنك هنا إدخال المخزون والرموز الموجودة.'],
  ['Aucune variante, ajoutez une couleur × taille.','No variants; add a colour × size.','لا توجد متغيرات؛ أضف لونًا × مقاسًا.'],
  ['Variantes dans le tableau de bord','Variants in the dashboard','المتغيرات في لوحة التحكم'],
  ['Suppression dans le tableau de bord','Deletion in the dashboard','الحذف في لوحة التحكم'],
  ['Supprimer dans le tableau de bord','Delete in the dashboard','الحذف من لوحة التحكم'],
  ['Stock','Stock','المخزون'],
  ['Code-barres','Barcode','الرمز الشريطي'],
  ['Imprimer toutes les étiquettes','Print all labels','طباعة جميع الملصقات'],
  ["Imprimer l'étiquette",'Print label','طباعة الملصق'],
  ['Générer un EAN-13','Generate an EAN-13','إنشاء EAN-13'],
  ['Enregistrer un code existant','Register an existing code','تسجيل رمز موجود'],
  ['aucun code','no code','لا يوجد رمز'],
  ['importé','imported','مستورد'],
  ['généré','generated','مُنشأ'],
];
for (const lang of ['fr','en','ar']) {
  let treeNodes = [];
  const el = () => ({style:{},dataset:{},classList:{toggle(){},add(){},remove(){},contains(){return false;}},attributes:[],childNodes:[],children:[],setAttribute(){},getAttribute(){return null;},hasAttribute(){return false;},removeAttribute(){},appendChild(){},insertBefore(){},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}});
  const document = {readyState:'complete',documentElement:el(),body:el(),head:el(),createElement:el,getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},createTreeWalker(){const nodes=[...treeNodes];return {nextNode(){return nodes.shift() || null;}};}};
  const panel = {innerHTML:'',querySelectorAll(){return [];}};
  let modal = '', available = true, empty = false, noVariants = false;
  const product = {id:'p',name:'Production',priceMAD:350};
  const variant = {id:'v',stock:7,size:'Dates',colorLabel:'Produits',barcodes:[{code:'CODE<&> $& {n}',primary:true,type:'imported'}]};
  const info = () => ({product,category:{name:'Catégories'},stock:7,colors:['one','two'],sizes:['one','two'],variants:noVariants?[]:[variant]});
  const catalog = {stats:() => ({products:20,variants:191,stockValue:7000,totalStock:7,low:1,ruptures:0}),listCategories:() => [{id:'cat',name:'Catégories'}],categoryCount:() => 20,listProducts:() => empty?[]:[product],getProduct:info};
  const window = {localStorage:{getItem(){return null;},setItem(){},removeItem(){}},addEventListener(){},KiwiBarcode:{svg(){return '<svg></svg>';}},KiwiMaisonStock:{productHistory:() => [{typeLabel:'Entrée',variant:'Produits',ref:'Ticket',qty:2}]} };
  const context = {window,document,localStorage:window.localStorage,console,Date,Intl,Number,String,Math,Set,Map,WeakMap,Array,Object,JSON,Promise,RegExp,setTimeout(){return 0;},clearTimeout(){},requestAnimationFrame(){return 0;},NodeFilter:{SHOW_TEXT:4,SHOW_ELEMENT:1},MutationObserver:function(){this.observe=function(){};this.disconnect=function(){};},
    root:{},state:{},IS_DEMO:true,esc,catDB:() => available?catalog:null,
    $:selector => selector === '[data-bq-panel="inventaire"]'?panel:null,
    icons(){},artOf(){return '';},fmtNum:String,fmtMAD:value => value+' MAD',variantColor:() => ({label:'Produits'}),colorDot(){return '';},variantSource:() => 'Production',invSetModal:html => {modal=html;},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/caisse-lang.js'),'utf8'),context);
  window.KiwiCaisseLang.set(lang);
  for (const [fr,en,ar] of copy) check(lang+': exact inventory copy '+fr,window.KiwiCaisseLang.tr(fr) === (lang==='en'?en:lang==='ar'?ar:fr));
  vm.runInContext(inventory + '\n' + detail + '\nwindow.testInventory={renderInventaire,openInvProduct};',context);
  window.testInventory.renderInventaire();
  const inventoryHtml = panel.innerHTML;
  for (const value of ['Production','Catégories',20,191,7]) check(lang+': inventory protects data '+value,protectedValue(panel.innerHTML,value));
  if (lang !== 'fr') for (const text of expected[lang].slice(0,8)) check(lang+': stock copy '+text,panel.innerHTML.includes(text));
  window.testInventory.openInvProduct('p');
  const detailHtml = modal;
  for (const value of ['Production','Catégories','Produits','Dates','Ticket','CODE<&> $& {n}',7]) check(lang+': detail protects data '+value,protectedValue(modal,value));
  if (lang !== 'fr') for (const text of expected[lang].slice(8)) check(lang+': detail copy '+text,modal.includes(text));
  noVariants=true; window.testInventory.openInvProduct('p');
  const noVariant = window.KiwiCaisseLang.tr('Aucune variante, ajoutez une couleur × taille.');
  check(lang+': detail empty copy',modal.includes(esc(noVariant)));
  if (lang !== 'fr') check(lang+': detail empty not French',noVariant !== 'Aucune variante, ajoutez une couleur × taille.');
  empty=true; window.testInventory.renderInventaire();
  const noProducts = window.KiwiCaisseLang.tr('Votre stock porte déjà des codes-barres ?');
  check(lang+': stock empty copy',panel.innerHTML.includes(esc(noProducts)));
  if (lang !== 'fr') check(lang+': stock empty not French',noProducts !== 'Votre stock porte déjà des codes-barres ?');
  available=false;window.testInventory.renderInventaire();
  check(lang+': unavailable copy',panel.innerHTML.includes(esc(window.KiwiCaisseLang.tr("Base d'inventaire indisponible."))));
  // Feed real emitted UI/data nodes through caisse-lang's actual sweep. A UI
  // first rendered in EN/AR must still return to French; data must never move.
  const html = inventoryHtml + detailHtml;
  const uiNodes = [...html.matchAll(/<span data-caisse-copy="([^"]*)" style="display:contents">([^<]*)<\/span>/g)].map(m => {
    const fr = unesc(m[1]);
    const parent = {nodeType:1,tagName:'SPAN',parentElement:document.body,hasAttribute:name => name==='data-caisse-copy',getAttribute:name => name==='data-caisse-copy'?fr:null};
    return {nodeType:3,nodeValue:unesc(m[2]),parentElement:parent,fr};
  });
  const dataNodes = [...html.matchAll(/<bdi data-nolang>([^<]*)<\/bdi>/g)].map(m => {
    const text = unesc(m[1]);
    const parent = {nodeType:1,tagName:'BDI',parentElement:document.body,hasAttribute:name => name==='data-nolang',getAttribute(){return null;}};
    return {nodeType:3,nodeValue:text,parentElement:parent,text};
  });
  check(lang+': renderer explicitly preserves UI originals',uiNodes.length>20);
  treeNodes=[...uiNodes,...dataNodes];
  for (const next of ['en','ar','fr']) {
    window.KiwiCaisseLang.set(next);
    check(lang+'→'+next+': real translator switches every runtime UI fragment',uiNodes.every(node => node.nodeValue===window.KiwiCaisseLang.bidi(window.KiwiCaisseLang.tr(node.fr))));
    check(lang+'→'+next+': real translator never rewrites merchant data',dataNodes.every(node => node.nodeValue===node.text));
  }
}
assert.equal(failures.length,0,failures.join('\n'));
console.log('✓ Stock copy/data ('+count+' checks: actual inventory/card/detail rendering, empty/error, FR/EN/AR, protected data)');
