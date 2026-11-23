#!/usr/bin/env node
/* Boutique · fournisseurs en concurrence (23 nov. 2026 : « la concurrence
 * fournisseurs doit aussi valoir pour les boutiques »).
 *
 * assets/boutique-sourcing.js, exécuté tel quel :
 *   · un produit porte un fournisseur et son coût ; les concurrents sont des
 *     prix annoncés sur la fiche de chaque fournisseur du document d'achats,
 *     ce qui a été payé vient des réceptions et passe avant l'annoncé ;
 *   · le moins cher est marqué, l'écart avec le principal est dit, et le
 *     changement de principal garde le coût du produit (le stock en rayon a
 *     été payé à l'ancien prix) et l'ancien principal en concurrence ;
 *   · « Ajouter un fournisseur concurrent » reconnaît un nom déjà connu,
 *     refuse un prix nul, et donne un principal au produit qui n'en avait pas ;
 *   · la section de la fiche produit s'affiche en trois langues, sans tiret
 *     cadratin. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../assets/boutique-sourcing.js', import.meta.url), 'utf8');
let n = 0;
const ok = (msg) => { n++; console.log('✓ ' + msg); };
const eq = (actual, expected, msg) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, msg);

function boot({ proc, products, lang = 'fr', slots = [] }) {
  const updates = [];
  const toasts = [];
  const listeners = [];
  const catalog = {
    getProduct: (id) => (products[id] ? { product: products[id], variants: [] } : null),
    updateProduct: (id, patch) => { updates.push([id, patch]); Object.assign(products[id] || {}, patch); return products[id] || null; },
  };
  const procApi = {
    doc: () => proc,
    setQuote(supplierId, itemId, price) {
      const row = proc.suppliers.find((x) => x.id === supplierId); if (!row) return null;
      row.quotes = Object.assign({}, row.quotes, { [itemId]: { price, at: 2 } }); return row;
    },
    addSupplier({ name }) { const row = { id: 'sup-new', name, active: true }; proc.suppliers.unshift(row); return row; },
  };
  const document = {
    documentElement: { getAttribute: () => lang },
    getElementById: () => null,
    head: { appendChild() {} },
    createElement: () => { const box = { appendChild() {}, set innerHTML(h) { box.firstElementChild = { html: h }; } }; return box; },
    createTextNode: (t) => t,
    querySelectorAll: (sel) => (sel === '[data-bqs-slot]' ? slots.filter((x) => !x.gone) : []),
    addEventListener: (type, fn) => listeners.push([type, fn]),
  };
  const window = { KiwiBoutiqueCatalog: catalog, KiwiProcurement: procApi, Kiwi: { toast: (m) => toasts.push(m) } };
  vm.runInNewContext(SRC, { window, document, Date, Math, Object, Array, String, Number, Set, Map, JSON });
  return { api: window.KiwiBoutiqueSourcing, updates, toasts, listeners };
}

/* Une boutique de jeans : trois ateliers, un grossiste fermé. */
function fixture() {
  return {
    proc: {
      suppliers: [
        { id: 'sup-derb', name: 'Textiles Derb Omar', active: true },
        { id: 'sup-fes', name: 'Atelier Fès', active: true, quotes: { 'prod-jean': { price: 160, at: 1 } } },
        { id: 'sup-old', name: 'Grossiste fermé', active: false, quotes: { 'prod-jean': { price: 90, at: 1 } } },
        { id: 'sup-casa', name: 'Casa Denim', active: true },
      ],
      receipts: [
        { id: 'r1', supplierId: 'sup-derb', receivedAt: Date.UTC(2026, 10, 2), lines: [{ itemId: 'prod-jean', qty: 4, unitCost: 175 }, { itemId: 'prod-jean', qty: 2, unitCost: 190 }] },
        { id: 'r0', supplierId: 'sup-derb', receivedAt: Date.UTC(2026, 8, 2), lines: [{ itemId: 'prod-jean', qty: 5, unitCost: 165 }] },
        { id: 'r2', supplierId: 'sup-casa', receivedAt: Date.UTC(2026, 9, 20), lines: [{ itemId: 'prod-jean', qty: 3, unitCost: 170 }, { itemId: 'prod-tshirt', qty: 9, unitCost: 40 }] },
      ],
    },
    products: {
      'prod-jean': { id: 'prod-jean', name: 'Jean droit', supplierId: 'sup-derb', cost: 180, priceMAD: 349 },
      'prod-veste': { id: 'prod-veste', name: 'Veste', supplierId: '', cost: 0, priceMAD: 590 },
    },
  };
}

{
  const f = fixture();
  const { api } = boot(f);
  const offers = api.offers(f.products['prod-jean'], f.proc);
  eq(offers.map((o) => [o.name, o.price, !!o.principal, !!o.cheapest, o.n]), [
    ['Textiles Derb Omar', 180, true, false, 2],
    ['Atelier Fès', 160, false, true, 0],
    ['Casa Denim', 170, false, false, 1],
  ], 'the principal at its last receipt (4 at 175 and 2 at 190 average 180), a quoted rival, a supplier seen only in receipts; an archived one is out');
  assert.equal(offers[0].prev, 165, 'the receipt before is kept for the trend');
  const g = api.gap(offers);
  assert.equal(g.low.name, 'Atelier Fès');
  assert.equal(Math.round(g.pct), 11, '160 against 180 is 11 % cheaper');
  eq(api.offers({ id: 'prod-veste', supplierId: '', cost: 0 }, f.proc), [], 'no supplier, no quote, no receipt: nothing to compare');
  eq(api.offers({ id: 'prod-jean', supplierId: 'sup-derb', costPerUnit: 180 }, { suppliers: f.proc.suppliers, receipts: [] }).map((o) => [o.name, o.price]),
    [['Textiles Derb Omar', 180], ['Atelier Fès', 160]], 'the stock page item (costPerUnit) reads the same; with no receipt the principal is at the product cost');
  ok('offers: the product supplier against quoted rivals and past receipts, cheapest marked, the gap measured');
}

