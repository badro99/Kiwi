/* Owner: memberState. Exports create() through KiwiTeamParts.memberState.
 * Window reads: Kiwi, KiwiCloudDoc, KiwiConfig, KiwiPlanningCore, KiwiVenue, __kiwiTeamV2, __kiwiTenantPurging, dispatchEvent.
 * Instance exports: isCode, memberCode, codeUnresolved, rosterHasUnresolved, diskMembers, outboundMembers, fillCodes, applyServerCodes, publishPins, teamAccount, rosterWriteBlocked, loadCustomTeams, cleanRemoved, mergeRemoved, cleanLocks, mergeLocks, persistTeams, afterTeamChange, saveCustomTeams, mergeByDay, mergeTeamDoc, teamCloudInit, teamReadTimedOut, hydrateCodes, teamCloudBind, teamCloudPush, ensureVenueData, getMembers, getHours, getShifts, periodOffsets, current, setPageActive, resetReadFailure.
 * lexical imports: fetchDeadline, teamKey, teamVenueKey, teamSlug, memberBelongsToStore, scopeTeamDoc, persistableTeamKey, memberFullName, restorePeriodLock, buildPeriod, render, trLang, toast, seedFor, seedHours.
 * Mutable persistence and credential knowledge belong only to memberState. */
(function () {
  'use strict';
  window.KiwiTeamParts ||= {};
  const parts = window.KiwiTeamParts;
  parts.memberState = Object.freeze({ create(deps) {
  const {
    fetchDeadline,
    teamKey,
    teamVenueKey,
    teamSlug,
    memberBelongsToStore,
    scopeTeamDoc,
    persistableTeamKey,
    memberFullName,
    restorePeriodLock,
    buildPeriod,
    render,
    trLang,
    toast,
    seedFor,
    seedHours,
  } = deps;
  let pageActive = false;
  /* ═══════════════ LES CODES NE RESTENT PAS SUR LE DISQUE ═══════════════════
   * Chaque salarié porte le code à quatre chiffres qui lui ouvre la caisse et
   * l'app employé (`pinCode` / `password`). Il était écrit EN CLAIR dans
   * localStorage (kiwiTeamV2:custom) : lisible dans n'importe quel navigateur où
   * le patron a ouvert Équipe (CLAUDE.md §6). Le patron, lui, doit continuer de
   * le LIRE ici — c'est voulu, voir functions/api/store.js › stripTeamCodes.
   *
   * La règle : le disque ne garde un code que tant que le serveur ne l'a pas.
   *   · le code vit en mémoire (memberState.current()), comme avant ;
   *   · persistTeams() l'ôte de la copie locale d'un salarié SEULEMENT si le
   *     serveur a confirmé ce code (`serverCodes` : lu par hydrateCodes(), ou
   *     accepté par une remontée réussie). Un code que le serveur n'a pas ne
   *     quitte jamais le disque : jamais de perte ;
   *   · un salarié dont le code a été ôté porte `hasCode: true` (jamais le code),
   *     et le patron le retrouve au chargement depuis la copie serveur.
   *
   * ⚠ Le danger n'est pas la lecture, c'est le RENVOI. La remontée du roster
   * (staff_pins, le document `team`, d'où l'app employé tire ses accès)
   * REMPLACE ce que le serveur porte par ce que le navigateur envoie : un
   * navigateur qui a oublié des codes les effacerait chez le serveur, et les
   * caissières se retrouveraient devant un pavé qui n'ouvre plus. Donc, tant
   * qu'un salarié a `hasCode` sans code en mémoire (« non résolu »), RIEN ne part :
   * ni publishPins(), ni la remontée du document (canPush de cloud-doc.js). */
  /* ═══════════════ PUBLISH THE ROSTER'S CODES TO THE TILL ═══════════════
   * The till does not read this roster: it asks /api/config for the store's
   * staff codes (see the PIN gate in assets/caisse-pairing.js). Only the
   * onboarding wizard ever wrote there, so a cashier hired afterwards had a code
   * on their profile that the till had never heard of — the owner typed it and
   * got "Code incorrect". Every roster change now republishes.
   *
   * /api/config REPLACES the store's whole code list, so we always send the FULL
   * roster — sending only the new hire would silently revoke everyone else,
   * including the owner's own code from onboarding. Real (custom, onboarded)
   * venues only: a demo venue has no session, and pushing seeded demo staff into
   * a real merchant's row is exactly the leak the venue split exists to prevent.
   * Fail-soft — no endpoint, no session, offline: the roster is still saved
   * locally and this is a no-op. */
  /* ═══════════════ LA COPIE SERVEUR ═══════════════════════════════════════
   * Ce roster n'avait AUCUN appel réseau. Vingt salariés, leurs contrats, leurs
   * taux horaires, et quatre semaines de planning ne vivaient que dans le
   * localStorage du navigateur qui les avait saisis : le commerçant ouvrait Kiwi
   * sur l'iPad du comptoir et trouvait une équipe vide, avec une masse salariale
   * à zéro. La page s'appelle « Paie & planning » — c'est de l'argent, et il
   * faut le ressaisir à chaque appareil.
   *
   * On miroite donc par MAGASIN vers /api/store (assets/cloud-doc.js), qui porte
   * les trois règles : ne jamais perdre de donnée sur une panne, ne jamais
   * écraser l'autre appareil, ne jamais pousser avant d'avoir lu.
   *
   * La clé est le slug du magasin, pas `teamKey()`. teamKey d'une venue
   * personnalisée EST son identifiant de venue, que venues.js tire de l'horloge
   * à la création ou du slug à l'adoption : deux navigateurs du même commerçant
   * ne s'accordent jamais dessus. cloud-doc.js fait la traduction.
   *
   * Le stockage local, lui, ne bouge pas d'un octet : kiwiTeamV2:custom garde
   * ses seaux par venue, et toutes les lectures existantes trouvent leur roster
   * là où il a toujours été. */
  function isCode(v) { return /^\d{4}$/.test(String(v || '').trim()); }

  function memberCode(m) {
    if (!m) return '';
    if (isCode(m.pinCode)) return String(m.pinCode).trim();
    return isCode(m.password) ? String(m.password).trim() : '';
  }

  function codeUnresolved(m) { return !!(m && m.hasCode && !memberCode(m)); }

  function rosterHasUnresolved(members) { return (Array.isArray(members) ? members : []).some(codeUnresolved); }

  function diskMembers(members, serverCodes) {
    const known = serverCodes || {};
    return (Array.isArray(members) ? members : []).map((m) => {
      const code = memberCode(m);
      if (!m || !code || !m.id || known[m.id] !== code) return m;
      const { pinCode, password, ...rest } = m;
      return { ...rest, hasCode: true };
    });
  }

  function outboundMembers(members) {
    return (Array.isArray(members) ? members : []).map((m) => {
      if (!m || !('hasCode' in m)) return m;
      const { hasCode, ...rest } = m;
      return rest;
    });
  }

  function fillCodes(members, theirs) {
    const byId = Object.create(null);
    (Array.isArray(theirs) ? theirs : []).forEach((t) => { if (t && t.id) byId[t.id] = t; });
    return (Array.isArray(members) ? members : []).map((m) => {
      if (!m || memberCode(m)) return m;
      const code = memberCode(byId[m.id]);
      return code ? { ...m, pinCode: code, password: code } : m;
    });
  }

  function applyServerCodes(members, serverMembers, serverCodes) {
    const known = { ...(serverCodes || {}) };
    const theirs = Array.isArray(serverMembers) ? serverMembers : [];
    const readable = theirs.some((t) => memberCode(t));
    const byId = Object.create(null);
    theirs.forEach((t) => {
      if (!t || !t.id) return;
      byId[t.id] = t;
      const c = memberCode(t);
      if (c) known[t.id] = c;
    });
    const out = (Array.isArray(members) ? members : []).map((m) => {
      if (!m || memberCode(m)) return m;
      const c = m.id && known[m.id];
      if (c) return { ...m, pinCode: c, password: c };
      if (m.hasCode && readable) { const { hasCode, ...rest } = m; return rest; }
      return m;
    });
    return { members: out, serverCodes: known };
  }

  const serverCodes = Object.create(null);
  function publishPins() {
    try {
      const venue = window.KiwiVenue?.getCurrentVenueData?.();
      if (!venue || !venue.custom) return;                  // demo seed never leaves the browser
      if (!window.KiwiConfig || !window.KiwiConfig.syncPins) return;
      const seen = Object.create(null);
      const pins = [];
      const roster = getMembers(teamKey(venue));
      /* Un salarié dont le code n'est pas encore revenu du serveur : publier
         maintenant REMPLACERAIT staff_pins sans lui, et sa caisse ne l'ouvrirait
         plus. On attend que le roster soit complet (hydrateCodes). */
      if (rosterHasUnresolved(roster)) return;
      roster.forEach((m) => {
        const code = memberCode(m);
        if (!code || seen[code]) return;                    // no code yet, or a duplicate
        seen[code] = 1;
        pins.push({
          memberId: m.id || '', code, name: memberFullName(m),
          firstName: m.firstName || '', lastName: m.lastName || '',
          email: m.email || '', role: m.function || m.department || 'staff',
          department: m.department || '', venueSlug: m.venueSlug || '',
        });
      });
      window.KiwiConfig.syncPins(pins);
    } catch (_) {}
  }

  function getShifts(venueType) { return window.__kiwiTeamV2.shiftsByVenue[venueType] || {}; }

  const LS_TEAM = 'kiwiTeamV2:custom';

  function teamAccount() { try { return String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) { return ''; } }

  let ROSTER_ACCOUNT = teamAccount();

  function rosterWriteBlocked() {
    if (window.__kiwiTenantPurging === true) return true;
    const a = teamAccount();
    return !!(ROSTER_ACCOUNT && a && a !== ROSTER_ACCOUNT);
  }

  function loadCustomTeams() {
    try {
      ROSTER_ACCOUNT = teamAccount();
      const raw = JSON.parse(localStorage.getItem(LS_TEAM) || '{}');
      if (raw && raw.account && ROSTER_ACCOUNT && String(raw.account).toLowerCase() !== ROSTER_ACCOUNT) return;
      const root = window.__kiwiTeamV2;
      Object.keys(raw.byVenue || {}).forEach((k) => {
        if (persistableTeamKey(k)) {
          root.byVenue[k] = raw.byVenue[k];
          (root.mergeByVenue || (root.mergeByVenue = {}))[k] = (raw.mergeByVenue || {})[k];
          root.hoursByVenue[k] = (raw.hoursByVenue || {})[k] || {};
          root.shiftsByVenue[k] = (raw.shiftsByVenue || {})[k] || {};
          root.planningByVenue[k] = window.KiwiPlanningCore?.normalize?.((raw.planningByVenue || {})[k], root.byVenue[k]) || (raw.planningByVenue || {})[k] || {};
          root.locksByVenue[k] = cleanLocks((raw.locksByVenue || {})[k]);
          root.removedByVenue[k] = cleanRemoved((raw.removedByVenue || {})[k]);
          window.Kiwi?.__teamMerge?.remember(root, k);
        }
      });
    } catch (_) {}
  }

  const REMOVED_CAP = 200;

  function cleanRemoved(src) {
    const byId = Object.create(null);
    (Array.isArray(src) ? src : []).forEach((r) => {
      const id = r && typeof r.id === 'string' ? r.id.slice(0, 96) : '';
      if (!id) return;
      const ts = Number(r.ts) || 0;
      if (!byId[id] || ts > byId[id].ts) byId[id] = { id, ts };
    });
    return Object.keys(byId).map((id) => byId[id]).sort((a, b) => b.ts - a.ts).slice(0, REMOVED_CAP);
  }

  function mergeRemoved(a, b) { return cleanRemoved([].concat(a || [], b || [])); }

  const LOCK_KEY_RE = /^(week|fortnight|month):\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/;

  function cleanLocks(src) {
    const out = {};
    Object.keys(src || {}).forEach((key) => {
      const v = src[key];
      if (!LOCK_KEY_RE.test(key) || !v || typeof v !== 'object') return;
      out[key] = { locked: !!v.locked, at: Number(v.at) || 0 };
    });
    return out;
  }

  function mergeLocks(mine, theirs) {
    const out = cleanLocks(theirs);
    const own = cleanLocks(mine);
    Object.keys(own).forEach((key) => { if (!out[key] || own[key].at >= out[key].at) out[key] = own[key]; });
    return out;
  }

  function persistTeams() {
    if (rosterWriteBlocked()) return;
    try {
      const root = window.__kiwiTeamV2;
      const out = { mergeByVenue: {}, account: teamAccount() || ROSTER_ACCOUNT, byVenue: {}, hoursByVenue: {}, shiftsByVenue: {}, planningByVenue: {}, locksByVenue: {}, removedByVenue: {} };
      Object.keys(root.byVenue).forEach((k) => {
        if (persistableTeamKey(k)) {
          out.byVenue[k] = diskMembers(root.byVenue[k], serverCodes);
          out.mergeByVenue[k] = (root.mergeByVenue || {})[k];
          out.hoursByVenue[k] = root.hoursByVenue[k] || {};
          out.shiftsByVenue[k] = root.shiftsByVenue[k] || {};
          out.planningByVenue[k] = root.planningByVenue[k] || {};
          out.locksByVenue[k] = root.locksByVenue[k] || {};
          out.removedByVenue[k] = root.removedByVenue[k] || [];
        }
      });
      localStorage.setItem(LS_TEAM, JSON.stringify(out));
    } catch (_) {}
  }

  function afterTeamChange() {
    // Every roster change reaches the till from here — one place, so a future
    // mutation path can't forget to publish and quietly leave a cashier locked out.
    publishPins();
    /* La carte Équipe de l'accueil lit ce roster. Sans ce signal elle gardait
     * l'état du chargement : on saisissait les heures sur Paie, on revenait à
     * l'accueil, et elle annonçait encore « 0 sur 3 en service » jusqu'au
     * prochain rechargement. */
    try { window.dispatchEvent(new Event('kiwi-team-changed')); } catch (_) {}
  }

  function saveCustomTeams() {
    if (rosterWriteBlocked()) return;
    const state = window.__kiwiTeamV2;
    Object.keys(state.byVenue).filter(persistableTeamKey).forEach(k => window.Kiwi?.__teamMerge?.stamp(state, k));
    persistTeams();
    afterTeamChange();
    teamCloudPush();
  }

  function mergeByDay(mine, theirs, alive) {
    const out = {};
    const put = (src) => Object.keys(src || {}).forEach((mid) => {
      if (alive && !alive[mid]) return;               // salarié disparu des deux côtés
      const days = src[mid] || {};
      const dst = out[mid] || (out[mid] = {});
      Object.keys(days).forEach((d) => { if (!(d in dst)) dst[d] = days[d]; });
    });
    put(mine); put(theirs);                            // le nôtre pose sa case en premier
    return out;
  }

  function mergeTeamDoc(mine, theirs) {
    const slug = teamSlug();
    mine = scopeTeamDoc(mine, slug);
    theirs = scopeTeamDoc(theirs, slug);
    const seen = Object.create(null);
    const members = [];
    /* Une suppression EST enregistrée : l'union ne ressuscite plus un salarié
     * dont l'un des deux côtés porte la pierre tombale. */
    const removed = mergeRemoved(mine && mine.removed, theirs && theirs.removed);
    if (window.Kiwi?.__teamMerge) return window.Kiwi.__teamMerge.merge(mine, theirs, removed, fillCodes);
    const gone = Object.create(null);
    removed.forEach((r) => { gone[r.id] = 1; });
    const take = (m) => { const id = m && m.id; if (!id || seen[id] || gone[id]) return; seen[id] = 1; members.push(m); };
    ((mine && mine.members) || []).forEach(take);
    ((theirs && theirs.members) || []).forEach(take);
    return {
      members: fillCodes(members, theirs && theirs.members),
      removed,
      hours: mergeByDay(mine && mine.hours, theirs && theirs.hours, seen),
      shifts: mergeByDay(mine && mine.shifts, theirs && theirs.shifts, seen),
      planning: window.KiwiPlanningCore?.merge?.(mine && mine.planning, theirs && theirs.planning, members) || mine.planning || theirs.planning || {},
      locks: mergeLocks(mine && mine.locks, theirs && theirs.locks),
    };
  }

  let teamCloud = null;

  function teamCloudInit() {
    if (teamCloud || !window.KiwiCloudDoc) return teamCloud;
    teamCloud = window.KiwiCloudDoc.attach({
      feature: 'team',
      slug: () => teamSlug(),
      read: () => {
        const k = teamVenueKey();
        const root = window.__kiwiTeamV2;
        if (!k) return { members: [], removed: [], hours: {}, shifts: {}, planning: {}, locks: {} };
        return scopeTeamDoc({
          fieldEdits: (root.mergeByVenue || {})[k],
          members: outboundMembers(root.byVenue[k] || []),
          removed: root.removedByVenue[k] || [],
          hours: root.hoursByVenue[k] || {},
          shifts: root.shiftsByVenue[k] || {},
          planning: root.planningByVenue[k] || {},
          locks: root.locksByVenue[k] || {},
        }, teamSlug());
      },
      write: (doc) => {
        const k = teamVenueKey();
        if (!k || !doc) return;
        const root = window.__kiwiTeamV2;
        const clean = scopeTeamDoc(doc, teamSlug());
        root.byVenue[k] = clean.members;
        (root.mergeByVenue || (root.mergeByVenue = {}))[k] = clean.fieldEdits;
        root.removedByVenue[k] = clean.removed;
        root.hoursByVenue[k] = clean.hours;
        root.shiftsByVenue[k] = clean.shifts;
        root.planningByVenue[k] = clean.planning;
        root.locksByVenue[k] = clean.locks;
        window.Kiwi?.__teamMerge?.remember(root, k);
        window.Kiwi?.__teamMerge?.notice(clean);
        restorePeriodLock(root, root.periodKind, buildPeriod(root.periodKind));
        persistTeams();          // surtout PAS saveCustomTeams : pas de re-remontée
        afterTeamChange();       // le till et la carte d'accueil apprennent l'équipe
      },
      merge: mergeTeamDoc,
      /* Voir « LES CODES NE RESTENT PAS SUR LE DISQUE » : un roster qui a oublié des
         codes ne remonte pas (il les effacerait chez le serveur). */
      canPush: () => {
        const k = teamVenueKey();
        const ok = !k || !rosterHasUnresolved(window.__kiwiTeamV2.byVenue[k]);
        if (!ok) heldPush = true;
        return ok;
      },
      onPushed: (doc) => {
        let changed = false;
        ((doc && doc.members) || []).forEach((m) => {
          const c = memberCode(m);
          if (c && m.id && serverCodes[m.id] !== c) { serverCodes[m.id] = c; changed = true; }
        });
        if (changed) persistTeams();           // le serveur l'a : le disque peut le lâcher
      },
      isEmpty: (d) => !d || !((d.members && d.members.length) || (d.removed && d.removed.length)),
      // Le roster vient d'arriver du serveur : la page ouverte doit le montrer,
      // sinon le commerçant regarde une équipe vide qui n'existe plus.
      onPullError: teamReadTimedOut,
      onPulled: () => { teamReadFailed = false; if (pageActive) { try { render(); } catch (_) {} } },
    });
    return teamCloud;
  }

  let heldPush = false;
  let teamReadFailed = false;

  function teamReadTimedOut(error) {
    if (!error || error.code !== 'timeout' || !pageActive || teamReadFailed) return;
    teamReadFailed = true;
    const copy = { fr: 'Le réseau ne répond pas. Réessayez.', en: 'The network is not responding. Please retry.', ar: 'الشبكة لا تستجيب. حاول مرة أخرى.' };
    toast(copy[trLang()] || copy.fr, {type: 'pend'});
  }

  function hydrateCodes() {
    const c = teamCloudInit();
    const slug = teamSlug();
    const k = teamVenueKey();
    if (!c || !slug || !k || !c.enabled()) return Promise.resolve(false);
    return fetchDeadline('/api/store?feature=team&merchant=' + encodeURIComponent(slug), { headers: { Accept: 'application/json' } })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((res) => {
        if (!res || slug !== teamSlug() || k !== teamVenueKey()) return false;
        teamReadFailed = false;
        const root = window.__kiwiTeamV2;
        const applied = applyServerCodes(root.byVenue[k] || [], res.data && res.data.members, serverCodes);
        Object.assign(serverCodes, applied.serverCodes);
        root.byVenue[k] = applied.members;
        persistTeams();                       // ce que le serveur a confirmé quitte le disque
        if (!rosterHasUnresolved(applied.members) && heldPush) { heldPush = false; c.push(0, true); }
        if (pageActive) { try { render(); } catch (_) {} }
        return true;
      })
      .catch((error) => { teamReadTimedOut(error); return false; });
  }

  function teamCloudBind() {
    const c = teamCloudInit();
    if (c) Promise.resolve(c.bind()).then(() => hydrateCodes()).then(() => publishPins()).catch(() => {});
  }

  function teamCloudPush() {
    const c = teamCloudInit();
    if (c) c.push();
  }

  function ensureVenueData(venue) {
    const root = window.__kiwiTeamV2;
    const key = teamKey(venue);
    if (!root.byVenue[key]) root.byVenue[key] = (venue && venue.custom) ? [] : seedFor((venue && venue.type) || 'restaurant');
    if (venue && venue.custom) {
      const slug = teamSlug();
      if (slug) {
        const before = root.byVenue[key];
        const kept = before.filter((m) => memberBelongsToStore(m, slug));
        if (kept.length !== before.length) {
          root.byVenue[key] = kept;
          const alive = Object.create(null);
          kept.forEach((m) => { if (m && m.id) alive[m.id] = 1; });
          root.hoursByVenue[key] = mergeByDay(root.hoursByVenue[key], null, alive);
          root.shiftsByVenue[key] = mergeByDay(root.shiftsByVenue[key], null, alive);
          persistTeams();
          setTimeout(() => { afterTeamChange(); teamCloudPush(); }, 0);
        }
      }
    }
    // seedHours() invents 4–8 h a day so the pitch demo looks staffed. A REAL
    // store must never be handed hours nobody worked: those hours are now money
    // on Paie & planning ("à payer · période" = base salaries + hours × rate), so
    // seeding one would quote the owner a wage bill for a shift that never
    // happened. A real store starts at zero and fills in from the planning grid.
    if (!root.hoursByVenue[key]) {
      root.hoursByVenue[key] = (venue && venue.custom)
        ? {}
        : seedHours(root.byVenue[key], buildPeriod(root.periodKind).days);
    }
    if (!root.planningByVenue[key]) root.planningByVenue[key] = window.KiwiPlanningCore?.blank?.() || {};
    root.planningByVenue[key] = window.KiwiPlanningCore?.normalize?.(root.planningByVenue[key], root.byVenue[key]) || root.planningByVenue[key];
    return root;
  }

  function getMembers(venueType) { return window.__kiwiTeamV2.byVenue[venueType] || []; }

  function getHours(venueType) { return window.__kiwiTeamV2.hoursByVenue[venueType] || {}; }

  if (!window.__kiwiTeamV2) window.__kiwiTeamV2 = { byVenue: {}, hoursByVenue: {}, shiftsByVenue: {}, planningByVenue: {}, periodKind: 'week', periodLocked: false };
  if (!window.__kiwiTeamV2.shiftsByVenue) window.__kiwiTeamV2.shiftsByVenue = {};
  if (!window.__kiwiTeamV2.planningByVenue) window.__kiwiTeamV2.planningByVenue = {};
  /* Period navigation is intentionally UI state: it never changes or copies
   * the saved shifts until the manager edits the newly displayed dates. */
  const periodOffsets = { week:0, fortnight:0, month:0 };
  /* Validated periods, per venue: { 'week:2026-10-05:2026-10-11': { locked, at } }.
   * They used to live in a plain object in this closure. « Période verrouillée ·
   * heures envoyées au planning » was announced, and the lock vanished on reload
   * or simply did not exist on the counter's iPad. They now travel with the
   * team document (locks), and `at` decides between two devices: the later
   * validate or unlock wins, so an unlock is never undone by a merge. */
  if (!window.__kiwiTeamV2.locksByVenue) window.__kiwiTeamV2.locksByVenue = {};
  /* Salariés supprimés, par établissement : [{ id, ts }]. La fusion est une
   * UNION de membres, donc sans pierre tombale un salarié retiré ici revenait
   * dès qu'une autre copie (le serveur, l'iPad du comptoir) le portait encore,
   * et le serveur, qui refuse un document vide, ne pouvait jamais enregistrer la
   * suppression du dernier salarié : il gardait son accès à l'app employé. */
  if (!window.__kiwiTeamV2.removedByVenue) window.__kiwiTeamV2.removedByVenue = {};
  return Object.freeze({ isCode, memberCode, codeUnresolved, rosterHasUnresolved, diskMembers, outboundMembers, fillCodes, applyServerCodes, publishPins, teamAccount, rosterWriteBlocked, loadCustomTeams, cleanRemoved, mergeRemoved, cleanLocks, mergeLocks, persistTeams, afterTeamChange, saveCustomTeams, mergeByDay, mergeTeamDoc, teamCloudInit, teamReadTimedOut, hydrateCodes, teamCloudBind, teamCloudPush, ensureVenueData, getMembers, getHours, getShifts, periodOffsets, current() { return window.__kiwiTeamV2; }, setPageActive(value) { pageActive = value; }, resetReadFailure() { teamReadFailed = false; } });
  } });
})();
