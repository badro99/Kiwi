/* Kiwi · la devise du commerce à l'écran · window.KiwiCurrency
 *
 * Owner, 24 nov. 2026 (CHICTRATEC SL, Startoner, en Espagne) : « this company is
 * mainly in spain, so please also change what needs to be changed for that ».
 * Le pays vient de /api/config (functions/api/_country.js), gardé par
 * merchant-config.js dans KiwiConfig.countryProfile et, par commerce, dans
 * localStorage (une caisse hors ligne sait encore sa devise).
 *
 * profile() / symbol() / code() : ce que les tickets (receipt-country.js,
 * escpos.js) et tout nouvel écran lisent.
 *
 * L'affichage. Les écrans ont été écrits pour le Maroc et posent « MAD » à la
 * main en près de mille endroits. Pour un commerce qui n'encaisse pas en
 * dirhams, ce fichier remplace l'unité affichée, et elle seule : « 120 MAD »
 * devient « 120 € », une cellule qui ne contient que « MAD » devient « € ».
 * L'interface reste en français, et en français un montant en euros s'écrit
 * « 1 234,56 € » : le format des nombres ne change donc pas. Un mot « MAD » qui
 * n'est pas une unité (un nom de produit « MAD MAX ») n'est pas touché : il faut
 * un chiffre juste devant, ou que le texte soit l'unité seule. Les champs de
 * saisie, les zones éditables et [data-kiwi-raw] ne sont jamais réécrits.
 * Un commerce marocain : rien ne tourne, aucun observateur n'est posé.
 */
(function () {
  'use strict';
  var MOROCCO = { code: 'MA', currency: 'MAD', symbol: 'MAD', vatLabel: 'TVA', vat: [20, 14, 10, 7, 0], defaultVat: 20, taxId: 'ICE', receiptTitle: 'Ticket de caisse', zone: 'Africa/Casablanca' };

  function cached() {
    try {
      var c = window.KiwiConfig, slug = c && typeof c.slugNow === 'function' ? c.slugNow() : '';
      if (!slug) return null;
      var raw = localStorage.getItem('kiwiCountry@' + slug);
      var p = raw ? JSON.parse(raw) : null;
      return p && p.currency ? p : null;
    } catch (_) { return null; }
  }
  function profile() {
    var c = window.KiwiConfig;
    if (c && c.countryProfile && c.countryProfile.currency) return c.countryProfile;
    return cached() || MOROCCO;
  }
  function symbol() { return profile().symbol || 'MAD'; }
  function code() { return profile().currency || 'MAD'; }

  /* ── l'unité affichée ─────────────────────────────────────────────────── */
  var AFTER_NUMBER = /(\d)([   ]?)MAD\b/g;
  var PER = /\bMAD(\s*)\//g;
  var ALONE = /^(\s*)MAD(\s*)$/;
  /* « MAD encaissé », « MAD collected » : l'unité en tête, suivie d'un mot en
   * minuscules. « MAD MAX » (capitales) n'est pas une unité. */
  var LEAD = /^(\s*)MAD(\s+)(?=[a-zà-ÿ])/;
  /* Le moyen « wallet » s'affiche « Kiwi Wallet » ou « QR / Wallet », des mots
   * du Maroc. Un pays qui nomme le sien (l'Espagne : PayPal / Bizum) le voit. */
  var WALLET = /\b(?:Kiwi Wallet|QR \/ Wallet)\b/g;
  function walletLabel() { return profile().walletLabel || ''; }
  function touches(text) { return !!text && (text.indexOf('MAD') >= 0 || (text.indexOf('Wallet') >= 0 && !!walletLabel())); }
  function rewrite(text, sym) {
    if (!touches(text)) return text;
    var w = walletLabel();
    if (w) text = text.replace(WALLET, w);
    if (text.indexOf('MAD') < 0) return text;
    if (ALONE.test(text)) return text.replace(ALONE, '$1' + sym + '$2');
    return text.replace(LEAD, '$1' + sym + '$2').replace(AFTER_NUMBER, function (_, d, sp) { return d + (sp || ' ') + sym; }).replace(PER, sym + '$1/');
  }
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  function untouchable(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP[n.nodeName] || n.isContentEditable || (n.hasAttribute && n.hasAttribute('data-kiwi-raw'))) return true;
    }
    return false;
  }
  function fixText(node, sym) {
    var v = node.nodeValue;
    if (!touches(v) || !node.parentNode || untouchable(node.parentNode)) return;
    var next = rewrite(v, sym);
    if (next !== v) node.nodeValue = next;
  }
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  function fixAttrs(el, sym) {
    if (!el.getAttribute || untouchable(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (touches(v)) { var next = rewrite(v, sym); if (next !== v) el.setAttribute(ATTRS[i], next); }
    }
  }
  function sweep(root, sym) {
    if (!root) return;
    if (root.nodeType === 3) { fixText(root, sym); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (!touches(root.textContent) && !root.querySelector('[placeholder*="MAD"],[title*="MAD"],[aria-label*="MAD"]')) { fixAttrs(root, sym); return; } fixAttrs(root, sym); }
    var walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */, null);
    for (var t = walker.nextNode(); t; t = walker.nextNode()) fixText(t, sym);
    if (root.querySelectorAll) {
      var els = root.querySelectorAll('[placeholder*="MAD"],[title*="MAD"],[aria-label*="MAD"]');
      for (var i = 0; i < els.length; i++) fixAttrs(els[i], sym);
    }
  }

  var observer = null;
  function apply() {
    var sym = symbol();
    /* Le pays sur la page : les écrans qui en dépendent (anneaux, cartes) lisent
       <html data-kiwi-country> plutôt qu'un global de plus. */
    try { document.documentElement.setAttribute('data-kiwi-country', profile().code || 'MA'); } catch (_) {}
    try { if (window.KiwiEscPos && window.KiwiEscPos.setCurrency) window.KiwiEscPos.setCurrency(sym); } catch (_) {}   // le ticket imprimé
    if (sym === 'MAD') { if (observer) { observer.disconnect(); observer = null; } return; }
    if (!document.body) return;
    sweep(document.body, sym);
    if (document.title.indexOf('MAD') >= 0) document.title = rewrite(document.title, sym);
    if (observer || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function (list) {
      var s = symbol();
      if (s === 'MAD') return;
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'characterData') fixText(m.target, s);
        else if (m.type === 'attributes') fixAttrs(m.target, s);
        else for (var j = 0; j < m.addedNodes.length; j++) sweep(m.addedNodes[j], s);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  document.addEventListener('kiwi-config', apply);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();

  /* Le ticket du pays : receipt.js l'appelle par KiwiReceipt.ext.country. */
  if (window.KiwiReceipt && window.KiwiReceipt.ext && !window.KiwiReceipt.ext.country) {
    var rc = document.createElement('script'); rc.src = 'assets/receipt-country.js?v=2'; rc.async = true;
    (document.head || document.documentElement).appendChild(rc);
  }

  window.KiwiCurrency = Object.freeze({ profile: profile, symbol: symbol, code: code, rewrite: rewrite, apply: apply });
})();
