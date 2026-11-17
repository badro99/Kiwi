/* Qui lit les dépenses d'un commerce : le patron (la session du compte qui
 * possède le magasin) et un opérateur Kiwi nommé, pour le support. Personne
 * d'autre : ni une caisse appairée, ni un employé, gérant compris. C'est son
 * argent, pas celui du comptoir (Pasta Corner, 17 nov. 2026). */
import { isOperator } from '../../auth/_lib.js';
import { sessionTierAtLeast } from '../../auth/_session-tier.js';
import { ownerMerchant } from '../_private.js';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export async function expensesReader(request, env, merchant) {
  if (!SLUG.test(String(merchant || ''))) return false;
  try { if (await isOperator(request, env)) return true; } catch (_) { /* pas opérateur */ }
  /* La session du patron déverrouillée par le code d'un gérant ou d'une
     réceptionniste (session_tiers) reste l'appareil du patron, pas le patron. */
  try { if (!(await sessionTierAtLeast(request, env, 'owner'))) return false; } catch (_) { return false; }
  try { return (await ownerMerchant(request, env, merchant)) === merchant; } catch (_) { return false; }
}
