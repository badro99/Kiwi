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
const namedElements = new Map();
let dashboardLock = null;
const observers = [];
const docListeners = {};
const document = {
  documentElement: root, body, readyState: 'complete',
  querySelector(selector) {
    if (selector === 'meta[name="kiwi-bundle"]' || selector === '.kiwi-native-offline') return null;
    if (selector === '[data-kiwi-lock]') return dashboardLock;
    return null;
  },
  querySelectorAll(selector) { return selector.includes('.modal-veil.is-open') ? layers.filter((node) => node.classList.contains('is-open') || node.id === 'cp-pin-screen') : []; },
  getElementById(id) { return namedElements.get(id) || null; }, createElement() { return element(); },
  addEventListener(type, handler) { (docListeners[type] ||= []).push(handler); }
};
const windowListeners = {};
const appListeners = {};
const hapticCalls = [];
const statusBarCalls = [];
const hostContexts = [];
const appearanceListeners = [];
const appearance = { matches: false, addEventListener(type, handler) { if (type === 'change') appearanceListeners.push(handler); } };
let exits = 0, backs = 0, confirms = true;
const localStorage = { values: new Map(), getItem(k) { return this.values.get(k) || null; }, setItem(k, v) { this.values.set(k, String(v)); }, removeItem(k) { this.values.delete(k); } };
const sessionStorage = { values: new Map(), getItem(k) { return this.values.get(k) || null; }, setItem(k, v) { this.values.set(k, String(v)); }, removeItem(k) { this.values.delete(k); } };
const location = { pathname: '/dashboard.html', reload() {} };
const history = { length: 2, back() { backs++; } };
const window = {
  innerWidth: 390,
  webkit: { messageHandlers: { kiwiShell: { postMessage(value) { hostContexts.push(value); } } } },
  Capacitor: {
    isNativePlatform: () => true, getPlatform: () => 'android',
    Plugins: {
      App: { getInfo: () => Promise.resolve({ version: '1', build: '1' }), addListener(type, handler) { (appListeners[type] ||= []).push(handler); }, exitApp() { exits++; } },
      Haptics: { impact(args) { hapticCalls.push(['impact', args.style]); }, notification(args) { hapticCalls.push(['notification', args.type]); } },
      StatusBar: { setStyle(args) { statusBarCalls.push(args.style); }, setBackgroundColor() {} },
      KiwiDynamicType: { getDynamicTypeScale: () => Promise.resolve({ scale: 1.3 }), addListener() {} }
    }
  },
  location, history, localStorage, sessionStorage,
  addEventListener(type, handler) { (windowListeners[type] ||= []).push(handler); },
  matchMedia: () => appearance,
  confirm: () => confirms,
  setTimeout, clearTimeout
};
window.window = window;
const context = vm.createContext({ window, document, location, history, localStorage, sessionStorage, navigator: {}, console, Promise, Date, JSON, Math, Error, String, Number, Array, Object, RegExp, Map, Set, URL, setTimeout, clearTimeout,
  MutationObserver: class { constructor(callback) { observers.push(callback); } observe() {} }, MouseEvent: class { constructor(type) { this.type = type; } }, getComputedStyle: (node) => ({ display: node.hidden ? 'none' : 'block', visibility: 'visible', opacity: node.opacity || '1' }) });
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
(windowListeners['kiwi:native-haptic'] || []).forEach((handler) => handler({ detail: { kind: 'success' } }));
ok(hapticCalls.some((call) => call[0] === 'notification' && call[1] === 'ERROR'), 'operational error toasts trigger native error feedback');
ok(hapticCalls.some((call) => call[0] === 'impact' && call[1] === 'LIGHT'), 'item and navigation taps trigger light impact feedback');
ok(hapticCalls.some((call) => call[0] === 'notification' && call[1] === 'SUCCESS'), 'completed payments can trigger native success feedback');
location.pathname = '/dashboard.html';
appearance.matches = true;
appearanceListeners.forEach((handler) => handler({ matches: true }));
ok(statusBarCalls.at(-1) === 'LIGHT', 'system dark appearance does not hide dark status text over the light dashboard');
root.setAttribute('data-theme', 'dark');
appearanceListeners.forEach((handler) => handler({ matches: true }));
ok(statusBarCalls.at(-1) === 'DARK', 'the painted dark dashboard requests light status text');
root.setAttribute('data-theme', 'light');
appearance.matches = false;
body.classList.add('native-shell-page');
appearanceListeners.forEach((handler) => handler({ matches: false }));
ok(statusBarCalls.at(-1) === 'DARK', 'native setup keeps light status text on its ink background in system light mode');
body.classList.remove('native-shell-page');
const clockin = element('is-visible'); clockin.id = 'clockin-screen';
clockin.opacity = '0'; // first frame of the shipped entrance animation
namedElements.set(clockin.id, clockin);
observers.forEach((callback) => callback([{ target: clockin }]));
ok(statusBarCalls.at(-1) === 'DARK', 'dark clock-in overlay keeps status text readable in a light workspace');
clockin.classList.remove('is-visible');
observers.forEach((callback) => callback([{ target: clockin }]));
ok(statusBarCalls.at(-1) === 'LIGHT', 'closing clock-in restores status text for the light workspace');
const pin = element(); pin.id = 'pin-screen'; namedElements.set(pin.id, pin);
observers.forEach((callback) => callback([{ target: pin }]));
ok(statusBarCalls.at(-1) === 'DARK', 'PIN overlay also overrides the workspace status style');
namedElements.delete(pin.id);
observers.forEach((callback) => callback([{ target: body, removedNodes: [pin] }]));
ok(statusBarCalls.at(-1) === 'LIGHT', 'removing a PIN overlay restores the underlying status style');
location.pathname = '/kiwi-cuisine.html';
appearanceListeners.forEach((handler) => handler({ matches: false }));
ok(statusBarCalls.at(-1) === 'DARK', 'kitchen keeps light status text over its dark surface');
location.pathname = '/dashboard.html';
appearanceListeners.forEach((handler) => handler({ matches: false }));
ok(hostContexts.at(-1)?.tabs?.[0]?.id === 'more', 'every compact workspace has a native More route');
dashboardLock = element();
window.KiwiNativeHostRequestState();
ok(hostContexts.at(-1).tabs.length === 0, 'dashboard PIN lock removes the native capsule');
dashboardLock = null;
window.KiwiNativeHostRequestState();
const pairingPin = element(); pairingPin.id = 'cp-pin-screen'; layers.push(pairingPin);
window.KiwiNativeHostRequestState();
ok(hostContexts.at(-1).tabs.length === 0, 'the pairing PIN also removes the native capsule');
layers.pop();
modal.classList.add('is-open');
window.KiwiNativeHostRequestState();
ok(hostContexts.at(-1).tabs.length === 0, 'an open payment modal removes the native capsule');
modal.classList.remove('is-open');
window.KiwiNativeHostRequestState();
ok(hostContexts.at(-1).tabs.length === 1, 'closing the modal restores native navigation');
const styleCount = statusBarCalls.length;
observers.forEach((callback) => callback([{ target: body }]));
ok(statusBarCalls.length === styleCount, 'unchanged style does not repeatedly cross the native bridge');
ok(root.style.getPropertyValue('--type-scale') === '1.3', 'Dynamic Type scale reaches workspace pages, not only onboarding');
ok((source.match(/!document\.body\.classList\.contains\('kiwi-native-hosted'\)/g) || []).length === 2,
  'native host publication cannot retrigger its own body-class observer on iOS or Android');
