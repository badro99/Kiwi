
  /* The pump. Deliberately DOM-free: it no longer needs a host element to mount a
   * card into, so a layout the module doesn't recognise can never silently stop
   * the dashboard from receiving sales. */
  var pumping = false;
  function snapshotVenue(tenant) {
    var KV = window.KiwiVenue;
    var vid = KV && KV.getVenue && KV.getVenue();
    var data = KV && KV.getCurrentVenueData && KV.getCurrentVenueData();
    return vid && data && (data.slug || slugify(data.name)) === tenant && merchant() === tenant ? vid : null;
  }
  function verifySnapshotLedger(tenant) {
    var vid = snapshotVenue(tenant);
    if (!vid || !window.KiwiSales || !window.KiwiSales.list) throw new Error('ledger');
    var proof = window.KiwiSalesReconcile?.proof(vid);
    if (window.KiwiSalesReconcile?.coverage(vid) != null) {
      if (!proof) throw new Error('ledger');
      return Object.assign({ venue: vid }, window.KiwiSalesReconcile.verify(window.KiwiSales.list(vid),
        window.KiwiRefunds.list(vid), proof.rows, proof));
    }
    var expected = feedSales.filter(function (row) { return row.tenant === tenant; }).map(function (row) { return row.s; });
    function cents(s) { return s.amountCents != null ? Number(s.amountCents) : Math.round(Number(s.amount) * 100); }
    function matches(rows, sign) {
      var want = expected.filter(function (s) { return sign === 1 ? cents(s) >= 0 : cents(s) < 0; });
      if (!Array.isArray(rows) || rows.length !== want.length) return false;
      var byCursor = {};
      rows.forEach(function (s) { byCursor[s.cursor] = s; });
      return want.every(function (s) {
        var saved = byCursor[s.cursor];
        return saved && cents(saved) === cents(s) * sign && Number(saved.ts) === s.ts;
      });
    }
    var refunds = window.KiwiRefunds && window.KiwiRefunds.list ? window.KiwiRefunds.list(vid) : [];
    if (!matches(window.KiwiSales.list(vid), 1) || !matches(refunds, -1)) throw new Error('ledger');
    return { venue: vid };
  }
  function initPump(snapshot) {
    if (!on() || pumping) return;
    pumping = true;
    var snapshotFeed = null, snapshotVoids = [];
    function bridgeSnapshot() {
      if (!snapshotFeed) return;
      var state = Object.assign({}, snapshotFeed);
      if (state.phase === 'complete') {
        try {
          if (!snapshotVenue(state.merchant)) throw new Error('venue');
          if (window.KiwiSalesReconcile?.coverage() == null) applyVoids(snapshotVoids, state.merchant);
          bridgeToStore();
          state.venue = verifySnapshotLedger(state.merchant).venue;
        } catch (err) {
          state.phase = 'incomplete'; state.completedAt = 0;
          state.error = err && err.message === 'venue' ? 'venue' : 'ledger';
        }
      }
      publishSnapshot(state);
      if (state.phase === 'complete') {
        try { document.dispatchEvent(new CustomEvent('kiwi:live-backfill-complete', { detail: { merchant: state.merchant } })); } catch (_) { console.warn("[live-link] bridgeSnapshot failed"); }
      }
    }
    if (!snapshot) flushQueue(); // a merchant device may still owe the server a sale
    watchFeed(function (sales, backfill, tenant, voids) {
      accumulateFeed(sales, tenant);
      if (snapshot) { snapshotVoids = voids; return; }
      /* A full history arrives in 50-row pages. Rebuilding and reconciling the
         complete ledger after every page made mature merchants progressively
         slower. The final short page sets feedComplete before this callback. */
      if (!backfill || feedComplete[tenant]) bridgeToStore();
      if (!backfill) sales.forEach(notifySale);
    }, null, { oneShot: !!snapshot, onState: snapshot ? function (state) { snapshotFeed = state; bridgeSnapshot(); } : null });
    // Re-run the bridge whenever the venue settles/changes — the operator scoped
    // venue and the real-merchant "own" venue both resolve AFTER this first poll,
    // so without this the pre-resolution sales would never reach the venue the
    // dashboard reads. Idempotent (cursor-deduped), so extra calls never double-count.
    try {
      if (window.KiwiVenue && window.KiwiVenue.subscribe) {
        window.KiwiVenue.subscribe(function () {
          if (snapshot) bridgeSnapshot();
          else bridgeToStore();
        });
      }
    } catch (_) { console.warn("[live-link] bridgeSnapshot failed"); }
  }

  /* ─── operator view banner ─── */
  function paintSnapshot() {
    var status = document.getElementById && document.getElementById('kiwi-op-snapshot');
    if (!status || !operatorSnapshot) return;
    var s = operatorSnapshot;
    var errors = { auth: 'Session expirée ou accès refusé', scope: 'Portée du client non confirmée',
      http: 'Serveur indisponible', 'network-json': 'Réseau ou réponse JSON invalide',
      'invalid-feed': 'Réponse du journal invalide', 'invalid-sales': 'Ventes illisibles',
      timeout: 'Le serveur ne répond pas, réessayez', cursor: 'Pagination invalide', ledger: 'Journal local non vérifié', identity: 'Identité non confirmée',
      venue: 'Journal reçu · établissement en attente de résolution' };
    var progress = s.pages + ' page(s) · ' + s.rows + ' écriture(s) reçue(s)'
      + (s.pending ? ' · ' + s.pending + ' écriture(s) locale(s) en attente' : '');
    var message = s.phase === 'complete'
      ? 'Instantané complet · ' + progress + ' · reçu le ' + new Date(s.completedAt).toLocaleString() + ' · hors direct'
      : s.phase === 'loading' ? 'Chargement du journal · ' + progress + ' · chiffres indisponibles'
        : (s.phase === 'incomplete' ? 'Instantané incomplet' : 'Échec du chargement') + ' · ' + (errors[s.error] || 'Journal indisponible') + ' · ' + progress + ' · chiffres indisponibles';
    status.textContent = 'Client : ' + s.merchant + ' · historique autorisé servi par /api/feed · ' + message;
    status.setAttribute('data-state', s.phase);
    status.setAttribute('aria-busy', String(s.phase === 'loading'));
  }
  // When the console opens a client with ?op=1, make it unmistakable that this is
  // the operator looking at THAT client (not the operator's own account), and
  // give a one-click way back. Read-only affordance; no client data is altered.
  function initOperatorBanner(confirmed) {
    if (!confirmed || !opMode() || document.getElementById('kiwi-op-banner')) return;
    var bar = el('div');
    bar.id = 'kiwi-op-banner';
    bar.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:2147482000;display:flex;align-items:center;' +
      'justify-content:center;flex-wrap:wrap;gap:10px;padding:7px 14px;background:linear-gradient(90deg,#053B2C,#0B6E4F);color:#eafff4;' +
      'font:600 12.5px/1.35 -apple-system,BlinkMacSystemFont,"Inter Tight",Inter,sans-serif;letter-spacing:.02em;' +
      'box-shadow:0 2px 14px -5px rgba(0,0,0,.55)');
    var dot = el('span');
    dot.setAttribute('style', 'width:7px;height:7px;border-radius:50%;background:#7DF2B0');
    bar.appendChild(dot);
    bar.appendChild(document.createTextNode('Vue opérateur · ' + merchant() + ' · données du client'));
    var status = el('span');
    status.id = 'kiwi-op-snapshot';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    bar.appendChild(status);
    var back = el('a', null, 'Retour console ›');
    back.setAttribute('href', '/kiwi-admin.html');
    back.setAttribute('style', 'margin-inline-start:14px;color:#7DF2B0;text-decoration:none;font-weight:700');
    bar.appendChild(back);
    var refresh = el('button', null, 'Actualiser');
    refresh.type = 'button';
    refresh.setAttribute('aria-label', 'Actualiser les données du client');
    refresh.setAttribute('style', 'margin-inline-start:4px;padding:5px 9px;border:1px solid rgba(125,242,176,.38);border-radius:999px;' +
      'background:transparent;color:#eafff4;font:700 11px/1 inherit;cursor:pointer');
    refresh.onclick = function () { location.reload(); };
    bar.appendChild(refresh);
    document.body.appendChild(bar);
    paintSnapshot();
    try {
      var pt = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
      function fitBanner() { document.body.style.paddingTop = (pt + (bar.offsetHeight || 34)) + 'px'; }
      fitBanner();
      if (window.ResizeObserver) new window.ResizeObserver(fitBanner).observe(bar);
    } catch (_) { console.warn("[live-link] fitBanner failed"); }
  }

  // In operator view, skip the client's PIN lock — the operator is not the staff
  // and should land straight on the dashboard. Uses the app's own skip control so
  // the normal reveal (card entrance, etc.) still runs.
  function opSkipLock(confirmed) {
    if (!confirmed || !opMode()) return;
    var tries = 0;
    (function attempt() {
      var lock = document.querySelector('[data-kiwi-lock]');
      // Done once the lock is gone or already unlocking. The skip button exists in
      // the static HTML before its click handler is wired, so keep clicking until
      // the lock actually reacts rather than clicking once into the void.
      if (!lock || lock.classList.contains('is-unlocking')) return;
      var skip = document.querySelector('[data-kiwi-skip]');
      if (skip) { try { skip.click(); } catch (_) { console.warn("[live-link] attempt failed"); } }
      if (tries++ < 30) setTimeout(attempt, 120);
    })();
  }

  /* ─── le sondage des retraits, côté CAISSE ───
   * La caisse n'a pas de magasin de ventes à remplir, donc initPump() ne tourne
   * pas ici et rien ne lui apprendrait qu'une vente a été sortie des livres. Or
   * c'est l'écran du comptoir : une vente d'essai passée pendant l'installation
   * reste dans « encaissé aujourd'hui » sous les yeux du commerçant, alors que
   * l'opérateur vient de lui dire au téléphone qu'elle était retirée.
   *
   * Lent à dessein — 90 s, plus un passage immédiat au réveil de l'onglet. Ce
   * n'est pas de l'encaissement, c'est une correction d'après-coup : la faire
   * arriver dans la minute suffit, et une caisse en plein service a mieux à
   * faire que de sonder. Ne demande QUE la liste des retraits (voids=1), donc
   * une requête minuscule qui ne rejoue jamais la journée. */
  var VOID_MS = 15000;
  function watchVoids() {
    if (!on()) return;
    var timer = null, busy = false, wait = VOID_MS, signature = null;
    function arm() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!document.hidden) timer = setTimeout(tick, window.KiwiPoll?.delay(wait) ?? wait);
    }
    function tick() {
      if (document.hidden || busy) return;
      var m = merchant();
      if (!m) { arm(); return; }
      busy = true;
      fetch('/api/feed?voids=1&merchant=' + encodeURIComponent(m), { headers: { Accept: 'application/json' } })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (d) {
          if (merchant() !== m) return;
          if (d && Array.isArray(d.voided)) {
            var next = JSON.stringify([m, d.voided]);
            wait = next === signature ? Math.min(120000, wait * 2) : VOID_MS;
            signature = next;
            applyVoids(d.voided, m);
          } else wait = Math.min(120000, wait * 2);
        })
        .catch(function () { wait = Math.min(120000, wait * 2); })
        .then(function () { busy = false; arm(); });
    }
    function poke() {
      if (timer) clearTimeout(timer);
      timer = null; wait = VOID_MS;
      if (!document.hidden) tick();
    }
    try {
      document.addEventListener('visibilitychange', poke);
      document.addEventListener('kiwi:request-wake', poke);
      window.addEventListener('focus', poke);
      window.addEventListener('online', poke);
    } catch (_) { console.warn("[live-link] poke failed"); }
    tick();
  }
