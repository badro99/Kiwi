/* Kiwi Facturation v2 · factures, devis et avoirs
 *
 * Sur un compte réel, les documents vivent sur le serveur (/api/invoices) :
 * numéros attribués à l'émission seulement, séries sans trou, totaux recalculés
 * côté serveur. Ce module ne fait que saisir, afficher et imprimer. Rien n'est
 * enregistré en local pour un document émis : une écriture qui échoue le dit.
 * Sur un commerce de démonstration, un petit moteur local rejoue le même contrat
 * (aucun appel réseau) pour que l'écran reste vivant.
 * Le module ne prétend jamais qu'un e-mail, un message WhatsApp ou un paiement
 * est parti : il prépare ces envois et laisse la confirmation au propriétaire. */
(() => {
  'use strict';
  let liveOpen;
  const openWhenReady = function (...args) { return ready.then(() => liveOpen.apply(this, args)); };
  window.Kiwi = window.Kiwi || {};
  window.Kiwi.handlers = window.Kiwi.handlers || {};
  window.Kiwi.handlers['invoicing'] = openWhenReady;
  window.KiwiInvoicing = {open: openWhenReady, list: () => [], version: '2.0.0'};
  const ready = Promise.all([
  import('./invoicing/transport.js?v=4'),
  import('./invoicing/composer.js?v=9'),
  import('./invoicing/history.js?v=9'),
  import('./invoicing/print.js?v=8'),
]).then(([transportModule, composerModule, historyModule, printModule]) => {
  // invoicing:entry-body

  // Bound transport and JSON reads, even when a transport ignores abort.
  /* Private transport declaration: fetchDeadline. */


  /* ── constantes métier ─────────────────────────────────────────────────── */
  const VAT_RATES = [20, 14, 10, 7, 0];          // 0 = exonéré
  const DEFAULT_VAT = 20;
  const TERMS_CHOICES = [0, 7, 15, 30, 60];
  const METHODS = ['cash', 'card', 'transfer', 'cheque', 'other'];
  const TYPES = ['invoice', 'quote', 'credit_note'];

  const ic = (name) => '<i data-icon="' + name + '" aria-hidden="true"></i>';
  const ICON = {
    invoice: ic('description'), plus: ic('add'), export: ic('download'), print: ic('print'),
    check: ic('check'), back: ic('chevron_left'), close: ic('close'), trash: ic('delete'),
    edit: ic('edit'), copy: ic('content_copy'), pay: ic('payments'), credit: ic('receipt_long'),
    convert: ic('sync_alt'), accept: ic('check_circle'), reject: ic('cancel'), send: ic('send'),
  };

  /* ── textes (FR, EN, AR) ───────────────────────────────────────────────── */
  const COPY = {
    fr: {
      label: 'Facturation', title: 'Facturation', sub: 'Factures, devis et avoirs, numérotés sans trou',
      overview: 'Vue d’ensemble', overviewSub: 'Suivi clair de ce qui est facturé, encaissé et à relancer.',
      newInvoice: 'Nouvelle facture', newQuote: 'Nouveau devis', export: 'Exporter', close: 'Fermer',
      tabInvoices: 'Factures', tabQuotes: 'Devis', tabCredits: 'Avoirs', sales: 'Factures de vente',
      salesSub: 'Factures officielles émises depuis les ventes du comptoir.',
      outstanding: 'À encaisser', overdue: 'En retard', paidMonth: 'Payé ce mois', documents: 'Documents',
      awaiting: 'factures en attente', needsFollowup: 'à relancer', collected: 'encaissé', totalDocs: 'documents',
      fAll: 'Toutes', fCollect: 'À encaisser', fOverdue: 'En retard', fPaid: 'Payées', fDraft: 'Brouillons',
      search: 'Rechercher client, ICE ou numéro…',
      colNo: 'N°', colCustomer: 'Client', colIssued: 'Émise le', colDue: 'Échéance', colValid: 'Valable jusqu’au', colStatus: 'Statut', colAmount: 'Montant TTC',
      docInvoice: 'Facture', docQuote: 'Devis', docCredit: 'Avoir', draftNo: 'Brouillon',
      stDraft: 'Brouillon', stIssued: 'Émise', stPartial: 'Partielle', stPaid: 'Payée', stOverdue: 'En retard', stCancelled: 'Annulée',
      stSent: 'Envoyé', stAccepted: 'Accepté', stRejected: 'Refusé', stInvoiced: 'Facturé', stExpired: 'Expiré', stCreditIssued: 'Émis',
      balanceLeft: 'Reste {amount}',
      emptyInvoice: 'Aucune facture ici', emptyInvoiceSub: 'Créez une facture avec lignes, TVA par taux, échéance et PDF A4. Le numéro n’est attribué qu’à l’émission.',
      emptyQuote: 'Aucun devis ici', emptyQuoteSub: 'Préparez un devis, envoyez-le, puis transformez-le en facture en un clic.',
      emptyCredit: 'Aucun avoir ici', emptyCreditSub: 'Un avoir corrige une facture émise. Ouvrez la facture, puis choisissez « Créer un avoir ».',
      emptyFilter: 'Aucun résultat pour ce filtre',
      loadMore: 'Afficher les documents plus anciens',
      loading: 'Chargement…', offline: 'Hors ligne · dernière liste enregistrée sur cet appareil',
      authError: 'Accès réservé au propriétaire du compte. Reconnectez-vous pour voir vos documents.',
      legacyBanner: '{n} factures enregistrées sur cet appareil', legacyOne: '1 facture enregistrée sur cet appareil',
      legacyHint: 'Importez-les sur votre compte : elles arrivent en brouillons à vérifier avant émission.', legacyImport: 'Importer',
      legacyDone: '{n} factures importées en brouillons',
      demoNote: 'Données de démonstration, enregistrées sur cet appareil seulement.',
      serverNote: 'Les numéros sont attribués par le serveur, sans trou ni doublon.',
      /* composer */
      editDraft: 'Modifier le brouillon', editQuote: 'Modifier le devis', newCredit: 'Avoir sur facture {n}',
      autosaveError: 'Brouillon non conservé : stockage plein ou bloqué. Réessayez en modifiant un champ ou en enregistrant le brouillon.', autosave: 'Brouillon conservé sur cet appareil pendant la saisie', restored: 'Saisie non enregistrée restaurée',
      customerBlock: 'Client', pickClient: 'Choisir dans le carnet clients', pickNone: 'Saisie libre',
      kind: 'Type de client', kindPerson: 'Particulier', kindBusiness: 'Entreprise',
      clientName: 'Nom ou raison sociale', address: 'Adresse', ice: 'ICE', iceRequired: 'ICE (obligatoire pour une entreprise)', iceOk: 'ICE valide',
      iceDigits: 'L’ICE ne contient que des chiffres.', iceLength: 'L’ICE doit comporter exactement 15 chiffres.', iceChecksum: 'Cet ICE ne passe pas le contrôle de ses deux derniers chiffres.',
      ifLabel: 'IF (identifiant fiscal)', email: 'E-mail', phone: 'Téléphone',
      datesBlock: 'Dates et paiement', issueDate: 'Date d’émission', terms: 'Conditions de paiement', due: 'Échéance',
      t0: 'À réception', t7: 'Sous 7 jours', t15: 'Sous 15 jours', t30: 'Sous 30 jours', t60: 'Sous 60 jours', tCustom: 'Date précise',
      validUntil: 'Valable jusqu’au', method: 'Mode de paiement',
      cash: 'Espèces', card: 'Carte', transfer: 'Virement', cheque: 'Chèque', other: 'Autre',
      lines: 'Lignes', desc: 'Désignation', descPh: 'Service ou produit', qty: 'Qté', unitHT: 'P.U. HT', discount: 'Remise %', vat: 'TVA', lineHT: 'Total HT',
      addLine: '+ Ajouter une ligne', removeLine: 'Supprimer la ligne', exempt: 'Exonéré',
      noteBlock: 'Note et mentions', note: 'Note au client', notePh: 'Merci pour votre confiance. Paiement à l’échéance indiquée.',
      exemptionMention: 'Mention d’exonération', exemptionPh: 'Ex. Exonération de TVA, article 91 du CGI',
      exemptionNeed: 'Une ligne est exonérée : indiquez la base légale de l’exonération.',
      totalHT: 'Total HT', vatOn: 'TVA {rate} % sur {base}', totalTTC: 'Total TTC', preview: 'Aperçu',
      previewNote: 'Aperçu seulement : les montants définitifs sont calculés à l’enregistrement.',
      saveDraft: 'Enregistrer le brouillon', save: 'Enregistrer', issueInvoice: 'Émettre la facture', issueCredit: 'Émettre l’avoir', sendQuote: 'Envoyer le devis',
      /* confirmations */
      confirm: 'Confirmer', cancel: 'Annuler',
      issueInvoiceTitle: 'Émettre cette facture ?', issueInvoiceBody: 'Le numéro définitif est attribué maintenant. Une fois émise, la facture ne peut plus être modifiée : toute correction passe par un avoir.',
      issueCreditTitle: 'Émettre cet avoir ?', issueCreditBody: 'Le numéro d’avoir est attribué maintenant. Un avoir émis ne peut plus être modifié.',
      issueQuoteTitle: 'Envoyer ce devis ?', issueQuoteBody: 'Le numéro de devis est attribué maintenant. Le devis reste modifiable jusqu’à sa facturation.',
      iceMissing: 'Attention : ce client n’a pas d’ICE, obligatoire pour une facture à une entreprise.',
      sellerIceNotice: 'Votre établissement n’a pas d’ICE : il manquera sur ce document, alors que c’est une mention obligatoire.',
      sellerIceMissing: 'ICE du vendeur manquant : ce document est numéroté sans l’ICE de votre établissement, mention obligatoire. Renseignez-le dans la fiche de l’établissement.',
      sellerIceSet: 'Renseigner l’ICE', issuedNoIce: 'Émis : {n}. ICE du vendeur manquant, mention obligatoire.', cur: 'MAD',
      deleteTitle: 'Supprimer ce brouillon ?', deleteBody: 'Le brouillon est supprimé définitivement. Aucun numéro n’avait été attribué.',
      convertTitle: 'Convertir en facture ?', convertBody: 'Un brouillon de facture est créé avec le client et les lignes du devis. Le devis passe à « Facturé ».',
      paymentTitle: 'Enregistrer un paiement', payAmount: 'Montant (MAD)', payDate: 'Date', payMethod: 'Mode', payRef: 'Référence', payRefPh: 'N° de chèque, de virement…', payRecord: 'Enregistrer le paiement',
      payInvalid: 'Saisissez un montant supérieur à zéro.', payFull: 'Solde',
      creditTitle: 'Créer un avoir', creditBody: 'Un brouillon d’avoir est préparé avec les lignes de la facture. Vous pourrez retirer des lignes pour un avoir partiel.', creditReason: 'Motif de l’avoir', creditReasonPh: 'Ex. Retour de marchandise, remise accordée…', creditReasonNeed: 'Indiquez le motif de l’avoir.',
      delPayTitle: 'Supprimer ce paiement ?', delPayBody: 'Le solde de la facture sera recalculé.',
      /* détail */
      back: 'Retour', detail: 'Actions', draftBadge: 'Brouillon sans valeur fiscale',
      from: 'Émis par', billTo: 'Facturé à', item: 'Désignation', message: 'Note', internalNote: 'Note interne', internalNotePh: 'Visible de vous seul, modifiable même après émission.', saveInternal: 'Enregistrer la note',
      issuedOn: 'Émise le', dueOn: 'Échéance', validOn: 'Valable jusqu’au', creditOn: 'Avoir sur facture {n}', creditOnDate: 'Avoir sur facture {n} du {date}', reason: 'Motif',
      paymentsTitle: 'Paiements', noPayments: 'Aucun paiement enregistré', paid: 'Déjà réglé', balance: 'Reste à payer', deletePayment: 'Supprimer ce paiement',
      creditNotesTitle: 'Avoirs sur cette facture', timeline: 'Historique', createdOn: 'Créé', sentOn: 'Marqué envoyé', legacyRef: 'Importée de l’ancienne saisie ({ref})',
      edit: 'Modifier', issueNow: 'Émettre', del: 'Supprimer le brouillon', printDraft: 'Imprimer le brouillon', print: 'Imprimer / PDF', recordPayment: 'Enregistrer un paiement',
      markSent: 'Marquer envoyée', createCredit: 'Créer un avoir', duplicate: 'Dupliquer', whatsapp: 'Préparer WhatsApp', email2: 'Préparer l’e-mail',
      accept: 'Accepter', reject: 'Refuser', convert: 'Convertir en facture', openOriginal: 'Voir la facture d’origine', view: 'Voir', lockedNote: 'Document émis : il ne peut plus être modifié. Une correction passe par un avoir.',
      /* retours */
      savedDraft: 'Brouillon enregistré', saved: 'Enregistré', issuedOk: 'Émis : {n}', paymentOk: 'Paiement enregistré', paymentDeleted: 'Paiement supprimé', creditCreated: 'Brouillon d’avoir créé',
      converted: 'Brouillon de facture créé depuis le devis', duplicated: 'Copie créée en brouillon', deleted: 'Brouillon supprimé', sentMarked: 'Marquée envoyée', quoteUpdated: 'Devis mis à jour',
      exported: 'Export CSV téléchargé', noteSaved: 'Note enregistrée', printBlocked: 'Autorisez les fenêtres contextuelles pour imprimer.', noContact: 'Ajoutez un e-mail ou un téléphone au client.',
      validation: 'Ajoutez un client et au moins une ligne valide.', errGeneric: 'Action impossible pour le moment. Rien n’a été enregistré.',
      errLoad: 'Factures indisponibles. Vérifiez la connexion puis rouvrez le registre.', errOffline: 'Hors ligne : rien n’a été enregistré. Réessayez avec une connexion.', errLocked: 'Ce document est émis : il ne peut plus être modifié.',
      errExempt: 'Indiquez la mention d’exonération avant d’émettre.', errExceeds: 'Le montant dépasse le reste à payer.', errCredit: 'L’avoir dépasse le montant restant à créditer sur la facture.',
      errAuth: 'Session expirée ou accès réservé au propriétaire du compte.', errIce: 'ICE invalide : corrigez-le avant d’enregistrer.', errNotIssued: 'Cette facture n’est pas encore émise.', errNotFound: 'Document introuvable.',
      errCustomer: 'Indiquez le nom du client.', errLines: 'Ajoutez au moins une ligne avec une quantité.',
    },
    en: {
      label: 'Invoicing', title: 'Invoicing', sub: 'Invoices, quotes and credit notes, numbered without gaps',
      overview: 'Overview', overviewSub: 'A clear view of billed, collected and overdue revenue.',
      newInvoice: 'New invoice', newQuote: 'New quote', export: 'Export', close: 'Close',
      tabInvoices: 'Invoices', tabQuotes: 'Quotes', tabCredits: 'Credit notes', sales: 'Sales Invoices',
      salesSub: 'Official invoices issued from store sales.',
      outstanding: 'Outstanding', overdue: 'Overdue', paidMonth: 'Paid this month', documents: 'Documents',
      awaiting: 'invoices awaiting payment', needsFollowup: 'to follow up', collected: 'collected', totalDocs: 'documents',
      fAll: 'All', fCollect: 'Outstanding', fOverdue: 'Overdue', fPaid: 'Paid', fDraft: 'Drafts',
      search: 'Search customer, ICE or number…',
      colNo: 'No.', colCustomer: 'Customer', colIssued: 'Issued', colDue: 'Due', colValid: 'Valid until', colStatus: 'Status', colAmount: 'Total incl. VAT',
      docInvoice: 'Invoice', docQuote: 'Quote', docCredit: 'Credit note', draftNo: 'Draft',
      stDraft: 'Draft', stIssued: 'Issued', stPartial: 'Part paid', stPaid: 'Paid', stOverdue: 'Overdue', stCancelled: 'Cancelled',
      stSent: 'Sent', stAccepted: 'Accepted', stRejected: 'Rejected', stInvoiced: 'Invoiced', stExpired: 'Expired', stCreditIssued: 'Issued',
      balanceLeft: '{amount} left',
      emptyInvoice: 'No invoices here', emptyInvoiceSub: 'Create an invoice with lines, VAT by rate, payment terms and A4 PDF. The number is only assigned when you issue it.',
      emptyQuote: 'No quotes here', emptyQuoteSub: 'Prepare a quote, send it, then turn it into an invoice in one click.',
      emptyCredit: 'No credit notes here', emptyCreditSub: 'A credit note corrects an issued invoice. Open the invoice, then choose “Create credit note”.',
      emptyFilter: 'No results for this filter',
      loadMore: 'Show older documents',
      loading: 'Loading…', offline: 'Offline · last list saved on this device',
      authError: 'Access is reserved to the account owner. Sign in again to see your documents.',
      legacyBanner: '{n} invoices saved on this device', legacyOne: '1 invoice saved on this device',
      legacyHint: 'Import them into your account: they arrive as drafts to check before issuing.', legacyImport: 'Import',
      legacyDone: '{n} invoices imported as drafts',
      demoNote: 'Demo data, saved on this device only.',
      serverNote: 'Numbers are assigned by the server, with no gaps or duplicates.',
      editDraft: 'Edit draft', editQuote: 'Edit quote', newCredit: 'Credit note on invoice {n}',
      autosaveError: 'Draft not kept: storage full or blocked. Retry by editing a field or saving the draft.', autosave: 'Draft kept on this device while you type', restored: 'Unsaved entry restored',
      customerBlock: 'Customer', pickClient: 'Pick from the customer book', pickNone: 'Free entry',
      kind: 'Customer type', kindPerson: 'Individual', kindBusiness: 'Business',
      clientName: 'Name or company name', address: 'Address', ice: 'ICE', iceRequired: 'ICE (required for a business)', iceOk: 'Valid ICE',
      iceDigits: 'The ICE contains digits only.', iceLength: 'The ICE must be exactly 15 digits.', iceChecksum: 'This ICE fails the check on its last two digits.',
      ifLabel: 'IF (tax ID)', email: 'Email', phone: 'Phone',
      datesBlock: 'Dates and payment', issueDate: 'Issue date', terms: 'Payment terms', due: 'Due date',
      t0: 'Due on receipt', t7: 'Net 7', t15: 'Net 15', t30: 'Net 30', t60: 'Net 60', tCustom: 'Specific date',
      validUntil: 'Valid until', method: 'Payment method',
      cash: 'Cash', card: 'Card', transfer: 'Bank transfer', cheque: 'Cheque', other: 'Other',
      lines: 'Lines', desc: 'Description', descPh: 'Service or product', qty: 'Qty', unitHT: 'Unit price excl. VAT', discount: 'Discount %', vat: 'VAT', lineHT: 'Total excl. VAT',
      addLine: '+ Add a line', removeLine: 'Remove line', exempt: 'Exempt',
      noteBlock: 'Note and mentions', note: 'Customer note', notePh: 'Thank you for your business. Payment is due by the date shown.',
      exemptionMention: 'Exemption mention', exemptionPh: 'E.g. VAT exemption, article 91 of the CGI',
      exemptionNeed: 'A line is VAT-exempt: state the legal basis for the exemption.',
      totalHT: 'Total excl. VAT', vatOn: 'VAT {rate}% on {base}', totalTTC: 'Total incl. VAT', preview: 'Preview',
      previewNote: 'Preview only: final amounts are computed when you save.',
      saveDraft: 'Save draft', save: 'Save', issueInvoice: 'Issue invoice', issueCredit: 'Issue credit note', sendQuote: 'Send quote',
      confirm: 'Confirm', cancel: 'Cancel',
      issueInvoiceTitle: 'Issue this invoice?', issueInvoiceBody: 'The final number is assigned now. Once issued, the invoice can no longer be modified: corrections go through a credit note.',
      issueCreditTitle: 'Issue this credit note?', issueCreditBody: 'The credit note number is assigned now. An issued credit note can no longer be modified.',
      issueQuoteTitle: 'Send this quote?', issueQuoteBody: 'The quote number is assigned now. The quote stays editable until it is invoiced.',
      iceMissing: 'Heads up: this customer has no ICE, which is required for an invoice to a business.',
      sellerIceNotice: 'Your business has no ICE: it will be missing from this document, although it is a mandatory mention.',
      sellerIceMissing: 'Seller ICE missing: this document was numbered without your business ICE, a mandatory mention. Set it in the business profile.',
      sellerIceSet: 'Set the ICE', issuedNoIce: 'Issued: {n}. Seller ICE missing, a mandatory mention.', cur: 'MAD',
      deleteTitle: 'Delete this draft?', deleteBody: 'The draft is deleted for good. No number had been assigned.',
      convertTitle: 'Convert to invoice?', convertBody: 'A draft invoice is created with the quote’s customer and lines. The quote becomes “Invoiced”.',
      paymentTitle: 'Record a payment', payAmount: 'Amount (MAD)', payDate: 'Date', payMethod: 'Method', payRef: 'Reference', payRefPh: 'Cheque or transfer number…', payRecord: 'Record payment',
      payInvalid: 'Enter an amount above zero.', payFull: 'Balance',
      creditTitle: 'Create a credit note', creditBody: 'A draft credit note is prepared with the invoice lines. You can remove lines for a partial credit.', creditReason: 'Reason for the credit note', creditReasonPh: 'E.g. returned goods, discount granted…', creditReasonNeed: 'State the reason for the credit note.',
      delPayTitle: 'Delete this payment?', delPayBody: 'The invoice balance will be recomputed.',
      back: 'Back', detail: 'Actions', draftBadge: 'Draft with no tax value',
      from: 'From', billTo: 'Bill to', item: 'Description', message: 'Note', internalNote: 'Internal note', internalNotePh: 'Only visible to you, editable even after issue.', saveInternal: 'Save note',
      issuedOn: 'Issued', dueOn: 'Due', validOn: 'Valid until', creditOn: 'Credit note on invoice {n}', creditOnDate: 'Credit note on invoice {n} dated {date}', reason: 'Reason',
      paymentsTitle: 'Payments', noPayments: 'No payment recorded', paid: 'Already paid', balance: 'Balance due', deletePayment: 'Delete this payment',
      creditNotesTitle: 'Credit notes on this invoice', timeline: 'Timeline', createdOn: 'Created', sentOn: 'Marked sent', legacyRef: 'Imported from the old entry ({ref})',
      edit: 'Edit', issueNow: 'Issue', del: 'Delete draft', printDraft: 'Print draft', print: 'Print / PDF', recordPayment: 'Record a payment',
      markSent: 'Mark as sent', createCredit: 'Create credit note', duplicate: 'Duplicate', whatsapp: 'Prepare WhatsApp', email2: 'Prepare email',
      accept: 'Accept', reject: 'Reject', convert: 'Convert to invoice', openOriginal: 'View original invoice', view: 'View', lockedNote: 'Issued document: it can no longer be modified. A correction goes through a credit note.',
      savedDraft: 'Draft saved', saved: 'Saved', issuedOk: 'Issued: {n}', paymentOk: 'Payment recorded', paymentDeleted: 'Payment deleted', creditCreated: 'Draft credit note created',
      converted: 'Draft invoice created from the quote', duplicated: 'Copy created as a draft', deleted: 'Draft deleted', sentMarked: 'Marked as sent', quoteUpdated: 'Quote updated',
      exported: 'CSV export downloaded', noteSaved: 'Note saved', printBlocked: 'Allow pop-ups to print.', noContact: 'Add an email or phone for this customer.',
      validation: 'Add a customer and at least one valid line.', errGeneric: 'Not possible right now. Nothing was saved.',
      errLoad: 'Invoices unavailable. Check your connection and reopen the register.', errOffline: 'Offline: nothing was saved. Try again with a connection.', errLocked: 'This document is issued: it can no longer be modified.',
      errExempt: 'State the exemption mention before issuing.', errExceeds: 'The amount exceeds the balance due.', errCredit: 'The credit note exceeds the amount still creditable on the invoice.',
      errAuth: 'Session expired, or access reserved to the account owner.', errIce: 'Invalid ICE: fix it before saving.', errNotIssued: 'This invoice is not issued yet.', errNotFound: 'Document not found.',
      errCustomer: 'Enter the customer name.', errLines: 'Add at least one line with a quantity.',
    },
    ar: {
      label: 'الفوترة', title: 'الفوترة', sub: 'فواتير وعروض أسعار وإشعارات دائنة بترقيم متسلسل',
      overview: 'نظرة عامة', overviewSub: 'متابعة واضحة للمبالغ المفوترة والمحصلة والمتأخرة.',
      newInvoice: 'فاتورة جديدة', newQuote: 'عرض سعر جديد', export: 'تصدير', close: 'إغلاق',
      tabInvoices: 'الفواتير', tabQuotes: 'عروض الأسعار', tabCredits: 'الإشعارات الدائنة', sales: 'فواتير المبيعات',
      salesSub: 'فواتير رسمية صادرة عن مبيعات المحل.',
      outstanding: 'قيد التحصيل', overdue: 'متأخرة', paidMonth: 'مدفوع هذا الشهر', documents: 'المستندات',
      awaiting: 'فواتير في الانتظار', needsFollowup: 'للمتابعة', collected: 'تم تحصيله', totalDocs: 'مستندات',
      fAll: 'الكل', fCollect: 'قيد التحصيل', fOverdue: 'متأخرة', fPaid: 'مدفوعة', fDraft: 'مسودات',
      search: 'ابحث عن عميل أو ICE أو رقم…',
      colNo: 'الرقم', colCustomer: 'العميل', colIssued: 'تاريخ الإصدار', colDue: 'الاستحقاق', colValid: 'صالح إلى غاية', colStatus: 'الحالة', colAmount: 'المبلغ مع الضريبة',
      docInvoice: 'فاتورة', docQuote: 'عرض سعر', docCredit: 'إشعار دائن', draftNo: 'مسودة',
      stDraft: 'مسودة', stIssued: 'صادرة', stPartial: 'مدفوعة جزئياً', stPaid: 'مدفوعة', stOverdue: 'متأخرة', stCancelled: 'ملغاة',
      stSent: 'مرسل', stAccepted: 'مقبول', stRejected: 'مرفوض', stInvoiced: 'مفوتر', stExpired: 'منتهي', stCreditIssued: 'صادر',
      balanceLeft: 'المتبقي {amount}',
      emptyInvoice: 'لا توجد فواتير هنا', emptyInvoiceSub: 'أنشئ فاتورة بالبنود والضريبة حسب النسبة وأجل الأداء ونسخة PDF. لا يُمنح الرقم إلا عند الإصدار.',
      emptyQuote: 'لا توجد عروض أسعار هنا', emptyQuoteSub: 'حضّر عرض سعر وأرسله ثم حوّله إلى فاتورة بنقرة واحدة.',
      emptyCredit: 'لا توجد إشعارات دائنة هنا', emptyCreditSub: 'يصحح الإشعار الدائن فاتورة صادرة. افتح الفاتورة ثم اختر «إنشاء إشعار دائن».',
      emptyFilter: 'لا نتائج لهذا المرشح',
      loadMore: 'عرض المستندات الأقدم',
      loading: 'جارٍ التحميل…', offline: 'دون اتصال · آخر قائمة محفوظة على هذا الجهاز',
      authError: 'الدخول محجوز لمالك الحساب. سجّل الدخول مجدداً لرؤية مستنداتك.',
      legacyBanner: '{n} فواتير محفوظة على هذا الجهاز', legacyOne: 'فاتورة واحدة محفوظة على هذا الجهاز',
      legacyHint: 'استوردها إلى حسابك: تصل كمسودات للمراجعة قبل الإصدار.', legacyImport: 'استيراد',
      legacyDone: 'تم استيراد {n} فواتير كمسودات',
      demoNote: 'بيانات تجريبية محفوظة على هذا الجهاز فقط.',
      serverNote: 'يمنح الخادم الأرقام دون ثغرات أو تكرار.',
      editDraft: 'تعديل المسودة', editQuote: 'تعديل عرض السعر', newCredit: 'إشعار دائن على الفاتورة {n}',
      autosaveError: 'لم تحفظ المسودة: التخزين ممتلئ أو محظور. أعد المحاولة بتعديل حقل أو حفظ المسودة.', autosave: 'تُحفظ المسودة على هذا الجهاز أثناء الكتابة', restored: 'تمت استعادة ما كُتب دون حفظ',
      customerBlock: 'العميل', pickClient: 'اختر من دفتر العملاء', pickNone: 'إدخال حر',
      kind: 'نوع العميل', kindPerson: 'فرد', kindBusiness: 'مقاولة',
      clientName: 'الاسم أو اسم المقاولة', address: 'العنوان', ice: 'ICE', iceRequired: 'ICE (إلزامي للمقاولة)', iceOk: 'ICE صحيح',
      iceDigits: 'يحتوي ICE على أرقام فقط.', iceLength: 'يجب أن يتكون ICE من 15 رقماً بالضبط.', iceChecksum: 'لا يجتاز ICE فحص رقميه الأخيرين.',
      ifLabel: 'IF (المعرف الجبائي)', email: 'البريد الإلكتروني', phone: 'الهاتف',
      datesBlock: 'التواريخ والأداء', issueDate: 'تاريخ الإصدار', terms: 'أجل الأداء', due: 'الاستحقاق',
      t0: 'عند الاستلام', t7: 'خلال 7 أيام', t15: 'خلال 15 يوماً', t30: 'خلال 30 يوماً', t60: 'خلال 60 يوماً', tCustom: 'تاريخ محدد',
      validUntil: 'صالح إلى غاية', method: 'طريقة الأداء',
      cash: 'نقداً', card: 'بطاقة', transfer: 'تحويل بنكي', cheque: 'شيك', other: 'أخرى',
      lines: 'البنود', desc: 'البيان', descPh: 'خدمة أو منتج', qty: 'الكمية', unitHT: 'السعر دون ضريبة', discount: 'التخفيض %', vat: 'الضريبة', lineHT: 'المجموع دون ضريبة',
      addLine: '+ إضافة بند', removeLine: 'حذف البند', exempt: 'معفى',
      noteBlock: 'ملاحظة وبيانات', note: 'ملاحظة للعميل', notePh: 'شكراً لثقتكم. يرجى الدفع قبل تاريخ الاستحقاق.',
      exemptionMention: 'بيان الإعفاء', exemptionPh: 'مثال: إعفاء من الضريبة، المادة 91 من المدونة العامة للضرائب',
      exemptionNeed: 'يوجد بند معفى من الضريبة: اذكر السند القانوني للإعفاء.',
      totalHT: 'المجموع دون ضريبة', vatOn: 'ضريبة {rate} % على {base}', totalTTC: 'المجموع مع الضريبة', preview: 'معاينة',
      previewNote: 'معاينة فقط: تُحتسب المبالغ النهائية عند الحفظ.',
      saveDraft: 'حفظ المسودة', save: 'حفظ', issueInvoice: 'إصدار الفاتورة', issueCredit: 'إصدار الإشعار الدائن', sendQuote: 'إرسال عرض السعر',
      confirm: 'تأكيد', cancel: 'إلغاء',
      issueInvoiceTitle: 'إصدار هذه الفاتورة؟', issueInvoiceBody: 'يُمنح الرقم النهائي الآن. بعد الإصدار لا يمكن تعديل الفاتورة: يتم التصحيح عبر إشعار دائن.',
      issueCreditTitle: 'إصدار هذا الإشعار الدائن؟', issueCreditBody: 'يُمنح رقم الإشعار الآن. لا يمكن تعديل إشعار دائن صادر.',
      issueQuoteTitle: 'إرسال عرض السعر هذا؟', issueQuoteBody: 'يُمنح رقم عرض السعر الآن. يبقى العرض قابلاً للتعديل إلى حين فوترته.',
      iceMissing: 'تنبيه: ليس لهذا العميل ICE، وهو إلزامي لفاتورة موجهة لمقاولة.',
      sellerIceNotice: 'ليس لمؤسستك ICE: سيغيب عن هذا المستند رغم أنه بيان إلزامي.',
      sellerIceMissing: 'ICE البائع مفقود: تم ترقيم هذا المستند دون ICE مؤسستك، وهو بيان إلزامي. أضفه في بطاقة المؤسسة.',
      sellerIceSet: 'إضافة ICE', issuedNoIce: 'تم الإصدار: {n}. ICE البائع مفقود، وهو بيان إلزامي.', cur: 'MAD',
      deleteTitle: 'حذف هذه المسودة؟', deleteBody: 'تُحذف المسودة نهائياً. لم يكن قد مُنح لها أي رقم.',
      convertTitle: 'التحويل إلى فاتورة؟', convertBody: 'تُنشأ مسودة فاتورة بعميل عرض السعر وبنوده. يصبح العرض «مفوتراً».',
      paymentTitle: 'تسجيل دفعة', payAmount: 'المبلغ (درهم)', payDate: 'التاريخ', payMethod: 'الطريقة', payRef: 'المرجع', payRefPh: 'رقم الشيك أو التحويل…', payRecord: 'تسجيل الدفعة',
      payInvalid: 'أدخل مبلغاً أكبر من الصفر.', payFull: 'الرصيد',
      creditTitle: 'إنشاء إشعار دائن', creditBody: 'تُحضَّر مسودة إشعار دائن ببنود الفاتورة. يمكنك حذف بنود للحصول على إشعار جزئي.', creditReason: 'سبب الإشعار الدائن', creditReasonPh: 'مثال: إرجاع بضاعة، تخفيض ممنوح…', creditReasonNeed: 'اذكر سبب الإشعار الدائن.',
      delPayTitle: 'حذف هذه الدفعة؟', delPayBody: 'سيُعاد احتساب رصيد الفاتورة.',
      back: 'رجوع', detail: 'الإجراءات', draftBadge: 'مسودة دون قيمة جبائية',
      from: 'صادرة عن', billTo: 'فاتورة إلى', item: 'البيان', message: 'ملاحظة', internalNote: 'ملاحظة داخلية', internalNotePh: 'لا يراها غيرك، قابلة للتعديل حتى بعد الإصدار.', saveInternal: 'حفظ الملاحظة',
      issuedOn: 'تاريخ الإصدار', dueOn: 'الاستحقاق', validOn: 'صالح إلى غاية', creditOn: 'إشعار دائن على الفاتورة {n}', creditOnDate: 'إشعار دائن على الفاتورة {n} بتاريخ {date}', reason: 'السبب',
      paymentsTitle: 'الدفعات', noPayments: 'لا توجد دفعات مسجلة', paid: 'المدفوع', balance: 'المتبقي للأداء', deletePayment: 'حذف هذه الدفعة',
      creditNotesTitle: 'إشعارات دائنة على هذه الفاتورة', timeline: 'السجل', createdOn: 'أنشئ', sentOn: 'حدد كمرسل', legacyRef: 'مستوردة من الإدخال القديم ({ref})',
      edit: 'تعديل', issueNow: 'إصدار', del: 'حذف المسودة', printDraft: 'طباعة المسودة', print: 'طباعة / PDF', recordPayment: 'تسجيل دفعة',
      markSent: 'تحديد كمرسلة', createCredit: 'إنشاء إشعار دائن', duplicate: 'نسخ', whatsapp: 'تحضير واتساب', email2: 'تحضير البريد',
      accept: 'قبول', reject: 'رفض', convert: 'تحويل إلى فاتورة', openOriginal: 'عرض الفاتورة الأصلية', view: 'عرض', lockedNote: 'مستند صادر: لا يمكن تعديله. يتم التصحيح عبر إشعار دائن.',
      savedDraft: 'تم حفظ المسودة', saved: 'تم الحفظ', issuedOk: 'تم الإصدار: {n}', paymentOk: 'تم تسجيل الدفعة', paymentDeleted: 'تم حذف الدفعة', creditCreated: 'تم إنشاء مسودة إشعار دائن',
      converted: 'تم إنشاء مسودة فاتورة من عرض السعر', duplicated: 'تم إنشاء نسخة كمسودة', deleted: 'تم حذف المسودة', sentMarked: 'حددت كمرسلة', quoteUpdated: 'تم تحديث عرض السعر',
      exported: 'تم تنزيل ملف CSV', noteSaved: 'تم حفظ الملاحظة', printBlocked: 'اسمح بالنوافذ المنبثقة للطباعة.', noContact: 'أضف بريداً أو هاتفاً للعميل.',
      validation: 'أضف عميلاً وبنداً صالحاً واحداً على الأقل.', errGeneric: 'تعذر تنفيذ العملية حالياً. لم يُحفظ شيء.',
      errLoad: 'الفواتير غير متاحة. تحقق من الاتصال ثم أعد فتح السجل.', errOffline: 'دون اتصال: لم يُحفظ شيء. أعد المحاولة عند توفر الاتصال.', errLocked: 'هذا المستند صادر: لا يمكن تعديله.',
      errExempt: 'اذكر بيان الإعفاء قبل الإصدار.', errExceeds: 'المبلغ يتجاوز المتبقي للأداء.', errCredit: 'يتجاوز الإشعار الدائن المبلغ المتبقي قابلاً للتصحيح في الفاتورة.',
      errAuth: 'انتهت الجلسة أو أن الدخول محجوز لمالك الحساب.', errIce: 'ICE غير صحيح: صححه قبل الحفظ.', errNotIssued: 'هذه الفاتورة لم تصدر بعد.', errNotFound: 'المستند غير موجود.',
      errCustomer: 'أدخل اسم العميل.', errLines: 'أضف بنداً واحداً على الأقل بكمية.',
    },
  };

  /* ── petits utilitaires ────────────────────────────────────────────────── */
  const lang = () => window.KiwiI18n?.getLang?.() || document.documentElement.lang || 'fr';
  const T = () => COPY[lang()] || COPY.fr;
  const tpl = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ''));
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = (v) => Math.max(0, Number(String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.')) || 0);
  const toCents = (v) => Math.round(num(v) * 100);
  const centsInput = (c) => (Math.round(Number(c) || 0) / 100).toFixed(2).replace('.', ',');
  /* « Aujourd'hui » est celui du magasin, pas celui de l'appareil : le serveur
     juge une date « dans le futur » dans le fuseau du magasin
     (functions/api/_business-day.js merchantZone : merchant_config.timezone,
     sinon Casablanca). Un patron à l'heure de Paris voyait entre minuit et
     2 h un règlement, une émission ou une échéance d'un jour d'avance. Même
     règle ici : le fuseau publié dans /api/config, sinon Casablanca. */
  const storeZone = () => {
    for (const z of [window.KiwiConfig?.timezone, window.KiwiConfig?.timeZone]) {
      const zone = String(z || '').trim();
      if (!zone) continue;
      try { new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', {timeZone: zone}).format(0); return zone; } catch (_) {}
    }
    return 'Africa/Casablanca';
  };
  const dayIn = (ts) => new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', {timeZone: storeZone(), year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(Number(ts) || Date.parse(ts) || Date.now()));
  const today = () => dayIn(Date.now());
  const shift = (days, from) => { const d = new Date((from || today()) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const locale = () => (lang() === 'ar' ? 'ar-MA' : lang() + '-MA');
  const fmtDate = (value) => value ? new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(locale(), {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value + 'T12:00:00')) : '·';
  const dmy = (value) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
  /* Amounts read « 2 000,00 » in French and Arabic (Moroccan business practice, Latin
   digits), « 2,000.00 » in English: fr-MA would print « 2.000,00 », a dot a
   customer can take for a decimal. */
  const money = (cents) => new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits: 2, minimumFractionDigits: 2}).format((Number(cents) || 0) / 100);
  const csvMoney = (cents) => ((Number(cents) || 0) / 100).toFixed(2).replace('.', ',');
  const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
  const parseJ = (v, d) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return d; } } return v == null ? d : v; };

  function venueId() {
    try { return String(window.KiwiVenue?.getVenue?.() || 'demo').slice(0, 64) || 'demo'; } catch (_) { return 'demo'; }
  }
  function ownData() {
    try { return !!window.KiwiEnv?.isReal?.() || !!window.KiwiVenue?.isCustom?.(); } catch (_) { return false; }
  }
  function merchantSlug() {
    try { return window.KiwiLive?.merchant?.() || window.KiwiVenue?.getVenue?.() || localStorage.getItem('kiwiLiveMerchant') || ''; } catch (_) { return ''; }
  }
  function businessName() {
    try { return window.KiwiMe?.business || window.KiwiVenue?.getCurrentVenueData?.()?.name || localStorage.getItem('kiwiBizName') || 'Kiwi Commerce'; } catch (_) { return 'Kiwi Commerce'; }
  }
  const lsGet = (k) => { try { const value = localStorage.getItem(k); if (value !== null) return value; const id = venueId(), legacy = id.replace(/[^a-z0-9_-]/gi, '').slice(0, 32); const previous = localStorage.getItem(k.replace(':' + id, ':' + legacy)); return id === legacy || !ownData() ? previous : null; } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (_) {} };

  /* ── ICE : mêmes règles que le serveur (15 chiffres, multiple de 97) ───── */
  function iceProblem(raw) {
    const n = String(raw == null ? '' : raw).replace(/[\s.\-]/g, '');
    if (!n) return null;
    if (!/^\d+$/.test(n)) return 'digits';
    if (n.length !== 15) return 'length';
    let r = 0;
    for (const d of n) r = (r * 10 + (d.charCodeAt(0) - 48)) % 97;
    return r === 0 ? null : 'checksum';
  }
  const iceCompact = (raw) => String(raw == null ? '' : raw).replace(/[\s.\-]/g, '');

  /* ── montants : calcul d'aperçu (le serveur reste l'autorité) ──────────── */
  function lineHT(l) {
    const disc = Math.min(100, Math.max(0, Number(l.discountPct) || 0));
    // Même arrondi entier que le serveur, y compris à la demi-centime.
    const numerator = BigInt(Math.round((Number(l.qty) || 0) * 1000)) * BigInt(Math.round(Number(l.unitHT) || 0)) * BigInt(10000 - Math.round(disc * 100));
    return Number((numerator * 2n + 10000000n) / 20000000n);
  }
  function computeTotals(lines) {
    const groups = new Map();
    (lines || []).forEach(l => {
      const rate = Number(l.vatRate) || 0;
      groups.set(rate, (groups.get(rate) || 0) + lineHT(l));
    });
    const byRate = [...groups].sort((a, b) => b[0] - a[0]).map(([rate, baseCents]) => ({rate, baseCents, vatCents: Math.round(baseCents * rate / 100)}));
    const htCents = byRate.reduce((s, r) => s + r.baseCents, 0);
    const vatCents = byRate.reduce((s, r) => s + r.vatCents, 0);
    return {htCents, vatCents, ttcCents: htCents + vatCents, byRate};
  }

  /* ── normalisation des réponses (camelCase ou snake_case) ──────────────── */
  function normRow(r) {
    const customer = parseJ(r.customer, {}) || {};
    const totals = parseJ(r.totals, {}) || {};
    return {
      id: r.id, type: r.type, status: r.status, displayStatus: r.displayStatus || pick(r, 'display_status') || r.status,
      number: r.number || '', issueDate: pick(r, 'issueDate', 'issue_date') || '', dueDate: pick(r, 'dueDate', 'due_date') || '',
      validUntil: pick(r, 'validUntil', 'valid_until') || '', customer: {name: customer.name || '', ice: customer.ice || ''},
      ttcCents: Number(totals.ttcCents ?? pick(r, 'ttcCents')) || 0, balanceCents: Number(pick(r, 'balanceCents', 'balance_cents')) || 0,
      originalNumber: pick(r, 'originalNumber', 'original_number') || '', legacyRef: pick(r, 'legacyRef', 'legacy_ref') || '',
    };
  }
  function normDoc(r) {
    if (!r) return null;
    return {
      id: r.id, type: r.type, status: r.status, number: r.number || '', seq: r.seq,
      issueDate: pick(r, 'issueDate', 'issue_date') || '', dueDate: pick(r, 'dueDate', 'due_date') || '',
      termsDays: pick(r, 'termsDays', 'terms_days'), validUntil: pick(r, 'validUntil', 'valid_until') || '',
      customer: parseJ(r.customer, {}) || {}, seller: parseJ(r.seller, null), lines: parseJ(r.lines, []) || [], totals: parseJ(r.totals, null),
      paymentMethod: pick(r, 'paymentMethod', 'payment_method') || '', note: r.note || '', internalNote: pick(r, 'internalNote', 'internal_note') || '',
      exemptionMention: pick(r, 'exemptionMention', 'exemption_mention') || '',
      originalId: pick(r, 'originalId', 'original_id') || '', originalNumber: pick(r, 'originalNumber', 'original_number') || '',
      sourceQuoteId: pick(r, 'sourceQuoteId', 'source_quote_id') || '', reason: r.reason || '',
      createdTs: pick(r, 'createdTs', 'created_ts'), issuedTs: pick(r, 'issuedTs', 'issued_ts'), sentTs: pick(r, 'sentTs', 'sent_ts'),
      legacyRef: pick(r, 'legacyRef', 'legacy_ref') || '',
    };
  }

  /* Le document que renvoie une écriture : le contrat dit `doc`; on tolère les noms voisins. */
  const docFrom = (res) => (res && (res.doc || res.draft || res.invoice || res.creditNote || res.credit_note)) || null;
  /* Les avertissements que le serveur joint à une écriture réussie (`warnings`) :
     l'écriture n'est pas refusée, mais l'écran ne doit jamais les taire. */
  const warned = (res, code) => !!(res && Array.isArray(res.warnings) && res.warnings.indexOf(code) >= 0);
  const sellerIceMissing = (res) => warned(res, 'seller-ice-missing');
  const sellerHasNoIce = () => !String((getSeller() || {}).ice || '').trim();
  const isQuoteDoc = (d) => !!d && d.type === 'quote';
  const isBusinessKind = (v) => v === 'business';
  /* Bandeau d'un document émis sans l'ICE du vendeur, avec le chemin vers la fiche. */
  function sellerIceBanner(doc, t) {
    const s = doc && doc.status !== 'draft' && doc.number ? doc.seller : null;
    if (!s || String(s.ice || '').trim()) return '';
    return `<div class="inv-banner warn" role="alert" data-inv-seller-ice><span>${esc(t.sellerIceMissing)}</span><button class="inv-btn small" type="button" data-inv-act="set-ice">${esc(t.sellerIceSet)}</button></div>`;
  }
  function openSellerIce() {
    const edit = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['account-edit-business'];
    if (typeof edit !== 'function') { toast(T().sellerIceMissing); return; }
    close();
    edit(null, 'primary');
  }

  /* ── erreurs d'API ─────────────────────────────────────────────────────── */
  /* Private transport declaration: apiError. */
  function errText(err) {
    const t = T(), code = String(err?.code || '');
    if (code === 'offline') return t.errOffline;
    if (code === 'unauthorized' || code === 'forbidden') return t.errAuth;
    if (code === 'locked') return t.errLocked;
    if (code === 'exempt-mention-required') return t.errExempt;
    if (code === 'amount-exceeds-balance') return t.errExceeds;
    if (code === 'credit-exceeds-invoice') return t.errCredit;
    if (code === 'not-issued') return t.errNotIssued;
    if (code === 'not-found') return t.errNotFound;
    if (code === 'invalid-ice' || /^invalid-.*ice/.test(code)) return t.errIce;
    if (code === 'invalid-customer') return t.errCustomer;
    if (code === 'invalid-lines') return t.errLines;
    return t.errGeneric;
  }

  const transport = transportModule.createTransport({TYPES, computeTotals, getSeller, iceProblem, lsGet, lsSet, merchantSlug, ownData, shift, today, venueId});

  /* ── transport : serveur pour un compte réel, moteur local en démo ─────── */
  function api(...args) { return transport.api(...args); }

  /* ── moteur local (démonstration) : le même contrat, sans réseau ───────── */
  /* Private transport declaration: demo. */

  /* ── état de l'écran ───────────────────────────────────────────────────── */
  let overlay = null;
  const cache = transport.rows();
  /* Curseur de la page suivante, par type (null : tout est chargé). Le serveur
     rend 500 documents par page ; les plus anciens restent accessibles par
     « Afficher les documents plus anciens ». */
  const nextCursor = transport.cursors();
  let loadingMore = false;
  let tab = 'invoice';          // invoice | quote | credit_note | sales
  let filter = 'all';
  let query = '';
  let offline = false, authBlocked = false, loadingList = false;
  let priorFocus = null;
  let refreshToken = 0, registerStats = null;
  let detail = null;            // {doc, payments, creditNotes, displayStatus, balanceCents, original}
  let cmp = null;               // {id, type, number, originalId, originalNumber, reason, status, key}
  let autosaveTimer = null;
  let sheetNode = null;
  let busy = false;
  let currentView = 'list';

  function toast(message) {
    document.querySelector('.inv-toast')?.remove();
    const node = document.createElement('div');
    node.className = 'inv-toast'; node.setAttribute('role', 'status'); node.textContent = message;
    document.body.appendChild(node); setTimeout(() => node.remove(), 2800);
  }

  /* ── cache de liste (dernier résultat connu) ──────────────────────────── */
  /* Private transport declaration: cacheKey. */
  function loadCache(...args) { return transport.loadCache(...args); }
  function saveCache(...args) { return transport.saveCache(...args); }

  /* ── clients du carnet ─────────────────────────────────────────────────── */
  function clientBook(...args) { return composerModule.clientBook({}, this, args); }

  /* ── factures de vente (comptoir) : inchangé ───────────────────────────── */
  function getSaleInvoices(...args) { return historyModule.getSaleInvoices({cache, dayIn, ownData, today}, this, args); }
  function syncServerInvoices() {
    const m = merchantSlug();
    if (!m || typeof fetch !== 'function') return;
    import('./request-deadline.mjs').catch(() => ({ deadlineFetch: (u, o) => fetch(u, o) })).then(net => net.deadlineFetch('/api/invoice?merchant=' + encodeURIComponent(m), { credentials: 'same-origin' }))
      .then(r => { if (!r.ok) throw new Error('invoice-load-failed'); return r.json(); })
      .then(data => {
        if (!data || !Array.isArray(data.invoices)) throw new Error('invoice-load-invalid');
        if (data && Array.isArray(data.invoices)) {
          if (merchantSlug() !== m) return;   // le commerce a changé pendant la réponse
          /* Le cache des factures est rangé sous la clé de CE commerce
             (`kiwi:sale_invoices:v1:<slug>`, voir cacheKey() dans invoice.js),
             celle que getCachedInvoices() relit. L'écrire sous la clé nue
             `kiwi:sale_invoices:v1` ne servait personne : les factures du
             serveur n'apparaissaient jamais dans le registre, et le cache de
             ce commerce partait, tel quel, dans une clé que personne ne lit. */
          const store = window.KiwiInvoice && window.KiwiInvoice.setCachedInvoice;
          if (typeof store === 'function') {
            data.invoices.forEach(inv => {
              if (inv && inv.saleId && inv.snapshot) {
                const doc = Object.assign({}, inv.snapshot, { number: inv.number, seq: inv.seq });
                if (inv.customer) doc.customer = inv.customer;
                store(inv.saleId, doc);
              }
            });
          }
          if (overlay && tab === 'sales' && currentView === 'list') paintRegister();
        }
      })
      .catch(() => { if (merchantSlug() === m) toast(T().errLoad); });
  }

  /* ── vendeur (identité légale) ─────────────────────────────────────────── */
  function getSeller() {
    return (window.KiwiInvoice && typeof window.KiwiInvoice.getSellerBusiness === 'function')
      ? window.KiwiInvoice.getSellerBusiness()
      : { name: businessName(), city: 'Maroc' };
  }
  function renderSellerLogo(seller, size = 42) {
    const biz = seller.name || businessName();
    const logo = seller.logo || '';
    if (logo) {
      return `<img src="${esc(logo)}" alt="${esc(biz)}" style="max-height:${size}px;max-width:140px;object-fit:contain;border-radius:4px;display:block;">`;
    }
    const initials = (String(biz).replace(/\s*·.*$/, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'K').toUpperCase();
    const s = Math.max(28, Math.round(size * 0.85));
    const f = Math.max(11, Math.round(size * 0.38));
    return `<span class="inv-preview-initials" style="display:inline-flex;align-items:center;justify-content:center;width:${s}px;height:${s}px;border-radius:8px;background:#f0fdf4;color:#087653;font-weight:700;font-size:${f}px;border:1.5px solid #bbf7d0;">${esc(initials)}</span>`;
  }

  /* ── libellés de documents et de statuts ──────────────────────────────── */
  const docWord = (type) => ({invoice: T().docInvoice, quote: T().docQuote, credit_note: T().docCredit}[type] || T().docInvoice);
  function statusLabel(type, ds) {
    const t = T();
    if (type === 'credit_note') return ds === 'draft' ? t.stDraft : t.stCreditIssued;
    if (type === 'quote') return ({draft: t.stDraft, sent: t.stSent, accepted: t.stAccepted, rejected: t.stRejected, invoiced: t.stInvoiced, expired: t.stExpired}[ds] || ds);
    return ({draft: t.stDraft, issued: t.stIssued, partial: t.stPartial, paid: t.stPaid, overdue: t.stOverdue, cancelled: t.stCancelled}[ds] || ds);
  }
  const statusClass = (ds) => ({draft: 'draft', issued: 'sent', sent: 'sent', partial: 'sent', paid: 'paid', accepted: 'paid', invoiced: 'paid', overdue: 'overdue', cancelled: 'draft', rejected: 'draft', expired: 'draft'}[ds] || 'draft');
  const statusHtml = (type, ds) => `<span class="inv-status ${statusClass(ds)}" data-ds="${esc(ds)}">${esc(statusLabel(type, ds))}</span>`;
  const NO_OF = (r) => r.number || T().draftNo;

  /* ── coque et navigation ──────────────────────────────────────────────── */
  function shell() {
    const t = T();
    overlay = document.createElement('div');
    overlay.className = 'inv-overlay';
    overlay.setAttribute('dir', lang() === 'ar' ? 'rtl' : 'ltr');
    overlay.innerHTML = `<section class="inv-shell" role="dialog" aria-modal="true" aria-labelledby="inv-title">
      <header class="inv-topbar">
        <div class="inv-brand"><span class="inv-mark">${ICON.invoice}</span><div><h2 class="inv-title" id="inv-title">${esc(t.title)}</h2><div class="inv-subtitle">${esc(t.sub)}</div></div></div>
        <div class="inv-top-actions"><button class="inv-close" type="button" data-inv-act="close" aria-label="${esc(t.close)}">${ICON.close}</button></div>
      </header><div class="inv-body"><div class="inv-view" data-inv-list></div><div class="inv-view" data-inv-compose hidden></div><div class="inv-view" data-inv-detail hidden></div></div>
    </section>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('input', onInput);
    overlay.addEventListener('change', onChange);
    overlay.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => overlay?.querySelector('[data-inv-act="close"]')?.focus());
  }
  function close() {
    if (!overlay) return;
    closeSheet(null);
    clearTimeout(autosaveTimer);
    overlay.remove(); overlay = null; document.body.style.overflow = '';
    priorFocus?.focus?.(); priorFocus = null; refreshToken++;
  }
  function show(name) {
    currentView = name;
    overlay.querySelectorAll('.inv-view').forEach(v => { v.hidden = !v.hasAttribute('data-inv-' + name); });
    overlay.querySelector('.inv-body').scrollTop = 0;
  }

  /* ── feuille modale (confirmation et petits formulaires) ──────────────── */
  function closeSheet(result) {
    if (!sheetNode) return;
    const node = sheetNode; sheetNode = null;
    const done = node.__done; node.remove();
    if (done) done(result);
  }
  function fieldHtml(f) {
    const id = 'inv-sf-' + f.key;
    let control;
    if (f.type === 'select') control = `<select id="${id}" data-sf="${f.key}">${f.options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(f.value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') control = `<textarea id="${id}" data-sf="${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
    else control = `<input id="${id}" data-sf="${f.key}" type="${f.type === 'date' ? 'date' : 'text'}"${f.type === 'money' ? ' inputmode="decimal"' : ''} value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
    return `<div class="inv-field${f.wide ? ' wide' : ''}"><label for="${id}">${esc(f.label)}</label>${control}</div>`;
  }
  /* submit(values) peut lever : l'erreur s'affiche dans la feuille, qui reste ouverte. */
  function openSheet({title, body, fields = [], confirm, danger, submit, notice}) {
    return new Promise((resolve) => {
      closeSheet(null);
      const t = T();
      const node = document.createElement('div');
      node.className = 'inv-sheet-back';
      node.innerHTML = `<div class="inv-sheet" role="dialog" aria-modal="true" aria-labelledby="inv-sheet-title">
        <h4 class="inv-sheet-title" id="inv-sheet-title">${esc(title)}</h4>
        ${body ? `<p class="inv-sheet-body">${esc(body)}</p>` : ''}
        ${notice ? `<p class="inv-sheet-warn" data-sheet-notice>${esc(notice)}</p>` : ''}
        ${fields.length ? `<div class="inv-fields inv-sheet-fields">${fields.map(fieldHtml).join('')}</div>` : ''}
        <p class="inv-sheet-err" data-sheet-err role="alert" hidden></p>
        <div class="inv-sheet-actions"><button class="inv-btn" type="button" data-sheet-cancel>${esc(t.cancel)}</button><button class="inv-btn ${danger ? 'danger' : 'primary'}" type="button" data-sheet-ok>${esc(confirm || t.confirm)}</button></div>
      </div>`;
      node.__done = resolve;
      const read = () => { const v = {}; node.querySelectorAll('[data-sf]').forEach(el => { v[el.dataset.sf] = el.value; }); return v; };
      const fail = (msg) => { const e = node.querySelector('[data-sheet-err]'); e.textContent = msg; e.hidden = !msg; };
      const ok = node.querySelector('[data-sheet-ok]');
      const go = async () => {
        if (ok.disabled) return;
        ok.disabled = true; fail('');
        try { const out = submit ? await submit(read()) : read(); if (sheetNode === node) closeSheet(out === undefined ? true : out); }
        catch (err) { if (sheetNode === node) { fail(err && err.__text ? err.message : errText(err)); ok.disabled = false; } }
      };
      node.addEventListener('click', (e) => {
        if (e.target === node || e.target.closest('[data-sheet-cancel]')) { e.stopPropagation(); closeSheet(null); return; }
        if (e.target.closest('[data-sheet-ok]')) { e.stopPropagation(); go(); }
      });
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); closeSheet(null); }
        else if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); go(); }
        else if (e.key === 'Tab') {
          const f = [...node.querySelectorAll('button:not([disabled]),input,select,textarea')];
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      });
      overlay.appendChild(node); sheetNode = node;
      requestAnimationFrame(() => (node.querySelector('[data-sf]') || ok).focus());
    });
  }
  const textError = (message) => { const e = new Error(message); e.__text = true; return e; };

  /* ── liste : synthèse, onglets, registre ──────────────────────────────── */
  function rowsFor(...args) { return historyModule.rowsFor({cache}, this, args); }
  function stats(...args) { return historyModule.stats({registerStats}, this, args); }
  function paintStats(...args) { return historyModule.paintStats({T, TYPES, esc, getSaleInvoices, money, overlay, rowsFor, stats}, this, args); }
  function legacyDocs(...args) { return historyModule.legacyDocs({lsGet, ownData, venueId}, this, args); }
  function paintNotices(...args) { return historyModule.paintNotices({T, authBlocked, esc, legacyDocs, offline, overlay, tpl}, this, args); }
  function tabsHtml(...args) { return historyModule.tabsHtml({T, esc, tab}, this, args); }
  function newLabel(...args) { return historyModule.newLabel({T, tab}, this, args); }

  function visibleRows(...args) { return historyModule.visibleRows({filter, getSaleInvoices, query, rowsFor, tab}, this, args); }
  function paintRegister(...args) { return historyModule.paintRegister({ICON, NO_OF, T, esc, filter, fmtDate, loadingList, loadingMore, money, newLabel, nextCursor, overlay, rowsFor, statusHtml, tab, tpl, visibleRows}, this, args); }
  async function loadMore() {
    const ty = tab, cursor = nextCursor[ty];
    if (!cursor || loadingMore) return;
    const token = refreshToken;
    loadingMore = true; paintRegister();
    try {
      const res = await api('GET', {type: ty, cursor});
      if (token !== refreshToken || !overlay) return;
      const key = r => ty === 'sales' ? r.saleId : r.id;
      const known = new Set(cache[ty].map(key));
      cache[ty] = cache[ty].concat((ty === 'sales' ? res.invoices.map(r => Object.assign({}, r.snapshot, {saleId:r.saleId})) : (res.docs || []).map(normRow)).filter(r => !known.has(key(r))));
      nextCursor[ty] = res.nextCursor || null;
    } catch (err) {
      if (token === refreshToken) toast(errText(err));
    } finally {
      loadingMore = false;
      if (token === refreshToken) paintAll();
    }
  }
  function paintAll(...args) { return historyModule.paintAll({currentView, overlay, paintNotices, paintRegister, paintStats}, this, args); }

  function renderList(...args) { return historyModule.renderList({ICON, T, esc, newLabel, overlay, ownData, paintAll, query, show, tabsHtml}, this, args); }

  async function refreshAll() {
    const token = ++refreshToken;
    loadingList = true; if (currentView === 'list') paintRegister();
    registerStats = null;
    const types = ownData() ? [...TYPES, 'sales'] : TYPES;
    const results = await Promise.allSettled([...types.map(ty => api('GET', {type: ty})), api('GET', {summary:1})]);
    if (token !== refreshToken || !overlay) return;
    let failed = 0; authBlocked = false;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { if (i === types.length) registerStats = r.value.summary; else { cache[types[i]] = types[i] === 'sales' ? r.value.invoices.map(r => Object.assign({}, r.snapshot, {saleId:r.saleId})) : (r.value.docs || []).map(normRow); nextCursor[types[i]] = r.value.nextCursor || null; } }
      else { failed++; if (r.reason && (r.reason.code === 'unauthorized' || r.reason.code === 'forbidden')) authBlocked = true; }
    });
    offline = failed > 0 && !authBlocked;
    if (!failed) saveCache();
    loadingList = false; paintAll();
  }

  /* ── composer ─────────────────────────────────────────────────────────── */
  function vatOptions(...args) { return composerModule.vatOptions({T, VAT_RATES, esc}, this, args); }
  function lineRowHtml(...args) { return composerModule.lineRowHtml({ICON, T, close, esc, vatOptions}, this, args); }
  function blankLine(...args) { return composerModule.blankLine({DEFAULT_VAT}, this, args); }
  function F(...args) { return composerModule.F({overlay}, this, args); }
  function fv(...args) { return composerModule.fv({F}, this, args); }
  function readLines(...args) { return composerModule.readLines({overlay}, this, args); }
  function apiLines(...args) { return composerModule.apiLines({num, toCents}, this, args); }
  function paintLines(...args) { return composerModule.paintLines({lineRowHtml, overlay}, this, args); }
  function termsOptions(...args) { return composerModule.termsOptions({T, TERMS_CHOICES, esc}, this, args); }

  /* Un document existant (ou un nouveau) devient les valeurs initiales du formulaire. */
  function formState(...args) { return composerModule.formState({TERMS_CHOICES, blankLine, centsInput, shift, today}, this, args); }
  function draftKey(...args) { return composerModule.draftKey({cmp, venueId}, this, args); }

  function renderComposer(doc, type) {
    const t = T();
    const d = doc ? normDoc(doc) : null;
    type = d ? d.type : (type || 'invoice');
    cmp = {id: d ? d.id : '', type, number: d ? d.number : '', status: d ? d.status : 'draft', originalId: d ? d.originalId : '', originalNumber: d ? d.originalNumber : '', reason: d ? d.reason : ''};
    let st = formState(d, type), restored = false;
    try {
      const saved = JSON.parse(lsGet(draftKey()) || 'null');
      if (saved && saved.state) { st = Object.assign(st, saved.state); restored = true; }
    } catch (_) {}
    const book = clientBook();
    const locked = type === 'credit_note';
    const isQuote = type === 'quote';
    const title = cmp.id ? (type === 'quote' ? t.editQuote : type === 'credit_note' ? tpl(t.newCredit, {n: cmp.originalNumber || '…'}) : t.editDraft) : (type === 'quote' ? t.newQuote : t.newInvoice);
    const seller = getSeller();
    const issueLabel = type === 'quote' ? t.sendQuote : type === 'credit_note' ? t.issueCredit : t.issueInvoice;
    const showIssue = !(isQuote && cmp.number);
    const dis = locked ? ' disabled' : '';
    composerModule.renderComposerForm({overlay, cmp, st, locked, isQuote, title, book, t, dis, showIssue, issueLabel, termsOptions, METHODS, renderSellerLogo, esc, ICON, seller});
    paintLines(st.lines);
    if (restored) toast(t.restored);
    show('compose'); updateComposer(); checkIce();
    requestAnimationFrame(() => (locked ? overlay.querySelector('.inv-line-row input') : F('name'))?.focus());
  }

  function composerPayload(...args) { return composerModule.composerPayload({apiLines, cmp, fv, iceCompact, readLines, shift, today}, this, args); }
  function formSnapshot(...args) { return composerModule.formSnapshot({cmp, fv, readLines}, this, args); }
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { if (overlay && cmp && currentView === 'compose') { const kept = lsSet(draftKey(), JSON.stringify({savedAt: Date.now(), state: formSnapshot()})); const note = overlay.querySelector('[data-inv-autosave]'); if (note) { note.textContent = kept ? T().autosave : T().autosaveError; note.setAttribute('role', kept ? 'status' : 'alert'); } } }, 500);
  }
  function checkIce(...args) { return composerModule.checkIce({F, T, iceCompact, iceProblem, overlay}, this, args); }
  function updateComposer(...args) { return composerModule.updateComposer({F, T, apiLines, computeTotals, currentView, esc, fv, lineHT, money, num, overlay, readLines, shift, toCents, today, tpl}, this, args); }

  function validateComposer(...args) { return composerModule.validateComposer({F, T, checkIce, composerPayload, toast}, this, args); }
  function setBusy(on) {
    busy = on;
    overlay?.querySelectorAll('[data-inv-act="save-draft"],[data-inv-act="issue-composer"]').forEach(b => { b.disabled = on; b.setAttribute('aria-busy', String(on)); });
  }
  async function saveComposer(thenIssue) {
    if (busy) return;
    const t = T(), p = validateComposer(thenIssue); if (!p) return;
    if (thenIssue) {
      const kindBody = cmp.type === 'quote' ? [t.issueQuoteTitle, t.issueQuoteBody] : cmp.type === 'credit_note' ? [t.issueCreditTitle, t.issueCreditBody] : [t.issueInvoiceTitle, t.issueInvoiceBody];
      const warn = [fv('kind') === 'business' && !p.customer.ice && cmp.type !== 'quote' ? t.iceMissing : '', sellerHasNoIce() ? t.sellerIceNotice : ''].filter(Boolean).join(' ');
      const yes = await openSheet({title: kindBody[0], body: kindBody[1], notice: warn, confirm: cmp.type === 'quote' ? t.sendQuote : cmp.type === 'credit_note' ? t.issueCredit : t.issueInvoice});
      if (!yes) return;
    }
    const staleKey = draftKey();
    clearTimeout(autosaveTimer);
    setBusy(true);
    try {
      /* Un document émis ne se réécrit pas : seul un devis reste modifiable. */
      let doc, issuedRes = null;
      if (!(cmp.id && cmp.status !== 'draft' && cmp.type !== 'quote')) {
        const res = await api('POST', Object.assign({action: 'save'}, p));
        doc = normDoc(docFrom(res)); cmp.id = doc.id; cmp.status = doc.status;
      }
      if (thenIssue) {
        const res = await api('POST', {action: 'issue', id: cmp.id});
        issuedRes = res;
        doc = normDoc(docFrom(res) || doc);
      }
      clearTimeout(autosaveTimer); lsDel(staleKey); lsDel(draftKey());
      cmp.id = doc.id;
      toast(thenIssue ? tpl(sellerIceMissing(issuedRes) ? t.issuedNoIce : t.issuedOk, {n: doc.number}) : (isQuoteDoc(cmp) && doc.number ? t.quoteUpdated : t.savedDraft));
      refreshAll();
      await openDetail(doc.id);
    } catch (err) { toast(errText(err)); }
    finally { setBusy(false); }
  }

  /* ── détail d'un document ─────────────────────────────────────────────── */
  async function openDetail(id) {
    const t = T();
    const box = overlay.querySelector('[data-inv-detail]');
    box.innerHTML = `<div class="inv-composer-head"><button class="inv-btn small" type="button" data-inv-act="back">${ICON.back}${esc(t.back)}</button></div><div class="inv-empty"><p>${esc(t.loading)}</p></div>`;
    show('detail');
    try {
      const res = await api('GET', {id});
      const d = {doc: normDoc(res.doc || docFrom(res)), payments: res.payments || [], creditNotes: res.creditNotes || [], displayStatus: res.displayStatus || res.doc?.status, balanceCents: Number(res.balanceCents) || 0, original: null};
      if (d.doc.type === 'credit_note' && d.doc.originalId) {
        try { const o = await api('GET', {id: d.doc.originalId}); d.original = normDoc(o.doc); if (!d.doc.originalNumber) d.doc.originalNumber = d.original.number; } catch (_) {}
      }
      if (!overlay) return;
      detail = d; renderDetail();
    } catch (err) { toast(errText(err)); if (overlay) { renderList(); refreshAll(); } }
  }

  function sellerOf(doc) { return doc.seller && doc.status !== 'draft' ? doc.seller : getSeller(); }
  function sellerLines(seller) {
    const biz = seller.name || businessName();
    const address = [seller.address, seller.city].filter(Boolean).map(esc).join(', ');
    return [
      `<strong>${esc(seller.legalName || biz)}</strong>`,
      address,
      seller.phone ? `Tél : ${esc(seller.phone)}` : '',
      seller.email ? esc(seller.email) : '',
      seller.ice ? `<b>ICE :</b> ${esc(seller.ice)}` : '',
      (seller.if || seller.fiscal) ? `<b>IF :</b> ${esc(seller.if || seller.fiscal)}` : '',
      seller.rc ? `<b>RC :</b> ${esc(seller.rc)}` : '',
      seller.patente ? `<b>Patente :</b> ${esc(seller.patente)}` : '',
    ].filter(Boolean).join('<br>');
  }
  function customerLines(c) {
    return [
      `<strong>${esc(c.name || '')}</strong>`, c.address ? esc(c.address) : '',
      c.ice ? `<b>ICE :</b> ${esc(c.ice)}` : '', c.if ? `<b>IF :</b> ${esc(c.if)}` : '',
      c.email ? esc(c.email) : '', c.phone ? esc(c.phone) : '',
    ].filter(Boolean).join('<br>');
  }
  function totalsBlock(doc) {
    const t = T(), tot = doc.totals && doc.totals.byRate ? doc.totals : computeTotals(doc.lines);
    return `<div class="inv-summary-row"><span>${esc(t.totalHT)}</span><strong>${money(tot.htCents)} MAD</strong></div>${tot.byRate.map(r => `<div class="inv-summary-row" data-rate="${r.rate}"><span>${esc(tpl(t.vatOn, {rate: r.rate, base: money(r.baseCents)}))}</span><strong>${money(r.vatCents)} MAD</strong></div>`).join('')}<div class="inv-summary-row total"><span>${esc(t.totalTTC)}</span><strong>${money(tot.ttcCents)} MAD</strong></div>`;
  }

  function renderDetail() {
    const t = T(), d = detail, doc = d.doc, type = doc.type, draft = doc.status === 'draft';
    const ds = d.displayStatus, seller = sellerOf(doc);
    const biz = seller.name || businessName();
    const issued = !draft;
    const canEditQuote = type === 'quote' && doc.status !== 'invoiced';
    const act = (name, label, icon, cls) => `<button class="inv-btn${cls ? ' ' + cls : ''}" type="button" data-inv-act="${name}">${icon || ''}${esc(label)}</button>`;
    const out = [];
    if (type === 'invoice') {
      if (draft) out.push(act('edit', t.edit, ICON.edit), act('issue-detail', t.issueNow, ICON.check, 'primary'), act('print', t.printDraft, ICON.print), act('duplicate', t.duplicate, ICON.copy), act('delete', t.del, ICON.trash, 'danger'));
      else {
        if (d.balanceCents > 0 && ds !== 'cancelled') out.push(act('pay', t.recordPayment, ICON.pay, 'primary'));
        out.push(act('print', t.print, ICON.print, d.balanceCents > 0 && ds !== 'cancelled' ? '' : 'primary'));
        if (ds !== 'cancelled') out.push(act('credit', t.createCredit, ICON.credit));
        if (!doc.sentTs) out.push(act('mark-sent', t.markSent, ICON.send));
        if (d.balanceCents > 0) out.push(act('whatsapp', t.whatsapp), act('email', t.email2));
        out.push(act('duplicate', t.duplicate, ICON.copy));
      }
    } else if (type === 'credit_note') {
      if (draft) out.push(act('edit', t.edit, ICON.edit), act('issue-detail', t.issueNow, ICON.check, 'primary'), act('print', t.printDraft, ICON.print), act('delete', t.del, ICON.trash, 'danger'));
      else { out.push(act('print', t.print, ICON.print, 'primary')); if (!doc.sentTs) out.push(act('mark-sent', t.markSent, ICON.send)); out.push(act('whatsapp', t.whatsapp), act('email', t.email2)); if (doc.originalId) out.push(act('open-original', t.openOriginal)); }
    } else {
      if (draft) out.push(act('edit', t.edit, ICON.edit), act('issue-detail', t.sendQuote, ICON.check, 'primary'), act('print', t.printDraft, ICON.print), act('duplicate', t.duplicate, ICON.copy), act('delete', t.del, ICON.trash, 'danger'));
      else {
        if (doc.status === 'sent' || doc.status === 'accepted' || ds === 'expired') out.push(act('convert', t.convert, ICON.convert, 'primary'));
        if (doc.status === 'sent' || ds === 'expired') out.push(act('accept', t.accept, ICON.accept), act('reject', t.reject, ICON.reject));
        if (doc.status === 'accepted') out.push(act('reject', t.reject, ICON.reject));
        out.push(act('print', t.print, ICON.print));
        if (canEditQuote) out.push(act('edit', t.edit, ICON.edit));
        out.push(act('whatsapp', t.whatsapp), act('email', t.email2), act('duplicate', t.duplicate, ICON.copy));
      }
    }
    const itemsHtml = doc.lines.map(l => `<tr><td>${esc(l.description)}</td><td>${esc(String(l.qty).replace('.', ','))}</td><td>${money(l.unitHT)}</td><td>${Number(l.discountPct) ? esc(String(l.discountPct).replace('.', ',')) + ' %' : '·'}</td><td>${Number(l.vatRate)} %</td><td>${money(lineHT(l))}</td></tr>`).join('');
    const origDate = d.original ? d.original.issueDate : '';
    const creditRef = type === 'credit_note' ? `<div class="inv-credit-ref" data-credit-ref>${esc(origDate ? tpl(t.creditOnDate, {n: doc.originalNumber || '…', date: dmy(origDate)}) : tpl(t.creditOn, {n: doc.originalNumber || '…'}))}${doc.reason ? `<br>${esc(t.reason)} : ${esc(doc.reason)}` : ''}</div>` : '';
    const dateMeta = type === 'quote'
      ? `${esc(t.issuedOn)} · ${esc(fmtDate(doc.issueDate))}<br>${esc(t.validOn)} · ${esc(fmtDate(doc.validUntil))}`
      : type === 'credit_note' ? `${esc(t.issuedOn)} · ${esc(fmtDate(doc.issueDate))}` : `${esc(t.issuedOn)} · ${esc(fmtDate(doc.issueDate))}<br>${esc(t.dueOn)} · ${esc(fmtDate(doc.dueDate))}`;
    const paymentsHtml = type === 'invoice' && issued ? `<section class="inv-detail-card" data-payments><h4 class="inv-section-title">${esc(t.paymentsTitle)}</h4>${d.payments.length ? `<ul class="inv-pay-list">${d.payments.map(p => `<li><div><strong>${money(pick(p, 'amountCents', 'amount_cents'))} MAD</strong><span>${esc(fmtDate(p.date))} · ${esc(t[p.method] || p.method || '')}${p.reference ? ' · ' + esc(p.reference) : ''}</span></div><button data-activation=write class="inv-line-remove" type="button" data-inv-act="delete-payment" data-pid="${esc(p.id)}" aria-label="${esc(t.deletePayment)}">${ICON.trash}</button></li>`).join('')}</ul>` : `<p class="inv-foot-note">${esc(t.noPayments)}</p>`}<div class="inv-summary-row"><span>${esc(t.balance)}</span><strong data-balance>${money(d.balanceCents)} MAD</strong></div></section>` : '';
    const creditsHtml = type === 'invoice' && d.creditNotes.length ? `<section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.creditNotesTitle)}</h4><ul class="inv-pay-list">${d.creditNotes.map(c => `<li><div><strong>${esc(c.number)}</strong><span>${esc(fmtDate(c.issueDate))} · ${money(pick(c, 'ttcCents', 'ttc_cents'))} MAD</span></div><button class="inv-btn small" type="button" data-inv-act="open-doc" data-id="${esc(c.id)}">${esc(t.view)}</button></li>`).join('')}</ul></section>` : '';
    const paidBlock = type === 'invoice' && issued ? `<div class="inv-summary-row"><span>${esc(t.paid)}</span><strong>${money(Math.max(0, (doc.totals?.ttcCents || 0) - d.balanceCents))} MAD</strong></div><div class="inv-summary-row"><span>${esc(t.balance)}</span><strong>${money(d.balanceCents)} MAD</strong></div>` : '';
    const timeline = `${doc.createdTs ? `<div class="inv-time"><strong>${esc(t.createdOn)}</strong>${esc(fmtDate(dayIn(doc.createdTs)))}</div>` : ''}${doc.sentTs ? `<div class="inv-time"><strong>${esc(t.sentOn)}</strong>${esc(fmtDate(dayIn(doc.sentTs)))}</div>` : ''}${doc.legacyRef ? `<div class="inv-time"><strong>${esc(tpl(t.legacyRef, {ref: doc.legacyRef}))}</strong></div>` : ''}`;
    overlay.querySelector('[data-inv-detail]').innerHTML = `<div class="inv-composer-head"><button class="inv-btn small" type="button" data-inv-act="back">${ICON.back}${esc(t.back)}</button><div>${statusHtml(type, ds)}</div></div>
      ${sellerIceBanner(doc, t)}
      <div class="inv-detail-grid"><article class="inv-preview${draft ? ' is-draft' : ''}" data-doc-type="${esc(type)}" data-doc-id="${esc(doc.id)}">${draft ? `<div class="inv-watermark" aria-hidden="true">${esc(t.draftNo.toUpperCase())}</div>` : ''}
        <div class="inv-preview-top"><div><div class="inv-preview-logo">${renderSellerLogo(seller, 40)}</div><div class="inv-preview-meta"><strong>${esc(biz)}</strong></div></div><div class="inv-preview-head"><h3 class="inv-preview-title" data-doc-number>${esc(docWord(type))} ${esc(draft ? t.draftNo : doc.number)}</h3><div class="inv-preview-meta">${dateMeta}</div></div></div>
        ${creditRef}
        <div class="inv-preview-parties"><div><div class="inv-preview-label">${esc(t.from)}</div><div class="inv-preview-party">${sellerLines(seller)}</div></div><div><div class="inv-preview-label">${esc(t.billTo)}</div><div class="inv-preview-party">${customerLines(doc.customer)}</div></div></div>
        <div class="inv-table-wrap" tabindex="0" role="region" aria-label="${esc(docWord(type))}"><table class="inv-preview-table"><thead><tr><th>${esc(t.item)}</th><th>${esc(t.qty)}</th><th>${esc(t.unitHT)}</th><th>${esc(t.discount)}</th><th>${esc(t.vat)}</th><th>${esc(t.lineHT)}</th></tr></thead><tbody>${itemsHtml}</tbody></table></div>
        <div class="inv-preview-totals">${totalsBlock(doc)}${paidBlock}</div>
        ${doc.exemptionMention ? `<div class="inv-preview-note"><strong>${esc(t.exemptionMention)}</strong><br>${esc(doc.exemptionMention)}</div>` : ''}
        ${doc.note ? `<div class="inv-preview-note"><strong>${esc(t.message)}</strong><br>${esc(doc.note)}</div>` : ''}
        ${draft ? `<div class="inv-preview-note">${esc(t.draftBadge)}</div>` : ''}
      </article><aside class="inv-detail-side"><section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.detail)}</h4><div class="inv-detail-actions">${out.join('')}</div></section>${paymentsHtml}${creditsHtml}
        ${issued ? `<section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.internalNote)}</h4><div class="inv-field"><textarea data-f="internal" aria-label="${esc(t.internalNote)}" placeholder="${esc(t.internalNotePh)}">${esc(doc.internalNote)}</textarea></div><button data-activation=write class="inv-btn small" type="button" data-inv-act="save-internal">${esc(t.saveInternal)}</button></section>` : ''}
        <section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.timeline)}</h4><div class="inv-timeline">${timeline}</div></section>
        ${issued && type !== 'quote' ? `<div class="inv-note" data-locked-note>${esc(t.lockedNote)}</div>` : ''}</aside></div>`;
    show('detail');
  }

  /* ── actions du détail ────────────────────────────────────────────────── */
  async function run(fn, okMsg, after) {
    if (busy) return;
    busy = true;
    try { const res = await fn(); if (okMsg) toast(okMsg); refreshAll(); if (after) await after(res); }
    catch (err) { toast(errText(err)); }
    finally { busy = false; }
  }
  const post = (body) => api('POST', body);

  function actEdit() { renderComposer(detail.doc); }
  async function actIssueDetail() {
    const t = T(), doc = detail.doc;
    const body = doc.type === 'quote' ? [t.issueQuoteTitle, t.issueQuoteBody, t.sendQuote] : doc.type === 'credit_note' ? [t.issueCreditTitle, t.issueCreditBody, t.issueCredit] : [t.issueInvoiceTitle, t.issueInvoiceBody, t.issueInvoice];
    const yes = await openSheet({title: body[0], body: body[1], confirm: body[2], notice: sellerHasNoIce() ? t.sellerIceNotice : ''});
    if (!yes) return;
    await run(() => post({action: 'issue', id: doc.id}), null, async (res) => { toast(tpl(sellerIceMissing(res) ? t.issuedNoIce : t.issuedOk, {n: normDoc(docFrom(res)).number})); await openDetail(doc.id); });
  }
  async function actDelete() {
    const t = T(), doc = detail.doc;
    const yes = await openSheet({title: t.deleteTitle, body: t.deleteBody, confirm: t.del, danger: true});
    if (!yes) return;
    await run(() => post({action: 'delete-draft', id: doc.id}), t.deleted, async () => { lsDel('kiwi:invoicing:draft:v2:' + venueId() + ':' + doc.type + ':' + doc.id); renderList(); });
  }
  async function actPay() {
    const t = T(), doc = detail.doc;
    const out = await openSheet({
      title: t.paymentTitle, confirm: t.payRecord,
      fields: [
        {key: 'amount', label: t.payAmount, type: 'money', value: centsInput(detail.balanceCents), wide: true},
        {key: 'date', label: t.payDate, type: 'date', value: today()},
        {key: 'method', label: t.payMethod, type: 'select', value: 'transfer', options: METHODS.map(m => [m, t[m]])},
        {key: 'reference', label: t.payRef, type: 'text', value: '', placeholder: t.payRefPh, wide: true},
      ],
      submit: async (v) => {
        const cents = toCents(v.amount);
        if (cents <= 0) throw textError(t.payInvalid);
        if (cents > detail.balanceCents) throw textError(t.errExceeds);
        await post({action: 'payment', id: doc.id, amountCents: cents, date: v.date || today(), method: v.method, reference: v.reference.trim()});
        return true;
      },
    });
    if (out) { toast(t.paymentOk); refreshAll(); await openDetail(doc.id); }
  }
  async function actDeletePayment(pid) {
    const t = T(), doc = detail.doc;
    const yes = await openSheet({title: t.delPayTitle, body: t.delPayBody, confirm: t.deletePayment, danger: true});
    if (!yes) return;
    await run(() => post({action: 'delete-payment', id: doc.id, paymentId: pid}), t.paymentDeleted, () => openDetail(doc.id));
  }
  async function actCredit() {
    const t = T(), doc = detail.doc;
    const out = await openSheet({
      title: t.creditTitle, body: t.creditBody, confirm: t.creditTitle,
      fields: [{key: 'reason', label: t.creditReason, type: 'text', value: '', placeholder: t.creditReasonPh, wide: true}],
      submit: async (v) => {
        const reason = v.reason.trim(); if (!reason) throw textError(t.creditReasonNeed);
        return post({action: 'credit-note', id: doc.id, reason});
      },
    });
    if (out && out !== true) { toast(t.creditCreated); refreshAll(); renderComposer(docFrom(out)); }
  }
  async function actConvert() {
    const t = T(), doc = detail.doc;
    const yes = await openSheet({title: t.convertTitle, body: t.convertBody, confirm: t.convert});
    if (!yes) return;
    await run(() => post({action: 'convert-quote', id: doc.id}), t.converted, (res) => { renderComposer(docFrom(res)); });
  }
  const actDuplicate = () => run(() => post({action: 'duplicate', id: detail.doc.id}), T().duplicated, (res) => renderComposer(docFrom(res)));
  const actMarkSent = () => run(() => post({action: 'mark-sent', id: detail.doc.id}), T().sentMarked, () => openDetail(detail.doc.id));
  const actQuoteStatus = (status) => run(() => post({action: 'quote-status', id: detail.doc.id, status}), T().quoteUpdated, () => openDetail(detail.doc.id));
  async function actSaveInternal() {
    const note = overlay.querySelector('[data-f="internal"]')?.value || '';
    await run(() => post({action: 'save', id: detail.doc.id, type: detail.doc.type, internalNote: note}), T().noteSaved);
  }
  async function actImportLegacy() {
    const t = T(), docs = legacyDocs().slice(0, 500);
    if (!docs.length) return;
    const btn = overlay.querySelector('[data-inv-act="import-legacy"]'); if (btn) btn.disabled = true;
    try {
      const res = await post({action: 'import-legacy', docs});
      const key = 'kiwi:invoices:v1:' + venueId();
      const rest = legacyDocs().slice(500);
      if (rest.length) lsSet(key, JSON.stringify(rest)); else lsDel(key);
      toast(tpl(t.legacyDone, {n: res.importedCount ?? (Array.isArray(res.imported) ? res.imported.length : res.imported) ?? docs.length}));
      await refreshAll(); paintNotices();
    } catch (err) { toast(errText(err)); if (btn) btn.disabled = false; }
  }

  /* ── hand-off WhatsApp / e-mail : on prépare, le propriétaire envoie ───── */
  function handOff(kind) {
    const t = T(), doc = detail?.doc; if (!doc) return;
    const total = doc.totals?.ttcCents ?? computeTotals(doc.lines).ttcCents;
    const amount = money(doc.type === 'invoice' && detail.balanceCents > 0 ? detail.balanceCents : total) + ' MAD';
    const dueText = doc.type === 'quote' ? `${t.validOn}: ${fmtDate(doc.validUntil)}` : doc.type === 'invoice' ? `${t.dueOn}: ${fmtDate(doc.dueDate)}` : '';
    const message = `${docWord(doc.type)} ${doc.number || t.draftNo} · ${amount}. ${dueText} ${businessName()}`.replace(/\s+/g, ' ').trim();
    if (kind === 'whatsapp') {
      const phone = String(doc.customer.phone || '').replace(/\D/g, '');
      if (!phone) { toast(t.noContact); return; }
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    } else {
      const email = String(doc.customer.email || '').includes('@') ? doc.customer.email : '';
      if (!email) { toast(t.noContact); return; }
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(docWord(doc.type) + ' ' + (doc.number || ''))}&body=${encodeURIComponent(message)}`;
    }
  }

  /* ── impression A4 (gabarit propre au module, jamais KiwiInvoice.html) ─── */
  /* print:start */
  function termsText(...args) { return printModule.termsText({T, tpl}, this, args); }
  function printable(...args) { return printModule.printable({T, businessName, computeTotals, dmy, esc, getSeller, lang, lineHT, money, renderSellerLogo, termsText, tpl}, this, args); }
  /* print:end */
  function printDocument(...args) { return printModule.printDocument({T, detail, pick, printable, toast}, this, args); }

  /* ── export CSV de l'onglet courant ───────────────────────────────────── */
  /* ICE et numéros restent du texte : un tableur transforme 001561191000066 en
     1,56119E+14. ="…" force le texte, mais seulement sur des chiffres vérifiés. */
  function csvCell(...args) { return historyModule.csvCell({}, this, args); }
  function exportCsv(...args) { return historyModule.exportCsv({NO_OF, T, csvCell, csvMoney, statusLabel, tab, toast, today, visibleRows}, this, args); }

  /* ── événements ───────────────────────────────────────────────────────── */
  function setTab(next) {
    tab = next; filter = 'all';
    overlay.querySelectorAll('.inv-tab').forEach(b => { const on = b.dataset.v === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    paintRegister();
  }
  function openDoc(id) { openDetail(id); }

  function onClick(e) {
    if (sheetNode) return;
    if (e.target === overlay) return close();
    const el = e.target.closest('[data-inv-act]'); if (!el || !overlay.contains(el)) return;
    const a = el.dataset.invAct, v = el.dataset.v, id = el.dataset.id;
    switch (a) {
      case 'close': return close();
      case 'new': return renderComposer(null, tab === 'quote' ? 'quote' : 'invoice');
      case 'back': if (currentView === 'compose' && cmp?.id) { return openDetail(cmp.id); } renderList(); return refreshAll();
      case 'export': return exportCsv();
      case 'tab': return setTab(v);
      case 'filter': filter = v; overlay.querySelectorAll('.inv-filter').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return paintRegister();
      case 'more': return loadMore();
      case 'open': return openDoc(id);
      case 'open-doc': return openDoc(id);
      case 'sale-open': { const m = getSaleInvoices().find(x => x.id === id); if (m && m.rawDoc && window.KiwiInvoice) window.KiwiInvoice.open(m.rawDoc, 'pdf'); return; }
      case 'add-line': { const rows = readLines(); rows.push(blankLine()); paintLines(rows); updateComposer(); scheduleAutosave(); const last = overlay.querySelectorAll('.inv-line-row'); last[last.length - 1]?.querySelector('input')?.focus(); return; }
      case 'remove-line': { const rows = readLines(); const idx = [...overlay.querySelectorAll('.inv-line-row')].indexOf(el.closest('.inv-line-row')); if (rows.length > 1) rows.splice(idx, 1); else rows[0] = blankLine(); paintLines(rows); updateComposer(); scheduleAutosave(); return; }
      case 'save-draft': return saveComposer(false);
      case 'issue-composer': return saveComposer(true);
      case 'edit': return actEdit();
      case 'issue-detail': return actIssueDetail();
      case 'delete': return actDelete();
      case 'print': return printDocument();
      case 'whatsapp': return handOff('whatsapp');
      case 'email': return handOff('email');
      case 'pay': return actPay();
      case 'delete-payment': return actDeletePayment(el.dataset.pid);
      case 'mark-sent': return actMarkSent();
      case 'credit': return actCredit();
      case 'duplicate': return actDuplicate();
      case 'accept': return actQuoteStatus('accepted');
      case 'reject': return actQuoteStatus('rejected');
      case 'convert': return actConvert();
      case 'open-original': return detail?.doc?.originalId && openDoc(detail.doc.originalId);
      case 'save-internal': return actSaveInternal();
      case 'import-legacy': return actImportLegacy();
      case 'set-ice': return openSellerIce();
    }
  }
  function onInput(e) {
    if (sheetNode && sheetNode.contains(e.target)) return;
    if (e.target.matches('[data-inv-search]')) { query = e.target.value; return paintRegister(); }
    if (e.target.closest('[data-inv-compose]')) {
      if (e.target.matches('[data-f="ice"]')) checkIce();
      if (e.target.matches('[data-f="name"]') && cmp?.clientId && cmp.clientName !== e.target.value) cmp.clientId = '';
      updateComposer(); scheduleAutosave();
    }
  }
  function onChange(e) {
    if (sheetNode && sheetNode.contains(e.target)) return;
    if (!e.target.closest('[data-inv-compose]')) return;
    if (e.target.matches('[data-f="pick"]')) {
      const c = clientBook()[Number(e.target.value)];
      if (e.target.value !== '' && c) {
        const set = (n, v) => { const el = F(n); if (el && !el.disabled) el.value = v || ''; };
        set('name', c.name); set('phone', c.phone); set('email', c.email); set('addr', c.address || c.city);
        if (c.ice) set('ice', c.ice);
        cmp.clientId = c.id || ''; cmp.clientName = c.name; checkIce();
      }
    }
    if (e.target.matches('[data-f="kind"]')) { const t = T(); overlay.querySelector('[data-ice-label]').textContent = isBusinessKind(e.target.value) ? t.iceRequired : t.ice; }
    updateComposer(); scheduleAutosave();
  }
  function onKeydown(e) {
    if (sheetNode) return;
    if (e.key === 'Escape') return close();
    if (e.key === 'Enter' && e.target.matches('tr[data-inv-act]')) { e.preventDefault(); e.target.click(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(x => !x.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    if (overlay) return;
    priorFocus = document.activeElement;
    tab = 'invoice'; filter = 'all'; query = ''; detail = null; cmp = null; offline = false; authBlocked = false;
    cache.invoice = []; cache.quote = []; cache.credit_note = [];
    loadCache();
    shell(); renderList();
    refreshAll();
    syncServerInvoices();
  }
  function updatePill() { document.querySelectorAll('[data-invoicing-label]').forEach(el => { el.textContent = T().label; }); }
  function install() {
    window.Kiwi = window.Kiwi || {};
    window.Kiwi.handlers = window.Kiwi.handlers || {};
    liveOpen = open;
    window.KiwiInvoicing.list = () => TYPES.reduce((a, ty) => a.concat(cache[ty].map(x => Object.assign({}, x))), []);
    updatePill();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once: true}); else install();
  window.addEventListener('kiwi:langchange', updatePill);
  });
})();
