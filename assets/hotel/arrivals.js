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
    /* B22 · Past the check-out hour (11:00, as online booking states it), a guest still in
       house on their departure day is late too. Same Casablanca clock as the caller's « today ». */
    let lateToday = false;
    try {
      const parts = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const part = (type) => parts.find((x) => x.type === type)?.value;
      lateToday = `${part('year')}-${part('month')}-${part('day')}` === today && +part('hour') >= 11;
    } catch (_) {}
    stays.forEach((b) => {
      if (!b?.hotel || ['cancelled', 'no_show'].includes(b.status)) return;
      const h = b.hotel;
      if (h.checkIn === day) buckets.arrivals.push(b);
      if (h.checkOut === day) buckets.departures.push(b);
      // This is current presence, not a forecast inferred from booking dates.
      if (b.status === 'checked_in') buckets.inhouse.push(b);
      if ((b.status === 'checked_in' && (h.checkOut < today || (lateToday && h.checkOut === today))) ||
          (['requested', 'confirmed'].includes(b.status) && h.checkIn < today)) buckets.attention.push(b);
    });
    return buckets;
  }

async function cuStayStatus(id, status, force = false, pin = '') {
    const slug = cuMerchantSlug();
    if (!slug || !id) return false;
    try {
      const res = await (await import('./request.mjs').catch(() => { throw new Error(tx('Chargement impossible. Réessayez.')); })).hotelRequest('/api/hotel/stays', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', merchant: slug, id, status, force, pin }) }, tx);
      const data = await res.json().catch(() => ({}));
      if (cuMerchantSlug() !== slug) return false;
      if (res.status === 409 && data.error === 'stay-unpaid' && !force) {
        const code = await (await import('./checkout-proof.mjs')).checkoutProof(scope.K(), tx, cuDraftMoney(data.owedCents));
        if (code !== null && cuMerchantSlug() === slug) return cuStayStatus(id, status, true, code);
      }
      if (!res.ok && force) scope.toast(tx('Code manager refusé ou vérification indisponible.'), { type: 'warn' });
      if (res.ok && data.booking) { try { cuStayCache().set(data.booking.id, data.booking); } catch (_) {} cuStaysChanged(); return true; }
    } catch (error) { scope.toast(error.message, { type: 'warn' }); }
    return false;
  }

async function cuStayCancel(id) {
    const slug = cuMerchantSlug();
    if (!slug || !id) return false;
    await cuStayStatus(id, 'confirmed');
    if (cuMerchantSlug() !== slug) return false;
    try {
      const res = await (await import('./request.mjs').catch(() => { throw new Error(tx('Chargement impossible. Réessayez.')); })).hotelRequest('/api/hotel/stays', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', merchant: slug, id }) }, tx);
      const data = await res.json().catch(() => ({}));
      if (cuMerchantSlug() !== slug) return false;
      if (res.ok && data.booking) { try { cuStayCache().set(data.booking.id, data.booking); } catch (_) {} cuStaysChanged(); return true; }
    } catch (error) { scope.toast(error.message, { type: 'warn' }); }
    return false;
  }

return Object.freeze({ cuReceptionBuckets, cuStayStatus, cuStayCancel });
};
