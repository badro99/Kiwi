#!/usr/bin/env node
/* r21 orderpro#A2: a guest's submit whose answer never came back is uncertain. The page is reloaded, the guest
   sends another course, then taps the first course again. The real retry code (assets/orderpro/transport.js) over
   a persistent storage must hand the first course the SAME ref it had (the server dedupes on it), give the second
   course its own, and keep both attached to the same visit scope. Reload = a new session object, same storage. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const libraries = {};
vm.runInNewContext(fs.readFileSync('assets/orderpro/transport.js', 'utf8'), { URLSearchParams, KiwiOrderMenu: { orderProParts: { run: (name, factory) => { libraries[name] = factory(); } } } });
const disk = new Map();
const localStorage = { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => { disk.set(k, String(v)); }, removeItem: (k) => { disk.delete(k); }, get length() { return disk.size; }, key: (i) => [...disk.keys()][i] ?? null };
const capabilities = { crypto: webcrypto, localStorage, TextEncoder, Uint8Array };
const page = () => Object.assign({ id: 'visit-1', mode: 'table', table: '7', pendingSend: null, retiredSendRefs: new Set() }, libraries.transport.retry({ NET: { slug: 'shop' } }, capabilities));
const course1 = [{ id: 'tajine', qty: 2 }], course2 = [{ id: 'the', qty: 1 }];

const first = page();
const a = await first.prepareSend(course1);           /* sent, answer lost: uncertain */
const afterReload = page();                          /* the page is reloaded */
const b = await afterReload.prepareSend(course1);
assert.equal(b.ref, a.ref, 'after a reload the uncertain course is retried under its own ref');
assert.equal(b.scope, a.scope, 'in the same visit');
const c = await afterReload.prepareSend(course2);    /* the guest orders another course meanwhile */
assert.notEqual(c.ref, a.ref, 'the next course has its own ref');
assert.equal(c.scope, a.scope, 'and attaches to the same visit');
const again = page();                                /* reload again, the guest taps the first course once more */
const d = await again.prepareSend(course1);
assert.equal(d.ref, a.ref, 'the first course keeps its ref after another course went through, so the server counts it once');
console.log('✓ orderpro: uncertain submit, reload, next course, retry of the first: one ref per course, one visit');
{
  /* Once the server has answered for a course its ref is retired for good: the same order later is a new order. */
  const p = page();
  const x = await p.prepareSend(course1);
  await p.prepareSend(course2);
  p.clearPendingSend(x);
  const y = await page().prepareSend(course1);
  assert.notEqual(y.ref, x.ref, 'an acknowledged course is not replayed under its old ref');
  assert.ok(![...disk.keys()].some((k) => k.includes(':held:' + x.ref)), 'and its held record is gone');
}
console.log('✓ orderpro: an acknowledged course releases its held ref');
