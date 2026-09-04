#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/src/native-runtime.js', import.meta.url), 'utf8');
let controls = 0;
const ok = (condition, label) => { assert.ok(condition, label); controls++; console.log('  ✓ ' + label); };

function classes(initial = '') {
  const values = new Set(String(initial).split(/\s+/).filter(Boolean));
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const next = force == null ? !values.has(name) : !!force;
      if (next) values.add(name); else values.delete(name);
      return next;
    }
  };
}

function element(className = '') {
  const attrs = new Map();
  return {
    classList: classes(className), dataset: {}, hidden: false, inert: false, style: {
      values: new Map(), setProperty(k, v) { this.values.set(k, String(v)); },
      removeProperty(k) { this.values.delete(k); }, getPropertyValue(k) { return this.values.get(k) || ''; }
    },
    setAttribute(k, v) { attrs.set(k, String(v)); }, getAttribute(k) { return attrs.get(k) || null; },
    appendChild() {}, insertBefore() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    matches(selector) { return selector.split(',').some((part) => part.trim().split('.').slice(1).every((name) => this.classList.contains(name))); },
    dispatchEvent(event) { if (event && event.type === 'click') this.classList.remove('is-open'); return true; }, click() { this.classList.remove('is-open'); }
  };
}

const root = element(); root.lang = 'fr';
const body = element();
const layers = [];
const docListeners = {};
const document = {
  documentElement: root, body, readyState: 'complete',
  querySelector(selector) {
    if (selector === 'meta[name="kiwi-bundle"]' || selector === '.kiwi-native-offline') return null;
    return null;
  },
  querySelectorAll(selector) { return selector.includes('.modal-veil.is-open') ? layers.filter((node) => node.classList.contains('is-open')) : []; },
  getElementById() { return null; }, createElement() { return element(); },
  addEventListener(type, handler) { (docListeners[type] ||= []).push(handler); }
};
const windowListeners = {};
const appListeners = {};
const hapticCalls = [];
let exits = 0, backs = 0, confirms = true;
const localStorage = { values: new Map(), getItem(k) { return this.values.get(k) || null; }, setItem(k, v) { this.values.set(k, String(v)); }, removeItem(k) { this.values.delete(k); } };
const sessionStorage = { values: new Map(), getItem(k) { return this.values.get(k) || null; }, setItem(k, v) { this.values.set(k, String(v)); }, removeItem(k) { this.values.delete(k); } };
const location = { pathname: '/dashboard.html', reload() {} };
const history = { length: 2, back() { backs++; } };
const window = {
  Capacitor: {
    isNativePlatform: () => true, getPlatform: () => 'android',
    Plugins: {
      App: { getInfo: () => Promise.resolve({ version: '1', build: '1' }), addListener(type, handler) { (appListeners[type] ||= []).push(handler); }, exitApp() { exits++; } },
      Haptics: { impact(args) { hapticCalls.push(['impact', args.style]); }, notification(args) { hapticCalls.push(['notification', args.type]); } },
      KiwiDynamicType: { getDynamicTypeScale: () => Promise.resolve({ scale: 1.3 }), addListener() {} }
    }
  },
  location, history, localStorage, sessionStorage,
  addEventListener(type, handler) { (windowListeners[type] ||= []).push(handler); },
  matchMedia: () => ({ matches: false }),
  confirm: () => confirms,
  setTimeout, clearTimeout
};
window.window = window;
const context = vm.createContext({ window, document, location, history, localStorage, sessionStorage, navigator: {}, console, Promise, Date, JSON, Math, Error, String, Number, Array, Object, RegExp, Map, Set, URL, setTimeout, clearTimeout,
  MutationObserver: class { observe() {} }, MouseEvent: class { constructor(type) { this.type = type; } }, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) });
new vm.Script(source, { filename: 'app/src/native-runtime.js' }).runInContext(context);
await new Promise((resolve) => setTimeout(resolve, 0));

ok(appListeners.backButton && appListeners.backButton.length === 1, 'Android Back is registered once with the Capacitor App plugin');
const back = appListeners.backButton[0];
location.pathname = '/kiwi-caisse.html';
const modal = element('modal-veil is-open'); layers.push(modal);
back({ canGoBack: false });
ok(!modal.classList.contains('is-open') && exits === 0, 'Back dismisses the top modal before touching navigation or process state');
body.classList.add('ticket-open'); back({ canGoBack: false });
ok(!body.classList.contains('ticket-open') && exits === 0, 'Back collapses the cart sheet before exiting');
body.classList.add('nav-open'); back({ canGoBack: false });
ok(!body.classList.contains('nav-open') && exits === 0, 'Back closes secondary navigation before exiting');
location.pathname = '/dashboard.html'; back({ canGoBack: true });
ok(backs === 1 && exits === 0, 'Back uses in-app browser history when it is available');
location.pathname = '/kiwi-caisse.html'; history.length = 1; confirms = false; back({ canGoBack: false });
ok(exits === 0, 'Back requires confirmation before exiting the till');
confirms = true; back({ canGoBack: false });
ok(exits === 1, 'confirmed terminal Back exits only after every dismissible layer is exhausted');

(windowListeners['kiwi:toast'] || []).forEach((handler) => handler({ detail: { type: 'danger' } }));
(windowListeners['kiwi:native-haptic'] || []).forEach((handler) => handler({ detail: { kind: 'light' } }));
ok(hapticCalls.some((call) => call[0] === 'notification' && call[1] === 'ERROR'), 'operational error toasts trigger native error feedback');
ok(hapticCalls.some((call) => call[0] === 'impact' && call[1] === 'LIGHT'), 'existing item/payment events still trigger light impact feedback');
ok(root.style.getPropertyValue('--type-scale') === '1.3', 'Dynamic Type scale reaches workspace pages, not only onboarding');

console.log(`native-workspace-ux-test: ${controls} controls passed`);
