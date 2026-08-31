export const HOTEL_UNITS_FEATURE = 'hotel-units';

const MAX_UNITS = 100;
const KINDS = new Set(['outlet', 'department', 'economat']);
const ROOT_KEYS = new Set(['units', 'terminalUnits']);
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
  let activeEconomats = 0;

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
    if (kind === 'economat') {
      economats += 1;
      if (input.active) activeEconomats += 1;
    }
    units.push({ id, name, kind, storeType, locationId, active: input.active });
  }

  if (units.length && economats !== 1) {
    return failure('invalid-hotel-units', 'exactly-one-economat-required');
  }
  /* L'unique économat doit rester ACTIF, et pas seulement exister.
   * Compter par `kind` laissait passer un registre dont le seul économat était
   * désactivé : la forme restait valide, l'hôtel n'avait plus de fournisseur
   * interne. Toutes les phases suivantes en dépendent — la phase 5 n'a nulle
   * part où envoyer une demande, la phase 8 n'a pas de lieu source. Le trou ne
   * se serait vu qu'au moment où quelqu'un aurait essayé de commander. */
  if (units.length && activeEconomats !== 1) {
    return failure('invalid-hotel-units', 'active-economat-required');
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
    /* `storeType` est CORRIGEABLE, volontairement.
     * La spec ne gèle que l'identité de lieu : `locationId` finit sur chaque
     * mouvement de stock, donc le renommer réécrirait l'histoire. `id` et
     * `kind` la suivent parce qu'ils décident de quel registre et de quel rôle
     * il s'agit. `storeType` ne fait que choisir l'expérience de caisse.
     * Le figer coûtait plus qu'il ne protégeait : sans écran de gestion et
     * sans suppression possible, un bar créé par erreur en « restaurant »
     * l'était pour toujours, et le seul recours était de le désactiver et d'en
     * créer un jumeau — un cadavre de plus dans le registre à chaque faute de
     * frappe. La version de principe (« modifiable tant qu'aucun mouvement ne
     * le référence ») exige un prédicat qui n'existera qu'à la phase 2. */
  }

  const terminalUnits = {};
  if (Object.prototype.hasOwnProperty.call(raw, 'terminalUnits')) {
    if (!raw.terminalUnits || typeof raw.terminalUnits !== 'object' || Array.isArray(raw.terminalUnits)) {
      return failure('invalid-hotel-units', 'terminal-units-object-required');
    }
    const activeOutlets = new Set(units
      .filter((unit) => unit.active && unit.kind === 'outlet')
      .map((unit) => unit.id));
    for (const [rawTerminalId, rawUnitId] of Object.entries(raw.terminalUnits)) {
      const terminalId = boundedText(rawTerminalId, 80, true);
      const unitId = boundedText(rawUnitId, 80, true);
      if (!terminalId) return failure('invalid-hotel-units', 'invalid-terminal-id');
      if (!unitId || !activeOutlets.has(unitId)) {
        return failure('invalid-hotel-units', `invalid-terminal-unit:${terminalId}`);
      }
      terminalUnits[terminalId] = unitId;
    }
  }

  const value = { units };
  if (Object.prototype.hasOwnProperty.call(raw, 'terminalUnits')) value.terminalUnits = terminalUnits;
  return { ok: true, value };
}
