/* Internal payroll documents reuse the selected period and the payroll view's
 * calculator. Advances are entered here (Kiwi has no salary-advance ledger); the
 * last values entered for a period are kept on this device so a reprint or a
 * second statement does not lose them, and an advance above the gross is refused
 * before printing. No tax, contribution or payment is posted here. */
const COPY = {
  fr: { title:'Relevé de paie', notice:'Relevé de paie · document interne, ne remplace pas le bulletin de paie officiel', accountant:'CNSS, AMO et IR : à établir par le comptable. Net avant ces retenues.', period:'Période', hours:'Heures réalisées', rate:'Taux horaire', base:'Salaire de base proratisé', gross:'Brut calculé', advances:'Avances', net:'Net à payer avant retenues', input:'Avances pour cette période, à vérifier et saisir pour ce document uniquement (MAD).', print:'Imprimer / PDF', close:'Fermer', missing:'Taux non renseigné', unavailable:'Les données de paie ne sont pas disponibles.', all:'Tous les salariés', ref:'Référence', ice:'ICE employeur', tooHigh:'Les avances de {} dépassent le brut calculé : corrigez avant d\'imprimer.' },
  en: { title:'Pay statement', notice:'Pay statement · internal document, does not replace the official payslip', accountant:'CNSS, AMO and IR: to be prepared by the accountant. Net before these deductions.', period:'Period', hours:'Hours worked', rate:'Hourly rate', base:'Prorated base salary', gross:'Calculated gross', advances:'Advances', net:'Net to pay before deductions', input:'Advances for this period, verify and enter for this document only (MAD).', print:'Print / PDF', close:'Close', missing:'Rate not entered', unavailable:'Payroll data is unavailable.', all:'All employees', ref:'Reference', ice:'Employer ICE', tooHigh:'Advances for {} exceed the calculated gross: correct them before printing.' },
  ar: { title:'كشف الأجر', notice:'كشف الأجر · وثيقة داخلية لا تعوض بيان الأجر الرسمي', accountant:'CNSS وAMO وIR: يعدها المحاسب. الصافي قبل هذه الاقتطاعات.', period:'الفترة', hours:'ساعات العمل الفعلية', rate:'أجر الساعة', base:'الأجر الأساسي النسبي', gross:'الإجمالي المحسوب', advances:'التسبيقات', net:'الصافي للدفع قبل الاقتطاعات', input:'تحقق من تسبيقات هذه الفترة وأدخلها لهذه الوثيقة فقط (درهم).', print:'طباعة / PDF', close:'إغلاق', missing:'أجر الساعة غير محدد', unavailable:'بيانات الأجور غير متاحة.', all:'جميع الموظفين', ref:'المرجع', ice:'ICE المشغل', tooHigh:'تسبيقات {} تتجاوز الإجمالي المحسوب: صححها قبل الطباعة.' }
};
const copy = core => COPY[core?.trLang()] || COPY.fr;

const advanceKey = (core, venue, period) => 'kiwiPayAdvances:' + core.teamKey(venue) + ':' + String(period.days[0]);
export function savedAdvances(core, venue, period, storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(advanceKey(core, venue, period)) || '{}');
    const clean = {};
    for (const [id, cents] of Object.entries(parsed || {})) if (Number.isSafeInteger(cents) && cents > 0) clean[id] = cents;
    return clean;
  } catch (_) { return {}; }
}
export function saveAdvances(core, venue, period, advances, storage = globalThis.localStorage) {
  try { storage.setItem(advanceKey(core, venue, period), JSON.stringify(advances)); return true; } catch (_) { return false; }
}

export function statementRows(core, venue, period, members, advances = {}) {
  const key = core.teamKey(venue);
  return members.map(member => {
    const f = core.payrollFigures([member], key, period);
    const base = core.payCents(f.baseDue), gross = base + core.payCents(f.variablePay);
    const advance = advances[member.id] || 0;
    if (!Number.isSafeInteger(advance) || advance < 0) throw new Error('invalid-advance');
    const rated = f.rated || f.salaried;
    if (rated && advance > gross) throw Object.assign(new Error('advance-exceeds-gross'), { memberId:member.id, memberName:core.memberFullName(member) });
    return { id:member.id, name:core.memberFullName(member), hours:f.totalHours,
      ref:'RP-' + String(period.days[0]).replace(/\D/g, '') + '-' + String(member.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 24),
      rate: +member.hourlyRate > 0 ? core.payCents(member.hourlyRate) : null,
      base, gross, advance, net:gross - advance, rated };
  });
}

