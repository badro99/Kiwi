#!/usr/bin/env node
/* hotel-free-charge-test · la note de chambre d'un vrai hôtel ne reçoit aucun prix inventé par Kiwi.
 *
 * Avant : « Ajouter une charge » proposait Petit-déjeuner 80, Dîner 240, Spa 300, Minibar 45 et
 * Late check-out 150 MAD, des prix de Kiwi, sans montant libre ni lien avec les tarifs de l'hôtel,
 * et la clôture les facturait. Ici le vrai fichier assets/hotel-folio.js tourne dans un vm :
 * un hôtel réel saisit libellé, montant (centimes compris) et catégorie ; la démo garde ses raccourcis. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/hotel-folio.js', import.meta.url), 'utf8');
function folio(custom) {
  const folios = { 5: { room: 5, guest: 'TEST KIWI', lines: [], updatedAt: 0, src: 'direct', pax: 2, nights: 1 } };
  const toasts = [], handlers = {};
  let factory;
  const window = { KiwiVenue: { getCurrentVenueData: () => ({ profileInfo: {} }) }, __kiwiHotelInternal: { define: (name, f) => { factory = f; } } };
  vm.runInNewContext(source, { window });
  const scope = new Proxy({
    F: () => folios, K: () => ({ handlers, toast: (t, o) => toasts.push({ t, o }) }), MAD: (n) => n + ' MAD',
    SRC: { direct: { fee: 0, label: 'Direct' } }, ROOMS: { 5: { guest: 'x' } }, fmt: (n) => String(n), esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), QUICK_ITEMS: [{ label: 'Petit-déjeuner', amt: 80, src: 'resto' }], SRC_DOT: { resto: 'r', spa: 's', fee: 'f' },
    SRC_LBL: { resto: 'Restaurant', spa: 'Spa', fee: 'Frais' }, isCustomHotel: () => custom, tx: (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v?.[k] ?? ''),
    cuSave() {}, cuStamp: () => 1, folioTotal: () => 0, folioPaid: () => 0, hxLang: () => 'fr',
  }, { get: (t, k) => (k in t ? t[k] : (() => '')) });
  const api = factory(scope);
  const body = { innerHTML: '', fields: {}, querySelector(sel) { const m = sel.match(/data-hx-fc="(\w+)"/); return m ? { value: this.fields[m[1]] } : null; } };
  const el = { closest: () => ({ querySelector: () => body }) };
  return { api, folios, toasts, handlers, body, el };
}

// A real hotel: no invented price, a free charge instead.
const real = folio(true);
assert.equal(real.api.quickItems().length, 0, 'no Kiwi-invented shortcut for a real hotel');
const html = real.api.addChargeHtml(5);
assert.doesNotMatch(html, /Petit-déjeuner|Minibar|\b240\b|\b300\b/, 'the sheet shows no fixed price');
assert.match(html, /data-hx-fc="label"/); assert.match(html, /data-hx-fc="amt"[^>]*step="0\.01"/);
assert.equal(typeof real.handlers['hx-post-free-charge'], 'function', 'the free charge is wired');

const post = (label, amt, src) => { real.body.fields = { label, amt, src }; real.handlers['hx-post-free-charge'](real.el, '5'); };
post('Blanchisserie', '12,5', 'fee');
assert.equal(real.folios[5].lines.length, 1);
assert.equal(JSON.stringify([real.folios[5].lines[0].label, real.folios[5].lines[0].amt, real.folios[5].lines[0].src]), JSON.stringify(['Blanchisserie', 12.5, 'fee']), 'the hotel\'s own label and amount, to the centime');
post('Dîner', '0', 'resto'); post('', '30', 'fee'); post('Spa', 'abc', 'spa'); post('Spa', '12.345', 'spa'); post('Spa', '-5', 'spa');
assert.equal(real.folios[5].lines.length, 1, 'an empty label or an amount that is zero, negative, not a number or finer than the centime posts nothing');
assert.equal(real.toasts.filter((t) => t.o?.type === 'warn').length, 5, 'and says why');
post('Soin', '300', 'tarot');
assert.equal(real.folios[5].lines[1].src, 'fee', 'an unknown category falls back to fees');

// The label is data: it reaches the folio as text, never as markup.
post('<img src=x onerror=alert(1)>', '10', 'fee');
assert.ok(!/<img/i.test(real.body.innerHTML), 'no element is created from a typed label');
assert.ok(real.body.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'), 'the typed text is shown literally');
assert.ok(real.body.innerHTML.includes('Blanchisserie'), 'a normal label renders unchanged');
real.folios[5].lines.pop();

// The demo property keeps its showcase shortcuts.
const demo = folio(false);
assert.equal(demo.api.quickItems().length, 1, 'the demo keeps its shortcuts');
assert.doesNotMatch(demo.api.addChargeHtml(5), /data-hx-fc/, 'and has no free form');

console.log('✓ hotel folio: a real hotel posts its own charges, free label and amount to the centime; the demo keeps its shortcuts');
