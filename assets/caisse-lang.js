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
      "Déplacement impossible : {x}": "Cannot move: {x}",
      "Fusion impossible : {x}": "Cannot merge: {x}",
      "visite à actualiser": "Visit needs refreshing",
      "synchronisez puis réessayez": "Sync, then retry",
      "visite en cours de synchronisation": "Visit is syncing",
      "réessayez": "Retry",
      "annulation non transmise": "Cancellation not sent",
      "caisse appairée à un autre commerce": "Till paired to another business",
      "réappairez-la avant d’annuler": "Pair it again before cancelling",
      "délai dépassé": "Request timed out",
      "vérifiez la commande après synchronisation avant de réessayer": "Check the order after syncing before retrying",
      "réponse incomplète": "Incomplete response",
      "synchronisez la commande": "Sync the order",
      "erreur lecteur": "Reader error",
      "serveur {n}": "Server {n}",

      "Mouvements": "Stock movements",
      // Cashier errors and confirmed loyalty redemption.
      // Bon d'avoir imprimé sur la thermique (boutique, maison).
      "Impression de l’avoir…": "Printing the store credit…",
      "Avoir envoyé à l’imprimante": "Store credit sent to the printer",
      "Avoir imprimé": "Store credit printed",
      "Avoir ouvert dans l’impression système": "Store credit opened in system printing",
      "Imprimante injoignable · avoir ouvert dans l’impression système": "Printer unreachable · store credit opened in system printing",
      "Impression échouée": "Printing failed",
      "Impression indisponible sur cet appareil": "Printing is not available on this device",
      "Confirmation en cours…": "Confirming…",
      "Récompense refusée": "Reward refused",
      "Récompense offerte": "Reward redeemed",
      "Carte réinitialisée.": "Card reset.",
      "La carte est conservée.": "The card is unchanged.",
      "Carte réinitialisée. Confirmation au retour du réseau.": "Card reset. Confirmed when back online.",
      "Connexion impossible. Réessayez.": "Unable to connect. Try again.",
      "Paiement QR indisponible · configurez un fournisseur QR": "QR payment unavailable · configure a QR provider",
      "Montant nul non justifié · appliquez une remise de 100 % approuvée": "Zero amount requires an approved 100% discount",
      "Encaissement non enregistré · la table reste ouverte": "Payment not recorded · table remains open",
      "Message non envoyé · vérifiez la connexion": "Message not sent · check the connection",
      "Pourcentage non autorisé · rechargez la remise": "Percentage not allowed · reload the discount",
      "Photo non jointe · vérifie l’accès à l’appareil": "Photo not attached · check device access",
      "Perte refusée · la quantité ou le lot a changé": "Loss refused · quantity or batch changed",
      "Table absente du plan · envoyez d'abord la commande en cuisine": "Table missing from floor plan · send the order to kitchen first",
      "Addition non disponible · actualisez la commande": "Bill unavailable · refresh the order",
      "Service non restauré · il est conservé, préviens le support": "Shift not restored · it is saved, contact support",
      "Annulation impossible · caisse non appairée, article conservé": "Cannot cancel · till not paired, item kept",
      "Journal caisse non enregistré · stockage local à vérifier, gardez cette page ouverte": "Till journal not saved · check local storage, keep this page open",
      "Réparation impossible · événements conservés, contactez le support": "Repair failed · events kept, contact support",
      "Appareil hors ligne · connexion Internet requise": "Device offline · Internet connection required",
      "Ventes transmises · protection du journal caisse à vérifier": "Sales sent · check till journal protection",
      "Autorisation caisse refusée · vérification de l’appairage": "Till authorisation refused · checking pairing",
      "Employé en service requis pour transmettre cette vente": "An employee on shift is required to send this sale",
      "Serveur momentanément indisponible ({n}) · réessai automatique": "Server temporarily unavailable ({n}) · automatic retry",
      "Serveur non joignable · opérations conservées, nouvel essai automatique": "Server unreachable · operations kept, automatic retry",
      "Réappairage requis · ouvrez cette caisse depuis le tableau de bord. Les opérations restent conservées.": "Pair again · open this till from the dashboard. Operations remain saved.",
      "Modification non enregistrée · vérifiez la connexion": "Change not saved · check the connection",
      "Cuisine injoignable et file pleine · annoncez ce bon à la cuisine": "Kitchen unreachable and queue full · tell the kitchen about this ticket",
      "Expirée vide · rien à reprendre": "Expired empty order · nothing to resume",
      "Vente NON sauvegardée : stockage de la caisse plein et serveur injoignable. Ne rechargez pas la page ni ne fermez la caisse, notez le ticket. Ne pas encaisser à nouveau.": "Sale NOT saved: till storage full and server unreachable. Keep this page and till open, write down the receipt. Do not charge again.",
      "Impression échouée · vérifiez l'imprimante": "Printing failed · check the printer",
      "Impression impossible · le rapport reste dans le tableau de bord": "Cannot print · report remains in the dashboard",
      "Clôture non enregistrée · poste conservé. Vérifiez le stockage puis réessayez.": "Closing not saved · register kept. Check storage and retry.",
      "Rapprochement Z non protégé · poste conservé. Vérifiez le stockage puis réessayez.": "Z reconciliation not protected · register kept. Check storage and retry.",
      "Tiroir injoignable · vérifiez l'imprimante du comptoir": "Drawer unreachable · check the counter printer",
      "Module métier indisponible · rechargez la caisse": "Business module unavailable · reload the till",
      "Un téléphone est requis pour livrer": "A phone number is required for delivery",
      "Choisissez une zone, les frais en dépendent": "Choose a zone to calculate delivery fees",
      "Choisissez la table d'abord": "Choose the table first",
      "Choisissez la zone, les frais en dépendent": "Choose the zone to calculate delivery fees",
      "Four complet, 4 pizzas max, sortez-en une d'abord": "Oven full, 4 pizzas maximum, take one out first",
      "Vente NON sauvegardée : stockage de la tablette plein et serveur injoignable. Ne rechargez pas la page, notez le ticket.": "Sale NOT saved: tablet storage full and server unreachable. Do not reload, write down the receipt.",
      "Règlement non enregistré, rien n'a été noté · réessayez": "Payment not recorded, nothing saved · retry",
      "Le solde a changé sur une autre caisse · vérifiez le montant": "Balance changed on another till · check the amount",
      "Choisissez un médecin ou saisissez un nom": "Choose a doctor or enter a name",
      "Aucun numéro enregistré pour ce patient": "No phone number saved for this patient",
      "Scan indisponible sur ce terminal": "Scanning unavailable on this terminal",
      "Saisissez le prix de la prestation": "Enter the service price",
      "Choisissez le·la coiffeur·se de cette prestation": "Choose the stylist for this service",
      "Photo non enregistrée · vérifiez l’accès à l’appareil": "Photo not saved · check device access",
      "Taux invalide, saisissez un pourcentage entre 0 et 100": "Invalid rate, enter a percentage from 0 to 100",
      "Choisissez au moins un plat avant d’imprimer": "Choose at least one dish before printing",
      "Le nom du client est requis sur le devis": "Customer name is required on the quote",
      "Choisissez au moins un plat": "Choose at least one dish",
      "Le nom du client est requis": "Customer name is required",
      "Chargement incomplet, cochez toute la checklist d’abord": "Loading incomplete, complete the checklist first",
      "Inventaire non transmis · réessaie": "Inventory not sent · retry",
      "Charge annulée · identité non confirmée": "Charge cancelled · identity not confirmed",
      "Impossible de sécuriser la charge · espace local indisponible": "Cannot secure charge · local storage unavailable",
      "Lecteur actif · approchez le badge ou saisissez son code": "Reader active · present the badge or enter its code",
      "Aucun membre à simuler, saisissez un code badge.": "No member to simulate, enter a badge code.",
      "Choisissez une formule": "Choose a plan",
      "Saisissez le prix de cette vente": "Enter the price for this sale",
      "Saisissez le prix du pack": "Enter the pack price",
      "Annonce vocale impossible sur cet appareil, appelez à voix haute": "Voice announcement unavailable on this device, call out loud",
      "Pré-rempli avec la répartition attendue, à vérifier billet par billet": "Filled with expected amounts, check each note",
      "Le titre est requis": "Title is required",
      "Rien à ajouter, tout est décoché ou épuisé": "Nothing to add, all items are unchecked or sold out",
      "Code non reconnu (démo)": "Code not recognised (demo)",
      "Relais cuisine non configuré · commande conservée sur cette caisse": "Kitchen relay not configured · order kept on this till",
      "Le nom du client est requis, le gâteau porte un nom": "Customer name is required for the cake",
      "La date de retrait est déjà passée, choisissez un créneau à venir": "Collection date has passed, choose a future slot",
      "Saisissez le prix du gâteau": "Enter the cake price",
      "Saisissez un montant d'acompte, ou « sans acompte »": "Enter a deposit amount, or choose no deposit",
      "Aucune pièce comptée, rien à donner ce soir": "No items counted, nothing to donate tonight",
      "Choisissez une association pour le don": "Choose a charity for the donation",
      "Saisissez le prix de la fleur": "Enter the flower price",
      "Écrivez d'abord le message de la carte": "Write the card message first",
      "Photo du bouquet requise avant « en route »": "Bouquet photo required before marking on the way",

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
      'Sortir': 'Leave', 'En service': 'On shift',
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
      "Déplacement impossible : {x}": "تعذر النقل: {x}",
      "Fusion impossible : {x}": "تعذر الدمج: {x}",
      "visite à actualiser": "يلزم تحديث الزيارة",
      "synchronisez puis réessayez": "زامن ثم أعد المحاولة",
      "visite en cours de synchronisation": "جارٍ مزامنة الزيارة",
      "réessayez": "أعد المحاولة",
      "annulation non transmise": "لم يُرسل الإلغاء",
      "caisse appairée à un autre commerce": "الصندوق مقترن بمتجر آخر",
      "réappairez-la avant d’annuler": "أعد اقترانه قبل الإلغاء",
      "délai dépassé": "انتهت مهلة الطلب",
      "vérifiez la commande après synchronisation avant de réessayer": "تحقق من الطلب بعد المزامنة قبل إعادة المحاولة",
      "réponse incomplète": "استجابة غير مكتملة",
      "synchronisez la commande": "زامن الطلب",
      "erreur lecteur": "خطأ في القارئ",
      "serveur {n}": "الخادم {n}",

      "Mouvements": "حركات المخزون",
      // Cashier errors and confirmed loyalty redemption.
      // Bon d'avoir imprimé sur la thermique (boutique, maison).
      "Impression de l’avoir…": "جارٍ طباعة سند الرصيد…",
      "Avoir envoyé à l’imprimante": "أُرسل سند الرصيد إلى الطابعة",
      "Avoir imprimé": "طُبع سند الرصيد",
      "Avoir ouvert dans l’impression système": "فُتح سند الرصيد في طباعة النظام",
      "Imprimante injoignable · avoir ouvert dans l’impression système": "الطابعة غير متاحة · فُتح سند الرصيد في طباعة النظام",
      "Impression échouée": "فشلت الطباعة",
      "Impression indisponible sur cet appareil": "الطباعة غير متاحة على هذا الجهاز",
      "Confirmation en cours…": "جارٍ التأكيد…",
      "Récompense refusée": "تم رفض المكافأة",
      "Récompense offerte": "تم صرف المكافأة",
      "Carte réinitialisée.": "تمت إعادة ضبط البطاقة.",
      "La carte est conservée.": "تم الاحتفاظ بالبطاقة.",
      "Carte réinitialisée. Confirmation au retour du réseau.": "تمت إعادة تعيين البطاقة. يتم التأكيد عند عودة الاتصال.",
      "Connexion impossible. Réessayez.": "تعذر الاتصال. أعد المحاولة.",
      "Paiement QR indisponible · configurez un fournisseur QR": "الدفع عبر QR غير متاح · اضبط مزود الخدمة",
      "Montant nul non justifié · appliquez une remise de 100 % approuvée": "المبلغ الصفري يتطلب خصماً معتمداً بنسبة 100٪",
      "Encaissement non enregistré · la table reste ouverte": "لم يُسجل الدفع · تبقى الطاولة مفتوحة",
      "Message non envoyé · vérifiez la connexion": "لم تُرسل الرسالة · تحقق من الاتصال",
      "Pourcentage non autorisé · rechargez la remise": "النسبة غير مسموحة · أعد تحميل الخصم",
      "Photo non jointe · vérifie l’accès à l’appareil": "لم تُرفق الصورة · تحقق من صلاحية الوصول للجهاز",
      "Perte refusée · la quantité ou le lot a changé": "تم رفض الخسارة · تغيرت الكمية أو الدفعة",
      "Table absente du plan · envoyez d'abord la commande en cuisine": "الطاولة غير موجودة في المخطط · أرسل الطلب للمطبخ أولاً",
      "Addition non disponible · actualisez la commande": "الفاتورة غير متاحة · حدّث الطلب",
      "Service non restauré · il est conservé, préviens le support": "لم تُستعد الوردية · تم الاحتفاظ بها، اتصل بالدعم",
      "Annulation impossible · caisse non appairée, article conservé": "تعذر الإلغاء · الصندوق غير مقترن، تم الاحتفاظ بالصنف",
      "Journal caisse non enregistré · stockage local à vérifier, gardez cette page ouverte": "لم يُحفظ سجل الصندوق · تحقق من التخزين المحلي وأبقِ هذه الصفحة مفتوحة",
      "Réparation impossible · événements conservés, contactez le support": "تعذر الإصلاح · تم الاحتفاظ بالأحداث، اتصل بالدعم",
      "Appareil hors ligne · connexion Internet requise": "الجهاز غير متصل · يلزم اتصال بالإنترنت",
      "Ventes transmises · protection du journal caisse à vérifier": "تم إرسال المبيعات · تحقق من حماية سجل الصندوق",
      "Autorisation caisse refusée · vérification de l’appairage": "رُفض ترخيص الصندوق · جارٍ التحقق من الاقتران",
      "Employé en service requis pour transmettre cette vente": "يلزم موظف في الخدمة لإرسال هذه البيعة",
      "Serveur momentanément indisponible ({n}) · réessai automatique": "الخادم غير متاح مؤقتاً ({n}) · إعادة المحاولة تلقائياً",
      "Serveur non joignable · opérations conservées, nouvel essai automatique": "تعذر الاتصال بالخادم · تم الاحتفاظ بالعمليات وستُعاد المحاولة تلقائياً",
      "Réappairage requis · ouvrez cette caisse depuis le tableau de bord. Les opérations restent conservées.": "يلزم إعادة الاقتران · افتح هذا الصندوق من لوحة التحكم. تبقى العمليات محفوظة.",
      "Modification non enregistrée · vérifiez la connexion": "لم يُحفظ التعديل · تحقق من الاتصال",
      "Cuisine injoignable et file pleine · annoncez ce bon à la cuisine": "تعذر الاتصال بالمطبخ والطابور ممتلئ · أبلغ المطبخ بهذه التذكرة",
      "Expirée vide · rien à reprendre": "طلب فارغ منتهي الصلاحية · لا شيء لاستئنافه",
      "Vente NON sauvegardée : stockage de la caisse plein et serveur injoignable. Ne rechargez pas la page ni ne fermez la caisse, notez le ticket. Ne pas encaisser à nouveau.": "لم تُحفظ البيعة: تخزين الصندوق ممتلئ والخادم غير متاح. لا تُعد تحميل الصفحة ولا تُغلق الصندوق، دوّن التذكرة. لا تقبض المبلغ مجدداً.",
      "Impression échouée · vérifiez l'imprimante": "فشلت الطباعة · تحقق من الطابعة",
      "Impression impossible · le rapport reste dans le tableau de bord": "تعذرت الطباعة · يبقى التقرير في لوحة التحكم",
      "Clôture non enregistrée · poste conservé. Vérifiez le stockage puis réessayez.": "لم يُسجل الإغلاق · تم الاحتفاظ بالصندوق. تحقق من التخزين وأعد المحاولة.",
      "Rapprochement Z non protégé · poste conservé. Vérifiez le stockage puis réessayez.": "مطابقة Z غير محمية · تم الاحتفاظ بالصندوق. تحقق من التخزين وأعد المحاولة.",
      "Tiroir injoignable · vérifiez l'imprimante du comptoir": "تعذر الوصول للدرج · تحقق من طابعة المنضدة",
      "Module métier indisponible · rechargez la caisse": "وحدة النشاط غير متاحة · أعد تحميل الصندوق",
      "Un téléphone est requis pour livrer": "يلزم رقم هاتف للتوصيل",
      "Choisissez une zone, les frais en dépendent": "اختر منطقة لحساب رسوم التوصيل",
      "Choisissez la table d'abord": "اختر الطاولة أولاً",
      "Choisissez la zone, les frais en dépendent": "اختر المنطقة لحساب رسوم التوصيل",
      "Four complet, 4 pizzas max, sortez-en une d'abord": "الفرن ممتلئ، الحد الأقصى 4 بيتزا، أخرج واحدة أولاً",
      "Vente NON sauvegardée : stockage de la tablette plein et serveur injoignable. Ne rechargez pas la page, notez le ticket.": "لم تُحفظ البيعة: تخزين الجهاز اللوحي ممتلئ والخادم غير متاح. لا تُعد تحميل الصفحة، دوّن التذكرة.",
      "Règlement non enregistré, rien n'a été noté · réessayez": "لم يُسجل الدفع ولم يُحفظ شيء · أعد المحاولة",
      "Le solde a changé sur une autre caisse · vérifiez le montant": "تغير الرصيد على صندوق آخر · تحقق من المبلغ",
      "Choisissez un médecin ou saisissez un nom": "اختر طبيباً أو أدخل اسماً",
      "Aucun numéro enregistré pour ce patient": "لا يوجد رقم هاتف محفوظ لهذا المريض",
      "Scan indisponible sur ce terminal": "المسح غير متاح على هذا الجهاز",
      "Saisissez le prix de la prestation": "أدخل سعر الخدمة",
      "Choisissez le·la coiffeur·se de cette prestation": "اختر مصفف الشعر لهذه الخدمة",
      "Photo non enregistrée · vérifiez l’accès à l’appareil": "لم تُحفظ الصورة · تحقق من صلاحية الوصول للجهاز",
      "Taux invalide, saisissez un pourcentage entre 0 et 100": "نسبة غير صالحة، أدخل نسبة بين 0 و100",
      "Choisissez au moins un plat avant d’imprimer": "اختر طبقاً واحداً على الأقل قبل الطباعة",
      "Le nom du client est requis sur le devis": "يلزم اسم العميل في عرض السعر",
      "Choisissez au moins un plat": "اختر طبقاً واحداً على الأقل",
      "Le nom du client est requis": "اسم العميل مطلوب",
      "Chargement incomplet, cochez toute la checklist d’abord": "التحميل غير مكتمل، أكمل قائمة التحقق أولاً",
      "Inventaire non transmis · réessaie": "لم يُرسل الجرد · أعد المحاولة",
      "Charge annulée · identité non confirmée": "أُلغيت الرسوم · لم تُؤكد الهوية",
      "Impossible de sécuriser la charge · espace local indisponible": "تعذر تأمين الرسوم · التخزين المحلي غير متاح",
      "Lecteur actif · approchez le badge ou saisissez son code": "القارئ نشط · قرّب البطاقة أو أدخل رمزها",
      "Aucun membre à simuler, saisissez un code badge.": "لا يوجد عضو للمحاكاة، أدخل رمز البطاقة.",
      "Choisissez une formule": "اختر اشتراكاً",
      "Saisissez le prix de cette vente": "أدخل سعر هذه البيعة",
      "Saisissez le prix du pack": "أدخل سعر الحزمة",
      "Annonce vocale impossible sur cet appareil, appelez à voix haute": "الإعلان الصوتي غير متاح على هذا الجهاز، نادِ بصوت مرتفع",
      "Pré-rempli avec la répartition attendue, à vérifier billet par billet": "مُعبأ بالمبالغ المتوقعة، تحقق من كل ورقة نقدية",
      "Le titre est requis": "العنوان مطلوب",
      "Rien à ajouter, tout est décoché ou épuisé": "لا شيء لإضافته، جميع الأصناف غير محددة أو نفدت",
      "Code non reconnu (démo)": "رمز غير معروف (عرض تجريبي)",
      "Relais cuisine non configuré · commande conservée sur cette caisse": "لم يُضبط وسيط المطبخ · تم الاحتفاظ بالطلب على هذا الصندوق",
      "Le nom du client est requis, le gâteau porte un nom": "يلزم اسم العميل للكعكة",
      "La date de retrait est déjà passée, choisissez un créneau à venir": "مضى تاريخ الاستلام، اختر موعداً مستقبلياً",
      "Saisissez le prix du gâteau": "أدخل سعر الكعكة",
      "Saisissez un montant d'acompte, ou « sans acompte »": "أدخل مبلغ العربون، أو اختر بدون عربون",
      "Aucune pièce comptée, rien à donner ce soir": "لم تُحسب أي قطعة، لا شيء للتبرع به الليلة",
      "Choisissez une association pour le don": "اختر جمعية للتبرع",
      "Saisissez le prix de la fleur": "أدخل سعر الزهرة",
      "Écrivez d'abord le message de la carte": "اكتب رسالة البطاقة أولاً",
      "Photo du bouquet requise avant « en route »": "يلزم تصوير الباقة قبل تحديد أنها في الطريق",

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
      'Sortir': 'خروج', 'En service': 'في الخدمة',
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
      'Caisse ouverte depuis le {x}, tiroir pas encore compté': ['Register open since {x}, drawer not counted yet', 'الصندوق مفتوح منذ {x}، ولم يُعَدّ نقد الدرج بعد'],
      'Clôturer la caisse': ['Close the register', 'إغلاق الصندوق'],
      'Même panier encaissé il y a {n} s': ['Same basket charged {n} s ago', 'السلة نفسها دُفعت قبل {n} ثانية'],
      'Ticket {x}, mêmes articles, même total.': ['Ticket {x}, same items, same total.', 'التذكرة {x}، المواد نفسها والمجموع نفسه.'],
      'Mêmes articles, même total.': ['Same items, same total.', 'المواد نفسها والمجموع نفسه.'],
      'Encaissez à nouveau seulement pour une autre cliente.': ['Charge again only for a different customer.', 'لا تُعِد الدفع إلا لعميل آخر.'],
      'Ne pas encaisser': ['Do not charge', 'عدم الدفع'],
      'Encaisser à nouveau': ['Charge again', 'الدفع مرة أخرى'],
      'Récompense indisponible. Confirmez le paiement au plein tarif.': ['Reward unavailable. Confirm payment at full price.', 'المكافأة غير متاحة. أكّد الدفع بالسعر الكامل.'],
      'Récompense refusée par le serveur': ['Reward refused by the server', 'رفض الخادم المكافأة'],
      'Peut-être déjà utilisée sur une autre caisse. Vérifiez la fiche du client.': ['Possibly already used at another till. Check the customer record.', 'ربما استُخدمت بالفعل في صندوق آخر. تحقق من بطاقة العميل.'],
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
      'Impossible de charger les réglages de l’imprimante. Réessayez.': ['Unable to load printer settings. Try again.', 'تعذر تحميل إعدادات الطابعة. حاول مرة أخرى.'],
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
      /* Le catalogue n'a pas pris sur la tablette (assets/pos-boutique.js). */
      'Stock non enregistré sur cette caisse': ['Stock not saved on this till', 'لم يُحفظ المخزون على هذا الصندوق'],
      'La vente continue et le stock part au serveur dès que le réseau le permet. Libérez du stockage avant de recharger la page.': ['The sale goes on and the stock is sent to the server as soon as the network allows. Free up storage before reloading the page.', 'يستمر البيع ويُرسل المخزون إلى الخادم فور توفر الشبكة. حرّر مساحة التخزين قبل إعادة تحميل الصفحة.'],
      'Stock de nouveau enregistré sur cette caisse': ['Stock saved on this till again', 'عاد حفظ المخزون على هذا الصندوق'],
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
      /* Aperçu du remboursement Maison : l'argent dans son moyen, puis chaque avoir recrédité. */
      'En cas de remboursement': ['If refunded', 'في حالة الاسترداد'],
      'Rendu en espèces': ['Back in cash', 'يُرد نقدًا'],
      'Rendu sur la carte': ['Back to the card', 'يُرد إلى البطاقة'],
      'Rendu par virement': ['Back by bank transfer', 'يُرد بتحويل بنكي'],
      'Rendu par chèque': ['Back by cheque', 'يُرد بشيك'],
      'Recrédité sur l’avoir': ['Restored to credit note', 'يُعاد إلى سند الرصيد'],
      'Déjà remboursé, refusé': ['Already refunded, refused', 'تم استرداده سابقًا، مرفوض'],
      'Total remboursé': ['Total refunded', 'إجمالي المسترد'],
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
      'Impression arrêtée · cet appareil ne sait pas dessiner l’arabe de ce ticket. Rien n’est sorti en « ? ».': ['Printing stopped · this device cannot draw the Arabic on this ticket. Nothing was printed as « ? ».', 'توقفت الطباعة · هذا الجهاز لا يستطيع رسم النص العربي في هذه التذكرة. لم يُطبع أي شيء على شكل « ? ».'],
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
      'Additions encore ouvertes': ['Bills still open', 'فواتير لا تزال مفتوحة'],
      'Fermer la caisse efface ces additions. Encaissez ou annulez ces tables avant de fermer.': ['Closing the till erases these bills. Settle or cancel these tables before you close.', 'إغلاق الصندوق يمحو هذه الفواتير. حصّل أو ألغِ هذه الطاولات قبل الإغلاق.'],
      'Fermer quand même · ces additions ne seront pas encaissées': ['Close anyway · these bills will not be collected', 'أغلق على أي حال · لن تُحصّل هذه الفواتير'],
      'Non encaissé': ['Not collected', 'غير محصّل'],
      'Table {n} encore ouverte · encaissez-la, annulez-la ou cochez « Fermer quand même »': ['Table {n} is still open · settle it, cancel it or tick “Close anyway”', 'الطاولة {n} لا تزال مفتوحة · حصّلها أو ألغِها أو حدّد «أغلق على أي حال»'],
      '{n} tables encore ouvertes · encaissez-les, annulez-les ou cochez « Fermer quand même »': ['{n} tables are still open · settle them, cancel them or tick “Close anyway”', '{n} طاولات لا تزال مفتوحة · حصّلها أو ألغِها أو حدّد «أغلق على أي حال»'],
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
      "Règlement non enregistré, rien n'a été noté": ['Payment not saved, nothing was recorded', 'لم يُسجَّل الأداء، لم يُدوَّن أي شيء'],
      'réessayez': ['try again', 'أعد المحاولة'],
      'Le solde a changé sur une autre caisse': ['The balance changed on another till', 'تغيّر الرصيد في صندوق آخر'],
      'vérifiez le montant': ['check the amount', 'تحقّق من المبلغ'],
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

  /* La caisse boutique en arabe et en anglais (2026-10-21) : la fenêtre
     d'encaissement, l'inventaire, les toasts qui portent un nom d'article, les
     info-bulles du rail et le réglage des imprimantes restaient en français. */
  (function () {
    var R = {
      'Montant…': ['Amount…', 'المبلغ…'],
      'Rendu calculé, flous comptés une fois': ['Change worked out, cash counted once', 'الباقي محسوب، والنقود تُعدّ مرة واحدة'],
      'Terminal de la banque, montant à saisir dessus': ['Bank terminal, enter the amount on it', 'جهاز البنك، يُدخَل المبلغ عليه'],
      'Virement / Versement': ['Bank transfer / Deposit', 'تحويل / إيداع'],
      'Confirmer uniquement après réception en banque': ['Confirm only once it reaches the bank', 'لا تؤكد إلا بعد وصوله إلى البنك'],
      'Chèque': ['Cheque', 'شيك'],
      'Confirmer après réception du chèque': ['Confirm once the cheque is received', 'أكّد بعد استلام الشيك'],
      'Vente enregistrée, paiement à recevoir du transporteur': ['Sale recorded, payment to collect from the courier', 'البيع مسجل، والمبلغ يُستلم من شركة التوصيل'],
      'Code d’avoir': ['Credit note code', 'رمز سند الرصيد'],
      "Code d'avoir": ['Credit note code', 'رمز سند الرصيد'],
      'Scanner ou saisir le code du bon': ['Scan or type the voucher code', 'امسح رمز السند أو أدخله'],
      'Partager le paiement': ['Split the payment', 'تقسيم الدفع'],
      'Kiwi affiche, le lecteur encaisse': ['Kiwi shows the amount, the card reader takes the payment', 'يعرض Kiwi المبلغ، ويستخلص الجهاز الدفع'],
      'stock par taille en direct': ['live stock by size', 'المخزون حسب المقاس مباشرة'],
      'Valeur de stock': ['Stock value', 'قيمة المخزون'],
      'Stock bas / rupture': ['Low / out of stock', 'مخزون منخفض / نافد'],
      '{n} coul.': ['{n} col.', 'ألوان: {n}'],
      '{n} taille': ['{n} size', 'مقاسات: {n}'],
      '{n} tailles': ['{n} sizes', 'مقاسات: {n}'],
      '{n}/{n} codes-barres': ['{n}/{n} barcodes', 'الباركود: {n}/{n}'],
      'Scannez un article, ou tapez un code…': ['Scan an item or type a code…', 'امسح منتجًا أو اكتب رمزًا…'],
      'Imprimer toutes les étiquettes': ['Print all labels', 'طباعة كل الملصقات'],
      'N° de ticket ou téléphone…': ['Ticket number or phone…', 'رقم التذكرة أو الهاتف…'],
      'Dates': ['Dates', 'التواريخ'],
      'Tester la douchette': ['Test the scanner', 'اختبار قارئ الباركود'],
      'Configurer les imprimantes': ['Set up printers', 'إعداد الطابعات'],
      'Simuler une coupure réseau': ['Simulate a network outage', 'محاكاة انقطاع الشبكة'],
      'Imprimante de la caisse': ['Till printer', 'طابعة الصندوق'],
      'Imprimante de la caisse:': ['Till printer:', 'طابعة الصندوق:'],
      'Imprimante par défaut (actuelle)': ['Default printer (current)', 'الطابعة الافتراضية (الحالية)'],
      'Même imprimante que la caisse': ['Same printer as the till', 'نفس طابعة الصندوق'],
      /* Les toasts qui portent un nom d'article : le nom passe tel quel. */
      '{x}, sur le ticket': ['{x}, on the ticket', '{x}، أُضيف إلى التذكرة'],
      '{x}, plus de stock, dernière pièce déjà sur le ticket': ['{x}, out of stock, the last piece is already on the ticket', '{x}، نفد المخزون، وآخر قطعة موجودة في التذكرة'],
      '{x}, épuisé': ['{x}, sold out', '{x}، نفد'],
      'Bip, {x}': ['Beep, {x}', 'تم المسح، {x}'],
      '{x}, stock insuffisant': ['{x}, not enough stock', '{x}، المخزون غير كافٍ'],
      '{x}, {n} en stock, pas plus': ['{x}, only {n} in stock', '{x}، {n} فقط في المخزون'],
      '{x}, épuisé dans toutes les tailles': ['{x}, sold out in every size', '{x}، نفد بكل المقاسات'],
      '{x}, enregistré sur cette caisse': ['{x}, saved on this till', '{x}، محفوظ على هذا الصندوق'],
      '{x}, enregistré sur cette caisse ({n} vente à synchroniser)': ['{x}, saved on this till ({n} sale to sync)', '{x}، محفوظ على هذا الصندوق ({n} عملية بيع للمزامنة)'],
      '{x}, enregistré sur cette caisse ({n} ventes à synchroniser)': ['{x}, saved on this till ({n} sales to sync)', '{x}، محفوظ على هذا الصندوق ({n} عمليات بيع للمزامنة)'],
      'Remise −{n} %, accord {x}': ['Discount −{n} %, approved by {x}', 'خصم −{n} %، بموافقة {x}'],
      "{x} n'est pas habilitée, seule la gérante approuve une remise": ['{x} is not authorised, only the manager approves a discount', '{x} غير مخوّلة، المسؤولة وحدها توافق على الخصم'],
      'Fiche créée, {x}': ['Record created, {x}', 'أُنشئت البطاقة، {x}'],
      'Code {x} inconnu, enregistrez-le sur un article': ['Unknown code {x}, add it to an item', 'الرمز {x} غير معروف، سجّله على منتج'],
      'Code {x} inconnu, aucun article ne le porte': ['Unknown code {x}, no item carries it', 'الرمز {x} غير معروف، لا يحمله أي منتج'],
      'Code {x} inconnu, à enregistrer': ['Unknown code {x}, to be added', 'الرمز {x} غير معروف، يجب تسجيله'],
      "Échange {x}, choisissez l'article de remplacement dans la grille": ['Exchange {x}, pick the replacement item in the grid', 'تبديل {x}، اختر المنتج البديل من الشبكة'],
      '{x} émis, {n} MAD': ['{x} issued, {n} MAD', 'صدر {x}، {n} MAD'],
      '{x} émis, {n} MAD, pièces remises en stock': ['{x} issued, {n} MAD, pieces back in stock', 'صدر {x}، {n} MAD، وأُعيدت القطع إلى المخزون'],
      'Reste {n} MAD à régler': ['{n} MAD still to pay', 'يتبقى {n} MAD للأداء'],
      '{x} appliqué, reste {n} MAD à payer': ['{x} applied, {n} MAD left to pay', 'طُبّق {x}، يتبقى {n} MAD للأداء'],
      'Avoir {x} inutilisable': ['Credit note {x} cannot be used', 'سند الرصيد {x} غير قابل للاستعمال'],
      'Bon introuvable en caisse.': ['Voucher not found on this till.', 'السند غير موجود في الصندوق.'],
      'Bon expiré entre-temps.': ['The voucher expired in the meantime.', 'انتهت صلاحية السند في الأثناء.'],
      'Solde insuffisant, montants recalculés.': ['Balance too low, amounts recalculated.', 'الرصيد غير كافٍ، أُعيد حساب المبالغ.'],
      '{x} supprimée, prix pleins rétablis': ['{x} deleted, full prices restored', 'حُذف {x}، وعادت الأسعار الكاملة'],
      "{x} ajouté à l'inventaire": ['{x} added to the inventory', 'أُضيف {x} إلى المخزون'],
      '{n} pièce': ['{n} piece', '{n} قطعة'],
      '{n} pièces': ['{n} pieces', '{n} قطع'],
      'taille {x}': ['size {x}', 'المقاس {x}'],
      'code fournisseur conservé': ['supplier code kept', 'رمز المورّد محفوظ'],
      'code Kiwi généré': ['Kiwi code generated', 'تم توليد رمز Kiwi'],
      'code à ajouter plus tard': ['code to add later', 'رمز يُضاف لاحقًا'],
      'Déjà utilisé par {x}': ['Already used by {x}', 'مستعمل من قبل {x}'],
      'Code {x} enregistré': ['Code {x} saved', 'حُفظ الرمز {x}'],
      '{n} article, {n} pièce': ['{n} item, {n} piece', '{n} منتج، {n} قطعة'],
      '{n} article, {n} pièces': ['{n} item, {n} pieces', '{n} منتج، {n} قطع'],
      '{n} articles, {n} pièces': ['{n} items, {n} pieces', '{n} منتجات، {n} قطع'],
      '{x} enregistré': ['{x} saved', 'حُفظ {x}'],
      'code {x} conservé': ['code {x} kept', 'الرمز {x} محفوظ'],
      'Code déjà porté par {x}': ['Code already on {x}', 'الرمز موجود على {x}'],
      '{x} ajouté': ['{x} added', 'أُضيف {x}'],
      'Échange': ['Exchange', 'تبديل'],
      'Fiche cliente': ['Customer record', 'بطاقة الزبونة'],
      'Étiquette': ['Label', 'الملصق'],
      '{n} étiquette(s)': ['{n} label(s)', 'ملصقات: {n}'],
      "{x} envoyée à l'imprimante": ['{x} sent to the printer', 'أُرسل {x} إلى الطابعة'],
    };
    Object.keys(R).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = R[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = R[k][1];
    });
  })();

  /* La caisse restaurant en arabe et en anglais (2026-10-21) : la passation de
     caisse, la remise sur l'addition, le tiroir, l'écran cuisine, Stock & appro,
     l'équipe et la disponibilité du menu restaient en français. Relevé écran par
     écran sur la démo, en lisant ce que la caisse affiche vraiment. */
  (function () {
    var R = {
      'Bonjour {x},': ['Hello {x},', 'مرحبًا {x}،'],
      'Demain': ['Tomorrow', 'غدًا'],
      'bienvenue.': ['welcome.', 'أهلًا بك.'],
      'Vérifier la caisse': ['Check the till', 'مراجعة الصندوق'],
      /* La remise sur l'addition */
      'Pourcentage': ['Percentage', 'النسبة'],
      'Pourcentage de remise': ['Discount percentage', 'نسبة الخصم'],
      'Montant de la remise': ['Discount amount', 'مبلغ الخصم'],
      'Motif': ['Reason', 'السبب'],
      'Geste commercial': ['Goodwill gesture', 'لفتة تجارية'],
      'Client habitué': ['Regular customer', 'زبون دائم'],
      'Erreur cuisine': ['Kitchen error', 'خطأ في المطبخ'],
      'Repas équipe': ['Staff meal', 'وجبة الفريق'],
      'Addition {n} MAD': ['Bill {n} MAD', 'الفاتورة {n} MAD'],
      'Appliquer la remise': ['Apply the discount', 'تطبيق الخصم'],
      "Choisis une remise pour voir l'aperçu.": ['Pick a discount to see the preview.', 'اختر خصمًا لرؤية المعاينة.'],
      'Choisis une remise': ['Pick a discount', 'اختر خصمًا'],
      "Remise sur l'addition": ['Discount on the bill', 'خصم على الفاتورة'],
      /* Démo, remboursement, tiroir */
      'Démo': ['Demo', 'تجريبي'],
      'Données d’exemple, pas un vrai service': ['Sample data, not a real service', 'بيانات تجريبية، وليست خدمة حقيقية'],
      'Sortie': ['Cash out', 'سحب'],
      'Montant à rembourser': ['Amount to refund', 'المبلغ المراد استرداده'],
      "Vérifie le montant, l'opération sera autorisée par le manager.": ['Check the amount; the manager will approve it.', 'تحقق من المبلغ، وسيوافق المسؤول على العملية.'],
      'Plat retourné': ['Dish sent back', 'طبق مُرجَع'],
      "n'importe quel code manager": ['any manager code', 'أي رمز مسؤول'],
      'Autorisation manager': ['Manager approval', 'موافقة المسؤول'],
      'Ouvrir le tiroir sans vente': ['Open the drawer without a sale', 'فتح الدرج دون بيع'],
      'Effacer': ['Clear', 'مسح'],
      'Tiroir ouvert (démo)': ['Drawer opened (demo)', 'فُتح الدرج (تجريبي)'],
      'Crédit': ['Credit', 'دين'],
      'Partagé': ['Split', 'مقسَّم'],
      'Virement': ['Bank transfer', 'تحويل'],
      'mode inconnu': ['unknown method', 'طريقة غير معروفة'],
      'sans numéro': ['no number', 'بدون رقم'],
      'identifiant indisponible': ['ID unavailable', 'المعرّف غير متاح'],
      /* La passation de caisse */
      'Passation de caisse': ['Till handover', 'تسليم الصندوق'],
      '{x} termine son poste, compte le tiroir.': ['{x} is ending the shift and counts the drawer.', '{x} ينهي المناوبة ويعدّ الدرج.'],
      'Le caissier sortant compte le tiroir.': ['The outgoing cashier counts the drawer.', 'يعدّ الصندوقي المسلّم الدرج.'],
      'Poste ouvert à': ['Shift opened at', 'فُتحت المناوبة على'],
      'Durée du poste': ['Shift length', 'مدة المناوبة'],
      'Tiroir-caisse, attendu': ['Cash drawer, expected', 'درج النقود، المتوقع'],
      'Fond du poste': ['Shift float', 'رصيد بداية المناوبة'],
      'Espèces encaissées': ['Cash taken', 'النقد المحصّل'],
      'Pourboires espèces': ['Cash tips', 'إكراميات نقدية'],
      'Entrées de caisse': ['Cash in', 'مداخيل الصندوق'],
      'Sorties de caisse': ['Cash out', 'مخارج الصندوق'],
      'Attendu en caisse': ['Expected in the till', 'المتوقع في الصندوق'],
      'Espèces comptées dans le tiroir': ['Cash counted in the drawer', 'النقد المعدود في الدرج'],
      "Écart avec l'attendu": ['Difference from expected', 'الفرق عن المتوقع'],
      'Reprise de caisse': ['Taking over the till', 'استلام الصندوق'],
      'Le caissier entrant recompte le tiroir, puis reprend la caisse.': ['The incoming cashier recounts the drawer, then takes over the till.', 'يعيد الصندوقي المستلم عدّ الدرج ثم يستلم الصندوق.'],
      'Caissier entrant': ['Incoming cashier', 'الصندوقي المستلم'],
      'Caissier sortant': ['Outgoing cashier', 'الصندوقي المسلّم'],
      'Caissière': ['Cashier', 'صندوقية'],
      'Caisse à reprendre': ['Till to take over', 'الصندوق المراد استلامه'],
      'Recompte les espèces': ['Recount the cash', 'أعد عدّ النقود'],
      'Choisis le caissier entrant.': ['Pick the incoming cashier.', 'اختر الصندوقي المستلم.'],
      'recompte le tiroir pour vérifier.': ['recounts the drawer to check.', 'يعيد عدّ الدرج للتحقق.'],
      'Les deux comptes concordent,': ['Both counts match,', 'العدّان متطابقان،'],
      '. Caisse vérifiée.': ['. Till checked.', '. تم التحقق من الصندوق.'],
      'Écart de': ['A difference of', 'فرق قدره'],
      'avec le sortant, recomptez ensemble.': ['with the outgoing cashier, count together again.', 'مع الصندوقي المسلّم، أعيدا العدّ معًا.'],
      'Confirmer la passation': ['Confirm the handover', 'تأكيد التسليم'],
      'Passation enregistrée': ['Handover recorded', 'سُجّل التسليم'],
      '{x} prend la caisse': ['{x} takes over the till', '{x} يستلم الصندوق'],
      'La caisse a changé de main.': ['The till has changed hands.', 'انتقل الصندوق إلى يد أخرى.'],
      'Imprimer le bon': ['Print the slip', 'طباعة الوصل'],
      'Bon de passation': ['Handover slip', 'وصل التسليم'],
      'Espèces comptées': ['Cash counted', 'النقد المعدود'],
      'Écart constaté': ['Difference found', 'الفرق المسجّل'],
      'Caisse transmise': ['Till handed over', 'الصندوق المسلَّم'],
      "Bon de passation ouvert dans l'impression système": ['Handover slip opened in the system print dialog', 'فُتح وصل التسليم في نافذة الطباعة'],
      'Aucun autre poste enregistré sur cette caisse. Ajoutez un caissier depuis le tableau de bord (Équipe) avant de passer la main.': ['No other cashier is set up on this till. Add one from the dashboard (Team) before handing over.', 'لا يوجد صندوقي آخر مسجّل على هذا الصندوق. أضف صندوقيًا من لوحة التحكم (الفريق) قبل التسليم.'],
      /* L'écran cuisine */
      'File de préparation': ['Prep queue', 'قائمة التحضير'],
      'mise à jour en direct': ['live updates', 'تحديث مباشر'],
      'Toutes': ['All', 'الكل'],
      'Historique': ['History', 'السجل'],
      'Nouvelles': ['New', 'جديدة'],
      'Nouvelle': ['New', 'جديدة'],
      'Accepter': ['Accept', 'قبول'],
      "Prêtes aujourd'hui": ['Ready today', 'جاهزة اليوم'],
      'Prête {n}:{n}': ['Ready {n}:{n}', 'جاهزة {n}:{n}'],
      'Agrandir #{n}': ['Enlarge #{n}', 'تكبير #{n}'],
      'Agrandir {n}': ['Enlarge {n}', 'تكبير {n}'],
      'Table {n}': ['Table {n}', 'الطاولة {n}'],
      'Aucune commande active': ['No active orders', 'لا توجد طلبات نشطة'],
      /* Stock & appro */
      'Stock & appro': ['Stock & supplies', 'المخزون والتموين'],
      'Réception': ['Receiving', 'الاستلام'],
      "Vue d'ensemble": ['Overview', 'نظرة عامة'],
      'Articles': ['Items', 'المواد'],
      'Approvisionnement': ['Supply', 'التموين'],
      'Valeur du stock': ['Stock value', 'قيمة المخزون'],
      '{n} articles suivis': ['{n} items tracked', 'مواد متتبَّعة: {n}'],
      'En alerte': ['On alert', 'في حالة تنبيه'],
      '{n} en rupture': ['{n} out of stock', 'نافدة: {n}'],
      'Prochaine livraison': ['Next delivery', 'التسليم القادم'],
      'Fournisseurs': ['Suppliers', 'الموردون'],
      'actifs': ['active', 'نشطون'],
      'Réceptionner du stock': ['Receive stock', 'استلام مخزون'],
      'Alertes stock': ['Stock alerts', 'تنبيهات المخزون'],
      'Perte': ['Loss', 'خسارة'],
      'Commander': ['Order', 'اطلب'],
      'Bas': ['Low', 'منخفض'],
      'Tout est au niveau, aucune alerte.': ['Everything is stocked, no alerts.', 'كل شيء في المستوى، لا تنبيهات.'],
      'Déclarer une perte': ['Record a loss', 'تسجيل خسارة'],
      'Déclarer en perte': ['Record as a loss', 'تسجيل كخسارة'],
      'Avarié / Abîmé': ['Spoiled / Damaged', 'تالف / متضرر'],
      'Périmé': ['Expired', 'منتهي الصلاحية'],
      'Autre perte': ['Other loss', 'خسارة أخرى'],
      '{n} {x} en stock': ['{n} {x} in stock', '{n} {x} في المخزون'],
      'niveau par {x}': ['par level {x}', 'المستوى المرجعي {x}'],
      'Niveau par ({x})': ['Par level ({x})', 'المستوى المرجعي ({x})'],
      /* L'équipe */
      'shift en cours': ['shift in progress', 'مناوبة جارية'],
      'En service depuis {n}:{n}': ['On shift since {n}:{n}', 'في الخدمة منذ {n}:{n}'],
      '{n} table active': ['{n} active table', 'طاولة نشطة: {n}'],
      '{n} tables actives': ['{n} active tables', 'طاولات نشطة: {n}'],
      'Pas en service': ['Off shift', 'خارج الخدمة'],
      'fin de shift': ['shift ended', 'انتهت المناوبة'],
      "Message à toute l'équipe": ['Message the whole team', 'رسالة إلى كل الفريق'],
      'Envoyer un message': ['Send a message', 'إرسال رسالة'],
      'Donner une pause': ['Give a break', 'منح استراحة'],
      'Fin de pause': ['End the break', 'إنهاء الاستراحة'],
      'Sur le service': ['On shift', 'في الخدمة'],
      "Aucun membre dans l'équipe": ['No team members yet', 'لا يوجد أعضاء في الفريق'],
      'Ajoutez votre équipe depuis votre tableau de bord': ['Add your team from your dashboard', 'أضف فريقك من لوحة التحكم'],
      '. Elle apparaîtra ici automatiquement.': ['. It will show here automatically.', '. سيظهر هنا تلقائيًا.'],
      'Aucun serveur actif.': ['No active waiter.', 'لا يوجد نادل نشط.'],
      /* La disponibilité du menu (assets/caisse-menu-availability.js) */
      'Masquez immédiatement les articles épuisés': ['Hide sold-out items at once', 'أخفِ الأصناف النافدة فورًا'],
      'Le menu publié est indisponible. Vérifiez la connexion puis réessayez.': ['The published menu is unavailable. Check the connection and try again.', 'القائمة المنشورة غير متاحة. تحقق من الاتصال ثم أعد المحاولة.'],
      'Disponibilité du menu': ['Menu availability', 'توفر القائمة'],
      'Rechercher un article…': ['Search an item…', 'ابحث عن صنف…'],
      'Chargement du menu…': ['Loading the menu…', 'جارٍ تحميل القائمة…'],
      'Le plat disparaît d’OrderPro et de l’app équipe. Il revient tout seul à l’heure choisie.': ['The dish disappears from OrderPro and the team app. It comes back by itself at the time you choose.', 'يختفي الطبق من OrderPro ومن تطبيق الفريق، ويعود تلقائيًا في الوقت المختار.'],
      'Jusqu’à nouvel ordre': ['Until further notice', 'حتى إشعار آخر'],
      'Pendant 1 heure': ['For 1 hour', 'لمدة ساعة'],
      'Jusqu’à la fin du service': ['Until the end of service', 'حتى نهاية الخدمة'],
      'Jusqu’à': ['Until', 'حتى'],
      'Tout est disponible': ['Everything is available', 'كل شيء متاح'],
      '{n} indisponible': ['{n} unavailable', 'غير متاح: {n}'],
      '{n} indisponibles': ['{n} unavailable', 'غير متاحة: {n}'],
      'Sans catégorie': ['No category', 'بدون فئة'],
      'Masquer « {x} »': ['Hide « {x} »', 'إخفاء « {x} »'],
      'Masquer {x}': ['Hide {x}', 'إخفاء {x}'],
      'Rendre disponible {x}': ['Make {x} available', 'إتاحة {x}'],
      '{x} est de nouveau disponible': ['{x} is available again', '{x} متاح من جديد'],
      '{x} masqué sur OrderPro et l’app équipe': ['{x} hidden on OrderPro and the team app', 'أُخفي {x} في OrderPro وتطبيق الفريق'],
      'Modification non enregistrée': ['Change not saved', 'لم يُحفظ التعديل'],
      'vérifiez la connexion': ['check the connection', 'تحقق من الاتصال'],
      'Revient à {n}:{n}': ['Back at {n}:{n}', 'يعود على {n}:{n}'],
      'Revient demain à {n}:{n}': ['Back tomorrow at {n}:{n}', 'يعود غدًا على {n}:{n}'],
      'Revient le {n}/{n} à {n}:{n}': ['Back on {n}/{n} at {n}:{n}', 'يعود يوم {n}/{n} على {n}:{n}'],
      'revient à {n}:{n}': ['back at {n}:{n}', 'يعود على {n}:{n}'],
      'revient demain à {n}:{n}': ['back tomorrow at {n}:{n}', 'يعود غدًا على {n}:{n}'],
      'revient le {n}/{n} à {n}:{n}': ['back on {n}/{n} at {n}:{n}', 'يعود يوم {n}/{n} على {n}:{n}'],
    };
    Object.keys(R).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = R[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = R[k][1];
    });
  })();

  /* Les écrans profonds de la boutique (2026-10-21) : l'inventaire physique,
     le champ de scan, le rail et le réglage des imprimantes. Relevé en
     demandant au traducteur chaque phrase affichée. */
  (function () {
    var R = {
      'Boutique': ['Shop', 'المتجر'],
      'Imprimantes': ['Printers', 'الطابعات'],
      'navigation': ['navigation', 'التنقل'],
      'Profils': ['Profiles', 'الملفات'],
      'ou': ['or', 'أو'],
      'Scannez ou tapez un code-barres…': ['Scan or type a barcode…', 'امسح أو اكتب رمز الباركود…'],
      'Date': ['Date', 'التاريخ'],
      /* L'inventaire physique */
      "Saisie à l'aveugle des quantités réelles. La transmission sera soumise à la validation du propriétaire.": ['Blind entry of the real quantities. The owner approves the submission.', 'إدخال الكميات الفعلية دون رؤية المتوقَّع. يخضع الإرسال لموافقة المالك.'],
      'Employé :': ['Employee:', 'الموظف:'],
      '{n} / {n} articles ({n}%)': ['{n} / {n} items ({n}%)', '{n} / {n} مادة ({n}%)'],
      'Tous ({n})': ['All ({n})', 'الكل ({n})'],
      'Comptés ({n})': ['Counted ({n})', 'المعدودة ({n})'],
      'Restants ({n})': ['Remaining ({n})', 'المتبقية ({n})'],
      'Emplacement': ['Location', 'الموقع'],
      'Article': ['Item', 'المادة'],
      'Déclinaison / Réf': ['Variant / Ref', 'المتغير / المرجع'],
      'État': ['Status', 'الحالة'],
      'Enregistrer le brouillon': ['Save the draft', 'حفظ المسودة'],
      'Sauvegarde locale hors ligne': ['Saved locally, offline', 'حفظ محلي دون اتصال'],
      'Vérifier et transmettre ({n})': ['Review and submit ({n})', 'مراجعة وإرسال ({n})'],
      'Catégorie: {x}': ['Category: {x}', 'الفئة: {x}'],
      'Emplacement: {x}': ['Location: {x}', 'الموقع: {x}'],
      /* Le réglage des imprimantes */
      'Largeur papier: {x}': ['Paper width: {x}', 'عرض الورق: {x}'],
      "Format d'étiquette: {x}": ['Label size: {x}', 'مقاس الملصق: {x}'],
      'Modèle: {x}': ['Model: {x}', 'الطراز: {x}'],
      'Générique (ESC/POS)': ['Generic (ESC/POS)', 'عام (ESC/POS)'],
    };
    Object.keys(R).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = R[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = R[k][1];
    });
  })();

  /* Le scan continu (assets/retail-scan.js), partagé par la boutique,
     l'épicerie et les autres commerces de détail : la caméra, le panier,
     l'encaissement en parts et la création d'un produit au scan (2026-10-21). */
  (function () {
    var R = {
      'Scan continu': ['Continuous scan', 'مسح مستمر'],
      'Ouvrir le scan continu': ['Open continuous scan', 'فتح المسح المستمر'],
      'Scan continu et encaissement': ['Continuous scan and checkout', 'المسح المستمر والاستخلاص'],
      'Catalogue, stock, promotions et encaissement dans un seul geste': ['Catalogue, stock, promotions and checkout in one move', 'الكتالوج والمخزون والعروض والاستخلاص في حركة واحدة'],
      'En ligne · synchronisation active': ['Online · sync on', 'متصل · المزامنة نشطة'],
      'synchronisation active': ['sync on', 'المزامنة نشطة'],
      'Hors ligne · ventes en attente': ['Offline · sales waiting', 'غير متصل · مبيعات في الانتظار'],
      'ventes en attente': ['sales waiting', 'مبيعات في الانتظار'],
      'Caméra bloquée': ['Camera blocked', 'الكاميرا محظورة'],
      '· Safari : menu de la page → Réglages du site → Caméra → Autoriser': ['· Safari: page menu → Website Settings → Camera → Allow', '· Safari: قائمة الصفحة ← إعدادات الموقع ← الكاميرا ← سماح'],
      'Aucune caméra détectée': ['No camera found', 'لم يتم العثور على كاميرا'],
      '· la saisie manuelle reste disponible': ['· you can still type the code', '· الإدخال اليدوي ما زال متاحًا'],
      'Caméra déjà utilisée': ['Camera already in use', 'الكاميرا قيد الاستخدام'],
      '· fermez l’autre app puis touchez Relancer': ['· close the other app, then tap Retry', '· أغلق التطبيق الآخر ثم المس إعادة المحاولة'],
      'Caméra incompatible': ['Camera not supported', 'الكاميرا غير متوافقة'],
      '· touchez Relancer pour réessayer': ['· tap Retry to try again', '· المس إعادة المحاولة'],
      'Lecteur indisponible hors ligne': ['Reader unavailable offline', 'القارئ غير متاح دون اتصال'],
      '· reconnectez une fois pour mettre Kiwi à jour': ['· go online once to update Kiwi', '· اتصل مرة واحدة لتحديث Kiwi'],
      'Caméra indisponible': ['Camera unavailable', 'الكاميرا غير متاحة'],
      '· touchez Relancer ou saisissez le code': ['· tap Retry or type the code', '· المس إعادة المحاولة أو اكتب الرمز'],
      'Caméra non disponible': ['Camera not available', 'الكاميرا غير متوفرة'],
      '· ouvrez Kiwi sur https://kiwi-os.com dans Safari, ou saisissez le code': ['· open Kiwi at https://kiwi-os.com in Safari, or type the code', '· افتح Kiwi على https://kiwi-os.com في Safari، أو اكتب الرمز'],
      'Ouverture de la caméra…': ['Opening the camera…', 'جارٍ فتح الكاميرا…'],
      '· autorisez Safari si une demande apparaît': ['· allow Safari if it asks', '· اسمح لـ Safari إذا ظهر طلب'],
      'Préparation de la caméra…': ['Preparing the camera…', 'جارٍ تحضير الكاميرا…'],
      'Relancer': ['Retry', 'إعادة المحاولة'],
      'Lampe': ['Torch', 'المصباح'],
      'Scan actif': ['Scanning', 'المسح نشط'],
      'Lecture continue active': ['Continuous reading on', 'القراءة المستمرة نشطة'],
      'lecture continue active': ['continuous reading on', 'القراءة المستمرة نشطة'],
      'créé et ajouté': ['created and added', 'تم الإنشاء والإضافة'],
      'Scannez sans interrompre la vente': ['Scan without stopping the sale', 'امسح دون إيقاف البيع'],
      'Le prix, le stock et la promotion apparaissent ici.': ['Price, stock and promotion show here.', 'يظهر السعر والمخزون والعرض هنا.'],
      'Le prochain scan arrive ici.': ['The next scan lands here.', 'يظهر المسح التالي هنا.'],
      'Panier': ['Basket', 'السلة'],
      'Vider': ['Clear', 'إفراغ'],
      'Total à encaisser': ['Total to collect', 'المجموع للاستخلاص'],
      'Scanner ou saisir un code…': ['Scan or type a code…', 'امسح أو اكتب رمزًا…'],
      'Lire le code': ['Read the code', 'قراءة الرمز'],
      'en stock': ['in stock', 'في المخزون'],
      '{n} en stock': ['{n} in stock', '{n} في المخزون'],
      'Ajouté': ['Added', 'تمت الإضافة'],
      'Stock atteint pour {x}': ['Stock limit reached for {x}', 'تم بلوغ المخزون لـ {x}'],
      'Stock limité à {n}': ['Stock limited to {n}', 'المخزون محدود في {n}'],
      'Article en rupture, impossible de l’ajouter': ['Out of stock, cannot be added', 'المنتج نفد، لا يمكن إضافته'],
      'Code incomplet ou illisible': ['Code incomplete or unreadable', 'رمز ناقص أو غير مقروء'],
      'Code inconnu': ['Unknown code', 'رمز غير معروف'],
      'Catalogue indisponible sur cette caisse': ['Catalogue unavailable on this till', 'الكتالوج غير متاح في هذا الصندوق'],
      'Fiche trouvée': ['Product found', 'تم العثور على المنتج'],
      'vérifiez le prix et le stock': ['check the price and stock', 'تحقق من السعر والمخزون'],
      'Créer ce produit': ['Create this product', 'إنشاء هذا المنتج'],
      '· la fiche sera immédiatement partagée avec le dashboard.': ['· it is shared with the dashboard straight away.', '· ستتم مشاركته مع لوحة القيادة فورًا.'],
      'Nom du produit': ['Product name', 'اسم المنتج'],
      'Prix': ['Price', 'السعر'],
      'Coût unitaire': ['Unit cost', 'التكلفة للوحدة'],
      'Stock initial': ['Opening stock', 'المخزون الأولي'],
      'Stock initial · création au scan': ['Opening stock · created at scan', 'المخزون الأولي · إنشاء عند المسح'],
      'Catégorie': ['Category', 'الفئة'],
      'Sans catégorie': ['No category', 'بدون فئة'],
      'Nouvelle catégorie': ['New category', 'فئة جديدة'],
      'Nouvelle catégorie…': ['New category…', 'فئة جديدة…'],
      'Nouveaux produits': ['New products', 'منتجات جديدة'],
      'Créer et ajouter': ['Create and add', 'إنشاء وإضافة'],
      'Ignorer': ['Skip', 'تجاهل'],
      'Le nom du produit est requis': ['The product name is required', 'اسم المنتج مطلوب'],
      'Le prix est invalide': ['The price is invalid', 'السعر غير صالح'],
      'Création impossible': ['Could not create', 'تعذّر الإنشاء'],
      'Créé dans le catalogue partagé': ['Created in the shared catalogue', 'تم الإنشاء في الكتالوج المشترك'],
      'Encaissement': ['Checkout', 'الاستخلاص'],
      'Reste à régler': ['Left to pay', 'الباقي للأداء'],
      'Ajouter la part': ['Add the part', 'إضافة الجزء'],
      'Ajoutez une ou plusieurs parts. La vente n’est validée qu’une seule fois quand le solde atteint zéro.': ['Add one or more parts. The sale is confirmed once, when the balance reaches zero.', 'أضف جزءًا أو أكثر. لا يُؤكَّد البيع إلا مرة واحدة عندما يصل الرصيد إلى الصفر.'],
      'Terminer le solde': ['Pay the rest', 'أداء الباقي'],
      'Crédit client': ['Customer credit', 'دين الزبون'],
      'Choisir un client…': ['Choose a customer…', 'اختر زبونًا…'],
      'Choisissez un client avant de mettre une somme à crédit.': ['Choose a customer before putting an amount on credit.', 'اختر زبونًا قبل تسجيل مبلغ كدين.'],
      'Le montant doit être compris entre 0,01 MAD et le solde restant.': ['The amount must be between 0,01 MAD and the balance left.', 'يجب أن يكون المبلغ بين 0,01 MAD والرصيد المتبقي.'],
      'Confirmation du lecteur en cours…': ['Waiting for the reader to confirm…', 'في انتظار تأكيد القارئ…'],
      'Lecteur de carte indisponible. Aucun paiement n’a été enregistré.': ['Card reader unavailable. No payment was recorded.', 'قارئ البطاقات غير متاح. لم يُسجَّل أي أداء.'],
      'Paiement carte non confirmé. Aucun montant n’a été ajouté.': ['Card payment not confirmed. No amount was added.', 'لم يُؤكَّد الأداء بالبطاقة. لم يُضَف أي مبلغ.'],
      'Une part est déjà confirmée. Encaissez le solde restant avant de fermer.': ['A part is already confirmed. Collect the rest before closing.', 'تم تأكيد جزء بالفعل. استخلص الباقي قبل الإغلاق.'],
      'Une part est déjà confirmée. Encaissez le solde restant pour terminer la vente.': ['A part is already confirmed. Collect the rest to finish the sale.', 'تم تأكيد جزء بالفعل. استخلص الباقي لإنهاء البيع.'],
      'Journal de ventes indisponible. Les parts confirmées et le panier sont conservés : réessayez après avoir rafraîchi la caisse.': ['Sales log unavailable. Confirmed parts and the basket are kept: try again after refreshing the till.', 'سجل المبيعات غير متاح. الأجزاء المؤكدة والسلة محفوظة: أعد المحاولة بعد تحديث الصندوق.'],
      'Vente enregistrée': ['Sale recorded', 'تم تسجيل البيع'],
      'Le stock, le journal et le dashboard ont reçu la même vente.': ['Stock, the sales log and the dashboard got the same sale.', 'تلقى المخزون والسجل ولوحة القيادة نفس البيع.'],
      'Imprimer': ['Print', 'طباعة'],
      'Ticket imprimé': ['Receipt printed', 'تمت طباعة التذكرة'],
      'Boîte d’impression ouverte.': ['Print dialog opened.', 'تم فتح نافذة الطباعة.'],
      'Impression impossible. La vente reste enregistrée.': ['Could not print. The sale stays recorded.', 'تعذّرت الطباعة. البيع ما زال مسجلًا.'],
      'Impression non confirmée. La vente reste enregistrée.': ['Printing not confirmed. The sale stays recorded.', 'لم تُؤكَّد الطباعة. البيع ما زال مسجلًا.'],
      'Imprimante Kiwi indisponible.': ['Kiwi printer unavailable.', 'طابعة Kiwi غير متاحة.'],
      'Merci pour votre visite': ['Thank you for your visit', 'شكرًا على زيارتكم'],
      'Continuer': ['Continue', 'متابعة'],
      'Stock disponible': ['Stock available', 'المخزون المتاح'],
    };
    Object.keys(R).forEach(function (k) {
      if (!DICT.en[k]) DICT.en[k] = R[k][0];
      if (!DICT.ar[k]) DICT.ar[k] = R[k][1];
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
    /* « mer. 21 oct., 06:03 » : la liste Vendus de la boutique met une virgule
       avant l'heure. */
    ',?\\s*(?:\\d{1,2}:\\d{2})?$');
  var DATE_TOK = /(lun|mar|mer|jeu|ven|sam|dim|janv|févr|avr|juil|sept|oct|nov|déc|auj)\.|\b(mars|mai|juin|août|hier|demain|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche|janvier|février|avril|juillet|septembre|octobre|novembre|décembre)(?![A-Za-zÀ-ÿ])/g;

  var VERTICAL_DICT = { pressing: { en: {}, ar: {} }, hotel: { en: {}, ar: {} } };
  var verticalCache = {};
  /* Pressing till: French keys, English and Modern Standard Arabic. */
  (function () {
    var R = {
      "Après-demain": ["Day after tomorrow", "بعد غد"],
      "Express": ["Express", "مستعجل"],
      "dépôt avant {n}:{n}": ["drop-off before {n}:{n}", "الإيداع قبل {n}:{n}"],
      "Retrait à midi": ["Pick up at noon", "الاستلام عند الظهر"],
      "Service standard": ["Standard service", "الخدمة العادية"],
      "Premier créneau disponible": ["First available slot", "أول موعد متاح"],
      "Délai confortable": ["More time", "مهلة مريحة"],
      "Blanc": ["White", "أبيض"],
      "Noir": ["Black", "أسود"],
      "Gris": ["Grey", "رمادي"],
      "Bleu": ["Blue", "أزرق"],
      "Rouge": ["Red", "أحمر"],
      "Beige": ["Beige", "بيج"],
      "Vert": ["Green", "أخضر"],
      "Marron": ["Brown", "بني"],
      "Tache col": ["Collar stain", "بقعة على الياقة"],
      "Tache manche": ["Sleeve stain", "بقعة على الكم"],
      "Bouton manquant": ["Missing button", "زر مفقود"],
      "Ourlet à reprendre": ["Hem to fix", "حاشية تحتاج إلى إصلاح"],
      "Fermeture abîmée": ["Damaged zip", "سحّاب تالف"],
      "Délicat": ["Delicate", "حساس"],
      "Mon pressing": ["My laundry", "مصبنتي"],
      "Facture fin de mois": ["Month-end invoice", "فاتورة نهاية الشهر"],
      "Reçu": ["Received", "تم الاستلام"],
      "En traitement": ["Processing", "قيد المعالجة"],
      "Annulée": ["Cancelled", "ملغاة"],
      "Annulé": ["Cancelled", "ملغى"],
      "Client de passage": ["Walk-in customer", "زبون عابر"],
      "{x}, enregistré hors-ligne ({n} en attente)": ["{x}, saved offline ({n} pending)", "{x}، محفوظ دون اتصال ({n} في الانتظار)"],
      "Pressing": ["Laundry", "المصبنة"],
      "Mode jour": ["Light mode", "الوضع النهاري"],
      "Passer en mode jour": ["Switch to light mode", "التبديل إلى الوضع النهاري"],
      "Passer en mode nuit": ["Switch to dark mode", "التبديل إلى الوضع الليلي"],
      "Le même Kiwi pour": ["The same Kiwi for", "نفس Kiwi لـ"],
      "votre comptoir et votre atelier": ["your counter and workshop", "شباككم وورشتكم"],
      ", un seul compte.": [", one account.", "، حساب واحد."],
      "Comptoir": ["Counter", "الشباك"],
      "Commandes": ["Orders", "الطلبات"],
      "Retrait": ["Pickup", "الاستلام"],
      "État réseau détecté par cet appareil": ["Network status on this device", "حالة الشبكة على هذا الجهاز"],
      "Trouver un article": ["Find an item", "البحث عن منتج"],
      "Rechercher un article": ["Search items", "البحث عن منتج"],
      "Rangement": ["Storage", "التخزين"],
      "Hors-ligne, les changements restent sur cette tablette et seront reproposés au retour du réseau.": ["Offline, changes stay on this tablet and will be retried when the network returns.", "دون اتصال، تبقى التغييرات على هذا الجهاز وتُعاد المحاولة عند عودة الشبكة."],
      "Comptoir de dépôt": ["Drop-off counter", "شباك الإيداع"],
      "touchez pour ajouter": ["tap to add", "اضغط للإضافة"],
      "Terminal verrouillé": ["Till locked", "الصندوق مقفل"],
      "Aucun article trouvé": ["No items found", "لم يتم العثور على أي منتج"],
      "Essayez un autre nom ou choisissez une autre catégorie.": ["Try another name or category.", "جرّب اسمًا آخر أو اختر فئة أخرى."],
      "Attacher un client": ["Add a customer", "إضافة زبون"],
      "Recherche par téléphone, jamais par ticket": ["Search by phone, never by ticket", "البحث بالهاتف، وليس بالتذكرة"],
      "sans téléphone": ["no phone", "دون هاتف"],
      "Touchez un vêtement dans la grille, chaque pièce recevra son étiquette.": ["Tap a garment in the grid. Each piece gets a label.", "اضغط على لباس في الشبكة، وستحصل كل قطعة على ملصقها."],
      "Prêt le": ["Ready on", "جاهز في"],
      "Date de retrait, modifiable": ["Pickup date, editable", "تاريخ الاستلام، قابل للتعديل"],
      "Maximum {n} pièces par ligne": ["Maximum {n} pieces per line", "الحد الأقصى {n} قطعة لكل سطر"],
      "Pièces du costume": ["Suit pieces", "قطع البدلة"],
      "combinables, ex. lavage + repassage": ["can combine, e.g. wash + iron", "قابلة للجمع، مثل الغسيل + الكي"],
      "Notes usuelles": ["Common notes", "ملاحظات شائعة"],
      "Note libre (ex. « ourlet 2 cm »)…": ["Free note (e.g. “2 cm hem”)…", "ملاحظة حرة (مثل «حاشية 2 سم»)…"],
      "Cadrez la zone (tache, accroc, bouton)…": ["Frame the area (stain, tear, button)…", "ضع المنطقة داخل الإطار (بقعة، تمزق، زر)…"],
      "Prendre la photo": ["Take photo", "التقاط صورة"],
      "Photo état {n} enregistrée, jointe à la pièce": ["Condition photo {n} saved and attached to the piece", "تم حفظ صورة الحالة {n} وإرفاقها بالقطعة"],
      "Photo non enregistrée": ["Photo not saved", "لم تُحفظ الصورة"],
      "vérifiez l’accès à l’appareil": ["check camera access", "تحقق من الوصول إلى الكاميرا"],
      "Aucun client pour {x}": ["No customer for {x}", "لا يوجد زبون لـ {x}"],
      "Client de passage, sans fiche": ["Walk-in, no profile", "زبون عابر، دون بطاقة"],
      "Nom et prénom": ["Full name", "الاسم الكامل"],
      "Créer la fiche": ["Create profile", "إنشاء البطاقة"],
      "06… ou nom du client": ["06… or customer name", "06… أو اسم الزبون"],
      "Au pressing on cherche par téléphone, le client n'a jamais son ticket.": ["Search by phone. Customers rarely have their ticket.", "ابحث بالهاتف، فالزبون لا يحمل تذكرته عادةً."],
      "{x}, compte B2B, remise –{n} % appliquée": ["{x}, B2B account, –{n} % discount applied", "{x}، حساب مهني، تم تطبيق تخفيض –{n} %"],
      "{x}, {n} commande, bienvenue": ["{x}, {n} order, welcome", "{x}، {n} طلب، مرحبًا"],
      "{x}, {n} commandes, bienvenue": ["{x}, {n} orders, welcome", "{x}، {n} طلبات، مرحبًا"],
      "Numéro valide requis": ["Valid phone number required", "رقم هاتف صالح مطلوب"],
      "pour l’étranger, ajoutez + et l’indicatif pays": ["for abroad, add + and the country code", "للخارج، أضف + ورمز البلد"],
      "Ce numéro appartient déjà à {x}": ["This number already belongs to {x}", "هذا الرقم مسجل بالفعل باسم {x}"],
      "{x}, client reconnu": ["{x}, customer recognised", "{x}، تم التعرف على الزبون"],
      "Prêt pour quand ?": ["When should it be ready?", "متى يجب أن يكون جاهزًا؟"],
      "Choisissez un créneau réaliste. Il sera imprimé sur le ticket et suivi par l'atelier.": ["Choose a realistic slot. It prints on the ticket for the workshop to follow.", "اختر موعدًا واقعيًا. سيُطبع على التذكرة لتتبعه الورشة."],
      "Autre date": ["Other date", "تاريخ آخر"],
      "Choisissez une date de retrait dans le futur": ["Choose a future pickup date", "اختر تاريخ استلام في المستقبل"],
      "La date de retrait doit être dans le futur": ["Pickup date must be in the future", "يجب أن يكون تاريخ الاستلام في المستقبل"],
      "Choisissez le client, puis la date de retrait": ["Choose the customer, then the pickup date", "اختر الزبون ثم تاريخ الاستلام"],
      "Patente": ["Business tax ID", "رقم الضريبة المهنية"],
      "propulsé par Kiwi": ["powered by Kiwi", "بدعم من Kiwi"],
      "Tél": ["Phone", "الهاتف"],
      "Déposé": ["Dropped off", "تم الإيداع"],
      "Sous-total": ["Subtotal", "المجموع الفرعي"],
      "Pièces": ["Pieces", "القطع"],
      "merci, l'lah ikhellik": ["thank you", "شكرًا لكم"],
      "PDF prêt": ["PDF ready", "ملف PDF جاهز"],
      "ticket + duplicata": ["ticket + copy", "التذكرة + النسخة"],
      "Impression système, ticket + duplicata": ["System print, ticket + copy", "طباعة النظام، التذكرة + النسخة"],
      "Sur compte": ["On account", "على الحساب"],
      "Solde au retrait": ["Balance at pickup", "الباقي عند الاستلام"],
      "Ticket non imprimé, imprimante injoignable": ["Ticket not printed, printer unreachable", "لم تُطبع التذكرة، تعذّر الوصول إلى الطابعة"],
      "Ticket client imprimé, duplicata non imprimé": ["Customer ticket printed, copy not printed", "تمت طباعة تذكرة الزبون، ولم تُطبع النسخة"],
      "Ticket + duplicata": ["Ticket + copy", "التذكرة + النسخة"],
      "Tickets imprimés, {n} étiquettes envoyées": ["Tickets printed, {n} labels sent", "تمت طباعة التذاكر وإرسال {n} ملصقات"],
      "non imprimée": ["not printed", "لم تُطبع"],
      "Le client garde son ticket. Le duplicata atelier reste avec la commande. Chaque pièce reçoit une étiquette lisible au nom du client.": ["The customer keeps the ticket. The workshop copy stays with the order. Each piece gets a readable label with the customer’s name.", "يحتفظ الزبون بتذكرته. تبقى نسخة الورشة مع الطلب. تحصل كل قطعة على ملصق واضح باسم الزبون."],
      "Sur chaque étiquette : nom du client, commande, pièce, article et service. Rien d'autre.": ["Each label has the customer name, order, piece, item and service. Nothing else.", "على كل ملصق: اسم الزبون والطلب والقطعة والمنتج والخدمة فقط."],
      "Imprimer 2 tickets": ["Print 2 tickets", "طباعة تذكرتين"],
      "Paiement carte en cours": ["Card payment in progress", "الأداء بالبطاقة جارٍ"],
      "attendez la réponse du lecteur": ["wait for the reader", "انتظر رد القارئ"],
      "Encaisser le solde": ["Collect balance", "استخلاص الباقي"],
      "Minimum {n} MAD": ["Minimum {n} MAD", "الحد الأدنى {n} MAD"],
      "indisponible pour ce ticket": ["unavailable for this ticket", "غير متاح لهذه التذكرة"],
      "Le reste au retrait": ["Rest at pickup", "الباقي عند الاستلام"],
      "Sur compte B2B": ["On B2B account", "على الحساب المهني"],
      ", facture fin de mois": [", month-end invoice", "، فاتورة نهاية الشهر"],
      "Payer maintenant": ["Pay now", "الأداء الآن"],
      "Espèces ou carte à la dépose": ["Cash or card at drop-off", "نقدًا أو بالبطاقة عند الإيداع"],
      "Acompte à la dépose": ["Deposit at drop-off", "تسبيق عند الإيداع"],
      "Payer au retrait": ["Pay at pickup", "الأداء عند الاستلام"],
      "Le classique du pressing, solde sur le ticket": ["Standard laundry payment, balance on ticket", "الأداء المعتاد للمصبنة، الباقي على التذكرة"],
      "Rendu calculé": ["Change calculated", "الباقي محسوب"],
      "Solde": ["Balance", "الرصيد"],
      "à encaisser au retrait": ["to collect at pickup", "للاستخلاص عند الاستلام"],
      "Sur compte B2B, ajouté à la facture du mois": ["On B2B account, added to monthly invoice", "على الحساب المهني، يُضاف إلى فاتورة الشهر"],
      "Un acompte doit être d’au moins {n} MAD": ["A deposit must be at least {n} MAD", "يجب ألا يقل التسبيق عن {n} MAD"],
      "Acompte": ["Deposit", "تسبيق"],
      "Encaisser l'acompte": ["Collect deposit", "استخلاص التسبيق"],
      "Entrez un montant.": ["Enter an amount.", "أدخل مبلغًا."],
      "Acompte minimum {n} MAD": ["Minimum deposit {n} MAD", "الحد الأدنى للتسبيق {n} MAD"],
      "il manque {n} MAD": ["{n} MAD short", "ينقص {n} MAD"],
      "Un acompte ne peut pas dépasser le total de {n} MAD": ["A deposit cannot exceed the total of {n} MAD", "لا يمكن أن يتجاوز التسبيق المجموع البالغ {n} MAD"],
      "Acompte requis entre {n} et {n} MAD": ["Deposit required between {n} and {n} MAD", "التسبيق المطلوب بين {n} و{n} MAD"],
      "Paiement": ["Payment", "الأداء"],
      "Montant envoyé au lecteur partenaire, paiement sur votre terminal": ["Amount sent to partner reader, pay on your terminal", "تم إرسال المبلغ إلى القارئ الشريك، الأداء على جهازكم"],
      "Lecteur CMI partenaire": ["Partner CMI reader", "قارئ CMI الشريك"],
      "paiement sur votre terminal": ["payment on your terminal", "الأداء على جهازكم"],
      "Paiement non confirmé": ["Payment not confirmed", "لم يُؤكَّد الأداء"],
      "lecteur indisponible": ["reader unavailable", "القارئ غير متاح"],
      "erreur lecteur": ["reader error", "خطأ في القارئ"],
      "Paiement carte non confirmé": ["Card payment not confirmed", "لم يُؤكَّد الأداء بالبطاقة"],
      "Montant de paiement invalide": ["Invalid payment amount", "مبلغ أداء غير صالح"],
      "Ce solde est déjà encaissé": ["This balance is already paid", "تم استخلاص هذا الرصيد بالفعل"],
      "Solde encaissé, {n} MAD en carte": ["Balance collected, {n} MAD by card", "تم استخلاص الباقي، {n} MAD بالبطاقة"],
      "Solde encaissé, {n} MAD en espèces": ["Balance collected, {n} MAD in cash", "تم استخلاص الباقي، {n} MAD نقدًا"],
      "encaissé, solde {n} MAD au retrait": ["collected, balance {n} MAD at pickup", "تم الاستخلاص، الباقي {n} MAD عند الاستلام"],
      "Encaissé, {n} MAD en carte": ["Collected, {n} MAD by card", "تم استخلاص {n} MAD بالبطاقة"],
      "Encaissé, {n} MAD en espèces": ["Collected, {n} MAD in cash", "تم استخلاص {n} MAD نقدًا"],
      "Compte B2B": ["B2B account", "حساب مهني"],
      "Au retrait": ["At pickup", "عند الاستلام"],
      "Statut commande": ["Order status", "حالة الطلب"],
      "Ranger": ["Put away", "تعليق"],
      "Notifié": ["Notified", "تم الإشعار"],
      "Prévenir": ["Notify", "إشعار"],
      "À faire": ["To do", "للمعالجة"],
      "Prêtes": ["Ready", "جاهزة"],
      "Les urgences et retards remontent en premier": ["Urgent and overdue orders first", "الطلبات المستعجلة والمتأخرة أولًا"],
      "À ranger, notifier ou remettre": ["Store, notify or hand over", "للتخزين أو الإشعار أو التسليم"],
      "Les commandes remises restent consultables": ["Handed-over orders stay available", "تبقى الطلبات المسلّمة قابلة للاطلاع"],
      "Marquer prête": ["Mark ready", "وضع علامة جاهزة"],
      "Aucune commande trouvée": ["No orders found", "لم يتم العثور على أي طلب"],
      "Le travail en attente apparaîtra ici": ["Pending work appears here", "سيظهر العمل المعلّق هنا"],
      "Aucune commande prête": ["No ready orders", "لا توجد طلبات جاهزة"],
      "Aucune commande remise": ["No handed-over orders", "لا توجد طلبات مسلّمة"],
      "Essayez un nom, un téléphone ou un numéro de commande.": ["Try a name, phone or order number.", "جرّب اسمًا أو هاتفًا أو رقم طلب."],
      "Vous pouvez quitter cet écran : le compteur du menu vous prévient.": ["You can leave this screen. The menu counter alerts you.", "يمكنك مغادرة هذه الشاشة، سيُنبّهك عدّاد القائمة."],
      "Téléphone, nom ou n° de commande…": ["Phone, name or order no.…", "الهاتف أو الاسم أو رقم الطلب…"],
      "File de travail": ["Work queue", "قائمة العمل"],
      "Reçu automatiquement": ["Received automatically", "تم الاستلام تلقائيًا"],
      "« En cours » facultatif": ["“In progress” is optional", "«قيد الإنجاز» اختياري"],
      "une touche quand c’est prêt": ["one tap when ready", "ضغطة واحدة عند الجاهزية"],
      "Scanner": ["Scan", "مسح"],
      "Commande prête": ["Order ready", "الطلب جاهز"],
      "Commande en traitement": ["Order processing", "الطلب قيد المعالجة"],
      "En attente de retrait": ["Awaiting pickup", "في انتظار الاستلام"],
      "avec instruction": ["with instructions", "مع تعليمات"],
      "à respecter": ["to follow", "يجب اتباعها"],
      "Action habituelle": ["Usual action", "الإجراء المعتاد"],
      "Quand tout est fini, marquez directement la commande prête. « En cours » reste facultatif.": ["When finished, mark the order ready. “In progress” is optional.", "عند الانتهاء، ضع علامة جاهز على الطلب مباشرةً. تبقى «قيد الإنجاز» اختيارية."],
      "Couleur non précisée": ["Colour not specified", "اللون غير محدد"],
      "Livré": ["Delivered", "تم التسليم"],
      "Trait.": ["Treat.", "معالجة"],
      "Noter en cours": ["Mark in progress", "وضع علامة قيد الإنجاز"],
      "Re-notifier": ["Notify again", "إعادة الإشعار"],
      "WhatsApp « c’est prêt »": ["WhatsApp “ready”", "WhatsApp «جاهز»"],
      "Confirmer l’envoi": ["Confirm sent", "تأكيد الإرسال"],
      "Encaisser puis remettre": ["Collect then hand over", "الاستخلاص ثم التسليم"],
      "Passer au retrait": ["Go to pickup", "الانتقال إلى الاستلام"],
      "Libérer le cintre": ["Free hanger", "إخلاء العلاقة"],
      "Pièces et exceptions": ["Pieces and exceptions", "القطع والاستثناءات"],
      "suivi détaillé facultatif": ["optional detailed tracking", "التتبع المفصل اختياري"],
      "Statut pièce": ["Piece status", "حالة القطعة"],
      "Notification client confirmée": ["Customer notification confirmed", "تم تأكيد إشعار الزبون"],
      "{x}, notification confirmée": ["{x}, notification confirmed", "{x}، تم تأكيد الإشعار"],
      "{x}, cintre libéré": ["{x}, hanger freed", "{x}، تم إخلاء العلاقة"],
      "Entrez le code manager pour annuler cette commande": ["Enter manager code to cancel this order", "أدخل رمز المدير لإلغاء هذا الطلب"],
      "Code manager à 4 chiffres requis.": ["4-digit manager code required.", "رمز المدير من 4 أرقام مطلوب."],
      "Code manager refusé ou vérification indisponible.": ["Manager code rejected or verification unavailable.", "رمز المدير مرفوض أو التحقق غير متاح."],
      "Annulation confirmée sans horodatage serveur. Réessayez.": ["Cancellation confirmed without server timestamp. Try again.", "تم تأكيد الإلغاء دون توقيت الخادم. أعد المحاولة."],
      "Annulation commande": ["Order cancellation", "إلغاء الطلب"],
      "{x} est prêt": ["{x} is ready", "{x} جاهز"],
      "« Prévenir » reste disponible quand vous avez un moment": ["“Notify” stays available when you have a moment", "يبقى «إشعار» متاحًا عندما يتوفر لديك وقت"],
      "numéro manquant (passage)": ["no number (walk-in)", "دون رقم (زبون عابر)"],
      "WhatsApp, c'est prêt": ["WhatsApp, ready for pickup", "WhatsApp، جاهز للاستلام"],
      "Joindre une photo du vêtement fini, le client voit son linge avant de se déplacer": ["Attach a photo of the finished garment so the customer can see it before coming", "أرفق صورة للباس الجاهز ليشاهده الزبون قبل الحضور"],
      "Ouvrir WhatsApp": ["Open WhatsApp", "فتح WhatsApp"],
      "Pas de numéro pour {x}, ajoutez-le à sa fiche": ["No number for {x}, add it to their profile", "لا يوجد رقم لـ {x}، أضفه إلى بطاقته"],
      "WhatsApp n’a pas pu s’ouvrir, autorisez les fenêtres puis réessayez": ["Could not open WhatsApp. Allow pop-ups and try again", "تعذّر فتح WhatsApp، اسمح بالنوافذ المنبثقة ثم أعد المحاولة"],
      "joignez la photo dans WhatsApp": ["attach the photo in WhatsApp", "أرفق الصورة في WhatsApp"],
      "Pas encore envoyé": ["Not sent yet", "لم يُرسل بعد"],
      "J’ai envoyé le message": ["I sent the message", "أرسلت الرسالة"],
      "Notification WhatsApp confirmée": ["WhatsApp notification confirmed", "تم تأكيد إشعار WhatsApp"],
      "{x} marqué comme prévenu": ["{x} marked as notified", "تم وضع علامة تم الإشعار لـ {x}"],
      "Rien pour {x}": ["Nothing for {x}", "لا شيء لـ {x}"],
      "Vérifiez le numéro ou cherchez au tableau.": ["Check the number or search the board.", "تحقق من الرقم أو ابحث في اللوحة."],
      "Aucune commande prête à remettre pour le moment.": ["No orders ready for pickup yet.", "لا توجد طلبات جاهزة للتسليم حاليًا."],
      "Toutes les pièces traitées apparaîtront ici pour remise.": ["All treated pieces appear here for handover.", "ستظهر جميع القطع المعالجة هنا للتسليم."],
      "Téléphone, nom ou n° de ticket": ["Phone, name or ticket no.", "الهاتف أو الاسم أو رقم التذكرة"],
      "recherchez, scannez, encaissez si nécessaire, puis confirmez la remise": ["search, scan, collect if needed, then confirm handover", "ابحث وامسح واستخلص عند الحاجة، ثم أكّد التسليم"],
      "Scanner ticket ou étiquette": ["Scan ticket or label", "مسح التذكرة أو الملصق"],
      "Pas encore prêt, promis {x}": ["Not ready yet, promised {x}", "غير جاهز بعد، الموعد المتفق عليه {x}"],
      "non rangé": ["not stored", "غير مخزن"],
      "Attention": ["Attention", "انتباه"],
      "Solde à encaisser": ["Balance to collect", "الباقي للاستخلاص"],
      "Sur compte B2B, facture fin de mois": ["On B2B account, month-end invoice", "على الحساب المهني، فاتورة نهاية الشهر"],
      "Déjà réglé": ["Already paid", "تم الأداء بالفعل"],
      "Encaissez le solde d’abord": ["Collect the balance first", "استخلص الباقي أولًا"],
      "Ouvrir le brouillon WhatsApp": ["Open WhatsApp draft", "فتح مسودة WhatsApp"],
      "Confirmer envoi": ["Confirm sent", "تأكيد الإرسال"],
      "Encaissez le solde avant de remettre la commande": ["Collect the balance before handing over the order", "استخلص الباقي قبل تسليم الطلب"],
      "{x} remis à {x}, cintre libéré": ["{x} handed to {x}, hanger freed", "تم تسليم {x} إلى {x}، وتم إخلاء العلاقة"],
      "vérifiez le ticket ou l’étiquette": ["check the ticket or label", "تحقق من التذكرة أو الملصق"],
      "{x} a été annulée": ["{x} was cancelled", "تم إلغاء {x}"],
      "{x} a déjà été remis au client": ["{x} was already handed to the customer", "تم تسليم {x} إلى الزبون بالفعل"],
      "Kiwi propose la prochaine action utile": ["Kiwi suggests the next useful action", "يقترح Kiwi الإجراء المفيد التالي"],
      "Étiquette lue, {x}": ["Label read, {x}", "تمت قراءة الملصق، {x}"],
      "Caméra-scanner indisponible": ["Camera scanner unavailable", "ماسح الكاميرا غير متاح"],
      "utilisez la douchette ou saisissez le code": ["use the scanner or enter the code", "استخدم الماسح أو أدخل الرمز"],
      "Caméra non ouverte": ["Camera not opened", "لم تُفتح الكاميرا"],
      "autorisez-la ou utilisez la douchette": ["allow camera access or use the scanner", "اسمح بالوصول إلى الكاميرا أو استخدم الماسح"],
      "Avancer une commande": ["Move an order forward", "تقديم طلب إلى المرحلة التالية"],
      "Scannez depuis l’atelier : Kiwi ouvre la commande et propose l’action utile. Rien ne change sans votre validation.": ["Scan in the workshop. Kiwi opens the order and suggests an action. Nothing changes without your confirmation.", "امسح من الورشة، يفتح Kiwi الطلب ويقترح الإجراء المفيد. لا يتغير شيء دون تأكيدك."],
      "La douchette saisit le code automatiquement. Sur téléphone, utilisez la caméra si elle est disponible.": ["The scanner enters the code automatically. On a phone, use the camera if available.", "يُدخل الماسح الرمز تلقائيًا. على الهاتف، استخدم الكاميرا إن توفرت."],
      "1054 ou 1054-1": ["1054 or 1054-1", "1054 أو 1054-1"],
      "N° commande ou étiquette": ["Order or label no.", "رقم الطلب أو الملصق"],
      "Caméra": ["Camera", "الكاميرا"],
      "Enter": ["Enter", "إدخال"],
      "Emplacement {x} déjà occupé.": ["Slot {x} already occupied.", "المكان {x} مشغول بالفعل."],
      "client notifié": ["customer notified", "تم إشعار الزبون"],
      "pas encore notifié": ["not notified yet", "لم يُشعر بعد"],
      "Rien à ranger.": ["Nothing to store.", "لا شيء للتخزين."],
      "Quand une commande passe « prête », elle arrive ici.": ["Orders appear here when marked ready.", "تظهر الطلبات هنا عند وضع علامة جاهز عليها."],
      "Touchez un emplacement libre →": ["Tap a free slot →", "اضغط على مكان شاغر →"],
      "Sélectionnez une commande, puis son emplacement.": ["Select an order, then its slot.", "اختر طلبًا ثم مكانه."],
      "À ranger": ["To store", "للتخزين"],
      "{x} → cintre {x}, retrouvable en un scan": ["{x} → hanger {x}, find with one scan", "{x} → العلاقة {x}، يمكن العثور عليه بمسح واحد"],
      "Connexion absente": ["No connection", "لا يوجد اتصال"],
      "les changements restent sur cette tablette": ["changes stay on this tablet", "تبقى التغييرات على هذا الجهاز"],
      "envoi serveur relancé": ["server upload retried", "أُعيدت محاولة الإرسال إلى الخادم"],
      "Connexion réseau disponible": ["Network available", "الشبكة متاحة"],
      "Connexion perdue": ["Connection lost", "انقطع الاتصال"],
      "la caisse continue et conserve les changements localement": ["the till keeps working and saves changes locally", "يستمر الصندوق في العمل ويحفظ التغييرات محليًا"],
      "Connexion rétablie": ["Connection restored", "تمت استعادة الاتصال"],
      "Envoi en attente": ["Upload pending", "الإرسال في الانتظار"],
      "Connexion rétablie, envoi serveur relancé. La copie locale reste conservée.": ["Connection restored, upload retried. Local copy kept.", "تمت استعادة الاتصال وإعادة محاولة الإرسال. تبقى النسخة المحلية محفوظة."],
      "comptoir de dépôt": ["drop-off counter", "شباك الإيداع"],
      "Nettoyage à sec": ["Dry cleaning", "التنظيف الجاف"],
      "À sec": ["Dry clean", "تنظيف جاف"],
      "Lavage": ["Washing", "الغسيل"],
      "Repassage": ["Ironing", "الكي"],
      "Détachage": ["Stain removal", "إزالة البقع"],
      "Retouche": ["Alterations", "التعديلات"],
      "Hauts": ["Tops", "الملابس العلوية"],
      "Bas": ["Bottoms", "الملابس السفلية"],
      "Robes & tenues": ["Dresses & outfits", "الفساتين والأطقم"],
      "Linge de maison": ["Household linen", "المفروشات المنزلية"],
      "Cuir & spécial": ["Leather & special care", "الجلد والعناية الخاصة"],
      "Chaussures": ["Shoes", "الأحذية"],
      "Chemise": ["Shirt", "قميص"],
      "T-shirt": ["T-shirt", "قميص قصير الأكمام"],
      "Pull": ["Jumper", "كنزة"],
      "Veste": ["Jacket", "سترة"],
      "Costume": ["Suit", "بدلة"],
      "Pantalon": ["Trousers", "سروال"],
      "Gilet": ["Waistcoat", "صديري"],
      "Manteau": ["Coat", "معطف"],
      "Jean": ["Jeans", "سروال جينز"],
      "Jupe": ["Skirt", "تنورة"],
      "Short": ["Shorts", "سروال قصير"],
      "Robe": ["Dress", "فستان"],
      "Robe de soirée": ["Evening dress", "فستان سهرة"],
      "Caftan · takchita": ["Caftan · takchita", "قفطان · تكشيطة"],
      "Drap": ["Sheet", "ملاءة"],
      "Housse de couette": ["Duvet cover", "غطاء لحاف"],
      "Couverture": ["Blanket", "بطانية"],
      "Nappe": ["Tablecloth", "غطاء طاولة"],
      "Rideaux": ["Curtains", "ستائر"],
      "par panneau": ["per panel", "لكل قطعة ستار"],
      "Tapis": ["Rug", "سجادة"],
      "au m²": ["per m²", "لكل م²"],
      "Petit": ["Small", "صغير"],
      "Moyen": ["Medium", "متوسط"],
      "Grand": ["Large", "كبير"],
      "< {n} m²": ["< {n} m²", "< {n} م²"],
      "{n}–{n} m²": ["{n}–{n} m²", "{n}–{n} م²"],
      "> {n} m²": ["> {n} m²", "> {n} م²"],
      "Veste cuir": ["Leather jacket", "سترة جلدية"],
      "{n} h": ["{n} h", "{n} ساعة"],
      "Daim": ["Suede", "جلد سويدي"],
      "Doudoune": ["Puffer jacket", "سترة مبطنة"],
      "Chaussures cuir": ["Leather shoes", "أحذية جلدية"],
      "la paire": ["per pair", "للزوج"],
      "Baskets": ["Trainers", "أحذية رياضية"],
      "Babouches": ["Slippers", "بلغة"],
      "Option": ["Option", "خيار"],
      "Nouvel article": ["New item", "منتج جديد"],
      "Sans prix": ["No price", "دون سعر"],
      "Masqué": ["Hidden", "مخفي"],
      "À la caisse": ["On till", "معروض في الصندوق"],
      "Absent de la caisse": ["Not on till", "غير معروض في الصندوق"],
      "Nom affiché": ["Display name", "الاسم المعروض"],
      "Visible à la caisse": ["Visible on till", "ظاهر في الصندوق"],
      "Catalogue du comptoir": ["Counter catalogue", "كتالوج الشباك"],
      "Les changements s’appliquent aux prochains dépôts sur toutes les caisses de cet établissement.": ["Changes apply to future drop-offs on all tills at this location.", "تنطبق التغييرات على الإيداعات المقبلة في جميع صناديق هذا المحل."],
      "Filtrer par catégorie": ["Filter by category", "التصفية حسب الفئة"],
      "Ex. Gilet": ["E.g. waistcoat", "مثل صديري"],
      "Renseignez au moins un prix.": ["Enter at least one price.", "أدخل سعرًا واحدًا على الأقل."],
      "Aucun article": ["No items", "لا توجد منتجات"],
      "Page précédente": ["Previous page", "الصفحة السابقة"],
      "Page": ["Page", "الصفحة"],
      "Page suivante": ["Next page", "الصفحة التالية"],
      "Aucun article ne correspond à cette recherche.": ["No items match this search.", "لا توجد منتجات تطابق هذا البحث."],
      "Ajoutez un nom et au moins un prix supérieur à 0.": ["Add a name and at least one price above 0.", "أضف اسمًا وسعرًا واحدًا على الأقل أكبر من 0."],
      "Nom et prix requis": ["Name and price required", "الاسم والسعر مطلوبان"],
    };
    Object.keys(R).forEach(function (k) {
      VERTICAL_DICT.pressing.en[k] = R[k][0];
      VERTICAL_DICT.pressing.ar[k] = R[k][1];
    });
  })();

  /* Hotel till: French keys, English and Modern Standard Arabic. */
  (function () {
    var R = {
      "Direct": ["Direct", "مباشر"],
      "Walk-in": ["Walk-in", "دون حجز"],
      "Minibar": ["Minibar", "الثلاجة الصغيرة"],
      "la consommation": ["per item", "للوحدة"],
      "Hammam 30 min": ["Hammam 30 min", "حمّام 30 دقيقة"],
      "Hammam": ["Hammam", "حمّام"],
      "gommage savon noir": ["black soap scrub", "تقشير بالصابون الأسود"],
      "Dîner riad": ["Riad dinner", "عشاء الرياض"],
      "menu du soir": ["evening menu", "قائمة المساء"],
      "Transfert aéroport": ["Airport transfer", "النقل إلى المطار"],
      "Lessive": ["Laundry", "الغسيل"],
      "sachet rendu 24 h": ["bag returned in 24 h", "إرجاع الكيس خلال 24 ساعة"],
      "le sachet": ["per bag", "للكيس"],
      "Thé & pâtisseries": ["Tea & pastries", "شاي وحلويات"],
      "plateau au salon": ["tray in the lounge", "صينية في الصالون"],
      "le plateau": ["per tray", "للصينية"],
      "Rez-de-chaussée": ["Ground floor", "الطابق الأرضي"],
      "patio": ["courtyard", "الفناء"],
      "terrasse": ["terrace", "السطح"],
      "1er étage": ["1st floor", "الطابق الأول"],
      "2e étage": ["2nd floor", "الطابق الثاني"],
      "Chambre": ["Room", "الغرفة"],
      "Acompte à la réservation": ["Booking deposit", "تسبيق الحجز"],
      "Prépayé en ligne": ["Prepaid online", "مدفوع مسبقًا عبر الإنترنت"],
      "Vos chambres": ["Your rooms", "غرفكم"],
      "Charge déjà enregistrée : modification indisponible sans annulation liée à la vente.": ["Charge already recorded. Cancel the linked sale before editing.", "تم تسجيل المصروف بالفعل. يجب إلغاء البيع المرتبط به قبل التعديل."],
      "{x}, enregistré sur cette tablette": ["{x}, saved on this tablet", "{x}، محفوظ على هذا الجهاز"],
      "Taxe de séjour": ["Tourist tax", "ضريبة الإقامة"],
      "Hôtel": ["Hotel", "فندق"],
      "État du réseau": ["Network status", "حالة الشبكة"],
      "Chambres": ["Rooms", "الغرف"],
      "Folios": ["Folios", "حسابات الإقامة"],
      "Hospitality": ["Hospitality", "الضيافة"],
      "Hospitality+": ["Hospitality+", "الضيافة+"],
      "Hors-ligne, la réception continue, tout est enregistré sur la tablette et synchronisé au retour du réseau.": ["Offline, reception keeps working. Everything is saved on the tablet and synced when the network returns.", "دون اتصال، يستمر الاستقبال في العمل. يُحفظ كل شيء على الجهاز وتتم المزامنة عند عودة الشبكة."],
      "En maison": ["In house", "النزلاء المقيمون"],
      "Check-in": ["Check-in", "تسجيل الوصول"],
      "Ch.": ["Rm.", "غ."],
      "Ch": ["Rm", "غ"],
      "Ch. {n}": ["Rm. {n}", "غ. {n}"],
      "en retard": ["late", "متأخر"],
      "folio réglé": ["folio paid", "حساب الإقامة مدفوع"],
      "folio soldé": ["folio settled", "حساب الإقامة مسدد"],
      "sur cette chambre": ["on this room", "على هذه الغرفة"],
      "Parti": ["Departed", "غادر"],
      "Check-out": ["Check-out", "تسجيل المغادرة"],
      "Folio": ["Folio", "حساب الإقامة"],
      "encore occupée, départ de {x} à encaisser": ["still occupied, collect departure balance for {x}", "لا تزال مشغولة، يجب استخلاص رصيد المغادرة من {x}"],
      "en remise, ménage en cours": ["being turned over, cleaning in progress", "قيد التجهيز، التنظيف جارٍ"],
      "hors service": ["out of service", "خارج الخدمة"],
      "Aucune arrivée aujourd’hui.": ["No arrivals today.", "لا توجد حجوزات وصول اليوم."],
      "Aucun départ aujourd’hui.": ["No departures today.", "لا توجد مغادرات اليوم."],
      "le folio suit le client, pas la caisse": ["the folio follows the guest across tills", "يتبع حساب الإقامة النزيل عبر الصناديق"],
      "en maison": ["in house", "مقيم"],
      "à venir": ["upcoming", "قادم"],
      "Arrivées du jour": ["Today’s arrivals", "الوصول اليوم"],
      "Départs du jour": ["Today’s departures", "المغادرة اليوم"],
      "Occupée": ["Occupied", "مشغولة"],
      "Départ": ["Departure", "المغادرة"],
      "Ménage": ["Housekeeping", "التنظيف"],
      "Hors service": ["Out of service", "خارج الخدمة"],
      "Ménage, {x}": ["Housekeeping, {x}", "التنظيف، {x}"],
      "Réservée, {x}": ["Reserved, {x}", "محجوزة، {x}"],
      "Libre ce soir": ["Available tonight", "متاحة الليلة"],
      "Arrivée": ["Arrival", "الوصول"],
      "Propre": ["Clean", "نظيفة"],
      "prête à vendre": ["ready to sell", "جاهزة للبيع"],
      "Aucune chambre synchronisée": ["No rooms synced", "لم تتم مزامنة أي غرفة"],
      "Ajoutez vos chambres dans le tableau de bord, puis touchez Rafraîchir. Kiwi n’affiche aucune donnée fictive.": ["Add rooms in the dashboard, then tap Refresh. Kiwi shows no fictional data.", "أضف غرفكم في لوحة القيادة ثم اضغط على تحديث. لا يعرض Kiwi أي بيانات وهمية."],
      "Plan des chambres": ["Room plan", "مخطط الغرف"],
      "Touchez une chambre, occupée ouvre son folio": ["Tap a room. Occupied rooms open their folio", "اضغط على غرفة. تفتح الغرفة المشغولة حساب إقامتها"],
      "{x} attendu·e à {x}.": ["{x} expected at {x}.", "{x} متوقع في {x}."],
      "Ménage en cours": ["Cleaning in progress", "التنظيف جارٍ"],
      "Ménage terminé, chambre propre": ["Cleaning finished, room clean", "انتهى التنظيف، الغرفة نظيفة"],
      "Signaler hors service": ["Mark out of service", "وضع علامة خارج الخدمة"],
      "Maintenance en cours.": ["Maintenance in progress.", "الصيانة جارية."],
      "Hors service.": ["Out of service.", "خارج الخدمة."],
      "Remettre en service": ["Return to service", "إعادة إلى الخدمة"],
      "Réservée ce soir": ["Reserved tonight", "محجوزة الليلة"],
      "Libre ce soir, propre, prête à vendre.": ["Available tonight, clean, ready to sell.", "متاحة الليلة، نظيفة وجاهزة للبيع."],
      "Check-in maintenant, {x}": ["Check in now, {x}", "تسجيل الوصول الآن، {x}"],
      "Passer en ménage": ["Send to housekeeping", "إحالة إلى التنظيف"],
      "Ménage Ch. {n}": ["Housekeeping rm. {n}", "تنظيف غ. {n}"],
      "Ch. {n} propre, prête pour {x}": ["Rm. {n} clean, ready for {x}", "غ. {n} نظيفة، جاهزة لـ {x}"],
      "Ch. {n} propre, prête à vendre": ["Rm. {n} clean, ready to sell", "غ. {n} نظيفة، جاهزة للبيع"],
      "Remise demandée par la réception": ["Turnover requested by reception", "طلب الاستقبال تجهيز الغرفة"],
      "Ch. {n} passée en ménage, {x} prévenue": ["Rm. {n} sent to housekeeping, {x} notified", "أُحيلت غ. {n} إلى التنظيف، وتم إشعار {x}"],
      "Ch. {n} passée en ménage": ["Rm. {n} sent to housekeeping", "أُحيلت غ. {n} إلى التنظيف"],
      "Signalée par la réception": ["Reported by reception", "أبلغ عنها الاستقبال"],
      "Hors service Ch. {n}": ["Out of service rm. {n}", "خارج الخدمة غ. {n}"],
      "Ch. {n} hors service, retirée de la vente": ["Rm. {n} out of service, removed from sale", "غ. {n} خارج الخدمة، أُزيلت من البيع"],
      "Remise en service Ch. {n}": ["Return to service rm. {n}", "إعادة غ. {n} إلى الخدمة"],
      "Ch. {n} remise en service, prête à vendre": ["Rm. {n} back in service, ready to sell", "أُعيدت غ. {n} إلى الخدمة، جاهزة للبيع"],
      "{x}, passez par Départs": ["{x}, go to Departures", "{x}، انتقل إلى المغادرة"],
      "{x}, marquez le ménage terminé (Chambres)": ["{x}, mark cleaning finished (Rooms)", "{x}، ضع علامة انتهاء التنظيف (الغرف)"],
      "Passeport": ["Passport", "جواز السفر"],
      "CIN": ["National ID", "البطاقة الوطنية"],
      "fidèle ×2": ["repeat guest ×2", "نزيل وفي ×2"],
      "Fiche de police": ["Police form", "استمارة الشرطة"],
      "Carte de séjour": ["Residence permit", "بطاقة الإقامة"],
      "Check-in, Ch. {n}": ["Check-in, rm. {n}", "تسجيل الوصول، غ. {n}"],
      "la fiche de police est obligatoire, le scan la pré-remplit.": ["the police form is required. Scanning prefills it.", "استمارة الشرطة إلزامية، ويملؤها المسح مسبقًا."],
      "informations utiles pendant et après le séjour": ["useful details during and after the stay", "معلومات مفيدة أثناء الإقامة وبعدها"],
      "Type de pièce": ["Document type", "نوع الوثيقة"],
      "Numéro passeport / ID": ["Passport / ID number", "رقم جواز السفر / الهوية"],
      "N° du document": ["Document no.", "رقم الوثيقة"],
      "Nationalité": ["Nationality", "الجنسية"],
      "Langue préférée": ["Preferred language", "اللغة المفضلة"],
      "Français, العربية…": ["English, العربية…", "العربية، English…"],
      "Préférences de chambre": ["Room preferences", "تفضيلات الغرفة"],
      "Étage calme, lit king, loin de l’ascenseur…": ["Quiet floor, king bed, away from lift…", "طابق هادئ، سرير كبير، بعيد عن المصعد…"],
      "Préférences de repas": ["Meal preferences", "تفضيلات الوجبات"],
      "Végétarien, petit-déjeuner salé, thé sans sucre…": ["Vegetarian, savoury breakfast, tea without sugar…", "نباتي، فطور مالح، شاي دون سكر…"],
      "Allergies": ["Allergies", "الحساسية"],
      "Aucune connue…": ["None known…", "لا توجد حساسية معروفة…"],
      "Besoins particuliers": ["Special needs", "احتياجات خاصة"],
      "Mobilité, lit bébé…": ["Mobility, cot…", "التنقل، سرير رضيع…"],
      "Pièce d'identité": ["Identity document", "وثيقة الهوية"],
      "passeport ou CIN": ["passport or national ID", "جواز السفر أو البطاقة الوطنية"],
      "Joignez une photo lisible de la pièce": ["Attach a readable photo of the document", "أرفق صورة واضحة للوثيقة"],
      "Prendre ou choisir une photo": ["Take or choose photo", "التقاط صورة أو اختيارها"],
      "Continuer, caution": ["Continue to deposit", "المتابعة إلى الضمان"],
      "Photo sélectionnée": ["Photo selected", "تم اختيار الصورة"],
      "vérifiez la pièce": ["check the document", "تحقق من الوثيقة"],
      "Vérification locale": ["Local verification", "تحقق محلي"],
      "Kiwi ne conserve pas la photo et n’effectue aucun envoi DGSN.": ["Kiwi does not keep the photo or send anything to DGSN.", "لا يحتفظ Kiwi بالصورة ولا يرسل أي شيء إلى المديرية العامة للأمن الوطني."],
      "Sans sucre pour ce client.": ["No sugar for this guest.", "دون سكر لهذا النزيل."],
      "Caution": ["Security deposit", "الضمان"],
      "Caution & accueil": ["Deposit & welcome", "الضمان والاستقبال"],
      "libérée au check-out": ["released at check-out", "يُحرر عند المغادرة"],
      "Empreinte carte": ["Card hold", "حجز مبلغ على البطاقة"],
      "via lecteur connecté": ["via connected reader", "عبر القارئ المتصل"],
      "à enregistrer au coffre": ["to record in safe", "للتسجيل في الخزنة"],
      "À définir": ["To set", "يُحدد لاحقًا"],
      "client fidèle": ["repeat guest", "نزيل وفي"],
      "Montant de caution (MAD)": ["Deposit amount (MAD)", "مبلغ الضمان (MAD)"],
      "Accueil de l’hôtel": ["Hotel welcome", "استقبال الفندق"],
      ", thé à la menthe offert au salon, plateau envoyé à l'arrivée.": [", complimentary mint tea in the lounge, tray sent on arrival.", "، شاي بالنعناع مجانًا في الصالون، تُرسل الصينية عند الوصول."],
      "Terminer le check-in": ["Finish check-in", "إتمام تسجيل الوصول"],
      "Indiquez le montant de la caution": ["Enter the deposit amount", "أدخل مبلغ الضمان"],
      "Caution, pré-autorisation, rien n'est débité": ["Deposit pre-authorisation, nothing charged", "تفويض مسبق للضمان، لا يُخصم أي مبلغ"],
      "Pré-autorisation non confirmée": ["Pre-authorisation not confirmed", "لم يُؤكَّد التفويض المسبق"],
      "Empreinte carte non confirmée": ["Card hold not confirmed", "لم يُؤكَّد حجز المبلغ على البطاقة"],
      "Acompte réservation": ["Booking deposit", "تسبيق الحجز"],
      "Check-in Ch. {n}": ["Check-in rm. {n}", "تسجيل الوصول غ. {n}"],
      "espèces enregistrée au coffre": ["cash recorded in safe", "تم تسجيل النقد في الخزنة"],
      "Thé à la menthe de bienvenue": ["Welcome mint tea", "شاي بالنعناع للترحيب"],
      "Tâche accueil créée": ["Welcome task created", "تم إنشاء مهمة الاستقبال"],
      "thé de bienvenue à servir": ["welcome tea to serve", "شاي الترحيب للتقديم"],
      "départ aujourd’hui": ["departing today", "المغادرة اليوم"],
      "dont taxe": ["including tax", "بما في ذلك الضريبة"],
      "Aucun folio ouvert": ["No open folios", "لا توجد حسابات إقامة مفتوحة"],
      "Un folio s’ouvre automatiquement au check-in et regroupe la chambre, les extras et la taxe de séjour jusqu’au départ.": ["A folio opens at check-in and groups the room, extras and tourist tax until departure.", "يُفتح حساب الإقامة تلقائيًا عند الوصول ويجمع الغرفة والمصاريف الإضافية وضريبة الإقامة حتى المغادرة."],
      "Aller à la réception": ["Go to reception", "الانتقال إلى الاستقبال"],
      "Voir les chambres": ["View rooms", "عرض الغرف"],
      "Folios ouverts": ["Open folios", "حسابات الإقامة المفتوحة"],
      "Une note par séjour, nuitées, extras et taxe de séjour sur la même ligne de vie": ["One bill per stay, room nights, extras and tourist tax together", "فاتورة لكل إقامة، تجمع الليالي والمصاريف الإضافية وضريبة الإقامة"],
      "Ch. {n}, aucun folio ouvert": ["Rm. {n}, no open folio", "غ. {n}، لا يوجد حساب إقامة مفتوح"],
      "prix à saisir": ["enter price", "أدخل السعر"],
      "Restaurant et hammam postent ici automatiquement quand leurs caisses Kiwi sont liées, un seul compte.": ["Restaurant and hammam charges appear here automatically when their Kiwi tills are linked, one account.", "تظهر مصاريف المطعم والحمّام هنا تلقائيًا عند ربط صناديق Kiwi، حساب واحد."],
      "Un extra posté ici s’ajoute au folio du séjour et au journal des ventes de la journée.": ["An extra posted here is added to the stay folio and today’s sales journal.", "تُضاف المصاريف الإضافية المسجلة هنا إلى حساب الإقامة وسجل مبيعات اليوم."],
      "Nuitées": ["Room nights", "الليالي"],
      "MAD/nuit": ["MAD/night", "MAD/ليلة"],
      "séjour complet": ["full stay", "الإقامة كاملة"],
      "Taxe de séjour (TPT)": ["Tourist tax (TPT)", "ضريبة الإقامة (TPT)"],
      "Solde à régler": ["Balance due", "الباقي للأداء"],
      "Total, soldé": ["Total, settled", "المجموع، مسدد"],
      "Tous les folios": ["All folios", "جميع حسابات الإقامة"],
      "touchez un extra pour le poster sur la note": ["tap an extra to add it to the bill", "اضغط على مصروف إضافي لإضافته إلى الفاتورة"],
      "Extras, postés sur la chambre": ["Extras, charged to room", "مصاريف إضافية على الغرفة"],
      "Extras": ["Extras", "مصاريف إضافية"],
      "Facture": ["Invoice", "فاتورة"],
      "{x} retiré du folio Ch. {n}": ["{x} removed from rm. {n} folio", "أُزيل {x} من حساب إقامة غ. {n}"],
      "Folio modifié": ["Folio updated", "تم تعديل حساب الإقامة"],
      "Vérification": ["Verification", "التحقق"],
      "Demandez au client de dire son nom.": ["Ask the guest to say their name.", "اطلب من النزيل ذكر اسمه."],
      "Ne proposez aucun nom et ne montrez pas la fiche. La réponse vient d’abord.": ["Do not suggest a name or show the profile. Wait for the answer first.", "لا تقترح اسمًا ولا تعرض البطاقة. انتظر الإجابة أولًا."],
      "Le client a répondu": ["Guest has answered", "أجاب النزيل"],
      "Nom attendu": ["Expected name", "الاسم المتوقع"],
      "Comparez exactement avec la réponse donnée, sans lire le nom à voix haute.": ["Compare with the answer exactly, without reading the name aloud.", "قارن الإجابة بدقة دون قراءة الاسم بصوت مرتفع."],
      "Le nom ne correspond pas": ["Name does not match", "الاسم غير مطابق"],
      "Le nom correspond": ["Name matches", "الاسم مطابق"],
      "Prix unitaire": ["Unit price", "سعر الوحدة"],
      "en MAD,": ["in MAD,", "بـ MAD،"],
      "saisir le tarif de la maison": ["enter the hotel’s rate", "أدخل سعر الفندق"],
      "Enregistrement…": ["Saving…", "جارٍ التسجيل…"],
      "Poster sur le folio": ["Post to folio", "إضافة إلى حساب الإقامة"],
      "identité vérifiée": ["identity verified", "تم التحقق من الهوية"],
      "optionnel, visible sur la facture": ["optional, shown on invoice", "اختياري، يظهر على الفاتورة"],
      "ex. « sans sucre », « chambre à 19h »…": ["e.g. “no sugar”, “room at 19h”…", "مثل «دون سكر»، «الغرفة عند 19h»…"],
      "Charge annulée": ["Charge cancelled", "تم إلغاء المصروف"],
      "identité non confirmée": ["identity not confirmed", "لم تُؤكَّد الهوية"],
      "Saisissez le prix unitaire avant de poster": ["Enter unit price before posting", "أدخل سعر الوحدة قبل الإضافة"],
      "Ouvrez le service et appairez cette caisse avant de poster sur une chambre": ["Open the shift and pair this till before charging a room", "افتح الخدمة واربط هذا الصندوق قبل إضافة مصروف إلى غرفة"],
      "Impossible de sécuriser la charge": ["Could not secure the charge", "تعذّر تأمين تسجيل المصروف"],
      "espace local indisponible": ["local storage unavailable", "التخزين المحلي غير متاح"],
      "Charge {x}": ["Charge {x}", "مصروف {x}"],
      "{x} × {n}, posté sur le folio Ch. {n} (+{n} MAD)": ["{x} × {n}, posted to rm. {n} folio (+{n} MAD)", "{x} × {n}، أُضيف إلى حساب غ. {n} (+{n} MAD)"],
      "Ch. {n}, aucun séjour à clôturer": ["Rm. {n}, no stay to close", "غ. {n}، لا توجد إقامة للإغلاق"],
      "{n} ad. × {n} nuit": ["{n} adults × {n} night", "{n} بالغ × {n} ليلة"],
      "{n} ad. × {n} nuits": ["{n} adults × {n} nights", "{n} بالغ × {n} ليالٍ"],
      "{n} ad. ×{n} nuit": ["{n} adults ×{n} night", "{n} بالغ ×{n} ليلة"],
      "{n} ad. ×{n} nuits": ["{n} adults ×{n} nights", "{n} بالغ ×{n} ليالٍ"],
      "Total séjour": ["Stay total", "مجموع الإقامة"],
      "Déjà payé en ligne": ["Already paid online", "تم الأداء عبر الإنترنت بالفعل"],
      "Solde collecté par {x}, versement OTA": ["Balance collected by {x}, OTA payout", "استخلص {x} الباقي، تحويل منصة الحجز"],
      "Folio soldé, confirmer le départ": ["Folio settled, confirm departure", "حساب الإقامة مسدد، أكّد المغادرة"],
      "Facture imprimée, chambre en ménage": ["Invoice printed, room sent to housekeeping", "تمت طباعة الفاتورة وإحالة الغرفة إلى التنظيف"],
      "Empreinte carte {n} MAD à libérer sur le lecteur au départ.": ["Release card hold of {n} MAD on the reader at departure.", "حرّر حجز البطاقة البالغ {n} MAD على القارئ عند المغادرة."],
      "Caution espèces {n} MAD à rendre au départ.": ["Return cash deposit of {n} MAD at departure.", "أرجع الضمان النقدي البالغ {n} MAD عند المغادرة."],
      "Sans caution sur ce séjour.": ["No deposit for this stay.", "دون ضمان لهذه الإقامة."],
      "Check-out, Ch. {n}": ["Check-out, rm. {n}", "تسجيل المغادرة، غ. {n}"],
      "Solde séjour": ["Stay balance", "رصيد الإقامة"],
      "Paiement non enregistré. Séjour conservé ouvert. Vérifiez tout paiement déjà reçu avant de réessayer.": ["Payment not recorded. Stay kept open. Check any payment already received before retrying.", "لم يُسجَّل الأداء. تبقى الإقامة مفتوحة. تحقق من أي أداء مستلم قبل إعادة المحاولة."],
      "Solde au départ": ["Balance at departure", "الباقي عند المغادرة"],
      "Réglé en ligne": ["Paid online", "مدفوع عبر الإنترنت"],
      "Ménage en cours, {x} arrive {x}": ["Cleaning in progress, {x} arrives at {x}", "التنظيف جارٍ، يصل {x} في {x}"],
      "Remise après départ": ["Turnover after departure", "تجهيز بعد المغادرة"],
      "Check-out Ch. {n}": ["Check-out rm. {n}", "تسجيل المغادرة غ. {n}"],
      "Solde marqué réglé via {x}, versement OTA": ["Balance marked paid via {x}, OTA payout", "وُضع الرصيد مدفوعًا عبر {x}، تحويل منصة الحجز"],
      "Départ confirmé, folio déjà soldé": ["Departure confirmed, folio already settled", "تم تأكيد المغادرة، حساب الإقامة مسدد بالفعل"],
      "Libérez l’empreinte {n} MAD sur le lecteur puis conservez son justificatif": ["Release the {n} MAD card hold on the reader and keep the receipt", "حرّر حجز البطاقة البالغ {n} MAD على القارئ واحتفظ بالإثبات"],
      "Caution espèces {n} MAD marquée rendue": ["Cash deposit {n} MAD marked returned", "وُضع الضمان النقدي {n} MAD مُرجعًا"],
      "Ch. {n} → ménage": ["Rm. {n} → housekeeping", "غ. {n} → التنظيف"],
      "Ch. {n} → ménage, {x} arrive {x}": ["Rm. {n} → housekeeping, {x} arrives at {x}", "غ. {n} → التنظيف، يصل {x} في {x}"],
      "Note provisoire": ["Provisional bill", "فاتورة مؤقتة"],
      "Fiche police": ["Police form", "استمارة الشرطة"],
      "{n} MAD, réglé": ["{n} MAD, paid", "{n} MAD، مدفوع"],
      "Canal": ["Channel", "القناة"],
      "merci, b'slama, l'lah ikhellik": ["thank you, goodbye", "شكرًا لكم، إلى اللقاء"],
      "Le séjour est encore ouvert, la note suit le folio en direct.": ["The stay is still open. The bill follows the live folio.", "الإقامة لا تزال مفتوحة، تتابع الفاتورة حساب الإقامة مباشرةً."],
      "Séjour clôturé, la chambre est passée en ménage.": ["Stay closed, room sent to housekeeping.", "أُغلقت الإقامة وأُحيلت الغرفة إلى التنظيف."],
      "Imprimer ({n} mm)": ["Print ({n} mm)", "طباعة ({n} مم)"],
      "Impression système ouverte": ["System print dialog opened", "تم فتح نافذة طباعة النظام"],
      "Wi-Fi indisponible, les opérations restent sur cette tablette": ["Wi-Fi unavailable, operations stay on this tablet", "Wi-Fi غير متاح، تبقى العمليات على هذا الجهاز"],
      "charge chambre": ["room charge", "مصروف غرفة"],
      "charges chambre": ["room charges", "مصاريف غرف"],
      "en cours d’envoi": ["uploading", "جارٍ الإرسال"],
      "Tablette en ligne, aucune charge chambre en attente d’envoi": ["Tablet online, no room charges waiting to upload", "الجهاز متصل، لا توجد مصاريف غرف في انتظار الإرسال"],
      "Réseau simulé rétabli, file de démonstration vidée ({n})": ["Simulated network restored, demo queue cleared ({n})", "تمت استعادة الشبكة المحاكاة وإفراغ قائمة العرض التجريبي ({n})"],
      "Mode hors-ligne simulé, la réception continue": ["Simulated offline mode, reception keeps working", "وضع دون اتصال محاكى، يستمر الاستقبال في العمل"],
      "Réseau simulé rétabli": ["Simulated network restored", "تمت استعادة الشبكة المحاكاة"],
      "Envoi en cours": ["Uploading", "جارٍ الإرسال"],
      "Bonjour,": ["Hello,", "مرحبًا،"],
      "Votre hôtel": ["Your hotel", "فندقكم"],
      "{n} arrivées cet après-midi, un départ à encaisser": ["{n} arrivals this afternoon, one departure to collect", "{n} وصول بعد الظهر، ومغادرة واحدة للاستخلاص"],
    };
    Object.keys(R).forEach(function (k) {
      VERTICAL_DICT.hotel.en[k] = R[k][0];
      VERTICAL_DICT.hotel.ar[k] = R[k][1];
    });
  })();

  /* Specialist till interpolation and print-preview labels. */
  (function () {
    var R = {
      "propulsé par Kiwi": ["powered by Kiwi", "بدعم من Kiwi"],
      "Rendu calculé": ["Change calculated", "الباقي محسوب"],
      "Montant envoyé au lecteur partenaire, paiement sur votre terminal": ["Amount sent to partner reader, pay on your terminal", "تم إرسال المبلغ إلى القارئ الشريك، الأداء على جهازكم"],
      "Lecteur CMI partenaire": ["Partner CMI reader", "قارئ CMI الشريك"],
      "paiement sur votre terminal": ["payment on your terminal", "الأداء على جهازكم"],
      "Paiement non confirmé": ["Payment not confirmed", "لم يُؤكَّد الأداء"],
      "lecteur indisponible": ["reader unavailable", "القارئ غير متاح"],
      "Encaissé, {n} MAD en carte": ["Collected, {n} MAD by card", "تم استخلاص {n} MAD بالبطاقة"],
      "Encaissé, {n} MAD en espèces": ["Collected, {n} MAD in cash", "تم استخلاص {n} MAD نقدًا"],
      "Déjà réglé": ["Already paid", "تم الأداء بالفعل"],
      "soda": ["soft drink", "مشروب غازي"],
      "snacks": ["snacks", "وجبات خفيفة"],
      "trajet": ["trip", "رحلة"],
      "takchita": ["takchita", "تكشيطة"],
      "Remis": ["Handed over", "تم التسليم"],
      "B2B": ["B2B", "مهني"],
      "Maximum": ["Maximum", "الحد الأقصى"],
      "Service": ["Service", "الخدمة"],
      "Encaissé,": ["Collected,", "تم الاستخلاص،"],
      "RAIL": ["Rail", "الرف"],
      "Ménage,": ["Housekeeping,", "التنظيف،"],
      "Réservée,": ["Reserved,", "محجوزة،"],
      "Note": ["Note", "ملاحظة"],
      "Charge": ["Charge", "مصروف"],
      "eau": ["water", "ماء"],
      "PDF prêt": ["PDF ready", "ملف PDF جاهز"],
      "étiquettes & ticket": ["labels & ticket", "الملصقات والتذكرة"],
      "RECOMMANDÉ": ["Recommended", "موصى به"],
      "ICE": ["ICE", "المعرّف الموحد للمقاولة"],
      "IF": ["Tax ID", "المعرّف الضريبي"],
      "RC": ["Trade register", "السجل التجاري"],
      "EXEMPLAIRE CLIENT": ["Customer copy", "نسخة الزبون"],
      "SUR COMPTE": ["On account", "على الحساب"],
      "DUPLICATA": ["Copy", "نسخة"],
      "ATELIER": ["Workshop", "الورشة"],
      "envoyé via Kiwi": ["sent via Kiwi", "أُرسل عبر Kiwi"],
      "Brouillon WhatsApp": ["WhatsApp draft", "مسودة WhatsApp"],
      "Brouillon WhatsApp ouvert pour {x}": ["WhatsApp draft opened for {x}", "تم فتح مسودة WhatsApp لـ {x}"],
      "par personne": ["per person", "للشخص"],
      "par trajet": ["per trip", "للرحلة"],
      "ETA": ["ETA", "وقت الوصول المتوقع"],
      "Remise B2B –15 %": ["B2B discount –15 %", "تخفيض المهنيين –15 %"],
      "{x}, compte B2B, remise –15 % appliquée": ["{x}, B2B account, –15 % discount applied", "{x}، حساب مهني، تم تطبيق تخفيض –15 %"],
      "{x} enregistrée, prête {x}": ["{x} saved, ready {x}", "تم تسجيل {x}، جاهز {x}"],
      "Acompte {n} MAD encaissé, solde {n} MAD au retrait": ["Deposit {n} MAD collected, balance {n} MAD at pickup", "تم استخلاص تسبيق {n} MAD، الباقي {n} MAD عند الاستلام"],
      "Retrait dès maintenant.": ["Ready for pickup now.", "جاهز للاستلام الآن."],
      "Solde à régler au retrait : {n} MAD.": ["Balance due at pickup: {n} MAD.", "الباقي للأداء عند الاستلام: {n} MAD."],
      "·envoyé via Kiwi": ["·sent via Kiwi", "·أُرسل عبر Kiwi"],
      "Bonjour {x}, votre commande {x} ({n} pièce) est prête chez {x}.": ["Hello {x}, your order {x} ({n} piece) is ready at {x}.", "مرحبًا {x}، طلبك {x} ({n} قطعة) جاهز لدى {x}."],
      "Bonjour {x}, votre commande {x} ({n} pièces) est prête chez {x}.": ["Hello {x}, your order {x} ({n} pieces) is ready at {x}.", "مرحبًا {x}، طلبك {x} ({n} قطع) جاهز لدى {x}."],
      "Caftan": ["Caftan", "قفطان"],
      "{n} m²": ["{n} m²", "{n} م²"],
      "hier {n}h{n}": ["yesterday {n}h{n}", "أمس {n}h{n}"],
      "Valider · étiquettes & ticket": ["Confirm · labels & ticket", "تأكيد · الملصقات والتذكرة"],
      "Ticket, duplicata & étiquettes": ["Ticket, copy & labels", "التذكرة والنسخة والملصقات"],
      "PROMESSE CLIENT": ["Customer promise", "الموعد المتفق عليه مع الزبون"],
      "SOLDE AU RETRAIT": ["Balance at pickup", "الباقي عند الاستلام"],
      "PRÊT LE {x}": ["Ready on {x}", "جاهز في {x}"],
      "PRÊT LE": ["Ready on", "جاهز في"],
      "ATTENTION": ["Attention", "انتباه"],
      "TOTAL": ["Total", "المجموع"],
      "SOLDE À RÉGLER": ["Balance due", "الباقي للأداء"],
      "SOLDE": ["Balance", "الرصيد"],
      "EN ATTENTE DE RETRAIT": ["Awaiting pickup", "في انتظار الاستلام"],
      "RAIL {n}": ["Rail {n}", "الرف {n}"],
      "libres": ["free", "شاغرة"],
      "article": ["item", "منتج"],
      "articles": ["items", "منتجات"],
      "pièce": ["piece", "قطعة"],
      "pièces": ["pieces", "قطع"],
      "étiquette": ["label", "ملصق"],
      "étiquettes": ["labels", "ملصقات"],
      "étiq.": ["labels", "ملصقات"],
      "{n} étiq.": ["{n} labels", "{n} ملصقات"],
      "traitement": ["treatment", "معالجة"],
      "traitements": ["treatments", "معالجات"],
      "déclinaisons": ["variants", "تنويعات"],
      "Prix vide = service indisponible": ["Empty price = service unavailable", "سعر فارغ = الخدمة غير متاحة"],
      "Page {n} / {n}": ["Page {n} / {n}", "الصفحة {n} / {n}"],
      "{n}–{n} sur {n}": ["{n}–{n} of {n}", "{n}–{n} من {n}"],
      "+ Nouvel article": ["+ New item", "+ منتج جديد"],
      "dès {n} MAD": ["from {n} MAD", "ابتداءً من {n} MAD"],
      "multi-pièces": ["multiple pieces", "متعدد القطع"],
      "délicat": ["delicate", "حساس"],
      "main": ["by hand", "يدوي"],
      "commande": ["order", "طلب"],
      "commandes": ["orders", "طلبات"],
      "{n} commande prête": ["{n} order ready", "{n} طلب جاهز"],
      "{n} commandes prêtes": ["{n} orders ready", "{n} طلبات جاهزة"],
      "{n} commande marquée prête": ["{n} order marked ready", "تم وضع علامة جاهز على {n} طلب"],
      "{n} commandes marquées prêtes": ["{n} orders marked ready", "تم وضع علامة جاهز على {n} طلبات"],
      "sélectionnée": ["selected", "محدد"],
      "sélectionnées": ["selected", "محددة"],
      "Marquer prêtes": ["Mark ready", "وضع علامة جاهزة"],
      "facultatif": ["optional", "اختياري"],
      "optionnel": ["optional", "اختياري"],
      "annulée {x}": ["cancelled {x}", "أُلغي {x}"],
      "remis {x}": ["handed over {x}", "تم التسليم {x}"],
      "prêt {x}": ["ready {x}", "جاهز {x}"],
      "retiré {x}": ["picked up {x}", "تم الاستلام {x}"],
      "promis {x}": ["promised {x}", "الموعد المتفق عليه {x}"],
      "Prêt le {x}": ["Ready {x}", "جاهز يوم {x}"],
      "Déposé {x}": ["Dropped off {x}", "تم الإيداع {x}"],
      "déposé {x}": ["dropped off {x}", "تم الإيداع {x}"],
      "déposé {x}": ["dropped off {x}", "أُودع {x}"],
      "cintre {x}": ["hanger {x}", "العلاقة {x}"],
      "{x} cintre": ["{x} hanger", "{x} علاقة"],
      "photo": ["photo", "صورة"],
      "photos": ["photos", "صور"],
      "{n} pièce avec instruction à respecter": ["{n} piece with instructions to follow", "{n} قطعة مع تعليمات يجب اتباعها"],
      "{n} pièces avec instructions à respecter": ["{n} pieces with instructions to follow", "{n} قطع مع تعليمات يجب اتباعها"],
      "Ajouter {x} de la sélection": ["Add {x} to selection", "إضافة {x} إلى التحديد"],
      "Retirer {x} de la sélection": ["Remove {x} from selection", "إزالة {x} من التحديد"],
      "Commande {x} annulée": ["Order {x} cancelled", "تم إلغاء الطلب {x}"],
      "{n} changement local": ["{n} local change", "{n} تغيير محلي"],
      "{n} changements locaux": ["{n} local changes", "{n} تغييرات محلية"],
      "{n} changement conservé": ["{n} change saved", "تم حفظ {n} تغيير"],
      "{n} changements conservés": ["{n} changes saved", "تم حفظ {n} تغييرات"],
      "rendu {n} MAD": ["change {n} MAD", "الباقي {n} MAD"],
      "solde {n} MAD": ["balance {n} MAD", "الباقي {n} MAD"],
      "total {n} MAD": ["total {n} MAD", "المجموع {n} MAD"],
      "{n} MAD payés": ["{n} MAD paid", "تم أداء {n} MAD"],
      "pièce {n}/{n}": ["piece {n}/{n}", "القطعة {n}/{n}"],
      "ticket + duplicata + {n} étiquette": ["ticket + copy + {n} label", "التذكرة + النسخة + {n} ملصق"],
      "ticket + duplicata + {n} étiquettes": ["ticket + copy + {n} labels", "التذكرة + النسخة + {n} ملصقات"],
      "Facture, Ch. {n}": ["Invoice, rm. {n}", "فاتورة، غ. {n}"],
      "Note provisoire, Ch. {n}": ["Provisional bill, rm. {n}", "فاتورة مؤقتة، غ. {n}"],
      "PDF prêt · ticket + duplicata + {n} étiquette": ["PDF ready · ticket + copy + {n} label", "ملف PDF جاهز · التذكرة + النسخة + {n} ملصق"],
      "PDF prêt · ticket + duplicata + {n} étiquettes": ["PDF ready · ticket + copy + {n} labels", "ملف PDF جاهز · التذكرة + النسخة + {n} ملصقات"],
      "Impression système, ticket + duplicata + {n} étiquette": ["System print, ticket + copy + {n} label", "طباعة النظام، التذكرة + النسخة + {n} ملصق"],
      "Impression système, ticket + duplicata + {n} étiquettes": ["System print, ticket + copy + {n} labels", "طباعة النظام، التذكرة + النسخة + {n} ملصقات"],
      "Ticket + duplicata + {n} étiquette imprimés": ["Ticket + copy + {n} label printed", "تمت طباعة التذكرة + النسخة + {n} ملصق"],
      "Ticket + duplicata + {n} étiquettes imprimés": ["Ticket + copy + {n} labels printed", "تمت طباعة التذكرة + النسخة + {n} ملصقات"],
      "Tickets imprimés, {n} étiquette non imprimée": ["Tickets printed, {n} label not printed", "تمت طباعة التذاكر، ولم يُطبع {n} ملصق"],
      "Tickets imprimés, {n} étiquettes non imprimées": ["Tickets printed, {n} labels not printed", "تمت طباعة التذاكر، ولم تُطبع {n} ملصقات"],
      "{x}, enregistré hors-ligne ({n} en attente)": ["{x}, saved offline ({n} pending)", "{x}، محفوظ دون اتصال ({n} في الانتظار)"],
      "Le client a répondu · révéler": ["Guest answered · reveal", "أجاب النزيل · إظهار"],
      "révéler": ["reveal", "إظهار"],
      "chambre {n}": ["room {n}", "غرفة {n}"],
      "fiche {x}": ["form {x}", "استمارة {x}"],
      "{n} nuit": ["{n} night", "{n} ليلة"],
      "{n} nuits": ["{n} nights", "{n} ليالٍ"],
      "{n} nuits.": ["{n} nights.", "{n} ليالٍ."],
      "{n} nuit.": ["{n} night.", "{n} ليلة."],
      "{n} pers.": ["{n} guests", "{n} أشخاص"],
      "{n} adulte": ["{n} adult", "{n} بالغ"],
      "{n} adultes": ["{n} adults", "{n} بالغين"],
      "{n} MAD × {n} adulte × {n} nuit": ["{n} MAD × {n} adult × {n} night", "{n} MAD × {n} بالغ × {n} ليلة"],
      "{n} MAD × {n} adultes × {n} nuits": ["{n} MAD × {n} adults × {n} nights", "{n} MAD × {n} بالغين × {n} ليالٍ"],
      "{n} MAD × {n} adulte × {n} nuits": ["{n} MAD × {n} adult × {n} nights", "{n} MAD × {n} بالغ × {n} ليالٍ"],
      "{n} MAD × {n} adultes × {n} nuit": ["{n} MAD × {n} adults × {n} night", "{n} MAD × {n} بالغين × {n} ليلة"],
      "{n} MAD / nuit": ["{n} MAD / night", "{n} MAD / ليلة"],
      "{n} MAD / nuit.": ["{n} MAD / night.", "{n} MAD / ليلة."],
      "{n} séjour en maison": ["{n} stay in house", "{n} إقامة حالية"],
      "{n} séjours en maison": ["{n} stays in house", "{n} إقامات حالية"],
      "{n} arrivée à venir": ["{n} upcoming arrival", "{n} وصول قادم"],
      "{n} arrivées à venir": ["{n} upcoming arrivals", "{n} وصول قادم"],
      "{n} départ à encaisser": ["{n} departure to collect", "{n} مغادرة للاستخلاص"],
      "{n} départs à encaisser": ["{n} departures to collect", "{n} مغادرات للاستخلاص"],
      "{n}/{n} en maison": ["{n}/{n} in house", "{n}/{n} مقيم"],
      "j{n}": ["day {n}", "اليوم {n}"],
      "j{n}/{n}": ["day {n}/{n}", "اليوم {n}/{n}"],
      "acompte {n} MAD": ["deposit {n} MAD", "تسبيق {n} MAD"],
      "acompte {n} MAD réglé": ["deposit {n} MAD paid", "تم أداء تسبيق {n} MAD"],
      "arrivée {x}": ["arrival {x}", "الوصول {x}"],
      "Arrivée {x}": ["Arrival {x}", "الوصول {x}"],
      "Ch. {n} encore occupée, départ de {x} à encaisser": ["Rm. {n} still occupied, collect departure balance for {x}", "غ. {n} لا تزال مشغولة، يجب استخلاص رصيد المغادرة من {x}"],
      "Ch. {n} en remise, ménage en cours": ["Rm. {n} being turned over, cleaning in progress", "غ. {n} قيد التجهيز، التنظيف جارٍ"],
      "Ch. {n} occupée": ["Rm. {n} occupied", "غ. {n} مشغولة"],
      "Ch. {n} hors service": ["Rm. {n} out of service", "غ. {n} خارج الخدمة"],
      "Check-in Ch. {n}, {x}": ["Check-in rm. {n}, {x}", "تسجيل الوصول غ. {n}، {x}"],
      "bienvenue": ["welcome", "مرحبًا"],
      "Caution {n} MAD espèces enregistrée au coffre": ["Deposit {n} MAD cash recorded in safe", "تم تسجيل ضمان نقدي {n} MAD في الخزنة"],
      "{x} arrive {x} sur cette chambre": ["{x} arrives at {x} for this room", "يصل {x} في {x} إلى هذه الغرفة"],
    };
    Object.keys(R).forEach(function (k) {
      ['pressing', 'hotel'].forEach(function (id) {
        VERTICAL_DICT[id].en[k] = R[k][0];
        VERTICAL_DICT[id].ar[k] = R[k][1];
      });
    });
  })();

  /* ───────────────────────── état ───────────────────────── */
  var cur = 'fr';
  try { var saved = localStorage.getItem(KEY); if (saved && DICT[saved]) cur = saved; else if (saved === 'fr') cur = 'fr'; } catch (_) {}
  var subs = [];

  // Specialist vocabulary only applies while that till is active. In other
  // tills, words such as garment colours may be merchant data.
  // A page without the dispatcher, or with a partial one, keeps the shared words.
  function activeTill() {
    var d = window.KiwiPosDispatch;
    try { return d && typeof d.current === 'function' ? d.current() : null; } catch (_) { return null; }
  }
  function dict() {
    if (!DICT[cur]) return null;
    var id = activeTill();
    if (!VERTICAL_DICT[id]) return DICT[cur];
    var key = id + ':' + cur;
    return verticalCache[key] || (verticalCache[key] = Object.assign({}, DICT[cur], VERTICAL_DICT[id][cur]));
  }
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

    /* Un morceau qui COMMENCE par le séparateur : la fiche d'un article écrit
       « · stock par taille en direct » dans son propre nœud, après le nom.
       Sans cette découpe, la phrase connue restait en français. */
    var lead = /^·\s+/.exec(core);
    if (lead) {
      var rest = translateCore(core.slice(lead[0].length));
      return rest == null ? null : lead[0] + rest;
    }
    /* Et l'inverse : une option de liste écrite « · Même imprimante que la
       caisse · » arrive, une fois découpée, avec son séparateur de fin. */
    var tail = /\s+·$/.exec(core);
    if (tail) {
      var head = translateCore(core.slice(0, tail.index));
      return head == null ? null : head + tail[0];
    }

    if (core.indexOf(' + ') >= 0) {
      var services = core.split(' + ');
      if (services.every(function (part) { return !!d[part]; })) {
        return services.map(function (part) { return d[part]; }).join(' + ');
      }
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
     Une clé qui COMMENCE par {x} n'a pas de mot d'ancrage : elle va dans une
     courte liste à part, lue par la FIN du segment, et seulement si cette fin
     est une vraie phrase (une virgule ou une espace, puis sept caractères au
     moins). C'est la forme des toasts de la boutique : « Caftan Fassi · M,
     sur le ticket », où le nom de l'article vient avant la phrase. */
  var holes = {};
  /* Les gabarits qui ne se lisent pas par leur premier mot — ceux qui
     COMMENCENT par la donnée (« {x}, sur le ticket ») et ceux qui portent aussi
     un nombre (« {x} émis, {n} MAD ») — deviennent une expression régulière,
     compilée une fois par langue. Le nombre suit la même définition que le
     gabarit {n} ordinaire ; la donnée garde ses lettres telles quelles. */
  var RX = '\u0000rx';
  var NUM_SRC = '(\\d[\\d\\s\\u202f\\u00a0.,]*\\d|\\d)';
  function escRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function holeIndex(d) {
    var id = activeTill();
    var cacheKey = (id || '') + ':' + cur;
    if (holes[cacheKey]) return holes[cacheKey];
    var idx = Object.create(null);
    Object.keys(d).forEach(function (k) {
      var at = k.indexOf('{x}');
      if (at < 0) return;
      var multi = k.indexOf('{x}', at + 3) >= 0;
      var pre = k.slice(0, at), suf = k.slice(at + 3);
      if (multi || at === 0 || k.indexOf('{n}') >= 0) {
        /* Sans mot d'ancrage, la fin doit être une vraie phrase : une virgule
           ou une espace, puis sept caractères au moins hors nombres. Sinon
           chaque nom d'article deviendrait candidat. */
        if (at === 0 && !(suf.replace(/\{n\}/g, '').length >= 7 && /^[,\s]/.test(suf))) return;
        var order = [];
        var src = k.split(/(\{x\}|\{n\})/).map(function (part) {
          if (part === '{x}') { order.push('x'); return '([\\s\\S]+?)'; }
          if (part === '{n}') { order.push('n'); return NUM_SRC; }
          return escRx(part);
        }).join('');
        (idx[RX] = idx[RX] || []).push({ rx: new RegExp('^' + src + '$'), order: order, key: k, pre: k.split(/\{[nx]\}/)[0], suf: k.split(/\{[nx]\}/).pop(), digits: k.indexOf('{n}') >= 0 });
        return;
      }
      var w = pre.split(/\s/)[0];
      (idx[w] = idx[w] || []).push({ pre: pre, suf: suf, key: k });
    });
    // Le gabarit le plus long d'abord : « Imprimante du poste {x} » avant « Imprimante {x} ».
    Object.keys(idx).forEach(function (w) {
      if (w === RX) idx[w].sort(function (a, b) { return b.key.length - a.key.length; });
      else idx[w].sort(function (a, b) { return (b.pre.length + b.suf.length) - (a.pre.length + a.suf.length); });
    });
    return (holes[cacheKey] = idx);
  }
  function fillHole(d, key, x) {
    /* Le trou garde la donnée telle quelle, sauf si c'est une date entière
       (« dernière vente 20 oct. ») : ses jetons de jour et de mois suivent. */
    var xd = translateDate(x);
    /* Une donnée qui est elle-même une phrase connue (« Étiquette »,
       « Fiche cliente », « 3 étiquettes ») suit la langue ; un nom d'article
       ne correspond à aucune clé et passe tel quel. Le segment est toujours
       plus court que celui qui le contient : la récursion s'arrête. */
    if (xd == null) xd = translateCore(x);
    return d[key].replace('{x}', xd != null ? xd : x);
  }
  function translateHole(seg, d) {
    var idx = holeIndex(d);
    var list = idx[seg.split(/\s/)[0]];
    if (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (seg.length > t.pre.length + t.suf.length && seg.startsWith(t.pre) && seg.endsWith(t.suf)) {
          return fillHole(d, t.key, seg.slice(t.pre.length, seg.length - t.suf.length));
        }
      }
    }
    var rxs = idx[RX];
    if (!rxs) return null;
    var hasDigit = /\d/.test(seg);
    for (var j = 0; j < rxs.length; j++) {
      var r = rxs[j];
      if (r.digits && !hasDigit) continue;
      if ((r.pre && !seg.startsWith(r.pre)) || (r.suf && !seg.endsWith(r.suf))) continue;
      var m = r.rx.exec(seg);
      if (!m) continue;
      var xs = [], nums = [];
      for (var g = 0; g < r.order.length; g++) { if (r.order[g] === 'x') xs.push(m[g + 1]); else nums.push(m[g + 1]); }
      var q = 0;
      var out = xs.length === 1 ? fillHole(d, r.key, xs[0]) : d[r.key].replace(/\{x\}/g, function () {
        var value = xs[q++];
        var date = translateDate(value);
        return date == null ? value : date;
      });
      q = 0;
      return out.replace(/\{n\}/g, function () { return nums[q] != null ? nums[q++] : ''; });
    }
    return null;
  }

  /* On ne touche aux jetons de date QUE si le segment RESSEMBLE de bout en bout
     à une date. « mai » tout seul dans un nom d'article n'est pas un mois ;
     « sam. 14:32 » en est une. Le garde-fou est le motif, pas le mot. */
  /* « mercredi 21 octobre » : le rail de la caisse restaurant écrit le jour en
     minuscule. Un jour seul en minuscule reste ce qu'il est (un article peut
     s'appeler « lundi ») ; suivi d'un quantième et d'un mois, c'est une date,
     et on la lit comme celle qui porte sa majuscule. */
  var LOWER_DAY = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(\s+\d{1,2}\s+\S+)$/;
  function translateDate(seg) {
    var low = LOWER_DAY.exec(seg);
    if (low) seg = low[1].charAt(0).toUpperCase() + low[1].slice(1) + low[2];
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
        /* Le nom commence par le code affiché (« FR · Français ») : la commande
           vocale dit ce qu'elle voit (axe, label-content-name-mismatch). */
        + ' aria-label="' + (l.label.indexOf(l.code) >= 0 ? l.label : l.code + ' · ' + l.label) + '" aria-pressed="' + (l.id === cur) + '" data-nolang>'
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
