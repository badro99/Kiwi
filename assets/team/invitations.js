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
  function makeCode() {
    try {
      const c = window.crypto || window.msCrypto;
      if (c && c.getRandomValues) {
        const a = new Uint32Array(1); c.getRandomValues(a);
        return String(1000 + (a[0] % 9000));
      }
    } catch (_) {}
    return String(1000 + Math.floor(Math.random() * 9000));
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
        email: '', phone: '', password: code || makeCode(), pinCode: code || '',
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
