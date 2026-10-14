/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-retention.js · the dashboard's Retention page on
 * the kit (spec §12, Customers › Retention; stage 5). Loaded only when the
 * dashboard's flag is on (kiwiSkin2027:dashboard, or ?skin=2027 for one
 * load); with it off the shipped page is untouched.
 *
 *   KiwiDashRetention.paint()   redraw from KiwiRetentionPage.model()
 *
 * The groups are the shipped ones (owner, 2026-10-15: shipped numbers first).
 * assets/customer-retention.js renders the page and publishes what it shows
 * (KiwiRetentionPage.model(), the kiwi:retention-model event); this file
 * draws the tabs (k-segmented) and the Activity tab: the group counts as
 * tiles and one row per customer, longest absence first. A tab clicks the
 * shipped tab, so Groups and offers, Suggestions and Results stay the shipped
 * panels (their forms and sends are not redrawn). With retention off the
 * shipped invitation to turn it on is shown as is.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-list') || !root.customElements.get('k-kpi-grid')) return;
  var doc = root.document;
  var esc = K.esc;

  var box = null, sig = '';

  function api() { return root.KiwiRetentionPage || null; }
  function model() {
    var P = api();
    try { return P && P.model ? P.model() : null; } catch (_) { return null; }
  }
  function shipped(sel) {
    var P = api();
    var page = P && P.page && P.page();
    return page ? page.querySelector(sel) : null;
  }

  function paint() {
    if (!mount()) return;
    var m = model();
    if (!m) return;
    var s = JSON.stringify(m);
    if (s === sig) return;
    sig = s;

    box.hidden = !m.enabled;
    box.setAttribute('data-tab', m.tab);
    var seg = box.querySelector('k-segmented');
    seg.options = m.tabs.map(function (tb) { return { value: tb.id, label: tb.count ? tb.label + ' ' + tb.count : tb.label }; });
    seg.setAttribute('value', m.tab);
    seg.setAttribute('label', m.label);

    var act = m.tab === 'activity';
    var grid = box.querySelector('k-kpi-grid');
    grid.hidden = !act;
    grid.tiles = m.groups.map(function (g) { return { key: g.key, label: g.label, value: g.value, polarity: 'neutral' }; });
    var list = box.querySelector('k-list');
    list.hidden = !act || !m.rows.length;
    list.rows = m.rows.map(function (r) {
      return { id: r.id, avatar: r.name, title: r.name, subtitle: [r.since, r.rhythm, r.group].filter(Boolean).join(' · '), value: r.spend };
    });
    var em = box.querySelector('.k-drt__em');
    em.hidden = !act || !!m.rows.length;
    em.innerHTML = '<p class="k-body">' + esc(m.empty.title) + '</p><p class="k-foot k-ink2">' + esc(m.empty.text) + '</p>';
  }

  function onAction(e) {
    var d = e.detail || {};
    if (d.action !== 'k.segmented.select') return;
    var v = (d.value && d.value.value) || d.id;
    var tab = shipped('[data-cr-tab="' + String(v).replace(/"/g, '') + '"]');
    if (tab) tab.click();
  }

  /* Ahead of the shipped root, whose content is redrawn on every change; a
     new visit builds a new page (Kiwi.appPage), so the box follows it. */
  function mount() {
    var cr = shipped('[data-cr-root]');
    if (!cr) return false;
    if (box && box.isConnected && box.nextElementSibling === cr) return true;
    box = doc.createElement('section');
    box.id = 'kit-retention';
    box.innerHTML = '<k-segmented size="compact"></k-segmented><k-kpi-grid></k-kpi-grid>' +
      '<k-list></k-list><div class="k-drt__em" hidden></div>';
    box.addEventListener('kiwi:action', onAction);
    cr.parentNode.insertBefore(box, cr);
    sig = '';
    return true;
  }

  root.KiwiDashRetention = { paint: function () { sig = ''; paint(); } };

  if (doc.documentElement.getAttribute('data-skin-2027') === 'dashboard') {
    root.addEventListener('kiwi:retention-model', paint);
    paint();
  }
})(typeof window !== 'undefined' ? window : globalThis);
