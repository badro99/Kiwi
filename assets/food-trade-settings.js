/* ═══════════════════════════════════════════════════════════
 * Kiwi · RÉGLAGES DE CAISSE DES MÉTIERS DE BOUCHE — window.KiwiFoodTradeSettings
 * ---------------------------------------------------------------------------
 * « Menu › Réglages caisse » du tableau de bord, pour la pizzeria, le traiteur
 * et la boulangerie. La carte (produits, prix, options) se compose déjà dans
 * l'onglet Menu et arrive sur la caisse appairée ; ce que la carte ne sait pas
 * dire se règle ici, et la caisse le lit :
 *
 *   pizzeria     zones de livraison et frais · supplément moitié-moitié ·
 *                temps de cuisson
 *   traiteur     tarif des extras d'un devis (forfait, par invité, par groupe) ·
 *                conditions par défaut : acompte à la confirmation, part à
 *                J−n (n se règle), validité du devis
 *   boulangerie  formats et prix des gâteaux sur commande · parfums ·
 *                remise « dernière heure »
 *
 * Stockage : le réglage `foodtrade` (functions/api/store.js, écriture réservée
 * à la session propriétaire), via window.KiwiVerticalSettings
 * (assets/vertical-state.js). Rien n'est pré-rempli : une pizzeria qui n'a pas
 * saisi ses zones voit sa caisse le dire et demander les frais à chaque
 * livraison, plutôt que de facturer les frais de la démo.
 * ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var D = {
    fr: {
      title: 'Réglages caisse', sub: 'Ce que la carte ne dit pas, lu par votre caisse dès l’enregistrement.',
      save: 'Enregistrer', saved: 'Réglages enregistrés', add: 'Ajouter', remove: 'Retirer', none: 'Aucun pour l’instant.',
      invalid: 'Vérifiez les champs signalés.', readOnly: 'Seul le propriétaire peut modifier ces réglages.',
      pzTitle: 'Livraison', pzZones: 'Zones et frais de livraison', pzZonesHint: 'Sans zone enregistrée, la caisse demande le quartier et les frais à chaque livraison.',
      zoneName: 'Quartier ou zone', zoneFee: 'Frais (MAD)', zoneEta: 'Délai annoncé (optionnel)',
      pzHalf: 'Supplément moitié-moitié (MAD)', pzHalfHint: 'Laissez vide pour ne pas proposer la moitié-moitié.',
      pzBake: 'Temps de cuisson (minutes)', pzBakeHint: 'Le minuteur du four.',
      trTerms: 'Conditions par défaut d’un devis', trTermsHint: 'Chaque devis peut les ajuster sur la caisse.',
      trC: 'Acompte à la confirmation (%)', trJ: 'Deuxième part (%)', trOff: 'Échéance de la deuxième part (jours avant l’événement)', trValid: 'Validité du devis (jours)',
      trExtras: 'Extras d’un devis', trExtrasHint: 'Service, vaisselle, livraison : le prix par personne des plats vient de la carte.',
      exName: 'Prestation', exSub: 'Précision (optionnel)', exMode: 'Calcul', exEach: 'Prix unitaire (MAD)', exPer: 'Invités par unité', exUnit: 'Unité',
      modeForfait: 'Forfait', modeInvite: 'Par invité', modeGroupe: 'Par groupe d’invités',
      blParts: 'Formats de gâteau sur commande', blPartsHint: 'Sans format enregistré, la caisse demande le format et le prix à chaque commande.',
      partName: 'Format', partSub: 'Précision (optionnel)', partPrice: 'Prix (MAD)',
      blParfums: 'Parfums', blParfumsHint: 'Un parfum par ligne. Sans parfum, la caisse laisse un champ libre.',
      blLh: 'Remise « dernière heure » (%)', blLhHint: 'Appliquée à tout le comptoir quand la caissière l’active, entre 1 et 90.',
    },
    en: {
      title: 'Till settings', sub: 'What the menu does not say, read by your till as soon as you save.',
      save: 'Save', saved: 'Settings saved', add: 'Add', remove: 'Remove', none: 'None yet.',
      invalid: 'Check the highlighted fields.', readOnly: 'Only the owner can change these settings.',
      pzTitle: 'Delivery', pzZones: 'Delivery zones and fees', pzZonesHint: 'With no zone saved, the till asks for the area and the fee on each delivery.',
      zoneName: 'Area or zone', zoneFee: 'Fee (MAD)', zoneEta: 'Announced time (optional)',
      pzHalf: 'Half-and-half surcharge (MAD)', pzHalfHint: 'Leave empty to not offer half-and-half.',
      pzBake: 'Baking time (minutes)', pzBakeHint: 'The oven timer.',
      trTerms: 'Default quote terms', trTermsHint: 'Each quote can adjust them on the till.',
      trC: 'Deposit at confirmation (%)', trJ: 'Second instalment (%)', trOff: 'Second instalment due (days before the event)', trValid: 'Quote validity (days)',
      trExtras: 'Quote extras', trExtrasHint: 'Service, tableware, delivery: the per-person price of dishes comes from the menu.',
      exName: 'Service', exSub: 'Detail (optional)', exMode: 'Pricing', exEach: 'Unit price (MAD)', exPer: 'Guests per unit', exUnit: 'Unit',
      modeForfait: 'Flat fee', modeInvite: 'Per guest', modeGroupe: 'Per group of guests',
      blParts: 'Custom cake sizes', blPartsHint: 'With no size saved, the till asks for the size and price on each order.',
      partName: 'Size', partSub: 'Detail (optional)', partPrice: 'Price (MAD)',
      blParfums: 'Flavours', blParfumsHint: 'One flavour per line. With none, the till leaves a free field.',
      blLh: 'Last-hour discount (%)', blLhHint: 'Applied to the whole counter when the cashier turns it on, between 1 and 90.',
    },
    ar: {
      title: 'إعدادات الصندوق', sub: 'ما لا تقوله القائمة، يقرؤه صندوقك فور الحفظ.',
      save: 'حفظ', saved: 'تم حفظ الإعدادات', add: 'إضافة', remove: 'حذف', none: 'لا شيء حتى الآن.',
      invalid: 'تحقق من الحقول المشار إليها.', readOnly: 'المالك وحده يستطيع تعديل هذه الإعدادات.',
      pzTitle: 'التوصيل', pzZones: 'مناطق التوصيل والرسوم', pzZonesHint: 'دون منطقة محفوظة، يطلب الصندوق الحي والرسوم عند كل توصيل.',
      zoneName: 'الحي أو المنطقة', zoneFee: 'الرسوم (درهم)', zoneEta: 'المدة المعلنة (اختياري)',
      pzHalf: 'رسوم نصف ونصف (درهم)', pzHalfHint: 'اتركه فارغاً لعدم تقديم نصف ونصف.',
      pzBake: 'مدة الخبز (دقائق)', pzBakeHint: 'مؤقت الفرن.',
      trTerms: 'الشروط الافتراضية للعرض', trTermsHint: 'يمكن تعديلها في كل عرض على الصندوق.',
      trC: 'العربون عند التأكيد (%)', trJ: 'الدفعة الثانية (%)', trOff: 'استحقاق الدفعة الثانية (أيام قبل المناسبة)', trValid: 'صلاحية العرض (أيام)',
      trExtras: 'إضافات العرض', trExtrasHint: 'الخدمة والأواني والتوصيل: سعر الشخص للأطباق يأتي من القائمة.',
      exName: 'الخدمة', exSub: 'تفصيل (اختياري)', exMode: 'الحساب', exEach: 'سعر الوحدة (درهم)', exPer: 'مدعوون لكل وحدة', exUnit: 'الوحدة',
      modeForfait: 'مبلغ جزافي', modeInvite: 'لكل مدعو', modeGroupe: 'لكل مجموعة مدعوين',
      blParts: 'أحجام الكعك بالطلب', blPartsHint: 'دون حجم محفوظ، يطلب الصندوق الحجم والسعر عند كل طلب.',
      partName: 'الحجم', partSub: 'تفصيل (اختياري)', partPrice: 'السعر (درهم)',
      blParfums: 'النكهات', blParfumsHint: 'نكهة في كل سطر. دونها يترك الصندوق حقلاً حراً.',
      blLh: 'تخفيض الساعة الأخيرة (%)', blLhHint: 'يطبق على الكاونتر كله عندما تفعله الكاشير، بين 1 و 90.',
    },
  };

  function lang() {
    try {
      var l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || (typeof localStorage !== 'undefined' && localStorage.getItem('kiwiLang')) || 'fr';
      return D[l] ? l : 'fr';
    } catch (_) { return 'fr'; }
  }
  function t(k) { var l = lang(); return (D[l] && D[l][k]) || D.fr[k] || k; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function num(v) { var n = +String(v == null ? '' : v).replace(',', '.'); return isFinite(n) ? n : NaN; }

  /* Le métier tel que le tableau de bord le connaît (sous-type de la venue). */
  function tradeOf() {
    try {
      var KV = window.KiwiVenue;
      var v = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
      var raw = String(v.subtype || v.type || '').toLowerCase();
      if (raw === 'bakery' || raw === 'boulangerie') return 'boulangerie';
      if (raw === 'pizzeria' || raw === 'traiteur') return raw;
    } catch (_) {}
    return '';
  }
  /* Réel seulement : la caisse de démo garde sa démo, un réglage n'y changerait rien. */
  function enabledFor() {
    try { return !!tradeOf() && !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; }
  }

  function css() {
    if (document.getElementById('fts-css')) return;
    var st = document.createElement('style');
    st.id = 'fts-css';
    st.textContent =
      '.fts{max-width:760px}.fts-sec{margin:0 0 22px}.fts-h{font:600 15px/1.3 var(--sans,Inter Tight,sans-serif);margin:0 0 4px;color:var(--ink,#0A0F0D)}' +
      '.fts-hint{font:400 12.5px/1.45 var(--sans,Inter Tight,sans-serif);color:rgba(10,15,13,.62);margin:0 0 10px}' +
      '.fts-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;align-items:end;margin:0 0 8px;padding:10px;border:1px solid rgba(10,15,13,.12);border-radius:12px;background:var(--paper,#F7F5F0)}' +
      '.fts-f{display:flex;flex-direction:column;gap:4px;min-width:0}.fts-f label{font:600 11px/1.2 var(--sans,Inter Tight,sans-serif);letter-spacing:.02em;color:rgba(10,15,13,.62)}' +
      '.fts-f input,.fts-f select,.fts-f textarea{padding:9px 10px;border:1px solid rgba(10,15,13,.2);border-radius:9px;font:500 14px/1.2 var(--sans,Inter Tight,sans-serif);background:#fff;color:var(--ink,#0A0F0D);min-width:0}' +
      '.fts-f textarea{min-height:92px;line-height:1.4;resize:vertical}' +
      '.fts-f.bad input,.fts-f.bad select,.fts-f.bad textarea{border-color:#c24a2e;background:rgba(194,74,46,.06)}' +
      '.fts-x{align-self:end;padding:9px 12px;border:1px solid rgba(10,15,13,.2);border-radius:9px;background:transparent;color:var(--ink,#0A0F0D);font:600 12.5px/1 var(--sans,Inter Tight,sans-serif);cursor:pointer}' +
      '.fts-add{padding:9px 14px;border:1px dashed rgba(11,110,79,.5);border-radius:10px;background:transparent;color:var(--atlas,#0B6E4F);font:600 13px/1 var(--sans,Inter Tight,sans-serif);cursor:pointer}' +
      '.fts-none{font:400 13px/1.4 var(--sans,Inter Tight,sans-serif);color:rgba(10,15,13,.55);margin:0 0 8px}' +
      '.fts-bar{display:flex;gap:10px;align-items:center;margin-top:6px}.fts-save{padding:12px 22px;border:0;border-radius:11px;background:var(--atlas,#0B6E4F);color:#fff;font:600 14px/1 var(--sans,Inter Tight,sans-serif);cursor:pointer}' +
      '.fts-msg{font:600 12.5px/1.3 var(--sans,Inter Tight,sans-serif);color:var(--atlas,#0B6E4F)}.fts-msg.err{color:#9a2f16}' +
      '.fts-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}';
    document.head.appendChild(st);
  }

  /* ── un champ ── */
  function field(label, html, cls) { return '<div class="fts-f ' + (cls || '') + '"><label>' + esc(label) + '</label>' + html + '</div>'; }
  function inp(attrs, val) { return '<input ' + attrs + ' value="' + esc(val == null ? '' : val) + '">'; }

  /* ── pizzeria ── */
  function pizzeriaHtml(st) {
    var zones = Array.isArray(st.zones) ? st.zones : [];
    return '<div class="fts-sec"><h3 class="fts-h">' + esc(t('pzZones')) + '</h3><p class="fts-hint">' + esc(t('pzZonesHint')) + '</p>' +
      '<div data-fts-list="zones">' + (zones.length ? zones.map(zoneRow).join('') : '<p class="fts-none">' + esc(t('none')) + '</p>') + '</div>' +
      '<button type="button" class="fts-add" data-fts-add="zones">+ ' + esc(t('add')) + '</button></div>' +
      '<div class="fts-sec fts-two">' +
      field(t('pzHalf'), inp('type="number" min="0" step="0.5" inputmode="decimal" data-fts="halfFee"', st.halfFee == null ? '' : st.halfFee) + '<span class="fts-hint" style="margin:4px 0 0">' + esc(t('pzHalfHint')) + '</span>') +
      field(t('pzBake'), inp('type="number" min="1" max="60" step="1" inputmode="numeric" data-fts="bakeMin"', st.bakeMin == null ? '' : st.bakeMin) + '<span class="fts-hint" style="margin:4px 0 0">' + esc(t('pzBakeHint')) + '</span>') +
      '</div>';
  }
  function zoneRow(z) {
    z = z || {};
    return '<div class="fts-row" data-fts-row data-id="' + esc(z.id || uid()) + '">' +
      field(t('zoneName'), inp('type="text" maxlength="40" data-k="label"', z.label)) +
      field(t('zoneFee'), inp('type="number" min="0" step="0.5" inputmode="decimal" data-k="fee"', z.fee)) +
      field(t('zoneEta'), inp('type="text" maxlength="24" data-k="eta"', z.eta)) +
      '<button type="button" class="fts-x" data-fts-del>' + esc(t('remove')) + '</button></div>';
  }
  function pizzeriaRead(host) {
    var ok = true, zones = [];
    host.querySelectorAll('[data-fts-list="zones"] [data-fts-row]').forEach(function (r) {
      var label = r.querySelector('[data-k="label"]').value.trim(), fee = num(r.querySelector('[data-k="fee"]').value);
      var bad1 = !label, bad2 = !(fee >= 0);
      mark(r.querySelector('[data-k="label"]'), bad1); mark(r.querySelector('[data-k="fee"]'), bad2);
      if (bad1 || bad2) { ok = false; return; }
      zones.push({ id: r.dataset.id, label: label, fee: Math.round(fee * 100) / 100, eta: r.querySelector('[data-k="eta"]').value.trim() });
    });
    var halfRaw = host.querySelector('[data-fts="halfFee"]').value.trim();
    var half = halfRaw === '' ? '' : num(halfRaw);
    var bake = num(host.querySelector('[data-fts="bakeMin"]').value);
    mark(host.querySelector('[data-fts="halfFee"]'), half !== '' && !(half >= 0));
    var bakeBad = host.querySelector('[data-fts="bakeMin"]').value.trim() !== '' && !(bake >= 1 && bake <= 60);
    mark(host.querySelector('[data-fts="bakeMin"]'), bakeBad);
    if ((half !== '' && !(half >= 0)) || bakeBad) ok = false;
    return ok ? { zones: zones, halfFee: half === '' ? '' : Math.round(half * 100) / 100, bakeMin: isFinite(bake) ? Math.round(bake) : '' } : null;
  }

  /* ── traiteur ── */
  function traiteurHtml(st) {
    var tm = st.terms || {}, ex = Array.isArray(st.extras) ? st.extras : [];
    return '<div class="fts-sec"><h3 class="fts-h">' + esc(t('trTerms')) + '</h3><p class="fts-hint">' + esc(t('trTermsHint')) + '</p><div class="fts-two">' +
      field(t('trC'), inp('type="number" min="1" max="98" step="1" inputmode="numeric" data-fts="tc"', tm.c == null ? 30 : tm.c)) +
      field(t('trJ'), inp('type="number" min="1" max="98" step="1" inputmode="numeric" data-fts="tj"', tm.j7 == null ? 50 : tm.j7)) +
      field(t('trOff'), inp('type="number" min="1" max="90" step="1" inputmode="numeric" data-fts="to"', tm.off == null ? 7 : tm.off)) +
      field(t('trValid'), inp('type="number" min="1" max="90" step="1" inputmode="numeric" data-fts="tv"', tm.valid == null ? 7 : tm.valid)) +
      '</div></div>' +
      '<div class="fts-sec"><h3 class="fts-h">' + esc(t('trExtras')) + '</h3><p class="fts-hint">' + esc(t('trExtrasHint')) + '</p>' +
      '<div data-fts-list="extras">' + (ex.length ? ex.map(extraRow).join('') : '<p class="fts-none">' + esc(t('none')) + '</p>') + '</div>' +
      '<button type="button" class="fts-add" data-fts-add="extras">+ ' + esc(t('add')) + '</button></div>';
  }
  function extraRow(x) {
    x = x || {};
    var m = x.mode || 'forfait';
    return '<div class="fts-row" data-fts-row data-id="' + esc(x.id || uid()) + '">' +
      field(t('exName'), inp('type="text" maxlength="40" data-k="label"', x.label)) +
      field(t('exSub'), inp('type="text" maxlength="40" data-k="sub"', x.sub)) +
      field(t('exMode'), '<select data-k="mode"><option value="forfait"' + (m === 'forfait' ? ' selected' : '') + '>' + esc(t('modeForfait')) + '</option><option value="invite"' + (m === 'invite' ? ' selected' : '') + '>' + esc(t('modeInvite')) + '</option><option value="groupe"' + (m === 'groupe' ? ' selected' : '') + '>' + esc(t('modeGroupe')) + '</option></select>') +
      field(t('exEach'), inp('type="number" min="0" step="0.5" inputmode="decimal" data-k="each"', x.each)) +
      field(t('exPer'), inp('type="number" min="1" step="1" inputmode="numeric" data-k="per"', x.per)) +
      field(t('exUnit'), inp('type="text" maxlength="16" data-k="unit"', x.unit)) +
      '<button type="button" class="fts-x" data-fts-del>' + esc(t('remove')) + '</button></div>';
  }
  function traiteurRead(host) {
    var ok = true;
    var c = Math.round(num(host.querySelector('[data-fts="tc"]').value)), j = Math.round(num(host.querySelector('[data-fts="tj"]').value));
    var off = Math.round(num(host.querySelector('[data-fts="to"]').value)), valid = Math.round(num(host.querySelector('[data-fts="tv"]').value));
    var bC = !(c >= 1 && c <= 98), bJ = !(j >= 1 && j <= 98) || c + j > 99, bO = !(off >= 1 && off <= 90), bV = !(valid >= 1 && valid <= 90);
    mark(host.querySelector('[data-fts="tc"]'), bC); mark(host.querySelector('[data-fts="tj"]'), bJ);
    mark(host.querySelector('[data-fts="to"]'), bO); mark(host.querySelector('[data-fts="tv"]'), bV);
    if (bC || bJ || bO || bV) ok = false;
    var extras = [];
    host.querySelectorAll('[data-fts-list="extras"] [data-fts-row]').forEach(function (r) {
      var label = r.querySelector('[data-k="label"]').value.trim(), each = num(r.querySelector('[data-k="each"]').value);
      var mode = r.querySelector('[data-k="mode"]').value, per = Math.round(num(r.querySelector('[data-k="per"]').value));
      var b1 = !label, b2 = !(each >= 0), b3 = mode === 'groupe' && !(per >= 1);
      mark(r.querySelector('[data-k="label"]'), b1); mark(r.querySelector('[data-k="each"]'), b2); mark(r.querySelector('[data-k="per"]'), b3);
      if (b1 || b2 || b3) { ok = false; return; }
      extras.push({ id: r.dataset.id, label: label, sub: r.querySelector('[data-k="sub"]').value.trim(), mode: mode, each: Math.round(each * 100) / 100, per: mode === 'groupe' ? per : 1, unit: r.querySelector('[data-k="unit"]').value.trim() });
    });
    return ok ? { terms: { c: c, j7: j, off: off, valid: valid }, extras: extras } : null;
  }

  /* ── boulangerie ── */
  function boulangerieHtml(st) {
    var parts = Array.isArray(st.cakeParts) ? st.cakeParts : [], parf = Array.isArray(st.parfums) ? st.parfums : [];
    return '<div class="fts-sec"><h3 class="fts-h">' + esc(t('blParts')) + '</h3><p class="fts-hint">' + esc(t('blPartsHint')) + '</p>' +
      '<div data-fts-list="parts">' + (parts.length ? parts.map(partRow).join('') : '<p class="fts-none">' + esc(t('none')) + '</p>') + '</div>' +
      '<button type="button" class="fts-add" data-fts-add="parts">+ ' + esc(t('add')) + '</button></div>' +
      '<div class="fts-sec fts-two">' +
      field(t('blParfums'), '<textarea data-fts="parfums" maxlength="600">' + esc(parf.join('\n')) + '</textarea><span class="fts-hint" style="margin:4px 0 0">' + esc(t('blParfumsHint')) + '</span>') +
      field(t('blLh'), inp('type="number" min="1" max="90" step="1" inputmode="numeric" data-fts="lh"', st.lastHourPct == null ? 50 : st.lastHourPct) + '<span class="fts-hint" style="margin:4px 0 0">' + esc(t('blLhHint')) + '</span>') +
      '</div>';
  }
  function partRow(p) {
    p = p || {};
    return '<div class="fts-row" data-fts-row data-id="' + esc(p.id || uid()) + '">' +
      field(t('partName'), inp('type="text" maxlength="30" data-k="label"', p.label)) +
      field(t('partSub'), inp('type="text" maxlength="30" data-k="sub"', p.sub)) +
      field(t('partPrice'), inp('type="number" min="1" step="1" inputmode="decimal" data-k="price"', p.price)) +
      '<button type="button" class="fts-x" data-fts-del>' + esc(t('remove')) + '</button></div>';
  }
  function boulangerieRead(host) {
    var ok = true, parts = [];
    host.querySelectorAll('[data-fts-list="parts"] [data-fts-row]').forEach(function (r) {
      var label = r.querySelector('[data-k="label"]').value.trim(), price = num(r.querySelector('[data-k="price"]').value);
      var b1 = !label, b2 = !(price > 0);
      mark(r.querySelector('[data-k="label"]'), b1); mark(r.querySelector('[data-k="price"]'), b2);
      if (b1 || b2) { ok = false; return; }
      parts.push({ id: r.dataset.id, label: label, sub: r.querySelector('[data-k="sub"]').value.trim(), price: Math.round(price * 100) / 100 });
    });
    var lh = Math.round(num(host.querySelector('[data-fts="lh"]').value));
    var bL = !(lh >= 1 && lh <= 90);
    mark(host.querySelector('[data-fts="lh"]'), bL);
    if (bL) ok = false;
    var parfums = host.querySelector('[data-fts="parfums"]').value.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 20);
    return ok ? { cakeParts: parts, parfums: parfums, lastHourPct: lh } : null;
  }
  function mark(el, bad) { if (el && el.closest) { var f = el.closest('.fts-f'); if (f) f.classList.toggle('bad', !!bad); } }

  var TRADES = {
    pizzeria: { html: pizzeriaHtml, read: pizzeriaRead, rows: { zones: zoneRow } },
    traiteur: { html: traiteurHtml, read: traiteurRead, rows: { extras: extraRow } },
    boulangerie: { html: boulangerieHtml, read: boulangerieRead, rows: { parts: partRow } },
  };

  /* Monte le panneau dans `host`. Renvoie false si le métier n'a pas de réglage. */
  function mount(host) {
    var trade = tradeOf();
    if (!host || !trade || !window.KiwiVerticalSettings) return false;
    css();
    var spec = TRADES[trade];
    var st = window.KiwiVerticalSettings.get(trade) || {};
    host.innerHTML = '<div class="fts" dir="' + (lang() === 'ar' ? 'rtl' : 'ltr') + '">' + spec.html(st) +
      '<div class="fts-bar"><button type="button" class="fts-save" data-fts-save>' + esc(t('save')) + '</button><span class="fts-msg" data-fts-msg role="status"></span></div></div>';
    var msg = host.querySelector('[data-fts-msg]');
    host.addEventListener('click', function (e) {
      var add = e.target.closest && e.target.closest('[data-fts-add]');
      if (add) {
        var key = add.getAttribute('data-fts-add'), list = host.querySelector('[data-fts-list="' + key + '"]');
        var none = list.querySelector('.fts-none'); if (none) none.remove();
        list.insertAdjacentHTML('beforeend', spec.rows[key]({ id: uid() }));
        var first = list.querySelector('[data-fts-row]:last-child input'); if (first) first.focus();
        return;
      }
      var del = e.target.closest && e.target.closest('[data-fts-del]');
      if (del) { del.closest('[data-fts-row]').remove(); return; }
      var save = e.target.closest && e.target.closest('[data-fts-save]');
      if (save) {
        var patch = spec.read(host);
        if (!patch) { msg.textContent = t('invalid'); msg.className = 'fts-msg err'; return; }
        try { window.KiwiVerticalSettings.set(trade, patch); msg.textContent = t('saved'); msg.className = 'fts-msg'; }
        catch (_) { msg.textContent = t('invalid'); msg.className = 'fts-msg err'; }
      }
    });
    return true;
  }

  window.KiwiFoodTradeSettings = { mount: mount, enabled: enabledFor, tradeOf: tradeOf, title: function () { return t('title'); }, sub: function () { return t('sub'); }, _t: t };
})();
