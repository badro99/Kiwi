/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · i18n + theme layer
 *
 * Usage:
 *   <html lang="fr"> is default. Elements with data-i18n="key" are swapped.
 *   Language switch: click span[data-lang] inside .lang; or call setLang('en'|'ar'|'fr').
 *   Theme toggle: button.theme-tg; or call setTheme('dark'|'light').
 *   Both are persisted via localStorage.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  /* ─── TRANSLATIONS ─── */
  const T = {
    en: {
      /* Nav */
      'nav.products': 'Products',
      'nav.pricing': 'Pricing',
      'nav.security': 'Security',
      'nav.dashboard': 'Dashboard',
      'nav.about': 'About',
      'nav.login': 'Sign in',
      'nav.start': 'Get started',
      'nav.pos': 'POS',
      'nav.wallet': 'Wallet',
      'nav.identity': 'Identity',
      'nav.pitch': 'Pitch',
      'nav.download': 'Download',
      'nav.kit': 'Download kit',
      'nav.home': 'Home',

      /* Hero landing */
      'hero.pill': 'Approved under Bank Al-Maghrib sponsorship · PE license in progress',
      'hero.title': 'The bank<br/>of the Moroccan<br/><em>merchant</em>.',
      'hero.lede': 'Kiwi runs your storefront. MAD 399/month all-in, hardware included, zero commitment. Built for Morocco\'s cafés, restaurants, and shops.',
      'hero.cta.start': 'Start — free',
      'hero.cta.demo': 'See the demo',
      'hero.micro': '<b>2,140 merchants</b> active · <b>3.2 Bn MAD</b> processed in 2025 · Casablanca, Rabat, Marrakech',

      /* Trust */
      'trust.label': 'Compliance & security',

      /* Stats */
      'stats.eyebrow': 'Kiwi by the numbers',
      'stats.title': 'Built to run the Morocco that moves.',
      'stats.1.l': 'MAD processed for our merchants in 2025.',
      'stats.2.l': 'Card transaction success rate.',
      'stats.3.l': 'Average settlement to your Moroccan IBAN.',
      'stats.4.l': 'Shops, cafés, and restaurants live on Kiwi.',

      /* Products */
      'products.eyebrow': 'Our products',
      'products.title': 'Three ways to accept payment. Zero hassle.',
      'products.desc': 'From the phone in your pocket to the connected register, Kiwi gives you tools Square, Toast, and Stripe reserved for developed markets. In Morocco, it\'s our turn.',
      'p1.tag': 'Kiwi Tap · SoftPOS',
      'p1.title': 'Your phone becomes a terminal.',
      'p1.body': 'Download the app, verify your ID in 3 minutes, accept contactless cards on your Android. Zero hardware to buy.',
      'p2.tag': 'Kiwi Station · Register',
      'p2.title': 'Register, menu, tables. One screen.',
      'p2.body': 'Dual display, built-in printer, Wi-Fi + 4G backup. Designed for restaurants open lunch and dinner.',
      'p3.tag': 'Kiwi Wallet · Consumer',
      'p3.title': 'Your customers pay in one tap.',
      'p3.body': 'Instant QR, split bills with friends, cashback at your neighbors. The Kiwi wallet arrives in Phase 2 — your customers, direct.',

      /* Feature rows */
      'f1.eyebrow': 'Settlement',
      'f1.title': 'T+1. Not "2 to 3 business days."',
      'f1.body': 'Your money lands on your Moroccan IBAN the next morning at 9am. Always. No hidden fees, no lost batches, no calls to the bank.',
      'f1.li.1': 'Automatic daily settlement, weekends included.',
      'f1.li.2': 'Optional <b>instant</b> payout via Instant Transfer for 1.50 MAD.',
      'f1.li.3': 'Daily report sent to the owner on WhatsApp.',
      'f2.eyebrow': 'Restaurants',
      'f2.title': 'Tables, bills, tips. In Darija if you want.',
      'f2.body': 'Kiwi isn\'t a terminal in disguise. It\'s real restaurant software, built for Moroccan rhythms: continuous service, Ramadan, terraces, splitting a bill between 6 friends.',
      'f2.li.1': 'Visual floor plan, table and cover management.',
      'f2.li.2': 'Split bill in 2 taps, custom tips (5/10/15%).',
      'f2.li.3': 'Full interface in <b>French, transliterated Darija, and RTL Arabic</b>.',
      'f2.li.4': 'Glovo and Jumia Food reconciliation at service close.',
      'f3.eyebrow': 'Onboarding',
      'f3.title': 'In 3 minutes, not 3 weeks.',
      'f3.body': 'A registration number, an ID, a photo. You scan, Kiwi validates. You start taking cards from your phone while the mail brings your terminal in 48 hours.',
      'f3.li.1': '100% digital signup via WhatsApp or app.',
      'f3.li.2': 'Biometric KYC with CIN + selfie in 90 seconds.',
      'f3.li.3': 'No branch visit. No registered mail.',

      /* Restaurants section */
      'rest.pill': 'For restaurants & cafés',
      'rest.title.1': 'Morocco eats out. ',
      'rest.title.2': 'Why doesn\'t your register follow?',
      'rest.lede': '73,305 restaurants and cafés in Morocco. 80% still don\'t accept cards. Kiwi gives them a register worthy of Paris or Dubai, at Moroccan pricing.',

      /* Pricing */
      'price.eyebrow': 'Transparent pricing',
      'price.title': 'Finally, a price you can put on a wall.',
      'price.desc': 'CMI contracts advertise 1.8%. In reality, with rental, maintenance, and minimum billing, the real cost for a restaurant at 200,000 MAD/month climbs to <b>4,300 MAD</b>. With Kiwi, one monthly subscription covers everything.',
      'price.old.title': 'Traditional acquirer',
      'price.old.big': '2.00',
      'price.old.sub': 'Advertised · actually 2.1% with hidden fees',
      'price.new.title': 'Kiwi Basic',
      'price.new.big': '399 <span style="font-size:0.4em; opacity:0.6;">MAD/month</span>',
      'price.new.sub': 'All-in — cancel anytime',
      'price.badge': 'Recommended',
      'price.bottom': 'For a café at <b>200,000 MAD/month</b> of card volume — you save <b style="color:var(--atlas);">~47,000 MAD per year</b> vs CMI. <b>Kiwi Pro</b> at 699 MAD/month unlocks multi-terminal, stock and API.',

      /* Testimonials */
      'testi.eyebrow': 'Our merchants',
      'testi.title': 'Restaurants that refused cards. Now they prefer them.',

      /* Security */
      'sec.pill': 'Bank-grade',
      'sec.title': 'Every dirham encrypted. Every movement audited.',
      'sec.body': 'Kiwi operates under the regulatory framework of Bank Al-Maghrib via a licensed principal acquirer partnership. Sensitive data is hosted in Morocco. Payments are tokenized. Your compliance is included by default.',
      'sec.cta': 'Security whitepaper',

      /* Final */
      'final.pill': 'First 100 restaurants — 6 months free',
      'final.title': 'Your register deserves <em>better</em><br/>than what you were sold.',
      'final.desc': 'Start accepting cards in 3 minutes. No commitment, no hardware to buy, no hidden fees.',
      'final.cta.create': 'Create my Kiwi account',
      'final.cta.advisor': 'Talk to an advisor',
      'final.micro': 'Onboarding in French, Darija or Arabic · WhatsApp support 7 days a week',

      /* Footer */
      'foot.products': 'Products',
      'foot.company': 'Company',
      'foot.resources': 'Resources',
      'foot.legal': 'Legal',
      'foot.about': 'About',
      'foot.brand': 'Identity',
      'foot.careers': 'Careers',
      'foot.press': 'Press',
      'foot.contact': 'Contact',
      'foot.help': 'Help',
      'foot.docs': 'Documentation',
      'foot.status': 'Status',
      'foot.blog': 'Blog',
      'foot.terms': 'Terms',
      'foot.privacy': 'Privacy',
      'foot.security': 'Security',
      'foot.compliance': 'Compliance',
      'foot.brand.tag': 'The new bank of the Moroccan merchant. Built in Casablanca, designed for the Morocco of tomorrow.',

      /* Press label */
      'press.label': 'As seen in',

      /* Dashboard */
      'dash.hello': 'Hello Rachid,',
      'dash.day': 'good day?',
      'dash.sub': 'Friday, April 24, 2026 · Lunch service in progress',
      'dash.today': 'Today',
      'dash.export': 'Export',
      'dash.newsale': 'Take payment',
      'dash.live': 'LIVE',
      'dash.cashed': 'CASHED TODAY',
      'dash.vsYesterday': 'VS YESTERDAY',
      'dash.vsWeek': 'VS WEEK',
      'dash.vsMonth': 'VS LAST MONTH',
      'dash.netKiwi': 'NET AFTER KIWI',
      'dash.goal': 'DAILY GOAL',
      'dash.range.pill.today': 'Today',
      'dash.range.pill.yesterday': 'Yesterday',
      'dash.range.pill.7d': '7 days',
      'dash.range.pill.30d': '30 days',
      'dash.range.pill.custom': 'Custom',
      'dash.compare': 'Compare',
      'dash.compare.vs.today': 'vs. Yesterday',
      'dash.compare.vs.hier': 'vs. Day before',
      'dash.compare.vs.7d':   'vs. Previous 7 days',
      'dash.compare.vs.30d':  'vs. Previous 30 days',
      'dash.compare.vs.custom': 'vs. Previous period',
      'dash.revenueByHour': 'REVENUE PER HOUR · TODAY',
      'dash.ai.label': 'KIWI AI — SUMMARY',
      'dash.hero.ai.eyebrow': 'KIWI AI',
      'dash.hero.ai.title': "Today's recommendations",
      'dash.hero.ai.rec1.title': 'Your 3pm-5pm lull is untapped potential',
      'dash.hero.ai.rec1.obs': "Between 3pm and 5pm you bring in only 8% of daily revenue. Yet it's when guests stay seated the longest (47 min average, vs 31 min at lunch).",
      'dash.hero.ai.rec1.act': '→ A « goûter » menu with mint tea and msemen at a reduced price could lift table turnover by 20-30%.',
      'dash.hero.ai.rec2.title': 'Tajine kefta drives your best average check',
      'dash.hero.ai.rec2.obs': 'Ordered 32 times today (top seller), with an associated average check of 180 MAD vs 130 MAD overall. Tajine guests also order more drinks and desserts.',
      'dash.hero.ai.rec2.act': '→ Featuring tajine kefta on the dinner menu could lift your average check by 15%.',
      'dash.hero.ai.input.placeholder': 'Ask a question about your restaurant...',
      'dash.hero.ai.soon': 'Coming soon',
      'dash.hh.title': 'PEAK HOURS',
      'dash.hh.less': 'Less activity',
      'dash.hh.more': 'More activity',
      'dash.hh.ai.eyebrow': 'KIWI AI · OPPORTUNITY',
      'dash.hh.ai.title':   'Launch a Glovo delivery combo for 3pm–5pm',
      'dash.hh.ai.obs':     'During this lull, your dining room runs at 22% capacity but staff is available. A Tajine kefta + mint tea combo at 75 MAD on Glovo typically captures 8–12 orders per afternoon at similar Maarif cafés.',
      'dash.hh.ai.cta':     '→ Set up the Glovo combo',
      // ─── Multi-venue: sidebar headers + sub-nav per vertical ───
      'sidebar.section.restaurant': 'Restaurant',
      'sidebar.section.boutique':   'Boutique',
      'sidebar.section.spa':        'Wellness space',
      'sidebar.section.bank':       'Merchant banking',
      'sidebar.restaurant.tables':  'Tables & checks',
      'sidebar.restaurant.menu':    'Menu & modifiers',
      'sidebar.restaurant.kds':     'Kitchen display (KDS)',
      'sidebar.restaurant.stock':   'Ingredient stock',
      'sidebar.boutique.inventory': 'Product inventory',
      'sidebar.boutique.categories':'Categories',
      'sidebar.boutique.promos':    'Promotions & offers',
      'sidebar.boutique.returns':   'Returns & exchanges',
      'sidebar.spa.appointments':   'Appointment calendar',
      'sidebar.spa.services':       'Services & packages',
      'sidebar.spa.practitioners':  'Practitioners',
      'sidebar.spa.clients':        'Client records',
      // KPI labels per vertical (dynamic — additive to existing dash.kpi.*)
      'dash.kpi.returnRate':       'Return rate',
      'dash.kpi.loyalCustomers':   'Loyal customers',
      'dash.kpi.appointments':     'Appointments',
      'dash.kpi.fillRate':         'Fill rate',
      // Mix de paiement footer — venue-typed
      'dash.mix.savings.label':    'Savings vs CMI:',
      'dash.mix.savings.year':     'See annual',
      // Footer
      'dash.footer.sponsor':       'operated under Bank Al-Maghrib sponsorship',
      'dash.footer.help':          'WhatsApp help',
      'dash.mix.center.unit': 'MAD card',
      'dash.settle.instant': 'Settle instantly',
      'dash.kpi.tx': 'Transactions',
      'dash.kpi.basket': 'Avg basket',
      'dash.kpi.tips': 'Tips',
      'dash.kpi.success': 'Success rate',
      'dash.kpi.ratio': 'Card / cash ratio',
      'dash.kpi.regular': 'Regulars',
      'dash.rev.title': 'Revenue & transactions',
      'dash.rev.sub': 'Compared to the previous week · auto-refresh 60s',
      'dash.mix.title': 'Payment mix',
      'dash.mix.sub': 'Today',
      'dash.heat.title': 'Sales intensity · hour × day',
      'dash.heat.sub': 'Last 30 days — identify your peak hours',
      'dash.feed.title': 'Live transactions',
      'dash.feed.sub': 'Last 6 · real-time feed',
      'dash.settle.big': 'NEXT SETTLEMENT',
      'dash.timeline.title': 'Settlement calendar',
      'dash.timeline.sub': 'Next 7 days',
      'dash.health.title': 'Kiwi health score',
      'dash.health.sub': 'Measured over 90 days · active factors',
      'dash.bench.title': 'You vs similar cafés',
      'dash.bench.sub': '147 Casablanca cafés · same avg ticket range',
      'dash.products.title': 'Top products',
      'dash.products.sub': 'Today · all items',
      'dash.staff.title': 'Team performance',
      'dash.staff.sub': 'Service in progress · PIN connected',
      'dash.integ.title': 'Active integrations',
      'dash.integ.sub': 'The tools Kiwi syncs for you',

      /* Wallet */
      'wal.pill': 'Kiwi Wallet · Available 2026 Q3',
      'wal.title.1': 'The Moroccan',
      'wal.title.em': 'wallet',
      'wal.title.3': '. In your pocket.',
      'wal.desc': 'Pay at 2,000+ merchants with a QR code. Send money to friends in 2 seconds. Split the bill without calculating. Get your Kiwi Card in 30 seconds.',
      'wal.cta': 'Download the app',

      /* Theme + lang */
      'theme.light': 'Light mode',
      'theme.dark': 'Dark mode',

      /* Pitch deck · headlines only (body copy falls back to FR) */
      'pd.s2.eyebrow': 'The problem',
      'pd.s2.title': 'Moroccan merchants pay<br/>to be <em>poorly served</em>.',
      'pd.s2.lede': 'An average restaurant spends MAD 4,300 per month for service that insults them: 2% commission, terminal rental, T+3 settlement, no POS software, 4-week branch onboarding. Cash stays king — by default, not by preference.',
      'pd.s3.eyebrow': 'Why now',
      'pd.s3.title': 'The <em>window</em><br/>won\'t open<br/>twice.',
      'pd.s3.lede': 'Three simultaneous shifts open the chance to build Morocco\'s next acquiring system before anyone else moves in.',
      'pd.s4.eyebrow': 'Our answer',
      'pd.s4.title': 'Kiwi Systems is the merchant\'s <em>operating system</em>.',
      'pd.s4.lede': 'SoftPOS on the merchant\'s phone, a full restaurant register, a dashboard that runs team, stock, menu, and settlements — in Arabic, Darija, French. Hardware is free. The merchant pays only for the software.',
      'pd.s5.eyebrow': 'SaaS model · free hardware',
      'pd.s5.title': 'Zero upfront capital.<br/>Just a <em>subscription</em>.',
      'pd.s5.lede': 'The merchant pays no hardware, no install, no rental, no setup fee. They subscribe. If they leave, they return the hardware — no penalty, no 3-year contract. Zero friction is our distribution.',
      'pd.s6.eyebrow': 'Dynamic terminal routing',
      'pd.s6.title': 'The restaurant adds a <em>Crêpes Bar</em>.<br/>The ticket knows where to go.',
      'pd.s6.lede': 'Café Atlas adds a new crêpe counter. The owner hooks a Kiwi Station to the new zone, drags the "Crêpes" sub-category from Kitchen to Crêpes Bar. In 10 seconds: new orders stop clogging the kitchen and print straight at the new post. <b>Nobody in Morocco does this.</b>',
      'pd.s7.eyebrow': 'Staff management',
      'pd.s7.title': 'Every dirham rung up<br/>has a <em>name</em> on it.',
      'pd.s7.lede': 'Individual PIN per server, shift tracked to the quarter-hour, revenue attributed, tips attributed, performance ranked. The owner sees who sells, who collects, who skims. Cash leakage becomes impossible; bonuses become fair.',
      'pd.s8.eyebrow': 'Market size',
      'pd.s8.title': '$450M of acquirer revenue<br/>up for grabs <em>today</em>.',
      'pd.s9.eyebrow': 'How Kiwi makes money',
      'pd.s9.title': 'SaaS first.<br/>Payments, banking, investing <em>after</em>.',
      'pd.s9.lede': 'SaaS pays the servers and R&D from the first merchant. Once the base is installed, each next product — Kiwi Pay (acquiring), Kiwi Banking, Kiwi Investing — stacks its margin with no new acquisition cost.',
      'pd.s10.eyebrow': 'Competitive landscape',
      'pd.s10.title': 'Nobody does<br/>all <em>five things</em> at once.',
      'pd.s11.eyebrow': 'Projections · POS execution',
      'pd.s11.title': 'From 50 pilots to<br/><em>24,000 merchants</em> in 5 years.',
      'pd.s12.eyebrow': 'What POS unlocks',
      'pd.s12.title': 'Kiwi Banking.<br/>And above all <em>Kiwi Pay</em>.',
      'pd.s12.lede': 'Once the Payment Institution license lands, Kiwi stops being a pure SaaS and becomes its own processor. The result: servers accept payments straight on their personal phone, zero extra hardware, at margins CMI cannot match.',
      'pd.s13.eyebrow': 'The final step',
      'pd.s13.title': 'Kiwi Investing.<br/>Moroccan savings <em>awakened</em>.',
      'pd.s13.lede': 'Once the merchant is on Kiwi Systems, their float on Kiwi Banking, their payments through Kiwi Pay — one flow is left: savings. Kiwi Investing opens financial markets to our 24,000 merchants and the 3M consumers reached through their customers.',
      'pd.s14.eyebrow': 'The team and the ask',
      'pd.s14.title': 'Two founders, <em>Tangier</em>.<br/>Seed · $4M.',
      'pd.s14.lede': 'To reach 2,000 active merchants by M12, deploy Kiwi Systems across 3 cities, and position a $15M Series A by Q1 2028.',
    },

    ar: {
      /* Nav */
      'nav.products': 'المنتجات',
      'nav.pricing': 'الأسعار',
      'nav.security': 'الأمان',
      'nav.dashboard': 'لوحة التحكم',
      'nav.about': 'من نحن',
      'nav.login': 'تسجيل الدخول',
      'nav.start': 'ابدأ الآن',
      'nav.pos': 'نقطة البيع',
      'nav.wallet': 'المحفظة',
      'nav.identity': 'الهوية',
      'nav.pitch': 'العرض',
      'nav.download': 'تحميل',
      'nav.kit': 'تحميل الحزمة',
      'nav.home': 'الرئيسية',

      /* Hero */
      'hero.pill': 'معتمدة تحت رعاية بنك المغرب · رخصة مؤسسة الدفع قيد الإصدار',
      'hero.title': 'بنك<br/><em>التاجر</em><br/>المغربي.',
      'hero.lede': 'كيوي تُدير محلّكم. اشتراك 399 درهم شهريًا شاملاً كل شيء، العتاد مجّاني، بدون أي التزام. مصمّمة لمقاهي المغرب ومطاعمه ومتاجره.',
      'hero.cta.start': 'ابدأ — مجانًا',
      'hero.cta.demo': 'شاهد العرض التوضيحي',
      'hero.micro': '<b>2 140 تاجرًا</b> نشطون · <b>3,2 مليار درهم</b> تمت معالجتها في 2025 · الدار البيضاء، الرباط، مراكش',

      /* Trust */
      'trust.label': 'الامتثال والأمان',

      /* Stats */
      'stats.eyebrow': 'كيوي بالأرقام',
      'stats.title': 'مبنية لتشغيل المغرب المتحرّك.',
      'stats.1.l': 'درهم معالَج لتجارنا في 2025.',
      'stats.2.l': 'نسبة نجاح معاملات البطاقات.',
      'stats.3.l': 'متوسط التسوية إلى حسابكم المغربي.',
      'stats.4.l': 'متجرًا ومقهى ومطعمًا يستعملون كيوي.',

      /* Products */
      'products.eyebrow': 'منتجاتنا',
      'products.title': 'ثلاث طرق لقبول الدفع. بدون تعقيد.',
      'products.desc': 'من الهاتف في جيبكم إلى الصندوق المتصل، كيوي توفّر لكم الأدوات التي احتكرتها Square وToast وStripe للأسواق المتقدّمة. في المغرب، جاء دورنا.',
      'p1.tag': 'كيوي Tap · SoftPOS',
      'p1.title': 'هاتفكم يتحوّل إلى آلة دفع.',
      'p1.body': 'حمّلوا التطبيق، تحقّقوا من هويّتكم في 3 دقائق، واقبلوا البطاقات اللاتلامسية على هاتفكم Android. بدون أي عتاد.',
      'p2.tag': 'كيوي Station · الصندوق',
      'p2.title': 'صندوق، قائمة، طاولات. في شاشة واحدة.',
      'p2.body': 'شاشة مزدوجة، طابعة مدمجة، Wi-Fi + 4G احتياطي. مصمّمة للمطاعم المفتوحة غداءً ومساءً.',
      'p3.tag': 'كيوي Wallet · المستهلك',
      'p3.title': 'زبائنكم يدفعون بإيماءة واحدة.',
      'p3.body': 'QR فوري، تقسيم الحساب بين الأصدقاء، استرداد نقدي عند جيرانكم. محفظة كيوي تصل في المرحلة 2 — زبائنكم، مباشرة.',

      /* Feature rows */
      'f1.eyebrow': 'التسوية',
      'f1.title': 'T+1. لا «بين يومين وثلاثة».',
      'f1.body': 'أموالكم تصل إلى حسابكم المغربي في صباح اليوم التالي، الساعة 9:00. دائمًا. بدون رسوم خفية، بدون دفعات ضائعة، بدون اتصال بالبنك.',
      'f1.li.1': 'تسوية يومية آلية، تشمل عطلة نهاية الأسبوع.',
      'f1.li.2': 'خيار <b>فوري</b> عبر التحويل الفوري مقابل 1,50 درهم.',
      'f1.li.3': 'تقرير يومي يصل للمالك عبر WhatsApp.',
      'f2.eyebrow': 'المطاعم',
      'f2.title': 'طاولات، فواتير، إكراميات. بالدارجة إذا أردتم.',
      'f2.body': 'كيوي ليست آلة دفع متخفّية. إنها برنامج مطاعم حقيقي، مصمّم لإيقاع المغاربة: خدمة متواصلة، رمضان، تراسات، تقسيم الفاتورة بين 6 أصدقاء.',
      'f2.li.1': 'خريطة بصرية للقاعة، إدارة الطاولات والمقاعد.',
      'f2.li.2': 'تقسيم الفاتورة في نقرتين، إكراميات قابلة للتخصيص (5/10/15%).',
      'f2.li.3': 'واجهة كاملة بـ<b>الفرنسية والدارجة والعربية RTL</b>.',
      'f2.li.4': 'تسوية Glovo و Jumia Food عند إقفال الخدمة.',
      'f3.eyebrow': 'التسجيل',
      'f3.title': 'في 3 دقائق، ليس 3 أسابيع.',
      'f3.body': 'سجل تجاري، بطاقة هوية، صورة. أنتم تمسحون، كيوي تتحقّق. تبدؤون القبض من هاتفكم بينما تصلكم آلة الدفع في 48 ساعة.',
      'f3.li.1': 'تسجيل رقمي 100% عبر WhatsApp أو التطبيق.',
      'f3.li.2': 'التحقّق البيومتري بالبطاقة الوطنية + سيلفي في 90 ثانية.',
      'f3.li.3': 'بدون تنقّل إلى الوكالة. بدون بريد مضمون.',

      /* Restaurants */
      'rest.pill': 'للمطاعم والمقاهي',
      'rest.title.1': 'المغرب يأكل خارجًا. ',
      'rest.title.2': 'لمَ لا يواكبكم صندوقكم؟',
      'rest.lede': '73 305 مطعم ومقهى في المغرب. 80% لا يقبلون البطاقات بعد. كيوي تمنحهم صندوقًا بمستوى باريس أو دبي، بسعر مغربي.',

      /* Pricing */
      'price.eyebrow': 'تسعير شفّاف',
      'price.title': 'أخيرًا، سعر يمكن تعليقه على الحائط.',
      'price.desc': 'عقود CMI تُعلن 1,8%. في الواقع، مع الكراء والصيانة والفوترة الدنيا، الكلفة الحقيقية لمطعم يعالج 200 000 درهم شهريًا تقفز إلى <b>4 300 درهم</b>. مع كيوي، اشتراك شهري واحد يشمل كل شيء.',
      'price.old.title': 'بنك تسوية تقليدي',
      'price.old.big': '2,00',
      'price.old.sub': 'معلن · فعليًا 2,1% مع رسوم خفية',
      'price.new.title': 'كيوي Basic',
      'price.new.big': '399 <span style="font-size:0.4em; opacity:0.6;">درهم/شهر</span>',
      'price.new.sub': 'كل شيء مشمول — قابل للإلغاء في أي لحظة',
      'price.badge': 'موصى به',
      'price.bottom': 'لمقهى بـ<b>200 000 درهم/شهر</b> من حجم البطاقات — توفّرون <b style="color:var(--atlas);">~47 000 درهم سنويًا</b> مقارنة بـ CMI. <b>كيوي Pro</b> بـ699 درهم/شهر يفتح الطرفيات المتعدّدة، إدارة المخزون، والـAPI.',

      /* Testimonials */
      'testi.eyebrow': 'تجّارنا',
      'testi.title': 'مطاعم كانت ترفض البطاقة. اليوم تفضّلها.',

      /* Security */
      'sec.pill': 'بمستوى بنكي',
      'sec.title': 'كل درهم مشفّر. كل حركة مُدقّقة.',
      'sec.body': 'كيوي تعمل تحت الإطار التنظيمي لبنك المغرب عبر شراكة مع بنك تسوية رئيسي مرخّص. البيانات الحسّاسة مستضافة في المغرب. المدفوعات مرمّزة. امتثالكم مشمول افتراضيًا.',
      'sec.cta': 'الورقة البيضاء للأمان',

      /* Final */
      'final.pill': 'أول 100 مطعم — 6 أشهر مجانًا',
      'final.title': 'صندوقكم يستحقّ <em>أفضل</em><br/>ممّا بيع لكم.',
      'final.desc': 'ابدؤوا بقبول البطاقات في 3 دقائق. بدون التزام، بدون عتاد للشراء، بدون رسوم خفية.',
      'final.cta.create': 'إنشاء حساب كيوي',
      'final.cta.advisor': 'التحدّث إلى مستشار',
      'final.micro': 'التسجيل بالفرنسية أو الدارجة أو العربية · دعم WhatsApp 7/7',

      /* Footer */
      'foot.products': 'المنتجات',
      'foot.company': 'الشركة',
      'foot.resources': 'الموارد',
      'foot.legal': 'قانوني',
      'foot.about': 'من نحن',
      'foot.brand': 'الهوية',
      'foot.careers': 'الوظائف',
      'foot.press': 'الصحافة',
      'foot.contact': 'اتصال',
      'foot.help': 'المساعدة',
      'foot.docs': 'التوثيق',
      'foot.status': 'الحالة',
      'foot.blog': 'المدوّنة',
      'foot.terms': 'الشروط',
      'foot.privacy': 'الخصوصية',
      'foot.security': 'الأمان',
      'foot.compliance': 'الامتثال',
      'foot.brand.tag': 'بنك التاجر المغربي الجديد. مبني في الدار البيضاء، مصمّم لمغرب الغد.',

      /* Press */
      'press.label': 'كما شوهدت في',

      /* Dashboard */
      'dash.hello': 'مرحبًا رشيد،',
      'dash.day': 'كيف يومك؟',
      'dash.sub': 'الجمعة 24 أبريل 2026 · خدمة الغداء جارية',
      'dash.today': 'اليوم',
      'dash.export': 'تصدير',
      'dash.newsale': 'قبض',
      'dash.live': 'مباشر',
      'dash.cashed': 'المقبوض اليوم',
      'dash.vsYesterday': 'مقابل أمس',
      'dash.vsWeek': 'مقابل الأسبوع',
      'dash.vsMonth': 'مقابل الشهر الماضي',
      'dash.netKiwi': 'الصافي بعد كيوي',
      'dash.goal': 'هدف اليوم',
      'dash.range.pill.today': 'اليوم',
      'dash.range.pill.yesterday': 'أمس',
      'dash.range.pill.7d': '7 أيام',
      'dash.range.pill.30d': '30 يوما',
      'dash.range.pill.custom': 'مخصص',
      'dash.compare': 'مقارنة',
      'dash.compare.vs.today': 'مقابل أمس',
      'dash.compare.vs.hier':  'مقابل أول أمس',
      'dash.compare.vs.7d':    'مقابل 7 أيام السابقة',
      'dash.compare.vs.30d':   'مقابل 30 يومًا السابقة',
      'dash.compare.vs.custom': 'مقابل الفترة السابقة',
      'dash.revenueByHour': 'المداخيل في الساعة · اليوم',
      'dash.ai.label': 'كيوي AI — ملخّص',
      'dash.hero.ai.eyebrow': 'كيوي AI',
      'dash.hero.ai.title': 'توصيات اليوم',
      'dash.hero.ai.rec1.title': 'فترة الركود بين 15h و17h تمثّل فرصة غير مستغلّة',
      'dash.hero.ai.rec1.obs': 'بين الساعة 15h و17h، تحقّقون فقط 8% من رقم معاملاتكم اليومي. ومع ذلك، هذه هي الساعات التي يجلس فيها زبائنكم أطول مدة (47 دقيقة في المتوسط، مقابل 31 دقيقة وقت الغداء).',
      'dash.hero.ai.rec1.act': '→ اقتراح قائمة « العصرونة » بالأتاي والمسمن بسعر مخفّض قد يرفع دوران الطاولات بـ 20-30%.',
      'dash.hero.ai.rec2.title': 'طاجين الكفتة يحقّق أفضل تذكرة لديكم',
      'dash.hero.ai.rec2.obs': 'طُلب 32 مرّة اليوم (الأكثر مبيعًا)، بمتوسّط تذكرة مرتبط 180 درهم مقابل 130 درهم في المتوسّط. الزبائن الذين يطلبون الطاجين يطلبون أيضًا مشروبات وحلويات أكثر.',
      'dash.hero.ai.rec2.act': '→ إبراز طاجين الكفتة في قائمة المساء قد يرفع متوسّط تذكرتكم بـ 15%.',
      'dash.hero.ai.input.placeholder': 'اطرح سؤالاً حول مطعمك...',
      'dash.hero.ai.soon': 'قريبًا',
      'dash.hh.title': 'ساعات الذروة',
      'dash.hh.less': 'نشاط أقل',
      'dash.hh.more': 'نشاط أكثر',
      'dash.hh.ai.eyebrow': 'كيوي AI · فرصة',
      'dash.hh.ai.title':   'أطلق وجبة توصيل عبر Glovo بين 15h و17h',
      'dash.hh.ai.obs':     'خلال هذه الفترة الهادئة، تشتغل قاعتك بـ 22% من طاقتها بينما الفريق متاح. كومبو طاجين الكفتة + أتاي بالنعناع بـ 75 درهم على Glovo يجلب عادة 8–12 طلب في فترة الزوال لدى مقاهي معاريف المماثلة.',
      'dash.hh.ai.cta':     '→ إعداد كومبو Glovo',
      // ─── Multi-venue: sidebar headers + sub-nav per vertical ───
      'sidebar.section.restaurant': 'المطعم',
      'sidebar.section.boutique':   'البوتيك',
      'sidebar.section.spa':        'فضاء العافية',
      'sidebar.section.bank':       'الخدمات البنكية للتاجر',
      'sidebar.restaurant.tables':  'الطاولات والفواتير',
      'sidebar.restaurant.menu':    'القائمة والإضافات',
      'sidebar.restaurant.kds':     'شاشة المطبخ (KDS)',
      'sidebar.restaurant.stock':   'مخزون المكونات',
      'sidebar.boutique.inventory': 'مخزون المنتجات',
      'sidebar.boutique.categories':'الفئات',
      'sidebar.boutique.promos':    'الترويج والعروض',
      'sidebar.boutique.returns':   'المرتجعات والتبادل',
      'sidebar.spa.appointments':   'تقويم المواعيد',
      'sidebar.spa.services':       'الخدمات والباقات',
      'sidebar.spa.practitioners':  'العاملات',
      'sidebar.spa.clients':        'سجلات الزبائن',
      // KPI labels per vertical
      'dash.kpi.returnRate':       'نسبة المرتجعات',
      'dash.kpi.loyalCustomers':   'الزبائن الأوفياء',
      'dash.kpi.appointments':     'المواعيد',
      'dash.kpi.fillRate':         'نسبة الإشغال',
      // Mix
      'dash.mix.savings.label':    'التوفير مقابل CMI:',
      'dash.mix.savings.year':     'عرض السنة',
      // Footer
      'dash.footer.sponsor':       'تشتغل تحت رعاية بنك المغرب',
      'dash.footer.help':          'مساعدة عبر واتساب',
      'dash.mix.center.unit': 'درهم بطاقة',
      'dash.settle.instant': 'تسوية فورية',
      'dash.kpi.tx': 'المعاملات',
      'dash.kpi.basket': 'متوسّط السلّة',
      'dash.kpi.tips': 'الإكراميات',
      'dash.kpi.success': 'نسبة النجاح',
      'dash.kpi.ratio': 'نسبة البطاقة/النقد',
      'dash.kpi.regular': 'الدائمون',
      'dash.rev.title': 'المداخيل والمعاملات',
      'dash.rev.sub': 'مقارنة بالأسبوع الماضي · تحديث آلي كل 60 ثانية',
      'dash.mix.title': 'مزيج الدفع',
      'dash.mix.sub': 'اليوم',
      'dash.heat.title': 'كثافة المبيعات · ساعة × يوم',
      'dash.heat.sub': 'آخر 30 يومًا — حدّدوا ساعات الذروة',
      'dash.feed.title': 'المعاملات المباشرة',
      'dash.feed.sub': 'آخر 6 · تدفّق لحظي',
      'dash.settle.big': 'التسوية القادمة',
      'dash.timeline.title': 'تقويم التسويات',
      'dash.timeline.sub': '7 أيام قادمة',
      'dash.health.title': 'مؤشّر صحّة كيوي',
      'dash.health.sub': 'محسوب على 90 يومًا · عوامل مُفعَّلة',
      'dash.bench.title': 'أنتم مقابل المقاهي المماثلة',
      'dash.bench.sub': '147 مقهى بالدار البيضاء · نفس متوسّط التذكرة',
      'dash.products.title': 'المنتجات الأكثر مبيعًا',
      'dash.products.sub': 'اليوم · جميع العناصر',
      'dash.staff.title': 'أداء الفريق',
      'dash.staff.sub': 'الخدمة جارية · رموز PIN متّصلة',
      'dash.integ.title': 'التكاملات النشطة',
      'dash.integ.sub': 'الأدوات التي تزامنها كيوي لأجلكم',

      /* Wallet */
      'wal.pill': 'كيوي Wallet · متاحة Q3 2026',
      'wal.title.1': 'المحفظة',
      'wal.title.em': 'المغربية',
      'wal.title.3': '. في جيبكم.',
      'wal.desc': 'ادفعوا عند أكثر من 2 000 تاجر عبر QR. أرسلوا المال لأصدقائكم في ثانيتين. قسّموا الفاتورة دون حساب. اطلبوا بطاقة كيوي في 30 ثانية.',
      'wal.cta': 'تحميل التطبيق',

      /* Theme */
      'theme.light': 'وضع النهار',
      'theme.dark': 'وضع الليل',

      /* Pitch deck · headlines only (body copy falls back to FR) */
      'pd.s2.eyebrow': 'المشكل',
      'pd.s2.title': 'التاجر المغربي يدفع<br/>ليُخدم <em>بشكل سيّئ</em>.',
      'pd.s2.lede': 'مطعم متوسّط ينفق 4 300 درهم شهريًا على خدمة تُهينه: 2٪ عمولة، كراء آلة، تسوية بعد 3 أيام، بدون أي برنامج صندوق، تسجيل في الوكالة يدوم 4 أسابيع. الكاش يبقى سيّدًا — بالاضطرار، لا بالاختيار.',
      'pd.s3.eyebrow': 'لماذا الآن',
      'pd.s3.title': 'هذه <em>الفرصة</em><br/>لن تُفتح<br/>مرّتين.',
      'pd.s3.lede': 'ثلاث تحوّلات متزامنة تفتح الإمكانية لبناء نظام التحصيل القادم للمغرب قبل أن يسبقنا إليه غيرنا.',
      'pd.s4.eyebrow': 'جوابنا',
      'pd.s4.title': 'كيوي Systems هو <em>نظام تشغيل</em> التاجر.',
      'pd.s4.lede': 'SoftPOS على هاتف التاجر، صندوق مطعم كامل، لوحة تحكّم تُدير الفريق والمخزون والقائمة والتسويات — بالعربية والدارجة والفرنسية. العتاد مجاني. التاجر يدفع فقط مقابل البرنامج.',
      'pd.s5.eyebrow': 'اشتراك SaaS · عتاد مجاني',
      'pd.s5.title': 'بدون رأسمال بدايةً.<br/>فقط <em>اشتراك</em> شهري.',
      'pd.s5.lede': 'التاجر لا يدفع عتادًا، ولا تثبيتًا، ولا كراء، ولا رسوم ملف. يشترك فقط. إذا توقّف عن كيوي، يُرجع العتاد — بدون غرامة، بدون عقد 3 سنوات. انعدام الاحتكاك هو توزيعنا.',
      'pd.s6.eyebrow': 'توجيه ديناميكي للطرفيات',
      'pd.s6.title': 'المطعم يُضيف <em>ركن كريب</em>.<br/>التذكرة تعرف أين تذهب.',
      'pd.s6.lede': 'مقهى أطلس يضيف ركنًا جديدًا للكريب. المالك يربط Kiwi Station بالمنطقة الجديدة، يسحب فئة «كريب» من المطبخ إلى ركن الكريب. في 10 ثوانٍ: الطلبات الجديدة تتوقّف عن إرباك المطبخ وتُطبع مباشرة في المنصّة الجديدة. <b>لا أحد في المغرب يفعل هذا.</b>',
      'pd.s7.eyebrow': 'تدبير الموظفين',
      'pd.s7.title': 'كل درهم مقبوض<br/>عليه <em>اسم</em>.',
      'pd.s7.lede': 'رمز PIN خاص بكلّ نادل، دوام متابَع إلى ربع الساعة، مداخيل منسوبة، إكراميات منسوبة، أداء مُرتّب. المالك يرى من يبيع، من يقبض، من يسرق. التسرّب النقدي يصبح مستحيلًا، والعلاوات تصبح عادلة.',
      'pd.s8.eyebrow': 'حجم السوق',
      'pd.s8.title': '450 مليون دولار من مداخيل التحصيل<br/>متاحة <em>اليوم</em>.',
      'pd.s9.eyebrow': 'كيف تربح كيوي',
      'pd.s9.title': 'SaaS أوّلًا.<br/>المدفوعات والبنك والاستثمار <em>بعد ذلك</em>.',
      'pd.s9.lede': 'SaaS يُموّل الخوادم والبحث منذ أوّل تاجر. وبعد تثبيت القاعدة، كل منتج لاحق — Kiwi Pay، Kiwi Banking، Kiwi Investing — يُراكم هامشه دون تكلفة اكتساب جديدة.',
      'pd.s10.eyebrow': 'المشهد التنافسي',
      'pd.s10.title': 'لا أحد يجمع<br/><em>الخمسة</em> مرّة واحدة.',
      'pd.s11.eyebrow': 'التوقّعات · تنفيذ POS',
      'pd.s11.title': 'من 50 تجربة إلى<br/><em>24 000 تاجر</em> في 5 سنوات.',
      'pd.s12.eyebrow': 'ما يفتحه POS',
      'pd.s12.title': 'Kiwi Banking.<br/>وقبل كل شيء <em>Kiwi Pay</em>.',
      'pd.s12.lede': 'فور الحصول على رخصة مؤسسة الدفع، تتوقّف كيوي عن كونها مجرّد SaaS وتصبح معالج دفع مستقلّ. النتيجة: النُدُل يقبضون مباشرة على هاتفهم الشخصي، بدون أي عتاد إضافي، بهوامش لا يستطيع CMI مجاراتها.',
      'pd.s13.eyebrow': 'الخطوة الأخيرة',
      'pd.s13.title': 'Kiwi Investing.<br/>الادّخار المغربي <em>مُستيقظ</em>.',
      'pd.s13.lede': 'بعدما يصبح التاجر على Kiwi Systems، وخزينته على Kiwi Banking، ومدفوعاته عبر Kiwi Pay — يبقى تدفّق واحد: الادّخار. Kiwi Investing يفتح الأسواق المالية لـ 24 000 تاجر و3 ملايين مستهلك يصلوننا عبر زبائنهم.',
      'pd.s14.eyebrow': 'الفريق والطلب',
      'pd.s14.title': 'مؤسّسان، <em>طنجة</em>.<br/>Seed · 4 مليون دولار.',
      'pd.s14.lede': 'لبلوغ 2 000 تاجر نشط في M12، ونشر Kiwi Systems في 3 مدن، وتهيئة جولة Series A بـ15 مليون دولار في Q1 2028.',
    }
  };

  /* ─── SVG icons for theme toggle ─── */
  const SUN_SVG = '<svg class="sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  const MOON_SVG = '<svg class="moon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  /* ─── Capture originals (FR) ─── */
  const ORIG = {};
  const ORIG_ATTR = new WeakMap(); // el -> { attr: frValue }
  function captureOriginals() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (!(key in ORIG)) ORIG[key] = el.innerHTML;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      let map = ORIG_ATTR.get(el);
      if (!map) { map = {}; ORIG_ATTR.set(el, map); }
      el.dataset.i18nAttr.split(',').forEach(pair => {
        const [attr] = pair.split(':').map(s => s.trim());
        if (attr && !(attr in map)) map[attr] = el.getAttribute(attr) || '';
      });
    });
  }

  /* ─── setLang ─── */
  function setLang(lang) {
    if (!['fr','en','ar'].includes(lang)) lang = 'fr';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('kiwiLang', lang);

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (lang === 'fr') {
        if (ORIG[key] !== undefined) el.innerHTML = ORIG[key];
      } else if (T[lang]?.[key] !== undefined) {
        el.innerHTML = T[lang][key];
      } else if (ORIG[key] !== undefined) {
        el.innerHTML = ORIG[key]; // fallback to FR
      }
    });

    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      const map = ORIG_ATTR.get(el) || {};
      el.dataset.i18nAttr.split(',').forEach(pair => {
        const [attr, key] = pair.split(':').map(s => s.trim());
        if (!attr || !key) return;
        let val;
        if (lang === 'fr') val = map[attr];
        else if (T[lang]?.[key] !== undefined) val = T[lang][key];
        else val = map[attr];
        if (val != null) el.setAttribute(attr, val);
      });
    });

    // Update lang switcher visuals
    document.querySelectorAll('.lang span').forEach(s => {
      s.classList.toggle('on', (s.dataset.lang || s.textContent.trim().toLowerCase()) === lang);
    });
  }

  /* ─── setTheme ─── */
  function setTheme(theme) {
    if (!['dark','light'].includes(theme)) theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kiwiTheme', theme);
    // Update toggles title
    document.querySelectorAll('.theme-tg').forEach(btn => {
      btn.setAttribute('aria-label', theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre');
      btn.setAttribute('title', theme === 'dark' ? (T[getLang()]?.['theme.light'] || 'Mode clair') : (T[getLang()]?.['theme.dark'] || 'Mode sombre'));
    });
  }

  function getLang() { return localStorage.getItem('kiwiLang') || 'fr'; }
  function getTheme() { return localStorage.getItem('kiwiTheme') || 'light'; }

  /* ─── Build theme toggle button (injected into navs that don't have one) ─── */
  function buildToggleButton() {
    const btn = document.createElement('button');
    btn.className = 'theme-tg';
    btn.innerHTML = SUN_SVG + MOON_SVG;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
    return btn;
  }

  /* ─── Initialize ─── */
  function init() {
    captureOriginals();

    // Lang switch: wire existing .lang span, or add data-lang attribute if missing
    document.querySelectorAll('.lang').forEach(wrap => {
      wrap.querySelectorAll('span').forEach(s => {
        const l = s.textContent.trim().toLowerCase();
        s.dataset.lang = l;
        s.style.cursor = 'pointer';
        s.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setLang(l);
        });
      });
    });

    // Light-only mode: dark toggle removed per product decision
    // (CSS vars still flip if data-theme is set programmatically)

    // Apply persisted state — always light now
    setTheme('light');
    setLang(getLang());
  }

  /* Light-only mode — clear any previously saved dark preference */
  localStorage.setItem('kiwiTheme', 'light');

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ─── Expose API ─── */
  window.KiwiI18n = { setLang, setTheme, getLang, getTheme, T };

})();
