/* Kiwi AI - le point du matin.
 *
 * Durable, deterministic briefing rules with bounded merchant thresholds.
 * Missing measured data stays calm; settings share the briefing store doc.
 */
(function () {
  'use strict';

  var PREFIX = 'kiwi:briefing:v1:';
  // One year plus five days for month-end review. Financial books live in their own ledgers.
  var RULES = [salesDropRule, lowStockRule, marginErosionRule, planningGapRule, cancellationRateRule, discountShareRule, cashGapRule, lateOrdersRule, weatherRule];
  /* briefing-limits:begin · copie générée de functions/api/_briefing-limits.js par tools/build-briefing-limits.mjs : ne pas modifier ici */
  /* clé : [réglage d'usine, minimum, maximum, nom fr, nom en, nom ar] */
  var LIMITS = {
    "salesDrop": [20,1,100,"Baisse des ventes (%)","Sales drop (%)","انخفاض المبيعات (%)"],
    "stockFactor": [1,0.1,10,"Multiplicateur du seuil stock","Stock threshold multiplier","مضاعف عتبة المخزون"],
    "marginDrop": [5,0.1,100,"Baisse de marge (points)","Margin drop (points)","انخفاض الهامش (نقاط)"],
    "coverage": [80,1,100,"Couverture minimale (%)","Minimum coverage (%)","الحد الأدنى للتغطية (%)"],
    "coverageGap": [10,0,100,"Écart de couverture (%)","Coverage gap (%)","فرق التغطية (%)"],
    "samples": [3,1,4,"Repères minimum","Minimum reference points","الحد الأدنى للمراجع"],
    "events": [2,1,100,"Cas minimum dans la journée","Minimum cases in the day","الحد الأدنى للحالات في اليوم"],
    "share": [5,0.1,100,"Part d’alerte (%)","Alert share (%)","نسبة التنبيه (%)"],
    "multiple": [2,1,10,"Fois la normale","Times the usual","مرات المعتاد"],
    "cashCents": [10000,1,10000000,"Écart de caisse (MAD)","Cash gap (MAD)","فرق الصندوق (درهم)"],
    "weatherEffect": [8,1,100,"Effet météo (%)","Weather effect (%)","تأثير الطقس (%)"],
    "lateMultiple": [1.5,1,10,"Délai : fois la normale","Timing: times the usual","المدة: مرات المعتاد"],
    "lateMinutes": [5,1,240,"Retard (minutes)","Delay (minutes)","التأخير (دقائق)"],
    "lateSamples": [5,1,100,"Commandes de référence (min.)","Reference orders (min.)","الطلبات المرجعية (الحد الأدنى)"],
    "planningMinutes": [1,1,1440,"Absence de couverture (minutes)","Uncovered period (minutes)","فترة بدون تغطية (دقائق)"],
    "rainMm": [1,0.1,500,"Pluie prévue (mm)","Forecast rain (mm)","المطر المتوقع (مم)"],
    "weatherDays": [5,1,100,"Jours météo minimum","Minimum weather days","الحد الأدنى لأيام الطقس"]
  };
  /* clé : [aide fr, aide en, aide ar], une phrase pour le réglage */
  var HELP = {
    "salesDrop": ["Alerte quand les ventes du jour sont inférieures d’autant à celles des mêmes jours des semaines passées.","Alerts when today’s sales are this far below the same weekdays in past weeks.","تنبيه عندما تقل مبيعات اليوم بهذه النسبة عن نفس الأيام في الأسابيع الماضية."],
    "stockFactor": ["1 alerte quand un article atteint son seuil minimum ; 2 alerte deux fois plus tôt.","1 alerts when an item reaches its minimum level; 2 alerts twice as early.","1 ينبه عند بلوغ الحد الأدنى للمنتج، و2 ينبه أبكر بمرتين."],
    "marginDrop": ["Alerte quand la marge brute perd autant de points par rapport à d’habitude.","Alerts when gross margin loses this many points compared with usual.","تنبيه عندما يفقد الهامش الإجمالي هذا العدد من النقاط مقارنة بالمعتاد."],
    "coverage": ["Part des ventes dont le coût d’achat est connu. En dessous, Kiwi ne juge pas la marge.","Share of sales whose purchase cost is known. Below it, Kiwi does not judge the margin.","نسبة المبيعات المعروفة التكلفة. دون ذلك لا يحكم Kiwi على الهامش."],
    "coverageGap": ["Si la part de coûts connus change trop entre aujourd’hui et d’habitude, la comparaison est ignorée.","If the share of known costs differs too much from usual, the comparison is skipped.","إذا اختلفت نسبة التكاليف المعروفة كثيرا عن المعتاد، يتم تجاهل المقارنة."],
    "samples": ["Repères exigés avant d’alerter : semaines comparables (ventes, annulations, remises) ou commandes du jour (délais). De 1 à 4.","Reference points required before alerting: comparable weeks (sales, cancellations, discounts) or today’s orders (timing). From 1 to 4.","عدد المراجع المطلوبة قبل التنبيه: أسابيع قابلة للمقارنة (المبيعات، الإلغاءات، التخفيضات) أو طلبات اليوم (المدد). من 1 إلى 4."],
    "events": ["Nombre d’annulations (ou de ventes remisées) à atteindre aujourd’hui avant d’alerter.","Number of cancellations (or discounted sales) to reach today before alerting.","عدد الإلغاءات (أو المبيعات المخفضة) المطلوب بلوغه اليوم قبل التنبيه."],
    "share": ["Kiwi ne parle jamais sous cette part du chiffre, même si c’est plus que d’habitude.","Kiwi never speaks below this share of sales, even if it is above usual.","لا ينبه Kiwi دون هذه النسبة من المبيعات حتى لو تجاوزت المعتاد."],
    "multiple": ["Alerte quand la part du jour atteint ce multiple de votre part habituelle.","Alerts when today’s share reaches this multiple of your usual share.","تنبيه عندما تبلغ نسبة اليوم هذا المضاعف من نسبتك المعتادة."],
    "cashCents": ["Un écart à la clôture de caisse au-delà de ce montant, en plus ou en moins, déclenche l’alerte.","A gap at register close beyond this amount, over or short, triggers the alert.","فرق عند إغلاق الصندوق يتجاوز هذا المبلغ، زيادة أو نقصانا، يطلق التنبيه."],
    "weatherEffect": ["Alerte quand la pluie a déjà changé vos ventes d’au moins ce pourcentage.","Alerts when rain has already moved your sales by at least this percentage.","تنبيه عندما غيّر المطر مبيعاتك سابقا بهذه النسبة على الأقل."],
    "lateMultiple": ["Alerte quand le délai du jour atteint ce multiple de votre délai habituel.","Alerts when today’s wait reaches this multiple of your usual wait.","تنبيه عندما تبلغ مدة اليوم هذا المضاعف من مدتك المعتادة."],
    "lateMinutes": ["Et le délai doit aussi s’allonger d’au moins ce nombre de minutes, pour ignorer les petits écarts.","The wait must also grow by at least this many minutes, to ignore small gaps.","ويجب أيضا أن تطول المدة بهذا العدد من الدقائق على الأقل لتجاهل الفروق الصغيرة."],
    "lateSamples": ["Nombre de commandes passées nécessaires pour connaître votre délai habituel.","Number of past orders needed to know your usual wait.","عدد الطلبات السابقة اللازمة لمعرفة مدتك المعتادة."],
    "planningMinutes": ["Alerte quand le planning laisse l’établissement sans personne au moins cette durée pendant l’ouverture.","Alerts when the schedule leaves the venue unstaffed for at least this long while open.","تنبيه عندما يترك الجدول المحل بلا أحد هذه المدة على الأقل أثناء الفتح."],
    "rainMm": ["Pluie prévue à partir de laquelle une journée compte comme pluvieuse (1 mm est le réglage de base).","Forecast rain from which a day counts as rainy (1 mm is the standard setting).","كمية المطر المتوقعة التي يعد اليوم عندها ممطرا (1 مم هو الإعداد الأساسي)."],
    "weatherDays": ["Nombre de jours de pluie passés à observer avant que Kiwi parle d’un effet.","Number of past rainy days to observe before Kiwi reports an effect.","عدد أيام المطر السابقة التي تُرصد قبل أن يتحدث Kiwi عن تأثير."]
  };
  /* les clés qui doivent rester entières */
  var INTEGER = {"samples":true,"events":true,"cashCents":true,"lateSamples":true,"planningMinutes":true,"weatherDays":true};
  /* par règle, dans l'ordre de RULES : les clés qu'elle lit */
  var GROUPS = [["salesDrop","samples"],["stockFactor"],["marginDrop","coverage","coverageGap"],["planningMinutes"],["share","multiple","events","samples"],["share","multiple","events","samples"],["cashCents"],["lateMultiple","lateMinutes","samples","lateSamples"],["weatherEffect","rainMm","weatherDays"]];
  /* briefing-limits:end */
  function integerLimit(key) { return INTEGER[key] === true; }
  function validSettings(value) {
    var out = {};
    Object.keys(LIMITS).forEach(function (key) {
      var n = value && value[key], spec = LIMITS[key];
      if (typeof n === 'number' && Number.isFinite(n) && n >= spec[1] && n <= spec[2] && (!integerLimit(key) || Number.isInteger(n))) out[key] = n;
    });
    return out;
  }
  function limit(key) { var v = own().settings; return v && v[key] != null ? v[key] : LIMITS[key][0]; }
  /* Ce que voit le commerçant : l'écart de caisse se règle et se lit en
   * dirhams, il reste rangé en centimes. Les « échantillons » s'arrêtent à 4,
   * le nombre de mêmes jours de semaine que comparent ventes, annulations et
   * remises : au-delà, ces trois règles se taisaient sans le dire. */
  var SCALE = { cashCents: 100 };
  var NUM = {};
  function num(value, L) {
    var loc = L === 'en' ? 'en-GB' : 'fr-FR';
    if (!NUM[loc]) NUM[loc] = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
    return NUM[loc].format(value);
  }
  function shown(key, value) { return (value == null ? limit(key) : value) / (SCALE[key] || 1); }
  function setSettings(value) {
    if (!isReal() || !slug() || !/^(owner|manager)$/.test(tier()) || !value || typeof value !== 'object') return false;
    var clean = validSettings(value);
    if (Object.keys(value).some(function (k) { return !Object.prototype.hasOwnProperty.call(clean, k); })) return false;
    var doc = own(); doc.settingsFieldsAt = doc.settingsFieldsAt || {};
    /* Horloge de Lamport par champ : une modification passe toujours après
     * celle qu'elle remplace, même si un autre appareil avançait d'un mois. */
    var at = Date.now();
    Object.keys(clean).forEach(function (key) { at = Math.max(at, (Number(doc.settingsFieldsAt[key]) || 0) + 1); });
    doc.settings = Object.assign({}, doc.settings, clean); doc.settingsAt = Math.max(at, Number(doc.settingsAt) || 0);
    Object.keys(clean).forEach(function (key) { doc.settingsFieldsAt[key] = at; });
    compute(); return true;
  }
  /* Quels pavés de réglages sont ouverts : le point du matin se redessine
   * après chaque saisie, sans cela le commerçant retrouvait tout replié. */
  var openState = {};
  function atFactory(key) { return Number(limit(key)) === LIMITS[key][0]; }
  function sharedWith(key, index, t) {
    var names = [];
    GROUPS.forEach(function (keys, i) { if (i !== index && keys.indexOf(key) >= 0 && t.ruleNames[i]) names.push(t.ruleNames[i]); });
    return names.length ? t.alsoUsed.replace('{names}', names.join(', ')) : '';
  }
  function fieldHtml(key, index, idx, t) {
    var spec = LIMITS[key], id = index + '-' + key, help = HELP[key][idx - 3];
    var note = [help, sharedWith(key, index, t), t.usual.replace('{value}', num(shown(key, spec[0]), lang()))].filter(Boolean).join(' ');
    return '<div class="briefing-set-field"><label class="briefing-set-name" for="briefing-in-' + id + '">' + esc(spec[idx]) + '</label><input type="number" id="briefing-in-' + id + '" data-briefing-limit="' + key + '" data-briefing-error="briefing-error-' + id + '" min="' + shown(key, spec[1]) + '" max="' + shown(key, spec[2]) + '" step="' + (SCALE[key] ? String(1 / SCALE[key]) : integerLimit(key) ? '1' : 'any') + '" aria-describedby="briefing-help-' + id + ' briefing-error-' + id + '" value="' + shown(key) + '"><small class="briefing-set-help" id="briefing-help-' + id + '">' + esc(note) + '</small><span class="briefing-set-error" id="briefing-error-' + id + '" role="status"></span></div>';
  }
  function ruleHtml(index, idx, t) {
    var keys = GROUPS[index], pristine = keys.every(atFactory);
    return '<details class="briefing-rule" data-briefing-open="rule-' + index + '"' + (openState['rule-' + index] ? ' open' : '') + '><summary>' + esc(t.ruleNames[index]) + '</summary>' +
      keys.map(function (key) { return fieldHtml(key, index, idx, t); }).join('') +
      '<button type="button" class="briefing-reset" data-briefing-reset="' + index + '"' + (pristine ? ' disabled' : '') + '>' + esc(t.resetRule) + '</button></details>';
  }
  function settingsHtml() {
    if (!/^(owner|manager)$/.test(tier())) return '';
    var L = lang(), idx = L === 'ar' ? 5 : L === 'en' ? 4 : 3, t = tr(L);
    return '<details class="briefing-settings" data-briefing-open="all"' + (openState.all ? ' open' : '') + '><summary>' + esc(t.settings) + '</summary><p class="briefing-set-intro">' + esc(t.settingsIntro) + '</p>' +
      GROUPS.map(function (keys, index) { return ruleHtml(index, idx, t); }).join('') + '</details>';
  }
  /* Rétablit les valeurs d'usine des seuils d'UNE règle. La valeur d'usine est
   * rangée comme un réglage (pas effacée) : l'effacement ne survivrait pas à la
   * fusion entre appareils. Un seuil que la règle partage avec une autre revient
   * aussi chez celle-ci, la ligne d'aide le dit. */
  function resetRule(index) {
    var keys = GROUPS[index], value = {};
    if (!keys) return false;
    keys.forEach(function (key) { value[key] = LIMITS[key][0]; });
    return setSettings(value);
  }
  function thresholdEvidence(line) {
    var RULE_OF = { 'sales-drop': 0, 'low-stock': 1, 'margin-erosion': 2, 'planning-gap': 3, 'cancellation-rate': 4, 'discount-share': 5, 'cash-gap': 6, 'late-orders': 7, weather: 8 };
    var rule = Object.prototype.hasOwnProperty.call(RULE_OF, line.kind) ? RULE_OF[line.kind] : /^late-orders-/.test(line.kind) ? 7 : -1;
    var used = rule >= 0 ? GROUPS[rule] : [];
    if (!used.length) return line;
    var list = function (L) { return used.map(function (k) { return LIMITS[k][L === 'ar' ? 5 : L === 'en' ? 4 : 3] + ' ' + num(shown(k), L); }).join(', '); };
    line.evidence.source += ' · ' + ({fr:'Seuils',en:'Thresholds',ar:'العتبات'}[lang()]) + ': ' + list(lang());
    if (line.evidence.text) ['fr', 'en', 'ar'].forEach(function (L) {
      if (line.evidence.text[L]) { var suffix = ' · ' + { fr: 'Seuils : ', en: 'Thresholds: ', ar: 'العتبات: ' }[L] + list(L); line.evidence.text[L] = line.evidence.text[L].slice(0, Math.max(0, 400 - suffix.length)) + suffix; }
    });
    return line;
  }

  /* The venue `doc` was loaded for. slug() follows the venue on screen the
   * moment it changes, while `doc` stayed whatever was last loaded: a compute()
   * fired between a venue switch and the subscriber's readLocal() prepended
   * the new venue's day to the OLD venue's days and pushed the lot to the new
   * store. An operator hopping between two stores filed each one's days in
   * the other's document (maison-121 <-> la-maison-en-vogue, 2026-09-26). */

  var rules = window.KiwiBriefingRules.createRules({ limit: limit, businessDay: businessDay, dayBoundsAt: dayBoundsAt, now: function () { return Date.now(); }, money: function (value) {
    var opts = { maximumFractionDigits: 2 };
    return window.KiwiNumber?.format(value, opts) ?? value.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', opts);
  } });
  var persistence = window.KiwiBriefingPersistence.createPersistence({ slug: slug, localKey: localKey, validSettings: validSettings, render: render, compute: compute, isReal: isReal, localStorage: { getItem: function (key) { return localStorage.getItem(key); }, setItem: function (key, value) { return localStorage.setItem(key, value); }, removeItem: function (key) { return localStorage.removeItem(key); } }, limits: LIMITS,
    cloudDoc: function () { return window.KiwiCloudDoc; }, canDispatch: function () { return typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function'; }, dispatch: function (detail) { window.dispatchEvent(new CustomEvent('kiwi:local-save', { detail: detail })); }
  });
  function own() { return persistence.own(); }
  function writeLocal(value) { return persistence.writeLocal(value); }
  function mergeDocs(a, b) { return persistence.mergeDocs(a, b); }
  function save() { return persistence.save(); }
  function attachCloud() { return persistence.attachCloud(); }

  var COPY = {
    fr: {
      ruleNames: ["Ventes", "Stock", "Marge", "Planning", "Annulations", "Remises", "Caisse", "Délais de service", "Météo"], analysisFailed: 'Analyse indisponible', retryAnalysis: 'Réessayer', invalidLimit: 'Saisissez une valeur entre {min} et {max}.', integerOnly: 'Un nombre entier est requis.', settings: 'Réglages des seuils', settingsIntro: 'Chaque règle a ses seuils. Les valeurs d’usine conviennent à la plupart des établissements.', resetRule: 'Rétablir les valeurs d’usine', alsoUsed: 'Aussi utilisé par : {names}.', usual: 'Valeur d’usine : {value}', eyebrow: 'KIWI AI', title: 'Le point du matin', empty: 'Rien d’urgent à signaler.', calm: 'Rien d’urgent', signalOne: '1 signal', signalMany: '{n} signaux',
      emptyNote: 'Kiwi surveille uniquement les données mesurées de cet établissement.', ask: 'Voir le point du matin',
      coverage: 'Je surveille les signaux déjà mesurables, sans inventer les données manquantes.',
      coveredLabel: 'Couverture active', covered: 'Ventes · stock · marge · planning · remises · annulations · caisse · délais de service',
      waitingLabel: 'Signaux bloqués', waiting: 'Aucun',
      demo: 'Le point du matin s’active sur un établissement réel connecté. La démonstration ne fabrique aucune alerte.',
      unsaved: 'Non enregistré sur cet appareil : le stockage du navigateur est plein ou bloqué. Kiwi l’envoie au serveur dès que la connexion le permet.',
      cloudFailed: 'Copie cloud non confirmée. Réessayer',
      handled: 'Traité', dismiss: 'Masquer', propose: 'Proposer',
      wToday: 'Aujourd’hui', wTomorrow: 'Demain', wSource: 'Météo MET Norway',
      wKinds: { clear: 'beau temps', cloudy: 'nuageux', rain: 'pluie', storm: 'orage', snow: 'neige', fog: 'brouillard' }
    },
    en: {
      ruleNames: ["Sales", "Stock", "Margin", "Staffing", "Cancellations", "Discounts", "Cash", "Service timing", "Weather"], analysisFailed: 'Analysis unavailable', retryAnalysis: 'Retry', invalidLimit: 'Enter a value between {min} and {max}.', integerOnly: 'A whole number is required.', settings: 'Threshold settings', settingsIntro: 'Each rule has its own thresholds. The factory values suit most venues.', resetRule: 'Restore factory values', alsoUsed: 'Also used by: {names}.', usual: 'Factory value: {value}', eyebrow: 'KIWI AI', title: 'Morning briefing', empty: 'Nothing urgent to flag.', calm: 'Nothing urgent', signalOne: '1 signal', signalMany: '{n} signals',
      emptyNote: 'Kiwi monitors only measured data from this venue.', ask: 'Open morning briefing',
      coverage: 'I monitor the signals that are already measurable, without inventing missing data.',
      coveredLabel: 'Active coverage', covered: 'Sales · stock · margin · staffing · discounts · cancellations · cash · service timing',
      waitingLabel: 'Blocked signals', waiting: 'None',
      demo: 'Morning briefing activates for a connected real venue. The demo never fabricates alerts.',
      unsaved: 'Not saved on this device: browser storage is full or blocked. Kiwi sends it to the server as soon as the connection allows.',
      cloudFailed: 'Cloud copy not confirmed. Retry',
      handled: 'Handled', dismiss: 'Dismiss', propose: 'Propose',
      wToday: 'Today', wTomorrow: 'Tomorrow', wSource: 'Weather by MET Norway',
      wKinds: { clear: 'fair', cloudy: 'cloudy', rain: 'rain', storm: 'thunderstorm', snow: 'snow', fog: 'fog' }
    },
    ar: {
      ruleNames: ["المبيعات", "المخزون", "الهامش", "جدول العمل", "الإلغاءات", "التخفيضات", "الصندوق", "مدة الخدمة", "الطقس"], analysisFailed: 'التحليل غير متاح', retryAnalysis: 'أعد المحاولة', invalidLimit: 'أدخل قيمة بين {min} و{max}.', integerOnly: 'يجب إدخال عدد صحيح.', settings: 'إعدادات العتبات', settingsIntro: 'لكل قاعدة عتباتها. القيم الأصلية تناسب معظم المحلات.', resetRule: 'استرجاع القيم الأصلية', alsoUsed: 'تُستعمل أيضا في: {names}.', usual: 'القيمة الأصلية: {value}', eyebrow: 'KIWI AI', title: 'ملخص الصباح', empty: 'لا توجد أمور عاجلة الآن.', calm: 'لا شيء عاجل', signalOne: 'إشارة واحدة', signalMany: '{n} إشارات',
      emptyNote: 'يراقب Kiwi فقط البيانات المقاسة لهذا المحل.', ask: 'عرض ملخص الصباح',
      coverage: 'أراقب الإشارات القابلة للقياس حاليا، من دون اختراع البيانات الناقصة.',
      coveredLabel: 'التغطية الحالية', covered: 'المبيعات · المخزون · الهامش · جدول العمل · التخفيضات · الإلغاءات · الصندوق · مدة الخدمة',
      waitingLabel: 'إشارات محجوبة', waiting: 'لا شيء',
      demo: 'يتفعل ملخص الصباح في محل حقيقي متصل. العرض التجريبي لا يصنع تنبيهات.',
      unsaved: 'لم يُحفظ على هذا الجهاز: تخزين المتصفح ممتلئ أو محظور. يرسله Kiwi إلى الخادم فور توفر الاتصال.',
      cloudFailed: 'لم يتم تأكيد النسخة السحابية. أعد المحاولة',
      handled: 'تمت المعالجة', dismiss: 'إخفاء', propose: 'اقتراح',
      wToday: 'اليوم', wTomorrow: 'غدا', wSource: 'الطقس من MET Norway',
      wKinds: { clear: 'صحو', cloudy: 'غائم', rain: 'مطر', storm: 'عاصفة رعدية', snow: 'ثلج', fog: 'ضباب' }
    }
  };

  function lang(wanted) {
    var v = String(wanted || document.documentElement?.lang || localStorage.getItem('kiwiLang') || 'fr').slice(0, 2);
    return COPY[v] ? v : 'fr';
  }
  function tr(wanted) { return COPY[lang(wanted)]; }
  function isReal() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); }
    catch (_) { return false; }
  }
  function tier() {
    try { return window.KiwiAgentTier ? window.KiwiAgentTier() : 'staff'; }
    catch (_) { return 'staff'; }
  }
  function slug() {
    try { return String(window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug ? window.KiwiCloudDoc.currentSlug() : ''); }
    catch (_) { return ''; }
  }
  function accountId() {
    try {
      var me = window.KiwiMe || {};
      var identity = window.KiwiIdentity || {};
      return String(me.accountId || me.id || identity.accountId || identity.id || 'session').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 96) || 'session';
    } catch (_) { return 'session'; }
  }
  function businessDay(now) {
    now = Number(now) || Date.now();
    try {
      var R = window.KiwiDayReport;
      if (R && R.businessDay) return String(R.businessDay(now));
      var cut = R && R.cutoff ? Number(R.cutoff()) : 5;
      var d = new Date(now - (isFinite(cut) ? cut : 5) * 3600000);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    } catch (_) { return new Date(now).toISOString().slice(0, 10); }
  }
  function scopeKey(now) { return [accountId(), slug(), businessDay(now)].join(':'); }
  function localKey(now) { return PREFIX + scopeKey(now); }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
  /* A store's briefing holds that store's days and nothing else: every path
   * in (local read, server pull, merge, write) goes through here, so a day
   * filed under another venue is dropped instead of carried. */
  // Stable tie-breaks make equal-clock local/cloud copies converge.

  /* The in-memory doc, reloaded if the venue changed since it was read. */

  /* La dernière écriture locale a-t-elle pris ? « Traité » ou « Masquer » sur
     un signal, c'est un choix du commerçant : si localStorage lève (quota
     plein, stockage refusé), la mémoire et la remontée serveur le gardent,
     mais un rechargement avant la synchronisation le perdrait. L'exception
     était avalée sans rien dire ; désormais la carte affiche une ligne
     « Non enregistré sur cet appareil » jusqu'à la prochaine écriture qui
     prend, durable() le lit, et « kiwi:local-save » le signale. */

  function unsavedNote(t) {
    var failed = false;
    try { failed = persistence.cloudFailed(); } catch (_) { console.warn("[briefing] unsavedNote failed"); }
    var note = failed ? '<button type="button" class="briefing-unsaved" data-briefing-cloud-retry>' + esc(t.cloudFailed) + '</button>' : '';
    return note + (persistence.durable() ? '' : '<p class="briefing-unsaved" role="status">' + esc(t.unsaved) + '</p>');
  }

  function normalizeEvidence(value) {
    if (!value || typeof value !== 'object') return null;
    var count = Number(value.count);
    var windowLabel = String(value.window || '').trim().slice(0, 120);
    var source = String(value.source || '').trim().slice(0, 120);
    if (!(Number.isFinite(count) && count >= 0 && windowLabel && source)) return null;
    var out = { count: count, window: windowLabel, source: source };
    if (value.text && typeof value.text === 'object') {
      var text = {};
      ['fr', 'en', 'ar'].forEach(function (L) { var v = String(value.text[L] || '').trim().slice(0, 400); if (v) text[L] = v; });
      if (Object.keys(text).length) out.text = text;
    }
    return out;
  }
  /* Le pied de preuve lisible : le nombre mesuré, la période et d'où vient le
   * chiffre, en mots du commerçant. `window` et `source` restent la trace
   * interne (et ce qu'affiche encore un appareil qui n'a pas cette version). */
  function said(count, win, src) {
    var out = {};
    ['fr', 'en', 'ar'].forEach(function (L) { out[L] = count + ' · ' + (typeof win === 'string' ? win : win[L]) + ' · ' + src[L]; });
    return out;
  }
  function evidenceText(line, wanted) {
    var e = line && line.evidence || {};
    return (e.text && e.text[lang(wanted)]) || (e.count + ' · ' + e.window + ' · ' + e.source);
  }
  function normalizeLine(value) {
    if (!value || typeof value !== 'object') return null;
    var evidence = normalizeEvidence(value.evidence);
    var id = String(value.id || '').trim().slice(0, 96);
    if (!id || !evidence) return null;
    var roles = Array.isArray(value.roles) ? value.roles.filter(function (x) { return /^(owner|manager|staff)$/.test(x); }) : [];
    return {
      id: id, kind: String(value.kind || '').slice(0, 40), tone: String(value.tone || 'neutral').slice(0, 20),
      copy: clone(value.copy) || {}, evidence: evidence, roles: roles.length ? roles : ['owner'],
      action: value.action ? clone(value.action) : null
    };
  }
  function salesRows() {
    try {
      var id = window.KiwiVenue && window.KiwiVenue.getVenue ? window.KiwiVenue.getVenue() : null;
      var rows = window.KiwiSales && window.KiwiSales.list ? window.KiwiSales.list(id) : null;
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }
  function dayBoundsAt(ts) {
    try {
      var R = window.KiwiDayReport;
      if (R && R.businessDay && R.dayBounds) {
        var b = R.dayBounds(R.businessDay(ts));
        if (b && isFinite(b.from) && isFinite(b.to)) return { from: +b.from, to: +b.to };
      }
    } catch (_) { console.warn("[briefing] dayBoundsAt failed"); }
    var cut = 5;
    try { cut = Number(window.KiwiDayReport && window.KiwiDayReport.cutoff ? window.KiwiDayReport.cutoff() : 5); } catch (_) { console.warn("[briefing] dayBoundsAt failed"); }
    if (!isFinite(cut)) cut = 5;
    var d = new Date(ts - cut * 3600000); d.setHours(0, 0, 0, 0);
    var from = d.getTime() + cut * 3600000;
    return { from: from, to: from + 86400000 };
  }

  /* Qui a fait le geste, en mots. La caisse enregistre l'identifiant de la
   * fiche équipe (remise : le responsable qui l'a validée ; annulation :
   * `staff:<id>`, `account:<id>` ou `operator:<id>`). « Acteur principal :
   * staff:7f3a… » ne disait rien au commerçant : on lit le NOM dans
   * KiwiTeam.roster(), qui ne porte ni code ni mot de passe. Une fiche qui
   * n'est plus dans l'équipe garde une référence courte, pour qu'on puisse la
   * retrouver sans afficher l'identifiant entier. */
  function roster() { try { return window.KiwiTeam && window.KiwiTeam.roster ? window.KiwiTeam.roster() : []; } catch (_) { return []; } }
  function actorName(id, list) { return rules.actorName(id, Array.isArray(list) ? list : roster()); }
  /* Le motif d'annulation, en mots. Sans motif saisi, le serveur enregistre
   * d'où vient l'annulation (functions/api/sale/cancel.js). */

  function salesDropRule(input) {
    input = input || {};
    var ready = input.backfillComplete;
    if (ready == null) {
      try {
        var status = window.KiwiLive && window.KiwiLive.status ? window.KiwiLive.status() : null;
        ready = !!(status && status.on && status.backfillComplete && status.merchant === slug());
      } catch (_) { ready = false; }
    }
    if (!ready) return null;
    var now = Number(input.now) || Date.now();
    var rows = Array.isArray(input.rows) ? input.rows : salesRows();
    return rules.salesDropRule(Object.assign({}, input, { now: now, rows: rows }));
  }
  function stockItems() {
    try {
      var rows = window.KiwiStockBriefing && window.KiwiStockBriefing.items ? window.KiwiStockBriefing.items() : null;
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }
  function marginErosionRule(input) {
    input = input || {};
    var D = window.KiwiDayReport, C = window.KiwiCost;
    var currentDay = input.currentDay, baselineDay = input.baselineDay;
    var current = input.current, baseline = input.baseline;
    if (!current || !baseline) {
      if (!D || typeof D.lastClosedDay !== 'function' || typeof D.shiftDay !== 'function'
        || typeof D.dayBounds !== 'function' || !C || typeof C.coverage !== 'function') return null;
      var currentBounds, baselineBounds, rows;
      try {
        currentDay = D.lastClosedDay();
        baselineDay = D.shiftDay(currentDay, -7);
        currentBounds = D.dayBounds(currentDay);
        baselineBounds = D.dayBounds(baselineDay);
        rows = window.KiwiSales && window.KiwiSales.list ? window.KiwiSales.list(venueId()) : [];
        if (!Array.isArray(rows)) return null;
        current = C.coverage(rows, currentBounds.from, currentBounds.to);
        baseline = C.coverage(rows, baselineBounds.from, baselineBounds.to);
      } catch (_) { return null; }
    }
    return rules.marginErosionRule(Object.assign({}, input, { currentDay: currentDay, baselineDay: baselineDay, current: current, baseline: baseline }));
  }

  function lowStockRule(input) {
    input = input || {};
    var items = Array.isArray(input.items) ? input.items : stockItems();
    if (!items.length) return null;
    return rules.lowStockRule(Object.assign({}, input, { items: items }));
  }

  function planningGapRule(input) {
    input = input || {};
    var day = input.day, plan = input.plan, periods = input.periods;
    if (!plan || !Array.isArray(periods)) {
      var D = window.KiwiDayReport, T = window.KiwiTeam, H = window.KiwiHours;
      if (!D || typeof D.today !== 'function' || !T || typeof T.planningDay !== 'function'
        || !H || typeof H.isConfigured !== 'function' || typeof H.periodsOn !== 'function') return null;
      try {
        day = D.today();
        var vid = venueId();
        if (!H.isConfigured(vid)) return null;
        plan = T.planningDay(day);
        periods = H.periodsOn(day, vid);
      } catch (_) { return null; }
    }
    return rules.planningGapRule(Object.assign({}, input, { day: day, plan: plan, periods: periods }));
  }
  /* Le seuil que la règle vient d'appliquer, réglage du commerçant compris. */
  function shareThreshold(L) {
    var share = num(limit('share'), L), multiple = num(limit('multiple'), L);
    return { fr: ' Seuil : au moins ' + share + ' % et ' + multiple + '× la référence.', en: ' Threshold: at least ' + share + '% and ' + multiple + '× baseline.', ar: ' العتبة: ' + share + '٪ على الأقل و' + multiple + '× المرجع.' }[L];
  }
  function cancellationRateRule(input) {
    input = input || {};
    var current = input.current, baselineRates = input.baselineRates, day = input.day;
    if (!current || !Array.isArray(baselineRates)) {
      var H = window.KiwiCancellationHistory, D = window.KiwiDayReport;
      if (!H || typeof H.ready !== 'function' || !H.ready() || typeof H.list !== 'function'
        || !D || typeof D.lastClosedDay !== 'function' || typeof D.dayBounds !== 'function' || typeof D.shiftDay !== 'function') return null;
      var events, rows;
      try { events = H.list(); rows = salesRows(); day = D.lastClosedDay(); } catch (_) { return null; }
      if (!Array.isArray(events) || !Array.isArray(rows)) return null;
      var stats = function (targetDay) {
        var bounds = D.dayBounds(targetDay);
        var cancelled = events.filter(function (event) { return +event.voidedAt >= bounds.from && +event.voidedAt < bounds.to; });
        var active = rows.filter(function (sale) { return +sale.ts >= bounds.from && +sale.ts < bounds.to; }).length;
        var reasons = Object.create(null), actors = Object.create(null);
        cancelled.forEach(function (event) {
          var key = String(event.reason || 'non-renseigne'); reasons[key] = (reasons[key] || 0) + 1;
          if (event.actorId) actors[event.actorId] = (actors[event.actorId] || 0) + 1;
        });
        return { cancellations: cancelled.length, total: active + cancelled.length, reasons: reasons, actors: actors };
      };
      current = stats(day); baselineRates = [];
      for (var i = 1; i <= 4; i += 1) {
        var comparable = stats(D.shiftDay(day, -7 * i));
        if (comparable.total > 0) baselineRates.push((comparable.cancellations / comparable.total) * 100);
      }
    }
    return rules.cancellationRateRule(Object.assign({}, input, { current: current, baselineRates: baselineRates, day: day, roster: Array.isArray(input.roster) ? input.roster : roster() }));
  }
  function discountShareRule(input) {
    input = input || {};
    var current = input.current, baselineShares = input.baselineShares, day = input.day;
    if (!current || !Array.isArray(baselineShares)) {
      var ready = input.backfillComplete;
      if (ready == null) {
        try { var live = window.KiwiLive && window.KiwiLive.status ? window.KiwiLive.status() : null; ready = !!(live && live.on && live.backfillComplete && live.merchant === slug()); }
        catch (_) { ready = false; }
      }
      var D = window.KiwiDayReport;
      if (!ready || !D || typeof D.lastClosedDay !== 'function' || typeof D.dayBounds !== 'function' || typeof D.shiftDay !== 'function') return null;
      var rows = salesRows(); day = D.lastClosedDay();
      var stats = function (targetDay) {
        var bounds = D.dayBounds(targetDay), gross = 0, discount = 0, discountedCount = 0, actors = Object.create(null);
        rows.forEach(function (sale) {
          if (!(+sale.ts >= bounds.from && +sale.ts < bounds.to)) return;
          var net = sale.amountCents != null ? +sale.amountCents : Math.round((+sale.amount || 0) * 100);
          var saleGross = sale.grossAmountCents != null ? +sale.grossAmountCents : net;
          if (!(saleGross > 0)) return;
          gross += saleGross;
          var cut = +sale.discountAmountCents || 0;
          if (cut > 0 && cut <= saleGross && sale.actorId) {
            discount += cut; discountedCount += 1;
            actors[sale.actorId] = (actors[sale.actorId] || 0) + cut;
          }
        });
        return { gross: gross, discount: discount, discountedCount: discountedCount, actors: actors };
      };
      current = stats(day); baselineShares = [];
      for (var i = 1; i <= 4; i += 1) {
        var comparable = stats(D.shiftDay(day, -7 * i));
        if (comparable.gross > 0) baselineShares.push((comparable.discount / comparable.gross) * 100);
      }
    }
    return rules.discountShareRule(Object.assign({}, input, { current: current, baselineShares: baselineShares, day: day, roster: Array.isArray(input.roster) ? input.roster : roster() }));
  }

  function cashGapRule(input) {
    input = input || {};
    var C = window.KiwiCashSessions;
    var sourceReady = input.ready;
    if (sourceReady == null) sourceReady = !!(C && C.ready && C.ready());
    if (!sourceReady) return null;
    var rows = Array.isArray(input.events) ? input.events : (C && C.list ? C.list() : []);
    var wantedMerchant = String(input.merchant == null ? slug() : input.merchant);
    var day = String(input.day || businessDay(Date.now() - 86400000));
    var threshold = Number(input.thresholdCents == null ? limit('cashCents') : input.thresholdCents);
    var dayOf = typeof input.businessDay === 'function' ? input.businessDay : businessDay;
    return rules.cashGapRule(Object.assign({}, input, { rows: rows, wantedMerchant: wantedMerchant, day: day, threshold: threshold, dayOf: dayOf }));
  }

  /* ── LA PLUIE, MESURÉE SUR CE COMMERCE ─────────────────────────────────────
   * Une ligne seulement quand deux choses sont vraies ensemble : la pluie est
   * annoncée (aujourd'hui ou demain, MET Norway) ET le carnet du commerce a
   * assez de jours de pluie et de jours secs pour dire ce qu'elle lui fait
   * (KiwiWeather.rainEffect). Un écart de moins de 8 % ne mérite pas une ligne.
   * Pas de conseil inventé : le chiffre, et sur combien de jours il repose. */
  function weatherRule(input) {
    input = input || {};
    var W = window.KiwiWeather;
    var data = input.weather !== undefined ? input.weather : (W && W.cached ? W.cached() : null);
    if (!data || !data.ok || !Array.isArray(data.days) || !data.log) return null;
    var today = input.today || businessDay(input.now);
    var target = data.days.find(function (d) { return d && d.day >= today && W && (limit('rainMm') === 1 ? W.isRain(d) : (Number(d.precip) || 0) >= limit('rainMm') || d.kind === 'storm'); });
    if (!target) return null;
    var effect = W.rainEffect(Array.isArray(input.rows) ? input.rows : salesRows(), data.log, { today: today, minDays: limit('weatherDays') });
    return rules.weatherRule(Object.assign({}, input, { effect: effect, target: target, today: today, data: data }));
  }
  /* La prévision, dans l'en-tête du point du matin : aujourd'hui et demain. */
  var WEATHER_ICON = { clear: 'light_mode', cloudy: 'thermometer', fog: 'thermometer', rain: 'water_drop', storm: 'bolt', snow: 'ac_unit' };
  function weatherChip(t) {
    var W = window.KiwiWeather, data = W && W.cached ? W.cached() : null;
    if (!data || !data.ok || !Array.isArray(data.days) || !data.days.length) return '';
    var today = businessDay();
    var show = data.days.filter(function (d) { return d && d.day >= today; }).slice(0, 2);
    if (!show.length) return '';
    var L = lang();
    var part = function (d) {
      var when = d.day === today ? t.wToday : t.wTomorrow;
      var rain = (Number(d.precip) || 0) >= 1 ? ' <bdi>' + esc((L === 'en' ? String(d.precip) : String(d.precip).replace('.', ',')) + (L === 'ar' ? ' مم' : ' mm')) + '</bdi>' : '';
      var temp = (d.tmin != null && d.tmax != null) ? ' · <bdi>' + d.tmin + '–' + d.tmax + ' °C</bdi>' : '';
      return '<span class="briefing-wx-day"><i data-icon="' + (WEATHER_ICON[d.kind] || 'thermometer') + '" aria-hidden="true"></i>' + esc(when) + (L === 'fr' ? ' : ' : ': ') + esc((t.wKinds && t.wKinds[d.kind]) || '') + rain + temp + '</span>';
    };
    return '<span class="briefing-weather" title="' + esc(t.wSource + ' · ' + data.city) + '">' + show.map(part).join('') + '<small>' + esc(t.wSource) + '</small></span>';
  }
  function lateOrdersRule(input) {
    input = input || {};
    var O = window.KiwiOrderCourse;
    var sourceReady = input.ready;
    if (sourceReady == null) sourceReady = !!(O && O.ready && O.ready());
    if (!sourceReady) return null;
    var rows = Array.isArray(input.orders) ? input.orders : (O && O.list ? O.list() : []);
    var wantedMerchant = String(input.merchant == null ? slug() : input.merchant);
    var day = String(input.day || businessDay(Date.now() - 86400000));
    var dayOf = typeof input.businessDay === 'function' ? input.businessDay : businessDay;
    var dayMs = Number(input.dayMs) || 86400000;
    var end = Number(input.endAt) || Date.now();
    return rules.lateOrdersRule(Object.assign({}, input, { rows: rows, wantedMerchant: wantedMerchant, day: day, dayOf: dayOf, dayMs: dayMs, end: end }));
  }
  function visibleLines(lines, role) {
    role = role || tier();
    return (Array.isArray(lines) ? lines : []).filter(function (line) {
      return line && Array.isArray(line.roles) && line.roles.indexOf(role) !== -1;
    });
  }
  function current() {
    var id = scopeKey();
    return own().days.find(function (x) { return x.id === id; }) || null;
  }

  function compute(rules) {
    if (!isReal() || !slug()) return null;
    var lines = [], unavailable = [];
    (rules || RULES).forEach(function (rule, index) {
      try {
        var result = typeof rule === 'function' ? rule() : null;
        (Array.isArray(result) ? result : [result]).forEach(function (candidate) {
          var line = normalizeLine(candidate);
          if (line) lines.push(thresholdEvidence(line));
        });
      } catch (_) { unavailable.push(rule.name || 'rule-' + (index + 1)); }
    });
    var now = Date.now(), id = scopeKey(now), old = current();
    var row = {
      id: id, accountId: accountId(), venue: slug(), day: businessDay(now), generatedAt: now,
      updatedAt: now, lines: lines, unavailable: unavailable, dismissed: clone(old && old.dismissed) || {}, handled: clone(old && old.handled) || {}
    };
    var doc = own();
    doc.days = [row].concat(own().days.filter(function (x) { return x.id !== id; }));
    save();
    return row;
  }
  function setState(lineId, field) {
    var row = current();
    if (!row || !lineId || (field !== 'dismissed' && field !== 'handled')) return false;
    row[field] = row[field] && typeof row[field] === 'object' ? row[field] : {};
    row[field][lineId] = Date.now(); row.updatedAt = Date.now(); save(); return true;
  }
  function activeLines(role) {
    var row = current();
    if (!row) return [];
    return visibleLines(row.lines, role).filter(function (x) { return !(row.dismissed && row.dismissed[x.id]) && !(row.handled && row.handled[x.id]); });
  }
  function openPlanning() {
    var open = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['nav-payroll'];
    if (typeof open !== 'function') return { ok: false, reason: 'unavailable' };
    open();
    return { ok: true, opened: 'planning' };
  }
  function proposeLine(id) {
    var line = activeLines(tier()).find(function (x) { return x.id === id; });
    if (!line || !line.action) return { ok: false, reason: 'unavailable' };
    if (line.action.name === 'open-planning') return openPlanning();
    if (!window.KiwiAgentActions || typeof window.KiwiAgentActions.request !== 'function') return { ok: false, reason: 'unavailable' };
    var args = clone(line.action.args) || {};
    args.commandId = ('briefing-' + line.id).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 60);
    args.said = lineText(line, 'fr');
    var result = window.KiwiAgentActions.request(line.action.name, args);
    if (result && result.confirmationRequired) {
      try { if (window.KiwiActionCenter && window.KiwiActionCenter.open) window.KiwiActionCenter.open(); } catch (_) { console.warn("[briefing] proposeLine failed"); }
    }
    return result || { ok: false, reason: 'refused' };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); }
  function lineText(line, wanted) {
    var c = line && line.copy || {};
    return String(c[lang(wanted)] || c.fr || c.en || '');
  }
  /* Point d'ancrage du point du matin. Il vit DANS la carte Kiwi Insights
   * (.hero-right : « Recommandations du jour »), juste avant les puces de
   * questions — les deux servaient le même propos et occupaient deux cartes.
   * La peau Vexel déplace .hero-right entière dans .vexel-insights-row : le
   * bloc la suit. Repli (sans .hero-right) : après .hero-today, jamais dans
   * .vexel-revenue-row — rangée flex à hauteur fixe qui faisait déborder tout
   * l'accueil (2026-08-21). Recalculé à chaque rendu. */
  function anchor() {
    var chips = document.querySelector('.hero-right .hai-chips');
    if (chips && chips.parentNode) return { parent: chips.parentNode, before: chips };
    var hero = document.querySelector('.hero-today');
    if (!hero || !hero.parentNode) return null;
    var row = hero.closest('.vexel-revenue-row');
    if (row && row.parentNode) return { parent: row.parentNode, before: row.nextSibling };
    return { parent: hero.parentNode, before: hero.nextSibling };
  }
  function place(el) {
    var at = anchor(); if (!at) return false;
    if (el.parentNode !== at.parent || el.nextSibling !== at.before) at.parent.insertBefore(el, at.before);
    return true;
  }
  function card() {
    var el = document.querySelector('[data-briefing-card]');
    if (!el && !isReal()) return null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'briefing-inline'; el.setAttribute('data-briefing-card', '');
    }
    if (!place(el)) return el.parentNode ? el : null;
    return el;
  }
  function installStyle() {
    if (document.querySelector('[data-briefing-style]')) return;
    var s = document.createElement('style'); s.setAttribute('data-briefing-style', '');
    s.textContent = [
      /* Section « point du matin » dans la carte Kiwi Insights : filet, kicker mono, liste de signaux. */
      '.briefing-inline{display:flex;flex-direction:column;gap:10px;margin:4px 0 2px;padding-top:16px;border-top:1px solid var(--n-200)}',
      '.briefing-kicker{display:flex;align-items:center;gap:10px;font:600 10.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--atlas)}',
      /* La prévision : texte courant (pas le kicker mono), poussée à droite, repliée sous le titre sur étroit. */
      '.briefing-kicker{flex-wrap:wrap;row-gap:6px}',
      '.briefing-weather{margin-inline-start:auto;display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 12px;font:500 12px/1.3 var(--sans);letter-spacing:0;text-transform:none;color:var(--n-700)}',
      '.briefing-wx-day{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}',
      '.briefing-wx-day svg,.briefing-wx-day i{width:15px;height:15px;color:var(--atlas);flex:0 0 15px}',
      '.briefing-weather small{font:500 10px/1 var(--sans);color:var(--n-500)}',
      '.briefing-kicker small{font:500 10.5px/1 var(--mono);letter-spacing:.06em;text-transform:none;color:var(--n-500)}',
      /* Une ligne = un signal : marqueur, titre, preuve, actions. Grille 1fr/auto sur large, empilée sur étroit. */
      '.briefing-line{display:grid;grid-template-columns:1fr auto;gap:6px 18px;align-items:center;padding:12px 14px 12px 16px;border:1px solid var(--n-200);border-radius:14px;background:color-mix(in srgb,var(--atlas) 5%,transparent);position:relative;animation:briefing-in .32s cubic-bezier(.2,.7,.2,1) both}',
      '.briefing-line:nth-child(3){animation-delay:.05s}.briefing-line:nth-child(4){animation-delay:.1s}.briefing-line:nth-child(5){animation-delay:.15s}',
      '.briefing-line::before{content:"";position:absolute;inset-inline-start:-1px;top:14px;bottom:14px;width:3px;border-radius:3px;background:var(--atlas)}',
      '.briefing-line .hai-rec-title{font-size:14px;font-weight:600;line-height:1.35;letter-spacing:-.005em}',
      '.briefing-evidence{grid-column:1;font:500 10.5px/1.4 var(--mono);letter-spacing:.02em;color:var(--n-500)}',
      '.briefing-actions{grid-column:2;grid-row:1/span 2;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}',
      '.briefing-actions button{border:1px solid var(--n-300);background:transparent;color:var(--n-600);border-radius:999px;padding:7px 12px;font:600 11.5px/1 var(--sans);letter-spacing:-.005em;cursor:pointer;transition:border-color .14s ease,color .14s ease,background .14s ease,transform .09s ease}',
      '.briefing-actions button:hover{border-color:var(--atlas);color:var(--atlas)}.briefing-actions button:active{transform:translateY(1px)}',
      '.briefing-actions button[data-briefing-propose]{background:var(--atlas);border-color:var(--atlas);color:var(--paper)}',
      '.briefing-actions button[data-briefing-propose]:hover{background:var(--riad);border-color:var(--riad);color:var(--paper)}',
      /* État calme : une seule rangée feutrée, sans bordure ni marqueur plein. */
      '.briefing-empty{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;padding:2px 0 0}',
      '.briefing-empty::before{content:"";width:8px;height:8px;border-radius:50%;border:1.5px solid var(--mint);align-self:center;flex:none}',
      '.briefing-empty .hai-rec-title{font-size:14px;font-weight:600}.briefing-empty .hai-rec-obs{margin:0;font-size:13px;color:var(--n-500)}',
      /* Badge d’état en tête de carte, aligné sur l’œil-de-bœuf KIWI INSIGHTS. */
      '.briefing-status{position:absolute;top:0;inset-inline-end:0;display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;border:1px solid var(--n-200);font:600 11px/1 var(--sans);letter-spacing:-.005em;color:var(--n-600);background:transparent;white-space:nowrap}',
      '.briefing-status::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 0 3px color-mix(in srgb,var(--mint) 22%,transparent)}',
      '.briefing-status.is-alert{color:var(--atlas);border-color:color-mix(in srgb,var(--atlas) 40%,transparent);background:color-mix(in srgb,var(--atlas) 7%,transparent)}',
      '.briefing-status.is-alert::before{background:var(--atlas);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 18%,transparent)}',
      /* Réglages : un pavé par règle, un champ = nom, saisie, une phrase d'aide. */
      '.briefing-settings,.briefing-rule{font:500 12.5px/1.4 var(--sans);color:var(--n-700)}',
      '.briefing-settings>summary,.briefing-rule>summary{cursor:pointer;font-weight:600;color:var(--n-600)}',
      '.briefing-rule{margin-top:8px;padding:8px 12px;border:1px solid var(--n-200);border-radius:12px}',
      '.briefing-set-intro{margin:8px 0 0;color:var(--n-500)}',
      '.briefing-set-field{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:center;padding:8px 0;border-top:1px solid var(--n-200)}',
      '.briefing-set-name{font-weight:600;color:var(--n-700)}',
      '.briefing-set-field input{width:7.5em;padding:6px 8px;border:1px solid var(--n-300);border-radius:8px;background:transparent;color:inherit;font:inherit}',
      '.briefing-set-field input[aria-invalid="true"]{border-color:var(--atlas)}',
      '.briefing-set-help,.briefing-set-error{grid-column:1/-1;font:500 11.5px/1.4 var(--sans);color:var(--n-500)}',
      '.briefing-set-error:empty{display:none}',
      '.briefing-reset{margin-top:8px;border:1px solid var(--n-300);background:transparent;color:var(--n-600);border-radius:999px;padding:7px 12px;font:600 11.5px/1 var(--sans);cursor:pointer}',
      '.briefing-reset:hover:not(:disabled){border-color:var(--atlas);color:var(--atlas)}.briefing-reset:disabled{opacity:.5;cursor:default}',
      /* Rien n'a pris sur cet appareil : une ligne posée, pas une alerte rouge. */
      '.briefing-unsaved{margin:0;font:500 12px/1.4 var(--sans);color:var(--n-600)}',
      '@keyframes briefing-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
      '@media (max-width:720px){.briefing-line{grid-template-columns:1fr}.briefing-actions{grid-column:1;grid-row:auto;justify-content:flex-start;margin-top:4px}.briefing-status{position:static;align-self:flex-start;margin-top:-6px}}',
      '@media (prefers-reduced-motion:reduce){.briefing-line{animation:none}}'
    ].join('');
    document.head.appendChild(s);
  }
  function statusBadge(el, t, n) {
    var host = el.closest && el.closest('.hero-right'); if (!host) return;
    var b = host.querySelector('[data-briefing-status]');
    if (!b) { b = document.createElement('span'); b.className = 'briefing-status'; b.setAttribute('data-briefing-status', ''); host.appendChild(b); }
    var label = current() && current().unavailable && current().unavailable.length ? t.analysisFailed : n ? (n === 1 ? t.signalOne : t.signalMany.replace('{n}', String(n))) : t.calm;
    if (b.textContent !== label) b.textContent = label;
    b.classList.toggle('is-alert', n > 0);
  }
  function dayLabel() {
    try {
      var d = businessDay(), L = lang(), loc = L === 'ar' ? 'ar-MA' : (L === 'en' ? 'en-GB' : 'fr-FR');
      return new Date(d + 'T12:00:00').toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (_) { return ''; }
  }
  function render() {
    var el = card(); if (!el) return;
    var t = tr(), lines = activeLines(tier());
    var body = lines.length ? lines.map(function (line) {
      return '<article class="briefing-line"><div class="hai-rec-title">' + esc(lineText(line)) + '</div><div class="briefing-evidence">' +
        esc(evidenceText(line)) + '</div><div class="briefing-actions">' + (line.action ? '<button data-briefing-propose="' + esc(line.id) + '">' + esc(t.propose) + '</button>' : '') + '<button data-briefing-handled="' + esc(line.id) + '">' + esc(t.handled) + '</button><button data-briefing-dismiss="' + esc(line.id) + '">' + esc(t.dismiss) + '</button></div></article>';
    }).join('') : '<div class="briefing-empty"><div class="hai-rec-title">' + esc(t.empty) + '</div><div class="hai-rec-obs">' + esc(t.emptyNote) + '</div></div>';
    var failed = current() && current().unavailable || [];
    if (failed.length) {
      var warning = '<div role="alert">' + esc(t.analysisFailed) + ' · ' + esc(failed.map(function (name) { var index = RULES.findIndex(function (rule) { return rule.name === name; }); return t.ruleNames[index] || t.analysisFailed; }).join(', ')) + ' <button type="button" data-briefing-analysis-retry>' + esc(t.retryAnalysis) + '</button></div>';
      body = warning + (lines.length ? body : '');
    }
    var day = dayLabel();
    el.innerHTML = '<div class="briefing-kicker">' + esc(t.title) + (day ? '<small>' + esc(day) + '</small>' : '') + weatherChip(t) + '</div>' + body + settingsHtml() + unsavedNote(t);
    try { if (el.querySelector('[data-icon]') && window.lucide && window.lucide.createIcons) window.lucide.createIcons(); } catch (_) { console.warn("[briefing] render failed"); }
    statusBadge(el, t, lines.length);
  }
  function mode(raw) {
    var q = String(raw || '').toLowerCase();
    try { q = q.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) { console.warn("[briefing] mode failed"); }
    if (/surveill|monitor|watch|coverage|couverture|katra9eb|كتراقب|تراقب/.test(q)) return 'coverage';
    if (/point du matin|morning brief|morning point|brief du matin|ملخص الصباح|نقطة الصباح|point dyal sbah|nokta dyal sbah|chno khasni n3ref lyoum|شنو خاصني نعرف اليوم/.test(q)) return 'briefing';
    return '';
  }
  function canHandle(raw) { return !!mode(raw); }
  function reply(raw, opts) {
    var t = tr(opts && opts.lang), wanted = mode(raw);
    if (!isReal()) return { text: t.demo };
    if (wanted === 'coverage') return { text: t.coverage, stats: [{ l: t.coveredLabel, v: t.covered, h: '' }, { l: t.waitingLabel, v: t.waiting, h: '' }] };
    var lines = activeLines((opts && opts.role) || tier());
    var failed = current() && current().unavailable || [];
    if (failed.length) return { text: t.analysisFailed + ' · ' + failed.map(function (name) { var index = RULES.findIndex(function (rule) { return rule.name === name; }); return t.ruleNames[index] || t.analysisFailed; }).join(', ') };
    if (!lines.length) return { text: '<b>' + t.empty + '</b> ' + t.emptyNote };
    return { text: '<b>' + t.title + '</b>', stats: lines.map(function (line) { return { l: line.kind || t.title, v: lineText(line, opts && opts.lang), h: evidenceText(line, opts && opts.lang) }; }) };
  }

  function retryCloud() { return save(); }
  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('[data-briefing-cloud-retry]')) retryCloud();
  });
  function boot() {
    installStyle();
    if (!isReal()) return;
    persistence.reload(); attachCloud();
    Promise.resolve(persistence.bind()).catch(function () { console.warn("[briefing] boot failed"); }).then(function () { compute(); });
    try { if (window.KiwiVenue && window.KiwiVenue.subscribe) window.KiwiVenue.subscribe(function () { persistence.reload(); attachCloud(); compute(); }); } catch (_) { console.warn("[briefing] boot failed"); }
    window.addEventListener('kiwi:langchange', function () { render(); });
    window.addEventListener('kiwi:cancellation-history', function () { compute(); });
    window.addEventListener('kiwi:cash-sessions', function () { compute(); });
    window.addEventListener('kiwi:order-course', function () { compute(); });
    window.addEventListener('kiwi:weather', function () { compute(); });
    try { if (window.KiwiWeather) window.KiwiWeather.load(); } catch (_) { console.warn("[briefing] boot failed"); }
    try { if (window.KiwiVenue && window.KiwiVenue.subscribe) window.KiwiVenue.subscribe(function () { if (window.KiwiWeather) window.KiwiWeather.load(); }); } catch (_) { console.warn("[briefing] boot failed"); }
    document.addEventListener('kiwi:live-backfill-complete', function (event) {
      if (!event.detail || event.detail.merchant === slug()) compute();
    });
  }
  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('[data-briefing-analysis-retry]')) compute();
    var handled = event.target.closest && event.target.closest('[data-briefing-handled]');
    var dismissed = event.target.closest && event.target.closest('[data-briefing-dismiss]');
    var proposed = event.target.closest && event.target.closest('[data-briefing-propose]');
    var reset = event.target.closest && event.target.closest('[data-briefing-reset]');
    if (reset && !reset.disabled) resetRule(Number(reset.getAttribute('data-briefing-reset')));
    if (proposed) proposeLine(proposed.getAttribute('data-briefing-propose'));
    if (handled) setState(handled.getAttribute('data-briefing-handled'), 'handled');
    if (dismissed) setState(dismissed.getAttribute('data-briefing-dismiss'), 'dismissed');
  });

  /* « toggle » ne remonte pas : on l'écoute à la capture pour retenir ce qui est ouvert. */
  document.addEventListener('toggle', function (event) {
    var box = event.target, key = box && box.getAttribute && box.getAttribute('data-briefing-open');
    if (key) openState[key] = !!box.open;
  }, true);

  document.addEventListener('change', function (event) {
    var input = event.target;
    if (!input.getAttribute || !input.getAttribute('data-briefing-limit')) return;
    var value = {}, key = input.getAttribute('data-briefing-limit'), scale = SCALE[key] || 1;
    var typed = input.value.trim() === '' ? NaN : Number(input.value) * scale;
    /* Un réglage en dirhams s'arrête au centime : 1,234 MAD est refusé, pas arrondi en silence. */
    value[key] = scale > 1 && Math.abs(typed - Math.round(typed)) > 1e-6 ? NaN : scale > 1 ? Math.round(typed) : typed;
    var ok = setSettings(value);
    input.setAttribute('aria-invalid', String(!ok));
    var message = document.getElementById(input.getAttribute('data-briefing-error') || 'briefing-error-' + key);
    if (message) message.textContent = ok ? '' : [tr().invalidLimit.replace('{min}', num(shown(key, LIMITS[key][1]), lang())).replace('{max}', num(shown(key, LIMITS[key][2]), lang())), integerLimit(key) && !SCALE[key] ? tr().integerOnly : ''].filter(Boolean).join(' ');
  });
  window.KiwiBriefing = {
    setSettings: setSettings, resetRule: resetRule, settings: function () { return clone(own().settings || {}); },
    canHandle: canHandle, reply: reply, compute: function () { return compute(); }, lines: activeLines,
    dismiss: function (id) { return setState(id, 'dismissed'); }, handled: function (id) { return setState(id, 'handled'); },
    durable: function () { return persistence.durable(); },
    _test: { save: save, retryCloud: retryCloud, unsavedNote: unsavedNote, copy: function () { return tr(); }, businessDay: businessDay, scopeKey: scopeKey, normalizeLine: normalizeLine, visibleLines: visibleLines, salesDropRule: salesDropRule, lowStockRule: lowStockRule, marginErosionRule: marginErosionRule, planningGapRule: planningGapRule, cancellationRateRule: cancellationRateRule, discountShareRule: discountShareRule, actorName: actorName, cashGapRule: cashGapRule, lateOrdersRule: lateOrdersRule, weatherRule: weatherRule, weatherChip: weatherChip, stockItems: stockItems, proposeLine: proposeLine, openPlanning: openPlanning, salesRows: salesRows, dayBoundsAt: dayBoundsAt, compute: compute, anchor: anchor, place: place, card: card, render: render, read: function () { return clone(own()); }, write: writeLocal, mergeDocs: mergeDocs }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}());