{
  const f = fixture();
  const { api, updates } = boot(f);
  const pick = api.setPrincipal(f.products['prod-jean'], 'sup-fes');
  eq(pick, { id: 'sup-fes', name: 'Atelier Fès' });
  eq(updates.pop(), ['prod-jean', { supplierId: 'sup-fes' }], 'the product changes supplier, never its cost');
  assert.equal(f.products['prod-jean'].cost, 180);
  assert.equal(f.proc.suppliers.find((s) => s.id === 'sup-derb').quotes['prod-jean'].price, 180, 'the old principal stays in competition at its known price');
  const after = api.offers(f.products['prod-jean'], f.proc);
  eq(after.slice(0, 1).map((o) => [o.name, o.price, o.principal]), [['Atelier Fès', 160, true]], 'the new principal shows its own quote, not the product cost');
  assert.equal(api.setPrincipal(f.products['prod-jean'], 'sup-nobody'), null);
  ok('making a rival the principal keeps the cost and the old supplier in competition');
}

{
  const f = fixture();
  const { api, updates } = boot(f);
  const jean = f.products['prod-jean'];
  assert.equal(api.addRival(jean, 'sup-casa', '', '0'), null, 'no price, no offer');
  assert.equal(api.addRival(jean, '__new__', '  ', '150'), null, 'a new supplier needs a name');
  eq(api.addRival(jean, '__new__', 'casa  dénim', '150,5'), { id: 'sup-casa', name: 'Casa Denim' }, 'a name already in the list (spaces, accents, case) is that supplier, not a duplicate');
  assert.equal(f.proc.suppliers.find((s) => s.id === 'sup-casa').quotes['prod-jean'].price, 150.5, 'a comma decimal is read');
  assert.equal(updates.length, 0, 'a product that has a principal keeps it');
  eq(api.addRival(f.products['prod-veste'], '__new__', 'Tissus Tanger', '210'), { id: 'sup-new', name: 'Tissus Tanger' });
  eq(updates.pop(), ['prod-veste', { supplierId: 'sup-new' }], 'a product with no supplier takes the first one as its principal');
  ok('adding a rival: a known name is reused, a zero price refused, a product without supplier gets one');
}

{
  const f = fixture();
  const { api } = boot(f);
  const html = api.section('prod-jean');
  assert.match(html, /data-bqs-section="prod-jean"/);
  assert.match(html, /Fournisseurs en concurrence/);
  assert.match(html, /Atelier Fès est 11 % moins cher que votre fournisseur principal\./);
  assert.match(html, /data-bqs-main="sup-fes"/);
  assert.match(html, /Principal/);
  assert.match(html, /Le moins cher/);
  assert.match(html, /180 MAD la pièce/);
  assert.match(html, /2 livraisons/);
  assert.match(html, /data-bqs-add="prod-jean"/);
  const lone = api.section('prod-veste');
  assert.match(lone, /Aucun fournisseur pour ce produit/);
  assert.doesNotMatch(lone, /data-bqs-main/);
  assert.equal(api.section('prod-missing'), '', 'an unknown product draws nothing');
  const ar = boot({ ...fixture(), lang: 'ar' }).api.section('prod-jean');
  assert.match(ar, /منافسة الموردين/);
  assert.match(ar, /أرخص بـ 11 %/);
  const slot = (pid) => { const el = { gone: false, attrs: { 'data-bqs-slot': pid }, getAttribute: (k) => el.attrs[k], removeAttribute: (k) => { delete el.attrs[k]; el.gone = true; }, replaceWith: (x) => { el.gone = true; el.by = x; } }; return el; };
  const slots = [slot('prod-jean'), slot('prod-missing')];
  boot({ ...fixture(), slots });
  assert.match(slots[0].by.html, /^<div class="bqx-sh-sec bqs-sec" data-bqs-section="prod-jean">/, 'the place the product sheet leaves is filled with the section on load');
  assert.equal(slots[1].gone && !slots[1].by, true, 'a place for an unknown product is released, not filled');
  ok('the product sheet section: the gap, one-tap principal, badges, deliveries, the empty case, and the place the sheet leaves for it');
}

{
  const { api, listeners } = boot(fixture());
  assert.equal(listeners.filter(([t]) => t === 'click').length, 1, 'one delegated click listener, the sheet redraws without it');
  for (const [key, list] of Object.entries(api.WORDS)) {
    assert.equal(list.length, 3, key + ' has French, English and Arabic');
    list.forEach((w) => { assert.ok(w && w.trim(), key + ' is not empty'); assert.ok(!w.includes('—'), key + ' has no em dash'); });
  }
  ok('every phrase exists in French, English and Arabic, without em dashes');
}

console.log(n + ' groupes · boutique sourcing');
