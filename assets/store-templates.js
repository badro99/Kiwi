/* ═══════════════════════════════════════════════════════════════════════════
 *  KIWI · MODÈLES DE CATALOGUE  (assets/store-templates.js)
 *
 *  Un magasin qui vient d'être créé est vide, et le premier geste qu'on lui
 *  demande — « créez votre premier article » — est aussi le plus long : nom,
 *  prix, catégorie, format, couleurs, code-barres, article après article.
 *  Ce fichier propose à la place des RAYONS TOUT PRÊTS : le commerçant coche
 *  ceux qui ressemblent à sa boutique, et le catalogue démarre avec ses
 *  catégories et une trentaine d'articles qu'il n'a plus qu'à corriger.
 *
 *  Deux points de contact, un seul jeu de données :
 *    · à la fin de l'assistant d'installation (assets/onboarding.js) ;
 *    · depuis l'Inventaire du tableau de bord (assets/pages-pro.js).
 *
 *  CE QUE LE MODÈLE N'INVENTE PAS : le stock. Chaque déclinaison est créée à
 *  zéro. Un catalogue livré avec des quantités plausibles serait un mensonge
 *  dans les KPI dès la première seconde — la valeur de stock, les ruptures,
 *  la marge. Le commerçant saisit ses quantités à la réception, et jusque-là
 *  ses articles s'affichent honnêtement « en rupture ».
 *
 *  L'INTERFACE est trilingue ; les NOMS CRÉÉS sont en français, comme tout le
 *  reste du catalogue (la caisse et le tableau de bord affichent le nom saisi
 *  tel quel, ils ne le traduisent pas — voir assets/caisse-lang.js).
 *
 *  Icônes : Material Symbols (Outlined 400, grade 0, grille 24), tracés
 *  recopiés depuis assets/icons/material/ — voir le README de ce dossier.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const lang = () => { try { return localStorage.getItem('kiwiLang') || 'fr'; } catch (_) { return 'fr'; } };
  const tr = (o) => (o == null ? '' : (typeof o === 'string' ? o : (o[lang()] ?? o.fr ?? '')));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mi = (d, n) => `<svg width="${n || 24}" height="${n || 24}" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;

  /* ── Icônes, une par rayon ─────────────────────────────────────────────── */
  /* flatware.svg */
  const I_FLATWARE = mi('M200-120v-400q-33 0-56.5-23.5T120-600v-212q0-12 8-20t20-8q12 0 20 8t8 20v132h36v-132q0-12 8-20t20-8q12 0 20 8t8 20v132h36v-132q0-12 8-20t20-8q12 0 20 8t8 20v212q0 33-23.5 56.5T280-520v400h-80Zm280 0v-404q-42-20-61-62.5T400-676q0-63 31.5-113.5T520-840q57 0 88.5 50.5T640-676q0 47-19 89.5T560-524v404h-80Zm200 0v-720q66 0 113 47t47 113v240h-80v320h-80Z');
  /* wine_bar.svg */
  const I_WINE = mi('M320-120v-80h120v-164q-86-14-143-80t-57-156v-240h480v240q0 90-57 156t-143 80v164h120v80H320Zm258-354q42-34 56-86H326q14 52 56 86t98 34q56 0 98-34ZM320-640h320v-120H320v120Zm160 200Z');
  /* candle.svg */
  const I_CANDLE = mi('M240-160h480q17 0 28.5-11.5T760-200H200q0 17 11.5 28.5T240-160Zm160-513.5Q368-707 370-755q2-52 36.5-91.5T480-920q39 34 73.5 73.5T590-755q2 48-30 81.5T480-640q-48 0-80-33.5ZM440-280h80v-240h-80v240Zm61.5-449q8.5-9 8.5-22 0-17-9.5-31T480-809q-11 13-20.5 27t-9.5 31q0 13 8.5 22t21.5 9q13 0 21.5-9Zm330 440.5Q840-297 840-310t-8.5-21.5Q823-340 810-340t-21.5 8.5Q780-323 780-310t8.5 21.5Q797-280 810-280t21.5-8.5ZM720-80H240q-50 0-85-35t-35-85v-80h240v-240q0-33 23.5-56.5T440-600h80q33 0 56.5 23.5T600-520v240h104q-2-8-3-15t-1-15q0-46 32-78t78-32q46 0 78 32t32 78q0 38-22.5 67T840-204v4q0 50-35 85t-85 35Zm-240-80Zm-40-120h80-80Zm40-484Z');
  /* photo_frame.svg */
  const I_FRAME = mi('M240-120q-17 0-28.5-11.5T200-160v-40h-80q-33 0-56.5-23.5T40-280v-440q0-33 23.5-56.5T120-800h720q33 0 56.5 23.5T920-720v440q0 33-23.5 56.5T840-200h-80v40q0 17-11.5 28.5T720-120H240ZM120-280h720v-440H120v440Zm80-80h560L580-600 440-420 340-540 200-360Zm-80 80v-440 440Z');
  /* bed.svg */
  const I_LINGE = mi('M80-200v-240q0-27 11-49t29-39v-112q0-50 35-85t85-35h160q23 0 43 8.5t37 23.5q17-15 37-23.5t43-8.5h160q50 0 85 35t35 85v112q18 17 29 39t11 49v240h-80v-80H160v80H80Zm440-360h240v-80q0-17-11.5-28.5T720-680H560q-17 0-28.5 11.5T520-640v80Zm-320 0h240v-80q0-17-11.5-28.5T400-680H240q-17 0-28.5 11.5T200-640v80Zm-40 200h640v-80q0-17-11.5-28.5T760-480H200q-17 0-28.5 11.5T160-440v80Zm640 0H160h640Z');
  /* chair.svg */
  const I_CHAIR = mi('M200-120q-17 0-28.5-11.5T160-160v-40q-50 0-85-35t-35-85v-200q0-50 35-85t85-35v-80q0-50 35-85t85-35h400q50 0 85 35t35 85v80q50 0 85 35t35 85v200q0 50-35 85t-85 35v40q0 17-11.5 28.5T760-120q-17 0-28.5-11.5T720-160v-40H240v40q0 17-11.5 28.5T200-120Zm-40-160h640q17 0 28.5-11.5T840-320v-200q0-17-11.5-28.5T800-560q-17 0-28.5 11.5T760-520v160H200v-160q0-17-11.5-28.5T160-560q-17 0-28.5 11.5T120-520v200q0 17 11.5 28.5T160-280Zm120-160h400v-80q0-27 11-49t29-39v-112q0-17-11.5-28.5T680-760H280q-17 0-28.5 11.5T240-720v112q18 17 29 39t11 49v80Zm200 0Zm0 160Zm0-80Z');
  /* table_restaurant.svg — la marque du sélecteur, rendue à la taille demandée */
  const D_TABLE = 'M173-600h614l-34-120H208l-35 120Zm307-60Zm192 140H289l-11 80h404l-10-80ZM160-160l49-360h-89q-20 0-31.5-16T82-571l57-200q4-13 14-21t24-8h606q14 0 24 8t14 21l57 200q5 19-6.5 35T840-520h-88l48 360h-80l-27-200H267l-27 200h-80Z';

  /* ── Les rayons ────────────────────────────────────────────────────────────
   *  Un article : { name, price, art, format, servicePieces, piecePriceMAD,
   *                 marque, motif, fragile, colors }
   *  `format:'service'` = vendu en service complet (le prix est celui du
   *  service, `piecePriceMAD` celui de la pièce détachée) — c'est le format
   *  que la caisse Maison sait éclater à la vente.
   *  Les couleurs sont des nuances : le catalogue les range dans leur famille
   *  et garde le mot d'origine (voir normColor dans boutique-catalog.js).
   *  Aucune MARQUE n'est écrite ici : ce serait inventer un fournisseur à la
   *  place du commerçant. Il la saisit sur la fiche article. ── */
  const MAISON = [
    {
      id: 'arts_table', icon: I_FLATWARE, color: 'atlas',
      label: { fr: 'Arts de la table', en: 'Tableware', ar: 'أدوات المائدة' },
      hint: { fr: 'Services, assiettes, bols, couverts.', en: 'Dinner sets, plates, bowls, cutlery.', ar: 'أطقم، صحون، أوعية، أدوات.' },
      items: [
        { name: 'Service de table 18 pièces', price: 1450, art: 'assiette', format: 'service', servicePieces: 18, piecePriceMAD: 85, motif: 'Fès Bleu', fragile: true, colors: ['bleu', 'ivoire'] },
        { name: 'Service de table 12 pièces', price: 1100, art: 'assiette', format: 'service', servicePieces: 12, piecePriceMAD: 95, motif: 'Zellige Vert', fragile: true, colors: ['emeraude', 'blanc'] },
        { name: 'Assiette plate 27 cm', price: 85, art: 'assiette', fragile: true, colors: ['bleu', 'ivoire', 'blanc'] },
        { name: 'Assiette creuse 22 cm', price: 75, art: 'assiette', fragile: true, colors: ['bleu', 'ivoire', 'blanc'] },
        { name: 'Bol à soupe 16 cm', price: 65, art: 'bol', fragile: true, colors: ['bleu', 'ivoire'] },
        { name: 'Tasse & soucoupe', price: 55, art: 'tasse', fragile: true, colors: ['bleu', 'ivoire', 'dore'] },
        { name: 'Plat de service ovale 40 cm', price: 220, art: 'plat', fragile: true, colors: ['blanc', 'emeraude'] },
        { name: 'Ménagère 24 couverts inox', price: 890, art: 'couvert', format: 'service', servicePieces: 24, piecePriceMAD: 40, fragile: false, colors: ['argent', 'dore'] },
        { name: 'Théière ciselée 1 L', price: 340, art: 'theiere', fragile: false, colors: ['argent', 'dore'] },
      ],
    },
    {
      id: 'verrerie', icon: I_WINE, color: 'info',
      label: { fr: 'Verrerie & cristallerie', en: 'Glassware', ar: 'الزجاجيات' },
      hint: { fr: 'Verres soufflés, carafes, coupes.', en: 'Blown glasses, carafes, coupes.', ar: 'كؤوس منفوخة، أباريق.' },
      items: [
        { name: 'Verres soufflés beldi (set de 6)', price: 140, art: 'verre', format: 'service', servicePieces: 6, piecePriceMAD: 25, motif: 'Beldi', fragile: true, colors: ['emeraude', 'transparent', 'ambre'] },
        { name: 'Verre à thé doré (pièce)', price: 28, art: 'verre', motif: 'Beldi', fragile: true, colors: ['dore', 'transparent'] },
        { name: 'Carafe soufflée 1,5 L', price: 120, art: 'carafe', motif: 'Beldi', fragile: true, colors: ['emeraude', 'transparent'] },
        { name: 'Coupes à dessert dorées', price: 75, art: 'coupe', fragile: true, colors: ['dore', 'transparent'] },
        { name: 'Flûtes à champagne (set de 6)', price: 260, art: 'verre', format: 'service', servicePieces: 6, piecePriceMAD: 45, fragile: true, colors: ['transparent', 'dore'] },
        { name: 'Seau à glace en verre', price: 190, art: 'seau', fragile: true, colors: ['transparent', 'argent'] },
      ],
    },
    {
      id: 'bougies', icon: I_CANDLE, color: 'warn',
      label: { fr: 'Bougies & senteurs', en: 'Candles & scents', ar: 'الشموع والعطور' },
      hint: { fr: 'Bougies, diffuseurs, photophores.', en: 'Candles, diffusers, lanterns.', ar: 'شموع، ناشرات عطر.' },
      items: [
        { name: 'Bougie parfumée grand format', price: 520, art: 'bougie', fragile: true, colors: ['ivoire', 'noir'] },
        { name: 'Bougie parfumée format moyen', price: 320, art: 'bougie', fragile: true, colors: ['ivoire', 'terracotta'] },
        { name: 'Diffuseur de parfum 200 ml', price: 480, art: 'diffuseur', fragile: true, colors: ['ambre', 'blanc'] },
        { name: 'Recharge diffuseur 200 ml', price: 260, art: 'diffuseur', fragile: true, colors: ['ambre'] },
        { name: 'Encens & porte-encens laiton', price: 180, art: 'encens', fragile: false, colors: ['dore'] },
        { name: 'Photophore verre ciselé', price: 140, art: 'photophore', fragile: true, colors: ['transparent', 'dore', 'emeraude'] },
      ],
    },
    {
      id: 'decoration', icon: I_FRAME, color: 'riad',
      label: { fr: 'Décoration & cadeaux', en: 'Decor & gifts', ar: 'الديكور والهدايا' },
      hint: { fr: 'Vases, plateaux, miroirs, coffrets.', en: 'Vases, trays, mirrors, gift boxes.', ar: 'مزهريات، صواني، مرايا.' },
      items: [
        { name: 'Vase céramique émaillée 35 cm', price: 650, art: 'vase', motif: 'Zellige Vert', fragile: true, colors: ['emeraude', 'bleu'] },
        { name: 'Vase soliflore 20 cm', price: 210, art: 'vase', fragile: true, colors: ['blanc', 'terracotta'] },
        { name: 'Plateau laiton martelé main', price: 420, art: 'plateau', fragile: false, colors: ['dore', 'argent'] },
        { name: 'Miroir soleil laiton 50 cm', price: 890, art: 'miroir', fragile: true, colors: ['dore'] },
        { name: 'Cadre photo bois de cèdre', price: 160, art: 'cadre', fragile: true, colors: ['camel', 'noir'] },
        { name: 'Boîte à bijoux nacrée', price: 380, art: 'boite', fragile: true, colors: ['ivoire', 'dore'] },
        { name: 'Coffret cadeau 2 verres + bougie', price: 340, art: 'coffret', fragile: true, colors: ['ivoire', 'emeraude'] },
      ],
    },
    {
      id: 'linge', icon: I_LINGE, color: 'mint',
      label: { fr: 'Linge de maison', en: 'Home linen', ar: 'مفروشات المنزل' },
      hint: { fr: 'Nappes, sets, coussins, plaids.', en: 'Tablecloths, mats, cushions, throws.', ar: 'مفارش، وسائد، أغطية.' },
      items: [
        { name: 'Nappe brodée main 150 × 250', price: 690, art: 'nappe', fragile: false, colors: ['ivoire', 'blanc'] },
        { name: 'Set de table tissé (lot de 6)', price: 240, art: 'set_table', format: 'service', servicePieces: 6, piecePriceMAD: 45, fragile: false, colors: ['camel', 'terracotta', 'ivoire'] },
        { name: 'Serviettes de table (lot de 6)', price: 180, art: 'serviette', format: 'service', servicePieces: 6, piecePriceMAD: 35, fragile: false, colors: ['ivoire', 'blanc', 'emeraude'] },
        { name: 'Coussin brodé 45 × 45', price: 220, art: 'coussin', fragile: false, colors: ['terracotta', 'emeraude', 'ivoire'] },
        { name: 'Plaid laine tissée', price: 560, art: 'plaid', fragile: false, colors: ['camel', 'gris'] },
        { name: 'Tapis de couloir 80 × 200', price: 1200, art: 'tapis', fragile: false, colors: ['ivoire', 'noir'] },
      ],
    },
    {
      id: 'luminaires', icon: I_CHAIR, color: 'danger',
      label: { fr: 'Mobilier d’appoint & luminaires', en: 'Small furniture & lighting', ar: 'أثاث صغير وإنارة' },
      hint: { fr: 'Tabourets, poufs, lanternes, lampes.', en: 'Stools, poufs, lanterns, lamps.', ar: 'مقاعد، فوانيس، مصابيح.' },
      items: [
        { name: 'Lanterne laiton ajouré 40 cm', price: 480, art: 'lanterne', fragile: true, colors: ['dore', 'argent'] },
        { name: 'Suspension raphia 45 cm', price: 620, art: 'suspension', fragile: true, colors: ['camel'] },
        { name: 'Lampe à poser céramique', price: 740, art: 'lampe', fragile: true, colors: ['blanc', 'emeraude'] },
        { name: 'Tabouret cuir tressé', price: 450, art: 'tabouret', fragile: false, colors: ['camel', 'noir'] },
        { name: 'Guéridon bois sculpté', price: 980, art: 'gueridon', fragile: false, colors: ['camel'] },
        { name: 'Pouf cuir brodé', price: 690, art: 'pouf', fragile: false, colors: ['camel', 'terracotta'] },
      ],
    },
  ];

  /* Quel métier reçoit quels rayons. La clé est le SOUS-TYPE d'onboarding
     (assets/trades.js), pas la base : « maison » et « boutique » partagent la
     base `boutique` mais ne vendent pas la même chose. */
  const BY_TRADE = { maison: MAISON };

  /* ── Lecture ───────────────────────────────────────────────────────────── */
  function packsFor(tradeId) { return BY_TRADE[String(tradeId || '')] || []; }
  function has(tradeId) { return packsFor(tradeId).length > 0; }
  function countOf(pack) { return (pack && pack.items ? pack.items.length : 0); }
  function totalOf(tradeId) { return packsFor(tradeId).reduce((s, p) => s + countOf(p), 0); }

  /* Le métier du magasin ouvert, tel que l'onboarding l'a écrit. */
  function currentTrade() {
    try {
      const v = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (v && v.subtype) return String(v.subtype);
    } catch (_) {}
    try { return String(localStorage.getItem('kiwiBizType') || ''); } catch (_) { return ''; }
  }

  /* ── Écriture ──────────────────────────────────────────────────────────────
   *  Idempotent par le NOM : un rayon déjà créé est réutilisé, un article déjà
   *  présent est ignoré. Poser deux fois le même modèle ne double donc rien —
   *  c'est ce qui permet d'en ajouter un second plus tard sans réfléchir.
   *  Tout passe par un seul `batch()` : un geste métier, une écriture. ── */
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function apply(tradeId, ids) {
    const cat = window.KiwiBoutiqueCatalog;
    if (!cat) return null;
    const want = Array.isArray(ids) ? ids : [ids];
    const chosen = packsFor(tradeId).filter((p) => want.indexOf(p.id) >= 0);
    if (!chosen.length) return { categories: 0, products: 0, skipped: 0 };

    let nCats = 0, nProds = 0, nSkip = 0;
    cat.batch(() => {
      const known = new Set(cat.listProducts({ includeArchived: true }).map((p) => norm(p.name)));
      chosen.forEach((pack) => {
        const label = tr(pack.label);
        const existing = cat.listCategories().find((c) => norm(c.name) === norm(label));
        const category = existing || cat.addCategory(label, pack.color);
        if (!existing) nCats++;
        pack.items.forEach((it) => {
          if (known.has(norm(it.name))) { nSkip++; return; }
          known.add(norm(it.name));
          const prod = cat.addProduct({
            name: it.name, categoryId: category.id,
            priceMAD: it.price, cost: 0, kind: 'tu', art: it.art || '',
            format: it.format === 'service' ? 'service' : 'piece',
            servicePieces: it.format === 'service' ? it.servicePieces : null,
            piecePriceMAD: it.format === 'service' ? it.piecePriceMAD : null,
            motif: it.motif || '', fragile: !!it.fragile,
          });
          /* Le stock reste à 0 : voir l'en-tête. Chaque déclinaison reçoit tout
             de même son code-barres pour être douchable dès la réception. */
          (it.colors && it.colors.length ? it.colors : ['blanc']).forEach((colorId) => {
            const v = cat.addVariant({ productId: prod.id, colorId, size: 'TU', stock: 0 });
            if (v) { try { cat.generateBarcode(v.id); } catch (_) {} }
          });
          nProds++;
        });
      });
    });
    return { categories: nCats, products: nProds, skipped: nSkip };
  }

  /* ── Le sélecteur ──────────────────────────────────────────────────────── */
  let styled = false;
  function injectCss() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.id = 'kiwi-store-templates-css';
    s.textContent = `
      .kst-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:10px}
      .kst-card{position:relative;display:flex;gap:11px;align-items:flex-start;text-align:left;padding:13px 14px;
        border:1px solid rgba(10,15,13,.14);border-radius:14px;background:var(--paper,#F7F5F0);cursor:pointer;
        transition:border-color .18s ease, box-shadow .18s ease, background .18s ease;font:inherit;color:inherit;width:100%}
      .kst-card:hover{border-color:rgba(11,110,79,.42)}
      .kst-card:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:2px}
      .kst-card.on{border-color:var(--atlas,#0B6E4F);box-shadow:inset 0 0 0 1px var(--atlas,#0B6E4F);background:rgba(11,110,79,.06)}
      .kst-ic{flex:0 0 auto;display:grid;place-items:center;width:38px;height:38px;border-radius:11px;
        background:rgba(11,110,79,.10);color:var(--atlas,#0B6E4F)}
      .kst-card.on .kst-ic{background:var(--atlas,#0B6E4F);color:#fff}
      .kst-tx{min-width:0}
      .kst-tx b{display:block;font-size:13.5px;font-weight:600;line-height:1.25}
      .kst-tx span{display:block;font-size:11.5px;line-height:1.4;color:var(--n-500,#77807b);margin-top:3px}
      .kst-n{display:inline-block;margin-top:6px;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;
        color:var(--atlas,#0B6E4F);font-weight:600}
      .kst-note{margin:12px 0 0;font-size:11.5px;line-height:1.5;color:var(--n-500,#77807b)}
      .kst-empty{margin:0 0 12px;font-size:12.5px;line-height:1.55}
      @media (max-width:560px){.kst-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  /* Ouvre le sélecteur. `opts.then` est appelé à la fermeture, quoi qu'il
     arrive — l'assistant s'en sert pour enchaîner sur l'appairage de la caisse
     sans empiler deux fenêtres. Rend le modal, ou null si rien à proposer. */
  function open(opts) {
    opts = opts || {};
    const trade = opts.trade || currentTrade();
    const packs = packsFor(trade);
    const Kw = window.Kiwi;
    if (!packs.length || !Kw || !Kw.modal) { if (opts.then) opts.then(null); return null; }
    injectCss();

    const picked = new Set(opts.preselect || []);
    const body = `
      <p class="kst-empty">${esc(tr({
        fr: 'Cochez les rayons qui ressemblent à votre magasin. Kiwi crée les catégories et les articles ; vous n’avez plus qu’à ajuster les prix et saisir vos quantités.',
        en: 'Tick the aisles that look like your shop. Kiwi creates the categories and the articles; you only adjust prices and enter your quantities.',
        ar: 'اختر الأقسام التي تشبه متجرك. كيوي ينشئ الفئات والمنتجات؛ يبقى لك تعديل الأسعار وإدخال الكميات.',
      }))}</p>
      <div class="kst-grid">
        ${packs.map((p) => `
          <button type="button" class="kst-card" data-pack="${esc(p.id)}" aria-pressed="false">
            <span class="kst-ic">${p.icon}</span>
            <span class="kst-tx">
              <b>${esc(tr(p.label))}</b>
              <span>${esc(tr(p.hint))}</span>
              <span class="kst-n">${countOf(p)} ${esc(tr({ fr: 'articles', en: 'articles', ar: 'منتجات' }))}</span>
            </span>
          </button>`).join('')}
      </div>
      <p class="kst-note">${esc(tr({
        fr: 'Le stock reste à zéro : vous le saisissez à la réception. Chaque déclinaison reçoit son code-barres, prête à être douchée.',
        en: 'Stock stays at zero: you enter it on delivery. Every variant gets its barcode, ready to scan.',
        ar: 'المخزون يبقى صفراً: تُدخله عند الاستلام. كل نسخة تحصل على رمزها الشريطي.',
      }))}</p>`;

    const m = Kw.modal({
      title: tr({ fr: 'Modèles de rayons', en: 'Starter aisles', ar: 'أقسام جاهزة' }),
      tag: tr({ fr: 'Démarrer le catalogue', en: 'Start the catalogue', ar: 'بدء الكتالوج' }),
      desc: esc(tr({ fr: 'Un catalogue de départ pour votre magasin — à corriger librement ensuite.', en: 'A starting catalogue for your shop — free to edit afterwards.', ar: 'كتالوج انطلاق لمتجرك — يمكنك تعديله بحرية.' })),
      width: 640,
      body,
      foot: `<button class="kb ghost" data-kst-skip>${esc(tr({ fr: 'Plus tard', en: 'Later', ar: 'لاحقاً' }))}</button>`
        + `<button class="kb atlas" data-kst-go disabled>${esc(tr({ fr: 'Ajouter à mon catalogue', en: 'Add to my catalogue', ar: 'أضف إلى كتالوجي' }))}</button>`,
    });

    const root = m.el;
    const go = root.querySelector('[data-kst-go]');
    const sync = () => { go.disabled = picked.size === 0; };
    root.querySelectorAll('[data-pack]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-pack');
        if (picked.has(id)) picked.delete(id); else picked.add(id);
        btn.classList.toggle('on', picked.has(id));
        btn.setAttribute('aria-pressed', picked.has(id) ? 'true' : 'false');
        sync();
      });
    });
    picked.forEach((id) => {
      const b = root.querySelector(`[data-pack="${id}"]`);
      if (b) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
    });
    sync();

    let done = false;
    const finish = (res) => { if (done) return; done = true; if (opts.then) { try { opts.then(res); } catch (_) {} } };
    /* Fermeture par la croix, Échap ou le fond : le modal se retire tout seul,
       on ne l'apprend qu'en le surveillant. */
    const watch = new MutationObserver(() => { if (!root.isConnected) { watch.disconnect(); finish(null); } });
    watch.observe(document.body, { childList: true });

    root.querySelector('[data-kst-skip]').addEventListener('click', () => { finish(null); m.close(); });
    go.addEventListener('click', () => {
      const res = apply(trade, Array.from(picked));
      m.close();
      if (res && Kw.toast) {
        Kw.toast(tr({ fr: 'Catalogue démarré', en: 'Catalogue started', ar: 'بدأ الكتالوج' }), {
          type: 'success',
          desc: tr({
            fr: `${res.products} article${res.products > 1 ? 's' : ''} créé${res.products > 1 ? 's' : ''}${res.skipped ? ` · ${res.skipped} déjà présent${res.skipped > 1 ? 's' : ''}` : ''} · stock à saisir`,
            en: `${res.products} article${res.products > 1 ? 's' : ''} created${res.skipped ? ` · ${res.skipped} already there` : ''} · stock to enter`,
            ar: `${res.products} منتج · المخزون يبقى للإدخال`,
          }),
        });
      }
      finish(res);
      if (opts.onApplied) { try { opts.onApplied(res); } catch (_) {} }
    });

    return m;
  }

  /* Proposé de lui-même à la fin de l'installation — mais SEULEMENT si le
     métier a des rayons et si le catalogue est encore vide. Un magasin qui a
     déjà des articles n'a pas besoin qu'on lui propose un point de départ.
     Rend true si la fenêtre s'est ouverte. */
  function offer(tradeId, opts) {
    opts = opts || {};
    if (!has(tradeId)) return false;
    try {
      const cat = window.KiwiBoutiqueCatalog;
      if (cat && cat.listProducts({ includeArchived: true }).length) return false;
    } catch (_) { return false; }
    return !!open({ trade: tradeId, then: opts.then, onApplied: opts.onApplied });
  }

  window.KiwiStoreTemplates = {
    mark: (n) => mi(D_TABLE, n || 24),
    has, packs: (t) => packsFor(t).slice(), count: countOf, total: totalOf,
    currentTrade, apply, open, offer,
  };
})();
