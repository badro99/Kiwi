/* Kiwi · l'assistant · « ajoute aux dépenses » tapé sous une facture.
 * ---------------------------------------------------------------------------
 * Propriétaire, 23 nov. 2026 (Pasta Corner, facture Leader Formaggi) : après
 * la carte « Facture fournisseur », il a tapé « add to expenses » et l'assistant
 * lui a répondu une généralité sur ses charges fixes. Une demande d'ajout tapée
 * sous une carte de document (agent-voice.js › renderVisionResult) est le bouton
 * de cette carte : « Ajouter aux dépenses » ou « Ajouter les articles au stock ».
 * Sans carte, une demande d'ajout aux dépenses dit quoi joindre.
 *
 * Reste à l'assistant : une question (« quelles sont mes dépenses ? »), une
 * phrase avec un chiffre (« 300 MAD de loyer », une saisie à part entière) ou
 * une phrase longue. tools/agent-doc-followup-test.mjs.
 *
 * Écoute en capture sur le document, donc avant le compositeur ; ne fait rien
 * quand une pièce est jointe (agent-voice.js lance alors la lecture). */
(function () {
  'use strict';

  var FOLLOW = [
    { type: 'expense-add', rx: /d[ée]pens|expens|\bfrais\b|مصاريف|مصروف|نفقات|masari?f|masrouf/i },
    { type: 'stock-receive', rx: /\bstock|inventaire|inventory|مخزون|stok/i },
  ];
  var VERB = /ajout|\bmets?\b|mettre|enregistr|\bpasse|\badd|\bput\b|record|\blog\b|\bsave|\bzid|زيد|أضف|اضف|حط|سجل|سجّل/i;

  /* La phrase tapée → le type d'action de carte qu'elle demande, ou null. */
  function match(q) {
    q = String(q || '').trim();
    if (!q || q.length > 60 || /\d/.test(q) || /\?|؟/.test(q) || !VERB.test(q)) return null;
    for (var i = 0; i < FOLLOW.length; i++) if (FOLLOW[i].rx.test(q)) return FOLLOW[i].type;
    return null;
  }

  var NO_DOC = {
    fr: 'Joignez d’abord la facture ou le ticket (le trombone), puis demandez-moi de l’ajouter aux dépenses.',
    en: 'Attach the invoice or receipt first (the paperclip), then ask me to add it to expenses.',
    ar: 'أرفق الفاتورة أو الوصل أولاً (المشبك)، ثم اطلب مني إضافته إلى المصاريف.',
  };
  function lang() {
    try { return (window.KiwiLang && window.KiwiLang.get && window.KiwiLang.get()) || document.documentElement.getAttribute('lang') || 'fr'; } catch (_) { return 'fr'; }
  }

  function say(thread, who, text) {
    var m = document.createElement('div');
    m.className = 'fa-msg ' + who;
    var b = document.createElement('div');
    b.className = 'fa-bubble';
    b.textContent = text;
    m.appendChild(b);
    thread.appendChild(m);
    var sc = document.querySelector('.fa-thread');
    if (sc) sc.scrollTop = sc.scrollHeight;
  }

  /* true quand la phrase a été prise ici (le compositeur ne l'envoie pas). */
  function take(input) {
    var wrap = input.closest && input.closest('.fa-inputwrap');
    if (!wrap || (wrap.parentNode && wrap.parentNode.querySelector('.kv-attach-preview'))) return false;
    var q = String(input.value || '').trim();
    var type = match(q);
    var thread = document.querySelector('[data-fa-thread]');
    if (!type || !thread) return false;
    var cards = thread.querySelectorAll('.kv-msg-result');
    var btn = cards.length ? cards[cards.length - 1].querySelector('[data-kv-action="' + type + '"]') : null;
    if (!btn && type !== 'expense-add') return false;
    input.value = '';
    try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    say(thread, 'user', q);
    if (!btn) say(thread, 'agent', NO_DOC[lang()] || NO_DOC.fr);
    else if (btn.classList.contains('done')) say(thread, 'agent', String(btn.textContent || '').trim());
    else btn.click();
    return true;
  }

  function inputOf(el) {
    var wrap = el && el.closest && el.closest('.fa-inputwrap');
    return wrap ? wrap.querySelector('[data-fa-input]') : null;
  }
  document.addEventListener('click', function (e) {
    var send = e.target && e.target.closest && e.target.closest('[data-fa-send]');
    var input = send && inputOf(send);
    if (input && take(input)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    var input = e.target && e.target.matches && e.target.matches('[data-fa-input]') ? e.target : null;
    if (input && take(input)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  window.KiwiDocFollowUp = { match: match };
})();
