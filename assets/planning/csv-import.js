/* Planning csv-import. Exports: handler registration.
 * Reads injected helpers: Kiwi, esc, getMembers, handlers, live, lockBucket, memberFullName, modal, pad, render, saveCustomTeams, teamKey, trLang.
 * Reads window: KiwiVenue, __kiwiTeamV2. Mutable UI state is private to this factory. */
export function createCsvImport({ Kiwi, esc, getMembers, handlers, live, lockBucket, memberFullName, modal, pad, render, saveCustomTeams, teamKey, trLang }) {
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


  return Object.freeze({  });
}
