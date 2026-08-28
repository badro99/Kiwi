import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = String(__ENV.KIWI_BASE_URL || 'https://kiwi-os.com').replace(/\/+$/, '');
const MERCHANT = String(__ENV.KIWI_MERCHANT || 'amira-cafe');
const PROFILE = String(__ENV.KIWI_PROFILE || 'smoke');
const IS_PRODUCTION = /^https:\/\/(?:www\.)?kiwi-os\.com$/i.test(BASE_URL);

const profiles = {
  smoke: {
    executor: 'per-vu-iterations', vus: 1, iterations: 3, maxDuration: '30s',
  },
  baseline: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '20s', target: 5 }, { duration: '40s', target: 5 }, { duration: '10s', target: 0 }],
    gracefulRampDown: '10s',
  },
  capacity: {
    executor: 'ramping-vus', startVUs: 0,
    stages: [
      { duration: '30s', target: 10 }, { duration: '45s', target: 10 },
      { duration: '30s', target: 25 }, { duration: '45s', target: 25 },
      { duration: '30s', target: 50 }, { duration: '60s', target: 50 },
      { duration: '20s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },
  spike: {
    executor: 'ramping-vus', startVUs: 2,
    stages: [{ duration: '15s', target: 2 }, { duration: '10s', target: 75 },
      { duration: '45s', target: 75 }, { duration: '20s', target: 0 }],
    gracefulRampDown: '5s',
  },
  soak: {
    executor: 'constant-vus', vus: 20, duration: '30m', gracefulStop: '20s',
  },
};

if (!profiles[PROFILE]) throw new Error(`Unknown KIWI_PROFILE: ${PROFILE}`);
if (!/^https?:\/\//.test(BASE_URL)) throw new Error('KIWI_BASE_URL must be an HTTP(S) origin');
if (IS_PRODUCTION && MERCHANT !== 'amira-cafe') {
  throw new Error('Production read-only tests are locked to amira-cafe');
}
if (IS_PRODUCTION && !['smoke', 'baseline'].includes(PROFILE)
    && __ENV.KIWI_PRODUCTION_ACK !== 'amira-read-only') {
  throw new Error('Set KIWI_PRODUCTION_ACK=amira-read-only for production capacity, spike or soak profiles');
}

const routeFailures = new Rate('kiwi_route_failures');
const landingDuration = new Trend('kiwi_landing_duration', true);
const orderPageDuration = new Trend('kiwi_order_page_duration', true);
const menuDuration = new Trend('kiwi_menu_duration', true);
const bookingDuration = new Trend('kiwi_booking_duration', true);

export const options = {
  scenarios: { customer_journey: profiles[PROFILE] },
  thresholds: {
    checks: ['rate>0.99'],
    kiwi_route_failures: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    kiwi_menu_duration: ['p(95)<700'],
    kiwi_booking_duration: ['p(95)<700'],
  },
  userAgent: 'KiwiCapacitySuite/1.0 (read-only; contact: support@kiwi-os.com)',
};

function checkedGet(path, metric, checks, tags) {
  const response = http.get(`${BASE_URL}${path}`, { tags });
  metric.add(response.timings.duration);
  const passed = check(response, checks);
  routeFailures.add(!passed);
  return response;
}

export default function () {
  const menu = checkedGet(
    `/api/menu?merchant=${encodeURIComponent(MERCHANT)}`,
    menuDuration,
    {
      'menu returns 200': (r) => r.status === 200,
      'menu is JSON': (r) => /application\/json/i.test(r.headers['Content-Type'] || ''),
      'menu belongs to Amira': (r) => {
        try { const body = r.json(); return body && /amira/i.test(String(body.name || '')) && body.menu; }
        catch (_) { return false; }
      },
    },
    { endpoint: 'menu', safety: 'read-only' },
  );

  checkedGet(
    `/api/booking?merchant=${encodeURIComponent(MERCHANT)}`,
    bookingDuration,
    {
      'booking availability returns 200': (r) => r.status === 200,
      'booking availability is JSON': (r) => /application\/json/i.test(r.headers['Content-Type'] || ''),
    },
    { endpoint: 'booking', safety: 'read-only' },
  );

  if ((__ITER + __VU) % 2 === 0) {
    checkedGet(
      `/kiwi-order?merchant=${encodeURIComponent(MERCHANT)}`,
      orderPageDuration,
      {
        'order page returns 200': (r) => r.status === 200,
        'order page is HTML': (r) => /text\/html/i.test(r.headers['Content-Type'] || ''),
      },
      { endpoint: 'order-page', safety: 'read-only' },
    );
  } else {
    checkedGet(
      '/fr/',
      landingDuration,
      {
        'landing returns 200': (r) => r.status === 200,
        'landing is HTML': (r) => /text\/html/i.test(r.headers['Content-Type'] || ''),
      },
      { endpoint: 'landing', safety: 'read-only' },
    );
  }

  if (menu.status === 200) sleep(0.8 + Math.random() * 1.7);
}
