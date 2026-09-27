#!/usr/bin/env node
// Ticket #99: no dashboard entry point may promise an unavailable payment rail
// or advertise mock integrations. The actual Settings integration route stays.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['dashboard header payment link', !read('dashboard.html').includes('data-action="payment-link"')],
  ['dashboard mock integrations', !read('dashboard.html').includes('data-integ-card')],
  ['mobile home payment link', !read('assets/simple.js').includes('data-simple-action="payment-link"')],
  ['command palette payment link', !read('assets/interactive.js').includes("k: 'payment-link'")],
  ['quick sale payment link', !read('assets/interactive.js').includes('data-method="link"')],
  ['assistant payment-link action', !read('assets/agent.js').includes("h: 'payment-link'")],
  ['opportunity card payment link', !read('assets/oppo-cards.js').includes("id: 'paylink'")],
  ['reservation payment link', !read('assets/pages.js').includes('data-action="payment-link"')],
  ['payment-link handler not registered', !read('assets/features.js').includes("handlers['payment-link'] =") && !read('assets/operations-ui.js').includes("H['payment-link'] =")],
  ['integration configuration stays in Settings', read('assets/interactive.js').includes("{ action: 'add-integration' }")],
];
for (const [name, passed] of checks) assert.ok(passed, name);
console.log(`✓ ${checks.length} unoffered-action entrypoint checks`);
