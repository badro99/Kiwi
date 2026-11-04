/* DOM-free onboarding persistence and confirmed account setup. */
(function (host, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else host.KiwiOnboardingData = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const KEY = 'kiwiOnboardingDraft:v1';
  const DRAFT_NOTE = {
    fr: 'Brouillon non enregistré sur cet appareil : le stockage du navigateur est plein ou bloqué. Exportez le brouillon pour le conserver.',
    en: 'Draft not saved on this device: browser storage is full or blocked. Export the draft to keep it safe.',
    ar: 'لم تُحفظ المسودة على هذا الجهاز: تخزين المتصفح ممتلئ أو محظور. صدّر المسودة للاحتفاظ بها.',
  };

  const SYNC_NOTE = { fr: 'Synchronisation serveur non confirmée. Vérifiez la copie locale ou exportez le brouillon.', en: 'Server sync unconfirmed. Check the local copy or export the draft.', ar: 'مزامنة الخادم غير مؤكدة. تحقق من النسخة المحلية أو صدّر المسودة.' };
  function createDraft(storage, types, goals) {
    let draftKept = true, snapshot = null, exported = null, remote = null, queue = Promise.resolve(), cleared = false, syncFailed = false, revision = 0;
    return {
      saved() { return !syncFailed && (!this.transport || snapshot === remote) && (draftKept || snapshot === exported || snapshot === remote); },
      warning(lang) { return (syncFailed || (this.transport && snapshot !== remote)) ? (SYNC_NOTE[lang] || SYNC_NOTE.fr) : (draftKept || snapshot === exported || snapshot === remote) ? '' : (DRAFT_NOTE[lang] || DRAFT_NOTE.fr); },
      clear() {
        cleared = true;
        storage.del(KEY);
        if (this.transport) queue = queue.catch(() => {}).then(() => this.transport(null)).catch(() => {});
      },
      exportFile(S, browser) {
        this.save(S);
        const url = browser.URL.createObjectURL(new browser.Blob([snapshot], { type: 'application/json' }));
        const link = browser.document.createElement('a');
        link.href = url; link.download = 'kiwi-onboarding.json';
        browser.document.body.appendChild(link); link.click(); link.remove();
        browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000);
        exported = snapshot;
      },
      importFile(text, S) {
        if (text.length > 16384) throw Error('draft-size');
        const d = JSON.parse(text);
        if (!d || typeof d !== 'object' || Array.isArray(d) || !('typeId' in d)) throw Error('draft-format');
        this.load(S, d); this.save(S);
        exported = snapshot;
      },
      async restore(S) {
        if (!this.transport) return;
        try {
          const d = await this.transport();
          let local; try { local = JSON.parse(storage.get(KEY) || 'null'); } catch (_) {}
          revision = Math.max(revision, Number(local?.revision) || 0);
          // Preserve working local answers when a previous server copy is older.
          if (d && ((!local && !snapshot) || (Number(d.revision) || 0) > revision)) { this.load(S, d); this.save(S); remote = snapshot; }
          syncFailed = false;
        } catch (_) { syncFailed = true; }
      },
      async sync() {
        if (!this.transport || !snapshot || cleared || snapshot === remote) return;
        const sent = snapshot;
        queue = queue.catch(() => {}).then(async () => { if (!cleared) { await this.transport(JSON.parse(sent)); remote = sent; syncFailed = false; } });
        try { await queue; return true; } catch (_) { syncFailed = true; return false; }
      },
      // Persist names and roles only. Access codes must be entered after reload.
      save(S) {
        const safe = {
          step: Math.max(0, Math.min(6, Number(S.step) || 0)),
          ownerName: S.ownerName, bizName: S.bizName, typeId: S.typeId,
          venueCount: S.venueCount, city: S.city, teamSize: S.teamSize, teamGiven: !!S.teamGiven,
          goals: Array.isArray(S.goals) ? S.goals.slice(0, goals.length) : [],
          dailyGoal: S.dailyGoal,
          ...(S.device ? { device: S.device } : {}),
          pins: (Array.isArray(S.pins) ? S.pins : []).slice(0, 20).map((p) => ({
            role: p && p.role === 'manager' ? 'manager' : (p && p.role === 'owner' ? 'owner' : 'staff'),
            name: String((p && p.name) || '').slice(0, 20), code: '',
          })),
        };
        const previous = snapshot && JSON.parse(snapshot);
        if (!previous || JSON.stringify({ ...previous, revision: undefined }) !== JSON.stringify(safe)) revision = Math.max(Date.now(), revision + 1);
        snapshot = JSON.stringify({ ...safe, revision });
        try { draftKept = storage.set(KEY, snapshot) === true; }
        catch (_) { draftKept = false; }
        return draftKept;
      },
      load(S, supplied) {
        let d = supplied || null;
        if (!supplied) try { d = JSON.parse(storage.get(KEY) || 'null'); } catch (_) {}
        if (!d || typeof d !== 'object') return;
        revision = Math.max(revision, Number(d.revision) || 0);
        const knownType = types.includes(d.typeId);
        S.step = Math.max(0, Math.min(6, Number(d.step) || 0));
        S.ownerName = String(d.ownerName || '').slice(0, 40);
        S.bizName = String(d.bizName || '').slice(0, 60);
        S.typeId = knownType ? d.typeId : S.typeId;
        S.venueCount = Math.max(1, Math.min(60, Number(d.venueCount) || 1));
        S.city = String(d.city || '').slice(0, 30);
        S.teamSize = Math.max(1, Math.min(200, Number(d.teamSize) || 1));
        S.teamGiven = !!d.teamGiven;
        S.goals = Array.isArray(d.goals) ? d.goals.filter((g) => goals.includes(g)).slice(0, goals.length) : [];
        S.dailyGoal = String(d.dailyGoal || '').slice(0, 24);
        if (supplied && !d.device) delete S.device;
        if (supplied && Array.isArray(d.pins) && !d.pins.length) S.pins = [];
        if (['till', 'kds', 'team', 'dashboard'].includes(d.device)) S.device = d.device;
        if (Array.isArray(d.pins) && d.pins.length) {
          S.pins = d.pins.slice(0, 20).map((p, i) => ({
            role: i === 0 ? 'owner' : (p && p.role === 'manager' ? 'manager' : 'staff'),
            name: String((p && p.name) || '').slice(0, 20), code: '',
          }));
        }
      },
    };
  }
  const FILE_COPY = {
    fr: ['Exporter le brouillon', 'Importer un brouillon', 'Fichier de brouillon invalide.'],
    en: ['Export draft', 'Import draft', 'Invalid draft file.'],
    ar: ['تصدير المسودة', 'استيراد مسودة', 'ملف المسودة غير صالح.'],
  };
  function mountRecovery(container, draft, S, lang, browser, refresh, first) {
    const copy = FILE_COPY[lang] || FILE_COPY.fr;
    if (!draft.saved()) {
      const button = browser.document.createElement('button');
      button.type = 'button'; button.textContent = copy[0];
      button.onclick = () => { draft.exportFile(S, browser); refresh(); };
      container.appendChild(button);
    }
    if (first) {
      const label = browser.document.createElement('label');
      label.textContent = copy[1];
      const input = browser.document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.onchange = async () => {
        try { const file = input.files[0]; if (!file) return; if (file.size > 16384) throw Error('size'); draft.importFile(await file.text(), S); refresh(true); }
        catch (_) { const error = browser.document.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = copy[2]; container.appendChild(error); }
      };
      label.appendChild(input); container.appendChild(label);
    }
  }
  async function submit({ S, t, goal, tr, storage, venueApi, teamApi }) {
    const validPins = S.pins.filter((p) => /^\d{4}$/.test(p.code)).map((p) => ({
      role: p.role, code: p.code,
      name: p.name || (p.role === 'owner' ? (S.ownerName || tr({ fr: 'Propriétaire', en: 'Owner', ar: 'المالك' })) : ''),
    }));
    let vid = null;
    {
      vid = venueApi && venueApi.createVenue && await venueApi.createVenue({
        type: t.base, subtype: t.id, throwOnError: true,
        name: S.bizName.trim() || tr({ fr: 'Mon activité', en: 'My business', ar: 'نشاطي' }),
        location: S.city.trim(), pins: validPins,
        goal: goal || 0,
        staffCount: S.teamGiven ? S.teamSize : 0,
        profile: { goals: S.goals, venueCount: S.venueCount, owner: S.ownerName.trim() },
      });
    }
    if (!vid) return null;
    storage.set('kiwiOwnerName', S.ownerName.trim());
    storage.set('kiwiBizName', S.bizName.trim());
    storage.set('kiwiBizType', S.typeId);
    storage.set('kiwiCity', S.city.trim());
    storage.set('kiwiVenueCount', String(S.venueCount));
    if (S.teamGiven) storage.set('kiwiTeamSize', String(S.teamSize)); else storage.del('kiwiTeamSize');
    storage.set('kiwiGoals', JSON.stringify(S.goals));
    /* Les codes sont partis avec la création confirmée, vers le serveur : c'est
       lui qui les compare. Ce navigateur n'en garde AUCUN (kiwiPins, en clair, a
       été retiré) ; le premier déverrouillage en ligne écrit la ligne salée dont
       la porte a besoin hors ligne (assets/dashboard-pin-vault.js). */
    storage.del('kiwiPins');
    // PINs and type were sent with the confirmed creation to the NEW slug.
    storage.set('kiwiRole', 'owner');
    storage.set('kiwiOnboarded', '1');
    storage.del('kiwiSkipOnboard');

    try { if (venueApi.setVenue) venueApi.setVenue(vid); } catch (_) {}

    /* Seed the entered staff into the REAL per-venue roster (team.js) so they
     * persist and show on the Équipe page. */
    try {
      const teamPeople = S.pins.map((p) => ({
        role: p.role,
        code: /^\d{4}$/.test(p.code) ? p.code : '',
        name: (p.name || '').trim() || (p.role === 'owner' ? (S.ownerName || '').trim() : ''),
      })).filter((p) => p.name);
      const venue = venueApi && venueApi.getCurrentVenueData && venueApi.getCurrentVenueData();
      if (venue && teamApi && teamApi.importMembers) teamApi.importMembers(venue, teamPeople);
    } catch (_) {}

    storage.del(KEY);
    return vid;
  }
  /* Session interface: createSession({ TYPES, tr }) owns all onboarding answers.
   * Renderers read state and call update(), fitPinsToTeam(), validation and submit().
   * Reads only injected trades/translator, submission adapters and this data module.
   * No window, DOM, sibling renderer or storage globals. */
  function createSession({ TYPES, tr }) {
  const S = {
    step: 0,
    /* No type is pre-selected: a shop that taps Continue must not be filed as a
       restaurant and load the wrong vertical. Continue waits for a choice. */
    ownerName: '', bizName: '', typeId: '',
    venueCount: 1, city: '',
    teamSize: 3, teamGiven: false,
    goals: [], dailyGoal: '',
    pins: [ { role: 'owner', name: '', code: '' }, { role: 'manager', name: '', code: '' }, { role: 'staff', name: '', code: '' }, { role: 'staff', name: '', code: '' } ],
  };

  const RESERVED = ['0000', '0505', '1111', '0909']; // demo codes — keep them free

  const TYPE_HINT = { fr: 'Choisissez votre type d’activité pour continuer.', en: 'Choose your type of business to continue.', ar: 'اختر نوع نشاطك للمتابعة.' };

  function fitPinsToTeam() {
    const want = S.teamGiven ? (+S.teamSize || 1) : 1;
    if (S.pinsFitFor === want) return;
    const rest = S.pins.slice(1);
    if (rest.some((p) => (p.name || '').trim() || (p.code || '').trim())) return;
    S.pinsFitFor = want;
    const others = Math.max(0, Math.min(3, want - 1));
    const roles = others >= 2 ? ['manager'].concat(Array(others - 1).fill('staff')) : Array(others).fill('staff');
    S.pins = [S.pins[0] || { role: 'owner', name: '', code: '' }].concat(roles.map((role) => ({ role, name: '', code: '' })));
  }

  function parsedDailyGoal() {
    const raw = String(S.dailyGoal == null ? '' : S.dailyGoal).trim();
    if (!raw) return 0;
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return null;
    const amount = Number(raw.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) return null;
    return Math.round(amount * 100) / 100;
  }

  function validate() {
    if ((S.step === 1 || S.step === 7) && !S.ownerName.trim()) return tr({ fr: 'Indiquez votre prénom.', en: 'Enter your first name.', ar: 'أدخل اسمك.' });
    if ((S.step === 2 || S.step === 7) && !S.bizName.trim()) return tr({ fr: 'Donnez un nom à votre établissement.', en: 'Give your business a name.', ar: 'أدخل اسم نشاطك.' });
    if ((S.step === 2 || S.step === 7) && !TYPES.some((t) => t.id === S.typeId)) return tr(TYPE_HINT);
    if (S.step === 5 && parsedDailyGoal() === null) return tr({ fr: 'Saisissez un objectif positif, avec au maximum deux décimales.', en: 'Enter a positive target with at most two decimal places.', ar: 'أدخل هدفاً موجباً بمنزلتين عشريتين كحد أقصى.' });
    if (S.step === 6 || S.step === 7) {
      const owner = S.pins[0];
      if (!/^\d{4}$/.test(owner.code)) return tr({ fr: 'Choisissez votre code à 4 chiffres (le vôtre est obligatoire).', en: 'Choose your 4-digit code (yours is required).', ar: 'اختر رمزك المكوّن من 4 أرقام.' });
      const seen = {};
      for (const p of S.pins) {
        if (!p.code) continue;
        if (!/^\d{4}$/.test(p.code)) return tr({ fr: 'Chaque code doit faire exactement 4 chiffres.', en: 'Each code must be exactly 4 digits.', ar: 'كل رمز يجب أن يكون 4 أرقام.' });
        if (RESERVED.includes(p.code)) return tr({ fr: 'Le code ' + p.code + ' est réservé à la démo, choisissez-en un autre.', en: 'Code ' + p.code + ' is reserved for the demo, pick another.', ar: 'الرمز ' + p.code + ' محجوز، اختر غيره.' });
        if (seen[p.code]) return tr({ fr: 'Deux personnes ont le même code, chaque code doit être unique.', en: 'Two people share a code, each must be unique.', ar: 'رمزان متطابقان، يجب أن يكون كل رمز فريداً.' });
        seen[p.code] = 1;
      }
    }
    return null;
  }

  function kitCodeProblem(code) {
    if (!/^\d{4}$/.test(code)) return tr({ fr: 'Choisissez votre code à 4 chiffres (le vôtre est obligatoire).', en: 'Choose your 4-digit code (yours is required).', ar: 'اختر رمزك المكوّن من 4 أرقام.' });
    if (RESERVED.includes(code)) return tr({ fr: 'Le code ' + code + ' est réservé à la démo, choisissez-en un autre.', en: 'Code ' + code + ' is reserved for the demo, pick another.', ar: 'الرمز ' + code + ' محجوز، اختر غيره.' });
    return null;
  }

  function kitProblem() {
    if (!TYPES.some((t) => t.id === S.typeId)) return tr(TYPE_HINT);
    if (parsedDailyGoal() === null) return tr({ fr: 'Saisissez un objectif positif, avec au maximum deux décimales.', en: 'Enter a positive target with at most two decimal places.', ar: 'أدخل هدفاً موجباً بمنزلتين عشريتين كحد أقصى.' });
    return kitCodeProblem(S.pins[0] && S.pins[0].code);
  }

  let finishing = false;
    return {
      state: S, reserved: RESERVED, typeHint: TYPE_HINT,
      isSubmitting: () => finishing,
      setSubmitting(value) { finishing = value; },
      update(answers) { Object.assign(S, answers); },
      updatePin(index, answers) { if (S.pins[index]) Object.assign(S.pins[index], answers); },
      addPin() { S.pins.push({ role: 'staff', name: '', code: '' }); },
      removePin(index) { if (index > 0 && S.pins.length > 1) S.pins.splice(index, 1); },
      fitPinsToTeam, parsedDailyGoal, validate, kitCodeProblem, kitProblem,
      finalProblem() {
        const step = S.step;
        try { S.step = 7; return validate(); }
        finally { S.step = step; }
      },
      submit(adapters) { return submit({ ...adapters, S, t: TYPES.find((t) => t.id === S.typeId) || TYPES[0], goal: parsedDailyGoal(), tr }); },
    };
  }

  // Saved answers only: no storage, DOM, clock or credentials in this projection.
  /* The recap the wizard shows before "create", in the wizard's language. */
  const RECAP = {
    fr: { business: 'Établissement', plan: 'Offre', team: 'Équipe', menu: 'Menu', catalogue: 'Catalogue', devices: 'Appareil', none: 'Non renseigné', noneF: 'Non renseignée', person: 'personne', people: 'personnes', later: 'À configurer après la création', till: 'Caisse', kds: 'Écran cuisine', teamDevice: 'Appareil équipe', dashboard: 'Tableau de bord', kind: 'Activité', goals: 'Objectifs', code: 'Code personnel', device: 'Appareil', done: 'Terminé', todo: 'À compléter', next: 'Action suivante : ', finish: 'Créer mon espace' },
    en: { business: 'Business', plan: 'Plan', team: 'Team', menu: 'Menu', catalogue: 'Catalogue', devices: 'Device', none: 'Not given', noneF: 'Not given', person: 'person', people: 'people', later: 'To set up after creation', till: 'Till', kds: 'Kitchen screen', teamDevice: 'Team device', dashboard: 'Dashboard', kind: 'Business type', goals: 'Goals', code: 'Personal code', device: 'Device', done: 'Done', todo: 'To complete', next: 'Next step: ', finish: 'Create my space' },
    ar: { business: 'النشاط', plan: 'الباقة', team: 'الفريق', menu: 'القائمة', catalogue: 'الكتالوج', devices: 'الجهاز', none: 'غير محدد', noneF: 'غير محددة', person: 'شخص', people: 'أشخاص', later: 'يُضبط بعد الإنشاء', till: 'الصندوق', kds: 'شاشة المطبخ', teamDevice: 'جهاز الفريق', dashboard: 'لوحة القيادة', kind: 'نوع النشاط', goals: 'الأهداف', code: 'الرمز الشخصي', device: 'الجهاز', done: 'مكتمل', todo: 'للإكمال', next: 'الخطوة التالية: ', finish: 'إنشاء مساحتي' },
  };
  const recapText = (lang) => RECAP[lang] || RECAP.fr;
  function viewModel(S, types, lang) {
    const L = recapText(lang);
    const type = types.find((t) => t.id === S.typeId);
    const restaurant = !!type && type.base === 'restaurant';
    const steps = [
      { id: 'kind', done: !!type },
      { id: 'goals', done: Array.isArray(S.goals) && S.goals.length > 0 },
      { id: 'code', done: !!(S.pins && S.pins[0] && /^\d{4}$/.test(S.pins[0].code)) },
      { id: 'device', done: ['till', 'kds', 'team', 'dashboard'].includes(S.device) },
    ];
    const recap = [
      { id: 'business', label: L.business, value: S.bizName || L.none },
      { id: 'plan', label: L.plan, value: S.plan || L.noneF },
      { id: 'team', label: L.team, value: S.teamGiven ? String(S.teamSize) + ' ' + (S.teamSize === 1 ? L.person : L.people) : L.noneF },
      { id: restaurant ? 'menu' : 'catalogue', label: restaurant ? L.menu : L.catalogue, value: L.later },
      { id: 'devices', label: L.devices, value: ({ till: L.till, kds: L.kds, team: L.teamDevice, dashboard: L.dashboard })[S.device] || L.none },
    ];
    return { steps, recap, lang: RECAP[lang] ? lang : 'fr', nextAction: (steps.find((step) => !step.done) || { id: 'finish' }).id };
  }
  function presentation(model, esc, lang) {
    const L = recapText(lang || model.lang);
    const labels = { kind: L.kind, goals: L.goals, code: L.code, device: L.device };
    return '<div data-onboarding-summary data-next="' + esc(model.nextAction) + '">' +
      model.steps.map((step) => '<p data-setup-step="' + step.id + '" data-done="' + step.done + '">' + labels[step.id] + ' · ' + (step.done ? L.done : L.todo) + '</p>').join('') +
      model.recap.map((line) => '<div class="r" data-recap="' + line.id + '"><span>' + esc(line.label) + '</span><b>' + esc(line.value) + '</b></div>').join('') + '<p>' + L.next + (labels[model.nextAction] || L.finish) + '</p></div>';
  }
  return { createSession, createDraft, mountRecovery, submit, DRAFT_NOTE, viewModel, presentation };
});
