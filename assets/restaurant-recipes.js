/* Kiwi · private restaurant recipes, stock usage and cost bridge. */
(function () {
  'use strict';
  if (!window.KiwiStore || window.KiwiRestaurantRecipes) return;

  const clean = (v) => String(v == null ? '' : v).trim();
  const units = () => window.KiwiRestaurantUnits;
  const norm = (v) => clean(v).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const number = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  /* Two decimals is money. A pinch of salt against a 25 kg sack is not. */
  const fine = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
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
      unit: units()?.normalize?.(v.unit, '') || clean(v.unit),
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
      const bridge = window.KiwiRestaurantStock;
      const rows = bridge?.rows ? bridge.rows(venue(id)) : (typeof bridge?.items === 'function' ? bridge.items(venue(id)) : (Array.isArray(bridge?.items) ? bridge.items : null));
      const stableRows = window.KiwiStockIdentity?.ensureRows?.(rows) || (Array.isArray(rows) ? rows : []);
      return stableRows.map((row) => ({ ...row, unit: units()?.normalize?.(row.unit) || row.unit }));
    } catch (_) { return []; }
  }
  function stockForRows(ingredient, rows) {
    return window.KiwiStockIdentity?.resolve?.(ingredient, rows)
      || rows.find((x) => ingredient.stockId && String(x.id) === ingredient.stockId)
      || rows.find((x) => norm(x.name) === norm(ingredient.name)) || null;
  }
  function stockFor(ingredient, id) { return stockForRows(ingredient, inventory(id)); }
  function ingredientInfo(ingredient, id) {
    const stock = stockFor(ingredient, id);
    const cost = stock && Number.isFinite(Number(stock.costPerUnit)) ? number(stock.costPerUnit) : null;
    const stockUnit = units()?.normalize?.(stock?.unit, '') || clean(stock?.unit);
    const recipeUnit = units()?.normalize?.(ingredient.unit || stockUnit, '') || clean(ingredient.unit || stockUnit);
    const quantityInStockUnit = units()?.convert
      ? units().convert(number(ingredient.qty), recipeUnit, stockUnit)
      : (recipeUnit === stockUnit ? number(ingredient.qty) : null);
    return { stock, cost, stockUnit, recipeUnit, quantityInStockUnit, lineCost: cost == null || quantityInStockUnit == null ? null : round(cost * quantityInStockUnit) };
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
      if (x.quantityInStockUnit == null) return null;
      return (x.quantityInStockUnit / Math.max(1, r.portions)) * ratio * number(x.stock.costPerUnit);
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
  /* Le prix ramené à l'unité de la ligne de recette — 12 MAD/kg devient
   * 0,012 MAD/g. Sorti de mirrorCost() parce que heal() doit pouvoir prédire
   * exactement ce que mirrorCost() écrirait : un ingrédient dont les unités ne
   * se convertissent pas rend null des deux côtés, et le rattrapage doit alors
   * s'abstenir plutôt que de réécrire le même null à chaque notification. */
  function lineCosting(line, info) {
    const lineUnit = units()?.normalize?.(line.unit || info.stockUnit, '') || line.unit || info.stockUnit || '';
    const useCost = info.cost == null ? null
      : (units()?.unitCost ? units().unitCost(info.cost, info.stockUnit, lineUnit) : (lineUnit === info.stockUnit ? info.cost : null));
    return { lineUnit, useCost };
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
        /* An ingredient named without an explicit article still resolves to one
         * by name. Carry that article's id, or the stock movement it should
         * produce would land on an identifier no ledger knows. */
        const stockId = line.stockId || clean(info.stock?.id);
        const ingId = stockId ? `stock:${stockId}` : `recipe:${itemId}:${index}`;
        const pos = d.ingredients.findIndex((x) => String(x.id) === ingId);
        const { lineUnit, useCost } = lineCosting(line, info);
        const ingredient ={ id: ingId, name: line.name || info.stock?.name || '', unit: lineUnit, useCost, stockId, at: Date.now() };
        if (pos >= 0) d.ingredients[pos] = ingredient; else d.ingredients.push(ingredient);
        if (!(line.qty > 0) || info.cost == null) complete = false;
        /* The till holds no unit table. Bake the article-unit quantity here so a
         * 350 g line never leaves the books 350 kg lighter. */
        lines.push({
          ing: ingId, qty: number(line.qty), stock: stockId,
          stockQty: info.quantityInStockUnit == null ? null : fine(info.quantityInStockUnit),
          stockUnit: info.stockUnit || '',
        });
      });
      /* Le nom du plat voyage avec la recette : une part d'addition partagée
         arrive à la caisse sans identifiant, et c'est le seul crochet qui reste
         pour retrouver quoi décompter du stock. */
      d.recipes[itemId] = { status: complete ? 'complete' : 'incomplete', name: r.itemName, yield: r.portions, lines, notes: r.note, at: Date.now() };
      return d;
    }, vid);
  }
  function nutritionResult(recipe, id) {
    const engine = window.KiwiMenuNutrition;
    if (!engine?.compute) return null;
    return engine.compute(normalizeRecipe(recipe, recipe?.itemId), inventory(id));
  }
  function publishNutrition(itemId, recipe, id) {
    const result = nutritionResult(recipe, id);
    const menu = window.KiwiMenuStore;
    if (!result || !menu?.updateItem) return result;
    const patch = result.complete ? {
      nutrition: { ...result.nutrition, perPortion: true },
      allergens: result.allergens,
      nutritionComplete: true,
    } : {
      nutrition: null,
      allergens: [],
      nutritionComplete: false,
    };
    const current = menu.data?.(venue(id))?.items?.find((item) => String(item.id) === String(itemId));
    const unchanged = current && current.nutritionComplete === patch.nutritionComplete
      && JSON.stringify(current.nutrition || null) === JSON.stringify(patch.nutrition || null)
      && JSON.stringify(current.allergens || []) === JSON.stringify(patch.allergens || []);
    if (!unchanged) menu.updateItem(itemId, patch);
    return result;
  }
  function recompute(itemId, id) {
    const recipe = get(itemId, '', id);
    if (!recipe) return null;
    return publishNutrition(itemId, recipe, id);
  }
  function recomputeForStock(stockId, id) {
    const target = inventory(id).find((row) => String(row.id) === String(stockId));
    let count = 0;
    all(id).forEach((recipe) => {
      const usesStock = recipe.ingredients.some((line) => String(line.stockId || '') === String(stockId)
        || (!line.stockId && target && norm(line.name) === norm(target.name)));
      if (!usesStock) return;
      publishNutrition(recipe.itemId, recipe, id);
      count += 1;
    });
    return count;
  }
  function recomputeAll(id) {
    let count = 0;
    all(id).forEach((recipe) => { publishNutrition(recipe.itemId, recipe, id); count += 1; });
    return count;
  }
  function save(itemId, value, id) {
    if (!itemId) return;
    const normalized = normalizeRecipe({ ...value, itemId, updatedAt: Date.now() }, itemId);
    const next = window.KiwiStockIdentity?.bindRecipe?.(normalized, inventory(id)) || normalized;
    const result = store.update((d) => {
      d.items = d.items || {};
      d.items[itemId] = next;
      return d;
    }, venue(id));
    mirrorCost(itemId, next, id);
    publishNutrition(itemId, next, id);
    return result;
  }
  function remove(itemId, id) {
    const vid = venue(id);
    const result = store.update((d) => { d.items = d.items || {}; delete d.items[itemId]; return d; }, vid);
    const costStore = window.KiwiCost?.store;
    costStore?.update?.((d) => { d.recipes = d.recipes || {}; delete d.recipes[itemId]; return d; }, vid);
    window.KiwiMenuStore?.updateItem?.(itemId, { nutrition: null, allergens: [], nutritionComplete: false });
    return result;
  }
  /* ── LE RATTRAPAGE DES PRIX ────────────────────────────────────────────────
   * mirrorCost() ne tourne qu'à l'enregistrement d'une fiche. Un document de
   * coûts qui a perdu ses prix — le fusionneur les écrasait avant la v365, mais
   * un appareil vidé ou une copie serveur arrivée amputée font pareil — restait
   * donc muet jusqu'à la prochaine saisie du commerçant : chaque plat sortait à
   * coût matière nul, sans rien signaler, puisqu'une fiche sans prix rend null
   * et jamais une erreur. Les deux sources restent pourtant intactes de leur
   * côté : la recette porte ses lignes, l'article son costPerUnit. On les
   * recroise ici. Réparation seule — mirrorCost() remplace par identifiant et
   * n'efface rien — et strictement quand un prix connu de l'inventaire manque
   * au document : sans écart, aucune écriture, donc pas de va-et-vient entre
   * deux appareils. */
  function heal(id) {
    const costStore = window.KiwiCost?.store;
    if (!costStore?.get) return 0;
    const vid = venue(id);
    if (!vid) return 0;
    const d = costStore.get(vid) || {};
    const priced = new Map();
    (Array.isArray(d.ingredients) ? d.ingredients : []).forEach((x) => { if (x && x.id) priced.set(String(x.id), x); });
    let healed = 0;
    all(vid).forEach((recipe) => {
      const gap = recipe.ingredients.some((line) => {
        const info = ingredientInfo(line, vid);
        if (info.cost == null) return false;      // l'inventaire ne connaît pas ce prix : rien à rattraper
        if (lineCosting(line, info).useCost == null) return false;  // réécrire null ne rattrape rien
        const stockId = line.stockId || clean(info.stock?.id);
        const known = stockId ? priced.get('stock:' + stockId) : null;
        return !known || known.useCost == null;
      });
      if (!gap) return;
      mirrorCost(recipe.itemId, recipe, vid);
      healed += 1;
    });
    return healed;
  }
  let healPending = false;
  function healSoon(id) {
    if (healPending) return;
    /* Un banc d'essai peut monter ce module dans un bac à sable sans minuterie ;
       l'appel de fin de fichier faisait alors échouer le CHARGEMENT entier, et
       deux suites tombaient sur un module absent plutôt que sur un défaut réel.
       Aucun navigateur n'est dans ce cas : sans minuterie, on ne planifie rien. */
    if (typeof setTimeout !== 'function') return;
    healPending = true;
    /* Les trois documents arrivent du serveur chacun à son tour ; on laisse la
     * volée se poser avant de recroiser, et mirrorCost() re-notifie. */
    setTimeout(() => { healPending = false; try { heal(id); } catch (_) {} }, 0);
  }

  function theoreticalUsageMap(id, days, sourceRows) {
    const vid = venue(id);
    const rows = Array.isArray(sourceRows) ? sourceRows : inventory(vid);
    const out = Object.create(null);
    all(vid).forEach((recipe) => {
      const sold = salesFor(recipe.itemId, recipe.itemName, vid, days || 7);
      if (!(sold > 0)) return;
      recipe.ingredients.forEach((line) => {
        const stock = stockForRows(line, rows);
        if (!stock?.id) return;
        const from = line.unit || stock.unit;
        const converted = units()?.convert
          ? units().convert(number(line.qty), from, stock.unit)
          : (from === stock.unit ? number(line.qty) : null);
        if (converted == null) return;
        const stockId = String(stock.id);
        out[stockId] = (out[stockId] || 0) + sold * converted / Math.max(1, recipe.portions);
      });
    });
    Object.keys(out).forEach((stockId) => { out[stockId] = round(out[stockId]); });
    return out;
  }
  function theoreticalUsage(stockId, id, days) {
    if (!stockId) return 0;
    return theoreticalUsageMap(id, days)[String(stockId)] || 0;
  }

  window.KiwiRestaurantRecipes = {
    all, get, save, remove, inventory, stockFor, ingredientInfo, metrics, nutrition: nutritionResult,
    recompute, recomputeForStock, recomputeAll, theoreticalUsage, theoreticalUsageMap, heal,
    subscribe: (fn) => store.subscribe(fn), _store: store,
  };

  /* Les trois pièces du rattrapage — recettes, coûts, inventaire — hydratent
   * chacune à son rythme depuis le serveur. On repasse à chaque arrivée : sans
   * écart, heal() ne touche à rien. */
  store.subscribe(healSoon);
  window.KiwiStore.subscribe?.('costs', healSoon);
  window.KiwiStore.subscribe?.('stock', healSoon);
  let nutritionPending = false;
  function recomputeSoon() {
    if (nutritionPending || typeof setTimeout !== 'function') return;
    nutritionPending = true;
    setTimeout(() => { nutritionPending = false; try { recomputeAll(); } catch (_) {} }, 0);
  }
  store.subscribe(recomputeSoon);
  window.KiwiStore.subscribe?.('stock', recomputeSoon);
  healSoon();
  recomputeSoon();
})();
