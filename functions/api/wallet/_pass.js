// One card row → its signed .pkpass, from the live client balance.
import { loadMerchant } from './_merchant.js';
import { cardView, passJson } from './_card.js';
import { passImages } from './_images.js';
import { buildPkpass } from './_pkpass.js';

export function sameToken(a, b) {
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0 && a.length >= 16;
}

export async function cardPass(env, card, baseUrl) {
  const m = await loadMerchant(env.DB, card.merchant);
  if (!m) return null;
  const c = await env.DB.prepare('SELECT id, name, points, stamps FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(card.merchant, card.client_id).first();
  const view = c && cardView({ fidelity: m.fidelity, client: c });
  if (!view) return null;
  const pass = passJson({ view, card: { serial: card.serial, authToken: card.auth_token, clientId: card.client_id }, merchant: m, env, baseUrl });
  return buildPkpass({ pass, images: await passImages({ merchant: m, view }), env });
}
