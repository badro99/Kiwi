/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · repeat-sale-guard.js · le même panier encaissé deux fois de suite
 *
 * Relevé en production le 21 octobre : Santos Store a encaissé trois fois en
 * moins d'une minute un ticket identique au précédent (même article, même
 * prix), sur des numéros de ticket consécutifs. Une des trois a été annulée
 * ensuite par l'équipe ; un Trench à 500 MAD, encaissé deux fois à 51 s
 * d'écart le 18 octobre, ne l'a jamais été. Un appui qui ne semble pas avoir
 * pris, une caissière qui refait la vente : la cliente paie une fois, la
 * caisse compte deux ventes et le stock sort deux pièces.
 *
 * Le garde ne bloque rien. Quand le panier qu'on s'apprête à encaisser est le
 * même que la dernière vente de cette caisse, il y a moins de deux minutes, il
 * demande une confirmation. Une deuxième cliente qui prend le même article
 * passe en un appui de plus.
 *
 *   KiwiRepeatSale.signature(lines, total)  → empreinte du panier
 *   KiwiRepeatSale.recent(scope, sig, now?) → { num, agoSec } | null
 *   KiwiRepeatSale.remember(scope, sig, num, now?)
 *   KiwiRepeatSale.ask({ el, open, close, hit }) → Promise<boolean>
 *   KiwiRepeatSale.confirmRepeat({ scope, sig, el, open, close, busy, go }) → bool
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var WINDOW_MS = 120000;
  var PREFIX = 'kiwi:lastCharge:';
  var mem = Object.create(null);

  function signature(lines, total) {
    var parts = (lines || []).map(function (ln) {
      return [ln.pid || ln.id || ln.name || '', ln.size || '', ln.color || '',
        +ln.qty || 0, Math.round((+ln.unit || +ln.price || 0) * 100)].join('|');
    }).sort();
    if (!parts.length) return '';
    return parts.join(';') + '#' + Math.round((+total || 0) * 100);
  }

  /* The newer of memory and storage: when a write fails (storage full,
     private mode), memory holds the last charge and must win over an older
     record still sitting in storage. */
  function read(scope) {
    var stored = null;
    try {
      var raw = window.localStorage.getItem(PREFIX + scope);
      if (raw) stored = JSON.parse(raw);
    } catch (_) {}
    var m = mem[scope] || null;
    if (!stored) return m;
    if (!m) return stored;
    return (+m.at || 0) >= (+stored.at || 0) ? m : stored;
  }

  function remember(scope, sig, num, now) {
    if (!sig) return;
    var rec = { sig: sig, num: String(num == null ? '' : num), at: now || Date.now() };
    mem[scope] = rec;
    try { window.localStorage.setItem(PREFIX + scope, JSON.stringify(rec)); } catch (_) {}
  }

  function recent(scope, sig, now) {
    if (!sig) return null;
    var rec = read(scope);
    var t = now || Date.now();
    if (!rec || rec.sig !== sig) return null;
    var age = t - (+rec.at || 0);
    if (!(age >= 0 && age < WINDOW_MS)) return null;
    return { num: rec.num || '', agoSec: Math.max(1, Math.round(age / 1000)) };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* La question s'écrit dans la fenêtre d'encaissement de la caisse (el), avec
     ses propres classes : la caisse l'habille comme ses autres confirmations. */
  function ask(o) {
    return new Promise(function (resolve) {
      var el = o && o.el;
      if (!el) { resolve(true); return; }
      var hit = o.hit || {};
      var c = o.classes || { x: 'bq-modal-x', foot: 'bq-sheet-foot', no: 'bq-btn secondary', yes: 'cash-confirm' };
      el.innerHTML =
        '<button class="' + esc(c.x) + '" data-rs-no aria-label="Fermer">×</button>' +
        '<h3 class="modal-title">Même panier encaissé il y a ' + esc(hit.agoSec || 1) + ' s</h3>' +
        '<p class="modal-subtle">' + (hit.num ? 'Ticket ' + esc(hit.num) + ', mêmes articles, même total.' : 'Mêmes articles, même total.') + '</p>' +
        '<p class="modal-subtle">Encaissez à nouveau seulement pour une autre cliente.</p>' +
        '<div class="' + esc(c.foot) + '">' +
        '<button class="' + esc(c.no) + '" data-rs-no>Ne pas encaisser</button>' +
        '<button class="' + esc(c.yes) + '" data-rs-yes>Encaisser à nouveau</button>' +
        '</div>';
      var done = false;
      function finish(go) {
        if (done) return;
        done = true;
        try { if (o.close) o.close(); } catch (_) {}
        resolve(go);
      }
      Array.prototype.forEach.call(el.querySelectorAll('[data-rs-no]'), function (b) {
        b.addEventListener('click', function () { finish(false); });
      });
      var yes = el.querySelector('[data-rs-yes]');
      if (yes) yes.addEventListener('click', function () { finish(true); });
      try { if (o.open) o.open(); } catch (_) {}
      try { var no = el.querySelector('[data-rs-no]:not([aria-label])'); if (no) no.focus(); } catch (_) {}
    });
  }

  /* Le branchement d'une caisse en un appel. Rend true quand la question est
     posée : la caisse s'arrête là, et go() ouvre l'encaissement si la
     caissière confirme. Rien ne passe par le réseau. */
  function confirmRepeat(o) {
    var hit = recent(o.scope, o.sig);
    if (!hit) return false;
    o.busy(true);
    ask({ el: o.el, hit: hit, open: o.open, close: o.close, classes: o.classes }).then(function (yes) {
      if (!(yes && o.go() !== false)) o.busy(false);
    });
    return true;
  }

  // Grocery lines carry itemId and weight/qty; prices live in the item catalog.
  function epicerieSignature(t, items, total) {
    /* A line whose item left the catalogue must never break checkout. */
    return signature(((t && t.lines) || []).map(function (ln) {
      var it = (items && items[ln.itemId]) || {};
      return { pid: ln.itemId, qty: ln.weight != null ? ln.weight : ln.qty, unit: it.price };
    }), total);
  }
  function epicerieRemember(t, items, total) {
    remember('epicerie', epicerieSignature(t, items, total), t.num);
  }
  function epicerie(o) {
    return confirmRepeat({ scope: 'epicerie', sig: epicerieSignature(o.ticket, o.items, o.total),
      el: o.el, open: o.open, close: o.close, go: o.go, busy: function () {},
      classes: { x: 'ep-modal-x', foot: 'ep-weigh-foot', no: 'ep-btn secondary', yes: 'ep-btn primary' } });
  }

  window.KiwiRepeatSale = { epicerie: epicerie, epicerieRemember: epicerieRemember, epicerieSignature: epicerieSignature, signature: signature, recent: recent, remember: remember, ask: ask, confirmRepeat: confirmRepeat, WINDOW_MS: WINDOW_MS };
})();

