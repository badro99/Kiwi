/* Coût théorique et coût réel · le panneau du tableau de bord.
 *
 * Il remplace le moteur de démonstration (assets/venues/data.js : réel =
 * théorique × 1,04) par GET /api/cost-variance : les ratios clés sur les vrais
 * livres, les pertes par motif (vol compris), et le tableau « où l'argent
 * fuit », matière par matière entre deux inventaires, l'écart SIGNÉ.
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
     droite (U+2066 … U+2069), le signe ne passe pas derrière la devise. */
  const iso = (x) => '\u2066' + x + '\u2069';
  /* Centimes → « 1 234,50 MAD » ; les entiers sans décimales. */
  const mad = (cents, signed) => {
    if (cents == null) return '·';
    const v = Math.round(cents) / 100;
    const s = fmt(Math.abs(v), Number.isInteger(v) ? 0 : 2) + ' MAD';
    return iso(v < 0 ? '−' + s : (signed && v > 0 ? '+' : '') + s);
  };
  const qty = (q, signed) => {
    if (q == null) return '·';
    const a = Math.abs(q);
    const s = fmt(a, a < 10 ? 2 : 1, 0);
    return iso(q < 0 ? '−' + s : (signed && q > 0 ? '+' + s : s));
  };
  const pct = (p) => (p == null ? '·' : iso(fmt(p, 1) + ' %'));

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
      v: 'Pertes enregistrées', vSub: (y, d, c) => `${y} des ventes · déclarées ${d} · inventaires ${c}`,
      Z: 'Consommation réelle', ZSub: (m) => `coût théorique + pertes · marge ${m}`,
      L: 'Achats nets', LSub: (r, t) => `reçus ${r} − retours ${t}`,
      G: 'Transferts nets', GSub: (i, o) => `entrées ${i} − sorties ${o}`,
      el: 'Approvisionnement net', elSub: (m) => `achats + transferts · marge ${m}`,
      stock: 'Valeur du stock maintenant', po: (n) => `Commandes fournisseur en attente · ${n}`,
      losses: 'Pertes par motif', lossesEmpty: 'Aucune perte enregistrée sur la période.',
      lossSrc: { declared: 'déclarée', count: 'inventaire' },
      reasons: { perime: 'Périmé', casse: 'Casse', avarie: 'Avarié', offert: 'Offert', 'repas-equipe': 'Repas équipe', vol: 'Vol', perdu: 'Perdu', erreur: 'Erreur de saisie', autre: 'Autre', 'non-explique': 'Écart sans motif' },
      leaks: 'Où l’argent fuit',
      leaksSub: (a, b) => `Matière par matière, entre l’inventaire du ${a} et celui du ${b}`,
      leaksSubNone: 'Matière par matière, entre deux inventaires validés',
      leakSum: (l, s, n) => `Manque ${l} · surplus ${s} · net ${n}`,
      cols: ['Matière', 'Début', 'Entrées', 'Fin', 'Utilisé', 'Recettes', 'Pertes déclarées', 'Écart', 'Écart MAD'],
      noCount: 'Aucun inventaire', oneCount: 'Un seul inventaire', noCost: 'Sans coût d’achat', skipped: 'Période trop découpée',
      soldBy: (q) => `${q} sortis par les ventes`,
      gapHelp: 'Écart = utilisé − recettes. Positif : de la marchandise manque. Négatif : il en reste plus que prévu.',
      todo: 'Pour des chiffres complets',
      uncosted: (n, a) => `${n} produit(s) vendu(s) sans coût (${a} de ventes) : ajoutez leur fiche technique.`,
      bare: (a) => `${a} de ventes sans détail article (montant libre) : comptées dans les ventes, jamais dans le coût.`,
      needCount: (n) => `${n} matière(s) consommée(s) sans deux inventaires : faites un inventaire au début et à la fin de la période.`,
      stockNoCost: (n) => `${n} article(s) en stock sans prix d’achat : la valeur du stock les ignore.`,
      ledgerNoCost: (n) => `${n} mouvement(s) de stock sans coût : leurs montants manquent aux pertes et aux achats.`,
      emptyRecipesH: 'Pas encore de coût sur vos ventes',
      emptyRecipes: 'Le coût théorique vient des fiches techniques et des coûts saisis sur votre carte. Chiffrez vos produits : chaque vente suivante portera son coût.',
      emptyRecipesBtn: 'Ouvrir ma carte',
      emptyCountH: 'Pas encore d’inventaire validé',
      emptyCount: 'L’écart par matière se mesure entre deux inventaires. Comptez votre stock, validez, et recommencez à la fin de la période.',
      emptyCountBtn: 'Ouvrir le stock',
      loading: 'Calcul en cours…',
      error: 'Les chiffres n’ont pas pu être chargés.', retry: 'Réessayer',
      offline: 'Hors ligne : les chiffres reviendront avec la connexion.',
      forbidden: 'Réservé au propriétaire.',
      demo: 'Exemple · vos vrais chiffres apparaissent ici dès votre premier inventaire.',
      site: (n) => n,
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
      v: 'Recorded losses', vSub: (y, d, c) => `${y} of sales · declared ${d} · stock counts ${c}`,
      Z: 'Actual consumption', ZSub: (m) => `theoretical cost + losses · margin ${m}`,
      L: 'Net purchases', LSub: (r, t) => `received ${r} − returned ${t}`,
      G: 'Net transfers', GSub: (i, o) => `in ${i} − out ${o}`,
      el: 'Net supply', elSub: (m) => `purchases + transfers · margin ${m}`,
      stock: 'Stock value now', po: (n) => `Supplier orders pending · ${n}`,
      losses: 'Losses by reason', lossesEmpty: 'No loss recorded in this period.',
      lossSrc: { declared: 'declared', count: 'stock count' },
      reasons: { perime: 'Expired', casse: 'Breakage', avarie: 'Damaged', offert: 'Given away', 'repas-equipe': 'Staff meal', vol: 'Theft', perdu: 'Lost', erreur: 'Entry error', autre: 'Other', 'non-explique': 'Unexplained gap' },
      leaks: 'Where the money leaks',
      leaksSub: (a, b) => `Ingredient by ingredient, between the ${a} and ${b} stock counts`,
      leaksSubNone: 'Ingredient by ingredient, between two approved stock counts',
      leakSum: (l, s, n) => `Missing ${l} · surplus ${s} · net ${n}`,
      cols: ['Ingredient', 'Opening', 'In', 'Closing', 'Used', 'Recipes', 'Declared losses', 'Gap', 'Gap MAD'],
      noCount: 'No stock count', oneCount: 'One stock count only', noCost: 'No purchase cost', skipped: 'Period too fragmented',
      soldBy: (q) => `${q} used by sales`,
      gapHelp: 'Gap = used − recipes. Positive: stock is missing. Negative: more is left than expected.',
      todo: 'To complete the numbers',
      uncosted: (n, a) => `${n} product(s) sold without a cost (${a} of sales): add their recipe.`,
      bare: (a) => `${a} of sales without item detail (free amount): counted in sales, never in cost.`,
      needCount: (n) => `${n} ingredient(s) used without two stock counts: count at the start and at the end of the period.`,
      stockNoCost: (n) => `${n} stock item(s) without a purchase price: stock value leaves them out.`,
      ledgerNoCost: (n) => `${n} stock movement(s) without a cost: their amounts are missing from losses and purchases.`,
      emptyRecipesH: 'No cost on your sales yet',
      emptyRecipes: 'Theoretical cost comes from the recipes and costs on your menu. Cost your products: every next sale will carry its cost.',
      emptyRecipesBtn: 'Open my menu',
      emptyCountH: 'No approved stock count yet',
      emptyCount: 'The gap per ingredient is measured between two stock counts. Count your stock, approve it, and count again at the end of the period.',
      emptyCountBtn: 'Open stock',
      loading: 'Calculating…',
      error: 'The figures could not be loaded.', retry: 'Try again',
      offline: 'Offline: the figures will come back with the connection.',
      forbidden: 'Owner only.',
      demo: 'Sample · your real figures appear here after your first stock count.',
      site: (n) => n,
    },
    ar: {
      title: 'الكلفة النظرية والكلفة الفعلية',
      sub: (a, b) => `من ${a} إلى ${b} · أيام الصندوق`,
      days: { 7: '7 أيام', 30: '30 يومًا', 90: '90 يومًا' },
      periodAria: 'الفترة', scopeAria: 'المحلات',
      scope: { site: 'هذا المحل', all: 'كل المحلات' },
      ratios: 'المؤشرات الأساسية',
      b: 'صافي المبيعات', bSub: (d, r) => `بعد ${d} من التخفيضات و${r} من المبالغ المرجعة`,
      A: 'الكلفة النظرية للسلع', ASub: (w, i) => `${w} من المبيعات · الهامش ${i}`,
      v: 'الخسائر المسجلة', vSub: (y, d, c) => `${y} من المبيعات · مصرّح بها ${d} · الجرد ${c}`,
      Z: 'الاستهلاك الفعلي', ZSub: (m) => `الكلفة النظرية + الخسائر · الهامش ${m}`,
      L: 'صافي المشتريات', LSub: (r, t) => `المستلم ${r} − المرجع ${t}`,
      G: 'صافي التحويلات', GSub: (i, o) => `الداخل ${i} − الخارج ${o}`,
      el: 'صافي التموين', elSub: (m) => `المشتريات + التحويلات · الهامش ${m}`,
      stock: 'قيمة المخزون الآن', po: (n) => `طلبيات الموردين المنتظرة · ${n}`,
      losses: 'الخسائر حسب السبب', lossesEmpty: 'لا خسارة مسجلة في هذه الفترة.',
      lossSrc: { declared: 'مصرّح بها', count: 'الجرد' },
      reasons: { perime: 'منتهي الصلاحية', casse: 'كسر', avarie: 'تالف', offert: 'هدية', 'repas-equipe': 'وجبة الفريق', vol: 'سرقة', perdu: 'ضائع', erreur: 'خطأ في الإدخال', autre: 'أخرى', 'non-explique': 'فرق بلا سبب' },
      leaks: 'فين كيضيع الفلوس',
      leaksSub: (a, b) => `مادة بمادة، بين جرد ${a} وجرد ${b}`,
      leaksSubNone: 'مادة بمادة، بين جردين مصادق عليهما',
      leakSum: (l, s, n) => `ناقص ${l} · زائد ${s} · الصافي ${n}`,
      cols: ['المادة', 'البداية', 'الداخل', 'النهاية', 'المستعمل', 'الوصفات', 'خسائر مصرّح بها', 'الفرق', 'الفرق بالدرهم'],
      noCount: 'بلا جرد', oneCount: 'جرد واحد فقط', noCost: 'بلا ثمن شراء', skipped: 'فترة مقسمة أكثر من اللازم',
      soldBy: (q) => `${q} خرجت مع المبيعات`,
      gapHelp: 'الفرق = المستعمل − الوصفات. موجب: السلعة ناقصة. سالب: بقي أكثر مما كان متوقعًا.',
      todo: 'باش تكمل الأرقام',
      uncosted: (n, a) => `${n} منتج مبيع بلا كلفة (${a} من المبيعات): زيد البطاقة التقنية ديالو.`,
      bare: (a) => `${a} من المبيعات بلا تفاصيل المنتجات (مبلغ حر): كتحسب في المبيعات، ماشي في الكلفة.`,
      needCount: (n) => `${n} مادة مستعملة بلا جردين: دير جرد في بداية الفترة وفي آخرها.`,
      stockNoCost: (n) => `${n} منتج في المخزون بلا ثمن شراء: قيمة المخزون ما كتحسبوش.`,
      ledgerNoCost: (n) => `${n} حركة مخزون بلا كلفة: مبالغها ناقصة من الخسائر والمشتريات.`,
      emptyRecipesH: 'مازال ما كاينة كلفة على مبيعاتك',
      emptyRecipes: 'الكلفة النظرية كتجي من البطاقات التقنية والكلفة المدخلة في القائمة. حدد كلفة منتجاتك: كل بيعة جاية غادي تحمل كلفتها.',
      emptyRecipesBtn: 'افتح القائمة',
      emptyCountH: 'مازال ما كاين حتى جرد مصادق عليه',
      emptyCount: 'الفرق لكل مادة كيتقاس بين جردين. احسب المخزون، صادق عليه، وعاود في آخر الفترة.',
      emptyCountBtn: 'افتح المخزون',
      loading: 'جاري الحساب…',
      error: 'ما قدرناش نجيبو الأرقام.', retry: 'عاود',
      offline: 'بلا اتصال: الأرقام غادي ترجع مع الاتصال.',
      forbidden: 'خاص بمول المحل.',
      demo: 'مثال · الأرقام الحقيقية ديالك كتبان هنا من بعد أول جرد.',
      site: (n) => n,
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
        ratios: { grossSalesCents: 6480000, discountCents: 142000, refundCents: 38000, netSalesCents: 6442000, cogsCents: 1868200,
          marginCents: 4573800, costPct: 29, declaredWasteCents: 61500, countShrinkCents: 172000, countOverCents: 21000,
          wasteCents: 212500, wastePct: 3.3, consumptionCents: 2080700, consumptionPct: 32.3, marginOnConsumptionCents: 4361300,
          receivedCents: 1925000, returnedCents: 36000, purchasesCents: 1889000, transferInCents: 0, transferOutCents: 45000,
          transfersCents: -45000, supplyCents: 1844000, marginOnSupplyCents: 4598000, stockValueCents: 1312000,
          pendingPoCents: 486000, pendingPoCount: 2 },
        coverage: { costedPct: 91.4, lineRevenueCents: 6400000, costedRevenueCents: 5849600, undetailedCents: 80000,
          uncosted: [{ name: 'Jus du jour', qty: 64, cents: 320000 }, { name: 'Pastilla', qty: 9, cents: 230400 }],
          ledgerNoCostRows: 0, stockNoCost: 1 },
        losses: [{ reason: 'vol', source: 'count', cents: 86000 }, { reason: 'perime', source: 'declared', cents: 38000 },
          { reason: 'non-explique', source: 'count', cents: 65000 }, { reason: 'casse', source: 'declared', cents: 23500 }],
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
  let last = { slot: null, real: false };

  function merchant() {
    try { return (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && (window.KiwiVenue.getCurrentVenueData() || {}).slug) || ''; } catch (_) { return ''; }
  }
  const keyOf = (m) => [m, S.days, S.scope].join('|');

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
.cv-ctrls{display:flex;flex-wrap:wrap;gap:8px}
.cv-seg{display:inline-flex;gap:2px;padding:4px;border-radius:999px;background:var(--n-100);border:1px solid var(--n-200)}
.cv-seg button{border:0;background:transparent;color:var(--n-600);font:inherit;font-size:13px;font-weight:500;padding:7px 14px;border-radius:999px;cursor:pointer;white-space:nowrap}
.cv-seg button.on{color:var(--ink)}
.cv-seg:not([data-kw-lens]) button.on{background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.cv-seg button:focus-visible{outline:2px solid var(--atlas);outline-offset:2px}
.cv-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px;align-items:start}
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
.cv-loss{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:8px 0;font-size:13px}
.cv-loss b{font-weight:550;color:var(--ink)}
.cv-loss small{color:var(--n-500);font-size:11.5px;margin-inline-start:6px}
.cv-loss span{font-variant-numeric:tabular-nums;text-align:end}
.cv-bar{grid-column:1/-1;height:6px;border-radius:99px;background:var(--n-100);overflow:hidden}
.cv-bar i{display:block;height:100%;border-radius:99px;background:var(--danger)}
.cv-bar i.pos{background:var(--atlas)}
.cv-sum{font-size:13px;color:var(--n-600);margin:-4px 0 12px;font-variant-numeric:tabular-nums}
.cv-tbl-wrap{overflow-x:auto;margin:0 -4px}
.cv-tbl{width:100%;border-collapse:collapse;font-size:13px}
.cv-tbl th{text-align:start;font-size:11px;font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);font-weight:500;padding:8px;border-bottom:1px solid var(--n-200);white-space:nowrap}
.cv-tbl td{padding:9px 8px;border-bottom:1px solid var(--n-200);vertical-align:top}
.cv-tbl tr:last-child td{border-bottom:0}
.cv-tbl .num{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.cv-tbl td b{font-weight:550;color:var(--ink)}
.cv-tbl small{display:block;color:var(--n-500);font-size:11.5px;margin-top:2px}
.cv-tbl .leak{color:var(--danger)}
.cv-tbl .surplus{color:var(--atlas)}
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
.cv-skel{height:220px;border-radius:18px;background:linear-gradient(90deg,var(--n-100),var(--n-200),var(--n-100));background-size:200% 100%;animation:cvSk 1.2s ease-in-out infinite}
@keyframes cvSk{0%{background-position:100% 0}100%{background-position:-100% 0}}
@media (prefers-reduced-motion:reduce){.cv-skel{animation:none}}`;
    document.head.appendChild(st);
  }

  function dayLabel(ts, zone) {
    try {
      const p = window.KiwiDayReport.civilParts(ts, zone || window.KiwiDayReport.timezone());
      const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, 12));
      return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
    } catch (_) {
      try { return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(ts)); } catch (__) { return ''; }
    }
  }

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
    const sub = r ? c.sub(dayLabel(r.from, r.zone), dayLabel(Math.max(r.from, r.to - 1), r.zone)) : '';
    return `<div class="cv-head"><div><div class="cv-title">${esc(c.title)}</div><div class="cv-sub">${esc(sub)}</div></div>${controls(data)}</div>`;
  }

  function ratiosCard(R) {
    const c = t();
    const line = (label, value, sub, neg) => `<div class="cv-r${neg ? ' neg' : ''}"><b>${esc(label)}</b><span>${value}</span><small>${esc(sub)}</small></div>`;
    return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.ratios)}</div>
      ${line(c.b, mad(R.netSalesCents), c.bSub(mad(R.discountCents), mad(R.refundCents)))}
      ${line(c.A, mad(R.cogsCents), c.ASub(pct(R.costPct), mad(R.marginCents)))}
      ${line(c.v, mad(R.wasteCents), c.vSub(pct(R.wastePct), mad(R.declaredWasteCents), mad(R.countShrinkCents - R.countOverCents, true)), R.wasteCents > 0)}
      ${line(c.Z, mad(R.consumptionCents), c.ZSub(mad(R.marginOnConsumptionCents)))}
      ${line(c.L, mad(R.purchasesCents), c.LSub(mad(R.receivedCents), mad(R.returnedCents)))}
      ${line(c.G, mad(R.transfersCents, true), c.GSub(mad(R.transferInCents), mad(R.transferOutCents)))}
      ${line(c.el, mad(R.supplyCents), c.elSub(mad(R.marginOnSupplyCents)), R.marginOnSupplyCents < 0)}
      <div class="cv-foot"><span>${esc(c.stock)} · <b>${mad(R.stockValueCents)}</b></span><span>${esc(c.po(R.pendingPoCount || 0))} · <b>${mad(R.pendingPoCents)}</b></span></div>
    </div>`;
  }

  function lossesCard(list) {
    const c = t();
    const rows = (list || []).filter((x) => x.cents);
    if (!rows.length) return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.losses)}</div><div class="cv-note">${esc(c.lossesEmpty)}</div></div>`;
    const max = Math.max(...rows.map((x) => Math.abs(x.cents)));
    return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.losses)}</div>${rows.map((x) => `
      <div class="cv-loss"><b>${esc(c.reasons[x.reason] || x.reason)}<small>${esc(c.lossSrc[x.source] || '')}</small></b><span>${mad(x.cents)}</span>
      <div class="cv-bar"><i class="${x.cents < 0 ? 'pos' : ''}" style="width:${Math.max(3, Math.round(Math.abs(x.cents) / max * 100))}%"></i></div></div>`).join('')}</div>`;
  }

  function leaksCard(V, zone, showSite) {
    const c = t();
    const rows = V.rows || [];
    const w = (V.windows || [])[0];
    const sub = w ? c.leaksSub(dayLabel(w.open, zone), dayLabel(w.close, zone)) : c.leaksSubNone;
    const status = (r) => ({ 'no-count': c.noCount, 'one-count': c.oneCount, 'no-cost': c.noCost, 'window-skipped': c.skipped }[r.status] || '');
    const tr = (r) => {
      const name = `<b>${esc(r.name)}</b>${showSite && r.site ? `<small>${esc(r.site)}</small>` : ''}`;
      if (r.actualUse == null) {
        return `<tr><td>${name}<small>${esc(c.soldBy(qty(r.theoreticalInRange) + ' ' + (r.unit || '')))}</small></td><td colspan="8"><span class="cv-pill">${esc(status(r))}</span></td></tr>`;
      }
      const cls = r.gap > 0 ? 'leak' : r.gap < 0 ? 'surplus' : '';
      return `<tr><td>${name}${r.unit ? `<small>${esc(r.unit)}</small>` : ''}</td>
        <td class="num">${qty(r.opening)}</td><td class="num">${qty(r.supply, true)}</td><td class="num">${qty(r.closing)}</td>
        <td class="num">${qty(r.actualUse)}</td><td class="num">${qty(r.theoretical)}</td><td class="num">${qty(r.waste)}</td>
        <td class="num ${cls}">${qty(r.gap, true)}${r.gapPct != null ? `<small>${esc(pct(r.gapPct))}</small>` : ''}</td>
        <td class="num ${cls}">${r.gapCents == null ? `<span class="cv-pill">${esc(c.noCost)}</span>` : mad(r.gapCents, true)}</td></tr>`;
    };
    return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.leaks)}</div>
      <div class="cv-sum">${esc(sub)}${V.measured ? ' · ' + esc(c.leakSum(mad(V.leakCents), mad(V.surplusCents), mad(V.netGapCents, true))) : ''}</div>
      <div class="cv-tbl-wrap"><table class="cv-tbl"><thead><tr>${c.cols.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(tr).join('')}</tbody></table></div>
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
    if (V.missingCount > 0) items.push(esc(c.needCount(V.missingCount)));
    if (C.stockNoCost > 0) items.push(esc(c.stockNoCost(C.stockNoCost)));
    if (C.ledgerNoCostRows > 0) items.push(esc(c.ledgerNoCost(C.ledgerNoCostRows)));
    if (!items.length) return '';
    return `<div class="cv-card"><div class="cv-eyebrow">${esc(c.todo)}</div><ul class="cv-todo">${items.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  }

  function emptyCard(h, p, action, btn) {
    return `<div class="cv-card cv-empty"><b>${esc(h)}</b><p>${esc(p)}</p><button class="kb atlas" type="button" data-action="${action}">${esc(btn)}</button></div>`;
  }

  function body(data) {
    const c = t();
    const sites = data.sites || [];
    if (!sites.length) return '';
    const all = data.scope === 'all' && data.total;
    const R = all ? data.total.ratios : sites[0].ratios;
    const zone = data.range && data.range.zone;
    const losses = all ? mergeLosses(sites) : sites[0].losses;
    const V = all ? mergeVariance(sites) : sites[0].variance;
    const costed = sites.some((s) => (s.coverage && s.coverage.costedRevenueCents) > 0);
    const hasSales = R.netSalesCents !== 0;
    let out = '';
    if (data.demo) out += `<div class="cv-note">${esc(c.demo)}</div>`;
    if (hasSales && !costed) out += emptyCard(c.emptyRecipesH, c.emptyRecipes, 'nav-menu', c.emptyRecipesBtn);
    out += `<div class="cv-grid">${ratiosCard(R)}<div style="display:grid;gap:16px;align-content:start;min-width:0">${lossesCard(losses)}${all ? '' : todoCard(sites[0])}</div></div>`;
    if (!V.countsFound) out += emptyCard(c.emptyCountH, c.emptyCount, 'nav-stock', c.emptyCountBtn);
    if ((V.rows || []).length) out += leaksCard(V, zone, all);
    return out;
  }

  function mergeLosses(sites) {
    const m = new Map();
    sites.forEach((s) => (s.losses || []).forEach((x) => {
      const k = x.source + '|' + x.reason;
      const cur = m.get(k) || { reason: x.reason, source: x.source, cents: 0 };
      cur.cents += x.cents; m.set(k, cur);
    }));
    return [...m.values()].sort((a, b) => b.cents - a.cents);
  }
  function mergeVariance(sites) {
    const rows = [];
    const out = { rows, countsFound: false, windows: [], leakCents: 0, surplusCents: 0, netGapCents: 0, measured: 0, missingCount: 0 };
    sites.forEach((s) => {
      const V = s.variance || {};
      (V.rows || []).forEach((r) => rows.push(Object.assign({}, r, { site: s.name })));
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
    if (!real) { const d = sample(); slot.innerHTML = `<section class="cv" data-costvar>${head(d)}${body(d)}</section>`; return; }
    if (!entry || (!entry.data && !entry.error)) {
      slot.innerHTML = `<section class="cv" data-costvar aria-busy="true">${head(null)}<div class="cv-skel" role="status" aria-label="${esc(c.loading)}"></div></section>`;
      return;
    }
    if (entry.error) {
      const msg = entry.error === 'forbidden' ? c.forbidden : entry.error === 'offline' ? c.offline : c.error;
      slot.innerHTML = `<section class="cv" data-costvar>${head(null)}<div class="cv-card cv-empty"><p>${esc(msg)}</p>${entry.error === 'forbidden' ? '' : `<button class="kb" type="button" data-action="costvar-retry">${esc(c.retry)}</button>`}</div></section>`;
      return;
    }
    slot.innerHTML = `<section class="cv" data-costvar>${head(entry.data)}${body(entry.data)}</section>`;
  }

  function mount(slot, opts) {
    slot = slot || document.querySelector('[data-costvar-slot]');
    if (!slot) return;
    const real = !!(opts && opts.real);
    last = { slot, real };
    if (!real) { paint(slot, null, false); return; }
    const m = merchant();
    if (!m) { paint(slot, { error: 'error' }, true); return; }
    const entry = cache.get(keyOf(m));
    const fresh = entry && (entry.data || entry.error) && Date.now() - entry.at < CACHE_MS;
    paint(slot, entry && (entry.data || entry.error) ? entry : null, true);
    if (fresh) return;
    load(m).then((e) => { if (last.slot === slot && merchant() === m) paint(slot, e, true); });
  }
  const remount = () => { if (last.slot && last.slot.isConnected) mount(last.slot, { real: last.real }); };

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

})();
