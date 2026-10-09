/* Ticket #0171 · Kiwi landing · demo request in five short steps.
 *
 * "Demander une démo" used to open WhatsApp cold. This sheet gets to know the
 * visitor first: who they are, which of Kiwi's business types they run, how
 * big the operation is, what costs them time, and when they would like a
 * call. It then hands a tidy WhatsApp message to the visitor to send to the
 * existing business number. Nothing is stored on a server: the time they pick
 * is a preference awaiting confirmation, never a booked slot.
 *
 * Plain, self-contained script on top of the static landing export. Business
 * types come from assets/trades.js (window.KiwiTrades), the product's single
 * list. Copy: STR below (fr, en, ar). Other landing locales use English.
 */
(function () {
  'use strict';
  if (window.KiwiDemoFunnel) return;

  var WA = '212624495159';
  var STORE = 'kiwiDemoFunnel';
  var STEPS = 5;

  var STR = {
    fr: {
      open: 'Demander une démo',
      close: 'Fermer',
      back: 'Retour',
      next: 'Continuer',
      stepOf: 'Étape {n} sur {total}',
      waAside: 'Une question rapide ? Écrivez-nous sur WhatsApp',
      s1Title: 'Faisons connaissance',
      s1Lead: 'Deux réponses pour commencer, et la démo sera faite pour vous.',
      firstName: 'Votre prénom',
      firstNamePh: 'Ex. Salma',
      business: 'Le nom de votre commerce',
      businessPh: 'Ex. Café Atlas',
      s2Title: 'Enchanté, {name}. Que fait {biz} ?',
      s2Lead: 'Choisissez le métier le plus proche. Kiwi s’adapte à chacun.',
      s3Title: 'Votre activité au quotidien',
      s3Lead: 'Pour préparer une démo à la bonne échelle.',
      locations: 'Combien d’établissements ?',
      people: 'Combien de personnes dans votre équipe ?',
      exact: 'Nombre exact',
      exactPh: 'Saisir',
      justMe: 'Juste moi',
      s4Title: 'Qu’est-ce qui vous prend le plus de temps aujourd’hui ?',
      s4Lead: 'Plusieurs choix possibles.',
      other: 'Autre chose ? (facultatif)',
      otherPh: 'En quelques mots',
      summaryTitle: 'Ce que Kiwi fait pour {biz}',
      summaryEmpty: 'Choisissez au moins un point pour voir ce que Kiwi peut faire pour vous.',
      s5Title: 'Quand pouvons-nous vous appeler, {name} ?',
      s5Lead: 'Choisissez un moment qui vous arrange. Nous le confirmons avec vous avant l’appel.',
      date: 'Jour souhaité',
      time: 'Heure souhaitée',
      timezone: 'Heure du Maroc',
      timePick: 'Choisir une heure',
      phone: 'Téléphone',
      phonePh: '06 12 34 56 78',
      email: 'E-mail (facultatif)',
      emailPh: 'vous@exemple.ma',
      recap: 'Récapitulatif',
      recapBiz: 'Commerce',
      recapSize: 'Taille',
      recapNeeds: 'Priorités',
      recapWhen: 'Créneau souhaité',
      recapContact: 'Contact',
      pending: 'Créneau souhaité, en attente de notre confirmation',
      submit: 'Envoyer ma demande sur WhatsApp',
      submitNote: 'WhatsApp s’ouvre avec votre message prêt. Il vous reste à l’envoyer.',
      doneTitle: 'Merci, {name}',
      doneLead: 'Votre message est prêt dans WhatsApp. Envoyez-le pour que votre demande nous parvienne.',
      doneNext1: 'Nous lisons votre demande et préparons une démo pour {biz}.',
      doneNext2: 'Nous vous écrivons pour confirmer le créneau ou en proposer un autre.',
      doneNext3: 'Le jour venu, nous vous appelons pour une démo d’environ 20 minutes.',
      doneRetry: 'WhatsApp ne s’est pas ouvert ? Réessayer',
      doneClose: 'Revenir au site',
      required: 'Ce champ est nécessaire.',
      phoneBad: 'Vérifiez ce numéro.',
      emailBad: 'Vérifiez cette adresse.',
      pickTrade: 'Choisissez un métier.',
      pickOne: 'Choisissez au moins un point.',
      dateBad: 'Choisissez un jour à venir.',
      locWord: ['établissement', 'établissements'],
      peopleWord: ['personne', 'personnes'],
      pains: {
        stock: 'Écarts de stock',
        checkout: 'Encaissement trop lent',
        team: 'Coordination de l’équipe',
        profit: 'Savoir ce qui rapporte',
        retention: 'Faire revenir les clients',
        multisite: 'Gérer plusieurs établissements',
      },
      painEx: {
        restaurant: {
          stock: 'Ingrédients qui manquent en plein service',
          checkout: 'Files d’attente et additions à séparer',
          team: 'Salle et cuisine qui se coordonnent mal',
          profit: 'Quels plats rapportent vraiment',
          retention: 'Habitués qui viennent moins souvent',
          multisite: 'Chaque adresse avec ses propres chiffres',
        },
        boutique: {
          stock: 'Tailles introuvables, écarts au comptage',
          checkout: 'Saisie des prix à la main',
          team: 'Qui vend quoi, et quand',
          profit: 'Marge réelle par produit',
          retention: 'Clients qui ne reviennent pas',
          multisite: 'Stock réparti entre plusieurs magasins',
        },
        spa: {
          stock: 'Produits de soin qui manquent',
          checkout: 'Encaissement des prestations et forfaits',
          team: 'Plannings et disponibilités',
          profit: 'Prestations les plus rentables',
          retention: 'Clientes qui espacent leurs visites',
          multisite: 'Plusieurs centres à suivre',
        },
        hotel: {
          stock: 'Consommables et minibar',
          checkout: 'Extras à reporter sur la chambre',
          team: 'Réception, ménage et service',
          profit: 'Revenu par chambre et par service',
          retention: 'Clients qui ne reviennent pas',
          multisite: 'Plusieurs établissements à piloter',
        },
      },
      features: {
        stock: {
          restaurant: 'Stock des ingrédients, alertes avant rupture et comptages d’inventaire guidés.',
          boutique: 'Stock par variante, codes-barres, alertes de stock bas et historique de chaque mouvement.',
          spa: 'Inventaire des produits, alertes de stock bas et comptages guidés.',
          hotel: 'Inventaire des consommables, alertes avant rupture et comptages guidés.',
        },
        checkout: {
          restaurant: 'Caisse tactile avec plan de salle, notes séparées et envoi direct en cuisine.',
          boutique: 'Caisse rapide avec scan des codes-barres, espèces ou carte, et ticket imprimé.',
          spa: 'Encaissement des prestations en quelques touches, espèces ou carte.',
          hotel: 'Encaissement des extras et report sur la chambre.',
        },
        team: 'Un code personnel par employé, planning, pointage et droits selon le rôle.',
        profit: {
          restaurant: 'Rapport journalier, marge par plat et coût des recettes.',
          boutique: 'Rapport journalier, marge par produit et valeur du stock.',
          spa: 'Rapport journalier et chiffre d’affaires par prestation.',
          hotel: 'Rapport journalier et chiffre d’affaires par service.',
        },
        retention: 'Fichier clients, fidélité et relances WhatsApp que vous approuvez une à une.',
        multisite: 'Tous vos établissements dans un seul tableau de bord, chacun avec ses chiffres.',
      },
      wa: {
        hello: 'Bonjour Kiwi, je souhaite une démo.',
        name: 'Prénom',
        biz: 'Commerce',
        trade: 'Activité',
        size: 'Taille',
        needs: 'Priorités',
        note: 'Précision',
        when: 'Créneau souhaité (à confirmer)',
        phone: 'Téléphone',
        email: 'E-mail',
      },
    },
    en: {
      "open": "Request a demo",
      "close": "Close",
      "back": "Back",
      "next": "Continue",
      "stepOf": "Step {n} of {total}",
      "waAside": "A quick question? Message us on WhatsApp",
      "s1Title": "Let's get to know you",
      "s1Lead": "Two answers to start, and the demo will be built around you.",
      "firstName": "Your first name",
      "firstNamePh": "e.g. Salma",
      "business": "Your business name",
      "businessPh": "e.g. Café Atlas",
      "s2Title": "Nice to meet you, {name}. What does {biz} do?",
      "s2Lead": "Choose the closest trade. Kiwi adapts to each one.",
      "s3Title": "Your day-to-day activity",
      "s3Lead": "So we can prepare a demo at the right scale.",
      "locations": "How many locations?",
      "people": "How many people are on your team?",
      "exact": "Exact number",
      "exactPh": "Enter",
      "justMe": "Just me",
      "s4Title": "What takes up most of your time today?",
      "s4Lead": "You can pick several.",
      "other": "Anything else? (optional)",
      "otherPh": "In a few words",
      "summaryTitle": "What Kiwi does for {biz}",
      "summaryEmpty": "Choose at least one point to see what Kiwi can do for you.",
      "s5Title": "When can we call you, {name}?",
      "s5Lead": "Pick a time that suits you. We will confirm it with you before the call.",
      "date": "Preferred day",
      "time": "Preferred time",
      "timezone": "Morocco time",
      "timePick": "Choose a time",
      "phone": "Phone",
      "phonePh": "06 12 34 56 78",
      "email": "Email (optional)",
      "emailPh": "you@example.com",
      "recap": "Summary",
      "recapBiz": "Business",
      "recapSize": "Size",
      "recapNeeds": "Priorities",
      "recapWhen": "Preferred slot",
      "recapContact": "Contact",
      "pending": "Preferred slot, awaiting our confirmation",
      "submit": "Send my request on WhatsApp",
      "submitNote": "WhatsApp opens with your message ready. All you need to do is send it.",
      "doneTitle": "Thank you, {name}",
      "doneLead": "Your message is ready in WhatsApp. Send it so your request reaches us.",
      "doneNext1": "We are reading your request and preparing a demo for {biz}.",
      "doneNext2": "We will message you to confirm the slot or suggest another.",
      "doneNext3": "On the day, we will call you for a demo of about 20 minutes.",
      "doneRetry": "WhatsApp did not open? Try again",
      "doneClose": "Back to the site",
      "required": "This field is required.",
      "phoneBad": "Please check this number.",
      "emailBad": "Please check this address.",
      "pickTrade": "Choose a trade.",
      "pickOne": "Choose at least one point.",
      "dateBad": "Choose an upcoming day.",
      "locWord": [
        "location",
        "locations"
      ],
      "peopleWord": [
        "person",
        "people"
      ],
      "pains": {
        "stock": "Stock discrepancies",
        "checkout": "Slow checkout",
        "team": "Team coordination",
        "profit": "Knowing what makes money",
        "retention": "Bringing customers back",
        "multisite": "Managing several locations"
      },
      "painEx": {
        "restaurant": {
          "stock": "Ingredients running out mid-service",
          "checkout": "Queues and bills to split",
          "team": "Dining room and kitchen out of sync",
          "profit": "Which dishes really earn",
          "retention": "Regulars visiting less often",
          "multisite": "Each site with its own numbers"
        },
        "boutique": {
          "stock": "Sizes out of stock, counting mismatches",
          "checkout": "Prices typed in by hand",
          "team": "Who sells what, and when",
          "profit": "Real margin per product",
          "retention": "Customers who never come back",
          "multisite": "Stock spread across several shops"
        },
        "spa": {
          "stock": "Care products running out",
          "checkout": "Taking payment for treatments and packages",
          "team": "Schedules and availability",
          "profit": "The most profitable treatments",
          "retention": "Clients spacing out their visits",
          "multisite": "Several centres to track"
        },
        "hotel": {
          "stock": "Supplies and minibar",
          "checkout": "Extras to post to the room",
          "team": "Reception, housekeeping and service",
          "profit": "Revenue per room and per service",
          "retention": "Guests who don't come back",
          "multisite": "Several properties to manage"
        }
      },
      "features": {
        "stock": {
          "restaurant": "Ingredient stock, alerts before you run out, and guided stock counts.",
          "boutique": "Stock by variant, barcodes, low-stock alerts and a history of every movement.",
          "spa": "Product inventory, low-stock alerts and guided counts.",
          "hotel": "Supply inventory, alerts before you run out and guided counts."
        },
        "checkout": {
          "restaurant": "Touch till with a floor plan, split bills and direct sending to the kitchen.",
          "boutique": "Fast till with barcode scanning, cash or card, and a printed receipt.",
          "spa": "Take payment for treatments in a few taps, cash or card.",
          "hotel": "Take payment for extras and post them to the room."
        },
        "team": "A personal code for each employee, schedules, clock-in and permissions by role.",
        "profit": {
          "restaurant": "Daily report, margin per dish and recipe costs.",
          "boutique": "Daily report, margin per product and stock value.",
          "spa": "Daily report and revenue per treatment.",
          "hotel": "Daily report and revenue per service."
        },
        "retention": "Customer records, loyalty and WhatsApp follow-ups that you approve one by one.",
        "multisite": "All your locations on one dashboard, each with its own numbers."
      },
      "wa": {
        "hello": "Hello Kiwi, I would like a demo.",
        "name": "First name",
        "biz": "Business",
        "trade": "Activity",
        "size": "Size",
        "needs": "Priorities",
        "note": "Details",
        "when": "Preferred slot (to confirm)",
        "phone": "Phone",
        "email": "Email"
      }
    },
    ar: {
      "open": "طلب عرض توضيحي",
      "close": "إغلاق",
      "back": "رجوع",
      "next": "متابعة",
      "stepOf": "الخطوة {n} من {total}",
      "waAside": "سؤال سريع؟ راسلنا عبر WhatsApp",
      "s1Title": "لنتعرف عليك",
      "s1Lead": "جوابان للبداية، وسيُعدّ العرض التوضيحي حسب احتياجاتك.",
      "firstName": "اسمك الأول",
      "firstNamePh": "مثال: سلمى",
      "business": "اسم نشاطك التجاري",
      "businessPh": "مثال: Café Atlas",
      "s2Title": "أهلاً بك، {name}. ماذا يقدم {biz}؟",
      "s2Lead": "اختر النشاط الأقرب إليك. Kiwi يتكيف مع كل نشاط.",
      "s3Title": "نشاطك اليومي",
      "s3Lead": "لنعدّ عرضاً توضيحياً بالحجم المناسب.",
      "locations": "كم عدد الفروع؟",
      "people": "كم عدد الأشخاص في فريقك؟",
      "exact": "عدد محدد",
      "exactPh": "أدخل الرقم",
      "justMe": "أنا وحدي",
      "s4Title": "ما الذي يستهلك أكبر قدر من وقتك اليوم؟",
      "s4Lead": "يمكنك اختيار أكثر من خيار.",
      "other": "شيء آخر؟ (اختياري)",
      "otherPh": "بكلمات قليلة",
      "summaryTitle": "ما يقدمه Kiwi لـ {biz}",
      "summaryEmpty": "اختر نقطة واحدة على الأقل لترى ما يمكن أن يقدمه Kiwi لك.",
      "s5Title": "متى يمكننا الاتصال بك، {name}؟",
      "s5Lead": "اختر وقتاً يناسبك. سنؤكده معك قبل المكالمة.",
      "date": "اليوم المفضل",
      "time": "الوقت المفضل",
      "timezone": "بتوقيت المغرب",
      "timePick": "اختر وقتاً",
      "phone": "الهاتف",
      "phonePh": "06 12 34 56 78",
      "email": "البريد الإلكتروني (اختياري)",
      "emailPh": "you@example.com",
      "recap": "الملخص",
      "recapBiz": "النشاط التجاري",
      "recapSize": "الحجم",
      "recapNeeds": "الأولويات",
      "recapWhen": "الموعد المفضل",
      "recapContact": "جهة الاتصال",
      "pending": "الموعد المفضل، بانتظار تأكيدنا",
      "submit": "أرسل طلبي عبر WhatsApp",
      "submitNote": "سيُفتح WhatsApp ورسالتك جاهزة. كل ما عليك هو إرسالها.",
      "doneTitle": "شكراً لك، {name}",
      "doneLead": "رسالتك جاهزة في WhatsApp. أرسلها ليصل طلبك إلينا.",
      "doneNext1": "نقرأ طلبك ونعدّ عرضاً توضيحياً لـ {biz}.",
      "doneNext2": "سنراسلك لتأكيد الموعد أو لاقتراح موعد آخر.",
      "doneNext3": "في اليوم المحدد، سنتصل بك لعرض توضيحي يدوم نحو 20 دقيقة.",
      "doneRetry": "لم يُفتح WhatsApp؟ حاول مرة أخرى",
      "doneClose": "العودة إلى الموقع",
      "required": "هذا الحقل مطلوب.",
      "phoneBad": "يرجى التحقق من هذا الرقم.",
      "emailBad": "يرجى التحقق من هذا العنوان.",
      "pickTrade": "اختر نشاطاً.",
      "pickOne": "اختر نقطة واحدة على الأقل.",
      "dateBad": "اختر يوماً قادماً.",
      "locWord": [
        "فرع",
        "فروع"
      ],
      "peopleWord": [
        "شخص",
        "أشخاص"
      ],
      "pains": {
        "stock": "فروقات في المخزون",
        "checkout": "بطء في الدفع",
        "team": "تنسيق الفريق",
        "profit": "معرفة ما يحقق الربح",
        "retention": "إعادة العملاء إليك",
        "multisite": "إدارة عدة فروع"
      },
      "painEx": {
        "restaurant": {
          "stock": "مكونات تنفد أثناء الخدمة",
          "checkout": "طوابير وفواتير تحتاج إلى فصل",
          "team": "القاعة والمطبخ غير متناسقين",
          "profit": "أي الأطباق تحقق ربحاً فعلياً",
          "retention": "الزبائن الدائمون يزورون بتواتر أقل",
          "multisite": "لكل فرع أرقامه الخاصة"
        },
        "boutique": {
          "stock": "مقاسات غير متوفرة وفروقات في الجرد",
          "checkout": "إدخال الأسعار يدوياً",
          "team": "من يبيع ماذا ومتى",
          "profit": "الهامش الحقيقي لكل منتج",
          "retention": "عملاء لا يعودون",
          "multisite": "مخزون موزع على عدة متاجر"
        },
        "spa": {
          "stock": "منتجات العناية تنفد",
          "checkout": "تحصيل الخدمات والباقات",
          "team": "جداول العمل والتوفر",
          "profit": "الخدمات الأكثر ربحاً",
          "retention": "عملاء تقلّ زياراتهم",
          "multisite": "عدة مراكز تحتاج إلى متابعة"
        },
        "hotel": {
          "stock": "المستلزمات والميني بار",
          "checkout": "مصاريف إضافية تُرحَّل إلى الغرفة",
          "team": "الاستقبال والتنظيف والخدمة",
          "profit": "الإيراد لكل غرفة ولكل خدمة",
          "retention": "نزلاء لا يعودون",
          "multisite": "عدة منشآت تحتاج إلى إدارة"
        }
      },
      "features": {
        "stock": {
          "restaurant": "مخزون المكونات، وتنبيهات قبل النفاد، وجرد موجَّه.",
          "boutique": "مخزون حسب المتغير، والباركود، وتنبيهات انخفاض المخزون، وسجل لكل حركة.",
          "spa": "جرد المنتجات، وتنبيهات انخفاض المخزون، وجرد موجَّه.",
          "hotel": "جرد المستلزمات، وتنبيهات قبل النفاد، وجرد موجَّه."
        },
        "checkout": {
          "restaurant": "صندوق باللمس مع مخطط القاعة، وفواتير منفصلة، وإرسال مباشر إلى المطبخ.",
          "boutique": "صندوق سريع مع مسح الباركود، نقداً أو بالبطاقة، وتذكرة مطبوعة.",
          "spa": "تحصيل الخدمات بلمسات قليلة، نقداً أو بالبطاقة.",
          "hotel": "تحصيل المصاريف الإضافية وترحيلها إلى الغرفة."
        },
        "team": "رمز شخصي لكل موظف، وجداول عمل، وتسجيل الحضور، وصلاحيات حسب الدور.",
        "profit": {
          "restaurant": "تقرير يومي، وهامش لكل طبق، وتكلفة الوصفات.",
          "boutique": "تقرير يومي، وهامش لكل منتج، وقيمة المخزون.",
          "spa": "تقرير يومي، والإيرادات لكل خدمة.",
          "hotel": "تقرير يومي، والإيرادات لكل خدمة."
        },
        "retention": "ملف العملاء، والولاء، ومتابعات WhatsApp التي توافق عليها واحدة تلو الأخرى.",
        "multisite": "كل فروعك في لوحة تحكم واحدة، ولكل فرع أرقامه."
      },
      "wa": {
        "hello": "مرحباً Kiwi، أرغب في عرض توضيحي.",
        "name": "الاسم الأول",
        "biz": "النشاط التجاري",
        "trade": "النشاط",
        "size": "الحجم",
        "needs": "الأولويات",
        "note": "التفاصيل",
        "when": "الموعد المفضل (للتأكيد)",
        "phone": "الهاتف",
        "email": "البريد الإلكتروني"
      }
    },
  };

  /* ───────────── language ───────────── */
  function lang() {
    var l = (document.documentElement.getAttribute('lang') || 'fr').slice(0, 2).toLowerCase();
    return STR[l] ? l : (STR.en ? 'en' : 'fr');
  }
  function S() { return STR[lang()] || STR.fr; }
  function t(key, vars) {
    var v = S()[key];
    if (v == null) v = STR.fr[key];
    return vars ? fill(v, vars) : String(v == null ? '' : v);
  }
  function fill(v, vars) {
    return String(v == null ? '' : v).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function trades() { return (window.KiwiTrades && window.KiwiTrades.LIST) || []; }
  function tradeOf(id) { return trades().filter(function (x) { return x.id === id; })[0] || null; }
  function tradeLabel(tr) { if (!tr) return ''; var l = tr.label || {}; return l[lang()] || l.en || l.fr || tr.id; }
  function base() { var tr = tradeOf(state.trade); return (tr && tr.base) || 'boutique'; }
  function plural(n, pair) { return n + ' ' + (Number(n) > 1 ? pair[1] : pair[0]); }

  /* ───────────── state, kept between steps and reloads of the tab ───────────── */
  var blank = function () {
    return { step: 1, first: '', biz: '', trade: '', loc: '', locExact: '', team: '', teamExact: '', pains: [], other: '', date: '', time: '', phone: '', email: '' };
  };
  var state = blank();
  try { var saved = JSON.parse(sessionStorage.getItem(STORE) || 'null'); if (saved && typeof saved === 'object') state = Object.assign(blank(), saved); } catch (_) {}
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {} }

  var ui = null, lastFocus = null, errors = {};

  function locCount() { return state.loc === 'exact' ? state.locExact : state.loc; }
  function teamCount() { return state.team === 'exact' ? state.teamExact : state.team; }
  function sizeText() {
    var l = locCount(), p = teamCount(), out = [];
    if (l) out.push(/^\d+$/.test(l) ? plural(+l, S().locWord || STR.fr.locWord) : l + ' ' + (S().locWord || STR.fr.locWord)[1]);
    if (p) out.push(p === 'me' ? t('justMe') : (/^\d+$/.test(p) ? plural(+p, S().peopleWord || STR.fr.peopleWord) : p + ' ' + (S().peopleWord || STR.fr.peopleWord)[1]));
    return out.join(' · ');
  }
  function painsText() {
    var P = S().pains || STR.fr.pains;
    return state.pains.map(function (k) { return P[k] || k; }).join(', ');
  }
  function dateText() {
    if (!state.date) return '';
    try {
      var d = new Date(state.date + 'T12:00:00');
      var loc = { fr: 'fr-MA', en: 'en-GB', ar: 'ar-MA' }[lang()] || 'en-GB';
      return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }) + (state.time ? ' · ' + state.time : '') + ' · ' + t('timezone');
    } catch (_) { return state.date + ' ' + state.time; }
  }
  function features() {
    var F = S().features || STR.fr.features, b = base();
    return state.pains.map(function (k) {
      var f = F[k]; if (!f) return null;
      return { key: k, text: typeof f === 'string' ? f : (f[b] || f.boutique) };
    }).filter(Boolean);
  }
  function waText() {
    var W = S().wa || STR.fr.wa, lines = [W.hello, ''];
    var row = function (l, v) { if (v) lines.push(l + ' : ' + v); };
    row(W.name, state.first);
    row(W.biz, state.biz);
    row(W.trade, tradeLabel(tradeOf(state.trade)));
    row(W.size, sizeText());
    row(W.needs, painsText());
    row(W.note, state.other.trim());
    row(W.when, dateText());
    row(W.phone, state.phone.trim());
    row(W.email, state.email.trim());
    return lines.join('\n');
  }
  function waUrl(text) { return 'https://wa.me/' + WA + (text ? '?text=' + encodeURIComponent(text) : ''); }

  /* ───────────── validation, one step at a time ───────────── */
  function validate(step) {
    errors = {};
    if (step === 1) {
      if (!state.first.trim()) errors.first = t('required');
      if (!state.biz.trim()) errors.biz = t('required');
    } else if (step === 2) {
      if (!state.trade) errors.trade = t('pickTrade');
    } else if (step === 3) {
      if (!locCount() || (state.loc === 'exact' && !(+state.locExact >= 1))) errors.loc = t('required');
      if (!teamCount() || (state.team === 'exact' && !(+state.teamExact >= 1))) errors.team = t('required');
    } else if (step === 4) {
      if (!state.pains.length && !state.other.trim()) errors.pains = t('pickOne');
    } else if (step === 5) {
      if (!state.date || state.date < todayIso()) errors.date = t('dateBad');
      if (!state.time) errors.time = t('required');
      var digits = state.phone.replace(/[^\d]/g, '');
      if (!state.phone.trim()) errors.phone = t('required');
      else if (digits.length < 9 || digits.length > 15) errors.phone = t('phoneBad');
      if (state.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) errors.email = t('emailBad');
    }
    return !Object.keys(errors).length;
  }
  function todayIso() {
    var d = new Date(); var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ───────────── markup ───────────── */
  function field(key, label, input) {
    var err = errors[key];
    return '<div class="kdf-field' + (err ? ' has-err' : '') + '"><label for="kdf-' + key + '">' + esc(label) + '</label>' + input
      + (err ? '<p class="kdf-err" id="kdf-' + key + '-err">' + esc(err) + '</p>' : '') + '</div>';
  }
  function input(key, type, ph, extra) {
    return '<input id="kdf-' + key + '" data-k="' + key + '" type="' + type + '" value="' + esc(state[key]) + '" placeholder="' + esc(ph || '') + '"'
      + (errors[key] ? ' aria-invalid="true" aria-describedby="kdf-' + key + '-err"' : '') + (extra || '') + '>';
  }
  function chips(key, options) {
    var cur = state[key];
    return '<div class="kdf-chips" role="radiogroup">' + options.map(function (o) {
      var on = cur === o.v;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="kdf-chip' + (on ? ' on' : '') + '" data-set="' + key + '" data-v="' + esc(o.v) + '">' + esc(o.l) + '</button>';
    }).join('') + '</div>';
  }

  function stepHtml() {
    var s = state.step, name = esc(state.first.trim()), biz = esc(state.biz.trim());
    if (s === 1) {
      return head(t('s1Title'), t('s1Lead'))
        + field('first', t('firstName'), input('first', 'text', t('firstNamePh'), ' autocomplete="given-name" maxlength="40"'))
        + field('biz', t('business'), input('biz', 'text', t('businessPh'), ' autocomplete="organization" maxlength="60"'));
    }
    if (s === 2) {
      var cards = trades().map(function (tr) {
        var on = state.trade === tr.id;
        return '<button type="button" role="radio" aria-checked="' + on + '" class="kdf-trade' + (on ? ' on' : '') + '" data-set="trade" data-v="' + tr.id + '"><span class="kdf-trade-ic">' + (tr.icon || '') + '</span><span>' + esc(tradeLabel(tr)) + '</span></button>';
      }).join('');
      return head(fill(t('s2Title'), { name: name, biz: biz }), t('s2Lead'))
        + '<div class="kdf-trades" role="radiogroup" aria-label="' + esc(fill(t('s2Title'), { name: state.first, biz: state.biz })) + '">' + cards + '</div>'
        + (errors.trade ? '<p class="kdf-err" role="alert">' + esc(errors.trade) + '</p>' : '');
    }
    if (s === 3) {
      var loc = chips('loc', [{ v: '1', l: '1' }, { v: '2', l: '2' }, { v: '3', l: '3' }, { v: '4-10', l: '4 – 10' }, { v: 'exact', l: t('exact') }]);
      var team = chips('team', [{ v: 'me', l: t('justMe') }, { v: '2-5', l: '2 – 5' }, { v: '6-15', l: '6 – 15' }, { v: '16+', l: '16 +' }, { v: 'exact', l: t('exact') }]);
      return head(t('s3Title'), t('s3Lead'))
        + '<fieldset class="kdf-set' + (errors.loc ? ' has-err' : '') + '"><legend>' + esc(t('locations')) + '</legend>' + loc
        + (state.loc === 'exact' ? '<input class="kdf-exact" data-k="locExact" type="number" inputmode="numeric" min="1" max="999" value="' + esc(state.locExact) + '" placeholder="' + esc(t('exactPh')) + '" aria-label="' + esc(t('locations')) + '">' : '')
        + (errors.loc ? '<p class="kdf-err">' + esc(errors.loc) + '</p>' : '') + '</fieldset>'
        + '<fieldset class="kdf-set' + (errors.team ? ' has-err' : '') + '"><legend>' + esc(t('people')) + '</legend>' + team
        + (state.team === 'exact' ? '<input class="kdf-exact" data-k="teamExact" type="number" inputmode="numeric" min="1" max="9999" value="' + esc(state.teamExact) + '" placeholder="' + esc(t('exactPh')) + '" aria-label="' + esc(t('people')) + '">' : '')
        + (errors.team ? '<p class="kdf-err">' + esc(errors.team) + '</p>' : '') + '</fieldset>';
    }
    if (s === 4) {
      var P = S().pains || STR.fr.pains, EX = (S().painEx || STR.fr.painEx)[base()] || {};
      var opts = Object.keys(STR.fr.pains).map(function (k) {
        var on = state.pains.indexOf(k) >= 0;
        return '<button type="button" role="checkbox" aria-checked="' + on + '" class="kdf-pain' + (on ? ' on' : '') + '" data-pain="' + k + '"><b>' + esc(P[k]) + '</b><small>' + esc(EX[k] || '') + '</small></button>';
      }).join('');
      var f = features();
      var summary = '<div class="kdf-summary" aria-live="polite"><h3>' + esc(fill(t('summaryTitle'), { biz: state.biz.trim() || 'vous' })) + '</h3>'
        + (f.length ? '<ul>' + f.map(function (x) { return '<li><span>' + esc(P[x.key]) + '</span>' + esc(x.text) + '</li>'; }).join('') + '</ul>' : '<p>' + esc(t('summaryEmpty')) + '</p>') + '</div>';
      return head(t('s4Title'), t('s4Lead'))
        + '<div class="kdf-pains">' + opts + '</div>'
        + (errors.pains ? '<p class="kdf-err" role="alert">' + esc(errors.pains) + '</p>' : '')
        + field('other', t('other'), '<textarea id="kdf-other" data-k="other" rows="2" maxlength="300" placeholder="' + esc(t('otherPh')) + '">' + esc(state.other) + '</textarea>')
        + summary;
    }
    if (s === 5) {
      var times = [];
      for (var h = 9; h <= 18; h++) { times.push((h < 10 ? '0' : '') + h + ':00'); if (h < 18) times.push((h < 10 ? '0' : '') + h + ':30'); }
      var timeSel = '<select id="kdf-time" data-k="time"' + (errors.time ? ' aria-invalid="true"' : '') + '><option value="">' + esc(t('timePick')) + '</option>'
        + times.map(function (x) { return '<option' + (state.time === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
      return head(fill(t('s5Title'), { name: name }), t('s5Lead'))
        + '<div class="kdf-row">' + field('date', t('date'), input('date', 'date', '', ' min="' + todayIso() + '"')) + field('time', t('time'), timeSel) + '</div>'
        + '<p class="kdf-tz">' + esc(t('timezone')) + ' · ' + esc(t('pending')) + '</p>'
        + '<div class="kdf-row">' + field('phone', t('phone'), input('phone', 'tel', t('phonePh'), ' autocomplete="tel" inputmode="tel" maxlength="20"'))
        + field('email', t('email'), input('email', 'email', t('emailPh'), ' autocomplete="email" maxlength="80"')) + '</div>'
        + recapHtml();
    }
    /* done */
    return '<div class="kdf-done"><div class="kdf-done-mark" aria-hidden="true">' + checkSvg + '</div>'
      + '<h2 id="kdf-title" tabindex="-1">' + esc(fill(t('doneTitle'), { name: state.first.trim() })) + '</h2><p class="kdf-lead">' + esc(t('doneLead')) + '</p>'
      + '<ol class="kdf-next"><li>' + esc(fill(t('doneNext1'), { biz: state.biz.trim() })) + '</li><li>' + esc(t('doneNext2')) + '</li><li>' + esc(t('doneNext3')) + '</li></ol>'
      + '<p class="kdf-pending">' + esc(dateText()) + '<br>' + esc(t('pending')) + '</p>'
      + '<a class="kdf-link" href="' + esc(waUrl(waText())) + '" target="_blank" rel="noreferrer" data-retry>' + esc(t('doneRetry')) + '</a></div>';
  }
  function recapHtml() {
    var recap = [
      [t('recapBiz'), state.biz.trim() + ' · ' + tradeLabel(tradeOf(state.trade))],
      [t('recapSize'), sizeText()],
      [t('recapNeeds'), [painsText(), state.other.trim()].filter(Boolean).join(' · ')],
      [t('recapWhen'), dateText() ? dateText() : ''],
      [t('recapContact'), [state.phone.trim(), state.email.trim()].filter(Boolean).join(' · ')],
    ];
    return '<div class="kdf-recap"><h3>' + esc(t('recap')) + '</h3><dl>' + recap.map(function (r) { return r[1] ? '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>' : ''; }).join('')
      + '</dl><p class="kdf-pending">' + esc(t('pending')) + '</p></div>';
  }
  function head(title, lead) {
    return '<h2 id="kdf-title" tabindex="-1">' + esc(title) + '</h2><p class="kdf-lead">' + esc(lead) + '</p>';
  }
  var checkSvg = '<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>';
  var closeSvg = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>';
  var backSvg = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M400-80 0-480l400-400 71 71-329 329 329 329-71 71Z"/></svg>';
  var waSvg = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"/></svg>';

  function render(focusTitle) {
    if (!ui) return;
    var done = state.step > STEPS;
    var dir = document.documentElement.getAttribute('dir') === 'rtl' || lang() === 'ar' ? 'rtl' : 'ltr';
    ui.setAttribute('dir', dir);
    ui.setAttribute('lang', lang());
    var pct = Math.round(Math.min(state.step - 1, STEPS) / STEPS * 100);
    ui.querySelector('.kdf-progress').innerHTML = done ? '' : '<div class="kdf-bar"><i style="width:' + Math.max(8, Math.round(state.step / STEPS * 100)) + '%"></i></div><span>' + esc(fill(t('stepOf'), { n: state.step, total: STEPS })) + '</span>';
    ui.querySelector('.kdf-progress').setAttribute('aria-valuenow', String(pct));
    ui.querySelector('.kdf-body').innerHTML = stepHtml();
    var back = ui.querySelector('[data-back]');
    back.hidden = done || state.step === 1;
    var foot = ui.querySelector('.kdf-foot');
    if (done) {
      foot.innerHTML = '<button type="button" class="kdf-primary" data-close>' + esc(t('doneClose')) + '</button>';
    } else if (state.step === STEPS) {
      foot.innerHTML = '<button type="button" class="kdf-primary" data-submit>' + waSvg + '<span>' + esc(t('submit')) + '</span></button><p class="kdf-foot-note">' + esc(t('submitNote')) + '</p>';
    } else {
      foot.innerHTML = '<button type="button" class="kdf-primary" data-next>' + esc(t('next')) + '</button>'
        + '<a class="kdf-link" href="' + waUrl('') + '" target="_blank" rel="noreferrer">' + esc(t('waAside')) + '</a>';
    }
    if (focusTitle) { var h = ui.querySelector('#kdf-title'); if (h) h.focus({ preventScroll: true }); ui.querySelector('.kdf-scroll').scrollTop = 0; }
  }
  function focusFirstError() {
    var el = ui.querySelector('[aria-invalid="true"], .kdf-err');
    if (el) { (el.matches('input,select,textarea') ? el : (el.closest('.kdf-set, .kdf-field') || el)).scrollIntoView({ block: 'center', behavior: 'smooth' }); if (el.focus && el.matches('input,select,textarea')) el.focus(); }
  }

  /* ───────────── sheet ───────────── */
  function build() {
    injectCss();
    ui = document.createElement('div');
    ui.className = 'kdf-back';
    ui.innerHTML = '<div class="kdf" role="dialog" aria-modal="true" aria-labelledby="kdf-title">'
      + '<div class="kdf-top"><button type="button" class="kdf-icon" data-back aria-label="' + esc(t('back')) + '">' + backSvg + '</button>'
      + '<div class="kdf-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"></div>'
      + '<button type="button" class="kdf-icon" data-close aria-label="' + esc(t('close')) + '">' + closeSvg + '</button></div>'
      + '<div class="kdf-scroll"><div class="kdf-body"></div></div><div class="kdf-foot"></div></div>';
    document.body.appendChild(ui);
    ui.addEventListener('click', onClick);
    ui.addEventListener('input', onInput);
    ui.addEventListener('change', onInput);
    ui.addEventListener('keydown', onKey);
  }
  function open() {
    lastFocus = document.activeElement;
    if (state.step > STEPS) state.step = 1;
    if (!ui) build();
    errors = {};
    render(true);
    document.documentElement.classList.add('kdf-lock');
    requestAnimationFrame(function () { ui.classList.add('in'); });
  }
  function close() {
    if (!ui) return;
    ui.classList.remove('in');
    document.documentElement.classList.remove('kdf-lock');
    if (state.step > STEPS) { state = blank(); save(); }
    var el = ui; ui = null;
    setTimeout(function () { el.remove(); }, 220);
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (_) {}
  }
  function go(n) { state.step = n; errors = {}; save(); render(true); }

  function onClick(e) {
    var b = e.target.closest('button, a');
    if (e.target === ui) { close(); return; }
    if (!b) return;
    if (b.hasAttribute('data-close')) { close(); return; }
    if (b.hasAttribute('data-back')) { if (state.step > 1) go(state.step - 1); return; }
    if (b.hasAttribute('data-next')) {
      if (validate(state.step)) go(state.step + 1); else { render(false); focusFirstError(); }
      return;
    }
    if (b.hasAttribute('data-submit')) {
      if (!validate(5)) { render(false); focusFirstError(); return; }
      var url = waUrl(waText());
      window.open(url, '_blank', 'noopener');
      state.step = STEPS + 1; save(); render(true);
      return;
    }
    if (b.dataset.set) {
      state[b.dataset.set] = b.dataset.v;
      delete errors[b.dataset.set];
      save(); render(false);
      var again = ui.querySelector('[data-set="' + b.dataset.set + '"][data-v="' + b.dataset.v + '"]'); if (again) again.focus();
      if (b.dataset.v === 'exact') { var ex = ui.querySelector('[data-k="' + b.dataset.set + 'Exact"]'); if (ex) ex.focus(); }
      return;
    }
    if (b.dataset.pain) {
      var k = b.dataset.pain, i = state.pains.indexOf(k);
      if (i >= 0) state.pains.splice(i, 1); else state.pains.push(k);
      delete errors.pains; save(); render(false);
      var p = ui.querySelector('[data-pain="' + k + '"]'); if (p) p.focus();
    }
  }
  function onInput(e) {
    var k = e.target.getAttribute('data-k');
    if (!k) return;
    state[k] = e.target.value;
    save();
    var ek = k === 'locExact' ? 'loc' : k === 'teamExact' ? 'team' : k;
    if (errors[ek] && e.type === 'change') { delete errors[ek]; var fld = e.target.closest('.kdf-field, .kdf-set'); if (fld) { fld.classList.remove('has-err'); var m = fld.querySelector('.kdf-err'); if (m) m.remove(); } e.target.removeAttribute('aria-invalid'); }
    if (state.step === 4 && k === 'other') return;
    if (state.step === 5 && (k === 'date' || k === 'time' || k === 'phone' || k === 'email') && e.type === 'change') {
      /* Only the recap moves: rebuilding the step here would replace the
         send button under a finger that is already pressing it. */
      var rec = ui.querySelector('.kdf-recap');
      if (rec) rec.outerHTML = recapHtml();
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter' && e.target.matches('input:not([type="date"])') && state.step <= STEPS) {
      e.preventDefault();
      var nx = ui.querySelector('[data-next], [data-submit]'); if (nx) nx.click();
      return;
    }
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(ui.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]'), function (x) { return !x.hidden && !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }

  /* ───────────── the landing's demo buttons open the sheet ───────────── */
  var DEMO = /d[ée]mo|عرض/i;
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="https://wa.me/' + WA + '"]');
    if (!a || (ui && ui.contains(a))) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('?') >= 0) return;
    if (!DEMO.test(a.textContent || '')) return;
    e.preventDefault();
    open();
  }, true);

  function injectCss() {
    if (document.getElementById('kdf-css') || document.querySelector('link[href*="landing-demo-funnel.css"]')) return;
    var l = document.createElement('link');
    l.id = 'kdf-css'; l.rel = 'stylesheet'; l.href = '/assets/landing-demo-funnel.css?v=1';
    document.head.appendChild(l);
  }

  window.KiwiDemoFunnel = { open: open, close: close, STR: STR, _state: function () { return state; }, _waText: waText };
})();
