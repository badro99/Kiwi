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
        try { res = Live.postSale(Object.assign({}, s.pendingPost, { time: new Date(s.pendingPost.time || s.at) })); } catch (_) {}
        if (res && res.ok === true && res.queued === true) { delete s.pendingPost; sent++; changed = true; }
      });
      if (changed) persist();
      return sent;
    }
    function post(sale, payload) {
      replay();
      let res = null;
      try { res = live().postSale(payload); } catch (_) { res = { ok: false, reason: 'post-threw' }; }
      hold(sale, payload, res);
      return res;
    }
    return { hold, replay, post };
  }
  window.KiwiRetailSaleHold = { create };
})();
