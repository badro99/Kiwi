/* La pastille « Inventaire » de la caisse boutique compte les alertes de stock
 * NON VUES (assets/pos-boutique/inv-tools.js) : vues, elles s'éteignent ; un
 * article qui passe de bas à épuisé avertit de nouveau ; un article réassorti
 * puis redescendu avertit de nouveau. Propriétaire, 2026-10-28. */
import assert from 'node:assert/strict';
import { shippedFunction } from './shipped-function.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };

const src = readFileSync(new URL('../assets/pos-boutique/inv-tools.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '');                       // la logique de la pastille ne dépend pas de la liste
const mod = await import('data:text/javascript;base64,' + Buffer.from(src + '\nfunction bqKitScanBar(){} function searchArticles(){ return []; }').toString('base64'));
const { invUnseenCount: unseen, invMarkSeen: seen } = mod;

let ok = 0; const t = (name, fn) => { fn(); ok++; };
const K = 'santos';
t('every current alert counts before the page is opened', () => {
  assert.equal(unseen(K, [['a', 3], ['b', 0], ['c', 12]]), 2);
});
t('opening the Inventaire clears the badge, and it stays cleared', () => {
  seen(K, [['a', 3], ['b', 0], ['c', 12]]);
  assert.equal(unseen(K, [['a', 3], ['b', 0], ['c', 12]]), 0);
  assert.equal(unseen(K, [['a', 3], ['b', 0], ['c', 12]]), 0);
});
t('a seen low item that runs out alerts again', () => {
  assert.equal(unseen(K, [['a', 0], ['b', 0], ['c', 12]]), 1);
});
t('a new low item alerts', () => {
  seen(K, [['a', 0], ['b', 0], ['c', 12]]);
  assert.equal(unseen(K, [['a', 0], ['b', 0], ['c', 4]]), 1);
});
t('a restocked item that drops again alerts again', () => {
  seen(K, [['a', 0], ['b', 0], ['c', 4]]);
  assert.equal(unseen(K, [['a', 20], ['b', 0], ['c', 4]]), 0);   // réassorti : sort de la liste vue
  assert.equal(unseen(K, [['a', 2], ['b', 0], ['c', 4]]), 1);
});
t('two stores never share what was seen', () => {
  assert.equal(unseen('amira', [['a', 2]]), 1);
});
// Render the shipped inventory with deliberately distinct low/out-of-stock totals.
const inventorySource = readFileSync(new URL('../assets/pos-boutique/inventory.js', import.meta.url), 'utf8');
function inventoryHtml() {
  let html;
  const panel = { querySelectorAll: () => [] };
  shippedFunction(inventorySource, 'renderInventaire', {
    catDB: () => ({ stats: () => ({ products: 0, variants: 0, totalStock: 91, low: 7, ruptures: 3 }), listCategories: () => [], listProducts: () => [] }),
    $: (q) => q.startsWith('[data-bq-panel') ? panel : null, root: {}, state: {},
    invPaint: (_, value) => { html = value; }, invSearch() {}, invCountAsks() {},
    bqKitSkin() {}, pvReal: () => false, _bqKey: K, fmtMAD: String, esc: String, icons() {}, artOf() {}, tillInventoryAllowed: () => false,
  })();
  return html;
}
t('the boutique till renders no stock value and three single-purpose cards', () => {
  const renderedInventory = inventoryHtml();
  assert.ok(!/Valeur de stock/.test(renderedInventory));
  assert.ok(/<span class="l">Stock bas<\/span>/.test(renderedInventory) && /<span class="l">Rupture de stock<\/span>/.test(renderedInventory) && /<span class="l">Pièces en stock<\/span>/.test(renderedInventory));
  assert.match(renderedInventory, /Stock bas<\/span><span class="v">7<\/span>/);
  assert.match(renderedInventory, /Rupture de stock<\/span><span class="v">3<\/span>/);
  assert.match(renderedInventory, /Pièces en stock<\/span><span class="v">91<\/span>/);
});
t('the till « Mouvements de stock » screen only reads, and only boutique rows', () => {
  const mv = readFileSync(new URL('../assets/pos-boutique/inv-moves.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const w of ['enable(', 'attach(', 'record(', 'requestManual', 'adjustStock', 'setStock', 'adjustVariantStock', 'receiveStock', '.add(']) assert.ok(!mv.includes(w), 'inv-moves.js must not call ' + w);
  let query, facet;
  const ctx = { window: { KiwiMaisonStock: { list: (q) => { query = q; return []; }, facets: (m) => { facet = m; return { types: [] }; }, types: () => [], totals: () => ({ entries: 0, exits: 0, count: 0 }) } }, document: { getElementById: () => true } };
  vm.runInNewContext(mv.replace(/export /g, '') + '\nopenMoves({esc: String, icons(){}, setModal(html, wire){ wire({style:{}, querySelector(){return {addEventListener(){}};}}); }});', ctx);
  assert.equal(query.module, 'boutique');
  assert.equal(query.shared, true, 'the till reads the rows the dashboard sees too (mirror)');
  assert.equal(facet, 'boutique');
  const renderedInventory = inventoryHtml();
  assert.ok(/id="bqi-count"[\s\S]{0,260}id="bqi-moves"/.test(renderedInventory), 'the button sits right after « Inventaire physique »');
  let historyArgs;
  shippedFunction(inventorySource, 'openInvProduct', {
    catDB: () => ({ getProduct: () => ({ product: {}, variants: [] }) }),
    window: { KiwiMaisonStock: { list: (q) => { historyArgs = q; return []; } } },
    esc: String, fmtMAD: String, artOf: String, invSetModal() {}, tillInventoryAllowed: () => false,
  })('product-7');
  assert.equal(JSON.stringify(historyArgs), JSON.stringify({ productId: 'product-7', module: 'boutique', shared: true }));
});
t('the physical count reaches the right store, signed by the person at the till, with a reason per gap', () => {
  const c = readFileSync(new URL('../assets/pos-inventory-count.js', import.meta.url), 'utf8');
  const staff = { id: 'staff-7', name: 'Test cashier', role: 'manager' };
  const cashier = vm.runInNewContext('getCashier()', { getCashier: shippedFunction(c, 'getCashier', { window: { KiwiStaff: staff, currentCashier: { name: 'Wrong cashier' } } }) });
  assert.deepEqual(JSON.parse(JSON.stringify(cashier)), staff);
  let request;
  // fetch captures synchronously before the async function's first await.
  shippedFunction(c, 'submitCount', {
    getCashier: () => staff, countMerchant: () => 'shop /7', window: {},
    countState: { engine: 'boutique', items: [], supersedes: 'previous-count', intentId: 'count-7' },
    fetch: (url, opts) => { request = { url, body: JSON.parse(opts.body) }; return new Promise(() => {}); },
  })();
  assert.equal(request.url, '/api/inventory/counts?merchant=shop%20%2F7');
  assert.equal(request.body.merchant, 'shop /7');
  assert.equal(request.body.supersedes, 'previous-count');
  assert.ok(/hasGap\(it\) \?/.test(c) && /data-cnt-reason=/.test(c), 'only lines that differ ask for a reason');
});
t('the owner is told on the boutique Inventaire page and can ask for details', () => {
  const b = readFileSync(new URL('../assets/pages-pro-boutique.js', import.meta.url), 'utf8');
  assert.ok(/<div id="bqx-counts"><\/div>/.test(b) && /status=submitted&merchant=/.test(b) && /data-action="stock-count-detail"[^`]*data-merchant=/.test(b));
  const r = readFileSync(new URL('../assets/stock/counts.js', import.meta.url), 'utf8');
  assert.ok(/reviewCount\(count\.id, 'correction_requested', note\)/.test(r), 'asking goes through the one review path');
  assert.ok(/decision === 'correction_requested' \? 'request-correction' : 'review'/.test(r));
  const inv = readFileSync(new URL('../assets/pos-boutique/inv-tools.js', import.meta.url), 'utf8');
  assert.ok(/status=correction_requested&merchant=/.test(inv) && /recount\(\{ supersedes: c\.id/.test(inv), 'the till shows the question and recounts in place');
});
t('a catalogue redraw never rebuilds the Inventaire toolbar, so the search bar keeps text, cursor and keyboard', () => {
  const html = inventoryHtml();
  assert.match(html, /class="bqi"/); // renderInventaire reached invPaint.
  const removed = [];
  const tools = { querySelector: () => ({ value: 'shirt', selectionStart: 2 }) };
  const old = { remove: () => removed.push('old') };
  const before = { classList: { contains: () => false } }, freshTools = { classList: { contains: () => true } }, after = { classList: { contains: () => false } };
  const inserted = [];
  const box = { children: [old, tools], querySelector: () => tools, insertBefore: (k, anchor) => inserted.push([k, anchor]), appendChild: (k) => inserted.push([k]) };
  const panel = { querySelector: () => box, set innerHTML(_) { throw new Error('mounted toolbar replaced'); } };
  const paint = shippedFunction(src, 'invPaint', { document: { createElement: () => ({ querySelector: () => ({ children: [before, freshTools, after] }) }) } });
  assert.equal(paint(panel, html), true);
  assert.deepEqual(removed, ['old']);
  assert.deepEqual(inserted, [[before, tools], [after]]);

});
t('the boutique opens the cash drawer like the restaurant: manager code on a real store, logged as a no-sale movement', () => {
  const bq = readFileSync(new URL('../assets/pos-boutique.js', import.meta.url), 'utf8');
  const sales = readFileSync(new URL('../assets/pos-boutique/drawer.js', import.meta.url), 'utf8');
  assert.ok(/id="bq-open-drawer"[^>]*>.*Ouvrir le tiroir/.test(bq), 'the rail carries « Ouvrir le tiroir »');
  assert.ok(/openDrawerNoSale\(\(m\) => bqCashEvent\('movement', m\)\)/.test(bq), 'the click logs into the shift');
  const events = []; let approval;
  const w = { KiwiHardware: { openDrawer: () => { events.push('hardware'); return { ok: true }; } }, requireManager: (label, kick) => { approval = { label, kick }; } };
  const run = (real) => shippedFunction(sales, 'openDrawerNoSale', { window: w, pvReal: () => real, toast() {} })((m) => events.push(m));
  run(true);
  assert.equal(events.length, 0);
  assert.equal(approval.label, 'Ouvrir le tiroir sans vente');
  approval.kick();
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [{ movementKind: 'no-sale', movementAmountCents: 0, movementReason: 'Ouverture sans vente' }, 'hardware']);
  events.length = 0; approval = null; run(false);
  assert.equal(approval, null);
  assert.equal(events[1], 'hardware');

});
t('the Clientes tab carries no count: the customer book is not an alert', () => {
  const bq = readFileSync(new URL('../assets/pos-boutique.js', import.meta.url), 'utf8');
  const badges = {};
  shippedFunction(bq, 'renderBadges', {
    state: { scanLog: [] }, activeAvoirs: () => [], root: {}, window: { KiwiClients: { list: () => Array(100).fill({}) } },
    $: (id) => badges[id] ||= { style: {} }, bqKitRailPaint() {},
  })();
  assert.equal(badges['#bq-badge-cl'].textContent, '');
  assert.equal(badges['#bq-badge-cl'].style.display, 'none');
});
console.log(`✓ boutique-inv-alerts · ${ok} contrôles : la pastille Inventaire compte ce qui n'a pas été vu`);
