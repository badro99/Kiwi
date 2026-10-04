/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LANGUE DE LA CAISSE — window.KiwiCaisseLang
 * ---------------------------------------------------------------------------
 * Le tableau de bord parle trois langues depuis toujours (assets/i18n.js, 129
 * `data-i18n` dans dashboard.html). La caisse, zéro. Un commerçant pouvait
 * choisir sa langue au bureau et retrouver son comptoir en français, alors que
 * c'est AU COMPTOIR que la langue compte : la personne qui tient la caisse
 * n'est pas toujours celle qui a signé le contrat.
 *
 * ── Pourquoi pas le motif `data-i18n` du tableau de bord ──────────────────
 * Là-bas les libellés sont dans le HTML, on peut les baliser. Ici l'écrasante
 * majorité des textes est FABRIQUÉE en JavaScript, à chaque rendu, dans des
 * gabarits (`renderGrid`, `renderTicket`, `renderPromos`…). Baliser voudrait
 * dire réécrire quinze fichiers de caisse et rebaliser chaque nouvelle ligne
 * pour toujours — un travail qui se défait tout seul à la première évolution.
 *
 * On prend donc le français comme CLÉ. C'est déjà la langue de référence du
 * dépôt : ce qui est écrit dans le code est la version française, mot pour mot.
 * Un balayage des nœuds de texte après chaque rendu remplace ce qu'il
 * reconnaît, et laisse le reste tel quel.
 *
 * ── Ce que ça implique, dit franchement ───────────────────────────────────
 * Une phrase absente du dictionnaire reste en français. C'est volontaire : un
 * écran à moitié traduit reste utilisable, un écran traduit à moitié FAUX ne
 * l'est pas. Le dictionnaire couvre le rail, l'écran de vente, le ticket, les
 * promotions et les écrans que touche une caissière ; les profondeurs de
 * l'inventaire et les quatorze autres métiers se complètent au fil de l'usage.
 *
 * Ce qui n'est JAMAIS traduit : les données du commerçant. Les noms d'articles,
 * de clientes, les montants, les codes-barres ne traversent pas le
 * dictionnaire — on ne remplace qu'une correspondance EXACTE avec une phrase
 * d'interface connue.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'kiwiCaisseLang';
  var LANGS = [
    { id: 'fr', code: 'FR', label: 'Français', dir: 'ltr' },
    { id: 'en', code: 'EN', label: 'English', dir: 'ltr' },
    { id: 'ar', code: 'ع', label: 'العربية', dir: 'rtl' },
  ];

  /* ───────────────────────── le dictionnaire ─────────────────────────
     Clé = la phrase française EXACTE telle qu'elle est écrite dans le code.
     Une clé qui ne correspond plus (parce que le français a changé) cesse
     simplement de s'appliquer : la caisse retombe en français, elle ne casse
     pas. C'est la bonne défaillance pour une caisse. */
  var DICT = {
    en: {
      "Khtar la transaction à rembourser, journal d'lyoum.": "Choose a transaction to refund from today’s journal.",
      "Rechercher, table, montant, réf": "Search table, amount or reference",
      "Rechercher une transaction": "Search transactions",
      /* Native opening screen uses the same chosen language as setup. */
      'version commerçant': 'merchant edition', '· version commerçant': '· merchant edition', 'Bonjour': 'Hello',
      'Caissier': 'Cashier', 'Fond d’ouverture': 'Opening float',
      "Fond d'ouverture": 'Opening float', 'Ouvrir la caisse': 'Open till',
      /* ── restaurant till: floor, tables, bill sheet, payment (native app, 2026-09-27) ── */
      'Identifiant caisse': 'Till ID', 'Inactif': 'Off', 'Annuler une vente': 'Cancel a sale', 'Remboursement': 'Refund',
      'Mouvement caisse': 'Cash movement', 'Passation caisse': 'Till handover', 'Ouvrir le tiroir': 'Open drawer',
      'Code de pointage': 'Clock-in code', 'Équipe': 'Team', 'Écran cuisine': 'Kitchen screen',
      'Impression cuisine': 'Kitchen printing', 'Clients & fidélité': 'Customers & loyalty', 'Mode nuit': 'Night mode',
      "Fin d'service": 'End of shift', 'Sortir': 'Leave', 'En service': 'On shift',
      'Plan de salle': 'Floor plan', 'Rez-de-chaussée': 'Ground floor', 'étage': 'floor', 'er': 'st', 'Table T{n} ouverte': 'Table T{n} opened',
      'Libre': 'Free', 'À commander': 'To order', 'Addition': 'Bill', 'Réglée': 'Paid',
      '· salle': '· dining room', 'CUISINE': 'KITCHEN', 'COMPTOIR': 'COUNTER', 'Terrasse': 'Terrace',
      '· extérieur': '· outdoor', '{n} / {n} occupées': '{n} / {n} occupied',
      'À emporter': 'Takeaway', 'Tout': 'All', 'Commande': 'Order', 'en cours': 'in progress',
      'couverts': 'covers', 'couvert': 'cover', 'Servi par': 'Served by', 'en pause': 'on break',
      'Sélectionnez des articles dans le menu à gauche': 'Choose items from the menu',
      'Nouvelle table, en attente de commande': 'New table, waiting for an order',
      'Envoyer en cuisine': 'Send to kitchen', 'Annuler commande': 'Cancel order', 'Partager': 'Share',
      'Réduction': 'Discount', 'Imprimer': 'Print', 'Vider la commande': 'Clear the order', 'Détails': 'Details',
      'Payer en espèces': 'Pay cash', 'Pourboire': 'Tip', 'Sans pourboire': 'No tip', 'Espèces reçues': 'Cash received',
      'Rendu': 'Change due', 'Confirmer': 'Confirm', 'Montant reçu': 'Amount received',
      'Payer par carte': 'Pay by card', 'Payer par carte · F3': 'Pay by card · F3',
      'Approchez la carte ou le téléphone': 'Hold the card or phone near the reader',
      "Diviser l'addition": 'Split the bill', 'Choisissez un mode de partage. Chaque part part avec son ticket et son TPE.': 'Choose how to split. Each share gets its own receipt and card payment.',
      'À parts égales': 'Equal shares', 'parts': 'shares', '{n} MAD chacun': '{n} MAD each', 'Par article': 'By item',
      'Assignez chaque ligne à un convive': 'Assign each line to a guest', 'Nombre de parts': 'Number of shares',
      'Pourboire commun': 'Shared tip', 'autre': 'other', 'Total à diviser': 'Total to split', 'Par convive': 'Per guest',
      'Lancer le split': 'Start split',
      'Nouvelle table': 'New table', 'Ouvrir': 'Open', 'Combien de couverts?': 'How many covers?',
      'Ouvrir la table': 'Open table', 'Annuler la table': 'Cancel table', 'Encaisser la table': 'Take payment for the table',
      '{n} mn': '{n} min', 'Ajouter des articles': 'Add items', 'Déplacer table': 'Move table', 'Fusionner': 'Merge',
      'Ticket cuisine en attente': 'Kitchen ticket waiting',
      'Imprimante indisponible : le ticket reste dans la file et sera réessayé.': 'Printer unavailable: the ticket stays in the queue and will be retried.',
      'article en cuisine': 'item in the kitchen', 'articles en cuisine': 'items in the kitchen', 'bon {x}': 'ticket {x}',
      "Liste d'attente": 'Waiting list', 'Ajouter à la file': 'Add to the list', 'Personne en attente': 'Nobody waiting',
      'Clique « Ajouter à la file » quand un client se présente sans réservation.': 'Tap “Add to the list” when a guest arrives without a booking.',
      'commandes en cours': 'orders in progress', 'commande en cours': 'order in progress', 'servie': 'served', 'servies': 'served',
      'Nouvelle commande': 'New order', 'il y a {n} min': '{n} min ago', 'Prête': 'Ready', 'Payé': 'Paid', 'Non payé': 'Unpaid',
      'En préparation': 'Preparing', 'Autorisation caisse': 'Till authorisation', 'Démo locale': 'Local demo',
      'n’importe quel code': 'any code works',
      'Note cuisine, ex. bien chaud, sans oignon': 'Kitchen note, e.g. extra hot, no onion',
      'Agrandir et voir le détail': 'Expand to see details', "Afficher l'addition": 'Show the bill', 'Moins': 'Less',
      'Catégories du menu': 'Menu categories', 'Plan de la salle': 'Floor plan', 'Légende': 'Legend', 'Étage': 'Floor',
      'Se déconnecter': 'Sign out', 'Basculer le mode nuit': 'Toggle night mode', 'Actions caisse': 'Till actions',
      'Espaces de travail': 'Workspaces', 'Stock et approvisionnement': 'Stock and supplies',
      'Commande vide. Choisissez un article dans le menu.': 'Empty order. Choose an item from the menu.',
      "Touchez une table pour voir l'addition.": 'Tap a table to see its bill.',
      /* ── rail ── */
      'Vente': 'Sale', 'Scan': 'Scan', 'Inventaire': 'Stock',
      'Échanges & avoirs': 'Returns & credit', 'Clientes': 'Customers',
      'Clients': 'Customers', 'Promotions': 'Promotions',
      'Plein écran': 'Fullscreen', 'Quitter le plein écran': 'Exit fullscreen',
      'Fin de service': 'End of shift', 'Verrouiller': 'Lock',
      'Rafraîchir': 'Refresh', 'Réimprimer': 'Reprint',
      'En ligne': 'Online', 'Hors-ligne': 'Offline', 'Hors ligne': 'Offline',
      'En ligne · synchronisé': 'Online · synced', 'Langue': 'Language',
      'Le même Kiwi, un seul compte.': 'One Kiwi, one account.',
      /* La signature du rail est coupée par un `<b>` : « Le même Kiwi,
         <b>un seul compte</b>. » Le balayage travaille nœud par nœud, il ne voit
         donc JAMAIS la phrase entière — seulement ses deux moitiés. On donne les
         deux, dans le même ordre dans les trois langues : le gras tombe au bon
         endroit sans qu'on ait à toucher au gabarit. */
      'Le même Kiwi,': 'One Kiwi,', 'un seul compte': 'one account',

      /* ── écran de vente ── */
      'Scannez un code-barres, ou touchez un article': 'Scan a barcode, or tap an item',
      'Scannez un code-barres pour l’ajouter au ticket…': 'Scan a barcode to add it to the sale…',
      'Scannez un code-barres pour l\'ajouter au ticket…': 'Scan a barcode to add it to the sale…',
      'Entrée': 'Enter', 'ENTRÉE': 'ENTER', 'Tous': 'All', 'En promo': 'On sale',
      'Divers': 'Other', 'épuisé': 'out of stock', 'ÉPUISÉ': 'OUT OF STOCK',
      'stock bas': 'low stock', 'Épuisé': 'Out of stock', 'Stock bas': 'Low stock',
      'Disponible': 'In stock', 'Envoyer vers la vente': 'Send to the sale',

      /* ── ticket ── */
      'Ticket': 'Sale', 'Vider': 'Clear', 'Total': 'Total',
      'Attacher une cliente': 'Attach a customer',
      'Téléphone d’abord, points et taille suivent': 'Phone first, points and size follow',
      'Téléphone d\'abord, points et taille suivent': 'Phone first, points and size follow',
      'Chercher': 'Search', 'Changer': 'Change', 'Cliente de passage': 'Walk-in customer',
      'Sans fiche, retrouvable par n° de ticket': 'No record, findable by receipt number',
      'Le ticket est vide.': 'The sale is empty.',
      'Touchez un article dans la grille, ou scannez son code-barres.': 'Tap an item in the grid, or scan its barcode.',
      'Encaisser': 'Take payment', 'Remise': 'Discount', 'Récompense': 'Reward',
      'article': 'item', 'articles': 'items',
      'Récompense appliquée': 'Reward applied', 'Récompense prête': 'Reward ready',
      'Points débités à l’encaissement': 'Points deducted at payment',
      'Utiliser': 'Use', 'Annuler': 'Cancel', 'Ajouter au ticket': 'Add to the sale',
      'Quantité': 'Quantity', 'Couleur': 'Colour', 'Taille': 'Size', 'Sans': 'None',
      'accord gérante': 'manager approval', 'en stock': 'in stock',
      'habituelle': 'usual', 'Choisir cet article': 'Choose this item',

      /* ── promotions ── */
      'de remise': 'off', 'prix fixe': 'fixed price',
      '{n} article concerné': '{n} item covered', '{n} articles concernés': '{n} items covered',
      '{n} promotion en cours': '{n} promotion running', '{n} promotions en cours': '{n} promotions running',
      '{n} article remisé': '{n} item discounted', '{n} articles remisés': '{n} items discounted',
      'Se termine dans {n} jours': 'Ends in {n} days', 'Démarre dans {n} jours': 'Starts in {n} days',
      'Se termine demain': 'Ends tomorrow', 'Démarre demain': 'Starts tomorrow',
      'Il en reste {n} ou moins': '{n} left or fewer',
      /* Le bandeau du carnet clients : « 1 pt / MAD · palier 100 ». */
      '{n} pt / MAD': '{n} pt per MAD', 'palier {n}': 'tier {n}',
      /* Les segments d'une fiche cliente. « Nouveau » est un mot courant : il ne
         se traduit que seul, dans son propre nœud — jamais au milieu d'un nom. */
      'Régulier': 'Regular', 'Nouveau': 'New', 'Dormant': 'Dormant',
      /* La fiche cliente et son formulaire — le carnet est une page à part
         entière, il se lit en entier dans la langue du comptoir. */
      'Récompense prête': 'Reward ready', 'récompense {x}': 'reward {x}',
      'Visites': 'Visits', 'Dépensé (MAD)': 'Spent (MAD)', 'Dernière visite': 'Last visit',
      'Email': 'Email', 'Ville': 'City', 'Adresse': 'Address', 'Anniversaire': 'Birthday',
      'Genre': 'Gender', 'Notes': 'Notes', 'Consentement': 'Consent', 'Aucun': 'None',
      'Enregistrer un achat': 'Record a purchase', 'Ajouter un tampon': 'Add a stamp',
      'Valider': 'Confirm', 'Ajouter': 'Add', 'Retour': 'Back', 'Sans nom': 'No name',
      'Offrir la récompense': 'Give the reward', 'réinitialiser': 'reset',
      'Montant en MAD': 'Amount in MAD',
      'Modifier le client': 'Edit customer', 'Nom complet': 'Full name', 'Téléphone': 'Phone',
      'Femme': 'Woman', 'Homme': 'Man', 'Autre': 'Other',
      'Renseignez un maximum d’informations · elles nourrissent la fidélité et le marketing.':
        'Fill in as much as you can · it feeds loyalty and marketing.',
      'Accepte les messages': 'Accepts messages via', 'Accepte les': 'Accepts',
      'emails marketing': 'marketing emails',
      '(offres, fidélité). Consentement requis': '(offers, loyalty). Consent required',
      'CNDP loi 09-08.': 'CNDP law 09-08.',
      'Prénom Nom': 'First name Last name', 'nom@email.com': 'name@email.com',
      'Quartier, rue…': 'District, street…',
      'Préférences, tailles, allergies…': 'Preferences, sizes, allergies…',
      'visite': 'visit', 'visites': 'visits', 'achat': 'purchase', 'achats': 'purchases',
      '{n} j': '{n} d',
      '+1 tampon': '+1 stamp',
      'Client ajouté': 'Customer added', 'Client mis à jour': 'Customer updated',
      'Client supprimé': 'Customer deleted', 'Client déjà enregistré': 'Customer already on file',
      'Achat enregistré': 'Purchase recorded', 'Saisissez un montant': 'Enter an amount',
      'Récompense offerte': 'Reward given', 'Carte réinitialisée.': 'Card reset.',
      'Renseignez au moins un nom ou un numéro': 'Enter at least a name or a number',
      'Le consentement est requis': 'Consent is required',
      'Cochez la case WhatsApp / SMS pour enregistrer.': 'Tick the WhatsApp / SMS box to save.',
      'Sans date de fin, jusqu’à ce que vous l’arrêtiez': 'No end date, until you stop it',
      'Sans date de fin, jusqu\'à ce que vous l\'arrêtiez': 'No end date, until you stop it',
      'En pause, aucun prix n’est modifié': 'Paused, no price is changed',
      'En pause, aucun prix n\'est modifié': 'Paused, no price is changed',
      '{n} ou moins': '{n} or fewer', '{n} jours': '{n} days',
      /* Le bandeau du jour : « jeu. 30 juil. · 18:55 · 5 ventes · 5 550 MAD
         aujourd'hui ». C'est la ligne la plus regardée de l'écran de vente. */
      '{n} vente': '{n} sale', '{n} ventes': '{n} sales',
      '{n} MAD aujourd’hui': '{n} MAD today', '{n} MAD aujourd\'hui': '{n} MAD today',
      /* « par Salma » — un mot d'interface suivi d'une donnée du commerçant.
         Le {x} traverse intact : c'est le prénom de la caissière. */
      'par {x}': 'by {x}',
      'Nouvelle promotion': 'New promotion', 'Modifier la promotion': 'Edit promotion',
      'En cours': 'In progress', 'À venir': 'Upcoming', 'Terminées': 'Finished',
      'Programmée': 'Scheduled', 'En pause': 'Paused', 'Terminée': 'Finished',
      'Tout le magasin': 'The whole shop', 'Un rayon': 'One category',
      'Des articles': 'Chosen items', 'Ancien stock': 'Old stock', 'Fin de série': 'Last few',
      'De combien': 'By how much', 'Sur quoi': 'On what', 'Jusqu’à quand': 'Until when',
      'Jusqu\'à quand': 'Until when',
      'En pourcentage': 'Percentage', 'En dirhams': 'In dirhams', 'Prix fixe': 'Fixed price',
      'Aujourd’hui': 'Today', 'Aujourd\'hui': 'Today', 'Ce week-end': 'This weekend',
      '7 jours': '7 days', '30 jours': '30 days', 'Sans fin': 'No end date',
      'Début': 'Start', 'Fin': 'End', 'Nom': 'Name',
      'Ce que ça touche': 'What it covers', 'Valeur au prix plein': 'Value at full price',
      'Au prix promo': 'At the promo price', 'Vous offrez': 'You give away',
      'Lancer la promotion': 'Launch the promotion', 'Enregistrer': 'Save',
      'Chaque article du magasin, sans exception.': 'Every item in the shop, no exception.',
      'Baissez vos prix une fois, la caisse s’en souvient': 'Set your prices once, the till remembers',
      'Déstocker l’ancienne saison': 'Clear last season',
      'Écouler les fins de série': 'Move the last few',
      'Animer le week-end': 'Liven up the weekend',
      'Déstockage': 'Clearance', 'Fins de série': 'Last few', 'Week-end': 'Weekend',
      'Étiquettes': 'Labels', 'étiquette': 'label', 'étiquettes': 'labels',
      'Imprimer les étiquettes': 'Print the labels',
      'Rien ici': 'Nothing here',
      'Aucune promotion ne tourne en ce moment.': 'No promotion is running right now.',
      'Aucune promotion en attente.': 'No promotion waiting.',
      'Aucune promotion terminée.': 'No finished promotion.',
      'Supprimer': 'Delete', 'Garder': 'Keep', 'Modifier': 'Edit',
      'Mettre en pause': 'Pause', 'Reprendre': 'Resume', 'Fermer': 'Close',

      /* ── réimprimer un ticket ──
         Le panneau n'était pas traduit du tout : le bouton du rail disait bien
         « Reprint », et la fenêtre qui s'ouvrait derrière restait en français.
         Les jours (aujourd'hui, hier, samedi 25) ne passent pas par ici — ils
         portent un quantième, donc pos-reprint.js les écrit lui-même dans la
         langue en cours. */
      'Réimprimer un ticket': 'Reprint a receipt',
      'Les ventes encaissées sur ce terminal. Le duplicata garde le numéro et l’heure d’origine, et porte la mention « duplicata ».':
        'Sales taken on this terminal. The copy keeps the original number and time, and is marked as a duplicate.',
      'Les ventes encaissées sur ce terminal. Le duplicata garde le numéro et l\'heure d\'origine, et porte la mention « duplicata ».':
        'Sales taken on this terminal. The copy keeps the original number and time, and is marked as a duplicate.',
      'Aucun ticket à ressortir sur ce terminal.': 'No receipt to reprint on this terminal.',
      'La liste tient les ventes du jour, et celles des jours précédents dont le ticket a été gardé.':
        'The list holds today’s sales, plus earlier ones whose receipt was kept.',
      'sans numéro': 'no number',
      'Impression du reçu…': 'Printing the receipt…',
      'Duplicata imprimé': 'Duplicate printed',
      'Impression échouée, le ticket n’est pas sorti': 'Printing failed · no receipt came out',
      'Impression échouée, le ticket n\'est pas sorti': 'Printing failed · no receipt came out',
      'Impression indisponible sur cet appareil': 'Printing is unavailable on this device',
      'Ticket introuvable': 'Receipt not found',
      'Imprimer la liste': 'Print the list',
      'Impression de la liste…': 'Printing the list…',
      'Liste imprimée': 'List printed',
      'Impression échouée, la liste n’est pas sortie': 'Printing failed · no list came out',
      'Impression échouée, la liste n\'est pas sortie': 'Printing failed · no list came out',
      'Aucune vente à imprimer': 'No sale to print',
      'Récapitulatif indisponible': 'Summary unavailable',

      /* ── clientes / carnet ── */
      'Carnet clients': 'Customer book', 'Nouveau client': 'New customer',
      'Joignables': 'Reachable', 'Récompenses prêtes': 'Rewards ready', 'Dépensé': 'Spent',
      'Réguliers': 'Regulars', 'Nouveaux': 'New', 'Dormants': 'Dormant', 'Client': 'Customer',
      'Profil': 'Profile', 'Fidélité': 'Loyalty', 'Hier': 'Yesterday', 'Retourné': 'Returned',
      'Échangé': 'Exchanged', 'avoir': 'credit', 'remboursé': 'refunded', 'utilisé': 'used', 'annulé': 'cancelled',
      'Aucun résultat': 'No result',
      'Essayez un autre nom, un autre numéro ou un autre segment.': 'Try another name, number or segment.',
      'Rechercher un nom ou 06…': 'Search a name or 06…', '06… ou nom': '06… or name',
      'Aucun client pour l’instant': 'No customer yet',
      'Ajoutez votre premier client · il apparaîtra aussitôt sur le tableau de bord.':
        'Add your first customer · they appear on the dashboard straight away.',
      'Le téléphone d’abord, la fiche suit la cliente, pas le ticket':
        'Phone first · the record follows the customer, not the receipt',

      /* ── échanges & inventaire ── */
      'Avoirs actifs': 'Active credit', 'Avoir': 'Credit note',
      'Retour sous 7 jours avec ticket, échange ou avoir, jamais de remboursement espèces':
        'Returns within 7 days with receipt, exchange or credit, no cash refunds',
      'Reprendre le stock': 'Enter stock', 'produits': 'products', 'variantes': 'variants',
      'Déclarer une perte': 'Declare waste',
      'Perte de stock': 'Stock waste',
      'Dernières pertes': 'Recent waste',
      'Dernières pertes déclarées': 'Recent declared waste',
      'Motif de la perte': 'Waste reason',
      'Casse / Détérioration': 'Breakage / Damage',
      'Péremption / Date dépassée': 'Expiry / Out of date',
      'Avarie / Défaut': 'Spoilage / Defect',
      'Geste commercial / Offert': 'Commercial gesture / Gift',
      'Repas employé': 'Staff meal',
      'Quantité perdue': 'Lost quantity',
      'Enregistrer la perte': 'Record waste',
      'Inventaire physique': 'Physical stock count',
      'Inventaire physique à l’aveugle': 'Blind physical inventory',
      'Inventaire physique à l\'aveugle': 'Blind physical inventory',
      'Comptage de stock en caisse': 'Till stock counting',
      'Démarrer le comptage': 'Start counting',
      'Démarrer le comptage aveugle': 'Start blind count',
      'Quantité physique': 'Physical quantity',
      'Vérifier et transmettre': 'Review and submit',
      'Transmettre au propriétaire': 'Submit to owner',
      'La revue est le seul chemin d’écriture': 'Review is the only write path',
      'La revue est le seul chemin d\'écriture': 'Review is the only write path',
      'Inventaire physique transmis': 'Physical count submitted',
      'Retour à la caisse': 'Back to till',
      'Récapitulatif avant transmission': 'Summary before submission',
      'À compter': 'To count',
      'Saisi': 'Entered',
      'Comptés': 'Counted',
      'Restants': 'Remaining',
      'Scanner un code-barres ou chercher un article…': 'Scan a barcode or search an item…',

      /* ── paiement ── */
      'Encaissement': 'Payment', 'Espèces': 'Cash', 'espèces': 'cash',
      'Carte': 'Card', 'carte': 'card', 'Livraison': 'Delivery',
      'Remboursements à synchroniser': 'Refunds to sync',
      'Ils sont déjà déduits de cette caisse, mais pas encore des rapports. Un manager doit confirmer chaque montant.':
        'They are already deducted from this till, but not from reports yet. A manager must confirm each amount.',
      'Autoriser et synchroniser': 'Approve and sync',
      'Vente introuvable': 'Sale not found',
      'Ticket original introuvable · aucune écriture envoyée': 'Original receipt not found · nothing was sent',
      'Synchronisation impossible · aucune écriture envoyée': 'Sync unavailable · nothing was sent',
      'Synchroniser le remboursement': 'Sync the refund',
      'Autorisation manager non reçue': 'Manager approval not received',
      'Remboursement autorisé · synchronisation en cours': 'Refund approved · syncing',
      'Remboursement conservé · synchronisation impossible': 'Refund kept · unable to sync',
    },

    ar: {
      "Khtar la transaction à rembourser, journal d'lyoum.": "اختر معاملة لاستردادها من سجل اليوم.",
      "Rechercher, table, montant, réf": "ابحث بالطاولة أو المبلغ أو المرجع",
      "Rechercher une transaction": "البحث في المعاملات",
      'version commerçant': 'نسخة التاجر', '· version commerçant': '· نسخة التاجر', 'Bonjour': 'مرحباً',
      'Caissier': 'أمين الصندوق', 'Fond d’ouverture': 'رصيد الافتتاح',
      "Fond d'ouverture": 'رصيد الافتتاح', 'Ouvrir la caisse': 'افتح الصندوق',
      /* ── caisse restaurant : salle, tables, addition, paiement (app native, 2026-09-27) ── */
      'Identifiant caisse': 'معرّف الصندوق', 'Inactif': 'متوقفة', 'Annuler une vente': 'إلغاء بيع', 'Remboursement': 'استرداد',
      'Mouvement caisse': 'حركة نقدية', 'Passation caisse': 'تسليم الصندوق', 'Ouvrir le tiroir': 'فتح الدرج',
      'Code de pointage': 'رمز الحضور', 'Équipe': 'الفريق', 'Écran cuisine': 'شاشة المطبخ',
      'Impression cuisine': 'طباعة المطبخ', 'Clients & fidélité': 'الزبناء والولاء', 'Mode nuit': 'الوضع الليلي',
      "Fin d'service": 'نهاية الخدمة', 'Sortir': 'خروج', 'En service': 'في الخدمة',
      'Plan de salle': 'مخطط القاعة', 'Rez-de-chaussée': 'الطابق الأرضي', 'étage': 'طابق', 'er': '\u200c', 'Table T{n} ouverte': 'فُتحت الطاولة T{n}',
      'Libre': 'فارغة', 'À commander': 'في انتظار الطلب', 'Addition': 'الحساب', 'Réglée': 'مدفوعة',
      '· salle': '· القاعة', 'CUISINE': 'المطبخ', 'COMPTOIR': 'الكونطوار', 'Terrasse': 'التراس',
      '· extérieur': '· خارجي', '{n} / {n} occupées': '{n} / {n} مشغولة',
      'À emporter': 'للأخذ', 'Tout': 'الكل', 'Commande': 'الطلب', 'en cours': 'جارٍ',
      'couverts': 'أشخاص', 'couvert': 'شخص', 'Servi par': 'يخدمها', 'en pause': 'في استراحة',
      'Sélectionnez des articles dans le menu à gauche': 'اختر أصنافاً من القائمة',
      'Nouvelle table, en attente de commande': 'طاولة جديدة في انتظار الطلب',
      'Envoyer en cuisine': 'إرسال إلى المطبخ', 'Annuler commande': 'إلغاء الطلب', 'Partager': 'مشاركة',
      'Réduction': 'تخفيض', 'Imprimer': 'طباعة', 'Vider la commande': 'إفراغ الطلب', 'Détails': 'التفاصيل',
      'Payer en espèces': 'الدفع نقداً', 'Pourboire': 'البقشيش', 'Sans pourboire': 'بدون بقشيش', 'Espèces reçues': 'المبلغ المستلم',
      'Rendu': 'الباقي', 'Confirmer': 'تأكيد', 'Montant reçu': 'المبلغ المستلم',
      'Payer par carte': 'الدفع بالبطاقة', 'Payer par carte · F3': 'الدفع بالبطاقة · F3',
      'Approchez la carte ou le téléphone': 'قرّب البطاقة أو الهاتف',
      "Diviser l'addition": 'تقسيم الحساب', 'Choisissez un mode de partage. Chaque part part avec son ticket et son TPE.': 'اختر طريقة التقسيم. لكل حصة إيصالها ودفعها.',
      'À parts égales': 'حصص متساوية', 'parts': 'حصص', '{n} MAD chacun': '{n} MAD لكل واحد', 'Par article': 'حسب الصنف',
      'Assignez chaque ligne à un convive': 'خصّص كل سطر لضيف', 'Nombre de parts': 'عدد الحصص',
      'Pourboire commun': 'بقشيش مشترك', 'autre': 'آخر', 'Total à diviser': 'المجموع للتقسيم', 'Par convive': 'لكل ضيف',
      'Lancer le split': 'بدء التقسيم',
      'Nouvelle table': 'طاولة جديدة', 'Ouvrir': 'فتح', 'Combien de couverts?': 'كم عدد الأشخاص؟',
      'Ouvrir la table': 'فتح الطاولة', 'Annuler la table': 'إلغاء الطاولة', 'Encaisser la table': 'تحصيل الطاولة',
      '{n} mn': '{n} د', 'Ajouter des articles': 'إضافة أصناف', 'Déplacer table': 'نقل الطاولة', 'Fusionner': 'دمج',
      'Ticket cuisine en attente': 'بون المطبخ في الانتظار',
      'Imprimante indisponible : le ticket reste dans la file et sera réessayé.': 'الطابعة غير متاحة: يبقى البون في الانتظار وسيعاد إرساله.',
      'article en cuisine': 'صنف في المطبخ', 'articles en cuisine': 'أصناف في المطبخ', 'bon {x}': 'بون {x}',
      "Liste d'attente": 'قائمة الانتظار', 'Ajouter à la file': 'إضافة إلى القائمة', 'Personne en attente': 'لا أحد في الانتظار',
      'Clique « Ajouter à la file » quand un client se présente sans réservation.': 'اضغط «إضافة إلى القائمة» عندما يصل زبون بدون حجز.',
      'commandes en cours': 'طلبات جارية', 'commande en cours': 'طلب جارٍ', 'servie': 'مقدَّمة', 'servies': 'مقدَّمة',
      'Nouvelle commande': 'طلب جديد', 'il y a {n} min': 'منذ {n} د', 'Prête': 'جاهزة', 'Payé': 'مدفوع', 'Non payé': 'غير مدفوع',
      'En préparation': 'قيد التحضير', 'Autorisation caisse': 'إذن الصندوق', 'Démo locale': 'عرض محلي',
      'n’importe quel code': 'أي رمز يعمل',
      'Note cuisine, ex. bien chaud, sans oignon': 'ملاحظة للمطبخ، مثلاً ساخن جداً، بدون بصل',
      'Agrandir et voir le détail': 'توسيع لرؤية التفاصيل', "Afficher l'addition": 'عرض الحساب', 'Moins': 'أقل',
      'Catégories du menu': 'فئات القائمة', 'Plan de la salle': 'مخطط القاعة', 'Légende': 'المفتاح', 'Étage': 'الطابق',
      'Se déconnecter': 'تسجيل الخروج', 'Basculer le mode nuit': 'تبديل الوضع الليلي', 'Actions caisse': 'إجراءات الصندوق',
      'Espaces de travail': 'مساحات العمل', 'Stock et approvisionnement': 'المخزون والتموين',
      'Commande vide. Choisissez un article dans le menu.': 'الطلب فارغ. اختر صنفاً من القائمة.',
      "Touchez une table pour voir l'addition.": 'اضغط على طاولة لرؤية حسابها.',
      /* ── rail ── */
      'Vente': 'البيع', 'Scan': 'المسح', 'Inventaire': 'المخزون',
      'Échanges & avoirs': 'التبديل والأرصدة', 'Clientes': 'الزبونات',
      'Clients': 'الزبناء', 'Promotions': 'العروض',
      'Plein écran': 'ملء الشاشة', 'Quitter le plein écran': 'الخروج من ملء الشاشة',
      'Fin de service': 'نهاية الخدمة', 'Verrouiller': 'قفل',
      'Rafraîchir': 'تحديث', 'Réimprimer': 'إعادة الطباعة',
      'En ligne': 'متصل', 'Hors-ligne': 'غير متصل', 'Hors ligne': 'غير متصل',
      'En ligne · synchronisé': 'متصل · متزامن', 'Langue': 'اللغة',
      'Le même Kiwi, un seul compte.': 'نفس كيوي، حساب واحد.',
      'Le même Kiwi,': 'نفس كيوي،', 'un seul compte': 'حساب واحد',

      /* ── écران de vente ── */
      'Scannez un code-barres, ou touchez un article': 'امسح رمزاً شريطياً، أو المس منتجاً',
      'Scannez un code-barres pour l’ajouter au ticket…': 'امسح رمزاً شريطياً لإضافته إلى التذكرة…',
      'Scannez un code-barres pour l\'ajouter au ticket…': 'امسح رمزاً شريطياً لإضافته إلى التذكرة…',
      'Entrée': 'إدخال', 'ENTRÉE': 'إدخال', 'Tous': 'الكل', 'En promo': 'في العرض',
      'Divers': 'متنوع', 'épuisé': 'نفد', 'ÉPUISÉ': 'نفد',
      'stock bas': 'مخزون منخفض', 'Épuisé': 'نفد', 'Stock bas': 'مخزون منخفض',
      'Disponible': 'متوفر', 'Envoyer vers la vente': 'إرسال إلى البيع',

      /* ── ticket ── */
      'Ticket': 'التذكرة', 'Vider': 'إفراغ', 'Total': 'المجموع',
      'Attacher une cliente': 'ربط زبونة',
      'Téléphone d’abord, points et taille suivent': 'الهاتف أولاً، النقاط والمقاس يتبعان',
      'Téléphone d\'abord, points et taille suivent': 'الهاتف أولاً، النقاط والمقاس يتبعان',
      'Chercher': 'بحث', 'Changer': 'تغيير', 'Cliente de passage': 'زبونة عابرة',
      'Sans fiche, retrouvable par n° de ticket': 'بدون بطاقة، تُسترجع برقم التذكرة',
      'Le ticket est vide.': 'التذكرة فارغة.',
      'Touchez un article dans la grille, ou scannez son code-barres.': 'المس منتجاً في الشبكة، أو امسح رمزه الشريطي.',
      'Encaisser': 'تحصيل', 'Remise': 'تخفيض', 'Récompense': 'مكافأة',
      'article': 'منتج', 'articles': 'منتجات',
      'Récompense appliquée': 'المكافأة مطبَّقة', 'Récompense prête': 'المكافأة جاهزة',
      'Points débités à l’encaissement': 'تُخصم النقاط عند الأداء',
      'Utiliser': 'استعمال', 'Annuler': 'إلغاء', 'Ajouter au ticket': 'أضف إلى التذكرة',
      'Quantité': 'الكمية', 'Couleur': 'اللون', 'Taille': 'المقاس', 'Sans': 'بدون',
      'accord gérante': 'بموافقة المسؤولة', 'en stock': 'في المخزون',
      'habituelle': 'المعتاد', 'Choisir cet article': 'اختر هذا المنتج',

      /* ── promotions ── */
      'de remise': 'تخفيض', 'prix fixe': 'ثمن ثابت',
      '{n} article concerné': '{n} منتج معني', '{n} articles concernés': '{n} منتجات معنية',
      '{n} promotion en cours': '{n} عرض جارٍ', '{n} promotions en cours': '{n} عروض جارية',
      '{n} article remisé': '{n} منتج مخفَّض', '{n} articles remisés': '{n} منتجات مخفَّضة',
      'Se termine dans {n} jours': 'ينتهي بعد {n} أيام', 'Démarre dans {n} jours': 'يبدأ بعد {n} أيام',
      'Se termine demain': 'ينتهي غداً', 'Démarre demain': 'يبدأ غداً',
      'Il en reste {n} ou moins': 'يبقى منه {n} أو أقل',
      '{n} pt / MAD': '{n} نقطة لكل MAD', 'palier {n}': 'عتبة {n}',
      'Régulier': 'منتظم', 'Nouveau': 'جديد', 'Dormant': 'خامل',
      'Récompense prête': 'المكافأة جاهزة', 'récompense {x}': 'مكافأة {x}',
      'Visites': 'الزيارات', 'Dépensé (MAD)': 'المصروف (MAD)', 'Dernière visite': 'آخر زيارة',
      'Email': 'البريد الإلكتروني', 'Ville': 'المدينة', 'Adresse': 'العنوان', 'Anniversaire': 'تاريخ الميلاد',
      'Genre': 'النوع', 'Notes': 'ملاحظات', 'Consentement': 'الموافقة', 'Aucun': 'لا شيء',
      'Enregistrer un achat': 'تسجيل شراء', 'Ajouter un tampon': 'إضافة طابع',
      'Valider': 'تأكيد', 'Ajouter': 'إضافة', 'Retour': 'رجوع', 'Sans nom': 'بدون اسم',
      'Offrir la récompense': 'منح المكافأة', 'réinitialiser': 'إعادة البدء',
      'Montant en MAD': 'المبلغ بالدرهم',
      'Modifier le client': 'تعديل الزبون', 'Nom complet': 'الاسم الكامل', 'Téléphone': 'الهاتف',
      'Femme': 'أنثى', 'Homme': 'ذكر', 'Autre': 'آخر',
      'Renseignez un maximum d’informations · elles nourrissent la fidélité et le marketing.':
        'املأ أكبر قدر من المعلومات · منها يتغذّى الوفاء والتسويق.',
      'Accepte les messages': 'يقبل الرسائل عبر', 'Accepte les': 'يقبل',
      'emails marketing': 'الرسائل التسويقية',
      '(offres, fidélité). Consentement requis': '(عروض، وفاء). الموافقة إلزامية',
      'CNDP loi 09-08.': 'قانون CNDP 09-08.',
      'Prénom Nom': 'الاسم والنسب', 'nom@email.com': 'name@email.com',
      'Quartier, rue…': 'الحي، الشارع…',
      'Préférences, tailles, allergies…': 'التفضيلات، المقاسات، الحساسية…',
      'visite': 'زيارة', 'visites': 'زيارات', 'achat': 'شراء', 'achats': 'مشتريات',
      '{n} j': '{n} ي',
      '+1 tampon': '+1 طابع',
      'Client ajouté': 'تمت إضافة الزبون', 'Client mis à jour': 'تم تحديث الزبون',
      'Client supprimé': 'تم حذف الزبون', 'Client déjà enregistré': 'الزبون مسجَّل من قبل',
      'Achat enregistré': 'تم تسجيل الشراء', 'Saisissez un montant': 'أدخل مبلغاً',
      'Récompense offerte': 'تم منح المكافأة', 'Carte réinitialisée.': 'تمت إعادة البطاقة.',
      'Renseignez au moins un nom ou un numéro': 'أدخل على الأقل اسماً أو رقماً',
      'Le consentement est requis': 'الموافقة إلزامية',
      'Cochez la case WhatsApp / SMS pour enregistrer.': 'فعّل خانة WhatsApp / SMS للتسجيل.',
      'Sans date de fin, jusqu’à ce que vous l’arrêtiez': 'بدون تاريخ نهاية، إلى أن توقفه',
      'Sans date de fin, jusqu\'à ce que vous l\'arrêtiez': 'بدون تاريخ نهاية، إلى أن توقفه',
      'En pause, aucun prix n’est modifié': 'موقوف، لا يتغيّر أي ثمن',
      'En pause, aucun prix n\'est modifié': 'موقوف، لا يتغيّر أي ثمن',
      '{n} ou moins': '{n} أو أقل', '{n} jours': '{n} أيام',
      '{n} vente': '{n} مبيعة', '{n} ventes': '{n} مبيعات',
      '{n} MAD aujourd’hui': '{n} MAD اليوم', '{n} MAD aujourd\'hui': '{n} MAD اليوم',
      'par {x}': 'بواسطة {x}',
      'Nouvelle promotion': 'عرض جديد', 'Modifier la promotion': 'تعديل العرض',
      'En cours': 'جارٍ', 'À venir': 'قادم', 'Terminées': 'منتهية',
      'Programmée': 'مبرمج', 'En pause': 'موقوف', 'Terminée': 'منتهٍ',
      'Tout le magasin': 'كل المحل', 'Un rayon': 'قسم واحد',
      'Des articles': 'منتجات مختارة', 'Ancien stock': 'مخزون قديم', 'Fin de série': 'آخر القطع',
      'De combien': 'بكم', 'Sur quoi': 'على ماذا', 'Jusqu’à quand': 'إلى متى',
      'Jusqu\'à quand': 'إلى متى',
      'En pourcentage': 'بالنسبة المئوية', 'En dirhams': 'بالدرهم', 'Prix fixe': 'ثمن ثابت',
      'Aujourd’hui': 'اليوم', 'Aujourd\'hui': 'اليوم', 'Ce week-end': 'نهاية الأسبوع',
      '7 jours': '7 أيام', '30 jours': '30 يوماً', 'Sans fin': 'بدون نهاية',
      'Début': 'البداية', 'Fin': 'النهاية', 'Nom': 'الاسم',
      'Ce que ça touche': 'ما يشمله', 'Valeur au prix plein': 'القيمة بالثمن الكامل',
      'Au prix promo': 'بثمن العرض', 'Vous offrez': 'تمنح',
      'Lancer la promotion': 'إطلاق العرض', 'Enregistrer': 'حفظ',
      'Chaque article du magasin, sans exception.': 'كل منتج في المحل، بدون استثناء.',
      'Baissez vos prix une fois, la caisse s’en souvient': 'خفّض أثمانك مرة واحدة، والصندوق يتذكّر',
      'Déstocker l’ancienne saison': 'تصفية الموسم الماضي',
      'Écouler les fins de série': 'تصريف آخر القطع',
      'Animer le week-end': 'تنشيط نهاية الأسبوع',
      'Déstockage': 'تصفية', 'Fins de série': 'آخر القطع', 'Week-end': 'نهاية الأسبوع',
      'Étiquettes': 'الملصقات', 'étiquette': 'ملصق', 'étiquettes': 'ملصقات',
      'Imprimer les étiquettes': 'طباعة الملصقات',
      'Rien ici': 'لا شيء هنا',
      'Aucune promotion ne tourne en ce moment.': 'لا يوجد عرض جارٍ حالياً.',
      'Aucune promotion en attente.': 'لا يوجد عرض في الانتظار.',
      'Aucune promotion terminée.': 'لا يوجد عرض منتهٍ.',
      'Supprimer': 'حذف', 'Garder': 'إبقاء', 'Modifier': 'تعديل',
      'Mettre en pause': 'إيقاف مؤقت', 'Reprendre': 'استئناف', 'Fermer': 'إغلاق',

      /* ── réimprimer un ticket ── (voir la note côté anglais) */
      'Réimprimer un ticket': 'إعادة طباعة تذكرة',
      'Les ventes encaissées sur ce terminal. Le duplicata garde le numéro et l’heure d’origine, et porte la mention « duplicata ».':
        'المبيعات المسجَّلة على هذا الصندوق. النسخة تحتفظ برقم وساعة التذكرة الأصلية، وتحمل عبارة « نسخة ».',
      'Les ventes encaissées sur ce terminal. Le duplicata garde le numéro et l\'heure d\'origine, et porte la mention « duplicata ».':
        'المبيعات المسجَّلة على هذا الصندوق. النسخة تحتفظ برقم وساعة التذكرة الأصلية، وتحمل عبارة « نسخة ».',
      'Aucun ticket à ressortir sur ce terminal.': 'لا توجد تذكرة لإعادة طباعتها على هذا الصندوق.',
      'La liste tient les ventes du jour, et celles des jours précédents dont le ticket a été gardé.':
        'اللائحة تضم مبيعات اليوم، ومبيعات الأيام السابقة التي حُفظت تذكرتها.',
      'sans numéro': 'بدون رقم',
      'Impression du reçu…': 'جارٍ طبع الوصل…',
      'Duplicata imprimé': 'طُبعت النسخة',
      'Impression échouée, le ticket n’est pas sorti': 'فشل الطبع، لم تخرج التذكرة',
      'Impression échouée, le ticket n\'est pas sorti': 'فشل الطبع، لم تخرج التذكرة',
      'Impression indisponible sur cet appareil': 'الطبع غير متاح على هذا الجهاز',
      'Ticket introuvable': 'التذكرة غير موجودة',
      'Imprimer la liste': 'طبع اللائحة',
      'Impression de la liste…': 'جارٍ طبع اللائحة…',
      'Liste imprimée': 'طُبعت اللائحة',
      'Impression échouée, la liste n’est pas sortie': 'فشل الطبع، لم تخرج اللائحة',
      'Impression échouée, la liste n\'est pas sortie': 'فشل الطبع، لم تخرج اللائحة',
      'Aucune vente à imprimer': 'لا توجد مبيعات للطبع',
      'Récapitulatif indisponible': 'التقرير غير متاح',

      /* ── clientes / carnet ── */
      'Carnet clients': 'دفتر الزبناء', 'Nouveau client': 'زبون جديد',
      'Joignables': 'يمكن التواصل معهم', 'Récompenses prêtes': 'مكافآت جاهزة', 'Dépensé': 'المصروف',
      'Réguliers': 'دائمون', 'Nouveaux': 'جدد', 'Dormants': 'غائبون', 'Client': 'الزبون',
      'Profil': 'الفئة', 'Fidélité': 'الولاء', 'Hier': 'أمس', 'Retourné': 'مُرجع',
      'Échangé': 'مُستبدل', 'avoir': 'قسيمة', 'remboursé': 'مُسترد', 'utilisé': 'مستعمل', 'annulé': 'ملغى',
      'Aucun résultat': 'لا توجد نتيجة',
      'Essayez un autre nom, un autre numéro ou un autre segment.': 'جرّب اسماً أو رقماً أو فئة أخرى.',
      'Rechercher un nom ou 06…': 'ابحث باسم أو 06…', '06… ou nom': '06… أو الاسم',
      'Aucun client pour l’instant': 'لا يوجد زبون بعد',
      'Ajoutez votre premier client · il apparaîtra aussitôt sur le tableau de bord.':
        'أضف أول زبون · سيظهر فوراً في لوحة القيادة.',
      'Le téléphone d’abord, la fiche suit la cliente, pas le ticket':
        'الهاتف أولاً، البطاقة تتبع الزبونة لا التذكرة',

      /* ── échanges & inventaire ── */
      'Avoirs actifs': 'الأرصدة النشطة', 'Avoir': 'رصيد',
      'Retour sous 7 jours avec ticket, échange ou avoir, jamais de remboursement espèces':
        'الإرجاع خلال 7 أيام بالتذكرة، تبديل أو رصيد، بدون إرجاع نقدي',
      'Reprendre le stock': 'إدخال المخزون', 'produits': 'منتجات', 'variantes': 'تشكيلات',
      'Déclarer une perte': 'تسجيل تالف',
      'Perte de stock': 'خسائر المخزون',
      'Dernières pertes': 'آخر الخسائر',
      'Dernières pertes déclarées': 'آخر الخسائر المسجلة',
      'Motif de la perte': 'سبب الخسارة',
      'Casse / Détérioration': 'كسر / تلف',
      'Péremption / Date dépassée': 'انتهاء الصلاحية',
      'Avarie / Défaut': 'عيب / عطب',
      'Geste commercial / Offert': 'مجاملة / إهداء',
      'Repas employé': 'وجبة موظف',
      'Quantité perdue': 'الكمية التالفة',
      'Enregistrer la perte': 'حفظ الخسارة',
      'Inventaire physique': 'جرد فعلي للمخزون',
      'Inventaire physique à l’aveugle': 'جرد أعمى للمخزون',
      'Inventaire physique à l\'aveugle': 'جرد أعمى للمخزون',
      'Comptage de stock en caisse': 'عد المخزون في الصندوق',
      'Démarrer le comptage': 'بدء العد',
      'Démarrer le comptage aveugle': 'بدء العد الأعمى',
      'Quantité physique': 'الكمية الفعلية',
      'Vérifier et transmettre': 'مراجعة وإرسال',
      'Transmettre au propriétaire': 'إرسال للمالك',
      'La revue est le seul chemin d’écriture': 'المراجعة هي المسار الوحيد للتعديل',
      'La revue est le seul chemin d\'écriture': 'المراجعة هي المسار الوحيد للتعديل',
      'Inventaire physique transmis': 'تم إرسال الجرد الفعلي',
      'Retour à la caisse': 'العودة إلى الصندوق',
      'Récapitulatif avant transmission': 'ملخص قبل الإرسال',
      'À compter': 'قيد الجرد',
      'Saisi': 'تم الإدخال',
      'Comptés': 'تم عدها',
      'Restants': 'المتبقي',
      'Scanner un code-barres ou chercher un article…': 'امسح باركود أو ابحث عن منتج…',

      /* ── paiement ── */
      'Encaissement': 'الأداء', 'Espèces': 'نقداً', 'espèces': 'نقداً',
      'Carte': 'بطاقة', 'carte': 'بطاقة', 'Livraison': 'توصيل',
      'Remboursements à synchroniser': 'مبالغ مسترجعة بانتظار المزامنة',
      'Ils sont déjà déduits de cette caisse, mais pas encore des rapports. Un manager doit confirmer chaque montant.':
        'تم خصمها من هذا الصندوق، لكنها لم تظهر بعد في التقارير. يجب على المسؤول تأكيد كل مبلغ.',
      'Autoriser et synchroniser': 'الموافقة والمزامنة',
      'Vente introuvable': 'العملية الأصلية غير موجودة',
      'Ticket original introuvable · aucune écriture envoyée': 'التذكرة الأصلية غير موجودة · لم يتم إرسال أي قيد',
      'Synchronisation impossible · aucune écriture envoyée': 'تعذرت المزامنة · لم يتم إرسال أي قيد',
      'Synchroniser le remboursement': 'مزامنة المبلغ المسترجع',
      'Autorisation manager non reçue': 'لم تصل موافقة المسؤول',
      'Remboursement autorisé · synchronisation en cours': 'تمت الموافقة على الاسترجاع · جارٍ المزامنة',
      'Remboursement conservé · synchronisation impossible': 'تم الاحتفاظ بالاسترجاع · تعذرت المزامنة',
    },
  };
  /* Till toasts reachable on iPhone (pass 4 sweep, 2026-09-29). Toasts pass
     through the same text-node sweep, split on « · », so each segment is its
     own key. Dynamic prefixes (« Table « … », « Remise − … ») are left out:
     they never match as a whole segment. */
  (function () {
    var T = {
      "Valide ou annule la commande d'abord": ['Confirm or cancel the order first', 'أكّد الطلب أو ألغه أولًا'],
      'Article non vendable individuellement': ['This item cannot be sold on its own', 'لا يُباع هذا المنتج بمفرده'],
      'Article libre': ['Custom item', 'منتج حر'],
      'Cette formule n’est plus disponible sur la carte': ['This set menu is no longer on the menu', 'هذه الوجبة لم تعد في القائمة'],
      'Table occupée, choisis une table libre': ['Table taken, choose a free table', 'الطاولة مشغولة، اختر طاولة فارغة'],
      'Aucune table sélectionnée': ['No table selected', 'لم يتم اختيار أي طاولة'],
      'Commande vide': ['Empty order', 'الطلب فارغ'],
      'Impression échouée': ['Printing failed', 'فشلت الطباعة'],
      'Addition imprimée': ['Bill printed', 'تمت طباعة الحساب'],
      'Aperçu de démonstration, aucun ticket physique imprimé': ['Demo preview, no paper receipt printed', 'معاينة تجريبية، لم تتم طباعة أي تذكرة'],
      'Aucun ticket à réimprimer': ['No receipt to reprint', 'لا توجد تذكرة لإعادة طباعتها'],
      'Commande vidée': ['Order cleared', 'تم إفراغ الطلب'],
      'Encaissement à vérifier dans le journal avant de réessayer': ['Check the payment in the journal before trying again', 'تحقق من الدفع في السجل قبل إعادة المحاولة'],
      'Paiement QR indisponible': ['QR payment unavailable', 'الدفع عبر QR غير متاح'],
      'configurez un fournisseur QR': ['set up a QR provider', 'اضبط مزوّد QR'],
      'Addition vide': ['Empty bill', 'الحساب فارغ'],
      'Monnaie à rendre :': ['Change due:', 'الباقي للزبون:'],
      'Ajoute un nom': ['Add a name', 'أضف اسمًا'],
      'Déplacement de table non disponible': ['Moving tables is not available', 'نقل الطاولة غير متاح'],
      'Fusion de tables non disponible': ['Merging tables is not available', 'دمج الطاولات غير متاح'],
      'Annulation impossible': ['Cannot cancel', 'تعذّر الإلغاء'],
      'caisse non appairée, article conservé': ['till not paired, item kept', 'الصندوق غير مقترن، تم الاحتفاظ بالمنتج'],
      'Annulation demandée': ['Cancellation requested', 'تم طلب الإلغاء'],
      'attente de la cuisine': ['waiting for the kitchen', 'في انتظار المطبخ'],
      'Article conservé': ['Item kept', 'تم الاحتفاظ بالمنتج'],
      'Déjà en cuisine': ['Already in the kitchen', 'في المطبخ بالفعل'],
      "ça s'annule à la cuisine": ['cancel it with the kitchen', 'يُلغى من المطبخ'],
      "Cette table n'existe plus sur le plan": ['This table is no longer on the floor plan', 'هذه الطاولة لم تعد في المخطط'],
      'Bon trop long pour la cuisine': ['Kitchen ticket too long', 'تذكرة المطبخ طويلة جدًا'],
      'Commande annulée': ['Order cancelled', 'تم إلغاء الطلب'],
      'table remise à zéro': ['table reset', 'تمت إعادة ضبط الطاولة'],
      'Aucune table en cours': ['No open table', 'لا توجد طاولة مفتوحة'],
      'Table déjà encaissée': ['Table already paid', 'تم دفع الطاولة بالفعل'],
      'Addition offerte enregistrée': ['Complimentary bill recorded', 'تم تسجيل الحساب المجاني'],
      'table clôturée': ['table closed', 'تم إغلاق الطاولة'],
      'Montant nul non justifié': ['Zero amount without a reason', 'مبلغ صفر بدون مبرر'],
      'appliquez une remise de 100 % approuvée': ['apply an approved 100 % discount', 'طبّق خصمًا معتمدًا بنسبة 100 %'],
      'Trop de parts pour ce montant': ['Too many shares for this amount', 'عدد الحصص كبير لهذا المبلغ'],
      'chaque part doit avoir au moins 0,01 MAD': ['each share must be at least 0.01 MAD', 'يجب ألا تقل كل حصة عن 0,01 MAD'],
      'Une part vaut 0 MAD': ['One share is 0 MAD', 'إحدى الحصص تساوي 0 MAD'],
      'regroupez les articles ou ajustez la remise': ['group the items or adjust the discount', 'اجمع المنتجات أو عدّل الخصم'],
      'Encaissement non enregistré': ['Payment not recorded', 'لم يتم تسجيل الدفع'],
      'la table reste ouverte': ['the table stays open', 'تبقى الطاولة مفتوحة'],
      'Échec de synchronisation de la vente': ['Sale failed to sync', 'فشلت مزامنة البيع'],
      'ne fermez pas cette caisse': ['do not close this till', 'لا تغلق هذا الصندوق'],
      'Enregistrement impossible': ['Could not save', 'تعذّر الحفظ'],
      'Aucun ticket à imprimer': ['No receipt to print', 'لا توجد تذكرة للطباعة'],
      'Ticket ajouté à la file d’impression': ['Receipt added to the print queue', 'أُضيفت التذكرة إلى قائمة الطباعة'],
      'Ticket déjà en attente d’impression': ['Receipt already waiting to print', 'التذكرة في انتظار الطباعة بالفعل'],
      'Ticket déjà imprimé': ['Receipt already printed', 'تمت طباعة التذكرة بالفعل'],
      'Impression du ticket…': ['Printing receipt…', 'جارٍ طباعة التذكرة…'],
      "vérifiez l'imprimante": ['check the printer', 'تحقق من الطابعة'],
      'Aucun ticket à envoyer': ['No receipt to send', 'لا توجد تذكرة للإرسال'],
      'Brouillon WhatsApp ouvert': ['WhatsApp draft opened', 'تم فتح مسودة WhatsApp'],
      'Envoi indisponible sur cet appareil': ['Sending is not available on this device', 'الإرسال غير متاح على هذا الجهاز'],
      'Rapprochement des ventes en attente': ['Sales reconciliation pending', 'مطابقة المبيعات معلّقة'],
      'conservez cette caisse': ['keep this till', 'احتفظ بهذا الصندوق'],
      'Écart caisse détecté': ['Till discrepancy detected', 'تم رصد فرق في الصندوق'],
      'Imprimante indisponible': ['Printer unavailable', 'الطابعة غير متاحة'],
      'Impression impossible': ['Cannot print', 'تعذّرت الطباعة'],
      'le rapport reste dans le tableau de bord': ['the report stays in the dashboard', 'يبقى التقرير في لوحة القيادة'],
      'Caisse fermée': ['Till closed', 'تم إغلاق الصندوق'],
      'à bientôt': ['see you soon', 'إلى اللقاء'],
      'Saisissez les espèces comptées (0 si le tiroir est vide)': ['Enter the cash counted (0 if the drawer is empty)', 'أدخل النقد المعدود (0 إذا كان الدرج فارغًا)'],
      'Saisissez le total carte du Z terminal (0 si aucune carte)': ['Enter the card total from the terminal Z (0 if no cards)', 'أدخل مجموع البطاقات من Z الجهاز (0 إذا لم توجد بطاقات)'],
      'Clôture non enregistrée': ['Close-out not saved', 'لم يتم حفظ الإغلاق'],
      'poste conservé. Vérifiez le stockage puis réessayez.': ['shift kept. Check storage, then try again.', 'تم الاحتفاظ بالوردية. تحقق من التخزين ثم أعد المحاولة.'],
      'Rapprochement Z non protégé': ['Z reconciliation not secured', 'مطابقة Z غير محمية'],
      'Écart Z conservé': ['Z discrepancy kept', 'تم الاحتفاظ بفرق Z'],
      'Rapport indisponible': ['Report unavailable', 'التقرير غير متاح'],
      'Impression…': ['Printing…', 'جارٍ الطباعة…'],
      'Module mouvements de caisse désactivé dans la console God Mode': ['Cash movements are turned off for this account', 'حركات الصندوق معطّلة لهذا الحساب'],
      'Saisis un montant': ['Enter an amount', 'أدخل مبلغًا'],
      'Ouverture manuelle du tiroir désactivée dans la console God Mode': ['Opening the drawer by hand is turned off for this account', 'فتح الدرج يدويًا معطّل لهذا الحساب'],
      'Tiroir injoignable': ['Drawer unreachable', 'تعذّر الوصول إلى الدرج'],
      "vérifiez l'imprimante du comptoir": ['check the counter printer', 'تحقق من طابعة الكاونتر'],
      'Module métier indisponible': ['Trade module unavailable', 'وحدة النشاط غير متاحة'],
      'rechargez la caisse': ['reload the till', 'أعد تحميل الصندوق'],
      'contacte le manager': ['contact the manager', 'اتصل بالمدير'],
      "Écris un message d'abord": ['Write a message first', 'اكتب رسالة أولًا'],
      'Message non envoyé': ['Message not sent', 'لم يتم إرسال الرسالة'],
      'vérifiez la connexion': ['check the connection', 'تحقق من الاتصال'],
      'Split en pause': ['Split paused', 'التقسيم متوقف مؤقتًا'],
      'reprends quand tu veux': ['resume when you like', 'تابع متى شئت'],
      "Termine le split d'abord": ['Finish the split first', 'أنهِ التقسيم أولًا'],
      'Pourcentage non autorisé': ['Percentage not allowed', 'النسبة غير مسموح بها'],
      'rechargez la remise': ['reload the discount', 'أعد تحميل الخصم'],
      'Choisis une remise': ['Choose a discount', 'اختر خصمًا'],
      'Remise sans effet': ['Discount has no effect', 'الخصم بدون أثر'],
      'Remise appliquée': ['Discount applied', 'تم تطبيق الخصم'],
      'Remise supprimée': ['Discount removed', 'تمت إزالة الخصم'],
      'Ticket original introuvable': ['Original receipt not found', 'التذكرة الأصلية غير موجودة'],
      'aucune écriture envoyée': ['nothing was sent', 'لم يُرسل أي قيد'],
      'Synchronisation impossible': ['Cannot sync', 'تعذّرت المزامنة'],
      'Module remboursement désactivé dans la console God Mode': ['Refunds are turned off for this account', 'الاسترداد معطّل لهذا الحساب'],
      'Transaction déjà remboursée': ['Transaction already refunded', 'تم استرداد المعاملة بالفعل'],
      'Remboursement enregistré ici': ['Refund saved on this till', 'تم حفظ الاسترداد هنا'],
      'synchronisation à reprendre': ['sync to resume', 'المزامنة ستُستأنف'],
      'Cette caisse doit d’abord être appairée': ['Pair this till first', 'يجب إقران هذا الصندوق أولًا'],
      'Identifiant de caisse copié': ['Till ID copied', 'تم نسخ معرّف الصندوق'],
      'Passation de caisse désactivée dans la console God Mode': ['Till handover is turned off for this account', 'تسليم الصندوق معطّل لهذا الحساب'],
      'Choisis le caissier entrant': ['Choose the incoming cashier', 'اختر أمين الصندوق القادم'],
      'Le caissier entrant doit confirmer avec son code personnel': ['The incoming cashier must confirm with their personal code', 'يجب أن يؤكد أمين الصندوق القادم برمزه الشخصي'],
      'Les deux comptes doivent concorder': ['Both counts must match', 'يجب أن يتطابق العدّان'],
      'Passation enregistrée': ['Handover saved', 'تم حفظ التسليم'],
      'Compte le tiroir': ['Count the drawer', 'عُدّ الدرج'],
      'Sélectionne une table': ['Select a table', 'اختر طاولة'],
      'Split déjà encaissé en partie': ['Split already partly paid', 'تم دفع جزء من التقسيم'],
      'termine les parts restantes': ['finish the remaining shares', 'أكمل الحصص المتبقية'],
      'Split annulé': ['Split cancelled', 'تم إلغاء التقسيم'],
      'Écran cuisine désactivé dans la console God Mode': ['Kitchen screen is turned off for this account', 'شاشة المطبخ معطّلة لهذا الحساب'],
      'Les articles et prix se gèrent dans le tableau de bord.': ['Items and prices are managed in the dashboard.', 'تُدار المنتجات والأسعار من لوحة القيادة.'],
      'Ajoutez les articles et prix depuis le tableau de bord.': ['Add items and prices from the dashboard.', 'أضف المنتجات والأسعار من لوحة القيادة.'],
      "Donne un nom à l'article": ['Name the item', 'أعطِ المنتج اسمًا'],
      'Ajoute au moins une quantité': ['Add at least one quantity', 'أضف كمية واحدة على الأقل'],
      'Appareil photo indisponible': ['Camera unavailable', 'الكاميرا غير متاحة'],
      'Photo non jointe': ['Photo not attached', 'لم يتم إرفاق الصورة'],
      'vérifie l’accès à l’appareil': ['check camera access', 'تحقق من إذن الكاميرا'],
      'Indique le fournisseur pour enregistrer la réception': ['Choose the supplier to record the delivery', 'حدّد المورّد لتسجيل الاستلام'],
      'Stock mis à jour': ['Stock updated', 'تم تحديث المخزون'],
      'Sélectionne un article': ['Select an item', 'اختر منتجًا'],
      'Indique une quantité valide': ['Enter a valid quantity', 'أدخل كمية صحيحة'],
      'Perte refusée': ['Waste refused', 'تم رفض الهدر'],
      'la quantité ou le lot a changé': ['the quantity or batch changed', 'تغيّرت الكمية أو الدفعة'],
      'Ticket cuisine non imprimé': ['Kitchen ticket not printed', 'لم تتم طباعة تذكرة المطبخ'],
      'Rien de neuf à envoyer': ['Nothing new to send', 'لا جديد للإرسال'],
      "Ajoute des articles d'abord": ['Add items first', 'أضف منتجات أولًا'],
      'Expirée introuvable': ['Expired order not found', 'الطلب المنتهي غير موجود'],
      'Expirée vide': ['Expired order is empty', 'الطلب المنتهي فارغ'],
      'rien à reprendre': ['nothing to restore', 'لا شيء للاسترجاع'],
      'Impossible de retirer': ['Cannot remove', 'تعذّرت الإزالة'],
      'Commande retirée des expirées': ['Order removed from expired', 'أُزيل الطلب من المنتهية'],
      'Commande déjà réglée ou annulée': ['Order already paid or cancelled', 'الطلب مدفوع أو ملغى بالفعل'],
      'Table introuvable sur le plan': ['Table not found on the floor plan', 'الطاولة غير موجودة في المخطط'],
      'Cette commande appartient à une autre visite': ['This order belongs to another visit', 'هذا الطلب يخص زيارة أخرى'],
      'Addition non disponible': ['Bill not available', 'الحساب غير متاح'],
      'actualisez la commande': ['refresh the order', 'حدّث الطلب'],
      'Commande indisponible pour encaissement': ['Order not available for payment', 'الطلب غير متاح للدفع'],
      'Commande introuvable dans la caisse': ['Order not found on this till', 'الطلب غير موجود في الصندوق'],
      'Impression du bon envoyée': ['Kitchen ticket sent to print', 'تم إرسال تذكرة المطبخ للطباعة'],
      'Commande introuvable pour impression': ['Order not found for printing', 'الطلب غير موجود للطباعة'],
      'Service non restauré': ['Service not restored', 'لم تتم استعادة الخدمة'],
      'il est conservé, préviens le support': ['it is kept, tell support', 'تم الاحتفاظ به، أبلغ الدعم'],
      'Service restauré': ['Service restored', 'تمت استعادة الخدمة'],
      'Numéro de ticket indisponible': ['Ticket number unavailable', 'رقم التذكرة غير متاح'],
      "Échange annulé, rien n'a bougé": ['Exchange cancelled, nothing changed', 'تم إلغاء الاستبدال، لم يتغير شيء'],
      'Numéro attribué': ['Number assigned', 'تم تعيين الرقم'],
      'Numéro de ticket toujours indisponible': ['Ticket number still unavailable', 'رقم التذكرة ما زال غير متاح'],
      'Ticket vidé, articles remis en stock': ['Receipt cleared, items back in stock', 'تم إفراغ التذكرة وإرجاع المنتجات للمخزون'],
      'Récompense retirée du ticket': ['Reward removed from the receipt', 'أُزيلت المكافأة من التذكرة'],
      'Historique des achats': ['Purchase history', 'سجل المشتريات'],
      'Aucun détail d’achat enregistré': ['No purchase details recorded', 'لا توجد تفاصيل شراء مسجّلة'],
      'Les prochains tickets attachés à ce client apparaîtront ici.': ['Future receipts linked to this customer will appear here.', 'ستظهر هنا التذاكر المقبلة المرتبطة بهذا الزبون.'],
      'Avoirs · solde': ['Store credit · balance', 'أرصدة المتجر · الرصيد'],
      'Aucun avoir': ['No store credit', 'لا يوجد رصيد متجر'],
      'Les crédits boutique émis à ce client apparaîtront ici.': ['Store credits issued to this customer will appear here.', 'ستظهر هنا أرصدة المتجر الصادرة لهذا الزبون.'],
      'récompense': ['reward', 'مكافأة'],
      'Date inconnue': ['Unknown date', 'تاريخ غير معروف'],
      'Mode non renseigné': ['Payment method not recorded', 'طريقة الدفع غير مسجّلة'],
      'Ticket d’achat': ['Purchase receipt', 'تذكرة الشراء'],
      'Portefeuille': ['Wallet', 'محفظة'],
      'Retour produit': ['Product return', 'إرجاع منتج'],
      'Article acheté': ['Purchased item', 'المنتج المشترى'],
      'Utilisé': ['Used', 'مستعمل'],
      'Annulé': ['Cancelled', 'ملغى'],
      'expire': ['expires', 'ينتهي في'],
      'sans échéance': ['no expiry date', 'بدون تاريخ انتهاء'],
      'reste': ['remaining', 'المتبقي'],
      'solde': ['balance', 'الرصيد'],
      'Caisse du magasin': ['Store till', 'صندوق المتجر'],
      'Pas encore de récompense pour cette cliente': ['No reward for this customer yet', 'لا توجد مكافأة لهذه الزبونة بعد'],
      'Le nom est requis pour la fiche': ['A name is required for the profile', 'الاسم مطلوب للملف'],
      'Scan produit': ['Product scan', 'مسح المنتج'],
      'Boutique': ['Shop', 'متجر'],
      "Scannez un article pour voir son prix, ses tailles et son stock. Rien n'est ajouté au ticket.": ['Scan an item to see its price, sizes and stock. Nothing is added to the receipt.', 'امسح منتجاً لعرض سعره ومقاساته ومخزونه. لا يُضاف شيء إلى التذكرة.'],
      'Scannez ou tapez un code-barres…': ['Scan or type a barcode…', 'امسح رمزاً شريطياً أو اكتبه…'],
      'Code {code} inconnu, enregistrez-le sur un article': ['Unknown code {code}, register it on an item', 'الرمز {code} غير معروف، سجّله على منتج'],
      'Code {code} inconnu, aucun article ne le porte': ['Unknown code {code}, no item uses it', 'الرمز {code} غير معروف، لا يحمله أي منتج'],
      'Code {code} inconnu, à enregistrer': ['Unknown code {code}, register it', 'الرمز {code} غير معروف، يجب تسجيله'],
      'ou': ['or', 'أو'],
      'Scanner avec la caméra': ['Scan with the camera', 'المسح بالكاميرا'],
      'Scanner un article (douchette démo)': ['Scan an item (demo scanner)', 'مسح منتج (ماسح تجريبي)'],
      'Tester la douchette': ['Test the scanner', 'اختبار الماسح'],
      'Derniers articles vérifiés': ['Recently checked items', 'آخر المنتجات التي تم التحقق منها'],
      'Code inconnu, non référencé': ['Unknown code, not registered', 'رمز غير معروف، غير مسجّل'],
      'Reprise de stock': ['Stock intake', 'إدخال المخزون'],
      "Scannez le code déjà présent sur l'article. Kiwi le garde tel quel · aucune étiquette à réimprimer.": ['Scan the code already on the item. Kiwi keeps it unchanged · no labels to reprint.', 'امسح الرمز الموجود على المنتج. يحتفظ به كيوي كما هو · لا حاجة لإعادة طباعة الملصقات.'],
      'Scannez un article…': ['Scan an item…', 'امسح منتجًا…'],
      'Valider le code saisi': ['Validate the entered code', 'التحقق من الرمز المدخل'],
      'Douchette prête. Pas de douchette ? Tapez le code puis Entrée.': ['Scanner ready. No scanner? Type the code, then press Enter.', 'الماسح جاهز. لا يوجد ماسح؟ اكتب الرمز ثم اضغط إدخال.'],
      'La douchette ne répond pas ?': ['Scanner not responding?', 'الماسح لا يستجيب؟'],
      'Terminer la reprise': ['Finish stock intake', 'إنهاء إدخال المخزون'],
      'Rien encore. La douchette écrit directement dans le champ ci-dessus · pas besoin de cliquer.': ['Nothing yet. The scanner enters the code directly in the field above · no need to click.', 'لا شيء بعد. يُدخل الماسح الرمز مباشرة في الحقل أعلاه · لا حاجة إلى النقر.'],
      'Tapez ou scannez un code.': ['Type or scan a code.', 'اكتب رمزًا أو امسحه.'],
      "Rien n'a été lu. Rapprochez la douchette de l'étiquette, ou tapez le code.": ['Nothing was read. Move the scanner closer to the label, or type the code.', 'لم يُقرأ شيء. قرّب الماسح من الملصق أو اكتب الرمز.'],
      'Lecture incomplète · la douchette a envoyé des caractères parasites. Rescannez, ou tapez le code à la main.': ['Incomplete scan · the scanner sent stray characters. Scan again, or type the code manually.', 'مسح غير مكتمل · أرسل الماسح أحرفًا غير مرغوبة. أعد المسح أو اكتب الرمز يدويًا.'],
      'Lecture partielle : trop peu de caractères pour être un code-barres. Rescannez plus lentement, ou tapez-le.': ['Partial scan: too few characters for a barcode. Scan again more slowly, or type it.', 'مسح جزئي: عدد الأحرف غير كافٍ لرمز شريطي. أعد المسح ببطء أكبر أو اكتبه.'],
      "Ce code est anormalement long. Vérifiez qu'un seul article est passé devant la douchette.": ['This code is unusually long. Check that only one item passed in front of the scanner.', 'هذا الرمز طويل بشكل غير معتاد. تأكد من مرور منتج واحد فقط أمام الماسح.'],
      'Code illisible, rescannez.': ['Unreadable code, scan again.', 'رمز غير مقروء، أعد المسح.'],
      'Lecture refusée · vide': ['Scan rejected · empty code', 'تم رفض المسح · الرمز فارغ'],
      'Lecture refusée · illisible': ['Scan rejected · unreadable code', 'تم رفض المسح · الرمز غير مقروء'],
      'Lecture refusée · trop-court': ['Scan rejected · code too short', 'تم رفض المسح · الرمز قصير جدًا'],
      'Lecture refusée · trop-long': ['Scan rejected · code too long', 'تم رفض المسح · الرمز طويل جدًا'],
      "Aucun article vérifié pour l'instant, la douchette USB tape ici toute seule.": ['No items checked yet. The USB scanner enters the code here automatically.', 'لم يتم التحقق من أي منتج بعد. يُدخل الماسح USB الرمز هنا تلقائياً.'],
      'Ce navigateur ne sait pas lire un code-barres par la caméra. La douchette USB fonctionne, elle tape directement dans le champ ci-dessus.': ['This browser cannot scan barcodes with the camera. The USB scanner works and enters the code in the field above.', 'لا يدعم هذا المتصفح مسح الرموز الشريطية بالكاميرا. يعمل الماسح USB ويُدخل الرمز مباشرة في الحقل أعلاه.'],
      'Lecture caméra indisponible sur ce navigateur, utilisez la douchette ou tapez le code': ['Camera scanning is not available here, use the scanner or type the code', 'المسح بالكاميرا غير متاح هنا، استخدم الماسح أو اكتب الرمز'],
      'Caméra indisponible dans l’application : utilisez la douchette USB ou tapez le code ci-dessus.': ['Camera is not available in this app: use the USB scanner or type the code above.', 'الكاميرا غير متاحة في هذا التطبيق: استخدم الماسح USB أو اكتب الرمز أعلاه.'],
      'Liste supprimée': ['List deleted', 'تم حذف القائمة'],
      'Indiquez le titre et les bénéficiaires': ['Enter the title and recipients', 'أدخل العنوان والمستفيدين'],
      'Liste créée': ['List created', 'تم إنشاء القائمة'],
      'Article ajouté à la liste': ['Item added to the list', 'أُضيف المنتج إلى القائمة'],
      'Commande marquée envoyée': ['Order marked as sent', 'تم وسم الطلب كمُرسل'],
      'Le nom est requis': ['A name is required', 'الاسم مطلوب'],
      'Fournisseur enregistré': ['Supplier saved', 'تم حفظ المورّد'],
      'Opération refusée': ['Operation refused', 'تم رفض العملية'],
      'Fournisseur et article requis': ['Supplier and item required', 'المورّد والمنتج مطلوبان'],
      'Article introuvable': ['Item not found', 'المنتج غير موجود'],
      'Casse enregistrée': ['Breakage recorded', 'تم تسجيل الكسر'],
      'Livraison retirée du ticket': ['Delivery removed from the receipt', 'أُزيل التوصيل من التذكرة'],
      'Le nom du destinataire est requis': ['Recipient name is required', 'اسم المستلم مطلوب'],
      'Livraison enregistrée': ['Delivery saved', 'تم حفظ التوصيل'],
      'Bon de livraison prêt à imprimer': ['Delivery note ready to print', 'إيصال التوصيل جاهز للطباعة'],
      'Impression bloquée par le navigateur': ['Printing blocked by the browser', 'المتصفح منع الطباعة'],
      'Pièce déjà retournée, rien à reprendre dessus': ['Item already returned, nothing left to take back', 'تم إرجاع القطعة بالفعل، لا شيء للاسترجاع'],
      'Remboursement original indisponible pour la catégorie B': ['Original refund not available for category B', 'الاسترداد الأصلي غير متاح للفئة B'],
      'Remboursement suspendu': ['Refund on hold', 'الاسترداد معلّق'],
      'Autorisation responsable indisponible': ['Manager approval unavailable', 'موافقة المسؤول غير متاحة'],
      'Remboursement enregistré': ['Refund recorded', 'تم تسجيل الاسترداد'],
      'Remboursement non effectué': ['Refund not made', 'لم يتم الاسترداد'],
      'Retour suspendu : cette vente a plusieurs reçus d’acompte. Contacter le responsable.': ['Return on hold: this sale has several deposit receipts. Contact the manager.', 'الإرجاع معلّق: لهذا البيع عدة إيصالات عربون. اتصل بالمسؤول.'],
      "L'échange se fait pièce par pièce, gardez une seule ligne cochée": ['Exchanges go one item at a time, keep one line ticked', 'يتم الاستبدال قطعة بقطعة، اترك سطرًا واحدًا محددًا'],
      'Retour suspendu sur un acompte': ['Return on hold for a deposit', 'الإرجاع معلّق على عربون'],
      "L'échange se fait une pièce à la fois, choisissez la quantité 1": ['Exchanges go one item at a time, choose quantity 1', 'يتم الاستبدال قطعة واحدة في كل مرة، اختر الكمية 1'],
      'Avoir non émis': ['Credit note not issued', 'لم يتم إصدار سند الرصيد'],
      'Impression indisponible': ['Printing unavailable', 'الطباعة غير متاحة'],
      'Article de remplacement introuvable': ['Replacement item not found', 'منتج الاستبدال غير موجود'],
      'Échange non appliqué (rupture entre-temps)': ['Exchange not applied (out of stock meanwhile)', 'لم يُطبق الاستبدال (نفد المخزون في الأثناء)'],
      'Avoir émis, échange à régulariser': ['Credit note issued, exchange to settle', 'تم إصدار سند الرصيد، الاستبدال بانتظار التسوية'],
      'Impression du ticket cadeau…': ['Printing gift receipt…', 'جارٍ طباعة تذكرة الهدية…'],
      'Échec impression ticket cadeau :': ['Gift receipt failed to print:', 'فشلت طباعة تذكرة الهدية:'],
      'Ticket cadeau affiché': ['Gift receipt shown', 'تم عرض تذكرة الهدية'],
      'Imprimante thermique injoignable': ['Thermal printer unreachable', 'تعذّر الوصول إلى الطابعة الحرارية'],
      'Aucune imprimante connectée': ['No printer connected', 'لا توجد طابعة متصلة'],
      'Impression échouée :': ['Printing failed:', 'فشلت الطباعة:'],
      'Vente suspendue': ['Sale on hold', 'البيع معلّق'],
      'Acompte : cliente requise, hors articles en dépôt-vente': ['Deposit: customer required, consignment items excluded', 'العربون: الزبونة مطلوبة، باستثناء منتجات الإيداع'],
      'Acompte non conservé : stockage local indisponible': ['Deposit not saved: local storage unavailable', 'لم يُحفظ العربون: التخزين المحلي غير متاح'],
      'Synchronisation de l’acompte en attente': ['Deposit sync pending', 'مزامنة العربون معلّقة'],
      'Cette note est déjà réglée': ['This bill is already settled', 'هذا الحساب مسدّد بالفعل'],
      'Règlement non conservé : stockage local indisponible': ['Payment not saved: local storage unavailable', 'لم يُحفظ الدفع: التخزين المحلي غير متاح'],
      'Paiement commencé': ['Payment started', 'بدأ الدفع'],
      'Aucun avoir actif, émettez-en un depuis Échanges & avoirs': ['No active credit note, issue one from Exchanges & credit notes', 'لا يوجد سند رصيد نشط، أصدر واحدًا من الاستبدال والأرصدة'],
      'Bon indisponible': ['Voucher unavailable', 'القسيمة غير متاحة'],
      'Acompte : une cliente et un seul règlement sont requis': ['Deposit: one customer and one payment are required', 'العربون: مطلوب زبونة واحدة ودفعة واحدة'],
      'Avoir refusé par le registre': ['Credit note refused by the ledger', 'رفض السجل سند الرصيد'],
      'Cliente de passage, pas de numéro WhatsApp sur le ticket': ['Walk-in customer, no WhatsApp number on the receipt', 'زبونة عابرة، لا يوجد رقم WhatsApp في التذكرة'],
      "Impossible d'ouvrir WhatsApp": ['Cannot open WhatsApp', 'تعذّر فتح WhatsApp'],
      'Diagnostic copié': ['Diagnostics copied', 'تم نسخ التشخيص'],
      'Copie impossible sur cet appareil': ['Cannot copy on this device', 'النسخ غير ممكن على هذا الجهاز'],
      "Base d'inventaire indisponible": ['Inventory unavailable', 'قاعدة المخزون غير متاحة'],
      'Choisissez la catégorie A ou B': ['Choose category A or B', 'اختر الفئة A أو B'],
      'Article créé': ['Item created', 'تم إنشاء المنتج'],
      'Déplacez d’abord les articles de cette catégorie': ['Move this category’s items first', 'انقل منتجات هذه الفئة أولًا'],
      'Produit mis à jour': ['Product updated', 'تم تحديث المنتج'],
      'Produit supprimé': ['Product deleted', 'تم حذف المنتج'],
      'Variante supprimée': ['Variant deleted', 'تم حذف المتغير'],
      'Couleur mise à jour': ['Colour updated', 'تم تحديث اللون'],
      'Variante ajoutée': ['Variant added', 'تمت إضافة المتغير'],
      'Code vide': ['Empty code', 'الرمز فارغ'],
      "Choisissez une variante (ajoutez-en une d'abord)": ['Choose a variant (add one first)', 'اختر متغيرًا (أضف واحدًا أولًا)'],
      'Reprise terminée': ['Import finished', 'انتهى الاستيراد'],
      "Scan incomplet, rien n'a été enregistré": ['Incomplete scan, nothing was saved', 'مسح غير مكتمل، لم يُحفظ شيء'],
      'Le nom du produit est requis': ['Product name is required', 'اسم المنتج مطلوب'],
      'Déclinaison impossible': ['Cannot create variant', 'تعذّر إنشاء المتغير'],
      'Code refusé': ['Code refused', 'تم رفض الرمز'],
      'Fiche corrigée': ['Profile corrected', 'تم تصحيح الملف'],
      'Aucun résultat pour « {query} »': ['No results for « {query} »', 'لا توجد نتائج عن « {query} »'],
      'Nouveau client · « {query} »': ['New customer · « {query} »', 'عميل جديد · « {query} »'],
      'Aucune fiche pour « {query} »': ['No customer for « {query} »', 'لا يوجد عميل باسم « {query} »'],
      'Nouvelle cliente · « {query} »': ['New customer · « {query} »', 'عميلة جديدة · « {query} »'],
      'Cliente': ['Customer', 'العميلة'],
      'Vendus': ['Sales', 'المبيعات'],
      'Acomptes': ['Deposits', 'العربون'],
      // Secondary drawer screens: translate interface copy, never record names.
      'PAIEMENTS ÉCHELONNÉS': ['INSTALMENT PAYMENTS', 'دفعات على أقساط'],
      'Retrouvez une note ouverte et encaissez son solde. Chaque paiement compte le jour où il est reçu.': ['Find an open bill and collect its balance. Each payment counts on the day it is received.', 'ابحث عن فاتورة مفتوحة وحصّل رصيدها. يُحتسب كل دفع في يوم استلامه.'],
      'Cliente ou numéro de ticket': ['Customer or receipt number', 'العميلة أو رقم الإيصال'],
      'Chercher une cliente ou un ticket': ['Search for a customer or receipt', 'ابحث عن عميلة أو إيصال'],
      'Chercher une cliente ou un ticket…': ['Search for a customer or receipt…', 'ابحث عن عميلة أو إيصال…'],
      'Aucune note ouverte pour cette recherche.': ['No open bills for this search.', 'لا توجد فواتير مفتوحة لهذا البحث.'],
      'Reste {n} MAD': ['Remaining {n} MAD', 'المتبقي {n} MAD'],
      'Synchronisation en attente': ['Sync pending', 'المزامنة معلّقة'],
      'Stock vendu, catégories et détail des tickets': ['Sold stock, categories and receipt details', 'المخزون المباع والفئات وتفاصيل الإيصالات'],
      'Dates': ['Dates', 'التواريخ'],
      'Jour exact': ['Exact day', 'يوم محدد'],
      'Période': ['Period', 'الفترة'],
      'Du': ['From', 'من'],
      'Au': ['To', 'إلى'],
      'Appliquer': ['Apply', 'تطبيق'],
      'Choisissez la date.': ['Choose the date.', 'اختر التاريخ.'],
      'La fin doit venir après le début.': ['The end must come after the start.', 'يجب أن تأتي النهاية بعد البداية.'],
      'La période ne peut pas finir dans le futur.': ['The period cannot end in the future.', 'لا يمكن أن تنتهي الفترة في المستقبل.'],
      'Pièces vendues': ['Units sold', 'القطع المباعة'],
      'Produits actifs': ['Active products', 'المنتجات النشطة'],
      'Tickets analysés': ['Receipts analysed', 'الإيصالات المحللة'],
      'Chiffre produits': ['Product revenue', 'إيرادات المنتجات'],
      'Aucune vente détaillée aujourd’hui': ['No detailed sales today', 'لا توجد مبيعات مفصّلة اليوم'],
      'Aucune vente détaillée sur la période choisie': ['No detailed sales in the selected period', 'لا توجد مبيعات مفصّلة في الفترة المختارة'],
      'dernière vente': ['latest sale', 'آخر بيع'],
      'en stock': ['in stock', 'في المخزون'],
      'synchronisation…': ['syncing…', 'جارٍ المزامنة…'],
      'Aucune vente détaillée sur les {n} derniers jours': ['No detailed sales in the last {n} days', 'لا توجد مبيعات مفصّلة خلال آخر {n} أيام'],
      'Dès qu’un ticket est encaissé à la caisse avec ses produits, il apparaît ici : quantités, catégories, paniers associés et recommandations.': ['Once a receipt with its products is paid at the till, it appears here: quantities, categories, associated baskets and recommendations.', 'عند دفع إيصال بمنتجاته في الصندوق، يظهر هنا: الكميات والفئات والسلات المرتبطة والتوصيات.'],
      'Produits': ['Products', 'المنتجات'],
      'Catégories': ['Categories', 'الفئات'],
      'Produits vendus ensemble': ['Products sold together', 'منتجات بيعت معًا'],
      'Quantité, chiffre et dernière vente': ['Quantity, revenue and latest sale', 'الكمية والإيرادات وآخر بيع'],
      'Associations constatées sur les tickets': ['Combinations observed on receipts', 'توليفات لوحظت في الإيصالات'],
      'Contribution par rayon': ['Contribution by category', 'مساهمة كل فئة'],
      'Historique détaillé': ['Detailed history', 'السجل المفصّل'],
      'Quand et dans quel panier chaque produit a été vendu': ['When and in which basket each product was sold', 'متى وفي أي سلة بيع كل منتج'],
      'Même ticket': ['Same receipt', 'نفس الإيصال'],
      'Aucune association répétée pour l’instant.': ['No repeated combinations yet.', 'لا توجد توليفات متكررة بعد.'],
      'pce': ['unit', 'قطعة'],
      'pces': ['units', 'قطع'],
      'pièce': ['unit', 'قطعة'],
      'pièces': ['units', 'قطع'],
      'fois': ['times', 'مرات'],
      'Imprimantes': ['Printers', 'الطابعات'],
      'Caisse (comptoir)': ['Till (counter)', 'الصندوق (الكاونتر)'],
      'Reçus clients': ['Customer receipts', 'إيصالات العملاء'],
      '· Imprimante par défaut (actuelle) ·': ['· Default printer (current) ·', '· الطابعة الافتراضية (الحالية) ·'],
      '· Même imprimante que la caisse ·': ['· Same printer as the till ·', '· نفس طابعة الصندوق ·'],
      'Imprimante de la caisse': ['Till printer', 'طابعة الصندوق'],
      'Ticket test': ['Test receipt', 'إيصال تجريبي'],
      'Tester le tiroir': ['Test the drawer', 'اختبار الدرج'],
      'Production': ['Production', 'الإنتاج'],
      'Cet appareil n’est pas reconnu comme la caisse d’un commerce · appairez-le d’abord.': ['This device is not recognised as a merchant’s till · pair it first.', 'لم يُتعرّف على هذا الجهاز كصندوق متجر · أقرنه أولًا.'],
      'Relais pas encore activé côté serveur.': ['Relay not yet enabled on the server.', 'الوسيط غير مفعّل على الخادم بعد.'],
      'Aucun pont associé à ce commerce.': ['No bridge paired with this merchant.', 'لا يوجد جسر مقترن بهذا المتجر.'],
      'Pont associé mais hors ligne · lancez Kiwi Printer Bridge sur l’ordinateur du comptoir.': ['Bridge paired but offline · start Kiwi Printer Bridge on the counter computer.', 'الجسر مقترن لكنه غير متصل · شغّل Kiwi Printer Bridge على حاسوب الكاونتر.'],
      'Configurer les imprimantes': ['Configure printers', 'إعداد الطابعات'],
      'Avoir {n} MAD': ['Store credit {n} MAD', 'رصيد متجر {n} MAD'],
      'Montant…': ['Amount…', 'المبلغ…'],
      'Montant de cette part': ['Amount for this share', 'مبلغ هذه الحصة'],
      'Partager le paiement': ['Split the payment', 'تقسيم الدفع'],
      'Part sur {n} MAD': ['Share of {n} MAD', 'حصة من {n} MAD'],
      'Cette part : {n} MAD': ['This share: {n} MAD', 'هذه الحصة: {n} MAD'],
      'restera {n} MAD': ['{n} MAD remaining', 'سيتبقى {n} MAD'],
      'Rendu calculé, flous comptés une fois': ['Change calculated, cash counted once', 'الباقي محسوب، ويُعدّ النقد مرة واحدة'],
      'Lecteur partenaire, V1 sans encaissement Kiwi': ['Partner reader, V1 does not take payment through Kiwi', 'قارئ شريك، الإصدار الأول لا يُحصّل الدفع عبر كيوي'],
      'Virement / Versement': ['Bank transfer / Deposit', 'تحويل / إيداع بنكي'],
      'Confirmer uniquement après réception en banque': ['Confirm only after the bank receives the funds', 'أكّد فقط بعد وصول الأموال إلى البنك'],
      'Chèque': ['Cheque', 'شيك'],
      'Confirmer après réception du chèque': ['Confirm after receiving the cheque', 'أكّد بعد استلام الشيك'],
      'Vente enregistrée, paiement à recevoir du transporteur': ['Sale recorded, payment to collect from the carrier', 'البيع مسجّل، والدفع سيُحصّل من شركة التوصيل'],
      'Code d’avoir': ['Credit-note code', 'رمز سند الرصيد'],
      'Scanner ou saisir le code du bon': ['Scan or enter the credit-note code', 'امسح رمز سند الرصيد أو أدخله'],
      'Avoir en paiement': ['Pay with credit note', 'الدفع بسند الرصيد'],
      'Scannez le bon, ou choisissez-le, il se déduit du total': ['Scan or choose the credit note; it is deducted from the total', 'امسح سند الرصيد أو اختره ليُخصم من المجموع'],
      'Scanner ou saisir AV-…': ['Scan or enter AV-…', 'امسح AV-… أو أدخله'],
      'Code de l’avoir': ['Credit-note code', 'رمز سند الرصيد'],
      'Utiliser': ['Use', 'استخدام'],
      'Ajout rapide': ['Quick add', 'إضافة سريعة'],
      'Kiwi affiche, le lecteur encaisse': ['Kiwi displays the amount; the reader takes payment', 'كيوي يعرض المبلغ، والقارئ يُحصّل الدفع'],
      'Montant envoyé au lecteur': ['Amount sent to the reader', 'أُرسل المبلغ إلى القارئ'],
      "Confirmez l'encaissement sur le lecteur": ['Confirm payment on the reader', 'أكّد الدفع على القارئ'],
      'Encaissement confirmé sur le lecteur': ['Payment confirmed on the reader', 'تم تأكيد الدفع على القارئ'],
      'Paiement refusé · annuler': ['Payment declined · cancel', 'تم رفض الدفع · إلغاء'],
      'Les fonds sont-ils visibles sur le compte bancaire ? Aucun montant ne sera attendu dans le tiroir.': ['Are the funds visible in the bank account? No cash is expected in the drawer.', 'هل تظهر الأموال في الحساب البنكي؟ لا يُنتظر أي نقد في الدرج.'],
      'Le chèque a-t-il été remis au comptoir ? Aucun montant ne sera attendu dans le tiroir.': ['Has the cheque been handed over at the counter? No cash is expected in the drawer.', 'هل تم تسليم الشيك عند الكاونتر؟ لا يُنتظر أي نقد في الدرج.'],
      'Chèque reçu': ['Cheque received', 'تم استلام الشيك'],
      'Versement reçu': ['Deposit received', 'تم استلام الإيداع'],
      'confirmer': ['confirm', 'تأكيد'],
      'pièce en stock': ['item in stock', 'قطعة في المخزون'],
      'pièces en stock': ['items in stock', 'قطع في المخزون'],
      'vérifié': ['checked', 'تم التحقق'],
      'Connecter une imprimante': ['Connect a printer', 'توصيل طابعة'],
      'Douchette + imprimante étiquettes': ['Scanner + label printer', 'ماسح + طابعة ملصقات'],
      'base partagée avec le dashboard': ['shared catalog with the dashboard', 'كتالوج مشترك مع لوحة التحكم'],
      'Scannez un article, ou tapez un code…': ['Scan an item, or type a code…', 'امسح منتجًا أو اكتب رمزًا…'],
      'Articles et prix se gèrent dans le tableau de bord': ['Manage items and prices in the dashboard', 'تُدار المنتجات والأسعار في لوحة التحكم'],
      'Articles et prix se gèrent dans le tableau de bord.': ['Manage items and prices in the dashboard.', 'تُدار المنتجات والأسعار في لوحة التحكم.'],
      "Base d'inventaire indisponible.": ['Inventory unavailable.', 'قاعدة المخزون غير متاحة.'],
      'Valeur de stock': ['Stock value', 'قيمة المخزون'],
      'Pièces en stock': ['Units in stock', 'القطع في المخزون'],
      'Stock bas / rupture': ['Low stock / out of stock', 'مخزون منخفض / نفاد المخزون'],
      'couleur': ['colour', 'لون'],
      'couleurs': ['colours', 'ألوان'],
      'taille': ['size', 'مقاس'],
      'tailles': ['sizes', 'مقاسات'],
      'codes-barres': ['barcodes', 'رموز شريطية'],
      'Votre stock porte déjà des codes-barres ?': ['Does your stock already have barcodes?', 'هل تحمل منتجات مخزونك رموزًا شريطية بالفعل؟'],
      'Touchez « Reprendre le stock » et scannez vos articles un par un : Kiwi garde le code du fournisseur tel quel. Aucune étiquette à réimprimer.': ['Tap “Enter stock” and scan your items one by one: Kiwi keeps the supplier’s code unchanged. No labels to reprint.', 'اضغط على «إدخال المخزون» وامسح منتجاتك واحدًا تلو الآخر: يحتفظ كيوي برمز المورد كما هو. لا حاجة لإعادة طباعة الملصقات.'],
      'Pour créer un article ou modifier un prix, ouvrez le tableau de bord. Ici, vous pouvez reprendre le stock et les codes existants.': ['To create an item or change a price, open the dashboard. Here you can enter stock and existing codes.', 'لإنشاء منتج أو تعديل سعر، افتح لوحة التحكم. يمكنك هنا إدخال المخزون والرموز الموجودة.'],
      'Aucune variante, ajoutez une couleur × taille.': ['No variants; add a colour × size.', 'لا توجد متغيرات؛ أضف لونًا × مقاسًا.'],
      'Modifier dans le tableau de bord': ['Edit in the dashboard', 'التعديل في لوحة التحكم'],
      'Variantes dans le tableau de bord': ['Variants in the dashboard', 'المتغيرات في لوحة التحكم'],
      'Suppression dans le tableau de bord': ['Deletion in the dashboard', 'الحذف في لوحة التحكم'],
      'Supprimer dans le tableau de bord': ['Delete in the dashboard', 'الحذف من لوحة التحكم'],
      'Mouvements de stock': ['Stock movements', 'حركات المخزون'],
      'Stock': ['Stock', 'المخزون'],
      'Code-barres': ['Barcode', 'الرمز الشريطي'],
      'Imprimer toutes les étiquettes': ['Print all labels', 'طباعة جميع الملصقات'],
      "Imprimer l'étiquette": ['Print label', 'طباعة الملصق'],
      'Générer un EAN-13': ['Generate an EAN-13', 'إنشاء EAN-13'],
      'Enregistrer un code existant': ['Register an existing code', 'تسجيل رمز موجود'],
      'aucun code': ['no code', 'لا يوجد رمز'],
      'importé': ['imported', 'مستورد'],
      'généré': ['generated', 'مُنشأ'],
      'Connectez l’imprimante en Bluetooth ou en USB pour imprimer sans boîte de dialogue. Si elle est déjà installée sur cette caisse, Kiwi peut aussi l’utiliser via la boîte d’impression du système.': ['Connect the printer by Bluetooth or USB to print without a dialog. If it is already installed on this till, Kiwi can also use the system print dialog.', 'وصّل الطابعة عبر Bluetooth أو USB للطباعة دون نافذة حوار. إذا كانت مثبّتة بالفعل على هذا الصندوق، يمكن لكيوي أيضًا استخدامها عبر نافذة الطباعة في النظام.'],
      'Imprimante Bluetooth': ['Bluetooth printer', 'طابعة Bluetooth'],
      'Sans installation. Kiwi imprime le reçu directement.': ['No installation. Kiwi prints the receipt directly.', 'لا يلزم تثبيت. يطبع كيوي الإيصال مباشرة.'],
      'Aucune imprimante connectée.': ['No printer connected.', 'لا توجد طابعة متصلة.'],
      'Rechercher une imprimante Bluetooth': ['Find a Bluetooth printer', 'البحث عن طابعة Bluetooth'],
      'Changer d’imprimante': ['Change printer', 'تغيير الطابعة'],
      'Imprimer un ticket test': ['Print a test receipt', 'طباعة إيصال تجريبي'],
      'Imprimante USB': ['USB printer', 'طابعة USB'],
      'Branchée en USB sur la caisse. Sans installation, sans adresse IP.': ['Connected to the till by USB. No installation or IP address.', 'متصلة بالصندوق عبر USB. لا يلزم تثبيت أو عنوان IP.'],
      'Aucune imprimante USB connectée.': ['No USB printer connected.', 'لا توجد طابعة USB متصلة.'],
      'Choisir l’imprimante USB': ['Choose the USB printer', 'اختيار طابعة USB'],
      'Tickets de production automatiques': ['Automatic production tickets', 'تذاكر الإنتاج التلقائية'],
      'Ce poste peut imprimer les commandes envoyées depuis la caisse, l’app employé et les autres terminaux. Activez cette option sur un seul ordinateur par établissement.': ['This station can print orders sent from the till, the employee app and other terminals. Enable this option on only one computer per venue.', 'يمكن لهذه المحطة طباعة الطلبات المرسلة من الصندوق وتطبيق الموظفين والأجهزة الأخرى. فعّل هذا الخيار على حاسوب واحد فقط لكل منشأة.'],
      'Faire de ce poste le hub d’impression': ['Use this station as the print hub', 'استخدام هذه المحطة كمركز للطباعة'],
      'Les commandes de ce poste continuent à s’imprimer localement.': ['Orders from this station continue to print locally.', 'تستمر طباعة طلبات هذه المحطة محليًا.'],
      'Prêt · aucune impression en attente': ['Ready · no prints pending', 'جاهز · لا توجد طباعة معلّقة'],
      'Hub actif · connectez une imprimante': ['Print hub active · connect a printer', 'مركز الطباعة مفعّل · وصّل طابعة'],
      'Aucune imprimante additionnelle enregistrée. Ajoutez-en une pour router par poste.': ['No additional printer saved. Add one to route printing by station.', 'لا توجد طابعة إضافية محفوظة. أضف طابعة لتوجيه الطباعة حسب المحطة.'],
      'Imprimantes par poste': ['Printers by station', 'الطابعات حسب المحطة'],
      'Associez chaque poste (caisse, cuisine, bar…) à son imprimante physique.': ['Assign each station (till, kitchen, bar…) to its physical printer.', 'اربط كل محطة (الصندوق، المطبخ، البار…) بطابعتها الفعلية.'],
      '+ Nouvelle imprimante': ['+ New printer', '+ طابعة جديدة'],
      'Enregistrer le routage par poste': ['Save station routing', 'حفظ توجيه الطباعة حسب المحطة'],
      'Imprimer depuis un iPad ou une tablette · relais Kiwi': ['Print from an iPad or tablet · Kiwi relay', 'الطباعة من iPad أو جهاز لوحي · وسيط كيوي'],
      'Sans pont sur cet appareil, Kiwi envoie les tickets au pont de l’ordinateur du comptoir, qui les imprime sur votre imprimante réseau. Une association suffit, puis tout est automatique.': ['Without a bridge on this device, Kiwi sends receipts to the counter computer’s bridge to print on your network printer. Pair once, then printing is automatic.', 'عند عدم وجود جسر على هذا الجهاز، يرسل كيوي الإيصالات إلى جسر حاسوب الكاونتر لطباعتها على طابعة الشبكة. يكفي الإقران مرة واحدة، ثم تصبح الطباعة تلقائية.'],
      'Vérification du relais…': ['Checking the relay…', 'جارٍ التحقق من الوسيط…'],
      'Associer un pont': ['Pair a bridge', 'إقران جسر'],
      'Option avancée · imprimante réseau globale (Wi-Fi / Ethernet)': ['Advanced option · shared network printer (Wi-Fi / Ethernet)', 'خيار متقدم · طابعة شبكة مشتركة (Wi-Fi / Ethernet)'],
      'Impression directe disponible dans l’app Kiwi.': ['Direct printing is available in the Kiwi app.', 'الطباعة المباشرة متاحة في تطبيق كيوي.'],
      'Connexion directe à l’imprimante depuis l’app Kiwi.': ['Direct connection to the printer from the Kiwi app.', 'اتصال مباشر بالطابعة من تطبيق كيوي.'],
      'Aucune cible réseau enregistrée.': ['No network target saved.', 'لا توجد وجهة شبكة محفوظة.'],
      'Adresse IP de l’imprimante': ['Printer IP address', 'عنوان IP للطابعة'],
      'Rechercher sur le réseau': ['Search the network', 'البحث في الشبكة'],
      'Exporter le diagnostic d’impression': ['Export printing diagnostics', 'تصدير تشخيص الطباعة'],
      'Port': ['Network port', 'منفذ الشبكة'],
      'Largeur papier': ['Paper width', 'عرض الورق'],
      "Format d'étiquette": ['Label format', 'تنسيق الملصق'],
      'Largeur papier: {value}': ['Paper width: {value}', 'عرض الورق: {value}'],
      "Format d'étiquette: {value}": ['Label format: {value}', 'تنسيق الملصق: {value}'],
      'Modèle': ['Model', 'الطراز'],
      'Tester': ['Test', 'اختبار'],
      '80 mm (standard)': ['80 mm (standard)', '80 مم (قياسي)'],
      'Le pont tourne sur l’ordinateur de la caisse et ne communique qu’avec votre imprimante locale.': ['The bridge runs on the till computer and communicates only with your local printer.', 'يعمل الجسر على حاسوب الصندوق ولا يتواصل إلا مع طابعتك المحلية.'],
      'Télécharger le pont': ['Download the bridge', 'تنزيل الجسر'],
      'Notes internes': ['Internal notes', 'ملاحظات داخلية'],
      'Informations utiles à l’équipe…': ['Useful information for the team…', 'معلومات مفيدة للفريق…'],
      'Communication': ['Contact preferences', 'تفضيلات التواصل'],
      'Changer de compte': ['Change account', 'تغيير الحساب'],
      'Bonjour,': ['Hello,', 'مرحباً،'],
      "CODE D'ACCÈS · 4 CHIFFRES": ['ACCESS CODE · 4 DIGITS', 'رمز الدخول · 4 أرقام'],
      'CODE PERSONNEL · 4 CHIFFRES': ['PERSONAL CODE · 4 DIGITS', 'الرمز الشخصي · 4 أرقام'],
      'Code personnel géré depuis votre tableau de bord Kiwi': ['Personal code managed from your Kiwi dashboard', 'يُدار الرمز الشخصي من لوحة التحكم في كيوي'],
      'Code personnel': ['Personal code', 'الرمز الشخصي'],
      'Terminal verrouillé': ['Terminal locked', 'تم قفل الجهاز'],
      'CODE D’ACCÈS · 4 CHIFFRES': ['ACCESS CODE · 4 DIGITS', 'رمز الدخول · 4 أرقام'],
      'CODE D’APPAIRAGE · 6 CHIFFRES': ['PAIRING CODE · 6 DIGITS', 'رمز الإقران · 6 أرقام'],
      'taille {x}': ['size {x}', 'المقاس {x}'],
      'un avoir actif': ['active store credit', 'رصيد متجر نشط'],
      'Rechercher par nom ou par numéro de téléphone.': ['Search by name or phone number.', 'ابحث بالاسم أو رقم الهاتف.'],
      'Nom ou 06…': ['Name or phone…', 'الاسم أو الهاتف…'],
      'Nouvelle cliente': ['New customer', 'عميلة جديدة'],
      'Cliente de passage, sans fiche': ['Guest customer, no profile', 'عميلة زائرة، بدون ملف'],
      'Nom et prénom': ['Full name', 'الاسم الكامل'],
      'Téléphone (optionnel)': ['Phone (optional)', 'الهاتف (اختياري)'],
      '06… / +212… (optionnel)': ['06… / +212… (optional)', '06… / +212… (اختياري)'],
      'Créer la fiche': ['Create profile', 'إنشاء الملف'],
      'Le nom est requis pour la fiche': ['Enter a name for the profile', 'أدخل اسمًا للملف'],
      "Générez d'abord un EAN-13": ['Generate an EAN-13 first', 'أنشئ رمز EAN-13 أولًا'],
      'Aucune unité en stock avec un code-barres à imprimer': ['No unit in stock with a barcode to print', 'لا توجد وحدة في المخزون برمز شريطي للطباعة'],
      'Terminez la fenêtre ouverte avant de scanner': ['Finish the open window before scanning', 'أنهِ النافذة المفتوحة قبل المسح'],
      'Retour enregistré, stock à rapprocher': ['Return saved, stock to reconcile', 'تم حفظ الإرجاع، المخزون بانتظار المطابقة'],
      'Échange enregistré, retour à rapprocher': ['Exchange saved, return to reconcile', 'تم حفظ الاستبدال، الإرجاع بانتظار المطابقة'],
      'Échange suspendu': ['Exchange on hold', 'الاستبدال معلّق'],
      'Attachez une cliente avant de prendre un acompte': ['Attach a customer before taking a deposit', 'أرفق زبونة قبل أخذ العربون'],
      'Nom requis': ['Name required', 'الاسم مطلوب'],
      'Scannez le code existant, ou choisissez « Générer » / « Plus tard »': ['Scan the existing code, or choose “Generate” / “Later”', 'امسح الرمز الحالي، أو اختر «إنشاء» / «لاحقًا»'],
    };
    Object.keys(T).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = T[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = T[k][1];
    });
  })();

  /* ───────────────────────── les dates ─────────────────────────
     Une date n'est pas une phrase, c'est un GABARIT À JETONS : « jeu. 30 juil. »
     n'apparaîtra jamais deux fois de suite, aucune clé fixe ne peut l'attraper,
     et il y en a 366 par an. On traduit donc les jetons — le jour, le mois —
     et on laisse le nombre à sa place.

     Les mois sont ceux du Maroc (يوليوز, غشت, شتنبر…), pas ceux du Levant : une
     caissière de Casablanca ne lit pas « تموز ». Et ces jetons vivent à part du
     dictionnaire : « mai » est aussi un mot, et une robe appelée « Mai » ne doit
     pas devenir un mois parce qu'elle passe dans le même balayage. */
  var DATES = {
    en: {
      'lun.': 'Mon', 'mar.': 'Tue', 'mer.': 'Wed', 'jeu.': 'Thu',
      'ven.': 'Fri', 'sam.': 'Sat', 'dim.': 'Sun',
      'janv.': 'Jan', 'févr.': 'Feb', 'mars': 'Mar', 'avr.': 'Apr',
      'mai': 'May', 'juin': 'Jun', 'juil.': 'Jul', 'août': 'Aug',
      'sept.': 'Sep', 'oct.': 'Oct', 'nov.': 'Nov', 'déc.': 'Dec',
      'auj.': 'today', 'hier': 'yesterday', 'demain': 'tomorrow',
    },
    ar: {
      'lun.': 'الاثنين', 'mar.': 'الثلاثاء', 'mer.': 'الأربعاء', 'jeu.': 'الخميس',
      'ven.': 'الجمعة', 'sam.': 'السبت', 'dim.': 'الأحد',
      'janv.': 'يناير', 'févr.': 'فبراير', 'mars': 'مارس', 'avr.': 'أبريل',
      'mai': 'ماي', 'juin': 'يونيو', 'juil.': 'يوليوز', 'août': 'غشت',
      'sept.': 'شتنبر', 'oct.': 'أكتوبر', 'nov.': 'نونبر', 'déc.': 'دجنبر',
      'auj.': 'اليوم', 'hier': 'أمس', 'demain': 'غدًا',
    },
  };
  /* Le garde-fou : on ne remplace un jeton que si le segment RESSEMBLE à une
     date de bout en bout — jour, quantième, mois, heure, rien d'autre. */
  var DATE_LIKE = new RegExp(
    '^(?:(lun|mar|mer|jeu|ven|sam|dim)\\.|auj\\.|hier|demain)?\\s*' +
    '(?:\\d{1,2})?\\s*' +
    '(?:(janv|févr|avr|juil|sept|oct|nov|déc)\\.|mars|mai|juin|août)?\\s*' +
    '(?:\\d{1,2}:\\d{2})?$');
  var DATE_TOK = /(lun|mar|mer|jeu|ven|sam|dim|janv|févr|avr|juil|sept|oct|nov|déc|auj)\.|\b(mars|mai|juin|août|hier|demain)\b/g;

  /* ───────────────────────── état ───────────────────────── */
  var cur = 'fr';
  try { var saved = localStorage.getItem(KEY); if (saved && DICT[saved]) cur = saved; else if (saved === 'fr') cur = 'fr'; } catch (_) {}
  var subs = [];

  function dict() { return DICT[cur] || null; }
  function t(fr) { var d = dict(); return (d && d[fr]) || fr; }

  /* La phrase d'origine, retenue nœud par nœud. Sans elle, revenir au français
     serait impossible sur tout ce que la caisse n'a pas redessiné entre-temps :
     le texte anglais aurait écrasé la seule copie du français. Une WeakMap pour
     que les nœuds jetés par un re-rendu disparaissent avec leur souvenir. */
  var origText = new WeakMap();
  var origAttr = new WeakMap();

  // Un nombre, éventuellement écrit avec des séparateurs de milliers.
  var NUM = /\d[\d\s\u202f\u00a0.,]*\d|\d/g;
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, CANVAS: 1 };

  /* ───────────────── les montants, en arabe ─────────────────
     « 4 785 MAD » s'affichait « MAD 4 785 », et « −1 115 MAD » devenait
     « MAD 1 115− ». Ce n'est pas une faute de traduction, c'est l'algorithme
     bidirectionnel : l'espace entre le nombre et la devise est un caractère
     NEUTRE, il revient donc au sens du paragraphe (l'arabe), et la séquence se
     coupe en deux morceaux que l'affichage remet de droite à gauche.

     La parade se pose sur le texte, pas sur des classes CSS : une règle nommée
     ne protège que ce qu'elle nomme, et il y a quinze métiers. On entoure chaque
     montant de U+2066 / U+2069 — deux caractères invisibles qui disent « ceci
     est un îlot latin, garde-le tel quel ». Sans effet en français ni en
     anglais : l'isolement n'est posé que si la langue s'écrit à l'envers. */
  var LRI = '\u2066', PDI = '\u2069';
  /* Le préfixe latin collé au nombre fait partie de l'îlot : « MM-1208 » est
     UN code de ticket, pas un « MM » suivi d'un « −1208 ». Isolé en deux
     morceaux, il s'affichait « 1208MM- » sur le ticket. */
  /* Le trait d'union INTERNE — celui qui est collé des deux côtés à un chiffre —
     appartient lui aussi à l'îlot. « 1985-04-12 » découpé en trois morceaux se
     relisait « -12-041985 » sur la date de naissance d'une fiche cliente. Un
     tiret suivi d'une espace, lui, reste dehors : c'est une ponctuation. */
  var AMOUNT = /(?:[A-Za-z]{1,8}-)?[-\u2212+]?\d(?:[\d\s\u202f\u00a0.,:]|-(?=\d))*(?:MAD|DH|dh|%|pts)?/g;
  function isolate(s) {
    /* On repart toujours d'un texte nu. Le balayage rejoue à chaque rendu de la
       caisse — une vente, un scan, un changement de rayon — et empiler les
       marques ferait grossir le nœud d'un caractère invisible par frappe. */
    if (s.indexOf(LRI) >= 0 || s.indexOf(PDI) >= 0) s = s.replace(/[\u2066\u2069]/g, '');
    return s.replace(AMOUNT, function (m0) {
      var core = m0.replace(/\s+$/, '');       // l'espace de fin reste dehors
      return core ? LRI + core + PDI + m0.slice(core.length) : m0;
    });
  }
  function isRtl() {
    var l = LANGS.filter(function (x) { return x.id === cur; })[0];
    return !!l && l.dir === 'rtl';
  }

  // `tagName` garde sa casse sur les éléments SVG ('svg', pas 'SVG') : sans le
  // passage en majuscules, tout l'intérieur des icônes serait balayé.
  var tag = function (n) { return String(n.tagName || '').toUpperCase(); };
  function skipped(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (SKIP_TAGS[tag(n)]) return true;
      if (n.hasAttribute && n.hasAttribute('data-nolang')) return true;
    }
    return false;
  }

  function applyText(node) {
    var had = origText.has(node);
    // Runtime-localized fragments keep an explicit French source. Without it,
    // a first render in EN/AR becomes the captured "original" permanently.
    var owner = node.parentElement;
    var declared = owner && owner.getAttribute && owner.getAttribute('data-caisse-copy');
    var fr = declared != null ? declared : (had ? origText.get(node) : node.nodeValue);
    // Une phrase peut être entourée d'espaces / retours à la ligne dans le
    // gabarit ; on traduit le cœur et on remet l'habillage tel quel, sinon la
    // mise en page bouge à chaque changement de langue.
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(fr);
    var core = m[2];
    if (!core) return;
    var hit = translateCore(core);
    var out = hit == null ? fr : (m[1] + hit + m[3]);
    /* L'isolement des montants s'applique APRÈS la traduction et sur TOUS les
       nœuds — y compris ceux que le dictionnaire ne connaît pas. Un prix
       d'article est une donnée du commerçant : elle n'est pas traduite, mais
       elle doit quand même s'afficher à l'endroit. */
    if (isRtl()) out = isolate(out);
    if (!had && out !== fr) origText.set(node, fr);
    if (node.nodeValue !== out) node.nodeValue = out;
  }

  /* Une phrase d'interface se présente rarement seule dans son nœud : le code
     écrit `Encaisser · ${total}`, `3 articles`, `Ticket · MM-1208 · par Rania`.
     Un dictionnaire qui n'accepte que la correspondance exacte laisse tout ça
     en français — et ce sont précisément les libellés les plus regardés.
     Deux découpes, toutes deux prudentes : on ne réécrit QUE si un morceau a
     réellement été reconnu, et les morceaux inconnus (montants, numéros de
     ticket, noms) traversent intacts. */
  function translateCore(core) {
    var d = dict();
    if (!d) return null;
    if (d[core]) return d[core];

    // Treat the entire search query as data before splitting on the Kiwi dot.
    // A name may itself contain dots, quotes, amounts or template markers.
    var query = /^(Aucun résultat pour|Nouveau client ·|Aucune fiche pour|Nouvelle cliente ·) « ([\s\S]*) »$/.exec(core);
    if (query) {
      var queryTemplate = d[query[1] + ' « {query} »'];
      if (queryTemplate) return queryTemplate.replace('{query}', function () { return query[2]; });
    }

    // Only the three complete unknown-barcode UI messages are templates.
    // Capture the code as one opaque value before dot/numeric/name handling;
    // the callback keeps markup and replacement markers as literal text.
    var unknownCode = /^Code ([\s\S]+) (inconnu, enregistrez-le sur un article|inconnu, aucun article ne le porte|inconnu, à enregistrer)$/.exec(core);
    if (unknownCode) {
      var codeTemplate = d['Code {code} ' + unknownCode[2]];
      if (codeTemplate) return codeTemplate.replace('{code}', function () { return unknownCode[1]; });
    }

    // 1 · segments séparés par « · » — la ponctuation maison de la caisse.
    if (core.indexOf(' · ') >= 0) {
      var any = false;
      var parts = core.split(' · ').map(function (seg) {
        var s2 = translateSegment(seg, d);
        if (s2 != null) { any = true; return s2; }
        return seg;
      });
      if (any) return parts.join(' · ');
    }
    return translateSegment(core, d);
  }

  /* Un segment, éventuellement précédé d'un nombre : « 3 articles »,
     « 12 400 pts ». Le nombre reste tel quel — il n'a pas de traduction, et le
     toucher casserait les milliers. */
  function translateSegment(seg, d) {
    if (d[seg]) return d[seg];

    /* Le gabarit à trous. La caisse écrit « Se termine dans 3 jours », « Il en
       reste 5 ou moins », « 20 articles concernés » — le nombre est au milieu,
       donc aucune clé fixe ne peut les attraper. On remplace chaque nombre par
       {n}, on cherche le gabarit, et on remet les nombres dans l'ordre.
       Le sens de la phrase peut déplacer le trou d'une langue à l'autre, c'est
       exactement pourquoi la traduction porte ses propres {n}. */
    var nums = [];
    var tpl = seg.replace(NUM, function (m0) { nums.push(m0); return '{n}'; });
    if (nums.length && d[tpl]) {
      var i = 0;
      return d[tpl].replace(/\{n\}/g, function () { return nums[i] != null ? nums[i++] : ''; });
    }

    // Repli : un nombre EN TÊTE suivi d'un mot connu (« 2 articles »).
    var m = /^([\d][\d\s\u202f\u00a0.,]*)\s(.+)$/.exec(seg);
    if (m && d[m[2]]) return m[1] + ' ' + d[m[2]];

    /* Un mot d'interface suivi d'une DONNÉE : « par Salma ». La clé porte son
       propre {x} — la donnée traverse sans être lue, et une langue qui préfère
       mettre le nom devant peut le faire. */
    var px = /^(\S+)\s+([\s\S]+)$/.exec(seg);
    if (px && d[px[1] + ' {x}']) return d[px[1] + ' {x}'].replace('{x}', function () { return px[2]; });

    // Une date : des jetons, pas une phrase.
    return translateDate(seg);
  }

  /* On ne touche aux jetons de date QUE si le segment RESSEMBLE de bout en bout
     à une date. « mai » tout seul dans un nom d'article n'est pas un mois ;
     « sam. 14:32 » en est une. Le garde-fou est le motif, pas le mot. */
  function translateDate(seg) {
    var tok = DATES[cur];
    if (!tok || !DATE_LIKE.test(seg)) return null;
    var any = false;
    var out = seg.replace(DATE_TOK, function (m0) {
      var v = tok[m0];
      if (v == null) return m0;
      any = true;
      return v;
    });
    return any ? out : null;
  }

  function applyAttrs(el) {
    var store = origAttr.get(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      /* Only these printer-interface prefixes are templates. The selected
         label is one opaque value: never split/retranslate its names, dots,
         amounts or replacement markers. Read today's selected option, not
         origAttr's first snapshot, so selection/locale changes cannot restore
         a stale value into the accessible name. */
      if (a === 'aria-label' && el.matches && el.matches('#kpr-card .kiwi-select-trigger')) {
        var select = el.parentElement && el.parentElement.previousElementSibling;
        var printerKey = select && ({ 'kpr-paper': 'Largeur papier', 'kpr-label': "Format d'étiquette" })[select.id];
        var selected = select && select.selectedOptions && select.selectedOptions[0];
        var current = el.getAttribute(a);
        if (printerKey && selected && [printerKey, DICT.en[printerKey], DICT.ar[printerKey]].some(function (prefix) { return current.indexOf(prefix + ': ') === 0; })) {
          var printerOut = t(printerKey + ': {value}').replace('{value}', function () { return String(selected.textContent || '').trim(); });
          if (current !== printerOut) el.setAttribute(a, printerOut);
          continue;
        }
      }
      var fr = (store && store[a] != null) ? store[a] : el.getAttribute(a);
      var d = dict();
      var out = (d && d[fr]) ? d[fr] : fr;
      if (out !== fr) {
        if (!store) { store = {}; origAttr.set(el, store); }
        if (store[a] == null) store[a] = fr;
      }
      if (el.getAttribute(a) !== out) el.setAttribute(a, out);
    }
  }

  function sweep(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var n = root.nodeType === 1 ? root : null;
    if (n) applyAttrs(n);
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) { if (!skipped(n.parentElement)) applyText(n); }
      else if (!SKIP_TAGS[tag(n)]) applyAttrs(n);
    }
  }

  /* ───────────────────────── le repeint ─────────────────────────
     La caisse redessine sans arrêt (une vente, un scan, un changement de
     rayon). On réagit aux mutations, mais DÉBRANCHÉ pendant notre propre
     passage : sinon chaque traduction déclencherait une nouvelle observation,
     et on tournerait en rond au lieu de vendre. */
  var obs = null, pending = false;
  /* Un `setTimeout`, pas un `requestAnimationFrame`. Un onglet en arrière-plan
     ne reçoit AUCUNE image d'animation : la caisse posée sur une tablette qu'on
     réveille, ou l'onglet passé au second plan pendant qu'un autre écran sert,
     se serait rouvert en français au premier rendu — la traduction n'aurait
     jamais été rejouée. Le balayage ne dessine rien, il n'a rien à
     synchroniser avec l'écran ; il doit juste avoir lieu. */
  function schedule() {
    if (pending || cur === 'fr') return;
    pending = true;
    setTimeout(function () { pending = false; run(document.body); }, 0);
  }
  function run(root) {
    if (obs) obs.disconnect();
    try { sweep(root); } catch (_) {}
    if (obs && cur !== 'fr') obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function watch() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver(schedule);
    if (cur !== 'fr') obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function paintDir() {
    var l = LANGS.filter(function (x) { return x.id === cur; })[0] || LANGS[0];
    var el = document.documentElement;
    el.setAttribute('lang', cur);
    /* L'arabe s'écrit de droite à gauche, et une caisse n'est pas un texte :
       ce sont des colonnes, un rail, un ticket. `dir` retourne les
       dispositions en flex et en grille toutes seules. Ce qui est positionné
       en dur (`left`/`right`) ne suit pas — c'est la limite connue de ce
       premier passage, et elle se corrige règle par règle. */
    el.setAttribute('dir', l.dir);
    document.body.classList.toggle('kiwi-rtl', l.dir === 'rtl');
  }

  function set(id) {
    if (!LANGS.some(function (x) { return x.id === id; })) return;
    cur = id;
    if (window.KiwiNativeLocale) window.KiwiNativeLocale.set(id);
    try { localStorage.setItem(KEY, id); } catch (_) {}
    paintDir();
    watch();                 // crée l'observateur au premier changement de langue
    run(document.body);      // balaye, puis se remet à l'écoute si on n'est pas en français
    paintPickers();
    subs.forEach(function (fn) { try { fn(cur); } catch (_) {} });
  }

  /* ───────────────────────── le sélecteur ─────────────────────────
     Il prend la place du bouton « Simuler une coupure réseau » : une bascule de
     panne réseau SIMULÉE n'a rien à faire sur le comptoir d'un vrai commerce,
     et l'état réel du réseau est déjà porté, en plus juste, par la pastille de
     synchronisation en bas du rail (assets/caisse-pwa.js).
     On le MASQUE sans le retirer : caisse-pwa.js le clique par programme pour
     répercuter `navigator.onLine` dans chaque métier, et un bouton supprimé
     emporterait avec lui la mise en file hors-ligne des ventes. */
  function pickerHtml() {
    return LANGS.map(function (l) {
      return '<button type="button" class="kcl-it' + (l.id === cur ? ' on' : '') + '"'
        + ' data-kcl="' + l.id + '" lang="' + l.id + '" title="' + l.label + '"'
        + ' aria-label="' + l.label + '" aria-pressed="' + (l.id === cur) + '" data-nolang>'
        + l.code + '</button>';
    }).join('');
  }
  function paintPickers() {
    Array.prototype.forEach.call(document.querySelectorAll('.kcl'), function (p) {
      Array.prototype.forEach.call(p.querySelectorAll('[data-kcl]'), function (b) {
        var on = b.getAttribute('data-kcl') === cur;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    });
  }
  function netButtons() {
    return Array.prototype.slice.call(document.querySelectorAll(
      'button[title="Simuler une coupure réseau"], button[data-kiwi-real-net], button.bq-net, button[class$="-net"]'));
  }
  function graft() {
    netButtons().forEach(function (net) {
      var host = net.parentElement;
      if (!host || host.querySelector('.kcl')) return;
      var box = document.createElement('div');
      box.className = 'kcl';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Langue');
      box.setAttribute('data-nolang', '');
      box.innerHTML = pickerHtml();
      host.insertBefore(box, net);
      net.classList.add('kcl-hidden-net');
      box.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-kcl]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        var selected = b.getAttribute('data-kcl');
        try { if (document.documentElement.classList.contains('kiwi-native')) localStorage.setItem('kiwiNativeLocale', selected); } catch (_) {}
        set(selected);
      });
    });
  }

  function css() {
    if (document.getElementById('kcl-css')) return;
    var st = document.createElement('style');
    st.id = 'kcl-css';
    st.textContent = [
      /* Le bouton de panne simulée sort de l'écran mais reste dans le document :
         caisse-pwa.js a besoin de pouvoir le cliquer. `visibility` plutôt que
         `display:none` — un élément sans boîte reste cliquable par programme,
         mais autant ne rien changer à sa géométrie interne. */
      '.kcl-hidden-net{position:absolute!important;width:1px;height:1px;overflow:hidden;',
      '  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;pointer-events:none;}',
      '.kcl{display:flex;gap:3px;padding:3px;border-radius:11px;',
      '  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);}',
      '.kcl-it{flex:1;min-width:0;padding:6px 0;border:0;border-radius:8px;background:transparent;',
      '  color:rgba(255,255,255,.55);font:inherit;font-size:11.5px;font-weight:600;letter-spacing:.02em;',
      '  cursor:pointer;text-align:center;line-height:1.1;',
      '  transition:background 180ms ease,color 180ms ease;}',
      '.kcl-it:hover{color:rgba(255,255,255,.85);}',
      '.kcl-it.on{background:var(--atlas,#0B6E4F);color:#fff;',
      '  box-shadow:0 1px 6px -2px rgba(11,110,79,.8);}',
      '.kcl-it[lang="ar"]{font-size:14px;line-height:.95;}',
      /* Rail clair (certains métiers) : la même pastille, en négatif. */
      '.bq-rail-foot .kcl,.pos-rail-foot .kcl{background:rgba(255,255,255,.06);}',
      /* RTL — ce que le retournement automatique ne couvre pas. */
      '.kiwi-rtl .kcl-it{letter-spacing:0;}',
      /* Les deux pastilles flottantes d'assets/caisse-pwa.js sont posées en
         coordonnées PHYSIQUES, dans un style en ligne (`left:12px` pour l'état
         réseau, `right:16px` pour l'invite d'installation). `dir` ne retourne
         pas ça : en arabe l'état de synchronisation restait dans le coin
         gauche, du côté que l'œil quitte, pendant que tout le reste avait
         basculé. Le `!important` n'est pas un caprice — il faut battre un style
         en ligne. */
      '.kiwi-rtl #kiwi-net{left:auto!important;right:12px!important;}',
      '.kiwi-rtl #kiwi-install{right:auto!important;left:16px!important;}',
    ].join('');
    document.head.appendChild(st);
  }

  /* ───────────────────────── démarrage ─────────────────────────
     Le rail d'un métier n'existe qu'une fois la caisse déverrouillée, et il est
     reconstruit à chaque montage : on regreffe donc à chaque mutation, comme
     assets/clients-book.js le fait pour son entrée de carnet. */
  var wireT = null;
  function scheduleGraft() {
    if (wireT) return;
    wireT = setTimeout(function () { wireT = null; try { css(); graft(); paintPickers(); } catch (_) {} }, 150);
  }
  function boot() {
    css(); paintDir(); graft(); watch();
    if (cur !== 'fr') run(document.body);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(scheduleGraft).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiCaisseLang = {
    get: function () { return cur; },
    set: set,
    t: t,
    // Exposé pour tools/caisse-lang-test.js : c'est ICI que vit la découpe des
    // phrases interpolées, et une découpe qui se casse ne se voit pas à l'œil —
    // l'écran reste simplement en français.
    tr: function (core) { var r = translateCore(String(core)); return r == null ? String(core) : r; },
    /* Exposé pour la même raison que `tr` : un montant mal isolé s'affiche
       « MAD 4 785 » au lieu de « 4 785 MAD », et ça ne lève aucune erreur —
       c'est juste un prix que la cliente lit de travers au comptoir. */
    bidi: function (s) { return isRtl() ? isolate(String(s)) : String(s); },
    langs: LANGS.slice(),
    dict: function () { return dict(); },
    apply: function (root) { run(root || document.body); },
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; },
  };
})();
