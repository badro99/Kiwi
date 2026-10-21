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

  function read(scope) {
    try {
      var raw = window.localStorage.getItem(PREFIX + scope);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return mem[scope] || null;
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
      el.innerHTML =
        '<button class="bq-modal-x" data-rs-no aria-label="Fermer">×</button>' +
        '<h3 class="modal-title">Même panier encaissé il y a ' + esc(hit.agoSec || 1) + ' s</h3>' +
        '<p class="modal-subtle">' + (hit.num ? 'Ticket ' + esc(hit.num) + ', mêmes articles, même total.' : 'Mêmes articles, même total.') + '</p>' +
        '<p class="modal-subtle">Encaissez à nouveau seulement pour une autre cliente.</p>' +
        '<div class="bq-sheet-foot">' +
        '<button class="bq-btn secondary" data-rs-no>Ne pas encaisser</button>' +
        '<button class="cash-confirm" data-rs-yes>Encaisser à nouveau</button>' +
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
      try { var no = el.querySelector('.bq-btn.secondary'); if (no) no.focus(); } catch (_) {}
    });
  }

  /* Le branchement d'une caisse en un appel. Rend true quand la question est
     posée : la caisse s'arrête là, et go() ouvre l'encaissement si la
     caissière confirme. Rien ne passe par le réseau. */
  function confirmRepeat(o) {
    var hit = recent(o.scope, o.sig);
    if (!hit) return false;
    o.busy(true);
    ask({ el: o.el, hit: hit, open: o.open, close: o.close }).then(function (yes) {
      if (!(yes && o.go() !== false)) o.busy(false);
    });
    return true;
  }

  window.KiwiRepeatSale = { signature: signature, recent: recent, remember: remember, ask: ask, confirmRepeat: confirmRepeat, WINDOW_MS: WINDOW_MS };
})();
