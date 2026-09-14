#!/usr/bin/env node
/* Exercise a first-store write and fresh-device identity against the real routes. */
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost } from '../functions/api/config.js';
import { onRequestGet } from '../functions/api/me.js';

const secret = 'fixture-store-creation-secret-long-enough';
const aid = 'account-fixture';
const account = { name: 'Owner Fixture', business: 'Hotel Alpha', email: 'owner@example.test', created_ts: Date.now() };
const stores = new Map();
const pins = new Map();
const docs = new Map();
let failTypeWrite = false;
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; }
const db = {
  async batch(stmts) { for (const stmt of stmts) await stmt.run(); },
  prepare(sql) {
    const q = sql.replace(/\s+/g, ' ').trim();
    let args = [];
    const stmt = {
      bind(...values) { args = values; return stmt; },
      async first() {
        if (q.startsWith('SELECT status, session_epoch FROM accounts')) return { status: 'active', session_epoch: 0 };
        if (q.startsWith('SELECT business, created_ts FROM accounts')) return account;
        if (q.startsWith('SELECT name, business, email FROM accounts WHERE id')) return account;
        if (q.startsWith('SELECT account_id FROM merchant_config')) {
          const row = stores.get(args[0]); return row ? { account_id: row.account_id } : null;
        }
        if (q.startsWith('SELECT merchant, name, type, city, status, account_id FROM merchant_config WHERE merchant')) return stores.get(args[0]) || null;
        if (q.startsWith('SELECT data FROM store_docs')) return docs.get(args[0]) || null;
        return null;
      },
      async all() {
        if (q.startsWith('SELECT plan FROM merchant_config')) return { results: [...stores.values()].filter((row) => row.account_id === args[0]).map((row) => ({ plan: row.plan })) };
        if (q.startsWith('SELECT merchant, name, type, city, status FROM merchant_config WHERE account_id')) return { results: [...stores.values()].filter((row) => row.account_id === args[0]) };
        if (q.startsWith('SELECT id, role FROM staff_pins')) return { results: pins.get(args[0]) || [] };
        return { results: [] };
      },
      async run() {
        if (q.startsWith('INSERT INTO merchant_config') && q.includes('account_id, name, status')) {
          const [merchant, features, account_id, name, status] = args;
          const old = stores.get(merchant);
          if (!old) stores.set(merchant, { merchant, features, account_id, name, status, type: '', city: '', plan: null });
          return { success: true };
        }
        if (q.startsWith('UPDATE merchant_config SET city')) {
          const [city, , merchant, account_id] = args;
          const row = stores.get(merchant);
          if (row && row.account_id === account_id && !row.city) row.city = city;
          return { success: true };
        }
        if (q.startsWith('UPDATE merchant_config SET features')) return { success: true };
        if (q.startsWith('INSERT INTO merchant_config') && q.includes('type, updated_ts')) {
          if (failTypeWrite) throw new Error('injected type write failure');
          const row = stores.get(args[0]); if (row) row.type = args[2];
          return { success: true };
        }
        if (q.startsWith('DELETE FROM staff_pins')) { pins.set(args[0], []); return { success: true }; }
        if (q.startsWith('INSERT INTO staff_pins')) {
          const [id, merchant, , name, role] = args;
          pins.set(merchant, [...(pins.get(merchant) || []), { id, name, role }]);
          return { success: true };
        }
        if (q.startsWith('INSERT INTO store_docs')) { docs.set(args[0], { data: args[1] }); return { success: true }; }
        return { success: true };
      },
    };
    return stmt;
  },
};
const env = { DB: db, AUTH_SECRET: secret };
const session = await makeSession(aid, secret);
const cookie = sessionCookie(session).split(';')[0];
async function post(body) {
  return onRequestPost({ env, request: new Request('https://kiwi.test/api/config', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) });
}
let result = await post({ fresh: true, merchant: 'hotel-alpha', name: 'Hotel Alpha',
  type: 'hotel', city: 'Tanger', pins: [{ role: 'owner', name: 'Owner Fixture', code: '2468' }] });
ok(result.status === 200, 'initial store accepted');
ok(stores.get('hotel-alpha')?.city === 'Tanger' && stores.get('hotel-alpha')?.type === 'hotel', 'city and type written to same row');
ok(pins.get('hotel-alpha')?.length === 1, 'owner PIN written to new store');
result = await post({ fresh: true, merchant: 'hotel-beta', name: 'Hotel Beta', type: 'hotel', city: 'Rabat' });
ok(result.status === 200 && stores.get('hotel-beta')?.city === 'Rabat', 'second store city is separate');
result = await post({ fresh: true, merchant: 'hotel-alpha', name: 'Hotel Alpha', city: 'Casablanca' });
ok(result.status === 200 && stores.get('hotel-alpha')?.city === 'Tanger', 'later creation retry does not erase recorded city');
const me = await onRequestGet({ env, request: new Request('https://kiwi.test/api/me', { headers: { cookie } }) });
const identity = await me.json();
ok(identity.onboarded === true && identity.stores.length === 2, 'fresh device receives both owned stores');
ok(identity.stores.find((s) => s.merchant === 'hotel-beta')?.city === 'Rabat', 'fresh device receives second city');
stores.set('other-owner', { merchant: 'other-owner', account_id: 'someone-else', name: 'Other', city: 'Fes', plan: null });
result = await post({ fresh: true, merchant: 'other-owner', name: 'Other', city: 'Meknes' });
ok(result.status === 403 && stores.get('other-owner').city === 'Fes', 'owner cannot overwrite another store city');
const ownBeforeCollision = stores.get('hotel-alpha');
stores.set('hotel-alpha', { ...ownBeforeCollision, account_id: 'someone-else' });
const privateMe = await (await onRequestGet({ env, request: new Request('https://kiwi.test/api/me', { headers: { cookie } }) })).json();
ok(!privateMe.stores.some((store) => store.merchant === 'hotel-alpha'),
  'fresh-device identity never lists a store owned by another account');
stores.clear(); pins.clear(); docs.clear();
failTypeWrite = true;
result = await post({ fresh: true, merchant: 'hotel-alpha', name: 'Hotel Alpha',
  type: 'hotel', city: 'Tanger', pins: [{ role: 'owner', name: 'Owner Fixture', code: '2468' }] });
ok(result.status === 500 && stores.get('hotel-alpha')?.status === 'pending' && !stores.get('hotel-alpha')?.type,
  'type failure leaves a claimed but incomplete row');
let partial = await (await onRequestGet({ env, request: new Request('https://kiwi.test/api/me', { headers: { cookie } }) })).json();
ok(partial.onboarded === false && partial.stores.length === 0,
  'fresh browser does not adopt a partial store or dismiss setup');
failTypeWrite = false;
result = await post({ fresh: true, merchant: 'hotel-alpha', name: 'Hotel Alpha',
  type: 'hotel', city: 'Tanger', pins: [{ role: 'owner', name: 'Owner Fixture', code: '2468' }] });
partial = await (await onRequestGet({ env, request: new Request('https://kiwi.test/api/me', { headers: { cookie } }) })).json();
ok(result.status === 200 && partial.onboarded === true && partial.stores.length === 1,
  'retry completes the claimed store without a duplicate');
console.log(`✓ ${checks} store-creation API checks`);
