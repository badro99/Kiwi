#!/usr/bin/env node
// GET /api/inventory/internal-requests without `id` lists the requests the
// caller may read, newest first, each with its event trail (who did what).
// The economat page has no other way to find a request it did not create.
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/inventory/internal-requests.js';
import { createHotelRequestHarness, MERCHANT } from './fixtures/hotel-request-db.mjs';

let checks = 0;
async function check(name, fn) { await fn(); checks += 1; console.log(`  ok ${checks} - ${name}`); }

const h = await createHotelRequestHarness();
const list = async (cookie = h.ownerCookie, query = '') => {
  const response = await onRequestGet({
    request: new Request(`https://kiwi.test/api/inventory/internal-requests?merchant=${MERCHANT}${query}`, { headers: cookie ? { cookie } : {} }),
    env: h.env,
  });
  return { status: response.status, body: await response.json() };
};

await h.createSubmitted('req-list-a', 'cola', 2);
await h.ready('req-list-b', 'whisky', 1);

await check('the owner lists every request, newest first, with labels', async () => {
  const { status, body } = await list();
  assert.equal(status, 200);
  assert.deepEqual(body.requests.map((r) => r.request.id), ['req-list-b', 'req-list-a']);
  assert.equal(body.requests[0].label, 'ready');
  assert.equal(body.requests[1].label, 'submitted');
  assert.equal(body.confirmationSide, 'recipient');
  assert.equal(body.actor.kind, 'hotel-manager');
});

await check('each request carries its event trail in revision order', async () => {
  const { body } = await list();
  assert.deepEqual(body.requests[0].events.map((e) => e.event), ['created', 'submit', 'review', 'prepare']);
  assert.ok(body.requests[0].events.every((e) => e.actorName && e.ts > 0));
});

await check('a list entry has the same line model as a single read', async () => {
  const { body } = await list();
  const single = await (await h.get('req-list-a')).json();
  assert.deepEqual(body.requests[1].lines, single.lines);
  assert.deepEqual(body.requests[1].request, single.request);
});

await check('the department manager reads their own unit and the storekeeper reads all', async () => {
  const roof = await list(await h.employeeCookie('roof-manager'));
  assert.equal(roof.status, 200);
  assert.equal(roof.body.requests.length, 2);
  const econ = await list(await h.employeeCookie('econ-a'));
  assert.equal(econ.body.requests.length, 2);
});

await check('unitId filters and limit caps the list', async () => {
  assert.equal((await list(h.ownerCookie, '&unitId=economat')).body.requests.length, 0);
  assert.equal((await list(h.ownerCookie, '&unitId=rooftop&limit=1')).body.requests.length, 1);
});

await check('no session reads nothing', async () => {
  const { status } = await list('');
  assert.equal(status, 403);
});

await check('an empty id still answers bad-request, not a list', async () => {
  const response = await onRequestGet({
    request: new Request(`https://kiwi.test/api/inventory/internal-requests?merchant=${MERCHANT}&id=`, { headers: { cookie: h.ownerCookie } }),
    env: h.env,
  });
  assert.equal(response.status, 400);
});

console.log(`economat-request-list-test: ${checks} checks passed`);
