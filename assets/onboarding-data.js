/* DOM-free onboarding persistence and confirmed account setup. */
(function (host, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else host.KiwiOnboardingData = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const KEY = 'kiwiOnboardingDraft:v1';
  const DRAFT_NOTE = {
    fr: 'Brouillon non enregistré sur cet appareil : le stockage du navigateur est plein ou bloqué. Terminez la configuration sans recharger la page.',
    en: 'Draft not saved on this device: browser storage is full or blocked. Finish setup without reloading the page.',
    ar: 'لم تُحفظ المسودة على هذا الجهاز: تخزين المتصفح ممتلئ أو محظور. أكمل الإعداد دون إعادة تحميل الصفحة.',
  };

  function createDraft(storage, types, goals) {
    let draftKept = true;
    return {
      saved: () => draftKept,
      warning: (lang) => draftKept ? '' : (DRAFT_NOTE[lang] || DRAFT_NOTE.fr),
      clear: () => storage.del(KEY),
      // Persist names and roles only. Access codes must be entered after reload.
      save(S) {
        const safe = {
          step: Math.max(0, Math.min(6, Number(S.step) || 0)),
          ownerName: S.ownerName, bizName: S.bizName, typeId: S.typeId,
          venueCount: S.venueCount, city: S.city, teamSize: S.teamSize, teamGiven: !!S.teamGiven,
          goals: Array.isArray(S.goals) ? S.goals.slice(0, goals.length) : [],
          dailyGoal: S.dailyGoal,
          pins: (Array.isArray(S.pins) ? S.pins : []).slice(0, 20).map((p) => ({
            role: p && p.role === 'manager' ? 'manager' : (p && p.role === 'owner' ? 'owner' : 'staff'),
            name: String((p && p.name) || '').slice(0, 20), code: '',
          })),
        };
        try { draftKept = storage.set(KEY, JSON.stringify(safe)) === true; }
        catch (_) { draftKept = false; }
        return draftKept;
      },
      load(S) {
        let d = null;
        try { d = JSON.parse(storage.get(KEY) || 'null'); } catch (_) {}
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
        if (Array.isArray(d.pins) && d.pins.length) {
          S.pins = d.pins.slice(0, 20).map((p, i) => ({
            role: i === 0 ? 'owner' : (p && p.role === 'manager' ? 'manager' : 'staff'),
            name: String((p && p.name) || '').slice(0, 20), code: '',
          }));
        }
      },
    };
  }
  async function submit({ S, t, goal, tr, storage, venueApi, teamApi }) {
    const validPins = S.pins.filter((p) => /^\d{4}$/.test(p.code)).map((p) => ({
      role: p.role, code: p.code,
      name: p.name || (p.role === 'owner' ? (S.ownerName || tr({ fr: 'Propriétaire', en: 'Owner', ar: 'المالك' })) : ''),
    }));
    let vid = null;
    try {
      vid = venueApi && venueApi.createVenue && await venueApi.createVenue({
        type: t.base, subtype: t.id,
        name: S.bizName.trim() || tr({ fr: 'Mon activité', en: 'My business', ar: 'نشاطي' }),
        location: S.city.trim(), pins: validPins,
        goal: goal || 0,
        staffCount: S.teamGiven ? S.teamSize : 0,
        profile: { goals: S.goals, venueCount: S.venueCount, owner: S.ownerName.trim() },
      });
    } catch (_) {}
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
  return { createDraft, submit, DRAFT_NOTE };
});
