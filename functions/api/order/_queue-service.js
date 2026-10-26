import { activeServiceEmployee } from '../../auth/_lib.js';
import { normTable } from './_guest-tables.js';
import { employeeName } from './_queue-shared.js';
// Contrat : requête authentifiée vers périmètre de service ; lecture seule.
function serviceNorm(value) {
  let s = String(value || '').trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return s.replace(/\s+/g, ' ');
}
async function serviceScope(request, env, merchant) {
  const employee = await activeServiceEmployee(request, env, merchant);
  if (!employee) return null;
  const tables = new Set(), allTables = new Set(), pausedTables = new Set();
  const pausedServers = [];
  try {
    const [row, attendanceRow, teamRow] = await Promise.all([
      env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'floorplan'").bind(merchant).first(),
      env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'attendance'").bind(merchant).first(),
      env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant).first(),
    ]);
    const plan = JSON.parse((row && row.data) || '{}');
    const attendance = JSON.parse((attendanceRow && attendanceRow.data) || '{}');
    const team = JSON.parse((teamRow && teamRow.data) || '{}');
    const staff = Object.create(null);
    (Array.isArray(plan.staff) ? plan.staff : []).forEach((s) => { if (s && s.id) staff[String(s.id)] = s; });
    const members = Array.isArray(team.members) ? team.members : [];
    const memberIds = new Set(members.map((m) => String(m && m.id || '')).filter(Boolean));
    const memberByName = new Map(members.map((m) => [serviceNorm(employeeName(m)), String(m && m.id || '')]));
    const assignedMemberId = (value) => {
      const raw = String(value || '');
      if (memberIds.has(raw)) return raw;
      const legacy = raw.startsWith('tm-') ? raw.slice(3) : '';
      if (legacy && memberIds.has(legacy)) return legacy;
      return memberByName.get(serviceNorm(staff[raw] && staff[raw].name)) || raw;
    };
    const pausedIds = new Set(), pausedNames = new Set();
    (Array.isArray(attendance.entries) ? attendance.entries : []).forEach((entry) => {
      if (!entry || entry.outTs || !entry.pauseTs) return;
      const id = String(entry.memberId || entry.staffId || '');
      const name = serviceNorm(entry.name);
      if (id) pausedIds.add(id);
      if (name) pausedNames.add(name);
    });
    const myId = String(employee.member.id || employee.session.staffId || '');
    const myName = serviceNorm(employeeName(employee.member));
    (Array.isArray(plan.tables) ? plan.tables : []).forEach((table) => {
      if (!table) return;
      const tableId = normTable(table.num || table.id);
      if (!tableId) return;
      allTables.add(tableId);
      const rawAssigned = Array.isArray(table.servers) && table.servers.length
        ? table.servers : (table.server ? [table.server] : []);
      if (!rawAssigned.length) { tables.add(tableId); return; }
      const assigned = Array.from(new Set(rawAssigned.map(assignedMemberId).filter(Boolean)));
      const assignedNames = rawAssigned.map((id) => serviceNorm(staff[String(id)] && staff[String(id)].name)).filter(Boolean);
      if (assigned.includes(myId) || assignedNames.includes(myName)) {
        tables.add(tableId);
      }
      if (assigned.some((id) => pausedIds.has(id)) || assignedNames.some((name) => pausedNames.has(name))) {
        pausedTables.add(tableId);
        assigned.forEach((id, index) => {
          if (!pausedIds.has(id) && !pausedNames.has(assignedNames[index])) return;
          if (!pausedServers.some((s) => s.id === id)) pausedServers.push({ id, name: assignedNames[index] || id });
        });
      }
    });
  } catch (_) {}
  return { employee, tables, allTables, pausedTables, pausedServers, name: serviceNorm(employeeName(employee.member)) };
}


export { serviceScope };
