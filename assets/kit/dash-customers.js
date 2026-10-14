/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-customers.js · the dashboard's Customers page on
 * the kit (spec §18.5; stage 5). Loaded only when the dashboard's flag is on
 * (kiwiSkin2027:dashboard, or ?skin=2027 for one load); with it off the
 * shipped customer book is untouched.
 *
 *   KiwiDashCustomers.paint()   redraw from KiwiClientsPage.model()
 *
 * The book is the shipped one (owner, 2026-10-15: shipped numbers first).
 * assets/clients-directory.js renders the page and publishes what it shows
 * (KiwiClientsPage.model(), the kiwi:customers-model event); this file draws
 * it: the summary, the overflow menu (Export, Loyalty program, Retention,
 * Campaign, whichever the shipped bar shows) and Add, the search field, the
 * segments with their counts, and one row per customer. Every gesture goes
 * back to the shipped page: a segment, the search, a row and every menu item
 * use the shipped control, so the shipped record, form and export run as
 * before. The four count cards are not drawn (§18.5, removed).
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-list') || !root.customElements.get('k-popover')) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc;

  /* The shipped segments, by the design's words (§18.5). */
  var SEGS = ['all', 'reg', 'vip', 'new', 'win'];
  var WORD = { all: 'customers.all', reg: 'customers.status.regular', vip: 'customers.segment.vip', new: 'customers.status.new', win: 'customers.status.inactive' };
  var MORE = { exp: 'customers.export', loyalty: 'customers.loyalty', retention: 'ia.retention', campaign: 'customers.campaign' };

  var box = null, sig = '';

  function api() { return root.KiwiClientsPage || null; }
  function model() {
    var P = api();
    try { return P && P.model ? P.model() : null; } catch (_) { return null; }
  }
  function shipped(sel) {
    var P = api();
    var page = P && P.page && P.page();
    return page ? page.querySelector(sel) : null;
  }
  function clickShipped(sel) { var el = shipped(sel); if (el) el.click(); }

  function paint() {
    if (!mount()) return;
    var m = model();
    if (!m) return;
    var s = JSON.stringify(m);
    if (s === sig) return;
    sig = s;

    box.querySelector('.k-dc__sum').textContent = t('customers.summary', { known: t('customers.known', { n: m.known }), contactable: m.contactable });
    box.querySelector('[data-do="more"]').hidden = !(m.more && m.more.length);
    box.querySelector('k-popover k-list').rows = (m.more || []).map(function (k) { return { id: k, title: t(MORE[k]) }; });

    var field = box.querySelector('k-field');
    if (field.value !== m.q) field.value = m.q;

    var seg = box.querySelector('k-segmented');
    seg.options = SEGS.map(function (k) { return { value: k, label: k === 'all' ? t(WORD.all) + ' ' + m.counts[k] : t('customers.filter', { status: t(WORD[k]), n: m.counts[k] }) }; });
    seg.setAttribute('value', m.seg);

    var list = box.querySelector('.k-dc__rows');
    list.hidden = !m.rows.length;
    list.rows = m.rows.map(function (c) {
      return {
        id: c.id, avatar: c.name, title: c.name,
        subtitle: [c.city, t('customers.last_visit', { relative: c.last }), t(WORD[c.seg] || WORD.reg)].filter(Boolean).join(' · '),
        value: c.spend, trailing: 'chevron'
      };
    });

    var em = box.querySelector('.k-dc__em');
    em.hidden = !m.empty;
    em.innerHTML = m.empty ? '<p class="k-body">' + esc(m.empty.title) + '</p><p class="k-foot k-ink2">' + esc(m.empty.text) + '</p>' +
      '<k-button variant="secondary" data-do="' + (m.empty.add ? 'add' : 'clear') + '" label="' + esc(m.empty.add || m.empty.clear) + '"></k-button>' : '';
  }

  function onAction(e) {
    var d = e.detail || {};
    var a = d.action || '';
    var w = e.target && e.target.getAttribute && e.target.getAttribute('data-do');
    if (a === 'k.button.press') {
      if (w === 'more') {
        var pop = box.querySelector('k-popover');
        pop.anchor = e.target;
        pop.setAttribute('open', '');
      } else if (w === 'add') clickShipped('#cd-new');
      else if (w === 'clear') clickShipped('[data-cd-clear]');
      return;
    }
    if (a === 'k.segmented.select') {
      var v = (d.value && d.value.value) || d.id;
      if (SEGS.indexOf(v) >= 0) clickShipped('[data-cd-seg="' + v + '"]');
      return;
    }
    if (a === 'k.list.select' && d.id) {
      if (w === 'more') {
        box.querySelector('k-popover').removeAttribute('open');
        if (MORE[d.id]) clickShipped('#cd-' + d.id);
      } else {
        clickShipped('tr[data-cd-id="' + String(d.id).replace(/"/g, '') + '"]');
      }
    }
  }

  /* The search types into the shipped field, which filters the shipped book. */
  function onInput(e) {
    if (!e.target || e.target.localName !== 'k-field') return;
    var q = shipped('#cd-q');
    if (!q) return;
    q.value = e.target.value;
    q.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* At the head of the shipped page body; a new visit builds a new page
     (Kiwi.appPage), so the box follows it. */
  function mount() {
    var cd = shipped('.cd');
    if (!cd) return false;
    if (box && box.isConnected && box.nextElementSibling === cd) return true;
    box = doc.createElement('section');
    box.id = 'kit-customers';
    box.innerHTML = '<div class="k-dc__top"><p class="k-foot k-ink2 k-dc__sum"></p><span class="k-dc__acts">' +
      '<k-button variant="icon" icon="more_horiz" data-do="more" aria-label="' + esc(t('action.more')) + '"></k-button>' +
      '<k-button variant="icon" icon="person_add" data-do="add" aria-label="' + esc(t('customers.add')) + '"></k-button></span></div>' +
      '<k-field search aria-label="' + esc(t('customers.search')) + '" placeholder="' + esc(t('customers.search')) + '"></k-field>' +
      '<k-segmented size="compact" label="' + esc(t('customers.all')) + '"></k-segmented>' +
      '<k-list class="k-dc__rows" selectable label="' + esc(t('nav.customers')) + '"></k-list><div class="k-dc__em" hidden></div>' +
      '<k-popover heading="' + esc(t('action.more')) + '"><k-list data-do="more" selectable label="' + esc(t('action.more')) + '"></k-list></k-popover>';
    box.addEventListener('kiwi:action', onAction);
    box.addEventListener('input', onInput);
    cd.parentNode.insertBefore(box, cd);
    sig = '';
    return true;
  }

  root.KiwiDashCustomers = { paint: function () { sig = ''; paint(); } };

  if (doc.documentElement.getAttribute('data-skin-2027') === 'dashboard') {
    root.addEventListener('kiwi:customers-model', paint);
    paint();
  }
})(typeof window !== 'undefined' ? window : globalThis);
