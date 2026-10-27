/* Planning corrections. Exports: deferredMark, correctionsHtml.
 * Reads injected helpers: Kiwi, dateLocale, esc, fetchDeadline, handlers, pad, render, toast, trLang.
 * Reads window: __kiwiTeamV2. Mutable UI state is private to this factory. */
export function createCorrections({ Kiwi, dateLocale, esc, fetchDeadline, handlers, pad, render, toast, trLang }) {
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
      const response = await fetchDeadline('/api/team/live', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchant,action:'attendance-correction-decision',correctionId,decision})}, false);
      if (!response.ok) throw new Error('decision-failed');
      const root = window.__kiwiTeamV2;
      Object.keys(root.correctionsByVenue || {}).forEach(key => {root.correctionsByVenue[key] = root.correctionsByVenue[key].filter(item => item.id !== correctionId);});
      render();
    } catch (_) { toast(correctionCopy().error); el.disabled = false; }
  };



  return Object.freeze({ deferredMark, correctionsHtml });
}
