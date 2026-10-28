/* Kiwi · menu promotions editor, the « Promotions » tab of the restaurant
 * Menu page (assets/restaurant-menu-workspace.js).
 *
 * The rule lives in assets/menu-promos.js and prices itself on the till, in
 * the waiter app and on the server's canonical ticket. This file only lets the
 * owner create, edit, pause and delete promotions; they are stored on the menu
 * (KiwiMenuStore.savePromo) and leave with it when the menu is published.
 *
 * The form edits the name, the discount, the scope (whole menu or
 * categories) and when it runs: weekdays, daily hours (overnight allowed) and
 * optional first and last days. The rule in menu-promos.js reads the same
 * fields on the till, in the waiter app and on the server, in Morocco time on
 * the 05:00 business day. */
(function () {
  'use strict';

  const P = () => window.KiwiMenuPromos;
  const S = () => window.KiwiMenuStore;
  const venue = () => window.KiwiVenue?.getCurrentVenueData?.()?.id || window.KiwiVenue?.getVenue?.() || null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lang = () => {
    try { return (window.KiwiI18n?.getLang?.()) || (window.KiwiMenuI18n?.lang?.()) || localStorage.getItem('kiwiLang') || 'fr'; }
    catch (_) { return 'fr'; }
  };
  const cash = (n) => {
    const v = +n || 0, o = { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 };
    return (window.KiwiNumber?.format(v, o) ?? new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'fr-FR', o).format(v)) + ' MAD';
  };

  const T = {
    fr: {
      title: 'Promotions',
      sub: 'Une règle posée une fois sur la carte. La caisse et l’appli Serveur appliquent le prix toutes seules, et le ticket envoyé en cuisine aussi.',
      add: 'Nouvelle promotion',
      empty: 'Aucune promotion',
      emptyDesc: 'Une promotion baisse le prix d’une catégorie ou de toute la carte, sans que personne au comptoir n’ait à s’en souvenir.',
      edit: 'Modifier', pause: 'Mettre en pause', resume: 'Reprendre', del: 'Supprimer',
      delQ: 'Supprimer cette promotion ?', delDesc: 'Les additions déjà passées gardent leur prix.',
      active: 'En cours', paused: 'En pause', scheduled: 'Programmée', ended: 'Terminée', waiting: 'Hors horaires',
      allMenu: 'Toute la carte', items: '{n} article(s)',
      everyDay: 'Tous les jours', allDay: 'toute la journée',
      from: 'à partir du {d}', to: 'jusqu’au {d}',
      newTitle: 'Nouvelle promotion', editTitle: 'Modifier la promotion',
      name: 'Nom', namePh: 'Happy hour, L’heure du goûter…',
      kind: 'Réduction', percent: 'Pourcentage', amount: 'Montant en moins', fixed: 'Prix fixe',
      value: 'Valeur', scope: 'S’applique à',
      formulaNote: 'Les formules gardent leur propre prix et ne sont jamais réduites.',
      when: 'Quand', daysLbl: 'Jours', daysHint: 'aucun jour choisi = tous les jours',
      hours: 'Heures', hoursHint: 'vides = toute la journée',
      hoursNote: 'En heure du Maroc. Une fin avant le début passe minuit : 22:00 → 01:00 compte pour le jour où elle a commencé.',
      startAria: 'Heure de début', endAria: 'Heure de fin',
      dates: 'Dates', datesHint: 'facultatif', fromAria: 'Premier jour', toAria: 'Dernier jour',
      preview: 'Active', clearWhen: 'Toujours active',
      cancel: 'Annuler', save: 'Enregistrer',
      errHours: 'Indiquez l’heure de début et l’heure de fin, ou aucune.', errSame: 'L’heure de fin doit différer de l’heure de début.', errDates: 'Le dernier jour ne peut pas précéder le premier.',
      errName: 'Donnez un nom à la promotion.', errValue: 'Indiquez une réduction.', errScope: 'Choisissez au moins une catégorie, ou toute la carte.',
      saved: 'Promotion enregistrée', savedDesc: 'La caisse et l’appli Serveur l’appliquent dès la prochaine synchronisation.',
      deleted: 'Promotion supprimée',
      days: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
    },
    en: {
      title: 'Promotions',
      sub: 'A rule set once on the menu. The till and the waiter app apply the price on their own, and so does the ticket sent to the kitchen.',
      add: 'New promotion',
      empty: 'No promotions',
      emptyDesc: 'A promotion lowers the price of a category or the whole menu, without anyone at the counter having to remember it.',
      edit: 'Edit', pause: 'Pause', resume: 'Resume', del: 'Delete',
      delQ: 'Delete this promotion?', delDesc: 'Bills already taken keep their price.',
      active: 'Running', paused: 'Paused', scheduled: 'Scheduled', ended: 'Ended', waiting: 'Outside its hours',
      allMenu: 'Whole menu', items: '{n} item(s)',
      everyDay: 'Every day', allDay: 'all day',
      from: 'from {d}', to: 'until {d}',
      newTitle: 'New promotion', editTitle: 'Edit promotion',
      name: 'Name', namePh: 'Happy hour, Afternoon tea…',
      kind: 'Discount', percent: 'Percentage', amount: 'Amount off', fixed: 'Fixed price',
      value: 'Value', scope: 'Applies to',
      formulaNote: 'Set menus keep their own price and are never discounted.',
      when: 'When', daysLbl: 'Days', daysHint: 'no day picked = every day',
      hours: 'Hours', hoursHint: 'empty = all day',
      hoursNote: 'Morocco time. An end before the start runs past midnight: 22:00 → 01:00 counts for the day it started.',
      startAria: 'Start time', endAria: 'End time',
      dates: 'Dates', datesHint: 'optional', fromAria: 'First day', toAria: 'Last day',
      preview: 'Active', clearWhen: 'Always on',
      cancel: 'Cancel', save: 'Save',
      errHours: 'Enter both a start and an end time, or neither.', errSame: 'The end time must differ from the start time.', errDates: 'The last day cannot come before the first.',
      errName: 'Give the promotion a name.', errValue: 'Enter a discount.', errScope: 'Pick at least one category, or the whole menu.',
      saved: 'Promotion saved', savedDesc: 'The till and the waiter app apply it from their next sync.',
      deleted: 'Promotion deleted',
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
    ar: {
      title: 'العروض',
      sub: 'قاعدة تُضبط مرة واحدة على القائمة. الصندوق وتطبيق النادل يطبّقان السعر تلقائياً، وكذلك التذكرة المرسلة إلى المطبخ.',
      add: 'عرض جديد',
      empty: 'لا توجد عروض',
      emptyDesc: 'العرض يخفّض سعر فئة أو القائمة كلها، دون أن يضطر أحد عند الصندوق إلى تذكّره.',
      edit: 'تعديل', pause: 'إيقاف مؤقت', resume: 'استئناف', del: 'حذف',
      delQ: 'حذف هذا العرض؟', delDesc: 'الفواتير المسجّلة تحتفظ بسعرها.',
      active: 'جارٍ', paused: 'متوقف', scheduled: 'مبرمج', ended: 'منتهٍ', waiting: 'خارج أوقاته',
      allMenu: 'القائمة كلها', items: '{n} صنف',
      everyDay: 'كل يوم', allDay: 'طوال اليوم',
      from: 'ابتداءً من {d}', to: 'إلى غاية {d}',
      newTitle: 'عرض جديد', editTitle: 'تعديل العرض',
      name: 'الاسم', namePh: 'ساعة السعادة، وقت الشاي…',
      kind: 'التخفيض', percent: 'نسبة مئوية', amount: 'مبلغ مخصوم', fixed: 'سعر ثابت',
      value: 'القيمة', scope: 'يُطبّق على',
      formulaNote: 'الوجبات المركّبة تحتفظ بسعرها ولا تُخفَّض أبداً.',
      when: 'متى', daysLbl: 'الأيام', daysHint: 'بدون اختيار = كل يوم',
      hours: 'الساعات', hoursHint: 'فارغة = طوال اليوم',
      hoursNote: 'بتوقيت المغرب. نهاية قبل البداية تتجاوز منتصف الليل: 22:00 ← 01:00 تُحسب لليوم الذي بدأت فيه.',
      startAria: 'ساعة البداية', endAria: 'ساعة النهاية',
      dates: 'التواريخ', datesHint: 'اختياري', fromAria: 'اليوم الأول', toAria: 'اليوم الأخير',
      preview: 'نشط', clearWhen: 'نشط دائماً',
      cancel: 'إلغاء', save: 'حفظ',
      errHours: 'أدخل ساعة البداية وساعة النهاية، أو لا شيء.', errSame: 'يجب أن تختلف ساعة النهاية عن ساعة البداية.', errDates: 'لا يمكن أن يسبق اليوم الأخير اليوم الأول.',
      errName: 'أعطِ العرض اسماً.', errValue: 'أدخل قيمة التخفيض.', errScope: 'اختر فئة واحدة على الأقل، أو القائمة كلها.',
      saved: 'تم حفظ العرض', savedDesc: 'يطبّقه الصندوق وتطبيق النادل عند المزامنة التالية.',
      deleted: 'تم حذف العرض',
      days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    },
  };
  const tr = (k, p) => {
    const l = T[lang()] ? lang() : 'fr';
    let s = T[l][k] != null ? T[l][k] : T.fr[k];
    if (p && typeof s === 'string') Object.keys(p).forEach((x) => { s = s.split('{' + x + '}').join(p[x]); });
    return s;
  };
  const name = (s) => (window.KiwiMenuI18n ? window.KiwiMenuI18n.t(s, lang()) : s);

  const data = () => S()?.data(venue()) || {};
  const list = () => S()?.promos?.(venue()) || [];

  function windowLabel(p) {
    const parts = [];
    const days = (p.days || []).slice().sort((a, b) => ((+a + 6) % 7) - ((+b + 6) % 7));
    parts.push(days.length ? days.map((d) => tr('days')[d]).join(', ') : tr('everyDay'));
    parts.push(p.start && p.end ? p.start + '–' + p.end : tr('allDay'));
    const fmt = (d) => { try { return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : (lang() === 'ar' ? 'ar-MA' : 'fr-FR'), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')); } catch (_) { return d; } };
    if (p.from) parts.push(tr('from', { d: fmt(p.from) }));
    if (p.to) parts.push(tr('to', { d: fmt(p.to) }));
    return parts.join(' · ');
  }
  function scopeLabel(p) {
    if (p.all) return tr('allMenu');
    const cats = data().cats || [];
    const out = (p.cats || []).map((id) => { const c = cats.find((x) => x && x.id === id); return c ? name(c.name) : ''; }).filter(Boolean);
    if (p.items && p.items.length) out.push(tr('items', { n: p.items.length }));
    return out.join(', ');
  }
  function valueLabel(p) {
    const P_ = P();
    return P_ ? P_.badge(p) : String(p.value);
  }

  function card(p) {
    const st = P() ? P().status(p, Date.now()) : 'active';
    const pill = st === 'active' ? 'mode' : (st === 'ended' ? 'req' : 'opt');
    return `<div class="mi-group-card mp-card" data-mp-id="${esc(p.id)}">
      <div class="mi-group-card-head"><span class="mi-group-card-name">${esc(p.name)}</span><span class="mi-group-card-pill mode">${esc(valueLabel(p))}</span><span class="mi-group-card-pill ${pill}" data-mp-status="${st}">${esc(tr(st))}</span></div>
      <div class="mi-group-card-scope">${esc(scopeLabel(p))}<br>${esc(windowLabel(p))}</div>
      <div class="mi-group-card-acts"><button data-activation=write type="button" class="btn-slim" data-mp-act="edit">${esc(tr('edit'))}</button><button type="button" class="btn-slim" data-mp-act="pause">${esc(tr(p.paused ? 'resume' : 'pause'))}</button><button data-activation=write type="button" class="btn-slim danger" data-mp-act="delete">${esc(tr('del'))}</button></div>
    </div>`;
  }

  function html() {
    const promos = list();
    const body = promos.length
      ? `<div class="mi-groups-grid">${promos.map(card).join('')}</div>`
      : `<div class="rmw-empty"><h3>${esc(tr('empty'))}</h3><p>${esc(tr('emptyDesc'))}</p></div>`;
    return `<section class="mi-section mp-panel"><div class="mi-section-head"><div><div class="mi-title">${esc(tr('title'))}</div><div class="mi-sub">${esc(tr('sub'))}</div></div><button type="button" class="btn-slim primary" data-mp-act="new">${esc(tr('add'))}</button></div>${body}</section>`;
  }

  let host = null;
  function paint() { if (host && host.isConnected) host.innerHTML = html(); }

  function editor(existing) {
    const K = window.Kiwi;
    if (!K || !K.modal) return;
    const d = data();
    const draft = Object.assign({ name: '', kind: 'percent', value: '', all: false, cats: [], items: [], days: [], start: '', end: '', from: '', to: '', paused: false }, existing || {});
    const cats = (d.cats || []).filter((c) => c && c.id);
    draft.days = (draft.days || []).map(Number);
    /* Lundi d'abord, comme un commerçant marocain lit sa semaine ; la règle
       garde la convention JavaScript (0 = dimanche). */
    const WEEK = [1, 2, 3, 4, 5, 6, 0];
    const dayChips = () => WEEK.map((n) => { const on = draft.days.indexOf(n) >= 0; return `<button type="button" class="mi-subchip${on ? ' on' : ''}" data-mp-day="${n}" aria-pressed="${on ? 'true' : 'false'}">${esc(tr('days')[n])}</button>`; }).join('');
    const chip = (id, label, on) => `<button type="button" class="mi-subchip${on ? ' on' : ''}" data-mp-scope="${esc(id)}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button>`;
    const scopeChips = () => chip('__all', tr('allMenu'), draft.all) + cats.map((c) => chip(c.id, name(c.name), !draft.all && draft.cats.indexOf(c.id) >= 0)).join('');
    const body = `<div class="mp-form">
      <label class="kf-label" for="mp-name">${esc(tr('name'))}</label>
      <input class="kf-input" id="mp-name" data-mp-field="name" data-autofocus maxlength="60" placeholder="${esc(tr('namePh'))}" value="${esc(draft.name)}"/>
      <div class="mp-row">
        <div><label class="kf-label" for="mp-kind">${esc(tr('kind'))}</label>
          <select class="kf-input" id="mp-kind" data-mp-field="kind">${['percent', 'amount', 'fixed'].map((k) => `<option value="${k}"${draft.kind === k ? ' selected' : ''}>${esc(tr(k))}</option>`).join('')}</select></div>
        <div><label class="kf-label" for="mp-value">${esc(tr('value'))} <span data-mp-unit>${draft.kind === 'percent' ? '%' : 'MAD'}</span></label>
          <input class="kf-input" id="mp-value" data-mp-field="value" type="number" inputmode="decimal" min="0" step="${draft.kind === 'percent' ? 'any' : '0.01'}" value="${esc(draft.value)}"/></div>
      </div>
      <div class="kf-label">${esc(tr('scope'))}</div>
      <div class="mi-subchips" data-mp-scopes>${scopeChips()}</div>
      <div class="mp-when">
        <div class="kf-label mp-when-title">${esc(tr('when'))}</div>
        <div class="kf-label">${esc(tr('daysLbl'))} <span class="mp-hint">· ${esc(tr('daysHint'))}</span></div>
        <div class="mi-subchips" data-mp-days>${dayChips()}</div>
        <div class="kf-label">${esc(tr('hours'))} <span class="mp-hint">· ${esc(tr('hoursHint'))}</span></div>
        <div class="mp-row">
          <input class="kf-input" type="time" step="900" data-mp-field="start" aria-label="${esc(tr('startAria'))}" value="${esc(draft.start || '')}"/>
          <input class="kf-input" type="time" step="900" data-mp-field="end" aria-label="${esc(tr('endAria'))}" value="${esc(draft.end || '')}"/>
        </div>
        <p class="mp-note">${esc(tr('hoursNote'))}</p>
        <div class="kf-label">${esc(tr('dates'))} <span class="mp-hint">· ${esc(tr('datesHint'))}</span></div>
        <div class="mp-row">
          <input class="kf-input" type="date" data-mp-field="from" aria-label="${esc(tr('fromAria'))}" value="${esc(draft.from || '')}"/>
          <input class="kf-input" type="date" data-mp-field="to" aria-label="${esc(tr('toAria'))}" value="${esc(draft.to || '')}"/>
        </div>
        <p class="mp-preview" data-mp-preview></p>
      </div>
      <p class="mp-note">${esc(tr('formulaNote'))}</p>
      <p class="mp-err" data-mp-err hidden></p>
    </div>`;
    const m = K.modal({ title: existing ? tr('editTitle') : tr('newTitle'), width: 520, body, foot: `<button class="kb ghost" data-mp-cancel>${esc(tr('cancel'))}</button><button data-activation=write class="eq-cta-gradient" data-mp-save>${esc(tr('save'))}</button>` });
    if (!m || !m.el) return;
    const q = (s) => m.el.querySelector(s);
    q('[data-mp-field="kind"]').addEventListener('change', (e) => {
      draft.kind = e.target.value;
      q('[data-mp-unit]').textContent = draft.kind === 'percent' ? '%' : 'MAD';
      q('[data-mp-field="value"]').step = draft.kind === 'percent' ? 'any' : '0.01';
    });
    q('[data-mp-scopes]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mp-scope]'); if (!b) return;
      const id = b.dataset.mpScope;
      if (id === '__all') { draft.all = !draft.all; if (draft.all) draft.cats = []; }
      else {
        draft.all = false;
        const i = draft.cats.indexOf(id);
        if (i >= 0) draft.cats.splice(i, 1); else draft.cats.push(id);
      }
      q('[data-mp-scopes]').innerHTML = scopeChips();
    });
    const readWhen = () => {
      draft.start = q('[data-mp-field="start"]').value || '';
      draft.end = q('[data-mp-field="end"]').value || '';
      draft.from = q('[data-mp-field="from"]').value || '';
      draft.to = q('[data-mp-field="to"]').value || '';
    };
    const preview = () => {
      readWhen();
      const open = !draft.days.length && !draft.start && !draft.end && !draft.from && !draft.to;
      q('[data-mp-preview]').textContent = open ? tr('clearWhen') : tr('preview') + ' : ' + windowLabel(draft);
    };
    q('[data-mp-days]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mp-day]'); if (!b) return;
      const n = +b.dataset.mpDay, i = draft.days.indexOf(n);
      if (i >= 0) draft.days.splice(i, 1); else draft.days.push(n);
      q('[data-mp-days]').innerHTML = dayChips();
      preview();
    });
    ['start', 'end', 'from', 'to'].forEach((f) => q(`[data-mp-field="${f}"]`).addEventListener('input', preview));
    preview();
    const fail = (k) => { const el = q('[data-mp-err]'); el.textContent = tr(k); el.hidden = false; };
    q('[data-mp-cancel]').onclick = m.close;
    q('[data-mp-save]').onclick = () => {
      draft.name = q('[data-mp-field="name"]').value.trim();
      draft.value = Number(String(q('[data-mp-field="value"]').value).replace(',', '.'));
      if (!draft.name) return fail('errName');
      if (!(draft.value > 0)) return fail('errValue');
      if (!draft.all && !draft.cats.length && !(draft.items && draft.items.length)) return fail('errScope');
      readWhen();
      if (!!draft.start !== !!draft.end) return fail('errHours');
      if (draft.start && draft.start === draft.end) return fail('errSame');
      if (draft.from && draft.to && draft.to < draft.from) return fail('errDates');
      draft.days = draft.days.length === 7 ? [] : draft.days.slice().sort((a, b) => a - b);
      const id = S().savePromo(draft);
      if (!id) return fail('errScope');
      m.close();
      paint();
      K.toast?.(tr('saved'), { desc: tr('savedDesc'), type: 'success' });
    };
  }

  function onClick(e) {
    const b = e.target.closest('[data-mp-act]'); if (!b || !host || !host.contains(b)) return;
    const act = b.dataset.mpAct;
    if (act === 'new') return editor(null);
    const id = b.closest('[data-mp-id]')?.dataset.mpId;
    const p = list().find((x) => x.id === id); if (!p) return;
    if (act === 'edit') return editor(p);
    if (act === 'pause') { S().savePromo(Object.assign({}, p, { paused: !p.paused })); paint(); return; }
    if (act === 'delete') {
      const K = window.Kiwi;
      const go = () => { S().deletePromo(id); paint(); K?.toast?.(tr('deleted'), { type: 'success' }); };
      const m = K?.modal?.({ title: tr('delQ'), width: 420, body: `<p class="mi-sub">${esc(tr('delDesc'))}</p>`, foot: `<button class="kb ghost" data-mp-cancel>${esc(tr('cancel'))}</button><button class="eq-cta-gradient danger" data-mp-ok>${esc(tr('del'))}</button>` });
      if (!m || !m.el) return go();
      m.el.querySelector('[data-mp-cancel]').onclick = m.close;
      m.el.querySelector('[data-mp-ok]').onclick = () => { m.close(); go(); };
    }
  }

  function injectCss() {
    if (document.getElementById('mp-css')) return;
    const st = document.createElement('style');
    st.id = 'mp-css';
    st.textContent = `
      .mp-panel .mi-section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
      .mp-form { display: flex; flex-direction: column; gap: 6px; }
      .mp-form .kf-label { margin-top: 8px; }
      .mp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .mp-note { font-size: 12px; color: var(--n-500); line-height: 1.45; margin: 4px 0 0; }
      .mp-err { font-size: 12.5px; color: var(--danger); margin: 4px 0 0; }
      .mp-when { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--line, rgba(127,127,127,.18)); }
      .mp-when-title { font-weight: 600; margin-top: 0 !important; }
      .mp-hint { font-weight: 400; color: var(--n-500); }
      .mp-preview { font-size: 12.5px; color: var(--atlas); margin: 6px 0 0; font-variant-numeric: tabular-nums; }
      @media (max-width: 520px) { .mp-row { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(st);
  }

  /* Mounted by the workspace into its panel; repaints when the menu changes
     (another device publishes, a category is renamed or deleted). */
  let subscribed = false;
  function mount(el) {
    if (!el) return;
    injectCss();
    host = el;
    if (!el.dataset.mpBound) { el.dataset.mpBound = '1'; el.addEventListener('click', onClick); }
    if (!subscribed && S()?.subscribe) { subscribed = true; S().subscribe(() => paint()); }
    paint();
  }

  window.KiwiMenuPromosPanel = { mount, html, enabled: () => !!(P() && S() && S().savePromo) };
})();
