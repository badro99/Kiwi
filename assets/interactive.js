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
      revPerDay:  'Chiffre d\'affaires moyen par jour d\'ouverture (un jour avec au moins une vente).',
      marge:      'Part du CA conservée après coût matière.',
      profit:     'Ce qu\'il reste après le coût matière.',
      cogs:       'Dépense en matières premières.',
      tips:       'Pourboires déclarés à la clôture des journées, ou saisis à l\'encaissement tant que la journée est ouverte.',
      success:    'Paiements aboutis · créneaux remplis.',
      ratio:      'Répartition des paiements carte vs espèces.',
      regulars:   'Clients du carnet venus sur la période et déjà venus avant.',
      retention:  'Part des clients venus sur la période qui étaient déjà venus.',
      newClients: 'Clients du carnet venus pour la première fois sur la période.',
      txPerDay:   'Nombre de ventes moyen par jour d\'ouverture (un jour avec au moins une vente).',
      tauxRetour: 'Part des ventes de la période remboursée, en valeur.',
      tempsTable: 'Durée moyenne d\'une table, de l\'installation au départ, sur les tables libérées de la période.',
    },
    en: {
      tx:         'Number of sales over the period.',
      panier:     'Average amount spent per sale.',
      revenue:    'Total cashed in over the period.',
      revPerDay:  'Average revenue per trading day (a day with at least one sale).',
      marge:      'Share of revenue kept after food cost.',
      profit:     'What remains after cost of goods.',
      cogs:       'Expenditure on raw materials.',
      tips:       'Tips declared when each day was closed, or entered at payment while the day is still open.',
      success:    'Successful payments · slots filled.',
      ratio:      'Card vs cash payment split.',
      regulars:   'Customers in your book who came this period and had come before.',
      retention:  'Share of this period\'s customers who had come before.',
      newClients: 'Customers in your book whose first visit falls in the period.',
      txPerDay:   'Average number of sales per trading day (a day with at least one sale).',
      tauxRetour: 'Share of the period\'s sales refunded, by value.',
      tempsTable: 'Average time a table is taken, from seating to departure, over the tables freed in the period.',
    },
    ar: {
      tx:         'عدد المبيعات خلال الفترة.',
      panier:     'متوسط المبلغ المنفق لكل عملية.',
      revenue:    'إجمالي المقبوضات خلال الفترة.',
      revPerDay:  'متوسط الإيرادات في يوم العمل (يوم سُجّلت فيه عملية بيع واحدة على الأقل).',
      marge:      'نسبة المداخيل المحتفظ بها بعد تكلفة المواد.',
      profit:     'ما يتبقى بعد تكلفة المواد.',
      cogs:       'الإنفاق على المواد الأولية.',
      tips:       'الإكراميات المصرّح بها عند إغلاق كل يوم، أو المسجّلة عند الأداء ما دام اليوم مفتوحا.',
      success:    'المدفوعات الناجحة · الحصص المملوءة.',
      ratio:      'توزيع المدفوعات بالبطاقة مقابل النقد.',
      regulars:   'زبائن الدفتر الذين جاؤوا خلال الفترة وسبق أن جاؤوا قبلها.',
      retention:  'حصة زبائن الفترة الذين سبق أن جاؤوا.',
      newClients: 'زبائن الدفتر الذين جاؤوا لأول مرة خلال الفترة.',
      txPerDay:   'متوسط عدد المبيعات في يوم العمل (يوم سُجّلت فيه عملية بيع واحدة على الأقل).',
      tauxRetour: 'حصة مبيعات الفترة التي تم استردادها، بالقيمة.',
      tempsTable: 'متوسط مدة شغل الطاولة، من الجلوس إلى المغادرة، للطاولات التي أُخليت خلال الفترة.',
    }
  };

  const KPI_LONG_STR = {
    fr: {
      revenue:    'Le chiffre d\'affaires additionne toutes vos ventes encaissées, espèces, carte et mobile, sur la période choisie. C\'est le point de départ de tous vos calculs de marge et de rentabilité.',
      revPerDay:  'Le chiffre d\'affaires divisé par le nombre de jours d\'ouverture. Utile pour comparer des périodes de longueurs différentes et repérer vos meilleurs jours.',
      profit:     'Le bénéfice brut, c\'est le chiffre d\'affaires moins le coût des matières premières. Il ne tient pas encore compte des charges fixes, loyer, salaires, énergie.',
      cogs:       'Le coût matière regroupe tout ce que vous achetez pour produire vos ventes : ingrédients, boissons, consommables. Le surveiller protège directement votre marge.',
      tips:       'Les pourboires que la caisse a déclarés à la clôture des journées de la période. Une journée encore ouverte compte les pourboires saisis à l\'encaissement, jusqu\'à sa clôture. Ils reviennent à l\'équipe et n\'entrent pas dans votre chiffre d\'affaires.',
      retention:  'Parmi les clients identifiés à la caisse et venus sur la période, la part de ceux qui étaient déjà venus avant. Les ventes sans client rattaché n\'entrent pas dans le calcul. Un taux élevé signale une clientèle fidèle, bien moins coûteuse à servir qu\'à conquérir.',
      newClients: 'Les clients identifiés à la caisse dont la première visite tombe dans la période. Une vente sans client rattaché n\'est pas comptée. C\'est votre rythme d\'acquisition de nouveaux clients.',
      txPerDay:   'Le nombre de ventes moyen par jour d\'ouverture, un bon indicateur de fréquentation, indépendant du montant dépensé.',
    },
    en: {
      revenue:    'Revenue is the sum of all your collected sales, cash, card, and mobile, over the chosen period. It\'s the starting point for all your margin and profitability calculations.',
      revPerDay:  'Revenue divided by the number of opening days. Useful for comparing periods of different lengths and identifying your best days.',
      profit:     'Gross profit is revenue minus the cost of raw materials. It does not yet account for fixed costs, rent, salaries, energy.',
      cogs:       'Cost of goods sold includes everything you buy to produce your sales: ingredients, drinks, consumables. Monitoring it directly protects your margin.',
      tips:       'The tips your till declared when it closed each day of the period. A day still open counts the tips entered at payment until it is closed. They belong to the team and are not included in your revenue.',
      retention:  'Among the customers identified at the till who came this period, the share who had come before. Sales with no customer attached are left out. A high rate signals a loyal customer base, much cheaper to serve than to acquire.',
      newClients: 'Customers identified at the till whose first visit falls in the period. A sale with no customer attached is not counted. This is your new customer acquisition rate.',
      txPerDay:   'The average number of sales per opening day, a good indicator of footfall, independent of the amount spent.',
    },
    ar: {
      revenue:    'الإيرادات هي مجموع كل مبيعاتك المحصلة - نقدًا، بالبطاقة، وعبر الهاتف المحمول - خلال الفترة المختارة. إنها نقطة الانطلاق لجميع حسابات الهامش والربحية.',
      revPerDay:  'الإيرادات مقسومة على عدد أيام العمل. مفيد لمقارنة فترات مختلفة الطول وتحديد أفضل أيامك.',
      profit:     'الربح الإجمالي هو الإيرادات مطروحًا منها تكلفة المواد الأولية. لا يأخذ في الاعتبار بعد التكاليف الثابتة - الإيجار والرواتب والطاقة.',
      cogs:       'تكلفة المواد المباعة تشمل كل ما تشتريه لإنتاج مبيعاتك: المكونات والمشروبات والمواد الاستهلاكية. مراقبتها تحمي هامشك مباشرة.',
      tips:       'الإكراميات التي صرّح بها الصندوق عند إغلاق كل يوم من الفترة. يوم لا يزال مفتوحا يُحتسب بالإكراميات المسجّلة عند الأداء إلى أن يُغلق. تعود للفريق ولا تدخل في رقم معاملاتك.',
      retention:  'من بين الزبائن المعرَّفين في الصندوق الذين جاؤوا خلال الفترة، حصة من سبق لهم المجيء. البيوع غير المرتبطة بزبون لا تدخل في الحساب. يشير المعدل المرتفع إلى زبائن أوفياء، خدمتهم أرخص بكثير من كسب زبائن جدد.',
      newClients: 'الزبائن المعرَّفون في الصندوق الذين تقع زيارتهم الأولى في الفترة. لا يُحتسب بيع غير مرتبط بزبون. هذا هو إيقاع كسبك لزبائن جدد.',
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
          settlement_ready_title: (amount) => `Virement de ${amount} prêt`,
          settlement_ready_desc: 'Votre règlement T+1 est prêt et sera viré demain à 9h.',
          time_12_min: 'il y a 12 min',
          terminal_offline_title: 'Terminal T2 hors ligne',
          terminal_offline_desc: 'Le terminal de la terrasse semble déconnecté depuis 1 heure.',
          time_1_hr: 'il y a 1 h',
          ai_suggestion_title: 'Suggestion Kiwi AI',
          ai_suggestion_desc: 'Le taux de pourboire du soir est 3x celui du midi. Pensez à activer un prompt +15% après 20h.',
          time_2_hr: 'il y a 2 h',
          yesterday_tx_title: 'Résumé transactions hier',
          yesterday_tx_desc: (amount) => `Vous avez encaissé ${amount} sur 251 transactions.`,
          time_yesterday_2345: 'Hier, 23:45',
          fatima_signed_title: 'Fatima Khalki a signé son contrat',
          fatima_signed_desc: 'Le document est disponible dans votre espace RH.',
          time_yesterday_2100: 'Hier, 21:00',
          mark_all_read: 'Marquer tout comme lu'
      },
      en: {
          title: 'Notifications',
          subtitle: '3 unread',
          settlement_ready_title: (amount) => `Settlement of ${amount} ready`,
          settlement_ready_desc: 'Your D+1 settlement is ready and will be transferred tomorrow at 9am.',
          time_12_min: '12 min ago',
          terminal_offline_title: 'Terminal T2 offline',
          terminal_offline_desc: 'The terrace terminal seems to have been disconnected for 1 hour.',
          time_1_hr: '1 hr ago',
          ai_suggestion_title: 'Kiwi AI Suggestion',
          ai_suggestion_desc: 'The evening tip rate is 3x the lunch rate. Consider activating a +15% prompt after 8pm.',
          time_2_hr: '2 hr ago',
          yesterday_tx_title: 'Yesterday\'s transaction summary',
          yesterday_tx_desc: (amount) => `You collected ${amount} from 251 transactions.`,
          time_yesterday_2345: 'Yesterday, 11:45 PM',
          fatima_signed_title: 'Fatima Khalki signed her contract',
          fatima_signed_desc: 'The document is available in your HR space.',
          time_yesterday_2100: 'Yesterday, 9:00 PM',
          mark_all_read: 'Mark all as read'
      },
      ar: {
          title: 'الإشعارات',
          subtitle: '3 غير مقروءة',
          settlement_ready_title: (amount) => `تسوية بقيمة ${amount} جاهزة`,
          settlement_ready_desc: 'تسوية ي+1 جاهزة وسيتم تحويلها غدًا الساعة 9 صباحًا.',
          time_12_min: 'قبل 12 دقيقة',
          terminal_offline_title: 'الجهاز T2 غير متصل',
          terminal_offline_desc: 'يبدو أن جهاز التراس غير متصل منذ ساعة واحدة.',
          time_1_hr: 'قبل ساعة',
          ai_suggestion_title: 'اقتراح من ذكاء كيوي الاصطناعي',
          ai_suggestion_desc: 'معدل الإكرامية المسائية هو 3 أضعاف معدل الغداء. فكر في تفعيل مطالبة +15% بعد الساعة 8 مساءً.',
          time_2_hr: 'قبل ساعتين',
          yesterday_tx_title: 'ملخص معاملات الأمس',
          yesterday_tx_desc: (amount) => `لقد حصّلت ${amount} من 251 معاملة.`,
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
  /* The close button is absolute: the head keeps its width free, and both follow the reading direction. */
  .kiwi-modal-head { padding: 24px 28px 16px; padding-inline-end: 64px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .kiwi-modal-head h3 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.025em; }
  .kiwi-modal-head p { margin: 5px 0 0; font-size: 14px; color: var(--n-500); line-height: 1.45; }
  .kiwi-modal-head .tag { display: inline-block; margin-bottom: 10px; padding: 4px 10px; background: var(--mint-soft); color: var(--riad); border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
  html[data-theme="dark"] .kiwi-modal-head .tag { color: var(--mint, #7DF2B0); background: rgba(125,242,176,0.14); }
  .kiwi-modal-body { padding: 0 28px 24px; overscroll-behavior: contain; }
  .kiwi-modal-foot { padding: 16px 28px; border-top: 1px solid var(--n-200); display: flex; justify-content: flex-end; gap: 10px; background: color-mix(in srgb, var(--surface) 50%, transparent); border-radius: 0 0 22px 22px; }
  .kiwi-modal-close { position: absolute; top: 18px; inset-inline-end: 18px; width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--n-200); background: var(--surface); color: var(--n-500); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 150ms, opacity 150ms, background-color 150ms, border-color 150ms, color 150ms, box-shadow 150ms; z-index: 2; }
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
  .kp-head .kp-esc { font-family: var(--mono); font-size: 11px; background: var(--n-100); padding: 3px 8px; border-radius: 5px; color: var(--n-500); border: 1px solid var(--n-200); flex-shrink: 0; }
  .kp-sect { padding: 12px 20px 6px; font-size: 11px; font-weight: 500; color: var(--n-500); letter-spacing: 0.1em; text-transform: uppercase; font-family: var(--mono);
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
  .kp-item .kpi-k { font-family: var(--mono); font-size: 11px; color: var(--n-500); background: var(--n-100); padding: 2px 6px; border-radius: 5px; border: 1px solid var(--n-200); }
  .kp-empty { padding: 34px 20px 32px; text-align: center; }
  .kp-empty-t { font-size: 14px; font-weight: 500; color: var(--ink); }
  .kp-empty-s { margin-top: 6px; font-size: 12.5px; color: var(--n-500); max-width: 340px; margin-inline: auto; line-height: 1.5; }
  .kp-foot { padding: 10px 20px; border-top: 1px solid var(--n-200); display: flex; justify-content: space-between; align-items: center; background: var(--surface); font-size: 11px; color: var(--n-500); }
  .kp-foot .kp-count { color: var(--n-500); font-variant-numeric: tabular-nums; }
  /* « ⌘ » n'existe pas dans JetBrains Mono : sans repli système le navigateur
     dessine un tofu, et le raccourci se lit comme une croix. */
  .kp-foot .kp-sc { font-family: var(--mono), -apple-system, BlinkMacSystemFont, "Segoe UI Symbol", sans-serif; color: var(--n-500); }
  .kp-foot span { display: inline-flex; align-items: center; gap: 6px; }
  .kp-foot kbd { font-family: var(--mono); background: var(--n-100); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--n-200); font-size: 11px; }

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
  .kiwi-menu-head { padding: 8px 12px; font-size: 11px; color: var(--n-500); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; }

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
  .ord-hero { background: linear-gradient(135deg, var(--paper-soft) 0%, var(--ord-hero-end, #EFEAE0) 120%); border-radius: 14px; padding: 20px 22px; margin-bottom: 20px; position: relative; overflow: hidden; }
  html[data-theme="dark"] .ord-hero { --ord-hero-end: rgba(255,255,255,0.06); }
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
  .ord-stat .lbl { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); font-family: var(--mono); }
  .ord-stat .val { font-size: 14.5px; font-weight: 600; margin-top: 4px; letter-spacing: -0.01em; color: var(--ink); }
  .ord-stat .sub { font-size: 11px; color: var(--n-500); margin-top: 1px; }

  .ord-section-lbl { font-size: 11px; letter-spacing: 0.10em; color: var(--n-500); font-family: var(--mono); text-transform: uppercase; margin-bottom: 10px; }

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
  .kb.primary { background: var(--inverse-surface); color: var(--inverse-ink); }
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
  /* Échap ferme la fenêtre du DESSUS, et elle seule. Une fenêtre ouverte
     depuis un tiroir (supprimer une variante depuis la fiche produit)
     écoutait Échap comme le tiroir dessous : une touche fermait les deux, et
     le commerçant perdait la fiche qu'il lisait. Le dessus, c'est la dernière
     couche ouverte du document ; une couche qui s'efface ne compte plus. */
  function escOwnedBy(back, e) {
    if (e.key !== 'Escape' || e.__kiwiEscTaken) return false;
    const open = Array.prototype.filter.call(
      document.querySelectorAll('.kiwi-backdrop, .kiwi-drawer-backdrop'),
      (el) => el.style.pointerEvents !== 'none');
    if (open[open.length - 1] !== back) return false;
    e.__kiwiEscTaken = true;
    return true;
  }

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
      back.classList.remove('in'); back.style.pointerEvents = 'none'; // a fading sheet must not swallow the next tap
      setTimeout(() => back.remove(), 280);
      document.removeEventListener('keydown', esc);
      releaseFocus();
      unlockPageScroll();
    };
    const esc = (e) => { if (escOwnedBy(back, e)) close(); };
    document.addEventListener('keydown', esc);
    /* « Annuler », « Fermer », « Plus tard » : un bouton [data-dismiss] ferme la
       fenêtre, comme il ferme déjà un tiroir. Jusqu'ici chaque appelant devait
       le brancher lui-même ; une vingtaine l'avaient oublié (dont la
       suppression d'un produit), et leur « Annuler » ne faisait rien.
       close() est idempotent : ceux qui le branchent encore ne ferment pas
       deux fois. */
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-dismiss]')) close(); });
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
    /* Une fenêtre qui sert à saisir (un code scanné, un nombre d'étiquettes)
       désigne son champ par [data-autofocus] : la douchette tape là, et pas
       dans la croix de fermeture. Un setTimeout côté appelant perdait la
       course contre cette image sur un appareil lent. */
    requestAnimationFrame(() => {
      /* Déjà dans la fenêtre (on a touché un champ et on tape) : on ne bouge
         pas. Sur un appareil chargé cette image arrivait après les premières
         lettres, renvoyait le focus sur la croix, et la suite du nom partait
         dans les raccourcis du tableau de bord (un rapport ouvert, d'autres
         fenêtres) au lieu du champ. */
      const at = document.activeElement;
      if (at && at !== panel && panel.contains(at)) return;
      const want = panel.querySelector('[data-autofocus]');
      if (want && !want.disabled) { want.focus(); if (want.select && want.hasAttribute('data-autofocus-select')) want.select(); return; }
      (focusables()[0] || panel).focus();
    });
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
  let lockedBody = null;
  function lockPageScroll() {
    const n = (window.__kiwiScrollLocks || 0) + 1;
    window.__kiwiScrollLocks = n;
    if (n !== 1) return;
    const body = document.body;
    const properties = ['position', 'top', 'left', 'right', 'width'];
    lockedBody = { x: window.scrollX, y: window.scrollY,
      styles: properties.map(key => [key, body.style.getPropertyValue(key), body.style.getPropertyPriority(key)]) };
    document.documentElement.classList.add('kiwi-locked');
    body.style.setProperty('position', 'fixed', 'important');
    body.style.setProperty('top', -lockedBody.y + 'px', 'important');
    body.style.setProperty('left', -lockedBody.x + 'px', 'important');
    body.style.setProperty('right', '0', 'important');
    body.style.setProperty('width', '100%', 'important');
  }
  function unlockPageScroll() {
    const n = Math.max(0, (window.__kiwiScrollLocks || 0) - 1);
    window.__kiwiScrollLocks = n;
    if (n !== 0) return;
    document.documentElement.classList.remove('kiwi-locked');
    if (!lockedBody) return;
    const saved = lockedBody;
    lockedBody = null;
    saved.styles.forEach(([key, value, priority]) => value
      ? document.body.style.setProperty(key, value, priority) : document.body.style.removeProperty(key));
    // A smooth-scroll page must not animate restoration after a sheet closes.
    const html = document.documentElement, before = html.style.getPropertyValue('scroll-behavior');
    const priority = html.style.getPropertyPriority('scroll-behavior');
    html.style.setProperty('scroll-behavior', 'auto', 'important');
    window.scrollTo(saved.x, saved.y);
    if (before) html.style.setProperty('scroll-behavior', before, priority);
    else html.style.removeProperty('scroll-behavior');
  }
  /* Filet de sécurité. Une quinzaine d'appels retirent encore une couche par
   * `.remove()` au lieu de passer par son close() : le compteur restait > 0,
   * html.kiwi-locked restait posé, et la page ne défilait plus jusqu'au
   * rechargement — dans plusieurs types de commerce. Règle : quand la dernière
   * couche qui verrouille quitte le DOM, la page est libérée. Les trois seuls
   * détenteurs du verrou sont listés ici (modal, drawer, fiche Conformité).
   * Le verrou du code PIN (style inline sur <html>) n'est jamais touché. */
  const LOCKING_LAYERS = '.kiwi-backdrop, .kiwi-drawer-backdrop, .cf-eq-detail-bd, .dr-sheet-veil, .dr-sheet[aria-modal]';
  const isLayer = (n) => n.nodeType === 1
    && ((n.matches && n.matches(LOCKING_LAYERS)) || (n.querySelector && n.querySelector(LOCKING_LAYERS)));
  const watchLayers = () => new MutationObserver((records) => {
    if (!window.__kiwiScrollLocks && !document.documentElement.classList.contains('kiwi-locked')) return;
    if (!records.some((r) => Array.prototype.some.call(r.removedNodes, isLayer))) return;
    if (document.querySelector(LOCKING_LAYERS)) return;
    window.__kiwiScrollLocks = 1;
    unlockPageScroll();
  }).observe(document.body, { childList: true });
  if (document.body) watchLayers();
  else document.addEventListener('DOMContentLoaded', watchLayers, { once: true });

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
      back.classList.remove('in'); back.style.pointerEvents = 'none';
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
    const esc = (e) => { if (escOwnedBy(back, e)) close(); };
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
    try { return (window.KiwiNumber?.format(v, {}) ?? v.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})) + ' MAD'; } catch (_) { return v + ' MAD'; }
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

  /* Display currencies. kiwiSet:currency keeps the French label it has always
   * stored (« MAD · Dirham marocain »); only its three-letter code is read
   * back, so the name follows the screen's language and old values still work. */
  const CURRENCY_NAMES = {
    MAD: { fr: 'Dirham marocain', en: 'Moroccan dirham', ar: 'الدرهم المغربي' },
    EUR: { fr: 'Euro', en: 'Euro', ar: 'اليورو' },
    USD: { fr: 'Dollar US', en: 'US dollar', ar: 'الدولار الأمريكي' },
    GBP: { fr: 'Livre sterling', en: 'Pound sterling', ar: 'الجنيه الإسترليني' },
  };
  const currencyLabel = (stored) => {
    const code = String(stored || 'MAD').slice(0, 3).toUpperCase();
    return CURRENCY_NAMES[code] ? code + ' · ' + tr(CURRENCY_NAMES[code]) : String(stored);
  };

  /* <<split:moved>> handlers, render helpers and KPI data live in assets/interactive/handlers.js
     and assets/interactive/helpers.js (loaded just before this file). */
  function escape(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  const { KPI_DESC, KPI_LONG, aiResponses, kpiData, kpiHero, kpiInsight, kpiSection, materialSymbol, methodsKey, methodsSaved, morningPush, settingsRow, txData } = window.__kiwiInteractiveParts.helpers.call(this, { AI_RESPONSES_STR, KPI_DESC_STR, KPI_LONG_STR, escape, kiwiLang, toast, tr });
  const handlers = window.__kiwiInteractiveParts.handlers.call(this, { CP_STR, CURRENCY_NAMES, GENERAL_STR, I, KPI_DESC, KPI_LONG, LOGIN_STR, NOTIFICATIONS_STR, SIGNUP_STR, aiResponses, appPage, commandPalette, confetti, currencyLabel, drawer, escape, kiwiLang, kpiData, kpiHero, kpiInsight, kpiSection, materialSymbol, menu, methodsKey, methodsSaved, modal, morningPush, settingsRow, toast, tr, txData });
  /* <</split:moved>> */

  /* ═══════════════════════ UNIVERSAL ROUTER ═══════════════════════ */
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
    /* Le lien de vue (assets/view-link.js) recopie la page dans l'adresse. */
    try { document.dispatchEvent(new CustomEvent('kiwi:page', { detail: { key: activePage } })); } catch (_) {}
    /* Home again, and the page that painted the crumb no longer owns <body>:
     * an appPage() page has no showDashboard() of its own to reset it, so
     * « Accueil / Réservations » stayed over the dashboard. */
    if (activePage === 'accueil') crumbHome();
  };
  /* Paramètres is an app page whose copy is written by tr() when it renders,
   * so nothing in it carries data-i18n. Picking a language from its own
   * « Langue de l'application » row left the whole page in the old language
   * until it was reopened. Redraw it in place, at the same scroll position. */
  window.addEventListener('kiwi:langchange', () => {
    if (activePage !== 'settings' || !document.body.classList.contains('page-genpage') || !handlers.settings) return;
    const y = window.scrollY;
    handlers.settings();
    window.scrollTo({ top: y });
  });

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
  /* ─── Topbar breadcrumb · « Accueil / <page> » ───────────────────────────
   * The one painter for every full-page view (appPage, Stock, Équipe,
   * Conformité, Marges, Menu, Paie). Each used to write its own innerHTML with
   * a literal « Accueil », so English and Arabic read « Accueil / Team ».
   *
   *   Kiwi.breadcrumb(title)  title is a string, a {fr, en, ar} map, or a
   *                           function returning either. A map or a function
   *                           is read again on every language switch.
   *   Kiwi.breadcrumb()       back to the dashboard: hands the node back to
   *                           i18n.js's dash.breadcrumb, in the current language.
   *
   * setLang() rewrites every [data-i18n] node, this one included, BEFORE it
   * fires kiwi:langchange, so an open page's crumb came back as « Home /
   * Dashboard ». The listener below repaints it, but only while the page that
   * painted it still owns <body> (its page-* class): a page closed without a
   * reset must not come back over the dashboard. */
  const CRUMB_HOME = { fr: 'Accueil', en: 'Home', ar: 'الرئيسية' };
  let crumb = null; // { title, page } of the open page's crumb, null on the dashboard
  let lastGenPage = null; // navKey of the appPage() view currently mounted
  const bodyPage = () => [...document.body.classList].find((c) => c.indexOf('page-') === 0) || '';
  function crumbText(title) {
    const t = typeof title === 'function' ? title() : title;
    return t != null && typeof t === 'object' ? tr(t) : String(t ?? '');
  }
  function paintCrumb(bc, text) {
    bc.textContent = '';
    const home = document.createElement('span'); home.className = 'breadcrumb-home'; home.textContent = tr(CRUMB_HOME); bc.appendChild(home);
    bc.appendChild(document.createTextNode(' '));
    const sep = document.createElement('span'); sep.className = 'sep'; sep.setAttribute('aria-hidden', 'true'); sep.textContent = '/'; bc.appendChild(sep);
    bc.appendChild(document.createTextNode(' '));
    const b = document.createElement('b'); b.textContent = text; bc.appendChild(b);
  }
  function breadcrumb(title) {
    const bc = document.querySelector('.breadcrumb');
    if (title === undefined) {
      crumb = null;
      if (bc) window.KiwiI18n?.apply?.(bc);
      return;
    }
    crumb = { title, page: bodyPage() };
    if (bc) paintCrumb(bc, crumbText(title));
  }
  function crumbHome() {
    if (crumb && bodyPage() !== crumb.page) breadcrumb();
  }
  window.addEventListener('kiwi:langchange', () => {
    if (!crumb) return;
    if (bodyPage() !== crumb.page) { crumb = null; return; }
    const bc = document.querySelector('.breadcrumb');
    if (bc) paintCrumb(bc, crumbText(crumb.title));
  });
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
    /* Un repeint n'est pas une navigation. Plusieurs destinations rappellent
     * appPage() pour se redessiner dès que leurs données bougent — le pointage
     * relu à la seconde (team.js), le rapport journalier à chaque vente qui
     * arrive de la caisse, les réservations, la note d'un séjour. Remonter en
     * haut à ce moment-là arrache la page des yeux de quelqu'un qui lisait,
     * quelques secondes après qu'il a lâché la molette, et il n'a rien
     * demandé. Le saut en haut appartient au CHANGEMENT de page ; le repeint
     * de la page déjà à l'écran garde la position de lecture. */
    const repaint = !!stale && lastGenPage === navKey
      && document.body.classList.contains('page-genpage');
    const keepY = repaint ? (window.scrollY || 0) : 0;
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
    /* The title is the caller's string: a language switch keeps it as is, and
     * a caller that re-renders on kiwi:langchange calls appPage() again. */
    breadcrumb(o.title || '');
    setActivePage(navKey);
    if (navKey !== 'payroll' && navKey !== 'equipe') {
      try { window.__kiwiTeamDeactivate?.(); } catch (_) {}
    }
    document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.remove('active'));
    const navEl = document.querySelector(`.sidebar nav a[data-nav="${navKey}"]`);
    if (navEl) navEl.classList.add('active');
    lastGenPage = navKey;
    window.scrollTo({ top: keepY });
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
    setActivePage, syncSidebar, pageShell, breadcrumb,
    scrollLock: { acquire() {
      lockPageScroll();
      let held = true;
      return () => { if (held) { held = false; unlockPageScroll(); } };
    } },
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
