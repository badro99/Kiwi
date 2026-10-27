/* Owner: venueScope. Exports create() through KiwiTeamParts.venueScope.
 * Window reads: KiwiCloudDoc, KiwiPlanningCore, KiwiVenue.
 * Instance exports: teamKey, teamVenueKey, teamSlug, memberBelongsToStore, scopeTeamDoc, persistableTeamKey.
 * lexical imports: cleanRemoved, mergeByDay, cleanLocks.
 * Mutable persistence and credential knowledge belong only to memberState. */
(function () {
  'use strict';
  window.KiwiTeamParts ||= {};
  const parts = window.KiwiTeamParts;
  parts.venueScope = Object.freeze({ create(deps) {
  const {
    cleanRemoved,
    mergeByDay,
    cleanLocks,
  } = deps;
  function teamKey(venue) {
    if (venue && venue.custom) {
      /* God Mode uses one synthetic venue id (`scoped`) for every client. Using
       * that id as the Team key made the roster transient on purpose — and also
       * meant an employee visibly created from an operator-opened dashboard was
       * never written to that store's cloud document. Namespace the local key
       * with the server-confirmed slug instead: every client remains isolated,
       * while Équipe behaves like the same dashboard regardless of who opened
       * it. */
      if (venue.id === 'scoped' && venue.slug) return `scoped:${String(venue.slug)}`;
      return venue.id;
    }
    return (venue && venue.type) || 'restaurant';
  }

  const DEMO_TYPE_KEYS = new Set(['restaurant', 'boutique', 'spa', 'hotel']);

  const TRANSIENT_KEYS = new Set(['scoped', 'own']);

  const persistableTeamKey = (k) => !DEMO_TYPE_KEYS.has(k) && !TRANSIENT_KEYS.has(k);

  function teamVenueKey() {
    try {
      const v = window.KiwiVenue?.getCurrentVenueData?.();
      // Un magasin de démonstration garde son équipe semée en mémoire : elle
      // n'appartient à aucun compte et ne doit jamais quitter ce navigateur.
      if (!v || !v.custom) return '';
      const k = teamKey(v);
      return persistableTeamKey(k) ? k : '';
    } catch (_) { return ''; }
  }

  function teamSlug() {
    const k = teamVenueKey();
    try {
      const v = window.KiwiVenue?.getCurrentVenueData?.();
      // `v.slug` only exists after /api/me authenticated the God Mode scope.
      // Never derive this from the visible store name or the URL.
      if (v && v.id === 'scoped' && v.slug) return String(v.slug);
      return k && window.KiwiCloudDoc ? window.KiwiCloudDoc.slugFor(k) : '';
    }
    catch (_) { return ''; }
  }

  function memberBelongsToStore(member, slug) {
    if (!member || !slug) return true;
    if (member.venueSlug) return String(member.venueSlug) === slug;
    try {
      const legacy = member.venueType && window.KiwiCloudDoc
        ? window.KiwiCloudDoc.slugFor(member.venueType) : '';
      return !legacy || legacy === slug;
    } catch (_) { return true; }
  }

  function scopeTeamDoc(doc, slug) {
    const src = doc || {};
    const removed = cleanRemoved(src.removed);
    const gone = Object.create(null);
    removed.forEach((r) => { gone[r.id] = 1; });
    const members = (Array.isArray(src.members) ? src.members : [])
      .filter((m) => memberBelongsToStore(m, slug) && !(m && gone[m.id]));
    const alive = Object.create(null);
    members.forEach((m) => { if (m && m.id) alive[m.id] = 1; });
    return {
      fieldEdits: src.fieldEdits,
      members,
      removed,
      hours: mergeByDay(src.hours, null, alive),
      shifts: mergeByDay(src.shifts, null, alive),
      planning: window.KiwiPlanningCore?.normalize?.(src.planning, members) || src.planning || {},
      locks: cleanLocks(src.locks),
    };
  }

  return Object.freeze({ teamKey, teamVenueKey, teamSlug, memberBelongsToStore, scopeTeamDoc, persistableTeamKey });
  } });
})();
