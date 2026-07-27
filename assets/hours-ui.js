/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ÉDITEUR D'HORAIRES — window.KiwiHoursUI
 * ---------------------------------------------------------------------------
 * L'unique écran où l'on saisit les horaires d'un établissement. Il vit dans
 * Réglages → Mes établissements, et nulle part ailleurs : Réservations, Order
 * Pro et la caisse LISENT window.KiwiHours, ils ne proposent pas leur propre
 * réglage. Deux écrans de saisie, ce sont deux vérités qui divergent le jour où
 * l'un est mis à jour et pas l'autre.
 *
 * Rien ne se tape. Les heures sont des menus déroulants au pas de 15 minutes,
 * en format 24 h. C'est la contrainte qui a motivé tout ce chantier : « 12-02 »
 * saisi à la main est illisible par une machine — est-ce midi à deux heures,
 * douze heures moins deux, le 12 février ? — et un champ qu'aucune machine ne
 * lit ne peut pas être la source de vérité d'un produit.
 *
 * Les raccourcis ne sont pas du confort. Une semaine de sept jours saisie
 * service par service, c'est vingt-huit menus déroulants ; un commerçant qui
 * ouvre pareil du lundi au vendredi abandonne avant le mercredi, et un horaire
 * abandonné à moitié est exactement ce qu'on essaie de supprimer.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var H = function () { return window.KiwiHours; };
  var Kw = function () { return window.Kiwi; };
  function lang() {
    try {
      var l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang();
      return (l === 'en' || l === 'ar') ? l : 'fr';
    } catch (_) { return 'fr'; }
  }
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  var T = {
    fr: {
      title: 'Horaires d’ouverture', sub: 'La référence pour tout Kiwi — caisse, réservations, commandes en ligne et assistant',
      week: 'Semaine type', open: 'Ouvert', closed: 'Fermé', to: 'à',
      addPeriod: '+ Second service', delPeriod: 'Retirer ce service',
      copy: 'Copier vers…', copyTo: 'Copier ce jour vers', apply: 'Appliquer',
      shortcuts: 'Raccourcis', scWeekdays: 'Lundi → semaine', scAll: 'Appliquer à tous les jours',
      scWeekend: 'Week-end fermé', sc247: 'Ouvert 24 h/24', scClear: 'Tout effacer',
      exceptions: 'Exceptions', exNone: 'Aucune exception. La semaine type s’applique toute l’année.',
      exAdd: '+ Ajouter une exception', exFrom: 'Du', exTo: 'Au', exLabel: 'Motif',
      exKindClosed: 'Fermé exceptionnellement', exKindHours: 'Horaires différents',
      exDel: 'Supprimer', exReturn: 'La semaine type reprend automatiquement à la fin de la période.',
      save: 'Enregistrer', cancel: 'Annuler', saved: 'Horaires enregistrés',
      legacyHead: 'Ancienne saisie libre à remplacer',
      legacyBody: function (v) { return 'Cet établissement porte « ' + v +' » en texte libre. Kiwi ne peut pas s’en servir : renseignez la semaine ci-dessous, l’ancienne valeur sera effacée.'; },
      presets: 'Motifs fréquents', pRamadan: 'Ramadan', pEid: 'Aïd', pHoliday: 'Jour férié',
      pLeave: 'Congés', pSeason: 'Saison',
      errNoDay: 'Renseignez au moins un jour d’ouverture avant d’enregistrer.',
      errSame: 'L’ouverture et la fermeture ne peuvent pas être identiques.',
      overnight: 'ferme le lendemain',
      todayIs: 'Aujourd’hui',
    },
    en: {
      title: 'Opening hours', sub: 'The reference for all of Kiwi — till, bookings, online orders and assistant',
      week: 'Weekly schedule', open: 'Open', closed: 'Closed', to: 'to',
      addPeriod: '+ Second service', delPeriod: 'Remove this service',
      copy: 'Copy to…', copyTo: 'Copy this day to', apply: 'Apply',
      shortcuts: 'Shortcuts', scWeekdays: 'Monday → weekdays', scAll: 'Apply to every day',
      scWeekend: 'Weekend closed', sc247: 'Open 24 hours', scClear: 'Clear all',
      exceptions: 'Exceptions', exNone: 'No exceptions. The weekly schedule applies all year.',
      exAdd: '+ Add an exception', exFrom: 'From', exTo: 'To', exLabel: 'Reason',
      exKindClosed: 'Closed exceptionally', exKindHours: 'Different hours',
      exDel: 'Delete', exReturn: 'The weekly schedule resumes automatically when the period ends.',
      save: 'Save', cancel: 'Cancel', saved: 'Opening hours saved',
      legacyHead: 'Old free-text value to replace',
      legacyBody: function (v) { return 'This business carries “' + v + '” as free text. Kiwi cannot use it: fill in the week below and the old value will be cleared.'; },
      presets: 'Common reasons', pRamadan: 'Ramadan', pEid: 'Eid', pHoliday: 'Public holiday',
      pLeave: 'Leave', pSeason: 'Season',
      errNoDay: 'Set at least one open day before saving.',
      errSame: 'Opening and closing time cannot be identical.',
      overnight: 'closes next day',
      todayIs: 'Today',
    },
    ar: {
      title: 'ساعات العمل', sub: 'المرجع لكل كيوي — الصندوق، الحجوزات، الطلبات والمساعد',
      week: 'الأسبوع المعتاد', open: 'مفتوح', closed: 'مغلق', to: 'إلى',
      addPeriod: '+ فترة ثانية', delPeriod: 'حذف هذه الفترة',
      copy: 'نسخ إلى…', copyTo: 'نسخ هذا اليوم إلى', apply: 'تطبيق',
      shortcuts: 'اختصارات', scWeekdays: 'الإثنين → أيام الأسبوع', scAll: 'تطبيق على كل الأيام',
      scWeekend: 'عطلة نهاية الأسبوع مغلقة', sc247: 'مفتوح 24 ساعة', scClear: 'مسح الكل',
      exceptions: 'استثناءات', exNone: 'لا استثناءات. الأسبوع المعتاد يسري طوال السنة.',
      exAdd: '+ إضافة استثناء', exFrom: 'من', exTo: 'إلى', exLabel: 'السبب',
      exKindClosed: 'مغلق استثنائيًا', exKindHours: 'ساعات مختلفة',
      exDel: 'حذف', exReturn: 'يعود الأسبوع المعتاد تلقائيًا عند انتهاء الفترة.',
      save: 'حفظ', cancel: 'إلغاء', saved: 'تم حفظ ساعات العمل',
      legacyHead: 'قيمة نصية قديمة يجب استبدالها',
      legacyBody: function (v) { return 'تحمل هذه المؤسسة « ' + v + ' » كنص حر. لا يستطيع كيوي استعماله: املأ الأسبوع أدناه وستُمحى القيمة القديمة.'; },
      presets: 'أسباب شائعة', pRamadan: 'رمضان', pEid: 'العيد', pHoliday: 'عطلة رسمية',
      pLeave: 'إجازة', pSeason: 'موسم',
      errNoDay: 'حدد يوم عمل واحدًا على الأقل قبل الحفظ.',
      errSame: 'لا يمكن أن يتطابق وقت الفتح والإغلاق.',
      overnight: 'يغلق في اليوم التالي',
      todayIs: 'اليوم',
    },
  };
  var t = function () { return T[lang()] || T.fr; };

  /* ── styles ── */
  var CSS = [
    '.kh-wrap{font-family:var(--sans);color:var(--ink);}',
    '.kh-sum{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:var(--paper-soft);border:1px solid var(--n-200);margin-bottom:16px;font-size:14px;}',
    '.kh-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;background:var(--n-400);}',
    '.kh-dot.open{background:var(--success,#16a34a);}.kh-dot.closed{background:var(--n-400);}',
    '.kh-dot.soon{background:var(--warning,#d97706);}.kh-dot.unset{background:var(--danger,#dc2626);}',
    '.kh-sum b{font-weight:600;}',
    '.kh-legacy{padding:12px 14px;border-radius:12px;background:#fff8ed;border:1px solid #f3d9a4;margin-bottom:16px;font-size:13px;line-height:1.5;}',
    '.kh-legacy .h{font-weight:600;margin-bottom:4px;}',
    '.kh-eyebrow{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--n-500);font-weight:500;margin:20px 0 10px;}',
    '.kh-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--n-100);flex-wrap:wrap;}',
    '.kh-row:last-child{border-bottom:0;}',
    '.kh-day{width:96px;flex-shrink:0;font-size:13.5px;font-weight:500;}',
    '.kh-today{display:inline-block;margin-inline-start:6px;font-size:9.5px;letter-spacing:.08em;color:var(--atlas);border:1px solid var(--atlas);border-radius:5px;padding:1px 4px;vertical-align:1px;}',
    '.kh-sw{position:relative;width:40px;height:23px;border-radius:12px;background:var(--n-300);cursor:pointer;flex-shrink:0;transition:background 160ms;border:0;padding:0;}',
    '.kh-sw::after{content:"";position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;background:#fff;transition:transform 160ms;}',
    '.kh-sw[aria-checked="true"]{background:var(--atlas);}',
    '.kh-sw[aria-checked="true"]::after{transform:translateX(17px);}',
    '.kh-per{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.kh-sel{padding:6px 8px;border:1px solid var(--n-200);border-radius:9px;font-family:var(--mono,var(--sans));font-size:13px;color:var(--ink);background:var(--surface);outline:none;cursor:pointer;}',
    '.kh-sel:focus{border-color:var(--atlas);}',
    '.kh-sep{font-size:12.5px;color:var(--n-500);}',
    '.kh-off{font-size:13px;color:var(--n-500);}',
    '.kh-x{border:0;background:none;color:var(--n-500);cursor:pointer;font-size:15px;line-height:1;padding:3px 5px;border-radius:6px;}',
    '.kh-x:hover{background:var(--n-100);color:var(--danger,#dc2626);}',
    '.kh-add{border:0;background:none;color:var(--atlas);cursor:pointer;font-size:12.5px;padding:3px 6px;border-radius:6px;white-space:nowrap;}',
    '.kh-add:hover{background:var(--mint-soft);}',
    '.kh-night{font-size:11px;color:var(--n-500);white-space:nowrap;}',
    '.kh-chips{display:flex;flex-wrap:wrap;gap:7px;}',
    '.kh-chip{border:1px solid var(--n-200);background:var(--surface);border-radius:999px;padding:6px 12px;font-size:12.5px;color:var(--ink);cursor:pointer;font-family:var(--sans);}',
    '.kh-chip:hover{border-color:var(--atlas);color:var(--atlas);}',
    '.kh-ex{border:1px solid var(--n-200);border-radius:12px;padding:11px 13px;margin-bottom:9px;}',
    '.kh-ex-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}',
    '.kh-ex-name{font-weight:600;font-size:13.5px;flex:1;min-width:120px;}',
    '.kh-ex-meta{font-size:12px;color:var(--n-600);margin-top:3px;}',
    '.kh-ex-tag{font-size:10px;letter-spacing:.07em;text-transform:uppercase;border-radius:5px;padding:2px 6px;background:var(--n-100);color:var(--n-600);}',
    '.kh-ex-tag.cl{background:#fdecec;color:#b91c1c;}',
    '.kh-empty{font-size:13px;color:var(--n-500);padding:9px 0;}',
    '.kh-in{padding:7px 10px;border:1px solid var(--n-200);border-radius:9px;font-family:var(--sans);font-size:13px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;}',
    '.kh-in:focus{border-color:var(--atlas);}',
    '.kh-err{color:var(--danger,#dc2626);font-size:12.5px;margin-top:8px;min-height:16px;}',
    '.kh-note{font-size:12px;color:var(--n-500);margin-top:7px;line-height:1.5;}',
    '@media(max-width:560px){.kh-day{width:100%;}.kh-row{gap:8px;}}',
  ].join('');
  function ensureCSS() {
    if (document.getElementById('kh-style')) return;
    var s = document.createElement('style');
    s.id = 'kh-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── le menu déroulant d'heures ──
   * Une seule liste, 00:00 → 23:45 au pas de 15 min, plus 24:00 en fermeture.
   * `sel` est comparé en texte : la valeur enregistrée est déjà normalisée. */
  function timeOptions(sel, isEnd) {
    var out = [];
    for (var m = 0; m < 1440; m += 15) {
      var v = pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
      out.push('<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + v + '</option>');
    }
    if (isEnd) out.push('<option value="24:00"' + (sel === '24:00' ? ' selected' : '') + '>24:00</option>');
    return out.join('');
  }

  /* ═══════════════════════════ l'éditeur ═══════════════════════════ */
  /* opts.venueId  l'établissement édité (défaut : l'actif)
   * opts.legacy   l'ancien texte libre, s'il en reste un à remplacer
   * opts.title    en-tête (le nom de l'établissement)
   * opts.onSave(doc) */
  function open(opts) {
    opts = opts || {};
    var K = H(); if (!K || !Kw() || !Kw().modal) return null;
    ensureCSS();
    var L = t();
    var vid = opts.venueId || null;
    var doc = K.get(vid);
    var DAYS = K.DAYS;
    var todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];

    var m = Kw().modal({
      title: L.title, desc: esc(opts.title || '') || L.sub, width: 700,
      body: '<div class="kh-wrap" id="kh-body"></div>',
      foot: '<button class="kb ghost" id="kh-cancel">' + esc(L.cancel) + '</button>' +
            '<button class="kb primary" id="kh-save">' + esc(L.save) + '</button>',
    });
    var body = m.el.querySelector('#kh-body');

    /* ── rendu ── */
    function dayRow(d) {
      var day = doc.week[d] || { open: false, periods: [] };
      var isToday = d === todayKey;
      var h = '<div class="kh-row" data-d="' + d + '">';
      h += '<div class="kh-day">' + esc(K.dayLabel(d, lang())) +
           (isToday ? '<span class="kh-today">' + esc(L.todayIs) + '</span>' : '') + '</div>';
      h += '<button class="kh-sw" role="switch" aria-checked="' + (day.open ? 'true' : 'false') +
           '" data-act="toggle" aria-label="' + esc(K.dayLabel(d, lang())) + '"></button>';
      if (!day.open || !day.periods.length) {
        h += '<span class="kh-off">' + esc(L.closed) + '</span>';
      } else {
        h += '<div class="kh-per">';
        day.periods.forEach(function (p, i) {
          var overnight = K.toMin(p.to) <= K.toMin(p.from) && p.to !== '24:00';
          h += '<span class="kh-per" data-i="' + i + '">';
          if (i) h += '<span class="kh-sep">·</span>';
          h += '<select class="kh-sel" data-act="from" data-i="' + i + '">' + timeOptions(p.from, false) + '</select>';
          h += '<span class="kh-sep">' + esc(L.to) + '</span>';
          h += '<select class="kh-sel" data-act="to" data-i="' + i + '">' + timeOptions(p.to, true) + '</select>';
          if (overnight) h += '<span class="kh-night">' + esc(L.overnight) + '</span>';
          if (day.periods.length > 1) {
            h += '<button class="kh-x" data-act="del" data-i="' + i + '" title="' + esc(L.delPeriod) + '">×</button>';
          }
          h += '</span>';
        });
        if (day.periods.length < 2) {
          h += '<button class="kh-add" data-act="add">' + esc(L.addPeriod) + '</button>';
        }
        h += '<button class="kh-add" data-act="copy">' + esc(L.copy) + '</button>';
        h += '</div>';
      }
      h += '</div>';
      return h;
    }

    function exRow(e) {
      var closed = e.kind === 'closed';
      var per = closed ? '' : e.periods.map(function (p) { return p.from + '–' + p.to; }).join(', ');
      var range = e.from === e.to ? e.from : e.from + ' → ' + e.to;
      return '<div class="kh-ex" data-x="' + esc(e.id) + '">' +
        '<div class="kh-ex-top">' +
          '<span class="kh-ex-name">' + esc(e.label || (closed ? L.exKindClosed : L.exKindHours)) + '</span>' +
          '<span class="kh-ex-tag' + (closed ? ' cl' : '') + '">' + esc(closed ? L.exKindClosed : L.exKindHours) + '</span>' +
          '<button class="kh-x" data-act="ex-del" title="' + esc(L.exDel) + '">×</button>' +
        '</div>' +
        '<div class="kh-ex-meta">' + esc(range) + (per ? ' · ' + esc(per) : '') + '</div>' +
      '</div>';
    }

    function render() {
      /* Le résumé porte sur le BROUILLON, pas sur la fiche enregistrée : sinon
       * il contredirait l'écran dès la première modification. summaryOf() prend
       * un document explicite, précisément pour qu'on n'ait pas à publier un
       * horaire non validé juste pour l'afficher. */
      var draft = K.summaryOf(doc, Date.now(), lang());
      var h = '';
      if (opts.legacy) {
        h += '<div class="kh-legacy"><div class="h">' + esc(L.legacyHead) + '</div>' +
             esc(L.legacyBody(opts.legacy)) + '</div>';
      }
      h += '<div class="kh-sum"><span class="kh-dot ' + draft.tone + '"></span><b>' + esc(draft.text) + '</b></div>';
      h += '<div class="kh-eyebrow">' + esc(L.week) + '</div>';
      h += DAYS.map(dayRow).join('');
      h += '<div class="kh-eyebrow">' + esc(L.shortcuts) + '</div>';
      h += '<div class="kh-chips">' +
        '<button class="kh-chip" data-sc="weekdays">' + esc(L.scWeekdays) + '</button>' +
        '<button class="kh-chip" data-sc="all">' + esc(L.scAll) + '</button>' +
        '<button class="kh-chip" data-sc="weekend">' + esc(L.scWeekend) + '</button>' +
        '<button class="kh-chip" data-sc="247">' + esc(L.sc247) + '</button>' +
        '<button class="kh-chip" data-sc="clear">' + esc(L.scClear) + '</button>' +
      '</div>';
      h += '<div class="kh-eyebrow">' + esc(L.exceptions) + '</div>';
      h += (doc.exceptions || []).length
        ? doc.exceptions.slice().sort(function (a, b) { return a.from < b.from ? -1 : 1; }).map(exRow).join('')
        : '<div class="kh-empty">' + esc(L.exNone) + '</div>';
      h += '<button class="kh-chip" data-act="ex-add" style="margin-top:4px;">' + esc(L.exAdd) + '</button>';
      h += '<div class="kh-note">' + esc(L.exReturn) + '</div>';
      h += '<div class="kh-err" id="kh-err"></div>';
      body.innerHTML = h;
    }
    /* ── mutations ── */
    function ensureDay(d) {
      if (!doc.week[d]) doc.week[d] = { open: false, periods: [] };
      return doc.week[d];
    }
    function defaultPeriod() { return { from: '09:00', to: '19:00' }; }

    body.addEventListener('change', function (e) {
      var sel = e.target.closest('select[data-act]');
      if (!sel) return;
      var row = sel.closest('.kh-row'); if (!row) return;
      var day = ensureDay(row.dataset.d);
      var i = +sel.dataset.i || 0;
      if (!day.periods[i]) return;
      day.periods[i][sel.dataset.act === 'from' ? 'from' : 'to'] = sel.value;
      render();
    });

    body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act],[data-sc]');
      if (!btn) return;
      var row = btn.closest('.kh-row');
      var act = btn.dataset.act, sc = btn.dataset.sc;

      if (sc) { shortcut(sc); return; }
      if (act === 'ex-add') { exceptionModal(null); return; }
      if (act === 'ex-del') {
        var card = btn.closest('.kh-ex');
        doc.exceptions = doc.exceptions.filter(function (x) { return x.id !== card.dataset.x; });
        render(); return;
      }
      if (!row) return;
      var d = row.dataset.d, day = ensureDay(d);
      if (act === 'toggle') {
        day.open = !day.open;
        if (day.open && !day.periods.length) day.periods = [defaultPeriod()];
        render(); return;
      }
      if (act === 'add') {
        if (day.periods.length < 2) day.periods.push({ from: '19:00', to: '23:00' });
        render(); return;
      }
      if (act === 'del') {
        day.periods.splice(+btn.dataset.i || 0, 1);
        if (!day.periods.length) day.open = false;
        render(); return;
      }
      if (act === 'copy') { copyModal(d); return; }
    });

    function shortcut(kind) {
      var mon = doc.week.mon;
      if (kind === 'weekdays') {
        ['tue', 'wed', 'thu', 'fri'].forEach(function (d) { doc.week[d] = JSON.parse(JSON.stringify(mon)); });
      } else if (kind === 'all') {
        DAYS.forEach(function (d) { if (d !== 'mon') doc.week[d] = JSON.parse(JSON.stringify(mon)); });
      } else if (kind === 'weekend') {
        doc.week.sat = { open: false, periods: [] };
        doc.week.sun = { open: false, periods: [] };
      } else if (kind === '247') {
        DAYS.forEach(function (d) { doc.week[d] = { open: true, periods: [{ from: '00:00', to: '24:00' }] }; });
      } else if (kind === 'clear') {
        DAYS.forEach(function (d) { doc.week[d] = { open: false, periods: [] }; });
      }
      render();
    }

    /* ── copier un jour vers d'autres ── */
    function copyModal(src) {
      var boxes = DAYS.filter(function (d) { return d !== src; }).map(function (d) {
        return '<label style="display:flex;align-items:center;gap:9px;padding:8px 2px;font-size:13.5px;cursor:pointer;">' +
          '<input type="checkbox" data-cp="' + d + '" style="width:16px;height:16px;accent-color:var(--atlas);"/>' +
          esc(K.dayLabel(d, lang())) + '</label>';
      }).join('');
      var cm = Kw().modal({
        title: L.copyTo + ' — ' + K.dayLabel(src, lang()), width: 380,
        body: '<div>' + boxes + '</div>',
        foot: '<button class="kb ghost" id="kh-cp-x">' + esc(L.cancel) + '</button>' +
              '<button class="kb primary" id="kh-cp-ok">' + esc(L.apply) + '</button>',
      });
      cm.el.querySelector('#kh-cp-x').onclick = cm.close;
      cm.el.querySelector('#kh-cp-ok').onclick = function () {
        cm.el.querySelectorAll('input[data-cp]:checked').forEach(function (c) {
          doc.week[c.dataset.cp] = JSON.parse(JSON.stringify(doc.week[src]));
        });
        cm.close(); render();
      };
    }

    /* ── ajouter une exception ── */
    function exceptionModal() {
      var today = K.ymd(new Date());
      var presets = [['pRamadan', L.pRamadan], ['pEid', L.pEid], ['pHoliday', L.pHoliday],
                     ['pLeave', L.pLeave], ['pSeason', L.pSeason]];
      var xm = Kw().modal({
        title: L.exAdd.replace(/^\+\s*/, ''), width: 460,
        body:
          '<div class="kh-wrap">' +
            '<div class="kh-eyebrow" style="margin-top:0;">' + esc(L.presets) + '</div>' +
            '<div class="kh-chips">' + presets.map(function (p) {
              return '<button class="kh-chip" data-p="' + esc(p[1]) + '">' + esc(p[1]) + '</button>';
            }).join('') + '</div>' +
            '<div class="kh-eyebrow">' + esc(L.exLabel) + '</div>' +
            '<input class="kh-in" id="kh-x-label" style="width:100%;" maxlength="60" placeholder="' + esc(L.pRamadan) + '"/>' +
            '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">' +
              '<div style="flex:1;min-width:130px;"><div class="kh-eyebrow" style="margin:0 0 5px;">' + esc(L.exFrom) + '</div>' +
                '<input class="kh-in" type="date" id="kh-x-from" style="width:100%;" value="' + today + '"/></div>' +
              '<div style="flex:1;min-width:130px;"><div class="kh-eyebrow" style="margin:0 0 5px;">' + esc(L.exTo) + '</div>' +
                '<input class="kh-in" type="date" id="kh-x-to" style="width:100%;" value="' + today + '"/></div>' +
            '</div>' +
            '<div class="kh-eyebrow">' + esc(L.exKindClosed.split(' ')[0]) + '</div>' +
            '<div class="kh-chips">' +
              '<button class="kh-chip" data-k="closed" style="border-color:var(--atlas);color:var(--atlas);">' + esc(L.exKindClosed) + '</button>' +
              '<button class="kh-chip" data-k="hours">' + esc(L.exKindHours) + '</button>' +
            '</div>' +
            '<div id="kh-x-per" style="display:none;margin-top:12px;">' +
              '<div class="kh-per">' +
                '<select class="kh-sel" id="kh-x-f">' + timeOptions('12:00', false) + '</select>' +
                '<span class="kh-sep">' + esc(L.to) + '</span>' +
                '<select class="kh-sel" id="kh-x-t">' + timeOptions('22:00', true) + '</select>' +
              '</div>' +
            '</div>' +
            '<div class="kh-note">' + esc(L.exReturn) + '</div>' +
          '</div>',
        foot: '<button class="kb ghost" id="kh-x-cancel">' + esc(L.cancel) + '</button>' +
              '<button class="kb primary" id="kh-x-ok">' + esc(L.apply) + '</button>',
      });
      var kind = 'closed';
      xm.el.addEventListener('click', function (e) {
        var p = e.target.closest('[data-p]');
        if (p) { xm.el.querySelector('#kh-x-label').value = p.dataset.p; return; }
        var k = e.target.closest('[data-k]');
        if (!k) return;
        kind = k.dataset.k;
        xm.el.querySelectorAll('[data-k]').forEach(function (b) {
          var on = b.dataset.k === kind;
          b.style.borderColor = on ? 'var(--atlas)' : '';
          b.style.color = on ? 'var(--atlas)' : '';
        });
        xm.el.querySelector('#kh-x-per').style.display = kind === 'hours' ? '' : 'none';
      });
      xm.el.querySelector('#kh-x-cancel').onclick = xm.close;
      xm.el.querySelector('#kh-x-ok').onclick = function () {
        var from = xm.el.querySelector('#kh-x-from').value;
        var to = xm.el.querySelector('#kh-x-to').value || from;
        if (!from) return;
        var e = {
          id: 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          from: from, to: to, kind: kind,
          label: xm.el.querySelector('#kh-x-label').value.trim(),
          periods: kind === 'hours'
            ? [{ from: xm.el.querySelector('#kh-x-f').value, to: xm.el.querySelector('#kh-x-t').value }]
            : [],
        };
        doc.exceptions = (doc.exceptions || []).concat([e]);
        xm.close(); render();
      };
    }

    /* ── enregistrer ── */
    m.el.querySelector('#kh-cancel').onclick = m.close;
    m.el.querySelector('#kh-save').onclick = function () {
      var err = m.el.querySelector('#kh-err');
      var any = DAYS.some(function (d) {
        var day = doc.week[d];
        return day && day.open && (day.periods || []).some(function (p) { return K.span(p) > 0; });
      });
      if (!any) { if (err) err.textContent = L.errNoDay; return; }
      var bad = DAYS.some(function (d) {
        var day = doc.week[d];
        return day && day.open && (day.periods || []).some(function (p) { return K.span(p) <= 0; });
      });
      if (bad) { if (err) err.textContent = L.errSame; return; }
      var saved = K.set(doc, vid);
      m.close();
      try { Kw().toast(L.saved, { type: 'success' }); } catch (_) {}
      if (opts.onSave) { try { opts.onSave(saved); } catch (_) {} }
    };

    render();
    return m;
  }

  /* Un résumé prêt à coller dans n'importe quel écran (fiche établissement,
   * bandeau caisse). Une seule mise en forme, pour que « Ouvert · ferme à
   * 02:00 » soit rigoureusement la même phrase partout. */
  function badge(venueId) {
    var K = H(); if (!K) return '';
    var s = K.summary(Date.now(), venueId, lang());
    return '<span class="kh-sum" style="display:inline-flex;padding:5px 10px;margin:0;font-size:12.5px;">' +
      '<span class="kh-dot ' + s.tone + '"></span>' + esc(s.text) + '</span>';
  }

  /* ── La pastille « Ouvert · ferme à 02:00 » de la barre du tableau de bord ──
   * Elle se met à jour à la minute parce qu'elle bascule toute seule à
   * l'ouverture et à la fermeture ; un statut figé au chargement de la page
   * serait faux dès la première heure. Rien à afficher tant que KiwiHours n'est
   * pas là : mieux vaut aucun statut qu'un statut d'attente qu'on prendrait
   * pour un vrai. */
  var PILL_CSS = [
    '.hours-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--n-200);background:var(--surface);',
    'border-radius:999px;padding:5px 11px;font-family:var(--sans);font-size:12px;color:var(--n-600);cursor:pointer;white-space:nowrap;}',
    '.hours-pill:hover{border-color:var(--atlas);color:var(--atlas);}',
    '.hours-pill .d{width:7px;height:7px;border-radius:50%;background:var(--n-400);flex-shrink:0;}',
    '.hours-pill.open .d{background:var(--success,#16a34a);}',
    '.hours-pill.soon .d{background:var(--warning,#d97706);}',
    '.hours-pill.unset{border-color:#f3d9a4;color:#a16207;}.hours-pill.unset .d{background:var(--danger,#dc2626);}',
    '@media(max-width:900px){.hours-pill{display:none;}}',
  ].join('');
  function mountPill() {
    var el = document.querySelector('[data-hours-pill]');
    if (!el || !H()) return;
    if (!document.getElementById('kh-pill-style')) {
      var s = document.createElement('style');
      s.id = 'kh-pill-style'; s.textContent = PILL_CSS;
      document.head.appendChild(s);
    }
    var paint = function () {
      var K = H(); if (!K) return;
      var s = K.summary(Date.now());
      el.hidden = false;
      el.className = 'hours-pill ' + s.tone;
      el.innerHTML = '<span class="d"></span>' + esc(s.text);
      el.setAttribute('title', K.isConfigured() ? K.weekText() : s.text);
    };
    paint();
    setInterval(paint, 60000);
    try { H().subscribe(paint); } catch (_) {}
    try { if (window.KiwiVenue && window.KiwiVenue.subscribe) window.KiwiVenue.subscribe(paint); } catch (_) {}
    try { if (window.KiwiI18n && window.KiwiI18n.subscribe) window.KiwiI18n.subscribe(paint); } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPill);
  else mountPill();

  window.KiwiHoursUI = { open: open, badge: badge, ensureCSS: ensureCSS, mountPill: mountPill };
}());
