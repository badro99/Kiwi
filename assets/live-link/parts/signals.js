
  var METHOD_LABEL = { cash: 'Espèces', card: 'Carte', tap: 'Kiwi Tap', qr: 'QR', wallet: 'Kiwi Wallet', split: 'Partagée', credit: 'Crédit client', delivery: 'Livraison · à recevoir' };
  function fmtMAD(n) { try { return (window.KiwiNumber?.format((Math.round(n) || 0), {}) ?? (Math.round(n) || 0).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})); } catch (_) { return String(Math.round(n) || 0); } }

  // Tiny DOM helper — no innerHTML anywhere (safe by construction).
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ─── the instant local channel (same browser, cross-tab) ───
   * A till and a dashboard open in the SAME browser must not wait for a poll. The
   * client book already felt instant because KiwiStore fires a `storage` event on
   * every write; a sale only ever travelled through the timed poll, which is
   * exactly why a new client appeared at once and the sale that created it did
   * not. So ringing a sale now also drops a ping every other tab hears
   * immediately — BroadcastChannel where it exists, a localStorage key everywhere
   * else — and the receiving dashboard polls AT ONCE.
   *
   * The ping carries NO sale data on purpose: the server stays the single source
   * of truth, the ping only says "look now". So a tab can never inject a sale
   * into another tab's totals, and nothing can be double-counted. */
  var PING_KEY = 'kiwiSalePing';
  var chan = null;
  try { if (window.BroadcastChannel) chan = new BroadcastChannel('kiwi-live'); } catch (_) {}
  function requestWake() {
    try { document.dispatchEvent(new CustomEvent('kiwi:request-wake')); } catch (_) {}
  }
  try {
    if (chan) chan.addEventListener('message', requestWake);
    window.addEventListener('storage', function (e) { if (e && e.key === PING_KEY) requestWake(); });
  } catch (_) {}
  function pingLocal() {
    try { localStorage.setItem(PING_KEY, Date.now() + ':' + Math.random().toString(36).slice(2)); } catch (_) {}
    try { if (chan) chan.postMessage('sale'); } catch (_) {}
  }
  function canonicalSaleId(merchantId, requested) {
    try { return JSON.parse(localStorage.getItem('kiwi:sale-aliases:' + merchantId) || '{}')[requested] || requested; }
    catch (_) { return requested; }
  }
  function moneySignal(body, state, status, serverId) {
    if (!body || !body.id) return;
    if (state === 'accepted' && body.kind !== 'refund') {
      try { localStorage.setItem('kiwi:sale-ack:' + body.merchant, String(Date.now())); } catch (_) {}
    }
    if (state === 'accepted' && body.kind !== 'refund' && serverId && serverId !== body.id) {
      try {
        var key = 'kiwi:sale-aliases:' + body.merchant;
        var aliases = JSON.parse(localStorage.getItem(key) || '{}');
        aliases[body.id] = String(serverId).slice(0, 64);
        localStorage.setItem(key, JSON.stringify(aliases));
      } catch (_) {}
    }
    try {
      window.dispatchEvent(new CustomEvent('kiwi:money-sync', { detail: {
        id: String(body.id), kind: body.kind === 'refund' ? 'refund' : 'sale',
        state: String(state || ''), status: Number(status) || 0,
        serverId: String(serverId || body.id),
      } }));
    } catch (_) {}
  }
