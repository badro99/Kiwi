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
      loading: 'Chargement…', offline: 'Hors ligne · dernière liste enregistrée sur cet appareil',
      authError: 'Accès réservé au propriétaire du compte. Reconnectez-vous pour voir vos documents.',
      legacyBanner: '{n} factures enregistrées sur cet appareil', legacyOne: '1 facture enregistrée sur cet appareil',
      legacyHint: 'Importez-les sur votre compte : elles arrivent en brouillons à vérifier avant émission.', legacyImport: 'Importer',
      legacyDone: '{n} factures importées en brouillons',
      demoNote: 'Données de démonstration, enregistrées sur cet appareil seulement.',
      serverNote: 'Les numéros sont attribués par le serveur, sans trou ni doublon.',
      /* composer */
      editDraft: 'Modifier le brouillon', editQuote: 'Modifier le devis', newCredit: 'Avoir sur facture {n}',
      autosave: 'Brouillon conservé sur cet appareil pendant la saisie', restored: 'Saisie non enregistrée restaurée',
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
      errOffline: 'Hors ligne : rien n’a été enregistré. Réessayez avec une connexion.', errLocked: 'Ce document est émis : il ne peut plus être modifié.',
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
      loading: 'Loading…', offline: 'Offline · last list saved on this device',
      authError: 'Access is reserved to the account owner. Sign in again to see your documents.',
      legacyBanner: '{n} invoices saved on this device', legacyOne: '1 invoice saved on this device',
      legacyHint: 'Import them into your account: they arrive as drafts to check before issuing.', legacyImport: 'Import',
      legacyDone: '{n} invoices imported as drafts',
      demoNote: 'Demo data, saved on this device only.',
      serverNote: 'Numbers are assigned by the server, with no gaps or duplicates.',
      editDraft: 'Edit draft', editQuote: 'Edit quote', newCredit: 'Credit note on invoice {n}',
      autosave: 'Draft kept on this device while you type', restored: 'Unsaved entry restored',
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
      errOffline: 'Offline: nothing was saved. Try again with a connection.', errLocked: 'This document is issued: it can no longer be modified.',
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
      loading: 'جارٍ التحميل…', offline: 'دون اتصال · آخر قائمة محفوظة على هذا الجهاز',
      authError: 'الدخول محجوز لمالك الحساب. سجّل الدخول مجدداً لرؤية مستنداتك.',
      legacyBanner: '{n} فواتير محفوظة على هذا الجهاز', legacyOne: 'فاتورة واحدة محفوظة على هذا الجهاز',
      legacyHint: 'استوردها إلى حسابك: تصل كمسودات للمراجعة قبل الإصدار.', legacyImport: 'استيراد',
      legacyDone: 'تم استيراد {n} فواتير كمسودات',
      demoNote: 'بيانات تجريبية محفوظة على هذا الجهاز فقط.',
      serverNote: 'يمنح الخادم الأرقام دون ثغرات أو تكرار.',
      editDraft: 'تعديل المسودة', editQuote: 'تعديل عرض السعر', newCredit: 'إشعار دائن على الفاتورة {n}',
      autosave: 'تُحفظ المسودة على هذا الجهاز أثناء الكتابة', restored: 'تمت استعادة ما كُتب دون حفظ',
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
      errOffline: 'دون اتصال: لم يُحفظ شيء. أعد المحاولة عند توفر الاتصال.', errLocked: 'هذا المستند صادر: لا يمكن تعديله.',
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
      try { new Intl.DateTimeFormat('en-CA', {timeZone: zone}).format(0); return zone; } catch (_) {}
    }
    return 'Africa/Casablanca';
  };
  const dayIn = (ts) => new Intl.DateTimeFormat('en-CA', {timeZone: storeZone(), year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(Number(ts) || Date.parse(ts) || Date.now()));
  const today = () => dayIn(Date.now());
  const shift = (days, from) => { const d = new Date((from || today()) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const locale = () => (lang() === 'ar' ? 'ar-MA' : lang() + '-MA');
  const fmtDate = (value) => value ? new Intl.DateTimeFormat(locale(), {day: '2-digit', month: 'short', year: 'numeric'}).format(new Date(value + 'T12:00:00')) : '·';
  const dmy = (value) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
  /* Amounts read « 2 000,00 » in French and Arabic (Moroccan business practice, Latin
   digits), « 2,000.00 » in English: fr-MA would print « 2.000,00 », a dot a
   customer can take for a decimal. */
  const money = (cents) => new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits: 2, minimumFractionDigits: 2}).format((Number(cents) || 0) / 100);
  const csvMoney = (cents) => ((Number(cents) || 0) / 100).toFixed(2).replace('.', ',');
  const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
  const parseJ = (v, d) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return d; } } return v == null ? d : v; };

  function venueId() {
    try { return String(window.KiwiVenue?.getVenue?.() || 'demo').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'demo'; } catch (_) { return 'demo'; }
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
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
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
    return Math.round((Number(l.qty) || 0) * (Number(l.unitHT) || 0) * (1 - disc / 100));
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

  /* ── erreurs d'API ─────────────────────────────────────────────────────── */
  function apiError(code, message, status) { const e = new Error(message || code); e.code = code; e.status = status; return e; }
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

  /* ── transport : serveur pour un compte réel, moteur local en démo ─────── */
  async function api(method, payload) {
    if (!ownData()) return demo.handle(method, payload || {});
    const merchant = merchantSlug();
    let res;
    try {
      if (method === 'GET') {
        res = await fetch('/api/invoices?' + new URLSearchParams(Object.assign({merchant}, payload || {})).toString(), {credentials: 'same-origin'});
      } else {
        res = await fetch('/api/invoices', {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json'}, body: JSON.stringify(Object.assign({merchant}, payload || {}))});
      }
    } catch (_) { throw apiError('offline'); }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || data.ok === false || data.error) {
      throw apiError(data?.error || (res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'not-found' : 'server'), data?.message, res.status);
    }
    return data;
  }

  /* ── moteur local (démonstration) : le même contrat, sans réseau ───────── */
  const demo = (() => {
    let S = null;
    const key = () => 'kiwi:invoicing:demo:v2:' + venueId();
    const persist = () => lsSet(key(), JSON.stringify(S));
    const PREFIX = {invoice: 'F', credit_note: 'AV', quote: 'D'};
    function uid() { return 'inv_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); }
    function number(prefix, seq, year) { return prefix + '-' + year + '-' + String(seq).padStart(4, '0'); }
    function fresh(type, patch) {
      const now = Date.now();
      return Object.assign({id: uid(), type, status: 'draft', number: '', seq: null, issueDate: today(), dueDate: '', termsDays: 30, validUntil: '',
        customer: {name: '', address: '', ice: '', if: '', email: '', phone: '', clientId: ''}, seller: null, lines: [], totals: computeTotals([]),
        paymentMethod: '', note: '', internalNote: '', exemptionMention: '', originalId: '', sourceQuoteId: '', reason: '', createdTs: now, updatedTs: now, issuedTs: null, sentTs: null}, patch || {});
    }
    function allocate(doc) {
      const prefix = PREFIX[doc.type], year = Number(String(doc.issueDate || today()).slice(0, 4));
      S.seq[prefix] = (S.seq[prefix] || 0) + 1;
      doc.seq = S.seq[prefix]; doc.number = number(prefix, doc.seq, year);
    }
    function creditedOf(doc) { return S.docs.filter(d => d.type === 'credit_note' && d.originalId === doc.id && d.status === 'issued').reduce((s, d) => s + d.totals.ttcCents, 0); }
    function paidOf(doc) { return S.payments.filter(p => p.docId === doc.id).reduce((s, p) => s + p.amountCents, 0); }
    function derive(doc) {
      if (doc.type === 'credit_note') return {displayStatus: doc.status, balanceCents: 0};
      if (doc.type === 'quote') return {displayStatus: doc.status === 'sent' && doc.validUntil && doc.validUntil < today() ? 'expired' : doc.status, balanceCents: 0};
      if (doc.status === 'draft') return {displayStatus: 'draft', balanceCents: 0};
      const ttc = doc.totals.ttcCents, paid = paidOf(doc), credited = creditedOf(doc), balance = Math.max(0, ttc - paid - credited);
      let ds = 'issued';
      if (credited >= ttc && ttc > 0) ds = 'cancelled';
      else if (balance <= 0) ds = 'paid';
      else if (doc.dueDate && doc.dueDate < today()) ds = 'overdue';
      else if (paid > 0) ds = 'partial';
      return {displayStatus: ds, balanceCents: balance};
    }
    const rowOf = (d) => Object.assign({id: d.id, type: d.type, status: d.status, number: d.number, issueDate: d.issueDate, dueDate: d.dueDate, validUntil: d.validUntil,
      customer: {name: d.customer.name, ice: d.customer.ice}, totals: {ttcCents: d.totals.ttcCents},
      originalNumber: d.originalId ? (S.docs.find(x => x.id === d.originalId)?.number || '') : '', legacyRef: d.legacyRef || ''}, derive(d));
    const clone = (o) => JSON.parse(JSON.stringify(o));
    function find(id) { const d = S.docs.find(x => x.id === id); if (!d) throw apiError('not-found'); return d; }

    function applyFields(d, b) {
      if (b.customer) d.customer = Object.assign({name: '', address: '', ice: '', if: '', email: '', phone: '', clientId: ''}, b.customer);
      if (Array.isArray(b.lines)) d.lines = b.lines.map(l => ({description: String(l.description || ''), qty: Number(l.qty) || 0, unitHT: Math.round(Number(l.unitHT) || 0), discountPct: Number(l.discountPct) || 0, vatRate: Number(l.vatRate) || 0}));
      if (b.issueDate) d.issueDate = b.issueDate;
      if (d.type === 'quote') { d.validUntil = b.validUntil || d.validUntil || shift(30, d.issueDate); }
      else if (b.dueDate) { d.dueDate = b.dueDate; d.termsDays = null; }
      else if (b.termsDays != null) { d.termsDays = Number(b.termsDays); d.dueDate = shift(d.termsDays, d.issueDate); }
      else if (!d.dueDate) { d.dueDate = shift(d.termsDays || 0, d.issueDate); }
      ['paymentMethod', 'note', 'exemptionMention'].forEach(k => { if (b[k] !== undefined) d[k] = String(b[k] || ''); });
      d.totals = computeTotals(d.lines); d.updatedTs = Date.now();
    }
    function validateIssue(d) {
      if (!String(d.customer.name || '').trim()) throw apiError('invalid-customer');
      if (iceProblem(d.customer.ice)) throw apiError('invalid-ice');
      if (!d.lines.some(l => l.qty > 0)) throw apiError('invalid-lines');
      if (d.lines.some(l => l.vatRate === 0) && !String(d.exemptionMention || d.note || '').trim()) throw apiError('exempt-mention-required');
    }
    function issue(d) {
      if (d.type === 'quote') {
        if (!d.number) { validateIssue(d); allocate(d); d.issuedTs = Date.now(); }
        if (d.status === 'draft') d.status = 'sent';
        return d;
      }
      if (d.status === 'issued') return d;
      validateIssue(d);
      d.seller = clone(getSeller());
      d.totals = computeTotals(d.lines); allocate(d); d.status = 'issued'; d.issuedTs = Date.now();
      if (d.dueDate === '') d.dueDate = shift(d.termsDays || 0, d.issueDate);
      return d;
    }
    function seedStore() {
      S = {docs: [], payments: [], seq: {F: 0, AV: 0, D: 0}};
      const mk = (type, input, pay) => { const patch = Object.assign({}, input); const skip = patch.issue === false; delete patch.issue; const d = fresh(type, patch); d.totals = computeTotals(d.lines); if (!skip) { try { issue(d); } catch (_) {} } S.docs.push(d); (pay || []).forEach(p => S.payments.push(Object.assign({id: uid(), docId: d.id, method: 'transfer', reference: ''}, p))); return d; };
      const L = (description, qty, price, vatRate) => ({description, qty, unitHT: price * 100, discountPct: 0, vatRate: vatRate == null ? 20 : vatRate});
      mk('invoice', {customer: {name: 'Atelier Nomade', address: 'Avenue Hassan II, Casablanca', ice: '002136093000040', if: '', email: 'finance@atelier-nomade.ma', phone: '', clientId: ''}, issueDate: shift(-18), termsDays: 15, dueDate: shift(-3), lines: [L('Privatisation de salle', 1, 5400), L('Pause café', 24, 65)], paymentMethod: 'transfer'});
      mk('invoice', {customer: {name: 'Maison Jasmin', address: 'Rue des Orangers, Marrakech', ice: '001561191000066', if: '', email: 'contact@maisonjasmin.ma', phone: '', clientId: ''}, issueDate: shift(-8), termsDays: 7, dueDate: shift(-1), lines: [L('Commande entreprise', 1, 3950)], paymentMethod: 'transfer'}, [{amountCents: 474000, date: shift(-2)}]);
      mk('invoice', {customer: {name: 'Riad Zayna', address: 'Médina, Marrakech', ice: '', if: '', email: '', phone: '+212 661 44 08 22', clientId: ''}, issueDate: shift(-2), termsDays: 7, dueDate: shift(5), lines: [L('Service traiteur · 35 couverts', 1, 8750)], paymentMethod: 'transfer', note: 'Merci pour votre confiance.'}, [{amountCents: 300000, date: shift(-1)}]);
      mk('invoice', {customer: {name: 'Studio Terracotta', address: '', ice: '', if: '', email: '', phone: '', clientId: ''}, issueDate: shift(-1), termsDays: 30, dueDate: shift(29), lines: [L('Événement privé', 1, 6250)], issue: false});
      mk('quote', {customer: {name: 'Hôtel Les Dunes', address: 'Merzouga', ice: '', if: '', email: 'achats@lesdunes.ma', phone: '', clientId: ''}, issueDate: shift(-3), validUntil: shift(20), lines: [L('Buffet de séminaire · 40 personnes', 1, 12000), L('Location de matériel', 1, 800)]});
      persist(); return S;
    }
    function load() {
      if (S) return S;
      try { S = JSON.parse(lsGet(key()) || 'null'); } catch (_) { S = null; }
      if (!S || !Array.isArray(S.docs)) seedStore();
      return S;
    }
    async function handle(method, p) {
      load();
      if (method === 'GET') {
        if (p.id) {
          const d = find(p.id), dv = derive(d);
          return {ok: true, doc: clone(Object.assign({}, d, {originalNumber: d.originalId ? (S.docs.find(x => x.id === d.originalId)?.number || '') : ''})), payments: clone(S.payments.filter(x => x.docId === d.id)),
            creditNotes: S.docs.filter(x => x.type === 'credit_note' && x.originalId === d.id && x.status === 'issued').map(x => ({id: x.id, number: x.number, ttcCents: x.totals.ttcCents, issueDate: x.issueDate})),
            displayStatus: dv.displayStatus, balanceCents: dv.balanceCents};
        }
        const rows = S.docs.filter(d => !p.type || d.type === p.type).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || b.createdTs - a.createdTs).slice(0, 500).map(rowOf);
        return {ok: true, docs: rows};
      }
      const a = p.action;
      if (a === 'save') {
        let d;
        if (p.id) { d = find(p.id); if (d.type !== 'quote' && d.status !== 'draft') { if (Object.keys(p).some(k => !['merchant', 'action', 'id', 'type', 'internalNote'].includes(k) && p[k] !== undefined)) throw apiError('locked'); } }
        else { d = fresh(p.type || 'invoice'); S.docs.push(d); }
        if (d.type === 'quote' && d.status === 'invoiced') throw apiError('locked');
        if (p.internalNote !== undefined) d.internalNote = String(p.internalNote || '');
        if (d.status === 'draft' || d.type === 'quote') applyFields(d, p);
        persist(); return {ok: true, doc: clone(d)};
      }
      const d = p.id ? find(p.id) : null;
      if (a === 'issue') { issue(d); persist(); return {ok: true, doc: clone(d)}; }
      if (a === 'mark-sent') { if (d.status === 'draft') throw apiError('not-issued'); d.sentTs = d.sentTs || Date.now(); persist(); return {ok: true, doc: clone(d)}; }
      if (a === 'payment') {
        if (d.type !== 'invoice' || d.status !== 'issued') throw apiError('not-issued');
        const amount = Math.round(Number(p.amountCents) || 0);
        if (amount <= 0) throw apiError('invalid-amount');
        if (amount > derive(d).balanceCents) throw apiError('amount-exceeds-balance');
        S.payments.push({id: uid(), docId: d.id, amountCents: amount, date: p.date || today(), method: p.method || 'cash', reference: String(p.reference || '')});
        persist(); const dv = derive(d); return {ok: true, displayStatus: dv.displayStatus, balanceCents: dv.balanceCents};
      }
      if (a === 'delete-payment') {
        const i = S.payments.findIndex(x => x.id === p.paymentId && x.docId === d.id); if (i < 0) throw apiError('not-found');
        S.payments.splice(i, 1); persist(); const dv = derive(d); return {ok: true, displayStatus: dv.displayStatus, balanceCents: dv.balanceCents};
      }
      if (a === 'credit-note') {
        if (d.type !== 'invoice' || d.status !== 'issued') throw apiError('not-issued');
        const lines = (Array.isArray(p.lines) && p.lines.length ? p.lines : d.lines);
        const cn = fresh('credit_note', {customer: clone(d.customer), originalId: d.id, reason: String(p.reason || ''), lines: clone(lines), paymentMethod: d.paymentMethod, exemptionMention: d.exemptionMention});
        cn.totals = computeTotals(cn.lines);
        if (cn.totals.ttcCents > d.totals.ttcCents - creditedOf(d)) throw apiError('credit-exceeds-invoice');
        S.docs.push(cn); persist(); return {ok: true, doc: clone(cn)};
      }
      if (a === 'quote-status') { if (d.type !== 'quote' || d.status === 'draft' || d.status === 'invoiced') throw apiError('locked'); d.status = p.status === 'rejected' ? 'rejected' : 'accepted'; persist(); return {ok: true, doc: clone(d)}; }
      if (a === 'convert-quote') {
        if (d.type !== 'quote' || d.status === 'draft' || d.status === 'invoiced') throw apiError('locked');
        const inv = fresh('invoice', {customer: clone(d.customer), lines: clone(d.lines), sourceQuoteId: d.id, exemptionMention: d.exemptionMention, note: d.note});
        inv.dueDate = shift(inv.termsDays, inv.issueDate); inv.totals = computeTotals(inv.lines);
        S.docs.push(inv); d.status = 'invoiced'; persist(); return {ok: true, doc: clone(inv)};
      }
      if (a === 'duplicate') {
        const c = fresh(d.type, {customer: clone(d.customer), lines: clone(d.lines), note: d.note, paymentMethod: d.paymentMethod, exemptionMention: d.exemptionMention, termsDays: d.termsDays == null ? 30 : d.termsDays});
        if (d.type === 'quote') c.validUntil = shift(30); else c.dueDate = shift(c.termsDays, c.issueDate);
        c.totals = computeTotals(c.lines); S.docs.push(c); persist(); return {ok: true, doc: clone(c)};
      }
      if (a === 'delete-draft') {
        if (d.status !== 'draft') throw apiError('locked');
        S.docs.splice(S.docs.indexOf(d), 1); persist(); return {ok: true};
      }
      throw apiError('server');
    }
    return {handle};
  })();

  /* ── état de l'écran ───────────────────────────────────────────────────── */
  let overlay = null;
  const cache = {invoice: [], quote: [], credit_note: []};
  let tab = 'invoice';          // invoice | quote | credit_note | sales
  let filter = 'all';
  let query = '';
  let offline = false, authBlocked = false, loadingList = false;
  let priorFocus = null;
  let refreshToken = 0;
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
  const cacheKey = () => 'kiwi:invdocs:cache:v2:' + venueId();
  function loadCache() {
    if (!ownData()) return;
    try { const c = JSON.parse(lsGet(cacheKey()) || 'null'); if (c && c.docs) TYPES.forEach(ty => { if (Array.isArray(c.docs[ty])) cache[ty] = c.docs[ty]; }); } catch (_) {}
  }
  function saveCache() { if (ownData()) lsSet(cacheKey(), JSON.stringify({ts: Date.now(), docs: cache})); }

  /* ── clients du carnet ─────────────────────────────────────────────────── */
  function clientBook() {
    try {
      const rows = window.KiwiClientsDirectory?.load?.()?.rows;
      if (Array.isArray(rows)) return rows.filter(r => r && r.name);
      const list = window.KiwiClients?.list?.();
      if (Array.isArray(list)) return list.filter(r => r && r.name);
    } catch (_) {}
    return [];
  }

  /* ── factures de vente (comptoir) : inchangé ───────────────────────────── */
  function getSaleInvoices() {
    try {
      const cached = window.KiwiInvoice?.getCachedInvoices?.() || {};
      return Object.values(cached).map((doc) => {
        const id = String(doc.number || (doc.seq ? ('F-' + doc.seq) : 'Facture'));
        const customer = (doc.customer && doc.customer.name) || 'Client de passage';
        const contact = (doc.customer && doc.customer.ice) ? ('ICE ' + doc.customer.ice) : 'Vente comptoir';
        const issueDate = doc.issuedTs ? dayIn(doc.issuedTs) : today();
        const total = (doc.totals && Number(doc.totals.ttc)) || 0;
        return {id, customer, contact, issueDate, dueDate: issueDate, total, isSaleInvoice: true, rawDoc: doc};
      });
    } catch (_) { return []; }
  }
  function syncServerInvoices() {
    const m = merchantSlug();
    if (!m || typeof fetch !== 'function') return;
    fetch('/api/invoice?merchant=' + encodeURIComponent(m), { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
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
      .catch(() => {});
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
  function rowsFor(ty) { return cache[ty] || []; }
  function stats() {
    let outstanding = 0, late = 0, paidMonth = 0, waiting = 0, lateCount = 0;
    const month = today().slice(0, 7);
    rowsFor('invoice').forEach(r => {
      const ds = r.displayStatus;
      if (ds === 'issued' || ds === 'partial' || ds === 'overdue') { outstanding += r.balanceCents; waiting += 1; }
      if (ds === 'overdue') { late += r.balanceCents; lateCount += 1; }
      if ((ds === 'paid' || ds === 'partial' || ds === 'overdue' || ds === 'issued') && String(r.issueDate).slice(0, 7) === month) paidMonth += Math.max(0, r.ttcCents - r.balanceCents);
    });
    return {outstanding, late, paidMonth, waiting, lateCount};
  }
  function paintStats() {
    const box = overlay?.querySelector('[data-inv-stats]'); if (!box) return;
    const t = T(), s = stats();
    const total = TYPES.reduce((n, ty) => n + rowsFor(ty).length, 0) + getSaleInvoices().length;
    box.innerHTML = `<article class="inv-stat"><div class="inv-stat-label">${esc(t.outstanding)}</div><div class="inv-stat-value" data-stat="outstanding">${money(s.outstanding)} <small>MAD</small></div><div class="inv-stat-note">${s.waiting} ${esc(t.awaiting)}</div></article>
      <article class="inv-stat alert"><div class="inv-stat-label">${esc(t.overdue)}</div><div class="inv-stat-value" data-stat="overdue">${money(s.late)} <small>MAD</small></div><div class="inv-stat-note">${s.lateCount} ${esc(t.needsFollowup)}</div></article>
      <article class="inv-stat"><div class="inv-stat-label">${esc(t.paidMonth)}</div><div class="inv-stat-value" data-stat="paid">${money(s.paidMonth)} <small>MAD</small></div><div class="inv-stat-note">${esc(t.collected)}</div></article>
      <article class="inv-stat"><div class="inv-stat-label">${esc(t.documents)}</div><div class="inv-stat-value" data-stat="docs">${total}</div><div class="inv-stat-note">${esc(t.totalDocs)}</div></article>`;
  }
  function legacyDocs() {
    if (!ownData()) return [];
    try {
      const a = JSON.parse(lsGet('kiwi:invoices:v1:' + venueId()) || '[]');
      return Array.isArray(a) ? a.filter(x => x && x.id != null && Array.isArray(x.items)) : [];
    } catch (_) { return []; }
  }
  function paintNotices() {
    const box = overlay?.querySelector('[data-inv-notices]'); if (!box) return;
    const t = T(), parts = [];
    const legacy = legacyDocs();
    if (legacy.length) {
      parts.push(`<div class="inv-banner" data-inv-legacy><div class="inv-banner-copy"><strong>${esc(legacy.length === 1 ? t.legacyOne : tpl(t.legacyBanner, {n: legacy.length}))}</strong><span>${esc(t.legacyHint)}</span></div><button class="inv-btn small primary" type="button" data-inv-act="import-legacy">${esc(t.legacyImport)}</button></div>`);
    }
    if (authBlocked) parts.push(`<div class="inv-banner warn" role="status" data-inv-auth>${esc(t.authError)}</div>`);
    else if (offline) parts.push(`<div class="inv-banner warn" role="status" data-inv-offline>${esc(t.offline)}</div>`);
    box.innerHTML = parts.join('');
  }
  function tabsHtml() {
    const t = T();
    return [['invoice', t.tabInvoices], ['quote', t.tabQuotes], ['credit_note', t.tabCredits], ['sales', t.sales]]
      .map(([k, l]) => `<button class="inv-tab${tab === k ? ' on' : ''}" type="button" role="tab" aria-selected="${tab === k}" data-lens-item data-inv-act="tab" data-v="${k}">${esc(l)}</button>`).join('');
  }
  function newLabel() { return tab === 'quote' ? T().newQuote : T().newInvoice; }

  function visibleRows() {
    const q = query.trim().toLowerCase();
    if (tab === 'sales') {
      return getSaleInvoices().reverse().filter(r => !q || String(r.id).toLowerCase().includes(q) || String(r.customer).toLowerCase().includes(q));
    }
    return rowsFor(tab).filter(r => {
      if (tab === 'invoice') {
        const ds = r.displayStatus;
        const ok = filter === 'all' || (filter === 'draft' && ds === 'draft') || (filter === 'paid' && ds === 'paid')
          || (filter === 'overdue' && ds === 'overdue') || (filter === 'collect' && (ds === 'issued' || ds === 'partial' || ds === 'overdue'));
        if (!ok) return false;
      }
      return !q || String(r.number).toLowerCase().includes(q) || String(r.customer.name).toLowerCase().includes(q) || String(r.customer.ice).includes(q);
    });
  }
  function paintRegister() {
    const root = overlay?.querySelector('[data-inv-list]'); if (!root || !root.querySelector('[data-inv-table]')) return;
    const t = T();
    root.querySelector('[data-inv-filters]').innerHTML = tab === 'invoice'
      ? [['all', t.fAll], ['collect', t.fCollect], ['overdue', t.fOverdue], ['paid', t.fPaid], ['draft', t.fDraft]].map(([k, l]) => `<button class="inv-filter${filter === k ? ' on' : ''}" type="button" data-inv-act="filter" data-v="${k}">${esc(l)}</button>`).join('')
      : '';
    const newBtn = root.querySelector('[data-inv-act="new"]');
    if (newBtn) { newBtn.hidden = tab === 'credit_note'; newBtn.querySelector('[data-new-label]').textContent = newLabel(); }
    const rows = visibleRows();
    let html;
    if (loadingList && !rows.length && tab !== 'sales') {
      html = `<div class="inv-empty"><p>${esc(t.loading)}</p></div>`;
    } else if (rows.length) {
      const dueHead = tab === 'quote' ? t.colValid : t.colDue;
      html = `<div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>${esc(t.colNo)}</th><th>${esc(t.colCustomer)}</th><th>${esc(t.colIssued)}</th><th>${esc(tab === 'credit_note' ? '' : dueHead)}</th><th>${esc(t.colStatus)}</th><th>${esc(t.colAmount)}</th></tr></thead><tbody>${rows.map(r => {
        if (r.isSaleInvoice) {
          return `<tr data-inv-act="sale-open" data-inv-sale-open="${esc(r.id)}" data-id="${esc(r.id)}" tabindex="0"><td><span class="inv-no">${esc(r.id)}</span></td><td><span class="inv-customer">${esc(r.customer)}</span><span class="inv-customer-sub">${esc(r.contact || '·')}</span></td><td class="inv-date" data-label="${esc(t.colIssued)}">${esc(fmtDate(r.issueDate))}</td><td class="inv-date" data-label="${esc(t.colDue)}">${esc(fmtDate(r.dueDate))}</td><td>${statusHtml('invoice', 'paid')}</td><td class="inv-money">${money(Math.round((Number(r.total) || 0) * 100))} MAD</td></tr>`;
        }
        const due = r.type === 'quote' ? (r.validUntil || r.dueDate) : r.dueDate;
        const sub = r.type === 'credit_note' && r.originalNumber ? tpl(t.creditOn, {n: r.originalNumber}) : (r.customer.ice ? 'ICE ' + r.customer.ice : '·');
        const left = r.type === 'invoice' && (r.displayStatus === 'partial' || r.displayStatus === 'overdue') && r.balanceCents > 0 && r.balanceCents < r.ttcCents ? `<span class="inv-customer-sub">${esc(tpl(t.balanceLeft, {amount: money(r.balanceCents) + ' MAD'}))}</span>` : '';
        return `<tr data-inv-act="open" data-id="${esc(r.id)}" data-type="${esc(r.type)}" tabindex="0"><td><span class="inv-no">${esc(NO_OF(r))}</span></td><td><span class="inv-customer">${esc(r.customer.name)}</span><span class="inv-customer-sub">${esc(sub)}</span></td><td class="inv-date" data-label="${esc(t.colIssued)}">${esc(fmtDate(r.issueDate))}</td><td class="inv-date" data-label="${esc(dueHead)}">${esc(r.type === 'credit_note' ? '·' : fmtDate(due))}</td><td>${statusHtml(r.type, r.displayStatus)}</td><td class="inv-money">${money(r.ttcCents)} MAD${left}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    } else {
      const hasAny = tab === 'sales' ? false : rowsFor(tab).length > 0;
      const msg = tab === 'sales' ? [t.salesSub, ''] : hasAny ? [t.emptyFilter, ''] : ({invoice: [t.emptyInvoice, t.emptyInvoiceSub], quote: [t.emptyQuote, t.emptyQuoteSub], credit_note: [t.emptyCredit, t.emptyCreditSub]}[tab]);
      html = `<div class="inv-empty"><div class="inv-empty-mark">${ICON.invoice}</div><h4>${esc(msg[0])}</h4><p>${esc(msg[1])}</p>${tab === 'credit_note' || hasAny ? '' : `<button class="inv-btn primary" type="button" data-inv-act="new">${ICON.plus}${esc(newLabel())}</button>`}</div>`;
    }
    root.querySelector('[data-inv-table]').innerHTML = html;
  }
  function paintAll() { if (!overlay || currentView !== 'list') return; paintNotices(); paintStats(); paintRegister(); }

  function renderList() {
    const t = T();
    overlay.querySelector('[data-inv-list]').innerHTML = `<div class="inv-toolbar"><div class="inv-toolbar-copy"><h3>${esc(t.overview)}</h3><p>${esc(t.overviewSub)}</p></div><div class="inv-toolbar-actions"><button class="inv-btn" type="button" data-inv-act="export">${ICON.export}${esc(t.export)}</button><button class="inv-btn primary" type="button" data-inv-act="new">${ICON.plus}<span data-new-label>${esc(newLabel())}</span></button></div></div>
      <div data-inv-notices></div>
      <div class="inv-stats" data-inv-stats></div>
      <section class="inv-register"><div class="inv-tabs" role="tablist" data-lens-demo>${tabsHtml()}</div><div class="inv-register-head"><div class="inv-filters" data-inv-filters></div><input class="inv-search" type="search" value="${esc(query)}" data-inv-search placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"></div><div data-inv-table></div></section>
      <p class="inv-foot-note">${esc(ownData() ? t.serverNote : t.demoNote)}</p>`;
    show('list'); paintAll();
  }

  async function refreshAll() {
    const token = ++refreshToken;
    loadingList = true; if (currentView === 'list') paintRegister();
    const results = await Promise.allSettled(TYPES.map(ty => api('GET', {type: ty})));
    if (token !== refreshToken || !overlay) return;
    let failed = 0; authBlocked = false;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') cache[TYPES[i]] = (r.value.docs || []).map(normRow);
      else { failed++; if (r.reason && (r.reason.code === 'unauthorized' || r.reason.code === 'forbidden')) authBlocked = true; }
    });
    offline = failed > 0 && !authBlocked;
    if (!failed) saveCache();
    loadingList = false; paintAll();
  }

  /* ── composer ─────────────────────────────────────────────────────────── */
  function vatOptions(selected) {
    const t = T(), set = VAT_RATES.slice();
    if (!set.includes(Number(selected))) set.push(Number(selected));
    return set.map(r => `<option value="${r}"${Number(selected) === r ? ' selected' : ''}>${r === 0 ? esc(t.exempt) : r + ' %'}</option>`).join('');
  }
  function lineRowHtml(l) {
    const t = T();
    return `<div class="inv-line-row" data-line>
      <div class="inv-line-desc"><input data-l="desc" value="${esc(l.description)}" placeholder="${esc(t.descPh)}" aria-label="${esc(t.desc)}"></div>
      <label class="inv-cell"><span>${esc(t.qty)}</span><input data-l="qty" inputmode="decimal" value="${esc(l.qty)}"></label>
      <label class="inv-cell"><span>${esc(t.unitHT)}</span><input data-l="unit" inputmode="decimal" value="${esc(l.unit)}" placeholder="0,00"></label>
      <label class="inv-cell"><span>${esc(t.discount)}</span><input data-l="disc" inputmode="decimal" value="${esc(l.disc)}" placeholder="0"></label>
      <label class="inv-cell"><span>${esc(t.vat)}</span><select data-l="vat">${vatOptions(l.vat)}</select></label>
      <div class="inv-cell"><span>${esc(t.lineHT)}</span><output class="inv-line-total" data-l="total">0,00</output></div>
      <button class="inv-line-remove" type="button" data-inv-act="remove-line" aria-label="${esc(t.removeLine)}">${ICON.close}</button>
    </div>`;
  }
  const blankLine = () => ({description: '', qty: '1', unit: '', disc: '', vat: DEFAULT_VAT});
  const F = (name) => overlay?.querySelector('[data-f="' + name + '"]');
  const fv = (name) => String(F(name)?.value ?? '').trim();
  function readLines() {
    return [...overlay.querySelectorAll('.inv-line-row')].map(r => ({
      description: r.querySelector('[data-l="desc"]').value.trim(), qty: r.querySelector('[data-l="qty"]').value, unit: r.querySelector('[data-l="unit"]').value,
      disc: r.querySelector('[data-l="disc"]').value, vat: Number(r.querySelector('[data-l="vat"]').value),
    }));
  }
  const apiLines = (rows) => rows.filter(r => r.description || num(r.unit)).map(r => ({description: r.description, qty: num(r.qty), unitHT: toCents(r.unit), discountPct: Math.min(100, num(r.disc)), vatRate: Number(r.vat)}));
  function paintLines(rows) {
    overlay.querySelector('[data-inv-lines]').innerHTML = rows.map(lineRowHtml).join('');
  }
  function termsOptions(selected) {
    const t = T();
    return TERMS_CHOICES.map(d => `<option value="${d}"${String(selected) === String(d) ? ' selected' : ''}>${esc(t['t' + d])}</option>`).join('') + `<option value="custom"${selected === 'custom' ? ' selected' : ''}>${esc(t.tCustom)}</option>`;
  }

  /* Un document existant (ou un nouveau) devient les valeurs initiales du formulaire. */
  function formState(doc, type) {
    const base = doc ? doc : {type, customer: {}, lines: [], issueDate: today(), termsDays: 30, dueDate: '', validUntil: shift(30), paymentMethod: '', note: '', exemptionMention: ''};
    const c = base.customer || {};
    const terms = base.termsDays != null && TERMS_CHOICES.includes(Number(base.termsDays)) ? String(base.termsDays) : (base.dueDate ? 'custom' : '30');
    return {
      pick: '', kind: (c.ice || c.if) ? 'business' : 'person',
      name: c.name || '', addr: c.address || '', ice: c.ice || '', if: c.if || '', email: c.email || '', phone: c.phone || '', clientId: c.clientId || '',
      issue: base.issueDate || today(), terms, due: base.dueDate || '', valid: base.validUntil || shift(30),
      method: base.paymentMethod || '', note: base.note || '', exempt: base.exemptionMention || '',
      lines: (base.lines && base.lines.length ? base.lines : [null]).map(l => l ? ({description: l.description || '', qty: String(l.qty ?? 1).replace('.', ','), unit: centsInput(l.unitHT), disc: l.discountPct ? String(l.discountPct).replace('.', ',') : '', vat: Number(l.vatRate)}) : blankLine()),
    };
  }
  const draftKey = () => 'kiwi:invoicing:draft:v2:' + venueId() + ':' + cmp.type + ':' + (cmp.id || 'new');

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
    overlay.querySelector('[data-inv-compose]').innerHTML = `<div class="inv-composer-head"><div><button class="inv-btn small" type="button" data-inv-act="back">${ICON.back}${esc(t.back)}</button></div><div class="inv-step">${esc(cmp.number || t.draftNo)} · ${esc(t.autosave)}</div></div>
      <h3 class="inv-compose-title" data-compose-title>${esc(title)}</h3>
      ${locked && cmp.reason ? `<p class="inv-foot-note">${esc(t.reason)} : ${esc(cmp.reason)}</p>` : ''}
      <div class="inv-form-grid"><div>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.customerBlock)}</h4>
          ${book.length && !locked ? `<div class="inv-field wide inv-pick"><label for="inv-f-pick">${esc(t.pickClient)}</label><select id="inv-f-pick" data-f="pick"><option value="">${esc(t.pickNone)}</option>${book.slice(0, 400).map((c, i) => `<option value="${i}">${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('')}</select></div>` : ''}
          <div class="inv-fields">
            <div class="inv-field"><label for="inv-f-name">${esc(t.clientName)}</label><input id="inv-f-name" data-f="name" autocomplete="organization" value="${esc(st.name)}"${dis}></div>
            <div class="inv-field"><label for="inv-f-kind">${esc(t.kind)}</label><select id="inv-f-kind" data-f="kind"${dis}><option value="person"${st.kind === 'person' ? ' selected' : ''}>${esc(t.kindPerson)}</option><option value="business"${st.kind === 'business' ? ' selected' : ''}>${esc(t.kindBusiness)}</option></select></div>
            <div class="inv-field wide"><label for="inv-f-addr">${esc(t.address)}</label><input id="inv-f-addr" data-f="addr" autocomplete="street-address" value="${esc(st.addr)}"${dis}></div>
            <div class="inv-field"><label for="inv-f-ice" data-ice-label>${esc(st.kind === 'business' ? t.iceRequired : t.ice)}</label><input id="inv-f-ice" data-f="ice" inputmode="numeric" autocomplete="off" value="${esc(st.ice)}" aria-describedby="inv-f-ice-msg"${dis}><p class="inv-field-msg" id="inv-f-ice-msg" data-ice-msg role="status"></p></div>
            <div class="inv-field"><label for="inv-f-if">${esc(t.ifLabel)}</label><input id="inv-f-if" data-f="if" inputmode="numeric" value="${esc(st.if)}"${dis}></div>
            <div class="inv-field"><label for="inv-f-email">${esc(t.email)}</label><input id="inv-f-email" data-f="email" type="email" autocomplete="email" value="${esc(st.email)}"${dis}></div>
            <div class="inv-field"><label for="inv-f-phone">${esc(t.phone)}</label><input id="inv-f-phone" data-f="phone" type="tel" autocomplete="tel" value="${esc(st.phone)}"${dis}></div>
          </div></section>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.datesBlock)}</h4><div class="inv-fields">
          <div class="inv-field"><label for="inv-f-issue">${esc(t.issueDate)}</label><input id="inv-f-issue" data-f="issue" type="date" value="${esc(st.issue)}"></div>
          ${isQuote
            ? `<div class="inv-field"><label for="inv-f-valid">${esc(t.validUntil)}</label><input id="inv-f-valid" data-f="valid" type="date" value="${esc(st.valid)}"></div>`
            : `<div class="inv-field"><label for="inv-f-terms">${esc(t.terms)}</label><select id="inv-f-terms" data-f="terms">${termsOptions(st.terms)}</select></div>
               <div class="inv-field" data-due-wrap><label for="inv-f-due">${esc(t.due)}</label><input id="inv-f-due" data-f="due" type="date" value="${esc(st.due)}"></div>`}
          ${isQuote ? '' : `<div class="inv-field"><label for="inv-f-method">${esc(t.method)}</label><select id="inv-f-method" data-f="method"><option value=""></option>${METHODS.map(m => `<option value="${m}"${st.method === m ? ' selected' : ''}>${esc(t[m])}</option>`).join('')}</select></div>`}
        </div></section>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.lines)}</h4><div data-inv-lines></div><button class="inv-add-line" type="button" data-inv-act="add-line">${esc(t.addLine)}</button></section>
        <section class="inv-form-card"><h4 class="inv-section-title">${esc(t.noteBlock)}</h4><div class="inv-fields">
          <div class="inv-field wide"><label for="inv-f-note">${esc(t.note)}</label><textarea id="inv-f-note" data-f="note" placeholder="${esc(t.notePh)}">${esc(st.note)}</textarea></div>
          <div class="inv-field wide" data-exempt-wrap hidden><label for="inv-f-exempt">${esc(t.exemptionMention)}</label><input id="inv-f-exempt" data-f="exempt" value="${esc(st.exempt)}" placeholder="${esc(t.exemptionPh)}"><p class="inv-field-msg warn">${esc(t.exemptionNeed)}</p></div>
        </div></section>
      </div><aside class="inv-summary-card"><div class="inv-summary-brand"><div class="inv-summary-logo">${renderSellerLogo(seller, 28)}</div><span class="inv-summary-no">${esc(cmp.number || t.draftNo)}</span></div>
        <div class="inv-summary-body"><div class="inv-summary-row"><span>${esc(t.totalHT)}</span><strong data-sum="ht">0,00 MAD</strong></div><div data-sum-rates></div><div class="inv-summary-row total"><span>${esc(t.totalTTC)}</span><strong data-sum="ttc">0,00 MAD</strong></div></div>
        <p class="inv-assurance">${esc(t.previewNote)}</p></aside></div>
      <div class="inv-form-actions"><button class="inv-btn" type="button" data-inv-act="save-draft">${esc(cmp.id && cmp.status !== 'draft' ? t.save : t.saveDraft)}</button>${showIssue ? `<button class="inv-btn primary" type="button" data-inv-act="issue-composer">${ICON.check}${esc(issueLabel)}</button>` : ''}</div>`;
    paintLines(st.lines);
    if (restored) toast(t.restored);
    show('compose'); updateComposer(); checkIce();
    requestAnimationFrame(() => (locked ? overlay.querySelector('.inv-line-row input') : F('name'))?.focus());
  }

  function composerPayload() {
    const t = fv('terms');
    const lines = apiLines(readLines());
    const payload = {
      type: cmp.type,
      customer: {name: fv('name'), address: fv('addr'), ice: iceCompact(fv('ice')), if: fv('if'), email: fv('email'), phone: fv('phone'), clientId: cmp.clientId || ''},
      lines, issueDate: fv('issue') || today(), note: fv('note'), exemptionMention: fv('exempt'),
    };
    if (cmp.id) payload.id = cmp.id;
    if (cmp.type === 'quote') payload.validUntil = fv('valid') || shift(30);
    else {
      if (t === 'custom') payload.dueDate = fv('due'); else payload.termsDays = Number(t || 0);
      payload.paymentMethod = fv('method');
    }
    return payload;
  }
  function formSnapshot() {
    return {pick: '', kind: fv('kind'), name: fv('name'), addr: fv('addr'), ice: fv('ice'), if: fv('if'), email: fv('email'), phone: fv('phone'), clientId: cmp.clientId || '',
      issue: fv('issue'), terms: fv('terms'), due: fv('due'), valid: fv('valid'), method: fv('method'), note: fv('note'), exempt: fv('exempt'), lines: readLines()};
  }
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { if (overlay && cmp && currentView === 'compose') lsSet(draftKey(), JSON.stringify({savedAt: Date.now(), state: formSnapshot()})); }, 500);
  }
  function checkIce() {
    const el = F('ice'), msg = overlay?.querySelector('[data-ice-msg]'); if (!el || !msg) return null;
    const t = T(), p = el.disabled ? null : iceProblem(el.value);
    el.toggleAttribute('aria-invalid', !!p); if (p) el.setAttribute('aria-invalid', 'true');
    msg.className = 'inv-field-msg' + (p ? ' err' : '');
    msg.textContent = p ? ({digits: t.iceDigits, length: t.iceLength, checksum: t.iceChecksum}[p] || t.errIce) : (iceCompact(el.value) ? t.iceOk : '');
    return p;
  }
  function updateComposer() {
    if (!overlay || currentView !== 'compose') return;
    const t = T();
    const rows = readLines(), lines = apiLines(rows);
    overlay.querySelectorAll('.inv-line-row').forEach((row, i) => {
      const r = rows[i];
      row.querySelector('[data-l="total"]').textContent = money(lineHT({qty: num(r.qty), unitHT: toCents(r.unit), discountPct: Math.min(100, num(r.disc))}));
    });
    const sums = computeTotals(lines);
    overlay.querySelector('[data-sum="ht"]').textContent = money(sums.htCents) + ' MAD';
    overlay.querySelector('[data-sum="ttc"]').textContent = money(sums.ttcCents) + ' MAD';
    overlay.querySelector('[data-sum-rates]').innerHTML = sums.byRate.map(r => `<div class="inv-summary-row" data-rate="${r.rate}"><span>${esc(tpl(t.vatOn, {rate: r.rate, base: money(r.baseCents)}))}</span><strong>${money(r.vatCents)} MAD</strong></div>`).join('');
    const wrap = overlay.querySelector('[data-exempt-wrap]');
    if (wrap) wrap.hidden = !lines.some(l => l.vatRate === 0);
    const dueWrap = overlay.querySelector('[data-due-wrap]');
    if (dueWrap) {
      const terms = fv('terms'), input = F('due');
      if (terms === 'custom') { input.disabled = false; }
      else { input.disabled = true; input.value = shift(Number(terms || 0), fv('issue') || today()); }
    }
  }

  function validateComposer(forIssue) {
    const t = T(), p = composerPayload();
    if (!p.customer.name) { toast(t.errCustomer); F('name')?.focus(); return null; }
    if (checkIce()) { toast(t.errIce); F('ice')?.focus(); return null; }
    if (!p.lines.some(l => l.description && l.qty > 0)) { toast(t.errLines); return null; }
    if (forIssue && p.lines.some(l => l.vatRate === 0) && !p.exemptionMention && !p.note) { toast(t.errExempt); F('exempt')?.focus(); return null; }
    return p;
  }
  function setBusy(on) {
    busy = on;
    overlay?.querySelectorAll('[data-inv-act="save-draft"],[data-inv-act="issue-composer"]').forEach(b => { b.disabled = on; b.setAttribute('aria-busy', String(on)); });
  }
  async function saveComposer(thenIssue) {
    if (busy) return;
    const t = T(), p = validateComposer(thenIssue); if (!p) return;
    if (thenIssue) {
      const kindBody = cmp.type === 'quote' ? [t.issueQuoteTitle, t.issueQuoteBody] : cmp.type === 'credit_note' ? [t.issueCreditTitle, t.issueCreditBody] : [t.issueInvoiceTitle, t.issueInvoiceBody];
      const warn = fv('kind') === 'business' && !p.customer.ice && cmp.type !== 'quote' ? t.iceMissing : '';
      const yes = await openSheet({title: kindBody[0], body: kindBody[1], notice: warn, confirm: cmp.type === 'quote' ? t.sendQuote : cmp.type === 'credit_note' ? t.issueCredit : t.issueInvoice});
      if (!yes) return;
    }
    const staleKey = draftKey();
    clearTimeout(autosaveTimer);
    setBusy(true);
    try {
      /* Un document émis ne se réécrit pas : seul un devis reste modifiable. */
      let doc;
      if (!(cmp.id && cmp.status !== 'draft' && cmp.type !== 'quote')) {
        const res = await api('POST', Object.assign({action: 'save'}, p));
        doc = normDoc(docFrom(res)); cmp.id = doc.id; cmp.status = doc.status;
      }
      if (thenIssue) {
        const res = await api('POST', {action: 'issue', id: cmp.id});
        doc = normDoc(docFrom(res) || doc);
      }
      clearTimeout(autosaveTimer); lsDel(staleKey); lsDel(draftKey());
      cmp.id = doc.id;
      toast(thenIssue ? tpl(t.issuedOk, {n: doc.number}) : (cmp.type === 'quote' && doc.number ? t.quoteUpdated : t.savedDraft));
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
    const paymentsHtml = type === 'invoice' && issued ? `<section class="inv-detail-card" data-payments><h4 class="inv-section-title">${esc(t.paymentsTitle)}</h4>${d.payments.length ? `<ul class="inv-pay-list">${d.payments.map(p => `<li><div><strong>${money(pick(p, 'amountCents', 'amount_cents'))} MAD</strong><span>${esc(fmtDate(p.date))} · ${esc(t[p.method] || p.method || '')}${p.reference ? ' · ' + esc(p.reference) : ''}</span></div><button class="inv-line-remove" type="button" data-inv-act="delete-payment" data-pid="${esc(p.id)}" aria-label="${esc(t.deletePayment)}">${ICON.trash}</button></li>`).join('')}</ul>` : `<p class="inv-foot-note">${esc(t.noPayments)}</p>`}<div class="inv-summary-row"><span>${esc(t.balance)}</span><strong data-balance>${money(d.balanceCents)} MAD</strong></div></section>` : '';
    const creditsHtml = type === 'invoice' && d.creditNotes.length ? `<section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.creditNotesTitle)}</h4><ul class="inv-pay-list">${d.creditNotes.map(c => `<li><div><strong>${esc(c.number)}</strong><span>${esc(fmtDate(c.issueDate))} · ${money(pick(c, 'ttcCents', 'ttc_cents'))} MAD</span></div><button class="inv-btn small" type="button" data-inv-act="open-doc" data-id="${esc(c.id)}">${esc(t.view)}</button></li>`).join('')}</ul></section>` : '';
    const paidBlock = type === 'invoice' && issued ? `<div class="inv-summary-row"><span>${esc(t.paid)}</span><strong>${money(Math.max(0, (doc.totals?.ttcCents || 0) - d.balanceCents))} MAD</strong></div><div class="inv-summary-row"><span>${esc(t.balance)}</span><strong>${money(d.balanceCents)} MAD</strong></div>` : '';
    const timeline = `${doc.createdTs ? `<div class="inv-time"><strong>${esc(t.createdOn)}</strong>${esc(fmtDate(dayIn(doc.createdTs)))}</div>` : ''}${doc.sentTs ? `<div class="inv-time"><strong>${esc(t.sentOn)}</strong>${esc(fmtDate(dayIn(doc.sentTs)))}</div>` : ''}${doc.legacyRef ? `<div class="inv-time"><strong>${esc(tpl(t.legacyRef, {ref: doc.legacyRef}))}</strong></div>` : ''}`;
    overlay.querySelector('[data-inv-detail]').innerHTML = `<div class="inv-composer-head"><button class="inv-btn small" type="button" data-inv-act="back">${ICON.back}${esc(t.back)}</button><div>${statusHtml(type, ds)}</div></div>
      <div class="inv-detail-grid"><article class="inv-preview${draft ? ' is-draft' : ''}" data-doc-type="${esc(type)}" data-doc-id="${esc(doc.id)}">${draft ? `<div class="inv-watermark" aria-hidden="true">${esc(t.draftNo.toUpperCase())}</div>` : ''}
        <div class="inv-preview-top"><div><div class="inv-preview-logo">${renderSellerLogo(seller, 40)}</div><div class="inv-preview-meta"><strong>${esc(biz)}</strong></div></div><div class="inv-preview-head"><h3 class="inv-preview-title" data-doc-number>${esc(docWord(type))} ${esc(draft ? t.draftNo : doc.number)}</h3><div class="inv-preview-meta">${dateMeta}</div></div></div>
        ${creditRef}
        <div class="inv-preview-parties"><div><div class="inv-preview-label">${esc(t.from)}</div><div class="inv-preview-party">${sellerLines(seller)}</div></div><div><div class="inv-preview-label">${esc(t.billTo)}</div><div class="inv-preview-party">${customerLines(doc.customer)}</div></div></div>
        <div class="inv-table-wrap"><table class="inv-preview-table"><thead><tr><th>${esc(t.item)}</th><th>${esc(t.qty)}</th><th>${esc(t.unitHT)}</th><th>${esc(t.discount)}</th><th>${esc(t.vat)}</th><th>${esc(t.lineHT)}</th></tr></thead><tbody>${itemsHtml}</tbody></table></div>
        <div class="inv-preview-totals">${totalsBlock(doc)}${paidBlock}</div>
        ${doc.exemptionMention ? `<div class="inv-preview-note"><strong>${esc(t.exemptionMention)}</strong><br>${esc(doc.exemptionMention)}</div>` : ''}
        ${doc.note ? `<div class="inv-preview-note"><strong>${esc(t.message)}</strong><br>${esc(doc.note)}</div>` : ''}
        ${draft ? `<div class="inv-preview-note">${esc(t.draftBadge)}</div>` : ''}
      </article><aside class="inv-detail-side"><section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.detail)}</h4><div class="inv-detail-actions">${out.join('')}</div></section>${paymentsHtml}${creditsHtml}
        ${issued ? `<section class="inv-detail-card"><h4 class="inv-section-title">${esc(t.internalNote)}</h4><div class="inv-field"><textarea data-f="internal" aria-label="${esc(t.internalNote)}" placeholder="${esc(t.internalNotePh)}">${esc(doc.internalNote)}</textarea></div><button class="inv-btn small" type="button" data-inv-act="save-internal">${esc(t.saveInternal)}</button></section>` : ''}
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
    const yes = await openSheet({title: body[0], body: body[1], confirm: body[2]});
    if (!yes) return;
    await run(() => post({action: 'issue', id: doc.id}), null, async (res) => { toast(tpl(t.issuedOk, {n: normDoc(docFrom(res)).number})); await openDetail(doc.id); });
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
  function termsText(doc) {
    const t = T();
    if (doc.type === 'quote') return '';
    let days = doc.termsDays;
    if ((days == null || days === '') && doc.issueDate && doc.dueDate) days = Math.round((new Date(doc.dueDate + 'T12:00:00') - new Date(doc.issueDate + 'T12:00:00')) / 86400000);
    if (days == null || days === '' || !isFinite(days)) return '';
    return Number(days) === 0 ? t.t0 : (t['t' + days] || tpl(t.t30.replace(/\d+/, '{n}'), {n: days}));
  }
  function printable(doc, extra) {
    /* Pas KiwiInvoice.html : ce gabarit-là est celui d'une vente de comptoir
     * acquittée (« Payée », prix TTC). Un document saisi ici a des prix HT, une
     * échéance et peut être impayé : il garde son propre gabarit. */
    extra = extra || {};
    const t = T(), draft = doc.status === 'draft', type = doc.type;
    const seller = doc.seller && !draft ? doc.seller : getSeller(), biz = seller.name || businessName();
    const tot = doc.totals && doc.totals.byRate ? doc.totals : computeTotals(doc.lines);
    const rtl = lang() === 'ar';
    const title = {invoice: {fr: 'FACTURE', en: 'INVOICE', ar: 'فاتورة'}, quote: {fr: 'DEVIS', en: 'QUOTE', ar: 'عرض سعر'}, credit_note: {fr: 'AVOIR', en: 'CREDIT NOTE', ar: 'إشعار دائن'}}[type][lang()] || 'FACTURE';
    const sellerBlock = [
      `<strong>${esc(seller.legalName || biz)}</strong>`,
      [seller.address, seller.city].filter(Boolean).map(esc).join(', '),
      seller.phone ? `Tél : ${esc(seller.phone)}` : '',
      seller.email ? esc(seller.email) : '',
      seller.ice ? `<b>ICE :</b> ${esc(seller.ice)}` : '',
      (seller.if || seller.fiscal) ? `<b>IF :</b> ${esc(seller.if || seller.fiscal)}` : '',
      seller.rc ? `<b>RC :</b> ${esc(seller.rc)}` : '',
      seller.patente ? `<b>Patente :</b> ${esc(seller.patente)}` : '',
    ].filter(Boolean).join('<br>');
    const c = doc.customer || {};
    const customerBlock = [
      `<strong>${esc(c.name || '')}</strong>`, c.address ? esc(c.address) : '',
      c.ice ? `<b>ICE :</b> ${esc(c.ice)}` : '', c.if ? `<b>IF :</b> ${esc(c.if)}` : '',
      c.email ? esc(c.email) : '', c.phone ? esc(c.phone) : '',
    ].filter(Boolean).join('<br>');
    const numberText = draft || !doc.number ? '' : esc(doc.number);
    const dates = [`${esc(t.issuedOn)} : ${esc(dmy(doc.issueDate))}`];
    if (type === 'invoice' && doc.dueDate) dates.push(`${esc(t.dueOn)} : ${esc(dmy(doc.dueDate))}`);
    if (type === 'quote' && doc.validUntil) dates.push(`${esc(t.validOn)} : ${esc(dmy(doc.validUntil))}`);
    const rows = (doc.lines || []).map(l => `<tr><td>${esc(l.description)}</td><td>${esc(String(l.qty).replace('.', ','))}</td><td>${money(l.unitHT)}</td><td>${Number(l.discountPct) ? esc(String(l.discountPct).replace('.', ',')) + ' %' : '·'}</td><td>${Number(l.vatRate)} %</td><td>${money(lineHT(l))}</td></tr>`).join('');
    const vatRows = tot.byRate.map(r => `<div class="row"><span>${esc(tpl(t.vatOn, {rate: r.rate, base: money(r.baseCents)}))}</span><b>${money(r.vatCents)} MAD</b></div>`).join('');
    const paid = extra.paidCents != null ? extra.paidCents : 0;
    const settle = type === 'invoice' && !draft && paid > 0 ? `<div class="row"><span>${esc(t.paid)}</span><b>${money(paid)} MAD</b></div><div class="row"><span>${esc(t.balance)}</span><b>${money(extra.balanceCents != null ? extra.balanceCents : Math.max(0, tot.ttcCents - paid))} MAD</b></div>` : '';
    const creditRef = type === 'credit_note' ? `<div class="mention">${esc(extra.originalDate ? tpl(t.creditOnDate, {n: doc.originalNumber || '', date: dmy(extra.originalDate)}) : tpl(t.creditOn, {n: doc.originalNumber || ''}))}${doc.reason ? `<br>${esc(t.reason)} : ${esc(doc.reason)}` : ''}</div>` : '';
    const terms = termsText(doc), method = doc.paymentMethod ? t[doc.paymentMethod] || doc.paymentMethod : '';
    const payLine = [terms ? `${esc(t.terms)} : ${esc(terms)}` : '', method ? `${esc(t.method)} : ${esc(method)}` : ''].filter(Boolean).join(' · ');
    const mark = {fr: 'BROUILLON · sans valeur fiscale', en: 'DRAFT · no tax value', ar: 'مسودة · دون قيمة جبائية'}[lang()] || 'BROUILLON · sans valeur fiscale';
    return `<!doctype html><html lang="${esc(lang())}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><base href="${esc(document.baseURI)}"><title>${esc(title)} ${numberText || esc(t.draftNo)}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box;font-style:normal}body{font:12.5px "Inter Tight",Arial,"IBM Plex Sans Arabic",sans-serif;color:#102019;margin:0;position:relative}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #087653;padding-bottom:20px}.logo img{display:block;width:auto;height:32px}.meta{color:#69746e;line-height:1.6;margin-top:7px}h1{margin:0;font-size:26px;letter-spacing:.02em}.num{font-size:15px;font-weight:600;margin-top:4px}.head{text-align:${rtl ? 'left' : 'right'}}.parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:24px 0}.label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#777;margin-bottom:8px}.party{line-height:1.55}.party strong{font-size:13px}table{width:100%;border-collapse:collapse}th{background:#f1f6f3;text-align:${rtl ? 'right' : 'left'};color:#65716b;padding:9px 8px;font-size:11px}td{padding:10px 8px;border-bottom:1px solid #e2e8e4}th:not(:first-child),td:not(:first-child){text-align:${rtl ? 'left' : 'right'}}.totals{width:320px;margin-top:18px;margin-inline-start:auto}.row{display:flex;justify-content:space-between;gap:12px;padding:6px 0}.row.total{border-top:2px solid #087653;margin-top:8px;padding-top:12px;font-size:17px;font-weight:700;color:#087653}.note,.mention{margin-top:22px;background:#f3f7f5;border-${rtl ? 'right' : 'left'}:3px solid #087653;padding:12px 14px;color:#58645e;line-height:1.5}.pay{margin-top:18px;color:#58645e}.watermark{position:fixed;top:42%;left:0;right:0;text-align:center;font-size:54px;font-weight:600;letter-spacing:.06em;color:rgba(180,54,41,.16);transform:rotate(-18deg);pointer-events:none}.foot{position:fixed;bottom:0;color:#849089;font-size:10px}</style></head><body>${draft ? `<div class="watermark">${esc(mark)}</div>` : ''}<div class="top"><div><div class="logo">${renderSellerLogo(seller, 32)}</div><div class="meta"><strong>${esc(biz)}</strong></div></div><div class="head"><h1>${esc(title)}</h1>${numberText ? `<div class="num">${numberText}</div>` : ''}<div class="meta">${dates.join('<br>')}</div></div></div>${creditRef}<div class="parties"><div><div class="label">${esc(t.from)}</div><div class="party">${sellerBlock}</div></div><div><div class="label">${esc(t.billTo)}</div><div class="party">${customerBlock}</div></div></div><table><thead><tr><th>${esc(t.item)}</th><th>${esc(t.qty)}</th><th>${esc(t.unitHT)}</th><th>${esc(t.discount.replace(/\s*%/, ''))}</th><th>${esc(t.vat)} %</th><th>${esc(t.lineHT)}</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="row"><span>${esc(t.totalHT)}</span><b>${money(tot.htCents)} MAD</b></div>${vatRows}<div class="row total"><span>${esc(t.totalTTC)}</span><span>${money(tot.ttcCents)} MAD</span></div>${settle}</div>${doc.exemptionMention ? `<div class="mention">${esc(t.exemptionMention)} : ${esc(doc.exemptionMention)}</div>` : ''}${payLine ? `<div class="pay">${payLine}</div>` : ''}${doc.note ? `<div class="note">${esc(doc.note)}</div>` : ''}<div class="foot">${esc(biz)} · ${esc(title)} ${numberText || esc(t.draftNo)}</div><script>addEventListener('load',()=>setTimeout(()=>print(),150))<\/script></body></html>`;
  }
  /* print:end */
  function printDocument() {
    if (!detail) return;
    const d = detail, doc = d.doc;
    const extra = {paidCents: Math.max(0, (doc.totals?.ttcCents || 0) - d.balanceCents), balanceCents: d.balanceCents, originalDate: d.original ? d.original.issueDate : ''};
    if (doc.type === 'invoice') extra.paidCents = d.payments.reduce((s, p) => s + (Number(pick(p, 'amountCents', 'amount_cents')) || 0), 0);
    const win = window.open('', '_blank'); if (!win) { toast(T().printBlocked); return; }
    win.document.open(); win.document.write(printable(doc, extra)); win.document.close();
    /* Un document est du papier, pas une extension du thème du tableau de bord :
       la page et ses marges restent claires même si la fenêtre mère est sombre. */
    win.document.documentElement.style.cssText += ';color-scheme:light;background:#fff;color:#102019';
    if (win.document.body) win.document.body.style.cssText += ';background:#fff;color:#102019';
  }

  /* ── export CSV de l'onglet courant ───────────────────────────────────── */
  /* ICE et numéros restent du texte : un tableur transforme 001561191000066 en
     1,56119E+14. ="…" force le texte, mais seulement sur des chiffres vérifiés. */
  function csvCell(v, asText) {
    let s = String(v == null ? '' : v);
    if (asText && /^\d+$/.test(s)) return '="' + s + '"';
    /* Même cité, un tableur exécute une cellule qui commence par = + - @ : les
       noms de clients sont des données non fiables. */
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportCsv() {
    const t = T(), rows = visibleRows();
    let head, body;
    if (tab === 'sales') {
      head = [t.colNo, t.colCustomer, t.colIssued, t.colDue, t.colStatus, t.colAmount];
      body = rows.map(r => [r.id, r.customer, r.issueDate, r.dueDate, t.stPaid, csvMoney(Math.round((Number(r.total) || 0) * 100))]);
    } else if (tab === 'quote') {
      head = [t.colNo, t.colCustomer, 'ICE', t.colIssued, t.colValid, t.colStatus, t.colAmount];
      body = rows.map(r => [NO_OF(r), r.customer.name, r.customer.ice, r.issueDate, r.validUntil || r.dueDate, statusLabel(r.type, r.displayStatus), csvMoney(r.ttcCents)]);
    } else if (tab === 'credit_note') {
      head = [t.colNo, t.docInvoice, t.colCustomer, 'ICE', t.colIssued, t.colStatus, t.colAmount];
      body = rows.map(r => [NO_OF(r), r.originalNumber, r.customer.name, r.customer.ice, r.issueDate, statusLabel(r.type, r.displayStatus), csvMoney(r.ttcCents)]);
    } else {
      head = [t.colNo, t.colCustomer, 'ICE', t.colIssued, t.colDue, t.colStatus, t.colAmount, t.balance];
      body = rows.map(r => [NO_OF(r), r.customer.name, r.customer.ice, r.issueDate, r.dueDate, statusLabel(r.type, r.displayStatus), csvMoney(r.ttcCents), csvMoney(r.balanceCents)]);
    }
    const iceCol = head.indexOf('ICE');
    const csv = '﻿' + [head].concat(body).map((row, ri) => row.map((v, ci) => csvCell(v, ri > 0 && ci === iceCol && iceCol >= 0)).join(';')).join('\r\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'kiwi-' + ({invoice: 'factures', quote: 'devis', credit_note: 'avoirs', sales: 'factures-vente'}[tab]) + '-' + today() + '.csv';
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(t.exported);
    return csv;
  }

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
    if (e.target.matches('[data-f="kind"]')) { const t = T(); overlay.querySelector('[data-ice-label]').textContent = e.target.value === 'business' ? t.iceRequired : t.ice; }
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
    window.Kiwi.handlers['invoicing'] = open;
    window.KiwiInvoicing = {open, list: () => TYPES.reduce((a, ty) => a.concat(cache[ty].map(x => Object.assign({}, x))), []), version: '2.0.0'};
    updatePill();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once: true}); else install();
  window.addEventListener('kiwi:langchange', updatePill);
})();
