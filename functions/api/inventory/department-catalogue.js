import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { resolveInventoryUnitScope } from './_unit-scope.js';
import { resolveHotelActor } from './_hotel-actor.js';
import {
  departmentCatalogueFeature, validateDepartmentCatalogue,
} from './_department-catalogue.js';
import { ECONOMAT_CATALOGUE_FEATURE } from './_economat-catalogue.js';

function parse(raw, fallback) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' ? value : fallback;
  } catch (_) { return fallback; }
}

async function hotelContext(request, env, merchant, unitId, terminalId) {
  let config;
  let registryRow;
  try {
    config = await env.DB.prepare('SELECT type FROM merchant_config WHERE merchant = ? LIMIT 1').bind(merchant).first();
    registryRow = await env.DB.prepare(
      "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'hotel-units' LIMIT 1"
    ).bind(merchant).first();
  } catch (_) { return { error: 'unmigrated', status: 503 }; }
  if (!config || String(config.type || '') !== 'hotel') return { error: 'hotel-only', status: 403 };
  const registry = parse(registryRow && registryRow.data, { units: [] });
  const unit = (Array.isArray(registry.units) ? registry.units : []).find((entry) => entry && entry.id === unitId) || null;
  if (!unit) return { error: 'unit-not-found', status: 404 };

  const actor = await resolveHotelActor(request, env, merchant);
  if (actor) return { actor, unit, registry };

  const authenticated = await tenantFor(request, env, merchant);
  if (!authenticated) return { error: 'unauthorized', status: 401 };
  const scope = await resolveInventoryUnitScope(request, env, merchant, { terminalId });
  if (!scope.allowed || !scope.permitsUnit(unitId)) return { error: 'unit-forbidden', status: 403 };
  return {
    actor: { kind: 'till', id: terminalId || 'till', canReadUnit: () => true, canManageUnit: () => false },
    unit, registry,
  };
}

async function readCentral(env, merchant) {
  const row = await env.DB.prepare(
    'SELECT data FROM store_docs WHERE merchant = ? AND feature = ? LIMIT 1'
  ).bind(merchant, ECONOMAT_CATALOGUE_FEATURE).first();
  return parse(row && row.data, { items: [] });
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').trim().slice(0, 80);
  const unitId = String(url.searchParams.get('unitId') || '').trim().slice(0, 80);
  const feature = departmentCatalogueFeature(unitId);
  if (!merchant || !feature) return json({ error: 'bad-request' }, 400);
  const context = await hotelContext(request, env, merchant, unitId, url.searchParams.get('terminalId'));
  if (context.error) return json({ error: context.error }, context.status);
  if (!context.actor.canReadUnit(context.unit)) return json({ error: 'unit-forbidden' }, 403);
  if (context.unit.active === false && context.actor.kind !== 'hotel-manager') {
    return json({ error: 'unit-inactive' }, 403);
  }
  try {
    const row = await env.DB.prepare(
      'SELECT data, rev, updated_ts FROM store_docs WHERE merchant = ? AND feature = ? LIMIT 1'
    ).bind(merchant, feature).first();
    const data = row ? parse(row.data, { unitId, items: [] }) : { unitId, items: [] };
    return json({ merchant, unitId, data, rev: Number(row && row.rev) || 0, updatedTs: Number(row && row.updated_ts) || 0 });
  } catch (_) { return json({ error: 'unmigrated' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String(body && body.merchant || '').trim().slice(0, 80);
  const unitId = String(body && body.unitId || '').trim().slice(0, 80);
  const feature = departmentCatalogueFeature(unitId);
  if (!merchant || !feature) return json({ error: 'bad-request' }, 400);
  const context = await hotelContext(request, env, merchant, unitId, body && body.terminalId);
  if (context.error) return json({ error: context.error }, context.status);
  if (!context.actor.canManageUnit(context.unit)) return json({ error: 'manager-required' }, 403);
  if (context.unit.active === false) return json({ error: 'unit-inactive' }, 409);

  let central;
  let current;
  try {
    central = await readCentral(env, merchant);
    current = await env.DB.prepare(
      'SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ? LIMIT 1'
    ).bind(merchant, feature).first();
  } catch (_) { return json({ error: 'unmigrated' }, 503); }
  const checked = validateDepartmentCatalogue(body && body.data, central, unitId);
  if (!checked.ok) return json({ error: checked.error }, checked.status || 422);
  const serverRev = Number(current && current.rev) || 0;
  const baseRev = Math.max(0, Number(body && body.baseRev) || 0);
  if (serverRev && baseRev !== serverRev) {
    return json({ error: 'stale', rev: serverRev, data: parse(current.data, null) }, 409);
  }
  const rev = serverRev + 1;
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO store_docs (merchant, feature, data, rev, updated_ts)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(merchant, feature) DO UPDATE SET
         data = excluded.data, rev = excluded.rev, updated_ts = excluded.updated_ts`
    ).bind(merchant, feature, JSON.stringify(checked.value), rev, now).run();
  } catch (_) { return json({ error: 'write-failed' }, 503); }
  return json({ ok: true, merchant, unitId, data: checked.value, rev, updatedTs: now });
}
