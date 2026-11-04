import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource } from './deadline-vm-source.mjs';
import { fixture } from './server-money-fixture.mjs';
import { onRequestGet as workspace } from '../functions/api/admin/workspace.js';
import { operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
const read = file => fs.readFileSync(file, 'utf8');

// Real guest transport, including the production deadline wrapper and body read.
let factory, response;
const timers = new Map(); let timerId = 0;
const context = { KiwiOrderMenu: { orderProParts: { run(_name, fn) { factory = fn().create; }, register(_name, api) { factory = api.create; } } },
  URLSearchParams, fetch: async () => { if (response instanceof Error) throw response; return response; },
  Date, AbortController, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
// The module registers its API on the local registry supplied by the runtime.
const transport = read('assets/orderpro/transport.js');
vm.runInNewContext(deadlineVmSource(transport), context);
const net = factory({ location: { search: '?s=shop' }, fetch: context.fetch, demo: () => null });
for (const status of [401, 403, 404, 503]) {
  response = { ok: false, status, json: async () => ({}) };
  assert.equal(await net.catalog(), null); assert.equal(net.readError.kind, 'http'); assert.equal(net.readError.status, status);
}
response = { ok: true, status: 200, json: async () => { throw new SyntaxError('broken'); } };
assert.equal(await net.catalog(), null); assert.equal(net.readError.kind, 'response');
response = new TypeError('offline');
assert.equal(await net.catalog(), null); assert.equal(net.readError.kind, 'network');
response = { ok: true, status: 200, json: () => new Promise(() => {}) };
const pending = net.catalog();
for (let i = 0; i < 12; i++) await Promise.resolve();
for (const fn of [...timers.values()]) fn();
assert.equal(await pending, null); assert.equal(net.readError.kind, 'timeout');
response = { ok: true, status: 200, json: async () => ({ menu: {} }) };
assert.ok((await net.catalog()).menu); assert.equal(net.readError, null);
console.log('PASS OrderPro distinguishes HTTP, JSON, timeout and offline and clears recovered diagnostics');

// Drive both real booking forms; malformed 2xx never invokes success or drops ref.
for (const lang of ['fr', 'en', 'ar']) for (const hotel of [false, true]) {
  const memory = new Map(), error = { textContent: '' }, button = {}, state = { lang, service: { id: 'service', total: 10 }, slot: '2026-11-04T12:00Z', partySize: 1 };
  let api, succeeded = 0, sent = [];
  const form = { querySelector: selector => selector === '[data-error]' ? error : button };
  const scope = { crypto: { randomUUID: () => 'stable' }, window: {}, FormData: class { get(key) { return { name: 'Guest', email: 'guest@example.test' }[key] || ''; } },
    fetch: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => { throw new SyntaxError('malformed'); } }; },
    AbortController, Date, setTimeout, clearTimeout,
    ctx: { owner: { getState: () => state }, party: () => 1, ssGet: k => memory.get(k), ssSet: (k,v) => memory.set(k,v), ssDel: k => memory.delete(k),
      t: key => key, ht: key => key, layout: () => succeeded++, merchant: 'shop' } };
  const source = deadlineVmSource(read('assets/booking-submission.js').replace('export function ', 'function '));
  api = vm.runInNewContext(source + '\ncreateBookingSubmission(ctx);', scope);
  for (let i = 0; i < 2; i++) await api[hotel ? 'submitHotel' : 'submit']({ preventDefault() {}, currentTarget: form });
  assert.equal(succeeded, 0); assert.equal(button.disabled, false);
  assert.ok(error.textContent && error.textContent !== 'timeout' && error.textContent !== 'error');
  assert.equal(sent.length, 2); assert.equal(sent[0].ref, sent[1].ref);
  scope.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('request-timeout'); } });
  await api[hotel ? 'submitHotel' : 'submit']({ preventDefault() {}, currentTarget: form });
  assert.equal(error.textContent, 'timeout');
}
console.log('PASS both booking forms keep retry identity and show translated uncertain confirmation in FR/EN/AR');

// Authenticated real route on node:sqlite; cursor walks timestamp ties and tenant scope.
const f = await fixture(new URL('../', import.meta.url).pathname);
try {
  const now = Date.now();
  for (let i = 0; i < 405; i++) f.DB.prepare(`INSERT INTO client_errors (id,merchant,message,file,version,count,first_seen_ts,last_seen_ts) VALUES(?,?,?,?,?,1,?,?)`)
    .bind('review-' + i, f.merchant, 'guest@example.test 123456\nprivate stack', 'file.js', '1', now, now).run();
  f.DB.prepare(`INSERT INTO client_errors (id,merchant,message,count,first_seen_ts,last_seen_ts) VALUES('other','server-other-shop','private',1,?,?)`).bind(now,now).run();
  const token = await operatorToken(f.env.AUTH_SECRET);
  const identity = await operatorIdToken(f.env.AUTH_SECRET, 'money-operator');
  async function page(query, auth = true) { return workspace({ env: f.env, request: new Request('https://kiwi.test/api/admin/workspace?' + query, { headers: auth ? { Cookie: 'kiwi_op=' + token + '; kiwi_op_id=' + identity } : {} }) }); }
  assert.equal((await page('source=errors', false)).status, 403);
  for (let i = 0; i < 405; i++) {
    f.DB.prepare("INSERT INTO print_jobs(id,merchant,target,data_b64,created_ts,expires_ts) VALUES(?,?,'{}','',?,?)").bind('review-'+i,f.merchant,now,now+60000).run();
    f.DB.prepare("INSERT INTO operational_commands(id,merchant,domain,action,status,idempotency_key,payload,created_ts,updated_ts) VALUES(?,?,'shopify','sync','pending',?,'{}',?,?)").bind('review-'+i,f.merchant,'review-'+i,now,now).run();
  }
  for (const source of ['errors','print','integrations']) {
  const ids = new Set(); let before = '';
  do {
    const res = await page('source=' + source + '&merchant=' + f.merchant + '&before=' + before);
    assert.equal(res.status, 200); const data = await res.json();
    assert.ok(data.rows.length <= 200);
    for (const row of data.rows) { assert.ok(!ids.has(row.id)); ids.add(row.id); assert.equal(row.merchant, f.merchant); if (source === 'errors') assert.equal(row.message, '•••@••• ••••'); }
    before = data.next;
  } while (before);
  assert.equal(ids.size, 405);
  }
  assert.equal((await page('source=accounts')).status, 400);
  assert.equal((await page('source=errors&before=-1')).status, 400);
  console.log('PASS operator pagination reaches 405 tied rows, isolates tenants, masks errors and enforces authentication');
} finally { f.close(); }
