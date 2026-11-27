// GET /api/wallet/card?s=<serial>&t=<token> — the web card's live data, for the
// /carte page (phones without Wallet, and every phone before the certificates
// exist). The token is the card's own; nothing else about the shop's book leaks.
import { json } from '../../auth/_lib.js';
import { cardBySerial } from './_store.js';
import { sameToken } from './_pass.js';
import { loadMerchant } from './_merchant.js';
import { cardView } from './_card.js';
import { stripPath } from './_offers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const q = new URL(request.url).searchParams;
  const card = await cardBySerial(env.DB, q.get('s'));
  if (!card || !sameToken(q.get('t'), card.auth_token)) return json({ error: 'unauthorized' }, 401);
  if (card.revoked) return json({ error: 'revoked' }, 410);
  const m = await loadMerchant(env.DB, card.merchant);
  const c = await env.DB.prepare('SELECT id, name, points, stamps FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(card.merchant, card.client_id).first();
  const view = m && c && cardView({ fidelity: m.fidelity, client: c });
  if (!view) return json({ error: 'gone' }, 410);
  return json({
    merchant: { slug: m.slug, name: m.name, color: m.color, bg: m.bg, address: m.address, phone: m.phone, logo: m.logoUrl ? `/api/wallet/strip/logo-${m.slug}.png` : '' },
    card: { ...view, strip: stripPath(view, m, 2), qr: 'KIWI-C:' + card.client_id, platform: card.platform },
  });
}
