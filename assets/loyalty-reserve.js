/* Shared payment gate for boutique and Maison. No local points are burned here. */
(function () {
  'use strict';
  function create(ctx) {
    async function confirm() {
      const t = ctx.ticket, c = ctx.client, reward = t && t.reward;
      const clients = window.KiwiClients, live = window.KiwiLive;
      if (ctx.isDemo || !reward || !c || reward.clientId !== c.id || !clients) return true;
      if (!navigator.onLine || !live || !live.isOn || !live.isOn() || !live.merchant || !live.merchant()) return true;
      if (!clients.reserveRedemption || !clients.redemptionRef) return true;
      const book = clients.bookId();
      // Keep the intent on the reward across retries, including a timed out request.
      const intent = reward.reservation || (reward.reservation = { ref: clients.redemptionRef(c.id) });
      if (intent.accepted) return true;
      let timer;
      const result = await Promise.race([
        clients.reserveRedemption(c.id, book, { ref: intent.ref, clientId: c.id }),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 3000); }),
      ]).catch(() => null);
      clearTimeout(timer);
      if (result && result.accepted) intent.accepted = true;
      if (!result || !result.refused) return true;
      delete t.reward;
      if (ctx.close) ctx.close();
      if (ctx.render) ctx.render();
      if (window.KiwiCaisseToast) window.KiwiCaisseToast('Récompense indisponible. Confirmez le paiement au plein tarif.', 6000, 'warn');
      return false;
    }
    return { confirm };
  }
  window.KiwiLoyaltyReserve = { create };
})();
