/* Premium feel layer (docs/roadmaps/2026-10-10-premium-feel.md, Tier 1).
 * Four things a web view gives away and a native app never does:
 *   1. Touch-down response. Every control answers the instant a finger lands
 *      (scale .97, .985 on large surfaces) and springs back on release. The
 *      Web Animations API animates the `scale` property, so no element's own
 *      `transform` or `transition` is touched.
 *   2. Sticky hover. iOS keeps :hover on whatever was tapped last, so a
 *      button stays lit after the finger has gone. On a touch-only device the
 *      :hover selectors are removed from every stylesheet, including the ones
 *      surfaces inject later.
 *   3. One haptic per meaning: a selection tick when a segmented control or
 *      tab changes under a real finger, and one per data point while the
 *      finger reads the revenue chart. Key presses, success and errors keep
 *      their existing light, success and error haptics.
 *   4. The chart reads under a slow finger (touch-action pan-y), a quick
 *      flick still steps the period (initPeriodSwipe).
 *   5. A paid sale gets its moment: check, amount, success haptic.
 *   6. The till always says when sales are waiting to be sent. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var touchOnly = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  var EASE = 'cubic-bezier(.2,.8,.2,1)';

  /* Haptics go through KiwiHaptics (assets/kit/haptics.js, §15): a segment change
     is a Choose bracket, a chart scrub one Choose per bucket inside one bracket,
     a paid sale a Paid on the local record. The 40 ms tick throttle lives there. */
  function khPlay(cls, prefix, a, b) {
    try { var k = window.KiwiHaptics; if (k) k.play(cls, k.gid(prefix), a, b); } catch (_) {}
  }

  /* 1 · Touch-down response. */
  var PRESSABLE = 'button,[role="button"],[role="tab"],[data-action],a[href],summary,label[for]';
  /* Controls with their own :active shrink in native-runtime.css or native-shell.css. */
  var OWN_PRESS = '.menu-item,.kiwi-native-owner-keypad button,#pair .pad button,.kiwi-native-burger,.rp-peek,.kiwi-native-owner-actions button,.cta,.secondary,.tile,.store-choice,.printer-choice';
  var held = null, px = 0, py = 0;
  function pressable(target) {
    var el = target && target.closest ? target.closest(PRESSABLE) : null;
    if (!el || typeof el.animate !== 'function') return null;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.matches(OWN_PRESS)) return null;
    if (el.closest('input,textarea,select,[contenteditable="true"]')) return null;
    return el;
  }
  function pressIn(el) {
    var r = el.getBoundingClientRect(), area = r.width * r.height;
    if (!area || area > window.innerWidth * window.innerHeight * 0.4) return;
    var s = r.height > 96 || r.width > window.innerWidth * 0.7 ? 0.985 : 0.97;
    held = { el: el, s: s, anim: el.animate([{ scale: '1' }, { scale: String(s) }], { duration: 90, easing: EASE, fill: 'forwards' }) };
  }
  function pressOut() {
    if (!held) return;
    var h = held, from = h.s;
    held = null;
    try { var now = parseFloat(getComputedStyle(h.el).scale); if (now > 0) from = now; } catch (_) {}
    h.anim.cancel();
    if (from < 1) h.el.animate([{ scale: String(from) }, { scale: '1' }], { duration: reduce && reduce.matches ? 120 : 220, easing: EASE });
  }

  /* 3 · Selection haptic, only when a real finger changes the choice. */
  var SEGMENT = '[data-kw-lens]>:not(.kw-lens),[role="tab"],.dr-pill,.cat-pill,.floor-pill,.mode-pill,.rtx-method,.mi-pill,.kx-tab,.sc-pill,.resv-tab';
  var NO_TICK = '[data-floor-view]';
  function isOn(el) {
    return el.classList.contains('on') || el.classList.contains('active') || el.classList.contains('is-active') ||
      el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-current') === 'page';
  }
  var downSegment = null, downWasOn = false;

  document.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse' || event.isPrimary === false) return;
    pressOut();
    px = event.clientX; py = event.clientY;
    var el = pressable(event.target);
    if (el) pressIn(el);
    var seg = event.target && event.target.closest ? event.target.closest(SEGMENT) : null;
    downSegment = seg && !seg.matches(NO_TICK) ? seg : null;
    downWasOn = !!(downSegment && isOn(downSegment));
  }, { passive: true, capture: true });
  document.addEventListener('pointermove', function (event) {
    if (held && (Math.abs(event.clientX - px) > 10 || Math.abs(event.clientY - py) > 10)) pressOut();
  }, { passive: true, capture: true });
  ['pointerup', 'pointercancel'].forEach(function (kind) { document.addEventListener(kind, pressOut, { passive: true, capture: true }); });
  document.addEventListener('click', function (event) {
    var seg = downSegment;
    downSegment = null;
    if (!seg || downWasOn || seg.disabled) return;
    if (!event.target || !event.target.closest || event.target.closest(SEGMENT) !== seg) return;
    khPlay('Choose', 'segment', { trigger: 'tap', eventTimeStamp: event.timeStamp });
  }, true);

  /* 3 · One tick per data point while the finger reads the chart. The tooltip
     interpolates between points, so the tick follows the point, not the text. */
  var scrub = null;
  document.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse' || !event.target || !event.target.closest || !event.target.closest('.rev-hit')) return;
    scrub = { svg: event.target.closest('svg'), bucket: null, id: window.KiwiHaptics ? window.KiwiHaptics.gid('chart-scrub') : '' };
  }, { passive: true });
  document.addEventListener('pointermove', function (event) {
    if (!scrub || !scrub.svg || !scrub.svg.classList.contains('is-hover')) return;
    var label = scrub.svg.querySelector('.rev-tip-label');
    var text = label ? String(label.textContent || '').trim() : '';
    if (!text) return;
    /* Day chart "14h35" ticks per hour; multi-day "Mar 23 · 14h" per day. */
    var hour = /^(\d{1,2})[:h]\d{2}/i.exec(text);
    var bucket = hour ? hour[1] : text.split(' · ')[0];
    if (scrub.bucket !== null && bucket !== scrub.bucket && scrub.id) {
      try { window.KiwiHaptics.play('Choose', scrub.id, bucket, { trigger: 'step' }); } catch (_) {}
    }
    scrub.bucket = bucket;
  }, { passive: true });
  function endScrub() {
    if (!scrub) return;
    var id = scrub.id; scrub = null;
    try { if (id) window.KiwiHaptics.end(id); } catch (_) {}
  }
  document.addEventListener('pointerup', endScrub, { passive: true });
  document.addEventListener('pointercancel', endScrub, { passive: true });

  /* 5 · The paid moment. Every register announces a paid sale with
     kiwi:sale-paid (kiwi-caisse.html › finalizeTender, assets/pos-sale.js ›
     ticketDone). A check, the amount and "Paid" settle in the middle of the
     screen for about a second, with the success haptic. It never takes a tap:
     the next order can start under it. */
  var paidTimer = null;
  function paidLabel() {
    var lang = String(document.documentElement.lang || 'fr');
    return lang.indexOf('ar') === 0 ? 'تم الدفع' : lang.indexOf('en') === 0 ? 'Paid' : 'Encaissé';
  }
  window.addEventListener('kiwi:sale-paid', function (event) {
    var detail = event && event.detail || {};
    var total = Number(detail.total);
    if (!(total > 0) || !document.body) return;
    if (detail.haptic !== false) khPlay('Paid', 'sale-paid', { trigger: 'local-record' });
    var box = document.querySelector('.kiwi-paid');
    if (!box) {
      box = document.createElement('div');
      box.className = 'kiwi-paid';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.innerHTML = '<span class="kiwi-paid-check" aria-hidden="true"><i></i></span><b class="kiwi-paid-amount"></b><span class="kiwi-paid-label"></span>';
      document.body.appendChild(box);
    }
    var amount;
    try { amount = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total); }
    catch (_) { amount = total.toFixed(2); }
    box.querySelector('.kiwi-paid-amount').textContent = amount + ' MAD';
    box.querySelector('.kiwi-paid-label').textContent = paidLabel();
    box.classList.remove('is-in', 'is-out');
    void box.offsetWidth;
    box.classList.add('is-in');
    clearTimeout(paidTimer);
    paidTimer = setTimeout(function () { box.classList.remove('is-in'); box.classList.add('is-out'); }, 1100);
  });

  /* 6 · Honest sync on the till. The web till's sync line (#kiwi-net,
     assets/caisse-pwa.js) is not built in the app at all: that script stops
     on a native platform, so sales could wait to be sent with nothing on
     screen saying so. This pill reads the same sale queue (KiwiLive) and
     shows only when something is waiting or held; a tap retries now. */
  if (/kiwi-caisse\.html$/i.test(location.pathname)) {
    var syncPill = null, lastRefresh = 0, syncing = false;
    var syncWords = function (q) {
      var lang = String(document.documentElement.lang || 'fr');
      var ar = lang.indexOf('ar') === 0, en = lang.indexOf('en') === 0;
      var n = q.blocked || q.pending;
      /* Sales recorded on this till that the queue refused (storage full).
         They are not in q at all, so they are counted first, and the words
         say not to charge them again. */
      var held = 0;
      try { held = window.KiwiCaisseHeldSales ? Number(window.KiwiCaisseHeldSales.count()) || 0 : 0; } catch (_) {}
      if (held) return { tone: '#9F3028', text: ar ? held + ' عملية بيع مسجّلة لم تُرسل بعد · لا تحصّلها مرة أخرى' : en ? held + (held > 1 ? ' sales' : ' sale') + ' recorded, not sent yet · do not charge again' : held + (held > 1 ? ' ventes enregistrées' : ' vente enregistrée') + ', pas encore envoyée' + (held > 1 ? 's' : '') + ' · ne pas encaisser à nouveau' };
      if (q.storageError) return { tone: '#9F3028', text: ar ? 'الحفظ المحلي يحتاج إلى تحقق' : en ? 'Local storage needs checking' : 'Protection locale à vérifier' };
      if (q.blocked) return { tone: '#9F3028', text: ar ? n + ' عملية محفوظة، تحتاج إلى مراجعة' : en ? n + (n > 1 ? ' operations held' : ' operation held') + ', nothing is lost' : n + (n > 1 ? ' opérations conservées' : ' opération conservée') + ', rien n’est perdu' };
      if (!q.pending) return null;
      if (navigator.onLine === false) return { tone: '#B85245', text: ar ? 'غير متصل · ' + n + ' في الانتظار' : en ? 'Offline · ' + n + ' waiting to send' : 'Hors ligne · ' + n + ' en attente d’envoi' };
      if (q.sending || syncing) return { tone: '#A56A16', text: ar ? 'جارٍ إرسال ' + n + ' عملية' : en ? 'Sending ' + n + (n > 1 ? ' operations' : ' operation') : 'Envoi de ' + n + (n > 1 ? ' opérations' : ' opération') };
      return { tone: '#A56A16', text: ar ? n + ' عملية في انتظار الإرسال' : en ? n + (n > 1 ? ' operations' : ' operation') + ' waiting to send' : n + (n > 1 ? ' opérations' : ' opération') + ' à synchroniser' };
    };
    var syncPaint = function () {
      var live = window.KiwiLive;
      var q = null;
      try { q = live && typeof live.queueStatus === 'function' ? live.queueStatus() : null; } catch (_) {}
      if (live && typeof live.refreshQueue === 'function' && Date.now() - lastRefresh > 5000) {
        lastRefresh = Date.now();
        try { Promise.resolve(live.refreshQueue()).then(function () { setTimeout(syncPaint, 0); }, function () {}); } catch (_) {}
      }
      var words = syncWords(q || {});
      var staffPad = document.getElementById('cp-pin-screen');
      var gate = !!document.querySelector('.screen-pin.is-active,.screen-clockin.is-active,#pair.on') || !!(staffPad && staffPad.style.display !== 'none');
      var menuOpen = !!(document.body && (document.body.classList.contains('nav-open') || document.body.classList.contains('kiwi-native-menu-open')));
      var show = !!words && !gate && !menuOpen;
      if (show && !syncPill) {
        syncPill = document.createElement('button');
        syncPill.type = 'button';
        syncPill.className = 'kiwi-sync-pill';
        syncPill.setAttribute('aria-live', 'polite');
        syncPill.innerHTML = '<i aria-hidden="true"></i><span></span>';
        syncPill.addEventListener('click', function () {
          var l = window.KiwiLive;
          if (!l || syncing) return;
          syncing = true;
          syncPaint();
          var cur = {};
          try { cur = l.queueStatus() || {}; } catch (_) {}
          try { if (window.KiwiCaisseHeldSales) window.KiwiCaisseHeldSales.retry(); } catch (_) {}
          var run = cur.blocked && typeof l.retryBlockedSales === 'function'
            ? Promise.resolve(l.retryBlockedSales()).then(function () { return l.flush && l.flush(true); })
            : Promise.resolve(l.flush && l.flush(true));
          run.catch(function () {}).then(function () {
            syncing = false;
            syncPaint();
            /* Say what the tap did: a retry that changes nothing on screen
               reads as a dead button. */
            var after = {};
            try { after = l.queueStatus() || {}; } catch (_) {}
            var lang = String(document.documentElement.lang || 'fr');
            var ar = lang.indexOf('ar') === 0, en = lang.indexOf('en') === 0;
            var say = window.KiwiCaisseToast;
            if (typeof say !== 'function') return;
            var heldAfter = 0;
            try { heldAfter = window.KiwiCaisseHeldSales ? Number(window.KiwiCaisseHeldSales.count()) || 0 : 0; } catch (_) {}
            if (heldAfter) say(ar ? 'ما زالت محفوظة على هذا الصندوق · ستُعاد المحاولة تلقائيًا' : en ? 'Still recorded on this till · it will retry on its own' : 'Toujours enregistrée sur cette caisse · nouvel essai automatique', 4200, 'warn');
            else if (!after.blocked && !after.pending) say(ar ? 'تم إرسال كل شيء' : en ? 'Everything is sent' : 'Tout est envoyé', 2400, 'success');
            else if (navigator.onLine === false) say(ar ? 'لا يوجد اتصال · سيبدأ الإرسال عند عودة الشبكة' : en ? 'Offline · sending resumes when the network returns' : 'Hors ligne · l’envoi reprendra au retour du réseau', 3600, 'warn');
            else if (after.blocked) say(ar ? 'ما زالت محفوظة على هذا الصندوق · لم يُفقد شيء' : en ? 'Still held on this till · nothing is lost' : 'Toujours conservé sur cette caisse · rien n’est perdu', 4200, 'warn', ar ? 'إذا استمر ذلك، اتصل بدعم Kiwi.' : en ? 'If it stays held, contact Kiwi support.' : 'Si cela persiste, contactez le support Kiwi.');
          });
        });
        document.body.appendChild(syncPill);
      }
      if (!syncPill) return;
      if (show) {
        syncPill.querySelector('span').textContent = words.text;
        syncPill.querySelector('i').style.background = words.tone;
      }
      syncPill.classList.toggle('is-visible', show);
      document.documentElement.classList.toggle('kiwi-sync-pill-on', show);
    };
    ['online', 'offline', 'kiwi:outbox', 'kiwi:sale-queue', 'kiwi:held-sales'].forEach(function (kind) { window.addEventListener(kind, function () { setTimeout(syncPaint, 60); }); });
    setInterval(syncPaint, 2000);
  }

  /* 2 · Sticky hover. */
  if (!touchOnly) return;
  var done = typeof WeakSet === 'function' ? new WeakSet() : null;
  function splitSelectors(text) {
    var out = [], depth = 0, start = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ',' && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
    }
    out.push(text.slice(start));
    return out;
  }
  function stripRules(list) {
    var rules;
    try { rules = list.cssRules; } catch (_) { return; }
    if (!rules) return;
    for (var i = rules.length - 1; i >= 0; i--) {
      var rule = rules[i];
      if (rule.media && /hover\s*:\s*hover|pointer\s*:\s*fine/.test(rule.media.mediaText || '')) continue;
      if (typeof rule.selectorText === 'string' && rule.selectorText.indexOf(':hover') >= 0) {
        /* `:not(:hover)` is true of everything once nothing is hovered. */
        var keep = splitSelectors(rule.selectorText.replace(/:not\(\s*:hover\s*\)/g, ''))
          .filter(function (sel) { return sel.indexOf(':hover') < 0 && sel.trim(); });
        try {
          if (!keep.length) { list.deleteRule(i); continue; }
          rule.selectorText = keep.join(',');
        } catch (_) {}
      }
      if (rule.cssRules && rule.cssRules.length) stripRules(rule);
    }
  }
  function stripAll() {
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      if (done) { if (done.has(sheet)) continue; done.add(sheet); }
      stripRules(sheet);
    }
  }
  var queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { queued = false; stripAll(); });
  }
  function isSheetNode(node) { return node && (node.nodeName === 'STYLE' || (node.nodeName === 'LINK' && /stylesheet/i.test(node.rel || ''))); }
  /* A new sheet anywhere (a surface's injected <style>, even deep inside a
     rendered subtree) changes the sheet count; rewriting a <style>'s text
     replaces its sheet. Either one queues a pass over the unseen sheets. */
  var seenCount = -1;
  new MutationObserver(function (records) {
    if (document.styleSheets.length !== seenCount) { seenCount = document.styleSheets.length; queue(); return; }
    for (var i = 0; i < records.length; i++) if (isSheetNode(records[i].target)) { queue(); return; }
  }).observe(document.documentElement, { childList: true, subtree: true });
  /* A <link> can be counted before its rules arrive: look at it again once loaded. */
  document.addEventListener('load', function (event) {
    if (!isSheetNode(event.target)) return;
    if (done && event.target.sheet) done.delete(event.target.sheet);
    queue();
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stripAll);
  else stripAll();
  window.addEventListener('load', stripAll);
  window.__kiwiFeel = { stripAll: stripAll };
})();
