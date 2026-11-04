/* Internal payroll documents reuse the selected period and the payroll view's
 * calculator. Advances and statements live on the server (/api/pay-statements,
 * ruling 5 of 4 Nov 2026): advances are stored per staff member and period, and
 * printing issues a numbered, immutable statement (RP-YYYY-NNNN). A reprint shows
 * the stored number and amounts; changed amounts issue a correction that names
 * the statement it replaces. An advance above the gross is refused before
 * issuing. The device copy of the advances is only a cache for when the server
 * is unreachable: nothing can be issued or printed then. No tax, contribution
 * or payment is posted here. */
import { createArchive, requestIdFor, rowFromStatement } from './pay-statement-archive.js?v=1';
const COPY = {
  fr: { title:'Relevé de paie', notice:'Relevé de paie · document interne, ne remplace pas le bulletin de paie officiel', accountant:'CNSS, AMO et IR : à établir par le comptable. Net avant ces retenues.', period:'Période', hours:'Heures réalisées', rate:'Taux horaire', base:'Salaire de base proratisé', gross:'Brut calculé', advances:'Avances', net:'Net à payer avant retenues', input:'Avances pour cette période, enregistrées sur le serveur (MAD).', print:'Imprimer / PDF', close:'Fermer', missing:'Taux non renseigné', unavailable:'Les données de paie ne sont pas disponibles.', all:'Tous les salariés', ref:'Référence', ice:'ICE employeur', tooHigh:'Les avances de {} dépassent le brut calculé : corrigez avant d\'imprimer.', issued:'Relevés déjà émis pour cette période', reprint:'Réimprimer', replaces:'Remplace le relevé', corrected:'corrigé par', save:'Enregistrer les avances', saved:'Avances enregistrées.', noServer:'Le serveur ne répond pas : rien n\'est émis ni imprimé. Réessayez.', uncertain:'Réponse du serveur illisible : vérifiez la liste des relevés émis avant de réessayer.', refused:'Relevé refusé par le serveur ({}).', cached:'Avances affichées depuis cet appareil, le serveur ne répond pas.' },
  en: { title:'Pay statement', notice:'Pay statement · internal document, does not replace the official payslip', accountant:'CNSS, AMO and IR: to be prepared by the accountant. Net before these deductions.', period:'Period', hours:'Hours worked', rate:'Hourly rate', base:'Prorated base salary', gross:'Calculated gross', advances:'Advances', net:'Net to pay before deductions', input:'Advances for this period, stored on the server (MAD).', print:'Print / PDF', close:'Close', missing:'Rate not entered', unavailable:'Payroll data is unavailable.', all:'All employees', ref:'Reference', ice:'Employer ICE', tooHigh:'Advances for {} exceed the calculated gross: correct them before printing.', issued:'Statements already issued for this period', reprint:'Reprint', replaces:'Replaces statement', corrected:'corrected by', save:'Save advances', saved:'Advances saved.', noServer:'The server is not responding: nothing is issued or printed. Try again.', uncertain:'The server reply was unreadable: check the list of issued statements before trying again.', refused:'Statement refused by the server ({}).', cached:'Advances shown from this device, the server is not responding.' },
  ar: { title:'كشف الأجر', notice:'كشف الأجر · وثيقة داخلية لا تعوض بيان الأجر الرسمي', accountant:'CNSS وAMO وIR: يعدها المحاسب. الصافي قبل هذه الاقتطاعات.', period:'الفترة', hours:'ساعات العمل الفعلية', rate:'أجر الساعة', base:'الأجر الأساسي النسبي', gross:'الإجمالي المحسوب', advances:'التسبيقات', net:'الصافي للدفع قبل الاقتطاعات', input:'تسبيقات هذه الفترة، محفوظة على الخادم (درهم).', print:'طباعة / PDF', close:'إغلاق', missing:'أجر الساعة غير محدد', unavailable:'بيانات الأجور غير متاحة.', all:'جميع الموظفين', ref:'المرجع', ice:'ICE المشغل', tooHigh:'تسبيقات {} تتجاوز الإجمالي المحسوب: صححها قبل الطباعة.', issued:'الكشوف الصادرة لهذه الفترة', reprint:'إعادة الطباعة', replaces:'يحل محل الكشف', corrected:'صُحح بواسطة', save:'حفظ التسبيقات', saved:'تم حفظ التسبيقات.', noServer:'الخادم لا يستجيب: لم يصدر أو يطبع شيء. حاول مرة أخرى.', uncertain:'رد الخادم غير مقروء: تحقق من قائمة الكشوف الصادرة قبل المحاولة مجددا.', refused:'رفض الخادم الكشف ({}).', cached:'التسبيقات معروضة من هذا الجهاز، الخادم لا يستجيب.' }
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
  return `<!doctype html><html lang="${esc(lang)}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><meta charset="utf-8"><title>${esc(c.title)}</title><link rel="stylesheet" href="/assets/tokens.css"><style>body{background:var(--paper);color:var(--ink);font-family:var(--sans);margin:24px}article{break-after:page}article:last-child{break-after:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;text-align:start;border-bottom:1px solid var(--line)}td{text-align:end}p{line-height:1.6}@page{size:A4;margin:18mm}</style><body>${rows.map(r => `<article><h1>${esc(c.title)}</h1><p>${esc(c.notice)}</p><h2>${esc(venue.name || '')} · ${esc(r.name)}</h2><p>${esc(c.ref)} : ${esc(r.ref || '')}${r.replaces ? ' · ' + esc(c.replaces) + ' ' + esc(r.replaces) : ''}${ice ? ' · ' + esc(c.ice) + ' : ' + esc(ice) : ''}</p><p>${esc(c.period)} : ${esc(period.days[0])} · ${esc(period.days.at(-1))}</p><table>${field(c.hours, esc(core.fmtHours(r.hours)))}${field(c.rate, r.rate === null ? esc(c.missing) : money(r.rate))}${field(c.base, money(r.base))}${field(c.gross, r.rated ? money(r.gross) : esc(c.missing))}${field(c.advances, money(r.advance))}${field(c.net, r.rated ? money(r.net) : esc(c.missing))}</table><p>${esc(c.accountant)}</p></article>`).join('')}</body></html>`;
}

