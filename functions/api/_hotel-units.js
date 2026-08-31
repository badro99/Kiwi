export const HOTEL_UNITS_FEATURE = 'hotel-units';

const MAX_UNITS = 100;
const KINDS = new Set(['outlet', 'department', 'economat']);
const ROOT_KEYS = new Set(['units']);
const UNIT_KEYS = new Set(['id', 'name', 'kind', 'storeType', 'locationId', 'active']);
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function failure(error, detail, status = 422) {
  return { ok: false, error, detail, status };
}

function boundedText(value, max, token = false) {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  if (!out || out.length > max) return null;
  if (token && !TOKEN_RE.test(out)) return null;
  return out;
}

function previousUnits(previous) {
  if (!previous || typeof previous !== 'object' || !Array.isArray(previous.units)) return [];
  return previous.units;
}

export function isHotelMerchantType(type) {
  return String(type || '').trim().toLowerCase() === 'hotel';
}

export function hasConfiguredHotelUnits(value) {
  return !!(value && Array.isArray(value.units) && value.units.length);
}

export function validateHotelUnits(raw, previous = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return failure('invalid-hotel-units', 'registry-object-required');
  }

  for (const key of Object.keys(raw)) {
    if (!ROOT_KEYS.has(key)) return failure('invalid-hotel-units', `unexpected-root-key:${key}`);
  }
  if (!Array.isArray(raw.units)) return failure('invalid-hotel-units', 'units-array-required');
  if (raw.units.length > MAX_UNITS) return failure('invalid-hotel-units', 'too-many-units');

  const units = [];
  const ids = new Set();
  const locations = new Set();
  let economats = 0;

  for (let index = 0; index < raw.units.length; index += 1) {
    const input = raw.units[index];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return failure('invalid-hotel-unit', `unit-object-required:${index}`);
    }
    for (const key of Object.keys(input)) {
      if (!UNIT_KEYS.has(key)) return failure('invalid-hotel-unit', `unexpected-unit-key:${key}`);
    }

    const id = boundedText(input.id, 80, true);
    const name = boundedText(input.name, 120);
    const kind = boundedText(input.kind, 24, true);
    const storeType = input.storeType === '' ? '' : boundedText(input.storeType, 40, true);
    const locationId = boundedText(input.locationId, 96, true);
    if (!id) return failure('invalid-hotel-unit', `invalid-id:${index}`);
    if (!name) return failure('invalid-hotel-unit', `invalid-name:${id}`);
    if (!kind || !KINDS.has(kind)) return failure('invalid-hotel-unit', `invalid-kind:${id}`);
    if (storeType == null || (!storeType && kind !== 'department')) {
      return failure('invalid-hotel-unit', `invalid-store-type:${id}`);
    }
    if (!locationId) return failure('invalid-hotel-unit', `invalid-location-id:${id}`);
    if (typeof input.active !== 'boolean') return failure('invalid-hotel-unit', `active-boolean-required:${id}`);
    if (ids.has(id)) return failure('invalid-hotel-unit', `duplicate-id:${id}`);
    if (locations.has(locationId)) return failure('invalid-hotel-unit', `duplicate-location-id:${locationId}`);

    ids.add(id);
    locations.add(locationId);
    if (kind === 'economat') economats += 1;
    units.push({ id, name, kind, storeType, locationId, active: input.active });
  }

  if (units.length && economats !== 1) {
    return failure('invalid-hotel-units', 'exactly-one-economat-required');
  }

  const nextById = new Map(units.map((unit) => [unit.id, unit]));
  for (const oldUnit of previousUnits(previous)) {
    if (!oldUnit || typeof oldUnit !== 'object' || !oldUnit.id) continue;
    const nextUnit = nextById.get(oldUnit.id);
    if (!nextUnit) {
      return failure('hotel-unit-conflict', `unit-removal-forbidden:${oldUnit.id}`, 409);
    }
    if (nextUnit.locationId !== oldUnit.locationId) {
      return failure('hotel-unit-conflict', `location-id-immutable:${oldUnit.id}`, 409);
    }
    if (nextUnit.kind !== oldUnit.kind) {
      return failure('hotel-unit-conflict', `kind-immutable:${oldUnit.id}`, 409);
    }
    if (nextUnit.storeType !== oldUnit.storeType) {
      return failure('hotel-unit-conflict', `store-type-immutable:${oldUnit.id}`, 409);
    }
  }

  return { ok: true, value: { units } };
}
