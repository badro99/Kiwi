/* Pure editor access rules. Dependencies are passed by the host; no DOM or state writes.
 * Function/department policy remains in catalog.js; role authorization remains
 * with KiwiRoles and the server, rather than being duplicated in the editor. */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { window.KiwiTeamParts ||= {}; window.KiwiTeamParts.accessRules = factory(); }
})(function () {
  'use strict';
  function validate(data, st, roster, deps) {
    const { T, isCode, credentialRules, memberFullName, memberState } = deps;
    const getMembers = () => roster;
/* validation:start */
    const errs = [];
    ['firstName', 'lastName', 'email', 'function'].forEach((n) => {
      if (!String(data[n] || '').trim()) errs.push([n, T.edErrRequired]);
    });
    const email = String(data.email || '').trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errs.push(['email', T.vInvalidEmail]);
    if ((data.contract === 'CDD' || data.contract === 'Stage') && data.endDate && data.startDate && data.endDate < data.startDate) {
      errs.push(['endDate', T.vEndAfterStart]);
    }
    // The till's pad is four digits — accepting anything else here hands the
    // owner a code their cashier physically cannot enter.
    const code = (data.password || '').trim();
    if (code && !isCode(code)) errs.push(['password', T.vCode]);

    const venueType = st.venueType;
    const members = getMembers(venueType);
    const prev = st.editing ? members.find((x) => x.id === st.memberId) : null;
    const emailKey = email.toLocaleLowerCase('en');
    if (emailKey && members.some((x) => x.id !== st.memberId && String(x.email || '').trim().toLocaleLowerCase('en') === emailKey)) {
      errs.push(['email', T.vDuplicateEmail]);
    }
    const effectiveCode = code || credentialRules.canonicalCode(prev);
    const holder = effectiveCode && members.find((x) => x.id !== st.memberId && credentialRules.canonicalCode(x) === effectiveCode);
    const who = (String(data.firstName || '') + ' ' + String(data.lastName || '')).trim() || '?';
    if (holder) errs.push(['password', T.vDuplicateCodeNamed(who, memberFullName(holder))]);
    else if (effectiveCode && memberState.reservedCode(effectiveCode)) errs.push(['password', T.vReservedCode]);
/* validation:end */
    return { errs, code, prev, venueType, members };
  }
  function buildMember(data, st, code, prev, members, venueType, deps) {
    const { makeCode, memberCode, credentialRules, teamSlug, AVATAR_TONES, Date, Math } = deps;
/* member:start */
    const savedCode = code || credentialRules.canonicalCode(prev) || (prev && prev.hasCode ? '' : makeCode(members));
    const member = {
      id: st.memberId,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: (data.email || '').trim(),
      phone: (data.phone || '').trim(),
      /* Champ laissé vide = « ne touche pas au code ». En modification on
       * reprend donc celui du membre : sinon corriger un numéro de téléphone
       * régénérait en douce le code du caissier, qui se retrouvait bloqué
       * devant la caisse sans savoir pourquoi. Seule une VRAIE création
       * (aucun code existant) en fabrique un. */
      password: savedCode,
      pinCode: savedCode,
      /* Son code existe mais n'est pas revenu du serveur : on ne lui en invente
         pas un (corriger un numéro de téléphone changerait son code), et son
         drapeau reste, donc rien ne part tant qu'il n'est pas résolu. */
      ...((!code && prev && prev.hasCode && !memberCode(prev)) ? { hasCode: true } : {}),
      function: data.function,
      department: data.department || '',
      contract: data.contract || '',
      startDate: data.startDate || '',
      endDate: (data.contract === 'CDD' || data.contract === 'Stage') ? (data.endDate || '') : '',
      baseSalary: parseFloat(data.baseSalary) || 0,
      hourlyRate: parseFloat(data.hourlyRate) || 0,
      contractHours: Math.min(80, Math.max(0, parseFloat(data.contractHours) || 0)),
      languages: st.languages.slice(),
      address: (data.address || '').trim(),
      cin: (data.cin || '').trim(),
      emergencyName: (data.emergencyName || '').trim(),
      emergencyPhone: (data.emergencyPhone || '').trim(),
      notes: (data.notes || '').trim(),
      avatarTone: st.avatarTone || AVATAR_TONES[Math.floor(Math.random() * AVATAR_TONES.length)],
      venueType,
      venueSlug: teamSlug(),
      createdAt: st.origCreatedAt || Date.now(),
    };
/* member:end */
    return member;
  }
  return Object.freeze({ validate, buildMember });
});
