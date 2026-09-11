import { entitledMerchant, readEmployee } from '../../auth/_lib.js';

function plain(value) {
  return String(value == null ? '' : value).trim().toLocaleLowerCase('fr')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

function parse(raw, fallback) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' ? value : fallback;
  } catch (_) { return fallback; }
}

function roleKind(roleValue) {
  const role = plain(roleValue);
  const hotelManager = /^(hotelmanager|directeurgeneral|directricegenerale|direction|directeurhotel|directricehotel)$/.test(role);
  const departmentManager = hotelManager
    || /(manager|responsable|directeur|directrice|chef|gouvernant|econome)/.test(role);
  return { hotelManager, departmentManager };
}

function belongsToUnit(member, unit) {
  if (!member || !unit) return false;
  const claims = [member.unitId, member.department].map(plain).filter(Boolean);
  const identities = [unit.id, unit.name, unit.storeType].map(plain).filter(Boolean);
  return claims.some((claim) => identities.includes(claim));
}

async function employeeMember(env, session) {
  let rows;
  try {
    rows = await env.DB.prepare(
      "SELECT feature, data, updated_ts FROM store_docs WHERE merchant = ? AND feature IN ('employee-access', 'team')"
    ).bind(session.merchant).all();
  } catch (_) { return null; }
  const docs = (rows && rows.results) || [];
  const accessRow = docs.find((row) => row.feature === 'employee-access') || null;
  const teamRow = docs.find((row) => row.feature === 'team') || null;
  const access = parse(accessRow && accessRow.data, { members: [] });
  const team = parse(teamRow && teamRow.data, { members: [] });
  const find = (doc) => (Array.isArray(doc.members) ? doc.members : [])
    .find((member) => member && String(member.id || '') === String(session.staffId || '')) || null;
  const accessMember = find(access);
  const teamMember = find(team);
  const teamIsNewer = !accessRow || Number(teamRow && teamRow.updated_ts || 0) > Number(accessRow.updated_ts || 0);
  return accessMember ? { ...(teamMember || {}), ...accessMember } : (teamIsNewer ? teamMember : null);
}

export async function resolveHotelActor(request, env, merchantValue) {
  const merchant = String(merchantValue || '').trim().slice(0, 80);
  if (!merchant || !env || !env.DB) return null;
  try {
    if ((await entitledMerchant(request, env, merchant)) === merchant) {
      return {
        merchant, id: 'manager', name: 'Hotel manager', kind: 'hotel-manager',
        canReadUnit: () => true, canManageUnit: () => true,
      };
    }
  } catch (_) {}

  const session = await readEmployee(request, env);
  if (!session || session.merchant !== merchant) return null;
  const member = await employeeMember(env, session);
  if (!member) return null;
  const role = String(member.function || member.role || member.department || 'staff').trim();
  const kind = roleKind(role);
  return {
    merchant,
    id: String(member.id || session.staffId || '').slice(0, 96),
    name: [member.firstName, member.lastName].filter(Boolean).join(' ').trim().slice(0, 120) || 'Employee',
    role,
    kind: kind.hotelManager ? 'hotel-manager' : (kind.departmentManager ? 'department-manager' : 'employee'),
    canReadUnit: (unit) => kind.hotelManager || belongsToUnit(member, unit),
    canManageUnit: (unit) => kind.hotelManager || (kind.departmentManager && belongsToUnit(member, unit)),
  };
}
