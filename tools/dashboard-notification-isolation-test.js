#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'dashboard-native.js'), 'utf8');

function boot(custom) {
  let timers = 0;
  const listeners = [];
  const document = {
    hidden: false,
    body: { classList: { add() {}, remove() {} }, appendChild() {} },
    documentElement: { scrollTop: 0 },
    addEventListener(type) { listeners.push(type); },
    querySelector() { return null; },
    createElement() { throw new Error('merchant notification simulator created UI'); }
  };
  const window = {
    KiwiVenue: { isCustom: () => custom },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    scrollY: 0
  };
  vm.runInNewContext(source, {
    window,
    document,
    requestAnimationFrame() {},
    clearTimeout() {},
    setTimeout() { timers += 1; return timers; },
    Promise
  });
  return { timers, listeners };
}

const merchant = boot(true);
if (merchant.timers !== 0) throw new Error('custom merchant scheduled a simulated sale notification');
if (merchant.listeners.includes('visibilitychange')) throw new Error('custom merchant installed the simulated notification listener');

const demo = boot(false);
if (demo.timers !== 1) throw new Error('demo venue no longer schedules its showcase notification');
if (!demo.listeners.includes('visibilitychange')) throw new Error('demo venue lost its notification visibility listener');

console.log('dashboard notification isolation: 4 controls passed');
