import { createCorrections } from './planning/corrections.js?v=3';
import { createPayrollView } from './planning/payroll-view.js?v=6';
import { createOptimiser } from './planning/optimiser.js?v=3';
import { createCsvImport } from './planning/csv-import.js?v=3';
import { createShiftEditor } from './planning/shift-editor.js?v=5';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ÉQUIPE · heures, planning et paie (team-hours.js)
 *
 * La moitié « qui a travaillé quand, et combien je dois » de assets/team.js,
 * sortie telle quelle, à l'octet près pour chaque bloc : grille des heures
 * réalisées, planning (éditeur de service, couverture, modèles, publication,
 * demandes, répartition équitable), import et export CSV, validation de
 * période, et la page Paie & planning. team.js garde le roster, l'éditeur de
 * membre et la publication des codes vers la caisse : changer l'accès du
 * personnel ne touche plus à ce fichier.
 *
 * Se charge JUSTE APRÈS team.js (dashboard.html). Il lit les fonctions et
 * l'état de team.js par Kiwi.__teamCore et lui rend, dans core.hours, ce que
 * team.js appelle : renderHoursPane, closeShiftPop, payrollAccess,
 * renderPayrollBody, et isShiftPopOpen. Les seules réécritures par rapport au
 * bloc d'origine : pageActive, pageMode et liveTeamPendingRender, que seul
 * team.js modifie, se lisent ici `live.pageActive` (etc.), relus à chaque
 * accès. Aucun code ni mot de passe n'y passe.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const memberState = window.Kiwi?.__teamMemberState;
  // Bound transport and JSON reads, even when a transport ignores abort.
  function fetchDeadline(url, options, readBody) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;
    var request = new Promise(function (resolve, reject) {
      try { resolve(fetch(url, Object.assign({}, options, controller ? {signal: controller.signal} : {}))); }
      catch (error) { reject(error); }
    }).then(function (response) {
      if (readBody === false || !response || typeof response.json !== 'function') return response;
      return response.json().then(function (data) {
        response.json = function () { return Promise.resolve(data); }; return response;
      }, function (error) {
        response.json = function () { return Promise.reject(error); }; return response;
      });
    });
    var deadline = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var error = new Error('request-timeout'); error.code = 'timeout';
        reject(error);
        if (controller) controller.abort();
      }, 12000);
    });
    return Promise.race([request, deadline]).finally(function () { clearTimeout(timer); });
  }

  const core = window.Kiwi && window.Kiwi.__teamCore;
  if (!core || !core.hours) return;
  const {
    Kiwi, handlers, modal, toast, live,
    trLang, t, jobName, AVATAR_COLORS, initials, periodOffsets, HHMM_RE,
    normShift, shiftMinutes, shiftHours, shiftIsNextDay, fmtDur, fmtHours, fromISO, addDays, getShifts,
    periodPillsHtml, teamKey, saveCustomTeams, getMembers, getHours, pad, fmtFr, toISO, buildPeriod,
    periodNavigatorHtml, lockBucket, setPeriodLock, restorePeriodLock, applyLiveTeam, render,
    esc, memberFullName, isCustomVenue, fmtMad, svgIcon, IC, dateLocale, MODAL_CSS,
    contractWeekHours, hourlyPayFor, payrollFigures, payCents, fmtPay,
  } = core;

  const corrections = createCorrections({ Kiwi: Kiwi, dateLocale: dateLocale, esc: esc, fetchDeadline: fetchDeadline, handlers: handlers, pad: pad, render: render, toast: toast, trLang: trLang });
  const payrollView = createPayrollView({ AVATAR_COLORS: AVATAR_COLORS, IC: IC, Kiwi: Kiwi, buildPeriod: buildPeriod, correctionsHtml: (...args) => corrections.correctionsHtml(...args), deferredMark: (...args) => corrections.deferredMark(...args), esc: esc, dateLocale: dateLocale, fmtHours: fmtHours, fmtMad: fmtMad, fmtPay: fmtPay, getHours: getHours, getMembers: getMembers, handlers: handlers, hourlyPayFor: hourlyPayFor, initials: initials, jobName: jobName, live: live, memberFullName: memberFullName, pad: pad, payCents: payCents, payrollFigures: payrollFigures, periodNavigatorHtml: periodNavigatorHtml, periodPillsHtml: periodPillsHtml, render: render, renderPlanningPane: renderPlanningPane, saveCustomTeams: saveCustomTeams, shiftHours: shiftHours, svgIcon: svgIcon, t: t, teamKey: teamKey, toISO: toISO, trLang: trLang });
  const optimiser = createOptimiser({ esc: esc, handlers: handlers, memberFullName: memberFullName, modal: modal, planningContext: planningContext, planningCopy: planningCopy, planningHolidaysByDay: planningHolidaysByDay, planningHoursKey: planningHoursKey, render: render, saveCustomTeams: saveCustomTeams, t: t, toast: toast, trLang: trLang });
  const csvImport = createCsvImport({ Kiwi: Kiwi, esc: esc, getMembers: getMembers, handlers: handlers, live: live, lockBucket: lockBucket, memberFullName: memberFullName, modal: modal, pad: pad, render: render, saveCustomTeams: saveCustomTeams, teamKey: teamKey, trLang: trLang });
  const shiftEditor = createShiftEditor({ AVATAR_COLORS: AVATAR_COLORS, HHMM_RE: HHMM_RE, addDays: addDays, applyLiveTeam: applyLiveTeam, buildPeriod: buildPeriod, compactPeriods: compactPeriods, dateLocale: dateLocale, esc: esc, fmtDur: fmtDur, fmtHours: fmtHours, fmtPay: fmtPay, fromISO: fromISO, getMembers: getMembers, getShifts: getShifts, handlers: handlers, hourlyPayFor: hourlyPayFor, initials: initials, jobName: jobName, live: live, memberFullName: memberFullName, normShift: normShift, payCents: payCents, saveCustomTeams: saveCustomTeams, shiftHours: shiftHours, shiftIsNextDay: shiftIsNextDay, shiftMinutes: shiftMinutes, t: t, teamKey: teamKey, toISO: toISO, toast: toast, trLang: trLang, visibleDays: visibleDays });
  function deferredMark(...args) { return corrections.deferredMark(...args); }
  function correctionsHtml(...args) { return corrections.correctionsHtml(...args); }
  function renderHoursPane(...args) { return payrollView.renderHoursPane(...args); }
  function updateHourTotals(...args) { return payrollView.updateHourTotals(...args); }
  function payTiles(...args) { return payrollView.payTiles(...args); }
  function payrollAccess(...args) { return payrollView.payrollAccess(...args); }
  function renderPayrollBody(...args) { return payrollView.renderPayrollBody(...args); }
  function fairScheduleCopy(...args) { return optimiser.fairScheduleCopy(...args); }
  function optimizationCopy(...args) { return optimiser.optimizationCopy(...args); }
  function closeShiftPop(...args) { return shiftEditor.closeShiftPop(...args); }
  function planCellHtml(...args) { return shiftEditor.planCellHtml(...args); }
  function planDaysHtml(...args) { return shiftEditor.planDaysHtml(...args); }
  function shiftCellInner(...args) { return shiftEditor.shiftCellInner(...args); }
  function shiftCellTitle(...args) { return shiftEditor.shiftCellTitle(...args); }

  /* Paie & planning ouvre sur le PLANNING : c'est la moitié de la page qui
   * n'existait pas, et les heures réelles restent à un clic. */
  /* planning-part:payroll-view:0 */
  /* Quelle semaine de la période le planning montre — voir weekChunks(). */
  let planWeekIdx = 0;
  /* Pointage envoyé plus tard depuis le téléphone (réseau coupé) : le serveur
   * l'a daté avec le délai que le téléphone a déclaré. On le marque dans la
   * case du jour, délai compris, pour que le gérant puisse le questionner. */
  /* planning-part:corrections:0 */
  /* ═══════════════ HOURS PANE ═══════════════ */
  /* planning-part:payroll-view:1 */
  handlers['kt-plan-clear'] = () => {
    const root = memberState.current();
    if (root.periodLocked) return;
    const vt = teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
    const period = buildPeriod(root.periodKind || 'week');
    const shifts = root.shiftsByVenue[vt] || {};
    Object.keys(shifts).forEach((mid) => { period.days.forEach((d) => { delete shifts[mid][d]; }); });
    saveCustomTeams();
    render();
    Kiwi.toast(t().plCleared, { type: 'info' });
  };

  function planningContext() {
    const root = memberState.current();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type:'restaurant' };
    const key = teamKey(venue);
    const members = getMembers(key);
    const period = buildPeriod(root.periodKind || 'week');
    const planning = root.planningByVenue[key] || (root.planningByVenue[key] = window.KiwiPlanningCore?.blank?.() || {});
    const shifts = root.shiftsByVenue[key] || (root.shiftsByVenue[key] = {});
    return { root, venue, key, members, period, planning, shifts };
  }
  function planningHoursKey(ctx) {
    const venue=ctx&&ctx.venue||{};
    if(venue.id==='scoped'&&venue.slug)return venue.slug;
    return venue.id||venue.slug||(ctx&&ctx.key)||'';
  }
  function planningDayMeta(day, ctx) {
    const KH=window.KiwiHours,calendar=window.KiwiMoroccoCalendar,lang=trLang(),key=planningHoursKey(ctx);
    const configured=!!(KH?.isConfigured?.(key));
    const resolved=configured&&KH?.periodsOn?.(day,key);
    const periods=Array.isArray(resolved)?resolved:(resolved?.periods||[]);
    const exception=(resolved&&!Array.isArray(resolved)&&resolved.exception)||KH?.exceptionOn?.(day,key)||null;
    const holiday=calendar?.info?.(day,lang)||null;
    return { day, configured, periods, exception, holiday, closed:configured&&!periods.length };
  }
  function planningPeriodMeta(days, ctx) {
    return Object.fromEntries((days||[]).map((day)=>[day,planningDayMeta(day,ctx)]));
  }
  function planningHolidaysByDay(days) {
    const calendar=window.KiwiMoroccoCalendar,lang=trLang();
    return Object.fromEntries((days||[]).map((day)=>[day,calendar?.info?.(day,lang)?.label||'']).filter((entry)=>entry[1]));
  }
  function compactPeriods(periods) {
    const short=(value)=>String(value||'').replace(':00','h').replace(':30','h30');
    return (periods||[]).map((period)=>`${short(period.from)}–${short(period.to)}`).join(' / ');
  }

  handlers['kt-plan-template-save'] = () => {
    const copy = planningCopy();
    const mdl = modal({
      title: copy.templateTitle,
      width: 440,
      body: `<div class="kt-plan-modal-field"><label for="kt-template-name">${esc(copy.templateName)}</label><input id="kt-template-name" data-kt-template-name maxlength="80" value="${esc(copy.templateTitle)}" /></div>`,
      foot: `<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-template-confirm">${esc(copy.saveNow)}</button>`
    });
    mdl.el.addEventListener('click', (event) => { if (event.target.closest('[data-dismiss]')) mdl.close(); });
    window.__kiwiPlanningModal = mdl;
    setTimeout(() => mdl.el.querySelector('[data-kt-template-name]')?.select(), 20);
  };
  handlers['kt-plan-template-confirm'] = () => {
    const mdl = window.__kiwiPlanningModal;
    if (!mdl?.el) return;
    const name = mdl.el.querySelector('[data-kt-template-name]')?.value.trim();
    if (!name) return;
    const ctx = planningContext();
    const template = window.KiwiPlanningCore.templateFromWeek(name, ctx.members, ctx.shifts, visibleDays());
    ctx.planning.templates.push(template);
    saveCustomTeams();
    mdl.close(); window.__kiwiPlanningModal = null;
    render(); toast(planningCopy().templateDone, { type:'success' });
  };
  handlers['kt-plan-template-apply'] = (el) => {
    const host = el.closest('.eq-section');
    const id = host?.querySelector('[data-kt-template-select]')?.value;
    if (!id) return;
    const ctx = planningContext();
    const template = (ctx.planning.templates || []).find((item) => item.id === id);
    if (!template) return;
    ctx.root.shiftsByVenue[ctx.key] = window.KiwiPlanningCore.applyTemplate(template, visibleDays(), ctx.shifts, ctx.members);
    saveCustomTeams(); render(); toast(planningCopy().applyDone, { type:'success' });
  };
  handlers['kt-plan-publish'] = () => {
    const ctx = planningContext();
    const KH=window.KiwiHours,hoursKey=planningHoursKey(ctx),configured=!!KH?.isConfigured?.(hoursKey);
    const periodsByDay=configured?Object.fromEntries(ctx.period.days.map((day)=>{const resolved=KH.periodsOn(day,hoursKey);return[day,Array.isArray(resolved)?resolved:(resolved?.periods||[])];})):null;
    const holidaysByDay=planningHolidaysByDay(ctx.period.days);
    const result = window.KiwiPlanningCore.publish(ctx.planning, ctx.shifts, ctx.period.days, ctx.members, undefined, { periodsByDay, holidaysByDay });
    if (!result.ok) {
      toast(planningCopy().publishBlocked, { type:'error' });
      render();
      return;
    }
    ctx.root.planningByVenue[ctx.key] = result.planning;
    saveCustomTeams(); render(); toast(planningCopy().publishDone, { type:'success' });
  };
  /* planning-part:optimiser:0 */

  function planningRoleOptions(ctx, selected) {
    const copy = planningCopy();
    const roles = Array.from(new Set(ctx.members.map((member)=>String(member.function || member.department || '').trim()).filter(Boolean))).sort();
    return `<option value="">${esc(copy.allRoles)}</option>${roles.map((role)=>`<option value="${esc(role)}"${role===selected?' selected':''}>${esc(jobName(role))}</option>`).join('')}`;
  }
  function planningDaysInput(selected) {
    const labels=trLang()==='ar'?['ح','ن','ث','ر','خ','ج','س']:trLang()==='en'?['S','M','T','W','T','F','S']:['D','L','M','M','J','V','S'];
    const values=new Set((selected||[1,2,3,4,5]).map(Number));
    return `<div class="kt-plan-weekdays">${labels.map((label,day)=>`<label><input type="checkbox" value="${day}" data-kt-coverage-day${values.has(day)?' checked':''}><span>${esc(label)}</span></label>`).join('')}</div>`;
  }
  handlers['kt-plan-coverage'] = () => {
    const ctx=planningContext(), copy=planningCopy(), rules=(ctx.planning.coverageRules||[]).filter((rule)=>rule&&rule.active!==false);
    const rulesHtml=rules.length?`<div class="kt-coverage-list">${rules.map((rule)=>`<div class="kt-coverage-rule"><div><strong>${esc(rule.label||rule.role||copy.coverage)}</strong><span>${esc(rule.start)}–${esc(rule.end)} · ${esc(rule.role||copy.allRoles)} · ${esc(copy.minimum)} ${Number(rule.minimum)||1}</span></div><button data-activation=write class="kb ghost" data-action="kt-plan-coverage-delete" data-rule-id="${esc(rule.id)}">${esc(copy.delete)}</button></div>`).join('')}</div>`:'';
    const body=`${rulesHtml}<div class="kt-plan-form-grid"><div class="kt-plan-modal-field wide"><label>${esc(copy.label)}</label><input data-kt-coverage-label maxlength="80" placeholder="${esc(copy.labelHint)}"></div><div class="kt-plan-modal-field"><label>${esc(copy.role)}</label><select data-kt-coverage-role>${planningRoleOptions(ctx,'')}</select></div><div class="kt-plan-modal-field"><label>${esc(copy.minimum)}</label><input data-kt-coverage-min type="number" min="1" max="99" value="1"></div><div class="kt-plan-modal-field"><label>${esc(copy.start)}</label><input data-kt-coverage-start type="time" value="11:30"></div><div class="kt-plan-modal-field"><label>${esc(copy.end)}</label><input data-kt-coverage-end type="time" value="14:30"></div><div class="kt-plan-modal-field wide"><label>${esc(copy.weekdays)}</label>${planningDaysInput()}</div></div>`;
    const mdl=modal({title:copy.coverage,width:680,body,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button data-activation=write class="kb atlas" data-action="kt-plan-coverage-save">${esc(copy.addRule)}</button>`});
    mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningCoverage=mdl;
  };
  handlers['kt-plan-coverage-save'] = () => {
    const mdl=window.__kiwiPlanningCoverage, ctx=planningContext(), copy=planningCopy(); if(!mdl?.el)return;
    const start=mdl.el.querySelector('[data-kt-coverage-start]')?.value,end=mdl.el.querySelector('[data-kt-coverage-end]')?.value;
    const weekdays=Array.from(mdl.el.querySelectorAll('[data-kt-coverage-day]:checked')).map((input)=>Number(input.value));
    if(!start||!end||start===end||!weekdays.length){toast(copy.decisionFailed,{type:'error'});return;}
    const now=new Date().toISOString();
    ctx.planning.coverageRules.push({id:`cov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,label:mdl.el.querySelector('[data-kt-coverage-label]')?.value.trim().slice(0,80)||`${start}–${end}`,role:mdl.el.querySelector('[data-kt-coverage-role]')?.value||'',minimum:Math.max(1,Math.min(99,Number(mdl.el.querySelector('[data-kt-coverage-min]')?.value)||1)),start,end,weekdays,active:true,createdAt:now,updatedAt:now});
    saveCustomTeams();mdl.close();window.__kiwiPlanningCoverage=null;render();toast(copy.ruleSaved,{type:'success'});
  };
  handlers['kt-plan-coverage-delete'] = (el) => {
    const ctx=planningContext(),rule=(ctx.planning.coverageRules||[]).find((item)=>item.id===el.dataset.ruleId);if(!rule)return;
    rule.active=false;rule.updatedAt=new Date().toISOString();saveCustomTeams();window.__kiwiPlanningCoverage?.close?.();window.__kiwiPlanningCoverage=null;render();
  };
  handlers['kt-plan-open'] = () => {
    const ctx=planningContext(),copy=planningCopy(),day=visibleDays()[0]||toISO(new Date());
    const today=toISO(new Date());
    const body=`<div class="kt-plan-form-grid"><div class="kt-plan-modal-field"><label>${esc(copy.date)}</label><input data-kt-open-day type="date" min="${esc(today)}" value="${esc(day<today?today:day)}"></div><div class="kt-plan-modal-field"><label>${esc(copy.role)}</label><select data-kt-open-role>${planningRoleOptions(ctx,'')}</select></div><div class="kt-plan-modal-field"><label>${esc(copy.start)}</label><input data-kt-open-start type="time" value="09:00"></div><div class="kt-plan-modal-field"><label>${esc(copy.end)}</label><input data-kt-open-end type="time" value="17:00"></div><div class="kt-plan-modal-field wide"><label>${esc(copy.label)}</label><input data-kt-open-note maxlength="160"></div></div>`;
    const mdl=modal({title:copy.openShift,width:620,body,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button data-activation=write class="kb atlas" data-action="kt-plan-open-save">${esc(copy.openShift)}</button>`});mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningOpen=mdl;
  };
  handlers['kt-plan-open-save'] = () => {
    const mdl=window.__kiwiPlanningOpen,ctx=planningContext(),P=window.KiwiPlanningCore,copy=planningCopy();if(!mdl?.el||!P)return;
    const result=P.createOpenShift(ctx.planning,{day:mdl.el.querySelector('[data-kt-open-day]')?.value,start:mdl.el.querySelector('[data-kt-open-start]')?.value,end:mdl.el.querySelector('[data-kt-open-end]')?.value,role:mdl.el.querySelector('[data-kt-open-role]')?.value||'',note:mdl.el.querySelector('[data-kt-open-note]')?.value||''});if(!result.ok){toast(copy.decisionFailed,{type:'error'});return;}
    ctx.root.planningByVenue[ctx.key]=result.planning;saveCustomTeams();mdl.close();window.__kiwiPlanningOpen=null;render();toast(copy.openSaved,{type:'success'});
  };

  handlers['kt-plan-requests'] = () => {
    const copy = planningCopy();
    const ctx = planningContext();
    const pending = (ctx.planning.requests || []).filter((request) => request.status === 'pending');
    const openClaims=(ctx.planning.openShifts||[]).filter((shift)=>shift.status==='claimed');
    const swapClaims=(ctx.planning.swapRequests||[]).filter((request)=>request.status==='claimed');
    const byId = new Map(ctx.members.map((member) => [member.id, member]));
    const standard=pending.map((request) => {
      const member = byId.get(request.memberId);
      const range = request.type === 'leave' ? `${request.startDate} → ${request.endDate}` : `${(request.weekdays || []).join(', ')} · ${request.start || '·'} → ${request.end || '·'}`;
      return `<article class="kt-plan-request"><div class="kt-plan-request-head"><div><strong>${esc(member ? memberFullName(member) : request.memberId)}</strong><div>${esc(request.type === 'leave' ? copy.leave : copy.availability)} · ${esc(range)}</div></div></div>${request.reason ? `<p>${esc(request.reason)}</p>` : ''}<div class="kt-plan-request-actions"><button class="kb atlas" data-action="kt-plan-request-decision" data-kind="request" data-rid="${esc(request.id)}" data-decision="approved">${esc(copy.approve)}</button><button class="kb ghost" data-action="kt-plan-request-decision" data-kind="request" data-rid="${esc(request.id)}" data-decision="rejected">${esc(copy.reject)}</button></div></article>`;
    });
    const opportunities=openClaims.map((shift)=>{const member=byId.get(shift.claimantId);return `<article class="kt-plan-request"><div class="kt-plan-request-head"><div><strong>${esc(copy.openClaim)} · ${esc(member?memberFullName(member):shift.claimantId)}</strong><div>${esc(shift.day)} · ${esc(shift.start)}–${esc(shift.end)} · ${esc(shift.role||copy.allRoles)}</div></div></div><div class="kt-plan-request-actions"><button class="kb atlas" data-action="kt-plan-request-decision" data-kind="open" data-rid="${esc(shift.id)}" data-decision="approved">${esc(copy.approve)}</button><button class="kb ghost" data-action="kt-plan-request-decision" data-kind="open" data-rid="${esc(shift.id)}" data-decision="rejected">${esc(copy.reject)}</button></div></article>`;})
      .concat(swapClaims.map((request)=>{const owner=byId.get(request.memberId),claimant=byId.get(request.claimantId);return `<article class="kt-plan-request"><div class="kt-plan-request-head"><div><strong>${esc(copy.swap)} · ${esc(owner?memberFullName(owner):request.memberId)} ↔ ${esc(claimant?memberFullName(claimant):request.claimantId)}</strong><div>${esc(request.day)} ↔ ${esc(request.offeredDay)}</div></div></div><div class="kt-plan-request-actions"><button class="kb atlas" data-action="kt-plan-request-decision" data-kind="swap" data-rid="${esc(request.id)}" data-decision="approved">${esc(copy.approve)}</button><button class="kb ghost" data-action="kt-plan-request-decision" data-kind="swap" data-rid="${esc(request.id)}" data-decision="rejected">${esc(copy.reject)}</button></div></article>`;}));
    const all=standard.concat(opportunities);
    const body = all.length ? `<div class="kt-plan-request-list">${all.join('')}</div>` : `<p>${esc(copy.empty)}</p>`;
    const mdl = modal({ title:copy.review, width:620, body, foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button>` });
    mdl.el.addEventListener('click', (event) => { if (event.target.closest('[data-dismiss]')) mdl.close(); });
    window.__kiwiPlanningRequests = mdl;
  };
  handlers['kt-plan-request-decision'] = (el) => {
    const ctx = planningContext();
    const kind=el.dataset.kind||'request';
    if(kind==='open'||kind==='swap'){
      const result=kind==='open'?window.KiwiPlanningCore.decideOpenShift(ctx.planning,ctx.shifts,el.dataset.rid,el.dataset.decision,ctx.members):window.KiwiPlanningCore.decideSwap(ctx.planning,ctx.shifts,el.dataset.rid,el.dataset.decision,ctx.members);
      if(!result.ok){toast(planningCopy().decisionFailed,{type:'error'});return;}
      ctx.root.planningByVenue[ctx.key]=result.planning;ctx.root.shiftsByVenue[ctx.key]=result.shifts;saveCustomTeams();window.__kiwiPlanningRequests?.close?.();window.__kiwiPlanningRequests=null;render();toast(el.dataset.decision==='approved'?planningCopy().approved:planningCopy().rejected,{type:'success'});return;
    }
    const request = (ctx.planning.requests || []).find((item) => item.id === el.dataset.rid);
    if (!request || request.status !== 'pending') return;
    request.status = el.dataset.decision === 'approved' ? 'approved' : 'rejected';
    request.updatedAt = new Date().toISOString();
    if (request.status === 'approved' && request.type === 'availability') {
      const current = ctx.planning.availability[request.memberId] || { weekdays:{} };
      (request.weekdays || []).forEach((weekday) => { current.weekdays[String(weekday)] = { available:request.available !== false, start:request.start || '', end:request.end || '' }; });
      current.updatedAt = request.updatedAt;
      ctx.planning.availability[request.memberId] = current;
    }
    saveCustomTeams();
    window.__kiwiPlanningRequests?.close?.(); window.__kiwiPlanningRequests = null;
    render(); toast(request.status === 'approved' ? planningCopy().approved : planningCopy().rejected, { type:'success' });
  };

  handlers['kt-plan-week'] = (_el, dir) => {
    closeShiftPop();
    const chunks = weekChunks(buildPeriod(memberState.current().periodKind || 'week').days);
    const next = planWeekIdx + (dir === 'next' ? 1 : -1);
    if (next < 0 || next >= chunks.length) return;
    planWeekIdx = next;
    render();
  };

  handlers['kt-period-nav'] = (_el, dir) => {
    closeShiftPop();
    const root = memberState.current();
    const kind = root.periodKind || 'week';
    if (!Object.prototype.hasOwnProperty.call(periodOffsets, kind)) return;
    if (dir === 'current') periodOffsets[kind] = 0;
    else periodOffsets[kind] += dir === 'next' ? 1 : -1;
    const period = buildPeriod(kind);
    restorePeriodLock(root, kind, period);
    planWeekIdx = periodOffsets[kind] === 0 ? weekIdxForToday(period.days) : 0;
    render();
  };

  /* ── ÉDITEUR DE SERVICE ──────────────────────────────────────────────────
   * Deux heures exactes ne tiennent pas dans une colonne de 90 px, et la
   * grille ne doit plus déborder de la carte : la saisie se fait donc dans un
   * petit éditeur ancré sur la case. Il dit à voix haute ce qu'une case ne
   * peut que suggérer — la durée, et surtout le JOUR où le service se termine
   * quand il passe minuit. « Appliquer à toute la semaine » évite d'ouvrir
   * sept fois le même éditeur pour quelqu'un qui fait les mêmes horaires du
   * lundi au dimanche. */
  /* planning-part:shift-editor:0 */
  function visibleDays() {
    const chunks = weekChunks(buildPeriod(memberState.current().periodKind || 'week').days);
    return chunks[Math.min(Math.max(planWeekIdx, 0), chunks.length - 1)] || [];
  }
  /* planning-part:shift-editor:1 */

  /* planning-part:payroll-view:2 */

  /* ═══════════════ HOURS HANDLERS ═══════════════ */
  handlers['kt-period'] = (_el, kind) => {
    if (!['week', 'fortnight', 'month'].includes(kind)) return;
    const root = memberState.current();
    const previousKind = root.periodKind || 'week';
    root.periodKind = kind;
    periodOffsets[kind] = 0;
    const targetPeriod = buildPeriod(kind);
    restorePeriodLock(root, kind, targetPeriod);
    planWeekIdx = weekIdxForToday(targetPeriod.days);   // nouvelle période ⇒ on retombe sur la semaine en cours
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const vt = teamKey(venue);
    const period = buildPeriod(kind);
    const members = getMembers(vt);
    const hours = memberState.current().hoursByVenue[vt] || (memberState.current().hoursByVenue[vt] = {});
    members.forEach(m => {
      if (!hours[m.id]) hours[m.id] = {};
      period.days.forEach(d => {
        if (hours[m.id][d] == null) {
          /* La démo se remplit d'heures plausibles pour montrer une grille
           * vivante. Une VRAIE boutique doit rester à zéro : ce back-fill
           * inventait 4 à 8 h par personne et par jour dès qu'on touchait une
           * pastille de période, et payrollFigures les additionnait ensuite en
           * « à payer · période » — un salaire chiffré sur des services que
           * personne n'a faits. ensureVenueData() se garde déjà de ça ; ce
           * second chemin avait été oublié. */
          if (isCustomVenue()) { hours[m.id][d] = 0; return; }
          const isOff = (Math.floor(Math.random() * 7) === 0);
          hours[m.id][d] = isOff ? 0 : (4 + Math.floor(Math.random() * 5)) + (Math.random() < 0.3 ? 0.5 : 0);
        }
      });
    });
    render();
  };

  handlers['kt-quick-entry'] = () => {
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    if (!members.length) { Kiwi.toast('·', { type: 'info' }); return; }
    const today = toISO(new Date());
    const qe = modal({
      title: T.qeTitle,
      width: 460,
      body: `
        <style>${MODAL_CSS}</style>
        <div class="kt-qe-form">
          <label><span class="l">${esc(T.qeMember)}</span>
            <select name="member" data-kt-qe-member>${members.map(m => `<option value="${esc(m.id)}">${esc(memberFullName(m))} · ${esc(jobName(m.function))}</option>`).join('')}</select>
          </label>
          <div class="kt-fgrid-2">
            <label><span class="l">${esc(T.qeDate)}</span><input type="date" data-kt-qe-date value="${esc(today)}" /></label>
            <label><span class="l">${esc(T.qeHours)}</span><input type="number" data-kt-qe-hours min="0" max="24" step="0.25" value="8" /></label>
          </div>
          <label><span class="l">${esc(T.qeNote)}</span><input type="text" data-kt-qe-note placeholder="·" /></label>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>${esc(T.cancel)}</button>
        <button data-activation=write class="kb atlas" data-action="kt-qe-save">${svgIcon(IC.check, 13)}${esc(T.qeSave)}</button>
      `,
    });
    qe.el.addEventListener('click', (e) => { if (e.target.closest('[data-dismiss]')) qe.close(); });
    window.__kiwiTeamQuickEntry = qe;
  };

  handlers['kt-qe-save'] = () => {
    const T = t();
    const qe = window.__kiwiTeamQuickEntry; if (!qe || !qe.el) return;
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const vt = teamKey(venue);
    const mid = qe.el.querySelector('[data-kt-qe-member]')?.value;
    const date = qe.el.querySelector('[data-kt-qe-date]')?.value;
    const hVal = parseFloat(qe.el.querySelector('[data-kt-qe-hours]')?.value) || 0;
    if (!mid || !date) { Kiwi.toast('·', { type: 'pend' }); return; }
    const hours = memberState.current().hoursByVenue[vt] || (memberState.current().hoursByVenue[vt] = {});
    if (!hours[mid]) hours[mid] = {};
    hours[mid][date] = hVal;
    const m = getMembers(vt).find(x => x.id === mid);
    qe.close();
    window.__kiwiTeamQuickEntry = null;
    if (live.pageActive) render();
    Kiwi.toast(T.tHourSaved(memberFullName(m || {}), hVal, date), { type: 'success' });
  };

  handlers['kt-export-csv'] = () => {
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const key = teamKey(venue), members = getMembers(key), hours = getHours(key);
    const period = buildPeriod(memberState.current().periodKind || 'week');
    const csv = (value) => {
      let safe = String(value == null ? '' : value);
      /* Excel, Numbers and LibreOffice may execute cells beginning with a
         formula sigil. Employee names/roles are merchant data, so keep them
         literal even when somebody is genuinely called "@samir". */
      if (/^[=+\-@]/.test(safe)) safe = "'" + safe;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [[
      'Période début', 'Période fin', 'ID membre', 'Employé', 'Fonction',
      'Date', 'Heures', 'Taux horaire MAD', 'Coût heures MAD', 'Salaire de base MAD',
    ]];
    let totalHours = 0;
    members.forEach((member) => {
      /* Un salarié avec un taux : ses heures du contrat sont dans le salaire,
         une heure isolée n'a donc pas de coût propre. La ligne « Total
         période » porte ce que le taux paie vraiment, au-delà du contrat. */
      const split = (+member.baseSalary || 0) > 0 && (+member.hourlyRate || 0) > 0;
      let own = 0;
      period.days.forEach((day) => {
        const value = Math.max(0, +(hours[member.id] || {})[day] || 0);
        totalHours += value;
        own += value;
        rows.push([
          period.start, period.end, member.id, memberFullName(member), member.function || '', day,
          value.toFixed(2), (+member.hourlyRate || 0).toFixed(2),
          split ? '' : (value * (+member.hourlyRate || 0)).toFixed(2), (+member.baseSalary || 0).toFixed(2),
        ]);
      });
      if (split) {
        rows.push([
          period.start, period.end, member.id, memberFullName(member), member.function || '',
          `Total période (contrat ${contractWeekHours(member)} h / semaine)`,
          own.toFixed(2), (+member.hourlyRate || 0).toFixed(2),
          hourlyPayFor(member, own, period.days).toFixed(2), (+member.baseSalary || 0).toFixed(2),
        ]);
      }
    });
    const content = '\uFEFF' + rows.map((row) => row.map(csv).join(';')).join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    const slug = String(venue.slug || venue.id || venue.type || 'kiwi').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const filename = `kiwi-paie-${slug}-${period.start}-${period.end}.csv`;
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Kiwi.toast(T.tExport, { type: 'success', desc: T.tExportDesc });
    /* The file is created locally first. The command is only the durable audit
       hand-off; a provider failure can never eat the merchant's export. */
    window.KiwiOperations?.create?.('payroll', 'export-payroll', {
      format: 'csv', filename, periodStart: period.start, periodEnd: period.end,
      teamCount: members.length, rowCount: rows.length - 1, totalHours,
    }).catch(() => {});
  };
  /* ── CSV import: the export, read back ─────────────────────────────────────
   * The button used to answer « Glissez votre fichier · vérification
   * automatique des en-têtes » with no file picker behind it. It now reads the
   * file kt-export-csv writes (or a sheet with the same columns): one row per
   * employee × day, matched on « ID membre » first, then on the full name. The
   * merchant sees what will change before anything is written, and a validated
   * period refuses the import like it refuses a hand edit. */
  /* planning-part:csv-import:0 */
  handlers['kt-validate-period'] = () => {
    const T = t();
    const root = memberState.current();
    if (root.periodLocked) return;
    const period = buildPeriod(root.periodKind);
    setPeriodLock(root, root.periodKind, period, true);
    if (live.pageActive) render();
    Kiwi.toast(T.tValidated(period.startFr, period.endFr), { type: 'success', desc: T.tValidatedDesc });
  };
  handlers['kt-unlock-period'] = () => {
    const T = t();
    const root = memberState.current();
    if (!root.periodLocked) return;
    const period = buildPeriod(root.periodKind);
    setPeriodLock(root, root.periodKind, period, false);
    if (live.pageActive) render();
    Kiwi.toast(T.tUnlocked(period.startFr, period.endFr), { type: 'success', desc: T.tUnlockedDesc });
  };

  /* ═══════════════ PAIE & PLANNING ═══════════════
   * Same roster, second surface. Équipe answers "who works here"; this answers
   * "who worked when, and what do I owe them". It was the last page in the
   * sidebar still showing the "Encore rien ici" starter no matter how many people
   * the owner had hired — because the starter layer never released it AND the old
   * payroll code read the demo STAFF literal in venues.js, not this roster. So
   * even unlocking it would have shown Café Atlas's waiters to a boutique.
   *
   * Built from what already exists and is already correct: buildPeriod for the
   * pay period, hoursByVenue for the grid, and each member's own hourlyRate /
   * baseSalary. The planning grid IS the hours grid — one number per person per
   * day is both "who is on Tuesday" and "what Tuesday costs" — so entering hours
   * here and in Équipe → Heures travaillées writes the same record, and validating
   * a period locks it in both places. */
  /* Les quatre tuiles de Paie & planning, en un seul endroit : le rendu et la
   * mise à jour pendant la saisie lisaient chacun leurs chiffres. */
  /* planning-part:payroll-view:3 */

  /* La grille de planning : une personne par ligne, un service par jour. Le
   * coût prévu tombe du taux horaire du membre, donc le commerçant voit ce que
   * la semaine va coûter AVANT de la faire — c'est tout l'intérêt de planifier
   * plutôt que de constater. « Reporter sur les heures » recopie le planifié
   * dans la grille des heures réelles, seule à alimenter la paie : le planning
   * ne paie personne tout seul, sinon une semaine prévue mais pas travaillée
   * partirait en salaire. */
  /* Une case = l'état du jour, lisible sans l'ouvrir : deux heures empilées,
   * « Repos », ou rien du tout. Le badge +1 dit que le service déborde sur le
   * lendemain, et le title l'écrit en toutes lettres. */
  /* planning-part:shift-editor:2 */

  /* Le planning ne glisse plus sous la souris : la grille tient dans la carte.
   * Colonnes en largeur fixe (table-layout: fixed) et UNE semaine à l'écran —
   * sur une quinzaine ou un mois, 14 ou 31 colonnes ne rentrent nulle part, on
   * passe de semaine en semaine au lieu de faire défiler le tableau. Les
   * totaux, eux, restent ceux de la période entière : c'est exactement ce que
   * « Reporter sur les heures » ira écrire. */
  function weekChunks(days) {
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out.length ? out : [[]];
  }
  /* Sur « Ce mois », s'ouvrir au 1er juillet quand on est le 25 obligeait à
   * cliquer quatre fois pour retrouver sa semaine. On ouvre sur aujourd'hui. */
  function weekIdxForToday(days) {
    const today = toISO(new Date());
    const i = days.indexOf(today);
    return i < 0 ? 0 : Math.floor(i / 7);
  }

  function planningCopy() {
    const lang = trLang();
    if (lang === 'en') return { draft:'Draft', published:'Published', changed:'Changes to publish', save:'Save as template', apply:'Apply template', requests:'Requests', publish:'Publish schedule', noTemplate:'No template', healthy:'Ready to publish', emptyPlan:'Nothing planned yet', blocked:(n)=>`${n} conflict${n===1?'':'s'} to resolve`, pending:(n)=>`${n} pending request${n===1?'':'s'}`, templateTitle:'Save this week', templateName:'Template name', saveNow:'Save template', review:'Review requests', empty:'No pending request.', approve:'Approve', reject:'Reject', approved:'Request approved.', rejected:'Request rejected.', leave:'Leave', availability:'Availability', publishDone:'Schedule published to the employee app.', templateDone:'Template saved.', applyDone:'Template applied. Review it before publishing.', publishBlocked:'Publishing is blocked until every conflict is resolved.', coverage:'Coverage rules', rules:(n)=>`${n} coverage rule${n===1?'':'s'}`, labelHint:'e.g. Lunch service', claims:(n)=>`${n} claim${n===1?'':'s'} received`, more:(n)=>`+${n} more`, openShift:'Open shift', planned:'Planned', worked:'Worked', gaps:'Coverage gaps', opportunities:'Open opportunities', warnings:'Warnings', addRule:'Add a coverage rule', minimum:'Minimum team', role:'Role', allRoles:'All roles', weekdays:'Days', start:'Start', end:'End', date:'Date', label:'Label', delete:'Delete', ruleSaved:'Coverage rule saved.', openSaved:'Open shift shared with employees.', openClaim:'Open shift claim', swap:'Shift exchange', decisionFailed:'The change cannot be approved because it conflicts with the current schedule.' };
    if (lang === 'ar') return { draft:'مسودة', published:'منشور', changed:'تغييرات تنتظر النشر', save:'حفظ كنموذج', apply:'تطبيق النموذج', requests:'الطلبات', publish:'نشر الجدول', noTemplate:'لا يوجد نموذج', healthy:'جاهز للنشر', emptyPlan:'لا شيء مخطط بعد', blocked:(n)=>n===1?'تعارض واحد يجب حله':`${n} تعارضات يجب حلها`, pending:(n)=>n===1?'طلب واحد معلق':`${n} طلبات معلقة`, templateTitle:'حفظ هذا الأسبوع', templateName:'اسم النموذج', saveNow:'حفظ النموذج', review:'مراجعة الطلبات', empty:'لا توجد طلبات معلقة.', approve:'موافقة', reject:'رفض', approved:'تمت الموافقة على الطلب.', rejected:'تم رفض الطلب.', leave:'إجازة', availability:'أوقات التوفر', publishDone:'تم نشر الجدول في تطبيق الموظفين.', templateDone:'تم حفظ النموذج.', applyDone:'تم تطبيق النموذج. راجعه قبل النشر.', publishBlocked:'يجب حل جميع التعارضات قبل النشر.', coverage:'قواعد التغطية', rules:(n)=>n===1?'قاعدة تغطية واحدة':`${n} قواعد تغطية`, labelHint:'مثال: خدمة الغداء', claims:(n)=>n===1?'ترشيح واحد':`${n} ترشيحات`, more:(n)=>`+${n} أخرى`, openShift:'وردية شاغرة', planned:'مخطط', worked:'منجز', gaps:'نقص التغطية', opportunities:'فرص مفتوحة', warnings:'تنبيهات', addRule:'إضافة قاعدة تغطية', minimum:'الحد الأدنى للفريق', role:'الوظيفة', allRoles:'كل الوظائف', weekdays:'الأيام', start:'البداية', end:'النهاية', date:'التاريخ', label:'التسمية', delete:'حذف', ruleSaved:'تم حفظ قاعدة التغطية.', openSaved:'تم نشر الوردية الشاغرة للموظفين.', openClaim:'طلب وردية شاغرة', swap:'تبادل وردية', decisionFailed:'لا يمكن اعتماد التغيير لأنه يتعارض مع الجدول الحالي.' };
    return { draft:'Brouillon', published:'Publié', changed:'Modifications à publier', save:'Enregistrer comme modèle', apply:'Appliquer le modèle', requests:'Demandes', publish:'Publier le planning', noTemplate:'Aucun modèle', healthy:'Prêt à publier', emptyPlan:'Rien de planifié pour l’instant', blocked:(n)=>`${n} conflit${n===1?'':'s'} à résoudre`, pending:(n)=>`${n} demande${n===1?'':'s'} en attente`, templateTitle:'Enregistrer cette semaine', templateName:'Nom du modèle', saveNow:'Enregistrer le modèle', review:'Examiner les demandes', empty:'Aucune demande en attente.', approve:'Approuver', reject:'Refuser', approved:'Demande approuvée.', rejected:'Demande refusée.', leave:'Congé', availability:'Disponibilités', publishDone:'Planning publié dans l’application employé.', templateDone:'Modèle enregistré.', applyDone:'Modèle appliqué. Vérifiez-le avant publication.', publishBlocked:'La publication reste bloquée tant que les conflits ne sont pas résolus.', coverage:'Règles de couverture', rules:(n)=>`${n} règle${n===1?'':'s'} de couverture`, labelHint:'ex. Service du midi', claims:(n)=>`${n} candidature${n===1?'':'s'} reçue${n===1?'':'s'}`, more:(n)=>`+${n} autre${n===1?'':'s'}`, openShift:'Service à pourvoir', planned:'Planifié', worked:'Réalisé', gaps:'Manques de couverture', opportunities:'Opportunités ouvertes', warnings:'Alertes', addRule:'Ajouter une règle de couverture', minimum:'Équipe minimum', role:'Fonction', allRoles:'Toutes les fonctions', weekdays:'Jours', start:'Début', end:'Fin', date:'Date', label:'Libellé', delete:'Supprimer', ruleSaved:'Règle de couverture enregistrée.', openSaved:'Service partagé avec les employés.', openClaim:'Candidature à un service', swap:'Échange de service', decisionFailed:'Ce changement ne peut pas être approuvé car il entre en conflit avec le planning actuel.' };
  }
  /* planning-part:optimiser:1 */
  /* « 2026-10-05 » dans une phrase lue par un gérant : on écrit « lun. 05/10 ». */
  function planIssueDay(day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!m) return day || '';
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    const lang = trLang();
    const wd = dt.toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar-MA' : 'fr-FR', { weekday: 'short' });
    return wd + ' ' + m[3] + '/' + m[2];
  }
  function issueLabel(issue) {
    /* Un manque de couverture ne vise personne : il vise une règle. Sans ce
     * repli, la ligne s'ouvrait sur la date et ne disait pas quelle règle. */
    const who = issue.memberName || issue.memberId || issue.label;
    const labels = trLang() === 'en'
      ? { 'approved-leave':'is on approved leave', unavailable:'is marked unavailable', 'outside-availability':'is scheduled outside availability', 'outside-contract':'is outside the contract period', overlap:'has overlapping shifts', 'unknown-member':'is no longer on the team', 'empty-schedule':'No shift or day off has been entered', 'coverage-gap':`coverage short: ${issue.scheduled}/${issue.required}`, 'long-shift':'has a long shift', 'weekly-hours':'exceeds the weekly-hour alert', 'short-rest':'has too little rest', 'open-shift':'still has an open shift', 'closed-day':'is scheduled while the venue is closed', 'outside-opening-hours':'is scheduled outside opening hours', 'public-holiday':`is scheduled on ${issue.holiday}; review compensation` }
      : trLang() === 'ar'
        ? { 'approved-leave':'في إجازة معتمدة', unavailable:'غير متاح في هذا اليوم', 'outside-availability':'مجدول خارج أوقات توفره', 'outside-contract':'خارج مدة العقد', overlap:'لديه فترات عمل متداخلة', 'unknown-member':'لم يعد ضمن الفريق', 'empty-schedule':'لم يتم إدخال أي وردية أو يوم راحة', 'coverage-gap':`نقص في التغطية: ${issue.scheduled}/${issue.required}`, 'long-shift':'لديه وردية طويلة', 'weekly-hours':'تجاوز حد الساعات الأسبوعية', 'short-rest':'فترة الراحة غير كافية', 'open-shift':'لديه وردية شاغرة', 'closed-day':'مجدول في يوم تكون فيه المؤسسة مغلقة', 'outside-opening-hours':'مجدول خارج ساعات فتح المؤسسة', 'public-holiday':`مجدول خلال ${issue.holiday}؛ راجع التعويض` }
        : { 'approved-leave':'est en congé approuvé', unavailable:'est indisponible ce jour', 'outside-availability':'est planifié hors disponibilité', 'outside-contract':'est hors période de contrat', overlap:'a des services qui se chevauchent', 'unknown-member':"n’est plus dans l’équipe", 'empty-schedule':'Aucun service ni jour de repos n’a été saisi', 'coverage-gap':`couverture insuffisante : ${issue.scheduled}/${issue.required}`, 'long-shift':'a un service long', 'weekly-hours':'dépasse l’alerte hebdomadaire', 'short-rest':'a trop peu de repos', 'open-shift':'a encore un service à pourvoir', 'closed-day':'est planifié alors que l’établissement est fermé', 'outside-opening-hours':'est planifié hors horaires d’ouverture', 'public-holiday':`est planifié pendant ${issue.holiday} ; vérifiez la compensation` };
    const day = issue.code === 'empty-schedule' ? '' : planIssueDay(issue.day);
    return [who, day, labels[issue.code] || issue.code].filter(Boolean).join(' · ');
  }

  function renderPlanningPane(T, venue, venueType, members, options = {}) {
    /* Managers build and publish shifts, but salary rates and projected labour
     * cost remain owner-only. One renderer keeps the operational plan identical
     * while removing the financial column at the source (not merely with CSS). */
    const showCosts = options.showCosts !== false;
    const root = memberState.current();
    const period = buildPeriod(root.periodKind || 'week');
    const shifts = root.shiftsByVenue[venueType] || (root.shiftsByVenue[venueType] = {});
    const locked = root.periodLocked;
    const P = window.KiwiPlanningCore;
    const planning = root.planningByVenue[venueType] || (root.planningByVenue[venueType] = P?.blank?.() || {});
    const copy = planningCopy();
    const optimizeCopy = optimizationCopy();
    const fairCopy = fairScheduleCopy();
    const lifecycle = P?.status?.(planning, shifts, period.days) || { state:'draft' };
    const ctx={venue,key:venueType};
    const calendarMeta=planningPeriodMeta(period.days,ctx);
    const periodsByDay=Object.fromEntries(period.days.map((day)=>[day,calendarMeta[day]?.periods||[]]));
    const holidaysByDay=planningHolidaysByDay(period.days);
    const hoursConfigured=Object.values(calendarMeta).some((meta)=>meta.configured);
    const issues = P?.validate?.({ planning, shifts, days:period.days, members, periodsByDay:hoursConfigured?periodsByDay:null, holidaysByDay }) || [];
    const blockers=issues.filter((issue)=>issue.severity==='blocker');
    const warnings=issues.filter((issue)=>issue.severity!=='blocker');
    /* La liste est tronquée à six lignes. `validate()` sort les alertes avant
     * les bloquants, donc la troncature cachait précisément ce qui empêche de
     * publier — on remonte les bloquants et on annonce le reste. */
    /* Une semaine où rien n'est encore saisi n'est pas « 1 conflit à
     * résoudre » : c'est un planning à composer. Le blocage de publication
     * reste (publier du vide n'a pas de sens), mais la page ne le compte plus
     * comme un conflit, et la ligne ne s'épingle plus au lundi en ISO. */
    const emptyPlan=blockers.length===1&&blockers[0].code==='empty-schedule';
    const conflictCount=blockers.length-(emptyPlan?1:0);
    const shownIssues=blockers.concat(warnings).slice(0,6);
    const hiddenIssues=Math.max(0,issues.length-shownIssues.length);
    const pending = (planning.requests || []).filter((request) => request.status === 'pending');
    const opportunityClaims=(planning.openShifts||[]).filter((item)=>item.status==='claimed').length+(planning.swapRequests||[]).filter((item)=>item.status==='claimed').length;
    const coverage=P?.coverageSummary?.({planning,shifts,days:period.days,members,periodsByDay:hoursConfigured?periodsByDay:null})||[];
    const coverageGaps=coverage.reduce((sum,row)=>sum+(Number(row.gap)||0),0);
    /* `coverage` liste les manques, pas les règles : une seule règle appliquée
     * sur sept jours en rend sept. La tuile annonçait donc « 7 règles de
     * couverture » à un patron qui n'en avait écrit qu'une — et serait retombée
     * à « 0 règles » le jour où le planning est enfin complet. */
    const coverageRuleCount=(planning.coverageRules||[]).filter((rule)=>rule&&rule.active!==false).length;
    const openOpportunities=(planning.openShifts||[]).filter((item)=>['open','claimed'].includes(item.status)).length+(planning.swapRequests||[]).filter((item)=>['open','claimed'].includes(item.status)).length;
    let grandH = 0, grandCostC = 0;
    let workedH=0;
    const realised=root.hoursByVenue[venueType]||{};
    members.forEach((member)=>period.days.forEach((day)=>{workedH+=Number(realised[member.id]&&realised[member.id][day])||0;}));

    const chunks = weekChunks(period.days);
    if (planWeekIdx >= chunks.length) planWeekIdx = chunks.length - 1;
    if (planWeekIdx < 0) planWeekIdx = 0;
    const view = chunks[planWeekIdx];
    const multiWeek = chunks.length > 1;

    const headDays = view.map((d) => {
      const dt = fromISO(d);
      const dayLbl = dt.toLocaleDateString(dateLocale(), { weekday: 'short' });
      const meta=calendarMeta[d],hours=!meta.configured?({fr:'À configurer',en:'Not set',ar:'غير مضبوط'}[trLang()]||'À configurer'):meta.closed?({fr:'Fermé',en:'Closed',ar:'مغلق'}[trLang()]||'Fermé'):compactPeriods(meta.periods);
      const special=meta.exception?.label||meta.holiday?.label||'';
      return `<th class="kt-day-head${meta.closed?' is-closed':''}${meta.holiday?' is-holiday':''}" title="${esc([special,hours].filter(Boolean).join(' · '))}"><span class="d">${pad(dt.getDate())}</span><span class="m">${dayLbl}</span><span class="kt-day-hours">${esc(hours)}</span>${special?`<span class="kt-day-special">${esc(special)}</span>`:''}</th>`;
    }).join('');

    let anyNextDay = false;
    const rows = members.map((m) => {
      const row = shifts[m.id] || {};
      /* Le total de la ligne couvre la PÉRIODE, pas la semaine affichée : c'est
       * le chiffre que les tuiles du haut annoncent et que la paie recevra. */
      let h = 0;
      period.days.forEach((d) => { h += shiftHours(row[d]); });
      const cells = view.map((d) => {
        if (shiftIsNextDay(row[d])) anyNextDay = true;
        return planCellHtml(T, m, d, row[d], locked, calendarMeta[d]);
      }).join('');
      const cost = hourlyPayFor(m, h, period.days);
      grandH += h; grandCostC += payCents(cost);
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
          <td class="kt-h-total mono"><b>${fmtHours(h)}</b></td>
          ${showCosts ? ((+m.hourlyRate || 0) > 0 ? `<td class="kt-h-pay mono"><b>${fmtPay(cost)}</b><span>MAD</span></td>` : `<td class="kt-h-pay mono"><b title="${esc(T.noRate)}">·</b></td>`) : ''}
        </tr>`;
    }).join('');

    const cols = `<colgroup><col class="kt-plan-col-mem">${view.map(() => '<col>').join('')}<col class="kt-plan-col-tot">${showCosts ? '<col class="kt-plan-col-tot">' : ''}</colgroup>`;
    const stepper = multiWeek ? `
      <div class="kt-plan-step">
        <button class="kt-plan-arrow" type="button" data-action="kt-plan-week" data-arg="prev"
          aria-label="${esc(T.plPrevWeek)}" ${planWeekIdx === 0 ? 'disabled' : ''}>‹</button>
        <span class="kt-plan-steplbl mono">${esc(T.plWeekOf(fmtFr(fromISO(view[0])), fmtFr(fromISO(view[view.length - 1]))))}</span>
        <button class="kt-plan-arrow" type="button" data-action="kt-plan-week" data-arg="next"
          aria-label="${esc(T.plNextWeek)}" ${planWeekIdx >= chunks.length - 1 ? 'disabled' : ''}>›</button>
      </div>` : '';

    const stateText = lifecycle.state === 'published' ? copy.published : lifecycle.state === 'changed' ? copy.changed : copy.draft;
    const qualityText = emptyPlan ? copy.emptyPlan : blockers.length ? copy.blocked(blockers.length) : copy.healthy;
    const templates = planning.templates || [];
    const specialDays=period.days.map((day)=>calendarMeta[day]).filter((meta)=>meta.exception||meta.holiday);
    const calendarCopy=trLang()==='en'
      ? {title:'Business calendar',ready:'Weekly opening hours, exceptions and public holidays are reflected below.',missing:'Set opening days before building the team schedule.',edit:'Edit hours',holiday:'Public holiday',review:'Review compensation policy'}
      : trLang()==='ar'
        ? {title:'تقويم المؤسسة',ready:'تظهر ساعات الفتح والاستثناءات والعطل الرسمية في الجدول.',missing:'حدد أيام وساعات العمل قبل إعداد جدول الفريق.',edit:'تعديل الساعات',holiday:'عطلة رسمية',review:'راجع سياسة التعويض'}
        : {title:'Calendrier de l’établissement',ready:'Horaires, fermetures exceptionnelles et jours fériés sont intégrés au planning.',missing:'Renseignez les jours d’ouverture avant de composer le planning.',edit:'Modifier les horaires',holiday:'Jour férié',review:'Vérifier la compensation'};
    const calendarBridge=`<div class="kt-calendar-bridge ${hoursConfigured?'is-ready':'is-missing'}"><i></i><div><strong>${esc(calendarCopy.title)}</strong><span>${esc(hoursConfigured?calendarCopy.ready:calendarCopy.missing)}</span>${specialDays.length?`<small>${specialDays.slice(0,3).map((meta)=>`${esc(fromISO(meta.day).toLocaleDateString(dateLocale(),{weekday:'short',day:'numeric',month:'short'}))} · ${esc(meta.exception?.label||meta.holiday?.label||calendarCopy.holiday)}${meta.holiday&&!meta.exception?' · '+esc(calendarCopy.review):''}`).join('<br>')}</small>`:''}</div><button class="btn-slim" type="button" data-action="kt-plan-hours">${esc(calendarCopy.edit)}</button></div>`;
    const planningCommand = `
      ${calendarBridge}
      <div class="kt-planning-command">
        <div class="kt-planning-health">
          <span class="kt-plan-state ${esc(lifecycle.state)}"><i></i>${esc(stateText)}</span>
          <div><strong>${esc(qualityText)}</strong><p>${esc(copy.pending(pending.length+opportunityClaims))}</p></div>
        </div>
        <div class="kt-planning-actions">
          <div class="kt-plan-primary-row">
            <button class="btn-slim kt-plan-fair-action" type="button" data-action="kt-plan-fair">${esc(fairCopy.action)}</button>
            <div class="kt-plan-action-group is-publish">
              ${pending.length+opportunityClaims ? `<button class="btn-slim" type="button" data-action="kt-plan-requests">${esc(copy.requests)} · ${pending.length+opportunityClaims}</button>` : ''}
              <button data-activation=write class="btn-slim primary" type="button" data-action="kt-plan-publish">${esc(copy.publish)}</button>
            </div>
          </div>
          <details class="kt-plan-tools">
            <summary><span>${esc(fairCopy.tools)}</span><small>${esc(fairCopy.toolsHint)}</small></summary>
            <div class="kt-plan-tools-panel">
              <section><div><strong>${esc(fairCopy.coverageGroup)}</strong><p>${esc(fairCopy.coverageDesc)}</p></div><div class="kt-plan-action-group"><button class="btn-slim" type="button" data-action="kt-plan-coverage">${esc(copy.coverage)}</button><button class="btn-slim" type="button" data-action="kt-plan-optimize">${esc(fairCopy.fromRules)}</button></div></section>
              <section><div><strong>${esc(fairCopy.openGroup)}</strong><p>${esc(fairCopy.openDesc)}</p></div><div class="kt-plan-action-group"><button class="btn-slim" type="button" data-action="kt-plan-open">${esc(copy.openShift)}</button></div></section>
              <section><div><strong>${esc(fairCopy.templateGroup)}</strong><p>${esc(fairCopy.templateDesc)}</p></div><div class="kt-plan-action-group"><button data-activation=write class="btn-slim" type="button" data-action="kt-plan-template-save">${esc(copy.save)}</button><select class="kt-plan-select" data-kt-template-select aria-label="${esc(copy.apply)}"><option value="">${esc(copy.noTemplate)}</option>${templates.map((template)=>`<option value="${esc(template.id)}">${esc(template.name)}</option>`).join('')}</select><button class="btn-slim" type="button" data-action="kt-plan-template-apply">${esc(copy.apply)}</button></div></section>
              <section><div><strong>${esc(fairCopy.maintenance)}</strong><p>${esc(fairCopy.maintenanceDesc)}</p></div><div class="kt-plan-action-group"><button class="btn-slim" type="button" data-action="kt-plan-clear" ${locked?'disabled':''}>${esc(T.plClear)}</button><button class="btn-slim" type="button" data-action="kt-plan-apply" ${locked?'disabled':''}>${svgIcon(IC.check,13)}<span>${esc(T.plApply)}</span></button></div></section>
            </div>
          </details>
        </div>
      </div>
      <div class="kt-plan-intelligence"><div><b>${esc(copy.planned)}</b><strong>${fmtHours(grandH)}</strong><span>${esc(copy.worked)} · ${fmtHours(workedH)}</span></div><div><b>${esc(copy.gaps)}</b><strong>${coverageGaps}</strong><span>${esc(copy.rules(coverageRuleCount))}</span></div><div><b>${esc(copy.opportunities)}</b><strong>${openOpportunities}</strong><span>${esc(copy.claims(opportunityClaims))}</span></div><div><b>${esc(copy.warnings)}</b><strong>${issues.length-(emptyPlan?1:0)}</strong><span>${esc(emptyPlan?copy.emptyPlan:copy.blocked(conflictCount))}</span></div></div>
      ${shownIssues.map((issue)=>`<div class="kt-plan-issue ${issue.severity==='blocker'?'is-blocker':'is-warning'}"><b>${issue.severity==='blocker'?'!':'i'}</b><span>${esc(issueLabel(issue))}</span></div>`).join('')}
      ${hiddenIssues?`<div class="kt-plan-issue is-more"><b>+</b><span>${esc(copy.more(hiddenIssues))}</span></div>`:''}`;

    return `
      <div class="eq-section">
        <div class="eq-section-head">
          <h3>${esc(T.tabPlanning)}</h3>
          <span class="eq-count-badge">${esc(T.hPeriodLabel(period.startFr, period.endFr))}${locked ? ' · ' + esc(T.hLocked) : ''}</span>
        </div>
        <div class="kt-hbar">
          <div class="eq-pill-row">${periodPillsHtml(T)}</div>
        </div>
        ${periodNavigatorHtml(T, period)}
        <p class="kt-plan-hint">${esc(T.plHint)}</p>
        ${planningCommand}
        ${stepper}
        ${planDaysHtml(T, members, shifts, view, locked, calendarMeta)}
        <div class="kt-plan-wrap" tabindex="0" role="region" aria-label="${esc(T.tabPlanning)}">
          <table class="kt-h-table kt-plan-table">
            ${cols}
            <thead>
              <tr>
                <th class="kt-h-memberhead">${esc(T.plMember)}</th>
                ${headDays}
                <th class="kt-h-totalhead">${esc(multiWeek ? T.plPlannedPeriod : T.plPlanned)}</th>
                ${showCosts ? `<th class="kt-h-totalhead">${esc(T.plCost)}</th>` : ''}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td class="kt-h-foot-label">${esc(T.plFooter)}</td>
                <td colspan="${view.length}"></td>
                <td class="kt-h-foot-tot mono"><b>${fmtHours(grandH)}</b></td>
                ${showCosts ? (members.some((m) => (+m.hourlyRate || 0) > 0) ? `<td class="kt-h-foot-tot mono"><b>${fmtPay(grandCostC / 100)}</b><span>MAD</span></td>` : `<td class="kt-h-foot-tot mono"><b title="${esc(T.noRate)}">·</b></td>`) : ''}
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="kt-plan-legend${anyNextDay ? '' : ' is-off'}"><i class="kt-sh-next">+1</i> ${esc(T.plNextDayLegend)}</p>
      </div>`;
  }

  /* planning-part:payroll-view:4 */

  /* ═══════════════ CE QUE team.js APPELLE ═══════════════ */
  Object.assign(core.hours, {
    renderHoursPane, closeShiftPop, payrollAccess, renderPayrollBody,
    isShiftPopOpen: () => shiftEditor.isShiftPopOpen(),
  });
})();
