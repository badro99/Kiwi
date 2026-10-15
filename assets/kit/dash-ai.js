/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-ai.js · the start of a Kiwi AI conversation on the
 * kit (spec §18.6; stage 5). Loaded only when the dashboard's flag is on
 * (kiwiSkin2027:dashboard, or ?skin=2027 for one load); with it off the
 * shipped assistant is untouched.
 *
 *   KiwiDashAI.paint()   redraw from KiwiAgentHome.model()
 *
 * assets/agent.js renders its hero and publishes what it offers
 * (KiwiAgentHome.model(), the kiwi:ai-home-model event); this file draws over
 * the hero, inside it, so the first question takes both away: ai.intro, the
 * Today card (today against yesterday at the same time, from the ledger
 * dateRange.js reads, with its source chip; only when today has a sale), then
 * ai.try and the suggestion rows, the trade's three questions first, then the
 * questions the hero's cards ask. A row asks through the shipped
 * conversation. The thread, the composer, the context rail and the tools stay
 * the shipped ones.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-list')) return;
  var doc = root.document;
  function clean(s) { return String(s).replace(/[⁦-⁩]/g, ''); }
  var t = function (k, a) { return clean(K.t(k, a)); };
  /* A list string (the trade's questions) stays a list: K.t joins one. */
  function list(k) {
    var S = root.KiwiStrings, v = S && S.t ? S.t(k) : [];
    return (Array.isArray(v) ? v : [v]).map(clean);
  }
  var esc = K.esc;

  var box = null, sig = '';

  function model() {
    var A = root.KiwiAgentHome;
    try { return A && A.model ? A.model() : null; } catch (_) { return null; }
  }
  function questions(m) {
    var trade = m.trade && m.trade.length ? m.trade : list('ai.suggest.restaurant');
    return [].concat(trade, m.cards || []).filter(Boolean);
  }

  function todayCard(p) {
    var F = root.KiwiFormat;
    if (!p || !p.count || !F) return '';
    var diff = Math.round(p.total) - Math.round(p.priorTotal);
    var key = diff < 0 ? 'ai.today_down' : diff > 0 ? 'ai.today_up' : 'ai.today_same';
    return '<div class="k-ai__today" data-today>' +
      '<p class="k-foot k-ink2">' + esc(t('ai.today', { time: F.time(p.at) })) + '</p>' +
      '<p class="k-body">' + esc(t(key, { n: p.count, amount: F.money(p.total, 0), delta: F.money(Math.abs(diff), 0) })) + '</p>' +
      '<span class="k-ai__src k-callout">' + esc(t('ai.source.sales_today')) + '</span></div>';
  }

  function paint() {
    var m = model();
    if (!m || !mount()) return;
    var s = JSON.stringify(m);
    if (s === sig) return;
    sig = s;
    box.querySelector('.k-ai__intro').textContent = t('ai.intro', { business: m.business || '' });
    box.querySelector('.k-ai__card').innerHTML = todayCard(m.pace);
    box.querySelector('k-list').rows = questions(m).map(function (q, i) { return { id: 'q' + i, title: q }; });
  }

  function onAction(e) {
    var d = e.detail || {};
    if (d.action !== 'k.list.select' || !d.id) return;
    var m = model();
    var q = m && questions(m)[+String(d.id).slice(1)];
    if (q && root.KiwiAgentHome) root.KiwiAgentHome.ask(q);
  }

  /* Inside the shipped hero: the first question removes the hero, and the
     kit's start with it. */
  function mount() {
    var hero = doc.querySelector('[data-fa-hero]');
    if (!hero) return false;
    if (box && box.isConnected && box.parentNode === hero) return true;
    box = doc.createElement('section');
    box.id = 'kit-ai';
    box.innerHTML = '<p class="k-body k-ink2 k-ai__intro"></p><div class="k-ai__card"></div>' +
      '<p class="k-foot-s k-ink2 k-ai__try">' + esc(t('ai.try')) + '</p>' +
      '<k-list ground="s1" label="' + esc(t('ai.try')) + '"></k-list>';
    box.addEventListener('kiwi:action', onAction);
    hero.insertBefore(box, hero.firstChild);
    /* On a phone the sheet is titled ai.title, as §18.6 draws it; the
       shipped trade line under it is not drawn there (kit.css). */
    var h3 = doc.documentElement.hasAttribute('data-k-phone') && hero.closest('.kiwi-drawer');
    h3 = h3 && h3.querySelector('.kiwi-drawer-head h3');
    if (h3) h3.textContent = t('ai.title');
    sig = '';
    return true;
  }

  root.KiwiDashAI = { paint: function () { sig = ''; paint(); } };

  if (doc.documentElement.getAttribute('data-skin-2027') === 'dashboard') {
    root.addEventListener('kiwi:ai-home-model', paint);
    paint();
  }
})(typeof window !== 'undefined' ? window : globalThis);
