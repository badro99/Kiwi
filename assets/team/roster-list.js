/* Owner: rosterList. Exports create() through KiwiTeamParts.rosterList.
 * Window reads: KiwiRoles, KiwiVenue, __kiwiTeamV2.
 * Instance exports: memberMatchesFilters, rerenderProfilesGrid, renderHeader, roster, daySnapshot, planningDay, bookingCoverage, labour, setActiveTab.
 * lexical imports: memberFullName, jobName, t, teamKey, getMembers, getHours, getShifts, toISO, memberDutyStatus, liveMember, normShift, hhmmToMin, addDays, fromISO, payrollFigures, renderMembersTable, esc, trLang, tradeKey, todayLongLabel, svgIcon, activeFilters, IC.
 * Mutable persistence and credential knowledge belong only to memberState. */
(function () {
  'use strict';
  window.KiwiTeamParts ||= {};
  const parts = window.KiwiTeamParts;
  parts.rosterList = Object.freeze({ create(deps) {
  const {
    memberFullName,
    jobName,
    t,
    teamKey,
    getMembers,
    getHours,
    getShifts,
    toISO,
    memberDutyStatus,
    liveMember,
    normShift,
    hhmmToMin,
    addDays,
    fromISO,
    payrollFigures,
    renderMembersTable,
    esc,
    trLang,
    tradeKey,
    todayLongLabel,
    svgIcon,
    activeFilters,
    IC,
  } = deps;
  let activeTab = 'profiles';
  function memberMatchesFilters(m) {
    const { search, dept, contract, lang } = activeFilters;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${memberFullName(m)} ${m.function} ${m.department} ${jobName(m.function)} ${jobName(m.department, 'dept')} ${m.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (dept && m.department !== dept) return false;
    if (contract && m.contract !== contract) return false;
    if (lang && !(m.languages || []).includes(lang)) return false;
    return true;
  }

  function rerenderProfilesGrid() {
    if (activeTab !== 'profiles') return;
    const root = document.querySelector('[data-equipe-root]');
    if (!root) return;
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Votre établissement', type: 'restaurant' };
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    const target = root.querySelector('[data-kt-grid-host]');
    if (!target) return;
    const visible = members.filter(memberMatchesFilters);
    target.innerHTML = visible.length === 0
      ? `<div class="eq-section" style="text-align:center; color:var(--n-500); padding:36px 14px;">${esc(members.length ? T.noMatch : T.noMembersYet)}</div>`
      : renderMembersTable(T, visible, venueType);
    /* Also keep the badge count fresh */
    const badge = root.querySelector('[data-kt-count-badge]');
    if (badge) badge.textContent = T.secAllMembersBadge(visible.length);
  }

  function renderHeader(T, venue, members) {
    const employeeAppLabel = trLang() === 'ar' ? 'تطبيق الموظفين' : trLang() === 'en' ? 'Employee app' : 'App employés';
    const showEmployeeApp = venue && venue.custom && (tradeKey(venue) === 'restaurant' || tradeKey(venue) === 'cafe');
    return `
      <div class="eq-head">
        <div>
          <div class="eq-title">${esc(T.title)}</div>
          <div class="eq-date">${esc(T.subDate(todayLongLabel()))}</div>
        </div>
        <div class="eq-head-acts">
          ${showEmployeeApp ? `<button class="btn-slim" type="button" data-action="kt-employee-app">${svgIcon(IC.users, 13)}<span>${esc(employeeAppLabel)}</span></button>` : ''}
          <button data-activation=money class="btn-slim" type="button" data-action="kt-export-csv">${svgIcon(IC.download, 13)}<span>${esc(T.exportCsv)}</span></button>
          <button data-activation=write class="btn-slim primary" type="button" data-action="kt-add-member">${svgIcon(IC.plus, 13)}<span>${esc(T.addMember)}</span></button>
        </div>
      </div>
    `;
  }

  function roster() {
    try {
      const venue = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const vt = teamKey(venue);
      const members = getMembers(vt) || [];
      const hours = getHours(vt) || {};
      const todayKey = toISO(new Date());
      return members.map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || '·',
        role: m.function ? jobName(m.function) : jobName(m.department || '', 'dept'),
        avatar: String(m.firstName || '?').trim().charAt(0).toUpperCase() || '?',
        status: memberDutyStatus(m, hours, todayKey),
        hoursToday: liveMember(m.id)
          && ['on-duty', 'on-pause'].includes(liveMember(m.id).status)
          ? Math.max(0.01, +((hours[m.id] || {})[todayKey]) || 0.01)
          : (+((hours[m.id] || {})[todayKey]) || 0),
      }));
    } catch (_) { return []; }
  }

  function daySnapshot(dayKey) {
    try {
      dayKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || '')) ? String(dayKey) : toISO(new Date());
      const venue = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const key = teamKey(venue), members = getMembers(key) || [];
      const realised = getHours(key) || {}, shifts = getShifts(key) || {};
      return members.map((m) => {
        const shift = normShift((shifts[m.id] || {})[dayKey]);
        let plannedHours = 0;
        if (shift && !shift.off) {
          const from = hhmmToMin(shift.start), to = hhmmToMin(shift.end);
          plannedHours = Math.max(0, (to > from ? to - from : 1440 - from + to) / 60);
        }
        return {
          id: m.id,
          name: memberFullName(m) || '·',
          role: m.function || m.department || m.role || '',
          plannedStart: shift && !shift.off ? shift.start : '',
          plannedEnd: shift && !shift.off ? shift.end : '',
          plannedHours: Math.round(plannedHours * 100) / 100,
          workedHours: Math.max(0, +((realised[m.id] || {})[dayKey]) || 0),
          dayOff: !!(shift && shift.off),
        };
      });
    } catch (_) { return []; }
  }

  function planningDay(dayKey) {
    try {
      dayKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || '')) ? String(dayKey) : toISO(new Date());
      const venue = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const key = teamKey(venue), members = getMembers(key) || [];
      const planning = window.__kiwiTeamV2.planningByVenue[key] || {};
      const published = planning.publishingEnabled === true && planning.publishedShifts && typeof planning.publishedShifts === 'object';
      const shifts = published ? planning.publishedShifts : {};
      const configured = published && members.some((m) => Object.prototype.hasOwnProperty.call(shifts[m.id] || {}, dayKey));
      return {
        day: dayKey, configured: !!configured, published: !!published,
        members: members.map((m) => {
          const shift = normShift((shifts[m.id] || {})[dayKey]);
          return {
            id: String(m.id || ''),
            firstName: String(m.firstName || memberFullName(m) || '').trim().split(/\s+/)[0].slice(0, 40),
            start: shift && !shift.off ? shift.start : '', end: shift && !shift.off ? shift.end : '', off: !!(shift && shift.off)
          };
        }).filter((m) => m.id)
      };
    } catch (_) { return { day: String(dayKey || ''), configured: false, published: false, members: [] }; }
  }

  function bookingCoverage(startAt, endAt) {
    try {
      const venue = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const key = teamKey(venue), members = getMembers(key) || [], shifts = getShifts(key) || {};
      const start = new Date(+startAt || 0), currentDay = toISO(start), previousDay = toISO(addDays(fromISO(currentDay), -1));
      const days = [previousDay, currentDay], currentConfigured = members.some((m) => Object.prototype.hasOwnProperty.call(shifts[m.id] || {}, currentDay));
      const floor = members.filter((m) => {
        const role = m.role || m.function || m.department || '';
        return window.KiwiRoles?.isService ? window.KiwiRoles.isService(role) : /serveur|service|salle|rang|ma[iî]tre|barista|barman|accueil|h[oô]te|manager|propri[eé]taire|staff|[eé]quipier/i.test(role);
      });
      const covered = floor.filter((m) => days.some((day) => {
        const shift = normShift((shifts[m.id] || {})[day]);
        if (!shift || shift.off) return false;
        const a = fromISO(day), from = hhmmToMin(shift.start), to = hhmmToMin(shift.end);
        a.setHours(Math.floor(from / 60), from % 60, 0, 0);
        const z = new Date(a); z.setMinutes(z.getMinutes() + (to > from ? to - from : 1440 - from + to));
        return a.getTime() <= +startAt && z.getTime() >= +endAt;
      })).map((m) => ({ id: m.id, name: memberFullName(m), role: m.function || m.department || m.role || '' }));
      return { configured: currentConfigured || covered.length > 0, members: covered };
    } catch (_) { return { configured: false, members: [] }; }
  }

  function labour(days) {
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || null;
    if (!venue) return null;
    const members = getMembers(teamKey(venue));
    const list = (Array.isArray(days) ? days : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const f = payrollFigures(members, teamKey(venue), { days: list });
    if (!f.salaried && !f.rated) return null;
    return { baseDue: f.baseDue, variablePay: f.variablePay, baseMass: f.baseMass, share: f.share,
      salaried: f.salaried, rated: f.rated, members: members.length, totalHours: f.totalHours };
  }

  return Object.freeze({ memberMatchesFilters, rerenderProfilesGrid, renderHeader, roster, daySnapshot, planningDay, bookingCoverage, labour, setActiveTab(value) { activeTab = value; } });
  } });
})();
