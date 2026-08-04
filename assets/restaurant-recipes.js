/* Kiwi · private restaurant recipes, stock usage and cost bridge. */
(function () {
  'use strict';
  if (!window.KiwiStore || window.KiwiRestaurantRecipes) return;

  const clean = (v) => String(v == null ? '' : v).trim();
  const norm = (v) => clean(v).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const number = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const venue = (id) => id || window.KiwiVenue?.getCurrentVenueData?.()?.id || window.KiwiVenue?.getVenue?.() || null;
  const store = window.KiwiStore.define('recipes', {
    blank: () => ({ items: {} }), cloud: true,
    isEmpty: (d) => !d || !d.items || !Object.keys(d.items).length,
  });

  function normalizeIngredient(value) {
    if (typeof value === 'string') return { stockId: '', name: clean(value), qty: 0, unit: '' };
    const v = value || {};
    return {
      stockId: clean(v.stockId || v.invId),
      name: clean(v.name),
      qty: number(v.qty),
      unit: clean(v.unit),
    };
  }
  function normalizeRecipe(value, itemId) {
    if (!value) return null;
    return {
      itemId: clean(value.itemId || itemId),
      itemName: clean(value.itemName),
      portions: Math.max(1, number(value.portions || value.yield) || 1),
      prepMinutes: number(value.prepMinutes),
      ingredients: (Array.isArray(value.ingredients) ? value.ingredients : []).map(normalizeIngredient).filter((x) => x.name || x.stockId).slice(0, 80),
      steps: (Array.isArray(value.steps) ? value.steps : []).map(clean).filter(Boolean).slice(0, 40),
      note: clean(value.note || value.notes).slice(0, 4000),
      updatedAt: number(value.updatedAt) || Date.now(),
    };
  }
  function all(id) {
    return Object.entries(store.get(venue(id)).items || {}).map(([itemId, value]) => normalizeRecipe(value, itemId)).filter(Boolean);
  }
  function get(itemId, itemName, id) {
    const map = store.get(venue(id)).items || {};
    if (itemId && map[itemId]) return normalizeRecipe(map[itemId], itemId);
    const name = norm(itemName);
    const hit = name ? Object.entries(map).find(([, r]) => norm(r.itemName) === name) : null;
    return hit ? normalizeRecipe(hit[1], hit[0]) : null;
  }
  function inventory(id) {
    try {
      const rows = window.KiwiRestaurantStock?.items?.(venue(id));
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }
  function stockFor(ingredient, id) {
    const rows = inventory(id);
    return rows.find((x) => ingredient.stockId && String(x.id) === ingredient.stockId)
      || rows.find((x) => norm(x.name) === norm(ingredient.name)) || null;
  }
  function ingredientInfo(ingredient, id) {
    const stock = stockFor(ingredient, id);
    const cost = stock && Number.isFinite(Number(stock.costPerUnit)) ? number(stock.costPerUnit) : null;
    return { stock, cost, lineCost: cost == null ? null : round(cost * number(ingredient.qty)) };
  }
  function salesFor(itemId, itemName, id, days) {
    const since = Date.now() - Math.max(1, days || 7) * 864e5;
    let qty = 0;
    try {
      (window.KiwiSales?.list?.(venue(id)) || []).forEach((sale) => {
        if ((+sale.ts || 0) < since) return;
        (sale.lines || []).forEach((line) => {
          if ((line.id && String(line.id) === String(itemId)) || norm(line.name) === norm(itemName)) qty += number(line.qty);
        });
      });
    } catch (_) {}
    return qty;
  }
  function metrics(item, recipe, id) {
    const r = normalizeRecipe(recipe, item?.id) || { portions: 1, ingredients: [] };
    const infos = r.ingredients.map((line) => ({ line, ...ingredientInfo(line, id) }));
    const known = infos.filter((x) => x.lineCost != null);
    const total = known.reduce((sum, x) => sum + x.lineCost, 0);
    const theoreticalCost = round(total / Math.max(1, r.portions));
    const costComplete = !!infos.length && known.length === infos.length && infos.every((x) => number(x.line.qty) > 0);
    const sold = salesFor(item?.id, item?.name || r.itemName, id, 7);
    /* One ingredient can feed several dishes. Attribute its physical usage to
     * this recipe by this recipe's theoretical share, never the whole sack. */
    const tracked = infos.map((x) => {
      if (!x.stock || !(number(x.stock.usageThisWeek) > 0)) return null;
      const totalTheoretical = theoreticalUsage(x.stock.id, id, 7);
      if (!(totalTheoretical > 0)) return null;
      const ratio = number(x.stock.usageThisWeek) / totalTheoretical;
      return (number(x.line.qty) / Math.max(1, r.portions)) * ratio * number(x.stock.costPerUnit);
    });
    const actualCost = infos.length && sold > 0 && tracked.every((x) => x != null)
      ? round(tracked.reduce((sum, value) => sum + value, 0)) : null;
    const variancePct = actualCost != null && theoreticalCost > 0 ? round(((actualCost - theoreticalCost) / theoreticalCost) * 100) : null;
    const price = number(item?.price);
    const basisCost = actualCost == null ? theoreticalCost : actualCost;
    return {
      ingredients: infos, theoreticalCost, actualCost, variancePct, costComplete, sold,
      profit: price > 0 && costComplete ? round(price - basisCost) : null,
      theoreticalProfit: price > 0 && costComplete ? round(price - theoreticalCost) : null,
    };
  }
  function mirrorCost(itemId, recipe, id) {
    const costStore = window.KiwiCost?.store;
    if (!costStore?.update) return;
    const r = normalizeRecipe(recipe, itemId);
    const vid = venue(id);
    costStore.update((d) => {
      d.ingredients = Array.isArray(d.ingredients) ? d.ingredients : [];
      d.recipes = d.recipes || {};
      const lines = [];
      let complete = !!r.ingredients.length;
      r.ingredients.forEach((line, index) => {
        const info = ingredientInfo(line, vid);
        const ingId = line.stockId ? `stock:${line.stockId}` : `recipe:${itemId}:${index}`;
        const pos = d.ingredients.findIndex((x) => String(x.id) === ingId);
        const ingredient = { id: ingId, name: line.name || info.stock?.name || '', unit: line.unit || info.stock?.unit || '', useCost: info.cost, stockId: line.stockId || '', at: Date.now() };
        if (pos >= 0) d.ingredients[pos] = ingredient; else d.ingredients.push(ingredient);
        if (!(line.qty > 0) || info.cost == null) complete = false;
        lines.push({ ing: ingId, qty: number(line.qty) });
      });
      d.recipes[itemId] = { status: complete ? 'complete' : 'incomplete', yield: r.portions, lines, notes: r.note, at: Date.now() };
      return d;
    }, vid);
  }
  function save(itemId, value, id) {
    if (!itemId) return;
    const next = normalizeRecipe({ ...value, itemId, updatedAt: Date.now() }, itemId);
    const result = store.update((d) => {
      d.items = d.items || {};
      d.items[itemId] = next;
      return d;
    }, venue(id));
    mirrorCost(itemId, next, id);
    return result;
  }
  function remove(itemId, id) {
    const vid = venue(id);
    const result = store.update((d) => { d.items = d.items || {}; delete d.items[itemId]; return d; }, vid);
    const costStore = window.KiwiCost?.store;
    costStore?.update?.((d) => { d.recipes = d.recipes || {}; delete d.recipes[itemId]; return d; }, vid);
    return result;
  }
  function theoreticalUsage(stockId, id, days) {
    if (!stockId) return 0;
    return round(all(id).reduce((sum, recipe) => {
      const sold = salesFor(recipe.itemId, recipe.itemName, id, days || 7);
      const perPortion = recipe.ingredients.filter((line) => line.stockId === String(stockId)).reduce((n, line) => n + number(line.qty), 0) / Math.max(1, recipe.portions);
      return sum + sold * perPortion;
    }, 0));
  }

  window.KiwiRestaurantRecipes = {
    all, get, save, remove, inventory, stockFor, ingredientInfo, metrics, theoreticalUsage,
    subscribe: (fn) => store.subscribe(fn), _store: store,
  };
})();
