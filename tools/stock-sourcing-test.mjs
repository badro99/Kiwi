#!/usr/bin/env node
/* Un même produit, deux fournisseurs, deux qualités (Pasta Corner, 23 nov. 2026).
 *
 * Le document de stock de Pasta Corner porte « Nascarpon » (Leader Fromaggi,
 * 96 MAD le kg) et « mascapron » (Atacadao, 24 MAD le pot). Chaque qualité reste
 * un article ; assets/stock/sourcing.js les range sous une famille, les compare
 * au kilo et met les fournisseurs d'un article en concurrence :
 *
 *   · la famille se reconnaît sans accents ni majuscules, le pot se ramène au
 *     kilo par son contenu (ou le poids de la fiche nutrition), sinon on le dit ;
 *   · chaque fournisseur donne son dernier prix payé, sinon son prix annoncé ;
 *     le moins cher est marqué et devient le principal en un geste ;
 *   · le tableau groupe les qualités d'une famille sous une ligne d'en-tête ;
 *   · la fiche garde l'historique des mouvements et remplace l'ancienne liste
 *     de fournisseurs, qui ne comparait que les deux premiers ;
 *   · le bon de commande rappelle l'offre la moins chère et l'autre qualité. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../assets/stock/sourcing.js', import.meta.url), 'utf8');
let n = 0;
const ok = (msg) => { n++; console.log('✓ ' + msg); };
/* Les objets nés dans le contexte vm n'ont pas nos prototypes : on compare leur copie. */
const eq = (actual, expected, msg) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, msg);

function boot(opts = {}) {
  const S = {
    lang: () => opts.lang || 'fr',
    fmtMad: (v) => `${Math.round(v * 100) / 100} MAD`,
    fmtDateShort: (iso) => iso.slice(0, 10),
    stItemOverrides: opts.overrides || {},
    stOverlayRaw: () => opts.raw || { subcategories: [] },
    saved: 0,
    stSaveOverlay() { S.saved++; },
    getInv: () => opts.inv || [],
  };
  let api = null;
  const window = {
    KiwiStockInternal: { install: (name, factory) => { assert.equal(name, 'sourcing'); api = factory(S); } },
    KiwiInventory: { history: (id) => (opts.history || {})[id] || [] },
    Kiwi: { toast() {} },
  };
  vm.runInNewContext(SRC, { window, Date, Math, Object, Array, String, Number, Set, Map, JSON });
  return { api, S };
}

/* Les deux mascarpones de Pasta Corner, tels que le document de stock les porte. */
const nascarpon = { id: 'masc-kg', name: 'Nascarpon', unit: 'kg', costPerUnit: 96, supplier: 'Leader Fromaggi · casablanca', family: 'Mascarpone',
  suppliers: [{ id: 'c-lf', supplierName: 'Leader Fromaggi · casablanca', defaultPrice: 96, purchaseUnit: 'kg', factor: 1, rank: 1 }] };
const mascapron = { id: 'masc-pot', name: 'mascapron', unit: 'unité', costPerUnit: 24, supplier: 'atacadao · tanger', family: ' mascarponé ',
  suppliers: [{ id: 'c-at', supplierName: 'atacadao · tanger', defaultPrice: 24, purchaseUnit: 'unité', factor: 1, rank: 1 }] };
const tomates = { id: 'tom', name: 'Tomates', unit: 'kg', costPerUnit: 0, supplier: 'Lakhlfi Fruit · tanger', suppliers: [] };

