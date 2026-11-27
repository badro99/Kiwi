/* Le responsable EN POSTE ne retape pas son code (owner, 27 nov. 2026).
 *
 * Quand un code de gérant ou de propriétaire ouvre une caisse appairée,
 * /api/pin/verify rend en plus une « preuve de poste » : signée par le
 * serveur, liée à CE magasin, à CET appareil appairé et à CETTE personne,
 * valable douze heures au plus. La caisse la garde tant que la même personne
 * tient la caisse (assets/caisse-pairing.js › setStaff), et la présente à la
 * place du code quand un geste protégé demande l'accord d'un responsable :
 * remise, remboursement, annulation, tiroir, espèces, clôture…
 *
 * Ce n'est pas un passe-droit :
 *   · seule une caisse appairée la présente, et seulement l'appareil qui l'a
 *     reçue (le cookie d'appareil est relu, son identifiant comparé) ;
 *   · la ligne d'équipe est RELUE à chaque usage : un code supprimé, ou une
 *     personne qui n'est plus gérant ou propriétaire, ne passe plus ;
 *   · chaque route juge ensuite le droit de la personne pour CE geste
 *     (functions/api/_permissions.js › decide), exactement comme avec un code ;
 *   · la caisse l'oublie dès qu'elle se verrouille ou change de personne.
 * Aucun code n'y figure, et aucun code n'en sort.
 */
import { hmacHex, json, slugMerchant, tillVerification, employeeRoleOpensDashboard, verifyStaffPin } from './_lib.js';

export const SHIFT_PREFIX = 'ks1.';
const SHIFT_TTL_MS = 12 * 3600000;
const SCOPE = 'kiwi-till-shift-v1:';

/* Le contenu est ASCII (slug, identifiant d'appareil, « pin-<uuid> »). */
function b64url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  return atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
}
/* Comparaison à durée constante de deux empreintes hexadécimales. */
function sameHex(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || !a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isShiftProof(value) {
  return typeof value === 'string' && value.startsWith(SHIFT_PREFIX) && value.length <= 1024;
}

/* La preuve, pour un code qui vient d'OUVRIR la caisse (sans acte). Rien pour
   un rôle qui n'ouvre pas le tableau de bord, ni pour un ancien cookie de
   caisse sans identifiant d'appareil : il n'y aurait rien à quoi la lier. */
export async function tillShiftProof(request, env, merchant, staff, now = Date.now()) {
  const secret = env && env.AUTH_SECRET;
  if (!secret || !merchant || !staff || !staff.id || !employeeRoleOpensDashboard(staff.role)) return '';
  const till = await tillVerification(request, env, merchant);
  if (!till.ok || !till.deviceId) return '';
  const payload = b64url(JSON.stringify({ m: merchant, d: till.deviceId, id: String(staff.id), exp: now + SHIFT_TTL_MS }));
  return SHIFT_PREFIX + payload + '.' + await hmacHex(secret, SCOPE + payload);
}

async function readShiftProof(secret, token, now) {
  if (!secret || !isShiftProof(token)) return null;
  const [payload, signature] = token.slice(SHIFT_PREFIX.length).split('.');
  if (!payload || !signature) return null;
  if (!sameHex(signature, await hmacHex(secret, SCOPE + payload))) return null;
  try {
    const body = JSON.parse(unb64url(payload));
    return body && body.m && body.d && body.id && Number.isFinite(body.exp) && body.exp > now ? body : null;
  } catch (_) { return null; }
}

/* La personne de la preuve, relue au registre. Son code peut être rangé sous un
   autre magasin du même compte (un propriétaire) : on l'accepte alors, comme
   verifyStaffPin, s'il s'agit d'un gérant ou d'un propriétaire. */
async function staffOnShift(env, merchant, id) {
  const row = await env.DB.prepare('SELECT id, name, role, merchant FROM staff_pins WHERE id = ?').bind(String(id)).first();
  if (!row) return null;
  if (row.merchant !== merchant) {
    const r = await env.DB.prepare('SELECT merchant, account_id FROM merchant_config WHERE merchant IN (?, ?)')
      .bind(merchant, row.merchant).all();
    const acc = {};
    for (const x of (r && r.results) || []) acc[x.merchant] = x.account_id;
    if (!acc[merchant] || acc[merchant] !== acc[row.merchant]) return null;
  }
  return { id: String(row.id || ''), name: String(row.name || ''), role: String(row.role || '') };
}

/* verifyStaffPin, qui accepte aussi la preuve de poste à la place du code.
   Même forme de réponse : { ok, staff } ou { ok: false, error, status | response }. */
export async function verifyStaffCredential(request, env, merchant, credential, opts) {
  if (!isShiftProof(credential)) return verifyStaffPin(request, env, merchant, credential, opts);
  if (!env || !env.DB || !env.AUTH_SECRET) return { ok: false, error: 'not-configured', status: 503 };
  merchant = slugMerchant(merchant);
  const till = await tillVerification(request, env, merchant);
  if (till.unavailable) return { ok: false, response: json({ error: 'auth-verification-unavailable' }, 503) };
  if (!till.ok || !till.deviceId) return { ok: false, error: 'forbidden-till', status: 403 };
  const proof = await readShiftProof(env.AUTH_SECRET, credential, Date.now());
  if (!proof || proof.m !== merchant || proof.d !== till.deviceId) return { ok: false, error: 'shift-expired', status: 401 };
  let staff;
  try { staff = await staffOnShift(env, merchant, proof.id); } catch (_) { return { ok: false, error: 'staff-unavailable', status: 503 }; }
  if (!staff) return { ok: false, error: 'shift-expired', status: 401 };
  if (!employeeRoleOpensDashboard(staff.role)) return { ok: false, error: 'manager-required', status: 403 };
  return { ok: true, staff, viaShift: true };
}
