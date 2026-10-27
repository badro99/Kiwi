/* Planning shift-editor. Exports: closeShiftPop, planCellHtml, planDaysHtml, shiftCellInner, shiftCellTitle.
 * Reads injected helpers: AVATAR_COLORS, HHMM_RE, addDays, applyLiveTeam, buildPeriod, compactPeriods, dateLocale, esc, fmtDur, fmtHours, fromISO, getMembers, getShifts, handlers, hourlyPayFor, initials, jobName, live, memberFullName, normShift, saveCustomTeams, shiftHours, shiftIsNextDay, shiftMinutes, t, teamKey, toISO, toast, trLang, visibleDays.
 * Reads window: KiwiNumber, KiwiVenue, __kiwiTeamV2, addEventListener, innerHeight, innerWidth, matchMedia, removeEventListener. Mutable UI state is private to this factory. */
export function createShiftEditor({ AVATAR_COLORS, HHMM_RE, addDays, applyLiveTeam, buildPeriod, compactPeriods, dateLocale, esc, fmtDur, fmtHours, fromISO, getMembers, getShifts, handlers, hourlyPayFor, initials, jobName, live, memberFullName, normShift, saveCustomTeams, shiftHours, shiftIsNextDay, shiftMinutes, t, teamKey, toISO, toast, trLang, visibleDays }) {
  let shiftPop = null;

  const currentVenueKey = () => teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
  const planHost = () => document.querySelector('.dash-genpage .dash-equipe');

  function writeShift(mid, day, val) {
    const vt = currentVenueKey();
    const shifts = window.__kiwiTeamV2.shiftsByVenue[vt] || (window.__kiwiTeamV2.shiftsByVenue[vt] = {});
    if (!shifts[mid]) shifts[mid] = {};
    if (val) shifts[mid][day] = val; else delete shifts[mid][day];
  }
  /* Surtout PAS render() : reconstruire toute la page à chaque case mettait
   * plusieurs secondes par choix, et remplir la semaine de trois personnes
   * devenait une minute d'attente. On repeint la case et les totaux sur place,
   * comme la grille des heures. */
  /* La case du tableau ET la ligne du jour (téléphone) portent la même clé
   * data-kt-cell : les deux se repeignent ensemble, quel que soit l'écran. */
  function paintShiftCell(mid, day) {
    const host = planHost();
    if (!host) return;
    const want = `${mid}|${day}`;
    const T = t();
    const shifts = getShifts(currentVenueKey());
    const cur = (shifts[mid] || {})[day];
    const s = normShift(cur);
    host.querySelectorAll('[data-kt-cell]').forEach((el) => {
      if (el.getAttribute('data-kt-cell') !== want) return;
      if (el.tagName !== 'TD') {
        const row = el.querySelector('.kt-pd-row');
        if (!row) return;
        row.classList.toggle('on', !!(s && !s.off));
        row.classList.toggle('off', !!(s && s.off));
        const when = row.querySelector('.kt-pd-when');
        if (when) when.innerHTML = planDayRowInner(T, cur);
        return;
      }
      el.classList.toggle('on', !!(s && !s.off));
      el.classList.toggle('off', !!(s && s.off));
      const btn = el.querySelector('.kt-sh');
      if (!btn) return;
      btn.innerHTML = shiftCellInner(T, cur, false);
      const title = shiftCellTitle(T, cur, day);
      if (title) btn.setAttribute('title', title); else btn.removeAttribute('title');
    });
    const sum = Array.prototype.find.call(host.querySelectorAll('[data-kt-dsum]'), (el) => el.getAttribute('data-kt-dsum') === day);
    if (sum) {
      const mids = Array.prototype.map.call(sum.closest('.kt-pd-panel').querySelectorAll('[data-kt-cell]'), (el) => el.getAttribute('data-kt-cell').split('|')[0]);
      sum.textContent = planDaySummary(mids.map((id) => (shifts[id] || {})[day]));
    }
  }
  /* Changer de jour ne reconstruit rien : on bascule les pastilles et les
   * panneaux déjà rendus, la lentille suit la classe .on. */
  function selectPlanDay(iso) {
    const host = planHost();
    if (!host) return false;
    const pills = host.querySelectorAll('.kt-pd-pill');
    if (!Array.prototype.some.call(pills, (b) => b.getAttribute('data-arg') === iso)) return false;
    planDayISO = iso;
    pills.forEach((b) => {
      const on = b.getAttribute('data-arg') === iso;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    host.querySelectorAll('[data-kt-dpanel]').forEach((p) => { p.hidden = p.getAttribute('data-kt-dpanel') !== iso; });
    return true;
  }
  handlers['kt-plan-day'] = (_el, iso) => {
    if (!live.pageActive) return;
    closeShiftPop();
    selectPlanDay(iso);
  };
  /* Un glissement horizontal sur la liste passe au jour voisin (inversé en
   * arabe, où la semaine se lit de droite à gauche). Rien n'est empêché : le
   * défilement vertical de la page reste celui du navigateur. */
  let planDayTouch = null;
  document.addEventListener('touchstart', (e) => {
    const zone = e.target && e.target.closest && e.target.closest('.dash-equipe .kt-pd-panels');
    planDayTouch = zone && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!planDayTouch || !live.pageActive) { planDayTouch = null; return; }
    const start = planDayTouch;
    planDayTouch = null;
    const p = e.changedTouches && e.changedTouches[0];
    if (!p) return;
    const dx = p.clientX - start.x, dy = p.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const host = planHost();
    if (!host) return;
    const days = Array.prototype.map.call(host.querySelectorAll('.kt-pd-pill'), (b) => b.getAttribute('data-arg'));
    const rtl = (document.documentElement.getAttribute('dir') || '').toLowerCase() === 'rtl';
    const next = days[days.indexOf(planDayISO) + ((dx < 0) !== rtl ? 1 : -1)];
    if (!next) return;
    closeShiftPop();
    selectPlanDay(next);
  }, { passive: true });
  /* La légende du +1 n'a de sens que s'il y a un service de nuit à l'écran. */
  function refreshNextDayLegend() {
    const host = planHost();
    if (!host) return;
    const legend = host.querySelector('.kt-plan-legend');
    if (legend) legend.classList.toggle('is-off', !host.querySelector('tbody .kt-sh-next'));
  }

  function closeShiftPop() {
    if (!shiftPop) return;
    document.removeEventListener('mousedown', onPopDown, true);
    document.removeEventListener('keydown', onPopKey, true);
    window.removeEventListener('resize', placeShiftPop);
    window.removeEventListener('scroll', placeShiftPop, true);
    shiftPop.el.remove();
    shiftPop = null;
    /* La saisie est finie : on rattrape le rafraîchissement mis de côté par
     * applyLiveTeam(). Le drapeau est remis à zéro avant render(), qui rappelle
     * closeShiftPop() — sans quoi les deux se relanceraient l'un l'autre. */
    if (live.liveTeamPendingRender) applyLiveTeam();
  }
  function onPopDown(e) {
    if (!shiftPop) return;
    if (shiftPop.el.contains(e.target)) return;
    if (shiftPop.anchor && shiftPop.anchor.contains(e.target)) return;   // le toggle s'en charge
    closeShiftPop();
  }
  function onPopKey(e) { if (e.key === 'Escape' && shiftPop) { e.stopPropagation(); closeShiftPop(); } }
  function placeShiftPop() {
    if (!shiftPop) return;
    const a = shiftPop.anchor.getBoundingClientRect();
    const el = shiftPop.el;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = a.left + (a.width / 2) - (w / 2);
    left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
    let top = a.bottom + 8;
    if (top + h > window.innerHeight - 10) top = Math.max(10, a.top - h - 8);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function openShiftPop(anchor, mid, day) {
    closeShiftPop();
    const T = t();
    const vt = currentVenueKey();
    const m = getMembers(vt).find((x) => x.id === mid);
    const cur = normShift((getShifts(vt)[mid] || {})[day]);
    const longDay = (iso) => fromISO(iso).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

    const el = document.createElement('div');
    el.className = 'kt-shpop';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `
      <div class="kt-shpop-head">
        <b>${esc(m ? memberFullName(m) : '')}</b>
        <span>${esc(longDay(day))}</span>
      </div>
      <div class="kt-shpop-times">
        <label><span>${esc(T.plStart)}</span><input type="time" data-sh-start value="${cur && !cur.off ? esc(cur.start) : ''}"></label>
        <label><span>${esc(T.plEnd)}</span><input type="time" data-sh-end value="${cur && !cur.off ? esc(cur.end) : ''}"></label>
      </div>
      <div class="kt-shpop-sum" data-sh-sum></div>
      <label class="kt-shpop-week"><input type="checkbox" data-sh-week><span>${esc(T.plWholeWeek)}</span></label>
      <div class="kt-shpop-foot">
        <button class="kt-shpop-b" type="button" data-sh-rest>${esc(T.plRest)}</button>
        <button class="kt-shpop-b" type="button" data-sh-clear>${esc(T.plClearCell)}</button>
        <button data-activation=write class="kt-shpop-b primary" type="button" data-sh-save>${esc(T.plSave)}</button>
      </div>`;
    document.body.appendChild(el);
    shiftPop = { el, anchor, mid, day };

    const $start = el.querySelector('[data-sh-start]');
    const $end = el.querySelector('[data-sh-end]');
    const $sum = el.querySelector('[data-sh-sum]');
    const $week = el.querySelector('[data-sh-week]');

    /* Le résumé se met à jour à chaque frappe : on ne découvre pas après coup
     * qu'un 21:00 → 03:00 finit mardi. */
    function refresh() {
      const v = normShift({ start: $start.value, end: $end.value });
      if (!v) { $sum.className = 'kt-shpop-sum'; $sum.textContent = ''; return; }
      const mins = shiftMinutes(v);
      if (!mins) { $sum.className = 'kt-shpop-sum warn'; $sum.textContent = T.plSameTime; return; }
      if (shiftIsNextDay(v)) {
        $sum.className = 'kt-shpop-sum next';
        $sum.innerHTML = `<b>${esc(fmtDur(mins))}</b><br><i class="kt-sh-next">+1</i> ${esc(T.plNextDay(longDay(toISO(addDays(fromISO(day), 1))), v.end))}`;
      } else {
        $sum.className = 'kt-shpop-sum';
        $sum.innerHTML = `<b>${esc(fmtDur(mins))}</b>`;
      }
    }
    refresh();

    function commit(val) {
      const days = ($week.checked ? visibleDays() : [day]);
      days.forEach((d) => { writeShift(mid, d, val); paintShiftCell(mid, d); });
      updateShiftTotals();
      refreshNextDayLegend();
      saveCustomTeams();
      closeShiftPop();
      if ($week.checked && days.length > 1) toast(T.plWeekApplied(days.length), { type: 'success' });
    }
    function save() {
      const start = $start.value, end = $end.value;
      if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) { toast(T.plNeedBoth, { type: 'pend' }); return; }
      if (start === end) { toast(T.plSameTime, { type: 'pend' }); return; }
      commit({ start, end });
    }

    [$start, $end].forEach((inp) => {
      inp.addEventListener('input', refresh);
      inp.addEventListener('change', refresh);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });
    el.querySelector('[data-sh-save]').addEventListener('click', save);
    el.querySelector('[data-sh-rest]').addEventListener('click', () => commit({ off: true }));
    el.querySelector('[data-sh-clear]').addEventListener('click', () => commit(null));

    placeShiftPop();
    document.addEventListener('mousedown', onPopDown, true);
    document.addEventListener('keydown', onPopKey, true);
    window.addEventListener('resize', placeShiftPop);
    window.addEventListener('scroll', placeShiftPop, true);
    /* On a touch screen focusing the field opens the iOS time wheel before the
       sheet has even appeared; let the person tap the field they mean. */
    try { if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) $start.focus(); } catch (_) {}
  }

  handlers['kt-shift-edit'] = (el) => {
    if (!live.pageActive || window.__kiwiTeamV2.periodLocked) return;
    const mid = el.getAttribute('data-mid');
    const day = el.getAttribute('data-day');
    if (!mid || !day) return;
    if (shiftPop && shiftPop.mid === mid && shiftPop.day === day) { closeShiftPop(); return; }
    openShiftPop(el, mid, day);
  };

  /* Totaux du planning recalculés en place — jumeau de updateHourTotals(). */
  function updateShiftTotals() {
    const root = document.querySelector('.dash-genpage .dash-equipe');
    if (!root) return;
    const vt = teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
    const members = getMembers(vt);
    const shifts = getShifts(vt);
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    const rows = root.querySelectorAll('table.kt-h-table tbody tr');
    let grandH = 0, grandC = 0;
    members.forEach((m, idx) => {
      const row = shifts[m.id] || {};
      let h = 0;
      period.days.forEach((d) => { h += shiftHours(row[d]); });
      const cost = hourlyPayFor(m, h, period.days);
      grandH += h; grandC += cost;
      const tr = rows[idx];
      if (!tr) return;
      const tb = tr.querySelector('.kt-h-total b');
      if (tb) tb.textContent = fmtHours(h);
      const pb = tr.querySelector('.kt-h-pay b');
      if (pb && (+m.hourlyRate || 0) > 0) pb.textContent = (window.KiwiNumber?.format(cost, { maximumFractionDigits: 0 }) ?? cost.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }));
    });
    const foot = root.querySelectorAll('tfoot .kt-h-foot-tot b');
    if (foot[0]) foot[0].textContent = fmtHours(grandH);
    if (foot[1] && members.some((m) => (+m.hourlyRate || 0) > 0)) foot[1].textContent = (window.KiwiNumber?.format(grandC, { maximumFractionDigits: 0 }) ?? grandC.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }));
  }

  function shiftCellInner(T, cur, locked) {
    const s = normShift(cur);
    if (!s) return `<span class="kt-sh-empty">${esc(T.plNone)}</span>`;
    if (s.off) return `<span class="kt-sh-rest">${esc(T.plRest)}</span>`;
    const next = shiftIsNextDay(s);
    return `<span class="kt-sh-t">${esc(s.start)}</span>` +
      `<span class="kt-sh-t end">${esc(s.end)}${next ? '<i class="kt-sh-next">+1</i>' : ''}</span>`;
  }
  function shiftCellTitle(T, cur, dayISO) {
    const s = normShift(cur);
    if (!s || s.off) return '';
    const mins = shiftMinutes(s);
    if (!shiftIsNextDay(s)) return fmtDur(mins);
    const nx = addDays(fromISO(dayISO), 1);
    const lbl = nx.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    return `${T.plNextDay(lbl, s.end)} · ${fmtDur(mins)}`;
  }

  function planCellHtml(T, m, d, cur, locked, dayMeta) {
    const s = normShift(cur);
    const isToday = (d === toISO(new Date()));
    const title = shiftCellTitle(T, cur, d);
    return `<td class="kt-day-cell kt-plan-cell${isToday ? ' today' : ''}${s && !s.off ? ' on' : ''}${s && s.off ? ' off' : ''}${dayMeta?.closed?' is-closed':''}${dayMeta?.holiday?' is-holiday':''}"
      data-kt-cell="${esc(m.id)}|${esc(d)}">
      <button data-activation=write class="kt-sh" type="button" data-action="kt-shift-edit" data-mid="${esc(m.id)}" data-day="${esc(d)}"
        ${locked ? 'disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${shiftCellInner(T, cur, locked)}</button>
    </td>`;
  }

  /* Téléphone (≤ 900 px) : sept colonnes ne tiennent pas dans 390 px, on y
   * défilait de côté à travers des cases de 40 px. Sous 900 px la même semaine
   * se lit un jour à la fois : une pastille par jour (la lentille liquide la
   * suit, un glissement du doigt passe au jour voisin), puis une ligne pleine
   * largeur par personne, nom, fonction et horaires, qui ouvre le même éditeur
   * que la case du tableau. Le tableau reste dans le DOM, caché : ses totaux
   * sont ceux que l'éditeur repeint déjà. Au-dessus de 900 px rien ne change. */
  let planDayISO = '';
  const ADD_ICON = '<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>';
  function planDayCopy() {
    const lang = trLang();
    if (lang === 'en') return { days: 'Days of the week', add: 'Add', none: 'Nobody on shift', on: (n, h) => `${n} on shift · ${h}` };
    if (lang === 'ar') return { days: 'أيام الأسبوع', add: 'إضافة', none: 'لا أحد في الخدمة', on: (n, h) => `${n} في الخدمة · ${h}` };
    return { days: 'Jours de la semaine', add: 'Ajouter', none: 'Personne en service', on: (n, h) => `${n} en service · ${h}` };
  }
  function planDayRowInner(T, cur) {
    const s = normShift(cur);
    if (!s) return `<span class="kt-pd-add">${ADD_ICON}${esc(planDayCopy().add)}</span>`;
    if (s.off) return `<span class="kt-pd-rest">${esc(T.plRest)}</span>`;
    return `<span class="kt-pd-t">${esc(s.start)} – ${esc(s.end)}${shiftIsNextDay(s) ? '<i class="kt-sh-next">+1</i>' : ''}</span>` +
      `<span class="kt-pd-dur">${esc(fmtDur(shiftMinutes(s)))}</span>`;
  }
  function planDaySummary(cells) {
    const c = planDayCopy();
    let n = 0, h = 0;
    cells.forEach((cur) => { const s = normShift(cur); if (s && !s.off) { n += 1; h += shiftHours(s); } });
    return n ? c.on(n, fmtHours(h)) : c.none;
  }
  function planDaysHtml(T, members, shifts, view, locked, calendarMeta) {
    if (!view.includes(planDayISO)) {
      const today = toISO(new Date());
      planDayISO = view.includes(today) ? today : view[0];
    }
    const c = planDayCopy();
    const today = toISO(new Date());
    const pills = view.map((d) => {
      const dt = fromISO(d);
      const on = d === planDayISO;
      const meta = calendarMeta[d] || {};
      return `<button class="kt-pd-pill${on ? ' on' : ''}${d === today ? ' today' : ''}${meta.closed ? ' is-closed' : ''}" type="button" role="tab"
        id="kt-pd-tab-${esc(d)}" aria-controls="kt-pd-${esc(d)}" aria-selected="${on ? 'true' : 'false'}"
        data-action="kt-plan-day" data-arg="${esc(d)}"><span class="w">${esc(dt.toLocaleDateString(dateLocale(), { weekday: 'short' }))}</span><span class="d">${dt.getDate()}</span></button>`;
    }).join('');
    const panels = view.map((d) => {
      const dt = fromISO(d);
      const meta = calendarMeta[d] || {};
      const hours = !meta.configured ? '' : meta.closed ? ({ fr: 'Fermé', en: 'Closed', ar: 'مغلق' }[trLang()] || 'Fermé') : compactPeriods(meta.periods);
      const special = meta.exception?.label || meta.holiday?.label || '';
      const rows = members.map((m) => {
        const cur = (shifts[m.id] || {})[d];
        const s = normShift(cur);
        return `<li data-kt-cell="${esc(m.id)}|${esc(d)}">
          <button data-activation=write class="kt-pd-row${s && !s.off ? ' on' : ''}${s && s.off ? ' off' : ''}" type="button" data-action="kt-shift-edit" data-mid="${esc(m.id)}" data-day="${esc(d)}" ${locked ? 'disabled' : ''}>
            <span class="eq-av sm" style="background:${AVATAR_COLORS[m.avatarTone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
            <span class="kt-pd-who"><b>${esc(memberFullName(m))}</b><small>${esc(jobName(m.function))}</small></span>
            <span class="kt-pd-when">${planDayRowInner(T, cur)}</span>
          </button>
        </li>`;
      }).join('');
      return `<section class="kt-pd-panel" id="kt-pd-${esc(d)}" role="tabpanel" aria-labelledby="kt-pd-tab-${esc(d)}" data-kt-dpanel="${esc(d)}"${d === planDayISO ? '' : ' hidden'}>
        <div class="kt-pd-head">
          <div><strong>${esc(dt.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' }))}</strong>${[special, hours].filter(Boolean).length ? `<span>${esc([special, hours].filter(Boolean).join(' · '))}</span>` : ''}</div>
          <span class="kt-pd-sum" data-kt-dsum="${esc(d)}">${esc(planDaySummary(members.map((m) => (shifts[m.id] || {})[d])))}</span>
        </div>
        <ul class="kt-pd-list">${rows}</ul>
      </section>`;
    }).join('');
    return `<div class="kt-pd">
      <div class="kt-pd-days" role="tablist" aria-label="${esc(c.days)}">${pills}</div>
      <div class="kt-pd-panels">${panels}</div>
    </div>`;
  }


  return Object.freeze({ closeShiftPop, planCellHtml, planDaysHtml, shiftCellInner, shiftCellTitle, isShiftPopOpen: () => !!shiftPop, });
}
