/* Owner: dashboard date-picker. Exports: setDateRange, commitCustomRange, setShowComparison, revealDayPill, fmtHumanRange, closeCustomPicker, openCustomPicker, mountDaySelector, registerHandler.
 * Sibling calls via live owner: openKpiCustomizer.
 * Reads live owner: CMP_KEY, CUSTOM_KEY, DEFAULT_RANGE, GLOVO_TOAST, LOCALES, PICKER_STR, RANGE_STR, STORAGE_KEY, VALID, addDays, currentRange, customRange, dateToIso, dpControl, dpEl, dpEsc, dpKey, dpOutside, getLang, isoToDate, monthLabel, monthOnly, onAction, onCompareToggle, renderRevChart, renderSelector, sameDay, shiftMonth, showComparison, spanDays, startOfDay, subscribers, ymdInt.
 * Reads globalThis: KiwiZoneLaw.
 * Reads window: Kiwi, KiwiDayReport, KiwiLens, matchMedia. No state is copied. */
(function () {
  'use strict';
  const registry = window.__kiwiHomeRenderers || (window.__kiwiHomeRenderers = Object.create(null));
  registry['date-picker'] = function (__state) {
  function openKpiCustomizer(...args) { return __state.openKpiCustomizer.apply(this, args); }
function setDateRange(id) {
    if (!__state.VALID.includes(id)) id = __state.DEFAULT_RANGE;
    // 'personnalise' is only meaningful with a date pair behind it.
    if (id === 'personnalise' && !__state.customRange) id = __state.DEFAULT_RANGE;
    __state.currentRange = id;
    try { localStorage.setItem(__state.STORAGE_KEY, id); } catch (_) {}
    __state.renderSelector();
    __state.subscribers.forEach(fn => { try { fn(id); } catch (_) {} });
  }

function commitCustomRange(start, end) {
    if (!start || !end) return;
    __state.customRange = start <= end ? { start, end } : { start: end, end: start };
    try {
      localStorage.setItem(__state.CUSTOM_KEY,
        __state.dateToIso(__state.customRange.start) + '|' + __state.dateToIso(__state.customRange.end));
    } catch (_) {}
    setDateRange('personnalise');
  }

function setShowComparison(v) {
    __state.showComparison = !!v;
    try { localStorage.setItem(__state.CMP_KEY, __state.showComparison ? '1' : '0'); } catch (_) {}
    const btn = document.querySelector('[data-rev-compare-btn]');
    if (btn) {
      btn.classList.toggle('on', __state.showComparison);
      btn.setAttribute('aria-pressed', String(__state.showComparison));
    }
    __state.renderRevChart();
  }

function revealDayPill(pill) {
    const track = pill.parentElement;
    if (!track) return;
    const p = pill.getBoundingClientRect(), r = track.getBoundingClientRect();
    const delta = p.left < r.left ? p.left - r.left : p.right > r.right ? p.right - r.right : 0;
    // Only this horizontal track moves. scrollIntoView also pulled the entire
    // page vertically on each live re-render, sometimes during a user's swipe.
    if (delta) track.scrollBy({left: delta, behavior: 'instant'});
  }

function fmtHumanRange(s, e, lang) {
    if (__state.sameDay(s, e)) return `${s.getDate()} ${__state.monthOnly(s, lang, 'long')} ${s.getFullYear()}`;
    const sameYear = s.getFullYear() === e.getFullYear();
    if (sameYear && s.getMonth() === e.getMonth())
      return `${s.getDate()} – ${e.getDate()} ${__state.monthOnly(e, lang, 'long')} ${e.getFullYear()}`;
    if (sameYear)
      return `${s.getDate()} ${__state.monthOnly(s, lang, 'short')} – ${e.getDate()} ${__state.monthOnly(e, lang, 'short')} ${e.getFullYear()}`;
    return `${s.getDate()} ${__state.monthOnly(s, lang, 'short')} ${s.getFullYear()} – `
         + `${e.getDate()} ${__state.monthOnly(e, lang, 'short')} ${e.getFullYear()}`;
  }

function closeCustomPicker() {
    if (!__state.dpEl) return;
    const pop = __state.dpEl;
    __state.dpEl = null;
    pop.classList.remove('open');
    pop.removeAttribute('aria-modal');
    if (pop.__releaseScroll) pop.__releaseScroll();
    if (pop.__focusBefore?.isConnected) pop.__focusBefore.focus({ preventScroll: true });
    const veil = pop.__veil;
    if (veil) { veil.classList.remove('in'); setTimeout(() => veil.remove(), 260); }
    if (__state.dpOutside) document.removeEventListener('mousedown', __state.dpOutside);
    if (__state.dpKey) document.removeEventListener('keydown', __state.dpKey);
    __state.dpOutside = __state.dpKey = null;
    const pill = __state.dpControl?.querySelector('.dr-pill-custom');
    if (pill) pill.setAttribute('aria-expanded', 'false');
    __state.dpControl = null;
    let gone = false;
    const drop = () => { if (gone) return; gone = true; pop.remove(); };
    pop.addEventListener('transitionend', drop, { once: true });
    setTimeout(drop, 300);
  }

function openCustomPicker(options) {
    if (__state.dpEl) { closeCustomPicker(); return; }          // second click → toggle shut
    const dayMode = options?.mode === 'day';
    const control = options?.control || document.querySelector('.dash-date-range .dr-control');
    if (!control) return;
    __state.dpControl = control;
    const lang = __state.getLang();
    const S = __state.PICKER_STR[lang] || __state.PICKER_STR.fr;
    const today = dayMode && __state.isoToDate(options.maxDay) ? __state.isoToDate(options.maxDay) : __state.startOfDay(new Date());
    const monIdx = (y, m) => y * 12 + m;
    const maxLeft = monIdx(today.getFullYear(), today.getMonth()) - 1;  // right pane never future

    const selectedDay = dayMode ? __state.isoToDate(options.selected) : null;
    let selStart = dayMode ? selectedDay : __state.customRange ? __state.startOfDay(__state.customRange.start) : null;
    let selEnd   = dayMode ? selectedDay : __state.customRange ? __state.startOfDay(__state.customRange.end)   : null;
    let hoverD   = null;
    let view = selEnd
      ? __state.shiftMonth(selEnd.getFullYear(), selEnd.getMonth(), -1)
      : __state.shiftMonth(today.getFullYear(), today.getMonth(), -1);

    const pop = document.createElement('div');
    pop.className = 'dr-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', S.title);
    if (lang === 'ar') pop.setAttribute('dir', 'rtl');
    __state.dpEl = pop;
    // On a phone the two-month popover is taller than the screen and its
    // Apply button ends up under the tab bar (ticket #0108): present it as a
    // bottom sheet instead, with a scrolling calendar and a pinned footer.
    const asSheet = window.matchMedia && matchMedia('(max-width: 640px)').matches;
    if (asSheet) {
      const veil = document.createElement('div');
      veil.className = 'dr-sheet-veil';
      document.body.appendChild(veil);
      pop.__veil = veil;
      pop.classList.add('dr-sheet');
      veil.addEventListener('click', closeCustomPicker);
      pop.setAttribute('aria-modal', 'true');
      pop.__focusBefore = document.activeElement;
      pop.__releaseScroll = window.Kiwi?.scrollLock?.acquire();
      document.body.appendChild(pop);
      requestAnimationFrame(() => veil.classList.add('in'));
    } else if (dayMode) document.body.appendChild(pop);
    else control.appendChild(pop);

    const presets = [['p7', S.p7], ['p14', S.p14], ['p30', S.p30],
                     ['pMonth', S.pMonth], ['pLast', S.pLast], ['p90', S.p90]];
    function presetRange(key) {
      if (key === 'p7')  return [__state.addDays(today, -6), today];
      if (key === 'p14') return [__state.addDays(today, -13), today];
      if (key === 'p30') return [__state.addDays(today, -29), today];
      if (key === 'p90') return [__state.addDays(today, -89), today];
      if (key === 'pMonth') return [new Date(today.getFullYear(), today.getMonth(), 1), today];
      if (key === 'pLast')  return [new Date(today.getFullYear(), today.getMonth() - 1, 1),
                                    new Date(today.getFullYear(), today.getMonth(), 0)];
      return null;
    }
    function activePreset() {
      if (!selStart || !selEnd) return null;
      for (let i = 0; i < presets.length; i++) {
        const r = presetRange(presets[i][0]);
        if (r && __state.sameDay(__state.startOfDay(r[0]), selStart) && __state.sameDay(__state.startOfDay(r[1]), selEnd))
          return presets[i][0];
      }
      return null;
    }
    const chev = (dir) => `<span class="dr-icon dr-icon-${dir === 'prev' ? 'prev' : 'next'}" aria-hidden="true"></span>`;

    function weekdayRow() {
      const mon = __state.addDays(today, -((today.getDay() + 6) % 7));
      let h = '';
      for (let i = 0; i < 7; i++) {
        const wd = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(__state.LOCALES[lang] || __state.LOCALES.fr, { weekday: 'short' })
          .format(__state.addDays(mon, i)).replace('.', '');
        h += `<span class="drp-wd">${__state.dpEsc(wd)}</span>`;
      }
      return h;
    }
    function monthGrid(y, m) {
      const lead = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<span class="drp-day drp-empty"></span>';
      for (let d = 1; d <= days; d++) {
        const date = new Date(y, m, d);
        const future = __state.ymdInt(date) > __state.ymdInt(today);
        let cls = 'drp-day';
        if (future) cls += ' is-disabled';
        if (__state.sameDay(date, today)) cls += ' is-today';
        cells += `<button type="button" class="${cls}" data-day="${__state.dateToIso(date)}"`
          + `${future ? ' disabled' : ''}><span class="drp-dn">${d}</span></button>`;
      }
      return cells;
    }
    function monthCard(y, m, side) {
      const canNext = monIdx(view.y, view.m) < maxLeft;
      const lBtn = side === 'left'
        ? `<button type="button" class="drp-nav" data-nav="prev" aria-label="${__state.dpEsc({fr:'Mois précédent',en:'Previous month',ar:'الشهر السابق'}[lang])}">${chev('prev')}</button>`
        : '<span class="drp-nav-gap"></span>';
      const rBtn = side === 'right'
        ? `<button type="button" class="drp-nav" data-nav="next" aria-label="${__state.dpEsc({fr:'Mois suivant',en:'Next month',ar:'الشهر التالي'}[lang])}"${canNext ? '' : ' disabled'}>${chev('next')}</button>`
        : '<span class="drp-nav-gap"></span>';
      return `<div class="drp-month"><div class="drp-mhead">${lBtn}`
        + `<span class="drp-mname">${__state.dpEsc(__state.monthLabel(y, m, lang))}</span>${rBtn}</div>`
        + `<div class="drp-wdrow">${weekdayRow()}</div>`
        + `<div class="drp-grid">${monthGrid(y, m)}</div></div>`;
    }

    function decorate() {
      let lo = selStart, hi = selEnd;
      if (selStart && !selEnd && hoverD) {
        lo = __state.ymdInt(hoverD) < __state.ymdInt(selStart) ? hoverD : selStart;
        hi = __state.ymdInt(hoverD) < __state.ymdInt(selStart) ? selStart : hoverD;
      }
      const a = lo ? __state.ymdInt(lo) : null;
      const b = hi ? __state.ymdInt(hi) : null;
      pop.querySelectorAll('.drp-day').forEach((btn) => {
        btn.classList.remove('in-range', 'is-start', 'is-end', 'is-edge', 'is-solo');
        if (!btn.dataset.day) return;
        const v = __state.ymdInt(__state.isoToDate(btn.dataset.day));
        if (a != null && b != null) {
          if (a === b) { if (v === a) btn.classList.add('is-edge', 'is-solo'); }
          else if (v === a) btn.classList.add('is-start', 'is-edge');
          else if (v === b) btn.classList.add('is-end', 'is-edge');
          else if (v > a && v < b) btn.classList.add('in-range');
        } else if (a != null && v === a) {
          btn.classList.add('is-edge', 'is-solo');
        }
      });
      const ro = pop.querySelector('[data-drp-readout]');
      if (ro) {
        if (lo && hi) ro.textContent = fmtHumanRange(lo, hi, lang);
        else if (selStart) ro.textContent = fmtHumanRange(selStart, selStart, lang);
        // Nothing picked yet: name the period in effect, in the muted colour,
        // instead of a lone dot.
        else ro.textContent = __state.RANGE_STR[lang]?.[__state.currentRange] || __state.RANGE_STR.fr[__state.currentRange] || S.hintStart;
        ro.classList.toggle('is-set', !!(lo || selStart));
      }
      const hint = pop.querySelector('[data-drp-hint]');
      if (hint) {
        if (lo && hi) {
          const n = __state.spanDays(lo, hi);
          hint.innerHTML = `<b>${n}</b> ${__state.dpEsc(n > 1 ? S.days : S.day)}`;
        } else {
          hint.textContent = selStart ? S.hintEnd : S.hintStart;
        }
      }
      const apply = pop.querySelector('[data-drp-apply]');
      if (apply) apply.disabled = !(selStart && selEnd);
      const ap = dayMode ? null : activePreset();
      pop.querySelectorAll('.drp-preset').forEach((p) => {
        p.classList.toggle('is-active', p.dataset.preset === ap);
      });
    }

    function render() {
      const scrollTop = pop.querySelector('.drp-body')?.scrollTop || 0;
      const r = __state.shiftMonth(view.y, view.m, 1);
      pop.innerHTML =
        `<div class="drp-head"><div><div class="drp-eyebrow">${__state.dpEsc(dayMode ? ({ fr: 'Choisir une date', en: 'Pick a date', ar: 'اختر تاريخاً' }[lang] || 'Choisir une date') : S.title)}</div>`
        + `<div class="drp-readout" data-drp-readout></div></div>`
        + `<button type="button" class="drp-x" data-drp-cancel aria-label="${__state.dpEsc(S.cancel)}">`
        + `<span class="dr-icon dr-icon-close" aria-hidden="true"></span></button></div>`
        + `<div class="drp-body">${dayMode ? '' : `<div class="drp-presets">`
        + `<div class="drp-presets-lbl">${__state.dpEsc(S.presets)}</div>`
        + presets.map(([k, lbl]) =>
            `<button type="button" class="drp-preset" data-preset="${k}">${__state.dpEsc(lbl)}</button>`).join('')
        + `</div>`}<div class="drp-cal"><div class="drp-months">`
        + monthCard(view.y, view.m, 'left') + monthCard(r.y, r.m, 'right')
        + `</div></div></div>`
        + `<div class="drp-foot"><div class="drp-hint" data-drp-hint></div>`
        + `<div class="drp-acts">`
        + `<button type="button" class="drp-btn drp-btn-ghost" data-drp-cancel>${__state.dpEsc(S.cancel)}</button>`
        + `<button type="button" class="drp-btn drp-btn-go" data-drp-apply>${__state.dpEsc(S.apply)}</button>`
        + `</div></div>`;
      decorate();
      pop.querySelector('.drp-body').scrollTop = scrollTop;
    }

    function pickDay(iso) {
      const d = __state.isoToDate(iso);
      if (!d) return;
      if (dayMode) { selStart = d; selEnd = d; hoverD = null; render(); return; }
      if (!selStart || (selStart && selEnd)) { selStart = d; selEnd = null; }
      else if (__state.ymdInt(d) < __state.ymdInt(selStart)) { selEnd = selStart; selStart = d; }
      else { selEnd = d; }
      hoverD = null;
      render();
    }
    function applyPreset(key) {
      const r = presetRange(key);
      if (!r) return;
      selStart = __state.startOfDay(r[0]);
      selEnd = __state.startOfDay(r[1]);
      hoverD = null;
      view = __state.shiftMonth(selEnd.getFullYear(), selEnd.getMonth(), -1);
      render();
    }
    function shiftView(n) {
      const nv = __state.shiftMonth(view.y, view.m, n);
      if (n > 0 && monIdx(nv.y, nv.m) > maxLeft) return;
      view = nv;
      render();
    }

    pop.addEventListener('click', (e) => {
      const day = e.target.closest('.drp-day');
      if (day && day.dataset.day && !day.disabled) { pickDay(day.dataset.day); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav) { shiftView(nav.dataset.nav === 'next' ? 1 : -1); return; }
      const pre = e.target.closest('[data-preset]');
      if (pre) { applyPreset(pre.dataset.preset); return; }
      if (e.target.closest('[data-drp-cancel]')) { closeCustomPicker(); return; }
      if (e.target.closest('[data-drp-apply]') && selStart && selEnd) {
        if (dayMode) options.onApply(__state.dateToIso(selStart));
        else commitCustomRange(selStart, selEnd);
        closeCustomPicker();
      }
    });
    pop.addEventListener('mouseover', (e) => {
      if (dayMode || !selStart || selEnd) return;
      const day = e.target.closest('.drp-day');
      const nd = (day && day.dataset.day && !day.disabled) ? __state.isoToDate(day.dataset.day) : null;
      if ((nd ? __state.ymdInt(nd) : 0) === (hoverD ? __state.ymdInt(hoverD) : 0)) return;
      hoverD = nd;
      decorate();
    });
    pop.addEventListener('mouseleave', () => {
      if (selStart && !selEnd && hoverD) { hoverD = null; decorate(); }
    });

    // Swipe the calendar sideways to change month, like the iOS date picker.
    let swipeX = null, swipeY = 0;
    pop.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.drp-cal') || e.touches.length !== 1) { swipeX = null; return; }
      swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY;
    }, { passive: true });
    pop.addEventListener('touchend', (e) => {
      if (swipeX == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeX, dy = t.clientY - swipeY;
      swipeX = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const forward = lang === 'ar' ? dx > 0 : dx < 0;
      shiftView(forward ? 1 : -1);
    }, { passive: true });

    render();
    if (dayMode && !asSheet) {
      // Drawers clip their scrollable bodies with contain:paint. Portal the
      // SAME calendar above them and anchor it to the shared pill.
      const rect = control.getBoundingClientRect();
      pop.style.position = 'fixed';
      pop.style.insetInlineEnd = 'auto';
      const anchorX = lang === 'ar' ? rect.right - pop.offsetWidth : rect.left;
      pop.style.left = Math.max(8, Math.min(anchorX, innerWidth - pop.offsetWidth - 8)) + 'px';
      pop.style.top = Math.max(8, Math.min(rect.bottom + 10, innerHeight - pop.offsetHeight - 8)) + 'px';
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (__state.dpEl === pop) pop.classList.add('open');
    }));

    __state.dpOutside = (e) => {
      if (pop.contains(e.target)) return;
      if (control.contains(e.target)) return;   // the control's own click toggles
      closeCustomPicker();
    };
    __state.dpKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeCustomPicker(); return; }
      if (!asSheet || e.key !== 'Tab') return;
      const buttons = [...pop.querySelectorAll('button:not([disabled])')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || !pop.contains(document.activeElement))) {
        e.preventDefault(); last?.focus({preventScroll:true});
      } else if (!e.shiftKey && (document.activeElement === last || !pop.contains(document.activeElement))) {
        e.preventDefault(); first?.focus({preventScroll:true});
      }
    };
    setTimeout(() => {
      if (__state.dpEl !== pop) return;
      document.addEventListener('mousedown', __state.dpOutside);
      document.addEventListener('keydown', __state.dpKey);
    }, 0);

    const pill = control.querySelector('.dr-pill-custom');
    if (pill) pill.setAttribute('aria-expanded', 'true');
  }

