#!/usr/bin/env node
/* Wave 15 · lane G · la file de reprise des réceptions hors ligne ne perd rien.
 * Les fonctions viennent de assets/stock/intake.js et s'exécutent telles quelles ;
 * seuls window.localStorage, fetch et le toast sont des doubles. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'assets/stock/intake.js'), 'utf8');
const strings = fs.readFileSync(path.join(root, 'assets/stock/strings.js'), 'utf8');
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log('  ok ' + checks + ' - ' + name); };

function fn(name) {
  const m = src.match(new RegExp('(?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, 'function present: ' + name);
  return m[0];
}
const NAMES = ['stIntakeMerchant', 'stIntakeOutboxKey', 'stIntakeOutboxRead', 'stIntakeOutboxWrite', 'stIntakeMarkOnce'];

/** @param {{ failWrites?: boolean, online?: boolean }} [o] */
function scope(o = {}) {
  const map = new Map();
  const win = {
    Kiwi: undefined,
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { if (o.failWrites) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
    },
  };
  const fetchStub = async () => { if (!o.online) throw new Error('offline'); return { ok: true }; };
  const api = new vm.Script('(function (window, fetch) {\n' + NAMES.map(fn).join('\n') + '\nreturn { ' + NAMES.join(', ') + ' };\n})')
    .runInThisContext()(win, fetchStub);
  return { api, map };
}

await check('the 51st unsent delivery does not evict the oldest', async () => {
  const { api } = scope();
  for (let i = 0; i < 51; i++) await api.stIntakeMarkOnce('doc-' + i);
  const ids = api.stIntakeOutboxRead().map((e) => e.docId);
  assert.equal(ids.length, 51);
  assert.equal(ids[0], 'doc-0', 'the oldest receipt is still queued');
  assert.equal(ids[50], 'doc-50');
});

await check('a long offline spell (300 deliveries) keeps every one', async () => {
  const { api } = scope();
  for (let i = 0; i < 300; i++) await api.stIntakeMarkOnce('doc-' + i);
  assert.equal(api.stIntakeOutboxRead().length, 300);
});

await check('a delivery marked once online leaves the queue, the others stay', async () => {
  const off = scope();
  await off.api.stIntakeMarkOnce('a');
  await off.api.stIntakeMarkOnce('b');
  const on = scope({ online: true });
  on.map.set(on.api.stIntakeOutboxKey(), off.map.get(off.api.stIntakeOutboxKey()));
  assert.equal(await on.api.stIntakeMarkOnce('a'), true);
  assert.deepEqual(on.api.stIntakeOutboxRead().map((e) => e.docId), ['b']);
});

await check('a localStorage write failure is reported, never swallowed', async () => {
  const { api } = scope({ failWrites: true });
  assert.equal(api.stIntakeOutboxWrite([{ docId: 'x', ts: 1 }]), false);
  assert.equal(await api.stIntakeMarkOnce('x'), false, 'not marked');
  assert.equal(api.stIntakeOutboxRead().some((e) => e.docId === 'x'), false, 'and not queued: the caller can tell the user');
});

await check('a successful write is reported and readable', async () => {
  const { api } = scope();
  assert.equal(api.stIntakeOutboxWrite([{ docId: 'x', ts: 1 }]), true);
  assert.equal(api.stIntakeOutboxRead().some((e) => e.docId === 'x'), true);
});

await check('the confirm path tells the user in FR, EN and AR when nothing could be queued', () => {
  assert.match(src, /stIntakeOutboxRead\(\)\.some\(\(e\) => e\.docId === intakeDocId\) \? 'mScanMarkRetry' : 'mScanOutboxLost'/);
  const hits = strings.match(/mScanOutboxLost: '/g) || [];
  assert.equal(hits.length, 3, 'one string per language');
  assert.ok(!/mScanOutboxLost: '[^']*—/.test(strings), 'no em dash');
});

console.log(`\n${checks} stock intake outbox checks passed`);
