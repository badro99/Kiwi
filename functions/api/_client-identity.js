// Identity-document numbers (passport, CNIE) in the client book.
//
// A paired till reads the whole client book of its store, so before this file
// every boutique, café and épicerie till kept its customers' ID numbers in
// localStorage, though only a hotel's reception records them (police guest
// form, assets/pos-hotel.js check-in). The number now reaches:
//   · any caller of a hotel (its reception till pre-fills check-in);
//   · the owner's own session and named operators, everywhere.
// Every other caller gets an empty number. Fails closed: if the store type
// or the session cannot be read, the number is withheld.
//
// Whoever cannot read the number must not be able to erase it by writing back
// the blanked copy: keepStoredDocument() restores the stored number when such
// a caller sends an empty one (council rating 14, clients C1).

import { activeAccountSession, entitledMerchant, isOperator } from '../auth/_lib.js';
import { isHotelMerchantType } from './_hotel-units.js';

export async function readsIdentityDocuments(request, env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT type FROM merchant_config WHERE merchant = ? LIMIT 1')
      .bind(merchant).first();
    if (isHotelMerchantType(row && row.type)) return true;
  } catch (_) {}
  try {
    const sess = await activeAccountSession(request, env);
    if (sess && sess.aid && await entitledMerchant(request, env, merchant) === merchant) return true;
  } catch (_) {}
  try { if (await isOperator(request, env)) return true; } catch (_) {}
  return false;
}

const parse = (value) => {
  try {
    const out = JSON.parse(value || '{}');
    return out && typeof out === 'object' && !Array.isArray(out) ? out : {};
  } catch (_) { return {}; }
};

/** Blank the document number of one client row's hospitality JSON. */
export function withoutDocumentNumber(hospitality) {
  const h = parse(hospitality);
  if (!h.documentNumber) return hospitality;
  return JSON.stringify({ ...h, documentNumber: '' });
}

/** Incoming hospitality JSON from a caller that cannot read the number:
 *  an empty number keeps the stored one (and its document type). */
export async function keepStoredDocument(env, merchant, id, incoming) {
  const add = parse(incoming);
  if (add.documentNumber) return incoming;
  let stored = {};
  try {
    const row = await env.DB.prepare('SELECT hospitality FROM clients WHERE merchant = ? AND id = ? LIMIT 1')
      .bind(merchant, id).first();
    stored = parse(row && row.hospitality);
  } catch (_) { return incoming; }
  if (!stored.documentNumber) return incoming;
  return JSON.stringify({ ...add, documentNumber: stored.documentNumber, documentType: add.documentType || stored.documentType || '' });
}
