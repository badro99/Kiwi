#!/usr/bin/env node
/* identity · /api/me never hangs the identity gate.
 *   node tools/identity-me-timeout-test.mjs
 *
 * 2026-10-12. A God Mode view (dashboard?op=1&merchant=…) sat on
 * « Chargement du journal… » with no operator banner: both wait on
 * KiwiIdentity.ready, which only /api/me settles, and that request had no
 * deadline. An error settled it; a request that never answered did not.
 * This drives the shipped fetchMe() (assets/identity.js) with a fetch that
 * hangs, and holds that the loader still answers. The deadline is shortened
 * for the run; everything else is the shipped text. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'assets/identity.js'), 'utf8');

let passed = 0, failed = 0;
const ok = async (label, fn) => { try { await fn(); passed++; console.log('  ✓ ' + label); } catch (e) { failed++; console.log('  ✗ ' + label + '\n      ' + String(e.message).split('\n')[0]); } };

const start = src.indexOf('  var ME_TIMEOUT_MS = ');
const end = src.indexOf('  var identitySequence = 0;');
assert.ok(start > 0 && end > start, 'fetchMe is extractable from assets/identity.js');
const block = src.slice(start, end);

/* A fetch scripted per attempt: 'hang' never answers (but honours abort, as a
   browser does), 'neterr' rejects at once, a number answers with that status. */
function harness(script) {
  const calls = [];
  const fetch = (url, opts) => {
    const step = script[Math.min(calls.length, script.length - 1)];
    const call = { url, signal: opts && opts.signal, aborted: false };
    calls.push(call);
    if (call.signal) call.signal.addEventListener('abort', () => { call.aborted = true; });
    if (step === 'hang') return new Promise((_res, rej) => {
      if (call.signal) call.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    });
    if (step === 'neterr') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ ok: step === 200, status: step, json: async () => ({ operator: true }) });
  };
  const fetchMe = new Function('fetch', 'AbortController', 'setTimeout', 'clearTimeout',
    block.replace(/ME_TIMEOUT_MS = \d+/, 'ME_TIMEOUT_MS = 40') + '\nreturn { fetchMe, ME_ATTEMPTS };')(fetch, AbortController, setTimeout, clearTimeout);
  return { calls, ...fetchMe };
}

console.log('■ identity · /api/me deadline');
await ok('the shipped deadline is 12 s, three attempts, and loadIdentity goes through it', () => {
  assert.match(block, /ME_TIMEOUT_MS = 12000, ME_ATTEMPTS = 3/);
  assert.match(src, /fetchMe\(meUrl, ME_ATTEMPTS\)/);
  assert.doesNotMatch(src.slice(end), /\n  fetch\(meUrl/, 'no undeadlined /api/me request is left');
});
await ok('a hung first request is aborted and the second answer is used', async () => {
  const h = harness(['hang', 200]);
  const r = await h.fetchMe('/api/me?merchant=pasta-corner', h.ME_ATTEMPTS);
  assert.equal(r.status, 200);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].aborted, true, 'the hung request is aborted, not left open');
  assert.equal(h.calls[1].url, '/api/me?merchant=pasta-corner');
});
await ok('a request that never answers ends in a rejection after three attempts', async () => {
  const h = harness(['hang']);
  const t0 = Date.now();
  await assert.rejects(h.fetchMe('/api/me', h.ME_ATTEMPTS));
  assert.equal(h.calls.length, 3);
  assert.ok(Date.now() - t0 < 2000, 'bounded by the deadline, not forever');
});
await ok('an immediate network error is not retried: the catch settles « unreachable » as before', async () => {
  const h = harness(['neterr', 200]);
  await assert.rejects(h.fetchMe('/api/me', h.ME_ATTEMPTS), /Failed to fetch/);
  assert.equal(h.calls.length, 1);
});
await ok('an HTTP error status is handed back unchanged (500 is still « unreachable », 404 « no backend »)', async () => {
  for (const status of [500, 404]) {
    const h = harness([status]);
    const r = await h.fetchMe('/api/me', h.ME_ATTEMPTS);
    assert.equal(r.status, status);
    assert.equal(h.calls.length, 1);
  }
});
await ok('a quick answer clears its deadline: no late abort, no retry', async () => {
  const h = harness([200, 200]);
  await h.fetchMe('/api/me', h.ME_ATTEMPTS);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].aborted, false);
});

console.log(`\nidentity-me-timeout: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
