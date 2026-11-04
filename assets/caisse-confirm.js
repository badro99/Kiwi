/* Caisse · la confirmation des gestes qui détruisent ou annulent quelque chose.
 *
 * window.confirm() est une boîte du navigateur : sans habillage Kiwi, sans gestion du
 * focus, et dans l'app iPhone elle contourne la feuille native que la décision du
 * 4 novembre a retenue pour les confirmations. KiwiCaisseConfirm.ask() pose la question
 * dans l'ordre : feuille native de l'app si l'hôte l'annonce, sinon feuille Kiwi dans la
 * page (focus piégé, Échap annule, le focus revient où il était), et seulement à défaut de
 * document la boîte du système. Elle rend une promesse : true sur « Confirmer », false sinon.
 * Le texte arrive déjà traduit (KiwiCaisseLang.tr) ; les deux boutons sont traduits ici. */
(function () {
  'use strict';
  var STYLE_ID = 'kiwi-ask-style';
  function tr(s) { try { return window.KiwiCaisseLang && window.KiwiCaisseLang.tr ? window.KiwiCaisseLang.tr(s) : s; } catch (_) { return s; } }
  function css() {
    return '.kiwi-ask{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,15,13,.45)}' +
      '.kiwi-ask-card{max-width:380px;width:100%;box-sizing:border-box;padding:22px;border-radius:16px;background:var(--surface,#FFFDFA);color:var(--ink,#0A0F0D);border:1px solid var(--n-200,#E8E6E0);box-shadow:0 18px 48px rgba(10,15,13,.28);font-family:inherit}' +
      '.kiwi-ask-title{margin:0;font-size:16px;font-weight:600;line-height:1.35}' +
      '.kiwi-ask-body{margin:8px 0 0;font-size:13.5px;line-height:1.5;color:var(--n-500,#6B7570);white-space:pre-line}' +
      '.kiwi-ask-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}' +
      '.kiwi-ask-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid var(--n-200,#E8E6E0);background:var(--paper-soft,#EFECE3);color:var(--ink,#0A0F0D);font:600 14px/1 inherit;cursor:pointer}' +
      '.kiwi-ask-btn.is-go{border-color:var(--atlas,#0B6E4F);background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}' +
      '.kiwi-ask-btn.is-danger{border-color:var(--danger,#C94A3A);background:var(--danger,#C94A3A);color:var(--paper,#F7F5F0)}' +
      '.kiwi-ask-btn:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:2px}';
  }
  function split(message) {
    var text = String(message == null ? '' : message), at = text.indexOf('\n\n');
    return at < 0 ? { title: text, body: '' } : { title: text.slice(0, at), body: text.slice(at + 2) };
  }
  function nativeAsk(parts, go, back, danger) {
    var N = window.__kiwiNativeRuntime;
    if (!N || typeof N.nativeSheetAvailable !== 'function' || !N.nativeSheetAvailable()) return null;
    return N.nativeSheet({ title: parts.title, message: parts.body, actions: [{ id: 'go', label: go, style: danger ? 'destructive' : 'plain' }, { id: 'back', label: back }] })
      .then(function (choice) { return choice === 'go'; });
  }
  function pageAsk(parts, go, back, danger) {
    return new Promise(function (resolve) {
      var doc = document, opener = doc.activeElement, done = false;
      if (!doc.getElementById(STYLE_ID)) { var st = doc.createElement('style'); st.id = STYLE_ID; st.textContent = css(); doc.head.appendChild(st); }
      var veil = doc.createElement('div'); veil.className = 'kiwi-ask';
      var card = doc.createElement('div'); card.className = 'kiwi-ask-card';
      card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true');
      var title = doc.createElement('h3'); title.className = 'kiwi-ask-title'; title.id = 'kiwi-ask-title'; title.textContent = parts.title;
      card.setAttribute('aria-labelledby', title.id); card.appendChild(title);
      if (parts.body) { var body = doc.createElement('p'); body.className = 'kiwi-ask-body'; body.id = 'kiwi-ask-body'; body.textContent = parts.body; card.setAttribute('aria-describedby', body.id); card.appendChild(body); }
      var actions = doc.createElement('div'); actions.className = 'kiwi-ask-actions';
      var no = doc.createElement('button'); no.type = 'button'; no.className = 'kiwi-ask-btn'; no.textContent = back;
      var yes = doc.createElement('button'); yes.type = 'button'; yes.className = 'kiwi-ask-btn ' + (danger ? 'is-danger' : 'is-go'); yes.textContent = go;
      actions.appendChild(no); actions.appendChild(yes); card.appendChild(actions); veil.appendChild(card);
      function end(value) {
        if (done) return; done = true;
        doc.removeEventListener('keydown', onKey, true);
        if (veil.parentNode) veil.parentNode.removeChild(veil);
        try { if (opener && opener.focus) opener.focus(); } catch (_) {}
        resolve(value);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); return; }
        if (e.key !== 'Tab') return;
        var first = no, last = yes, cur = doc.activeElement;
        if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
        else if (cur !== first && cur !== last) { e.preventDefault(); first.focus(); }
      }
      no.onclick = function () { end(false); };
      yes.onclick = function () { end(true); };
      veil.addEventListener('click', function (e) { if (e.target === veil) end(false); });
      doc.addEventListener('keydown', onKey, true);
      doc.body.appendChild(veil);
      no.focus(); /* le geste sûr d'abord : Entrée n'efface rien */
    });
  }
  function ask(message, opts) {
    opts = opts || {};
    var parts = split(message), go = tr(opts.confirm || 'Confirmer'), back = tr(opts.cancel || 'Annuler'), danger = !!opts.danger;
    var viaApp = null;
    try { viaApp = nativeAsk(parts, go, back, danger); } catch (_) { viaApp = null; }
    if (viaApp) return viaApp;
    if (typeof document !== 'undefined' && document.body && document.createElement) return pageAsk(parts, go, back, danger);
    try { return Promise.resolve(typeof window.confirm === 'function' && window.confirm(String(message)) === true); } catch (_) { return Promise.resolve(false); }
  }
  window.KiwiCaisseConfirm = Object.freeze({ ask: ask });
})();
