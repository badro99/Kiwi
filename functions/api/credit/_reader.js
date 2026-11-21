/* Qui lit et règle le carnet de crédit du patron : la session du compte qui
 * possède le magasin, déverrouillée au moins au palier gérant (un plafond se
 * pose au palier patron), et un opérateur Kiwi nommé, pour le support. Ni une
 * caisse appairée ni un employé : le comptoir a sa route, credit/till.js.
 * Même porte que les dépenses (functions/api/expenses/_owner.js). */
import { isOperator } from '../../auth/_lib.js';
import { sessionTierAtLeast } from '../../auth/_session-tier.js';
import { ownerMerchant } from '../_private.js';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/* '' quand l'appelant ne peut pas ; sinon le magasin. */
export async function creditReader(request, env, merchant, need = 'manager') {
  if (!SLUG.test(String(merchant || ''))) return '';
  try { if (await isOperator(request, env)) return merchant; } catch (_) { /* pas opérateur */ }
  try { if (!(await sessionTierAtLeast(request, env, need))) return ''; } catch (_) { return ''; }
  try { return (await ownerMerchant(request, env, merchant)) === merchant ? merchant : ''; } catch (_) { return ''; }
}
