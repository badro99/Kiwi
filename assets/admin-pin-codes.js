/* Kiwi · console opérateur · voir et changer le code d'un salarié.
 *
 * Owner, 24 Nov 2026 : « we should be able to see and change pins for
 * employees ». Choix du même jour : « Changer » sur chaque ligne de salarié ;
 * « Voir les codes » montre le code des personnes que la page Équipe connaît
 * (document chiffré que les opérateurs nommés lisent déjà). Un code saisi dans
 * la console n'existe qu'en empreinte : il se remplace, il ne se relit pas.
 * Le code du propriétaire ne s'affiche jamais ici.
 *
 * Serveur : functions/api/admin/_pin-change.js (GET ?reveal=1, PATCH).
 * kiwi-admin.html › renderPins appelle enhance() après avoir dessiné la liste ;
 * ce fichier absent, la liste reste celle d'avant. Les codes montrés ne sont
 * gardés qu'en mémoire et se masquent seuls après 30 secondes.
 */
(function () {
  'use strict';
  var COPY = {
    'Voir les codes': ['Show codes', 'إظهار الرموز'],
    'Masquer les codes': ['Hide codes', 'إخفاء الرموز'],
    'Changer': ['Change', 'تغيير'],
    'Nouveau code': ['New code', 'الرمز الجديد'],
    'Enregistrer': ['Save', 'حفظ'],
    'Annuler': ['Cancel', 'إلغاء'],
    'Quatre chiffres.': ['Four digits.', 'أربعة أرقام.'],
    'Code saisi dans la console : il ne peut pas être affiché, seulement remplacé.': ['Code typed in the console: it can’t be shown, only replaced.', 'رمز أُدخل من الكونسول: لا يمكن عرضه، يمكن فقط تغييره.'],
    'Le code du propriétaire ne s’affiche pas ici.': ['The owner’s code isn’t shown here.', 'رمز المالك لا يظهر هنا.'],
    'Ce code est déjà pris dans ce commerce.': ['This code is already used in this store.', 'هذا الرمز مستعمل بالفعل في هذا المحل.'],
    'Code changé : le nouveau code ouvre la caisse.': ['Code changed: the new code opens the till.', 'تم تغيير الرمز: الرمز الجديد يفتح الصندوق.'],
    'Un code opérateur nommé est requis.': ['A named operator code is required.', 'يلزم رمز مشغّل باسمه.'],
    'Trop d’essais. Réessayez dans un quart d’heure.': ['Too many attempts. Try again in fifteen minutes.', 'محاولات كثيرة. أعد المحاولة بعد ربع ساعة.'],
    'Changement refusé. Réessayez.': ['Change refused. Try again.', 'رُفض التغيير. أعد المحاولة.'],
    'Codes indisponibles. Réessayez.': ['Codes unavailable. Try again.', 'الرموز غير متاحة. أعد المحاولة.'],
  };
  function t(s) {
    var i18n = window.KiwiAdminI18n;
    if (!i18n || i18n.lang === 'fr') return s;
    var pair = COPY[s];
    return pair ? pair[i18n.lang === 'ar' ? 1 : 0] : i18n.text(s);
  }
  var ownerish = function (role) { return /propri|owner|patron|direction/i.test(String(role || '')); };
  var shown = Object.create(null);   // merchant → { at, byId }
  var notice = Object.create(null);  // merchant → { text, bad } dit dans la barre au-dessus de la liste
  function style() {
    if (document.getElementById('kiwi-admin-pin-codes-css')) return;
    var css = '.pin-tools{display:flex;align-items:center;gap:10px;margin:0 0 8px}.pin-tools .pin-note{font-size:13px;color:var(--muted)}'
      + '.pin-tools .pin-note.bad{color:var(--danger,#cb5238)}.pin-change .pin-change-in{width:96px;letter-spacing:.14em;font-variant-numeric:tabular-nums}'
      + '.pin-change .pin-change-err{font-size:13px;color:var(--danger,#cb5238)}.pin b[data-pin-shown]{letter-spacing:.14em}';
    document.head.appendChild(el('style', { id: 'kiwi-admin-pin-codes-css', text: css }));
  }
  var HIDE_MS = 30000;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function failure(error) {
    var code = error && error.body && error.body.error;
    if (code === 'pin-exists') return t('Ce code est déjà pris dans ce commerce.');
    if (code === 'bad-pin') return t('Quatre chiffres.');
    if (code === 'operator-code-required') return t('Un code opérateur nommé est requis.');
    if ((error && error.status === 429) || /rate|limit/.test(String(code || ''))) return t('Trop d’essais. Réessayez dans un quart d’heure.');
    return t('Changement refusé. Réessayez.');
  }

  async function reveal(merchant) {
    var r = await window.KiwiAdminApi.request('/pins?merchant=' + encodeURIComponent(merchant) + '&reveal=1');
    var byId = Object.create(null);
    (r && r.pins || []).forEach(function (p) { byId[p.id] = p; });
    shown[merchant] = { at: Date.now(), byId: byId };
  }

  function openChange(row, p, ctx) {
    if (row.nextSibling && row.nextSibling.classList && row.nextSibling.classList.contains('pin-change')) { row.nextSibling.querySelector('input').focus(); return; }
    var input = el('input', { type: 'text', inputmode: 'numeric', maxlength: '4', autocomplete: 'off', placeholder: t('Nouveau code'), 'aria-label': t('Nouveau code') + ' · ' + (p.name || ''), class: 'pin-change-in' });
    var err = el('span', { class: 'pin-change-err', role: 'status' });
    var save = el('button', { class: 'mini', type: 'button', text: t('Enregistrer') });
    var box = el('div', { class: 'pin pin-change' }, [input, save, el('button', { class: 'mini', type: 'button', text: t('Annuler'), onclick: function () { box.remove(); } }), err]);
    async function submit() {
      var pin = String(input.value || '').trim();
      if (!/^\d{4}$/.test(pin)) { err.textContent = t('Quatre chiffres.'); input.focus(); return; }
      save.disabled = true; err.textContent = '';
      try {
        await window.KiwiAdminApi.request('/pins', { method: 'PATCH', body: JSON.stringify({ merchant: ctx.merchant, id: p.id, pin: pin }) });
        input.value = '';
        if (shown[ctx.merchant]) shown[ctx.merchant].at = 0;   // relire : l'id de la ligne a pu changer
        notice[ctx.merchant] = { text: t('Code changé : le nouveau code ouvre la caisse.') };
        ctx.rerender();
      } catch (error) { err.textContent = failure(error); save.disabled = false; input.focus(); }
    }
    save.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); if (e.key === 'Escape') box.remove(); });
    row.parentNode.insertBefore(box, row.nextSibling);
    input.focus();
  }

  async function enhance(ctx) {
    if (!ctx || !ctx.wrap || !ctx.merchant || !window.KiwiAdminApi || !ctx.live) return;
    var rows = ctx.wrap.querySelectorAll('.pin');
    if (!rows.length) return;
    var state = shown[ctx.merchant];
    if (state && Date.now() - state.at > HIDE_MS) { delete shown[ctx.merchant]; state = null; }
    style();
    var toggle = el('button', { class: 'mini', type: 'button', 'data-pin-reveal': '', text: state ? t('Masquer les codes') : t('Voir les codes') });
    if (ctx.senior === false) toggle.disabled = true;
    toggle.addEventListener('click', async function () {
      if (shown[ctx.merchant]) { delete shown[ctx.merchant]; ctx.rerender(); return; }
      toggle.disabled = true;
      try { await reveal(ctx.merchant); setTimeout(function () { if (shown[ctx.merchant] && Date.now() - shown[ctx.merchant].at >= HIDE_MS) { delete shown[ctx.merchant]; ctx.rerender(); } }, HIDE_MS + 50); }
      catch (error) { notice[ctx.merchant] = { bad: true, text: error && error.body && error.body.error === 'operator-code-required' ? t('Un code opérateur nommé est requis.') : t('Codes indisponibles. Réessayez.') }; }
      ctx.rerender();
    });
    var said = notice[ctx.merchant]; delete notice[ctx.merchant];
    ctx.wrap.insertBefore(el('div', { class: 'pin-tools' }, [toggle, said ? el('span', { class: 'pin-note' + (said.bad ? ' bad' : ''), role: 'status', text: said.text }) : null]), ctx.wrap.firstChild);
    Array.prototype.forEach.call(rows, function (row, i) {
      var p = ctx.pins[i];
      if (!p) return;
      var dots = row.querySelector('b');
      var info = state && state.byId[p.id];
      if (dots && info) {
        if (info.code) { dots.textContent = info.code; dots.setAttribute('data-pin-shown', ''); }
        else dots.title = info.hidden === 'owner' ? t('Le code du propriétaire ne s’affiche pas ici.') : t('Code saisi dans la console : il ne peut pas être affiché, seulement remplacé.');
      }
      if (ownerish(p.role) || ctx.senior === false) return;
      var del = row.querySelector('button.danger');
      var change = el('button', { class: 'mini', type: 'button', 'data-pin-change': p.id, text: t('Changer'), onclick: function () { openChange(row, p, ctx); } });
      row.insertBefore(change, del || null);
    });
  }

  window.KiwiAdminPinCodes = Object.freeze({ enhance: enhance });
})();
