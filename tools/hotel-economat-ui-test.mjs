#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
const EXPECTED = 13;
let checks = 0;
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }

const sale = fs.readFileSync('assets/pos-sale.js', 'utf8');
const caisse = fs.readFileSync('kiwi-caisse.html', 'utf8');
const pos = fs.readFileSync('assets/pos-hotel.js', 'utf8');
const dash = fs.readFileSync('assets/hotel.js', 'utf8');
const admin = fs.readFileSync('functions/api/admin/sales.js', 'utf8');
const field = fs.readFileSync('docs/ops/HOTEL_ECONOMAT_FIELD_TEST.md', 'utf8');

await check('room and folio normalize to the dedicated room method', async () => {
  assert.match(sale, /room:\s*'room',\s*folio:\s*'room'/);
});
await check('the financial sale returns live-link deterministic identity', async () => {
  assert.match(sale, /entry\.saleId\s*=\s*String\(queued\.id\)/);
});
await check('caisse context exports stable shift, cashier, and terminal identity', async () => {
  assert.match(caisse, /KiwiCaisseContext[\s\S]*terminalId[\s\S]*cashierId[\s\S]*shiftId/);
  assert.match(caisse, /kiwi:caisse:terminal-id:v1/);
});
await check('the caisse context never exports an unlock PIN', async () => {
  const context = caisse.slice(caisse.indexOf('window.KiwiCaisseContext'), caisse.indexOf('const terminalIdButton'));
  assert.equal(/pinCode|password|pinBuffer|\bpin\b/i.test(context), false);
});
await check('the client asks for the name before revealing the stored guest', async () => {
  const flow = pos.slice(pos.indexOf('function openChargeSheet'), pos.indexOf('/* ═══════════════════════ CHECK-OUT'));
  assert.ok(flow.indexOf('Demandez au client de dire son nom') < flow.indexOf('esc(st.guest)'));
  assert.match(flow, /Le nom correspond/);
});
await check('room charge transport is durable and retries after the sale queue', async () => {
  assert.match(pos, /kiwi:hotelRoomChargeOutbox:v1/);
  assert.match(pos, /sale-not-found[\s\S]*pending\.push/);
});
await check('the room-charge payload excludes guest and room identity', async () => {
  const enqueue = pos.match(/enqueueRoomCharge\(\{([^}]+)\}\)/)?.[1] || '';
  assert.match(enqueue, /merchant[\s\S]*terminalId[\s\S]*saleId[\s\S]*shiftId[\s\S]*cashierId/);
  assert.equal(/guest|room/i.test(enqueue), false);
});
await check('the dashboard reads both inventory and shift reports', async () => {
  assert.match(dash, /\/api\/inventory\/hotel-reports/);
  assert.match(dash, /\/api\/hotel\/room-charges\?merchant=.*mode=shifts/);
});
await check('the first registry write submits units and terminalUnits together', async () => {
  assert.match(dash, /const data = \{ units:[\s\S]*terminalUnits \}/);
  assert.match(dash, /feature: 'hotel-units'[\s\S]*baseRev/);
});
await check('registry activation requires the physical till confirmation', async () => {
  assert.match(dash, /data-hx-econ-confirm/);
  assert.match(dash, /Confirmez le relevé de toutes les caisses/);
});
await check('operator void appends the deterministic folio reversal', async () => {
  assert.match(admin, /roomChargeReversalId\(r\.id\)/);
  assert.match(admin, /INSERT OR IGNORE INTO hotel_room_charge_events/);
});
await check('unsafe restore of a reversed room sale is refused', async () => {
  assert.match(admin, /room-charge-restore-unsupported/);
});
await check('the field packet keeps Discovery D evidence-blocked', async () => {
  assert.match(field, /without coaching/i);
  assert.match(field, /all five scenarios/i);
  assert.match(field, /Do not create the live `hotel-units` registry during discovery/);
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} checks, ran ${checks}`);
process.stdout.write(`hotel-economat-ui-test: ${checks} checks passed\n`);
