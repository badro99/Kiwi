import {
  catalogueItem, makeConversionSnapshot, normalizeRestaurantUnit, snapshotForUnit,
} from './_economat-catalogue.js';

export const DEPARTMENT_CATALOGUE_PREFIX = 'hotel-dept:';
const FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'on-demand']);
const VISIBILITIES = new Set(['visible', 'hidden']);
const ITEM_KEYS = new Set([
  'itemId', 'visibility', 'countingUnit', 'packaging',
  'countingFrequency', 'active', 'recipeUse',
]);

export function departmentCatalogueFeature(unitIdValue) {
  const unitId = String(unitIdValue || '').trim();
  return unitId && unitId.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(unitId)
    ? DEPARTMENT_CATALOGUE_PREFIX + unitId
    : '';
}

function cleanPackaging(raw, centralItem) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (Object.keys(raw).some((key) => !['unit', 'quantity'].includes(key))) return null;
  const unit = normalizeRestaurantUnit(raw.unit);
  const quantity = Number(raw.quantity);
  const unitSnapshot = snapshotForUnit(centralItem, unit);
  if (!unitSnapshot || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) return null;
  const snapshot = makeConversionSnapshot(centralItem.baseUnit, unit, unitSnapshot.basePerUnit * quantity);
  return snapshot ? { unit, quantity } : null;
}

export function validateDepartmentCatalogue(raw, centralCatalogue, expectedUnitId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.items)) {
    return { ok: false, error: 'bad-department-catalogue', status: 422 };
  }
  if (Object.keys(raw).some((key) => !['unitId', 'items'].includes(key))) {
    return { ok: false, error: 'unexpected-department-key', status: 422 };
  }
  const unitId = String(raw.unitId || '').trim();
  if (!unitId || unitId !== expectedUnitId) return { ok: false, error: 'unit-mismatch', status: 409 };
  if (raw.items.length > 5000) return { ok: false, error: 'too-many-items', status: 413 };
  const items = [];
  const seen = new Set();
  for (const source of raw.items) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return { ok: false, error: 'bad-department-item', status: 422 };
    }
    const unexpected = Object.keys(source).find((key) => !ITEM_KEYS.has(key));
    if (unexpected) return { ok: false, error: `unsupported-field:${unexpected}`, status: 422 };
    const itemId = String(source.itemId || '').trim().slice(0, 80);
    const centralItem = catalogueItem(centralCatalogue, itemId);
    if (!centralItem || centralItem.active === false) {
      return { ok: false, error: `central-item-required:${itemId}`, status: 422 };
    }
    if (seen.has(itemId)) return { ok: false, error: `duplicate-item:${itemId}`, status: 409 };
    const countingUnit = normalizeRestaurantUnit(source.countingUnit);
    if (!snapshotForUnit(centralItem, countingUnit)) {
      return { ok: false, error: `bad-counting-unit:${itemId}`, status: 422 };
    }
    const packaging = cleanPackaging(source.packaging, centralItem);
    if (!packaging) return { ok: false, error: `bad-packaging:${itemId}`, status: 422 };
    const visibility = String(source.visibility || 'visible').trim();
    const countingFrequency = String(source.countingFrequency || 'on-demand').trim();
    if (!VISIBILITIES.has(visibility) || !FREQUENCIES.has(countingFrequency)) {
      return { ok: false, error: `bad-department-setting:${itemId}`, status: 422 };
    }
    seen.add(itemId);
    items.push({
      itemId, visibility, countingUnit, packaging, countingFrequency,
      active: source.active !== false, recipeUse: source.recipeUse === true,
    });
  }
  return { ok: true, value: { unitId, items } };
}

export function departmentAllowsItem(catalogue, itemId, purpose = 'request') {
  const item = (Array.isArray(catalogue && catalogue.items) ? catalogue.items : [])
    .find((entry) => entry && entry.itemId === itemId);
  if (!item || item.active === false || item.visibility === 'hidden') return false;
  return purpose !== 'recipe' || item.recipeUse === true;
}
