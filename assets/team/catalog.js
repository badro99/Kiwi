/* Kiwi · Équipe, role catalogue: the departments and functions each trade
 * offers, which department a function belongs to, and which trade a venue is.
 * Pure data and lookups with no page state, loaded before assets/team.js, which
 * reads them from window.KiwiTeamCatalog. Moved byte for byte from team.js;
 * tools/team-catalog-split-test.mjs holds the proof. */
(function () {
  'use strict';
  /* team-part:catalog */
  /* ═══════════════ VENUE-AWARE ROLE CATALOGUE ═══════════════ */
  const CATALOG = {
    restaurant: {
      departments: ['Cuisine', 'Salle', 'Bar', 'Caisse', 'Plonge', 'Pâtisserie', 'Management'],
      functions:   ['Chef de cuisine', 'Sous-chef', 'Cuisinier', 'Commis', 'Chef de rang', 'Serveur', "Maître d'hôtel", 'Sommelier', 'Barman', 'Caissier', 'Plongeur', 'Pâtissier', 'Manager', "Hôte d'accueil"],
    },
    cafe: {
      departments: ['Comptoir', 'Salle', 'Pâtisserie', 'Caisse', 'Management'],
      functions:   ['Barista', 'Serveur', 'Caissier', 'Pâtissier', 'Aide-pâtissier', 'Manager', "Hôte d'accueil"],
    },
    pharmacie: {
      departments: ['Comptoir', 'Préparation', 'Caisse', 'Stock', 'Management'],
      functions:   ['Pharmacien titulaire', 'Pharmacien assistant', 'Préparateur en pharmacie', 'Vendeur conseil', 'Caissier', 'Magasinier', 'Manager'],
    },
    spa: {
      departments: ['Coiffure', 'Esthétique', 'Manucure', 'Massage', 'Accueil', 'Caisse', 'Management'],
      functions:   ['Coiffeur', 'Coiffeuse', 'Coloriste', 'Esthéticienne', 'Maquilleuse', 'Manucure', 'Masseur', 'Masseuse', 'Réceptionniste', 'Caissier', 'Manager'],
    },
    boulangerie: {
      departments: ['Fournil', 'Pâtisserie', 'Vente', 'Caisse', 'Management'],
      functions:   ['Boulanger', 'Pâtissier', 'Vendeur', 'Caissier', 'Manager'],
    },
    epicerie: {
      departments: ['Rayons', 'Caisse', 'Stock', 'Management'],
      functions:   ['Vendeur', 'Caissier', 'Magasinier', 'Réassortisseur', 'Manager'],
    },
    boutique: {
      departments: ['Vente', 'Vitrine', 'Caisse', 'Stock', 'Management'],
      functions:   ['Vendeur conseil', 'Caissier', 'Magasinier', 'Visual merchandiser', 'Manager'],
    },
    pressing: {
      departments: ['Accueil', 'Atelier', 'Repassage', 'Retouches', 'Livraison', 'Caisse', 'Management'],
      functions:   ['Agent de réception', 'Opérateur lavage', 'Détacheur', 'Repasseur', 'Retoucheur', 'Livreur', 'Caissier', "Responsable d'atelier", 'Manager'],
    },
    hotel: {
      departments: ['Réception', 'Réservations', 'Étages', 'Restauration', 'Maintenance', 'Caisse', 'Management'],
      functions:   ['Réceptionniste', 'Concierge', 'Veilleur de nuit', 'Responsable réservations', 'Gouvernante', 'Femme de chambre', 'Valet de chambre', 'Bagagiste', 'Technicien de maintenance', 'Caissier', 'Manager'],
    },
    fastfood: {
      departments: ['Cuisine', 'Comptoir', 'Livraison', 'Caisse', 'Stock', 'Management'],
      functions:   ['Équipier polyvalent', 'Cuisinier', 'Préparateur', 'Caissier', 'Livreur', 'Plongeur', 'Responsable de shift', 'Manager'],
    },
    bakery: {
      departments: ['Fournil', 'Pâtisserie', 'Vente', 'Caisse', 'Livraison', 'Management'],
      functions:   ['Boulanger', 'Pâtissier', 'Tourier', 'Vendeur', 'Caissier', 'Livreur', 'Responsable de production', 'Manager'],
    },
    pizzeria: {
      departments: ['Cuisine', 'Four', 'Comptoir', 'Salle', 'Livraison', 'Caisse', 'Management'],
      functions:   ['Pizzaiolo', 'Aide-pizzaiolo', 'Préparateur', 'Serveur', 'Caissier', 'Livreur', 'Responsable de shift', 'Manager'],
    },
    traiteur: {
      departments: ['Production', 'Logistique', 'Service', 'Commercial', 'Caisse', 'Management'],
      functions:   ['Chef traiteur', 'Cuisinier', 'Commis', "Maître d'hôtel", 'Serveur événementiel', 'Chauffeur-livreur', 'Responsable logistique', 'Commercial', 'Caissier', 'Manager'],
    },
    foodtruck: {
      departments: ['Cuisine', 'Comptoir', 'Tournée', 'Caisse', 'Stock', 'Management'],
      functions:   ['Équipier food truck', 'Cuisinier', 'Préparateur', 'Caissier', 'Chauffeur', 'Responsable de tournée', 'Manager'],
    },
    librairie: {
      departments: ['Vente', 'Commandes', 'Caisse', 'Stock', 'Management'],
      functions:   ['Libraire', 'Conseiller', 'Caissier', 'Magasinier', 'Responsable commandes', 'Manager'],
    },
    maison: {
      departments: ['Vente', 'Vitrine', 'Liste de mariage', 'Emballage', 'Livraison', 'Caisse', 'Stock', 'Management'],
      functions:   ['Vendeur conseil', 'Conseiller liste de mariage', 'Emballeur', 'Livreur', 'Caissier', 'Magasinier', 'Visual merchandiser', 'Manager'],
    },
    fleuriste: {
      departments: ['Atelier floral', 'Vente', 'Livraison', 'Caisse', 'Stock', 'Management'],
      functions:   ['Fleuriste', 'Aide-fleuriste', 'Conseiller', 'Livreur', 'Caissier', "Responsable d'atelier", 'Manager'],
    },
    coiffure: {
      departments: ['Coiffure', 'Coloration', 'Barbier', 'Accueil', 'Caisse', 'Management'],
      functions:   ['Coiffeur', 'Coiffeuse', 'Coloriste', 'Barbier', 'Shampouineur', 'Réceptionniste', 'Caissier', 'Manager'],
    },
    sport: {
      departments: ['Accueil', 'Coaching', 'Cours collectifs', 'Vente', 'Caisse', 'Entretien', 'Management'],
      functions:   ['Coach sportif', 'Personal trainer', 'Professeur de cours collectif', 'Conseiller abonnements', 'Réceptionniste', 'Caissier', "Agent d'entretien", 'Manager'],
    },
    autre: {
      departments: ['Opérations', 'Vente', 'Service', 'Caisse', 'Stock', 'Management'],
      functions:   ['Agent polyvalent', 'Conseiller', 'Technicien', 'Caissier', 'Magasinier', 'Responsable', 'Manager'],
    },
  };
  function unionCatalog() {
    const allDept = new Set(), allFn = new Set();
    Object.values(CATALOG).forEach(c => {
      c.departments.forEach(d => allDept.add(d));
      c.functions.forEach(f => allFn.add(f));
    });
    return { departments: [...allDept].sort((a, b) => a.localeCompare(b, 'fr')),
             functions:   [...allFn].sort((a, b)   => a.localeCompare(b, 'fr')) };
  }
  function catalogFor(venueType) {
    return CATALOG[venueType] || unionCatalog();
  }
  /* Le département suit le poste. Le formulaire proposait les deux listes
     côte à côte sans les relier : un nouveau membre naissait « Chef de cuisine
     · Cuisine », on choisissait « Serveur », et il restait en Cuisine. Le
     planning et la masse salariale par département le comptaient alors en
     cuisine. Pour chaque poste, les départements où il travaille, du plus
     probable au moins probable ; on prend le premier que le métier propose.
     Un poste absent d'ici laisse le département tel quel. */
  const FN_DEPT = {
    'Chef de cuisine': ['Cuisine', 'Production'], 'Sous-chef': ['Cuisine', 'Production'],
    'Cuisinier': ['Cuisine', 'Production'], 'Commis': ['Cuisine', 'Production'],
    'Chef traiteur': ['Production', 'Cuisine'], 'Préparateur': ['Cuisine', 'Comptoir'],
    'Chef de rang': ['Salle'], 'Serveur': ['Salle', 'Service'], "Maître d'hôtel": ['Salle', 'Service'],
    'Sommelier': ['Salle', 'Bar'], "Hôte d'accueil": ['Salle', 'Accueil'], 'Serveur événementiel': ['Service', 'Salle'],
    'Barman': ['Bar'], 'Barista': ['Comptoir', 'Bar'],
    'Caissier': ['Caisse'], 'Plongeur': ['Plonge', 'Cuisine'],
    'Pâtissier': ['Pâtisserie'], 'Aide-pâtissier': ['Pâtisserie'], 'Tourier': ['Pâtisserie', 'Fournil'],
    'Boulanger': ['Fournil'], 'Pizzaiolo': ['Four', 'Cuisine'], 'Aide-pizzaiolo': ['Four', 'Cuisine'],
    'Équipier polyvalent': ['Comptoir'], 'Équipier food truck': ['Comptoir'],
    'Manager': ['Management'], 'Responsable': ['Management'], 'Responsable de shift': ['Management'],
    'Responsable de production': ['Fournil', 'Production', 'Management'],
    "Responsable d'atelier": ['Atelier', 'Atelier floral', 'Management'],
    'Responsable de tournée': ['Tournée', 'Management'], 'Responsable logistique': ['Logistique', 'Management'],
    'Responsable réservations': ['Réservations', 'Management'], 'Responsable commandes': ['Commandes', 'Management'],
    'Pharmacien titulaire': ['Management', 'Comptoir'], 'Pharmacien assistant': ['Comptoir'],
    'Préparateur en pharmacie': ['Préparation'],
    'Vendeur': ['Vente', 'Rayons', 'Comptoir'], 'Vendeur conseil': ['Vente', 'Comptoir'],
    'Conseiller': ['Vente', 'Opérations'], 'Conseiller abonnements': ['Vente', 'Accueil'],
    'Conseiller liste de mariage': ['Liste de mariage', 'Vente'], 'Libraire': ['Vente'],
    'Magasinier': ['Stock', 'Rayons'], 'Réassortisseur': ['Rayons', 'Stock'],
    'Visual merchandiser': ['Vitrine', 'Vente'], 'Emballeur': ['Emballage'], 'Commercial': ['Commercial', 'Vente'],
    'Coiffeur': ['Coiffure'], 'Coiffeuse': ['Coiffure'], 'Shampouineur': ['Coiffure'],
    'Coloriste': ['Coloration', 'Coiffure'], 'Barbier': ['Barbier', 'Coiffure'],
    'Esthéticienne': ['Esthétique'], 'Maquilleuse': ['Esthétique'], 'Manucure': ['Manucure', 'Esthétique'],
    'Masseur': ['Massage'], 'Masseuse': ['Massage'],
    'Réceptionniste': ['Accueil', 'Réception'], 'Agent de réception': ['Accueil', 'Réception'],
    'Concierge': ['Réception'], 'Veilleur de nuit': ['Réception'], 'Bagagiste': ['Réception'],
    'Gouvernante': ['Étages'], 'Femme de chambre': ['Étages'], 'Valet de chambre': ['Étages'],
    'Technicien de maintenance': ['Maintenance'], 'Technicien': ['Maintenance', 'Opérations', 'Service'],
    'Opérateur lavage': ['Atelier'], 'Détacheur': ['Atelier'], 'Repasseur': ['Repassage', 'Atelier'],
    'Retoucheur': ['Retouches', 'Atelier'],
    'Livreur': ['Livraison'], 'Chauffeur-livreur': ['Livraison', 'Logistique'], 'Chauffeur': ['Tournée', 'Livraison'],
    'Fleuriste': ['Atelier floral'], 'Aide-fleuriste': ['Atelier floral'],
    'Coach sportif': ['Coaching'], 'Personal trainer': ['Coaching'],
    'Professeur de cours collectif': ['Cours collectifs'], "Agent d'entretien": ['Entretien'],
    'Agent polyvalent': ['Opérations'],
  };
  function deptForFunction(fn, departments) {
    const want = FN_DEPT[fn] || [];
    for (let i = 0; i < want.length; i++) if (departments.indexOf(want[i]) >= 0) return want[i];
    return '';
  }
  /* The TRADE, which is not the storage key. teamKey() returns a custom venue's
     id so each store keeps its own roster — correct for storage, but it was also
     what picked the role catalogue, and CATALOG['v1mrz…'] misses. Every custom
     venue therefore fell through to unionCatalog(), and a clothing shop was
     offered Bar, Cuisine, Coiffure, Manucure, Massage, Pâtisserie and Plonge as
     departments. Resolve the subtype first (a boulangerie is not a generic
     boutique), then the base family. */
  function tradeKey(venue) {
    if (!venue) return 'restaurant';
    if (venue.subtype && CATALOG[venue.subtype]) return venue.subtype;
    if (venue.type && CATALOG[venue.type]) return venue.type;
    return venue.custom ? 'boutique' : 'restaurant';
  }

  /* /team-part:catalog */
  window.KiwiTeamCatalog = Object.freeze({ CATALOG, unionCatalog, catalogFor, FN_DEPT, deptForFunction, tradeKey });
})();
