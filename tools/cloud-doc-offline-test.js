#!/usr/bin/env node
'use strict';

/* The shared document mirror carries receipts, staff, hours, floor plans and
 * other settings. These checks focus on the two silent offline failure modes:
 * a failed GET must not authorize a blind overwrite, and a failed POST must be
 * retried after a reload even when the user makes no second edit. */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'cloud-doc.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else { fail++; console.log('  ✗ ' + message); }
}
function wait(ms = 20) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function browser(store, fetchImpl) {
  const listeners = Object.create(null);
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    key(i) { return Array.from(store.keys())[i] || null; },
    get length() { return store.size; },
  };
  const document = {
    visibilityState: 'visible',
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
  };
  const window = {
    document,
    localStorage,
    KiwiEnv: { isReal: () => true },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
  };
  window.window = window;
  const load = new Function('window', 'document', 'localStorage', 'fetch',
    'setTimeout', 'clearTimeout', SOURCE);
  load(window, document, localStorage, fetchImpl, setTimeout, clearTimeout);
  return { window, listeners };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

(async function () {
  const store = new Map();
  let doc = { name: 'local' };
  let posts = 0;
  let gets = 0;

  /* A 500 is not a read. Calling push afterwards may re-attempt GET, but must
   * never POST the local default over an unseen server document. */
  const first = browser(store, (url, opts) => {
    if (opts && opts.method === 'POST') { posts++; return Promise.resolve(response(200, { ok: true, rev: 1 })); }
    gets++;
    return Promise.resolve(response(500, { error: 'down' }));
  });
  const h1 = first.window.KiwiCloudDoc.attach({
    feature: 'receipt', slug: () => 'shop', read: () => doc, write: (next) => { doc = next; },
  });
  await h1.pull(true);
  h1.push(0);
  await wait();
  ok(gets >= 2, 'a push after a failed first read retries the read');
  ok(posts === 0, 'a failed first read never authorizes a blind POST');

  /* Establish a valid bookmark, edit locally, then lose the POST. */
  store.set('kiwiDocRev:v1:receipt:shop', '4');
  const second = browser(store, (url, opts) => {
    if (opts && opts.method === 'POST') { posts++; return Promise.reject(new Error('offline')); }
    return Promise.resolve(response(200, { rev: 4, data: { name: 'local' } }));
  });
  const h2 = second.window.KiwiCloudDoc.attach({
    feature: 'receipt', slug: () => 'shop', read: () => doc, write: (next) => { doc = next; },
  });
  await h2.pull(true);
  doc = { name: 'changed offline' };
  h2.push(0);
  await wait();
  const dirtyKey = 'kiwiDocDirty:v1:receipt:shop';
  ok(!!store.get(dirtyKey), 'a failed POST leaves a durable pending marker');

  /* A new page sees the same server revision. The marker, not a second user
   * edit, must cause the changed local document to be sent and then cleared. */
  let retriedBody = null;
  const third = browser(store, (url, opts) => {
    if (opts && opts.method === 'POST') {
      retriedBody = JSON.parse(opts.body);
      return Promise.resolve(response(200, { ok: true, rev: 5 }));
    }
    return Promise.resolve(response(200, { rev: 4, data: { name: 'local' } }));
  });
  const h3 = third.window.KiwiCloudDoc.attach({
    feature: 'receipt', slug: () => 'shop', read: () => doc, write: (next) => { doc = next; },
  });
  await h3.pull(true);
  await wait();
  ok(retriedBody && retriedBody.data.name === 'changed offline', 'reload retries the exact offline document');
  ok(!store.has(dirtyKey), 'a successful retry clears its pending marker');
  ok((third.listeners.online || []).length === 1, 'network restoration has an immediate retry listener');

  ok(SOURCE.includes('clearDirty(slug, sentDirty);'),
    'an untouched empty document does not retain a false pending marker');

  if (fail) {
    console.log(`\n✗ ${fail} cloud-document offline check(s) failed`);
    process.exit(1);
  }
  console.log(`  ✓ ${pass} cloud-document offline checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
