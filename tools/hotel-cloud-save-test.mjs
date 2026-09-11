#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'assets/cloud-doc.js'), 'utf8');

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const plain = (value) => JSON.parse(JSON.stringify(value));
assert.equal(source.includes('setInterval'), false, 'busy explicit saves do not create an unbounded polling interval');
function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function browser({ real = true, initialSlug = 'hotel-a', fetchImpl }) {
  const storage = new Map();
  const listeners = new Map();
  let slug = initialSlug;
  const listen = (type, fn) => {
    const list = listeners.get(type) || [];
    list.push(fn); listeners.set(type, list);
  };
  const fire = (type) => (listeners.get(type) || []).forEach((fn) => fn({ type }));
  const localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    key: (index) => Array.from(storage.keys())[index] || null,
    get length() { return storage.size; },
  };
  const document = {
    visibilityState: 'hidden',
    addEventListener: listen,
  };
  const window = {
    document,
    localStorage,
    KiwiEnv: { isReal: () => real },
    addEventListener: listen,
  };
  window.window = window;
  const context = vm.createContext({
    window, document, localStorage, console, JSON, Date, Math, Object, Array, String,
    Promise, AbortController, setTimeout, clearTimeout,
    fetch: (url, options) => fetchImpl(String(url), options),
  });
  vm.runInContext(source, context, { filename: 'assets/cloud-doc.js' });
  return {
    cloud: window.KiwiCloudDoc,
    fire,
    setSlug: (next) => { slug = next; },
    currentSlug: () => slug,
    storage,
  };
}

function attach(harness, state = {}, extra = {}) {
  return harness.cloud.attach({
    feature: extra.feature || 'hotel-settings',
    slug: harness.currentSlug,
    read: () => state.data,
    write: (next) => { state.data = next; },
    ...extra,
  });
}

// First load reads the actual server document without posting a local default.
{
  const calls = [];
  const h = browser({ fetchImpl: async (url) => {
    calls.push(url);
    return response(200, { rev: 7, data: { cutoff: '05:00' } });
  } });
  const state = { data: {} };
  const handle = attach(h, state, { isEmpty: (data) => !data || Object.keys(data).length === 0 });
  assert.equal((await handle.bind()), true);
  assert.deepEqual(plain(state.data), { cutoff: '05:00' });
  assert.equal(calls.filter((url) => url.includes('/api/store?')).length, 1);
  assert.equal(calls.filter((url) => url === '/api/store').length, 0);
}

// Disabled and unread saves fail closed with explicit result objects.
{
  const disabled = browser({ real: false, fetchImpl: async () => { throw new Error('must-not-fetch'); } });
  const handle = attach(disabled, { data: {} });
  assert.deepEqual(plain(await handle.save({ enabled: true })), { ok: false, status: 403, error: 'disabled', rev: 0 });

  let releaseRead;
  const unread = browser({ fetchImpl: (url) => new Promise((resolve) => { releaseRead = () => resolve(response(200, { rev: 1, data: {} })); }) });
  const unreadHandle = attach(unread, { data: {} });
  const reading = unreadHandle.bind();
  assert.deepEqual(plain(await unreadHandle.save({ enabled: true })), { ok: false, status: 409, error: 'unread', rev: 0 });
  releaseRead();
  await reading;
}

// An explicit save captures its tenant and rejects a mid-flight tenant switch.
{
  let releasePost;
  const h = browser({ fetchImpl: (url, options) => {
    if (options && options.method === 'POST') return new Promise((resolve) => { releasePost = () => resolve(response(200, { ok: true, rev: 2 })); });
    return Promise.resolve(response(200, { rev: 1, data: { old: true } }));
  } });
  const state = { data: {} };
  const handle = attach(h, state);
  await handle.bind();
  const saving = handle.save({ explicit: 'hotel-a' });
  await wait(0);
  h.setSlug('hotel-b');
  releasePost();
  assert.deepEqual(plain(await saving), { ok: false, status: 409, error: 'tenant-switched', rev: 1 });
}

// Legacy queued push still posts in the background, while explicit failure is
// returned and is not silently replayed by the online listener.
{
  const bodies = [];
  const h = browser({ fetchImpl: async (url, options) => {
    if (options && options.method === 'POST') { bodies.push(JSON.parse(options.body)); return response(503, { error: 'busy' }); }
    return response(200, { rev: 1, data: { old: true } });
  } });
  const state = { data: {} };
  const handle = attach(h, state);
  await handle.bind();
  state.data = { timer: true };
  handle.push(0);
  await wait(30);
  assert.equal(bodies.length, 1);

  const result = await handle.save({ explicit: 'rejected' });
  assert.deepEqual(plain(result), { ok: false, status: 503, error: 'busy', rev: 1 });
  h.fire('online');
  await wait(30);
  assert.equal(bodies.length, 3, 'online retries the legitimate background dirty document');
  assert.deepEqual(bodies[1].data, { explicit: 'rejected' });
  assert.deepEqual(bodies[2].data, { timer: true });
}

