/* Qui touche au portefeuille de chèques (functions/api/_cheques.js).
 *
 *   · patron (session du compte qui possède le magasin, palier « owner ») et
 *     opérateur Kiwi nommé : tout, chèques reçus ET émis (un chèque émis est
 *     un paiement fournisseur, donc le grand livre du patron) ;
 *   · la même session rouverte par le code d'un gérant (palier « manager ») :
 *     les chèques REÇUS seulement (voir, créer, faire avancer, bordereau),
 *     comme le classement des fournisseurs ; les chèques émis lui restent
 *     invisibles ;
 *   · une caisse appairée du magasin (allowTill) : ENREGISTRER un chèque reçu
 *     à l'encaissement, rien d'autre (ni lire la liste, ni faire avancer) ;
 *   · réception, employé, autre commerçant, anonyme : rien.
 * Le commerçant vient de la requête mais n'est cru qu'après la preuve :
 * ownerMerchant (le compte possède ce magasin), isTillFor (le cookie de caisse
 * est signé pour CE magasin), isOperator (opérateur nommé). Une écriture exige
 * en plus un magasin actif (ni suspendu ni en attente).
 *
 * Rend { kind: 'owner'|'manager'|'operator'|'till', only: ''|'received', name }
 * ou null. `only` borne ce que l'acteur voit et fait ; `name` signe
 * l'historique et vient de la preuve, jamais du corps de la requête (la
 * caisse ajoute le prénom affiché de la caissière, marqué comme tel). */
import { isOperator, isTillFor } from '../../auth/_lib.js';
import { sessionTier } from '../../auth/_session-tier.js';
import { ownerMerchant, storeOperationalState } from '../_private.js';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

async function activeStore(env, merchant) {
  const state = await storeOperationalState(env, merchant);
  return !!(state.ok && !state.suspended && !state.pending);
}

/* « · Prénom » de la fiche dont le code a ouvert la session (staff_pins.name,
   jamais le code) ; rien quand le patron a ouvert avec son propre compte. */
async function staffName(env, merchant, staffId) {
  if (!staffId) return '';
  try {
    const row = await env.DB.prepare('SELECT name FROM staff_pins WHERE id = ?').bind(String(staffId)).first();
    const n = String((row && row.name) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40);
    return n ? ' · ' + n : '';
  } catch (_) { return ''; }
}

export async function chequeActor(request, env, merchant, opts) {
  const write = !!(opts && opts.write);
  if (!env || !env.DB || !SLUG.test(String(merchant || ''))) return null;
  let operator = false;
  try { operator = await isOperator(request, env); } catch (_) { operator = false; }
  if (operator) {
    if (write && !(await activeStore(env, merchant))) return null;
    return { kind: 'operator', only: '', name: 'Opérateur Kiwi' };
  }
  let owned = '';
  try { owned = await ownerMerchant(request, env, merchant, write ? { strict: true } : undefined); } catch (_) { owned = ''; }
  if (owned === merchant) {
    let st = { tier: null };
    try { st = await sessionTier(request, env); } catch (_) { st = { unavailable: true }; }
    if (!st.unavailable) {
      if (st.tier === 'owner') return { kind: 'owner', only: '', name: 'Propriétaire' + await staffName(env, merchant, st.staffId) };
      if (st.tier === 'manager') return { kind: 'manager', only: 'received', name: 'Gérant' + await staffName(env, merchant, st.staffId) };
    }
  }
  if (opts && opts.allowTill) {
    let till = false;
    try { till = await isTillFor(request, env, merchant); } catch (_) { till = false; }
    if (till && (!write || await activeStore(env, merchant))) return { kind: 'till', only: 'received', name: 'Caisse' };
  }
  return null;
}

export async function readBody(request, max = 16384) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > max) return { error: 'payload-too-large' };
  let raw = '';
  try { raw = await request.text(); } catch (_) { return { error: 'bad-json' }; }
  if (raw.length > max) return { error: 'payload-too-large' };
  try {
    const body = JSON.parse(raw || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad-json' };
    return { body };
  } catch (_) { return { error: 'bad-json' }; }
}

