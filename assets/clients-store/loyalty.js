  /* GENERATED SHARED KiwiLoyaltyRules BEGIN */
  /* Copy of functions/api/_rules-loyalty.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiLoyaltyRules = (function () {
    // Loyalty earning, word matching, historical reversals and explicit reward policies.
    const loyaltyOn = (cfg) => !!(cfg && cfg.model && !cfg.auto);
    const pointsFor = (amount, cfg) => Math.max(0,
      Math.floor(amount * Math.max(0, Number(cfg && cfg.amount && cfg.amount.perMad) || 1) + 1e-6));
    const foldName = (v) => String(v || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const qualifyingQty = (cfg, items) => {
      const want = foldName(cfg && cfg.product && cfg.product.item);
      if (!want) return 0;
      return (Array.isArray(items) ? items : []).reduce((n, item) => {
        const name = ' ' + foldName(item && item.name) + ' ';
        return name.includes(' ' + want + ' ') ? n + Math.max(0, Math.round(Number(item && item.qty) || 0)) : n;
      }, 0);
    }
    const stampsFor = (cfg, items) => {
      if (!loyaltyOn(cfg)) return 0;
      if (cfg.model === 'visit') return 1;
      if (cfg.model !== 'product') return 0;
      return Array.isArray(items) && items.length ? qualifyingQty(cfg, items) : 1;
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
  // record a purchase / visit against a client and accrue fidelity.
  //   opts.amount  → MAD spent (amount model)
  //   opts.visit   → count a visit toward a stamp card (visit / product model)
  // returns { client, rewardReady:bool } — rewardReady when a stamp card fills.
  function recordPurchase(id, opts, book) {
    book = book || bookId();
    opts = opts || {};
    var d = readBook(book);
    var rec = d.list.filter(function (c) { return c.id === id; })[0];
    if (!rec) return null;
    var cfg = config(book);
    var amount = money(opts.amount);
    var saleRef = String(opts.saleRef || '');
    var eventKey = String(opts.eventRef || opts.saleId || saleRef).replace(/[^A-Za-z0-9:._-]/g, '').slice(0, 96);
    var ref = eventKey ? ('purchase:' + id + ':' + eventKey) : '';
    /* A browser callback can be replayed after a slow payment close.  Refuse
     * the duplicate before changing local totals; the API applies the same
     * idempotency rule once the event reaches D1. */
    if ((ref && purchaseRead(book).some(function (event) { return event.ref === ref; }))
        || (saleRef && Array.isArray(rec.history) && rec.history.some(function (row) { return row && row.ref === saleRef; }))) {
      return { client: rec, rewardReady: false, replayed: true };
    }
    rec.visits = (rec.visits || 0) + 1;
    rec.lastSeen = now();
    if (!rec.firstSeen) rec.firstSeen = now();
    if (amount > 0) rec.spend = (rec.spend || 0) + amount;
    if (!Array.isArray(rec.history)) rec.history = [];
    const detail = {
      ref: saleRef, ts: +opts.createdAt || now(), amount,
      method: String(opts.method || '').slice(0, 32),
      items: (Array.isArray(opts.items) ? opts.items : []).slice(0, 100).map(function (item) {
        return { name: String(item && item.name || '').slice(0, 120), qty: clientQuantity(item && item.qty), total: money(item && item.total) };
      }),
    };
    rec.history = [detail].concat(rec.history.filter(function (row) {
      return !(detail.ref && row && row.ref === detail.ref);
    }));

    var rewardReady = false;
    var delta = { points: 0, stamps: 0, visits: 1, spend: amount };
    if (!loyaltyOn(book)) {
      // Pas de programme choisi : le passage compte, la fidélité non.
    } else if (cfg.model === 'amount') {
      delta.points = KiwiLoyaltyRules.pointsFor(amount, cfg);
      rec.points = (rec.points || 0) + delta.points;
      var thr = (cfg.amount && cfg.amount.threshold) || 100;
      rewardReady = thr > 0 && rec.points >= thr;
    } else {
      // visit → one stamp per visit; product → one per qualifying item bought.
      var target = (cfg.model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target)) || 10;
      delta.stamps = KiwiLoyaltyRules.stampsFor(cfg, opts.items);
      rec.stamps = (rec.stamps || 0) + delta.stamps;
      rewardReady = rec.stamps >= target;
    }
    rec.updated = now();
    writeBook(d, book);
    /* The sale already has a durable UUID.  Reuse it as the purchase-event key
     * so a checkout callback replay, a page refresh, or an offline retry cannot
     * add the same visit/spend twice.  Older callers without a sale key retain
     * the historical random fallback. */
    ref = ref || ('purchase:' + id + ':' + rec.updated + ':' + Math.abs(hash(String(Math.random()))).toString(36));
    var event = { kind: 'purchase', ref: ref, clientId: id, amount: amount, points: delta.points,
      stamps: delta.stamps, visits: delta.visits, spend: delta.spend, created: rec.updated,
      method: detail.method, items: detail.items, saleRef: detail.ref };
    purchaseAdd(book, event);
    purchasePush(book, event);
    return { client: rec, rewardReady: rewardReady };
  }

  /* Un retour contre avoir reprend la dépense et les points de CE ticket : sans
   * cela, l'achat comptait, puis l'avoir dépensé comptait une seconde fois. Même
   * registre que les achats (clé « refund: »), même file hors ligne : le serveur
   * plafonne à ce que le ticket a réellement rapporté. La projection locale
   * utilise ce même historique, complété des événements encore hors ligne. */
  function recordRefund(id, opts, book) {
    book = book || bookId();
    opts = opts || {};
    var d = readBook(book);
    var rec = d.list.filter(function (c) { return c.id === id; })[0];
    if (!rec) return null;
    var amount = money(opts.amount);
    var saleRef = String(opts.saleRef || '').slice(0, 80);
    var key = String(opts.eventRef || '').replace(/[^A-Za-z0-9:._-]/g, '').slice(0, 96);
    if (!(amount > 0) || !saleRef || !key) return null;
    var ref = 'refund:' + id + ':' + key;
    if (purchaseRead(book).some(function (event) { return event.ref === ref; })) return { client: rec, replayed: true };
    var cfg = config(book);
    var sale = Object.assign({ paid: 0, earned: 0, stamped: 0, refunded: 0, clawed: 0, unstamped: 0 },
      rec.loyaltySales && Object.hasOwn(rec.loyaltySales, saleRef) ? rec.loyaltySales[saleRef] : null);
    purchaseRead(book).forEach(function (event) {
      if (event.clientId !== id || event.saleRef !== saleRef) return;
      var refund = event.kind === 'refund';
      sale[refund ? 'refunded' : 'paid'] += refund ? -event.amount : event.amount;
      sale[refund ? 'clawed' : 'earned'] += refund ? -event.points : event.points;
      sale[refund ? 'unstamped' : 'stamped'] += refund ? -event.stamps : event.stamps;
    });
    var fullReturn = sale.paid > 0 && Math.round(amount * 100) >= Math.round(sale.paid * 100) - Math.round(sale.refunded * 100);
    var reversal = KiwiLoyaltyRules.refundFor(sale, amount, cfg, fullReturn ? [] : opts.items, rec);
    var take = reversal.take, claw = reversal.pointsTake, unstamp = reversal.stampsTake;
    rec.spend = Math.max(0, money((rec.spend || 0) - take));
    rec.points = Math.max(0, Number(rec.points || 0) - claw);
    rec.stamps = Math.max(0, Number(rec.stamps || 0) - unstamp);
    rec.updated = now();
    writeBook(d, book);
    /* `amount` est ce que la caisse demande (le serveur plafonne) ; `spend` et
       `points` ne sont que l'estimation locale, rejouée tant que le serveur n'a
       pas répondu. Un retour estimé à 0 ici part quand même, sinon il ne serait
       jamais acquitté. */
    var event = { kind: 'refund', ref: ref, clientId: id, amount: -amount, points: -claw, stamps: -unstamp, visits: 0,
      spend: -take, created: rec.updated, method: 'retour', saleRef: saleRef,
      items: (Array.isArray(opts.items) ? opts.items : []).slice(0, 100).map(function (item) {
        return { name: String(item && item.name || '').slice(0, 120), qty: clientQuantity(item && item.qty), total: money(item && item.total) };
      }) };
    purchaseAdd(book, event);
    purchasePush(book, event);
    return { client: rec, spend: -take, points: -claw, stamps: -unstamp };
  }

  // burn a filled stamp card (staff hands over the reward).
  function redeem(id, book, reservation) {
    book = book || bookId();
    var d = readBook(book);
    var rec = d.list.filter(function (c) { return c.id === id; })[0];
    if (!rec) return null;
    if (!loyaltyOn(book)) return rec;       // aucun programme : rien à remettre
    var cfg = config(book);
    var pointsDelta = 0, stampsDelta = 0;
    if (cfg.model === 'amount') {
      var thr = (cfg.amount && cfg.amount.threshold) || 100;
      if ((rec.points || 0) < thr) return rec;
      pointsDelta = thr;
      rec.points -= pointsDelta;
    } else {
      var target = (cfg.model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target)) || 10;
      if ((rec.stamps || 0) < target) return rec;
      stampsDelta = target;
      rec.stamps -= stampsDelta;
    }
    rec.updated = now();
    writeBook(d, book);
    var ref = reservation ? reservation.ref : redemptionRef(id);
    var event = { ref: ref, clientId: id, points: pointsDelta, stamps: stampsDelta, created: rec.updated };
    if (!reservation || !reservation.accepted) {
      redemptionAdd(book, event);
      if (!reservation) redemptionPush(book, event);
    }
    return rec;
  }

  function remove(id, book) {
    book = book || bookId();
    var d = readBook(book);
    d.list = d.list.filter(function (c) { return c.id !== id; });
    writeBook(d, book);
    deleteRemote(id, book);
  }

  /* ── segmentation — the 4 buckets the dashboard composer speaks ─────────── */
  //   new  · acquired ≤30 j, ≤2 visits      vip · high value
  //   win  · dormant >30 j (win-back)        reg · everyone else (regulars)
  var VIP_SPEND = 3000, VIP_VISITS = 20, DORMANT_DAYS = 30, NEW_DAYS = 30;
  function segment(c) {
    if (!c) return 'reg';
    if (daysSince(c.lastSeen) > DORMANT_DAYS) return 'win';
    if ((c.spend || 0) >= VIP_SPEND || (c.visits || 0) >= VIP_VISITS) return 'vip';
    if (daysSince(c.firstSeen) <= NEW_DAYS && (c.visits || 0) <= 2) return 'new';
    return 'reg';
  }
  function segmentCounts(book) {
    var out = { reg: 0, vip: 0, new: 0, win: 0, total: 0 };
    list(book).forEach(function (c) { out[segment(c)]++; out.total++; });
    return out;
  }
  // progress toward this client's next reward, 0..1, for the stamp/points bar.
  function progress(c, cfg) {
    if (!cfg && !loyaltyOn()) return 0;
    cfg = cfg || config();
    if (cfg.auto && !loyaltyOn()) return 0;
    if (cfg.model === 'amount') {
      var thr = (cfg.amount && cfg.amount.threshold) || 100;
      return thr > 0 ? Math.min(1, (c.points || 0) / thr) : 0;
    }
    var target = (cfg.model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target)) || 10;
    return target > 0 ? Math.min(1, (c.stamps || 0) / target) : 0;
  }