export function statementHtml(core, venue, period, rows) {
  const c = copy(core), esc = core.esc, lang = core.trLang();
  const money = n => esc(core.fmtPay(n / 100)) + ' MAD';
  const ice = /\d/.test(String(venue.ice || '')) ? String(venue.ice) : '';
  const field = (label, value) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;
  return `<!doctype html><html lang="${esc(lang)}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><meta charset="utf-8"><title>${esc(c.title)}</title><link rel="stylesheet" href="/assets/tokens.css"><style>body{background:var(--paper);color:var(--ink);font-family:var(--sans);margin:24px}article{break-after:page}article:last-child{break-after:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;text-align:start;border-bottom:1px solid var(--line)}td{text-align:end}p{line-height:1.6}@page{size:A4;margin:18mm}</style><body>${rows.map(r => `<article><h1>${esc(c.title)}</h1><p>${esc(c.notice)}</p><h2>${esc(venue.name || '')} · ${esc(r.name)}</h2><p>${esc(c.ref)} : ${esc(r.ref || '')}${ice ? ' · ' + esc(c.ice) + ' : ' + esc(ice) : ''}</p><p>${esc(c.period)} : ${esc(period.days[0])} · ${esc(period.days.at(-1))}</p><table>${field(c.hours, esc(core.fmtHours(r.hours)))}${field(c.rate, r.rate === null ? esc(c.missing) : money(r.rate))}${field(c.base, money(r.base))}${field(c.gross, r.rated ? money(r.gross) : esc(c.missing))}${field(c.advances, money(r.advance))}${field(c.net, r.rated ? money(r.net) : esc(c.missing))}</table><p>${esc(c.accountant)}</p></article>`).join('')}</body></html>`;
}

export function openPayStatement(core, selected) {
  const c = copy(core);
  if (!core || core.hours.payrollAccess() !== 'full') return;
  const venue = window.KiwiVenue?.getCurrentVenueData?.();
  if (!venue) return core.toast(c.unavailable, { type:'warning' });
  const members = core.getMembers(core.teamKey(venue));
  const period = core.buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
  if (!members.length || !period.days.length) return core.toast(c.unavailable, { type:'warning' });
  const esc = core.esc;
  const saved = savedAdvances(core, venue, period);
  const mdl = core.modal({ title:c.title, width:760,
    body:`<p>${esc(c.notice)}</p><p>${esc(c.period)} : ${esc(period.days[0])} · ${esc(period.days.at(-1))}</p><label>${esc(c.title)}<select data-pay-member><option value="*">${esc(c.all)}</option>${members.map(m => `<option value="${esc(m.id)}"${selected === m.id ? ' selected' : ''}>${esc(core.memberFullName(m))}</option>`).join('')}</select></label><p>${esc(c.input)}</p>${members.map(m => `<label>${esc(core.memberFullName(m))}<input data-pay-advance="${esc(m.id)}" type="number" min="0" step="0.01" value="${saved[m.id] ? (saved[m.id] / 100).toFixed(2) : '0'}" inputmode="decimal"></label>`).join('')}<p>${esc(c.accountant)}</p>`,
    foot:`<button class="kb ghost" data-pay-close>${esc(c.close)}</button><button class="kb atlas" data-pay-print>${esc(c.print)}</button>` });
  mdl.el.querySelector('[data-pay-close]').onclick = () => mdl.close();
  mdl.el.querySelector('[data-pay-print]').onclick = () => {
    const advances = {};
    for (const input of mdl.el.querySelectorAll('[data-pay-advance]')) {
      if (!input.reportValidity()) return;
      advances[input.getAttribute('data-pay-advance')] = core.payCents(input.value);
    }
    const id = mdl.el.querySelector('[data-pay-member]').value;
    let rows;
    try { rows = statementRows(core, venue, period, members.filter(m => id === '*' || m.id === id), advances); }
    catch (error) {
      if (error.message !== 'advance-exceeds-gross') throw error;
      return core.toast(c.tooHigh.replace('{}', error.memberName), { type:'warning' });
    }
    saveAdvances(core, venue, period, { ...savedAdvances(core, venue, period), ...Object.fromEntries(Object.entries(advances).filter(([key]) => id === '*' || key === id)) });
    const frame = document.createElement('iframe');
    frame.title = c.title;
    frame.style.cssText = 'width:100%;height:50vh;border:0';
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.onload = async () => { await frame.contentDocument.fonts?.ready; frame.contentWindow.focus(); frame.contentWindow.print(); };
    mdl.el.querySelector('[data-pay-preview]')?.remove();
    frame.setAttribute('data-pay-preview', '');
    frame.srcdoc = statementHtml(core, venue, period, rows);
    mdl.el.querySelector('.kiwi-modal-body').appendChild(frame);
  };
}
