/* La RÉCEPTION d'un hôtel travaille dans le tableau de bord, pas à la caisse
 * (owner, 9 Nov 2026) : arrivées, chambres, séjours, ménage, notes clients.
 * Elle y entre avec son propre code, dans une vue réduite à ces pages
 * (assets/reception-view.js) ; la vue patron ne change pas.
 * Volontairement HORS de employeeRoleOpensDashboard : cette fonction-là vaut
 * aussi accord de responsable (remboursement, avoir, annulation pressing,
 * chambres en masse). Un code de réceptionniste ouvre la vue réception et
 * n'approuve rien. Même liste que assets/staff-roles.js › idOf → 'reception'. */
export function employeeRoleOpensReceptionView(value) {
  /* Même normalisation que _lib.js › normEmployeeRole (accents, apostrophes,
   * espaces) ; recopiée pour ne pas importer _lib.js en retour. */
  let role = String(value || '').trim().toLowerCase();
  try { role = role.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  role = role.replace(/[’`´]/g, "'").replace(/\s+/g, ' ');
  return new Set(['receptionniste', 'reception', 'agent de reception']).has(role);
}
