(function () {
  'use strict';
  const api = () => window.KiwiEmployeeLive;
  let lastData = null;
  let busy = false;

  const css = `
    .kep-card{border:1px solid rgba(10,15,13,.12);border-radius:22px;padding:20px;background:var(--paper,#f7f5f0);color:var(--ink,#0a0f0d);margin-top:16px}.kep-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.kep-title{font-size:19px;font-weight:800}.kep-sub{font-size:13px;color:#68716d;margin-top:4px}.kep-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.kep-btn{min-height:42px;border:1px solid rgba(10,15,13,.15);border-radius:12px;padding:0 14px;background:transparent;color:inherit;font-weight:750}.kep-btn.primary{background:#0b6e4f;border-color:#0b6e4f;color:#fff}.kep-btn:disabled{opacity:.5}.kep-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:17px;border:1px solid rgba(10,15,13,.1);border-radius:15px;overflow:hidden;background:rgba(10,15,13,.1)}.kep-metric{padding:12px;background:var(--paper,#f7f5f0)}.kep-metric b{display:block;font-size:20px}.kep-metric span{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#68716d}.kep-section{margin-top:18px}.kep-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}.kep-section-head b{font-size:13px}.kep-count{min-width:25px;height:25px;display:grid;place-items:center;border-radius:999px;background:rgba(11,110,79,.1);color:#0b6e4f;font-size:11px;font-weight:900}.kep-list,.kep-requests{display:grid;gap:8px}.kep-row,.kep-request{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(10,15,13,.1);border-radius:14px;padding:12px}.kep-row-main,.kep-request>div:first-child{min-width:0}.kep-row b,.kep-request b{font-size:13px}.kep-row span,.kep-request span{display:block;font-size:12px;color:#68716d;margin-top:3px}.kep-row-actions{display:flex;gap:6px;flex:0 0 auto}.kep-row-actions .kep-btn{min-height:34px;padding:0 9px;font-size:11px}.kep-status{font-style:normal;border-radius:999px;padding:6px 9px;background:rgba(10,15,13,.07);font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.kep-status.approved,.kep-status.assigned{background:rgba(11,110,79,.12);color:#0b6e4f}.kep-status.rejected,.kep-status.cancelled{background:rgba(10,15,13,.07);color:#68716d}.kep-notice{border-inline-start:3px solid #0b6e4f;padding:8px 10px;background:rgba(11,110,79,.06);border-radius:0 10px 10px 0;font-size:12px}.kep-overlay{position:fixed;inset:0;z-index:10050;background:rgba(5,12,9,.6);display:grid;place-items:center;padding:18px}.kep-sheet{width:min(540px,100%);max-height:min(760px,92dvh);overflow:auto;background:#f7f5f0;color:#0a0f0d;border-radius:24px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.28)}.kep-sheet-head{display:flex;justify-content:space-between;gap:16px}.kep-sheet h2{margin:0;font-size:25px}.kep-close{width:42px;height:42px;border:1px solid #cdd3cf;border-radius:12px;background:transparent;font-size:24px}.kep-field{display:grid;gap:7px;margin-top:17px}.kep-field label,.kep-label{font-size:12px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}.kep-field input,.kep-field textarea,.kep-field select{width:100%;box-sizing:border-box;border:1px solid #cdd3cf;border-radius:13px;background:#fff;color:#0a0f0d;min-height:48px;padding:11px 13px;font:inherit}.kep-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:8px}.kep-day{aspect-ratio:1;border:1px solid #cdd3cf;border-radius:11px;background:#fff;font-weight:800}.kep-day.on{background:#053b2c;color:#fff;border-color:#053b2c}.kep-check{display:flex;align-items:center;gap:10px;margin-top:17px}.kep-sheet-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}.kep-error{margin-top:12px;color:#0b6e4f;font-size:13px}.kep-empty{font-size:12px;color:#68716d;margin-top:10px}
    [data-theme="dark"] .kep-card,.dark .kep-card{background:#111713;color:#f7f5f0;border-color:#2b3731}[data-theme="dark"] .kep-sub,[data-theme="dark"] .kep-request span,.dark .kep-sub,.dark .kep-request span{color:#aeb8b2}
    @media(max-width:600px){.kep-card{padding:17px;border-radius:18px}.kep-head{display:block}.kep-actions{display:grid;grid-template-columns:1fr 1fr}.kep-btn{padding:0 9px}.kep-row,.kep-request{align-items:flex-start;flex-direction:column}.kep-row-actions{width:100%}.kep-row-actions .kep-btn{flex:1}.kep-overlay{align-items:end;padding:0}.kep-sheet{width:100%;border-radius:24px 24px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom));max-height:90dvh}.kep-days{gap:4px}.kep-day{border-radius:9px}}
  `;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
  function copy() {
    const lang=document.documentElement.lang;
    if (lang === 'en') return { eyebrow:'My schedule', title:'Schedule & requests', sub:'Your published shifts, opportunities and requests in one place.', shifts:'My upcoming shifts', open:'Open shifts', swaps:'Shift exchanges', requests:'My requests', notices:'Updates', availability:'My availability', leave:'Request leave', exchange:'Exchange', claim:'Request this shift', offer:'Propose an exchange', cancel:'Cancel', empty:'Nothing to show.', chooseShift:'Choose one of your shifts', send:'Send request', close:'Close', scheduled:'Shifts', opportunities:'Opportunities', pending:'Pending', availabilityTitle:'Set my availability', leaveTitle:'Request leave', startDate:'Start date', endDate:'End date', concernedDays:'Days concerned', availableCheck:'I am available on these days', from:'From', until:'Until', note:'Note to manager (optional)', dayNames:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], dayShorts:['S','M','T','W','T','F','S'], errorRole:'This shift does not match your role.', errorConflict:'You already have a shift that day.', errorSwap:'Choose one of your published shifts.', errorChanged:'This opportunity changed. Refresh and try again.', errorDate:'Check the dates.', errorAvailability:'Choose at least one day and valid hours.', errorGeneric:'The request could not be sent. Try again.' };
    if (lang === 'ar') return { eyebrow:'جدولي', title:'الجدول والطلبات', sub:'وردياتك المنشورة والفرص والطلبات في مكان واحد.', shifts:'وردياتي القادمة', open:'ورديات شاغرة', swaps:'تبادل الورديات', requests:'طلباتي', notices:'آخر التحديثات', availability:'أوقات توفري', leave:'طلب إجازة', exchange:'طلب تبديل', claim:'طلب هذه الوردية', offer:'اقتراح تبادل', cancel:'إلغاء', empty:'لا توجد عناصر حالياً.', chooseShift:'اختر إحدى وردياتك', send:'إرسال الطلب', close:'إغلاق', scheduled:'ورديات', opportunities:'فرص', pending:'معلقة', availabilityTitle:'تحديد أوقات التوفر', leaveTitle:'طلب إجازة', startDate:'تاريخ البداية', endDate:'تاريخ النهاية', concernedDays:'الأيام المعنية', availableCheck:'أنا متاح في هذه الأيام', from:'من', until:'إلى', note:'ملاحظة للمسؤول (اختياري)', dayNames:['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'], dayShorts:['ح','ن','ث','ر','خ','ج','س'], errorRole:'هذه الوردية لا تطابق وظيفتك.', errorConflict:'لديك وردية أخرى في هذا اليوم.', errorSwap:'اختر وردية منشورة لاقتراحها.', errorChanged:'تغيّرت هذه الفرصة. حدّث الصفحة وحاول مجدداً.', errorDate:'تحقق من التواريخ.', errorAvailability:'اختر يوماً واحداً على الأقل وساعات صحيحة.', errorGeneric:'تعذر إرسال الطلب. حاول مجدداً.' };
    return { eyebrow:'Mon planning', title:'Planning & demandes', sub:'Vos services publiés, les opportunités et vos demandes au même endroit.', shifts:'Mes prochains services', open:'Services à pourvoir', swaps:'Échanges de service', requests:'Mes demandes', notices:'Mises à jour', availability:'Mes disponibilités', leave:'Demander un congé', exchange:'Échanger', claim:'Demander ce service', offer:'Proposer un échange', cancel:'Annuler', empty:'Aucun élément pour le moment.', chooseShift:'Choisissez l’un de vos services', send:'Envoyer la demande', close:'Fermer', scheduled:'Services', opportunities:'Opportunités', pending:'En attente', availabilityTitle:'Indiquer mes disponibilités', leaveTitle:'Demander un congé', startDate:'Date de début', endDate:'Date de fin', concernedDays:'Jours concernés', availableCheck:'Je suis disponible ces jours', from:'À partir de', until:'Jusqu’à', note:'Note au responsable (facultatif)', dayNames:['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'], dayShorts:['D','L','M','M','J','V','S'], errorRole:'Ce service ne correspond pas à votre fonction.', errorConflict:'Vous avez déjà un service ce jour-là.', errorSwap:'Choisissez un service publié à proposer.', errorChanged:'Cette opportunité vient de changer. Actualisez puis réessayez.', errorDate:'Vérifiez les dates.', errorAvailability:'Choisissez au moins un jour et des heures valides.', errorGeneric:'La demande n’a pas pu être envoyée. Réessayez.' };
  }
  function todayKey() { try { return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); } catch (_) { return new Date().toISOString().slice(0,10); } }
  function futureSchedule() {
    const today=todayKey(), schedule=lastData && lastData.schedule || {};
    return Object.keys(schedule).filter((day)=>day>=today && schedule[day] && !schedule[day].off).sort().map((day)=>({ day, ...schedule[day] }));
  }
  function prettyDay(day) { try { return new Date(day+'T12:00:00').toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-MA' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR',{weekday:'short',day:'numeric',month:'short'}); } catch (_) { return day; } }
  function mount() {
    if (document.getElementById('kep-card')) return document.getElementById('kep-card');
    const anchor = document.getElementById('kg-sched-card');
    if (!anchor) return null;
    if (!document.getElementById('kep-css')) { const style=document.createElement('style'); style.id='kep-css'; style.textContent=css; document.head.appendChild(style); }
    const card = document.createElement('section');
    card.id = 'kep-card'; card.className = 'kep-card';
    anchor.insertAdjacentElement('afterend', card);
    card.addEventListener('click', onCardClick);
    render();
    return card;
  }
  function requestLabel(request) {
    const lang = document.documentElement.lang;
    const leave = lang === 'ar' ? 'إجازة' : lang === 'en' ? 'Leave' : 'Congé';
    const available = lang === 'ar' ? 'أوقات التوفر' : lang === 'en' ? 'Availability' : 'Disponibilités';
    const unavailable = lang === 'ar' ? 'غير متاح' : lang === 'en' ? 'Unavailable' : 'Indisponible';
    if (request.type === 'leave') return `${leave} · ${request.startDate} → ${request.endDate}`;
    const days = (request.weekdays || []).map((day) => copy().dayNames[day]).join(', ');
    return request.available === false ? `${unavailable} · ${days}` : `${available} · ${days} · ${request.start}–${request.end}`;
  }
  function render() {
    const card = document.getElementById('kep-card'); if (!card) return;
    const C=copy();
    const requests = lastData && lastData.planning && Array.isArray(lastData.planning.requests) ? lastData.planning.requests.slice().reverse() : [];
    const visible = requests.slice(0, 4);
    const planning=lastData && lastData.planning || {}, shifts=futureSchedule();
    const open=(planning.openShifts || []).filter((item)=>item.status === 'open' || item.mine).slice(0,6);
    const swaps=(planning.swapRequests || []).filter((item)=>item.status === 'open' || item.mine || item.claimantId).slice(0,6);
    const notices=(planning.notices || []).slice(-3).reverse();
    const pending=requests.filter((item)=>item.status==='pending').length + open.filter((item)=>item.mine&&item.status==='claimed').length + swaps.filter((item)=>item.mine&&['open','claimed'].includes(item.status)).length;
    const statusLabel=(value)=>({pending:C.pending,approved:'✓',rejected:'×',cancelled:'×',open:C.open,claimed:C.pending,assigned:'✓'}[value] || value);
    card.innerHTML = `<div class="kep-head"><div><div class="kg-eyebrow">${esc(C.eyebrow)}</div><div class="kep-title">${esc(C.title)}</div><div class="kep-sub">${esc(C.sub)}</div></div></div>
      <div class="kep-metrics"><div class="kep-metric"><b>${shifts.length}</b><span>${esc(C.scheduled)}</span></div><div class="kep-metric"><b>${open.filter((item)=>item.status==='open').length+swaps.filter((item)=>item.status==='open'&&!item.mine).length}</b><span>${esc(C.opportunities)}</span></div><div class="kep-metric"><b>${pending}</b><span>${esc(C.pending)}</span></div></div>
      <div class="kep-actions"><button class="kep-btn" type="button" data-kep="availability">${esc(C.availability)}</button><button class="kep-btn primary" type="button" data-kep="leave">${esc(C.leave)}</button></div>
      ${notices.length?`<section class="kep-section"><div class="kep-section-head"><b>${esc(C.notices)}</b><span class="kep-count">${notices.length}</span></div><div class="kep-list">${notices.map((notice)=>`<div class="kep-notice">${esc(notice.type==='schedule-published' ? `${C.scheduled} · ${notice.periodKey||''}` : notice.type==='swap-approved' ? `${C.exchange} · ${prettyDay(notice.day)} ↔ ${prettyDay(notice.otherDay)}` : `${C.claim} · ${prettyDay(notice.day)}`)}</div>`).join('')}</div></section>`:''}
      <section class="kep-section"><div class="kep-section-head"><b>${esc(C.shifts)}</b><span class="kep-count">${shifts.length}</span></div>${shifts.length?`<div class="kep-list">${shifts.slice(0,6).map((shift)=>`<div class="kep-row"><div class="kep-row-main"><b>${esc(prettyDay(shift.day))}</b><span>${esc(shift.start)}–${esc(shift.end)}</span></div><div class="kep-row-actions"><button class="kep-btn" type="button" data-kep-swap="${esc(shift.day)}">${esc(C.exchange)}</button></div></div>`).join('')}</div>`:`<div class="kep-empty">${esc(C.empty)}</div>`}</section>
      ${open.length?`<section class="kep-section"><div class="kep-section-head"><b>${esc(C.open)}</b><span class="kep-count">${open.length}</span></div><div class="kep-list">${open.map((item)=>`<div class="kep-row"><div class="kep-row-main"><b>${esc(prettyDay(item.day))} · ${esc(item.start)}–${esc(item.end)}</b><span>${esc([item.role,item.note].filter(Boolean).join(' · '))}</span></div><div class="kep-row-actions">${item.mine?`<em class="kep-status ${esc(item.status)}">${esc(statusLabel(item.status))}</em>${item.status==='claimed'?`<button class="kep-btn" data-kep-op-cancel="${esc(item.id)}">${esc(C.cancel)}</button>`:''}`:`<button class="kep-btn primary" data-kep-open="${esc(item.id)}">${esc(C.claim)}</button>`}</div></div>`).join('')}</div></section>`:''}
      ${swaps.length?`<section class="kep-section"><div class="kep-section-head"><b>${esc(C.swaps)}</b><span class="kep-count">${swaps.length}</span></div><div class="kep-list">${swaps.map((item)=>`<div class="kep-row"><div class="kep-row-main"><b>${esc(prettyDay(item.day))} · ${esc(item.shift.start||'')}–${esc(item.shift.end||'')}</b><span>${esc((lastData.colleagues||[]).find((person)=>person.id===item.memberId)?.name||'')}</span></div><div class="kep-row-actions">${item.mine||item.claimantId?`<em class="kep-status ${esc(item.status)}">${esc(statusLabel(item.status))}</em>${['open','claimed'].includes(item.status)?`<button class="kep-btn" data-kep-op-cancel="${esc(item.id)}">${esc(C.cancel)}</button>`:''}`:`<button class="kep-btn primary" data-kep-swap-claim="${esc(item.id)}">${esc(C.offer)}</button>`}</div></div>`).join('')}</div></section>`:''}
      <section class="kep-section"><div class="kep-section-head"><b>${esc(C.requests)}</b><span class="kep-count">${visible.length}</span></div>${visible.length ? `<div class="kep-requests">${visible.map((request)=>`<div class="kep-request"><div><b>${esc(requestLabel(request))}</b>${request.reason ? `<span>${esc(request.reason)}</span>` : ''}</div><div class="kep-row-actions"><em class="kep-status ${esc(request.status)}">${esc(statusLabel(request.status))}</em>${request.status === 'pending' ? `<button class="kep-btn" type="button" data-kep-cancel="${esc(request.id)}">${esc(C.cancel)}</button>` : ''}</div></div>`).join('')}</div>` : `<div class="kep-empty">${esc(C.empty)}</div>`}</section>`;
  }
  function closeSheet() { document.querySelector('.kep-overlay')?.remove(); }
  function opportunitySheet(kind, id) {
    closeSheet(); const C=copy(), overlay=document.createElement('div'); overlay.className='kep-overlay';
    const choices=futureSchedule();
    overlay.innerHTML=`<form class="kep-sheet" data-kep-op-form="${esc(kind)}" data-kep-id="${esc(id)}"><div class="kep-sheet-head"><div><div class="kg-eyebrow">${esc(C.eyebrow)}</div><h2>${esc(kind==='open'?C.claim:C.offer)}</h2></div><button class="kep-close" type="button" data-kep-close aria-label="${esc(C.close)}">×</button></div>${kind==='swap'?`<div class="kep-field"><label>${esc(C.chooseShift)}</label><select name="offeredDay" required><option value=""></option>${choices.map((shift)=>`<option value="${esc(shift.day)}">${esc(prettyDay(shift.day))} · ${esc(shift.start)}–${esc(shift.end)}</option>`).join('')}</select></div>`:`<p class="kep-sub">${esc(C.claim)}</p>`}<div class="kep-error" data-kep-error hidden></div><div class="kep-sheet-foot"><button class="kep-btn" type="button" data-kep-close>${esc(C.cancel)}</button><button class="kep-btn primary" type="submit">${esc(C.send)}</button></div></form>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click',(event)=>{ if(event.target===overlay||event.target.closest('[data-kep-close]'))closeSheet(); });
    overlay.querySelector('form').addEventListener('submit',submitOpportunity);
  }
  function sheet(type) {
    closeSheet();
    const overlay = document.createElement('div'); overlay.className='kep-overlay';
    const C=copy(), days=C.dayShorts, today=todayKey();
    overlay.innerHTML = `<form class="kep-sheet" data-kep-form="${type}"><div class="kep-sheet-head"><div><div class="kg-eyebrow">${esc(C.eyebrow)}</div><h2>${esc(type === 'leave' ? C.leaveTitle : C.availabilityTitle)}</h2></div><button class="kep-close" type="button" data-kep-close aria-label="${esc(C.close)}">×</button></div>${type === 'leave' ? `<div class="kep-field"><label>${esc(C.startDate)}</label><input type="date" name="startDate" min="${esc(today)}" required></div><div class="kep-field"><label>${esc(C.endDate)}</label><input type="date" name="endDate" min="${esc(today)}" required></div>` : `<div class="kep-field"><span class="kep-label">${esc(C.concernedDays)}</span><div class="kep-days">${days.map((day,index)=>`<button class="kep-day${index>=1&&index<=5?' on':''}" type="button" data-kep-day="${index}" aria-pressed="${index>=1&&index<=5?'true':'false'}">${esc(day)}</button>`).join('')}</div></div><label class="kep-check"><input type="checkbox" name="available" checked><span>${esc(C.availableCheck)}</span></label><div data-kep-times><div class="kep-field"><label>${esc(C.from)}</label><input type="time" name="start" value="09:00"></div><div class="kep-field"><label>${esc(C.until)}</label><input type="time" name="end" value="18:00"></div></div>`}<div class="kep-field"><label>${esc(C.note)}</label><textarea name="reason" maxlength="240" rows="3"></textarea></div><div class="kep-error" data-kep-error hidden></div><div class="kep-sheet-foot"><button class="kep-btn" type="button" data-kep-close>${esc(C.cancel)}</button><button class="kep-btn primary" type="submit">${esc(C.send)}</button></div></form>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-kep-close]')) closeSheet();
      const day = event.target.closest('[data-kep-day]');
      if (day) { day.classList.toggle('on'); day.setAttribute('aria-pressed', day.classList.contains('on') ? 'true' : 'false'); }
    });
    overlay.querySelector('[name="available"]')?.addEventListener('change', (event) => { overlay.querySelector('[data-kep-times]').hidden = !event.target.checked; });
    overlay.querySelector('form').addEventListener('submit', submit);
  }
  async function onCardClick(event) {
    const cancel=event.target.closest('[data-kep-cancel]');
    if (cancel && !busy) { busy=true; cancel.disabled=true; try { await api().cancelPlanningRequest(cancel.dataset.kepCancel); await refresh(); } catch (_) { cancel.disabled=false; } finally { busy=false; } return; }
    const cancelOpportunity=event.target.closest('[data-kep-op-cancel]');
    if(cancelOpportunity&&!busy){busy=true;cancelOpportunity.disabled=true;try{await api().cancelPlanningOpportunity(cancelOpportunity.dataset.kepOpCancel);await refresh();}catch(_){cancelOpportunity.disabled=false;}finally{busy=false;}return;}
    const swap=event.target.closest('[data-kep-swap]');
    if(swap&&!busy){busy=true;swap.disabled=true;try{await api().requestShiftSwap(swap.dataset.kepSwap);await refresh();}catch(_){swap.disabled=false;}finally{busy=false;}return;}
    const open=event.target.closest('[data-kep-open]'); if(open){opportunitySheet('open',open.dataset.kepOpen);return;}
    const swapClaim=event.target.closest('[data-kep-swap-claim]'); if(swapClaim){opportunitySheet('swap',swapClaim.dataset.kepSwapClaim);return;}
    const action=event.target.closest('[data-kep]')?.dataset.kep; if (action) sheet(action);
  }
  async function submitOpportunity(event){event.preventDefault();if(busy)return;const C=copy(),form=event.currentTarget,error=form.querySelector('[data-kep-error]'),button=form.querySelector('[type="submit"]');busy=true;button.disabled=true;try{if(form.dataset.kepOpForm==='open')await api().claimOpenShift(form.dataset.kepId);else await api().claimShiftSwap(form.dataset.kepId,form.elements.offeredDay.value);closeSheet();await refresh();}catch(failure){error.hidden=false;error.textContent=failure.code==='open-shift-role-mismatch'||failure.code==='swap-role-mismatch'?C.errorRole:failure.code==='open-shift-schedule-conflict'?C.errorConflict:failure.code==='swap-offer-invalid'?C.errorSwap:C.errorChanged;}finally{busy=false;if(form.isConnected)button.disabled=false;}}
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const form=event.currentTarget, type=form.dataset.kepForm, error=form.querySelector('[data-kep-error]');
    const body={ type, reason:form.elements.reason.value.trim() };
    if (type === 'leave') { body.startDate=form.elements.startDate.value; body.endDate=form.elements.endDate.value; }
    else { body.weekdays=Array.from(form.querySelectorAll('[data-kep-day].on')).map((button)=>Number(button.dataset.kepDay)); body.available=form.elements.available.checked; body.start=form.elements.start.value; body.end=form.elements.end.value; }
    busy=true; form.querySelector('[type="submit"]').disabled=true;
    try { await api().requestPlanning(body); closeSheet(); await refresh(); }
    catch (failure) { const C=copy(); error.hidden=false; error.textContent=failure.code === 'planning-date-invalid' ? C.errorDate : failure.code === 'planning-availability-invalid' ? C.errorAvailability : C.errorGeneric; }
    finally { busy=false; if (form.isConnected) form.querySelector('[type="submit"]').disabled=false; }
  }
  async function refresh() {
    if (!api()) return;
    try { lastData=await api().refresh(); mount(); render(); } catch (_) {}
  }
  document.addEventListener('kiwi-employee-authenticated', refresh);
  window.addEventListener('load', () => { mount(); refresh(); });
})();
