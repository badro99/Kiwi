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
 * node, so the shipped drawers open exactly as before.
 *
 * On a phone (html[data-k-phone], set by dash-phone.js below 768 px) Home is
 * §18.1's whole screen: the date, the key figure with its goal line and its
 * comparison, then the presets, the revenue chart (<k-chart>, over the series
 * the shipped chart draws, today only), four tiles (the margin and success
 * tiles go, §18.1 "Removed") and the three latest orders with "See all". The
 * shipped sections below Home are not drawn there (kit.css). Wider, the
 * order and the content stay as stage 5 (1) landed them.
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
  /* §18.1 removes the margin tile (Report shows margin) and the success
     rate; the phone draws the rest, the shipped order kept. */
  var PHONE_DROP = { marge: 1, success: 1 };
  var PHONE_ROWS = 3;

  var box = null, seg = null, grid = null, list = null, chart = null, sig = '', csig = '';

  function phone() { return doc.documentElement.hasAttribute('data-k-phone'); }
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
  /* The shipped labels are set in capitals ("VS HIER"); the kit's are
     sentences (§9.6). Only an all-capitals label is lowered, and the unit
     (MAD) keeps its capitals. */
  function sentence(s, unit, first) {
    s = String(s || '');
    if (!/[A-ZÀ-Þ]/.test(s) || /[a-zß-ÿ]/.test(s)) return s;
    var out = s.toLowerCase();
    if (unit) out = out.split(String(unit).toLowerCase()).join(unit);
    return first ? out.charAt(0).toUpperCase() + out.slice(1) : out;
  }
  function shippedText(sel) {
    var el = doc.querySelector(sel);
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  /* The shipped series, on the business day's hours (§10.22): h counts the
     hours since the store's cutoff; the live point keeps its fraction. */
  function series(c) {
    if (!c || !c.hourly || c.range !== 'aujourdhui' || !c.rev || !c.labels) return null;
    var B = root.KiwiBusinessDay, cutoff = NaN;
    try { if (B && B.resolve) cutoff = B.resolve({}).cutoff; } catch (_) {}
    if (!isFinite(cutoff)) return null;
    var hours = [], last = -1;
    c.labels.forEach(function (l, i) {
      var H = parseInt(String(l), 10);
      var h = isFinite(H) ? (H - cutoff + 24) % 24 : NaN;
      if (isFinite(h) && h < last) h += 24;
      if (isFinite(h)) last = h;
      hours.push(h);
    });
    function pts(arr, tip) {
      var out = [];
      (arr || []).forEach(function (v, i) {
        if (v == null || !isFinite(hours[i])) return;
        var h = hours[i];
        if (tip != null && i === tip && i > 0 && isFinite(hours[i - 1])) h = hours[i - 1] + (c.within || 0);
        if (h > 24) return;
        out.push({ h: h, v: Number(v) });
      });
      return out;
    }
    var today = pts(c.rev, c.tip >= 0 ? c.tip : null);
    if (!today.length) return null;
    var lastP = today[today.length - 1];
    var at = (cutoff + Math.floor(lastP.h)) % 24, mins = Math.round((lastP.h % 1) * 60) % 60;
    var time = (at < 10 ? '0' : '') + at + ':' + (mins < 10 ? '0' : '') + mins;
    var base = c.prev ? pts(c.prev, null) : null;
    return {
      today: today, baseline: base && base.length ? base : null, cutoff: cutoff, nowH: lastP.h,
      baselineKey: 'yesterday', baselineTime: time,
      delta: c.prevValue != null && c.value != null ? Number(c.value) - Number(c.prevValue) : null
    };
  }

  function paintChart(m) {
    if (!chart) return;
    var s = phone() ? series(m.chart) : null;
    chart.hidden = !s;
    var key = s ? JSON.stringify(s) : '';
    if (key === csig) return;
    csig = key;
    if (s) chart.series = s;
  }

  /* Phone order (§18.1): the figure first, then the presets; wider, the
     presets lead, as stage 5 (1) landed it. */
  function arrange() {
    if (!box || !seg) return;
    var fig = box.querySelector('.k-dh__fig');
    if (phone()) { if (fig.nextElementSibling !== seg) box.insertBefore(seg, fig.nextElementSibling); }
    else if (box.firstElementChild !== seg) box.insertBefore(seg, box.firstChild);
  }

  function paint() {
    if (!box) return;
    /* First in the shipped Home, whatever the layout (design-vexel-layout.js
       puts its own root first when it composes). */
    var std = box.parentNode;
    if (std && std.firstElementChild !== box) std.insertBefore(box, std.firstChild);
    var m = model();
    if (!m) return;
    arrange();
    paintChart(m);
    var ph = phone();
    var hero = m.hero || {}, goal = m.goal, tiles = m.tiles, feed = m.feed || {};
    var date = [shippedText('[data-dr-label]'), shippedText('[data-dr-sub]')].filter(Boolean).join(' · ');
    var s = JSON.stringify([ph, m.range, hero, goal, tiles, feed, date]);
    if (s === sig) return;
    sig = s;

    if (seg) seg.setAttribute('value', BACK[m.range] || '');
    var F = root.KiwiFormat;
    var unit = hero.unit || '';

    var head = box.querySelector('.k-dh__fig');
    if (hero.unavailable) {
      head.innerHTML = '<p class="k-foot k-ink2 k-dh__lb">' + esc(hero.unavailable) + '</p>';
    } else {
      var deltas = (hero.deltas || []).map(function (d) {
        return '<li>' + deltaSpan(d, 'up-good') + '<span class="k-foot k-ink2"> ' + esc(ph ? sentence(d.label, unit) : d.label) + '</span></li>';
      }).join('');
      var goalHtml = '';
      if (goal && (m.range === 'aujourdhui' || m.range === 'hier')) {
        var mark = '<span class="k-dh__mark" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, (goal.ratio || 0) * 100)).toFixed(1) + '%"></i></span>';
        if (goal.unset) goalHtml = '<p class="k-foot k-ink2 k-dh__goal">' + esc(ph ? sentence(goal.label, unit, true) : goal.label) + '</p>';
        else if (ph && F && goal.goal) {
          /* §18.1: "82% of the 23,500 MAD goal", from the shipped goal and share. */
          goalHtml = '<p class="k-foot k-ink2 k-dh__goal"><span>' + esc(t('home.goal', { pct: F.share(goal.ratio || 0), amount: F.money(goal.goal, 0) })) + '</span>' + mark + '</p>';
        } else {
          goalHtml = '<p class="k-foot k-ink2 k-dh__goal"><span>' + esc(goal.label) + ' · <bdi dir="ltr" class="k-num">' + esc(goal.pct + ' %') + '</bdi></span>' + mark + '</p>';
        }
      }
      head.innerHTML = '<p class="k-foot k-ink2 k-dh__date">' + K.icon('today', 16) + '<span>' + esc(sentence(date, unit, true)) + '</span></p>' +
        '<p class="k-foot k-ink2 k-dh__lb">' + esc(hero.label || '') + '</p>' +
        '<p class="k-dh__kf" data-key-figure' + (ph && hero.label ? ' aria-label="' + esc(sentence(hero.label, unit, true) + ' ' + (hero.amountText || '') + ' ' + unit) + '"' : '') + '><bdi dir="ltr" class="k-display k-num">' + esc(hero.amountText || '') + '</bdi> <span class="k-heading k-ink2">' + esc(unit) + '</span></p>' +
        goalHtml + (deltas ? '<ul class="k-dh__cmp">' + deltas + '</ul>' : '');
    }

    grid.hidden = !(tiles && tiles.items && tiles.items.length);
    if (tiles && tiles.items) {
      grid.tiles = tiles.items.filter(function (it) { return !(ph && PHONE_DROP[it.key]); }).map(function (it) {
        var tl = { key: it.key, label: it.label, value: it.value, unit: it.unit, polarity: POLARITY[it.key] || 'neutral' };
        if (it.delta != null) { tl.delta = it.delta; tl.deltaText = it.deltaText; tl.deltaNote = tiles.suffix || ''; }
        return tl;
      });
    }

    var lh = box.querySelector('.k-dh__lh');
    lh.textContent = feed.title || t('home.latest');
    var rows = feed.rows || [];
    var shown = ph ? rows.slice(0, PHONE_ROWS) : rows;
    var out = shown.map(function (r) {
      var where = r.table != null ? 'T' + r.table : '';
      return {
        id: r.key, title: [r.primary, where].filter(Boolean).join(' · '),
        subtitle: [r.time, r.who].filter(Boolean).join(' · '),
        value: r.amount + ' ' + (feed.unit || ''), trailing: 'chevron'
      };
    });
    if (ph && rows.length) {
      /* §18.1: the group's last row opens Orders, with the day's count. */
      var tx = (tiles && tiles.items || []).filter(function (it) { return it.key === 'tx'; })[0];
      var n = tx ? parseInt(String(tx.value).replace(/\D/g, ''), 10) : NaN;
      out.push({ id: '__all', title: t('home.see_all_orders', { n: isFinite(n) ? n : rows.length }), trailing: 'chevron' });
    }
    list.rows = out;
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
    if (a === 'k.list.select' && d.id === '__all') { clickShipped('.kw-tabbar .kw-tab[data-kw-tab="commandes"]'); return; }
    if (a === 'k.list.select' && d.id) { clickShipped('[data-feed] .feed-row[data-order-key="' + String(d.id).replace(/"/g, '') + '"]'); return; }
  }

  function mount(b) {
    box = b;
    if (!box) return false;
    box.classList.add('k-dh');
    box.innerHTML = '<k-segmented size="compact" label="' + esc(t('range.today')) + '"></k-segmented>' +
      '<div class="k-dh__fig"></div>' +
      '<k-chart class="k-dh__chart" hidden></k-chart>' +
      '<k-kpi-grid hidden></k-kpi-grid>' +
      '<h2 class="k-foot k-ink2 k-dh__lh"></h2><k-list label="' + esc(t('home.latest')) + '" selectable></k-list><div class="k-dh__em" hidden></div>';
    seg = box.querySelector('k-segmented');
    seg.options = ['today', 'yesterday', 'd7', 'd30'].map(function (k) { return { value: k, label: t('range.' + k) }; });
    grid = box.querySelector('k-kpi-grid');
    list = box.querySelector('k-list');
    chart = root.customElements.get('k-chart') ? box.querySelector('k-chart') : null;
    box.addEventListener('kiwi:action', onAction);
    root.addEventListener('kiwi:home-model', paint);
    /* dash-phone.js sets or clears html[data-k-phone] as the width crosses
       768 px: Home redraws in that form. */
    var was = '';
    if (root.MutationObserver) new root.MutationObserver(function () {
      var now = phone() + '|' + doc.documentElement.lang;
      if (now === was) return;
      was = now; sig = ''; csig = ''; paint();
    }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-k-phone', 'lang'] });
    was = phone() + '|' + doc.documentElement.lang;
    paint();
    return true;
  }

  root.KiwiDashHome = { mount: mount, paint: function () { sig = ''; csig = ''; paint(); } };

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
