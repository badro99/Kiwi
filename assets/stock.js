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
      supRating: 'Note (1-5)', supSpend: 'Dépense mensuelle estimée (MAD)',
      // Tooltip on row icon buttons
      titleEdit: 'Modifier', titleDelete: 'Supprimer',
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

  const stOverlayKey = () => 'kiwi:stockOverlay:' + currentVenueId();
  let stOverlayLoadedFor = null;

  function stSaveOverlay() {
    if (!stShowReal()) return;
    try {
      localStorage.setItem(stOverlayKey(), JSON.stringify({
        items: stUserItems, itemOv: stItemOverrides, delItems: [...stDeletedItems],
        sups: stUserSuppliers, supOv: stSupOverrides, delSups: [...stDeletedSups],
        cats: stUserCategories, stockOv: stStockOverrides,
      }));
    } catch (_) { /* quota plein → on ne casse pas la saisie en cours */ }
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

  function stOverlayRaw() {
    try {
      const s = JSON.parse(localStorage.getItem(stOverlayKey()) || 'null');
      if (s && typeof s === 'object') return s;
    } catch (_) {}
    return { items: [], sups: [], cats: [], itemOv: {}, supOv: {}, stockOv: {}, delItems: [], delSups: [] };
  }

  /* Union par identifiant (le défaut de cloud-doc.js) — SAUF les suppressions.
   * `delItems`/`delSups` sont des listes d'identifiants NUS, et la fusion par
   * défaut, faute d'identité à comparer, garde simplement la nôtre : l'article
   * supprimé sur la tablette réapparaissait donc au premier envoi du portable,
   * en boucle. Deux suppressions s'additionnent, elles ne s'arbitrent pas. */
  function stMergeOverlay(mine, theirs) {
    const M = window.KiwiCloudDoc && window.KiwiCloudDoc.mergeDefault;
    if (!M || !theirs) return mine;
    const out = M(mine, theirs);
    ['delItems', 'delSups'].forEach((k) => {
      const a = Array.isArray(mine && mine[k]) ? mine[k] : [];
      const b = Array.isArray(theirs && theirs[k]) ? theirs[k] : [];
      out[k] = [...new Set([...a, ...b])];
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
      },
      merge: stMergeOverlay,
      /* Un commerçant qui n'a rien saisi porte quand même les huit champs
       * vides : sans ce test, ouvrir la page suffisait à créer une ligne. */
      isEmpty: (d) => !d || !(
        (d.items && d.items.length) || (d.sups && d.sups.length) || (d.cats && d.cats.length)
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
    const venue = currentVenueId();
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
    if (Array.isArray(s.items)) stUserItems = s.items;
    if (Array.isArray(s.sups)) stUserSuppliers = s.sups;
    if (Array.isArray(s.cats)) stUserCategories = s.cats;
    (s.delItems || []).forEach((id) => stDeletedItems.add(id));
    (s.delSups || []).forEach((id) => stDeletedSups.add(id));
    Object.assign(stItemOverrides, s.itemOv || {});
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
    window.KiwiCloudDoc.carryForward('stockOverlay', vid, slug, (raw) => {
      try {
        const d = JSON.parse(raw || 'null');
        return !!(d && ((d.items && d.items.length) || (d.sups && d.sups.length)));
      } catch (_) { return false; }
    }, 'kiwi:stockOverlay:');
    const c = stCloud();
    if (c) c.bind();
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
  const svg = (k, sz = 14) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>`;

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
    return (window.KiwiVenue?.isFusion?.() === true) || document.body.classList.contains('fusion-mode');
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
    if (!V?.getInventory) return [...stUserItems];
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
    return [...applyItemOverlay(base), ...stUserItems.filter(it => !stDeletedItems.has(it.id))];
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
  const currentStockFor = (it) => (stStockOverrides[it.id] != null ? stStockOverrides[it.id] : it.currentStock);
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
  const variance = (it) => (it.theoreticalUsage > 0 ? ((it.usageThisWeek - it.theoreticalUsage) / it.theoreticalUsage) * 100 : 0);
  const daysOfStock = (it) => {
    const rate = it.usageThisWeek / 7;
    return rate > 0 ? currentStockFor(it) / rate : 999;
  };
  const totalValue = (items) => items.reduce((s, it) => s + (currentStockFor(it) * it.costPerUnit), 0);
  const foodCostMonth = (items) => items.reduce((s, it) => s + (it.theoreticalUsage * it.costPerUnit * 4), 0);
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
  function renderOverview() {
    const items = getInv();
    const out = items.filter(it => statusOf(it) === 'out');
    const low = items.filter(it => statusOf(it) === 'low');
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

    // Alerts sorted: out first, then low (by daysOfStock asc)
    const alerts = [
      ...out,
      ...low.sort((a, b) => daysOfStock(a) - daysOfStock(b)),
    ].slice(0, 12);

    return `
      ${renderKpiCards({ totalVal, items, out, low, costWeek, ratio, ratioClass, nextDelivery, trendBars })}

      <div class="st-section">
        <div class="st-section-head">
          <h3>${esc(t('alertsT'))}</h3>
          ${(out.length + low.length) > 0 ? `<span class="st-count-badge warn">${out.length + low.length}</span>` : ''}
        </div>
        <div class="st-alerts">
          ${alerts.length === 0 ? `<div style="color:var(--n-500); font-size:13px; padding:6px 2px;">${esc(t('alertsEmpty'))}</div>` :
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

  function renderKpiCards({ totalVal, items, out, low, costWeek, ratio, ratioClass, nextDelivery, trendBars }) {
    const alertCount = out.length + low.length;
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
          <div class="st-kpi-sub">${esc(alertCount === 0 ? t('kpiAlertOk') : t('kpiAlertSub', out.length, low.length))}</div>
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
   * TAB 2 · Articles & stock
   * ═══════════════════════════════════════════════════════════════════════ */
  function renderItems() {
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
            ${items.map(renderItemRow).join('')}
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
    const varCostMad = fmtMad(Math.abs(v) / 100 * it.theoreticalUsage * it.costPerUnit);
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
            <span class="st-tt">${esc(t('varTip', fmtUnit(it.usageThisWeek, it.unit), fmtUnit(it.theoreticalUsage, it.unit), varCostMad))}</span>
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

      ${stShowReal() ? '' : renderAiCard(t('aiPriceUpT'), t('aiPriceUpB'), t('aiPriceUpA'))}
    `;
  }

  function renderSupRow(s) {
    const pcl = s.priceChangeLast30d;
    const priceCls = pcl > 1 ? 'up' : pcl < -1 ? 'down' : 'neutral';
    const priceIco = pcl > 1 ? 'trendingUp' : pcl < -1 ? 'trendingDown' : 'minus';
    const priceLabel = pcl === 0 ? t('priceStable') : fmtPct(pcl, 1);
    const risePill = pcl > 5 ? `<span class="st-sup-rise-pill">${esc(t('priceUp'))}</span>` : '';
    const stars = Math.round(s.rating);
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
        <td><span class="st-sup-rate"><span class="st">${'★'.repeat(stars)}</span>${esc(s.rating.toFixed(1))}</span></td>
        <td class="r">
          <div class="st-actions">
            <button class="st-icon-btn" type="button" data-action="stock-call-supplier" data-name="${esc(s.name)}" data-phone="${esc(s.contact)}" title="${esc(t('mSupCall'))}" aria-label="${esc(t('mSupCall'))}">${svg('phone', 14)}</button>
            <button class="st-icon-btn" type="button" data-action="stock-wa-supplier" data-name="${esc(s.name)}" title="${esc(t('mSupWa'))}" aria-label="${esc(t('mSupWa'))}">${svg('messageCircle', 14)}</button>
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
   * MODAL · Scan invoice
   * ═══════════════════════════════════════════════════════════════════════ */
  function openInvoiceScan() {
    const m = window.Kiwi.modal({
      title: t('mScanTitle'),
      width: 640,
      body: `<div data-stock-scan-stage>${renderScanStage1()}</div>`,
      foot: `<button class="st-btn" data-dismiss-modal>${esc(STR[lang()].btnCancel || 'Annuler')}</button>`,
    });
    requestAnimationFrame(() => { wireDismiss(m?.el || topBackdrop()); wireScanStage1(); });
  }

  function renderScanStage1() {
    return `
      <div class="st-dropzone" data-stock-scan-trigger>
        <div class="st-dropzone-ico">${svg('upload', 26)}</div>
        <div class="st-dropzone-t">${esc(t('mScanDropT'))}</div>
        <div class="st-dropzone-s">${esc(t('mScanDropS'))}</div>
        <div class="st-dropzone-acts">
          <button class="st-btn" type="button">${esc(t('mScanBtnFile'))}</button>
          <button class="st-btn" type="button">${svg('camera', 12)}<span>${esc(t('mScanBtnCam'))}</span></button>
        </div>
      </div>
      <div class="st-dropzone-link" data-stock-scan-trigger>${esc(t('mScanManual'))}</div>
    `;
  }

  function wireScanStage1() {
    document.querySelectorAll('[data-stock-scan-trigger]').forEach(el => {
      el.addEventListener('click', () => {
        const stage = document.querySelector('[data-stock-scan-stage]');
        if (!stage) return;
        stage.innerHTML = `
          <div class="st-scanning">
            <div class="st-scanning-spinner"></div>
            <div class="st-scanning-t">${esc(t('mScanReadingT'))}</div>
            <div class="st-scanning-s">${esc(t('mScanReadingS'))}</div>
          </div>
        `;
        setTimeout(() => {
          stage.innerHTML = renderScanReview();
          wireScanReview();
        }, 2000);
      });
    });
  }

  function renderScanReview() {
    return `
      <div class="st-mb-eyebrow">${esc(t('mScanReviewT'))}</div>
      <div class="st-mb-row three">
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanSupplier'))}</label><input class="st-mb-input" value="Boucherie Errazi" /></div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanDate'))}</label><input class="st-mb-input mono" value="14/05/2026" /></div>
        <div class="st-mb-field"><label class="st-mb-label">${esc(t('mScanNum'))}</label><input class="st-mb-input mono" value="FAC-2026-1842" /></div>
      </div>
      <table class="st-inv-items">
        <thead><tr><th>Article</th><th class="r">Qté</th><th class="r">Total</th></tr></thead>
        <tbody>
          <tr><td>Viande hachée bœuf</td><td class="r mono">12 kg</td><td class="r mono">1 140 MAD</td></tr>
          <tr><td>Agneau épaule</td><td class="r mono">14 kg</td><td class="r mono">2 352 MAD</td></tr>
          <tr><td>Merguez</td><td class="r mono">4 kg</td><td class="r mono">312 MAD</td></tr>
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

  function wireScanReview() {
    document.querySelector('[data-stock-scan-confirm]')?.addEventListener('click', () => {
      // Apply stock overrides for matched items
      const inv = getInv();
      const matches = {
        'inv01': 12,   // Viande hachée bœuf — restocked by 12kg
        'inv03': 14,   // Agneau épaule — out → 14kg now
        'inv04': 4,    // Merguez — +4
      };
      Object.entries(matches).forEach(([id, q]) => {
        const it = inv.find(x => x.id === id);
        if (it) stStockOverrides[id] = (stStockOverrides[id] != null ? stStockOverrides[id] : it.currentStock) + q;
        stSaveOverlay();
      });
      closeTopModal();
      window.Kiwi.toast(t('mScanToast'), { type: 'success', duration: 3800 });
      if (stPageActive) render();
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MODAL · Physical count
   * ═══════════════════════════════════════════════════════════════════════ */
  function openPhysicalCount() {
    const items = getInv();
    const m = window.Kiwi.modal({
      title: t('mCountTitle'),
      desc: t('mCountSub'),
      width: 760,
      body: `
        <div class="st-pc-wrap">
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
    let totalCostVar = 0;
    const recomputeProgress = () => {
      const inputs = document.querySelectorAll('[data-pc-real]');
      let counted = 0;
      totalCostVar = 0;
      inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val) && inp.value !== '') {
          counted++;
          const theo = parseFloat(inp.dataset.pcTheoVal);
          const cost = parseFloat(inp.dataset.pcCost);
          const unit = inp.dataset.pcUnit;
          const diff = val - theo;
          const costDiff = diff * cost;
          totalCostVar += costDiff;
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
    document.querySelector('[data-stock-pc-validate]')?.addEventListener('click', () => {
      // Apply counted values as stock overrides
      document.querySelectorAll('[data-pc-real]').forEach(inp => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) stStockOverrides[inp.dataset.pcReal] = v;
      });
      stSaveOverlay();     // un inventaire physique se compte une fois, pas à chaque rechargement
      closeTopModal();
      window.Kiwi.toast(t('mCountToast', fmtMad(totalCostVar)), { type: 'success', duration: 4200 });
      if (stPageActive) render();
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
    const trendCls = pcl > 1 ? 'up' : pcl < -1 ? 'down' : '';
    // Mock price history — 6 months
    const ph = [s.avgInvoice * 0.95, s.avgInvoice * 0.97, s.avgInvoice * 1.0, s.avgInvoice * 0.99, s.avgInvoice * 1.02, s.avgInvoice];

    const m = window.Kiwi.modal({
      title: s.name,
      desc: `${esc(s.location)} · ${catLabel(s.category)} · ★ ${s.rating.toFixed(1)}`,
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
        <button class="st-btn" data-stock-call-supplier data-name="${esc(s.name)}" data-phone="${esc(s.contact)}">${svg('phone', 12)}<span>${esc(t('mSupCall'))}</span></button>
        <button class="st-btn" data-stock-wa-supplier data-name="${esc(s.name)}">${svg('messageCircle', 12)}<span>${esc(t('mSupWa'))}</span></button>
        <button class="st-btn primary" data-stock-new-po data-supplier-id="${esc(s.id)}">${esc(t('mSupOrd'))}</button>
      `,
    });
    requestAnimationFrame(() => {
      wireDismiss(m?.el || topBackdrop());
      document.querySelector('[data-stock-call-supplier]')?.addEventListener('click', (e) => {
        window.Kiwi.toast(`Appel à ${e.currentTarget.dataset.name} · ${e.currentTarget.dataset.phone}`, { type: 'info' });
      });
      document.querySelector('[data-stock-wa-supplier]')?.addEventListener('click', (e) => {
        window.Kiwi.toast(`Message WhatsApp envoyé à ${e.currentTarget.dataset.name}`, { type: 'success' });
      });
      document.querySelector('[data-stock-new-po]')?.addEventListener('click', () => {
        closeTopModal();
        window.Kiwi.toast(t('poNewToast'), { type: 'info' });
      });
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
            <div class="st-md-col-t">${esc(t('mItUsageT'))}</div>
            ${renderItemUsageChart(it)}
            <div style="display:flex; gap:14px; margin-top:8px; font-size:11.5px; color:var(--n-500);">
              <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:14px; height:2px; background:var(--atlas);"></span>${esc(t('mItUsageL'))}</span>
              <span style="display:inline-flex; align-items:center; gap:6px;"><span style="display:inline-block; width:14px; height:2px; background:var(--n-400); border-top:1.5px dashed var(--n-400);"></span>${esc(t('mItUsageTheo'))}</span>
            </div>
          </div>
        </div>
        <div class="st-md-section">
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
        </div>
      `,
      foot: `
        <button class="st-btn" data-stock-mark-86 data-item-name="${esc(it.name)}">${esc(t('mItMark'))}</button>
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
    const theoDaily = (it.theoreticalUsage / 7);
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
    const units = ['kg','g','L','unité','boîte','paquet','botte','pot','bouteille','paire'];
    const unitOptions = units.map(u => `<option ${existing?.unit === u ? 'selected' : ''}>${esc(u)}</option>`).join('');
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
        const unit = scope.querySelector('[data-stock-add-unit]')?.value || 'unité';
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
          // Edit path: update overlay (or user item directly)
          if (existing.id.startsWith('usr-')) {
            const i = stUserItems.findIndex(x => x.id === existing.id);
            if (i >= 0) {
              stUserItems[i] = {
                ...stUserItems[i],
                name, category, unit, supplier,
                parLevel, reorderLevel, costPerUnit, currentStock,
              };
              stSaveOverlay();   // article créé PAR le commerçant : sa correction compte autant
            }
          } else {
            stItemOverrides[existing.id] = {
              ...(stItemOverrides[existing.id] || {}),
              name, category, unit, supplier,
              parLevel, reorderLevel, costPerUnit, currentStock,
            };
            // Reflect current stock in stStockOverrides so statusOf/daysOfStock pick it up.
            stStockOverrides[existing.id] = currentStock;
            stSaveOverlay();
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
          status,
        };
        stUserItems.push(item);
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
            <input class="st-mb-input mono" type="number" min="1" max="5" step="0.1" placeholder="4.5" value="${esc(existing?.rating ?? '')}" data-stock-sup-rating />
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
      const ratingRaw = parseFloat(scope.querySelector('[data-stock-sup-rating]')?.value);
      const rating = isNaN(ratingRaw) ? 4.5 : Math.min(5, Math.max(1, ratingRaw));
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

    // Supplier actions
    H['stock-supplier-detail'] = (el) => openSupplierProfile(el.dataset.supplierId);
    H['stock-call-supplier'] = (el) => window.Kiwi.toast(`Appel à ${el.dataset.name} · ${el.dataset.phone}`, { type: 'info' });
    H['stock-wa-supplier'] = (el) => window.Kiwi.toast(`Message WhatsApp envoyé à ${el.dataset.name}`, { type: 'success' });
    H['stock-new-po'] = (el) => window.Kiwi.toast(t('poNewToast'), { type: 'info' });
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerHandlers);
  } else {
    registerHandlers();
  }
})();
