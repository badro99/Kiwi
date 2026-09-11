#!/usr/bin/env node
// Test suite: Biometric Unlock & Inactivity Relock (Criterion #4)
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeRuntime = fs.readFileSync(path.join(ROOT, 'app/src/native-runtime.js'), 'utf8');
const swiftPlugin = fs.readFileSync(path.join(ROOT, 'app/plugins/kiwi-printer-socket/ios/Sources/KiwiPrinterSocket/KiwiPrinterSocketPlugin.swift'), 'utf8');
const javaPlugin = fs.readFileSync(path.join(ROOT, 'app/plugins/kiwi-printer-socket/android/src/main/java/com/kiwios/printersocket/KiwiPrinterSocketPlugin.java'), 'utf8');
const caisseHtml = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let passed = 0;
const EXPECTED = 10;

function check(label, ok) {
  assert(ok, label);
  passed++;
  console.log('  + ' + label);
}

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function classList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    toggle(name, force) {
      if (force === undefined ? !values.has(name) : force) values.add(name);
      else values.delete(name);
      return values.has(name);
    },
    contains(name) { return values.has(name); },
  };
}

function element() {
  return {
    className: '', classList: classList(), style: {}, textContent: '',
    setAttribute() {}, appendChild() {}, addEventListener() {},
  };
}

function runtimeHarness({
  now = 1_000_000,
  local = {},
  session = {},
  biometric = { isAvailable: true, biometryType: 'face' },
  authentication = { authenticated: true },
  lock = true,
  unlockApp = false,
} = {}) {
  const clock = { now };
  const localStorage = memoryStorage(local);
  const sessionStorage = memoryStorage(session);
  const listeners = {};
  const counters = { reload: 0, reveal: 0, unlock: 0, authenticate: 0 };
  const pin = element();
  const body = element();
  const root = element();
  root.getAttribute = () => null;
  root.style.setProperty = () => {};
  const offline = element();
  let hasOffline = false;
  body.appendChild = (node) => { if (node.className === 'kiwi-native-offline') hasOffline = true; };

  const socket = {
    checkBiometrics: async () => biometric,
    authenticateBiometric: async () => { counters.authenticate++; return authentication; },
    secureGet: async () => ({ value: null }),
    secureRemove: async () => ({}),
    deviceIdentity: async () => ({ id: '' }),
  };
  const app = {
    getInfo: async () => ({ version: '1.0', build: '1' }),
    addListener(name, callback) { (listeners[name] ||= []).push(callback); },
  };
  const document = {
    documentElement: root,
    body,
    readyState: 'loading',
    hidden: false,
    querySelector(selector) {
      if (selector === 'meta[name="kiwi-bundle"]') return null;
      if (selector === '.kiwi-native-offline') return hasOffline ? offline : null;
      return null;
    },
    createElement: element,
    getElementById(id) { return id === 'pin-screen' ? pin : null; },
    addEventListener(name, callback) { (listeners['document:' + name] ||= []).push(callback); },
  };

  const RealDate = Date;
  class FakeDate extends RealDate { static now() { return clock.now; } }
  const window = {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {
        KiwiPrinterSocket: socket,
        App: app,
        Network: { getStatus: async () => ({ connected: true }), addListener() {} },
      },
    },
    document,
    localStorage,
    sessionStorage,
    location: { pathname: '/dashboard.html', reload() { counters.reload++; } },
    matchMedia: () => ({ matches: false }),
    addEventListener(name, callback) { (listeners['window:' + name] ||= []).push(callback); },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  };
  window.window = window;
  if (lock) window.__kiwiLock = { reveal() { counters.reveal++; } };
  if (unlockApp) window.__kiwiUnlockApp = () => { counters.unlock++; };

  const context = vm.createContext({
    window, document, localStorage, sessionStorage, location: window.location,
    Date: FakeDate, MutationObserver: class { observe() {} },
    URLSearchParams, Event, Error, Promise, JSON, Math, String, Number,
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
  });
  new vm.Script(nativeRuntime, { filename: 'app/src/native-runtime.js' }).runInContext(context);

  return {
    api: window.KiwiNative,
    clock,
    localStorage,
    sessionStorage,
    counters,
    pin,
    body,
  };
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection in biometric-unlock-test:', err);
  process.exit(1);
});

