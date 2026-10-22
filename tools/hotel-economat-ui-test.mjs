#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
const EXPECTED = 20;
let checks = 0;
async function check(name, fn) { await fn(); checks += 1; process.stdout.write(`  ok ${checks} - ${name}\n`); }

const sale = fs.readFileSync('assets/pos-sale.js', 'utf8');
const caisse = caisseTestSource(fs.readFileSync('kiwi-caisse.html', 'utf8'));
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
  assert.ok(flow.indexOf('Demandez au client de dire son nom') < flow.indexOf('dataText(st.guest)'));
  assert.match(flow, /Le nom correspond/);
});
await check('room charge transport is durable and retries after the sale queue', async () => {
  assert.match(pos, /kiwi:hotelRoomChargeOutbox:v1/);
  assert.match(pos, /sale-not-found[\s\S]*pending\.push/);
});
await check('the room-charge payload links the room but excludes guest identity', async () => {
  const enqueue = pos.match(/enqueueRoomCharge\(\{([^}]+)\}\)/)?.[1] || '';
  assert.match(enqueue, /merchant[\s\S]*terminalId[\s\S]*saleId[\s\S]*roomId[\s\S]*shiftId[\s\S]*cashierId/);
  assert.equal(/guest|customer|contact/i.test(enqueue), false);
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

await check('the storeroom hero stays readable whatever the skin does to --mint and --paper', async () => {
  const css = fs.readFileSync('assets/hotel.css', 'utf8');
  const hero = css.slice(css.indexOf('.hx-eco-hero {'), css.indexOf('.hx-eco-grid'));
  assert.match(hero, /--eco-deep:#053B2C; --eco-green:#0B6E4F; --eco-on:#F7F5F0; --eco-lit:#7DF2B0;/);
  // Light Vexel sets --mint to atlas green and dark sets --paper to black: none may colour this surface.
  assert.doesNotMatch(hero, /var\(--(mint|paper|riad|atlas)\)/);
  assert.match(css, /\[data-theme="dark"\] \.hx-pill\.ok \{ color: var\(--mint\); \}/);
});

/* L'écran Économat exécuté pour de vrai (vm, sans navigateur) : on lit les
 * compteurs et la liste qu'il rend à partir d'un registre et d'un catalogue. */
const economatSource = fs.readFileSync('assets/hotel-economat.js', 'utf8');
function renderEconomat({ snapshot, catalogue = [], doc = {} }) {
  const pages = [];
  const listeners = {};
  const nodes = {};
  const node = (key) => (nodes[key] = nodes[key] || { innerHTML: '' });
  const document = {
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    querySelector: (sel) => (sel === '[data-eco-stock]' ? node('stock') : null),
    getElementById: (id) => (id === 'eco-items' ? node('datalist') : null),
  };
  const modals = [];
  const window = {
    Kiwi: { handlers: {}, appPage: (id, page) => pages.push(page), toast: () => {}, activePage: 'economat', modal: (m) => { modals.push(m); const d = m.body.match(/<datalist id="eco-items">([^]*?)<\/datalist>/); if (d) node('datalist').innerHTML = d[1]; return { close() {} }; } },
    KiwiVenue: { getCurrentVenueData: () => ({ type: 'hotel', name: 'Hôtel test' }) },
    KiwiInventory: { snapshot: () => snapshot, pending: () => 0, locationId: () => 'u-economat' },
    KiwiProcurement: { doc: () => doc },
    KiwiStockOperatingDay: { catalogue: () => catalogue },
  };
  vm.runInNewContext(economatSource, { window, document, setTimeout: () => 0 });
  window.Kiwi.handlers['nav-economat']();
  const body = pages.at(-1).body;
  const kpi = (label) => Number(body.match(new RegExp('<div class="l">' + label + '</div><div class="v">(\\d+)</div>'))?.[1]);
  /* Taper dans un champ : l'écouteur délégué de la page reçoit l'événement. */
  const type = (target) => (listeners.input || []).forEach((fn) => fn({ target }));
  return { body, tracked: kpi('Articles suivis'), low: kpi('Stock bas'), rows: (body.match(/class="hx-eco-row"/g) || []).length, window, nodes, node, type, modals };
}

await check('counts read every storeroom row; only the list is bounded and says how many it hides', async () => {
  const snapshot = {};
  for (let i = 0; i < 150; i += 1) snapshot[`item-${String(i).padStart(3, '0')}||u-economat`] = i < 130 ? 2 : 50;
  const view = renderEconomat({ snapshot });
  assert.equal(view.tracked, 150);
  assert.equal(view.low, 130);
  assert.equal(view.rows, 120);
  assert.match(view.body, /30 autres lignes non affichées/);
  assert.doesNotMatch(renderEconomat({ snapshot: { 'a||u-economat': 1 } }).body, /non affichées/);
});
await check('low stock follows the item reorder level, the old 5 only when none is set', async () => {
  const view = renderEconomat({
    snapshot: { 'draps||u-economat': 30, 'serviettes||u-economat': 8, 'savon||u-economat': 3, 'eau||u-economat': 4 },
    catalogue: [
      { id: 'draps', name: 'Draps', unit: 'unite', reorderLevel: 40 },
      { id: 'serviettes', name: 'Serviettes', unit: 'unite', reorderLevel: 10 },
      { id: 'savon', name: 'Savon', unit: 'unite', reorderLevel: 2 },
    ],
  });
  // draps 30 < 40 et serviettes 8 < 10 : bas ; savon 3 ≥ 2 : disponible ; eau sans seuil, 4 ≤ 5 : bas.
  assert.equal(view.low, 3);
  assert.match(view.body, /<b>Draps<\/b>[^]*?À commander/);
  assert.match(view.body, /<b>Savon<\/b><small>[^<]*<\/small><\/div><div class="hx-eco-qty">3<\/div><span class="hx-pill ok/);
});
await check('rows show the catalogue name, unit and ledger location, not the bare id', async () => {
  const view = renderEconomat({
    snapshot: { 'it-7f3a||u-bar': 12 },
    catalogue: [{ id: 'it-7f3a', name: 'Eau minérale 1,5 L', unit: 'bouteille' }],
  });
  assert.match(view.body, /<b>Eau minérale 1,5 L<\/b><small>it-7f3a · bouteille · u-bar<\/small>/);
});

await check('every storeroom item can be found by search, beyond the first 120 rows', async () => {
  const snapshot = {};
  for (let i = 0; i < 300; i += 1) snapshot[`item-${String(i).padStart(3, '0')}||u-economat`] = 50;
  const view = renderEconomat({ snapshot, catalogue: [{ id: 'item-287', name: 'Peignoir brodé', unit: 'unite' }] });
  assert.match(view.body, /data-eco-search/, 'a search field sits above the list');
  assert.doesNotMatch(view.body, /Peignoir brodé/, 'item 287 is past the first 120 rows');
  const field = { value: 'peignoir', matches: (sel) => sel === '[data-eco-search]', closest: () => null };
  view.type(field);
  const stock = view.node('stock').innerHTML;
  assert.match(stock, /<b>Peignoir brodé<\/b><small>item-287/, 'the search reaches a row the list hid');
  assert.equal((stock.match(/class="hx-eco-row"/g) || []).length, 1);
  field.value = 'zzz-rien';
  view.type(field);
  assert.match(view.node('stock').innerHTML, /Aucun article ne correspond/);
});
await check('the receipt form suggests any item, not only the first 120', async () => {
  const snapshot = {};
  for (let i = 0; i < 300; i += 1) snapshot[`item-${String(i).padStart(3, '0')}||u-economat`] = 50;
  const view = renderEconomat({ snapshot, catalogue: [{ id: 'item-287', name: 'Peignoir brodé', unit: 'unite' }] });
  view.window.Kiwi.handlers['eco-receive']();
  assert.doesNotMatch(view.node('datalist').innerHTML, /item-287/);
  view.type({ id: 'eco-item', value: 'Peignoir', matches: () => false, closest: () => null });
  assert.match(view.node('datalist').innerHTML, /<option value="item-287">Peignoir brodé<\/option>/);
  view.type({ id: 'eco-item', value: 'item-29', matches: () => false, closest: () => null });
  assert.equal((view.node('datalist').innerHTML.match(/<option /g) || []).length, 10, 'item-290 … item-299');
});
await check('recent activity merges orders and receipts and shows the newest first', async () => {
  const t0 = Date.UTC(2026, 9, 1);
  const day = (n) => t0 + n * 86400000;
  const doc = {
    // Quatre vieilles commandes en tête de liste, puis la plus récente en cinquième.
    orders: [1, 2, 3, 4].map((n) => ({ id: 'po' + n, number: 'BC-0000' + n, status: 'sent', createdAt: day(n), updatedAt: day(n) }))
      .concat([{ id: 'po9', number: 'BC-00009', status: 'sent', createdAt: day(20), updatedAt: day(20) }]),
    receipts: [5, 6, 7, 8, 18].map((n) => ({ id: 'grn' + n, number: 'BR-0000' + n, receivedAt: day(n), createdAt: day(n) })),
  };
  const view = renderEconomat({ snapshot: {}, doc });
  const shown = [...view.body.matchAll(/<div class="hx-eco-event[^"]*"><i><\/i><div><b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(shown, ['BC-00009', 'BR-000018', 'BR-00008', 'BR-00007', 'BR-00006', 'BR-00005']);
});

assert.equal(checks, EXPECTED, `expected ${EXPECTED} checks, ran ${checks}`);
process.stdout.write(`hotel-economat-ui-test: ${checks} checks passed\n`);
