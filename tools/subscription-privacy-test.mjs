#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { storeSubscriptionPending, tenantFor } from '../functions/api/_private.js';
import { makeSession } from '../functions/auth/_lib.js';

let n = 0;
function ok(value, label) { assert.ok(value, label); n++; console.log('  ✓ ' + label); }

function envWith(status, throws = false) {
  return { DB: { prepare(sql) {
    ok(sql.includes('merchant_config'), 'subscription status is read from the store registry');
    return { bind(merchant) {
      ok(merchant === 'amira-cafe', 'subscription lookup is tenant-scoped');
      return { async first() { if (throws) throw new Error('legacy database'); return status == null ? null : { status }; } };
    } };
  } } };
}

ok(await storeSubscriptionPending(envWith('pending'), 'amira-cafe') === true,
  'a pending store is recognized as awaiting activation');
ok(await storeSubscriptionPending(envWith('active'), 'amira-cafe') === false,
  'an active store remains fully enabled');
ok(await storeSubscriptionPending(envWith(null), 'amira-cafe') === false,
  'a legacy store with no registry row remains active');
ok(await storeSubscriptionPending(envWith('pending', true), 'amira-cafe') === false,
  'a legacy database failure never locks existing clients out');

const authSecret = 'subscription-test-secret';
const session = await makeSession('acc-owner', authSecret);
const pendingEnv = { AUTH_SECRET: authSecret, DB: { prepare(sql) {
  return { bind() { return { async first() {
    if (sql.includes('FROM accounts')) return { business: 'Amira Cafe' };
    if (sql.includes('FROM merchant_config')) return { account_id: 'acc-owner', status: 'pending' };
    return null;
  } }; } };
} } };
const ownerRequest = new Request('https://kiwi.test/api/store', { headers: { cookie: 'kiwi_sess=' + session } });
ok(await tenantFor(ownerRequest, pendingEnv, 'amira-cafe') === 'amira-cafe',
  'a pending merchant retains read access to the full dashboard');
ok(await tenantFor(ownerRequest, pendingEnv, 'amira-cafe', { strict: true }) === '',
  'the same pending merchant cannot cross a shared write boundary');

const config = fs.readFileSync(new URL('../functions/api/config.js', import.meta.url), 'utf8');
const privateApi = fs.readFileSync(new URL('../functions/api/_private.js', import.meta.url), 'utf8');
const sale = fs.readFileSync(new URL('../functions/api/sale.js', import.meta.url), 'utf8');
const order = fs.readFileSync(new URL('../functions/api/order/index.js', import.meta.url), 'utf8');
const booking = fs.readFileSync(new URL('../functions/api/booking.js', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../functions/api/menu.js', import.meta.url), 'utf8');
const team = fs.readFileSync(new URL('../functions/api/team/live.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../kiwi-admin.html', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const entitlement = fs.readFileSync(new URL('../assets/entitlements.js', import.meta.url), 'utf8');
const liveLink = fs.readFileSync(new URL('../assets/live-link.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');

ok(/seed \? 'pending' : null/.test(config), 'newly onboarded stores start pending while legacy stores do not');
ok(/subscription: \{ state: subscription, active: subscription === 'active' \}/.test(config),
  'the dashboard receives authoritative subscription state');
ok(/storeSubscriptionPending\(env, who\)/.test(privateApi), 'shared strict writes enforce subscription state');
for (const [name, source] of [['sales', sale], ['orders', order], ['bookings', booking], ['menu publishing', menu], ['team actions', team]]) {
  ok(source.includes('subscription-required'), name + ' refuse pending-store writes server-side');
}
ok(admin.includes('Activer abonnement') && admin.includes('Vue confidentielle'),
  'God Mode exposes activation and confidential entry explicitly');
ok(admin.includes("privacy=1"), 'God Mode confidential entry uses an explicit privacy flag');
ok(entitlement.includes('212624495159'), 'subscription assistance routes to the official Kiwi WhatsApp number');
ok(entitlement.includes("operator=!!(state&&state.operator===true)") && !entitlement.includes("var operator=params.get('op')==='1'"),
  'a URL flag cannot impersonate God Mode or bypass the client subscription gate');
ok(entitlement.includes('lecture seule') && entitlement.includes('kiwi-private-value'),
  'confidential mode is visibly read-only and masks values without replacing data');
ok(liveLink.includes("identity.ready.then(function (state)") && liveLink.includes('initPump(true)'),
  'God Mode client data starts only after the server confirms the operator');
ok(liveLink.includes('{ oneShot: !!snapshot }') && liveLink.includes('else if (oneShot) stop()'),
  'God Mode consumes a complete one-time snapshot instead of the merchant polling loop');
ok(dashboard.includes('assets/entitlements.js?v=3') && dashboard.includes('assets/entitlements.css?v=3'),
  'the dashboard loads the entitlement layer with a cache-busting version');
ok(dashboard.includes('assets/identity.js?v=2') &&
   dashboard.indexOf('assets/identity.js?v=2') < dashboard.indexOf('assets/live-link.js?v=8') &&
   dashboard.indexOf('assets/identity.js?v=2') < dashboard.indexOf('assets/entitlements.js?v=3'),
  'God Mode data and confidential mode consume a fresh, already-published identity gate');
ok(sw.includes('assets/entitlements.js') && sw.includes('assets/entitlements.css'),
  'the entitlement layer is available through the dashboard PWA cache');

console.log(`\nsubscription/privacy: ${n} controls passed`);
