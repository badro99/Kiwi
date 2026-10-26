import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for (const lang of ['fr', 'en', 'ar']) {
  const pages = [], modals = [], listeners = {}, nodes = {};
  const node = key => nodes[key] ||= { innerHTML: '', value: '', hidden: false };
  const document = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    querySelector: sel => sel === '[data-eco-stock]' ? node('stock') : null,
    getElementById: id => node(id),
  };
  const window = {
    Kiwi: { handlers: {}, activePage: 'economat', appPage: (_, page) => pages.push(page), modal: m => { modals.push(m); return {}; } },
    KiwiI18n: { getLang: () => lang },
    KiwiVenue: { getCurrentVenueData: () => ({ type: 'hotel' }) },
    KiwiInventory: { snapshot: () => Array.from({ length: 251 }, (_, i) => ({ id: 'item-' + String(i).padStart(3, '0'), name: 'Item ' + String(i).padStart(3, '0'), qty: 10 })) },
  };
  vm.runInNewContext(fs.readFileSync('assets/hotel-economat.js', 'utf8'), { window, document, setTimeout: () => {} });
  const h = window.Kiwi.handlers;
  h['nav-economat']();
  assert.match(pages.at(-1).body, /data-action="eco-show-more"/);
  h['eco-show-more']();
  assert.equal((node('stock').innerHTML.match(/class="hx-eco-row"/g) || []).length, 240);
  h['eco-show-more']();
  assert.equal((node('stock').innerHTML.match(/class="hx-eco-row"/g) || []).length, 251);
  assert.doesNotMatch(node('stock').innerHTML, /data-action="eco-show-more"/);
  const input = value => listeners.input({ target: { value, matches: sel => sel === '[data-eco-search]' } });
  input('item-250');
  assert.equal((node('stock').innerHTML.match(/class="hx-eco-row"/g) || []).length, 1);
  input('');
  assert.equal((node('stock').innerHTML.match(/class="hx-eco-row"/g) || []).length, 120, 'search resets page');
  h['eco-receive']();
  assert.match(modals.at(-1).body, /data-action="eco-items-more"/);
  const label = { fr: 'Afficher plus', en: 'Show more', ar: 'عرض المزيد' }[lang];
  assert.ok(modals.at(-1).body.includes(label));
  h['eco-items-more']();
  assert.equal((node('eco-items').innerHTML.match(/<option /g) || []).length, 240);
  h['eco-items-more']();
  assert.equal((node('eco-items').innerHTML.match(/<option /g) || []).length, 251);
  assert.equal(node('eco-items-more').hidden, true);
  listeners.input({ target: { id: 'eco-item', value: 'item-250', matches: () => false } });
  assert.equal((node('eco-items').innerHTML.match(/<option /g) || []).length, 1);
  assert.match(node('eco-items').innerHTML, /item-250/);
  h['eco-receive']();
  assert.equal((modals.at(-1).body.match(/<option /g) || []).length, 120, 'reopening resets suggestions');
}
console.log('✓ economat: 251 rows and receipt choices paged, search reset, FR/EN/AR');
