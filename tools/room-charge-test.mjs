#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  makeSession, SESS_COOKIE, TILL_COOKIE, TERMINAL_COOKIE, tillToken, terminalToken,
} from '../functions/auth/_lib.js';

process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exit(1);
});

const EXPECTED = 15;
let checks = 0;

async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write(`  ok ${checks} - ${name}\n`);
}

const modulePath = process.env.KIWI_ROOM_CHARGE_MODULE
  ? path.resolve(process.env.KIWI_ROOM_CHARGE_MODULE)
  : path.resolve('functions/api/hotel/_room-charge-data.js');
const {
  appendRoomCharge,
  reverseRoomCharge,
  roomChargesByCashier,
  roomChargeId,
  roomChargeReversalId,
} = await import(pathToFileURL(modulePath).href + `?run=${Date.now()}`);
const routePath = path.resolve(process.env.KIWI_ROOM_CHARGE_ROUTE
  || 'functions/api/hotel/room-charges.js');
const roomChargeRoute = await import(pathToFileURL(routePath).href + `?run=${Date.now()}`);

const base = {
  outletId: 'outlet-alpha',
  shiftId: 'shift-alpha',
  cashierName: 'Cashier Alpha',
  occurredTs: 1000,
};

let lines = [];
const first = appendRoomCharge(lines, {
  ...base,
  saleId: 'sale-alpha',
  cashierId: 'cashier-alpha',
  amountCents: 12500,
});
await check('posting uses the sale identity for a deterministic charge id', async () => {
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.line.id, roomChargeId('sale-alpha'));
});
await check('the structured folio line freezes outlet, shift, and cashier identity', async () => {
  assert.equal(first.line.outletId, 'outlet-alpha');
  assert.equal(first.line.shiftId, 'shift-alpha');
  assert.equal(first.line.cashierId, 'cashier-alpha');
  assert.equal(first.line.cashierName, 'Cashier Alpha');
});
lines = first.lines;

const duplicate = appendRoomCharge(lines, {
  ...base,
  saleId: 'sale-alpha',
  cashierId: 'cashier-alpha',
  amountCents: 12500,
});
await check('posting the same sale twice is a no-op', async () => {
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.lines, lines);
  assert.equal(duplicate.lines.length, 1);
});

const reversed = reverseRoomCharge(lines, 'sale-alpha', {
  occurredTs: 2000,
  actorId: 'manager-alpha',
});
await check('reversal appends one exact negative line linked to the charge', async () => {
  assert.equal(reversed.created, true);
  assert.equal(reversed.line.id, roomChargeReversalId('sale-alpha'));
  assert.equal(reversed.line.reversalOf, roomChargeId('sale-alpha'));
  assert.equal(reversed.line.amountCents, -12500);
});
lines = reversed.lines;

const reversedTwice = reverseRoomCharge(lines, 'sale-alpha', {
  occurredTs: 3000,
  actorId: 'manager-alpha',
});
await check('reversing the same linked sale twice changes nothing', async () => {
  assert.equal(reversedTwice.created, false);
  assert.equal(reversedTwice.lines, lines);
  assert.equal(reversedTwice.lines.length, 2);
  assert.equal(reversedTwice.lines.reduce((sum, line) => sum + line.amountCents, 0), 0);
});

const second = appendRoomCharge(lines, {
  ...base,
  saleId: 'sale-beta',
  cashierId: 'cashier-beta',
  cashierName: 'Cashier Beta',
  amountCents: 7600,
  occurredTs: 1500,
});
lines = second.lines;
const report = roomChargesByCashier(lines, { shiftId: 'shift-alpha' });
await check('the shift report groups charges and reversals by the original cashier', async () => {
  assert.deepEqual(report.cashiers.map((row) => [
    row.cashierId, row.chargeCount, row.reversalCount, row.netCents,
  ]), [
    ['cashier-alpha', 1, 1, 0],
    ['cashier-beta', 1, 0, 7600],
  ]);
});
await check('shift totals equal the structured folio lines they aggregate', async () => {
  const source = lines.filter((line) => line.shiftId === 'shift-alpha');
  assert.equal(report.totals.lineCount, source.length);
  assert.equal(report.totals.netCents, source.reduce((sum, line) => sum + line.amountCents, 0));
  assert.equal(report.totals.chargesCents - report.totals.reversalsCents, report.totals.netCents);
});
await check('room-charge lines contain no guest, room, PIN, or code field', async () => {
  for (const line of lines) {
    const keys = Object.keys(line).map((key) => key.toLowerCase());
    assert.equal(keys.some((key) => /guest|room|pin|code/.test(key)), false);
  }
});

