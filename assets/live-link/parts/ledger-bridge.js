
  /* ─── bridge: real feed sales → the dashboard's sales store ───
   * Every dashboard surface —
   * "Encaissé aujourd'hui", the objectif bar, "Net après Kiwi", the vs-hier/
   * semaine/mois deltas, the sidebar order/revenue counts, the revenue chart —
   * recomputes from window.KiwiSales (see dateRange.js). So a Live-Link sale must
   * land in that store or it reaches no surface at all — which was exactly the bug
   * (a real cashier sale, dashboard numbers frozen at zero).
   * Only custom (onboarded, real) venues read KiwiSales for their KPIs, so gate on
   * that — mirrors the local-caisse quick-sale path in interactive.js.
   * Dedup against the sales ALREADY in the store, keyed by the feed's monotonic
   * rowid cursor (persisted on each entry), NOT a standalone counter: watchFeed
   * replays from since=0 on every load, so we must skip sales the store already
   * holds — but reading that fact FROM the store means a cleared or re-keyed store
   * re-ingests, and the dashboard total can never silently fall behind the feed.
   *
   * Self-healing against a venue-resolution RACE: the real venue id settles
   * ASYNCHRONOUSLY after boot — operator scoped view via applyScopedVenue() and a
   * real signed-in merchant via ensureOwnEmptyVenue() are both wired by identity.js
   * only after a server round-trip, i.e. AFTER the first feed poll has already
   * advanced its cursor. If we bridged only at poll time, that first batch would
   * land in whatever venue was current then (a demo venue ⇒ isCustom() false ⇒
   * dropped, or a stale/other id) and never reach the venue the dashboard reads.
   * So we accumulate every feed sale for the session and re-run the (idempotent,
   * cursor-deduped) bridge BOTH on each poll AND on every KiwiVenue change — the
   * moment the venue becomes the real one, the whole backlog lands in its store.
   *
   * The backlog is TENANT-STAMPED. On a multi-store account the merchant slug
   * changes when the owner switches store, and this accumulator outlives the
   * switch — replaying it blind poured the boutique's whole day into the
   * restaurant's store the moment the restaurant was opened. Each entry now
   * carries the merchant it was polled from, and only matching entries bridge. */
  var lastSync = 0;     // when the server last answered a poll (0 = never)
  var feedSales = [];   // every sale the feed has returned this session
  var feedSeen = {};    // merchant + '#' + cursor -> 1 (dedup across polls)
  var feedComplete = {}; // tenant -> authoritative replay reached its last page

  /* ─── une vente sortie des livres s'en va d'ici aussi ───
   * Trois endroits gardent une copie d'une vente sur cet appareil, et les trois
   * doivent la lâcher, sinon elle revient :
   *
   *  1. window.KiwiSales — le magasin que TOUTES les surfaces du tableau de bord
   *     relisent (hero, bande KPI, graphique, journal des ventes, rapport
   *     journalier d'une journée ouverte, Kiwi AI). C'est celui qui change les
   *     chiffres à l'écran.
   *  2. `feedSales`, l'accumulateur du pont. Il rejoue TOUT le lot à chaque
   *     changement de venue ; le nettoyer est ce qui empêche la vente retirée de
   *     se réinstaller à la première résolution d'identité. Sans lui, le point 1
   *     serait défait deux secondes plus tard, et le bogue serait insaisissable.
   *  3. `kiwi:posDay:<métier>`, le journal local de la CAISSE. La caisse ne lit
   *     pas le flux mais elle exécute ce module, et son compteur du jour est ce
   *     que le commerçant a sous les yeux au comptoir. Une vente d'essai faite
   *     pendant l'installation resterait sinon dans « encaissé aujourd'hui »
   *     jusqu'à minuit, sur l'écran même où l'opérateur vient de promettre
   *     qu'elle était retirée. Elle s'y retrouve par sa RÉFÉRENCE de ticket : la
   *     caisse ne connaît pas les curseurs du flux.
   *
   * Le serveur renvoie les deux clés pour cette raison — { c: curseur, r: réf }. */
  /* La liste COMPLÈTE des références sorties des livres, telle que le serveur
     vient de la donner. Publiée (et non « les nouvelles depuis la dernière
     fois ») parce que c'est un ÉTAT, pas un événement : un métier qui la reçoit
     doit pouvoir remettre son journal d'accord avec elle dans les deux sens —
     une vente sortie des livres, mais aussi une vente REMISE dedans, qui se
     signale justement par sa disparition de cette liste. Un delta ne dirait
     jamais la seconde. */
  var voidedRefs = [], voidedIds = [], voidedEvents = [];
  function voided() { return voidedRefs.slice(); }
  function voidedSaleIds() { return voidedIds.slice(); }
  function voidedEventList() { return voidedEvents.slice(); }

  function applyVoids(list, tenant) {
    if (!list) return;
    if (window.KiwiSalesReconcile?.coverage() != null && list.length) window.KiwiSalesReconcile.invalidate(tenant);
    var cursors = [], refs = [], ids = [], events = [];
    list.forEach(function (v) {
      if (!v) return;
      var c = Number(v.c) || 0;
      if (c) { cursors.push(c); if (tenant) delete feedSeen[tenant + '#' + c]; }
      if (v.r) refs.push(String(v.r));
      if (v.i) ids.push(String(v.i));
      events.push({
        cursor: c,
        id: v.i ? String(v.i) : '',
        ref: v.r ? String(v.r) : '',
        voidTs: v.vts != null ? Number(v.vts) : null,
        ts: v.ts != null ? Number(v.ts) : null,
      });
    });
    voidedRefs = refs;
    voidedIds = ids;
    voidedEvents = events;
    /* Annoncé À CHAQUE passage, même quand la liste est vide ou inchangée. Le
       module métier qui écoute est idempotent par construction (il compare son
       journal à cette liste), et c'est ce passage-là qui lui apprend qu'une
       vente est revenue. */
    try {
      document.dispatchEvent(new CustomEvent('kiwi-sales-voided', {
        detail: {
          refs: refs.slice(),
          ids: ids.slice(),
          voidEvents: events.slice(),
          merchant: tenant || '',
          source: 'live-link'
        },
      }));
    } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'document', 'void-event', tenant); }).catch(function () { /* next feed retries */ }); }
    if (!list.length) return;
    if (cursors.length) {
      var kill = {};
      cursors.forEach(function (c) { kill[c] = 1; });
      feedSales = feedSales.filter(function (row) {
        return !(row && row.tenant === tenant && kill[Number(row.s && row.s.cursor) || 0]);
      });
      try {
        if (window.KiwiSales && window.KiwiSales.remove) {
          var vid = null;
          try { vid = (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || null; } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiVenue', 'getVenue', tenant); }).catch(function () { /* next feed retries */ }); }
          window.KiwiSales.remove(vid, cursors);

        }
      } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiSales', 'remove', tenant); }).catch(function () { /* next feed retries */ }); }
    }
    if (cursors.length && window.KiwiRefunds && window.KiwiRefunds.remove) {
      try { window.KiwiRefunds.remove(vid, cursors); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiRefunds', 'remove', tenant); }); }
    }
    if (refs.length) {
      try { if (window.KiwiPosSale && window.KiwiPosSale.dropRefs) window.KiwiPosSale.dropRefs(refs); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiPosSale', 'dropRefs', tenant); }).catch(function () { /* next feed retries */ }); }
    }
  }
  function accumulateFeed(sales, tenant) {
    (sales || []).forEach(function (s) {
      var cur = Number(s && s.cursor) || 0;
      if (!cur) return;
      var boundary = window.KiwiSalesReconcile?.coverage();
      if (boundary != null && s.ts < boundary) return;
      var k = tenant + '#' + cur;
      if (feedSeen[k]) return;
      feedSeen[k] = 1;
      feedSales.push({ s: s, tenant: tenant });
      moneySignal({ id: s.id || s.saleId, kind: Number(s.amountCents != null ? s.amountCents : Number(s.amount || 0) * 100) < 0 ? 'refund' : 'sale' }, 'accepted', 200);
    });
  }
  function bridgeToStore() {
    if (window.KiwiSalesReconcile?.coverage() != null) return;
    var KV = window.KiwiVenue;
    if (!window.KiwiSales || !window.KiwiSales.add) return;
    /* Real session OR user-created venue. isCustom() alone dropped every sale
       of a hosted merchant sitting on a venue id that had not been flagged
       custom yet — the exact state a store is in for its first minutes, and
       after any venue-resolution hiccup. The sale reached the server, the
       toast fired, and the dashboard stayed at zero. */
    var own = false;
    try { own = !!(KV && KV.isCustom && KV.isCustom()) || !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { own = false; }
    if (!own) return;
    var vid = (KV.getVenue && KV.getVenue()) || null;
    var tenant = merchant();
    if (!tenant) return;                            // identity unresolved → bridge nothing
    var have = {};
    try { (window.KiwiSales.list(vid) || []).forEach(function (e) { if (e && e.cursor) have[e.cursor] = e; }); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiSales', 'list', tenant); }).catch(function () { /* next feed retries */ }); }
    var haveRefund = {};
    try { (window.KiwiRefunds && window.KiwiRefunds.list ? window.KiwiRefunds.list(vid) || [] : []).forEach(function (e) { if (e && e.cursor) haveRefund[e.cursor] = e; }); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiRefunds', 'list', tenant); }).catch(function () { /* next feed retries */ }); }
    /* New sales are stored in one batch after the loop: one write, one redraw
       (KiwiSales.addMany). One add() per sale redrew the dashboard per sale. */
    var fresh = [];
    var annotations = [];                          // same rule for metadata: one write, one redraw
    feedSales.forEach(function (row) {
      if (row.tenant !== tenant) return;             // another store's money — never this one's
      var s = row.s;
      var cur = Number(s.cursor) || 0;
      if (!cur) return;
      var signedCents = s.amountCents != null
        ? Math.round(Number(s.amountCents)) : Math.round(Number(s.amount || 0) * 100);
      if (signedCents < 0 || s.channel === 'refund') {
        if (!window.KiwiRefunds || !window.KiwiRefunds.add) return;
        try {
          window.KiwiRefunds.add(vid, {
            amount: Math.abs(signedCents) / 100, method: s.method || 'cash', cursor: cur, ts: s.ts,
            label: s.label || 'Remboursement', ref: s.orderRef || s.ref || '', saleId: s.id || '', lines: s.lines,
          });
          haveRefund[cur] = 1;
        } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiRefunds', 'add', tenant); }).catch(function () { /* next feed retries */ }); }
        return;
      }
      if (have[cur]) {
        var existing = have[cur];
        var patch = {
          ref: s.orderRef || s.ref || '', receiptRef: s.receiptRef || s.ref || '',
          origin: s.origin || '', server: s.server || '', channel: s.channel || '',
          saleId: s.id || s.saleId || '',
          paymentParts: s.paymentParts || null,
          tipCents: Number(s.tipCents) > 0 ? Math.round(Number(s.tipCents)) : 0,
        };
        /* annotate() rereads and searches the persisted ledger. Calling it for
           every already-current row turns a full replay into quadratic work. */
        var changed = Object.keys(patch).some(function (key) {
          return patch[key] && String(existing[key] || '') !== String(patch[key]);
        });
        if (!changed) return;
        annotations.push({ cursor: cur, meta: patch });
        return;
      }
      var amt = s.amountCents != null
        ? Math.round(Number(s.amountCents)) / 100
        : (Math.round((Number(s.amount || 0) + Number.EPSILON) * 100) / 100);
      if (!(amt >= 0)) return;
      var amtCents = s.amountCents != null
        ? Math.round(Number(s.amountCents))
        : Math.round(amt * 100);
      /* `lines` travels the last leg. Without it the dashboard's store held
         the money and the ticket summary only, so assets/agent-data.js fell back
         to its honest refusal on "quel est mon produit le plus vendu" for every
         merchant whose caisse is not in this same browser. */
      fresh.push({
        amount: amt, amountCents: amtCents, method: s.method || 'cash', cursor: cur, ts: s.ts,
        label: s.label, ref: s.orderRef || s.ref || '', receiptRef: s.receiptRef || s.ref || '', origin: s.origin || '',
        server: s.server || '', channel: s.channel || '', lines: s.lines,
        paymentParts: s.paymentParts || null, tipCents: s.tipCents,
        saleId: s.id || s.saleId || '', grossAmountCents: s.grossAmountCents,
        discountAmountCents: s.discountAmountCents, discountReason: s.discountReason || '', actorId: s.actorId || '',
      });
      have[cur] = 1;
    });
    if (fresh.length) {
      if (window.KiwiSales.addMany) { try { window.KiwiSales.addMany(vid, fresh); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiSales', 'addMany', tenant); }).catch(function () { /* next feed retries */ }); } }
      else fresh.forEach(function (sale) { try { window.KiwiSales.add(vid, sale); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiSales', 'add', tenant); }).catch(function () { /* next feed retries */ }); } });
    }
    if (annotations.length) {
      if (window.KiwiSales.annotateMany) { try { window.KiwiSales.annotateMany(vid, annotations); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiSales', 'annotateMany', tenant); }).catch(function () { /* next feed retries */ }); } }
      else if (window.KiwiSales.annotate) annotations.forEach(function (a) { try { window.KiwiSales.annotate(vid, a.cursor, a.meta); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiSales', 'annotate', tenant); }).catch(function () { /* next feed retries */ }); } });
    }
    /* Fail closed once the full entitled history is known. Any server-backed
       local row absent from it is foreign (or voided), including rows copied by
       the former shared-placeholder migration. */
    if (feedComplete[tenant] && window.KiwiSales.retainCursors) {
      var allowed = feedSales.filter(function (row) {
        if (!row || row.tenant !== tenant) return false;
        var cents = row.s && row.s.amountCents != null
          ? Number(row.s.amountCents) : Number(row.s && row.s.amount || 0) * 100;
        return cents >= 0;
      })
        .map(function (row) { return Number(row.s && row.s.cursor) || 0; }).filter(Boolean);
      try { window.KiwiSales.retainCursors(vid, allowed); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiSales', 'retainCursors', tenant); }).catch(function () { /* next feed retries */ }); }
      if (window.KiwiRefunds && window.KiwiRefunds.retainCursors) {
        var refundAllowed = feedSales.filter(function (row) {
          if (!row || row.tenant !== tenant) return false;
          var cents = row.s && row.s.amountCents != null
            ? Number(row.s.amountCents) : Number(row.s && row.s.amount || 0) * 100;
          return cents < 0;
        }).map(function (row) { return Number(row.s && row.s.cursor) || 0; }).filter(Boolean);
        try { window.KiwiRefunds.retainCursors(vid, refundAllowed); } catch (_) { import('./live-consumer-errors.js').then(function (m) { m.reportConsumerFailure(window, 'KiwiRefunds', 'retainCursors', tenant); }).catch(function () { /* next feed retries */ }); }
      }
    }
  }
