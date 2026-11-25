/* Droits de l'équipe · la preuve d'un GESTE (espèces, tiroir, clôture, remise).
 *
 * /api/pin/verify la signe quand un code couvre l'acte demandé : elle nomme la
 * personne, l'acte (`kind`), et ce que la caisse a montré au moment du code
 * (le montant et le sens d'un mouvement, le pourcentage d'une remise). Elle ne
 * couvre qu'UN fait : la première route qui la consomme y attache la référence
 * du fait (identifiant du mouvement ou de la vente), et toute autre référence
 * est refusée ensuite (staff_permission_proofs).
 *
 * L'heure qui juge est celle où le SERVEUR reçoit le fait, jamais l'heure que
 * la caisse déclare : une preuve vit cinq minutes, plus une marge signée dans
 * la preuve elle-même pour une caisse qui livre en retard après une coupure.
 * Passé ce délai, le fait est inscrit « auteur non prouvé » ; il n'est jamais
 * refusé (l'argent a déjà bougé, functions/api/_permissions.js).
 *
 * Les preuves de remboursement et de stock (functions/auth/_lib.js ›
 * managerRefundProof, managerStockProof) restent les leurs : celle-ci ne sert
 * qu'aux faits accomplis du journal.
 */
const enc = new TextEncoder();
export const ACT_KINDS = new Set(['cash', 'drawer', 'close-day', 'discount']);
export const ACT_LIFE_MS = 5 * 60 * 1000;
export const ACT_LATE_MS = 30 * 60 * 1000;
const DOMAIN = 'kiwi-till-act-v1:';

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
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* Ce que la caisse a montré au moment du code, borné. */
export function actTerms(action) {
  const a = action && typeof action === 'object' ? action : {};
  const kind = String(a.kind || '');
  if (!ACT_KINDS.has(kind)) return null;
  const out = { kind };
  const cents = Number(a.amountCents);
  if (Number.isInteger(cents) && cents > 0 && cents <= 1e9) out.amountCents = cents;
  if (a.move === 'in' || a.move === 'out') out.move = a.move;
  const pct = Number(a.pct);
  if (Number.isFinite(pct) && pct > 0 && pct <= 100) out.pct = Math.round(pct * 10) / 10;
  return out;
}

/* `fixedJti` : un accord du patron (_owner-approvals.js) peut se relire et
   rendre plusieurs copies de sa preuve ; elles portent toutes le même jti, que
   consumeActProof lie au premier fait : une seule sortie d'espèces la consomme. */
export async function tillActProof(secret, merchant, staff, action, now = Date.now(), fixedJti = '') {
  const terms = actTerms(action);
  if (!secret || !merchant || !staff || !staff.id || !terms) return '';
  const jti = /^[A-Za-z0-9_-]{8,40}$/.test(String(fixedJti)) ? String(fixedJti) : b64url(crypto.getRandomValues(new Uint8Array(12)));
  const body = { v: 1, merchant: String(merchant), id: String(staff.id).slice(0, 96), name: String(staff.name || '').slice(0, 80),
    role: String(staff.role || '').slice(0, 40), ...terms, jti, iat: now, exp: now + ACT_LIFE_MS, late: ACT_LATE_MS };
  const payload = b64url(enc.encode(JSON.stringify(body)));
  return payload + '.' + await sign(secret, DOMAIN + payload);
}

/* `received` : l'heure du serveur à la réception du fait. */
export async function readTillActProof(token, secret, merchant, received = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 2048) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  if (!sameText(token.slice(dot + 1), await sign(secret, DOMAIN + payload))) return null;
  let body;
  try { body = JSON.parse(new TextDecoder().decode(unb64url(payload))); } catch (_) { return null; }
  if (!body || body.v !== 1 || body.merchant !== merchant || !body.id || !body.jti || !ACT_KINDS.has(body.kind)) return null;
  if (!Number.isFinite(body.iat) || !Number.isFinite(body.exp) || !Number.isFinite(body.late)) return null;
  if (received > body.exp + Math.min(body.late, ACT_LATE_MS)) return null;
  return body;
}

/* La preuve couvre-t-elle CE fait ? fact : { kind, amountCents?, move?, pct?, at, ref }.
 * La première consommation lie la preuve à `ref` ; rejouer le même fait reste
 * couvert, un autre fait ne l'est pas. */
export async function consumeActProof(env, merchant, token, fact, received = Date.now()) {
  if (!env || !env.DB || !fact || !fact.ref) return null;
  const body = await readTillActProof(token, env.AUTH_SECRET, merchant, received);
  if (!body || body.kind !== fact.kind) return null;
  if (body.move && fact.move && body.move !== fact.move) return null;
  /* Des espèces : la preuve dit le montant montré au responsable, le fait ne peut pas le dépasser. */
  if (fact.kind === 'cash' && !(Number.isFinite(body.amountCents) && Number(fact.amountCents) <= body.amountCents)) return null;
  /* Une remise : la preuve dit le pourcentage OU le montant accordé, et le fait doit tenir dedans.
     Sans l'un ni l'autre, des deux côtés, elle ne couvre rien. */
  if (fact.kind === 'discount') {
    const byPct = Number.isFinite(body.pct) && Number.isFinite(Number(fact.pct)) && Number(fact.pct) <= body.pct + 0.5;
    const byAmount = Number.isFinite(body.amountCents) && Number.isFinite(Number(fact.amountCents)) && Number(fact.amountCents) <= body.amountCents;
    if (!(Number.isFinite(body.pct) ? byPct : byAmount)) return null;
  }
  /* L'heure déclarée doit tomber dans la vie de la preuve (elle ne la prolonge pas : la réception décide ci-dessus). */
  if (Number.isFinite(fact.at) && (fact.at < body.iat - 60000 || fact.at > body.exp + 60000)) return null;
  const ref = String(fact.ref).slice(0, 96);
  try {
    /* Une preuve morte depuis deux jours ne peut plus rien couvrir : sa ligne part. */
    await env.DB.prepare('DELETE FROM staff_permission_proofs WHERE merchant = ? AND used_ts < ?').bind(merchant, received - 2 * 86400000).run();
    await env.DB.prepare('INSERT INTO staff_permission_proofs (merchant, jti, kind, ref, staff_id, used_ts) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(merchant, jti) DO NOTHING')
      .bind(merchant, String(body.jti).slice(0, 40), body.kind, ref, String(body.id).slice(0, 96), received).run();
    const row = await env.DB.prepare('SELECT ref FROM staff_permission_proofs WHERE merchant = ? AND jti = ?').bind(merchant, String(body.jti).slice(0, 40)).first();
    if (!row || String(row.ref) !== ref) return null;
  } catch (_) { return null; }
  return { id: String(body.id), name: String(body.name || ''), role: String(body.role || '') };
}
