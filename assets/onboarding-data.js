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

  function createDraft(storage, types, goals) {
    let draftKept = true, snapshot = null, exported = null, remote = null, queue = Promise.resolve(), cleared = false;
    return {
      saved: () => draftKept || snapshot === exported || snapshot === remote,
      warning: (lang) => (draftKept || snapshot === exported || snapshot === remote) ? '' : (DRAFT_NOTE[lang] || DRAFT_NOTE.fr),
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
          let local; try { local = storage.get(KEY); } catch (_) {}
          // Preserve working local answers when a previous server copy is older.
          if (d && !local) { this.load(S, d); this.save(S); remote = snapshot; }
        } catch (_) {}
      },
      async sync() {
        if (!this.transport || !snapshot || cleared || snapshot === remote) return;
        const sent = snapshot;
        queue = queue.catch(() => {}).then(async () => { if (!cleared) { await this.transport(JSON.parse(sent)); remote = sent; } });
        try { await queue; } catch (_) {}
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
        snapshot = JSON.stringify(safe);
        try { draftKept = storage.set(KEY, snapshot) === true; }
        catch (_) { draftKept = false; }
        return draftKept;
      },
      load(S, supplied) {
        let d = supplied || null;
        if (!supplied) try { d = JSON.parse(storage.get(KEY) || 'null'); } catch (_) {}
        if (!d || typeof d !== 'object') return;
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
  // Saved answers only: no storage, DOM, clock or credentials in this projection.
  function viewModel(S, types) {
    const type = types.find((t) => t.id === S.typeId);
    const restaurant = !!type && type.base === 'restaurant';
    const steps = [
      { id: 'kind', done: !!type },
      { id: 'goals', done: Array.isArray(S.goals) && S.goals.length > 0 },
      { id: 'code', done: !!(S.pins && S.pins[0] && /^\d{4}$/.test(S.pins[0].code)) },
      { id: 'device', done: ['till', 'kds', 'team', 'dashboard'].includes(S.device) },
    ];
    const recap = [
      { id: 'business', label: 'Établissement', value: S.bizName || 'Non renseigné' },
      { id: 'plan', label: 'Offre', value: S.plan || 'Non renseignée' },
      { id: 'team', label: 'Équipe', value: S.teamGiven ? String(S.teamSize) + (S.teamSize === 1 ? ' personne' : ' personnes') : 'Non renseignée' },
      { id: restaurant ? 'menu' : 'catalogue', label: restaurant ? 'Menu' : 'Catalogue', value: 'À configurer après la création' },
      { id: 'devices', label: 'Appareil', value: ({ till: 'Caisse', kds: 'Écran cuisine', team: 'Appareil équipe', dashboard: 'Tableau de bord' })[S.device] || 'Non renseigné' },
    ];
    return { steps, recap, nextAction: (steps.find((step) => !step.done) || { id: 'finish' }).id };
  }
  function presentation(model, esc) {
    const labels = { kind: 'Activité', goals: 'Objectifs', code: 'Code personnel', device: 'Appareil' };
    return '<div data-onboarding-summary data-next="' + esc(model.nextAction) + '">' +
      model.steps.map((step) => '<p data-setup-step="' + step.id + '" data-done="' + step.done + '">' + labels[step.id] + ' · ' + (step.done ? 'Terminé' : 'À compléter') + '</p>').join('') +
      model.recap.map((line) => '<div class="r" data-recap="' + line.id + '"><span>' + line.label + '</span><b>' + esc(line.value) + '</b></div>').join('') + '<p>Action suivante : ' + (labels[model.nextAction] || 'Créer mon espace') + '</p></div>';
  }
  return { createDraft, mountRecovery, submit, DRAFT_NOTE, viewModel, presentation };
});
