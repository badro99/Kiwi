#!/usr/bin/env node
/* Exercise the actual shared Vendus renderer and picker, not copied helpers.
 * Merchant words deliberately collide with translations in caisse-lang. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'assets/sold-insights.js'), 'utf8');
let checks = 0;
const failures = [];
function check(name, ok) { checks++; if (!ok) failures.push(name); }
const today = new Date();
const day = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
const data = ['Produits', 'Production', 'Dates', 'A&B <img src=x> $& {n}'];
const localized = {
  en: { 'dernière vente':'latest sale', 'en stock':'in stock', 'Aucune vente détaillée sur la période choisie':'No detailed sales in the selected period' },
  ar: { 'dernière vente':'آخر بيع', 'en stock':'في المخزون', 'Aucune vente détaillée sur la période choisie':'لا توجد مبيعات مفصّلة في الفترة المختارة' },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const protectedData = (html, value) => html.includes('<bdi data-nolang>' + esc(value) + '</bdi>');
function fixture(lang, dashboard = false) {
  const controls = new Map();
  const dates = new Map();
  const panel = {
    innerHTML:'', isConnected:true,
    querySelectorAll(selector) {
      const attr = selector.slice(1, -1);
      return [...this.innerHTML.matchAll(new RegExp('<button[^>]*\\b' + attr + '(?:="([^"]*)")?[^>]*>', 'g'))].map(m => {
        const key = attr + ':' + (m[1] || '');
        const datasetKey = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const button = { dataset:{ [datasetKey]:m[1] || '' } };
        controls.set(key, button); return button;
      });
    },
    querySelector(selector) {
      const attr = selector.slice(1, -1);
      if (!this.innerHTML.includes(attr)) return null;
      if (/^data-ksold-(day|from|to)$/.test(attr)) return { value:dates.get(attr) || day };
      const key = attr + ':';
      const button = controls.get(key) || {};
      controls.set(key, button); return button;
    },
  };
  let sales = [{ ref:'Ticket', ts:Date.now() - 1000, amount:170, lines:data.map((name, i) => ({pid:String(i), name, qty:i + 1, total:10})) }];
  const store = { getItem:key => key === 'kiwi:bqDay' ? JSON.stringify(sales) : null };
  const el = () => ({ style:{}, dataset:{}, classList:{toggle(){},add(){},remove(){},contains(){return false;}}, attributes:[], childNodes:[], children:[], setAttribute(){},getAttribute(){return null;},hasAttribute(){return false;},removeAttribute(){},appendChild(){},insertBefore(){},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];} });
  const document = {
    readyState:'complete', documentElement:{...el(),lang}, body:el(), head:el(),
    createElement:el, getElementById(){return null;}, querySelector(){return null;},querySelectorAll(){return [];},
    addEventListener(){}, createTreeWalker(){return {nextNode(){return null;}};},
  };
  const window = {
    localStorage:store, addEventListener(){},
    KiwiBoutiqueCatalog:{
      listCategories:() => [{id:'category',name:'Catégories'}],
      listProducts:() => data.map((name, i) => ({id:String(i),name,categoryId:'category'})),
      listVariants:() => [{stock:12}],
    },
    KiwiI18n:{getLang:() => lang},
    KiwiSales:{list:() => sales},
    Kiwi:{appPage:(_id,page) => { panel.innerHTML = page.body; }},
  };
  const context = {window,document,localStorage:store,console,Date,Intl,Number,String,Math,Set,Map,WeakMap,Array,Object,JSON,Promise,RegExp,
    fetch:undefined,setTimeout(){return 0;},clearTimeout(){},requestAnimationFrame(){return 0;},
    NodeFilter:{SHOW_TEXT:4,SHOW_ELEMENT:1}, MutationObserver:function(){this.observe=function(){};this.disconnect=function(){};},
    Kiwi:window.Kiwi, KiwiSales:window.KiwiSales,
  };
  vm.createContext(context);
  if (!dashboard) {
    vm.runInContext(fs.readFileSync(path.join(root,'assets/caisse-lang.js'),'utf8'), context);
    window.KiwiCaisseLang.set(lang);
  } else {
    // Dashboard controls live under document, but still use actual renderer.
    document.querySelectorAll = selector => panel.querySelectorAll(selector);
    document.querySelector = selector => panel.querySelector(selector);
  }
  vm.runInContext(source, context);
  if (!dashboard) document.querySelector = selector => selector === '.ksold' ? {closest:() => panel} : null;
  const render = () => dashboard ? window.KiwiSoldInsights.renderDashboard() : window.KiwiSoldInsights.renderTill(panel);
  render();
  return {panel, controls, render, setLang(next){window.KiwiCaisseLang.set(next);},empty(){sales = [];}, setDates(from,to){dates.set('data-ksold-from',from); dates.set('data-ksold-to',to);}};
}
for (const lang of ['fr','en','ar']) for (const dashboard of [false,true]) {
  const label = (dashboard ? 'dashboard' : 'till') + '/' + lang;
  const f = fixture(lang, dashboard);
  for (const name of data) check(label + ': product stays protected and escaped ' + name, protectedData(f.panel.innerHTML, name));
  check(label + ': category stays protected', protectedData(f.panel.innerHTML, 'Catégories'));
  check(label + ': receipt reference stays protected', protectedData(f.panel.innerHTML, 'Ticket'));
  check(label + ': stock count stays protected', protectedData(f.panel.innerHTML, 12));
  if (lang !== 'fr') {
    check(label + ': last-sale label translated', f.panel.innerHTML.includes(localized[lang]['dernière vente']));
    check(label + ': stock label translated', f.panel.innerHTML.includes(localized[lang]['en stock']));
  }
  f.empty(); f.render();
  f.controls.get('data-ksold-custom:1').onclick();
  f.controls.get('data-ksold-apply:').onclick();
  const locale = {fr:'fr-FR',en:'en-GB',ar:'ar-MA'}[lang];
  const dateText = today.toLocaleDateString(locale, {day:'numeric',month:'short'});
  check(label + ': custom date label uses the active locale', protectedData(f.panel.innerHTML,dateText));
  if (lang !== 'fr') check(label + ': custom empty heading translated', f.panel.innerHTML.includes(localized[lang]['Aucune vente détaillée sur la période choisie']));
  check(label + ': custom heading does not leave French date prefix', !f.panel.innerHTML.includes('Aucune vente détaillée du '));
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 20);
  const from = [first.getFullYear(), String(first.getMonth()+1).padStart(2,'0'), String(first.getDate()).padStart(2,'0')].join('-');
  f.controls.get('data-ksold-custom:1').onclick();
  f.controls.get('data-ksold-mode:range').onclick();
  f.setDates(from,day);
  f.controls.get('data-ksold-apply:').onclick();
  const rangeText = first.toLocaleDateString(locale,{day:'numeric',month:'short'}) + ' – ' + dateText;
  check(label + ': both custom range endpoints use the active locale', protectedData(f.panel.innerHTML,rangeText));
  if (!dashboard) for (const next of ['en','ar','fr']) {
    f.setLang(next);
    const nextLocale = {fr:'fr-FR',en:'en-GB',ar:'ar-MA'}[next];
    const changedRange = first.toLocaleDateString(nextLocale,{day:'numeric',month:'short'}) + ' – ' + today.toLocaleDateString(nextLocale,{day:'numeric',month:'short'});
    check(label+'→'+next+': language subscription reformats protected range data',protectedData(f.panel.innerHTML,changedRange));
    check(label+'→'+next+': runtime empty heading retains its French source',f.panel.innerHTML.includes('data-caisse-copy="Aucune vente détaillée sur la période choisie"'));
  }
}
assert.equal(failures.length, 0, failures.join('\n'));
console.log('✓ Sold locale/data (' + checks + ' checks: real renderer, picker, locale dates, protected merchant data)');
