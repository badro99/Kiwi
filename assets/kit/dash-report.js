/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-report.js · the head of the dashboard's Report on
 * the kit (spec §12, Today › Report; stage 5). Loaded only when the
 * dashboard's flag is on (kiwiSkin2027:dashboard, or ?skin=2027 for one
 * load); with it off the shipped day report is untouched.
 *
 *   KiwiDashReport.paint()   redraw from KiwiReportPage.model()
 *
 * The figures are the shipped ones (owner, 2026-10-15: shipped numbers first,
 * the ledger later per §21.2). assets/day-report-dash.js renders the report
 * and publishes what it drew (KiwiReportPage.model(), the kiwi:report-model
 * event); this file draws its head: the day and its status, the day's net as
 * the key figure with its named baseline, the three other figures as tiles,
 * and Export, one menu of the three exports (§12). The day selector, the
 * fourteen-day strip and every section below stay the shipped ones.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-kpi-grid') || !root.customElements.get('k-popover')) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc;

  /* §10.21: the net, the orders and the basket read up-good. */
  var POLARITY = { txns: 'up-good', basket: 'up-good' };
  var EXPORTS = ['printable', 'sales', 'day_report'];

  var box = null, sig = '';

  function api() { return root.KiwiReportPage || null; }
  function model() {
    var P = api();
    try { return P && P.model ? P.model() : null; } catch (_) { return null; }
  }

  function deltaSpan(d) {
    if (!d) return '';
    if (d.value == null) return '<li class="k-foot k-ink2">' + esc(d.note + ' · ' + d.none) + '</li>';
    var tone = d.value > 0 ? 'good' : d.value < 0 ? 'bad' : 'neutral';
    var arrow = d.value > 0 ? K.icon('arrow_upward', 16) : (d.value < 0 ? K.icon('arrow_downward', 16) : '');
    return '<li><span class="k-dh__dl k-foot" data-tone="' + tone + '">' + arrow + '<bdi dir="ltr" class="k-num">' + esc(d.text) + '</bdi></span>' +
      '<span class="k-foot k-ink2"> ' + esc(d.note) + '</span></li>';
  }

  function paint() {
    if (!mount()) return;
    var m = model();
    if (!m) return;
    var s = JSON.stringify(m);
    if (s === sig) return;
    sig = s;

    box.querySelector('.k-dr__day').textContent = [m.dayLabel, m.rel, m.status].filter(Boolean).join(' · ');
    box.querySelector('[data-do="export"]').hidden = !!m.empty;
    var fig = box.querySelector('.k-dr__fig');
    var grid = box.querySelector('k-kpi-grid');
    var em = box.querySelector('.k-dr__em');
    fig.hidden = grid.hidden = !!m.empty;
    em.hidden = !m.empty;
    if (m.empty) {
      em.innerHTML = '<p class="k-body">' + esc(m.empty) + '</p><p class="k-foot k-ink2">' + esc(m.emptyHint || '') + '</p>' +
        (m.goLast ? '<k-button variant="secondary" data-do="last" label="' + esc(m.goLast.label) + '"></k-button>' : '');
      return;
    }
    em.textContent = '';
    fig.innerHTML = '<p class="k-foot k-ink2 k-dr__lb">' + esc(m.netLabel) + '</p>' +
      '<p class="k-dr__kf" data-key-figure><bdi dir="ltr" class="k-display k-num">' + esc(m.netText) + '</bdi> <span class="k-heading k-ink2">' + esc(m.unit) + '</span></p>' +
      '<ul class="k-dh__cmp">' + deltaSpan(m.netDelta) + '</ul>';
    grid.tiles = (m.tiles || []).map(function (it) {
      var tl = { key: it.key, label: it.label, value: it.value, unit: it.unit, polarity: POLARITY[it.key] || 'neutral' };
      if (it.delta && it.delta.value != null) { tl.delta = it.delta.value; tl.deltaText = it.delta.text; tl.deltaNote = it.delta.note; }
      return tl;
    });
  }

  function openExport() {
    var pop = box.querySelector('k-popover');
    pop.anchor = box.querySelector('[data-do="export"]');
    pop.setAttribute('open', '');
  }

  function onAction(e) {
    var d = e.detail || {};
    var a = d.action || '';
    var P = api();
    if (!P) return;
    var w = e.target && e.target.getAttribute && e.target.getAttribute('data-do');
    if (a === 'k.button.press') {
      if (w === 'export') openExport();
      else if (w === 'last') {
        var m = model();
        var b = m && m.goLast && doc.querySelector('.dash-genpage .kdr-empty [data-day="' + String(m.goLast.day).replace(/"/g, '') + '"]');
        if (b) b.click();
      }
      return;
    }
    if (a === 'k.list.select' && w === 'exports') {
      box.querySelector('k-popover').removeAttribute('open');
      if (d.id === 'printable') P.exportPrintable();
      else if (d.id === 'sales') P.exportSales();
      else if (d.id === 'day_report') P.exportDay();
    }
  }

  /* Each render builds a new page (Kiwi.appPage), so the head follows it:
     after the shipped nav bar, which keeps the day selector. */
  function mount() {
    var nav = doc.querySelector('.dash-genpage .kdr-nav');
    if (!nav) return false;
    if (box && box.isConnected && box.previousElementSibling === nav) return true;
    box = doc.createElement('section');
    box.id = 'kit-report';
    box.innerHTML = '<div class="k-dr__top"><p class="k-foot k-ink2 k-dr__day"></p>' +
      '<k-button variant="secondary" size="S" icon="download" data-do="export" label="' + esc(t('report.export')) + '"></k-button></div>' +
      '<div class="k-dr__fig"></div><k-kpi-grid></k-kpi-grid><div class="k-dr__em" hidden></div>' +
      '<k-popover heading="' + esc(t('report.export')) + '"><k-list data-do="exports" selectable label="' + esc(t('report.export')) + '"></k-list></k-popover>';
    box.querySelector('k-list').rows = EXPORTS.map(function (k) { return { id: k, title: t('export.' + k) }; });
    box.addEventListener('kiwi:action', onAction);
    nav.parentNode.insertBefore(box, nav.nextSibling);
    sig = '';
    return true;
  }

  root.KiwiDashReport = { paint: function () { sig = ''; paint(); } };

  if (doc.documentElement.getAttribute('data-skin-2027') === 'dashboard') {
    root.addEventListener('kiwi:report-model', paint);
    paint();
  }
})(typeof window !== 'undefined' ? window : globalThis);
