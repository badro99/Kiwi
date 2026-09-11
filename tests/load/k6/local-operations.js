import http from 'k6/http';
import crypto from 'k6/crypto';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = String(__ENV.KIWI_BASE_URL || 'http://127.0.0.1:4181').replace(/\/+$/, '');
const PROFILE = String(__ENV.KIWI_PROFILE || 'smoke');

if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(BASE_URL)) {
  throw new Error('Operational writes are hard-locked to a loopback load fixture');
}

const profiles = {
  smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 3, maxDuration: '30s' },
  baseline: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '10s', target: 5 }, { duration: '20s', target: 5 }, { duration: '10s', target: 0 }],
  },
  capacity: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '15s', target: 10 }, { duration: '20s', target: 10 },
      { duration: '15s', target: 25 }, { duration: '30s', target: 25 }, { duration: '15s', target: 0 }],
  },
  spike: {
    executor: 'ramping-vus', startVUs: 1,
    stages: [{ duration: '5s', target: 1 }, { duration: '5s', target: 50 },
      { duration: '20s', target: 50 }, { duration: '10s', target: 0 }],
  },
};
if (!profiles[PROFILE]) throw new Error(`Unknown KIWI_PROFILE: ${PROFILE}`);

const operationFailures = new Rate('kiwi_operation_failures');
const stockConflicts = new Counter('kiwi_stock_conflicts');
const saleDuration = new Trend('kiwi_sale_duration', true);
const stockDuration = new Trend('kiwi_stock_sync_duration', true);
const channelDuration = new Trend('kiwi_channel_order_duration', true);
const shopifyDuration = new Trend('kiwi_shopify_webhook_duration', true);

export const options = {
  scenarios: { operations: profiles[PROFILE] },
  thresholds: {
    checks: ['rate==1'],
    kiwi_operation_failures: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    kiwi_sale_duration: ['p(95)<350'],
    kiwi_stock_sync_duration: ['p(95)<350'],
    kiwi_channel_order_duration: ['p(95)<350'],
    kiwi_shopify_webhook_duration: ['p(95)<350'],
  },
  userAgent: 'KiwiCapacitySuite/1.0 (local synthetic writes)',
};

export function setup() {
  const response = http.get(`${BASE_URL}/__loadtest/config`);
  const valid = check(response, {
    'load fixture is available': (r) => r.status === 200,
    'fixture identity is explicit': (r) => r.headers['X-Kiwi-Load-Fixture'] === 'amira-loadtest',
  });
  if (!valid) exec.test.abort('Refusing operational load: the local amira-loadtest fixture is not active');
  const config = response.json();
  if (!config || config.merchant !== 'amira-loadtest') {
    exec.test.abort('Refusing operational load: unexpected merchant identity');
  }
  return { ...config, runId: String(Date.now()) };
}

function mark(response, acceptedStatuses, label) {
  const passed = check(response, { [label]: (r) => acceptedStatuses.includes(r.status) });
  operationFailures.add(!passed);
  return passed;
}

function readFlow(data) {
  const menu = http.get(`${BASE_URL}/api/menu?merchant=${data.merchant}`, { tags: { endpoint: 'menu-local' } });
  mark(menu, [200], 'local menu read succeeds');
  const feed = http.get(`${BASE_URL}/api/feed?merchant=${data.merchant}&since=0`, { tags: { endpoint: 'feed-local' } });
  mark(feed, [200], 'local live feed read succeeds');
}

function saleFlow(data, unique) {
  const response = http.post(`${BASE_URL}/api/sale`, JSON.stringify({
    id: `k6-sale-${unique}`,
    merchant: data.merchant,
    amountCents: 2500,
    amount: 25,
    method: 'cash',
    label: 'Vente synthétique k6',
    ref: `K6-${unique}`.slice(0, 40),
    lines: [{ i: 'item-load', n: 'Article synthétique', q: 1, t: 25, c: 'Load test' }],
  }), { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'sale-local' } });
  saleDuration.add(response.timings.duration);
  mark(response, [200], 'synthetic sale is accepted');
}

function stockFlow(data, unique) {
  const read = http.get(`${BASE_URL}/api/store?merchant=${data.merchant}&feature=stock`, {
    tags: { endpoint: 'stock-read-local' },
  });
  if (!mark(read, [200], 'synthetic stock document is readable')) return;
  const current = read.json();
  const document = current && current.data && typeof current.data === 'object'
    ? current.data : { items: [], movements: [] };
  const movements = Array.isArray(document.movements) ? document.movements.slice() : [];
  movements.push({ id: `k6-stock-${unique}`, qty: -1, ts: Date.now(), reason: 'capacity-test' });
  const response = http.post(`${BASE_URL}/api/store`, JSON.stringify({
    merchant: data.merchant,
    feature: 'stock',
    baseRev: Number(current.rev) || 0,
    data: { ...document, movements },
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'stock-write-local' },
    responseCallback: http.expectedStatuses(200, 409),
  });
  stockDuration.add(response.timings.duration);
  if (response.status === 409) stockConflicts.add(1);
  mark(response, [200, 409], 'stock write succeeds or reports a revision conflict');
}

function channelReplayFlow(data) {
  const response = http.post(`${BASE_URL}/api/channel/order`, JSON.stringify({
    ref: `k6-channel-${data.runId}`,
    mode: 'delivery',
    total: 25,
    customer: { name: 'Client synthétique', phone: '0000000000', address: 'Adresse synthétique' },
    lines: [{ id: 'item-load', name: 'Article synthétique', qty: 1, unitPrice: 25 }],
  }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.channelToken}` },
    tags: { endpoint: 'channel-order-local' },
  });
  channelDuration.add(response.timings.duration);
  mark(response, [200], 'replayed channel order remains idempotent');
}

function shopifyReplayFlow(data) {
  const raw = JSON.stringify({
    id: `k6-shopify-${data.runId}`,
    name: '#K6-LOAD',
    currency: 'MAD',
    total_price: '25.00',
    line_items: [{ id: 'shopify-line-load', title: 'Article synthétique', quantity: 1, price: '25.00' }],
    shipping_address: { name: 'Client synthétique', address1: 'Adresse synthétique', city: 'Tanger', phone: '0000000000' },
  });
  const signature = crypto.hmac('sha256', data.shopifySecret, raw, 'base64');
  const response = http.post(`${BASE_URL}/api/channel/shopify/${data.shopifyLink}`, raw, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Hmac-Sha256': signature,
      'X-Shopify-Topic': 'orders/create',
      'X-Shopify-Shop-Domain': data.shopifyDomain,
    },
    tags: { endpoint: 'shopify-webhook-local' },
  });
  shopifyDuration.add(response.timings.duration);
  mark(response, [200], 'replayed Shopify webhook remains idempotent');
}

export default function (data) {
  const unique = `${data.runId}-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;
  readFlow(data);
  saleFlow(data, unique);
  stockFlow(data, unique);
  channelReplayFlow(data);
  shopifyReplayFlow(data);
  sleep(0.2 + Math.random() * 0.4);
}

export function teardown(data) {
  const response = http.get(`${BASE_URL}/__loadtest/stats?runId=${encodeURIComponent(data.runId)}`);
  const stats = response.status === 200 ? response.json() : {};
  check(response, {
    'load stats are available': (r) => r.status === 200,
    'all channel replays produced one order': () => stats.channelOrders === 1,
    'all Shopify replays produced one order': () => stats.shopifyOrders === 1,
    'every accepted stock write is represented': () => stats.stockMovements === stats.stockAccepted,
    'synthetic sales were recorded': () => Number(stats.sales) > 0,
  });
}
