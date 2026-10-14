/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/till-online.js · the online orders' home in the
 * Takeaway tab (spec §18.3 "Online orders: the inbox's home", revision 25
 * M2; stage 4). Loaded only when the till's flag is on; with it off the till
 * keeps orderpro-inbox.js's floating chip and its overlay.
 *
 *   KiwiTillOnline.mount(box, api)  the section's host, at the top of the
 *                                   Takeaway tab
 *     api.onPaint()                  after every paint (the rail's badge)
 *   KiwiTillOnline.active()          true once mounted: orderpro-inbox.js then
 *                                   draws here and no chip
 *   KiwiTillOnline.paint()           redraw from KiwiOrderInbox.groups()
 *   KiwiTillOnline.arrived(n)        the arrival's visual half (the inbox
 *                                   plays the tones): toast, badge pop, ring;
 *                                   no haptic, ever
 *   KiwiTillOnline.expiring(o, min)  the inbox's 20-minute warning, in the
 *                                   till's language
 *   KiwiTillOnline.pending()         orders to accept, for the rail
 *
 * orderpro-inbox.js keeps its poll, setStatus and the 20-minute warning: it
 * is the data source. Every action goes through its setStatus (POST
 * /api/order/queue, no outbox) or the till's own bridge (checkoutOrder,
 * printOrder); reject and cancel bring the till approval with them
 * (setStatus asks for it). A failure leaves the card as it was and says so.
 * Accept fires Commit only when the server's ok lands within 600 ms.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-button')) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc;

  var box = null, api = null, busy = {}, sig = '';

  function inbox() { return root.KiwiOrderInbox || null; }
  function kitchen() { return root.KiwiCaisseKitchen || null; }
  function groups() {
    var I = inbox();
    try { return (I && I.groups) ? I.groups() : { pending: [], accepted: [], ready: [] }; } catch (_) { return { pending: [], accepted: [], ready: [] }; }
  }
  function money(n) { return K.money ? K.money(n, 2) : String(n); }
  function clock(ts) { var d = new Date(Number(ts) || Date.now()); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  var CHANNEL = { glovo: 'Glovo', yassir: 'Yassir', shopify: 'Shopify' };

  function card(o, group) {
    var I = inbox();
    var ref = (I && I.ref) ? I.ref(o) : ('#' + (o.number || o.id));
    var kind = o.mode === 'table' ? t('floor.table', { n: o.table == null ? '' : String(o.table) })
      : o.mode === 'delivery' ? t('online.delivery') : t('till.nav.takeaway');
    var channel = o.channel && o.channel !== 'kiwi' ? (CHANNEL[o.channel] || t('online.source.generic')) : '';
    var mins = Math.max(0, Math.floor((Date.now() - (Number(o.created_ts) || Date.now())) / 60000));
    var lines = (o.lines || []).filter(function (l) { return l && l.kind !== 'formula-part'; })
      .map(function (l) { return esc((l.qty || 1) + '× ' + (l.name || '')); }).join(' · ');
    var cust = o.customer && (o.customer.name || o.customer.phone) ? esc([o.customer.name, o.customer.phone].filter(Boolean).join(' · ')) : '';
    var id = esc(o.id), wait = busy[o.id];
    var btn = function (a, label, variant) {
      return '<k-button size="S" variant="' + (variant || 'secondary') + '" label="' + esc(label) + '" data-a="' + a + '" data-id="' + id + '"' +
        (wait ? ' disabled' + (wait === a ? ' loading' : '') : '') + '></k-button>';
    };
    var acts = [];
    if (group === 'pending') acts.push(btn('reject', t('takeaway.reject'), 'tonal-danger'), btn('accept', t('online.accept'), 'primary'));
    else if (group === 'accepted') acts.push(btn('cancel', t('online.cancel'), 'tonal-danger'), btn('ready', t('kds.mark_ready')));
    else acts.push(btn('cancel', t('online.cancel'), 'tonal-danger'), btn('served', o.mode === 'table' ? t('kds.mark_served') : t('online.hand_over')));
    if (!o.paid) acts.push(btn('pay', t('bill.take_payment', { amount: money(Number(o.total) || 0) })));
    return '<article class="k-oc" data-order="' + id + '">' +
      '<header class="k-oc__hd"><span class="k-heading k-num">' + esc(ref) + '</span>' +
      (o.mode === 'table' ? '<button type="button" class="k-oc__tb k-callout" data-a="table" data-id="' + id + '">' + esc(kind) + '</button>' : '<span class="k-callout k-ink2">' + esc(kind) + '</span>') +
      (channel ? '<span class="k-foot k-ink2">' + esc(channel) + '</span>' : '') +
      (o.mode === 'table' && o.server ? '<span class="k-foot k-ink2">' + esc(o.server) + '</span>' : '') +
      '<k-button size="S" variant="icon" icon="print" label="' + esc(t('online.print')) + '" data-a="print" data-id="' + id + '" class="k-oc__pr"></k-button></header>' +
      '<p class="k-foot k-oc__tm' + (mins >= 15 ? ' k-oc__late' : '') + '">' + esc(clock(o.created_ts)) + ' · ' + mins + ' min</p>' +
      '<p class="k-title k-num k-oc__tt">' + esc(money(Number(o.total) || 0)) + '</p>' +
      (lines ? '<p class="k-body k-oc__ln">' + lines + '</p>' : '') +
      (cust ? '<p class="k-foot k-ink2 k-oc__cu">' + cust + '</p>' : '') +
      '<div class="k-oc__ac">' + acts.join('') + '</div></article>';
  }

  function paint() {
    if (!box) return;
    var g = groups();
    var parts = [['pending', 'online.to_accept'], ['accepted', 'online.in_kitchen'], ['ready', 'online.ready']]
      .filter(function (p) { return (g[p[0]] || []).length; });
    var html = parts.length ? '<h2 class="k-heading k-on__hd">' + esc(t('online.section')) + '</h2>' + parts.map(function (p) {
      var list = g[p[0]];
      return '<section class="k-on__gp"><p class="k-foot k-on__gh">' + esc(t(p[1], { n: list.length })) + '</p>' +
        list.map(function (o) { return card(o, p[0]); }).join('') + '</section>';
    }).join('') : '';
    var s = html + JSON.stringify(busy);
    if (s !== sig) { sig = s; box.innerHTML = html; box.hidden = !html; }
    if (api && typeof api.onPaint === 'function') api.onPaint();
  }

  function warn(httpStatus) {
    if (root.KiwiToast) root.KiwiToast.show({ message: t(httpStatus === 403 ? 'online.refused_pairing' : 'online.not_confirmed'), tone: 'danger' });
  }

  function act(a, id) {
    var I = inbox(), Kk = kitchen();
    if (!I || !id || busy[id]) return;
    var o = (I.orders && I.orders()[id]) || null;
    if (a === 'pay' || a === 'table') { try { if (Kk && Kk.checkoutOrder) Kk.checkoutOrder(id); } catch (_) {} return; }
    if (a === 'print') { try { if (Kk && Kk.printOrder) Kk.printOrder(id); } catch (_) {} return; }
    var status = { accept: 'accepted', reject: 'rejected', cancel: 'rejected', ready: 'ready', served: 'served' }[a];
    if (!status) return;
    var extra = { quiet: true };
    if (a === 'accept') { try { if (Kk && o && o.mode === 'table') extra.server = Kk.serverFor(o.table) || ''; } catch (_) {} }
    var gid = K.gid ? K.gid('online') : '', t0 = Date.now();
    busy[id] = a; paint();
    Promise.resolve(I.setStatus(id, status, extra)).then(function (r) {
      delete busy[id];
      if (r && r.ok) {
        /* Commit on the server's ok, and only when it is the answer to the
           tap a person is still looking at (§15.3: 600 ms). */
        if (a === 'accept' && Date.now() - t0 <= 600 && K.haptic) K.haptic('Commit', gid, { trigger: 'server-ack' });
        if (status === 'rejected' && I.refresh) I.refresh();
      } else if (!(r && r.cancelled)) warn(r && r.httpStatus);
      paint();
    }, function () { delete busy[id]; warn(0); paint(); });
  }

  function arrived(n) {
    if (root.KiwiToast) root.KiwiToast.show({ message: t('online.arrived', { n: n }) + '. ' + t('online.arrived_sub'), icon: 'shopping_bag' });
    var rail = doc.querySelector('k-rail');
    if (!rail || !rail.shadowRoot) return;
    var item = rail.shadowRoot.querySelector('[data-id="takeaway"]');
    if (!item) return;
    var reduced = K.reduced && K.reduced();
    if (reduced) return;                                 /* no pop, no ring; the badge is simply there */
    var M = root.KiwiMotion;
    var badge = item.querySelector('.bdw');
    if (badge && M && M.animate) M.animate(badge, { transform: 'scale(1)' }, { from: { transform: 'scale(0.6)' }, dur: 'dur4', curve: 'spring' });
    item.setAttribute('data-ring', '');
    var pill = item.querySelector('.pill');
    if (pill) {
      pill.style.boxShadow = '0 0 0 3px var(--k-accent)';
      pill.style.transition = 'box-shadow var(--k-dur-7, 700ms) var(--k-glide)';
      requestAnimationFrame(function () { requestAnimationFrame(function () { pill.style.boxShadow = '0 0 0 3px transparent'; }); });
      setTimeout(function () { pill.style.boxShadow = ''; pill.style.transition = ''; item.removeAttribute('data-ring'); }, 1200);
    }
  }

  function expiring(o, min) {
    var I = inbox();
    var ref = (I && I.ref) ? I.ref(o) : String(o.number || o.id);
    if (root.KiwiToast) root.KiwiToast.show({ message: t('online.expiring', { order: ref, min: min }), icon: 'schedule' });
  }

  function mount(b, a) {
    box = b; api = a || {};
    if (!box) return false;
    box.classList.add('k-on');
    box.addEventListener('kiwi:action', function (e) {
      var d = e.detail || {};
      if (d.action !== 'k.button.press') return;
      var el = e.target && e.target.closest ? e.target.closest('[data-a]') : null;
      if (el) act(el.getAttribute('data-a'), el.getAttribute('data-id'));
    });
    box.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('button[data-a="table"]') : null;
      if (el) act('table', el.getAttribute('data-id'));
    });
    paint();
    return true;
  }

  root.KiwiTillOnline = {
    mount: mount, paint: paint, arrived: arrived, expiring: expiring,
    active: function () { return !!(box && box.isConnected); },
    pending: function () { return (groups().pending || []).length; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
