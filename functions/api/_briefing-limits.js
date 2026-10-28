/* Les seuils du point du matin : UNE seule table, lue des deux côtés.
 *
 *   - le serveur (functions/api/_briefing-settings.js) en tire les bornes qu'il
 *     applique avant de ranger un réglage ;
 *   - le navigateur (assets/briefing.js) en reçoit une copie GÉNÉRÉE entre les
 *     repères « briefing-limits:begin / end » : `node tools/build-briefing-limits.mjs`
 *     la réécrit, `--check` (tools/briefing-limits-test.mjs) refuse une copie
 *     qui n'est plus celle-ci. On ne modifie donc plus un seuil à deux endroits.
 *
 * Par champ : value = réglage d'usine, min/max = bornes acceptées, integer =
 * entier exigé, label = nom court (réglages ET pied de preuve des cartes),
 * help = une phrase en mots simples pour le réglage. Les trois textes vont
 * dans l'ordre fr, en, ar. L'écart de caisse reste rangé en centimes.
 *
 * Par règle (GROUPS, dans l'ordre de RULES dans assets/briefing.js : ventes,
 * stock, marge, planning, annulations, remises, caisse, délais, météo) : les
 * champs que cette règle lit. Un champ lu par deux règles (samples, share,
 * multiple, events) figure dans les deux groupes. */