const SECRET = 'room-charge-route-secret-32-bytes';
const MERCHANT = 'hotel-atlas';
const registry = {
  units: [
    { id: 'u-economat', kind: 'economat', name: 'Economat', storeType: 'economat', locationId: 'loc-economat', active: true },
    { id: 'u-rooftop', kind: 'outlet', name: 'Rooftop', storeType: 'bar', locationId: 'loc-rooftop', active: true },
    { id: 'u-pool', kind: 'outlet', name: 'Pool', storeType: 'bar', locationId: 'loc-pool', active: true },
  ],
  terminalUnits: { 'terminal-rooftop': 'u-rooftop' },
};

function makeDb({ missingEvents = false } = {}) {
  const state = {
    events: [],
    sales: new Map([['sale-route', {
      id: 'sale-route', amount: 999, amount_cents: 12500,
      method: 'room', ts: 1100, void_ts: null,
    }]]),
  };
  const db = {
    prepare(sql) {
      const query = String(sql).replace(/\s+/g, ' ').trim();
      const statement = {
        args: [],
        bind(...args) { statement.args = args; return statement; },
        async first() {
          const args = statement.args;
          if (query.includes('SELECT till_epoch FROM merchant_config')) return { till_epoch: 0 };
          if (query.includes('SELECT account_id FROM merchant_config')) return { account_id: 'owner-1' };
          if (query.includes('SELECT business FROM accounts')) return { business: 'Hotel Atlas' };
          if (query.includes('SELECT type FROM merchant_config')) return { type: 'hotel' };
          if (query.includes("feature = 'hotel-units'")) return { data: JSON.stringify(registry) };
          if (query.includes('FROM sales') && query.includes('merchant = ?')) {
            return state.sales.get(String(args[1])) || null;
          }
          if (query.includes('FROM hotel_room_charge_events')) {
            if (missingEvents) throw new Error('no such table: hotel_room_charge_events');
            return state.events.find((event) => event.merchant === args[0] && event.id === args[1]) || null;
          }
          return null;
        },
        async all() {
          const args = statement.args;
          if (query.includes("feature IN ('employee-access', 'team')")) {
            return { results: [{
              feature: 'team', updated_ts: 2,
              data: JSON.stringify({ members: [{
                id: 'cashier-route', firstName: 'Canonical', lastName: 'Cashier',
              }] }),
            }] };
          }
          if (query.includes('FROM hotel_room_charge_events')) {
            if (missingEvents) throw new Error('no such table: hotel_room_charge_events');
            return { results: state.events.filter((event) => {
              if (event.merchant !== args[0]) return false;
              if (query.includes('shift_id = ?')) return event.shift_id === args[1];
              return event.occurred_ts >= args[1] && event.occurred_ts <= args[2];
            }) };
          }
          return { results: [] };
        },
        async run() {
          if (!query.includes('INSERT OR IGNORE INTO hotel_room_charge_events')) {
            return { success: true, meta: { changes: 1 } };
          }
          if (missingEvents) throw new Error('no such table: hotel_room_charge_events');
          const args = statement.args;
          const exists = state.events.some((event) => event.merchant === args[0] && event.id === args[1]);
          if (!exists) state.events.push({
            merchant: args[0], id: args[1], kind: args[2], sale_id: args[3],
            outlet_id: args[4], shift_id: args[5], cashier_id: args[6], cashier_name: args[7],
            amount_cents: args[8], occurred_ts: args[9], reversal_of: args[10], reversed_by_id: args[11],
          });
          return { success: true, meta: { changes: exists ? 0 : 1 } };
        },
      };
      return statement;
    },
  };
  return { db, state };
}

