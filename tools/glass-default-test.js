#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'design-ios27.js'), 'utf8');

function load(saved) {
  const values = new Map(Object.entries(saved || {}));
  const classes = new Set();
  const body = { classList: {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
  } };
  const window = { KiwiDesign2026: { enable() {} } };
  vm.runInNewContext(source, {
    window,
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    },
    document: { readyState: 'complete', body },
  }, { filename: 'assets/design-ios27.js' });
  return { api: window.KiwiDesignIOS27, classes };
}

const fresh = load();
if (fresh.api.getGlass() !== 'opaque' || !fresh.classes.has('glass-opaque')) {
  throw new Error('a new store must start with opaque Liquid Glass');
}

for (const choice of ['clear', 'standard', 'frosted', 'opaque']) {
  if (load({ kiwiGlassLevel: choice }).api.getGlass() !== choice) {
    throw new Error(`saved owner choice was overwritten: ${choice}`);
  }
}

console.log('  ✓ Liquid Glass defaults to opaque and preserves all saved owner choices');
