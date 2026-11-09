/* Tableau de bord · Paramètres → « Annuaire Kiwi » (data-action settings-directory).
 *
 * Le propriétaire décide si son établissement apparaît dans l'annuaire public
 * de kiwi-os.com (/fr/annuaire/). Éteint par défaut. Allumé, la fiche est
 * publiée tout de suite, en tête de sa ville et de son métier, avec le badge
 * « Client Kiwi », ses horaires, sa carte et sa réservation (lus par le
 * serveur, jamais recopiés ici). Tout passe par /api/directory/listing, qui
 * n'accepte que la session propriétaire ; le téléphone n'est public que si la
 * case est cochée. Les listes de métiers et de villes viennent du serveur.
 *
 * Fichier à part (la règle de taille de assets/interactive/handlers.js) ; il
 * s'inscrit dans Kiwi.handlers après interactive.js. */
(function () {
  'use strict';
  var lang = function () { try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  var tr = function (o) { return o[lang()] || o.fr; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = {
    title: { fr: 'Annuaire Kiwi', en: 'Kiwi directory', ar: 'دليل Kiwi' },
    tag: { fr: 'Gratuit · clients Kiwi en premier', en: 'Free · Kiwi clients first', ar: 'مجاني · عملاء Kiwi أولا' },
    desc: { fr: 'Votre établissement dans l’annuaire public de kiwi-os.com, en tête de votre ville et de votre métier, avec le badge Client Kiwi, vos horaires, votre carte et la réservation en ligne. Rien d’autre n’est publié : ni ventes, ni équipe, ni clients.', en: 'Your business in the public directory on kiwi-os.com, at the top of your city and trade, with the Kiwi client badge, your opening hours, menu and online booking. Nothing else is published: no sales, no team, no customers.', ar: 'محلك في الدليل العام على kiwi-os.com، في مقدمة مدينتك ونشاطك، مع شارة عميل Kiwi ومواعيد العمل والقائمة والحجز عبر الإنترنت. لا يُنشر أي شيء آخر: لا مبيعات ولا فريق ولا زبائن.' },
    on: { fr: 'Apparaître dans l’annuaire Kiwi', en: 'Appear in the Kiwi directory', ar: 'الظهور في دليل Kiwi' },
    name: { fr: 'Nom affiché', en: 'Public name', ar: 'الاسم المعروض' },
    trade: { fr: 'Métier', en: 'Trade', ar: 'النشاط' },
    city: { fr: 'Ville', en: 'City', ar: 'المدينة' },
    choose: { fr: 'Choisir…', en: 'Choose…', ar: 'اختر…' },
    address: { fr: 'Adresse', en: 'Address', ar: 'العنوان' },
    description: { fr: 'Présentation (600 caractères, sans lien)', en: 'Description (600 characters, no links)', ar: 'تقديم (600 حرف، دون روابط)' },
    website: { fr: 'Site web (facultatif)', en: 'Website (optional)', ar: 'الموقع (اختياري)' },
    phone: { fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' },
    showPhone: { fr: 'Afficher ce numéro sur la fiche', en: 'Show this number on the listing', ar: 'اعرض هذا الرقم على البطاقة' },
    whatsapp: { fr: 'Ce numéro répond sur WhatsApp', en: 'This number answers on WhatsApp', ar: 'هذا الرقم يرد على واتساب' },
    save: { fr: 'Enregistrer', en: 'Save', ar: 'حفظ' },
    saving: { fr: 'Enregistrement…', en: 'Saving…', ar: 'جارٍ الحفظ…' },
    close: { fr: 'Fermer', en: 'Close', ar: 'إغلاق' },
    live: { fr: 'Votre fiche est en ligne :', en: 'Your listing is live:', ar: 'بطاقتك منشورة:' },
    offSaved: { fr: 'Votre fiche n’apparaît plus dans l’annuaire.', en: 'Your listing no longer appears in the directory.', ar: 'لم تعد بطاقتك تظهر في الدليل.' },
    removed: { fr: 'L’équipe Kiwi a retiré cette fiche de l’annuaire. Écrivez-nous pour la rétablir.', en: 'The Kiwi team removed this listing from the directory. Write to us to restore it.', ar: 'حذف فريق Kiwi هذه البطاقة من الدليل. راسلنا لاستعادتها.' },
    notReady: { fr: 'L’annuaire ouvre bientôt sur votre compte. Réessayez dans quelques jours.', en: 'The directory opens on your account soon. Try again in a few days.', ar: 'سيُفتح الدليل على حسابك قريبا. أعد المحاولة بعد أيام.' },
    forbidden: { fr: 'Réservé au propriétaire du compte.', en: 'Reserved for the account owner.', ar: 'مخصص لصاحب الحساب.' },
    generic: { fr: 'Action impossible pour le moment. Réessayez.', en: 'Not possible right now. Try again.', ar: 'تعذّر تنفيذ الإجراء الآن. أعد المحاولة.' },
    loading: { fr: 'Chargement…', en: 'Loading…', ar: 'جارٍ التحميل…' },
    field: {
      name: { fr: 'Indiquez le nom affiché.', en: 'Enter the public name.', ar: 'أدخل الاسم المعروض.' },
      trade: { fr: 'Choisissez un métier.', en: 'Choose a trade.', ar: 'اختر النشاط.' },
      city: { fr: 'Choisissez une ville.', en: 'Choose a city.', ar: 'اختر المدينة.' },
      description: { fr: 'Pas de lien dans le nom, l’adresse ou la présentation.', en: 'No links in the name, address or description.', ar: 'لا روابط في الاسم أو العنوان أو التقديم.' },
      website: { fr: 'Adresse de site web invalide.', en: 'Invalid website address.', ar: 'عنوان الموقع غير صالح.' },
      phone: { fr: 'Numéro de téléphone invalide.', en: 'Invalid phone number.', ar: 'رقم الهاتف غير صالح.' },
    },
  };

  function api(path, options) {
    var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 15000);
    return fetch(path, Object.assign({ credentials: 'include', cache: 'no-store', signal: ctrl.signal }, options || {}))
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) { var e = new Error(b.error || 'unavailable'); e.status = r.status; e.field = b.field; throw e; } return b; }); })
      .finally(function () { clearTimeout(timer); });
  }

  function open() {
    var K = window.Kiwi;
    if (!K || typeof K.modal !== 'function') return;
    var merchant = String((window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant()) || '');
    var L = lang();
    var input = 'display:block;width:100%;min-height:44px;font-size:16px;margin-top:4px;padding:0 12px;border:1px solid var(--n-200);border-radius:10px;background:var(--surface);color:var(--ink);box-sizing:border-box;';
    var label = 'display:block;font-size:13px;margin-bottom:10px;';
    var m = K.modal({
      title: tr(T.title), tag: tr(T.tag), desc: esc(tr(T.desc)), width: 580,
      body: '<div data-dir-form>'
        + '<label style="display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;margin-bottom:14px;"><input type="checkbox" data-dir-on style="width:22px;height:22px;accent-color:var(--atlas);"> ' + esc(tr(T.on)) + '</label>'
        + '<div data-dir-fields>'
        + '<label style="' + label + '">' + esc(tr(T.name)) + '<input type="text" maxlength="80" data-dir-name style="' + input + '"></label>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><label style="' + label + '">' + esc(tr(T.trade)) + '<select data-dir-trade style="' + input + '"></select></label>'
        + '<label style="' + label + '">' + esc(tr(T.city)) + '<select data-dir-city style="' + input + '"></select></label></div>'
        + '<label style="' + label + '">' + esc(tr(T.address)) + '<input type="text" maxlength="160" data-dir-address style="' + input + '"></label>'
        + '<label style="' + label + '">' + esc(tr(T.description)) + '<textarea maxlength="600" rows="4" data-dir-description style="' + input + 'padding:10px 12px;min-height:96px;"></textarea></label>'
        + '<label style="' + label + '">' + esc(tr(T.website)) + '<input type="url" maxlength="200" dir="ltr" data-dir-website style="' + input + '"></label>'
        + '<label style="' + label + '">' + esc(tr(T.phone)) + '<input type="tel" maxlength="32" dir="ltr" data-dir-phone style="' + input + '"></label>'
        + '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:6px;"><input type="checkbox" data-dir-show> ' + esc(tr(T.showPhone)) + '</label>'
        + '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:6px;"><input type="checkbox" data-dir-wa> ' + esc(tr(T.whatsapp)) + '</label>'
        + '</div>'
        + '<p data-dir-status role="status" style="font-size:13px;margin:12px 0 0;min-height:18px;">' + esc(tr(T.loading)) + '</p>'
        + '</div>',
      foot: '<button class="kb ghost" type="button" data-dismiss>' + esc(tr(T.close)) + '</button><button class="kb atlas" type="button" data-dir-save disabled>' + esc(tr(T.save)) + '</button>',
    });
    var el = m.el;
    var $ = function (s) { return el.querySelector(s); };
    var status = $('[data-dir-status]'), save = $('[data-dir-save]');
    var say = function (text, ok) { status.style.color = ok ? 'var(--atlas)' : 'var(--danger)'; status.textContent = text; };
    var link = function (url) {
      status.style.color = 'var(--ink)'; status.textContent = tr(T.live) + ' ';
      var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = url.replace(/^https:\/\//, ''); a.style.color = 'var(--atlas)';
      status.appendChild(a);
    };
    var fill = function (sel, list, value) {
      sel.innerHTML = '<option value="">' + esc(tr(T.choose)) + '</option>' + list.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === value ? ' selected' : '') + '>' + esc(o.label[L] || o.label.fr) + '</option>'; }).join('');
    };
    var reason = function (e) {
      if (e.message === 'directory-not-ready') return tr(T.notReady);
      if (e.message === 'removed-by-kiwi') return tr(T.removed);
      if (e.status === 403) return tr(T.forbidden);
      if (e.field && T.field[e.field]) return tr(T.field[e.field]);
      return tr(T.generic);
    };
    if (!merchant) { say(tr(T.forbidden)); return; }
    api('/api/directory/listing?merchant=' + encodeURIComponent(merchant)).then(function (j) {
      var l = j.listing || {}, s = j.suggested || {};
      fill($('[data-dir-trade]'), j.options.trades, l.trade || s.trade || '');
      fill($('[data-dir-city]'), j.options.cities, l.city || s.city || '');
      $('[data-dir-on]').checked = !!l.on;
      $('[data-dir-name]').value = l.name || s.name || '';
      $('[data-dir-address]').value = l.address || '';
      $('[data-dir-description]').value = l.description || '';
      $('[data-dir-website]').value = l.website || '';
      $('[data-dir-phone]').value = l.phone || '';
      $('[data-dir-show]').checked = !!l.showPhone;
      $('[data-dir-wa]').checked = !!l.whatsapp;
      if (l.removed) { say(tr(T.removed)); return; }
      save.disabled = false;
      if (j.url) link(j.url); else status.textContent = '';
    }).catch(function (e) { say(reason(e)); });
    save.addEventListener('click', function () {
      save.disabled = true; save.textContent = tr(T.saving);
      var body = {
        merchant: merchant, on: $('[data-dir-on]').checked, name: $('[data-dir-name]').value, trade: $('[data-dir-trade]').value,
        city: $('[data-dir-city]').value, address: $('[data-dir-address]').value, description: $('[data-dir-description]').value,
        website: $('[data-dir-website]').value, phone: $('[data-dir-phone]').value, showPhone: $('[data-dir-show]').checked, whatsapp: $('[data-dir-wa]').checked,
      };
      api('/api/directory/listing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (j) { if (j.url) link(j.url); else say(tr(T.offSaved), true); })
        .catch(function (e) { say(reason(e)); })
        .finally(function () { save.disabled = false; save.textContent = tr(T.save); });
    });
  }

  function register() {
    if (!window.Kiwi || !window.Kiwi.handlers) return;
    window.Kiwi.handlers['settings-directory'] = open;
  }
  register();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register);
  window.KiwiDirectoryOptin = { open: open };
})();
