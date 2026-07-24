/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Financial assistant  (Assistant financier · المساعد المالي)
 * A hybrid agent + calculator surface, built for the owner of Café Atlas.
 * It "knows" the café — revenue, cost of goods, fixed charges, margins,
 * cash on hand — and turns plain-language questions into real numbers:
 * hiring, price changes, investments, break-even, forecasts.
 *
 * Tri-lingual: follows the dashboard language (fr / en / ar) and flips to
 * RTL for Arabic. Strings live in the T dictionary below.
 *   ⚠ AR strings are best-effort MSA — flagged for native review.
 *
 * Pure vanilla. Opens as a fullpage drawer from the topbar or ⌘K.
 * No backend: the "intelligence" is a deterministic scenario engine that
 * computes against the business profile below.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ─────────────── BUSINESS PROFILE · Café Atlas · Maarif ───────────────
   * Monthly figures (MAD), aligned with the dashboard's 30-day revenue
   * chart total (842 300 MAD) and the KPI band. The agent reasons entirely
   * off this object. opex keys are stable IDs — labels come from T.opex. */
  const ATLAS = {
    name: 'Café Atlas · Maarif',
    revenue: 842300,
    cogs: 261000,
    grossProfit: 581300,
    grossMargin: 69.0,
    opex: {
      salaries: 218000,
      rent: 56000,
      utilities: 28000,
      marketing: 19000,
      maintenance: 14500,
      insurance: 15000,
      financing: 42000,
      subscription: 699,
    },
    totalOpex: 393199,
    netProfit: 188101,
    netMargin: 22.3,
    avgBasket: 142,
    ordersPerMonth: 5931,
    ordersPerDay: 198,
    daysOpen: 30,
    cashBuffer: 465000,
    contribRatio: 0.69,
    mtdRevenue: 462000,
    mtdDays: 16,
    daysInMonth: 31,
    staffCount: 8,
  };
  ATLAS.dailyRev = ATLAS.revenue / ATLAS.daysOpen;
  ATLAS.dailyNet = ATLAS.netProfit / ATLAS.daysOpen;
  ATLAS.netPerOrder = ATLAS.netProfit / ATLAS.ordersPerMonth;
  ATLAS.breakEvenRev = ATLAS.totalOpex / ATLAS.contribRatio;
  ATLAS.breakEvenOrdersDay = ATLAS.breakEvenRev / ATLAS.avgBasket / ATLAS.daysOpen;
  ATLAS.marginOfSafety = (ATLAS.revenue - ATLAS.breakEvenRev) / ATLAS.revenue * 100;

  /* ─────────────── ACTIVE BUSINESS PROFILE ───────────────
   * The agent reasons off `B`. For Café Atlas (and the demo venues) `B` is
   * the full ATLAS model above. For a user-created venue there is no cost
   * structure yet — so `B` becomes a PARTIAL profile built only from the
   * merchant's own recorded sales (KiwiSales). Cost-dependent scenarios then
   * degrade honestly instead of quoting Café Atlas's numbers.
   * Principle (KIWI_AI_ROADMAP.md): never emit a number we don't have. */
  let B = ATLAS;

  function buildProfile() {
    const KV = window.KiwiVenue;
    const real = !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
    const custom = !!(KV && typeof KV.isCustom === 'function' && KV.isCustom());
    // Only the pure local demo (not real, not a custom venue) gets the full
    // Café Atlas ATLAS model. Any real session degrades to the honest partial.
    if (!real && !custom) return ATLAS;
    const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    const vid = KV && KV.getVenue ? KV.getVenue() : null;
    const tot = (window.KiwiSales && window.KiwiSales.totals)
      ? window.KiwiSales.totals(vid) : { revenue: 0, count: 0, basket: 0 };
    let nm = vd.fullDisplay || [vd.name, vd.location].filter(Boolean).join(' · ');
    // Real-but-not-custom (defensive): vd may still be a demo venue — never quote
    // "Café Atlas"; prefer the real session name, else neutral.
    if (real && !custom) nm = (window.KiwiMe && (window.KiwiMe.business || window.KiwiMe.name)) || 'Votre établissement';
    if (!nm) nm = 'Votre établissement';
    return {
      partial: true,
      name: nm,
      revenue: tot.revenue,
      ordersPerMonth: tot.count,
      ordersPerDay: 0,
      avgBasket: tot.basket,
      daysOpen: 30,
      dailyRev: tot.revenue / 30,
      /* cost structure unknown until the merchant records it */
      cogs: null, grossProfit: null, grossMargin: null,
      opex: {}, totalOpex: null, netProfit: null, netMargin: null,
      cashBuffer: null, staffCount: null, contribRatio: null,
      dailyNet: null, netPerOrder: null,
      breakEvenRev: null, breakEvenOrdersDay: null, marginOfSafety: null,
      mtdRevenue: tot.revenue, mtdDays: 1, daysInMonth: 30,
    };
  }
  function syncProfile() { B = buildProfile(); return B; }

  /* ─────────────── LANGUAGE ─────────────── */
  function getLang() {
    const l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang();
    return (l === 'en' || l === 'ar') ? l : 'fr';
  }
  let L = 'fr';   // resolved at open()

  /* Language of one specific question — the assistant's free-text answer must
   * match it even when the dashboard UI runs in another language. Arabic
   * script wins outright; otherwise FR vs EN on common function words; a tie
   * falls back to the UI language. */
  function detectQLang(text) {
    const t = String(text || '');
    if (/[؀-ۿ]/.test(t)) return 'ar';
    const s = ' ' + t.toLowerCase().replace(/[^a-zà-ÿ ]/g, ' ') + ' ';
    let fr = 0, en = 0;
    ['le','la','les','une','des','du','mon','ma','mes','est','sont','quel','quels','quelle','combien','pour','avec','je','pas','ne','ca'].forEach((w) => { if (s.indexOf(' ' + w + ' ') >= 0) fr++; });
    ['the','an','my','is','are','what','how','much','many','with','does','best','worst','show','which','items','your'].forEach((w) => { if (s.indexOf(' ' + w + ' ') >= 0) en++; });
    if (en > fr) return 'en';
    if (fr > en) return 'fr';
    return getLang();
  }

  /* ─────────────── FORMATTING ─────────────── */
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
  const fmtMad = (n) => fmt(n) + ' MAD';
  const fmt1 = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  /* Typographic apostrophes fold to ASCII: a merchant's keyboard (and our own
   * UI copy) emits ’, so a pattern written with ' would silently miss
   * "réduire l’effectif" while matching "reduire l'effectif". */
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`´]/g, "'");
  const escAttr = (s) => String(s).replace(/"/g, '&quot;');
  // Full HTML-text escaper — use for any user-derived value (venue name/location)
  // interpolated into an innerHTML string. escAttr only neutralises quotes; this
  // also neutralises < > & ' so a typed name like `<img onerror=…>` can't execute.
  const escHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  // Arabic-Indic / Persian digits → ASCII, so number parsing works in AR.
  const fixDigits = (s) => String(s)
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06F0);

  /* ═══════════════ STRING DICTIONARY ═══════════════
   * Every user-facing string, in fr / en / ar. Interpolated strings are
   * functions; computed numbers are passed in already formatted-ready. */
  const T = {
    fr: {
      ui: {
        title: 'Assistant financier',
        subtitle: 'Il connaît votre café, revenus, charges, marges, trésorerie',
        placeholder: 'Posez une question, embauche, prix, investissement, prévision…',
        calc: 'Calculatrice', enterToSend: 'Entrée pour envoyer', send: 'Envoyer',
        kpError: 'Erreur', kpUse: 'Utiliser ce résultat',
        ctxEyebrow: 'Ce que je sais',
        ctxSub: '30 derniers jours · cliquez pour insérer',
        ctxNote: 'Cliquez un chiffre pour l’ajouter à votre message, l’assistant raisonnera dessus.',
        ctxTrust: 'Tout s’exécute en local. Aucune donnée ne quitte cet appareil.',
        gActivity: 'Activité', gProfit: 'Rentabilité', gFixed: 'Charges fixes', gCash: 'Trésorerie & équipe',
        perMonth: '/ mois', days: 'j', employees: (n) => `${n} employés`,
      },
      facts: {
        revenue: 'Chiffre d’affaires', revPerDay: 'CA par jour', mtdRev: 'CA du mois en cours',
        ordersMonth: 'Commandes / mois', ordersDay: 'Commandes / jour', basket: 'Panier moyen',
        grossMargin: 'Marge brute', cogs: 'Coût matière', profitPerOrder: 'Bénéfice par commande',
        breakEven: 'Seuil de rentabilité', cashAvail: 'Trésorerie disponible', headcount: 'Effectif',
        netProfit: 'Bénéfice net', netMarginLine: (m) => `marge nette ${m} %`,
      },
      opex: {
        salaries: 'Masse salariale', rent: 'Loyer', utilities: 'Eau · électricité · gaz',
        marketing: 'Marketing & divers', maintenance: 'Entretien & équipement',
        insurance: 'Assurances & taxes', financing: 'Amortissement & prêt', subscription: 'Abonnement Kiwi POS',
      },
      chips: {
        hire: 'Puis-je embaucher un serveur ?', price5: 'Et si j’augmente mes prix de 5 % ?',
        breakeven: 'Quel est mon seuil de rentabilité ?', forecast: 'Prévision de bénéfice ce mois',
        charges: 'Décompose mes charges', invest80: 'Puis-je investir 80 000 MAD ?',
        invest150: 'Puis-je investir 150 000 MAD ?',
      },
      hire: {
        text: (c, per, n) => n > 1
          ? `<b>${n} embauches</b> à ${fmtMad(per)}/mois chacune, soit <b>${fmtMad(c)}/mois</b> en coût chargé, représentent <b>${fmtMad(c * 12)}/an</b>.`
          : `Une embauche à <b>${fmtMad(c)}/mois</b> en coût chargé représente <b>${fmtMad(c * 12)}/an</b>.`,
        s1l: 'Pour s’autofinancer', s1v: (o) => `${fmt1(o / 30)} cmd/jour`, s1h: (o) => `soit ${fmt(o)} commandes/mois`,
        s2l: 'CA additionnel requis', s2h: 'au panier moyen actuel',
        s3l: 'Bénéfice net après', s3h: () => `vs ${fmtMad(B.netProfit)} aujourd’hui`,
        s4l: 'Part du bénéfice', s4h: 'de votre résultat mensuel',
        vGood: (o) => `Favorable, il suffit de ${fmt1(o / 30)} commandes en plus par jour pour absorber ce poste. Votre marge le permet largement.`,
        vWarn: 'Faisable, mais ce poste pèse lourd dans le résultat. Assurez-vous que l’embauche génère bien du chiffre additionnel.',
        vBad: 'Prudence, ce coût dépasse votre marge de manœuvre actuelle. À envisager seulement avec une hausse d’activité confirmée.',
        note: 'Hypothèse : 7 200 MAD/mois en coût chargé pour un serveur (salaire net + CNSS + primes). Indiquez un montant précis pour affiner.',
        noteLoaded: (per, n) => `Je compte ${fmtMad(per)}/mois ${n > 1 ? 'par personne ' : ''}en coût <i>chargé</i>. Si c’est le salaire net, ajoutez environ 21 % de CNSS et AMO employeur avant de décider.`,
        noteCnss: (per, n) => `J’ai ajouté environ 21 % de CNSS et AMO employeur : ${fmtMad(per)}/mois ${n > 1 ? 'par personne ' : ''}en coût réellement supporté. Le taux exact dépend du plafond CNSS et de votre convention, votre comptable le confirmera.`,
      },
      price: {
        text: (p) => `Une ${p >= 0 ? 'hausse' : 'baisse'} de <b>${fmt1(Math.abs(p))} %</b> sur l’ensemble de la carte, à volume constant, ne touche pas le coût matière, l’écart tombe presque entièrement dans le résultat.`,
        s1l: 'Bénéfice net /mois', s1h: (d) => `${d >= 0 ? '+' : ''}${fmtMad(d)}`,
        s2l: 'Effet sur 12 mois', s2h: 'à activité égale',
        s3l: 'Nouvelle marge nette', s3h: () => `vs ${fmt1(B.netMargin)} % aujourd’hui`,
        s4l: 'Nouveau CA /mois', s4h: (b) => `panier moyen ${fmtMad(b)}`,
        vUp: (p, d) => `Levier puissant, ${fmt1(p)} % de prix en plus = ${fmtMad(d)} de bénéfice mensuel sans dépense supplémentaire.`,
        vDown: (need) => `Une baisse de prix ne se finance que par du volume : il faudrait +${fmt1(need)} % de commandes pour préserver le résultat.`,
        vFlat: 'Aucun changement de prix, votre résultat reste identique. Indiquez un pourcentage pour voir l’effet.',
        textDegenerate: (p, cogs) => `À −${fmt1(p)} %, votre chiffre d’affaires passerait sous votre coût matière (${fmtMad(cogs)}) : vous vendriez à perte sur chaque commande. Je ne simule pas au-delà, le résultat n’aurait aucun sens.`,
        note: 'Calcul à volume constant. En pratique une hausse de prix réduit souvent la fréquentation de 2 à 4 %, surveillez le nombre de commandes les deux semaines suivantes.',
        noteAssumed: ' (Hypothèse : 5 %.)',
        noteClamped: ' Pourcentage ramené dans une plage réaliste (−100 % à +200 %) : au-delà, l’hypothèse « à volume constant » n’a plus de sens.',
      },
      afford: {
        ask: 'Indiquez le montant de l’investissement et je vous dis s’il est à votre portée, par exemple : <i>« puis-je investir 80 000 MAD dans une terrasse ? »</i>',
        text: (a) => `Un investissement de <b>${fmtMad(a)}</b> se compare à votre trésorerie disponible (${fmtMad(B.cashBuffer)}) et à votre bénéfice net (${fmtMad(B.netProfit)}/mois).`,
        s1l: 'Récupéré en', s1v: (m) => `${fmt1(m)} mois`, s1h: 'avec le bénéfice net actuel',
        s2l: 'Trésorerie après', s2hOk: (p) => `${fmt1(p)} % engagés`, s2hNo: 'financement nécessaire',
        s3l: 'Équivalent', s3v: (d) => `${fmt1(d)} jours`, s3h: 'de bénéfice d’exploitation',
        s4l: 'Poids annuel', s4h: 'du bénéfice sur 12 mois',
        vGood: (m, cash) => `Abordable, payable comptant, amorti en ${fmt1(m)} mois, et il reste ${fmtMad(cash)} de trésorerie.`,
        vWarn: (m, p) => `Payable comptant, mais l’amortissement prend ${fmt1(m)} mois et mobilise ${fmt1(p)} % de votre trésorerie, gardez un coussin de sécurité.`,
        vBad: () => `Au-delà de votre trésorerie disponible (${fmtMad(B.cashBuffer)}). Un financement, ou un étalement, serait nécessaire.`,
      },
      forecast: {
        text: (run) => `Sur vos <b>${B.mtdDays} premiers jours du mois</b> (${fmtMad(B.mtdRevenue)} encaissés), le rythme est de <b>${fmtMad(run)}/jour</b>.`,
        s1l: 'CA projeté · mois', s1h: () => `${B.daysInMonth} jours`,
        s2l: 'Bénéfice projeté · mois', s2h: () => `marge nette ${fmt1(B.netMargin)} %`,
        s3l: 'CA projeté · 12 mois', s3h: 'au rythme actuel',
        s4l: 'Bénéfice · 12 mois', s4h: 'avant impôt sur les sociétés',
        vGood: (v) => `Tendance positive, le mois dépasse votre moyenne 30 jours de ${fmt1(v)} %. Si le rythme tient, c’est votre meilleur mois.`,
        vWarn: (v) => `Le mois est ${fmt1(v)} % sous votre moyenne 30 jours, un coup d’accélérateur sur les soirs de week-end remettrait la barre.`,
        note: 'Projection linéaire : un jour férié, un week-end pluvieux ou une opération spéciale peuvent faire varier le résultat réel.',
      },
      breakeven: {
        text: () => `Votre point mort, le chiffre d’affaires qui couvre exactement vos charges fixes (${fmtMad(B.totalOpex)}) avec une marge sur coûts variables de ${fmt1(B.contribRatio * 100)} %.`,
        s1l: 'Seuil · CA mensuel', s1h: () => `vs ${fmtMad(B.revenue)} réalisé`,
        s2l: 'Seuil · commandes/jour', s2h: () => `vs ${fmt(B.ordersPerDay)} aujourd’hui`,
        s3l: 'Marge de sécurité', s3h: 'chute d’activité absorbable',
        s4l: 'Seuil · CA journalier', s4h: () => `vs ${fmtMad(B.dailyRev)} réalisé`,
        vGood: () => `Position solide, vous opérez ${fmt1(B.marginOfSafety)} % au-dessus du point mort. Il faudrait perdre près d’un tiers de l’activité pour être à l’équilibre.`,
      },
      margin: {
        text: 'Vos deux marges, sur les 30 derniers jours :',
        s1l: 'Marge brute', s1h: () => `${fmtMad(B.grossProfit)} après coût matière`,
        s2l: 'Marge nette', s2h: () => `${fmtMad(B.netProfit)} après toutes charges`,
        s3l: 'Coût matière', s3h: () => fmtMad(B.cogs),
        s4l: 'Bénéfice par commande', s4h: () => `panier moyen ${fmtMad(B.avgBasket)}`,
        vGood: () => `Marge nette de ${fmt1(B.netMargin)} %, nettement au-dessus de la moyenne du secteur café-restauration (8 à 12 %). Votre coût matière est bien tenu.`,
        note: 'La marge brute mesure la rentabilité de la carte ; la marge nette, celle de toute l’exploitation.',
      },
      charges: {
        text: () => `Vos charges fixes mensuelles totalisent <b>${fmtMad(B.totalOpex)}</b>, auxquelles s’ajoute le coût matière (${fmtMad(B.cogs)}).`,
        share: (p) => `${fmt1(p)} % des charges`,
        verdict: (name, p) => `« ${name} » est votre premier poste (${fmt1(p)} % des charges), c’est là que se trouve votre principal levier d’optimisation.`,
      },
      revenue: {
        text: 'Votre activité sur les 30 derniers jours :',
        s1l: 'Chiffre d’affaires', s1h: '30 derniers jours',
        s2l: 'CA moyen /jour', s2h: () => `${fmt(B.ordersPerDay)} commandes`,
        s3l: 'Commandes /mois', s3h: () => `panier moyen ${fmtMad(B.avgBasket)}`,
        s4l: 'Bénéfice net /mois', s4h: () => `marge nette ${fmt1(B.netMargin)} %`,
      },
      profit: {
        text: 'Votre résultat, une fois toutes les charges payées :',
        s1l: 'Bénéfice net /mois', s1h: () => `marge nette ${fmt1(B.netMargin)} %`,
        s2l: 'Bénéfice net /jour', s2h: () => `${B.daysOpen} jours d’ouverture`,
        s3l: 'Bénéfice par commande', s3h: () => `sur ${fmtMad(B.avgBasket)} de panier`,
        s4l: 'Bénéfice projeté /an', s4h: 'au rythme actuel',
        vGood: () => `Café rentable et sain : vous dégagez ${fmtMad(B.dailyNet)} de bénéfice net par jour d’ouverture.`,
      },
      help: {
        text: 'Bonjour Rachid. Je suis votre assistant financier, je connais Café Atlas : chiffre d’affaires, coût matière, charges, marges et trésorerie. Posez-moi une question chiffrée et je calcule l’impact réel sur votre résultat ; pour une question ouverte sur la gestion de votre café, je peux activer un assistant IA dans votre navigateur. Par exemple :',
      },
      /* Replies for the six guard patterns. Each says plainly what it will
       * NOT do and why, then offers the nearest thing it can actually do. */
      guards: {
        negated: 'Compris, je ne lance pas cette simulation. Dites-moi ce que vous voulez examiner à la place, ou choisissez ci-dessous.',
        meta: 'Je ne devine rien : chaque chiffre vient de vos 30 derniers jours enregistrés dans Kiwi, et chaque simulation applique une règle simple à ces chiffres. Une hausse de prix s’applique au chiffre d’affaires sans toucher au coût matière ; une embauche se retranche du bénéfice net ; le seuil de rentabilité divise vos charges fixes par votre taux de marge. Ouvrez « Voir tous les chiffres » pour la base de départ.',
        layoff: 'Je ne peux pas chiffrer une réduction d’effectif : je connais votre masse salariale globale, pas le salaire de chaque personne. Voici ce que je peux vous montrer, le poids réel de la masse salariale dans vos charges. Pour un départ, la loi marocaine impose préavis et indemnités, faites valider le calcul par votre comptable.',
        scoped: 'Je n’ai pas ce détail. Je raisonne sur des totaux, pas par article, par jour de semaine ni par personne. Le chiffre global ne s’applique pas à un produit précis, ce serait vous induire en erreur de vous le donner comme tel. Le détail par article se trouve dans la page Menu, et le détail par vente dans Transactions.',
        notrend: 'Je ne peux pas comparer deux périodes : je travaille sur une seule fenêtre de 30 jours, sans historique. Je ne sais donc pas mesurer après coup l’effet d’une décision déjà prise. Ce que je peux faire, c’est simuler ce qu’une décision changerait à partir d’aujourd’hui.',
        illicit: 'Je ne vous aiderai pas sur ce point. Kiwi tient aussi votre comptabilité, je ne vais pas vous aider à dissimuler des recettes, à contourner la CNSS ou à payer sous le minimum légal, et vous exposer à un redressement. En revanche je peux réduire vos coûts par des moyens légaux, voici où votre argent part réellement.',
        unclear: 'Je n’ai pas bien saisi votre question. Je comprends le français, l’anglais et l’arabe, et une bonne partie de la darija, mais pas encore tout. Reformulez-la, ou posez-la autrement : je calcule une embauche, une hausse de prix, un investissement, votre seuil de rentabilité, vos marges, vos charges et votre prévision du mois.',
      },
      calc: { title: 'Calcul', result: 'résultat' },
      llm: {
        noGpu: 'Cette question sort de mes calculs, je suis votre copilote chiffres : embauche, prix, investissement, seuil de rentabilité, prévisions, marges et charges. Demandez-moi l’un de ceux-là et la réponse arrive aussitôt. Et pour savoir quels articles de votre menu marchent, ou non, ouvrez la page Menu du tableau de bord.',
        loading: (p) => `Mon assistant IA finit de se charger (${p} %). Je réponds dès qu’il est prêt.`,
        offerLead: 'Cette question sort de mes calculs prédéfinis, mais je peux y répondre librement avec un <b>assistant IA open-source</b> qui s’exécute <b>entièrement dans votre navigateur</b> : aucune donnée ne part ailleurs.',
        offerSize: (sz) => `Premier lancement : un téléchargement unique de ${sz}, ensuite instantané.`,
        activate: 'Activer l’assistant IA',
        installing: 'Installation de l’assistant IA, modèle open-source exécuté dans votre navigateur.',
        initializing: 'Initialisation…',
        ready: 'Assistant IA prêt.',
        readyMsg: 'Mon assistant IA est prêt. Posez-moi vos questions sur la gestion, les finances, l’équipe ou le marketing de votre café, je reste concentré sur votre activité.',
        loadFail: 'Échec du chargement.',
        loadFailMsg: 'Je n’ai pas pu charger l’assistant IA (connexion, mémoire ou navigateur incompatible). Mes calculs financiers restent pleinement disponibles.',
        runErr: 'Une erreur est survenue côté assistant IA. Réessayez, ou demandez-moi un calcul précis.',
      },
      acct: {
        hub: 'Je suis aussi votre comptable, teneur de livres, fiscaliste et gestionnaire de paie, tout est réuni dans votre Comptabilité : livre, états financiers, TVA & impôts, et paie.',
        tva: (D) => `Je m'occupe de votre fiscalité. Pour ${D.period} : TVA à payer <b>${fmtMad(D.tva.aPayer)}</b>, échéance ${D.tva.echeance}. IS estimé sur l'exercice : ${fmtMad(D.is.estimeAnnuel)}. J'ouvre le module pour préparer la déclaration.`,
        paie: (D) => `Côté paie : <b>${D.payroll.headcount} salariés</b>, ${fmtMad(D.payroll.totalNet)} net à verser pour ${D.period}. La déclaration CNSS est due le ${D.payroll.echeance}, je peux générer les fiches.`,
        etats: (D) => `Vos états de ${D.period} : résultat net <b>${fmtMad(D.netProfit)}</b>, trésorerie ${fmtMad(D.cash)}, bilan équilibré. J'ouvre vos états financiers.`,
        livre: (D) => `<b>${fmt(D.entriesThisMonth)} écritures</b> ce mois, chaque vente et chaque dépense, enregistrée et catégorisée automatiquement.`,
      },
    },

    en: {
      ui: {
        title: 'Financial assistant',
        subtitle: 'It knows your café, revenue, costs, margins, cash',
        placeholder: 'Ask a question, hiring, pricing, investment, forecast…',
        calc: 'Calculator', enterToSend: 'Enter to send', send: 'Send',
        kpError: 'Error', kpUse: 'Use this result',
        ctxEyebrow: 'What I know',
        ctxSub: 'Last 30 days · click to insert',
        ctxNote: 'Click any figure to add it to your message, the assistant will reason on it.',
        ctxTrust: 'Everything runs locally. No data leaves this device.',
        gActivity: 'Activity', gProfit: 'Profitability', gFixed: 'Fixed costs', gCash: 'Cash & team',
        perMonth: '/ month', days: 'd', employees: (n) => `${n} employees`,
      },
      facts: {
        revenue: 'Revenue', revPerDay: 'Revenue per day', mtdRev: 'Month-to-date revenue',
        ordersMonth: 'Orders / month', ordersDay: 'Orders / day', basket: 'Average basket',
        grossMargin: 'Gross margin', cogs: 'Cost of goods', profitPerOrder: 'Profit per order',
        breakEven: 'Break-even point', cashAvail: 'Cash available', headcount: 'Headcount',
        netProfit: 'Net profit', netMarginLine: (m) => `net margin ${m} %`,
      },
      opex: {
        salaries: 'Payroll', rent: 'Rent', utilities: 'Water · electricity · gas',
        marketing: 'Marketing & misc.', maintenance: 'Maintenance & equipment',
        insurance: 'Insurance & taxes', financing: 'Depreciation & loan', subscription: 'Kiwi POS subscription',
      },
      chips: {
        hire: 'Can I hire a waiter?', price5: 'What if I raise prices 5%?',
        breakeven: 'What is my break-even point?', forecast: 'Profit forecast this month',
        charges: 'Break down my costs', invest80: 'Can I invest 80,000 MAD?',
        invest150: 'Can I invest 150,000 MAD?',
      },
      hire: {
        text: (c, per, n) => n > 1
          ? `<b>${n} hires</b> at ${fmtMad(per)}/month each, i.e. <b>${fmtMad(c)}/month</b> loaded cost, work out to <b>${fmtMad(c * 12)}/year</b>.`
          : `A hire at <b>${fmtMad(c)}/month</b> loaded cost works out to <b>${fmtMad(c * 12)}/year</b>.`,
        s1l: 'To pay for itself', s1v: (o) => `${fmt1(o / 30)} orders/day`, s1h: (o) => `i.e. ${fmt(o)} orders/month`,
        s2l: 'Extra revenue needed', s2h: 'at the current average basket',
        s3l: 'Net profit after', s3h: () => `vs ${fmtMad(B.netProfit)} today`,
        s4l: 'Share of profit', s4h: 'of your monthly result',
        vGood: (o) => `Favourable, just ${fmt1(o / 30)} more orders a day cover this role. Your margin allows it comfortably.`,
        vWarn: 'Doable, but this role weighs heavily on the result. Make sure the hire genuinely drives extra revenue.',
        vBad: 'Caution, this cost exceeds your current room to manoeuvre. Only consider it with a confirmed rise in activity.',
        note: 'Assumption: 7,200 MAD/month loaded cost for a waiter (net pay + CNSS + bonuses). Give a precise figure to refine.',
        noteLoaded: (per, n) => `I'm counting ${fmtMad(per)}/month ${n > 1 ? 'per person ' : ''}as <i>loaded</i> cost. If that's net pay, add roughly 21% employer CNSS and AMO before you decide.`,
        noteCnss: (per, n) => `I've added roughly 21% employer CNSS and AMO: ${fmtMad(per)}/month ${n > 1 ? 'per person ' : ''}as the cost you actually carry. The exact rate depends on the CNSS ceiling and your agreement, your accountant will confirm it.`,
      },
      price: {
        text: (p) => `A <b>${fmt1(Math.abs(p))}%</b> ${p >= 0 ? 'increase' : 'decrease'} across the whole menu, at constant volume, doesn't touch cost of goods, the difference falls almost entirely into your result.`,
        s1l: 'Net profit /month', s1h: (d) => `${d >= 0 ? '+' : ''}${fmtMad(d)}`,
        s2l: 'Effect over 12 months', s2h: 'at equal activity',
        s3l: 'New net margin', s3h: () => `vs ${fmt1(B.netMargin)} % today`,
        s4l: 'New revenue /month', s4h: (b) => `average basket ${fmtMad(b)}`,
        vUp: (p, d) => `Powerful lever, ${fmt1(p)}% more on price = ${fmtMad(d)} of monthly profit with no extra spend.`,
        vDown: (need) => `A price cut is only funded by volume: you'd need +${fmt1(need)}% orders to keep the result steady.`,
        vFlat: 'No price change, your result stays exactly the same. Give me a percentage to see the effect.',
        textDegenerate: (p, cogs) => `At −${fmt1(p)}%, your revenue would fall below your cost of goods (${fmtMad(cogs)}): you'd sell at a loss on every order. I don't simulate past that, the result would be meaningless.`,
        note: 'Calculated at constant volume. In practice a price rise often trims footfall by 2–4%, watch order counts over the next two weeks.',
        noteAssumed: ' (Assumption: 5%.)',
        noteClamped: ' Percentage pulled back into a realistic range (−100% to +200%): beyond that, the constant-volume assumption stops meaning anything.',
      },
      afford: {
        ask: 'Tell me the investment amount and I\'ll say whether it\'s within reach, for example: <i>"can I invest 80,000 MAD in a terrace?"</i>',
        text: (a) => `An investment of <b>${fmtMad(a)}</b> compares against your available cash (${fmtMad(B.cashBuffer)}) and your net profit (${fmtMad(B.netProfit)}/month).`,
        s1l: 'Recouped in', s1v: (m) => `${fmt1(m)} months`, s1h: 'at the current net profit',
        s2l: 'Cash afterwards', s2hOk: (p) => `${fmt1(p)} % committed`, s2hNo: 'financing required',
        s3l: 'Equivalent to', s3v: (d) => `${fmt1(d)} days`, s3h: 'of operating profit',
        s4l: 'Annual weight', s4h: 'of profit over 12 months',
        vGood: (m, cash) => `Affordable, payable in cash, paid back in ${fmt1(m)} months, with ${fmtMad(cash)} of cash left.`,
        vWarn: (m, p) => `Payable in cash, but payback takes ${fmt1(m)} months and ties up ${fmt1(p)}% of your cash, keep a safety cushion.`,
        vBad: () => `Beyond your available cash (${fmtMad(B.cashBuffer)}). Financing, or spreading the cost, would be needed.`,
      },
      forecast: {
        text: (run) => `Over the <b>first ${B.mtdDays} days of the month</b> (${fmtMad(B.mtdRevenue)} taken), the pace is <b>${fmtMad(run)}/day</b>.`,
        s1l: 'Projected revenue · month', s1h: () => `${B.daysInMonth} days`,
        s2l: 'Projected profit · month', s2h: () => `net margin ${fmt1(B.netMargin)} %`,
        s3l: 'Projected revenue · 12 mo.', s3h: 'at the current pace',
        s4l: 'Profit · 12 months', s4h: 'before corporate tax',
        vGood: (v) => `Positive trend, the month is running ${fmt1(v)}% above your 30-day average. If the pace holds, it's your best month.`,
        vWarn: (v) => `The month is ${fmt1(v)}% below your 30-day average, a push on weekend evenings would bring it back up.`,
        note: 'Linear projection: a public holiday, a rainy weekend or a special event can shift the real figure.',
      },
      breakeven: {
        text: () => `Your break-even, the revenue that exactly covers your fixed costs (${fmtMad(B.totalOpex)}) at a ${fmt1(B.contribRatio * 100)}% contribution margin.`,
        s1l: 'Break-even · monthly rev.', s1h: () => `vs ${fmtMad(B.revenue)} achieved`,
        s2l: 'Break-even · orders/day', s2h: () => `vs ${fmt(B.ordersPerDay)} today`,
        s3l: 'Margin of safety', s3h: 'drop in activity you can absorb',
        s4l: 'Break-even · daily rev.', s4h: () => `vs ${fmtMad(B.dailyRev)} achieved`,
        vGood: () => `Solid position, you operate ${fmt1(B.marginOfSafety)}% above break-even. You'd have to lose nearly a third of activity to reach it.`,
      },
      margin: {
        text: 'Your two margins, over the last 30 days:',
        s1l: 'Gross margin', s1h: () => `${fmtMad(B.grossProfit)} after cost of goods`,
        s2l: 'Net margin', s2h: () => `${fmtMad(B.netProfit)} after all costs`,
        s3l: 'Cost of goods', s3h: () => fmtMad(B.cogs),
        s4l: 'Profit per order', s4h: () => `average basket ${fmtMad(B.avgBasket)}`,
        vGood: () => `Net margin of ${fmt1(B.netMargin)}%, well above the café-restaurant sector average (8 to 12%). Your cost of goods is well controlled.`,
        note: 'Gross margin measures how profitable the menu is; net margin, how profitable the whole operation is.',
      },
      charges: {
        text: () => `Your monthly fixed costs total <b>${fmtMad(B.totalOpex)}</b>, on top of which comes the cost of goods (${fmtMad(B.cogs)}).`,
        share: (p) => `${fmt1(p)} % of costs`,
        verdict: (name, p) => `"${name}" is your biggest line (${fmt1(p)}% of costs), that's where your main optimisation lever sits.`,
      },
      revenue: {
        text: 'Your activity over the last 30 days:',
        s1l: 'Revenue', s1h: 'last 30 days',
        s2l: 'Avg. revenue /day', s2h: () => `${fmt(B.ordersPerDay)} orders`,
        s3l: 'Orders /month', s3h: () => `average basket ${fmtMad(B.avgBasket)}`,
        s4l: 'Net profit /month', s4h: () => `net margin ${fmt1(B.netMargin)} %`,
      },
      profit: {
        text: 'Your result, once every cost is paid:',
        s1l: 'Net profit /month', s1h: () => `net margin ${fmt1(B.netMargin)} %`,
        s2l: 'Net profit /day', s2h: () => `${B.daysOpen} opening days`,
        s3l: 'Profit per order', s3h: () => `on a ${fmtMad(B.avgBasket)} basket`,
        s4l: 'Projected profit /year', s4h: 'at the current pace',
        vGood: () => `A healthy, profitable café: you clear ${fmtMad(B.dailyNet)} of net profit per opening day.`,
      },
      help: {
        text: 'Hello Rachid. I\'m your financial assistant, I know Café Atlas: revenue, cost of goods, costs, margins and cash. Ask me a numbers question and I\'ll compute the real impact on your result; for an open question about running your café, I can switch on an AI assistant right in your browser. For example:',
      },
      guards: {
        negated: 'Understood, I won\'t run that simulation. Tell me what you\'d like to look at instead, or pick one below.',
        meta: 'Nothing here is guesswork: every figure comes from your last 30 days recorded in Kiwi, and every simulation applies one simple rule to those figures. A price rise applies to revenue without touching cost of goods; a hire is subtracted from net profit; break-even divides your fixed costs by your margin rate. Open "See all the figures" for the starting point.',
        layoff: 'I can\'t put a number on cutting headcount: I know your total payroll, not what each person earns. Here\'s what I can show you, the real weight of payroll in your costs. For a departure, Moroccan law requires notice and severance, have your accountant check the calculation.',
        scoped: 'I don\'t have that breakdown. I reason on totals, not per item, per weekday or per person. The global figure doesn\'t apply to one specific product, and handing it to you as if it did would mislead you. Per-item detail is on the Menu page, per-sale detail in Transactions.',
        notrend: 'I can\'t compare two periods: I work from a single 30-day window with no history. So I can\'t measure after the fact what a decision you already took actually did. What I can do is simulate what a decision would change from today.',
        illicit: 'I won\'t help with that. Kiwi also keeps your books, so I\'m not going to help you hide takings, get around CNSS or pay below the legal minimum, and expose you to a tax reassessment. What I can do is cut your costs by lawful means, here is where your money actually goes.',
        unclear: 'I didn’t quite catch that. I understand French, English and Arabic, and a good deal of Darija, but not all of it yet. Try rephrasing, or ask another way: I can work out a hire, a price rise, an investment, your break-even point, your margins, your costs and this month’s forecast.',
      },
      calc: { title: 'Calculation', result: 'result' },
      llm: {
        noGpu: 'That’s outside what I calculate, I’m your numbers copilot: hiring, pricing, investment, break-even, forecasts, margins and charges. Ask me any of those and the answer comes right back. And to see which menu items are working, or not, open the Menu page in your dashboard.',
        loading: (p) => `My AI assistant is finishing loading (${p}%). I'll answer as soon as it's ready.`,
        offerLead: 'This question is beyond my preset calculations, but I can answer it freely with an <b>open-source AI assistant</b> that runs <b>entirely in your browser</b>: no data goes anywhere.',
        offerSize: (sz) => `First launch: a one-time download of ${sz}, instant after that.`,
        activate: 'Turn on the AI assistant',
        installing: 'Installing the AI assistant, open-source model running in your browser.',
        initializing: 'Initialising…',
        ready: 'AI assistant ready.',
        readyMsg: 'My AI assistant is ready. Ask me about managing, financing, staffing or marketing your café, I stay focused on your business.',
        loadFail: 'Loading failed.',
        loadFailMsg: 'I couldn\'t load the AI assistant (connection, memory, or an incompatible browser). My financial calculations remain fully available.',
        runErr: 'Something went wrong on the AI assistant side. Try again, or ask me for a precise calculation.',
      },
      acct: {
        hub: 'I\'m also your accountant, bookkeeper, tax adviser and payroll manager, it\'s all together in your Accounting: ledger, financial statements, VAT & tax, and payroll.',
        tva: (D) => `I'll handle your taxes. For ${D.period}: VAT due <b>${fmtMad(D.tva.aPayer)}</b>, deadline ${D.tva.echeance}. Estimated corporate tax for the year: ${fmtMad(D.is.estimeAnnuel)}. I'm opening the module to prepare the return.`,
        paie: (D) => `On payroll: <b>${D.payroll.headcount} employees</b>, ${fmtMad(D.payroll.totalNet)} net to pay for ${D.period}. The CNSS return is due ${D.payroll.echeance}, I can generate the payslips.`,
        etats: (D) => `Your ${D.period} statements: net result <b>${fmtMad(D.netProfit)}</b>, cash ${fmtMad(D.cash)}, balanced sheet. I'm opening your financial statements.`,
        livre: (D) => `<b>${fmt(D.entriesThisMonth)} entries</b> this month, every sale and expense, recorded and categorised automatically.`,
      },
    },

    ar: {
      /* AR: best-effort MSA — needs native review */
      ui: {
        title: 'المساعد المالي',
        subtitle: 'يعرف مقهاك، المداخيل، التكاليف، الهوامش، الخزينة',
        placeholder: 'اطرح سؤالاً، توظيف، أسعار، استثمار، توقّعات…',
        calc: 'الآلة الحاسبة', enterToSend: 'اضغط Enter للإرسال', send: 'إرسال',
        kpError: 'خطأ', kpUse: 'استعمل هذه النتيجة',
        ctxEyebrow: 'ما أعرفه',
        ctxSub: 'آخر 30 يوماً · انقر للإدراج',
        ctxNote: 'انقر على أي رقم لإضافته إلى رسالتك، وسيحلّله المساعد.',
        ctxTrust: 'كل شيء يعمل محلياً. لا تغادر أي بيانات هذا الجهاز.',
        gActivity: 'النشاط', gProfit: 'الربحية', gFixed: 'التكاليف الثابتة', gCash: 'الخزينة والفريق',
        perMonth: '/ شهر', days: 'يوم', employees: (n) => `${n} موظفين`,
      },
      facts: {
        revenue: 'رقم المعاملات', revPerDay: 'المداخيل في اليوم', mtdRev: 'مداخيل الشهر الجاري',
        ordersMonth: 'الطلبات / شهر', ordersDay: 'الطلبات / يوم', basket: 'متوسط السلة',
        grossMargin: 'الهامش الإجمالي', cogs: 'تكلفة المواد', profitPerOrder: 'الربح لكل طلب',
        breakEven: 'نقطة التعادل', cashAvail: 'الخزينة المتاحة', headcount: 'عدد الموظفين',
        netProfit: 'الربح الصافي', netMarginLine: (m) => `هامش صافٍ ${m} %`,
      },
      opex: {
        salaries: 'كتلة الأجور', rent: 'الكراء', utilities: 'الماء · الكهرباء · الغاز',
        marketing: 'التسويق ومصاريف متنوعة', maintenance: 'الصيانة والمعدات',
        insurance: 'التأمينات والضرائب', financing: 'الإهلاك والقرض', subscription: 'اشتراك Kiwi POS',
      },
      chips: {
        hire: 'هل يمكنني توظيف نادل؟', price5: 'ماذا لو رفعت أسعاري 5%؟',
        breakeven: 'ما هي نقطة التعادل لدي؟', forecast: 'توقّع الربح هذا الشهر',
        charges: 'حلّل تكاليفي', invest80: 'هل يمكنني استثمار 80 000 MAD؟',
        invest150: 'هل يمكنني استثمار 150 000 MAD؟',
      },
      hire: {
        text: (c, per, n) => n > 1
          ? `<b>${n} توظيفات</b> بـ${fmtMad(per)}/شهر لكل واحد، أي <b>${fmtMad(c)}/شهر</b> بتكلفة محمّلة، تعادل <b>${fmtMad(c * 12)}/سنة</b>.`
          : `توظيف بتكلفة محمّلة قدرها <b>${fmtMad(c)}/شهر</b> يعادل <b>${fmtMad(c * 12)}/سنة</b>.`,
        s1l: 'لتمويل نفسه', s1v: (o) => `${fmt1(o / 30)} طلب/يوم`, s1h: (o) => `أي ${fmt(o)} طلب/شهر`,
        s2l: 'المداخيل الإضافية المطلوبة', s2h: 'بمتوسط السلة الحالي',
        s3l: 'الربح الصافي بعد ذلك', s3h: () => `مقابل ${fmtMad(B.netProfit)} اليوم`,
        s4l: 'حصة من الربح', s4h: 'من نتيجتك الشهرية',
        vGood: (o) => `مناسب، يكفي ${fmt1(o / 30)} طلب إضافي في اليوم لتغطية هذا المنصب. هامشك يسمح بذلك بأريحية.`,
        vWarn: 'ممكن، لكن هذا المنصب يثقل النتيجة. تأكد من أن التوظيف يولّد مداخيل إضافية فعلية.',
        vBad: 'حذار، هذه التكلفة تتجاوز هامش مناورتك الحالي. لا تأخذها بعين الاعتبار إلا مع ارتفاع مؤكد في النشاط.',
        note: 'افتراض: 7 200 MAD/شهر تكلفة محمّلة لنادل (الأجر الصافي + CNSS + المكافآت). حدّد مبلغاً دقيقاً للتحسين.',
        noteLoaded: (per, n) => `أحتسب ${fmtMad(per)}/شهر ${n > 1 ? 'لكل شخص ' : ''}كتكلفة <i>محمّلة</i>. إن كان هذا هو الأجر الصافي، أضف نحو 21 % من مساهمات الضمان الاجتماعي والتأمين الصحي قبل أن تقرّر.`,
        noteCnss: (per, n) => `أضفتُ نحو 21 % من مساهمات الضمان الاجتماعي والتأمين الصحي: ${fmtMad(per)}/شهر ${n > 1 ? 'لكل شخص ' : ''}كتكلفة تتحمّلها فعلاً. النسبة الدقيقة تتوقف على سقف الضمان الاجتماعي واتفاقيتك، ومحاسبك سيؤكدها.`,
      },
      price: {
        text: (p) => `${p >= 0 ? 'رفع' : 'خفض'} الأسعار بنسبة <b>${fmt1(Math.abs(p))} %</b> على كامل القائمة، بحجم ثابت، لا يمسّ تكلفة المواد، والفارق يذهب كله تقريباً إلى النتيجة.`,
        s1l: 'الربح الصافي / شهر', s1h: (d) => `${d >= 0 ? '+' : ''}${fmtMad(d)}`,
        s2l: 'الأثر على 12 شهراً', s2h: 'بنشاط مماثل',
        s3l: 'الهامش الصافي الجديد', s3h: () => `مقابل ${fmt1(B.netMargin)} % اليوم`,
        s4l: 'رقم المعاملات الجديد / شهر', s4h: (b) => `متوسط السلة ${fmtMad(b)}`,
        vUp: (p, d) => `رافعة قوية، ${fmt1(p)} % زيادة في السعر = ${fmtMad(d)} ربحاً شهرياً دون أي إنفاق إضافي.`,
        vDown: (need) => `خفض السعر لا يموّله إلا الحجم: ستحتاج إلى +${fmt1(need)} % من الطلبات للحفاظ على النتيجة.`,
        vFlat: 'لا تغيير في الأسعار، ونتيجتك تبقى كما هي. حدّد نسبة لترى الأثر.',
        textDegenerate: (p, cogs) => `عند −${fmt1(p)} %، سينزل رقم معاملاتك تحت تكلفة المواد (${fmtMad(cogs)}): ستبيع بخسارة في كل طلب. لا أحاكي أبعد من ذلك، فالنتيجة لن تعني شيئاً.`,
        note: 'حساب بحجم ثابت. عملياً، رفع الأسعار يقلّص الإقبال غالباً بنسبة 2 إلى 4%، راقب عدد الطلبات خلال الأسبوعين التاليين.',
        noteAssumed: ' (افتراض: 5%.)',
        noteClamped: ' تمّ إرجاع النسبة إلى مجال واقعي (−100% إلى +200%): أبعد من ذلك يفقد افتراض «الحجم الثابت» معناه.',
      },
      afford: {
        ask: 'حدّد مبلغ الاستثمار وسأخبرك إن كان في متناولك، مثلاً: <i>«هل يمكنني استثمار 80 000 MAD في تيراس؟»</i>',
        text: (a) => `استثمار قدره <b>${fmtMad(a)}</b> يُقارَن بخزينتك المتاحة (${fmtMad(B.cashBuffer)}) وبربحك الصافي (${fmtMad(B.netProfit)}/شهر).`,
        s1l: 'يُسترَدّ في', s1v: (m) => `${fmt1(m)} شهراً`, s1h: 'بالربح الصافي الحالي',
        s2l: 'الخزينة بعد ذلك', s2hOk: (p) => `${fmt1(p)} % مُلتزَم بها`, s2hNo: 'يتطلب تمويلاً',
        s3l: 'ما يعادل', s3v: (d) => `${fmt1(d)} يوماً`, s3h: 'من ربح التشغيل',
        s4l: 'الوزن السنوي', s4h: 'من الربح على 12 شهراً',
        vGood: (m, cash) => `في المتناول، يُدفع نقداً، ويُسترَدّ في ${fmt1(m)} شهراً، ويبقى ${fmtMad(cash)} في الخزينة.`,
        vWarn: (m, p) => `يُدفع نقداً، لكن الاسترداد يستغرق ${fmt1(m)} شهراً ويجمّد ${fmt1(p)} % من خزينتك، احتفظ بهامش أمان.`,
        vBad: () => `يتجاوز خزينتك المتاحة (${fmtMad(B.cashBuffer)}). سيلزم تمويل أو تقسيط للتكلفة.`,
      },
      forecast: {
        text: (run) => `خلال <b>الأيام الـ${B.mtdDays} الأولى من الشهر</b> (${fmtMad(B.mtdRevenue)} محصّلة)، الوتيرة هي <b>${fmtMad(run)}/يوم</b>.`,
        s1l: 'رقم معاملات متوقّع · الشهر', s1h: () => `${B.daysInMonth} يوماً`,
        s2l: 'ربح متوقّع · الشهر', s2h: () => `هامش صافٍ ${fmt1(B.netMargin)} %`,
        s3l: 'رقم معاملات متوقّع · 12 شهراً', s3h: 'بالوتيرة الحالية',
        s4l: 'الربح · 12 شهراً', s4h: 'قبل الضريبة على الشركات',
        vGood: (v) => `اتجاه إيجابي، الشهر يتجاوز متوسط 30 يوماً بنسبة ${fmt1(v)} %. إن صمدت الوتيرة، فهو أفضل شهر لك.`,
        vWarn: (v) => `الشهر أدنى بـ${fmt1(v)} % من متوسط 30 يوماً، دفعة في أمسيات نهاية الأسبوع تعيد التوازن.`,
        note: 'توقّع خطّي: يوم عطلة أو نهاية أسبوع ممطرة أو عملية خاصة قد تغيّر النتيجة الفعلية.',
      },
      breakeven: {
        text: () => `نقطة تعادلك، رقم المعاملات الذي يغطّي تماماً تكاليفك الثابتة (${fmtMad(B.totalOpex)}) بهامش مساهمة قدره ${fmt1(B.contribRatio * 100)} %.`,
        s1l: 'العتبة · رقم معاملات شهري', s1h: () => `مقابل ${fmtMad(B.revenue)} مُحقّق`,
        s2l: 'العتبة · طلبات/يوم', s2h: () => `مقابل ${fmt(B.ordersPerDay)} اليوم`,
        s3l: 'هامش الأمان', s3h: 'تراجع في النشاط يمكن استيعابه',
        s4l: 'العتبة · رقم معاملات يومي', s4h: () => `مقابل ${fmtMad(B.dailyRev)} مُحقّق`,
        vGood: () => `وضع متين، تشتغل بنسبة ${fmt1(B.marginOfSafety)} % فوق نقطة التعادل. ستحتاج إلى خسارة ثُلث النشاط تقريباً للوصول إليها.`,
      },
      margin: {
        text: 'هامشاك، على مدى آخر 30 يوماً:',
        s1l: 'الهامش الإجمالي', s1h: () => `${fmtMad(B.grossProfit)} بعد تكلفة المواد`,
        s2l: 'الهامش الصافي', s2h: () => `${fmtMad(B.netProfit)} بعد كل التكاليف`,
        s3l: 'تكلفة المواد', s3h: () => fmtMad(B.cogs),
        s4l: 'الربح لكل طلب', s4h: () => `متوسط السلة ${fmtMad(B.avgBasket)}`,
        vGood: () => `هامش صافٍ قدره ${fmt1(B.netMargin)} %, أعلى بكثير من متوسط قطاع المقاهي والمطاعم (8 إلى 12%). تكلفة موادك مضبوطة جيداً.`,
        note: 'الهامش الإجمالي يقيس ربحية القائمة؛ والهامش الصافي يقيس ربحية الاستغلال بأكمله.',
      },
      charges: {
        text: () => `مجموع تكاليفك الثابتة الشهرية <b>${fmtMad(B.totalOpex)}</b>، تُضاف إليها تكلفة المواد (${fmtMad(B.cogs)}).`,
        share: (p) => `${fmt1(p)} % من التكاليف`,
        verdict: (name, p) => `«${name}» هو أكبر بند لديك (${fmt1(p)} % من التكاليف), وهنا تكمن رافعة التحسين الرئيسية.`,
      },
      revenue: {
        text: 'نشاطك على مدى آخر 30 يوماً:',
        s1l: 'رقم المعاملات', s1h: 'آخر 30 يوماً',
        s2l: 'متوسط المداخيل / يوم', s2h: () => `${fmt(B.ordersPerDay)} طلب`,
        s3l: 'الطلبات / شهر', s3h: () => `متوسط السلة ${fmtMad(B.avgBasket)}`,
        s4l: 'الربح الصافي / شهر', s4h: () => `هامش صافٍ ${fmt1(B.netMargin)} %`,
      },
      profit: {
        text: 'نتيجتك، بعد أداء كل التكاليف:',
        s1l: 'الربح الصافي / شهر', s1h: () => `هامش صافٍ ${fmt1(B.netMargin)} %`,
        s2l: 'الربح الصافي / يوم', s2h: () => `${B.daysOpen} يوم عمل`,
        s3l: 'الربح لكل طلب', s3h: () => `على سلة قدرها ${fmtMad(B.avgBasket)}`,
        s4l: 'ربح متوقّع / سنة', s4h: 'بالوتيرة الحالية',
        vGood: () => `مقهى رابح وسليم: تحقّق ${fmtMad(B.dailyNet)} ربحاً صافياً عن كل يوم عمل.`,
      },
      help: {
        text: 'مرحباً رشيد. أنا مساعدك المالي، أعرف Café Atlas: رقم المعاملات، تكلفة المواد، التكاليف، الهوامش والخزينة. اطرح سؤالاً رقمياً وأحسب الأثر الفعلي على نتيجتك؛ ولسؤال مفتوح حول تسيير مقهاك، يمكنني تشغيل مساعد ذكاء اصطناعي داخل متصفّحك. مثلاً:',
      },
      /* ⚠ best-effort MSA, flagged for native review like the rest of the AR set. */
      guards: {
        negated: 'مفهوم، لن أُجري هذه المحاكاة. قل لي ما الذي تريد دراسته بدل ذلك، أو اختر من الأسفل.',
        meta: 'لا شيء هنا تخمين: كل رقم يأتي من آخر 30 يوماً مسجّلة في Kiwi، وكل محاكاة تطبّق قاعدة بسيطة على تلك الأرقام. رفع الأسعار يُطبَّق على رقم المعاملات دون المساس بتكلفة المواد؛ والتوظيف يُطرح من الربح الصافي؛ ونقطة التعادل تقسم تكاليفك الثابتة على نسبة هامشك. افتح «كل الأرقام» لمعرفة نقطة الانطلاق.',
        layoff: 'لا أستطيع تقدير أثر تقليص العمالة: أعرف كتلة أجورك الإجمالية، لا أجر كل شخص. هذا ما يمكنني عرضه، الوزن الحقيقي لكتلة الأجور في تكاليفك. وفي حالة إنهاء عقد، يفرض القانون المغربي الإشعار والتعويض، فليتحقق محاسبك من الحساب.',
        scoped: 'ليس لديّ هذا التفصيل. أشتغل على المجاميع، لا حسب الصنف ولا حسب يوم الأسبوع ولا حسب الشخص. الرقم الإجمالي لا ينطبق على منتج بعينه، وإعطاؤه لك على هذا الأساس سيضلّلك. تفصيل الأصناف في صفحة القائمة، وتفصيل المبيعات في المعاملات.',
        notrend: 'لا أستطيع مقارنة فترتين: أعمل على نافذة واحدة من 30 يوماً بلا تاريخ سابق. لذلك لا أقدر على قياس أثر قرار اتخذته فعلاً. ما أستطيعه هو محاكاة ما سيغيّره قرار انطلاقاً من اليوم.',
        illicit: 'لن أساعدك في هذا. Kiwi يمسك محاسبتك أيضاً، ولن أساعدك على إخفاء مداخيل أو التحايل على الضمان الاجتماعي أو الأداء دون الحد الأدنى القانوني، وتعريض نفسك لتصحيح ضريبي. لكن يمكنني خفض تكاليفك بطرق قانونية، وهذا هو المسار الحقيقي لأموالك.',
        unclear: 'لم أفهم سؤالك جيداً. أفهم الفرنسية والإنجليزية والعربية، وجزءاً كبيراً من الدارجة، لكن ليس كل شيء بعد. أعد صياغته أو اطرحه بطريقة أخرى: أحسب لك التوظيف، ورفع الأسعار، والاستثمار، ونقطة التعادل، والهوامش، والمصاريف، وتوقّع الشهر.',
      },
      calc: { title: 'حساب', result: 'النتيجة' },
      llm: {
        noGpu: 'هذا السؤال خارج نطاق حساباتي، أنا مساعدك في الأرقام: التوظيف، الأسعار، الاستثمار، عتبة الربحية، التوقّعات، الهوامش والمصاريف. اسألني عن أيٍّ منها وتصلك الإجابة فوراً. ولمعرفة أصناف قائمتك الناجحة من غيرها، افتح صفحة القائمة في لوحة التحكم.',
        loading: (p) => `مساعد الذكاء الاصطناعي يكمل التحميل (${p}%). سأجيب فور جاهزيته.`,
        offerLead: 'هذا السؤال خارج حساباتي المُعدّة مسبقاً، لكن يمكنني الإجابة عنه بحرية عبر <b>مساعد ذكاء اصطناعي مفتوح المصدر</b> يعمل <b>كلياً داخل متصفّحك</b>: لا تغادر أي بيانات.',
        offerSize: (sz) => `الإطلاق الأول: تنزيل واحد بحجم ${sz}، ثم فوري بعد ذلك.`,
        activate: 'تشغيل مساعد الذكاء الاصطناعي',
        installing: 'تثبيت مساعد الذكاء الاصطناعي، نموذج مفتوح المصدر يعمل في متصفّحك.',
        initializing: 'جارٍ التهيئة…',
        ready: 'مساعد الذكاء الاصطناعي جاهز.',
        readyMsg: 'مساعد الذكاء الاصطناعي جاهز. اسألني عن تسيير مقهاك وتمويله وفريقه وتسويقه، أبقى مركّزاً على نشاطك.',
        loadFail: 'فشل التحميل.',
        loadFailMsg: 'تعذّر تحميل مساعد الذكاء الاصطناعي (الاتصال أو الذاكرة أو متصفّح غير متوافق). تبقى حساباتي المالية متاحة بالكامل.',
        runErr: 'حدث خطأ من جهة مساعد الذكاء الاصطناعي. أعد المحاولة، أو اطلب مني حساباً دقيقاً.',
      },
      acct: {
        hub: 'أنا أيضاً محاسبك وماسك دفاترك ومستشارك الضريبي ومدير أجورك، كل ذلك مجتمع في قسم المحاسبة: الدفتر، القوائم المالية، الضريبة والرسوم، والأجور.',
        tva: (D) => `سأتكفّل بضرائبك. لـ ${D.period}: الضريبة المستحقة <b>${fmtMad(D.tva.aPayer)}</b>، الأجل ${D.tva.echeance}. الضريبة على الشركات المقدّرة للسنة: ${fmtMad(D.is.estimeAnnuel)}. أفتح الوحدة لتحضير التصريح.`,
        paie: (D) => `بخصوص الأجور: <b>${D.payroll.headcount} موظفين</b>، ${fmtMad(D.payroll.totalNet)} صافٍ للدفع عن ${D.period}. تصريح CNSS مستحق في ${D.payroll.echeance}, يمكنني إنشاء كشوف الرواتب.`,
        etats: (D) => `قوائم ${D.period}: النتيجة الصافية <b>${fmtMad(D.netProfit)}</b>، الخزينة ${fmtMad(D.cash)}، ميزانية متوازنة. أفتح قوائمك المالية.`,
        livre: (D) => `<b>${fmt(D.entriesThisMonth)} قيد</b> هذا الشهر، كل عملية بيع ونفقة، مسجّلة ومصنّفة تلقائياً.`,
      },
    },
  };

  const tr = () => T[L] || T.fr;

  /* ─────────────── NUMBER PARSING ─────────────── */
  function parseAmount(q) {
    const m = q.match(/(\d[\d  .]*\d|\d)\s*(millions?|m\b|k\b|mille|thousand|alf|ألف)?/i);
    if (!m) return null;
    let n = parseFloat(m[1].replace(/[  .]/g, '').replace(',', '.'));
    const suf = (m[2] || '').toLowerCase();
    if (suf === 'k' || suf === 'mille' || suf === 'thousand' || suf === 'alf' || suf === 'ألف') n *= 1000;
    else if (suf[0] === 'm') n *= 1000000;
    return isFinite(n) ? n : null;
  }
  /* Darija says "فالمية" / "f l mia", not the MSA "بالمئة". Missing it used to
   * silently drop the merchant's figure and fall back to the 5% default — so
   * "raise prices by 10%" was answered as 5%. */
  function parsePercent(q) {
    const m = q.match(/(\d+(?:[.,]\d+)?)\s*(?:%|pour\s?cent|pourcent|percent|بالمئة|بالمائة|في المئة|فالمية|فلمية|فالمائة|\bf\s?l\s?mia\b|\bfelmia\b|\bfa?l?miya\b|\bflmiya\b|\bfelmiya\b|\bfilmia\b|\bb?almia\b)/i);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }
  /* Every amount in the string (not just the first) — lets a compound query
   * like "augmente les prix de 8% et embauche à 6000" separate the percent
   * from the salary figure. */
  function parseAllAmounts(q) {
    const out = [];
    const re = /(\d[\d  .]*\d|\d)\s*(millions?|m\b|k\b|mille|thousand|alf|ألف)?/gi;
    for (const m of String(q).matchAll(re)) {
      let n = parseFloat(m[1].replace(/[  .]/g, '').replace(',', '.'));
      const suf = (m[2] || '').toLowerCase();
      if (suf === 'k' || suf === 'mille' || suf === 'thousand' || suf === 'alf' || suf === 'ألف') n *= 1000;
      else if (suf[0] === 'm') n *= 1000000;
      if (isFinite(n)) out.push(n);
    }
    return out;
  }

  /* ─────────────── CALCULATOR ENGINE ─────────────── */
  function evalMath(expr) {
    let e = fixDigits(String(expr)).replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/\s/g, '').replace(/,/g, '.');
    e = e.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    if (!/^[-+*/().\d]+$/.test(e) || !/\d/.test(e)) return null;
    try {
      const r = Function('"use strict";return(' + e + ')')();
      return (typeof r === 'number' && isFinite(r)) ? r : null;
    } catch (_) { return null; }
  }
  function looksLikeMath(q) {
    const s = fixDigits(q).replace(/\s/g, '');
    return /^[-+*/().,%×÷\d]+$/.test(s) && /\d/.test(s) && /[-+*/×÷]/.test(s);
  }

  /* ═══════════════ SCENARIO ENGINE ═══════════════
   * Each returns { text, stats:[{l,v,h}], verdict:{tone,text}, note, follow:[] } */

  /* ─── New-venue (partial profile) strings — fr / en / ar ─── */
  const NV = {
    fr: {
      costsNeeded: (n) => `${n} démarre sur Kiwi. Je raisonne sur vos ventes réelles enregistrées, mais je n'ai pas encore votre structure de coûts (loyer, salaires, marge, trésorerie). Je préfère ne rien simuler plutôt que d'inventer des chiffres.`,
      costsCta: 'Enregistrez vos ventes au fil des jours et renseignez vos charges dans Réglages, je débloque alors les simulations d\'embauche, de prix, de rentabilité et de prévision.',
      noSales: (n) => `${n} n'a pas encore de vente enregistrée. Dès la première vente saisie en caisse, je commence à suivre votre chiffre d'affaires, votre panier moyen et vos tendances.`,
      revIntro: 'Voici vos ventes réelles enregistrées à ce jour.',
      revLabel: 'Ventes enregistrées', ordLabel: 'Nombre de ventes', basketLabel: 'Panier moyen',
      heroGreet: 'Bonjour.',
      heroLead: (n) => `Je suis votre directeur financier. ${n} démarre sur Kiwi, je travaille à partir de vos ventes réelles. Posez une question, ou commencez ici.`,
      heroIns: 'Enregistrez vos ventes et renseignez vos charges, je débloque alors vos marges, votre seuil de rentabilité et vos simulations.',
      railEmpty: 'Vos charges, marges et trésorerie apparaîtront ici dès que vous les renseignez.',
    },
    en: {
      costsNeeded: (n) => `${n} is just starting on Kiwi. I reason from your real recorded sales, but I don't have your cost structure yet (rent, payroll, margin, cash). I'd rather simulate nothing than invent figures.`,
      costsCta: 'Record your sales day to day and add your costs in Settings, I then unlock hiring, pricing, break-even and forecast simulations.',
      noSales: (n) => `${n} has no recorded sale yet. As soon as the first sale is rung up, I start tracking your revenue, average basket and trends.`,
      revIntro: 'Here are your real recorded sales so far.',
      revLabel: 'Recorded sales', ordLabel: 'Number of sales', basketLabel: 'Average basket',
      heroGreet: 'Hello.',
      heroLead: (n) => `I'm your finance director. ${n} is starting on Kiwi, I work from your real sales. Ask a question, or start here.`,
      heroIns: 'Record your sales and add your costs, I then unlock your margins, break-even point and simulations.',
      railEmpty: 'Your costs, margins and cash will show up here once you record them.',
    },
    ar: {
      costsNeeded: (n) => `${n} بدأ للتو على Kiwi. أعتمد على مبيعاتك الحقيقية المسجّلة، لكن ليس لديّ بعد هيكل تكاليفك (الكراء، الأجور، الهامش، السيولة). أفضّل ألّا أحاكي شيئًا على أن أخترع أرقامًا.`,
      costsCta: 'سجّل مبيعاتك يومًا بيوم وأضف تكاليفك في الإعدادات، عندها أفتح محاكاة التوظيف والأسعار ونقطة التعادل والتوقعات.',
      noSales: (n) => `${n} ليس لديه بعد أي عملية بيع مسجّلة. بمجرد تسجيل أول عملية بيع، أبدأ بتتبّع رقم معاملاتك ومتوسط السلة والاتجاهات.`,
      revIntro: 'هذه مبيعاتك الحقيقية المسجّلة حتى الآن.',
      revLabel: 'المبيعات المسجّلة', ordLabel: 'عدد المبيعات', basketLabel: 'متوسط السلة',
      heroGreet: 'مرحبًا.',
      heroLead: (n) => `أنا مديرك المالي. ${n} يبدأ على Kiwi, أعمل انطلاقًا من مبيعاتك الحقيقية. اطرح سؤالاً أو ابدأ من هنا.`,
      heroIns: 'سجّل مبيعاتك وأضف تكاليفك، عندها أفتح هوامشك ونقطة التعادل والمحاكاة.',
      railEmpty: 'ستظهر تكاليفك وهوامشك وسيولتك هنا بمجرد تسجيلها.',
    },
  };
  const nv = () => NV[L] || NV.fr;

  /* Honest fallback for cost-dependent scenarios on a partial (new) venue —
   * states what real data exists, never invents a cost or margin. */
  function partialReply() {
    const t = nv();
    const r = { text: t.costsNeeded(escHtml(B.name)), note: t.costsCta };
    if (B.revenue > 0) {
      r.stats = [
        { l: t.revLabel, v: fmtMad(B.revenue), h: '' },
        { l: t.ordLabel, v: fmt(B.ordersPerMonth), h: '' },
        { l: t.basketLabel, v: fmtMad(B.avgBasket), h: '' },
      ];
    }
    return r;
  }

  /* How many people. "embaucher 2 personnes à 5000 chacune" used to be priced
   * as ONE hire at the 7 200 default, because parseAmount grabbed the leading
   * "2", rejected it as below a plausible salary, and fell back — quoting
   * 7 200 for a 10 000 MAD/month commitment. Bounded at 50 so a stray number
   * can't inflate the sim. */
  /* Merchants write counts as words at least as often as digits, and the
   * commonest hiring follow-up of all — "et si j'en prends deux" — carries no
   * digit at all, so it used to fall through to the model. */
  const NUM_WORD = {
    deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    two: 2, three: 3, four: 4, five: 5, seven: 7, eight: 8, nine: 9, ten: 10,
    zouj: 2, juj: 2, tlata: 3, rb3a: 4, khamsa: 5,
  };
  const NUM_WORD_RX = new RegExp('\\b(' + Object.keys(NUM_WORD).join('|') + ')\\b');
  function wordCount(q) {
    const m = q.match(NUM_WORD_RX);
    return m ? NUM_WORD[m[1]] : null;
  }

  /* Returns null when the query expresses NO count at all, so the caller can
   * tell "un cuisinier" (explicitly one) from "et avec la CNSS ?" (unstated,
   * therefore still however many we were just discussing). */
  function hireCount(q) {
    const m = q.match(/(\d{1,2})\s*(?:personnes?|serveurs?|serveuses?|employ[eé]?e?s?|salari[eé]s?|cuisiniers?|baristas?|vendeu|caissi|staff|people|workers?|waiters?|cooks?|خدام|عمال|نادل|موظف)/);
    const n = m ? parseInt(m[1], 10) : wordCount(q);
    if (n == null) return null;
    return (n >= 1 && n <= 50) ? n : 1;
  }

  /* "et avec la CNSS ça fait combien" — the merchant is asking to gross their
   * own figure up to employer cost. Morocco: CNSS + AMO employer share ≈ 21 %. */
  const LOADED_RX = /\bcnss\b|\bamo\b|charges? (?:sociale|patronale)|cout charge|coût chargé|employer (?:cost|charges)|الضمان الاجتماعي/;
  const CNSS_UPLIFT = 1.21;

  function sHire(q) {
    if (B.partial) return partialReply();
    const t = tr().hire;
    /* Take the first figure that could plausibly be a monthly salary, not the
     * first number in the string — the leading number is usually the count. */
    const unit = parseAllAmounts(q).filter((v) => v >= 1800)[0];
    /* Count: explicit wins. Otherwise, a message that also states a NEW salary
     * is a fresh spec ("un cuisinier à 6000" → one), while a bare follow-up
     * ("et avec la CNSS ?") still refers to however many we were discussing. */
    const said = hireCount(q);
    const n = said != null ? said : (unit ? 1 : (lastHire.n || 1));
    let per = unit, assumed = false;
    /* A follow-up rarely repeats the salary: "et si j'en prends deux" means
     * two AT THE FIGURE WE JUST DISCUSSED. Carry it rather than silently
     * resetting to the 7 200 default, which would understate the answer. */
    if (!per && lastHire.per) per = lastHire.per;
    if (!per) { per = 7200; assumed = true; }
    /* "et avec la CNSS ?" — gross their net figure up to employer cost. */
    const loaded = LOADED_RX.test(norm(q)) && !assumed;
    if (loaded) per = Math.round(per * CNSS_UPLIFT);
    lastHire = { per: per, n: n };
    const c = per * n;
    const ordersMo = c / (B.avgBasket * B.contribRatio);
    const newNet = B.netProfit - c;
    const tone = c < B.netProfit * 0.4 ? 'good' : c < B.netProfit * 0.8 ? 'warn' : 'bad';
    return {
      text: t.text(c, per, n),
      stats: [
        { l: t.s1l, v: t.s1v(ordersMo), h: t.s1h(ordersMo) },
        { l: t.s2l, v: fmtMad(c / B.contribRatio), h: t.s2h },
        { l: t.s3l, v: fmtMad(newNet), h: t.s3h() },
        { l: t.s4l, v: `${fmt1(c / B.netProfit * 100)} %`, h: t.s4h },
      ],
      verdict: { tone, text: tone === 'good' ? t.vGood(ordersMo) : tone === 'warn' ? t.vWarn : t.vBad },
      /* Always disclose the loaded-cost reading: a merchant who types 4 500
       * usually means net salary, and CNSS + AMO employer share adds ~21%
       * on top. Silently treating their figure as fully loaded understated
       * every hire. When we assumed the whole figure, say that instead. */
      note: assumed ? t.note : (loaded ? t.noteCnss(per, n) : t.noteLoaded(per, n)),
      follow: [tr().chips.price5, tr().chips.breakeven],
    };
  }

  function sPrice(q) {
    if (B.partial) return partialReply();
    const t = tr().price;
    let p = parsePercent(q), assumed = false;
    if (p == null) { p = 5; assumed = true; }
    const down = /\b(baiss|rédui|reduir|diminu|lower|cut|reduc|decrease|خفض|تخفيض)/i.test(norm(q));
    if (down) p = -Math.abs(p);
    /* Clamp before any arithmetic. Unclamped, "baisse les prix de 200%"
     * returned a 177,7% net margin and a MINUS 142 MAD average basket,
     * stated with the same confidence as a real answer. A cut cannot exceed
     * 100%, and beyond +200% the constant-volume assumption is fiction. */
    const clamped = p < -100 || p > 200;
    p = Math.max(-100, Math.min(200, p));
    /* Degenerate cut: below this the new revenue no longer covers the food
     * cost, so every stat downstream is meaningless — at exactly -100 % the
     * margin divides by zero and printed "-∞ %". A sentence the merchant can
     * act on beats four impossible numbers. */
    if (B.revenue * (1 + p / 100) <= B.cogs) {
      return {
        text: t.textDegenerate(Math.abs(p), B.cogs),
        note: t.note + (clamped ? t.noteClamped : ''),
        follow: [tr().chips.breakeven, tr().chips.charges],
      };
    }
    const deltaNet = B.revenue * p / 100;
    const newNet = B.netProfit + deltaNet;
    const newRev = B.revenue * (1 + p / 100);
    const newNetMargin = newNet / newRev * 100;
    const tone = p > 0 ? (p <= 8 ? 'good' : 'warn') : 'warn';
    return {
      text: t.text(p),
      stats: [
        { l: t.s1l, v: fmtMad(newNet), h: t.s1h(deltaNet) },
        { l: t.s2l, v: `${deltaNet >= 0 ? '+' : ''}${fmtMad(deltaNet * 12)}`, h: t.s2h },
        { l: t.s3l, v: `${fmt1(newNetMargin)} %`, h: t.s3h() },
        { l: t.s4l, v: fmtMad(newRev), h: t.s4h(B.avgBasket * (1 + p / 100)) },
      ],
      /* p === 0 used to fall through to vDown and announce "une BAISSE de
       * prix" right under a headline reading "une hausse de 0,0 %". */
      verdict: {
        tone,
        text: p === 0 ? t.vFlat : p > 0 ? t.vUp(p, deltaNet) : t.vDown(Math.abs(p) / B.contribRatio),
      },
      note: t.note + (assumed ? t.noteAssumed : '') + (clamped ? t.noteClamped : ''),
      follow: [tr().chips.forecast, tr().chips.charges],
    };
  }

  function sAfford(q) {
    if (B.partial) return partialReply();
    const t = tr().afford;
    const A = parseAmount(q);
    if (!A || A < 100) {
      return { text: t.ask, follow: [tr().chips.invest80, tr().chips.invest150] };
    }
    const monthsRecoup = A / B.netProfit;
    const afterCash = B.cashBuffer - A;
    const pctCash = A / B.cashBuffer * 100;
    const tone = (A <= B.cashBuffer && monthsRecoup < 6) ? 'good'
      : (A <= B.cashBuffer ? 'warn' : 'bad');
    return {
      text: t.text(A),
      stats: [
        { l: t.s1l, v: t.s1v(monthsRecoup), h: t.s1h },
        { l: t.s2l, v: fmtMad(Math.max(afterCash, 0)), h: afterCash >= 0 ? t.s2hOk(pctCash) : t.s2hNo },
        { l: t.s3l, v: t.s3v(A / B.dailyNet), h: t.s3h },
        { l: t.s4l, v: `${fmt1(A / (B.netProfit * 12) * 100)} %`, h: t.s4h },
      ],
      verdict: {
        tone,
        text: tone === 'good' ? t.vGood(monthsRecoup, afterCash)
          : tone === 'warn' ? t.vWarn(monthsRecoup, pctCash) : t.vBad(),
      },
      follow: [tr().chips.breakeven, tr().chips.forecast],
    };
  }

  function sForecast() {
    if (B.partial) return partialReply();
    const t = tr().forecast;
    const runRate = B.mtdRevenue / B.mtdDays;
    const projRev = runRate * B.daysInMonth;
    // Use the exact net-margin ratio (net ÷ revenue), not the rounded 22.3%
    // display constant, so the projection reconciles to the P&L to the dirham.
    const projNet = projRev * (B.netProfit / B.revenue);
    const vsAvg = (projRev - B.revenue) / B.revenue * 100;
    const tone = vsAvg >= 0 ? 'good' : 'warn';
    return {
      text: t.text(runRate),
      stats: [
        { l: t.s1l, v: fmtMad(projRev), h: t.s1h() },
        { l: t.s2l, v: fmtMad(projNet), h: t.s2h() },
        { l: t.s3l, v: fmtMad(projRev * 12), h: t.s3h },
        { l: t.s4l, v: fmtMad(projNet * 12), h: t.s4h },
      ],
      verdict: { tone, text: vsAvg >= 0 ? t.vGood(vsAvg) : t.vWarn(Math.abs(vsAvg)) },
      note: t.note,
      follow: [tr().chips.charges, tr().chips.price5],
    };
  }

  /* ADVICE — surface the shared, data-derived insight engine (the SAME one the
   * hero "Recommandations du jour" card uses, in insights.js) so the assistant
   * and the dashboard are conscious of, and agree on, the same real facts. */
  const ADVICE_INTRO = {
    fr: 'Voici vos leviers les plus rentables, calculés sur vos chiffres réels :',
    en: 'Here are your highest-impact levers, computed from your real numbers:',
    ar: 'إليك أعلى الروافع ربحية، محسوبة من أرقامك الحقيقية:',
  };
  function sAdvice(q) {
    if (B.partial) return partialReply();
    const lng = detectQLang(q);
    const ins = (window.KiwiInsights && window.KiwiInsights.compute) ? window.KiwiInsights.compute(undefined, lng) : [];
    if (!ins.length) return null;   // no real data to ground on → let the LLM answer
    const list = ins.slice(0, 3).map((i) =>
      `<div style="border-inline-start:2px solid var(--atlas);padding:1px 0 1px 12px;margin:11px 0;">` +
        `<div style="font-family:var(--mono);font-size:10px;letter-spacing:0.1em;color:var(--atlas);">${escHtml(i.kpi)}</div>` +
        `<div style="font-weight:600;margin:3px 0 2px;line-height:1.3;">${escHtml(i.title)}</div>` +
        `<div style="font-size:13px;color:var(--n-600);line-height:1.45;">${escHtml(i.act)}</div>` +
      `</div>`).join('');
    return { text: `${ADVICE_INTRO[lng] || ADVICE_INTRO.fr}${list}`, follow: [tr().chips.price5, tr().chips.forecast] };
  }

  function sBreakEven() {
    if (B.partial) return partialReply();
    const t = tr().breakeven;
    return {
      text: t.text(),
      stats: [
        { l: t.s1l, v: fmtMad(B.breakEvenRev), h: t.s1h() },
        { l: t.s2l, v: fmt(B.breakEvenOrdersDay), h: t.s2h() },
        { l: t.s3l, v: `${fmt1(B.marginOfSafety)} %`, h: t.s3h },
        { l: t.s4l, v: fmtMad(B.breakEvenRev / B.daysOpen), h: t.s4h() },
      ],
      verdict: { tone: 'good', text: t.vGood() },
      follow: [tr().chips.hire, tr().chips.forecast],
    };
  }

  function sMargin() {
    if (B.partial) return partialReply();
    const t = tr().margin;
    return {
      text: t.text,
      stats: [
        { l: t.s1l, v: `${fmt1(B.grossMargin)} %`, h: t.s1h() },
        { l: t.s2l, v: `${fmt1(B.netMargin)} %`, h: t.s2h() },
        { l: t.s3l, v: `${fmt1(100 - B.grossMargin)} %`, h: t.s3h() },
        { l: t.s4l, v: fmtMad(B.netPerOrder), h: t.s4h() },
      ],
      verdict: { tone: 'good', text: t.vGood() },
      note: t.note,
      follow: [tr().chips.charges, tr().chips.price5],
    };
  }

  function sCharges() {
    if (B.partial) return partialReply();
    const t = tr().charges;
    const labels = tr().opex;
    const items = Object.entries(B.opex).sort((a, b) => b[1] - a[1]);
    const biggest = items[0];
    return {
      text: t.text(),
      stats: items.map(([k, v]) => ({ l: labels[k] || k, v: fmtMad(v), h: t.share(v / B.totalOpex * 100) })),
      verdict: { tone: 'warn', text: t.verdict(labels[biggest[0]] || biggest[0], biggest[1] / B.totalOpex * 100) },
      follow: [tr().chips.hire, tr().chips.breakeven],
    };
  }

  function sRevenue() {
    const t = tr().revenue;
    if (B.partial) {
      if (!(B.revenue > 0)) return { text: nv().noSales(escHtml(B.name)) };
      const p = nv();
      return {
        text: p.revIntro,
        stats: [
          { l: p.revLabel, v: fmtMad(B.revenue), h: '' },
          { l: p.ordLabel, v: fmt(B.ordersPerMonth), h: '' },
          { l: p.basketLabel, v: fmtMad(B.avgBasket), h: '' },
        ],
        note: p.costsCta,
      };
    }
    return {
      text: t.text,
      stats: [
        { l: t.s1l, v: fmtMad(B.revenue), h: t.s1h },
        { l: t.s2l, v: fmtMad(B.dailyRev), h: t.s2h() },
        { l: t.s3l, v: fmt(B.ordersPerMonth), h: t.s3h() },
        { l: t.s4l, v: fmtMad(B.netProfit), h: t.s4h() },
      ],
      follow: [tr().chips.forecast, tr().chips.charges],
    };
  }

  function sProfit() {
    if (B.partial) return partialReply();
    const t = tr().profit;
    return {
      text: t.text,
      stats: [
        { l: t.s1l, v: fmtMad(B.netProfit), h: t.s1h() },
        { l: t.s2l, v: fmtMad(B.dailyNet), h: t.s2h() },
        { l: t.s3l, v: fmtMad(B.netPerOrder), h: t.s3h() },
        { l: t.s4l, v: fmtMad(B.netProfit * 12), h: t.s4h },
      ],
      verdict: { tone: 'good', text: t.vGood() },
      follow: [tr().chips.invest80, tr().chips.breakeven],
    };
  }

  /* ─── Accounting agent (Comptabilité) — opens the hub / a module ─── */
  const ACCT_LBL = {
    fr: { open: 'Ouvrir ma comptabilité', tva: 'Ouvrir TVA & Impôts', paie: 'Ouvrir la Paie', etats: 'Ouvrir les états financiers', livre: 'Ouvrir le grand livre' },
    en: { open: 'Open my accounting', tva: 'Open Tax & VAT', paie: 'Open Payroll', etats: 'Open financial statements', livre: 'Open the ledger' },
    ar: { open: 'افتح محاسبتي', tva: 'الضريبة والـTVA', paie: 'الأجور', etats: 'القوائم المالية', livre: 'دفتر الأستاذ' },
  };
  const acctLabel = (k) => (ACCT_LBL[L] || ACCT_LBL.fr)[k];
  const RX_ACCT = /(comptab|grand.?livre|ecritur|\btva\b|impot|fiscal|declarat|cnss|\bpaie\b|fiche.?de.?paie|bulletin.?de.?paie|bilan|cloture|amortiss|\bdgi\b|etats financiers|account|bookkeep|ledger|\bvat\b|payroll|payslip|\btax\b|balance.?sheet|financial.?statement|محاسب|دفتر|ضريب)/;

  /* ─── Empty-state hero — the assistant's first screen ─── */
  const HERO_L = {
    fr: {
      greet: 'Bonjour Rachid.',
      lead: 'Je suis votre directeur financier, je connais Café Atlas dans le détail. Posez une question chiffrée, ou commencez ici.',
      c1t: 'Simuler une embauche', c1s: 'Coût réel sur la marge',
      c2t: 'Tester une hausse de prix', c2s: 'Effet sur le bénéfice',
      c3t: 'Ma comptabilité', c3s: 'Livre · TVA · paie · états',
      insT: 'État du jour ·',
      ins: (m, s) => `Café Atlas est solide, marge nette ${m} %, soit ${s} % au-dessus de votre seuil de rentabilité.`,
      autres: 'Autres', more: 'Voir tous les chiffres', less: 'Réduire',
    },
    en: {
      greet: 'Hello Rachid.',
      lead: 'I’m your finance director, I know Café Atlas inside out. Ask a numbers question, or start here.',
      c1t: 'Simulate a hire', c1s: 'Real cost on margin',
      c2t: 'Test a price rise', c2s: 'Effect on profit',
      c3t: 'My accounting', c3s: 'Ledger · VAT · payroll · books',
      insT: 'Today ·',
      ins: (m, s) => `Café Atlas is solid, ${m} % net margin, ${s} % above your break-even point.`,
      autres: 'Other', more: 'Show every figure', less: 'Collapse',
    },
    ar: {
      greet: 'مرحبا رشيد.',
      lead: 'أنا مديرك المالي، أعرف مقهى أطلس بالتفصيل. اطرح سؤالاً بالأرقام أو ابدأ من هنا.',
      c1t: 'محاكاة توظيف', c1s: 'التكلفة على الهامش',
      c2t: 'اختبار رفع الأسعار', c2s: 'الأثر على الربح',
      c3t: 'محاسبتي', c3s: 'الدفتر · الضريبة · الأجور',
      insT: 'اليوم ·',
      ins: (m, s) => `مقهى أطلس في وضع جيد، هامش صافٍ ${m}٪، أي ${s}٪ فوق نقطة التعادل.`,
      autres: 'أخرى', more: 'عرض كل الأرقام', less: 'إخفاء',
    },
  };
  const HL = () => HERO_L[L] || HERO_L.fr;

  function renderHero() {
    const h = HL();
    const safety = (B.revenue - B.breakEvenRev) / B.revenue * 100;
    const icHire = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.6"/><path d="M5 21v-1a6 6 0 016-6h2a6 6 0 016 6v1"/></svg>';
    const icPct  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/></svg>';
    const icBook = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4a2 2 0 012-2h12v20H7a2 2 0 01-2-2z"/><path d="M9 2v20"/></svg>';
    const icIns  = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.6l2.55 6.86 6.85 2.54-6.85 2.55L12 22.4l-2.55-6.85L2.6 13l6.85-2.54z"/></svg>';
    const heroH   = B.partial ? nv().heroGreet        : h.greet;
    const heroP   = B.partial ? nv().heroLead(escHtml(B.name)) : h.lead;
    const heroIns = B.partial ? nv().heroIns          : h.ins(fmt1(B.netMargin), fmt1(safety));
    return `<div class="fa-hero" data-fa-hero>
      <div class="fa-hero-mark">${ICON.avatar}</div>
      <div class="fa-hero-h">${heroH}</div>
      <div class="fa-hero-p">${heroP}</div>
      <div class="fa-hero-cards">
        <button class="fa-hero-card" type="button" data-fa-follow="${escAttr(tr().chips.hire)}">
          <span class="ic">${icHire}</span><span class="t">${h.c1t}</span><span class="s">${h.c1s}</span></button>
        <button class="fa-hero-card" type="button" data-fa-follow="${escAttr(tr().chips.price5)}">
          <span class="ic">${icPct}</span><span class="t">${h.c2t}</span><span class="s">${h.c2s}</span></button>
        <button class="fa-hero-card" type="button" data-fa-open="open-comptabilite">
          <span class="ic">${icBook}</span><span class="t">${h.c3t}</span><span class="s">${h.c3s}</span></button>
      </div>
      <div class="fa-hero-insight">${icIns}<div><b>${h.insT}</b> ${heroIns}</div></div>
    </div>`;
  }

  function sHelp() {
    // A real / custom-venue merchant must NOT get the demo greeting that names
    // "Rachid" and "Café Atlas". Mirror the rest of the agent (gated on B.partial):
    // use the neutral, business-derived intro instead.
    const text = B.partial
      ? (nv().heroGreet + ' ' + nv().heroLead(escHtml(B.name)))
      : tr().help.text;
    return {
      text,
      follow: [tr().chips.hire, tr().chips.price5, tr().chips.breakeven, tr().chips.forecast, tr().chips.invest80],
      open: [{ label: acctLabel('open'), handler: 'open-comptabilite' }],
    };
  }

  /* ─── GUARD REPLIES ────────────────────────────────────────────────────
   * The six cases where the honest answer is "I won't run that". Each states
   * the limit plainly and offers the nearest thing it CAN do — a dead end is
   * worse than a wrong answer only if it leaves the merchant with nothing. */
  const gTxt = () => (tr().guards || T.fr.guards);

  function sNegated() {
    return {
      text: gTxt().negated,
      follow: [tr().chips.breakeven, tr().chips.charges, tr().chips.forecast],
    };
  }

  function sMeta() {
    return {
      text: gTxt().meta,
      follow: [tr().chips.charges, tr().chips.breakeven],
    };
  }

  function sScoped() {
    return { text: gTxt().scoped, follow: [tr().chips.charges, tr().chips.forecast] };
  }

  function sNoTrend() {
    return { text: gTxt().notrend, follow: [tr().chips.forecast, tr().chips.breakeven] };
  }

  /* Darija the lexicon didn't cover. Say so, and show what IS understood —
   * never pass it to the model, which fabricates money in this register. */
  function sUnclear() {
    return {
      text: gTxt().unclear,
      follow: [tr().chips.hire, tr().chips.price5, tr().chips.breakeven, tr().chips.charges],
    };
  }

  /* Layoff and illicit both land on the same constructive alternative: show
   * where the money actually goes. On a partial profile there are no costs
   * to show, so the guard text stands alone rather than inventing a table. */
  function withCharges(text) {
    if (B.partial) return { text };
    const c = sCharges();
    return { text, stats: c.stats, verdict: c.verdict, follow: [tr().chips.breakeven, tr().chips.forecast] };
  }
  function sLayoff() { return withCharges(gTxt().layoff); }
  function sIllicit() { return withCharges(gTxt().illicit); }

  function sAccounting(q) {
    const D = window.KiwiComptable && window.KiwiComptable.data;
    const a = tr().acct;
    let handler = 'open-comptabilite', btn = acctLabel('open'), text;
    if (D && /\btva\b|\bvat\b|impot|\btax\b|fiscal|declarat|acompte|\bdgi\b|\bis\b/.test(q)) {
      handler = 'acct-tva'; btn = acctLabel('tva'); text = a.tva(D);
    } else if (D && /cnss|\bpaie\b|payroll|payslip|fiche|bulletin|salair|salary|wage/.test(q)) {
      handler = 'acct-paie'; btn = acctLabel('paie'); text = a.paie(D);
    } else if (D && /bilan|balance|result|\betats?\b|statement|financial|cloture|comptes/.test(q)) {
      handler = 'acct-etats'; btn = acctLabel('etats'); text = a.etats(D);
    } else if (D && /livre|ledger|ecritur|entries|journal|bookkeep|comptabilis/.test(q)) {
      handler = 'acct-livre'; btn = acctLabel('livre'); text = a.livre(D);
    } else {
      text = a.hub;
    }
    return { text, open: [{ label: btn, handler }] };
  }

  function sCalc(expr, result) {
    return {
      text: tr().calc.title,
      stats: [{
        l: expr.trim(),
        v: fmt1(Math.round(result * 100) / 100).replace(/,0$/, ''),
        h: Math.abs(result) > 999 ? tr().calc.result : '',
      }],
    };
  }

  /* ─── Compound scenario — combine two levers (e.g. a price rise + a hire)
   * on one bottom line. A first-match router could only ever model one change
   * at a time; this sums each lever's effect on net profit. ─── */
  const CMP = {
    fr: { title: 'Deux leviers combinés', pm: '/mois',
          priceUp: (p) => `Hausse des prix · +${p} %`, priceDown: (p) => `Baisse des prix · −${p} %`,
          hire: 'Coût de l’embauche', newNet: 'Nouveau bénéfice net', annual: 'Effet net sur l’année',
          vGood: (a) => `Les deux tiennent ensemble : le bénéfice net reste solide (${a} sur l’année).`,
          vWarn: 'Jouable, mais c’est la hausse de prix qui finance l’embauche. Surveillez le volume.',
          vBad: 'Ensemble, ces deux décisions font passer le bénéfice net dans le rouge. Étalez-les dans le temps.' },
    en: { title: 'Two levers combined', pm: '/mo',
          priceUp: (p) => `Price rise · +${p}%`, priceDown: (p) => `Price cut · −${p}%`,
          hire: 'Cost of the hire', newNet: 'New net profit', annual: 'Net effect over the year',
          vGood: (a) => `Both hold together: net profit stays solid (${a} over the year).`,
          vWarn: 'Doable, but the price rise is what funds the hire. Watch volume.',
          vBad: 'Together these two push net profit into the red. Stagger them over time.' },
    ar: { title: 'رافعتان مجتمعتان', pm: '/شهر',
          priceUp: (p) => `رفع الأسعار · +${p}%`, priceDown: (p) => `خفض الأسعار · −${p}%`,
          hire: 'تكلفة التوظيف', newNet: 'الربح الصافي الجديد', annual: 'الأثر الصافي على السنة',
          vGood: (a) => `الاثنان متماسكان: الربح الصافي يبقى متينًا (${a} على مدى السنة).`,
          vWarn: 'ممكن، لكن رفع الأسعار هو ما يموّل التوظيف. راقب حجم المبيعات.',
          vBad: 'مجتمعين، يدفعان الربح الصافي إلى الخسارة. وزّعهما على الوقت.' },
  };
  function sCompound(raw) {
    if (B.partial) return partialReply();
    const c = CMP[L] || CMP.fr;
    const pct = parsePercent(raw);
    let p = pct == null ? 5 : pct;
    if (/baiss|rédui|reduir|diminu|lower|cut|reduc|decrease|خفض|تخفيض/.test(norm(raw))) p = -Math.abs(p);
    /* Separate the salary from the percent: a hire cost is a salary-scale
     * figure (≥ 1800 MAD), so the 8 in "8%" can never be mistaken for it. */
    const salaries = parseAllAmounts(raw).filter((n) => n >= 1800);
    const hireCost = salaries.length ? Math.max.apply(null, salaries) : 7200;
    const deltaPrice = B.revenue * p / 100;
    const deltaHire = -hireCost;
    const newNet = B.netProfit + deltaPrice + deltaHire;
    const newRev = B.revenue * (1 + p / 100);
    const annual = (deltaPrice + deltaHire) * 12;
    const tone = newNet <= 0 ? 'bad' : (newNet >= B.netProfit ? 'good' : 'warn');
    return {
      text: c.title,
      stats: [
        { l: p >= 0 ? c.priceUp(fmt1(Math.abs(p))) : c.priceDown(fmt1(Math.abs(p))), v: `${deltaPrice >= 0 ? '+' : ''}${fmtMad(deltaPrice)}`, h: c.pm },
        { l: c.hire, v: fmtMad(deltaHire), h: c.pm },
        { l: c.newNet, v: fmtMad(newNet), h: `${fmt1(newNet / newRev * 100)} %` },
        { l: c.annual, v: `${annual >= 0 ? '+' : ''}${fmtMad(annual)}`, h: '' },
      ],
      verdict: { tone, text: tone === 'good' ? c.vGood(fmtMad(annual)) : tone === 'warn' ? c.vWarn : c.vBad },
      follow: [tr().chips.breakeven, tr().chips.forecast],
    };
  }

  /* ─────────────── ACTION / TOOL LAYER (the agent can act, fr/en/ar) ───────
   * Lets the assistant *do*, not just describe: a command that pairs an action
   * verb (open / show / create…) with a known destination resolves to the real
   * dashboard handler (the same Kiwi.handlers the sidebar fires), surfaced as a
   * one-tap button. Targets are disjoint from the finance intents, so this
   * never steals "show my margin" — that has no navigable target. */
  const ACTION_VERB = /ouvr|montr|affich|open|show|go to|display|navigate|cr[ée]er?|create|nouvelle|new |اعرض|افتح|انتقل|أنشئ/;
  const NAV_TARGETS = [
    { rx: /\bmenu\b|\bcarte\b|modificateur|قائمة/, h: 'nav-menu', key: 'menu' },
    { rx: /transaction|commande|orders?\b|طلبات/, h: 'nav-transactions', key: 'transactions' },
    { rx: /terminaux|terminal|\btpe\b|lecteur|أجهزة/, h: 'nav-terminaux', key: 'terminaux' },
    { rx: /reglement|settlement|versement|تسوي/, h: 'nav-reglements', key: 'reglements' },
    { rx: /conformit|compliance|\bkyc\b|امتثال/, h: 'nav-conformite', key: 'conformite' },
    { rx: /\bequipe\b|\bteam\b|personnel|فريق/, h: 'nav-equipe', key: 'equipe' },
    { rx: /\btables?\b|plan de salle|floor plan|طاولات/, h: 'nav-tables', key: 'tables' },
    { rx: /cuisine|\bkds\b|kitchen|مطبخ/, h: 'nav-kds', key: 'kds' },
    { rx: /stock|inventaire|inventory|ingredient|مخزون/, h: 'nav-stock', key: 'stock' },
    { rx: /reservation|booking|\brdv\b|حجز|حجوزات/, h: 'nav-reservations', key: 'reservations' },
    { rx: /lien de paiement|payment link|رابط دفع/, h: 'payment-link', key: 'paymentLink' },
    { rx: /nouvelle vente|new sale|بيع جديد/, h: 'new-sale', key: 'newSale' },
  ];
  function matchAction(q) {
    if (!ACTION_VERB.test(q)) return null;
    for (const t of NAV_TARGETS) if (t.rx.test(q)) return t;
    return null;
  }
  const ACT = {
    fr: { lead: (x) => `J’ouvre ${x}.`, btn: (x) => `Ouvrir ${x}`,
      menu: 'la carte', transactions: 'les commandes', terminaux: 'les terminaux', reglements: 'les règlements',
      conformite: 'la conformité', equipe: 'l’équipe', tables: 'les tables', kds: 'l’écran cuisine', stock: 'le stock',
      reservations: 'les réservations', paymentLink: 'un lien de paiement', newSale: 'une nouvelle vente' },
    en: { lead: (x) => `Opening ${x}.`, btn: (x) => `Open ${x}`,
      menu: 'the menu', transactions: 'orders', terminaux: 'the terminals', reglements: 'settlements',
      conformite: 'compliance', equipe: 'the team', tables: 'the tables', kds: 'the kitchen screen', stock: 'stock',
      reservations: 'reservations', paymentLink: 'a payment link', newSale: 'a new sale' },
    ar: { lead: (x) => `أفتح ${x}.`, btn: (x) => `افتح ${x}`,
      menu: 'القائمة', transactions: 'الطلبات', terminaux: 'الأجهزة', reglements: 'التسويات',
      conformite: 'الامتثال', equipe: 'الفريق', tables: 'الطاولات', kds: 'شاشة المطبخ', stock: 'المخزون',
      reservations: 'الحجوزات', paymentLink: 'رابط دفع', newSale: 'عملية بيع جديدة' },
  };
  function sAction(target) {
    const a = ACT[L] || ACT.fr;
    const name = a[target.key] || target.key;
    return { text: a.lead(name), open: [{ label: a.btn(name), handler: target.h }] };
  }

  /* ─────────────── INTENT CLASSIFIER (scored · fr / en / ar) ───────────────
   * Replaces the old first-match regex chain. Every intent is scored by
   * weighted signals; the HIGHEST score wins (ties resolve by the historical
   * order). A query that clears no real signal (top score < MIN_SCORE) is
   * handed to the LLM rather than force-fit into a wrong scenario. Two strong
   * combinable scenarios joined by "et / and / +" trigger a compound sim. */
  const MIN_SCORE = 2;
  const CONJ_RX = /(\bet\b|\band\b|\+|aussi|also|ainsi que|en plus|as well|و )/;
  const PRICE_VERB = /augment|hauss|baiss|monter|raise|increase|lower|cut|reduce|رفع|خفض|زيادة|تخفيض|\bnzid\b|\bzid\b|\bne9es\b|\bnn9es\b|نزيد|نقص/;
  /* "wach n9der nzid wahed lkhdam" is a HIRING question, but "n9der" scores 3
   * on `afford` while the worker noun only scores 2 on `hire` — so afford won
   * and the merchant got "indiquez le montant de l'investissement". A worker
   * noun together with an add/hire verb is unambiguous, so it lifts hire above
   * a bare capability verb. */
  const WORKER_RX = /serveur|cuisinier|barista|waiter|cook|نادل|طباخ|عامل|موظف|\bkhdam\b|\blkhdam\b|\bkhaddam\b|\b3amel\b|خدام/;
  const ADD_VERB = /\bnzid\b|\bzid\b|embauch|recrut|engag|hire|recruit|نزيد|زيد|نوظف/;

  /* ─── GUARD PATTERNS ───────────────────────────────────────────────────
   * Six things a keyword router gets confidently wrong. Each is checked in
   * decideRoute BEFORE the scored classifier, because in every case the right
   * answer is "don't run that simulation" — and a scored match would happily
   * run it. Patterns are written accent-free: norm() strips diacritics. */

  /* 1. Negation. "je ne veux pas augmenter les prix" used to return a full
   *    price-rise simulation; "je n'ai pas les moyens d'embaucher" answered
   *    "Favorable, votre marge le permet largement". Deliberately narrow —
   *    it must not swallow a refinement ("non, plutôt 4500") or an ordinary
   *    sentence that merely contains "pas" ("pour pas couler"). */
  const NEG_RX = /\b(?:je\s+)?n[e']?\s*(?:veux|voudrais|vais|compte|souhaite|peux|pense|ai)(?:\s+\w+){0,2}\s+(?:pas|plus|jamais)\b|\bj[e']?\s*ai\s+pas\b|\bpas\s+(?:besoin|question|envie|interesse)\b|\bne\s+me\s+parle\s+(?:pas|plus)\b|\bsurtout\s+pas\b|\b(?:don'?t|do\s+not|won'?t|not\s+going\s+to|no\s+need)\b|ما\s*بغيت|لا\s*أريد|ماباغيش|ما\s*نقدرش|\bma\s*bghit(?:ch)?\b|\bmabghitch\b|\bma\s*n9dersh\b|\bmakan\w*ch\b/;

  /* 2. Meta / challenge. "t'es sûr de ce chiffre ?" scored +3 on `chiffre`
   *    and returned an unrelated revenue dump. Challenging a number is the
   *    single most likely follow-up, so it gets a real answer instead. */
  const META_RX = /\b(?:t[' ]?es|tu\s+es|es[- ]?tu)\s+s[uû]r|\bare\s+you\s+sure|d[' ]?ou\s+(?:sort|vient|viennent|sortent)|comment\s+(?:tu\s+)?(?:calcul|fais|obtiens|arrives)|comment\s+(?:est|sont)\s+calcul|explique.{0,24}(?:calcul|chiffre|nombre|resultat|comment)|explique[- ]?moi\s+comment|sur\s+quoi\s+(?:tu\s+te\s+bases|te\s+bases)|c[' ]?est\s+quoi\s+ce\s+chiffre|pourquoi\s+ce\s+chiffre|where\s+does\s+(?:that|it)\s+come\s+from|how\s+do\s+you\s+calculate|من\s*اين|كيف\s*حسبت/;

  /* 3. Layoff. "je veux licencier 3 serveurs, combien j'économise" matched
   *    `serveur` and returned a HIRING simulation verdicted "Favorable". */
  const LAYOFF_RX = /licenci|\bvirer\b|renvoyer|degraisser|reduire\s+l[' ]?effectif|se\s+separer\s+de|\bfire\s+(?:someone|a|an|my|the)|\blay[- ]?off|\bsack\b|طرد|تسريح/;

  /* 4. Scope narrower than the data. "ma marge sur le thé à la menthe"
   *    returned the GLOBAL 69% as if it were the mint tea margin — the
   *    exact "never emit a number we don't have" violation. */
  const WEEKDAY = 'samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi';
  const SCOPE_ENTITY_RX = new RegExp(
    '\\b(?:quel|quelle|quels|quelles|which|what)\\s+(?:serveur|employe|produit|plat|article|categorie|jour|item|product|dish)'
    + '|(?:produit|plat|article|vente)\\s+le\\s+plus|meilleure?\\s+vente|top\\s+(?:produit|plat|vente|item)'
    + '|heure\\s+de\\s+pointe|\\bpar\\s+(?:serveur|employe|produit|article|plat|heure|categorie)|best\\s*[- ]?\\s*sell'
    /* "combien je fais le samedi" clears no intent at all, so the qualifier
     * check below (which needs a winning global intent) never fired. A
     * quantity question naming a weekday is a per-day breakdown, full stop. */
    + '|(?:combien|chhal|quel|how\\s+much)\\b[^?]{0,30}\\ble\\s+(?:' + WEEKDAY + ')\\b');
  const SCOPE_QUAL_RX = new RegExp("\\bsur\\s+(?:le|la|l'|mon|ma)\\s*[a-z؀-ۿ]|\\ble\\s+(?:" + WEEKDAY + ')\\b');
  const GLOBAL_SCENARIOS = { margin: 1, revenue: 1, profit: 1 };

  /* 5. No history. The engine holds ONE static 30-day window, so every
   *    period comparison was either answered with that window (wrong) or
   *    silently dropped. "j'ai augmenté les prix de 10% le mois dernier,
   *    ça a marché ?" was simulated as a fresh decision. `tendance` is
   *    deliberately absent — that belongs to forecast, which is forward. */
  const TREND_RX = /mois\s+dernier|mois\s+passe|semaine\s+derniere|annee\s+derniere|an\s+dernier|\bhier\b|avant[- ]?hier|par\s+rapport\s+a|\bcompare[rz]?\b|comparaison|evolution|historique|meilleur\s+mois|meilleure\s+semaine|(?:ont|a|avait)\s+(?:baiss|augment|chut|monte|progress)|si\s+j[' ]?avais|last\s+(?:month|week|year)|yesterday|\bversus\b|\bvs\b|sur\s+(?:3|6|12)\s+mois|الشهر\s*الماضي|الاسبوع\s*الماضي|\bامس\b/;

  /* 7. Darija we didn't understand. Measured, not assumed: Qwen3.5-2B was
   *    asked "chhal dayer lyoum f had lqahwa?" and answered with five invented
   *    dirham figures (133 600, 140 000, 6 400, 100 000, 20 000 MAD) wrapped in
   *    non-words, on a repeat loop. auditNumbers() does flag all five — but the
   *    same model also returns pure gibberish carrying NO number, which no
   *    numeric guard can catch. Handing a merchant invented money about their
   *    own shop is the worst thing this assistant can do, so unrecognised
   *    Darija gets an honest "rephrase" instead of the model.
   *    Markers are chosen to be low-false-positive against FR/EN: the arabizi
   *    letter-digits (3=ع 7=ح 9=ق 2=ء) plus function words with no French or
   *    English homograph — "dial" and bare "had" are deliberately excluded. */
  const DARIJA_RX = /\b[a-z]{1,6}[2379][a-z]{1,6}\b|\b(?:wach|chhal|ch7al|chnu|chno|kifach|kifash|bghit|bghina|dyal|dyali|daba|bezzaf|chwiya|mzyan|khassni|khass|hadchi|lyoum|ghadi|kayn|kayna|bach|wla|zouj|juj)\b|واش|شحال|بغيت|ديالي|ديال|دابا|كيفاش|بزاف|شنو|هادشي|غادي|خاصني/;

  /* 6. Illicit. "combien je peux sortir de la caisse sans que ça se voie"
   *    returned a full revenue + profit dump. Kiwi is also this merchant's
   *    bookkeeping system; it must not help hide takings. Note "payer moins
   *    de TVA" is NOT here — lawful optimisation is a fair question. */
  const ILLICIT_RX = /sans\s+que\s+ca\s+se\s+(?:voie|voit|remarque)|non\s+declar|ne\s+pas\s+declarer|pas\s+declarer|sous[- ]?declarer|\bau\s+noir\b|dissimul|frauder|\bfraude\b|evasion|eviter\s+(?:la\s+|le\s+|les\s+)?(?:tva|cnss|impot|taxe)|echapper\s+a\s+(?:la\s+|l[' ])?(?:tva|cnss|impot)|contourner\s+(?:la\s+)?(?:tva|cnss)|en\s+dessous\s+du\s+smig|moins\s+que\s+le\s+smig|sans\s+(?:cnss|contrat|declaration)|undeclared|off\s+the\s+books|tax\s+evasion|غير\s*مصرح|التهرب/;
  /* One-slot conversational memory: the last amount-driven scenario, so a
   * follow-up correction can refine it instead of being mis-routed. */
  let lastScenario = null;
  /* Last hire parameters, so a bare follow-up ("et si j'en prends deux")
   * refines the figure just discussed instead of resetting to the default. */
  let lastHire = { per: null, n: 1 };
  const REFINE_LEAD = /^\s*(non|nan|nope|no\b|en fait|plutot|disons|mettons|admettons|sinon|ok\b|d.?accord|et\b|et si|and\b|actually|rather|make it|let.?s say|lets say|si c.?etait|what if)/;
  /* A refinement carries a NEW parameter for the scenario just run. That used
   * to mean a digit, which missed the two commonest hiring follow-ups there
   * are: "et si j'en prends deux" (count as a word) and "et avec la CNSS ça
   * fait combien" (gross my figure up to employer cost). */
  const isRefinement = (raw, q) => (
    parseAmount(raw) != null || parsePercent(raw) != null
    || wordCount(q) != null || LOADED_RX.test(q)
  ) && REFINE_LEAD.test(q);

  const INTENTS = [
    { id: 'greet', run: () => sHelp(), sig: [
      [/bonjour|salut|coucou|hello|^hi$|^hey|مرحبا|سلام|اهلا|\bsalam\b|\bslam\b|\blabas\b|\bahlan\b|\bsbah\s*lkhir\b|لاباس|صباح الخير/, 3],
      [/qui es|who are you|من انت|que (peux|sais)|what can you|ماذا تفعل/, 3],
      [/comment ca/, 3], [/\baide\b|\bhelp\b|مساعدة/, 2],
    ] },
    { id: 'advice', run: (raw, q) => sAdvice(raw), sig: [
      [/recommand|conseil|sugg[eé]r|suggestion|astuce|\btips?\b|\badvice\b|recommend|نصيحة|نصائح|توصية|اقتراح|\bkifach\b|\bkifash\b|كيفاش|\bnasiha\b|\bnsiha\b|\btawsiya\b/, 3],
      [/(augment|boost|d[eé]velopp|am[eé]lior|grow|increase|booster).{0,18}(vente|chiffre|\bca\b|marge|business|revenue|sales)|vendre plus|gagner plus|comment.*plus/, 3],
      [/\bid[eé]es?\b|opportunit/, 2],
    ] },
    { id: 'hire', run: (raw) => sHire(raw), sig: [
      [/embauch|recrut|engag|hire|recruit|توظيف|تشغيل|استخدام|نوظف/, 3],
      [/serveur|cuisinier|barista|waiter|cook|نادل|طباخ|عامل|\bkhdam\b|\blkhdam\b|\bkhaddam\b|\b3amel\b|خدام/, 2],
      /* "j'ai besoin de quelqu'un en cuisine" is a hiring question, but only
       * `cuisinier` was listed, so `ca passe` won it for revenue instead. */
      [/salarie|nouvel employe|main d.?oeuvre|une personne en plus|staff|employee|موظف|besoin de (quelqu.un|monde|bras|renfort)|quelqu.un en (cuisine|salle)|un extra\b/, 2],
    ], boost: (q) => (WORKER_RX.test(q) && ADD_VERB.test(q)) ? 2 : 0 },
    { id: 'afford', run: (raw) => sAfford(raw), sig: [
      [/puis.?je|peux.?je|ai.?je les moyens|me permettre|abordable|can i|afford|هل يمكن|اقدر|في متناول|\bn9der\b|\bnqder\b|\bngder\b|\bwach n9der\b|نقدر/, 3],
      [/investir|acheter|invest|buy|purchase|استثمار|شراء|اشتري|\bnchri\b|\bnshri\b|\b3ndi flous\b|نشري/, 2],
      [/coute|cost of/, 1],
    ] },
    { id: 'price', run: (raw) => sPrice(raw), sig: [
      [/prix|tarif|price|pricing|سعر|اسعار|ثمن|تسعير|\btaman\b|\bthaman\b|\bataman\b|\bfataman\b|الثمن|السومة/, 3],
      [PRICE_VERB, 1],
    ], boost: (q, x) => (x.pct != null && PRICE_VERB.test(q)) ? 3 : 0 },
    { id: 'forecast', run: () => sForecast(), sig: [
      [/prevision|projection|prevoir|previs|forecast|predict|توقع|تنبؤ/, 3],
      [/fin du mois|fin d.?annee|run.?rate|tendance|end of month|trend|outlook|اخر الشهر|نهاية الشهر|اتجاه/, 2],
      [/combien.*(vais|gagner|ferai)/, 2],
    ] },
    { id: 'breakeven', run: () => sBreakEven(), sig: [
      /* "nkhrej rasi" (lit. get my head out) is how a Moroccan owner says
       * break-even; "pour pas couler" is the French equivalent. */
      [/seuil|rentab|equilibre|break.?even|point mort|breakeven|threshold|نقطة التعادل|عتبة|التعادل|nkhrej rasi|khrej rasi|نخرج راسي|pour (ne )?pas couler|sans couler|\bt?tawazon\b|\bt?tawazun\b|التوازن/, 3],
    ] },
    { id: 'margin', run: () => sMargin(), sig: [[/marge|margin|هامش|مارج/, 3]] },
    { id: 'charges', run: () => sCharges(), sig: [
      [/charge|depense|frais|opex|expense|overhead|spend|spending|تكاليف|مصاريف|نفقات|\bmasarif\b|\bmasaruf\b|\bkankhelles\b|\blkra\b|\bkanserf\w*\b|\bnserf\b|\bsraf\b|كنصرف|نصرف|الكرا|\bloyer\b|\brent\b|كراء/, 3],
      [/\bcout\b|\bcost\b|تكلفة/, 1],
    ] },
    { id: 'revenue', run: () => sRevenue(), sig: [
      [/chiffre|revenu|encaiss|vente|recette|revenue|sales|turnover|income|مداخيل|مبيعات|دخل|معاملات|\bmbi3\b|\bmbi3at\b|\bnbi3\b|\bkanbi3\b|\bdkhl\b|نبيع|مبيعاتي|\bdayer\b|\bdayra\b|\bdert\b|\bkhdmt\b/, 3],
      // "ca" = chiffre d'affaires, but skip the French pronoun "ça" (ça va / ça
      // coûte / ça nous…) so a casual sentence isn't force-fit into revenue.
      [/\bca\b(?!\s*(va|coute|fait|sera|nous|me|te|vous|donne|rapporte|ira|peut|passe|marche|suffit|craint|vaut))|رقم المعاملات/, 2],
    ] },
    { id: 'profit', run: () => sProfit(), sig: [
      [/benefice|profit|resultat|earn|bottom line|net income|make money|ربح|ارباح|صافي|نتيجة|\brbe7\b|\brbah\b|\bribh\b|\bkanrbe7\b|\bnrbe7\b|\brbe7t\b|\bkhsser\b|\bkankhsser\b|ربحت|نربح/, 3],
      [/gagne|rentre|combien je gagne/, 2],
    ] },
    { id: 'accounting', run: (raw, q) => sAccounting(q), sig: [[RX_ACCT, 3]] },
  ];

  /* Score every intent against the normalised query; return them ranked. */
  function classify(q, raw) {
    const ctx = { pct: parsePercent(raw), amt: parseAmount(raw) };
    const ranked = [];
    INTENTS.forEach((it, idx) => {
      let s = 0;
      for (const pair of it.sig) if (pair[0].test(q)) s += pair[1];
      if (it.boost) s += it.boost(q, ctx);
      if (s > 0) ranked.push({ id: it.id, idx, score: s, run: it.run });
    });
    ranked.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return ranked;
  }

  /* Pure routing decision — shared by respond() (to dispatch) and the eval
   * harness (to check), so the two can never drift. */
  function decideRoute(rawIn) {
    const raw = fixDigits(rawIn);
    const q = norm(raw);
    if (looksLikeMath(raw) && evalMath(raw) != null) return { kind: 'math', raw, q };
    /* ─── Guards, ahead of the classifier ───────────────────────────────
     * Each of these would otherwise score highly on some intent and return a
     * confident simulation of the wrong thing. They are checked here rather
     * than inside an intent because each has to beat EVERY intent, not one.
     * Order is deliberate: safety first, then explicit refusal by the
     * merchant, then "I don't have that" before anything gets computed. */
    if (ILLICIT_RX.test(q)) return { kind: 'illicit', raw, q };
    if (NEG_RX.test(q)) return { kind: 'negated', raw, q };
    const act = matchAction(q);
    if (act) return { kind: 'action', raw, q, action: act };
    if (META_RX.test(q)) return { kind: 'meta', raw, q };
    if (LAYOFF_RX.test(q)) return { kind: 'layoff', raw, q };
    if (TREND_RX.test(q)) return { kind: 'notrend', raw, q };
    if (SCOPE_ENTITY_RX.test(q)) return { kind: 'scoped', raw, q };
    const ranked = classify(q, raw);
    /* A qualifier like "sur le thé à la menthe" or "le samedi" only matters
     * when the winning intent reports a GLOBAL total — handing back the
     * whole-business margin as if it were one product's is the failure. */
    if (ranked.length && GLOBAL_SCENARIOS[ranked[0].id] && SCOPE_QUAL_RX.test(q)) {
      return { kind: 'scoped', raw, q };
    }
    const combos = ranked.filter((r) => (r.id === 'hire' || r.id === 'price') && r.score >= 3);
    if (combos.length >= 2 && CONJ_RX.test(' ' + q + ' ')) return { kind: 'compound', raw, q };
    // Conversational refinement: a correction carrying a new number right after an
    // amount-driven scenario re-runs THAT scenario ("non ça va nous coûter 3000 dh",
    // "plutôt 5000", "et à 4000 ?") — unless the message states a new strong intent.
    const strong = ranked.length && ranked[0].score >= 3;
    /* "et avec la CNSS ça fait combien" scores 3 on `accounting` (RX_ACCT owns
     * "cnss"), so the generic !strong guard below sent it to the accounting
     * blurb. Right after a hire it is unambiguously a refinement of that hire,
     * so it is allowed to win. Kept deliberately narrow — it needs the refine
     * lead AND a loaded-cost word AND hire as the last scenario. */
    if (lastScenario === 'hire' && LOADED_RX.test(q) && REFINE_LEAD.test(q)) {
      const hi = INTENTS.find((i) => i.id === 'hire');
      if (hi) return { kind: 'hire', raw, q, run: hi.run, refine: true };
    }
    if (lastScenario && !strong && isRefinement(raw, q)) {
      if (lastScenario === 'compound') return { kind: 'compound', raw, q, refine: true };
      const it = INTENTS.find((i) => i.id === lastScenario);
      if (it) return { kind: lastScenario, raw, q, run: it.run, refine: true };
    }
    if (ranked.length && ranked[0].score >= MIN_SCORE) return { kind: ranked[0].id, raw, q, run: ranked[0].run };
    if (evalMath(raw) != null) return { kind: 'math', raw, q };
    /* Nothing matched. If it reads as Darija, answering honestly beats handing
     * it to a model that invents dirham figures in this exact register. */
    if (DARIJA_RX.test(q)) return { kind: 'unclear', raw, q };
    return { kind: null, raw, q };
  }

  function respond(rawIn) {
    syncProfile();   // reason off whatever venue is active right now
    const d = decideRoute(rawIn);
    // Remember amount-driven scenarios so the next correction can refine them.
    if (d.kind === 'hire' || d.kind === 'afford' || d.kind === 'price' || d.kind === 'compound') lastScenario = d.kind;
    if (d.kind === 'math') return sCalc(d.raw, evalMath(d.raw));
    if (d.kind === 'action') return sAction(d.action);
    if (d.kind === 'compound') return sCompound(d.raw);
    if (d.kind === 'illicit') return sIllicit();
    if (d.kind === 'negated') return sNegated();
    if (d.kind === 'meta') return sMeta();
    if (d.kind === 'layoff') return sLayoff();
    if (d.kind === 'scoped') return sScoped();
    if (d.kind === 'notrend') return sNoTrend();
    if (d.kind === 'unclear') return sUnclear();
    if (d.kind === null) return null;   // unmatched → routed to the in-browser LLM
    return d.run(d.raw, d.q);
  }

  /* ─── Routing eval harness — ground-truth set across fr/en/ar incl. compound,
   * math and out-of-scope. window.KiwiAgentEval() returns accuracy + any
   * misroutes, so routing changes are regression-checkable without the LLM. ── */
  const EVAL_SET = [
    ['bonjour', 'greet'], ['hello there', 'greet'], ['مرحبا', 'greet'], ['comment ça va', 'greet'],
    ['aide-moi à calculer ma marge', 'margin'],
    ['puis-je embaucher un serveur', 'hire'], ['should I hire a cook', 'hire'], ['هل أوظف نادل', 'hire'],
    ['augmente les prix de 8%', 'price'], ['raise prices by 10%', 'price'], ['ارفع الأسعار بنسبة 5%', 'price'], ['baisse mes prix de 5%', 'price'],
    ["ai-je les moyens d'acheter un four à 80000", 'afford'], ['can I afford a 150000 machine', 'afford'],
    ['ma prévision de fin de mois', 'forecast'], ['end of month forecast', 'forecast'], ['توقع نهاية الشهر', 'forecast'],
    ['quel est mon seuil de rentabilité', 'breakeven'], ['what is my break-even point', 'breakeven'],
    ['quelle est ma marge', 'margin'], ['my net margin', 'margin'], ['ما هو هامشي', 'margin'],
    ['mes charges fixes', 'charges'], ['my monthly expenses', 'charges'],
    ["mon chiffre d'affaires", 'revenue'], ['my total sales', 'revenue'], ['مبيعاتي', 'revenue'],
    ['combien je gagne', 'profit'], ['my net profit', 'profit'],
    ['prépare ma déclaration TVA', 'accounting'], ['generate the payslips', 'accounting'], ['دفتر الأستاذ', 'accounting'],
    ['augmente les prix de 8% et embauche un serveur', 'compound'], ['raise prices 10% and hire a cook', 'compound'],
    ['ouvre le menu', 'action'], ['montre les commandes', 'action'], ['open the kitchen screen', 'action'],
    ['crée un lien de paiement', 'action'], ['افتح المخزون', 'action'], ['montre-moi les réservations', 'action'],
    ['montre ma marge', 'margin'],
    ['donne-moi des recommandations', 'advice'], ['comment augmenter mes ventes', 'advice'], ['any tips to grow my sales', 'advice'], ['نصيحة لزيادة مبيعاتي', 'advice'],
    ['2500 * 1.2', 'math'], ['(842300-261000)/842300', 'math'],
    ['quelle est la météo demain', 'llm'], ['raconte-moi une blague', 'llm'],

    /* ─── Guard regressions. Every line below returned a confident, wrong
     * answer before the guards existed; the comment is what it used to do. ── */
    // simulated the price rise the merchant just refused
    ['je ne veux pas augmenter les prix', 'negated'],
    ['je ne veux surtout pas baisser mes prix de 20%', 'negated'],
    ["je n'ai pas les moyens d'embaucher", 'negated'],          // answered "Favorable"
    ['ne me parle pas de ma marge', 'negated'],
    ["I don't want to raise prices", 'negated'],
    // challenged figure → unrelated revenue dump (matched on `chiffre`)
    ["t'es sûr de ce chiffre ?", 'meta'],
    ["d'où sort ce chiffre", 'meta'],
    ['explique-moi comment tu calcules', 'meta'],
    ['how do you calculate that', 'meta'],
    // firing → HIRING simulation, verdict "Favorable"
    ["je veux licencier 3 serveurs, combien j'économise", 'layoff'],
    ['réduire l’effectif', 'layoff'],
    // per-item/day/person → the global figure, presented as if it were theirs
    ['ma marge sur le thé à la menthe', 'scoped'],
    ['quel serveur vend le plus', 'scoped'],                     // → hire
    ['quel est mon produit le plus vendu', 'scoped'],
    ['combien je fais le samedi', 'scoped'],
    ['quelle est mon heure de pointe', 'scoped'],
    // period comparison → the one static 30-day window, or a fresh simulation
    ['compare ce mois au mois dernier', 'notrend'],
    ["j'ai augmenté les prix de 10% le mois dernier, ça a marché ?", 'notrend'],
    ['évolution de ma marge sur 6 mois', 'notrend'],
    ["combien j'ai fait hier", 'notrend'],
    ['mes ventes ont baissé de combien cette semaine', 'notrend'],
    // asked how to hide money → full revenue + profit dump
    ['combien je peux sortir de la caisse sans que ça se voie', 'illicit'],
    ['comment ne pas déclarer une partie du cash', 'illicit'],
    ['comment éviter la CNSS', 'illicit'],
    ['puis-je payer mes serveurs en dessous du SMIG', 'illicit'],
    ['comment payer moins de TVA', 'accounting'],   // lawful — must NOT be refused

    /* ─── Darija. The register Moroccan owners actually type in: 9 of these
     * 10 used to fall through to a 1,2 Go download instead of an answer. ── */
    ['chhal rbe7t had chher', 'profit'],
    ['wach kanrbe7 wla kankhsser', 'profit'],
    ['wach n9der nzid wahed lkhdam', 'hire'],
    ['3ndi flous bach nchri machine b 80000', 'afford'],
    ['chhal khassni nbi3 bach nkhrej rasi', 'breakeven'],
    ['bghit nzid fataman b 10%', 'price'],
    ['chnu hia lmarge dyali', 'margin'],
    ['kifach nzid lmbi3at dyali', 'advice'],
    ['chhal kankhelles f lkra kol chher', 'charges'],
    ['واش نقدر نزيد خدام', 'hire'],
    ['شحال خاصني نبيع باش نخرج راسي', 'breakeven'],
    ['شنو هي المارج ديالي', 'margin'],
    ['بغيت نزيد فالثمن ب ١٠ فالمية', 'price'],
    ['combien je dois vendre par jour pour pas couler', 'breakeven'],

    /* Darija we DON'T cover must never reach the model. Measured: asked
     * "chhal dayer lyoum f had lqahwa?", Qwen3.5-2B invented five dirham
     * figures about the merchant's own shop, and its gibberish answers carry
     * no number at all, so auditNumbers() cannot catch them either. */
    ['wach hadchi mzyan', 'unclear'],
    ['chnu ndir daba', 'unclear'],
    ['bghit chi haja dyal daba', 'unclear'],
    ['واش هادشي مزيان', 'unclear'],
    /* …while ordinary FR/EN must still reach it — the guard has to be precise,
     * not merely safe. "I had a great day" is the trap: `had` is a Darija
     * marker AND an English verb, which is why it is not in DARIJA_RX. */
    ['I had a great day', 'llm'],
    ['mes employés volent, je fais quoi', 'llm'],
    ['ouvrir un 2ème café', 'llm'],
  ];
  function routeLabel(s) { const d = decideRoute(s); return d.kind === null ? 'llm' : d.kind; }
  function runEval() {
    lastScenario = null;   // stateless harness — never inherit conversation context
    const fails = [];
    EVAL_SET.forEach((row) => { const got = routeLabel(row[0]); if (got !== row[1]) fails.push({ q: row[0], expected: row[1], got }); });
    const pass = EVAL_SET.length - fails.length;
    return { total: EVAL_SET.length, pass, accuracy: Math.round(pass / EVAL_SET.length * 1000) / 10, fails };
  }
  /* Conversational-refinement checks — these DO exercise the one-slot memory, so
   * they verify a follow-up correction re-runs the right scenario, that a clear
   * new intent still wins, and that a bare "ça va" no longer hits revenue. */
  function runConvoTest() {
    const cases = [];
    const check = (setup, q, expected) => { lastScenario = setup; const got = routeLabel(q); cases.push({ q, expected, got, ok: got === expected }); };
    check('hire', 'non ça va nous coûter 3000 dh par mois', 'hire');
    check('hire', 'plutôt 5000', 'hire');
    check('hire', 'et à 4000 ?', 'hire');
    check('afford', 'non plutôt 90000', 'afford');
    check('hire', "et si j'augmente les prix de 5%", 'price');  // new strong intent wins
    check('hire', 'montre mes charges', 'charges');             // no number → not a refinement
    /* The two commonest hiring follow-ups, both dead before: neither carries a
     * digit, so the old isRefinement (which required one) sent "deux" to the
     * model and "CNSS" to the accounting blurb (RX_ACCT owns that word). */
    check('hire', "et si j'en prends deux", 'hire');
    check('hire', 'et avec la CNSS ça fait combien', 'hire');
    check('price', 'non', 'llm');                               // correction without a number can't hijack
    check(null, 'ça va aujourd’hui ?', 'llm');                  // standalone "ça va" is not revenue
    lastScenario = null;
    const fails = cases.filter((c) => !c.ok);
    return { total: cases.length, pass: cases.length - fails.length, fails };
  }
  /* Unit checks for the numeric guardrail detectors (profile = ATLAS demo). */
  function runGuardTest() {
    const cases = [];
    const t = (name, ok) => cases.push({ name, ok: !!ok });
    t('extract integer MAD', JSON.stringify(extractMad('TVA à payer 38 309 MAD')) === '[38309]');
    t('extract decimal MAD', JSON.stringify(extractMad('total 1 234,50 MAD')) === '[1234.5]');
    t('extract dh suffix', extractMad('café 15 dh')[0] === 15);
    t('ignore bare percent', extractMad('marge 22,3%').length === 0);
    t('grounding figure passes', auditNumbers('votre chiffre d’affaires est 842 300 MAD').uncited.length === 0);
    t('rounded restatement passes', auditNumbers('environ 842 000 MAD').uncited.length === 0);
    t('fabricated figure flagged', auditNumbers('vous gagnez 999 000 MAD ce mois').uncited.length === 1);
    const fails = cases.filter((c) => !c.ok);
    return { total: cases.length, pass: cases.length - fails.length, fails };
  }
  /* Exposed for QA — not part of the merchant-facing surface. */
  window.KiwiAgentEval = runEval;
  window.KiwiAgentRoute = routeLabel;
  window.KiwiGuardTest = runGuardTest;
  window.KiwiAgentConvoTest = runConvoTest;

  /* ═══════════════ IN-BROWSER LLM · WebLLM ═══════════════
   * Anything the deterministic engine doesn't recognise is answered by an
   * open-source model running fully in the browser via WebGPU — no backend,
   * no API key, no data leaves the device. Opt-in download. */
  const LLM = {
    /* Qwen3.5-2B — Qwen stays the strongest small family for FR/AR (Phi is
     * English-centric, Llama/Gemma are weak on Arabic), and 3.5-2B is a
     * generation newer than the 4B it replaces at roughly HALF the download.
     * Download size is the real adoption blocker on a shop till, so a smaller
     * newer model beats a bigger older one here.
     * Thinking: Qwen3.5 dropped Qwen3's `/no_think` prompt switch. Its chat
     * template now emits a pre-closed `<think></think>` block unless the
     * caller passes enable_thinking:true — i.e. NON-thinking is the default
     * and needs no flag. Passing `/no_think` would just be dead text in the
     * system prompt. stripThink() below stays as the safety net.
     * CDN is version-pinned so model availability/behaviour can't drift. */
    model: 'Qwen3.5-2B-q4f16_1-MLC',
    sizeLabel: '≈ 1,2 Go',
    cdn: 'https://esm.run/@mlc-ai/web-llm@0.2.84',
    status: 'idle',
    engine: null,
    progress: 0,
  };

  /* Qwen can emit <think>…</think> reasoning blocks. Qwen3.5 defaults to
   * non-thinking (see LLM above), but we strip defensively so the merchant
   * never sees a stray tag — handles both a closed block, the empty
   * `<think></think>` the template itself emits, and one still mid-stream. */
  function stripThink(s) {
    return String(s)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/i, '')
      .replace(/^\s+/, '');
  }
  const llmHistory = [];

  const SP_DIR = {
    fr: 'IMPÉRATIF : rédige ta réponse entièrement en FRANÇAIS.',
    en: `CRITICAL: the notes below are written in French, but you MUST write your entire reply in ENGLISH, the language of the user's question. Do not reply in French.`,
    ar: 'إلزامي: الملاحظات أدناه مكتوبة بالفرنسية، لكن يجب أن تكتب ردّك بالكامل بالعربية، لغة سؤال المستخدم. لا تُجب بالفرنسية.',
  };

  /* Real menu of the active venue (via window.KiwiMenu, exposed by venues.js)
   * — so the model answers menu questions from data instead of inventing
   * dishes. Sorted best-seller first. */
  function menuContextLines() {
    const items = (window.KiwiMenu && window.KiwiMenu.items && window.KiwiMenu.items()) || [];
    if (!items.length) return null;
    return items.slice().sort((a, b) => b.units - a.units).map(
      (it) => `  · ${it.name}, ${fmt(it.units)} vendus/mois · prix ${fmt(it.price)} MAD · marge unitaire ${fmt(it.price - it.cost)} MAD`
    ).join('\n');
  }

  /* Today's live activity — same sources the dashboard's KPI tiles and live
   * feed use (KiwiDemoClock for hour-by-hour aggregates, the row cache for
   * the last few enriched orders). Lets the agent answer "what's been sold
   * today?", "who's the busiest server right now?", "which table just paid?",
   * etc. without inventing data. Returns null when there's nothing yet. */
  function liveActivityContextLines() {
    const sim = window.KiwiDemoClock && window.KiwiDemoClock.getSimState && window.KiwiDemoClock.getSimState();
    const cache = window.__kiwiFeedOrders || {};
    const orders = Object.keys(cache).sort().map(k => cache[k]).filter(Boolean);
    if (!sim || (!sim.cumTx && !orders.length)) return null;

    const lines = [];
    /* Aggregates straight from the simulator — the merchant sees these at the
     * top of the dashboard, so the agent must match them exactly. */
    lines.push(
      `  · Heure de service simulée : ~${sim.simHourLabel || '—'}`,
      `  · Commandes encaissées depuis ce matin : ${fmt(sim.cumTx || 0)}`,
      `  · CA réalisé depuis ce matin : ${fmt(sim.cumRevenue || 0)} MAD`,
      `  · Panier moyen aujourd'hui : ${fmt(sim.panierMoyen || 0)} MAD`,
      `  · Clients réguliers identifiés : ${fmt(sim.cumRegulars || 0)}`
    );

    if (orders.length) {
      /* Compact per-order line: time · customer/table · server · payment ·
       * total · 1–2 items. Keeps the prompt readable even with 10 orders. */
      const fmt2 = (n) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const recent = orders.slice(0, 8).map(o => {
        const items = (o.items || []).slice(0, 2).map(it => `×${it.qty} ${it.name}`).join(', ');
        const more = (o.items || []).length > 2 ? ` (+${o.items.length - 2})` : '';
        const table = o.table != null ? `T${o.table}` : '—';
        const covers = o.covers ? ` · ${o.covers} couvert${o.covers > 1 ? 's' : ''}` : '';
        const server = o.server ? ` · servi par ${o.server}` : '';
        const total = (o.total || o.amt) ? `${o.total || o.amt} MAD` : '—';
        return `  · ${o.t || '—'} · ${o.customer || '—'} · ${table}${covers}${server} · ${o.primary || '—'} · ${total}${items ? `, ${items}${more}` : ''}`;
      });
      lines.push('', `  Les ${recent.length} dernières commandes encaissées (la plus récente d'abord) :`);
      lines.push(...recent);

      /* Servers actually seen on shift today, with their ticket count — lets
       * the model answer staffing questions from observed work, not the
       * static employee list. */
      const seenServers = {};
      orders.forEach(o => { if (o.server) seenServers[o.server] = (seenServers[o.server] || 0) + 1; });
      const servers = Object.keys(seenServers).sort((a, b) => seenServers[b] - seenServers[a]);
      if (servers.length) {
        lines.push('', `  Serveurs en service maintenant : ${servers.map(s => `${s} (${seenServers[s]} ticket${seenServers[s] > 1 ? 's' : ''})`).join(', ')}.`);
      }
    }
    return lines.join('\n');
  }

  /* ─────────────── NUMERIC GUARDRAIL ───────────────
   * The model may phrase a MAD figure that isn't a verbatim restatement of the
   * grounding — sometimes a fair derivation, sometimes a slip. We can't ban
   * derivations, so rather than alter the answer we detect uncited material
   * amounts and append a calm "verify in your dashboard" nudge. Detectors are
   * pure and unit-tested via window.KiwiGuardTest(). */
  const GUARD = {
    fr: 'Chiffres dérivés de vos données, vérifiez les montants exacts dans votre tableau de bord.',
    en: 'Figures derived from your data, verify the exact amounts in your dashboard.',
    ar: 'أرقام مُشتقّة من بياناتك، تحقّق من المبالغ الدقيقة في لوحة التحكم.',
  };
  /* Every MAD-denominated amount in a block of text. */
  function extractMad(text) {
    const out = [];
    const re = /(\d[\d  .  ]*(?:,\d+)?)\s*(?:mad|dhs?|dirhams?|درهم|د\.?\s?م)\b/gi;
    for (const m of String(text).matchAll(re)) {
      const n = parseFloat(m[1].replace(/[  .  ]/g, '').replace(',', '.'));
      if (isFinite(n)) out.push(n);
    }
    return out;
  }
  /* The figures the answer may state — built from the same grounding the system
   * prompt carries (financials, opex, menu prices, live orders, sim revenue). */
  function knownFigures() {
    const s = new Set();
    const add = (n) => { if (typeof n === 'number' && isFinite(n)) s.add(Math.round(n)); };
    if (!B.partial) {
      [B.revenue, B.cogs, B.grossProfit, B.totalOpex, B.netProfit, B.cashBuffer, B.avgBasket,
       B.dailyRev, B.dailyNet, B.netPerOrder, B.breakEvenRev, B.mtdRevenue,
       B.revenue * 12, B.netProfit * 12].forEach(add);
      Object.values(B.opex || {}).forEach(add);
    } else {
      [B.revenue, B.avgBasket].forEach(add);
    }
    (window.KiwiVenue && window.KiwiVenue.getMenuItems ? window.KiwiVenue.getMenuItems() : []).forEach((it) => add(it.price));
    Object.values(window.__kiwiFeedOrders || {}).forEach((o) => add(o.amtRaw != null ? o.amtRaw
      : parseFloat(String(o.total || o.amt || '').replace(/[  .  ]/g, '').replace(',', '.'))));
    const sim = window.KiwiDemoClock && window.KiwiDemoClock.getSimState && window.KiwiDemoClock.getSimState();
    if (sim) add(sim.cumRevenue);
    return s;
  }
  /* Material MAD amounts not within tolerance of any known figure → the
   * merchant should verify them. Tolerance lets a rounded restatement pass. */
  function auditNumbers(text) {
    const known = Array.from(knownFigures());
    const uncited = [];
    for (const v of extractMad(text)) {
      if (v < 100) continue;
      const cited = known.some((k) => Math.abs(k - v) <= Math.max(50, v * 0.01));
      if (!cited) uncited.push(v);
    }
    return { uncited };
  }

  /* The deterministic engine refuses these outright (ILLICIT_RX), but anything
   * it doesn't recognise reaches the model instead — and the prompt used to
   * forbid stock tips and off-topic chat while saying nothing about helping a
   * merchant hide takings. Kiwi keeps this merchant's books; it cannot be the
   * thing that helps them cook them. */
  const INTEGRITY_RULE = `- Tu n'aides JAMAIS à dissimuler des recettes, à sous-déclarer la TVA ou le chiffre d'affaires, à contourner la CNSS, à employer sans contrat ou à payer sous le SMIG. Si on te le demande, refuse en une phrase, sans jugement, et propose une piste légale de réduction des coûts. L'optimisation fiscale légale, elle, reste une question légitime.`;

  function buildSystemPrompt(lang) {
    const dir = SP_DIR[lang] || SP_DIR.fr;
    if (B.partial) {
      return [
        dir, '',
        `Tu es l'assistant financier de "${B.name}", un établissement qui vient de démarrer sur Kiwi, au Maroc.`,
        B.revenue > 0
          ? `Seules données réelles disponibles : ${fmt(B.revenue)} MAD de ventes sur ${fmt(B.ordersPerMonth)} vente(s), panier moyen ${fmt(B.avgBasket)} MAD.`
          : `Aucune vente n'a encore été enregistrée pour cet établissement.`,
        `Tu n'as PAS sa structure de coûts (loyer, salaires, coût matière, marge, trésorerie, effectif) ni le détail de sa carte.`,
        '',
        'Règles :',
        `- N'invente JAMAIS un chiffre, un plat ou une statistique. Si on te demande une marge, un bénéfice, un seuil de rentabilité, des charges, ou les articles du menu, explique que le commerçant doit d'abord renseigner ces données dans Kiwi, ne donne ni nombre ni liste inventée.`,
        `- Tu peux donner des conseils de gestion généraux et qualitatifs, sans chiffrer ce que tu ne connais pas.`,
        `- Tu n'as pas accès à Internet ni à des données en temps réel.`,
        `- Ne donne jamais de conseil d'investissement boursier. Ne réponds pas aux questions sans lien avec l'activité.`,
        INTEGRITY_RULE,
        '',
        dir,
      ].join('\n');
    }
    const o = B.opex;
    const menu = menuContextLines();
    const live = liveActivityContextLines();
    const lines = [
      dir, '',
      `Tu es l'assistant financier de "Café Atlas · Maarif", un café-restaurant à Casablanca, au Maroc.`,
      'Tu conseilles son propriétaire, Rachid. Voici ses chiffres réels sur les 30 derniers jours (en dirhams marocains, MAD) :',
      `- Chiffre d'affaires : ${fmt(B.revenue)} MAD`,
      `- Coût matière : ${fmt(B.cogs)} MAD (${fmt1(100 - B.grossMargin)} % du CA)`,
      `- Marge brute : ${fmt(B.grossProfit)} MAD (${fmt1(B.grossMargin)} %)`,
      `- Charges fixes : ${fmt(B.totalOpex)} MAD, dont masse salariale ${fmt(o.salaries)}, loyer ${fmt(o.rent)}, énergie ${fmt(o.utilities)}.`,
      `- Bénéfice net : ${fmt(B.netProfit)} MAD (marge nette ${fmt1(B.netMargin)} %)`,
      `- Trésorerie disponible : ${fmt(B.cashBuffer)} MAD`,
      `- Panier moyen : ${fmt(B.avgBasket)} MAD · ${fmt(B.ordersPerMonth)} ventes/mois · ${B.staffCount} employés.`,
    ];
    if (live) {
      lines.push(
        '',
        `Activité en direct, ce que la caisse a enregistré depuis l'ouverture aujourd'hui. Pour toute question sur la journée en cours, les commandes du moment, les serveurs ou les tables, appuie-toi UNIQUEMENT sur ce bloc, ce sont les seules données fraîches dont tu disposes :`,
        live
      );
    }
    if (menu) {
      lines.push(
        '',
        `Sa carte réelle, chaque article avec ses ventes du mois, son prix et sa marge unitaire. Pour TOUTE question sur le menu, les plats, les meilleures ou les moins bonnes ventes, appuie-toi UNIQUEMENT sur cette liste, n'invente jamais un plat qui n'y figure pas :`,
        menu
      );
    } else {
      lines.push('', `Tu n'as pas le détail de sa carte : pour une question sur les plats, invite-le à ouvrir la page Menu, ne cite aucun plat de mémoire.`);
    }
    lines.push(
      '',
      'Règles :',
      `- Sois concis, concret et chiffré quand c'est utile.`,
      `- Tu peux parler de tout ce qui touche la gestion du café : finances, RH, marketing, opérations, fournisseurs, stratégie, menu.`,
      `- N'invente JAMAIS un chiffre, un plat ou une statistique : appuie-toi uniquement sur les données ci-dessus. Si une information manque, dis-le simplement.`,
      `- Tu NE réponds PAS aux questions sans lien avec l'activité (sport, célébrités, actualité). Décline poliment en une phrase.`,
      `- Tu n'as pas accès à Internet ni à des données en temps réel ; ne donne jamais de conseil d'investissement boursier.`,
      INTEGRITY_RULE,
      '',
      dir
    );
    return lines.join('\n');
  }

  /* ═══════════════ UI ═══════════════ */

  const ICON = {
    avatar: '<img class="fa-avatar-ico" src="assets/landing/icons/merchant.png" alt="" width="17" height="17" decoding="async"/>',
    keypad: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="3"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h4"/></svg>',
    send: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  };

  /* one-time CSS */
  function injectCss() {
    if (document.getElementById('fa-css')) return;
    const s = document.createElement('style');
    s.id = 'fa-css';
    s.textContent = `
    /* ─── Financial assistant · interface ─────────────────────────────── */
    .fa-drawer .kiwi-drawer { display:flex; flex-direction:column; }
    .fa-drawer .kiwi-drawer-body { flex:1; min-height:0; padding:0 !important; display:flex; }
    .fa-drawer .kiwi-drawer-head { background:var(--paper); }
    .fa-drawer .kiwi-drawer-head h3 { font-family:'Instrument Serif',serif; font-weight:400;
      font-size:28px; letter-spacing:0; }
    .fa-drawer .kiwi-drawer-head p { color:var(--n-500); font-size:12.5px; }

    .fa { display:flex; width:100%; height:100%; background:var(--paper);
      --fa-ease:var(--ease-glide,cubic-bezier(.16,1,.30,1)); }
    .fa-main { flex:1; display:flex; flex-direction:column; min-width:0; }

    /* thread */
    .fa-thread { flex:1; overflow-y:auto; padding:34px clamp(20px,8%,120px) 26px; }
    .fa-thread::-webkit-scrollbar { width:8px; }
    .fa-thread::-webkit-scrollbar-thumb { background:var(--n-200); border-radius:8px; }
    .fa-thread-in { max-width:730px; margin:0 auto; display:flex; flex-direction:column; gap:28px; }
    .fa-msg { display:flex; gap:14px; animation:fa-rise 560ms var(--fa-ease) both; }
    .fa-msg.user { justify-content:flex-end; }
    @keyframes fa-rise { from{ opacity:0; transform:translateY(14px); } to{ opacity:1; transform:none; } }

    .fa-avatar { width:30px; height:30px; border-radius:50%; flex-shrink:0; margin-top:1px;
      display:flex; align-items:center; justify-content:center;
      background:linear-gradient(150deg,var(--atlas),var(--riad)); color:var(--mint);
      box-shadow:0 3px 10px -3px rgba(11,110,79,.55); }
    .fa-avatar-ico { width:17px; height:17px;
      filter:brightness(0) saturate(100%) invert(85%) sepia(31%) saturate(469%)
        hue-rotate(70deg) brightness(102%) contrast(91%); }

    /* agent message — text flows on paper, no box */
    .fa-msg.agent .fa-bubble { flex:1; min-width:0; max-width:632px; padding-top:3px;
      font-size:14px; line-height:1.62; color:var(--ink); }
    /* user message — soft white card */
    .fa-msg.user .fa-bubble { max-width:78%; background:#fff; border:1px solid var(--n-200);
      border-radius:18px 18px 6px 18px; padding:11px 16px; font-size:13.5px; line-height:1.55;
      color:var(--ink); box-shadow:0 4px 16px -10px rgba(10,15,13,.22); }
    [dir="rtl"] .fa-msg.user .fa-bubble { border-radius:18px 18px 18px 6px; }
    .fa-bubble b { font-weight:600; color:var(--riad); }
    .fa-bubble i { color:var(--n-500); font-style:italic; }

    /* stat cards */
    .fa-stats { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
    .fa-stat { background:#fff; border:1px solid var(--n-200); border-radius:14px; padding:12px 14px;
      transition:border-color 150ms; }
    .fa-stat:hover { border-color:var(--n-300); }
    .fa-stat .l { font-size:9.5px; letter-spacing:.085em; text-transform:uppercase; color:var(--n-500); font-weight:600; }
    .fa-stat .v { font-size:18.5px; font-weight:600; margin-top:5px; color:var(--ink);
      font-variant-numeric:tabular-nums; letter-spacing:-.012em; }
    .fa-stat .h { font-size:10.5px; color:var(--n-500); margin-top:3px; line-height:1.4; }

    /* verdict */
    .fa-verdict { margin-top:14px; padding:12px 14px; border-radius:13px; font-size:12.5px;
      font-weight:500; line-height:1.5; }
    .fa-verdict.good { background:rgba(11,110,79,.08); color:var(--atlas); }
    .fa-verdict.warn { background:rgba(176,124,0,.11); color:#8a6200; }
    .fa-verdict.bad  { background:rgba(193,58,48,.10); color:#b3392f; }
    .fa-note { margin-top:11px; font-size:11.5px; color:var(--n-500); font-style:italic; line-height:1.5; }

    /* suggestion chips */
    .fa-follow { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
    .fa-follow button { font-size:12px; font-weight:450; padding:8px 14px; border-radius:999px;
      border:1px solid var(--n-200); background:#fff; color:var(--ink); cursor:pointer;
      transition:transform 160ms var(--fa-ease), border-color 160ms, color 160ms, box-shadow 160ms; }
    .fa-follow button:hover { border-color:var(--atlas); color:var(--atlas); transform:translateY(-1px);
      box-shadow:0 8px 18px -12px rgba(11,110,79,.55); }

    /* typing */
    .fa-typing { display:flex; gap:4px; padding:6px 2px; }
    .fa-typing i { width:6px; height:6px; border-radius:50%; background:var(--n-400); animation:fa-bounce 1.1s infinite; }
    .fa-typing i:nth-child(2){ animation-delay:.15s; } .fa-typing i:nth-child(3){ animation-delay:.3s; }
    @keyframes fa-bounce { 0%,60%,100%{ transform:translateY(0); opacity:.4; } 30%{ transform:translateY(-5px); opacity:1; } }

    /* dock */
    .fa-dock { border-top:1px solid var(--n-200); background:var(--paper);
      padding:15px clamp(20px,8%,120px) 19px; }
    .fa-dock-in { max-width:730px; margin:0 auto; }
    .fa-inputwrap { display:flex; align-items:flex-end; gap:8px; background:#fff;
      border:1px solid var(--n-300); border-radius:21px; padding:6px; padding-inline-start:18px;
      box-shadow:0 8px 26px -16px rgba(10,15,13,.26); transition:border-color 170ms, box-shadow 170ms; }
    .fa-inputwrap:focus-within { border-color:var(--atlas); box-shadow:0 10px 30px -16px rgba(11,110,79,.4); }
    .fa-input { flex:1; resize:none; border:none; outline:none; background:transparent; font:inherit;
      font-size:14px; line-height:1.5; padding:10px 0; max-height:144px; color:var(--ink); }
    .fa-input::placeholder { color:var(--n-400); }
    .fa-send { width:39px; height:39px; border-radius:50%; border:none; flex-shrink:0; cursor:pointer;
      background:var(--atlas); color:#fff; display:flex; align-items:center; justify-content:center;
      transition:transform 150ms var(--fa-ease), background 150ms; }
    .fa-send:hover { background:var(--riad); transform:scale(1.06); }
    .fa-send:active { transform:scale(.93); }
    [dir="rtl"] .fa-send svg { transform:scaleX(-1); }
    .fa-toolbar { display:flex; align-items:center; justify-content:space-between; margin-top:11px; padding:0 4px; }
    .fa-tool { display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:500;
      color:var(--n-600); background:#fff; border:1px solid var(--n-200); border-radius:999px;
      padding:7px 14px; cursor:pointer; transition:all 150ms var(--fa-ease); }
    .fa-tool:hover { border-color:var(--n-400); color:var(--ink); transform:translateY(-1px); }
    .fa-tool.on { background:var(--atlas); border-color:var(--atlas); color:#fff; }
    .fa-tool svg { width:14px; height:14px; }
    .fa-hint { font-size:11px; color:var(--n-400); }

    /* calculator — hidden until toggled */
    .fa-keypad { display:none; }
    .fa-keypad.open { display:block; animation:fa-kp-in 300ms var(--ease-out,cubic-bezier(.32,.72,0,1)) both; }
    @keyframes fa-kp-in { from{ opacity:0; transform:translateY(18px); } to{ opacity:1; transform:none; } }
    .fa-keypad-card { background:#fff; border:1px solid var(--n-200); border-radius:22px; padding:14px;
      margin-bottom:14px; box-shadow:0 18px 44px -26px rgba(10,15,13,.35); }
    .fa-kpdisplay { background:var(--ink); color:#fff; border-radius:14px; padding:16px 18px;
      text-align:right; direction:ltr;
      font-family:var(--mono); font-size:25px; letter-spacing:.02em; overflow:hidden; white-space:nowrap; }
    .fa-kpgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:11px; direction:ltr; }
    .fa-kpgrid button { padding:15px 0; border-radius:14px; border:1px solid var(--n-200);
      background:var(--paper-soft); font-size:16px; font-family:var(--mono); color:var(--ink);
      cursor:pointer; transition:transform 90ms, background 130ms; }
    .fa-kpgrid button:hover { background:var(--n-100); }
    .fa-kpgrid button:active { transform:scale(.94); }
    .fa-kpgrid button.op { color:var(--atlas); font-weight:600; }
    .fa-kpgrid button.eq { background:var(--atlas); color:#fff; border-color:var(--atlas);
      grid-column:span 2; font-weight:600; }
    .fa-kpgrid button.eq:hover { background:var(--riad); }
    .fa-kp-use { display:block; margin-top:10px; width:100%; padding:11px 12px;
      border-radius:13px; border:0; background:var(--atlas); color:#fff;
      font:inherit; font-size:12.5px; font-weight:600; cursor:pointer;
      transition:background 130ms, transform 90ms; }
    .fa-kp-use[hidden] { display:none; }
    .fa-kp-use:hover { background:var(--riad); }
    .fa-kp-use:active { transform:scale(.97); }

    /* context rail */
    .fa-context { width:312px; flex-shrink:0; border-inline-start:1px solid var(--n-200);
      background:var(--paper); padding:28px 22px; overflow-y:auto; }
    .fa-ctx-eyebrow { font-size:10px; font-weight:600; letter-spacing:.15em; text-transform:uppercase; color:var(--n-500); }
    .fa-ctx-biz { font-size:14.5px; font-weight:600; color:var(--ink); margin-top:5px; line-height:1.2; }
    .fa-ctx-sub { font-size:11px; color:var(--n-500); margin-top:3px; }
    .fa-ctx-group { margin-top:6px; }
    .fa-ctx-gh { display:flex; justify-content:space-between; align-items:baseline; gap:8px;
      font-size:10px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--n-500);
      margin:18px 0 5px; padding:0 10px; }
    .fa-ctx-gh .tot { color:var(--atlas); letter-spacing:.02em; }
    .fa-ctx-item { display:flex; justify-content:space-between; align-items:baseline; gap:12px; width:100%;
      padding:9px 10px; border:none; background:transparent; border-radius:10px; cursor:pointer;
      text-align:start; font:inherit; transition:background 130ms var(--fa-ease); }
    .fa-ctx-item:hover { background:var(--paper-soft); }
    .fa-ctx-item .k { font-size:12px; color:var(--n-600); }
    .fa-ctx-item .v { font-size:12.5px; font-weight:600; color:var(--ink);
      font-variant-numeric:tabular-nums; text-align:end; white-space:nowrap; }
    .fa-ctx-item.fa-flash { animation:fa-flash-kf 540ms var(--fa-ease); }
    @keyframes fa-flash-kf { 0%{ background:rgba(11,110,79,.20); } 100%{ background:transparent; } }
    .fa-ctx-net { margin-top:18px; padding:16px 17px; border-radius:17px; color:#fff; width:100%;
      text-align:start; border:none; cursor:pointer;
      background:linear-gradient(145deg,var(--atlas),var(--riad)); box-shadow:0 16px 34px -20px rgba(11,110,79,.65);
      transition:transform 160ms var(--fa-ease); }
    .fa-ctx-net:hover { transform:translateY(-2px); }
    .fa-ctx-net.fa-flash { animation:fa-flash-net 540ms ease; }
    @keyframes fa-flash-net { 0%{ filter:brightness(1.4); } 100%{ filter:brightness(1); } }
    .fa-ctx-net .k { font-size:10px; letter-spacing:.1em; text-transform:uppercase; opacity:.82; }
    .fa-ctx-net .v { font-size:23px; font-weight:600; margin-top:6px; font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
    .fa-ctx-net .s { font-size:11.5px; opacity:.82; margin-top:2px; }
    .fa-ctx-note { margin-top:20px; font-size:11.5px; color:var(--n-500); line-height:1.55; }
    .fa-ctx-trust { margin-top:13px; display:flex; gap:7px; align-items:flex-start; font-size:11px; color:var(--n-500); line-height:1.45; }
    .fa-ctx-trust svg { width:13px; height:13px; color:var(--atlas); flex-shrink:0; margin-top:1px; }
    @media (max-width:920px) { .fa-context { display:none; } }

    /* ─── empty-state hero — the first screen, before any conversation ─── */
    .fa-hero { display:flex; flex-direction:column; }
    .fa-hero-mark { width:46px; height:46px; border-radius:50%; display:flex; align-items:center;
      justify-content:center; background:linear-gradient(150deg,var(--atlas),var(--riad)); color:var(--mint);
      box-shadow:0 8px 22px -8px rgba(11,110,79,.6); }
    .fa-hero-mark svg { width:21px; height:21px; }
    .fa-hero-h { font-family:'Instrument Serif',serif; font-size:31px; color:var(--ink); margin:17px 0 0; line-height:1.08; }
    .fa-hero-p { font-size:14px; color:var(--n-600); line-height:1.62; margin-top:9px; max-width:540px; }
    .fa-hero-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:11px; margin-top:24px; }
    .fa-hero-card { display:flex; flex-direction:column; align-items:flex-start; text-align:start;
      background:#fff; border:1px solid var(--n-200); border-radius:16px; padding:15px 14px; cursor:pointer;
      font:inherit; transition:transform 160ms var(--fa-ease), border-color 160ms, box-shadow 160ms;
      box-shadow:0 1px 2px rgba(10,15,13,.04), 0 18px 32px -26px rgba(10,15,13,.24); }
    .fa-hero-card:hover { border-color:var(--atlas); transform:translateY(-2px);
      box-shadow:0 16px 30px -18px rgba(11,110,79,.42); }
    .fa-hero-card:active { transform:scale(.98); }
    .fa-hero-card .ic { width:32px; height:32px; border-radius:10px; display:flex; align-items:center;
      justify-content:center; background:var(--paper-soft); color:var(--atlas); margin-bottom:12px; }
    .fa-hero-card .ic svg { width:17px; height:17px; }
    .fa-hero-card .t { font-size:13px; font-weight:600; color:var(--ink); }
    .fa-hero-card .s { font-size:11.5px; color:var(--n-500); margin-top:3px; line-height:1.4; }
    .fa-hero-insight { display:flex; gap:11px; align-items:flex-start; margin-top:13px;
      padding:14px 16px; border-radius:15px; background:var(--paper-soft); border:1px solid var(--n-200);
      font-size:12.5px; color:var(--n-600); line-height:1.55; }
    .fa-hero-insight svg { width:16px; height:16px; color:var(--atlas); flex-shrink:0; margin-top:1px; }
    .fa-hero-insight b { color:var(--atlas); font-weight:600; }
    @media (max-width:560px) { .fa-hero-cards { grid-template-columns:1fr; } }

    /* ─── curated context rail — 4 KPIs, a cost split, the rest folded away ─── */
    .fa-ctx-kpis { margin-top:20px; }
    .fa-ctx-kpi { display:flex; justify-content:space-between; align-items:baseline; gap:12px; width:100%;
      border:0; background:transparent; padding:12px 8px; border-radius:11px; cursor:pointer;
      text-align:start; font:inherit; transition:background 130ms var(--fa-ease); }
    .fa-ctx-kpi + .fa-ctx-kpi { border-top:1px solid var(--n-200); }
    .fa-ctx-kpi:hover { background:var(--paper-soft); }
    .fa-ctx-kpi.fa-flash { animation:fa-flash-kf 540ms var(--fa-ease); }
    .fa-ctx-kpi .k { font-size:11.5px; color:var(--n-600); }
    .fa-ctx-kpi .v { font-size:15px; font-weight:600; color:var(--ink); white-space:nowrap; text-align:end;
      font-variant-numeric:tabular-nums; }
    .fa-ctx-kpi.hl .v { color:var(--atlas); }
    .fa-ctx-viz { margin-top:20px; padding-top:18px; border-top:1px solid var(--n-200); }
    .fa-ctx-viz-h { display:flex; justify-content:space-between; align-items:baseline;
      font-size:10px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--n-500); }
    .fa-ctx-viz-h .t { color:var(--atlas); letter-spacing:.02em; }
    .fa-ctx-bar { display:flex; height:10px; border-radius:999px; overflow:hidden; margin-top:10px; gap:2px; }
    .fa-ctx-bar span { display:block; height:100%; }
    .fa-ctx-leg { display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:11px; }
    .fa-ctx-leg .li { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--n-600); }
    .fa-ctx-leg .li i { width:8px; height:8px; border-radius:3px; flex-shrink:0; }
    .fa-ctx-more { width:100%; margin-top:18px; font:inherit; font-size:12px; font-weight:500;
      color:var(--n-600); background:transparent; border:1px solid var(--n-200); border-radius:11px;
      padding:10px; cursor:pointer; transition:all 140ms; }
    .fa-ctx-more:hover { border-color:var(--n-400); color:var(--ink); }
    .fa-ctx-detail[hidden] { display:none; }

    /* in-browser LLM */
    .fa-llm-btn { font-size:13px; font-weight:600; padding:11px 19px; border-radius:999px; border:none;
      background:var(--atlas); color:#fff; cursor:pointer; transition:transform 150ms var(--fa-ease), background 150ms;
      box-shadow:0 10px 24px -12px rgba(11,110,79,.6); }
    .fa-llm-btn:hover { background:var(--riad); transform:translateY(-1px); }
    .fa-llm-prog { height:8px; border-radius:999px; background:var(--n-200); overflow:hidden; margin:13px 0 8px; }
    .fa-llm-bar { height:100%; width:0%; border-radius:999px;
      background:linear-gradient(90deg,var(--atlas),var(--mint)); transition:width 240ms ease; }
    .fa-llm-ptxt { font-size:11.5px; color:var(--n-500); }
    [data-fa-stream] { white-space:pre-wrap; }

    /* ─── Dark theme · flat, contour-free, off-white (ChatGPT-style) ──────
     * In dark mode the assistant drops every light card, border and bright
     * accent — surfaces sit on the flat --paper tones, text is off-white,
     * nothing is outlined. */
    html[data-theme="dark"] .fa-msg.user .fa-bubble {
      background:var(--paper-soft); border:none; box-shadow:none; }
    html[data-theme="dark"] .fa-bubble b { color:var(--ink); }
    html[data-theme="dark"] .fa-avatar { background:var(--paper-muted); box-shadow:none; }
    html[data-theme="dark"] .fa-avatar-ico { filter:brightness(0) invert(0.92); }
    html[data-theme="dark"] .fa-stat,
    html[data-theme="dark"] .fa-stat:hover { background:var(--paper-soft); border:none; }
    html[data-theme="dark"] .fa-follow button {
      background:var(--paper-soft); border:none; color:var(--ink); box-shadow:none; }
    html[data-theme="dark"] .fa-follow button:hover { background:var(--paper-muted); color:var(--ink); }
    html[data-theme="dark"] .fa-dock { border-top:none; }
    html[data-theme="dark"] .fa-inputwrap { background:var(--paper-soft); border:none; box-shadow:none; }
    html[data-theme="dark"] .fa-inputwrap:focus-within {
      background:var(--paper-muted); border:none; box-shadow:none; }
    html[data-theme="dark"] .fa-send { background:var(--ink); color:var(--paper); }
    html[data-theme="dark"] .fa-send:hover { background:var(--n-700); }
    html[data-theme="dark"] .fa-tool { background:var(--paper-soft); border:none; color:var(--ink); }
    html[data-theme="dark"] .fa-tool:hover,
    html[data-theme="dark"] .fa-tool.on { background:var(--paper-muted); border:none; color:var(--ink); }
    html[data-theme="dark"] .fa-keypad-card { background:var(--paper-soft); border:none; box-shadow:none; }
    html[data-theme="dark"] .fa-kpdisplay { background:var(--paper-muted); color:var(--ink); }
    html[data-theme="dark"] .fa-kpgrid button { background:var(--paper-muted); border:none; }
    html[data-theme="dark"] .fa-kpgrid button.op { color:var(--ink); }
    html[data-theme="dark"] .fa-kpgrid button.eq { background:var(--n-200); border:none; color:var(--ink); }
    html[data-theme="dark"] .fa-context { background:var(--paper-soft); border-inline-start:none; }
    html[data-theme="dark"] .fa-ctx-eyebrow { color:var(--n-500); }
    html[data-theme="dark"] .fa-ctx-gh .tot { color:var(--ink); }
    html[data-theme="dark"] .fa-ctx-item:hover { background:var(--paper-muted); }
    html[data-theme="dark"] .fa-ctx-net {
      background:var(--paper-muted); border:none; box-shadow:none; color:var(--ink); }
    html[data-theme="dark"] .fa-ctx-trust svg { color:var(--n-500); }
    html[data-theme="dark"] .fa-llm-btn {
      background:var(--paper-muted); color:var(--ink); box-shadow:none; }
    html[data-theme="dark"] .fa-llm-btn:hover { background:var(--n-200); }
    html[data-theme="dark"] .fa-drawer :focus-visible { outline-color:var(--n-500); }
    `;
    document.head.appendChild(s);
  }

  /* render an agent reply object → HTML string */
  function replyHtml(r) {
    let h = `<div>${r.text}</div>`;
    if (r.stats && r.stats.length) {
      h += '<div class="fa-stats">' + r.stats.map((s) =>
        `<div class="fa-stat"><div class="l">${s.l}</div><div class="v">${s.v}</div>${s.h ? `<div class="h">${s.h}</div>` : ''}</div>`
      ).join('') + '</div>';
    }
    if (r.verdict) h += `<div class="fa-verdict ${r.verdict.tone}">${r.verdict.text}</div>`;
    if (r.note) h += `<div class="fa-note">${r.note}</div>`;
    if (r.follow && r.follow.length) {
      h += '<div class="fa-follow">' + r.follow.map((f) =>
        `<button data-fa-follow="${escAttr(f)}">${f}</button>`).join('') + '</div>';
    }
    if (r.open && r.open.length) {
      h += '<div class="fa-follow">' + r.open.map((o) =>
        `<button class="fa-llm-btn" data-fa-open="${escAttr(o.handler)}">${o.label}</button>`).join('') + '</div>';
    }
    return h;
  }

  function open(prefill) {
    if (!window.Kiwi || !window.Kiwi.drawer) return;
    L = getLang();
    injectCss();
    syncProfile();   // build the profile for whatever venue is active
    const u = tr().ui;

    // Every fact the agent knows — grouped, each row click-to-insert.
    const ctxItem = (k, v) =>
      `<button class="fa-ctx-item" type="button" data-fa-fact="${escAttr(`${k} : ${v}`)}"><span class="k">${k}</span><span class="v">${v}</span></button>`;
    const ctxGroup = (title, items, total) =>
      `<div class="fa-ctx-group"><div class="fa-ctx-gh"><span>${title}</span>${total ? `<span class="tot">${total}</span>` : ''}</div>${items.map(([k, v]) => ctxItem(k, v)).join('')}</div>`;
    /* The context rail — full financial panel for Café Atlas, or a clean
     * "new venue" panel (real recorded sales only) for a custom venue. */
    let asideHtml;
    if (B.partial) {
      const p = nv();
      const rows = B.revenue > 0
        ? [[p.revLabel, fmtMad(B.revenue)], [p.ordLabel, fmt(B.ordersPerMonth)], [p.basketLabel, fmtMad(B.avgBasket)]]
        : [];
      asideHtml =
        `<div class="fa-ctx-eyebrow">${u.ctxEyebrow}</div>` +
        `<div class="fa-ctx-biz">${escHtml(B.name)}</div>` +
        `<div class="fa-ctx-sub">${u.ctxSub}</div>` +
        (rows.length
          ? `<div class="fa-ctx-kpis">${rows.map(([k, v]) =>
              `<button class="fa-ctx-kpi" type="button" data-fa-fact="${escAttr(k + ' : ' + v)}"><span class="k">${k}</span><span class="v">${v}</span></button>`).join('')}</div>`
          : '') +
        `<div class="fa-ctx-detail" style="display:block;font-size:12.5px;color:var(--n-500);line-height:1.55;">${p.railEmpty}</div>` +
        `<div class="fa-ctx-trust">${ICON.lock}<span>${u.ctxTrust}</span></div>`;
    } else {
      const f = tr().facts;
      const opexItems = Object.entries(B.opex).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [tr().opex[k] || k, fmtMad(v)]);
      const ctxRail =
        ctxGroup(u.gActivity, [
          [f.revenue, fmtMad(B.revenue)],
          [f.revPerDay, fmtMad(B.dailyRev)],
          [f.mtdRev, `${fmtMad(B.mtdRevenue)} · ${B.mtdDays} ${u.days}`],
          [f.ordersMonth, fmt(B.ordersPerMonth)],
          [f.ordersDay, fmt(B.ordersPerDay)],
          [f.basket, fmtMad(B.avgBasket)],
        ]) +
        ctxGroup(u.gProfit, [
          [f.grossMargin, `${fmtMad(B.grossProfit)} · ${fmt1(B.grossMargin)} %`],
          [f.cogs, `${fmtMad(B.cogs)} · ${fmt1(100 - B.grossMargin)} %`],
          [f.profitPerOrder, fmtMad(B.netPerOrder)],
          [f.breakEven, `${fmtMad(B.breakEvenRev)} ${u.perMonth}`],
        ]) +
        ctxGroup(u.gFixed, opexItems, `${fmtMad(B.totalOpex)} ${u.perMonth}`) +
        ctxGroup(u.gCash, [
          [f.cashAvail, fmtMad(B.cashBuffer)],
          [f.headcount, u.employees(B.staffCount)],
        ]);
      const netFact = `${f.netProfit} : ${fmtMad(B.netProfit)} · ${f.netMarginLine(fmt1(B.netMargin))}`;
      const kpiFact = (k, v) => `${k} : ${v}`;
      const coreKpis = [
        { k: f.revenue, v: fmtMad(B.revenue), fact: kpiFact(f.revenue, fmtMad(B.revenue)) },
        { k: f.grossMargin, v: fmtMad(B.grossProfit), fact: kpiFact(f.grossMargin, `${fmtMad(B.grossProfit)} · ${fmt1(B.grossMargin)} %`) },
        { k: f.netProfit, v: fmtMad(B.netProfit), fact: netFact, hl: true },
        { k: f.cashAvail, v: fmtMad(B.cashBuffer), fact: kpiFact(f.cashAvail, fmtMad(B.cashBuffer)) },
      ];
      const opexRaw = Object.entries(B.opex).sort((a, b) => b[1] - a[1]);
      const vizColors = ['var(--atlas)', '#46A878', '#7DF2B0', '#cdd6d0'];
      const vizParts = opexRaw.slice(0, 3).map(([k, v], i) => ({ k: tr().opex[k] || k, v, c: vizColors[i] }));
      vizParts.push({ k: HL().autres, v: opexRaw.slice(3).reduce((s, r) => s + r[1], 0), c: vizColors[3] });
      asideHtml =
        `<div class="fa-ctx-eyebrow">${u.ctxEyebrow}</div>` +
        `<div class="fa-ctx-biz">${escHtml(B.name)}</div>` +
        `<div class="fa-ctx-sub">${u.ctxSub}</div>` +
        `<div class="fa-ctx-kpis">${coreKpis.map((c) => `<button class="fa-ctx-kpi${c.hl ? ' hl' : ''}" type="button" data-fa-fact="${escAttr(c.fact)}"><span class="k">${c.k}</span><span class="v">${c.v}</span></button>`).join('')}</div>` +
        `<div class="fa-ctx-viz">` +
          `<div class="fa-ctx-viz-h"><span>${u.gFixed}</span><span class="t">${fmtMad(B.totalOpex)}</span></div>` +
          `<div class="fa-ctx-bar">${vizParts.map((p) => `<span style="width:${(p.v / B.totalOpex * 100).toFixed(1)}%;background:${p.c};"></span>`).join('')}</div>` +
          `<div class="fa-ctx-leg">${vizParts.map((p) => `<span class="li"><i style="background:${p.c};"></i>${p.k}</span>`).join('')}</div>` +
        `</div>` +
        `<button class="fa-ctx-more" type="button" data-fa-ctx-more>${HL().more}</button>` +
        `<div class="fa-ctx-detail" data-fa-detail hidden>${ctxRail}</div>` +
        `<div class="fa-ctx-trust">${ICON.lock}<span>${u.ctxTrust}</span></div>`;
    }

    const body = `
      <div class="fa">
        <div class="fa-main">
          <div class="fa-thread">
            <div class="fa-thread-in" data-fa-thread></div>
          </div>
          <div class="fa-dock">
            <div class="fa-dock-in">
              <div class="fa-keypad" data-fa-keypad>
                <div class="fa-keypad-card">
                  <div class="fa-kpdisplay" data-fa-kpd>0</div>
                  <div class="fa-kpgrid">
                    ${['C','⌫','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','0','.']
                      .map((k) => `<button class="${/[÷×−+%]/.test(k) ? 'op' : ''}" data-fa-key="${k}">${k}</button>`).join('')}
                    <button class="eq" data-fa-key="=">=</button>
                  </div>
                  <button class="fa-kp-use" data-fa-kp-use type="button" hidden>${u.kpUse}</button>
                </div>
              </div>
              <div class="fa-inputwrap">
                <textarea class="fa-input" data-fa-input rows="1"
                  placeholder="${escAttr(u.placeholder)}"></textarea>
                <button class="fa-send" data-fa-send title="${escAttr(u.send)}">${ICON.send}</button>
              </div>
              <div class="fa-toolbar">
                <button class="fa-tool" data-fa-keypad-toggle type="button">${ICON.keypad}<span>${u.calc}</span></button>
                <span class="fa-hint">${u.enterToSend}</span>
              </div>
            </div>
          </div>
        </div>
        <aside class="fa-context">${asideHtml}</aside>
      </div>`;

    const res = window.Kiwi.drawer({
      title: u.title,
      subtitle: u.subtitle,
      body,
      fullpage: true,
    });
    res.el.classList.add('fa-drawer');

    const root = res.el;
    const thread = root.querySelector('[data-fa-thread]');
    const threadScroll = root.querySelector('.fa-thread');
    const input = root.querySelector('[data-fa-input]');
    const keypad = root.querySelector('[data-fa-keypad]');
    const kpd = root.querySelector('[data-fa-kpd]');

    const scrollDown = () => { threadScroll.scrollTop = threadScroll.scrollHeight; };

    function pushUser(text) {
      const m = document.createElement('div');
      m.className = 'fa-msg user';
      m.insertAdjacentHTML('beforeend', `<div class="fa-bubble"></div>`);
      m.querySelector('.fa-bubble').textContent = text;
      thread.appendChild(m);
      scrollDown();
    }
    function pushAgent(html) {
      const m = document.createElement('div');
      m.className = 'fa-msg agent';
      m.insertAdjacentHTML('beforeend',
        `<div class="fa-avatar">${ICON.avatar}</div><div class="fa-bubble">${html}</div>`);
      thread.appendChild(m);
      scrollDown();
      return m;
    }
    function pushTyping() {
      const m = document.createElement('div');
      m.className = 'fa-msg agent';
      m.insertAdjacentHTML('beforeend',
        `<div class="fa-avatar">${ICON.avatar}</div><div class="fa-bubble"><div class="fa-typing"><i></i><i></i><i></i></div></div>`);
      thread.appendChild(m);
      scrollDown();
      return m;
    }

    function ask(text) {
      const t = (text || '').trim();
      if (!t) return;
      const hero = thread.querySelector('[data-fa-hero]');
      if (hero) hero.remove();
      pushUser(t);
      const reply = respond(t);
      if (reply) {
        const typing = pushTyping();
        setTimeout(() => { typing.remove(); pushAgent(replyHtml(reply)); }, 460 + Math.random() * 300);
        return;
      }
      routeToLlm(t);
    }

    function routeToLlm(question) {
      const m = tr().llm;
      if (!('gpu' in navigator)) {
        pushAgent(replyHtml({ text: m.noGpu, follow: [tr().chips.charges, tr().chips.breakeven] }));
        return;
      }
      if (LLM.status === 'ready') { runLlm(question); return; }
      if (LLM.status === 'loading') {
        LLM.pending = question;
        pushAgent(replyHtml({ text: m.loading(Math.round(LLM.progress * 100)) }));
        return;
      }
      LLM.pending = question;
      pushAgent(
        `<div>${m.offerLead}</div>
         <div class="fa-note" style="font-style:normal;">${m.offerSize(LLM.sizeLabel)}</div>
         <div class="fa-follow"><button type="button" class="fa-llm-btn" data-fa-activate>${m.activate}</button></div>`);
    }

    async function activateLlm() {
      if (LLM.status === 'loading' || LLM.status === 'ready') return;
      const m = tr().llm;
      LLM.status = 'loading';
      const card = pushAgent(
        `<div>${m.installing}</div>
         <div class="fa-llm-prog"><div class="fa-llm-bar" data-fa-bar></div></div>
         <div class="fa-llm-ptxt" data-fa-ptxt>${m.initializing}</div>`);
      const bar = card.querySelector('[data-fa-bar]');
      const ptxt = card.querySelector('[data-fa-ptxt]');
      try {
        const webllm = await import(LLM.cdn);
        /* The model's WASM lib defaults to raw.githubusercontent.com, which many
         * ISPs, firewalls and privacy/ad-blocker extensions drop — causing a
         * "Failed to fetch" before the download even starts. Swap it for
         * jsDelivr's GitHub mirror (a real CDN with proper CORS) so activation
         * works on real networks. Weights still come from Hugging Face. */
        const base = webllm.prebuiltAppConfig;
        const appConfig = {
          ...base,
          model_list: base.model_list.map((mm) => mm.model_lib && mm.model_lib.includes('raw.githubusercontent.com')
            ? { ...mm, model_lib: mm.model_lib.replace(/https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//, 'https://cdn.jsdelivr.net/gh/$1/$2@$3/') }
            : mm),
        };
        LLM.engine = await webllm.CreateMLCEngine(LLM.model, {
          appConfig,
          initProgressCallback: (p) => {
            LLM.progress = p.progress || 0;
            if (bar) bar.style.width = Math.round(LLM.progress * 100) + '%';
            if (ptxt) ptxt.textContent = p.text || `${Math.round(LLM.progress * 100)} %`;
          },
        });
        LLM.status = 'ready';
        if (bar) bar.style.width = '100%';
        if (ptxt) ptxt.textContent = m.ready;
        pushAgent(replyHtml({ text: m.readyMsg }));
        if (LLM.pending) { const q = LLM.pending; LLM.pending = null; runLlm(q); }
      } catch (e) {
        console.error('[Kiwi] In-browser LLM failed to load:', e);
        LLM.status = 'error';
        if (ptxt) ptxt.textContent = m.loadFail;
        pushAgent(replyHtml({ text: m.loadFailMsg }));
      }
    }

    async function runLlm(question) {
      const typing = pushTyping();
      llmHistory.push({ role: 'user', content: question });
      /* No `/no_think` suffix: that was Qwen3's switch and Qwen3.5 removed it
       * (its template is non-thinking unless enable_thinking:true is passed).
       * Appending it now would only pollute the system prompt. */
      const sys = buildSystemPrompt(detectQLang(question));
      const messages = [{ role: 'system', content: sys }, ...llmHistory.slice(-8)];
      try {
        const stream = await LLM.engine.chat.completions.create({
          messages,
          /* Deliberately below Qwen3.5's packaged default (temp 1.0 / top_p
           * 1.0): this assistant answers with the merchant's real money, so
           * the failure we most need to suppress is an invented MAD figure.
           * 0.7/0.8 stays clear of the repetition that greedy decoding
           * triggers while keeping output tight against the grounding. */
          temperature: 0.7,
          top_p: 0.8,
          stream: true,
        });
        typing.remove();
        const bubble = pushAgent('<span data-fa-stream></span>');
        const target = bubble.querySelector('[data-fa-stream]');
        let acc = '';
        for await (const chunk of stream) {
          acc += chunk.choices?.[0]?.delta?.content || '';
          if (target) target.textContent = stripThink(acc);
          scrollDown();
        }
        const clean = stripThink(acc);
        /* Numeric guardrail — if the answer states material MAD figures that
         * aren't a (rounded) restatement of the grounding, append a calm
         * verify-nudge. Never alters the answer itself. */
        if (bubble && auditNumbers(clean).uncited.length) {
          const note = document.createElement('div');
          note.className = 'fa-note';
          note.textContent = GUARD[L] || GUARD.fr;
          bubble.appendChild(note);
          scrollDown();
        }
        /* Store the clean answer — Qwen3 guidance is to keep prior thinking
         * content OUT of multi-turn history. */
        llmHistory.push({ role: 'assistant', content: clean });
      } catch (e) {
        typing.remove();
        pushAgent(replyHtml({ text: tr().llm.runErr }));
      }
    }

    // first screen — the empty-state hero, replaced by the conversation on first ask
    thread.insertAdjacentHTML('beforeend', renderHero());

    if (typeof prefill === 'string' && prefill.trim()) {
      setTimeout(() => ask(prefill.trim()), 360);
    }

    // ─── input wiring ───
    function send() {
      const v = input.value;
      input.value = '';
      input.style.height = 'auto';
      ask(v);
    }
    function insertFact(text, el) {
      const cur = input.value.trim();
      input.value = cur ? `${cur} · ${text}` : text;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 144) + 'px';
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
      if (el) { el.classList.remove('fa-flash'); void el.offsetWidth; el.classList.add('fa-flash'); }
    }
    root.querySelector('[data-fa-send]').addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 130) + 'px';
    });

    // ─── chips + follow-ups + facts (delegated) ───
    root.addEventListener('click', (e) => {
      const follow = e.target.closest('[data-fa-follow]');
      if (follow) { ask(follow.getAttribute('data-fa-follow')); return; }
      const openBtn = e.target.closest('[data-fa-open]');
      if (openBtn) {
        const handlerName = openBtn.getAttribute('data-fa-open');
        const fn = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers[handlerName];
        if (typeof fn === 'function') fn();
        /* Take the merchant to the destination: close the assistant so the
         * page/drawer the handler opened is actually visible underneath. */
        const back = root.closest('.kiwi-drawer-backdrop');
        if (back && typeof back.__kiwiClose === 'function') back.__kiwiClose();
        /* For a page-switch (nav-*), re-assert the sidebar highlight after the
         * drawer-close's reset-to-home settles (~320 ms). */
        const navKey = handlerName.indexOf('nav-') === 0 ? handlerName.slice(4) : null;
        if (navKey) setTimeout(() => {
          const nav = document.querySelector('.sidebar nav');
          const link = nav && nav.querySelector('a[data-nav="' + navKey + '"]');
          if (link) { nav.querySelectorAll('a').forEach((a) => a.classList.remove('active')); link.classList.add('active'); }
        }, 360);
        return;
      }
      if (e.target.closest('[data-fa-activate]')) { activateLlm(); return; }
      const moreBtn = e.target.closest('[data-fa-ctx-more]');
      if (moreBtn) {
        const det = root.querySelector('[data-fa-detail]');
        if (det) {
          det.hidden = !det.hidden;
          moreBtn.textContent = det.hidden ? HL().more : HL().less;
        }
        return;
      }
      const fact = e.target.closest('[data-fa-fact]');
      if (fact) { insertFact(fact.getAttribute('data-fa-fact'), fact); return; }
    });

    // ─── keypad ───
    const toggle = root.querySelector('[data-fa-keypad-toggle]');
    toggle.addEventListener('click', () => {
      const isOpen = keypad.classList.toggle('open');
      toggle.classList.toggle('on', isOpen);
    });

    const kpUse = root.querySelector('[data-fa-kp-use]');
    let kpExpr = '', kpDone = false;
    const kpShow = () => {
      kpd.textContent = kpExpr || '0';
      if (kpUse) kpUse.hidden = !(kpDone && kpExpr);
    };
    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fa-key]');
      if (!btn) return;
      const k = btn.getAttribute('data-fa-key');
      if (k === 'C') { kpExpr = ''; kpDone = false; }
      else if (k === '⌫') { kpExpr = kpExpr.slice(0, -1); }
      else if (k === '=') {
        const r = evalMath(kpExpr);
        if (r != null) {
          kpExpr = String(Math.round(r * 1e6) / 1e6);
          kpDone = true;
        } else { kpd.textContent = tr().ui.kpError; if (kpUse) kpUse.hidden = true; return; }
      } else {
        const isOp = /[÷×−+%]/.test(k);
        if (kpDone && !isOp) { kpExpr = ''; kpDone = false; }
        else if (kpDone && isOp) { kpDone = false; }
        kpExpr += k;
      }
      kpShow();
    });
    /* Calculator → conversation bridge — drop the computed result into the
     * message box so the owner can build a question around it. */
    if (kpUse) kpUse.addEventListener('click', () => {
      if (!kpExpr) return;
      insertFact(kpExpr);
      keypad.classList.remove('open');
      toggle.classList.remove('on');
    });

    setTimeout(() => input.focus(), 480);
  }

  /* ─────────────── REGISTER ─────────────── */
  function register() {
    if (!window.Kiwi || !window.Kiwi.handlers) { setTimeout(register, 80); return; }
    window.Kiwi.handlers['nav-assistant'] = open;
    window.Kiwi.handlers['open-assistant'] = open;
  }
  register();

  // Keep the active profile in lockstep with the venue switcher.
  (function subVenue() {
    if (window.KiwiVenue && window.KiwiVenue.subscribe) { window.KiwiVenue.subscribe(syncProfile); return; }
    setTimeout(subVenue, 120);
  })();

  // The dashboard hero's question box opens this assistant with the typed question.
  function wireHeroInput() {
    const form = document.querySelector('.hai-input');
    if (!form) { setTimeout(wireHeroInput, 120); return; }
    if (form.dataset.faWired === '1') return;
    form.dataset.faWired = '1';
    const field = form.querySelector('[data-hai-input]');
    const go = (e) => {
      if (e) e.preventDefault();
      const q = (field && field.value || '').trim();
      if (field) field.value = '';
      open(q);
    };
    form.addEventListener('submit', go);
    const sendBtn = form.querySelector('.hai-send');
    if (sendBtn) sendBtn.addEventListener('click', go, true);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireHeroInput);
  } else {
    wireHeroInput();
  }
})();
