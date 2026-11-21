/* Stock · fournisseurs en compétition (build 48, 20 nov. 2026 ; refonte 21 nov.).
 *
 * Le classement vit dans l'onglet Fournisseurs du stock d'un commerce : un
 * podium des trois premiers, puis le tableau complet où chaque score montre ses
 * quatre parts (ventes, marge, écoulement, retours), la place gagnée ou perdue
 * sur la période d'avant, la courbe des ventes et un verdict en une phrase.
 * Chaque fournisseur ouvre sa fiche. Les chiffres viennent de
 * /api/suppliers/ranking (ventes D1, jamais le grand livre local, partiel).
 * La démo (aucune session réelle) montre un classement de démonstration calculé
 * par la même fonction serveur sur le catalogue de Maison Mansour.
 * Les articles sans fournisseur se rangent par lot : la fiche article reçoit
 * `supplierId`, et le prochain classement les compte. */
window.KiwiStockInternal.install('suppliers', (S) => {
  'use strict';
  const { esc, fmtMad, lang, stMerchantSlug } = S;
  const STR = {
    fr: {
      eyebrow: 'Fournisseurs en compétition', title: 'Qui mérite la prochaine commande\u00a0?',
      sub: (d, n) => `Classés sur les ventes de la caisse · ${d} · ${n} fournisseur${n > 1 ? 's' : ''}`,
      period: { 30: '30 j', 90: '90 j', 365: '1 an' }, periodLong: { 30: '30 derniers jours', 90: '90 derniers jours', 365: '12 derniers mois' },
      loading: 'Calcul du classement…', demo: 'Démonstration', demoNote: 'Exemple calculé sur le catalogue de démonstration. Vos fournisseurs apparaîtront ici dès vos premières ventes.',
      legendReturns: 'Peu de retours', colSupplier: 'Fournisseur', colParts: 'Score détaillé', colSales: 'Ventes',
      offline: 'Le classement a besoin de la boutique en ligne : connectez-vous à votre compte pour le voir.',
      empty: 'Aucun fournisseur encore. Scannez un bon de livraison ou rangez vos articles par fournisseur.',
      score: 'Score', revenue: 'Ventes', margin: 'Marge', sell: 'Écoulement', returns: 'Retours', units: 'Pièces vendues',
      stock: 'En stock', noCost: 'prix d’achat manquant', none: '·', ord: (n) => (n === 1 ? '1er' : `${n}e`),
      up: (n) => `${n} place${n > 1 ? 's' : ''}`, down: (n) => `${n} place${n > 1 ? 's' : ''}`, same: 'Stable', fresh: 'Nouveau',
      vsBefore: 'par rapport à la période d’avant', of: (r, n) => `${r} sur ${n}`,
      how: 'Comment le score est calculé', howBody: 'Sur 100 points : 40 pour les ventes (comparées au meilleur fournisseur), 30 pour la marge (pleine à 60 %), 20 pour l’écoulement du stock, 10 pour peu de retours. Sans prix d’achat, la marge compte pour moitié.',
      profile: 'Fiche fournisseur', viewProfile: 'Voir la fiche', sparkCap: (d) => `Ventes · ${d}`,
      orderT: 'Préparer une commande', orderSub: 'Quantité proposée : ce qui s’est vendu sur la période, moins ce qui reste en stock.',
      orderQty: 'À commander', orderTotal: (n) => `Total · ${n} pièce${n > 1 ? 's' : ''}`, costEst: (v) => `≈ ${v} au prix d’achat`, piece: (n) => `${n} pièce${n > 1 ? 's' : ''}`, orderNone: 'Rien à réassortir : le stock couvre les ventes de la période.', orderCopy: 'Copier la commande', orderDone: 'Commande copiée', orderCopied: 'Commande copiée : collez-la dans WhatsApp ou un e-mail au fournisseur.',
      orderText: (name, lines) => `Bonjour ${name},\nVoici notre commande :\n${lines.join('\n')}\nMerci de nous confirmer les délais.`,
      table: 'Le classement complet', products: 'Articles', best: 'Meilleur', sleeping: 'Dort',
      noProducts: 'Aucun article rattaché à ce fournisseur.', curve: 'Ventes sur la période', why: 'D’où vient le score',
      stockValue: 'Valeur du stock', dead: 'Articles sans vente', open: 'Ouvrir la fiche',
      untagged: (n) => `${n} article${n > 1 ? 's' : ''} sans fournisseur : leurs ventes ne comptent pour personne.`, tagCta: 'Ranger par fournisseur',
      tagTitle: 'Ranger les articles', tagSub: 'Cochez les articles d’un même fournisseur, puis choisissez-le.',
      search: 'Chercher un article', allCats: 'Toutes les catégories', pick: 'Fournisseur…', newSup: 'Nouveau fournisseur',
      newName: 'Nom du nouveau fournisseur', apply: (n) => (n ? `Ranger ${n} article${n > 1 ? 's' : ''}` : 'Cochez des articles'), all: 'Tout cocher',
      done: (n, name) => `${n} article${n > 1 ? 's' : ''} rangé${n > 1 ? 's' : ''} chez ${name}`, needPick: 'Choisissez un fournisseur et au moins un article.',
      allTagged: 'Tous vos articles ont un fournisseur.',
      v: {
        reorder: ['Réassortir', 'Ses articles partent et laissent de la marge : passez la prochaine commande ici.'],
        fast: ['Réassortir', 'Ses articles partent vite : recommandez avant la rupture.'],
        cost: ['Prix d’achat manquant', 'Saisissez ses prix d’achat : sans eux, sa marge compte pour moitié dans le score.'],
        sleep: ['Stock qui dort', 'Ses articles partent lentement : écoulez ce stock avant de recommander.'],
        back: ['Retours élevés', (p) => `${p} des pièces reviennent : parlez qualité et tailles avant de recommander.`],
        thin: ['Négocier le prix', 'Ça se vend, mais la marge est mince : négociez le prix d’achat.'],
        keep: ['À garder', 'Solide, sans plus : gardez-le et surveillez sa marge.'],
        idle: ['Sans vente', 'Aucune vente sur la période.'],
      },
    },
    en: {
      eyebrow: 'Suppliers head to head', title: 'Who earns the next order?',
      sub: (d, n) => `Ranked on till sales · ${d} · ${n} supplier${n > 1 ? 's' : ''}`,
      period: { 30: '30 d', 90: '90 d', 365: '1 yr' }, periodLong: { 30: 'last 30 days', 90: 'last 90 days', 365: 'last 12 months' },
      loading: 'Ranking suppliers…', demo: 'Demo', demoNote: 'Example built on the demo catalogue. Your suppliers will show here after your first sales.',
      legendReturns: 'Few returns', colSupplier: 'Supplier', colParts: 'Score breakdown', colSales: 'Sales',
      offline: 'The ranking needs your shop online: sign in to your account to see it.',
      empty: 'No suppliers yet. Scan a delivery note or file your products by supplier.',
      score: 'Score', revenue: 'Sales', margin: 'Margin', sell: 'Sell-through', returns: 'Returns', units: 'Units sold',
      stock: 'In stock', noCost: 'cost price missing', none: '·', ord: (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`,
      up: (n) => `${n} place${n > 1 ? 's' : ''}`, down: (n) => `${n} place${n > 1 ? 's' : ''}`, same: 'Steady', fresh: 'New',
      vsBefore: 'versus the period before', of: (r, n) => `${r} of ${n}`,
      how: 'How the score works', howBody: 'Out of 100 points: 40 for sales (against the best supplier), 30 for margin (full at 60%), 20 for stock sell-through, 10 for few returns. Without cost prices, margin counts for half.',
      profile: 'Supplier profile', viewProfile: 'View profile', sparkCap: (d) => `Sales · ${d}`,
      orderT: 'Prepare an order', orderSub: 'Suggested quantity: what sold over the period, minus what is left in stock.',
      orderQty: 'To order', orderTotal: (n) => `Total · ${n} piece${n > 1 ? 's' : ''}`, costEst: (v) => `≈ ${v} at cost price`, piece: (n) => `${n} piece${n > 1 ? 's' : ''}`, orderNone: 'Nothing to restock: stock covers the period’s sales.', orderCopy: 'Copy the order', orderDone: 'Order copied', orderCopied: 'Order copied: paste it into WhatsApp or an e-mail to the supplier.',
      orderText: (name, lines) => `Hello ${name},\nHere is our order:\n${lines.join('\n')}\nPlease confirm the lead time.`,
      table: 'Full ranking', products: 'Products', best: 'Best', sleeping: 'Idle',
      noProducts: 'No products linked to this supplier.', curve: 'Sales over the period', why: 'Where the score comes from',
      stockValue: 'Stock value', dead: 'Products with no sale', open: 'Open profile',
      untagged: (n) => `${n} product${n > 1 ? 's' : ''} without a supplier: their sales count for nobody.`, tagCta: 'File by supplier',
      tagTitle: 'File products', tagSub: 'Tick the products from one supplier, then pick it.',
      search: 'Search a product', allCats: 'All categories', pick: 'Supplier…', newSup: 'New supplier',
      newName: 'New supplier name', apply: (n) => (n ? `File ${n} product${n > 1 ? 's' : ''}` : 'Tick some products'), all: 'Tick all',
      done: (n, name) => `${n} product${n > 1 ? 's' : ''} filed under ${name}`, needPick: 'Pick a supplier and at least one product.',
      allTagged: 'Every product has a supplier.',
      v: {
        reorder: ['Reorder', 'Their products sell and leave margin: place the next order here.'],
        fast: ['Reorder', 'Their products sell fast: reorder before you run out.'],
        cost: ['Cost price missing', 'Enter their cost prices: without them, margin counts for half the score.'],
        sleep: ['Idle stock', 'Their products move slowly: sell this stock before reordering.'],
        back: ['High returns', (p) => `${p} of pieces come back: talk quality and sizing before reordering.`],
        thin: ['Negotiate', 'It sells, but the margin is thin: negotiate the cost price.'],
        keep: ['Keep', 'Solid, nothing more: keep them and watch the margin.'],
        idle: ['No sales', 'No sales over the period.'],
      },
    },
    ar: {
      eyebrow: 'الموردون في منافسة', title: 'من يستحق الطلبية القادمة؟',
      sub: (d, n) => `مرتبون حسب مبيعات الصندوق · ${d} · ${n === 1 ? 'مورد واحد' : n === 2 ? 'موردان' : n <= 10 ? `${n} موردين` : `${n} موردًا`}`,
      period: { 30: '30 يومًا', 90: '90 يومًا', 365: 'سنة' }, periodLong: { 30: 'آخر 30 يومًا', 90: 'آخر 90 يومًا', 365: 'آخر 12 شهرًا' },
      loading: 'جارٍ ترتيب الموردين…', demo: 'عرض تجريبي', demoNote: 'مثال محسوب على كتالوج العرض التجريبي. سيظهر موردوك هنا بعد مبيعاتك الأولى.',
      legendReturns: 'قلة المرتجعات', colSupplier: 'المورد', colParts: 'تفصيل النقطة', colSales: 'المبيعات',
      offline: 'الترتيب يحتاج المتجر متصلًا: ادخل إلى حسابك لتراه.',
      empty: 'لا يوجد موردون بعد. امسح وصل استلام أو صنّف سلعك حسب المورد.',
      score: 'النقطة', revenue: 'المبيعات', margin: 'الهامش', sell: 'التصريف', returns: 'المرتجعات', units: 'القطع المبيعة',
      stock: 'في المخزون', noCost: 'ثمن الشراء غير مسجل', none: '·', ord: (n) => `${n}`,
      up: (n) => `${n}`, down: (n) => `${n}`, same: 'ثابت', fresh: 'جديد',
      vsBefore: 'مقارنة بالفترة السابقة', of: (r, n) => `${r} من ${n}`,
      how: 'كيف تُحسب النقطة', howBody: 'من 100 نقطة: 40 للمبيعات (مقارنة بأفضل مورد)، 30 للهامش (كاملة عند 60٪)، 20 لتصريف المخزون، 10 لقلة المرتجعات. بلا ثمن شراء، يُحسب الهامش بالنصف.',
      profile: 'ملف المورد', viewProfile: 'عرض الملف', sparkCap: (d) => `المبيعات · ${d}`,
      orderT: 'تحضير طلبية', orderSub: 'الكمية المقترحة: ما بيع خلال الفترة ناقص ما تبقى في المخزون.',
      orderQty: 'للطلب', orderTotal: (n) => `المجموع · ${n} قطعة`, costEst: (v) => `≈ ${v} بثمن الشراء`, piece: (n) => `${n} قطعة`, orderNone: 'لا شيء لإعادة التزويد: المخزون يغطي مبيعات الفترة.', orderCopy: 'انسخ الطلبية', orderDone: 'نُسخت الطلبية', orderCopied: 'نُسخت الطلبية: الصقها في واتساب أو في بريد إلى المورد.',
      orderText: (name, lines) => `السلام عليكم ${name}،\nهذه طلبيتنا:\n${lines.join('\n')}\nالمرجو تأكيد آجال التسليم.`,
      table: 'الترتيب الكامل', products: 'السلع', best: 'الأفضل', sleeping: 'راكدة',
      noProducts: 'لا سلعة مرتبطة بهذا المورد.', curve: 'المبيعات خلال الفترة', why: 'من أين تأتي النقطة',
      stockValue: 'قيمة المخزون', dead: 'سلع بلا بيع', open: 'فتح الملف',
      untagged: (n) => `${n} سلعة بلا مورد: مبيعاتها لا تُحسب لأحد.`, tagCta: 'صنّف حسب المورد',
      tagTitle: 'تصنيف السلع', tagSub: 'أشّر على سلع المورد نفسه، ثم اختره.',
      search: 'ابحث عن سلعة', allCats: 'كل الأصناف', pick: 'المورد…', newSup: 'مورد جديد',
      newName: 'اسم المورد الجديد', apply: (n) => (n ? `صنّف ${n} سلعة` : 'أشّر على السلع'), all: 'أشّر على الكل',
      done: (n, name) => `${n} سلعة صُنّفت عند ${name}`, needPick: 'اختر موردًا وسلعة واحدة على الأقل.',
      allTagged: 'كل سلعك لها مورد.',
      v: {
        reorder: ['أعد الطلب', 'سلعه تُباع وتترك هامشًا جيدًا: اجعل طلبيتك القادمة عنده.'],
        fast: ['أعد الطلب', 'سلعه تنفد بسرعة: جدّد الطلب قبل أن ينفد المخزون.'],
        cost: ['ثمن الشراء ناقص', 'سجّل أثمنة شرائه: بدونها يُحسب الهامش بالنصف.'],
        sleep: ['مخزون راكد', 'سلعه بطيئة البيع: صرّف هذا المخزون قبل أي طلبية جديدة.'],
        back: ['مرتجعات كثيرة', (p) => `${p} من القطع تعود: ناقش معه الجودة والمقاسات قبل الطلب.`],
        thin: ['فاوض على الثمن', 'سلعه تُباع، لكن الهامش ضعيف: فاوض على ثمن الشراء.'],
        keep: ['احتفظ به', 'أداء جيد دون تميّز: احتفظ به وراقب الهامش.'],
        idle: ['بلا مبيعات', 'لا مبيعات خلال هذه الفترة.'],
      },
    },
  };
  const L = () => STR[lang()] || STR.fr;
  const pct = (v) => (v == null ? L().none : (lang() === 'en' ? `${Math.round(v * 100)}%` : `${Math.round(v * 100)} %`));
  const PERIODS = [30, 90, 365];
  const PARTS = [['sales', 40, 'revenue'], ['margin', 30, 'margin'], ['sell', 20, 'sell'], ['returns', 10, 'returns']];
  const TTL = 60000;
  let days = 30, last = null;
  const cache = new Map();
  const isReal = () => { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; } };

  /* Démonstration : Maison Mansour, calculée par rankSuppliers + withPrevious
     (functions/api/suppliers/ranking.js) sur des ventes synthétiques de son
     catalogue. N'apparaît jamais dans une session réelle. */
  const DEMO = {"30":[["sup_fassi","Atelier Fassi Couture",86,1,1,73170,25,41377,0.5655,0.3906,0,0,39,43042,0,[40,28.3,7.8,10],[1520,0,3670,1520,10690,3040,12790,0,7470,6770,18230,7470],[["prod_2","Caftan Fassi",8,24320,13760,8,0],["prod_19","Caftan Signature Mansour",4,17720,10020,4,0],["prod_32","Caftan Velours",6,14040,7932,9,0],["prod_62","Caftan Soirée Perlé",3,11010,6225,4,0],["prod_45","Caftan Coton Été",4,6080,3440,14,0]]],["sup_babouche","Maâlem Babouches Fès",68,2,3,29950,73,16850,0.5626,0.6887,1,0.0137,33,5424,0,[16.4,28.1,13.8,9.5],[700,700,880,580,1800,3080,440,3480,4430,2960,5160,5740],[["prod_161","Babouche brodée femme",28,12320,6916,8,0],["prod_177","Cherbil perlé",14,7980,4508,5,0],["prod_145","Babouche cuir homme",21,7350,4116,12,1],["prod_193","Babouche enfant",10,2300,1310,8,0]]],["sup_takchita","Dar Takchita Rabat",58,3,2,40980,10,23160,0.5652,0.2857,2,0.2,25,38390,0,[22.4,28.3,5.7,2],[0,8470,4050,0,7080,4050,0,7590,0,0,4050,5690],[["prod_76","Takchita Sultane",4,16200,9160,6,1],["prod_102","Takchita Mariage",2,11380,6430,2,0],["prod_89","Takchita Zellige",3,10620,6000,7,1],["prod_115","Takchita Amira",1,2780,1570,10,0]]],["sup_soie","Soie & Perles Tétouan",37,4,5,7530,19,null,null,0.3725,0,0,32,3707,0,[4.1,15,7.5,10],[800,400,400,300,1530,300,230,790,300,1090,790,600],[["prod_132","Foulard soie",9,2700,1512,12,0],["prod_129","Mdamma dorée",3,2370,null,4,0],["prod_137","Châle laine",5,2000,1120,7,0],["prod_141","Broche perles",2,460,262,9,0]]],["sup_cuir","Cuir & Tresse Marrakech",32,5,4,1980,2,1122,0.5667,0.125,1,0.5,14,3638,2,[1.1,28.3,2.5,0],[0,1980,0,0,0,0,0,0,0,0,0,0],[["prod_207","Sac cuir tressé",2,1980,1122,3,1],["prod_210","Cabas berbère",0,0,0,6,0],["prod_213","Pochette sequins",0,0,0,5,0]]]],"90":[["sup_fassi","Atelier Fassi Couture",92,1,1,246290,81,139279,0.5655,0.675,0,0,39,43042,0,[40,28.3,13.5,10],[12720,8290,0,9750,16390,23230,8290,17540,18230,42020,56650,33180],[["prod_2","Caftan Fassi",28,85120,48160,8,0],["prod_19","Caftan Signature Mansour",17,75310,42585,4,0],["prod_32","Caftan Velours",17,39780,22474,9,0],["prod_62","Caftan Soirée Perlé",8,29360,16600,4,0],["prod_45","Caftan Coton Été",11,16720,9460,14,0]]],["sup_babouche","Maâlem Babouches Fès",69,2,3,90230,224,50747,0.5624,0.8716,4,0.0179,33,5424,0,[14.7,28.1,17.4,9.3],[670,2370,4250,2810,6500,6100,7290,13480,8200,15810,11550,11200],[["prod_161","Babouche brodée femme",81,35640,20007,8,0],["prod_145","Babouche cuir homme",76,26600,14896,12,4],["prod_177","Cherbil perlé",37,21090,11914,5,0],["prod_193","Babouche enfant",30,6900,3930,8,0]]],["sup_takchita","Dar Takchita Rabat",62,3,2,126990,31,71770,0.5652,0.5536,6,0.1935,25,38390,0,[20.6,28.3,11.1,2.3],[5690,11380,6320,12150,18460,20110,7080,2780,11130,19740,12150,0],[["prod_76","Takchita Sultane",13,52650,29770,6,3],["prod_102","Takchita Mariage",6,34140,19290,2,0],["prod_89","Takchita Zellige",9,31860,18000,7,3],["prod_115","Takchita Amira",3,8340,4710,10,0]]],["sup_soie","Soie & Perles Tétouan",41,4,5,21790,55,null,null,0.6322,0,0,32,3707,0,[3.5,15,12.6,10],[400,2680,1390,830,400,1790,1920,2330,1290,2690,2590,3480],[["prod_132","Foulard soie",27,8100,4536,12,0],["prod_129","Mdamma dorée",9,7110,null,4,0],["prod_137","Châle laine",13,5200,2912,7,0],["prod_141","Broche perles",6,1380,786,9,0]]],["sup_cuir","Cuir & Tresse Marrakech",35,5,4,5940,6,3366,0.5667,0.3,3,0.5,14,3638,2,[1,28.3,6,0],[990,0,0,0,2970,0,0,0,0,990,990,0],[["prod_207","Sac cuir tressé",6,5940,3366,3,3],["prod_210","Cabas berbère",0,0,0,6,0],["prod_213","Pochette sequins",0,0,0,5,0]]]],"365":[["sup_fassi","Atelier Fassi Couture",96,1,1,904820,309,511672,0.5655,0.8879,0,0,39,43042,0,[40,28.3,17.8,10],[26200,40000,63610,62150,53410,65770,38490,85000,99130,121840,128570,120650],[["prod_2","Caftan Fassi",96,291840,165120,8,0],["prod_19","Caftan Signature Mansour",55,243650,137775,4,0],["prod_32","Caftan Velours",71,166140,93862,9,0],["prod_62","Caftan Soirée Perlé",33,121110,68475,4,0],["prod_45","Caftan Coton Été",54,82080,46440,14,0]]],["sup_babouche","Maâlem Babouches Fès",74,2,3,384970,945,216545,0.5625,0.9663,15,0.0159,33,5424,0,[17,28.1,19.3,9.4],[2830,7870,13680,24230,24380,26920,34800,43860,41990,54200,53260,56950],[["prod_161","Babouche brodée femme",356,156640,87932,8,0],["prod_145","Babouche cuir homme",295,103250,57820,12,15],["prod_177","Cherbil perlé",169,96330,54418,5,0],["prod_193","Babouche enfant",125,28750,16375,8,0]]],["sup_takchita","Dar Takchita Rabat",69,3,2,496690,122,280705,0.5652,0.8299,25,0.2049,25,38390,0,[22,28.3,16.6,1.8],[31380,20620,17960,51340,43500,55520,59580,42880,38710,26680,61850,46670],[["prod_76","Takchita Sultane",48,194400,109920,6,12],["prod_89","Takchita Zellige",39,138060,78000,7,13],["prod_102","Takchita Mariage",23,130870,73945,2,0],["prod_115","Takchita Amira",12,33360,18840,10,0]]],["sup_soie","Soie & Perles Tétouan",46,4,5,90640,221,null,null,0.8735,0,0,32,3707,0,[4,15,17.5,10],[2460,4820,3520,4580,5850,8530,7910,8330,10020,11700,10890,12030],[["prod_129","Mdamma dorée",41,32390,null,4,0],["prod_132","Foulard soie",95,28500,15960,12,0],["prod_137","Châle laine",60,24000,13440,7,0],["prod_141","Broche perles",25,5750,3275,9,0]]],["sup_cuir","Cuir & Tresse Marrakech",42,5,4,23760,24,13464,0.5667,0.6316,12,0.5,14,3638,2,[1.1,28.3,12.6,0],[2970,990,2970,0,2970,0,1980,3960,990,990,4950,990],[["prod_207","Sac cuir tressé",24,23760,13464,3,12],["prod_210","Cabas berbère",0,0,0,6,0],["prod_213","Pochette sequins",0,0,0,5,0]]]]};
  function demoData(d) {
    const rows = DEMO[d] || DEMO[30];
    const now = Date.now();
    return {
      demo: true, period: { days: d, from: now - d * 86400000, to: now }, untagged: { products: 0 },
      suppliers: rows.map((r) => ({
        id: r[0], name: r[1], score: r[2], rank: r[3], prevRank: r[4], revenue: r[5], units: r[6], margin: r[7], marginRate: r[8],
        sellThrough: r[9], returnedUnits: r[10], returnRate: r[11], stock: r[12], stockValue: r[13], deadProducts: r[14],
        parts: r[15] && { sales: r[15][0], margin: r[15][1], sell: r[15][2], returns: r[15][3] }, series: r[16], productCount: r[17].length,
        products: r[17].map((p) => ({ id: p[0], name: p[1], units: p[2], revenue: p[3], margin: p[4], stock: p[5], returned: p[6], cost: p[2] > 0 && p[4] != null ? Math.round((p[3] - p[4]) / p[2]) : null })),
        top: r[17][0] && r[17][0][2] > 0 ? { id: r[17][0][0], name: r[17][0][1] } : null,
      })),
    };
  }

  const CSS = `
  .sr-board,.sr-pro{--sr-glow:#7DF2B0}
  .sr-board{--sr-line:color-mix(in srgb,currentColor 11%,transparent);--sr-soft:color-mix(in srgb,currentColor 5%,transparent);--sr-mute:color-mix(in srgb,currentColor 62%,transparent)}
  .sr-board:empty{display:none}
  .sr-head{display:flex;gap:16px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;margin-bottom:20px}
  .sr-eyebrow{display:inline-flex;align-items:center;gap:6px;margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--atlas)}
  .sr-eyebrow svg{width:15px;height:15px}
  .sr-title{margin:0;font-size:26px;line-height:1.1;font-weight:600;letter-spacing:-.025em}
  .sr-sub{margin:6px 0 0;font-size:13px;color:var(--sr-mute)}
  .sr-tagdemo{display:inline-block;margin-inline-start:8px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:500;background:var(--sr-soft);vertical-align:2px}
  .sr-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--sr-soft);border:1px solid var(--sr-line)}
  .sr-seg button{font:inherit;font-size:12.5px;font-weight:500;padding:7px 14px;min-height:34px;border:0;border-radius:999px;background:transparent;color:inherit;cursor:pointer}
  .sr-seg button.on{font-weight:600}
  .sr-podium{display:grid;grid-template-columns:1fr 1.12fr 1fr;gap:12px;align-items:end;margin-bottom:22px}
  .sr-card{position:relative;display:grid;gap:12px;padding:18px 18px 0;border-radius:18px;border:1px solid var(--sr-line);background:var(--surface);color:inherit;font:inherit;text-align:start;cursor:pointer;overflow:hidden;transition:border-color .18s,box-shadow .18s,transform .31s var(--spring)}
  .sr-card:hover{border-color:color-mix(in srgb,var(--atlas) 50%,transparent);box-shadow:0 10px 28px -18px rgba(5,59,44,.45);transform:translateY(-2px)}
  .sr-card:focus-visible,.sr-row:focus-visible{outline:2px solid var(--atlas);outline-offset:2px}
  /* Le premier garde le vert profond de la marque (#053B2C, --riad) et la menthe (#7DF2B0) dans les deux thèmes : les peaux sombres repeignent --riad presque noir. */
  .sr-card[data-rank="1"]{--sr-glow:#7DF2B0;background:radial-gradient(120% 90% at 100% 0%,rgba(125,242,176,.16),transparent 58%),#053B2C;color:#F7F5F0;border-color:rgba(125,242,176,.22);padding-top:22px}
  .sr-card[data-rank="1"]:hover{box-shadow:0 18px 40px -20px rgba(5,59,44,.75)}
  .sr-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
  .sr-ord{font-size:24px;line-height:1;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:color-mix(in srgb,currentColor 82%,transparent)}
  .sr-card[data-rank="1"] .sr-ord{font-size:30px;color:var(--sr-glow)}
  .sr-who{display:flex;align-items:center;gap:10px;min-width:0}
  .sr-mono{flex:none;width:36px;height:36px;border-radius:11px;display:grid;place-items:center;font-size:13px;font-weight:600;letter-spacing:.02em;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas)}
  .sr-card[data-rank="1"] .sr-mono{background:color-mix(in srgb,var(--sr-glow) 16%,transparent);color:var(--sr-glow)}
  .sr-name{font-weight:600;font-size:15px;line-height:1.2;overflow-wrap:anywhere}
  .sr-ringrow{display:flex;align-items:center;gap:14px}
  .sr-ring{flex:none;position:relative;display:grid;place-items:center}
  .sr-ring svg{display:block;transform:rotate(-90deg)}
  .sr-ring .trk{stroke:color-mix(in srgb,currentColor 12%,transparent)}
  .sr-ring .val{stroke:var(--atlas);stroke-linecap:round}
  .sr-card[data-rank="1"] .sr-ring .val{stroke:var(--sr-glow)}
  .sr-ring b{position:absolute;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
  .sr-ring small{position:absolute;bottom:-1px;font-size:9.5px;opacity:.6;letter-spacing:.04em;text-transform:uppercase}
  .sr-spark{display:block;max-width:none;width:calc(100% + 36px);height:46px;margin:0 -18px;direction:ltr}
  .sr-spark .ln{fill:none;stroke:var(--atlas);stroke-width:1.6;vector-effect:non-scaling-stroke}
  .sr-spark .ar{fill:color-mix(in srgb,var(--atlas) 13%,transparent)}
  .sr-card[data-rank="1"] .sr-spark .ln{stroke:var(--sr-glow)}
  .sr-card[data-rank="1"] .sr-spark .ar{fill:color-mix(in srgb,var(--sr-glow) 16%,transparent)}
  .sr-move{display:inline-flex;align-items:center;gap:3px;padding:3px 8px 3px 6px;border-radius:999px;font-size:11.5px;font-weight:500;white-space:nowrap;font-variant-numeric:tabular-nums;background:var(--sr-soft)}
  .sr-move svg{width:13px;height:13px}
  .sr-move.up{color:var(--atlas);background:color-mix(in srgb,var(--atlas) 11%,transparent)}
  .sr-move.down{color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,transparent)}
  .sr-card[data-rank="1"] .sr-move{color:var(--sr-glow);background:color-mix(in srgb,var(--sr-glow) 14%,transparent)}
  .sr-card[data-rank="1"] .sr-move.same{color:#F7F5F0}
  .sr-verdict{display:inline-flex;align-items:center;gap:5px;width:max-content;max-width:100%;padding:4px 9px 4px 7px;border-radius:999px;font-size:11.5px;font-weight:500}
  .sr-verdict svg{width:14px;height:14px;flex:none}
  .sr-verdict.good{color:var(--atlas);background:color-mix(in srgb,var(--atlas) 11%,transparent)}
  .sr-verdict.watch{color:var(--warn-ink);background:var(--warn-soft)}
  .sr-verdict.bad{color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,transparent)}
  .sr-verdict.ok,.sr-verdict.idle{background:var(--sr-soft)}
  .sr-card[data-rank="1"] .sr-verdict.good{color:var(--riad);background:var(--sr-glow)}
  .sr-tablehead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 10px}
  .sr-tablehead h4{margin:0;font-size:14px;font-weight:600}
  .sr-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--sr-mute)}
  .sr-legend span{display:inline-flex;align-items:center;gap:5px}
  .sr-legend i{width:9px;height:9px;border-radius:3px}
  .sr-howbtn{font:inherit;font-size:12px;display:inline-flex;align-items:center;gap:5px;padding:6px 10px;min-height:32px;border-radius:999px;border:1px solid var(--sr-line);background:transparent;color:inherit;cursor:pointer}
  .sr-howbtn svg{width:14px;height:14px}
  .sr-howbody{margin:0 0 12px;padding:12px 14px;border-radius:12px;background:var(--sr-soft);font-size:12.5px;line-height:1.5}
  .p-sales{background:var(--riad,#053B2C)}.p-margin{background:var(--atlas)}.p-sell{background:color-mix(in srgb,var(--atlas) 45%,var(--sr-glow))}.p-returns{background:color-mix(in srgb,var(--sr-glow) 55%,transparent)}
  .sr-rows{list-style:none;margin:0;padding:0;display:grid;gap:6px}
  .sr-row,.sr-cols{display:grid;grid-template-columns:28px minmax(170px,1.3fr) minmax(160px,2.2fr) 120px 48px 20px;gap:14px;align-items:center;width:100%;padding:11px 12px;border-radius:13px;border:1px solid var(--sr-line);background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer;transition:border-color .18s,background-color .18s}
  .sr-row:hover{border-color:color-mix(in srgb,var(--atlas) 45%,transparent);background:color-mix(in srgb,var(--atlas) 3%,transparent)}
  .sr-row:hover .sr-chev{color:var(--atlas);transform:translateX(2px)}
  [dir="rtl"] .sr-row:hover .sr-chev{transform:translateX(-2px)}
  .sr-chev{display:grid;place-items:center;color:var(--sr-mute);transition:transform .31s var(--spring),color .18s}
  .sr-chev svg{width:18px;height:18px}
  .sr-cardfoot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .sr-view{display:inline-flex;align-items:center;gap:1px;font-size:12px;font-weight:500;color:var(--atlas)}
  .sr-view svg{width:16px;height:16px}
  .sr-card[data-rank="1"] .sr-view{color:var(--sr-glow)}
  .sr-sparkcap{margin-bottom:-8px;font-size:10.5px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;opacity:.55}
  .sr-order-sub{margin:-4px 0 10px;font-size:12.5px;color:color-mix(in srgb,currentColor 62%,transparent)}
  .sr-cols{padding:0 13px 6px;border:0;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--sr-mute)}
  .sr-cols span:first-child{text-align:center}.sr-cols span:nth-child(4),.sr-cols span:nth-child(5){text-align:end}
  .sr-pair{display:grid;gap:8px;min-width:0;font-variant-numeric:tabular-nums}
  .sr-pair span{display:grid;gap:1px;font-size:15px;font-weight:600;letter-spacing:-.01em}
  .sr-pair small{font-size:11px;font-weight:500;letter-spacing:.03em;text-transform:uppercase;opacity:.62}
  .sr-demonote{display:flex;align-items:flex-start;gap:6px;margin:10px 0 0;max-width:62ch;padding:8px 11px;border-radius:10px;background:var(--sr-soft);font-size:12.5px;line-height:1.4}
  .sr-demonote svg{width:15px;height:15px;flex:none;margin-top:1px;color:var(--atlas)}
  .sr-ring .val.mid{stroke:var(--warning)}.sr-ring .val.low{stroke:var(--danger)}
  .sr-rank{font-weight:600;font-variant-numeric:tabular-nums;font-size:15px;text-align:center;color:var(--sr-mute)}
  .sr-row[data-rank="1"] .sr-rank{color:var(--atlas)}
  .sr-row .sr-name{font-size:13.5px}
  .sr-row .sr-verdict{margin-top:4px;padding:2px 8px 2px 6px;font-size:11px}
  .sr-stack{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--sr-soft)}
  .sr-stack i{display:block;height:100%}
  .sr-stack i+i{box-shadow:inset 1.5px 0 0 var(--surface)}
  .sr-money{font-size:12.5px;font-variant-numeric:tabular-nums;text-align:end}
  .sr-money small{display:block;margin-top:2px}
  .sr-sc{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.03em;text-align:end}
  .sr-note{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:14px;padding:12px 14px;border-radius:13px;background:var(--warn-soft);color:var(--warn-ink);font-size:13px}
  .sr-state{padding:28px 18px;border-radius:14px;border:1px dashed var(--sr-line);text-align:center;color:var(--sr-mute);font-size:13px}
  .sr-skel{display:grid;grid-template-columns:1fr 1.12fr 1fr;gap:12px;align-items:end}
  .sr-skel i{display:block;border-radius:18px;background:var(--sr-soft);animation:sr-pulse 1.4s ease-in-out infinite}
  .sr-skel i:nth-child(1){height:190px}.sr-skel i:nth-child(2){height:230px}.sr-skel i:nth-child(3){height:170px}
  @keyframes sr-pulse{50%{opacity:.45}}
  .sr-anim .sr-ring .val{animation:sr-ring 1.1s var(--expo) both}
  .sr-anim .sr-stack i,.sr-anim .sr-bar i{transform-origin:left center;animation:sr-grow .9s var(--expo) both}
  [dir="rtl"] .sr-anim .sr-stack i,[dir="rtl"] .sr-anim .sr-bar i{transform-origin:right center}
  .sr-anim .sr-card{animation:sr-rise .6s var(--expo) both}
  .sr-anim .sr-card[data-rank="1"]{animation-delay:.06s}.sr-anim .sr-card[data-rank="3"]{animation-delay:.12s}
  @keyframes sr-ring{from{stroke-dashoffset:var(--c)}}
  @keyframes sr-grow{from{transform:scaleX(0)}}
  @keyframes sr-rise{from{opacity:0;transform:translateY(14px)}}
  @media (prefers-reduced-motion:reduce){.sr-anim .sr-ring .val,.sr-anim .sr-stack i,.sr-anim .sr-bar i,.sr-anim .sr-bars i,.sr-anim .sr-card,.sr-skel i{animation:none}.sr-card,.sr-card:hover{transition:none;transform:none}}
  .sr-pro{display:grid;gap:18px}
  .sr-pro-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .sr-pro-head .sr-mono{width:52px;height:52px;border-radius:15px;font-size:17px}
  .sr-pro-id{flex:1 1 200px;min-width:0}
  .sr-pro-id .sr-name{font-size:20px;letter-spacing:-.02em}
  .sr-pro-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:color-mix(in srgb,currentColor 62%,transparent)}
  .sr-say{display:flex;gap:10px;align-items:flex-start;padding:13px 15px;border-radius:14px;font-size:13.5px;line-height:1.45}
  .sr-say svg{width:18px;height:18px;flex:none;margin-top:1px}
  .sr-say.good{background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas)}
  .sr-say.watch{background:var(--warn-soft);color:var(--warn-ink)}
  .sr-say.bad{background:color-mix(in srgb,var(--danger) 9%,transparent);color:var(--danger)}
  .sr-say.ok,.sr-say.idle{background:color-mix(in srgb,currentColor 5%,transparent)}
  .sr-say b{font-weight:600;margin-inline-end:4px}
  .sr-pro-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .sr-panel{padding:16px;border-radius:14px;border:1px solid color-mix(in srgb,currentColor 11%,transparent)}
  .sr-panel h4{margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:color-mix(in srgb,currentColor 62%,transparent)}
  .sr-why{display:grid;gap:12px}
  .sr-why-row{display:grid;grid-template-columns:1fr auto;gap:4px 10px;font-size:13px}
  .sr-why-row .val{color:color-mix(in srgb,currentColor 62%,transparent);font-variant-numeric:tabular-nums}
  .sr-why-row .pts{font-weight:600;font-variant-numeric:tabular-nums;text-align:end}
  .sr-why-row .pts small{font-weight:400;opacity:.55}
  .sr-bar{grid-column:1/-1;height:7px;border-radius:999px;background:color-mix(in srgb,currentColor 7%,transparent);overflow:hidden}
  .sr-bar i{display:block;height:100%;border-radius:999px}
  .sr-bars{display:flex;align-items:flex-end;gap:5px;height:140px;padding-bottom:1px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);direction:ltr}
  .sr-bars i{flex:1;border-radius:5px 5px 2px 2px;background:var(--atlas);min-height:0}
  .sr-bars i:last-child{background:color-mix(in srgb,var(--atlas) 70%,var(--sr-glow))}
  .sr-anim .sr-bars i{transform-origin:bottom;animation:sr-up .8s var(--expo) both}
  @keyframes sr-up{from{transform:scaleY(0)}}
  .sr-axis{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:color-mix(in srgb,currentColor 55%,transparent);direction:ltr}
  .sr-curve-total{font-size:22px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin:-4px 0 8px}
  .sr-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .sr-kpi{padding:11px 12px;border-radius:12px;background:color-mix(in srgb,currentColor 4%,transparent)}
  .sr-kpi .l{font-size:11.5px;color:color-mix(in srgb,currentColor 60%,transparent)}
  .sr-kpi .v{margin-top:3px;font-weight:600;font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sr-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
  .sr-table th{font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:color-mix(in srgb,currentColor 55%,transparent)}
  .sr-table th,.sr-table td{padding:9px 6px;border-bottom:1px solid color-mix(in srgb,currentColor 9%,transparent);text-align:end;white-space:nowrap}
  .sr-table th:first-child,.sr-table td:first-child{text-align:start;white-space:normal}
  .sr-pill{display:inline-block;margin-inline-start:6px;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:500;vertical-align:1px}
  .sr-pill.best{background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas)}
  .sr-pill.dead{background:var(--warn-soft);color:var(--warn-ink)}
  .sr-scroll{overflow-x:auto}
  .sr-h4{margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:color-mix(in srgb,currentColor 62%,transparent)}
  .sr-table td.sr-qty,.sr-table th.sr-qty{width:84px}
  .sr-qty input{width:68px;min-height:34px;padding:5px 8px;border-radius:9px;border:1px solid color-mix(in srgb,var(--atlas) 35%,transparent);background:color-mix(in srgb,var(--atlas) 5%,transparent);color:inherit;font:inherit;font-weight:600;font-variant-numeric:tabular-nums;text-align:end}
  .sr-table tfoot td{border-bottom:0;border-top:1px solid color-mix(in srgb,currentColor 22%,transparent);padding-top:12px;font-size:14px;font-weight:600}
  .sr-cost{font-weight:400;margin-inline-start:8px;color:color-mix(in srgb,currentColor 62%,transparent)}
  .sr-sticky{position:sticky;bottom:-1px;display:flex;justify-content:flex-end;align-items:center;gap:12px;margin:0 -4px -4px;padding:12px 4px 4px;background:linear-gradient(to top,var(--sr-modal-bg,var(--surface)) 70%,transparent)}
  .sr-sticky .st-btn svg{width:16px;height:16px}
  .sr-sticky .st-btn:disabled{opacity:.5;cursor:not-allowed}
  .sr-tag{display:grid;gap:10px}
  .sr-tag select,.sr-tag input[type=search],.sr-tag input[type=text]{font:inherit;padding:8px 10px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:transparent;color:inherit;min-height:40px}
  .sr-tag .sr-filters{display:flex;gap:8px;flex-wrap:wrap}.sr-tag .sr-filters>*{flex:1 1 160px}
  .sr-pick{display:grid;gap:4px;max-height:44vh;overflow:auto;padding:2px}
  .sr-pick label{display:flex;gap:10px;align-items:center;padding:8px;border-radius:10px;min-height:40px}
  .sr-pick label:hover{background:color-mix(in srgb,currentColor 6%,transparent)}
  .sr-pick small{opacity:.6;margin-inline-start:auto}
  .sr-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sr-actions>*{flex:1 1 180px}
  .sr-actions button:disabled{opacity:.5;cursor:not-allowed}
  @media (max-width:992px){.sr-row,.sr-cols{grid-template-columns:24px minmax(130px,1fr) minmax(110px,1.4fr) 100px 40px 18px}}
  @media (max-width:720px){
    .sr-podium,.sr-skel{grid-template-columns:1fr}.sr-card[data-rank="1"]{order:-1}
    .sr-card:not([data-rank="1"]){display:none}
    .sr-cols{display:none}
    .sr-title{font-size:22px}
    .sr-row{grid-template-columns:22px 1fr 44px 16px;gap:10px}
    .sr-legend{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;width:100%}.sr-row .sr-stack{grid-column:2/-1;grid-row:2}.sr-row .sr-money{display:none}
    .sr-pro-grid{grid-template-columns:1fr}.sr-kpis{grid-template-columns:repeat(2,1fr)}
  }`;
  function styles() {
    if (document.getElementById('sr-css')) return;
    const style = document.createElement('style'); style.id = 'sr-css'; style.textContent = CSS; document.head.appendChild(style);
  }
  const catalog = () => window.KiwiBoutiqueCatalog || null;
  const procurement = () => window.KiwiProcurement || null;
  const icon = (name) => `<i data-icon="${name}" aria-hidden="true"></i>`;
  /* Les nombres gardent leur sens de lecture dans une page arabe. */
  const nb = (v) => `<bdi dir="ltr">${esc(v)}</bdi>`;

  async function fetchRanking(d) {
    const merchant = stMerchantSlug();
    if (!merchant) return isReal() ? { offline: true } : demoData(d);
    const key = `${merchant}|${d}`, hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    try {
      const res = await fetch(`/api/suppliers/ranking?merchant=${encodeURIComponent(merchant)}&days=${d}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return isReal() ? { offline: true } : demoData(d);
      const body = await res.json();
      if (!body || !Array.isArray(body.suppliers)) return { offline: true };
      cache.set(key, { at: Date.now(), data: body });
      return body;
    } catch (_) { return isReal() ? { offline: true } : demoData(d); }
  }
  function cached(d) {
    const merchant = stMerchantSlug();
    if (!merchant) return isReal() ? null : demoData(d);
    const hit = cache.get(`${merchant}|${d}`);
    return hit && Date.now() - hit.at < TTL ? hit.data : null;
  }

  /* Les articles sans fournisseur, lus dans le catalogue local : c'est lui
     qu'on modifie, et il a les catégories. */
  function untaggedLocal() {
    const C = catalog();
    if (!C || !C.listProducts) return [];
    return (C.listProducts() || []).filter((p) => p && !String(p.supplierId || '').trim());
  }

  /* Le verdict : une étiquette et une phrase, tirées des chiffres. Le plus
     urgent passe d'abord (sans prix d'achat, on ne peut rien conclure). */
  function verdict(s) {
    const V = L().v;
    let k, tone, ico;
    if (!s.productCount || !(s.revenue > 0)) { k = 'idle'; tone = 'idle'; ico = 'remove'; }
    else if (s.marginRate == null) { k = 'cost'; tone = 'watch'; ico = 'sell'; }
    else if (s.sellThrough != null && s.sellThrough < 0.25 && s.stock > 0) { k = 'sleep'; tone = 'bad'; ico = 'inventory_2'; }
    else if (s.returnRate != null && s.returnRate >= 0.15) { k = 'back'; tone = 'bad'; ico = 'undo'; }
    else if (s.marginRate < 0.4) { k = 'thin'; tone = 'watch'; ico = 'trending_down'; }
    else if (s.rank === 1 || s.score >= 75) { k = 'reorder'; tone = 'good'; ico = 'check_circle'; }
    else if (s.sellThrough != null && s.sellThrough >= 0.6) { k = 'fast'; tone = 'good'; ico = 'check_circle'; }
    else { k = 'keep'; tone = 'ok'; ico = 'remove'; }
    const [label, say] = V[k];
    return { k, tone, ico, label, say: typeof say === 'function' ? say(pct(s.returnRate)) : say };
  }
  const chip = (v) => `<span class="sr-verdict ${v.tone}">${icon(v.ico)}<span>${esc(v.label)}</span></span>`;

  function move(s) {
    const T = L();
    if (!(s.revenue > 0)) return '';
    if (s.prevRank == null) return `<span class="sr-move up" title="${esc(T.vsBefore)}">${icon('star')}${esc(T.fresh)}</span>`;
    const d = s.prevRank - s.rank;
    if (d > 0) return `<span class="sr-move up" title="${esc(T.vsBefore)}">${icon('arrow_upward')}${esc(T.up(d))}</span>`;
    if (d < 0) return `<span class="sr-move down" title="${esc(T.vsBefore)}">${icon('arrow_downward')}${esc(T.down(-d))}</span>`;
    return `<span class="sr-move same" title="${esc(T.vsBefore)}">${icon('remove')}${esc(T.same)}</span>`;
  }

  function initials(name) {
    const words = String(name || '').split(/[\s&,.·-]+/).filter((w) => /\p{L}/u.test(w));
    return esc(((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase());
  }

  function ring(score, size, stroke) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score || 0));
    const off = c * (1 - v / 100);
    return `<span class="sr-ring" style="width:${size}px;height:${size}px" aria-label="${esc(L().score)} ${score == null ? L().none : score}">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="trk" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="val ${score == null ? '' : score < 40 ? 'low' : score < 60 ? 'mid' : ''}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" style="--c:${c.toFixed(2)}"/></svg>
      <b style="font-size:${Math.round(size * 0.3)}px">${score == null ? esc(L().none) : score}</b></span>`;
  }

  /* Courbe : ligne droite entre les tranches (pas de lissage qui inventerait
     des vagues), aire dessous ; le trait garde son épaisseur. */
  function spark(series, cls, w = 120, h = 40) {
    const pts = Array.isArray(series) && series.length ? series : [0, 0];
    const max = Math.max(1, ...pts), step = w / Math.max(1, pts.length - 1);
    const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - 3 - (v / max) * (h - 8)).toFixed(1)}`).join(' ');
    return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${d} L${w},${h} L0,${h} Z"/><path class="ln" d="${d}"/></svg>`;
  }
  /* La fiche montre chaque tranche en barre : une semaine sans vente reste vide. */
  function bars(series) {
    const pts = Array.isArray(series) && series.length ? series : [];
    const max = Math.max(1, ...pts);
    return `<div class="sr-bars" aria-hidden="true">${pts.map((v) => `<i style="height:${v > 0 ? Math.max(4, Math.round(100 * v / max)) : 0}%" title="${esc(fmtMad(v))}"></i>`).join('')}</div>`;
  }

  /* Les mêmes deux chiffres sur chaque marche du podium, pour comparer d'un coup d'œil. */
  function pair(s) {
    const T = L();
    const margin = s.marginRate == null ? T.noCost : `${fmtMad(s.margin || 0)} · ${pct(s.marginRate)}`;
    return `<span class="sr-pair"><span><small>${esc(T.revenue)}</small>${nb(fmtMad(s.revenue))}</span><span><small>${esc(T.margin)}</small>${s.marginRate == null ? esc(margin) : nb(pct(s.marginRate))}</span></span>`;
  }

  function stack(s) {
    if (!s.parts) return '<span class="sr-stack"></span>';
    return `<span class="sr-stack" aria-hidden="true">${PARTS.map(([k]) => `<i class="p-${k}" style="width:${Math.max(0, s.parts[k])}%"></i>`).join('')}</span>`;
  }

  function cardHtml(s) {
    const T = L(), big = s.rank === 1;
    const v = verdict(s);
    return `<button type="button" class="sr-card" data-sr-open="${esc(s.id)}" data-rank="${s.rank}" aria-label="${esc(T.open)} · ${esc(s.name || s.id)} · ${esc(T.ord(s.rank))}">
      <span class="sr-card-top"><span class="sr-ord">${esc(T.ord(s.rank))}</span>${move(s)}</span>
      <span class="sr-who"><span class="sr-mono">${initials(s.name)}</span><span class="sr-name">${esc(s.name || s.id)}</span></span>
      <span class="sr-ringrow">${ring(s.score, big ? 96 : 76, big ? 8 : 7)}${pair(s)}</span>
      <span class="sr-cardfoot">${chip(v)}<span class="sr-view">${esc(T.viewProfile)}${icon(document.documentElement.dir === 'rtl' ? 'chevron_left' : 'chevron_right')}</span></span>
      <span class="sr-sparkcap">${esc(T.sparkCap(T.period[days]))}</span>
      ${spark(s.series, 'sr-spark', 120, big ? 34 : 30)}
    </button>`;
  }

  function rowHtml(s) {
    const T = L(), v = verdict(s);
    return `<li><button type="button" class="sr-row" data-sr-open="${esc(s.id)}" data-rank="${s.rank}" aria-label="${esc(T.open)} · ${esc(s.name || s.id)}">
      <span class="sr-rank">${s.rank}</span>
      <span style="min-width:0"><span class="sr-name">${esc(s.name || s.id)}</span><br>${chip(v)}</span>
      ${stack(s)}
      <span class="sr-money">${nb(fmtMad(s.revenue))}<small>${move(s)}</small></span>
      <span class="sr-sc">${s.score == null ? esc(T.none) : s.score}</span>
      <span class="sr-chev">${icon(document.documentElement.dir === 'rtl' ? 'chevron_left' : 'chevron_right')}</span>
    </button></li>`;
  }

  function headHtml(data) {
    const T = L(), n = data && data.suppliers ? data.suppliers.length : 0;
    const seg = `<div class="sr-seg" data-lens-demo role="group" aria-label="${esc(T.periodLong[days])}">${PERIODS.map((p) => `<button type="button" data-lens-item data-sr-days="${p}" class="${p === days ? 'on' : ''}" aria-pressed="${p === days}">${esc(T.period[p])}</button>`).join('')}</div>`;
    return `<div class="sr-head"><div>
      <p class="sr-eyebrow">${icon('emoji_events')}<span>${esc(T.eyebrow)}</span></p>
      <h3 class="sr-title">${esc(T.title)}${data && data.demo ? `<span class="sr-tagdemo">${esc(T.demo)}</span>` : ''}</h3>
      <p class="sr-sub">${esc(T.sub(T.periodLong[days], n))}</p>${data && data.demo ? `<p class="sr-demonote">${icon('info')}<span>${esc(T.demoNote)}</span></p>` : ''}</div>${seg}</div>`;
  }

  function boardHtml(data, howOpen) {
    const T = L();
    if (!data) return `${headHtml(null)}<div class="sr-skel" aria-label="${esc(T.loading)}"><i></i><i></i><i></i></div>`;
    const loose = data.demo ? 0 : untaggedLocal().length;
    const note = loose ? `<div class="sr-note"><span>${esc(T.untagged(loose))}</span><button type="button" class="st-btn" data-sr-tag>${esc(T.tagCta)}</button></div>` : '';
    if (data.offline) return `${headHtml(null)}<div class="sr-state">${esc(T.offline)}</div>${note}`;
    const list = data.suppliers || [];
    if (!list.length) return `${headHtml(data)}<div class="sr-state">${esc(T.empty)}</div>${note}`;
    const podium = list.slice(0, 3);
    const order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
    const legend = `<span class="sr-legend">${PARTS.map(([k, max, label]) => `<span><i class="p-${k}"></i>${esc(k === 'returns' ? T.legendReturns : T[label])} ${max}</span>`).join('')}</span>`;
    return `${headHtml(data)}
      <div class="sr-podium" style="${podium.length < 3 ? `grid-template-columns:repeat(${podium.length},1fr)` : ''}">${order.map(cardHtml).join('')}</div>
      <div class="sr-tablehead"><h4>${esc(T.table)}</h4>${legend}<button type="button" class="sr-howbtn" data-sr-how aria-expanded="${!!howOpen}">${icon('info')}<span>${esc(T.how)}</span></button></div>
      ${howOpen ? `<p class="sr-howbody">${esc(T.howBody)}</p>` : ''}
      <div class="sr-cols" aria-hidden="true"><span>#</span><span>${esc(T.colSupplier)}</span><span>${esc(T.colParts)}</span><span>${esc(T.colSales)}</span><span>${esc(T.score)}</span><span></span></div>
      <ol class="sr-rows">${list.map(rowHtml).join('')}</ol>${note}`;
  }

  /* ─── La fiche d'un fournisseur ─── */
  function fmtDay(ts) {
    try { return new Date(ts).toLocaleDateString(lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }); } catch (_) { return ''; }
  }
  function profileHtml(s, data) {
    const T = L(), v = verdict(s), n = data.suppliers.length;
    const kpi = (l, val) => `<div class="sr-kpi"><div class="l">${esc(l)}</div><div class="v" title="${esc(val)}">${esc(val)}</div></div>`;
    const value = { sales: fmtMad(s.revenue), margin: s.marginRate == null ? T.noCost : pct(s.marginRate), sell: pct(s.sellThrough), returns: pct(s.returnRate || 0) };
    const why = PARTS.map(([k, max, label]) => {
      const pts = s.parts ? s.parts[k] : 0;
      return `<div class="sr-why-row"><span>${esc(T[label])} <span class="val">· ${esc(value[k])}</span></span><span class="pts">${Math.round(pts)}<small> / ${max}</small></span>
        <span class="sr-bar"><i class="p-${k}" style="width:${(100 * pts / max).toFixed(1)}%"></i></span></div>`;
    }).join('');
    const p = data.period || {};
    const want = suggestions(s);
    const rows = s.products.map((it, i) => {
      const tag = i === 0 && it.units > 0 ? `<span class="sr-pill best">${esc(T.best)}</span>` : (it.units === 0 && it.stock > 0 ? `<span class="sr-pill dead">${esc(T.sleeping)}</span>` : '');
      return `<tr><td>${esc(it.name)}${tag}</td><td>${it.units}</td><td>${esc(fmtMad(it.revenue))}</td><td>${it.margin == null ? esc(T.none) : esc(fmtMad(it.margin))}</td><td>${it.stock}</td><td>${it.returned || 0}</td>
        <td class="sr-qty"><input type="number" min="0" step="1" inputmode="numeric" value="${want[i]}" data-sr-qty="${i}" aria-label="${esc(T.orderQty)} · ${esc(it.name)}"></td></tr>`;
    }).join('');
    return `<div class="sr-pro sr-anim">
      <div class="sr-pro-head"><span class="sr-mono">${initials(s.name)}</span>
        <div class="sr-pro-id"><div class="sr-name">${esc(s.name || s.id)}</div>
          <div class="sr-pro-line"><span>${esc(T.of(T.ord(s.rank), n))}</span>${move(s)}<span>· ${esc(T.periodLong[days])}</span></div></div>
        ${ring(s.score, 84, 8)}</div>
      <div class="sr-say ${v.tone}">${icon(v.ico)}<span><b>${esc(v.label)}.</b>${esc(v.say)}</span></div>
      <div class="sr-pro-grid">
        <div class="sr-panel"><h4>${esc(T.why)}</h4><div class="sr-why">${why}</div></div>
        <div class="sr-panel sr-curve"><h4>${esc(T.curve)}</h4><div class="sr-curve-total">${esc(fmtMad(s.revenue))}</div>${bars(s.series)}
          <div class="sr-axis"><span>${esc(fmtDay(p.from))}</span><span>${esc(fmtDay(p.to))}</span></div></div>
      </div>
      <div class="sr-kpis">${kpi(T.units, String(s.units))}${kpi(T.margin, s.margin == null ? T.noCost : fmtMad(s.margin))}${kpi(T.returns, `${T.piece(s.returnedUnits || 0)} · ${pct(s.returnRate || 0)}`)}${kpi(T.stock, String(s.stock))}${kpi(T.stockValue, fmtMad(s.stockValue))}${kpi(T.dead, String(s.deadProducts || 0))}</div>
      ${rows ? `<div><h4 class="sr-h4">${esc(T.orderT)}</h4><p class="sr-order-sub">${esc(want.some((q) => q > 0) ? T.orderSub : T.orderNone)}</p>
        <div class="sr-scroll"><table class="sr-table"><thead><tr><th>${esc(T.products)}</th><th>${esc(T.units)}</th><th>${esc(T.revenue)}</th><th>${esc(T.margin)}</th><th>${esc(T.stock)}</th><th>${esc(T.returns)}</th><th class="sr-qty">${esc(T.orderQty)}</th></tr></thead>
        <tbody>${rows}</tbody><tfoot><tr><td colspan="6"><span data-sr-total></span> <span class="sr-cost" data-sr-cost></span></td><td></td></tr></tfoot></table></div></div>
        <div class="sr-sticky"><button type="button" class="st-btn primary" data-sr-copy>${icon('receipt_long')}<span>${esc(T.orderCopy)}</span></button></div>` : `<p>${esc(T.noProducts)}</p>`}
    </div>`;
  }
  /* Préparer une commande : Kiwi ne l'envoie pas au fournisseur, il la rédige
     (comme le bon de commande du stock). Proposé : vendu sur la période moins
     le stock restant ; chaque quantité se corrige avant de copier. */
  function suggestions(s) {
    return (s.products || []).map((it) => Math.max(0, (it.units || 0) - (it.stock || 0)));
  }
  function wireOrder(root, s) {
    const T = L(), btn = root.querySelector('[data-sr-copy]');
    const inputs = () => [...root.querySelectorAll('[data-sr-qty]')];
    const total = () => {
      let n = 0, cost = 0, known = true;
      inputs().forEach((el) => {
        const q = Math.max(0, parseInt(el.value, 10) || 0), it = s.products[+el.dataset.srQty];
        n += q; if (q) { if (it && it.cost > 0) cost += q * it.cost; else known = false; }
      });
      const t = root.querySelector('[data-sr-total]'), c = root.querySelector('[data-sr-cost]');
      if (t) t.textContent = T.orderTotal(n);
      if (c) c.textContent = n && known ? T.costEst(fmtMad(cost)) : '';
      if (btn) btn.disabled = !n;
      return n;
    };
    root.addEventListener('input', (e) => { if (e.target.matches('[data-sr-qty]')) total(); });
    total();
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const lines = inputs().map((el) => {
        const q = Math.max(0, parseInt(el.value, 10) || 0), it = s.products[+el.dataset.srQty];
        return q && it ? `- ${q} × ${it.name}` : '';
      }).filter(Boolean);
      if (!lines.length) return;
      const text = T.orderText(s.name || '', lines);
      try {
        await navigator.clipboard.writeText(text);
        window.Kiwi?.toast?.(T.orderCopied, { type: 'success' });
        const label = btn.innerHTML;
        btn.innerHTML = `${icon('check_circle')}<span>${esc(T.orderDone)}</span>`;
        setTimeout(() => { if (btn.isConnected) btn.innerHTML = label; }, 2400);
      } catch (_) { window.prompt(T.orderCopy, text); }
    });
  }
  function openProfile(id) {
    const s = last && last.suppliers && last.suppliers.find((x) => x.id === id);
    if (!s || !window.Kiwi || !window.Kiwi.modal) return;
    styles();
    const m = window.Kiwi.modal({ title: L().profile, width: 860, body: profileHtml(s, last) });
    if (!m || !m.el) return;
    /* Le pied collant prend le fond réel de la fenêtre (papier en clair, encre en sombre). */
    const box = m.el.closest('.kiwi-modal') || m.el.querySelector('.kiwi-modal') || m.el;
    m.el.style.setProperty('--sr-modal-bg', getComputedStyle(box).backgroundColor);
    wireOrder(m.el, s);
  }

  /* ─── Ranger les articles sans fournisseur ─── */
  function tagHtml() {
    const T = L(), C = catalog(), P = procurement();
    const items = untaggedLocal();
    if (!items.length) return `<div class="sr-tag"><p>${esc(T.allTagged)}</p></div>`;
    const cats = (C && C.listCategories ? C.listCategories() : []) || [];
    const catName = new Map(cats.map((c) => [String(c.id), c.name || '']));
    const sups = ((P && P.doc ? P.doc().suppliers : []) || []).filter((s) => s && s.active !== false && !s.archived);
    return `<div class="sr-tag">
      <div class="sr-filters"><input type="search" data-sr-q placeholder="${esc(T.search)}" aria-label="${esc(T.search)}">
        <select data-sr-cat aria-label="${esc(T.allCats)}"><option value="">${esc(T.allCats)}</option>${cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name || '')}</option>`).join('')}</select></div>
      <label class="sr-all"><input type="checkbox" data-sr-all> ${esc(T.all)}</label>
      <div class="sr-pick">${items.map((p) => `<label data-sr-item data-cat="${esc(p.categoryId || '')}" data-name="${esc(String(p.name || '').toLowerCase())}"><input type="checkbox" value="${esc(p.id)}"><span>${esc(p.name || p.id)}</span><small>${esc(catName.get(String(p.categoryId)) || '')}</small></label>`).join('')}</div>
      <div class="sr-actions"><select data-sr-sup aria-label="${esc(T.pick)}"><option value="">${esc(T.pick)}</option>${sups.map((s) => `<option value="${esc(s.id)}">${esc(s.name || s.id)}</option>`).join('')}<option value="__new">${esc(T.newSup)}</option></select>
        <input type="text" data-sr-newname placeholder="${esc(T.newName)}" aria-label="${esc(T.newName)}" hidden maxlength="120">
        <button type="button" class="st-btn primary" data-activation="write" data-sr-apply disabled>${esc(T.apply(0))}</button></div>
    </div>`;
  }
  function wireTag(root, again) {
    const T = L();
    const boxes = () => [...root.querySelectorAll('[data-sr-item]')];
    const visible = () => boxes().filter((l) => !l.hidden);
    const picked = () => boxes().filter((l) => l.querySelector('input').checked).map((l) => l.querySelector('input').value);
    const count = () => { const b = root.querySelector('[data-sr-apply]'); if (b) { const n = picked().length; b.textContent = T.apply(n); b.disabled = !n; } };
    const filter = () => {
      const q = (root.querySelector('[data-sr-q]').value || '').trim().toLowerCase(), cat = root.querySelector('[data-sr-cat]').value;
      boxes().forEach((l) => { l.hidden = (!!q && !l.dataset.name.includes(q)) || (!!cat && l.dataset.cat !== cat); });
    };
    root.querySelector('[data-sr-q]')?.addEventListener('input', filter);
    root.querySelector('[data-sr-cat]')?.addEventListener('change', filter);
    root.querySelector('[data-sr-all]')?.addEventListener('change', (e) => { visible().forEach((l) => { l.querySelector('input').checked = e.target.checked; }); count(); });
    root.querySelector('.sr-pick')?.addEventListener('change', count);
    const sup = root.querySelector('[data-sr-sup]'), name = root.querySelector('[data-sr-newname]');
    sup?.addEventListener('change', () => { if (name) { name.hidden = sup.value !== '__new'; if (!name.hidden) name.focus(); } });
    root.querySelector('[data-sr-apply]')?.addEventListener('click', () => {
      const ids = picked(), C = catalog(), P = procurement();
      let sid = sup ? sup.value : '', label = sup && sup.selectedOptions[0] ? sup.selectedOptions[0].textContent : '';
      if (sid === '__new') {
        const n = String(name && name.value || '').trim();
        const row = n && P && P.addSupplier ? P.addSupplier({ name: n }) : null;
        sid = row && row.id ? row.id : ''; label = n;
      }
      if (!sid || !ids.length || !C || !C.updateProduct) { window.Kiwi?.toast?.(T.needPick, { type: 'error' }); return; }
      const write = () => ids.forEach((id) => C.updateProduct(id, { supplierId: sid }));
      if (C.batch) C.batch(write); else write();
      window.Kiwi?.toast?.(T.done(ids.length, label), { type: 'success' });
      cache.clear();
      again();
    });
  }
  function openTag() {
    styles();
    const T = L();
    const m = window.Kiwi.modal({ title: T.tagTitle, desc: esc(T.tagSub), width: 640, body: tagHtml() });
    const body = m.el.querySelector('.kiwi-modal-body') || m.el;
    const again = () => { body.innerHTML = tagHtml(); wireTag(body, again); document.querySelectorAll('[data-sr-board][data-sr-ready]').forEach((b) => paint(b)); };
    wireTag(body, again);
    return m;
  }

  /* ─── Le tableau dans l'onglet Fournisseurs ─── */
  async function paint(el) {
    const ask = days;
    const now = cached(ask);
    if (now) { last = now; el.innerHTML = boardHtml(now, el.dataset.srHow === '1'); el.classList.remove('sr-anim'); return; }
    el.innerHTML = boardHtml(null);
    const data = await fetchRanking(ask);
    if (!el.isConnected || ask !== days) return;
    last = data;
    el.classList.add('sr-anim');
    el.innerHTML = boardHtml(data, el.dataset.srHow === '1');
    setTimeout(() => el.classList.remove('sr-anim'), 1400);
  }
  function mount(el) {
    if (!el || el.dataset.srReady) return;
    el.dataset.srReady = '1';
    styles();
    el.addEventListener('click', (e) => {
      const d = e.target.closest('[data-sr-days]');
      if (d) { const n = parseInt(d.dataset.srDays, 10); if (n && n !== days) { days = n; paint(el); } return; }
      const o = e.target.closest('[data-sr-open]');
      if (o) { openProfile(o.dataset.srOpen); return; }
      if (e.target.closest('[data-sr-tag]')) { openTag(); return; }
      if (e.target.closest('[data-sr-how]')) { el.dataset.srHow = el.dataset.srHow === '1' ? '' : '1'; if (last) el.innerHTML = boardHtml(last, el.dataset.srHow === '1'); }
    });
    paint(el);
  }
  /* L'onglet se repeint souvent : chaque nouveau conteneur est monté une fois,
     depuis le cache s'il est frais (aucune requête, aucune animation rejouée). */
  let queued = false;
  const scan = () => { queued = false; document.querySelectorAll('[data-sr-board]:not([data-sr-ready])').forEach(mount); };
  if (typeof MutationObserver === 'function' && document.body) {
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } }).observe(document.body, { childList: true, subtree: true });
  }

  /* Le menu Outils du stock mène au tableau, dans l'onglet Fournisseurs. */
  async function open() {
    const H = window.Kiwi && window.Kiwi.handlers;
    if (H && H['stock-tab']) H['stock-tab']({ dataset: { tab: 'suppliers' } });
    requestAnimationFrame(() => { scan(); const b = document.querySelector('[data-sr-board]'); if (b && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  return { open, mount, openTag, verdict };
});
