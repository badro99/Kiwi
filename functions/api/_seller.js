// Qui a vendu : la personne à qui la vente est attribuée pour les commissions
// vendeurs (functions/api/commissions.js). Une commission, c'est de l'argent :
// le vendeur ne se DÉCLARE pas, il se PROUVE.
//
// · Une vente de l'app employé porte l'employé en service, tiré de son cookie
//   signé (seller_id seul, comme avant : la session ne porte pas de nom).
// · Une vente de caisse porte `body.seller.proof` : la preuve que /api/pin/verify
//   a signée au moment où cette personne a saisi son code sur cette caisse
//   (tillSellerProof). Le serveur en tire l'id et le nom ; un nom écrit en clair
//   dans la requête est ignoré, sinon n'importe quelle caisse ouverte dans un
//   navigateur pourrait créditer ses ventes à qui elle veut.
//
// La preuve vaut un service (16 h), plus trois jours pour une vente restée dans
// la file hors ligne. Jamais un code : seulement l'identité que le vérificateur
// a rendue.

const enc = new TextEncoder();
const SHIFT_MS = 16 * 3600000;
const QUEUE_GRACE_MS = 72 * 3600000;

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

export function cleanSellerName(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/* Signée par /api/pin/verify pour la personne qu'il vient de reconnaître sur une caisse. */
export async function tillSellerProof(secret, merchant, staff, now = Date.now()) {
  const name = cleanSellerName(staff && staff.name);
  if (!secret || !merchant || !staff || !staff.id || !name) return '';
  const payload = b64url(enc.encode(JSON.stringify({ v: 1, merchant: String(merchant), id: String(staff.id).slice(0, 96), name, exp: now + SHIFT_MS })));
  return payload + '.' + await sign(secret, 'kiwi-till-seller-v1:' + payload);
}

export async function readTillSellerProof(token, secret, merchant, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 2048 || token.indexOf('.') < 1) return null;
  const dot = token.indexOf('.');
  const payload = token.slice(0, dot);
  if (!sameHex(token.slice(dot + 1), await sign(secret, 'kiwi-till-seller-v1:' + payload))) return null;
  let body;
  try { body = JSON.parse(new TextDecoder().decode(unb64url(payload))); } catch (_) { return null; }
  if (!body || body.v !== 1 || body.merchant !== merchant || !body.id || !Number.isFinite(body.exp)) return null;
  if (body.exp + QUEUE_GRACE_MS <= now) return null;
  const name = cleanSellerName(body.name);
  return name ? { id: String(body.id).slice(0, 96), name } : null;
}

export async function sellerOf(employee, body, secret, merchant, now = Date.now()) {
  if (employee && employee.session && employee.session.staffId) {
    return { id: String(employee.session.staffId).slice(0, 96), name: '' };
  }
  const s = body && body.seller;
  if (!s || typeof s !== 'object' || typeof s.proof !== 'string') return null;
  try { return await readTillSellerProof(s.proof, secret, merchant, now); } catch (_) { return null; }
}
