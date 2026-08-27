#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../assets/design-vexel-layout.js', import.meta.url), 'utf8');

assert.match(
  dashboard,
  /<script src="assets\/design-vexel-layout\.js\?v=\d+" defer><\/script>/,
  'the default dashboard layout is loaded as a render-critical deferred asset'
);
assert.doesNotMatch(
  dashboard,
  /design-vexel-layout\.js[^>]*fetchpriority="low"/,
  'the first visible composition is never fetched as background work'
);
assert.doesNotMatch(
  layout,
  /KiwiDashboardBoot\.whenUnlocked\(start\)/,
  'the adapter does not wait until the legacy dashboard is already visible'
);
assert.match(
  layout,
  /\* Vexel is the default dashboard[\s\S]*\n  start\(\);\n\}\)\(\);/,
  'the adapter composes under the PIN overlay before first app paint'
);

console.log('vexel-startup-test: 4 first-paint controls passed');
