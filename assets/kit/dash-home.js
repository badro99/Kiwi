/* ═════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/dash-home.js · the dashboard's Home on the kit (spec
 * §18.1; stage 5). Loaded only when the dashboard's flag is on
 * (kiwiSkin2027:dashboard, or ?skin=2027 for one load); with it off the
 * shipped Home is untouched.
 *
 *   KiwiDashHome.mount(box)   draws into box: the range presets, the key
 *                             figure, its comparisons, the goal line, the
 *                             tiles and the latest orders
 *   KiwiDashHome.paint()      redraw from KiwiDateRange.home()
 *
 * The figures are the shipped ones (owner, 2026-10-15: shipped numbers
 * first, the ledger later per §21.2). assets/dateRange.js computes them and
 * publishes what it drew (KiwiDateRange.home(), the kiwi:home-model event);
 * this file draws them and hands every tap back to the shipped control: a
 * range preset calls setDateRange, a tile or an order row clicks the shipped
 * node, so the shipped drawers open exactly as before. The revenue chart,
 * the payment mix and the insights stay the shipped ones below.
 * ═════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var K = root.KiwiKit;
  if (!K || !root.customElements || !root.customElements.get('k-kpi-grid') || !root.customElements.get('k-segmented')) return;
  var doc = root.document;
  var t = function (k, a) { return String(K.t(k, a)).replace(/[⁦-⁩]/g, ''); };
  var esc = K.esc;

  /* The shipped ranges, by the kit's presets (§18.1). */
  var RANGE = { today: 'aujourdhui', yesterday: 'hier', d7: 'septJours', d30: 'trenteJours' };
  var BACK = { aujourdhui: 'today', hier: 'yesterday', septJours: 'd7', trenteJours: 'd30' };
  /* §10.21: a delta's colour follows the figure's polarity, never its sign.
     The shipped tile keys; anything not listed reads neutral. */
  var POLARITY = {
    tx: 'up-good', panier: 'up-good', revenue: 'up-good', collected: 'up-good', marge: 'up-good', profit: 'up-good',
    regulars: 'up-good', retention: 'up-good', newClients: 'up-good', revPerDay: 'up-good', txPerDay: 'up-good',
    success: 'up-good', tips: 'up-good', occupation: 'up-good', adr: 'up-good', revpar: 'up-good',
    tauxRetour: 'up-bad', cogs: 'up-bad', receivable: 'up-bad'
  };

  var box = null, seg = null, grid = null, list = null, sig = '';

  function model() {
    var D = root.KiwiDateRange;
    try { return D && D.home ? D.home() : null; } catch (_) { return null; }
  }
  function tone(v, polarity) {
    if (!v || polarity === 'neutral') return 'neutral';
    var up = v > 0;
    if (polarity === 'up-bad') up = !up;
    return up ? 'good' : 'bad';
  }
  function deltaSpan(d, polarity) {
    var arrow = d.value > 0 ? K.icon('arrow_upward', 16) : (d.value < 0 ? K.icon('arrow_downward', 16) : '');
    return '<span class="k-dh__dl k-foot" data-tone="' + tone(d.value, polarity) + '">' + arrow +
      '<bdi dir="ltr" class="k-num">' + esc(d.text) + '</bdi></span>';
  }

  function paint() {
    if (!box) return;
    /* First in the shipped Home, whatever the layout (design-vexel-layout.js
       puts its own root first when it composes). */
    var std = box.parentNode;
    if (std && std.firstElementChild !== box) std.insertBefore(box, std.firstChild);
    var m = model();
    if (!m) return;
    var hero = m.hero || {}, goal = m.goal, tiles = m.tiles, feed = m.feed || {};
    var s = JSON.stringify([m.range, hero, goal, tiles, feed]);
    if (s === sig) return;
    sig = s;

    if (seg) seg.setAttribute('value', BACK[m.range] || '');

    var head = box.querySelector('.k-dh__fig');
    if (hero.unavailable) {
      head.innerHTML = '<p class="k-foot k-ink2 k-dh__lb">' + esc(hero.unavailable) + '</p>';
    } else {
      var deltas = (hero.deltas || []).map(function (d) {
        return '<li>' + deltaSpan(d, 'up-good') + '<span class="k-foot k-ink2"> ' + esc(d.label) + '</span></li>';
      }).join('');
      var goalHtml = '';
      if (goal && (m.range === 'aujourdhui' || m.range === 'hier')) {
        goalHtml = goal.unset
          ? '<p class="k-foot k-ink2 k-dh__goal">' + esc(goal.label) + '</p>'
          : '<p class="k-foot k-ink2 k-dh__goal"><span>' + esc(goal.label) + ' · <bdi dir="ltr" class="k-num">' + esc(goal.pct + ' %') + '</bdi></span>' +
            '<span class="k-dh__mark" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, (goal.ratio || 0) * 100)).toFixed(1) + '%"></i></span></p>';
      }
      head.innerHTML = '<p class="k-foot k-ink2 k-dh__lb">' + esc(hero.label || '') + '</p>' +
        '<p class="k-dh__kf" data-key-figure><bdi dir="ltr" class="k-display k-num">' + esc(hero.amountText || '') + '</bdi> <span class="k-heading k-ink2">' + esc(hero.unit || '') + '</span></p>' +
        goalHtml + (deltas ? '<ul class="k-dh__cmp">' + deltas + '</ul>' : '');
    }

    grid.hidden = !(tiles && tiles.items && tiles.items.length);
    if (tiles && tiles.items) {
      grid.tiles = tiles.items.map(function (it) {
        var tl = { key: it.key, label: it.label, value: it.value, unit: it.unit, polarity: POLARITY[it.key] || 'neutral' };
        if (it.delta != null) { tl.delta = it.delta; tl.deltaText = it.deltaText; tl.deltaNote = tiles.suffix || ''; }
        return tl;
      });
    }

    var lh = box.querySelector('.k-dh__lh');
    lh.textContent = feed.title || t('home.latest');
    var rows = feed.rows || [];
    list.rows = rows.map(function (r) {
      var where = r.table != null ? 'T' + r.table : '';
      return {
        id: r.key, title: [r.primary, where].filter(Boolean).join(' · '),
        subtitle: [r.time, r.who].filter(Boolean).join(' · '),
        value: r.amount + ' ' + (feed.unit || ''), trailing: 'chevron'
      };
    });
    list.hidden = !rows.length;
    var em = box.querySelector('.k-dh__em');
    em.hidden = !!rows.length;
    em.innerHTML = rows.length ? '' : '<p class="k-body">' + esc((feed.empty && feed.empty.title) || '') + '</p><p class="k-foot k-ink2">' + esc((feed.empty && feed.empty.sub) || '') + '</p>';
  }

  function clickShipped(sel) {
    var el = doc.querySelector(sel);
    if (el) el.click();
  }

  function onAction(e) {
    var d = e.detail || {};
    var a = d.action || '';
    if (a === 'k.segmented.select') {
      var v = (d.value && d.value.value) || d.id;
      var r = RANGE[v];
      if (r && root.KiwiDateRange && root.KiwiDateRange.setDateRange) root.KiwiDateRange.setDateRange(r);
      return;
    }
    if (a === 'k.kpi-grid.open' && d.id) { clickShipped('[data-kpi-band] .kpi-m[data-kpi="' + String(d.id).replace(/"/g, '') + '"]'); return; }
    if (a === 'k.list.select' && d.id) { clickShipped('[data-feed] .feed-row[data-order-key="' + String(d.id).replace(/"/g, '') + '"]'); return; }
  }

  function mount(b) {
    box = b;
    if (!box) return false;
    box.classList.add('k-dh');
    box.innerHTML = '<k-segmented size="compact" label="' + esc(t('range.today')) + '"></k-segmented>' +
      '<div class="k-dh__fig"></div>' +
      '<k-kpi-grid hidden></k-kpi-grid>' +
      '<h2 class="k-foot k-ink2 k-dh__lh"></h2><k-list label="' + esc(t('home.latest')) + '" selectable></k-list><div class="k-dh__em" hidden></div>';
    seg = box.querySelector('k-segmented');
    seg.options = ['today', 'yesterday', 'd7', 'd30'].map(function (k) { return { value: k, label: t('range.' + k) }; });
    grid = box.querySelector('k-kpi-grid');
    list = box.querySelector('k-list');
    box.addEventListener('kiwi:action', onAction);
    root.addEventListener('kiwi:home-model', paint);
    paint();
    return true;
  }

  root.KiwiDashHome = { mount: mount, paint: function () { sig = ''; paint(); } };

  /* Behind the flag this file mounts itself, inside the shipped Home, so it
     shows and hides with it; html[data-k-home] then stops drawing what it
     replaces. */
  function auto() {
    if (doc.documentElement.getAttribute('data-skin-2027') !== 'dashboard' || doc.getElementById('kit-home')) return;
    var std = doc.querySelector('#kw-main .dash-standard');
    if (!std) return;
    var b = doc.createElement('section');
    b.id = 'kit-home';
    std.insertBefore(b, std.firstChild);
    if (mount(b)) doc.documentElement.setAttribute('data-k-home', '');
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(typeof window !== 'undefined' ? window : globalThis);
