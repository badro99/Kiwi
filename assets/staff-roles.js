/* Kiwi — the staff-role catalogue.
 *
 * ONE list, two readers:
 *   · the operator console (kiwi-admin.html) OFFERS these roles when it files a
 *     staff PIN, picked by the client's type of activity;
 *   · the staff apps (kiwi-serveur.html today) ACT on them — a cook and a
 *     cashier are employees, not waiters, and must not open the floor interface.
 *
 * Keeping both readers on one file is the point: if the console can hand out
 * "Cuisinier" and the waiter app has never heard of it, the cook walks straight
 * into the tables view. A role is only ever as good as the app that honours it.
 *
 * The STORED value is the lowercase id (D1 `staff_pins.role` is 24 chars); the
 * label is display only. Never rename an id — a PIN filed last month still
 * carries the old one.
 *
 * Fail-soft: this file adds capability, it never gates. If it fails to load, the
 * console falls back to its four legacy roles and the waiter app to its previous
 * serveur/plongeur rule — see the guards at each call site.
 */
(function () {
  'use strict';

  var LABELS = {
    serveur:'Serveur', chefrang:'Chef de rang', maitre:'Maître d’hôtel', barman:'Barman',
    cuisinier:'Cuisinier', chef:'Chef de cuisine', commis:'Commis', plongeur:'Plongeur',
    caisse:'Caisse', accueil:'Hôte d’accueil', barista:'Barista', patissier:'Pâtissier',
    equipier:'Équipier', grillardin:'Grillardin', preparateur:'Préparateur', livreur:'Livreur',
    boulanger:'Boulanger', pizzaiolo:'Pizzaïolo',
    conseiller:'Vendeur conseil', vendeur:'Vendeur', magasinier:'Magasinier',
    merch:'Visual merchandiser', reassort:'Réassortisseur', rayon:'Responsable rayon',
    titulaire:'Pharmacien titulaire', pharmacien:'Pharmacien assistant', fleuriste:'Fleuriste',
    praticien:'Praticien·ne', masseur:'Masseur', esthetique:'Esthéticienne', manucure:'Manucure',
    reception:'Réceptionniste', coiffeur:'Coiffeur', coloriste:'Coloriste', barbier:'Barbier',
    coach:'Coach sportif', coachperso:'Coach personnel', coursco:'Cours collectifs',
    entretien:'Agent d’entretien', concierge:'Concierge', gouvernante:'Gouvernante',
    menage:'Ménage & étages', bagagiste:'Bagagiste', veilleur:'Veilleur de nuit',
    manager:'Manager', proprietaire:'Propriétaire',
  };

  // Every business has a boss, so these close every list. Trade roles come
  // first: option one is the default, and it should be the hire you add most.
  var UNIVERSAL = ['manager', 'proprietaire'];

  // Keyed on the SUBTYPE, not the base vertical — a boulangerie hires boulangers
  // and a pharmacie hires préparateurs; neither is a relabeled restaurant.
  var BY_TYPE = {
    restaurant: ['serveur','chefrang','maitre','barman','cuisinier','chef','commis','plongeur','caisse','accueil'],
    cafe:       ['barista','serveur','caisse','patissier','plongeur','accueil'],
    fastfood:   ['equipier','caisse','grillardin','preparateur','livreur','plongeur'],
    bakery:     ['vendeur','boulanger','patissier','commis','caisse'],
    pizzeria:   ['pizzaiolo','serveur','livreur','commis','caisse','plongeur'],
    foodtruck:  ['equipier','cuisinier','caisse','livreur'],
    boutique:   ['conseiller','caisse','magasinier','merch'],
    epicerie:   ['vendeur','caisse','magasinier','reassort','rayon'],
    pharmacie:  ['titulaire','pharmacien','preparateur','conseiller','caisse'],
    fleuriste:  ['fleuriste','vendeur','caisse','livreur'],
    spa:        ['praticien','masseur','esthetique','manucure','reception','caisse'],
    coiffure:   ['coiffeur','coloriste','barbier','esthetique','manucure','reception','caisse'],
    sport:      ['coach','coachperso','coursco','reception','caisse','entretien'],
    hotel:      ['reception','concierge','gouvernante','menage','bagagiste','veilleur','serveur','caisse'],
    autre:      ['vendeur','caisse','magasinier','equipier'],
  };

  /* ── Who works the floor ────────────────────────────────────────────────────
   * The waiter app takes orders, fires them to the kitchen and settles bills.
   * Only floor service and management do that job. A cuisinier, a caissier, a
   * magasinier, a coiffeuse — they clock in on the same terminal and need their
   * shift, their hours and their profile, nothing more. Anyone NOT in this list
   * and known to the catalogue gets the restricted view. */
  var SERVICE = ['serveur','chefrang','maitre','barman','accueil','manager','proprietaire'];

  /* ── Values written by other surfaces ───────────────────────────────────────
   * A stored role does not always come from the console. The onboarding wizard
   * writes owner/manager/staff, and the Équipe page publishes the job title or
   * the department itself ("Caissier", "Sous-chef", "Plonge"). Map what we can
   * recognise onto a catalogue id so those people are judged on the same rule.
   * `staff` is deliberately absent: the wizard grants it "caisse, commandes &
   * salle", so it stays a full-access value and nobody loses access they have
   * today. */
  var ALIASES = {
    owner:'proprietaire', admin:'manager', direction:'proprietaire', management:'manager',
    caissier:'caisse', caissiere:'caisse',
    'sous-chef':'chef', 'sous chef':'chef', cuisine:'cuisinier', plonge:'plongeur',
    salle:'serveur', bar:'barman', comptoir:'barista', sommelier:'serveur',
    patisserie:'patissier', 'aide-patissier':'patissier', fournil:'boulanger',
    'preparateur en pharmacie':'preparateur', preparation:'preparateur',
    vente:'vendeur', vendeuse:'vendeur', stock:'magasinier', rayons:'rayon', vitrine:'merch',
    coiffeuse:'coiffeur', coiffure:'coiffeur', maquilleuse:'esthetique',
    esthetique:'esthetique', massage:'masseur', masseuse:'masseur',
    'femme de chambre':'menage', 'valet de chambre':'menage',
  };

  /* Compare on meaning, not on typography: "Maître d'hôtel", "maitre d’hotel"
   * and "MAITRE D'HOTEL" are one role. Strip accents, unify apostrophes, fold
   * whitespace. */
  function norm(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    return s.replace(/[’`´]/g, "'").replace(/\s+/g, ' ');
  }

  // normalised label → id, so a published job title resolves like an id.
  var BY_LABEL = {};
  Object.keys(LABELS).forEach(function (id) { BY_LABEL[norm(LABELS[id])] = id; });

  var SERVICE_SET = {};
  SERVICE.forEach(function (id) { SERVICE_SET[id] = true; });

  /* The catalogue id behind any stored value, or '' when we genuinely do not
   * know it. '' is not a failure — it means "leave this one alone". */
  function idOf(raw) {
    var n = norm(raw);
    if (!n) return '';
    if (LABELS[n]) return n;                       // already an id
    if (BY_LABEL[n]) return BY_LABEL[n];           // a label or job title
    if (ALIASES[n]) return ALIASES[n];             // another surface's wording
    return '';
  }

  /* Machine tokens other surfaces store. They must never be shown as-is — a
   * badge reading "STAFF" or "OWNER" is not a job. Everything else a human typed
   * is left exactly as they typed it (see label). */
  var TOKENS = { owner:'Propriétaire', staff:'Équipe', admin:'Manager' };

  /* Expand an id or a machine token; otherwise show the words as written.
   * Deliberately NOT idOf(): that resolves "Coiffeuse" to the coiffeur role for
   * the access decision, which is right — but printing "Coiffeur" on her badge
   * would overwrite the title her employer chose. Access normalises, display
   * does not. */
  function label(raw) {
    var n = norm(raw);
    if (!n) return 'Équipe';                       // never render a blank chip
    if (LABELS[n]) return LABELS[n];
    if (TOKENS[n]) return TOKENS[n];
    return String(raw).trim();
  }

  function forType(typeId) {
    return (BY_TYPE[typeId] || BY_TYPE.autre).concat(UNIVERSAL);
  }

  /* Does this person work the floor? Unknown values answer YES on purpose: they
   * predate the catalogue (a hand-typed role, the wizard's `staff`) and their
   * holders open the full app today. Taking access away from someone who has it
   * is the worse failure — the console assigns a known role and that person is
   * then judged correctly. */
  function isService(raw) {
    var id = idOf(raw);
    if (!id) return true;
    return !!SERVICE_SET[id];
  }

  /* ── Who may open the register ──────────────────────────────────────────────
   * Deliberately the mirror image of the floor rule: a DENY list, not an allow
   * list. Getting the floor wrong shows someone a screen they do not need;
   * getting the till wrong stops a sale with a customer standing there. So the
   * only roles refused are the ones that unambiguously never handle money —
   * the kitchen line, the stockroom, housekeeping, cleaning.
   *
   * Everyone else keeps it, including the ones a bigger business would separate:
   * in a small Moroccan shop the boulanger does serve the 6am counter, the
   * livreur does collect cash, the veilleur does take a late payment. Splitting
   * those hairs from here would lock real people out of their own till. */
  var NO_TILL = [
    'plongeur', 'cuisinier', 'chef', 'commis', 'grillardin',   // kitchen line
    'magasinier', 'reassort', 'merch',                          // stock & vitrine
    'menage', 'gouvernante', 'bagagiste', 'entretien',          // étages & entretien
  ];
  var NO_TILL_SET = {};
  NO_TILL.forEach(function (id) { NO_TILL_SET[id] = true; });

  function opensTill(raw) {
    var id = idOf(raw);
    if (!id) return true;                          // unknown ⇒ keep the till
    return !NO_TILL_SET[id];
  }

  window.KiwiRoles = {
    LABELS: LABELS, BY_TYPE: BY_TYPE, UNIVERSAL: UNIVERSAL, SERVICE: SERVICE, NO_TILL: NO_TILL,
    forType: forType, label: label, isService: isService, opensTill: opensTill,
    idOf: idOf, norm: norm,
  };
})();
