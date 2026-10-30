// Ozon Express · reading the parcels' status back, and what Kiwi does with it.
//
// Owner, 30 Oct 2026:
//   · « Payé » chez Ozon → the delivery counts in revenue. The remaining due
//     is collected through receivables.js › confirmByCarrier, the same capped,
//     idempotent write as every delivery payment ('dlv-ozon-<sale>'), dated the
//     moment Kiwi learns it.
//   · « Retourné » / « Refusé » → nothing moves on its own. The order is
//     flagged in Livraisons; a manager confirms the parcel is back and records
//     the return there (stock comes back then, as for any delivery return).
//   · Delivered but not paid yet → shown, nothing written.
// Parcels whose sale has an Ozon parcel are out of the 15-day auto-confirm.
import { confirmByCarrier } from '../receivables.js';
import { ozonCall, readAccount, readStatus, statusOf, byTracking, FINAL } from './_lib.js';

const CHUNK = 50;
const STALE_MS = 5 * 60 * 1000;

export async function listParcels(env, merchant) {
  try {
    const rs = await env.DB.prepare(`SELECT tracking, sale_id, receiver, phone, city_id, city_name, address, price_cents,
        fee_delivered_cents, fee_returned_cents, fee_refused_cents, status, status_label, status_ts, checked_ts, paid_ts, bl_ref, created_ts
      FROM ozon_parcels WHERE merchant = ? AND tracking NOT LIKE 'pending:%' ORDER BY created_ts DESC LIMIT 500`).bind(merchant).all();
    return (rs.results || []).map(parcelView);
  } catch (_) { return []; }
}

export function parcelView(r) {
  return {
    tracking: String(r.tracking), saleId: String(r.sale_id), receiver: String(r.receiver || ''), phone: String(r.phone || ''),
    cityId: Number(r.city_id) || 0, city: String(r.city_name || ''), address: String(r.address || ''),
    priceCents: Number(r.price_cents) || 0,
    fees: { deliveredCents: Number(r.fee_delivered_cents) || 0, returnedCents: Number(r.fee_returned_cents) || 0, refusedCents: Number(r.fee_refused_cents) || 0 },
    status: String(r.status || 'pending'), statusLabel: String(r.status_label || ''), statusTs: Number(r.status_ts) || 0,
    checkedTs: Number(r.checked_ts) || 0, paidTs: Number(r.paid_ts) || 0, blRef: String(r.bl_ref || ''), createdTs: Number(r.created_ts) || 0,
  };
}

/* Relit chez Ozon les colis encore ouverts de ce commerce. `force` passe
 * outre le délai de cinq minutes (bouton « Actualiser »). */
export async function refreshTracking(env, merchant, { force = false, now = Date.now() } = {}) {
  const account = await readAccount(env, merchant);
  if (!account) return { ok: false, error: 'not-connected' };
  let rows = [];
  try {
    const rs = await env.DB.prepare(`SELECT tracking, sale_id, status, checked_ts, paid_ts FROM ozon_parcels
      WHERE merchant = ? AND tracking NOT LIKE 'pending:%' AND status != 'cancelled' AND NOT (status = 'paid' AND paid_ts > 0)
      ORDER BY checked_ts ASC LIMIT 200`).bind(merchant).all();
    rows = rs.results || [];
  } catch (_) { return { ok: false, error: 'no-table' }; }
  if (!force) rows = rows.filter((r) => now - (Number(r.checked_ts) || 0) >= STALE_MS);
  let checked = 0, paid = 0, changed = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const asked = part.map((r) => String(r.tracking));
    const res = await ozonCall(env, account, 'tracking', { 'tracking-number': asked });
    if (!res.ok) { errors.push(res.error); break; }
    const found = byTracking(res.data, asked);
    for (const row of part) {
      const entry = found.get(String(row.tracking));
      checked += 1;
      if (!entry) {
        await env.DB.prepare('UPDATE ozon_parcels SET checked_ts = ? WHERE merchant = ? AND tracking = ?').bind(now, merchant, row.tracking).run();
        continue;
      }
      const { label, ts } = statusOf(entry);
      const status = label ? readStatus(label) : String(row.status || 'pending');
      if (status !== row.status) changed += 1;
      await env.DB.prepare(`UPDATE ozon_parcels SET status = ?, status_label = ?, status_ts = ?, checked_ts = ?
        WHERE merchant = ? AND tracking = ?`).bind(status, label, ts || now, now, merchant, row.tracking).run();
      if (status === 'paid' && !Number(row.paid_ts)) {
        let wrote = null;
        try {
          wrote = await confirmByCarrier(env, merchant, row.sale_id, {
            collectionId: 'dlv-ozon-' + String(row.sale_id), byId: 'ozon', byName: 'Ozon Express · Payé', ts: now,
          });
        } catch (_) {
          /* L'encaissement n'a pas eu lieu : paid_ts reste à 0 et le prochain
             passage réessaie (l'écriture est idempotente par collectionId). */
          errors.push('collect-failed');
          continue;
        }
        /* Rendu normal, écrit ou rien à recevoir (déjà encaissée à la main) :
           on ne redemande pas à chaque passage. */
        await env.DB.prepare('UPDATE ozon_parcels SET paid_ts = ? WHERE merchant = ? AND tracking = ?').bind(now, merchant, row.tracking).run();
        if (wrote) paid += 1;
      }
    }
  }
  return { ok: !errors.length, checked, changed, paid, error: errors[0] };
}

export { FINAL };
