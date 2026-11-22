/* Who works the floor, from the team sheet's job title (else department).
 * « Commis » is a helper whose post is its department: a commis of the Bar or
 * the Salle serves tables, a kitchen commis does not (Browse, 22 Nov 2026).
 * Mirror: assets/staff-roles.js › isService, held by tools/commis-floor-test.mjs.
 * Own module (like _reception.js) so _lib.js stays under its entry-point pin
 * (tools/controller-interfaces.json). */
const FLOOR_ROLES = new Set([
  'serveur', 'chef de rang', "maitre d'hotel", 'sommelier', 'barman',
  "hote d'accueil", 'salle', 'service', 'manager', 'proprietaire',
]);
/* Même normalisation que _lib.js › normEmployeeRole ; recopiée pour ne pas
 * importer _lib.js en retour. */
const norm = (value) => {
  let s = String(value || '').trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {}
  return s.replace(/[’`´]/g, "'").replace(/\s+/g, ' ');
};
export function employeeWorksFloor(fn, department) {
  const role = norm(fn || department);
  if (role === 'commis') return ['bar', 'salle', 'service', 'barman', 'serveur'].includes(norm(department));
  return FLOOR_ROLES.has(role);
}
