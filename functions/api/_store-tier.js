/* /api/store et le palier de la session (functions/auth/_session-tier.js).
 *
 * La session du patron, déverrouillée par une RÉCEPTIONNISTE, ne tient plus les
 * fiches : elle lit l'équipe sans les codes et ne la réécrit pas, ne touche pas
 * aux réglages ni aux autres documents fermés (REDACT, OWNER_EDIT_FEATURES,
 * PARTIAL de store.js). Les réservations restent à elle, entières (contacts des
 * voyageurs) : c'est son travail. Le gérant garde ce qu'il avait. */
import { isTillFor } from '../auth/_lib.js';
import { sessionTierAtLeast } from '../auth/_session-tier.js';
import { expensesReader } from './expenses/_owner.js';
import { sessionMay } from './_permissions.js';

/* Les droits par personne (functions/api/_permissions.js) ne peuvent ici que
 * RESTREINDRE : le document `team` porte les codes, et qui l'écrit le lit en
 * entier. Un gérant à qui le patron retire « Gérer l'équipe » ne le tient plus ;
 * personne sous le palier gérant ne le gagne par un droit. */
export async function storeEditorTier(request, env, feature) {
  if (feature === 'reservations') return true;
  const tierOk = await sessionTierAtLeast(request, env, 'manager');
  if (!tierOk || feature !== 'team') return tierOk;
  const may = await sessionMay(request, env, '', 'team.manage', true);
  return !!may.ok;
}

/* L'argent et la paie : sous le palier gérant, la session ne les lit ni ne les
 * écrit. Une caisse appairée garde ses règles (elle lit ce que le comptoir lit).
 * Ce que la caisse lit elle-même (promotions, suppliers) n'y est pas : une caisse
 * ouverte sur la session du patron, au même comptoir, doit continuer à vendre. */
const MANAGER_DOCS = new Set(['payroll', 'costs', 'charges', 'expenses', 'monthreport', 'dayreports',
  'briefing', 'agentactions', 'retention', 'procurement', 'discountpolicy']);

const DOC_READ_PERMS = { payroll: 'team.payroll', costs: 'stock.value' };

export async function docBelowTier(request, env, merchant, feature) {
  /* Les dépenses du patron : sa session ou un opérateur Kiwi, ni caisse ni
     employé, gérant compris (functions/api/expenses/_owner.js). */
  if (feature === 'expenses') return !(await expensesReader(request, env, merchant));
  if (!MANAGER_DOCS.has(feature)) return false;
  if (await sessionTierAtLeast(request, env, 'manager')) {
    /* Au palier gérant, les droits par personne peuvent retirer la paie et les
       coûts (prix d'achat) ; ils ne donnent rien sous ce palier. */
    const perm = DOC_READ_PERMS[feature];
    if (!perm) return false;
    const may = await sessionMay(request, env, merchant, perm, true);
    return !may.ok;
  }
  try { return !(await isTillFor(request, env, merchant)); } catch (_) { return true; }
}
