/* Owner: hotel folioActions. Exports named methods below. Reads only the declared scope and browser globals in tools/fixtures/hotel/reception-interfaces.json. */
(window.__kiwiHotelSections ||= {}).folioActions = (scope) => {
'use strict';
function isCustomHotel(...args) { return scope.isCustomHotel.apply(this, args); }
function recordSale(amount, identity, label, method) {
    if (!isCustomHotel() || !(amount > 0)) return false;
    if (method !== 'cash' && method !== 'card') return false;
    const live = window.KiwiLive;
    if (!live?.isOn?.() || !live?.postSale) return false;
    const key = String(identity || ('hotel-' + Date.now())).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 54);
    const result = live.postSale({
      id: 'hotel-' + key, amount: Math.round(amount * 100) / 100, method,
      label: String(label || 'Encaissement hôtel').slice(0, 80), ref: key,
      time: new Date(), channel: 'hotel'
    });
    return result?.ok === true;
  }

return Object.freeze({ recordSale });
};
