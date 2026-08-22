/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Stock & approvisionnement page
 *
 * Self-contained IIFE that owns the 5-tab inventory + supply management page
 * reachable from the sidebar "Stock & approvisionnement" item. The page
 * replaces the previous fullpage drawer (which lived in pages-pro.js).
 *
 * Tabs:
 *   1. Vue d'ensemble  — 4 KPI cards · urgent alerts · variance AI · 7-day deliveries
 *   2. Articles & stock — search + filters + sortable table or card grid
 *   3. Fournisseurs    — 3 stats + supplier table + price-changes AI
 *   4. Commandes       — 4 active orders + history + Kiwi auto-order suggestion
 *   5. Prévisions IA   — SVG demand chart + shortfalls + seasonal insights (Ultra)
 *
 * Modals:
 *   · Scanner une facture  · Inventaire physique  · Quick Order
 *   · Supplier Profile     · Item Detail          · Day-deliveries Detail
 *
 * Reads INVENTORY + SUPPLIERS from window.KiwiVenue. All demo edits
 * (sent orders, counted inventory, scanned invoices) live in module-scoped
 * state — they reset on page refresh per spec.
 *
 * Loads AFTER assets/pages.js + pages-pro.js so its nav-stock handler wins.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   * i18n — FR/EN/AR strings · captured-originals pattern aligns w/ i18n.js
   * ═══════════════════════════════════════════════════════════════════════ */
  const STR = {
    fr: {
      breadcrumb: 'Stock & approvisionnement',
      title: 'Stock & approvisionnement',
      sub: (n, sup, val) => `${n} articles suivis · ${sup} fournisseurs actifs · valeur stock ${val}`,
      btnScan: 'Scanner une facture',
      btnCount: 'Inventaire physique',
      btnAdd: 'Nouvel article',
      tabOverview: "Vue d'ensemble",
      tabItems: 'Articles & stock',
      tabSuppliers: 'Fournisseurs',
      tabOrders: 'Commandes',
      tabForecast: 'Prévisions IA',
      ultra: '✦ ULTRA',
      // Tab 1 KPIs
      kpiValueL: 'VALEUR STOCK TOTAL',
      kpiAlertL: 'EN RUPTURE / FAIBLE',
      kpiCostL: 'COÛT MATIÈRES · SEMAINE',
      kpiDelivL: 'PROCHAINE LIVRAISON',
      kpiValueSub: (n) => `${n} articles en stock`,
      kpiAlertSub: (out, low) => `${out} en rupture · ${low} à recommander`,
      kpiAlertOk: 'Tous les niveaux sont sains',
      kpiCostSub: (r) => `Ratio coût matière : ${r}`,
      kpiCostTip: 'Standard restauration marocaine : 28-32 %. Au-delà, votre marge brute est sous pression.',
      // Tab 1 alerts
      alertsT: 'À traiter maintenant',
      alertsEmpty: 'Aucune alerte · tous vos niveaux de stock sont sains.',
      statusOut: 'RUPTURE TOTALE',
      statusLow: 'STOCK FAIBLE',
      lastDeliv: 'Dernière livraison',
      supplier: 'Fournisseur',
      impactCost: 'Coût impact estimé',
      perDayMissed: '/jour de manque à gagner',
      daysLeft: (d) => `${d} ${d === 1 ? 'jour restant' : 'jours restants'}`,
      level: 'Niveau',
      par: 'Par',
      btnUrgentOrder: 'Commander en urgence',
      btnMark86: 'Marquer 86 sur menu',
      btnReorder: 'Réapprovisionner',
      btnIgnore: 'Ignorer 24h',
      // Tab 1 AI insights
      aiVarianceT: 'Écart de consommation détecté · Tomates fraîches',
      aiVarianceB: "Vos tomates fraîches ont été consommées à 32,4 kg cette semaine vs 31,0 kg théoriques (basé sur les ventes du POS). Variance de +4,5 %. Sur les 4 dernières semaines, la variance cumulée atteint +18 %, l'équivalent de 12 kg sur-utilisés, soit ~96 MAD de coût non facturé aux ventes.",
      aiVarianceA: '→ Vérifier le portionnement en cuisine ou identifier si des tomates servent à d\'autres plats non comptabilisés dans les recettes.',
      aiPriceT: 'Hausse de prix significative · Coopérative Taliouine',
      aiPriceB: "Le safran a augmenté de 12,4 % en 30 jours (de 16 à 18 MAD/g). Vos plats utilisant du safran (Couscous royal, Pastilla poulet) ont leur marge réduite de 1,8 % en moyenne. Coût additionnel : ~480 MAD/mois aux volumes actuels.",
      aiPriceA: '→ Négocier un contrat trimestriel avec Coopérative Taliouine pourrait sécuriser le prix à 16,5 MAD/g. Économie projetée : ~360 MAD/mois.',
      // Calendar
      calT: 'Livraisons à venir · 7 prochains jours',
      calEmpty: 'Aucune livraison',
      today: "Aujourd'hui",
      // Tab 2
      colArticle: 'ARTICLE', colCat: 'CATÉGORIE', colStock: 'STOCK ACTUEL', colPar: 'NIVEAU PAR',
      colVar: 'VARIANCE', colValue: 'VALEUR', colSupplier: 'FOURNISSEUR', colDays: 'JOURS RESTANTS',
      colStatus: 'STATUT', colActions: 'ACTIONS',
      catAll: 'Tous',
      catViandes: 'Viandes', catPoissons: 'Poissons', catLegumes: 'Légumes',
      catEpicerie: 'Épicerie', catEpices: 'Épices', catLaitiers: 'Laitiers',
      catBoissons: 'Boissons', catConsommables: 'Consommables', catProduits: 'Produits',
      catSoin: 'Produits soin',
      statAll: 'Tous', statOk: 'En stock', statLowFilter: 'Faible', statOutFilter: 'Rupture',
      viewList: 'Liste', viewCards: 'Cartes',
      searchPlaceholder: 'Rechercher un article, une catégorie, un fournisseur…',
      stOk: 'En stock', stLow: 'Faible', stOut: 'Rupture',
      tblFoot: (n, val, ok, low, out) => `${n} articles · Valeur totale : ${val} · ${ok} OK · ${low} faibles · ${out} ruptures`,
      varTip: (used, theo, cost) => `Utilisé ${used} vs ${theo} théorique (recettes). Impact : ${cost}.`,
      // Tab 3
      supTitle: 'Fournisseurs',
      supSub: (n) => `${n} fournisseurs actifs · paiement T+15 à T+30 sur la majorité`,
      supStatActive: 'FOURNISSEURS ACTIFS',
      supStatSpend: 'DÉPENSES CE MOIS',
      supStatPriceTrend: 'ÉVOLUTION PRIX MOYENNE',
      colSupCat: 'CATÉGORIE', colSupSpend: 'DÉPENSE / MOIS', colSupPrice: 'DERNIER PRIX',
      colSupDeliv: 'LIVRAISONS', colSupRate: 'ÉVALUATION',
      priceUp: 'Hausse récente', priceStable: 'stable',
      aiPriceUpT: '3 fournisseurs ont augmenté leurs prix ce mois',
      aiPriceUpB: 'Coopérative Taliouine (safran +12,4 %), Marché Central Port (poissons +8,4 %), et Fruits Premium (avocats +6,8 %) ont relevé leurs tarifs. Impact total estimé sur votre marge : −0,8 % du CA, soit environ 6 600 MAD/mois.',
      aiPriceUpA: '→ Négocier un volume garanti avec Marché Central pourrait stabiliser le prix poissons. Diversifier avec Marché El Joutia comme fournisseur secondaire pour les fruits.',
      // Tab 4
      ordTitle: 'Commandes en cours',
      ordNew: '+ Nouvelle commande',
      ordEmpty: 'Aucune commande pour le moment · créez votre première commande fournisseur.',
      ordStatActive: 'COMMANDES EN COURS',
      ordStatPending: 'EN ATTENTE LIVRAISON CETTE SEMAINE',
      ordStatMonth: 'COMMANDES CE MOIS',
      ordHistory: 'Historique des commandes',
      stConfirmed: 'Confirmée', stPending: 'En attente de confirmation', stRecurring: 'Récurrente · auto',
      stUrgent: 'À expédier', stReceived: 'Reçue', stCancelled: 'Annulée', stPartial: 'Partielle',
      btnDetail: 'Voir détails', btnEditOrd: 'Modifier', btnCancel: 'Annuler',
      btnConfirm: 'Confirmer', btnEditList: 'Modifier la liste', btnPause: 'Suspendre',
      btnTrack: 'Suivre la livraison', btnContactSup: 'Contacter fournisseur',
      autoOrderT: 'Commande automatique suggérée par Kiwi',
      autoOrderB: 'Basé sur vos par levels, votre rythme de consommation, et les délais de livraison, voici la commande optimale à passer maintenant pour la semaine prochaine :',
      autoOrderTotal: 'TOTAL OPTIMISÉ',
      autoOrderSave: 'Économie vs commandes séparées : 340 MAD',
      btnSendSuggested: 'Envoyer aux fournisseurs',
      btnEditFirst: "Modifier d'abord",
      // Tab 5
      fcTitle: 'Demande prévisionnelle · 7 prochains jours',
      fcSub: 'Top 5 articles · basé sur historique + saisonnalité + jour de la semaine',
      fcShortfallsT: 'Ruptures prévues',
      fcShortfallsSub: 'Articles risquant de tomber sous le par level dans les 7 prochains jours',
      btnScheduleOrder: 'Programmer la commande',
      fcRamadanT: 'Ramadan dans 12 jours · adaptez votre approvisionnement',
      fcRamadanB: 'Pendant le Ramadan, vos volumes de service midi chutent de 75 % mais les volumes du soir (19h-02h) augmentent de 220 %. Les plats les plus demandés deviennent : Harira (×4,2), Dattes (×8), Lait avec dattes, Pastilla. Vos commandes actuelles sont calibrées pour le rythme normal.',
      fcRamadanA: '→ Réduire de moitié les commandes viande midi (lundi-mercredi) et tripler la commande de dattes et lait à partir du 5 juin. Économies projetées : 8 400 MAD sur les 30 premiers jours de Ramadan.',
      fcWeekendT: 'Weekend approche · majoration prévue +28 %',
      fcWeekendB: 'Vos vendredis-samedis génèrent en moyenne +28 % de transactions vs semaine. Les ingrédients les plus impactés : viande hachée (×1,4), pain (×1,6), boissons fraîches (×1,5). Stock actuel insuffisant pour absorber le pic du vendredi 16 mai.',
      fcWeekendA: '→ Augmenter de 30 % la commande hebdomadaire Boucherie Errazi de jeudi. Coût supplémentaire : ~1 080 MAD. Manque à gagner évité si rupture : ~3 400 MAD.',
      fcCrossT: 'Opportunité de tarif Pro Volume · Métro Casablanca',
      fcCrossB: 'Vous achetez chez Métro Casablanca depuis 3 sites : Café Atlas (18 480 MAD/mois), Maison Mansour (640 MAD/mois), et Spa Bahia (840 MAD/mois). Volume cumulé : 19 960 MAD/mois. Vous êtes éligible au tarif Pro Volume (−6 %). Économie potentielle : ~1 198 MAD/mois.',
      fcCrossA: '→ Demander le tarif Pro Volume',
      lockedT: 'Prévisions IA disponibles sur Kiwi Ultra',
      lockedB: 'Anticipez les ruptures de stock 7 jours à l\'avance, adaptez vos commandes au calendrier (Ramadan, weekends, événements), et débloquez les tarifs Pro Volume sur vos fournisseurs multi-sites.',
      lockedCta: 'Passer à Kiwi Ultra →',
      // Modals
      mScanTitle: 'Scanner une facture',
      mScanDropT: 'Glissez votre facture ici ou prenez une photo',
      mScanDropS: 'Formats acceptés : PDF, JPG, PNG · max 10 Mo',
      mScanBtnFile: 'Choisir un fichier', mScanBtnCam: 'Utiliser la caméra',
      mScanManual: 'Saisir manuellement',
      mScanReadingT: 'Lecture de la facture…', mScanReadingS: 'Extraction OCR · reconnaissance des articles',
      mScanReadingFile: 'Extraction du texte PDF…',
      mScanServerNotice: 'La facture est analysée sur le serveur Kiwi pour pré-remplir les lignes.',
      mScanFailFallback: 'Lecture automatique indisponible — passage en saisie manuelle.',
      mScanUpdateCost: 'Mettre à jour le prix d\'achat',
      mScanColCurrentCost: 'Prix réf.',
      mScanColInvoicedCost: 'Facturé',
      mScanIgnore: 'Ignorer cette ligne',
      mScanChoose: 'Choisir un article…',
      mScanReviewT: 'Facture détectée',
      mScanSupplier: 'Fournisseur', mScanDate: 'Date', mScanNum: 'Numéro',
      mScanTva: 'TVA', mScanTotal: 'Total',
      mScanOk: '✓ 2 articles correspondent à votre inventaire, stock sera mis à jour',
      mScanWarn: '⚠ 1 nouvel article détecté, voulez-vous l\'ajouter au catalogue ?',
      mScanConfirm: 'Confirmer la facture',
      mScanToast: 'Facture enregistrée · Stock mis à jour · 3 articles',
      mCountTitle: 'Inventaire physique',
      mCountSub: 'Comptez chaque article et saisissez la quantité réelle. Kiwi calcule l\'écart automatiquement.',
      mCountColTheo: 'STOCK THÉORIQUE', mCountColReal: 'QUANTITÉ COMPTÉE', mCountColVar: 'ÉCART', mCountColCost: 'VALEUR ÉCART',
      mCountProg: (done, total) => `${done} / ${total} articles comptés`,
      mCountSave: 'Sauvegarder le brouillon', mCountValidate: "Valider l'inventaire",
      mCountToast: (totalCost) => `Inventaire validé · Écart total : ${totalCost} · Stock mis à jour`,
      mCountBlind: "Comptage à l'aveugle",
      mCountBlindTip: 'le stock théorique reste masqué pendant la saisie pour ne pas influencer le comptage',
      mCountLast: (d, v) => `Dernier inventaire : ${d} · écart ${v}`,
      btnSheet: "Feuille d'inventaire",
      mSheetTitle: "Feuille d'inventaire",
      mSheetSub: 'Imprimez la feuille, comptez rayon par rayon, puis saisissez les quantités dans « Inventaire physique ».',
      mSheetTheo: 'Afficher le stock théorique sur la feuille',
      mSheetTheoTip: "recommandé : sans le théorique, on note ce qu'on voit vraiment",
      mSheetCount: (n) => `${n} articles seront listés, regroupés par catégorie.`,
      mSheetPrint: 'Imprimer la feuille',
      sheetCounter: 'Compté par', sheetSign: 'Signature',
      sheetColItem: 'Article', sheetColUnit: 'Unité', sheetColNotes: 'Remarques',
      sheetFoot: "Comptez chaque article une seule fois, réserve comprise. En cas de doute sur l'unité (kg / pièce / carton), notez-le en remarque.",
      mRevTitle: "Écarts d'inventaire",
      mRevSub: (n) => `${n} articles comptés. Vérifiez chaque écart et sa cause probable avant d'ajuster le stock.`,
      mRevColReason: 'CAUSE PROBABLE',
      mRevNoneT: 'Aucun écart',
      mRevNone: 'Le comptage correspond au stock théorique. Confirmez pour enregistrer cet inventaire.',
      mRevTotal: (n, v) => `${n} écart(s) · valeur totale ${v}`,
      mRevBack: 'Annuler',
      mRevApply: 'Confirmer et ajuster le stock',
      reasonZero: 'Article introuvable au comptage — vérifier la réserve, le rangement ou un vol.',
      reasonUnit: "Écart démesuré — probable erreur d'unité (grammes saisis au lieu de kg, ou pièces / carton).",
      reasonWaste: 'Des pertes ont été signalées récemment — probable casse ou périmé supplémentaire non enregistré.',
      reasonRecipes: 'Proche de la consommation recettes de la semaine — portions servies non décomptées du stock.',
      reasonPerish: 'Produit périssable — pertes, parage ou portions généreuses probables.',
      reasonLoss: 'Sortie non enregistrée — casse, offert, usage interne ou coulage.',
      reasonDeliv: 'Livraison enregistrée il y a moins de 48 h — risque de double saisie du même carton.',
      reasonExtra: 'Réception non saisie ou retour non enregistré — vérifier les bons de livraison.',
      mQoTitle: 'Commande rapide',
      mQoArticle: 'Article', mQoQty: 'Quantité à commander', mQoSup: 'Fournisseur',
      mQoMode: 'Mode de livraison', mQoModeStd: 'Standard · 24-48h', mQoModeExp: 'Express · 6h · +120 MAD',
      mQoNote: 'Note pour le fournisseur', mQoTotal: 'TOTAL ESTIMÉ',
      mQoSend: 'Envoyer la commande',
      mQoToast: (sup, when) => `Commande envoyée à ${sup} · WhatsApp confirmé · livraison prévue ${when}`,
      mSupHistory: 'Historique des livraisons',
      mSupPrices: 'Évolution des prix · 6 derniers mois',
      mSupCall: 'Appeler', mSupWa: 'WhatsApp', mSupOrd: 'Nouvelle commande',
      mItStockActual: 'Stock actuel', mItParR: 'Par level', mItReorderR: 'Niveau de réappro',
      mItValue: 'Valeur stock', mItCost: 'Coût unitaire', mItVarW: 'Variance semaine',
      mItDaysL: 'Jours restants',
      mItUsageT: 'Consommation · 14 derniers jours',
      mItUsageL: 'Réelle', mItUsageTheo: 'Théorique (recettes)',
      mItPricesT: 'Historique des prix',
      mItAltT: 'Fournisseurs alternatifs',
      mItOrder: 'Commander', mItEdit: 'Modifier', mItMark: 'Marquer 86', mItClose: 'Fermer',
      mDayTitle: (dayName) => `Livraisons du ${dayName}`,
      // Cat keys (used by catLabel)
      'cat.viandes': 'Viandes', 'cat.poissons': 'Poissons', 'cat.legumes': 'Légumes',
      'cat.epicerie': 'Épicerie', 'cat.epices': 'Épices', 'cat.laitiers': 'Laitiers',
      'cat.boissons': 'Boissons', 'cat.consommables': 'Consommables',
      'cat.produits': 'Produits', 'cat.produits-soin': 'Produits soin',
      // Days of week
      dayMon: 'Lundi', dayTue: 'Mardi', dayWed: 'Mercredi', dayThu: 'Jeudi',
      dayFri: 'Vendredi', daySat: 'Samedi', daySun: 'Dimanche',
      // Misc
      ramOrder: 'Commande #', ramItems: 'articles',
      ramTomorrow: 'Demain', ramFriday: 'Vendredi', ramNextThu: 'Jeudi prochain', ramTodayLate: "Aujourd'hui 14h",
      addItemTitle: 'Nouvel article',
      addItemName: 'Nom', addItemCat: 'Catégorie', addItemUnit: 'Unité',
      addItemSupplier: 'Fournisseur principal', addItemPar: 'Par level', addItemReorder: 'Niveau de réappro',
      addItemCost: 'Coût unitaire (MAD)',
      addItemBtn: "Ajouter au catalogue",
      addItemStock: 'Stock actuel',
      addItemToast: (name) => `${name} ajouté au catalogue`,
      // Edit / delete item
      editItemTitle: "Modifier l'article",
      editItemBtn: 'Enregistrer les modifications',
      editItemToast: (name) => `${name} mis à jour`,
      deleteItemTitle: 'Supprimer cet article ?',
      deleteItemBody: (name) => `Vous êtes sur le point de supprimer « ${name} » du catalogue.`,
      deleteItemBtn: "Supprimer l'article",
      deleteItemToast: (name) => `${name} supprimé du catalogue`,
      ordNewToast: 'Nouvelle commande · démarrez par un fournisseur',
      ordDetailToast: (id) => `Détails commande #${id}`,
      ordDetailDesc: 'Articles · prix · livraison · suivi temps réel.',
      ordEditToast: (id) => `Modifier commande #${id}`,
      ordCancelToast: (id) => `Commande #${id} annulée`,
      ordPauseToast: (id) => `Commande récurrente #${id} suspendue`,
      poNewToast: 'Nouvelle commande · sélectionnez les articles',
      mItDelete: "Supprimer l'article",
      addCatOpt: '+ Nouvelle catégorie…',
      addCatTitle: 'Nouvelle catégorie',
      addCatName: 'Nom de la catégorie',
      addCatBtn: 'Créer la catégorie',
      addCatToast: (name) => `Catégorie « ${name} » créée`,
      addCatInline: 'Confirmer',
      addCatPillTitle: 'Ajouter une catégorie',
      // Suppliers
      addSupCta: 'Ajouter un fournisseur',
      addSupTitle: 'Nouveau fournisseur',
      addSupBtn: 'Ajouter le fournisseur',
      addSupToast: (name) => `${name} ajouté à vos fournisseurs`,
      editSupTitle: 'Modifier le fournisseur',
      editSupBtn: 'Enregistrer les modifications',
      editSupToast: (name) => `${name} mis à jour`,
      deleteSupTitle: 'Supprimer ce fournisseur ?',
      deleteSupBody: (name) => `Vous êtes sur le point de supprimer « ${name} ». Les articles existants conservent leur référence textuelle.`,
      deleteSupBtn: 'Supprimer le fournisseur',
      deleteSupToast: (name) => `${name} supprimé`,
      supName: 'Nom', supCat: 'Catégorie', supPhone: 'Téléphone', supLoc: 'Ville · localisation',
      supPay: 'Conditions de paiement', supDeliv: 'Fréquence de livraison',
      // Backup suppliers
      mItSuppliersT: 'Fournisseurs',
      mItNoSuppliers: 'Aucun fournisseur enregistré.',
      mItAddBackupSup: 'Ajouter un fournisseur de secours',
      supRankPrincipal: 'Principal',
      supRankBackup: 'Secours',
      addBackupSupTitle: 'Ajouter un fournisseur de secours',
      addBackupSupLabel: 'Fournisseur',
      addBackupSupPrice: 'Prix unitaire d’achat',
      addBackupSupOptNew: '+ Nouveau fournisseur…',
      addBackupSupNewName: 'Nom du nouveau fournisseur',
      addBackupSupHelp: 'Ce fournisseur sera proposé lors des réceptions et commandes pour cet article.',
      addBackupSupConfirm: 'Enregistrer',
      backupSupAddedToast: (name) => `${name} ajouté comme fournisseur de secours`,
      backupSupUpdatedToast: (name, price) => `Prix de ${name} mis à jour (${price} MAD)`,
      // Fusion-mode toggle
      venueAll: 'Tous', venueAtlas: 'Café Atlas', venueMaison: 'Maison Mansour', venueSpa: 'Spa Bahia',
    },
    en: {
      breadcrumb: 'Stock & procurement',
      title: 'Stock & procurement',
      sub: (n, sup, val) => `${n} tracked items · ${sup} active suppliers · stock value ${val}`,
      btnScan: 'Scan invoice',
      btnCount: 'Physical count',
      btnAdd: 'New item',
      tabOverview: 'Overview',
      tabItems: 'Items & stock',
      tabSuppliers: 'Suppliers',
      tabOrders: 'Orders',
      tabForecast: 'AI forecast',
      ultra: '✦ ULTRA',
      kpiValueL: 'TOTAL STOCK VALUE',
      kpiAlertL: 'OUT / LOW STOCK',
      kpiCostL: 'COST OF GOODS · WEEK',
      kpiDelivL: 'NEXT DELIVERY',
      kpiValueSub: (n) => `${n} items in stock`,
      kpiAlertSub: (out, low) => `${out} out · ${low} to reorder`,
      kpiAlertOk: 'All levels healthy',
      kpiCostSub: (r) => `Cost ratio: ${r}`,
      kpiCostTip: 'Moroccan F&B standard: 28-32%. Above that, your gross margin is under pressure.',
      alertsT: 'Handle now',
      alertsEmpty: 'No alerts · all stock levels healthy.',
      statusOut: 'OUT OF STOCK', statusLow: 'LOW STOCK',
      lastDeliv: 'Last delivery', supplier: 'Supplier',
      impactCost: 'Estimated impact cost', perDayMissed: '/day lost revenue',
      daysLeft: (d) => `${d} ${d === 1 ? 'day left' : 'days left'}`,
      level: 'Level', par: 'Par',
      btnUrgentOrder: 'Urgent order', btnMark86: 'Mark 86 on menu',
      btnReorder: 'Restock', btnIgnore: 'Ignore 24h',
      aiVarianceT: 'Consumption variance detected · Fresh tomatoes',
      aiVarianceB: 'Fresh tomatoes used at 32.4 kg this week vs 31.0 kg theoretical (based on POS sales). Variance of +4.5%. Over the last 4 weeks, cumulative variance hits +18%, equivalent to 12 kg over-used, or ~96 MAD of cost not billed to sales.',
      aiVarianceA: '→ Check kitchen portioning or identify if tomatoes are used in other dishes not in the recipes.',
      aiPriceT: 'Significant price increase · Coopérative Taliouine',
      aiPriceB: 'Saffron up 12.4% in 30 days (16 → 18 MAD/g). Dishes using saffron (Royal couscous, Chicken pastilla) have their margin reduced by 1.8% on average. Additional cost: ~480 MAD/month at current volumes.',
      aiPriceA: '→ Negotiate a quarterly contract with Coopérative Taliouine to secure the price at 16.5 MAD/g. Projected savings: ~360 MAD/month.',
      calT: 'Upcoming deliveries · next 7 days', calEmpty: 'No delivery', today: 'Today',
      colArticle: 'ITEM', colCat: 'CATEGORY', colStock: 'CURRENT STOCK', colPar: 'PAR LEVEL',
      colVar: 'VARIANCE', colValue: 'VALUE', colSupplier: 'SUPPLIER', colDays: 'DAYS LEFT',
      colStatus: 'STATUS', colActions: 'ACTIONS',
      catAll: 'All',
      catViandes: 'Meat', catPoissons: 'Fish', catLegumes: 'Vegetables',
      catEpicerie: 'Pantry', catEpices: 'Spices', catLaitiers: 'Dairy',
      catBoissons: 'Beverages', catConsommables: 'Consumables', catProduits: 'Products',
      catSoin: 'Body care',
      statAll: 'All', statOk: 'In stock', statLowFilter: 'Low', statOutFilter: 'Out',
      viewList: 'List', viewCards: 'Cards',
      searchPlaceholder: 'Search item, category, supplier…',
      stOk: 'In stock', stLow: 'Low', stOut: 'Out',
      tblFoot: (n, val, ok, low, out) => `${n} items · Total value: ${val} · ${ok} OK · ${low} low · ${out} out`,
      varTip: (used, theo, cost) => `Used ${used} vs ${theo} theoretical (recipes). Impact: ${cost}.`,
      supTitle: 'Suppliers',
      supSub: (n) => `${n} active suppliers · payment T+15 to T+30 on most`,
      supStatActive: 'ACTIVE SUPPLIERS', supStatSpend: 'SPEND THIS MONTH', supStatPriceTrend: 'AVG PRICE CHANGE',
      colSupCat: 'CATEGORY', colSupSpend: 'SPEND / MONTH', colSupPrice: 'LATEST PRICE',
      colSupDeliv: 'DELIVERIES', colSupRate: 'RATING',
      priceUp: 'Recent rise', priceStable: 'stable',
      aiPriceUpT: '3 suppliers raised prices this month',
      aiPriceUpB: 'Coopérative Taliouine (saffron +12.4%), Marché Central Port (fish +8.4%), and Fruits Premium (avocados +6.8%) raised their rates. Total estimated margin impact: −0.8% of revenue, around 6,600 MAD/month.',
      aiPriceUpA: '→ Negotiating a guaranteed volume with Marché Central could stabilize the fish price. Diversify with Marché El Joutia as a secondary supplier for fruits.',
      ordTitle: 'Active orders', ordNew: '+ New order',
      ordEmpty: 'No orders yet · create your first supplier order.',
      ordStatActive: 'ACTIVE ORDERS', ordStatPending: 'PENDING DELIVERY THIS WEEK', ordStatMonth: 'ORDERS THIS MONTH',
      ordHistory: 'Order history',
      stConfirmed: 'Confirmed', stPending: 'Awaiting confirmation', stRecurring: 'Recurring · auto',
      stUrgent: 'Shipping', stReceived: 'Received', stCancelled: 'Cancelled', stPartial: 'Partial',
      btnDetail: 'View details', btnEditOrd: 'Modify', btnCancel: 'Cancel',
      btnConfirm: 'Confirm', btnEditList: 'Edit list', btnPause: 'Pause',
      btnTrack: 'Track delivery', btnContactSup: 'Contact supplier',
      autoOrderT: 'Auto-order suggested by Kiwi',
      autoOrderB: 'Based on your par levels, consumption rhythm, and delivery times, here is the optimal order to place now for next week:',
      autoOrderTotal: 'OPTIMIZED TOTAL', autoOrderSave: 'Savings vs separate orders: 340 MAD',
      btnSendSuggested: 'Send to suppliers', btnEditFirst: 'Edit first',
      fcTitle: 'Forecasted demand · next 7 days',
      fcSub: 'Top 5 items · based on history + seasonality + day-of-week',
      fcShortfallsT: 'Predicted shortfalls',
      fcShortfallsSub: 'Items at risk of falling below par level in the next 7 days',
      btnScheduleOrder: 'Schedule order',
      fcRamadanT: 'Ramadan in 12 days · adapt your supply',
      fcRamadanB: 'During Ramadan, your midday service volumes drop 75% but evening volumes (7pm-2am) increase 220%. The most demanded dishes become: Harira (×4.2), Dates (×8), Milk with dates, Pastilla. Your current orders are calibrated for the normal pace.',
      fcRamadanA: '→ Halve the lunch meat orders (Mon-Wed) and triple the dates and milk order from June 5. Projected savings: 8,400 MAD over the first 30 days of Ramadan.',
      fcWeekendT: 'Weekend approaching · +28% surge expected',
      fcWeekendB: 'Your Friday-Saturday generates on average +28% transactions vs weekday. Most impacted ingredients: ground meat (×1.4), bread (×1.6), cold beverages (×1.5). Current stock insufficient to absorb Friday May 16 peak.',
      fcWeekendA: '→ Increase the weekly Boucherie Errazi Thursday order by 30%. Additional cost: ~1,080 MAD. Avoided lost revenue if stockout: ~3,400 MAD.',
      fcCrossT: 'Pro Volume pricing opportunity · Métro Casablanca',
      fcCrossB: 'You buy from Métro Casablanca across 3 sites: Café Atlas (18,480 MAD/mo), Maison Mansour (640 MAD/mo), and Spa Bahia (840 MAD/mo). Combined volume: 19,960 MAD/month. You qualify for Pro Volume pricing (−6%). Potential savings: ~1,198 MAD/month.',
      fcCrossA: '→ Request Pro Volume pricing',
      lockedT: 'AI forecast available on Kiwi Ultra',
      lockedB: 'Anticipate stockouts 7 days ahead, adapt your orders to the calendar (Ramadan, weekends, events), and unlock Pro Volume pricing on your multi-site suppliers.',
      lockedCta: 'Upgrade to Kiwi Ultra →',
      mScanTitle: 'Scan invoice',
      mScanDropT: 'Drop your invoice here or take a photo',
      mScanDropS: 'Accepted formats: PDF, JPG, PNG · max 10 MB',
      mScanBtnFile: 'Choose file', mScanBtnCam: 'Use camera',
      mScanManual: 'Enter manually',
      mScanReadingT: 'Reading invoice…', mScanReadingS: 'OCR extraction · item recognition',
      mScanReadingFile: 'Extracting PDF text…',
      mScanServerNotice: 'The invoice is analyzed on Kiwi\'s server to pre-fill lines.',
      mScanFailFallback: 'Automatic reading unavailable — switched to manual entry.',
      mScanUpdateCost: 'Update purchase price',
      mScanColCurrentCost: 'Ref. price',
      mScanColInvoicedCost: 'Invoiced',
      mScanIgnore: 'Ignore this line',
      mScanChoose: 'Choose an item…',
      mScanReviewT: 'Invoice detected',
      mScanSupplier: 'Supplier', mScanDate: 'Date', mScanNum: 'Number',
      mScanTva: 'VAT', mScanTotal: 'Total',
      mScanOk: '✓ 2 items match your inventory, stock will be updated',
      mScanWarn: '⚠ 1 new item detected, add to catalogue?',
      mScanConfirm: 'Confirm invoice',
      mScanToast: 'Invoice recorded · Stock updated · 3 items',
      mCountTitle: 'Physical count',
      mCountSub: 'Count each item and enter the actual quantity. Kiwi computes the variance automatically.',
      mCountColTheo: 'THEORETICAL STOCK', mCountColReal: 'COUNTED QTY', mCountColVar: 'VARIANCE', mCountColCost: 'VARIANCE VALUE',
      mCountProg: (done, total) => `${done} / ${total} items counted`,
      mCountSave: 'Save draft', mCountValidate: 'Validate inventory',
      mCountToast: (totalCost) => `Inventory validated · Total variance: ${totalCost} · Stock updated`,
      mCountBlind: 'Blind count',
      mCountBlindTip: 'the theoretical stock stays hidden while counting so it does not influence the figures',
      mCountLast: (d, v) => `Last inventory: ${d} · variance ${v}`,
      btnSheet: 'Count sheet',
      mSheetTitle: 'Inventory count sheet',
      mSheetSub: 'Print the sheet, count aisle by aisle, then enter the quantities in "Physical count".',
      mSheetTheo: 'Show theoretical stock on the sheet',
      mSheetTheoTip: 'recommended: without the theoretical figure, you write down what you actually see',
      mSheetCount: (n) => `${n} items will be listed, grouped by category.`,
      mSheetPrint: 'Print the sheet',
      sheetCounter: 'Counted by', sheetSign: 'Signature',
      sheetColItem: 'Item', sheetColUnit: 'Unit', sheetColNotes: 'Notes',
      sheetFoot: 'Count each item once, back room included. If unsure about the unit (kg / piece / box), write it in the notes.',
      mRevTitle: 'Inventory variances',
      mRevSub: (n) => `${n} items counted. Review each variance and its probable cause before adjusting stock.`,
      mRevColReason: 'PROBABLE CAUSE',
      mRevNoneT: 'No variance',
      mRevNone: 'The count matches theoretical stock. Confirm to record this inventory.',
      mRevTotal: (n, v) => `${n} variance(s) · total value ${v}`,
      mRevBack: 'Cancel',
      mRevApply: 'Confirm and adjust stock',
      reasonZero: 'Item not found during the count — check the back room, shelving, or possible theft.',
      reasonUnit: 'Outsized variance — likely a unit error (grams entered instead of kg, or pieces / box).',
      reasonWaste: 'Waste was reported recently — likely additional breakage or expiry not recorded.',
      reasonRecipes: "Close to this week's recipe consumption — served portions not deducted from stock.",
      reasonPerish: 'Perishable product — losses, trimming, or generous portions are likely.',
      reasonLoss: 'Unrecorded outflow — breakage, freebies, internal use, or shrinkage.',
      reasonDeliv: 'A delivery was recorded less than 48h ago — risk of the same box being entered twice.',
      reasonExtra: 'Unrecorded delivery or return — check the delivery notes.',
      mQoTitle: 'Quick order',
      mQoArticle: 'Item', mQoQty: 'Quantity to order', mQoSup: 'Supplier',
      mQoMode: 'Delivery mode', mQoModeStd: 'Standard · 24-48h', mQoModeExp: 'Express · 6h · +120 MAD',
      mQoNote: 'Note for the supplier', mQoTotal: 'ESTIMATED TOTAL',
      mQoSend: 'Send order',
      mQoToast: (sup, when) => `Order sent to ${sup} · WhatsApp confirmed · delivery scheduled ${when}`,
      mSupHistory: 'Delivery history',
      mSupPrices: 'Price trend · last 6 months',
      mSupCall: 'Call', mSupWa: 'WhatsApp', mSupOrd: 'New order',
      mItStockActual: 'Current stock', mItParR: 'Par level', mItReorderR: 'Reorder level',
      mItValue: 'Stock value', mItCost: 'Unit cost', mItVarW: 'Week variance',
      mItDaysL: 'Days left',
      mItUsageT: 'Usage · last 14 days',
      mItUsageL: 'Actual', mItUsageTheo: 'Theoretical (recipes)',
      mItPricesT: 'Price history',
      mItAltT: 'Alternate suppliers',
      mItOrder: 'Order', mItEdit: 'Edit', mItMark: 'Mark 86', mItClose: 'Close',
      mDayTitle: (dayName) => `${dayName} deliveries`,
      'cat.viandes': 'Meat', 'cat.poissons': 'Fish', 'cat.legumes': 'Vegetables',
      'cat.epicerie': 'Pantry', 'cat.epices': 'Spices', 'cat.laitiers': 'Dairy',
      'cat.boissons': 'Beverages', 'cat.consommables': 'Consumables',
      'cat.produits': 'Products', 'cat.produits-soin': 'Body care',
      dayMon: 'Monday', dayTue: 'Tuesday', dayWed: 'Wednesday', dayThu: 'Thursday',
      dayFri: 'Friday', daySat: 'Saturday', daySun: 'Sunday',
      ramOrder: 'Order #', ramItems: 'items',
      ramTomorrow: 'Tomorrow', ramFriday: 'Friday', ramNextThu: 'Next Thursday', ramTodayLate: 'Today 2pm',
      addItemTitle: 'New item',
      addItemName: 'Name', addItemCat: 'Category', addItemUnit: 'Unit',
      addItemSupplier: 'Primary supplier', addItemPar: 'Par level', addItemReorder: 'Reorder level',
      addItemCost: 'Unit cost (MAD)',
      addItemBtn: 'Add to catalogue',
      addItemStock: 'Current stock',
      addItemToast: (name) => `${name} added to catalogue`,
      editItemTitle: 'Edit item',
      editItemBtn: 'Save changes',
      editItemToast: (name) => `${name} updated`,
      deleteItemTitle: 'Delete this item?',
      deleteItemBody: (name) => `You are about to remove "${name}" from the catalogue.`,
      deleteItemBtn: 'Delete item',
      deleteItemToast: (name) => `${name} removed from catalogue`,
      ordNewToast: 'New order · start with a supplier',
      ordDetailToast: (id) => `Order #${id} details`,
      ordDetailDesc: 'Items · prices · delivery · real-time tracking.',
      ordEditToast: (id) => `Edit order #${id}`,
      ordCancelToast: (id) => `Order #${id} cancelled`,
      ordPauseToast: (id) => `Recurring order #${id} paused`,
      poNewToast: 'New order · select the items',
      mItDelete: 'Delete item',
      // Backup suppliers
      mItSuppliersT: 'Suppliers',
      mItNoSuppliers: 'No supplier recorded.',
      mItAddBackupSup: 'Add backup supplier',
      supRankPrincipal: 'Primary',
      supRankBackup: 'Backup',
      addBackupSupTitle: 'Add backup supplier',
      addBackupSupLabel: 'Supplier',
      addBackupSupPrice: 'Unit purchase price',
      addBackupSupOptNew: '+ New supplier…',
      addBackupSupNewName: 'New supplier name',
      addBackupSupHelp: 'This supplier will be proposed during deliveries and orders for this item.',
      addBackupSupConfirm: 'Save',
      backupSupAddedToast: (name) => `${name} added as backup supplier`,
      backupSupUpdatedToast: (name, price) => `Price for ${name} updated (${price} MAD)`,
      addCatOpt: '+ New category…',
      addCatTitle: 'New category',
      addCatName: 'Category name',
      addCatBtn: 'Create category',
      addCatToast: (name) => `Category "${name}" created`,
      addCatInline: 'Confirm',
      addCatPillTitle: 'Add category',
      addSupCta: 'Add supplier',
      addSupTitle: 'New supplier',
      addSupBtn: 'Add supplier',
      addSupToast: (name) => `${name} added to your suppliers`,
      editSupTitle: 'Edit supplier',
      editSupBtn: 'Save changes',
      editSupToast: (name) => `${name} updated`,
      deleteSupTitle: 'Delete this supplier?',
      deleteSupBody: (name) => `You are about to remove "${name}". Existing items keep their text reference.`,
      deleteSupBtn: 'Delete supplier',
      deleteSupToast: (name) => `${name} removed`,
      supName: 'Name', supCat: 'Category', supPhone: 'Phone', supLoc: 'City · location',
      supPay: 'Payment terms', supDeliv: 'Delivery frequency',
      supRating: 'Rating (1-5)', supSpend: 'Estimated monthly spend (MAD)',
      titleEdit: 'Edit', titleDelete: 'Delete',
      venueAll: 'All', venueAtlas: 'Café Atlas', venueMaison: 'Maison Mansour', venueSpa: 'Spa Bahia',
    },
    ar: {
      breadcrumb: 'المخزون والتموين',
      title: 'المخزون والتموين',
      sub: (n, sup, val) => `${n} منتجًا متابعًا · ${sup} موردًا نشطًا · قيمة المخزون ${val}`,
      btnScan: 'مسح فاتورة', btnCount: 'جرد فعلي', btnAdd: 'منتج جديد',
      tabOverview: 'نظرة عامة', tabItems: 'المنتجات والمخزون', tabSuppliers: 'الموردون',
      tabOrders: 'الطلبيات', tabForecast: 'توقعات الذكاء الاصطناعي',
      ultra: '✦ ULTRA',
      kpiValueL: 'إجمالي قيمة المخزون', kpiAlertL: 'نفد / منخفض', kpiCostL: 'تكلفة المواد · أسبوع',
      kpiDelivL: 'التسليم القادم',
      kpiValueSub: (n) => `${n} منتجًا في المخزون`,
      kpiAlertSub: (out, low) => `${out} نافد · ${low} للطلب`,
      kpiAlertOk: 'جميع المستويات صحية',
      kpiCostSub: (r) => `نسبة تكلفة المواد: ${r}`,
      kpiCostTip: 'المعيار في المطاعم المغربية: 28-32%. ما فوق ذلك، هامشك الإجمالي تحت الضغط.',
      alertsT: 'يجب التعامل معه الآن',
      alertsEmpty: 'لا توجد تنبيهات · جميع مستويات المخزون صحية.',
      statusOut: 'نفد المخزون', statusLow: 'مخزون منخفض',
      lastDeliv: 'آخر تسليم', supplier: 'المورد',
      impactCost: 'تكلفة التأثير المقدرة', perDayMissed: '/يوم خسارة',
      daysLeft: (d) => `${d} ${d === 1 ? 'يوم متبقي' : 'أيام متبقية'}`,
      level: 'المستوى', par: 'الحد',
      btnUrgentOrder: 'طلب عاجل', btnMark86: 'وضع علامة 86',
      btnReorder: 'إعادة التموين', btnIgnore: 'تجاهل 24س',
      aiVarianceT: 'فرق في الاستهلاك · طماطم طازجة',
      aiVarianceB: 'تم استهلاك الطماطم الطازجة بـ 32,4 كغ هذا الأسبوع مقابل 31,0 كغ نظريًا (بناءً على مبيعات الكاشير). فرق +4,5%. على الأسابيع الأربعة الأخيرة، الفرق التراكمي يبلغ +18%، أي 12 كغ زائدة، حوالي 96 درهم تكلفة غير محسوبة.',
      aiVarianceA: '→ تحقق من التحصيص في المطبخ أو حدد ما إذا كانت الطماطم تُستخدم في أطباق أخرى غير مذكورة في الوصفات.',
      aiPriceT: 'ارتفاع كبير في السعر · تعاونية تاليوين',
      aiPriceB: 'الزعفران ارتفع بـ 12,4% في 30 يومًا (من 16 إلى 18 درهم/غ). أطباقك المستخدمة للزعفران (الكسكس الملكي، بسطيلة الدجاج) انخفض هامشها بـ 1,8% في المتوسط. تكلفة إضافية: ~480 درهم/شهر.',
      aiPriceA: '→ التفاوض على عقد ربع سنوي مع تعاونية تاليوين قد يضمن السعر عند 16,5 درهم/غ. التوفير المتوقع: ~360 درهم/شهر.',
      calT: 'التسليمات القادمة · 7 أيام', calEmpty: 'لا تسليم', today: 'اليوم',
      colArticle: 'المنتج', colCat: 'الفئة', colStock: 'المخزون الحالي', colPar: 'الحد',
      colVar: 'الفرق', colValue: 'القيمة', colSupplier: 'المورد', colDays: 'الأيام المتبقية',
      colStatus: 'الحالة', colActions: 'إجراءات',
      catAll: 'الكل',
      catViandes: 'لحوم', catPoissons: 'أسماك', catLegumes: 'خضروات',
      catEpicerie: 'بقالة', catEpices: 'توابل', catLaitiers: 'ألبان',
      catBoissons: 'مشروبات', catConsommables: 'مستهلكات', catProduits: 'منتجات',
      catSoin: 'منتجات العناية',
      statAll: 'الكل', statOk: 'في المخزون', statLowFilter: 'منخفض', statOutFilter: 'نفد',
      viewList: 'قائمة', viewCards: 'بطاقات',
      searchPlaceholder: 'ابحث عن منتج، فئة، مورد…',
      stOk: 'في المخزون', stLow: 'منخفض', stOut: 'نفد',
      tblFoot: (n, val, ok, low, out) => `${n} منتج · القيمة الإجمالية: ${val} · ${ok} OK · ${low} منخفض · ${out} نفد`,
      varTip: (used, theo, cost) => `مستخدم ${used} مقابل ${theo} نظري (وصفات). التأثير: ${cost}.`,
      supTitle: 'الموردون',
      supSub: (n) => `${n} موردًا نشطًا · الدفع T+15 إلى T+30 للأغلبية`,
      supStatActive: 'الموردون النشطون', supStatSpend: 'الإنفاق هذا الشهر', supStatPriceTrend: 'متوسط تغير الأسعار',
      colSupCat: 'الفئة', colSupSpend: 'الإنفاق / شهر', colSupPrice: 'آخر سعر',
      colSupDeliv: 'التسليمات', colSupRate: 'التقييم',
      priceUp: 'ارتفاع حديث', priceStable: 'مستقر',
      aiPriceUpT: 'رفع 3 موردين أسعارهم هذا الشهر',
      aiPriceUpB: 'تعاونية تاليوين (زعفران +12,4%)، المرسى المركزي · الميناء (أسماك +8,4%)، وفروت بريميوم (أفوكا +6,8%) رفعوا أسعارهم. التأثير الكلي المقدر على هامشك: −0,8% من رقم الأعمال، أي حوالي 6 600 درهم/شهر.',
      aiPriceUpA: '→ التفاوض على حجم مضمون مع المرسى المركزي قد يثبت سعر السمك. التنويع مع سوق الجوطية كمورد ثانوي للفواكه.',
      ordTitle: 'الطلبيات الجارية', ordNew: '+ طلبية جديدة',
      ordEmpty: 'لا توجد طلبيات بعد · أنشئ أول طلبية مورّد.',
      ordStatActive: 'الطلبيات الجارية', ordStatPending: 'في انتظار التسليم هذا الأسبوع', ordStatMonth: 'الطلبيات هذا الشهر',
      ordHistory: 'سجل الطلبيات',
      stConfirmed: 'مؤكدة', stPending: 'في انتظار التأكيد', stRecurring: 'متكررة · تلقائية',
      stUrgent: 'للشحن', stReceived: 'مستلمة', stCancelled: 'ملغاة', stPartial: 'جزئية',
      btnDetail: 'عرض التفاصيل', btnEditOrd: 'تعديل', btnCancel: 'إلغاء',
      btnConfirm: 'تأكيد', btnEditList: 'تعديل القائمة', btnPause: 'إيقاف',
      btnTrack: 'تتبع التسليم', btnContactSup: 'التواصل مع المورد',
      autoOrderT: 'طلبية تلقائية يقترحها Kiwi',
      autoOrderB: 'بناءً على مستوياتك ووتيرة الاستهلاك ومدد التسليم، إليك الطلبية المثلى لتمريرها الآن للأسبوع القادم:',
      autoOrderTotal: 'المجموع المحسّن', autoOrderSave: 'التوفير مقابل الطلبيات المنفصلة: 340 درهم',
      btnSendSuggested: 'إرسال للموردين', btnEditFirst: 'تعديل أولاً',
      fcTitle: 'الطلب المتوقع · 7 أيام', fcSub: 'أعلى 5 منتجات · بناء على التاريخ + الموسمية + يوم الأسبوع',
      fcShortfallsT: 'حالات النقص المتوقعة',
      fcShortfallsSub: 'منتجات معرضة للنزول تحت الحد في 7 أيام القادمة',
      btnScheduleOrder: 'برمجة الطلبية',
      fcRamadanT: 'رمضان بعد 12 يومًا · كيف نضبط التموين',
      fcRamadanB: 'خلال رمضان، أحجام خدمة الزوال تنخفض 75% لكن أحجام المساء (19س-02س) ترتفع 220%. أكثر الأطباق طلبًا تصبح: الحريرة (×4,2)، التمر (×8)، الحليب بالتمر، البسطيلة. طلبياتك الحالية معايرة للوتيرة العادية.',
      fcRamadanA: '→ خفّض طلبيات لحم الزوال (الإثنين-الأربعاء) إلى النصف وثلّث طلبية التمر والحليب ابتداء من 5 يونيو. التوفير المتوقع: 8 400 درهم خلال أول 30 يومًا من رمضان.',
      fcWeekendT: 'الويكاند يقترب · ارتفاع متوقع +28%',
      fcWeekendB: 'جمعك-سبتك يحققون في المتوسط +28% معاملات مقابل الأسبوع. أكثر المكونات تأثرًا: اللحم المفروم (×1,4)، الخبز (×1,6)، المشروبات الباردة (×1,5). المخزون الحالي غير كاف لاستيعاب ذروة الجمعة 16 ماي.',
      fcWeekendA: '→ ارفع بـ 30% طلبية بوشري الرازي الأسبوعية ليوم الخميس. تكلفة إضافية: ~1 080 درهم. خسارة متجنبة إن حصل النقص: ~3 400 درهم.',
      fcCrossT: 'فرصة تسعير Pro Volume · مترو الدار البيضاء',
      fcCrossB: 'تشترون من مترو الدار البيضاء عبر 3 مواقع: مقهى أطلس (18 480 درهم/شهر)، ميزون منصور (640 درهم/شهر)، وسبا باهية (840 درهم/شهر). الحجم التراكمي: 19 960 درهم/شهر. أنتم مؤهلون لتسعير Pro Volume (−6%). التوفير المحتمل: ~1 198 درهم/شهر.',
      fcCrossA: '→ طلب تسعير Pro Volume',
      lockedT: 'توقعات الذكاء الاصطناعي متوفرة على Kiwi Ultra',
      lockedB: 'استبق نقص المخزون بـ 7 أيام، كيّف طلبياتك مع التقويم (رمضان، الويكاند، المناسبات)، وافتح تسعير Pro Volume على مورديك متعددي المواقع.',
      lockedCta: 'الانتقال إلى Kiwi Ultra →',
      mScanTitle: 'مسح فاتورة',
      mScanDropT: 'اسحب فاتورتك هنا أو التقط صورة',
      mScanDropS: 'الصيغ المقبولة: PDF, JPG, PNG · أقصى 10 ميغا',
      mScanBtnFile: 'اختيار ملف', mScanBtnCam: 'استخدام الكاميرا',
      mScanManual: 'إدخال يدوي',
      mScanReadingT: 'قراءة الفاتورة…', mScanReadingS: 'استخراج OCR · تعرف على المنتجات',
      mScanReadingFile: 'استخراج نص PDF…',
      mScanServerNotice: 'تتم قراءة الفاتورة على خادم Kiwi لملء البنود مسبقاً.',
      mScanFailFallback: 'القراءة التلقائية غير متوفرة — التحويل إلى الإدخال اليدوي.',
      mScanUpdateCost: 'تحديث سعر الشراء',
      mScanColCurrentCost: 'السعر المرجعي',
      mScanColInvoicedCost: 'المفوتر',
      mScanIgnore: 'تجاهل هذا السطر',
      mScanChoose: 'اختر منتجاً…',
      mScanReviewT: 'تم اكتشاف فاتورة',
      mScanSupplier: 'المورد', mScanDate: 'التاريخ', mScanNum: 'الرقم',
      mScanTva: 'الضريبة', mScanTotal: 'المجموع',
      mScanOk: '✓ منتجان مطابقان لمخزونك، سيتم تحديث المخزون',
      mScanWarn: '⚠ تم اكتشاف منتج جديد، هل تريد إضافته للكتالوج؟',
      mScanConfirm: 'تأكيد الفاتورة',
      mScanToast: 'تم تسجيل الفاتورة · تحديث المخزون · 3 منتجات',
      mCountTitle: 'جرد فعلي',
      mCountSub: 'عُدّ كل منتج وأدخل الكمية الفعلية. Kiwi يحسب الفرق تلقائيًا.',
      mCountColTheo: 'المخزون النظري', mCountColReal: 'الكمية المعدودة', mCountColVar: 'الفرق', mCountColCost: 'قيمة الفرق',
      mCountProg: (done, total) => `${done} / ${total} منتجًا معدودًا`,
      mCountSave: 'حفظ المسودة', mCountValidate: 'تأكيد الجرد',
      mCountToast: (totalCost) => `تم تأكيد الجرد · الفرق الكلي: ${totalCost} · المخزون محدث`,
      mCountBlind: 'جرد أعمى',
      mCountBlindTip: 'يبقى المخزون النظري مخفيًا أثناء الإدخال حتى لا يؤثر على العدّ',
      mCountLast: (d, v) => `آخر جرد: ${d} · فرق ${v}`,
      btnSheet: 'ورقة الجرد',
      mSheetTitle: 'ورقة الجرد',
      mSheetSub: 'اطبع الورقة، عُدّ رفًا برف، ثم أدخل الكميات في « جرد فعلي ».',
      mSheetTheo: 'إظهار المخزون النظري على الورقة',
      mSheetTheoTip: 'يُنصح بدونه: من غير الرقم النظري يكتب العدّاد ما يراه فعلًا',
      mSheetCount: (n) => `سيتم إدراج ${n} منتجًا، مجمعة حسب الفئة.`,
      mSheetPrint: 'طباعة الورقة',
      sheetCounter: 'عُدّ بواسطة', sheetSign: 'التوقيع',
      sheetColItem: 'المنتج', sheetColUnit: 'الوحدة', sheetColNotes: 'ملاحظات',
      sheetFoot: 'عُدّ كل منتج مرة واحدة بما في ذلك المخزن. عند الشك في الوحدة (كغ / قطعة / صندوق) اكتب ذلك في الملاحظات.',
      mRevTitle: 'فروقات الجرد',
      mRevSub: (n) => `${n} منتجًا معدودًا. راجع كل فرق وسببه المحتمل قبل تعديل المخزون.`,
      mRevColReason: 'السبب المحتمل',
      mRevNoneT: 'لا فرق',
      mRevNone: 'العدّ مطابق للمخزون النظري. أكّد لتسجيل هذا الجرد.',
      mRevTotal: (n, v) => `${n} فرق (فروقات) · القيمة الإجمالية ${v}`,
      mRevBack: 'إلغاء',
      mRevApply: 'تأكيد وتعديل المخزون',
      reasonZero: 'المنتج غير موجود عند العدّ — تحقق من المخزن أو الترتيب أو احتمال سرقة.',
      reasonUnit: 'فرق ضخم — على الأرجح خطأ في الوحدة (غرامات بدل كغ، أو قطع / صندوق).',
      reasonWaste: 'تم التبليغ عن خسائر مؤخرًا — على الأرجح كسر أو انتهاء صلاحية إضافي غير مسجل.',
      reasonRecipes: 'قريب من استهلاك الوصفات هذا الأسبوع — حصص مقدمة لم تُخصم من المخزون.',
      reasonPerish: 'منتج سريع التلف — خسائر أو تشذيب أو حصص سخية محتملة.',
      reasonLoss: 'خروج غير مسجل — كسر، مجاني، استعمال داخلي أو تسرب.',
      reasonDeliv: 'سُجلت تسليمة قبل أقل من 48 ساعة — خطر إدخال نفس الصندوق مرتين.',
      reasonExtra: 'استلام غير مسجل أو إرجاع غير مسجل — تحقق من سندات التسليم.',
      mQoTitle: 'طلبية سريعة',
      mQoArticle: 'المنتج', mQoQty: 'الكمية للطلب', mQoSup: 'المورد',
      mQoMode: 'وضع التسليم', mQoModeStd: 'عادي · 24-48س', mQoModeExp: 'سريع · 6س · +120 درهم',
      mQoNote: 'ملاحظة للمورد', mQoTotal: 'المجموع المقدر',
      mQoSend: 'إرسال الطلبية',
      mQoToast: (sup, when) => `تم إرسال الطلبية إلى ${sup} · واتساب مؤكد · التسليم المتوقع ${when}`,
      mSupHistory: 'سجل التسليمات', mSupPrices: 'تطور الأسعار · 6 أشهر',
      mSupCall: 'اتصال', mSupWa: 'واتساب', mSupOrd: 'طلبية جديدة',
      mItStockActual: 'المخزون الحالي', mItParR: 'الحد', mItReorderR: 'حد إعادة التموين',
      mItValue: 'قيمة المخزون', mItCost: 'تكلفة الوحدة', mItVarW: 'فرق الأسبوع',
      mItDaysL: 'الأيام المتبقية',
      mItUsageT: 'الاستهلاك · 14 يومًا الأخيرة',
      mItUsageL: 'فعلي', mItUsageTheo: 'نظري (وصفات)',
      mItPricesT: 'سجل الأسعار',
      mItAltT: 'موردون بدلاء',
      mItOrder: 'طلب', mItEdit: 'تعديل', mItMark: 'وضع علامة 86', mItClose: 'إغلاق',
      mDayTitle: (dayName) => `تسليمات ${dayName}`,
      'cat.viandes': 'لحوم', 'cat.poissons': 'أسماك', 'cat.legumes': 'خضروات',
      'cat.epicerie': 'بقالة', 'cat.epices': 'توابل', 'cat.laitiers': 'ألبان',
      'cat.boissons': 'مشروبات', 'cat.consommables': 'مستهلكات',
      'cat.produits': 'منتجات', 'cat.produits-soin': 'منتجات العناية',
      dayMon: 'الاثنين', dayTue: 'الثلاثاء', dayWed: 'الأربعاء', dayThu: 'الخميس',
      dayFri: 'الجمعة', daySat: 'السبت', daySun: 'الأحد',
      ramOrder: 'الطلبية #', ramItems: 'منتجًا',
      ramTomorrow: 'غدًا', ramFriday: 'الجمعة', ramNextThu: 'الخميس القادم', ramTodayLate: 'اليوم 14س',
      addItemTitle: 'منتج جديد',
      addItemName: 'الاسم', addItemCat: 'الفئة', addItemUnit: 'الوحدة',
      addItemSupplier: 'المورد الرئيسي', addItemPar: 'الحد', addItemReorder: 'حد إعادة التموين',
      addItemCost: 'تكلفة الوحدة (درهم)',
      addItemBtn: 'إضافة للكتالوج',
      addItemStock: 'المخزون الحالي',
      addItemToast: (name) => `${name} تمت إضافته للكتالوج`,
      editItemTitle: 'تعديل المنتج',
      editItemBtn: 'حفظ التعديلات',
      editItemToast: (name) => `${name} تم تحديثه`,
      deleteItemTitle: 'حذف هذا المنتج؟',
      deleteItemBody: (name) => `أنت على وشك حذف «${name}» من الكتالوج.`,
      deleteItemBtn: 'حذف المنتج',
      deleteItemToast: (name) => `${name} تم حذفه من الكتالوج`,
      ordNewToast: 'طلب جديد · ابدأ باختيار مورّد',
      ordDetailToast: (id) => `تفاصيل الطلب #${id}`,
      ordDetailDesc: 'الأصناف · الأسعار · التسليم · تتبّع آني.',
      ordEditToast: (id) => `تعديل الطلب #${id}`,
      ordCancelToast: (id) => `تم إلغاء الطلب #${id}`,
      ordPauseToast: (id) => `تم تعليق الطلب المتكرر #${id}`,
      poNewToast: 'طلب جديد · اختر الأصناف',
      mItDelete: 'حذف المنتج',
      addCatOpt: '+ فئة جديدة…',
      addCatTitle: 'فئة جديدة',
      addCatName: 'اسم الفئة',
      addCatBtn: 'إنشاء الفئة',
      addCatToast: (name) => `تم إنشاء الفئة «${name}»`,
      addCatInline: 'تأكيد',
      addCatPillTitle: 'إضافة فئة',
      addSupCta: 'إضافة مورد',
      addSupTitle: 'مورد جديد',
      addSupBtn: 'إضافة المورد',
      addSupToast: (name) => `${name} تمت إضافته لمورديك`,
      editSupTitle: 'تعديل المورد',
      editSupBtn: 'حفظ التعديلات',
      editSupToast: (name) => `${name} تم تحديثه`,
      deleteSupTitle: 'حذف هذا المورد؟',
      deleteSupBody: (name) => `أنت على وشك حذف «${name}». المنتجات الموجودة تحتفظ بمرجعها النصي.`,
      deleteSupBtn: 'حذف المورد',
      deleteSupToast: (name) => `${name} تم حذفه`,
      supName: 'الاسم', supCat: 'الفئة', supPhone: 'الهاتف', supLoc: 'المدينة · الموقع',
      supPay: 'شروط الدفع', supDeliv: 'وتيرة التسليم',
      supRating: 'التقييم (1-5)', supSpend: 'الإنفاق الشهري المقدر (درهم)',
      titleEdit: 'تعديل', titleDelete: 'حذف',
            // Backup suppliers
      mItSuppliersT: 'الموردون',
      mItNoSuppliers: 'لا يوجد مورد مسجل.',
      mItAddBackupSup: 'إضافة مورد احتياطي',
      supRankPrincipal: 'رئيسي',
      supRankBackup: 'احتياطي',
      addBackupSupTitle: 'إضافة مورد احتياطي',
      addBackupSupLabel: 'المورد',
      addBackupSupPrice: 'سعر الشراء للوحدة',
      addBackupSupOptNew: '+ مورد جديد…',
      addBackupSupNewName: 'اسم المورد الجديد',
      addBackupSupHelp: 'سيتوفر هذا المورد أثناء الاستلام والطلبات لهذا المنتج.',
      addBackupSupConfirm: 'حفظ',
      backupSupAddedToast: (name) => `تمت إضافة ${name} كمورد احتياطي`,
      backupSupUpdatedToast: (name, price) => `تم تحديث سعر ${name} (${price} درهم)`,
      venueAll: 'الكل', venueAtlas: 'مقهى أطلس', venueMaison: 'ميزون منصور', venueSpa: 'سبا باهية',
    },
  };

  const lang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const t = (k, ...args) => {
    const L = STR[lang()] || STR.fr;
    const v = L[k] != null ? L[k] : STR.fr[k];
    if (typeof v === 'function') return v(...args);
    return v != null ? v : k;
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * State (resets on page refresh)
   * ═══════════════════════════════════════════════════════════════════════ */
  let stCurrentTab = 'overview';
  let stItemView = 'list';
  let stCatFilter = 'all';
  let stStatusFilter = 'all';
  let stSearch = '';
  let stSortBy = 'name';
  let stSortDir = 'asc';
  let stVenueFilter = 'all';
  let stItemSubView = 'catalog'; // 'catalog' | 'waste' | 'counts'
  let stWasteFilterReason = 'all';
  let stWasteDateRange = '30j';
  let stWasteSearch = '';
  let stCountSubTab = 'list'; // 'list' | 'rollup'
  let stCountStatusFilter = 'all'; // 'all' | 'submitted' | 'applied' | 'rejected'
  let stCountDateFilter = '30j'; // 'aujourdhui' | '7j' | '30j' | 'tout'
  let stCountSearch = '';
  let stCountsCache = [];
  let stCountsLastFetched = 0;
  const stStockOverrides = {};
  const stMarked86 = new Set();
  const stConfirmedOrders = new Set();
  const stSentSuggested = false;
  let stPageActive = false;
  let stDemoClockUnsub = null;

  /* Per-session mutable overlay on top of read-only venue inventory/suppliers.
   * Adds, edits, and deletes live here until reload — matches the rest of the
   * dashboard's "fake data resets on reload" demo contract. */
  let stUserItems       = [];                 // brand-new items created this session
  const stItemOverrides = Object.create(null); // edits to existing items, keyed by id
  const stDeletedItems  = new Set();          // soft-deleted item ids
  let stUserSuppliers   = [];                 // brand-new suppliers created this session
  const stSupOverrides  = Object.create(null); // edits to existing suppliers, keyed by id
  const stDeletedSups   = new Set();          // soft-deleted supplier ids
  let stUserCategories  = [];                 // owner-added categories [{ id, label }]

  /* ── Persistance de la surcouche — VRAI commerçant uniquement ──
   * Le contrat « ça repart à zéro au rechargement » ci-dessus vaut pour la
   * DÉMO : ce sont des retouches sur un inventaire fictif, elles doivent
   * disparaître. Pour un vrai commerçant ce ne sont pas des retouches de démo,
   * c'est SON stock : il saisissait ses articles, ses fournisseurs et ses
   * catégories, voyait la page se remplir, rechargeait — et tout avait disparu,
   * sans le moindre avertissement. Le travail d'une soirée de saisie.
   *
   * Rangé par établissement sous `kiwi:` (purgé au changement de compte, voir
   * TENANT_PREFIXES dans identity.js). La démo n'écrit ni ne lit : son contrat
   * de remise à zéro est intact. */
  /* « (démo · réinitialisé au refresh) » était collé dans les libellés eux-mêmes,
     donc affiché AUSSI au vrai commerçant — à qui on annonçait que sa saisie
     serait perdue, pendant qu'elle l'était effectivement. Maintenant qu'elle est
     conservée, la mise en garde ne vaut plus que pour la démo. */
  const stDemoNote = () => (stShowReal() ? '' : ({
    fr: ' (démo · réinitialisé au refresh)',
    en: ' (demo · resets on refresh)',
    ar: ' (تجريبي · يُعاد عند التحديث)',
  }[lang()] || ' (démo · réinitialisé au refresh)'));

  /* `currentVenueId()` peut valoir la constante 'scoped' — ce n'est pas un
     établissement, c'est « celui que la console opérateur regarde ». Deux
     commerçants ouverts l'un après l'autre depuis la console partageaient donc
     la même clé `kiwi:stockOverlay:scoped`, et le cache stOverlayLoadedFor, qui
     compare ce même identifiant, ne rechargeait même pas entre les deux : le
     stock du premier restait à l'écran sous le nom du second. Dès que
     l'identifiant est transitoire, on range par slug résolu. */
  const stOverlayScope = () => {
    const vid = currentVenueId();
    try {
      /* Real dashboard + paired caisse use the SAME local key as well as the
       * same server document. This gives same-browser tabs immediate storage
       * events; carryForward below adopts the former venue-id/scoped key. */
      const s = stShowReal() && window.KiwiCloudDoc && window.KiwiCloudDoc.slugFor(vid);
      if (s) return s;
    } catch (_) {}
    return vid;
  };
  const stOverlayKey = () => 'kiwi:stockOverlay:' + stOverlayScope();
  let stOverlayLoadedFor = null;

  function migrateStockDocV2(d) {
    if (!d || typeof d !== 'object') return d;
    if ((d.schemaVersion || 1) >= 2 && Array.isArray(d.subcategories)) return d;

    const categories = Array.isArray(d.cats) ? [...d.cats] : (Array.isArray(d.categories) ? [...d.categories] : []);
    const knownCatIds = new Set(categories.map(c => c && c.id));
    const subcategories = [];

    const originals = new Map();
    (Array.isArray(d.items) ? d.items : []).forEach(item => {
      if (!item || !item.id) return;
      originals.set(String(item.id), item);
      const catId = String(item.category || item.cat || 'epicerie');
      if (!knownCatIds.has(catId)) {
        categories.push({ id: catId, label: String(item.category || item.cat || 'Épicerie') });
        knownCatIds.add(catId);
      }
      const supCards = [];
      if (item.supplier) {
        supCards.push({
          id: 'sup-card-' + item.id,
          supplierName: String(item.supplier),
          defaultPrice: Number.isFinite(+item.costPerUnit) ? +item.costPerUnit : (Number.isFinite(+item.cost) ? +item.cost : 0),
          purchaseUnit: String(item.unit || 'unité'),
          factor: 1,
          rank: 1,
        });
      }
      subcategories.push({
        id: String(item.id),
        categoryId: catId,
        name: String(item.name || 'Article'),
        unit: String(item.unit || 'unité'),
        defaultCost: Number.isFinite(+item.costPerUnit) ? +item.costPerUnit : (Number.isFinite(+item.cost) ? +item.cost : 0),
        suppliers: supCards,
        currentStock: Number.isFinite(+item.currentStock) ? +item.currentStock : (Number.isFinite(+item.stock) ? +item.stock : 0),
        parLevel: item.parLevel != null ? +item.parLevel : (item.par != null ? +item.par : null),
        reorderLevel: item.reorderLevel != null ? +item.reorderLevel : (item.reorder != null ? +item.reorder : null),
        usageThisWeek: +item.usageThisWeek || 0,
        theoreticalUsage: +item.theoreticalUsage || 0,
        updatedAt: +item.updatedAt || Date.now(),
      });
    });

    d.schemaVersion = 2;
    d.cats = categories;
    d.categories = categories;
    d.subcategories = subcategories;

    /* Enveloppe de compatibilité. On PART de l'article d'origine et on n'écrase
       que les champs projetés : reconstruire depuis une liste fixe détruit en
       silence tout champ hors liste (lastDelivery, deliveryFrequency, status,
       sku, notes…), et stOverlayRaw() réécrit le document migré dans
       localStorage dès la lecture — la perte est immédiate et irréversible. */
    d.items = subcategories.map(s => Object.assign({}, originals.get(s.id) || {}, {
      id: s.id,
      name: s.name,
      category: s.categoryId,
      unit: s.unit,
      costPerUnit: s.defaultCost,
      supplier: (s.suppliers && s.suppliers[0] && s.suppliers[0].supplierName) || '',
      currentStock: s.currentStock != null ? +s.currentStock : 0,
      parLevel: s.parLevel,
      reorderLevel: s.reorderLevel,
      usageThisWeek: s.usageThisWeek != null ? +s.usageThisWeek : 0,
      theoreticalUsage: s.theoreticalUsage != null ? +s.theoreticalUsage : 0,
      updatedAt: s.updatedAt,
    }));
    return d;
  }

  function stSaveOverlay() {
    if (!stShowReal()) return;
    try {
      const doc = migrateStockDocV2({
        schemaVersion: 2,
        items: stUserItems,
        itemOv: stItemOverrides,
        delItems: [...stDeletedItems],
        sups: stUserSuppliers,
        supOv: stSupOverrides,
        delSups: [...stDeletedSups],
        cats: stUserCategories,
        categories: stUserCategories,
        stockOv: stStockOverrides,
      });
      localStorage.setItem(stOverlayKey(), JSON.stringify(doc));
    } catch (_) { /* quota plein → on ne casse pas la saisie en cours */ }
    try { window.dispatchEvent(new CustomEvent('kiwi-stock-changed', { detail: { venue: stOverlayScope() } })); } catch (_) {}
    const c = stCloud();
    if (c) c.push();
  }

  /* ── LA COPIE SERVEUR DU STOCK ────────────────────────────────────────────
   * La surcouche ci-dessus a sauvé la saisie d'un rechargement, pas d'un
   * changement d'appareil : elle était rangée sous `kiwi:stockOverlay:<venueId>`
   * — un identifiant que venues.js tire de l'horloge, donc propre à CE
   * navigateur. Le gérant saisissait ses articles et ses fournisseurs sur le
   * portable de l'arrière-boutique, ouvrait Kiwi sur la tablette du comptoir, et
   * retrouvait l'inventaire de départ.
   *
   * `read` relit le localStorage plutôt que les variables vivantes : la page
   * peut n'avoir jamais été ouverte pour ce magasin, auquel cas les
   * variables sont vides alors que le disque, lui, est plein. Proposer ce vide
   * comme état courant ferait adopter la copie serveur PAR-DESSUS une saisie
   * locale bien réelle. */
  let stDoc = null;
  let stDocBound = false;

  function stOverlayRaw() {
    try {
      const raw = localStorage.getItem(stOverlayKey());
      const s = JSON.parse(raw || 'null');
      if (s && typeof s === 'object') {
        const hadV2 = (s.schemaVersion || 1) >= 2 && Array.isArray(s.subcategories);
        const migrated = migrateStockDocV2(s);
        if (!hadV2 && stShowReal()) {
          try { localStorage.setItem(stOverlayKey(), JSON.stringify(migrated)); } catch (_) {}
        }
        return migrated;
      }
    } catch (_) {}
    return { schemaVersion: 2, items: [], subcategories: [], sups: [], cats: [], categories: [], itemOv: {}, supOv: {}, stockOv: {}, delItems: [], delSups: [] };
  }

  /* Union par identifiant (le défaut de cloud-doc.js) — SAUF les suppressions.
   * `delItems`/`delSups` sont des listes d'identifiants NUS, et la fusion par
   * défaut, faute d'identité à comparer, garde simplement la nôtre : l'article
   * supprimé sur la tablette réapparaissait donc au premier envoi du portable,
   * en boucle. Deux suppressions s'additionnent, elles ne s'arbitrent pas. */
  function stMergeOverlay(mine, theirs) {
    mine = migrateStockDocV2(mine);
    theirs = migrateStockDocV2(theirs);
    const M = window.KiwiCloudDoc && window.KiwiCloudDoc.mergeDefault;
    if (!M || !theirs) return mine;
    const out = M(mine, theirs);
    out.schemaVersion = 2;
    ['delItems', 'delSups'].forEach((k) => {
      const a = Array.isArray(mine && mine[k]) ? mine[k] : [];
      const b = Array.isArray(theirs && theirs[k]) ? theirs[k] : [];
      out[k] = [...new Set([...a, ...b])];
    });
    /* The caisse edits user-created items through itemOv so it never needs a
       second catalog. Resolve the rare same-item, two-device edit by its row
       timestamp instead of whichever browser happened to pull last. */
    ['itemOv', 'supOv'].forEach((k) => {
      out[k] = { ...((theirs && theirs[k]) || {}) };
      Object.entries((mine && mine[k]) || {}).forEach(([id, row]) => {
        const other = out[k][id];
        if (!other || (+row?.updatedAt || 0) >= (+other?.updatedAt || 0)) out[k][id] = row;
      });
    });
    // Merge subcategories by id and updatedAt
    const subMap = new Map();
    (Array.isArray(theirs && theirs.subcategories) ? theirs.subcategories : []).forEach(s => {
      if (s && s.id) subMap.set(String(s.id), s);
    });
    (Array.isArray(mine && mine.subcategories) ? mine.subcategories : []).forEach(s => {
      if (!s || !s.id) return;
      const other = subMap.get(String(s.id));
      if (!other || (+s.updatedAt || 0) >= (+other.updatedAt || 0)) subMap.set(String(s.id), s);
    });
    out.subcategories = Array.from(subMap.values());
    /* Même règle qu'à la migration : on PART de l'article existant, jamais de
       la sous-catégorie seule — elle n'a jamais porté lastDelivery, status, sku,
       notes… Ce merge tourne à CHAQUE synchronisation cloud ; reconstruire depuis
       la sous-catégorie défaisait le correctif de la migration au premier pull. */
    const prevItems = new Map();
    [theirs, mine].forEach((side) => {
      (Array.isArray(side && side.items) ? side.items : []).forEach((it) => {
        if (it && it.id != null) prevItems.set(String(it.id), Object.assign({}, prevItems.get(String(it.id)) || {}, it));
      });
    });
    out.items = out.subcategories.map(s => {
      const ov = (out.itemOv && out.itemOv[s.id]) || {};
      return Object.assign({}, prevItems.get(String(s.id)) || {}, {
        id: s.id,
        name: ov.name != null ? String(ov.name) : s.name,
        category: ov.category != null ? String(ov.category) : (ov.cat != null ? String(ov.cat) : s.categoryId),
        unit: ov.unit != null ? String(ov.unit) : s.unit,
        costPerUnit: ov.costPerUnit != null ? +ov.costPerUnit : (ov.cost != null ? +ov.cost : s.defaultCost),
        supplier: ov.supplier != null ? String(ov.supplier) : ((s.suppliers && s.suppliers[0] && s.suppliers[0].supplierName) || ''),
        currentStock: s.currentStock != null ? +s.currentStock : 0,
        parLevel: ov.parLevel != null ? +ov.parLevel : (ov.par != null ? +ov.par : s.parLevel),
        reorderLevel: ov.reorderLevel != null ? +ov.reorderLevel : (ov.reorder != null ? +ov.reorder : s.reorderLevel),
        usageThisWeek: s.usageThisWeek != null ? +s.usageThisWeek : 0,
        theoreticalUsage: s.theoreticalUsage != null ? +s.theoreticalUsage : 0,
        updatedAt: Math.max(+s.updatedAt || 0, +ov.updatedAt || 0),
      });
    });
    return out;
  }

  function stCloud() {
    if (stDoc || !window.KiwiCloudDoc) return stDoc;
    stDoc = window.KiwiCloudDoc.attach({
      feature: 'stock',
      slug: () => window.KiwiCloudDoc.slugFor(currentVenueId()),
      read: stOverlayRaw,
      write: (d) => {
        try { localStorage.setItem(stOverlayKey(), JSON.stringify(d)); } catch (_) {}
        // Forcer la relecture : les variables vivantes portent encore l'ancienne
        // surcouche, et c'est elles que dessine render().
        stOverlayLoadedFor = null;
        try { stEnsureOverlay(); } catch (_) {}
        if (stPageActive) { try { render(); } catch (_) {} }
        try { window.dispatchEvent(new CustomEvent('kiwi-stock-changed', { detail: { venue: stOverlayScope() } })); } catch (_) {}
      },
      merge: stMergeOverlay,
      /* Un commerçant qui n'a rien saisi porte quand même les huit champs
       * vides : sans ce test, ouvrir la page suffisait à créer une ligne. */
      isEmpty: (d) => !d || !(
        (d.items && d.items.length) || (d.subcategories && d.subcategories.length)
        || (d.sups && d.sups.length) || (d.cats && d.cats.length)
        || (d.itemOv && Object.keys(d.itemOv).length) || (d.supOv && Object.keys(d.supOv).length)
        || (d.stockOv && Object.keys(d.stockOv).length)
        || (d.delItems && d.delItems.length) || (d.delSups && d.delSups.length)
      ),
    });
    return stDoc;
  }

  /* Recharge la surcouche du commerce courant. Les Set/objet sont `const` :
     on les vide et les re-remplit sur place plutôt que de les réaffecter. */
  function stEnsureOverlay() {
    const venue = stOverlayScope();
    if (stOverlayLoadedFor === venue) return;
    stOverlayLoadedFor = venue;
    stUserItems = []; stUserSuppliers = []; stUserCategories = [];
    stDeletedItems.clear(); stDeletedSups.clear();
    Object.keys(stItemOverrides).forEach((k) => delete stItemOverrides[k]);
    Object.keys(stSupOverrides).forEach((k) => delete stSupOverrides[k]);
    Object.keys(stStockOverrides).forEach((k) => delete stStockOverrides[k]);
    if (!stShowReal()) return;                       // la démo repart de zéro, comme avant
    let s = null;
    try { s = JSON.parse(localStorage.getItem(stOverlayKey()) || 'null'); } catch (_) { return; }
    if (!s || typeof s !== 'object') return;
    s = migrateStockDocV2(s);
    if (Array.isArray(s.items)) stUserItems = s.items.map(normalizeStockItem);
    if (Array.isArray(s.sups)) stUserSuppliers = s.sups;
    if (Array.isArray(s.cats)) stUserCategories = s.cats;
    (s.delItems || []).forEach((id) => stDeletedItems.add(id));
    (s.delSups || []).forEach((id) => stDeletedSups.add(id));
    Object.assign(stItemOverrides, s.itemOv || {});
    Object.keys(stItemOverrides).forEach((id) => {
      if (stItemOverrides[id]?.unit) stItemOverrides[id].unit = stockUnit(stItemOverrides[id].unit);
    });
    Object.assign(stSupOverrides, s.supOv || {});
    Object.assign(stStockOverrides, s.stockOv || {});
  }

  /* Premier contact avec ce magasin dans cette page : on récupère d'abord ce
   * qu'un ANCIEN identifiant de venue aurait laissé orphelin sur ce navigateur,
   * puis on lit la copie serveur. Appelé depuis showPage() — le stock n'a aucun
   * consommateur en arrière-plan, contrairement à l'équipe dont les codes
   * alimentent la caisse, donc il n'y a rien à hydrater tant que personne ne
   * regarde. */
  function stCloudBind() {
    if (!window.KiwiCloudDoc || !stShowReal()) return;
    const vid = currentVenueId();
    const slug = window.KiwiCloudDoc.slugFor(vid);
    if (!slug) return;                                  // démo / pas un vrai magasin
    let migratedLocal = false;
    /* Operator view used `scoped:<slug>` before both surfaces standardized on
       the canonical slug. Adopt that exact legacy key once; cloud-doc's generic
       carryForward cannot infer a slug from the `scoped:` composite. */
    try {
      const currentKey = stOverlayKey();
      const scopedKey = 'kiwi:stockOverlay:scoped:' + slug;
      if (!localStorage.getItem(currentKey) && localStorage.getItem(scopedKey)) {
        localStorage.setItem(currentKey, localStorage.getItem(scopedKey));
        migratedLocal = true;
      }
    } catch (_) {}
    const carried = window.KiwiCloudDoc.carryForward('stockOverlay', stOverlayScope(), slug, (raw) => {
      try {
        const d = JSON.parse(raw || 'null');
        return !!(d && ((d.items && d.items.length) || (d.sups && d.sups.length)));
      } catch (_) { return false; }
    }, 'kiwi:stockOverlay:');
    if (carried || migratedLocal) {
      stOverlayLoadedFor = null;
      stEnsureOverlay();
      if (stPageActive) render();
    }
    const c = stCloud();
    if (!c) return;
    if (!stDocBound) {
      stDocBound = true;
      c.bind();
    } else {
      /* Re-opening the stock page is an explicit refresh boundary: fetch
       * caisse movements/catalog edits even when this SPA never went hidden. */
      c.pull(false);
    }
    try { window.KiwiInventory?.sync?.(); } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Lucide icons inline
   * ═══════════════════════════════════════════════════════════════════════ */
  const IC = {
    layoutDashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    package: '<path d="M16.5 9.4L7.5 4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>',
    truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 4v4h-7"/><circle cx="5.5" cy="19" r="2.5"/><circle cx="18.5" cy="19" r="2.5"/>',
    clipboardList: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    sparkles: '<path d="M12 3l1.9 4.7L18 9.5l-4.1 1.8L12 16l-1.9-4.7L6 9.5l4.1-1.8L12 3z"/><path d="M18 14l1 2.5L21 18l-2.5 1L18 21l-1-2.5L15 18l2.5-1z"/>',
    wallet: '<path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-1"/><path d="M21 12h-5a2 2 0 100 4h5"/>',
    alertTriangle: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    receipt: '<path d="M4 2v20l3-3 3 3 3-3 3 3 3-3 3 3V2l-3 3-3-3-3 3-3-3-3 3-3-3z"/><path d="M8 9h8M8 13h6"/>',
    trendingUp: '<path d="M22 7l-8 8-4-4-8 8"/><path d="M16 7h6v6"/>',
    trendingDown: '<path d="M22 17l-8-8-4 4-8-8"/><path d="M16 17h6v-6"/>',
    minus: '<path d="M5 12h14"/>',
    swap: '<path d="M7 7h11l-3-3M18 7l-3 3M17 17H6l3 3M6 17l3-3"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    moreH: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    phone: '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>',
    messageCircle: '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
    zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    camera: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    star: '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7l3-7z"/>',
    download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  };
  const STOCK_MATERIAL_ICONS = {
    layoutDashboard: 'layout-dashboard', package: 'package', truck: 'truck',
    clipboardList: 'clipboard-list', sparkles: 'sparkles', wallet: 'wallet',
    alertTriangle: 'alert-triangle', alertCircle: 'alert-circle', receipt: 'receipt',
    trendingUp: 'trending-up', trendingDown: 'trending-down', minus: 'minus',
    swap: 'arrow-left-right', eye: 'eye', plus: 'plus', edit: 'pencil',
    moreH: 'more-horizontal', phone: 'phone', messageCircle: 'message-circle',
    search: 'search', x: 'x', checkCircle: 'check-circle-2', zap: 'zap',
    camera: 'camera', calendar: 'calendar', star: 'star',
    download: 'arrow-down-to-line', upload: 'arrow-up-from-line', info: 'info'
  };
  const svg = (k, sz = 14) => `<i data-lucide="${STOCK_MATERIAL_ICONS[k] || 'help'}" style="width:${sz}px;height:${sz}px" aria-hidden="true"></i>`;

  /* ═══════════════════════════════════════════════════════════════════════
   * Formatting helpers
   * ═══════════════════════════════════════════════════════════════════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const localeFor = () => (lang() === 'en' ? 'en-US' : 'fr-FR');
  const fmtNum = (n, dec = 0) => {
    if (n == null || isNaN(n)) return '0';
    return new Intl.NumberFormat(localeFor(), { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  };
  const fmtMad = (n) => `${fmtNum(Math.round(n))} MAD`;
  const fmtUnit = (q, u) => {
    const dec = Number.isInteger(q) ? 0 : (Math.abs(q) < 10 ? 1 : 0);
    return `${fmtNum(q, dec)} ${u}`;
  };
  const unitApi = () => window.KiwiRestaurantUnits;
  const stockUnit = (value) => unitApi()?.normalize?.(value) || 'unité';
  const normalizeStockItem = (item) => ({ ...(item || {}), unit: stockUnit(item?.unit) });
  const stockUnitOptions = (value) => {
    const selected = stockUnit(value);
    return (unitApi()?.list?.() || []).map((unit) => `<option value="${esc(unit.id)}"${unit.id === selected ? ' selected' : ''}>${esc(unit.label)}</option>`).join('');
  };
  const fmtPct = (n, dec = 1) => `${n > 0 ? '+' : ''}${fmtNum(n, dec)} %`;
  const fmtDateShort = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const monthsFr = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
    const monthsEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthsAr = ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر'];
    const months = lang() === 'en' ? monthsEn : lang() === 'ar' ? monthsAr : monthsFr;
    return `${d.getDate()} ${months[d.getMonth()]}`;
  };
  const catLabel = (c) => {
    const built = t(`cat.${c}`);
    if (built && built !== `cat.${c}`) return built;
    const usr = stUserCategories.find(x => x.id === c);
    return usr ? usr.label : c;
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * Data access
   * ═══════════════════════════════════════════════════════════════════════ */
  function isFusion() {
    return (window.KiwiVenue?.isFusion?.() === true) || !!document.body?.classList?.contains('fusion-mode');
  }
  function currentVenueId() {
    return window.KiwiVenue?.getVenue?.() || 'cafeAtlas';
  }
  // The "Kiwi AI" insight cards are hardcoded demo prose naming demo suppliers
  // (Coopérative Taliouine, Marché Central…) and demo dishes. For a REAL session
  // (hosted / signed-in / operator-scoped / custom venue) they must not render.
  function stShowReal() {
    try {
      if (window.KiwiEnv?.isReal?.()) return true;
      if (window.KiwiVenue?.isCustom?.(currentVenueId())) return true;
    } catch (_) {}
    return false;
  }
  function applyItemOverlay(items) {
    const filtered = items.filter(it => !stDeletedItems.has(it.id));
    return filtered.map(it => (stItemOverrides[it.id] ? { ...it, ...stItemOverrides[it.id] } : it));
  }
  function getInv() {
    const V = window.KiwiVenue;
    if (!V?.getInventory) return [...stUserItems].map(normalizeStockItem);
    let base;
    if (isFusion()) {
      if (stVenueFilter && stVenueFilter !== 'all') base = V.getInventory(stVenueFilter);
      else base = [
        ...V.getInventory('cafeAtlas'),
        ...V.getInventory('maisonMansour'),
        ...V.getInventory('spaBahia'),
      ];
    } else {
      base = V.getInventory(currentVenueId());
    }
    return [...applyItemOverlay(base), ...applyItemOverlay(stUserItems)].map(normalizeStockItem);
  }
  function getSup() {
    const base = window.KiwiVenue?.getSuppliers?.() || [];
    const filtered = base
      .filter(s => !stDeletedSups.has(s.id))
      .map(s => (stSupOverrides[s.id] ? { ...s, ...stSupOverrides[s.id] } : s));
    return [...filtered, ...stUserSuppliers.filter(s => !stDeletedSups.has(s.id))];
  }
  function allCategories() {
    // Built-in slugs (mirror cat pill row + select options) + user-added.
    const builtin = [
      { id: 'viandes',      label: t('catViandes') },
      { id: 'poissons',     label: t('catPoissons') },
      { id: 'legumes',      label: t('catLegumes') },
      { id: 'epicerie',     label: t('catEpicerie') },
      { id: 'epices',       label: t('catEpices') },
      { id: 'laitiers',     label: t('catLaitiers') },
      { id: 'boissons',     label: t('catBoissons') },
      { id: 'consommables', label: t('catConsommables') },
    ];
    return [...builtin, ...stUserCategories];
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Computed metrics
   * ═══════════════════════════════════════════════════════════════════════ */
  function ledgerOpeningFor(it) {
    const legacy = stStockOverrides[it.id] != null ? stStockOverrides[it.id] : it.currentStock;
    try {
      const L = window.KiwiInventory;
      if (stShowReal() && L && L.isReal && L.isReal()) {
        L.ensureOpening(it.id, +legacy || 0, { unitCost: +it.costPerUnit || null });
        return L.balance(it.id);
      }
    } catch (_) {}
    return legacy;
  }
  const currentStockFor = (it) => ledgerOpeningFor(it);
  /* Read-only projection for the morning briefing. "Tracked" means both an
   * explicit positive reorder threshold and durable ledger history; an absent
   * snapshot is never interpreted as zero stock. */
  function briefingStockItems() {
    return getInv().map((it) => {
      const threshold = Number(it && it.reorderLevel);
      let history = [], balance = null;
      try {
        if (window.KiwiInventory?.history && window.KiwiInventory?.balance) {
          history = window.KiwiInventory.history(it.id) || [];
          if (history.length) balance = window.KiwiInventory.balance(it.id);
        }
      } catch (_) { history = []; balance = null; }
      return {
        id: String(it.id || ''), name: String(it.name || ''), unit: String(it.unit || ''),
        balance: Number.isFinite(+balance) ? +balance : null,
        threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
        par: Number.isFinite(+it.parLevel) && +it.parLevel > 0 ? +it.parLevel : null,
        supplier: String(it.supplier || ''), tracked: history.length > 0 && Number.isFinite(threshold) && threshold > 0
      };
    });
  }
  window.KiwiStockBriefing = { items: briefingStockItems };

  function moveStock(it, qty, reason, refType, refId, note, unitCost, meta) {
    if (!it || !qty) return null;
    try {
      const L = window.KiwiInventory;
      if (stShowReal() && L && L.isReal && L.isReal()) {
        return L.add({
          itemId: it.id, qty, reason, refType: refType || 'manual', refId: refId || '',
          note: note || '', unitCost: unitCost == null ? (+it.costPerUnit || null) : unitCost,
          meta: meta || null,
        });
      }
    } catch (_) {}
    stStockOverrides[it.id] = currentStockFor(it) + qty;
    return null;
  }

  function countStock(it, counted, refId) {
    const diff = Math.round((counted - currentStockFor(it)) * 1000) / 1000;
    if (diff) moveStock(it, diff, 'count', 'count', refId || ('count-' + Date.now()), 'Ajustement issu du comptage');
    return diff;
  }
  /* A real restaurant's recipe is the source of theoretical ingredient usage.
   * Demo venues keep their historic fixture values; real venues never inherit
   * those figures and only receive a number once sales + recipes exist. */
  let stTheoUsageBusy = false;
  const theoreticalUsageFor = (it) => {
    /* The recipe engine reads this same inventory back to resolve units and
     * costs. Without this guard the two call each other until the tab dies. */
    if (stTheoUsageBusy) return Number(it.theoreticalUsage) || 0;
    try {
      stTheoUsageBusy = true;
      const measured = window.KiwiRestaurantRecipes?.theoreticalUsage?.(it.id, currentVenueId(), 7);
      if (stShowReal()) return Number(measured) || 0;
      if (Number(measured) > 0) return Number(measured);
    } catch (_) {} finally { stTheoUsageBusy = false; }
    return Number(it.theoreticalUsage) || 0;
  };
  const statusOf = (it) => {
    const s = currentStockFor(it);
    if (s <= 0) return 'out';
    // If demo state has overridden the stock (invoice scan / physical count),
    // compute status dynamically against reorder level. Otherwise the spec's
    // pre-marked `status` field is the source of truth (richer than a simple
    // reorderLevel threshold — accounts for run-rate & lead-time).
    if (stStockOverrides[it.id] != null) {
      return s < it.reorderLevel ? 'low' : 'ok';
    }
    return it.status || 'ok';
  };
  const variance = (it) => {
    const theoretical = theoreticalUsageFor(it);
    return theoretical > 0 ? ((it.usageThisWeek - theoretical) / theoretical) * 100 : 0;
  };
  const daysOfStock = (it) => {
    const rate = it.usageThisWeek / 7;
    return rate > 0 ? currentStockFor(it) / rate : 999;
  };
  const totalValue = (items) => items.reduce((s, it) => s + (currentStockFor(it) * it.costPerUnit), 0);
  const foodCostMonth = (items) => items.reduce((s, it) => s + (theoreticalUsageFor(it) * it.costPerUnit * 4.33), 0);
  /* Le dénominateur du ratio « coût matière / chiffre d'affaires ».
   *
   * Ces montants sont ceux des trois établissements de démonstration. Le repli
   * `|| 825000` les servait aussi à un VRAI commerçant : son coût matière, bien
   * réel, était alors divisé par le chiffre d'affaires du Café Atlas. Le ratio
   * qui en sortait n'était ni le sien ni celui de personne, et il portait une
   * pastille verte ou orange qui invitait à agir dessus.
   *
   * Chez un vrai commerçant on lit donc ses ventes des 30 derniers jours, et
   * si on ne les a pas — première semaine, navigateur neuf qui n'a pas fini de
   * rapatrier le flux — on rend null : la ligne du ratio disparaît au lieu de
   * s'inventer un dénominateur. */
  const VENUE_REVENUE = { cafeAtlas: 825000, maisonMansour: 358000, spaBahia: 269000, fusion: 1452000 };
  function monthlyRevenue() {
    if (stShowReal()) {
      try {
        const to = Date.now();
        const t = window.KiwiSales && window.KiwiSales.totals
          && window.KiwiSales.totals(currentVenueId(), to - 30 * 864e5, to);
        const rev = t && +t.revenue;
        return rev > 0 ? rev : null;
      } catch (_) { return null; }
    }
    if (isFusion()) {
      if (stVenueFilter && stVenueFilter !== 'all') return VENUE_REVENUE[stVenueFilter] || 825000;
      return VENUE_REVENUE.fusion;
    }
    return VENUE_REVENUE[currentVenueId()] || null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Page show/hide — mirrors Équipe/Menu pattern
   * ═══════════════════════════════════════════════════════════════════════ */
  function showPage() {
    stPageActive = true;
    // Exactly one page shell at a time — see Kiwi.pageShell.
    if (window.Kiwi && Kiwi.pageShell) Kiwi.pageShell('stock');
    else document.body.classList.add('page-stock');
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = `Accueil <span class="sep">/</span> <b>${esc(t('breadcrumb'))}</b>`;
    /* Pin sidebar selector on Stock via Kiwi.setActivePage — drawers/modals
     * opened from here close back into this highlight, not Accueil. */
    window.Kiwi?.setActivePage?.('stock');
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    document.querySelector('.sidebar nav a[data-nav="stock"]')?.classList.add('active');
    window.scrollTo({ top: 0 });
    render();
    // La copie serveur arrive après coup et repeint par elle-même : on n'attend
    // jamais le réseau pour afficher ce que ce navigateur sait déjà.
    try { stCloudBind(); } catch (_) {}
    // Subscribe to demo clock for live food-cost tick (subtle)
    if (!stDemoClockUnsub && window.KiwiDemoClock?.subscribe) {
      stDemoClockUnsub = window.KiwiDemoClock.subscribe(() => tickFoodCost());
    }
  }
  function showDashboard() {
    if (!document.body.classList.contains('page-stock')) return;
    stPageActive = false;
    document.body.classList.remove('page-stock');
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = 'Accueil <span class="sep">/</span> <b>Tableau de bord</b>';
    if (stDemoClockUnsub) { try { stDemoClockUnsub(); } catch (_) {} stDemoClockUnsub = null; }
    window.Kiwi?.setActivePage?.('accueil');
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Render dispatcher
   * ═══════════════════════════════════════════════════════════════════════ */
  function render() {
    const root = document.querySelector('[data-stock-root]');
    if (!root) return;
    stEnsureOverlay();      // le stock saisi par le commerçant, relu avant d'afficher
    root.removeAttribute('hidden');
    root.innerHTML = `
      ${renderHeader()}
      ${isFusion() ? renderVenueFilter() : ''}
      ${renderTabs()}
      <div class="st-tab-body">${renderTabBody()}</div>
    `;
    enhanceAfterRender();
  }

  function enhanceAfterRender() {
    // Animate progress bars + stock bars from 0 to target on initial paint
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-stock-bar]').forEach(el => {
        const pct = +el.dataset.stockBar || 0;
        el.style.width = `${Math.min(100, pct)}%`;
      });
    });
    // Wire up search input
    const sb = document.querySelector('[data-stock-search-input]');
    if (sb) sb.addEventListener('input', (e) => { stSearch = e.target.value.toLowerCase(); rerenderTabBody(); });
    const wsb = document.querySelector('[data-stock-waste-search]');
    if (wsb) wsb.addEventListener('input', (e) => { stWasteSearch = e.target.value; rerenderTabBody(); });
    const csb = document.querySelector('[data-stock-count-search]');
    if (csb) csb.addEventListener('input', (e) => { stCountSearch = e.target.value; rerenderTabBody(); });
  }

  function rerenderTabBody() {
    const body = document.querySelector('.st-tab-body');
    if (body) body.innerHTML = renderTabBody();
    enhanceAfterRender();
  }

  function renderTabBody() {
    switch (stCurrentTab) {
      case 'overview':  return renderOverview();
      case 'items':     return renderItems();
      case 'suppliers': return renderSuppliers();
      case 'orders':    return renderOrders();
      case 'forecast':  return renderForecast();
      default:          return renderOverview();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Header
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderHeader() {
    const items = getInv();
    const supCount = getSup().length;
    const val = fmtMad(totalValue(items));
    const subText = t('sub', items.length, supCount, val);
    return `
      <div class="st-head">
        <div>
          <div class="st-title">${esc(t('title'))}</div>
          <div class="st-sub">${esc(subText)}</div>
        </div>
        <div class="st-head-acts">
          <button class="st-btn" type="button" data-action="stock-scan-invoice">${svg('camera', 13)}<span>${esc(t('btnScan'))}</span></button>
          <button class="st-btn" type="button" data-action="stock-count-sheet">${svg('download', 13)}<span>${esc(t('btnSheet'))}</span></button>
          <button class="st-btn" type="button" data-action="stock-physical-count">${svg('clipboardList', 13)}<span>${esc(t('btnCount'))}</span></button>
          <button class="st-btn primary" type="button" data-action="stock-add-item">${svg('plus', 13)}<span>${esc(t('btnAdd'))}</span></button>
        </div>
      </div>
    `;
  }

  function renderVenueFilter() {
    const pick = (id, label) => {
      const on = stVenueFilter === id;
      return `<button class="st-venue-pill${on ? ' on' : ''}" type="button" data-action="stock-venue-filter" data-venue="${id}">${esc(label)}</button>`;
    };
    return `
      <div class="st-venue-row">
        ${pick('all', t('venueAll'))}
        ${pick('cafeAtlas', t('venueAtlas'))}
        ${pick('maisonMansour', t('venueMaison'))}
        ${pick('spaBahia', t('venueSpa'))}
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Tabs
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderTabs() {
    const tab = (id, ico, label, extra = '') => {
      const on = stCurrentTab === id;
      return `<button class="st-tab${on ? ' on' : ''}" type="button" data-action="stock-tab" data-tab="${id}">${svg(ico, 14)}<span>${esc(label)}</span>${extra}</button>`;
    };
    const ultraPill = `<span class="st-ultra-pill">${esc(t('ultra'))}</span>`;
    return `
      <div class="st-tabs" role="tablist">
        ${tab('overview',  'layoutDashboard', t('tabOverview'))}
        ${tab('items',     'package',          t('tabItems'))}
        ${tab('suppliers', 'truck',            t('tabSuppliers'))}
        ${tab('orders',    'clipboardList',    t('tabOrders'))}
        ${tab('forecast',  'sparkles',         t('tabForecast'), ultraPill)}
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 1 · Vue d'ensemble
   * ═══════════════════════════════════════════════════════════════════════ */
  function computeTier1LowAlerts(items) {
    if (!window.KiwiInventoryConsumption?.deriveLots) return [];
    const raw = stOverlayRaw();
    const subMap = new Map((raw.subcategories || []).map(s => [s.id, s]));
    const list = [];
    (items || []).forEach(it => {
      if (!it || !it.id) return;
      if (statusOf(it) === 'out' || statusOf(it) === 'low') return;
      const lots = window.KiwiInventoryConsumption.deriveLots(it.id) || [];
      if (!lots.length) return;
      const r1Lots = lots.filter(l => l.rank === 1 && l.remainingQty > 0);
      const r1Qty = Math.round(r1Lots.reduce((sum, l) => sum + l.remainingQty, 0) * 1000) / 1000;
      const sub = subMap.get(it.id);
      const cards = sub && Array.isArray(sub.suppliers) ? sub.suppliers : [];
      const primaryCard = cards.find(c => c.rank === 1);
      const secondaryCard = cards.find(c => c.rank === 2);
      const secondaryLot = lots.find(l => l.rank > 1 && l.remainingQty > 0);
      
      const threshold = (primaryCard && primaryCard.lowBuffer > 0)
        ? primaryCard.lowBuffer
        : Math.max(1, Math.round(((it.usageThisWeek || 0) / 7) * 3 * 10) / 10);
      
      if (r1Qty <= threshold && (secondaryLot || (secondaryCard && secondaryCard.defaultPrice > (primaryCard ? primaryCard.defaultPrice : it.costPerUnit)))) {
        list.push(Object.assign({}, it, {
          alertKind: 'tierLow',
          r1Qty: r1Qty,
          t1Threshold: threshold,
          p1Cost: (primaryCard && primaryCard.defaultPrice != null) ? primaryCard.defaultPrice : it.costPerUnit,
          p2Cost: secondaryLot ? secondaryLot.unitCost : (secondaryCard ? secondaryCard.defaultPrice : null),
          p2SupName: secondaryLot ? (secondaryLot.supplierName || 'Fournisseur secondaire') : (secondaryCard ? secondaryCard.supplierName : 'Fournisseur secondaire'),
        }));
      }
    });
    return list;
  }

  function renderOverview() {
    const items = getInv();
    const out = items.filter(it => statusOf(it) === 'out');
    const low = items.filter(it => statusOf(it) === 'low');
    const tierLow = computeTier1LowAlerts(items);
    const ok  = items.filter(it => statusOf(it) === 'ok');
    const totalVal = totalValue(items);
    const costMonth = foodCostMonth(items);
    const costWeek = costMonth / 4;
    const mRev = monthlyRevenue();
    const ratio = mRev > 0 ? (costMonth / mRev) * 100 : null;
    const ratioClass = ratio == null ? '' : ratio < 30 ? 'ok' : ratio < 35 ? '' : 'warn';

    // Next delivery — pick the supplier with the soonest scheduled day
    const nextDelivery = computeNextDelivery();

    // Mock 4-week trend bars
    const trendBars = [62, 70, 66, 74].map(h => `<i style="height:${h}%;"></i>`).join('');

    // Alerts sorted: out first, then low (by daysOfStock asc), then tierLow
    const alerts = [
      ...out,
      ...low.sort((a, b) => daysOfStock(a) - daysOfStock(b)),
      ...tierLow,
    ].slice(0, 12);
    const totalAlertCount = out.length + low.length + tierLow.length;

    return `
      ${renderKpiCards({ totalVal, items, out, low, tierLow, costWeek, ratio, ratioClass, nextDelivery, trendBars })}

      ${(function() {
        const expiringLots = (window.KiwiInventoryConsumption?.expiring && window.KiwiInventoryConsumption.expiring({ horizonDays: 7 })) || [];
        if (!expiringLots.length) return '';
        return `
          <div class="st-section" style="margin-bottom:20px;">
            <div class="st-section-head">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:24px;height:24px;border-radius:6px;background:rgba(239,68,68,0.12);color:#dc2626;display:grid;place-items:center;">
                  ${svg('alertTriangle', 14)}
                </div>
                <h3 style="color:#b91c1c;">Alertes péremptions (DLC / DDM)</h3>
              </div>
              <span class="st-count-badge warn">${expiringLots.length}</span>
            </div>
            <div class="st-alerts" style="display:grid;gap:8px;">
              ${expiringLots.map(l => {
                const isExp = l.status === 'expired';
                const badgeStyle = isExp ? 'background:#fef2f2;color:#b91c1c;border:1px solid rgba(185,28,28,0.25);' : 'background:#fffbeb;color:#b45309;border:1px solid rgba(180,83,9,0.25);';
                const dateStr = new Date(l.expiresAt).toLocaleDateString('fr-FR');
                const statusLabel = isExp ? `Périmé (${dateStr})` : (l.daysLeft === 0 ? `Périme aujourd'hui` : `Expire dans ${l.daysLeft} j (${dateStr})`);
                return `
                  <div class="st-alert-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--paper-soft);border:1px solid var(--n-200);border-radius:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;${badgeStyle}">${statusLabel}</span>
                      <div>
                        <b style="font-size:13.5px;color:var(--ink);">${esc(l.name)}</b>
                        <div style="font-size:11.5px;color:var(--n-500);">${l.remainingQty} ${esc(l.unit)} restant${l.supplierName ? ` · Fournisseur : ${esc(l.supplierName)}` : ''}${l.totalCostMAD ? ` · Valeur : ${fmtMad(l.totalCostMAD)}` : ''}</div>
                      </div>
                    </div>
                    <button class="st-btn small" type="button" data-action="stock-declare-waste-prefill" data-item-id="${esc(l.itemId)}" data-qty="${l.remainingQty}" data-reason="perime" style="color:#b91c1c;border-color:rgba(185,28,28,0.3);white-space:nowrap;">
                      ${svg('trash2', 12)}<span style="margin-left:4px;">Déclarer en perte</span>
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      })()}

      <div class="st-section">
        <div class="st-section-head">
          <h3>${esc(t('alertsT'))}</h3>
          ${totalAlertCount > 0 ? `<span class="st-count-badge warn">${totalAlertCount}</span>` : ''}
        </div>
        <div class="st-alerts">
          ${alerts.length === 0 ? `<div style="padding:28px 16px; text-align:center; color:var(--n-500); font-size:13px; background:var(--paper-soft); border-radius:12px; border:1px solid var(--n-200); display:flex; align-items:center; justify-content:center; gap:10px;">
            <div style="width:28px; height:28px; border-radius:8px; background:rgba(11,110,79,0.10); color:var(--atlas); display:grid; place-items:center;">
              <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
            </div>
            <span style="font-weight:500; color:var(--ink);">${esc(t('alertsEmpty'))}</span>
          </div>` :
            alerts.map(renderAlertCard).join('')}
        </div>
      </div>

      ${stShowReal() ? '' : `<div class="st-section">
        <div class="st-section-head">
          <h3>Kiwi AI · ${isFusion() ? 'analyses portfolio' : 'analyses cuisine'}</h3>
        </div>
        ${renderAiCard(t('aiVarianceT'), t('aiVarianceB'), t('aiVarianceA'))}
        ${renderAiCard(t('aiPriceT'), t('aiPriceB'), t('aiPriceA'))}
      </div>`}

      <div class="st-section">
        <div class="st-section-head">
          <h3>${esc(t('calT'))}</h3>
        </div>
        ${renderDeliveryStrip()}
      </div>
    `;
  }

  function renderKpiCards({ totalVal, items, out, low, tierLow = [], costWeek, ratio, ratioClass, nextDelivery, trendBars }) {
    const alertCount = out.length + low.length + tierLow.length;
    const alertColor = alertCount > 0 ? 'warn' : 'ok';
    return `
      <div class="st-kpis">
        <div class="st-kpi">
          <div class="st-kpi-l">${esc(t('kpiValueL'))}<span class="st-kpi-ico">${svg('wallet', 14)}</span></div>
          <div class="st-kpi-v">${esc(fmtMad(totalVal))}</div>
          <div class="st-kpi-sub">${esc(t('kpiValueSub', items.length))}</div>
          <div class="st-kpi-trend" aria-hidden="true">${trendBars}</div>
        </div>
        <div class="st-kpi">
          <div class="st-kpi-l">${esc(t('kpiAlertL'))}<span class="st-kpi-ico ${alertColor}">${svg('alertTriangle', 14)}</span></div>
          <div class="st-kpi-v ${alertColor}">${alertCount}</div>
          <div class="st-kpi-sub">${esc(alertCount === 0 ? t('kpiAlertOk') : t('kpiAlertSub', out.length, low.length + tierLow.length))}</div>
        </div>
        <div class="st-kpi">
          <div class="st-kpi-l">${esc(t('kpiCostL'))}<span class="st-kpi-ico">${svg('receipt', 14)}</span></div>
          <div class="st-kpi-v" data-stock-live-foodcost>${esc(fmtMad(costWeek))}</div>
          <div class="st-kpi-sub st-kpi-tip">
            <span class="${ratioClass === 'ok' ? '' : ratioClass === 'warn' ? '' : ''}" style="color: var(--${ratioClass === 'ok' ? 'success' : ratioClass === 'warn' ? 'warning' : 'n-600'}); font-weight: 600;">${ratio == null ? '' : esc(t('kpiCostSub', fmtPct(ratio, 1).replace('+', '')))}</span>
            ${svg('info', 11)}
            <div class="st-tt">${esc(t('kpiCostTip'))}</div>
          </div>
        </div>
        <div class="st-kpi">
          <div class="st-kpi-l">${esc(t('kpiDelivL'))}<span class="st-kpi-ico">${svg('truck', 14)}</span></div>
          <div class="st-kpi-v" style="font-size:22px;">${esc(nextDelivery.when)}</div>
          <div class="st-kpi-sub">${esc(nextDelivery.supplier)} · ${esc(fmtMad(nextDelivery.cost))}</div>
        </div>
      </div>
    `;
  }

  function renderAlertCard(it) {
    if (it.alertKind === 'tierLow') {
      const priceDiff = it.p2Cost != null ? (it.p2Cost - it.p1Cost) : null;
      return `
        <div class="st-alert tier-low">
          <div class="st-alert-ico" style="color:var(--warning);">${svg('alertTriangle', 18)}</div>
          <div class="st-alert-body">
            <div class="st-alert-top">
              <span class="st-alert-name">${esc(it.name)}</span>
              <span class="st-alert-cat">${esc(catLabel(it.category))}</span>
              <span class="st-alert-status low">Fournisseur principal bas · ${esc(fmtUnit(it.r1Qty, it.unit))} restant</span>
            </div>
            <div class="st-alert-meta">
              Lot principal : ${esc(fmtMad(it.p1Cost))}/${esc(it.unit)}${it.p2Cost != null ? ` · Lot suivant : ${esc(it.p2SupName)} (${esc(fmtMad(it.p2Cost))}/${esc(it.unit)}${priceDiff > 0 ? ` +${esc(fmtMad(priceDiff))}` : ''})` : ''}
            </div>
            <div class="st-alert-impact">
              Seuil tampon : <b>${esc(fmtUnit(it.t1Threshold, it.unit))}</b> (calculé sur 3j d'usage) · Transition prochaine vers tarif secondaire.
            </div>
          </div>
          <div class="st-alert-acts">
            <button class="st-btn primary" type="button" data-action="stock-reorder" data-item-id="${esc(it.id)}">Commander chez principal</button>
          </div>
        </div>
      `;
    }
    const st = statusOf(it);
    const isOut = st === 'out';
    const days = isOut ? 0 : Math.max(0, Math.round(daysOfStock(it)));
    const cur = currentStockFor(it);
    const dailyMissed = (it.usageThisWeek / 7) * it.costPerUnit * 3.2;
    const parPct = it.parLevel > 0 ? (cur / it.parLevel) * 100 : 0;

    return `
      <div class="st-alert ${isOut ? 'out' : ''}">
        <div class="st-alert-ico">${svg(isOut ? 'alertCircle' : 'alertTriangle', 18)}</div>
        <div class="st-alert-body">
          <div class="st-alert-top">
            <span class="st-alert-name">${esc(it.name)}</span>
            <span class="st-alert-cat">${esc(catLabel(it.category))}</span>
            <span class="st-alert-status ${isOut ? 'out' : 'low'}">${esc(isOut ? t('statusOut') : `${t('statusLow')} · ${t('daysLeft', days)}`)}</span>
          </div>
          <div class="st-alert-meta">
            ${esc(t('lastDeliv'))} : ${esc(fmtDateShort(it.lastDelivery))}<span class="sep">·</span>
            ${esc(t('supplier'))} : ${esc(it.supplier)}
          </div>
          ${isOut
            ? `<div class="st-alert-impact">${esc(t('impactCost'))} : <b>${esc(fmtMad(dailyMissed))}</b>${esc(t('perDayMissed'))}</div>`
            : `<div class="st-alert-impact">${esc(t('level'))} : <b>${esc(fmtUnit(cur, it.unit))}</b> · ${esc(t('par'))} : <b>${esc(fmtUnit(it.parLevel, it.unit))}</b></div>
               <div class="st-alert-bar-wrap"><div class="st-alert-bar"><div class="st-alert-bar-fill" data-stock-bar="${Math.min(100, parPct)}"></div></div></div>`}
        </div>
        <div class="st-alert-acts">
          ${isOut
            ? `<button class="st-btn primary" type="button" data-action="stock-urgent-order" data-item-id="${esc(it.id)}">${esc(t('btnUrgentOrder'))}</button>
               <button class="st-btn" type="button" data-action="stock-mark-86" data-item-name="${esc(it.name)}">${esc(t('btnMark86'))}</button>`
            : `<button class="st-btn primary" type="button" data-action="stock-reorder" data-item-id="${esc(it.id)}">${esc(t('btnReorder'))}</button>
               <button class="st-btn" type="button" data-action="stock-ignore-24h" data-item-name="${esc(it.name)}">${esc(t('btnIgnore'))}</button>`}
        </div>
      </div>
    `;
  }

  function renderAiCard(title, body, action) {
    return `
      <div class="st-ai">
        <div class="st-ai-eyebrow">KIWI AI</div>
        <div class="st-ai-t">${esc(title)}</div>
        <div class="st-ai-b">${esc(body)}</div>
        <div class="st-ai-a">${esc(action)}</div>
      </div>
    `;
  }

  /* 7-day delivery strip — current date is 2026-05-23 (Saturday), but we
   * generate from "today" relative to system date for realism. Calendar
   * shows static demo deliveries per day-of-week. */
  function renderDeliveryStrip() {
    const today = new Date('2026-05-23T08:00:00'); // brief stub — see currentDate ref
    const items = [];
    const dayNames = [t('daySun'), t('dayMon'), t('dayTue'), t('dayWed'), t('dayThu'), t('dayFri'), t('daySat')];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dow = d.getDay();
      const monthLabel = fmtDateShort(d.toISOString().slice(0, 10));
      const isToday = i === 0;
      const sups = computeDeliveriesForDay(dow);
      items.push(`
        <div class="st-cal-day ${isToday ? 'today' : ''}" data-action="stock-day-detail" data-day="${dow}" data-day-name="${esc(dayNames[dow])}">
          <div class="st-cal-day-d">${esc(isToday ? t('today') : dayNames[dow])}</div>
          <div class="st-cal-day-date">${esc(monthLabel)}</div>
          ${sups.length === 0
            ? `<div class="st-cal-day-empty">${esc(t('calEmpty'))}</div>`
            : sups.map(s => `<div class="st-cal-day-item"><b>${esc(s.name)}</b><span class="h">${esc(s.time)} · ${esc(fmtMad(s.cost))}</span></div>`).join('')}
        </div>
      `);
    }
    return `<div class="st-cal-strip">${items.join('')}</div>`;
  }

  /* Day-of-week → suppliers delivering. Demo data — Sun=0..Sat=6 */
  function computeDeliveriesForDay(dow) {
    // Real / custom store → no demo supplier deliveries (this is the single
    // source for both the delivery strip and the "next delivery" KPI).
    if (stShowReal()) return [];
    const wkdayMap = {
      0: [], // Sun — most closed
      1: [{ name: 'Centrale Danone', time: '07h', cost: 1240 }, { name: 'Avicole Atlas', time: '08h', cost: 480 }, { name: 'Marché Inezgane', time: '06h', cost: 1840 }], // Mon
      2: [{ name: 'Boucherie Errazi', time: '09h', cost: 3840 }, { name: 'Marché Central · Port', time: '06h', cost: 820 }, { name: 'Fruits Premium', time: '11h', cost: 1240 }], // Tue
      3: [{ name: 'Marché Inezgane', time: '06h', cost: 1840 }, { name: 'Bakery El Ouafy', time: '07h', cost: 320 }], // Wed
      4: [{ name: 'Métro Casablanca', time: '14h', cost: 4620 }, { name: 'Centrale Danone', time: '07h', cost: 1240 }, { name: 'Avicole Atlas', time: '08h', cost: 480 }, { name: 'Minoterie Lazaar', time: '10h', cost: 480 }], // Thu
      5: [{ name: 'Boucherie Errazi', time: '09h', cost: 3840 }, { name: 'Fruits Premium', time: '11h', cost: 1240 }, { name: 'Marché Inezgane', time: '06h', cost: 1840 }, { name: 'NABC', time: '13h', cost: 2160 }, { name: 'Bakery El Ouafy', time: '07h', cost: 320 }], // Fri
      6: [{ name: 'Marché Central · Port', time: '06h', cost: 820 }, { name: 'Sidi Ali · Distributeur', time: '11h', cost: 1080 }], // Sat
    };
    return wkdayMap[dow] || [];
  }

  function computeNextDelivery() {
    const today = new Date('2026-05-23T08:00:00');
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const sups = computeDeliveriesForDay(d.getDay());
      if (sups.length > 0) {
        const dayNames = [t('daySun'), t('dayMon'), t('dayTue'), t('dayWed'), t('dayThu'), t('dayFri'), t('daySat')];
        return {
          when: i === 1 ? `${t('ramTomorrow')} · ${sups[0].time}` : `${dayNames[d.getDay()]} · ${sups[0].time}`,
          supplier: sups[0].name,
          cost: sups[0].cost,
        };
      }
    }
    return { when: '—', supplier: '—', cost: 0 };
  }

  function tickFoodCost() {
    if (!stPageActive || stCurrentTab !== 'overview') return;
    const el = document.querySelector('[data-stock-live-foodcost]');
    if (!el) return;
    const base = foodCostMonth(getInv()) / 4;
    // Very subtle ±0.5% jitter to convey life
    const jitter = (Math.sin(Date.now() / 23000) * 0.005);
    el.textContent = fmtMad(base * (1 + jitter));
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 2 · Articles & stock (Catalogue, Journal des pertes, Historique)
   * ═══════════════════════════════════════════════════════════════════════ */
  function getWasteMovements() {
    const I = window.KiwiInventory;
    if (!I || !I.history) return [];
    const all = I.history() || [];
    let wasteRows = all.filter(r => r && (r.refType === 'waste' || ['loss', 'expiry', 'gift', 'staff-meal'].includes(r.reason)));
    
    // Apply date range filter
    const now = Date.now();
    const dayStart = (window.KiwiDayReport && window.KiwiDayReport.dayBounds)
      ? window.KiwiDayReport.dayBounds(window.KiwiDayReport.businessDay(now)).from
      : new Date().setHours(5, 0, 0, 0);
    
    if (stWasteDateRange === 'aujourdhui') {
      wasteRows = wasteRows.filter(r => (+r.occurredTs || 0) >= dayStart);
    } else if (stWasteDateRange === '7j') {
      wasteRows = wasteRows.filter(r => (+r.occurredTs || 0) >= now - 7 * 864e5);
    } else if (stWasteDateRange === '30j') {
      wasteRows = wasteRows.filter(r => (+r.occurredTs || 0) >= now - 30 * 864e5);
    }
    
    // Reason filter
    if (stWasteFilterReason !== 'all') {
      wasteRows = wasteRows.filter(r => {
        const fine = r.meta && r.meta.wasteReason;
        if (fine === stWasteFilterReason) return true;
        if (stWasteFilterReason === 'expiry' && r.reason === 'expiry') return true;
        if (stWasteFilterReason === 'gift' && r.reason === 'gift') return true;
        if (stWasteFilterReason === 'staff-meal' && r.reason === 'staff-meal') return true;
        if (stWasteFilterReason === 'loss' && r.reason === 'loss') return true;
        return false;
      });
    }

    // Search filter
    if (stWasteSearch) {
      const q = stWasteSearch.toLowerCase();
      wasteRows = wasteRows.filter(r => {
        const it = getInv().find(x => x.id === r.itemId);
        const name = (it ? it.name : r.itemId).toLowerCase();
        const actor = String(r.actor || '').toLowerCase();
        const note = String(r.note || '').toLowerCase();
        return name.includes(q) || actor.includes(q) || note.includes(q);
      });
    }

    return wasteRows;
  }

  function renderWasteJournal() {
    const rows = getWasteMovements();
    const inv = getInv();
    const totalQty = rows.reduce((acc, r) => acc + Math.abs(+r.qty || 0), 0);
    const totalVal = rows.reduce((acc, r) => {
      const it = inv.find(x => x.id === r.itemId);
      const cost = r.unitCost != null ? r.unitCost : (it ? it.costPerUnit : 0);
      return acc + Math.abs(+r.qty || 0) * cost;
    }, 0);

    const rangePill = (id, label) => `<button class="st-cat-pill${stWasteDateRange === id ? ' on' : ''}" type="button" data-action="stock-waste-range" data-range="${id}">${esc(label)}</button>`;
    const reasonPill = (id, label) => `<button class="st-cat-pill${stWasteFilterReason === id ? ' on' : ''}" type="button" data-action="stock-waste-reason" data-reason="${id}">${esc(label)}</button>`;

    const reasonLabelMap = {
      'perime': 'Périmé',
      'casse': 'Casse',
      'avarie': 'Avarié / Abîmé',
      'offert': 'Offert',
      'repas-equipe': 'Repas équipe',
      'autre': 'Autre perte',
      'expiry': 'Périmé',
      'gift': 'Offert',
      'staff-meal': 'Repas équipe',
      'loss': 'Perte'
    };

    return `
      <div class="st-section">
        <div class="st-toolbar" style="margin-bottom:16px;">
          <div class="st-search-row">
            <div class="st-search-wrap">
              ${svg('search', 16)}
              <input class="st-search" type="text" placeholder="Chercher un article, employé, note…" value="${esc(stWasteSearch)}" data-stock-waste-search aria-label="Recherche journal des pertes" />
            </div>
            <button class="st-btn primary" type="button" data-action="stock-open-declare-waste" style="background:#b91c1c;border-color:#991b1b;color:#fff;display:flex;align-items:center;gap:6px;">
              ${svg('trash2', 14)}<span>Déclarer une perte</span>
            </button>
            <button class="st-btn secondary" type="button" data-action="stock-export-waste-csv" style="display:flex;align-items:center;gap:6px;">
              ${svg('download', 14)}<span>Exporter CSV</span>
            </button>
          </div>
          <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
            ${rangePill('aujourdhui', "Aujourd'hui")}
            ${rangePill('7j', '7 derniers jours')}
            ${rangePill('30j', '30 derniers jours')}
            ${rangePill('tout', 'Tout l’historique')}
          </div>
          <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
            ${reasonPill('all', 'Tous motifs')}
            ${reasonPill('perime', 'Périmé')}
            ${reasonPill('casse', 'Casse')}
            ${reasonPill('avarie', 'Avarié')}
            ${reasonPill('offert', 'Offert')}
            ${reasonPill('repas-equipe', 'Repas équipe')}
          </div>
        </div>

        <div class="st-kpis" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:16px;">
          <div class="st-kpi"><div class="st-kpi-l">TOTAL VALEUR PERDUE</div><div class="st-kpi-v" style="color:#b91c1c;">${fmtMad(totalVal)}</div><div class="st-kpi-sub">${rows.length} déclarations de pertes</div></div>
          <div class="st-kpi"><div class="st-kpi-l">VOLUME D'ARTICLES PERDUS</div><div class="st-kpi-v">${Math.round(totalQty * 10) / 10}</div><div class="st-kpi-sub">unités / kg sorties</div></div>
        </div>

        <div class="st-tbl-wrap">
          <table class="st-tbl">
            <thead>
              <tr>
                <th>Date &amp; Heure</th>
                <th>Article</th>
                <th>Quantité</th>
                <th>Unité</th>
                <th>Motif</th>
                <th>Valeur MAD</th>
                <th>Employé</th>
                <th>Note</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(r => {
                const it = inv.find(x => x.id === r.itemId) || { name: r.itemId, unit: 'unité', costPerUnit: r.unitCost || 0 };
                const cost = r.unitCost != null ? r.unitCost : (it.costPerUnit || 0);
                const valMAD = Math.abs(+r.qty || 0) * cost;
                const d = new Date(r.occurredTs);
                const dateStr = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const fine = (r.meta && r.meta.wasteReason) || r.reason;
                const reasonLabel = reasonLabelMap[fine] || fine || 'Perte';
                const isReversal = !!r.reversalOf;
                return `
                  <tr style="${isReversal ? 'opacity:0.6;font-style:italic;' : ''}">
                    <td class="st-mono" style="font-size:12px;color:var(--n-600);white-space:nowrap;">${dateStr}</td>
                    <td><b>${esc(it.name)}</b>${r.meta?.lotId ? `<div style="font-size:11px;color:var(--n-500);">Lot: ${esc(r.meta.lotId)}</div>` : ''}</td>
                    <td class="st-mono" style="color:${+r.qty < 0 ? '#b91c1c' : 'var(--atlas)'};font-weight:600;">${+r.qty < 0 ? '−' : '+'}${Math.abs(+r.qty || 0)}</td>
                    <td>${esc(it.unit)}</td>
                    <td><span class="st-badge warn" style="font-size:11px;">${esc(reasonLabel)}</span></td>
                    <td class="st-mono">${fmtMad(valMAD)}</td>
                    <td style="font-size:12.5px;">${esc(r.actor || (r.meta && r.meta.actor) || '—')}</td>
                    <td style="font-size:12px;color:var(--n-600);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.note || '')}">${esc(r.note || '—')}</td>
                    <td style="text-align:right;">
                      ${stShowReal() && !isReversal ? `
                        <button class="st-btn small" type="button" data-action="stock-cancel-waste" data-movement-id="${esc(r.id)}" title="Annuler cette perte" style="color:#b91c1c;border-color:rgba(185,28,28,0.25);">
                          Annuler
                        </button>
                      ` : '—'}
                    </td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--n-500);">Aucune perte enregistrée sur cette période.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="st-tbl-foot">
          Total : ${rows.length} lignes de pertes · Valeur cumulée : <b>${fmtMad(totalVal)}</b>
        </div>
      </div>
    `;
  }

  function exportWasteCsv() {
    const rows = getWasteMovements();
    const inv = getInv();
    const reasonLabelMap = {
      'perime': 'Périmé', 'casse': 'Casse', 'avarie': 'Avarié / Abîmé',
      'offert': 'Offert', 'repas-equipe': 'Repas équipe', 'autre': 'Autre perte',
      'expiry': 'Périmé', 'gift': 'Offert', 'staff-meal': 'Repas équipe', 'loss': 'Perte'
    };
    function csvSafe(v) {
      let s = String(v == null ? '' : v);
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    const header = ['Date', 'Article', 'Quantite', 'Unite', 'Motif', 'Valeur_MAD', 'Employe', 'Note', 'ID_Mouvement'];
    const lines = [header.join(';')];
    rows.forEach(r => {
      const it = inv.find(x => x.id === r.itemId) || { name: r.itemId, unit: 'unité', costPerUnit: r.unitCost || 0 };
      const cost = r.unitCost != null ? r.unitCost : (it.costPerUnit || 0);
      const valMAD = Math.abs(+r.qty || 0) * cost;
      const d = new Date(r.occurredTs).toISOString().slice(0, 19).replace('T', ' ');
      const fine = (r.meta && r.meta.wasteReason) || r.reason;
      const reasonLabel = reasonLabelMap[fine] || fine || 'Perte';
      lines.push([
        d,
        csvSafe(it.name),
        Math.abs(+r.qty || 0),
        csvSafe(it.unit),
        csvSafe(reasonLabel),
        valMAD.toFixed(2),
        csvSafe(r.actor || ''),
        csvSafe(r.note || ''),
        r.id
      ].join(';'));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-pertes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function cancelWasteMovement(movementId) {
    if (!movementId || !window.KiwiInventory) return;
    const history = window.KiwiInventory.history() || [];
    const m = history.find(r => r.id === movementId);
    if (!m) { window.Kiwi?.toast?.('Mouvement introuvable', { type: 'warn' }); return; }
    if (!confirm(`Annuler la perte de ${Math.abs(m.qty)} pour cet article ? Un contre-mouvement sera écrit dans le registre.`)) {
      return;
    }
    const rev = window.KiwiInventory.reverse(m, 'manual', `Annulation perte ${m.refId || m.id}`);
    if (rev) {
      window.KiwiInventory.sync();
      window.Kiwi?.toast?.('Perte annulée · contre-mouvement enregistré', { type: 'success' });
      if (stPageActive) render();
    }
  }

  function openDeclareWasteModal(prefill) {
    prefill = prefill || {};
    const items = getInv();
    const prefillId = prefill.itemId || (items[0] && items[0].id) || '';
    const prefillQty = prefill.qty != null ? prefill.qty : 1;
    const prefillReason = prefill.reason || 'perime';

    const itemOptions = items.map(it => `
      <option value="${esc(it.id)}"${it.id === prefillId ? ' selected' : ''}>
        ${esc(it.name)} (${it.currentStock} ${esc(it.unit || 'unité')})
      </option>
    `).join('');

    const html = `
      <div class="st-modal-head">
        <div>
          <h3>Déclarer une perte de stock</h3>
          <p style="margin:2px 0 0;font-size:12.5px;color:var(--n-500);">Déduction immédiate du registre et traçabilité dans le journal des pertes.</p>
        </div>
        <button class="st-modal-x" type="button" data-action="stock-modal-close">${svg('x', 18)}</button>
      </div>
      <form class="st-form" id="st-waste-declare-form" style="padding:16px 20px;">
        <div class="st-field" style="margin-bottom:12px;">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--ink);">Article concerné</label>
          <select class="st-select" id="st-wf-item" required style="width:100%;">
            ${itemOptions}
          </select>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px;">
          <div class="st-field" style="flex:1;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--ink);">Quantité perdue</label>
            <input class="st-input" id="st-wf-qty" type="number" step="any" min="0.001" value="${prefillQty}" required style="width:100%;" />
          </div>
          <div class="st-field" style="flex:1.5;">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--ink);">Motif de la perte</label>
            <select class="st-select" id="st-wf-reason" style="width:100%;">
              <option value="perime"${prefillReason === 'perime' || prefillReason === 'Péremption' || prefillReason === 'expiry' ? ' selected' : ''}>Péremption / DLC dépassée</option>
              <option value="casse"${prefillReason === 'casse' ? ' selected' : ''}>Casse / Détérioration</option>
              <option value="avarie"${prefillReason === 'avarie' ? ' selected' : ''}>Avarie / Défaut</option>
              <option value="offert"${prefillReason === 'offert' ? ' selected' : ''}>Geste commercial / Offert</option>
              <option value="repas-equipe"${prefillReason === 'repas-equipe' ? ' selected' : ''}>Repas employé / équipe</option>
              <option value="autre"${prefillReason === 'autre' ? ' selected' : ''}>Autre motif</option>
            </select>
          </div>
        </div>
        <div class="st-field" style="margin-bottom:16px;">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--ink);">Justification / Note (optionnelle)</label>
          <input class="st-input" id="st-wf-note" type="text" placeholder="Ex: DLC au 21/08, bocal brisé à la mise en rayon…" style="width:100%;" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="st-btn secondary" type="button" data-action="stock-modal-close">Annuler</button>
          <button class="st-btn primary" type="submit" style="background:#b91c1c;border-color:#991b1b;color:#fff;">
            ${svg('trash2', 14)}<span style="margin-left:4px;">Enregistrer la perte</span>
          </button>
        </div>
      </form>
    `;

    openModal(html);

    const form = document.getElementById('st-waste-declare-form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const itemId = document.getElementById('st-wf-item')?.value;
        const qty = parseFloat(document.getElementById('st-wf-qty')?.value) || 0;
        const reason = document.getElementById('st-wf-reason')?.value || 'perime';
        const note = (document.getElementById('st-wf-note')?.value || '').trim();
        if (!itemId || !(qty > 0)) {
          window.Kiwi?.toast?.('Précisez une quantité valide', { type: 'warn' });
          return;
        }
        if (window.KiwiInventory) {
          const it = items.find(x => x.id === itemId);
          const unitCost = it ? (it.costPerUnit || it.cost || null) : null;
          window.KiwiInventory.add({
            itemId,
            qty: -qty,
            reason: 'waste',
            refType: 'waste',
            refId: 'waste-' + Date.now().toString(36),
            unitCost,
            note: note || `Déclaration perte · ${reason}`,
            meta: {
              wasteReason: reason,
              actor: 'Propriétaire',
              actorId: 'owner'
            }
          });
          window.KiwiInventory.sync();
          window.Kiwi?.toast?.('Perte enregistrée et déduite du stock', { type: 'success' });
          closeModal();
          if (stPageActive) render();
        }
      };
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * HISTORIQUE DES INVENTAIRES PHYSIQUES & REVUE PROPRIÉTAIRE
   * ═══════════════════════════════════════════════════════════════════════ */
  async function fetchServerCounts() {
    try {
      const resp = await fetch('/api/inventory/counts');
      const data = await resp.json();
      if (data && Array.isArray(data.counts)) {
        stCountsCache = data.counts;
        stCountsLastFetched = Date.now();
      }
    } catch (_) {}
  }

  function getAllCounts() {
    const serverCounts = Array.isArray(stCountsCache) ? stCountsCache : [];
    const localHist = stCountHistory() || [];
    
    const localMapped = localHist.map((h, i) => {
      const gaps = Array.isArray(h.gaps) ? h.gaps : [];
      return {
        id: h.ref || `local_cnt_${h.ts || i}`,
        engine: 'ledger',
        status: 'applied',
        storeId: '',
        storeName: 'Magasin principal',
        employeeId: '',
        employeeName: 'Propriétaire',
        employeeRole: 'Admin',
        submittedAt: h.ts || Date.now(),
        reviewedAt: h.ts || Date.now(),
        reviewerName: 'Propriétaire',
        reviewDecision: 'approved',
        appliedAt: h.ts || Date.now(),
        totalLines: h.counted || gaps.length,
        totalDiff: gaps.reduce((acc, g) => acc + (g.diff || 0), 0),
        totalVarianceCostMAD: h.varMad || gaps.reduce((acc, g) => acc + (g.mad || 0), 0),
        absVarianceCostMAD: Math.abs(h.varMad || gaps.reduce((acc, g) => acc + Math.abs(g.mad || 0), 0)),
        lines: gaps.map(g => ({
          key: g.id,
          itemId: g.id,
          productName: g.name,
          color: '',
          size: '',
          sku: g.id,
          unit: g.unit || 'unité',
          unitCost: 0,
          systemQty: g.theo || 0,
          countedQty: g.counted || 0,
          diff: g.diff || 0,
          varianceCost: g.mad || 0,
          explanation: g.reason || '',
          note: ''
        }))
      };
    });

    const byId = new Map();
    serverCounts.forEach(c => byId.set(c.id, c));
    localMapped.forEach(c => { if (!byId.has(c.id)) byId.set(c.id, c); });
    
    return Array.from(byId.values()).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  }

  function filterCounts(counts) {
    const now = Date.now();
    let rows = counts.slice();

    if (stCountDateFilter === 'aujourdhui') {
      const dayStart = (window.KiwiDayReport && window.KiwiDayReport.dayBounds)
        ? window.KiwiDayReport.dayBounds(window.KiwiDayReport.businessDay(now)).from
        : new Date().setHours(5, 0, 0, 0);
      rows = rows.filter(r => (r.submittedAt || 0) >= dayStart);
    } else if (stCountDateFilter === '7j') {
      rows = rows.filter(r => (r.submittedAt || 0) >= now - 7 * 864e5);
    } else if (stCountDateFilter === '30j') {
      rows = rows.filter(r => (r.submittedAt || 0) >= now - 30 * 864e5);
    }

    if (stCountStatusFilter !== 'all') {
      rows = rows.filter(r => r.status === stCountStatusFilter);
    }

    if (stCountSearch) {
      const q = stCountSearch.toLowerCase();
      rows = rows.filter(r => {
        const emp = (r.employeeName || '').toLowerCase();
        const stn = (r.storeName || '').toLowerCase();
        const cid = (r.id || '').toLowerCase();
        return emp.includes(q) || stn.includes(q) || cid.includes(q);
      });
    }

    return rows;
  }

  function renderCountsHistory() {
    if (Date.now() - stCountsLastFetched > 30000) {
      fetchServerCounts().then(() => {
        if (stPageActive && stItemSubView === 'counts') rerenderTabBody();
      });
    }

    const allCounts = getAllCounts();
    const filtered = filterCounts(allCounts);

    const rangePill = (id, label) => `<button class="st-cat-pill${stCountDateFilter === id ? ' on' : ''}" type="button" data-action="stock-count-range" data-range="${id}">${esc(label)}</button>`;
    const statusPill = (id, label) => `<button class="st-cat-pill${stCountStatusFilter === id ? ' on' : ''}" type="button" data-action="stock-count-status" data-status="${id}">${esc(label)}</button>`;
    const tabBtn = (id, label) => `<button class="st-cat-pill${stCountSubTab === id ? ' on' : ''}" type="button" data-action="stock-count-tab" data-tab="${id}" style="font-weight:600;">${esc(label)}</button>`;

    const totalEcartsMad = filtered.reduce((acc, c) => acc + (c.totalVarianceCostMAD || 0), 0);
    const totalAbsEcartsMad = filtered.reduce((acc, c) => acc + (c.absVarianceCostMAD || 0), 0);
    const pendingCount = allCounts.filter(c => c.status === 'submitted').length;

    return `
      <div class="st-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
          <div style="display:flex;gap:6px;">
            ${tabBtn('list', 'Liste des inventaires')}
            ${tabBtn('rollup', 'Écarts récurrents (Analyse)')}
          </div>
          <div style="display:flex;gap:8px;">
            <button class="st-btn secondary" type="button" data-action="stock-export-counts-csv" style="display:flex;align-items:center;gap:6px;">
              ${svg('download', 14)}<span>Exporter CSV</span>
            </button>
            <button class="st-btn primary" type="button" data-action="stock-physical-count">
              ${svg('plus', 14)}<span>Nouvel inventaire</span>
            </button>
          </div>
        </div>

        <div class="st-toolbar" style="margin-bottom:16px;">
          <div class="st-search-row">
            <div class="st-search-wrap">
              ${svg('search', 16)}
              <input class="st-search" type="text" placeholder="Chercher un inventaire, employé, magasin…" value="${esc(stCountSearch)}" data-stock-count-search aria-label="Recherche inventaires" />
            </div>
          </div>
          <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
            ${rangePill('aujourdhui', "Aujourd'hui")}
            ${rangePill('7j', '7 derniers jours')}
            ${rangePill('30j', '30 derniers jours')}
            ${rangePill('tout', 'Tout l’historique')}
          </div>
          <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
            ${statusPill('all', 'Tous statuts')}
            ${statusPill('submitted', `À valider (${pendingCount})`)}
            ${statusPill('applied', 'Validés')}
            ${statusPill('rejected', 'Refusés')}
          </div>
        </div>

        <div class="st-kpis" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:16px;">
          <div class="st-kpi"><div class="st-kpi-l">INVENTAIRES RÉALISÉS</div><div class="st-kpi-v">${filtered.length}</div><div class="st-kpi-sub">${pendingCount} en attente de revue</div></div>
          <div class="st-kpi"><div class="st-kpi-l">ÉCART NET EN VALEUR</div><div class="st-kpi-v" style="color:${totalEcartsMad < 0 ? '#b91c1c' : 'var(--atlas)'};">${totalEcartsMad > 0 ? '+' : ''}${fmtMad(totalEcartsMad)}</div><div class="st-kpi-sub">Écart absolu : ${fmtMad(totalAbsEcartsMad)}</div></div>
        </div>

        ${stCountSubTab === 'rollup' ? renderCountsRollup(filtered) : `
          <div class="st-tbl-wrap">
            <table class="st-tbl">
              <thead>
                <tr>
                  <th>Date &amp; Heure</th>
                  <th>Réf.</th>
                  <th>Magasin</th>
                  <th>Employé</th>
                  <th style="text-align:center;">Articles</th>
                  <th style="text-align:right;">Écart net MAD</th>
                  <th style="text-align:center;">Statut</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length ? filtered.map(c => {
                  const d = new Date(c.submittedAt || Date.now());
                  const dateStr = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  const stLabel = c.status === 'submitted' ? 'À valider' : (c.status === 'applied' || c.status === 'approved' ? 'Validé' : 'Refusé');
                  const stClass = c.status === 'submitted' ? 'warn' : (c.status === 'applied' || c.status === 'approved' ? 'ok' : 'bad');
                  const mad = c.totalVarianceCostMAD || 0;
                  return `
                    <tr>
                      <td class="st-mono" style="font-size:12px;color:var(--n-600);white-space:nowrap;">${dateStr}</td>
                      <td><b>${esc(c.id)}</b></td>
                      <td>${esc(c.storeName || 'Magasin principal')}</td>
                      <td>${esc(c.employeeName || '—')} <span style="font-size:11px;color:var(--n-500);">(${esc(c.employeeRole || '—')})</span></td>
                      <td style="text-align:center;" class="st-mono">${c.totalLines || 0}</td>
                      <td style="text-align:right;font-weight:600;color:${mad < 0 ? '#b91c1c' : mad > 0 ? 'var(--atlas)' : 'inherit'};" class="st-mono">
                        ${mad > 0 ? '+' : ''}${fmtMad(mad)}
                      </td>
                      <td style="text-align:center;">
                        <span class="st-badge ${stClass}" style="font-size:11px;">${esc(stLabel)}</span>
                      </td>
                      <td style="text-align:right;">
                        <button class="st-btn small" type="button" data-action="stock-count-detail" data-count-id="${esc(c.id)}" style="${c.status === 'submitted' ? 'background:#059669;color:#fff;border-color:#047857;' : ''}">
                          ${c.status === 'submitted' ? 'Examiner' : 'Détails'}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('') : `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--n-500);">Aucun inventaire correspondant aux filtres.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="st-tbl-foot">
            ${filtered.length} inventaire${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''}
          </div>
        `}
      </div>
    `;
  }

  function renderCountsRollup(counts) {
    const variantMap = new Map();
    const employeeMap = new Map();
    const storeMap = new Map();

    counts.forEach(c => {
      const lines = Array.isArray(c.lines) ? c.lines : [];
      lines.forEach(l => {
        const vKey = l.variantId || l.itemId || l.key;
        const vLabel = l.productName ? `${l.productName}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''}` : (l.name || vKey);
        const curV = variantMap.get(vKey) || { key: vKey, label: vLabel, sku: l.sku || '', countTimes: 0, absDiffSum: 0, absCostSum: 0, netDiffSum: 0, unit: l.unit || 'unité' };
        curV.countTimes++;
        curV.absDiffSum += Math.abs(Number(l.diff) || 0);
        curV.absCostSum += Math.abs(Number(l.varianceCost) || 0);
        curV.netDiffSum += Number(l.diff) || 0;
        variantMap.set(vKey, curV);
      });

      const empKey = c.employeeId || c.employeeName || 'Inconnu';
      const curE = employeeMap.get(empKey) || { id: empKey, name: c.employeeName || empKey, countTimes: 0, absCostSum: 0, netCostSum: 0 };
      curE.countTimes++;
      curE.absCostSum += Number(c.absVarianceCostMAD) || Math.abs(Number(c.totalVarianceCostMAD) || 0);
      curE.netCostSum += Number(c.totalVarianceCostMAD) || 0;
      employeeMap.set(empKey, curE);

      const stKey = c.storeId || c.storeName || 'Principal';
      const curS = storeMap.get(stKey) || { id: stKey, name: c.storeName || stKey, countTimes: 0, absCostSum: 0, netCostSum: 0 };
      curS.countTimes++;
      curS.absCostSum += Number(c.absVarianceCostMAD) || Math.abs(Number(c.totalVarianceCostMAD) || 0);
      curS.netCostSum += Number(c.totalVarianceCostMAD) || 0;
      storeMap.set(stKey, curS);
    });

    const topVariants = Array.from(variantMap.values()).sort((a, b) => b.absCostSum - a.absCostSum).slice(0, 15);
    const topEmployees = Array.from(employeeMap.values()).sort((a, b) => b.absCostSum - a.absCostSum).slice(0, 8);
    const stores = Array.from(storeMap.values());

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;">
        <div style="background:var(--paper);border:1px solid var(--n-200);border-radius:14px;padding:16px;">
          <h4 style="margin:0 0 12px;font-size:15px;">Articles &amp; déclinaisons aux plus forts écarts</h4>
          <div class="st-tbl-wrap">
            <table class="st-tbl" style="font-size:12.5px;">
              <thead><tr><th>Article</th><th>Comptages</th><th style="text-align:right;">Écart cumulé</th><th style="text-align:right;">Impact MAD</th></tr></thead>
              <tbody>
                ${topVariants.length ? topVariants.map(v => `
                  <tr>
                    <td><b>${esc(v.label)}</b>${v.sku ? `<div style="font-size:11px;color:var(--n-500);">Réf: ${esc(v.sku)}</div>` : ''}</td>
                    <td class="st-mono">${v.countTimes}</td>
                    <td style="text-align:right;" class="st-mono">${v.netDiffSum > 0 ? '+' : ''}${Math.round(v.netDiffSum * 10) / 10} ${esc(v.unit)}</td>
                    <td style="text-align:right;font-weight:600;color:#b91c1c;" class="st-mono">${fmtMad(v.absCostSum)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--n-500);">Aucun écart détecté.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <div style="display:grid;gap:16px;">
          <div style="background:var(--paper);border:1px solid var(--n-200);border-radius:14px;padding:16px;">
            <h4 style="margin:0 0 12px;font-size:15px;">Écarts par employé</h4>
            <div class="st-tbl-wrap">
              <table class="st-tbl" style="font-size:12.5px;">
                <thead><tr><th>Employé</th><th>Inventaires</th><th style="text-align:right;">Écart absolu cumulé</th></tr></thead>
                <tbody>
                  ${topEmployees.length ? topEmployees.map(e => `
                    <tr>
                      <td><b>${esc(e.name)}</b></td>
                      <td class="st-mono">${e.countTimes}</td>
                      <td style="text-align:right;font-weight:600;" class="st-mono">${fmtMad(e.absCostSum)}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="3" style="text-align:center;padding:16px;color:var(--n-500);">Aucun comptage.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>

          <div style="background:var(--paper);border:1px solid var(--n-200);border-radius:14px;padding:16px;">
            <h4 style="margin:0 0 12px;font-size:15px;">Synthèse par établissement</h4>
            <div class="st-tbl-wrap">
              <table class="st-tbl" style="font-size:12.5px;">
                <thead><tr><th>Établissement</th><th>Inventaires</th><th style="text-align:right;">Écart net</th><th style="text-align:right;">Écart absolu</th></tr></thead>
                <tbody>
                  ${stores.length ? stores.map(s => `
                    <tr>
                      <td><b>${esc(s.name)}</b></td>
                      <td class="st-mono">${s.countTimes}</td>
                      <td style="text-align:right;" class="st-mono">${s.netCostSum > 0 ? '+' : ''}${fmtMad(s.netCostSum)}</td>
                      <td style="text-align:right;font-weight:600;" class="st-mono">${fmtMad(s.absCostSum)}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--n-500);">Aucun comptage.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function openCountDetailModal(countId) {
    if (!countId) return;
    let count = getAllCounts().find(c => c.id === countId);
    
    // Fetch full frozen details from server if missing lines
    if (!count || !count.lines || !count.lines.length) {
      try {
        const resp = await fetch(`/api/inventory/counts?id=${encodeURIComponent(countId)}`);
        const data = await resp.json();
        if (data && data.count) count = data.count;
      } catch (_) {}
    }

    if (!count) {
      window.Kiwi?.toast?.('Inventaire introuvable', { type: 'warn' });
      return;
    }

    const lines = Array.isArray(count.lines) ? count.lines : [];
    const submittedDate = new Date(count.submittedAt || Date.now());
    const submittedStr = submittedDate.toLocaleDateString('fr-FR') + ' à ' + submittedDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const isSubmitted = count.status === 'submitted';
    const isApproved = count.status === 'applied' || count.status === 'approved';
    const isRejected = count.status === 'rejected';

    const modal = window.Kiwi.modal({
      title: `Inventaire #${count.id}`,
      desc: `${count.storeName || 'Magasin principal'} · Soumis par ${count.employeeName || 'Employé'} le ${submittedStr}`,
      width: 820,
      body: `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="st-badge ${isSubmitted ? 'warn' : isApproved ? 'ok' : 'bad'}" style="font-size:13px;padding:4px 10px;">
              ${isSubmitted ? 'À valider par le propriétaire' : isApproved ? 'Validé & appliqué' : 'Refusé'}
            </span>
            <span style="font-size:13px;color:var(--n-600);">${lines.length} article${lines.length > 1 ? 's' : ''} compté${lines.length > 1 ? 's' : ''}</span>
          </div>
          <div style="font-size:14px;">
            Écart total en valeur : <b style="color:${(count.totalVarianceCostMAD || 0) < 0 ? '#b91c1c' : (count.totalVarianceCostMAD || 0) > 0 ? 'var(--atlas)' : 'inherit'};">${(count.totalVarianceCostMAD || 0) > 0 ? '+' : ''}${fmtMad(count.totalVarianceCostMAD || 0)}</b>
          </div>
        </div>

        ${count.reviewNote ? `
          <div class="st-notice ${isApproved ? 'ok' : 'warn'}" style="margin-bottom:14px;">
            ${svg(isApproved ? 'checkCircle' : 'alertTriangle', 14)}
            <div><b>Note de revue :</b> ${esc(count.reviewNote)} ${count.reviewerName ? `<span style="font-size:11px;color:var(--n-500);">(par ${esc(count.reviewerName)})</span>` : ''}</div>
          </div>
        ` : ''}

        <div class="st-tbl-wrap" style="max-height:360px;overflow-y:auto;border:1px solid var(--n-200);border-radius:12px;margin-bottom:16px;">
          <table class="st-tbl" style="font-size:12.5px;">
            <thead>
              <tr>
                <th>Article &amp; Déclinaison</th>
                <th style="text-align:right;">Stock avant</th>
                <th style="text-align:right;">Compté</th>
                <th style="text-align:right;">Écart</th>
                <th style="text-align:right;">Valeur MAD</th>
                <th>Remarque</th>
              </tr>
            </thead>
            <tbody>
              ${lines.length ? lines.map(l => {
                const label = l.productName ? `${l.productName}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''}` : (l.name || l.itemId);
                const diff = Number(l.diff) || 0;
                const cost = Number(l.varianceCost) || 0;
                const diffColor = diff < 0 ? '#b91c1c' : diff > 0 ? 'var(--atlas)' : 'inherit';
                return `
                  <tr>
                    <td>
                      <b>${esc(label)}</b>
                      ${l.sku ? `<div style="font-size:11px;color:var(--n-500);">Réf: ${esc(l.sku)}</div>` : ''}
                    </td>
                    <td style="text-align:right;" class="st-mono">${l.systemQty} ${esc(l.unit)}</td>
                    <td style="text-align:right;font-weight:700;" class="st-mono">${l.countedQty} ${esc(l.unit)}</td>
                    <td style="text-align:right;font-weight:600;color:${diffColor};" class="st-mono">${diff > 0 ? '+' : ''}${diff} ${esc(l.unit)}</td>
                    <td style="text-align:right;font-weight:600;color:${diffColor};" class="st-mono">${cost > 0 ? '+' : ''}${fmtMad(cost)}</td>
                    <td style="color:var(--n-600);font-size:11.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(l.explanation || l.note || '')}">
                      ${esc(l.explanation || l.note || '—')}
                    </td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--n-500);">Aucune ligne enregistrée.</td></tr>`}
            </tbody>
          </table>
        </div>

        ${isSubmitted ? `
          <div style="background:var(--paper-soft);border:1px solid var(--n-200);border-radius:12px;padding:12px;margin-bottom:12px;">
            <label style="font-size:12px;font-weight:600;color:var(--n-600);display:block;margin-bottom:4px;">Note ou commentaire de décision (optionnel)</label>
            <input class="st-search" id="st-cnt-review-note" placeholder="Justification de la décision…" style="width:100%;">
          </div>
        ` : ''}
      `,
      foot: `
        <button class="st-btn" data-dismiss-modal>Fermer</button>
        ${isSubmitted ? `
          <button class="st-btn" id="st-cnt-reject-btn" style="color:#b91c1c;border-color:rgba(185,28,28,0.3);">Refuser l'inventaire</button>
          <button class="st-btn primary" id="st-cnt-approve-btn" style="background:#059669;border-color:#047857;">Valider et appliquer le stock</button>
        ` : ''}
      `
    });

    const scope = modal?.el || topBackdrop();
    wireDismiss(scope);

    scope?.querySelector('#st-cnt-approve-btn')?.addEventListener('click', () => {
      const note = scope?.querySelector('#st-cnt-review-note')?.value || '';
      reviewCount(count.id, 'approved', note);
    });

    scope?.querySelector('#st-cnt-reject-btn')?.addEventListener('click', () => {
      const note = scope?.querySelector('#st-cnt-review-note')?.value || '';
      reviewCount(count.id, 'rejected', note);
    });
  }

  async function reviewCount(countId, decision, note) {
    if (!countId) return;
    const count = getAllCounts().find(c => c.id === countId);
    try {
      const resp = await fetch('/api/inventory/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review',
          id: countId,
          decision: decision,
          reviewNote: note || '',
          reviewerName: 'Propriétaire'
        })
      });
      const data = await resp.json();
      if (data && data.success) {
        if (decision === 'approved') {
          if (window.KiwiBoutiqueCatalog?.sync) {
            window.KiwiBoutiqueCatalog.sync();
          }
          if (window.KiwiInventory?.sync) {
            window.KiwiInventory.sync();
          }
        }
      }
    } catch (_) {}

    // Local state update for immediate feedback
    if (count) {
      count.status = decision === 'approved' ? 'applied' : 'rejected';
      count.reviewDecision = decision;
      count.reviewedAt = Date.now();
      count.reviewerName = 'Propriétaire';
      count.reviewNote = note || '';
      if (decision === 'approved') count.appliedAt = Date.now();
    }

    // Apply local ledger movements if demo or offline
    if (decision === 'approved' && count && Array.isArray(count.lines)) {
      count.lines.forEach(l => {
        if (l.diff) {
          moveStock({ id: l.itemId, costPerUnit: l.unitCost }, l.diff, 'count', 'count', countId, l.explanation || 'Inventaire physique validé');
        }
      });
      stSaveOverlay();
    }

    closeTopModal();
    window.Kiwi?.toast?.(decision === 'approved' ? 'Inventaire validé · stock mis à jour' : 'Inventaire refusé', { type: decision === 'approved' ? 'success' : 'info' });
    if (stPageActive) render();
  }

  function exportCountsCsv() {
    const counts = filterCounts(getAllCounts());
    function csvSafe(v) {
      let s = String(v == null ? '' : v);
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    const header = ['ID_Inventaire', 'Date', 'Magasin', 'Employe', 'Role', 'Statut', 'Nb_Lignes', 'Ecart_Net_MAD', 'Ecart_Abs_MAD', 'Validateur', 'Decision', 'Note_Revue'];
    const lines = [header.join(';')];
    counts.forEach(c => {
      const d = new Date(c.submittedAt || Date.now()).toISOString().slice(0, 19).replace('T', ' ');
      lines.push([
        csvSafe(c.id),
        d,
        csvSafe(c.storeName || 'Principal'),
        csvSafe(c.employeeName || '—'),
        csvSafe(c.employeeRole || '—'),
        csvSafe(c.status),
        c.totalLines || 0,
        (c.totalVarianceCostMAD || 0).toFixed(2),
        (c.absVarianceCostMAD || 0).toFixed(2),
        csvSafe(c.reviewerName || '—'),
        csvSafe(c.reviewDecision || '—'),
        csvSafe(c.reviewNote || '—')
      ].join(';'));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique-inventaires-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function renderItems() {
    const subNav = `
      <div class="st-item-subtabs" style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--n-200);padding-bottom:10px;">
        <button class="st-cat-pill${stItemSubView === 'catalog' ? ' on' : ''}" type="button" data-action="stock-subview" data-subview="catalog" style="font-weight:600;">Catalogue des articles</button>
        <button class="st-cat-pill${stItemSubView === 'waste' ? ' on' : ''}" type="button" data-action="stock-subview" data-subview="waste" style="font-weight:600;">Journal des pertes</button>
        <button class="st-cat-pill${stItemSubView === 'counts' ? ' on' : ''}" type="button" data-action="stock-subview" data-subview="counts" style="font-weight:600;">Historique des inventaires</button>
      </div>
    `;

    if (stItemSubView === 'waste') {
      return `<div class="st-section">${subNav}${renderWasteJournal()}</div>`;
    }
    if (stItemSubView === 'counts') {
      return `<div class="st-section">${subNav}${typeof renderCountsHistory === 'function' ? renderCountsHistory() : '<div style="padding:20px;">Chargement de l\'historique…</div>'}</div>`;
    }

    const items = getInv();
    const filteredAll = filterItems(items);
    const sorted = sortItems(filteredAll);
    const counts = {
      all: items.length,
      ok: items.filter(it => statusOf(it) === 'ok').length,
      low: items.filter(it => statusOf(it) === 'low').length,
      out: items.filter(it => statusOf(it) === 'out').length,
    };
    return `
      <div class="st-section">
        ${subNav}
        ${renderToolbar()}
        ${stItemView === 'list' ? renderItemTable(sorted) : renderItemCardGrid(sorted)}
        <div class="st-tbl-foot">
          ${esc(t('tblFoot', sorted.length, fmtMad(totalValue(sorted)), counts.ok, counts.low, counts.out))}
        </div>
      </div>
    `;
  }

  function renderToolbar() {
    const catPill = (id, label) => `<button class="st-cat-pill${stCatFilter === id ? ' on' : ''}" type="button" data-action="stock-cat-filter" data-cat="${id}">${esc(label)}</button>`;
    const statPill = (id, label) => `<button class="st-cat-pill${stStatusFilter === id ? ' on' : ''}" type="button" data-action="stock-status-filter" data-status="${id}">${esc(label)}</button>`;
    const viewBtn = (id, label) => `<button class="st-view-btn${stItemView === id ? ' on' : ''}" type="button" data-action="stock-view" data-view="${id}">${esc(label)}</button>`;
    const cats = allCategories();
    return `
      <div class="st-toolbar">
        <div class="st-search-row">
          <div class="st-search-wrap">
            ${svg('search', 16)}
            <input class="st-search" type="text" placeholder="${esc(t('searchPlaceholder'))}" value="${esc(stSearch)}" data-stock-search-input aria-label="Search inventory" />
          </div>
          <div class="st-view-toggle">
            ${viewBtn('list', t('viewList'))}
            ${viewBtn('cards', t('viewCards'))}
          </div>
        </div>
        <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%; flex-wrap:wrap;">
          ${catPill('all', t('catAll'))}
          ${cats.map(c => catPill(c.id, c.label)).join('')}
          <button class="st-cat-pill" type="button" data-action="stock-add-cat" title="${esc(t('addCatPillTitle'))}" aria-label="${esc(t('addCatPillTitle'))}" style="font-weight:700;">+</button>
        </div>
        <div class="st-filter-row" style="display:flex; gap:5px; background:var(--paper-soft); padding:4px; border-radius:999px; border:1px solid var(--n-200); width:fit-content; max-width:100%;">
          ${statPill('all', t('statAll'))}
          ${statPill('ok',  t('statOk'))}
          ${statPill('low', t('statLowFilter'))}
          ${statPill('out', t('statOutFilter'))}
        </div>
      </div>
    `;
  }

  function filterItems(items) {
    return items.filter(it => {
      if (stCatFilter !== 'all' && it.category !== stCatFilter) return false;
      if (stStatusFilter !== 'all' && statusOf(it) !== stStatusFilter) return false;
      if (stSearch) {
        const q = stSearch;
        if (!it.name.toLowerCase().includes(q) &&
            !it.supplier.toLowerCase().includes(q) &&
            !catLabel(it.category).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function sortItems(items) {
    const dir = stSortDir === 'asc' ? 1 : -1;
    const sorted = [...items];
    sorted.sort((a, b) => {
      let av, bv;
      switch (stSortBy) {
        case 'stock':   av = currentStockFor(a); bv = currentStockFor(b); break;
        case 'par':     av = a.parLevel; bv = b.parLevel; break;
        case 'variance':av = variance(a); bv = variance(b); break;
        case 'value':   av = currentStockFor(a) * a.costPerUnit; bv = currentStockFor(b) * b.costPerUnit; break;
        case 'days':    av = daysOfStock(a); bv = daysOfStock(b); break;
        case 'status':  av = ['out','low','ok'].indexOf(statusOf(a)); bv = ['out','low','ok'].indexOf(statusOf(b)); break;
        case 'name':
        default:        av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });
    return sorted;
  }

  function sortInd(key) {
    if (stSortBy !== key) return '<span class="sort-ind">↕</span>';
    return `<span class="sort-ind">${stSortDir === 'asc' ? '↑' : '↓'}</span>`;
  }

  function renderItemTable(items) {
    if (items.length === 0) return `<div style="padding:24px; text-align:center; color:var(--n-500); font-size:13px;">Aucun article ne correspond aux filtres.</div>`;
    return `
      <div class="st-tbl-wrap">
        <table class="st-tbl">
          <thead>
            <tr>
              <th class="${stSortBy === 'name' ? 'sorted' : ''}" data-action="stock-sort" data-sort="name">${esc(t('colArticle'))}${sortInd('name')}</th>
              <th>${esc(t('colCat'))}</th>
              <th class="${stSortBy === 'stock' ? 'sorted' : ''}" data-action="stock-sort" data-sort="stock">${esc(t('colStock'))}${sortInd('stock')}</th>
              <th class="${stSortBy === 'par' ? 'sorted' : ''}" data-action="stock-sort" data-sort="par">${esc(t('colPar'))}${sortInd('par')}</th>
              <th class="${stSortBy === 'variance' ? 'sorted' : ''}" data-action="stock-sort" data-sort="variance">${esc(t('colVar'))}${sortInd('variance')}</th>
              <th class="r ${stSortBy === 'value' ? 'sorted' : ''}" data-action="stock-sort" data-sort="value">${esc(t('colValue'))}${sortInd('value')}</th>
              <th>${esc(t('colSupplier'))}</th>
              <th class="c ${stSortBy === 'days' ? 'sorted' : ''}" data-action="stock-sort" data-sort="days">${esc(t('colDays'))}${sortInd('days')}</th>
              <th class="${stSortBy === 'status' ? 'sorted' : ''}" data-action="stock-sort" data-sort="status">${esc(t('colStatus'))}${sortInd('status')}</th>
              <th class="r">${esc(t('colActions'))}</th>
            </tr>
          </thead>
          <tbody>
            ${items.length === 0 ? '<tr><td colspan="10" style="padding:44px 20px;text-align:center;"><div style="display:flex;flex-direction:column;align-items:center;"><div style="width:44px;height:44px;border-radius:12px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:12px;"><svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><div style="font-weight:600;font-size:14.5px;color:var(--ink);margin-bottom:4px;">' + esc(t('noMatch') || 'Aucun article ne correspond aux filtres.') + '</div></div></td></tr>' : items.map(renderItemRow).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderItemRow(it) {
    const cur = currentStockFor(it);
    const parPct = it.parLevel > 0 ? Math.min(100, (cur / it.parLevel) * 100) : 0;
    const barCls = parPct >= 50 ? 'ok' : parPct >= 20 ? 'warn' : 'bad';
    const v = variance(it);
    const varAbs = Math.abs(v);
    const varCls = varAbs <= 5 ? 'ok' : varAbs <= 15 ? 'warn' : 'bad';
    const varIco = v > 1 ? 'trendingUp' : v < -1 ? 'trendingDown' : 'minus';
    const days = daysOfStock(it);
    const daysShown = days >= 999 ? '—' : Math.round(days);
    const daysCls = days >= 7 ? 'ok' : days >= 3 ? 'warn' : days >= 1 ? 'bad' : 'crit';
    const st = statusOf(it);
    const stLabel = st === 'ok' ? t('stOk') : st === 'low' ? t('stLow') : t('stOut');
    const valueCell = fmtMad(cur * it.costPerUnit);
    const theoretical = theoreticalUsageFor(it);
    const varCostMad = fmtMad(Math.abs(v) / 100 * theoretical * it.costPerUnit);
    return `
      <tr class="st-row-in">
        <td>
          <div class="st-cell-name">${esc(it.name)}</div>
          <div class="st-cell-cost">${esc(fmtMad(it.costPerUnit))} / ${esc(it.unit)}</div>
        </td>
        <td><span class="st-sup-cat">${esc(catLabel(it.category))}</span></td>
        <td>
          <div class="st-cell-stock">${esc(fmtUnit(cur, it.unit))}</div>
          <div class="st-cell-stock-bar"><div class="st-cell-stock-bar-fill ${barCls}" data-stock-bar="${parPct}"></div></div>
        </td>
        <td>
          <div class="st-cell-par">${esc(fmtUnit(it.parLevel, it.unit))}</div>
          <div class="st-cell-par-sub">min: ${esc(fmtUnit(it.reorderLevel, it.unit))}</div>
        </td>
        <td>
          <span class="st-cell-var ${varCls}">${svg(varIco, 12)}${esc(fmtPct(v))}
            <span class="st-tt">${esc(t('varTip', fmtUnit(it.usageThisWeek, it.unit), fmtUnit(theoretical, it.unit), varCostMad))}</span>
          </span>
        </td>
        <td class="r"><span class="st-cell-value">${esc(valueCell)}</span></td>
        <td>
          <div class="st-cell-sup">${esc(it.supplier.split(' · ')[0])}</div>
          <div class="st-cell-sup-sub">${esc(fmtDateShort(it.lastDelivery))}</div>
        </td>
        <td class="c"><span class="st-cell-days ${daysCls}">${esc(daysShown === '—' ? '—' : `${daysShown} j`)}</span></td>
        <td><span class="st-cell-status ${st}"><span class="sd"></span>${esc(stLabel)}</span></td>
        <td class="r">
          <div class="st-actions">
            <button class="st-icon-btn" type="button" data-action="stock-item-detail" data-item-id="${esc(it.id)}" title="${esc(t('btnDetail'))}" aria-label="${esc(t('btnDetail'))}">${svg('eye', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-reorder" data-item-id="${esc(it.id)}" title="${esc(t('btnReorder'))}" aria-label="${esc(t('btnReorder'))}">${svg('plus', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-edit-item" data-item-id="${esc(it.id)}" title="${esc(t('mItEdit'))}" aria-label="${esc(t('mItEdit'))}">${svg('edit', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-delete-item" data-item-id="${esc(it.id)}" title="${esc(t('titleDelete'))}" aria-label="${esc(t('titleDelete'))}" style="color:#9a1f1f;">${svg('x', 14)}</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderItemCardGrid(items) {
    if (items.length === 0) return `<div style="padding:24px; text-align:center; color:var(--n-500); font-size:13px;">Aucun article ne correspond aux filtres.</div>`;
    return `<div class="st-card-grid">${items.map(renderItemCard).join('')}</div>`;
  }

  function renderItemCard(it) {
    const cur = currentStockFor(it);
    const parPct = it.parLevel > 0 ? Math.min(100, (cur / it.parLevel) * 100) : 0;
    const st = statusOf(it);
    const barCls = parPct >= 50 ? 'ok' : parPct >= 20 ? 'warn' : 'bad';
    return `
      <div class="st-card ${st}" data-action="stock-item-detail" data-item-id="${esc(it.id)}">
        <div class="st-card-top">
          <div class="st-card-name">${esc(it.name)}</div>
          <span class="st-card-cat">${esc(catLabel(it.category))}</span>
        </div>
        <div class="st-card-stock">${esc(fmtNum(cur, Number.isInteger(cur) ? 0 : 1))}<span class="u">${esc(it.unit)}</span></div>
        <div class="st-card-bar"><div class="st-card-bar-fill ${barCls}" data-stock-bar="${parPct}"></div></div>
        <div class="st-card-meta">
          <span>Par : <b>${esc(fmtUnit(it.parLevel, it.unit))}</b></span>
          <span>${esc(fmtMad(cur * it.costPerUnit))}</span>
        </div>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 3 · Fournisseurs
   * ═══════════════════════════════════════════════════════════════════════ */
  function computeRealSupplierPriceChanges() {
    if (!window.KiwiInventory || !window.KiwiInventory.history) return [];
    const raw = stOverlayRaw();
    const subList = Array.isArray(raw.subcategories) ? raw.subcategories : [];
    const changes = [];
    
    subList.forEach(sub => {
      const hist = (window.KiwiInventory.history(sub.id) || []).filter(m => m.reason === 'receipt' && m.unitCost != null);
      if (!hist.length) return;
      
      const bySup = new Map();
      hist.forEach(m => {
        const supName = (m.meta && m.meta.supplierName) || (m.meta && m.meta.supplierId) || 'Fournisseur';
        if (!bySup.has(supName)) bySup.set(supName, []);
        bySup.get(supName).push(m);
      });

      bySup.forEach((mList, supName) => {
        mList.sort((a, b) => (+b.occurredTs || 0) - (+a.occurredTs || 0));
        const latest = mList[0];
        const prev = mList[1] || null;
        if (!prev) return;
        const pLast = latest.unitCost;
        const pPrev = prev.unitCost;
        if (pLast != null && pPrev != null && pLast !== pPrev) {
          const delta = Math.round((pLast - pPrev) * 100) / 100;
          const pct = Math.round(((delta) / pPrev) * 1000) / 10;
          
          const impactedRecipes = [];
          try {
            const costDoc = window.KiwiCost && window.KiwiCost.doc ? window.KiwiCost.doc() : (window.KiwiCost && window.KiwiCost.store ? window.KiwiCost.store.get(stOverlayScope()) : null);
            const recipes = (costDoc && costDoc.recipes) || (window.KiwiRestaurantRecipes && window.KiwiRestaurantRecipes.getAll ? window.KiwiRestaurantRecipes.getAll() : {});
            Object.entries(recipes).forEach(([rId, rec]) => {
              if (!rec || !Array.isArray(rec.ingredients)) return;
              const line = rec.ingredients.find(ing => ing.stockId === sub.id || ing.name === sub.name);
              if (line) {
                const portionQty = +line.qty || 0;
                const dishCostDelta = Math.round(portionQty * delta * 100) / 100;
                impactedRecipes.push({
                  id: rId,
                  name: rec.itemName || rec.name || rId,
                  dishCostDelta: dishCostDelta,
                });
              }
            });
          } catch (_) {}

          changes.push({
            subId: sub.id,
            subName: sub.name,
            unit: sub.unit,
            supplierName: supName,
            pLast: pLast,
            pPrev: pPrev,
            delta: delta,
            pct: pct,
            date: latest.occurredTs || Date.now(),
            impactedRecipes: impactedRecipes,
          });
        }
      });
    });

    return changes;
  }

  function renderRealSupplierPriceChanges() {
    const changes = computeRealSupplierPriceChanges();
    if (!changes.length) {
      return `
        <div class="st-ai" style="margin-top:16px;">
          <div class="st-ai-t">Évolution des tarifs fournisseurs</div>
          <div class="st-ai-b">Tous les tarifs facturés lors des dernières réceptions sont stables. Kiwi analyse automatiquement l'historique des bons de livraison pour détecter les variations de prix.</div>
        </div>
      `;
    }
    return changes.map(ch => {
      const isUp = ch.delta > 0;
      const recipesText = ch.impactedRecipes.length > 0
        ? ` · Impact sur ${ch.impactedRecipes.length} recette${ch.impactedRecipes.length > 1 ? 's' : ''} (ex: ${esc(ch.impactedRecipes[0].name)} ${isUp ? '+' : ''}${fmtMad(ch.impactedRecipes[0].dishCostDelta)}/portion)`
        : '';
      return `
        <div class="st-ai ${isUp ? 'warn' : 'ok'}" style="margin-top:14px;">
          <div class="st-ai-t" style="display:flex; align-items:center; gap:6px;">
            ${svg(isUp ? 'trendingUp' : 'trendingDown', 14)}
            <span>${esc(ch.supplierName)} : variation de tarif sur ${esc(ch.subName)} (${isUp ? '+' : ''}${fmtPct(ch.pct, 1)})</span>
          </div>
          <div class="st-ai-b">
            Passage de <b>${esc(fmtMad(ch.pPrev))}</b> à <b>${esc(fmtMad(ch.pLast))}</b> / ${esc(ch.unit)}${recipesText}.
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSuppliers() {
    const sup = getSup();
    const totalSpend = sup.reduce((s, x) => s + x.monthlySpend, 0);
    const weightedPrice = sup.reduce((s, x) => s + (x.priceChangeLast30d * x.monthlySpend), 0) / totalSpend;
    const trendCls = weightedPrice > 1 ? 'up' : weightedPrice < -1 ? 'down' : '';
    return `
      <div class="st-section">
        <div class="st-section-head" style="justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;">
            <h3>${esc(t('supTitle'))}</h3>
            <span class="st-section-sub">${esc(t('supSub', sup.length))}</span>
          </div>
          <button class="st-btn primary" type="button" data-action="stock-add-supplier">${svg('plus', 13)}<span>${esc(t('addSupCta'))}</span></button>
        </div>
        <div class="st-sup-stats">
          <div class="st-sup-stat"><div class="l">${esc(t('supStatActive'))}</div><div class="v">${sup.length}</div></div>
          <div class="st-sup-stat"><div class="l">${esc(t('supStatSpend'))}</div><div class="v">${esc(fmtMad(totalSpend))}</div></div>
          <div class="st-sup-stat"><div class="l">${esc(t('supStatPriceTrend'))}</div><div class="v ${trendCls}">${esc(fmtPct(weightedPrice, 1))}</div></div>
        </div>
        <div class="st-tbl-wrap">
          <table class="st-sup-table">
            <thead>
              <tr>
                <th>${esc(t('colSupplier'))}</th>
                <th>${esc(t('colSupCat'))}</th>
                <th class="r">${esc(t('colSupSpend'))}</th>
                <th>${esc(t('colSupPrice'))}</th>
                <th>${esc(t('colSupDeliv'))}</th>
                <th>${esc(t('colSupRate'))}</th>
                <th class="r">${esc(t('colActions'))}</th>
              </tr>
            </thead>
            <tbody>
              ${sup.map(renderSupRow).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${stShowReal() ? renderRealSupplierPriceChanges() : renderAiCard(t('aiPriceUpT'), t('aiPriceUpB'), t('aiPriceUpA'))}
    `;
  }

  function renderSupRow(s) {
    const pcl = s.priceChangeLast30d;
    const priceCls = pcl > 1 ? 'up' : pcl < -1 ? 'down' : 'neutral';
    const priceIco = pcl > 1 ? 'trendingUp' : pcl < -1 ? 'trendingDown' : 'minus';
    const priceLabel = pcl === 0 ? t('priceStable') : fmtPct(pcl, 1);
    const risePill = pcl > 5 ? `<span class="st-sup-rise-pill">${esc(t('priceUp'))}</span>` : '';
    const rateVal = (s.rating != null && !isNaN(s.rating) && s.rating !== '') ? Number(s.rating) : null;
    const rateHtml = rateVal != null
      ? `<span class="st-sup-rate"><span class="st">${'★'.repeat(Math.round(rateVal))}</span>${esc(rateVal.toFixed(1))}</span>`
      : `<span class="st-sup-rate muted" style="color:var(--n-500);">—</span>`;
    return `
      <tr>
        <td>
          <div class="st-sup-name">${esc(s.name)}</div>
          <div class="st-sup-loc">${esc(s.location)}</div>
          <div class="st-sup-phone">${esc(s.contact)}</div>
        </td>
        <td><span class="st-sup-cat">${esc(catLabel(s.category))}</span></td>
        <td class="r"><span class="st-sup-spend">${esc(fmtMad(s.monthlySpend))}</span></td>
        <td><span class="st-sup-price ${priceCls}">${svg(priceIco, 12)}${esc(priceLabel)}</span>${risePill}</td>
        <td>
          <div class="st-sup-deliv">${esc(s.deliverySchedule)}</div>
          <div class="st-sup-deliv-sub">${esc(s.paymentTerms)}</div>
        </td>
        <td>${rateHtml}</td>
        <td class="r">
          <div class="st-actions">
            <button class="st-icon-btn" type="button" data-action="stock-call-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}" title="${esc(t('mSupCall'))}" aria-label="${esc(t('mSupCall'))}">${svg('phone', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-wa-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}" title="${esc(t('mSupWa'))}" aria-label="${esc(t('mSupWa'))}">${svg('messageCircle', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-supplier-detail" data-supplier-id="${esc(s.id)}" title="${esc(t('btnDetail'))}" aria-label="${esc(t('btnDetail'))}">${svg('eye', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-edit-supplier" data-supplier-id="${esc(s.id)}" title="${esc(t('titleEdit'))}" aria-label="${esc(t('titleEdit'))}">${svg('edit', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-new-po" data-supplier-id="${esc(s.id)}" title="${esc(t('mSupOrd'))}" aria-label="${esc(t('mSupOrd'))}">${svg('plus', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-delete-supplier" data-supplier-id="${esc(s.id)}" title="${esc(t('titleDelete'))}" aria-label="${esc(t('titleDelete'))}" style="color:#9a1f1f;">${svg('x', 14)}</button>
          </div>
        </td>
      </tr>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 4 · Commandes
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderOrders() {
    /* Real / custom store → the demo purchase-orders (Boucherie Errazi, Centrale
       Danone, "47 orders this month"…) are venue-independent hardcoded data, so
       gate the whole tab to a clean empty state. Local demo keeps the fixtures. */
    if (stShowReal()) {
      return `
      <div class="st-section">
        <div class="st-section-head" style="justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:10px;">
            <h3>${esc(t('ordTitle'))}</h3>
          </div>
          <button class="st-btn primary" type="button" data-action="stock-new-order">${esc(t('ordNew'))}</button>
        </div>
        <div style="color:var(--n-500); font-size:13px; padding:14px 2px;">${esc(t('ordEmpty'))}</div>
      </div>`;
    }
    return `
      <div class="st-section">
        <div class="st-section-head" style="justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:10px;">
            <h3>${esc(t('ordTitle'))}</h3>
            <span class="st-count-badge">4</span>
          </div>
          <button class="st-btn primary" type="button" data-action="stock-new-order">${esc(t('ordNew'))}</button>
        </div>
        <div class="st-ord-stats">
          <div class="st-sup-stat"><div class="l">${esc(t('ordStatActive'))}</div><div class="v">4</div></div>
          <div class="st-sup-stat"><div class="l">${esc(t('ordStatPending'))}</div><div class="v">${esc(fmtMad(12458))}</div></div>
          <div class="st-sup-stat"><div class="l">${esc(t('ordStatMonth'))}</div><div class="v">47</div></div>
        </div>
        <div class="st-ord-list">
          ${renderActiveOrders()}
        </div>
      </div>

      <div class="st-section">
        <div class="st-section-head"><h3>${esc(t('ordHistory'))}</h3></div>
        ${renderHistoryTable()}
      </div>

      ${renderSuggestedOrder()}
    `;
  }

  function renderActiveOrders() {
    const orders = [
      {
        id: '2843', sup: 'Boucherie Errazi', when: `${t('ramTomorrow')} 06h`,
        items: 'Viande hachée 12 kg · Agneau épaule 14 kg · Merguez 4 kg',
        total: 3250, status: 'ok', statusLabel: t('stConfirmed'),
        acts: [['btnDetail', 'stock-ord-detail'], ['btnEditOrd', 'stock-ord-edit'], ['btnCancel', 'stock-ord-cancel']],
        urgent: false,
      },
      {
        id: '2844', sup: 'Marché de gros Inezgane', when: `${t('ramFriday')} 06h`,
        items: 'Tomates 20 kg · Oignons 15 kg · Coriandre 30 bottes · Menthe 40 bottes · Persil 25 bottes',
        total: 1840, status: stConfirmedOrders.has('2844') ? 'ok' : 'pending',
        statusLabel: stConfirmedOrders.has('2844') ? t('stConfirmed') : t('stPending'),
        acts: stConfirmedOrders.has('2844')
          ? [['btnDetail', 'stock-ord-detail'], ['btnEditOrd', 'stock-ord-edit']]
          : [['btnConfirm', 'stock-confirm-order', 'primary'], ['btnEditOrd', 'stock-ord-edit']],
        urgent: false,
      },
      {
        id: '2845', sup: 'Métro Casablanca (récurrente)', when: `${t('ramNextThu')} 14h`,
        items: 'Liste type, 14 articles',
        total: 4620, status: 'rec', statusLabel: t('stRecurring'),
        acts: [['btnEditList', 'stock-ord-edit'], ['btnPause', 'stock-ord-pause']],
        urgent: false,
      },
      {
        id: '2846', sup: 'Marché Central · Port', when: t('ramTodayLate'),
        items: 'Poisson frais sole 6 kg · Crevettes 2 kg',
        total: 1188, status: 'urgent', statusLabel: t('stUrgent'),
        acts: [['btnTrack', 'stock-ord-track'], ['btnContactSup', 'stock-ord-contact']],
        urgent: true,
      },
    ];
    return orders.map(o => {
      return `
        <div class="st-ord-card ${o.urgent ? 'urgent' : ''}">
          <div class="st-ord-body">
            <div class="st-ord-top">
              <span class="st-ord-id">${esc(t('ramOrder'))}${esc(o.id)}</span>
              <span class="st-ord-when">${esc(o.when)}</span>
              <span class="st-ord-status ${o.status}">${esc(o.statusLabel)}</span>
            </div>
            <div class="st-ord-items"><b>${esc(o.sup)}</b> · ${esc(o.items)}</div>
            <div class="st-ord-total">${esc(fmtMad(o.total))}</div>
          </div>
          <div class="st-ord-acts">
            ${o.acts.map(a => `<button class="st-btn${a[2] ? ' ' + a[2] : ''}" type="button" data-action="${a[1]}" data-order-id="${esc(o.id)}">${esc(t(a[0]))}</button>`).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderHistoryTable() {
    const hist = [
      { date: '2026-05-13', sup: 'Boucherie Errazi', total: 3120, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-13', sup: 'Centrale Danone', total: 1180, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-12', sup: 'Marché de gros Inezgane', total: 1720, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-12', sup: 'NABC', total: 2160, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-10', sup: 'Métro Casablanca', total: 4480, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-09', sup: 'Minoterie Lazaar', total: 480, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-08', sup: 'Marché Central · Port', total: 920, status: t('stPartial'), cls: 'warn' },
      { date: '2026-05-07', sup: 'Huileries Sefrioui', total: 1680, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-06', sup: 'Boucherie Errazi', total: 3540, status: t('stReceived'), cls: 'ok' },
      { date: '2026-05-05', sup: 'Avicole Atlas', total: 480, status: t('stCancelled'), cls: 'bad' },
    ];
    return `
      <div class="st-tbl-wrap">
        <table class="st-sup-table">
          <thead>
            <tr><th>DATE</th><th>${esc(t('colSupplier'))}</th><th class="r">${esc(t('mScanTotal'))}</th><th>${esc(t('colStatus'))}</th></tr>
          </thead>
          <tbody>
            ${hist.map(h => `
              <tr>
                <td><span class="st-sup-deliv-sub">${esc(fmtDateShort(h.date))}</span></td>
                <td><span class="st-sup-name">${esc(h.sup)}</span></td>
                <td class="r"><span class="st-sup-spend">${esc(fmtMad(h.total))}</span></td>
                <td><span class="status-${h.cls === 'ok' ? 'ok' : h.cls === 'warn' ? 'warn' : 'bad'}" style="font-weight:600; font-size:11.5px;">${esc(h.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSuggestedOrder() {
    const items = [
      { n: 'Viande hachée bœuf', q: '14 kg', c: 1330, sup: 'Boucherie Errazi' },
      { n: 'Agneau épaule', q: '12 kg', c: 2016, sup: 'Boucherie Errazi' },
      { n: 'Merguez', q: '4 kg', c: 312, sup: 'Boucherie Errazi' },
      { n: 'Tomates fraîches', q: '24 kg', c: 192, sup: 'Marché Inezgane' },
      { n: 'Courgettes', q: '12 kg', c: 108, sup: 'Marché Inezgane' },
      { n: 'Menthe fraîche', q: '80 bottes', c: 240, sup: 'Marché Inezgane' },
      { n: 'Avocats', q: '8 kg', c: 256, sup: 'Fruits Premium' },
      { n: 'Coriandre fraîche', q: '24 bottes', c: 96, sup: 'Marché Inezgane' },
      { n: 'Lait entier', q: '60 L', c: 480, sup: 'Centrale Danone' },
      { n: 'Œufs', q: '240 unités', c: 336, sup: 'Avicole Atlas' },
      { n: 'Coca-Cola 33cl', q: '240 bouteilles', c: 1440, sup: 'NABC' },
      { n: 'Eau minérale 50cl', q: '120 bouteilles', c: 360, sup: 'Sidi Ali' },
      { n: 'Pain rond', q: '120 unités', c: 240, sup: 'Bakery El Ouafy' },
      { n: 'Couscous fin', q: '12 kg', c: 216, sup: 'Métro Casablanca' },
      { n: 'Semoule fine', q: '14 kg', c: 168, sup: 'Métro Casablanca' },
      { n: 'Sucre blanc', q: '10 kg', c: 90, sup: 'Métro Casablanca' },
      { n: 'Fromage frais', q: '4 kg', c: 248, sup: 'Métro Casablanca' },
      { n: 'Beurre', q: '6 kg', c: 468, sup: 'Centrale Danone' },
    ];
    const total = items.reduce((s, x) => s + x.c, 0);
    return `
      <div class="st-suggest">
        <div class="st-suggest-eyebrow">KIWI AI · AUTO-COMMANDE</div>
        <div class="st-suggest-t">${esc(t('autoOrderT'))}</div>
        <div class="st-suggest-b">${esc(t('autoOrderB'))}</div>
        <div class="st-suggest-items">
          ${items.map(x => `
            <div class="st-suggest-item">
              <span class="n">${esc(x.n)} <span style="color:rgba(247,245,240,0.5); font-size:11px;">· ${esc(x.sup)}</span></span>
              <span class="q">${esc(x.q)}</span>
              <span class="c">${esc(fmtMad(x.c))}</span>
            </div>
          `).join('')}
        </div>
        <div class="st-suggest-foot">
          <div class="st-suggest-total">
            <span class="l">${esc(t('autoOrderTotal'))}</span>
            <span class="v">${esc(fmtMad(total))}</span>
            <span class="st-suggest-save">${esc(t('autoOrderSave'))}</span>
          </div>
          <div class="st-suggest-acts">
            <button class="st-btn" type="button" data-action="stock-edit-suggested">${esc(t('btnEditFirst'))}</button>
            <button class="st-btn primary" type="button" data-action="stock-send-suggested">${esc(t('btnSendSuggested'))}</button>
          </div>
        </div>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 5 · Prévisions IA (Ultra)
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderForecast() {
    const unlocked = isFusion() || window.KiwiVenue?.getPlan?.() === 'ultra';
    if (!unlocked) {
      return `
        <div class="st-section">
          <div class="st-locked">
            <div class="st-locked-inner">
              <div class="st-locked-ico">${svg('sparkles', 30)}</div>
              <div class="st-locked-t">${esc(t('lockedT'))}</div>
              <div class="st-locked-b">${esc(t('lockedB'))}</div>
              <button class="st-locked-cta" type="button" data-action="stock-upgrade-ultra">${esc(t('lockedCta'))}</button>
            </div>
          </div>
        </div>
      `;
    }

    // Unlocked but real → the demo forecast (chart, shortfalls, seasonality) is
    // all Café Atlas data; show an honest empty state instead.
    if (stShowReal()) {
      const c = ({
        fr: { h: 'Vos prévisions apparaîtront ici', p: 'Dès que Kiwi AI dispose de votre historique de ventes, il anticipe vos ruptures de stock, la saisonnalité et les pics d’événements.' },
        en: { h: 'Your forecasts will show here', p: 'Once Kiwi AI has your sales history, it anticipates stockouts, seasonality and event peaks.' },
        ar: { h: 'ستظهر توقعاتك هنا', p: 'بمجرد توفّر سجل مبيعاتك، يتوقّع Kiwi AI نفاد المخزون والموسمية وذروات المناسبات.' },
      })[(window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr'] || { h: 'Your forecasts will show here', p: '' };
      return `<div class="st-section"><div style="padding:44px 24px;text-align:center;max-width:520px;margin:0 auto;">
        <div style="font-size:16px;font-weight:640;letter-spacing:-.01em;margin-bottom:8px;">${c.h}</div>
        <div style="font-size:13.5px;color:var(--n-500);line-height:1.6;">${c.p}</div></div></div>`;
    }

    return `
      <div class="st-section">
        <div class="st-section-head"><h3>${esc(t('fcTitle'))}</h3><span class="st-section-sub">${esc(t('fcSub'))}</span></div>
        <div class="st-fc-chart-wrap">${renderForecastChart()}</div>
      </div>

      <div class="st-section">
        <div class="st-section-head">
          <h3>${esc(t('fcShortfallsT'))}</h3>
          <span class="st-section-sub">${esc(t('fcShortfallsSub'))}</span>
        </div>
        <div class="st-shortfalls">
          ${renderShortfall('Menthe fraîche', 'mardi', '80 bottes', 'lundi')}
          ${renderShortfall('Lait entier', 'mercredi', '60 L', 'mardi')}
          ${renderShortfall('Œufs', 'jeudi', '200 unités', 'mercredi')}
          ${renderShortfall('Coca-Cola 33cl', 'vendredi', '240 bouteilles', 'jeudi')}
        </div>
      </div>

      <div class="st-section">
        <div class="st-section-head"><h3>Kiwi AI · saisonnalité &amp; événements</h3></div>
        ${renderAiCard(t('fcRamadanT'), t('fcRamadanB'), t('fcRamadanA'))}
        ${renderAiCard(t('fcWeekendT'), t('fcWeekendB'), t('fcWeekendA'))}
      </div>

      ${isFusion() ? `
        <div class="st-section">
          <div class="st-section-head"><h3>Procurement multi-sites</h3></div>
          ${renderAiCard(t('fcCrossT'), t('fcCrossB'), t('fcCrossA'))}
        </div>
      ` : ''}
    `;
  }

  function renderShortfall(name, when, qty, byWhen) {
    return `
      <div class="st-shortfall">
        <div class="st-shortfall-ico">${svg('alertTriangle', 16)}</div>
        <div class="st-shortfall-body">
          <div class="t">${esc(name)} · rupture prévue ${esc(when)}</div>
          <div class="s">commander ${esc(qty)} avant ${esc(byWhen)}</div>
        </div>
        <button class="st-btn primary" type="button" data-action="stock-program-shortfall" data-item-name="${esc(name)}">${esc(t('btnScheduleOrder'))}</button>
      </div>
    `;
  }

  function renderForecastChart() {
    // SVG line chart — 7 days, 5 items, scaled to height 220
    const days = [t('dayMon'), t('dayTue'), t('dayWed'), t('dayThu'), t('dayFri'), t('daySat'), t('daySun')];
    const series = [
      { name: 'Tajine kefta', color: '#16774F', data: [42, 48, 51, 47, 64, 78, 71] },
      { name: 'Tomates', color: '#6A6151', data: [28, 32, 30, 34, 41, 48, 38] },
      { name: 'Pain rond', color: '#BBB199', data: [62, 70, 68, 74, 92, 108, 86] },
      { name: 'Thé menthe', color: '#0E805C', data: [80, 88, 85, 92, 114, 132, 108] },
      { name: 'Lait entier', color: '#A8A49A', data: [18, 22, 20, 24, 30, 36, 28] },
    ];
    const W = 720, H = 220, PAD = { l: 36, r: 16, t: 12, b: 28 };
    const maxV = Math.max(...series.flatMap(s => s.data));
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const xAt = (i) => PAD.l + (i / (days.length - 1)) * innerW;
    const yAt = (v) => PAD.t + innerH - (v / maxV) * innerH;
    const gridY = [0, 0.25, 0.5, 0.75, 1].map(p => {
      const y = PAD.t + innerH - p * innerH;
      return `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" /><text x="${PAD.l - 8}" y="${y + 3}" text-anchor="end" font-size="9">${Math.round(p * maxV)}</text>`;
    }).join('');
    const xLabels = days.map((d, i) => `<text x="${xAt(i)}" y="${H - 6}" text-anchor="middle" font-size="10">${esc(d.slice(0, 3))}</text>`).join('');
    const lines = series.map(s => {
      const path = s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
      return `<path class="line" d="${path}" stroke="${s.color}" />`;
    }).join('');
    const legend = series.map(s => `<div class="st-fc-leg"><span class="lk" style="background:${s.color};"></span>${esc(s.name)}</div>`).join('');
    return `
      <svg class="st-fc-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Forecast chart">
        <g class="grid">${gridY}</g>
        <g class="axis">${xLabels}</g>
        ${lines}
      </svg>
      <div class="st-fc-legend">${legend}</div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Quick Order
   * ═══════════════════════════════════════════════════════════════════════ */
  function openQuickOrder(itemId, opts = {}) {
    const it = getInv().find(x => x.id === itemId);
    if (!it) return;
    const suggested = Math.max(1, Math.round((it.parLevel * 1.2 - currentStockFor(it)) * 10) / 10);
    const sup = it.supplier.split(' · ')[0];
    const supOptions = getSup().map(s => `<option value="${esc(s.name)}" ${s.name === sup ? 'selected' : ''}>${esc(s.name)} · ${esc(s.location)}</option>`).join('');
    const exp = opts.urgent === true;
    const totalEst = () => {
      const q = +document.querySelector('[data-stock-qo-qty]')?.value || suggested;
      const exp = document.querySelector('[data-stock-qo-mode][value="express"]')?.checked;
      const base = q * it.costPerUnit;
      return base + (exp ? 120 : 0);
    };
    const m = window.Kiwi.modal({
      title: t('mQoTitle'),
      tag: exp ? 'URGENT' : '',
      desc: `${esc(it.name)} · ${esc(catLabel(it.category))}`,
      width: 560,
      body: `
        <div class="st-mb-field" style="margin-bottom:14px;">
          <label class="st-mb-label">${esc(t('mQoArticle'))}</label>
          <input class="st-mb-input" type="text" value="${esc(it.name)}" disabled />
        </div>
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('mQoQty'))}</label>
            <div class="st-qo-qty">
              <button type="button" data-stock-qo-dec>−</button>
              <input class="st-mb-input mono" type="number" step="0.5" min="0.5" value="${suggested}" data-stock-qo-qty />
              <button type="button" data-stock-qo-inc>+</button>
              <span style="font-size:12px; color:var(--n-500); margin-left:6px;">${esc(it.unit)}</span>
            </div>
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('mQoSup'))}</label>
            <select class="st-mb-input" data-stock-qo-sup>${supOptions}</select>
          </div>
        </div>
        <div class="st-mb-field" style="margin-bottom:14px;">
          <label class="st-mb-label">${esc(t('mQoMode'))}</label>
          <div class="st-qo-radio-group">
            <label class="st-qo-radio ${exp ? '' : 'on'}">
              <input type="radio" name="qo-mode" value="standard" ${exp ? '' : 'checked'} data-stock-qo-mode />
              <span class="l">${esc(t('mQoModeStd'))}</span>
              <span class="s">+0 MAD</span>
            </label>
            <label class="st-qo-radio ${exp ? 'on' : ''}">
              <input type="radio" name="qo-mode" value="express" ${exp ? 'checked' : ''} data-stock-qo-mode />
              <span class="l">${esc(t('mQoModeExp'))}</span>
              <span class="s">+120 MAD</span>
            </label>
          </div>
        </div>
        <div class="st-mb-field" style="margin-bottom:14px;">
          <label class="st-mb-label">${esc(t('mQoNote'))}</label>
          <textarea class="st-mb-textarea" placeholder="Ex. livraison avant 11h, entrée arrière" data-stock-qo-note></textarea>
        </div>
        <div class="st-qo-summary">
          <span class="l">${esc(t('mQoTotal'))}</span>
          <span class="v" data-stock-qo-total>${esc(fmtMad(suggested * it.costPerUnit + (exp ? 120 : 0)))}</span>
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button class="st-btn primary" data-stock-qo-send>${esc(t('mQoSend'))}</button>`,
    });
    // Wire up the modal
    requestAnimationFrame(() => {
      wireDismiss(m?.el || topBackdrop());
      const dec = document.querySelector('[data-stock-qo-dec]');
      const inc = document.querySelector('[data-stock-qo-inc]');
      const qty = document.querySelector('[data-stock-qo-qty]');
      const totalEl = document.querySelector('[data-stock-qo-total]');
      const supSel = document.querySelector('[data-stock-qo-sup]');
      const modes = document.querySelectorAll('[data-stock-qo-mode]');
      const recompute = () => {
        const q = parseFloat(qty.value) || 0;
        const expChecked = document.querySelector('[data-stock-qo-mode][value="express"]')?.checked;
        totalEl.textContent = fmtMad(q * it.costPerUnit + (expChecked ? 120 : 0));
      };
      dec?.addEventListener('click', () => { qty.value = Math.max(0.5, (parseFloat(qty.value) || 1) - 0.5); recompute(); });
      inc?.addEventListener('click', () => { qty.value = (parseFloat(qty.value) || 1) + 0.5; recompute(); });
      qty?.addEventListener('input', recompute);
      modes.forEach(r => r.addEventListener('change', () => {
        document.querySelectorAll('.st-qo-radio').forEach(el => el.classList.remove('on'));
        r.closest('.st-qo-radio')?.classList.add('on');
        recompute();
      }));
      document.querySelector('[data-stock-qo-send]')?.addEventListener('click', () => {
        const expChecked = document.querySelector('[data-stock-qo-mode][value="express"]')?.checked;
        const supName = supSel?.value || sup;
        const when = expChecked ? `aujourd'hui 18h` : t('ramTomorrow') + ' 08h';
        closeTopModal();
        window.Kiwi.toast(t('mQoToast', supName, when), { type: 'success', duration: 4200 });
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * EXTRACTION & MATCHING FACTURES FOURNISSEUR
   * ═══════════════════════════════════════════════════════════════════════ */
  function normalizeMatchStr(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenizeMatchStr(s) {
    return normalizeMatchStr(s).split(' ').filter((w) => w.length >= 2);
  }

  function tokenOverlapScore(a, b) {
    const setA = new Set(tokenizeMatchStr(a));
    const setB = new Set(tokenizeMatchStr(b));
    if (!setA.size || !setB.size) return 0;
    let inter = 0;
    for (const t of setA) {
      if (setB.has(t)) inter++;
    }
    return inter / Math.max(setA.size, setB.size);
  }

  function matchInvoiceLines(lines, items) {
    const allItems = Array.isArray(items) ? items : [];
    return (lines || []).map((line) => {
      if (!line) return { itemId: null, confidence: 0 };

      // 1. EAN / Code-barres
      if (line.ean) {
        const eanHit = allItems.find((it) => it.barcode === line.ean || it.ean === line.ean);
        if (eanHit) return { itemId: eanHit.id, confidence: 1.0 };
      }

      // 2. Ref / SKU sur la carte fournisseur ou sur l'article
      if (line.ref) {
        const refHit = allItems.find((it) => {
          if (it.sku === line.ref) return true;
          const cards = Array.isArray(it.suppliers) ? it.suppliers : [];
          return cards.some((c) => c.ref === line.ref);
        });
        if (refHit) return { itemId: refHit.id, confidence: 0.95 };
      }

      // 3. Correspondance exacte du nom normalisé
      const normLabel = normalizeMatchStr(line.label);
      if (normLabel) {
        const exactHit = allItems.find((it) => normalizeMatchStr(it.name) === normLabel);
        if (exactHit) return { itemId: exactHit.id, confidence: 0.9 };
      }

      // 4. Chevauchement de jetons (seuil >= 0.6)
      let bestHit = null;
      let bestScore = 0;
      for (const it of allItems) {
        const score = tokenOverlapScore(line.label, it.name);
        if (score > bestScore) {
          bestScore = score;
          bestHit = it;
        }
      }
      if (bestScore >= 0.6 && bestHit) {
        return { itemId: bestHit.id, confidence: Math.round(bestScore * 100) / 100 };
      }

      return { itemId: null, confidence: 0 };
    });
  }

  function compareLineCost(item, invoicedCost, supplierName) {
    const invCostNum = Math.max(0, Number(invoicedCost) || 0);
    if (!item) {
      return {
        currentCost: 0,
        invoicedPerUnit: invCostNum,
        pct: 0,
        isRise: false,
        isDrop: false,
        isChecked: invCostNum > 0,
        factor: 1,
        card: null,
      };
    }

    const cards = Array.isArray(item.suppliers) ? item.suppliers : [];
    let card = null;
    if (supplierName) {
      card = cards.find((c) => String(c.supplierName || '').trim().toLowerCase() === String(supplierName).trim().toLowerCase());
    }
    if (!card) card = cards[0] || null;

    const factor = (card && Number.isFinite(+card.factor) && +card.factor > 0) ? +card.factor : 1;
    const current = (card && card.defaultPrice != null && Number.isFinite(+card.defaultPrice))
      ? +card.defaultPrice
      : (Number.isFinite(+item.costPerUnit) ? +item.costPerUnit : 0);

    // Facture en unité d'achat ramenée à l'unité de la carte
    const invoicedPerUnit = Math.round((invCostNum / factor) * 10000) / 10000;

    if (current <= 0) {
      return {
        currentCost: current,
        invoicedPerUnit,
        pct: 0,
        isRise: false,
        isDrop: false,
        isChecked: invoicedPerUnit > 0,
        factor,
        card,
      };
    }

    const diff = invoicedPerUnit - current;
    const pct = Math.round((diff / current) * 100);
    const isRise = diff > 0.001;
    const isDrop = diff < -0.001;
    const isChecked = isRise; // Coché par défaut uniquement en cas de hausse réelle

    return {
      currentCost: current,
      invoicedPerUnit,
      pct,
      isRise,
      isDrop,
      isChecked,
      factor,
      card,
    };
  }

  let _pdfjsPromise = null;
  function loadPdfJs() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new Error('no-dom'));
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (_pdfjsPromise) return _pdfjsPromise;
    _pdfjsPromise = new Promise((resolve, reject) => {
      if (typeof document.createElement !== 'function') {
        return resolve(window.pdfjsLib || null);
      }
      const script = document.createElement('script');
      script.src = 'assets/vendor/pdfjs/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          resolve(null);
        }
      };
      script.onerror = () => reject(new Error('Erreur de chargement pdf.js'));
      const target = document.head || document.body || document.documentElement;
      if (target && target.appendChild) target.appendChild(script);
      else resolve(null);
    });
    return _pdfjsPromise;
  }

  async function extractPdfText(file) {
    const pdfjs = await loadPdfJs();
    const ab = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: ab, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const maxPages = Math.min(pdf.numPages, 10);
    let fullText = '';
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = (content.items || []).map((it) => it.str);
      fullText += strings.join(' ') + '\n';
    }
    return fullText.trim();
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Scan invoice
   * ═══════════════════════════════════════════════════════════════════════ */
  function openInvoiceScan(opts) {
    // Pré-chargement discret en tâche de fond de pdf.js
    try { loadPdfJs(); } catch (_) {}

    const preSupId = typeof opts === 'string' ? opts : opts?.supplierId;
    const sup = preSupId ? getSup().find((s) => s.id === preSupId) : null;
    const m = window.Kiwi.modal({
      title: t('mScanTitle'),
      width: 720,
      body: `<div data-stock-scan-stage>${sup ? renderRealReceiptReview({ supplier: sup }) : renderScanStage1()}</div>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>`,
    });
    requestAnimationFrame(() => {
      wireDismiss(m?.el || topBackdrop());
      if (sup) {
        wireScanReview();
      } else {
        wireScanStage1();
      }
    });
  }

  function renderScanStage1() {
    return `
      <div class="st-dropzone" data-stock-dropzone>
        <input type="file" data-stock-file-input accept="application/pdf,image/*" style="display:none;" />
        <input type="file" data-stock-cam-input accept="image/*" capture="environment" style="display:none;" />
        <div class="st-dropzone-ico">${svg('upload', 26)}</div>
        <div class="st-dropzone-t">${esc(t('mScanDropT'))}</div>
        <div class="st-dropzone-s">${esc(t('mScanDropS'))}</div>
        <div class="st-dropzone-acts" style="display:flex;gap:10px;margin-top:12px;">
          <button class="st-btn" type="button" data-stock-pick-file>${esc(t('mScanBtnFile'))}</button>
          <button class="st-btn" type="button" data-stock-pick-cam>${svg('camera', 12)}<span>${esc(t('mScanBtnCam'))}</span></button>
        </div>
      </div>
      <div style="font-size:11.5px;color:var(--n-500,#6b7280);text-align:center;margin-top:8px;">
        ${esc(t('mScanServerNotice'))}
      </div>
      <div class="st-dropzone-link" data-stock-scan-manual style="text-align:center;margin-top:12px;cursor:pointer;color:var(--primary,#0070f3);font-size:13px;text-decoration:underline;">
        ${esc(t('mScanManual'))}
      </div>
    `;
  }

  function wireScanStage1() {
    const scope = topBackdrop() || document;
    const dropzone = scope.querySelector('[data-stock-dropzone]');
    const fileInp = scope.querySelector('[data-stock-file-input]');
    const camInp = scope.querySelector('[data-stock-cam-input]');
    const btnFile = scope.querySelector('[data-stock-pick-file]');
    const btnCam = scope.querySelector('[data-stock-pick-cam]');
    const linkManual = scope.querySelector('[data-stock-scan-manual]');
    const stage = scope.querySelector('[data-stock-scan-stage]');

    if (linkManual) {
      linkManual.onclick = () => {
        if (!stage) return;
        stage.innerHTML = renderRealReceiptReview({ supplier: null });
        wireScanReview();
      };
    }

    if (btnFile && fileInp) {
      btnFile.onclick = () => fileInp.click();
    }
    if (btnCam && camInp) {
      btnCam.onclick = () => camInp.click();
    }

    const processFile = async (file) => {
      if (!file || !stage) return;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      stage.innerHTML = `
        <div class="st-scanning" style="text-align:center;padding:40px 20px;">
          <div class="st-scanning-spinner" style="margin:0 auto 16px;"></div>
          <div class="st-scanning-t" style="font-weight:600;font-size:15px;margin-bottom:4px;">${esc(isPdf ? t('mScanReadingFile') : t('mScanReadingT'))}</div>
          <div class="st-scanning-s" style="font-size:12px;color:var(--n-500);">${esc(t('mScanReadingS'))}</div>
        </div>
      `;

      if (isPdf) {
        try {
          const text = await extractPdfText(file);
          if (!text) throw new Error('empty-text');

          const venue = (window.Kiwi && window.Kiwi.venue && window.Kiwi.venue()) || '';
          const res = await fetch('/api/ai/invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: venue, kind: 'text', text }),
          });

          if (!res.ok) {
            throw new Error('server-error-' + res.status);
          }
          const data = await res.json();
          if (data.ok && Array.isArray(data.lines) && data.lines.length) {
            stage.innerHTML = renderRealReceiptReview({ parsed: data });
            wireScanReview();
            return;
          }
          throw new Error(data.error || data.reason || 'unparsed');
        } catch (err) {
          window.Kiwi.toast?.(t('mScanFailFallback'), { type: 'warn' });
          stage.innerHTML = renderRealReceiptReview({ supplier: null });
          wireScanReview();
          return;
        }
      } else {
        // Image scan / photo — repli sur la table pour l'instant (Commit 1)
        setTimeout(() => {
          stage.innerHTML = renderRealReceiptReview({ supplier: null });
          wireScanReview();
        }, 800);
      }
    };

    if (fileInp) {
      fileInp.onchange = (e) => {
        if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
      };
    }
    if (camInp) {
      camInp.onchange = (e) => {
        if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
      };
    }

    if (dropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('is-dragover'); });
      });
      ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('is-dragover'); });
      });
      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt?.files;
        if (files && files[0]) processFile(files[0]);
      });
    }
  }

  function renderScanReview(opts) {
    if (stShowReal() || opts?.supplier) return renderRealReceiptReview(opts);
    const inv = getInv();
    const rows = [
      { id: 'inv01', name: 'Viande hachée bœuf', qty: 12, total: 1140 },
      { id: 'inv03', name: 'Agneau épaule', qty: 14, total: 2352 },
      { id: 'inv04', name: 'Merguez', qty: 4, total: 312 },
    ];
    return `
      <div class="st-mb-eyebrow">${esc(t('mScanReviewT'))}</div>
      <div class="st-mb-row three">
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanSupplier'))}</label><input class="st-mb-input" value="Boucherie Errazi" /></div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanDate'))}</label><input class="st-mb-input mono" value="14/05/2026" /></div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanNum'))}</label><input class="st-mb-input mono" value="FAC-2026-1842" /></div>
      </div>
      <table class="st-inv-items">
        <thead><tr><th>Article</th><th class="r">Qté</th><th>Unité</th><th class="r">Total</th></tr></thead>
        <tbody>
          ${rows.map((row) => {
            const item = inv.find((candidate) => candidate.id === row.id), unit = stockUnit(item?.unit || 'kg');
            return `<tr data-stock-scan-row="${esc(row.id)}"><td>${esc(item?.name || row.name)}</td><td class="r"><input class="st-pc-input mono" type="number" min="0" step="0.001" value="${row.qty}" data-stock-scan-qty /></td><td><select class="st-mb-input" data-stock-scan-unit>${stockUnitOptions(unit)}</select></td><td class="r mono">${esc(fmtMad(row.total))}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--n-600); padding:6px 0;">
        <span>${esc(t('mScanTva'))} : −20 % comprise</span>
      </div>
      <div class="st-inv-foot"><span>${esc(t('mScanTotal'))}</span><b>3 804 MAD</b></div>
      <div class="st-notice ok">${svg('checkCircle', 14)}<div><b>${esc(t('mScanOk'))}</b></div></div>
      <div class="st-notice warn">${svg('alertTriangle', 14)}<div><b>${esc(t('mScanWarn'))}</b></div></div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
        <button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>
        <button class="st-btn primary" data-stock-scan-confirm>${esc(t('mScanConfirm'))}</button>
      </div>
    `;
  }

  function renderRealReceiptReview(opts) {
    const preSupplier = opts?.supplier || null;
    const parsed = opts?.parsed || null;
    const allItems = getInv();
    let items = allItems;
    if (preSupplier) {
      const match = allItems.filter((it) => {
        const hasCard = (it.suppliers || []).some((card) =>
          String(card.supplierName || '').trim().toLowerCase() === preSupplier.name.toLowerCase() || card.id === preSupplier.id
        );
        return hasCard || (it.category === preSupplier.category) || (String(it.supplier || '').trim().toLowerCase() === preSupplier.name.toLowerCase());
      });
      if (match.length > 0) items = match;
    }

    const supName = parsed?.supplier?.name || preSupplier?.name || '';
    const today = new Date().toISOString().slice(0, 10);
    const invoiceDate = parsed?.date || today;
    const invoiceNum = parsed?.number || '';

    const matches = parsed?.lines ? matchInvoiceLines(parsed.lines, items) : [];

    const makeRow = (line, matchHit) => {
      const matchedId = matchHit?.itemId || '';
      const matchedItem = matchedId ? items.find((it) => it.id === matchedId) : null;

      const lineQty = line ? line.qty : '';
      const lineCost = line ? line.unitCost : '';

      const comparison = compareLineCost(matchedItem, lineCost, supName);
      const isChecked = comparison.isChecked;

      let badgeHtml = '';
      if (matchedItem && comparison.currentCost > 0 && Number.isFinite(lineCost) && lineCost > 0) {
        if (comparison.isRise) {
          badgeHtml = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:var(--warn-bg,#fffbeb);color:var(--warn-fg,#b45309);margin-right:6px;">↑ +${comparison.pct}%</span>`;
        } else if (comparison.isDrop) {
          badgeHtml = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:var(--ok-bg,#ecfdf5);color:var(--ok-fg,#047857);margin-right:6px;">↓ −${Math.abs(comparison.pct)}%</span>`;
        }
      }

      const optionsHtml = `<option value="">${esc(t('mScanChoose'))}</option>` + items.map((it) => {
        const isSel = it.id === matchedId;
        const card = (it.suppliers || []).find((c) =>
          preSupplier && (String(c.supplierName || '').trim().toLowerCase() === preSupplier.name.toLowerCase() || c.id === preSupplier.id)
        );
        const defaultCost = card?.defaultPrice ?? it.costPerUnit ?? 0;
        return `<option value="${esc(it.id)}" data-default-cost="${defaultCost}" ${isSel ? 'selected' : ''}>${esc(it.name)} (${esc(it.unit || 'unité')})</option>`;
      }).join('');

      return `
        <tr data-stock-receive-row>
          <td style="min-width:180px;">
            <div style="font-size:12px;font-weight:500;margin-bottom:3px;color:var(--n-800);">${line ? esc(line.label) : ''}</div>
            <select class="st-mb-input" data-stock-receive-item style="width:100%;font-size:12px;">${optionsHtml}</select>
          </td>
          <td class="r" style="width:90px;">
            <input class="st-mb-input mono" data-stock-receive-qty type="number" min="0" step="0.001" placeholder="0" value="${lineQty}" style="font-size:12px;" />
          </td>
          <td class="r" style="width:100px;">
            <input class="st-mb-input mono" data-stock-receive-cost type="number" min="0" step="0.01" placeholder="0.00" value="${lineCost}" style="font-size:12px;" />
          </td>
          <td class="r mono" data-stock-receive-ref-cost style="width:90px;font-size:12px;color:var(--n-600);">
            ${comparison.currentCost > 0 ? fmtMad(comparison.currentCost) : '—'}
          </td>
          <td style="min-width:170px;font-size:12px;">
            <div style="display:flex;align-items:center;">
              <span data-stock-receive-badge>${badgeHtml}</span>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11.5px;color:var(--n-700);">
                <input type="checkbox" data-stock-receive-update-cost ${isChecked ? 'checked' : ''} />
                <span>${esc(t('mScanUpdateCost'))}</span>
              </label>
            </div>
          </td>
          <td class="r" style="width:30px;">
            <button class="st-btn" type="button" data-stock-receive-remove aria-label="${esc(t('mScanIgnore'))}" style="padding:4px 8px;font-size:12px;">×</button>
          </td>
        </tr>`;
    };

    let rowsHtml = '';
    if (parsed?.lines?.length) {
      rowsHtml = parsed.lines.map((l, i) => makeRow(l, matches[i])).join('');
    } else {
      rowsHtml = makeRow(null, null) + makeRow(null, null) + makeRow(null, null);
    }

    const supInputHtml = preSupplier
      ? `<input class="st-mb-input" data-stock-receive-supplier value="${esc(preSupplier.name)}" readonly style="background:var(--n-100,#f4f5f6); cursor:not-allowed;" />`
      : `<input class="st-mb-input" data-stock-receive-supplier autocomplete="organization" placeholder="Nom du fournisseur" value="${esc(supName)}" />`;

    return `
      <div class="st-mb-eyebrow">${parsed ? esc(t('mScanReviewT')) : 'Réception fournisseur'}</div>
      <div class="st-notice ok">${svg('checkCircle', 14)}<div>Le document reste à vérifier : les prix et quantités sont pré-remplis pour vérification humaine.</div></div>
      <div class="st-mb-row three" style="margin-top:12px;">
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanSupplier'))}</label>${supInputHtml}</div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanDate'))}</label><input class="st-mb-input mono" data-stock-receive-date type="date" value="${invoiceDate}" /></div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanNum'))}</label><input class="st-mb-input mono" data-stock-receive-ref placeholder="BL / facture" value="${esc(invoiceNum)}" /></div>
      </div>
      <div style="overflow-x:auto;max-height:360px;margin-top:12px;border:1px solid var(--n-200,#e5e7eb);border-radius:6px;">
        <table class="st-inv-items" style="margin:0;width:100%;">
          <thead>
            <tr>
              <th>Article reçu</th>
              <th class="r">Quantité</th>
              <th class="r">${esc(t('mScanColInvoicedCost'))} MAD</th>
              <th class="r">${esc(t('mScanColCurrentCost'))}</th>
              <th>Évolution & MAJ</th>
              <th></th>
            </tr>
          </thead>
          <tbody data-stock-receive-rows>${rowsHtml}</tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <button class="st-btn" type="button" data-stock-receive-add>+ Ajouter une ligne</button>
        <div class="st-inv-foot" style="margin:0;padding:0;border:none;"><span>Total document</span><b data-stock-receive-total>0,00 MAD</b></div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
        <button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>
        <button class="st-btn primary" data-stock-scan-confirm>Enregistrer la réception</button>
      </div>`;
  }

  function wireScanReview() {
    const scope = topBackdrop() || document;
    const tbody = scope.querySelector('[data-stock-receive-rows]');
    const allItems = getInv();

    const recompute = () => {
      let total = 0;
      const supInput = scope.querySelector('[data-stock-receive-supplier]');
      const currentSup = supInput ? supInput.value.trim() : '';

      scope.querySelectorAll('[data-stock-receive-row]').forEach((row) => {
        const qty = Math.max(0, +(row.querySelector('[data-stock-receive-qty]')?.value || 0));
        const cost = Math.max(0, +(row.querySelector('[data-stock-receive-cost]')?.value || 0));
        total += qty * cost;

        const sel = row.querySelector('[data-stock-receive-item]');
        const itemId = sel ? sel.value : '';
        const item = itemId ? allItems.find((candidate) => candidate.id === itemId) : null;

        const comp = compareLineCost(item, cost, currentSup);
        const refCostEl = row.querySelector('[data-stock-receive-ref-cost]');
        if (refCostEl) {
          refCostEl.textContent = comp.currentCost > 0 ? fmtMad(comp.currentCost) : '—';
        }

        const cb = row.querySelector('[data-stock-receive-update-cost]');
        if (cb && cb.dataset.userSet !== '1') {
          cb.checked = !!(item && comp.currentCost > 0 && cost > 0 && comp.isRise);
        }

        const badgeSpan = row.querySelector('[data-stock-receive-badge]');
        if (badgeSpan) {
          if (item && comp.currentCost > 0 && cost > 0) {
            if (comp.isRise) {
              badgeSpan.innerHTML = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:var(--warn-bg,#fffbeb);color:var(--warn-fg,#b45309);margin-right:6px;">↑ +${comp.pct}%</span>`;
            } else if (comp.isDrop) {
              badgeSpan.innerHTML = `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:var(--ok-bg,#ecfdf5);color:var(--ok-fg,#047857);margin-right:6px;">↓ −${Math.abs(comp.pct)}%</span>`;
            } else {
              badgeSpan.innerHTML = '';
            }
          } else {
            badgeSpan.innerHTML = '';
          }
        }
      });

      const out = scope.querySelector('[data-stock-receive-total]');
      if (out) out.textContent = fmtMad(total);
    };

    const wireRows = () => {
      scope.querySelectorAll('[data-stock-receive-qty],[data-stock-receive-cost]').forEach((el) => {
        el.oninput = recompute;
      });
      scope.querySelectorAll('[data-stock-receive-update-cost]').forEach((cb) => {
        cb.onchange = () => {
          cb.dataset.userSet = '1';
        };
      });
      scope.querySelectorAll('[data-stock-receive-item]').forEach((sel) => {
        sel.onchange = () => {
          const row = sel.closest('tr');
          const cb = row?.querySelector('[data-stock-receive-update-cost]');
          if (cb) delete cb.dataset.userSet;
          const costInp = row?.querySelector('[data-stock-receive-cost]');
          const itemId = sel.value;
          const it = itemId ? allItems.find((candidate) => candidate.id === itemId) : null;
          if (it && costInp && !costInp.value) {
            const comp = compareLineCost(it, 0, scope.querySelector('[data-stock-receive-supplier]')?.value);
            if (comp.currentCost > 0) costInp.value = comp.currentCost;
          }
          recompute();
        };
      });
      scope.querySelectorAll('[data-stock-receive-remove]').forEach((el) => {
        el.onclick = () => {
          if (scope.querySelectorAll('[data-stock-receive-row]').length > 1) {
            el.closest('tr')?.remove();
          }
          recompute();
        };
      });
    };

    scope.querySelector('[data-stock-receive-add]')?.addEventListener('click', () => {
      const optionsHtml = `<option value="">${esc(t('mScanChoose'))}</option>` + allItems.map((it) => `<option value="${esc(it.id)}">${esc(it.name)} (${esc(it.unit || 'unité')})</option>`).join('');
      const emptyRowHtml = `
        <tr data-stock-receive-row>
          <td style="min-width:180px;">
            <select class="st-mb-input" data-stock-receive-item style="width:100%;font-size:12px;">${optionsHtml}</select>
          </td>
          <td class="r" style="width:90px;">
            <input class="st-mb-input mono" data-stock-receive-qty type="number" min="0" step="0.001" placeholder="0" style="font-size:12px;" />
          </td>
          <td class="r" style="width:100px;">
            <input class="st-mb-input mono" data-stock-receive-cost type="number" min="0" step="0.01" placeholder="0.00" style="font-size:12px;" />
          </td>
          <td class="r mono" data-stock-receive-ref-cost style="width:90px;font-size:12px;color:var(--n-600);">—</td>
          <td style="min-width:170px;font-size:12px;">
            <div style="display:flex;align-items:center;">
              <span data-stock-receive-badge></span>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11.5px;color:var(--n-700);">
                <input type="checkbox" data-stock-receive-update-cost />
                <span>${esc(t('mScanUpdateCost'))}</span>
              </label>
            </div>
          </td>
          <td class="r" style="width:30px;">
            <button class="st-btn" type="button" data-stock-receive-remove aria-label="${esc(t('mScanIgnore'))}" style="padding:4px 8px;font-size:12px;">×</button>
          </td>
        </tr>`;
      tbody?.insertAdjacentHTML('beforeend', emptyRowHtml);
      wireRows();
      recompute();
    });

    wireRows();
    recompute();

    scope.querySelector('[data-stock-scan-confirm]')?.addEventListener('click', () => {
      const supplier = scope.querySelector('[data-stock-receive-supplier]')?.value.trim() || '';
      const externalRef = scope.querySelector('[data-stock-receive-ref]')?.value.trim() || '';
      const date = scope.querySelector('[data-stock-receive-date]')?.value || '';

      const lines = Array.from(scope.querySelectorAll('[data-stock-receive-row]')).map((row) => ({
        itemId: row.querySelector('[data-stock-receive-item]')?.value || '',
        qty: Math.max(0, +(row.querySelector('[data-stock-receive-qty]')?.value || 0)),
        cost: Math.max(0, +(row.querySelector('[data-stock-receive-cost]')?.value || 0)),
        updateCost: !!row.querySelector('[data-stock-receive-update-cost]')?.checked,
      })).filter((line) => line.itemId && line.qty > 0);

      if (!supplier || !lines.length) {
        window.Kiwi.toast?.('Indiquez le fournisseur et au moins une ligne reçue.', { type: 'warning' });
        return;
      }

      const receiptRef = 'receipt-' + Date.now().toString(36);
      const receivedAt = date ? new Date(`${date}T12:00:00`).getTime() : Date.now();
      const inv = getInv();

      const receivingLines = lines.map((line) => {
        const it = inv.find((x) => x.id === line.itemId);
        return {
          itemId: line.itemId,
          name: it?.name || line.itemId,
          qty: line.qty,
          unit: it?.unit || 'unité',
          unitCost: line.cost,
        };
      });

      if (window.KiwiProcurement?.receiveDirect) {
        let known = window.KiwiProcurement.doc()?.suppliers?.find((s) => String(s.name || '').toLowerCase() === supplier.toLowerCase());
        if (!known) known = window.KiwiProcurement.addSupplier({ name: supplier });
        window.KiwiProcurement.receiveDirect({
          supplierId: known?.id || supplier,
          externalRef,
          receivedAt,
          lines: receivingLines,
        });
        if (window.KiwiProcurement?.attachInvoice) {
          try {
            window.KiwiProcurement.attachInvoice({
              supplierId: known?.id || supplier,
              number: externalRef,
              date,
              receiptId: receiptRef,
              lines: receivingLines,
              source: 'pdf',
            });
          } catch (_) {}
        }
      }

      // Toujours enregistrer les mouvements dans KiwiInventory / moveStock et MAJ conditionnelle des cartes fournisseur
      lines.forEach((line) => {
        const it = inv.find((x) => x.id === line.itemId);
        if (!it) return;

        let supRank = 1;
        let supId = 'sup-' + Date.now().toString(36);

        if (stShowReal()) {
          const ov = stItemOverrides[it.id] || {};
          const cards = Array.isArray(it.suppliers) ? it.suppliers.slice() : [];
          let existing = cards.find((s) => String(s.supplierName || '').trim().toLowerCase() === supplier.toLowerCase());

          if (!existing) {
            supRank = cards.length + 1;
            existing = {
              id: supId,
              supplierName: supplier,
              defaultPrice: line.cost || +it.costPerUnit || 0,
              purchaseUnit: it.unit || 'unité',
              factor: 1,
              rank: supRank,
            };
            if (line.updateCost) {
              cards.push(existing);
            }
          } else {
            supId = existing.id;
            supRank = existing.rank || 1;
            // MISE À JOUR DE defaultPrice SEULEMENT SI LA CASE EST COCHÉE
            if (line.updateCost && line.cost > 0) {
              const factor = (Number.isFinite(+existing.factor) && +existing.factor > 0) ? +existing.factor : 1;
              existing.defaultPrice = Math.round((line.cost / factor) * 100) / 100;
            }
          }
          if (cards.length > 0) {
            ov.suppliers = cards;
            ov.updatedAt = Date.now();
            stItemOverrides[it.id] = ov;
          }
        }

        // moveStock enregistre TOUJOURS le coût réel facturé pour l'historique d'achat
        moveStock(it, line.qty, 'receipt', 'receipt', receiptRef,
          [supplier, externalRef, date].filter(Boolean).join(' · '), line.cost || null, {
            supplierId: supId,
            supplierName: supplier,
            externalRef,
            receiptRef,
            receivedAt,
            rank: supRank,
          });

        if (line.updateCost && line.cost > 0 && window.KiwiCost?.setItemCost) {
          window.KiwiCost.setItemCost(it.id, line.cost, supplier);
        }
      });

      stSaveOverlay();
      closeTopModal();
      window.Kiwi.toast?.(`${lines.length} ligne${lines.length > 1 ? 's' : ''} reçue${lines.length > 1 ? 's' : ''} et ajoutée${lines.length > 1 ? 's' : ''} au stock.`, { type: 'success', duration: 3800 });
      if (stPageActive) render();
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Physical count
   * ═══════════════════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════════════════
   * Guide d'inventaire — cause probable, historique, feuille imprimable
   * ═══════════════════════════════════════════════════════════════════════ */
  /* Cause probable d'un écart de comptage. Fonction pure : l'ordre des règles
   * est un choix métier — un signal enregistré (pertes déclarées, livraison
   * récente) explique mieux qu'une heuristique de catégorie, donc il passe
   * avant. `moves` vient du registre (7 derniers jours, hors 'count'). */
  function stCountReason(ctx) {
    const diff = +ctx.diff || 0;
    if (!diff) return '';
    const expected = +ctx.expected || 0;
    const counted = +ctx.counted || 0;
    const theoUsage = +ctx.theoUsage || 0;
    const moves = Array.isArray(ctx.moves) ? ctx.moves : [];
    const now = +ctx.now || Date.now();
    if (counted === 0 && expected > 0) return 'reasonZero';
    if (diff > 0 && expected > 0 && counted >= expected * 20) return 'reasonUnit';
    if (diff < 0) {
      if (moves.some((m) => m && m.reason === 'waste')) return 'reasonWaste';
      if (theoUsage > 0 && Math.abs(diff) <= theoUsage * 1.25) return 'reasonRecipes';
      if (['viandes', 'poissons', 'legumes', 'laitiers'].indexOf(String(ctx.cat)) !== -1) return 'reasonPerish';
      return 'reasonLoss';
    }
    if (moves.some((m) => m && +m.qty > 0 && /receipt|procurement|delivery|invoice/.test(String(m.refType || '')) && now - (+m.occurredTs || 0) < 48 * 3600 * 1000)) return 'reasonDeliv';
    return 'reasonExtra';
  }
  /* Mouvements récents d'un article, pour nourrir stCountReason. Registre réel
   * uniquement : les fixtures démo n'ont pas d'historique de mouvements. */
  function stRecentMoves(itemId) {
    try {
      const L = window.KiwiInventory;
      if (!L || !L.isReal || !L.isReal()) return [];
      const since = Date.now() - 7 * 24 * 3600 * 1000;
      return (L.history(itemId) || []).filter((m) => (+m.occurredTs || 0) >= since && m.reason !== 'count');
    } catch (_) { return []; }
  }
  /* Historique des inventaires validés — même portée tenant que l'overlay
   * stock (compte réel = slug cloud, sinon venue id). Plafonné : c'est un
   * journal de tendance, pas une base ; le registre reste la vérité. */
  const stCountHistKey = () => 'kiwi:inventoryCounts:v1:' + stOverlayScope();
  function stCountHistory() {
    try {
      const a = JSON.parse(localStorage.getItem(stCountHistKey()) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }
  function stSaveCountHistory(ref, lines) {
    const gaps = lines.filter((l) => l.diff);
    const entry = {
      ref: String(ref), ts: Date.now(), counted: lines.length,
      varMad: Math.round(gaps.reduce((s, l) => s + (+l.costDiff || 0), 0)),
      gaps: gaps.slice(0, 200).map((l) => ({
        id: l.it.id, name: l.it.name, unit: l.it.unit,
        theo: l.theo, counted: l.counted, diff: l.diff,
        mad: Math.round(+l.costDiff || 0), reason: l.reasonKey || '',
      })),
    };
    try { localStorage.setItem(stCountHistKey(), JSON.stringify([entry, ...stCountHistory()].slice(0, 24))); } catch (_) {}
    return entry;
  }
  const stCountDate = (ts) => {
    try {
      const loc = lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-FR';
      return new Date(ts).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) { return new Date(ts).toLocaleDateString(); }
  };

  /* Feuille d'inventaire papier. À l'aveugle par défaut : sans la colonne
   * théorique, le compteur note ce qu'il voit au lieu de confirmer le chiffre
   * attendu. Impression via iframe caché (même motif qu'operational-print). */
  function stSheetHtml(showTheo) {
    const items = getInv();
    const cats = allCategories();
    const catName = (id) => { const c = cats.find((x) => x.id === id); return c ? c.label : id; };
    const groups = new Map();
    items.forEach((it) => {
      const id = String(it.category || it.cat || 'epicerie');
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(it);
    });
    let venueName = '';
    try { venueName = window.KiwiVenue?.getCurrentVenueData?.()?.name || ''; } catch (_) {}
    const last = stCountHistory()[0];
    const rtl = lang() === 'ar';
    const sections = Array.from(groups.entries()).map(([id, rows]) => `
      <section>
        <h2>${esc(catName(id))}</h2>
        <table>
          <thead><tr><th class="w-name">${esc(t('sheetColItem'))}</th><th>${esc(t('sheetColUnit'))}</th>${showTheo ? `<th>${esc(t('mCountColTheo'))}</th>` : ''}<th class="w-count">${esc(t('mCountColReal'))}</th><th class="w-note">${esc(t('sheetColNotes'))}</th></tr></thead>
          <tbody>${rows.map((it) => `<tr><td class="w-name">${esc(it.name)}</td><td>${esc(it.unit)}</td>${showTheo ? `<td class="mono">${esc(fmtUnit(currentStockFor(it), it.unit))}</td>` : ''}<td class="w-count"></td><td class="w-note"></td></tr>`).join('')}</tbody>
        </table>
      </section>`).join('');
    return `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(t('mSheetTitle'))}</title><style>
      @page { margin: 12mm; }
      html, body { background: #fff; color: #0A0F0D; color-scheme: light; }
      body { margin: 0; font: 12px/1.5 Arial, sans-serif; }
      header { border-bottom: 2px solid #0B6E4F; padding-bottom: 10px; }
      header h1 { margin: 0; font-size: 20px; }
      header p { margin: 3px 0 0; color: #555; }
      .meta { display: flex; gap: 26px; margin: 12px 0 4px; font-size: 12px; }
      .meta span { display: inline-block; border-bottom: 1px solid #999; min-width: 150px; padding: 0 4px 2px; }
      section { break-inside: avoid-page; }
      h2 { font-size: 13px; margin: 16px 0 6px; color: #0B6E4F; text-transform: uppercase; letter-spacing: 0.06em; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: ${rtl ? 'right' : 'left'}; font-size: 11.5px; }
      th { background: #F7F5F0; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.05em; color: #444; }
      td { height: 18px; }
      .w-count { width: 110px; } .w-note { width: 170px; } .mono { font-family: monospace; }
      footer { margin-top: 18px; font-size: 10.5px; color: #666; }
    </style></head><body>
      <header>
        <h1>${esc(t('mSheetTitle'))}${venueName ? ' — ' + esc(venueName) : ''}</h1>
        <p>${esc(stCountDate(Date.now()))}${last ? ' · ' + esc(t('mCountLast', stCountDate(last.ts), fmtMad(last.varMad))) : ''}</p>
      </header>
      <div class="meta">
        <div>${esc(t('sheetCounter'))} : <span>&nbsp;</span></div>
        <div>${esc(t('sheetSign'))} : <span>&nbsp;</span></div>
      </div>
      ${sections}
      <footer>${esc(t('sheetFoot'))}</footer>
    </body></html>`;
  }
  function printCountSheet(showTheo) {
    const frame = document.createElement('iframe');
    frame.setAttribute('title', t('mSheetTitle'));
    frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;opacity:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open(); doc.write(stSheetHtml(showTheo)); doc.close();
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) {}
      setTimeout(() => frame.remove(), 1500);
    }, 120);
  }
  function openCountSheet() {
    const n = getInv().length;
    const m = window.Kiwi.modal({
      title: t('mSheetTitle'),
      desc: t('mSheetSub'),
      width: 520,
      body: `
        <label class="st-pc-blindrow">
          <input type="checkbox" data-sheet-theo />
          <span><b>${esc(t('mSheetTheo'))}</b> · ${esc(t('mSheetTheoTip'))}</span>
        </label>
        <p style="font-size:12px;color:var(--n-600);margin:10px 2px 0;">${esc(t('mSheetCount', n))}</p>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(t('mRevBack'))}</button><button class="st-btn primary" data-stock-sheet-print>${esc(t('mSheetPrint'))}</button>`,
    });
    requestAnimationFrame(() => {
      const scope = m?.el || topBackdrop();
      wireDismiss(scope);
      scope?.querySelector('[data-stock-sheet-print]')?.addEventListener('click', () => {
        printCountSheet(!!scope.querySelector('[data-sheet-theo]')?.checked);
        closeTopModal();
      }, { once: true });
    });
  }
  /* Revue des écarts avant application. Seul chemin d'écriture : countStock →
   * moveStock → registre. Rien ne bouge tant que le propriétaire n'a pas vu
   * chaque écart, sa valeur en MAD et sa cause probable. */
  function openCountReview(lines, countBack) {
    const countRef = 'count-' + Date.now().toString(36);
    const gaps = lines.filter((l) => l.diff);
    gaps.forEach((l) => {
      l.reasonKey = stCountReason({
        diff: l.diff, expected: l.theo, counted: l.counted,
        cat: String(l.it.category || l.it.cat || ''),
        theoUsage: theoreticalUsageFor(l.it),
        moves: stRecentMoves(l.it.id),
      });
    });
    const totalVar = gaps.reduce((s, l) => s + l.costDiff, 0);
    const m = window.Kiwi.modal({
      title: t('mRevTitle'),
      desc: t('mRevSub', lines.length),
      width: 860,
      body: gaps.length ? `
        <div class="st-pc-wrap">
          <table class="st-pc-tbl">
            <thead><tr>
              <th>${esc(t('colArticle'))}</th>
              <th class="r">${esc(t('mCountColTheo'))}</th>
              <th class="r">${esc(t('mCountColReal'))}</th>
              <th class="r">${esc(t('mCountColVar'))}</th>
              <th class="r">${esc(t('mCountColCost'))}</th>
              <th>${esc(t('mRevColReason'))}</th>
            </tr></thead>
            <tbody>
              ${gaps.map((l) => {
                const pct = l.theo > 0 ? Math.abs(l.diff / l.theo) * 100 : 100;
                const cls = pct < 2 ? 'ok' : pct < 10 ? 'warn' : 'bad';
                return `<tr>
                  <td><b>${esc(l.it.name)}</b> <span style="color:var(--n-500); font-size:11px;">· ${esc(l.it.unit)}</span></td>
                  <td class="r mono">${esc(fmtUnit(l.theo, l.it.unit))}</td>
                  <td class="r mono">${esc(fmtUnit(l.counted, l.it.unit))}</td>
                  <td class="r"><span class="st-pc-var ${cls}">${l.diff > 0 ? '+' : ''}${fmtNum(l.diff, Math.abs(l.diff) < 10 ? 1 : 0)} ${esc(l.it.unit)}</span></td>
                  <td class="r"><span class="st-pc-var ${cls}">${l.costDiff > 0 ? '+' : ''}${esc(fmtMad(l.costDiff))}</span></td>
                  <td class="st-rev-reason">${esc(t(l.reasonKey))}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="st-pc-prog"><span class="st-pc-prog-l">${esc(t('mRevTotal', gaps.length, fmtMad(totalVar)))}</span></div>
      ` : `<div class="st-notice"><b>${esc(t('mRevNoneT'))}</b>${esc(t('mRevNone'))}</div>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(t('mRevBack'))}</button><button class="st-btn primary" data-stock-rev-apply>${esc(t('mRevApply'))}</button>`,
    });
    requestAnimationFrame(() => {
      const scope = m?.el || topBackdrop();
      wireDismiss(scope);
      scope?.querySelector('[data-stock-rev-apply]')?.addEventListener('click', () => {
        lines.forEach((l) => countStock(l.it, l.counted, countRef));
        stSaveOverlay();
        stSaveCountHistory(countRef, lines);
        closeTopModal();
        try { countBack?.querySelector('.kiwi-modal-close')?.click(); } catch (_) {}
        window.Kiwi.toast(t('mCountToast', fmtMad(totalVar)), { type: 'success', duration: 4200 });
        if (stPageActive) render();
      }, { once: true });
    });
  }

  function openPhysicalCount() {
    const items = getInv();
    const last = stCountHistory()[0];
    const m = window.Kiwi.modal({
      title: t('mCountTitle'),
      desc: (last ? t('mCountLast', stCountDate(last.ts), fmtMad(last.varMad)) + ' — ' : '') + t('mCountSub'),
      width: 760,
      body: `
        <label class="st-pc-blindrow">
          <input type="checkbox" data-pc-blind checked />
          <span><b>${esc(t('mCountBlind'))}</b> · ${esc(t('mCountBlindTip'))}</span>
        </label>
        <div class="st-pc-wrap st-pc-blind">
          <table class="st-pc-tbl">
            <thead>
              <tr>
                <th>${esc(t('colArticle'))}</th>
                <th class="r">${esc(t('mCountColTheo'))}</th>
                <th class="r">${esc(t('mCountColReal'))}</th>
                <th class="r">${esc(t('mCountColVar'))}</th>
                <th class="r">${esc(t('mCountColCost'))}</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => {
                const cur = currentStockFor(it);
                return `
                  <tr data-stock-pc-row="${esc(it.id)}">
                    <td><b>${esc(it.name)}</b> <span style="color:var(--n-500); font-size:11px;">· ${esc(it.unit)}</span></td>
                    <td class="r mono"><span data-pc-theo>${esc(fmtUnit(cur, it.unit))}</span></td>
                    <td class="r"><input class="st-pc-input" type="number" step="0.1" min="0" placeholder="—" data-pc-real="${esc(it.id)}" data-pc-theo-val="${cur}" data-pc-cost="${it.costPerUnit}" data-pc-unit="${esc(it.unit)}" /></td>
                    <td class="r"><span class="st-pc-var" data-pc-var>—</span></td>
                    <td class="r"><span class="st-pc-var" data-pc-cost-out>—</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="st-pc-prog">
          <div class="st-pc-prog-bar"><div class="st-pc-prog-fill" data-pc-prog></div></div>
          <span class="st-pc-prog-l" data-pc-prog-l>${esc(t('mCountProg', 0, items.length))}</span>
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(t('mCountSave'))}</button><button class="st-btn primary" data-stock-pc-validate disabled>${esc(t('mCountValidate'))}</button>`,
    });
    requestAnimationFrame(() => { wireDismiss(m?.el || topBackdrop()); wirePhysicalCount(items); });
  }

  function wirePhysicalCount(items) {
    const recomputeProgress = () => {
      const inputs = document.querySelectorAll('[data-pc-real]');
      let counted = 0;
      inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val) && inp.value !== '') {
          counted++;
          const theo = parseFloat(inp.dataset.pcTheoVal);
          const cost = parseFloat(inp.dataset.pcCost);
          const unit = inp.dataset.pcUnit;
          const diff = val - theo;
          const costDiff = diff * cost;
          const varCell = inp.closest('tr').querySelector('[data-pc-var]');
          const costCell = inp.closest('tr').querySelector('[data-pc-cost-out]');
          const absDiff = Math.abs(diff);
          const pctDiff = theo > 0 ? Math.abs(diff / theo) * 100 : 0;
          const cls = pctDiff < 2 ? 'ok' : pctDiff < 10 ? 'warn' : 'bad';
          varCell.className = `st-pc-var ${cls}`;
          varCell.textContent = `${diff > 0 ? '+' : ''}${fmtNum(diff, Math.abs(diff) < 10 ? 1 : 0)} ${unit}`;
          costCell.className = `st-pc-var ${cls}`;
          costCell.textContent = `${costDiff > 0 ? '+' : ''}${fmtMad(costDiff)}`;
        } else {
          const tr = inp.closest('tr');
          tr.querySelector('[data-pc-var]').textContent = '—';
          tr.querySelector('[data-pc-var]').className = 'st-pc-var';
          tr.querySelector('[data-pc-cost-out]').textContent = '—';
          tr.querySelector('[data-pc-cost-out]').className = 'st-pc-var';
        }
      });
      const fill = document.querySelector('[data-pc-prog]');
      const lbl = document.querySelector('[data-pc-prog-l]');
      const validateBtn = document.querySelector('[data-stock-pc-validate]');
      if (fill) fill.style.width = `${(counted / items.length) * 100}%`;
      if (lbl) lbl.textContent = t('mCountProg', counted, items.length);
      if (validateBtn) {
        if (counted === items.length) validateBtn.removeAttribute('disabled');
        else validateBtn.setAttribute('disabled', '');
      }
    };
    document.querySelectorAll('[data-pc-real]').forEach(inp => inp.addEventListener('input', recomputeProgress));
    /* À l'aveugle par défaut : les colonnes théorique / écart / valeur restent
     * masquées pendant la saisie (CSS), le propriétaire peut les révéler. */
    const blindBox = document.querySelector('[data-pc-blind]');
    blindBox?.addEventListener('change', () => {
      document.querySelector('.st-pc-wrap')?.classList.toggle('st-pc-blind', blindBox.checked);
    });
    /* Valider n'écrit plus directement : on passe par la revue des écarts
     * (cause probable + valeur MAD), qui seule applique via countStock. */
    document.querySelector('[data-stock-pc-validate]')?.addEventListener('click', () => {
      const lines = [];
      document.querySelectorAll('[data-pc-real]').forEach(inp => {
        const v = parseFloat(inp.value);
        const it = items.find((x) => x.id === inp.dataset.pcReal);
        if (isNaN(v) || inp.value === '' || !it) return;
        const theo = parseFloat(inp.dataset.pcTheoVal) || 0;
        const diff = Math.round((v - theo) * 1000) / 1000;
        lines.push({ it, theo, counted: v, diff, costDiff: diff * (+it.costPerUnit || 0) });
      });
      /* La revue s'empile SUR la grille de comptage : Annuler doit rendre les
       * 40 saisies intactes (corriger une erreur d'unité), pas une page vide. */
      openCountReview(lines, topBackdrop());
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Supplier profile
   * ═══════════════════════════════════════════════════════════════════════ */
  function openSupplierProfile(supplierId) {
    const s = getSup().find(x => x.id === supplierId);
    if (!s) return;
    const deliveriesCount = Math.round(s.monthlySpend / s.avgInvoice);
    const pcl = s.priceChangeLast30d;
    const rateStr = s.rating != null && !isNaN(s.rating) && s.rating !== '' ? ` · ★ ${Number(s.rating).toFixed(1)}` : '';
    const m = window.Kiwi.modal({
      title: s.name,
      desc: `${esc(s.location)} · ${catLabel(s.category)}${rateStr}`,
      width: 720,
      body: `
        <div class="st-md-stats">
          <div class="st-md-stat"><div class="l">DÉPENSE / MOIS</div><div class="v">${esc(fmtMad(s.monthlySpend))}</div></div>
          <div class="st-md-stat"><div class="l">LIVRAISONS / MOIS</div><div class="v">${deliveriesCount}</div></div>
          <div class="st-md-stat"><div class="l">PRIX 30J</div><div class="v ${trendCls}">${esc(fmtPct(pcl, 1))}</div></div>
        </div>
        <div class="st-md-section">
          <div class="st-md-section-t">${esc(t('mSupHistory'))}</div>
          <div class="st-md-list">
            ${[
              { d: '2026-05-14', t: 'Livraison · 12 kg viande hachée · 4 kg merguez', v: 1452, status: 'ok' },
              { d: '2026-05-10', t: 'Livraison · 18 kg agneau · 14 kg poulet', v: 3752, status: 'ok' },
              { d: '2026-05-07', t: 'Livraison · 8 kg merguez · 14 kg viande', v: 1956, status: 'ok' },
              { d: '2026-05-03', t: 'Livraison partielle · poulet manquant', v: 2240, status: 'warn' },
              { d: '2026-04-30', t: 'Livraison · 16 kg agneau · 10 kg poulet', v: 3208, status: 'ok' },
              { d: '2026-04-26', t: 'Livraison · ensemble standard', v: 3640, status: 'ok' },
            ].map(h => `
              <div class="st-md-list-row">
                <div><span class="d">${esc(fmtDateShort(h.d))}</span> · <span class="n">${esc(h.t)}</span></div>
                <div class="v">${esc(fmtMad(h.v))}</div>
                <div class="status-${h.status === 'ok' ? 'ok' : 'warn'}">${esc(h.status === 'ok' ? t('stReceived') : t('stPartial'))}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="st-md-section">
          <div class="st-md-section-t">${esc(t('mSupPrices'))}</div>
          ${renderMiniPriceChart(ph)}
        </div>
      `,
      foot: `
        <button class="st-btn" data-action="stock-call-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}">${svg('phone', 12)}<span>${esc(t('mSupCall'))}</span></button>
        <button class="st-btn" data-action="stock-wa-supplier" data-supplier-id="${esc(s.id)}" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}">${svg('messageCircle', 12)}<span>${esc(t('mSupWa'))}</span></button>
        <button class="st-btn primary" data-action="stock-new-po" data-supplier-id="${esc(s.id)}">${esc(t('mSupOrd'))}</button>
      `,
    });
    requestAnimationFrame(() => {
      wireDismiss(m?.el || topBackdrop());
    });
  }

  function renderMiniPriceChart(values) {
    const W = 600, H = 90, PAD = { l: 28, r: 8, t: 6, b: 16 };
    const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    const labels = ['Déc', 'Jan', 'Fév', 'Mars', 'Avr', 'Mai'];
    const xAt = (i) => PAD.l + (i / (values.length - 1)) * innerW;
    const yAt = (v) => PAD.t + innerH - ((v - min) / range) * innerH * 0.85;
    const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
    const points = values.map((v, i) => `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="3" fill="var(--atlas)" />`).join('');
    const xLabels = labels.map((l, i) => `<text x="${xAt(i)}" y="${H - 4}" text-anchor="middle" font-size="9">${esc(l)}</text>`).join('');
    return `
      <svg class="st-md-mini-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <path class="line" d="${path}" />
        ${points}
        <g class="axis">${xLabels}</g>
      </svg>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Item detail
   * ═══════════════════════════════════════════════════════════════════════ */
  function movementLabel(reason) {
    return ({
      opening: 'Solde initial', receipt: 'Réception', 'supplier-return': 'Retour fournisseur',
      sale: 'Vente', 'sale-reversal': 'Annulation de vente', 'production-input': 'Matière consommée',
      'production-output': 'Production', 'transfer-out': 'Transfert sortant', 'transfer-in': 'Transfert entrant',
      loss: 'Perte', expiry: 'Périmé', gift: 'Offert', 'staff-meal': 'Consommation équipe',
      count: 'Écart de comptage', return: 'Retour client', manual: 'Ajustement manuel',
    })[reason] || reason || 'Mouvement';
  }
  function itemHistory(it) {
    try { return window.KiwiInventory?.history?.(it.id) || []; } catch (_) { return []; }
  }
  function renderRealItemMovementSummary(it) {
    const rows = itemHistory(it);
    const received = rows.filter(r => r.reason === 'receipt').reduce((n, r) => n + Math.max(0, +r.qty || 0), 0);
    const consumed = rows.filter(r => (+r.qty || 0) < 0).reduce((n, r) => n + Math.abs(+r.qty || 0), 0);
    return `
      <div class="st-md-col-t">Activité enregistrée</div>
      <div class="st-md-pair"><span class="l">Entrées fournisseur</span><span class="v">${esc(fmtUnit(received, it.unit))}</span></div>
      <div class="st-md-pair"><span class="l">Sorties enregistrées</span><span class="v">${esc(fmtUnit(consumed, it.unit))}</span></div>
      <div class="st-md-pair"><span class="l">Mouvements</span><span class="v">${rows.length}</span></div>
      <div class="st-notice ${rows.length ? 'ok' : 'warn'}" style="margin-top:12px;">
        ${svg(rows.length ? 'checkCircle' : 'alertTriangle', 14)}
        <div>${rows.length ? 'Le stock affiché est reconstruit depuis le registre de mouvements.' : 'Aucun mouvement n’a encore été enregistré pour cet article.'}</div>
      </div>`;
  }
  function swapSupplierRanks(itemId) {
    if (!itemId) return;
    const raw = stOverlayRaw();
    const sub = (raw.subcategories || []).find(s => s.id === itemId);
    if (!sub || !Array.isArray(sub.suppliers) || sub.suppliers.length < 2) return;
    const s0 = sub.suppliers[0];
    const s1 = sub.suppliers[1];
    s0.rank = 2;
    s1.rank = 1;
    sub.suppliers = [s1, s0, ...sub.suppliers.slice(2)];
    sub.updatedAt = Date.now();
    stItemOverrides[itemId] = Object.assign({}, stItemOverrides[itemId] || {}, {
      suppliers: sub.suppliers,
      supplier: s1.supplierName,
      updatedAt: Date.now(),
    });
    stSaveOverlay();
    window.Kiwi?.toast?.(`Fournisseur principal défini sur ${s1.supplierName} (s'applique aux prochaines livraisons)`, { type: 'success' });
    closeTopModal();
    if (stPageActive) render();
  }

  function renderRealItemHistory(it) {
    const raw = stOverlayRaw();
    const sub = (raw.subcategories || []).find(s => s.id === it.id);
    const cards = sub && Array.isArray(sub.suppliers) ? sub.suppliers : [];
    let advisoryHtml = '';
    if (cards.length >= 2) {
      const c1 = cards[0];
      const c2 = cards[1];
      if (c2.defaultPrice != null && c1.defaultPrice != null && c2.defaultPrice < c1.defaultPrice) {
        advisoryHtml = `
          <div class="st-notice info" style="margin:10px 0; display:flex; align-items:flex-start; gap:8px;">
            ${svg('info', 16)}
            <div style="flex:1;">
              <div><b>Opportunité tarifaire :</b> ${esc(c2.supplierName)} propose <b>${esc(fmtMad(c2.defaultPrice))}/${esc(sub.unit)}</b> (vs ${esc(fmtMad(c1.defaultPrice))}/${esc(sub.unit)} chez ${esc(c1.supplierName)}).</div>
              <button class="st-btn small" type="button" data-stock-swap-ranks data-item-id="${esc(it.id)}" style="margin-top:6px;">
                Définir en fournisseur principal (s'applique aux prochaines livraisons)
              </button>
            </div>
          </div>
        `;
      }
    }
    const rows = itemHistory(it).slice(0, 12);
    return `
      ${advisoryHtml}
      <div class="st-md-section">
        <div class="st-md-section-t">${esc(t('mItSuppliersT'))}</div>
        <div class="st-md-list">
          ${cards.length ? cards.map(c => `
            <div class="st-md-list-row">
              <div>
                <span class="n">${esc(c.supplierName)}</span>
                <span class="${c.rank === 1 ? 'status-ok' : 'status-warn'}" style="margin-left:8px; font-size:11px; padding:2px 6px; border-radius:4px;">
                  ${c.rank === 1 ? esc(t('supRankPrincipal')) : `${esc(t('supRankBackup'))} ${c.rank - 1}`}
                </span>
              </div>
              <div class="v">${c.defaultPrice != null ? `${esc(fmtMad(c.defaultPrice))} / ${esc(sub?.unit || it.unit || 'unité')}` : '—'}</div>
            </div>`).join('') : `<div style="padding:9px 4px; font-size:12.5px; color:var(--n-500);">${esc(t('mItNoSuppliers'))}</div>`}
        </div>
        <button class="st-btn small" type="button" data-stock-add-backup-supplier data-item-id="${esc(it.id)}" style="margin-top:8px;">
          ${svg('plus', 12)}<span>${esc(t('mItAddBackupSup'))}</span>
        </button>
      </div>
      <div class="st-md-section">
        <div class="st-md-section-t">Historique des mouvements</div>
        <div class="st-md-list">
          ${rows.length ? rows.map(r => `
            <div class="st-md-list-row">
              <div><span class="n">${esc(movementLabel(r.reason))}</span><span class="d" style="margin-left:6px;">${esc(r.note || r.refId || '')}</span></div>
              <div class="v" style="color:${(+r.qty || 0) >= 0 ? 'var(--atlas)' : 'var(--danger)'};">${(+r.qty || 0) > 0 ? '+' : ''}${esc(fmtUnit(+r.qty || 0, it.unit))}</div>
              <div class="d">${esc(new Date(r.occurredTs || Date.now()).toLocaleDateString(lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-MA'))}</div>
            </div>`).join('') : `<div style="padding:12px 4px; font-size:12.5px; color:var(--n-500);">Aucun mouvement enregistré.</div>`}
        </div>
      </div>
      ${(function(){
        const wasteMoves = rows.filter(r => r && (r.refType === 'waste' || ['loss', 'expiry', 'gift', 'staff-meal'].includes(r.reason)));
        if (!wasteMoves.length) return '';
        return `
          <div class="st-md-section" style="margin-top:16px;">
            <div class="st-md-section-t" style="display:flex;justify-content:space-between;align-items:center;">
              <span>Pertes &amp; sorties exceptionnelles</span>
              <span style="font-size:11.5px;color:#b91c1c;font-weight:600;">${wasteMoves.length} déclaration${wasteMoves.length > 1 ? 's' : ''}</span>
            </div>
            <div class="st-md-list">
              ${wasteMoves.map(r => {
                const d = new Date(r.occurredTs || Date.now());
                const dateStr = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const fine = (r.meta && r.meta.wasteReason) || r.reason;
                const reasonLabel = (function(why){
                  if (why === 'perime' || r.reason === 'expiry') return 'Périmé';
                  if (why === 'casse') return 'Casse';
                  if (why === 'avarie') return 'Avarié';
                  if (why === 'offert' || r.reason === 'gift') return 'Offert';
                  if (why === 'repas-equipe' || r.reason === 'staff-meal') return 'Repas équipe';
                  return 'Perte';
                })(fine);
                const isReversal = !!r.reversalOf;
                return `
                  <div class="st-md-list-row" style="${isReversal ? 'opacity:0.5;' : ''}">
                    <div>
                      <span class="n" style="color:#b91c1c;">${esc(reasonLabel)}</span>
                      <span class="d" style="margin-left:6px;">${esc(r.actor || '—')} ${r.note ? `· ${esc(r.note)}` : ''}</span>
                    </div>
                    <div class="v" style="color:#b91c1c;font-weight:600;">−${Math.abs(+r.qty || 0)} ${esc(it.unit)}</div>
                    <div class="d" style="display:flex;align-items:center;gap:6px;">
                      <span>${dateStr}</span>
                      ${stShowReal() && !isReversal ? `
                        <button class="st-btn small" type="button" data-action="stock-cancel-waste" data-movement-id="${esc(r.id)}" title="Annuler cette perte" style="color:#b91c1c;padding:1px 6px;font-size:11px;">
                          Annuler
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      })()}`;
  }
  function openAddBackupSupplier(itemId) {
    const it = getInv().find(x => x.id === itemId);
    if (!it) return;
    const raw = stOverlayRaw();
    const sub = (raw.subcategories || []).find(s => s.id === itemId);
    const unit = (sub && sub.unit) || it.unit || 'unité';

    const m = window.Kiwi.modal({
      title: t('addBackupSupTitle'),
      desc: `${it.name} · ${catLabel(it.category)}`,
      width: 520,
      body: `
        <div class="st-mb-field" style="margin-bottom:12px;">
          <label class="st-mb-label">${esc(t('addBackupSupLabel'))}</label>
          <select class="st-mb-input" data-stock-backup-sup>
            ${renderSupOptions()}
            <option value="__new__">${esc(t('addBackupSupOptNew'))}</option>
          </select>
          <div data-stock-newsup-wrap style="display:none; margin-top:8px;">
            <input class="st-mb-input" type="text" placeholder="${esc(t('addBackupSupNewName'))}" data-stock-newsup-name />
          </div>
        </div>
        <div class="st-mb-field">
          <label class="st-mb-label">${esc(t('addBackupSupPrice'))} (MAD / ${esc(unit)})</label>
          <input class="st-mb-input mono" type="number" min="0" step="0.01" placeholder="0.00" data-stock-backup-price />
        </div>
        <div class="st-notice ok" style="margin-top:12px;">
          ${svg('checkCircle', 14)}
          <div>${esc(t('addBackupSupHelp'))}</div>
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()]?.btnCancel || 'Annuler')}</button><button class="st-btn primary" data-stock-backup-save>${esc(t('addBackupSupConfirm'))}</button>`,
    });

    const scope = m?.el || topBackdrop();
    wireDismiss(scope);

    const supSel = scope?.querySelector('[data-stock-backup-sup]');
    const newsupWrap = scope?.querySelector('[data-stock-newsup-wrap]');
    const newsupInput = scope?.querySelector('[data-stock-newsup-name]');

    supSel?.addEventListener('change', () => {
      if (supSel.value === '__new__') {
        if (newsupWrap) newsupWrap.style.display = '';
        newsupInput?.focus();
      } else {
        if (newsupWrap) newsupWrap.style.display = 'none';
      }
    });

    scope?.querySelector('[data-stock-backup-save]')?.addEventListener('click', () => {
      let rawSup = '';
      if (supSel?.value === '__new__') {
        rawSup = (newsupInput?.value || '').trim();
        if (!rawSup) { newsupInput?.focus(); return; }
      } else {
        rawSup = (supSel?.value || '').trim();
      }
      if (!rawSup) return;

      const foundSup = getSup().find(s => s.name === rawSup || `${s.name} · ${s.location || ''}`.trim().replace(/ ·\s*$/, '') === rawSup);
      const supplierName = foundSup ? foundSup.name : rawSup;

      if (window.KiwiProcurement?.addSupplier) {
        const known = window.KiwiProcurement.doc?.()?.suppliers?.find(s => String(s.name || '').trim().toLowerCase() === supplierName.toLowerCase());
        if (!known) {
          try { window.KiwiProcurement.addSupplier({ name: supplierName }); } catch (_) {}
        }
      }

      const priceVal = parseFloat(scope.querySelector('[data-stock-backup-price]')?.value);
      const defaultPrice = (Number.isFinite(priceVal) && priceVal >= 0) ? Math.round(priceVal * 100) / 100 : (+it.costPerUnit || 0);

      const rawDoc = stOverlayRaw();
      let subcat = (rawDoc.subcategories || []).find(s => s.id === itemId);
      if (!subcat) {
        subcat = {
          id: itemId,
          categoryId: it.category || 'legumes',
          name: it.name,
          unit: unit,
          defaultCost: +it.costPerUnit || 0,
          suppliers: [],
          currentStock: currentStockFor(it),
          parLevel: it.parLevel,
          reorderLevel: it.reorderLevel,
          usageThisWeek: it.usageThisWeek || 0,
          theoreticalUsage: it.theoreticalUsage || 0,
          updatedAt: Date.now(),
        };
        if (!Array.isArray(rawDoc.subcategories)) rawDoc.subcategories = [];
        rawDoc.subcategories.push(subcat);
      }

      const cards = Array.isArray(subcat.suppliers) ? subcat.suppliers.slice() : [];
      if (!cards.length && it.supplier) {
        cards.push({
          id: 'sup-' + Date.now().toString(36) + '-main',
          supplierName: it.supplier,
          defaultPrice: +it.costPerUnit || 0,
          purchaseUnit: unit,
          factor: 1,
          rank: 1,
        });
      }

      const normName = supplierName.trim().toLowerCase();
      const existingCard = cards.find(s => String(s.supplierName || '').trim().toLowerCase() === normName);

      let toastMsg = '';
      if (existingCard) {
        existingCard.defaultPrice = defaultPrice;
        toastMsg = t('backupSupUpdatedToast', existingCard.supplierName, defaultPrice);
      } else {
        const rank = cards.length + 1;
        const newCard = {
          id: 'sup-' + Date.now().toString(36),
          supplierName: supplierName,
          defaultPrice: defaultPrice,
          purchaseUnit: unit,
          factor: 1,
          rank: rank,
        };
        cards.push(newCard);
        toastMsg = t('backupSupAddedToast', supplierName);
      }

      subcat.suppliers = cards;
      subcat.updatedAt = Date.now();

      stItemOverrides[itemId] = Object.assign({}, stItemOverrides[itemId] || {}, {
        suppliers: cards,
        updatedAt: Date.now(),
      });

      stSaveOverlay();
      closeTopModal();
      window.Kiwi?.toast?.(toastMsg, { type: 'success' });
      if (stPageActive) render();
    });
  }

  function openItemMovement(itemId) {
    const it = getInv().find(x => x.id === itemId); if (!it) return;
    const m = window.Kiwi.modal({
      title: `Mouvement · ${it.name}`,
      desc: `Stock actuel : ${fmtUnit(currentStockFor(it), it.unit)}`,
      width: 560,
      body: `
        <div class="st-mb-row two">
          <div class="st-mb-field"><label class="st-mb-label">Motif</label>
            <select class="st-mb-input" data-stock-move-reason>
              <option value="receipt">Réception fournisseur</option>
              <option value="return">Retour client</option>
              <option value="loss">Perte / casse</option>
              <option value="expiry">Périmé</option>
              <option value="gift">Offert</option>
              <option value="staff-meal">Consommation équipe</option>
              <option value="count">Comptage physique</option>
              <option value="manual">Correction manuelle</option>
            </select>
          </div>
          <div class="st-mb-field"><label class="st-mb-label" data-stock-move-qty-label>Quantité</label><input class="st-mb-input mono" data-stock-move-qty type="number" min="0" step="0.001" placeholder="0" /></div>
        </div>
        <div class="st-mb-field"><label class="st-mb-label">Référence / note</label><input class="st-mb-input" data-stock-move-note placeholder="Motif, document ou responsable" /></div>
        <div class="st-notice ok" data-stock-move-help>${svg('checkCircle', 14)}<div>Une entrée augmente le stock. Le registre conserve la trace de l’opération.</div></div>`,
      foot: `<button class="st-btn" data-dismiss-modal>Annuler</button><button class="st-btn primary" data-stock-move-save>Enregistrer</button>`,
    });
    const scope = m?.el || topBackdrop();
    const reason = scope?.querySelector('[data-stock-move-reason]');
    const label = scope?.querySelector('[data-stock-move-qty-label]');
    const help = scope?.querySelector('[data-stock-move-help] div');
    const updateHelp = () => {
      const isCount = reason?.value === 'count';
      if (label) label.textContent = isCount ? `Quantité réellement comptée (${it.unit})` : `Quantité (${it.unit})`;
      if (help) help.textContent = isCount
        ? 'Kiwi calcule et enregistre uniquement l’écart entre le stock théorique et le comptage.'
        : ['receipt', 'return'].includes(reason?.value) ? 'Cette entrée augmente le stock et reste traçable.' : 'Cette sortie diminue le stock et reste traçable.';
    };
    reason?.addEventListener('change', updateHelp); updateHelp();
    scope?.querySelector('[data-stock-move-save]')?.addEventListener('click', () => {
      const value = Math.max(0, +(scope.querySelector('[data-stock-move-qty]')?.value || 0));
      const why = reason?.value || 'manual';
      const note = scope.querySelector('[data-stock-move-note]')?.value.trim() || '';
      if (!(value >= 0) || (why !== 'count' && value <= 0)) {
        window.Kiwi.toast('Indiquez une quantité valide.', { type: 'warning' }); return;
      }
      const ref = `manual-${Date.now().toString(36)}`;
      if (why === 'count') countStock(it, value, ref);
      else moveStock(it, ['receipt', 'return'].includes(why) ? value : -value, why, 'manual', ref, note);
      closeTopModal(); window.Kiwi.toast('Mouvement de stock enregistré.', { type: 'success' });
      if (stPageActive) render();
    });
    wireDismiss(scope);
  }
  function openItemDetail(itemId) {
    const it = getInv().find(x => x.id === itemId);
    if (!it) return;
    const cur = currentStockFor(it);
    const st = statusOf(it);
    const v = variance(it);
    const days = daysOfStock(it);
    const altSups = getSup().filter(s => s.category === it.category && !it.supplier.toLowerCase().includes(s.name.toLowerCase())).slice(0, 3);

    const m = window.Kiwi.modal({
      title: it.name,
      desc: `${catLabel(it.category)} · ${st === 'ok' ? t('stOk') : st === 'low' ? t('stLow') : t('stOut')}`,
      width: 720,
      body: `
        <div class="st-md-2col">
          <div>
            <div class="st-md-col-t">État actuel</div>
            <div class="st-md-pair"><span class="l">${esc(t('mItStockActual'))}</span><span class="v">${esc(fmtUnit(cur, it.unit))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItParR'))}</span><span class="v">${esc(fmtUnit(it.parLevel, it.unit))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItReorderR'))}</span><span class="v">${esc(fmtUnit(it.reorderLevel, it.unit))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItValue'))}</span><span class="v">${esc(fmtMad(cur * it.costPerUnit))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItCost'))}</span><span class="v">${esc(fmtMad(it.costPerUnit))} / ${esc(it.unit)}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItVarW'))}</span><span class="v" style="color:var(--${Math.abs(v) <= 5 ? 'n-600' : Math.abs(v) <= 15 ? 'warning' : 'danger'});">${esc(fmtPct(v))}</span></div>
            <div class="st-md-pair"><span class="l">${esc(t('mItDaysL'))}</span><span class="v">${days >= 999 ? '—' : Math.round(days) + ' j'}</span></div>
          </div>
          <div>
            ${stShowReal() ? renderRealItemMovementSummary(it) : `
              <div class="st-md-col-t">${esc(t('mItUsageT'))}</div>
              ${renderItemUsageChart(it)}
              <div style="display:flex; gap:14px; margin-top:8px; font-size:11.5px; color:var(--n-500);">
                <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:14px; height:2px; background:var(--atlas);"></span>${esc(t('mItUsageL'))}</span>
                <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:14px; height:2px; background:var(--n-400); border-top:1.5px dashed var(--n-400);"></span>${esc(t('mItUsageTheo'))}</span>
              </div>`}
          </div>
        </div>
        ${stShowReal() ? renderRealItemHistory(it) : `<div class="st-md-section">
          <div class="st-md-section-t">${esc(t('mItPricesT'))}</div>
          <div class="st-md-list">
            ${[0.92, 0.95, 0.97, 1.0, 1.02].map((m, i) => `
              <div class="st-md-list-row">
                <div><span class="d">${esc(['Janv','Févr','Mars','Avr','Mai'][i])}</span></div>
                <div class="v">${esc(fmtMad(it.costPerUnit * m))} / ${esc(it.unit)}</div>
                <div class="${m > 1 ? 'status-warn' : m < 1 ? 'status-ok' : 'status-bad'}" style="font-size:11px;">${fmtPct((m - 1) * 100, 1)}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="st-md-section">
          <div class="st-md-section-t">${esc(t('mItAltT'))}</div>
          <div class="st-md-list">
            ${altSups.length > 0 ? altSups.map(s => `
              <div class="st-md-list-row">
                <div><span class="n">${esc(s.name)}</span> <span class="d" style="margin-left:6px;">${esc(s.location)}</span></div>
                <div class="v">${esc(fmtMad(it.costPerUnit * (0.92 + Math.random() * 0.15)))} / ${esc(it.unit)}</div>
                <div style="font-size:11px; color:var(--n-500);">★ ${s.rating.toFixed(1)}</div>
              </div>
            `).join('') : `<div style="padding:9px 4px; font-size:12.5px; color:var(--n-500);">Aucun fournisseur alternatif identifié dans cette catégorie.</div>`}
          </div>
        </div>`}
      `,
      foot: `
        <button class="st-btn" data-stock-mark-86 data-item-name="${esc(it.name)}">${esc(t('mItMark'))}</button>
        ${stShowReal() ? `<button class="st-btn" data-stock-detail-move data-item-id="${esc(it.id)}">${svg('swap', 12)}<span>Mouvement</span></button>` : ''}
        <button class="st-btn" data-stock-detail-edit data-item-id="${esc(it.id)}">${svg('edit', 12)}<span>${esc(t('mItEdit'))}</span></button>
        <button class="st-btn" data-stock-detail-delete data-item-id="${esc(it.id)}" style="color:#9a1f1f; border-color:rgba(154,31,31,0.35);">${esc(t('mItDelete'))}</button>
        <button class="st-btn" data-dismiss-modal>${esc(t('mItClose'))}</button>
        <button class="st-btn primary" data-stock-reorder data-item-id="${esc(it.id)}">${esc(t('mItOrder'))}</button>
      `,
    });
    const scope = m?.el || topBackdrop();
    scope?.querySelector('[data-stock-mark-86]')?.addEventListener('click', (e) => {
      window.Kiwi.toast(`${e.currentTarget.dataset.itemName} marqué 86 sur 6 terminaux`, { type: 'info' });
    });
    scope?.querySelector('[data-stock-reorder]')?.addEventListener('click', (e) => {
      closeTopModal();
      openQuickOrder(e.currentTarget.dataset.itemId);
    });
    scope?.querySelector('[data-stock-detail-edit]')?.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.itemId;
      closeTopModal();
      openEditItem(id);
    });
    scope?.querySelector('[data-stock-detail-move]')?.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.itemId;
      closeTopModal(); openItemMovement(id);
    });
    scope?.querySelector('[data-stock-swap-ranks]')?.addEventListener('click', (e) => {
      swapSupplierRanks(e.currentTarget.dataset.itemId);
    });
    scope?.querySelector('[data-stock-add-backup-supplier]')?.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.itemId;
      closeTopModal();
      openAddBackupSupplier(id);
    });
    scope?.querySelector('[data-stock-detail-delete]')?.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.itemId;
      closeTopModal();
      confirmDeleteItem(id);
    });
  }

  function renderItemUsageChart(it) {
    const W = 320, H = 130, PAD = { l: 24, r: 8, t: 10, b: 20 };
    const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
    const daily = (it.usageThisWeek / 7);
    const theoDaily = (theoreticalUsageFor(it) / 7);
    // Generate 14 days of mock data around the daily average
    const actual = Array.from({ length: 14 }, (_, i) => daily * (0.85 + Math.random() * 0.3));
    const theo = Array.from({ length: 14 }, () => theoDaily);
    const max = Math.max(...actual, ...theo) * 1.15;
    const xAt = (i) => PAD.l + (i / 13) * innerW;
    const yAt = (v) => PAD.t + innerH - (v / max) * innerH;
    const pathActual = actual.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
    const pathTheo = theo.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
    return `
      <svg class="st-md-mini-chart" style="height:140px;" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <path class="line-dashed" d="${pathTheo}" />
        <path class="line" d="${pathActual}" />
        <g class="axis">
          <text x="${PAD.l}" y="${H - 4}" font-size="9">−14j</text>
          <text x="${PAD.l + innerW}" y="${H - 4}" text-anchor="end" font-size="9">${t('today').toLowerCase()}</text>
        </g>
      </svg>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Add / Edit item
   * Shared form. existingId === null → add, otherwise edit overlay.
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderCatOptions(selectedId) {
    const opts = allCategories().map(c =>
      `<option value="${esc(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.label)}</option>`
    ).join('');
    return `${opts}<option value="__new__">${esc(t('addCatOpt'))}</option>`;
  }
  function renderSupOptions(selectedSupplierName) {
    return getSup().map(s => {
      const label = `${s.name} · ${s.location || ''}`.trim().replace(/ ·\s*$/, '');
      const sel = selectedSupplierName && (selectedSupplierName === s.name || selectedSupplierName.startsWith(s.name)) ? 'selected' : '';
      return `<option value="${esc(label)}" ${sel}>${esc(label)}</option>`;
    }).join('');
  }
  /* Return the modal container of the most-recently-opened backdrop,
   * so multiple stacked modals don't collide on the selectors above. */
  function topBackdrop() {
    const all = document.querySelectorAll('.kiwi-backdrop');
    return all.length ? all[all.length - 1] : null;
  }
  /* Wire the [data-dismiss-modal] cancel buttons inside this scope to close
   * the modal — interactive.js doesn't bind these globally. */
  function wireDismiss(scope) {
    if (!scope) return;
    scope.querySelectorAll('[data-dismiss-modal]').forEach(b => {
      b.addEventListener('click', () => scope.querySelector('.kiwi-modal-close')?.click());
    });
  }
  /* Properly close the top stock modal so unlockPageScroll() runs. The bug
   * fix for the scroll-lock leak: direct `.kiwi-backdrop?.remove()` skips
   * the modal helper's close handler — counter stays > 0, html.kiwi-locked
   * stays on, page won't scroll until reload. Click the wired X instead. */
  function closeTopModal() {
    (topBackdrop() || document).querySelector('.kiwi-modal-close')?.click();
  }
  function wireCatNewToggle(scope) {
    const root = scope || topBackdrop() || document;
    const sel = root.querySelector('[data-stock-add-cat]');
    const inlineWrap = root.querySelector('[data-stock-newcat-wrap]');
    const inlineInput = root.querySelector('[data-stock-newcat-name]');
    const inlineBtn = root.querySelector('[data-stock-newcat-confirm]');
    if (!sel || !inlineWrap) return;
    sel.addEventListener('change', () => {
      if (sel.value === '__new__') {
        inlineWrap.style.display = '';
        inlineInput?.focus();
      } else {
        inlineWrap.style.display = 'none';
      }
    });
    inlineBtn?.addEventListener('click', () => {
      const raw = (inlineInput?.value || '').trim();
      if (!raw) { inlineInput?.focus(); return; }
      const id = 'usr-cat-' + raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20) + '-' + Date.now().toString(36).slice(-4);
      stUserCategories.push({ id, label: raw });
      stSaveOverlay();
      // Rebuild the select preserving "+ Nouvelle…" option last, select new id.
      sel.innerHTML = renderCatOptions(id);
      inlineWrap.style.display = 'none';
      inlineInput.value = '';
      window.Kiwi.toast(t('addCatToast', raw), { type: 'success' });
    });
  }
  function openAddItem() { openItemForm(null); }
  function openEditItem(itemId) {
    const it = getInv().find(x => x.id === itemId);
    if (it) openItemForm(it);
  }
  function openItemForm(existing) {
    const isEdit = !!existing;
    const title = isEdit ? t('editItemTitle') : t('addItemTitle');
    const cta = isEdit ? t('editItemBtn') : t('addItemBtn');
    const unitOptions = stockUnitOptions(existing?.unit || 'unité');
    const m = window.Kiwi.modal({
      title,
      width: 560,
      body: `
        <div class="st-mb-field" style="margin-bottom:12px;">
          <label class="st-mb-label">${esc(t('addItemName'))}</label>
          <input class="st-mb-input" type="text" placeholder="Ex. Olives noires" value="${esc(existing?.name || '')}" data-stock-add-name />
        </div>
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('addItemCat'))}</label>
            <select class="st-mb-input" data-stock-add-cat>
              ${renderCatOptions(existing?.category || 'legumes')}
            </select>
            <div data-stock-newcat-wrap style="display:none; margin-top:8px; display:flex; gap:6px;">
              <input class="st-mb-input" type="text" placeholder="${esc(t('addCatName'))}" data-stock-newcat-name style="flex:1;" />
              <button class="st-btn primary" type="button" data-stock-newcat-confirm>${esc(t('addCatInline'))}</button>
            </div>
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('addItemUnit'))}</label>
            <select class="st-mb-input" data-stock-add-unit>${unitOptions}</select>
          </div>
        </div>
        <div class="st-mb-field" style="margin-bottom:12px;">
          <label class="st-mb-label">${esc(t('addItemSupplier'))}</label>
          <select class="st-mb-input" data-stock-add-sup>
            ${renderSupOptions(existing?.supplier)}
          </select>
        </div>
        <div class="st-mb-row three">
          <div class="st-mb-field"><label class="st-mb-label">${esc(t('addItemStock'))}</label><input class="st-mb-input mono" type="number" min="0" step="0.5" placeholder="0" value="${existing != null ? esc(currentStockFor(existing)) : ''}" data-stock-add-current /></div>
          <div class="st-mb-field"><label class="st-mb-label">${esc(t('addItemPar'))}</label><input class="st-mb-input mono" type="number" min="0" step="0.5" placeholder="0" value="${esc(existing?.parLevel ?? '')}" data-stock-add-par /></div>
          <div class="st-mb-field"><label class="st-mb-label">${esc(t('addItemReorder'))}</label><input class="st-mb-input mono" type="number" min="0" step="0.5" placeholder="0" value="${esc(existing?.reorderLevel ?? '')}" data-stock-add-reorder /></div>
        </div>
        <div class="st-mb-field" style="margin-bottom:12px;">
          <label class="st-mb-label">${esc(t('addItemCost'))}</label>
          <input class="st-mb-input mono" type="number" min="0" step="0.5" placeholder="0" value="${esc(existing?.costPerUnit ?? '')}" data-stock-add-cost />
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button class="st-btn primary" data-stock-add-confirm>${esc(cta)}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    /* Attach listeners synchronously — the modal markup is already in DOM by now
     * (interactive.js's modal() appendChild is synchronous) so we don't need rAF. */
    try { wireCatNewToggle(scope); } catch (err) { console.error('wireCatNewToggle failed', err); }
    scope?.querySelector('[data-stock-add-confirm]')?.addEventListener('click', () => {
        const name = (scope.querySelector('[data-stock-add-name]')?.value || '').trim();
        if (!name) { scope.querySelector('[data-stock-add-name]')?.focus(); return; }
        const catSel = scope.querySelector('[data-stock-add-cat]');
        let category = catSel?.value || 'legumes';
        if (category === '__new__') category = existing?.category || 'legumes';
        const unit = stockUnit(scope.querySelector('[data-stock-add-unit]')?.value);
        const supplier = scope.querySelector('[data-stock-add-sup]')?.value || (existing?.supplier || '');
        const cur = parseFloat(scope.querySelector('[data-stock-add-current]')?.value);
        const par = parseFloat(scope.querySelector('[data-stock-add-par]')?.value);
        const reorder = parseFloat(scope.querySelector('[data-stock-add-reorder]')?.value);
        const cost = parseFloat(scope.querySelector('[data-stock-add-cost]')?.value);
        const parLevel = isNaN(par) ? 0 : par;
        const reorderLevel = isNaN(reorder) ? Math.max(0, Math.round(parLevel * 0.4)) : reorder;
        const costPerUnit = isNaN(cost) ? 0 : cost;
        const currentStock = isNaN(cur) ? (existing ? currentStockFor(existing) : parLevel) : cur;

        if (isEdit) {
          const before = currentStockFor(existing);
          // Edit path: update overlay (or user item directly)
          if (existing.id.startsWith('usr-')) {
            const i = stUserItems.findIndex(x => x.id === existing.id);
            if (i >= 0) {
              stUserItems[i] = {
                ...stUserItems[i],
                name, category, unit, supplier,
                parLevel, reorderLevel, costPerUnit, currentStock, updatedAt: Date.now(),
              };
              stItemOverrides[existing.id] = {
                ...(stItemOverrides[existing.id] || {}),
                name, category, unit, supplier, parLevel, reorderLevel, costPerUnit,
                updatedAt: Date.now(),
              };
              stSaveOverlay();   // article créé PAR le commerçant : sa correction compte autant
            }
          } else {
            stItemOverrides[existing.id] = {
              ...(stItemOverrides[existing.id] || {}),
              name, category, unit, supplier,
              parLevel, reorderLevel, costPerUnit, currentStock, updatedAt: Date.now(),
            };
            // Reflect current stock in stStockOverrides so statusOf/daysOfStock pick it up.
            stStockOverrides[existing.id] = currentStock;
            stSaveOverlay();
          }
          if (Math.abs(currentStock - before) > 0.0005) {
            countStock(existing, currentStock, 'manual-count-' + Date.now().toString(36));
          }
          closeTopModal();
          window.Kiwi.toast(t('editItemToast', name) + stDemoNote(), { type: 'success' });
          if (stPageActive) render();
          return;
        }

        // Add path: build a real item that matches the venues.js shape so
        // currentStockFor / statusOf / variance / daysOfStock all behave.
        const today = new Date('2026-05-23').toISOString().slice(0, 10);
        const status = currentStock <= 0 ? 'out' : (currentStock < reorderLevel ? 'low' : 'ok');
        const item = {
          id: 'usr-' + Date.now().toString(36),
          name, category, unit, supplier,
          currentStock,
          parLevel, reorderLevel, costPerUnit,
          lastDelivery: today,
          deliveryFrequency: '—',
          usageThisWeek: 0,
          theoreticalUsage: 0,
          status, updatedAt: Date.now(),
        };
        stUserItems.push(item);
        try {
          if (window.KiwiInventory && stShowReal()) {
            window.KiwiInventory.ensureOpening(item.id, currentStock, { unitCost: costPerUnit });
          }
        } catch (_) {}
        stSaveOverlay();
        closeTopModal();
        window.Kiwi.toast(t('addItemToast', name) + stDemoNote(), { type: 'success' });
        if (stPageActive) render();
      });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Confirm delete item
   * ═══════════════════════════════════════════════════════════════════════ */
  function confirmDeleteItem(itemId) {
    const it = getInv().find(x => x.id === itemId);
    if (!it) return;
    const m = window.Kiwi.modal({
      title: t('deleteItemTitle'),
      width: 480,
      body: `<p style="margin:0; color:var(--n-700); line-height:1.55;">${esc(t('deleteItemBody', it.name) + stDemoNote())}</p>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button class="st-btn primary" style="background:#b32a2a; border-color:#9a1f1f;" data-stock-delete-confirm>${esc(t('deleteItemBtn'))}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    scope?.querySelector('[data-stock-delete-confirm]')?.addEventListener('click', () => {
      if (it.id.startsWith('usr-')) {
        stUserItems = stUserItems.filter(x => x.id !== it.id);
      } else {
        stDeletedItems.add(it.id);
        stSaveOverlay();
      }
      closeTopModal();
      window.Kiwi.toast(t('deleteItemToast', it.name), { type: 'info' });
      if (stPageActive) render();
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Add / Edit supplier
   * ═══════════════════════════════════════════════════════════════════════ */
  function openAddSupplier() { openSupplierForm(null); }
  function openEditSupplier(id) {
    const s = getSup().find(x => x.id === id);
    if (s) openSupplierForm(s);
  }
  function openSupplierForm(existing) {
    const isEdit = !!existing;
    const title = isEdit ? t('editSupTitle') : t('addSupTitle');
    const cta = isEdit ? t('editSupBtn') : t('addSupBtn');
    const catOptions = allCategories().map(c =>
      `<option value="${esc(c.id)}" ${existing?.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`
    ).join('');
    const m = window.Kiwi.modal({
      title,
      width: 600,
      body: `
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supName'))}</label>
            <input class="st-mb-input" type="text" placeholder="Ex. Olives du Souss" value="${esc(existing?.name || '')}" data-stock-sup-name />
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supCat'))}</label>
            <select class="st-mb-input" data-stock-sup-cat>${catOptions}</select>
          </div>
        </div>
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supPhone'))}</label>
            <input class="st-mb-input mono" type="text" placeholder="+212 …" value="${esc(existing?.contact || '')}" data-stock-sup-phone />
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supLoc'))}</label>
            <input class="st-mb-input" type="text" placeholder="Casablanca" value="${esc(existing?.location || '')}" data-stock-sup-loc />
          </div>
        </div>
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supPay'))}</label>
            <select class="st-mb-input" data-stock-sup-pay>
              ${['Comptant','Net 7','Net 15','Net 30','Net 45'].map(p =>
                `<option ${existing?.paymentTerms === p ? 'selected' : ''}>${esc(p)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supDeliv'))}</label>
            <input class="st-mb-input" type="text" placeholder="hebdomadaire · mardi-vendredi…" value="${esc(existing?.deliverySchedule || '')}" data-stock-sup-deliv />
          </div>
        </div>
        <div class="st-mb-row">
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supRating'))}</label>
            <input class="st-mb-input mono" type="number" min="1" max="5" step="0.1" placeholder="—" value="${esc(existing?.rating != null ? existing.rating : '')}" data-stock-sup-rating />
          </div>
          <div class="st-mb-field">
            <label class="st-mb-label">${esc(t('supSpend'))}</label>
            <input class="st-mb-input mono" type="number" min="0" step="50" placeholder="0" value="${esc(existing?.monthlySpend ?? '')}" data-stock-sup-spend />
          </div>
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button class="st-btn primary" data-stock-sup-confirm>${esc(cta)}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    scope?.querySelector('[data-stock-sup-confirm]')?.addEventListener('click', () => {
      const name = (scope.querySelector('[data-stock-sup-name]')?.value || '').trim();
      if (!name) { scope.querySelector('[data-stock-sup-name]')?.focus(); return; }
      const category = scope.querySelector('[data-stock-sup-cat]')?.value || 'epicerie';
      const contact = (scope.querySelector('[data-stock-sup-phone]')?.value || '').trim();
      const location = (scope.querySelector('[data-stock-sup-loc]')?.value || '').trim();
      const paymentTerms = scope.querySelector('[data-stock-sup-pay]')?.value || 'Net 30';
      const deliverySchedule = (scope.querySelector('[data-stock-sup-deliv]')?.value || '—').trim();
      const ratingVal = (scope.querySelector('[data-stock-sup-rating]')?.value || '').trim();
      const ratingRaw = ratingVal ? parseFloat(ratingVal) : NaN;
      const rating = isNaN(ratingRaw) ? null : Math.min(5, Math.max(1, ratingRaw));
      const spendRaw = parseFloat(scope.querySelector('[data-stock-sup-spend]')?.value);
      const monthlySpend = isNaN(spendRaw) ? 0 : spendRaw;

      if (isEdit) {
        if (existing.id.startsWith('usr-')) {
          const i = stUserSuppliers.findIndex(x => x.id === existing.id);
          if (i >= 0) { stUserSuppliers[i] = { ...stUserSuppliers[i], name, category, contact, location, paymentTerms, deliverySchedule, rating, monthlySpend }; stSaveOverlay(); }
        } else {
          stSupOverrides[existing.id] = { ...(stSupOverrides[existing.id] || {}), name, category, contact, location, paymentTerms, deliverySchedule, rating, monthlySpend };
          stSaveOverlay();
        }
        closeTopModal();
        window.Kiwi.toast(t('editSupToast', name) + stDemoNote(), { type: 'success' });
        if (stPageActive) render();
        return;
      }

      const sup = {
        id: 'usr-sup-' + Date.now().toString(36),
        name, location, category, contact,
        deliverySchedule,
        avgInvoice: monthlySpend > 0 ? Math.round(monthlySpend / 4) : 0,
        paymentTerms,
        rating,
        monthlySpend,
        priceChangeLast30d: 0,
      };
      stUserSuppliers.push(sup);
      stSaveOverlay();
      closeTopModal();
      window.Kiwi.toast(t('addSupToast', name) + stDemoNote(), { type: 'success' });
      if (stPageActive) render();
    });
  }

  function confirmDeleteSupplier(id) {
    const s = getSup().find(x => x.id === id);
    if (!s) return;
    const m = window.Kiwi.modal({
      title: t('deleteSupTitle'),
      width: 480,
      body: `<p style="margin:0; color:var(--n-700); line-height:1.55;">${esc(t('deleteSupBody', s.name))}</p>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button class="st-btn primary" style="background:#b32a2a; border-color:#9a1f1f;" data-stock-sup-delete-confirm>${esc(t('deleteSupBtn'))}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    scope?.querySelector('[data-stock-sup-delete-confirm]')?.addEventListener('click', () => {
      if (s.id.startsWith('usr-')) {
        stUserSuppliers = stUserSuppliers.filter(x => x.id !== s.id);
      } else {
        stDeletedSups.add(s.id);
        stSaveOverlay();
      }
      closeTopModal();
      window.Kiwi.toast(t('deleteSupToast', s.name), { type: 'info' });
      if (stPageActive) render();
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Add category (from cat-pill row)
   * ═══════════════════════════════════════════════════════════════════════ */
  function openAddCategory() {
    const m = window.Kiwi.modal({
      title: t('addCatTitle'),
      width: 440,
      body: `
        <div class="st-mb-field">
          <label class="st-mb-label">${esc(t('addCatName'))}</label>
          <input class="st-mb-input" type="text" placeholder="Ex. Surgelés" data-stock-cat-name />
        </div>
      `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button><button class="st-btn primary" data-stock-cat-confirm>${esc(t('addCatBtn'))}</button>`,
    });
    const scope = m?.el || topBackdrop();
    wireDismiss(scope);
    const input = scope?.querySelector('[data-stock-cat-name]');
    input?.focus();
    const submit = () => {
      const raw = (input?.value || '').trim();
      if (!raw) { input?.focus(); return; }
      const id = 'usr-cat-' + raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20) + '-' + Date.now().toString(36).slice(-4);
      stUserCategories.push({ id, label: raw });
      stSaveOverlay();
      scope?.remove();
      window.Kiwi.toast(t('addCatToast', raw), { type: 'success' });
      if (stPageActive) render();
    };
    scope?.querySelector('[data-stock-cat-confirm]')?.addEventListener('click', submit);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Day deliveries detail
   * ═══════════════════════════════════════════════════════════════════════ */
  function openDayDetail(dow, dayName) {
    const sups = computeDeliveriesForDay(+dow);
    window.Kiwi.modal({
      title: t('mDayTitle', dayName),
      width: 560,
      body: sups.length === 0
        ? `<div style="padding:24px; text-align:center; color:var(--n-500);">${esc(t('calEmpty'))}</div>`
        : `
          <div class="st-md-list">
            ${sups.map(s => `
              <div class="st-md-list-row">
                <div><span class="n">${esc(s.name)}</span> <span class="d" style="margin-left:6px;">${esc(s.time)}</span></div>
                <div class="v">${esc(fmtMad(s.cost))}</div>
                <div class="status-ok" style="font-size:11px;">Confirmée</div>
              </div>
            `).join('')}
          </div>
        `,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(t('mItClose'))}</button>`,
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Send suggested order
   * ═══════════════════════════════════════════════════════════════════════ */
  function sendSuggestedOrder() {
    const btn = document.querySelector('[data-action="stock-send-suggested"]');
    if (btn) { btn.setAttribute('disabled', ''); btn.style.opacity = '0.65'; btn.innerHTML = 'Envoi en cours…'; }
    setTimeout(() => {
      window.Kiwi.toast('4 commandes envoyées · WhatsApp confirmé · 8 920 MAD', { type: 'success', duration: 4500 });
      if (btn) { btn.removeAttribute('disabled'); btn.style.opacity = '1'; btn.innerHTML = esc(t('btnSendSuggested')); }
    }, 1500);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Handler registration
   * ═══════════════════════════════════════════════════════════════════════ */
  function registerHandlers() {
    if (!window.Kiwi?.handlers) return setTimeout(registerHandlers, 60);
    const H = window.Kiwi.handlers;

    H['nav-stock'] = () => showPage();
    const origAccueil = H['nav-accueil'];
    H['nav-accueil'] = function () { showDashboard(); return origAccueil?.call(this); };

    // Tabs / filters / view
    H['stock-tab'] = (el) => { stCurrentTab = el.dataset.tab; render(); };
    H['stock-subview'] = (el) => { stItemSubView = el.dataset.subview; render(); };
    H['stock-waste-range'] = (el) => { stWasteDateRange = el.dataset.range; rerenderTabBody(); };
    H['stock-waste-reason'] = (el) => { stWasteFilterReason = el.dataset.reason; rerenderTabBody(); };
    H['stock-open-declare-waste'] = () => openDeclareWasteModal();
    H['stock-declare-waste-prefill'] = (el) => openDeclareWasteModal({ itemId: el.dataset.itemId, qty: parseFloat(el.dataset.qty) || 1, reason: el.dataset.reason });
    H['stock-modal-close'] = () => closeTopModal();
    H['stock-export-waste-csv'] = () => exportWasteCsv();
    H['stock-cancel-waste'] = (el) => cancelWasteMovement(el.dataset.movementId);
    H['stock-count-range'] = (el) => { stCountDateFilter = el.dataset.range; rerenderTabBody(); };
    H['stock-count-status'] = (el) => { stCountStatusFilter = el.dataset.status; rerenderTabBody(); };
    H['stock-count-tab'] = (el) => { stCountSubTab = el.dataset.tab; rerenderTabBody(); };
    H['stock-count-detail'] = (el) => openCountDetailModal(el.dataset.countId);
    H['stock-export-counts-csv'] = () => exportCountsCsv();
    H['stock-venue-filter'] = (el) => { stVenueFilter = el.dataset.venue; render(); };
    H['stock-cat-filter'] = (el) => { stCatFilter = el.dataset.cat; rerenderTabBody(); };
    H['stock-status-filter'] = (el) => { stStatusFilter = el.dataset.status; rerenderTabBody(); };
    H['stock-view'] = (el) => { stItemView = el.dataset.view; rerenderTabBody(); };
    H['stock-sort'] = (el) => {
      const key = el.dataset.sort;
      if (stSortBy === key) stSortDir = stSortDir === 'asc' ? 'desc' : 'asc';
      else { stSortBy = key; stSortDir = 'asc'; }
      rerenderTabBody();
    };

    // Header actions
    H['stock-scan-invoice'] = () => openInvoiceScan();
    H['stock-physical-count'] = () => openPhysicalCount();
    H['stock-count-sheet'] = () => openCountSheet();
    H['stock-add-item'] = () => openAddItem();

    // Item actions
    H['stock-item-detail'] = (el) => openItemDetail(el.dataset.itemId);
    H['stock-edit-item'] = (el) => openEditItem(el.dataset.itemId);
    H['stock-delete-item'] = (el) => confirmDeleteItem(el.dataset.itemId);
    // "More" icon → open detail modal (which now has Modifier / Supprimer reachable from the footer).
    H['stock-item-more'] = (el) => openItemDetail(el.dataset.itemId);
    H['stock-reorder'] = (el) => openQuickOrder(el.dataset.itemId);
    H['stock-urgent-order'] = (el) => openQuickOrder(el.dataset.itemId, { urgent: true });
    H['stock-mark-86'] = (el) => { stMarked86.add(el.dataset.itemName); window.Kiwi.toast(`${el.dataset.itemName} marqué 86 sur 6 terminaux`, { type: 'info' }); };
    H['stock-ignore-24h'] = (el) => window.Kiwi.toast(`Alerte ${el.dataset.itemName} ignorée pour 24h`, { type: 'info' });
    // Category pill add
    H['stock-add-cat'] = () => openAddCategory();

    function isPhone(v) { return /^\+?[\d\s.-]{8,}$/.test(String(v || '').trim()); }
    function phoneDigits(v) {
      const d = String(v || '').replace(/\D/g, '');
      return String(v || '').trim().startsWith('+') ? '+' + d : d;
    }
    function waDigits(v) {
      let d = String(v || '').replace(/\D/g, '');
      if (/^0[67]\d{8}$/.test(d)) d = '212' + d.slice(1);
      return d;
    }

    // Supplier actions
    H['stock-supplier-detail'] = (el) => openSupplierProfile(el.dataset.supplierId);
    H['stock-call-supplier'] = (el) => {
      const contact = (el.dataset.phone || '').trim();
      const name = (el.dataset.name || '').trim();
      const supId = el.dataset.supplierId;
      if (isPhone(contact)) {
        location.href = 'tel:' + phoneDigits(contact);
      } else {
        window.Kiwi.toast('Pas de numéro — modifiez le fournisseur', { type: 'warn' });
        const sup = getSup().find(s => s.id === supId || s.name === name);
        if (sup) openEditSupplier(sup.id);
      }
    };
    H['stock-wa-supplier'] = (el) => {
      const contact = (el.dataset.phone || '').trim();
      const name = (el.dataset.name || '').trim();
      const supId = el.dataset.supplierId;
      if (isPhone(contact)) {
        const text = `Bonjour ${name}, `;
        window.open(`https://wa.me/${waDigits(contact)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      } else {
        window.Kiwi.toast('Pas de numéro — modifiez le fournisseur', { type: 'warn' });
        const sup = getSup().find(s => s.id === supId || s.name === name);
        if (sup) openEditSupplier(sup.id);
      }
    };
    H['stock-new-po'] = (el) => openInvoiceScan({ supplierId: el.dataset.supplierId });
    H['stock-add-supplier'] = () => openAddSupplier();
    H['stock-edit-supplier'] = (el) => openEditSupplier(el.dataset.supplierId);
    H['stock-delete-supplier'] = (el) => confirmDeleteSupplier(el.dataset.supplierId);

    // Orders
    H['stock-new-order'] = () => window.Kiwi.toast(t('ordNewToast'), { type: 'info' });
    H['stock-ord-detail'] = (el) => window.Kiwi.toast(t('ordDetailToast', el.dataset.orderId), { type: 'info', desc: t('ordDetailDesc') });
    H['stock-ord-edit'] = (el) => window.Kiwi.toast(t('ordEditToast', el.dataset.orderId), { type: 'info' });
    H['stock-ord-cancel'] = (el) => window.Kiwi.toast(t('ordCancelToast', el.dataset.orderId), { type: 'warn' });
    H['stock-ord-pause'] = (el) => window.Kiwi.toast(t('ordPauseToast', el.dataset.orderId), { type: 'info' });
    H['stock-ord-track'] = (el) => window.Kiwi.toast(`Suivi commande #${el.dataset.orderId} · livraison dans 6h`, { type: 'info' });
    H['stock-ord-contact'] = (el) => window.Kiwi.toast(`Contact fournisseur · commande #${el.dataset.orderId}`, { type: 'info' });
    H['stock-confirm-order'] = (el) => {
      stConfirmedOrders.add(el.dataset.orderId);
      window.Kiwi.toast(`Commande #${el.dataset.orderId} confirmée`, { type: 'success' });
      if (stCurrentTab === 'orders') rerenderTabBody();
    };
    H['stock-edit-suggested'] = () => window.Kiwi.toast('Édition de la commande suggérée', { type: 'info' });
    H['stock-send-suggested'] = () => sendSuggestedOrder();

    // Forecast
    H['stock-program-shortfall'] = (el) => window.Kiwi.toast(`Commande programmée · ${el.dataset.itemName}`, { type: 'success' });
    H['stock-upgrade-ultra'] = () => window.Kiwi.toast('Kiwi Ultra · 1 499 MAD/mois · multi-pays, AI procurement, account manager', { type: 'info', duration: 4500 });

    // Calendar
    H['stock-day-detail'] = (el) => openDayDetail(el.dataset.day, el.dataset.dayName);

    // Re-render on venue/language changes
    window.KiwiVenue?.subscribe?.(() => { if (stPageActive) render(); });
    window.KiwiI18n?.onLangChange?.(() => { if (stPageActive) render(); });
    let stockSyncPaint = 0;
    const repaintFromSharedStock = () => {
      if (!stPageActive || stockSyncPaint) return;
      stockSyncPaint = setTimeout(() => { stockSyncPaint = 0; render(); }, 0);
    };
    window.KiwiInventory?.subscribe?.(repaintFromSharedStock);
    window.addEventListener('storage', (e) => {
      if (e.key !== stOverlayKey()) return;
      stOverlayLoadedFor = null;
      repaintFromSharedStock();
    });
  }

  /* Private bridge used by restaurant recipes. It exposes the same persisted
   * inventory the Stock page renders, including edits and physical counts;
   * no demo inventory is copied into a real restaurant. */
  window.KiwiRestaurantStock = {
    items: () => {
      stEnsureOverlay();
      return getInv().map((it) => ({ ...it, currentStock: currentStockFor(it), theoreticalUsage: theoreticalUsageFor(it) }));
    },
    /* Same rows without the recipe-derived usage. The recipe engine reads the
     * inventory to resolve units and costs, and it is what computes that usage
     * in the first place: enriching the rows it consumes would recurse. */
    rows: () => {
      stEnsureOverlay();
      return getInv().map((it) => ({ ...it, currentStock: currentStockFor(it) }));
    },
    theoreticalUsage: (stockId) => {
      stEnsureOverlay();
      const it = getInv().find((row) => String(row.id) === String(stockId));
      return it ? theoreticalUsageFor(it) : 0;
    },
  };
  try { window.dispatchEvent(new CustomEvent('kiwi-stock-ready')); } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerHandlers);
  } else {
    registerHandlers();
  }
})();
