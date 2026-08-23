/* Kiwi · calcul nutritionnel pur des recettes, sans dépendance réseau. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KiwiMenuNutrition = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ALLERGEN_KEYS = [
    'gluten', 'crustaces', 'oeufs', 'poissons', 'arachides', 'soja', 'lait',
    'fruits_a_coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques',
  ];
  const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'sugars', 'salt'];
  const allergenSet = new Set(ALLERGEN_KEYS);

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function key(value) {
    return clean(value).toLocaleLowerCase('fr').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  }
  function finiteNonNegative(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function normalizeUnit(value) {
    const unit = key(value);
    if (['mg', 'milligramme', 'milligrammes'].includes(unit)) return 'mg';
    if (['g', 'gr', 'gramme', 'grammes'].includes(unit)) return 'g';
    if (['kg', 'kilo', 'kilos', 'kilogramme', 'kilogrammes'].includes(unit)) return 'kg';
    if (['ml', 'millilitre', 'millilitres'].includes(unit)) return 'ml';
    if (['cl', 'centilitre', 'centilitres'].includes(unit)) return 'cl';
    if (['l', 'litre', 'litres'].includes(unit)) return 'L';
    if (['unite', 'unites', 'unit', 'units', 'piece', 'pieces'].includes(unit)) return 'unité';
    return clean(value);
  }
  function normalizeAllergens(value) {
    const present = new Set(Array.isArray(value) ? value.filter((entry) => allergenSet.has(entry)) : []);
    return ALLERGEN_KEYS.filter((entry) => present.has(entry));
  }
  function nutritionPer100g(stock) {
    const source = stock && stock.nutrition && stock.nutrition.per100g;
    if (!source || typeof source !== 'object') return null;
    const out = {};
    for (const nutrient of NUTRIENT_KEYS) {
      const value = finiteNonNegative(source[nutrient]);
      if (value == null) return null;
      out[nutrient] = value;
    }
    return out;
  }
  function quantityToGrams(qty, unit, stock) {
    const amount = finiteNonNegative(qty);
    if (amount == null) return null;
    const normalized = normalizeUnit(unit || (stock && stock.unit));
    if (normalized === 'mg') return amount / 1000;
    if (normalized === 'g') return amount;
    if (normalized === 'kg') return amount * 1000;
    const gramsPerUnit = finiteNonNegative(stock && stock.gramsPerUnit);
    if (!(gramsPerUnit > 0)) return null;
    if (normalized === 'ml') return amount * gramsPerUnit;
    if (normalized === 'cl') return amount * 10 * gramsPerUnit;
    if (normalized === 'L') return amount * 1000 * gramsPerUnit;
    if (normalized === 'unité') return amount * gramsPerUnit;
    return null;
  }
  function stockIndex(rows) {
    const byId = new Map(), byName = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || typeof row !== 'object') return;
      if (row.id != null && clean(row.id)) byId.set(clean(row.id), row);
      const name = key(row.name);
      if (!name) return;
      if (!byName.has(name)) byName.set(name, row);
      else byName.set(name, null); // Un nom ambigu ne doit jamais produire un chiffre.
    });
    return { byId, byName };
  }
  function resolveStock(line, index) {
    const stockId = clean(line && (line.stockId || line.invId));
    if (stockId) return index.byId.get(stockId) || null;
    return index.byName.get(key(line && line.name)) || null;
  }
  function roundNutrition(value, keyName) {
    return keyName === 'kcal' ? Math.round(value) : Math.round(value * 10) / 10;
  }
  function compute(recipe, stockRows) {
    const lines = Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients : [];
    const active = lines.filter((line) => finiteNonNegative(line && line.qty) > 0);
    const portions = finiteNonNegative(recipe && recipe.portions);
    const index = stockIndex(stockRows);
    const totals = Object.fromEntries(NUTRIENT_KEYS.map((nutrient) => [nutrient, 0]));
    const allergens = new Set();
    const missingNutrition = [], missingConversion = [], missingAllergens = [];

    active.forEach((line, position) => {
      const stock = resolveStock(line, index);
      const label = clean(line.name) || clean(line.stockId) || String(position + 1);
      const per100g = nutritionPer100g(stock);
      const grams = quantityToGrams(line.qty, line.unit, stock);
      if (!per100g) missingNutrition.push(label);
      if (grams == null) missingConversion.push(label);
      if (per100g && grams != null) {
        NUTRIENT_KEYS.forEach((nutrient) => { totals[nutrient] += grams * per100g[nutrient] / 100; });
      }
      if (!stock || !Array.isArray(stock.allergens)) missingAllergens.push(label);
      else normalizeAllergens(stock.allergens).forEach((allergen) => allergens.add(allergen));
    });

    const validPortions = portions != null && portions > 0;
    const nutritionComplete = active.length > 0 && validPortions
      && !missingNutrition.length && !missingConversion.length;
    const allergensComplete = active.length > 0 && !missingAllergens.length;
    const nutrition = nutritionComplete
      ? Object.fromEntries(NUTRIENT_KEYS.map((nutrient) => [nutrient, roundNutrition(totals[nutrient] / portions, nutrient)]))
      : null;
    return {
      nutrition,
      allergens: allergensComplete ? ALLERGEN_KEYS.filter((entry) => allergens.has(entry)) : [],
      nutritionComplete,
      allergensComplete,
      complete: nutritionComplete && allergensComplete,
      missingNutrition,
      missingConversion,
      missingAllergens,
    };
  }

  /* ── Recherche dans Ciqual ─────────────────────────────────────────────────
   * Une simple sous-chaîne dans l'ordre du fichier, plafonnée à huit, rendait
   * « oeuf » invisible : un biscuit puis sept « Boeuf » prenaient toutes les
   * places, et « Oeuf cru » (23e) n'apparaissait jamais. On classe :
   *   0  le nom (ou un alias) est exactement la saisie
   *   1  le premier mot est la saisie          « Oeuf cru », « Lait entier »
   *   2  le nom commence par la saisie         « Laitue, crue » pour « lait »
   *   3  un mot entier est la saisie           « Caviar de tomates » non, « Pain de mie » pour « mie » oui
   *   4  un mot commence par la saisie         « Boeuf » pour « boe »
   *   5  sous-chaîne quelque part              « Boeuf » pour « oeuf »
   * Le nom anglais compte aussi (« egg »), un cran en dessous du français.
   * À rang égal, le nom le plus court d'abord : « Oeuf cru » avant
   * « Oeuf, blanc (blanc d'oeuf), en poudre ». « œ » et « æ » sont éclatés en
   * « oe » / « ae » avant la comparaison : la clé NFD ne décompose pas ces
   * ligatures et « œuf » devenait « uf ». */
  function searchKey(value) {
    return clean(value).toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function matchRank(text, query) {
    if (!text) return -1;
    if (text === query) return 0;
    // Plusieurs mots (« huile olive ») : chacun doit se retrouver, le rang est
    // celui du mot le moins bien placé. « Huile d'olive vierge » passe, « Huile
    // de lin » non.
    if (query.includes(' ')) {
      const ranks = query.split(' ').map((part) => matchRank(text, part));
      return ranks.some((rank) => rank < 0) ? -1 : Math.max(1, ...ranks);
    }
    const words = text.split(' ');
    if (words[0] === query) return 1;
    if (text.startsWith(query)) return 2;
    if (words.includes(query)) return 3;
    if (words.some((word) => word.startsWith(query))) return 4;
    if (text.includes(query)) return 5;
    return -1;
  }
  function searchFoods(ciqual, rawQuery, limit) {
    const query = searchKey(rawQuery);
    const foods = (ciqual && ciqual.foods) || [];
    const aliases = (ciqual && ciqual.aliases) || {};
    if (query.length < 2 || !foods.length) return [];
    const byId = new Map(foods.map((food) => [String(food.id), food]));
    const best = new Map();
    function offer(food, rank, alias) {
      if (!food || rank < 0) return;
      const id = String(food.id);
      const prev = best.get(id);
      if (!prev || rank < prev.rank) best.set(id, { food, rank, alias: alias || '' });
      else if (rank === prev.rank && alias && !prev.alias) prev.alias = alias;
    }
    Object.keys(aliases).forEach((alias) => {
      offer(byId.get(String(aliases[alias])), matchRank(searchKey(alias), query), alias);
    });
    foods.forEach((food) => {
      const fr = matchRank(searchKey(food.nameFr), query);
      const en = matchRank(searchKey(food.nameEn), query);
      const enRank = en < 0 ? -1 : en + 1;
      const rank = fr < 0 ? enRank : (enRank < 0 ? fr : Math.min(fr, enRank));
      offer(food, rank, '');
    });
    return Array.from(best.values())
      .sort((a, b) => a.rank - b.rank
        || searchKey(a.food.nameFr).length - searchKey(b.food.nameFr).length
        || String(a.food.nameFr).localeCompare(String(b.food.nameFr), 'fr'))
      .slice(0, limit || 8);
  }

  return {
    ALLERGEN_KEYS: ALLERGEN_KEYS.slice(), NUTRIENT_KEYS: NUTRIENT_KEYS.slice(),
    normalizeUnit, normalizeAllergens, quantityToGrams, compute,
    searchKey, searchFoods,
  };
}));
