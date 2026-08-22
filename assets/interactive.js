/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · interactive demo layer
 * Handles all click interactions across index / dashboard / wallet / brand / pitch
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* i18n — current locale (fr default); window.KiwiI18n owns the master dict. */
  const kiwiLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  /* Pick a localized string for the current UI language. Use for dynamically
   * generated copy (toasts, dropdown menus) that can't carry a data-i18n
   * attribute. Falls back to French if a locale is missing. */
  const tr = (o) => (o == null ? '' : (o[kiwiLang()] ?? o.fr ?? ''));

  const GENERAL_STR = {
    fr: {
      close: 'Fermer',
      cancel: 'Annuler',
      back: '← Retour',
      continue: 'Continuer →',
      download: 'Télécharger',
      send: 'Envoyer',
      or: 'Ou',
      yes: 'Oui',
      no: 'Non',
    },
    en: {
      close: 'Close',
      cancel: 'Cancel',
      back: '← Back',
      continue: 'Continue →',
      download: 'Download',
      send: 'Send',
      or: 'Or',
      yes: 'Yes',
      no: 'No',
    },
    ar: {
      close: 'إغلاق',
      cancel: 'إلغاء',
      back: '→ رجوع',
      continue: 'متابعة ←',
      download: 'تحميل',
      send: 'إرسال',
      or: 'أو',
      yes: 'نعم',
      no: 'لا',
    }
  };

  const AI_RESPONSES_STR = {
    fr: {
      'Envoyer le résumé de midi sur WhatsApp': '<b>Kiwi AI :</b> Résumé envoyé à <b>+212 6 xx xx xx xx</b>. Contenu : 24 380 MAD · 182 transactions · pic 13h · top serveuse Sofia (54 tx).',
      'Préparer la relance des 5 impayés à > 500 MAD': '<b>Kiwi AI :</b> Brouillon créé pour 5 clients totalisant <b>3 280 MAD</b>. Envoi WhatsApp prêt, validation humaine requise.',
      'Activer le prompt pourboire +10 % après 20h': '<b>Kiwi AI :</b> Activé. Le prompt s\'affichera après 20h sur toutes les tables. Estimation de gain : <b>+380 MAD/soir</b>.',
    },
    en: {
      'Envoyer le résumé de midi sur WhatsApp': '<b>Kiwi AI:</b> Lunch summary sent to <b>+212 6 xx xx xx xx</b>. Content: 24,380 MAD · 182 transactions · 1pm peak · top waitress Sofia (54 tx).',
      'Préparer la relance des 5 impayés à > 500 MAD': '<b>Kiwi AI:</b> Draft created for 5 clients totaling <b>3,280 MAD</b>. WhatsApp dispatch ready, human validation required.',
      'Activer le prompt pourboire +10 % après 20h': '<b>Kiwi AI:</b> Activated. The prompt will be displayed after 8pm on all tables. Estimated gain: <b>+380 MAD/evening</b>.',
    },
    ar: {
      'Envoyer le résumé de midi sur WhatsApp': '<b>Kiwi AI :</b> تم إرسال ملخص الظهيرة إلى <b>+212 6 xx xx xx xx</b>. المحتوى: 24 380 درهم · 182 معاملة · ذروة 13:00 · أفضل نادلة صوفيا (54 معاملة).',
      'Préparer la relance des 5 impayés à > 500 MAD': '<b>Kiwi AI :</b> تم إنشاء مسودة لـ 5 عملاء بمجموع <b>3 280 درهم</b>. إرسال WhatsApp جاهز، يتطلب التحقق البشري.',
      'Activer le prompt pourboire +10 % après 20h': '<b>Kiwi AI :</b> تم التفعيل. سيتم عرض الطلب بعد الساعة 8 مساءً على جميع الطاولات. الربح المقدر: <b>+380 درهم/مساء</b>.',
    }
  };

  const KPI_DESC_STR = {
    fr: {
      tx:         'Nombre de ventes sur la période.',
      panier:     'Montant moyen dépensé par vente.',
      revenue:    'Total encaissé sur la période.',
      revPerDay:  'Chiffre d\'affaires moyen par jour.',
      marge:      'Part du CA conservée après coût matière.',
      profit:     'Ce qu\'il reste après le coût matière.',
      cogs:       'Dépense en matières premières.',
      tips:       'Pourboires estimés encaissés.',
      success:    'Paiements aboutis · créneaux remplis.',
      ratio:      'Répartition des paiements carte vs espèces.',
      regulars:   'Clients déjà venus sur la période.',
      retention:  'Part de clients réguliers parmi vos ventes.',
      newClients: 'Premières visites estimées sur la période.',
      txPerDay:   'Nombre de ventes moyen par jour.',
      tauxRetour: 'Part des articles retournés.',
    },
    en: {
      tx:         'Number of sales over the period.',
      panier:     'Average amount spent per sale.',
      revenue:    'Total cashed in over the period.',
      revPerDay:  'Average daily revenue.',
      marge:      'Share of revenue kept after food cost.',
      profit:     'What remains after cost of goods.',
      cogs:       'Expenditure on raw materials.',
      tips:       'Estimated tips collected.',
      success:    'Successful payments · slots filled.',
      ratio:      'Card vs cash payment split.',
      regulars:   'Customers who came before in the period.',
      retention:  'Share of regular customers among your sales.',
      newClients: 'Estimated first visits over the period.',
      txPerDay:   'Average number of sales per day.',
      tauxRetour: 'Share of items returned.',
    },
    ar: {
      tx:         'عدد المبيعات خلال الفترة.',
      panier:     'متوسط المبلغ المنفق لكل عملية.',
      revenue:    'إجمالي المقبوضات خلال الفترة.',
      revPerDay:  'متوسط الإيرادات اليومية.',
      marge:      'نسبة المداخيل المحتفظ بها بعد تكلفة المواد.',
      profit:     'ما يتبقى بعد تكلفة المواد.',
      cogs:       'الإنفاق على المواد الأولية.',
      tips:       'الإكراميات المقدرة المحصلة.',
      success:    'المدفوعات الناجحة · الحصص المملوءة.',
      ratio:      'توزيع المدفوعات بالبطاقة مقابل النقد.',
      regulars:   'زبائن سبق أن زاروا خلال الفترة.',
      retention:  'حصة العملاء المنتظمين من مبيعاتك.',
      newClients: 'الزيارات الأولى المقدرة خلال الفترة.',
      txPerDay:   'متوسط عدد المبيعات في اليوم.',
      tauxRetour: 'نسبة المنتجات المرتجعة.',
    }
  };

  const KPI_LONG_STR = {
    fr: {
      revenue:    'Le chiffre d\'affaires additionne toutes vos ventes encaissées, espèces, carte et mobile, sur la période choisie. C\'est le point de départ de tous vos calculs de marge et de rentabilité.',
      revPerDay:  'Le chiffre d\'affaires divisé par le nombre de jours d\'ouverture. Utile pour comparer des périodes de longueurs différentes et repérer vos meilleurs jours.',
      profit:     'Le bénéfice brut, c\'est le chiffre d\'affaires moins le coût des matières premières. Il ne tient pas encore compte des charges fixes, loyer, salaires, énergie.',
      cogs:       'Le coût matière regroupe tout ce que vous achetez pour produire vos ventes : ingrédients, boissons, consommables. Le surveiller protège directement votre marge.',
      tips:       'Estimation des pourboires encaissés sur la période, calculée à partir de votre volume de ventes. Ils reviennent à l\'équipe et n\'entrent pas dans votre chiffre d\'affaires.',
      retention:  'La part de vos ventes réalisées avec des clients déjà venus. Un taux élevé signale une clientèle fidèle, bien moins coûteuse à servir qu\'à conquérir.',
      newClients: 'Estimation du nombre de premières visites sur la période. C\'est votre rythme d\'acquisition de nouveaux clients.',
      txPerDay:   'Le nombre de ventes moyen par jour d\'ouverture, un bon indicateur de fréquentation, indépendant du montant dépensé.',
    },
    en: {
      revenue:    'Revenue is the sum of all your collected sales, cash, card, and mobile, over the chosen period. It\'s the starting point for all your margin and profitability calculations.',
      revPerDay:  'Revenue divided by the number of opening days. Useful for comparing periods of different lengths and identifying your best days.',
      profit:     'Gross profit is revenue minus the cost of raw materials. It does not yet account for fixed costs, rent, salaries, energy.',
      cogs:       'Cost of goods sold includes everything you buy to produce your sales: ingredients, drinks, consumables. Monitoring it directly protects your margin.',
      tips:       'Estimated tips collected over the period, calculated from your sales volume. They belong to the team and are not included in your revenue.',
      retention:  'The share of your sales made with returning customers. A high rate signals a loyal customer base, much cheaper to serve than to acquire.',
      newClients: 'Estimated number of first visits over the period. This is your new customer acquisition rate.',
      txPerDay:   'The average number of sales per opening day, a good indicator of footfall, independent of the amount spent.',
    },
    ar: {
      revenue:    'الإيرادات هي مجموع كل مبيعاتك المحصلة - نقدًا، بالبطاقة، وعبر الهاتف المحمول - خلال الفترة المختارة. إنها نقطة الانطلاق لجميع حسابات الهامش والربحية.',
      revPerDay:  'الإيرادات مقسومة على عدد أيام العمل. مفيد لمقارنة فترات مختلفة الطول وتحديد أفضل أيامك.',
      profit:     'الربح الإجمالي هو الإيرادات مطروحًا منها تكلفة المواد الأولية. لا يأخذ في الاعتبار بعد التكاليف الثابتة - الإيجار والرواتب والطاقة.',
      cogs:       'تكلفة المواد المباعة تشمل كل ما تشتريه لإنتاج مبيعاتك: المكونات والمشروبات والمواد الاستهلاكية. مراقبتها تحمي هامشك مباشرة.',
      tips:       'تقدير للإكراميات المحصلة خلال الفترة، محسوبة من حجم مبيعاتك. تعود للفريق ولا يتم تضمينها في إيراداتك.',
      retention:  'حصة مبيعاتك التي تمت مع عملاء عائدين. يشير المعدل المرتفع إلى قاعدة عملاء مخلصين - خدمتهم أرخص بكثير من اكتساب عملاء جدد.',
      newClients: 'العدد التقديري للزيارات الأولى خلال الفترة. هذا هو معدل اكتساب العملاء الجدد.',
      txPerDay:   'متوسط عدد المبيعات في كل يوم عمل - مؤشر جيد على الإقبال، بغض النظر عن المبلغ الذي تم إنفاقه.',
    }
  };

    const SIGNUP_STR = {
    fr: {
      tag: 'INSCRIPTION',
      title: 'Commençons par vous connaître.',
      desc: 'Votre compte Kiwi est activé en 3 minutes, directement depuis ce site.',
      steps: ['Type de commerce', 'Identité', 'Activation'],
      step_prefix: 'ÉTAPE',
      finish_button: 'Terminer l\'inscription',
      business_resto: 'Restaurant / café',
      business_resto_desc: 'Plan de salle, tables, split bill, ticket cuisine inclus.',
      business_retail: 'Commerce de détail',
      business_retail_desc: 'Épicerie, boutique, pharmacie, caisse rapide avec inventaire.',
      business_services: 'Services',
      business_services_desc: 'Salon de coiffure, beauté, VTC, prise de rdv + encaissement.',
      business_other: 'Autre activité',
      business_other_desc: 'Notre équipe vous recommande la meilleure configuration.',
      shop_name_label: 'Nom de la boutique',
      shop_name_placeholder: 'Ex. Café Atlas',
      first_name_label: 'Prénom',
      first_name_placeholder: 'Rachid',
      last_name_label: 'Nom',
      last_name_placeholder: 'Benhima',
      phone_label: 'Téléphone marocain',
      phone_placeholder: '+212 6 xx xx xx xx',
      city_label: 'Ville',
      city_placeholder: 'Casablanca',
      kyc_notice: 'Vos données sont chiffrées en transit et au repos, et ne sont jamais revendues.',
      ready_title: 'Votre compte Kiwi est prêt.',
      ready_desc: 'Vous recevez votre terminal PAX A920 gratuitement sous 48h. En attendant, commencez à encaisser dès maintenant sur votre téléphone.',
      subscription_label: 'ABONNEMENT',
      subscription_value: '399 MAD/mois',
      settlement_label: 'RÈGLEMENT',
      settlement_value: 'T+1 auto',
      hardware_label: 'MATÉRIEL',
      hardware_value: 'Offert',
      commitment_label: 'ENGAGEMENT',
      commitment_value: 'Aucun',
      toast_success_title: 'Compte Kiwi créé · RC en cours de vérification',
      toast_success_desc: 'Un conseiller vous contacte dans 2 heures sur WhatsApp.'
    },
    en: {
      tag: 'SIGN UP',
      title: 'Let\'s get to know you.',
      desc: 'Your Kiwi account is activated in 3 minutes, directly from this site.',
      steps: ['Business Type', 'Identity', 'Activation'],
      step_prefix: 'STEP',
      finish_button: 'Finish registration',
      business_resto: 'Restaurant / café',
      business_resto_desc: 'Floor plan, tables, split bill, kitchen ticket included.',
      business_retail: 'Retail',
      business_retail_desc: 'Grocery, shop, pharmacy, fast checkout with inventory.',
      business_services: 'Services',
      business_services_desc: 'Hair salon, beauty, ride-hailing, appointments + payment.',
      business_other: 'Other activity',
      business_other_desc: 'Our team will recommend the best configuration for you.',
      shop_name_label: 'Shop Name',
      shop_name_placeholder: 'e.g. Café Atlas',
      first_name_label: 'First Name',
      first_name_placeholder: 'Rachid',
      last_name_label: 'Last Name',
      last_name_placeholder: 'Benhima',
      phone_label: 'Moroccan Phone',
      phone_placeholder: '+212 6 xx xx xx xx',
      city_label: 'City',
      city_placeholder: 'Casablanca',
      kyc_notice: 'Your data is encrypted in transit and at rest, and is never resold.',
      ready_title: 'Your Kiwi account is ready.',
      ready_desc: 'You will receive your free PAX A920 terminal within 48 hours. In the meantime, start taking payments now on your phone.',
      subscription_label: 'SUBSCRIPTION',
      subscription_value: '399 MAD/month',
      settlement_label: 'SETTLEMENT',
      settlement_value: 'D+1 auto',
      hardware_label: 'HARDWARE',
      hardware_value: 'Free',
      commitment_label: 'COMMITMENT',
      commitment_value: 'None',
      toast_success_title: 'Kiwi account created · Trade registry under review',
      toast_success_desc: 'An advisor will contact you within 2 hours on WhatsApp.'
    },
    ar: {
      tag: 'تسجيل',
      title: 'لنبدأ بالتعرف عليك.',
      desc: 'يتم تفعيل حسابك في كيوي في 3 دقائق، مباشرة من هذا الموقع.',
      steps: ['نوع النشاط', 'الهوية', 'التفعيل'],
      step_prefix: 'خطوة',
      finish_button: 'إنهاء التسجيل',
      business_resto: 'مطعم / مقهى',
      business_resto_desc: 'خطة القاعة، الطاولات، تقسيم الفاتورة، تذكرة المطبخ متضمنة.',
      business_retail: 'تجارة التجزئة',
      business_retail_desc: 'بقالة، متجر، صيدلية - دفع سريع مع إدارة المخزون.',
      business_services: 'خدمات',
      business_services_desc: 'صالون حلاقة، تجميل، سيارات الأجرة - حجز المواعيد + التحصيل.',
      business_other: 'نشاط آخر',
      business_other_desc: 'فريقنا سيوصيك بأفضل إعداد.',
      shop_name_label: 'اسم المتجر',
      shop_name_placeholder: 'مثال: مقهى أطلس',
      first_name_label: 'الاسم الشخصي',
      first_name_placeholder: 'رشيد',
      last_name_label: 'الاسم العائلي',
      last_name_placeholder: 'بن هيمة',
      phone_label: 'الهاتف المغربي',
      phone_placeholder: 'xx xx xx 6 212+',
      city_label: 'المدينة',
      city_placeholder: 'الدار البيضاء',
      kyc_notice: 'بياناتك مشفّرة أثناء النقل وفي التخزين، ولا تُباع أبدًا.',
      ready_title: 'حسابك في كيوي جاهز.',
      ready_desc: 'ستستلم جهاز PAX A920 مجانًا في غضون 48 ساعة. في هذه الأثناء، ابدأ في تحصيل المدفوعات الآن على هاتفك.',
      subscription_label: 'الاشتراك',
      subscription_value: '399 درهم/شهر',
      settlement_label: 'التسوية',
      settlement_value: 'ي+1 تلقائي',
      hardware_label: 'الجهاز',
      hardware_value: 'مجاني',
      commitment_label: 'الالتزام',
      commitment_value: 'لا يوجد',
      toast_success_title: 'تم إنشاء حساب كيوي · السجل التجاري قيد المراجعة',
      toast_success_desc: 'سيتصل بك مستشار في غضون ساعتين على WhatsApp.'
    }
  };

  const LOGIN_STR = {
    fr: {
        title: 'Connexion',
        desc: 'Accédez à votre tableau de bord Kiwi.',
        email_label: 'Email',
        password_label: 'Mot de passe',
        remember_me: 'Se souvenir de moi',
        forgot_password: 'Mot de passe oublié ?',
        login_button: 'Se connecter',
        no_account: 'Pas encore de compte ?',
        create_account: 'Créez-en un'
    },
    en: {
        title: 'Login',
        desc: 'Access your Kiwi dashboard.',
        email_label: 'Email',
        password_label: 'Password',
        remember_me: 'Remember me',
        forgot_password: 'Forgot password?',
        login_button: 'Log in',
        no_account: 'No account yet?',
        create_account: 'Create one'
    },
ar: {
        title: 'تسجيل الدخول',
        desc: 'الوصول إلى لوحة تحكم كيوي الخاصة بك.',
        email_label: 'البريد الإلكتروني',
        password_label: 'كلمة المرور',
        remember_me: 'تذكرني',
        forgot_password: 'هل نسيت كلمة المرور؟',
        login_button: 'تسجيل الدخول',
        no_account: 'ليس لديك حساب بعد؟',
        create_account: 'أنشئ حسابًا'
    }
  };

  const NOTIFICATIONS_STR = {
      fr: {
          title: 'Notifications',
          subtitle: '3 non lues',
          settlement_ready_title: 'Virement de 23 091 MAD prêt',
          settlement_ready_desc: 'Votre règlement T+1 est prêt et sera viré demain à 9h.',
          time_12_min: 'il y a 12 min',
          terminal_offline_title: 'Terminal T2 hors ligne',
          terminal_offline_desc: 'Le terminal de la terrasse semble déconnecté depuis 1 heure.',
          time_1_hr: 'il y a 1 h',
          ai_suggestion_title: 'Suggestion Kiwi AI',
          ai_suggestion_desc: 'Le taux de pourboire du soir est 3x celui du midi. Pensez à activer un prompt +15% après 20h.',
          time_2_hr: 'il y a 2 h',
          yesterday_tx_title: 'Résumé transactions hier',
          yesterday_tx_desc: 'Vous avez encaissé 45 310 MAD sur 251 transactions.',
          time_yesterday_2345: 'Hier, 23:45',
          fatima_signed_title: 'Fatima Khalki a signé son contrat',
          fatima_signed_desc: 'Le document est disponible dans votre espace RH.',
          time_yesterday_2100: 'Hier, 21:00',
          mark_all_read: 'Marquer tout comme lu'
      },
      en: {
          title: 'Notifications',
          subtitle: '3 unread',
          settlement_ready_title: 'Settlement of 23,091 MAD ready',
          settlement_ready_desc: 'Your D+1 settlement is ready and will be transferred tomorrow at 9am.',
          time_12_min: '12 min ago',
          terminal_offline_title: 'Terminal T2 offline',
          terminal_offline_desc: 'The terrace terminal seems to have been disconnected for 1 hour.',
          time_1_hr: '1 hr ago',
          ai_suggestion_title: 'Kiwi AI Suggestion',
          ai_suggestion_desc: 'The evening tip rate is 3x the lunch rate. Consider activating a +15% prompt after 8pm.',
          time_2_hr: '2 hr ago',
          yesterday_tx_title: 'Yesterday\'s transaction summary',
          yesterday_tx_desc: 'You collected 45,310 MAD from 251 transactions.',
          time_yesterday_2345: 'Yesterday, 11:45 PM',
          fatima_signed_title: 'Fatima Khalki signed her contract',
          fatima_signed_desc: 'The document is available in your HR space.',
          time_yesterday_2100: 'Yesterday, 9:00 PM',
          mark_all_read: 'Mark all as read'
      },
      ar: {
          title: 'الإشعارات',
          subtitle: '3 غير مقروءة',
          settlement_ready_title: 'تسوية بقيمة 23,091 درهم جاهزة',
          settlement_ready_desc: 'تسوية ي+1 جاهزة وسيتم تحويلها غدًا الساعة 9 صباحًا.',
          time_12_min: 'قبل 12 دقيقة',
          terminal_offline_title: 'الجهاز T2 غير متصل',
          terminal_offline_desc: 'يبدو أن جهاز التراس غير متصل منذ ساعة واحدة.',
          time_1_hr: 'قبل ساعة',
          ai_suggestion_title: 'اقتراح من ذكاء كيوي الاصطناعي',
          ai_suggestion_desc: 'معدل الإكرامية المسائية هو 3 أضعاف معدل الغداء. فكر في تفعيل مطالبة +15% بعد الساعة 8 مساءً.',
          time_2_hr: 'قبل ساعتين',
          yesterday_tx_title: 'ملخص معاملات الأمس',
          yesterday_tx_desc: 'لقد حصّلت 45,310 درهم من 251 معاملة.',
          time_yesterday_2345: 'أمس، 23:45',
          fatima_signed_title: 'فاطمة خالقي وقعت عقدها',
          fatima_signed_desc: 'المستند متوفر في قسم الموارد البشرية الخاص بك.',
          time_yesterday_2100: 'أمس، 21:00',
          mark_all_read: 'وضع علامة على الكل كمقروء'
      }
  };


  /* ─────────── INJECTED STYLES ─────────── */
  const CSS = `
  /* Toasts */
  /* Action feedback must sit above full-page drawers/modals (z-9990). The old
     token value (400) painted confirmations underneath the very surface whose
     Save button was clicked, making a working action look inert. */
  .kiwi-toasts { position: fixed; top: max(20px, env(safe-area-inset-top)); right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 10020; pointer-events: none; max-width: 390px; }
  .kiwi-toast { position: relative; overflow: hidden; background: color-mix(in srgb, var(--surface) 96%, transparent); -webkit-backdrop-filter: blur(18px) saturate(1.12); backdrop-filter: blur(18px) saturate(1.12); border: 1px solid color-mix(in srgb, var(--n-200) 78%, var(--atlas)); border-radius: 16px; padding: 15px 16px 16px; min-width: 300px; display: flex; gap: 12px; align-items: flex-start; box-shadow: 0 24px 55px -24px rgba(10,15,13,0.38), 0 8px 18px -14px rgba(11,110,79,0.30), 0 1px 0 rgba(255,255,255,0.82) inset; pointer-events: all; opacity: 0; transform: translateY(-12px) scale(.985); transition: opacity 220ms, transform 260ms cubic-bezier(0.32,0.72,0,1); font-family: var(--sans); color: var(--ink); }
  .kiwi-toast.in { opacity: 1; transform: translateY(0); }
  .kiwi-toast .ti { width: 30px; height: 30px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .kiwi-toast.success .ti { background: color-mix(in srgb, var(--atlas) 14%, var(--surface)); color: var(--atlas); }
  .kiwi-toast.info .ti { background: color-mix(in srgb, var(--info) 14%, var(--surface)); color: var(--info); }
  .kiwi-toast.warn .ti { background: color-mix(in srgb, var(--warn-ink) 16%, var(--surface)); color: var(--warn-ink); }
  .kiwi-toast.danger .ti { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); color: var(--danger); }
  .kiwi-toast .tb { flex: 1; min-width: 0; }
  .kiwi-toast .tm { font-size: 14px; font-weight: 650; line-height: 1.35; letter-spacing: -0.008em; }
  .kiwi-toast .ts { font-size: 12.5px; color: var(--n-500); margin-top: 3px; line-height: 1.4; }
  .kiwi-toast .ta { margin-top: 8px; font-size: 12.5px; color: var(--atlas); font-weight: 500; cursor: pointer; background: none; border: 0; padding: 0; }
  .kiwi-toast .tx { width: 28px; height: 28px; border-radius: 8px; background: transparent; border: 0; color: var(--n-500); cursor: pointer; font-size: 18px; line-height: 1; padding: 0; margin: -1px -3px 0 4px; display:flex; align-items:center; justify-content:center; }
  .kiwi-toast .tx:hover { color: var(--ink); }
  .kiwi-toast .tp { position:absolute; left:0; right:0; bottom:0; height:3px; background:color-mix(in srgb,var(--atlas) 70%,var(--mint)); transform-origin:left; animation:kiwi-toast-life var(--toast-duration,3600ms) linear forwards; }
  .kiwi-toast.info .tp { background:var(--info); }
  .kiwi-toast.warn .tp,.kiwi-toast.pend .tp { background:var(--warn-ink); }
  .kiwi-toast.danger .tp { background:var(--danger); }
  .kiwi-toast.is-paused .tp { animation-play-state:paused; }
  @keyframes kiwi-toast-life { from { transform:scaleX(1); } to { transform:scaleX(0); } }
  .kb.is-feedback-pending { cursor:wait; opacity:.82; }
  .kb.is-feedback-done { background:var(--atlas)!important; color:var(--paper)!important; border-color:var(--atlas)!important; }
  .kiwi-button-spinner { width:14px; height:14px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:kiwi-spin 650ms linear infinite; }
  @media (prefers-reduced-motion:reduce) { .kiwi-toast,.kiwi-toast .tp { transition:none!important; animation:none!important; } }

  /* Modal */
  .kiwi-backdrop { position: fixed; inset: 0; background: rgba(10,15,13,0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 9990; opacity: 0; transition: opacity 260ms; padding: 20px; }
  .kiwi-backdrop.in { opacity: 1; }
  .kiwi-modal { background: var(--paper); border-radius: 22px; width: 100%; max-height: calc(100vh - 40px); overflow-y: auto; position: relative; transform: translateY(20px) scale(0.985); transition: transform 320ms cubic-bezier(0.32,0.72,0,1); font-family: var(--sans); color: var(--ink); }
  .kiwi-backdrop.in .kiwi-modal { transform: translateY(0) scale(1); }
  .kiwi-modal-head { padding: 24px 28px 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .kiwi-modal-head h3 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.025em; }
  .kiwi-modal-head p { margin: 5px 0 0; font-size: 14px; color: var(--n-500); line-height: 1.45; }
  .kiwi-modal-head .tag { display: inline-block; margin-bottom: 10px; padding: 4px 10px; background: var(--mint-soft); color: var(--riad); border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
  .kiwi-modal-body { padding: 0 28px 24px; overscroll-behavior: contain; }
  .kiwi-modal-foot { padding: 16px 28px; border-top: 1px solid var(--n-200); display: flex; justify-content: flex-end; gap: 10px; background: color-mix(in srgb, var(--surface) 50%, transparent); border-radius: 0 0 22px 22px; }
  .kiwi-modal-close { position: absolute; top: 18px; right: 18px; width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--n-200); background: var(--surface); color: var(--n-500); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 150ms, opacity 150ms, background-color 150ms, border-color 150ms, color 150ms, box-shadow 150ms; z-index: 2; }
  .kiwi-modal-close:hover { color: var(--ink); border-color: var(--n-400); }

  /* Drawer */
  .kiwi-drawer-backdrop { position: fixed; inset: 0; background: rgba(10,15,13,0.45); backdrop-filter: blur(4px); z-index: 9990; opacity: 0; transition: opacity 220ms; }
  .kiwi-drawer-backdrop.in { opacity: 1; }
  .kiwi-drawer { position: fixed; top: 0; right: 0; bottom: 0; background: var(--paper); width: 420px; max-width: calc(100vw - 40px); transform: translateX(100%); transition: transform 320ms cubic-bezier(0.32,0.72,0,1); box-shadow: -20px 0 40px -10px rgba(10,15,13,0.2); display: flex; flex-direction: column; font-family: var(--sans); color: var(--ink); }
  .kiwi-drawer-backdrop.in .kiwi-drawer { transform: translateX(0); }
  .kiwi-drawer-head { padding: 20px 24px; border-bottom: 1px solid var(--n-200); display: flex; justify-content: space-between; align-items: center; }
  .kiwi-drawer-head h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
  .kiwi-drawer-head p { margin: 3px 0 0; font-size: 12.5px; color: var(--n-500); }
  .kiwi-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    overscroll-behavior: contain;
    /* Isolate this scroll container\'s painting so its scroll doesn\'t
     * invalidate the backdrop-filter sampling of the body behind it. */
    contain: layout style paint;
    -webkit-overflow-scrolling: touch;
  }
  /* Scroll-lock the underlying page while any drawer/modal is open.
   * Counter-tracked (window.__kiwiScrollLocks) so nested layers don\'t
   * unlock prematurely. We also pause the body\'s ambient-blob drift
   * animation · without this, the drawer\'s backdrop-filter:blur has
   * to re-sample a moving target every frame, which Safari hates.
   *
   * IMPORTANT: lock ONLY <html> (the document scroller). Putting
   * overflow:hidden on <body> turns <body> into a scroll container,
   * which captures the position:sticky desktop sidebar · it then
   * re-anchors to body\'s unscrolled scrollport and renders far up the
   * page (only its lower portion stays visible). Locking the html
   * scroller alone freezes the page without breaking sticky children. */
  html.kiwi-locked { overflow: hidden; }
  html.kiwi-locked body { animation-play-state: paused; }
  .kiwi-drawer-foot { padding: 16px 24px; border-top: 1px solid var(--n-200); }
  .kiwi-drawer-close { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--n-200); background: var(--surface); color: var(--n-500); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 150ms, opacity 150ms, background-color 150ms, border-color 150ms, color 150ms, box-shadow 150ms; }
  .kiwi-drawer-close:hover { color: var(--ink); border-color: var(--n-400); }

  /* ── Fullpage drawer · used for Tables/Menu/KDS/Stock ───────────────────
   * Backdrop covers viewport, inner panel fills it, slides up + fades in.
   * Head and foot stay full-bleed (sticky head); body is centered with a
   * max-width so content breathes on wide monitors but never gets lost on
   * 1280-wide displays.  Slightly slower easing than the side drawer so the
   * "this is a whole page, not a panel" feeling reads. */
  .kiwi-drawer-backdrop.kiwi-fullpage { background: rgba(10,15,13,0.65); backdrop-filter: blur(8px); }
  .kiwi-fullpage .kiwi-drawer {
    position: fixed; inset: 0;
    width: 100vw; max-width: 100vw;
    height: 100vh; max-height: 100vh;
    transform: translateY(28px) scale(0.985);
    opacity: 0;
    transition: transform 420ms cubic-bezier(0.32,0.72,0,1), opacity 300ms ease;
    border-radius: 0;
    box-shadow: none;
    background: var(--paper);
  }
  .kiwi-fullpage.in .kiwi-drawer { transform: translateY(0) scale(1); opacity: 1; }
  .kiwi-fullpage .kiwi-drawer-head {
    padding: 22px max(48px, calc((100vw - 1480px) / 2 + 48px));
    position: sticky; top: 0; z-index: 5;
    background: var(--paper);
    border-bottom: 1px solid var(--n-200);
  }
  .kiwi-fullpage .kiwi-drawer-head h3 { font-size: 22px; letter-spacing: -0.025em; }
  .kiwi-fullpage .kiwi-drawer-head p  { font-size: 13px; margin-top: 4px; }
  .kiwi-fullpage .kiwi-drawer-body {
    padding: 28px max(48px, calc((100vw - 1480px) / 2 + 48px)) 40px;
  }
  .kiwi-fullpage .kiwi-drawer-foot {
    padding: 16px max(48px, calc((100vw - 1480px) / 2 + 48px));
    background: var(--paper);
    box-shadow: 0 -6px 18px -10px rgba(10,15,13,0.12);
  }
  .kiwi-fullpage .kiwi-drawer-close {
    width: 38px; height: 38px; border-radius: 12px;
  }
  /* Small-viewport guard: tighter gutters under 900 px wide */
  @media (max-width: 900px) {
    .kiwi-fullpage .kiwi-drawer-head,
    .kiwi-fullpage .kiwi-drawer-body,
    .kiwi-fullpage .kiwi-drawer-foot { padding-left: 20px; padding-right: 20px; }
  }

  /* Command palette */
  .kp { position: fixed; top: 16vh; left: 50%; transform: translateX(-50%) scale(0.97); width: min(600px, calc(100vw - 40px)); background: var(--paper); border-radius: 16px; z-index: 9995; box-shadow: 0 40px 80px -20px rgba(10,15,13,0.35), 0 4px 8px rgba(10,15,13,0.05); opacity: 0; transition: opacity 200ms, transform 200ms cubic-bezier(0.32,0.72,0,1); overflow: hidden; }
  .kp.in { opacity: 1; transform: translateX(-50%) scale(1); }
  .kp-head { padding: 16px 20px; border-bottom: 1px solid var(--n-200); display: flex; align-items: center; gap: 12px; }
  .kp-head input { flex: 1; border: 0; outline: 0; background: none; font-size: 16px; color: var(--ink); font-family: var(--sans); letter-spacing: -0.005em; }
  .kp-head input::placeholder { color: var(--n-500); }
  .kp-list { padding: 8px 0; max-height: 420px; overflow-y: auto; }
  .kp-head .kp-esc { font-family: var(--mono); font-size: 10.5px; background: var(--n-100); padding: 3px 8px; border-radius: 5px; color: var(--n-500); border: 1px solid var(--n-200); flex-shrink: 0; }
  .kp-sect { padding: 12px 20px 6px; font-size: 10.5px; font-weight: 500; color: var(--n-500); letter-spacing: 0.1em; text-transform: uppercase; font-family: var(--mono);
             display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .kp-sect .n { text-transform: none; letter-spacing: 0; color: var(--n-500); }
  .kp-item { margin: 1px 8px; padding: 10px 12px; border-radius: 10px; display: flex; align-items: center; gap: 14px; cursor: pointer; font-size: 13.5px; color: var(--ink); transition: background 160ms cubic-bezier(0.32,0.72,0,1); }
  .kp-item:hover, .kp-item.active { background: var(--mint-soft); }
  .kp-item:active { transform: scale(0.99); }
  .kp-item .kpi-ic { width: 28px; height: 28px; border-radius: 8px; background: var(--surface); display: flex; align-items: center; justify-content: center; color: var(--atlas); border: 1px solid var(--n-200); flex-shrink: 0; font-size: 13px; }
  /* L'icône vient de la barre latérale : elle y est peinte en 18px, ici en 15px. */
  .kp-item .kpi-ic svg { width: 15px; height: 15px; }
  .kp-item .kpi-ic.is-initial { font-weight: 600; font-size: 12px; letter-spacing: 0.01em; }
  .kp-item .kpi-mid { flex: 1; min-width: 0; }
  .kp-item .kpi-t { font-weight: 500; letter-spacing: -0.005em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kp-item .kpi-s { color: var(--n-500); font-size: 12.5px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Le morceau qui vient d'être tapé. Pas de surligneur jaune : la couleur de
     marque suffit, et elle survit au thème sombre. */
  .kp-item mark { background: none; color: var(--atlas); font-weight: 600; }
  .kp-item .kpi-amt { font-family: var(--mono); font-size: 12.5px; color: var(--ink); font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .kp-item .kpi-k { font-family: var(--mono); font-size: 10.5px; color: var(--n-500); background: var(--n-100); padding: 2px 6px; border-radius: 5px; border: 1px solid var(--n-200); }
  .kp-empty { padding: 34px 20px 32px; text-align: center; }
  .kp-empty-t { font-size: 14px; font-weight: 500; color: var(--ink); }
  .kp-empty-s { margin-top: 6px; font-size: 12.5px; color: var(--n-500); max-width: 340px; margin-inline: auto; line-height: 1.5; }
  .kp-foot { padding: 10px 20px; border-top: 1px solid var(--n-200); display: flex; justify-content: space-between; align-items: center; background: var(--surface); font-size: 11px; color: var(--n-500); }
  .kp-foot .kp-count { color: var(--n-500); font-variant-numeric: tabular-nums; }
  /* « ⌘ » n'existe pas dans JetBrains Mono : sans repli système le navigateur
     dessine un tofu, et le raccourci se lit comme une croix. */
  .kp-foot .kp-sc { font-family: var(--mono), -apple-system, BlinkMacSystemFont, "Segoe UI Symbol", sans-serif; color: var(--n-500); }
  .kp-foot span { display: inline-flex; align-items: center; gap: 6px; }
  .kp-foot kbd { font-family: var(--mono); background: var(--n-100); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--n-200); font-size: 10px; }

  /* Notification item in drawer */
  .notif { display: flex; gap: 12px; padding: 14px 4px; border-bottom: 1px solid var(--n-200); align-items: flex-start; cursor: pointer; transition: background 120ms; border-radius: 8px; }
  .notif:hover { background: var(--paper-soft); }
  .notif.unread::before { content: ""; width: 6px; height: 6px; background: var(--atlas); border-radius: 50%; margin-top: 10px; flex-shrink: 0; }
  .notif:not(.unread)::before { content: ""; width: 6px; height: 6px; margin-top: 10px; flex-shrink: 0; }
  .notif .n-ico { width: 34px; height: 34px; border-radius: 10px; background: var(--paper-soft); color: var(--atlas); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .notif .n-body { flex: 1; min-width: 0; }
  .notif .n-title { font-size: 13.5px; font-weight: 500; letter-spacing: -0.005em; }
  .notif .n-desc { font-size: 12.5px; color: var(--n-500); margin-top: 3px; line-height: 1.45; }
  .notif .n-time { font-size: 11px; color: var(--n-500); font-family: var(--mono); margin-top: 6px; }

  /* Form input */
  .kf-label { display: block; font-size: 12px; font-weight: 500; color: var(--n-600); margin-bottom: 6px; letter-spacing: 0.02em; }
  .kf-input { width: 100%; background: var(--surface); border: 1px solid var(--n-200); border-radius: 10px; padding: 11px 14px; font-size: 14px; color: var(--ink); font-family: var(--sans); outline: 0; transition: border-color 150ms, box-shadow 150ms; }
  .kf-input:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.12); }
  .kf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .kf-group { margin-bottom: 14px; }
  .kf-help { font-size: 11.5px; color: var(--n-500); margin-top: 5px; line-height: 1.4; }

  /* Dropdown menu */
  .kiwi-menu { position: fixed; background: var(--surface); border: 1px solid var(--n-200); border-radius: 12px; box-shadow: 0 20px 40px -16px rgba(10,15,13,0.24); padding: 6px; min-width: 220px; z-index: 9990; font-family: var(--sans); opacity: 0; transform: translateY(-6px) scale(0.98); transform-origin: top; transition: opacity 180ms cubic-bezier(0.32,0.72,0,1), transform 220ms cubic-bezier(0.32,0.72,0,1); }
  .kiwi-menu-item:active { transform: scale(0.99); }
  .kiwi-drawer-body, .kp-list, .kiwi-modal { scrollbar-width: thin; scrollbar-color: var(--n-200) transparent; }
  .kiwi-drawer-body::-webkit-scrollbar, .kp-list::-webkit-scrollbar, .kiwi-modal::-webkit-scrollbar { width: 8px; }
  .kiwi-drawer-body::-webkit-scrollbar-thumb, .kp-list::-webkit-scrollbar-thumb, .kiwi-modal::-webkit-scrollbar-thumb { background: var(--n-200); border-radius: 8px; }
  .kb:active, .kiwi-modal-close:active, .kiwi-drawer-close:active { transform: scale(0.96); }
  .notif:active, .wiz-choice:active, .kset-row:active { transform: scale(0.99); }
  .kiwi-menu.in { opacity: 1; transform: translateY(0); }
  .kiwi-menu-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-size: 13.5px; color: var(--ink); border-radius: 8px; cursor: pointer; transition: background 100ms; }
  .kiwi-menu-item:hover { background: var(--paper-soft); }
  .kiwi-menu-item .m-ico { width: 18px; height: 18px; color: var(--n-500); }
  .kiwi-menu-item.active { background: var(--mint-soft); color: var(--atlas); }
  .kiwi-menu-item.danger { color: var(--danger); }
  .kiwi-menu-sep { height: 1px; background: var(--n-200); margin: 6px -6px; }
  .kiwi-menu-head { padding: 8px 12px; font-size: 10.5px; color: var(--n-500); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; }

  /* Confetti */
  .kiwi-confetti { position: fixed; inset: 0; pointer-events: none; z-index: 10000; overflow: hidden; }
  .kiwi-confetti span { position: absolute; width: 8px; height: 12px; border-radius: 2px; animation: kiwi-confetti-fall 2s cubic-bezier(0.35,0.04,0.63,0.72) forwards; }
  @keyframes kiwi-confetti-fall {
    0% { transform: translateY(-20vh) rotate(0deg); opacity: 1; }
    100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
  }

  /* Signup wizard */
  .wiz-steps { display: flex; gap: 8px; margin-bottom: 20px; }
  .wiz-step { flex: 1; height: 4px; background: var(--n-200); border-radius: 2px; transition: background 220ms; }
  .wiz-step.done { background: var(--atlas); }
  .wiz-step.active { background: var(--atlas); }
  .wiz-choice { border: 1px solid var(--n-200); border-radius: 14px; padding: 18px 18px; cursor: pointer; transition: transform 160ms, opacity 160ms, background-color 160ms, border-color 160ms, color 160ms, box-shadow 160ms; display: flex; gap: 14px; align-items: flex-start; }
  .wiz-choice:hover { border-color: var(--atlas); background: var(--surface); }
  .wiz-choice.selected { border-color: var(--atlas); background: var(--mint-soft); }
  .wiz-choice .wc-ic { width: 40px; height: 40px; border-radius: 10px; background: var(--paper-soft); color: var(--atlas); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .wiz-choice .wc-t { font-weight: 600; font-size: 14.5px; letter-spacing: -0.01em; }
  .wiz-choice .wc-d { font-size: 13px; color: var(--n-500); margin-top: 3px; line-height: 1.45; }
  .wiz-choice.selected .wc-ic { background: var(--atlas); color: var(--mint); }

  /* Transaction detail */
  .tx-detail-hero { background: var(--paper-soft); border-radius: 14px; padding: 22px; margin-bottom: 20px; }
  .tx-detail-hero .amt { font-size: 40px; font-weight: 600; letter-spacing: -0.035em; line-height: 1; font-feature-settings: "tnum" 1; }
  .tx-detail-hero .status { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--atlas); }
  .tx-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; font-size: 13.5px; }
  .tx-detail-grid dt { color: var(--n-500); padding: 8px 0; border-bottom: 1px solid var(--n-200); }
  .tx-detail-grid dd { margin: 0; padding: 8px 0; border-bottom: 1px solid var(--n-200); text-align: end; font-family: var(--mono); font-weight: 500; font-feature-settings: "tnum" 1; }
  .tx-timeline { margin-top: 24px; position: relative; padding-left: 24px; }
  .tx-timeline::before { content: ""; position: absolute; left: 7px; top: 4px; bottom: 4px; width: 2px; background: var(--n-200); }
  .tx-timeline-item { position: relative; padding: 8px 0 12px; font-size: 13px; }
  .tx-timeline-item::before { content: ""; position: absolute; left: -23px; top: 13px; width: 12px; height: 12px; border-radius: 50%; background: var(--atlas); border: 2px solid var(--paper); }
  .tx-timeline-item.last::before { background: var(--n-300); }
  .tx-timeline-item .t { font-family: var(--mono); font-size: 11px; color: var(--n-500); margin-bottom: 3px; }
  .tx-timeline-item .n { font-weight: 500; letter-spacing: -0.005em; }
  .tx-timeline-item .d { font-size: 12.5px; color: var(--n-500); margin-top: 2px; }

  /* ─── Order detail drawer · opened from the live feed ─── */
  .ord-hero { background: linear-gradient(135deg, var(--paper-soft) 0%, #EFEAE0 120%); border-radius: 14px; padding: 20px 22px; margin-bottom: 20px; position: relative; overflow: hidden; }
  .ord-hero::after { content: ""; position: absolute; right: -40px; top: -40px; width: 140px; height: 140px; background: radial-gradient(circle, rgba(11,110,79,0.10) 0%, transparent 65%); pointer-events: none; }
  .ord-hero .row1 { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .ord-hero .ticket { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; color: var(--n-500); text-transform: uppercase; }
  .ord-hero .when { font-family: var(--mono); font-size: 11px; color: var(--n-500); }
  .ord-hero .amt { margin-top: 10px; font-size: 38px; font-weight: 600; letter-spacing: -0.035em; line-height: 1; font-feature-settings: "tnum" 1; }
  .ord-hero .amt .cur { font-size: 16px; font-weight: 500; color: var(--n-500); margin-left: 8px; letter-spacing: 0.04em; }
  .ord-hero .status { margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; color: var(--atlas); background: rgba(125,242,176,0.20); padding: 4px 10px; border-radius: 999px; }
  .ord-hero .status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--atlas); }

  .ord-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 1px solid var(--n-200); border-radius: 12px; overflow: hidden; margin-bottom: 22px; }
  .ord-stat { padding: 12px 14px; border-right: 1px solid var(--n-200); background: var(--surface); }
  .ord-stat:last-child { border-right: 0; }
  .ord-stat .lbl { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); font-family: var(--mono); }
  .ord-stat .val { font-size: 14.5px; font-weight: 600; margin-top: 4px; letter-spacing: -0.01em; color: var(--ink); }
  .ord-stat .sub { font-size: 11px; color: var(--n-500); margin-top: 1px; }

  .ord-section-lbl { font-size: 10.5px; letter-spacing: 0.10em; color: var(--n-500); font-family: var(--mono); text-transform: uppercase; margin-bottom: 10px; }

  .ord-items { display: flex; flex-direction: column; gap: 1px; background: var(--n-200); border-radius: 12px; overflow: hidden; margin-bottom: 22px; }
  .ord-item { background: var(--surface); display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 12px; padding: 12px 14px; }
  .ord-item .qty { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--atlas); background: var(--mint-soft, rgba(125,242,176,0.25)); border-radius: 6px; padding: 3px 6px; text-align: center; min-width: 26px; }
  .ord-item .nm { font-size: 13.5px; font-weight: 500; color: var(--ink); }
  .ord-item .unit { font-size: 11.5px; color: var(--n-500); font-family: var(--mono); margin-top: 2px; }
  .ord-item .ln { font-family: var(--mono); font-weight: 500; font-feature-settings: "tnum" 1; font-size: 13px; color: var(--ink); }

  .ord-totals { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; padding: 14px 16px; background: var(--paper-soft); border-radius: 12px; font-size: 13px; margin-bottom: 22px; }
  .ord-totals .k { color: var(--n-500); }
  .ord-totals .v { font-family: var(--mono); font-feature-settings: "tnum" 1; text-align: end; font-weight: 500; }
  .ord-totals .total { padding-top: 10px; border-top: 1px solid var(--n-200); font-weight: 600; font-size: 14.5px; color: var(--ink); }

  .ord-pay { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; padding: 14px; border: 1px solid var(--n-200); border-radius: 12px; margin-bottom: 22px; background: var(--surface); }
  .ord-pay .ci { width: 44px; height: 28px; border-radius: 5px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .ord-pay .ci svg { display: block; max-width: 100%; max-height: 100%; }
  .ord-pay .ci img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
  .ord-pay .ci.visa { background: transparent; border: 0; padding: 0; }
  .ord-pay .ci.mc { background: var(--surface); border: 1px solid var(--n-200); padding: 2px; }
  .ord-pay .ci.tap { background: var(--atlas); color: var(--mint); }
  .ord-pay .ci.tap svg { width: 18px; height: 18px; }
  .ord-pay .ci.qr { background: var(--surface); border: 1px solid var(--n-200); padding: 2px; }
  .ord-pay .ci.cash { background: var(--surface); border: 1px solid var(--n-200); padding: 2px; }
  .ord-pay .pay-prim { font-weight: 500; font-size: 13.5px; }
  .ord-pay .pay-sub { font-size: 11.5px; color: var(--n-500); margin-top: 1px; display: flex; align-items: center; gap: 6px; }
  .ord-pay .pay-flag { display: inline-block; width: 12px; height: 9px; border-radius: 1px; }
  .ord-pay .pay-flag.ma { background: linear-gradient(#C1272D 50%, #006233 50%); }
  .ord-pay .pay-flag.fr { background: linear-gradient(to right, #002395 33%, #FFF 33%, #FFF 66%, #ED2939 66%); }
  .ord-pay .pay-flag.es { background: linear-gradient(#C60B1E 30%, #FFC400 30%, #FFC400 70%, #C60B1E 70%); }
  .ord-pay .pay-amt { font-family: var(--mono); font-weight: 600; font-size: 14px; font-feature-settings: "tnum" 1; }

  /* Button base for modals */
  .kb { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; font-family: var(--sans); font-weight: 500; font-size: 14px; letter-spacing: -0.005em; cursor: pointer; transition: transform 150ms, opacity 150ms, background-color 150ms, border-color 150ms, color 150ms, box-shadow 150ms; border: 1px solid transparent; }
  .kb.primary { background: var(--ink); color: var(--paper); }
  .kb.primary:hover { background: var(--atlas); }
  .kb.ghost { background: var(--surface); color: var(--ink); border-color: var(--n-200); }
  .kb.ghost:hover { border-color: var(--ink); }
  .kb.atlas { background: var(--atlas); color: var(--paper); }
  .kb.atlas:hover { background: var(--atlas-700); }
  .kb.danger { background: var(--danger); color: #fff; }

  /* Loading spinner */
  .kiwi-spinner { width: 18px; height: 18px; border: 2px solid rgba(11,110,79,0.2); border-top-color: var(--atlas); border-radius: 50%; animation: kiwi-spin 600ms linear infinite; display: inline-block; }
  @keyframes kiwi-spin { to { transform: rotate(360deg); } }

  /* AI drawer-ready for dynamic content */
  .ai-msg-user { background: var(--atlas); color: var(--paper); border-radius: 12px 12px 2px 12px; padding: 10px 14px; font-size: 13px; margin-bottom: 10px; margin-left: 32px; }
  .ai-msg-typing { background: rgba(255,255,255,0.06); border-radius: 12px; padding: 12px 14px; font-size: 13px; color: #d6dcd8; margin-bottom: 10px; display: inline-flex; gap: 5px; }
  .ai-msg-typing i { width: 6px; height: 6px; background: var(--mint); border-radius: 50%; animation: typing-bounce 1.2s infinite; }
  .ai-msg-typing i:nth-child(2) { animation-delay: 0.15s; }
  .ai-msg-typing i:nth-child(3) { animation-delay: 0.3s; }
  @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.6; } 30% { transform: translateY(-5px); opacity: 1; } }
  `;

  /* ─────────── BOOTSTRAP STYLES + CONTAINERS ─────────── */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  function ensureToasts() {
    let c = document.querySelector('.kiwi-toasts');
    if (!c) {
      c = document.createElement('div');
      c.className = 'kiwi-toasts';
      /* Live region — screen readers announce toasts instead of missing them. */
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      c.setAttribute('aria-atomic', 'true');
      document.body.appendChild(c);
    }
    return c;
  }

  /* ─────────── SVG ICONS ─────────── */
  const I = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l5 5L20 7"/></svg>',
    info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    danger: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
  };

  /* ═══════════════════════ TOAST ═══════════════════════ */
  /* Overlay count at the start of every click — set in the capture phase so
   * it's recorded before any handler runs. toast() compares against it. */
  const OVERLAY_SEL = '.kiwi-drawer-backdrop, .kiwi-backdrop, .kp';
  document.addEventListener('click', () => {
    window.__kiwiOverlayBaseline = document.querySelectorAll(OVERLAY_SEL).length;
    window.__kiwiClickTs = performance.now();
  }, true);

  /* Toast policy (demo dashboard):
   *  · Only ONE toast on screen at a time — a new one replaces the old.
   *  · A toast is SUPPRESSED when the click that triggered it also opened a
   *    drawer/modal — the button visibly worked, so the toast is just noise.
   *    Inert/stub buttons open nothing, so they still get their one toast.
   *  · Pass { force: true } for a toast that must always show. */
  function toast(title, {desc = '', type = 'success', duration = 3600, action = null, force = false} = {}) {
    const baseline = window.__kiwiOverlayBaseline || 0;
    const fromClick = (performance.now() - (window.__kiwiClickTs || -1e9)) < 1000;
    // Defer a frame so any drawer/modal this click opened is already in the DOM.
    requestAnimationFrame(() => {
      if (fromClick && !force &&
          document.querySelectorAll(OVERLAY_SEL).length > baseline) return;
      const c = ensureToasts();
      c.querySelectorAll('.kiwi-toast').forEach(el => el.remove());  // max one
      const t = document.createElement('div');
      const s = GENERAL_STR[kiwiLang()] || GENERAL_STR.fr;
      duration = Math.max(2200, Number(duration) || 3600);
      t.className = `kiwi-toast ${type}`;
      t.style.setProperty('--toast-duration', duration + 'ms');
      if (type === 'danger') t.setAttribute('role', 'alert');
      t['inner' + 'HTML'] = `
        <div class="ti">${type === 'success' ? I.check : (I[type] || I.info)}</div>
        <div class="tb">
          <div class="tm">${escape(title)}</div>
          ${desc ? `<div class="ts">${escape(desc)}</div>` : ''}
          ${action ? `<button class="ta">${escape(action.label)}</button>` : ''}
        </div>
        <button class="tx" aria-label="${s.close}">×</button>
        <div class="tp" aria-hidden="true"></div>
      `;
      c.appendChild(t);
      requestAnimationFrame(() => t.classList.add('in'));
      const dismiss = () => { t.classList.remove('in'); setTimeout(() => t.remove(), 280); };
      let remaining = duration, started = performance.now(), timer = null;
      const schedule = () => { started = performance.now(); timer = setTimeout(dismiss, remaining); };
      const pause = () => { if (!timer) return; clearTimeout(timer); timer = null; remaining = Math.max(0, remaining - (performance.now() - started)); t.classList.add('is-paused'); };
      const resume = () => { if (timer || remaining <= 0) return; t.classList.remove('is-paused'); schedule(); };
      schedule();
      t.addEventListener('mouseenter', pause);
      t.addEventListener('mouseleave', resume);
      t.addEventListener('focusin', pause);
      t.addEventListener('focusout', resume);
      t.querySelector('.tx').onclick = () => { clearTimeout(timer); dismiss(); };
      if (action) t.querySelector('.ta').onclick = () => { clearTimeout(timer); dismiss(); action.onClick?.(); };
      try { window.dispatchEvent(new CustomEvent('kiwi:toast', { detail: { title: String(title || ''), desc: String(desc || ''), type } })); } catch (_) {}
    });
  }

  /* Visible state on the button itself. Toasts confirm the result; this closes
     the immediate 100–300 ms gap after a click, when users otherwise click a
     second time because nothing appears to have happened. */
  function buttonFeedback(button, { pending = 'Enregistrement…', done = 'Enregistré', duration = 1500 } = {}) {
    if (!button) return { success() {}, error() {} };
    const original = button.innerHTML;
    const wasDisabled = button.disabled;
    let restoreTimer = null;
    button.disabled = true;
    button.classList.add('is-feedback-pending');
    button.replaceChildren();
    const spin = document.createElement('span'); spin.className = 'kiwi-button-spinner'; spin.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.textContent = pending;
    button.append(spin, label);
    const restore = () => {
      clearTimeout(restoreTimer);
      button.innerHTML = original;
      button.disabled = wasDisabled;
      button.classList.remove('is-feedback-pending', 'is-feedback-done');
    };
    return {
      success(text = done) {
        button.classList.remove('is-feedback-pending');
        button.classList.add('is-feedback-done');
        button.replaceChildren();
        const check = document.createElement('span'); check.setAttribute('aria-hidden', 'true'); check.textContent = '✓';
        const doneLabel = document.createElement('span'); doneLabel.textContent = text;
        button.append(check, doneLabel);
        restoreTimer = setTimeout(restore, duration);
      },
      error() { restore(); },
    };
  }

  /* ═══════════════════════ MODAL ═══════════════════════ */
  function modal({title = '', tag = '', desc = '', body = '', foot = '', width = 540}) {
    const back = document.createElement('div');
    const s = GENERAL_STR[kiwiLang()] || GENERAL_STR.fr;
    const headId = 'kw-mdl-' + Math.random().toString(36).slice(2, 8);
    back.className = 'kiwi-backdrop';
    back.innerHTML = `
      <div class="kiwi-modal" style="max-width:${width}px;" role="dialog" aria-modal="true" aria-labelledby="${headId}">
        <button class="kiwi-modal-close" aria-label="${s.close}">${I.close}</button>
        <div class="kiwi-modal-head">
          <div>
            ${tag ? `<div class="tag">${escape(tag)}</div>` : ''}
            <h3 id="${headId}">${escape(title)}</h3>
            ${desc ? `<p>${desc}</p>` : ''}
          </div>
        </div>
        <div class="kiwi-modal-body">${body}</div>
        ${foot ? `<div class="kiwi-modal-foot">${foot}</div>` : ''}
      </div>
    `;
    document.body.appendChild(back);
    lockPageScroll();
    requestAnimationFrame(() => back.classList.add('in'));
    const releaseFocus = trapFocus(back.querySelector('.kiwi-modal'));
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      back.classList.remove('in');
      setTimeout(() => back.remove(), 280);
      document.removeEventListener('keydown', esc);
      releaseFocus();
      unlockPageScroll();
    };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('.kiwi-modal-close').onclick = close;
    return { close, el: back };
  }

  /* ─── Focus trap for overlays — keyboard focus stays inside the open
   * drawer/modal, and returns to the trigger element on close. ─── */
  function trapFocus(panel) {
    if (!panel) return () => {};
    const prev = document.activeElement;
    panel.setAttribute('tabindex', '-1');
    const SEL = 'a[href],button:not([disabled]),input:not([disabled]),' +
                'select:not([disabled]),textarea:not([disabled]),' +
                '[tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.prototype.slice.call(panel.querySelectorAll(SEL))
        .filter((el) => el.offsetWidth || el.offsetHeight || el === document.activeElement);
    requestAnimationFrame(() => { (focusables()[0] || panel).focus(); });
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    panel.addEventListener('keydown', onKey);
    return () => {
      panel.removeEventListener('keydown', onKey);
      try { prev && prev.focus && prev.focus(); } catch (_) {}
    };
  }

  /* ─── Scroll-lock helpers (counter-tracked for nested drawers/modals) ─── */
  function lockPageScroll() {
    const n = (window.__kiwiScrollLocks || 0) + 1;
    window.__kiwiScrollLocks = n;
    if (n === 1) document.documentElement.classList.add('kiwi-locked');
  }
  function unlockPageScroll() {
    const n = Math.max(0, (window.__kiwiScrollLocks || 0) - 1);
    window.__kiwiScrollLocks = n;
    if (n === 0) document.documentElement.classList.remove('kiwi-locked');
  }

  /* ═══════════════════════ DRAWER ═══════════════════════
   * Standard mode: 420-px-wide right-side drawer slides in.
   * Fullpage mode (`fullpage: true`): full-viewport overlay that
   *   slides up + fades in. Used for the 4 restaurant features
   *   (Tables, Menu, KDS, Stock) — they hold so much content
   *   that the 1080-px drawer was choking the layout.
   *   Both modes share the same DOM (.kiwi-drawer-*), so existing
   *   content code is untouched — only the outer .kiwi-fullpage
   *   class toggles a different layout via CSS.
   * ────────────────────────────────────────────────────── */
  function drawer({title = '', subtitle = '', body = '', foot = '', width = 420, fullpage = false}) {
    // Close any drawer already open so switching between drawers always works
    // in a single click and the scroll-lock counter stays balanced.
    document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => {
      if (b.__kiwiClose) b.__kiwiClose();
      else b.remove();
    });
    const back = document.createElement('div');
    const s = GENERAL_STR[kiwiLang()] || GENERAL_STR.fr;
    back.className = 'kiwi-drawer-backdrop' + (fullpage ? ' kiwi-fullpage' : '');
    const headId = 'kw-drw-' + Math.random().toString(36).slice(2, 8);
    back.innerHTML = `
      <div class="kiwi-drawer"${fullpage ? '' : ` style="width:${width}px;"`} role="dialog" aria-modal="true" aria-labelledby="${headId}">
        <div class="kiwi-drawer-head">
          <div>
            <h3 id="${headId}">${escape(title)}</h3>
            ${subtitle ? `<p>${escape(subtitle)}</p>` : ''}
          </div>
          <button class="kiwi-drawer-close" aria-label="${s.close}">${I.close}</button>
        </div>
        <div class="kiwi-drawer-body">${body}</div>
        ${foot ? `<div class="kiwi-drawer-foot">${foot}</div>` : ''}
      </div>
    `;
    document.body.appendChild(back);
    lockPageScroll();
    requestAnimationFrame(() => back.classList.add('in'));
    const releaseFocus = trapFocus(back.querySelector('.kiwi-drawer'));
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      back.classList.remove('in');
      setTimeout(() => back.remove(), 280);
      document.removeEventListener('keydown', esc);
      releaseFocus();
      unlockPageScroll();
      /* Once the last drawer is gone, re-sync the sidebar highlight from
         Kiwi.activePage — the single source of truth for "which full-page
         view is currently behind the drawer". If the user opened a drawer
         from Accueil, activePage is 'accueil' and the highlight goes home.
         If they were already on a full-page feature (Plan de Salle, Menu,
         Stock, Équipe, Payroll…), the highlight stays on that feature.
         The delay (> the 280ms removal) lets a drawer-to-drawer switch
         append its replacement first — so switching never flickers. */
      setTimeout(() => {
        if (document.querySelector('.kiwi-drawer-backdrop')) return;
        if (window.Kiwi && typeof window.Kiwi.syncSidebar === 'function') {
          window.Kiwi.syncSidebar();
        }
      }, 320);
    };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('[data-dismiss]')) close();
    });
    back.querySelector('.kiwi-drawer-close').onclick = close;
    back.__kiwiClose = close;   // lets a later drawer() call close this one cleanly
    return { close, el: back };
  }

  /* ═══════════════════════ MENU (dropdown near anchor) ═══════════════════════ */
  function menu(anchor, items) {
    const r = anchor.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'kiwi-menu';
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-orientation', 'vertical');
    m.innerHTML = items.map(it => it.head ? `<div class="kiwi-menu-head">${escape(it.head)}</div>` : it.sep ? `<div class="kiwi-menu-sep"></div>` : `<div class="kiwi-menu-item ${it.danger?'danger':''} ${it.active?'active':''}" data-idx="${items.indexOf(it)}">${it.icon || ''}<span>${escape(it.label)}</span></div>`).join('');
    document.body.appendChild(m);
    /* ARIA menu semantics + keyboard focusability (items are divs). */
    m.querySelectorAll('.kiwi-menu-item').forEach((el) => {
      el.setAttribute('role', 'menuitem');
      el.setAttribute('tabindex', '-1');
    });
    m.querySelectorAll('.kiwi-menu-sep').forEach((el) => el.setAttribute('role', 'separator'));
    /* The menu is position:fixed (see CSS) so it\'s placed in viewport
     * coordinates straight from getBoundingClientRect — no scroll math.
     * This keeps it anchored correctly even though the sidebar is sticky. */
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const mh = m.offsetHeight;
    /* Open downward by default, but flip above the anchor when there isn\'t
     * room below — e.g. the sidebar profile menu, anchored near the bottom. */
    const flipUp = vh && (r.bottom + mh + 12 > vh) && (r.top - mh - 12 > 0);
    m.style.top = flipUp ? `${r.top - mh - 6}px` : `${r.bottom + 6}px`;
    /* Horizontal: clamp so the menu never spills off the viewport edges. */
    let mLeft = r.left;
    if (vw && mLeft + m.offsetWidth > vw - 8) mLeft = vw - 8 - m.offsetWidth;
    if (mLeft < 8) mLeft = 8;
    m.style.left = `${mLeft}px`;
    requestAnimationFrame(() => m.classList.add('in'));
    const close = () => {
      m.classList.remove('in'); setTimeout(() => m.remove(), 180);
      document.removeEventListener('click', outside, true);
      /* Return keyboard focus to the trigger — unless an item's onClick already
       * moved it into a freshly-opened overlay (its focus trap then wins). */
      try { if (anchor && document.contains(anchor) && anchor.focus) anchor.focus(); } catch (_) {}
    };
    const outside = (e) => { if (!m.contains(e.target) && e.target !== anchor) close(); };
    setTimeout(() => document.addEventListener('click', outside, true), 10);
    const menuItems = () => Array.prototype.slice.call(m.querySelectorAll('.kiwi-menu-item'));
    const focusAt = (i) => { const f = menuItems(); if (f.length) f[((i % f.length) + f.length) % f.length].focus(); };
    m.addEventListener('keydown', (e) => {
      const f = menuItems(); const cur = f.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(cur + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(cur - 1); }
      else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
      else if (e.key === 'End') { e.preventDefault(); focusAt(f.length - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement && document.activeElement.click && document.activeElement.click(); }
      else if (e.key === 'Tab') { close(); }
    });
    requestAnimationFrame(() => focusAt(0));
    m.querySelectorAll('.kiwi-menu-item').forEach(el => {
      el.onclick = () => {
        const it = items[+el.dataset.idx];
        close();
        it.onClick?.();
      };
    });
    return close;
  }

  /* ═══════════════════════ CONFETTI ═══════════════════════ */
  function confetti() {
    const c = document.createElement('div');
    c.className = 'kiwi-confetti';
    const colors = ['#0B6E4F', '#7DF2B0', '#053B2C', '#C9F6DC', '#D99A2B'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('span');
      s.style.left = Math.random() * 100 + 'vw';
      s.style.top = '-5vh';
      s.style.background = colors[Math.floor(Math.random() * colors.length)];
      s.style.animationDelay = Math.random() * 0.3 + 's';
      s.style.animationDuration = (1.6 + Math.random() * 0.8) + 's';
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      c.appendChild(s);
    }
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2500);
  }

  /* ═══════════════════════ COMMAND PALETTE ═══════════════════════ */
  const CP_STR = {
    fr: {
      sNav: 'NAVIGATION', sActions: 'ACTIONS RAPIDES', sSales: 'VENTES', sProducts: 'CATALOGUE', sClients: 'CLIENTS', sTeam: 'ÉQUIPE',
      sAi: 'Kiwi AI', executed: 'exécuté', title: 'Recherche Kiwi',
      newSale: 'Nouvelle vente', newSaleSub: 'Encaisser un montant',
      payLink: 'Créer un lien de paiement', payLinkSub: 'À envoyer par WhatsApp ou SMS',
      exportTx: 'Exporter les transactions', exportTxSub: 'CSV de la période affichée',
      instant: 'Régler instantanément', instantSub: '1,50 MAD · ~10s',
      ai: 'Ouvrir Kiwi AI', aiSub: 'Poser une question sur vos chiffres',
      hours: "Horaires d'ouverture", hoursSub: 'Jours et plages de service',
      settings: 'Réglages', settingsSub: 'Langue, thème, sécurité',
      today: "aujourd'hui", yesterday: 'hier',
      mCash: 'Espèces', mCard: 'Carte', mWallet: 'Kiwi Wallet', mSplit: 'Partagée',
      saleFallback: 'Vente',
      openOrders: 'Commandes', openCatalog: 'Catalogue', openClients: 'Clients', openTeam: 'Équipe',
      placeholder: "Vente, article, client, membre de l'équipe, action…",
      navigate: 'naviguer', select: 'ouvrir',
      results: '{n} résultats', ofTotal: '{n} sur {t}',
      noResult: 'Aucun résultat', noResultSub: "Essayez un nom d'article, un prénom, un numéro de téléphone ou un montant.",
      kpiDefaultDesc: 'Indicateur de votre tableau de bord personnalisé.',
      kpiDefaultLong: 'Cet indicateur fait partie de votre bande personnalisée. Il se recalcule automatiquement pour chaque période sélectionnée.',
      kpiSubtitle: 'Indicateur personnalisé · période en cours',
      kpiHowToRead: 'COMMENT LIRE CET INDICATEUR',
      kpiInsight: '<b style="color:var(--mint);">Astuce :</b> demandez à Kiwi AI d\'analyser cet indicateur, il croisera vos chiffres et vous dira quoi en faire.',
      close: 'Fermer',
      analyzeWithKiwiAI: 'Analyser avec Kiwi AI',
    },
    en: {
      sNav: 'NAVIGATION', sActions: 'QUICK ACTIONS', sSales: 'SALES', sProducts: 'CATALOGUE', sClients: 'CUSTOMERS', sTeam: 'TEAM',
      sAi: 'Kiwi AI', executed: 'executed', title: 'Kiwi search',
      newSale: 'New sale', newSaleSub: 'Take a payment',
      payLink: 'Create a payment link', payLinkSub: 'To send by WhatsApp or SMS',
      exportTx: 'Export transactions', exportTxSub: 'CSV for the shown period',
      instant: 'Settle instantly', instantSub: '1.50 MAD · ~10s',
      ai: 'Open Kiwi AI', aiSub: 'Ask a question about your numbers',
      hours: 'Opening hours', hoursSub: 'Days and service windows',
      settings: 'Settings', settingsSub: 'Language, theme, security',
      today: 'today', yesterday: 'yesterday',
      mCash: 'Cash', mCard: 'Card', mWallet: 'Kiwi Wallet', mSplit: 'Split',
      saleFallback: 'Sale',
      openOrders: 'Orders', openCatalog: 'Catalogue', openClients: 'Customers', openTeam: 'Team',
      placeholder: 'Sale, item, customer, team member, action…',
      navigate: 'navigate', select: 'open',
      results: '{n} results', ofTotal: '{n} of {t}',
      noResult: 'No results', noResultSub: 'Try an item name, a first name, a phone number or an amount.',
      kpiDefaultDesc: 'Indicator from your personalized dashboard.',
      kpiDefaultLong: 'This indicator is part of your custom band. It recalculates automatically for each selected period.',
      kpiSubtitle: 'Custom indicator · current period',
      kpiHowToRead: 'HOW TO READ THIS INDICATOR',
      kpiInsight: '<b style="color:var(--mint);">Tip:</b> ask Kiwi AI to analyze this indicator, it will cross-reference your numbers and tell you what to do.',
      close: 'Close',
      analyzeWithKiwiAI: 'Analyze with Kiwi AI',
    },
    ar: {
      sNav: 'التنقّل', sActions: 'إجراءات سريعة', sSales: 'المبيعات', sProducts: 'الكتالوغ', sClients: 'الزبناء', sTeam: 'الفريق',
      sAi: 'Kiwi AI', executed: 'تم التنفيذ', title: 'بحث Kiwi',
      newSale: 'عملية بيع جديدة', newSaleSub: 'تحصيل مبلغ',
      payLink: 'إنشاء رابط للأداء', payLinkSub: 'يُرسَل عبر واتساب أو رسالة',
      exportTx: 'تصدير المعاملات', exportTxSub: 'ملف CSV للفترة المعروضة',
      instant: 'تسوية فورية', instantSub: '1,50 درهم · ~10 ثوانٍ',
      ai: 'فتح Kiwi AI', aiSub: 'اطرح سؤالاً حول أرقامك',
      hours: 'أوقات العمل', hoursSub: 'الأيام وفترات الخدمة',
      settings: 'الإعدادات', settingsSub: 'اللغة، المظهر، الأمان',
      today: 'اليوم', yesterday: 'أمس',
      mCash: 'نقداً', mCard: 'بطاقة', mWallet: 'Kiwi Wallet', mSplit: 'مقسّمة',
      saleFallback: 'بيع',
      openOrders: 'الطلبات', openCatalog: 'الكتالوغ', openClients: 'الزبناء', openTeam: 'الفريق',
      placeholder: 'بيع، منتج، زبون، عضو في الفريق، إجراء…',
      navigate: 'تنقّل', select: 'فتح',
      results: '{n} نتيجة', ofTotal: '{n} من {t}',
      noResult: 'لا نتائج', noResultSub: 'جرّب اسم منتج، اسماً شخصياً، رقم هاتف أو مبلغاً.',
      kpiDefaultDesc: 'مؤشر من لوحة التحكم المخصصة لك.',
      kpiDefaultLong: 'هذا المؤشر جزء من الشريط المخصص لك. يتم إعادة حسابه تلقائيًا لكل فترة محددة.',
      kpiSubtitle: 'مؤشر مخصص · الفترة الحالية',
      kpiHowToRead: 'كيفية قراءة هذا المؤشر',
      kpiInsight: '<b style="color:var(--mint);">نصيحة:</b> اطلب من Kiwi AI تحليل هذا المؤشر - سيقوم بمقارنة أرقامك ويخبرك بما يجب فعله.',
      close: 'إغلاق',
      analyzeWithKiwiAI: 'تحليل بواسطة Kiwi AI',
    },
  };
  /* ═══════════════════════ RECHERCHE UNIVERSELLE ═══════════════════════
   *
   * La barre promettait « commande, produit, client, équipe » et ne cherchait
   * que seize commandes écrites en dur — dont la moitié n'ouvrait qu'un toast
   * portant des chiffres de démo (« 6 tables occupées ») servis à un vrai
   * commerçant. Un patron qui tape le nom d'une cliente ou d'un article ne
   * trouvait rien, et concluait — à raison — que la recherche ne marche pas.
   *
   * L'index est maintenant construit à CHAQUE ouverture, à partir de ce que ce
   * commerçant possède vraiment :
   *
   *   · Navigation — moissonnée dans la barre latérale vivante. Elle est déjà
   *     filtrée par merchant-config (module vendu ou non), par le rôle du PIN et
   *     par le métier, et ses libellés sont déjà dans la langue en cours. Donc
   *     un résultat ne peut pas mener à une porte fermée, et il n'y a aucune
   *     liste parallèle à maintenir quand une destination apparaît ou part.
   *   · Actions — uniquement celles dont le handler existe réellement.
   *   · Ventes · produits · clients · équipe — les vrais magasins de données.
   *     Une source vide ne produit aucune section : pas de résultat vaut mieux
   *     qu'un faux résultat.
   *
   * Tout est construit en DOM, jamais en innerHTML : ces lignes portent des noms
   * de clients et d'articles, c'est-à-dire du texte que le commerçant a saisi.
   */

  /* « Crème brûlée » doit se trouver en tapant « creme brulee », et « SALMA » en
   * tapant « salma ». Sans ça la recherche ne sert à rien en français comme en
   * arabe translittéré, où personne ne tape les accents. */
  function kpNorm(s) {
    try { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
    catch (_) { return String(s == null ? '' : s).toLowerCase().trim(); }
  }

  /* Score d'une entrée pour des mots-clés. TOUS les mots doivent être présents
   * (« pain com » ne doit pas remonter toute la carte), et on privilégie le
   * début du titre, puis le début d'un mot, puis le reste. 0 ⇒ pas un résultat. */
  function kpScore(entry, tokens) {
    if (!tokens.length) return 1;
    const title = entry._t || '';
    const hay = entry._h || '';
    let total = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      let s = 0;
      if (title.startsWith(tk)) s = 100;
      else if (title.indexOf(' ' + tk) >= 0) s = 70;
      else if (title.indexOf(tk) >= 0) s = 40;
      else if (hay.indexOf(tk) >= 0) s = 15;
      else return 0;                      // un mot absent ⇒ l'entrée ne matche pas
      total += s;
    }
    return total / tokens.length;
  }

  function kpMoney(n) {
    const v = Math.round(+n || 0);
    try { return v.toLocaleString('fr-FR') + ' MAD'; } catch (_) { return v + ' MAD'; }
  }

  /* « aujourd'hui 14:05 », « hier 09:12 », sinon « 14/07 · 18:40 ». Une vente se
   * reconnaît à son heure bien plus qu'à sa date complète. */
  function kpWhen(ts, cp) {
    const d = new Date(+ts || 0);
    if (!(+d)) return '';
    const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const diff = Math.floor((day - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (diff === 0) return cp.today + ' ' + hh;
    if (diff === 1) return cp.yesterday + ' ' + hh;
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' · ' + hh;
  }

  function kpSafe(fn, fallback) {
    try { const v = fn(); return v == null ? fallback : v; } catch (_) { return fallback; }
  }

  /* Les destinations réellement offertes à CE commerçant, lues dans la barre
   * latérale telle qu'elle est peinte à l'écran. `offsetParent === null` écarte
   * d'un coup tout ce que merchant-config, le rôle du PIN et le verrou Croissance
   * ont masqué — sans que la recherche ait besoin de connaître aucune de ces
   * règles. L'icône est le SVG de la barre, clonée : même vocabulaire visuel. */
  function kpNavEntries() {
    const out = [];
    const links = document.querySelectorAll('.sidebar nav a');
    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      if (a.offsetParent === null) continue;
      let label = '';
      const spans = a.querySelectorAll('span');
      for (let j = 0; j < spans.length; j++) {
        if (spans[j].classList.contains('count')) continue;
        label = (spans[j].textContent || '').trim();
        if (label) break;
      }
      if (!label) continue;
      // Le titre de rubrique qui surplombe le lien (« KIWI PAY », « RESTAURATION »)
      let sect = '';
      let prev = a.previousElementSibling;
      while (prev && !sect) {
        if (prev.classList && prev.classList.contains('sect')) sect = (prev.textContent || '').trim();
        prev = prev.previousElementSibling;
      }
      const svg = a.querySelector('svg');
      out.push({
        group: 'nav', title: label, sub: sect,
        icon: svg ? svg.cloneNode(true) : null,
        run: function () { a.click(); },
      });
    }
    return out;
  }

  /* Une action n'est proposée que si son handler existe. C'est la seule barrière
   * qui empêche la recherche de reproduire son défaut d'origine : promettre une
   * commande qui n'ouvre rien. */
  function kpActionEntries(cp) {
    const want = [
      { k: 'new-sale', title: cp.newSale, sub: cp.newSaleSub },
      { k: 'payment-link', title: cp.payLink, sub: cp.payLinkSub },
      { k: 'export', title: cp.exportTx, sub: cp.exportTxSub },
      { k: 'instant-settle', title: cp.instant, sub: cp.instantSub },
      { k: 'open-assistant', title: cp.ai, sub: cp.aiSub },
      { k: 'settings-hours', title: cp.hours, sub: cp.hoursSub },
      { k: 'settings', title: cp.settings, sub: cp.settingsSub },
    ];
    const out = [];
    want.forEach(function (w) {
      if (typeof handlers[w.k] !== 'function') return;
      out.push({
        group: 'action', title: w.title, sub: w.sub, glyph: '›',
        run: function () { handlers[w.k](); },
      });
    });
    return out;
  }

  /* Les ventes de la venue active. `label` est le résumé de ticket que la caisse
   * a envoyé (« Pain +3 art. ») ; on cherche aussi dans les lignes du panier,
   * parce qu'un patron cherche « chemise », pas le libellé du ticket. */
  function kpSaleEntries(cp) {
    const vid = kpSafe(function () { return window.KiwiVenue.getCurrentVenue(); }, null);
    const rows = kpSafe(function () { return window.KiwiSales.list(vid) || []; }, []);
    if (!rows.length) return [];
    const recent = rows.slice(-400).reverse();
    const METHOD = { cash: cp.mCash, card: cp.mCard, tap: 'Kiwi Tap', qr: 'QR', wallet: cp.mWallet, split: cp.mSplit };
    return recent.map(function (s) {
      const lines = Array.isArray(s.lines) ? s.lines : [];
      const names = lines.map(function (l) { return l && l.name; }).filter(Boolean).join(' ');
      const method = METHOD[s.method] || s.method || '';
      return {
        group: 'sale',
        title: String(s.label || cp.saleFallback).slice(0, 80),
        sub: kpWhen(s.ts, cp) + (method ? ' · ' + method : ''),
        amount: kpMoney(s.amount),
        extra: names,
        glyph: '↔',
        run: function () {
          if (typeof handlers['nav-transactions'] === 'function') handlers['nav-transactions']();
          else toast(cp.openOrders, { type: 'info' });
        },
      };
    });
  }

  /* Le catalogue, quel que soit le métier : la carte pour un restaurant, les
   * articles pour une boutique. Les deux magasins peuvent être présents. */
  function kpProductEntries(cp) {
    const out = [];
    kpSafe(function () { return window.KiwiMenu.items() || []; }, []).forEach(function (it) {
      if (!it || !it.name) return;
      out.push({
        group: 'product', title: String(it.name), sub: String(it.category || ''),
        amount: it.price != null ? kpMoney(it.price) : '', glyph: '◦',
        run: function () {
          if (typeof handlers['menu-edit'] === 'function') handlers['menu-edit']();
          else if (typeof handlers['nav-menu'] === 'function') handlers['nav-menu']();
          else toast(cp.openCatalog, { type: 'info' });
        },
      });
    });
    const cats = {};
    kpSafe(function () { return window.KiwiBoutiqueCatalog.listCategories() || []; }, [])
      .forEach(function (c) { if (c && c.id) cats[c.id] = c.name || ''; });
    kpSafe(function () { return window.KiwiBoutiqueCatalog.listProducts() || []; }, []).forEach(function (p) {
      if (!p || !p.name) return;
      out.push({
        group: 'product', title: String(p.name),
        sub: [cats[p.categoryId] || '', p.art || ''].filter(Boolean).join(' · '),
        amount: p.priceMAD ? kpMoney(p.priceMAD) : '', glyph: '◦',
        run: function () {
          if (typeof handlers['nav-catalogue'] === 'function') handlers['nav-catalogue']();
          else if (typeof handlers['bqx-open'] === 'function') handlers['bqx-open']();
          else toast(cp.openCatalog, { type: 'info' });
        },
      });
    });
    return out;
  }

  /* Le carnet de clients. Le numéro compte autant que le nom : au comptoir on
   * cherche « 0661 » bien plus souvent qu'un patronyme. */
  function kpClientEntries(cp) {
    const list = kpSafe(function () { return window.KiwiClients.list() || []; }, []);
    return list.map(function (c) {
      const name = String(c.name || '').trim() || (c.phone || '');
      return {
        group: 'client', title: name,
        sub: [c.phone || '', c.city || ''].filter(Boolean).join(' · '),
        extra: c.email || '', glyph: '·',
        initial: (name.charAt(0) || '?').toUpperCase(),
        run: function () {
          if (typeof handlers['clients-directory'] === 'function') handlers['clients-directory']();
          else toast(cp.openClients, { type: 'info' });
        },
      };
    }).filter(function (e) { return !!e.title; });
  }

  function kpTeamEntries(cp) {
    const list = kpSafe(function () { return window.KiwiTeam.roster() || []; }, []);
    return list.map(function (m) {
      return {
        group: 'team', title: String(m.name || '').trim(), sub: String(m.role || ''),
        initial: m.avatar || '?', glyph: '·',
        run: function () {
          if (typeof handlers['nav-equipe'] === 'function') handlers['nav-equipe']();
          else toast(cp.openTeam, { type: 'info' });
        },
      };
    }).filter(function (e) { return !!e.title; });
  }

  function commandPalette() {
    if (document.querySelector('.kp')) return;
    const cp = CP_STR[kiwiLang()] || CP_STR.fr;
    const isMac = kpSafe(function () { return /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent); }, false);

    /* Ordre des sections : ce qu'on fait le plus souvent d'abord. Les sections de
     * DONNÉES n'apparaissent qu'une fois une requête tapée — sinon la palette
     * s'ouvrirait sur des centaines de lignes de ventes au lieu d'un menu. */
    const GROUPS = [
      { id: 'nav', label: cp.sNav, always: true },
      { id: 'action', label: cp.sActions, always: true },
      { id: 'sale', label: cp.sSales, cap: 6 },
      { id: 'product', label: cp.sProducts, cap: 6 },
      { id: 'client', label: cp.sClients, cap: 6 },
      { id: 'team', label: cp.sTeam, cap: 6 },
    ];

    const index = [].concat(
      kpNavEntries(), kpActionEntries(cp), kpSaleEntries(cp),
      kpProductEntries(cp), kpClientEntries(cp), kpTeamEntries(cp)
    );
    // Champs de recherche pré-normalisés une fois : le filtre tourne à chaque
    // frappe sur potentiellement quelques milliers de lignes.
    index.forEach(function (e) {
      e._t = kpNorm(e.title);
      e._h = kpNorm([e.title, e.sub, e.extra, e.amount].filter(Boolean).join(' '));
    });

    const back = document.createElement('div');
    back.className = 'kiwi-backdrop';
    back.style.background = 'rgba(10,15,13,0.45)';
    const kp = document.createElement('div');
    kp.className = 'kp';
    kp.setAttribute('role', 'dialog');
    kp.setAttribute('aria-modal', 'true');
    kp.setAttribute('aria-label', cp.title);

    const head = document.createElement('div');
    head.className = 'kp-head';
    const ic = document.createElement('span');
    ic.style.color = 'var(--n-500)';
    ic.style.display = 'inline-flex';
    ic.innerHTML = I.search;              // icône interne, pas de donnée utilisateur
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('placeholder', cp.placeholder);
    input.setAttribute('aria-label', cp.placeholder);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-autocomplete', 'list');
    input.autocomplete = 'off'; input.spellcheck = false;
    const escTag = document.createElement('span');
    escTag.className = 'kp-esc';
    escTag.textContent = 'ESC';
    head.append(ic, input, escTag);

    const list = document.createElement('div');
    list.className = 'kp-list';
    list.setAttribute('role', 'listbox');

    const foot = document.createElement('div');
    foot.className = 'kp-foot';
    const fNav = document.createElement('span');
    fNav.append(kpKbd('↑'), kpKbd('↓'), document.createTextNode(' ' + cp.navigate));
    const fSel = document.createElement('span');
    fSel.append(kpKbd('↵'), document.createTextNode(' ' + cp.select));
    const fCount = document.createElement('span');
    fCount.className = 'kp-count';
    foot.append(fNav, fSel, fCount);

    kp.append(head, list, foot);

    function kpKbd(t) { const k = document.createElement('kbd'); k.textContent = t; return k; }

    /* Souligne dans le résultat le morceau que la personne vient de taper — sans
     * accents dans la requête et avec accents dans la donnée, donc on compare sur
     * la forme normalisée et on découpe la chaîne D'ORIGINE aux mêmes indices. */
    function kpMark(text, tokens) {
      const frag = document.createDocumentFragment();
      const raw = String(text == null ? '' : text);
      if (!tokens.length) { frag.appendChild(document.createTextNode(raw)); return frag; }
      const norm = kpNorm(raw);
      const hits = [];
      tokens.forEach(function (tk) {
        let from = 0, at;
        while (tk && (at = norm.indexOf(tk, from)) >= 0) { hits.push([at, at + tk.length]); from = at + tk.length; }
      });
      if (!hits.length) { frag.appendChild(document.createTextNode(raw)); return frag; }
      hits.sort(function (a, b) { return a[0] - b[0]; });
      const merged = [];
      hits.forEach(function (h) {
        const last = merged[merged.length - 1];
        if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
        else merged.push([h[0], h[1]]);
      });
      let cur = 0;
      merged.forEach(function (m) {
        // La normalisation NFD peut décaler les indices ; on ne surligne que si
        // les longueurs concordent, sinon on rend le texte brut (jamais faux).
        if (norm.length !== raw.length) return;
        if (m[0] > cur) frag.appendChild(document.createTextNode(raw.slice(cur, m[0])));
        const mk = document.createElement('mark');
        mk.textContent = raw.slice(m[0], m[1]);
        frag.appendChild(mk);
        cur = m[1];
      });
      if (cur < raw.length) frag.appendChild(document.createTextNode(raw.slice(cur)));
      return frag;
    }

    function kpRow(entry, tokens) {
      const row = document.createElement('div');
      row.className = 'kp-item';
      row.setAttribute('role', 'option');
      row.tabIndex = -1;

      const box = document.createElement('div');
      box.className = 'kpi-ic';
      if (entry.icon) box.appendChild(entry.icon.cloneNode(true));
      else if (entry.initial) { box.textContent = entry.initial; box.classList.add('is-initial'); }
      else if (entry.glyph) box.textContent = entry.glyph;

      const mid = document.createElement('div');
      mid.className = 'kpi-mid';
      const t = document.createElement('div');
      t.className = 'kpi-t';
      t.appendChild(kpMark(entry.title, tokens));
      mid.appendChild(t);
      if (entry.sub) {
        const s = document.createElement('div');
        s.className = 'kpi-s';
        s.appendChild(kpMark(entry.sub, tokens));
        mid.appendChild(s);
      }
      row.append(box, mid);

      if (entry.amount) {
        const a = document.createElement('div');
        a.className = 'kpi-amt';
        a.textContent = entry.amount;
        row.appendChild(a);
      }
      row.addEventListener('click', function () { close(); kpSafe(entry.run, null); });
      row.addEventListener('mousemove', function () { setActive(rows.indexOf(row), false); });
      return row;
    }

    let rows = [];
    let active = -1;

    function setActive(i, scroll) {
      if (!rows.length) { active = -1; return; }
      active = ((i % rows.length) + rows.length) % rows.length;
      rows.forEach(function (r, n) {
        const on = n === active;
        r.classList.toggle('active', on);
        r.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (scroll !== false) rows[active].scrollIntoView({ block: 'nearest' });
    }

    function render(q) {
      const tokens = kpNorm(q).split(/\s+/).filter(Boolean);
      const typing = tokens.length > 0;
      const frag = document.createDocumentFragment();
      rows = [];
      let shown = 0;

      GROUPS.forEach(function (g) {
        if (!g.always && !typing) return;          // pas de mur de données à l'ouverture
        const hits = [];
        index.forEach(function (e) {
          if (e.group !== g.id) return;
          const s = kpScore(e, tokens);
          if (s > 0) hits.push({ e: e, s: s });
        });
        if (!hits.length) return;
        hits.sort(function (a, b) { return b.s - a.s; });
        const cap = typing && g.cap ? g.cap : hits.length;
        const head = document.createElement('div');
        head.className = 'kp-sect';
        const nm = document.createElement('span');
        nm.textContent = g.label;
        head.appendChild(nm);
        if (hits.length > cap) {
          const more = document.createElement('span');
          more.className = 'n';
          more.textContent = cp.ofTotal.replace('{n}', String(cap)).replace('{t}', String(hits.length));
          head.appendChild(more);
        }
        frag.appendChild(head);
        hits.slice(0, cap).forEach(function (h) {
          const r = kpRow(h.e, tokens);
          rows.push(r);
          frag.appendChild(r);
          shown++;
        });
      });

      if (!shown) {
        const empty = document.createElement('div');
        empty.className = 'kp-empty';
        const t = document.createElement('div');
        t.className = 'kp-empty-t';
        t.textContent = cp.noResult;
        const s = document.createElement('div');
        s.className = 'kp-empty-s';
        s.textContent = cp.noResultSub;
        empty.append(t, s);
        frag.appendChild(empty);
      }

      list.replaceChildren(frag);
      fCount.textContent = shown ? cp.results.replace('{n}', String(shown)) : '';
      setActive(0, false);
    }

    render('');

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home' && rows.length) { e.preventDefault(); setActive(0); }
      else if (e.key === 'End' && rows.length) { e.preventDefault(); setActive(rows.length - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) rows[active].click(); }
    });

    back.appendChild(kp);
    document.body.appendChild(back);
    /* L'ouverture était gardée par le SEUL requestAnimationFrame. Un onglet en
     * arrière-plan n'en exécute aucun : la palette restait alors à opacity 0,
     * présente et invisible, et ⌘K semblait ne rien faire au retour sur l'onglet.
     * Le timer est le filet ; `add` est idempotent, donc les deux peuvent courir. */
    const reveal = function () { back.classList.add('in'); kp.classList.add('in'); input.focus(); };
    requestAnimationFrame(reveal);
    setTimeout(reveal, 60);

    function close() {
      back.classList.remove('in'); kp.classList.remove('in');
      setTimeout(function () { back.remove(); }, 220);
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });

    // Le raccourci affiché doit être celui du clavier qu'on a sous les doigts :
    // la caisse Kiwi tourne sous Windows, où « ⌘K » ne veut rien dire.
    const shortcut = document.createElement('span');
    shortcut.textContent = (isMac ? '⌘' : 'Ctrl ') + 'K';
    shortcut.className = 'kp-sc';
    foot.appendChild(shortcut);
  }

  /* ═══════════════════════ HANDLERS ═══════════════════════ */
  const handlers = {

    /* Generic "Annuler / Fermer" affordances for locally-built modals & drawers
     * (e.g. the Spa-CRM forms in pages-pro.js). They route the click to the
     * overlay's real close button so scroll-lock + focus-return run correctly. */
    'dismiss-modal': (el) => {
      const back = el?.closest?.('.kiwi-backdrop') || document.querySelector('.kiwi-backdrop');
      back?.querySelector('.kiwi-modal-close')?.click();
    },
    'dismiss-drawer': (el) => {
      const back = el?.closest?.('.kiwi-drawer-backdrop') || document.querySelector('.kiwi-drawer-backdrop');
      back?.querySelector('.kiwi-drawer-close')?.click();
    },

    'manage-billing': () => toast(
      tr({ fr: 'Gestion de l\'abonnement', en: 'Manage subscription', ar: 'إدارة الاشتراك' }),
      { type: 'info', desc: tr({
        fr: 'Kiwi Pro · 399 MAD/mois · prélèvement le 1er du mois. Sans engagement.',
        en: 'Kiwi Pro · 399 MAD/month · charged on the 1st. No commitment.',
        ar: 'كيوي برو · 399 درهم/شهر · الخصم يوم 1. بدون التزام.' }) }),

    'signup': () => {
      let step = 0;
      let business = 'resto';
      const s = SIGNUP_STR[kiwiLang()] || SIGNUP_STR.fr;
      const gen = GENERAL_STR[kiwiLang()] || GENERAL_STR.fr;

      const m = modal({
        tag: s.tag,
        title: s.title,
        desc: s.desc,
        body: render(),
        width: 560,
      });
      function render() {
        return `
          <div class="wiz-steps">
            <div class="wiz-step ${step >= 0 ? 'active' : ''}"></div>
            <div class="wiz-step ${step >= 1 ? 'active' : ''}"></div>
            <div class="wiz-step ${step >= 2 ? 'active' : ''}"></div>
          </div>
          <div style="font-size:11px; color:var(--n-500); letter-spacing:0.08em; text-transform:uppercase; font-family:var(--mono); margin-bottom:10px;">${s.step_prefix} ${step + 1} / 3 · ${s.steps[step]}</div>
          ${step === 0 ? step0() : step === 1 ? step1() : step2()}
          <div style="display:flex; justify-content:space-between; margin-top:22px; gap:10px;">
            <button class="kb ghost" data-prev ${step === 0 ? 'disabled style="opacity:0.4;"' : ''}>${gen.back}</button>
            <button class="kb primary" data-next>${step === 2 ? s.finish_button : gen.continue}</button>
          </div>
        `;
      }
      function step0() {
        return `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div class="wiz-choice ${business==='resto'?'selected':''}" data-biz="resto">
              <div class="wc-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3v7"/></svg></div>
              <div><div class="wc-t">${s.business_resto}</div><div class="wc-d">${s.business_resto_desc}</div></div>
            </div>
            <div class="wiz-choice ${business==='retail'?'selected':''}" data-biz="retail">
              <div class="wc-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
              <div><div class="wc-t">${s.business_retail}</div><div class="wc-d">${s.business_retail_desc}</div></div>
            </div>
            <div class="wiz-choice ${business==='services'?'selected':''}" data-biz="services">
              <div class="wc-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg></div>
              <div><div class="wc-t">${s.business_services}</div><div class="wc-d">${s.business_services_desc}</div></div>
            </div>
            <div class="wiz-choice ${business==='other'?'selected':''}" data-biz="other">
              <div class="wc-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></div>
              <div><div class="wc-t">${s.business_other}</div><div class="wc-d">${s.business_other_desc}</div></div>
            </div>
          </div>
        `;
      }
      function step1() {
        return `
          <div class="kf-group">
            <label class="kf-label">${s.shop_name_label}</label>
            <input class="kf-input" placeholder="${s.shop_name_placeholder}" />
          </div>
          <div class="kf-row">
            <div class="kf-group">
              <label class="kf-label">${s.first_name_label}</label>
              <input class="kf-input" placeholder="${s.first_name_placeholder}" />
            </div>
            <div class="kf-group">
              <label class="kf-label">${s.last_name_label}</label>
              <input class="kf-input" placeholder="${s.last_name_placeholder}" />
            </div>
          </div>
          <div class="kf-row">
            <div class="kf-group">
              <label class="kf-label">${s.phone_label}</label>
              <input class="kf-input" placeholder="${s.phone_placeholder}" />
            </div>
            <div class="kf-group">
              <label class="kf-label">${s.city_label}</label>
              <input class="kf-input" placeholder="${s.city_placeholder}" value="Casablanca" />
            </div>
          </div>
          <div class="kf-help">${s.kyc_notice}</div>
        `;
      }
      function step2() {
        return `
          <div style="text-align:center; padding:10px 0 20px;">
            <div style="width:70px; height:70px; margin:0 auto 16px; border-radius:22px; background:var(--atlas); color:var(--mint); display:flex; align-items:center; justify-content:center;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
            </div>
            <h3 style="font-size:22px; font-weight:600; letter-spacing:-0.02em; margin:0 0 8px;">${s.ready_title}</h3>
            <p style="color:var(--n-600); font-size:14px; margin:0 auto; max-width:380px;">${s.ready_desc}</p>
          </div>
          <div style="background:var(--paper-soft); border-radius:12px; padding:16px; display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px;">
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">${s.subscription_label}</div><b style="font-size:18px;">${s.subscription_value}</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">${s.settlement_label}</div><b style="font-size:18px;">${s.settlement_value}</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">${s.hardware_label}</div><b style="font-size:18px;">${s.hardware_value}</b></div>
            <div><div style="color:var(--n-500); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mono);">${s.commitment_label}</div><b style="font-size:18px;">${s.commitment_value}</b></div>
          </div>
        `;
      }
      m.el.addEventListener('click', (e) => {
        const biz = e.target.closest('[data-biz]');
        if (biz) { business = biz.dataset.biz; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
        if (e.target.closest('[data-next]')) {
          if (step < 2) { step++; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
          else { m.close(); confetti(); toast(s.toast_success_title, {type: 'success', desc: s.toast_success_desc}); }
        }
        if (e.target.closest('[data-prev]')) {
          if (step > 0) { step--; m.el.querySelector('.kiwi-modal-body').innerHTML = render(); }
        }
      });
    },

    'login': () => {
      const s = (LOGIN_STR[kiwiLang()] || LOGIN_STR.fr);
      modal({
        title: s.title,
        desc: s.desc,
        width: 440,
        body: `
          <div class="kf-group">
            <label class="kf-label">${s.email_label}</label>
            <input class="kf-input" placeholder="rachid@cafeatlas.ma" />
          </div>
          <div class="kf-group">
            <label class="kf-label">${s.password_label}</label>
            <input class="kf-input" type="password" placeholder="••••••••" />
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-top:8px;">
            <label style="display:flex; gap:6px; color:var(--n-600);"><input type="checkbox" checked style="accent-color:var(--atlas); width:15px; height:15px;"/> ${s.remember_me}</label>
            <a href="#" style="color:var(--atlas); font-weight:500;">${s.forgot_password}</a>
          </div>
          <button class="kb primary" style="width:100%; justify-content:center; margin-top:18px; padding:12px;" data-login-go>${s.login_button} →</button>
          <div style="text-align:center; margin-top:14px; font-size:13px; color:var(--n-500);">${s.no_account} <a href="#" data-to-signup style="color:var(--atlas); font-weight:500;">${s.create_account}</a></div>
        `
      });
      const loginHandler = (e) => {
        if (e.target.closest('[data-login-go]')) {
          document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
          setTimeout(() => location.href = 'dashboard.html', 200);
          document.body.removeEventListener('click', loginHandler);
        } else if (e.target.closest('[data-to-signup]')) {
          e.preventDefault();
          document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
          setTimeout(handlers.signup, 200);
          document.body.removeEventListener('click', loginHandler);
        }
      };
      document.body.addEventListener('click', loginHandler);
    },

    'search': () => commandPalette(),

    'notifications': () => {
      const s = (NOTIFICATIONS_STR[kiwiLang()] || NOTIFICATIONS_STR.fr);
      /* L'écran vide annonce ce qui viendra s'y ranger. Nommer « les alertes de
       * terminaux » à un client dont l'opérateur n'a pas ouvert le module
       * Terminaux, c'est lui promettre une page qu'il ne verra jamais — alors on
       * ne cite que les modules qu'il a. Il en reste toujours au moins un
       * (Kiwi AI), donc la phrase ne se vide pas. */
      const featOff = (k) => { try { return !!window.KiwiConfig?.off?.(k); } catch (_) { return false; } };
      const NOTIF_EMPTY = {
        fr: { head: 'Aucune notification', tail: 'apparaîtront ici.', and: ' et ',
              src: [[null, 'Les alertes de règlement'], ['terminaux', 'de terminaux'], [null, 'les suggestions Kiwi AI']] },
        en: { head: 'No notifications', tail: 'will appear here.', and: ' and ',
              src: [[null, 'Settlement alerts'], ['terminaux', 'terminal alerts'], [null, 'Kiwi AI suggestions']] },
        ar: { head: 'لا إشعارات', tail: 'ستظهر هنا.', and: ' و',
              src: [[null, 'تنبيهات التسوية'], ['terminaux', 'تنبيهات الأجهزة'], [null, 'اقتراحات Kiwi AI']] },
      };
      if (window.KiwiVenue?.isCustom?.()) {
        const b = NOTIF_EMPTY[kiwiLang()] || NOTIF_EMPTY.fr;
        const parts = b.src.filter(([k]) => !k || !featOff(k)).map(([, t]) => t);
        // Retirer un élément d'une énumération laisse une virgule là où il faut
        // une conjonction : « Les alertes de règlement, les suggestions Kiwi AI »
        // se lit comme une phrase tronquée.
        const list = parts.length > 1
          ? parts.slice(0, -1).join(', ') + b.and + parts[parts.length - 1]
          : parts.join('');
        const e = { head: b.head, msg: list + ' ' + b.tail };
        return drawer({
          title: s.title,
          subtitle: '',
          body: `<div style="text-align:center;padding:52px 16px;">` +
            `<div style="font-size:14px;font-weight:600;color:var(--ink);">${e.head}</div>` +
            `<div style="font-size:12.5px;color:var(--n-500);margin-top:6px;line-height:1.5;">${e.msg}</div>` +
            `</div>`,
        });
      }
      drawer({
      title: s.title,
      subtitle: s.subtitle,
      body: `
        <div class="notif unread">
          <div class="n-ico" style="background:color-mix(in srgb, var(--atlas) 14%, var(--surface)); color:var(--atlas);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.settlement_ready_title}</div>
            <div class="n-desc">${s.settlement_ready_desc}</div>
            <div class="n-time">${s.time_12_min}</div>
          </div>
        </div>
        <div class="notif unread">
          <div class="n-ico" style="background:color-mix(in srgb, var(--warn-ink) 16%, var(--surface)); color:var(--warn-ink);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.terminal_offline_title}</div>
            <div class="n-desc">${s.terminal_offline_desc}</div>
            <div class="n-time">${s.time_1_hr}</div>
          </div>
        </div>
        <div class="notif unread">
          <div class="n-ico" style="background:color-mix(in srgb, var(--info) 14%, var(--surface)); color:var(--info);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.ai_suggestion_title}</div>
            <div class="n-desc">${s.ai_suggestion_desc}</div>
            <div class="n-time">${s.time_2_hr}</div>
          </div>
        </div>
        <div class="notif">
          <!-- receipt_long.svg · un relevé de transactions, pas un rectangle vide -->
          <div class="n-ico"><svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor"><path d="M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.yesterday_tx_title}</div>
            <div class="n-desc">${s.yesterday_tx_desc}</div>
            <div class="n-time">${s.time_yesterday_2345}</div>
          </div>
        </div>
        <div class="notif">
          <div class="n-ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12l-2-2m-6 6l-6 6H4v-4l6-6m4-4l6-6 4 4-6 6-4-4z"/></svg></div>
          <div class="n-body">
            <div class="n-title">${s.fatima_signed_title}</div>
            <div class="n-desc">${s.fatima_signed_desc}</div>
            <div class="n-time">${s.time_yesterday_2100}</div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" style="width:100%; justify-content:center;" data-mark-read>${s.mark_all_read}</button>
      `
    })},

    'settings': () => {
      const I18 = window.KiwiI18n;
      const lang = (I18 && I18.getLang && I18.getLang()) || 'fr';
      const LANGNAME = { fr: 'Français', en: 'English', ar: 'العربية' };
      const setOn = (k) => { try { return localStorage.getItem('kiwiSet:' + k) !== '0'; } catch (_) { return true; } };
      const KV = window.KiwiVenue;
      const cv = !!(KV && KV.isCustom && KV.isCustom());
      const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
      const getSet = (k, def) => { try { return localStorage.getItem('kiwiSet:' + k) || def; } catch (_) { return def; } };
      const hoursRowValue = (venueData) => {
        const KH = window.KiwiHours;
        const legacy = (venueData && venueData.hours) || getSet('hours', '');
        const unset = tr({ fr: 'À définir', en: 'To set', ar: 'غير محدد' });
        if (!KH) return legacy || unset;
        if (!KH.isConfigured()) {
          return legacy ? tr({ fr: 'À convertir · ', en: 'To convert · ', ar: 'للتحويل · ' }) + legacy : unset;
        }
        return KH.summary(Date.now()).text;
      };
      const receiptRowValue = () => {
        const K = window.KiwiReceipt;
        if (!K) return tr({ fr: 'Ticket standard', en: 'Standard ticket', ar: 'وصل قياسي' });
        const miss = K.missing();
        if (miss.length) {
          return tr({
            fr: `${miss.length} mention${miss.length > 1 ? 's' : ''} légale${miss.length > 1 ? 's' : ''} à compléter`,
            en: `${miss.length} legal detail${miss.length > 1 ? 's' : ''} to complete`,
            ar: `${miss.length} بيان قانوني ينقص`,
          });
        }
        return K.isConfigured()
          ? tr({ fr: 'Personnalisé · prêt à imprimer', en: 'Customised · ready to print', ar: 'مخصّص · جاهز للطبع' })
          : tr({ fr: 'Modèle par défaut', en: 'Default template', ar: 'نموذج افتراضي' });
      };
      const fmtN = (n) => (+n || 0).toLocaleString('fr-FR').replace(/[ , ]/g, ' ');

      const venueTitle = escape((vd && (vd.fullDisplay || vd.name)) || (window.KiwiMe && window.KiwiMe.business) || (window.KiwiEnv?.isReal?.() ? 'Mon établissement' : 'Café Atlas · Maarif'));
      const tradeLabel = escape((window.KiwiVenue?.getTypeLabel?.() || '') || tr({ fr: 'Restauration & Boissons', en: 'Food & Beverage', ar: 'المطاعم والمشروبات' }));

      return appPage('settings', {
        title: tr({ fr: 'Paramètres', en: 'Settings', ar: 'الإعدادات' }),
        subtitle: tr({
          fr: `${venueTitle} · Configuration · Matériel & Caisse · Sécurité · Intégrations`,
          en: `${venueTitle} · Configuration · Hardware & POS · Security · Integrations`,
          ar: `${venueTitle} · الإعدادات · الأجهزة والصندوق · الأمان · الربط`,
        }),
        body: `
          <style>
            .gp-settings-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 20px;
              margin-top: 10px;
            }
            @media (max-width: 920px) {
              .gp-settings-grid { grid-template-columns: minmax(0, 1fr); }
            }
            .gp-set-card {
              background: var(--surface, #FFFFFF);
              border: 1px solid var(--n-200, #E5E7EB);
              border-radius: 20px;
              box-shadow: 0 1px 3px rgba(10, 15, 13, 0.04), 0 12px 32px -16px rgba(10, 15, 13, 0.08);
              padding: 22px 24px;
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
            :root[data-theme="dark"] .gp-set-card {
              background: rgba(14, 30, 23, 0.88);
              border-color: rgba(255, 255, 255, 0.10);
              box-shadow: 0 0 0 1px rgba(0, 255, 174, 0.05), 0 16px 40px -12px rgba(0, 0, 0, 0.5);
            }
            .gp-set-card-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 12px;
              border-bottom: 1px solid var(--n-150, rgba(0,0,0,0.06));
            }
            :root[data-theme="dark"] .gp-set-card-head {
              border-bottom-color: rgba(255, 255, 255, 0.08);
            }
            .gp-set-title {
              font-size: 15px;
              font-weight: 700;
              letter-spacing: -0.015em;
              color: var(--ink);
              display: flex;
              align-items: center;
              gap: 8px;
            }
            :root[data-theme="dark"] .gp-set-title { color: #F5FAF7; }
            .gp-set-tag {
              font-family: var(--mono);
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: var(--atlas, #0C6B4E);
              background: rgba(12, 107, 78, 0.10);
              padding: 3px 8px;
              border-radius: 999px;
            }
            :root[data-theme="dark"] .gp-set-tag {
              color: #00FFAE;
              background: rgba(0, 255, 174, 0.12);
            }
            .kset-row {
              display: flex;
              align-items: center;
              gap: 14px;
              padding: 10px 12px;
              cursor: pointer;
              transition: all 140ms ease;
              border-radius: 12px;
              border: 1px solid transparent;
            }
            .kset-row:hover {
              background: var(--paper-soft, rgba(0,0,0,0.03));
              border-color: var(--n-200, rgba(0,0,0,0.05));
              transform: translateX(2px);
            }
            :root[data-theme="dark"] .kset-row:hover {
              background: rgba(255, 255, 255, 0.05);
              border-color: rgba(255, 255, 255, 0.08);
            }
            .kset-ico {
              width: 34px; height: 34px;
              flex-shrink: 0;
              display: grid;
              place-items: center;
              border-radius: 10px;
              color: var(--atlas, #0C6B4E);
              background: rgba(12, 107, 78, 0.10);
              border: 1px solid rgba(12, 107, 78, 0.14);
            }
            :root[data-theme="dark"] .kset-ico {
              color: #00FFAE;
              background: rgba(0, 255, 174, 0.12);
              border-color: rgba(0, 255, 174, 0.20);
            }
            .kset-toggle {
              width: 38px; height: 22px;
              background: var(--n-300, #CBD5E1);
              border-radius: 999px;
              position: relative;
              transition: background 160ms;
              flex-shrink: 0;
              cursor: pointer;
            }
            .kset-toggle.on { background: var(--atlas, #0C6B4E); }
            :root[data-theme="dark"] .kset-toggle.on { background: #00FFAE; }
            .kset-knob {
              position: absolute;
              top: 2px;
              inset-inline-start: 2px;
              width: 18px; height: 18px;
              background: #FFFFFF;
              border-radius: 50%;
              transition: inset-inline-start 160ms;
              box-shadow: 0 1px 3px rgba(0,0,0,0.25);
            }
            .kset-toggle.on .kset-knob { inset-inline-start: 18px; }
            :root[data-theme="dark"] .kset-toggle.on .kset-knob { background: #04140E; }
            .kset-badge {
              font-family: var(--mono);
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.08em;
              color: var(--atlas, #0C6B4E);
              background: rgba(12, 107, 78, 0.10);
              border: 1px solid rgba(12, 107, 78, 0.20);
              padding: 3px 9px;
              border-radius: 999px;
              flex-shrink: 0;
            }
            :root[data-theme="dark"] .kset-badge {
              color: #00FFAE;
              background: rgba(0, 255, 174, 0.14);
              border-color: rgba(0, 255, 174, 0.28);
            }
          </style>

          <div class="kx-kpi-strip">
            <div class="kx-kpi">
              <div class="l">${tr({ fr: 'Établissement', en: 'Location', ar: 'المنشأة' })}</div>
              <div class="v" style="font-size:22px;">${venueTitle}</div>
            </div>
            <div class="kx-kpi">
              <div class="l">${tr({ fr: 'Activité', en: 'Business type', ar: 'نوع النشاط' })}</div>
              <div class="v" style="font-size:22px;">${tradeLabel}</div>
            </div>
            <div class="kx-kpi">
              <div class="l">${tr({ fr: 'Reçu de caisse', en: 'Receipt state', ar: 'حالة الوصل' })}</div>
              <div class="v" style="font-size:18px; color:var(--atlas);">${escape(receiptRowValue())}</div>
            </div>
            <div class="kx-kpi">
              <div class="l">${tr({ fr: 'Sécurité & Données', en: 'Security & Data', ar: 'الأمان والبيانات' })}</div>
              <div class="v" style="font-size:22px; color:var(--success, #0C6B4E);">${tr({ fr: 'Chiffrement actif', en: 'Encrypted', ar: 'مشفر' })}</div>
            </div>
          </div>

          <div class="gp-settings-grid">
            <!-- Card 1: Établissement -->
            <div class="gp-set-card">
              <div class="gp-set-card-head">
                <div class="gp-set-title">
                  ${materialSymbol('storefront')}
                  <span>${tr({ fr: 'Établissement & Boutique', en: 'Store & Business', ar: 'المنشأة والمتجر' })}</span>
                </div>
                <span class="gp-set-tag">${tr({ fr: 'Identité', en: 'Identity', ar: 'الهوية' })}</span>
              </div>
              <div>
                ${cv ? `
                ${settingsRow('storefront', venueTitle, tradeLabel, { action: 'settings-edit-venue' })}
                ${settingsRow('schedule', tr({ fr: 'Heures d\'ouverture', en: 'Opening hours', ar: 'ساعات العمل' }), escape(hoursRowValue(vd)), { action: 'settings-hours' })}
                ${settingsRow('track_changes', tr({ fr: 'Objectif journalier', en: 'Daily goal', ar: 'الهدف اليومي' }), vd.goal ? fmtN(vd.goal) + ' MAD' : tr({ fr: 'À définir', en: 'To set', ar: 'غير محدد' }), { action: 'settings-edit-venue' })}
                ` : `
                ${settingsRow('storefront', venueTitle, escape(getSet('venueLoc', tr({ fr: 'Emplacement principal', en: 'Main location', ar: 'الموقع الرئيسي' }))), { action: 'settings-edit-store', arg: 'venue' })}
                ${settingsRow('schedule', tr({ fr: 'Heures d\'ouverture', en: 'Opening hours', ar: 'ساعات العمل' }), escape(hoursRowValue(null)), { action: 'settings-hours' })}
                ${settingsRow('track_changes', tr({ fr: 'Objectif journalier', en: 'Daily goal', ar: 'الهدف اليومي' }), escape(getSet('goal', '28 000')) + ' MAD', { action: 'settings-edit-store', arg: 'goal' })}
                `}
              </div>
            </div>

            <!-- Card 2: Caisse & Paiements -->
            <div class="gp-set-card">
              <div class="gp-set-card-head">
                <div class="gp-set-title">
                  ${materialSymbol('receipt_long')}
                  <span>${tr({ fr: 'Caisse & Reçu', en: 'POS & Receipt', ar: 'الصندوق والوصل' })}</span>
                </div>
                <span class="gp-set-tag">${tr({ fr: 'Encaissement', en: 'Checkout', ar: 'الدفع' })}</span>
              </div>
              <div>
                ${settingsRow('receipt_long', tr({ fr: 'Reçu de caisse & Mentions légales', en: 'Receipt & Legal details', ar: 'وصل الصندوق والبيانات القانونية' }), escape(receiptRowValue()), { action: 'settings-receipt' })}
                ${settingsRow('credit_card', tr({ fr: 'Méthodes de paiement acceptées', en: 'Accepted payment methods', ar: 'وسائل الدفع المقبولة' }), escape(vd.methods || getSet('methods', 'Visa · Mastercard · Kiwi Tap · QR')), { action: cv ? 'settings-edit-venue' : 'settings-methods' })}
                ${settingsRow('paid', tr({ fr: 'Devise d\'affichage', en: 'Display currency', ar: 'عملة العرض' }), escape(getSet('currency', 'MAD · Dirham marocain')), { action: 'settings-currency' })}
              </div>
            </div>

            <!-- Card 3: Préférences d'affichage -->
            <div class="gp-set-card">
              <div class="gp-set-card-head">
                <div class="gp-set-title">
                  ${materialSymbol('language')}
                  <span>${tr({ fr: 'Affichage & Interface', en: 'Display & Preferences', ar: 'العرض والتفضيلات' })}</span>
                </div>
                <span class="gp-set-tag">${tr({ fr: 'Personnalisation', en: 'Design', ar: 'التخصيص' })}</span>
              </div>
              <div>
                ${settingsRow('language', tr({ fr: 'Langue de l\'application', en: 'App language', ar: 'لغة التطبيق' }), LANGNAME[lang] || 'Français', { action: 'settings-lang' })}
                ${(window.KiwiDesignIOS27 && window.KiwiDesignIOS27.isOn()) ? settingsRow('layers', 'Liquid Glass', ({ clear: tr({ fr: 'Clair', en: 'Clear', ar: 'شفاف' }), standard: tr({ fr: 'Standard', en: 'Standard', ar: 'قياسي' }), frosted: tr({ fr: 'Givré', en: 'Frosted', ar: 'مصنفر' }), opaque: tr({ fr: 'Opaque', en: 'Opaque', ar: 'معتم' }) })[window.KiwiDesignIOS27.getGlass()] || 'Standard', { action: 'glass-level' }) : ''}
                ${(document.documentElement.getAttribute('data-theme') === 'dark')
                  ? settingsRow('dark_mode', tr({ fr: 'Mode sombre', en: 'Dark mode', ar: 'الوضع الداكن' }), tr({ fr: 'Activé · Kiwi Ultra', en: 'On · Kiwi Ultra', ar: 'مفعّل · Kiwi Ultra' }), { badge: '✓' })
                  : settingsRow('dark_mode', tr({ fr: 'Mode sombre', en: 'Dark mode', ar: 'الوضع الداكن' }), tr({ fr: 'Interface nuit · confort du soir', en: 'Night interface · easy on the eyes', ar: 'واجهة ليلية · مريحة للعين' }), { action: 'settings-dark-ultra', badge: 'ULTRA' })}
                ${settingsRow('notifications', tr({ fr: 'Notifications WhatsApp', en: 'WhatsApp notifications', ar: 'إشعارات واتساب' }), tr({ fr: 'Résumé quotidien 19h', en: 'Daily summary 7pm', ar: 'ملخص يومي 19:00' }), { toggle: true, on: setOn('waNotif'), action: 'settings-toggle', arg: 'waNotif' })}
              </div>
            </div>

            <!-- Card 4: Sécurité & Intégrations -->
            <div class="gp-set-card">
              <div class="gp-set-card-head">
                <div class="gp-set-title">
                  ${materialSymbol('shield_lock')}
                  <span>${tr({ fr: 'Sécurité & Intégrations', en: 'Security & Integrations', ar: 'الأمان والتكاملات' })}</span>
                </div>
                <span class="gp-set-tag">${tr({ fr: 'Protection', en: 'Protection', ar: 'الحماية' })}</span>
              </div>
              <div>
                ${settingsRow('key', tr({ fr: 'Codes PIN de l\'équipe', en: 'Team PIN codes', ar: 'رموز الفريق' }), tr({ fr: 'Gérer les accès et rôles caisse', en: 'Manage till roles and access', ar: 'إدارة أدوار ووصول الصندوق' }), { action: 'nav-equipe' })}
                ${settingsRow('shield_lock', tr({ fr: 'Chiffrement des données', en: 'Data encryption', ar: 'تشفير البيانات' }), tr({ fr: 'En transit (TLS 1.3) et au repos', en: 'In transit (TLS 1.3) and at rest', ar: 'أثناء النقل وفي التخزين' }), { badge: tr({ fr: 'Certifié', en: 'Certified', ar: 'معتمد' }) })}
                ${settingsRow('file_upload', tr({ fr: 'Exporter mes données', en: 'Export my data', ar: 'تصدير بياناتي' }), tr({ fr: 'Ventes, produits, équipe · Fichier CSV', en: 'Sales, products, team · CSV file', ar: 'المبيعات والمنتجات والفريق · CSV' }), { action: 'export-csv' })}
                ${cv ? settingsRow('local_shipping', tr({ fr: 'Canaux de livraison', en: 'Delivery channels', ar: 'قنوات التوصيل' }), tr({ fr: 'Connectez Glovo, Yassir et votre compta', en: 'Connect Glovo, Yassir and accounting', ar: 'اربط Glovo وYassir ومحاسبتك' }), { action: 'add-integration' }) : `
                ${settingsRow('glovo', 'Glovo Delivery', tr({ fr: 'Connecté · Commandes en direct', en: 'Connected · Live orders', ar: 'متصل · طلبات مباشرة' }), { toggle: true, on: setOn('glovo'), action: 'settings-toggle', arg: 'glovo' })}
                ${settingsRow('yassir', 'Yassir Express', tr({ fr: 'Connecté · 24 commandes', en: 'Connected · 24 orders', ar: 'متصل · 24 طلبًا' }), { toggle: true, on: setOn('yassir'), action: 'settings-toggle', arg: 'yassir' })}
                ${settingsRow('accounting', tr({ fr: 'Comptabilité OCP', en: 'Accounting export', ar: 'المحاسبة' }), tr({ fr: 'Export automatique quotidien', en: 'Daily automatic export', ar: 'تصدير تلقائي يومي' }), { toggle: true, on: setOn('compta'), action: 'settings-toggle', arg: 'compta' })}
                `}
              </div>
            </div>
          </div>
        `,
      });
    },

    'glass-level': (el) => {
      const D = window.KiwiDesignIOS27;
      if (!D) return;
      const cur = D.getGlass();
      const L = {
        clear: tr({ fr: 'Clair', en: 'Clear', ar: 'شفاف' }),
        standard: tr({ fr: 'Standard', en: 'Standard', ar: 'قياسي' }),
        frosted: tr({ fr: 'Givré', en: 'Frosted', ar: 'مصنفر' }),
        opaque: tr({ fr: 'Opaque', en: 'Opaque', ar: 'معتم' }),
      };
      menu(el, ['clear', 'standard', 'frosted', 'opaque'].map((k) => ({
        label: L[k], active: cur === k,
        onClick: () => {
          D.setGlass(k);
          const val = el.querySelector('.kset-val');
          if (val) val.textContent = L[k];
          toast('Liquid Glass · ' + L[k], { type: 'success', force: true });
        },
      })));
    },

    /* Dark mode is a Kiwi Ultra perk. Instead of a dead lock, this hands the
     * merchant a real live preview of the (already-built) dark surface, then
     * routes to the upgrade flow. The *persistent* dark dashboard ships with
     * Ultra / the consolidated fusion view — this is the single-venue hook. */
    'settings-dark-ultra': () => {
      const de = document.documentElement;
      const orig = de.getAttribute('data-theme') || 'light';
      let reverted = false;
      const revert = () => { if (reverted) return; reverted = true; de.setAttribute('data-theme', orig); };
      const preview = () => {
        // Close any open drawer so the preview shows the pure dark dashboard,
        // not a light settings panel floating over it.
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
        de.setAttribute('data-theme', 'dark');
        toast(tr({ fr: 'Aperçu du mode sombre · réservé à Kiwi Ultra', en: 'Dark-mode preview · Kiwi Ultra only', ar: 'معاينة الوضع الداكن · حصريًا لـ Kiwi Ultra' }), { type: 'info', force: true });
        setTimeout(() => {
          revert();
          toast(tr({ fr: 'Aperçu terminé, Ultra pour le garder', en: 'Preview over, go Ultra to keep it', ar: 'انتهت المعاينة، انتقل إلى Ultra للاحتفاظ به' }), { type: 'info', force: true });
        }, 6000);
      };
      const check = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><path d="M20 6L9 17l-5-5"/></svg>';
      const feat = (t) => `<div style="display:flex; gap:10px; align-items:flex-start; font-size:13.5px; line-height:1.45; color:var(--ink);">${check}<span>${t}</span></div>`;
      const m = modal({
        tag: 'KIWI ULTRA',
        title: tr({ fr: 'Le mode sombre fait partie de Kiwi Ultra', en: 'Dark mode is part of Kiwi Ultra', ar: 'الوضع الداكن جزء من Kiwi Ultra' }),
        desc: tr({ fr: 'Une interface nuit pensée pour le service du soir et la vue consolidée multi-établissements.', en: 'A night interface built for evening service and the consolidated multi-site view.', ar: 'واجهة ليلية مصمّمة لخدمة المساء والعرض الموحّد متعدد الفروع.' }),
        width: 440,
        body: `<div style="display:flex; flex-direction:column; gap:13px; margin-top:2px;">
          ${feat(tr({ fr: 'Confort visuel du soir, moins de fatigue en service', en: 'Easy on the eyes at night, less fatigue in service', ar: 'راحة بصرية مساءً, إرهاق أقل أثناء الخدمة' }))}
          ${feat(tr({ fr: 'Vue Portefeuille consolidée multi-établissements', en: 'Consolidated multi-site portfolio view', ar: 'عرض محفظة موحّد متعدد الفروع' }))}
          ${feat(tr({ fr: 'Se synchronise sur tous vos appareils Kiwi', en: 'Syncs across all your Kiwi devices', ar: 'يتزامن عبر جميع أجهزة Kiwi لديك' }))}
        </div>`,
        foot: `
          <button class="kb ghost" data-dark-preview type="button">${tr({ fr: 'Aperçu 6 s', en: 'Preview 6s', ar: 'معاينة 6 ثوانٍ' })}</button>
          <button class="kb atlas" data-dark-upgrade type="button">${tr({ fr: 'Passer à Ultra →', en: 'Go Ultra →', ar: 'الانتقال إلى Ultra ←' })}</button>
        `,
      });
      const pv = m.el.querySelector('[data-dark-preview]');
      const up = m.el.querySelector('[data-dark-upgrade]');
      if (pv) pv.onclick = () => { m.close(); preview(); };
      if (up) up.onclick = () => { revert(); m.close(); if (handlers['upgrade-pro']) handlers['upgrade-pro'](); };
    },

    'settings-lang': (el) => {
      const I18 = window.KiwiI18n;
      const cur = (I18 && I18.getLang && I18.getLang()) || 'fr';
      const pick = (l) => {
        if (I18 && I18.setLang) I18.setLang(l);
        // The settings drawer's own text isn't data-i18n bound — close it so
        // it re-opens fresh in the new language.
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
      };
      menu(el, [
        { label: 'Français', active: cur === 'fr', onClick: () => pick('fr') },
        { label: 'English',  active: cur === 'en', onClick: () => pick('en') },
        { label: 'العربية',  active: cur === 'ar', onClick: () => pick('ar') },
      ]);
    },

    'settings-toggle': (el, arg) => {
      const tg = el && el.querySelector('[data-kset-toggle]');
      if (!tg) return;
      const on = !tg.classList.contains('on');
      tg.classList.toggle('on', on);
      if (arg) { try { localStorage.setItem('kiwiSet:' + arg, on ? '1' : '0'); } catch (_) {} }
    },

    'settings-soon': () => {},

    /* The default Café Atlas demo venue is customizable via kiwiSet:* localStorage
     * overrides (no custom-venue account needed). Each editor persists, then
     * re-opens Settings so the new value shows immediately. */
    'settings-edit-store': (el, which) => {
      const get = (k, def) => { try { return localStorage.getItem('kiwiSet:' + k) || def; } catch (_) { return def; } };
      const set = (k, v) => { try { localStorage.setItem('kiwiSet:' + k, v); } catch (_) {} };
      const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
      const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
      const CFG = {
        venue: { tag: 'MA BOUTIQUE', title: tr({ fr: 'Nom & emplacement', en: 'Name & location', ar: 'الاسم والموقع' }), fields: [
          { k: 'venueName', label: tr({ fr: 'Nom de la boutique', en: 'Shop name', ar: 'اسم المتجر' }), def: ((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && (window.KiwiVenue.getCurrentVenueData() || {}).fullDisplay) || (window.KiwiMe && window.KiwiMe.business) || (window.KiwiEnv?.isReal?.() ? '' : 'Café Atlas · Maarif')), max: 40 },
          { k: 'venueLoc',  label: tr({ fr: 'Emplacement', en: 'Location', ar: 'الموقع' }), def: 'Emplacement principal', max: 40 } ] },
        /* `hours` n'est plus ici. Un champ libre supprimé d'un écran mais laissé
         * dans la table reste atteignable par un lien profond ou un bouton
         * oublié, et il suffit d'une seule saisie « 12-02 » pour que le produit
         * reparte avec deux horaires contradictoires. La clé est donc redirigée
         * vers l'éditeur structuré, plus bas. */
        goal: { tag: tr({ fr: 'OBJECTIF', en: 'GOAL', ar: 'الهدف' }), title: tr({ fr: 'Objectif journalier', en: 'Daily goal', ar: 'الهدف اليومي' }), hint: tr({ fr: 'Met à jour la barre d\'objectif du tableau de bord.', en: 'Updates the dashboard goal bar.', ar: 'يُحدّث شريط الهدف في لوحة التحكم.' }), fields: [
          { k: 'goal', label: tr({ fr: 'Chiffre d\'affaires visé par jour · MAD', en: 'Target revenue per day · MAD', ar: 'رقم المعاملات المستهدف يوميًا · درهم' }), def: '28 000', type: 'number' } ] },
      };
      /* Tout appel restant sur `hours` atterrit sur l'écran structuré. */
      if (which === 'hours') { try { return handlers['settings-hours'](); } catch (_) { return; } }
      const cfg = CFG[which]; if (!cfg) return;
      const body = '<style>.ks-field:focus{border-color:var(--atlas)!important;}</style>' + cfg.fields.map((f, i) =>
        `<label style="${lbl}${i === 0 ? 'margin-top:2px;' : ''}">${f.label}</label>` +
        `<input class="ks-field" data-f="${f.k}" ${f.type === 'number' ? 'type="number" inputmode="numeric" min="0"' : `maxlength="${f.max}"`} style="${fld}"/>`
      ).join('') + (cfg.hint ? `<div style="font-size:12px;color:var(--n-500);margin-top:14px;line-height:1.5;">${cfg.hint}</div>` : '');
      const m = modal({ tag: cfg.tag, title: cfg.title, width: 460, body,
        foot: `<button class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${tr({ fr: 'Enregistrer', en: 'Save', ar: 'حفظ' })}</button>` });
      cfg.fields.forEach((f) => {
        const cur = get(f.k, f.def);
        m.el.querySelector(`[data-f="${f.k}"]`).value = f.type === 'number' ? String(cur).replace(/[^\d]/g, '') : cur;
      });
      setTimeout(() => m.el.querySelector('.ks-field') && m.el.querySelector('.ks-field').focus(), 320);
      m.el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-save]')) return;
        cfg.fields.forEach((f) => {
          let v = (m.el.querySelector(`[data-f="${f.k}"]`).value || '').trim();
          if (!v) return;
          if (f.type === 'number') v = (+v.replace(/[^\d]/g, '') || 0).toLocaleString('fr-FR').replace(/[^\d ]/g, ' ');
          set(f.k, v);
        });
        m.close();
        if (which === 'goal' && window.KiwiDateRange) { try { window.KiwiDateRange.setDateRange(window.KiwiDateRange.getDateRange()); } catch (_) {} }
        setTimeout(() => handlers.settings(), 90);
        toast(tr({ fr: 'Réglage enregistré', en: 'Setting saved', ar: 'تم حفظ الإعداد' }), { type: 'success', force: true });
      });
    },

    /* Multi-select payment methods. */
    'settings-methods': () => {
      const cur = (() => { try { return localStorage.getItem('kiwiSet:methods') || 'Visa · MC · Kiwi Tap · QR'; } catch (_) { return 'Visa · MC · Kiwi Tap · QR'; } })();
      const OPTS = ['Visa', 'Mastercard', 'Kiwi Tap', 'QR', 'Espèces', 'CMI'];
      const on = (o) => cur.includes(o) || (o === 'Mastercard' && /\bMC\b/.test(cur)) || (o === 'Espèces' && /cash|espèces/i.test(cur));
      const rowS = 'display:flex;align-items:center;gap:11px;padding:12px 4px;border-bottom:1px solid var(--n-200);cursor:pointer;font-size:14px;color:var(--ink);';
      const m = modal({ tag: tr({ fr: 'PAIEMENTS', en: 'PAYMENTS', ar: 'المدفوعات' }), title: tr({ fr: 'Méthodes acceptées', en: 'Accepted methods', ar: 'طرق الدفع المقبولة' }), width: 420,
        body: OPTS.map((o) => `<label style="${rowS}"><input type="checkbox" data-mth="${escape(o)}" ${on(o) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--atlas);flex-shrink:0;"/>${escape(o)}</label>`).join(''),
        foot: `<button class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${tr({ fr: 'Enregistrer', en: 'Save', ar: 'حفظ' })}</button>` });
      m.el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-save]')) return;
        const sel = [...m.el.querySelectorAll('[data-mth]:checked')].map((c) => c.getAttribute('data-mth'));
        try { localStorage.setItem('kiwiSet:methods', sel.length ? sel.join(' · ') : tr({ fr: 'Aucune', en: 'None', ar: 'لا شيء' })); } catch (_) {}
        m.close();
        setTimeout(() => handlers.settings(), 90);
        toast(tr({ fr: 'Méthodes mises à jour', en: 'Methods updated', ar: 'تم تحديث طرق الدفع' }), { type: 'success', force: true });
      });
    },

    /* Display-currency preference picker. */
    'settings-currency': (el) => {
      const cur = (() => { try { return localStorage.getItem('kiwiSet:currency') || 'MAD · Dirham marocain'; } catch (_) { return 'MAD · Dirham marocain'; } })();
      const pick = (v) => {
        try { localStorage.setItem('kiwiSet:currency', v); } catch (_) {}
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
        setTimeout(() => handlers.settings(), 110);
        toast(tr({ fr: 'Devise mise à jour', en: 'Currency updated', ar: 'تم تحديث العملة' }), { type: 'success', force: true });
      };
      menu(el, [
        { label: 'MAD · Dirham marocain', active: cur.startsWith('MAD'), onClick: () => pick('MAD · Dirham marocain') },
        { label: 'EUR · Euro',            active: cur.startsWith('EUR'), onClick: () => pick('EUR · Euro') },
        { label: 'USD · Dollar US',       active: cur.startsWith('USD'), onClick: () => pick('USD · Dollar US') },
        { label: 'GBP · Livre sterling',  active: cur.startsWith('GBP'), onClick: () => pick('GBP · Livre sterling') },
      ]);
    },

    /* Les horaires d'ouverture — l'écran structuré, et le seul.
     * Il remplace quatre champs de texte libre qui coexistaient (cette fiche,
     * Mon profil, la question d'onboarding boutique, le réglage de démo) et
     * qu'aucun module ne pouvait lire. Order Pro, Réservations, la caisse, le
     * rapport journalier et l'assistant interrogent tous KiwiHours ; ils n'ont
     * pas de réglage à eux, par construction.
     *
     * `legacy` : l'ancienne valeur libre, montrée en haut de l'éditeur pour que
     * le propriétaire sache CE QU'IL remplace. On ne l'interprète pas — « 12-02 »
     * n'a pas de lecture sûre, et deviner ici serait exactement l'erreur que ce
     * chantier corrige. Elle est effacée une fois la semaine enregistrée. */
    'settings-hours': () => {
      if (!window.KiwiHoursUI || !window.KiwiHours) return;
      const KV = window.KiwiVenue;
      const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
      const legacy = window.KiwiHours.isConfigured()
        ? ''
        : (vd.hours || (() => { try { return localStorage.getItem('kiwiSet:hours') || ''; } catch (_) { return ''; } })());
      window.KiwiHoursUI.open({
        venueId: (KV && KV.getVenue && KV.getVenue()) || null,
        title: vd.fullDisplay || vd.name || '',
        legacy,
        onSave: () => {
          /* Le vestige a fini son office : il disparaît, pour qu'aucun écran ne
           * puisse plus afficher deux horaires différents du même commerce. */
          try { localStorage.removeItem('kiwiSet:hours'); } catch (_) {}
          try {
            if (vd.hours && KV && KV.updateVenue) KV.updateVenue(KV.getVenue(), { hours: '' });
          } catch (_) {
            if (typeof Kiwi !== 'undefined' && Kiwi.toast) {
              Kiwi.toast('Erreur de réinitialisation des horaires', { type: 'warn', force: true });
            }
          }
          document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
          setTimeout(() => { try { handlers.settings(); } catch (_) {} }, 110);
        },
      });
    },

    /* Le reçu de caisse. Un seul écran, ouvert d'ici comme depuis la fiche
     * établissement — c'est le MÊME éditeur et la MÊME fiche, pas deux réglages
     * qui se ressemblent. Le raccourci « Modifier la fiche » renvoie vers Mon
     * profil, où les mentions légales se saisissent une fois pour toutes. */
    'settings-receipt': () => {
      if (!window.KiwiReceiptUI || !window.KiwiReceipt) return;
      const KV = window.KiwiVenue;
      const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
      window.KiwiReceiptUI.open({
        venueId: (KV && KV.getVenue && KV.getVenue()) || null,
        title: vd.fullDisplay || vd.name || '',
        onEditBusiness: () => { try { handlers['account-profile'](); } catch (_) {} },
        onSave: () => {
          document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
          setTimeout(() => { try { handlers.settings(); } catch (_) {} }, 110);
        },
      });
    },

    /* Edit a user-created venue's identity from Settings → Boutique. */
    'settings-edit-venue': () => {
      const KV = window.KiwiVenue;
      if (!KV || !KV.isCustom || !KV.isCustom()) return;
      const vd = KV.getCurrentVenueData() || {};
      const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
      const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
      /* Le MÉTIER se modifie ici aussi. Il était gravé à l'inscription : un
       * café qui devient restaurant, une boutique qui ouvre un salon, une
       * erreur au premier jour — il n'existait aucun écran pour le dire, et la
       * fiche établissement offrait à la place un champ libre qui ne changeait
       * rien. Liste unique (assets/trades.js), la même qu'à l'inscription. */
      const KT = window.KiwiTrades;
      const curTrade = KT ? KT.resolve(vd.subtype || vd.type) : '';
      const m = modal({
        tag: 'MA BOUTIQUE',
        title: 'Modifier votre activité',
        width: 460,
        body: `
          <style>.ev-field:focus{border-color:var(--atlas)!important;}</style>
          <label style="${lbl}margin-top:2px;">Nom de l'activité</label>
          <input class="ev-field" data-ev-name style="${fld}" maxlength="40"/>
          ${KT ? `
          <label style="${lbl}">${tr({ fr: "Type d'activité", en: 'Type of business', ar: 'نوع النشاط' })}</label>
          <select class="ev-field" data-ev-trade style="${fld}">${KT.options(curTrade)}</select>
          <p style="font-size:11.5px;color:var(--n-500);margin:6px 0 0;line-height:1.45;">${tr({
            fr: 'Détermine les écrans de ce commerce · carte et tables, catalogue et codes-barres, prestations, chambres.',
            en: 'Decides this business’s screens · menu and tables, catalogue and barcodes, treatments, rooms.',
            ar: 'يحدّد شاشات هذا النشاط.' })}</p>` : ''}
          <label style="${lbl}">Ville</label>
          <input class="ev-field" data-ev-city style="${fld}" maxlength="30"/>
          <label style="${lbl}">Objectif de chiffre d'affaires par jour <span style="color: var(--n-500);font-weight:400;">· MAD</span></label>
          <input class="ev-field" data-ev-goal type="number" inputmode="numeric" style="${fld}" min="0"/>
        `,
        foot: `<button class="kb atlas" data-ev-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">Enregistrer</button>`,
      });
      m.el.querySelector('[data-ev-name]').value = vd.name || '';
      m.el.querySelector('[data-ev-city]').value = vd.location || '';
      m.el.querySelector('[data-ev-goal]').value = vd.goal || '';
      setTimeout(() => m.el.querySelector('[data-ev-name]').focus(), 320);
      m.el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-ev-save]')) return;
        const name = (m.el.querySelector('[data-ev-name]').value || '').trim();
        if (!name) { toast(tr({fr:'Le nom de l\'activité est requis', en:'Activity name is required', ar:'اسم النشاط مطلوب'}), { type: 'warn', force: true }); return; }
        const tsel = m.el.querySelector('[data-ev-trade]');
        const trade = tsel && KT ? KT.resolve(tsel.value) : '';
        /* Plus de `hours` ici : les horaires ne sont plus une ligne de texte de
         * cette fiche, ils ont leur propre écran structuré (settings-hours). */
        KV.updateVenue(KV.getVenue(), {
          name,
          subtype:  trade || null,
          location: m.el.querySelector('[data-ev-city]').value,
          goal:     m.el.querySelector('[data-ev-goal]').value,
        });
        m.close();
        // The Settings drawer behind now holds stale values — close it too.
        document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => b.__kiwiClose && b.__kiwiClose());
        toast(tr({fr:'Boutique mise à jour', en:'Shop updated', ar:'تم تحديث المتجر'}), { type: 'success', force: true });
      });
    },

    /* ─── Onboarding wizard — create the merchant's own (blank) dashboard.
     * Reached by entering PIN 0000 at the lock screen. ─── */
    'onboard': () => {
      let picked = 'restaurant';
      /* Material Symbols (Outlined, 400, grade 0, grille 24), recopiés depuis
       * assets/icons/material/ — voir le README de ce dossier. Forme pleine,
       * viewBox natif 0 -960 960 960 : la CSS pilote `color`, pas `stroke`. */
      const mi = (d) => `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
      // Each visible type maps to a data vertical (`base`); the specific label
      // is what the merchant sees. `primary` types show first. THE list is
      // assets/trades.js — this literal is the parachute, and it is also why
      // the lists drifted: it offered « traiteur » and « librairie », which
      // assets/venues.js could not map to any vertical.
      const KT = window.KiwiTrades;
      const TYPES = (KT && KT.all().map((t) => ({ id: t.id, base: t.base, primary: t.primary, label: KT.label(t.id), icon: t.icon }))) || [
        { id: 'restaurant', base: 'restaurant', primary: true, label: 'Restaurant',          /* restaurant.svg */ icon: mi('M280-80v-366q-51-14-85.5-56T160-600v-280h80v280h40v-280h80v280h40v-280h80v280q0 56-34.5 98T360-446v366h-80Zm400 0v-320H560v-280q0-83 58.5-141.5T760-880v800h-80Z') },
        { id: 'boutique',   base: 'boutique',   primary: true, label: 'Boutique',            /* storefront.svg */ icon: mi('M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z') },
        { id: 'spa',        base: 'spa',        primary: true, label: tr({fr:'Spa / Bien-être', en:'Spa / Wellness', ar:'سبا / عافية'}),     /* spa.svg */ icon: mi('M480-80q-73-9-145-39.5T206.5-207Q150-264 115-351T80-560v-40h40q51 0 105 13t101 39q12-86 54.5-176.5T480-880q57 65 99.5 155.5T634-548q47-26 101-39t105-13h40v40q0 122-35 209t-91.5 144q-56.5 57-128 87.5T480-80Zm-2-82q-11-166-98.5-251T162-518q11 171 101.5 255T478-162Zm2-254q15-22 36.5-45.5T558-502q-2-57-22.5-119T480-742q-35 59-55.5 121T402-502q20 17 42 40.5t36 45.5Zm78 236q37-12 77-35t74.5-62.5q34.5-39.5 59-98.5T798-518q-94 14-165 62.5T524-332q12 32 20.5 70t13.5 82Zm-78-236Zm78 236Zm-80 18Zm46-170ZM480-80Z') },
        { id: 'cafe',       base: 'restaurant',                label: tr({fr:'Café / Salon de thé', en:'Café / Tea room', ar:'مقهى / صالون شاي'}), /* local_cafe.svg */ icon: mi('M160-120v-80h640v80H160Zm160-160q-66 0-113-47t-47-113v-400h640q33 0 56.5 23.5T880-760v120q0 33-23.5 56.5T800-560h-80v120q0 66-47 113t-113 47H320Zm0-80h240q33 0 56.5-23.5T640-440v-320H240v320q0 33 23.5 56.5T320-360Zm400-280h80v-120h-80v120ZM320-360h-80 400-320Z') },
        { id: 'fastfood',   base: 'restaurant',                label: tr({fr:'Fast-food / Snack', en:'Fast food / Snack', ar:'وجبات سريعة / سناك'}),   /* lunch_dining.svg */ icon: mi('M160-120q-33 0-56.5-23.5T80-200v-120h800v120q0 33-23.5 56.5T800-120H160Zm0-120v40h640v-40H160Zm263-160q-21 20-77 20t-76-20q-20-20-56-20t-57 20q-21 20-77 20v-80q36 0 57-20t77-20q56 0 76 20t56 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 56-20t76-20q56 0 79 20t55 20v80q-56 0-75-20t-55-20q-36 0-58 20t-78 20q-56 0-77-20t-57-20q-36 0-57 20ZM80-560v-40q0-115 108.5-177.5T480-840q183 0 291.5 62.5T880-600v40H80Zm400-200q-124 0-207.5 31T166-640h628q-23-58-106.5-89T480-760Zm0 520Zm0-400Z') },
        { id: 'bakery',     base: 'restaurant',                label: tr({fr:'Boulangerie', en:'Bakery', ar:'مخبزة'}),         /* bakery_dining.svg */ icon: mi('M804-282q17 9 30-4t4-30l-58-108-42 108 66 34Zm-200-38h48l96-238q3-8-1.5-13.5T736-580l-80-32q-9-3-17.5 2T628-596l-24 276Zm-296 0h48l-24-276q-2-11-10.5-15t-17.5-1l-80 32q-8 3-11.5 8.5T212-558l96 238Zm-152 38 66-34-42-108-58 108q-9 17 4 30t30 4Zm280-38h88l30-338q2-9-4.5-15.5T534-680H426q-8 0-14.5 6.5T406-658l30 338ZM138-200q-42 0-70-31.5T40-306q0-12 3.5-23.5T52-352l88-168q-14-40 1-79t53-55l80-32q14-5 28-7t28 1q14-29 39-48.5t57-19.5h108q32 0 57 19.5t39 48.5q14-2 28-.5t28 6.5l80 32q40 16 56 55t-2 77l88 168q6 11 9 23t3 25q0 45-30.5 75.5T814-200q-11 0-22-2.5t-22-7.5l-62-30H250l-56 30q-13 7-27.5 8.5T138-200Zm342-280Z') },
        { id: 'pizzeria',   base: 'restaurant',                label: 'Pizzeria',            /* local_pizza.svg */ icon: mi('M480-80 80-680q85-72 186.5-116T480-840q112 0 213.5 43.5T880-680L480-80Zm0-144 292-438q-65-45-139-71.5T480-760q-79 0-152.5 26.5T188-662l292 438Zm-57.5-353.5Q440-595 440-620t-17.5-42.5Q405-680 380-680t-42.5 17.5Q320-645 320-620t17.5 42.5Q355-560 380-560t42.5-17.5Zm100 200Q540-395 540-420t-17.5-42.5Q505-480 480-480t-42.5 17.5Q420-445 420-420t17.5 42.5Q455-360 480-360t42.5-17.5ZM480-224Z') },
        { id: 'traiteur',   base: 'restaurant',                label: tr({fr:'Traiteur', en:'Caterer', ar:'خدمات تقديم الطعام'}),            /* room_service.svg */ icon: mi('M80-200v-80h800v80H80Zm40-120v-40q0-128 78.5-226T400-710v-10q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720v10q124 26 202 124t78 226v40H120Zm82-80h556q-14-104-93-172t-185-68q-106 0-184.5 68T202-400Zm278 0Z') },
        { id: 'foodtruck',  base: 'restaurant',                label: 'Food truck',          /* local_shipping.svg */ icon: mi('M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q280-263 280-280t-11.5-28.5Q257-320 240-320t-28.5 11.5Q200-297 200-280t11.5 28.5Q223-240 240-240t28.5-11.5ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm628.5 108.5Q760-263 760-280t-11.5-28.5Q737-320 720-320t-28.5 11.5Q680-297 680-280t11.5 28.5Q703-240 720-240t28.5-11.5ZM680-440h170l-90-120h-80v120ZM360-540Z') },
        { id: 'epicerie',   base: 'boutique',                  label: tr({fr:'Épicerie', en:'Grocery', ar:'بقالة'}),            /* local_grocery_store.svg */ icon: mi('M223.5-103.5Q200-127 200-160t23.5-56.5Q247-240 280-240t56.5 23.5Q360-193 360-160t-23.5 56.5Q313-80 280-80t-56.5-23.5Zm400 0Q600-127 600-160t23.5-56.5Q647-240 680-240t56.5 23.5Q760-193 760-160t-23.5 56.5Q713-80 680-80t-56.5-23.5ZM246-720l96 200h280l110-200H246Zm-38-80h590q23 0 35 20.5t1 41.5L692-482q-11 20-29.5 31T622-440H324l-44 80h480v80H280q-45 0-68-39.5t-2-78.5l54-98-144-304H40v-80h130l38 80Zm134 280h280-280Z') },
        { id: 'pharmacie',  base: 'boutique',                  label: 'Pharmacie',           /* local_pharmacy.svg */ icon: mi('M120-120v-80l80-240-80-240v-80h508l58-160 94 34-46 126h106v80l-80 240 80 240v80H120Zm320-160h80v-120h120v-80H520v-120h-80v120H320v80h120v120Zm-236 80h552l-80-240 80-240H204l80 240-80 240Zm276-240Z') },
        { id: 'librairie',  base: 'boutique',                  label: tr({fr:'Librairie', en:'Bookshop', ar:'مكتبة'}),           /* menu_book.svg */ icon: mi('M560-564v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-600q-38 0-73 9.5T560-564Zm0 220v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-380q-38 0-73 9t-67 27Zm0-110v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-490q-38 0-73 9.5T560-454ZM260-320q47 0 91.5 10.5T440-278v-394q-41-24-87-36t-93-12q-36 0-71.5 7T120-692v396q35-12 69.5-18t70.5-6Zm260 42q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394Zm-40 118q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740q51-30 106.5-45T700-800q52 0 102 12t96 36q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59ZM280-494Z') },
        { id: 'fleuriste',  base: 'boutique',                  label: tr({fr:'Fleuriste', en:'Florist', ar:'محل أزهار'}),           /* local_florist.svg */ icon: mi('M480-600q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm-70.5 218.5Q378-403 364-438q-5 0-9 .5t-9 .5q-52 0-89-37t-37-89q0-21 7-40.5t21-36.5q-13-17-20-36.5t-7-40.5q0-52 36.5-89t88.5-37q5 0 9 .5t9 .5q14-35 45.5-56.5T480-920q39 0 70.5 21.5T596-842q5 0 9-.5t9-.5q52 0 88.5 37t36.5 89q0 21-6.5 40.5T712-640q13 17 20 36.5t7 40.5q0 52-36.5 89T614-437q-5 0-9-.5t-9-.5q-14 35-45.5 56.5T480-360q-39 0-70.5-21.5ZM480-80q0-74 28.5-139.5T586-334q49-49 114.5-77.5T840-440q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm98-98q57-21 100-64t64-100q-57 21-100 64t-64 100Zm-98 98q0-74-28.5-139.5T374-334q-49-49-114.5-77.5T120-440q0 74 28.5 139.5T226-186q49 49 114.5 77.5T480-80Zm-98-98q-57-21-100-64t-64-100q57 21 100 64t64 100Zm196 0Zm-196 0Zm232-339q19 0 32.5-13.5T660-563q0-14-7.5-24.5T633-604l-35-17q-2 11-6 21.5t-9 19.5q-5 9-12 17t-15 15l32 23q5 4 11.5 6t14.5 2Zm-16-142 35-17q12-6 19-17t7-24q0-19-13-32.5T614-763q-8 0-14 2t-12 6l-33 23q8 7 15.5 15t12.5 17q5 9 9 19.5t6 21.5Zm-159-93q10-4 20-6t21-2q11 0 21 2t20 6l5-44q2-18-12.5-31T480-840q-19 0-33.5 13T434-796l5 44Zm41 312q19 0 33.5-13t12.5-31l-5-44q-10 4-20 6t-21 2q-11 0-21-2t-20-6l-5 44q-2 18 12.5 31t33.5 13ZM362-659q2-11 6-21.5t9-19.5q5-9 12-17t15-15l-32-23q-5-4-11.5-6t-14.5-2q-19 0-32.5 13.5T300-717q0 13 7.5 24t19.5 17l35 17Zm-16 141q8 0 14-1.5t12-6.5l33-22q-8-7-15.5-15T377-580q-5-9-9-19.5t-6-21.5l-35 17q-12 6-19 17t-7 24q1 19 13.5 32t31.5 13Zm237-62Zm0-120Zm-103-60Zm0 240ZM377-700Zm0 120Z') },
        { id: 'maison',     base: 'boutique',                  label: tr({fr:'Maison', en:'Home', ar:'المنزل'}), /* home_and_garden.svg */ icon: mi('M160-160v-375l-72 55-47-63 439-337 440 336-48 64-392-300-240 184v356h160v80H160Zm540 95q-42 29-92.5 24.5T521-81q-36-36-40.5-86.5T505-260q-29-42-24.5-92.5T521-439q36-36 86.5-40.5T700-455q42-29 92.5-24.5T879-439q36 36 40.5 86.5T895-260q29 42 24.5 92.5T879-81q-36 36-86.5 40.5T700-65Zm0-98 46 32q18 13 39 11t37-18q16-16 18-37t-11-39l-32-46 32-46q13-18 11-39t-18-37q-16-16-37-18t-39 11l-46 32-46-32q-18-13-39-11t-37 18q-16 16-18 37t11 39l32 46-32 46q-13 18-11 39t18 37q16 16 37 18t39-11l46-32Zm35.5-61.5Q750-239 750-260t-14.5-35.5Q721-310 700-310t-35.5 14.5Q650-281 650-260t14.5 35.5Q679-210 700-210t35.5-14.5ZM480-470Zm220 210Z') },
        { id: 'coiffure',   base: 'spa',                       label: tr({fr:'Salon de coiffure', en:'Hair salon', ar:'صالون حلاقة'}),   /* content_cut.svg */ icon: mi('M760-120 480-400l-94 94q8 15 11 32t3 34q0 66-47 113T240-80q-66 0-113-47T80-240q0-66 47-113t113-47q17 0 34 3t32 11l94-94-94-94q-15 8-32 11t-34 3q-66 0-113-47T80-720q0-66 47-113t113-47q66 0 113 47t47 113q0 17-3 34t-11 32l494 494v40H760ZM600-520l-80-80 240-240h120v40L600-520ZM296.5-663.5Q320-687 320-720t-23.5-56.5Q273-800 240-800t-56.5 23.5Q160-753 160-720t23.5 56.5Q207-640 240-640t56.5-23.5ZM494-466q6-6 6-14t-6-14q-6-6-14-6t-14 6q-6 6-6 14t6 14q6 6 14 6t14-6ZM296.5-183.5Q320-207 320-240t-23.5-56.5Q273-320 240-320t-56.5 23.5Q160-273 160-240t23.5 56.5Q207-160 240-160t56.5-23.5Z') },
        { id: 'sport',      base: 'spa',                       label: tr({fr:'Salle de sport', en:'Gym', ar:'صالة رياضية'}),      /* fitness_center.svg */ icon: mi('m536-84-56-56 142-142-340-340-142 142-56-56 56-58-56-56 84-84-56-58 56-56 58 56 84-84 56 56 58-56 56 56-142 142 340 340 142-142 56 56-56 58 56 56-84 84 56 58-56 56-58-56-84 84-56-56-58 56Z') },
      ];
      const moreCount = TYPES.filter((t) => !t.primary).length;
      const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
      const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
      const m = modal({
        tag: 'BIENVENUE SUR KIWI',
        title: 'Configurez votre tableau de bord',
        desc: 'Une minute pour créer le vôtre, vide, prêt à se remplir avec vos vraies ventes.',
        width: 520,
        body: `
          <style>
            .ob-type{display:flex;flex-direction:column;align-items:center;gap:7px;padding:14px 8px;
              border:1px solid var(--n-200);border-radius:12px;background:var(--surface);cursor:pointer;
              font-family:var(--sans);font-size:12px;font-weight:500;color:var(--n-600);text-align:center;
              transition:border-color 140ms,background 140ms,color 140ms;}
            .ob-type svg{width:24px;height:24px;}
            .ob-type:hover{border-color: var(--n-400);}
            .ob-type.sel{border-color:var(--atlas);background:rgba(11,110,79,0.05);color:var(--atlas);}
            .ob-type.ob-more{display:none;}
            .ob-morebtn{margin-top:8px;width:100%;padding:9px;border:1px dashed var(--n-300);
              border-radius:10px;background:var(--surface);cursor:pointer;font-family:var(--sans);font-size:12.5px;
              font-weight:500;color:var(--n-600);transition:border-color 140ms,color 140ms;}
            .ob-morebtn:hover{border-color:var(--atlas);color:var(--atlas);}
            .ob-field:focus{border-color:var(--atlas)!important;}
          </style>
          <label style="${lbl}margin-top:4px;">Type d'activité</label>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            ${TYPES.map((t) => `<button type="button" class="ob-type${t.id === picked ? ' sel' : ''}${t.primary ? '' : ' ob-more'}" data-ob-type="${t.id}">${t.icon}<span>${t.label}</span></button>`).join('')}
          </div>
          <button type="button" class="ob-morebtn" data-ob-more>+ Plus de types (${moreCount})</button>
          <label style="${lbl}">Nom de l'activité</label>
          <input class="ob-field" data-ob-name placeholder="Ex. Café des Oudayas" style="${fld}" maxlength="40"/>
          <label style="${lbl}">Ville</label>
          <input class="ob-field" data-ob-city placeholder="Ex. Rabat" style="${fld}" maxlength="30"/>
          <label style="${lbl}">Objectif de chiffre d'affaires par jour <span style="color: var(--n-500);font-weight:400;">· optionnel</span></label>
          <input class="ob-field" data-ob-goal type="number" inputmode="numeric" placeholder="Ex. 5000 MAD" style="${fld}" min="0"/>
        `,
        foot: `<button class="kb atlas" data-ob-create type="button" style="width:100%;justify-content:center;padding:13px;font-size:15px;">Créer mon tableau de bord →</button>`,
      });
      const nameInput = m.el.querySelector('[data-ob-name]');
      setTimeout(() => nameInput && nameInput.focus(), 320);
      m.el.querySelectorAll('[data-ob-type]').forEach((x) => x.classList.toggle('sel', x.dataset.obType === picked));
      /* Step-1 values, captured before the body swaps to step 2. */
      let step1 = null;
      const doCreate = (answers) => {
        const { name, city, goal, def } = step1;
        let id = null;
        try {
          id = window.KiwiVenue?.createVenue?.({
            type: def.base, subtype: def.id,
            name, location: city, goal, profile: answers,
          });
        } catch (_) {}
        if (!id) { toast(tr({fr:'Création impossible', en:'Creation failed', ar:'تعذّر الإنشاء'}), { type: 'warn', force: true }); return; }
        m.close();
        try { window.KiwiVenue.setVenue(id); } catch (_) {}
        // A brand-new venue should land on "Aujourd'hui", not a stale range.
        const todayPill = document.querySelector('[data-action="date-range"][data-range="aujourdhui"]');
        if (todayPill && !todayPill.classList.contains('on')) todayPill.click();
        confetti();
        toast(tr({fr:'Votre tableau de bord est prêt', en:'Your dashboard is ready', ar:'لوحة التحكم جاهزة'}), { type: 'success', force: true,
          desc: `${name}, ${answers
            ? tr({fr:'profil complété ✓ · enregistrez votre première vente.', en:'profile completed ✓ · record your first sale.', ar:'اكتمل الملف ✓ · سجّل أول عملية بيع.'})
            : tr({fr:'enregistrez votre première vente pour le voir prendre vie.', en:'record your first sale to see it come alive.', ar:'سجّل أول عملية بيع لتراها تنبض بالحياة.'})}` });
      };
      const readAnswers = () => {
        const out = {};
        m.el.querySelectorAll('[data-ob-q]').forEach((i) => {
          const v = (i.value || '').trim();
          if (v) out[i.dataset.obQ] = v;
        });
        return Object.keys(out).length ? out : null;
      };
      m.el.addEventListener('click', (e) => {
        // "Plus de types" — reveal the hidden cards.
        if (e.target.closest('[data-ob-more]')) {
          m.el.querySelectorAll('.ob-type.ob-more').forEach((x) => x.classList.remove('ob-more'));
          const btn = m.el.querySelector('[data-ob-more]');
          if (btn) btn.style.display = 'none';
          return;
        }
        const t = e.target.closest('[data-ob-type]');
        if (t) {
          picked = t.dataset.obType;
          m.el.querySelectorAll('[data-ob-type]').forEach((x) => x.classList.toggle('sel', x === t));
          return;
        }
        if (e.target.closest('[data-ob-create]')) {
          const name = (nameInput.value || '').trim();
          if (!name) { toast(tr({fr:'Donnez un nom à votre activité', en:'Give your business a name', ar:'أدخل اسم نشاطك التجاري'}), { type: 'warn', force: true }); nameInput.focus(); return; }
          const city = (m.el.querySelector('[data-ob-city]').value || '').trim();
          const goal = +(m.el.querySelector('[data-ob-goal]').value) || 0;
          const def = TYPES.find((x) => x.id === picked) || TYPES[0];
          step1 = { name, city, goal, def };
          /* ── Step 2 · the trade's own questions — every field optional,
           * the whole step skippable. Answers personalize the venue. ── */
          const prof = window.KiwiVenue?.getSubtypeProfile?.(picked);
          if (!prof || !prof.questions || !prof.questions.length) { doCreate(null); return; }
          const optWord = tr({fr:'optionnel', en:'optional', ar:'اختياري'});
          m.el.querySelector('.kiwi-modal-body').innerHTML = `
            <style>.ob-field:focus{border-color:var(--atlas)!important;}</style>
            <div style="font-family:var(--mono);font-size:10.5px;letter-spacing:0.1em;color:var(--atlas);margin:2px 0 10px;">${tr({fr:'ÉTAPE 2 / 2 · TOUT EST OPTIONNEL', en:'STEP 2 / 2 · ALL OPTIONAL', ar:'الخطوة 2/2 · كل شيء اختياري'})}</div>
            <div style="font-size:17px;font-weight:600;letter-spacing:-0.01em;">${tr({fr:'Parlez-nous de votre activité', en:'Tell us about your business', ar:'حدثنا عن نشاطك'})} · ${def.label}</div>
            <p style="font-size:13px;color:var(--n-500);margin:6px 0 2px;line-height:1.5;">${tr({fr:'30 secondes, Kiwi personnalise vos indicateurs et vos modules. Modifiable plus tard dans Paramètres.', en:'30 seconds, Kiwi tailors your indicators and modules. Editable later in Settings.', ar:'30 ثانية, يخصص كيوي مؤشراتك ووحداتك. قابل للتعديل لاحقًا في الإعدادات.'})}</p>
            ${prof.questions.map((q) => `
              <label style="${lbl}">${tr(q.label)} <span style="color: var(--n-500);font-weight:400;">· ${optWord}</span></label>
              <input class="ob-field" data-ob-q="${q.k}" ${q.type === 'number' ? 'type="number" inputmode="numeric" min="0"' : 'maxlength="60"'} placeholder="${q.ph}" style="${fld}"/>
            `).join('')}`;
          const foot = m.el.querySelector('.kiwi-modal-foot');
          if (foot) foot.innerHTML = `
            <button class="kb ghost" data-ob-skip type="button" style="flex:1;justify-content:center;">${tr({fr:'Passer pour l\'instant', en:'Skip for now', ar:'تخطّ الآن'})}</button>
            <button class="kb atlas" data-ob-finish type="button" style="flex:1.4;justify-content:center;">${tr({fr:'Terminer →', en:'Finish →', ar:'إنهاء ←'})}</button>`;
          setTimeout(() => { const f = m.el.querySelector('[data-ob-q]'); if (f) f.focus(); }, 120);
          return;
        }
        if (e.target.closest('[data-ob-skip]')) { doCreate(null); return; }
        if (e.target.closest('[data-ob-finish]')) { doCreate(readAnswers()); return; }
      });
    },

    'export': () => {
      toast(tr({fr:'Préparation de l\'export…', en:'Preparing export…', ar:'جارٍ تجهيز التصدير…'}), { type: 'info', duration: 1600 });
      setTimeout(() => {
        toast(tr({fr:'Export CSV prêt', en:'CSV export ready', ar:'ملف CSV جاهز'}), { type: 'success', desc: '182 transactions · 24 avril 2026', action: { label: tr({fr:'Télécharger', en:'Download', ar:'تنزيل'}), onClick: () => toast(tr({fr:'Téléchargement démarré', en:'Download started', ar:'بدأ التنزيل'}), {type:'info'}) } });
      }, 1800);
    },

    /* The prominent home-dashboard CTA must produce the same factual report
     * as Rapport journalier.  Resolution lives with the exporter so this
     * router never duplicates day boundaries, venue scoping or reconciliation. */
    'day-report-export': (el) => {
      const api = window.KiwiDayReportExport;
      if (!api || typeof api.openCurrent !== 'function') {
        toast(tr({fr:'Le rapport est encore en cours de chargement', en:'The report is still loading', ar:'لا يزال التقرير قيد التحميل'}), { type:'info' });
        return;
      }
      api.openCurrent(el);
    },

    'new-sale': () => {
      let amount = '';
      const m = modal({
        tag: 'NOUVELLE VENTE',
        title: 'Encaisser un montant',
        desc: 'Saisissez le montant et choisissez le mode d\'encaissement.',
        width: 440,
        body: `
          <div style="text-align:center; padding:20px 0 28px;">
            <div style="font-size:14px; color:var(--n-500); margin-bottom:6px;">MONTANT</div>
            <div style="font-size:64px; font-weight:600; letter-spacing:-0.045em; font-feature-settings:'tnum' 1; line-height:1;" data-amt>0<span style="font-size:22px; color: var(--n-500); margin-left:6px;">MAD</span></div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
            ${[1,2,3,4,5,6,7,8,9,',',0,'⌫'].map(n => `<button class="kb ghost" style="padding:18px; font-size:19px; font-weight:500; justify-content:center;" data-key="${n}">${n}</button>`).join('')}
          </div>
          <div style="margin-top:18px; display:flex; flex-direction:column; gap:8px;">
            <button class="kb atlas" style="padding:14px; justify-content:center; font-size:15px;" data-method="card">Encaisser par carte · Tap ou dip</button>
            <button class="kb ghost" style="padding:14px; justify-content:center; font-size:15px;" data-method="qr">Afficher QR Kiwi Wallet</button>
            <button class="kb ghost" style="padding:14px; justify-content:center; font-size:15px;" data-method="link">Envoyer un lien de paiement</button>
          </div>
        `
      });
      m.el.addEventListener('click', (e) => {
        const k = e.target.closest('[data-key]');
        if (k) {
          const v = k.dataset.key;
          if (v === '⌫') amount = amount.slice(0, -1);
          else if (v === ',' && !amount.includes(',')) amount += ',';
          else if (v !== ',') amount += v;
          m.el.querySelector('[data-amt]').innerHTML = `${amount || '0'}<span style="font-size:22px; color: var(--n-500); margin-left:6px;">MAD</span>`;
        }
        const met = e.target.closest('[data-method]');
        if (met) {
          if (!amount) { toast(tr({fr:'Saisissez un montant', en:'Enter an amount', ar:'أدخل المبلغ'}), {type: 'warn'}); return; }
          const method = met.dataset.method;
          // On a user-created venue, a sale is REAL — persist it and let the
          // dashboard (hero · KPIs · feed) recompute from the sales store.
          const KV = window.KiwiVenue;
          const ownVenue = !!(KV && KV.isCustom && KV.isCustom()) || !!(window.KiwiEnv?.isReal?.());
          if (ownVenue && window.KiwiSales) {
            const num = parseFloat(String(amount).replace(',', '.')) || 0;
            if (num <= 0) { toast(tr({fr:'Montant invalide', en:'Invalid amount', ar:'المبلغ غير صالح'}), { type: 'warn', force: true }); return; }
            const vid = KV.getVenue();
            // Read BEFORE adding — the very first sale is a milestone, not a
            // routine toast. This is the moment onboarding literally promised.
            const first = (window.KiwiSales.totals(vid).count === 0);
            m.close();
            window.KiwiSales.add(vid, { amount: num, method });
            const ML = { card: 'carte', qr: 'QR Wallet', link: 'lien de paiement' };
            // Pulse the hero number so the merchant SEES their money land — a
            // spring scale via Web Animations (no CSS dependency).
            const pulseHero = () => { try { const h = document.querySelector('[data-hero-amount]'); if (h && h.animate) h.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.055)' }, { transform: 'scale(1)' }], { duration: 720, easing: 'cubic-bezier(0.34, 1.45, 0.5, 1)' }); } catch (_) {} };
            if (first) {
              let owner = ''; try { owner = (localStorage.getItem('kiwiOwnerName') || '').trim(); } catch (_) {}
              try { confetti(); } catch (_) {}
              setTimeout(pulseHero, 140);
              toast(tr({ fr: 'Votre première vente sur Kiwi', en: 'Your first sale on Kiwi', ar: 'أول عملية بيع لك على كيوي' }), {
                type: 'success', force: true, duration: 5200,
                desc: tr({
                  fr: `${amount} MAD encaissés · c'est parti${owner ? ', ' + owner : ''}, votre tableau de bord est vivant.`,
                  en: `${amount} MAD in · you're live${owner ? ', ' + owner : ''}, your dashboard is alive.`,
                  ar: `${amount} درهم · انطلقت${owner ? '، ' + owner : ''}، لوحتك الآن حيّة.`,
                }),
              });
            } else {
              setTimeout(pulseHero, 60);
              toast(tr({ fr: 'Vente enregistrée', en: 'Sale recorded', ar: 'تم تسجيل البيع' }), { type: 'success', force: true, desc: `${amount} MAD · ${ML[method] || method}` });
            }
            return;
          }
          m.close();
          if (method === 'card') toast(`${tr({fr:'En attente de la carte', en:'Waiting for card', ar:'في انتظار البطاقة'})} · ${amount} MAD`, {type: 'info', desc: tr({fr:'Présentez la carte au terminal ou téléphone', en:'Present the card to the terminal or phone', ar:'قدّم البطاقة للطرفية أو الهاتف'})});
          if (method === 'qr') toast(`${tr({fr:'QR généré', en:'QR generated', ar:'تم إنشاء QR'})} · ${amount} MAD`, {type: 'info', desc: tr({fr:'Client scanne depuis Kiwi Wallet', en:'Customer scans from Kiwi Wallet', ar:'يمسح العميل الرمز من Kiwi Wallet'})});
          if (method === 'link') toast(tr({fr:'Lien de paiement copié', en:'Payment link copied', ar:'تم نسخ رابط الدفع'}), {type: 'success', desc: tr({fr:'Envoyez-le par WhatsApp à votre client', en:'Send it via WhatsApp to your customer', ar:'أرسله عبر WhatsApp لعميلك'})});
        }
      });
    },

    'instant-settle': () => {
      /* Demo Pay flow (fabricated 23 091 MAD → Bank of Africa ••3291). A real
         merchant has no settlement pipeline wired yet — show a neutral state
         instead of the demo payout. Local demo keeps the full flow. */
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) {
        toast(tr({ fr: 'Aucun règlement instantané en attente', en: 'No instant settlement pending', ar: 'لا تسوية فورية معلّقة' }), { type: 'info', desc: tr({ fr: 'Vos virements apparaîtront ici après vos premières ventes.', en: 'Your transfers will appear here after your first sales.', ar: 'ستظهر تحويلاتك هنا بعد مبيعاتك الأولى.' }) });
        return;
      }
      const m = modal({
        tag: 'RÈGLEMENT INSTANTANÉ',
        title: 'Recevoir 23 091 MAD en ~10 secondes',
        desc: 'Via Virement Instantané Bank Al-Maghrib. Frais : 1,50 MAD.',
        body: `
          <div style="background:var(--atlas); color:var(--paper); border-radius:14px; padding:22px; margin-bottom:18px;">
            <div style="font-size:11px; color:var(--mint); letter-spacing:0.1em; font-family:var(--mono);">VOUS ALLEZ RECEVOIR</div>
            <div style="font-size:42px; font-weight:600; letter-spacing:-0.035em; line-height:1; margin-top:6px; font-feature-settings:'tnum' 1;">23 089,50 <span style="font-size:18px; opacity:0.7;">MAD</span></div>
            <div style="font-size:13px; color:#c6ead4; margin-top:10px;">Sur Bank of Africa ••3291 · d\'ici 10 secondes</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:13.5px;">
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--n-200);"><span style="color:var(--n-500);">Montant brut</span><span class="mono" style="font-family:var(--mono); font-weight:500;">23 091,00 MAD</span></div>
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--n-200);"><span style="color:var(--n-500);">Frais Virement Instantané</span><span class="mono" style="font-family:var(--mono); font-weight:500; color:var(--danger);">−1,50 MAD</span></div>
            <div style="display:flex; justify-content:space-between; padding:10px 0 4px; font-weight:600;"><span>Net reçu</span><span class="mono" style="font-family:var(--mono); color:var(--atlas); font-size:16px;">23 089,50 MAD</span></div>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>Attendre demain 9h</button>
          <button class="kb atlas" data-confirm-settle>Confirmer le règlement →</button>
        `
      });
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-dismiss]')) m.close();
        if (e.target.closest('[data-confirm-settle]')) {
          m.close();
          toast(tr({fr:'Règlement en cours…', en:'Settlement in progress…', ar:'جارٍ تنفيذ التسوية…'}), {type: 'info', duration: 2000});
          setTimeout(() => toast(tr({fr:'23 089,50 MAD crédités sur Bank of Africa ••3291', en:'23 089,50 MAD credited to Bank of Africa ••3291', ar:'23 089,50 MAD مُضافة إلى Bank of Africa ••3291'}), {type: 'success', desc: tr({fr:'Virement Instantané exécuté en 8,4 s', en:'Instant Transfer executed in 8.4 s', ar:'تم تنفيذ التحويل الفوري في 8,4 ثانية'})}), 2200);
        }
      });
    },

    'tx-detail': (el, arg) => {
      /* Static demo transaction (Café Atlas customer/staff/card, Bank of Africa
         ••3291 batch). No real per-transaction backend yet, so a real merchant
         gets a neutral state rather than the demo record. Local demo unchanged. */
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) {
        toast(tr({ fr: 'Détail de transaction indisponible', en: 'Transaction detail unavailable', ar: 'تفاصيل المعاملة غير متوفرة' }), { type: 'info' });
        return;
      }
      const data = txData[arg] || txData['default'];
      modal({
        tag: 'TRANSACTION · ' + data.id,
        title: data.method,
        desc: `Autorisée le ${data.date} · réseau ${data.network}`,
        width: 560,
        body: `
          <div class="tx-detail-hero">
            <div class="amt">${data.amount}</div>
            <div class="status">${I.check} ${data.status}</div>
          </div>
          <dl class="tx-detail-grid">
            <dt>Client</dt><dd>${data.customer}</dd>
            <dt>Table</dt><dd>${data.table}</dd>
            <dt>Panier</dt><dd>${data.cart}</dd>
            <dt>Pourboire</dt><dd>${data.tip}</dd>
            <dt>Commission Kiwi</dt><dd>${data.fee}</dd>
            <dt>Net reçu</dt><dd>${data.net}</dd>
            <dt>Carte</dt><dd>${data.card}</dd>
            <dt>Émetteur</dt><dd>${data.issuer}</dd>
            <dt>Pays émetteur</dt><dd>${data.country}</dd>
            <dt>Encaissé par</dt><dd>${data.staff}</dd>
          </dl>
          <div class="tx-timeline">
            <div class="tx-timeline-item">
              <div class="t">14:32:18</div>
              <div class="n">Autorisation émise</div>
              <div class="d">Visa · autorisation ARN 28410398281</div>
            </div>
            <div class="tx-timeline-item">
              <div class="t">14:32:19</div>
              <div class="n">3-D Secure contourné</div>
              <div class="d">Tap carte contactless · &lt; 500 MAD</div>
            </div>
            <div class="tx-timeline-item">
              <div class="t">14:32:20</div>
              <div class="n">Capture confirmée</div>
              <div class="d">Interchange 0,45 % · scheme 0,12 %</div>
            </div>
            <div class="tx-timeline-item last">
              <div class="t">25 avril 09:00</div>
              <div class="n">Règlement prévu</div>
              <div class="d">Inclus dans le batch de 23 089,50 MAD → Bank of Africa ••3291</div>
            </div>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-refund>Rembourser partiellement</button>
          <button class="kb ghost" data-print>Renvoyer le reçu</button>
          <button class="kb primary" data-dismiss>Fermer</button>
        `
      });
      document.body.addEventListener('click', function once(e) {
        if (e.target.closest('[data-refund]')) { document.querySelector('.kiwi-backdrop .kiwi-modal-close')?.click(); setTimeout(() => toast(tr({fr:'Choisir montant à rembourser', en:'Choose amount to refund', ar:'اختر المبلغ المراد استرداده'}), {type:'info'}), 220); }
        if (e.target.closest('[data-print]')) toast(tr({fr:'Reçu envoyé par WhatsApp à Karim B.', en:'Receipt sent via WhatsApp to Karim B.', ar:'تم إرسال الإيصال عبر WhatsApp إلى Karim B.'}), {type:'success'});
        if (e.target.closest('[data-dismiss]')) document.querySelector('.kiwi-backdrop .kiwi-modal-close')?.click();
        document.body.removeEventListener('click', once);
      });
    },

    /* Open the rich detail drawer for a live-feed order. Reads the cached
     * order object stored by renderFeed() under window.__kiwiFeedOrders.
     * Shows: receipt + time, total, status; table/server/covers/duration;
     * itemized cart with quantities; subtotal + TVA + total; payment block
     * (real brand chip + flag + amount); timeline; receipt actions. */
    'open-order': (el) => {
      const key = el?.dataset?.orderKey;
      const o = (window.__kiwiFeedOrders || {})[key];
      if (!o) { handlers['tx-detail'](el, 'tx1'); return; }

      const lang = kiwiLang();
      const T = {
        fr: { tag: 'COMMANDE', status: 'Encaissée · règlement T+1', table: 'Table', server: 'Serveur', covers: 'Couverts', duration: 'Durée service', cover: 'couvert', covers_pl: 'couverts', minutes: 'min', items: 'Articles', payment: 'Paiement', subtotal: 'Sous-total', tva: 'TVA', total: 'Total encaissé', timeline: 'Chronologie', opened: 'Table ouverte', sent: 'Envoyé en cuisine', ready: 'Prêt', paid: 'Payé', closed: 'Table fermée', sendReceipt: 'Envoyer le reçu', refund: 'Rembourser', cancel: 'Annuler la vente', cancelConfirm: 'Annuler cette vente ? Cette action sera journalisée.', cancelled: 'Vente annulée', cancelFailed: 'Annulation impossible. Vérifiez vos droits et réessayez.', close: 'Fermer', receiptSent: 'Reçu envoyé par WhatsApp', refundPrompt: 'Choisir le montant à rembourser' },
        en: { tag: 'ORDER', status: 'Captured · T+1 settlement', table: 'Table', server: 'Server', covers: 'Covers', duration: 'Service time', cover: 'cover', covers_pl: 'covers', minutes: 'min', items: 'Items', payment: 'Payment', subtotal: 'Subtotal', tva: 'VAT', total: 'Total paid', timeline: 'Timeline', opened: 'Table opened', sent: 'Sent to kitchen', ready: 'Ready', paid: 'Paid', closed: 'Table closed', sendReceipt: 'Send receipt', refund: 'Refund', cancel: 'Cancel sale', cancelConfirm: 'Cancel this sale? This action will be logged.', cancelled: 'Sale cancelled', cancelFailed: 'Could not cancel the sale. Check your permissions and try again.', close: 'Close', receiptSent: 'Receipt sent on WhatsApp', refundPrompt: 'Choose refund amount' },
        ar: { tag: 'طلب', status: 'تمّ الدفع · تسوية T+1', table: 'الطاولة', server: 'النادل', covers: 'الضيوف', duration: 'مدة الخدمة', cover: 'ضيف', covers_pl: 'ضيوف', minutes: 'د', items: 'الأصناف', payment: 'الدفع', subtotal: 'الإجمالي', tva: 'الضريبة', total: 'المبلغ المدفوع', timeline: 'الجدول الزمني', opened: 'فُتحت الطاولة', sent: 'أُرسل للمطبخ', ready: 'جاهز', paid: 'مدفوع', closed: 'أُغلقت الطاولة', sendReceipt: 'إرسال الإيصال', refund: 'استرداد', cancel: 'إلغاء البيع', cancelConfirm: 'إلغاء هذا البيع؟ سيتم تسجيل العملية.', cancelled: 'تم إلغاء البيع', cancelFailed: 'تعذر إلغاء البيع. تحقق من الصلاحيات وحاول مرة أخرى.', close: 'إغلاق', receiptSent: 'تمّ إرسال الإيصال عبر واتساب', refundPrompt: 'اختر مبلغ الاسترداد' },
      };
      const L = T[lang] || T.fr;

      /* Same brand assets the row uses — kept in sync so the drawer feels
       * like an enlarged version of the chip the merchant just tapped. */
      const ICONS = {
        visa: `<img src="assets/icons/visa.svg" alt="Visa">`,
        mc:   `<img src="assets/icons/mastercard.png" alt="Mastercard">`,
        cash: `<img src="assets/icons/cash.webp" alt="Espèces">`,
        tap:  `<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M8.5 8a5 5 0 0 1 0 8M12 5a8 8 0 0 1 0 14M15.5 2a11 11 0 0 1 0 20"/></svg>`,
        qr:   `<img src="assets/icons/qr-code.png" alt="QR">`,
      };
      const chip = ICONS[o.method] || '';

      /* Format helpers — only used here, kept local. */
      const fmtNum = (n) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const coversLbl = o.covers === 1 ? L.cover : L.covers_pl;

      /* Timeline — back-derive 3 prep moments from the paid time so the
       * sequence reads naturally. Service was X min; assume kitchen
       * handoff at 30% and ready at 70%. */
      const dur = Math.max(8, o.serviceMinutes || 20);
      const [hh, mm] = (o.t || '12:00').split(':').map(Number);
      const minus = (back) => {
        let m = hh * 60 + mm - back;
        if (m < 0) m += 24 * 60;
        const h = Math.floor(m / 60) % 24, x = m % 60;
        return String(h).padStart(2, '0') + ':' + String(x).padStart(2, '0');
      };
      const tOpened = minus(dur);
      const tSent   = minus(Math.round(dur * 0.7));
      const tReady  = minus(Math.round(dur * 0.3));
      const tPaid   = o.t;

      const itemsHtml = (o.items || []).map(it => `
        <div class="ord-item">
          <div class="qty">×${it.qty}</div>
          <div>
            <div class="nm">${it.name}</div>
            <div class="unit">${fmtNum(it.price)} MAD ${L.cover === 'cover' ? 'each' : (lang === 'ar' ? 'للوحدة' : 'pièce')}</div>
          </div>
          <div class="ln">${fmtNum(it.qty * it.price)} MAD</div>
        </div>
      `).join('');

      const cancelFoot = o.saleId ? `<button class="kb ghost" data-ord-cancel>${L.cancel}</button>` : '';
      drawer({
        title: o.primary,
        subtitle: `${L.tag} · ${o.receiptNo || ''}`,
        width: 460,
        body: `
          <div class="ord-hero">
            <div class="row1">
              <div class="ticket">${L.tag} · ${o.receiptNo || ''}</div>
              <div class="when">${o.t}</div>
            </div>
            <div class="amt">${o.amt}<span class="cur">MAD</span></div>
            <div class="status">${L.status}</div>
          </div>

          <div class="ord-stats">
            <div class="ord-stat">
              <div class="lbl">${L.table}</div>
              <div class="val">T${o.table != null ? o.table : '·'}</div>
            </div>
            <div class="ord-stat">
              <div class="lbl">${L.covers}</div>
              <div class="val">${o.covers || 1}</div>
              <div class="sub">${coversLbl}</div>
            </div>
            <div class="ord-stat">
              <div class="lbl">${L.server}</div>
              <div class="val" style="font-size:13px;">${o.server || '·'}</div>
            </div>
            <div class="ord-stat">
              <div class="lbl">${L.duration}</div>
              <div class="val">${dur}<span style="font-size:11px;color:var(--n-500);font-weight:500;margin-left:3px;">${L.minutes}</span></div>
            </div>
          </div>

          <div class="ord-section-lbl">${L.items}</div>
          <div class="ord-items">${itemsHtml || `<div class="ord-item"><div class="qty">·</div><div><div class="nm">·</div></div><div class="ln">·</div></div>`}</div>

          <div class="ord-totals">
            <div class="k">${L.subtotal}</div><div class="v">${o.subtotal} MAD</div>
            <div class="k">${L.tva} (${o.tvaRate || 10}%)</div><div class="v">${o.tva} MAD</div>
            <div class="k total">${L.total}</div><div class="v total">${o.total} MAD</div>
          </div>

          <div class="ord-section-lbl">${L.payment}</div>
          <div class="ord-pay">
            <div class="ci ${o.method}">${chip}</div>
            <div>
              <div class="pay-prim">${o.primary}</div>
              <div class="pay-sub"><span class="pay-flag ${o.flag || ''}"></span>${o.sub || ''}</div>
            </div>
            <div class="pay-amt">${o.amt} MAD</div>
          </div>

          <div class="ord-section-lbl">${L.timeline}</div>
          <div class="tx-timeline">
            <div class="tx-timeline-item"><div class="t">${tOpened}</div><div class="n">${L.opened}</div><div class="d">T${o.table != null ? o.table : '·'} · ${o.covers || 1} ${coversLbl} · ${o.server || '·'}</div></div>
            <div class="tx-timeline-item"><div class="t">${tSent}</div><div class="n">${L.sent}</div><div class="d">${(o.items || []).map(i => `×${i.qty} ${i.name}`).join(' · ') || '·'}</div></div>
            <div class="tx-timeline-item"><div class="t">${tReady}</div><div class="n">${L.ready}</div><div class="d">${L.server === 'Server' ? 'Picked up by' : (L.server === 'النادل' ? 'استلمه' : 'Récupéré par')} ${o.server || '·'}</div></div>
            <div class="tx-timeline-item last"><div class="t">${tPaid}</div><div class="n">${L.paid} · ${L.closed}</div><div class="d">${o.primary} · ${o.sub || ''}</div></div>
          </div>
        `,
        foot: `
          ${cancelFoot}
          <button class="kb ghost" data-ord-receipt>${L.sendReceipt}</button>
          <button class="kb ghost" data-ord-refund>${L.refund}</button>
          <button class="kb primary" data-dismiss>${L.close}</button>
        `,
      });

      /* Footer actions — light demo wiring, mirrors tx-detail's pattern. */
      document.body.addEventListener('click', function once(e) {
        const cancelButton = e.target.closest('[data-ord-cancel]');
        if (cancelButton && o.saleId) {
          if (!window.confirm(L.cancelConfirm)) return;
          cancelButton.disabled = true;
          const url = new URL(location.href);
          const venue = window.KiwiVenue?.getVenue?.() || {};
          const merchant = url.searchParams.get('merchant') || venue.merchant || venue.id || '';
          fetch('/api/sale/cancel', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ merchant: String(merchant), id: String(o.saleId), source: 'dashboard' }),
          }).then(async (r) => {
            const payload = await r.json().catch(() => ({}));
            if (!r.ok || !payload.ok) throw new Error(payload.error || 'cancel-failed');
            return payload;
          }).then(() => {
            toast(L.cancelled, { type: 'success' });
            document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer-close')?.click();
            const targetRef = String(o.ref || o.receiptNo || o.saleId || '').trim();
            document.dispatchEvent(new CustomEvent('kiwi-sales-voided', { detail: { refs: [targetRef], merchant } }));
          }).catch(() => {
            cancelButton.disabled = false;
            toast(L.cancelFailed, { type: 'error' });
          }).finally(() => document.body.removeEventListener('click', once));
          return;
        }
        if (e.target.closest('[data-ord-receipt]')) { toast(L.receiptSent + (o.customer ? ' · ' + o.customer : ''), { type: 'success' }); }
        if (e.target.closest('[data-ord-refund]'))  { document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer-close')?.click(); setTimeout(() => toast(L.refundPrompt, { type: 'info' }), 220); }
        if (e.target.closest('[data-dismiss]'))     { document.querySelector('.kiwi-drawer-backdrop .kiwi-drawer-close')?.click(); }
        document.body.removeEventListener('click', once);
      });
    },

    'upgrade-pro': () => {
      /* Four-tier model. The recommended tier is contextual to the account: a
       * multi-établissement account needs Ultra (Basic/Pro are mono-site); the
       * exact palier is confirmed in a short discovery chat (so it's not fixed). */
      const reco = 'ultra';
      const current = 'pro';
      const PLANS = [
        { id: 'basic', name: 'KIWI BASIC', price: '199 MAD', unit: '/mois', tagline: `Logiciel seul · sur votre matériel`, cta: 'Choisir Basic', feats: [
          `Logiciel Kiwi complet · tous les modules`,
          `Appareils illimités · 1 établissement`,
          `S'intègre à votre caisse / TPE existant`,
          `Formation sur site + guides inclus`,
          `Demandes de support suivies` ] },
        { id: 'pro', name: 'KIWI PRO', price: '399 MAD', unit: '/mois', tagline: `Tout Basic + 1 caisse Kiwi offerte`, cta: 'Plan actuel', feats: [
          `Tout Kiwi Basic inclus`,
          `1 caisse Kiwi offerte · prêtée à vie`,
          `Règlement T+1 garanti`,
          `Jusqu'à 8 membres d'équipe`,
          `Maintenance & remplacement matériel` ] },
        { id: 'ultra', name: 'KIWI ULTRA', price: '1 499 MAD', unit: '/mois', tagline: `Sur-mesure · multi-pays · 24/7`, cta: 'Passer à Ultra →', feats: [
          `Tout Kiwi Pro inclus`,
          `Vue Portefeuille consolidée + IA cross-sites actionnable`,
          `Établissements illimités · équipe illimitée`,
          `API enterprise illimitée · SLA 99,99 %`,
          `Multi-pays · corridor diaspora France ↔ Maroc`,
          `Account manager dédié 24/7 (réponse < 30 min)`,
          `Conseil stratégique trimestriel`,
          `Onboarding white-glove sur place`,
          `≈ 0,1 % du CA d'un portefeuille de 3 établissements` ] },
        { id: 'ultimate', name: 'KIWI ULTIMATE', price: 'Sur devis', unit: '', tagline: `Sur-mesure total · on en parle`, cta: 'Demander un devis →', feats: [
          `Tout Kiwi Ultra inclus`,
          `Fonctionnalités développées pour vous`,
          `Nombre de caisses & d'appareils négocié`,
          `SLA & intégrations dédiés`,
          `Tarif défini ensemble` ] },
      ];
      const card = (p) => `
        <div class="kup-card${p.id === current ? ' is-current' : ''}${p.id === reco ? ' is-reco' : ''}">
          ${p.id === current ? `<div class="kup-badge">PLAN ACTUEL</div>` : (p.id === reco ? `<div class="kup-badge">RECOMMANDÉ POUR VOUS</div>` : '')}
          <div class="kup-name">${p.name}</div>
          <div class="kup-price">${p.price}${p.unit ? `<span>${p.unit}</span>` : ''}</div>
          <div class="kup-tagline">${p.tagline}</div>
          <ul class="kup-feats">${p.feats.map((f) => `<li>${f}</li>`).join('')}</ul>
          <button class="kup-cta"${p.id === current ? ' disabled' : ` data-action="upgrade-plan" data-arg="${p.id}"`}>${p.cta}</button>
        </div>`;
      return modal({
        tag: 'ABONNEMENTS KIWI',
        title: 'Quatre paliers. Le vôtre évolue avec votre activité.',
        desc: `Du logiciel seul, intégré à votre caisse, avec formation, à l'entreprise sur-mesure. Le matériel et l'accompagnement s'ajoutent palier par palier.`,
        width: 1040,
        body: `
          <style>
            .kup-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; align-items:stretch; }
            @media (max-width:880px){ .kup-grid{ grid-template-columns:repeat(2,1fr); } }
            .kup-card { display:flex; flex-direction:column; border:1px solid var(--n-200); border-radius:14px; padding:18px 14px 14px; background:var(--surface); position:relative; }
            .kup-card.is-current { background:var(--paper-soft); }
            .kup-card.is-reco { background:linear-gradient(165deg,#0c4a35,#08311f); border-color:transparent; color:#fff; box-shadow:0 14px 34px -18px rgba(11,110,79,0.55); }
            .kup-badge { position:absolute; top:-9px; inset-inline-start:14px; font-size:8.5px; font-weight:700; letter-spacing:0.06em; padding:3px 8px; border-radius:999px; white-space:nowrap; }
            .kup-card.is-current .kup-badge { background:var(--ink); color:var(--paper); }
            .kup-card.is-reco .kup-badge { background:var(--mint); color:#06371f; }
            .kup-name { font-family:var(--mono); font-size:11px; letter-spacing:0.08em; color:var(--n-500); margin-bottom:9px; }
            .kup-card.is-reco .kup-name { color:rgba(255,255,255,0.65); }
            .kup-price { font-size:23px; font-weight:600; letter-spacing:-0.02em; line-height:1.1; }
            .kup-price span { font-size:12px; font-weight:400; color:var(--n-500); margin-inline-start:2px; }
            .kup-card.is-reco .kup-price span { color:rgba(255,255,255,0.7); }
            .kup-tagline { font-size:11.5px; color:var(--n-500); margin:5px 0 13px; min-height:30px; line-height:1.35; }
            .kup-card.is-reco .kup-tagline { color:rgba(255,255,255,0.82); }
            .kup-feats { list-style:none; padding:0; margin:0 0 15px; display:flex; flex-direction:column; gap:7px; flex:1; }
            .kup-feats li { font-size:12px; line-height:1.35; padding-inline-start:18px; position:relative; }
            .kup-feats li::before { content:'✓'; position:absolute; inset-inline-start:0; color:var(--atlas); font-weight:700; }
            .kup-card.is-reco .kup-feats li::before { color:var(--mint); }
            .kup-cta { width:100%; padding:9px 10px; border-radius:9px; font-size:12.5px; font-weight:600; font-family:var(--sans); cursor:pointer; border:1px solid var(--n-300); background:transparent; color:var(--ink); transition: transform 130ms, opacity 130ms, background-color 130ms, border-color 130ms, color 130ms, box-shadow 130ms; }
            .kup-cta:hover:not([disabled]) { border-color:var(--atlas); color:var(--atlas); }
            .kup-card.is-reco .kup-cta { background:var(--surface); color:#08311f; border-color:#fff; }
            .kup-card.is-reco .kup-cta:hover { background:var(--mint); border-color:var(--mint); color:#06371f; }
            .kup-cta[disabled] { opacity:0.5; cursor:default; }
            .kup-tip { display:flex; gap:11px; align-items:flex-start; margin-top:16px; padding:13px 15px; background:var(--mint-soft); border-radius:12px; font-size:12.5px; line-height:1.5; color:var(--ink); }
          </style>
          <div class="kup-grid">${PLANS.map(card).join('')}</div>
          <div class="kup-tip">
            <div style="color:var(--atlas); flex-shrink:0; margin-top:1px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21h6"/></svg></div>
            <div style="flex:1;">${(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal())
              ? `<b>Votre recommandation :</b> <b>Ultra</b> ouvre les établissements illimités, le multi-pays et l'account manager dédié, au-delà du mono-site de Basic et Pro. Le palier exact se précise lors d'un court échange sur vos besoins.`
              : `<b>Votre recommandation :</b> ce compte gère 3 établissements (Café Atlas · Maison Mansour · Spa Bahia), au-delà du mono-site de Basic et Pro. <b>Ultra</b> ouvre les établissements illimités, le multi-pays et l'account manager dédié. Le palier exact se précise lors d'un court échange sur vos besoins.`}</div>
          </div>
        `,
        foot: `<button class="kb ghost" data-dismiss>Plus tard</button>`,
      });
    },

    'upgrade-plan': (el, plan) => {
      const MSG = {
        basic: { fr: 'Kiwi Basic sélectionné · notre équipe vous contacte pour l\'intégration à votre caisse et la formation.', en: 'Kiwi Basic selected · our team will reach out to integrate it into your till and train you.', ar: 'تم اختيار Kiwi Basic · سيتواصل فريقنا لدمجه في صندوقك وتقديم التدريب.' },
        ultra: { fr: 'Demande Ultra envoyée · votre account manager vous appelle sous 24 h.', en: 'Ultra request sent · your account manager will call within 24h.', ar: 'تم إرسال طلب Ultra · سيتصل بك مدير حسابك خلال 24 ساعة.' },
        ultimate: { fr: 'Demande de devis Ultimate envoyée · on définit ensemble le périmètre et le tarif.', en: 'Ultimate quote request sent · we\'ll define scope and price together.', ar: 'تم إرسال طلب عرض Ultimate · سنحدّد النطاق والسعر معًا.' },
      };
      const m = MSG[plan] || MSG.ultra;
      document.querySelectorAll('.kiwi-backdrop').forEach((b) => { const c = b.querySelector('.kiwi-modal-close'); if (c) c.click(); });
      toast(tr(m), { type: 'success', force: true });
    },

    'add-integration': () => drawer({
      title: 'Ajouter une intégration',
      subtitle: 'Connectez vos outils favoris',
      body: `
        <input class="kf-input" placeholder="Rechercher une intégration…" style="margin-bottom:16px;" />
        ${['Careem','inDrive','Toptal','Yassir','Fenix','Wafacash','Inwi Money','Orange Money','Odoo','QuickBooks','Bank of Africa','CIH','Attijariwafa Bank'].map(n => `
          <div class="notif" style="border-radius:10px; padding:12px; cursor:pointer;">
            <div class="n-ico" style="font-weight:700; color:var(--atlas); background:var(--paper-soft);">${n.charAt(0)}</div>
            <div class="n-body"><div class="n-title">${n}</div><div class="n-desc">Connexion en un clic via API officielle</div></div>
          </div>
        `).join('')}
      `
    }),

    'location-switch': (el) => menu(el, [
      { head: 'EMPLACEMENTS' },
      // A real / custom-venue merchant sees only their OWN establishment, never the
      // three demo "Café Atlas" locations.
      ...(((window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()))
        ? [{ label: (() => { const vd = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData(); return (vd && (vd.fullDisplay || vd.name)) || (window.KiwiMe && window.KiwiMe.business) || 'Mon établissement'; })(), active: true, icon: '<div style="width:18px; height:18px; background:var(--atlas); border-radius:5px;"></div>' }]
        : [
          { label: 'Café Atlas · Maarif', active: true, icon: '<div style="width:18px; height:18px; background:var(--atlas); border-radius:5px;"></div>' },
          { label: 'Café Atlas · Agdal (Rabat)', icon: '<div style="width:18px; height:18px; background:var(--riad); border-radius:5px;"></div>' },
          { label: 'Café Atlas · Marrakech', icon: '<div style="width:18px; height:18px; background:#D99A2B; border-radius:5px;"></div>' },
        ]),
      { sep: true },
      { label: tr({fr:'+ Ajouter un emplacement', en:'+ Add a location', ar:'+ إضافة موقع'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>', onClick: () => toast(tr({fr:'Assistant de nouvel emplacement', en:'New location wizard', ar:'معالج الموقع الجديد'}), {type:'info'}) },
      { label: 'Paramètres multi-boutiques', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', onClick: () => handlers.settings() },
    ]),

    'profile-menu': (el) => menu(el, [
      { head: ((window.KiwiMe && window.KiwiMe.name) || (window.KiwiEnv?.isReal?.() ? '' : 'Rachid Benhima')).toUpperCase() },
      { label: tr({fr:'Mon profil', en:'My profile', ar:'ملفي الشخصي'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/></svg>', onClick: () => handlers['account-profile'] && handlers['account-profile']() },
      { label: tr({fr:'Paramètres', en:'Settings', ar:'الإعدادات'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', onClick: () => handlers.settings && handlers.settings() },
      { label: tr({fr:'My Kiwi', en:'My Kiwi', ar:'My Kiwi'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>', onClick: () => handlers['account-billing'] && handlers['account-billing']() },
      { sep: true },
      { label: tr({fr:'Centre d\'aide', en:'Help centre', ar:'مركز المساعدة'}), icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 016 0c0 2-3 2-3 4M12 17h.01"/></svg>', onClick: () => handlers['account-help'] && handlers['account-help']() },
      { label: tr({fr:'Se déconnecter', en:'Sign out', ar:'تسجيل الخروج'}), danger: true, icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>', onClick: () => { toast(tr({fr:'Déconnexion…', en:'Signing out…', ar:'جارٍ تسجيل الخروج…'}), {type:'info'}); setTimeout(() => location.href = 'index.html', 800); } },
    ]),

    'download-app': () => {
      const m = modal({
        title: 'Télécharger Kiwi Wallet',
        desc: 'Scannez le QR ou recevez le lien par SMS.',
        width: 440,
        body: `
          <div style="display:flex; gap:20px; align-items:center; margin:14px 0 18px;">
            <div style="width:140px; height:140px; border-radius:14px; background:var(--ink); padding:10px; flex-shrink:0;">
              <div style="background:var(--paper); width:100%; height:100%; border-radius:6px; background-image: repeating-linear-gradient(0deg, var(--ink) 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 12px);"></div>
            </div>
            <div style="flex:1;">
              <div style="font-weight:600; font-size:16px; letter-spacing:-0.015em;">Scannez avec votre iPhone ou Android.</div>
              <div style="font-size:13px; color:var(--n-500); margin-top:8px; line-height:1.5;">L\'app s\'installe automatiquement. Votre Kiwi Wallet est prêt en 30 secondes.</div>
            </div>
          </div>
          <div style="padding-top:16px; border-top:1px solid var(--n-200);">
            <div class="kf-label">Ou recevez le lien par SMS</div>
            <div style="display:flex; gap:8px;">
              <input class="kf-input" placeholder="+212 6 xx xx xx xx" style="flex:1;" />
              <button class="kb atlas" data-sms>Envoyer</button>
            </div>
          </div>
        `
      });
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-sms]')) { m.close(); toast(tr({fr:'SMS envoyé', en:'SMS sent', ar:'تم إرسال الرسالة'}), {type:'success', desc:tr({fr:'Ouvrez le lien pour installer Kiwi Wallet', en:'Open the link to install Kiwi Wallet', ar:'افتح الرابط لتثبيت Kiwi Wallet'})}); }
      });
    },

    'download-kit': () => {
      toast(tr({fr:'Préparation du kit de marque…', en:'Preparing brand kit…', ar:'جارٍ تجهيز مجموعة الهوية البصرية…'}), {type:'info', duration:1500});
      setTimeout(() => toast(tr({fr:'Kit téléchargé', en:'Kit downloaded', ar:'تم تنزيل المجموعة'}), {type:'success', desc:'Logo · Palette · Typographies · Mockups · 24 Mo'}), 1700);
    },

    'lang-switch': (el) => {
      const cur = el.parentElement.querySelector('.on');
      if (cur) cur.classList.remove('on');
      el.classList.add('on');
      const l = el.textContent.trim();
      toast(`Langue : ${l}`, {type:'info', duration: 1500, desc: l === 'AR' ? 'L\'interface passera en RTL à la prochaine navigation.' : ''});
    },

    'ai-suggest': (el) => {
      const txt = el.textContent.trim().replace('→', '').trim();
      const drawerEl = document.querySelector('.ai-drawer');
      if (!drawerEl) { toast(txt, {type:'info'}); return; }
      // Insert user msg + typing + response
      const msg = drawerEl.querySelector('.msg');
      const user = document.createElement('div');
      user.className = 'ai-msg-user';
      user.textContent = txt;
      msg.insertAdjacentElement('afterend', user);
      const typing = document.createElement('div');
      typing.className = 'ai-msg-typing';
      typing.innerHTML = '<i></i><i></i><i></i>';
      user.insertAdjacentElement('afterend', typing);
      setTimeout(() => {
        typing.classList.remove('ai-msg-typing');
        typing.className = 'msg';
        typing.innerHTML = aiResponses[txt] || `<b>${(CP_STR[kiwiLang()] || CP_STR.fr).sAi} :</b> ${txt}, ${(CP_STR[kiwiLang()] || CP_STR.fr).executed}. Consultez les détails dans l\'onglet correspondant.`;
      }, 1200);
    },

    'contact': () => modal({
      tag: 'CONTACT',
      title: 'Parler à un conseiller Kiwi',
      desc: 'Notre équipe répond en moins de 15 minutes ouvrées.',
      width: 460,
      body: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Prénom</label><input class="kf-input" /></div>
          <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" /></div>
        </div>
        <div class="kf-group"><label class="kf-label">Email</label><input class="kf-input" /></div>
        <div class="kf-group"><label class="kf-label">Téléphone marocain</label><input class="kf-input" placeholder="+212" /></div>
        <div class="kf-group"><label class="kf-label">Type de commerce</label>
          <select class="kf-input">
            <option>Restaurant / café</option><option>Commerce de détail</option><option>Services</option><option>Autre</option>
          </select>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Annuler</button>
        <button class="kb atlas" data-contact-go>Être rappelé →</button>
      `
    }),

    'download-deck': () => {
      toast(tr({fr:'Téléchargement du deck…', en:'Downloading pitch deck…', ar:'جارٍ تنزيل العرض التقديمي…'}), {type:'info', duration: 1400});
      setTimeout(() => toast(tr({fr:'Deck PDF envoyé', en:'PDF deck sent', ar:'تم إرسال ملف العرض'}), {type:'success', desc:tr({fr:'NDA inclus · valable 48 h', en:'NDA included · valid 48 h', ar:'يشمل اتفاقية عدم الإفصاح · صالح 48 ساعة'})}), 1600);
    },

    'kpi-detail': (el, arg) => {
      /* Les tiroirs « rédigés » de kpiData sont écrits À LA MAIN sur les
       * chiffres du Café Atlas : 71,4 % de marge, « Boissons chaudes 82 % »,
       * « Jus pressés 61 % », 99,32 % de taux de succès. Sans cette porte, un
       * commerçant de Tanger qui cliquait sur SA tuile « Marge brute » se voyait
       * présenter la structure de coûts d'un café de démonstration comme si
       * c'était la sienne — et « marge » est une tuile par défaut en
       * restauration, en spa et en mode fusion, donc le clic était à un doigt.
       *
       * Le tiroir générique juste en dessous, lui, LIT la tuile cliquée : il
       * rend la vraie valeur, le vrai delta, et une explication de lecture qui
       * ne dépend d'aucun chiffre. C'est le bon repli, et il existait déjà. */
      const real = (() => {
        try {
          if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
          if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return true;
        } catch (_) {}
        return false;
      })();
      const authored = real ? null : kpiData[arg];
      if (authored) {
        drawer({ title: authored.title, subtitle: authored.subtitle, width: 540, body: authored.body, foot: authored.foot });
        return;
      }
      // Generic detail view for personalised / derived KPIs — reads the
      // clicked tile\'s live value + delta so it\'s never an empty drawer.
      const label = el?.querySelector('.l span, .l, .lbl')?.textContent?.trim() || 'Indicateur';
      const value = el?.querySelector('.v')?.textContent?.trim() || '·';
      const delta = el?.querySelector('.d')?.textContent?.trim() || '';
      const desc = KPI_DESC[arg] || (CP_STR[kiwiLang()] || CP_STR.fr).kpiDefaultDesc;
      const long = KPI_LONG[arg] || (CP_STR[kiwiLang()] || CP_STR.fr).kpiDefaultLong;
      drawer({
        title: label,
        subtitle: (CP_STR[kiwiLang()] || CP_STR.fr).kpiSubtitle,
        width: 460,
        body: `
          ${kpiHero(value, desc, delta)}
          ${kpiSection((CP_STR[kiwiLang()] || CP_STR.fr).kpiHowToRead, `<div style="font-size:13px; color:var(--n-600); line-height:1.62;">${long}</div>`)}
          ${kpiInsight((CP_STR[kiwiLang()] || CP_STR.fr).kpiInsight)}
        `,
        foot: `<button class="kb ghost" data-dismiss style="flex:1; justify-content:center;">${(CP_STR[kiwiLang()] || CP_STR.fr).close}</button><button class="kb atlas" data-action="open-assistant" style="flex:1; justify-content:center;">${(CP_STR[kiwiLang()] || CP_STR.fr).analyzeWithKiwiAI} →</button>`,
      });
    },

    'open-assistant': (el, arg) => {
      const q = typeof arg === 'string' ? arg : (el && el.dataset ? el.dataset.prefill : null);
      if (window.KiwiAgent && typeof window.KiwiAgent.open === 'function') {
        window.KiwiAgent.open(q);
        return;
      }
      if (window.__kiwiAgentOpen && typeof window.__kiwiAgentOpen === 'function') {
        window.__kiwiAgentOpen(q);
        return;
      }
      const checkAgent = (tries) => {
        if (window.KiwiAgent && typeof window.KiwiAgent.open === 'function') {
          window.KiwiAgent.open(q);
        } else if (window.__kiwiAgentOpen && typeof window.__kiwiAgentOpen === 'function') {
          window.__kiwiAgentOpen(q);
        } else if (tries > 0) {
          setTimeout(() => checkAgent(tries - 1), 50);
        }
      };
      checkAgent(20);
    },

    'filter-tx': () => drawer({
      title: 'Filtrer les transactions',
      subtitle: 'Affinez la liste',
      body: `
        <div class="kf-group">
          <label class="kf-label">Période</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <input class="kf-input" value="24/04/2026" /><input class="kf-input" value="24/04/2026" />
          </div>
        </div>
        <div class="kf-group">
          <label class="kf-label">Méthode</label>
          ${['Visa','Mastercard','Kiwi Tap','QR','Espèces'].map(m => `<label style="display:flex; gap:8px; padding:6px 0;"><input type="checkbox" checked /> ${m}</label>`).join('')}
        </div>
        <div class="kf-group">
          <label class="kf-label">Statut</label>
          ${['Réglé','En attente','Remboursé','Contesté'].map(m => `<label style="display:flex; gap:8px; padding:6px 0;"><input type="checkbox" checked /> ${m}</label>`).join('')}
        </div>
        <div class="kf-group">
          <label class="kf-label">Montant</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <input class="kf-input" placeholder="Min 0 MAD" /><input class="kf-input" placeholder="Max illimité" />
          </div>
        </div>
      `,
      foot: `<button class="kb ghost" style="flex:1; justify-content:center;" data-dismiss>Réinitialiser</button><button class="kb atlas" style="flex:1; justify-content:center;" data-filter-apply>Appliquer</button>`
    }),

    'scroll-to': (el, arg) => {
      const t = document.getElementById(arg) || document.querySelector(arg);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

  };

  /* ─── Helpers for rendering ─── */
  // On-brand line-art icons for the settings rows, keyed by the legacy emoji so
  // call sites don't change. Unmapped keys fall back to the emoji in the chip.
  const KSET_ICONS = {
    'store': '<path d="M3 21h18M3 7v14M21 7v14M4 7l8-4 8 4M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/>',
    'hours': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    'goal': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1zM8 7h8M8 11h8M8 15h5"/>',
    'payment': '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
    'currency': '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.9-2.5 2 0 2.6 5 1.4 5 4 0 1.1-1.1 2-2.5 2-1.1 0-2.1-.6-2.5-1.5"/>',
    'lang': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/>',
    'glass': '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/>',
    'theme': '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    'notifications': '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
    'pin': '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12l9-9m0 0h4m-4 0v4m-3-1l2 2"/>',
    'encryption': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'export': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    'delivery': '<path d="M18 13V6a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v7M6 9h12M10 21v-4M14 21v-4"/>',
    'glovo': '<path d="M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2"/>',
    'yassir': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    'accounting': '<path d="M18 20V10M12 20V4M6 20v-6M3 20h18"/>',
    '🏪': '<path d="M3 21h18M3 7v14M21 7v14M4 7l8-4 8 4M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/>',
    '⏰': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    '🎯': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    '🧾': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1zM8 7h8M8 11h8M8 15h5"/>',
    '💳': '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
    '💰': '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.9-2.5 2 0 2.6 5 1.4 5 4 0 1.1-1.1 2-2.5 2-1.1 0-2.1-.6-2.5-1.5"/>',
    '🌍': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/>',
    '🧊': '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5"/>',
    '🌙': '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    '🔔': '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
    '🔑': '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12l9-9m0 0h4m-4 0v4m-3-1l2 2"/>',
    '🛡️': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    '🛡': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    '📤': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    '🔌': '<path d="M18 13V6a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v7M6 9h12M10 21v-4M14 21v-4"/>',
    '🟠': '<path d="M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2"/>',
    '🔵': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    '📊': '<path d="M18 20V10M12 20V4M6 20v-6M3 20h18"/>'
  };
  /* Google Material Symbols · Outlined 400. Official paths from Google's
     open-source Material Symbols set, kept inline so settings work offline. */
  const MATERIAL_SETTINGS_ICONS = Object.freeze({
    storefront: 'M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z',
    schedule: 'm612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z',
    track_changes: 'M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880h40v331q18 11 29 28.5t11 40.5q0 33-23.5 56.5T480-400q-33 0-56.5-23.5T400-480q0-23 11-41t29-28v-86q-52 14-86 56.5T320-480q0 66 47 113t113 47q66 0 113-47t47-113q0-36-14.5-66.5T586-600l57-57q35 33 56 78.5t21 98.5q0 100-70 170t-170 70q-100 0-170-70t-70-170q0-90 57-156.5T440-717v-81q-119 15-199.5 105T160-480q0 134 93 227t227 93q134 0 227-93t93-227q0-69-27-129t-74-104l57-57q57 55 90.5 129.5T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80q-83 0-156-31.5Z',
    receipt_long: 'M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z',
    credit_card: 'M880-720v480q0 33-23.5 56.5T800-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720Zm-720 80h640v-80H160v80Zm0 160v240h640v-240H160Zm0 240v-480 480Z',
    paid: 'M444-200h70v-50q50-9 86-39t36-89q0-42-24-77t-96-61q-60-20-83-35t-23-41q0-26 18.5-41t53.5-15q32 0 50 15.5t26 38.5l64-26q-11-35-40.5-61T516-710v-50h-70v50q-50 11-78 44t-28 74q0 47 27.5 76t86.5 50q63 23 87.5 41t24.5 47q0 33-23.5 48.5T486-314q-33 0-58.5-20.5T390-396l-66 26q14 48 43.5 77.5T444-252v52Zm36 120q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
    language: 'M325-111.5q-73-31.5-127.5-86t-86-127.5Q80-398 80-480.5t31.5-155q31.5-72.5 86-127t127.5-86Q398-880 480.5-880t155 31.5q72.5 31.5 127 86t86 127Q880-563 880-480.5T848.5-325q-31.5 73-86 127.5t-127 86Q563-80 480.5-80T325-111.5ZM480-162q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z',
    layers: 'M480-118 120-398l66-50 294 228 294-228 66 50-360 280Zm0-202L120-600l360-280 360 280-360 280Zm0-280Zm0 178 230-178-230-178-230 178 230 178Z',
    dark_mode: 'M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z',
    notifications: 'M160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z',
    key: 'M223.5-423.5Q200-447 200-480t23.5-56.5Q247-560 280-560t56.5 23.5Q360-513 360-480t-23.5 56.5Q313-400 280-400t-56.5-23.5ZM280-240q-100 0-170-70T40-480q0-100 70-170t170-70q67 0 121.5 33t86.5 87h352l120 120-180 180-80-60-80 60-85-60h-47q-32 54-86.5 87T280-240Zm0-80q56 0 98.5-34t56.5-86h125l58 41 82-61 71 55 75-75-40-40H435q-14-52-56.5-86T280-640q-66 0-113 47t-47 113q0 66 47 113t113 47Z',
    shield_lock: 'M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Zm-80 160h160q17 0 28.5-11.5T600-360v-120q0-17-11.5-28.5T560-520v-40q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560v40q-17 0-28.5 11.5T360-480v120q0 17 11.5 28.5T400-320Zm40-200v-40q0-17 11.5-28.5T480-600q17 0 28.5 11.5T520-560v40h-80Z',
    file_upload: 'M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
    local_shipping: 'M155-195q-35-35-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35q-50 0-85-35Zm113.5-56.5Q280-263 280-280t-11.5-28.5Q257-320 240-320t-28.5 11.5Q200-297 200-280t11.5 28.5Q223-240 240-240t28.5-11.5ZM120-360h32q17-18 39-29t49-11q27 0 49 11t39 29h272v-360H120v360Zm628.5 108.5Q760-263 760-280t-11.5-28.5Q737-320 720-320t-28.5 11.5Q680-297 680-280t11.5 28.5Q703-240 720-240t28.5-11.5ZM680-440h170l-90-120h-80v120ZM360-540Z'
  });
  function materialSymbol(name, className) {
    const path = MATERIAL_SETTINGS_ICONS[name] || MATERIAL_SETTINGS_ICONS.storefront;
    return `<svg${className ? ` class="${className}"` : ''} viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`;
  }
  function ksetIco(key) {
    return `<span class="kset-ico">${materialSymbol(key)}</span>`;
  }
  function settingsRow(icon, label, value, opts) {
    if (opts === true) opts = { toggle: true, on: true };
    opts = opts || {};
    const attrs = (opts.action ? ` data-action="${opts.action}"` : '') +
                  (opts.arg ? ` data-arg="${opts.arg}"` : '');
    const right = opts.toggle
      ? `<div class="kset-toggle${opts.on ? ' on' : ''}" data-kset-toggle><div class="kset-knob"></div></div>`
      : opts.badge
      ? `<span class="kset-badge">${escape(opts.badge)}</span>`
      : '<svg class="kset-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--n-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    return `<div class="kset-row"${attrs} role="button" tabindex="0">` +
      ksetIco(icon) +
      `<div style="flex:1; min-width:0;"><div style="font-size:13.5px; font-weight:600; letter-spacing:-0.01em;">${label}</div>` +
      `<div class="kset-val" style="font-size:12px; color:var(--n-500); margin-top:1px;">${value}</div></div>` +
      right + `</div>`;
  }

  function escape(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  /* ─── Demo data ─── */
  const txData = {
    'tx1': { id: 'TXN-28410398281', method: 'Visa •• 4291', amount: '240,00 MAD', status: 'Réglé · en attente de règlement', date: '24 avril 2026 14:32', network: 'Visa', customer: 'Karim B. (régulier)', table: 'T4', cart: 'Tajine kefta · Thé menthe × 2', tip: '24,00 MAD (10%)', fee: 'Inclus · abonnement Kiwi', net: '240,00 MAD', card: 'Visa •• 4291', issuer: 'Attijariwafa Bank', country: '🇲🇦 Maroc', staff: 'Fatima Khalki' },
    'default': { id: 'TXN-0000', method: 'Paiement carte', amount: '180,00 MAD', status: 'Réglé', date: '24 avril 2026', network: 'Carte', customer: 'Client', table: '·', cart: '·', tip: '·', fee: 'Inclus · abonnement Kiwi', net: '180,00 MAD', card: '••••', issuer: '·', country: '·', staff: '·' }
  };

  /* ─── KPI detail drawer content (one rich view per metric) ─── */
  // Shared style helpers for inline composition
  const kpiHero = (big, sub, deltaTxt, deltaCls = 'good') => `
    <div style="display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; margin-bottom:6px;">
      <div style="font-size:42px; font-weight:600; letter-spacing:-0.035em; line-height:1; font-feature-settings:'tnum' 1;">${big}</div>
      ${deltaTxt ? `<div style="font-size:13px; font-weight:500; color:var(--${deltaCls === 'good' ? 'success' : deltaCls === 'warn' ? 'warning' : 'n-500'});">${deltaTxt}</div>` : ''}
    </div>
    <div style="font-size:13px; color:var(--n-500); margin-bottom:22px;">${sub}</div>
  `;
  const kpiSection = (label, body) => `
    <div style="margin-bottom:18px;">
      <div style="font-size:11px; letter-spacing:0.1em; color:var(--n-500); font-family:var(--mono); margin-bottom:10px;">${label}</div>
      ${body}
    </div>
  `;
  const kpiInsight = (text) => `
    <div style="padding:14px 16px; background:var(--atlas); color:var(--paper); border-radius:12px; display:flex; gap:12px; font-size:13px; line-height:1.45; margin-top:6px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:var(--mint); flex-shrink:0; margin-top:2px;"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/></svg>
      <div>${text}</div>
    </div>
  `;
  const kpiRow = (left, right, sub = '') => `
    <div style="display:grid; grid-template-columns:1fr auto; gap:12px; padding:10px 0; border-top:1px solid var(--n-200); font-size:13.5px; align-items:center;">
      <div><div style="font-weight:500;">${left}</div>${sub ? `<div style="font-size:11.5px; color:var(--n-500); margin-top:2px;">${sub}</div>` : ''}</div>
      <div style="font-family:var(--mono); font-weight:500; font-size:12.5px;">${right}</div>
    </div>
  `;
  const kpiFootBtns = (ghostLabel, atlasLabel) => `
    <button class="kb ghost" data-dismiss style="flex:1; justify-content:center;">${ghostLabel}</button>
    <button class="kb atlas" style="flex:1; justify-content:center;">${atlasLabel}</button>
  `;

  /* Short + long descriptions for personalised KPIs that have no hand-authored
     detail view — used to build a clean generic drawer on click. */
  const KPI_DESC = (KPI_DESC_STR[kiwiLang()] || KPI_DESC_STR.fr);
  const KPI_LONG = (KPI_LONG_STR[kiwiLang()] || KPI_LONG_STR.fr);

  const KPI_DATA_STR = {
    fr: {
      tx_title: 'Transactions',
      tx_subtitle: 'Vendredi 24 avril · service en cours',
      tx_foot_close: 'Fermer',
      tx_foot_journal: 'Voir le journal complet →',
      tx_hero_pic: 'Pic à 13h00 · 24 transactions sur l\'heure',
      tx_hero_delta: '↑ +24 vs hier (+15 %)',
      tx_section_repartition: 'RÉPARTITION HORAIRE',
      tx_section_server: 'PAR SERVEUR',
      tx_server_sofia: 'Sofia Belkadi',
      tx_server_sofia_role: 'barista · comptoir',
      tx_server_fatima: 'Fatima Khalki',
      tx_server_fatima_role: 'serveuse · salle',
      tx_server_hamid: 'Hamid Jelloul',
      tx_server_hamid_role: 'serveur · terrasse',
      tx_server_youssef: 'Youssef Amrani',
      tx_server_youssef_role: 'serveur · 17h-23h',
      tx_server_auto: 'Auto-caisse',
      tx_server_auto_role: 'sans contact',
      tx_insight: '<b style="color:var(--mint);">Insight :</b> Sofia transforme 54 % de plus que la moyenne salle. Lui assigner les tables T1-T3 ce soir pourrait ajouter ~2 400 MAD au service.',
      panier_title: 'Panier moyen',
      panier_subtitle: '24 dernières heures · tous canaux',
      panier_foot_ia: 'Activer recommandations IA →',
      panier_hero_median: 'Médiane 95 MAD · max 1 240 MAD (anniversaire T8)',
      panier_hero_delta: '≈ stable vs hier',
      panier_section_distribution: 'DISTRIBUTION DES TICKETS',
      panier_section_segmentation: 'SEGMENTATION',
      panier_segment_regulars: 'Clients réguliers',
      panier_segment_regulars_sub: '47 clients · ticket moyen',
      panier_segment_occasional: 'Clients occasionnels',
      panier_segment_occasional_sub: '108 clients · ticket moyen',
      panier_segment_tourists: 'Touristes (carte étrangère)',
      panier_segment_tourists_sub: '27 clients · ticket moyen',
      panier_insight: '<b style="color:var(--mint);">Insight :</b> Vos réguliers dépensent <b>+45 %</b> vs occasionnels. Les recommandations IA en fin de commande (« +1 thé pour 12 MAD ») peuvent lever le ticket moyen de <b>~12 %</b>.',
      tips_title: 'Pourboires',
      tips_subtitle: 'Cumul du jour · à distribuer en fin de service',
      tips_foot_distribute: 'Distribuer maintenant →',
      tips_hero_avg: '7,6 % du chiffre encaissé · taux moyen 8,2 %',
      tips_hero_delta: '↑ +32 % vs semaine',
      tips_section_prompt: 'PROMPT POURBOIRE',
      tips_prompt_auto: 'Prompt auto +10 %',
      tips_prompt_auto_sub: 'Affiché sur 78 % des tickets aujourd\'hui · taux d\'acceptation 64 %',
      tips_section_server: 'PAR SERVEUR',
      tips_server_sofia: 'Sofia Belkadi',
      tips_server_sofia_rate: 'taux 11,2 %',
      tips_server_fatima: 'Fatima Khalki',
      tips_server_fatima_rate: 'taux 8,8 %',
      tips_server_hamid: 'Hamid Jelloul',
      tips_server_hamid_rate: 'taux 7,4 %',
      tips_server_youssef: 'Youssef Amrani',
      tips_server_youssef_rate: 'taux 5,1 %',
      tips_section_period: 'PAR PÉRIODE',
      tips_period_breakfast: 'Petit-déj 8h-11h',
      tips_period_breakfast_rate: '1,8 % de taux',
      tips_period_lunch: 'Déjeuner 12h-15h',
      tips_period_lunch_rate: '7,4 % de taux',
      tips_period_snack: 'Goûter 15h-18h',
      tips_period_snack_rate: '4,2 % de taux',
      tips_period_dinner: 'Dîner 19h-23h',
      tips_period_dinner_rate: '11,8 % de taux',
      tips_insight: '<b style="color:var(--mint);">Insight :</b> Le taux du soir est <b>~3×</b> celui du midi. Activer un prompt « +15 % » spécifique après 20h pourrait ajouter <b>~280 MAD/soir</b>.',
      marge_title: 'Marge brute',
      marge_subtitle: 'Chiffre d\'affaires moins coût matière · 30 jours',
      marge_foot_cogs: 'Voir le coût matière →',
      marge_hero_cogs: 'Coût matière 28,6 % du CA · objectif ≤ 30 %',
      marge_hero_delta: '↑ +1,8 pt vs 30 jours préc.',
      marge_section_category: 'MARGE PAR CATÉGORIE',
      marge_cat_hot_drinks: 'Boissons chaudes',
      marge_cat_hot_drinks_sub: '28 % du CA',
      marge_cat_cold_drinks: 'Boissons fraîches',
      marge_cat_cold_drinks_sub: '17 % du CA',
      marge_cat_pastries: 'Pâtisseries maison',
      marge_cat_pastries_sub: '21 % du CA',
      marge_cat_dishes: 'Plats & salades',
      marge_cat_dishes_sub: '34 % du CA',
      marge_section_watch: 'À SURVEILLER',
      marge_watch_juice: 'Jus pressés',
      marge_watch_juice_sub: 'coût matière en hausse · +6 pts',
      marge_watch_lunch: 'Formule déjeuner',
      marge_watch_lunch_sub: 'marge sous l\'objectif',
      marge_insight: '<b style="color:var(--mint);">Insight :</b> Les boissons chaudes portent la marge, <b>+3 pts</b> possibles en déplaçant la mise en avant menu des plats vers le café et la pâtisserie.',
      success_title: 'Taux de succès',
      success_subtitle: 'Conformité réseau et passerelle Bank Al-Maghrib',
      success_foot_failures: 'Voir les échecs →',
      success_hero_attempts: '184 tentatives · 183 succès · 1 échec',
      success_hero_delta: '↑ +0,2 pt vs hier',
      success_section_benchmark: 'BENCHMARK MARCHÉ',
      success_bench_you: 'Café Atlas (vous)',
      success_bench_avg: 'Cafés Casa moyenne',
      success_bench_cmi: 'CMI traditionnel',
      success_bench_pci: 'Standard PCI-DSS',
      success_section_failure: 'UNIQUE ÉCHEC AUJOURD\'HUI',
      success_failure_card: 'Mastercard •• 7821 · 13:42',
      success_failure_reason: 'Code 51 · fonds insuffisants · BNP Paribas FR',
      success_failure_status: 'ÉCHEC',
      success_failure_recovery: 'Client a réessayé avec une autre carte 18 secondes plus tard · succès. Aucune perte.',
      success_section_health: 'SANTÉ TECHNIQUE',
      success_health_latency: 'Latence moyenne autorisation',
      success_health_latency_sub: 'p95 = 2,1 s',
      success_health_gateway: 'Disponibilité passerelle',
      success_health_gateway_sub: 'BAM + acquéreur',
      success_health_terminals: 'Terminaux en ligne',
      success_health_terminals_sub: '3 / 3 PAX A920',
      success_health_4g: 'Connectivité 4G secours',
      success_health_4g_sub: 'utilisée 0 fois',
      ratio_title: 'Ratio carte / espèces',
      ratio_subtitle: 'Mix de paiement · 24 dernières heures',
      ratio_foot_disable_cash: 'Désactiver l\'espèces →',
      ratio_hero_gain: 'Carte gagne 4 pts vs semaine dernière · +12 pts depuis lancement',
      ratio_hero_delta: '↑ +4 pts carte',
      ratio_section_means: 'DÉTAIL DES MOYENS',
      ratio_means_cash: 'Espèces',
      ratio_section_hidden_cost: 'COÛT CACHÉ DE L\'ESPÈCES',
      ratio_cost_bank: 'Tournée banque hebdo',
      ratio_cost_bank_sub: '~ 45 min de gérance · vendredi',
      ratio_cost_errors: 'Erreurs de caisse moy.',
      ratio_cost_errors_sub: '0,4 % du volume cash',
      ratio_cost_risk: 'Risque vol / perte',
      ratio_cost_risk_sub: 'absent en mode 100 % carte',
      ratio_cost_total: 'Total annuel évitable',
      ratio_cost_total_sub: '180 + 11 300 + risque',
      ratio_insight: '<b style="color:var(--mint);">Insight :</b> Si vous passez à 80 % carte (vs 68 % aujourd\'hui) avec un prompt « payez par carte = café offert le 10ᵉ », vous économisez <b>~12 800 MAD/an</b> de manipulation cash.',
      regulars_title: 'Clients réguliers',
      regulars_subtitle: 'Identifiés par carte tokenisée ou Kiwi Wallet',
      regulars_foot_loyalty: 'Lancer programme fidélité →',
      regulars_hero_base: '26 % de la base · taux de rétention 30 jours = 72 %',
      regulars_hero_delta: '↑ +9 nouveaux cette semaine',
      regulars_section_top5: 'TOP 5 RÉGULIERS · CE MOIS',
      regulars_top5_1_sub: '12 visites · 18 cafés · 6 tajines',
      regulars_top5_2_sub: '10 visites · membre depuis 2024',
      regulars_top5_3_sub: '9 visites · toujours T6',
      regulars_top5_4: 'Nawal Khalifi',
      regulars_top5_4_sub: '8 visites · payeur Kiwi Wallet',
      regulars_top5_5: 'Youssef Amrani (employé)',
      regulars_top5_5_sub: '8 visites · pause déj.',
      regulars_section_cohorts: 'COHORTES DE FRÉQUENCE',
      regulars_cohorts_1: '1ʳᵉ visite ce mois',
      regulars_cohorts_2: '2-3 visites',
      regulars_cohorts_3: '4-7 visites',
      regulars_cohorts_4: '8+ visites (hard core)',
      regulars_section_reactivate: 'CLIENTS À RÉACTIVER',
      regulars_reactivate_text: '<b>14 réguliers</b> n\'ont pas commandé depuis 6 semaines. Un message WhatsApp « on vous a manqué · −15 % la semaine prochaine » a converti <b>43 %</b> des relances le mois dernier.',
      regulars_insight: '<b style="color:var(--mint);">Insight :</b> Vos 19 hard-core représentent <b>34 % du chiffre</b> alors qu\'ils ne sont que 10 % de la base. Un programme de fidélité (10ᵉ café offert) coûterait <b>~280 MAD/mois</b> et garderait ce groupe à très haute valeur.',
      default_title: 'Métrique',
      default_body: '<p style="color:var(--n-600);">Analyse détaillée disponible ici.</p>'
    },
    en: {
      tx_title: 'Transactions',
      tx_subtitle: 'Friday, April 24 · service in progress',
      tx_foot_close: 'Close',
      tx_foot_journal: 'View full log →',
      tx_hero_pic: 'Peak at 1pm · 24 transactions in the hour',
      tx_hero_delta: '↑ +24 vs yesterday (+15%)',
      tx_section_repartition: 'HOURLY BREAKDOWN',
      tx_section_server: 'BY SERVER',
      tx_server_sofia: 'Sofia Belkadi',
      tx_server_sofia_role: 'barista · counter',
      tx_server_fatima: 'Fatima Khalki',
      tx_server_fatima_role: 'waitress · floor',
      tx_server_hamid: 'Hamid Jelloul',
      tx_server_hamid_role: 'waiter · terrace',
      tx_server_youssef: 'Youssef Amrani',
      tx_server_youssef_role: 'waiter · 5pm-11pm',
      tx_server_auto: 'Self-service checkout',
      tx_server_auto_role: 'contactless',
      tx_insight: '<b style="color:var(--mint);">Insight:</b> Sofia converts 54% more than the floor average. Assigning her tables T1-T3 tonight could add ~2,400 MAD to the service.',
      panier_title: 'Average Basket',
      panier_subtitle: 'Last 24 hours · all channels',
      panier_foot_ia: 'Activate AI recommendations →',
      panier_hero_median: 'Median 95 MAD · max 1,240 MAD (birthday T8)',
      panier_hero_delta: '≈ stable vs yesterday',
      panier_section_distribution: 'TICKET DISTRIBUTION',
      panier_section_segmentation: 'SEGMENTATION',
      panier_segment_regulars: 'Regular customers',
      panier_segment_regulars_sub: '47 customers · average ticket',
      panier_segment_occasional: 'Occasional customers',
      panier_segment_occasional_sub: '108 customers · average ticket',
      panier_segment_tourists: 'Tourists (foreign card)',
      panier_segment_tourists_sub: '27 customers · average ticket',
      panier_insight: '<b style="color:var(--mint);">Insight:</b> Your regulars spend <b>+45%</b> vs occasional customers. End-of-order AI recommendations ("+1 tea for 12 MAD") can lift the average ticket by <b>~12%</b>.',
      tips_title: 'Tips',
      tips_subtitle: 'Today\'s total · to be distributed at end of service',
      tips_foot_distribute: 'Distribute now →',
      tips_hero_avg: '7.6% of cashed revenue · average rate 8.2%',
      tips_hero_delta: '↑ +32% vs week',
      tips_section_prompt: 'TIP PROMPT',
      tips_prompt_auto: 'Auto prompt +10%',
      tips_prompt_auto_sub: 'Shown on 78% of tickets today · 64% acceptance rate',
      tips_section_server: 'BY SERVER',
      tips_server_sofia: 'Sofia Belkadi',
      tips_server_sofia_rate: '11.2% rate',
      tips_server_fatima: 'Fatima Khalki',
      tips_server_fatima_rate: '8.8% rate',
      tips_server_hamid: 'Hamid Jelloul',
      tips_server_hamid_rate: '7.4% rate',
      tips_server_youssef: 'Youssef Amrani',
      tips_server_youssef_rate: '5.1% rate',
      tips_section_period: 'BY PERIOD',
      tips_period_breakfast: 'Breakfast 8am-11am',
      tips_period_breakfast_rate: '1.8% rate',
      tips_period_lunch: 'Lunch 12pm-3pm',
      tips_period_lunch_rate: '7.4% rate',
      tips_period_snack: 'Afternoon 3pm-6pm',
      tips_period_snack_rate: '4.2% rate',
      tips_period_dinner: 'Dinner 7pm-11pm',
      tips_period_dinner_rate: '11.8% rate',
      tips_insight: '<b style="color:var(--mint);">Insight:</b> The evening rate is <b>~3×</b> the lunch rate. Activating a specific "+15%" prompt after 8pm could add <b>~280 MAD/evening</b>.',
      marge_title: 'Gross Margin',
      marge_subtitle: 'Revenue minus cost of goods · 30 days',
      marge_foot_cogs: 'View cost of goods →',
      marge_hero_cogs: 'Cost of goods 28.6% of revenue · target ≤ 30%',
      marge_hero_delta: '↑ +1.8 pt vs previous 30 days',
      marge_section_category: 'MARGIN BY CATEGORY',
      marge_cat_hot_drinks: 'Hot drinks',
      marge_cat_hot_drinks_sub: '28% of revenue',
      marge_cat_cold_drinks: 'Cold drinks',
      marge_cat_cold_drinks_sub: '17% of revenue',
      marge_cat_pastries: 'House pastries',
      marge_cat_pastries_sub: '21% of revenue',
      marge_cat_dishes: 'Dishes & salads',
      marge_cat_dishes_sub: '34% of revenue',
      marge_section_watch: 'TO WATCH',
      marge_watch_juice: 'Fresh juices',
      marge_watch_juice_sub: 'cost of goods rising · +6 pts',
      marge_watch_lunch: 'Lunch special',
      marge_watch_lunch_sub: 'margin below target',
      marge_insight: '<b style="color:var(--mint);">Insight:</b> Hot drinks are driving the margin, <b>+3 pts</b> possible by shifting menu promotion from dishes to coffee and pastry.',
      success_title: 'Success Rate',
      success_subtitle: 'Network compliance and Bank Al-Maghrib gateway',
      success_foot_failures: 'View failures →',
      success_hero_attempts: '184 attempts · 183 successes · 1 failure',
      success_hero_delta: '↑ +0.2 pt vs yesterday',
      success_section_benchmark: 'MARKET BENCHMARK',
      success_bench_you: 'Café Atlas (you)',
      success_bench_avg: 'Avg. Casablanca cafés',
      success_bench_cmi: 'Traditional CMI',
      success_bench_pci: 'PCI-DSS Standard',
      success_section_failure: 'TODAY\'S ONLY FAILURE',
      success_failure_card: 'Mastercard •• 7821 · 1:42pm',
      success_failure_reason: 'Code 51 · insufficient funds · BNP Paribas FR',
      success_failure_status: 'FAILED',
      success_failure_recovery: 'Customer retried with another card 18 seconds later · success. No loss.',
      success_section_health: 'TECHNICAL HEALTH',
      success_health_latency: 'Average authorization latency',
      success_health_latency_sub: 'p95 = 2.1 s',
      success_health_gateway: 'Gateway availability',
      success_health_gateway_sub: 'BAM + acquirer',
      success_health_terminals: 'Terminals online',
      success_health_terminals_sub: '3 / 3 PAX A920',
      success_health_4g: '4G backup connectivity',
      success_health_4g_sub: 'used 0 times',
      ratio_title: 'Card / Cash Ratio',
      ratio_subtitle: 'Payment mix · last 24 hours',
      ratio_foot_disable_cash: 'Disable cash →',
      ratio_hero_gain: 'Card gains 4 pts vs last week · +12 pts since launch',
      ratio_hero_delta: '↑ +4 pts card',
      ratio_section_means: 'MEANS OF PAYMENT DETAILS',
      ratio_means_cash: 'Cash',
      ratio_section_hidden_cost: 'HIDDEN COST OF CASH',
      ratio_cost_bank: 'Weekly bank run',
      ratio_cost_bank_sub: '~ 45 min of management time · Friday',
      ratio_cost_errors: 'Avg. cash register errors',
      ratio_cost_errors_sub: '0.4% of cash volume',
      ratio_cost_risk: 'Theft / loss risk',
      ratio_cost_risk_sub: 'absent in 100% card mode',
      ratio_cost_total: 'Total avoidable annual cost',
      ratio_cost_total_sub: '180 + 11,300 + risk',
      ratio_insight: '<b style="color:var(--mint);">Insight:</b> If you move to 80% card (vs 68% today) with a "pay by card = 10th coffee free" prompt, you save <b>~12,800 MAD/year</b> in cash handling.',
      regulars_title: 'Regular Customers',
      regulars_subtitle: 'Identified by tokenized card or Kiwi Wallet',
      regulars_foot_loyalty: 'Launch loyalty program →',
      regulars_hero_base: '26% of customer base · 30-day retention rate = 72%',
      regulars_hero_delta: '↑ +9 new this week',
      regulars_section_top5: 'TOP 5 REGULARS · THIS MONTH',
      regulars_top5_1_sub: '12 visits · 18 coffees · 6 tajines',
      regulars_top5_2_sub: '10 visits · member since 2024',
      regulars_top5_3_sub: '9 visits · always T6',
      regulars_top5_4: 'Nawal Khalifi',
      regulars_top5_4_sub: '8 visits · Kiwi Wallet payer',
      regulars_top5_5: 'Youssef Amrani (employee)',
      regulars_top5_5_sub: '8 visits · lunch break',
      regulars_section_cohorts: 'FREQUENCY COHORTS',
      regulars_cohorts_1: '1st visit this month',
      regulars_cohorts_2: '2-3 visits',
      regulars_cohorts_3: '4-7 visits',
      regulars_cohorts_4: '8+ visits (hard core)',
      regulars_section_reactivate: 'CUSTOMERS TO REACTIVATE',
      regulars_reactivate_text: '<b>14 regulars</b> haven\'t ordered in 6 weeks. A WhatsApp message "we missed you · -15% next week" converted <b>43%</b> of reactivations last month.',
      regulars_insight: '<b style="color:var(--mint);">Insight:</b> Your 19 hard-core regulars represent <b>34% of revenue</b> while being only 10% of the base. A loyalty program (10th coffee free) would cost <b>~280 MAD/month</b> and retain this high-value group.',
      default_title: 'Metric',
      default_body: '<p style="color:var(--n-600);">Detailed analysis available here.</p>'
    },
    ar: {
      tx_title: 'المعاملات',
      tx_subtitle: 'الجمعة 24 أبريل · الخدمة جارية',
      tx_foot_close: 'إغلاق',
      tx_foot_journal: 'عرض السجل الكامل →',
      tx_hero_pic: 'ذروة في الساعة 13:00 · 24 معاملة في الساعة',
      tx_hero_delta: '↑ +24 مقابل أمس (+15%)',
      tx_section_repartition: 'التوزيع بالساعة',
      tx_section_server: 'حسب النادل',
      tx_server_sofia: 'صوفيا بلقاضي',
      tx_server_sofia_role: 'باريستا · الكاونتر',
      tx_server_fatima: 'فاطمة خالقي',
      tx_server_fatima_role: 'نادلة · الصالة',
      tx_server_hamid: 'حميد جلول',
      tx_server_hamid_role: 'نادل · التراس',
      tx_server_youssef: 'يوسف العمراني',
      tx_server_youssef_role: 'نادل · 17:00-23:00',
      tx_server_auto: 'الدفع الذاتي',
      tx_server_auto_role: 'بدون تلامس',
      tx_insight: '<b style="color:var(--mint);">رؤية:</b> صوفيا تحول 54٪ أكثر من متوسط الصالة. تعيينها للطاولات T1-T3 هذا المساء قد يضيف ~2,400 درهم للخدمة.',
      panier_title: 'متوسط السلة',
      panier_subtitle: 'آخر 24 ساعة · جميع القنوات',
      panier_foot_ia: 'تفعيل توصيات الذكاء الاصطناعي →',
      panier_hero_median: 'الوسيط 95 درهم · الأقصى 1,240 درهم (عيد ميلاد T8)',
      panier_hero_delta: '≈ مستقر مقابل أمس',
      panier_section_distribution: 'توزيع التذاكر',
      panier_section_segmentation: 'تجزئة',
      panier_segment_regulars: 'العملاء المنتظمون',
      panier_segment_regulars_sub: '47 عميل · متوسط التذكرة',
      panier_segment_occasional: 'العملاء العرضيون',
      panier_segment_occasional_sub: '108 عميل · متوسط التذكرة',
      panier_segment_tourists: 'السياح (بطاقة أجنبية)',
      panier_segment_tourists_sub: '27 عميل · متوسط التذكرة',
      panier_insight: '<b style="color:var(--mint);">رؤية:</b> ينفق عملاؤك المنتظمون <b>+45%</b> أكثر من العملاء العرضيين. توصيات الذكاء الاصطناعي في نهاية الطلب ("+1 شاي مقابل 12 درهم") يمكن أن ترفع متوسط التذكرة بنسبة <b>~12%</b>.',
      tips_title: 'الإكراميات',
      tips_subtitle: 'الإجمالي اليومي · للتوزيع في نهاية الخدمة',
      tips_foot_distribute: 'التوزيع الآن →',
      tips_hero_avg: '7,6% من الإيرادات المحصلة · متوسط المعدل 8,2%',
      tips_hero_delta: '↑ +32% مقابل الأسبوع',
      tips_section_prompt: 'طلب الإكرامية',
      tips_prompt_auto: 'طلب تلقائي +10%',
      tips_prompt_auto_sub: 'معروض على 78% من التذاكر اليوم · معدل القبول 64%',
      tips_section_server: 'حسب النادل',
      tips_server_sofia: 'صوفيا بلقاضي',
      tips_server_sofia_rate: 'معدل 11,2%',
      tips_server_fatima: 'فاطمة خالقي',
      tips_server_fatima_rate: 'معدل 8,8%',
      tips_server_hamid: 'حميد جلول',
      tips_server_hamid_rate: 'معدل 7,4%',
      tips_server_youssef: 'يوسف العمراني',
      tips_server_youssef_rate: 'معدل 5,1%',
      tips_section_period: 'حسب الفترة',
      tips_period_breakfast: 'الفطور 8ص-11ص',
      tips_period_breakfast_rate: 'معدل 1,8%',
      tips_period_lunch: 'الغداء 12م-3م',
      tips_period_lunch_rate: 'معدل 7,4%',
      tips_period_snack: 'العصر 3م-6م',
      tips_period_snack_rate: 'معدل 4,2%',
      tips_period_dinner: 'العشاء 7م-11م',
      tips_period_dinner_rate: 'معدل 11,8%',
      tips_insight: '<b style="color:var(--mint);">رؤية:</b> معدل المساء هو <b>~3 أضعاف</b> معدل الغداء. تفعيل طلب "+15%" خاص بعد الساعة 8 مساءً يمكن أن يضيف <b>~280 درهم/مساء</b>.',
      marge_title: 'الهامش الإجمالي',
      marge_subtitle: 'الإيرادات ناقص تكلفة المواد · 30 يومًا',
      marge_foot_cogs: 'عرض تكلفة المواد →',
      marge_hero_cogs: 'تكلفة المواد 28,6% من الإيرادات · الهدف ≤ 30%',
      marge_hero_delta: '↑ +1,8 نقطة مقابل 30 يومًا سابقًا',
      marge_section_category: 'الهامش حسب الفئة',
      marge_cat_hot_drinks: 'المشروبات الساخنة',
      marge_cat_hot_drinks_sub: '28% من الإيرادات',
      marge_cat_cold_drinks: 'المشروبات الباردة',
      marge_cat_cold_drinks_sub: '17% من الإيرادات',
      marge_cat_pastries: 'المعجنات المنزلية',
      marge_cat_pastries_sub: '21% من الإيرادات',
      marge_cat_dishes: 'الأطباق والسلطات',
      marge_cat_dishes_sub: '34% من الإيرادات',
      marge_section_watch: 'للمراقبة',
      marge_watch_juice: 'العصائر الطازجة',
      marge_watch_juice_sub: 'ارتفاع تكلفة المواد · +6 نقاط',
      marge_watch_lunch: 'وجبة الغداء',
      marge_watch_lunch_sub: 'الهامش تحت الهدف',
      marge_insight: '<b style="color:var(--mint);">رؤية:</b> المشروبات الساخنة تدعم الهامش - <b>+3 نقاط</b> ممكنة عن طريق تحويل التركيز في القائمة من الأطباق إلى القهوة والمعجنات.',
      success_title: 'معدل النجاح',
      success_subtitle: 'امتثال الشبكة وبوابة بنك المغرب',
      success_foot_failures: 'عرض الإخفاقات →',
      success_hero_attempts: '184 محاولة · 183 نجاح · 1 فشل',
      success_hero_delta: '↑ +0,2 نقطة مقابل أمس',
      success_section_benchmark: 'مقارنة بالسوق',
      success_bench_you: 'مقهى أطلس (أنتم)',
      success_bench_avg: 'متوسط مقاهي الدار البيضاء',
      success_bench_cmi: 'CMI التقليدي',
      success_bench_pci: 'معيار PCI-DSS',
      success_section_failure: 'الفشل الوحيد اليوم',
      success_failure_card: 'ماستركارد •• 7821 · 13:42',
      success_failure_reason: 'الرمز 51 · أموال غير كافية · BNP Paribas FR',
      success_failure_status: 'فشل',
      success_failure_recovery: 'أعاد العميل المحاولة ببطاقة أخرى بعد 18 ثانية · نجاح. لا خسارة.',
      success_section_health: 'الصحة التقنية',
      success_health_latency: 'متوسط زمن استجابة التفويض',
      success_health_latency_sub: 'p95 = 2,1 ث',
      success_health_gateway: 'توفر البوابة',
      success_health_gateway_sub: 'بنك المغرب + المستحوذ',
      success_health_terminals: 'الأجهزة الطرفية متصلة',
      success_health_terminals_sub: '3 / 3 PAX A920',
      success_health_4g: 'اتصال 4G احتياطي',
      success_health_4g_sub: 'استخدم 0 مرات',
      ratio_title: 'نسبة البطاقة / النقد',
      ratio_subtitle: 'مزيج الدفع · آخر 24 ساعة',
      ratio_foot_disable_cash: 'تعطيل النقد →',
      ratio_hero_gain: 'البطاقة تكسب 4 نقاط مقابل الأسبوع الماضي · +12 نقطة منذ الإطلاق',
      ratio_hero_delta: '↑ +4 نقاط بطاقة',
      ratio_section_means: 'تفاصيل وسائل الدفع',
      ratio_means_cash: 'نقداً',
      ratio_section_hidden_cost: 'التكلفة الخفية للنقد',
      ratio_cost_bank: 'جولة البنك الأسبوعية',
      ratio_cost_bank_sub: '~ 45 دقيقة من وقت المدير · الجمعة',
      ratio_cost_errors: 'متوسط أخطاء الصندوق',
      ratio_cost_errors_sub: '0,4% من حجم النقد',
      ratio_cost_risk: 'مخاطر السرقة / الخسارة',
      ratio_cost_risk_sub: 'غير موجود في وضع البطاقة 100%',
      ratio_cost_total: 'إجمالي التكلفة السنوية التي يمكن تجنبها',
      ratio_cost_total_sub: '180 + 11 300 + المخاطر',
      ratio_insight: '<b style="color:var(--mint);">رؤية:</b> إذا انتقلت إلى 80٪ بطاقة (مقابل 68٪ اليوم) مع طلب "ادفع بالبطاقة = قهوة مجانية في المرة العاشرة" ، فإنك توفر <b>~12,800 درهم/سنويًا</b> من التعامل النقدي.',
      regulars_title: 'العملاء المنتظمون',
      regulars_subtitle: 'مُعرَّفون بالبطاقة المرمزة أو محفظة كيوي',
      regulars_foot_loyalty: 'إطلاق برنامج الولاء →',
      regulars_hero_base: '26٪ من قاعدة العملاء · معدل الاحتفاظ لمدة 30 يومًا = 72٪',
      regulars_hero_delta: '↑ +9 جدد هذا الأسبوع',
      regulars_section_top5: 'أفضل 5 عملاء منتظمين · هذا الشهر',
      regulars_top5_1_sub: '12 زيارة · 18 قهوة · 6 طواجن',
      regulars_top5_2_sub: '10 زيارات · عضو منذ 2024',
      regulars_top5_3_sub: '9 زيارات · دائما T6',
      regulars_top5_4: 'نوال خليفي',
      regulars_top5_4_sub: '8 زيارات · يدفع عبر محفظة كيوي',
      regulars_top5_5: 'يوسف العمراني (موظف)',
      regulars_top5_5_sub: '8 زيارات · استراحة الغداء',
      regulars_section_cohorts: 'مجموعات التردد',
      regulars_cohorts_1: 'الزيارة الأولى هذا الشهر',
      regulars_cohorts_2: '2-3 زيارات',
      regulars_cohorts_3: '4-7 زيارات',
      regulars_cohorts_4: '8+ زيارات (أساسيون)',
      regulars_section_reactivate: 'عملاء لإعادة التنشيط',
      regulars_reactivate_text: '<b>14 عميلًا منتظمًا</b> لم يطلبوا منذ 6 أسابيع. رسالة واتساب "لقد اشتقنا إليك · -15٪ الأسبوع المقبل" حولت <b>43٪</b> من عمليات إعادة التنشيط الشهر الماضي.',
      regulars_insight: '<b style="color:var(--mint);">رؤية:</b> يمثل عملاؤك الأساسيون الـ 19 نسبة <b>34٪ من الإيرادات</b> بينما يمثلون 10٪ فقط من القاعدة. سيكلف برنامج الولاء (القهوة العاشرة مجانًا) <b>~280 درهمًا/شهريًا</b> ويحتفظ بهذه المجموعة ذات القيمة العالية.',
      default_title: 'مقياس',
      default_body: '<p style="color:var(--n-600);">تحليل مفصل متاح هنا.</p>'
    }
  };

  const kpiData = {
    /* ════════ Transactions ════════ */
    'tx': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_journal),
      body: `
        ${kpiHero('182', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_hero_pic, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_section_repartition, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            <div style="display:flex; align-items:end; gap:4px; height:80px;">
              ${[4,6,9,12,18,24,21,13,10,9,13,18,25].map(n => {
                const peak = n >= 18;
                return `<div style="flex:1; background:${peak ? 'var(--atlas)' : '#B9E5CC'}; height:${(n/25)*100}%; border-radius:3px 3px 0 0; min-height:5px; transition:opacity 200ms;" title="${n} tx"></div>`;
              }).join('')}
            </div>
            <div style="display:flex; gap:4px; margin-top:8px; font-family:var(--mono); font-size:9.5px; color:var(--n-500);">
              ${['8h','9h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'].map(t => `<span style="flex:1; text-align:center;">${t}</span>`).join('')}
            </div>
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_section_server, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_sofia, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_sofia_role, '54 tx · 23 800 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_fatima, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_fatima_role, '42 tx · 18 200 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_hamid, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_hamid_role, '38 tx · 16 500 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_youssef, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_youssef_role, '25 tx · 11 200 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_auto, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_server_auto_role, '23 tx · 4 800 MAD'],
        ].map(([n, role, v]) => kpiRow(n, v, role)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_insight)}
      `
    },

    /* ════════ Panier moyen ════════ */
    'panier': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_foot_ia),
      body: `
        ${kpiHero('134 <span style="font-size:18px; color:var(--n-500); font-weight:500;">MAD</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_hero_median, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_hero_delta, 'neutral')}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_section_distribution, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              ['< 50 MAD',   38, '#B9E5CC'],
              ['50-100',     54, '#7FD4A4'],
              ['100-200',    58, 'var(--atlas)'],
              ['200-400',    24, '#B9E5CC'],
              ['> 400',       8, 'var(--mint-soft)'],
            ].map(([lbl, n, c]) => `
              <div style="display:grid; grid-template-columns:80px 1fr 36px; gap:10px; align-items:center; padding:5px 0; font-size:12.5px;">
                <div style="color:var(--n-600);">${lbl}</div>
                <div style="height:8px; background:var(--surface); border-radius:4px; overflow:hidden;"><div style="width:${(n/58)*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:end; font-weight:500;">${n}</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_section_segmentation, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_regulars, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_regulars_sub, '186 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_occasional, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_occasional_sub, '128 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_tourists, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_segment_tourists_sub, '184 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).panier_insight)}
      `
    },

    /* ════════ Pourboires ════════ */
    'tips': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_foot_distribute),
      body: `
        ${kpiHero('1 867 <span style="font-size:18px; color:var(--n-500); font-weight:500;">MAD</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_hero_avg, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_section_prompt, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:14px;">
            <div>
              <div style="font-weight:500; font-size:13.5px;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_prompt_auto}</div>
              <div style="font-size:11.5px; color:var(--n-500); margin-top:3px;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_prompt_auto_sub}</div>
            </div>
            <div style="width:38px; height:22px; background:var(--atlas); border-radius:999px; position:relative;">
              <div style="position:absolute; top:2px; right:2px; width:18px; height:18px; background:var(--surface); border-radius:50%;"></div>
            </div>
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_section_server, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_sofia, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_sofia_rate, '+654 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_fatima, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_fatima_rate, '+560 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_hamid, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_hamid_rate, '+467 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_youssef, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_server_youssef_rate, '+186 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_section_period, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_breakfast, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_breakfast_rate, '+120 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_lunch, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_lunch_rate, '+820 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_snack, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_snack_rate, '+92 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_dinner, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_period_dinner_rate, '+835 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tips_insight)}
      `
    },

    /* ════════ Marge brute ════════ */
    'marge': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_foot_cogs),
      body: `
        ${kpiHero('71,4 <span style="font-size:18px; color:var(--n-500); font-weight:500;">%</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_hero_cogs, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_section_category, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_hot_drinks, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_hot_drinks_sub, '82 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_cold_drinks, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_cold_drinks_sub, '74 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_pastries, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_pastries_sub, '66 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_dishes, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_cat_dishes_sub, '58 %'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_section_watch, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_watch_juice, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_watch_juice_sub, '61 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_watch_lunch, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_watch_lunch_sub, '54 %'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).marge_insight)}
      `
    },

    /* ════════ Taux de succès ════════ */
    'success': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_foot_failures),
      body: `
        ${kpiHero('99,32 <span style="font-size:18px; color:var(--n-500); font-weight:500;">%</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_hero_attempts, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_section_benchmark, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              [(() => { const r = (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_bench_you; const b = (window.KiwiMe && window.KiwiMe.business || '').trim(); return b ? r.replace(/^[^(]+/, b + ' ') : r; })(),   99.32, 'var(--atlas)'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_bench_avg,  99.00, '#7FD4A4'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_bench_cmi,    98.10, '#A8A49A'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_bench_pci,    97.50, 'var(--n-300)'],
            ].map(([lbl, pct, c]) => `
              <div style="display:grid; grid-template-columns:160px 1fr 50px; gap:10px; align-items:center; padding:6px 0; font-size:12.5px;">
                <div style="color:var(--n-600);">${lbl}</div>
                <div style="height:8px; background:var(--surface); border-radius:4px; overflow:hidden;"><div style="width:${(pct - 97) / 2.5 * 100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:end; font-weight:500;">${pct.toFixed(2).replace('.',',')} %</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_section_failure, `
          <div style="background:color-mix(in srgb, var(--danger) 10%, var(--surface)); border:1px solid color-mix(in srgb, var(--danger) 30%, transparent); border-radius:12px; padding:14px 16px;">
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
              <div>
                <div style="font-weight:500; font-size:13.5px;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_failure_card}</div>
                <div style="font-size:11.5px; color:#9B2F22; margin-top:3px;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_failure_reason}</div>
              </div>
              <span style="background:var(--surface); color:#9B2F22; padding:2px 8px; border-radius:999px; font-size:10.5px; font-family:var(--mono); font-weight:600;">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_failure_status}</span>
            </div>
            <div style="font-size:12px; color:var(--n-700);">${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_failure_recovery}</div>
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_section_health, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_latency, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_latency_sub, '1,4 s'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_gateway, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_gateway_sub, '100,00 %'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_terminals, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_terminals_sub, '✓'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_4g, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).success_health_4g_sub, '✓'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
      `
    },

    /* ════════ Ratio carte / cash ════════ */
    'ratio': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_foot_disable_cash),
      body: `
        ${kpiHero('68 / 32 <span style="font-size:18px; color:var(--n-500); font-weight:500;">%</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_hero_gain, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_section_means, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              ['Visa',          48, 'var(--atlas)',  '11 700 MAD'],
              ['Mastercard',    24, '#7DF2B0',       '5 850 MAD'],
              ['Kiwi Tap',      18, 'var(--riad)',   '4 388 MAD'],
              ['Kiwi Wallet QR',10, '#D99A2B',       '2 438 MAD'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_means_cash,       32, '#A8A49A',       '7 800 MAD'],
            ].map(([lbl, pct, c, mad]) => `
              <div style="display:grid; grid-template-columns:120px 1fr 50px 100px; gap:10px; align-items:center; padding:6px 0; font-size:12.5px;">
                <div style="display:flex; align-items:center; gap:8px; color:var(--n-700);"><i style="width:10px; height:10px; border-radius:3px; background:${c}; display:inline-block;"></i>${lbl}</div>
                <div style="height:8px; background:var(--surface); border-radius:4px; overflow:hidden;"><div style="width:${pct/48*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:end; font-weight:500;">${pct} %</div>
                <div style="font-family:var(--mono); text-align:end; color:var(--n-500); font-size:11.5px;">${mad}</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_section_hidden_cost, [
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_bank, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_bank_sub, '180 MAD/sem'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_errors, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_errors_sub, '~ 31 MAD/jour'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_risk, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_risk_sub, '·'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_total, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_cost_total_sub, '≈ 21 000 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).ratio_insight)}
      `
    },

    /* ════════ Clients réguliers ════════ */
    'regulars': {
      title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_title,
      subtitle: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_subtitle,
      foot: kpiFootBtns((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).tx_foot_close, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_foot_loyalty),
      body: `
        ${kpiHero('47 <span style="font-size:18px; color:var(--n-500); font-weight:500;">/ 182</span>', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_hero_base, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_hero_delta)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_section_top5, [
          ['Karim Bensouda', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_1_sub, '2 380 MAD'],
          ['Sara Lahlou', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_2_sub, '1 920 MAD'],
          ['Hicham Cherki', (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_3_sub, '1 740 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_4, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_4_sub, '1 480 MAD'],
          [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_5, (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_top5_5_sub, '420 MAD'],
        ].map(([n, sub, v]) => kpiRow(n, v, sub)).join(''))}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_section_cohorts, `
          <div style="background:var(--paper-soft); border-radius:12px; padding:14px 16px;">
            ${[
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_cohorts_1,  68,  '#B9E5CC'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_cohorts_2,         42,  '#7FD4A4'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_cohorts_3,         28,  'var(--atlas)'],
              [(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_cohorts_4, 19, 'var(--riad)'],
            ].map(([lbl, n, c]) => `
              <div style="display:grid; grid-template-columns:160px 1fr 36px; gap:10px; align-items:center; padding:5px 0; font-size:12.5px;">
                <div style="color:var(--n-700);">${lbl}</div>
                <div style="height:8px; background:var(--surface); border-radius:4px; overflow:hidden;"><div style="width:${n/68*100}%; height:100%; background:${c}; border-radius:4px;"></div></div>
                <div style="font-family:var(--mono); text-align:end; font-weight:500;">${n}</div>
              </div>
            `).join('')}
          </div>
        `)}
        ${kpiSection((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_section_reactivate, `
          <div style="padding:14px 16px; background:color-mix(in srgb, var(--warn-ink) 12%, var(--surface)); border:1px solid color-mix(in srgb, var(--warn-ink) 32%, transparent); border-radius:12px; font-size:13px; color:var(--warn-ink); line-height:1.5;">
            ${(KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_reactivate_text}
          </div>
        `)}
        ${kpiInsight((KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).regulars_insight)}
      `
    },

    'default': { title: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).default_title, body: (KPI_DATA_STR[kiwiLang()] || KPI_DATA_STR.fr).default_body }
  };


  const aiResponses = (AI_RESPONSES_STR[kiwiLang()] || AI_RESPONSES_STR.fr);

  /* ═══════════════════════ UNIVERSAL ROUTER ═══════════════════════ */
  /* Elements that OWN their own click handling — the fallback must not touch them */
  const SKIP_FALLBACK_ATTRS = ['data-close', 'data-dismiss', 'data-confirm', 'data-save', 'data-next', 'data-prev', 'data-pay', 'data-activate', 'data-send', 'data-sms', 'data-agent-approve', 'data-agent-dismiss', 'data-agent-run-all', 'data-filter-apply', 'data-mark-read', 'data-contact-go', 'data-login-go', 'data-to-signup', 'data-biz', 'data-en', 'data-amt', 'data-cap', 'data-rec', 'data-from', 'data-f', 'data-r', 'data-m', 'data-key', 'data-method', 'data-copy', 'data-share', 'data-upgrade', 'data-refund', 'data-print', 'data-new', 'data-gen', 'data-confirm-settle', 'data-ai-send', 'data-copilot-send', 'data-bubble-close', 'data-kiwi-skip'];
  const SKIP_FALLBACK_CONTAINERS = '.kiwi-modal, .kiwi-drawer, .kiwi-menu, .kp, .ai-drawer, .amount-pad, .mode-tg';

  function shouldSkipFallback(el) {
    if (!el) return true;
    if (el.closest(SKIP_FALLBACK_CONTAINERS)) return true;
    for (const attr of SKIP_FALLBACK_ATTRS) {
      if (el.hasAttribute(attr) || el.closest('[' + attr + ']')) return true;
    }
    return false;
  }

  /* Keyboard activation — div-based "buttons" (KPI tiles, feed/tx rows,
   * non-<button> [data-action] elements) aren't natively focusable-clickable.
   * Enter / Space on a focused one fires a real click, which the delegated
   * handler below then routes normally. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const el = document.activeElement;
    if (!el || el.tagName === 'BUTTON' || el.tagName === 'A' ||
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
    if (el.matches('.kpi-m, .kpi-c, .feed-row, .tx-row, [data-action]')) {
      e.preventDefault();
      el.click();
    }
  });

  document.addEventListener('click', (e) => {
    // 1. explicit data-action
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const a = actionEl.dataset.action;
      const arg = actionEl.dataset.arg;
      if (handlers[a]) { e.preventDefault(); handlers[a](actionEl, arg); return; }
    }

    // 2. range / tab toggles
    const rangeSpan = e.target.closest('.range span, .dash-range span');
    if (rangeSpan && !rangeSpan.classList.contains('on')) {
      rangeSpan.parentElement.querySelectorAll('span').forEach(s => s.classList.remove('on'));
      rangeSpan.classList.add('on');
      return;
    }

    // 3. Lang switch — delegated to i18n.js directly; no-op here to avoid double toast

    // 4. Smooth anchor scroll
    const anchor = e.target.closest('a[href^="#"]');
    if (anchor) {
      const id = anchor.getAttribute('href').slice(1);
      if (id) {
        const t = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (t) { e.preventDefault(); t.scrollIntoView({behavior:'smooth', block:'start'}); return; }
      }
    }

    // 5. AI drawer suggestion
    const sugg = e.target.closest('.sugg');
    if (sugg) { handlers['ai-suggest'](sugg); return; }

    // 6. AI drawer close
    if (e.target.closest('.ai-drawer .head .x')) { document.querySelector('.ai-drawer').style.display = 'none'; return; }

    // 8. feed-row → transaction detail
    const feedRow = e.target.closest('.feed-row, .tx-row');
    if (feedRow) { handlers['tx-detail'](feedRow, 'tx1'); return; }

    // 9. kpi-m / kpi-c → expand
    const kpi = e.target.closest('.kpi-m, .kpi-c');
    if (kpi && !e.target.closest('[data-action]')) {
      let arg = kpi.dataset.kpi;
      if (!arg) {
        const label = kpi.querySelector('.l, .lbl')?.textContent?.toLowerCase() || '';
        if (label.includes('transaction')) arg = 'tx';
        else if (label.includes('panier')) arg = 'panier';
        else if (label.includes('pourboire')) arg = 'tips';
        else if (label.includes('succès') || label.includes('success')) arg = 'success';
        else if (label.includes('ratio')) arg = 'ratio';
        else if (label.includes('régulier') || label.includes('regular')) arg = 'regulars';
        else arg = 'default';
      }
      handlers['kpi-detail'](kpi, arg);
      return;
    }

    // 10. Sidebar nav fallback: pages.js owns the [data-nav] click router
    //     (and full-page handlers own the active highlight via
    //     Kiwi.setActivePage). This branch only catches stray sidebar
    //     anchors that pages.js didn't claim — for them we just block the
    //     "#" jump so the page doesn't scroll to top.
    const sidebarLink = e.target.closest('.sidebar nav a');
    if (sidebarLink && !sidebarLink.dataset.action && sidebarLink.getAttribute('href') === '#') {
      e.preventDefault();
      return;
    }

    // 11. Location switcher
    const loc = e.target.closest('.loc-switch');
    if (loc) { handlers['location-switch'](loc); return; }

    // 12. Merchant profile (sidebar bottom)
    const merchant = e.target.closest('.sidebar .merchant');
    if (merchant) { handlers['profile-menu'](merchant); return; }

    // 13. Icon buttons in topbar
    if (e.target.closest('.icon-btn')) {
      const btn = e.target.closest('.icon-btn');
      const aria = btn.getAttribute('aria-label') || '';
      if (aria.toLowerCase().includes('notif')) { handlers.notifications(); return; }
      if (aria.toLowerCase().includes('param')) { handlers.settings(); return; }
      return;
    }

    // 14. Search bar
    if (e.target.closest('.search-big, .search')) { handlers.search(); return; }

    // 15. AI button in topbar — opens Kiwi AI Agent
    if (e.target.closest('.ai-btn')) {
      if (typeof handlers['open-assistant'] === 'function') { handlers['open-assistant'](); return; }
      if (window.KiwiAgent && typeof window.KiwiAgent.open === 'function') { window.KiwiAgent.open(); return; }
      return;
    }

    // 16. Team stack
    if (e.target.closest('.team-stack')) { handlers.notifications(); return; } // reuse drawer-style

    // 17. Store buttons (app store / google play)
    const store = e.target.closest('.store-btn');
    if (store) { handlers['download-app'](); return; }

    /* Passive widgets — integration cards, timeline days, heatmap cells,
     * staff / product rows, health & bench rows, testimonial / pricing /
     * roadmap / feature / security cards, social links, brand swatches, and
     * generic unwired buttons / pills — used to raise a "… clicked / … opened"
     * fallback toast on EVERY click. Removed: an interaction now either runs a
     * real handler from the steps above, or stays silent. */
  });

  /* Le raccourci imprimé sur la barre du haut. Il était écrit « ⌘K » en dur, dans
   * JetBrains Mono qui ne possède pas ce glyphe : sur toutes les machines le
   * navigateur dessinait un caractère de remplacement, et sous Windows — le
   * système de la caisse Kiwi — la touche annoncée n'existait de toute façon pas. */
  (function () {
    const go = function () {
      const isMac = (function () {
        try { return /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent); }
        catch (_) { return false; }
      })();
      document.querySelectorAll('[data-search-kbd]').forEach(function (el) {
        el.textContent = isMac ? '⌘K' : 'Ctrl K';
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  })();

  /* ─── Keyboard shortcuts ─── */
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); commandPalette(); }
    if ((e.metaKey || e.ctrlKey) && k === 'j') { e.preventDefault(); commandPalette(); }
    /* `e.target` peut être `document` et non un élément — le menu mobile ferme
     * les surfaces ouvertes par un Escape envoyé sur `document`. Sans le test
     * de type, .matches() n'existe pas et la touche jette. */
    if (e.key === '/' && !(e.target && typeof e.target.matches === 'function'
      && e.target.matches('input, textarea'))) { e.preventDefault(); commandPalette(); }
    if (k === 'arrowright' && document.querySelector('.deck')) {
      const slides = document.querySelectorAll('.slide');
      const cur = [...slides].findIndex(s => s.getBoundingClientRect().top >= -50);
      if (cur < slides.length - 1) slides[cur + 1]?.scrollIntoView({behavior:'smooth'});
    }
    if (k === 'arrowleft' && document.querySelector('.deck')) {
      const slides = document.querySelectorAll('.slide');
      const cur = [...slides].findIndex(s => s.getBoundingClientRect().top >= -50);
      if (cur > 0) slides[cur - 1]?.scrollIntoView({behavior:'smooth'});
    }
  });

  /* ─── Global handle for escape on drawers/modals is done per-instance ─── */

  /* ─── Sidebar selector state machine ────────────────────────────────────
   * Single source of truth: `activePage` is the data-nav key of the
   * full-page view currently rendered in main (`accueil`, `tables`,
   * `menu`, `stock`, `equipe`, `payroll`, …). Drawers/modals NEVER touch
   * it — they're overlays, not navigation.
   *
   * Full-page handlers call setActivePage('<key>') on enter and
   * setActivePage('accueil') on exit (showDashboard). The drawer close()
   * logic re-syncs the sidebar from this state so closing a drawer over a
   * full-page leaves the selector pinned on that page, not flipped home.
   * ───────────────────────────────────────────────────────────────────── */
  let activePage = 'accueil';
  const syncSidebar = () => {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    nav.querySelectorAll('a[data-nav]').forEach((a) => a.classList.remove('active'));
    const target = nav.querySelector(`a[data-nav="${activePage}"]`)
                || nav.querySelector('a[data-nav="accueil"]');
    if (target) target.classList.add('active');
  };
  const setActivePage = (key) => {
    activePage = key || 'accueil';
    syncSidebar();
  };

  /* ─── Expose a tiny API for inline usage if needed ─── */
  const fullpage = (opts) => drawer({ ...opts, fullpage: true });

  /* Re-host a destination's content as a full .app page — the standard format
   * already used by Stock / Conformité / Menu / Équipe (body.page-X swap). Lets
   * every sidebar destination open the same way instead of some sliding in as a
   * partial side panel. Content keeps its [data-action] wiring (global delegation). */
  (function injectGenpageCss() {
    const css = `
      .dash-genpage { display: none; padding: 0 0 48px; }
      body.page-genpage .page-head,
      body.page-genpage .dash-date-range,
      body.page-genpage .dash-standard,
      body.page-genpage .dash-fusion,
      body.page-genpage .dash-equipe,
      body.page-genpage .dash-menu,
      body.page-genpage .dash-stock,
      body.page-genpage .dash-finance,
      body.page-genpage .dash-payroll { display: none !important; }
      body.page-genpage .dash-genpage { display: block; animation: fade-in 220ms ease-out; }`;
    /* Head/body/foot TYPOGRAPHY lives in assets/genpage.css, not here. This
     * block is injected into <head> at runtime, so it sits after every <link>
     * and would outrank the stylesheet on every tie — which is exactly how the
     * old 34px/Arial head survived three attempts to restyle it from CSS. What
     * stays here is the shell gating above (which page-* class hides which
     * sibling), because that is structural and other modules depend on it. */
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  })();
  function appPage(navKey, opts) {
    const o = opts || {};
    // Mount into the same content wrapper the other .app-swap pages live in
    // (the .container column), not .app directly — otherwise it lands in the
    // sidebar grid column.
    const container = document.querySelector('.container')
      || (document.querySelector('.dash-standard') && document.querySelector('.dash-standard').parentElement)
      || document.querySelector('.app');
    if (!container) return null;
    /* Fresh host per render — destinations attach click listeners to the
     * host element, so reusing one node would stack duplicate listeners
     * across page visits. Replacing it lets them die with the old node. */
    const stale = container.querySelector('.dash-genpage');
    if (stale) stale.remove();
    const host = document.createElement('div'); host.className = 'dash-genpage'; container.appendChild(host);
    // Head — plain text via textContent (native-escaped, no injection).
    const head = document.createElement('div'); head.className = 'genpage-head';
    const h1 = document.createElement('h1'); h1.textContent = o.title || ''; head.appendChild(h1);
    /* Context line. Callers pass one " · "-joined string ("Maison Mansour ·
     * Guéliz · 20 produits · base partagée avec la caisse"). Rendered flat, the
     * separators carry the same weight as the words and the line reads as a
     * run-on. Split into spans and the middots become 3px dots at n-300, so the
     * eye gets the rhythm for free — and no caller has to change. Still
     * textContent per segment, so this is native-escaped exactly as before. */
    if (o.subtitle) {
      const p = document.createElement('p');
      String(o.subtitle).split(' · ').forEach((seg, i) => {
        if (i) { const d = document.createElement('i'); d.className = 'dot'; d.setAttribute('aria-hidden', 'true'); p.appendChild(d); }
        const s = document.createElement('span'); s.className = 'seg'; s.textContent = seg; p.appendChild(s);
      });
      head.appendChild(p);
    }
    host.appendChild(head);
    // Body / foot — trusted app-rendered HTML (same contract as Kiwi.drawer's body).
    const bodyEl = document.createElement('div'); bodyEl.className = 'genpage-body';
    bodyEl.insertAdjacentHTML('beforeend', o.body || '');
    host.appendChild(bodyEl);
    if (o.foot) { const f = document.createElement('div'); f.className = 'genpage-foot'; f.insertAdjacentHTML('beforeend', o.foot); host.appendChild(f); }
    // Swap into the page: clear any active page class, mark this one.
    pageShell('genpage');
    const bc = document.querySelector('.breadcrumb');
    if (bc) {
      bc.textContent = 'Accueil ';
      const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '/'; bc.appendChild(sep);
      bc.appendChild(document.createTextNode(' '));
      const b = document.createElement('b'); b.textContent = o.title || ''; bc.appendChild(b);
    }
    setActivePage(navKey);
    document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.remove('active'));
    const navEl = document.querySelector(`.sidebar nav a[data-nav="${navKey}"]`);
    if (navEl) navEl.classList.add('active');
    window.scrollTo({ top: 0 });
    /* Move screen-reader/keyboard focus to the new page's heading — without
     * this, focus stays on the sidebar link and the page change is silent. */
    h1.setAttribute('tabindex', '-1');
    try { h1.focus({ preventScroll: true }); } catch (_) { h1.focus(); }
    /* close() mirrors the drawer API so handlers converted from drawer() to
     * appPage() keep their dismiss wiring — "closing" a page returns home. */
    return { el: host, close: () => { if (handlers['nav-accueil']) handlers['nav-accueil'](); } };
  }

  /* Switch the dashboard's page shell. Exactly ONE body.page-* class may be set:
   * each shell hides its siblings with `display: none !important`, so two at once
   * means the page you navigated TO renders at zero height and the merchant sees
   * the page they left — or nothing at all.
   *
   * Every page module used to hand-maintain its own list of siblings to remove,
   * and none of the lists was complete: team.js didn't clear page-conformite, so
   * Conformité → Équipe showed Conformité; stock.js didn't clear page-finance;
   * finance.js didn't clear page-conformite; nobody cleared page-genpage. This
   * sweeps whatever is there, which is what appPage() has always done, so a new
   * shell can never be forgotten by an older module. Pass no name to clear. */
  function pageShell(name) {
    const b = document.body;
    [...b.classList].forEach((c) => { if (c.indexOf('page-') === 0) b.classList.remove(c); });
    if (name) b.classList.add('page-' + name);
  }

  window.Kiwi = {
    toast, buttonFeedback, modal, drawer, fullpage, appPage, menu, commandPalette, confetti, handlers,
    setActivePage, syncSidebar, pageShell,
    get activePage() { return activePage; },
  };

})();

/* ═══════════════════════ KEYBOARD ACCESSIBILITY ═══════════════════════
 * The UI routes interaction through [data-action] on plain div/span
 * elements. Native <button>/<a> already handle the keyboard; this layer
 * makes the non-native [data-action] controls focusable and Enter/Space-
 * activatable, and gives keyboard-focused controls a visible focus ring.
 * Additive and self-contained — it never touches the click router. */
(() => {
  'use strict';
  const NATIVE = { A: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1 };

  function enhance(el) {
    if (NATIVE[el.tagName] || el.dataset.kbReady) return;
    el.dataset.kbReady = '1';
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  }
  function scan(node) {
    if (!node || (node.nodeType !== 1 && node.nodeType !== 9)) return;
    if (node.matches && node.matches('[data-action]')) enhance(node);
    if (node.querySelectorAll) node.querySelectorAll('[data-action]').forEach(enhance);
  }

  // Enter / Space on a focused non-native [data-action] → synthesize a click,
  // which the existing click router handles unchanged.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest && e.target.closest('[data-action]');
    if (!el || NATIVE[el.tagName]) return;
    e.preventDefault();
    el.click();
  });

  function init() {
    const st = document.createElement('style');
    st.textContent =
      '[data-action]:focus-visible,[data-nav]:focus-visible,.kpi-m:focus-visible,' +
      '.lang span:focus-visible{outline:2px solid var(--atlas,#0B6E4F);' +
      'outline-offset:2px;border-radius:6px}';
    document.head.appendChild(st);
    scan(document);
    if (document.body) {
      new MutationObserver((muts) => {
        muts.forEach((m) => m.addedNodes.forEach(scan));
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