async function run() {
  console.log('\n■ Biometric Unlock & Inactivity Relock Tests');

  // Native boundary guards remain source-level because Node cannot execute the
  // iOS/Android plugin implementations. The lifecycle state machine below is
  // exercised through the real shipped JavaScript, not text matching.
  check('Swift plugin registers and evaluates LocalAuthentication biometrics',
    swiftPlugin.includes('CAPPluginMethod(name: "checkBiometrics"') &&
    swiftPlugin.includes('CAPPluginMethod(name: "authenticateBiometric"') &&
    swiftPlugin.includes('.deviceOwnerAuthenticationWithBiometrics') &&
    swiftPlugin.includes('context.evaluatePolicy('));
  check('Android biometric methods are explicitly unavailable stubs',
    javaPlugin.includes('public void checkBiometrics(PluginCall call)') &&
    javaPlugin.includes('public void authenticateBiometric(PluginCall call)') &&
    javaPlugin.includes('"isAvailable", false'));
  check('Caisse persists and restores the in-progress cart across relock reload',
    caisseHtml.includes('cart: cart,') &&
    caisseHtml.includes('localStorage.setItem(KC_STORE, JSON.stringify({') &&
    caisseHtml.includes('if (Array.isArray(d.cart)) cart = d.cart;'));

  const short = runtimeHarness();
  short.api.handleNativeAppState({ isActive: false });
  const shortStamp = Number(short.localStorage.getItem('kiwi:native:last-active'));
  short.clock.now = shortStamp + 19 * 60 * 1000;
  short.api.handleNativeAppState({ isActive: true });
  check('19 minutes away does not mark biometric pending or reload',
    short.counters.reload === 0 && short.sessionStorage.getItem('kiwi:native:biometric-pending') === null);

  const boundary = runtimeHarness();
  boundary.api.handleNativeAppState({ isActive: false });
  const boundaryStamp = Number(boundary.localStorage.getItem('kiwi:native:last-active'));
  boundary.clock.now = boundaryStamp + 20 * 60 * 1000;
  boundary.api.handleNativeAppState({ isActive: true });
  check('exactly 20 minutes away marks pending, refreshes activity, and reloads once',
    boundary.counters.reload === 1 &&
    boundary.sessionStorage.getItem('kiwi:native:biometric-pending') === '1' &&
    Number(boundary.localStorage.getItem('kiwi:native:last-active')) === boundary.clock.now);

  for (const result of [
    { authenticated: false, cancelled: true },
    { authenticated: false, error: 'authentication-failed' },
  ]) {
    const failed = runtimeHarness({
      session: { 'kiwi:native:biometric-pending': '1', kiwiIdleLockReason: 'away' },
      authentication: result,
    });
    const unlocked = await failed.api.maybePromptBiometricUnlock();
    check((result.cancelled ? 'Cancelled' : 'Failed') + ' biometric clears pending state and leaves the PIN gate standing',
      unlocked === false &&
      failed.sessionStorage.getItem('kiwi:native:biometric-pending') === null &&
      failed.sessionStorage.getItem('kiwiIdleLockReason') === null &&
      failed.counters.reveal === 0 && failed.counters.unlock === 0 &&
      failed.pin.style.display !== 'none' && !failed.body.classList.contains('is-unlocked'));
  }

  const unavailable = runtimeHarness({
    session: { 'kiwi:native:biometric-pending': '1' },
    biometric: { isAvailable: false, biometryType: 'none' },
  });
  const unavailableResult = await unavailable.api.maybePromptBiometricUnlock();
  check('Unavailable biometric hardware falls through to PIN without authenticating or dead-ending',
    unavailableResult === false && unavailable.counters.authenticate === 0 &&
    unavailable.sessionStorage.getItem('kiwi:native:biometric-pending') === null &&
    unavailable.pin.style.display !== 'none' && unavailable.counters.reveal === 0);

  const idleOnly = runtimeHarness({ session: { kiwiIdleLockReason: 'idle' } });
  const idleUnlocked = await idleOnly.api.maybePromptBiometricUnlock();
  check('kiwiIdleLockReason alone is pending and successful biometrics reveals the lock',
    idleUnlocked === true && idleOnly.counters.authenticate === 1 &&
    idleOnly.counters.reveal === 1 && idleOnly.sessionStorage.getItem('kiwiIdleLockReason') === null);

  const caisse = runtimeHarness({
    session: { 'kiwi:native:biometric-pending': '1' },
    lock: false,
    unlockApp: true,
  });
  const caisseUnlocked = await caisse.api.maybePromptBiometricUnlock();
  check('successful biometrics uses the caisse unlock hook when no dashboard lock exists',
    caisseUnlocked === true && caisse.counters.unlock === 1);

  assert.strictEqual(passed, EXPECTED, `Expected ${EXPECTED} checks, passed ${passed}`);
  console.log(`\nbiometric-unlock-test: ${passed} checks green\n`);
}

run();