{
  const { api } = boot();
  assert.equal(api.familyKey(' Mascarponé  '), api.familyKey('mascarpone'), 'accents, case and spaces do not split a family');
  eq(api.baseQty({ unit: 'kg' }), { measure: 'mass', qty: 1000 });
  eq(api.baseQty({ unit: 'cl' }), { measure: 'volume', qty: 10 });
  eq(api.baseQty({ unit: 'unité', packSize: 500 }), { measure: 'mass', qty: 500 });
  eq(api.baseQty({ unit: 'bouteille', packSize: 750, packMeasure: 'volume' }), { measure: 'volume', qty: 750 });
  eq(api.baseQty({ unit: 'pot', gramsPerUnit: 250 }), { measure: 'mass', qty: 250 }, 'the nutrition weight of a piece counts');
  assert.equal(api.baseQty({ unit: 'unité' }), null, 'a piece of unknown weight is not guessed');

  const price = (it) => it.costPerUnit;
  const need = api.familyView([nascarpon, mascapron], price);
  assert.equal(need.name, 'Mascarpone');
  assert.equal(need.base, 'kg');
  assert.equal(need.rows.find((r) => r.id === 'masc-pot').need, true, 'the pot asks for its weight before it is compared');
  assert.equal(need.rows.find((r) => r.id === 'masc-kg').per, 96);

  const v = api.familyView([nascarpon, { ...mascapron, packSize: 500 }], price);
  const pot = v.rows.find((r) => r.id === 'masc-pot');
  assert.equal(pot.per, 48, '24 MAD for 500 g is 48 MAD the kilo');
  assert.equal(pot.cheapest, true);
  assert.equal(Math.round(v.rows.find((r) => r.id === 'masc-kg').over), 100, 'Leader Fromaggi is twice the price per kilo');
  eq(v.rows.map((r) => r.id), ['masc-pot', 'masc-kg'], 'cheapest first');
  assert.equal(api.familyView([nascarpon], price), null, 'one item is not a family');

  const eggs = api.familyView([{ id: 'a', name: 'Oeufs bio', unit: 'unité', costPerUnit: 1.6, family: 'Oeuf' }, { id: 'b', name: 'oeuf', unit: 'unité', costPerUnit: 0.9, family: 'oeuf' }], price);
  assert.equal(eggs.base, 'unité', 'two items counted by the piece compare per piece');
  assert.equal(eggs.rows[0].id, 'b');
  ok('a family compares its qualities per kilo, per litre or per common piece; a piece of unknown weight is asked, never guessed');
}

{
  const { api } = boot();
  const day = (d) => Date.UTC(2026, 10, d);
  const rows = [
    { reason: 'receipt', unitCost: 92, occurredTs: day(20), note: 'Leader Fromaggi · casablanca · BL-12', meta: { supplierName: 'Leader Fromaggi · casablanca' } },
    { reason: 'receipt', unitCost: 88, occurredTs: day(6), note: 'Leader Fromaggi · BL-9' },
    { reason: 'receipt', unitCost: 81, occurredTs: day(15), note: 'Fromagerie Tanja · BL-3', meta: { supplierName: 'Fromagerie Tanja' } },
    { reason: 'sale', unitCost: 50, occurredTs: day(21) },
    { reason: 'receipt', unitCost: 0, occurredTs: day(22), note: 'Leader Fromaggi' },
  ];
  const cards = [
    { id: 'c2', supplierName: 'Atacadao · tanger', defaultPrice: 85, rank: 2 },
    { id: 'c1', supplierName: 'Leader Fromaggi · casablanca', defaultPrice: 96, rank: 1 },
  ];
  const offers = api.offersFor(cards, rows);
  const lf = offers.find((o) => o.id === 'c1');
  assert.equal(lf.principal, true, 'rank 1 is the main supplier');
  assert.equal(lf.price, 92, 'the last price paid beats the quoted one');
  assert.equal(lf.prev, 88);
  assert.equal(lf.n, 2, 'two deliveries, the free one and the sale ignored');
  const at = offers.find((o) => o.id === 'c2');
  assert.equal(at.price, 85, 'no delivery yet: the quoted price');
  assert.equal(at.last, null);
  const tanja = offers.find((o) => o.name === 'Fromagerie Tanja');
  assert.equal(tanja.id, '', 'a supplier who delivered without a card still competes');
  assert.equal(tanja.cheapest, true);
  assert.equal(offers.filter((o) => o.cheapest).length, 1);
  const gap = api.principalGap(offers);
  assert.equal(gap.low.name, 'Fromagerie Tanja');
  assert.equal(Math.round(gap.pct), 12, '81 against 92: 12 % cheaper');
  assert.equal(api.principalGap(api.offersFor([cards[1]], [])), null, 'one supplier, nothing to compare');
  const tie = api.offersFor([{ id: 'x', supplierName: 'A', defaultPrice: 10, rank: 1 }, { id: 'y', supplierName: 'B', defaultPrice: 10, rank: 2 }], []);
  assert.ok(!tie.some((o) => o.cheapest), 'two equal prices: nobody is cheaper');
  assert.equal(api.unitPrice({ costPerUnit: 0 }, offers), 81, 'an item without cost takes its best offer');
  assert.equal(api.unitPrice({ costPerUnit: 96 }, offers), 96, 'the item cost wins when it has one');
  ok('each supplier competes with its last price paid, else its quoted price; the cheapest is marked against the main supplier');
}

