// POST /api/price-lists/resolve — le prix côté serveur, d'un article ou d'un panier.
//
//   { merchant, listId?, clientId?, channel?, items: [{ itemKey, variantKey?, qty? }] }
//   → { ok, list: { id, name, isMain }, why, lines: [{ itemKey, variantKey, qty,
//        unitCents, mainCents, source, compareCents?, totalCents }], totalCents }
//
// Le tarif : celui qu'on nomme, sinon celui de la fiche client, sinon celui du
// canal, sinon le principal (`why` dit lequel). Un article sans prix dans le
// tarif retombe sur le principal ; un article inconnu revient sans prix.
// Lecture : patron, opérateur, caisse appairée (tenantFor). Le magasin est
// celui que la session ou la caisse prouve, jamais celui du corps seul.
import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { str, resolveCart, CHANNELS } from '../_price-lists.js';

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad-json' }, 400);
  const merchant = await tenantFor(request, env, str(b.merchant, 64));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const items = Array.isArray(b.items) ? b.items : (b.itemKey ? [{ itemKey: b.itemKey, variantKey: b.variantKey, qty: 1 }] : []);
  if (!items.length) return json({ error: 'no-items' }, 400);
  if (items.length > 500) return json({ error: 'too-many-items' }, 413);
  const channel = CHANNELS.includes(b.channel) ? b.channel : '';
  const out = await resolveCart(env, merchant, { listId: b.listId == null ? '' : str(b.listId, 64), clientId: str(b.clientId, 64), channel }, items);
  if (out.error) return json({ error: out.error }, 404);
  return json({ ok: true, ...out });
}
