/* Owner: hotel arrivals. Exports named methods below. Reads only the declared scope and browser globals in tools/fixtures/hotel/reception-interfaces.json. */
(window.__kiwiHotelSections ||= {}).arrivals = (scope) => {
'use strict';
function cuDraftMoney(...args) { return scope.cuDraftMoney.apply(this, args); }
function cuMerchantSlug(...args) { return scope.cuMerchantSlug.apply(this, args); }
function cuStayCache(...args) { return scope.cuStayCache.apply(this, args); }
function cuStaysChanged(...args) { return scope.cuStaysChanged.apply(this, args); }
function tx(...args) { return scope.tx.apply(this, args); }
function cuReceptionBuckets(stays, day, today) {
    const buckets = { arrivals: [], departures: [], inhouse: [], attention: [] };
    stays.forEach((b) => {
      if (!b?.hotel || ['cancelled', 'no_show'].includes(b.status)) return;
      const h = b.hotel;
      if (h.checkIn === day) buckets.arrivals.push(b);
      if (h.checkOut === day) buckets.departures.push(b);
      // This is current presence, not a forecast inferred from booking dates.
      if (b.status === 'checked_in') buckets.inhouse.push(b);
      if ((b.status === 'checked_in' && h.checkOut < today) ||
          (['requested', 'confirmed'].includes(b.status) && h.checkIn < today)) buckets.attention.push(b);
    });
    return buckets;
  }

async function cuStayStatus(id, status, force = false) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return false;
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', merchant: slug, id, status, force }) });
      const data = await res.json().catch(() => ({}));
      if (cuMerchantSlug() !== slug) return false;
      if (res.status === 409 && data.error === 'stay-unpaid' && !force && confirm(tx('Il reste {amount} MAD à régler. Confirmer le départ avec ce solde impayé ?', { amount: cuDraftMoney(data.owedCents) }))) return cuStayStatus(id, status, true);
      if (res.ok && data.booking) { try { cuStayCache().set(data.booking.id, data.booking); } catch (_) {} cuStaysChanged(); return true; }
    } catch (_) {}
    return false;
  }

async function cuStayCancel(id) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return false;
    await cuStayStatus(id, 'confirmed');
    try {
      const res = await fetch('/api/hotel/stays', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', merchant: slug, id }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.booking) { try { cuStayCache().set(data.booking.id, data.booking); } catch (_) {} cuStaysChanged(); return true; }
    } catch (_) {}
    return false;
  }

return Object.freeze({ cuReceptionBuckets, cuStayStatus, cuStayCancel });
};
