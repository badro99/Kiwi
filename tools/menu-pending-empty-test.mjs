/* Une copie de carte VIDE mise en attente sans suppression explicite ne doit
 * jamais remplacer la carte du serveur à l'écran (Amira Cafe, 9 nov. 2026 :
 * « 0 articles · Publication en attente » alors que le serveur avait 20 plats). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('assets/menu-catalog/state.js', 'utf8');
const exposed = source.replace('    return { store, catById,', '    return { pull, schedulePublish, store, catById,');
assert.notEqual(exposed, source, 'the state closure still returns { store, catById, … }');

const server = { cats: [{ id: 'c1', name: 'Plats' }], items: [{ id: 'i1', name: 'Tajine', price: 90, catId: 'c1' }] };
const empty = { cats: [], items: [] };
const count = (m) => ((m && m.items) || []).length + ((m && m.cats) || []).length;

function realm({ queued, serverMenu = server }) {
  const data = new Map();
  if (queued) data.set('kiwiMenuPending:shop', JSON.stringify(queued));
  const box = { menu: queued ? queued.data : empty };
  const window = {
    KiwiStore: { define: () => ({ get: () => box.menu, set: (d) => { box.menu = d; } }) },
    KiwiEnv: { isReal: () => true }, KiwiConfig: { storeSlug: () => 'shop', type: 'restaurant' },
    KiwiVenue: { isCustom: () => true, getCurrentVenueData: () => ({ id: 'v1', type: 'restaurant' }) },
    Kiwi: { toast() {} }, addEventListener() {},
  };
  const document = { body: { appendChild() {}, classList: { contains: () => false } }, getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {} }), documentElement: { getAttribute: () => 'fr' } };
  const ctx = vm.createContext({ window, document, console, setTimeout: () => 1, clearTimeout() {},
    localStorage: { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) },
    fetch: async () => ({ ok: true, json: async () => ({ merchant: 'shop', updatedTs: 5, menu: serverMenu }) }) });
  vm.runInContext(exposed, ctx);
  const api = window.KiwiMenuCatalogParts.state({ rules: { healSeq: (d) => d }, tr: (copy) => copy.en,
    STATION_COLORS: [], createFormulas: () => ({}) });
  return { api, data, box };
}

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log('  ✓ ' + msg); };

{ // 1. The poisoned entry found in a real browser: empty data, a real base, no explicit deletion.
  const r = realm({ queued: { vid: 'v1', data: empty, base: { cats: [{ id: 'c1' }], items: [{ id: 'i1' }, { id: 'i2' }] }, updatedTs: 3, explicitEmpty: false } });
  await r.api.pull();
  ok(count(r.box.menu) === 2, 'an empty pending copy without explicit deletion yields to the server menu');
  ok(!r.data.has('kiwiMenuPending:shop'), 'that empty pending copy is discarded, not replayed');
}

{ // 2. A real "delete everything" still survives a reload.
  const r = realm({ queued: { vid: 'v1', data: empty, base: server, updatedTs: 3, explicitEmpty: true } });
  await r.api.pull();
  ok(count(r.box.menu) === 0, 'an explicitly emptied menu stays empty on screen after reload');
  ok(r.data.has('kiwiMenuPending:shop'), 'its pending publication is kept so it can still be sent');
}

{ // 3. A store reset (no deletion gesture) is never written to the pending queue.
  const r = realm({});
  await r.api.pull();
  r.box.menu = empty;
  r.api.schedulePublish('v1');
  ok(!r.data.has('kiwiMenuPending:shop'), 'an empty menu without explicit deletion is never queued');
}

{ // 4. A real pending edit, then the local store is emptied by accident: the merge must not wipe the menu.
  const mine = { ...server, items: [{ ...server.items[0], name: 'Tajine maison' }] };
  const r = realm({ queued: { vid: 'v1', data: mine, base: server, updatedTs: 3, explicitEmpty: false } });
  await r.api.pull();
  r.box.menu = empty;
  await r.api.pull();
  ok(count(r.box.menu) === 2, 'an accidentally emptied local copy never merges into "delete everything"');
}

console.log(`✓ menu-pending-empty : ${n} checks`);
