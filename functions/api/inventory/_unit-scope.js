import { entitledMerchant, isTerminalFor, isTillFor } from '../../auth/_lib.js';

function token(value, max = 120) {
  const s = String(value || '').trim();
  return s && s.length <= max && /^[A-Za-z0-9._:-]+$/.test(s) ? s : '';
}

function parseRegistry(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function validUnits(registry) {
  return (Array.isArray(registry.units) ? registry.units : []).filter((unit) =>
    unit && token(unit.id) && token(unit.locationId)
  );
}

function publicScope(scoped, role, readableUnits, activeUnits, assignedUnit, economat) {
  const permitted = assignedUnit ? [assignedUnit] : readableUnits;
  const unitIds = new Set(permitted.map((unit) => unit.id));
  const locationIds = new Set(permitted.map((unit) => unit.locationId));
  const activeUnitIds = new Set(activeUnits.map((unit) => unit.id));
  const activeLocationIds = new Set(activeUnits.map((unit) => unit.locationId));
  const byUnit = new Map(readableUnits.map((unit) => [unit.id, unit]));
  const byLocation = new Map(readableUnits.map((unit) => [unit.locationId, unit]));
  const economatLocationId = economat ? economat.locationId : '';
  return {
    scoped,
    role,
    allowed: !scoped || role === 'manager' || !!assignedUnit,
    units: permitted,
    allUnits: readableUnits,
    unitIds,
    locationIds,
    activeUnitIds,
    activeLocationIds,
    byUnit,
    byLocation,
    unitId: assignedUnit ? assignedUnit.id : '',
    locationId: assignedUnit ? assignedUnit.locationId : '',
    economatLocationId,
    permitsUnit(value) {
      if (!scoped) return true;
      return unitIds.has(token(value));
    },
    permitsLocation(value) {
      if (!scoped) return true;
      const id = String(value || '').trim();
      if (id === 'principal') return !!economatLocationId && locationIds.has(economatLocationId);
      return locationIds.has(token(id));
    },
    permitsMovementLocation(value, reason) {
      if (!scoped) return true;
      const id = String(value || '').trim();
      const locationId = id === 'principal' ? economatLocationId : token(id);
      if (!locationIds.has(locationId)) return false;
      if (activeLocationIds.has(locationId)) return true;
      return role === 'manager' && reason === 'transfer-out';
    },
    effectiveLocation(value) {
      const id = String(value || '').trim();
      if (!scoped) return id || 'principal';
      if (!id || id === 'principal') {
        if (assignedUnit) return assignedUnit.locationId;
        return economatLocationId || '';
      }
      return locationIds.has(id) ? id : '';
    },
    effectiveMovementLocation(value, reason) {
      const id = String(value || '').trim();
      if (!scoped) return id || 'principal';
      const effective = (!id || id === 'principal')
        ? (assignedUnit ? assignedUnit.locationId : economatLocationId || '')
        : token(id);
      return this.permitsMovementLocation(effective, reason) ? effective : '';
    },
    effectiveUnit(value) {
      const id = token(value);
      if (!scoped) return id;
      if (id && unitIds.has(id)) return id;
      if (!id && assignedUnit) return assignedUnit.id;
      return '';
    },
    storageLocations(requested) {
      if (!scoped) return [];
      const effective = requested ? this.effectiveLocation(requested) : '';
      const ids = effective ? [effective] : [...locationIds];
      if (economatLocationId && ids.includes(economatLocationId)) ids.push('principal');
      return [...new Set(ids)];
    },
    projectLocation(value) {
      const id = String(value || '').trim() || 'principal';
      return scoped && id === 'principal' && economatLocationId ? economatLocationId : id;
    },
    metadata() {
      if (!scoped) return null;
      return {
        role,
        unitId: assignedUnit ? assignedUnit.id : (role === 'manager' && economat ? economat.id : ''),
        locationId: assignedUnit ? assignedUnit.locationId : (role === 'manager' && economat ? economat.locationId : ''),
        economatLocationId,
        unitIds: [...unitIds],
        locationIds: [...locationIds],
        inactiveUnitIds: [...unitIds].filter((id) => !activeUnitIds.has(id)),
      };
    },
  };
}

export async function resolveInventoryUnitScope(request, env, merchant, options = {}) {
  const none = publicScope(false, 'legacy', [], [], null, null);
  if (!env || !env.DB || !merchant) return none;

  let config;
  try {
    config = await env.DB.prepare(
      'SELECT type FROM merchant_config WHERE merchant = ? LIMIT 1'
    ).bind(merchant).first();
  } catch (_) {
    return none;
  }
  if (!config || String(config.type || '') !== 'hotel') return none;

  let stored;
  try {
    stored = await env.DB.prepare(
      "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'hotel-units' LIMIT 1"
    ).bind(merchant).first();
  } catch (_) {
    return none;
  }
  const registry = parseRegistry(stored && stored.data);
  const units = validUnits(registry);
  const active = units.filter((unit) => unit.active !== false);
  if (!active.length) return none;
  const economat = active.find((unit) => unit.kind === 'economat') || null;

  if (await entitledMerchant(request, env, merchant)) {
    return publicScope(true, 'manager', units, active, null, economat);
  }

  const terminalId = token(options.terminalId, 80);
  const terminalUnits = registry.terminalUnits && typeof registry.terminalUnits === 'object'
    ? registry.terminalUnits
    : {};
  const assignedId = token(terminalUnits[terminalId]);
  const assigned = active.find((unit) => unit.id === assignedId && unit.kind === 'outlet') || null;
  const paired = terminalId
    && await isTillFor(request, env, merchant)
    && await isTerminalFor(request, env, merchant, terminalId);
  return publicScope(true, paired ? 'till' : 'denied', active, active, paired ? assigned : null, economat);
}

export function scopeSql(column, values) {
  const ids = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!ids.length) return { clause: '', values: [] };
  return { clause: ` AND ${column} IN (${ids.map(() => '?').join(',')})`, values: ids };
}
