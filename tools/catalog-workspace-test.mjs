#!/usr/bin/env node
import stockTestSource from './stock-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=stockTestSource();
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

/* stock#1 / catalogue#2: the shared tab rails follow the WAI-ARIA tabs pattern (roving tabindex,
   aria-controls / aria-labelledby, arrow keys, Home and End), running the real assets/catalog-workspace.js. */
{
  const ROW = /\b(mi-pill-row|mi-subchips|st-tabs|st-item-subtabs|st-filter-row|st-view-toggle|st-venue-row)\b/;
  const active = { el: null };
  class El {
    constructor(tag, cls = '', data = {}) {
      this.tag = tag; this.attrs = new Map(); this.children = []; this.parent = null; this.listeners = {}; this.id = '';
      this.classes = new Set(cls.split(' ').filter(Boolean)); this.dataset = { ...data }; this.scrollLeft = 0; this.textContent = '';
      const self = this;
      this.classList = { add: (c) => self.classes.add(c), contains: (c) => self.classes.has(c), toggle: (c, on) => (on ? self.classes.add(c) : self.classes.delete(c)) };
    }
    add(child) { child.parent = this; this.children.push(child); return child; }
    get nextElementSibling() { const i = this.parent ? this.parent.children.indexOf(this) : -1; return i >= 0 ? this.parent.children[i + 1] || null : null; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return k === 'id' ? (this.id || null) : this.attrs.has(k) ? this.attrs.get(k) : null; }
    removeAttribute(k) { this.attrs.delete(k); }
    matches(sel) { return sel.includes('mi-pill-row') && ROW.test([...this.classes].join(' ')); }
    getBoundingClientRect() { return { left: 0, right: 100 }; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    focus() { active.el = this; }
    click() { this.clicked = (this.clicked || 0) + 1; }
    all(out = []) { for (const c of this.children) { out.push(c); c.all(out); } return out; }
    querySelectorAll(sel) {
      if (sel === ':scope > button') return this.children.filter((c) => c.tag === 'button');
      if (sel === '[data-lens-item]') return this.all().filter((c) => c.dataset.lensItem !== undefined);
      if (sel.includes('mi-pill-row')) return this.all().filter((c) => ROW.test([...c.classes].join(' ')));
      return [];
    }
  }
  const root = new El('div');
  const rail = root.add(new El('div', 'st-tabs'));
  const mk = (label, on, action = 'stock-tab') => { const b = rail.add(new El('button', on ? 'st-tab on' : 'st-tab', { action })); b.textContent = label; return b; };
  const tabs = [mk('Vue', false), mk('Articles', true), mk('Fournisseurs', false)];
  const add = mk('Ajouter', false, 'stock-add-item');
  const body = root.add(new El('div', 'st-tab-body'));
  const win = { KiwiI18n: null };
  const ctx = { window: win, document: { get activeElement() { return active.el; } }, requestAnimationFrame: (f) => f(), getComputedStyle: () => ({ direction: 'ltr' }) };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../assets/catalog-workspace.js', import.meta.url), 'utf8'), ctx);
  win.KiwiCatalogUI.settle(root);
  assert.deepEqual(tabs.map((b) => b.getAttribute('tabindex')), ['-1', '0', '-1'], 'only the selected tab is in the Tab sequence');
  assert.equal(add.getAttribute('tabindex'), null, 'an action button in the rail keeps its normal tab stop');
  assert.ok(body.id && body.getAttribute('role') === 'tabpanel', 'the panel after the rail is a tabpanel with an id');
  assert.ok(tabs.every((b) => b.id && b.getAttribute('aria-controls') === body.id), 'every tab controls that panel');
  assert.equal(body.getAttribute('aria-labelledby'), tabs[1].id, 'the panel is labelled by the selected tab');
  // Arrow keys move between tabs (and wrap), Home and End jump.
  tabs[1].focus();
  const key = (k) => rail.listeners.keydown({ key: k, preventDefault() {} });
  key('ArrowRight'); assert.equal(tabs[2].clicked, 1, 'ArrowRight activates the next tab'); assert.equal(active.el, tabs[2], 'and moves focus to it');
  assert.deepEqual(tabs.map((b) => b.getAttribute('tabindex')), ['-1', '-1', '0'], 'the tab stop follows the focus');
  key('Home'); assert.equal(tabs[0].clicked, 1, 'Home activates the first tab');
  key('End'); assert.equal(tabs[2].clicked, 2, 'End activates the last tab');
  tabs[0].focus(); key('ArrowLeft'); assert.equal(tabs[2].clicked, 3, 'ArrowLeft wraps around');
}
console.log('✓ supplier history: persisted receipts, ISO chronology, grouping, supplier scope and honest empty state');
