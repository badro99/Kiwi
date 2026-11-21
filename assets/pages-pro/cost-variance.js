/* Coût théorique et coût réel · le panneau du tableau de bord.
 *
 * Il remplace le moteur de démonstration (assets/venues/data.js : réel =
 * théorique × 1,04) par GET /api/cost-variance : les ratios clés sur les vrais
 * livres, les pertes par motif (vol et offerts compris), le seuil de marge
 * minimum avec son alerte, et « où l'argent fuit », matière par matière entre
 * deux inventaires, l'écart SIGNÉ. Un tap sur une matière ouvre ses
 * mouvements et ses inventaires ; le résumé part en brouillon WhatsApp
 * (wa.me, rien à payer) ou en CSV.
 *
 * Monté par assets/finance.js dans un `[data-costvar-slot]` (onglet « Coût
 * réel » d'Analyse du menu, bas de la page Marges ailleurs), chargé au premier
 * usage par LAZY_SECTIONS (assets/pages-pro.js). Une session de démonstration
 * voit un exemple ; un vrai commerçant ne voit que ses chiffres, ou ce qui
 * manque pour les calculer.
 *
 * finance.js redessine la page à chaque vente reçue : le panneau se remonte
 * alors depuis son cache (60 s) sans requête ni clignotement. */
