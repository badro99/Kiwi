/* Keyed checkout copy. Optional layer, loaded by the existing caisse registry. */
(function (g) {
  'use strict';
  const entries = {
  "checkout.payment.title": {
    "fr": "Encaissement",
    "en": "Payment",
    "ar": "الأداء"
  },
  "checkout.balance.title": {
    "fr": "Régler un acompte",
    "en": "Settle a deposit",
    "ar": "تسوية تسبيق"
  },
  "checkout.exchange.title": {
    "fr": "Différence échange",
    "en": "Exchange difference",
    "ar": "فرق الاستبدال"
  },
  "checkout.walk.in": {
    "fr": "Cliente de passage",
    "en": "Walk-in customer",
    "ar": "زبونة عابرة"
  },
  "checkout.confirm.cash": {
    "fr": "Confirmer",
    "en": "Confirm",
    "ar": "تأكيد"
  },
  "checkout.remaining": {
    "fr": "Reste",
    "en": "Remaining",
    "ar": "المتبقي"
  },
  "checkout.quick.cash": {
    "fr": "Ajout rapide",
    "en": "Quick add",
    "ar": "إضافة سريعة"
  },
  "checkout.credit.code": {
    "fr": "Code de l’avoir",
    "en": "Store credit code",
    "ar": "رمز الرصيد الدائن"
  },
  "checkout.paiement.commence": {
    "fr": "Paiement commencé",
    "en": "Payment started",
    "ar": "بدأ الدفع"
  },
  "checkout.especes": {
    "fr": "Espèces",
    "en": "Cash",
    "ar": "نقداً"
  },
  "checkout.carte": {
    "fr": "Carte",
    "en": "Card",
    "ar": "بطاقة"
  },
  "checkout.livraison": {
    "fr": "Livraison",
    "en": "Delivery",
    "ar": "توصيل"
  },
  "checkout.avoir": {
    "fr": "Avoir",
    "en": "Credit note",
    "ar": "رصيد"
  },
  "checkout.partager": {
    "fr": "Partager",
    "en": "Share",
    "ar": "مشاركة"
  },
  "checkout.tout": {
    "fr": "Tout",
    "en": "All",
    "ar": "الكل"
  },
  "checkout.fermer": {
    "fr": "Fermer",
    "en": "Close",
    "ar": "إغلاق"
  },
  "checkout.aucun.avoir.actif.emettez.en.un.depuis.echanges.avoirs": {
    "fr": "Aucun avoir actif, émettez-en un depuis Échanges & avoirs",
    "en": "No active store credit; issue one from Exchanges & store credit",
    "ar": "لا يوجد رصيد دائن نشط، أصدره من قسم الاستبدال والأرصدة الدائنة"
  },
  "checkout.utiliser": {
    "fr": "Utiliser",
    "en": "Use",
    "ar": "استعمال"
  },
  "checkout.retour": {
    "fr": "Retour",
    "en": "Back",
    "ar": "رجوع"
  },
  "checkout.bon.indisponible": {
    "fr": "Bon indisponible",
    "en": "Voucher unavailable",
    "ar": "القسيمة غير متاحة"
  },
  "checkout.especes.recues": {
    "fr": "Espèces reçues",
    "en": "Cash received",
    "ar": "المبلغ المستلم"
  },
  "checkout.rendu": {
    "fr": "Rendu",
    "en": "Change due",
    "ar": "الباقي"
  },
  "checkout.confirmer": {
    "fr": "· confirmer",
    "en": "· confirm",
    "ar": "· تأكيد"
  },
  "checkout.confirmez.l.encaissement.sur.le.lecteur": {
    "fr": "Confirmez l'encaissement sur le lecteur",
    "en": "Confirm payment on the reader",
    "ar": "أكد الدفع على جهاز القراءة"
  },
  "checkout.acompte.une.cliente.et.un.seul.reglement.sont.requis": {
    "fr": "Acompte : une cliente et un seul règlement sont requis",
    "en": "Deposit: a customer and a single payment are required",
    "ar": "العربون: يجب تحديد عميلة ودفعة واحدة فقط"
  },
  "checkout.vente.boutique": {
    "fr": "Vente boutique",
    "en": "Shop sale",
    "ar": "بيع المتجر"
  },
  "checkout.avoir.refuse.par.le.registre": {
    "fr": "Avoir refusé par le registre",
    "en": "Store credit rejected by the register",
    "ar": "رفض السجل الرصيد الدائن"
  },
  "checkout.acompte": {
    "fr": "Acompte",
    "en": "Deposit",
    "ar": "عربون"
  },
  "checkout.solde.de.l.acompte": {
    "fr": "Solde de l’acompte",
    "en": "Deposit balance",
    "ar": "المبلغ المتبقي بعد العربون"
  },
  "checkout.cliente.de.passage.pas.de.numero.whatsapp.sur.le.ticket": {
    "fr": "Cliente de passage, pas de numéro WhatsApp sur le ticket",
    "en": "Walk-in customer, no WhatsApp number on the receipt",
    "ar": "عميلة عابرة، لا يوجد رقم واتساب على الإيصال"
  },
  "checkout.la.cliente": {
    "fr": "la cliente",
    "en": "the customer",
    "ar": "العميلة"
  },
  "checkout.impossible.d.ouvrir.whatsapp": {
    "fr": "Impossible d'ouvrir WhatsApp",
    "en": "Unable to open WhatsApp",
    "ar": "تعذر فتح واتساب"
  },
  "checkout.montant": {
    "fr": "Montant…",
    "en": "Amount…",
    "ar": "المبلغ…"
  },
  "checkout.partager.le.paiement": {
    "fr": "Partager le paiement",
    "en": "Split payment",
    "ar": "تقسيم الدفع"
  },
  "checkout.montant.de.cette.part": {
    "fr": "Montant de cette part",
    "en": "Amount of this share",
    "ar": "مبلغ هذه الحصة"
  },
  "checkout.cette.part": {
    "fr": "Cette part :",
    "en": "This share:",
    "ar": "هذه الحصة:"
  },
  "checkout.restera": {
    "fr": "· restera",
    "en": "· remaining",
    "ar": "· المتبقي"
  },
  "checkout.reste.a.regler.sur": {
    "fr": "Reste à régler sur",
    "en": "Remaining to pay on",
    "ar": "المتبقي للدفع من"
  },
  "checkout.acompte.recu.garder": {
    "fr": "Acompte reçu · garder",
    "en": "Deposit received · keep",
    "ar": "تم استلام التسبيق · احتفظ بـ"
  },
  "checkout.a.regler": {
    "fr": "à régler",
    "en": "to pay",
    "ar": "للدفع"
  },
  "checkout.rendu.calcule.flous.comptes.une.fois": {
    "fr": "Rendu calculé, flous comptés une fois",
    "en": "Change calculated, cash counted once",
    "ar": "حساب الباقي وعد النقد مرة واحدة"
  },
  "checkout.terminal.de.la.banque.montant.a.saisir.dessus": {
    "fr": "Terminal de la banque, montant à saisir dessus",
    "en": "Bank terminal, enter the amount there",
    "ar": "جهاز البنك، أدخل المبلغ عليه"
  },
  "checkout.virement.versement": {
    "fr": "Virement / Versement",
    "en": "Transfer / Deposit",
    "ar": "تحويل / إيداع"
  },
  "checkout.confirmer.uniquement.apres.reception.en.banque": {
    "fr": "Confirmer uniquement après réception en banque",
    "en": "Confirm only after receipt in the bank",
    "ar": "أكد فقط بعد الاستلام في البنك"
  },
  "checkout.cheque": {
    "fr": "Chèque",
    "en": "Cheque",
    "ar": "شيك"
  },
  "checkout.confirmer.apres.reception.du.cheque": {
    "fr": "Confirmer après réception du chèque",
    "en": "Confirm after receiving the cheque",
    "ar": "أكد بعد استلام الشيك"
  },
  "checkout.vente.enregistree.paiement.a.recevoir.du.transporteur": {
    "fr": "Vente enregistrée, paiement à recevoir du transporteur",
    "en": "Sale recorded, payment due from carrier",
    "ar": "تم تسجيل البيع، الدفع مستحق من الناقل"
  },
  "checkout.avoirs.actifs.scanner.ou.choisir": {
    "fr": "avoirs actifs, scanner ou choisir",
    "en": "active store credits, scan or choose",
    "ar": "أرصدة دائنة نشطة، امسح أو اختر"
  },
  "checkout.code.d.avoir": {
    "fr": "Code d’avoir",
    "en": "Store credit code",
    "ar": "رمز الرصيد الدائن"
  },
  "checkout.scanner.ou.saisir.le.code.du.bon": {
    "fr": "Scanner ou saisir le code du bon",
    "en": "Scan or enter the voucher code",
    "ar": "امسح أو أدخل رمز القسيمة"
  },
  "checkout.avoir.en.paiement": {
    "fr": "Avoir en paiement",
    "en": "Pay with store credit",
    "ar": "الدفع بالرصيد الدائن"
  },
  "checkout.scannez.le.bon.ou.choisissez.le.il.se.deduit.du.total": {
    "fr": "Scannez le bon, ou choisissez-le, il se déduit du total",
    "en": "Scan or choose the voucher, it is deducted from the total",
    "ar": "امسح القسيمة أو اخترها، تخصم من الإجمالي"
  },
  "checkout.valable.jusqu.au": {
    "fr": "· valable jusqu'au",
    "en": "· valid until",
    "ar": "· صالح حتى"
  },
  "checkout.cet.avoir.a.expire": {
    "fr": "Cet avoir a expiré.",
    "en": "This store credit has expired.",
    "ar": "انتهت صلاحية هذا الرصيد الدائن."
  },
  "checkout.cet.avoir.est.deja.entierement.utilise": {
    "fr": "Cet avoir est déjà entièrement utilisé.",
    "en": "This store credit is already fully used.",
    "ar": "تم استخدام هذا الرصيد الدائن بالكامل."
  },
  "checkout.aucun.avoir.avec.ce.code.verifiez.le.sur.le.bon": {
    "fr": "Aucun avoir avec ce code, vérifiez-le sur le bon.",
    "en": "No store credit with this code, check the voucher.",
    "ar": "لا يوجد رصيد دائن بهذا الرمز، تحقق من القسيمة."
  },
  "checkout.il.reste": {
    "fr": "Il reste",
    "en": "Remaining:",
    "ar": "المتبقي:"
  },
  "checkout.a.regler.avant.de.fermer": {
    "fr": "à régler avant de fermer.",
    "en": "to pay before closing.",
    "ar": "للدفع قبل الإغلاق."
  },
  "checkout.applique": {
    "fr": "appliqué, −",
    "en": "applied, −",
    "ar": "مطبق، −"
  },
  "checkout.regle": {
    "fr": "réglé",
    "en": "paid",
    "ar": "مدفوع"
  },
  "checkout.reste": {
    "fr": ", reste",
    "en": ", remaining",
    "ar": ", المتبقي"
  },
  "checkout.cet.avoir.a.expire.le": {
    "fr": "Cet avoir a expiré le",
    "en": "This store credit expired on",
    "ar": "انتهت صلاحية هذا الرصيد الدائن في"
  },
  "checkout.applique.reste": {
    "fr": "appliqué, reste",
    "en": "applied, remaining",
    "ar": "مطبق، المتبقي"
  },
  "checkout.a.payer": {
    "fr": "à payer",
    "en": "to pay",
    "ar": "للدفع"
  },
  "checkout.part.sur": {
    "fr": "Part sur",
    "en": "Share of",
    "ar": "حصة من"
  },
  "checkout.kiwi.affiche.le.lecteur.encaisse": {
    "fr": "· Kiwi affiche, le lecteur encaisse",
    "en": "· Kiwi displays, the terminal collects",
    "ar": "· Kiwi يعرض والجهاز يقبض"
  },
  "checkout.montant.envoye.au.lecteur": {
    "fr": "Montant envoyé au lecteur",
    "en": "Amount sent to terminal",
    "ar": "تم إرسال المبلغ إلى الجهاز"
  },
  "checkout.encaissement.confirme.sur.le.lecteur": {
    "fr": "Encaissement confirmé sur le lecteur",
    "en": "Payment confirmed on terminal",
    "ar": "تم تأكيد الدفع على الجهاز"
  },
  "checkout.paiement.refuse.annuler": {
    "fr": "Paiement refusé · annuler",
    "en": "Payment declined · cancel",
    "ar": "تم رفض الدفع · إلغاء"
  },
  "checkout.aucun.montant.ne.sera.attendu.dans.le.tiroir": {
    "fr": "Aucun montant ne sera attendu dans le tiroir.",
    "en": "No amount will be expected in the cash drawer.",
    "ar": "لن يتوقع أي مبلغ في درج النقد."
  },
  "checkout.le.cheque.a.t.il.ete.remis.au.comptoir": {
    "fr": "Le chèque a-t-il été remis au comptoir ?",
    "en": "Has the cheque been handed over at the counter?",
    "ar": "هل تم تسليم الشيك عند الصندوق؟"
  },
  "checkout.les.fonds.sont.ils.visibles.sur.le.compte.bancaire": {
    "fr": "Les fonds sont-ils visibles sur le compte bancaire ?",
    "en": "Are the funds visible in the bank account?",
    "ar": "هل الأموال ظاهرة في الحساب البنكي؟"
  },
  "checkout.cheque.recu": {
    "fr": "Chèque reçu",
    "en": "Cheque received",
    "ar": "تم استلام الشيك"
  },
  "checkout.versement.recu": {
    "fr": "Versement reçu",
    "en": "Deposit received",
    "ar": "تم استلام الإيداع"
  },
  "checkout.inutilisable": {
    "fr": "inutilisable",
    "en": "unavailable",
    "ar": "غير قابل للاستخدام"
  },
  "checkout.bon.introuvable.en.caisse": {
    "fr": "Bon introuvable en caisse.",
    "en": "Voucher not found on till.",
    "ar": "القسيمة غير موجودة في الصندوق."
  },
  "checkout.bon.expire.entre.temps": {
    "fr": "Bon expiré entre-temps.",
    "en": "Voucher expired in the meantime.",
    "ar": "انتهت صلاحية القسيمة في هذه الأثناء."
  },
  "checkout.solde.insuffisant.montants.recalcules": {
    "fr": "Solde insuffisant, montants recalculés.",
    "en": "Insufficient balance, amounts recalculated.",
    "ar": "الرصيد غير كاف، تم إعادة حساب المبالغ."
  },
  "checkout.dessus": {
    "fr": "dessus",
    "en": "left",
    "ar": "متبقٍ"
  },
  "checkout.consomme.en.totalite": {
    "fr": "consommé en totalité",
    "en": "fully used",
    "ar": "مستخدم بالكامل"
  },
  "checkout.le.solde.a.change.le.bon.a.expire.ou.une.autre.caisse.vient.de.l.utiliser.aucun.encaissement.n.a.ete.enregistre": {
    "fr": "Le solde a changé, le bon a expiré ou une autre caisse vient de l’utiliser. Aucun encaissement n’a été enregistré.",
    "en": "The balance changed, the voucher expired or another till just used it. No payment was recorded.",
    "ar": "تغير الرصيد أو انتهت صلاحية القسيمة أو استخدمها صندوق آخر. لم يسجل أي دفع."
  },
  "checkout.livraison.enregistree": {
    "fr": "Livraison enregistrée",
    "en": "Delivery recorded",
    "ar": "تم تسجيل التوصيل"
  },
  "checkout.c.est.encaisse": {
    "fr": "C'est encaissé",
    "en": "Payment received",
    "ar": "تم استلام الدفع"
  },
  "checkout.rendu.a.la.cliente": {
    "fr": "rendu à la cliente",
    "en": "change to customer",
    "ar": "الباقي للزبونة"
  },
  "checkout.carte.lecteur.partenaire": {
    "fr": "Carte, lecteur partenaire",
    "en": "Card, partner terminal",
    "ar": "بطاقة، جهاز الشريك"
  },
  "checkout.livraison.a.recevoir": {
    "fr": "Livraison · à recevoir",
    "en": "Delivery · receivable",
    "ar": "توصيل · مستحق"
  },
  "checkout.recu.80.mm": {
    "fr": "Reçu 80 mm",
    "en": "80 mm receipt",
    "ar": "إيصال 80 مم"
  },
  "checkout.recu.whatsapp": {
    "fr": "Reçu WhatsApp",
    "en": "WhatsApp receipt",
    "ar": "إيصال واتساب"
  },
  "checkout.nouvelle.vente": {
    "fr": "Nouvelle vente",
    "en": "New sale",
    "ar": "بيع جديد"
  },
  "checkout.recu": {
    "fr": "Reçu",
    "en": "Receipt",
    "ar": "إيصال"
  },
  "checkout.merci": {
    "fr": "Merci !",
    "en": "Thank you!",
    "ar": "شكراً!"
  },
  "checkout.total": {
    "fr": "TOTAL",
    "en": "TOTAL",
    "ar": "الإجمالي"
  },
  "checkout.whatsapp.ouvert.pour": {
    "fr": "WhatsApp ouvert pour",
    "en": "WhatsApp opened for",
    "ar": "تم فتح واتساب لـ"
  },
  "checkout.appuyez.sur.envoyer": {
    "fr": ", appuyez sur envoyer",
    "en": ", press send",
    "ar": "، اضغط على إرسال"
  },
  "checkout.no.printer": {
    "fr": "Ticket non imprimé · aucune imprimante",
    "en": "Receipt not printed · no printer",
    "ar": "لم تتم طباعة الإيصال · لا توجد طابعة"
  },
  "checkout.ozon.sent": {
    "fr": "Le colis part chez Ozon, suivi dans Livraisons",
    "en": "Parcel sent to Ozon, track it in Deliveries",
    "ar": "الطرد في طريقه إلى أوزون، تتبعه في التوصيلات"
  },
  "checkout.ticket": {
    "fr": "Ticket ",
    "en": "Receipt ",
    "ar": "إيصال "
  },
  "checkout.credit.placeholder": {
    "fr": "Scanner ou saisir AV-…",
    "en": "Scan or enter AV-…",
    "ar": "امسح أو أدخل AV-…"
  },
  "checkout.credit.until": {
    "fr": "valable jusqu'au",
    "en": "valid until",
    "ar": "صالح حتى"
  }
};
  function say(key, fr, vars) {
    let text = fr;
    try {
      const row = Object.prototype.hasOwnProperty.call(entries, key) && entries[key];
      const lang = g.KiwiCaisseLang?.get();
      text = row && (row[lang] || row.fr) || fr;
    } catch (_) {}
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => vars?.[k] == null ? m : String(vars[k]));
  }
  g.KiwiCaisseStrings = { entries, say };
})(typeof window === 'undefined' ? globalThis : window);
