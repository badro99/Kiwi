
  /* ─── dashboard ← server (poll) ───
   * Two things turn this from "reload to see your sale" into live:
   *  • idle reads back off from 2.5 s to 60 s, within the till-presence
   *    freshness window. Hidden tabs stop their read timer; sale outboxes
   *    retain their independent recovery path.
   *  • every wake-up polls AT ONCE: returning to the tab, refocusing the window,
   *    a bfcache restore, the network coming back, or a ping from a till in this
   *    same browser. Whatever happened while we were away lands immediately. */
  var FAST_MS = 2500, SLOW_MS = 60000;
  var operatorSnapshot = null;
  var lastFeedError = '';
  // A hung GET (including its JSON body) must not hold the live pump forever.
  // Race the complete read, even on WebViews where abort alone is unreliable.
  function readFeed(url) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var deadline;
    var read = Promise.resolve().then(function () {
      return fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store',
        credentials: 'include', signal: controller ? controller.signal : undefined });
    }).then(function (r) {
      if (!r || !r.ok) {
        var error = new Error(r && (r.status === 401 || r.status === 403) ? 'auth' : 'http');
        error.status = r && r.status; throw error;
      }
      return r.json();
    });
    var timeout = new Promise(function (_resolve, reject) {
      deadline = setTimeout(function () {
        reject(new Error('timeout'));
        if (controller) controller.abort();
      }, 12000);
    });
    return Promise.race([read, timeout]).then(function (data) {
      clearTimeout(deadline); return data;
    }, function (error) { clearTimeout(deadline); throw error; });
  }
  function publishSnapshot(state) {
    operatorSnapshot = Object.assign({}, state);
    paintSnapshot();
    try { document.dispatchEvent(new CustomEvent('kiwi:operator-snapshot', { detail: Object.assign({}, state) })); } catch (_) {}
  }
  /* A short page is evidence only when it is a valid response for this scope.
     Do not interpret a login page, missing DB response, or stuck cursor as zero. */
  function validateSnapshotPage(data, tenant, since, pageSize) {
    if (!data || data.error || !Array.isArray(data.sales) || data.sales.length > pageSize ||
        !Array.isArray(data.voided)) throw new Error('invalid-feed');
    if (!tenant || data.merchant !== tenant) throw new Error('scope');
    var cursor = since;
    data.sales.forEach(function (s) {
      var amount = s && (s.amountCents != null ? s.amountCents : s.amount);
      if (!s || !Number.isSafeInteger(s.cursor) || s.cursor <= cursor ||
          typeof amount !== 'number' || !Number.isFinite(amount) ||
          (s.amountCents != null && !Number.isSafeInteger(s.amountCents)) ||
          typeof s.ts !== 'number' || !Number.isFinite(s.ts) || s.ts <= 0) throw new Error('invalid-sales');
      cursor = s.cursor;
    });
    if (!Number.isSafeInteger(data.cursor) || data.cursor !== cursor) throw new Error('cursor');
    if (data.voided.some(function (v) { return !v || !Number.isSafeInteger(v.c) || v.c <= 0; })) throw new Error('invalid-feed');
  }
  /* Is a till actually switched on for this store? /api/feed carries the
   * till's own heartbeat (order_desk). Published once per poll for anything
   * that would otherwise claim "connectée" from local pairing memory alone
   * (assets/caisse-link.js). Clock skew comes from the server's `now`. */
  function publishTill(tenant, seen, serverNow) {
    var at = Date.now();
    var skew = (Number(serverNow) || at) - at;
    window.KiwiTillPresence = { merchant: tenant, seen: Number(seen) || 0, at: at, skew: skew,
      fresh: !!seen && (at + skew - seen) < 90 * 1000 };
    try { document.dispatchEvent(new CustomEvent('kiwi:till-presence', { detail: window.KiwiTillPresence })); } catch (_) {}
  }
  function watchFeed(onSales, intervalMs, options) {
    if (!on()) return function () {};
    var oneShot = !!(options && options.oneShot);
    var since = 0, stopped = false, timer = null, busy = false, again = false, backfill = true;
    var drainBackfill = false, idleDelay = intervalMs || FAST_MS, lastPollSignature = null;
    var lastTenant = null, covered = null, coveredKey = null;
    var changeSeen = null;                 // dernier repère de modification lu (journal du flux), par commerce
    var bound = [];
    var state = { phase: 'loading', merchant: merchant(), pages: 0, rows: 0, cursor: 0,
      startedAt: Date.now(), lastPageAt: 0, completedAt: 0, error: null };
    function report() {
      if (!oneShot) return;
      if (options && options.onState) options.onState(Object.assign({}, state));
      else if (opMode()) publishSnapshot(state);
    }
    if (oneShot) { feedComplete[state.merchant] = false; report(); }
    function delay() {
      var gate = document.querySelector && document.querySelector('[data-kiwi-lock]');
      if (gate && gate.isConnected && gate.style.display !== 'none') return 300000;
      return Math.max(intervalMs || FAST_MS, idleDelay);
    }
    function arm(ms) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!stopped && (oneShot || !document.hidden)) timer = setTimeout(tick, window.KiwiPoll?.delay(ms == null ? delay() : ms) ?? (ms == null ? delay() : ms));
    }
    /* Le curseur rowid ne repasse jamais sur une vente déjà servie : un pourboire
       posé après coup (dépôt repris avec son pourboire) ne l'atteindrait jamais.
       Le flux expose le journal de ses modifications (`changeFence`, lu avant les
       lignes) : quand il avance, on relit ce journal et l'on remet à jour les
       ventes que ce navigateur a déjà. Les nouvelles viennent par le curseur. */
    function followChanges(tenant, fence) {
      if (!Number.isSafeInteger(fence) || fence < 0) return Promise.resolve();   // serveur sans journal
      if (changeSeen == null) { changeSeen = fence; return Promise.resolve(); }
      if (fence <= changeSeen) return Promise.resolve();
      function page(after) {
        return readFeed('/api/feed?merchant=' + encodeURIComponent(tenant) + '&changes=1&afterChange=' + after + '&limit=500')
          .then(function (d) {
            if (stopped || merchant() !== tenant) return;
            if (!d || d.error || d.merchant !== tenant || !Array.isArray(d.changes)) throw new Error('changes');
            var pos = after, touched = false;
            d.changes.forEach(function (c) {
              if (c && Number.isSafeInteger(c.seq) && c.seq > pos) pos = c.seq;
              if (!c || c.deleted || c.voided || !(c.tipCents > 0)) return;
              var cur = Number(c.cursor) || 0;
              if (!cur || !feedSeen[tenant + '#' + cur]) return;       // inconnue ici : le curseur la servira
              feedSales.forEach(function (row) {
                if (row && row.tenant === tenant && row.s && Number(row.s.cursor) === cur && !(Number(row.s.tipCents) >= c.tipCents)) {
                  row.s.tipCents = c.tipCents; touched = true;
                }
              });
            });
            changeSeen = Math.max(Number(changeSeen) || 0, pos);
            if (touched) bridgeToStore();
            if (!d.complete && pos > after) return page(pos);
          });
      }
      return page(changeSeen).catch(function () { /* au prochain sondage : le repère n'a pas bougé */ });
    }
    function tick() {
      if (stopped || (!oneShot && document.hidden)) return;
      if (busy) { again = true; return; }      // coalesce: one poll in flight at a time
      busy = true; again = false;
      drainBackfill = false;
      /* A God Mode client view is a read-only snapshot, not a till. Never flush
         the operator browser's old outbox under the client tenant. */
      if (!oneShot) flushQueue();              // this merchant device may still owe the server a sale
      /* `since` is a per-tenant cursor. Switching store switches tenant, so a
       * cursor carried over from the previous one would skip the new store's
       * whole history — it starts again from the beginning of its own feed. */
      var tenant = merchant();
      if (tenant !== lastTenant) { lastTenant = tenant; since = 0; backfill = true; changeSeen = null; }
      if (!tenant) { busy = false; arm(); return; }
      var helper = window.KiwiSalesReconcile;
      var venue = window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue();
      var boundary = helper && helper.coverage(venue);
      var coverageKey = boundary != null ? helper.scope(venue) + ':' + boundary : null;
      var request;
      if (coverageKey) {
        if (!covered || coveredKey !== coverageKey || tenant !== covered.tenant) {
          feedComplete[tenant] = false;
          covered = helper.create(tenant, venue, readFeed, function () { return merchant() === tenant; });
          covered.tenant = tenant; coveredKey = coverageKey;
        }
        request = covered.cycle().then(function (replay) { return { covered: replay }; });
      } else { if (covered) { since = 0; backfill = true; } covered = null; coveredKey = null;
        request = readFeed('/api/feed?merchant=' + encodeURIComponent(tenant) + '&since=' + since + (backfill || oneShot ? '&limit=500' : '') + (oneShot ? '' : '&cf=1'));
      }
      request
        .then(function (data) {
          if (stopped) return;
          var signature = JSON.stringify(data && data.covered
            ? [tenant, data.covered.result.cursor, data.covered.result.fence, data.covered.result.changeFence]
            : [tenant, data && data.cursor, data && data.changeFence, data && data.voided]);
          idleDelay = signature === lastPollSignature ? Math.min(SLOW_MS, idleDelay * 2) : (intervalMs || FAST_MS);
          lastPollSignature = signature;
          if (data && data.covered) {
            var replay = data.covered, proof = replay.result;
            if (merchant() !== tenant || !snapshotVenue(tenant)) throw new Error('scope');
            var verified = window.KiwiSales.reconcile(venue, proof.rows, proof);
            proof.pending = Math.max(verified.pending, proof.pending);
            replay.commit();
            feedSales = feedSales.filter(function (row) { return row.tenant !== tenant; });
            Object.keys(feedSeen).forEach(function (key) { if (key.indexOf(tenant + '#') === 0) delete feedSeen[key]; });
            accumulateFeed(proof.rows, tenant);
            feedComplete[tenant] = true; since = proof.cursor; backfill = false;
            lastSync = Date.now(); lastFeedError = '';
            state.phase = 'complete'; state.completedAt = Date.now(); state.lastPageAt = lastSync;
            state.cursor = since; state.rows = proof.rows.length; state.pages++;
            state.pending = Math.max(verified.pending, proof.pending); state.coverage = proof.from;
            state.fence = proof.fence; state.changeFence = proof.changeFence; state.error = null;
            report();
            if (!oneShot) { try { document.dispatchEvent(new CustomEvent('kiwi:live-backfill-complete', { detail: { merchant: tenant, proof: proof } })); } catch (_) {} }
            return;
          }
          // A response started under the previous store cannot advance this
          // store's cursor or be described as a fresh successful read.
          if (merchant() !== tenant || (data && data.merchant && data.merchant !== tenant)) throw new Error('scope');
          if (!data || data.error || !Array.isArray(data.sales)) throw new Error('invalid-feed');
          var pageSize = (Number.isInteger(data.limit) && data.limit >= 50 && data.limit <= 500) ? data.limit : 50;
          lastFeedError = '';
          if (oneShot) {
            if (tenant !== state.merchant || merchant() !== tenant) throw new Error('scope');
            validateSnapshotPage(data, tenant, since, pageSize);
          }
          lastSync = Date.now();
          if (!oneShot && typeof data.tillSeen === 'number') publishTill(tenant, data.tillSeen, data.now);
          /* Les ventes RETIRÉES des livres, avant celles qui arrivent. Le flux
             ne repasse jamais sur un curseur déjà servi, donc c'est le seul
             chemin par lequel une annulation atteint un navigateur qui avait
             déjà recopié la vente. Appliqué à chaque sondage, quel que soit le
             curseur : idempotent, et un appareil neuf se retrouve d'aplomb au
             premier passage. */
          var restored = false;
          if (Array.isArray(data.voided) && !oneShot) {
            /* Le serveur ne renvoie que les 500 annulations les plus récentes :
               une ancienne qui sort d'une liste pleine n'est pas une restauration. */
            var full = data.voided.length >= 500;
            var floor = full ? data.voided.reduce(function (m, v) { return Math.min(m, Number(v && v.vts) || 0); }, Infinity) : -Infinity;
            restored = voidedEvents.some(function (e) {
              return e && e.id && (!full || (Number(e.voidTs) || 0) > floor)
                && !data.voided.some(function (v) { return v && String(v.i || '') === e.id; });
            });
            applyVoids(data.voided, tenant);
          }
          var followed = null;
          if (Array.isArray(data.sales)) {
            if (data.sales.length) since = data.cursor || since;
            /* /api/feed echoes its effective page size. A shorter page proves the complete
               entitled history has arrived, so local reconciliation is safe. */
            if (data.sales.length < pageSize) {
              var firstComplete = !feedComplete[tenant];
              feedComplete[tenant] = true;
              if (firstComplete && !oneShot) {
                try { document.dispatchEvent(new CustomEvent('kiwi:live-backfill-complete', { detail: { merchant: tenant } })); } catch (_) {}
              }
            }
            if (oneShot) {
              var applied = onSales(data.sales, backfill, tenant, data.voided);
              if (applied && applied.venue) state.venue = applied.venue;
            }
            else { try { onSales(data.sales, backfill, tenant); } catch (_) {} }
            if (!oneShot) followed = followChanges(tenant, data.changeFence);
            /* The feed is paginated at the negotiated page size. A full first page does NOT end
               startup history: every following page is still old ledger data
               and must stay silent. Drain full pages immediately, and unlock
               notifications only after a short (or empty) page proves we have
               reached the live edge. This also handles histories containing an
               exact multiple of the page size, whose final proof is an empty page. */
            drainBackfill = data.sales.length === pageSize;
            if (backfill && !drainBackfill) backfill = false;
            // Une restauration garde son rowid : relire le flux, sans fabriquer de vente.
            if (restored) { since = 0; backfill = true; feedComplete[tenant] = false; drainBackfill = true; }
            if (oneShot) {
              state.pages++; state.rows += data.sales.length; state.cursor = since;
              state.lastPageAt = Date.now();
              if (!drainBackfill) {
                state.phase = 'complete'; state.completedAt = Date.now();
                if (!options.onState) {
                  try { document.dispatchEvent(new CustomEvent('kiwi:live-backfill-complete', { detail: { merchant: tenant } })); } catch (_) {}
                }
              }
              report();
            }
          }
          return followed;
        })
        .catch(function (err) {
          if (stopped) return;
          if (coverageKey) {
            feedComplete[tenant] = false;
            if (err && err.status === 400 && covered) covered.reset();
          }
          idleDelay = Math.min(SLOW_MS, idleDelay * 2);
          lastFeedError = String(err && err.message || 'network-json');
          drainBackfill = false;
          if (!oneShot) return;
          feedComplete[tenant] = false;
          state.phase = state.pages ? 'incomplete' : 'error';
          state.error = /^(auth|http|scope|invalid-feed|invalid-sales|cursor|ledger|timeout)$/.test(err && err.message) ? err.message : 'network-json';
          report();
        })
        .then(function () {
          busy = false;
          if (stopped) return;
          if (again) { again = false; arm(0); }
          else if (drainBackfill) arm(0);
          /* Snapshot mode never turns a failed request into an invisible polling
             loop. One network attempt (plus immediate pagination when needed),
             then the explicit Actualiser button owns the next attempt. */
          else if (oneShot) stop();
          else arm();
        });
    }
    function poke() { idleDelay = FAST_MS; if (stopped || document.hidden) return; if (busy) { again = true; return; } arm(0); }
    function listen(target, type, fn) {
      try { target.addEventListener(type, fn); bound.push([target, type, fn]); } catch (_) {}
    }
    if (!oneShot) {
      listen(document, 'visibilitychange', function () {
        try { if (document.hidden) { arm(); return; } } catch (_) {}
        poke();
      });
      listen(document, 'kiwi:request-wake', poke);
      listen(window, 'focus', poke);
      listen(window, 'pageshow', poke);
      listen(window, 'online', function () { flushQueue(); poke(); });
      listen(window, 'storage', function (e) { if (e && e.key === PING_KEY) poke(); });
      if (chan) listen(chan, 'message', poke);
    }

    tick();
    function stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      bound.forEach(function (b) { try { b[0].removeEventListener(b[1], b[2]); } catch (_) {} });
      bound = [];
    }
    return stop;
  }

  /* ─── announce a sale that just landed ───
   * All this module paints now. It used to own a green "En direct · ventes" card
   * pinned above the hero, which said the same thing twice: the hero already
   * reads "Encaissé aujourd'hui" off the same total, and the transactions feed
   * already lists the same rows off the same store. The card is gone; the toast
   * stays, because a sale rung on a till in the next room should announce itself
   * on the owner's screen. Backfill never toasts — see `backfill` in watchFeed. */
  function notifySale(s) {
    if (!s || !window.Kiwi || typeof window.Kiwi.toast !== 'function') return;
    var mlabel = METHOD_LABEL[s.method] || (s.method || 'Vente');
    try {
      var cents = s.amountCents != null ? Number(s.amountCents) : Number(s.amount || 0) * 100;
      if (cents < 0) {
        window.Kiwi.toast('Remboursement enregistré · −' + fmtMAD(Math.abs(cents) / 100) + ' MAD', {
          desc: mlabel + ' · ' + (s.label || 'en direct'), type: 'info',
        });
      } else {
        window.Kiwi.toast('Vente encaissée · ' + fmtMAD(s.amount) + ' MAD', {
          desc: mlabel + ' · ' + (s.label || 'en direct'), type: 'success',
        });
      }
    } catch (_) {}
  }
