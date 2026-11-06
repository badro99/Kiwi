#!/usr/bin/env node
/* KiwiSaleAliases (assets/live-link/sale-identity.js): bounded, never silently lossy. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/live-link/sale-identity.js', import.meta.url), 'utf8');
function boot(initial = {}) {
  const disk = new Map(Object.entries(initial)), events = [], state = { full: false };
  const localStorage = { getItem: (k) => disk.has(k) ? disk.get(k) : null, setItem(k, v) { if (state.full) throw new Error('QuotaExceededError'); disk.set(k, String(v)); } };
  const window = { dispatchEvent: (e) => events.push(e.type) };
  vm.runInNewContext(source, { window, localStorage, console: { warn() {} }, CustomEvent: class { constructor(type) { this.type = type; } } });
  return { A: window.KiwiSaleIdentity.aliases, disk, events, state };
}
const KEY = 'kiwi:sale-aliases:shop';
{ // grows without bound today: now capped at the newest MAX
  const { A, disk } = boot();
  for (let i = 0; i < 1000; i++) A.set('shop', 'local-' + i, 'srv-' + i);
  const stored = JSON.parse(disk.get(KEY));
  assert.equal(Object.keys(stored).length, A.MAX, 'the map is compacted to MAX entries');
  assert.equal(A.get('shop', 'local-999'), 'srv-999', 'the newest mapping is kept');
  assert.equal(A.get('shop', 'local-0'), 'local-0', 'the oldest is dropped, unknown ids map to themselves');
}
{ // storage full: the mapping survives in memory, the failure is announced, a later write persists it
  const { A, disk, events, state } = boot();
  A.set('shop', 'a', 'srv-a');
  state.full = true;
  assert.equal(A.set('shop', 'b', 'srv-b'), false, 'a refused write is reported');
  assert.ok(events.includes('kiwi:sale-aliases-unsaved'), 'the surface is told');
  assert.equal(A.get('shop', 'b'), 'srv-b', 'a later action still resolves the canonical id');
  assert.equal(A.get('shop', 'a'), 'srv-a');
  state.full = false;
  assert.equal(A.set('shop', 'c', 'srv-c'), true);
  const stored = JSON.parse(disk.get(KEY));
  assert.deepEqual(Object.keys(stored).sort(), ['a', 'b', 'c'], 'the unsaved mapping is flushed with the next write');
}
{ // a corrupt map is set aside, not replaced silently
  const { A, disk } = boot({ [KEY]: '{"a":"srv-a",' });
  A.set('shop', 'z', 'srv-z');
  assert.ok([...disk].some(([k, v]) => k.startsWith(KEY + ':corrupt:') && v === '{"a":"srv-a",'), 'raw corrupt bytes are kept');
}
console.log('✓ sale aliases: bounded, memory fallback announced and flushed, corrupt map kept');
