import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = String(__ENV.KIWI_BASE_URL || 'http://127.0.0.1:4181').replace(/\/+$/, '');
const PROFILE = String(__ENV.KIWI_PROFILE || 'smoke');

if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(BASE_URL)) {
  throw new Error('OrderPro pressure writes are hard-locked to the loopback load fixture');
}

const profiles = {
  smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 3, maxDuration: '30s' },
  baseline: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '10s', target: 5 }, { duration: '20s', target: 5 },
      { duration: '10s', target: 0 }],
  },
  pressure: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [
      { duration: '10s', target: 10 }, { duration: '15s', target: 10 },
      { duration: '10s', target: 25 }, { duration: '15s', target: 25 },
      { duration: '10s', target: 50 }, { duration: '15s', target: 50 },
      { duration: '10s', target: 100 }, { duration: '20s', target: 100 },
      { duration: '10s', target: 200 }, { duration: '25s', target: 200 },
      { duration: '15s', target: 0 },
    ],
    gracefulRampDown: '15s',
  },
};
if (!profiles[PROFILE]) throw new Error(`Unknown KIWI_PROFILE: ${PROFILE}`);

const failures = new Rate('kiwi_orderpro_failures');
const backpressure = new Counter('kiwi_orderpro_backpressure');
const backpressure25 = new Counter('kiwi_orderpro_backpressure_le_25');
const backpressure50 = new Counter('kiwi_orderpro_backpressure_le_50');
const backpressure100 = new Counter('kiwi_orderpro_backpressure_le_100');
const backpressure200 = new Counter('kiwi_orderpro_backpressure_le_200');
const mixedBackpressure = new Counter('kiwi_orderpro_mixed_backpressure');
const served = new Counter('kiwi_orderpro_served');
const createDuration = new Trend('kiwi_orderpro_create_duration', true);
const lifecycleDuration = new Trend('kiwi_orderpro_lifecycle_duration', true);
const transitionDuration = new Trend('kiwi_orderpro_transition_duration', true);

export const options = {
  scenarios: { orderpro: profiles[PROFILE] },
  thresholds: {
    checks: ['rate==1'],
    kiwi_orderpro_failures: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    kiwi_orderpro_create_duration: ['p(95)<750'],
    kiwi_orderpro_lifecycle_duration: ['p(95)<1500'],
  },
  userAgent: 'KiwiCapacitySuite/1.0 (OrderPro local synthetic lifecycle)',
};

const jsonHeaders = { 'Content-Type': 'application/json' };

export function setup() {
  const fixture = http.get(`${BASE_URL}/__loadtest/config`);
  const validFixture = check(fixture, {
    'OrderPro fixture is available': (r) => r.status === 200,
    'OrderPro fixture is synthetic': (r) => r.headers['X-Kiwi-Load-Fixture'] === 'amira-loadtest',
  });
  if (!validFixture) exec.test.abort('Refusing OrderPro pressure test: synthetic fixture is absent');
  const config = fixture.json();
  if (!config || config.merchant !== 'amira-loadtest') {
    exec.test.abort('Refusing OrderPro pressure test: unexpected merchant identity');
  }

  // The authenticated till poll is what opens OrderPro for guest phones.
  const desk = http.get(`${BASE_URL}/api/order/queue?merchant=${config.merchant}&since=0`);
  if (!check(desk, { 'synthetic OrderPro desk opens': (r) => r.status === 200 })) {
    exec.test.abort('Refusing OrderPro pressure test: synthetic till did not open');
  }
  return { merchant: config.merchant, runId: String(Date.now()) };
}

function record(label, response, statuses) {
  const ok = check(response, { [label]: (r) => statuses.includes(r.status) });
  failures.add(!ok);
  return ok;
}

function move(data, id, status) {
  const response = http.post(`${BASE_URL}/api/order/queue`, JSON.stringify({
    merchant: data.merchant, id, status,
  }), { headers: jsonHeaders, tags: { endpoint: `orderpro-${status}` } });
  transitionDuration.add(response.timings.duration, { status });
  record(`OrderPro reaches ${status}`, response, [200]);
  return response;
}

