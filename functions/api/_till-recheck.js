/* Une caisse refusée par entitledMerchant() l'est-elle vraiment ?
 *
 * entitledMerchant() répond « non » aussi bien quand la preuve de caisse est
 * fausse que quand la lecture du millésime (merchant_config.till_epoch) a
 * échoué un instant. La caisse, elle, lit un 403 comme « cet appareil n'est
 * plus la caisse de ce magasin » et met TOUS ses envois en pause pendant
 * 60 secondes. On relit donc la preuve une fois avant de refuser :
 *   · la base ne répond toujours pas → 503, la caisse réessaie sans pause ;
 *   · la preuve tient → c'est bien la caisse de ce magasin, on continue ;
 *   · pas de preuve, ou preuve refusée → le refus est un vrai refus.
 * tools/till-verify-hiccup-test.mjs tient les trois. */
import { readCookie, TILL_COOKIE, tillVerification, json } from '../auth/_lib.js';

export async function tillRecheck(request, env, asked) {
  if (!readCookie(request, TILL_COOKIE)) return { merchant: '' };
  const till = await tillVerification(request, env, asked);
  if (till && till.unavailable) return { merchant: '', response: json({ error: 'auth-verification-unavailable' }, 503) };
  return { merchant: till && till.ok ? asked : '' };
}
