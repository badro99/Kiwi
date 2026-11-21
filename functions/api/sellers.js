// GET /api/sellers?merchant=<slug>
//
// Les vendeurs que la caisse propose à l'encaissement, dans un commerce où une
// seule caissière encaisse pour plusieurs vendeurs (kiwi-admin « Vendeur choisi
// à l'encaissement », features.sellerPicker, avec sellerCommissions).
//
// Un vendeur, ici, c'est une fiche Équipe active qui a un taux de commission :
// le propriétaire n'a rien d'autre à régler. La réponse ne porte que l'id et le
// nom, jamais le taux (c'est de la paie) ni un code.
//
// Accès : le propriétaire, ou la caisse appairée de ce commerce.

import { json, entitledMerchant } from '../auth/_lib.js';
import { memberName, memberRate } from './_commissions.js';
import { readTeamMembers, sellerFeatures } from './_seller.js';

export function sellerRoster(members) {
  const seen = new Set();
  return (Array.isArray(members) ? members : [])
    .filter((m) => m && m.id && !m.deleted && memberRate(m) != null && memberName(m))
    .map((m) => ({ id: String(m.id).slice(0, 96), name: memberName(m).slice(0, 80) }))
    .filter((m) => !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function onRequestGet({ request, env }) {
  const asked = String(new URL(request.url).searchParams.get('merchant') || '').slice(0, 64);
  if (!env || !env.DB) return json({ merchant: '', sellers: [] });
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ merchant: '', sellers: [] }, 403);
  if (!(await sellerFeatures(env, merchant)).picker) return json({ merchant, error: 'feature-off', sellers: [] }, 403);
  return json({ merchant, sellers: sellerRoster(await readTeamMembers(env, merchant)) });
}
