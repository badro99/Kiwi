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
  /* Fusion de deux appareils : une fiche effacée (pierre tombale `removed[id]`
   * sur l'horloge `updatedAt`) ne revient pas quand un appareil en retard la
   * renvoie ; à égalité d'horloge l'effacement gagne, et entre deux fiches du
   * même instant le contenu départage, donc l'ordre de fusion ne change rien. */
  const stable = (v) => {
    if (!v || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  };
  function mergeRecipeDocs(mine, theirs) {
    const a = (mine && mine.items) || {}, b = (theirs && theirs.items) || {};
    const gone = {};
    [mine && mine.removed, theirs && theirs.removed].forEach((m) => {
      Object.keys(m || {}).forEach((id) => { const t = +m[id]; if (Number.isFinite(t) && t > 0 && !(gone[id] >= t)) gone[id] = t; });
    });
    const horizon = Date.now() - 400 * 864e5;
    Object.keys(gone).forEach((id) => { if (gone[id] < horizon) delete gone[id]; });
    const items = {};
    new Set([...Object.keys(b), ...Object.keys(a)]).forEach((id) => {
      const x = a[id], y = b[id];
      let w = x || y;
      if (x && y) {
        const ax = +x.updatedAt || 0, ay = +y.updatedAt || 0;
        w = ax !== ay ? (ax > ay ? x : y) : (stable(x) >= stable(y) ? x : y);
      }
      if (gone[id] != null && gone[id] >= (+w.updatedAt || 0)) return;
      items[id] = w;
    });
    return Object.assign({}, theirs || {}, mine || {}, { items, removed: gone });
  }
  const store = window.KiwiStore.define('recipes', {
    blank: () => ({ items: {}, removed: {} }), cloud: true, merge: mergeRecipeDocs,
    isEmpty: (d) => !d || !d.items || (!Object.keys(d.items).length && !Object.keys(d.removed || {}).length),
  });

  /* Coût simple : le propriétaire écrit lui-même le prix de la portion de
   * l'ingrédient (`price`, en MAD, pour la recette entière). Une telle ligne
   * n'appartient à aucun article : jamais liée au stock, jamais décomptée par
   * la caisse, son prix est son coût. Vide = pas de prix saisi (jamais 0). */
  const manualPrice = (v) => {
    if (v == null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? fine(n) : null;
  };
  const isManual = (line) => !!line && line.price != null;
  /* PRÉPARATIONS. Une recette qui ne se vend pas (« Poulet épicé ») : elle rend
   * une quantité dans une unité (`portions` 7, `yieldUnit` kg) et entre dans les
   * plats comme une ligne `recipeId`. Le document `costs` la reçoit en ligne
   * { sub, qty } dans l'unité rendue : cost.js la chiffre, inventory-consumption
   * sort ses matières premières du stock à la vente du plat. */
  const isPrepId = (id) => /^prep:/.test(clean(id));
  function newPrepId() { return 'prep:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function normalizeIngredient(value) {
    if (typeof value === 'string') return { stockId: '', name: clean(value), qty: 0, unit: '' };
    const v = value || {};
    const price = manualPrice(v.price);
    const recipeId = price == null ? clean(v.recipeId) : '';
    const out = {
      stockId: price == null && !recipeId ? clean(v.stockId || v.invId) : '',
      name: clean(v.name),
      qty: number(v.qty),
      unit: units()?.normalize?.(v.unit, '') || clean(v.unit),
    };
    if (price != null) out.price = price;
    if (recipeId) out.recipeId = recipeId;
    return out;
  }
  /* Plafonds d'une fiche. normalizeRecipe lit des données déjà stockées et
   * garde ses bornes ; à l'enregistrement, dépasser est REFUSÉ (jamais coupé en
   * silence : les lignes en trop disparaissaient sans un mot, comme pour la
   * fidélité, décision du 4 nov.). */
  const MAX_INGREDIENTS = 80;
  const MAX_STEPS = 40;
  function tooLong(value) {
    const ing = (Array.isArray(value?.ingredients) ? value.ingredients : []).map(normalizeIngredient).filter((x) => x.name || x.stockId).length;
    const steps = (Array.isArray(value?.steps) ? value.steps : []).map(clean).filter(Boolean).length;
    return ing > MAX_INGREDIENTS || steps > MAX_STEPS;
  }
  function normalizeRecipe(value, itemId) {
    if (!value) return null;
    const prep = value.kind === 'prep' || isPrepId(value.itemId || itemId);
    return {
      itemId: clean(value.itemId || itemId),
      ...(prep ? { kind: 'prep', yieldUnit: units()?.normalize?.(value.yieldUnit, '') || clean(value.yieldUnit) || 'kg' } : {}),
      itemName: clean(value.itemName),
      portions: prep ? (number(value.portions || value.yield) || 1) : Math.max(1, number(value.portions || value.yield) || 1),
      prepMinutes: number(value.prepMinutes),
      ingredients: (Array.isArray(value.ingredients) ? value.ingredients : []).map(normalizeIngredient).filter((x) => x.name || x.stockId).slice(0, MAX_INGREDIENTS),
      steps: (Array.isArray(value.steps) ? value.steps : []).map(clean).filter(Boolean).slice(0, MAX_STEPS),
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
    const hit = name ? Object.entries(map).find(([key, r]) => !isPrepId(key) && r?.kind !== 'prep' && norm(r.itemName) === name) : null;
    return hit ? normalizeRecipe(hit[1], hit[0]) : null;
  }
  function preps(id) { return all(id).filter((r) => r.kind === 'prep'); }
  function inventory(id) {
    try {
      const bridge = window.KiwiRestaurantStock;
      const rows = bridge?.rows ? bridge.rows(venue(id)) : (typeof bridge?.items === 'function' ? bridge.items(venue(id)) : (Array.isArray(bridge?.items) ? bridge.items : null));
      const stableRows = window.KiwiStockIdentity?.ensureRows?.(rows) || (Array.isArray(rows) ? rows : []);
      return stableRows.map((row) => ({ ...row, unit: units()?.normalize?.(row.unit) || row.unit }));
    } catch (_) { return []; }
  }
  function stockForRows(ingredient, rows) {
    if (isManual(ingredient)) return null;   // prix saisi : aucun article, même homonyme
    return window.KiwiStockIdentity?.resolve?.(ingredient, rows)
      || rows.find((x) => ingredient.stockId && String(x.id) === ingredient.stockId)
      || rows.find((x) => norm(x.name) === norm(ingredient.name)) || null;
  }
  function stockFor(ingredient, id) { return ingredient && clean(ingredient.recipeId) ? null : stockForRows(ingredient, inventory(id)); }
  /* La recette sort-elle cet article, directement ou par une préparation ? */
  function usesStock(recipe, stockId, id, seen) {
    const done = seen || new Set();
    return (recipe?.ingredients || []).some((line) => {
      if (line.recipeId) {
        if (done.has(line.recipeId)) return false;
        done.add(line.recipeId);
        const prep = get(line.recipeId, '', id);
        return !!prep && prep.kind === 'prep' && usesStock(prep, stockId, id, done);
      }
      const s = stockFor(line, id);
      return !!s && String(s.id) === String(stockId);
    });
  }
  /* Coût d'une préparation par unité rendue (MAD/kg). null dès qu'une ligne
   * manque, comme un plat ; `seen` arrête un cycle (A contient B contient A). */
  function prepUnitCost(prep, id, seen) {
    if (!prep || !prep.ingredients.length || seen.has(prep.itemId)) return null;
    const next = new Set(seen).add(prep.itemId);
    let sum = 0;
    for (const line of prep.ingredients) {
      const info = ingredientInfo(line, id, next);
      if (!info.manual && !(number(line.qty) > 0)) return null;
      if (info.lineCost == null) return null;
      sum += info.lineCost;
    }
    return number(prep.portions) > 0 ? fine(sum / number(prep.portions)) : null;
  }
  function prepLineInfo(ingredient, id, seen) {
    const prep = get(ingredient.recipeId, '', id);
    const live = prep && prep.kind === 'prep' ? prep : null;
    const cost = live ? prepUnitCost(live, id, seen || new Set()) : null;
    const stockUnit = live ? live.yieldUnit : '';
    const recipeUnit = units()?.normalize?.(ingredient.unit || stockUnit, '') || clean(ingredient.unit || stockUnit);
    const quantityInStockUnit = !live ? null : units()?.convert
      ? units().convert(number(ingredient.qty), recipeUnit, stockUnit)
      : (recipeUnit === stockUnit ? number(ingredient.qty) : null);
    return { stock: null, prep: live, cost, stockUnit, recipeUnit, quantityInStockUnit, lineCost: cost == null || quantityInStockUnit == null ? null : fine(cost * quantityInStockUnit) };
  }
  function ingredientInfo(ingredient, id, seen) {
    if (isManual(ingredient)) {
      const u = units()?.normalize?.(ingredient.unit, '') || clean(ingredient.unit);
      return { stock: null, cost: null, stockUnit: '', recipeUnit: u, quantityInStockUnit: null, lineCost: fine(ingredient.price), manual: true };
    }
    if (ingredient && clean(ingredient.recipeId)) return prepLineInfo(ingredient, id, seen);
    const stock = stockFor(ingredient, id);
    const cost = stock && stock.costPerUnit != null && String(stock.costPerUnit).trim() !== '' && Number.isFinite(Number(stock.costPerUnit)) ? number(stock.costPerUnit) : null;
    const stockUnit = units()?.normalize?.(stock?.unit, '') || clean(stock?.unit);
    const recipeUnit = units()?.normalize?.(ingredient.unit || stockUnit, '') || clean(ingredient.unit || stockUnit);
    const quantityInStockUnit = units()?.convert
      ? units().convert(number(ingredient.qty), recipeUnit, stockUnit)
      : (recipeUnit === stockUnit ? number(ingredient.qty) : null);
    /* Kept at fine precision: the dish cost is rounded once, after the sum,
     * like the Coût simple sheet. Ten pinches at 0.4 centime are 4 centimes. */
    return { stock, cost, stockUnit, recipeUnit, quantityInStockUnit, lineCost: cost == null || quantityInStockUnit == null ? null : fine(cost * quantityInStockUnit) };
  }
  /* « 7 jours » = les 7 journées commerciales (aujourd'hui et les six d'avant, bascule 05:00 dans
   * le fuseau du magasin), comme partout ailleurs : pas 7 x 24 h glissantes sur l'horloge de l'appareil.
   * Sans le rapport du jour (page qui ne le charge pas), la fenêtre glissante d'avant. */
  function windowStart(id, days) {
    const n = Math.max(1, days || 7);
    try {
      const R = window.KiwiDayReport, slug = venue(id);
      if (R?.businessDay && R.dayBounds && R.shiftDay) {
        const from = R.dayBounds(R.shiftDay(R.businessDay(Date.now(), slug), -(n - 1), slug), slug)?.from;
        if (Number.isFinite(from)) return from;
      }
    } catch (_) {}
    return Date.now() - n * 864e5;
  }
  function salesFor(itemId, itemName, id, days) {
    const since = windowStart(id, days);
    let qty = 0;
    try {
      const seen = new Set();
      const sales = window.KiwiSales?.list?.(venue(id)) || [];
      const refunds = window.KiwiRefunds?.list?.(venue(id)) || [];
      [...sales, ...refunds].forEach((sale) => {
        if ((+sale.ts || 0) < since || sale.voided || sale.void_ts || sale.voidTs) return;
        const refund = refunds.includes(sale) || sale.kind === 'refund' || sale.channel === 'refund' || Number(sale.amountCents ?? sale.amount) < 0;
        const key = String(sale.saleId || sale.id || sale.cursor || '');
        if (key && seen.has((refund ? 'r:' : 's:') + key)) return;
        if (key) seen.add((refund ? 'r:' : 's:') + key);
        (sale.lines || []).forEach((line) => {
          const lineId = line.itemId || line.id;
          if ((lineId && String(lineId) === String(itemId)) || (!lineId && norm(line.name) === norm(itemName))) {
            const n = Number(line.qty);
            if (Number.isFinite(n)) qty += refund ? -Math.abs(n) : n;
          }
        });
      });
    } catch (_) {}
    return Math.max(0, qty);
  }
  function metrics(item, recipe, id) {
    const r = normalizeRecipe(recipe, item?.id) || { portions: 1, ingredients: [] };
    const infos = r.ingredients.map((line) => ({ line, ...ingredientInfo(line, id) }));
    const known = infos.filter((x) => x.lineCost != null);
    const total = known.reduce((sum, x) => sum + x.lineCost, 0);
    const theoreticalCost = round(total / Math.max(1, r.portions));
    const costComplete = !!infos.length && known.length === infos.length && infos.every((x) => x.manual || number(x.line.qty) > 0);
    const sold = salesFor(item?.id, item?.name || r.itemName, id, 7);
    /* One ingredient can feed several dishes. Attribute its physical usage to
     * this recipe by this recipe's theoretical share, never the whole sack. */
    const tracked = infos.map((x) => {
      if (x.manual) return null;   // hors stock : rien d'observé, le coût reste celui de la fiche
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
        if (info.manual) {
          /* Prix saisi : un ingrédient propre à la recette, sans article. Une
             ligne « 1 × son prix », sans `stock` : la caisse n'en sort rien. */
          const mid = `recipe:${itemId}:${index}`, mpos = d.ingredients.findIndex((x) => String(x.id) === mid);
          const ming = { id: mid, name: line.name, unit: '', useCost: info.lineCost, stockId: '', manual: true, at: Date.now() };
          if (mpos >= 0) d.ingredients[mpos] = ming; else d.ingredients.push(ming);
          lines.push({ ing: mid, qty: 1, stock: '', stockQty: null, stockUnit: '' });
          return;
        }
        if (line.recipeId) {
          /* Une préparation : la quantité dans SON unité rendue. Sans préparation,
             sans coût ou sans conversion, le plat reste incomplet. */
          if (!(line.qty > 0) || info.cost == null || info.quantityInStockUnit == null) complete = false;
          lines.push({ sub: line.recipeId, qty: info.quantityInStockUnit == null ? 0 : fine(info.quantityInStockUnit) });
          return;
        }
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
      const gone = d.removed && d.removed.recipes && +d.removed.recipes[itemId];
      d.recipes[itemId] = { status: complete ? 'complete' : 'incomplete', name: r.itemName, yield: r.portions, lines, notes: r.note, at: Math.max(Date.now(), gone ? gone + 1 : 0), ...(r.kind === 'prep' ? { kind: 'prep', yieldUnit: r.yieldUnit } : {}) };
      if (gone) delete d.removed.recipes[itemId];
      return d;
    }, vid);
  }
  /* Une préparation change (ou disparaît) : chaque recette qui l'utilise, et
   * celles qui utilisent celles-là, sont recopiées pour que leur état
   * « complet » suive. `done` arrête un cycle. */
  function mirrorDependents(prepId, id, done) {
    const seen = done || new Set([String(prepId)]);
    all(id).forEach((recipe) => {
      if (seen.has(recipe.itemId) || !recipe.ingredients.some((l) => l.recipeId === prepId)) return;
      seen.add(recipe.itemId);
      mirrorCost(recipe.itemId, recipe, id);
      publishNutrition(recipe.itemId, recipe, id);
      if (recipe.kind === 'prep') mirrorDependents(recipe.itemId, id, seen);
    });
  }
  /* Pour la nutrition, une ligne préparation se déplie en ses matières, à sa
   * part du rendement (150 g d'un lot de 7 kg = 0,15 ÷ 7 de chaque matière). */
  function flattenPreps(recipe, id, seen) {
    const out = [];
    (recipe?.ingredients || []).forEach((line) => {
      const prep = line.recipeId ? get(line.recipeId, '', id) : null;
      if (!prep || prep.kind !== 'prep' || seen.has(prep.itemId) || !(number(prep.portions) > 0)) { out.push(line); return; }
      const from = line.unit || prep.yieldUnit;
      const inYield = units()?.convert ? units().convert(number(line.qty), from, prep.yieldUnit) : (from === prep.yieldUnit ? number(line.qty) : null);
      if (inYield == null) { out.push(line); return; }
      const f = inYield / number(prep.portions);
      flattenPreps(prep, id, new Set(seen).add(prep.itemId)).forEach((l) => out.push({ ...l, qty: fine(number(l.qty) * f) }));
    });
    return out;
  }
  function nutritionResult(recipe, id) {
    const engine = window.KiwiMenuNutrition;
    if (!engine?.compute) return null;
    const r = normalizeRecipe(recipe, recipe?.itemId);
    return engine.compute(r ? { ...r, ingredients: flattenPreps(r, id, new Set([r.itemId])) } : r, inventory(id));
  }
  function publishNutrition(itemId, recipe, id) {
    if (isPrepId(itemId) || recipe?.kind === 'prep') return null;  // une préparation n'est pas sur la carte
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
      const direct = recipe.ingredients.some((line) => !line.recipeId && (String(line.stockId || '') === String(stockId)
        || (!line.stockId && target && norm(line.name) === norm(target.name))));
      if (!direct && !usesStock(recipe, stockId, id)) return;
      if (recipe.kind === 'prep') return;
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
    if (tooLong(value)) return false;   // refusé, rien n'est écrit ni coupé
    const tomb = +(store.get(venue(id)).removed || {})[itemId] || 0;
    const normalized = normalizeRecipe({ ...value, itemId, updatedAt: Math.max(Date.now(), tomb + 1) }, itemId);
    const bound = window.KiwiStockIdentity?.bindRecipe?.(normalized, inventory(id)) || normalized;
    /* Le rattachement par nom ne touche jamais une ligne à prix saisi. */
    const next = { ...bound, ingredients: (bound.ingredients || []).map((l) => (isManual(l) ? { ...l, stockId: '' } : l)) };
    const result = store.update((d) => {
      d.items = d.items || {};
      d.items[itemId] = next;
      return d;
    }, venue(id));
    mirrorCost(itemId, next, id);
    if (next.kind === 'prep') mirrorDependents(itemId, id);
    publishNutrition(itemId, next, id);
    return result;
  }
  function remove(itemId, id) {
    const vid = venue(id);
    const result = store.update((d) => {
      d.items = d.items || {};
      const prev = d.items[itemId];
      delete d.items[itemId];
      d.removed = d.removed || {};
      d.removed[itemId] = Math.max(Date.now(), (+prev?.updatedAt || 0) + 1, (+d.removed[itemId] || 0) + 1);
      return d;
    }, vid);
    if (window.KiwiCost?.removeRecipe) window.KiwiCost.removeRecipe(itemId, vid);
    else window.KiwiCost?.store?.update?.((d) => { d.recipes = d.recipes || {}; delete d.recipes[itemId]; return d; }, vid);
    if (isPrepId(itemId)) { mirrorDependents(itemId, vid); return result; }
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
        if (line.recipeId) return false;          // une préparation n'a pas de prix d'article à rattraper
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

  /* Ajoute à `out` les articles qu'une recette sort, `factor` fois sa ligne ;
   * une ligne préparation descend dans ses matières, à sa part du rendement. */
  function expandUsage(recipe, factor, rows, vid, out, seen) {
    recipe.ingredients.forEach((line) => {
      if (line.recipeId) {
        const prep = get(line.recipeId, '', vid);
        if (!prep || prep.kind !== 'prep' || seen.has(prep.itemId) || !(number(prep.portions) > 0)) return;
        const inYield = units()?.convert
          ? units().convert(number(line.qty), line.unit || prep.yieldUnit, prep.yieldUnit)
          : ((line.unit || prep.yieldUnit) === prep.yieldUnit ? number(line.qty) : null);
        if (inYield == null) return;
        expandUsage(prep, factor * inYield / number(prep.portions), rows, vid, out, new Set(seen).add(prep.itemId));
        return;
      }
      const stock = stockForRows(line, rows);
      if (!stock?.id) return;
      const from = line.unit || stock.unit;
      const converted = units()?.convert
        ? units().convert(number(line.qty), from, stock.unit)
        : (from === stock.unit ? number(line.qty) : null);
      if (converted == null) return;
      const stockId = String(stock.id);
      out[stockId] = (out[stockId] || 0) + factor * converted;
    });
  }
  function theoreticalUsageMap(id, days, sourceRows) {
    const vid = venue(id);
    const rows = Array.isArray(sourceRows) ? sourceRows : inventory(vid);
    const out = Object.create(null);
    all(vid).forEach((recipe) => {
      const sold = salesFor(recipe.itemId, recipe.itemName, vid, days || 7);
      if (!(sold > 0)) return;
      expandUsage(recipe, sold / Math.max(1, recipe.portions), rows, vid, out, new Set([recipe.itemId]));
    });
    Object.keys(out).forEach((stockId) => { out[stockId] = round(out[stockId]); });
    return out;
  }
  function theoreticalUsage(stockId, id, days) {
    if (!stockId) return 0;
    return theoreticalUsageMap(id, days)[String(stockId)] || 0;
  }

  window.KiwiRestaurantRecipes = {
    all, get, preps, newPrepId, save, tooLong, remove, inventory, stockFor, usesStock, ingredientInfo, metrics, nutrition: nutritionResult,
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