{
  const sub = { id: 'masc-kg', suppliers: [{ id: 'c1', supplierName: 'Leader Fromaggi', rank: 1 }, { id: 'c2', supplierName: 'Atacadao', rank: 2 }, { id: 'c3', supplierName: 'Tanja', rank: 3 }] };
  const { api, S } = boot({ raw: { subcategories: [sub] } });
  const pick = api.setPrincipal('masc-kg', 'c3');
  assert.equal(pick.supplierName, 'Tanja');
  eq(sub.suppliers.map((c) => [c.id, c.rank]), [['c3', 1], ['c1', 2], ['c2', 3]], 'the pick leads, the others keep their order');
  assert.equal(S.stItemOverrides['masc-kg'].supplier, 'Tanja', 'the item now names its main supplier');
  assert.equal(S.saved, 1, 'saved through the stock overlay, nowhere else');
  assert.equal(api.setPrincipal('masc-kg', 'nope'), null);
  assert.equal(S.saved, 1);
  assert.equal(api.setPack('masc-pot', 0.5 * 1000, 'mass'), true);
  eq([S.stItemOverrides['masc-pot'].packSize, S.stItemOverrides['masc-pot'].packMeasure], [500, 'mass']);
  assert.equal(api.setPack('masc-pot', 0, 'mass'), false, 'zero is refused');
  ok('any supplier can become the main one; a piece weight is saved on the item, through the stock overlay');
}

