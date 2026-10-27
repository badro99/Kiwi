/* Owner: invitations. Exports create() through KiwiTeamParts.invitations.
 * Window reads: __kiwiTeamV2, crypto, msCrypto.
 * Instance exports: makeCode, importMembers, setPageActive.
 * lexical imports: ensureVenueData, teamKey, teamSlug, saveCustomTeams, render, AVATAR_TONES.
 * Mutable persistence and credential knowledge belong only to memberState. */
(function () {
  'use strict';
  window.KiwiTeamParts ||= {};
  const parts = window.KiwiTeamParts;
  parts.invitations = Object.freeze({ create(deps) {
  const {
    ensureVenueData,
    teamKey,
    teamSlug,
    saveCustomTeams,
    render,
    AVATAR_TONES,
  } = deps;
  let pageActive = false;
  /* Un code libre : ni celui d'un collègue de `roster` (membres ou codes) ni 0001 (réservé à l'écran cuisine, hors de la plage). */
  function makeCode(roster) {
    const taken = new Set();
    (Array.isArray(roster) ? roster : []).forEach((m) => (m && typeof m === 'object' ? [m.pinCode, m.password] : [m]).forEach((v) => {
      if (/^\d{4}$/.test(String(v || '').trim())) taken.add(String(v).trim());
    }));
    let start = 1000 + Math.floor(Math.random() * 9000);
    try { const a = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(a); start = 1000 + (a[0] % 9000); } catch (_) {}
    for (let i = 0; i < 9000; i++) {   // départ au hasard, puis le premier libre en tournant
      const code = String(1000 + ((start - 1000 + i) % 9000));
      if (!taken.has(code)) return code;
    }
    return String(start);
  }

  const ONB_ROLE_FN = {
    owner:   { fn: 'Propriétaire', dept: 'Direction' },
    manager: { fn: 'Manager',      dept: 'Management' },
    staff:   { fn: 'Équipier',     dept: 'Service' },
  };

  function importMembers(venue, people) {
    if (!venue || !Array.isArray(people) || !people.length) return 0;
    ensureVenueData(venue);
    const key = teamKey(venue);
    const list = window.__kiwiTeamV2.byVenue[key] || (window.__kiwiTeamV2.byVenue[key] = []);
    const hours = window.__kiwiTeamV2.hoursByVenue[key] || (window.__kiwiTeamV2.hoursByVenue[key] = {});
    let added = 0;
    people.forEach((p) => {
      const name = String((p && p.name) || '').trim();
      if (!name) return;
      const code = /^\d{4}$/.test((p && p.code) || '') ? p.code : '';
      const dupe = list.some((m) =>
        (code && m.pinCode === code) ||
        `${m.firstName || ''} ${m.lastName || ''}`.trim().toLowerCase() === name.toLowerCase());
      if (dupe) return;
      const sp = name.indexOf(' ');
      const role = (p && p.role) || 'staff';
      const rm = ONB_ROLE_FN[role] || ONB_ROLE_FN.staff;
      const id = 'mem-' + Math.random().toString(36).slice(2, 10);
      list.push({
        id,
        firstName: sp >= 0 ? name.slice(0, sp) : name,
        lastName: sp >= 0 ? name.slice(sp + 1).trim() : '',
        // One code per person: what onboarding collected IS their till code, so
        // the profile shows the same value the cashier types (it used to show a
        // separate generated password, which opened nothing).
        email: '', phone: '', password: code || makeCode(list), pinCode: code || '',
        function: rm.fn, department: rm.dept, contract: 'CDI',
        startDate: '', endDate: '', baseSalary: 0, hourlyRate: 0,
        languages: [], address: '', cin: '', emergencyName: '', emergencyPhone: '', notes: '',
        avatarTone: AVATAR_TONES[list.length % AVATAR_TONES.length],
        role, venueType: key,
        venueSlug: teamSlug(),
        createdAt: Date.now(),
      });
      hours[id] = {};
      added++;
    });
    if (added) { saveCustomTeams(); if (pageActive) { try { render(); } catch (_) {} } }
    return added;
  }

  return Object.freeze({ makeCode, importMembers, setPageActive(value) { pageActive = value; } });
  } });
})();
