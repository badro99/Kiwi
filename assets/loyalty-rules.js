/* GENERATED SHARED KiwiLoyaltyRules BEGIN */
/* Copy of functions/api/_rules-loyalty.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
var KiwiLoyaltyRules = (function () {
  // Loyalty earning, word matching, historical reversals and explicit reward policies.
  const loyaltyOn = (cfg) => !!(cfg && cfg.model && !cfg.auto);
  const pointsFor = (amount, cfg) => Math.max(0,
    Math.floor(amount * Math.max(0, Number(cfg && cfg.amount && cfg.amount.perMad) || 1) + 1e-6));
  const foldName = (v) => String(v || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const qualifyingQty = (cfg, items) => { // linked products by id (renames keep earning), new ones by word
    const want = foldName(cfg && cfg.product && cfg.product.item), ids = (Array.isArray(cfg && cfg.product && cfg.product.ids) ? cfg.product.ids : []).map(String);
    if (!want && !ids.length) return 0;
    return (Array.isArray(items) ? items : []).reduce((n, item) => {
      const name = ' ' + foldName(item && item.name) + ' ', key = String(item && (item.id || item.itemId || item.pid) || '');
      const qty = Math.max(0, Number(item && item.qty) || 0), weighed = /^(weigh|kg|g|l|ml)$/i.test(String(item && item.unit || ''));
      return (key && ids.indexOf(key) >= 0) || (want && name.includes(' ' + want + ' ')) ? n + (weighed ? Number(qty > 0) : Math.floor(qty)) : n;
    }, 0);
  }
  const stampsFor = (cfg, items) => {
    if (!loyaltyOn(cfg)) return 0;
    if (cfg.model === 'visit') return 1;
    if (cfg.model !== 'product') return 0;
    return qualifyingQty(cfg, items);
  }
  const refundFor = (sale, amount, cfg, items, client) => {
    const paid = Number(sale && sale.paid || 0), earned = Number(sale && sale.earned || 0);
    const refunded = Number(sale && sale.refunded || 0), clawed = Number(sale && sale.clawed || 0);
    const take = Math.max(0, Math.min(amount, Math.round((paid - refunded) * 100) / 100));
    const claw = paid > 0 && earned > 0
      ? Math.max(0, Math.min(Math.round(earned * (refunded + take) / paid) - clawed, earned - clawed)) : 0;
    const stampsLeft = Math.max(0, Number(sale && sale.stamped || 0) - Number(sale && sale.unstamped || 0));
    const lines = Array.isArray(items) ? items : [];
    const whole = paid > 0 && take >= Math.round((paid - refunded) * 100) / 100 - 0.004;
    const unstamp = cfg.model === 'product' && lines.length
      ? Math.min(stampsLeft, qualifyingQty(cfg, lines)) : (whole ? stampsLeft : 0);
    return { take, claw, unstamp,
      pointsTake: Math.min(claw, Math.max(0, Number(client.points) || 0)),
      stampsTake: Math.min(unstamp, Math.max(0, Number(client.stamps) || 0)) };
  }
  const rewardDiscount = (reward, clientId, base, units) => {
    if (!reward || reward.clientId !== clientId) return 0;
    if (reward.kind !== 'percent') return reward.kind === 'free' && units.length ? Math.min.apply(null, units) : 0;
    const amount = Math.max(0, +base || 0), percent = Math.min(100, Math.max(0, +reward.value || 0));
    return Math.min(amount, Math.round(amount * percent + 1e-9) / 100); // wave Q: nearest centime, every trade
  }
  return { loyaltyOn, pointsFor, foldName, qualifyingQty, stampsFor, refundFor, rewardDiscount };
})();
/* GENERATED SHARED KiwiLoyaltyRules END */
export const rewardDiscount = (...args) => KiwiLoyaltyRules.rewardDiscount(...args);
