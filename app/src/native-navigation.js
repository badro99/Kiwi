/* Kiwi Pro · navigation. Les couches ouvertes, le retour (bouton Android,
 * balayage depuis le bord sur iOS), les feuilles qu'on tire vers le bas et les
 * gestes de période et de planning. Partie du runtime natif (native-runtime.js). */
(function () {
  'use strict';
  var N = window.__kiwiNativeRuntime;
  if (!N) return;
  var cap = N.cap, root = N.root, app = N.app, call = N.call,
      closeNativeMenus = N.closeNativeMenus;
  function nativeBlockingLayer() {
    if (openNativeLayers().length) return true;
    if (document.querySelector('#pair.on,.screen-pin.is-active,.screen-clockin.is-active,.screen-table.is-active')) return true;
    if (document.body && (document.body.classList.contains('nav-open') || document.body.classList.contains('kw-menu-open') || document.body.classList.contains('kiwi-native-menu-open'))) return true;
    var onboarding = document.querySelector('.kob-root');
    if (onboarding && !onboarding.classList.contains('kob-out')) return true;
    var dashboardLock = document.querySelector('[data-kiwi-lock]');
    if (dashboardLock) {
      var paintedLock = getComputedStyle(dashboardLock);
      if (paintedLock.display !== 'none' && paintedLock.visibility !== 'hidden') return true;
    }
    return [document.getElementById('pin-screen'), document.getElementById('clockin-screen'), document.querySelector('[data-kiwi-greet]')].some(function (node) {
      if (!node || node.hidden) return false;
      if (node.id !== 'pin-screen' && !node.classList.contains('is-visible')) return false;
      var style = getComputedStyle(node);
      // Entrance animations start at opacity zero, but the gate is already
      // active. Do not flash navigation or dark status text during that frame.
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function openNativeLayers() {
    return Array.prototype.slice.call(document.querySelectorAll(
      '.modal-veil.is-open,.drawer-veil.is-open,.cloture-veil.is-open,.kds-screen.is-open,#stock-screen.is-open,#cp-pin-screen,.kiwi-native-account.is-open,.kiwi-backdrop,.kiwi-drawer-backdrop,.kiwi-menu,.kt-shpop,[aria-modal="true"]'
    )).filter(function (node) {
      try { return getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden'; }
      catch (_) { return true; }
    });
  }

  function dismissNativeLayer(layer) {
    if (!layer) return false;
    if (layer.classList.contains('kiwi-native-privacy')) { layer.querySelector('[data-deny]').click(); return true; }
    if (layer.matches && layer.matches('.modal-veil,.drawer-veil,.cloture-veil,.kiwi-backdrop,.kiwi-drawer-backdrop')) {
      try { layer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (_) {}
      if (layer.classList.contains('is-open')) {
        var close = layer.querySelector('[data-modal-action="close"],.modal-close,.drawer-close,[aria-label="Fermer"],[aria-label="Close"]');
        if (close) close.click();
      }
    } else {
      var button = layer.querySelector('.kds-close,[data-action="close"],[aria-label="Fermer"],[aria-label="Close"]');
      if (button) button.click(); else layer.classList.remove('is-open');
    }
    return true;
  }

  /* iOS edge swipe = back. Android has the system back button (handleNativeBack);
     iOS has no such key, so a pushed screen or a sheet needs the gesture people
     expect: drag from the leading edge, the panel follows the finger, release
     past a third of the width (or with a flick) to go back, otherwise it springs
     home. Only where "back" has a meaning: the top drawer, modal or full-screen
     layer (a step inside it first, when it shows its own back button), the Team
     table detail and the takeaway order builder. Never on a gate, a PIN screen,
     the AI consent sheet or the menu, and never to leave the app. */
  var SWIPE_EDGE = 24;
  var SWIPE_STEP_BACK = '#rf-back,#ho-verify-back,#or-btn-back';
  function visibleNode(node) {
    if (!node || node.hidden) return false;
    var style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }
  function swipeBackTarget() {
    var body = document.body;
    if (!body || document.querySelector('.kiwi-native-privacy')) return null;
    if (body.classList.contains('nav-open') || body.classList.contains('kw-menu-open') || body.classList.contains('kiwi-native-menu-open')) return null;
    var layers = openNativeLayers().filter(function (node) { return !node.matches('#cp-pin-screen,.kiwi-menu'); });
    if (layers.length) {
      var layer = layers[layers.length - 1];
      var step = Array.prototype.slice.call(layer.querySelectorAll(SWIPE_STEP_BACK)).filter(visibleNode)[0];
      var panel = layer.querySelector('.kiwi-drawer,.kiwi-modal,.modal,.drawer') || layer;
      if (step) return { panel: panel, step: true, run: function () { step.click(); } };
      return { panel: panel, run: function () { dismissNativeLayer(layer); } };
    }
    var table = document.querySelector('#screen-table.is-active');
    var tableBack = document.getElementById('td-back');
    if (table && visibleNode(tableBack)) return { panel: table, run: function () { tableBack.click(); } };
    var builder = document.getElementById('vrap-builder');
    var builderBack = document.getElementById('vrap-back-board');
    if (builder && !builder.hidden && builderBack) return { panel: builder, run: function () { builderBack.click(); } };
    return null;
  }
  /* Swipe sideways across the Home chart to step
     Today → Yesterday → 7 days → 30 days (ticket #0107). Starts away from the
     screen edge so the edge swipe-back keeps working. Only a quick flick
     counts: a slow drag is the finger reading values off the chart, and
     letting go of it must not change the period. */
  function initPeriodSwipe() {
    var ORDER = ['aujourdhui', 'hier', 'septJours', 'trenteJours'];
    var FLICK_MS = 320;
    var sx = null, sy = 0, st = 0;
    document.addEventListener('touchstart', function (e) {
      sx = null;
      if (e.touches.length !== 1 || !document.body.classList.contains('kiwi-native-owner')) return;
      var t = e.touches[0];
      if (t.clientX < 28 || t.clientX > innerWidth - 28) return;
      if (!e.target.closest || !e.target.closest('.hero-left-chart')) return;
      if (openNativeLayers().length) return;
      sx = t.clientX; sy = t.clientY; st = Date.now();
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (sx == null) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      sx = null;
      if (Date.now() - st > FLICK_MS) return;
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      var cur = document.querySelector('.dash-date-range .dr-pill.on[data-range]');
      var i = ORDER.indexOf(cur ? cur.getAttribute('data-range') : 'aujourdhui');
      if (i < 0) i = 0;
      var rtl = document.documentElement.getAttribute('dir') === 'rtl';
      var step = (dx < 0) !== rtl ? 1 : -1;
      var next = ORDER[i + step];
      if (!next) return;
      var btn = document.querySelector('.dash-date-range .dr-pill[data-range="' + next + '"]');
      if (btn) btn.click();
    }, { passive: true });
  }

  /* After a tap in a swipeable filter row, keep the chosen pill in view even
     when the row re-renders and resets its scroll (ticket #0111). */
  function initChipRowFollow() {
    var PILL = '.st-cat-pill,.mi-pill,.eq-pill,.st-tab,.chip[data-action="tx-filter"]';
    document.addEventListener('click', function (e) {
      var pill = e.target.closest && e.target.closest(PILL);
      if (!pill || !pill.parentElement) return;
      var cls = String(pill.className).split(/\s+/)[0];
      setTimeout(function () {
        var on = document.querySelector('.' + cls + '.on,.' + cls + '[aria-selected="true"],.' + cls + '.is-active');
        if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
      }, 80);
    }, true);
  }

  /* Planning on a phone (ticket #0112): the desktop grid is people × days with
     44 pt cells, unreadable on 400 pt. Show one day at a time: a day strip,
     then one row per person with that day's shift. Every row taps the grid's
     own shift button, so editing, rules and publishing stay exactly as they
     are; the grid is only hidden, never replaced. */
  function initPlanningDayView() {
    var mq = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
    var chosen = null, pending = 0, lastTable = null, lastHtml = '', lastChosen = null;
    function build(force) {
      pending = 0;
      var cell = document.querySelector('.kt-plan-table .kt-plan-cell');
      var old = document.querySelector('.kt-phone-day');
      if (!cell || !(mq && mq.matches)) { if (old) old.remove(); return; }
      var table = cell.closest('table'), wrap = table.closest('.kt-plan-wrap') || table.parentElement;
      /* Rebuild only when the grid or the chosen day changed: a live ticker
         elsewhere on the page must never rebuild the rows under a finger. */
      if (!force && old && table === lastTable && chosen === lastChosen && table.innerHTML === lastHtml) return;
      lastTable = table; lastHtml = table.innerHTML;
      var heads = table.querySelectorAll('thead .kt-day-head');
      var rows = table.querySelectorAll('tbody tr');
      if (!heads.length || !rows.length) return;
      var days = [];
      var first = rows[0].querySelectorAll('.kt-plan-cell');
      for (var i = 0; i < first.length; i++) days.push((first[i].getAttribute('data-kt-cell') || '').split('|')[1]);
      var today = new Date(); var tISO = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
      if (days.indexOf(chosen) < 0) chosen = days.indexOf(tISO) >= 0 ? tISO : days[0];
      var idx = days.indexOf(chosen);
      lastChosen = chosen;
      var box = document.createElement('div');
      box.className = 'kt-phone-day';
      var strip = '<div class="kt-pd-strip" role="tablist">';
      for (var d = 0; d < heads.length; d++) {
        var h = heads[d];
        var dd = h.querySelector('.d'), mm = h.querySelector('.m'), hh = h.querySelector('.kt-day-hours');
        strip += '<button type="button" role="tab" class="kt-pd-day' + (d === idx ? ' on' : '') + (days[d] === tISO ? ' today' : '') + (h.classList.contains('is-closed') ? ' closed' : '') +
          '" aria-selected="' + (d === idx) + '" data-kt-pd="' + days[d] + '"><small>' + (mm ? mm.textContent : '') + '</small><b>' + (dd ? dd.textContent : '') + '</b><i>' + (hh ? hh.textContent : '') + '</i></button>';
      }
      strip += '</div>';
      var lang = (document.documentElement.getAttribute('lang') || 'fr').slice(0, 2);
      var addLbl = { en: 'Add', ar: 'إضافة' }[lang] || 'Ajouter';
      var list = '<div class="kt-pd-list">';
      for (var r = 0; r < rows.length; r++) {
        var mem = rows[r].querySelector('.kt-h-member');
        var c = rows[r].querySelectorAll('.kt-plan-cell')[idx];
        if (!mem || !c) continue;
        var btn = c.querySelector('.kt-sh');
        var av = mem.querySelector('.eq-av'), n = mem.querySelector('.n'), role = mem.querySelector('.r');
        var state = c.classList.contains('on') ? 'on' : c.classList.contains('off') ? 'off' : 'none';
        list += '<button type="button" class="kt-pd-row is-' + state + '" data-kt-pd-cell="' + c.getAttribute('data-kt-cell') + '"' + (btn && btn.disabled ? ' disabled' : '') + '>' +
          (av ? av.outerHTML : '') + '<span class="kt-pd-who"><b>' + (n ? n.innerHTML : '') + '</b><small>' + (role ? role.innerHTML : '') + '</small></span>' +
          '<span class="kt-pd-shift">' + (state === 'none' ? '<span class="kt-pd-add">+ ' + addLbl + '</span>' : (btn ? btn.innerHTML : '')) + '</span></button>';
      }
      list += '</div>';
      box.innerHTML = strip + list;
      if (old) old.replaceWith(box); else wrap.parentElement.insertBefore(box, wrap);
      wrap.classList.add('kt-phone-hidden');
      var on = box.querySelector('.kt-pd-day.on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    function schedule() { if (!pending) pending = setTimeout(build, 60); }
    document.addEventListener('click', function (e) {
      var day = e.target.closest && e.target.closest('[data-kt-pd]');
      if (day) { chosen = day.getAttribute('data-kt-pd'); build(true); return; }
      var row = e.target.closest && e.target.closest('[data-kt-pd-cell]');
      if (row) {
        var want = row.getAttribute('data-kt-pd-cell');
        var cells = document.querySelectorAll('.kt-plan-table [data-kt-cell]');
        for (var i = 0; i < cells.length; i++) if (cells[i].getAttribute('data-kt-cell') === want) { var b = cells[i].querySelector('.kt-sh'); if (b) b.click(); break; }
      }
    });
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (t.closest && t.closest('.kt-phone-day')) continue;
        schedule(); return;
      }
    }).observe(document.body, { childList: true, subtree: true });
    if (mq && mq.addEventListener) mq.addEventListener('change', schedule);
  }

  function initNativeSwipeBack() {
    if (!cap || !cap.getPlatform || cap.getPlatform() !== 'ios') return;
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var g = null;
    function reset(panel, animate) {
      if (!panel) return;
      if (animate && !(reduce && reduce.matches)) {
        panel.style.transition = 'transform 310ms cubic-bezier(0.34, 1.45, 0.5, 1)';
        panel.style.transform = 'translate3d(0,0,0)';
        setTimeout(function () { panel.style.removeProperty('transition'); panel.style.removeProperty('transform'); }, 330);
      } else {
        panel.style.removeProperty('transition');
        panel.style.removeProperty('transform');
      }
    }
    document.addEventListener('touchstart', function (event) {
      g = null;
      if (!event.touches || event.touches.length !== 1) return;
      var t = event.touches[0];
      var rtl = root.getAttribute('dir') === 'rtl';
      if (rtl ? t.clientX < window.innerWidth - SWIPE_EDGE : t.clientX > SWIPE_EDGE) return;
      var target = swipeBackTarget();
      if (!target) return;
      g = { x: t.clientX, y: t.clientY, t: Date.now(), sign: rtl ? -1 : 1, dx: 0, engaged: false, target: target };
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', function (event) {
      if (!g || !event.touches || !event.touches[0]) return;
      var t = event.touches[0];
      var dx = (t.clientX - g.x) * g.sign;
      var dy = t.clientY - g.y;
      if (!g.engaged) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
        if (dx < 10) return;
        g.engaged = true;
        g.target.panel.style.transition = 'none';
      }
      if (event.cancelable) event.preventDefault();
      g.dx = Math.max(0, dx);
      g.target.panel.style.transform = 'translate3d(' + (g.dx * g.sign) + 'px,0,0)';
    }, { passive: false, capture: true });
    function finish() {
      if (!g) return;
      var s = g; g = null;
      if (!s.engaged) return;
      var panel = s.target.panel;
      var width = panel.getBoundingClientRect().width || window.innerWidth;
      var speed = s.dx / Math.max(1, Date.now() - s.t);
      var commit = s.dx > width / 3 || (speed > 0.5 && s.dx > 40);
      if (!commit || s.target.step) {
        reset(panel, true);
        if (commit) s.target.run();
        return;
      }
      if (reduce && reduce.matches) { reset(panel, false); s.target.run(); return; }
      panel.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      panel.style.transform = 'translate3d(' + (width * s.sign) + 'px,0,0)';
      setTimeout(function () {
        s.target.run();
        /* Drawers remove themselves; screens and veils stay in the DOM and
           must not keep the off-screen transform for their next opening. */
        setTimeout(function () { reset(panel, false); }, 320);
      }, 190);
    }
    document.addEventListener('touchend', finish, { passive: true, capture: true });
    document.addEventListener('touchcancel', function () { if (g && g.engaged) reset(g.target.panel, true); g = null; }, { passive: true, capture: true });
  }

  function nativeExitCopy() {
    var lang = String(root.lang || 'fr').toLowerCase();
    if (lang.indexOf('ar') === 0) return 'هل تريد إغلاق Kiwi Pro؟';
    if (lang.indexOf('en') === 0) return 'Close Kiwi Pro?';
    return 'Fermer Kiwi Pro ?';
  }

  function handleNativeBack(event) {
    var layers = openNativeLayers();
    if (layers.length) return dismissNativeLayer(layers[layers.length - 1]);
    if (document.body.classList.contains('ticket-open')) {
      document.body.classList.remove('ticket-open');
      return true;
    }
    if (document.body.classList.contains('nav-open') || document.body.classList.contains('kiwi-native-menu-open')) {
      closeNativeMenus();
      return true;
    }
    var builder = document.getElementById('vrap-builder');
    var builderBack = document.getElementById('vrap-back-board');
    if (builder && !builder.hidden && builderBack) {
      builderBack.click();
      return true;
    }
    if (event && event.canGoBack && window.history && history.length > 1) {
      history.back();
      return true;
    }
    if (/kiwi-caisse\.html$/i.test(location.pathname) && !window.confirm(nativeExitCopy())) return true;
    call(app, 'exitApp');
    return true;
  }
  /* Every sheet that shows a grab handle can be pulled down to close it, as
     the bill sheet already could. Only from the handle band at the top of a
     sheet that sits on the bottom edge; the content below still scrolls. */
  function initSheetDrag() {
    var SHEETS = '.kiwi-backdrop .kiwi-modal,.modal-veil.is-open > .modal';
    var drag = null;
    function hasHandle(sheet) {
      if (sheet.querySelector(':scope > .modal-handle')) return true;
      try { var mark = getComputedStyle(sheet, '::before').content; return !!mark && mark !== 'none' && mark !== 'normal'; } catch (_) { return false; }
    }
    document.addEventListener('touchstart', function (event) {
      drag = null;
      var touch = event.touches && event.touches.length === 1 ? event.touches[0] : null;
      var sheet = touch && event.target.closest ? event.target.closest(SHEETS) : null;
      if (!sheet || event.target.closest('input,textarea,select,button,a')) return;
      var box = sheet.getBoundingClientRect();
      if (box.bottom < window.innerHeight - 4 || touch.clientY - box.top > 40 || !hasHandle(sheet)) return;
      drag = { sheet:sheet, layer:sheet.closest('.kiwi-backdrop,.modal-veil'), y:touch.clientY, t:Date.now(), dy:0 };
    }, { passive:true });
    document.addEventListener('touchmove', function (event) {
      if (!drag || !event.touches || !event.touches[0]) return;
      drag.dy = Math.max(0, event.touches[0].clientY - drag.y);
      drag.sheet.style.transition = 'none';
      drag.sheet.style.transform = 'translateY(' + drag.dy + 'px)';
    }, { passive:true });
    function release() {
      if (!drag) return;
      var d = drag; drag = null;
      var speed = d.dy / Math.max(1, Date.now() - d.t);
      d.sheet.style.transition = 'transform .24s var(--glide,cubic-bezier(.32,.72,0,1))';
      if (d.dy > 96 || (d.dy > 32 && speed > 0.6)) {
        d.sheet.style.transform = 'translateY(100%)';
        dismissNativeLayer(d.layer);
        // The till and Team hide a closed sheet rather than remove it: clear the
        // pull so the next opening starts from rest.
        setTimeout(function () { d.sheet.style.removeProperty('transform'); d.sheet.style.removeProperty('transition'); }, 320);
      } else {
        d.sheet.style.removeProperty('transform');
        setTimeout(function () { d.sheet.style.removeProperty('transition'); }, 260);
      }
    }
    document.addEventListener('touchend', release, { passive:true });
    document.addEventListener('touchcancel', release, { passive:true });
  }
  /* Partagé avec les morceaux suivants du runtime natif. */
  N.nativeBlockingLayer = nativeBlockingLayer; N.openNativeLayers = openNativeLayers;
  N.initPeriodSwipe = initPeriodSwipe; N.initChipRowFollow = initChipRowFollow;
  N.initPlanningDayView = initPlanningDayView; N.initNativeSwipeBack = initNativeSwipeBack;
  N.handleNativeBack = handleNativeBack; N.initSheetDrag = initSheetDrag;
})();
