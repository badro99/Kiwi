/* /api/store et le palier de la session (functions/auth/_session-tier.js).
 *
 * La session du patron, déverrouillée par une RÉCEPTIONNISTE, ne tient plus les
 * fiches : elle lit l'équipe sans les codes et ne la réécrit pas, ne touche pas
 * aux réglages ni aux autres documents fermés (REDACT, OWNER_EDIT_FEATURES,
 * PARTIAL de store.js). Les réservations restent à elle, entières (contacts des
 * voyageurs) : c'est son travail. Le gérant garde ce qu'il avait. */
import { isTillFor } from '../auth/_lib.js';
import { sessionTierAtLeast } from '../auth/_session-tier.js';

export function storeEditorTier(request, env, feature) {
  if (feature === 'reservations') return true;
  return sessionTierAtLeast(request, env, 'manager');
}

/* L'argent et la paie : sous le palier gérant, la session ne les lit ni ne les
 * écrit. Une caisse appairée garde ses règles (elle lit ce que le comptoir lit).
 * Ce que la caisse lit elle-même (promotions, suppliers) n'y est pas : une caisse
 * ouverte sur la session du patron, au même comptoir, doit continuer à vendre. */
const MANAGER_DOCS = new Set(['payroll', 'costs', 'charges', 'expenses', 'monthreport', 'dayreports',
  'briefing', 'agentactions', 'retention', 'procurement', 'discountpolicy']);

export async function docBelowTier(request, env, merchant, feature) {
  if (!MANAGER_DOCS.has(feature)) return false;
  if (await sessionTierAtLeast(request, env, 'manager')) return false;
  try { return !(await isTillFor(request, env, merchant)); } catch (_) { return true; }
}
