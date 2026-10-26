/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · caisse boutique et Maison : une vente que la file refuse repart
 *
 * postSale() répond {ok:true, queued:true} quand la file de Live Link a pris
 * la vente. Toute autre réponse (stockage plein, commerce pas encore résolu au
 * démarrage) était ignorée : le panier se vidait, le ticket sortait, et le
 * serveur n'entendait jamais parler de la vente. La caisse restaurant la garde
 * et la renvoie ; la boutique et Maison font de même, avec ce module.
 *
 * On garde la charge exacte sur la vente, au journal du jour, et on la renvoie
 * plus tard : postSale() en dérive le même identifiant, un renvoi ne compte donc
 * jamais deux fois. Une vente que postSale() écarte exprès (rien à remonter,
 * ticket à zéro) n'est pas retenue : elle repartirait pour rien toutes les
 * minutes. Les ventes retenues partent avant chaque nouvelle vente, la plus
 * ancienne d'abord, pour que la file garde l'ordre de la caisse.
 *
 * Usage, dans la caisse :
 *   const hold = window.KiwiRetailSaleHold.create({
 *     sales: () => SALES, persist: persistDay, isDemo: IS_DEMO, slug: merchantSlug,
 *     onLost: (sale) => toast(...),   // la vente n'a pu être écrite nulle part
 *   });
 *   hold.post(sale, payload);   // à la place de KiwiLive.postSale(payload)
 *   hold.replay();              // au démarrage, chaque minute, au retour du réseau
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function create(ctx) {
    const live = () => window.KiwiLive;
    // Même propriétaire que Live Link, après sa validation habituelle du ticket.
    const enqueue = payload => window.KiwiSaleQueue
      ? window.KiwiSaleQueue.enqueue(payload) : live().postSale(payload);
    const sales = () => (ctx && typeof ctx.sales === 'function' ? ctx.sales() : []) || [];
    /* Faux seulement si l'écriture du journal a ÉCHOUÉ (persist() renvoie
       false ou lève) : un persist() sans valeur de retour reste un succès. */
    const persist = () => { try { return !(ctx && ctx.persist && ctx.persist() === false); } catch (_) { return false; } };
    const slug = () => { try { return (ctx && ctx.slug && ctx.slug()) || ''; } catch (_) { return ''; } };

    function hold(sale, payload, res) {
      if (!sale || !payload) return true;
      if (res && res.ok === true && res.queued === true) {
        if (sale.pendingPost) { delete sale.pendingPost; persist(); }
        return true;
      }
      let unresolved = false;
      try { unresolved = !(live() && live().merchant && live().merchant()); } catch (_) { unresolved = true; }
      if ((res && res.ok === false) || (!res && unresolved)) {
        sale.pendingPost = Object.assign({}, payload, {
          merchant: payload.merchant || slug() || undefined,
          time: +new Date(payload.time || sale.at),
        });
        /* Ni la file ni le journal du jour ne l'ont gardée (stockage plein ou
           indisponible) : la vente ne vit qu'en mémoire et disparaît au
           rechargement. On ne la laisse pas passer pour acceptée : la caisse
           doit le dire (onLost). Elle reste réessayée tant que la page vit. */
        if (!persist()) { try { if (ctx && ctx.onLost) ctx.onLost(sale); } catch (_) {} }
        return false;
      }
      return true;
    }
    function replay() {
      if (ctx && ctx.isDemo) return 0;
      const Live = live();
      if (!Live || !Live.postSale || !Live.isOn || !Live.isOn()) return 0;
      let sent = 0, changed = false;
      sales().slice().reverse().forEach((s) => {   // le plus ancien d'abord : la file garde l'ordre
        if (!s || !s.pendingPost) return;
        if (s.voided) { delete s.pendingPost; changed = true; return; }
        let res = null;
        try { res = enqueue(Object.assign({}, s.pendingPost, { time: new Date(s.pendingPost.time || s.at) })); } catch (_) {}
        if (res && res.ok === true && res.queued === true) { delete s.pendingPost; sent++; changed = true; }
      });
      if (changed) persist();
      return sent;
    }
    function post(sale, payload) {
      replay();
      let res = null;
      try { res = enqueue(payload); } catch (_) { res = { ok: false, reason: 'post-threw' }; }
      hold(sale, payload, res);
      return res;
    }
    return { hold, replay, post };
  }
  window.KiwiRetailSaleHold = { create };
})();

/* ── Ci-dessous, l'ancien assets/loyalty-reserve.js (réuni ici le 22 octobre 2026, corps inchangé). ── */
/* Shared payment gate for boutique and Maison. No local points are burned here. */
(function () {
  'use strict';
  function create(ctx) {
    async function confirm() {
      const liveStorage = window.KiwiLive;
      if (!ctx.isDemo && liveStorage && liveStorage.moneyStorageReady && !(await liveStorage.moneyStorageReady())) {
        const message = 'Paiement suspendu. Stockage indisponible. Ne prenez pas d’argent. Rétablissez le stockage puis réessayez.';
        const lang = window.KiwiCaisseLang;
        if (window.KiwiCaisseToast) window.KiwiCaisseToast(lang && lang.t ? lang.t(message) : message, 10000, 'warn');
        return false;
      }
      const t = ctx.ticket, c = ctx.client, reward = t && t.reward;
      const clients = window.KiwiClients, live = window.KiwiLive;
      if (ctx.isDemo || !reward || !c || reward.clientId !== c.id || !clients) return true;
      if (!navigator.onLine || !live || !live.isOn || !live.isOn() || !live.merchant || !live.merchant()) return true;
      if (!clients.reserveRedemption || !clients.redemptionRef) return true;
      const book = clients.bookId();
      // Keep the intent on the reward across retries, including a timed out request.
      const intent = reward.reservation || (ctx.ticketOwner
        ? ctx.ticketOwner.reserveReward(t, clients.redemptionRef(c.id))
        : (reward.reservation = { ref: clients.redemptionRef(c.id) }));
      if (intent.accepted) return true;
      let timer;
      const result = await Promise.race([
        clients.reserveRedemption(c.id, book, { ref: intent.ref, clientId: c.id }),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 3000); }),
      ]).catch(() => null);
      clearTimeout(timer);
      if (result && result.accepted) {
        if (ctx.ticketOwner) ctx.ticketOwner.acceptReward(intent);
        else intent.accepted = true;
      }
      if (!result || !result.refused) return true;
      if (ctx.ticketOwner) ctx.ticketOwner.removeReward(t);
      else delete t.reward;
      if (ctx.close) ctx.close();
      if (ctx.render) ctx.render();
      if (window.KiwiCaisseToast) window.KiwiCaisseToast('Récompense indisponible. Confirmez le paiement au plein tarif.', 6000, 'warn');
      return false;
    }
    return { confirm };
  }
  window.KiwiLoyaltyReserve = { create };
})();