export default function (data) {
  const started = Date.now();
  const ref = `k6-orderpro-${data.runId}-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;
  const body = JSON.stringify({
    merchant: data.merchant,
    mode: 'takeout',
    ref,
    lines: [{ id: 'item-load', qty: 1 }],
  });
  const request = {
    method: 'POST', url: `${BASE_URL}/api/order`, body,
    params: {
      headers: jsonHeaders,
      tags: { endpoint: 'orderpro-create-double-tap' },
      responseCallback: http.expectedStatuses(200, 429),
    },
  };

  // A real double tap: both identical checkout requests are in flight together.
  const replies = http.batch([request, request]);
  replies.forEach((response) => createDuration.add(response.timings.duration));
  const statusesExpected = replies.every((response) => response.status === 200 || response.status === 429);
  const accepted = replies.filter((response) => response.status === 200);
  check(replies[0], {
    'OrderPro double tap has an expected outcome': () => statusesExpected,
  });
  failures.add(!statusesExpected);

  if (!accepted.length) {
    backpressure.add(1);
    const active = Number(exec.instance.vusActive) || 0;
    if (active <= 25) backpressure25.add(1);
    else if (active <= 50) backpressure50.add(1);
    else if (active <= 100) backpressure100.add(1);
    else backpressure200.add(1);
    sleep(0.15);
    return;
  }

  let first = null;
  let second = null;
  try { first = accepted[0].json(); second = accepted[1] && accepted[1].json(); } catch (_) {}
  let sameTicket = accepted.length === 2 && first && second && first.id && first.id === second.id;
  let oneReplay = sameTicket && Boolean(first.replayed) !== Boolean(second.replayed);

  /* At the intentional 60-pending guard, two truly simultaneous twins may
     split 200/429: one counted a full queue just before the other committed.
     Once the batch returns, retrying the same client reference must recover
     the winner. That is the network-retry contract OrderPro actually needs. */
  if (accepted.length === 1 && first && first.id) {
    mixedBackpressure.add(1);
    const retry = http.post(`${BASE_URL}/api/order`, body, {
      headers: jsonHeaders,
      tags: { endpoint: 'orderpro-backpressure-retry' },
    });
    let recovered = null;
    try { recovered = retry.json(); } catch (_) {}
    sameTicket = retry.status === 200 && recovered && recovered.id === first.id;
    oneReplay = sameTicket && recovered.replayed === true;
  }
  check(accepted[0], {
    'OrderPro double tap resolves to one ticket': () => sameTicket,
    'OrderPro duplicate or backpressure retry replays once': () => oneReplay,
  });
  failures.add(!(sameTicket && oneReplay));
  // Even when the assertion fails, finish any ticket that was created so the
  // harness itself cannot poison the pending queue for later pressure stages.
  if (!first || !first.id) return;

  if (move(data, first.id, 'accepted').status !== 200) return;
  if (move(data, first.id, 'ready').status !== 200) return;
  if (move(data, first.id, 'served').status !== 200) return;

  const status = http.get(
    `${BASE_URL}/api/order?merchant=${data.merchant}&id=${encodeURIComponent(first.id)}`,
    // Group unique order IDs into one k6 series; otherwise the load generator,
    // not Kiwi, becomes the bottleneck through high-cardinality URL metrics.
    { tags: { endpoint: 'orderpro-customer-status', name: 'GET /api/order status' } },
  );
  let bodyStatus = null;
  try { bodyStatus = status.json(); } catch (_) {}
  const isServed = record('OrderPro customer sees served', status, [200])
    && bodyStatus && bodyStatus.status === 'served';
  check(status, { 'OrderPro final status is served': () => isServed });
  failures.add(!isServed);
  if (isServed) served.add(1);
  lifecycleDuration.add(Date.now() - started);
  sleep(0.08 + Math.random() * 0.12);
}

export function teardown(data) {
  const response = http.get(`${BASE_URL}/__loadtest/stats?runId=${encodeURIComponent(data.runId)}`);
  const stats = response.status === 200 ? response.json() : {};
  check(response, {
    'OrderPro final stats are available': (r) => r.status === 200,
    'OrderPro stored no duplicate client references': () => stats.orderProOrders === stats.orderProRefs,
    'every created OrderPro ticket reached served': () => stats.orderProOrders === stats.orderProServed,
    'OrderPro left no pending synthetic ticket': () => stats.orderProPending === 0,
  });
}
