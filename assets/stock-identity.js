/* Kiwi · identité stable et résolution rétrocompatible des articles de stock. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KiwiStockIdentity = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const clean = (value) => String(value == null ? '' : value).trim();
  const fold = (value) => clean(value).toLocaleLowerCase('fr').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  function hash(value) {
    let result = 2166136261;
    for (const char of value) {
      result ^= char.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function identityKey(row) {
    const item = row || {};
    return [item.name, item.unit, item.category || item.cat, item.supplier].map(fold).join('|');
  }

  function ensureRows(rows) {
    const occurrences = new Map();
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const item = row && typeof row === 'object' ? row : {};
      if (clean(item.id)) return { ...item, id: clean(item.id) };
      const key = identityKey(item);
      const occurrence = (occurrences.get(key) || 0) + 1;
      occurrences.set(key, occurrence);
      return { ...item, id: `legacy-stock-${hash(key)}${occurrence > 1 ? `-${occurrence}` : ''}` };
    });
  }

  function resolve(ingredient, rows) {
    const line = ingredient || {};
    const stableRows = ensureRows(rows);
    const stockId = clean(line.stockId || line.invId);
    if (stockId) {
      const exact = stableRows.find((row) => clean(row.id) === stockId);
      if (exact) return exact;
    }
    const name = fold(line.name);
    return name ? stableRows.find((row) => fold(row.name) === name) || null : null;
  }

  function bindRecipe(recipe, rows) {
    if (!recipe || typeof recipe !== 'object') return recipe;
    return {
      ...recipe,
      ingredients: (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((line) => {
        if (!line || clean(line.stockId || line.invId)) return line;
        const stock = resolve(line, rows);
        return stock ? { ...line, stockId: clean(stock.id) } : line;
      }),
    };
  }

  return { fold, identityKey, ensureRows, resolve, bindRecipe };
});
