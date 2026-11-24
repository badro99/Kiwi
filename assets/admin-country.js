/* Kiwi · console God Mode · le pays d'exploitation d'un commerce.
 *
 * Owner, 24 nov. 2026 (CHICTRATEC SL, Startoner, en Espagne) : « add a toggle in
 * godmode so that we can choose the country of operations ». Un sélecteur sous
 * le type d'activité, dans Configuration. Le pays décide de la devise des tickets
 * et des commandes Shopify, de la TVA/IVA et de la journée commerciale :
 * assets/country-catalog.js. Serveur : functions/api/admin/country.js.
 * kiwi-admin.html › renderTypeRow appelle mount() ; ce fichier absent, la
 * console reste celle d'avant.
 */
(function () {
  'use strict';
  var NAMES = { MA: 'Maroc', ES: 'Espagne' };
  var SUMMARY = {
    MA: 'Dirhams, TVA marocaine, ICE, heure de Casablanca.',
    ES: 'Euros, IVA 21 / 10 / 4 %, NIF, heure de Madrid. Les commandes Shopify en euros entrent dans les ventes.',
  };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  var generation = 0;
  async function mount(ctx) {
    if (!ctx || !ctx.row || !ctx.merchant || !window.KiwiAdminApi) return;
    var mine = ++generation;
    var old = ctx.row.parentNode && ctx.row.parentNode.querySelector('[data-country-row]');
    if (old) old.remove();
    var sel = el('select', { class: 'type-select', 'aria-label': 'Pays d’exploitation', disabled: '' });
    Object.keys(NAMES).forEach(function (c) { sel.appendChild(el('option', { value: c, text: NAMES[c] })); });
    var note = el('p', { class: 'hint', role: 'status' });
    var box = el('div', { 'data-country-row': '' }, [el('label', { class: 'type-field' }, [el('span', { class: 'type-lbl', text: 'Pays d’exploitation' }), sel]), note]);
    ctx.row.parentNode.insertBefore(box, ctx.row.nextSibling);
    var current = 'MA';
    try {
      var r = await window.KiwiAdminApi.request('/country?merchant=' + encodeURIComponent(ctx.merchant));
      if (mine !== generation) return;
      current = r && r.country || 'MA';
      sel.value = current;
      note.textContent = SUMMARY[current] || '';
      if (ctx.senior !== false) sel.removeAttribute('disabled');
    } catch (_) { note.textContent = 'Pays indisponible. Réessayez.'; return; }
    sel.addEventListener('change', async function () {
      var wanted = sel.value;
      sel.setAttribute('disabled', '');
      note.textContent = 'Enregistrement…';
      try {
        await window.KiwiAdminApi.request('/country', { method: 'POST', body: JSON.stringify({ merchant: ctx.merchant, country: wanted }) });
        current = wanted;
        note.textContent = 'Pays : ' + NAMES[wanted] + '. ' + SUMMARY[wanted];
      } catch (error) {
        sel.value = current;
        var code = error && error.body && error.body.error;
        note.textContent = code === 'operator-code-required' ? 'Un code opérateur nommé est requis.' : 'Changement refusé. Réessayez.';
      }
      sel.removeAttribute('disabled');
    });
  }
  window.KiwiAdminCountry = Object.freeze({ mount: mount });
})();
