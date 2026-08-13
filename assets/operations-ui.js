/* Kiwi Operations UI — small real workflows on existing dashboard controls.
 * Loaded last, after the legacy demo handlers, so real merchants never see a
 * decorative success. Demo fixtures remain available only in demo mode. */
(function () {
  'use strict';
  function boot() {
    if (!window.Kiwi || !window.Kiwi.handlers || !window.KiwiOperations) return setTimeout(boot, 80);
    var Kiwi = window.Kiwi, H = Kiwi.handlers, O = window.KiwiOperations, K = window.KiwiPlatform;
    function lang() { var value = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang(); return value === 'en' || value === 'ar' ? value : 'fr'; }
    function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
    function real() { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal() || window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()); } catch (_) { return true; } }
    function text() {
      return ({
        fr: {
          blocked:'Action conservée, connexion requise', blockedD:'Le fournisseur nécessaire n’est pas configuré. Rien n’a été annoncé comme envoyé.',
          queued:'Action protégée hors ligne', queuedD:'Kiwi la synchronisera avec le même identifiant dès le retour du réseau.',
          draft:'Brouillon enregistré', draftD:'Le document est durable et reste modifiable avant validation.',
          prepared:'Fichier préparé', preparedD:'Le document est prêt. Aucun destinataire n’a été contacté.',
          payment:'Créer un lien de paiement', amount:'Montant · MAD', desc:'Motif', customer:'Client (facultatif)', create:'Créer le lien',
          unavailable:'Fournisseur de paiement non configuré', unavailableD:'Kiwi a gardé la demande, mais aucun lien n’a été inventé.',
          supplier:'Nouveau bon de commande', supplierPick:'Fournisseur', item:'Article / matière', qty:'Quantité', cost:'Coût unitaire · MAD', due:'Livraison souhaitée', note:'Note', save:'Enregistrer le brouillon',
          needSupplier:'Ajoutez d’abord un fournisseur dans Approvisionnement.', invalid:'Complétez les champs obligatoires.',
          history:'Activité opérationnelle', empty:'Aucune action enregistrée pour le moment.', openOps:'Voir l’activité',
          procTitle:'Approvisionnement', procSub:'Bons de commande durables · réception, facture, retours',
          procDenied:'Droit d’achat requis', procDeniedD:'Votre session ne peut pas écrire dans le livre des achats. Kiwi le dit avant de vous faire remplir un bon.',
          tabNewPo:'Nouveau bon', tabOrders:'Bons ouverts',
          pSku:'Référence', pLabel:'Désignation', pUnit:'Unité', pAddLine:'Ajouter une ligne', pRemove:'Retirer la ligne',
          pCreate:'Créer le bon de commande', pTotal:'Total', pOrdered:'Commandé', pReceived:'Reçu', pReturned:'Retourné', pOpenQty:'Reste dû',
          pSubmitTitle:'Envoyer au fournisseur', pSubmitHint:'Un bon envoyé ne se renvoie pas : le second envoi serait une seconde commande.',
          pReceiveTitle:'Réception', pReceiveHint:'Saisissez ce qui est réellement entré. Rien n’est écrit si une seule ligne dépasse la quantité commandée.',
          pInvoice:'Montant facturé · MAD (facultatif)', pInvoiceHint:'Renseigné, il doit valoir exactement la marchandise reçue, sinon rien n’est reçu.',
          pReturnTitle:'Retour fournisseur', pReturnHint:'On ne rend que ce qui est entré, et jamais deux fois.',
          pRun:'Enregistrer', pDone:'Livre des achats mis à jour.', pLoading:'Lecture du livre des achats…',
          pNoOrders:'Aucun bon de commande ouvert.', pRefresh:'Rafraîchir', pOrderCreated:'Bon de commande créé',
          pStatus:{ draft:'Brouillon', submitted:'Envoyé', partial:'Partiel', received:'Reçu' },
          payTitle:'Paie', paySub:'Bulletins calculés · CNSS, AMO, IGR · écriture au journal',
          payDenied:'Droit de paie requis', payDeniedD:'Les salaires ne se lisent pas avec une session de gérant. Seul le compte propriétaire — ou un opérateur Kiwi — ouvre la paie.',
          tabPrepare:'Calculer', tabBook:'Livre de paie',
          payPeriod:'Mois de paie', payTeam:'Reprendre l’équipe', payMember:'Salarié', payId:'Matricule',
          payBase:'Base · MAD', payOt:'Heures sup · MAD', payBonus:'Prime · MAD', payAdvance:'Avance · MAD', payDeps:'Charges de famille',
          payAddRow:'Ajouter un salarié', payRemoveRow:'Retirer', payRun:'Calculer les bulletins',
          payHint:'Le calcul retient la CNSS plafonnée, l’AMO, les frais professionnels et l’IGR par tranches. Rien n’est envoyé à personne : les bulletins restent dans Kiwi tant que vous ne les comptabilisez pas.',
          payGross:'Brut', payNet:'Net à payer', payCnss:'CNSS', payAmo:'AMO', payIgr:'IGR',
          payEmployer:'Charges patronales', payHeads:'Salariés', payRates:'Jeu de taux',
          payCsv:'Télécharger le livre de paie', payPost:'Comptabiliser la paie',
          payPostHint:'Une écriture équilibrée est passée au journal, datée au dernier jour du mois. Une période comptable verrouillée la refuse.',
          payDeclare:'Déclarer à la CNSS', payDeclareHint:'La déclaration fige la période : les bulletins ne se recalculent plus.',
          payLoading:'Lecture du livre de paie…', payNone:'Aucun bulletin sur cette période.',
          payDone:'Bulletins calculés et enregistrés.', payAlready:'Déjà fait — rien n’a changé.',
          payStatus:{ prepared:'Préparée', exported:'Comptabilisée', declared:'Déclarée' },
          lkTitle:'Paiements', lkSub:'Liens de paiement durables · encaissement, annulation, remboursement',
          lkDenied:'Droit d’encaissement requis', lkDeniedD:'Votre session ne peut pas émettre de lien de paiement. Kiwi le dit avant de vous faire saisir un montant.',
          tabLink:'Nouveau lien', tabLinks:'Liens émis',
          lkHint:'Le lien n’existe que si le fournisseur en renvoie un. Tant qu’il ne répond pas, Kiwi conserve la demande et n’invente aucune adresse.',
          lkNoProvider:'Aucun fournisseur de paiement n’est branché sur ce compte. La demande sera conservée, mais aucun lien ne sera créé.',
          lkLoading:'Lecture du livre des paiements…', lkNone:'Aucun lien de paiement émis.',
          lkAmountK:'Montant', lkPaid:'Encaissé', lkRefunded:'Remboursé', lkRefundable:'Remboursable', lkRefundCount:'Remboursements',
          lkCopy:'Copier le lien', lkCopied:'Lien copié',
          lkSettleTitle:'Relever l’état', lkSettleHint:'Kiwi interroge le fournisseur et recopie ce qu’il annonce — jamais plus que le montant du lien.',
          lkCancelTitle:'Annuler le lien', lkCancelHint:'Un lien déjà encaissé ne s’annule pas : il se rembourse.',
          lkRefundTitle:'Rembourser', lkRefundHint:'On ne rend que ce qui a été encaissé, et jamais deux fois la même somme.',
          lkRefundAmount:'Montant à rembourser · MAD (vide = tout le remboursable)', lkRefundReason:'Motif (facultatif)',
          lkSettle:'Relever', lkCancel:'Annuler le lien', lkRefund:'Rembourser',
          lkDone:'Livre des paiements mis à jour.', lkAlready:'Déjà annulé — rien n’a changé.',
          lkStatus:{ active:'Actif', pending:'En attente', paid:'Payé', 'partially-refunded':'Partiellement remboursé', refunded:'Remboursé', cancelled:'Annulé', expired:'Expiré' },
          acctTitle:'Comptabilité', acctSub:'Écritures durables · plan comptable marocain',
          tabInvoice:'Facture', tabCredit:'Avoir', tabPeriod:'Période', tabJournal:'Journal',
          acctDenied:'Réservé au propriétaire', acctDeniedD:'Seul le compte propriétaire — ou un opérateur Kiwi — peut écrire dans les livres. Votre session n’a pas ce droit, et Kiwi préfère le dire avant de vous faire remplir un formulaire.',
          fDate:'Date', fAmount:'Montant TTC · MAD', fRate:'TVA', fCustomer:'Client (facultatif)', fIssue:'Émettre la facture',
          cInvoice:'Facture à annuler', cAmount:'Montant de l’avoir · MAD', cIssue:'Émettre l’avoir',
          pPeriod:'Mois à verrouiller', pLock:'Verrouiller la période', pHint:'Une période verrouillée refuse toute écriture antérieure, facture comme avoir.',
          jFrom:'Du', jTo:'Au', jRun:'Exporter le journal', jCsv:'Télécharger le CSV', jEmpty:'Aucune écriture sur cette période.',
          jTrunc:'Export trop volumineux pour l’aperçu — seul le résumé est affiché. Réduisez la plage de dates puis relancez.',
          confirmLabel:'Je confirme cette écriture définitive.', confirmNeeded:'Cochez la confirmation avant d’écrire.',
          number:'Numéro', ht:'HT', tva:'TVA', ttc:'TTC', remaining:'Reste à annuler',
          balancedOk:'Équilibré', balancedNo:'Déséquilibré', lines:'écritures',
          account:'Compte', label:'Libellé', debit:'Débit', credit:'Crédit',
          lockedAt:'Verrouillée le', already:'Cette période était déjà verrouillée — rien n’a changé.',
          errs:{
            'date-required':'Date manquante ou invalide.', 'invalid-amount':'Montant invalide.',
            'invalid-tax-rate':'Taux de TVA invalide.', 'range-required':'Plage de dates invalide.',
            'period-required':'Période invalide (AAAA-MM).', 'invoice-not-found':'Facture introuvable.',
            'exceeds-invoice':'L’avoir dépasse le reste à annuler sur cette facture.',
            'numbering-conflict':'Conflit de numérotation — relancez la demande.',
            'unbalanced-entry':'Écriture déséquilibrée — rien n’a été écrit.',
            'confirmation-required':'Confirmation requise.', 'permission-denied':'Accès refusé.',
            'period-locked':'Période verrouillée',
            'owner-session-required':'Lecture réservée au compte propriétaire.', db:'Base indisponible — réessayez.',
            'supplier-required':'Nom du fournisseur manquant.', 'invalid-date':'Date de livraison invalide.',
            'no-lines':'Ajoutez au moins une ligne.', 'too-many-lines':'Trop de lignes (60 au maximum).',
            'sku-required':'Référence manquante sur une ligne.', 'duplicate-sku':'Deux lignes portent la même référence.',
            'invalid-quantity':'Quantité invalide.', 'invalid-price':'Prix unitaire invalide.',
            'po-not-found':'Bon de commande introuvable.', 'line-not-found':'Référence absente de ce bon.',
            'bad-transition':'Ce bon n’est plus au stade brouillon', 'not-submitted':'Ce bon n’attend pas de réception',
            'exceeds-ordered':'La réception dépasse la quantité commandée — rien n’a été écrit.',
            'invoice-mismatch':'La facture ne correspond pas à la marchandise reçue — rien n’a été écrit.',
            'exceeds-received':'Le retour dépasse ce qui est encore détenu.',
            'no-employees':'Ajoutez au moins un salarié.', 'too-many-employees':'Trop de salariés (200 au maximum).',
            'member-required':'Matricule manquant sur une ligne.', 'duplicate-member':'Deux lignes portent le même salarié.',
            'invalid-dependents':'Nombre de charges de famille invalide.',
            'advance-exceeds-gross':'L’avance dépasse le brut du mois.',
            'net-negative':'Le net serait négatif pour ce salarié',
            'no-payslips':'Aucun bulletin calculé sur cette période — calculez-les d’abord.',
            'period-declared':'Période déjà déclarée à la CNSS — les bulletins sont figés.',
            'period-posted':'Période déjà comptabilisée — recalculer changerait une écriture passée.',
            'invalid-rate':'Taux invalide', 'invalid-ceiling':'Plafond CNSS invalide.',
            'reference-required':'Référence du lien manquante.', 'link-not-found':'Ce lien de paiement n’existe pas.',
            'link-already-paid':'Ce lien a déjà encaissé — il se rembourse, il ne s’annule pas.',
            'link-not-paid':'Rien n’a été encaissé sur ce lien — il n’y a rien à rendre.',
            'refund-exceeds-paid':'Le remboursement dépasse ce qui reste remboursable.',
            'refund-number-taken':'Numéro de remboursement déjà pris — renvoyez la demande.',
            'reference-allocation-failed':'Numérotation des liens saturée — renvoyez la demande.',
            'provider-unconfigured':'Aucun fournisseur de paiement branché sur ce compte.',
            'provider-network':'Le fournisseur n’a pas répondu — rien n’a été affirmé.',
            'provider-http':'Le fournisseur a refusé la demande',
            'provider-returned-no-link':'Le fournisseur n’a renvoyé aucun lien valide — Kiwi n’en invente pas.',
            'provider-returned-no-status':'Le fournisseur n’a annoncé aucun état exploitable.',
            'provider-returned-no-amount':'Le fournisseur n’a annoncé aucun montant exploitable.',
            'unsupported-action':'Action inconnue.',
          },
        },
        en: {
          blocked:'Action retained; connection required', blockedD:'The required provider is not configured. Nothing was reported as sent.',
          queued:'Action protected offline', queuedD:'Kiwi will sync it under the same ID when the network returns.',
          draft:'Draft saved', draftD:'The document is durable and editable before approval.',
          prepared:'File prepared', preparedD:'The document is ready. No recipient was contacted.',
          payment:'Create a payment link', amount:'Amount · MAD', desc:'Description', customer:'Customer (optional)', create:'Create link',
          unavailable:'Payment provider not configured', unavailableD:'Kiwi kept the request but did not invent a link.',
          supplier:'New purchase order', supplierPick:'Supplier', item:'Item / material', qty:'Quantity', cost:'Unit cost · MAD', due:'Expected delivery', note:'Note', save:'Save draft',
          needSupplier:'Add a supplier in Procurement first.', invalid:'Complete the required fields.',
          history:'Operational activity', empty:'No operational activity yet.', openOps:'View activity',
          procTitle:'Procurement', procSub:'Durable purchase orders · receipt, invoice, returns',
          procDenied:'Purchasing right required', procDeniedD:'Your session cannot write to the purchase ledger. Kiwi says so before you fill in an order.',
          tabNewPo:'New order', tabOrders:'Open orders',
          pSku:'SKU', pLabel:'Description', pUnit:'Unit', pAddLine:'Add a line', pRemove:'Remove line',
          pCreate:'Create the purchase order', pTotal:'Total', pOrdered:'Ordered', pReceived:'Received', pReturned:'Returned', pOpenQty:'Still due',
          pSubmitTitle:'Send to the supplier', pSubmitHint:'A sent order is not sent twice: the second send would be a second order.',
          pReceiveTitle:'Receipt', pReceiveHint:'Enter what actually arrived. Nothing is written if a single line exceeds what was ordered.',
          pInvoice:'Invoiced amount · MAD (optional)', pInvoiceHint:'If given, it must match the goods received exactly, otherwise nothing is received.',
          pReturnTitle:'Supplier return', pReturnHint:'Only what came in can go back, and never twice.',
          pRun:'Record', pDone:'Purchase ledger updated.', pLoading:'Reading the purchase ledger…',
          pNoOrders:'No open purchase order.', pRefresh:'Refresh', pOrderCreated:'Purchase order created',
          pStatus:{ draft:'Draft', submitted:'Sent', partial:'Partial', received:'Received' },
          payTitle:'Payroll', paySub:'Computed payslips · CNSS, AMO, income tax · journal entry',
          payDenied:'Payroll right required', payDeniedD:'Salaries are not read with a manager session. Only the owner account — or a Kiwi operator — opens payroll.',
          tabPrepare:'Compute', tabBook:'Payroll book',
          payPeriod:'Payroll month', payTeam:'Pull the team', payMember:'Employee', payId:'Staff ID',
          payBase:'Base · MAD', payOt:'Overtime · MAD', payBonus:'Bonus · MAD', payAdvance:'Advance · MAD', payDeps:'Dependents',
          payAddRow:'Add an employee', payRemoveRow:'Remove', payRun:'Compute the payslips',
          payHint:'The computation withholds capped CNSS, AMO, the professional allowance and bracketed income tax. Nothing is sent to anyone: the payslips stay inside Kiwi until you post them.',
          payGross:'Gross', payNet:'Net pay', payCnss:'CNSS', payAmo:'AMO', payIgr:'Income tax',
          payEmployer:'Employer charges', payHeads:'Employees', payRates:'Rate set',
          payCsv:'Download the payroll book', payPost:'Post payroll to the books',
          payPostHint:'A balanced entry is written to the journal, dated the last day of the month. A locked accounting period refuses it.',
          payDeclare:'File with CNSS', payDeclareHint:'Filing freezes the period: payslips can no longer be recomputed.',
          payLoading:'Reading the payroll book…', payNone:'No payslip in this period.',
          payDone:'Payslips computed and stored.', payAlready:'Already done — nothing changed.',
          payStatus:{ prepared:'Prepared', exported:'Posted', declared:'Filed' },
          lkTitle:'Payments', lkSub:'Durable payment links · collection, cancellation, refund',
          lkDenied:'Collection right required', lkDeniedD:'Your session cannot issue a payment link. Kiwi says so before it makes you type an amount.',
          tabLink:'New link', tabLinks:'Issued links',
          lkHint:'The link exists only if the provider returns one. Until it answers, Kiwi keeps the request and invents no address.',
          lkNoProvider:'No payment provider is wired to this account. The request will be kept, but no link will be created.',
          lkLoading:'Reading the payment book…', lkNone:'No payment link issued.',
          lkAmountK:'Amount', lkPaid:'Collected', lkRefunded:'Refunded', lkRefundable:'Refundable', lkRefundCount:'Refunds',
          lkCopy:'Copy the link', lkCopied:'Link copied',
          lkSettleTitle:'Read the state', lkSettleHint:'Kiwi asks the provider and copies what it announces — never more than the link amount.',
          lkCancelTitle:'Cancel the link', lkCancelHint:'A link already collected is not cancelled — it is refunded.',
          lkRefundTitle:'Refund', lkRefundHint:'Only what was collected is given back, and never the same sum twice.',
          lkRefundAmount:'Amount to refund · MAD (empty = the whole refundable)', lkRefundReason:'Reason (optional)',
          lkSettle:'Read', lkCancel:'Cancel the link', lkRefund:'Refund',
          lkDone:'Payment book updated.', lkAlready:'Already cancelled — nothing changed.',
          lkStatus:{ active:'Active', pending:'Pending', paid:'Paid', 'partially-refunded':'Partially refunded', refunded:'Refunded', cancelled:'Cancelled', expired:'Expired' },
          acctTitle:'Accounting', acctSub:'Durable entries · Moroccan chart of accounts',
          tabInvoice:'Invoice', tabCredit:'Credit note', tabPeriod:'Period', tabJournal:'Journal',
          acctDenied:'Owner only', acctDeniedD:'Only the owner account — or a Kiwi operator — can write to the books. Your session does not hold that right, and Kiwi says so before you fill in a form.',
          fDate:'Date', fAmount:'Amount incl. tax · MAD', fRate:'VAT', fCustomer:'Customer (optional)', fIssue:'Issue the invoice',
          cInvoice:'Invoice to credit', cAmount:'Credit-note amount · MAD', cIssue:'Issue the credit note',
          pPeriod:'Month to lock', pLock:'Lock the period', pHint:'A locked period refuses every earlier entry, invoice and credit note alike.',
          jFrom:'From', jTo:'To', jRun:'Export the journal', jCsv:'Download CSV', jEmpty:'No entries in this range.',
          jTrunc:'Export too large to preview — only the summary is shown. Narrow the date range and run it again.',
          confirmLabel:'I confirm this final entry.', confirmNeeded:'Tick the confirmation before writing.',
          number:'Number', ht:'Net', tva:'VAT', ttc:'Total', remaining:'Left to credit',
          balancedOk:'Balanced', balancedNo:'Unbalanced', lines:'entries',
          account:'Account', label:'Label', debit:'Debit', credit:'Credit',
          lockedAt:'Locked on', already:'This period was already locked — nothing changed.',
          errs:{
            'date-required':'Missing or invalid date.', 'invalid-amount':'Invalid amount.',
            'invalid-tax-rate':'Invalid VAT rate.', 'range-required':'Invalid date range.',
            'period-required':'Invalid period (YYYY-MM).', 'invoice-not-found':'Invoice not found.',
            'exceeds-invoice':'The credit note exceeds what is left to credit on this invoice.',
            'numbering-conflict':'Numbering conflict — send the request again.',
            'unbalanced-entry':'Unbalanced entry — nothing was written.',
            'confirmation-required':'Confirmation required.', 'permission-denied':'Access denied.',
            'period-locked':'Period locked',
            'owner-session-required':'Reading is reserved to the owner account.', db:'Database unavailable — try again.',
            'supplier-required':'Supplier name missing.', 'invalid-date':'Invalid delivery date.',
            'no-lines':'Add at least one line.', 'too-many-lines':'Too many lines (60 maximum).',
            'sku-required':'A line is missing its SKU.', 'duplicate-sku':'Two lines carry the same SKU.',
            'invalid-quantity':'Invalid quantity.', 'invalid-price':'Invalid unit price.',
            'po-not-found':'Purchase order not found.', 'line-not-found':'That SKU is not on this order.',
            'bad-transition':'This order is no longer a draft', 'not-submitted':'This order is not awaiting receipt',
            'exceeds-ordered':'The receipt exceeds what was ordered — nothing was written.',
            'invoice-mismatch':'The invoice does not match the goods received — nothing was written.',
            'exceeds-received':'The return exceeds what is still held.',
            'no-employees':'Add at least one employee.', 'too-many-employees':'Too many employees (200 maximum).',
            'member-required':'A line is missing its staff ID.', 'duplicate-member':'Two lines carry the same employee.',
            'invalid-dependents':'Invalid number of dependents.',
            'advance-exceeds-gross':'The advance exceeds this month’s gross.',
            'net-negative':'Net pay would be negative for this employee',
            'no-payslips':'No payslip computed for this period — compute them first.',
            'period-declared':'Period already filed with CNSS — the payslips are frozen.',
            'period-posted':'Period already posted — recomputing would change a past entry.',
            'invalid-rate':'Invalid rate', 'invalid-ceiling':'Invalid CNSS ceiling.',
            'reference-required':'Missing link reference.', 'link-not-found':'This payment link does not exist.',
            'link-already-paid':'This link already collected — it is refunded, not cancelled.',
            'link-not-paid':'Nothing was collected on this link — there is nothing to give back.',
            'refund-exceeds-paid':'The refund exceeds what is still refundable.',
            'refund-number-taken':'Refund number already taken — send the request again.',
            'reference-allocation-failed':'Link numbering saturated — send the request again.',
            'provider-unconfigured':'No payment provider wired to this account.',
            'provider-network':'The provider did not answer — nothing was claimed.',
            'provider-http':'The provider refused the request',
            'provider-returned-no-link':'The provider returned no valid link — Kiwi does not invent one.',
            'provider-returned-no-status':'The provider announced no usable status.',
            'provider-returned-no-amount':'The provider announced no usable amount.',
            'unsupported-action':'Unknown action.',
          },
        },
        ar: {
          blocked:'تم حفظ العملية وتحتاج إلى ربط', blockedD:'المزوّد المطلوب غير مهيأ. لم يدّع Kiwi إرسال أي شيء.',
          queued:'تم حفظ العملية دون اتصال', queuedD:'سيزامنها Kiwi بنفس المعرّف عند عودة الشبكة.',
          draft:'تم حفظ المسودة', draftD:'الوثيقة محفوظة وقابلة للتعديل قبل الاعتماد.',
          prepared:'تم إعداد الملف', preparedD:'الوثيقة جاهزة ولم يتم الاتصال بأي مستلم.',
          payment:'إنشاء رابط دفع', amount:'المبلغ · درهم', desc:'السبب', customer:'العميل (اختياري)', create:'إنشاء الرابط',
          unavailable:'مزوّد الدفع غير مهيأ', unavailableD:'حفظ Kiwi الطلب ولم يخترع رابطًا.',
          supplier:'أمر شراء جديد', supplierPick:'المورد', item:'المادة', qty:'الكمية', cost:'ثمن الوحدة · درهم', due:'موعد التسليم', note:'ملاحظة', save:'حفظ المسودة',
          needSupplier:'أضف موردًا في التوريد أولًا.', invalid:'أكمل الحقول المطلوبة.',
          history:'سجل العمليات', empty:'لا توجد عمليات بعد.', openOps:'عرض السجل',
          procTitle:'التوريد', procSub:'أوامر شراء دائمة · الاستلام والفاتورة والمرتجعات',
          procDenied:'يلزم حق الشراء', procDeniedD:'جلستك لا يمكنها الكتابة في دفتر المشتريات. يقولها Kiwi قبل أن تملأ أمرًا.',
          tabNewPo:'أمر جديد', tabOrders:'الأوامر المفتوحة',
          pSku:'المرجع', pLabel:'البيان', pUnit:'الوحدة', pAddLine:'إضافة سطر', pRemove:'حذف السطر',
          pCreate:'إنشاء أمر الشراء', pTotal:'الإجمالي', pOrdered:'المطلوب', pReceived:'المستلم', pReturned:'المرتجع', pOpenQty:'المتبقي',
          pSubmitTitle:'إرسال إلى المورد', pSubmitHint:'الأمر المرسل لا يُرسل مرتين: الإرسال الثاني طلب ثانٍ.',
          pReceiveTitle:'الاستلام', pReceiveHint:'أدخل ما دخل فعلًا. لا يُكتب شيء إذا تجاوز سطر واحد الكمية المطلوبة.',
          pInvoice:'المبلغ المفوتر · درهم (اختياري)', pInvoiceHint:'إن أدخلته وجب أن يساوي البضاعة المستلمة تمامًا، وإلا لن يُستلم شيء.',
          pReturnTitle:'مرتجع إلى المورد', pReturnHint:'لا يُرد إلا ما دخل، ولا يُرد مرتين.',
          pRun:'تسجيل', pDone:'تم تحديث دفتر المشتريات.', pLoading:'جارٍ قراءة دفتر المشتريات…',
          pNoOrders:'لا يوجد أمر شراء مفتوح.', pRefresh:'تحديث', pOrderCreated:'تم إنشاء أمر الشراء',
          pStatus:{ draft:'مسودة', submitted:'مُرسل', partial:'جزئي', received:'مستلم' },
          payTitle:'الأجور', paySub:'كشوف محسوبة · الضمان الاجتماعي والتأمين الإجباري والضريبة على الدخل · قيد في اليومية',
          payDenied:'يلزم حق الأجور', payDeniedD:'الأجور لا تُقرأ بجلسة مدير. وحده حساب المالك — أو مشغّل Kiwi — يفتح الأجور.',
          tabPrepare:'الاحتساب', tabBook:'دفتر الأجور',
          payPeriod:'شهر الأجور', payTeam:'استدعاء الفريق', payMember:'الأجير', payId:'رقم التسجيل',
          payBase:'الأساسي · درهم', payOt:'ساعات إضافية · درهم', payBonus:'منحة · درهم', payAdvance:'تسبيق · درهم', payDeps:'الأشخاص المتكفَّل بهم',
          payAddRow:'إضافة أجير', payRemoveRow:'حذف', payRun:'احتساب الكشوف',
          payHint:'يقتطع الاحتساب الضمان الاجتماعي في حدود السقف، والتأمين الإجباري، والمصاريف المهنية، والضريبة على الدخل حسب الشرائح. لا يُرسل شيء إلى أحد: تبقى الكشوف داخل Kiwi حتى تُقيّدها.',
          payGross:'الإجمالي', payNet:'الصافي المستحق', payCnss:'الضمان الاجتماعي', payAmo:'التأمين الإجباري', payIgr:'الضريبة على الدخل',
          payEmployer:'مساهمات المشغّل', payHeads:'الأجراء', payRates:'جدول النسب',
          payCsv:'تحميل دفتر الأجور', payPost:'تقييد الأجور في الدفاتر',
          payPostHint:'يُكتب قيد متوازن في اليومية بتاريخ آخر يوم من الشهر. الفترة المحاسبية المقفلة ترفضه.',
          payDeclare:'التصريح لدى الضمان الاجتماعي', payDeclareHint:'التصريح يجمّد الفترة: لا يمكن إعادة احتساب الكشوف بعده.',
          payLoading:'جارٍ قراءة دفتر الأجور…', payNone:'لا يوجد كشف في هذه الفترة.',
          payDone:'تم احتساب الكشوف وحفظها.', payAlready:'تم سابقًا — لم يتغيّر شيء.',
          payStatus:{ prepared:'محتسبة', exported:'مقيّدة', declared:'مصرَّح بها' },
          lkTitle:'المدفوعات', lkSub:'روابط أداء دائمة · التحصيل والإلغاء والاسترجاع',
          lkDenied:'يلزم حق التحصيل', lkDeniedD:'جلستك لا يمكنها إصدار رابط أداء. يقولها Kiwi قبل أن يطلب منك إدخال أي مبلغ.',
          tabLink:'رابط جديد', tabLinks:'الروابط الصادرة',
          lkHint:'لا يوجد الرابط إلا إذا أعاده المزوّد. وما دام لم يجب، يحتفظ Kiwi بالطلب ولا يخترع أي عنوان.',
          lkNoProvider:'لا يوجد مزوّد أداء موصول بهذا الحساب. سيُحتفظ بالطلب، لكن لن يُنشأ أي رابط.',
          lkLoading:'جارٍ قراءة دفتر المدفوعات…', lkNone:'لم يصدر أي رابط أداء.',
          lkAmountK:'المبلغ', lkPaid:'المحصَّل', lkRefunded:'المسترجَع', lkRefundable:'القابل للاسترجاع', lkRefundCount:'الاسترجاعات',
          lkCopy:'نسخ الرابط', lkCopied:'تم نسخ الرابط',
          lkSettleTitle:'قراءة الحالة', lkSettleHint:'يسأل Kiwi المزوّد وينقل ما يعلنه — ولا يتجاوز أبدًا مبلغ الرابط.',
          lkCancelTitle:'إلغاء الرابط', lkCancelHint:'الرابط المحصَّل لا يُلغى، بل يُسترجع.',
          lkRefundTitle:'استرجاع', lkRefundHint:'لا يُرد إلا ما تم تحصيله، ولا يُرد المبلغ نفسه مرتين.',
          lkRefundAmount:'المبلغ المراد استرجاعه · درهم (فارغ = كل القابل للاسترجاع)', lkRefundReason:'السبب (اختياري)',
          lkSettle:'قراءة', lkCancel:'إلغاء الرابط', lkRefund:'استرجاع',
          lkDone:'تم تحديث دفتر المدفوعات.', lkAlready:'ألغي سابقًا — لم يتغيّر شيء.',
          lkStatus:{ active:'نشط', pending:'قيد الانتظار', paid:'مؤدّى', 'partially-refunded':'مسترجَع جزئيًا', refunded:'مسترجَع', cancelled:'ملغى', expired:'منتهي' },
          acctTitle:'المحاسبة', acctSub:'قيود دائمة · المخطط المحاسبي المغربي',
          tabInvoice:'فاتورة', tabCredit:'إشعار دائن', tabPeriod:'الفترة', tabJournal:'اليومية',
          acctDenied:'خاص بالمالك', acctDeniedD:'وحده حساب المالك — أو مشغّل Kiwi — يمكنه الكتابة في الدفاتر. جلستك لا تملك هذا الحق، ويقولها Kiwi قبل أن تملأ أي استمارة.',
          fDate:'التاريخ', fAmount:'المبلغ شامل الضريبة · درهم', fRate:'الضريبة على القيمة المضافة', fCustomer:'العميل (اختياري)', fIssue:'إصدار الفاتورة',
          cInvoice:'الفاتورة المراد إلغاؤها', cAmount:'مبلغ الإشعار · درهم', cIssue:'إصدار الإشعار',
          pPeriod:'الشهر المراد قفله', pLock:'قفل الفترة', pHint:'الفترة المقفلة ترفض أي قيد سابق، فاتورة كان أو إشعارًا دائنًا.',
          jFrom:'من', jTo:'إلى', jRun:'تصدير اليومية', jCsv:'تحميل CSV', jEmpty:'لا توجد قيود في هذه الفترة.',
          jTrunc:'التصدير أكبر من أن يُعرض — يظهر الملخّص فقط. قلّص المدة ثم أعد المحاولة.',
          confirmLabel:'أؤكد هذا القيد النهائي.', confirmNeeded:'أكّد قبل الكتابة.',
          number:'الرقم', ht:'خارج الضريبة', tva:'الضريبة', ttc:'الإجمالي', remaining:'المتبقي للإلغاء',
          balancedOk:'متوازن', balancedNo:'غير متوازن', lines:'قيود',
          account:'الحساب', label:'البيان', debit:'مدين', credit:'دائن',
          lockedAt:'قُفلت في', already:'كانت هذه الفترة مقفلة أصلًا — لم يتغيّر شيء.',
          errs:{
            'date-required':'تاريخ ناقص أو غير صالح.', 'invalid-amount':'مبلغ غير صالح.',
            'invalid-tax-rate':'نسبة ضريبة غير صالحة.', 'range-required':'مدة غير صالحة.',
            'period-required':'فترة غير صالحة (سنة-شهر).', 'invoice-not-found':'الفاتورة غير موجودة.',
            'exceeds-invoice':'الإشعار يتجاوز المتبقي على هذه الفاتورة.',
            'numbering-conflict':'تعارض في الترقيم — أعد الطلب.',
            'unbalanced-entry':'قيد غير متوازن — لم يُكتب شيء.',
            'confirmation-required':'التأكيد مطلوب.', 'permission-denied':'الوصول مرفوض.',
            'period-locked':'الفترة مقفلة',
            'owner-session-required':'القراءة محجوزة لحساب المالك.', db:'قاعدة البيانات غير متاحة — أعد المحاولة.',
            'supplier-required':'اسم المورّد ناقص.', 'invalid-date':'تاريخ التسليم غير صالح.',
            'no-lines':'أضف سطرًا واحدًا على الأقل.', 'too-many-lines':'عدد السطور كبير (60 كحد أقصى).',
            'sku-required':'مرجع ناقص في أحد السطور.', 'duplicate-sku':'سطران يحملان المرجع نفسه.',
            'invalid-quantity':'كمية غير صالحة.', 'invalid-price':'سعر الوحدة غير صالح.',
            'po-not-found':'أمر الشراء غير موجود.', 'line-not-found':'المرجع غير موجود في هذا الأمر.',
            'bad-transition':'لم يعد هذا الأمر مسودة', 'not-submitted':'هذا الأمر لا ينتظر استلامًا',
            'exceeds-ordered':'الاستلام يتجاوز الكمية المطلوبة — لم يُكتب شيء.',
            'invoice-mismatch':'الفاتورة لا تطابق البضاعة المستلمة — لم يُكتب شيء.',
            'exceeds-received':'المرتجع يتجاوز ما هو محتفظ به.',
            'no-employees':'أضف أجيرًا واحدًا على الأقل.', 'too-many-employees':'عدد الأجراء كبير جدًا (200 كحد أقصى).',
            'member-required':'رقم التسجيل ناقص في أحد السطور.', 'duplicate-member':'سطران يحملان نفس الأجير.',
            'invalid-dependents':'عدد الأشخاص المتكفَّل بهم غير صالح.',
            'advance-exceeds-gross':'التسبيق يتجاوز إجمالي هذا الشهر.',
            'net-negative':'الصافي سيكون سالبًا لهذا الأجير',
            'no-payslips':'لا يوجد كشف محتسب في هذه الفترة — احتسبها أولًا.',
            'period-declared':'الفترة مصرَّح بها لدى الضمان الاجتماعي — الكشوف مجمّدة.',
            'period-posted':'الفترة مقيَّدة سابقًا — إعادة الاحتساب ستغيّر قيدًا ماضيًا.',
            'invalid-rate':'نسبة غير صالحة', 'invalid-ceiling':'سقف الضمان الاجتماعي غير صالح.',
            'reference-required':'مرجع الرابط ناقص.', 'link-not-found':'رابط الأداء هذا غير موجود.',
            'link-already-paid':'هذا الرابط حصّل مبلغًا — يُسترجع ولا يُلغى.',
            'link-not-paid':'لم يُحصَّل شيء على هذا الرابط — لا شيء يُرد.',
            'refund-exceeds-paid':'الاسترجاع يتجاوز ما تبقى قابلًا للاسترجاع.',
            'refund-number-taken':'رقم الاسترجاع مأخوذ — أعد إرسال الطلب.',
            'reference-allocation-failed':'ترقيم الروابط مشبع — أعد إرسال الطلب.',
            'provider-unconfigured':'لا يوجد مزوّد أداء موصول بهذا الحساب.',
            'provider-network':'لم يجب المزوّد — ولم يُدَّع أي شيء.',
            'provider-http':'رفض المزوّد الطلب',
            'provider-returned-no-link':'لم يُعِد المزوّد أي رابط صالح — وKiwi لا يخترع رابطًا.',
            'provider-returned-no-status':'لم يعلن المزوّد أي حالة قابلة للاستعمال.',
            'provider-returned-no-amount':'لم يعلن المزوّد أي مبلغ قابل للاستعمال.',
            'unsupported-action':'إجراء غير معروف.',
          },
        },
      })[lang()];
    }
    function toastResult(result) {
      var c = text(), cmd = result && result.command || {};
      if (result && result.offline) return Kiwi.toast(c.queued, { type:'info', desc:c.queuedD });
      if (cmd.status === 'blocked' || cmd.status === 'failed') return Kiwi.toast(c.blocked, { type:'warning', desc:(cmd.lastError ? cmd.lastError + ' · ' : '') + c.blockedD });
      if (cmd.status === 'prepared') return Kiwi.toast(c.prepared, { type:'info', desc:c.preparedD });
      if (cmd.status === 'draft') return Kiwi.toast(c.draft, { type:'success', desc:c.draftD });
      if (cmd.status === 'active' && cmd.result && cmd.result.url) {
        Kiwi.modal({ tag:'KIWI PAY', title:c.payment, width:520, body:'<div class="p-card"><div style="font-size:12px;color:var(--n-500);margin-bottom:8px;">Lien vérifié par le fournisseur</div><a href="'+esc(cmd.result.url)+'" target="_blank" rel="noopener" style="font-size:14px;color:var(--atlas);overflow-wrap:anywhere;">'+esc(cmd.result.url)+'</a></div>' });
        return;
      }
      Kiwi.toast(c.draft, { type:'success', desc:c.draftD });
    }
    function fail(error) {
      var c = text(), code = error && (error.code || error.message) || 'operation-failed';
      Kiwi.toast(code === 'permission-denied' || code === 'owner-session-required' ? 'Accès refusé' : c.blocked, { type:'warning', desc:code });
    }

    var legacyPayment = H['payment-link'];
    /* Émettre un lien sans pouvoir le relire ensuite, c'était la moitié du
       travail.  Le bouton ouvre maintenant la console : on émet dans un
       onglet, on relit le livre dans l'autre. */
    H['payment-link'] = function () {
      if (!real() && legacyPayment) return legacyPayment.apply(this, arguments);
      openPayments('link');
    };

    var legacyPo = H['supplier-new-po'];
    H['supplier-new-po'] = function () {
      /* The demo store has no durable ledger behind it, and the permission check
         below would refuse the command anyway.  Leave the demo on its own
         handler rather than writing a local purchase order and then telling the
         merchant "accès refusé" for a document that now exists. */
      if (!real() && legacyPo) return legacyPo.apply(this, arguments);
      /* Le serveur tient désormais le livre des achats : numéro attribué,
         quantités commandées/reçues/retournées par ligne. Un formulaire à une
         seule ligne ne pouvait plus le remplir — la console le fait. */
      openProcurement('create');
    };
    H['supplier-po-detail'] = function (_el, id) {
      /* Un vrai marchand ouvre le bon qui existe côté serveur, avec ses soldes.
         La démo garde son tiroir local, qui n'a rien derrière. */
      if (real()) return openProcurement('orders');
      var P = window.KiwiProcurement, d = P && P.doc && P.doc(), row = d && (d.orders || []).find(function (x) { return x.id === id || x.number === id; });
      if (!row) return Kiwi.toast('Bon de commande introuvable', { type:'warning' });
      var supplier = (d.suppliers || []).find(function (x) { return x.id === row.supplierId; });
      Kiwi.drawer({ title:row.number, subtitle:(supplier && supplier.name || '') + ' · ' + row.status, width:620, body:'<div class="p-card">'+row.lines.map(function (line) { return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--n-200)"><span>'+esc(line.name || line.itemId)+'</span><b>'+esc(line.qty)+' '+esc(line.unit)+'</b></div>'; }).join('')+'</div>' });
    };

    /* Les trois anciens boutons « exporter la paie » peignaient un toast qui
       annonçait un PDF envoyé au gérant ou au comptable — sans bulletin, sans
       fichier, sans destinataire.  Ils ouvrent maintenant la console de paie,
       qui calcule vraiment, télécharge vraiment et ne prétend rien envoyer.
       La démo garde ses handlers locaux : le serveur refuserait la commande. */
    var legacyPay = {};
    ['eq-export-payroll', 'pay-export', 'export-payroll', 'acct-paie'].forEach(function (key) {
      legacyPay[key] = H[key];
      H[key] = function () {
        if (!real() && legacyPay[key]) return legacyPay[key].apply(this, arguments);
        openPayroll(key === 'acct-paie' ? 'prepare' : 'book');
      };
    });

    H['operations-history'] = async function () {
      var c = text();
      try {
        var data = await O.list({ limit:80 }), rows = data.commands || [];
        Kiwi.drawer({ title:c.history, subtitle:K.tenant(), width:720, body:rows.length ? rows.map(function (row) {
          return '<div class="p-card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:12px"><b>'+esc(row.domain+' · '+row.action)+'</b><span class="chip '+(row.status === 'blocked' || row.status === 'failed' ? 'pend' : row.status === 'completed' || row.status === 'sent' || row.status === 'active' ? 'ok' : 'info-soft')+'">'+esc(row.status)+'</span></div><div style="font-size:11px;color:var(--n-500);margin-top:5px">'+esc(new Date(row.updatedAt).toLocaleString())+(row.lastError ? ' · '+esc(row.lastError) : '')+'</div></div>';
        }).join('') : '<div style="padding:32px;text-align:center;color:var(--n-500)">'+c.empty+'</div>' });
      } catch (error) { fail(error); }
    };

    /* Keep the familiar integrations drawer and add an honest operational
       health card.  It reports configured providers from the server instead
       of presenting decorative connected badges. */
    var legacyIntegrations = H['add-integration'];
    if (legacyIntegrations) H['add-integration'] = function () {
      var result = legacyIntegrations.apply(this, arguments);
      setTimeout(async function () {
        try {
          var data = await O.list({ limit:1 }), providers = data.providers || {};
          var drawer = document.querySelector('.kiwi-drawer-body, .drawer-body');
          if (!drawer || drawer.querySelector('[data-operations-health]')) return;
          var c = text(), names = { email:'Email', whatsapp:'WhatsApp', sms:'SMS', payment:'Paiement' };
          var rows = Object.keys(names).map(function (key) {
            var on = providers[key] === true;
            return '<span class="chip '+(on ? 'ok' : 'info-soft')+'">'+esc(names[key])+' · '+esc(on ? (lang() === 'ar' ? 'جاهز' : lang() === 'en' ? 'ready' : 'prêt') : (lang() === 'ar' ? 'غير مربوط' : lang() === 'en' ? 'not connected' : 'non connecté'))+'</span>';
          }).join(' ');
          var card = document.createElement('section');
          card.setAttribute('data-operations-health', '');
          card.className = 'p-card';
          card.style.marginBottom = '12px';
          card.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px"><div><b>Kiwi Operations</b><div style="font-size:11px;color:var(--n-500);margin-top:3px">'+esc(c.history)+'</div></div><button class="kb ghost xs" type="button" data-action="operations-history">'+esc(c.openOps)+'</button></div><div style="display:flex;gap:6px;flex-wrap:wrap">'+rows+'</div>';
          drawer.prepend(card);
        } catch (_) {}
      }, 80);
      return result;
    };
    /* ─────────────── COMPTABILITÉ ───────────────
     * assets/accounting.js renders the Café Atlas demo book, and for a real
     * merchant it renders buildEmpty() — a panel that says "votre comptabilité
     * est prête" and can do nothing.  The four server actions (facture, avoir,
     * verrouillage, journal) had no way in.  This is that way in.
     *
     * Loaded after accounting.js registers its handlers, so these overrides
     * win; the demo keeps its own book. */
    var FSI = String.fromCharCode(0x2068), PDI = String.fromCharCode(0x2069);
    /* "4 785 MAD" reads back as "MAD 4 785" under dir=rtl unless the amount is
       isolated in the text itself — a class-level fix cannot reach inside. */
    function money(c) { return FSI + (Number(c || 0) / 100).toFixed(2) + ' MAD' + PDI; }
    function iso(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    /* Plusieurs refus du serveur portent leur contexte après un deux-points —
       `period-locked:2026-07`, `bad-transition:submitted`, `not-submitted:received`.
       Traduire la raison et garder l'état tel quel : le marchand a besoin des
       deux, et un code inconnu vaut mieux affiché que masqué. */
    function acctError(code) {
      var c = text(), key = String(code || ''), i = key.indexOf(':');
      if (i > 0) {
        var base = key.slice(0, i);
        if (c.errs[base]) return c.errs[base] + ' (' + key.slice(i + 1) + ')';
      }
      return c.errs[key] || key || 'operation-failed';
    }
    /* A server-side domain refusal comes back HTTP 200 with status:'failed' —
       only permissions and confirmation throw.  Both have to be read. */
    function outcome(result) {
      if (result && result.offline) return { queued:true };
      var cmd = result && result.command || {};
      if (cmd.status !== 'completed') return { error:cmd.lastError || cmd.status || 'operation-failed' };
      return { data:cmd.result || {} };
    }
    /* Une seule feuille pour les deux consoles : la comptabilité et
       l'approvisionnement sont le même meuble — bandeau de pastilles, volets,
       carte de sortie, table à en-tête collant. Les sélecteurs sont doublés
       plutôt que renommés pour ne pas casser le balisage déjà écrit. */
    function consoleCss() {
      if (document.getElementById('ops-console-css')) return;
      var style = document.createElement('style');
      style.id = 'ops-console-css';
      style.textContent = [
        /* `ops-pay-*` appartient déjà à la paie : les liens de paiement prennent
           leur propre préfixe `ops-lk-*` et s'ajoutent aux listes partagées. */
        '.ops-acct,.ops-proc,.ops-pay,.ops-lk{padding:22px 26px 46px;max-width:1000px;margin:0 auto;}',
        '.ops-acct-tabs,.ops-proc-tabs,.ops-pay-tabs,.ops-lk-tabs{display:inline-flex;gap:2px;padding:4px;border-radius:999px;background:var(--n-100);border:1px solid var(--n-200);margin-bottom:22px;}',
        '.ops-acct-tab,.ops-proc-tab,.ops-pay-tab,.ops-lk-tab{appearance:none;border:0;background:transparent;font:inherit;font-size:12.5px;font-weight:600;color:var(--n-500);padding:8px 18px;border-radius:999px;cursor:pointer;transition:color .2s;}',
        /* liquid-lens paints the pill; the button must not paint one under it. */
        '.ops-acct-tab.on,.ops-proc-tab.on,.ops-pay-tab.on,.ops-lk-tab.on{background:transparent;color:#fff;}',
        '.ops-acct-pane,.ops-proc-pane,.ops-pay-pane,.ops-lk-pane{display:none;}',
        '.ops-acct-pane.on,.ops-proc-pane.on,.ops-pay-pane.on,.ops-lk-pane.on{display:block;}',
        '.ops-acct-hint,.ops-proc-hint,.ops-pay-hint,.ops-lk-hint{font-size:12px;color:var(--n-500);margin:0 0 14px;max-width:62ch;line-height:1.55;}',
        '.ops-acct-confirm,.ops-lk-confirm{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;color:var(--n-500);margin-top:14px;cursor:pointer;}',
        '.ops-acct-confirm input,.ops-lk-confirm input{margin-top:2px;accent-color:var(--atlas);}',
        '.ops-acct-out,.ops-proc-out,.ops-pay-out,.ops-lk-out{margin-top:18px;}',
        '.ops-acct-kpis,.ops-proc-kpis,.ops-pay-kpis,.ops-lk-kpis{display:flex;flex-wrap:wrap;gap:22px;margin:12px 0 4px;}',
        '.ops-acct-kpi,.ops-proc-kpi,.ops-pay-kpi,.ops-lk-kpi{min-width:104px;}',
        '.ops-acct-kpi .k,.ops-proc-kpi .k,.ops-pay-kpi .k,.ops-lk-kpi .k{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);}',
        '.ops-acct-kpi .v,.ops-proc-kpi .v,.ops-pay-kpi .v,.ops-lk-kpi .v{font-size:17px;font-weight:600;margin-top:3px;font-variant-numeric:tabular-nums;}',
        '.ops-acct-doc,.ops-proc-num,.ops-pay-num,.ops-lk-num{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:18px;letter-spacing:.02em;}',
        '.ops-acct-scroll,.ops-proc-scroll,.ops-pay-scroll,.ops-lk-scroll{overflow-x:auto;max-height:50vh;overflow-y:auto;margin-top:12px;}',
        '.ops-acct-table,.ops-proc-table,.ops-pay-table{width:100%;border-collapse:collapse;font-size:12.5px;}',
        '.ops-acct-table th,.ops-proc-table th,.ops-pay-table th{text-align:start;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--n-200);position:sticky;top:0;background:var(--surface);}',
        '.ops-acct-table td,.ops-proc-table td,.ops-pay-table td{padding:8px 10px;border-bottom:1px solid var(--n-100);}',
        '.ops-acct-n,.ops-proc-n,.ops-pay-n,.ops-lk-n{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap;}',
        /* Saisie multiligne d'un bon : une ligne = une rangée, la référence et
           la désignation portent la largeur, les nombres restent serrés. */
        '.ops-proc-line{display:grid;grid-template-columns:1.1fr 1.5fr .7fr .7fr .9fr auto;gap:8px;align-items:end;margin-bottom:8px;}',
        '.ops-proc-line label{display:block;min-width:0;}',
        '.ops-proc-line .l{display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin-bottom:4px;}',
        '.ops-proc-line input{width:100%;box-sizing:border-box;}',
        '.ops-proc-line.n .l{visibility:hidden;}',
        '@media (max-width:720px){.ops-proc-line{grid-template-columns:1fr 1fr;}.ops-proc-line.n .l{visibility:visible;}}',
        '.ops-proc-rm,.ops-pay-rm{appearance:none;border:1px solid var(--n-200);background:transparent;color:var(--n-500);border-radius:9px;height:34px;width:34px;cursor:pointer;font-size:15px;line-height:1;}',
        '.ops-proc-rm:hover,.ops-pay-rm:hover{color:var(--ink);border-color:var(--n-300);}',
        '.ops-proc-total,.ops-pay-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;padding-top:12px;border-top:1px solid var(--n-200);}',
        '.ops-proc-total .k,.ops-pay-total .k{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);}',
        '.ops-proc-total .v,.ops-pay-total .v{font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;}',
        '.ops-proc-order{margin-bottom:12px;}',
        '.ops-proc-head,.ops-pay-head,.ops-lk-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:10px;}',
        '.ops-proc-sup,.ops-lk-sub{font-size:12.5px;color:var(--n-500);}',
        '.ops-proc-act,.ops-pay-act,.ops-lk-act{margin-top:14px;padding-top:14px;border-top:1px solid var(--n-100);}',
        '.ops-proc-actTitle,.ops-pay-actTitle,.ops-lk-actTitle{font-size:12.5px;font-weight:600;margin:0 0 4px;}',
        '.ops-proc-qty{width:82px;box-sizing:border-box;}',
        /* Une paie tient huit colonnes là où un bon en tient six : le salarié et
           son matricule d'abord, puis cinq nombres et le retrait.  La grille des
           bons ne pouvait pas les porter, d'où cette règle à elle. */
        '.ops-pay-line{display:grid;grid-template-columns:1.4fr .9fr .8fr .8fr .8fr .8fr .7fr auto;gap:8px;align-items:end;margin-bottom:8px;}',
        '.ops-pay-line label{display:block;min-width:0;}',
        '.ops-pay-line .l{display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin-bottom:4px;}',
        '.ops-pay-line input{width:100%;box-sizing:border-box;}',
        '.ops-pay-line.n .l{visibility:hidden;}',
        '@media (max-width:1000px){.ops-pay-line{grid-template-columns:1.4fr .9fr .8fr .8fr auto;}.ops-pay-line.n .l{visibility:visible;}}',
        '@media (max-width:720px){.ops-pay-line{grid-template-columns:1fr 1fr;}}',
        /* Un lien de paiement se lit comme un ticket : la référence en tête, un
           état nommé, l'adresse en clair — jamais tronquée, elle se replie. */
        '.ops-lk-card{margin-bottom:12px;}',
        '.ops-lk-state{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:600;padding:3px 9px;border-radius:999px;border:1px solid var(--n-200);color:var(--n-500);}',
        '.ops-lk-state.paid,.ops-lk-state.active{color:var(--atlas);border-color:color-mix(in srgb,var(--atlas) 34%,transparent);}',
        '.ops-lk-state.refunded,.ops-lk-state.cancelled,.ops-lk-state.expired{color:var(--n-500);}',
        '.ops-lk-url{display:block;margin-top:8px;font-size:12.5px;color:var(--atlas);overflow-wrap:anywhere;}',
        '.ops-lk-refund{display:grid;grid-template-columns:.8fr 1.4fr auto;gap:8px;align-items:end;margin-top:10px;}',
        '.ops-lk-refund label{display:block;min-width:0;}',
        '.ops-lk-refund .l{display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin-bottom:4px;}',
        '.ops-lk-refund input{width:100%;box-sizing:border-box;}',
        '@media (max-width:720px){.ops-lk-refund{grid-template-columns:1fr;}}',
        '.ops-lk-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}',
      ].join('\n');
      document.head.appendChild(style);
    }
    function acctPane(id, on, inner) {
      return '<section class="ops-acct-pane' + (on ? ' on' : '') + '" data-acct-pane="' + id + '">' + inner + '</section>';
    }
    function openLedger(tab) {
      var c = text(), today = iso(new Date()), month = today.slice(0, 7), first = month + '-01';
      consoleCss();
      if (O.allowed && !O.allowed('accounting', 'create-invoice')) {
        Kiwi.drawer({ title:c.acctTitle, subtitle:K && K.tenant ? K.tenant() : '', fullpage:true,
          body:'<div class="ops-acct"><div class="p-card"><b>' + esc(c.acctDenied) + '</b><p class="ops-acct-hint" style="margin:8px 0 0">' + esc(c.acctDeniedD) + '</p></div></div>' });
        return;
      }
      var confirmBox = '<label class="ops-acct-confirm"><input type="checkbox" data-acct-confirm><span>' + esc(c.confirmLabel) + '</span></label>';
      var body = '<div class="ops-acct">' +
        '<div class="ops-acct-tabs" data-lens-demo>' +
          [['invoice', c.tabInvoice], ['credit', c.tabCredit], ['period', c.tabPeriod], ['journal', c.tabJournal]].map(function (t) {
            return '<button class="ops-acct-tab' + (t[0] === tab ? ' on' : '') + '" type="button" data-lens-item data-acct-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
          }).join('') +
        '</div>' +
        acctPane('invoice', tab === 'invoice',
          '<div class="kf-grid">' +
          '<label><span class="l">' + c.fDate + '</span><input type="date" value="' + today + '" data-fa-date></label>' +
          '<label><span class="l">' + c.fAmount + '</span><input type="number" min="0.01" step="0.01" data-fa-amount></label>' +
          '<label><span class="l">' + c.fRate + '</span><select data-fa-rate><option value="20" selected>20 %</option><option value="14">14 %</option><option value="10">10 %</option><option value="7">7 %</option><option value="0">0 %</option></select></label>' +
          '<label><span class="l">' + c.fCustomer + '</span><input maxlength="160" data-fa-customer></label>' +
          '</div><button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-acct-run="invoice">' + esc(c.fIssue) + '</button>' +
          '<div class="ops-acct-out" data-acct-out="invoice"></div>') +
        acctPane('credit', tab === 'credit',
          '<div class="kf-grid">' +
          '<label><span class="l">' + c.cInvoice + '</span><input maxlength="40" placeholder="FA-2026-000001" data-av-invoice></label>' +
          '<label><span class="l">' + c.fDate + '</span><input type="date" value="' + today + '" data-av-date></label>' +
          '<label><span class="l">' + c.cAmount + '</span><input type="number" min="0.01" step="0.01" data-av-amount></label>' +
          '</div>' + confirmBox +
          '<button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-acct-run="credit">' + esc(c.cIssue) + '</button>' +
          '<div class="ops-acct-out" data-acct-out="credit"></div>') +
        acctPane('period', tab === 'period',
          '<p class="ops-acct-hint">' + esc(c.pHint) + '</p><div class="kf-grid">' +
          '<label><span class="l">' + c.pPeriod + '</span><input type="month" value="' + month + '" data-pe-period></label>' +
          '</div>' + confirmBox +
          '<button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-acct-run="period">' + esc(c.pLock) + '</button>' +
          '<div class="ops-acct-out" data-acct-out="period"></div>') +
        acctPane('journal', tab === 'journal',
          '<div class="kf-grid">' +
          '<label><span class="l">' + c.jFrom + '</span><input type="date" value="' + first + '" data-jo-from></label>' +
          '<label><span class="l">' + c.jTo + '</span><input type="date" value="' + today + '" data-jo-to></label>' +
          '</div><button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-acct-run="journal">' + esc(c.jRun) + '</button>' +
          '<div class="ops-acct-out" data-acct-out="journal"></div>') +
        '</div>';
      var res = Kiwi.drawer({ title:c.acctTitle, subtitle:c.acctSub, body:body, fullpage:true });
      var root = res.el;
      var lastJournal = null;

      root.addEventListener('click', function (event) {
        var pill = event.target.closest('[data-acct-tab]');
        if (pill) {
          /* Toggling .on is the whole contract — liquid-lens observes class
             changes on the subtree and slides the pill by itself. */
          root.querySelectorAll('[data-acct-tab]').forEach(function (el) { el.classList.toggle('on', el === pill); });
          root.querySelectorAll('[data-acct-pane]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-acct-pane') === pill.getAttribute('data-acct-tab')); });
          return;
        }
        var csv = event.target.closest('[data-acct-csv]');
        if (csv && lastJournal) return downloadJournal(lastJournal);
      });

      function downloadJournal(data) {
        var head = [c.number, 'date', c.account, c.label, c.debit, c.credit].join(';');
        /* Un libellé qui commence par = devient une formule dans Excel. */
        var cell = function (v) {
          var s = String(v == null ? '' : v);
          if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
          return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        var num = function (v) { return (Number(v || 0) / 100).toFixed(2).replace('.', ','); };
        var lines = (data.lines || []).map(function (l) { return [cell(l.number), cell(l.date), cell(l.account), cell(l.label), num(l.debitCents), num(l.creditCents)].join(';'); });
        var blob = new Blob(['﻿' + [head].concat(lines).join('\r\n')], { type:'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'journal-' + data.from + '-' + data.to + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }

      function out(kind, html) { root.querySelector('[data-acct-out="' + kind + '"]').innerHTML = html; }
      function outError(kind, code) {
        out(kind, '<div class="p-card"><span class="chip pend">' + esc(acctError(code)) + '</span></div>');
      }
      function kpi(k, v) { return '<div class="ops-acct-kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }

      root.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-acct-run]');
        if (!button) return;
        var kind = button.getAttribute('data-acct-run'), pane = button.closest('[data-acct-pane]');
        var need = kind === 'credit' || kind === 'period';
        if (need && !pane.querySelector('[data-acct-confirm]').checked) return Kiwi.toast(c.confirmNeeded, { type:'warning' });
        var payload, action;
        if (kind === 'invoice') {
          action = 'create-invoice';
          payload = { date:pane.querySelector('[data-fa-date]').value, amount:Number(pane.querySelector('[data-fa-amount]').value),
            taxRate:Number(pane.querySelector('[data-fa-rate]').value), currency:'MAD', customer:pane.querySelector('[data-fa-customer]').value };
          if (!(payload.amount > 0)) return Kiwi.toast(c.invalid, { type:'warning' });
        } else if (kind === 'credit') {
          action = 'credit-note';
          payload = { invoice:pane.querySelector('[data-av-invoice]').value.trim(), date:pane.querySelector('[data-av-date]').value, amount:Number(pane.querySelector('[data-av-amount]').value) };
          if (!payload.invoice || !(payload.amount > 0)) return Kiwi.toast(c.invalid, { type:'warning' });
        } else if (kind === 'period') {
          action = 'lock-period';
          payload = { period:pane.querySelector('[data-pe-period]').value };
          if (!payload.period) return Kiwi.toast(c.invalid, { type:'warning' });
        } else {
          action = 'export-journal';
          payload = { from:pane.querySelector('[data-jo-from]').value, to:pane.querySelector('[data-jo-to]').value };
          if (!payload.from || !payload.to) return Kiwi.toast(c.invalid, { type:'warning' });
        }
        button.disabled = true;
        try {
          var result = await O.create('accounting', action, payload, need ? { confirmed:true } : undefined);
          var got = outcome(result);
          if (got.queued) { out(kind, ''); toastResult(result); return; }
          if (got.error) return outError(kind, got.error);
          render(kind, got.data);
        } catch (error) { outError(kind, error && (error.code || error.message)); }
        finally { button.disabled = false; }
      });

      function render(kind, d) {
        if (kind === 'invoice' || kind === 'credit') {
          out(kind, '<div class="p-card"><div class="ops-acct-doc">' + esc(d.number) + '</div><div class="ops-acct-kpis">' +
            kpi(c.ttc, money(d.totalCents)) + kpi(c.tva, money(d.taxCents)) + kpi(c.ht, money(d.netCents)) +
            (kind === 'credit' ? kpi(c.remaining, money(d.remainingCents)) : '') +
            '</div><div style="margin-top:10px"><span class="chip ok">' + esc(c.balancedOk) + '</span> <span class="chip info-soft">' + esc(d.entries + ' ' + c.lines) + '</span> <span class="chip info-soft">' + esc(d.date) + '</span></div></div>');
          return;
        }
        if (kind === 'period') {
          out(kind, '<div class="p-card"><div class="ops-acct-doc">' + esc(d.period) + '</div><div style="margin-top:10px"><span class="chip ' + (d.alreadyLocked ? 'info-soft' : 'ok') + '">' + esc(c.lockedAt + ' ' + new Date(d.lockedAt).toLocaleString()) + '</span></div>' +
            (d.alreadyLocked ? '<p class="ops-acct-hint" style="margin:10px 0 0">' + esc(c.already) + '</p>' : '') + '</div>');
          return;
        }
        lastJournal = d.truncated ? null : d;
        var summary = '<div class="ops-acct-kpis">' + kpi(c.debit, money(d.debitCents)) + kpi(c.credit, money(d.creditCents)) + kpi(c.lines, String(d.count)) + '</div>' +
          '<div style="margin-top:8px"><span class="chip ' + (d.balanced ? 'ok' : 'pend') + '">' + esc(d.balanced ? c.balancedOk : c.balancedNo) + '</span></div>';
        if (d.truncated) return out('journal', '<div class="p-card">' + summary + '<p class="ops-acct-hint" style="margin:12px 0 0">' + esc(c.jTrunc) + '</p></div>');
        if (!d.count) return out('journal', '<div class="p-card">' + summary + '<p class="ops-acct-hint" style="margin:12px 0 0">' + esc(c.jEmpty) + '</p></div>');
        var rows = d.lines.map(function (l) {
          return '<tr><td>' + esc(l.number) + '</td><td>' + esc(l.date) + '</td><td>' + esc(l.account) + '</td><td>' + esc(l.label) + '</td>' +
            '<td class="ops-acct-n">' + (l.debitCents ? esc(money(l.debitCents)) : '') + '</td><td class="ops-acct-n">' + (l.creditCents ? esc(money(l.creditCents)) : '') + '</td></tr>';
        }).join('');
        out('journal', '<div class="p-card">' + summary +
          '<button class="kb ghost xs" type="button" data-acct-csv style="margin-top:12px">' + esc(c.jCsv) + '</button>' +
          '<div class="ops-acct-scroll"><table class="ops-acct-table"><thead><tr><th>' + esc(c.number) + '</th><th>Date</th><th>' + esc(c.account) + '</th><th>' + esc(c.label) + '</th><th class="ops-acct-n">' + esc(c.debit) + '</th><th class="ops-acct-n">' + esc(c.credit) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>');
      }
    }

    /* `create-po` se termine en `draft` : c'est l'état du bon lui-même, pas un
       échec.  outcome() traite tout ce qui n'est pas `completed` comme une
       erreur, d'où ce discriminateur propre à l'approvisionnement. */
    function procOutcome(result) {
      if (result && result.offline) return { queued:true };
      var cmd = result && result.command || {};
      if (cmd.status === 'failed' || cmd.lastError) return { error:cmd.lastError || 'operation-failed' };
      if (cmd.status !== 'completed' && cmd.status !== 'draft') return { error:cmd.status || 'operation-failed' };
      return { data:cmd.result || {} };
    }

    function procLineRow(index) {
      var c = text();
      return '<div class="ops-proc-line' + (index ? ' n' : '') + '" data-po-line>' +
        '<label><span class="l">' + esc(c.pSku) + '</span><input maxlength="60" data-pl-sku></label>' +
        '<label><span class="l">' + esc(c.pLabel) + '</span><input maxlength="160" data-pl-label></label>' +
        '<label><span class="l">' + esc(c.pUnit) + '</span><input maxlength="24" data-pl-unit></label>' +
        '<label><span class="l">' + esc(c.qty) + '</span><input type="number" min="1" step="1" data-pl-qty></label>' +
        '<label><span class="l">' + esc(c.cost) + '</span><input type="number" min="0" step="0.01" data-pl-price></label>' +
        '<button class="ops-proc-rm" type="button" data-pl-remove aria-label="' + esc(c.pRemove) + '">×</button>' +
        '</div>';
    }

    function openProcurement(tab) {
      var c = text();
      consoleCss();
      tab = tab === 'orders' ? 'orders' : 'create';
      if (O.allowed && !O.allowed('procurement', 'create-po')) {
        Kiwi.drawer({ title:c.procTitle, subtitle:c.procSub, fullpage:true,
          body:'<div class="ops-proc"><div class="p-card"><b>' + esc(c.procDenied) + '</b><p class="ops-proc-hint" style="margin:8px 0 0">' + esc(c.procDeniedD) + '</p></div></div>' });
        return;
      }
      /* Les fournisseurs déjà connus du poste servent de suggestions ; le champ
         reste libre parce que le serveur ne tient pas de table fournisseurs. */
      var P = window.KiwiProcurement, doc = P && P.doc && P.doc();
      var suppliers = ((doc && doc.suppliers) || []).filter(function (s) { return s.active !== false; });
      var confirmBox = '<label class="ops-acct-confirm"><input type="checkbox" data-acct-confirm><span>' + esc(c.confirmLabel) + '</span></label>';

      var body = '<div class="ops-proc">' +
        '<datalist id="ops-proc-suppliers">' + suppliers.map(function (s) { return '<option value="' + esc(s.name) + '"></option>'; }).join('') + '</datalist>' +
        '<div class="ops-proc-tabs" data-lens-demo>' +
          [['create', c.tabNewPo], ['orders', c.tabOrders]].map(function (t) {
            return '<button class="ops-proc-tab' + (t[0] === tab ? ' on' : '') + '" type="button" data-lens-item data-po-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
          }).join('') +
        '</div>' +
        '<section class="ops-proc-pane' + (tab === 'create' ? ' on' : '') + '" data-po-pane="create">' +
          '<p class="ops-proc-hint">' + esc(c.procSub) + '</p>' +
          '<div class="kf-grid">' +
            '<label><span class="l">' + esc(c.supplierPick) + '</span><input maxlength="160" list="ops-proc-suppliers" data-po-supplier></label>' +
            '<label><span class="l">' + esc(c.due) + '</span><input type="date" data-po-date></label>' +
          '</div>' +
          '<div style="margin-top:16px" data-po-lines>' + procLineRow(0) + '</div>' +
          '<button class="kb ghost xs" type="button" data-pl-add>' + esc(c.pAddLine) + '</button>' +
          '<div class="ops-proc-total"><span class="k">' + esc(c.pTotal) + '</span><span class="v" data-po-total>' + esc(money(0)) + '</span></div>' +
          '<button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-po-create>' + esc(c.pCreate) + '</button>' +
          '<div class="ops-proc-out" data-po-out></div>' +
        '</section>' +
        '<section class="ops-proc-pane' + (tab === 'orders' ? ' on' : '') + '" data-po-pane="orders">' +
          '<button class="kb ghost xs" type="button" data-po-refresh>' + esc(c.pRefresh) + '</button>' +
          '<div data-po-orders><p class="ops-proc-hint" style="margin-top:14px">' + esc(c.pLoading) + '</p></div>' +
        '</section>' +
        '</div>';

      var res = Kiwi.drawer({ title:c.procTitle, subtitle:c.procSub, body:body, fullpage:true });
      var root = res.el;

      function rows() { return Array.prototype.slice.call(root.querySelectorAll('[data-po-line]')); }
      function retotal() {
        var total = rows().reduce(function (sum, row) {
          var qty = Number(row.querySelector('[data-pl-qty]').value || 0), price = Number(row.querySelector('[data-pl-price]').value || 0);
          return sum + (qty > 0 && price > 0 ? Math.round(qty * price * 100) : 0);
        }, 0);
        root.querySelector('[data-po-total]').textContent = money(total);
      }
      root.addEventListener('input', function (event) { if (event.target.closest('[data-po-line]')) retotal(); });

      function kpi(k, v) { return '<div class="ops-proc-kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }
      function card(el, code) { el.innerHTML = '<div class="p-card"><span class="chip pend">' + esc(acctError(code)) + '</span></div>'; }

      function qtyInputs(lines, mode) {
        return '<div style="margin-top:10px">' + lines.map(function (l) {
          var open = Math.max(0, (l.qty || 0) - (l.receivedQty || 0));
          var held = Math.max(0, (l.receivedQty || 0) - (l.returnedQty || 0));
          var max = mode === 'receive' ? open : held;
          if (!max) return '';
          return '<label style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span style="flex:1 1 auto;font-size:12.5px">' + esc(l.label || l.sku) + '</span>' +
            '<input class="ops-proc-qty" type="number" min="0" step="1" max="' + max + '" value="' + (mode === 'receive' ? max : 0) + '" data-po-qty="' + esc(l.sku) + '"></label>';
        }).join('') + '</div>';
      }

      function orderCard(o) {
        var lines = o.lines || [];
        var body = lines.map(function (l) {
          var open = Math.max(0, (l.qty || 0) - (l.receivedQty || 0));
          return '<tr><td>' + esc(l.sku) + '</td><td>' + esc(l.label || '') + '</td>' +
            '<td class="ops-proc-n">' + esc(String(l.qty)) + '</td>' +
            '<td class="ops-proc-n">' + esc(String(l.receivedQty || 0)) + '</td>' +
            '<td class="ops-proc-n">' + esc(String(l.returnedQty || 0)) + '</td>' +
            '<td class="ops-proc-n">' + esc(String(open)) + '</td></tr>';
        }).join('');
        var act = '';
        if (o.status === 'draft') {
          act += '<div class="ops-proc-act" data-po-act><p class="ops-proc-actTitle">' + esc(c.pSubmitTitle) + '</p>' +
            '<p class="ops-proc-hint">' + esc(c.pSubmitHint) + '</p>' + confirmBox +
            '<button class="kb atlas xs" style="margin-top:12px" type="button" data-po-run="submit-po">' + esc(c.pRun) + '</button></div>';
        } else if (o.status === 'submitted' || o.status === 'partial') {
          act += '<div class="ops-proc-act" data-po-act><p class="ops-proc-actTitle">' + esc(c.pReceiveTitle) + '</p>' +
            '<p class="ops-proc-hint">' + esc(c.pReceiveHint) + '</p>' + qtyInputs(lines, 'receive') +
            '<label style="display:block;margin-top:10px"><span class="l">' + esc(c.pInvoice) + '</span><input type="number" min="0" step="0.01" data-po-invoice></label>' +
            '<p class="ops-proc-hint" style="margin:6px 0 0">' + esc(c.pInvoiceHint) + '</p>' +
            '<button class="kb atlas xs" style="margin-top:12px" type="button" data-po-run="receive-po">' + esc(c.pRun) + '</button></div>';
        }
        if (lines.some(function (l) { return (l.receivedQty || 0) - (l.returnedQty || 0) > 0; })) {
          act += '<div class="ops-proc-act" data-po-act><p class="ops-proc-actTitle">' + esc(c.pReturnTitle) + '</p>' +
            '<p class="ops-proc-hint">' + esc(c.pReturnHint) + '</p>' + qtyInputs(lines, 'return') + confirmBox +
            '<button class="kb atlas xs" style="margin-top:12px" type="button" data-po-run="supplier-return">' + esc(c.pRun) + '</button></div>';
        }
        return '<div class="p-card ops-proc-order" data-po-card="' + esc(o.number) + '">' +
          '<div class="ops-proc-head"><div><div class="ops-proc-num">' + esc(o.number) + '</div>' +
            '<div class="ops-proc-sup">' + esc(o.supplier || '') + (o.expectedDate ? ' · ' + esc(o.expectedDate) : '') + '</div></div>' +
            '<div><span class="chip ' + (o.status === 'received' ? 'ok' : 'info-soft') + '">' + esc((c.pStatus && c.pStatus[o.status]) || o.status) + '</span> <b>' + esc(money(o.totalCents)) + '</b></div></div>' +
          '<div class="ops-proc-scroll"><table class="ops-proc-table"><thead><tr><th>' + esc(c.pSku) + '</th><th>' + esc(c.pLabel) + '</th>' +
            '<th class="ops-proc-n">' + esc(c.pOrdered) + '</th><th class="ops-proc-n">' + esc(c.pReceived) + '</th>' +
            '<th class="ops-proc-n">' + esc(c.pReturned) + '</th><th class="ops-proc-n">' + esc(c.pOpenQty) + '</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
          act + '<div class="ops-proc-out" data-po-out-card></div></div>';
      }

      async function loadOrders() {
        var host = root.querySelector('[data-po-orders]');
        host.innerHTML = '<p class="ops-proc-hint" style="margin-top:14px">' + esc(c.pLoading) + '</p>';
        try {
          var data = await O.purchaseOrders({ open:true, limit:25 });
          var orders = (data && data.orders) || [];
          host.innerHTML = orders.length ? orders.map(orderCard).join('') : '<p class="ops-proc-hint" style="margin-top:14px">' + esc(c.pNoOrders) + '</p>';
        } catch (error) { card(host, error && (error.code || error.message)); }
      }

      root.addEventListener('click', function (event) {
        var pill = event.target.closest('[data-po-tab]');
        if (pill) {
          /* Basculer .on est tout le contrat — liquid-lens fait glisser la pastille. */
          root.querySelectorAll('[data-po-tab]').forEach(function (el) { el.classList.toggle('on', el === pill); });
          root.querySelectorAll('[data-po-pane]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-po-pane') === pill.getAttribute('data-po-tab')); });
          if (pill.getAttribute('data-po-tab') === 'orders') loadOrders();
          return;
        }
        if (event.target.closest('[data-pl-add]')) return void root.querySelector('[data-po-lines]').insertAdjacentHTML('beforeend', procLineRow(rows().length));
        var rm = event.target.closest('[data-pl-remove]');
        if (rm) {
          /* Un bon sans ligne n'existe pas : la dernière se vide, elle ne part pas. */
          if (rows().length <= 1) rm.closest('[data-po-line]').querySelectorAll('input').forEach(function (i) { i.value = ''; });
          else rm.closest('[data-po-line]').remove();
          return retotal();
        }
        if (event.target.closest('[data-po-refresh]')) loadOrders();
      });

      root.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-po-create]');
        if (!button) return;
        var payload = { supplier:root.querySelector('[data-po-supplier]').value.trim(), expectedDate:root.querySelector('[data-po-date]').value, currency:'MAD', lines:[] };
        var bad = false;
        rows().forEach(function (row) {
          var sku = row.querySelector('[data-pl-sku]').value.trim(), label = row.querySelector('[data-pl-label]').value.trim();
          var qty = Number(row.querySelector('[data-pl-qty]').value), price = Number(row.querySelector('[data-pl-price]').value || 0);
          if (!sku && !label && !row.querySelector('[data-pl-qty]').value) return;   /* ligne restée vide */
          if (!sku || !(qty > 0) || !(price >= 0)) { bad = true; return; }
          payload.lines.push({ sku:sku, label:label, unit:row.querySelector('[data-pl-unit]').value.trim(), qty:qty, unitPrice:price });
        });
        if (bad || !payload.supplier || !payload.lines.length) return Kiwi.toast(c.invalid, { type:'warning' });
        button.disabled = true;
        var host = root.querySelector('[data-po-out]');
        try {
          var result = await O.create('procurement', 'create-po', payload);
          var got = procOutcome(result);
          if (got.queued) { host.innerHTML = ''; return toastResult(result); }
          if (got.error) return card(host, got.error);
          var d = got.data;
          host.innerHTML = '<div class="p-card"><div class="ops-proc-num">' + esc(d.number) + '</div>' +
            '<div class="ops-proc-kpis">' + kpi(c.pTotal, money(d.totalCents)) + kpi(c.lines, String(d.lines)) + kpi(c.pOrdered, String(d.units)) + '</div>' +
            '<div style="margin-top:10px"><span class="chip ok">' + esc(c.pOrderCreated) + '</span> <span class="chip info-soft">' + esc(d.supplier) + '</span>' +
            (d.expectedDate ? ' <span class="chip info-soft">' + esc(d.expectedDate) + '</span>' : '') + '</div></div>';
          /* Le formulaire repart à zéro : deux clics sur « créer » ne doivent pas
             produire deux bons pour la même livraison. */
          root.querySelector('[data-po-lines]').innerHTML = procLineRow(0);
          root.querySelector('[data-po-supplier]').value = ''; root.querySelector('[data-po-date]').value = '';
          retotal();
        } catch (error) { card(host, error && (error.code || error.message)); }
        finally { button.disabled = false; }
      });

      root.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-po-run]');
        if (!button) return;
        var action = button.getAttribute('data-po-run'), block = button.closest('[data-po-act]'), order = button.closest('[data-po-card]');
        var need = action === 'submit-po' || action === 'supplier-return';
        if (need && !block.querySelector('[data-acct-confirm]').checked) return Kiwi.toast(c.confirmNeeded, { type:'warning' });
        var payload = { po:order.getAttribute('data-po-card') };
        if (action !== 'submit-po') {
          payload.lines = Array.prototype.slice.call(block.querySelectorAll('[data-po-qty]')).map(function (input) {
            return { sku:input.getAttribute('data-po-qty'), qty:Number(input.value || 0) };
          }).filter(function (l) { return l.qty > 0; });
          if (!payload.lines.length) return Kiwi.toast(c.invalid, { type:'warning' });
          var invoice = block.querySelector('[data-po-invoice]');
          if (invoice && Number(invoice.value) > 0) payload.invoiceAmount = Number(invoice.value);
        }
        button.disabled = true;
        var host = order.querySelector('[data-po-out-card]');
        try {
          var result = await O.create('procurement', action, payload, need ? { confirmed:true } : undefined);
          var got = procOutcome(result);
          if (got.queued) { host.innerHTML = ''; return toastResult(result); }
          if (got.error) { button.disabled = false; return card(host, got.error); }
          Kiwi.toast(c.pDone, { type:'success' });
          loadOrders();
        } catch (error) { button.disabled = false; card(host, error && (error.code || error.message)); }
      });

      if (tab === 'orders') loadOrders();
    }

    /* ─────────────── PAIE ───────────────
     * Trois boutons annonçaient « PDF envoyé au gérant » ou « envoyé à votre
     * comptable » sans fichier, sans destinataire et sans calcul.  Le serveur
     * sait désormais établir un bulletin marocain — CNSS plafonnée, AMO, frais
     * professionnels, IGR par tranches, charges de famille, charges patronales
     * — le stocker par salarié et le passer au journal.  Voici l'entrée. */
    function payOutcome(result) {
      /* `prepare-payslips` se termine en `prepared` : la paie est calculée,
         pas encore comptabilisée.  outcome() lirait cet état comme un échec. */
      if (result && result.offline) return { queued:true };
      var cmd = result && result.command || {};
      if (cmd.status === 'failed' || cmd.lastError) return { error:cmd.lastError || 'operation-failed' };
      if (cmd.status !== 'completed' && cmd.status !== 'prepared') return { error:cmd.status || 'operation-failed' };
      return { data:cmd.result || {} };
    }
    function payLineRow(index, member) {
      var c = text(), m = member || {};
      /* Le rôle voyage sur la rangée, pas dans une colonne : KiwiTeam le
         connaît, le serveur l'enregistre, et aucune des trois langues n'a de
         libellé pour lui — mieux vaut le porter que l'inventer. */
      return '<div class="ops-pay-line' + (index ? ' n' : '') + '" data-py-line' + (m.role ? ' data-py-role="' + esc(m.role) + '"' : '') + '>' +
        '<label><span class="l">' + esc(c.payMember) + '</span><input maxlength="120" data-py-name value="' + esc(m.name || '') + '"></label>' +
        '<label><span class="l">' + esc(c.payId) + '</span><input maxlength="60" data-py-id value="' + esc(m.id || '') + '"></label>' +
        '<label><span class="l">' + esc(c.payBase) + '</span><input type="number" min="0" step="0.01" data-py-base></label>' +
        '<label><span class="l">' + esc(c.payOt) + '</span><input type="number" min="0" step="0.01" data-py-ot></label>' +
        '<label><span class="l">' + esc(c.payBonus) + '</span><input type="number" min="0" step="0.01" data-py-bonus></label>' +
        '<label><span class="l">' + esc(c.payAdvance) + '</span><input type="number" min="0" step="0.01" data-py-advance></label>' +
        '<label><span class="l">' + esc(c.payDeps) + '</span><input type="number" min="0" max="20" step="1" data-py-deps></label>' +
        '<button class="ops-pay-rm" type="button" data-py-remove aria-label="' + esc(c.payRemoveRow) + '">×</button>' +
        '</div>';
    }
    function openPayroll(tab) {
      var c = text();
      consoleCss();
      tab = tab === 'book' ? 'book' : 'prepare';
      if (O.allowed && !O.allowed('payroll', 'prepare-payslips')) {
        Kiwi.drawer({ title:c.payTitle, subtitle:c.paySub, fullpage:true,
          body:'<div class="ops-pay"><div class="p-card"><b>' + esc(c.payDenied) + '</b><p class="ops-pay-hint" style="margin:8px 0 0">' + esc(c.payDeniedD) + '</p></div></div>' });
        return;
      }
      var month = iso(new Date()).slice(0, 7);
      var confirmBox = '<label class="ops-acct-confirm"><input type="checkbox" data-acct-confirm><span>' + esc(c.confirmLabel) + '</span></label>';

      var body = '<div class="ops-pay">' +
        '<div class="ops-pay-tabs" data-lens-demo>' +
          [['prepare', c.tabPrepare], ['book', c.tabBook]].map(function (t) {
            return '<button class="ops-pay-tab' + (t[0] === tab ? ' on' : '') + '" type="button" data-lens-item data-py-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
          }).join('') +
        '</div>' +
        '<section class="ops-pay-pane' + (tab === 'prepare' ? ' on' : '') + '" data-py-pane="prepare">' +
          '<p class="ops-pay-hint">' + esc(c.payHint) + '</p>' +
          '<div class="kf-grid">' +
            '<label><span class="l">' + esc(c.payPeriod) + '</span><input type="month" data-py-period value="' + esc(month) + '"></label>' +
          '</div>' +
          '<div style="margin-top:16px" data-py-lines>' + payLineRow(0) + '</div>' +
          '<button class="kb ghost xs" type="button" data-py-add>' + esc(c.payAddRow) + '</button> ' +
          '<button class="kb ghost xs" type="button" data-py-team>' + esc(c.payTeam) + '</button>' +
          '<div class="ops-pay-total"><span class="k">' + esc(c.payGross) + '</span><span class="v" data-py-total>' + esc(money(0)) + '</span></div>' +
          '<button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-py-run>' + esc(c.payRun) + '</button>' +
          '<div class="ops-pay-out" data-py-out></div>' +
        '</section>' +
        '<section class="ops-pay-pane' + (tab === 'book' ? ' on' : '') + '" data-py-pane="book">' +
          '<div class="kf-grid">' +
            '<label><span class="l">' + esc(c.payPeriod) + '</span><input type="month" data-py-book-period value="' + esc(month) + '"></label>' +
          '</div>' +
          '<button class="kb ghost xs" style="margin-top:12px" type="button" data-py-refresh>' + esc(c.pRefresh) + '</button>' +
          '<div data-py-book><p class="ops-pay-hint" style="margin-top:14px">' + esc(c.payLoading) + '</p></div>' +
        '</section>' +
        '</div>';

      var res = Kiwi.drawer({ title:c.payTitle, subtitle:c.paySub, body:body, fullpage:true });
      var root = res.el;
      var loaded = null;

      function rows() { return Array.prototype.slice.call(root.querySelectorAll('[data-py-line]')); }
      function num(row, key) { return Number(row.querySelector('[data-py-' + key + ']').value || 0); }
      function retotal() {
        var total = rows().reduce(function (sum, row) { return sum + num(row, 'base') + num(row, 'ot') + num(row, 'bonus'); }, 0);
        root.querySelector('[data-py-total]').textContent = money(Math.round(total * 100));
      }
      root.addEventListener('input', function (event) { if (event.target.closest('[data-py-line]')) retotal(); });

      function kpi(k, v) { return '<div class="ops-pay-kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }
      function card(el, code) { el.innerHTML = '<div class="p-card"><span class="chip pend">' + esc(acctError(code)) + '</span></div>'; }

      function bookCard(data) {
        var t = data.totals || {}, list = data.payslips || [];
        if (!list.length) return '<p class="ops-pay-hint" style="margin-top:14px">' + esc(c.payNone) + '</p>';
        var status = (c.payStatus && c.payStatus[data.status]) || data.status || '';
        var head = ['payId', 'payMember', 'payGross', 'payCnss', 'payAmo', 'payIgr', 'payAdvance', 'payEmployer', 'payNet'];
        return '<div class="p-card" style="margin-top:14px">' +
          '<div class="ops-pay-head">' +
            '<div class="ops-pay-num">' + esc(data.number || data.period) + '</div>' +
            '<span class="chip">' + esc(status) + '</span>' +
          '</div>' +
          '<div class="ops-pay-kpis">' +
            kpi(c.payHeads, String(t.employees || list.length)) +
            kpi(c.payGross, money(t.grossCents)) +
            kpi(c.payNet, money(t.netCents)) +
            kpi(c.payEmployer, money(t.employerCents)) +
          '</div>' +
          '<div class="ops-pay-scroll"><table class="ops-pay-table"><thead><tr>' +
            head.map(function (k, i) { return '<th' + (i > 1 ? ' class="ops-pay-n"' : '') + '>' + esc(c[k]) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
            list.map(function (p) {
              return '<tr><td>' + esc(p.memberId) + '</td><td>' + esc(p.name) + '</td>' +
                [p.grossCents, p.cnssCents, p.amoCents, p.igrCents, p.advanceCents, p.employerCents, p.netCents]
                  .map(function (v) { return '<td class="ops-pay-n">' + esc(money(v)) + '</td>'; }).join('') +
                '</tr>';
            }).join('') +
          '</tbody></table></div>' +
          '<div class="ops-pay-act">' +
            '<button class="kb ghost xs" type="button" data-py-csv>' + esc(c.payCsv) + '</button>' +
          '</div>' +
          '<div class="ops-pay-act">' +
            '<p class="ops-pay-actTitle">' + esc(c.payPost) + '</p>' +
            '<p class="ops-pay-hint">' + esc(c.payPostHint) + '</p>' +
            '<button class="kb atlas xs" type="button" data-py-run-book="export-payroll">' + esc(c.payPost) + '</button>' +
          '</div>' +
          '<div class="ops-pay-act" data-py-act>' +
            '<p class="ops-pay-actTitle">' + esc(c.payDeclare) + '</p>' +
            '<p class="ops-pay-hint">' + esc(c.payDeclareHint) + '</p>' +
            confirmBox +
            '<button class="kb atlas xs" style="margin-top:12px" type="button" data-py-run-book="submit-cnss">' + esc(c.payDeclare) + '</button>' +
          '</div>' +
          '<div class="ops-pay-out" data-py-book-out></div>' +
        '</div>';
      }

      async function loadBook() {
        var host = root.querySelector('[data-py-book]');
        host.innerHTML = '<p class="ops-pay-hint" style="margin-top:14px">' + esc(c.payLoading) + '</p>';
        try {
          var data = await O.payslips({ period:root.querySelector('[data-py-book-period]').value || month });
          loaded = data;
          host.innerHTML = bookCard(data || {});
        } catch (error) { loaded = null; card(host, error && (error.code || error.message)); }
      }

      function downloadBook() {
        if (!loaded || !(loaded.payslips || []).length) return;
        /* Un nom de salarié qui commence par = devient une formule dans Excel. */
        var cell = function (v) {
          var s = String(v == null ? '' : v);
          if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
          return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        var amount = function (v) { return (Number(v || 0) / 100).toFixed(2).replace('.', ','); };
        var head = [c.payId, c.payMember, c.payGross, c.payCnss, c.payAmo, c.payIgr, c.payAdvance, c.payEmployer, c.payNet].map(cell).join(';');
        var body = loaded.payslips.map(function (p) {
          return [cell(p.memberId), cell(p.name), amount(p.grossCents), amount(p.cnssCents), amount(p.amoCents),
            amount(p.igrCents), amount(p.advanceCents), amount(p.employerCents), amount(p.netCents)].join(';');
        });
        var blob = new Blob(['﻿' + [head].concat(body).join('\r\n')], { type:'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'paie-' + (loaded.period || month) + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }

      root.addEventListener('click', function (event) {
        var pill = event.target.closest('[data-py-tab]');
        if (pill) {
          /* Basculer .on est tout le contrat — liquid-lens fait glisser la pastille. */
          root.querySelectorAll('[data-py-tab]').forEach(function (el) { el.classList.toggle('on', el === pill); });
          root.querySelectorAll('[data-py-pane]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-py-pane') === pill.getAttribute('data-py-tab')); });
          if (pill.getAttribute('data-py-tab') === 'book') loadBook();
          return;
        }
        if (event.target.closest('[data-py-add]')) return void root.querySelector('[data-py-lines]').insertAdjacentHTML('beforeend', payLineRow(rows().length));
        if (event.target.closest('[data-py-team]')) {
          /* KiwiTeam.roster() porte l'identité et les heures, jamais un salaire :
             on reprend le nom, le matricule et le poste, le marchand saisit les
             montants.  Deux clics ne doivent pas doubler l'équipe. */
          var roster = [];
          try { roster = (window.KiwiTeam && window.KiwiTeam.roster && window.KiwiTeam.roster()) || []; } catch (_) { roster = []; }
          if (!roster.length) return Kiwi.toast(c.payNone, { type:'warning' });
          root.querySelector('[data-py-lines]').innerHTML = roster.map(function (m, i) { return payLineRow(i, m); }).join('');
          return retotal();
        }
        var rm = event.target.closest('[data-py-remove]');
        if (rm) {
          /* Une paie sans salarié n'existe pas : la dernière rangée se vide. */
          if (rows().length <= 1) rm.closest('[data-py-line]').querySelectorAll('input').forEach(function (i) { i.value = ''; });
          else rm.closest('[data-py-line]').remove();
          return retotal();
        }
        if (event.target.closest('[data-py-refresh]')) loadBook();
        if (event.target.closest('[data-py-csv]')) downloadBook();
      });

      root.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-py-run]');
        if (!button) return;
        var bad = false;
        var employees = rows().map(function (row) {
          var id = row.querySelector('[data-py-id]').value.trim(), name = row.querySelector('[data-py-name]').value.trim();
          var deps = row.querySelector('[data-py-deps]').value;
          if (!id && !name) return null;
          if (!id || !name || !(num(row, 'base') > 0)) bad = true;
          return {
            id:id, name:name, role:row.getAttribute('data-py-role') || '',
            /* Le serveur multiplie par 100 : envoyer des dirhams, jamais des
               centimes, sinon chaque salaire est centuplé. */
            base:num(row, 'base'), overtime:num(row, 'ot'), bonus:num(row, 'bonus'),
            advance:num(row, 'advance'), dependents:deps === '' ? 0 : Number(deps),
          };
        }).filter(Boolean);
        var period = root.querySelector('[data-py-period]').value;
        if (bad || !period || !employees.length) return Kiwi.toast(c.invalid, { type:'warning' });
        button.disabled = true;
        var host = root.querySelector('[data-py-out]');
        try {
          var result = await O.create('payroll', 'prepare-payslips', { period:period, employees:employees });
          var got = payOutcome(result);
          if (got.queued) { host.innerHTML = ''; return toastResult(result); }
          if (got.error) return card(host, got.error);
          var d = got.data, t = d || {};
          host.innerHTML = '<div class="p-card" style="margin-top:14px">' +
            '<div class="ops-pay-head"><div class="ops-pay-num">' + esc(d.period) + '</div><span class="chip">' + esc((c.payStatus && c.payStatus[d.status]) || d.status || '') + '</span></div>' +
            '<div class="ops-pay-kpis">' +
              kpi(c.payHeads, String(t.employees || (d.payslips || []).length)) +
              kpi(c.payGross, money(t.grossCents)) +
              kpi(c.payNet, money(t.netCents)) +
              kpi(c.payCnss, money(t.cnssCents)) +
              kpi(c.payAmo, money(t.amoCents)) +
              kpi(c.payIgr, money(t.igrCents)) +
              kpi(c.payEmployer, money(t.employerCents)) +
              kpi(c.payRates, esc(d.rateSet || '')) +
            '</div>' +
          '</div>';
          Kiwi.toast(c.payDone, { type:'success' });
          root.querySelector('[data-py-book-period]').value = d.period || period;
        } catch (error) { card(host, error && (error.code || error.message)); }
        finally { button.disabled = false; }
      });

      root.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-py-run-book]');
        if (!button) return;
        var action = button.getAttribute('data-py-run-book');
        var need = action === 'submit-cnss';
        if (need && !button.closest('[data-py-act]').querySelector('[data-acct-confirm]').checked) return Kiwi.toast(c.confirmNeeded, { type:'warning' });
        var period = (loaded && loaded.period) || root.querySelector('[data-py-book-period]').value || month;
        button.disabled = true;
        var host = root.querySelector('[data-py-book-out]');
        try {
          var result = await O.create('payroll', action, { period:period }, need ? { confirmed:true } : undefined);
          var got = payOutcome(result);
          if (got.queued) { host.innerHTML = ''; return toastResult(result); }
          if (got.error) { button.disabled = false; return card(host, got.error); }
          var d = got.data;
          Kiwi.toast(d.alreadyPosted || d.alreadyDeclared ? c.payAlready : c.payDone, { type:d.alreadyPosted || d.alreadyDeclared ? 'info' : 'success' });
          loadBook();
        } catch (error) { button.disabled = false; card(host, error && (error.code || error.message)); }
      });

      if (tab === 'book') loadBook();
    }

    /* ─────────────── PAIEMENTS ───────────────
     * Le bouton « lien de paiement » ouvrait une boîte à trois champs : on
     * émettait, et c'était tout.  Impossible de relire ce qu'on avait émis,
     * d'annuler un lien qui n'a rien encaissé, de relever ce que le fournisseur
     * annonce, ni de rendre l'argent.  Le serveur tient maintenant le livre —
     * encaissé, remboursé, remboursable, numérotation des remboursements — et
     * refuse le double remboursement comme l'annulation d'un lien déjà payé.
     * Voici la console qui s'y branche. */
    function linkOutcome(result) {
      /* `create-link` se termine en `active` : le lien vit, il n'est pas
         « terminé ».  outcome() lirait cet état comme un échec. */
      if (result && result.offline) return { queued:true };
      var cmd = result && result.command || {};
      if (cmd.status === 'failed' || cmd.status === 'blocked' || cmd.lastError) return { error:cmd.lastError || cmd.status || 'operation-failed' };
      if (cmd.status !== 'completed' && cmd.status !== 'active') return { error:cmd.status || 'operation-failed' };
      return { data:cmd.result || {} };
    }
    function openPayments(tab) {
      var c = text();
      consoleCss();
      tab = tab === 'links' ? 'links' : 'link';
      if (O.allowed && !O.allowed('payment', 'create-link')) {
        Kiwi.drawer({ title:c.lkTitle, subtitle:c.lkSub, fullpage:true,
          body:'<div class="ops-lk"><div class="p-card"><b>' + esc(c.lkDenied) + '</b><p class="ops-lk-hint" style="margin:8px 0 0">' + esc(c.lkDeniedD) + '</p></div></div>' });
        return;
      }

      var body = '<div class="ops-lk">' +
        '<div class="ops-lk-tabs" data-lens-demo>' +
          [['link', c.tabLink], ['links', c.tabLinks]].map(function (t) {
            return '<button class="ops-lk-tab' + (t[0] === tab ? ' on' : '') + '" type="button" data-lens-item data-lk-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
          }).join('') +
        '</div>' +
        '<section class="ops-lk-pane' + (tab === 'link' ? ' on' : '') + '" data-lk-pane="link">' +
          '<p class="ops-lk-hint">' + esc(c.lkHint) + '</p>' +
          '<div class="ops-lk-warn" data-lk-warn hidden></div>' +
          '<div class="kf-grid">' +
            '<label><span class="l">' + esc(c.amount) + '</span><input type="number" min="1" max="10000000" step="0.01" data-lk-amount></label>' +
            '<label><span class="l">' + esc(c.customer) + '</span><input maxlength="160" data-lk-customer></label>' +
            '<label style="grid-column:1/-1"><span class="l">' + esc(c.desc) + '</span><input maxlength="240" data-lk-desc></label>' +
          '</div>' +
          '<button class="kb atlas" style="width:100%;justify-content:center;margin-top:14px" type="button" data-lk-create>' + esc(c.create) + '</button>' +
          '<div class="ops-lk-out" data-lk-out></div>' +
        '</section>' +
        '<section class="ops-lk-pane' + (tab === 'links' ? ' on' : '') + '" data-lk-pane="links">' +
          '<button class="kb ghost xs" type="button" data-lk-refresh>' + esc(c.pRefresh) + '</button>' +
          '<div data-lk-book><p class="ops-lk-hint" style="margin-top:14px">' + esc(c.lkLoading) + '</p></div>' +
        '</section>' +
        '</div>';

      var res = Kiwi.drawer({ title:c.lkTitle, subtitle:c.lkSub, body:body, fullpage:true });
      var root = res.el;

      function kpi(k, v) { return '<div class="ops-lk-kpi"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }
      function card(el, code) { el.innerHTML = '<div class="p-card"><span class="chip pend">' + esc(acctError(code)) + '</span></div>'; }
      function amountField(row, key) {
        var input = row.querySelector('[data-lk-' + key + ']');
        return input ? input.value.trim() : '';
      }

      function linkCard(link) {
        var l = link || {};
        var status = (c.lkStatus && c.lkStatus[l.status]) || l.status || '';
        var refundable = Number(l.refundableCents || 0);
        var open = l.status === 'active' || l.status === 'pending';
        /* Ce que le serveur refuserait n'est pas peint : un lien encaissé n'a
           pas de bouton « annuler », un lien sans encaissement n'a pas de
           bouton « rembourser ».  Le refus reste côté serveur, mais le
           marchand n'a pas à le découvrir en cliquant. */
        return '<div class="p-card ops-lk-card" data-lk-row data-lk-ref="' + esc(l.reference) + '">' +
          '<div class="ops-lk-head">' +
            '<div class="ops-lk-num">' + esc(l.reference) + '</div>' +
            '<span class="ops-lk-state ' + esc(l.status || '') + '">' + esc(status) + '</span>' +
          '</div>' +
          ((l.customer || l.description) ? '<div class="ops-lk-sub">' + esc([l.customer, l.description].filter(Boolean).join(' · ')) + '</div>' : '') +
          '<div class="ops-lk-kpis">' +
            kpi(c.lkAmountK, money(l.amountCents)) +
            kpi(c.lkPaid, money(l.paidCents)) +
            kpi(c.lkRefunded, money(l.refundedCents)) +
            kpi(c.lkRefundable, money(refundable)) +
            kpi(c.lkRefundCount, String(l.refunds || 0)) +
          '</div>' +
          (l.url ? '<a class="ops-lk-url" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.url) + '</a>' +
            '<div class="ops-lk-btns"><button class="kb ghost xs" type="button" data-lk-copy>' + esc(c.lkCopy) + '</button></div>' : '') +
          '<div class="ops-lk-act">' +
            '<p class="ops-lk-actTitle">' + esc(c.lkSettleTitle) + '</p>' +
            '<p class="ops-lk-hint">' + esc(c.lkSettleHint) + '</p>' +
            '<div class="ops-lk-btns"><button class="kb ghost xs" type="button" data-lk-run="settle-link">' + esc(c.lkSettle) + '</button></div>' +
          '</div>' +
          (open ? '<div class="ops-lk-act">' +
            '<p class="ops-lk-actTitle">' + esc(c.lkCancelTitle) + '</p>' +
            '<p class="ops-lk-hint">' + esc(c.lkCancelHint) + '</p>' +
            '<label class="ops-lk-confirm"><input type="checkbox" data-lk-confirm="cancel-link"><span>' + esc(c.confirmLabel) + '</span></label>' +
            '<div class="ops-lk-btns"><button class="kb atlas xs" type="button" data-lk-run="cancel-link">' + esc(c.lkCancel) + '</button></div>' +
          '</div>' : '') +
          (refundable > 0 ? '<div class="ops-lk-act">' +
            '<p class="ops-lk-actTitle">' + esc(c.lkRefundTitle) + '</p>' +
            '<p class="ops-lk-hint">' + esc(c.lkRefundHint) + '</p>' +
            '<div class="ops-lk-refund">' +
              '<label><span class="l">' + esc(c.lkRefundAmount) + '</span><input type="number" min="0" step="0.01" data-lk-refund-amount></label>' +
              '<label><span class="l">' + esc(c.lkRefundReason) + '</span><input maxlength="240" data-lk-refund-reason></label>' +
              '<button class="kb atlas xs" type="button" data-lk-run="refund-link">' + esc(c.lkRefund) + '</button>' +
            '</div>' +
            '<label class="ops-lk-confirm"><input type="checkbox" data-lk-confirm="refund-link"><span>' + esc(c.confirmLabel) + '</span></label>' +
          '</div>' : '') +
          '<div class="ops-lk-out" data-lk-row-out></div>' +
        '</div>';
      }

      async function loadLinks() {
        var host = root.querySelector('[data-lk-book]');
        host.innerHTML = '<p class="ops-lk-hint" style="margin-top:14px">' + esc(c.lkLoading) + '</p>';
        try {
          var data = await O.payments({ limit:200 });
          warn(data && data.providers);
          var list = (data && data.links) || [];
          host.innerHTML = list.length ? list.map(linkCard).join('')
            : '<p class="ops-lk-hint" style="margin-top:14px">' + esc(c.lkNone) + '</p>';
        } catch (error) { card(host, error && (error.code || error.message)); }
      }
      /* Prévenir avant la saisie, pas après : sans fournisseur branché le
         serveur conserve la demande et ne renvoie aucun lien. */
      function warn(providers) {
        var box = root.querySelector('[data-lk-warn]');
        if (!providers || providers.payment !== false) { box.hidden = true; return; }
        box.hidden = false;
        box.innerHTML = '<div class="p-card"><span class="chip pend">' + esc(c.lkNoProvider) + '</span></div>';
      }

      root.addEventListener('click', function (event) {
        var pill = event.target.closest('[data-lk-tab]');
        if (pill) {
          root.querySelectorAll('[data-lk-tab]').forEach(function (el) { el.classList.toggle('on', el === pill); });
          root.querySelectorAll('[data-lk-pane]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-lk-pane') === pill.getAttribute('data-lk-tab')); });
          if (pill.getAttribute('data-lk-tab') === 'links') loadLinks();
          return;
        }
        if (event.target.closest('[data-lk-refresh]')) return void loadLinks();
        var copy = event.target.closest('[data-lk-copy]');
        if (copy) {
          var url = copy.closest('[data-lk-row]').querySelector('.ops-lk-url');
          if (!url) return;
          try { navigator.clipboard.writeText(url.getAttribute('href')).then(function () { Kiwi.toast(c.lkCopied, { type:'success' }); }, function () {}); }
          catch (_) {}
        }
      });

      root.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-lk-create]');
        if (!button) return;
        var amount = Number(root.querySelector('[data-lk-amount]').value);
        if (!(amount > 0)) return Kiwi.toast(c.invalid, { type:'warning' });
        button.disabled = true;
        var host = root.querySelector('[data-lk-out]');
        try {
          var result = await O.create('payment', 'create-link', {
            amount:amount, currency:'MAD',
            customer:root.querySelector('[data-lk-customer]').value,
            description:root.querySelector('[data-lk-desc]').value,
          });
          var got = linkOutcome(result);
          if (got.queued) { host.innerHTML = ''; return toastResult(result); }
          if (got.error) return card(host, got.error);
          host.innerHTML = linkCard(got.data);
          toastResult(result);
        } catch (error) { card(host, error && (error.code || error.message)); }
        finally { button.disabled = false; }
      });

      root.addEventListener('click', async function (event) {
        var button = event.target.closest('[data-lk-run]');
        if (!button) return;
        var action = button.getAttribute('data-lk-run');
        var row = button.closest('[data-lk-row]');
        var reference = row.getAttribute('data-lk-ref');
        /* Le serveur exige la confirmation pour annuler et pour rembourser —
           relever un état n'engage rien et n'en demande pas. */
        var need = action !== 'settle-link';
        var box = need ? row.querySelector('[data-lk-confirm="' + action + '"]') : null;
        if (need && !(box && box.checked)) return Kiwi.toast(c.confirmNeeded, { type:'warning' });
        var payload = { reference:reference };
        if (action === 'refund-link') {
          var asked = amountField(row, 'refund-amount');
          /* Vide = tout le remboursable : le serveur le calcule lui-même, et
             envoyer 0 se ferait refuser comme montant invalide. */
          if (asked !== '') {
            if (!(Number(asked) > 0)) return Kiwi.toast(c.invalid, { type:'warning' });
            payload.amount = Number(asked);
          }
          payload.reason = amountField(row, 'refund-reason');
        }
        button.disabled = true;
        var host = row.querySelector('[data-lk-row-out]');
        host.innerHTML = '';
        try {
          var result = await O.create('payment', action, payload, need ? { confirmed:true } : undefined);
          var got = linkOutcome(result);
          if (got.queued) return toastResult(result);
          if (got.error) { button.disabled = false; return card(host, got.error); }
          Kiwi.toast(got.data && got.data.alreadyCancelled ? c.lkAlready : c.lkDone,
            { type:got.data && got.data.alreadyCancelled ? 'info' : 'success' });
          loadLinks();
        } catch (error) { button.disabled = false; card(host, error && (error.code || error.message)); }
      });

      if (tab === 'links') loadLinks();
      else O.payments({ limit:1 }).then(function (data) { warn(data && data.providers); }, function () {});
    }

    var legacyAcct = {};
    ['open-comptabilite', 'acct-livre', 'acct-etats', 'acct-tva'].forEach(function (key) {
      legacyAcct[key] = H[key];
      var tab = key === 'open-comptabilite' ? 'invoice' : 'journal';
      H[key] = function () {
        if (!real() && legacyAcct[key]) return legacyAcct[key].apply(this, arguments);
        openLedger(tab);
      };
    });

    window.KiwiOperationsUI = { toastResult:toastResult, openHistory:H['operations-history'], openLedger:openLedger, openProcurement:openProcurement, openPayroll:openPayroll, openPayments:openPayments };
  }
  boot();
})();