{
  const inv = [tomates, nascarpon, { id: 'x', name: 'Ail', unit: 'kg', costPerUnit: 30, suppliers: [] }, { ...mascapron, packSize: 500 }];
  const { api } = boot({ inv });
  const row = (it) => `<tr class="st-row-in"><td>${it.name}</td></tr>`;
  const html = api.tableRows(inv, row);
  const order = [...html.matchAll(/<td(?: colspan="10")?>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  eq(order.map((s) => s.split(' · ')[0]), ['Tomates', 'Mascarpone', 'Nascarpon', 'mascapron', 'Ail'], 'the qualities follow each other under their family');
  assert.match(html, /Mascarpone<\/b> · 2 qualités · de 48 MAD à 96 MAD le kilo/);
  assert.equal((html.match(/st-src-member/g) || []).length, 2, 'both qualities are indented under it');
  assert.equal((html.match(/st-src-fam"/g) || []).length, 1, 'one heading for the family');
  const filtered = api.tableRows([tomates, nascarpon], row);
  assert.ok(!/st-src-fam/.test(filtered), 'a filter that leaves one quality shows a plain row');
  const dense = api.denseRows(inv, (it) => `<button>${it.name}</button>`);
  assert.match(dense, /st-src-fam-dense[^]*Nascarpon[^]*mascapron/);
  ok('the stock table groups the qualities of a family under one heading with their price range per kilo');
}

{
  const raw = { subcategories: [{ id: 'masc-kg', suppliers: nascarpon.suppliers }, { id: 'masc-pot', suppliers: mascapron.suppliers }] };
  const inv = [nascarpon, mascapron];
  const { api } = boot({ inv, raw });
  /* Le bloc que movements.js rend, figé par le contrat de découpe. */
  const legacy = `
      <div class="st-notice info"><button data-stock-swap-ranks data-item-id="masc-kg">x</button></div>
      <div class="st-md-section">
        <div class="st-md-section-t">Fournisseurs</div>
        <div class="st-md-list">OLD-SUPPLIERS</div>
      </div>
      <div class="st-md-section">
        <div class="st-md-section-t">Historique des mouvements</div>
        <div class="st-md-list">MOVES</div>
      </div>`;
  const html = api.detail(nascarpon, legacy);
  assert.ok(html.includes('MOVES'), 'the movement history stays');
  assert.ok(!html.includes('OLD-SUPPLIERS') && !html.includes('data-stock-swap-ranks'), 'the old two-supplier list is replaced');
  assert.match(html, /Mise en concurrence des fournisseurs/);
  assert.match(html, /data-stock-add-backup-supplier data-item-id="masc-kg"/, 'the existing « add a supplier » flow is kept');
  assert.match(html, /Un seul fournisseur pour cet article/);
  assert.match(html, /Même produit, autres qualités · Mascarpone/);
  assert.match(html, /data-src-pack="masc-pot"/, 'the pot of unknown weight asks for it, right here');
  assert.match(html, /Combien pèse 1 unité/);
  assert.match(html, /<button class="st-src-link" type="button" data-src-open="masc-pot"[^>]*>mascapron<\/button>/, 'the other quality opens from its name');
  assert.equal(api.detail(nascarpon, 'no marker').endsWith('no marker'), true, 'an unexpected legacy block is kept whole');
  const alone = api.detail(tomates, legacy);
  assert.ok(!/data-src-family/.test(alone), 'an item without a family shows no family block');
  assert.match(alone, /Lakhlfi Fruit<\/span><span class="st-src-badge st-src-main">Principal/, 'a supplier named on the item, without a card, is its offer');
  assert.match(alone, /Un seul fournisseur pour cet article/);
  assert.match(api.detail({ id: 'z', name: 'Sel', unit: 'kg', costPerUnit: 0, suppliers: [] }, legacy), /Aucun fournisseur pour cet article/);
  ok('the item sheet keeps its movement history, compares every supplier and the other qualities, and asks for a missing piece weight');
}

{
  const inv = [nascarpon, { ...mascapron, packSize: 500 }];
  const raw = { subcategories: [] };
  const twoCards = { ...nascarpon, suppliers: [...nascarpon.suppliers, { id: 'c-ft', supplierName: 'Fromagerie Tanja', defaultPrice: 84, rank: 2 }] };
  const { api } = boot({ inv: [twoCards, inv[1]], raw });
  const hint = api.orderHint(twoCards);
  assert.match(hint, /Moins cher pour cet article : Fromagerie Tanja, 84 MAD \/ kg \(votre principal : 96 MAD \/ kg\)/);
  assert.match(hint, /data-src-order-pick="Fromagerie Tanja"/);
  assert.match(hint, /Autre qualité : mascapron chez atacadao, 48 MAD le kilo contre 96 MAD le kilo/);
  assert.equal(boot({ inv: [inv[1], twoCards], raw }).api.orderHint(inv[1]), '', 'the cheapest quality with one supplier: nothing to suggest');
  const options = [{ value: 'sup-1', textContent: 'Leader Fromaggi · casablanca' }, { value: 'sup-2', textContent: 'Fromagerie Tanja · tanger' }];
  const select = { value: 'sup-1', options };
  let changed = 0; let click = null;
  const scope = { querySelectorAll: () => [{ getAttribute: () => 'Fromagerie Tanja', addEventListener: (_, fn) => { click = fn; } }] };
  api.wireOrder(scope, select, () => { changed++; });
  click();
  assert.equal(select.value, 'sup-2', 'the suggested supplier is picked in the order list');
  assert.equal(changed, 1);
  let removed = 0;
  const lone = () => { let gone = false; const el = { getAttribute: () => 'Fromagerie Tanja', remove: () => { gone = true; removed++; }, addEventListener: () => { throw new Error('no list, no handler'); } };
    return { querySelectorAll: () => (gone ? [] : [el]) }; };
  api.wireOrder(lone(), null, () => {});
  api.wireOrder(lone(), { value: 'sup-1', options: [options[0]] }, () => {});
  assert.equal(removed, 2, 'no order list, or the supplier is not in it: the button that would do nothing is removed');
  const bare = JSON.parse(JSON.stringify(raw));
  for (const sub of bare.subcategories || []) if (sub.id === inv[1].id) sub.suppliers = [];
  const noSup = Object.assign({}, inv[1], { supplier: '', suppliers: [] });
  const bareHint = boot({ inv: [twoCards, noSup], raw: bare }).api.orderHint(twoCards);
  assert.doesNotMatch(bareHint, / chez ,/, 'a quality bought from nobody yet is not "chez" an empty name');
  assert.match(bareHint, /Autre qualité : mascapron, 48 MAD le kilo contre 96 MAD le kilo/);
  ok('the quick order names the cheaper supplier (one tap picks it) and the cheaper quality of the family');
}

{
  const field = (value) => ({ value });
  const scope = (fam, qty, unit) => ({ querySelector: () => ({ querySelector: (sel) => sel === '[data-src-family]' ? field(fam)
    : sel === '[data-src-pack-form]' ? field(qty) : field(unit) }) });
  const { api } = boot({ inv: [nascarpon] });
  eq(api.readForm(scope('  Mascarpone   frais ', '0,5', 'kg')), { family: 'Mascarpone frais', packSize: 500, packMeasure: 'mass' });
  eq(api.readForm(scope('', '', 'g')), { family: '', packSize: null, packMeasure: 'mass' }, 'a cleared field clears the item');
  eq(api.readForm(scope('Lait', '1', 'L')), { family: 'Lait', packSize: 1000, packMeasure: 'volume' });
  eq(api.readForm({ querySelector: () => null }), {}, 'no field, nothing changes');
  const html = api.formField({ family: 'Mascarpone', packSize: 1500, packMeasure: 'mass' }, [nascarpon, mascapron, tomates]);
  assert.match(html, /value="Mascarpone" data-src-family/);
  assert.match(html, /<datalist id="st-src-families"><option value="Mascarpone"><\/option><option value="mascarponé"><\/option><\/datalist>/);
  assert.match(html, /value="1.5" data-src-pack-form/);
  assert.match(html, /<option value="kg" selected>/);
  ok('the item form saves the family and the weight of a piece; clearing a field clears it');
}

{
  const SRC_WORDS = /const WORDS = \{([^]*?)\n  \};/.exec(SRC)[1];
  const keys = [...SRC_WORDS.matchAll(/^\s{4}(\w+): \[/gm)].map((m) => m[1]);
  for (const l of ['fr', 'en', 'ar']) {
    const { api } = boot({ lang: l });
    for (const k of keys) {
      const s = api.tr(k, null, l);
      assert.ok(s && s !== k, `${k} has a ${l} text`);
      assert.ok(!s.includes('—'), `${k} (${l}) carries no em dash`);
    }
  }
  const { api } = boot({ lang: 'ar', inv: [nascarpon, { ...mascapron, packSize: 500 }] });
  assert.match(api.tableRows([nascarpon, { ...mascapron, packSize: 500 }], (it) => `<tr class="st-row-in"><td>${it.name}</td></tr>`), /لكل كيلو/);
  ok('every phrase exists in French, English and Arabic, without em dashes');
}

console.log(n + ' groupes · stock sourcing');
