/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-compliance.js · the dashboard's Compliance on the
 * kit (spec §12, Money › Compliance; stage 5). Loaded only when the
 * dashboard's flag is on (kiwiSkin2027:dashboard, or ?skin=2027 for one
 * load); with it off the shipped page is untouched.
 *
 *   KiwiDashCompliance.paint()   redraw from KiwiConformite.model()
 *
 * §12: Compliance is a list of obligations, each with a status, opening its
 * screen; on iPad and desktop a split view, the list at 360 and the detail
 * beside it. Each shipped tab (Z, hygiene, equipment, documents) is a row
 * (§21.1, the shipped tabs become rows); assets/conformite.js publishes them
 * with a status read from the data the tab draws. A row clicks the shipped
 * tab, whose screen stays the shipped one, beside the list. A real account
 * has no tabs, so the shipped page shows as is.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-list')) return;
  var doc = root.document;

  /* The design's icon per obligation. */
  var ICON = { z: 'receipt_long', hyg: 'checklist', eq: 'settings', doc: 'description' };

  var box = null, sig = '';

  function model() {
    var C = root.KiwiConformite;
    try { return C && C.model ? C.model() : null; } catch (_) { return null; }
  }

  function paint() {
    var m = model();
    if (!m) { sig = ''; return; }
    if (!mount()) return;
    var s = JSON.stringify(m);
    if (s === sig) return;
    sig = s;
    box.querySelector('k-list').rows = m.rows.map(function (r) {
      return { id: r.key, icon: ICON[r.key], title: r.label, subtitle: r.status, selected: r.key === m.tab, trailing: 'chevron' };
    });
  }

  function onAction(e) {
    var d = e.detail || {};
    if (d.action !== 'k.list.select' || !d.id) return;
    var tab = doc.querySelector('[data-conformite-root] .cf-tab[data-tab="' + String(d.id).replace(/"/g, '') + '"]');
    if (tab) tab.click();
  }

  /* In the shipped page, between its head and its body; the page redraws its
     whole root on every change, so the list follows it. */
  function mount() {
    var page = doc.querySelector('[data-conformite-root] .cf-page');
    var body = page && page.querySelector('.cf-body');
    if (!body) return false;
    if (box && box.isConnected && box.nextElementSibling === body) return true;
    box = doc.createElement('nav');
    box.id = 'kit-compliance';
    box.innerHTML = '<k-list selectable></k-list>';
    box.querySelector('k-list').setAttribute('label', (page.querySelector('.cf-title') || {}).textContent || '');
    box.addEventListener('kiwi:action', onAction);
    page.insertBefore(box, body);
    sig = '';
    return true;
  }

  root.KiwiDashCompliance = { paint: function () { sig = ''; paint(); } };

  if (doc.documentElement.getAttribute('data-skin-2027') === 'dashboard') {
    root.addEventListener('kiwi:compliance-model', paint);
    paint();
  }
})(typeof window !== 'undefined' ? window : globalThis);
