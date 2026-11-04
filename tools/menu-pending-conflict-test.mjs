import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/menu-catalog/state.js', 'utf8');
// Expose the existing pull closure without replacing its implementation.
const exposed = source.replace('    return { store, catById,', '    return { pull, store, catById,');
for (const conflict of [true, false]) {
  const notices = [], data = new Map();
  const base = { items: [{ id: 'i1', name: 'Base', price: 10 }], cats: [] };
  const mine = { ...base, items: [{ ...base.items[0], name: 'Local' }] };
  const theirs = conflict ? { ...base, items: [{ ...base.items[0], name: 'Remote' }] } : base;
  data.set('kiwiMenuPending:shop', JSON.stringify({ vid: 'v1', data: mine, base }));
  let menu = mine;
  const window = {
    KiwiStore: { define: () => ({ get: () => menu, set: d => { menu = d; } }) },
    KiwiEnv: { isReal: () => true }, KiwiConfig: { storeSlug: () => 'shop', type: 'restaurant' },
    KiwiVenue: { isCustom: () => true, getCurrentVenueData: () => ({ id: 'v1', type: 'restaurant' }) },
    Kiwi: { toast: (...args) => notices.push(args) }, addEventListener() {}
  };
  const document = { body: { appendChild() {}, classList: { contains: () => false } }, getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {} }) };
  const ctx = vm.createContext({ window, document, console, setTimeout: () => 1,
    localStorage: { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v) },
    fetch: async () => ({ ok: true, json: async () => ({ merchant: 'shop', updatedTs: 2, menu: theirs }) }) });
  vm.runInContext(exposed, ctx);
  const api = window.KiwiMenuCatalogParts.state({ rules: { healSeq: d => d }, tr: copy => copy.en,
    STATION_COLORS: [], createFormulas: () => ({}) });
  await api.pull();
  assert.equal(menu.items[0].name, conflict ? 'Remote' : 'Local', 'same convergence winner');
  await api.pull();
  assert.equal(notices.length, conflict ? 1 : 0, 'pending edits warn once only when discarded');
}
console.log('✓ pending menu pull: losing edit notifies once, winning edit never notifies');
