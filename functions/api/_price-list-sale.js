// Le tarif d'une vente de caisse : qui l'a choisi, et le serveur le vérifie.
//
// Changer de tarif au comptoir (passer un client au prix de gros), c'est
// baisser des prix : il faut un responsable, comme pour une remise. Le
// responsable frappe son code, /api/pin/verify le vérifie (verifyStaffPin) et
// délivre une PREUVE signée liée à ce magasin et à CE tarif, valable quatre
// heures à compter de l'accord. Le code ne quitte jamais D1 et n'entre jamais
// dans la file hors ligne ; la preuve, oui, et elle seule.
//
// La fiche client attachée ne suffit pas : la caisse demande aussi le code
// quand une fiche fait passer le ticket à un tarif plus bas. Une vente au tarif
// d'une fiche sans preuve est signalée « customer-default-no-approval », mais
// seulement si ce tarif baisse vraiment le ticket (lowersSale, la même règle
// que till-price-list.js › lowers) : un tarif égal ou plus cher que le
// principal passe à la caisse sans code, il ne doit pas lever d'alerte ici.
//
// Comme pour la remise hors réglage (sale.js › discount-policy), une vente
// encaissée n'est JAMAIS refusée pour ça : l'argent est déjà dans le tiroir.
// Le tarif est écrit sur la vente tel quel, et l'écart est consigné une fois
// dans sale_audit (« price-list-policy ») pour la console et le patron.

import { clientDefault, findList, listPrices, mainPrices, MAIN_ID } from './_price-lists.js';

const enc = new TextEncoder();
export const PROOF_MS = 4 * 3600000;
const SKEW_MS = 10 * 60000;

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(text) {
  const s = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function sign(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Signée par /api/pin/verify pour un code de responsable (employeeRoleOpensDashboard). */
export async function priceListProof(secret, merchant, staff, listId, now = Date.now()) {
  if (!secret || !merchant || !staff || !staff.id || typeof listId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(listId)) return '';
  const payload = b64url(enc.encode(JSON.stringify({
    v: 1, merchant: String(merchant), list: listId, id: String(staff.id).slice(0, 96),
    name: String(staff.name || '').slice(0, 80), role: String(staff.role || '').slice(0, 40), iat: now,
  })));
  return payload + '.' + await sign(secret, 'kiwi-price-list-v1:' + payload);
}

/* La preuve, si elle est signée, de CE magasin, de CE tarif, et que la vente
 * tombe dans sa fenêtre (heure de la vente, pas heure d'arrivée : une vente
 * restée hors ligne trois heures garde son accord). */
export async function readPriceListProof(token, secret, merchant, listId, saleTs) {
  if (!secret || typeof token !== 'string' || token.length > 2048 || token.indexOf('.') < 1) return null;
  const dot = token.indexOf('.');
  const payload = token.slice(0, dot);
  if (!sameHex(token.slice(dot + 1), await sign(secret, 'kiwi-price-list-v1:' + payload))) return null;
  let body;
  try { body = JSON.parse(new TextDecoder().decode(unb64url(payload))); } catch (_) { return null; }
  if (!body || body.v !== 1 || body.merchant !== merchant || body.list !== listId || !Number.isFinite(body.iat)) return null;
  const at = Number(saleTs);
  if (!Number.isFinite(at) || at < body.iat - SKEW_MS || at > body.iat + PROOF_MS) return null;
  return { id: String(body.id), name: String(body.name || ''), role: String(body.role || '') };
}

/* Un tarif « baisse » une vente quand un article y coûte moins qu'au prix
 * principal (un article offert compte). Si la vente porte ses lignes avec
 * l'id de l'article, on juge le panier lui-même ; sinon, le tarif entier, comme
 * la caisse le fait avant de connaître le panier. Dans le doute (lecture
 * impossible), on le tient pour plus bas : mieux vaut une alerte de trop. */
export async function lowersSale(env, merchant, list, lines) {
  try {
    const main = await mainPrices(env, merchant);
    const prices = await listPrices(env, list);
    const below = (k) => { const c = prices.get(k + '|'), m = main.get(k); return c != null && !!m && m.cents > 0 && c < m.cents; };
    const ids = (Array.isArray(lines) ? lines : []).slice(0, 500)
      .map((l) => String((l && (l.i ?? l.itemId ?? l.item_id ?? l.id)) || '')).filter((k) => main.has(k));
    if (ids.length) return ids.some(below);
    return [...prices.keys()].some((k) => below(k.slice(0, -1)));
  } catch (_) { return true; }
}

/* Appelée par _sale-stamp.js une fois la vente écrite. Au mieux : une erreur
 * ici ne défait jamais la vente. */
export async function stampPriceList(env, merchant, saleId, body) {
  const listId = typeof body?.priceListId === 'string' ? body.priceListId.trim().slice(0, 64) : '';
  if (!listId || listId === MAIN_ID) return;
  try {
    await env.DB.prepare('UPDATE sales SET price_list_id = COALESCE(price_list_id, ?) WHERE merchant = ? AND id = ?')
      .bind(listId, merchant, saleId).run();
  } catch (_) { return; /* colonne pas encore migrée : la vente reste au prix encaissé */ }
  let verdict = null;
  try {
    const list = await findList(env, merchant, listId, { archived: true });
    const sale = await env.DB.prepare('SELECT amount_cents, method, ref, ts FROM sales WHERE merchant = ? AND id = ?').bind(merchant, saleId).first();
    const ts = sale ? Number(sale.ts) : Date.now();
    // La fiche client n'est pas une autorisation : n'importe quelle caissière peut
    // attacher la fiche d'un grossiste. Seule la preuve signée d'un code
    // responsable compte ; sans elle, la vente est signalée (jamais refusée).
    const viaClient = (await clientDefault(env, merchant, body.clientId)) === listId;
    if (!list) verdict = { code: 'unknown-list' };
    else if (await readPriceListProof(body.priceListApproval, env.AUTH_SECRET, merchant, listId, ts)) verdict = null;
    else if (body.priceListApproval) verdict = { code: 'approval-invalid' };
    else if (await lowersSale(env, merchant, list, body.lines)) verdict = { code: viaClient ? 'customer-default-no-approval' : 'no-approval' };
    if (!verdict || !sale) return;
    const note = (list ? 'Tarif « ' + list.name + ' »' : 'Tarif inconnu')
      + (verdict.code === 'unknown-list' ? ' introuvable' : viaClient ? ' (fiche client) sans code responsable' : ' sans code responsable');
    await env.DB.prepare(
      `INSERT INTO sale_audit (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
       SELECT ?, ?, 'price-list-policy', ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'price-list-policy')`
    ).bind(merchant, saleId, verdict.code, note.slice(0, 200), Math.round((Number(sale.amount_cents) || 0) / 100), Number(sale.amount_cents) || 0,
      String(sale.method || ''), String(sale.ref || ''), ts, JSON.stringify({ priceListId: listId }), Date.now(), merchant, saleId).run();
  } catch (_) { /* the sale stands; the flag is best effort */ }
}