// An explicit save racing a background request fails closed immediately.
{
  let releasePost;
  const h = browser({ fetchImpl: async (url, options) => {
    if (options && options.method === 'POST') return new Promise((resolve) => { releasePost = () => resolve(response(200, { ok: true, rev: 2 })); });
    return response(200, { rev: 1, data: { seeded: 'yes' } });
  } });
  const state = { data: {} };
  const handle = attach(h, state, { isEmpty: (data) => !data || Object.keys(data).length === 0 });
  await handle.bind();
  state.data = { background: true };
  const background = handle.flush();
  await wait(0);
  assert.equal(typeof releasePost, 'function');
  assert.deepEqual(plain(await handle.save({ explicit: 'racing' })), { ok: false, status: 409, error: 'busy', rev: 1 });
  releasePost();
  assert.equal((await background).ok, true);
}

// A legitimate queued autosave survives an explicit failure and retries its
// own snapshot, never the rejected explicit draft.
{
  const bodies = [];
  let releaseExplicit;
  const h = browser({ fetchImpl: async (url, options) => {
    if (options && options.method === 'POST') {
      bodies.push(JSON.parse(options.body));
      if (bodies.length === 1) return new Promise((resolve) => { releaseExplicit = () => resolve(response(503, { error: 'temporary' })); });
      return response(200, { ok: true, rev: 2, data: { background: 'queued' } });
    }
    return response(200, { rev: 1, data: { seeded: 'yes' } });
  } });
  const state = { data: {} };
  const handle = attach(h, state, { isEmpty: (data) => !data || Object.keys(data).length === 0 });
  await handle.bind();
  state.data = { background: 'queued' };
  handle.push(0);
  const draft = { explicit: 'draft-before-mutation' };
  const saving = handle.save(draft);
  draft.explicit = 'mutated-after-call';
  await wait(20);
  releaseExplicit();
  assert.equal((await saving).ok, false);
  await wait(450);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].data, { explicit: 'draft-before-mutation' });
  assert.deepEqual(bodies[1].data, { background: 'queued' });
}

// A queued background timer is scoped to the tenant that created it and never
// posts the old document after a venue switch.
{
  let posts = 0;
  const h = browser({ fetchImpl: async (url, options) => {
    if (options && options.method === 'POST') posts++;
    return response(200, { rev: 1, data: { tenant: 'old' } });
  } });
  const state = { data: {} };
  const handle = attach(h, state, { isEmpty: (data) => !data || Object.keys(data).length === 0 });
  await handle.bind();
  state.data = { tenant: 'old', changed: true };
  handle.push(0);
  h.setSlug('hotel-b');
  await wait(30);
  assert.equal(posts, 0, 'queued old-tenant autosave is not posted to the new tenant');
}

// A legacy 409 merge retries the merged current document, not the stale
// pre-conflict timer payload.
{
  const bodies = [];
  const h = browser({ fetchImpl: async (url, options) => {
    if (options && options.method === 'POST') {
      bodies.push(JSON.parse(options.body));
      return bodies.length === 1
        ? response(409, { rev: 2, data: { server: 'new' } })
        : response(200, { ok: true, rev: 3, data: { server: 'new', local: 'draft' } });
    }
    return response(200, { rev: 1, data: { seeded: 'yes' } });
  } });
  const state = { data: {} };
  const handle = attach(h, state, { isEmpty: (data) => !data || Object.keys(data).length === 0 });
  await handle.bind();
  state.data = { local: 'draft' };
  handle.push(0);
  await wait(30);
  await wait(450);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1].data, { server: 'new', local: 'draft' });
}

// Explicit conflict is returned to the caller, with server data available for
// a deliberate decision, and does not merge or autoretry the rejected payload.
{
  let posts = 0;
  const h = browser({ fetchImpl: async (url, options) => {
    if (options && options.method === 'POST') {
      posts++;
      return response(409, { error: 'room-conflict', rev: 9, data: { server: true } });
    }
    return response(200, { rev: 4, data: { local: true } });
  } });
  const state = { data: {} };
  const handle = attach(h, state, { isEmpty: (data) => !data || Object.keys(data).length === 0 });
  await handle.bind();
  const result = await handle.save({ local: 'explicit' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.error, 'room-conflict');
  assert.deepEqual(plain(result.data), { server: true });
  assert.deepEqual(plain(state.data), { local: true });
  h.fire('online');
  await wait(30);
  assert.equal(posts, 1);
}

// A hotel feature whose legacy isEmpty() only checks rooms must still persist
// an explicit property-section save when rooms is empty.
{
  let posts = 0;
  const h = browser({ fetchImpl: async (url, options) => {
    if (options && options.method === 'POST') {
      posts++;
      return response(200, { ok: true, rev: 1 });
    }
    return response(200, { rev: 0, data: {} });
  } });
  const state = { data: { rooms: [] } };
  const handle = attach(h, state, { isEmpty: (data) => !(data && data.rooms && data.rooms.length) });
  await handle.bind();
  const result = await handle.save({ rooms: [], floorConfig: { cutoff: '05:00' } });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(posts, 1, 'explicit section-only property save is not suppressed by rooms-only isEmpty');
}

// Existing non-hotel cloud consumers remain green against the same module.
for (const test of ['tools/cloud-doc-paired-test.js', 'tools/cloud-doc-offline-test.js']) {
  const run = spawnSync(process.execPath, [test], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `${test} regression: ${run.stdout}\n${run.stderr}`);
}

console.log('✓ hotel cloud save contract: read, disabled/unread, tenant capture, bounded busy/failure, conflict, legacy regressions');
