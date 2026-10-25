/* Owner: table labels and scoped CSS. Exposes private table data factory; needs canvas dimensions from the table owner. */
window.__kiwiPagesTables = { createData: (scope) => {
'use strict';
const { PDS_CANVAS_W, PDS_CANVAS_H } = scope;
const PDS_STR = {
  fr: {
    title: 'Plan de salle',
    subtitle: (name, n, occ) => `${name} · ${n} table${n > 1 ? 's' : ''} · ${occ} occupée${occ > 1 ? 's' : ''} en service`,
    tagPdS: 'PLAN DE SALLE',
    /* Modes */
    modeLayout: 'Aménagement',
    modeAssign: 'Affectation',
    modeRotate: 'Rotation',
    modeLayoutDesc: 'Glissez les tables · clic pour éditer · ajoutez murs, portes et plantes pour visualiser le restaurant.',
    modeAssignDesc: 'Glissez un serveur sur une table pour l\'affecter · cliquez une table pour réassigner.',
    modeRotateDesc: 'Faites tourner les serveurs entre zones et tables pour éviter la lassitude, équité automatique.',
    /* Top bar */
    save: 'Sauvegarder',
    saving: 'Enregistrement…',
    savedButton: 'Enregistré',
    saved: 'Plan enregistré',
    savedDesc: 'Toutes les modifications ont bien été enregistrées.',
    reset: 'Réinitialiser',
    resetTitle: 'Réinitialiser le plan ?',
    resetDesc: 'Supprime toutes les tables, zones et affectations · charge le template par défaut. Action irréversible.',
    resetCancel: 'Annuler',
    resetConfirm: 'Réinitialiser',
    resetDone: 'Plan réinitialisé',
    resetDoneDesc: 'Template par défaut chargé · 16 tables, 3 zones.',
    templates: 'Templates',
    export: 'Exporter le plan',
    exportToast: 'Plan exporté',
    exportDesc: 'PDF A3 · 1 page · prêt pour impression ou WhatsApp.',
    /* KPIs */
    kpiTables: 'TABLES',
    kpiCovers: 'COUVERTS',
    kpiZones: 'ZONES',
    kpiServers: 'SERVEURS',
    /* Zones */
    addZone: 'Ajouter une zone',
    addZoneDesc: 'Une nouvelle zone apparaîtra dans les onglets · vous pourrez la peupler de tables.',
    zoneName: 'Nom de la zone',
    zoneAdd: 'Créer',
    zoneAdded: 'Zone ajoutée',
    zoneAddedDesc: (n) => `Zone "${n}" créée · cliquez pour la sélectionner.`,
    renameZone: 'Renommer',
    renameZoneTitle: 'Renommer la zone',
    deleteZone: 'Supprimer la zone',
    deleteZoneTitle: 'Supprimer cette zone ?',
    deleteZoneDesc: (n, c) => `La zone "${n}" et ses ${c} tables seront retirées du plan. Action irréversible.`,
    deleteZoneOk: 'Supprimer',
    deleteZoneDone: 'Zone supprimée',
    deleteZoneNoLast: 'Dernière zone',
    deleteZoneNoLastDesc: 'Vous devez garder au moins une zone active.',
    zoneRenamedDesc: (n) => `Zone renommée en "${n}".`,
    /* Add table palette */
    paletteTitle: 'Ajouter une table',
    paletteHint: 'Cliquez pour ajouter, la table apparaît au centre de la zone.',
    /* Une table comme un comptoir s'ouvrent de la même façon ; rien ne le
       disait, et le comptoir passait pour un décor qu'on ne peut pas toucher. */
    editHint: 'Cliquez un objet posé · table, comptoir, cuisine, plante · pour le redimensionner ou le supprimer.',
    structTitle: 'Éléments structurels',
    structHint: 'Murs, portes, fenêtres et plantes, purement visuels.',
    elWall: 'Mur',
    elDoor: 'Porte',
    elWindow: 'Fenêtre',
    elColumn: 'Colonne',
    elPlant: 'Plante',
    tRound: 'Ronde',
    tSquare: 'Carrée',
    tRect: 'Rectangulaire',
    tBar: 'Bar / Comptoir',
    tHigh: 'Mange-debout',
    seats: 'places', tableName: 'Table',
    addedTableToast: (id) => `Table ${id} ajoutée`,
    addedTableDesc: (s, z) => `${s} couverts · ${z} · glissez-la pour la positionner.`,
    addedElementToast: 'Élément ajouté',
    addedElementDesc: 'Glissez-le pour positionner · cliquez pour pivoter.',
    /* Snap */
    viewNuit: 'Vue nuit · console de service',
    viewJour: 'Vue jour · matières & décor',
    snapOn: 'Aimanter',
    snapOff: 'Libre',
    snapHint: 'Aimanter aligne les tables sur la grille',
    /* Table inspector */
    inspectorTitle: (id) => `Table ${id}`,
    inspectorNum: 'Numéro',
    inspectorType: 'Type',
    inspectorSeats: 'Places',
    inspectorStatus: 'Statut',
    inspectorNotes: 'Notes',
    inspectorServer: 'Serveur affecté',
    reservationName: 'Nom de réservation',
    reservationTime: 'Heure',
    reservationNamePlaceholder: 'ex. Benali',
    inspectorRotate: 'Pivoter',
    inspectorDuplicate: 'Dupliquer',
    inspectorDelete: 'Supprimer',
    inspectorDone: 'Modifications enregistrées',
    inspectorUnassigned: 'Aucun',
    inspectorAddServer: '+ Un autre serveur',
    inspectorNoStaff: 'Aucun serveur dans votre équipe. Ajoutez-en depuis Équipe pour les affecter aux tables.',
    statusFree: 'Libre',
    statusOccupied: 'Occupée',
    statusReserved: 'Réservée',
    statusCleaning: 'À nettoyer',
    /* Selection / bulk */
    selection: 'Sélection',
    bulkAlignH: 'Aligner horiz.',
    bulkAlignV: 'Aligner vert.',
    bulkDistH: 'Distribuer horiz.',
    bulkDistV: 'Distribuer vert.',
    bulkDelete: 'Supprimer',
    bulkClear: 'Désélectionner',
    bulkSetStatus: 'Statut',
    bulkOkAlign: 'Tables alignées',
    bulkOkDist: 'Tables distribuées uniformément',
    bulkOkDelete: (n) => `${n} tables supprimées`,
    bulkOkStatus: (n, s) => `${n} tables marquées ${s}`,
    bulkHintNone: 'Maintenez Maj et cliquez pour sélectionner plusieurs tables · au moins 2 pour aligner.',
    /* Groupement */
    groupTables: 'Grouper',
    ungroupTables: 'Dissocier',
    groupPickHint: 'Cliquez sur une autre table pour la grouper avec celle-ci.',
    groupPickCancel: 'Groupement annulé',
    groupOk: (nums, covers) => `Tables ${nums} groupées · ${covers} couverts`,
    ungroupOk: 'Tables dissociées',
    undoAction: 'Annuler',
    deleteUndone: 'Table restaurée',
    ungroupUndone: 'Groupe restauré',
    bulkGroup: 'Grouper la sélection',
    bulkOkGroup: (n) => `${n} tables groupées`,
    groupCovers: (n) => `${n} couverts`,
    groupedWith: (nums) => `Groupée avec ${nums}`,
    /* Templates */
    templatesTitle: 'Templates de salle',
    templatesDesc: 'Démarrez avec une disposition pré-construite · vous pourrez la modifier ensuite.',
    tplBistro: 'Bistro · 30 couverts',
    tplBistroDesc: '8 tables intérieures + petite terrasse · 1 zone bar',
    tplResto: 'Restaurant · 60 couverts',
    tplRestoDesc: 'Salle principale 12 tables, terrasse, salon privé',
    tplCafe: 'Café · 20 couverts',
    tplCafeDesc: '6 mange-debout, comptoir, 3 tables ronde',
    tplBrasserie: 'Brasserie terrasse · 80 couverts',
    tplBrasserieDesc: 'Grande terrasse 10 tables, salle 8 tables, bar',
    tplBlank: 'Plan vierge',
    tplBlankDesc: 'Commencez de zéro · une seule zone vide',
    tplApply: 'Charger ce template',
    tplApplyConfirm: (n) => `Charger "${n}" ?`,
    tplApplyConfirmDesc: 'Le plan actuel sera remplacé. Pensez à exporter d\'abord si nécessaire.',
    tplLoaded: (n) => `${n} chargé`,
    tplLoadedDesc: 'Disposition initiale prête · personnalisez librement.',
    /* Empty state */
    emptyTitle: 'Commencez par choisir un template',
    emptyDesc: 'Ou créez votre première table, vous pouvez tout modifier ensuite.',
    emptyChoose: 'Choisir un template',
    emptyBlank: 'Démarrer vierge',
    /* Assignation mode */
    rosterTitle: 'Équipe en service',
    rosterHint: 'Glissez une pastille vers une table ou une zone',
    rosterShift: 'Shift soir',
    rosterUnassigned: 'Non affecté',
    rosterTables: (n) => `${n} table${n > 1 ? 's' : ''}`,
    rosterCovers: (n) => `${n} couverts`,
    rosterEmpty: 'Personne en service. Ajoutez un serveur ici, ou renseignez votre équipe depuis la page Équipe · elle apparaîtra automatiquement.',
    rosterAdd: '+ Ajouter un serveur',
    rosterAddTitle: 'Ajouter un serveur',
    rosterAddDesc: 'Il apparaîtra dans l\'équipe en service et pourra être glissé sur une table ou une zone.',
    rosterAddLabel: 'Nom du serveur',
    rosterAddPlaceholder: 'ex. Karim',
    rosterAddOk: 'Ajouter',
    rosterAddDone: (n) => `${n} ajouté au service`,
    rosterRemove: 'Retirer du service',
    rosterRemoveDone: (n) => `${n} retiré du service`,
    rosterRemoveDoneDesc: (n) => n ? `${n} tables libérées.` : 'Aucune table n\'était affectée.',
    clearAssign: 'Effacer toutes les affectations',
    clearAssignTitle: 'Effacer toutes les affectations ?',
    clearAssignDesc: 'Aucun serveur ne sera affecté à aucune table. Les affectations seront vides jusqu\'à réassignation.',
    clearAssignOk: 'Effacer',
    clearAssignDone: 'Affectations effacées',
    clearAssignDoneDesc: 'Toutes les tables sont libres d\'affectation serveur.',
    assignDone: (s, t) => `${s} affecté à ${t}`,
    assignDoneDesc: 'Coloré sur le plan · synchronisé avec l\'app serveur.',
    unassignDone: (t) => `${t} libérée d'affectation`,
    /* Rotation */
    rotateTitle: 'Configurer la rotation',
    rotateCTA: 'Configurer',
    rotateDesc: 'Quand vos serveurs alternent, ils restent motivés et apprennent toutes les tables.',
    rotatePeriod: 'Période',
    rotateDaily: 'Chaque jour',
    rotateShift: 'Chaque shift',
    rotateWeekly: 'Chaque semaine',
    rotateCustom: 'Personnalisée',
    rotateStrategy: 'Stratégie',
    rotZones: 'Rotation des zones',
    rotZonesDesc: 'Les serveurs tournent entre zones (recommandé)',
    rotTables: 'Rotation des tables',
    rotTablesDesc: 'Round-robin sur toutes les tables',
    rotPairs: 'Permutation par paires',
    rotPairsDesc: 'Vous choisissez les paires manuellement',
    rotPreview: 'Aperçu des 3 prochaines rotations',
    rotFairness: 'Équité par serveur',
    rotApply: 'Appliquer la rotation',
    rotApplied: 'Rotation appliquée',
    rotAppliedDesc: 'Tous les serveurs notifiés sur leur app · plan mis à jour.',
    rotNow: 'Tourner maintenant',
    rotNowDone: 'Rotation effectuée',
    rotNowDoneDesc: 'Nouvelles affectations actives · serveurs notifiés.',
    rotHistoryTitle: 'Historique de la semaine',
    rotHistoryHint: 'Vérifiez visuellement que personne ne reste sur la même zone trop longtemps.',
    rotNoneTitle: 'Aucune rotation configurée',
    rotNoneDesc: 'Configurez une rotation pour éviter que vos serveurs restent sur la même table pendant des mois.',
    rotNoneCTA: 'Configurer',
    fairnessLow: 'a trop fait cette zone, son tour arrive',
    fairnessHigh: 'rotation équilibrée',
    /* Status legend */
    legendTitle: 'Statuts',
    /* Generic */
    cancel: 'Annuler',
    close: 'Fermer',
    save2: 'Enregistrer',
    /* Days of week */
    days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    soonAvailable: 'Bientôt disponible',
    /* Scene picker (zone backdrop) */
    sceneLabel: 'Décor de la zone',
    sceneHint: (n) => `Change l'arrière-plan visuel de${n ? ` « ${n} »` : ' cette zone'}, purement esthétique, n'affecte pas vos tables.`,
    sceneSalle: 'Salle intérieure',
    sceneTerrasse: 'Terrasse extérieure',
    sceneBar: 'Bar / Comptoir',
    sceneEtage: 'Étage / Mezzanine',
    scenePrive: 'Salon privé',
    sceneBlank: 'Vierge (sans fixtures)',
    /* Floor toggle */
    floorRDC: 'Rez-de-chaussée',
    floorEtage: '1ᵉʳ étage',
    /* Room labels */
    roomLabel: (zone) => `${zone} · vue propriétaire`,
    viewOwner: 'vue propriétaire',
    floorCount: (occ, total) => `${total} table${total > 1 ? 's' : ''} · ${occ} occupée${occ > 1 ? 's' : ''}`,
  },
  en: {
    title: 'Floor Plan',
    subtitle: (name, n, occ) => `${name} · ${n} table${n === 1 ? '' : 's'} · ${occ} in service`,
    tagPdS: 'FLOOR PLAN',
    modeLayout: 'Layout',
    modeAssign: 'Assignment',
    modeRotate: 'Rotation',
    modeLayoutDesc: 'Drag tables · click to edit · add walls, doors and plants to visualize the room.',
    modeAssignDesc: 'Drag a server onto a table to assign · click a table to reassign.',
    modeRotateDesc: 'Rotate servers across zones and tables so they don\'t burn out, fairness built-in.',
    save: 'Save',
    saving: 'Saving…',
    savedButton: 'Saved',
    saved: 'Plan saved',
    savedDesc: 'All floor-plan changes were saved successfully.',
    reset: 'Reset',
    resetTitle: 'Reset the plan?',
    resetDesc: 'Removes all tables, zones and assignments · loads the default template. Cannot be undone.',
    resetCancel: 'Cancel',
    resetConfirm: 'Reset',
    resetDone: 'Plan reset',
    resetDoneDesc: 'Default template loaded · 16 tables, 3 zones.',
    templates: 'Templates',
    export: 'Export plan',
    exportToast: 'Plan exported',
    exportDesc: 'A3 PDF · 1 page · ready for print or WhatsApp.',
    kpiTables: 'TABLES',
    kpiCovers: 'COVERS',
    kpiZones: 'ZONES',
    kpiServers: 'SERVERS',
    addZone: 'Add a zone',
    addZoneDesc: 'A new zone will appear in the tabs · you can populate it with tables.',
    zoneName: 'Zone name',
    zoneAdd: 'Create',
    zoneAdded: 'Zone added',
    zoneAddedDesc: (n) => `Zone "${n}" created · click to select it.`,
    renameZone: 'Rename',
    renameZoneTitle: 'Rename zone',
    deleteZone: 'Delete zone',
    deleteZoneTitle: 'Delete this zone?',
    deleteZoneDesc: (n, c) => `Zone "${n}" and its ${c} tables will be removed. Cannot be undone.`,
    deleteZoneOk: 'Delete',
    deleteZoneDone: 'Zone deleted',
    deleteZoneNoLast: 'Last zone',
    deleteZoneNoLastDesc: 'You must keep at least one active zone.',
    zoneRenamedDesc: (n) => `Zone renamed to "${n}".`,
    paletteTitle: 'Add a table',
    paletteHint: 'Click to add, the table appears at the center of the zone.',
    editHint: 'Click any placed object · table, counter, kitchen, plant · to resize or delete it.',
    structTitle: 'Structural elements',
    structHint: 'Walls, doors, windows and plants, visual only.',
    elWall: 'Wall',
    elDoor: 'Door',
    elWindow: 'Window',
    elColumn: 'Column',
    elPlant: 'Plant',
    tRound: 'Round',
    tSquare: 'Square',
    tRect: 'Rectangular',
    tBar: 'Bar / Counter',
    tHigh: 'High table',
    seats: 'seats', tableName: 'Table',
    addedTableToast: (id) => `Table ${id} added`,
    addedTableDesc: (s, z) => `${s} seats · ${z} · drag to position.`,
    addedElementToast: 'Element added',
    addedElementDesc: 'Drag to position · click to rotate.',
    viewNuit: 'Night view · service console',
    viewJour: 'Day view · materials & decor',
    snapOn: 'Snap',
    snapOff: 'Free',
    snapHint: 'Snap aligns tables to the grid',
    inspectorTitle: (id) => `Table ${id}`,
    inspectorNum: 'Number',
    inspectorType: 'Type',
    inspectorSeats: 'Seats',
    inspectorStatus: 'Status',
    inspectorNotes: 'Notes',
    inspectorServer: 'Assigned server',
    reservationName: 'Reservation name',
    reservationTime: 'Time',
    reservationNamePlaceholder: 'e.g. Benali',
    inspectorRotate: 'Rotate',
    inspectorDuplicate: 'Duplicate',
    inspectorDelete: 'Delete',
    inspectorDone: 'Changes saved',
    inspectorUnassigned: 'None',
    inspectorAddServer: '+ Another server',
    inspectorNoStaff: 'No servers on your team yet. Add them in Team to assign them to tables.',
    statusFree: 'Free',
    statusOccupied: 'Occupied',
    statusReserved: 'Reserved',
    statusCleaning: 'Cleaning',
    selection: 'Selection',
    bulkAlignH: 'Align horiz.',
    bulkAlignV: 'Align vert.',
    bulkDistH: 'Distribute horiz.',
    bulkDistV: 'Distribute vert.',
    bulkDelete: 'Delete',
    bulkClear: 'Deselect',
    bulkSetStatus: 'Status',
    bulkOkAlign: 'Tables aligned',
    bulkOkDist: 'Tables distributed evenly',
    bulkOkDelete: (n) => `${n} tables deleted`,
    bulkOkStatus: (n, s) => `${n} tables set to ${s}`,
    bulkHintNone: 'Hold Shift and click to select multiple tables · at least 2 to align.',
    groupTables: 'Group',
    ungroupTables: 'Ungroup',
    groupPickHint: 'Click another table to group it with this one.',
    groupPickCancel: 'Grouping cancelled',
    groupOk: (nums, covers) => `Tables ${nums} grouped · ${covers} covers`,
    ungroupOk: 'Tables ungrouped',
    undoAction: 'Undo',
    deleteUndone: 'Table restored',
    ungroupUndone: 'Group restored',
    bulkGroup: 'Group selection',
    bulkOkGroup: (n) => `${n} tables grouped`,
    groupCovers: (n) => `${n} covers`,
    groupedWith: (nums) => `Grouped with ${nums}`,
    templatesTitle: 'Room templates',
    templatesDesc: 'Start from a pre-built layout · you can modify it after.',
    tplBistro: 'Bistro · 30 covers',
    tplBistroDesc: '8 indoor tables + small terrace · 1 bar zone',
    tplResto: 'Restaurant · 60 covers',
    tplRestoDesc: 'Main hall 12 tables, terrace, private room',
    tplCafe: 'Café · 20 covers',
    tplCafeDesc: '6 high tables, counter, 3 round tables',
    tplBrasserie: 'Brasserie terrace · 80 covers',
    tplBrasserieDesc: 'Large terrace 10 tables, hall 8 tables, bar',
    tplBlank: 'Blank plan',
    tplBlankDesc: 'Start from scratch · one empty zone',
    tplApply: 'Load this template',
    tplApplyConfirm: (n) => `Load "${n}"?`,
    tplApplyConfirmDesc: 'The current plan will be replaced. Export first if needed.',
    tplLoaded: (n) => `${n} loaded`,
    tplLoadedDesc: 'Initial layout ready · customize freely.',
    emptyTitle: 'Start by choosing a template',
    emptyDesc: 'Or create your first table, you can change everything later.',
    emptyChoose: 'Choose a template',
    emptyBlank: 'Start blank',
    rosterTitle: 'Team on shift',
    rosterHint: 'Drag a chip onto a table or a zone',
    rosterShift: 'Evening shift',
    rosterUnassigned: 'Unassigned',
    rosterTables: (n) => `${n} table${n === 1 ? '' : 's'}`,
    rosterCovers: (n) => `${n} covers`,
    rosterEmpty: 'Nobody on shift. Add a server here, or fill in your team on the Team page · it shows up automatically.',
    rosterAdd: '+ Add a server',
    rosterAddTitle: 'Add a server',
    rosterAddDesc: 'They join the team on shift and can be dragged onto a table or a zone.',
    rosterAddLabel: 'Server name',
    rosterAddPlaceholder: 'e.g. Karim',
    rosterAddOk: 'Add',
    rosterAddDone: (n) => `${n} added to the shift`,
    rosterRemove: 'Remove from shift',
    rosterRemoveDone: (n) => `${n} removed from the shift`,
    rosterRemoveDoneDesc: (n) => n ? `${n} tables freed.` : 'No table was assigned.',
    clearAssign: 'Clear all assignments',
    clearAssignTitle: 'Clear all assignments?',
    clearAssignDesc: 'No server will be assigned to any table. Assignments will be empty until reassigned.',
    clearAssignOk: 'Clear',
    clearAssignDone: 'Assignments cleared',
    clearAssignDoneDesc: 'All tables are now free of server assignment.',
    assignDone: (s, t) => `${s} assigned to ${t}`,
    assignDoneDesc: 'Highlighted on the plan · synced with the server app.',
    unassignDone: (t) => `${t} unassigned`,
    rotateTitle: 'Configure rotation',
    rotateCTA: 'Configure',
    rotateDesc: 'When your servers alternate, they stay motivated and learn every table.',
    rotatePeriod: 'Period',
    rotateDaily: 'Every day',
    rotateShift: 'Every shift',
    rotateWeekly: 'Every week',
    rotateCustom: 'Custom',
    rotateStrategy: 'Strategy',
    rotZones: 'Zone rotation',
    rotZonesDesc: 'Servers rotate across zones (recommended)',
    rotTables: 'Table rotation',
    rotTablesDesc: 'Round-robin on all tables',
    rotPairs: 'Manual pair swap',
    rotPairsDesc: 'You choose the pairs manually',
    rotPreview: 'Preview of next 3 rotations',
    rotFairness: 'Fairness per server',
    rotApply: 'Apply rotation',
    rotApplied: 'Rotation applied',
    rotAppliedDesc: 'All servers notified on their app · plan updated.',
    rotNow: 'Rotate now',
    rotNowDone: 'Rotation done',
    rotNowDoneDesc: 'New assignments active · servers notified.',
    rotHistoryTitle: 'This week history',
    rotHistoryHint: 'Visually check that nobody stays on the same zone too long.',
    rotNoneTitle: 'No rotation configured',
    rotNoneDesc: 'Set up a rotation so servers don\'t stay on the same table for months.',
    rotNoneCTA: 'Configure',
    fairnessLow: 'has done this zone too much, turn coming up',
    fairnessHigh: 'balanced rotation',
    legendTitle: 'Statuses',
    cancel: 'Cancel',
    close: 'Close',
    save2: 'Save',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    soonAvailable: 'Coming soon',
    /* Scene picker */
    sceneLabel: 'Zone backdrop',
    sceneHint: (n) => `Change the visual backdrop of${n ? ` "${n}"` : ' this zone'}, purely cosmetic, doesn't affect your tables.`,
    sceneSalle: 'Indoor dining',
    sceneTerrasse: 'Outdoor terrace',
    sceneBar: 'Bar / Counter',
    sceneEtage: 'Mezzanine / Upper',
    scenePrive: 'Private room',
    sceneBlank: 'Blank (no fixtures)',
    floorRDC: 'Ground floor',
    floorEtage: 'Upper floor',
    roomLabel: (zone) => `${zone} · owner view`,
    viewOwner: 'owner view',
    floorCount: (occ, total) => `${total} table${total === 1 ? '' : 's'} · ${occ} occupied`,
  },
  ar: {
    title: 'مخطط القاعة',
    subtitle: (name, n, occ) => `${name} · ${n} طاولة · ${occ} قيد الخدمة`,
    tagPdS: 'مخطط القاعة',
    modeLayout: 'التصميم',
    modeAssign: 'الإسناد',
    modeRotate: 'التدوير',
    modeLayoutDesc: 'اسحب الطاولات · انقر للتعديل · أضف الجدران والأبواب والنباتات لتخيل القاعة.',
    modeAssignDesc: 'اسحب نادلًا فوق طاولة لإسنادها · انقر طاولة لإعادة الإسناد.',
    modeRotateDesc: 'قم بتدوير النوادل بين المناطق والطاولات حتى لا يملّوا، العدالة تلقائية.',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    savedButton: 'تم الحفظ',
    saved: 'تم حفظ المخطط',
    savedDesc: 'تم حفظ جميع تغييرات مخطط القاعة بنجاح.',
    reset: 'إعادة تعيين',
    resetTitle: 'إعادة تعيين المخطط؟',
    resetDesc: 'يحذف كل الطاولات والمناطق والإسنادات · يحمّل القالب الافتراضي. لا يمكن التراجع.',
    resetCancel: 'إلغاء',
    resetConfirm: 'إعادة تعيين',
    resetDone: 'تمت إعادة تعيين المخطط',
    resetDoneDesc: 'تم تحميل القالب الافتراضي · 16 طاولة، 3 مناطق.',
    templates: 'القوالب',
    export: 'تصدير المخطط',
    exportToast: 'تم تصدير المخطط',
    exportDesc: 'PDF بحجم A3 · صفحة واحدة · جاهز للطباعة أو WhatsApp.',
    kpiTables: 'الطاولات',
    kpiCovers: 'المقاعد',
    kpiZones: 'المناطق',
    kpiServers: 'النوادل',
    addZone: 'إضافة منطقة',
    addZoneDesc: 'ستظهر منطقة جديدة في التبويبات · يمكنك ملؤها بالطاولات.',
    zoneName: 'اسم المنطقة',
    zoneAdd: 'إنشاء',
    zoneAdded: 'تمت إضافة المنطقة',
    zoneAddedDesc: (n) => `تم إنشاء المنطقة "${n}" · انقر لاختيارها.`,
    renameZone: 'إعادة تسمية',
    renameZoneTitle: 'إعادة تسمية المنطقة',
    deleteZone: 'حذف المنطقة',
    deleteZoneTitle: 'حذف هذه المنطقة؟',
    deleteZoneDesc: (n, c) => `سيتم حذف المنطقة "${n}" و${c} طاولاتها. لا يمكن التراجع.`,
    deleteZoneOk: 'حذف',
    deleteZoneDone: 'تم حذف المنطقة',
    deleteZoneNoLast: 'المنطقة الأخيرة',
    deleteZoneNoLastDesc: 'يجب الإبقاء على منطقة نشطة واحدة على الأقل.',
    zoneRenamedDesc: (n) => `تمت إعادة تسمية المنطقة إلى "${n}".`,
    paletteTitle: 'إضافة طاولة',
    paletteHint: 'انقر للإضافة، تظهر الطاولة في وسط المنطقة.',
    editHint: 'انقر أي عنصر موضوع · طاولة، بار، مطبخ، نبتة · لتغيير حجمه أو حذفه.',
    structTitle: 'العناصر الهيكلية',
    structHint: 'جدران، أبواب، نوافذ ونباتات، للعرض فقط.',
    elWall: 'جدار',
    elDoor: 'باب',
    elWindow: 'نافذة',
    elColumn: 'عمود',
    elPlant: 'نبتة',
    tRound: 'مستديرة',
    tSquare: 'مربعة',
    tRect: 'مستطيلة',
    tBar: 'بار / كاونتر',
    tHigh: 'طاولة عالية',
    seats: 'مقاعد', tableName: 'طاولة',
    addedTableToast: (id) => `تمت إضافة الطاولة ${id}`,
    addedTableDesc: (s, z) => `${s} مقاعد · ${z} · اسحبها للموقع.`,
    addedElementToast: 'تمت إضافة العنصر',
    addedElementDesc: 'اسحب للموقع · انقر للتدوير.',
    viewNuit: 'عرض ليلي · وحدة الخدمة',
    viewJour: 'عرض نهاري · الخامات والديكور',
    snapOn: 'محاذاة',
    snapOff: 'حر',
    snapHint: 'المحاذاة تصفّ الطاولات على الشبكة',
    inspectorTitle: (id) => `طاولة ${id}`,
    inspectorNum: 'الرقم',
    inspectorType: 'النوع',
    inspectorSeats: 'المقاعد',
    inspectorStatus: 'الحالة',
    inspectorNotes: 'ملاحظات',
    inspectorServer: 'النادل المعين',
    reservationName: 'اسم الحجز',
    reservationTime: 'الوقت',
    reservationNamePlaceholder: 'مثال: بنعلي',
    inspectorRotate: 'تدوير',
    inspectorDuplicate: 'نسخ',
    inspectorDelete: 'حذف',
    inspectorDone: 'تم حفظ التعديلات',
    inspectorUnassigned: 'لا أحد',
    inspectorAddServer: '+ نادل آخر',
    inspectorNoStaff: 'لا يوجد نادل في فريقك بعد. أضفهم من الفريق لتعيينهم على الطاولات.',
    statusFree: 'متاحة',
    statusOccupied: 'مشغولة',
    statusReserved: 'محجوزة',
    statusCleaning: 'للتنظيف',
    selection: 'المحدد',
    bulkAlignH: 'محاذاة أفقيًا',
    bulkAlignV: 'محاذاة عموديًا',
    bulkDistH: 'توزيع أفقي',
    bulkDistV: 'توزيع عمودي',
    bulkDelete: 'حذف',
    bulkClear: 'إلغاء التحديد',
    bulkSetStatus: 'الحالة',
    bulkOkAlign: 'تمت محاذاة الطاولات',
    bulkOkDist: 'تم توزيع الطاولات بالتساوي',
    bulkOkDelete: (n) => `تم حذف ${n} طاولة`,
    bulkOkStatus: (n, s) => `تم تعيين ${n} طاولة على ${s}`,
    bulkHintNone: 'اضغط Shift وانقر لاختيار عدة طاولات · 2 على الأقل للمحاذاة.',
    groupTables: 'تجميع',
    ungroupTables: 'فصل',
    groupPickHint: 'انقر على طاولة أخرى لتجميعها مع هذه.',
    groupPickCancel: 'تم إلغاء التجميع',
    groupOk: (nums, covers) => `تم تجميع الطاولات ${nums} · ${covers} مقعدًا`,
    ungroupOk: 'تم فصل الطاولات',
    undoAction: 'تراجع',
    deleteUndone: 'تمت استعادة الطاولة',
    ungroupUndone: 'تمت استعادة المجموعة',
    bulkGroup: 'تجميع المحدد',
    bulkOkGroup: (n) => `تم تجميع ${n} طاولات`,
    groupCovers: (n) => `${n} مقعدًا`,
    groupedWith: (nums) => `مجمّعة مع ${nums}`,
    templatesTitle: 'قوالب القاعة',
    templatesDesc: 'ابدأ بترتيب جاهز · يمكنك تعديله لاحقًا.',
    tplBistro: 'بيسترو · 30 مقعدًا',
    tplBistroDesc: '8 طاولات داخلية + شرفة صغيرة · منطقة بار واحدة',
    tplResto: 'مطعم · 60 مقعدًا',
    tplRestoDesc: 'قاعة رئيسية 12 طاولة، شرفة، صالون خاص',
    tplCafe: 'مقهى · 20 مقعدًا',
    tplCafeDesc: '6 طاولات عالية، كاونتر، 3 طاولات مستديرة',
    tplBrasserie: 'شرفة برآسري · 80 مقعدًا',
    tplBrasserieDesc: 'شرفة كبيرة 10 طاولات، قاعة 8 طاولات، بار',
    tplBlank: 'مخطط فارغ',
    tplBlankDesc: 'ابدأ من الصفر · منطقة فارغة واحدة',
    tplApply: 'تحميل هذا القالب',
    tplApplyConfirm: (n) => `تحميل "${n}"؟`,
    tplApplyConfirmDesc: 'سيتم استبدال المخطط الحالي. صدّر أولًا إن أردت.',
    tplLoaded: (n) => `تم تحميل ${n}`,
    tplLoadedDesc: 'الترتيب الأولي جاهز · خصّص بحرية.',
    emptyTitle: 'ابدأ باختيار قالب',
    emptyDesc: 'أو أنشئ أول طاولة، يمكنك تعديل كل شيء لاحقًا.',
    emptyChoose: 'اختر قالبًا',
    emptyBlank: 'ابدأ فارغًا',
    rosterTitle: 'الفريق في الخدمة',
    rosterHint: 'اسحب الشارة فوق طاولة أو منطقة',
    rosterShift: 'وردية المساء',
    rosterUnassigned: 'غير معيّن',
    rosterTables: (n) => `${n} طاولات`,
    rosterCovers: (n) => `${n} مقاعد`,
    rosterEmpty: 'لا أحد في الخدمة. أضف نادلًا هنا، أو سجّل فريقك في صفحة الفريق · سيظهر تلقائيًا.',
    rosterAdd: '+ إضافة نادل',
    rosterAddTitle: 'إضافة نادل',
    rosterAddDesc: 'سينضم إلى الفريق في الخدمة ويمكن سحبه فوق طاولة أو منطقة.',
    rosterAddLabel: 'اسم النادل',
    rosterAddPlaceholder: 'مثال: كريم',
    rosterAddOk: 'إضافة',
    rosterAddDone: (n) => `${n} أُضيف إلى الخدمة`,
    rosterRemove: 'إزالة من الخدمة',
    rosterRemoveDone: (n) => `${n} أُزيل من الخدمة`,
    rosterRemoveDoneDesc: (n) => n ? `${n} طاولات تحرّرت.` : 'لم تكن أي طاولة مسندة.',
    clearAssign: 'مسح كل الإسنادات',
    clearAssignTitle: 'مسح كل الإسنادات؟',
    clearAssignDesc: 'لن يكون أي نادل مسندًا لأي طاولة. ستبقى فارغة حتى إعادة الإسناد.',
    clearAssignOk: 'مسح',
    clearAssignDone: 'تم مسح الإسنادات',
    clearAssignDoneDesc: 'كل الطاولات حرة من إسناد النوادل الآن.',
    assignDone: (s, t) => `تم إسناد ${s} للطاولة ${t}`,
    assignDoneDesc: 'مميز على المخطط · متزامن مع تطبيق النادل.',
    unassignDone: (t) => `تم تحرير ${t}`,
    rotateTitle: 'إعداد التدوير',
    rotateCTA: 'إعداد',
    rotateDesc: 'حين يتناوب النوادل، يبقون متحفزين ويتعلمون كل الطاولات.',
    rotatePeriod: 'الفترة',
    rotateDaily: 'كل يوم',
    rotateShift: 'كل وردية',
    rotateWeekly: 'كل أسبوع',
    rotateCustom: 'مخصص',
    rotateStrategy: 'الاستراتيجية',
    rotZones: 'تدوير المناطق',
    rotZonesDesc: 'النوادل يتنقلون بين المناطق (موصى به)',
    rotTables: 'تدوير الطاولات',
    rotTablesDesc: 'دورة كاملة على جميع الطاولات',
    rotPairs: 'تبادل أزواج يدوي',
    rotPairsDesc: 'تختار أنت الأزواج يدويًا',
    rotPreview: 'معاينة آخر 3 تدويرات قادمة',
    rotFairness: 'العدالة لكل نادل',
    rotApply: 'تطبيق التدوير',
    rotApplied: 'تم تطبيق التدوير',
    rotAppliedDesc: 'تم إعلام كل النوادل عبر تطبيقهم · تم تحديث المخطط.',
    rotNow: 'دوّر الآن',
    rotNowDone: 'تم التدوير',
    rotNowDoneDesc: 'الإسنادات الجديدة نشطة · النوادل تلقوا الإشعار.',
    rotHistoryTitle: 'سجل هذا الأسبوع',
    rotHistoryHint: 'تحقق بصريًا أن أحدًا لا يبقى في نفس المنطقة طويلًا.',
    rotNoneTitle: 'لم يتم إعداد تدوير',
    rotNoneDesc: 'اضبط تدويرًا حتى لا يبقى النوادل على نفس الطاولة لأشهر.',
    rotNoneCTA: 'إعداد',
    fairnessLow: 'عمل هذه المنطقة كثيرًا، جاء دوره',
    fairnessHigh: 'تدوير متوازن',
    legendTitle: 'الحالات',
    cancel: 'إلغاء',
    close: 'إغلاق',
    save2: 'حفظ',
    days: ['اث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'],
    soonAvailable: 'قريبًا',
    /* Scene picker */
    sceneLabel: 'ديكور المنطقة',
    sceneHint: (n) => `غيّر الخلفية البصرية${n ? ` لمنطقة "${n}"` : ' لهذه المنطقة'}، تجميلي فقط، لا يؤثر على طاولاتك.`,
    sceneSalle: 'صالة داخلية',
    sceneTerrasse: 'تراس خارجي',
    sceneBar: 'حانة / كاونتر',
    sceneEtage: 'الطابق العلوي',
    scenePrive: 'صالون خاص',
    sceneBlank: 'فارغ (بدون تجهيزات)',
    floorRDC: 'الطابق الأرضي',
    floorEtage: 'الطابق الأول',
    roomLabel: (zone) => `${zone} · رؤية المالك`,
    viewOwner: 'رؤية المالك',
    floorCount: (occ, total) => `${total} طاولة · ${occ} مشغولة`,
  },
};

/* ─── v2 strings ──────────────────────────────────────────────────────────
 *   Added by assignment rather than inline, so the three language blocks
 *   above stay diff-clean and a missing key is a visible undefined instead
 *   of a silent French fallback in an Arabic UI. */
Object.assign(PDS_STR.fr, {
  undo: 'Annuler', redo: 'Rétablir',
  undoNothing: 'Rien à annuler', redoNothing: 'Rien à rétablir',
  unitCm: 'cm', deletedSuffix: 'supprimé',
  roomTitle: 'La salle', roomHint: 'Sol, murs et dimensions de cette zone.',
  roomHintNuit: 'Dimensions de cette zone.',
  roomFloor: 'Sol', roomWall: 'Murs', roomFinish: 'Finition',
  roomW: 'Larg.', roomH: 'Prof.', roomWallW: 'Mur',
  finplain: 'Uni', finterrazzo: 'Terrazzo', finzellige: 'Zellige',
  finbois: 'Parquet', fincarreaux: 'Carreaux',
  grpservice: 'Service', grparchi: 'Architecture', grpsalle: 'Salle',
  fixcomptoir: 'Comptoir', fixcuisine: 'Cuisine', fixpasse: 'Passe-plat',
  fixcaisse: 'Caisse', fixvitrine: 'Vitrine', fixmur: 'Mur', fixporte: 'Entrée',
  fixfenetre: 'Fenêtre', fixcolonne: 'Colonne', fixescalier: 'Escalier',
  fixwc: 'WC', fixbanquette: 'Banquette', fixclaustra: 'Claustra',
  fixplante: 'Plante', fixtapis: 'Tapis', fixgarde: 'Garde-corps', fixtexte: 'Texte',
  matbone: 'Ivoire', matsand: 'Sable', matstone: 'Pierre', matclay: 'Argile',
  matoak: 'Chêne', matbrass: 'Laiton', matterra: 'Terracotta', matwalnut: 'Noyer',
  matsage: 'Sauge', matebony: 'Ébène', matcoal: 'Charbon', matink: 'Encre',
  matatlas: 'Atlas', matriad: 'Riad', matmint: 'Menthe', matglass: 'Verre',
  inspectorSeats: 'Couverts', inspectorLabel: 'Libellé', inspectorSize: 'Taille',
  inspectorRotation: 'Orientation', inspectorMaterial: 'Matière', inspectorDepth: 'Profondeur',
  layerBack: 'Arrière', layerFront: 'Avant',
  lock: 'Verrouiller', unlock: 'Déverrouiller',
  lockedHint: 'Verrouillé · déverrouillez pour modifier',
  rotateHint: 'Faire pivoter · Maj pour 15°',
  noRoom: 'Pas de place libre ici',
  ambianceLabel: 'Ambiance', customColor: 'Couleur libre',
  wizTitle: 'Composons votre salle', wizDesc: 'Huit questions, puis trois plans meublés à comparer.',
  scanSalle: 'Scanner ma salle', scanUnavailable: 'Scan indisponible',
  wizVenue: 'Type d’établissement', wizFloors: 'Combien d’étages ?',
  wizExtras: 'Vous avez aussi…', wizDims: 'Dimensions de la salle',
  wizW: 'Largeur', wizH: 'Profondeur', wizTables: 'Combien de tables ?',
  wizKitchen: 'La cuisine est de quel côté ?', wizEntrance: 'L’entrée est de quel côté ?',
  wizAlso: 'Aussi présent', wizGenerate: 'Composer mon plan', wizBack: 'Modifier',
  wizAgain: 'Régénérer', wizApply: 'Personnaliser ce plan',
  wizCardsNote: 'Chaque plan respecte des passages de service. Vous pourrez tout déplacer ensuite.',
  wizDone: (c) => `Plan composé · ${c} couverts`,
  wizDoneDesc: (n, a) => `${n} tables, passages de ${a} cm. Tout reste modifiable.`,
  wizShort: (n, r) => `${n} des ${r} tables demandées ne tiennent pas avec ces passages`,
  venuerestaurant: 'Restaurant', venuecafe: 'Café', venuesnack: 'Snack',
  venuepatisserie: 'Pâtisserie', venuerooftop: 'Rooftop',
  extraterrasse: 'Terrasse', extrapatio: 'Patio', extramezzanine: 'Mezzanine',
  extrasalon: 'Salon privé', extrabar: 'Bar',
  walln: 'Nord', walle: 'Est', walls: 'Sud', wallw: 'Ouest',
  vardense: 'Dense', varconfort: 'Confort', varbanquettes: 'Banquettes',
  covers: 'couverts', tables: 'tables', cover: 'couvert',
  aisleOf: (a) => `passages ${a} cm`,
  roomBackdrop: 'Fond', backdropNone: 'Aucun fond',
  ambriad: 'Riad', ambmarine: 'Bord de mer', ambbistrot: 'Néo-bistrot', ambjardin: 'Jardin',
  ambianceApplied: (n) => `Ambiance ${n} appliquée`,
  ambianceDesc: 'Sol, murs, tables et fond repeints ensemble. Les pièces peintes à la main sont conservées.',
  blockedHint: 'Chevauchement · relâchez pour poser à côté',
});
Object.assign(PDS_STR.en, {
  undo: 'Undo', redo: 'Redo',
  undoNothing: 'Nothing to undo', redoNothing: 'Nothing to redo',
  unitCm: 'cm', deletedSuffix: 'deleted',
  roomTitle: 'The room', roomHint: 'Floor, walls and dimensions of this zone.',
  roomHintNuit: 'Dimensions of this zone.',
  roomFloor: 'Floor', roomWall: 'Walls', roomFinish: 'Finish',
  roomW: 'Width', roomH: 'Depth', roomWallW: 'Wall',
  finplain: 'Plain', finterrazzo: 'Terrazzo', finzellige: 'Zellige',
  finbois: 'Wood', fincarreaux: 'Checker',
  grpservice: 'Service', grparchi: 'Architecture', grpsalle: 'Room',
  fixcomptoir: 'Counter', fixcuisine: 'Kitchen', fixpasse: 'Pass',
  fixcaisse: 'Till', fixvitrine: 'Display', fixmur: 'Wall', fixporte: 'Entrance',
  fixfenetre: 'Window', fixcolonne: 'Column', fixescalier: 'Stairs',
  fixwc: 'WC', fixbanquette: 'Banquette', fixclaustra: 'Screen',
  fixplante: 'Plant', fixtapis: 'Rug', fixgarde: 'Railing', fixtexte: 'Text',
  matbone: 'Bone', matsand: 'Sand', matstone: 'Stone', matclay: 'Clay',
  matoak: 'Oak', matbrass: 'Brass', matterra: 'Terracotta', matwalnut: 'Walnut',
  matsage: 'Sage', matebony: 'Ebony', matcoal: 'Charcoal', matink: 'Ink',
  matatlas: 'Atlas', matriad: 'Riad', matmint: 'Mint', matglass: 'Glass',
  inspectorSeats: 'Covers', inspectorLabel: 'Label', inspectorSize: 'Size',
  inspectorRotation: 'Orientation', inspectorMaterial: 'Material', inspectorDepth: 'Depth',
  layerBack: 'Send back', layerFront: 'Bring front',
  lock: 'Lock', unlock: 'Unlock',
  lockedHint: 'Locked · unlock to edit',
  rotateHint: 'Rotate · hold Shift for 15°',
  noRoom: 'No free space here',
  ambianceLabel: 'Ambiance', customColor: 'Custom colour',
  wizTitle: 'Let’s lay out your room', wizDesc: 'Eight questions, then three furnished plans to compare.',
  scanSalle: 'Scan my room', scanUnavailable: 'Scan unavailable',
  wizVenue: 'Type of venue', wizFloors: 'How many floors?',
  wizExtras: 'You also have…', wizDims: 'Room dimensions',
  wizW: 'Width', wizH: 'Depth', wizTables: 'How many tables?',
  wizKitchen: 'Which side is the kitchen?', wizEntrance: 'Which side is the entrance?',
  wizAlso: 'Also present', wizGenerate: 'Build my plan', wizBack: 'Edit answers',
  wizAgain: 'Regenerate', wizApply: 'Customise this plan',
  wizCardsNote: 'Every plan keeps real service aisles. You can move anything afterwards.',
  wizDone: (c) => `Plan built · ${c} covers`,
  wizDoneDesc: (n, a) => `${n} tables, ${a} cm aisles. Everything stays editable.`,
  wizShort: (n, r) => `${n} of the ${r} tables asked for do not fit at these aisles`,
  venuerestaurant: 'Restaurant', venuecafe: 'Café', venuesnack: 'Snack',
  venuepatisserie: 'Pâtisserie', venuerooftop: 'Rooftop',
  extraterrasse: 'Terrace', extrapatio: 'Patio', extramezzanine: 'Mezzanine',
  extrasalon: 'Private room', extrabar: 'Bar',
  walln: 'North', walle: 'East', walls: 'South', wallw: 'West',
  vardense: 'Dense', varconfort: 'Comfort', varbanquettes: 'Banquettes',
  covers: 'covers', tables: 'tables', cover: 'cover',
  aisleOf: (a) => `${a} cm aisles`,
  roomBackdrop: 'Backdrop', backdropNone: 'No backdrop',
  ambriad: 'Riad', ambmarine: 'Seaside', ambbistrot: 'Neo-bistro', ambjardin: 'Garden',
  ambianceApplied: (n) => `${n} ambiance applied`,
  ambianceDesc: 'Floor, walls, tables and backdrop repainted together. Hand-picked pieces are kept.',
  blockedHint: 'Overlapping · release to settle beside it',
});
Object.assign(PDS_STR.ar, {
  undo: 'تراجع', redo: 'إعادة',
  undoNothing: 'لا شيء للتراجع عنه', redoNothing: 'لا شيء لإعادته',
  unitCm: 'سم', deletedSuffix: 'حُذف',
  roomTitle: 'القاعة', roomHint: 'الأرضية والجدران وأبعاد هذه المنطقة.',
  roomHintNuit: 'أبعاد هذه المنطقة.',
  roomFloor: 'الأرضية', roomWall: 'الجدران', roomFinish: 'التشطيب',
  roomW: 'العرض', roomH: 'العمق', roomWallW: 'الجدار',
  finplain: 'سادة', finterrazzo: 'تيرازو', finzellige: 'زليج',
  finbois: 'خشب', fincarreaux: 'مربعات',
  grpservice: 'الخدمة', grparchi: 'العمارة', grpsalle: 'القاعة',
  fixcomptoir: 'الكونتوار', fixcuisine: 'المطبخ', fixpasse: 'ممر الأطباق',
  fixcaisse: 'الصندوق', fixvitrine: 'واجهة العرض', fixmur: 'جدار', fixporte: 'المدخل',
  fixfenetre: 'نافذة', fixcolonne: 'عمود', fixescalier: 'درج',
  fixwc: 'المرافق', fixbanquette: 'أريكة', fixclaustra: 'حاجز',
  fixplante: 'نبتة', fixtapis: 'زربية', fixgarde: 'حاجز واقٍ', fixtexte: 'نص',
  matbone: 'عاجي', matsand: 'رملي', matstone: 'حجري', matclay: 'طيني',
  matoak: 'بلوط', matbrass: 'نحاس', matterra: 'فخاري', matwalnut: 'جوز',
  matsage: 'مريمية', matebony: 'أبنوس', matcoal: 'فحمي', matink: 'حبري',
  matatlas: 'أطلس', matriad: 'رياض', matmint: 'نعناع', matglass: 'زجاج',
  inspectorSeats: 'المقاعد', inspectorLabel: 'التسمية', inspectorSize: 'الحجم',
  inspectorRotation: 'الاتجاه', inspectorMaterial: 'المادة', inspectorDepth: 'العمق',
  layerBack: 'إلى الخلف', layerFront: 'إلى الأمام',
  lock: 'قفل', unlock: 'فتح',
  lockedHint: 'مقفل · افتح القفل للتعديل',
  rotateHint: 'تدوير · اضغط Shift لـ 15°',
  noRoom: 'لا توجد مساحة فارغة هنا',
  ambianceLabel: 'الأجواء', customColor: 'لون حر',
  wizTitle: 'لنرتّب قاعتك', wizDesc: 'ثمانية أسئلة، ثم ثلاثة مخططات مؤثّثة للمقارنة.',
  scanSalle: 'مسح قاعتي بالصورة', scanUnavailable: 'المسح غير متاح',
  wizVenue: 'نوع المحل', wizFloors: 'كم طابقًا؟',
  wizExtras: 'لديك أيضًا…', wizDims: 'أبعاد القاعة',
  wizW: 'العرض', wizH: 'العمق', wizTables: 'كم طاولة؟',
  wizKitchen: 'في أي جهة المطبخ؟', wizEntrance: 'في أي جهة المدخل؟',
  wizAlso: 'موجود أيضًا', wizGenerate: 'أنشئ مخططي', wizBack: 'تعديل',
  wizAgain: 'إعادة الإنشاء', wizApply: 'خصّص هذا المخطط',
  wizCardsNote: 'كل مخطط يحترم ممرات الخدمة. يمكنك تحريك كل شيء بعد ذلك.',
  wizDone: (c) => `تم إنشاء المخطط · ${c} مقعدًا`,
  wizDoneDesc: (n, a) => `${n} طاولة، ممرات ${a} سم. كل شيء قابل للتعديل.`,
  wizShort: (n, r) => `${n} من ${r} طاولة مطلوبة لا تتّسع بهذه الممرات`,
  venuerestaurant: 'مطعم', venuecafe: 'مقهى', venuesnack: 'سناك',
  venuepatisserie: 'حلويات', venuerooftop: 'سطح',
  extraterrasse: 'تراس', extrapatio: 'فناء', extramezzanine: 'ميزانين',
  extrasalon: 'صالون خاص', extrabar: 'بار',
  walln: 'شمال', walle: 'شرق', walls: 'جنوب', wallw: 'غرب',
  vardense: 'مكثّف', varconfort: 'مريح', varbanquettes: 'أرائك',
  covers: 'مقعدًا', tables: 'طاولة', cover: 'مقعد',
  aisleOf: (a) => `ممرات ${a} سم`,
  roomBackdrop: 'الخلفية', backdropNone: 'بدون خلفية',
  ambriad: 'رياض', ambmarine: 'شاطئ', ambbistrot: 'بيسترو', ambjardin: 'حديقة',
  ambianceApplied: (n) => `تم تطبيق أجواء ${n}`,
  ambianceDesc: 'الأرضية والجدران والطاولات والخلفية أُعيد طلاؤها معًا. القطع الملوّنة يدويًا تبقى كما هي.',
  blockedHint: 'تداخل · أفلت ليستقر بجانبه',
});

/* ─── v3 strings · the live room, honest actions, editor tools ───────────
 *   Same rule as v2: one block per language, a missing key shows up as
 *   `undefined` in that language instead of silently falling back. */
Object.assign(PDS_STR.fr, {
  modeLayoutDesc: 'Glissez pour placer · cliquez pour modifier.',
  modeAssignDesc: 'Glissez un serveur sur une table ou un onglet de zone.',
  modeRotateDesc: 'Les serveurs changent de zone à chaque période.',
  snapOn: 'Grille', snapOff: 'Libre', snapHint: 'Aligner les objets sur une grille de 16 cm',
  statusFree: 'Libre', statusOrdering: 'À commander', statusOccupied: 'En cours', statusBill: 'Addition',
  statusPaid: 'Réglée', statusReserved: 'Réservée', statusOut: 'Hors service', statusCleaning: 'Réglée',
  kpiTablesD: (free, n) => `${free} libre${free > 1 ? 's' : ''} sur ${n}`,
  kpiCoversLive: 'COUVERTS EN SALLE', kpiCoversD: (cap) => `capacité ${cap}`,
  kpiCoversPlan: 'CAPACITÉ', kpiCoversPlanD: (n) => `${n} table${n > 1 ? 's' : ''}`,
  kpiBills: 'ADDITIONS OUVERTES', kpiBillsD: (n) => n ? `${n} addition${n > 1 ? 's' : ''} demandée${n > 1 ? 's' : ''}` : 'aucune demandée',
  kpiZonesD: (n) => n > 1 ? `${n} zones` : '1 zone',
  kpiServersD: (on, n) => on == null ? `${n} dans le plan` : `${on} en service sur ${n}`,
  mad: (v) => `${Math.round(v).toLocaleString('fr-FR')} MAD`,
  liveOn: 'Caisse en direct', liveStale: (t) => `Hors ligne · vu à ${t}`, liveDemo: 'Démo · statuts saisis à la main',
  liveOffline: 'Caisse injoignable · statuts du plan', liveNone: 'Statuts saisis à la main',
  liveNoTill: 'Aucune caisse connectée', liveTillAway: (t) => `Caisse hors ligne · vue à ${t}`,
  liveTitle: 'En ce moment', liveBills: 'Additions demandées', liveCheck: 'Ouvertes depuis plus de 4 h',
  liveCheckHint: 'Probablement oubliées sur la caisse. Vérifiez puis libérez-les depuis la caisse.',
  liveUpcoming: 'Réservations du jour', liveUnplaced: 'Sans table', livePlace: 'Placer',
  livePlaced: (n, t) => `${n} placé·e à la table ${t}`, liveNoFit: 'Aucune table libre ne convient',
  liveNoBookings: 'Aucune réservation aujourd’hui.', liveToday: 'Aujourd’hui',
  liveTurns: (n) => `${n} tour${n > 1 ? 's' : ''}`, liveOpen: (n) => `${n} en cours`, liveAvg: (m) => `${m} min en moyenne`,
  liveRevSeat: (v) => `${v} par place`, liveNoStats: 'Les tours et le chiffre par table apparaissent dès la première addition encaissée.',
  checkTable: 'à vérifier', since: (l) => `depuis ${l}`, nextAt: (t, n) => `${t} · ${n}`,
  tillStatus: 'Statut de la caisse', tillStatusHint: 'Ce statut vient de la caisse. Il change quand l’équipe encaisse ou ouvre la table.',
  holdLabel: 'Réservation ou blocage', holdNone: 'Aucun', holdReserved: 'Réservée', holdOut: 'Hors service',
  coversNow: (c, s) => `${c} / ${s} couverts`, billNow: 'Addition en cours', liveAllFree: 'Toutes les tables sont libres.',
  filterAll: 'Tout afficher', heatLabel: 'Afficher', heatStatus: 'Statut', heatRevenue: 'Chiffre', heatTurns: 'Tours',
  heatNeedsLive: 'Disponible quand la caisse est connectée',
  zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', zoomFit: 'Ajuster', zoomFitHint: 'Ajuster la salle à l’écran',
  shapeRound: 'Ronde', shapeSquare: 'Carrée', shapeRect: 'Longue', shapeBar: 'Comptoir', shapeHigh: 'Haute',
  paletteSeats: 'Places', paletteHint: 'Choisissez le nombre de places, puis la forme.',
  editHint: 'Cliquez un objet pour le modifier. Maj ou ⌘ pour en sélectionner plusieurs, ou tracez un cadre.',
  bulkHintNone: 'Tracez un cadre sur le plan, ou Maj/⌘ + clic, pour sélectionner plusieurs tables.',
  kbdHint: 'Flèches pour déplacer · ⌘D dupliquer · ⌘C / ⌘V · Suppr pour effacer',
  renumber: 'Renuméroter', renumberTitle: 'Renuméroter les tables',
  renumberDesc: 'Les numéros suivent l’ordre de lecture de chaque zone, de gauche à droite puis de haut en bas.',
  renumberFlat: 'Numéros continus', renumberFlatDesc: '1, 2, 3… dans toutes les zones',
  renumberPrefix: 'Une centaine par zone', renumberPrefixDesc: 'Première zone 1, 2…, puis 101, 102…, puis 201… Lisible sur le pavé de la caisse.',
  renumberOk: 'Renuméroter', renumberDone: (n) => `${n} tables renumérotées`,
  dupNums: (nums) => `Numéros en double : ${nums}`, dupNumField: 'Ce numéro est déjà pris',
  zoneMoveL: 'Déplacer à gauche', zoneMoveR: 'Déplacer à droite', zoneDuplicate: 'Dupliquer la zone',
  zoneDuplicated: (n) => `Zone « ${n} » dupliquée`, zoneColor: 'Couleur de la zone', zoneCopy: (n) => `${n} (copie)`,
  zoneTools: 'Zone', copied: (n) => `${n} objet${n > 1 ? 's' : ''} copié${n > 1 ? 's' : ''}`,
  pasted: (n) => `${n} objet${n > 1 ? 's' : ''} collé${n > 1 ? 's' : ''}`,
  maxServersTitle: '3 serveurs maximum', maxServersDesc: 'Retirez un serveur de cette table avant d’en ajouter un autre.',
  zoneAssigned: (s, z) => `${s} → ${z}`, zoneAssignedDesc: (n) => `${n} table${n > 1 ? 's' : ''} affectée${n > 1 ? 's' : ''}.`,
  assignDoneDesc: 'L’app serveur affiche ses tables à sa prochaine synchronisation.',
  onShift: 'En service', offShift: 'Absent', onPause: 'En pause',
  rosterShiftNow: (n) => `${n} en service maintenant`,
  footMeta: (t, z, c) => `${t} table${t > 1 ? 's' : ''} · ${z} zone${z > 1 ? 's' : ''} · ${c} couvert${c > 1 ? 's' : ''}`,
  autosaved: 'Enregistré automatiquement',
  export: 'Exporter', exportTitle: 'Exporter le plan', exportDesc: 'Imprimez le plan pour le briefing ou envoyez l’image sur WhatsApp.',
  exportPrint: 'Imprimer ou PDF', exportPrintDesc: 'Une page A3 paysage par zone, avec les serveurs.',
  exportPng: 'Image PNG', exportPngDesc: (z) => `La zone « ${z} », en haute définition.`,
  exportDone: 'Image téléchargée', exportBlocked: 'Autorisez les fenêtres pour imprimer le plan.',
  exportServers: 'Serveurs', exportPrinted: (d) => `Imprimé le ${d}`,
  versions: 'Versions', versionsTitle: 'Versions du plan',
  versionsDesc: 'Gardez plusieurs dispositions (été, Ramadan, privatisation) et passez de l’une à l’autre.',
  versionSave: 'Enregistrer la disposition actuelle', versionName: 'Nom de la version', versionNamePh: 'ex. Terrasse été',
  versionSaved: (n) => `Version « ${n} » enregistrée`, versionApply: 'Utiliser', versionDelete: 'Supprimer',
  versionApplied: (n) => `Version « ${n} » chargée`, versionAppliedDesc: 'Votre plan précédent est gardé dans Versions.',
  versionEmpty: 'Aucune version enregistrée.', versionAuto: (d) => `Avant réinitialisation · ${d}`,
  versionBefore: (n) => `Avant « ${n} »`, versionMeta: (t, c) => `${t} table${t > 1 ? 's' : ''} · ${c} couvert${c > 1 ? 's' : ''}`,
  resetTitle: 'Réinitialiser le plan ?',
  resetDesc: (t, z) => `Le plan est remplacé par ${t ? `le modèle de départ (${t} tables, ${z} zone${z > 1 ? 's' : ''})` : 'une salle vide'}. Une copie du plan actuel est gardée dans Versions.`,
  resetDoneDesc: 'Une copie de l’ancien plan est dans Versions.',
  rotateDesc: 'Les serveurs changent de zone ou de tables à chaque période, pour que personne ne garde les mêmes tables des mois durant.',
  rotateAuto: (p) => `S’applique ${p}, dès que le plan de salle s’ouvre sur un appareil.`,
  rotateAutoShift: 'à chaque service (midi, soir)', rotateAutoDaily: 'chaque jour', rotateAutoWeekly: 'chaque semaine',
  rotateOff: 'Rotation automatique désactivée', rotateEnable: 'Rotation automatique', rotateLast: (d) => `Dernière rotation · ${d}`,
  rotateNever: 'Aucune rotation encore', rotateShift: 'Chaque service',
  rotPairsDesc: 'Deux serveurs échangent leurs tables à chaque rotation.',
  rotPairsPick: 'Binômes', rotPairsAdd: '+ Ajouter un binôme', rotPairsNone: 'Ajoutez au moins un binôme.',
  rotApplied: 'Rotation enregistrée',
  rotAppliedDesc: 'L’app serveur affiche les nouvelles tables à sa prochaine synchronisation.',
  rotNowDone: 'Rotation effectuée', rotNowDoneDesc: 'Nouvelles affectations publiées pour l’app serveur.',
  rotAutoDone: 'Rotation du service appliquée', rotNeedStaff: 'Il faut au moins deux serveurs pour tourner.',
  rotHistoryTitle: 'Historique des rotations', rotHistoryEmpty: 'L’historique se remplit à chaque rotation.',
  fairnessEmpty: 'Pas encore assez d’historique pour mesurer l’équité.',
  services: { midi: 'midi', soir: 'soir' },
  versionsCount: (n) => n ? `${n}` : '',
  liveSoon: (t) => `à ${t}`,
});
Object.assign(PDS_STR.en, {
  modeLayoutDesc: 'Drag to place · click to edit.',
  modeAssignDesc: 'Drag a server onto a table or a zone tab.',
  modeRotateDesc: 'Servers change zone every period.',
  snapOn: 'Grid', snapOff: 'Free', snapHint: 'Align objects to a 16 cm grid',
  statusFree: 'Free', statusOrdering: 'To order', statusOccupied: 'Seated', statusBill: 'Bill',
  statusPaid: 'Paid', statusReserved: 'Reserved', statusOut: 'Out of service', statusCleaning: 'Paid',
  kpiTablesD: (free, n) => `${free} free of ${n}`,
  kpiCoversLive: 'COVERS SEATED', kpiCoversD: (cap) => `capacity ${cap}`,
  kpiCoversPlan: 'CAPACITY', kpiCoversPlanD: (n) => `${n} table${n === 1 ? '' : 's'}`,
  kpiBills: 'OPEN BILLS', kpiBillsD: (n) => n ? `${n} bill${n > 1 ? 's' : ''} requested` : 'none requested',
  kpiZonesD: (n) => n > 1 ? `${n} zones` : '1 zone',
  kpiServersD: (on, n) => on == null ? `${n} on the plan` : `${on} on shift of ${n}`,
  mad: (v) => `${Math.round(v).toLocaleString('en-GB')} MAD`,
  liveOn: 'Till live', liveStale: (t) => `Offline · seen at ${t}`, liveDemo: 'Demo · statuses set by hand',
  liveOffline: 'Till unreachable · plan statuses', liveNone: 'Statuses set by hand',
  liveNoTill: 'No till connected', liveTillAway: (t) => `Till offline · seen at ${t}`,
  liveTitle: 'Right now', liveBills: 'Bills requested', liveCheck: 'Open for more than 4 h',
  liveCheckHint: 'Probably left open on the till. Check, then free them from the till.',
  liveUpcoming: 'Today’s bookings', liveUnplaced: 'No table', livePlace: 'Seat',
  livePlaced: (n, t) => `${n} placed at table ${t}`, liveNoFit: 'No free table fits',
  liveNoBookings: 'No bookings today.', liveToday: 'Today',
  liveTurns: (n) => `${n} turn${n > 1 ? 's' : ''}`, liveOpen: (n) => `${n} in progress`, liveAvg: (m) => `${m} min on average`,
  liveRevSeat: (v) => `${v} per seat`, liveNoStats: 'Turns and revenue per table appear after the first bill is paid.',
  checkTable: 'check', since: (l) => `for ${l}`, nextAt: (t, n) => `${t} · ${n}`,
  tillStatus: 'Till status', tillStatusHint: 'This status comes from the till. It changes when the team opens or settles the table.',
  holdLabel: 'Booking or block', holdNone: 'None', holdReserved: 'Reserved', holdOut: 'Out of service',
  coversNow: (c, s) => `${c} / ${s} covers`, billNow: 'Current bill', liveAllFree: 'Every table is free.',
  filterAll: 'Show all', heatLabel: 'Show', heatStatus: 'Status', heatRevenue: 'Revenue', heatTurns: 'Turns',
  heatNeedsLive: 'Available once the till is connected',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomFit: 'Fit', zoomFitHint: 'Fit the room to the screen',
  shapeRound: 'Round', shapeSquare: 'Square', shapeRect: 'Long', shapeBar: 'Counter', shapeHigh: 'High',
  paletteSeats: 'Seats', paletteHint: 'Pick the number of seats, then the shape.',
  editHint: 'Click an object to edit it. Shift or ⌘ to pick several, or drag a frame.',
  bulkHintNone: 'Drag a frame on the plan, or Shift/⌘ + click, to select several tables.',
  kbdHint: 'Arrows to move · ⌘D duplicate · ⌘C / ⌘V · Delete to remove',
  renumber: 'Renumber', renumberTitle: 'Renumber tables',
  renumberDesc: 'Numbers follow each zone’s reading order, left to right then top to bottom.',
  renumberFlat: 'Continuous numbers', renumberFlatDesc: '1, 2, 3… across every zone',
  renumberPrefix: 'A hundred per zone', renumberPrefixDesc: 'First zone 1, 2…, then 101, 102…, then 201… Easy on the till keypad.',
  renumberOk: 'Renumber', renumberDone: (n) => `${n} tables renumbered`,
  dupNums: (nums) => `Duplicate numbers: ${nums}`, dupNumField: 'This number is already used',
  zoneMoveL: 'Move left', zoneMoveR: 'Move right', zoneDuplicate: 'Duplicate zone',
  zoneDuplicated: (n) => `Zone “${n}” duplicated`, zoneColor: 'Zone colour', zoneCopy: (n) => `${n} (copy)`,
  zoneTools: 'Zone', copied: (n) => `${n} object${n > 1 ? 's' : ''} copied`,
  pasted: (n) => `${n} object${n > 1 ? 's' : ''} pasted`,
  maxServersTitle: '3 servers maximum', maxServersDesc: 'Remove a server from this table before adding another.',
  zoneAssigned: (s, z) => `${s} → ${z}`, zoneAssignedDesc: (n) => `${n} table${n > 1 ? 's' : ''} assigned.`,
  assignDoneDesc: 'The server app shows their tables at its next sync.',
  onShift: 'On shift', offShift: 'Off', onPause: 'On break',
  rosterShiftNow: (n) => `${n} on shift now`,
  footMeta: (t, z, c) => `${t} table${t === 1 ? '' : 's'} · ${z} zone${z === 1 ? '' : 's'} · ${c} cover${c === 1 ? '' : 's'}`,
  autosaved: 'Saved automatically',
  export: 'Export', exportTitle: 'Export the plan', exportDesc: 'Print the plan for the briefing or send the image on WhatsApp.',
  exportPrint: 'Print or PDF', exportPrintDesc: 'One A3 landscape page per zone, with servers.',
  exportPng: 'PNG image', exportPngDesc: (z) => `The “${z}” zone, in high definition.`,
  exportDone: 'Image downloaded', exportBlocked: 'Allow pop-ups to print the plan.',
  exportServers: 'Servers', exportPrinted: (d) => `Printed ${d}`,
  versions: 'Versions', versionsTitle: 'Plan versions',
  versionsDesc: 'Keep several layouts (summer, Ramadan, private event) and switch between them.',
  versionSave: 'Save the current layout', versionName: 'Version name', versionNamePh: 'e.g. Summer terrace',
  versionSaved: (n) => `Version “${n}” saved`, versionApply: 'Use', versionDelete: 'Delete',
  versionApplied: (n) => `Version “${n}” loaded`, versionAppliedDesc: 'Your previous plan is kept in Versions.',
  versionEmpty: 'No saved versions.', versionAuto: (d) => `Before reset · ${d}`,
  versionBefore: (n) => `Before “${n}”`, versionMeta: (t, c) => `${t} table${t === 1 ? '' : 's'} · ${c} cover${c === 1 ? '' : 's'}`,
  resetTitle: 'Reset the plan?',
  resetDesc: (t, z) => `The plan is replaced by ${t ? `the starter layout (${t} tables, ${z} zone${z > 1 ? 's' : ''})` : 'an empty room'}. A copy of the current plan is kept in Versions.`,
  resetDoneDesc: 'A copy of the old plan is in Versions.',
  rotateDesc: 'Servers change zone or tables every period, so nobody keeps the same tables for months.',
  rotateAuto: (p) => `Applies ${p}, as soon as the floor plan is opened on any device.`,
  rotateAutoShift: 'every service (lunch, dinner)', rotateAutoDaily: 'every day', rotateAutoWeekly: 'every week',
  rotateOff: 'Automatic rotation off', rotateEnable: 'Automatic rotation', rotateLast: (d) => `Last rotation · ${d}`,
  rotateNever: 'No rotation yet', rotateShift: 'Every service',
  rotPairsDesc: 'Two servers swap tables at each rotation.',
  rotPairsPick: 'Pairs', rotPairsAdd: '+ Add a pair', rotPairsNone: 'Add at least one pair.',
  rotApplied: 'Rotation saved',
  rotAppliedDesc: 'The server app shows the new tables at its next sync.',
  rotNowDone: 'Rotation done', rotNowDoneDesc: 'New assignments published for the server app.',
  rotAutoDone: 'Service rotation applied', rotNeedStaff: 'At least two servers are needed to rotate.',
  rotHistoryTitle: 'Rotation history', rotHistoryEmpty: 'History fills up with each rotation.',
  fairnessEmpty: 'Not enough history yet to measure fairness.',
  services: { midi: 'lunch', soir: 'dinner' },
  versionsCount: (n) => n ? `${n}` : '',
  liveSoon: (t) => `at ${t}`,
});
Object.assign(PDS_STR.ar, {
  modeLayoutDesc: 'اسحب للوضع · انقر للتعديل.',
  modeAssignDesc: 'اسحب نادلاً فوق طاولة أو تبويب منطقة.',
  modeRotateDesc: 'يغيّر النُّدُل المنطقة في كل فترة.',
  snapOn: 'الشبكة', snapOff: 'حر', snapHint: 'محاذاة العناصر على شبكة 16 سم',
  statusFree: 'فارغة', statusOrdering: 'في انتظار الطلب', statusOccupied: 'مشغولة', statusBill: 'الحساب',
  statusPaid: 'مدفوعة', statusReserved: 'محجوزة', statusOut: 'خارج الخدمة', statusCleaning: 'مدفوعة',
  kpiTablesD: (free, n) => `${free} فارغة من ${n}`,
  kpiCoversLive: 'الزبائن في القاعة', kpiCoversD: (cap) => `السعة ${cap}`,
  kpiCoversPlan: 'السعة', kpiCoversPlanD: (n) => `${n} طاولة`,
  kpiBills: 'الحسابات المفتوحة', kpiBillsD: (n) => n ? `${n} طلب حساب` : 'لا طلبات',
  kpiZonesD: (n) => `${n} منطقة`,
  kpiServersD: (on, n) => on == null ? `${n} في المخطط` : `${on} في الخدمة من ${n}`,
  mad: (v) => `${Math.round(v).toLocaleString('ar-MA')} درهم`,
  liveOn: 'الصندوق مباشر', liveStale: (t) => `غير متصل · آخر ظهور ${t}`, liveDemo: 'عرض تجريبي · حالات يدوية',
  liveOffline: 'تعذّر الوصول إلى الصندوق · حالات المخطط', liveNone: 'حالات يدوية',
  liveNoTill: 'لا يوجد صندوق متصل', liveTillAway: (t) => `الصندوق غير متصل · آخر ظهور ${t}`,
  liveTitle: 'الآن', liveBills: 'طلبات الحساب', liveCheck: 'مفتوحة منذ أكثر من 4 ساعات',
  liveCheckHint: 'على الأرجح نُسيت في الصندوق. تحقّق ثم حرّرها من الصندوق.',
  liveUpcoming: 'حجوزات اليوم', liveUnplaced: 'بدون طاولة', livePlace: 'إجلاس',
  livePlaced: (n, t) => `${n} على الطاولة ${t}`, liveNoFit: 'لا توجد طاولة فارغة مناسبة',
  liveNoBookings: 'لا حجوزات اليوم.', liveToday: 'اليوم',
  liveTurns: (n) => `${n} دورة`, liveOpen: (n) => `${n} جارية`, liveAvg: (m) => `${m} د في المتوسط`,
  liveRevSeat: (v) => `${v} لكل مقعد`, liveNoStats: 'تظهر الدورات ورقم المعاملات لكل طاولة بعد أول حساب مدفوع.',
  checkTable: 'للتحقق', since: (l) => `منذ ${l}`, nextAt: (t, n) => `${t} · ${n}`,
  tillStatus: 'حالة الصندوق', tillStatusHint: 'هذه الحالة تأتي من الصندوق وتتغيّر عندما يفتح الفريق الطاولة أو يدفع الحساب.',
  holdLabel: 'حجز أو إيقاف', holdNone: 'لا شيء', holdReserved: 'محجوزة', holdOut: 'خارج الخدمة',
  coversNow: (c, s) => `${c} / ${s} مقعد`, billNow: 'الحساب الحالي', liveAllFree: 'كل الطاولات فارغة.',
  filterAll: 'عرض الكل', heatLabel: 'عرض', heatStatus: 'الحالة', heatRevenue: 'المداخيل', heatTurns: 'الدورات',
  heatNeedsLive: 'متاح عند ربط الصندوق',
  zoomIn: 'تكبير', zoomOut: 'تصغير', zoomFit: 'ملاءمة', zoomFitHint: 'ملاءمة القاعة مع الشاشة',
  shapeRound: 'دائرية', shapeSquare: 'مربعة', shapeRect: 'طويلة', shapeBar: 'كونتوار', shapeHigh: 'عالية',
  paletteSeats: 'المقاعد', paletteHint: 'اختر عدد المقاعد ثم الشكل.',
  editHint: 'انقر عنصرًا لتعديله. Shift أو ⌘ لاختيار عدة عناصر، أو ارسم إطارًا.',
  bulkHintNone: 'ارسم إطارًا على المخطط، أو Shift/⌘ + نقرة، لاختيار عدة طاولات.',
  kbdHint: 'الأسهم للتحريك · ⌘D تكرار · ⌘C / ⌘V · Delete للحذف',
  renumber: 'إعادة الترقيم', renumberTitle: 'إعادة ترقيم الطاولات',
  renumberDesc: 'تتبع الأرقام ترتيب القراءة في كل منطقة، من اليسار إلى اليمين ثم من الأعلى إلى الأسفل.',
  renumberFlat: 'أرقام متتالية', renumberFlatDesc: '1، 2، 3… في كل المناطق',
  renumberPrefix: 'مئة لكل منطقة', renumberPrefixDesc: 'المنطقة الأولى 1، 2…، ثم 101، 102…، ثم 201… سهل على لوحة الصندوق.',
  renumberOk: 'إعادة الترقيم', renumberDone: (n) => `أُعيد ترقيم ${n} طاولة`,
  dupNums: (nums) => `أرقام مكرّرة: ${nums}`, dupNumField: 'هذا الرقم مستعمل',
  zoneMoveL: 'نقل إلى اليسار', zoneMoveR: 'نقل إلى اليمين', zoneDuplicate: 'تكرار المنطقة',
  zoneDuplicated: (n) => `تم تكرار منطقة «${n}»`, zoneColor: 'لون المنطقة', zoneCopy: (n) => `${n} (نسخة)`,
  zoneTools: 'المنطقة', copied: (n) => `نُسخ ${n} عنصر`, pasted: (n) => `أُلصق ${n} عنصر`,
  maxServersTitle: '3 نُدُل كحد أقصى', maxServersDesc: 'أزل نادلاً من هذه الطاولة قبل إضافة آخر.',
  zoneAssigned: (s, z) => `${s} ← ${z}`, zoneAssignedDesc: (n) => `أُسندت ${n} طاولة.`,
  assignDoneDesc: 'يعرض تطبيق النادل طاولاته عند المزامنة التالية.',
  onShift: 'في الخدمة', offShift: 'غائب', onPause: 'في استراحة',
  rosterShiftNow: (n) => `${n} في الخدمة الآن`,
  footMeta: (t, z, c) => `${t} طاولة · ${z} منطقة · ${c} مقعد`,
  autosaved: 'حُفظ تلقائيًا',
  export: 'تصدير', exportTitle: 'تصدير المخطط', exportDesc: 'اطبع المخطط للاجتماع أو أرسل الصورة عبر واتساب.',
  exportPrint: 'طباعة أو PDF', exportPrintDesc: 'صفحة A3 أفقية لكل منطقة مع النُّدُل.',
  exportPng: 'صورة PNG', exportPngDesc: (z) => `منطقة «${z}» بدقة عالية.`,
  exportDone: 'تم تنزيل الصورة', exportBlocked: 'اسمح بالنوافذ المنبثقة لطباعة المخطط.',
  exportServers: 'النُّدُل', exportPrinted: (d) => `طُبع في ${d}`,
  versions: 'النسخ', versionsTitle: 'نسخ المخطط',
  versionsDesc: 'احتفظ بعدة ترتيبات (الصيف، رمضان، حفلة خاصة) وانتقل بينها.',
  versionSave: 'حفظ الترتيب الحالي', versionName: 'اسم النسخة', versionNamePh: 'مثال: تراس الصيف',
  versionSaved: (n) => `حُفظت نسخة «${n}»`, versionApply: 'استعمال', versionDelete: 'حذف',
  versionApplied: (n) => `حُمّلت نسخة «${n}»`, versionAppliedDesc: 'مخططك السابق محفوظ في النسخ.',
  versionEmpty: 'لا توجد نسخ محفوظة.', versionAuto: (d) => `قبل إعادة التعيين · ${d}`,
  versionBefore: (n) => `قبل «${n}»`, versionMeta: (t, c) => `${t} طاولة · ${c} مقعد`,
  resetTitle: 'إعادة تعيين المخطط؟',
  resetDesc: (t, z) => `سيُستبدل المخطط ${t ? `بالترتيب الأولي (${t} طاولة، ${z} منطقة)` : 'بقاعة فارغة'}. تُحفظ نسخة من المخطط الحالي في النسخ.`,
  resetDoneDesc: 'نسخة من المخطط القديم في النسخ.',
  rotateDesc: 'يغيّر النُّدُل المنطقة أو الطاولات في كل فترة، حتى لا يبقى أحد على الطاولات نفسها لأشهر.',
  rotateAuto: (p) => `تُطبَّق ${p} بمجرد فتح مخطط القاعة على أي جهاز.`,
  rotateAutoShift: 'في كل خدمة (غداء، عشاء)', rotateAutoDaily: 'كل يوم', rotateAutoWeekly: 'كل أسبوع',
  rotateOff: 'التدوير التلقائي متوقف', rotateEnable: 'التدوير التلقائي', rotateLast: (d) => `آخر تدوير · ${d}`,
  rotateNever: 'لا تدوير بعد', rotateShift: 'كل خدمة',
  rotPairsDesc: 'يتبادل نادلان طاولاتهما في كل تدوير.',
  rotPairsPick: 'الثنائيات', rotPairsAdd: '+ إضافة ثنائي', rotPairsNone: 'أضف ثنائيًا واحدًا على الأقل.',
  rotApplied: 'حُفظ التدوير',
  rotAppliedDesc: 'يعرض تطبيق النادل الطاولات الجديدة عند المزامنة التالية.',
  rotNowDone: 'تم التدوير', rotNowDoneDesc: 'نُشرت الإسنادات الجديدة لتطبيق النادل.',
  rotAutoDone: 'طُبّق تدوير الخدمة', rotNeedStaff: 'يلزم نادلان على الأقل للتدوير.',
  rotHistoryTitle: 'سجل التدوير', rotHistoryEmpty: 'يمتلئ السجل مع كل تدوير.',
  fairnessEmpty: 'لا يوجد سجل كافٍ لقياس العدالة بعد.',
  services: { midi: 'غداء', soir: 'عشاء' },
  versionsCount: (n) => n ? `${n}` : '',
  liveSoon: (t) => `على ${t}`,
});



const PDS_INLINE_CSS = `
  .pds-host :focus-visible { outline:2px solid var(--atlas); outline-offset:2px; }
  .pds-kpis { margin-bottom: 14px; }
  .pds-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
  .pds-modes { display:flex; gap:4px; padding:3px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:11px; }
  .pds-mode { background:transparent; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:500; color:var(--n-600); cursor:pointer; transition:.18s letter-spacing:0.01em; }
  .pds-mode:hover { color:var(--ink); }
  .pds-mode.active { background:var(--inverse-surface); color:var(--inverse-ink); font-weight:600; box-shadow:0 1px 2px rgba(10,15,13,0.16); }
  .pds-mode-desc { flex:1; font-size:12px; color:var(--n-600); padding:0 6px; min-width:240px; }
  .pds-zone-tabs { display:flex; gap:4px; padding:3px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:10px; }
  .pds-zone { background:transparent; border:none; padding:7px 12px; border-radius:7px; font-size:12px; font-weight:500; color:var(--n-700); cursor:pointer; display:flex; align-items:center; gap:6px; transition:.16s; }
  .pds-zone em { font-style:normal; font-family:var(--mono); font-size:11px; color:var(--n-500); }
  .pds-zone:hover { color:var(--ink); }
  .pds-zone.active { background:var(--paper); color:var(--ink); box-shadow:0 1px 3px rgba(10,15,13,0.08); font-weight:600; }
  .pds-zone.active em { color:var(--atlas); font-weight:600; }
  .pds-zone-add { padding:7px 10px; color:var(--atlas); font-weight:700; font-size:14px; }
  .pds-zone-add:hover { background:var(--paper); }

  /* align-items:start est la moitié qui compte : une piste de grille s'étire
     par défaut à la hauteur de la plus haute, et la palette fait deux mille
     six cents pixels. Le plan partait donc hors de l'écran dès qu'on
     descendait chercher une plante. Les deux colonnes latérales défilent
     maintenant chez elles, et le plan ne bouge plus. */
  .pds-stage-grid { display:grid; grid-template-columns: 220px 1fr 240px; gap:14px; align-items:start; }
  @media (max-width: 1100px) { .pds-stage-grid { grid-template-columns: 200px 1fr; } .pds-inspector { grid-column: 1 / -1; } }

  /* overscroll-behavior:contain arrête la chaîne : arrivé en bas de la
     palette, la molette ne repart pas dans le tiroir. C'est ce report-là
     qui donnait la sensation de défilement sans fin. */
  .pds-rail, .pds-inspector {
    position:sticky; top:0;
    max-height:calc(100vh - 210px); min-height:320px;
    overflow-y:auto; overscroll-behavior:contain;
    padding-right:4px; scrollbar-width:thin;
  }
  /* Sous 1100px l'inspecteur devient une rangée pleine largeur sous le plan :
     le coller ou le plafonner n'a plus de sens, il suit le flux. La palette,
     elle, garde son propre défilement · c'est elle qui fait deux mille pixels,
     à toutes les largeurs. */
  @media (max-width: 1100px) {
    .pds-rail { position:static; max-height:calc(100vh - 260px); }
    .pds-inspector { position:static; max-height:none; min-height:0; overflow:visible; }
  }

  .pds-rail { display:flex; flex-direction:column; gap:10px; }
  .pds-rail-card { background:var(--paper-soft); border:1px solid var(--n-200); border-radius:12px; padding:14px; }
  html[data-theme="dark"] .pds-rail-card { background:var(--paper-muted); }
  .pds-rail-title { font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-bottom:6px; }
  .pds-rail-hint { font-size:11.5px; color:var(--n-600); line-height:1.45; margin-bottom:10px; }
  .pds-rail-cta { width:100%; margin-bottom:6px; justify-content:center; }
  .pds-rail-cta:last-child { margin-bottom:0; }
  .pds-rail-danger { color:var(--danger); }
  .pds-rail-danger:hover { border-color:var(--danger); }

  .pds-palette { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  .pds-palette-el { grid-template-columns:1fr; }
  .pds-pal-item { background:var(--paper); border:1px solid var(--n-200); border-radius:9px; padding:8px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; cursor:pointer; font-family:inherit; transition:.16s; min-height:62px; }
  .pds-pal-item:hover { border-color:var(--atlas); transform:translateY(-1px); box-shadow:0 4px 12px -8px rgba(11,110,79,0.3); }
  .pds-pal-shape { background:var(--n-200); border:1.5px solid var(--n-400); display:block; }
  .pds-pal-round { border-radius:50%; }
  .pds-pal-square { border-radius:3px; }
  .pds-pal-rect { border-radius:3px; }
  .pds-pal-label { font-size:11px; color:var(--n-700); font-weight:500; letter-spacing:0.01em; text-align:center; }
  .pds-pal-icon { width:24px; height:24px; }
  .pds-pal-el-wall { background:#2C2520; height:5px !important; margin-top:9px; width:24px; }
  .pds-pal-el-door { background:var(--atlas); height:5px !important; margin-top:9px; width:18px; border-radius:1px; }
  .pds-pal-el-window { background:#1A8FE3; height:4px !important; margin-top:10px; width:22px; border-radius:1px; }
  .pds-pal-el-column { background:#2C2520; width:14px !important; height:14px !important; margin-top:5px; border-radius:50%; }
  .pds-pal-el-plant { background:radial-gradient(circle, #0B8A7B 0 60%, transparent 65%); width:20px !important; height:20px !important; margin-top:2px; }

  .pds-canvas-wrap { display:flex; flex-direction:column; gap:10px; min-width:0; }
  .pds-canvas-bar { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:10px; flex-wrap:wrap; }
  .pds-legend { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .pds-legend-title { font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-right:4px; }
  .pds-legend-item { display:inline-flex; align-items:center; gap:6px; color:rgba(10,15,13,0.64); font:400 11px/1.2 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:-0.01em; }
  /* Légende jour : les mêmes cases 17 × 13 rx 4 que la nuit, à l'encre sur
     papier · l'atlas ne s'allume que pour l'occupée, comme dans la scène. */
  .pds-legend-swatch { width:17px; height:13px; border-radius:4px; display:inline-block; border:1.25px solid transparent; }
  .pds-sw-free      { background:rgba(10,15,13,0.015); border-color:rgba(10,15,13,0.30); }
  .pds-sw-occupied  { background:rgba(11,110,79,0.10); border-color:#0B6E4F; }
  .pds-sw-reserved  { background:rgba(200,146,53,0.10); border-style:dashed; border-color:#C89235; }
  .pds-sw-cleaning  { background:rgba(10,15,13,0.02); border-style:dotted; border-color:rgba(10,15,13,0.45); }
  .pds-pill { font-size:11px; font-family:var(--mono); letter-spacing:0.06em; padding:3px 8px; border-radius:99px; text-transform:uppercase; font-weight:600; border:1px solid transparent; }
  .pds-pill-free { background:rgba(10,15,13,0.06); color:var(--n-700); }
  .pds-pill-occupied { background:rgba(11,110,79,0.14); color:var(--atlas); }
  /* Les mêmes traits que le plan : tiret riad pour réservée, pointillé encre
     pour à nettoyer · plus d'ambre ni de bleu que le plan ne peint jamais. */
  .pds-pill-reserved { background:rgba(232,200,138,0.18); color:#7D5A1A; border:1px dashed rgba(200,146,53,0.65); }
  .pds-pill-cleaning { background:rgba(10,15,13,0.02); color:var(--n-700); border:1px dotted rgba(10,15,13,0.45); }
  .pds-snap { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--n-700); cursor:pointer; user-select:none; padding:4px 8px; border-radius:7px; }
  .pds-snap input { accent-color:var(--atlas); }

  /* ═════ ARCHITECTURAL ROOM · mirrors kiwi-caisse plan de salle ═════════════
     A cream "paper" floor framed by a 1.5px ink border with an inset highlight
     and a soft warm shadow. SVG backdrop draws the fixtures (comptoir,
     escalier, plantes, fenêtres). The inner .pds-canvas absorbs all the
     pointer events for table dragging · it is positioned over the SVG. */
  .pds-plan-canvas { position:relative; display:flex; flex-direction:column; gap:6px; min-width:0; min-height:0; }
  /* The room is a RESPONSIVE box; the stage inside it is a FIXED logical
     ${PDS_CANVAS_W}×${PDS_CANVAS_H} space scaled to fit (see .pds-plan-scale).
     It used to be a hard ${PDS_CANVAS_W}px wide with max-width:100%, so below
     ~1490px of viewport the room narrowed while the absolutely-positioned
     tables kept their px coordinates · and overflow:hidden silently cropped
     everything past the new edge. Scaling instead of cropping means one
     coordinate space at every width, which is also what lets the backdrop
     and the tables finally agree. 1 logical unit = 1 cm. */
  .pds-plan-room {
    position:relative;
    width: 100%;
    max-width: ${PDS_CANVAS_W}px;
    aspect-ratio: ${PDS_CANVAS_W} / ${PDS_CANVAS_H};
    margin: 0 auto;
    /* Scale reference for .pds-plan-scale. Doing this in CSS rather than from a
       JS-set custom property matters: a JS var is a second source of truth that
       goes stale the moment a resize callback is throttled (a hidden tab runs
       neither rAF nor ResizeObserver), and a stale scale silently crops the
       floor. cqw is always current because the browser resolves it. */
    container-type: inline-size;
    border:1.5px solid #2C2520;
    border-radius:16px;
    overflow:hidden;
    background:#FBF7EE;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.7) inset,
      0 0 0 1px rgba(44,37,32,0.06),
      0 18px 40px -32px rgba(20,15,10,0.15);
  }
  .pds-plan-room.is-terrasse {
    border-style:dashed;
    border-color:#A89770;
    background:#F7F2E8;
  }
  /* Fixed logical stage · the backdrop and the tables live on ONE plane that is
     scaled as a whole, so they can never drift apart. 100cqw is the room's own
     width, so dividing it by the logical width yields the exact fit ratio with
     no JS involved. transform-origin is top-left so logical (0,0) stays pinned
     to the room's corner. */
  .pds-plan-scale {
    position:absolute; top:0; left:0;
    width:${PDS_CANVAS_W}px;
    height:${PDS_CANVAS_H}px;
    transform-origin: 0 0;
    transform: scale(calc(100cqw / ${PDS_CANVAS_W}px));
  }
  .pds-plan-room .plan-bg {
    position:absolute; inset:0;
    width:100%; height:100%;
    pointer-events:none; display:block;
  }
  .pds-plan-room .plan-bg * { vector-effect: non-scaling-stroke; }
  .pds-plan-label {
    position:absolute; top:10px; left:16px;
    font-family:var(--sans, "Inter Tight", system-ui, sans-serif);
    font-size:11px; font-weight:600;
    color:#1A1F1C;
    letter-spacing:0.16em;
    text-transform:uppercase;
    z-index:4;
    pointer-events:none;
  }
  .pds-plan-label em {
    font-family:"Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
     font-weight:400;
    text-transform:none;
    color:#5C5447;
    letter-spacing:0;
    margin-left:6px;
    font-size:13px;
  }
  .pds-plan-room.is-terrasse .pds-plan-label { color:#1F4A38; }
  .pds-plan-footer {
    display:flex; justify-content:flex-end; align-items:center;
    padding:2px 6px;
    font-size:11px; color:#5C5447;
    letter-spacing:0.04em;
    font-feature-settings:"tnum" 1;
    flex:0 0 auto;
  }
  .pds-plan-floor-count { font-family:var(--mono); }

  /* The canvas sits ON TOP of the SVG backdrop, transparent, capturing
     pointer events for table dragging. Same dimensions as plan-room. */
  .pds-canvas {
    position:absolute;
    inset:0;
    margin:0;
    border:none; border-radius:14px;
    overflow:visible;
    touch-action:none; user-select:none;
    background:transparent;
    z-index:2;
  }

  .pds-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; padding:20px; background:rgba(255,255,255,0.7); border-radius:14px; z-index:3; backdrop-filter: blur(2px); }
  .pds-empty h4 { margin:0; font-size:18px; letter-spacing:-0.02em; color:var(--ink); }
  .pds-empty p { font-size:13px; color:var(--n-600); max-width:340px; margin:0; line-height:1.5; }

  /* ═════ TABLES · architectural language mirrored from kiwi-caisse ═══════
     Tables are absolute on the canvas. Each .pds-tbl-cell contains:
       • .pds-tbl · the tabletop (wood/marble vibe via shadows)
       • .pds-tbl-num · large bold number
       • .pds-tbl-covers·seat count (instrument serif, roman)
       • .pds-tbl-chairs / .pds-chair · chair pills around the table
       • .pds-tbl-server · corner badge with server initials + color        */
  .pds-tbl-cell {
    position:absolute;
    cursor:pointer; user-select:none;
    transition: transform 150ms ease, filter 150ms ease;
    z-index:2;
  }
  .pds-tbl-cell:hover { transform: translateY(-1px); filter: brightness(1.02); }
  .pds-tbl-cell:active { transform: translateY(0); }
  .pds-tbl-cell:focus-visible { outline: 2px solid var(--atlas); outline-offset: 3px; border-radius: 8px; }

  .pds-tbl-chairs {
    position:absolute;
    display:flex; justify-content:center; gap:5px;
    pointer-events:none;
  }
  .pds-tbl-chairs-top    { left:6px; right:6px; top:-9px;   height:7px; }
  .pds-tbl-chairs-bottom { left:6px; right:6px; bottom:-9px; height:7px; }
  .pds-chair {
    flex:0 1 16px; min-width:8px; max-width:22px;
    height:100%;
    background:linear-gradient(180deg, #8C8377 0%, #5F574C 100%);
    border-radius:3px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.25) inset,
      0 1px 1.5px rgba(20,15,10,0.18);
  }
  .pds-tbl-chairs-ring { position:absolute; inset:-8px; pointer-events:none; }
  .pds-chair-radial {
    position:absolute; top:50%; left:50%;
    width:16px; height:7px;
    margin:-3.5px 0 0 -8px;
    background:linear-gradient(180deg, #8C8377 0%, #5F574C 100%);
    border-radius:3px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.25) inset,
      0 1px 1.5px rgba(20,15,10,0.18);
    transform-origin:center;
  }

  /* Tabletop */
  .pds-tbl {
    position:relative;
    width:100%; height:100%;
    border-radius:7px;
    padding:4px 6px;
    display:flex; flex-direction:column; justify-content:space-between;
    transition: background-color 200ms ease, border-color 200ms ease, color 200ms ease;
    overflow:hidden;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.6) inset,
      0 2px 4px -1px rgba(20,15,10,0.14),
      0 1px 2px rgba(20,15,10,0.06);
  }
  .pds-tbl-cell.pds-is-round .pds-tbl {
    border-radius:50%;
    padding:12% 14%;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    text-align:center; gap:1px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.7) inset,
      0 0 0 1px rgba(44,37,32,0.04) inset,
      0 3px 6px -1px rgba(20,15,10,0.18),
      0 1px 2px rgba(20,15,10,0.06);
  }
  .pds-tbl-cell.pds-is-round .pds-tbl-head {
    text-align:center;
    flex-direction:column;
    align-items:center; justify-content:center;
    gap:2px;
  }
  .pds-tbl-cell.pds-is-round .pds-tbl-server {
    top:-8px; right:auto;
    left:50%; transform:translateX(-50%);
  }
  .pds-tbl-cell.pds-is-round .pds-tbl-servers { top:-8px; right:50%; transform:translateX(50%); }
  .pds-tbl-cell.pds-is-round .pds-tbl-servers .pds-tbl-server {
    top:auto; right:auto; left:auto; transform:none;
  }
  .pds-tbl-cell.pds-is-square .pds-tbl { border-radius:4px; }
  .pds-tbl-cell.pds-is-bar    .pds-tbl { border-radius:4px; }

  .pds-tbl-head {
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    gap:1px; flex:1;
    font-feature-settings:"tnum" 1;
  }
  .pds-tbl-num    { font-weight:700; letter-spacing:0.01em; font-size:17px; line-height:1; color:inherit; }
  .pds-tbl-covers { font-family:"Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-weight:400; font-size:12px; line-height:1; opacity:0.7; }

  /* Status color encodings · mirrors caisse khawya / ka-yaklo etc. */
  .pds-tbl[data-status="free"] {
    background:var(--surface);
    border:1.5px solid #C8C5BD;
    color:#1A1F1C;
  }
  .pds-tbl[data-status="free"] .pds-tbl-num    { color:#4A453E; }
  .pds-tbl[data-status="free"] .pds-tbl-covers { color:#968D7F; }

  .pds-tbl[data-status="occupied"] {
    background:#EBF5F0;
    border:1.5px solid #C5E0D3;
    color:#1F5D3C;
  }
  .pds-tbl[data-status="occupied"] .pds-tbl-num    { color:#1F5D3C; }
  .pds-tbl[data-status="occupied"] .pds-tbl-covers { color:#437B5C; }

  .pds-tbl[data-status="reserved"] {
    background:#FFF1D6;
    border:1.5px solid #E8C88A;
    color:#7D5A1A;
  }
  .pds-tbl[data-status="reserved"] .pds-tbl-num    { color:#7D5A1A; }
  .pds-tbl[data-status="reserved"] .pds-tbl-covers { color:#A88A4C; }

  .pds-tbl[data-status="cleaning"] {
    background:#1F5D3C;
    border:1.5px solid transparent;
    color:#fff;
  }
  .pds-tbl[data-status="cleaning"] .pds-tbl-num    { color:#fff; }
  .pds-tbl[data-status="cleaning"] .pds-tbl-covers { color:rgba(255,255,255,0.78); }

  /* Selection · green outline ring (does not touch the table shape) */
  .pds-tbl-cell.is-selected .pds-tbl {
    box-shadow:
      0 0 0 3px rgba(11,110,79,0.28),
      0 1px 0 rgba(255,255,255,0.6) inset,
      0 2px 4px -1px rgba(20,15,10,0.14);
  }
  .pds-tbl-cell.is-dragging { z-index:5; cursor:grabbing; }
  .pds-tbl-cell.is-dragging .pds-tbl { box-shadow: 0 14px 30px -10px rgba(10,15,13,0.32); }

  /* Server color overlay (assign mode) · picks server color for tabletop border */
  .pds-tbl-cell.pds-has-server .pds-tbl { border-color: var(--pds-server, currentColor); border-width:2px; }

  /* Server badge · caisse style: circle pinned to corner, white ring */
  /* Read aloud, never painted: the table's spoken name around its number. */
  .pds-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
  .pds-tbl-server {
    position:absolute;
    top:-10px; right:-10px;
    width:26px; height:26px; border-radius:50%;
    font-size:11px; font-weight:700; color:#fff;
    display:inline-flex; align-items:center; justify-content:center;
    border:2.5px solid #fff;
    box-shadow:
      0 2px 5px rgba(20,15,10,0.22),
      0 0 0 1px rgba(20,15,10,0.06);
    letter-spacing:0.02em;
    z-index:3;
    pointer-events:none;
    font-family:var(--sans, "Inter Tight", system-ui, sans-serif);
  }
  .pds-tbl-servers {
    position:absolute; top:-10px; right:-10px; display:flex; flex-direction:row-reverse;
    z-index:3; pointer-events:none;
  }
  .pds-tbl-servers .pds-tbl-server { position:relative; top:auto; right:auto; }
  .pds-tbl-servers .pds-tbl-server + .pds-tbl-server { margin-right:-8px; }
  .pds-server-slot + .pds-server-slot { margin-top:6px; }

  .pds-el { position:absolute; background: var(--n-700); border-radius:2px; cursor:grab; will-change: transform; }
  .pds-el.pds-el-wall { background:#2C2520; height:8px; box-shadow:inset 0 0 0 1px rgba(0,0,0,0.2); }
  .pds-el.pds-el-door { background:var(--atlas); border-radius:2px; height:8px; }
  .pds-el.pds-el-window { background:linear-gradient(180deg,#1A8FE3,#0F6FBF); height:6px; border-radius:2px; }
  .pds-el.pds-el-column { background:#2C2520; border-radius:50%; box-shadow:0 0 0 2px rgba(255,255,255,0.5) inset; }
  .pds-el.pds-el-plant { background:radial-gradient(circle, #0B8A7B 0 60%, transparent 65%); border-radius:50%; }
  .pds-el.is-dragging { cursor:grabbing; z-index:4; }

  .pds-inspector { display:flex; flex-direction:column; gap:10px; }
  .pds-inspect { padding:14px; }
  .pds-inspect-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; }
  .pds-inspect-head .pds-rail-title { margin-bottom:0; }
  .pds-inspect-close {
    background:transparent; border:1px solid var(--n-200); border-radius:7px;
    width:24px; height:24px; padding:0;
    display:inline-flex; align-items:center; justify-content:center;
    cursor:pointer; color:var(--n-600); transition:.16s;
    flex-shrink:0;
  }
  .pds-inspect-close:hover { background:var(--paper); color:var(--ink); border-color: var(--n-400); }
  .pds-inspect-close:active { transform:translateY(1px); }
  .pds-inspect-close svg { display:block; }
  .pds-form-row { margin-bottom:10px; }
  .pds-form-row > label { display:block; font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-bottom:5px; font-weight:600; }
  .pds-input { width:100%; padding:7px 9px; font-size:12.5px; }
  .pds-resv-fields { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(96px,.65fr); gap:7px; margin:-2px 0 10px; }
  .pds-resv-field { min-width:0; }
  .pds-resv-field > span { display:block; margin-bottom:5px; color:#0B6E4F; font:500 9.5px/1.2 var(--mono, 'JetBrains Mono'); letter-spacing:0.07em; text-transform:uppercase; }
  .pds-resv-field .pds-input { min-width:0; height:32px; padding:6px 8px; background:#F7F5F0; border-color:rgba(11,110,79,0.34); color:#053B2C; font-size:11.5px; }
  .pds-resv-field .pds-input:focus { border-color:#0B6E4F; box-shadow:0 0 0 2px rgba(11,110,79,0.12); outline:0; }
  .pds-status-pills { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
  .pds-status-pill { padding:6px 8px; border:1.5px solid transparent; background:transparent; border-radius:7px; font-size:11px; font-weight:600; cursor:pointer; font-family:var(--mono); letter-spacing:0.04em; text-transform:uppercase; transition:.16s; }
  .pds-status-pill.pds-pill-free { background:rgba(10,15,13,0.06); color:var(--n-700); border-color:transparent; }
  .pds-status-pill.pds-pill-occupied { background:rgba(11,110,79,0.10); color:var(--atlas); }
  .pds-status-pill.pds-pill-reserved { background:rgba(232,200,138,0.14); color:#7D5A1A; border-style:dashed; border-color:rgba(200,146,53,0.55); }
  .pds-status-pill.pds-pill-cleaning { background:rgba(10,15,13,0.02); color:var(--n-700); border-style:dotted; border-color:rgba(10,15,13,0.40); }
  .pds-status-pill:hover { transform:translateY(-1px); }
  .pds-status-pill.active { border-color: currentColor; box-shadow:0 0 0 1px currentColor inset; }
  .pds-inspect-actions { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; }
  .pds-inspect-actions .kb { padding:7px 8px; font-size:11.5px; justify-content:center; }
  /* Bouton « Grouper » armé : il pulse doucement le temps du choix. */
  .pds-inspect-actions .kb.pds-group-arming { border-color:var(--atlas); color:var(--atlas); animation:pdsGroupArm 1.2s ease-in-out infinite; }
  @keyframes pdsGroupArm { 0%,100% { box-shadow:0 0 0 0 rgba(11,110,79,0); } 50% { box-shadow:0 0 0 3px rgba(11,110,79,0.18); } }

  /* ═════ TABLES GROUPÉES · l'enveloppe « 06 + 07 » du mockup d'accueil ═════
     Un cadre rx 20 qui embrasse les tables liées, une lueur radiale douce,
     et le cachet des numéros combinés au-dessus. Sous les tables, jamais
     cliquable · le groupe est un fait, pas une cible. */
  .pds-group-env { position:absolute; border-radius:20px; border:1.25px solid rgba(11,110,79,0.45); background:rgba(11,110,79,0.05); pointer-events:none; z-index:0; }
  .pds-group-env::before { content:''; position:absolute; inset:-30%; border-radius:50%; background:radial-gradient(closest-side, rgba(11,110,79,0.10), rgba(11,110,79,0)); z-index:-1; }
  .pds-group-chip { position:absolute; top:-26px; left:50%; transform:translateX(-50%); height:19px; padding:0 10px; border-radius:9.5px; background:var(--paper, #F7F5F0); border:1px solid rgba(11,110,79,0.45); color:#0B6E4F; font:500 10px/19px var(--mono, 'JetBrains Mono'); letter-spacing:0.02em; white-space:nowrap; }
  .pds-group-covers { opacity:0.72; }
  /* Ligne d'info du groupe dans l'inspecteur : un fait, pas un bouton. */
  .pds-group-info { margin-top:8px; padding:7px 10px; border-radius:9px; border:1px dashed rgba(11,110,79,0.35); background:rgba(11,110,79,0.05); color:#0B6E4F; font:500 11px/1.4 var(--mono, 'JetBrains Mono'); letter-spacing:0.01em; }

  .pds-inspect-empty .pds-rail-hint { line-height:1.55; }

  .pds-roster { display:flex; flex-direction:column; gap:5px; }
  .pds-chip { display:flex; align-items:center; gap:9px; padding:8px 10px; background:var(--paper); border:1px solid var(--n-200); border-radius:10px; cursor:grab; transition:.16s; }
  .pds-chip:hover { transform:translateY(-1px); border-color:var(--chip); box-shadow:0 4px 12px -8px var(--chip); }
  .pds-chip.is-dragging { cursor:grabbing; opacity:0.5; }
  .pds-chip-ghost { padding:8px 10px; background:var(--paper); border:1px solid var(--chip); border-radius:10px; transform:translate(-50%, -50%) rotate(-2deg); box-shadow:0 14px 30px -10px rgba(10,15,13,0.45); }
  .pds-chip-dot { width:14px; height:14px; border-radius:50%; background:var(--chip); flex-shrink:0; box-shadow:inset 0 0 0 1.5px rgba(255,255,255,0.4); }
  .pds-chip-body { display:flex; flex-direction:column; line-height:1.25; min-width:0; flex:1; }
  .pds-chip-body b { font-size:12.5px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pds-chip-body em { font-style:normal; font-size:11px; color:var(--n-500); font-family:var(--mono); letter-spacing:0.02em; margin-top:1px; }
  .pds-chip-x { flex-shrink:0; width:20px; height:20px; display:grid; place-items:center; padding:0; border:0; border-radius:6px; background:transparent; color:var(--n-500); font-size:15px; line-height:1; cursor:pointer; opacity:0; transition:.16s; }
  .pds-chip:hover .pds-chip-x, .pds-chip-x:focus-visible { opacity:1; }
  @media (hover: none) { .pds-chip-x { opacity:1; width:32px; height:32px; margin:-6px; } }
  .pds-chip-x:hover { background:var(--n-100); color:var(--ink); }
  .pds-chip-ghost .pds-chip-x { display:none; }
  .pds-roster-empty { padding:10px 2px 2px; font-size:11.5px; line-height:1.5; color:var(--n-500); }

  .pds-assign-sum { display:flex; flex-direction:column; gap:4px; margin-top:6px; }
  .pds-asum-row { display:flex; align-items:center; gap:8px; padding:6px 4px; font-size:12px; }
  .pds-asum-dot { width:9px; height:9px; border-radius:50%; background:var(--chip); flex-shrink:0; }
  .pds-asum-name { flex:1; color:var(--ink); }
  .pds-asum-n { font-family:var(--mono); font-size:11.5px; color:var(--n-600); font-weight:600; }
  .pds-asum-unassigned .pds-asum-name { color:var(--n-500); }

  .pds-tpls { display:flex; flex-direction:column; gap:10px; }
  .pds-tpl { background:var(--paper-soft); border:1px solid var(--n-200); border-radius:12px; padding:14px; }
  .pds-tpl-h { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
  .pds-tpl-h h4 { margin:0 0 4px; font-size:14.5px; font-weight:600; letter-spacing:-0.015em; }
  .pds-tpl-h p { margin:0; font-size:12px; color:var(--n-600); line-height:1.5; }

  .pds-rotate { display:flex; flex-direction:column; gap:14px; }
  .pds-rotate-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
  @media (max-width: 1100px) { .pds-rotate-grid { grid-template-columns:1fr; } }
  .pds-rot-meta { display:flex; flex-direction:column; gap:6px; margin:6px 0 10px; }
  .pds-rot-meta > div { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--paper); border:1px solid var(--n-200); border-radius:9px; font-size:12.5px; }
  .pds-rot-lbl { font-size:11px; font-family:var(--mono); letter-spacing:0.08em; color:var(--n-500); text-transform:uppercase; }
  .pds-rot-val { font-weight:600; color:var(--ink); }
  .pds-rot-actions { display:flex; gap:6px; }
  .pds-rot-actions .kb { flex:1; justify-content:center; }
  .pds-rot-preview { display:flex; flex-direction:column; gap:8px; }
  .pds-rot-step { background:var(--paper); border:1px solid var(--n-200); border-radius:10px; padding:10px; }
  .pds-rot-step-h { font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--atlas); text-transform:uppercase; font-weight:700; margin-bottom:6px; }
  .pds-rot-line { display:grid; grid-template-columns:14px 1fr auto; gap:6px; align-items:center; font-size:11.5px; padding:2px 0; }
  .pds-rot-line .pds-asum-dot { width:9px; height:9px; }
  .pds-rot-line b { font-weight:600; }
  .pds-rot-line em { font-style:normal; font-size:11px; color:var(--n-500); font-family:var(--mono); }

  .pds-fair { display:flex; flex-direction:column; gap:4px; }
  .pds-fair-row { display:grid; grid-template-columns:14px 1fr 70px 36px; gap:6px; align-items:center; font-size:11.5px; }
  .pds-fair-name { font-weight:600; color:var(--ink); }
  .pds-fair-bar { height:5px; background:var(--n-200); border-radius:3px; overflow:hidden; }
  .pds-fair-bar > i { display:block; height:100%; border-radius:3px; }
  .pds-fair-bar .pds-fair-high { background:linear-gradient(90deg, var(--atlas), var(--mint)); }
  .pds-fair-bar .pds-fair-mid { background:linear-gradient(90deg, #D99A2B, #F2C24B); }
  .pds-fair-bar .pds-fair-low { background:linear-gradient(90deg, #C0306E, #E45990); }
  .pds-fair-pct { font-family:var(--mono); font-size:11px; color:var(--n-600); text-align:right; font-weight:600; }
  .pds-fair-note { font-size:11px; color:var(--n-500); padding:0 0 4px 20px; line-height:1.4; }
  .pds-fair-note b { color:var(--ink); }

  .pds-rot-history { padding:14px; }
  .pds-history-grid { display:flex; flex-direction:column; gap:4px; }
  .pds-hist-h, .pds-hist-row { display:grid; grid-template-columns: 100px repeat(7, 1fr); gap:4px; align-items:center; }
  .pds-hist-h > span { font-size:11px; font-family:var(--mono); letter-spacing:0.08em; color:var(--n-500); text-transform:uppercase; text-align:center; }
  .pds-hist-h > span:first-child { text-align:left; }
  .pds-hist-name { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--ink); }
  .pds-hist-cell { height:24px; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:var(--paper); font-family:var(--mono); }
  .pds-hist-a { background:var(--atlas); }
  .pds-hist-b { background:#D99A2B; color:var(--paper); }
  .pds-hist-c { background:#1A8FE3; }
  .pds-hist-d { background:var(--n-400); color:var(--ink); }

  .pds-rot-cfg { display:flex; flex-direction:column; gap:14px; }
  .pds-pillrow { display:flex; gap:6px; flex-wrap:wrap; }
  .pds-cfg-pill { padding:7px 12px; border:1px solid var(--n-200); background:var(--paper); border-radius:8px; font-size:12px; cursor:pointer; color:var(--n-700); transition:.18s; font-family:inherit; }
  .pds-cfg-pill:hover { border-color:var(--atlas); }
  .pds-cfg-pill.active { background:var(--inverse-surface); color:var(--inverse-ink); border-color:var(--inverse-surface); font-weight:600; }
  .pds-strat-cards { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  @media (max-width: 720px) { .pds-strat-cards { grid-template-columns:1fr; } }
  .pds-strat-card { background:var(--paper); border:1.5px solid var(--n-200); border-radius:10px; padding:12px; text-align:left; cursor:pointer; transition:.16s; font-family:inherit; }
  .pds-strat-card:hover { border-color:var(--atlas); }
  .pds-strat-card.active { border-color:var(--atlas); background:rgba(11,110,79,0.06); box-shadow:0 0 0 1.5px var(--atlas); }
  .pds-strat-card b { display:block; font-size:13px; font-weight:600; color:var(--ink); margin-bottom:3px; }
  .pds-strat-card em { display:block; font-style:normal; font-size:11.5px; color:var(--n-600); line-height:1.4; }

  .pds-scene-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
  .pds-scene-pill {
    padding:8px 8px;
    background:var(--paper); border:1px solid var(--n-200); border-radius:8px;
    font-size:11.5px; font-weight:500; color:var(--n-700);
    cursor:pointer; transition:.16s; font-family:inherit;
    letter-spacing:-0.005em; text-align:left;
  }
  .pds-scene-pill:hover { border-color:var(--atlas); color:var(--ink); transform: translateY(-1px); }
  .pds-scene-pill.active {
    background:var(--inverse-surface); color:var(--inverse-ink); border-color:var(--inverse-surface);
    font-weight:600; box-shadow:0 1px 2px rgba(10,15,13,0.16);
  }

  .pds-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; }
  .pds-foot-meta { font-size:11px; color:var(--n-500); letter-spacing:0.06em; }
  .pds-foot-meta .mono { font-family:var(--mono); }
  .pds-foot-actions { display:flex; gap:8px; }

  html[dir="rtl"] .pds-zone-tabs, html[dir="rtl"] .pds-modes { flex-direction:row-reverse; }

  /* ═══ v2 · object-model floor plan ═══════════════════════════════════════
     Everything below supersedes the v1 table/element rules above. The v1
     rules are left in place because a few of them (cell positioning, rail
     chrome, status pills) are still correct; the ones that are not are
     overridden here by source order. Anything keyed to a v1 fixture type
     (.pds-el-wall, .pds-el-door, …) is inert · those kinds were renamed. */

  /* Floor + walls, driven by zone.room rather than a baked scene. */
  /* Le creux de la pièce est posé en ligne par pdsRoomShell(), avec le mur :
     un box-shadow ici ne pourrait jamais l'emporter sur un style en ligne. */
  .pds-floor {
    position:absolute; inset:0;
    border-radius:14px;
    background-repeat:repeat;
    pointer-events:none;
  }
  .pds-plan-room { border-color:rgba(44,37,32,0.22); background:transparent; }

  /* ── Tables ────────────────────────────────────────────────────────────
     The cell is inflated by --pad on every side to hold the chair band, so
     .pds-tbl-face insets by --pad to sit on the tabletop itself. */
  .pds-tbl-cell {
    transform-origin:50% 50%;
    transition: filter 150ms ease;
  }
  /* Le survol soulève la table. La propriété transform est réservée à la
     rotation et au glisser · la toucher ici décalerait la géométrie·, donc
     l'élévation passe par une ombre portée, qui suit la silhouette SVG et
     non la boîte. */
  .pds-tbl-cell:hover { filter:brightness(1.035) drop-shadow(0 5px 10px rgba(20,15,10,0.20)); }
  .pds-tbl-cell.is-selected  { z-index:6; }
  .pds-tbl-cell.is-resizing  { z-index:7; }
  .pds-tbl-cell.is-locked    { cursor:default; }
  .pds-tbl-svg {
    position:absolute; inset:0; width:100%; height:100%;
    display:block; overflow:visible; pointer-events:none;
  }
  .pds-tbl-face {
    position:absolute; inset:var(--pad, 0px);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    pointer-events:none; text-align:center;
  }
  .pds-tbl-num    { font:600 15px/1 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:-0.01em; }
  /* Comme la nuit : seul le numéro habite la table, les couverts ne se
     montrent qu'à l'approche. */
  .pds-tbl-covers { font:400 10px/1 var(--mono, monospace); opacity:0; transition:opacity 180ms ease; margin-top:3px; }
  .pds-tbl-cell:hover .pds-tbl-covers,
  .pds-tbl-cell.is-selected .pds-tbl-covers { opacity:.5; }
  /* L'anneau d'appel pulse dans les deux vues · même géométrie, seule
     l'encre change (menthe la nuit, atlas le jour). Les @keyframes vivent
     dans la couche nuit ; ils sont globaux au document. */
  .pds-noir-call {
    transform-box:fill-box; transform-origin:center;
    animation:pdsNoirCall 2.6s cubic-bezier(.22,.7,.3,1) infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .pds-noir-call { animation:none; opacity:0; }
  }
  /* La pastille « N min » en jour : la même géométrie que la nuit, sur
     papier · jamais de blanc pur. */
  .pds-tbl-since {
    position:absolute; top:calc(var(--pad, 0px) - 24px); left:calc(var(--pad, 0px) - 6px);
    height:19px; padding:0 9px; border-radius:9.5px;
    display:inline-flex; align-items:center;
    background:rgba(247,245,240,0.92); border:1px solid rgba(10,15,13,0.16);
    font:500 10px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.02em; color:rgba(10,15,13,0.66);
    white-space:nowrap; pointer-events:none; z-index:4;
  }
  .pds-resv-chip {
    position:absolute; bottom:calc(var(--pad, 0px) - 24px); left:50%; transform:translateX(-50%);
    height:19px; max-width:calc(100% - 4px); padding:0 9px; border-radius:9.5px;
    display:inline-flex; align-items:center;
    overflow:hidden; text-overflow:ellipsis;
    background:rgba(247,245,240,0.94); border:1px solid rgba(11,110,79,0.42);
    color:#0B6E4F; font:500 10px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.01em; white-space:nowrap; pointer-events:none; z-index:4;
  }

  /* ── Fixtures ──────────────────────────────────────────────────────────
     The v1 rule painted .pds-el itself dark; v2 paints the .pds-el-fill
     child from the instance's own material, so the host must be cleared. */
  .pds-el { background:transparent; border-radius:0; transform-origin:50% 50%; }
  /* overflow:visible, pas hidden : le clip du bâti avalait les tabourets
     du comptoir (cy negatif) dans les deux vues · le trait ne déborde
     nulle part ailleurs, il n'y a plus de texture à contenir. */
  .pds-el-fill { position:absolute; inset:0; background-repeat:repeat; overflow:visible; }
  /* Les tabourets du comptoir se dessinent hors de la boîte du bâti,
     dans les deux vues. */
  .pds-el-svg  { position:absolute; inset:0; width:100%; height:100%; display:block; overflow:visible; }
  .pds-el-label {
    position:absolute; inset:0; padding:2px;
    display:flex; align-items:center; justify-content:center;
    font:500 9px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.14em; text-transform:uppercase;
    pointer-events:none; text-align:center; overflow:hidden;
  }
  /* Les pilules BAR / CAISSE portent leur nom à gauche, comme la nuit. */
  .pds-el-comptoir .pds-el-label,
  .pds-el-caisse .pds-el-label { justify-content:flex-start; padding-left:16px; text-align:left; }
  /* Le curseur « grab » annonce le glisser, pas l'édition : rien ne disait
     qu'un comptoir s'ouvre, se redimensionne et se supprime comme une table.
     Le survol le dit maintenant, avec la même élévation que les tables. */
  .pds-el:not(.is-locked):not(.is-dragging):hover {
    filter: drop-shadow(0 4px 9px rgba(20,15,10,0.20));
    outline: 1.5px solid rgba(11,110,79,0.55); outline-offset: 2px;
  }
  .pds-el.is-selected { z-index:60; }
  .pds-el.is-locked   { cursor:default; }

  /* ── Selection · resize + rotate handles ───────────────────────────────
     Inset by --pad so they hug the tabletop, not the chair band. */
  .pds-hdl-layer { position:absolute; inset:var(--pad, 0px); pointer-events:none; }
  .pds-hdl-layer::before {
    content:''; position:absolute; inset:-2px;
    border:1.5px solid var(--atlas); border-radius:4px;
    box-shadow:0 0 0 3px rgba(11,110,79,0.14);
  }
  .pds-hdl {
    position:absolute; width:11px; height:11px; margin:-5.5px 0 0 -5.5px;
    background:var(--paper, #F7F5F0); border:1.5px solid var(--atlas);
    border-radius:2px; pointer-events:auto;
    box-shadow:0 1px 2px rgba(10,15,13,0.28);
  }
  .pds-hdl:hover { background:var(--mint, #7DF2B0); }
  .pds-hdl-nw { top:0;    left:0;    cursor:nwse-resize; }
  .pds-hdl-n  { top:0;    left:50%;  cursor:ns-resize; }
  .pds-hdl-ne { top:0;    left:100%; cursor:nesw-resize; }
  .pds-hdl-e  { top:50%;  left:100%; cursor:ew-resize; }
  .pds-hdl-se { top:100%; left:100%; cursor:nwse-resize; }
  .pds-hdl-s  { top:100%; left:50%;  cursor:ns-resize; }
  .pds-hdl-sw { top:100%; left:0;    cursor:nesw-resize; }
  .pds-hdl-w  { top:50%;  left:0;    cursor:ew-resize; }
  .pds-hdl-rot {
    top:-24px; left:50%; border-radius:50%;
    background:var(--atlas); border-color:var(--paper, #F7F5F0); cursor:grab;
  }
  .pds-hdl-rot::before {
    content:''; position:absolute; left:50%; top:100%;
    width:1.5px; height:14px; margin-left:-0.75px;
    background:var(--atlas); opacity:.55;
  }
  .pds-dim {
    position:absolute; bottom:-21px; left:50%; transform:translateX(-50%);
    font:600 9px/1.7 var(--mono, monospace);
    background:var(--ink, #0A0F0D); color:var(--paper, #F7F5F0);
    padding:1px 6px; border-radius:3px; white-space:nowrap;
  }
  .pds-locked {
    position:absolute; top:2px; right:2px;
    display:grid; place-items:center;
    width:16px; height:16px; border-radius:4px;
    background:rgba(10,15,13,0.72); color:var(--paper, #F7F5F0);
  }

  /* ── Inspector + room controls ─────────────────────────────────────────*/
  .pds-sw-row { display:flex; flex-wrap:wrap; gap:4px; }
  .pds-sw {
    width:20px; height:20px; border-radius:5px; cursor:pointer;
    border:1.5px solid rgba(44,37,32,0.20); padding:0;
    transition: transform 150ms cubic-bezier(0.34, 1.45, 0.5, 1), box-shadow 150ms ease;
  }
  .pds-sw:hover  { transform:scale(1.12); }
  .pds-sw.active { box-shadow:0 0 0 2px var(--paper, #F7F5F0), 0 0 0 3.5px var(--atlas); }
  .pds-mini-label {
    display:block; margin:9px 0 4px;
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-num-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:8px; }
  .pds-num-grid.pds-num-4 { grid-template-columns:repeat(4, 1fr); margin-top:0; }
  .pds-num-grid > label {
    display:flex; flex-direction:column; gap:3px;
    font:600 9.5px/1 var(--mono, monospace);
    letter-spacing:0.08em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-num-grid input { width:100%; padding:5px 6px; font-size:12px; text-align:center; }
  .pds-unit { font:400 9.5px/1 var(--mono, monospace); color: var(--n-500); letter-spacing:0.06em; text-transform:none; }
  .pds-step { display:flex; align-items:center; gap:5px; }
  .pds-step-val { flex:1; text-align:center; padding:5px 4px; }
  .pds-step-btn {
    width:26px; height:26px; flex:none;
    display:grid; place-items:center;
    border:1px solid var(--n-200); border-radius:7px;
    background:var(--surface); cursor:pointer;
    font:600 12px/1 var(--font-ui, system-ui); color:var(--ink);
  }
  .pds-step-btn:hover { background:var(--paper-muted); border-color:var(--atlas); }
  .pds-rot-row { display:flex; align-items:center; gap:8px; }
  .pds-range { flex:1; accent-color:var(--atlas); }
  .pds-actions-tight { margin-top:0; }

  /* ── Canvas toolbar ────────────────────────────────────────────────────*/
  .pds-bar-tools { display:flex; align-items:center; gap:6px; }
  .pds-tool {
    width:26px; height:26px; flex:none;
    display:grid; place-items:center;
    border:1px solid var(--n-200); border-radius:7px;
    background:var(--surface); color:var(--n-600); cursor:pointer;
  }
  .pds-tool:hover { background:var(--paper-muted); color:var(--atlas); border-color:var(--atlas); }
  .pds-plan-dims { font:400 10px/1 var(--mono, monospace); color: var(--n-500); letter-spacing:0.06em; }
  .pds-plan-footer { display:flex; align-items:center; justify-content:space-between; gap:10px; }

  /* Palette thumbnails are the fixture's own drawing, so the button always
     previews what will actually be placed. */
  .pds-pal-mini {
    display:grid; place-items:center;
    width:28px; height:28px; overflow:hidden;
  }
  .pds-pal-mini svg { display:block; max-width:100%; max-height:100%; }

  /* ═══ v3 · collision, fluid resize, free rotation ════════════════════════ */

  /* Illegal placement is SHOWN, never enforced mid-drag · the object keeps
     following the cursor and settles legally on release. Red is the one
     non-brand hue in the editor, and it only ever appears mid-gesture. */
  .pds-tbl-cell.is-blocked,
  .pds-el.is-blocked { filter:none; }
  .pds-tbl-cell.is-blocked::after,
  .pds-el.is-blocked::after {
    content:''; position:absolute; inset:var(--pad, 0px);
    border:1.5px solid #C0392B; border-radius:5px;
    background:rgba(192,57,43,0.13);
    pointer-events:none; z-index:3;
  }
  .pds-blocker::before {
    content:''; position:absolute; inset:var(--pad, 0px);
    border:1.5px dashed #C0392B; border-radius:5px;
    pointer-events:none; z-index:2;
  }

  /* Handles keep their 11px look but carry a 24px hit pad, so the same
     control works under a fingertip on a tablet. */
  .pds-hdl::after {
    content:''; position:absolute; left:50%; top:50%;
    width:24px; height:24px; transform:translate(-50%, -50%);
  }
  .pds-hdl-rot::after { width:30px; height:30px; }

  /* The dimension badge doubles as the angle readout during a rotate. */
  .pds-tbl-cell.is-resizing .pds-dim,
  .pds-el.is-resizing .pds-dim { background:var(--atlas); }

  .pds-rot-num { width:56px; flex:none; text-align:center; padding:5px 4px; }

  /* ── Ambiances ─────────────────────────────────────────────────────────
     Four curated whole-room palettes. Each button previews its own four
     surfaces, so the merchant picks from what they will get. */
  .pds-amb-row { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:4px; }
  .pds-amb {
    display:flex; flex-direction:column; gap:5px; align-items:flex-start;
    padding:7px 8px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:9px; background:var(--surface);
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .pds-amb:hover  { border-color:var(--atlas); }
  .pds-amb.active { border-color:var(--atlas); box-shadow:0 0 0 2px rgba(11,110,79,0.16); }
  .pds-amb-chips { display:flex; gap:0; border-radius:4px; overflow:hidden; width:100%; height:16px; }
  .pds-amb-chips i { flex:1; display:block; }
  .pds-amb-name {
    font:600 9.5px/1 var(--mono, monospace);
    letter-spacing:0.08em; text-transform:uppercase; color:var(--n-600);
  }

  /* Free picker sits in the swatch row and reads as one more swatch. The
     native colour input is stretched under a conic rainbow so it keeps the
     20px square the row is built on. */
  .pds-sw-custom {
    position:relative; overflow:hidden; display:inline-block;
    background:conic-gradient(#C0392B, #C9A46B, #7DF2B0, #0B6E4F, #BFD9E8, #8A6A45, #C0392B);
  }
  .pds-sw-custom input[type="color"] {
    position:absolute; inset:-4px; width:calc(100% + 8px); height:calc(100% + 8px);
    padding:0; border:0; opacity:0; cursor:pointer;
  }
  .pds-sw-none {
    background:
      linear-gradient(45deg, transparent 45%, #C0392B 45% 55%, transparent 55%),
      var(--paper, #F7F5F0);
  }

  /* ── Setup wizard ──────────────────────────────────────────────────────*/
  .pds-wiz { display:flex; flex-direction:column; gap:2px; }
  .pds-wiz-q {
    display:block; margin:14px 0 6px;
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-wiz-q:first-child { margin-top:0; }
  .pds-wiz-opts { display:flex; flex-wrap:wrap; gap:6px; }
  .pds-wiz-opt {
    padding:7px 12px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:8px;
    background:var(--surface); color:var(--n-700);
    font:500 12.5px/1 var(--font-ui, system-ui);
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }
  .pds-wiz-opt:hover  { border-color:var(--atlas); }
  .pds-wiz-opt.active { background:var(--atlas); border-color:var(--atlas); color:var(--paper, #F7F5F0); }
  .pds-wiz-dims { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .pds-wiz-dims label { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--n-600); }
  .pds-wiz-dims input[type="number"] { width:82px; text-align:center; }
  .pds-wiz-dims .pds-range { flex:1; min-width:160px; }
  .pds-wiz-area {
    font:600 12px/1 var(--mono, monospace); color:var(--atlas);
    padding:5px 9px; border-radius:7px; background:var(--paper-muted, rgba(11,110,79,0.07));
  }

  /* Three candidates, each previewing its own generated objects. */
  .pds-wiz-cards { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; }
  .pds-wiz-card {
    display:flex; flex-direction:column; gap:7px; align-items:stretch; text-align:left;
    padding:9px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:11px; background:var(--surface);
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .pds-wiz-card:hover  { border-color:var(--atlas); }
  .pds-wiz-card.active { border-color:var(--atlas); box-shadow:0 0 0 2px rgba(11,110,79,0.16); }
  .pds-wiz-thumb { display:block; border-radius:7px; overflow:hidden; background:var(--paper, #F7F5F0); }
  .pds-wiz-thumb svg { display:block; width:100%; height:88px; }
  .pds-wiz-card-name {
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--ink);
  }
  .pds-wiz-card-nums { font-size:11.5px; line-height:1.5; color:var(--n-600); }
  .pds-wiz-card-nums b { font-size:15px; color:var(--atlas); }
  .pds-wiz-short {
    font:500 10.5px/1.4 var(--font-ui, system-ui);
    color:#8A4B22; background:rgba(192,57,43,0.09);
    padding:4px 6px; border-radius:6px;
  }
  .pds-wiz-note { margin:10px 0 0; font-size:11.5px; color:var(--n-500); }
  @media (max-width: 620px) { .pds-wiz-cards { grid-template-columns:1fr; } }

  /* ═══ v4 · vue nuit · la console de service ═══════════════════════════════
     Le look promis par la page d'accueil : salle charbon, tables au trait,
     le statut porté par la lumière. Tout vit sous .pds-noir (posée sur la
     racine du tiroir par pdsAttach) ; la vue jour au-dessus reste le rendu
     matières, intact. Une seule teinte d'accent · la menthe · et son halo
     rgba(0,255,174,…), le même vert que l'accueil sombre. */

  .pds-noir { color-scheme: dark; }

  /* La classe est doublée dans chaque sélecteur à dessein : le skin Vexel
     peint ce même chrome via « body.design-vexel :is(…) » · un élément plus
     deux classes · et la vue nuit doit l'emporter par spécificité, pas par
     ordre de source. */

  /* · La coque du tiroir : le cockpit entier passe au noir · */
  .pds-noir.pds-noir.pds-noir { background:rgba(5, 8, 6, 0.72); }
  /* !important : le skin 2026 (empilé par défaut) pose son verre blanc sur
     .kiwi-drawer avec !important · la spécificité seule ne suffit pas ici. */
  .pds-noir.pds-noir.pds-noir .kiwi-drawer { background:#090D0A !important; border-color:rgba(242,239,230,0.10) !important; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-body { background:transparent; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head { background:#0B0F0C; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head :is(h1, h2, h3) { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head p { color:rgba(242,239,230,0.50); }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-close {
    background:#141813; border-color:rgba(242,239,230,0.14); color:rgba(242,239,230,0.78);
  }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-close:hover { border-color:rgba(125,242,176,0.55); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-foot { background:#0B0F0C; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-inspector {
    background:transparent; border:none; box-shadow:none;
    -webkit-backdrop-filter:none; backdrop-filter:none;
  }

  /* · Chrome : panneaux, palette, inspecteur · */
  .pds-noir.pds-noir.pds-noir .pds-rail-card,
  .pds-noir.pds-noir.pds-noir .pds-tpl { background:#0F130F; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-rail-title, .pds-noir.pds-noir.pds-noir .pds-legend-title,
  .pds-noir.pds-noir.pds-noir .pds-mini-label, .pds-noir.pds-noir.pds-noir .pds-wiz-q,
  .pds-noir.pds-noir.pds-noir .pds-form-row > label, .pds-noir.pds-noir.pds-noir .pds-rot-lbl { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-rail-hint, .pds-noir.pds-noir.pds-noir .pds-mode-desc { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-pal-item,
  .pds-noir.pds-noir.pds-noir .pds-tool, .pds-noir.pds-noir.pds-noir .pds-step-btn, .pds-noir.pds-noir.pds-noir .pds-inspect-close,
  .pds-noir.pds-noir.pds-noir .pds-cfg-pill, .pds-noir.pds-noir.pds-noir .pds-scene-pill, .pds-noir.pds-noir.pds-noir .pds-wiz-opt,
  .pds-noir.pds-noir.pds-noir .pds-amb, .pds-noir.pds-noir.pds-noir .pds-strat-card, .pds-noir.pds-noir.pds-noir .pds-chip,
  .pds-noir.pds-noir.pds-noir .pds-wiz-card {
    background:#141813; border-color:rgba(242,239,230,0.10); color:rgba(242,239,230,0.78);
  }
  .pds-noir.pds-noir.pds-noir .pds-pal-label { color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-pal-shape { background:#1C221C; border-color:rgba(242,239,230,0.30); }
  .pds-noir.pds-noir.pds-noir .pds-pal-item:hover { border-color:rgba(125,242,176,0.55); box-shadow:0 6px 16px -10px rgba(0,255,174,0.35); }
  .pds-noir.pds-noir.pds-noir .pds-tool:hover, .pds-noir.pds-noir.pds-noir .pds-step-btn:hover,
  .pds-noir.pds-noir.pds-noir .pds-cfg-pill:hover, .pds-noir.pds-noir.pds-noir .pds-scene-pill:hover,
  .pds-noir.pds-noir.pds-noir .pds-wiz-opt:hover, .pds-noir.pds-noir.pds-noir .pds-amb:hover,
  .pds-noir.pds-noir.pds-noir .pds-strat-card:hover, .pds-noir.pds-noir.pds-noir .pds-inspect-close:hover {
    background:#1A201A; color:#EDEAE0; border-color:rgba(125,242,176,0.55);
  }
  .pds-noir.pds-noir.pds-noir .pds-chip-body b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-roster-empty { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-chip-x { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-chip-x:hover { background:rgba(242,239,230,0.10); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-asum-name { color:rgba(242,239,230,0.80); }
  .pds-noir.pds-noir.pds-noir .pds-asum-n { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-chip-body em { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-rot-meta > div, .pds-noir.pds-noir.pds-noir .pds-rot-step {
    background:#141813; border-color:rgba(242,239,230,0.10);
  }
  .pds-noir.pds-noir.pds-noir .pds-rot-val, .pds-noir.pds-noir.pds-noir .pds-fair-name, .pds-noir.pds-noir.pds-noir .pds-hist-name,
  .pds-noir.pds-noir.pds-noir .pds-strat-card b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-strat-card em { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-rot-line b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-rot-line em { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-rot-step-h { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-fair-bar { background:rgba(242,239,230,0.10); }

  /* Champs · color-scheme:dark règle les natifs, le reste suit. */
  .pds-noir.pds-noir.pds-noir .pds-input, .pds-noir.pds-noir.pds-noir input[type="number"], .pds-noir.pds-noir.pds-noir input[type="text"],
  .pds-noir.pds-noir.pds-noir select, .pds-noir.pds-noir.pds-noir textarea {
    background:#141813; border-color:rgba(242,239,230,0.14); color:#EDEAE0;
  }
  .pds-noir.pds-noir.pds-noir .pds-range, .pds-noir.pds-noir.pds-noir .pds-snap input { accent-color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-snap { color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-unit { color:rgba(242,239,230,0.58); }
  .pds-noir.pds-noir.pds-noir .pds-num-grid > label { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-step-btn { color:#EDEAE0; }

  /* Bandeau KPI */
  .pds-noir.pds-noir.pds-noir .p-kpi { background:#0F130F; border:1px solid rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .p-kpi .l { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .p-kpi .v { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .p-kpi .d { color:rgba(242,239,230,0.62); }

  /* Modes + zones : rail sombre, pilule active claire · le contraste inversé
     de la vue jour, même géométrie pour que la lentille liquide suive. */
  .pds-noir.pds-noir.pds-noir .pds-modes, .pds-noir.pds-noir.pds-noir .pds-zone-tabs {
    background:#0D110D; border-color:rgba(242,239,230,0.10);
  }
  .pds-noir.pds-noir.pds-noir .pds-mode, .pds-noir.pds-noir.pds-noir .pds-zone { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-mode:hover, .pds-noir.pds-noir.pds-noir .pds-zone:hover { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-mode.active { background:#EDEAE0; color:#0B0F0C; }
  .pds-noir.pds-noir.pds-noir .pds-zone.active { background:#1C221C; color:#EDEAE0; box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-zone.active em { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-zone em { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-zone-add { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-zone-add:hover { background:#1C221C; }

  /* Barre du plan + légende façon accueil : cases au trait, l'occupée seule
     rayonne. */
  .pds-noir.pds-noir.pds-noir .pds-canvas-bar { background:#0D110D; border-color:rgba(242,239,230,0.08); }
  /* Légende : les pastilles 17 × 13 rx 4 de l'accueil, sur la même échelle
     de blanc que les tables, la menthe pour l'occupée. Typo du mockup :
     400 · 11 px · -0.01em, encre 0.5. */
  .pds-noir.pds-noir.pds-noir .pds-legend-item {
    color:rgba(255,255,255,0.5);
    font:400 11px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:-0.01em;
  }
  /* Les tabourets du comptoir se dessinent hors de la boîte du bâti. */
  .pds-noir.pds-noir.pds-noir .pds-el-svg { overflow:visible; }
  .pds-noir.pds-noir.pds-noir .pds-legend-swatch {
    width:17px; height:13px; border-radius:4px;
    background:rgba(255,255,255,0.012); box-shadow:none; border:1.25px solid rgba(255,255,255,0.19);
  }
  .pds-noir.pds-noir.pds-noir .pds-sw-occupied {
    border-color:#00FFAE; background:rgba(0,255,174,0.11);
  }
  .pds-noir.pds-noir.pds-noir .pds-sw-reserved { border-style:dashed; border-color:#E8C067; background:rgba(232,192,103,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-sw-cleaning { border-style:dotted; border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.02); }

  /* · La scène · */
  .pds-noir.pds-noir.pds-noir .pds-plan-canvas {
    background:#020302;
    border:1px solid rgba(255,255,255,0.06);
    border-radius:20px;
    padding:16px 16px 8px;
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-room {
    border:1.5px solid rgba(255,255,255,0.13);
    border-radius:18px;
    box-shadow: 0 34px 70px -40px rgba(0,0,0,0.9);
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-room.is-terrasse {
    border-style:dashed; border-color:rgba(0,255,174,0.30); background:transparent;
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-label { color:rgba(242,239,230,0.78); }
  .pds-noir.pds-noir.pds-noir .pds-plan-label em { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-plan-footer { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-plan-floor-count { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-plan-dims { color:rgba(242,239,230,0.58); }
  .pds-noir.pds-noir.pds-noir .pds-empty { background:rgba(10,14,11,0.78); }
  .pds-noir.pds-noir.pds-noir .pds-empty h4 { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-empty p { color:rgba(242,239,230,0.55); }

  /* · Tables : le statut est une lumière, le numéro se lit sans effort.
     Typo du mockup : 500 · 0.04em ; l'échelle de blanc remontée à 0.40 / 0.55
     pour tenir sur le sol quasi noir, la menthe 0.90 pour l'occupée. Le
     survol remonte encore l'encre · un plan d'édition doit rester
     manipulable, l'accueil n'a pas ce souci. · */
  .pds-noir.pds-noir.pds-noir .pds-tbl-num {
    font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.04em; color:rgba(255,255,255,0.62);
  }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"] .pds-tbl-num { color:rgba(0,255,174,0.90); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="reserved"] .pds-tbl-num { color:rgba(232,192,103,0.80); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover .pds-tbl-num,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-selected .pds-tbl-num { color:rgba(255,255,255,0.75); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"]:hover .pds-tbl-num,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"].is-selected .pds-tbl-num { color:#00FFAE; }
  /* Le nombre de couverts n'existe qu'à l'approche · le mockup n'affiche que
     le numéro, et c'est ce silence qui le rend cher. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-covers { opacity:0; transition:opacity 180ms ease; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover .pds-tbl-covers,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-selected .pds-tbl-covers { opacity:.5; }
  /* Le halo de l'occupée vit désormais DANS le SVG (disque pdsNoirCall),
     comme sur l'accueil ; le survol garde juste un peu de lumière en plus. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover { filter:brightness(1.25); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"]:hover { filter:brightness(1.15); }
  /* L'anneau d'appel · la copie de .kw-plan-call de l'accueil. */
  .pds-noir.pds-noir.pds-noir .pds-noir-call {
    transform-box:fill-box; transform-origin:center;
    animation:pdsNoirCall 2.6s cubic-bezier(.22,.7,.3,1) infinite;
  }
  @keyframes pdsNoirCall {
    0%, 62% { opacity:.85; transform:scale(1); }
    100%    { opacity:0;   transform:scale(1.5); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pds-noir.pds-noir.pds-noir .pds-noir-call { animation:none; opacity:0; }
  }
  /* La pastille « 6 min » : 19 px de haut, rx 9.5, encre 0.72 sur noir 0.92. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-since {
    position:absolute; top:calc(var(--pad, 0px) - 24px); left:calc(var(--pad, 0px) - 6px);
    height:19px; padding:0 9px; border-radius:9.5px;
    display:inline-flex; align-items:center;
    background:rgba(10,10,10,0.92); border:1px solid rgba(255,255,255,0.18);
    font:500 10px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.02em; color:rgba(255,255,255,0.72);
    white-space:nowrap; pointer-events:none; z-index:4;
  }
  .pds-noir.pds-noir.pds-noir .pds-resv-chip {
    background:rgba(4,26,20,0.94); border-color:rgba(125,242,176,0.60); color:#7DF2B0;
    box-shadow:0 0 14px rgba(125,242,176,0.12);
  }
  .pds-noir.pds-noir.pds-noir .pds-resv-field > span { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-resv-field .pds-input {
    color-scheme:dark; background:#0D110E; border-color:rgba(125,242,176,0.34); color:#F7F5F0;
  }
  .pds-noir.pds-noir.pds-noir .pds-resv-field .pds-input:focus {
    border-color:#7DF2B0; box-shadow:0 0 0 2px rgba(125,242,176,0.14);
  }
  .pds-noir.pds-noir.pds-noir .pds-tbl-server { border-color:#0D110E; }
  /* Les pastilles serveur appartiennent à l'Affectation ; en Aménagement
     elles ne font que du bruit que le mockup n'a pas. */
  .pds-noir.pds-noir.pds-noir .pds-stage-layout .pds-tbl-server { display:none; }

  /* · Sélection : cadre menthe + tirets d'angle, le geste de l'accueil · */
  .pds-noir.pds-noir.pds-noir .pds-hdl-layer::before {
    border-color:#7DF2B0; border-radius:9px;
    box-shadow:0 0 0 3px rgba(0,255,174,0.13), 0 0 26px rgba(0,255,174,0.20);
  }
  .pds-noir.pds-noir.pds-noir .pds-hdl { background:#0D110E; border-color:#7DF2B0; box-shadow:0 0 6px rgba(0,255,174,0.35); }
  .pds-noir.pds-noir.pds-noir .pds-hdl:hover { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-n, .pds-noir.pds-noir.pds-noir .pds-hdl-s { width:18px; height:5px; margin:-2.5px 0 0 -9px; border-radius:3px; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-e, .pds-noir.pds-noir.pds-noir .pds-hdl-w { width:5px; height:18px; margin:-9px 0 0 -2.5px; border-radius:3px; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-rot { background:#7DF2B0; border-color:#0D110E; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-rot::before { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-dim { background:#7DF2B0; color:#07100C; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-resizing .pds-dim,
  .pds-noir.pds-noir.pds-noir .pds-el.is-resizing .pds-dim { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-locked { background:rgba(242,239,230,0.14); color:#EDEAE0; }

  /* · Bâti : les idéogrammes se dessinent en SVG (pdsNoirFixture), le CSS ne
     rajoute rien sur le fond · un liseré ici doublerait le trait. · */
  .pds-noir.pds-noir.pds-noir .pds-el:not(.is-locked):not(.is-dragging):hover {
    outline-color:rgba(125,242,176,0.65);
    filter:drop-shadow(0 0 12px rgba(0,255,174,0.14));
  }
  /* Étiquettes du bâti : la typo du mockup · 500 · 0.14em · blanc 0.34 · et
     les pilules BAR / CAISSE portent leur nom à gauche, pas au centre. */
  .pds-noir.pds-noir.pds-noir .pds-el-label {
    font:500 9px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.14em;
  }
  .pds-noir.pds-noir.pds-noir .pds-el-comptoir .pds-el-label,
  .pds-noir.pds-noir.pds-noir .pds-el-caisse .pds-el-label {
    justify-content:flex-start; padding-left:16px; text-align:left;
  }

  /* Gêne de placement : le rouge reste le seul hors-marque, plus clair ici. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-blocked::after,
  .pds-noir.pds-noir.pds-noir .pds-el.is-blocked::after { border-color:#E4604E; background:rgba(228,96,78,0.14); }
  .pds-noir.pds-noir.pds-noir .pds-blocker::before { border-color:#E4604E; }

  /* · Statuts (légende de l'inspecteur) · */
  .pds-noir.pds-noir.pds-noir .pds-pill-free { background:rgba(242,239,230,0.07); color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-pill-occupied { background:rgba(0,255,174,0.10); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-pill-reserved { background:rgba(232,192,103,0.10); color:#E8C067; border:1px dashed rgba(232,192,103,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-pill-cleaning { background:rgba(255,255,255,0.02); color:rgba(242,239,230,0.60); border:1px dotted rgba(255,255,255,0.40); }

  /* · Groupes : l'enveloppe passe à la menthe sur la scène noire · */
  .pds-noir.pds-noir.pds-noir .pds-group-env { border-color:rgba(0,255,174,0.55); background:rgba(0,255,174,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-group-env::before { background:radial-gradient(closest-side, rgba(0,255,174,0.16), rgba(0,255,174,0)); }
  .pds-noir.pds-noir.pds-noir .pds-group-chip { background:rgba(4,26,20,0.92); border-color:rgba(0,255,174,0.55); color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-inspect-actions .kb.pds-group-arming { border-color:#00FFAE; color:#00FFAE; animation:pdsGroupArm 1.2s ease-in-out infinite; }
  .pds-noir.pds-noir.pds-noir .pds-group-info { border-color:rgba(0,255,174,0.35); background:rgba(0,255,174,0.07); color:#7DF2B0; }

  /* Nuancier : l'anneau de l'actif passe à la menthe sur fond noir. */
  .pds-noir.pds-noir.pds-noir .pds-sw { border-color:rgba(242,239,230,0.18); }
  .pds-noir.pds-noir.pds-noir .pds-sw.active { box-shadow:0 0 0 2px #0F130F, 0 0 0 3.5px #7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-sw-none {
    background:
      linear-gradient(45deg, transparent 45%, #E4604E 45% 55%, transparent 55%),
      #141813;
  }

  /* Pied de page */
  .pds-noir.pds-noir.pds-noir .pds-foot-meta { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .kb.ghost { background:#141813; border-color:rgba(242,239,230,0.14); color:rgba(242,239,230,0.78); }
  .pds-noir.pds-noir.pds-noir .kb.ghost:hover { border-color:rgba(125,242,176,0.55); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-rail-danger { color:#E4604E; }
  .pds-noir.pds-noir.pds-noir .pds-rail-danger:hover { border-color:#E4604E; }

  /* ═════ v3 · la salle telle qu'elle est ════════════════════════════════
     Live room, filters, zoom, palette by seats, live panel, versions,
     export. Day rules first, then the noir overrides at the same
     triple-class weight as the rest of the night skin. */

  /* KPI strip: the shared .kx-kpi-strip, four cells. */
  .pds-kpis { margin-bottom:14px; }
  .pds-kpis .kx-kpi .v { font-size:26px; }
  .pds-kpis .kx-kpi .d { margin-top:6px; font-size:11.5px; color:var(--n-600); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pds-kpis .kx-kpi.warn .v { color:#C2456F; }
  .pds-kpis .kx-kpi.warn .l { color:#C2456F; }

  /* Live badge: a dot and three words. */
  .pds-live-badge { display:inline-flex; align-items:center; gap:7px; height:24px; padding:0 10px; border-radius:12px;
    font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:0.01em; white-space:nowrap;
    background:rgba(10,15,13,0.04); color:var(--n-600); border:1px solid var(--n-200); }
  .pds-live-badge i { width:7px; height:7px; border-radius:50%; background:var(--n-400); flex:none; }
  .pds-live-badge.is-live { background:rgba(11,110,79,0.08); color:var(--atlas); border-color:rgba(11,110,79,0.28); }
  .pds-live-badge.is-live i { background:var(--atlas); box-shadow:0 0 0 3px rgba(11,110,79,0.16); animation:pdsLivePulse 2.4s ease-in-out infinite; }
  .pds-live-badge.is-stale { background:rgba(200,146,53,0.10); color:#7D5A1A; border-color:rgba(200,146,53,0.40); }
  .pds-live-badge.is-stale i { background:#C89235; }
  @keyframes pdsLivePulse { 0%,100% { box-shadow:0 0 0 0 rgba(11,110,79,0.30); } 50% { box-shadow:0 0 0 4px rgba(11,110,79,0); } }
  @media (prefers-reduced-motion: reduce) { .pds-live-badge.is-live i { animation:none; } }

  .pds-zone-dot { width:8px; height:8px; border-radius:50%; background:var(--zone, var(--atlas)); flex:none; }
  .pds-plan-label[style*="--zone"] { color:var(--zone); }

  /* Legend = filters. A button that reads like the old label until pressed. */
  button.pds-legend-item { background:transparent; border:1px solid transparent; border-radius:8px; padding:4px 8px; cursor:pointer; font-family:inherit; }
  button.pds-legend-item:hover { background:rgba(10,15,13,0.04); color:var(--ink); }
  button.pds-legend-item.on { background:var(--surface); border-color:var(--atlas); color:var(--ink); }
  .pds-legend-item b { font:600 11px/1 var(--mono, monospace); color:var(--n-500); margin-left:2px; font-variant-numeric:tabular-nums; }
  .pds-legend-item.on b { color:var(--atlas); }
  .pds-legend-clear { background:transparent; border:0; padding:4px 6px; font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui; color:var(--atlas); cursor:pointer; text-decoration:underline; text-underline-offset:3px; }

  /* The till's own inks. Addition demandée is the loudest thing in the room. */
  .pds-sw-ordering { background:rgba(200,146,53,0.12); border-color:#C89235; }
  .pds-sw-bill     { background:rgba(194,69,111,0.14); border-color:#C2456F; border-width:1.75px; }
  .pds-sw-paid     { background:rgba(10,15,13,0.02); border-style:dotted; border-color:rgba(10,15,13,0.45); }
  .pds-sw-reserved { background:rgba(5,59,44,0.06); border-style:dashed; border-color:#053B2C; }
  .pds-sw-out      { background:repeating-linear-gradient(135deg, rgba(10,15,13,0.08) 0 2px, transparent 2px 5px); border-style:dashed; border-color:rgba(10,15,13,0.30); }
  .pds-pill-ordering { background:rgba(200,146,53,0.14); color:#7D5A1A; }
  .pds-pill-bill     { background:rgba(194,69,111,0.12); color:#A0335A; }
  .pds-pill-paid     { background:rgba(10,15,13,0.02); color:var(--n-700); border:1px dotted rgba(10,15,13,0.45); }
  .pds-pill-out      { background:rgba(10,15,13,0.04); color:var(--n-600); border:1px dashed rgba(10,15,13,0.30); }
  .pds-pill-reserved, .pds-status-pill.pds-pill-reserved { background:rgba(5,59,44,0.06); color:#053B2C; border:1px dashed rgba(5,59,44,0.55); }
  .pds-status-pill.pds-pill-ordering { background:rgba(200,146,53,0.12); color:#7D5A1A; }
  .pds-status-pill.pds-pill-bill { background:rgba(194,69,111,0.10); color:#A0335A; }
  .pds-status-pill.pds-pill-paid { background:rgba(10,15,13,0.02); color:var(--n-700); border-style:dotted; border-color:rgba(10,15,13,0.40); }
  .pds-status-pill.pds-pill-out { background:rgba(10,15,13,0.03); color:var(--n-600); border-style:dashed; border-color:rgba(10,15,13,0.30); }

  /* Heat switch: a small segmented control. */
  .pds-heat { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--n-200); border-radius:8px; background:var(--surface); }
  .pds-heat-opt { border:0; background:transparent; padding:4px 8px; border-radius:6px; font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui; color:var(--n-600); cursor:pointer; }
  .pds-heat-opt:hover:not([disabled]) { color:var(--ink); }
  .pds-heat-opt.on { background:rgba(11,110,79,0.10); color:var(--atlas); }
  .pds-heat-opt[disabled] { opacity:0.42; cursor:not-allowed; }

  .pds-zoom { display:inline-flex; align-items:center; gap:2px; }
  .pds-tool.pds-zoom-val { width:auto; min-width:44px; padding:0 7px; font:500 11px/1 var(--mono, monospace); font-variant-numeric:tabular-nums; }
  .pds-tool svg { width:16px; height:16px; display:block; }
  .pds-tool[disabled] { opacity:0.38; cursor:default; pointer-events:none; }
  .pds-bar-tools { flex-wrap:wrap; justify-content:flex-end; }

  /* Zoom: the room keeps its fit width until zoomed, then the canvas scrolls. */
  .pds-plan-canvas.is-zoomed { overflow:auto; max-height:calc(100dvh - var(--pds-chrome, 330px)); overscroll-behavior:contain; }
  .pds-plan-canvas.is-zoomed .pds-plan-room { flex:none; }
  .pds-plan-canvas.is-panning, .pds-plan-canvas.is-panning * { cursor:grabbing !important; }
  .pds-plan-canvas.is-pan-ready { cursor:grab; }

  .pds-marquee { position:absolute; z-index:30; pointer-events:none; border:1px dashed var(--atlas); background:rgba(11,110,79,0.07); border-radius:3px; }

  /* Filters and heat map on the table cell. */
  .pds-tbl-cell { transition:opacity .2s ease, filter .2s ease; }
  .pds-tbl-cell.is-dim { opacity:0.22; filter:saturate(0.2); }
  .pds-tbl-cell.has-heat::before { content:""; position:absolute; inset:calc(var(--pad, 0px) - 10px); border-radius:50%;
    background:radial-gradient(closest-side, rgba(11,110,79,calc(var(--heat, 0) * 0.42)), rgba(11,110,79,0)); pointer-events:none; z-index:0; }
  .pds-tbl-heat { position:absolute; bottom:calc(var(--pad, 0px) - 24px); left:50%; transform:translateX(-50%);
    height:19px; padding:0 9px; border-radius:9.5px; display:inline-flex; align-items:center; white-space:nowrap; pointer-events:none; z-index:5;
    background:var(--atlas); color:#F7F5F0; font:600 10px/1 var(--font-ui, 'Inter Tight'), system-ui; font-variant-numeric:tabular-nums; }
  .pds-bill-chip { position:absolute; top:calc(var(--pad, 0px) - 24px); right:calc(var(--pad, 0px) - 6px);
    height:19px; padding:0 8px; border-radius:9.5px; display:inline-flex; align-items:center; white-space:nowrap; pointer-events:none; z-index:4;
    background:rgba(247,245,240,0.94); border:1px solid rgba(194,69,111,0.45); color:#A0335A;
    font:600 10px/1 var(--font-ui, 'Inter Tight'), system-ui; font-variant-numeric:tabular-nums; }
  .pds-tbl-cell[data-status="bill"] .pds-bill-chip { background:#C2456F; border-color:#C2456F; color:#F7F5F0; }
  .pds-resv-chip.is-next { border-style:dashed; border-color:rgba(5,59,44,0.40); color:#053B2C; background:rgba(247,245,240,0.86); }
  .pds-tbl-since.is-check { border-color:rgba(200,146,53,0.60); color:#7D5A1A; background:rgba(252,246,232,0.96); }
  .pds-tbl-cell.pds-flash { animation:pdsFlash 1.3s cubic-bezier(0.34, 1.45, 0.5, 1); }
  @keyframes pdsFlash { 0% { transform:scale(1); } 25% { transform:scale(1.10); } 100% { transform:scale(1); } }
  @media (prefers-reduced-motion: reduce) { .pds-tbl-cell.pds-flash { animation:none; outline:2px solid var(--atlas); } }

  /* Footer under the canvas. */
  .pds-plan-footer { gap:14px; padding:2px 4px; color:var(--n-500); }
  .pds-plan-floor-count { font-size:11.5px; color:var(--n-700); font-variant-numeric:tabular-nums; }
  .pds-kbd-hint { flex:1; text-align:center; font-size:11px; color:var(--n-500); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  @media (max-width: 1100px) { .pds-kbd-hint { display:none; } }
  .pds-foot-saved { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--n-500); }
  .pds-foot-saved::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--atlas); }
  .pds-count { display:inline-grid; place-items:center; min-width:18px; height:18px; padding:0 5px; margin-left:4px; border-radius:9px; background:rgba(11,110,79,0.10); color:var(--atlas); font:600 11px/1 var(--mono, monospace); }
  .kb.pds-danger { background:var(--danger, #B4362A); border-color:var(--danger, #B4362A); color:#F7F5F0; }
  .kb.pds-danger:hover { filter:brightness(0.94); }

  /* Palette: seats first, then five shapes. */
  .pds-pal-seats { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; font-size:12px; color:var(--n-700); }
  .pds-step-out { min-width:22px; text-align:center; font:600 13px/1 var(--mono, monospace); font-variant-numeric:tabular-nums; color:var(--ink); }
  .pds-palette-shapes { grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px; }
  .pds-palette-shapes .pds-pal-item { padding:8px 2px 6px; min-width:0; }
  .pds-palette-shapes .pds-pal-label { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
  .pds-rail-hint-sm { font-size:11px; margin:10px 0 0; }
  .pds-rail-warn { margin-bottom:10px; padding:8px 10px; border-radius:8px; font-size:11.5px; line-height:1.4;
    background:rgba(180,54,42,0.07); border:1px solid rgba(180,54,42,0.30); color:#8E2A20; }
  .pds-field-warn { display:block; margin-top:5px; font-size:11px; color:#8E2A20; }
  .pds-field-hint { margin:6px 0 0; font-size:11px; line-height:1.4; color:var(--n-500); }
  .pds-zone-tools { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
  .pds-zone-tools .kb { flex:1; min-width:0; justify-content:center; }

  /* Assign rail: who is on shift. */
  .pds-duty { font-style:normal; font-weight:600; }
  .pds-duty-on-duty { color:var(--atlas); }
  .pds-duty-on-pause { color:#7D5A1A; }
  .pds-duty-off-duty { color:var(--n-500); }
  .pds-chip.is-off { opacity:0.62; }
  .pds-chip.is-off:hover { opacity:1; }

  /* Till status card in the inspector. */
  .pds-till-status { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; padding:9px 10px; border-radius:9px;
    background:var(--paper); border:1px solid var(--n-200); font-size:12px; color:var(--n-700); }
  .pds-till-status b { font-weight:600; color:var(--ink); }
  .pds-till-status > span:not(.pds-legend-swatch) { font-variant-numeric:tabular-nums; }
  .pds-till-bill { border-color:rgba(194,69,111,0.45); background:rgba(194,69,111,0.05); }
  .pds-till-bill b { color:#A0335A; }

  /* Live panel (empty inspector). */
  .pds-live { display:flex; flex-direction:column; gap:12px; }
  .pds-live-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .pds-live-head .pds-rail-title { margin:0; }
  .pds-live-head .pds-live-badge { height:20px; padding:0 8px; font-size:11px; }
  .pds-live-sec { display:flex; flex-direction:column; gap:3px; }
  .pds-live-sub { font:500 11px/1.3 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:0.06em; text-transform:uppercase; color:var(--n-500); margin-bottom:3px; }
  .pds-live-sec.is-urgent .pds-live-sub { color:#A0335A; }
  .pds-live-sec.is-check .pds-live-sub { color:#7D5A1A; }
  .pds-live-note { margin:0 0 4px; font-size:11.5px; line-height:1.45; color:var(--n-600); }
  .pds-live-row { display:grid; grid-template-columns:auto minmax(0, 1fr) auto; align-items:center; gap:8px; width:100%;
    padding:6px 8px; border-radius:8px; border:1px solid transparent; background:transparent; text-align:left; font:inherit; font-size:12px; color:var(--n-700); cursor:pointer; }
  button.pds-live-row:hover { background:var(--paper); border-color:var(--n-200); }
  .pds-live-row b { font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
  .pds-live-row span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pds-live-row em { font-style:normal; font-variant-numeric:tabular-nums; color:var(--n-600); }
  .pds-live-sec.is-urgent .pds-live-row { background:rgba(194,69,111,0.06); }
  .pds-live-sec.is-urgent .pds-live-row em { color:#A0335A; font-weight:600; }
  .pds-live-row.is-unplaced { cursor:default; }
  .pds-live-place.kb { height:24px; padding:0 8px; font-size:11px; }
  .pds-live-stat { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:2px 8px; padding:6px 0; border-top:1px solid var(--n-200); font-size:12px; }
  .pds-live-stat:first-of-type { border-top:0; }
  .pds-live-stat b { font-weight:600; color:var(--ink); }
  .pds-live-stat span { grid-column:1 / -1; color:var(--n-600); font-size:11.5px; }
  .pds-live-stat em { grid-row:1; grid-column:2; font-style:normal; color:var(--atlas); font-variant-numeric:tabular-nums; }

  /* Rotation. */
  .pds-rot-auto { margin:0 0 10px; font-size:11.5px; color:var(--n-600); }
  .pds-rot-auto.on { color:var(--atlas); }
  .pds-toggle-row { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid var(--n-200); border-radius:10px; background:var(--paper); cursor:pointer; }
  .pds-toggle-row input { accent-color:var(--atlas); margin-top:3px; }
  .pds-toggle-row span { display:flex; flex-direction:column; gap:3px; }
  .pds-toggle-row b { font-size:13px; font-weight:600; color:var(--ink); }
  .pds-toggle-row em { font-style:normal; font-size:11.5px; color:var(--n-600); line-height:1.4; }
  .pds-pairs { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
  .pds-pairs[hidden] { display:none; }
  .pds-pair-row { display:grid; grid-template-columns:minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items:center; gap:6px; }
  .pds-pair-row .pds-chip-x { opacity:1; }
  .pds-hist-h, .pds-hist-row { grid-template-columns:100px repeat(var(--cols, 7), minmax(0, 1fr)); }

  /* Export + versions modals. */
  .pds-export-opts { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media (max-width: 520px) { .pds-export-opts { grid-template-columns:1fr; } }
  .pds-export-opt { display:flex; flex-direction:column; align-items:flex-start; gap:6px; padding:14px; border-radius:12px; text-align:left;
    border:1.5px solid var(--n-200); background:var(--paper); font-family:inherit; cursor:pointer; transition:border-color .16s, background .16s; }
  .pds-export-opt:hover { border-color:var(--atlas); background:var(--surface); }
  .pds-export-opt b { font-size:13.5px; font-weight:600; color:var(--ink); }
  .pds-export-opt em { font-style:normal; font-size:11.5px; line-height:1.4; color:var(--n-600); }
  .pds-export-ico { width:30px; height:30px; display:grid; place-items:center; border-radius:8px; background:rgba(11,110,79,0.08); color:var(--atlas); }
  .pds-export-ico svg { width:18px; height:18px; }
  .pds-versions { display:flex; flex-direction:column; gap:8px; }
  .pds-version-new { display:flex; gap:8px; margin-bottom:6px; }
  .pds-version-new .pds-input { flex:1; min-width:0; }
  .pds-version { display:grid; grid-template-columns:minmax(0, 1fr) auto auto; align-items:center; gap:8px; padding:10px 12px; border:1px solid var(--n-200); border-radius:10px; background:var(--paper); }
  .pds-version > div { display:flex; flex-direction:column; gap:3px; min-width:0; }
  .pds-version b { font-size:13px; font-weight:600; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pds-version em { font-style:normal; font-size:11.5px; color:var(--n-600); }

  /* ── Noir ── */
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi { background:#0D110D; }
  .pds-noir.pds-noir.pds-noir .pds-kpis { background:rgba(242,239,230,0.08); border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .v { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .l, .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .d { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .v, .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .l { color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-live-badge { background:rgba(242,239,230,0.05); border-color:rgba(242,239,230,0.12); color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-live-badge.is-live { background:rgba(0,255,174,0.08); border-color:rgba(0,255,174,0.35); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-live-badge.is-live i { background:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-live-badge.is-stale { background:rgba(232,192,103,0.08); border-color:rgba(232,192,103,0.40); color:#E8C067; }
  .pds-noir.pds-noir.pds-noir button.pds-legend-item:hover { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.85); }
  .pds-noir.pds-noir.pds-noir button.pds-legend-item.on { background:rgba(0,255,174,0.06); border-color:rgba(0,255,174,0.55); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-legend-item b { color:rgba(255,255,255,0.45); }
  .pds-noir.pds-noir.pds-noir .pds-legend-clear { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-sw-ordering { border-color:#E8C067; background:rgba(232,192,103,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-sw-bill { border-color:#FF7DA9; background:rgba(255,125,169,0.14); }
  .pds-noir.pds-noir.pds-noir .pds-sw-paid { border-style:dotted; border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.02); }
  .pds-noir.pds-noir.pds-noir .pds-sw-reserved { border-style:dashed; border-color:rgba(247,245,240,0.70); background:rgba(247,245,240,0.05); }
  .pds-noir.pds-noir.pds-noir .pds-sw-out { border-style:dashed; border-color:rgba(255,255,255,0.22); background:repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 5px); }
  .pds-noir.pds-noir.pds-noir .pds-pill-ordering { background:rgba(232,192,103,0.10); color:#E8C067; }
  .pds-noir.pds-noir.pds-noir .pds-pill-bill { background:rgba(255,125,169,0.12); color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-pill-paid { background:rgba(255,255,255,0.02); color:rgba(242,239,230,0.60); border:1px dotted rgba(255,255,255,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-pill-out { background:rgba(255,255,255,0.03); color:rgba(242,239,230,0.55); border:1px dashed rgba(255,255,255,0.25); }
  .pds-noir.pds-noir.pds-noir .pds-pill-reserved { background:rgba(247,245,240,0.05); color:#EDEAE0; border:1px dashed rgba(247,245,240,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-heat { background:#0D110D; border-color:rgba(242,239,230,0.12); }
  .pds-noir.pds-noir.pds-noir .pds-heat-opt { color:rgba(242,239,230,0.60); }
  .pds-noir.pds-noir.pds-noir .pds-heat-opt.on { background:rgba(0,255,174,0.10); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-marquee { border-color:#00FFAE; background:rgba(0,255,174,0.07); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.has-heat::before { background:radial-gradient(closest-side, rgba(0,255,174,calc(var(--heat, 0) * 0.34)), rgba(0,255,174,0)); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-heat { background:#00FFAE; color:#020302; }
  .pds-noir.pds-noir.pds-noir .pds-bill-chip { background:rgba(10,10,10,0.92); border-color:rgba(255,125,169,0.55); color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="bill"] .pds-bill-chip { background:#FF7DA9; border-color:#FF7DA9; color:#020302; }
  .pds-noir.pds-noir.pds-noir .pds-resv-chip.is-next { background:rgba(10,10,10,0.88); border-color:rgba(247,245,240,0.35); color:rgba(247,245,240,0.80); box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-since.is-check { border-color:rgba(232,192,103,0.60); color:#E8C067; }
  .pds-noir.pds-noir.pds-noir .pds-plan-floor-count { color:rgba(242,239,230,0.72); }
  .pds-noir.pds-noir.pds-noir .pds-kbd-hint, .pds-noir.pds-noir.pds-noir .pds-foot-saved { color:rgba(242,239,230,0.50); }
  .pds-noir.pds-noir.pds-noir .pds-foot-saved::before { background:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-count { background:rgba(0,255,174,0.10); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-pal-seats { color:rgba(242,239,230,0.72); }
  .pds-noir.pds-noir.pds-noir .pds-step-out { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-rail-warn { background:rgba(228,96,78,0.10); border-color:rgba(228,96,78,0.40); color:#F29A8C; }
  .pds-noir.pds-noir.pds-noir .pds-field-warn { color:#F29A8C; }
  .pds-noir.pds-noir.pds-noir .pds-field-hint { color:rgba(242,239,230,0.50); }
  .pds-noir.pds-noir.pds-noir .pds-duty-on-duty { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-duty-on-pause { color:#E8C067; }
  .pds-noir.pds-noir.pds-noir .pds-till-status { background:#0D110D; border-color:rgba(242,239,230,0.12); color:rgba(242,239,230,0.70); }
  .pds-noir.pds-noir.pds-noir .pds-till-status b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-till-bill { border-color:rgba(255,125,169,0.45); background:rgba(255,125,169,0.06); }
  .pds-noir.pds-noir.pds-noir .pds-till-bill b { color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-live-sub, .pds-noir.pds-noir.pds-noir .pds-live-note { color:rgba(242,239,230,0.52); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-sub { color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-check .pds-live-sub { color:#E8C067; }
  .pds-noir.pds-noir.pds-noir .pds-live-row { color:rgba(242,239,230,0.70); }
  .pds-noir.pds-noir.pds-noir button.pds-live-row:hover { background:#141813; border-color:rgba(242,239,230,0.12); }
  .pds-noir.pds-noir.pds-noir .pds-live-row b, .pds-noir.pds-noir.pds-noir .pds-live-stat b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-live-row em { color:rgba(242,239,230,0.60); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-row { background:rgba(255,125,169,0.07); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-row em { color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-live-stat { border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-live-stat span { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-live-stat em { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-rot-auto { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-rot-auto.on { color:#7DF2B0; }
  /* ═════ v4 · la page dans le cadre, l'esthétique de l'accueil ═══════════
     Plan de salle is a 3.0 page now (Kiwi.appPage): the dashboard's sidebar
     and top bar stay, the room sits under a real h1. The night view, the
     default, is the landing's « Le plan de salle, en un geste »: a black
     page, hairline cards at 0.10, white type on an opacity scale, mint for
     the one thing that needs attention. Day mirrors it in ink and atlas. */

  /* Page shell. The host paints nothing; in night view main does. */
  .dash-genpage.pds-host { background:transparent; }
  .pds-page { display:flex; flex-direction:column; gap:14px; }
  body.pds-dark-page main.main,
  body.pds-dark-page .main { background:#000 !important; }
  body.pds-dark-page .dash-genpage .genpage-head h1 { color:#F2EFE6; }
  body.pds-dark-page .dash-genpage .genpage-head p { color:rgba(255,255,255,0.50); }
  body.pds-dark-page .dash-genpage .genpage-head p .seg:first-child { color:rgba(255,255,255,0.78); }
  body.pds-dark-page .dash-genpage .genpage-head p .dot { background:rgba(255,255,255,0.28); }
  body.pds-dark-page .dash-genpage .genpage-head::after { background:rgba(255,255,255,0.10); }
  /* Listes déroulantes (kiwi-select) : le déclencheur peignait du blanc à
     68 % sur le noir, et le menu est monté sur <body>, hors de .pds-noir. */
  .pds-noir.pds-noir.pds-noir .kiwi-select-trigger {
    background:#0b0d0c; border-color:rgba(255,255,255,0.12); color:#EDEAE0; box-shadow:none;
  }
  .pds-noir.pds-noir.pds-noir .kiwi-select-trigger:hover { background:#101312; border-color:rgba(255,255,255,0.22); }
  .pds-noir.pds-noir.pds-noir .kiwi-select-value-meta,
  .pds-noir.pds-noir.pds-noir .kiwi-select-chevron { color:rgba(255,255,255,0.45); }
  body.pds-dark-page .kiwi-select-popover {
    background:rgba(10,12,11,0.96); border-color:rgba(255,255,255,0.12); color:#EDEAE0;
  }
  body.pds-dark-page .kiwi-select-option[aria-selected="true"] { background:rgba(255,255,255,0.08); color:#F2EFE6; }
  body.pds-dark-page .kiwi-select-option:hover,
  body.pds-dark-page .kiwi-select-option.is-active { background:rgba(255,255,255,0.06); }

  /* KPI strip: the shared four cells, set like the landing's cards. */
  .pds-page .pds-kpis { margin:0; }
  .pds-page .pds-kpis .kx-kpi .l { text-transform:none; letter-spacing:0; font-size:12.5px; font-weight:500; }
  .pds-noir.pds-noir.pds-noir .pds-kpis { background:rgba(255,255,255,0.10); border-color:rgba(255,255,255,0.10); box-shadow:none; border-radius:16px; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi { background:#050605; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .v { color:#F2EFE6; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .l { color:rgba(255,255,255,0.50); }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .d { color:rgba(255,255,255,0.38); }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .v,
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .l { color:#00FFAE; }
  .pds-page .pds-kpis .kx-kpi.warn .v, .pds-page .pds-kpis .kx-kpi.warn .l { color:var(--atlas); }

  /* One toolbar: modes, zones, then live state and the page's actions. */
  .pds-page .pds-toolbar { margin:0; gap:8px; }
  .pds-toolbar-gap { flex:1 1 auto; }
  .pds-page .pds-modes, .pds-page .pds-zone-tabs {
    padding:3px; gap:2px; border-radius:12px; background:var(--paper-soft); border:1px solid var(--n-200);
  }
  .pds-page .pds-mode, .pds-page .pds-zone {
    height:32px; padding:0 14px; border-radius:9px; font:500 13px/1 var(--sans, 'Inter Tight'), system-ui;
    color:var(--n-600); letter-spacing:-0.005em; display:inline-flex; align-items:center; gap:7px;
  }
  .pds-page .pds-mode.active, .pds-page .pds-zone.active {
    background:var(--surface); color:var(--ink); font-weight:600; box-shadow:0 1px 2px rgba(10,15,13,0.10), 0 0 0 1px var(--n-200);
  }
  .pds-page .pds-zone em { font:500 11.5px/1 var(--sans, 'Inter Tight'), system-ui; color:var(--n-500); font-variant-numeric:tabular-nums; }
  .pds-page .pds-zone-add { width:32px; padding:0; justify-content:center; font-size:16px; }
  .pds-act.kb { height:36px; }
  .pds-act.kb.primary { padding-inline:16px; }
  .pds-more { position:relative; }
  .pds-more > summary { list-style:none; cursor:pointer; position:relative; }
  .pds-more > summary::-webkit-details-marker { display:none; }
  .pds-more-dot { position:absolute; top:6px; right:6px; width:7px; height:7px; border-radius:50%; background:var(--danger, #B4362A); }
  .pds-more-pop {
    position:absolute; right:0; top:calc(100% + 6px); z-index:40; min-width:240px; padding:6px;
    display:grid; gap:2px; border:1px solid var(--n-200); border-radius:14px; background:var(--surface);
    box-shadow:0 18px 40px -16px rgba(10,15,13,0.28);
  }
  .pds-more-pop button {
    display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:10px 12px;
    border:0; border-radius:9px; background:transparent; color:var(--ink); font:500 13.5px/1.2 var(--sans, 'Inter Tight'), system-ui;
    text-align:left; cursor:pointer;
  }
  .pds-more-pop button:hover { background:var(--paper-soft); }
  .pds-more-pop button em { font-style:normal; font-size:11.5px; color:var(--danger, #B4362A); }
  .pds-more-pop button.is-danger { color:var(--danger, #B4362A); }

  /* Stage: two quiet columns around the room. */
  .pds-page .pds-stage-grid { grid-template-columns:232px minmax(0, 1fr) 272px; gap:16px; }
  @media (max-width: 1280px) { .pds-page .pds-stage-grid { grid-template-columns:228px minmax(0, 1fr) 260px; } }
  @media (max-width: 1100px) { .pds-page .pds-stage-grid { grid-template-columns:220px minmax(0, 1fr); } }
  .pds-page .pds-rail, .pds-page .pds-inspector {
    top:calc(var(--pds-top, 72px) + 12px); max-height:calc(100dvh - var(--pds-top, 72px) - 24px); gap:12px; padding-right:2px;
  }
  .pds-page .pds-rail-card { background:var(--surface); border:1px solid var(--n-200); border-radius:16px; padding:16px; box-shadow:none; }
  .pds-page .pds-rail-title {
    margin:0 0 12px; font:600 13.5px/1.3 var(--sans, 'Inter Tight'), system-ui; letter-spacing:-0.01em;
    text-transform:none; color:var(--ink);
  }
  .pds-page .pds-rail-hint { font-size:12px; line-height:1.5; color:var(--n-600); }
  .pds-rail-sub { margin:14px 0 8px; font:500 11.5px/1.2 var(--sans, 'Inter Tight'), system-ui; color:var(--n-500); }
  .pds-rail-sub:first-of-type { margin-top:0; }
  .pds-rail-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
  .pds-rail-head .pds-rail-title { margin:0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pds-rail-head-tools { display:inline-flex; gap:4px; flex:none; }
  .pds-page .pds-zone-tools { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:4px; }
  .pds-page .pds-zone-tools .kb { height:34px; justify-content:center; font-size:12.5px; padding:0 8px; min-width:0; }
  .pds-link { display:inline-block; margin-top:14px; padding:0; border:0; background:none; cursor:pointer;
    font:500 12.5px/1.2 var(--sans, 'Inter Tight'), system-ui; color:var(--atlas); }
  .pds-link:hover { text-decoration:underline; text-underline-offset:3px; }
  .pds-link-danger { color:var(--danger, #B4362A); }
  .pds-page .pds-rail-warn { display:flex; flex-direction:column; gap:2px; margin:0; border-radius:14px; padding:12px 14px; }
  .pds-page .pds-rail-warn .pds-link { margin-top:6px; color:inherit; text-decoration:underline; text-underline-offset:3px; }
  .pds-fold > summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; margin:0; }
  .pds-fold > summary::-webkit-details-marker { display:none; }
  .pds-fold > summary::after { content:""; width:7px; height:7px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor;
    transform:rotate(45deg) translateY(-2px); opacity:0.5; transition:transform .2s; }
  .pds-fold[open] > summary { margin-bottom:12px; }
  .pds-fold[open] > summary::after { transform:rotate(-135deg) translateY(-2px); }
  .pds-page .pds-palette { gap:6px; }
  .pds-page .pds-palette-el { grid-template-columns:repeat(3, minmax(0, 1fr)); }
  .pds-page .pds-pal-item { border-radius:12px; border:1px solid var(--n-200); background:var(--paper-soft); padding:10px 4px 8px; transition:border-color .16s, background-color .16s; }
  .pds-page .pds-pal-item:hover { border-color:var(--atlas); background:var(--surface); transform:none; box-shadow:none; }
  .pds-page .pds-pal-label { font-size:11px; color:var(--n-600); }
  .pds-fold-sub { border-top:1px solid var(--n-200); padding-top:10px; margin-top:10px; }
  .pds-fold-sub:first-of-type { border-top:0; padding-top:0; margin-top:0; }
  .pds-fold-sub > summary.pds-rail-sub { margin:0; }
  .pds-fold-sub[open] > summary.pds-rail-sub { margin-bottom:10px; }
  .pds-fold-sub > summary em { margin-left:auto; margin-right:10px; font-style:normal; font-variant-numeric:tabular-nums; opacity:0.7; }
  .pds-noir.pds-noir.pds-noir .pds-fold-sub { border-color:rgba(255,255,255,0.08); }
  .pds-page .pds-live-sub { text-transform:none; letter-spacing:0; font-size:12px; font-weight:500; }
  .pds-page .pds-kbd-hint { margin:10px 0 0; text-align:left; white-space:normal; font-size:11.5px; line-height:1.5; color:var(--n-500); }

  /* Canvas: tools on one quiet line, the room as the subject, the legend
     under it like the landing's figure. */
  .pds-page .pds-canvas-wrap { gap:10px; }
  .pds-page .pds-canvas-bar { background:transparent; border:0; padding:0; border-radius:0; justify-content:space-between; }
  .pds-page .pds-bar-tools { gap:6px; }
  .pds-page .pds-tool { width:32px; height:32px; border-radius:9px; }
  .pds-page .pds-tool.pds-zoom-val { width:auto; }
  .pds-page .pds-heat { border-radius:10px; }
  .pds-page .pds-heat-opt { height:26px; padding:0 10px; font-size:12px; }
  .pds-page .pds-plan-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:2px 4px 0; }
  .pds-page .pds-plan-footer .pds-legend { gap:4px 6px; }
  .pds-plan-meta { display:inline-flex; align-items:center; gap:14px; }
  .pds-page .pds-plan-canvas { background:transparent !important; border:0; padding:0; box-shadow:none; }

  /* ── Night: the landing, applied to the whole page ── */
  .pds-noir.pds-noir.pds-noir.pds-host { background:transparent; }
  .pds-noir.pds-noir.pds-noir .pds-modes,
  .pds-noir.pds-noir.pds-noir .pds-zone-tabs,
  .pds-noir.pds-noir.pds-noir .pds-heat { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-mode, .pds-noir.pds-noir.pds-noir .pds-zone { color:rgba(255,255,255,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-mode:hover, .pds-noir.pds-noir.pds-noir .pds-zone:hover { color:rgba(255,255,255,0.85); }
  .pds-noir.pds-noir.pds-noir .pds-mode.active,
  .pds-noir.pds-noir.pds-noir .pds-zone.active { background:rgba(255,255,255,0.10); color:#F2EFE6; box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-zone em { color:rgba(255,255,255,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-act.kb.ghost,
  .pds-noir.pds-noir.pds-noir .pds-zone-tools .kb.ghost { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.12); color:rgba(255,255,255,0.85); }
  .pds-noir.pds-noir.pds-noir .pds-act.kb.ghost:hover,
  .pds-noir.pds-noir.pds-noir .pds-zone-tools .kb.ghost:hover { border-color:rgba(255,255,255,0.30); color:#fff; }
  .pds-noir.pds-noir.pds-noir .pds-more-pop { background:#0B0D0C; border-color:rgba(255,255,255,0.12); box-shadow:0 18px 40px -12px rgba(0,0,0,0.8); }
  .pds-noir.pds-noir.pds-noir .pds-more-pop button { color:rgba(255,255,255,0.85); }
  .pds-noir.pds-noir.pds-noir .pds-more-pop button:hover { background:rgba(255,255,255,0.06); }
  .pds-noir.pds-noir.pds-noir .pds-more-pop button.is-danger,
  .pds-noir.pds-noir.pds-noir .pds-more-pop button em { color:#F29A8C; }
  .pds-noir.pds-noir.pds-noir .pds-rail-card { background:rgba(255,255,255,0.025); border-color:rgba(255,255,255,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-rail-title { color:#F2EFE6; }
  .pds-noir.pds-noir.pds-noir .pds-rail-hint,
  .pds-noir.pds-noir.pds-noir .pds-kbd-hint { color:rgba(255,255,255,0.45); }
  .pds-noir.pds-noir.pds-noir .pds-rail-sub { color:rgba(255,255,255,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-link { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-link-danger { color:#F29A8C; }
  .pds-noir.pds-noir.pds-noir .pds-pal-item { background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-pal-item:hover { border-color:rgba(0,255,174,0.55); background:rgba(0,255,174,0.04); }
  .pds-noir.pds-noir.pds-noir .pds-pal-label { color:rgba(255,255,255,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-tool { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.10); color:rgba(255,255,255,0.70); }
  .pds-noir.pds-noir.pds-noir .pds-tool:hover { border-color:rgba(255,255,255,0.30); color:#fff; background:rgba(255,255,255,0.06); }
  .pds-noir.pds-noir.pds-noir .pds-canvas-bar { background:transparent; border:0; }
  .pds-noir.pds-noir.pds-noir .pds-plan-canvas { background:transparent; border:0; padding:0; }
  .pds-noir.pds-noir.pds-noir .pds-snap { color:rgba(255,255,255,0.60); }

  /* Legend = the landing's: 17 × 13 swatches, 11 px, white at 0.5. */
  .pds-noir.pds-noir.pds-noir .pds-sw-free     { border-color:rgba(255,255,255,0.19); background:rgba(255,255,255,0.012); border-style:solid; }
  .pds-noir.pds-noir.pds-noir .pds-sw-ordering { border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.035); border-style:solid; }
  .pds-noir.pds-noir.pds-noir .pds-sw-occupied { border-color:rgba(255,255,255,0.60); background:rgba(255,255,255,0.075); border-style:solid; }
  .pds-noir.pds-noir.pds-noir .pds-sw-bill     { border-color:#00FFAE; background:rgba(0,255,174,0.11); border-width:1.25px; border-style:solid; }
  .pds-noir.pds-noir.pds-noir .pds-sw-paid     { border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.02); border-style:dotted; }
  .pds-noir.pds-noir.pds-noir .pds-sw-reserved { border-color:rgba(255,255,255,0.45); background:rgba(255,255,255,0.03); border-style:dashed; }
  .pds-noir.pds-noir.pds-noir .pds-sw-out      { border-color:rgba(255,255,255,0.14); background:none; border-style:dashed; }
  .pds-noir.pds-noir.pds-noir .pds-pill-ordering { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.70); border:1px solid rgba(255,255,255,0.30); }
  .pds-noir.pds-noir.pds-noir .pds-pill-occupied { background:rgba(255,255,255,0.08); color:#F2EFE6; border:1px solid rgba(255,255,255,0.45); }
  .pds-noir.pds-noir.pds-noir .pds-pill-bill { background:rgba(0,255,174,0.10); color:#00FFAE; border:1px solid rgba(0,255,174,0.50); }
  .pds-noir.pds-noir.pds-noir .pds-pill-reserved { background:rgba(255,255,255,0.03); color:rgba(255,255,255,0.75); border:1px dashed rgba(255,255,255,0.45); }

  /* Chips on the room: the landing's « 6 min » pill; mint only for money
     waiting to be paid. */
  .pds-noir.pds-noir.pds-noir .pds-bill-chip { background:rgba(10,10,10,0.92); border-color:rgba(255,255,255,0.18); color:rgba(255,255,255,0.72); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="bill"] .pds-bill-chip { background:rgba(4,26,20,0.92); border-color:rgba(0,255,174,0.55); color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-since.is-check { border-color:rgba(255,255,255,0.35); color:rgba(255,255,255,0.85); background:rgba(10,10,10,0.92); }
  .pds-noir.pds-noir.pds-noir .pds-resv-chip { background:rgba(10,10,10,0.92); border-color:rgba(255,255,255,0.30); color:rgba(255,255,255,0.80); box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .d { color:rgba(0,255,174,0.70); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-sub { color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-row { background:rgba(0,255,174,0.06); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-row em { color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-check .pds-live-sub { color:rgba(255,255,255,0.75); }
  .pds-noir.pds-noir.pds-noir .pds-till-bill { border-color:rgba(0,255,174,0.45); background:rgba(0,255,174,0.05); }
  .pds-noir.pds-noir.pds-noir .pds-till-bill b { color:#00FFAE; }

  /* ── Day: the same scale in ink, atlas for the bill ── */
  .pds-page .pds-sw-free     { border-color:rgba(10,15,13,0.24); background:rgba(10,15,13,0.012); border-style:solid; }
  .pds-page .pds-sw-ordering { border-color:rgba(10,15,13,0.48); background:rgba(10,15,13,0.035); border-style:solid; }
  .pds-page .pds-sw-occupied { border-color:rgba(10,15,13,0.78); background:rgba(10,15,13,0.07); border-style:solid; }
  .pds-page .pds-sw-bill     { border-color:#0B6E4F; background:rgba(11,110,79,0.12); border-style:solid; }
  .pds-page .pds-sw-paid     { border-color:rgba(10,15,13,0.45); background:rgba(10,15,13,0.02); border-style:dotted; }
  .pds-page .pds-sw-reserved { border-color:rgba(10,15,13,0.55); background:rgba(10,15,13,0.03); border-style:dashed; }
  .pds-page .pds-sw-out      { border-color:rgba(10,15,13,0.16); background:none; border-style:dashed; }
  .pds-page .pds-tbl-cell[data-status="bill"] .pds-bill-chip { background:#0B6E4F; border-color:#0B6E4F; color:#F7F5F0; }
  .pds-page .pds-bill-chip { border-color:rgba(10,15,13,0.18); color:rgba(10,15,13,0.72); }
  .pds-page .pds-live-sec.is-urgent .pds-live-sub,
  .pds-page .pds-live-sec.is-urgent .pds-live-row em { color:var(--atlas); }
  .pds-page .pds-live-sec.is-urgent .pds-live-row { background:rgba(11,110,79,0.06); }
  .pds-page .pds-till-bill { border-color:rgba(11,110,79,0.40); background:rgba(11,110,79,0.05); }
  .pds-page .pds-till-bill b { color:var(--atlas); }
  .pds-page .pds-tbl-since.is-check { border-color:rgba(10,15,13,0.30); color:rgba(10,15,13,0.80); background:rgba(247,245,240,0.96); }
  .pds-page .pds-pill-ordering { background:rgba(10,15,13,0.05); color:var(--n-700); }
  .pds-page .pds-pill-bill { background:rgba(11,110,79,0.12); color:var(--atlas); }

  @media (max-width: 760px) {
    .pds-toolbar-gap { display:none; }
    .pds-page .pds-toolbar { gap:6px; }
  }
`;
return { PDS_STR, PDS_INLINE_CSS };
}, drawing: null };
