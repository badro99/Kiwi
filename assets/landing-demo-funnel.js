/* Kiwi landing · « Demander une démo », sur une seule feuille.
 *
 * Avant (ticket #0171) : cinq étapes, puis un message WhatsApp que le visiteur
 * devait encore envoyer lui-même. Une demande remplie jusqu'au bout mais jamais
 * envoyée n'arrivait nulle part, et personne ne le savait.
 *
 * Maintenant (2026-10-13) : une feuille, six réponses courtes, et la demande est
 * ENREGISTRÉE par Kiwi (POST /api/demo-request, table demo_requests) au moment
 * où le visiteur valide. L'équipe la voit dans la console opérateur (Démos).
 * WhatsApp reste une suite possible, jamais la seule voie :
 *   · après l'envoi, « Nous écrire sur WhatsApp » avec la référence ;
 *   · si le serveur ne répond pas (hors ligne, quota, panne), la même demande
 *     part par WhatsApp en un geste, préremplie, pour qu'aucune ne se perde.
 *
 * Script autonome par-dessus l'export statique de la landing. Les métiers
 * viennent de assets/trades.js (window.KiwiTrades), la liste du produit.
 * Textes : STR ci-dessous (fr, en, ar) ; les autres langues lisent l'anglais.
 * Icônes : Material Symbols vendorisés (assets/icons/material), en masque CSS. */