async function tillRequest(body = null, method = 'POST') {
  const till = await tillToken(SECRET, MERCHANT);
  const terminal = await terminalToken(SECRET, MERCHANT, 'terminal-rooftop');
  return new Request(`https://kiwi.test/api/hotel/room-charges?merchant=${MERCHANT}&shiftId=shift-route`, {
    method,
    headers: {
      cookie: `${TILL_COOKIE}=${till}; ${TERMINAL_COOKIE}=${terminal}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const fixture = makeDb();
const postBody = {
  merchant: MERCHANT, terminalId: 'terminal-rooftop', saleId: 'sale-route',
  outletId: 'u-pool', shiftId: 'shift-route', cashierId: 'cashier-route',
  cashierName: 'Forged', amountCents: 1,
};
const posted = await roomChargeRoute.onRequestPost({
  request: await tillRequest(postBody), env: { AUTH_SECRET: SECRET, DB: fixture.db },
});
const postedBody = await posted.json();
await check('the route derives money and time from the sale and forces the signed terminal outlet', async () => {
  assert.equal(posted.status, 200);
  assert.equal(postedBody.charge.amountCents, 12500);
  assert.equal(postedBody.charge.occurredTs, 1100);
  assert.equal(postedBody.charge.outletId, 'u-rooftop');
  assert.equal(postedBody.charge.cashierName, 'Canonical Cashier');
});
const replay = await roomChargeRoute.onRequestPost({
  request: await tillRequest(postBody), env: { AUTH_SECRET: SECRET, DB: fixture.db },
});
await check('route replay is exactly once at the database boundary', async () => {
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).created, false);
  assert.equal(fixture.state.events.length, 1);
});
await check('a paired till cannot read the staff report', async () => {
  const response = await roomChargeRoute.onRequestGet({
    request: await tillRequest(null, 'GET'), env: { AUTH_SECRET: SECRET, DB: fixture.db },
  });
  assert.equal(response.status, 403);
});
const ownerToken = await makeSession('owner-1', SECRET);
const ownerRequest = () => new Request(
  `https://kiwi.test/api/hotel/room-charges?merchant=${MERCHANT}&shiftId=shift-route`,
  { headers: { cookie: `${SESS_COOKIE}=${ownerToken}` } },
);
await check('the privileged route returns aggregates without guest, room, PIN, or code data', async () => {
  const response = await roomChargeRoute.onRequestGet({
    request: ownerRequest(), env: { AUTH_SECRET: SECRET, DB: fixture.db },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.report.totals.netCents, 12500);
  assert.equal(/guest|roomNumber|roomId|pin|code/i.test(JSON.stringify(body)), false);
});
await check('the privileged shift index is scoped, ordered, and contains no guest or room identity', async () => {
  const response = await roomChargeRoute.onRequestGet({
    request: new Request(`https://kiwi.test/api/hotel/room-charges?merchant=${MERCHANT}&mode=shifts`, {
      headers: { cookie: `${SESS_COOKIE}=${ownerToken}` },
    }),
    env: { AUTH_SECRET: SECRET, DB: fixture.db },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.shifts.map((row) => row.shiftId), ['shift-route']);
  assert.equal(body.shifts[0].netCents, 12500);
  assert.equal(/guest|roomNumber|roomId|pin|code/i.test(JSON.stringify(body)), false);
});
fixture.state.sales.get('sale-route').void_ts = 2200;
await check('a voided sale creates one linked reversal and repeated reversal is a no-op', async () => {
  const reverseBody = { ...postBody, action: 'reverse' };
  const one = await roomChargeRoute.onRequestPost({
    request: await tillRequest(reverseBody), env: { AUTH_SECRET: SECRET, DB: fixture.db },
  });
  const two = await roomChargeRoute.onRequestPost({
    request: await tillRequest(reverseBody), env: { AUTH_SECRET: SECRET, DB: fixture.db },
  });
  assert.equal(one.status, 200);
  assert.equal((await one.json()).charge.amountCents, -12500);
  assert.equal((await two.json()).created, false);
  assert.equal(fixture.state.events.length, 2);
});
await check('an absent event table is explicit unavailability, never an empty report', async () => {
  const missing = makeDb({ missingEvents: true });
  const response = await roomChargeRoute.onRequestGet({
    request: ownerRequest(), env: { AUTH_SECRET: SECRET, DB: missing.db },
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.migrationRequired, true);
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} checks, ran ${checks}`);
process.stdout.write(`room-charge-test: ${checks} checks passed\n`);
