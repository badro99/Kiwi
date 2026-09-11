// Canonical Hotel Economat catalogue and exact unit conversion rules.
// Quantities written to inventory_movements have three decimal places. Every
// conversion is therefore proved representable at that precision before an
// operational record is accepted; the server never rounds a business quantity.

export const ECONOMAT_CATALOGUE_FEATURE = 'economat-catalogue';

export const RESTAURANT_UNITS = Object.freeze([
  ['mg', 'mass', 0.001], ['g', 'mass', 1], ['kg', 'mass', 1000],
  ['ml', 'volume', 1], ['cl', 'volume', 10], ['L', 'volume', 1000],
  ['unite', 'count', 1],
  ['douzaine', 'package', 1], ['lot', 'package', 1], ['paquet', 'package', 1],
  ['sachet', 'package', 1], ['sac', 'package', 1], ['boite', 'package', 1],
  ['carton', 'package', 1], ['barquette', 'package', 1], ['bouteille', 'package', 1],
  ['canette', 'package', 1], ['bocal', 'package', 1], ['pot', 'package', 1],
  ['bidon', 'package', 1], ['seau', 'package', 1], ['fut', 'package', 1],
  ['bac', 'package', 1], ['botte', 'package', 1], ['caisse', 'package', 1],
  ['plateau', 'package', 1], ['rouleau', 'package', 1],
].map(([id, family, factor]) => Object.freeze({ id, family, factor })));

const ALIASES = new Map([
  ['unite', 'unite'], ['unite', 'unite'], ['boite', 'boite'], ['fut', 'fut'],
  ...RESTAURANT_UNITS.map((unit) => [unit.id.toLocaleLowerCase('fr'), unit.id]),
]);
const BY_ID = new Map(RESTAURANT_UNITS.map((unit) => [unit.id, unit]));
const ITEM_KEYS = new Set([
  'itemId', 'name', 'baseUnit', 'purchaseUnit', 'purchaseToBase',
  'issueUnit', 'issueToBase', 'consumptionUnit', 'consumptionToBase', 'active',
]);

function key(value) {
  return String(value == null ? '' : value).trim().toLocaleLowerCase('fr')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

export function normalizeRestaurantUnit(value) {
  const raw = String(value == null ? '' : value).trim();
  if (BY_ID.has(raw)) return raw;
  return ALIASES.get(key(raw)) || '';
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 1e9 ? number : null;
}

export function makeConversionSnapshot(baseUnitValue, unitValue, explicitFactor) {
  const baseUnit = normalizeRestaurantUnit(baseUnitValue);
  const unit = normalizeRestaurantUnit(unitValue);
  const base = BY_ID.get(baseUnit);
  const selected = BY_ID.get(unit);
  if (!base || !selected) return null;

  let basePerUnit = finitePositive(explicitFactor);
  if (basePerUnit == null && base.family === selected.family && ['mass', 'volume'].includes(base.family)) {
    basePerUnit = selected.factor / base.factor;
  }
  if (basePerUnit == null && baseUnit === unit) basePerUnit = 1;
  if (basePerUnit == null) return null;

  // A single selected unit must itself fit the ledger's milli-base scale.
  const milli = basePerUnit * 1000;
  if (!Number.isSafeInteger(Math.round(milli)) || Math.abs(milli - Math.round(milli)) > 1e-9) return null;
  return Object.freeze({ unit, baseUnit, basePerUnit });
}

export function quantityToBase(quantityValue, snapshot) {
  const quantity = Number(quantityValue);
  const factor = snapshot && finitePositive(snapshot.basePerUnit);
  if (!Number.isFinite(quantity) || quantity < 0 || factor == null) return null;
  const milli = quantity * factor * 1000;
  const rounded = Math.round(milli);
  if (!Number.isSafeInteger(rounded) || Math.abs(milli - rounded) > 1e-7) return null;
  return rounded / 1000;
}

export function quantityFromBase(baseQuantityValue, snapshot) {
  const baseQuantity = Number(baseQuantityValue);
  const factor = snapshot && finitePositive(snapshot.basePerUnit);
  if (!Number.isFinite(baseQuantity) || baseQuantity < 0 || factor == null) return null;
  const quantity = baseQuantity / factor;
  return Number.isFinite(quantity) ? quantity : null;
}

function cleanItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'bad-item' };
  const unexpected = Object.keys(raw).find((name) => !ITEM_KEYS.has(name));
  if (unexpected) return { error: `unexpected-item-key:${unexpected}` };
  const itemId = String(raw.itemId || '').trim().slice(0, 80);
  const name = String(raw.name || '').trim().slice(0, 160);
  const baseUnit = normalizeRestaurantUnit(raw.baseUnit);
  if (!itemId || !/^[A-Za-z0-9._:-]+$/.test(itemId)) return { error: 'bad-item-id' };
  if (!name || !baseUnit) return { error: `bad-item:${itemId}` };

  const purchase = makeConversionSnapshot(baseUnit, raw.purchaseUnit, raw.purchaseToBase);
  const issue = makeConversionSnapshot(baseUnit, raw.issueUnit, raw.issueToBase);
  const consumption = makeConversionSnapshot(baseUnit, raw.consumptionUnit, raw.consumptionToBase);
  if (!purchase || !issue || !consumption) return { error: `bad-conversion:${itemId}` };
  return {
    value: {
      itemId, name, baseUnit,
      purchaseUnit: purchase.unit, purchaseToBase: purchase.basePerUnit,
      issueUnit: issue.unit, issueToBase: issue.basePerUnit,
      consumptionUnit: consumption.unit, consumptionToBase: consumption.basePerUnit,
      active: raw.active !== false,
    },
  };
}

export function validateEconomatCatalogue(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.items)) {
    return { ok: false, error: 'bad-economat-catalogue', status: 422 };
  }
  if (Object.keys(raw).some((name) => name !== 'items')) {
    return { ok: false, error: 'unexpected-catalogue-key', status: 422 };
  }
  if (raw.items.length > 5000) return { ok: false, error: 'too-many-items', status: 413 };
  const items = [];
  const seen = new Set();
  for (const rawItem of raw.items) {
    const checked = cleanItem(rawItem);
    if (!checked.value) return { ok: false, error: checked.error, status: 422 };
    if (seen.has(checked.value.itemId)) {
      return { ok: false, error: `duplicate-item:${checked.value.itemId}`, status: 409 };
    }
    seen.add(checked.value.itemId);
    items.push(checked.value);
  }
  return { ok: true, value: { items } };
}

export function catalogueItem(catalogue, itemId) {
  return (Array.isArray(catalogue && catalogue.items) ? catalogue.items : [])
    .find((item) => item && item.itemId === itemId) || null;
}

export function snapshotForUnit(item, unitValue) {
  const unit = normalizeRestaurantUnit(unitValue);
  if (!item || !unit) return null;
  for (const prefix of ['purchase', 'issue', 'consumption']) {
    if (item[`${prefix}Unit`] === unit) {
      return makeConversionSnapshot(item.baseUnit, unit, item[`${prefix}ToBase`]);
    }
  }
  return null;
}