(function () {
  'use strict';
  if (window.KiwiDemoFunnel) return;

  var WA = '212624495159';
  var STORE = 'kiwiDemoFunnel2';
  var API = '/api/demo-request';
  /* The stylesheet sits next to this script and carries the same stamp, so a
     page that loads only the script (a guide) still gets the matching CSS. */
  var SELF = (document.currentScript && document.currentScript.src) || '';
  var FAMILIES = [
    { id: 'restaurant', icon: 'restaurant' },
    { id: 'boutique', icon: 'storefront' },
    { id: 'spa', icon: 'spa' },
    { id: 'hotel', icon: 'hotel' },
  ];
  var DAYS = ['today', 'tomorrow', 'week'];
  var PARTS = ['morning', 'afternoon', 'evening'];

  var STR = {
    fr: {
      open: 'Demander une démo',
      close: 'Fermer',
      eyebrow: 'Démo Kiwi · 20 minutes',
      title: 'Voyons Kiwi sur votre commerce',
      lead: 'Laissez-nous vos coordonnées : nous vous appelons au moment choisi pour une démo de 20 minutes, sur votre métier.',
      firstName: 'Prénom',
      firstNamePh: 'Salma',
      business: 'Nom du commerce',
      businessPh: 'Café Atlas',
      family: 'Votre activité',
      families: { restaurant: 'Restauration', boutique: 'Commerce', spa: 'Beauté et bien-être', hotel: 'Hôtel ou riad' },
      trade: 'Plus précisément',
      tradeAny: 'Sans préciser',
      phone: 'Téléphone',
      phonePh: '06 12 34 56 78',
      email: 'E-mail',
      optional: 'facultatif',
      emailPh: 'vous@exemple.ma',
      when: 'Quand vous appeler ?',
      days: { today: 'Aujourd’hui', tomorrow: 'Demain', week: 'Cette semaine' },
      parts: { morning: 'Matin', afternoon: 'Après-midi', evening: 'Fin de journée' },
      whenNote: 'Heure du Maroc. Nous confirmons le créneau avec vous.',
      note: 'Ce que vous aimeriez voir',
      notePh: 'La caisse, le stock, les rapports…',
      submit: 'Envoyer ma demande',
      sending: 'Envoi…',
      privacy: 'Vos coordonnées servent uniquement à vous rappeler pour cette démo.',
      waAside: 'Plutôt WhatsApp ? Écrivez-nous',
      doneTitle: 'C’est noté, {name}.',
      doneLead: 'Nous vous appelons {slot} au {phone} pour une démo de Kiwi sur {biz}.',
      doneRef: 'Référence',
      doneSteps: ['Nous préparons une démo sur votre métier.', 'Nous vous appelons pour confirmer le créneau.', 'La démo dure environ 20 minutes, sans engagement.'],
      doneWa: 'Nous écrire sur WhatsApp',
      doneClose: 'Retour au site',
      failTitle: 'Votre demande n’est pas partie',
      failLead: 'Le serveur ne répond pas pour l’instant. Envoyez-la par WhatsApp : tout est déjà écrit, il suffit d’appuyer sur Envoyer.',
      failWa: 'Envoyer par WhatsApp',
      failRetry: 'Réessayer',
      slotAny: 'dès que possible',
      required: 'Ce champ est obligatoire.',
      phoneBad: 'Vérifiez ce numéro.',
      emailBad: 'Vérifiez cette adresse.',
      pickFamily: 'Choisissez votre activité.',
      wa: { hello: 'Bonjour Kiwi, je souhaite une démo.', name: 'Prénom', biz: 'Commerce', trade: 'Activité', when: 'Rappel souhaité', phone: 'Téléphone', email: 'E-mail', note: 'Précisions', ref: 'Référence' },
    },
    en: {
      open: 'Book a demo',
      close: 'Close',
      eyebrow: 'Kiwi demo · 20 minutes',
      title: 'See Kiwi on your business',
      lead: 'Leave your details: we call you at the time you choose for a 20-minute demo built around your trade.',
      firstName: 'First name',
      firstNamePh: 'Salma',
      business: 'Business name',
      businessPh: 'Café Atlas',
      family: 'Your business',
      families: { restaurant: 'Food and drink', boutique: 'Retail', spa: 'Beauty and wellness', hotel: 'Hotel or riad' },
      trade: 'More precisely',
      tradeAny: 'Not specified',
      phone: 'Phone',
      phonePh: '+212 6 12 34 56 78',
      email: 'Email',
      optional: 'optional',
      emailPh: 'you@example.com',
      when: 'When should we call?',
      days: { today: 'Today', tomorrow: 'Tomorrow', week: 'This week' },
      parts: { morning: 'Morning', afternoon: 'Afternoon', evening: 'Late afternoon' },
      whenNote: 'Morocco time. We confirm the slot with you.',
      note: 'What you would like to see',
      notePh: 'The till, stock, reports…',
      submit: 'Send my request',
      sending: 'Sending…',
      privacy: 'Your details are only used to call you back about this demo.',
      waAside: 'Prefer WhatsApp? Message us',
      doneTitle: 'Got it, {name}.',
      doneLead: 'We will call you {slot} on {phone} for a demo of Kiwi for {biz}.',
      doneRef: 'Reference',
      doneSteps: ['We prepare a demo around your trade.', 'We call you to confirm the slot.', 'The demo takes about 20 minutes, with no commitment.'],
      doneWa: 'Message us on WhatsApp',
      doneClose: 'Back to the site',
      failTitle: 'Your request did not go through',
      failLead: 'Our server is not answering right now. Send it on WhatsApp instead: everything is already written, just press Send.',
      failWa: 'Send on WhatsApp',
      failRetry: 'Try again',
      slotAny: 'as soon as possible',
      required: 'This field is required.',
      phoneBad: 'Please check this number.',
      emailBad: 'Please check this address.',
      pickFamily: 'Choose your business.',
      wa: { hello: 'Hello Kiwi, I would like a demo.', name: 'First name', biz: 'Business', trade: 'Activity', when: 'Preferred call', phone: 'Phone', email: 'Email', note: 'Details', ref: 'Reference' },
    },
    ar: {
      open: 'اطلب عرضا توضيحيا',
      close: 'إغلاق',
      eyebrow: 'عرض Kiwi · 20 دقيقة',
      title: 'لنشاهد Kiwi على نشاطك',
      lead: 'اترك بياناتك: نتصل بك في الوقت الذي تختاره لعرض توضيحي مدته 20 دقيقة يناسب نشاطك.',
      firstName: 'الاسم',
      firstNamePh: 'سلمى',
      business: 'اسم المحل',
      businessPh: 'Café Atlas',
      family: 'نشاطك',
      families: { restaurant: 'مطاعم ومقاه', boutique: 'تجارة', spa: 'تجميل وعناية', hotel: 'فندق أو رياض' },
      trade: 'بالتحديد',
      tradeAny: 'بدون تحديد',
      phone: 'الهاتف',
      phonePh: '06 12 34 56 78',
      email: 'البريد الإلكتروني',
      optional: 'اختياري',
      emailPh: 'you@example.ma',
      when: 'متى نتصل بك؟',
      days: { today: 'اليوم', tomorrow: 'غدا', week: 'هذا الأسبوع' },
      parts: { morning: 'صباحا', afternoon: 'بعد الظهر', evening: 'آخر النهار' },
      whenNote: 'بتوقيت المغرب. نؤكد معك الموعد.',
      note: 'ما الذي تود رؤيته',
      notePh: 'الصندوق، المخزون، التقارير…',
      submit: 'أرسل طلبي',
      sending: 'جار الإرسال…',
      privacy: 'نستعمل بياناتك فقط للاتصال بك بخصوص هذا العرض.',
      waAside: 'تفضل WhatsApp؟ راسلنا',
      doneTitle: 'تم التسجيل يا {name}.',
      doneLead: 'سنتصل بك {slot} على الرقم {phone} لعرض Kiwi على {biz}.',
      doneRef: 'المرجع',
      doneSteps: ['نحضّر عرضا يناسب نشاطك.', 'نتصل بك لتأكيد الموعد.', 'يدوم العرض حوالي 20 دقيقة، دون أي التزام.'],
      doneWa: 'راسلنا على WhatsApp',
      doneClose: 'العودة إلى الموقع',
      failTitle: 'لم يُرسل طلبك',
      failLead: 'الخادم لا يجيب حاليا. أرسله عبر WhatsApp: كل شيء مكتوب، يكفي الضغط على إرسال.',
      failWa: 'إرسال عبر WhatsApp',
      failRetry: 'إعادة المحاولة',
      slotAny: 'في أقرب وقت',
      required: 'هذا الحقل إلزامي.',
      phoneBad: 'تحقق من هذا الرقم.',
      emailBad: 'تحقق من هذا العنوان.',
      pickFamily: 'اختر نشاطك.',
      wa: { hello: 'مرحبا Kiwi، أود عرضا توضيحيا.', name: 'الاسم', biz: 'المحل', trade: 'النشاط', when: 'وقت الاتصال المفضل', phone: 'الهاتف', email: 'البريد الإلكتروني', note: 'تفاصيل', ref: 'المرجع' },
    },
  };

  /* ───────────── language ───────────── */
  function lang() {
    var l = (document.documentElement.getAttribute('lang') || 'fr').slice(0, 2).toLowerCase();
    return STR[l] ? l : 'en';
  }
  function S() { return STR[lang()] || STR.fr; }
  function t(key, vars) {
    var v = S()[key];
    if (v == null) v = STR.fr[key];
    return vars ? fill(v, vars) : v;
  }
  function fill(v, vars) {
    return String(v == null ? '' : v).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ───────────── trades (the product's single list) ───────────── */
  function trades() { return (window.KiwiTrades && window.KiwiTrades.LIST) || []; }
  function tradesIn(family) { return trades().filter(function (x) { return x.base === family && x.id !== family && x.id !== 'autre'; }); }
  function tradeLabel(id) {
    var tr = trades().filter(function (x) { return x.id === id; })[0];
    if (!tr) return '';
    var l = tr.label || {};
    return l[lang()] || l.en || l.fr || tr.id;
  }

  /* ───────────── state ───────────── */
  var blank = function () {
    return { firstName: '', business: '', family: '', trade: '', phone: '', email: '', day: '', part: '', note: '', website: '' };
  };
  var state = blank();
  var phase = 'form';      // form | sending | done | failed
  var errors = {};
  var reference = '';
  try { var saved = JSON.parse(sessionStorage.getItem(STORE) || 'null'); if (saved && typeof saved === 'object') state = Object.assign(blank(), saved, { website: '' }); } catch (_) {}
  function save() { try { var s = Object.assign({}, state); delete s.website; sessionStorage.setItem(STORE, JSON.stringify(s)); } catch (_) {} }
  function forget() { try { sessionStorage.removeItem(STORE); } catch (_) {} }

  /* ───────────── rules (mirror functions/api/_demo-requests.js) ───────────── */
  function phoneOk(v) {
    var raw = String(v || '').trim();
    if (!/^[+\d][\d\s().-]*$/.test(raw)) return false;
    var n = raw.replace(/\D/g, '').length;
    return n >= 8 && n <= 15;
  }
  function emailOk(v) { var e = String(v || '').trim(); return !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function validate() {
    var e = {};
    if (!state.firstName.trim()) e.firstName = t('required');
    if (!state.business.trim()) e.business = t('required');
    if (!state.family) e.family = t('pickFamily');
    if (!state.phone.trim()) e.phone = t('required'); else if (!phoneOk(state.phone)) e.phone = t('phoneBad');
    if (!emailOk(state.email)) e.email = t('emailBad');
    return e;
  }
  function slotText() {
    var d = state.day ? S().days[state.day] : '';
    var p = state.part ? S().parts[state.part] : '';
    if (!d && !p) return t('slotAny');
    return [d, p].filter(Boolean).join(', ').toLowerCase();
  }
  function tradeText() { return tradeLabel(state.trade) || (state.family ? S().families[state.family] : ''); }

  /* The same request, written for WhatsApp: the fallback when the server
     cannot take it, and the follow-up once it has. */
  function waText(ref) {
    var W = S().wa, lines = [W.hello, ''], sep = lang() === 'fr' ? ' : ' : ': ';
    var row = function (l, v) { if (v) lines.push(l + sep + v); };
    row(W.ref, ref);
    row(W.name, state.firstName.trim());
    row(W.biz, state.business.trim());
    row(W.trade, tradeText());
    row(W.when, slotText());
    row(W.phone, state.phone.trim());
    row(W.email, state.email.trim());
    row(W.note, state.note.trim());
    return lines.join('\n');
  }
  function waUrl(text) { return 'https://wa.me/' + WA + (text ? '?text=' + encodeURIComponent(text) : ''); }

  function payload() {
    return {
      firstName: state.firstName.trim(), business: state.business.trim(),
      trade: state.trade || state.family, phone: state.phone.trim(), email: state.email.trim(),
      day: state.day || '', part: state.part || '', note: state.note.trim(),
      lang: lang(), page: String(location.pathname || '').slice(0, 200), website: state.website,
    };
  }

  /* ───────────── markup ───────────── */
  function icon(name) { return '<i class="kdf-ic" aria-hidden="true" style="--kdf-icon:url(/assets/icons/material/' + name + '.svg)"></i>'; }
  function errorFor(key) { return errors[key] ? '<p class="kdf-err" id="kdf-err-' + key + '">' + esc(errors[key]) + '</p>' : ''; }
  function textField(key, label, opts) {
    opts = opts || {};
    var attrs = ' id="kdf-' + key + '" name="' + key + '" data-field="' + key + '" value="' + esc(state[key]) + '"'
      + ' placeholder="' + esc(opts.ph || '') + '"' + (opts.type ? ' type="' + opts.type + '"' : ' type="text"')
      + (opts.auto ? ' autocomplete="' + opts.auto + '"' : '') + (opts.mode ? ' inputmode="' + opts.mode + '"' : '')
      + (opts.dir ? ' dir="' + opts.dir + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '')
      + (errors[key] ? ' aria-invalid="true" aria-describedby="kdf-err-' + key + '"' : '') + (opts.required ? ' required' : '');
    return '<div class="kdf-field' + (opts.wide ? ' wide' : '') + '"><label for="kdf-' + key + '">' + esc(label)
      + (opts.optional ? ' <span class="kdf-opt">' + esc(t('optional')) + '</span>' : '') + '</label><input' + attrs + '>' + errorFor(key) + '</div>';
  }
  function seg(key, values, labels) {
    return '<div class="kdf-seg" role="radiogroup" aria-label="' + esc(t('when')) + '">' + values.map(function (v) {
      var on = state[key] === v;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="' + (on ? 'on' : '') + '" data-seg="' + key + '" data-value="' + v + '">' + esc(labels[v]) + '</button>';
    }).join('') + '</div>';
  }
  function formHtml() {
    var fams = FAMILIES.map(function (f) {
      var on = state.family === f.id;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="kdf-fam' + (on ? ' on' : '') + '" data-family="' + f.id + '">'
        + icon(f.icon) + '<span>' + esc(S().families[f.id]) + '</span></button>';
    }).join('');
    var precise = state.family ? tradesIn(state.family) : [];
    var tradeSelect = precise.length ? '<div class="kdf-field wide kdf-trade"><label for="kdf-trade">' + esc(t('trade')) + ' <span class="kdf-opt">' + esc(t('optional')) + '</span></label>'
      + '<select id="kdf-trade" data-field="trade"><option value="">' + esc(t('tradeAny')) + '</option>'
      + precise.map(function (x) { return '<option value="' + esc(x.id) + '"' + (state.trade === x.id ? ' selected' : '') + '>' + esc(tradeLabel(x.id)) + '</option>'; }).join('')
      + '</select></div>' : '';
    return '<form class="kdf-form" novalidate>'
      + '<div class="kdf-grid">'
      + textField('firstName', t('firstName'), { ph: t('firstNamePh'), auto: 'given-name', max: 60, required: true })
      + textField('business', t('business'), { ph: t('businessPh'), auto: 'organization', max: 80, required: true })
      + '<fieldset class="kdf-field wide"><legend>' + esc(t('family')) + '</legend><div class="kdf-fams" role="radiogroup"' + (errors.family ? ' aria-invalid="true" aria-describedby="kdf-err-family"' : '') + '>' + fams + '</div>' + errorFor('family') + '</fieldset>'
      + tradeSelect
      + textField('phone', t('phone'), { ph: t('phonePh'), type: 'tel', auto: 'tel', mode: 'tel', dir: 'ltr', max: 24, required: true })
      + textField('email', t('email'), { ph: t('emailPh'), type: 'email', auto: 'email', mode: 'email', dir: 'ltr', max: 160, optional: true })
      + '<fieldset class="kdf-field wide"><legend>' + esc(t('when')) + '</legend>' + seg('day', DAYS, S().days) + seg('part', PARTS, S().parts)
      + '<p class="kdf-hint">' + esc(t('whenNote')) + '</p></fieldset>'
      + '<div class="kdf-field wide"><label for="kdf-note">' + esc(t('note')) + ' <span class="kdf-opt">' + esc(t('optional')) + '</span></label>'
      + '<textarea id="kdf-note" data-field="note" rows="2" maxlength="500" placeholder="' + esc(t('notePh')) + '">' + esc(state.note) + '</textarea></div>'
      + '</div>'
      + '<div class="kdf-trap" aria-hidden="true"><label>Website<input tabindex="-1" autocomplete="off" data-field="website" value=""></label></div>'
      + '<div class="kdf-actions"><button type="submit" class="kdf-primary" data-submit' + (phase === 'sending' ? ' disabled aria-busy="true"' : '') + '>'
      + esc(phase === 'sending' ? t('sending') : t('submit')) + '</button>'
      + '<p class="kdf-privacy">' + esc(t('privacy')) + '</p>'
      + '<a class="kdf-wa" data-wa-aside href="' + esc(waUrl(waText(''))) + '" target="_blank" rel="noopener">' + icon('chat') + '<span>' + esc(t('waAside')) + '</span></a></div>'
      + '</form>';
  }
  function doneHtml() {
    var steps = (S().doneSteps || []).map(function (s, i) { return '<li><b>' + (i + 1) + '</b><span>' + esc(s) + '</span></li>'; }).join('');
    return '<div class="kdf-state" data-state="done">' + icon('check_circle')
      + '<h2 tabindex="-1" data-title id="kdf-title">' + esc(t('doneTitle', { name: state.firstName.trim() })) + '</h2>'
      + '<p class="kdf-lead">' + esc(t('doneLead', { slot: slotText(), phone: state.phone.trim(), biz: state.business.trim() })) + '</p>'
      + (reference ? '<p class="kdf-ref"><span>' + esc(t('doneRef')) + '</span><b dir="ltr">' + esc(reference) + '</b></p>' : '')
      + '<ol class="kdf-steps">' + steps + '</ol>'
      + '<div class="kdf-actions"><button type="button" class="kdf-primary" data-close>' + esc(t('doneClose')) + '</button>'
      + '<a class="kdf-secondary" data-wa-done href="' + esc(waUrl(waText(reference))) + '" target="_blank" rel="noopener">' + icon('chat') + '<span>' + esc(t('doneWa')) + '</span></a></div></div>';
  }
  function failHtml() {
    return '<div class="kdf-state" data-state="failed">' + icon('chat')
      + '<h2 tabindex="-1" data-title id="kdf-title">' + esc(t('failTitle')) + '</h2>'
      + '<p class="kdf-lead">' + esc(t('failLead')) + '</p>'
      + '<div class="kdf-actions"><a class="kdf-primary" data-wa-fail href="' + esc(waUrl(waText(''))) + '" target="_blank" rel="noopener">' + icon('chat') + '<span>' + esc(t('failWa')) + '</span></a>'
      + '<button type="button" class="kdf-secondary" data-retry>' + esc(t('failRetry')) + '</button></div></div>';
  }
  function bodyHtml() {
    if (phase === 'done') return doneHtml();
    if (phase === 'failed') return failHtml();
    return '<p class="kdf-eyebrow">' + esc(t('eyebrow')) + '</p><h2 tabindex="-1" data-title id="kdf-title">' + esc(t('title')) + '</h2>'
      + '<p class="kdf-lead">' + esc(t('lead')) + '</p>' + formHtml();
  }

  /* ───────────── sheet ───────────── */
  var el = null, ui = null, lastFocus = null;
  function build() {
    injectCss();
    el = document.createElement('div');
    el.className = 'kdf-back';
    el.setAttribute('dir', lang() === 'ar' ? 'rtl' : 'ltr');
    el.innerHTML = '<div class="kdf" role="dialog" aria-modal="true" aria-labelledby="kdf-title">'
      + '<button type="button" class="kdf-close" data-close aria-label="' + esc(t('close')) + '">' + icon('close') + '</button>'
      + '<div class="kdf-scroll" data-body></div></div>';
    ui = el.querySelector('.kdf');
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
    el.addEventListener('submit', onSubmit);
    el.addEventListener('keydown', onKey);
    document.body.appendChild(el);
  }
  function render(focus) {
    if (!el) return;
    var body = el.querySelector('[data-body]');
    body.innerHTML = bodyHtml();
    if (focus === 'title') { var h = body.querySelector('[data-title]'); if (h) h.focus({ preventScroll: true }); body.scrollTop = 0; }
    else if (focus === 'error') focusFirstError();
  }
  function focusFirstError() {
    var first = el.querySelector('[aria-invalid="true"]');
    if (!first) return;
    var target = first.matches('input, select, textarea') ? first : first.querySelector('button');
    if (target) { target.focus(); try { target.scrollIntoView({ block: 'center' }); } catch (_) {} }
  }
  function open() {
    if (el) return;
    lastFocus = document.activeElement;
    if (phase !== 'form') { phase = 'form'; reference = ''; }
    errors = {};
    build();
    document.documentElement.classList.add('kdf-lock');
    render();
    requestAnimationFrame(function () {
      el.classList.add('in');
      var first = el.querySelector('#kdf-firstName');
      if (first) first.focus({ preventScroll: true });
    });
  }
  function close() {
    if (!el) return;
    var node = el;
    el = null; ui = null;
    node.classList.remove('in');
    document.documentElement.classList.remove('kdf-lock');
    if (phase === 'done') { state = blank(); forget(); phase = 'form'; reference = ''; }
    /* Arrived through ?demo=1: closing drops it, so a reload does not reopen. */
    try {
      if (/[?&]demo=1(?:&|$)/.test(location.search) && history.replaceState) {
        var q = location.search.replace(/([?&])demo=1(&|$)/, function (_, a, b) { return b ? a : ''; }).replace(/^&/, '?');
        history.replaceState(history.state, '', location.pathname + (q === '?' ? '' : q) + location.hash);
      }
    } catch (_) {}
    setTimeout(function () { node.remove(); }, 220);
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (_) {}
  }

  function send() {
    phase = 'sending';
    render();
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 15000);
    return fetch(API, {
      method: 'POST', credentials: 'same-origin', signal: controller ? controller.signal : undefined,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload()),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, body: j }; });
    }).then(function (res) {
      clearTimeout(timer);
      if (res.ok && res.body && res.body.ok) {
        reference = String(res.body.reference || '');
        phase = 'done';
        forget();
        render('title');
        return;
      }
      if (res.status === 400 && res.body && res.body.field) {
        phase = 'form';
        errors = {};
        errors[res.body.field] = res.body.field === 'phone' ? t('phoneBad') : (res.body.field === 'email' ? t('emailBad') : t('required'));
        render('error');
        return;
      }
      phase = 'failed';
      render('title');
    }, function () {
      clearTimeout(timer);
      phase = 'failed';
      render('title');
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (phase === 'sending') return;
    errors = validate();
    if (Object.keys(errors).length) { render('error'); return; }
    send();
  }
  function onClick(e) {
    if (e.target === el) { close(); return; }
    var b = e.target.closest('button, a');
    if (!b || !el.contains(b)) return;
    if (b.hasAttribute('data-close')) { close(); return; }
    if (b.hasAttribute('data-retry')) { phase = 'form'; render('title'); return; }
    if (b.dataset.family) {
      if (state.family !== b.dataset.family) state.trade = '';
      state.family = b.dataset.family;
      delete errors.family;
      save(); render();
      var picked = el.querySelector('[data-family="' + state.family + '"]');
      if (picked) picked.focus();
      return;
    }
    if (b.dataset.seg) {
      var key = b.dataset.seg;
      state[key] = state[key] === b.dataset.value ? '' : b.dataset.value;
      save();
      Array.prototype.forEach.call(el.querySelectorAll('[data-seg="' + key + '"]'), function (x) {
        var on = state[key] === x.dataset.value;
        x.classList.toggle('on', on);
        x.setAttribute('aria-checked', String(on));
      });
      return;
    }
    /* The WhatsApp links carry the request as typed right now. */
    if (b.hasAttribute('data-wa-aside') || b.hasAttribute('data-wa-fail')) b.setAttribute('href', waUrl(waText('')));
  }
  function onInput(e) {
    var f = e.target && e.target.dataset && e.target.dataset.field;
    if (!f) return;
    state[f] = e.target.value;
    if (f !== 'website') save();
    if (errors[f]) {
      delete errors[f];
      e.target.removeAttribute('aria-invalid');
      var msg = el.querySelector('#kdf-err-' + f);
      if (msg) msg.remove();
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !ui) return;
    var f = Array.prototype.filter.call(ui.querySelectorAll('button, a[href], input, select, textarea'), function (x) {
      return !x.disabled && x.tabIndex !== -1 && x.offsetParent !== null;
    });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ───────────── the landing's demo buttons open the sheet ───────────── */
  var DEMO = /d[ée]mo|عرض/i;
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="https://wa.me/' + WA + '"], a[data-kiwi-demo]');
    if (!a || (el && el.contains(a))) return;
    var href = a.getAttribute('href') || '';
    if (!a.hasAttribute('data-kiwi-demo')) {
      if (href.indexOf('?') >= 0) return;
      if (!DEMO.test(a.textContent || '')) return;
    }
    e.preventDefault();
    open();
  }, true);
  /* A link to /?demo=1 (the guides use it) opens the sheet on arrival. */
  try {
    if (/[?&]demo=1(?:&|$)/.test(location.search)) {
      var go = function () { open(); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else setTimeout(go, 0);
    }
  } catch (_) {}

  function injectCss() {
    if (document.getElementById('kdf-css') || document.querySelector('link[href*="landing-demo-funnel.css"]')) return;
    var l = document.createElement('link');
    l.id = 'kdf-css'; l.rel = 'stylesheet';
    l.href = /landing-demo-funnel\.js/.test(SELF) ? SELF.replace('landing-demo-funnel.js', 'landing-demo-funnel.css') : '/assets/landing-demo-funnel.css';
    document.head.appendChild(l);
  }

  window.KiwiDemoFunnel = {
    open: open, close: close, STR: STR,
    _state: function () { return state; }, _phase: function () { return phase; },
    _waText: waText, _payload: payload, _validate: validate,
  };
})();
