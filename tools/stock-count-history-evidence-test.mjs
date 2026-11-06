#!/usr/bin/env node
/* Local count history (assets/stock/counts.js stSaveCountHistory): the count just made survives a tight quota,
   and a count that cannot be kept or that was cut is reported, never silent. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/stock/counts.js', import.meta.url), 'utf8');
function boot(limit) {
  const disk = new Map();
  const localStorage = { getItem: (k) => disk.has(k) ? disk.get(k) : null, setItem(k, v) { if (String(v).length > limit) throw new Error('QuotaExceededError'); disk.set(k, String(v)); } };
  let api;
  const window = { KiwiStockInternal: { install(name, fn) { api = fn({ stCountHistKey: () => 'hist', stockState: {} }); } } };
  vm.runInNewContext(source, { window, localStorage, console });
  return { api, disk };
}
const lines = (n, ref) => Array.from({ length: n }, (_, i) => ({ it: { id: 'i' + i, name: 'Article ' + i, unit: 'kg' }, theo: 5, counted: 4, diff: -1, costDiff: -2, reasonKey: 'x' }));
{ // plenty of room: 24 kept, all durable
  const { api, disk } = boot(1e9);
  for (let i = 0; i < 30; i++) api.stSaveCountHistory('c' + i, lines(3));
  const list = JSON.parse(disk.get('hist'));
  assert.equal(list.length, 24); assert.equal(list[0].ref, 'c29');
}
{ // tight quota: oldest entries go first, the new count is kept and reported durable
  const { api, disk } = boot(1e9);
  for (let i = 0; i < 10; i++) api.stSaveCountHistory('old' + i, lines(40));
  const size = disk.get('hist').length;
  const tight = boot(Math.floor(size * 0.4)); tight.disk.set('hist', disk.get('hist'));
  const saved = tight.api.stSaveCountHistory('fresh', lines(40));
  assert.equal(saved.durable, true, 'the new count fits after dropping the oldest');
  const list = JSON.parse(tight.disk.get('hist'));
  assert.equal(list[0].ref, 'fresh'); assert.ok(list.length < 11, 'older entries were dropped, not the new one');
}
{ // nothing fits: reported, not swallowed
  const { api } = boot(10);
  assert.equal(api.stSaveCountHistory('x', lines(3)).durable, false);
}
{ // more than 200 gaps: marked as cut, with the real total
  const { api, disk } = boot(1e9);
  const saved = api.stSaveCountHistory('big', lines(250));
  assert.equal(saved.truncated, true); assert.equal(saved.gapsTotal, 250);
  assert.equal(JSON.parse(disk.get('hist'))[0].gaps.length, 200);
  assert.equal(api.stSaveCountHistory('small', lines(5)).truncated, false);
}
console.log('✓ stock count history evidence: quota drops oldest first, durability and truncation reported');