export const BRIEFING_FIELDS = {
  salesDrop: {
    value: 20, min: 1, max: 100,
    label: ['Baisse des ventes (%)', 'Sales drop (%)', 'انخفاض المبيعات (%)'],
    help: ['Alerte quand les ventes du jour sont inférieures d’autant à celles des mêmes jours des semaines passées.', 'Alerts when today’s sales are this far below the same weekdays in past weeks.', 'تنبيه عندما تقل مبيعات اليوم بهذه النسبة عن نفس الأيام في الأسابيع الماضية.'],
  },
  stockFactor: {
    value: 1, min: 0.1, max: 10,
    label: ['Multiplicateur du seuil stock', 'Stock threshold multiplier', 'مضاعف عتبة المخزون'],
    help: ['1 alerte quand un article atteint son seuil minimum ; 2 alerte deux fois plus tôt.', '1 alerts when an item reaches its minimum level; 2 alerts twice as early.', '1 ينبه عند بلوغ الحد الأدنى للمنتج، و2 ينبه أبكر بمرتين.'],
  },
  marginDrop: {
    value: 5, min: 0.1, max: 100,
    label: ['Baisse de marge (points)', 'Margin drop (points)', 'انخفاض الهامش (نقاط)'],
    help: ['Alerte quand la marge brute perd autant de points par rapport à d’habitude.', 'Alerts when gross margin loses this many points compared with usual.', 'تنبيه عندما يفقد الهامش الإجمالي هذا العدد من النقاط مقارنة بالمعتاد.'],
  },
  coverage: {
    value: 80, min: 1, max: 100,
    label: ['Couverture minimale (%)', 'Minimum coverage (%)', 'الحد الأدنى للتغطية (%)'],
    help: ['Part des ventes dont le coût d’achat est connu. En dessous, Kiwi ne juge pas la marge.', 'Share of sales whose purchase cost is known. Below it, Kiwi does not judge the margin.', 'نسبة المبيعات المعروفة التكلفة. دون ذلك لا يحكم Kiwi على الهامش.'],
  },
  coverageGap: {
    value: 10, min: 0, max: 100,
    label: ['Écart de couverture (%)', 'Coverage gap (%)', 'فرق التغطية (%)'],
    help: ['Si la part de coûts connus change trop entre aujourd’hui et d’habitude, la comparaison est ignorée.', 'If the share of known costs differs too much from usual, the comparison is skipped.', 'إذا اختلفت نسبة التكاليف المعروفة كثيرا عن المعتاد، يتم تجاهل المقارنة.'],
  },
  samples: {
    value: 3, min: 1, max: 4, integer: true,
    label: ['Repères minimum', 'Minimum reference points', 'الحد الأدنى للمراجع'],
    help: ['Repères exigés avant d’alerter : semaines comparables (ventes, annulations, remises) ou commandes du jour (délais). De 1 à 4.', 'Reference points required before alerting: comparable weeks (sales, cancellations, discounts) or today’s orders (timing). From 1 to 4.', 'عدد المراجع المطلوبة قبل التنبيه: أسابيع قابلة للمقارنة (المبيعات، الإلغاءات، التخفيضات) أو طلبات اليوم (المدد). من 1 إلى 4.'],
  },
  events: {
    value: 2, min: 1, max: 100, integer: true,
    label: ['Cas minimum dans la journée', 'Minimum cases in the day', 'الحد الأدنى للحالات في اليوم'],
    help: ['Nombre d’annulations (ou de ventes remisées) à atteindre aujourd’hui avant d’alerter.', 'Number of cancellations (or discounted sales) to reach today before alerting.', 'عدد الإلغاءات (أو المبيعات المخفضة) المطلوب بلوغه اليوم قبل التنبيه.'],
  },
  share: {
    value: 5, min: 0.1, max: 100,
    label: ['Part d’alerte (%)', 'Alert share (%)', 'نسبة التنبيه (%)'],
    help: ['Kiwi ne parle jamais sous cette part du chiffre, même si c’est plus que d’habitude.', 'Kiwi never speaks below this share of sales, even if it is above usual.', 'لا ينبه Kiwi دون هذه النسبة من المبيعات حتى لو تجاوزت المعتاد.'],
  },
  multiple: {
    value: 2, min: 1, max: 10,
    label: ['Fois la normale', 'Times the usual', 'مرات المعتاد'],
    help: ['Alerte quand la part du jour atteint ce multiple de votre part habituelle.', 'Alerts when today’s share reaches this multiple of your usual share.', 'تنبيه عندما تبلغ نسبة اليوم هذا المضاعف من نسبتك المعتادة.'],
  },
  cashCents: {
    value: 10000, min: 1, max: 10000000, integer: true,
    label: ['Écart de caisse (MAD)', 'Cash gap (MAD)', 'فرق الصندوق (درهم)'],
    help: ['Un écart à la clôture de caisse au-delà de ce montant, en plus ou en moins, déclenche l’alerte.', 'A gap at register close beyond this amount, over or short, triggers the alert.', 'فرق عند إغلاق الصندوق يتجاوز هذا المبلغ، زيادة أو نقصانا، يطلق التنبيه.'],
  },
  weatherEffect: {
    value: 8, min: 1, max: 100,
    label: ['Effet météo (%)', 'Weather effect (%)', 'تأثير الطقس (%)'],
    help: ['Alerte quand la pluie a déjà changé vos ventes d’au moins ce pourcentage.', 'Alerts when rain has already moved your sales by at least this percentage.', 'تنبيه عندما غيّر المطر مبيعاتك سابقا بهذه النسبة على الأقل.'],
  },
  lateMultiple: {
    value: 1.5, min: 1, max: 10,
    label: ['Délai : fois la normale', 'Timing: times the usual', 'المدة: مرات المعتاد'],
    help: ['Alerte quand le délai du jour atteint ce multiple de votre délai habituel.', 'Alerts when today’s wait reaches this multiple of your usual wait.', 'تنبيه عندما تبلغ مدة اليوم هذا المضاعف من مدتك المعتادة.'],
  },
  lateMinutes: {
    value: 5, min: 1, max: 240,
    label: ['Retard (minutes)', 'Delay (minutes)', 'التأخير (دقائق)'],
    help: ['Et le délai doit aussi s’allonger d’au moins ce nombre de minutes, pour ignorer les petits écarts.', 'The wait must also grow by at least this many minutes, to ignore small gaps.', 'ويجب أيضا أن تطول المدة بهذا العدد من الدقائق على الأقل لتجاهل الفروق الصغيرة.'],
  },
  lateSamples: {
    value: 5, min: 1, max: 100, integer: true,
    label: ['Commandes de référence (min.)', 'Reference orders (min.)', 'الطلبات المرجعية (الحد الأدنى)'],
    help: ['Nombre de commandes passées nécessaires pour connaître votre délai habituel.', 'Number of past orders needed to know your usual wait.', 'عدد الطلبات السابقة اللازمة لمعرفة مدتك المعتادة.'],
  },
  planningMinutes: {
    value: 1, min: 1, max: 1440, integer: true,
    label: ['Absence de couverture (minutes)', 'Uncovered period (minutes)', 'فترة بدون تغطية (دقائق)'],
    help: ['Alerte quand le planning laisse l’établissement sans personne au moins cette durée pendant l’ouverture.', 'Alerts when the schedule leaves the venue unstaffed for at least this long while open.', 'تنبيه عندما يترك الجدول المحل بلا أحد هذه المدة على الأقل أثناء الفتح.'],
  },
  rainMm: {
    value: 1, min: 0.1, max: 500,
    label: ['Pluie prévue (mm)', 'Forecast rain (mm)', 'المطر المتوقع (مم)'],
    help: ['Pluie prévue à partir de laquelle une journée compte comme pluvieuse (1 mm est le réglage de base).', 'Forecast rain from which a day counts as rainy (1 mm is the standard setting).', 'كمية المطر المتوقعة التي يعد اليوم عندها ممطرا (1 مم هو الإعداد الأساسي).'],
  },
  weatherDays: {
    value: 5, min: 1, max: 100, integer: true,
    label: ['Jours météo minimum', 'Minimum weather days', 'الحد الأدنى لأيام الطقس'],
    help: ['Nombre de jours de pluie passés à observer avant que Kiwi parle d’un effet.', 'Number of past rainy days to observe before Kiwi reports an effect.', 'عدد أيام المطر السابقة التي تُرصد قبل أن يتحدث Kiwi عن تأثير.'],
  },
};

/* Les champs lus par chaque règle, dans l'ordre de RULES (assets/briefing.js). */
export const BRIEFING_GROUPS = [
  ['salesDrop', 'samples'],
  ['stockFactor'],
  ['marginDrop', 'coverage', 'coverageGap'],
  ['planningMinutes'],
  ['share', 'multiple', 'events', 'samples'],
  ['share', 'multiple', 'events', 'samples'],
  ['cashCents'],
  ['lateMultiple', 'lateMinutes', 'samples', 'lateSamples'],
  ['weatherEffect', 'rainMm', 'weatherDays'],
];
