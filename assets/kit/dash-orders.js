/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-orders.js · the dashboard's Orders page on the kit
 * (spec §18.2; stage 5). Loaded only when the dashboard's flag is on
 * (kiwiSkin2027:dashboard, or ?skin=2027 for one load); with it off the
 * shipped Orders page is untouched.
 *
 *   KiwiDashOrders.paint()   redraw from KiwiOrdersPage.model()
 *
 * The figures and the rows are the shipped ones (owner, 2026-10-15: shipped
 * numbers first, the ledger later per §21.2). assets/pages-pro.js renders the
 * page and publishes what it drew (KiwiOrdersPage.model(), the
 * kiwi:orders-model event); this file draws it: the range presets, the key
 * figure and its summary, the filter, and the orders grouped by hour, newest
 * first. Every tap goes back to the shipped page: a range or a filter calls
 * KiwiOrdersPage, an order clicks its shipped row, so the shipped order sheet
 * opens as before. The shipped "show updated orders" control stays drawn.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-list') || !root.customElements.get('k-segmented')) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc;

  /* §18.2: the method icon, the design's choice (the shipped list draws none). */
  var ICON = { card: 'credit_card', cash: 'payments', other: 'sync_alt', refund: 'undo' };
  var FILTERS = ['all', 'card', 'cash', 'other', 'refunds'];

  var box = null, range = null, filter = null, sig = '';

  function api() { return root.KiwiOrdersPage || null; }
  function model() {
    var P = api();
    try { return P && P.model ? P.model() : null; } catch (_) { return null; }
  }

  /* The currency in the reader's language (MAD, درهم), as Report and the
     customer rows write it: the shipped texts carry the code "MAD". */
  function cur(u) { var f = u === 'MAD' && K.fmt && K.fmt(); return (f && f.unit('0').slice(2)) || u; }
  function curText(s) { var c = cur('MAD'); return c === 'MAD' ? String(s) : String(s).replace(/\bMAD\b/g, c); }

  function groups(rows) {
    var out = [], at = {};
    rows.forEach(function (r) {
      if (!at[r.group]) { at[r.group] = { label: r.group, rows: [] }; out.push(at[r.group]); }
      at[r.group].rows.push(r);
    });
    return out;
  }

  function paint() {
    if (!mount()) return;
    var m = model();
    if (!m) return;
    var s = JSON.stringify(m);
    if (s === sig) return;
    sig = s;

    range.setAttribute('value', m.range || '');
    filter.setAttribute('value', m.filter || 'all');
    box.querySelector('.k-do__fig').innerHTML =
      '<p class="k-do__kf" data-key-figure><bdi dir="ltr" class="k-title k-num">' + esc(m.sumText) + '</bdi> <span class="k-body k-ink2">' + esc(cur(m.unit)) + '</span></p>' +
      '<p class="k-foot k-ink2 k-do__sum">' + esc(t('orders.summary', { n: m.count, amount: curText(m.avgText) })) + '</p>';

    var body = box.querySelector('.k-do__rows');
    body.textContent = '';
    var gs = groups(m.rows || []);
    gs.forEach(function (g) {
      var h = doc.createElement('h3');
      h.className = 'k-foot-s k-ink2 k-do__h';
      h.textContent = g.label;
      var list = doc.createElement('k-list');
      list.setAttribute('selectable', '');
      list.setAttribute('label', g.label);
      list.rows = g.rows.map(function (r) {
        return {
          id: r.id, icon: ICON[r.kind] || ICON.card,
          title: [r.ref ? '#' + r.ref : '', r.table != null && r.table !== '' ? 'T' + r.table : ''].filter(Boolean).join(' · '),
          /* Each part kept whole, so a narrow row breaks between parts. */
          subtitle: [r.method, r.time, r.staff].filter(Boolean).map(function (x) { return String(x).replace(/ /g, '\u00a0'); }).join(' · '),
          value: curText(r.amountText), trailing: 'chevron'
        };
      });
      body.appendChild(h);
      body.appendChild(list);
    });

    var em = box.querySelector('.k-do__em');
    em.hidden = !!gs.length;
    if (!gs.length) {
      var refunds = m.filter === 'refunds';
      var line = refunds ? t('orders.empty_refunds') : (m.range === 'today' && m.filter === 'all' ? t('orders.empty') : m.noOrders);
      em.innerHTML = '<p class="k-body">' + esc(line) + '</p>' +
        (refunds ? '<k-button variant="plain" data-do="clear" label="' + esc(t('action.clear_filter')) + '"></k-button>' : '');
    } else em.textContent = '';

    var more = box.querySelector('.k-do__more');
    more.hidden = !m.hiddenText;
    more.innerHTML = m.hiddenText ? '<p class="k-foot k-ink2">' + esc(m.hiddenText) + '</p><k-button variant="plain" data-do="all" label="' + esc(m.showAll) + '"></k-button>' : '';
  }

  function onAction(e) {
    var d = e.detail || {};
    var a = d.action || '';
    var P = api();
    if (!P) return;
    var src = e.target;
    if (a === 'k.segmented.select') {
      var v = (d.value && d.value.value) || d.id;
      if (src === range) P.setRange(v);
      else if (src === filter) P.setFilter(v);
      return;
    }
    if (a === 'k.list.select' && d.id) {
      var page = P.page && P.page();
      var row = page && page.querySelector('[data-tx-host] .p-table tr[data-arg="' + String(d.id).replace(/"/g, '') + '"]');
      if (row) row.click();
      return;
    }
    if (a === 'k.button.press') {
      var w = src && src.getAttribute && src.getAttribute('data-do');
      if (w === 'clear') P.setFilter('all');
      else if (w === 'all') P.showAll();
    }
  }

  /* Inside the shipped page, after its host: the shipped "show updated orders"
     control stays above the kit's rows, where it was above the table. A new
     visit builds a new page (Kiwi.appPage), so the box follows it. */
  function mount() {
    var P = api();
    var page = P && P.page && P.page();
    var host = page && page.querySelector('[data-tx-host]');
    if (!host) return false;
    if (box && box.isConnected && box.previousElementSibling === host) return true;
    box = doc.createElement('section');
    box.id = 'kit-orders';
    box.innerHTML = '<k-segmented size="compact" data-do="range" label="' + esc(t('range.today')) + '"></k-segmented>' +
      '<div class="k-do__fig"></div>' +
      '<k-segmented size="compact" data-do="filter" label="' + esc(t('orders.all')) + '"></k-segmented>' +
      '<div class="k-do__rows"></div><div class="k-do__em" hidden></div><div class="k-do__more" hidden></div>';
    range = box.querySelector('[data-do="range"]');
    range.options = ['today', 'yesterday', 'd7', 'd30'].map(function (k) { return { value: k, label: t('range.' + k) }; });
    filter = box.querySelector('[data-do="filter"]');
    filter.options = FILTERS.map(function (k) { return { value: k, label: t('orders.' + k) }; });
    box.addEventListener('kiwi:action', onAction);
    host.parentNode.insertBefore(box, host.nextSibling);
    sig = '';
    return true;
  }

  root.KiwiDashOrders = { paint: function () { sig = ''; paint(); } };

  if (doc.documentElement.getAttribute('data-skin-2027') === 'dashboard') {
    root.addEventListener('kiwi:orders-model', paint);
    paint();
  }
})(typeof window !== 'undefined' ? window : globalThis);