/* Shared shift reminder. Kept beside the repeat guard because the till shell
   has reached its script ceiling. A notice, never a payment gate. */
(function () {
  'use strict';
  var entries = Object.create(null), dismissed = Object.create(null);
  function check(o) {
    var previous = entries[o.scope];
    if (previous) { clearInterval(previous.timer); if (previous.el) previous.el.remove(); }
    var entry = entries[o.scope] = { el: null };
    function tick() {
      var host = o.host;
      var DR = window.KiwiDayReport;
      var at = typeof o.openedAt === 'function' ? o.openedAt() : o.openedAt;
      var dayOf = o.businessDay || (DR && DR.businessDay);
      var today = typeof o.today === 'function' ? o.today() : (o.today || (dayOf && dayOf(Date.now())));
      var key = 'kiwi:shiftAgeLater:' + o.scope;
      var later = dismissed[key];
      try { if (later !== today) later = window.localStorage.getItem(key) || later; } catch (_) {}
      var eligible = host && host.isConnected && host.getClientRects().length && at > 0 && dayOf && dayOf(at) < today && later !== today;
      var busy = (o.isBusy && o.isBusy()) || document.querySelector('.modal-veil.is-open, .cloture-veil.is-open, .clockin-screen.is-visible');
      if (!eligible || busy) {
        if (entry.el) { entry.el.remove(); entry.el = null; }
        return;
      }
      if (entry.el) return;
      var prefix = o.scope.indexOf('maison@') === 0 ? 'mz' : 'bq';
      var el = document.createElement('section');
      el.id = 'kiwi-shift-age-nudge';
      el.className = 'kiwi-shift-nudge';
      el.setAttribute('role', 'status');
      /* Inline, just above the scan bar: a floating card covered the rail's
         last buttons (Acomptes, En ligne, Verrouiller) on a 1024 px iPad. */
      el.style.cssText = 'margin:0 0 12px;padding:12px 14px;border:1px solid var(--n-200);border-radius:14px;background:var(--paper);color:var(--ink);font-style:normal;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between';
      var text = document.createElement('span');
      text.textContent = 'Caisse ouverte depuis le ' + new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ', tiroir pas encore compté';
      var close = document.createElement('button');
      close.className = prefix + '-btn primary';
      close.dataset.shiftClose = '';
      close.textContent = 'Clôturer la caisse';
      var postpone = document.createElement('button');
      postpone.className = prefix + '-btn secondary';
      postpone.dataset.shiftLater = '';
      postpone.textContent = 'Plus tard';
      close.onclick = function () {
        if ((o.isBusy && o.isBusy()) || document.querySelector('.modal-veil.is-open, .cloture-veil.is-open')) return;
        el.remove(); entry.el = null; o.open();
      };
      postpone.onclick = function () {
        dismissed[key] = today;
        try { window.localStorage.setItem(key, today); } catch (_) {}
        el.remove(); entry.el = null;
      };
      var actions = document.createElement('span');
      actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      close.style.whiteSpace = postpone.style.whiteSpace = 'nowrap';
      actions.append(close, postpone);
      el.append(text, actions);
      var anchor = host.querySelector('.' + prefix + '-sell-scan');
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(el, anchor);
        /* Same side margins as the scan bar it sits on. */
        try { var cs = window.getComputedStyle(anchor); el.style.marginLeft = cs.marginLeft; el.style.marginRight = cs.marginRight; } catch (_) {}
      } else host.appendChild(el);
      entry.el = el;
    }
    tick();
    entry.timer = setInterval(tick, 5000);
    if (entry.timer && entry.timer.unref) entry.timer.unref();
  }
  window.KiwiShiftNudge = { check: check };
})();