function mountDaySelector(host, options = {}) {
    if (!host) return;
    const report = window.KiwiDayReport;
    const today = report?.today?.(options.merchant) || __state.dateToIso(new Date());
    const shift = (n) => report?.shiftDay?.(today, -n, options.merchant) || __state.dateToIso(__state.addDays(__state.isoToDate(today), -n));
    const chosen = __state.isoToDate(options.value) ? options.value : today;
    const offsets = options.offsets || [0, 1];
    const lang = __state.getLang();
    const labels = {
      fr: ["Aujourd'hui", 'Hier', 'Avant-hier', 'Choisir une date'],
      en: ['Today', 'Yesterday', 'Day before yesterday', 'Pick a date'],
      ar: ['اليوم', 'أمس', 'أول أمس', 'اختر تاريخاً'],
    }[lang] || ["Aujourd'hui", 'Hier', 'Avant-hier', 'Choisir une date'];
    const relative = offsets.find(n => shift(n) === chosen);
    const custom = relative == null;
    const customLabel = custom ? new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang === 'ar' ? 'ar-MA' : lang,
      { day: 'numeric', month: 'short', year: 'numeric' }).format(__state.isoToDate(chosen)) : labels[3];
    host.innerHTML = `<div class="dr-control dr-day-control"><div class="dr-pills" role="group" aria-label="${__state.dpEsc(options.ariaLabel || labels[3])}">`
      + offsets.map(n => `<button type="button" class="dr-pill${relative === n ? ' on' : ''}" data-dr-day-offset="${n}" aria-pressed="${relative === n}">${__state.dpEsc(labels[n])}</button>`).join('')
      + `<button type="button" class="dr-pill dr-pill-custom${custom ? ' on' : ''}" data-dr-day-custom aria-pressed="${custom}" aria-haspopup="dialog" aria-expanded="false">`
      + `<span class="dr-icon dr-icon-calendar" aria-hidden="true"></span>${__state.dpEsc(customLabel)}</button></div></div>`;
    const control = host.querySelector('.dr-control');
    requestAnimationFrame(() => { const selected = control.querySelector('.dr-pill.on'); if (selected) revealDayPill(selected); });
    host.querySelectorAll('[data-dr-day-offset]').forEach(button => {
      button.addEventListener('click', () => options.onChange?.(shift(+button.dataset.drDayOffset)));
    });
    host.querySelector('[data-dr-day-custom]').addEventListener('click', () => openCustomPicker({
      mode: 'day', control, selected: chosen, maxDay: today, onApply: day => options.onChange?.(day),
    }));
    window.KiwiLens?.rescan?.();
  }

