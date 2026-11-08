#!/usr/bin/env node
/* orderpro-page.js: startup is driven by an explicit module manifest, not a definition count.
   An extra module defined before the required ones must not start the page early. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/orderpro-page.js', import.meta.url), 'utf8');
function boot() {
  const state = { starts: 0 };
  const KiwiOrderMenu = { orderProParts: null };
  const window = { KiwiOrderMenu };
  const context = { window, KiwiOrderMenu, document: { readyState: 'complete', addEventListener() {}, createElement: () => ({}), head: { appendChild() {} } } };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'assets/orderpro-page.js' });
  const parts = KiwiOrderMenu.orderProParts;
  /* start() asks the owner for its view first: counting that call is the start signal. */
  parts.owner = () => { state.starts++; throw new Error('stop-after-start'); };
  const define = (name) => { try { parts.define(name, [], () => ({})); } catch (e) { if (e.message !== 'stop-after-start') throw e; } };
  return { state, define };
}
const manifest = ['session', 'table', 'menu', 'cart', 'payment'];
{ const t = boot(); manifest.forEach(t.define); assert.equal(t.state.starts, 1, 'the five manifest modules start the page once'); }
{ const t = boot(); t.define('extra'); manifest.slice(0, 4).forEach(t.define); assert.equal(t.state.starts, 0, 'an unlisted module must not count towards startup'); t.define('payment'); assert.equal(t.state.starts, 1, 'the last required module starts it'); }
{ const t = boot(); manifest.slice().reverse().forEach(t.define); assert.equal(t.state.starts, 1, 'definition order does not matter'); t.define('later'); assert.equal(t.state.starts, 1, 'a module defined after start does not restart'); }
console.log('✓ orderpro module manifest: startup waits for the named modules');
