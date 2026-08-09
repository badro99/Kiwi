/* Kiwi trade operations schema
 * Durable, validated business records shared by dashboard and every exact POS.
 * No demo rows live here: schemas describe merchant data, never invent it. */
(function () {
  'use strict';

  const L = (fr, en, ar) => ({ fr, en, ar });
  const F = (id, type, label, opts) => ({ id, type, label, ...(opts || {}) });
  const T = (id, label, opts) => F(id, 'text', label, opts);
  const A = (id, label, opts) => F(id, 'textarea', label, opts);
  const N = (id, label, opts) => F(id, 'number', label, opts);
  const M = (id, label, opts) => F(id, 'money', label, opts);
  const D = (id, label, opts) => F(id, 'date', label, opts);
  const DT = (id, label, opts) => F(id, 'datetime-local', label, opts);
  const P = (id, label, opts) => F(id, 'tel', label, opts);
  const B = (id, label, opts) => F(id, 'checkbox', label, opts);
  const S = (id, label, values, opts) => F(id, 'select', label, { values, ...(opts || {}) });
  const R = (id, label, relation, opts) => F(id, 'relation', label, { relation, ...(opts || {}) });
  const O = (value, fr, en, ar) => ({ value, label: L(fr, en, ar) });
  const required = { required: true };
  const title = (label, opts) => T('title', label, { ...required, ...(opts || {}) });
  const phone = P('phone', L('Téléphone', 'Phone', 'الهاتف'), { autocomplete: 'tel' });
  const total = M('total', L('Montant total', 'Total amount', 'المبلغ الإجمالي'), { min: 0 });
  const paid = M('paid', L('Déjà réglé', 'Already paid', 'المؤدى'), { min: 0, lte: 'total' });
  const amount = M('amount', L('Montant', 'Amount', 'المبلغ'), { min: 0 });
  const qty = N('qty', L('Quantité', 'Quantity', 'الكمية'), { min: 0, step: 1 });
  const note = A('note', L('Notes opérationnelles', 'Operational notes', 'ملاحظات تشغيلية'), { full: true, max: 1200 });
  const yesNo = [O('yes', 'Oui', 'Yes', 'نعم'), O('no', 'Non', 'No', 'لا')];
  const active = S('active', L('Actif', 'Active', 'نشط'), yesNo, { default: 'yes' });
  const channel = S('channel', L('Canal', 'Channel', 'القناة'), [O('counter','Comptoir','Counter','الكاونتر'),O('kiosk','Borne','Kiosk','الشاشة'),O('phone','Téléphone','Phone','الهاتف'),O('web','En ligne','Online','عبر الإنترنت'),O('delivery','Livraison','Delivery','التوصيل')]);
  const stages = {
    order:[L('Reçu','Received','تم الاستلام'),L('En préparation','Preparing','قيد التحضير'),L('Prêt','Ready','جاهز'),L('Remis','Handed over','تم التسليم')],
    delivery:[L('À planifier','To schedule','للتخطيط'),L('Assignée','Assigned','تم التعيين'),L('En route','On the way','في الطريق'),L('Livrée','Delivered','تم التوصيل')],
    appointment:[L('À confirmer','To confirm','للتأكيد'),L('Confirmé','Confirmed','مؤكد'),L('En cours','In progress','قيد التنفيذ'),L('Terminé','Done','مكتمل')],
    ledger:[L('Ouvert','Open','مفتوح'),L('Partiel','Partial','جزئي'),L('Réglé','Settled','مؤدى')],
    checklist:[L('À traiter','To do','للمعالجة'),L('En cours','In progress','قيد التنفيذ'),L('Terminé','Done','مكتمل')],
    claim:[L('À envoyer','To submit','للإرسال'),L('Envoyé','Submitted','مرسل'),L('Accepté','Accepted','مقبول'),L('Réglé','Paid','مؤدى')],
    catalog:[L('Brouillon','Draft','مسودة'),L('Actif','Active','نشط'),L('Archivé','Archived','مؤرشف')],
  };
  const defs = Object.create(null);
  const add = (trade, nav, fields, opts) => { defs[trade + ':' + nav] = { trade, nav, fields, ...(opts || {}), stages: stages[(opts && opts.stages) || 'checklist'] }; };

  add('fastfood','tables',[title(L('Poste de commande','Order station','نقطة الطلب')),channel,S('state',L('État du poste','Station state','حالة النقطة'),[O('open','Ouvert','Open','مفتوح'),O('degraded','Dégradé','Degraded','متدهور'),O('closed','Fermé','Closed','مغلق')],required),DT('checkedAt',L('Dernier contrôle','Last check','آخر فحص')),note],{stages:'checklist',card:['channel','state','checkedAt']});
  add('fastfood','kds',[title(L('Référence commande','Order reference','مرجع الطلب')),channel,N('items',L('Nombre d’articles','Item count','عدد العناصر'),{min:1,step:1}),DT('promisedAt',L('Heure promise','Promised time','الوقت الموعود'),{deadline:true}),amount,note],{stages:'order',card:['channel','items','promisedAt','amount'],deadline:'promisedAt'});
  add('fastfood','channels',[title(L('Référence commande','Order reference','مرجع الطلب')),channel,T('customer',L('Client','Customer','العميل')),phone,T('address',L('Adresse de livraison','Delivery address','عنوان التوصيل'),{full:true}),DT('promisedAt',L('Heure promise','Promised time','الوقت الموعود'),{deadline:true}),amount,note],{stages:'delivery',card:['channel','customer','promisedAt','amount'],deadline:'promisedAt'});

  add('bakery','tables',[title(L('Client ou référence','Customer or reference','العميل أو المرجع')),phone,T('product',L('Produit demandé','Requested product','المنتج المطلوب'),required),qty,DT('promisedAt',L('Retrait promis','Promised pickup','موعد الاستلام'),{deadline:true}),total,paid,note],{stages:'appointment',card:['product','qty','promisedAt','balance'],deadline:'promisedAt',calc:{balance:['total','paid']}});
  add('bakery','kds',[title(L('Produit / fournée','Product / batch','المنتج / الدفعة')),N('plannedQty',L('Quantité prévue','Planned quantity','الكمية المخططة'),{min:1,step:1,required:true}),N('actualQty',L('Quantité sortie','Actual output','الكمية المنتجة'),{min:0,step:1}),DT('plannedAt',L('Début prévu','Planned start','البداية المخططة'),{deadline:true}),T('oven',L('Four / poste','Oven / station','الفرن / المحطة')),N('temperature',L('Température °C','Temperature °C','الحرارة °م'),{min:0,max:500}),note],{stages:'order',card:['plannedQty','actualQty','plannedAt','oven'],deadline:'plannedAt'});
  add('bakery','waste',[title(L('Produit / lot','Product / batch','المنتج / الدفعة')),D('date',L('Date','Date','التاريخ'),{required:true}),qty,S('outcome',L('Destination','Outcome','الوجهة'),[O('unsold','Invendu','Unsold','غير مباع'),O('donation','Don','Donation','تبرع'),O('reuse','Réemploi','Reuse','إعادة استعمال'),O('loss','Perte','Loss','خسارة')],required),amount,T('beneficiary',L('Bénéficiaire / motif','Beneficiary / reason','المستفيد / السبب')),note],{stages:'checklist',card:['date','qty','outcome','amount']});

  add('pizzeria','kds',[title(L('Référence commande','Order reference','مرجع الطلب')),N('pizzas',L('Nombre de pizzas','Pizza count','عدد البيتزا'),{min:1,step:1,required:true}),S('size',L('Format principal','Main size','الحجم الرئيسي'),[O('small','Petite','Small','صغيرة'),O('medium','Moyenne','Medium','متوسطة'),O('large','Grande','Large','كبيرة'),O('mixed','Mixte','Mixed','مختلط')]),T('oven',L('Four / emplacement','Oven / position','الفرن / المكان')),DT('promisedAt',L('Heure promise','Promised time','الوقت الموعود'),{deadline:true}),amount,note],{stages:'order',card:['pizzas','size','promisedAt','amount'],deadline:'promisedAt'});
  add('pizzeria','delivery',[title(L('Référence livraison','Delivery reference','مرجع التوصيل')),R('orderRef',L('Commande liée','Linked order','الطلب المرتبط'),'kds'),T('customer',L('Client','Customer','العميل'),required),phone,T('address',L('Adresse','Address','العنوان'),{required:true,full:true}),T('zone',L('Zone','Zone','المنطقة')),T('courier',L('Livreur','Courier','الموصل')),DT('promisedAt',L('Heure promise','Promised time','الوقت الموعود'),{deadline:true}),total,paid,note],{stages:'delivery',card:['customer','zone','courier','promisedAt','balance'],deadline:'promisedAt',calc:{balance:['total','paid']}});

  add('traiteur','tables',[title(L('Événement','Event','الفعالية')),T('customer',L('Client','Customer','العميل'),required),phone,DT('eventAt',L('Date et heure','Date and time','التاريخ والوقت'),{required:true,deadline:true}),T('venue',L('Lieu','Venue','المكان'),{required:true}),N('guests',L('Nombre de convives','Guest count','عدد الضيوف'),{min:1,step:1}),total,paid,note],{stages:'appointment',card:['customer','eventAt','venue','guests','balance'],deadline:'eventAt',calc:{balance:['total','paid']}});
  add('traiteur','kds',[title(L('Lot de production','Production batch','دفعة الإنتاج')),R('eventRef',L('Événement lié','Linked event','الفعالية المرتبطة'),'tables'),T('course',L('Service / plat','Course / dish','الخدمة / الطبق'),required),qty,DT('dueAt',L('Prêt pour','Ready by','جاهز في'),{deadline:true}),T('owner',L('Responsable','Owner','المسؤول')),note],{stages:'order',card:['eventRef','course','qty','dueAt','owner'],deadline:'dueAt'});
  add('traiteur','quotes',[title(L('Référence devis','Quote reference','مرجع العرض')),T('customer',L('Client','Customer','العميل'),required),phone,D('eventDate',L('Date de l’événement','Event date','تاريخ الفعالية'),{required:true}),N('guests',L('Convives','Guests','الضيوف'),{min:1,step:1}),total,D('expiresAt',L('Validité du devis','Quote expiry','صلاحية العرض'),{deadline:true}),note],{stages:'appointment',card:['customer','eventDate','guests','total','expiresAt'],deadline:'expiresAt'});
  add('traiteur','deposits',[title(L('Référence échéance','Milestone reference','مرجع الاستحقاق')),R('eventRef',L('Événement lié','Linked event','الفعالية المرتبطة'),'tables'),total,paid,D('dueAt',L('Échéance','Due date','الاستحقاق'),{deadline:true}),S('method',L('Moyen de paiement','Payment method','وسيلة الدفع'),[O('cash','Espèces','Cash','نقداً'),O('card','Carte','Card','بطاقة'),O('transfer','Virement','Transfer','تحويل'),O('other','Autre','Other','أخرى')]),note],{stages:'ledger',card:['eventRef','dueAt','balance','method'],deadline:'dueAt',calc:{balance:['total','paid']}});

  add('foodtruck','tables',[title(L('Emplacement / arrêt','Location / stop','الموقع / المحطة')),T('address',L('Adresse / repère','Address / landmark','العنوان / العلامة'),{required:true,full:true}),DT('startAt',L('Arrivée prévue','Planned arrival','الوصول المخطط'),{required:true}),DT('endAt',L('Départ prévu','Planned departure','المغادرة المخططة'),{gte:'startAt'}),T('permitRef',L('Autorisation / référence','Permit / reference','الترخيص / المرجع')),M('target',L('Objectif de ventes','Sales target','هدف المبيعات'),{min:0}),note],{stages:'appointment',card:['address','startAt','endAt','permitRef','target'],deadline:'startAt'});
  add('foodtruck','kds',[title(L('Référence commande','Order reference','مرجع الطلب')),N('items',L('Articles','Items','العناصر'),{min:1,step:1}),DT('promisedAt',L('Heure promise','Promised time','الوقت الموعود'),{deadline:true}),amount,note],{stages:'order',card:['items','promisedAt','amount'],deadline:'promisedAt'});
  add('foodtruck','vehicle',[title(L('Contrôle','Check','الفحص')),S('checkType',L('Zone contrôlée','Check area','منطقة الفحص'),[O('gas','Gaz','Gas','الغاز'),O('water','Eau','Water','الماء'),O('cold','Chaîne du froid','Cold chain','التبريد'),O('power','Énergie','Power','الطاقة'),O('hygiene','Hygiène','Hygiene','النظافة'),O('closing','Fermeture','Closing','الإغلاق')],required),DT('checkedAt',L('Contrôlé à','Checked at','تم الفحص في'),{required:true}),N('reading',L('Mesure / niveau','Reading / level','القياس / المستوى'),{min:0}),N('minimum',L('Seuil minimum','Minimum threshold','الحد الأدنى'),{min:0}),B('passed',L('Contrôle conforme','Check passed','الفحص مطابق'),{default:true}),note],{stages:'checklist',card:['checkType','checkedAt','reading','minimum','passed'],threshold:['reading','minimum']});

  add('epicerie','returns',[title(L('Produit','Product','المنتج')),T('barcode',L('Code-barres / lot','Barcode / lot','الباركود / الدفعة')),qty,S('reason',L('Motif','Reason','السبب'),[O('return','Retour client','Customer return','إرجاع عميل'),O('breakage','Casse','Breakage','تالف'),O('shortage','Écart','Discrepancy','فرق'),O('expiry','Périmé','Expired','منتهي')],required),T('supplier',L('Fournisseur','Supplier','المورد')),D('date',L('Date','Date','التاريخ'),{required:true}),amount,note],{stages:'checklist',card:['barcode','qty','reason','supplier','amount']});
  add('epicerie','credit',[title(L('Client','Customer','العميل')),phone,T('reference',L('Référence ticket','Receipt reference','مرجع التذكرة')),total,paid,D('dueAt',L('Échéance convenue','Promised due date','موعد الأداء'),{deadline:true}),note],{stages:'ledger',card:['phone','reference','dueAt','balance'],deadline:'dueAt',calc:{balance:['total','paid']}});
  add('epicerie','suppliers',[title(L('Fournisseur','Supplier','المورد')),T('contact',L('Contact','Contact','جهة الاتصال')),phone,T('orderRef',L('Référence commande','Order reference','مرجع الطلب')),DT('expectedAt',L('Livraison attendue','Expected delivery','التوصيل المتوقع'),{deadline:true}),total,paid,note],{stages:'appointment',card:['contact','orderRef','expectedAt','balance'],deadline:'expectedAt',calc:{balance:['total','paid']}});

  add('pharmacie','returns',[title(L('Médicament / produit','Medicine / product','الدواء / المنتج')),T('lot',L('Numéro de lot','Lot number','رقم الدفعة'),required),T('supplier',L('Laboratoire / grossiste','Lab / wholesaler','المختبر / الموزع'),required),qty,S('reason',L('Motif','Reason','السبب'),[O('recall','Rappel','Recall','سحب'),O('expiry','Péremption','Expiry','انتهاء الصلاحية'),O('damage','Endommagé','Damaged','تالف'),O('error','Erreur livraison','Delivery error','خطأ توصيل')],required),D('date',L('Date d’isolement','Isolation date','تاريخ العزل'),{required:true}),amount,note],{stages:'checklist',card:['lot','supplier','qty','reason','date']});
  add('pharmacie','prescriptions',[title(L('Référence ordonnance','Prescription reference','مرجع الوصفة')),T('patient',L('Patient','Patient','المريض'),required),phone,T('doctor',L('Prescripteur','Prescriber','الطبيب')),A('items',L('Produits à préparer','Items to prepare','المنتجات للتحضير'),{required:true,full:true,max:1600}),DT('receivedAt',L('Reçue à','Received at','تم الاستلام في'),{required:true}),DT('promisedAt',L('Délivrance prévue','Dispensing promise','موعد التسليم'),{deadline:true}),amount,note],{stages:'order',card:['patient','doctor','receivedAt','promisedAt','amount'],deadline:'promisedAt'});
  add('pharmacie','insurers',[title(L('Référence dossier','Claim reference','مرجع الملف')),T('patient',L('Patient','Patient','المريض'),required),T('insurer',L('Organisme','Insurer','الجهة المؤمنة'),required),D('submittedAt',L('Date d’envoi','Submission date','تاريخ الإرسال')),M('claimAmount',L('Montant demandé','Claim amount','المبلغ المطلوب'),{min:0,required:true}),M('reimbursed',L('Montant remboursé','Reimbursed amount','المبلغ المسترجع'),{min:0,lte:'claimAmount'}),D('dueAt',L('Relance prévue','Follow-up date','موعد المتابعة'),{deadline:true}),note],{stages:'claim',card:['patient','insurer','claimAmount','reimbursed','claimBalance'],deadline:'dueAt',calc:{claimBalance:['claimAmount','reimbursed']}});
  add('pharmacie','expiries',[title(L('Médicament / produit','Medicine / product','الدواء / المنتج')),T('lot',L('Numéro de lot','Lot number','رقم الدفعة'),{required:true,unique:true}),D('expiryAt',L('Date de péremption','Expiry date','تاريخ الانتهاء'),{required:true,expiry:true}),qty,M('purchaseCost',L('Valeur du lot','Lot value','قيمة الدفعة'),{min:0}),B('coldChain',L('Chaîne du froid','Cold chain','سلسلة التبريد')),S('action',L('Action prévue','Planned action','الإجراء المخطط'),[O('watch','Surveiller','Monitor','مراقبة'),O('rotate','Prioriser la vente','Prioritise sale','أولوية البيع'),O('return','Retour fournisseur','Supplier return','إرجاع للمورد'),O('isolate','Isoler','Isolate','عزل')]),note],{stages:'checklist',card:['lot','expiryAt','qty','purchaseCost','coldChain'],expiry:'expiryAt'});
  add('pharmacie','duty',[title(L('Responsable de garde','Duty lead','مسؤول الحراسة')),DT('startAt',L('Début','Start','البداية'),{required:true}),DT('endAt',L('Fin','End','النهاية'),{required:true,gte:'startAt'}),T('handoverTo',L('Relève à','Handover to','التسليم إلى')),A('handover',L('Points de relève','Handover points','نقاط التسليم'),{required:true,full:true}),note],{stages:'appointment',card:['startAt','endAt','handoverTo']});

  add('librairie','returns',[title(L('Titre','Title','العنوان')),T('isbn',L('ISBN / référence','ISBN / reference','ISBN / المرجع')),T('publisher',L('Éditeur / distributeur','Publisher / distributor','الناشر / الموزع'),required),qty,D('returnBy',L('Retour avant','Return by','الإرجاع قبل'),{deadline:true}),amount,note],{stages:'checklist',card:['isbn','publisher','qty','returnBy','amount'],deadline:'returnBy'});
  add('librairie','bookorders',[title(L('Livre demandé','Requested book','الكتاب المطلوب')),T('isbn',L('ISBN','ISBN','ISBN')),T('customer',L('Lecteur / client','Reader / customer','القارئ / العميل'),required),phone,T('supplier',L('Fournisseur','Supplier','المورد')),DT('promisedAt',L('Retrait promis','Promised pickup','موعد الاستلام'),{deadline:true}),total,paid,note],{stages:'order',card:['isbn','customer','supplier','promisedAt','balance'],deadline:'promisedAt',calc:{balance:['total','paid']}});
  add('librairie','schoollists',[title(L('École / liste','School / list','المدرسة / اللائحة')),T('level',L('Niveau / classe','Year / class','المستوى / القسم'),required),T('family',L('Famille / élève','Family / student','العائلة / التلميذ'),required),phone,A('items',L('Titres et quantités','Titles and quantities','العناوين والكميات'),{required:true,full:true,max:2400}),D('neededAt',L('Nécessaire avant','Needed by','مطلوب قبل'),{deadline:true}),total,paid,note],{stages:'order',card:['level','family','neededAt','balance'],deadline:'neededAt',calc:{balance:['total','paid']}});

  add('fleuriste','returns',[title(L('Variété / produit','Variety / product','الصنف / المنتج')),T('arrivalRef',L('Arrivage / lot','Arrival / lot','الوصول / الدفعة')),qty,S('reason',L('Motif','Reason','السبب'),[O('wilted','Fané','Wilted','ذابل'),O('damaged','Abîmé','Damaged','تالف'),O('unsold','Invendu','Unsold','غير مباع'),O('supplier','Retour fournisseur','Supplier return','إرجاع للمورد')],required),D('date',L('Date','Date','التاريخ'),{required:true}),amount,note],{stages:'checklist',card:['arrivalRef','qty','reason','date','amount']});
  add('fleuriste','flowerorders',[title(L('Référence commande','Order reference','مرجع الطلب')),T('customer',L('Client payeur','Paying customer','العميل الدافع'),required),phone,T('recipient',L('Destinataire','Recipient','المستفيد'),required),P('recipientPhone',L('Téléphone destinataire','Recipient phone','هاتف المستفيد')),S('occasion',L('Occasion','Occasion','المناسبة'),[O('birthday','Anniversaire','Birthday','عيد ميلاد'),O('wedding','Mariage','Wedding','زفاف'),O('birth','Naissance','New baby','مولود'),O('condolence','Condoléances','Condolence','تعزية'),O('other','Autre','Other','أخرى')]),A('message',L('Texte de la carte','Card message','نص البطاقة'),{full:true,max:500}),DT('promisedAt',L('Heure promise','Promised time','الوقت الموعود'),{deadline:true}),total,paid,note],{stages:'order',card:['recipient','occasion','promisedAt','balance'],deadline:'promisedAt',calc:{balance:['total','paid']}});
  add('fleuriste','delivery',[title(L('Référence livraison','Delivery reference','مرجع التوصيل')),R('orderRef',L('Commande fleurs','Flower order','طلب الزهور'),'flowerorders'),T('address',L('Adresse complète','Full address','العنوان الكامل'),{required:true,full:true}),T('zone',L('Zone','Zone','المنطقة')),T('courier',L('Livreur','Courier','الموصل')),DT('promisedAt',L('Créneau promis','Promised slot','الموعد الموعود'),{deadline:true}),M('fee',L('Frais de livraison','Delivery fee','رسوم التوصيل'),{min:0}),note],{stages:'delivery',card:['orderRef','zone','courier','promisedAt','fee'],deadline:'promisedAt'});
  add('fleuriste','freshness',[title(L('Variété','Variety','الصنف')),T('supplier',L('Fournisseur','Supplier','المورد')),D('arrivalAt',L('Date d’arrivage','Arrival date','تاريخ الوصول'),{required:true}),qty,N('usableQty',L('Quantité utilisable','Usable quantity','الكمية الصالحة'),{min:0,lte:'qty'}),M('cost',L('Coût arrivage','Arrival cost','تكلفة الوصول'),{min:0}),N('vaseLifeDays',L('Tenue estimée (jours)','Expected vase life (days)','العمر المتوقع (أيام)'),{min:0,step:1}),note],{stages:'checklist',card:['supplier','arrivalAt','qty','usableQty','wasteQty','cost'],calc:{wasteQty:['qty','usableQty']}});

  const serviceFields = (name) => [title(name),T('category',L('Catégorie','Category','الفئة')),N('durationMinutes',L('Durée (minutes)','Duration (minutes)','المدة (دقائق)'),{min:5,step:5,required:true}),M('price',L('Prix','Price','السعر'),{min:0,required:true}),A('protocol',L('Protocole / contenu','Protocol / contents','البروتوكول / المحتوى'),{full:true}),active,note];
  const practitionerFields = (name) => [title(name),phone,T('specialty',L('Spécialité','Specialty','التخصص'),required),A('availability',L('Disponibilités','Availability','التوفر'),{full:true}),active,note];
  const clientFields = (name) => [title(name),phone,A('preferences',L('Préférences','Preferences','التفضيلات'),{full:true}),A('contraindications',L('Contre-indications / précautions','Contraindications / precautions','موانع / احتياطات'),{full:true}),B('consent',L('Consentement enregistré','Consent recorded','تم تسجيل الموافقة')),D('lastVisit',L('Dernière visite','Last visit','آخر زيارة')),note];
  add('spa','appointments',[title(L('Référence rendez-vous','Appointment reference','مرجع الموعد')),R('clientRef',L('Client','Guest','العميل'),'clients',{required:true}),R('serviceRef',L('Soin','Treatment','العلاج'),'services',{required:true}),R('practitionerRef',L('Praticien·ne','Practitioner','الممارس'),'practitioners',{required:true}),DT('startAt',L('Début','Start','البداية'),{required:true,deadline:true}),DT('endAt',L('Fin','End','النهاية'),{required:true,gte:'startAt'}),T('room',L('Cabine','Room','الغرفة')),total,paid,note],{stages:'appointment',card:['clientRef','serviceRef','practitionerRef','startAt','room','balance'],deadline:'startAt',calc:{balance:['total','paid']}});
  add('spa','services',serviceFields(L('Soin / rituel','Treatment / ritual','العلاج / الطقس')),{stages:'catalog',card:['category','durationMinutes','price','active']});
  add('spa','practitioners',practitionerFields(L('Nom','Name','الاسم')),{stages:'catalog',card:['phone','specialty','active']});
  add('spa','clients',clientFields(L('Client','Guest','العميل')),{stages:'catalog',card:['phone','lastVisit','consent']});
  add('spa','packages',[title(L('Cure / carte','Package / card','الباقة / البطاقة')),R('clientRef',L('Client','Guest','العميل'),'clients',{required:true}),N('sessionsTotal',L('Séances incluses','Included sessions','الجلسات المشمولة'),{min:1,step:1,required:true}),N('sessionsUsed',L('Séances consommées','Used sessions','الجلسات المستعملة'),{min:0,step:1,lte:'sessionsTotal'}),D('expiresAt',L('Expiration','Expiry','الانتهاء'),{expiry:true}),total,paid,note],{stages:'ledger',card:['clientRef','sessionsTotal','sessionsUsed','sessionsLeft','expiresAt','balance'],expiry:'expiresAt',calc:{sessionsLeft:['sessionsTotal','sessionsUsed'],balance:['total','paid']}});

  add('coiffure','appointments',[title(L('Référence rendez-vous','Appointment reference','مرجع الموعد')),R('clientRef',L('Client','Client','العميل'),'clients',{required:true}),R('serviceRef',L('Prestation','Service','الخدمة'),'services',{required:true}),R('practitionerRef',L('Coiffeur·euse','Stylist','المصفف'),'practitioners',{required:true}),DT('startAt',L('Début','Start','البداية'),{required:true,deadline:true}),DT('endAt',L('Fin','End','النهاية'),{required:true,gte:'startAt'}),T('chair',L('Fauteuil','Chair','الكرسي')),total,paid,note],{stages:'appointment',card:['clientRef','serviceRef','practitionerRef','startAt','chair','balance'],deadline:'startAt',calc:{balance:['total','paid']}});
  add('coiffure','services',[...serviceFields(L('Prestation / forfait','Service / package','الخدمة / الباقة')).slice(0,-2),N('commissionRate',L('Commission (%)','Commission (%)','العمولة (%)'),{min:0,max:100}),active,note],{stages:'catalog',card:['category','durationMinutes','price','commissionRate','active']});
  add('coiffure','practitioners',[title(L('Nom','Name','الاسم')),phone,T('specialty',L('Spécialité','Specialty','التخصص'),required),N('commissionRate',L('Commission (%)','Commission (%)','العمولة (%)'),{min:0,max:100}),A('availability',L('Disponibilités','Availability','التوفر'),{full:true}),active,note],{stages:'catalog',card:['phone','specialty','commissionRate','active']});
  add('coiffure','clients',[...clientFields(L('Client','Client','العميل')),R('formulaRef',L('Dernière formule couleur','Latest colour formula','آخر تركيبة لون'),'formulas')],{stages:'catalog',card:['phone','lastVisit','consent','formulaRef']});
  add('coiffure','formulas',[title(L('Nom de la formule','Formula name','اسم التركيبة')),R('clientRef',L('Client','Client','العميل'),'clients',{required:true}),T('brand',L('Marque','Brand','العلامة'),required),T('shade',L('Nuance / références','Shade / references','الدرجة / المراجع'),{required:true,full:true}),T('developer',L('Oxydant','Developer','المؤكسد')),T('ratio',L('Dosage','Ratio','النسبة')),N('processingMinutes',L('Temps de pose (min)','Processing time (min)','مدة التطبيق (د)'),{min:0,step:5}),A('result',L('Résultat / ajustements','Result / adjustments','النتيجة / التعديلات'),{full:true}),note],{stages:'catalog',card:['clientRef','brand','shade','ratio','processingMinutes']});
  add('coiffure','chairs',[title(L('Passage / ticket','Visit / ticket','الزيارة / التذكرة')),R('clientRef',L('Client','Client','العميل'),'clients'),R('practitionerRef',L('Coiffeur·euse','Stylist','المصفف'),'practitioners',{required:true}),R('serviceRef',L('Prestation','Service','الخدمة'),'services'),DT('startedAt',L('Début de prise en charge','Service start','بداية الخدمة'),{required:true}),T('chair',L('Fauteuil','Chair','الكرسي'),required),amount,note],{stages:'order',card:['clientRef','practitionerRef','serviceRef','startedAt','chair','amount']});

  add('sport','appointments',[title(L('Cours','Class','الحصة')),R('coachRef',L('Coach','Coach','المدرب'),'practitioners',{required:true}),DT('startAt',L('Début','Start','البداية'),{required:true,deadline:true}),DT('endAt',L('Fin','End','النهاية'),{required:true,gte:'startAt'}),N('capacity',L('Capacité','Capacity','السعة'),{min:1,step:1,required:true}),N('booked',L('Réservations','Bookings','الحجوزات'),{min:0,step:1,lte:'capacity'}),M('price',L('Prix par place','Price per spot','سعر المكان'),{min:0}),note],{stages:'appointment',card:['coachRef','startAt','capacity','booked','spotsLeft','price'],deadline:'startAt',calc:{spotsLeft:['capacity','booked']}});
  add('sport','services',[title(L('Abonnement / offre','Membership / plan','الاشتراك / العرض')),N('durationDays',L('Durée (jours)','Duration (days)','المدة (أيام)'),{min:1,step:1,required:true}),M('price',L('Prix','Price','السعر'),{min:0,required:true}),A('terms',L('Conditions et accès','Terms and access','الشروط والدخول'),{full:true}),active,note],{stages:'catalog',card:['durationDays','price','active']});
  add('sport','practitioners',practitionerFields(L('Coach','Coach','المدرب')),{stages:'catalog',card:['phone','specialty','active']});
  add('sport','clients',[title(L('Adhérent','Member','العضو')),phone,R('planRef',L('Abonnement','Membership','الاشتراك'),'services'),D('startAt',L('Début','Start','البداية')),D('expiresAt',L('Expiration','Expiry','الانتهاء'),{expiry:true}),T('emergency',L('Contact d’urgence','Emergency contact','اتصال الطوارئ')),total,paid,note],{stages:'ledger',card:['phone','planRef','expiresAt','balance'],expiry:'expiresAt',calc:{balance:['total','paid']}});
  add('sport','checkins',[title(L('Référence passage','Check-in reference','مرجع الدخول')),R('memberRef',L('Adhérent','Member','العضو'),'clients',{required:true}),DT('checkedAt',L('Heure de passage','Check-in time','وقت الدخول'),{required:true}),S('access',L('Décision d’accès','Access decision','قرار الدخول'),[O('allowed','Autorisé','Allowed','مسموح'),O('denied','Refusé','Denied','مرفوض')],required),T('reason',L('Motif / remarque','Reason / note','السبب / الملاحظة'),{full:true}),note],{stages:'checklist',card:['memberRef','checkedAt','access','reason']});
  add('sport','renewals',[title(L('Référence renouvellement','Renewal reference','مرجع التجديد')),R('memberRef',L('Adhérent','Member','العضو'),'clients',{required:true}),R('planRef',L('Nouvelle offre','New plan','العرض الجديد'),'services'),D('startAt',L('Début','Start','البداية'),{required:true}),D('expiresAt',L('Nouvelle expiration','New expiry','الانتهاء الجديد'),{required:true,expiry:true}),total,paid,note],{stages:'ledger',card:['memberRef','planRef','startAt','expiresAt','balance'],expiry:'expiresAt',calc:{balance:['total','paid']}});

  add('autre','workflows',[title(L('Dossier / prestation','Job / service','الملف / الخدمة')),T('customer',L('Client','Customer','العميل')),phone,T('owner',L('Responsable','Owner','المسؤول')),DT('dueAt',L('Échéance','Deadline','الموعد'),{deadline:true}),total,paid,note],{stages:'order',card:['customer','owner','dueAt','balance'],deadline:'dueAt',calc:{balance:['total','paid']}});
  add('autre','returns',[title(L('Référence incident','Incident reference','مرجع الحادث')),T('customer',L('Client','Customer','العميل')),S('kind',L('Type','Type','النوع'),[O('return','Retour','Return','إرجاع'),O('complaint','Réclamation','Complaint','شكوى'),O('damage','Dommage','Damage','ضرر'),O('other','Autre','Other','أخرى')],required),DT('reportedAt',L('Signalé à','Reported at','تم الإبلاغ في'),{required:true}),amount,A('resolution',L('Résolution','Resolution','الحل'),{full:true}),note],{stages:'checklist',card:['customer','kind','reportedAt','amount','resolution']});

  function get(trade, nav) { return defs[String(trade || '') + ':' + String(nav || '')] || null; }
  function scalar(field, raw) {
    if (field.type === 'checkbox') return raw === true || raw === 'true' || raw === '1' || raw === 'yes';
    if (field.type === 'number' || field.type === 'money') return raw === '' || raw == null ? 0 : Math.max(0, Number(raw) || 0);
    return String(raw == null ? '' : raw).trim().slice(0, field.max || (field.type === 'textarea' ? 2400 : 240));
  }
  function normalize(schema, input) {
    const old = input || {}, source = old.values || old, values = {};
    (schema && schema.fields || []).forEach((field) => { values[field.id] = scalar(field, source[field.id] == null ? field.default : source[field.id]); });
    if (!values.title) values.title = String(old.title || '').trim().slice(0, 140);
    if (!values.note) values.note = String(old.note || '').trim().slice(0, 1200);
    if (!values.amount && old.amount) values.amount = Math.max(0, Number(old.amount) || 0);
    if (!values.total && old.amount) values.total = Math.max(0, Number(old.amount) || 0);
    if (!values.dueAt && !values.promisedAt && !values.expiryAt && old.date) values.date = String(old.date).slice(0, 16);
    return { ...old, title: values.title || String(old.title || ''), note: values.note || '', values };
  }
  function compareValue(type, value) {
    if (type === 'date' || type === 'datetime-local') return value ? new Date(value + (type === 'date' ? 'T12:00:00' : '')).getTime() : 0;
    return Number(value) || 0;
  }
  function validate(schema, input, existingRows) {
    const rec = normalize(schema, input), errors = {};
    (schema && schema.fields || []).forEach((field) => {
      const value = rec.values[field.id];
      if (field.required && (value === '' || value == null || value === false)) errors[field.id] = 'required';
      if ((field.type === 'number' || field.type === 'money') && value !== '') {
        if (field.min != null && Number(value) < field.min) errors[field.id] = 'min';
        if (field.max != null && Number(value) > field.max) errors[field.id] = 'max';
      }
      if (field.lte && compareValue(field.type, value) > compareValue(field.type, rec.values[field.lte])) errors[field.id] = 'lte';
      if (field.gte && compareValue(field.type, value) < compareValue(field.type, rec.values[field.gte])) errors[field.id] = 'gte';
      if (field.type === 'tel' && value && !/^[+()\d\s.-]{6,24}$/.test(value)) errors[field.id] = 'phone';
      if (field.unique && value && (existingRows || []).some((r) => r.id !== rec.id && normalize(schema, r).values[field.id] === value)) errors[field.id] = 'unique';
    });
    return { ok: !Object.keys(errors).length, errors, record: rec };
  }
  function derived(schema, input, now) {
    const rec = normalize(schema, input), v = rec.values, out = {};
    Object.entries((schema && schema.calc) || {}).forEach(([id, pair]) => { out[id] = Math.max(0, (Number(v[pair[0]]) || 0) - (Number(v[pair[1]]) || 0)); });
    const final = (+rec.status || 0) >= Math.max(0, (schema && schema.stages || []).length - 1);
    const clock = now == null ? Date.now() : +now;
    if (schema && schema.deadline && v[schema.deadline]) {
      const due = new Date(v[schema.deadline] + (String(v[schema.deadline]).length === 10 ? 'T23:59:59' : '')).getTime();
      out.late = !final && Number.isFinite(due) && due < clock;
    }
    if (schema && schema.expiry && v[schema.expiry]) {
      const expiry = new Date(v[schema.expiry] + 'T23:59:59').getTime();
      out.daysToExpiry = Number.isFinite(expiry) ? Math.ceil((expiry - clock) / 86400000) : null;
      out.expired = out.daysToExpiry != null && out.daysToExpiry < 0;
      out.expiring = out.daysToExpiry != null && out.daysToExpiry >= 0 && out.daysToExpiry <= 30;
    }
    if (schema && schema.threshold) out.belowThreshold = (Number(v[schema.threshold[0]]) || 0) < (Number(v[schema.threshold[1]]) || 0);
    if (Object.prototype.hasOwnProperty.call(v, 'passed')) out.failed = v.passed === false;
    out.alert = !!(out.late || out.expired || out.expiring || out.belowThreshold || out.failed || Object.keys(out).some((k) => /balance$/i.test(k) && out[k] > 0));
    return { ...rec, values: { ...v, ...out }, derived: out };
  }
  function summary(schema, records, now) {
    const rows = (records || []).filter((r) => !r.deletedAt).map((r) => derived(schema, r, now));
    const last = Math.max(0, (schema && schema.stages || []).length - 1);
    const open = rows.filter((r) => (+r.status || 0) < last);
    return {
      records: rows, active: open.length, done: rows.length - open.length,
      alerts: rows.filter((r) => r.derived.alert).length,
      balance: rows.reduce((n, r) => n + Object.entries(r.derived).reduce((x, pair) => x + (/balance$/i.test(pair[0]) ? Number(pair[1]) || 0 : 0), 0), 0),
    };
  }
  function relationOptions(schema, allRecords, field) {
    if (!field || !field.relation) return [];
    return ((allRecords && allRecords[field.relation]) || []).filter((r) => !r.deletedAt).map((r) => ({ value: r.id, label: normalize(get(schema.trade, field.relation) || schema, r).title || r.id }));
  }

  window.KiwiTradeSchema = { L, defs, get, normalize, validate, derived, summary, relationOptions };
})();
