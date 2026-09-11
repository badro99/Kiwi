import { json } from '../../auth/_lib.js';
import { resolveHotelActor } from './_hotel-actor.js';
import { resolveInventoryUnitScope } from './_unit-scope.js';
import { queryHotelInventoryReport } from './_hotel-reports.js';

function token(value, max = 80) {
  const text = String(value == null ? '' : value).trim();
  return text && text.length <= max && /^[A-Za-z0-9._:-]+$/.test(text) ? text : '';
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = token(url.searchParams.get('merchant'), 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  const actor = await resolveHotelActor(request, env, merchant);
  if (!actor || actor.kind !== 'hotel-manager') return json({ error: 'forbidden' }, 403);
  const scope = await resolveInventoryUnitScope(request, env, merchant);
  if (!scope.scoped) return json({ error: 'hotel-units-required' }, 409);
  const rawAt = url.searchParams.get('at');
  const at = rawAt == null || rawAt === '' ? Date.now() : Number(rawAt);
  if (!Number.isSafeInteger(at) || at <= 0) return json({ error: 'bad-as-of' }, 400);
  let report;
  try {
    report = await queryHotelInventoryReport(env.DB, merchant, {
      at,
      locationIds: [...scope.locationIds],
      unitIds: [...scope.unitIds],
      projectLocation: (locationId) => scope.projectLocation(locationId),
    });
  } catch (error) {
    return json({
      error: 'hotel-report-unavailable',
      dependency: String(error && error.dependency || 'database'),
    }, 503);
  }
  const unreconciledUnits = report.units
    .filter((unit) => !unit.reconciliation.balanced)
    .map((unit) => unit.locationId);
  if (unreconciledUnits.length) {
    return json({ error: 'inventory-unreconciled', unreconciledUnits, report }, 409);
  }
  return json({ ok: true, report });
}