function registerHandler() {
    const tryReg = () => {
      if (window.Kiwi?.handlers) {
        window.Kiwi.handlers['date-range'] = __state.onAction;
        window.Kiwi.handlers['open-date-picker'] = openCustomPicker;
        window.Kiwi.handlers['rev-compare'] = __state.onCompareToggle;
        window.Kiwi.handlers['customize-kpi'] = openKpiCustomizer;
        window.Kiwi.handlers['hero-toggle-chart'] = () => {
          const hero = document.querySelector('.hero-today');
          if (!hero) return;
          const toChart = !hero.classList.contains('chart-view');
          hero.classList.toggle('chart-view', toChart);
          const btn = hero.querySelector('.hero-view-toggle');
          if (btn) btn.setAttribute('aria-pressed', String(toChart));
          try { localStorage.setItem('kiwiHeroView', toChart ? 'chart' : 'today'); } catch (_) {}
          if (toChart) {
            // Pane was display:none — SVG had no measurable width. Reset the
            // render cache so the chart re-measures and replays its draw-in.
            const svg = document.querySelector('[data-rev-svg]');
            if (svg) { svg.dataset.lastW = '0'; svg.dataset.lastRange = ''; }
            __state.renderRevChart();
          }
        };
        window.Kiwi.handlers['hh-ai-glovo'] = () => {
          const gl = __state.GLOVO_TOAST[__state.getLang()] || __state.GLOVO_TOAST.fr;
          window.Kiwi?.toast?.(gl.t, { type: 'info', desc: gl.d });
        };
        return;
      }
      setTimeout(tryReg, 30);
    };
    tryReg();
  }

    return Object.freeze({ setDateRange, commitCustomRange, setShowComparison, revealDayPill, fmtHumanRange, closeCustomPicker, openCustomPicker, mountDaySelector, registerHandler });
  };
})();
