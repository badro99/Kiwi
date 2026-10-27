/* Planning payroll-view. Exports: renderHoursPane, updateHourTotals, payTiles, payrollAccess, renderPayrollBody.
 * Reads injected helpers: AVATAR_COLORS, IC, Kiwi, buildPeriod, correctionsHtml, deferredMark, esc, fmtHours, fmtMad, getHours, getMembers, handlers, hourlyPayFor, initials, jobName, live, memberFullName, pad, payrollFigures, periodNavigatorHtml, periodPillsHtml, render, renderPlanningPane, saveCustomTeams, shiftHours, svgIcon, t, teamKey, toISO, trLang.
 * Reads window: KiwiConfig, KiwiNumber, KiwiVenue, __kiwiRole, __kiwiTeamV2. Mutable UI state is private to this factory. */
export function createPayrollView({ AVATAR_COLORS, IC, Kiwi, buildPeriod, correctionsHtml, deferredMark, esc, fmtHours, fmtMad, getHours, getMembers, handlers, hourlyPayFor, initials, jobName, live, memberFullName, pad, payrollFigures, periodNavigatorHtml, periodPillsHtml, render, renderPlanningPane, saveCustomTeams, shiftHours, svgIcon, t, teamKey, toISO, trLang }) {
  let payTab = 'planning';

  function renderHoursPane(T, venue, venueType, members) {
    const root = window.__kiwiTeamV2;
    const periodKind = root.periodKind || 'week';
    const period = buildPeriod(periodKind);
    const hours = getHours(venueType);
    /* Ensure rows exist for every member */
    members.forEach(m => {
      if (!hours[m.id]) hours[m.id] = {};
      period.days.forEach(d => { if (hours[m.id][d] == null) hours[m.id][d] = 0; });
    });

    const locked = root.periodLocked;
    let grandHours = 0, grandPay = 0, anyRated = false;

    const headDays = period.days.map(d => {
      const dt = new Date(d);
      const dayLbl = dt.toLocaleDateString(trLang() === 'en' ? 'en-US' : 'fr-FR', { weekday: 'short' });
      return `<th class="kt-day-head"><span class="d">${pad(dt.getDate())}</span><span class="m">${dayLbl}</span></th>`;
    }).join('');

    const rows = members.map(m => {
      const row = hours[m.id] || {};
      let total = 0;
      const cells = period.days.map(d => {
        const v = +(row[d] || 0);
        total += v;
        const isToday = (d === toISO(new Date()));
        return `<td class="kt-day-cell${isToday ? ' today' : ''}${locked ? ' locked' : ''}">
          <input type="text" inputmode="decimal" value="${esc(fmtHours(v))}" data-hours-value="${v}" data-kt-hour data-mid="${esc(m.id)}" data-day="${esc(d)}" ${locked ? 'disabled' : ''} />${deferredMark(venueType, m.id, d)}
        </td>`;
      }).join('');
      /* Sans taux horaire, Kiwi ne calcule rien : « 0 MAD » pour une semaine
         travaillée se lisait comme un salaire nul. */
      const rated = (+m.hourlyRate || 0) > 0;
      const pay = rated ? hourlyPayFor(m, total, period.days) : 0;
      grandHours += total;
      grandPay += pay;
      if (rated) anyRated = true;
      const tone = m.avatarTone || 'a';
      return `
        <tr>
          <td class="kt-h-member">
            <span class="eq-av sm" style="background:${AVATAR_COLORS[tone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
            <div>
              <div class="n">${esc(memberFullName(m))}</div>
              <div class="r">${esc(jobName(m.function))}</div>
            </div>
          </td>
          ${cells}
          <td class="kt-h-total mono"><b>${fmtHours(total)}</b></td>
          <td class="kt-h-pay mono">${rated ? `<b>${(window.KiwiNumber?.format(pay, { maximumFractionDigits: 0 }) ?? pay.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }))}</b><span>MAD</span>` : `<b title="${esc(T.noRate)}">·</b>`}</td>
        </tr>
      `;
    }).join('');

    const periodPills = periodPillsHtml(T);

    return `
      ${correctionsHtml(venueType)}
      <div class="eq-section">
        <div class="eq-section-head">
          <h3>${esc(T.tabHours)}</h3>
          <span class="eq-count-badge">${esc(T.hPeriodLabel(period.startFr, period.endFr))}${locked ? ' · ' + esc(T.hLocked) : ''}</span>
        </div>

        <div class="kt-hbar">
          <div class="eq-pill-row">${periodPills}</div>
          <div class="kt-hbar-right">
            <button class="btn-slim" type="button" data-action="kt-quick-entry">${svgIcon(IC.plus, 13)}<span>${esc(T.hQuickEntry)}</span></button>
            <button data-activation=money class="btn-slim" type="button" data-action="kt-export-csv">${svgIcon(IC.download, 13)}<span>${esc(T.hExport)}</span></button>
            <button data-activation=write class="btn-slim" type="button" data-action="kt-import-csv">${svgIcon(IC.upload, 13)}<span>${esc(T.hImport)}</span></button>
            <button data-activation=write class="btn-slim ${locked ? '' : 'primary'}" type="button" data-action="${locked ? 'kt-unlock-period' : 'kt-validate-period'}">
              ${locked ? svgIcon(IC.unlock, 13) : svgIcon(IC.check, 13)}<span>${esc(locked ? T.hUnlock : T.hValidate)}</span>
            </button>
          </div>
        </div>
        ${periodNavigatorHtml(T, period)}

        <p class="kt-plan-hint">${esc(T.precisionHint)}</p>
        <div class="kt-h-tablewrap" tabindex="0" role="region" aria-label="${esc(T.tabHours)}">
          <table class="kt-h-table">
            <thead>
              <tr>
                <th class="kt-h-memberhead">${esc(T.hMember)}</th>
                ${headDays}
                <th class="kt-h-totalhead">${esc(T.hTotal)}</th>
                <th class="kt-h-totalhead">${esc(T.hPay)}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td class="kt-h-foot-label">${esc(T.hFooterLabel)}</td>
                <td colspan="${period.days.length}"></td>
                <td class="kt-h-foot-tot mono"><b>${fmtHours(grandHours)}</b></td>
                <td class="kt-h-foot-tot mono">${anyRated ? `<b>${(window.KiwiNumber?.format(grandPay, { maximumFractionDigits: 0 }) ?? grandPay.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }))}</b><span>MAD</span>` : `<b title="${esc(T.noRate)}">·</b>`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  handlers['kt-paytab'] = (_el, kind) => {
    if (kind !== 'planning' && kind !== 'hours') return;
    payTab = kind;
    render();
  };
  /* Reporter le planifié sur le réel. Le planning ne paie personne tout seul :
   * la paie ne lit QUE la grille des heures, sinon une semaine prévue puis
   * annulée partirait quand même en salaire. Un jour laissé vide au planning
   * n'écrase pas l'heure déjà saisie — on ne remplace que ce qui a été décidé. */
  handlers['kt-plan-apply'] = () => {
    const root = window.__kiwiTeamV2;
    if (root.periodLocked) return;
    const T = t();
    const vt = teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
    const period = buildPeriod(root.periodKind || 'week');
    const shifts = root.shiftsByVenue[vt] || {};
    const hours = root.hoursByVenue[vt] || (root.hoursByVenue[vt] = {});
    let n = 0;
    getMembers(vt).forEach((m) => {
      const row = shifts[m.id] || {};
      period.days.forEach((d) => {
        if (!row[d]) return;
        if (!hours[m.id]) hours[m.id] = {};
        // Deux décimales : une saisie libre tombe sur 7,25 ou 7,75, pas sur un
        // 7,333333 qui s'afficherait tel quel dans la grille des heures.
        hours[m.id][d] = Math.round(shiftHours(row[d]) * 100) / 100;
        n++;
      });
    });
    if (!n) { Kiwi.toast(T.plNothing, { type: 'pend' }); return; }
    saveCustomTeams();
    payTab = 'hours';                    // montrer le résultat, pas le formulaire
    render();
    Kiwi.toast(T.plApplied(n), { type: 'success' });
  };

  /* Live-edit of an hour cell — keeps focus, only refreshes totals. */
  document.addEventListener('input', (e) => {
    const t2 = e.target;
    if (!t2.matches || !t2.matches('[data-kt-hour]')) return;
    if (!live.pageActive) return;
    if (window.__kiwiTeamV2.periodLocked) return;
    const mid = t2.getAttribute('data-mid');
    const day = t2.getAttribute('data-day');
    const venue = window.KiwiVenue?.getCurrentVenueData?.();
    // teamKey(), NOT venue.type. A real store is keyed by its venue ID; keying the
    // WRITE by type parked every hour the owner typed in hoursByVenue['boutique']
    // while every READ (getHours → teamKey) looked under the venue id. So the cell
    // accepted the number, the totals never moved, and nothing survived a reload —
    // on this page and on Équipe → Heures travaillées alike.
    const vt = teamKey(venue || { type: 'restaurant' });
    const hours = window.__kiwiTeamV2.hoursByVenue[vt] || (window.__kiwiTeamV2.hoursByVenue[vt] = {});
    if (!hours[mid]) hours[mid] = {};
    const val = Math.max(0, Math.min(24, parseFloat(String(t2.value).replace(',', '.')) || 0));
    t2.dataset.hoursValue = String(val);
    hours[mid][day] = val;
    updateHourTotals();
    saveCustomTeams();          // an hour typed is payroll data — persist it
  });

  document.addEventListener('focusin', (e) => {
    const input = e.target;
    if (!input.matches || !input.matches('[data-kt-hour]')) return;
    input.value = String(Number(input.dataset.hoursValue) || 0);
    input.select();
  });

  document.addEventListener('focusout', (e) => {
    const input = e.target;
    if (!input.matches || !input.matches('[data-kt-hour]')) return;
    input.value = fmtHours(input.dataset.hoursValue);
  });

  function updateHourTotals() {
    // The grid lives in the Équipe section OR in the Paie & planning genpage —
    // same markup, two hosts. Looking only for [data-equipe-root] meant editing an
    // hour on Paie updated the store and refreshed nothing.
    const root = (live.pageMode === 'payroll'
      ? document.querySelector('.dash-genpage .dash-equipe')
      : null) || document.querySelector('[data-equipe-root]');
    if (!root) return;
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const vt = teamKey(venue);
    const members = getMembers(vt);
    const hours = getHours(vt);
    /* Les jours de la PÉRIODE affichée, pas toutes les heures jamais saisies :
       taper 8 h un mardi faisait sauter le total de la ligne à la somme de
       toutes les semaines passées. */
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    let grandH = 0, grandP = 0;
    members.forEach((m, idx) => {
      const row = hours[m.id] || {};
      const tot = period.days.reduce((a, d) => a + (+row[d] || 0), 0);
      const pay = hourlyPayFor(m, tot, period.days);
      grandH += tot; grandP += pay;
      const tr = root.querySelectorAll('table.kt-h-table tbody tr')[idx];
      if (tr) {
        const totalCell = tr.querySelector('.kt-h-total b');
        const payCell   = tr.querySelector('.kt-h-pay b');
        if (totalCell) totalCell.textContent = fmtHours(tot);
        if (payCell && (+m.hourlyRate || 0) > 0) payCell.textContent = (window.KiwiNumber?.format(pay, { maximumFractionDigits: 0 }) ?? pay.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }));
      }
    });
    const footTot = root.querySelectorAll('table.kt-h-table tfoot .kt-h-foot-tot b');
    if (footTot[0]) footTot[0].textContent = fmtHours(grandH);
    if (footTot[1] && members.some((m) => (+m.hourlyRate || 0) > 0)) footTot[1].textContent = (window.KiwiNumber?.format(grandP, { maximumFractionDigits: 0 }) ?? grandP.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }));

    // On Paie & planning the band above the grid is the headline the owner reads
    // ("à payer · période"). Keep it in step with the cell they just typed in,
    // rather than making them leave the page and come back to see the new total.
    if (live.pageMode === 'payroll') {
      const pt = payTiles(t(), payrollFigures(members, vt, period), period, members.length);
      const vals = root.querySelectorAll('.eq-stats .eq-stat-v');
      const subs = root.querySelectorAll('.eq-stats .eq-stat-sub');
      pt.forEach((x, i) => { if (vals[i]) vals[i].textContent = x.v; if (subs[i]) subs[i].textContent = x.sub; });
    }
  }

  function payTiles(T, f, period, count) {
    const whole = f.share >= 0.999;
    return [
      { v: (f.salaried || f.rated) ? fmtMad(f.baseDue + f.variablePay) : '·',
        sub: (f.salaried || f.rated)
          ? (whole || !f.salaried ? T.payStatDueSub(period.startFr, period.endFr) : T.payStatDueProrata(period.startFr, period.endFr, period.days.length))
          : T.payStatNone },
      { v: fmtHours(f.totalHours), sub: T.payStatHoursSub },
      { v: f.rated ? fmtMad(f.variablePay) : '·', sub: f.rated ? T.payStatVarSub : T.noRate },
      { v: f.salaried ? fmtMad(f.baseMass) : '·',
        sub: f.salaried ? T.payStatBaseMonthly(f.salaried, count) : T.statPayrollNone },
    ];
  }

  function payrollAccess() {
    const role = window.__kiwiRole || 'owner';
    const payrollEnabled = window.KiwiConfig?.features?.payroll !== false;
    return role === 'staff' ? 'none' : role === 'manager' || !payrollEnabled ? 'planning' : 'full';
  }

  function renderPayrollBody(T, venue, venueType, members, access = payrollAccess()) {
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    if (!members.length) {
      return `
        <div class="dash-equipe">
          <div class="eq-section" style="text-align:center; padding:44px 18px; display:flex; flex-direction:column; align-items:center;">
            <div style="width:48px;height:48px;border-radius:14px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:16px;">
              <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg>
            </div>
            <h3 style="margin:0 0 6px; font-family:var(--sans); font-size:18px; font-weight:600; letter-spacing:-0.015em; color:var(--ink);">${esc(T.payEmptyH)}</h3>
            <p style="margin:0 auto 18px; max-width:44ch; color:var(--n-500); line-height:1.55; font-size:13px;">${esc(T.payEmptyP)}</p>
            <button data-activation=write class="kb atlas" type="button" data-action="nav-equipe">${svgIcon(IC.plus, 13)}${esc(T.addMember)}</button>
          </div>
        </div>`;
    }
    if (access === 'planning') {
      return `<div class="dash-equipe">${renderPlanningPane(T, venue, venueType, members, { showCosts: false })}</div>`;
    }
    const f = payrollFigures(members, venueType, period);
    const tile = (label, value, sub) => `
      <div class="eq-stat">
        <div class="eq-stat-l"><span>${esc(label)}</span></div>
        <div class="eq-stat-v">${value}</div>
        <div class="eq-stat-sub">${esc(sub)}</div>
      </div>`;
    return `
      <div class="dash-equipe">
        <div class="eq-stats">
          ${(() => { const pt = payTiles(T, f, period, members.length); return [T.payStatDue, T.payStatHours, T.payStatVar, T.payStatBase].map((l, i) => tile(l, pt[i].v, pt[i].sub)).join(''); })()}
        </div>
        <div class="eq-filters">
          <div class="eq-pill-row">
            <button class="eq-pill${payTab === 'planning' ? ' on' : ''}" type="button" data-action="kt-paytab" data-arg="planning">${esc(T.tabPlanning)}</button>
            <button class="eq-pill${payTab === 'hours' ? ' on' : ''}" type="button" data-action="kt-paytab" data-arg="hours">${esc(T.tabRealised)}</button>
          </div>
        </div>
        ${payTab === 'planning'
          ? renderPlanningPane(T, venue, venueType, members, { showCosts: true })
          : renderHoursPane(T, venue, venueType, members)}
      </div>`;
  }


  return Object.freeze({ renderHoursPane, updateHourTotals, payTiles, payrollAccess, renderPayrollBody });
}
