/* Kiwi · private restaurant recipes (never published with the customer menu). */
(function () {
  'use strict';
  if (!window.KiwiStore || window.KiwiRestaurantRecipes) return;
  const clean = (v) => String(v == null ? '' : v).trim();
  const norm = (v) => clean(v).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const store = window.KiwiStore.define('recipes', {
    blank: () => ({ items: {} }), cloud: true,
    isEmpty: (d) => !d || !d.items || !Object.keys(d.items).length,
  });
  const venue = (id) => id || window.KiwiVenue?.getCurrentVenueData?.()?.id || window.KiwiVenue?.getVenue?.() || null;
  const all = (id) => Object.values((store.get(venue(id)).items || {}));
  function get(itemId, itemName, id) {
    const map = store.get(venue(id)).items || {};
    if (itemId && map[itemId]) return map[itemId];
    const name = norm(itemName);
    return name ? Object.values(map).find((r) => norm(r.itemName) === name) || null : null;
  }
  function save(itemId, value, id) {
    if (!itemId) return;
    return store.update((d) => {
      d.items = d.items || {};
      d.items[itemId] = { itemId, itemName: clean(value.itemName), portions: Math.max(1, Number(value.portions) || 1), prepMinutes: Math.max(0, Number(value.prepMinutes) || 0), ingredients: Array.isArray(value.ingredients) ? value.ingredients.map(clean).filter(Boolean).slice(0, 80) : [], steps: Array.isArray(value.steps) ? value.steps.map(clean).filter(Boolean).slice(0, 40) : [], note: clean(value.note).slice(0, 4000), updatedAt: Date.now() };
      return d;
    }, venue(id));
  }
  function remove(itemId, id) { return store.update((d) => { d.items = d.items || {}; delete d.items[itemId]; return d; }, venue(id)); }
  window.KiwiRestaurantRecipes = { all, get, save, remove, subscribe: (fn) => store.subscribe(fn), _store: store };
})();
