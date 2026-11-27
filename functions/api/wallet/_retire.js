// A client deleted from the book takes their Wallet cards with them: the rows
// are revoked (_store.js), and each Google card is switched INACTIVE with the
// first name wiped, so a customer's name does not stay on Google's servers on
// an active pass. Apple passes live on the phone only; their web service stops
// answering for a revoked card. Fail-soft: run after the answer.
import { googleConfigured, patchGoogleObject, objectId } from './_google.js';

export async function retireGoogleCards(env, merchant, clientId) {
  if (!env || !env.DB || !googleConfigured(env)) return 0;
  const rows = (await env.DB.prepare("SELECT serial FROM wallet_cards WHERE merchant = ? AND client_id = ? AND platform = 'google'")
    .bind(merchant, clientId).all()).results || [];
  let done = 0;
  for (const r of rows) {
    try {
      const st = await patchGoogleObject(env, objectId(env, r.serial), { state: 'INACTIVE', accountName: 'Client', textModulesData: [] });
      if (st >= 200 && st < 300) done++;
    } catch (_) { /* the next delete or a manual clean-up catches it */ }
  }
  return done;
}