export function openPayStatement(core, selected, archiveOverride) {
  const c = copy(core);
  if (!core || core.hours.payrollAccess() !== 'full') return;
  const venue = window.KiwiVenue?.getCurrentVenueData?.();
  if (!venue) return core.toast(c.unavailable, { type:'warning' });
  const members = core.getMembers(core.teamKey(venue));
  const period = core.buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
  if (!members.length || !period.days.length) return core.toast(c.unavailable, { type:'warning' });
  const esc = core.esc;
  const archive = archiveOverride || createArchive(core.teamSlug?.() || window.Kiwi?.__teamProfileCore?.teamSlug?.());
  const cached = savedAdvances(core, venue, period);
  const mdl = core.modal({ title:c.title, width:760,
    body:`<p>${esc(c.notice)}</p><p>${esc(c.period)} : ${esc(period.days[0])} · ${esc(period.days.at(-1))}</p><label>${esc(c.title)}<select data-pay-member><option value="*">${esc(c.all)}</option>${members.map(m => `<option value="${esc(m.id)}"${selected === m.id ? ' selected' : ''}>${esc(core.memberFullName(m))}</option>`).join('')}</select></label><p>${esc(c.input)}</p>${members.map(m => `<label>${esc(core.memberFullName(m))}<input data-pay-advance="${esc(m.id)}" type="number" min="0" step="0.01" value="${cached[m.id] ? (cached[m.id] / 100).toFixed(2) : '0'}" inputmode="decimal"></label>`).join('')}<p>${esc(c.accountant)}</p><div data-pay-issued></div>`,
    foot:`<button class="kb ghost" data-pay-close>${esc(c.close)}</button><button class="kb ghost" data-pay-save>${esc(c.save)}</button><button class="kb atlas" data-pay-print>${esc(c.print)}</button>` });
  const q = selector => mdl.el.querySelector(selector);
  let issued = [];
  const typed = new Map([...mdl.el.querySelectorAll('[data-pay-advance]')].map(input => [input, input.value]));
  const numberOf = id => issued.find(s => s.id === id)?.number || '';
  const renderIssued = () => {
    const box = q('[data-pay-issued]');
    if (!box) return;
    box.innerHTML = issued.length ? `<h3>${esc(c.issued)}</h3><ul>${issued.map(s => `<li>${esc(s.number)} · ${esc(s.memberName)} · ${esc(core.fmtPay(s.netCents / 100))} MAD${s.replacedById ? ' · ' + esc(c.corrected) + ' ' + esc(numberOf(s.replacedById)) : ''} <button class="kb ghost" data-pay-reprint="${esc(s.id)}">${esc(c.reprint)}</button></li>`).join('')}</ul>` : '';
  };
  const failure = error => core.toast(error?.code === 'uncertain' ? c.uncertain : (error?.code === 'offline' || !error?.code) ? c.noServer : c.refused.replace('{}', String(error.code)), { type:'warning' });
  if (archive) archive.forPeriod(period).then(data => {
    issued = Array.isArray(data.statements) ? data.statements : [];
    const stored = {};
    for (const input of mdl.el.querySelectorAll('[data-pay-advance]')) {
      const id = input.getAttribute('data-pay-advance');
      if (Number.isSafeInteger(data.advances?.[id])) { stored[id] = data.advances[id]; if (input.value === typed.get(input)) input.value = data.advances[id] ? (data.advances[id] / 100).toFixed(2) : '0'; }
    }
    saveAdvances(core, venue, period, { ...cached, ...Object.fromEntries(Object.entries(stored).filter(([, cents]) => cents > 0)) });
    renderIssued();
  }).catch(() => { if (Object.keys(cached).length) core.toast(c.cached, { type:'info' }); });

  const show = (rows, forVenue) => {
    const frame = document.createElement('iframe');
    frame.title = c.title;
    frame.style.cssText = 'width:100%;height:50vh;border:0';
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.onload = async () => { await frame.contentDocument.fonts?.ready; frame.contentWindow.focus(); frame.contentWindow.print(); };
    q('[data-pay-preview]')?.remove();
    frame.setAttribute('data-pay-preview', '');
    frame.srcdoc = statementHtml(core, forVenue, period, rows);
    q('.kiwi-modal-body').appendChild(frame);
  };
  const readAdvances = () => {
    const advances = {};
    for (const input of mdl.el.querySelectorAll('[data-pay-advance]')) {
      if (!input.reportValidity()) return null;
      advances[input.getAttribute('data-pay-advance')] = core.payCents(input.value);
    }
    return advances;
  };
  const payload = r => ({ memberId:r.id, memberName:r.name, hours:r.hours, rateCents:r.rate, baseCents:r.base, grossCents:r.gross, advanceCents:r.advance, netCents:r.net, rated:r.rated ? 1 : 0 });
  const sameAmounts = (s, r) => s.grossCents === r.gross && s.advanceCents === r.advance && s.netCents === r.net && !!s.rated === !!r.rated;
  /* One numbered statement per person. Unchanged amounts reuse the stored
   * statement (same number); changed amounts issue a correction naming it. */
  async function issueAll(rows) {
    const live = new Map(issued.filter(s => !s.replacedById).map(s => [s.memberId, s]));
    const out = new Map(), fresh = [], fixes = [];
    for (const r of rows) {
      const cur = live.get(r.id);
      if (!cur) fresh.push(r);
      else if (sameAmounts(cur, r)) out.set(r.id, rowFromStatement(cur, numberOf(cur.replacesId)));
      else fixes.push([r, cur]);
    }
    const info = { name:venue.name || '', ice:/\d/.test(String(venue.ice || '')) ? String(venue.ice).replace(/\D/g, '') : '' };
    if (fresh.length) {
      const items = fresh.map(payload);
      const res = await archive.issue(period, items, { requestId:requestIdFor(period, items), venue:info });
      for (const s of res.statements) { issued.push(s); out.set(s.memberId, rowFromStatement(s)); }
    }
    for (const [r, cur] of fixes) {
      const items = [payload(r)];
      const res = await archive.issue(period, items, { requestId:requestIdFor(period, items, cur.id), replacesId:cur.id, venue:info });
      const s = res.statements[0];
      cur.replacedById = s.id; issued.push(s); out.set(r.id, rowFromStatement(s, cur.number));
    }
    renderIssued();
    return rows.map(r => out.get(r.id));
  }

  q('[data-pay-close]').onclick = () => mdl.close();
  q('[data-pay-save]').onclick = async () => {
    const advances = readAdvances();
    if (!advances) return;
    if (!archive) return core.toast(c.noServer, { type:'warning' });
    try { await archive.saveAdvances(period, advances); }
    catch (error) { return failure(error); }
    saveAdvances(core, venue, period, Object.fromEntries(Object.entries(advances).filter(([, cents]) => cents > 0)));
    core.toast(c.saved, { type:'success' });
  };
  q('[data-pay-print]').onclick = async () => {
    const advances = readAdvances();
    if (!advances) return;
    const id = q('[data-pay-member]').value;
    let rows;
    try { rows = statementRows(core, venue, period, members.filter(m => id === '*' || m.id === id), advances); }
    catch (error) {
      if (error.message !== 'advance-exceeds-gross') throw error;
      return core.toast(c.tooHigh.replace('{}', error.memberName), { type:'warning' });
    }
    if (!archive) return core.toast(c.noServer, { type:'warning' });
    let numbered;
    try { numbered = await issueAll(rows); }
    catch (error) { return failure(error); }
    saveAdvances(core, venue, period, { ...savedAdvances(core, venue, period), ...Object.fromEntries(Object.entries(advances).filter(([key]) => id === '*' || key === id)) });
    show(numbered, venue);
  };
  mdl.el.addEventListener?.('click', async event => {
    const button = event.target?.closest?.('[data-pay-reprint]');
    if (!button || !archive) return;
    try {
      const s = await archive.get(button.getAttribute('data-pay-reprint'));
      show([rowFromStatement(s, numberOf(s.replacesId))], { name:s.snapshot?.venueName || '', ice:s.snapshot?.ice || '' });
    } catch (error) { failure(error); }
  });
}
