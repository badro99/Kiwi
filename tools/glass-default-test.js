#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'design-ios27.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'design-ios27.css'), 'utf8');

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

if (!/Permanent dashboard rail/.test(css)
    || !/background:\s*#05090B\s*!important/.test(css)
    || !/-webkit-backdrop-filter:\s*none\s*!important/.test(css)
    || !/backdrop-filter:\s*none\s*!important/.test(css)) {
  throw new Error('the dashboard sidebar must stay opaque black for every saved glass level');
}
console.log('  ✓ dashboard sidebar is permanently opaque black');