ok(source.includes('if (more.textContent !== copy.actions) more.textContent = copy.actions'),
  'cart observer does not rewrite its own observed action label on every mutation');
const tokens = fs.readFileSync(new URL('../assets/tokens.css', import.meta.url), 'utf8');
const swift = fs.readFileSync(new URL('../app/ios/App/App/KiwiNativeShell.swift', import.meta.url), 'utf8');
const till = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
ok(till.includes("const activeSource = (mode !== 'vrap' && selectedId)") && till.includes("if (document.documentElement.classList.contains('kiwi-native')) renderMenu();"),
  'product quantities come from the selected table and refresh when the table changes');
ok(/function renderCart\(\)\s*\{[^]*?persistShift\(\)/.test(till) && /function renderOrderPanel\(tableId\)\s*\{[^]*?persistShift\(\)/.test(till),
  'native takeaway and table drafts persist when their visible bill changes');
ok((till.match(/class="pay-covers-meta"/g) || []).length === 2 && fs.readFileSync(new URL('../app/src/native-runtime.css', import.meta.url), 'utf8').includes('[data-mode="vrap"] .pay-covers-meta{display:none}'),
  'native takeaway payment title never shows a meaningless covers count');
const kitchen = fs.readFileSync(new URL('../kiwi-cuisine.html', import.meta.url), 'utf8');
ok(source.includes('Entrez votre <b>code à 4 chiffres</b>') && kitchen.includes("Entrez le code d'appairage à six chiffres du tableau de bord"),
  'native French PIN and kitchen pairing prompts use vous on a phone');
const mint = tokens.match(/--mint:\s*#([0-9a-f]{6})/i)?.[1].toUpperCase();
const nativeMint = swift.match(/private let kiwiMint = Color\(red: (\d+) \/ 255, green: (\d+) \/ 255, blue: (\d+) \/ 255\)/);
ok(!!mint && !!nativeMint && nativeMint.slice(1).map(part => Number(part).toString(16).padStart(2, '0').toUpperCase()).join('') === mint, 'Swift mint stays equal to the locked brand token');

console.log(`native-workspace-ux-test: ${controls} controls passed`);
