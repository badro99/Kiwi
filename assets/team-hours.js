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
  const core = window.Kiwi && window.Kiwi.__teamCore;
  if (!core || !core.hours) return;
  const {
    Kiwi, handlers, modal, toast, live,
    trLang, t, jobName, AVATAR_COLORS, initials, periodOffsets, HHMM_RE,
    normShift, shiftMinutes, shiftHours, shiftIsNextDay, fmtDur, fmtHours, fromISO, addDays, getShifts,
    periodPillsHtml, teamKey, saveCustomTeams, getMembers, getHours, pad, fmtFr, toISO, buildPeriod,
    periodNavigatorHtml, lockBucket, setPeriodLock, restorePeriodLock, applyLiveTeam, render,
    esc, memberFullName, isCustomVenue, fmtMad, svgIcon, IC, dateLocale, MODAL_CSS,
    contractWeekHours, hourlyPayFor, payrollFigures,
  } = core;

  /* Paie & planning ouvre sur le PLANNING : c'est la moitié de la page qui
   * n'existait pas, et les heures réelles restent à un clic. */
  let payTab = 'planning';
  /* Quelle semaine de la période le planning montre — voir weekChunks(). */
  let planWeekIdx = 0;
  /* Pointage envoyé plus tard depuis le téléphone (réseau coupé) : le serveur
   * l'a daté avec le délai que le téléphone a déclaré. On le marque dans la
   * case du jour, délai compris, pour que le gérant puisse le questionner. */
  function deferredDelay(ms, lang) {
    const total = Math.max(1, Math.round((Number(ms) || 0) / 60000)), h = Math.floor(total / 60), m = total % 60;
    if (lang === 'ar') return h ? `${h} س ${m} د` : `${m} د`;
    if (lang === 'en') return h ? `${h} h ${m} min` : `${m} min`;
    return h ? `${h} h ${pad(m)}` : `${m} min`;
  }
  function deferredLabel(list, lang = trLang()) {
    const delay = deferredDelay(Math.max(...list.map((p) => Number(p && p.delayMs) || 0)), lang);
    if (lang === 'ar') return `أُرسل لاحقاً من الهاتف · التأخير المصرَّح به ${delay}`;
    if (lang === 'en') return `Sent later from the phone · declared delay ${delay}`;
    return `Envoyé plus tard depuis le téléphone · délai déclaré ${delay}`;
  }
  function deferredMark(venueType, mid, day) {
    const list = ((((window.__kiwiTeamV2 || {}).deferredByVenue || {})[venueType] || {})[mid] || {})[day];
    if (!Array.isArray(list) || !list.length) return '';
    const label = esc(deferredLabel(list));
    return `<span class="kt-deferred" data-kt-deferred title="${label}" aria-label="${label}" role="img"><i data-icon="smartphone" style="width:12px;height:12px" aria-hidden="true"></i></span>`;
  }

  function correctionCopy() {
    if (trLang() === 'ar') return {title:'تصحيحات الحضور المعلقة',approve:'موافقة',reject:'رفض',in:'دخول',out:'خروج',captured:'وقت الهاتف',received:'وقت الاستلام',error:'تعذر تنفيذ القرار. تحقق من ترتيب التسجيلات والصلاحيات.'};
    if (trLang() === 'en') return {title:'Pending attendance corrections',approve:'Approve',reject:'Reject',in:'Clock in',out:'Clock out',captured:'Phone capture',received:'Received',error:'Could not apply decision. Check punch order and permissions.'};
    return {title:'Corrections de présence en attente',approve:'Approuver',reject:'Refuser',in:'Arrivée',out:'Départ',captured:'Heure du téléphone',received:'Reçu',error:'Décision impossible. Vérifiez l’ordre des pointages et vos droits.'};
  }
  function correctionTime(item, field) {
    return new Date(item[field]).toLocaleString(dateLocale(), {timeZone:item.timeZone || 'UTC',timeZoneName:'short'});
  }
  function correctionsHtml(venueType) {
    const items = ((window.__kiwiTeamV2.correctionsByVenue || {})[venueType] || []), C = correctionCopy();
    if (!items.length) return '';
    return `<section><h3>${esc(C.title)}</h3>${items.map(item => `<article><strong>${esc(item.name)} · ${esc(item.action === 'clock-in' ? C.in : C.out)}</strong><p>${esc(correctionTime(item, 'claimedTs'))} · ${esc(C.captured)}: ${esc(correctionTime(item, 'capturedTs'))} · ${esc(C.received)}: ${esc(correctionTime(item, 'receivedTs'))} · ${esc(item.deviceId)}</p><button class="kb atlas" data-action="kt-attendance-decision" data-rid="${esc(item.id)}" data-decision="approved">${esc(C.approve)}</button><button class="kb ghost" data-action="kt-attendance-decision" data-rid="${esc(item.id)}" data-decision="rejected">${esc(C.reject)}</button></article>`).join('')}</section>`;
  }
  handlers['kt-attendance-decision'] = async (el) => {
    const merchant = Kiwi.__teamProfileCore.teamSlug(), correctionId = el.dataset.rid, decision = el.dataset.decision;
    el.disabled = true;
    try {
      const response = await fetch('/api/team/live', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchant,action:'attendance-correction-decision',correctionId,decision})});
      if (!response.ok) throw new Error('decision-failed');
      const root = window.__kiwiTeamV2;
      Object.keys(root.correctionsByVenue || {}).forEach(key => {root.correctionsByVenue[key] = root.correctionsByVenue[key].filter(item => item.id !== correctionId);});
      render();
    } catch (_) { toast(correctionCopy().error); el.disabled = false; }
  };

  /* ═══════════════ HOURS PANE ═══════════════ */
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
  handlers['kt-plan-clear'] = () => {
    const root = window.__kiwiTeamV2;
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
    const root = window.__kiwiTeamV2;
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
  handlers['kt-plan-optimize'] = () => {
    const ctx=planningContext(),P=window.KiwiPlanningCore,copy=Object.assign({},planningCopy(),optimizationCopy());if(!P?.optimize)return;
    const KH=window.KiwiHours,hoursKey=planningHoursKey(ctx),configured=!!KH?.isConfigured?.(hoursKey),periodsByDay=configured?Object.fromEntries(ctx.period.days.map((day)=>{const resolved=KH.periodsOn(day,hoursKey);return[day,Array.isArray(resolved)?resolved:(resolved?.periods||[])];})):null;
    const holidaysByDay=planningHolidaysByDay(ctx.period.days);
    const result=P.optimize({planning:ctx.planning,shifts:ctx.shifts,days:ctx.period.days,members:ctx.members,periodsByDay,holidaysByDay});
    if(!result.assignments.length){toast(result.unresolved.length?copy.optimizeBlocked:copy.optimizeNothing,{type:result.unresolved.length?'error':'info'});return;}
    const mdl=modal({title:copy.optimizeTitle,width:620,body:`<div class="kt-opt-summary"><strong>${esc(copy.optimizeCount(result.assignments.length))}</strong><p>${esc(copy.optimizeReview)}</p></div>${result.assignments.slice(0,30).map((row)=>{const member=ctx.members.find((m)=>String(m.id)===String(row.memberId));return `<div class="kt-opt-row"><b>${esc(member?memberFullName(member):row.memberId)}</b><span>${esc(row.day)} · ${esc(row.start)}–${esc(row.end)}</span></div>`;}).join('')}${result.unresolved.length?`<div class="kt-plan-issue is-blocker"><b>!</b><span>${esc(copy.optimizeUnresolved(result.unresolved.length))}</span></div>`:''}`,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-optimize-confirm">${esc(copy.optimizeApply)}</button>`});
    mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningOptimize={mdl,result,key:ctx.key};
  };
  handlers['kt-plan-optimize-confirm'] = () => {const p=window.__kiwiPlanningOptimize;if(!p?.mdl?.el)return;window.__kiwiTeamV2.shiftsByVenue[p.key]=p.result.shifts;saveCustomTeams();p.mdl.close();window.__kiwiPlanningOptimize=null;render();toast(optimizationCopy().optimizeDone,{type:'success'});};

  function fairScheduleCopy() {
    const lang=trLang();
    if(lang==='en')return{action:'Auto-schedule fairly',title:'Fair auto-schedule',intro:'Kiwi uses this venue’s opening hours, approved leave and each person’s availability. It balances hours and prepares a draft only.',people:'People needed each day',peopleHint:'Unique team members scheduled across the day.',shifts:'Shifts per day',shiftsHint:'The opening day is divided into consecutive shifts.',hours:'Opening hours',hoursReady:'The venue’s saved opening hours will be used.',hoursMissing:'Opening hours must be configured before Kiwi can build a truthful schedule.',configure:'Configure opening hours',reviewTitle:'Review the proposal',review:(a,d)=>`${a} assignments across ${d} open day${d===1?'':'s'}`,balance:(a,b)=>`Hours per person: ${a}–${b} h`,reviewNote:'Applying replaces the current draft for this period. It does not publish the schedule.',build:'Create proposal',apply:'Replace draft',done:'The fair proposal is now in the draft.',invalid:'People per day must be at least the number of shifts.',shortage:(n)=>`${n} staffing gap${n===1?'':'s'} could not be filled safely.`,closed:(n)=>`${n} closed day${n===1?' was':'s were'} skipped.`,tools:'Planning tools',toolsHint:'Coverage rules, open shifts, templates and period maintenance.',coverageGroup:'Demand rules',coverageDesc:'Describe role-specific minimum coverage, then build from those rules.',openGroup:'Staff opportunities',openDesc:'Share an unassigned shift for employees to claim.',templateGroup:'Reusable weeks',templateDesc:'Save or apply a reviewed weekly pattern.',maintenance:'Period maintenance',maintenanceDesc:'Clear the draft or transfer it into recorded hours.',fromRules:'Build from rules'};
    if(lang==='ar')return{action:'توزيع عادل تلقائياً',title:'توزيع عادل للورديات',intro:'يعتمد Kiwi على ساعات فتح المؤسسة والإجازات المقبولة وتوفر كل موظف، ثم يوازن الساعات ويُنشئ مسودة فقط.',people:'عدد الأشخاص المطلوب يومياً',peopleHint:'أعضاء مختلفون موزعون على اليوم.',shifts:'عدد الورديات يومياً',shiftsHint:'يتم تقسيم فترة الفتح إلى ورديات متتالية.',hours:'ساعات الفتح',hoursReady:'سيتم استعمال ساعات فتح المؤسسة المسجلة.',hoursMissing:'يجب ضبط ساعات الفتح قبل إنشاء جدول واقعي.',configure:'ضبط ساعات الفتح',reviewTitle:'مراجعة الاقتراح',review:(a,d)=>`${a} تعيينات خلال ${d} أيام مفتوحة`,balance:(a,b)=>`ساعات كل شخص: ${a}–${b}`,reviewNote:'سيستبدل التطبيق مسودة هذه الفترة فقط، ولن ينشر الجدول.',build:'إنشاء الاقتراح',apply:'استبدال المسودة',done:'تمت إضافة الاقتراح العادل إلى المسودة.',invalid:'يجب ألا يقل عدد الأشخاص عن عدد الورديات.',shortage:(n)=>`تعذر ملء ${n} مناصب بأمان.`,closed:(n)=>`تم تجاوز ${n} أيام مغلقة.`,tools:'أدوات التخطيط',toolsHint:'قواعد التغطية والورديات الشاغرة والنماذج وصيانة الفترة.',coverageGroup:'قواعد الحاجة',coverageDesc:'حدد الحد الأدنى حسب الوظيفة، ثم أنشئ الجدول وفقاً للقواعد.',openGroup:'فرص الفريق',openDesc:'انشر وردية غير معينة ليطلبها الموظفون.',templateGroup:'أسابيع قابلة لإعادة الاستخدام',templateDesc:'احفظ أو طبق أسبوعاً نموذجياً تمت مراجعته.',maintenance:'صيانة الفترة',maintenanceDesc:'امسح المسودة أو انقلها إلى الساعات المنجزة.',fromRules:'إنشاء من القواعد'};
    return{action:'Répartir équitablement',title:'Répartition automatique',intro:'Kiwi lit les horaires d’ouverture, les congés approuvés et les disponibilités. Il équilibre les heures et prépare uniquement un brouillon.',people:'Personnes nécessaires par jour',peopleHint:'Des membres différents, répartis sur la journée.',shifts:'Nombre de shifts par jour',shiftsHint:'La journée d’ouverture est découpée en services successifs.',hours:'Horaires d’ouverture',hoursReady:'Les horaires enregistrés de l’établissement seront utilisés.',hoursMissing:'Renseignez les horaires d’ouverture pour que Kiwi construise un planning réel.',configure:'Configurer les horaires',reviewTitle:'Vérifier la proposition',review:(a,d)=>`${a} affectation${a===1?'':'s'} sur ${d} jour${d===1?'':'s'} ouvert${d===1?'':'s'}`,balance:(a,b)=>`Heures par personne : ${a}–${b} h`,reviewNote:'Appliquer remplace le brouillon de cette période. Le planning ne sera pas publié.',build:'Créer la proposition',apply:'Remplacer le brouillon',done:'La proposition équitable est dans le brouillon.',invalid:'Le nombre de personnes doit être au moins égal au nombre de shifts.',shortage:(n)=>`${n} besoin${n===1?'':'s'} n’ont pas pu être couvert${n===1?'':'s'} sans conflit.`,closed:(n)=>`${n} jour${n===1?' fermé a':'s fermés ont'} été ignoré${n===1?'':'s'}.`,tools:'Outils de planning',toolsHint:'Couverture détaillée, services ouverts, modèles et entretien de la période.',coverageGroup:'Besoins précis',coverageDesc:'Définissez un minimum par fonction et horaire, puis composez depuis ces règles.',openGroup:'Opportunités équipe',openDesc:'Partagez un service non attribué auquel les employés peuvent candidater.',templateGroup:'Semaines réutilisables',templateDesc:'Enregistrez ou appliquez une semaine type déjà vérifiée.',maintenance:'Entretien de la période',maintenanceDesc:'Effacez le brouillon ou validez-le comme heures réalisées.',fromRules:'Composer depuis les règles'};
  }

  handlers['kt-plan-fair'] = () => {
    const ctx=planningContext(),copy=fairScheduleCopy(),KH=window.KiwiHours;
    const hoursKey=planningHoursKey(ctx),configured=!!(KH&&KH.isConfigured&&KH.isConfigured(hoursKey));
    const suggested=Math.max(1,Math.min(ctx.members.length,Math.ceil(ctx.members.length/2)||1));
    const suggestedShifts=Math.max(1,Math.min(2,suggested));
    const body=`<p class="kt-fair-intro">${esc(copy.intro)}</p><div class="kt-fair-fields"><div class="kt-plan-modal-field"><label for="kt-fair-people">${esc(copy.people)}</label><input id="kt-fair-people" data-kt-fair-people type="number" inputmode="numeric" min="1" max="${ctx.members.length||1}" value="${suggested}"><small>${esc(copy.peopleHint)}</small></div><div class="kt-plan-modal-field"><label for="kt-fair-shifts">${esc(copy.shifts)}</label><input id="kt-fair-shifts" data-kt-fair-shifts type="number" inputmode="numeric" min="1" max="6" value="${suggestedShifts}"><small>${esc(copy.shiftsHint)}</small></div></div><div class="kt-fair-hours ${configured?'is-ready':'is-missing'}"><strong>${esc(copy.hours)}</strong><span>${esc(configured?copy.hoursReady:copy.hoursMissing)}</span>${configured?'':`<button class="kb ghost" type="button" data-action="kt-plan-hours">${esc(copy.configure)}</button>`}</div>`;
    const mdl=modal({title:copy.title,width:600,body,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-fair-build"${configured?'':' disabled'}>${esc(copy.build)}</button>`});
    mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningFair={mdl,key:ctx.key,hoursKey};
  };
  handlers['kt-plan-hours'] = () => {
    const pending=window.__kiwiPlanningFair,ctx=planningContext();
    pending?.mdl?.close?.();window.__kiwiPlanningFair=null;
    if(window.KiwiHoursUI?.open)window.KiwiHoursUI.open({venueId:planningHoursKey(ctx),title:ctx.venue?.name||'',onSave:()=>setTimeout(()=>pending?handlers['kt-plan-fair']():render(),100)});
  };
  handlers['kt-plan-fair-build'] = () => {
    const pending=window.__kiwiPlanningFair,ctx=planningContext(),P=window.KiwiPlanningCore,KH=window.KiwiHours,copy=fairScheduleCopy();if(!pending?.mdl?.el||!P?.fairSchedule||!KH)return;
    const people=Math.max(1,Math.floor(Number(pending.mdl.el.querySelector('[data-kt-fair-people]')?.value)||1));
    const shiftCount=Math.max(1,Math.floor(Number(pending.mdl.el.querySelector('[data-kt-fair-shifts]')?.value)||1));
    if(people<shiftCount){toast(copy.invalid,{type:'error'});return;}
    const hoursKey=pending.hoursKey||planningHoursKey(ctx),periodsByDay=Object.fromEntries(ctx.period.days.map((day)=>{const resolved=KH.periodsOn(day,hoursKey);return[day,Array.isArray(resolved)?resolved:(resolved?.periods||[])];}));
    const result=P.fairSchedule({planning:ctx.planning,shifts:ctx.shifts,days:ctx.period.days,members:ctx.members,dailyPeople:people,shiftsPerDay:shiftCount,periodsByDay,holidaysByDay:planningHolidaysByDay(ctx.period.days),seed:`${ctx.key}|${ctx.period.start}`});
    const hours=result.hoursByMember.map((row)=>row.hours);const low=hours.length?Math.min(...hours):0,high=hours.length?Math.max(...hours):0;
    const openDays=ctx.period.days.length-result.closedDays.length;
    const issues=[];if(result.unresolved.length)issues.push(`<div class="kt-plan-issue is-blocker"><b>!</b><span>${esc(copy.shortage(result.unresolved.length))}</span></div>`);if(result.closedDays.length)issues.push(`<div class="kt-plan-issue is-warning"><b>i</b><span>${esc(copy.closed(result.closedDays.length))}</span></div>`);
    const rows=result.hoursByMember.filter((row)=>row.hours>0).map((row)=>{const member=ctx.members.find((item)=>String(item.id)===row.memberId);return `<div class="kt-fair-review-row"><b>${esc(member?memberFullName(member):row.memberId)}</b><span>${(window.KiwiNumber?.format(row.hours, {maximumFractionDigits:1}) ?? row.hours.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:1}))} h</span></div>`;}).join('');
    pending.mdl.close();
    const mdl=modal({title:copy.reviewTitle,width:620,body:`<div class="kt-opt-summary"><strong>${esc(copy.review(result.assignments.length,openDays))}</strong><p>${esc(copy.balance((window.KiwiNumber?.format(low, {maximumFractionDigits:1}) ?? low.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:1})),(window.KiwiNumber?.format(high, {maximumFractionDigits:1}) ?? high.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:1}))))}</p><p>${esc(copy.reviewNote)}</p></div><div class="kt-fair-review">${rows}</div>${issues.join('')}`,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-fair-confirm"${result.assignments.length?'':' disabled'}>${esc(copy.apply)}</button>`});
    mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningFair={mdl,key:ctx.key,result};
  };
  handlers['kt-plan-fair-confirm'] = () => {const pending=window.__kiwiPlanningFair;if(!pending?.mdl?.el||!pending.result)return;window.__kiwiTeamV2.shiftsByVenue[pending.key]=pending.result.shifts;saveCustomTeams();pending.mdl.close();window.__kiwiPlanningFair=null;render();toast(fairScheduleCopy().done,{type:'success'});};

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
    const chunks = weekChunks(buildPeriod(window.__kiwiTeamV2.periodKind || 'week').days);
    const next = planWeekIdx + (dir === 'next' ? 1 : -1);
    if (next < 0 || next >= chunks.length) return;
    planWeekIdx = next;
    render();
  };

  handlers['kt-period-nav'] = (_el, dir) => {
    closeShiftPop();
    const root = window.__kiwiTeamV2;
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
  let shiftPop = null;

  const currentVenueKey = () => teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
  const planHost = () => document.querySelector('.dash-genpage .dash-equipe');
  function visibleDays() {
    const chunks = weekChunks(buildPeriod(window.__kiwiTeamV2.periodKind || 'week').days);
    return chunks[Math.min(Math.max(planWeekIdx, 0), chunks.length - 1)] || [];
  }
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

  /* ═══════════════ HOURS HANDLERS ═══════════════ */
  handlers['kt-period'] = (_el, kind) => {
    if (!['week', 'fortnight', 'month'].includes(kind)) return;
    const root = window.__kiwiTeamV2;
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
    const hours = window.__kiwiTeamV2.hoursByVenue[vt] || (window.__kiwiTeamV2.hoursByVenue[vt] = {});
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
    const hours = window.__kiwiTeamV2.hoursByVenue[vt] || (window.__kiwiTeamV2.hoursByVenue[vt] = {});
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
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
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
  const IMPORT_COPY = {
    fr: {
      title: 'Importer des heures', locked: 'Période validée', lockedDesc: 'Rouvrez la période avant d’importer des heures.',
      bad: 'Fichier non reconnu', badDesc: 'Il faut les colonnes « Date » et « Heures », et « ID membre » ou « Employé ». Le fichier exporté par Kiwi convient.',
      empty: 'Aucune heure à importer', emptyDesc: 'Aucune ligne ne correspond à un membre de cette équipe.',
      summary: (n, m, d) => `${n} saisie${n > 1 ? 's' : ''} d’heures pour ${m} membre${m > 1 ? 's' : ''}, sur ${d} jour${d > 1 ? 's' : ''}.`,
      replace: 'Les heures déjà saisies pour ces jours sont remplacées par celles du fichier.',
      skipped: (n) => `${n} ligne${n > 1 ? 's' : ''} ignorée${n > 1 ? 's' : ''} : membre inconnu, date ou heures invalides.`,
      lockedDays: (n) => `${n} jour${n > 1 ? 's' : ''} dans une période validée, laissé${n > 1 ? 's' : ''} tel${n > 1 ? 's' : ''} quel${n > 1 ? 's' : ''}.`,
      cancel: 'Annuler', apply: 'Importer', done: (n) => `${n} saisie${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`, doneDesc: 'Heures enregistrées et synchronisées sur vos appareils.',
    },
    en: {
      title: 'Import hours', locked: 'Period validated', lockedDesc: 'Reopen the period before importing hours.',
      bad: 'File not recognised', badDesc: 'It needs « Date » and « Heures » columns, plus « ID membre » or « Employé ». The file Kiwi exports works.',
      empty: 'No hours to import', emptyDesc: 'No row matches a member of this team.',
      summary: (n, m, d) => `${n} hour entr${n > 1 ? 'ies' : 'y'} for ${m} member${m > 1 ? 's' : ''}, over ${d} day${d > 1 ? 's' : ''}.`,
      replace: 'Hours already entered for these days are replaced by the file’s.',
      skipped: (n) => `${n} row${n > 1 ? 's' : ''} skipped: unknown member, invalid date or hours.`,
      lockedDays: (n) => `${n} day${n > 1 ? 's' : ''} in a validated period, left as is.`,
      cancel: 'Cancel', apply: 'Import', done: (n) => `${n} entr${n > 1 ? 'ies' : 'y'} imported`, doneDesc: 'Hours saved and synced to your devices.',
    },
    ar: {
      title: 'استيراد الساعات', locked: 'الفترة مصادق عليها', lockedDesc: 'أعد فتح الفترة قبل استيراد الساعات.',
      bad: 'ملف غير معروف', badDesc: 'يلزم عمودا « Date » و« Heures »، مع « ID membre » أو « Employé ». الملف الذي يصدّره Kiwi مناسب.',
      empty: 'لا ساعات للاستيراد', emptyDesc: 'لا يطابق أي سطر عضوًا في هذا الفريق.',
      summary: (n, m, d) => `${n} إدخال ساعات لـ ${m} عضو، على ${d} يوم.`,
      replace: 'تُستبدل الساعات المدخلة لهذه الأيام بساعات الملف.',
      skipped: (n) => `${n} سطر متجاهل: عضو غير معروف أو تاريخ أو ساعات غير صالحة.`,
      lockedDays: (n) => `${n} يوم ضمن فترة مصادق عليها، بقي كما هو.`,
      cancel: 'إلغاء', apply: 'استيراد', done: (n) => `تم استيراد ${n} إدخال`, doneDesc: 'حُفظت الساعات وتمت مزامنتها على أجهزتك.',
    },
  };
  const importCopy = () => IMPORT_COPY[trLang()] || IMPORT_COPY.fr;
  /* RFC-4180-ish: quoted cells, doubled quotes, ; or , separators, CRLF. */
  function parseCsv(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] || '';
    const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
        if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
    /* The export prefixes formula-looking cells with ' : read them back literal. */
    return rows.map((r) => r.map((v) => v.trim().replace(/^'(?=[=+\-@])/, '')));
  }
  const normHead = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  function dayIsLocked(root, day) {
    const bucket = lockBucket(root);
    return Object.keys(bucket).some((key) => {
      if (!bucket[key].locked) return false;
      const [, start, end] = key.split(':');
      return day >= start && day <= end;
    });
  }
  function planHoursImport(text, members, root) {
    const rows = parseCsv(text);
    if (rows.length < 2) return null;
    const head = rows[0].map(normHead);
    const col = (...names) => head.findIndex((h) => names.includes(h));
    const iId = col('idmembre', 'memberid', 'id'), iName = col('employe', 'employee', 'nom', 'name');
    const iDate = col('date', 'jour', 'day'), iHours = col('heures', 'hours');
    if (iDate < 0 || iHours < 0 || (iId < 0 && iName < 0)) return null;
    const byId = new Map(members.map((m) => [String(m.id), m]));
    const byName = new Map(members.map((m) => [memberFullName(m).toLowerCase().replace(/\s+/g, ' ').trim(), m]));
    const changes = []; let skipped = 0; const lockedDays = new Set();
    rows.slice(1).forEach((r) => {
      const m = (iId >= 0 && byId.get(r[iId])) || (iName >= 0 && byName.get(String(r[iName] || '').toLowerCase().replace(/\s+/g, ' ').trim()));
      let day = String(r[iDate] || '');
      const fr = day.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (fr) day = `${fr[3]}-${pad(fr[2])}-${pad(fr[1])}`;
      const rawHours = String(r[iHours] || '').trim();
      const hours = rawHours ? Number(rawHours.replace(',', '.')) : NaN;
      /* La forme ne suffit pas : « 2026-13-40 » passe l'expression et
       * deviendrait une journée fantôme dans le registre. On relit la date. */
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + 'T00:00:00Z') : null;
      const realDay = !!parsed && !isNaN(parsed) && parsed.toISOString().slice(0, 10) === day;
      if (!m || !realDay || !Number.isFinite(hours) || hours < 0 || hours > 24) { skipped++; return; }
      if (dayIsLocked(root, day)) { lockedDays.add(day); return; }
      changes.push({ id: m.id, day, hours: Math.round(hours * 100) / 100 });
    });
    return { changes, skipped, lockedDays: lockedDays.size };
  }
  let pendingImport = null;
  handlers['kt-import-csv'] = () => {
    const C = importCopy();
    const root = window.__kiwiTeamV2;
    if (root.periodLocked) { Kiwi.toast(C.locked, { type: 'info', desc: C.lockedDesc }); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv,text/csv'; input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      file.text().then((text) => {
        const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
        const key = teamKey(venue);
        const plan = planHoursImport(text, getMembers(key), root);
        if (!plan) { Kiwi.toast(C.bad, { type: 'warning', desc: C.badDesc }); return; }
        if (!plan.changes.length) { Kiwi.toast(C.empty, { type: 'info', desc: C.emptyDesc }); return; }
        const membersTouched = new Set(plan.changes.map((c) => c.id)).size;
        const daysTouched = new Set(plan.changes.map((c) => c.day)).size;
        pendingImport = { key, changes: plan.changes };
        modal({
          title: C.title, width: 480,
          body: `<div class="kt-opt-summary"><strong>${esc(C.summary(plan.changes.length, membersTouched, daysTouched))}</strong><p>${esc(C.replace)}</p>
            ${plan.skipped ? `<p>${esc(C.skipped(plan.skipped))}</p>` : ''}${plan.lockedDays ? `<p>${esc(C.lockedDays(plan.lockedDays))}</p>` : ''}</div>`,
          foot: `<button class="kb ghost" data-dismiss>${esc(C.cancel)}</button><button data-activation=write class="kb atlas" data-action="kt-import-csv-apply">${esc(C.apply)}</button>`,
        });
      }).catch(() => Kiwi.toast(C.bad, { type: 'warning', desc: C.badDesc }));
    });
    input.click();
  };
  handlers['kt-import-csv-apply'] = (el) => {
    const C = importCopy();
    const job = pendingImport; pendingImport = null;
    el?.closest('.kiwi-modal, [role=dialog]')?.querySelector('[data-dismiss]')?.click();
    if (!job) return;
    const root = window.__kiwiTeamV2;
    const hours = root.hoursByVenue[job.key] || (root.hoursByVenue[job.key] = {});
    job.changes.forEach((c) => { (hours[c.id] || (hours[c.id] = {}))[c.day] = c.hours; });
    saveCustomTeams();
    if (live.pageActive) render();
    Kiwi.toast(C.done(job.changes.length), { type: 'success', desc: C.doneDesc });
  };
  handlers['kt-validate-period'] = () => {
    const T = t();
    const root = window.__kiwiTeamV2;
    if (root.periodLocked) return;
    const period = buildPeriod(root.periodKind);
    setPeriodLock(root, root.periodKind, period, true);
    if (live.pageActive) render();
    Kiwi.toast(T.tValidated(period.startFr, period.endFr), { type: 'success', desc: T.tValidatedDesc });
  };
  handlers['kt-unlock-period'] = () => {
    const T = t();
    const root = window.__kiwiTeamV2;
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
  function optimizationCopy(){const lang=trLang();if(lang==='en')return{optimize:'Build schedule',optimizeTitle:'Suggested schedule',optimizeCount:(n)=>`${n} shift${n===1?'':'s'} proposed`,optimizeReview:'Review the proposal before applying it. Nothing is published automatically.',optimizeUnresolved:(n)=>`${n} coverage gap${n===1?' remains':'s remain'}`,optimizeApply:'Apply to draft',optimizeDone:'Suggested shifts added to the draft.',optimizeBlocked:'No safe assignment covers these gaps.',optimizeNothing:'The schedule already covers every rule.'};if(lang==='ar')return{optimize:'إنشاء الجدول',optimizeTitle:'الجدول المقترح',optimizeCount:(n)=>`${n} ورديات مقترحة`,optimizeReview:'راجع الاقتراح قبل تطبيقه. لن يتم نشر أي شيء تلقائياً.',optimizeUnresolved:(n)=>`${n} فجوات دون حل آمن`,optimizeApply:'إضافة إلى المسودة',optimizeDone:'تمت إضافة الورديات المقترحة إلى المسودة.',optimizeBlocked:'لا يوجد تعيين آمن لتغطية هذا النقص.',optimizeNothing:'الجدول يغطي جميع القواعد بالفعل.'};return{optimize:'Composer le planning',optimizeTitle:'Planning suggéré',optimizeCount:(n)=>`${n} service${n===1?'':'s'} proposé${n===1?'':'s'}`,optimizeReview:'Vérifiez la proposition avant de l’appliquer. Rien n’est publié automatiquement.',optimizeUnresolved:(n)=>`${n} manque${n===1?' reste':'s restent'} sans solution sûre`,optimizeApply:'Ajouter au brouillon',optimizeDone:'Les services suggérés ont été ajoutés au brouillon.',optimizeBlocked:'Aucune affectation sûre ne couvre ces manques.',optimizeNothing:'Le planning couvre déjà toutes les règles.'};}
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
    const root = window.__kiwiTeamV2;
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
    let grandH = 0, grandCost = 0;
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
      grandH += h; grandCost += cost;
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
          ${showCosts ? ((+m.hourlyRate || 0) > 0 ? `<td class="kt-h-pay mono"><b>${(window.KiwiNumber?.format(cost, { maximumFractionDigits: 0 }) ?? cost.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }))}</b><span>MAD</span></td>` : `<td class="kt-h-pay mono"><b title="${esc(T.noRate)}">·</b></td>`) : ''}
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
                ${showCosts ? (members.some((m) => (+m.hourlyRate || 0) > 0) ? `<td class="kt-h-foot-tot mono"><b>${(window.KiwiNumber?.format(grandCost, { maximumFractionDigits: 0 }) ?? grandCost.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }))}</b><span>MAD</span></td>` : `<td class="kt-h-foot-tot mono"><b title="${esc(T.noRate)}">·</b></td>`) : ''}
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="kt-plan-legend${anyNextDay ? '' : ' is-off'}"><i class="kt-sh-next">+1</i> ${esc(T.plNextDayLegend)}</p>
      </div>`;
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

  /* ═══════════════ CE QUE team.js APPELLE ═══════════════ */
  Object.assign(core.hours, {
    renderHoursPane, closeShiftPop, payrollAccess, renderPayrollBody,
    isShiftPopOpen: () => !!shiftPop,
  });
})();
