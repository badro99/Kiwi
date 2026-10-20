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
      "Comptez le tiroir et indiquez le fond d'ouverture avant d'ouvrir la caisse.": 'Count the drawer and enter the opening float before opening the till.',
      'encaissés sur ce service.': 'collected this service.', 'Plat épuisé · retiré de la vente': 'Dish sold out · taken off sale', 'Dernier fond : {n} MAD': 'Last float: {n} MAD', 'Ticket moyen': 'Average ticket',
      'Faites payer sur votre terminal, puis confirmez': 'Take payment on your terminal, then confirm',
      'Terminal de paiement externe': 'External payment terminal', 'Paiement reçu · enregistrer': 'Payment received · record it',
      'Paiement carte enregistré · terminal externe': 'Card payment recorded · external terminal',
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
      'Nouvelle table': 'New table', 'Ouvrir': 'Open', 'Ouvrir la table': 'Open table', 'Combien de couverts?': 'How many covers?',
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
      // Carte de vente à emporter, une fois payée ou en attente de paiement.
      'Commande payée': 'Order paid', 'Remise au client.': 'Handed to the customer.',
      'En attente de remise. « Retirer du suivi » ne modifie ni le paiement ni les ventes.': 'Waiting for pickup. “Remove from tracking” changes neither the payment nor the sales.',
      'Retirer du suivi': 'Remove from tracking', 'Remettre au client': 'Hand to customer', 'Marquer prêt': 'Mark ready',
      'Prévenir le client que la commande est prête': 'Tell the customer the order is ready',
      'En attente de paiement': 'Awaiting payment', 'Reprendre le split': 'Resume the split', 'Partiel': 'Partial', 'reste {x}': '{x} left',
      // Caisse tablette : rail de gauche, en-tête du constructeur, statistiques du service.
      '· vente au comptoir': '· counter sale', 'Commandes à emporter': 'Takeaway orders', 'Montant libre': 'Custom amount',
      'Salle': 'Floor', 'Attente': 'Waiting', 'Service depuis {x}': 'On shift since {x}',
      'catégorie': 'category', 'catégories': 'categories', 'Carte {n}%': 'Card {n}%',
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
      'Fidélité non activée': 'Loyalty not switched on',
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
      'Attacher à la vente en cours': 'Attach to the current sale', 'Détacher de la vente': 'Detach from the sale',
      'Client de la vente': 'Sale customer', 'Client attaché': 'Customer attached', 'Client détaché de la vente': 'Customer detached from the sale',
      'Sa prochaine vente s’enregistre sur sa fiche.': 'Their next sale is saved on their profile.',
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
      "Comptez le tiroir et indiquez le fond d'ouverture avant d'ouvrir la caisse.": 'عدّ الدرج وأدخل رصيد الافتتاح قبل فتح الصندوق.',
      'encaissés sur ce service.': 'تم تحصيلها في هذه الخدمة.', 'Plat épuisé · retiré de la vente': 'الطبق نفد · أُزيل من البيع', 'Dernier fond : {n} MAD': 'آخر رصيد: {n} MAD', 'Ticket moyen': 'متوسط التذكرة',
      'Faites payer sur votre terminal, puis confirmez': 'اطلب من الزبون الدفع على جهازك ثم أكّد',
      'Terminal de paiement externe': 'جهاز دفع خارجي', 'Paiement reçu · enregistrer': 'تم استلام الدفع · سجّل',
      'Paiement carte enregistré · terminal externe': 'تم تسجيل الدفع بالبطاقة · جهاز خارجي',
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
      'Nouvelle table': 'طاولة جديدة', 'Ouvrir': 'فتح', 'Ouvrir la table': 'فتح الطاولة', 'Combien de couverts?': 'كم عدد الأشخاص؟',
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
      'Commande payée': 'طلب مدفوع', 'Remise au client.': 'سُلِّم إلى الزبون.',
      'En attente de remise. « Retirer du suivi » ne modifie ni le paiement ni les ventes.': 'في انتظار الاستلام. «إزالة من المتابعة» لا تغيّر الدفع ولا المبيعات.',
      'Retirer du suivi': 'إزالة من المتابعة', 'Remettre au client': 'تسليم إلى الزبون', 'Marquer prêt': 'وضع علامة جاهز',
      'Prévenir le client que la commande est prête': 'إخبار الزبون بأن الطلب جاهز',
      'En attente de paiement': 'في انتظار الدفع', 'Reprendre le split': 'استئناف التقسيم', 'Partiel': 'جزئي', 'reste {x}': 'المتبقي {x}',
      '· vente au comptoir': '· بيع على الصندوق', 'Commandes à emporter': 'طلبات للأخذ', 'Montant libre': 'مبلغ حر',
      'Salle': 'القاعة', 'Attente': 'الانتظار', 'Service depuis {x}': 'في الخدمة منذ {x}',
      'catégorie': 'فئة', 'catégories': 'فئات', 'Carte {n}%': 'بطاقة {n}%',
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
      'Fidélité non activée': 'برنامج الولاء غير مفعّل',
      'Régulier': 'منتظم', 'Nouveau': 'جديد', 'Dormant': 'خامل',
      'Récompense prête': 'المكافأة جاهزة', 'récompense {x}': 'مكافأة {x}',
      'Visites': 'الزيارات', 'Dépensé (MAD)': 'المصروف (MAD)', 'Dernière visite': 'آخر زيارة',
      'Email': 'البريد الإلكتروني', 'Ville': 'المدينة', 'Adresse': 'العنوان', 'Anniversaire': 'تاريخ الميلاد',
      'Genre': 'النوع', 'Notes': 'ملاحظات', 'Consentement': 'الموافقة', 'Aucun': 'لا شيء',
      'Enregistrer un achat': 'تسجيل شراء', 'Ajouter un tampon': 'إضافة طابع',
      'Attacher à la vente en cours': 'ربط بالبيع الحالي', 'Détacher de la vente': 'فك الربط بالبيع',
      'Client de la vente': 'زبون البيع', 'Client attaché': 'تم ربط الزبون', 'Client détaché de la vente': 'تم فك ربط الزبون بالبيع',
      'Sa prochaine vente s’enregistre sur sa fiche.': 'يُسجَّل بيعه القادم في بطاقته.',
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
      /* An open print dialog or a PDF sheet is not paper (audit 2026-10-12). */
      "Ticket ouvert dans l'impression système": ['Receipt opened in system printing', 'تم فتح التذكرة في الطباعة عبر النظام'],
      "Addition ouverte dans l'impression système": ['Bill opened in system printing', 'تم فتح الحساب في الطباعة عبر النظام'],
      "Rapport ouvert dans l'impression système": ['Report opened in system printing', 'تم فتح التقرير في الطباعة عبر النظام'],
      "Reçu ouvert dans l'impression système": ['Receipt opened in system printing', 'تم فتح الإيصال في الطباعة عبر النظام'],
      'Ticket prêt': ['Receipt ready', 'التذكرة جاهزة'],
      'Addition prête': ['Bill ready', 'الحساب جاهز'],
      'Rapport prêt': ['Report ready', 'التقرير جاهز'],
      'Reçu prêt': ['Receipt ready', 'الإيصال جاهز'],
      'imprimer ou partager le PDF': ['print or share the PDF', 'اطبع ملف PDF أو شاركه'],
      'Bon de passation prêt': ['Handover slip ready', 'وصل التسليم جاهز'],
      "Bon de passation ouvert dans l'impression système": ['Handover slip opened in system printing', 'تم فتح وصل التسليم في الطباعة عبر النظام'],
      'Tout est envoyé': ['Everything is sent', 'تم إرسال كل شيء'],
      /* Mouvement de caisse (audit 2026-10-12): the sheet was half French in
         English. The two direction buttons are labelled in the page itself,
         because « Entrée » is also the keyboard key above. */
      'Mouvement de caisse': ['Cash movement', 'حركة نقدية'],
      'Caisse actuelle': ['In the drawer', 'في الدرج'],
      'Montant': ['Amount', 'المبلغ'],
      'Ajout rapide': ['Quick add', 'إضافة سريعة'],
      'Achat fournisseur': ['Supplier purchase', 'شراء من مورد'],
      'Dépôt banque': ['Bank deposit', 'إيداع بنكي'],
      'Avance personnel': ['Staff advance', 'تسبيق للموظف'],
      'Appoint monnaie': ['Change float', 'صرف النقود'],
      'Correction': ['Correction', 'تصحيح'],
      'Ouverture sans vente': ['No-sale opening', 'فتح بدون بيع'],
      'Précisez le motif de la sortie (obligatoire)': ['Give the reason for the cash out (required)', 'اذكر سبب السحب (إلزامي)'],
      "Précisez le motif de l'entrée (obligatoire)": ['Give the reason for the cash in (required)', 'اذكر سبب الإيداع (إلزامي)'],
      'Précisez le motif de la sortie': ['Give the reason for the cash out', 'اذكر سبب السحب'],
      "Précisez le motif de l'entrée": ['Give the reason for the cash in', 'اذكر سبب الإيداع'],
      'Ex. Pain, taxi, courses, réparation...': ['E.g. bread, taxi, shopping, repair...', 'مثال: خبز، طاكسي، مشتريات، إصلاح...'],
      "Ex. Fond d'appoint, remboursement...": ['E.g. change float, refund...', 'مثال: فكة، استرجاع...'],
      'Mouvements ce service': ['Movements this shift', 'حركات هذه الخدمة'],
      'Aucun mouvement enregistré.': ['No movement recorded.', 'لا توجد أي حركة مسجلة.'],
      'Entrée de caisse': ['Cash in', 'إيداع نقدي'],
      'Sortie de caisse': ['Cash out', 'سحب نقدي'],
      'Rapport imprimé': ['Report printed', 'تمت طباعة التقرير'],
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
      /* ── modules coupés pour l'établissement (plus de « God Mode » devant le caissier) ── */
      'Mouvements de caisse désactivés pour cet établissement': ['Cash movements are turned off for this venue', 'حركات الصندوق متوقفة لهذه المنشأة'],
      'Ouverture manuelle du tiroir désactivée pour cet établissement': ['Opening the drawer by hand is turned off for this venue', 'فتح الدرج يدويًا متوقف لهذه المنشأة'],
      'Remboursements désactivés pour cet établissement': ['Refunds are turned off for this venue', 'الاسترداد متوقف لهذه المنشأة'],
      'Passation de caisse désactivée pour cet établissement': ['Till handover is turned off for this venue', 'تسليم الصندوق متوقف لهذه المنشأة'],
      /* ── caisse « autre activité » (pos-autre.js) ── */
      'Mon activité': ['My business', 'نشاطي'],
      'Caisse polyvalente': ['General-purpose till', 'صندوق متعدد الاستخدامات'],
      'Suivi d’activité': ['Activity tracking', 'متابعة النشاط'],
      'Journée': ['Day', 'اليوم'],
      'Un catalogue libre pour les activités qui ne rentrent dans aucune case.': ['A free-form catalogue for businesses that fit no box.', 'كتالوج حر للأنشطة التي لا تدخل في أي فئة.'],
      'Articles et prix se gèrent dans le tableau de bord': ['Items and prices are managed in the dashboard', 'تُدار المنتجات والأسعار من لوحة القيادة'],
      'Articles et prix se gèrent dans le tableau de bord.': ['Items and prices are managed in the dashboard.', 'تُدار المنتجات والأسعار من لوحة القيادة.'],
      'Ajoutez vos articles dans le tableau de bord.': ['Add your items in the dashboard.', 'أضف منتجاتك من لوحة القيادة.'],
      'Articles sans prix, pas encore en vente': ['Items without a price, not on sale yet', 'منتجات بلا سعر، ليست للبيع بعد'],
      'Saisir un montant': ['Enter an amount', 'أدخل مبلغًا'],
      'Montant (MAD)': ['Amount (MAD)', 'المبلغ (MAD)'],
      'Description (facultatif)': ['Description (optional)', 'الوصف (اختياري)'],
      'Ajouter au ticket': ['Add to the sale', 'أضف إلى التذكرة'],
      'Saisissez un montant supérieur à zéro.': ['Enter an amount above zero.', 'أدخل مبلغًا أكبر من الصفر.'],
      'Touchez un article.': ['Tap an item.', 'المس منتجًا.'],
      'Retirer': ['Remove', 'إزالة'],
      'Vente encaissée': ['Sale paid', 'تم تحصيل البيع'],
      'Ventes': ['Sales', 'المبيعات'],
      'Recette': ['Takings', 'الإيراد'],
      'Espèces / carte': ['Cash / card', 'نقدًا / بطاقة'],
      'Uniquement les ventes réellement encaissées sur ce terminal.': ['Only sales actually collected on this terminal.', 'فقط المبيعات المحصَّلة فعليًا على هذا الجهاز.'],
      /* ── annuler ou rouvrir une vente depuis « Réimprimer » (pos-reprint.js) ── */
      'Choisissez la vente à annuler. Un code manager à 4 chiffres est demandé, et l’annulation est journalisée.':
        ['Choose the sale to cancel. A 4-digit manager code is required, and the cancellation is logged.', 'اختر العملية المراد إلغاؤها. يلزم رمز المدير المكوّن من 4 أرقام، ويُسجَّل الإلغاء.'],
      'Aucune vente à annuler sur ce terminal.': ['No sale to cancel on this terminal.', 'لا توجد عملية للإلغاء على هذا الجهاز.'],
      'Annuler et rouvrir la note': ['Cancel and reopen the bill', 'إلغاء وإعادة فتح الحساب'],
      'Confirmer l’annulation': ['Confirm the cancellation', 'تأكيد الإلغاء'],
      'Entrez le code manager à 4 chiffres. Cette annulation sera journalisée avec votre nom, le ticket et le montant.':
        ['Enter the 4-digit manager code. This cancellation is logged with your name, the receipt and the amount.', 'أدخل رمز المدير المكوّن من 4 أرقام. يُسجَّل هذا الإلغاء باسمك ورقم التذكرة والمبلغ.'],
      'Table pour la note rouverte': ['Table for the reopened bill', 'الطاولة للحساب المُعاد فتحه'],
      'table occupée': ['table taken', 'الطاولة مشغولة'],
      'rouvrir sur une autre table': ['reopen on another table', 'أعد الفتح على طاولة أخرى'],
      'occupée / reprise existante': ['taken / existing bill', 'مشغولة / حساب قائم'],
      'Annuler et rouvrir': ['Cancel and reopen', 'إلغاء وإعادة فتح'],
      'Annuler définitivement': ['Cancel for good', 'إلغاء نهائي'],
      'Entrez le code manager à 4 chiffres.': ['Enter the 4-digit manager code.', 'أدخل رمز المدير المكوّن من 4 أرقام.'],
      'Choisissez une table libre.': ['Choose a free table.', 'اختر طاولة فارغة.'],
      'Code manager incorrect.': ['Wrong manager code.', 'رمز المدير غير صحيح.'],
      'Code manager requis. Un manager doit valider l’annulation.': ['Manager code required. A manager must approve the cancellation.', 'رمز المدير مطلوب. يجب أن يوافق المدير على الإلغاء.'],
      'Seules les ventes du jour peuvent rouvrir une note.': ['Only today’s sales can reopen a bill.', 'لا يمكن إعادة فتح حساب إلا لمبيعات اليوم.'],
      'Cette vente est trop ancienne pour être annulée en caisse.': ['This sale is too old to cancel at the till.', 'هذه العملية قديمة جدًا لإلغائها من الصندوق.'],
      'Cette vente est déjà annulée.': ['This sale is already cancelled.', 'هذه العملية ملغاة بالفعل.'],
      'Annulation impossible. Vérifiez la connexion et réessayez.': ['Cannot cancel. Check the connection and try again.', 'تعذّر الإلغاء. تحقّق من الاتصال وأعد المحاولة.'],
      'Note rouverte': ['Bill reopened', 'أُعيد فتح الحساب'],
      'Vente annulée': ['Sale cancelled', 'أُلغيت العملية'],
      'Module facture non disponible': ['Invoice module unavailable', 'وحدة الفواتير غير متاحة'],
      'mode inconnu': ['unknown method', 'طريقة غير معروفة'],
      'identifiant indisponible': ['id unavailable', 'المعرّف غير متاح'],
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
      /* Une vente que la file a refusée (stockage plein) : elle est enregistrée
         ici et repart toute seule. La seule consigne est de ne pas la refaire. */
      'Vente enregistrée sur cette caisse': ['Sale recorded on this till', 'تم تسجيل البيع على هذا الصندوق'],
      'envoi en attente, ne pas encaisser à nouveau': ['waiting to send, do not charge again', 'الإرسال قيد الانتظار، لا تحصّله مرة أخرى'],
      '{n} vente non envoyée': ['{n} sale not sent', '{n} عملية بيع لم تُرسل'],
      '{n} ventes non envoyées': ['{n} sales not sent', '{n} عمليات بيع لم تُرسل'],
      'Enregistrée sur cette caisse': ['Recorded on this till', 'مسجّلة على هذا الصندوق'],
      'Enregistrées sur cette caisse': ['Recorded on this till', 'مسجّلة على هذا الصندوق'],
      'ne pas encaisser à nouveau': ['do not charge again', 'لا تحصّلها مرة أخرى'],
      'Toujours enregistrée sur cette caisse': ['Still recorded on this till', 'ما زالت مسجّلة على هذا الصندوق'],
      'nouvel essai automatique': ['it will retry on its own', 'ستُعاد المحاولة تلقائيًا'],
      'Ventes transmises à la file d’envoi': ['Sales handed to the send queue', 'سُلّمت المبيعات إلى قائمة الإرسال'],
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
      /* The approval pad: a handover is confirmed by the incoming cashier alone, and an
         act that writes to the server says so instead of taking a code it cannot use. */
      'Confirmer la passation': ['Confirm the handover', 'تأكيد التسليم'],
      'code personnel de {x}': ['{x}’s personal code', 'الرمز الشخصي لـ {x}'],
      'Le caissier entrant confirme avec son propre code': ['The incoming cashier confirms with their own code', 'يؤكد أمين الصندوق القادم برمزه الخاص'],
      'Code différent de celui du caissier entrant': ['That is not the incoming cashier’s code', 'هذا ليس رمز أمين الصندوق القادم'],
      'Connexion requise': ['Connection needed', 'الاتصال مطلوب'],
      'Cette action a besoin d’une connexion. Rien n’a changé.': ['This action needs a connection. Nothing has changed.', 'يتطلب هذا الإجراء اتصالًا. لم يتغيّر شيء.'],
      'Réessayer': ['Try again', 'أعد المحاولة'],
      'Toujours sans connexion · rien n’a changé': ['Still offline · nothing has changed', 'لا يزال الاتصال مقطوعًا · لم يتغيّر شيء'],
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
      'Pas encore de récompense pour cette cliente': ['No reward for this customer yet', 'لا توجد مكافأة لهذه الزبونة بعد'],
      'Le nom est requis pour la fiche': ['A name is required for the profile', 'الاسم مطلوب للملف'],
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
      'Aucun avoir avec ce code, vérifiez-le sur le bon.': ['No credit note has this code, check it on the slip.', 'لا يوجد سند رصيد بهذا الرمز، تحقق منه على الوصل.'],
      'Cet avoir a expiré le {n}/{n}/{n}.': ['This credit note expired on {n}/{n}/{n}.', 'انتهت صلاحية سند الرصيد هذا في {n}/{n}/{n}.'],
      'Cet avoir a expiré.': ['This credit note has expired.', 'انتهت صلاحية سند الرصيد هذا.'],
      'Cet avoir est déjà entièrement utilisé.': ['This credit note has already been fully used.', 'تم استعمال سند الرصيد هذا بالكامل.'],
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

  /* L'imprimante et la clôture (Kiwi Pro iOS, 2026-10-12). Deux écrans restés
     en français sur une caisse réglée en anglais : le dialogue « Connecter une
     imprimante » (assets/printer-bridge.js, partagé avec le tableau de bord, ce
     qui est pourquoi il écrit en français et laisse le balayage traduire) et la
     feuille de fin de service (kiwi-caisse.html, #cloture-modal, puis le Z et
     l'ouverture hors horaires qui partagent son voile). La clôture n'était
     traduite qu'à moitié : « Ticket moyen » et « Fond d'ouverture » étaient
     déjà au dictionnaire pour un autre écran, le reste non.
     tools/caisse-surface-lang-test.js relit ces deux surfaces dans leur source
     et refuse toute phrase qui n'aurait pas sa paire anglais + arabe ici. */
  (function () {
    var S = {
      /* ── le dialogue d'imprimante · en-tête et accès rapide ── */
      'Connecter une imprimante': ['Connect a printer', 'ربط طابعة'],
      'Imprimer l’étiquette': ['Print the label', 'طباعة الملصق'],
      'Imprimer le reçu': ['Print the receipt', 'طباعة الإيصال'],
      'Imprimez tout de suite, ou connectez une imprimante réseau (Wi-Fi ou Ethernet) pour imprimer directement la prochaine fois.':
        ['Print right away, or connect a network printer (Wi-Fi or Ethernet) to print directly next time.', 'اطبع الآن، أو اربط طابعة شبكة (Wi-Fi أو Ethernet) للطباعة مباشرة في المرة القادمة.'],
      'Aucune imprimante n’est connectée à Kiwi. Préparez le PDF du ticket tout de suite, ou connectez une imprimante réseau (Wi-Fi ou Ethernet) pour imprimer directement la prochaine fois.':
        ['No printer is connected to Kiwi. Prepare the receipt PDF right away, or connect a network printer (Wi-Fi or Ethernet) to print directly next time.', 'لا توجد طابعة متصلة بـ Kiwi. جهّز ملف PDF للتذكرة الآن، أو اربط طابعة شبكة (Wi-Fi أو Ethernet) للطباعة مباشرة في المرة القادمة.'],
      'Connectez l’imprimante réseau (Wi-Fi ou Ethernet) : Kiwi lui envoie le ticket directement, sans boîte de dialogue.':
        ['Connect the network printer (Wi-Fi or Ethernet): Kiwi sends it the receipt directly, with no print dialog.', 'اربط طابعة الشبكة (Wi-Fi أو Ethernet): يرسل لها Kiwi التذكرة مباشرة، دون نافذة طباعة.'],
      'Imprimez tout de suite, ou connectez une imprimante (Bluetooth ou réseau) pour imprimer directement la prochaine fois.':
        ['Print right away, or connect a printer (Bluetooth or network) to print directly next time.', 'اطبع الآن، أو اربط طابعة (Bluetooth أو شبكة) للطباعة مباشرة في المرة القادمة.'],
      'Aucune imprimante n’est connectée à Kiwi. Si l’imprimante est déjà installée sur cette caisse, imprimez par le système · ou connectez-la en Bluetooth ou en USB pour imprimer sans boîte de dialogue la prochaine fois.':
        ['No printer is connected to Kiwi. If the printer is already installed on this till, print through the system · or connect it over Bluetooth or USB to print without a dialog next time.', 'لا توجد طابعة متصلة بـ Kiwi. إذا كانت الطابعة مثبتة على هذا الصندوق، اطبع عبر النظام · أو اربطها عبر Bluetooth أو USB للطباعة دون نافذة في المرة القادمة.'],
      'Connectez l’imprimante en Bluetooth ou en USB pour imprimer sans boîte de dialogue. Si elle est déjà installée sur cette caisse, Kiwi peut aussi l’utiliser via la boîte d’impression du système.':
        ['Connect the printer over Bluetooth or USB to print without a dialog. If it is already installed on this till, Kiwi can also use it through the system print dialog.', 'اربط الطابعة عبر Bluetooth أو USB للطباعة دون نافذة. إذا كانت مثبتة على هذا الصندوق، يمكن لـ Kiwi أيضًا استخدامها عبر نافذة الطباعة في النظام.'],
      'Imprimer ou partager le PDF': ['Print or share the PDF', 'اطبع ملف PDF أو شاركه'],
      'Enregistrer en PDF': ['Save as PDF', 'حفظ كملف PDF'],

      /* ── Bluetooth · USB ── */
      'Imprimante Bluetooth': ['Bluetooth printer', 'طابعة Bluetooth'],
      'Sans installation. Kiwi imprime le reçu directement.': ['No setup needed. Kiwi prints the receipt directly.', 'دون تثبيت. يطبع Kiwi الإيصال مباشرة.'],
      'Connectée': ['Connected', 'متصلة'],
      'Aucune imprimante connectée.': ['No printer connected.', 'لا توجد طابعة متصلة.'],
      'Changer d’imprimante': ['Change printer', 'تغيير الطابعة'],
      'Rechercher une imprimante Bluetooth': ['Find a Bluetooth printer', 'البحث عن طابعة Bluetooth'],
      'Imprimer un ticket test': ['Print a test receipt', 'طباعة تذكرة تجريبية'],
      'Imprimante USB': ['USB printer', 'طابعة USB'],
      'Branchée en USB sur la caisse. Sans installation, sans adresse IP.': ['Plugged into the till over USB. No setup, no IP address.', 'موصولة بالصندوق عبر USB. دون تثبيت، ودون عنوان IP.'],
      'Aucune imprimante USB connectée.': ['No USB printer connected.', 'لا توجد طابعة USB متصلة.'],
      'Choisir l’imprimante USB': ['Choose the USB printer', 'اختيار طابعة USB'],
      'Bluetooth indisponible sur ce navigateur. Utilisez Chrome (ordinateur ou Android).': ['Bluetooth is not available in this browser. Use Chrome (computer or Android).', 'Bluetooth غير متاح في هذا المتصفح. استخدم Chrome (حاسوب أو Android).'],
      'USB indisponible sur ce navigateur. Utilisez Chrome (ordinateur ou Android).': ['USB is not available in this browser. Use Chrome (computer or Android).', 'USB غير متاح في هذا المتصفح. استخدم Chrome (حاسوب أو Android).'],
      'Recherche…': ['Searching…', 'جارٍ البحث…'],
      'Imprimante': ['Printer', 'الطابعة'],
      'Imprimante Bluetooth connectée': ['Bluetooth printer connected', 'تم ربط طابعة Bluetooth'],
      'Imprimante USB connectée': ['USB printer connected', 'تم ربط طابعة USB'],
      'Aucune imprimante sélectionnée.': ['No printer selected.', 'لم يتم اختيار أي طابعة.'],
      'Imprimante trouvée mais non compatible (aucun canal d’écriture).': ['Printer found but not compatible (no write channel).', 'تم العثور على الطابعة لكنها غير متوافقة (لا توجد قناة كتابة).'],
      'Appareil trouvé mais ce n’est pas une imprimante USB standard.': ['Device found, but it is not a standard USB printer.', 'تم العثور على الجهاز لكنه ليس طابعة USB قياسية.'],
      'Accès USB refusé par le navigateur.': ['USB access refused by the browser.', 'رفض المتصفح الوصول إلى USB.'],
      'Imprimante déjà utilisée par le système. Retirez-la des imprimantes installées (ou utilisez le port réseau), puis réessayez.':
        ['Printer already in use by the system. Remove it from the installed printers (or use the network port), then try again.', 'الطابعة مستخدمة من طرف النظام. أزلها من الطابعات المثبتة (أو استخدم منفذ الشبكة)، ثم أعد المحاولة.'],
      'Connexion impossible': ['Cannot connect', 'تعذّر الاتصال'],

      /* ── tickets de production · hub cuisine ── */
      'Tickets de production automatiques': ['Automatic production tickets', 'تذاكر التحضير التلقائية'],
      'Ce poste peut imprimer les commandes envoyées depuis la caisse, l’app employé et les autres terminaux. Activez cette option sur un seul ordinateur par établissement.':
        ['This station can print orders sent from the till, the staff app and other terminals. Turn this on for one computer per venue only.', 'يمكن لهذا الجهاز طباعة الطلبات المرسلة من الصندوق وتطبيق الموظفين والأجهزة الأخرى. فعّل هذا الخيار على حاسوب واحد فقط لكل مؤسسة.'],
      'Faire de ce poste le hub d’impression': ['Make this station the print hub', 'جعل هذا الجهاز مركز الطباعة'],
      '{n} ticket en attente': ['{n} ticket waiting', '{n} تذكرة في الانتظار'],
      '{n} tickets en attente': ['{n} tickets waiting', '{n} تذاكر في الانتظار'],
      'nouvelle tentative automatique': ['retrying automatically', 'إعادة المحاولة تلقائيًا'],
      'Prêt': ['Ready', 'جاهز'],
      'aucune impression en attente': ['nothing waiting to print', 'لا توجد طباعة في الانتظار'],
      'Hub actif': ['Hub on', 'المركز مفعّل'],
      'connectez une imprimante': ['connect a printer', 'اربط طابعة'],
      'Les commandes de ce poste continuent à s’imprimer localement.': ['Orders from this station keep printing locally.', 'تستمر طلبات هذا الجهاز في الطباعة محليًا.'],
      'Hub d’impression cuisine activé': ['Kitchen print hub on', 'تم تفعيل مركز طباعة المطبخ'],
      'Hub d’impression désactivé': ['Print hub off', 'تم إيقاف مركز الطباعة'],

      /* ── imprimante déjà installée (système) ── */
      'Imprimante déjà installée': ['Printer already installed', 'طابعة مثبتة مسبقًا'],
      'Celle que cet ordinateur utilise déjà. Kiwi lui envoie le ticket directement, sans boîte de dialogue.':
        ['The one this computer already uses. Kiwi sends it the receipt directly, with no print dialog.', 'الطابعة التي يستخدمها هذا الحاسوب. يرسل لها Kiwi التذكرة مباشرة، دون نافذة طباعة.'],
      'Choisie': ['Selected', 'مختارة'],
      'Aucune imprimante choisie.': ['No printer selected.', 'لم يتم اختيار أي طابعة.'],
      'Utiliser cette imprimante': ['Use this printer', 'استخدام هذه الطابعة'],

      /* ── imprimantes par poste ── */
      'Imprimantes par poste': ['Printers by station', 'الطابعات حسب المحطة'],
      'Associez chaque poste (caisse, cuisine, bar…) à son imprimante physique.': ['Link each station (till, kitchen, bar…) to its physical printer.', 'اربط كل محطة (الصندوق، المطبخ، البار…) بطابعتها الفعلية.'],
      '+ Nouvelle imprimante': ['+ New printer', '+ طابعة جديدة'],
      'Ajouter une imprimante': ['Add a printer', 'إضافة طابعة'],
      'Nom de l’imprimante': ['Printer name', 'اسم الطابعة'],
      'ex. Cuisine, Bar, Fournil…': ['e.g. Kitchen, Bar, Bakehouse…', 'مثال: المطبخ، البار، المخبز…'],
      'Type': ['Type', 'النوع'],
      'Réseau (IP · Wi-Fi / Ethernet)': ['Network (IP · Wi-Fi / Ethernet)', 'شبكة (IP · Wi-Fi / Ethernet)'],
      'Imprimante système (installée)': ['System printer (installed)', 'طابعة النظام (مثبتة)'],
      'USB direct': ['Direct USB', 'USB مباشر'],
      'Papier': ['Paper', 'الورق'],
      'Adresse IP': ['IP address', 'عنوان IP'],
      'Port': ['Port', 'المنفذ'],
      'Imprimante du système': ['System printer', 'طابعة النظام'],
      'Tester': ['Test', 'اختبار'],
      'Enregistrer le routage par poste': ['Save routing by station', 'حفظ التوجيه حسب المحطة'],
      'Aucune imprimante additionnelle enregistrée. Ajoutez-en une pour router par poste.': ['No extra printer saved. Add one to route by station.', 'لا توجد طابعة إضافية محفوظة. أضف واحدة للتوجيه حسب المحطة.'],
      'Imprimante retirée': ['Printer removed', 'تمت إزالة الطابعة'],
      '· Imprimante par défaut (actuelle) ·': ['· Default printer (current) ·', '· الطابعة الافتراضية (الحالية) ·'],
      '· Même imprimante que la caisse ·': ['· Same printer as the till ·', '· نفس طابعة الصندوق ·'],
      'Caisse (comptoir)': ['Till (counter)', 'الصندوق (الكاونتر)'],
      'Reçus clients': ['Customer receipts', 'إيصالات الزبائن'],
      'Imprimante de la caisse': ['Till printer', 'طابعة الصندوق'],
      'Imprimante du poste {x}': ['Printer for {x}', 'طابعة محطة {x}'],
      'Production': ['Prep', 'التحضير'],
      'Ticket test': ['Test receipt', 'تذكرة تجريبية'],
      'Tester le tiroir': ['Test the drawer', 'اختبار الدرج'],
      'Ticket test envoyé': ['Test receipt sent', 'تم إرسال التذكرة التجريبية'],
      'Ticket test envoyé ({x})': ['Test receipt sent ({x})', 'تم إرسال التذكرة التجريبية ({x})'],
      'Ticket test envoyé à {x}': ['Test receipt sent to {x}', 'تم إرسال التذكرة التجريبية إلى {x}'],
      'Échec': ['Failed', 'فشل'],
      'Échec d’impression': ['Print failed', 'فشلت الطباعة'],
      'Envoi…': ['Sending…', 'جارٍ الإرسال…'],
      'Impulsion envoyée': ['Pulse sent', 'تم إرسال النبضة'],
      "tiroir fermé ? Vérifiez le câble RJ11 sur le port DK de l'imprimante et la clé en position verticale":
        ['drawer still shut? Check the RJ11 cable on the printer’s DK port and that the key is upright', 'الدرج مغلق؟ تحقق من كابل RJ11 في منفذ DK بالطابعة ومن أن المفتاح في الوضع العمودي'],
      "Échec de l'impulsion tiroir": ['Drawer pulse failed', 'فشلت نبضة الدرج'],
      'Saisissez une adresse IP': ['Enter an IP address', 'أدخل عنوان IP'],
      'Adresse IP invalide': ['Invalid IP address', 'عنوان IP غير صالح'],
      'Port invalide': ['Invalid port', 'منفذ غير صالح'],
      'Donnez un nom à cette imprimante (ex. Cuisine, Bar)': ['Name this printer (e.g. Kitchen, Bar)', 'سمِّ هذه الطابعة (مثال: المطبخ، البار)'],
      'Sélectionnez une imprimante système': ['Select a system printer', 'اختر طابعة النظام'],
      'Imprimante « {x} » enregistrée': ['Printer “{x}” saved', 'تم حفظ الطابعة «{x}»'],
      'Routage des imprimantes par poste enregistré': ['Printer routing by station saved', 'تم حفظ توجيه الطابعات حسب المحطة'],

      /* ── le pont local · le relais Kiwi ── */
      'Imprimer depuis un iPad ou une tablette · relais Kiwi': ['Print from an iPad or tablet · Kiwi relay', 'الطباعة من iPad أو جهاز لوحي · مُرحِّل Kiwi'],
      'Sans pont sur cet appareil, Kiwi envoie les tickets au pont de l’ordinateur du comptoir, qui les imprime sur votre imprimante réseau. Une association suffit, puis tout est automatique.':
        ['With no bridge on this device, Kiwi sends tickets to the bridge on the counter computer, which prints them on your network printer. Link it once, then everything is automatic.', 'في غياب جسر على هذا الجهاز، يرسل Kiwi التذاكر إلى جسر حاسوب الكاونتر، الذي يطبعها على طابعة الشبكة. يكفي ربط واحد، ثم يصبح كل شيء تلقائيًا.'],
      'Vérification du relais…': ['Checking the relay…', 'جارٍ التحقق من المُرحِّل…'],
      'Associer un pont': ['Link a bridge', 'ربط جسر'],
      'Associer ce pont maintenant': ['Link this bridge now', 'ربط هذا الجسر الآن'],
      'Connexion directe à l’imprimante depuis l’app Kiwi.': ['Direct connection to the printer from the Kiwi app.', 'اتصال مباشر بالطابعة من تطبيق Kiwi.'],
      'Vérification du pont…': ['Checking the bridge…', 'جارٍ التحقق من الجسر…'],
      'Pont détecté': ['Bridge found', 'تم العثور على الجسر'],
      'mettez à jour Kiwi Printer Bridge pour sécuriser cette caisse.': ['update Kiwi Printer Bridge to secure this till.', 'حدّث Kiwi Printer Bridge لتأمين هذا الصندوق.'],
      'Pont connecté': ['Bridge connected', 'الجسر متصل'],
      'impression maintenue, mise à jour de sécurité recommandée': ['printing still works, security update recommended', 'الطباعة مستمرة، يُنصح بتحديث أمني'],
      'Kiwi Printer Bridge non détecté sur cet appareil.': ['Kiwi Printer Bridge not found on this device.', 'لم يتم العثور على Kiwi Printer Bridge على هذا الجهاز.'],
      'Télécharger le pont': ['Download the bridge', 'تنزيل الجسر'],
      'Revérifier': ['Check again', 'إعادة التحقق'],
      'Relais Kiwi': ['Kiwi relay', 'مُرحِّل Kiwi'],
      'pont « {x} » en ligne': ['bridge “{x}” online', 'الجسر «{x}» متصل'],
      'l’imprimante réseau s’imprime via ce pont': ['the network printer prints through this bridge', 'تطبع طابعة الشبكة عبر هذا الجسر'],
      'jamais vu': ['never seen', 'لم يظهر بعد'],
      'vu à l’instant': ['seen just now', 'ظهر للتو'],
      'vu il y a {n} min': ['seen {n} min ago', 'ظهر قبل {n} د'],
      'vu il y a {n} h': ['seen {n} h ago', 'ظهر قبل {n} س'],
      'Relais pas encore activé côté serveur.': ['Relay not turned on on the server yet.', 'لم يتم تفعيل المُرحِّل على الخادم بعد.'],
      'Cet appareil n’est pas reconnu comme la caisse d’un commerce': ['This device is not recognised as a shop’s till', 'هذا الجهاز غير معروف كصندوق لمتجر'],
      'appairez-le d’abord.': ['pair it first.', 'قم بإقرانه أولًا.'],
      'Aucun pont associé à ce commerce.': ['No bridge linked to this shop.', 'لا يوجد جسر مرتبط بهذا المتجر.'],
      '{n} pont en ligne': ['{n} bridge online', '{n} جسر متصل'],
      '{n} ponts en ligne': ['{n} bridges online', '{n} جسور متصلة'],
      'Pont associé mais hors ligne': ['Bridge linked but offline', 'الجسر مرتبط لكنه غير متصل'],
      'lancez Kiwi Printer Bridge sur l’ordinateur du comptoir.': ['start Kiwi Printer Bridge on the counter computer.', 'شغّل Kiwi Printer Bridge على حاسوب الكاونتر.'],
      'Pont': ['Bridge', 'جسر'],
      'en ligne': ['online', 'متصل'],
      'Dissocier': ['Unlink', 'فك الارتباط'],
      'Dissocier ce pont ? Il ne recevra plus les tickets de vos tablettes.': ['Unlink this bridge? It will no longer receive tickets from your tablets.', 'فك ارتباط هذا الجسر؟ لن يستقبل بعد الآن تذاكر أجهزتك اللوحية.'],
      'Pont dissocié': ['Bridge unlinked', 'تم فك ارتباط الجسر'],
      'Sur l’ordinateur du comptoir, lancez Kiwi Printer Bridge puis ouvrez': ['On the counter computer, start Kiwi Printer Bridge, then open', 'على حاسوب الكاونتر، شغّل Kiwi Printer Bridge ثم افتح'],
      'et tapez ce code. Valable {n} min': ['and type this code. Valid for {n} min', 'واكتب هذا الرمز. صالح لمدة {n} د'],
      'une seule fois.': ['one use only.', 'لمرة واحدة فقط.'],
      'Impossible de générer le code': ['Cannot create the code', 'تعذّر إنشاء الرمز'],
      'Association…': ['Linking…', 'جارٍ الربط…'],
      'Ce pont imprime désormais les tickets de vos tablettes': ['This bridge now prints your tablets’ tickets', 'يطبع هذا الجسر الآن تذاكر أجهزتك اللوحية'],
      'pont injoignable': ['bridge unreachable', 'تعذّر الوصول إلى الجسر'],
      'inconnu': ['unknown', 'غير معروف'],

      /* ── l'option avancée · imprimante réseau globale ── */
      'Option avancée · imprimante réseau globale (Wi-Fi / Ethernet)': ['Advanced option · shared network printer (Wi-Fi / Ethernet)', 'خيار متقدم · طابعة شبكة مشتركة (Wi-Fi / Ethernet)'],
      'Impression directe disponible dans l’app Kiwi.': ['Direct printing available in the Kiwi app.', 'الطباعة المباشرة متاحة في تطبيق Kiwi.'],
      'Adresse IP de l’imprimante': ['Printer IP address', 'عنوان IP للطابعة'],
      'Rechercher sur le réseau': ['Search the network', 'البحث في الشبكة'],
      'Détecter les imprimantes du réseau': ['Find printers on the network', 'اكتشاف طابعات الشبكة'],
      'Exporter le diagnostic d’impression': ['Export print diagnostics', 'تصدير تشخيص الطباعة'],
      'Largeur papier': ['Paper width', 'عرض الورق'],
      "Format d'étiquette": ['Label size', 'مقاس الملصق'],
      'Modèle': ['Model', 'الطراز'],
      'Générique (ESC/POS)': ['Generic (ESC/POS)', 'عام (ESC/POS)'],
      "Pilote Windows (utile seulement pour les étiquettes ou si l'USB est refusé) :": ['Windows driver (only needed for labels or if USB is refused):', 'برنامج تشغيل Windows (مفيد فقط للملصقات أو إذا رُفض USB):'],
      'page de téléchargement': ['download page', 'صفحة التنزيل'],
      'Le pont tourne sur l’ordinateur de la caisse et ne communique qu’avec votre imprimante locale.': ['The bridge runs on the till computer and only talks to your local printer.', 'يعمل الجسر على حاسوب الصندوق ولا يتواصل إلا مع طابعتك المحلية.'],
      'Cible actuelle : imprimante système « {x} ». Enregistrer une IP ici la remplacera.': ['Current target: system printer “{x}”. Saving an IP here will replace it.', 'الهدف الحالي: طابعة النظام «{x}». حفظ عنوان IP هنا سيستبدلها.'],
      'Cible actuelle : réseau': ['Current target: network', 'الهدف الحالي: الشبكة'],
      'Aucune cible réseau enregistrée.': ['No network target saved.', 'لا يوجد هدف شبكة محفوظ.'],
      'Saisissez d’abord l’adresse IP de l’imprimante': ['Enter the printer’s IP address first', 'أدخل أولًا عنوان IP للطابعة'],
      'Adresse invalide': ['Invalid address', 'عنوان غير صالح'],
      'attendu : {n} (ou un nom comme EPSON.local)': ['expected: {n} (or a name like EPSON.local)', 'المتوقع: {n} (أو اسم مثل EPSON.local)'],
      'un nombre entre {n} et {n} ({n} en général)': ['a number between {n} and {n} (usually {n})', 'رقم بين {n} و{n} (عادة {n})'],
      'Imprimante enregistrée': ['Printer saved', 'تم حفظ الطابعة'],
      'Une impression est en cours. La recherche démarrera une fois la file au repos.': ['A print is in progress. The search will start once the queue is idle.', 'هناك طباعة جارية. سيبدأ البحث عندما تفرغ قائمة الانتظار.'],
      'Recherche en cours…': ['Searching…', 'جارٍ البحث…'],
      'Pont injoignable': ['Bridge unreachable', 'تعذّر الوصول إلى الجسر'],
      'relancez Kiwi Printer Bridge puis réessayez.': ['restart Kiwi Printer Bridge, then try again.', 'أعد تشغيل Kiwi Printer Bridge ثم أعد المحاولة.'],
      'Détection indisponible sur ce pont': ['Detection not available on this bridge', 'الاكتشاف غير متاح على هذا الجسر'],
      'installez la version {n} ou plus récente.': ['install version {n} or newer.', 'ثبّت الإصدار {n} أو أحدث.'],
      'Recherche impossible': ['Search failed', 'تعذّر البحث'],
      'Aucune imprimante réseau trouvée. Vérifiez qu’elle est allumée et sur le même réseau que cet ordinateur.': ['No network printer found. Check that it is switched on and on the same network as this computer.', 'لم يتم العثور على طابعة شبكة. تحقق من أنها مشغّلة وعلى نفس شبكة هذا الحاسوب.'],
      'Trouvée :': ['Found:', 'تم العثور عليها:'],
      'Trouvées :': ['Found:', 'تم العثور عليها:'],
      'Adresse remplie': ['Address filled in', 'تم ملء العنوان'],
      'imprimez un ticket test puis enregistrez': ['print a test receipt, then save', 'اطبع تذكرة تجريبية ثم احفظ'],
      'Diagnostic indisponible': ['Diagnostics unavailable', 'التشخيص غير متاح'],
      'Diagnostic exporté': ['Diagnostics exported', 'تم تصدير التشخيص'],
      'Export impossible': ['Cannot export', 'تعذّر التصدير'],
      'Réseau local refusé. Kiwi garde la dernière adresse. Ouvrez Réglages > Kiwi Pro > Réseau local.': ['Local network refused. Kiwi keeps the last address. Open Settings > Kiwi Pro > Local Network.', 'تم رفض الشبكة المحلية. يحتفظ Kiwi بآخر عنوان. افتح الإعدادات > Kiwi Pro > الشبكة المحلية.'],
      'Plusieurs imprimantes ont répondu. Ouvrez Imprimante et choisissez la bonne adresse.': ['Several printers answered. Open Printer and choose the right address.', 'استجابت عدة طابعات. افتح الطابعة واختر العنوان الصحيح.'],
      'Imprimante retrouvée sur {x}. La file reprend automatiquement.': ['Printer found again at {x}. The queue resumes automatically.', 'تم العثور على الطابعة مجددًا على {x}. تستأنف قائمة الانتظار تلقائيًا.'],
      /* La largeur du rouleau (assets/escpos.js · paperWidths). */
      '{n} mm': ['{n} mm', '{n} مم'],
      '{n} mm (standard)': ['{n} mm (standard)', '{n} مم (قياسي)'],
      '{n} mm (matricielle / cuisine)': ['{n} mm (dot matrix / kitchen)', '{n} مم (نقطية / مطبخ)'],
      '{n} mm (large)': ['{n} mm (wide)', '{n} مم (عريض)'],
      '{n} mm (étiquettes)': ['{n} mm (labels)', '{n} مم (ملصقات)'],

      /* ── les raisons d'un échec (frReason) ── */
      'Pont introuvable': ['Bridge not found', 'الجسر غير موجود'],
      'lancez Kiwi Printer Bridge sur cet ordinateur, ou associez un pont au relais Kiwi pour imprimer depuis une tablette': ['start Kiwi Printer Bridge on this computer, or link a bridge to the Kiwi relay to print from a tablet', 'شغّل Kiwi Printer Bridge على هذا الحاسوب، أو اربط جسرًا بمُرحِّل Kiwi للطباعة من جهاز لوحي'],
      'Ce pont doit être mis à jour': ['This bridge needs an update', 'يجب تحديث هذا الجسر'],
      'installez la dernière version de Kiwi Printer Bridge puis revérifiez': ['install the latest Kiwi Printer Bridge, then check again', 'ثبّت أحدث إصدار من Kiwi Printer Bridge ثم أعد التحقق'],
      'Cette imprimante doit être enregistrée dans le pont': ['This printer must be saved in the bridge', 'يجب حفظ هذه الطابعة في الجسر'],
      'relancez le test depuis ce poste': ['run the test again from this station', 'أعد الاختبار من هذا الجهاز'],
      'Le pont refuse cette cible réseau': ['The bridge refuses this network target', 'يرفض الجسر هدف الشبكة هذا'],
      'utilisez une imprimante locale au poste du comptoir': ['use a printer local to the counter station', 'استخدم طابعة محلية في جهاز الكاونتر'],
      'Le ticket a peut-être déjà été imprimé': ['The ticket may already have printed', 'ربما تمت طباعة التذكرة بالفعل'],
      'vérifiez le papier avant toute reprise manuelle': ['check the paper before any manual retry', 'تحقق من الورق قبل أي إعادة يدوية'],
      'Aucun pont en ligne pour le relais Kiwi': ['No bridge online for the Kiwi relay', 'لا يوجد جسر متصل لمُرحِّل Kiwi'],
      'vérifiez que Kiwi Printer Bridge tourne sur l’ordinateur du comptoir': ['check that Kiwi Printer Bridge is running on the counter computer', 'تحقق من أن Kiwi Printer Bridge يعمل على حاسوب الكاونتر'],
      'Relais d’impression pas encore activé côté serveur': ['Print relay not turned on on the server yet', 'لم يتم تفعيل مُرحِّل الطباعة على الخادم بعد'],
      'Caisse non reconnue': ['Till not recognised', 'الصندوق غير معروف'],
      'appairez-la ou reconnectez-vous': ['pair it or sign in again', 'قم بإقرانه أو سجّل الدخول من جديد'],
      'Le pont n’a pas récupéré le ticket à temps': ['The bridge did not pick up the ticket in time', 'لم يستلم الجسر التذكرة في الوقت المناسب'],
      'Aucune imprimante configurée': ['No printer set up', 'لم يتم إعداد أي طابعة'],
      'Accès au réseau local refusé. Ouvrez Réglages > Kiwi Pro > Réseau local': ['Local network access denied. Open Settings > Kiwi Pro > Local Network', 'تم رفض الوصول إلى الشبكة المحلية. افتح الإعدادات > Kiwi Pro > الشبكة المحلية'],
      'Connexion refusée. Vérifiez le port de l’imprimante': ['Connection refused. Check the printer port', 'تم رفض الاتصال. تحقق من منفذ الطابعة'],
      'Imprimante introuvable sur ce réseau': ['Printer not found on this network', 'الطابعة غير موجودة على هذه الشبكة'],
      'Imprimante injoignable': ['Printer unreachable', 'تعذّر الوصول إلى الطابعة'],
      'vérifiez l’adresse IP et qu’elle est allumée': ['check the IP address and that it is switched on', 'تحقق من عنوان IP ومن أنها مشغّلة'],
      'Connexion refusée à cette adresse': ['Connection refused at this address', 'تم رفض الاتصال بهذا العنوان'],
      'ce n’est pas le port d’une imprimante réseau': ['this is not a network printer port', 'هذا ليس منفذ طابعة شبكة'],
      'Adresse introuvable sur le réseau': ['Address not found on the network', 'العنوان غير موجود على الشبكة'],
      'vérifiez l’IP': ['check the IP', 'تحقق من IP'],

      /* ── la mise en garde sous le modèle choisi ── */
      "Les Sunmi sont des terminaux Android à imprimante intégrée : l'impression passe par le terminal, il n'y a pas de pilote Windows à installer.":
        ['Sunmi devices are Android terminals with a built-in printer: printing goes through the terminal, there is no Windows driver to install.', 'أجهزة Sunmi هي محطات Android بطابعة مدمجة: تتم الطباعة عبر الجهاز، ولا يوجد برنامج تشغيل Windows لتثبيته.'],
      "Goojprt ne publie pas de page de téléchargement officielle joignable. Ces modèles sont de l'ESC/POS générique : connectez-les en Bluetooth ou en USB, aucun pilote n'est nécessaire.":
        ['Goojprt publishes no reachable official download page. These models are generic ESC/POS: connect them over Bluetooth or USB, no driver is needed.', 'لا تنشر Goojprt صفحة تنزيل رسمية متاحة. هذه الطرازات تعمل بـ ESC/POS العام: اربطها عبر Bluetooth أو USB، ولا حاجة لأي برنامج تشغيل.'],
      "Zjiang ne publie pas de page de téléchargement officielle joignable. Ces imprimantes sont de l'ESC/POS générique : connectez-les en Bluetooth ou en USB, aucun pilote n'est nécessaire.":
        ['Zjiang publishes no reachable official download page. These printers are generic ESC/POS: connect them over Bluetooth or USB, no driver is needed.', 'لا تنشر Zjiang صفحة تنزيل رسمية متاحة. هذه الطابعات تعمل بـ ESC/POS العام: اربطها عبر Bluetooth أو USB، ولا حاجة لأي برنامج تشغيل.'],
      "SNBC ne publie pas de page de téléchargement officielle joignable depuis le Maroc. En Bluetooth ou en USB, aucun pilote n'est nécessaire.":
        ['SNBC publishes no official download page reachable from Morocco. Over Bluetooth or USB, no driver is needed.', 'لا تنشر SNBC صفحة تنزيل رسمية متاحة من المغرب. عبر Bluetooth أو USB، لا حاجة لأي برنامج تشغيل.'],
      "WD8260 (reçus, 80 mm) : ESC/POS confirmé sur la plaque, rien à régler. WD8210 (étiquettes, 110 mm) : le langage n'est pas indiqué · beaucoup d'imprimantes d'étiquettes parlent TSPL. Faites un ticket test avant la mise en service.":
        ['WD8260 (receipts, 80 mm): ESC/POS confirmed on the label, nothing to set. WD8210 (labels, 110 mm): the language is not stated · many label printers speak TSPL. Print a test receipt before going live.', 'WD8260 (إيصالات، 80 مم): ESC/POS مؤكد على اللوحة، لا شيء لضبطه. WD8210 (ملصقات، 110 مم): اللغة غير مذكورة · كثير من طابعات الملصقات تستخدم TSPL. اطبع تذكرة تجريبية قبل التشغيل.'],
      "Les Star impriment en mode Star Line, pas en ESC/POS. Activez l'émulation ESC/POS sur l'imprimante, sinon le ticket sortira illisible.":
        ['Star printers print in Star Line mode, not ESC/POS. Turn on ESC/POS emulation on the printer, or the receipt will come out unreadable.', 'تطبع طابعات Star بوضع Star Line وليس ESC/POS. فعّل محاكاة ESC/POS على الطابعة، وإلا ستخرج التذكرة غير مقروءة.'],
      'Les Zebra parlent ZPL, pas ESC/POS : Kiwi ne peut pas les piloter directement en Bluetooth ni en USB. Pour vos étiquettes, installez le pilote Zebra sur la caisse et utilisez le bouton « Imprimer » (impression navigateur).':
        ['Zebra printers speak ZPL, not ESC/POS: Kiwi cannot drive them directly over Bluetooth or USB. For your labels, install the Zebra driver on the till and use the “Print” button (browser printing).', 'تستخدم طابعات Zebra لغة ZPL وليس ESC/POS: لا يستطيع Kiwi التحكم فيها مباشرة عبر Bluetooth أو USB. لملصقاتك، ثبّت برنامج تشغيل Zebra على الصندوق واستخدم زر «طباعة» (طباعة المتصفح).'],

      /* ── la clôture de caisse (#cloture-modal) ── */
      'Clôture de caisse': ['Till close-out', 'إغلاق الصندوق'],
      'Service ouvert à': ['Service opened at', 'بداية الخدمة'],
      'Durée du service': ['Service length', 'مدة الخدمة'],
      '{n} mn': ['{n} min', '{n} د'],
      '{n}h {n}': ['{n}h {n}', '{n} س {n} د'],
      'Transactions': ['Transactions', 'المعاملات'],
      'Tables réglées': ['Tables settled', 'الطاولات المسددة'],
      'Total encaissé': ['Total taken', 'إجمالي المحصّل'],
      'dont Carte': ['of which card', 'منها بالبطاقة'],
      'dont Espèces': ['of which cash', 'منها نقدًا'],
      'Réductions accordées': ['Discounts given', 'الخصومات الممنوحة'],
      'Pourboires': ['Tips', 'البقشيش'],
      'Remboursements': ['Refunds', 'المبالغ المستردة'],
      'Autorisations manager': ['Manager approvals', 'موافقات المسؤول'],
      'Passations de caisse': ['Till handovers', 'عمليات تسليم الصندوق'],
      'Tiroir-caisse': ['Cash drawer', 'درج النقود'],
      'Espèces encaissées': ['Cash taken', 'النقد المحصّل'],
      'Pourboires espèces': ['Cash tips', 'البقشيش النقدي'],
      'Entrées de caisse': ['Cash in', 'الإيداعات النقدية'],
      'Sorties de caisse': ['Cash out', 'السحوبات النقدية'],
      'Attendu en caisse': ['Expected in drawer', 'المتوقع في الدرج'],
      'Espèces comptées': ['Cash counted', 'النقد المعدود'],
      'Écart': ['Difference', 'الفرق'],
      'Rapprochement carte': ['Card reconciliation', 'مطابقة البطاقات'],
      'journée commerciale': ['business day', 'يوم العمل'],
      'Total carte Kiwi': ['Kiwi card total', 'مجموع البطاقات في Kiwi'],
      'Total carte du Z terminal': ['Terminal Z card total', 'مجموع بطاقات Z الجهاز'],
      "Recopiez le total carte imprimé par le terminal, même s'il est à zéro.": ['Copy the card total printed by the terminal, even if it is zero.', 'انسخ مجموع البطاقات المطبوع من الجهاز، حتى لو كان صفرًا.'],
      'Résultat': ['Result', 'النتيجة'],
      'À saisir': ['Not entered', 'لم يُدخل بعد'],
      'Montant invalide': ['Invalid amount', 'مبلغ غير صالح'],
      'Rapproché': ['Matched', 'متطابق'],
      'Terminal + {n} MAD': ['Terminal + {n} MAD', 'الجهاز + {n} MAD'],
      'Imprimer le rapport Z': ['Print Z report', 'طباعة تقرير Z'],
      'Fermer la caisse': ['Close the till', 'إغلاق الصندوق'],
      'Clôture en cours…': ['Closing…', 'جارٍ الإغلاق…'],
      'Clôture en cours': ['Closing in progress', 'الإغلاق جارٍ'],
      'patientez quelques secondes': ['wait a few seconds', 'انتظر بضع ثوانٍ'],
      'Continuer le service': ['Continue service', 'متابعة الخدمة'],
      'Fermeture de caisse': ['Closing the till', 'إغلاق الصندوق'],
      /* Le bandeau d'objectif, en démonstration seulement (un vrai commerce n'a
         pas d'objectif fixé sur la caisse). Le montant est dans un <em> : la
         phrase arrive donc en morceaux, chacun traduit à sa place. */
      "Objectif d'lyoum dépassé,": ['Today’s target beaten,', 'تم تجاوز هدف اليوم،'],
      'encaissés. Beau service.': ['collected. Great service.', 'محصّلة. خدمة رائعة.'],
      'À': ['At', 'وصلت إلى'],
      "de l'objectif d'lyoum, {n} MAD restants.": ['of today’s target, {n} MAD to go.', 'من هدف اليوم، يتبقى {n} MAD.'],
      'à bientôt {x}': ['see you soon, {x}', 'إلى اللقاء {x}'],

      /* ── l'écran d'après-clôture (#zsheet-modal) ── */
      'Journée clôturée': ['Day closed', 'تم إغلاق اليوم'],
      'Rapport journalier': ['Daily report', 'التقرير اليومي'],
      'Imprimer le rapport': ['Print the report', 'طباعة التقرير'],
      'Imprimer à nouveau': ['Print again', 'الطباعة مرة أخرى'],
      'Continuer sans imprimer': ['Continue without printing', 'المتابعة دون طباعة'],
      'Le rapport reste disponible dans le tableau de bord, section Rapport journalier · même après un rechargement ou depuis un autre appareil.':
        ['The report stays available in the dashboard, under Daily report · even after a reload or from another device.', 'يبقى التقرير متاحًا في لوحة القيادة، قسم التقرير اليومي · حتى بعد إعادة التحميل أو من جهاز آخر.'],
      '{n} transaction': ['{n} transaction', '{n} معاملة'],
      '{n} transactions': ['{n} transactions', '{n} معاملة'],
      'Z provisoire': ['Provisional Z', 'Z مؤقت'],
      'rapprochement distant incomplet': ['remote reconciliation incomplete', 'المطابقة عن بُعد غير مكتملة'],
      'écart + {n} MAD': ['difference + {n} MAD', 'الفرق + {n} MAD'],
      'écart − {n} MAD': ['difference − {n} MAD', 'الفرق − {n} MAD'],
      'carte rapprochée': ['card matched', 'البطاقة متطابقة'],

      /* ── l'ouverture hors horaires (#hours-gate) ── */
      "Hors horaires d'ouverture": ['Outside opening hours', 'خارج أوقات العمل'],
      'Ouvrir quand même ?': ['Open anyway?', 'الفتح على أي حال؟'],
      'Ouvrir le service': ['Open service', 'فتح الخدمة'],
      "L'ouverture sera enregistrée comme exceptionnelle, avec votre nom et l'heure. Pour changer les horaires habituels, passez par le tableau de bord · Réglages, Heures d'ouverture.":
        ['The opening will be recorded as an exception, with your name and the time. To change the usual hours, go to the dashboard · Settings, Opening hours.', 'سيُسجَّل هذا الفتح كاستثناء، مع اسمك والوقت. لتغيير الأوقات المعتادة، انتقل إلى لوحة القيادة · الإعدادات، أوقات العمل.'],
    };
    Object.keys(S).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = S[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = S[k][1];
    });
  })();

  /* Le bandeau de synchronisation (caisse-pwa.js) et la portée du service
     (« Aucun service ouvert », « 3 serveurs en service ») restaient en français
     sous l'anglais et l'arabe : mesuré le 2026-10-20 par
     tools/french-leak-browser-test.mjs sur la caisse démo. Chaque morceau
     entre deux « · » est traduit seul. */
  (function () {
    var Q = {
      'Aucun service ouvert': ['No shift open', 'لا توجد وردية مفتوحة'],
      'Table absente du plan': ['Table not on the floor plan', 'الطاولة غير موجودة في المخطط'],
      "envoyez d'abord la commande en cuisine": ['send the order to the kitchen first', 'أرسل الطلب إلى المطبخ أولاً'],
      '{n} serveurs en service': ['{n} waiters on shift', '{n} نوادل في الخدمة'],
      '{n} serveur en service': ['{n} waiter on shift', '{n} نادل في الخدمة'],
      '{n} tables en cours': ['{n} tables in progress', '{n} طاولات جارية'],
      '{n} table en cours': ['{n} table in progress', '{n} طاولة جارية'],
      'Synchronisé': ['Synced', 'تمت المزامنة'],
      'Opérations protégées hors ligne': ['Operations kept safe offline', 'العمليات محفوظة دون اتصال'],
      '{n} opération à synchroniser': ['{n} operation to sync', '{n} عملية للمزامنة'],
      '{n} opérations à synchroniser': ['{n} operations to sync', '{n} عمليات للمزامنة'],
      'Envoi sécurisé en cours': ['Sending securely', 'جارٍ الإرسال الآمن'],
      'Serveur non joignable': ['Server unreachable', 'تعذر الوصول إلى الخادم'],
      'Serveur trop lent': ['Server too slow', 'الخادم بطيء جدا'],
      'dernier essai {n}:{n}': ['last try {n}:{n}', 'آخر محاولة {n}:{n}'],
      'nouvel essai automatique': ['retrying automatically', 'إعادة المحاولة تلقائيا'],
      'En attente': ['Waiting', 'قيد الانتظار'],
      'toucher pour réessayer': ['tap to retry', 'المس لإعادة المحاولة'],
      'Journal caisse': ['Till journal', 'سجل الصندوق'],
      'synchronisation en attente': ['sync pending', 'المزامنة معلقة'],
      '{n} événement(s) conservé(s)': ['{n} event(s) kept', '{n} حدث محفوظ'],
      'reprise automatique': ['resumes automatically', 'استئناف تلقائي'],
      'Employé en pause': ['Employee on break', 'الموظف في استراحة'],
      '{n} en attente': ['{n} waiting', '{n} قيد الانتظار'],
      'Reprenez le service pour transmettre': ['Resume the shift to send', 'استأنف الوردية للإرسال'],
      'opérations conservées': ['operations kept', 'العمليات محفوظة'],
      'Service requis': ['Shift required', 'الوردية مطلوبة'],
      'Ouvrez la caisse avec un employé en service': ['Open the till with an employee on shift', 'افتح الصندوق بموظف في الخدمة'],
    };
    Object.keys(Q).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = Q[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = Q[k][1];
    });
  })();

  /* La caisse restaurant reçoit son sélecteur (rail de gauche, 2026-10-13).
     Mesuré sur une vraie caisse appairée passée en anglais puis en arabe :
     ce qui restait en français sur la vente, le plan de salle, la liste
     d'attente, l'encaissement et le partage. Les phrases coupées par une
     balise (« Dessinez vos tables … <b>Plan de salle</b>. Une fois … ») sont
     données morceau par morceau, comme la signature du rail. */
  (function () {
    var R = {
      'Aucun encaissement': ['No payments yet', 'لا مدفوعات بعد'],
      'Client & fidélité': ['Customer & loyalty', 'الزبون والولاء'],
      'Menu': ['Menu', 'القائمة'],
      'Stock': ['Stock', 'المخزون'],
      'Exact': ['Exact', 'المبلغ بالضبط'],
      'Split Bill': ['Split bill', 'تقسيم الحساب'],
      "Diviser l'addition ·": ['Split the bill ·', 'تقسيم الحساب ·'],
      '· vue caissier': ['· cashier view', '· عرض أمين الصندوق'],
      '· file des arrivées': ['· arrivals queue', '· طابور الوافدين'],
      'Plan de salle pas encore conçu': ['Floor plan not designed yet', 'مخطط القاعة لم يُصمَّم بعد'],
      'Dessinez vos tables depuis votre tableau de bord ·': ['Draw your tables from your dashboard ·', 'ارسم طاولاتك من لوحة القيادة ·'],
      '. Une fois conçu, il apparaîtra ici automatiquement.': ['. Once designed, it will appear here automatically.', '. بعد تصميمه، سيظهر هنا تلقائيًا.'],
      /* La pastille du journal de caisse (assets/caisse-pwa.js), coupée sur « · ». */
      'Journal caisse': ['Till journal', 'سجل الصندوق'],
      'synchronisation en attente': ['sync pending', 'المزامنة معلّقة'],
      'preuve terminal refusée': ['terminal proof refused', 'رُفض إثبات الجهاز'],
      'appairage requis': ['pairing required', 'الربط مطلوب'],
      '{n} événement(s) conservé(s)': ['{n} event(s) kept', '{n} حدث محفوظ'],
      'reprise automatique': ['resumes automatically', 'استئناف تلقائي'],
      'toucher pour réparer': ['tap to repair', 'المس للإصلاح'],
      '{n} vente(s) à synchroniser': ['{n} sale(s) to sync', '{n} بيع للمزامنة'],
      'ventes synchronisées': ['sales synced', 'المبيعات متزامنة'],
      /* Libellés d'accessibilité et infobulles du rail et de l'addition. */
      'Caisse': ['Till', 'الصندوق'],
      'Mode caisse': ['Till mode', 'وضع الصندوق'],
      'Stats du shift': ['Shift stats', 'إحصاءات الخدمة'],
      'Ouvrir le journal des ventes': ['Open the sales journal', 'فتح سجل المبيعات'],
      'Hub non activé': ['Hub not enabled', 'المحور غير مفعّل'],
      'Impression automatique prête': ['Automatic printing ready', 'الطباعة التلقائية جاهزة'],
      '{n} ticket(s) en attente': ['{n} ticket(s) waiting', '{n} تذكرة في الانتظار'],
      'Recharger la caisse': ['Reload the till', 'إعادة تحميل الصندوق'],
      'dépannage uniquement, synchronisation automatique': ['troubleshooting only, sync is automatic', 'للإصلاح فقط، المزامنة تلقائية'],
      'Recharger la page de la caisse': ['Reload the till page', 'إعادة تحميل صفحة الصندوق'],
      'dépannage': ['troubleshooting', 'إصلاح'],
      'Basculer le plein écran': ['Toggle fullscreen', 'تبديل ملء الشاشة'],
      'Retirer un': ['Remove one', 'إزالة واحد'],
      'Ajouter un': ['Add one', 'إضافة واحد'],
      'Plus': ['More', 'أكثر'],
      'Cliquer pour voir le détail complet de la commande': ['Click to see the full order details', 'انقر لعرض تفاصيل الطلب كاملة'],
      'Vérifier la commande complète avec détails': ['Review the full order with details', 'مراجعة الطلب كاملًا مع التفاصيل'],
      'Note cuisine, {x}': ['Kitchen note, {x}', 'ملاحظة للمطبخ، {x}'],
      'Encaisser en espèces': ['Take cash', 'الدفع نقداً'],
    };
    Object.keys(R).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = R[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = R[k][1];
    });
  })();

  /* La caisse boutique, page par page (french-leak-browser-test, 2026-10-20) :
     Vendus (assets/sold-insights.js), Scan, Inventaire, Échanges et Acomptes
     (assets/retail-balances.js) restaient en français sous l'anglais et
     l'arabe. Les noms d'articles, de rayons et de clientes ne passent pas ici. */
  (function () {
    var B = {
      /* Vendus */
      'Vendus': ['Sold', 'المبيعات'],
      'Stock vendu, catégories et détail des tickets': ['Stock sold, categories and receipt details', 'المخزون المباع والفئات وتفاصيل التذاكر'],
      'synchronisation…': ['syncing…', 'جارٍ المزامنة…'],
      'Pièces vendues': ['Pieces sold', 'القطع المباعة'],
      'Produits actifs': ['Active products', 'المنتجات النشطة'],
      'Tickets analysés': ['Receipts analysed', 'التذاكر المحللة'],
      'Chiffre produits': ['Product revenue', 'رقم معاملات المنتجات'],
      'Produits': ['Products', 'المنتجات'],
      'Quantité, chiffre et dernière vente': ['Quantity, revenue and last sale', 'الكمية ورقم المعاملات وآخر بيع'],
      'dernière vente {x}': ['last sold {x}', 'آخر بيع {x}'],
      'pce': ['pc', 'قطعة'], 'pces': ['pcs', 'قطع'],
      'pièce': ['piece', 'قطعة'], 'pièces': ['pieces', 'قطع'],
      'Produits vendus ensemble': ['Products sold together', 'منتجات تُباع معًا'],
      'Associations constatées sur les tickets': ['Pairings seen on receipts', 'اقترانات لوحظت في التذاكر'],
      'Même ticket': ['Same receipt', 'نفس التذكرة'],
      'Aucune association répétée pour l’instant.': ['No repeated pairing yet.', 'لا يوجد اقتران متكرر حتى الآن.'],
      'Catégories': ['Categories', 'الفئات'],
      'Contribution par rayon': ['Contribution by department', 'المساهمة حسب القسم'],
      'Historique détaillé': ['Detailed history', 'السجل المفصل'],
      'Quand et dans quel panier chaque produit a été vendu': ['When and in which basket each product was sold', 'متى وفي أي سلة بيع كل منتج'],
      'Aucune vente détaillée aujourd’hui': ['No detailed sale today', 'لا توجد مبيعات مفصلة اليوم'],
      'Aucune vente détaillée sur les {n} derniers jours': ['No detailed sale in the last {n} days', 'لا توجد مبيعات مفصلة خلال آخر {n} يومًا'],
      'Dès qu’un ticket est encaissé à la caisse avec ses produits, il apparaît ici : quantités, catégories, paniers associés et recommandations.':
        ['As soon as a receipt with its products is paid at the till, it shows here: quantities, categories, baskets bought together and recommendations.',
         'بمجرد أداء تذكرة في الصندوق مع منتجاتها، تظهر هنا: الكميات والفئات والسلال المرتبطة والتوصيات.'],
      'Jour exact': ['Exact day', 'اليوم بالضبط'],
      'Choisissez la date.': ['Choose the date.', 'اختر التاريخ.'],
      'La fin doit venir après le début.': ['The end must come after the start.', 'يجب أن تأتي النهاية بعد البداية.'],
      'La période ne peut pas finir dans le futur.': ['The period cannot end in the future.', 'لا يمكن أن تنتهي الفترة في المستقبل.'],
      /* Scan */
      'Scan produit': ['Product scan', 'فحص المنتج'],
      "Scannez un article pour voir son prix, ses tailles et son stock. Rien n'est ajouté au ticket.":
        ['Scan an item to see its price, sizes and stock. Nothing is added to the ticket.', 'امسح منتجًا لرؤية سعره ومقاساته ومخزونه. لا يُضاف أي شيء إلى التذكرة.'],
      "Aucun article vérifié pour l'instant, la douchette USB tape ici toute seule.":
        ['No item checked yet. The USB scanner types here on its own.', 'لم يتم فحص أي منتج بعد، قارئ الباركود USB يكتب هنا تلقائيًا.'],
      'Scanner un article (douchette démo)': ['Scan an item (demo scanner)', 'امسح منتجًا (قارئ تجريبي)'],
      /* Inventaire */
      'Douchette + imprimante étiquettes': ['Scanner + label printer', 'قارئ الباركود + طابعة الملصقات'],
      '{n} variantes, base partagée avec le dashboard': ['{n} variants, shared with the dashboard', '{n} متغيرات، قاعدة مشتركة مع لوحة التحكم'],
      '{n} variante, base partagée avec le dashboard': ['{n} variant, shared with the dashboard', '{n} متغير، قاعدة مشتركة مع لوحة التحكم'],
      'Pièces en stock': ['Pieces in stock', 'القطع في المخزون'],
      /* Échanges & avoirs */
      'Voir': ['View', 'عرض'],
      'remise −{n} %': ['−{n} % off', 'خصم −{n} %'],
      '· remise −{n} %': ['· −{n} % off', '· خصم −{n} %'],
      /* Acomptes */
      'PAIEMENTS ÉCHELONNÉS': ['INSTALMENT PAYMENTS', 'الأداء بالتقسيط'],
      'Acomptes': ['Deposits', 'التسبيقات'],
      'Retrouvez une note ouverte et encaissez son solde. Chaque paiement compte le jour où il est reçu.':
        ['Find an open tab and collect its balance. Each payment counts on the day it is received.', 'ابحث عن حساب مفتوح واستخلص رصيده. يُحتسب كل أداء في يوم استلامه.'],
      'Cliente ou numéro de ticket': ['Customer or receipt number', 'الزبونة أو رقم التذكرة'],
      'Chercher une cliente ou un ticket…': ['Search a customer or a receipt…', 'ابحث عن زبونة أو تذكرة…'],
      'Chercher une cliente ou un ticket': ['Search a customer or a receipt', 'ابحث عن زبونة أو تذكرة'],
      'Aucune note ouverte pour cette recherche.': ['No open tab for this search.', 'لا يوجد حساب مفتوح لهذا البحث.'],
      'Reste {n} MAD': ['{n} MAD left to pay', 'الباقي {n} MAD'],
      'Synchronisation en attente': ['Sync pending', 'المزامنة قيد الانتظار'],
    };
    Object.keys(B).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = B[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = B[k][1];
    });
  })();

  /* L'épicerie (assets/pos-epicerie.js, Kiwi Basic), écran par écran, feuille
     par feuille (2026-10-21) : vente, pesée, recherche, paiement, ardoise,
     carnet de crédit, règlement, rappel WhatsApp, stock rapide et journée
     restaient en français sous l'anglais et l'arabe. Les produits, rayons,
     voisins et le texte du rappel (il part chez le voisin) ne passent pas ici. */
  (function () {
    var E = {
      'Épicerie': ['Grocery', 'بقالة'],
      'Carnet de crédit': ['Credit book', 'دفتر الديون'],
      'Stock rapide': ['Quick stock', 'المخزون السريع'],
      'un seul compte.': ['one account.', 'حساب واحد.'],
      'Scanner (démo)': ['Scan (demo)', 'مسح (عرض تجريبي)'],
      'Activer la douchette': ['Turn on the scanner', 'تفعيل قارئ الباركود'],
      'Simuler une coupure réseau (démo)': ['Simulate a network outage (demo)', 'محاكاة انقطاع الشبكة (عرض تجريبي)'],
      'État du réseau et des ventes en attente d’envoi': ['Network status and sales waiting to be sent', 'حالة الشبكة والمبيعات في انتظار الإرسال'],
      'Scannez ou tapez le code-barres…': ['Scan or type the barcode…', 'امسح الباركود أو اكتبه…'],
      'Scannez un produit, ou touchez-le dans la grille.': ['Scan a product, or tap it in the grid.', 'امسح منتجًا أو المسه في الشبكة.'],
      'essayez « Scanner » pour la démo': ['try « Scan » for the demo', 'جرّب « مسح » في العرض التجريبي'],
      '/ pièce': ['/ each', '/ للقطعة'],
      'à l\'unité': ['by the piece', 'بالقطعة'],
      'au poids': ['by weight', 'بالوزن'],
      'Ardoise': ['Tab', 'دين'],
      'ardoise': ['tab', 'دين'],
      'mettre au carnet': ['put on the book', 'تسجيل في الدفتر'],
      'Rupture': ['Out of stock', 'نفد المخزون'],
      'ajoutez-le au réassort dans Stock rapide.': ['add it to the restock list in Quick stock.', 'أضفه إلى لائحة إعادة التزويد في المخزون السريع.'],
      '{n} MAD / kg, sur la balance': ['{n} MAD / kg, on the scale', '{n} MAD / كغ، على الميزان'],
      '{n} MAD / L, sur la balance': ['{n} MAD / L, on the scale', '{n} MAD / ل، على الميزان'],
      'À payer': ['To pay', 'للأداء'],
      'Ajouter au ticket': ['Add to ticket', 'أضف إلى التذكرة'],
      'Mettre à jour': ['Update', 'تحديث'],
      'Chercher un produit': ['Find a product', 'ابحث عن منتج'],
      'Quand le code ne passe pas, par nom, rayon ou télécom.': ['When the code will not scan, by name, aisle or top-up.', 'عندما لا يُقرأ الرمز، بالاسم أو الرف أو التعبئة.'],
      'Coca, lait, recharge inwi…': ['Coca, milk, inwi top-up…', 'كوكا، حليب، تعبئة inwi…'],
      'Lecture du code-barres…': ['Reading the barcode…', 'جارٍ قراءة الباركود…'],
      'Présentez l\'article devant la douchette.': ['Hold the item in front of the scanner.', 'قدّم المنتج أمام قارئ الباركود.'],
      'Espèces, rendu calculé': ['Cash, change worked out', 'نقدًا، مع حساب الباقي'],
      'Montant envoyé au lecteur partenaire': ['Amount sent to the partner reader', 'المبلغ المرسل إلى القارئ الشريك'],
      'Mettre à l\'ardoise': ['Put on the tab', 'تسجيل كدين'],
      'Au carnet d\'un voisin, réglé plus tard': ['On a neighbour\'s book, paid later', 'في دفتر أحد الجيران، يُؤدّى لاحقًا'],
      'Confirmer l’encaissement': ['Confirm payment', 'تأكيد الاستخلاص'],
      'lecteur partenaire, Kiwi affiche, le lecteur encaisse': ['partner reader, Kiwi shows the amount, the reader takes the payment', 'قارئ شريك، يعرض Kiwi المبلغ ويستخلص القارئ'],
      'Montant envoyé au lecteur': ['Amount sent to the reader', 'المبلغ المرسل إلى القارئ'],
      'Lecteur partenaire, paiement sur votre terminal': ['Partner reader, payment on your terminal', 'قارئ شريك، الأداء على جهازك'],
      'sur le carnet de quel voisin ?': ['on which neighbour\'s book?', 'في دفتر أي جار؟'],
      'Nouveau voisin sur le carnet': ['New neighbour on the book', 'جار جديد في الدفتر'],
      'Nouveau voisin': ['New neighbour', 'جار جديد'],
      'On ouvre une ardoise, {n} MAD dessus.': ['We open a tab with {n} MAD on it.', 'نفتح حسابًا عليه {n} MAD.'],
      'Ouvrir l\'ardoise': ['Open the tab', 'فتح الحساب'],
      'Nom (ex. Mme Naïma)': ['Name (e.g. Mme Naïma)', 'الاسم (مثلًا السيدة نعيمة)'],
      '06… / +33… (rappel WhatsApp)': ['06… / +33… (WhatsApp reminder)', '06… / +33… (تذكير واتساب)'],
      'Sur l\'ardoise de {x}': ['On {x}\'s tab', 'في حساب {x}'],
      'solde {n} MAD': ['balance {n} MAD', 'الرصيد {n} MAD'],
      'L\'ardoise du quartier, fini le cahier sous le comptoir': ['The neighbourhood tab, no more notebook under the counter', 'دين الحي، بلا دفتر تحت الكونتوار'],
      'On nous doit, en tout': ['Owed to us, in total', 'المستحق لنا في المجموع'],
      'Nom ou téléphone du voisin…': ['Neighbour\'s name or phone…', 'اسم الجار أو هاتفه…'],
      'Aucun voisin pour « {x} ».': ['No neighbour for « {x} ».', 'لا يوجد جار لـ « {x} ».'],
      'Le carnet est vide, personne n’a de crédit en cours.': ['The book is empty, nobody owes anything.', 'الدفتر فارغ، لا أحد عليه دين.'],
      '{n} mouvement': ['{n} entry', '{n} حركة'],
      '{n} mouvements': ['{n} entries', '{n} حركات'],
      'à jour': ['up to date', 'مسدَّد'],
      'depuis hier': ['since yesterday', 'منذ الأمس'],
      'depuis aujourd\'hui': ['since today', 'منذ اليوم'],
      'depuis il y a {n} j': ['for {n} days', 'منذ {n} أيام'],
      'depuis il y a 1 semaine': ['for a week', 'منذ أسبوع'],
      'depuis il y a {n} semaines': ['for {n} weeks', 'منذ {n} أسابيع'],
      'depuis il y a 1 mois': ['for a month', 'منذ شهر'],
      'depuis il y a {n} mois': ['for {n} months', 'منذ {n} أشهر'],
      'dû depuis hier': ['owed since yesterday', 'مستحق منذ الأمس'],
      'dû depuis aujourd\'hui': ['owed since today', 'مستحق منذ اليوم'],
      'dû depuis il y a {n} j': ['owed for {n} days', 'مستحق منذ {n} أيام'],
      'dû depuis il y a 1 semaine': ['owed for a week', 'مستحق منذ أسبوع'],
      'dû depuis il y a {n} semaines': ['owed for {n} weeks', 'مستحق منذ {n} أسابيع'],
      'dû depuis il y a 1 mois': ['owed for a month', 'مستحق منذ شهر'],
      'dû depuis il y a {n} mois': ['owed for {n} months', 'مستحق منذ {n} أشهر'],
      'il y a {n} j': ['{n} days ago', 'منذ {n} أيام'],
      'il y a 1 semaine': ['a week ago', 'منذ أسبوع'],
      'il y a {n} semaines': ['{n} weeks ago', 'منذ {n} أسابيع'],
      'il y a 1 mois': ['a month ago', 'منذ شهر'],
      'il y a {n} mois': ['{n} months ago', 'منذ {n} أشهر'],
      'Historique du carnet': ['Book history', 'سجل الدفتر'],
      'Règlement': ['Repayment', 'أداء'],
      'Règlement (soldé)': ['Repayment (settled)', 'أداء (مسدَّد)'],
      'Rappel WhatsApp': ['WhatsApp reminder', 'تذكير واتساب'],
      'Ajouter une dette': ['Add a debt', 'إضافة دين'],
      'Règlement, {x}': ['Repayment, {x}', 'أداء، {x}'],
      'Solde de l\'ardoise': ['Tab balance', 'رصيد الحساب'],
      'Tout régler': ['Settle in full', 'أداء الكل'],
      'Solde le carnet, remis à zéro': ['Clears the book back to zero', 'يُصفّي الدفتر إلى الصفر'],
      'Règlement partiel': ['Partial repayment', 'أداء جزئي'],
      'Règlement total': ['Full repayment', 'أداء كامل'],
      'Le voisin donne ce qu\'il peut aujourd\'hui': ['The neighbour pays what they can today', 'يؤدي الجار ما يستطيع اليوم'],
      'Montant réglé aujourd\'hui': ['Amount paid today', 'المبلغ المؤدى اليوم'],
      'moitié': ['half', 'النصف'],
      'tout': ['all', 'الكل'],
      'Encaisser le règlement': ['Take the repayment', 'استخلاص الأداء'],
      'Ton volontairement très poli, c\'est un voisin, pas un débiteur.': ['Deliberately very polite: a neighbour, not a debtor.', 'نبرة مهذبة جدًا عن قصد، إنه جار وليس مدينًا.'],
      'Plus tard': ['Later', 'لاحقًا'],
      'Envoyer sur WhatsApp': ['Send on WhatsApp', 'إرسال عبر واتساب'],
      'Ajouter au carnet de {x}': ['Add to {x}\'s book', 'إضافة إلى دفتر {x}'],
      'Un achat à crédit sans passer par la caisse (pain, lait…).': ['A purchase on credit without going through the till (bread, milk…).', 'شراء بالدين دون المرور بالصندوق (خبز، حليب…).'],
      'Mettre au carnet': ['Put on the book', 'تسجيل في الدفتر'],
      'Ce qui manque pour la tournée du grossiste, un coup d\'œil, une liste': ['What\'s missing for the wholesaler run: one look, one list', 'ما ينقص لجولة تاجر الجملة: نظرة واحدة، لائحة واحدة'],
      'Bientôt épuisé': ['Running low', 'على وشك النفاد'],
      'Bien approvisionné': ['Well stocked', 'متوفر بشكل جيد'],
      'Stock non suivi': ['Stock not tracked', 'مخزون غير متتبَّع'],
      'Kiwi ne connaît pas encore vos quantités en rayon, rien n’est annoncé « bientôt épuisé ». Touchez « + » sur ce qu’il vous faut commander.': ['Kiwi does not know your shelf quantities yet, so nothing is flagged « running low ». Tap « + » on what you need to order.', 'لا يعرف Kiwi بعد كمياتك على الرفوف، لذلك لا يُعلَن أي منتج « على وشك النفاد ». المس « + » على ما تحتاج إلى طلبه.'],
      'reste {n} à l\'unité': ['{n} left, by the piece', 'الباقي {n} بالقطعة'],
      'reste {n} en rayon': ['{n} left on the shelf', 'الباقي {n} على الرف'],
      'reste {n} kg': ['{n} kg left', 'الباقي {n} كغ'],
      'reste {n}': ['{n} left', 'الباقي {n}'],
      'stock non suivi': ['stock not tracked', 'مخزون غير متتبَّع'],
      'seuil {n}': ['threshold {n}', 'الحد {n}'],
      'Ajouter au réassort': ['Add to restock', 'أضف إلى إعادة التزويد'],
      'Déjà sur la liste': ['Already on the list', 'موجود في اللائحة'],
      'Liste de réassort': ['Restock list', 'لائحة إعادة التزويد'],
      'Pour Si Brahim quand il va au grossiste du Souk.': ['For Si Brahim\'s trip to the Souk wholesaler.', 'لسي إبراهيم حين يذهب إلى تاجر الجملة في السوق.'],
      'Pour votre prochain passage chez le grossiste.': ['For your next trip to the wholesaler.', 'لزيارتك القادمة لتاجر الجملة.'],
      'Ajoutez ce qui manque.': ['Add what\'s missing.', 'أضف ما ينقص.'],
      'Liste vide.': ['Empty list.', 'اللائحة فارغة.'],
      'Touchez « + » sur un produit qui manque.': ['Tap « + » on a missing product.', 'المس « + » على منتج ناقص.'],
      'Références': ['Items', 'المراجع'],
      'Préparer le bon': ['Prepare the order', 'تحضير الطلبية'],
      'Vider la liste': ['Clear the list', 'إفراغ اللائحة'],
      'Recette encaissée': ['Takings collected', 'المداخيل المحصلة'],
      '{n} ticket aujourd\'hui': ['{n} receipt today', '{n} تذكرة اليوم'],
      '{n} tickets aujourd\'hui': ['{n} receipts today', '{n} تذاكر اليوم'],
      'Crédit en cours dehors': ['Credit still out', 'الديون غير المسترجعة'],
      '{n} voisin': ['{n} neighbour', '{n} جار'],
      '{n} voisins': ['{n} neighbours', '{n} جيران'],
      '+{n} MAD mis aujourd\'hui': ['+{n} MAD added today', '+{n} MAD أضيفت اليوم'],
      'Caisse + à recouvrer': ['Till + to collect', 'الصندوق + ما يجب استخلاصه'],
      'si tout le carnet rentrait': ['if the whole book were paid', 'لو استُرجع كل الدفتر'],
      'Top produits du jour': ['Top products today', 'أفضل منتجات اليوم'],
      'qté vendue': ['qty sold', 'الكمية المباعة'],
      'unités': ['units', 'وحدات'],
      'pesées': ['weighings', 'وزنات'],
      'Comment on a été payé': ['How we were paid', 'كيف تم الأداء'],
      'Mis à l\'ardoise': ['Put on the tab', 'سُجِّل كدين'],
      'À recouvrer': ['To collect', 'للاستخلاص'],
      'Ajouter au ticket ·': ['Add to ticket ·', 'أضف إلى التذكرة ·'],
      'Mettre à jour ·': ['Update ·', 'تحديث ·'],
      'Afficher le ticket': ['Show the ticket', 'عرض التذكرة'],
      'Scan continu': ['Continuous scan', 'مسح مستمر'],
      'Enregistré sur la caisse': ['Saved on the till', 'محفوظ في الصندوق'],
      'envoi au retour du réseau': ['sent when the network is back', 'يُرسل عند عودة الشبكة'],
      'Enregistré hors-ligne': ['Saved offline', 'محفوظ دون اتصال'],
      '{n} en attente': ['{n} waiting', '{n} في الانتظار'],
      'Prix non renseigné': ['No price set', 'لم يُحدَّد السعر'],
      'fixez-le dans le tableau de bord (Stock).': ['set it in the dashboard (Stock).', 'حدّده في لوحة القيادة (المخزون).'],
      'Ajouté': ['Added', 'تمت الإضافة'],
      'Code « {x} » inconnu, cherchez le produit': ['Unknown code « {x} », search for the product', 'رمز غير معروف « {x} »، ابحث عن المنتج'],
      'Encaissé': ['Collected', 'تم الاستخلاص'],
      'rendu {n} MAD': ['change {n} MAD', 'الباقي {n} MAD'],
      'reste {n} MAD sur l\'ardoise': ['{n} MAD left on the tab', 'الباقي {n} MAD في الحساب'],
      'Ardoise soldée': ['Tab settled', 'تم تسديد الحساب'],
      "l'lah ikhellik": ['thank you', 'الله يخليك'],
      'Le nom est requis pour ouvrir une ardoise': ['A name is needed to open a tab', 'الاسم مطلوب لفتح حساب'],
      'Montant invalide': ['Invalid amount', 'مبلغ غير صالح'],
      'Ajoutez un numéro à la fiche de {x}': ['Add a number to {x}\'s card', 'أضف رقمًا إلى بطاقة {x}'],
      'WhatsApp ouvert pour {x}, appuyez sur envoyer': ['WhatsApp opened for {x}, tap send', 'تم فتح واتساب لـ {x}، اضغط إرسال'],
      'Impossible d’ouvrir WhatsApp': ['Could not open WhatsApp', 'تعذّر فتح واتساب'],
      'Brouillon créé': ['Draft created', 'تم إنشاء مسودة'],
      'Brouillon {x}': ['Draft {x}', 'مسودة {x}'],
      'texte copié': ['text copied', 'تم نسخ النص'],
      'Liste de réassort copiée': ['Restock list copied', 'تم نسخ لائحة إعادة التزويد'],
      '{n} référence': ['{n} item', '{n} مرجع'],
      '{n} références': ['{n} items', '{n} مراجع'],
      'Retiré du réassort': ['Removed from restock', 'أُزيل من إعادة التزويد'],
      'Ajouté au réassort': ['Added to restock', 'أُضيف إلى إعادة التزويد'],
      'Champ actif · scannez avec la douchette ou tapez le code': ['Field ready · scan with the reader or type the code', 'الحقل جاهز · امسح بالقارئ أو اكتب الرمز'],
      'Réseau de retour, {n} action synchronisée': ['Network back, {n} action synced', 'عادت الشبكة، تمت مزامنة {n} عملية'],
      'Réseau de retour, {n} actions synchronisées': ['Network back, {n} actions synced', 'عادت الشبكة، تمت مزامنة {n} عمليات'],
      'Mode hors-ligne, la caisse continue, tout est mis en file': ['Offline mode, the till keeps going, everything is queued', 'وضع دون اتصال، يستمر الصندوق وكل شيء في الطابور'],
      'Réduire le ticket': ['Hide the ticket', 'إخفاء التذكرة'],
      'Pour Si Brahim quand il va au grossiste du Souk. Ajoutez ce qui manque.': ["For Si Brahim's trip to the Souk wholesaler. Add what's missing.", 'لسي إبراهيم حين يذهب إلى تاجر الجملة في السوق. أضف ما ينقص.'],
      'Pour votre prochain passage chez le grossiste. Ajoutez ce qui manque.': ["For your next trip to the wholesaler. Add what's missing.", 'لزيارتك القادمة لتاجر الجملة. أضف ما ينقص.'],
    };
    Object.keys(E).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = E[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = E[k][1];
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
      /* En toutes lettres : l'en-tête de la clôture écrit « Lundi 12 octobre ». */
      'Lundi': 'Monday', 'Mardi': 'Tuesday', 'Mercredi': 'Wednesday', 'Jeudi': 'Thursday',
      'Vendredi': 'Friday', 'Samedi': 'Saturday', 'Dimanche': 'Sunday',
      'janvier': 'January', 'février': 'February', 'avril': 'April', 'juillet': 'July',
      'septembre': 'September', 'octobre': 'October', 'novembre': 'November', 'décembre': 'December',
    },
    ar: {
      'lun.': 'الاثنين', 'mar.': 'الثلاثاء', 'mer.': 'الأربعاء', 'jeu.': 'الخميس',
      'ven.': 'الجمعة', 'sam.': 'السبت', 'dim.': 'الأحد',
      'janv.': 'يناير', 'févr.': 'فبراير', 'mars': 'مارس', 'avr.': 'أبريل',
      'mai': 'ماي', 'juin': 'يونيو', 'juil.': 'يوليوز', 'août': 'غشت',
      'sept.': 'شتنبر', 'oct.': 'أكتوبر', 'nov.': 'نونبر', 'déc.': 'دجنبر',
      'auj.': 'اليوم', 'hier': 'أمس', 'demain': 'غدًا',
      'Lundi': 'الاثنين', 'Mardi': 'الثلاثاء', 'Mercredi': 'الأربعاء', 'Jeudi': 'الخميس',
      'Vendredi': 'الجمعة', 'Samedi': 'السبت', 'Dimanche': 'الأحد',
      'janvier': 'يناير', 'février': 'فبراير', 'avril': 'أبريل', 'juillet': 'يوليوز',
      'septembre': 'شتنبر', 'octobre': 'أكتوبر', 'novembre': 'نونبر', 'décembre': 'دجنبر',
    },
  };
  /* Le garde-fou : on ne remplace un jeton que si le segment RESSEMBLE à une
     date de bout en bout — jour, quantième, mois, heure, rien d'autre. */
  /* Les jours en toutes lettres portent leur majuscule (c'est ainsi que la
     caisse les écrit) : « lundi » minuscule dans un nom d'article ne bouge pas. */
  var DATE_LIKE = new RegExp(
    '^(?:(lun|mar|mer|jeu|ven|sam|dim)\\.|auj\\.|hier|demain|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)?\\s*' +
    '(?:\\d{1,2})?\\s*' +
    '(?:(janv|févr|avr|juil|sept|oct|nov|déc)\\.|mars|mai|juin|août|janvier|février|avril|juillet|septembre|octobre|novembre|décembre)?\\s*' +
    '(?:\\d{1,2}:\\d{2})?$');
  var DATE_TOK = /(lun|mar|mer|jeu|ven|sam|dim|janv|févr|avr|juil|sept|oct|nov|déc|auj)\.|\b(mars|mai|juin|août|hier|demain|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche|janvier|février|avril|juillet|septembre|octobre|novembre|décembre)(?![A-Za-zÀ-ÿ])/g;

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
    /* Un signe EN T\u00caTE s\u00e9par\u00e9 par une espace (\u00ab + 5 848 MAD \u00bb, \u00ab \u2212 8 MAD \u00bb :
       c'est ainsi que la cl\u00f4ture \u00e9crit ses lignes de tiroir et ses \u00e9carts)
       appartient au montant. Laiss\u00e9 dehors, il passait de l'autre c\u00f4t\u00e9 du
       nombre : \u00ab 5 848 MAD + \u00bb. Seulement en t\u00eate : au milieu d'une phrase,
       \u00ab 3 - 4 \u00bb reste une ponctuation. */
    var lead = /^([-\u2212+][ \u00a0\u202f])(?=\d)/.exec(s);
    if (lead) s = s.slice(lead[1].length);
    var out = s.replace(AMOUNT, function (m0) {
      var core = m0.replace(/\s+$/, '');       // l'espace de fin reste dehors
      return core ? LRI + core + PDI + m0.slice(core.length) : m0;
    });
    if (lead) out = out.charAt(0) === LRI ? LRI + lead[1] + out.slice(1) : lead[1] + out;
    return out;
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
    var fr = had ? origText.get(node) : node.nodeValue;
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

    /* Une phrase d'interface qui encadre une DONNÉE : « par Salma »,
       « Imprimante « Cuisine » enregistrée », « Ticket test envoyé (Bar) ».
       La clé porte son propre {x} — la donnée traverse sans être lue, et une
       langue qui préfère mettre le nom devant peut le faire. */
    var hole = translateHole(seg, d);
    if (hole != null) return hole;

    // Une date : des jetons, pas une phrase.
    return translateDate(seg);
  }

  /* Les clés à trou {x}, rangées par leur premier mot. Le balayage passe sur
     chaque nœud de la caisse à chaque rendu : on ne parcourt donc pas tout le
     dictionnaire, on ne regarde que les gabarits qui commencent par le même
     mot que le segment. Construit une fois par langue — tous les blocs du
     dictionnaire sont fusionnés au chargement, avant le premier balayage.
     Une clé qui COMMENCE par {x} n'a pas de mot d'ancrage : elle n'est pas
     acceptée, sinon chaque nom propre deviendrait candidat. */
  var holes = {};
  function holeIndex(d) {
    if (holes[cur]) return holes[cur];
    var idx = Object.create(null);
    Object.keys(d).forEach(function (k) {
      var at = k.indexOf('{x}');
      if (at <= 0) return;
      var pre = k.slice(0, at), suf = k.slice(at + 3);
      var w = pre.split(/\s/)[0];
      (idx[w] = idx[w] || []).push({ pre: pre, suf: suf, key: k });
    });
    // Le gabarit le plus long d'abord : « Imprimante du poste {x} » avant « Imprimante {x} ».
    Object.keys(idx).forEach(function (w) {
      idx[w].sort(function (a, b) { return (b.pre.length + b.suf.length) - (a.pre.length + a.suf.length); });
    });
    return (holes[cur] = idx);
  }
  function translateHole(seg, d) {
    var list = holeIndex(d)[seg.split(/\s/)[0]];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (seg.length > t.pre.length + t.suf.length && seg.startsWith(t.pre) && seg.endsWith(t.suf)) {
        /* Le trou garde la donnée telle quelle, sauf si c'est une date entière
           (« dernière vente 20 oct. ») : ses jetons de jour et de mois suivent. */
        var x = seg.slice(t.pre.length, seg.length - t.suf.length);
        var xd = translateDate(x);
        return d[t.key].replace('{x}', xd != null ? xd : x);
      }
    }
    return null;
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
      var fr = (store && store[a] != null) ? store[a] : el.getAttribute(a);
      /* La même découpe que le texte : « Encaisser en espèces · F2 »,
         « Note cuisine, Msemen miel ». Une correspondance exacte seule
         laissait en français toute infobulle qui porte un raccourci ou un nom. */
      var hit = fr ? translateCore(fr) : null;
      var out = hit != null ? hit : fr;
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
  function makePicker() {
    var box = document.createElement('div');
    box.className = 'kcl';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Langue');
    box.setAttribute('data-nolang', '');
    box.innerHTML = pickerHtml();
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-kcl]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var selected = b.getAttribute('data-kcl');
      try { if (document.documentElement.classList.contains('kiwi-native')) localStorage.setItem('kiwiNativeLocale', selected); } catch (_) {}
      set(selected);
    });
    return box;
  }
  function graft() {
    netButtons().forEach(function (net) {
      var host = net.parentElement;
      if (!host || host.querySelector('.kcl')) return;
      host.insertBefore(makePicker(), net);
      net.classList.add('kcl-hidden-net');
    });
    /* Un métier sans bouton réseau (la caisse « autre ») déclare l'emplacement
       du sélecteur lui-même : <div data-kcl-host>. Même pastille, même clic. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-kcl-host]'), function (host) {
      if (host.querySelector('.kcl')) return;
      host.appendChild(makePicker());
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
