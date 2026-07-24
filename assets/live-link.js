/* Kiwi Live Link — optional $0 backend bridge (Cloudflare Pages Functions + D1).
 *
 * OFF by default: the apps run their normal mocked, per-browser demo. Turn it on
 * with  localStorage.kiwiLive = '1'  (or add  ?live=1  to the URL once). When on:
 *   • the CAISSE POSTs every confirmed sale to  /api/sale
 *   • the SERVEUR POSTs every settled table (card · cash · split) to  /api/sale
 *   • the DASHBOARD polls  /api/feed  and shows real sales in an "EN DIRECT"
 *     card — so a sale rung on one device appears on the owner's dashboard on
 *     another device, for real. Each row self-identifies (table vs. caisse).
 *
 * Same-origin fetch carries the passcode-gate cookie, so it works behind the
 * Cloudflare edge gate. Vanilla, no dependencies. The simulated dashboard feed is
 * left untouched — the live card is a separate surface this module fully owns, so
 * the demo still works with the flag off and nothing here can corrupt it.
 */
(function () {
  'use strict';

  var LS = 'kiwiLive';

  // ?live=1 or ?op=1 (operator view) both turn the live feed on.
  function urlFlag() { try { return /[?&](?:live=1|op=1)(?:&|$)/.test(location.search); } catch (_) { return false; } }
  function opMode() { try { return /[?&]op=1(?:&|$)/.test(location.search); } catch (_) { return false; } }
  function on() {
    try {
      if (urlFlag()) { localStorage.setItem(LS, '1'); return true; }
      return localStorage.getItem(LS) === '1';
    } catch (_) { return urlFlag(); }
  }
  // Which tenant this dashboard is showing. A ?merchant= in the URL is
  // authoritative (the operator's "Ouvrir dashboard" opens the client this way)
  // and is pinned to localStorage; otherwise the last pick, else the demo tenant.
  function merchant() {
    try {
      var q = new URLSearchParams(location.search).get('merchant');
      if (q) { try { localStorage.setItem('kiwiLiveMerchant', q); } catch (_) {} return q; }
      return localStorage.getItem('kiwiLiveMerchant') || 'cafe-atlas';
    } catch (_) { return 'cafe-atlas'; }
  }

  var METHOD_LABEL = { cash: 'Espèces', card: 'Carte', tap: 'Kiwi Tap', qr: 'QR', wallet: 'Kiwi Wallet', split: 'Partagée' };
  function fmtMAD(n) { try { return (Math.round(n) || 0).toLocaleString('fr-FR'); } catch (_) { return String(Math.round(n) || 0); } }
  function hhmm(ts) {
    var d = new Date(ts || Date.now());
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  // Tiny DOM helper — no innerHTML anywhere (safe by construction).
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ─── caisse → server ─── */
  function postSale(entry) {
    if (!on() || !entry) return;
    var amt = Math.round(entry.amount || 0);
    if (amt <= 0) return;
    var body = {
      merchant: merchant(),
      amount: amt,                                            // MAD, integer
      method: entry.method || 'cash',                         // cash|card|tap|qr|wallet
      label: entry.label || 'Vente',
      ref: entry.ref || '',
      ts: (entry.time && entry.time.getTime) ? entry.time.getTime() : Date.now(),
    };
    try {
      fetch('/api/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () { /* best-effort; offline queue is a later phase */ });
    } catch (_) {}
  }

  /* ─── dashboard ← server (poll) ─── */
  function watchFeed(onSales, intervalMs) {
    if (!on()) return function () {};
    var since = 0, stopped = false, timer = null;
    function tick() {
      if (stopped) return;
      fetch('/api/feed?merchant=' + encodeURIComponent(merchant()) + '&since=' + since, { headers: { Accept: 'application/json' } })
        .then(function (r) { return (r && r.ok) ? r.json() : null; })
        .then(function (data) {
          if (data && Array.isArray(data.sales) && data.sales.length) {
            since = data.cursor || since;
            try { onSales(data.sales); } catch (_) {}
          }
        })
        .catch(function () {})
        .then(function () { if (!stopped) timer = setTimeout(tick, intervalMs || 3500); });
    }
    tick();
    return function () { stopped = true; if (timer) clearTimeout(timer); };
  }

  /* ─── dashboard live card (this module owns it entirely) ─── */
  function ensureStyles() {
    if (document.getElementById('kiwi-live-style')) return;
    var s = el('style');
    s.id = 'kiwi-live-style';
    s.textContent =
      '#kiwi-live-card{background:linear-gradient(135deg,#0A4A38,#0B6E4F 55%,#05301F);color:#F7F5F0;border-radius:18px;padding:18px 20px;margin-bottom:16px;box-shadow:0 18px 40px -22px rgba(5,48,31,.7);position:relative;overflow:hidden}' +
      '#kiwi-live-card .klc-head{display:flex;align-items:center;gap:10px;font-family:var(--mono,ui-monospace,monospace);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(247,245,240,.86)}' +
      '#kiwi-live-card .klc-dot{width:8px;height:8px;border-radius:50%;background:#7DF2B0;animation:klc-pulse 2s infinite}' +
      '@keyframes klc-pulse{0%{box-shadow:0 0 0 0 rgba(125,242,176,.5)}70%{box-shadow:0 0 0 8px rgba(125,242,176,0)}100%{box-shadow:0 0 0 0 rgba(125,242,176,0)}}' +
      '#kiwi-live-card .klc-total{margin-inline-start:auto;font-family:var(--mono,ui-monospace,monospace);font-size:12px;color:#fff}' +
      '#kiwi-live-card .klc-total b{font-size:15px}' +
      '#kiwi-live-card .klc-list{margin-top:12px;display:flex;flex-direction:column;gap:2px}' +
      '#kiwi-live-card .klc-empty{font-size:13px;color:rgba(247,245,240,.62);padding:6px 0}' +
      '#kiwi-live-card .klc-row{display:grid;grid-template-columns:auto auto 1fr auto;align-items:center;gap:12px;padding:9px 0;border-top:1px solid rgba(255,255,255,.08);animation:klc-in .45s cubic-bezier(.32,.72,0,1)}' +
      '@keyframes klc-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}' +
      '#kiwi-live-card .klc-t{font-family:var(--mono,ui-monospace,monospace);font-size:12px;color:rgba(247,245,240,.6)}' +
      '#kiwi-live-card .klc-m{font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(125,242,176,.16);color:#7DF2B0;white-space:nowrap}' +
      '#kiwi-live-card .klc-l{font-size:13.5px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#kiwi-live-card .klc-a{font-family:var(--mono,ui-monospace,monospace);font-size:14px;font-weight:600;color:#fff;white-space:nowrap}' +
      '#kiwi-live-card .klc-a .cur{font-size:10px;color:rgba(247,245,240,.6);margin-inline-start:3px}';
    document.head.appendChild(s);
  }

  function buildCard() {
    var card = el('section');
    card.id = 'kiwi-live-card';
    card.setAttribute('aria-live', 'polite');

    var head = el('div', 'klc-head');
    head.appendChild(el('span', 'klc-dot'));
    head.appendChild(document.createTextNode('En direct · ventes'));
    var total = el('span', 'klc-total');
    total.appendChild(document.createTextNode('Encaissé · '));
    var totalB = el('b', null, '0');
    totalB.setAttribute('data-klc-total', '');
    total.appendChild(totalB);
    total.appendChild(document.createTextNode(' MAD'));
    head.appendChild(total);
    card.appendChild(head);

    var list = el('div', 'klc-list');
    list.setAttribute('data-klc-list', '');
    list.appendChild(el('div', 'klc-empty', 'En attente d’une vente…'));
    card.appendChild(list);
    return card;
  }

  var runningTotal = 0;

  function renderSale(listEl, totalEl, s) {
    var empty = listEl.querySelector('.klc-empty');
    if (empty) empty.remove();
    var mlabel = METHOD_LABEL[s.method] || (s.method || 'Vente');
    var row = el('div', 'klc-row');
    row.appendChild(el('span', 'klc-t', hhmm(s.ts)));
    row.appendChild(el('span', 'klc-m', mlabel));
    row.appendChild(el('span', 'klc-l', s.label || 'Vente'));
    var amt = el('span', 'klc-a', fmtMAD(s.amount));
    amt.appendChild(el('span', 'cur', 'MAD'));
    row.appendChild(amt);
    listEl.insertBefore(row, listEl.firstChild);
    while (listEl.children.length > 8) listEl.removeChild(listEl.lastChild);   // keep it tidy
    runningTotal += Math.round(s.amount) || 0;
    if (totalEl) totalEl.textContent = fmtMAD(runningTotal);
    if (window.Kiwi && typeof window.Kiwi.toast === 'function') {
      try { window.Kiwi.toast('Vente encaissée · ' + fmtMAD(s.amount) + ' MAD', { desc: mlabel + ' · ' + (s.label || 'en direct'), type: 'success' }); } catch (_) {}
    }
  }

  /* ─── bridge: real feed sales → the dashboard's sales store ───
   * The live card above is DISPLAY-ONLY. Every OTHER dashboard surface —
   * "Encaissé aujourd'hui", the objectif bar, "Net après Kiwi", the vs-hier/
   * semaine/mois deltas, the sidebar order/revenue counts, the revenue chart —
   * recomputes from window.KiwiSales (see dateRange.js). So a Live-Link sale must
   * ALSO land in that store, or it shows on the card and nowhere else — which was
   * exactly the bug (a real cashier sale, dashboard numbers frozen at zero).
   * Only custom (onboarded, real) venues read KiwiSales for their KPIs, so gate on
   * that — mirrors the local-caisse quick-sale path in interactive.js.
   * Dedup against the sales ALREADY in the store, keyed by the feed's monotonic
   * rowid cursor (persisted on each entry), NOT a standalone counter: watchFeed
   * replays from since=0 on every load, so we must skip sales the store already
   * holds — but reading that fact FROM the store means a cleared or re-keyed store
   * re-ingests, and the dashboard total can never silently fall behind the feed. */
  function bridgeToStore(sales) {
    var KV = window.KiwiVenue;
    if (!KV || !KV.isCustom || !KV.isCustom() || !window.KiwiSales || !window.KiwiSales.add) return;
    var vid = (KV.getVenue && KV.getVenue()) || null;
    var have = {};
    try { (window.KiwiSales.list(vid) || []).forEach(function (e) { if (e && e.cursor) have[e.cursor] = 1; }); } catch (_) {}
    sales.forEach(function (s) {
      var cur = Number(s.cursor) || 0;
      if (!cur || have[cur]) return;                // no cursor, or already stored → skip
      var amt = Math.round(s.amount) || 0;
      if (amt <= 0) return;
      try { window.KiwiSales.add(vid, { amount: amt, method: s.method || 'cash', cursor: cur, ts: s.ts }); have[cur] = 1; } catch (_) {}
    });
  }

  function initDashboard() {
    if (!on()) return;
    var host = document.querySelector('.dash-standard') || document.querySelector('main');
    if (!host || document.getElementById('kiwi-live-card')) return;
    ensureStyles();
    var card = buildCard();
    host.insertBefore(card, host.firstChild);
    var listEl = card.querySelector('[data-klc-list]');
    var totalEl = card.querySelector('[data-klc-total]');
    watchFeed(function (sales) {
      sales.forEach(function (s) { renderSale(listEl, totalEl, s); });
      bridgeToStore(sales);   // ← keep the real dashboard numbers in sync, not just the card
    });
  }

  /* ─── operator view banner ─── */
  // When the console opens a client with ?op=1, make it unmistakable that this is
  // the operator looking at THAT client (not the operator's own account), and
  // give a one-click way back. Read-only affordance; no client data is altered.
  function initOperatorBanner() {
    if (!opMode() || document.getElementById('kiwi-op-banner')) return;
    var bar = el('div');
    bar.id = 'kiwi-op-banner';
    bar.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:2147482000;display:flex;align-items:center;' +
      'justify-content:center;gap:10px;padding:7px 14px;background:linear-gradient(90deg,#053B2C,#0B6E4F);color:#eafff4;' +
      'font:600 12.5px/1.35 -apple-system,BlinkMacSystemFont,"Inter Tight",Inter,sans-serif;letter-spacing:.02em;' +
      'box-shadow:0 2px 14px -5px rgba(0,0,0,.55)');
    var dot = el('span');
    dot.setAttribute('style', 'width:7px;height:7px;border-radius:50%;background:#7DF2B0');
    bar.appendChild(dot);
    bar.appendChild(document.createTextNode('Vue opérateur · ' + merchant() + ' · données du client'));
    var back = el('a', null, 'Retour console ›');
    back.setAttribute('href', '/kiwi-admin.html');
    back.setAttribute('style', 'margin-inline-start:14px;color:#7DF2B0;text-decoration:none;font-weight:700');
    bar.appendChild(back);
    document.body.appendChild(bar);
    try {
      var pt = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
      document.body.style.paddingTop = (pt + 34) + 'px';
    } catch (_) {}
  }

  // In operator view, skip the client's PIN lock — the operator is not the staff
  // and should land straight on the dashboard. Uses the app's own skip control so
  // the normal reveal (card entrance, etc.) still runs.
  function opSkipLock() {
    if (!opMode()) return;
    var tries = 0;
    (function attempt() {
      var lock = document.querySelector('[data-kiwi-lock]');
      // Done once the lock is gone or already unlocking. The skip button exists in
      // the static HTML before its click handler is wired, so keep clicking until
      // the lock actually reacts rather than clicking once into the void.
      if (!lock || lock.classList.contains('is-unlocking')) return;
      var skip = document.querySelector('[data-kiwi-skip]');
      if (skip) { try { skip.click(); } catch (_) {} }
      if (tries++ < 30) setTimeout(attempt, 120);
    })();
  }

  function boot() { initDashboard(); initOperatorBanner(); opSkipLock(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiLive = { isOn: on, merchant: merchant, postSale: postSale, watchFeed: watchFeed };
})();
