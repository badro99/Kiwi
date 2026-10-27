#!/usr/bin/env node
/* tools/clients-outbox-owner-test.mjs · the loyalty queues have one owner.
 *
 * assets/clients-store.js keeps four queues on the device: profile edits and
 * deletions, purchases and refunds, reward redemptions, and refused rewards.
 * Each used to read and write localStorage on its own and swallow a refused
 * write. When the browser refused the write (quota full, private mode) while
 * the till was offline, the event was gone: the points never reached the
 * server, the customer lost them at the next pull, a redeemed reward could be
 * spent again on another till, and a replayed checkout counted twice locally.
 *
 * Now one store owns the four keys (outboxRead / outboxWrite): a refused write
 * is held in memory, so the event still leaves this session, a replay is still
 * refused, and the held copy is written as soon as storage accepts it again.
 *
 * The shipped file runs in a VM device with a storage that can refuse writes
 * and a network that can be cut. No browser, no hosted data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { concatParts } from './concat-parts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets/clients-store.js'), 'utf8');
const BOOK = 'outbox-fixture-shop';
const QUEUE = /^kiwi:clients-(out|purchases|redemptions|refused-redemptions):v1:/;
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };

function device(storage = new Map()) {
  const net = { online: false, sent: [] };
  const disk = { full: false };
  const stores = {};
  const define = (name, opts) => (stores[name] = {
    data: {},
    get(k) { return this.data[k] || (opts && opts.blank ? opts.blank() : null); },
    set(v, k) { this.data[k] = JSON.parse(JSON.stringify(v)); },
    subscribe() { return () => {}; },
  });
  const window = {
    KiwiStore: { define, currentVenue: () => BOOK },
    KiwiEnv: { isReal: () => true },
    addEventListener() {},
  };
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => {
      if (disk.full && QUEUE.test(k)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      storage.set(k, String(v));
    },
    removeItem: (k) => storage.delete(k),
  };
  const fetch = (url, opts) => {
    if (!opts || !opts.method) return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
    if (!net.online) return Promise.reject(new Error('offline'));
    net.sent.push({ method: opts.method, url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
  };
  const context = vm.createContext({
    window, KiwiStore: window.KiwiStore, KiwiEnv: window.KiwiEnv, localStorage, fetch,
    navigator: { onLine: true }, console, setInterval: () => 1, clearInterval() {},
  });
  vm.runInContext(SOURCE, context, { filename: 'assets/clients-store.js' });
  return { api: window.KiwiClients, net, disk, storage };
}
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const queued = (d, kind) => JSON.parse(d.storage.get('kiwi:clients-' + kind + ':v1:' + BOOK) || '[]');

/* 1 · Storage refuses, the till is offline, then the network returns. */
{
  const d = device();
  d.api.setConfig({ model: 'visit', visit: { target: 1 } }, BOOK);
  const client = d.api.upsert({ name: 'Outbox Fixture', phone: '0612345678' }, BOOK);
  await settle();
  d.disk.full = true;
  const first = d.api.recordPurchase(client.id, { amount: 120, saleId: 'sale-1' }, BOOK);
  ok(first && first.client, 'purchase recorded locally while storage refuses');
  const replay = d.api.recordPurchase(client.id, { amount: 120, saleId: 'sale-1' }, BOOK);
  ok(!replay || replay.client.visits === first.client.visits, 'a replayed checkout is still refused when the queue could not be written');
  d.api.redeem(client.id, BOOK);
  d.api.upsert({ id: client.id, notes: 'edited offline' }, BOOK);
  await settle();
  ok(d.net.sent.length === 0, 'nothing reached the network while offline');

  d.net.online = true;
  d.api.sync();
  await settle();
  const posts = d.net.sent.filter((r) => r.method === 'POST').map((r) => r.body);
  ok(posts.some((b) => b.purchase && b.purchase.ref === 'purchase:' + client.id + ':sale-1'), 'the held purchase leaves this session once online');
  ok(posts.filter((b) => b.purchase).length >= 1 && new Set(posts.filter((b) => b.purchase).map((b) => b.purchase.ref)).size === 1, 'one purchase, never two');
  ok(posts.some((b) => b.redemption && b.redemption.clientId === client.id), 'the held redemption leaves this session once online');
  ok(posts.some((b) => b.id === client.id && b.notes === 'edited offline'), 'the held profile edit leaves this session once online');
}

/* 2 · The held copy is written as soon as storage accepts it again, so a
 *     reload after recovery still has the event. */
{
  const storage = new Map();
  const d = device(storage);
  const client = d.api.upsert({ name: 'Reload Fixture', phone: '0698765432' }, BOOK);
  await settle();
  d.disk.full = true;
  d.api.recordPurchase(client.id, { amount: 80, saleId: 'sale-2' }, BOOK);
  await settle();
  ok(!queued(d, 'purchases').some((e) => e.ref === 'purchase:' + client.id + ':sale-2'), 'precondition: the refused write left nothing on disk');
  d.disk.full = false;
  d.api.sync();
  await settle();
  ok(queued(d, 'purchases').some((e) => e.ref === 'purchase:' + client.id + ':sale-2'), 'the held purchase is on disk once storage accepts writes');
  const after = device(storage);
  after.net.online = true;
  after.api.sync();
  await settle();
  ok(after.net.sent.some((r) => r.body && r.body.purchase && r.body.purchase.ref === 'purchase:' + client.id + ':sale-2'), 'after a reload the purchase is still sent');
}

/* 3 · Ownership: the four queue keys are written in one place only. */
{
  const writes = [...SOURCE.matchAll(/localStorage\.setItem\(([^,]+),/g)].map((m) => m[1].trim());
  const direct = writes.filter((w) => /outKey|purchaseKey|redemptionKey|refused|clients-(out|purchases|redemptions)/.test(w));
  const owner = SOURCE.slice(SOURCE.indexOf('function outboxWrite(key, list)'), SOURCE.indexOf('function outboxPersistHeld('));
  ok(direct.length === 0 && writes.filter((w) => w === 'key').length === 1 && /localStorage\.setItem\(key,/.test(owner), 'only outboxWrite writes a loyalty queue: ' + JSON.stringify(direct));
  const reads = [...SOURCE.matchAll(/ls\((outKey|purchaseKey|redemptionKey)\(|ls\('kiwi:clients-refused/g)];
  ok(reads.length === 0, 'queue reads go through outboxRead');
  /* The store's concatenation parts are slices of SOURCE, checked above. */
  const PARTS = concatParts(ROOT);
  for (const other of ['assets', 'app/src']) {
    const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) return e.name === 'vendor' ? [] : walk(rel);
      return /\.js$/.test(e.name) && rel !== 'assets/clients-store.js' && !PARTS.has(rel) ? [rel] : [];
    });
    let dirs = [];
    try { dirs = walk(other); } catch (_) {}
    for (const file of dirs) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(!/clients-(out|purchases|redemptions|refused-redemptions):v1/.test(text), file + ' touches a loyalty queue key');
    }
  }
  checks++;
}

console.log(`✓ clients outbox owner: ${checks} checks (refused writes held and sent once online, written back after recovery, survives reload, one writer)`);
