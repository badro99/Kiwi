(function () {
  'use strict';
  const api = () => window.KiwiEmployeeLive;
  let lastData = null;
  let busy = false;
  let renderedDay = '';
  /* Archive des notices antérieures au fil du planning (les notices cotées
   * "read page by page" côté serveur). items/next survivent aux re-rendus. */
  let older = { items: [], next: null, opened: false, busy: false, failed: false };

  function resetOlderNotices() {
    older = { items: [], next: null, opened: false, busy: false, failed: false };
  }

  const css = `
    /* Une accolade manquante après « .kep-count{…font-weight:700 » avalait TOUT
       ce qui suivait : le parseur lisait la fin du fichier comme un bloc imbriqué
       dans « .kep-count », et 34 des 50 règles n'existaient pas. Disparaissaient
       ainsi la modale entière (.kep-overlay/.kep-sheet/.kep-field), la grille de
       disponibilités, TOUS les correctifs de nuit et la requête mobile · sur une
       app de téléphone. Rien en console : une erreur CSS est silencieuse.

       C'est ce qui explique le commentaire d'une session précédente disant que
       « le calendrier manquait à l'appel » et lui ajoutant une règle de nuit :
       cette règle-là tombait elle aussi après l'accolade, donc ne s'appliquait
       pas davantage. Le symptôme avait été traité avec du code mort.

       Le fichier consomme désormais les jetons de kiwi-serveur.html, son unique
       hôte, et n'a plus de palette sombre à lui : elle divergeait de celle de
       l'app, et de toute façon elle n'a jamais été lue. */
    .kep-sheet:focus{outline:none}
    .kep-card{border:1px solid var(--line);border-radius:var(--r-xl);padding:20px;background:var(--surface);color:var(--ink);margin-top:16px;box-shadow:var(--rim)}
    .kep-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .kep-title{font-size:19px;font-weight:700}
    .kep-sub{font-size:13px;color:var(--ink-3);margin-top:4px}
    .kep-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
    .kep-btn{min-height:44px;border:1px solid var(--line);border-radius:var(--r-md);padding:0 14px;background:transparent;color:inherit;font-weight:600}
    .kep-btn.primary{background:var(--fill-strong);border-color:var(--fill-strong);color:var(--on-strong)}
    .kep-btn:disabled{opacity:.5}
    .kep-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:17px;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;background:var(--line)}
    .kep-metric{padding:12px;background:var(--surface)}
    .kep-metric b{display:block;font-size:20px}
    .kep-metric span{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
    .kep-section{margin-top:18px}
    .kep-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
    .kep-section-head b{font-size:13px}
    .kep-count{min-width:25px;height:25px;display:grid;place-items:center;border-radius:999px;background:var(--tint);color:var(--forest-ink);font-size:11px;font-weight:700}
    .kep-list,.kep-requests{display:grid;gap:8px}
    .kep-row,.kep-request{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:var(--r-md);padding:12px}
    .kep-row-main,.kep-request>div:first-child{min-width:0}
    .kep-row b,.kep-request b{font-size:13px}
    .kep-row span,.kep-request span{display:block;font-size:12px;color:var(--ink-3);margin-top:3px}
    .kep-row-actions{display:flex;gap:6px;flex:0 0 auto}
    .kep-row-actions .kep-btn{min-height:34px;padding:0 9px;font-size:11px}
    .kep-status{font-style:normal;border-radius:999px;padding:6px 9px;background:var(--surface-2);color:var(--ink-2);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
    .kep-status.approved,.kep-status.assigned{background:var(--tint);color:var(--forest-ink)}
    .kep-status.rejected,.kep-status.cancelled{background:var(--surface-2);color:var(--ink-3)}
    .kep-notice{border-inline-start:3px solid var(--forest-edge);padding:8px 10px;background:var(--tint);border-radius:0 var(--r-md) var(--r-md) 0;font-size:12px}
    .kep-older{margin-top:10px}
    .kep-older .kep-btn{min-height:40px}
    .kep-overlay{position:fixed;inset:0;z-index:10050;background:rgba(5,12,9,.6);display:grid;place-items:center;padding:18px}
    .kep-sheet{width:min(540px,100%);max-height:min(760px,92dvh);overflow:auto;background:var(--surface);color:var(--ink);border-radius:var(--r-xl);padding:22px;box-shadow:var(--shadow-2)}
    .kep-sheet-head{display:flex;justify-content:space-between;gap:16px}
    .kep-sheet h2{margin:0;font-size:25px}
    .kep-close{width:42px;height:42px;border:1px solid var(--line);border-radius:var(--r-md);background:transparent;color:inherit;font-size:24px}
    .kep-field{display:grid;gap:7px;margin-top:17px}
    .kep-field label,.kep-label{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    .kep-field input,.kep-field textarea,.kep-field select{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:var(--r-md);background:var(--surface-2);color:var(--ink);min-height:48px;padding:11px 13px;font:inherit}
    .kep-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:8px}
    .kep-day{aspect-ratio:1;border:1px solid var(--line);border-radius:var(--r-md);background:var(--surface-2);color:inherit;font-weight:700}
    .kep-day.on{background:var(--fill-strong);color:var(--on-strong);border-color:var(--fill-strong)}
    .kep-check{display:flex;align-items:center;gap:10px;margin-top:17px}
    .kep-sheet-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}
    /* Un message d'ERREUR était peint en vert de marque · la couleur du succès
       partout ailleurs dans le produit. */
    .kep-error{margin-top:12px;color:var(--danger-mute);font-size:13px}
    .kep-empty{font-size:12px;color:var(--ink-3);margin-top:10px}
    @media(max-width:600px){.kep-card{padding:17px;border-radius:var(--r-lg)}.kep-head{display:block}.kep-actions{display:grid;grid-template-columns:1fr 1fr}.kep-btn{padding:0 9px}.kep-row,.kep-request{align-items:flex-start;flex-direction:column}.kep-row-actions{width:100%}.kep-row-actions .kep-btn{flex:1}.kep-overlay{align-items:end;padding:0}.kep-sheet{width:100%;border-radius:var(--r-xl) var(--r-xl) 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom));max-height:90dvh}.kep-days{gap:4px}.kep-day{border-radius:var(--r-sm)}}
  
`;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
  function copy() {
    const lang=document.documentElement.lang;
    if (lang === 'en') return { eyebrow:'My schedule', title:'Schedule & requests', sub:'Your published shifts, opportunities and requests in one place.', shifts:'My upcoming shifts', open:'Open shifts', swaps:'Shift exchanges', requests:'My requests', history:'Earlier updates', notices:'Updates', availability:'My availability', leave:'Request leave', exchange:'Exchange', claim:'Request this shift', offer:'Propose an exchange', cancel:'Cancel', empty:'Nothing to show.', chooseShift:'Choose one of your shifts', send:'Send request', close:'Close', scheduled:'Shifts', opportunities:'Opportunities', pending:'Pending', availabilityTitle:'Set my availability', leaveTitle:'Request leave', startDate:'Start date', endDate:'End date', concernedDays:'Days concerned', availableCheck:'I am available on these days', from:'From', until:'Until', note:'Note to manager (optional)', dayNames:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], dayShorts:['S','M','T','W','T','F','S'], errorRole:'This shift does not match your role.', errorConflict:'You already have a shift that day.', errorSwap:'Choose one of your published shifts.', errorChanged:'This opportunity changed. Refresh and try again.', errorDate:'Check the dates.', errorAvailability:'Choose at least one day and valid hours.', errorGeneric:'The request could not be sent. Try again.', olderNotices:'Older notices', olderMore:'Show more', olderNone:'No earlier notices.', olderError:'Could not load more.' };
    if (lang === 'ar') return { eyebrow:'جدولي', title:'الجدول والطلبات', sub:'وردياتك المنشورة والفرص والطلبات في مكان واحد.', shifts:'وردياتي القادمة', open:'ورديات شاغرة', swaps:'تبادل الورديات', requests:'طلباتي', history:'التحديثات السابقة', notices:'آخر التحديثات', availability:'أوقات توفري', leave:'طلب إجازة', exchange:'طلب تبديل', claim:'طلب هذه الوردية', offer:'اقتراح تبادل', cancel:'إلغاء', empty:'لا توجد عناصر حالياً.', chooseShift:'اختر إحدى وردياتك', send:'إرسال الطلب', close:'إغلاق', scheduled:'ورديات', opportunities:'فرص', pending:'معلقة', availabilityTitle:'تحديد أوقات التوفر', leaveTitle:'طلب إجازة', startDate:'تاريخ البداية', endDate:'تاريخ النهاية', concernedDays:'الأيام المعنية', availableCheck:'أنا متاح في هذه الأيام', from:'من', until:'إلى', note:'ملاحظة للمسؤول (اختياري)', dayNames:['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'], dayShorts:['ح','ن','ث','ر','خ','ج','س'], errorRole:'هذه الوردية لا تطابق وظيفتك.', errorConflict:'لديك وردية أخرى في هذا اليوم.', errorSwap:'اختر وردية منشورة لاقتراحها.', errorChanged:'تغيّرت هذه الفرصة. حدّث الصفحة وحاول مجدداً.', errorDate:'تحقق من التواريخ.', errorAvailability:'اختر يوماً واحداً على الأقل وساعات صحيحة.', errorGeneric:'تعذر إرسال الطلب. حاول مجدداً.', olderNotices:'إشعارات أقدم', olderMore:'عرض المزيد', olderNone:'لا إشعار سابق.', olderError:'تعذر تحميل المزيد.' };
    return { eyebrow:'Mon planning', title:'Planning & demandes', sub:'Vos services publiés, les opportunités et vos demandes au même endroit.', shifts:'Mes prochains services', open:'Services à pourvoir', swaps:'Échanges de service', requests:'Mes demandes', history:'Mises à jour précédentes', notices:'Mises à jour', availability:'Mes disponibilités', leave:'Demander un congé', exchange:'Échanger', claim:'Demander ce service', offer:'Proposer un échange', cancel:'Annuler', empty:'Aucun élément pour le moment.', chooseShift:'Choisissez l’un de vos services', send:'Envoyer la demande', close:'Fermer', scheduled:'Services', opportunities:'Opportunités', pending:'En attente', availabilityTitle:'Indiquer mes disponibilités', leaveTitle:'Demander un congé', startDate:'Date de début', endDate:'Date de fin', concernedDays:'Jours concernés', availableCheck:'Je suis disponible ces jours', from:'À partir de', until:'Jusqu’à', note:'Note au responsable (facultatif)', dayNames:['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'], dayShorts:['D','L','M','M','J','V','S'], errorRole:'Ce service ne correspond pas à votre fonction.', errorConflict:'Vous avez déjà un service ce jour-là.', errorSwap:'Choisissez un service publié à proposer.', errorChanged:'Cette opportunité vient de changer. Actualisez puis réessayez.', errorDate:'Vérifiez les dates.', errorAvailability:'Choisissez au moins un jour et des heures valides.', errorGeneric:'La demande n’a pas pu être envoyée. Réessayez.', olderNotices:'Notices plus anciennes', olderMore:'Afficher la suite', olderNone:'Aucune notice antérieure.', olderError:'Suite indisponible. Réessayez.' };
  }
  function todayKey() { try { return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA',{timeZone:lastData && lastData.store && lastData.store.timezone || 'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); } catch (_) { return new Date().toISOString().slice(0,10); } }
  function futureSchedule() {
    const today=todayKey(), schedule=lastData?.schedule || window.KiwiTeamDemoSchedule?.() || {};
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
    renderedDay = todayKey();
    const C=copy();
    const requests = lastData && lastData.planning && Array.isArray(lastData.planning.requests) ? lastData.planning.requests.slice().reverse() : [];
    const visible = requests;
    const planning=lastData && lastData.planning || {}, shifts=futureSchedule();
    const open=(planning.openShifts || []).filter((item)=>item.status === 'open' || item.mine);
    const swaps=(planning.swapRequests || []).filter((item)=>item.status === 'open' || item.mine || item.claimantId);
    const historyOpen=card.querySelector?.('details')?.open;
    const allNotices=(planning.notices || []).slice().sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))), notices=allNotices.slice(-3).reverse();
    const noticeText=(notice)=>esc(notice.type==='schedule-published' ? `${C.scheduled} · ${notice.periodKey||''}` : notice.type==='swap-approved' ? `${C.exchange} · ${prettyDay(notice.day)} ↔ ${prettyDay(notice.otherDay)}` : `${C.claim} · ${prettyDay(notice.day)}`);
    /* Le fil du serveur plafonne à 20 notices : quand le fil est plein, le
     * passé de l'employé (débord de la liste, puis archive) se relit page
     * par page dans /api/employee, action planning-notices-page. */
    const feedFull=allNotices.length>=20;
    const olderBlock=()=>{
      if(!older.opened) return feedFull?`<div class="kep-older"><button class="kep-btn" type="button" data-kep-older${older.busy?' disabled':''}>${esc(C.olderNotices)}</button></div>`:'';
      const olderIds=new Set(allNotices.map((item)=>String(item.id||'')));
      const list=older.items.filter((item)=>!olderIds.has(String(item.id||''))).map((item)=>`<div class="kep-notice">${noticeText(item)}</div>`).join('');
      const tail=older.failed?`<div class="kep-older"><button class="kep-btn" type="button" data-kep-older${older.busy?' disabled':''}>${esc(C.olderError)}</button></div>`
        :older.next!==null?`<div class="kep-older"><button class="kep-btn" type="button" data-kep-older${older.busy?' disabled':''}>${esc(C.olderMore)}</button></div>`
        :(older.items.length?'':`<div class="kep-older kep-empty">${esc(C.olderNone)}</div>`);
      return list?`<div class="kep-list">${list}</div>${tail}`:tail;
    };
    const pending=requests.filter((item)=>item.status==='pending').length + open.filter((item)=>item.mine&&item.status==='claimed').length + swaps.filter((item)=>item.mine&&['open','claimed'].includes(item.status)).length;
    const statusLabel=(value)=>({pending:C.pending,approved:'✓',rejected:'×',cancelled:'×',open:C.open,claimed:C.pending,assigned:'✓'}[value] || value);
    card.innerHTML = `<div class="kep-head"><div><div class="kg-eyebrow">${esc(C.eyebrow)}</div><div class="kep-title">${esc(C.title)}</div><div class="kep-sub">${esc(C.sub)}</div></div></div>
      <div class="kep-metrics"><div class="kep-metric"><b>${shifts.length}</b><span>${esc(C.scheduled)}</span></div><div class="kep-metric"><b>${open.filter((item)=>item.status==='open').length+swaps.filter((item)=>item.status==='open'&&!item.mine).length}</b><span>${esc(C.opportunities)}</span></div><div class="kep-metric"><b>${pending}</b><span>${esc(C.pending)}</span></div></div>
      <div class="kep-actions"><button class="kep-btn" type="button" data-kep="availability">${esc(C.availability)}</button><button class="kep-btn primary" type="button" data-kep="leave">${esc(C.leave)}</button></div>
      ${notices.length?`<section class="kep-section"><div class="kep-section-head"><b>${esc(C.notices)}</b><span class="kep-count">${notices.length}</span></div><div class="kep-list">${notices.map((notice)=>`<div class="kep-notice">${esc(notice.type==='schedule-published' ? `${C.scheduled} · ${notice.periodKey||''}` : notice.type==='swap-approved' ? `${C.exchange} · ${prettyDay(notice.day)} ↔ ${prettyDay(notice.otherDay)}` : `${C.claim} · ${prettyDay(notice.day)}`)}</div>`).join('')}</div>${allNotices.length>3?`<details><summary>${esc(C.history)} (${allNotices.length-3})</summary><div class="kep-list">${allNotices.slice(0,-3).map(n=>`<div class="kep-notice">${noticeText(n)}</div>`).join('')}</div>${olderBlock()}</details>`:''}</section>`:''}
      <section class="kep-section"><div class="kep-section-head"><b>${esc(C.shifts)}</b><span class="kep-count">${shifts.length}</span></div>${shifts.length?`<div class="kep-list">${shifts.map((shift)=>`<div class="kep-row"><div class="kep-row-main"><b>${esc(prettyDay(shift.day))}</b><span>${esc(shift.start)}–${esc(shift.end)}</span></div><div class="kep-row-actions"><button class="kep-btn" type="button" data-kep-swap="${esc(shift.day)}">${esc(C.exchange)}</button></div></div>`).join('')}</div>`:`<div class="kep-empty">${esc(C.empty)}</div>`}</section>
      ${open.length?`<section class="kep-section"><div class="kep-section-head"><b>${esc(C.open)}</b><span class="kep-count">${open.length}</span></div><div class="kep-list">${open.map((item)=>`<div class="kep-row"><div class="kep-row-main"><b>${esc(prettyDay(item.day))} · ${esc(item.start)}–${esc(item.end)}</b><span>${esc([item.role,item.note].filter(Boolean).join(' · '))}</span></div><div class="kep-row-actions">${item.mine?`<em class="kep-status ${esc(item.status)}">${esc(statusLabel(item.status))}</em>${item.status==='claimed'?`<button class="kep-btn" data-kep-op-cancel="${esc(item.id)}">${esc(C.cancel)}</button>`:''}`:`<button class="kep-btn primary" data-kep-open="${esc(item.id)}">${esc(C.claim)}</button>`}</div></div>`).join('')}</div></section>`:''}
      ${swaps.length?`<section class="kep-section"><div class="kep-section-head"><b>${esc(C.swaps)}</b><span class="kep-count">${swaps.length}</span></div><div class="kep-list">${swaps.map((item)=>`<div class="kep-row"><div class="kep-row-main"><b>${esc(prettyDay(item.day))} · ${esc(item.shift.start||'')}–${esc(item.shift.end||'')}</b><span>${esc((lastData.colleagues||[]).find((person)=>person.id===item.memberId)?.name||'')}</span></div><div class="kep-row-actions">${item.mine||item.claimantId?`<em class="kep-status ${esc(item.status)}">${esc(statusLabel(item.status))}</em>${['open','claimed'].includes(item.status)?`<button class="kep-btn" data-kep-op-cancel="${esc(item.id)}">${esc(C.cancel)}</button>`:''}`:`<button class="kep-btn primary" data-kep-swap-claim="${esc(item.id)}">${esc(C.offer)}</button>`}</div></div>`).join('')}</div></section>`:''}
      <section class="kep-section"><div class="kep-section-head"><b>${esc(C.requests)}</b><span class="kep-count">${visible.length}</span></div>${visible.length ? `<div class="kep-requests">${visible.map((request)=>`<div class="kep-request"><div><b>${esc(requestLabel(request))}</b>${request.reason ? `<span>${esc(request.reason)}</span>` : ''}</div><div class="kep-row-actions"><em class="kep-status ${esc(request.status)}">${esc(statusLabel(request.status))}</em>${request.status === 'pending' ? `<button class="kep-btn" type="button" data-kep-cancel="${esc(request.id)}">${esc(C.cancel)}</button>` : ''}</div></div>`).join('')}</div>` : `<div class="kep-empty">${esc(C.empty)}</div>`}</section>`;
    if (historyOpen) { const history = card.querySelector('details'); if (history) history.open = true; } // keep the reader's expanded history across re-renders
  }
  /* Une feuille ouverte prend le focus et le rend au bouton qui l'a ouverte ;
     Échap la ferme. Sans cela, au clavier ou avec un lecteur d'écran, on
     restait derrière le voile (axe, 23 octobre). Le focus va à la feuille,
     pas à son premier champ : sur un téléphone, un champ date ouvrirait son
     sélecteur avant que l'employé ait lu la feuille. */
  let sheetOpener = null, sheetOpenerSelector = null, inertBackground = [];
  function closeSheet() {
    const open = document.querySelector('.kep-overlay');
    if (!open) return;
    open.remove();
    inertBackground.forEach(([node, inert]) => { node.inert = inert; }); inertBackground = [];
    const back = sheetOpener?.isConnected ? sheetOpener : sheetOpenerSelector && document.querySelector(sheetOpenerSelector); sheetOpener = null; sheetOpenerSelector = null;
    if (back && back.isConnected) { try { back.focus(); } catch (_) {} }
  }
  function focusSheet(overlay) {
    sheetOpener = document.activeElement && document.activeElement !== document.body ? document.activeElement : sheetOpener;
    const openerAttribute = sheetOpener && Array.from(sheetOpener.attributes).find(attr => ['data-kep','data-kep-open','data-kep-swap-claim'].includes(attr.name));
    sheetOpenerSelector = openerAttribute ? `[${openerAttribute.name}="${CSS.escape(openerAttribute.value)}"]` : null;
    inertBackground = Array.from(document.body.children).filter(node => node !== overlay).map(node => [node, node.inert]);
    inertBackground.forEach(([node]) => { node.inert = true; });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); }
      if (event.key !== 'Tab') return;
      const stops = Array.from(overlay.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')).filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
      const index = stops.indexOf(document.activeElement);
      if (!stops.length || (event.shiftKey ? index <= 0 : index < 0 || index === stops.length - 1)) {
        event.preventDefault(); (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
      }
    });
    const form = overlay.querySelector('form');
    if (form) { form.setAttribute('tabindex', '-1'); try { form.focus({ preventScroll: true }); } catch (_) {} }
  }
  function opportunitySheet(kind, id) {
    closeSheet(); const C=copy(), overlay=document.createElement('div'); overlay.className='kep-overlay';
    const choices=futureSchedule();
    overlay.innerHTML=`<form class="kep-sheet" data-kep-op-form="${esc(kind)}" data-kep-id="${esc(id)}" role="dialog" aria-modal="true" aria-labelledby="kep-sheet-title"><div class="kep-sheet-head"><div><div class="kg-eyebrow">${esc(C.eyebrow)}</div><h2 id="kep-sheet-title">${esc(kind==='open'?C.claim:C.offer)}</h2></div><button class="kep-close" type="button" data-kep-close aria-label="${esc(C.close)}">×</button></div>${kind==='swap'?`<div class="kep-field"><label for="kep-f-shift">${esc(C.chooseShift)}</label><select id="kep-f-shift" name="offeredDay" required><option value=""></option>${choices.map((shift)=>`<option value="${esc(shift.day)}">${esc(prettyDay(shift.day))} · ${esc(shift.start)}–${esc(shift.end)}</option>`).join('')}</select></div>`:`<p class="kep-sub">${esc(C.claim)}</p>`}<div class="kep-error" data-kep-error hidden></div><div class="kep-sheet-foot"><button class="kep-btn" type="button" data-kep-close>${esc(C.cancel)}</button><button class="kep-btn primary" type="submit">${esc(C.send)}</button></div></form>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click',(event)=>{ if(event.target===overlay||event.target.closest('[data-kep-close]'))closeSheet(); });
    overlay.querySelector('form').addEventListener('submit',submitOpportunity);
    focusSheet(overlay);
  }
  function sheet(type) {
    closeSheet();
    const overlay = document.createElement('div'); overlay.className='kep-overlay';
    const C=copy(), days=C.dayShorts, today=todayKey();
    overlay.innerHTML = `<form class="kep-sheet" data-kep-form="${type}" role="dialog" aria-modal="true" aria-labelledby="kep-sheet-title"><div class="kep-sheet-head"><div><div class="kg-eyebrow">${esc(C.eyebrow)}</div><h2 id="kep-sheet-title">${esc(type === 'leave' ? C.leaveTitle : C.availabilityTitle)}</h2></div><button class="kep-close" type="button" data-kep-close aria-label="${esc(C.close)}">×</button></div>${type === 'leave' ? `<div class="kep-field"><label for="kep-f-start">${esc(C.startDate)}</label><input id="kep-f-start" type="date" name="startDate" min="${esc(today)}" required></div><div class="kep-field"><label for="kep-f-end">${esc(C.endDate)}</label><input id="kep-f-end" type="date" name="endDate" min="${esc(today)}" required></div>` : `<div class="kep-field"><span class="kep-label" id="kep-f-days">${esc(C.concernedDays)}</span><div class="kep-days" role="group" aria-labelledby="kep-f-days">${days.map((day,index)=>`<button class="kep-day${index>=1&&index<=5?' on':''}" type="button" data-kep-day="${index}" aria-pressed="${index>=1&&index<=5?'true':'false'}">${esc(day)}</button>`).join('')}</div></div><label class="kep-check"><input type="checkbox" name="available" checked><span>${esc(C.availableCheck)}</span></label><div data-kep-times><div class="kep-field"><label for="kep-f-from">${esc(C.from)}</label><input id="kep-f-from" type="time" name="start" value="09:00"></div><div class="kep-field"><label for="kep-f-until">${esc(C.until)}</label><input id="kep-f-until" type="time" name="end" value="18:00"></div></div>`}<div class="kep-field"><label for="kep-f-note">${esc(C.note)}</label><textarea id="kep-f-note" name="reason" maxlength="240" rows="3"></textarea></div><div class="kep-error" data-kep-error hidden></div><div class="kep-sheet-foot"><button class="kep-btn" type="button" data-kep-close>${esc(C.cancel)}</button><button class="kep-btn primary" type="submit">${esc(C.send)}</button></div></form>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-kep-close]')) closeSheet();
      const day = event.target.closest('[data-kep-day]');
      if (day) { day.classList.toggle('on'); day.setAttribute('aria-pressed', day.classList.contains('on') ? 'true' : 'false'); }
    });
    overlay.querySelector('[name="available"]')?.addEventListener('change', (event) => { overlay.querySelector('[data-kep-times]').hidden = !event.target.checked; });
    overlay.querySelector('form').addEventListener('submit', submit);
    focusSheet(overlay);
  }
  /* Une page de l'archive se demande uniquement au toucher du bouton (le fil
   * du GET reste léger) ; deux touches rapprochées n'en chargent qu'une. Sans
   * re-rendu pendant l'envoi : reconstruire la carte ici avalerait la suite
   * des clics. */
  async function loadOlderNotices(button) {
    if (older.busy || !api() || !api().planningNoticesPage) return;
    older.busy = true;
    if (button && button.isConnected) button.disabled = true;
    const offset = older.next == null ? 0 : older.next;
    try {
      const data = await api().planningNoticesPage(offset);
      if (!data || !Array.isArray(data.items)) throw new Error('planning-notices-page');
      const seen = new Set(older.items.concat((lastData && lastData.planning && lastData.planning.notices) || []).map((item) => String(item.id || '')));
      data.items.forEach((item) => {
        if (!item || seen.has(String(item.id || ''))) return;
        seen.add(String(item.id || ''));
        older.items.push(item);
      });
      older.next = data.next === null || data.next === undefined ? null : data.next;
      older.opened = true;
      older.failed = false;
    } catch (_) { older.failed = true; }
    older.busy = false;
    render();
  }
  async function onCardClick(event) {
    const olderBtn=event.target.closest('[data-kep-older]');
    if(olderBtn){void loadOlderNotices(olderBtn);return;}
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
  document.addEventListener('kiwi-demo-schedule', (event) => {
    if (window.KiwiEnv?.isReal?.() || window.KiwiMe || window.KiwiVenue?.isCustom?.()) return;
    lastData = {schedule:event.detail.schedule, planning:{}}; mount(); render();
  });
  if (typeof MutationObserver === 'function') new MutationObserver(() => render()).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
  document.addEventListener('kiwi-employee-authenticated', refresh);
  /* La carte ne se rafraîchissait que sur ses propres actions et au changement
   * de jour. Le sondage du service (et chaque pointage) relit pourtant /api/employee
   * toutes les quelques secondes : la décision du patron (congé approuvé, planning
   * publié, échange accepté) arrivait dans l'app sans jamais atteindre cette carte,
   * qui continuait d'afficher « 0 demande » jusqu'à un rechargement. On se branche
   * sur la lecture qui a déjà eu lieu au lieu d'en refaire une. */
  document.addEventListener('kiwi-employee-data', (event) => {
    if (!event.detail || !event.detail.employee) return;
    lastData = event.detail; mount(); render();
  });
  /* Hors service (« Consulter sans pointer ») rien ne sonde : au retour dans
   * l'app, on relit, au plus une fois toutes les 30 s. */
  let lastVisibleRead = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !lastData || Date.now() - lastVisibleRead < 30000) return;
    lastVisibleRead = Date.now(); refresh();
  });
  window.addEventListener('load', () => { mount(); refresh(); });
  function redrawOnDayChange() {
    if (!lastData || renderedDay === todayKey()) return;
    render(); // offline-safe rollover; the server refresh prunes expired opportunities.
    refresh();
  }
  window.addEventListener('focus', redrawOnDayChange);
  setInterval(redrawOnDayChange, 60000);
})();