(() => {
  'use strict';
  const H = window.Kiwi && window.Kiwi.handlers;
  if (!H) return;

  const lang = () => { try { return window.KiwiI18n.getLang() || 'fr'; } catch (_) { return 'fr'; } };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const locale = () => (lang() === 'en' ? 'en-GB' : lang() === 'ar' ? 'ar-MA' : 'fr-FR');
  const fmt = (n, d, min) => {
    const o = { minimumFractionDigits: min != null ? min : (d || 0), maximumFractionDigits: d || 0 };
    try { return window.KiwiNumber.format(n, o); } catch (_) {}
    try { return new Intl.NumberFormat(locale(), o).format(n); } catch (_) { return Number(n).toFixed(d || 0); }
  };
  /* Un montant reste « −450 MAD » dans une phrase arabe : isolé de gauche à
     droite (U+2066 … U+2069, plus une marque LRM pour les moteurs qui
     ignorent l'isolat), le signe ne passe pas derrière la devise. Le
     moins est toujours U+2212, pour les montants comme pour les pourcentages. */
  const iso = (x) => '\u2066\u200e' + x + '\u200e\u2069';
  /* Dans le HTML posé, chaque isolat devient un vrai <bdi dir="ltr"> : le
     pourcentage d'une phrase arabe (« 55,7 % ») ne se retourne plus, même là
     où le moteur ignore U+2066. Les attributs n'en portent jamais. */
  const bdi = (html) => String(html).replace(/\u2066\u200e?([^\u2066\u2069]*?)\u200e?\u2069/g, '<bdi dir="ltr">$1</bdi>');
  const sign = (v, signed) => (v < 0 ? '\u2212' : (signed && v > 0 ? '+' : ''));
  /* Centimes → « 1 234,50 MAD » ; les entiers sans décimales. */
  const mad = (cents, signed) => {
    if (cents == null) return '·';
    const v = Math.round(cents) / 100;
    return iso(sign(v, signed) + fmt(Math.abs(v), Number.isInteger(v) ? 0 : 2) + ' MAD');
  };
  /* L'unité reste dans l'isolat : « 11 kg », jamais « kg 11 » en arabe. Le
     résultat n'est pas échappé : avec une unité, il passe par esc(). */
  const qty = (q, signed, unit) => {
    if (q == null) return '·';
    const a = Math.abs(q);
    return iso(sign(q, signed) + fmt(a, a < 10 ? 2 : 1, 0) + (unit ? ' ' + unit : ''));
  };
  const pct = (p, signed) => (p == null ? '·' : iso(sign(p, signed) + fmt(Math.abs(p), 1) + ' %'));

  const STR = {
    fr: {
      title: 'Coût théorique et coût réel',
      sub: (a, b) => `Du ${a} au ${b} · journées de caisse`,
      days: { 7: '7 jours', 30: '30 jours', 90: '90 jours' },
      periodAria: 'Période', scopeAria: 'Établissements',
      scope: { site: 'Ce magasin', all: 'Tous les établissements' },
      ratios: 'Ratios clés',
      b: 'Ventes nettes', bSub: (d, r) => `après ${d} de remises et ${r} de remboursements`,
      A: 'Coût théorique des marchandises', ASub: (w, i) => `${w} des ventes · marge ${i}`,
      ABack: (s, r) => `vendu ${s} − marchandise revenue ${r}`,
      ACredit: (x) => `dont ${x} sortis sur des reçus à 0 MAD (carnet, livraisons)`,
      v: 'Pertes enregistrées', vSub: (y, d, c) => `${y} des ventes · déclarées ${d} · inventaires ${c}`,
      vGift: (g) => `dont offerts en caisse ${g}`,
      Z: 'Consommation réelle', ZSub: (m) => `coût théorique + pertes · marge ${m}`,
      L: 'Achats nets', LSub: (r, t) => `reçus ${r} − retours ${t}`,
      G: 'Transferts nets', GSub: (i, o) => `entrées ${i} − sorties ${o}`,
      el: 'Approvisionnement net', elSub: (m) => `achats + transferts · marge ${m}`,
      stock: 'Valeur du stock maintenant', po: (n) => `Commandes fournisseur en attente · ${n}`,
      transit: 'En route entre magasins', pieces: (n) => `${n} pièce(s) sans coût`,
      courier: (n) => `Chez le livreur, pas encore encaissé · ${n} livraison(s)`,
      ABare: (x) => `${x} remboursés sans détail : coût non déduit`,
      lossBy: (who) => `déclarée par ${who}`,
      target: 'Seuil de marge',
      targetIntro: 'Fixez la marge réelle minimum : une alerte s’affiche dès que la période passe dessous.',
      targetLabel: 'Marge minimum (%)', targetSave: 'Enregistrer', targetClear: 'Retirer',
      targetBad: 'Entrez un pourcentage entre 1 et 99.', targetSaved: 'Seuil enregistré.', targetFail: 'Le seuil n’a pas pu être enregistré.',
      targetAlert: (r, m, s) => `Marge réelle ${r}, sous votre seuil de ${m} : il manque ${s}.`,
      targetOk: (r, m, x) => `Marge réelle ${r}, au-dessus de votre seuil de ${m}. Consommation à ne pas dépasser : ${x}.`,
      targetTheo: 'Même la marge théorique est sous le seuil : revoyez vos prix de vente ou vos fiches techniques.',
      losses: 'Pertes par motif', lossesEmpty: 'Aucune perte enregistrée sur la période.',
      lossSrc: { declared: 'déclarée', count: 'inventaire', ticket: 'ticket offert', livraison: 'livraison' },
      reasons: { perime: 'Périmé', casse: 'Casse', avarie: 'Avarié', offert: 'Offert', 'repas-equipe': 'Repas équipe', vol: 'Vol', perdu: 'Perdu', erreur: 'Erreur de saisie', autre: 'Autre', 'non-explique': 'Écart sans motif' },
      leaks: 'Où l’argent fuit',
      leaksSub: (a, b) => `Matière par matière, entre l’inventaire du ${a} et celui du ${b}`,
      leaksSubNone: 'Matière par matière, entre deux inventaires validés',
      leakSum: (l, s, n) => `Manque ${l} · surplus ${s} · net ${n}`,
      cols: ['Matière', 'Début', 'Entrées', 'Fin', 'Utilisé', 'Recettes', 'Pertes déclarées', 'Écart', 'Écart MAD'],
      cardLine: (u, r, g) => `utilisé ${u} · recettes ${r} · écart ${g}`,
      noCount: 'Aucun inventaire', oneCount: 'Un seul inventaire', noCost: 'Sans coût d’achat', skipped: 'Période trop découpée',
      soldBy: (q) => `${q} sortis par les ventes`,
      gapHelp: 'Écart = utilisé − recettes. Positif : de la marchandise manque. Négatif : il en reste plus que prévu. Touchez une matière pour voir ses mouvements.',
      wa: 'Envoyer sur WhatsApp', csv: 'Exporter en CSV',
      waHead: (s, a, b) => `Où l’argent fuit · ${s} · du ${a} au ${b}`,
      waLine: (n, g, u) => `${n} : ${g} (${u})`,
      waFoot: (l, n) => `Manque ${l} · net ${n}`,
      waRatios: (b, w, m) => `Ventes nettes ${b} · coût ${w} · marge réelle ${m}`,
      csvCols: ['Matière', 'Unité', 'Magasin', 'Statut', 'Début', 'Entrées', 'Fin', 'Utilisé', 'Recettes', 'Pertes déclarées', 'Écart', 'Écart MAD'],
      itemMoves: 'Mouvements', itemCounts: 'Inventaires', itemNone: 'Aucun mouvement sur la fenêtre.', itemMore: 'Les 300 derniers mouvements seulement.',
      itemBy: (a) => `par ${a}`,
      moveReasons: { sale: 'Vente', 'sale-reversal': 'Vente annulée', receipt: 'Réception', opening: 'Stock d’ouverture', loss: 'Perte', count: 'Inventaire', 'transfer-in': 'Transfert reçu', 'transfer-out': 'Transfert envoyé', 'supplier-return': 'Retour fournisseur', manual: 'Correction', 'production-input': 'Production (entrée)', 'production-output': 'Production (sortie)', expiry: 'Périmé', gift: 'Offert', 'staff-meal': 'Repas équipe' },
      todo: 'Pour des chiffres complets',
      uncosted: (n, a) => `Produits vendus sans coût : ${n} (${a} de ventes). Ajoutez leur coût d’achat ou leur fiche technique.`,
      bare: (a) => `${a} de ventes sans détail article (montant libre) : comptées dans les ventes, jamais dans le coût.`,
      backNoCost: (a, n) => `Retours sans coût connu : ${a} sur ${n} ligne(s). Leur marchandise n’est pas déduite du coût.`,
      bareRefund: (a) => `${a} remboursés sans détail : coût non déduit. Le coût en % des ventes est donc un peu haut ; rembourser depuis le ticket garde les articles.`,
      needCount: (n) => `Matières consommées sans deux inventaires : ${n}. Faites un inventaire au début et à la fin de la période.`,
      stockNoCost: (n) => `Articles en stock sans prix d’achat : ${n}. La valeur du stock les ignore.`,
      ledgerNoCost: (n) => `Mouvements de stock sans coût : ${n}. Leurs montants manquent aux pertes et aux achats.`,
      emptyRecipesH: 'Pas encore de coût sur vos ventes',
      emptyRecipes: { restaurant: 'Le coût théorique vient des fiches techniques et des coûts saisis sur votre carte. Chiffrez vos produits : chaque vente suivante portera son coût.',
        retail: 'Le coût théorique vient du prix d’achat de chaque article. Saisissez vos prix d’achat : chaque vente suivante portera son coût.' },
      emptyRecipesBtn: { restaurant: 'Ouvrir ma carte', retail: 'Saisir les prix d’achat' },
      emptyCountH: 'Pas encore d’inventaire validé',
      emptyCount: 'L’écart par matière se mesure entre deux inventaires. Comptez votre stock, validez, et recommencez à la fin de la période.',
      emptyCountBtn: { restaurant: 'Ouvrir le stock', retail: 'Faire un inventaire' },
      goMissing: 'Cette page n’est pas disponible sur ce compte.',
      loading: 'Calcul en cours…',
      error: 'Les chiffres n’ont pas pu être chargés.', retry: 'Réessayer',
      offline: 'Hors ligne : les chiffres reviendront avec la connexion.',
      forbidden: 'Réservé au propriétaire.',
      demo: 'Exemple · vos vrais chiffres apparaissent ici dès votre premier inventaire.',
    },
    en: {
      title: 'Theoretical vs actual cost',
      sub: (a, b) => `${a} to ${b} · trading days`,
      days: { 7: '7 days', 30: '30 days', 90: '90 days' },
      periodAria: 'Period', scopeAria: 'Locations',
      scope: { site: 'This location', all: 'All locations' },
      ratios: 'Key ratios',
      b: 'Net sales', bSub: (d, r) => `after ${d} of discounts and ${r} of refunds`,
      A: 'Theoretical cost of goods', ASub: (w, i) => `${w} of sales · margin ${i}`,
      ABack: (s, r) => `sold ${s} − goods returned ${r}`,
      ACredit: (x) => `including ${x} on 0 MAD receipts (credit book, deliveries)`,
      v: 'Recorded losses', vSub: (y, d, c) => `${y} of sales · declared ${d} · stock counts ${c}`,
      vGift: (g) => `including ${g} given away at the till`,
      Z: 'Actual consumption', ZSub: (m) => `theoretical cost + losses · margin ${m}`,
      L: 'Net purchases', LSub: (r, t) => `received ${r} − returned ${t}`,
      G: 'Net transfers', GSub: (i, o) => `in ${i} − out ${o}`,
      el: 'Net supply', elSub: (m) => `purchases + transfers · margin ${m}`,
      stock: 'Stock value now', po: (n) => `Supplier orders pending · ${n}`,
      transit: 'In transit between locations', pieces: (n) => `${n} piece(s) without a cost`,
      courier: (n) => `With the courier, not yet collected · ${n} deliver${n === 1 ? 'y' : 'ies'}`,
      ABare: (x) => `${x} refunded without detail: cost not deducted`,
      lossBy: (who) => `declared by ${who}`,
      target: 'Margin floor',
      targetIntro: 'Set the minimum actual margin: an alert shows as soon as the period falls below it.',
      targetLabel: 'Minimum margin (%)', targetSave: 'Save', targetClear: 'Remove',
      targetBad: 'Enter a percentage between 1 and 99.', targetSaved: 'Floor saved.', targetFail: 'The floor could not be saved.',
      targetAlert: (r, m, s) => `Actual margin ${r}, below your ${m} floor: ${s} short.`,
      targetOk: (r, m, x) => `Actual margin ${r}, above your ${m} floor. Consumption must stay under ${x}.`,
      targetTheo: 'Even the theoretical margin is below the floor: review your selling prices or recipes.',
      losses: 'Losses by reason', lossesEmpty: 'No loss recorded in this period.',
      lossSrc: { declared: 'declared', count: 'stock count', ticket: 'free ticket', livraison: 'delivery' },
      reasons: { perime: 'Expired', casse: 'Breakage', avarie: 'Damaged', offert: 'Given away', 'repas-equipe': 'Staff meal', vol: 'Theft', perdu: 'Lost', erreur: 'Entry error', autre: 'Other', 'non-explique': 'Unexplained gap' },
      leaks: 'Where the money leaks',
      leaksSub: (a, b) => `Ingredient by ingredient, between the ${a} and ${b} stock counts`,
      leaksSubNone: 'Ingredient by ingredient, between two approved stock counts',
      leakSum: (l, s, n) => `Missing ${l} · surplus ${s} · net ${n}`,
      cols: ['Ingredient', 'Opening', 'In', 'Closing', 'Used', 'Recipes', 'Declared losses', 'Gap', 'Gap MAD'],
      cardLine: (u, r, g) => `used ${u} · recipes ${r} · gap ${g}`,
      noCount: 'No stock count', oneCount: 'One stock count only', noCost: 'No purchase cost', skipped: 'Period too fragmented',
      soldBy: (q) => `${q} used by sales`,
      gapHelp: 'Gap = used − recipes. Positive: stock is missing. Negative: more is left than expected. Tap an ingredient to see its movements.',
      wa: 'Send on WhatsApp', csv: 'Export as CSV',
      waHead: (s, a, b) => `Where the money leaks · ${s} · ${a} to ${b}`,
      waLine: (n, g, u) => `${n}: ${g} (${u})`,
      waFoot: (l, n) => `Missing ${l} · net ${n}`,
      waRatios: (b, w, m) => `Net sales ${b} · cost ${w} · actual margin ${m}`,
      csvCols: ['Ingredient', 'Unit', 'Location', 'Status', 'Opening', 'In', 'Closing', 'Used', 'Recipes', 'Declared losses', 'Gap', 'Gap MAD'],
      itemMoves: 'Movements', itemCounts: 'Stock counts', itemNone: 'No movement in this window.', itemMore: 'Latest 300 movements only.',
      itemBy: (a) => `by ${a}`,
      moveReasons: { sale: 'Sale', 'sale-reversal': 'Sale cancelled', receipt: 'Delivery', opening: 'Opening stock', loss: 'Loss', count: 'Stock count', 'transfer-in': 'Transfer in', 'transfer-out': 'Transfer out', 'supplier-return': 'Supplier return', manual: 'Correction', 'production-input': 'Production (input)', 'production-output': 'Production (output)', expiry: 'Expired', gift: 'Given away', 'staff-meal': 'Staff meal' },
      todo: 'To complete the numbers',
      uncosted: (n, a) => `Products sold without a cost: ${n} (${a} of sales). Add their purchase cost or recipe.`,
      bare: (a) => `${a} of sales without item detail (free amount): counted in sales, never in cost.`,
      backNoCost: (a, n) => `Returns without a known cost: ${a} over ${n} line(s). Their goods are not taken off the cost.`,
      bareRefund: (a) => `${a} refunded without detail: cost not deducted. Cost as a % of sales reads slightly high; refunding from the receipt keeps the items.`,
      needCount: (n) => `Ingredients used without two stock counts: ${n}. Count at the start and at the end of the period.`,
      stockNoCost: (n) => `Stock items without a purchase price: ${n}. Stock value leaves them out.`,
      ledgerNoCost: (n) => `Stock movements without a cost: ${n}. Their amounts are missing from losses and purchases.`,
      emptyRecipesH: 'No cost on your sales yet',
      emptyRecipes: { restaurant: 'Theoretical cost comes from the recipes and costs on your menu. Cost your products: every next sale will carry its cost.',
        retail: 'Theoretical cost comes from each item’s purchase price. Enter your purchase prices: every next sale will carry its cost.' },
      emptyRecipesBtn: { restaurant: 'Open my menu', retail: 'Enter purchase prices' },
      emptyCountH: 'No approved stock count yet',
      emptyCount: 'The gap per ingredient is measured between two stock counts. Count your stock, approve it, and count again at the end of the period.',
      emptyCountBtn: { restaurant: 'Open stock', retail: 'Start a stock count' },
      goMissing: 'This page is not available on this account.',
      loading: 'Calculating…',
      error: 'The figures could not be loaded.', retry: 'Try again',
      offline: 'Offline: the figures will come back with the connection.',
      forbidden: 'Owner only.',
      demo: 'Sample · your real figures appear here after your first stock count.',
    },
    ar: {
      title: 'الكلفة النظرية والكلفة الفعلية',
      sub: (a, b) => `من ${a} إلى ${b} · أيام العمل`,
      days: { 7: '7 أيام', 30: '30 يومًا', 90: '90 يومًا' },
      periodAria: 'الفترة', scopeAria: 'المحلات',
      scope: { site: 'هذا المحل', all: 'جميع المحلات' },
      ratios: 'المؤشرات الأساسية',
      b: 'صافي المبيعات', bSub: (d, r) => `بعد خصم ${d} من التخفيضات و${r} من المبالغ المستردة`,
      A: 'الكلفة النظرية للبضاعة المبيعة', ASub: (w, i) => `${w} من المبيعات · الهامش ${i}`,
      ABack: (s, r) => `كلفة المبيعات ${s} − كلفة البضاعة المرتجعة ${r}`,
      ACredit: (x) => `منها ${x} على إيصالات بقيمة 0 درهم (دفتر الديون، التوصيل)`,
      v: 'الخسائر المسجلة', vSub: (y, d, c) => `${y} من المبيعات · المصرّح بها ${d} · الجرد ${c}`,
      vGift: (g) => `منها ${g} قُدّمت مجانًا عند الصندوق`,
      Z: 'الاستهلاك الفعلي', ZSub: (m) => `الكلفة النظرية + الخسائر · الهامش ${m}`,
      L: 'صافي المشتريات', LSub: (r, t) => `المستلَم ${r} − المرتجَع ${t}`,
      G: 'صافي التحويلات', GSub: (i, o) => `الوارد ${i} − الصادر ${o}`,
      el: 'صافي التموين', elSub: (m) => `المشتريات + التحويلات · الهامش ${m}`,
      stock: 'قيمة المخزون الآن', po: (n) => `طلبيات الموردين قيد الانتظار · ${n}`,
      transit: 'في الطريق بين المحلات', pieces: (n) => `عدد القطع دون كلفة: ${n}`,
      courier: (n) => `لدى عامل التوصيل ولم تُحصَّل بعد · عدد الطلبيات: ${n}`,
      ABare: (x) => `${x} مستردة دون تفاصيل: لم تُخصم كلفتها`,
      lossBy: (who) => `صرّح بها ${who}`,
      target: 'الحد الأدنى للهامش',
      targetIntro: 'حدّد أدنى هامش فعلي تقبله، وسيظهر تنبيه حين تنخفض الفترة عنه.',
      targetLabel: 'الهامش الأدنى (%)', targetSave: 'حفظ', targetClear: 'إزالة',
      targetBad: 'أدخل نسبة بين 1 و99.', targetSaved: 'تم حفظ الحد الأدنى.', targetFail: 'تعذّر حفظ الحد الأدنى.',
      targetAlert: (r, m, s) => `الهامش الفعلي ${r} أقل من الحد الأدنى ${m}، والنقص ${s}.`,
      targetOk: (r, m, x) => `الهامش الفعلي ${r} أعلى من الحد الأدنى ${m}. يجب ألا يتجاوز الاستهلاك ${x}.`,
      targetTheo: 'حتى الهامش النظري أقل من الحد الأدنى: راجع أسعار البيع أو البطاقات التقنية.',
      losses: 'الخسائر حسب السبب', lossesEmpty: 'لا توجد خسائر مسجلة في هذه الفترة.',
      lossSrc: { declared: 'مصرّح بها', count: 'الجرد', ticket: 'تذكرة مجانية', livraison: 'توصيل' },
      reasons: { perime: 'منتهي الصلاحية', casse: 'كسر', avarie: 'تالف', offert: 'مقدَّم مجانًا', 'repas-equipe': 'وجبات الفريق', vol: 'سرقة', perdu: 'مفقود', erreur: 'خطأ في الإدخال', autre: 'أسباب أخرى', 'non-explique': 'فرق غير مبرَّر' },
      leaks: 'أين يضيع المال',
      leaksSub: (a, b) => `كل مادة على حدة، بين جرد ${a} وجرد ${b}`,
      leaksSubNone: 'كل مادة على حدة، بين جردين معتمدين',
      leakSum: (l, s, n) => `نقص ${l} · فائض ${s} · الصافي ${n}`,
      cols: ['المادة', 'البداية', 'الوارد', 'النهاية', 'المستعمَل', 'حسب الوصفات', 'الخسائر المصرّح بها', 'الفرق', 'الفرق بالدرهم'],
      cardLine: (u, r, g) => `المستعمَل ${u} · حسب الوصفات ${r} · الفرق ${g}`,
      noCount: 'دون جرد', oneCount: 'جرد واحد فقط', noCost: 'دون سعر شراء', skipped: 'الفترة مجزأة أكثر من اللازم',
      soldBy: (q) => `استُهلك ${q} في المبيعات`,
      gapHelp: 'الفرق = المستعمَل − ما تحدده الوصفات. الفرق الموجب يعني بضاعة ناقصة، والسالب يعني أن المتبقي أكثر من المتوقع. المس أي مادة لعرض حركاتها.',
      wa: 'إرسال عبر واتساب', csv: 'تصدير بصيغة CSV',
      waHead: (s, a, b) => `أين يضيع المال · ${s} · من ${a} إلى ${b}`,
      waLine: (n, g, u) => `${n}: ${g} (${u})`,
      waFoot: (l, n) => `النقص ${l} · الصافي ${n}`,
      waRatios: (b, w, m) => `صافي المبيعات ${b} · الكلفة ${w} · الهامش الفعلي ${m}`,
      csvCols: ['المادة', 'الوحدة', 'المحل', 'الحالة', 'البداية', 'الوارد', 'النهاية', 'المستعمَل', 'حسب الوصفات', 'الخسائر المصرّح بها', 'الفرق', 'الفرق بالدرهم'],
      itemMoves: 'الحركات', itemCounts: 'عمليات الجرد', itemNone: 'لا توجد حركات في هذه الفترة.', itemMore: 'آخر 300 حركة فقط.',
      itemBy: (a) => `بواسطة ${a}`,
      moveReasons: { sale: 'بيع', 'sale-reversal': 'إلغاء بيع', receipt: 'استلام', opening: 'رصيد افتتاحي', loss: 'خسارة', count: 'جرد', 'transfer-in': 'تحويل وارد', 'transfer-out': 'تحويل صادر', 'supplier-return': 'إرجاع إلى المورد', manual: 'تصحيح', 'production-input': 'إنتاج (مدخلات)', 'production-output': 'إنتاج (مخرجات)', expiry: 'منتهي الصلاحية', gift: 'مقدَّم مجانًا', 'staff-meal': 'وجبات الفريق' },
      todo: 'لاستكمال الأرقام',
      uncosted: (n, a) => `منتجات بيعت دون كلفة: ${n} (${a} من المبيعات). أضف سعر شرائها أو بطاقتها التقنية.`,
      bare: (a) => `${a} من المبيعات دون تفاصيل المنتجات (مبلغ حر): تُحتسب في المبيعات، ولا تدخل في الكلفة.`,
      backNoCost: (a, n) => `مرتجعات دون كلفة معروفة: ${a} في ${n} سطر. لم تُخصم بضاعتها من الكلفة.`,
      bareRefund: (a) => `${a} مستردة دون تفاصيل: لم تُخصم كلفتها، لذا تبدو نسبة الكلفة من المبيعات أعلى قليلًا. الاسترداد من التذكرة يحفظ المنتجات.`,
      needCount: (n) => `مواد استُعملت دون جردين: ${n}. أجرِ جردًا في بداية الفترة وآخر في نهايتها.`,
      stockNoCost: (n) => `منتجات في المخزون دون سعر شراء: ${n}. قيمة المخزون لا تشملها.`,
      ledgerNoCost: (n) => `حركات مخزون دون كلفة: ${n}. مبالغها غائبة عن الخسائر والمشتريات.`,
      emptyRecipesH: 'لا توجد كلفة على مبيعاتك بعد',
      emptyRecipes: { restaurant: 'تأتي الكلفة النظرية من البطاقات التقنية والتكاليف المسجلة في قائمتك. حدّد كلفة منتجاتك، وستحمل كل عملية بيع لاحقة كلفتها.',
        retail: 'تأتي الكلفة النظرية من سعر شراء كل منتج. سجّل أسعار الشراء، وستحمل كل عملية بيع لاحقة كلفتها.' },
      emptyRecipesBtn: { restaurant: 'افتح القائمة', retail: 'سجّل أسعار الشراء' },
      emptyCountH: 'لا يوجد جرد معتمد بعد',
      emptyCount: 'يُقاس الفرق لكل مادة بين جردين. اجرد مخزونك واعتمده، ثم أعد الجرد في نهاية الفترة.',
      emptyCountBtn: { restaurant: 'افتح المخزون', retail: 'ابدأ الجرد' },
      goMissing: 'هذه الصفحة غير متاحة في هذا الحساب.',
      loading: 'جارٍ الحساب…',
      error: 'تعذّر تحميل الأرقام.', retry: 'أعد المحاولة',
      offline: 'لا يوجد اتصال: ستعود الأرقام مع عودة الاتصال.',
      forbidden: 'مخصص لصاحب المحل.',
      demo: 'مثال · تظهر أرقامك الحقيقية هنا بعد أول جرد.',
    },
  };
  const t = () => STR[lang()] || STR.fr;

  /* ── Exemple (session de démonstration uniquement) ─────────────────────── */
  function sample() {
    const now = Date.now(), d = 864e5;
    const row = (itemId, name, unit, opening, supply, closing, theo, waste, cost) => {
      const used = Math.round((opening + supply - closing) * 1000) / 1000;
      const gap = Math.round((used - theo) * 1000) / 1000;
      return { itemId, name, unit, status: 'ok', opening, supply, closing, actualUse: used, theoretical: theo, waste, gap,
        unexplained: Math.round((gap - waste) * 1000) / 1000, gapCents: Math.round(gap * cost * 100), openTs: now - 7 * d, closeTs: now - d };
    };
    const rows = [
      row('s1', 'Poulet fermier', 'kg', 24, 40, 9, 51.2, 1.5, 78),
      row('s2', 'Huile d’olive', 'L', 12, 10, 6.5, 14.1, 0, 62),
      row('s3', 'Viande hachée', 'kg', 8, 15, 4.2, 18.4, 0.3, 110),
      row('s4', 'Citron', 'kg', 5, 6, 3.8, 6.9, 0, 9),
      row('s5', 'Menthe fraîche', 'botte', 20, 60, 14, 67, 0, 3),
      { itemId: 's6', name: 'Safran', unit: 'g', status: 'one-count', theoreticalInRange: 6, theoreticalInRangeCents: 4200 },
    ];
    const measured = rows.filter((r) => r.status === 'ok');
    return {
      demo: true, scope: 'site', storeCount: 1,
      range: { from: now - 7 * d, to: now, days: 7 },
      sites: [{
        merchant: 'demo', name: 'Café Atlas',
        ratios: { grossSalesCents: 6480000, discountCents: 142000, refundCents: 38000, netSalesCents: 6442000,
          soldCostCents: 1892200, returnsCostCents: 24000, cogsCents: 1868200, marginCents: 4573800, costPct: 29,
          declaredWasteCents: 61500, giftCostCents: 18000, countShrinkCents: 172000, countOverCents: 21000,
          wasteCents: 230500, wastePct: 3.6, consumptionCents: 2098700, consumptionPct: 32.6, marginOnConsumptionCents: 4343300,
          receivedCents: 1925000, returnedCents: 36000, purchasesCents: 1889000, transferInCents: 0, transferOutCents: 45000,
          transfersCents: -45000, supplyCents: 1844000, marginOnSupplyCents: 4598000, stockValueCents: 1312000,
          inTransitCents: 0, inTransitPieces: 0, inTransitCount: 0, pendingPoCents: 486000, pendingPoCount: 2 },
        target: { minMarginPct: 65, thresholdCents: 4187300, maxConsumptionCents: 2254700, realMarginPct: 67.4,
          theoreticalBreached: false, breached: false, shortfallCents: 0 },
        coverage: { costedPct: 91.4, lineRevenueCents: 6400000, costedRevenueCents: 5849600, undetailedCents: 80000,
          uncosted: [{ name: 'Jus du jour', qty: 64, cents: 320000 }, { name: 'Pastilla', qty: 9, cents: 230400 }],
          ledgerNoCostRows: 0, stockNoCost: 1, creditSalesCostCents: 0, uncostedReturnCents: 0 },
        losses: [{ reason: 'vol', source: 'count', cents: 86000 }, { reason: 'non-explique', source: 'count', cents: 65000 },
          { reason: 'perime', source: 'declared', cents: 38000 }, { reason: 'casse', source: 'declared', cents: 23500 },
          { reason: 'offert', source: 'ticket', cents: 18000 }],
        variance: { rows, countsFound: true, windows: [{ open: now - 7 * d, close: now - d }],
          leakCents: measured.reduce((a, r) => a + Math.max(0, r.gapCents), 0),
          surplusCents: measured.reduce((a, r) => a + Math.min(0, r.gapCents), 0),
          netGapCents: measured.reduce((a, r) => a + r.gapCents, 0), measured: measured.length, missingCount: 1, noCost: 0 },
      }],
    };
  }

  /* ── État ─────────────────────────────────────────────────────────────── */
  const CACHE_MS = 60000;
  const cache = new Map();
  const S = { days: 7, scope: 'site' };
  try { const d = +localStorage.getItem('kiwiCostVarDays'); if (d === 7 || d === 30 || d === 90) S.days = d; } catch (_) {}
  let last = { slot: null, real: false, restaurant: false, data: null };

  function merchant() {
    try { return (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && (window.KiwiVenue.getCurrentVenueData() || {}).slug) || ''; } catch (_) { return ''; }
  }
  const keyOf = (m) => [m, S.days, S.scope].join('|');
  const toast = (msg, type) => { try { window.Kiwi.toast(msg, { type: type || 'info' }); } catch (_) {} };

  async function load(m) {
    const key = keyOf(m);
    const cur = cache.get(key);
    if (cur && cur.pending) return cur.pending;
    const pending = (async () => {
      try {
        const r = await fetch(`/api/cost-variance?merchant=${encodeURIComponent(m)}&days=${S.days}${S.scope === 'all' ? '&scope=all' : ''}`, { credentials: 'same-origin' });
        const body = await r.json().catch(() => ({}));
        cache.set(key, r.ok ? { at: Date.now(), data: body } : { at: Date.now(), error: r.status === 403 ? 'forbidden' : 'error' });
      } catch (_) {
        cache.set(key, { at: Date.now(), error: navigator.onLine === false ? 'offline' : 'error' });
      }
      return cache.get(key);
    })();
    cache.set(key, Object.assign({}, cur || {}, { pending }));
    return pending;
  }

  /* ── Dessin ───────────────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('cv-css')) return;
    const st = document.createElement('style');
    st.id = 'cv-css';
    st.textContent = `
.cv{display:grid;gap:16px;margin-top:16px;min-width:0}
.cv-head{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.cv-title{font-size:17px;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
.cv-sub{font-size:12.5px;color:var(--n-500);margin-top:2px}
.cv-ctrls{display:flex;flex-wrap:wrap;gap:8px;max-width:100%}
.cv-seg{display:inline-flex;gap:2px;padding:4px;border-radius:999px;background:var(--n-100);border:1px solid var(--n-200);max-width:100%;overflow-x:auto}
.cv-seg button{border:0;background:transparent;color:var(--n-600);font:inherit;font-size:13px;font-weight:500;padding:7px 14px;border-radius:999px;cursor:pointer;white-space:nowrap}
.cv-seg button.on{color:var(--ink)}
.cv-seg:not([data-kw-lens]) button.on{background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.cv button:focus-visible,.cv input:focus-visible{outline:2px solid var(--atlas);outline-offset:2px}
.cv-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px;align-items:start}
.cv-col{display:grid;gap:16px;align-content:start;min-width:0}
@media (max-width:980px){.cv-grid{grid-template-columns:minmax(0,1fr)}}
.cv-card{border:1px solid var(--n-200);border-radius:18px;background:var(--surface,var(--paper));padding:18px;min-width:0}
.cv-eyebrow{font-size:11px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--n-500);margin-bottom:10px}
.cv-r{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:10px 0;border-top:1px solid var(--n-200)}
.cv-r:first-of-type{border-top:0}
.cv-r b{font-weight:550;color:var(--ink);font-size:13.5px}
.cv-r span{font-variant-numeric:tabular-nums;font-size:14px;color:var(--ink);text-align:end;white-space:nowrap}
.cv-r small{grid-column:1/-1;font-size:12px;color:var(--n-500);line-height:1.45}
.cv-r.neg span{color:var(--danger)}
.cv-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--n-200);font-size:13px;color:var(--n-600)}
.cv-foot b{font-weight:550;color:var(--ink);font-variant-numeric:tabular-nums}
.cv-alert{border-radius:14px;padding:12px 14px;font-size:13.5px;line-height:1.5;border:1px solid var(--n-200);background:var(--n-100);color:var(--ink)}
.cv-alert.bad{border-color:var(--danger);color:var(--danger)}
.cv-alert small{display:block;margin-top:4px;color:var(--n-600)}
.cv-target{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-top:12px}
.cv-target label{display:grid;gap:4px;font-size:12px;color:var(--n-600)}
.cv-target input{width:110px;font:inherit;font-size:14px;padding:8px 10px;border-radius:10px;border:1px solid var(--n-200);background:var(--paper);color:var(--ink);font-variant-numeric:tabular-nums}
.cv-loss{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:8px 0;font-size:13px}
.cv-loss b{font-weight:550;color:var(--ink)}
.cv-loss small{color:var(--n-500);font-size:11.5px;margin-inline-start:6px}
.cv-loss span{font-variant-numeric:tabular-nums;text-align:end}
.cv-loss .cv-by{grid-column:1/-1;margin:0;color:var(--n-600);font-size:12px}
.cv-bar{grid-column:1/-1;height:6px;border-radius:99px;background:var(--n-100);overflow:hidden}
.cv-bar i{display:block;height:100%;border-radius:99px;background:var(--danger)}
.cv-bar i.pos{background:var(--atlas)}
.cv-lhead{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:space-between}
.cv-acts{display:flex;flex-wrap:wrap;gap:6px}
.cv-sum{font-size:13px;color:var(--n-600);margin:-4px 0 12px;font-variant-numeric:tabular-nums}
.cv-tbl-wrap{overflow-x:auto;margin:0 -4px}
.cv-tbl{width:100%;border-collapse:collapse;font-size:13px}
.cv-tbl th{text-align:start;font-size:11px;font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);font-weight:500;padding:8px;border-bottom:1px solid var(--n-200);white-space:nowrap}
.cv-tbl td{padding:9px 8px;border-bottom:1px solid var(--n-200);vertical-align:top}
.cv-tbl tr:last-child td{border-bottom:0}
.cv-tbl .num{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv-tbl small{display:block;color:var(--n-500);font-size:11.5px;margin-top:2px}
.cv .leak{color:var(--danger)}
.cv .surplus{color:var(--atlas)}
.cv-link{all:unset;cursor:pointer;font-weight:550;color:var(--ink);text-decoration:underline;text-decoration-color:var(--n-200);text-underline-offset:3px}
.cv-link:hover{text-decoration-color:currentColor}
.cv-cards{display:none;gap:8px}
.cv-item{all:unset;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;align-items:baseline;width:100%;padding:12px 14px;border:1px solid var(--n-200);border-radius:14px;background:var(--paper);cursor:pointer}
.cv-item b{font-weight:550;color:var(--ink);font-size:14px;overflow-wrap:anywhere}
.cv-item strong{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv-item small{grid-column:1/-1;font-size:12px;color:var(--n-500);line-height:1.45}
@media (max-width:640px){.cv-tbl-wrap{display:none}.cv-cards{display:grid}.cv-card{padding:14px}}
.cv-pill{display:inline-block;font-size:11.5px;padding:2px 8px;border-radius:99px;background:var(--n-100);color:var(--n-600);white-space:nowrap}
.cv-help{font-size:12px;color:var(--n-500);margin-top:10px;line-height:1.5}
.cv-todo{list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:13px;color:var(--n-700,var(--ink))}
.cv-todo li{padding-inline-start:14px;position:relative;line-height:1.5}
.cv-todo li::before{content:'';position:absolute;inset-inline-start:0;top:.6em;width:6px;height:6px;border-radius:50%;background:var(--warning)}
.cv-todo small{color:var(--n-500)}
.cv-empty{text-align:center;padding:28px 18px}
.cv-empty b{display:block;font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px}
.cv-empty p{margin:0 auto 14px;max-width:460px;font-size:13px;color:var(--n-600);line-height:1.55}
.cv-note{font-size:12.5px;color:var(--n-500)}
.cv-mv{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:9px 0;border-top:1px solid var(--n-200);font-size:13px}
.cv-mv:first-child{border-top:0}
.cv-mv span{font-variant-numeric:tabular-nums;text-align:end;white-space:nowrap}
.cv-mv small{grid-column:1/-1;color:var(--n-500);font-size:11.5px}
.cv-skel{height:220px;border-radius:18px;background:linear-gradient(90deg,var(--n-100),var(--n-200),var(--n-100));background-size:200% 100%;animation:cvSk 1.2s ease-in-out infinite}
.cv-skel.sm{height:120px}
@keyframes cvSk{0%{background-position:100% 0}100%{background-position:-100% 0}}
@media (prefers-reduced-motion:reduce){.cv-skel{animation:none}}`;
    document.head.appendChild(st);
  }

  function dayLabel(ts, zone, time) {
    try {
      const p = window.KiwiDayReport.civilParts(ts, zone || window.KiwiDayReport.timezone());
      const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, time ? +p.hour || 0 : 12, time ? +p.minute || 0 : 0));
      return new Intl.DateTimeFormat(locale(), Object.assign({ day: 'numeric', month: 'short', timeZone: 'UTC' }, time ? { hour: '2-digit', minute: '2-digit' } : {})).format(d);
    } catch (_) {
      try { return new Intl.DateTimeFormat(locale(), Object.assign({ day: 'numeric', month: 'short' }, time ? { hour: '2-digit', minute: '2-digit' } : {})).format(new Date(ts)); } catch (__) { return ''; }
    }
  }

  /* Les bornes d'une période sont des journées de caisse (« 2026-11-16 ») :
     on les écrit telles quelles, jamais l'instant de fin (05:00 le lendemain). */
  function dayOf(day, ts, zone) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    if (!m) return dayLabel(ts, zone);
    try { return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))); } catch (_) { return day; }
  }
  const rangeLabels = (r) => [dayOf(r.fromDay, r.from, r.zone), dayOf(r.toDay, Math.max(r.from || 0, (r.to || 0) - 1), r.zone)];

  function controls(data) {
    const c = t();
    const seg = (aria, items) => `<div class="cv-seg" data-lens-demo role="group" aria-label="${esc(aria)}">${items.join('')}</div>`;
    const period = seg(c.periodAria, [7, 30, 90].map((d) => `<button type="button" data-lens-item data-action="costvar-period" data-days="${d}" class="${S.days === d ? 'on' : ''}" aria-pressed="${S.days === d}">${esc(c.days[d])}</button>`));
    const scope = data && data.storeCount > 1
      ? seg(c.scopeAria, ['site', 'all'].map((k) => `<button type="button" data-lens-item data-action="costvar-scope" data-scope="${k}" class="${S.scope === k ? 'on' : ''}" aria-pressed="${S.scope === k}">${esc(c.scope[k])}</button>`))
      : '';
    return `<div class="cv-ctrls">${period}${scope}</div>`;
  }

  function head(data) {
    const c = t();
    const r = data && data.range;
    const sub = r ? c.sub(...rangeLabels(r)) : '';
    return `<div class="cv-head"><div><div class="cv-title">${esc(c.title)}</div><div class="cv-sub">${esc(sub)}</div></div>${controls(data)}</div>`;
  }

  function ratiosCard(R, C) {
    const c = t();
    const line = (label, value, subs, neg) => `<div class="cv-r${neg ? ' neg' : ''}"><b>${esc(label)}</b><span>${value}</span>${subs.filter(Boolean).map((x) => `<small>${esc(x)}</small>`).join('')}</div>`;
    const transit = R.inTransitCents || R.inTransitPieces
      ? `<span>${esc(c.transit)} · <b>${mad(R.inTransitCents)}</b>${R.inTransitPieces ? ' · ' + esc(c.pieces(R.inTransitPieces)) : ''}</span>` : '';
    const courier = R.atCourierCents ? `<span>${esc(c.courier((C && C.atCourierCount) || 0))} · <b>${mad(R.atCourierCents)}</b></span>` : '';
    return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.ratios)}</div>
      ${line(c.b, mad(R.netSalesCents), [c.bSub(mad(R.discountCents), mad(R.refundCents))])}
      ${line(c.A, mad(R.cogsCents), [c.ASub(pct(R.costPct), mad(R.marginCents)),
        R.returnsCostCents ? c.ABack(mad(R.soldCostCents), mad(R.returnsCostCents)) : '',
        C && C.creditSalesCostCents ? c.ACredit(mad(C.creditSalesCostCents)) : '',
        R.refundUndetailedCents ? c.ABare(mad(R.refundUndetailedCents)) : ''])}
      ${line(c.v, mad(R.wasteCents), [c.vSub(pct(R.wastePct), mad(R.declaredWasteCents), mad(R.countShrinkCents - R.countOverCents, true)),
        R.giftCostCents ? c.vGift(mad(R.giftCostCents)) : ''], R.wasteCents > 0)}
      ${line(c.Z, mad(R.consumptionCents), [c.ZSub(mad(R.marginOnConsumptionCents))], R.marginOnConsumptionCents < 0)}
      ${line(c.L, mad(R.purchasesCents), [c.LSub(mad(R.receivedCents), mad(R.returnedCents))])}
      ${line(c.G, mad(R.transfersCents, true), [c.GSub(mad(R.transferInCents), mad(R.transferOutCents))])}
      ${line(c.el, mad(R.supplyCents), [c.elSub(mad(R.marginOnSupplyCents))], R.marginOnSupplyCents < 0)}
      <div class="cv-foot"><span>${esc(c.stock)} · <b>${mad(R.stockValueCents)}</b></span><span>${esc(c.po(R.pendingPoCount || 0))} · <b>${mad(R.pendingPoCents)}</b></span>${transit}${courier}</div>
    </div>`;
  }

  /* Le seuil de marge : l'alerte quand la période passe dessous, et le
     réglage (propriétaire ou opérateur, magasin par magasin). */
  function alertBox(T) {
    const c = t();
    if (!T) return '';
    const real = pct(T.realMarginPct), min = pct(T.minMarginPct);
    if (T.breached) return `<div class="cv-alert bad" role="status">${esc(c.targetAlert(real, min, mad(T.shortfallCents)))}${T.theoreticalBreached ? `<small>${esc(c.targetTheo)}</small>` : ''}</div>`;
    return `<div class="cv-alert" role="status">${esc(c.targetOk(real, min, mad(T.maxConsumptionCents)))}</div>`;
  }
  function targetCard(T, editable) {
    const c = t();
    const form = editable ? `<div class="cv-target" data-cv-target>
        <label>${esc(c.targetLabel)}<input type="number" inputmode="decimal" min="1" max="99" step="0.5" value="${T ? esc(T.minMarginPct) : ''}" data-cv-target-input></label>
        <button class="kb atlas" type="button" data-action="costvar-target">${esc(c.targetSave)}</button>
        ${T ? `<button class="kb" type="button" data-action="costvar-target" data-clear="1">${esc(c.targetClear)}</button>` : ''}
      </div>` : '';
    if (!T && !editable) return '';
    return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.target)}</div>${T ? alertBox(T) : `<div class="cv-note">${esc(c.targetIntro)}</div>`}${form}</div>`;
  }

  function lossesCard(list) {
    const c = t();
    const rows = (list || []).filter((x) => x.cents);
    if (!rows.length) return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.losses)}</div><div class="cv-note">${esc(c.lossesEmpty)}</div></div>`;
    const max = Math.max(...rows.map((x) => Math.abs(x.cents)));
    return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.losses)}</div>${rows.map((x) => `
      <div class="cv-loss"><b>${esc(c.reasons[x.reason] || x.reason)}<small>${esc(c.lossSrc[x.source] || '')}</small></b><span>${mad(x.cents)}</span>
      ${(x.by || []).length ? `<small class="cv-by">${esc(c.lossBy(x.by.map((p) => p.name + ' ' + mad(p.cents)).join(', ')))}</small>` : ''}
      <div class="cv-bar"><i class="${x.cents < 0 ? 'pos' : ''}" style="width:${Math.max(3, Math.round(Math.abs(x.cents) / max * 100))}%"></i></div></div>`).join('')}</div>`;
  }

  const statusOf = (r) => { const c = t(); return { 'no-count': c.noCount, 'one-count': c.oneCount, 'no-cost': c.noCost, 'window-skipped': c.skipped }[r.status] || ''; };
  const itemAttrs = (r) => `data-action="costvar-item" data-item="${esc(r.itemId)}" data-site="${esc(r.siteMerchant || '')}"${r.openTs ? ` data-open="${esc(r.openTs)}" data-close="${esc(r.closeTs)}"` : ''}`;

  function leaksCard(V, zone, showSite) {
    const c = t();
    const rows = V.rows || [];
    const w = (V.windows || [])[0];
    const sub = w ? c.leaksSub(dayLabel(w.open, zone), dayLabel(w.close, zone)) : c.leaksSubNone;
    const cls = (r) => (r.gap > 0 ? 'leak' : r.gap < 0 ? 'surplus' : '');
    const site = (r) => (showSite && r.site ? `<small>${esc(r.site)}</small>` : '');
    const tr = (r) => {
      const name = `<button type="button" class="cv-link" ${itemAttrs(r)}>${esc(r.name)}</button>${site(r)}`;
      if (r.actualUse == null) {
        return `<tr><td>${name}<small>${esc(c.soldBy(qty(r.theoreticalInRange, false, r.unit)))}</small></td><td colspan="8"><span class="cv-pill">${esc(statusOf(r))}</span></td></tr>`;
      }
      return `<tr><td>${name}${r.unit ? `<small>${esc(r.unit)}</small>` : ''}</td>
        <td class="num">${qty(r.opening)}</td><td class="num">${qty(r.supply, true)}</td><td class="num">${qty(r.closing)}</td>
        <td class="num">${qty(r.actualUse)}</td><td class="num">${qty(r.theoretical)}</td><td class="num">${qty(r.waste)}</td>
        <td class="num ${cls(r)}">${qty(r.gap, true)}${r.gapPct != null ? `<small>${esc(pct(r.gapPct, true))}</small>` : ''}</td>
        <td class="num ${cls(r)}">${r.gapCents == null ? `<span class="cv-pill">${esc(c.noCost)}</span>` : mad(r.gapCents, true)}</td></tr>`;
    };
    /* Au téléphone : une carte par matière, l'écart en MAD d'abord. */
    const card = (r) => {
      if (r.actualUse == null) {
        return `<button type="button" class="cv-item" ${itemAttrs(r)}><b>${esc(r.name)}</b><span class="cv-pill">${esc(statusOf(r))}</span>
          <small>${esc(c.soldBy(qty(r.theoreticalInRange, false, r.unit)))}${showSite && r.site ? ' · ' + esc(r.site) : ''}</small></button>`;
      }
      const money = r.gapCents == null ? `<span class="cv-pill">${esc(c.noCost)}</span>` : `<strong class="${cls(r)}">${mad(r.gapCents, true)}</strong>`;
      return `<button type="button" class="cv-item" ${itemAttrs(r)}><b>${esc(r.name)}</b>${money}
        <small>${esc(c.cardLine(qty(r.actualUse, false, r.unit), qty(r.theoretical, false, r.unit), qty(r.gap, true, r.unit)))}${showSite && r.site ? ' · ' + esc(r.site) : ''}</small></button>`;
    };
    const sum = V.measured ? ' · ' + esc(c.leakSum(mad(V.leakCents), mad(Math.abs(V.surplusCents || 0)), mad(V.netGapCents, true))) : '';
    return `<div class="cv-card"><div class="cv-lhead"><div class="cv-eyebrow">${esc(c.leaks)}</div>
        <div class="cv-acts"><button class="kb" type="button" data-action="costvar-wa">${esc(c.wa)}</button><button class="kb" type="button" data-action="costvar-csv">${esc(c.csv)}</button></div></div>
      <div class="cv-sum">${esc(sub)}${sum}</div>
      <div class="cv-tbl-wrap"><table class="cv-tbl"><thead><tr>${c.cols.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(tr).join('')}</tbody></table></div>
      <div class="cv-cards">${rows.map(card).join('')}</div>
      <div class="cv-help">${esc(c.gapHelp)}</div></div>`;
  }

  function todoCard(site) {
    const c = t();
    const C = site.coverage || {}, V = site.variance || {};
    const items = [];
    if ((C.uncosted || []).length) {
      const total = C.uncosted.reduce((a, u) => a + (u.cents || 0), 0);
      items.push(`${esc(c.uncosted(C.uncosted.length, mad(total)))}<br><small>${C.uncosted.slice(0, 5).map((u) => esc(u.name) + ' · ' + mad(u.cents)).join(' · ')}</small>`);
    }
    if (C.undetailedCents > 0) items.push(esc(c.bare(mad(C.undetailedCents))));
    if (C.uncostedReturnCents > 0) items.push(esc(c.backNoCost(mad(C.uncostedReturnCents), C.uncostedReturnLines || 1)));
    if ((site.ratios || {}).refundUndetailedCents > 0) items.push(esc(c.bareRefund(mad(site.ratios.refundUndetailedCents))));
    if (V.missingCount > 0) items.push(esc(c.needCount(V.missingCount)));
    if (C.stockNoCost > 0) items.push(esc(c.stockNoCost(C.stockNoCost)));
    if (C.ledgerNoCostRows > 0) items.push(esc(c.ledgerNoCost(C.ledgerNoCostRows)));
    if (!items.length) return '';
    return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.todo)}</div><ul class="cv-todo">${items.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  }

  /* L'action d'un état vide suit le métier : la carte d'un restaurant, les
     prix d'achat d'une boutique ou d'une épicerie. */
  const trade = () => (last.restaurant ? 'restaurant' : 'retail');
  const GO = {
    restaurant: { recipes: ['nav-menu'], count: ['nav-stock', 'nav-inventory'] },
    retail: { recipes: ['nav-inventory', 'bqx-open', 'nav-stock'], count: ['nav-inventory', 'nav-stock'] },
  };
  function emptyCard(h, p, go, btn) {
    return `<div class="cv-card cv-empty"><b>${esc(h)}</b><p>${esc(p)}</p><button class="kb atlas" type="button" data-action="costvar-go" data-go="${go}">${esc(btn)}</button></div>`;
  }

  function body(data) {
    const c = t();
    const sites = data.sites || [];
    if (!sites.length) return '';
    const all = data.scope === 'all' && data.total;
    const own = sites.find((s) => s.merchant === data.merchant) || sites[0];
    const R = all ? data.total.ratios : own.ratios;
    const T = all ? data.total.target : own.target;
    const zone = data.range && data.range.zone;
    const losses = all ? mergeLosses(sites) : own.losses;
    const V = all ? mergeVariance(sites) : Object.assign({}, own.variance, { rows: ((own.variance || {}).rows || []).map((r) => Object.assign({ siteMerchant: own.merchant }, r)) });
    const costed = sites.some((s) => (s.coverage && s.coverage.costedRevenueCents) > 0);
    const hasSales = R.netSalesCents !== 0;
    const k = trade();
    let out = '';
    if (data.demo) out += `<div class="cv-note">${esc(c.demo)}</div>`;
    if (T && T.breached) out += alertBox(T);
    if (hasSales && !costed) out += emptyCard(c.emptyRecipesH, c.emptyRecipes[k], 'recipes', c.emptyRecipesBtn[k]);
    const editable = !data.demo && !all && data.canEdit;
    out += `<div class="cv-grid">${ratiosCard(R, all ? null : own.coverage)}<div class="cv-col">${targetCard(T, editable)}${lossesCard(losses)}${all ? '' : todoCard(own)}</div></div>`;
    if (!V.countsFound) out += emptyCard(c.emptyCountH, c.emptyCount, 'count', c.emptyCountBtn[k]);
    if ((V.rows || []).length) out += leaksCard(V, zone, all);
    return out;
  }

  function mergeLosses(sites) {
    const m = new Map();
    sites.forEach((s) => (s.losses || []).forEach((x) => {
      const k = x.source + '|' + x.reason;
      const cur = m.get(k) || { reason: x.reason, source: x.source, cents: 0, by: [] };
      cur.cents += x.cents;
      (x.by || []).forEach((p) => cur.by.push({ name: s.name ? p.name + ' · ' + s.name : p.name, cents: p.cents }));
      m.set(k, cur);
    }));
    return [...m.values()].map((x) => Object.assign(x, { by: x.by.sort((a, b) => b.cents - a.cents).slice(0, 5) })).sort((a, b) => b.cents - a.cents);
  }
  function mergeVariance(sites) {
    const rows = [];
    const out = { rows, countsFound: false, windows: [], leakCents: 0, surplusCents: 0, netGapCents: 0, measured: 0, missingCount: 0 };
    sites.forEach((s) => {
      const V = s.variance || {};
      (V.rows || []).forEach((r) => rows.push(Object.assign({}, r, { site: s.name, siteMerchant: s.merchant })));
      out.countsFound = out.countsFound || V.countsFound;
      ['leakCents', 'surplusCents', 'netGapCents', 'measured', 'missingCount'].forEach((k) => { out[k] += V[k] || 0; });
    });
    const rank = (r) => (r.gapCents != null ? 0 : (r.actualUse != null ? 1 : 2));
    rows.sort((a, b) => rank(a) - rank(b) || (b.gapCents || 0) - (a.gapCents || 0) || (b.theoreticalInRangeCents || 0) - (a.theoreticalInRangeCents || 0));
    return out;
  }

  function paint(slot, entry, real) {
    if (!slot || !slot.isConnected) return;
    css();
    const c = t();
    if (!real) { const d = sample(); last.data = d; slot.innerHTML = bdi(`<section class="cv" data-costvar>${head(d)}${body(d)}</section>`); return; }
    if (!entry || (!entry.data && !entry.error)) {
      slot.innerHTML = `<section class="cv" data-costvar aria-busy="true">${head(null)}<div class="cv-skel" role="status" aria-label="${esc(c.loading)}"></div></section>`;
      return;
    }
    if (entry.error) {
      const msg = entry.error === 'forbidden' ? c.forbidden : entry.error === 'offline' ? c.offline : c.error;
      slot.innerHTML = `<section class="cv" data-costvar>${head(null)}<div class="cv-card cv-empty"><p>${esc(msg)}</p>${entry.error === 'forbidden' ? '' : `<button class="kb" type="button" data-action="costvar-retry">${esc(c.retry)}</button>`}</div></section>`;
      return;
    }
    last.data = entry.data;
    slot.innerHTML = bdi(`<section class="cv" data-costvar>${head(entry.data)}${body(entry.data)}</section>`);
  }

  function mount(slot, opts) {
    slot = slot || document.querySelector('[data-costvar-slot]');
    if (!slot) return;
    const real = !!(opts && opts.real);
    last = { slot, real, restaurant: !!(opts && opts.restaurant), data: last.slot === slot ? last.data : null };
    if (!real) { paint(slot, null, false); return; }
    const m = merchant();
    if (!m) { paint(slot, { error: 'error' }, true); return; }
    const entry = cache.get(keyOf(m));
    const fresh = entry && (entry.data || entry.error) && Date.now() - entry.at < CACHE_MS;
    paint(slot, entry && (entry.data || entry.error) ? entry : null, true);
    if (fresh) return;
    load(m).then((e) => { if (last.slot === slot && merchant() === m) paint(slot, e, true); });
  }
  const remount = () => { if (last.slot && last.slot.isConnected) mount(last.slot, { real: last.real, restaurant: last.restaurant }); };

  /* ── Le détail d'une matière : ses mouvements et ses inventaires ───────── */
  function rowsOf(data) {
    if (!data || !data.sites) return [];
    return data.scope === 'all' ? mergeVariance(data.sites).rows
      : data.sites.flatMap((s) => ((s.variance || {}).rows || []).map((r) => Object.assign({ siteMerchant: s.merchant, site: s.name }, r)));
  }
  function itemBody(row, item, zone) {
    const c = t();
    const head = row && row.actualUse != null
      ? `<div class="cv-sum">${esc(c.cardLine(qty(row.actualUse, false, row.unit), qty(row.theoretical, false, row.unit), qty(row.gap, true, row.unit)))}${row.gapCents != null ? ' · ' + mad(row.gapCents, true) : ''}</div>` : '';
    const moves = (item.movements || []).map((m) => {
      const why = (c.moveReasons[m.reason] || m.reason) + (m.lossReason ? ' · ' + (c.reasons[m.lossReason] || m.lossReason) : '');
      const sub = [dayLabel(m.ts, zone, true), m.actor ? c.itemBy(m.actor) : '', m.note].filter(Boolean).join(' · ');
      return `<div class="cv-mv"><b>${esc(why)}</b><span class="${m.qty < 0 ? 'leak' : ''}">${esc(qty(m.qty, true, item.unit))}${m.cents != null ? ' · ' + mad(m.cents, true) : ''}</span><small>${esc(sub)}</small></div>`;
    }).join('');
    const counts = (item.counts || []).map((p) => `<div class="cv-mv"><b>${esc(dayLabel(p.ts, zone, true))}</b><span>${esc(qty(p.qty, false, item.unit))}</span></div>`).join('');
    return `${head}<div class="cv-eyebrow">${esc(c.itemMoves)}</div>${moves || `<div class="cv-note">${esc(c.itemNone)}</div>`}
      ${item.truncated ? `<div class="cv-note">${esc(c.itemMore)}</div>` : ''}
      ${counts ? `<div class="cv-eyebrow" style="margin-top:16px">${esc(c.itemCounts)}</div>${counts}` : ''}`;
  }
  async function openItem(el) {
    const c = t();
    const id = el && el.dataset && el.dataset.item;
    if (!id || !window.Kiwi || !window.Kiwi.modal) return;
    const data = last.data;
    const row = rowsOf(data).find((r) => r.itemId === id && (!el.dataset.site || r.siteMerchant === el.dataset.site)) || null;
    const zone = data && data.range && data.range.zone;
    const m = window.Kiwi.modal({ title: (row && row.name) || id, tag: c.leaks, body: '<div class="cv"><div class="cv-skel sm"></div></div>', width: 560 });
    const fill = (html) => { const b = m && m.el && m.el.querySelector('.kiwi-modal-body'); if (b) b.innerHTML = bdi(`<div class="cv">${html}</div>`); };
    if (!last.real || (data && data.demo)) {
      fill(itemBody(row, { movements: [], counts: row && row.openTs ? [{ ts: row.closeTs, qty: row.closing }, { ts: row.openTs, qty: row.opening }] : [], unit: row && row.unit }, zone));
      return;
    }
    const site = el.dataset.site || merchant();
    const win = el.dataset.open ? `&open=${encodeURIComponent(el.dataset.open)}&close=${encodeURIComponent(el.dataset.close)}` : '';
    try {
      const r = await fetch(`/api/cost-variance?merchant=${encodeURIComponent(site)}&days=${S.days}&item=${encodeURIComponent(id)}${win}`, { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.item) throw new Error('item');
      fill(itemBody(row, j.item, zone));
    } catch (_) {
      fill(`<div class="cv-note">${esc(navigator.onLine === false ? c.offline : c.error)}</div>`);
    }
  }

  /* ── Partage : brouillon WhatsApp (wa.me) et CSV, depuis ce qui est affiché */
  function shareText() {
    const c = t();
    const data = last.data;
    if (!data || !data.sites) return '';
    const all = data.scope === 'all' && data.total;
    const own = data.sites.find((s) => s.merchant === data.merchant) || data.sites[0];
    const R = all ? data.total.ratios : own.ratios;
    const r = data.range || {};
    const strip = (x) => String(x).replace(/[\u2066-\u2069\u200e]/g, '');
    const realPct = R.netSalesCents ? Math.round(R.marginOnConsumptionCents / R.netSalesCents * 1000) / 10 : null;
    const V = all ? mergeVariance(data.sites) : own.variance || {};
    const top = (rowsOf(data)).filter((x) => x.gapCents != null && x.gapCents > 0).slice(0, 5);
    const lines = [
      c.waHead(all ? c.scope.all : own.name, ...rangeLabels(r)),
      c.waRatios(mad(R.netSalesCents), pct(R.costPct), pct(realPct)),
      '',
      ...top.map((x) => c.waLine(x.name, mad(x.gapCents, true), qty(x.gap, true, x.unit))),
    ];
    if (V.measured) lines.push('', c.waFoot(mad(V.leakCents), mad(V.netGapCents, true)));
    return strip(lines.join('\n'));
  }
  function csvText() {
    const c = t();
    const quote = (s) => (/[",;\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    /* Un nom saisi par le commerçant ou l'équipe (matière, magasin) qui
       commence par = + - @, une tabulation ou un retour chariot deviendrait
       une formule dans Excel : il part précédé d'une apostrophe. Seulement
       les colonnes de texte ; un nombre (un écart négatif) reste un nombre. */
    const text = (v) => { const s = v == null ? '' : String(v); return quote(/^[=+\-@\t\r]/.test(s) ? "'" + s : s); };
    const num = (v) => (v == null || !Number.isFinite(Number(v)) ? '' : String(Number(v)));
    const rows = rowsOf(last.data).map((r) => [text(r.name), text(r.unit || ''), text(r.site || ''), text(statusOf(r) || 'ok'), num(r.opening), num(r.supply), num(r.closing),
      num(r.actualUse), num(r.theoretical != null ? r.theoretical : r.theoreticalInRange), num(r.waste), num(r.gap), r.gapCents == null ? '' : (r.gapCents / 100).toFixed(2)]);
    return '\uFEFF' + [c.csvCols.map(text), ...rows].map((r) => r.join(',')).join('\r\n');
  }

  H['costvar-mount'] = (slot, opts) => mount(slot && slot.nodeType === 1 ? slot : null, opts || {});
  H['costvar-period'] = (el) => {
    const d = +(el && el.dataset && el.dataset.days);
    if (!(d === 7 || d === 30 || d === 90) || d === S.days) return;
    S.days = d;
    try { localStorage.setItem('kiwiCostVarDays', String(d)); } catch (_) {}
    remount();
  };
  H['costvar-scope'] = (el) => {
    const k = el && el.dataset && el.dataset.scope;
    if ((k !== 'site' && k !== 'all') || k === S.scope) return;
    S.scope = k;
    remount();
  };
  H['costvar-retry'] = () => { const m = merchant(); if (m) cache.delete(keyOf(m)); remount(); };
  H['costvar-go'] = (el) => {
    const go = el && el.dataset && el.dataset.go;
    const list = (GO[trade()] || {})[go] || [];
    const name = list.find((n) => typeof H[n] === 'function');
    if (name) H[name](el); else toast(t().goMissing, 'warn');
  };
  H['costvar-item'] = (el) => { openItem(el).catch(() => {}); };
  H['costvar-wa'] = () => {
    const text = shareText();
    if (!text) return;
    try { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener'); } catch (_) {}
  };
  H['costvar-csv'] = () => {
    if (!last.data) return;
    const r = (last.data.range || {});
    try {
      const url = URL.createObjectURL(new Blob([csvText()], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `cout-reel-${r.fromDay || 'periode'}-${r.toDay || ''}.csv`.replace(/-\.csv$/, '.csv');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) {}
  };
  H['costvar-target'] = async (el) => {
    const c = t();
    const box = el && el.closest && el.closest('[data-cv-target]');
    const input = box && box.querySelector('[data-cv-target-input]');
    const clear = !!(el.dataset && el.dataset.clear);
    const raw = clear ? null : String(input && input.value || '').replace(',', '.').trim();
    const value = clear || raw === '' ? null : Number(raw);
    if (value !== null && !(value >= 1 && value <= 99)) { toast(c.targetBad, 'warn'); if (input) input.focus(); return; }
    const m = merchant();
    if (!m) return;
    el.disabled = true;
    try {
      const r = await fetch('/api/cost-variance', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant: m, action: 'target', minMarginPct: value }) });
      if (!r.ok) throw new Error('target');
      toast(c.targetSaved, 'success');
      [...cache.keys()].forEach((k) => { if (k.startsWith(m + '|')) cache.delete(k); });
      remount();
    } catch (_) {
      el.disabled = false;
      toast(c.targetFail, 'error');
    }
  };

})();
