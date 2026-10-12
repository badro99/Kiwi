/* Kiwi · douchette sans champ actif — window.KiwiScanWedge
 *
 * Une douchette USB « tape » le code comme un clavier, puis Entrée. Les caisses
 * boutique et épicerie lisaient ces frappes dans LEUR champ de scan : il
 * suffisait que la vendeuse ait touché une tuile produit, un onglet ou le
 * ticket pour que le focus soit ailleurs, et le scan suivant partait dans le
 * vide. Pire : le Entrée final « cliquait » le bouton qui avait le focus et
 * ajoutait au ticket l'article touché juste avant.
 *
 * Ici, une seule écoute (phase de capture, avant les boutons) reconnaît un
 * scan à sa VITESSE : au moins MIN_LEN caractères, moins de MAX_GAP ms entre
 * deux frappes et MAX_AVG ms en moyenne, terminés par Entrée. Personne ne
 * tape à cette vitesse : un humain au clavier n'est jamais intercepté. Le code
 * va à la caisse ACTIVE (celle dont l'écran est visible), et le Entrée est
 * consommé pour ne pas cliquer le bouton qui avait le focus.
 *
 * Quand un champ de saisie a le focus (le champ de scan lui-même, une
 * quantité, une recherche), on ne touche à rien : il reçoit ses frappes
 * comme avant.
 *
 *   KiwiScanWedge.attach({ id, active: () => bool, onScan: (code) => void })
 *     → detach()
 *   KiwiScanWedge.feed(events) — rejoue une suite de frappes (tests). */
(function () {
  'use strict';

  var MIN_LEN = 6, MAX_GAP = 50, MAX_AVG = 35;
  var handlers = new Map();
  var buf = '', times = [];

  function editable(el) {
    if (!el || el === document.body) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      var t = String(el.type || 'text').toLowerCase();
      return ['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'].indexOf(t) < 0;
    }
    return !!el.isContentEditable;
  }
  function reset() { buf = ''; times = []; }
  function looksScanned() {
    if (buf.length < MIN_LEN || times.length < 2) return false;
    var total = 0;
    for (var i = 1; i < times.length; i++) {
      var gap = times[i] - times[i - 1];
      if (gap > MAX_GAP) return false;
      total += gap;
    }
    return total / (times.length - 1) <= MAX_AVG;
  }
  function target() {
    var hit = null;
    handlers.forEach(function (h) {
      if (hit) return;
      try { if (h.active()) hit = h; } catch (_) {}
    });
    return hit;
  }

  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) { reset(); return; }
    if (editable(e.target)) { reset(); return; }
    var now = e.timeStamp || Date.now();
    if (times.length && now - times[times.length - 1] > MAX_GAP) reset();
    if (e.key === 'Enter') {
      var code = buf;
      var scanned = looksScanned();
      reset();
      if (!scanned) return;
      var h = target();
      if (!h) return;
      e.preventDefault();
      e.stopPropagation();
      try { h.onScan(code); } catch (_) {}
      return;
    }
    if (e.key && e.key.length === 1) {
      buf += e.key;
      times.push(now);
      if (buf.length > 64) reset();
    }
  }
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('keydown', onKey, true);

  window.KiwiScanWedge = {
    attach: function (o) {
      if (!o || !o.id || typeof o.onScan !== 'function') return function () {};
      handlers.set(o.id, { active: o.active || function () { return true; }, onScan: o.onScan });
      return function () { handlers.delete(o.id); };
    },
    feed: function (events) { (events || []).forEach(onKey); },
    _limits: { MIN_LEN: MIN_LEN, MAX_GAP: MAX_GAP, MAX_AVG: MAX_AVG },
  };
})();
