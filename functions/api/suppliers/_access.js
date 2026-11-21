/* Qui touche aux fournisseurs, au grand livre et au livre de caisse : le
 * patron (la session du compte qui possède le magasin, déverrouillée à son
 * palier) et un opérateur Kiwi nommé, pour le support. Personne d'autre : ni
 * une caisse appairée, ni un employé, gérant compris, ni la session du patron
 * rouverte par le code d'un gérant. Même porte que les dépenses
 * (../expenses/_owner.js) : ce sont ses dettes et son argent.
 *
 * Une ÉCRITURE exige en plus un magasin actif (ni suspendu ni en attente),
 * comme tenantFor({ strict }) ; la lecture reste ouverte, un magasin suspendu
 * doit pouvoir consulter ce qu'il doit.
 *
 * Rend l'acteur ({ kind, name }) ou null. Le nom signe les lignes du grand
 * livre : il vient de la session prouvée, jamais du corps de la requête. */
import { isOperator } from '../../auth/_lib.js';
import { sessionTierAtLeast } from '../../auth/_session-tier.js';
import { ownerMerchant, storeOperationalState } from '../_private.js';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export async function ledgerActor(request, env, merchant, opts) {
  const write = !!(opts && opts.write);
  if (!env || !env.DB || !SLUG.test(String(merchant || ''))) return null;
  let operator = false;
  try { operator = await isOperator(request, env); } catch (_) { operator = false; }
  if (operator) {
    if (write) {
      const state = await storeOperationalState(env, merchant);
      if (!state.ok || state.suspended || state.pending) return null;
    }
    return { kind: 'operator', name: 'Opérateur Kiwi' };
  }
  try { if (!(await sessionTierAtLeast(request, env, 'owner'))) return null; } catch (_) { return null; }
  try {
    if ((await ownerMerchant(request, env, merchant, write ? { strict: true } : undefined)) !== merchant) return null;
  } catch (_) { return null; }
  return { kind: 'owner', name: 'Propriétaire' };
}

/* Le corps JSON d'une écriture, borné avant d'être lu. */
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

/* Un montant saisi en dirhams (« 1 250,50 ») ou déjà en centimes. */
export function centsFrom(body) {
  if (body && body.amountCents != null) {
    const n = Number(body.amountCents);
    return Number.isSafeInteger(n) ? n : NaN;
  }
  const raw = String(body && body.amount != null ? body.amount : '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return NaN;
  return Math.round(Number(raw) * 100);
}
