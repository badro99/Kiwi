/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE CATALOG — window.KiwiBoutiqueCatalog
 * ---------------------------------------------------------------------------
 * The ONE product database shared by the two boutique surfaces:
 *   · caisse boutique (PIN 0002 · assets/pos-boutique.js) — CREATES products,
 *     inputs stock, generates + prints barcodes, registers existing old-POS codes
 *   · dashboard boutique (assets/pages-pro.js) — VIEWS + edits the same inventory
 *
 * Persisted to localStorage (per-venue key → cloneable for future stores).
 * Both tabs stay in sync: same-page listeners via subscribe(), cross-tab via the
 * native `storage` event. A variant = product × color × size is the atomic
 * barcoded unit; every variant carries a list of barcodes (a generated in-store
 * EAN-13 as `primary`, plus any scanned old-POS codes kept verbatim as aliases).
 *
 * Depends on window.KiwiBarcode (assets/barcode.js) — load barcode.js first.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // The catalogue is PER VENUE, so every boutique (present or future) gets its
  // own inventory. `maisonMansour` is the pre-seeded demo store; any other venue
  // starts EMPTY (a real new client re-scans their own stock). Surfaces call
  // KiwiBoutiqueCatalog.use(venueId) to switch which store's catalogue is active
  // (the caisse pins 0002 → 'maisonMansour'; the dashboard follows KiwiVenue).
  const DEMO_VENUE = 'maisonMansour';
  /* Les vitrines de démonstration et le socle que chacune pré-remplit. Le pré-
   * remplissage reste réservé à ces clés-là : un magasin réel ou jumelé démarre
   * vide (voir hostedOrPaired dans load()). Ajouter un vertical de démonstration,
   * c'est ajouter SA clé ici — sans quoi sa caisse ouvre sur un catalogue vide. */
  const DEMO_SEEDS = { maisonMansour: () => SEED, vogueHome: () => SEED_MAISON };
  const keyFor = (v) => 'kiwiBoutiqueCatalog:v1:' + v;
  let VENUE = DEMO_VENUE;
  let KEY = keyFor(VENUE);

  /* ───────────────── shared colour palette (first-class attribute) ───────────────
     The palette is NOT defined here — it lives once, in assets/color-palette.js
     (window.KiwiColors), so the caisse, the dashboard, the public Order Pro page
     and this base cannot drift apart. What a vendor picks is a general FAMILY
     (Noir · Blanc · Gris · Marron · Beige · Rouge · Orange · Jaune · Vert · Bleu
     · Violet · Rose · Multicolore, plus Transparent where a store uses it), not
     a shade. "Bleu nuit", "royal", "turquoise" all read as Bleu.

     LEGACY_SHADES is the retired 13-shade palette this file used to define. It
     stays because live variants still carry those ids and the demo seed is
     written in them: it lets a stored `nuit` variant recover the exact words the
     merchant originally typed ("Bleu nuit") while DISPLAYING the Bleu family.
     Nothing is rewritten and nothing is merged — see normColor() / migrate(). */
  const LEGACY_SHADES = {
    ivoire:     { label: 'Ivoire',      hex: '#EFE7D6' },
    blanc:      { label: 'Blanc',       hex: '#FFFFFF' },
    noir:       { label: 'Noir',        hex: '#1F2421' },
    dore:       { label: 'Doré',        hex: '#C9A227' },
    argent:     { label: 'Argenté',     hex: '#C8CCD0' },
    bordeaux:   { label: 'Bordeaux',    hex: '#6E1F2E' },
    nuit:       { label: 'Bleu nuit',   hex: '#1F3A5C' },
    emeraude:   { label: 'Émeraude',    hex: '#2E6B4F' },
    safran:     { label: 'Safran',      hex: '#D99A2B' },
    terracotta: { label: 'Terracotta',  hex: '#B0613F' },
    rose:       { label: 'Rose poudré', hex: '#D8A8A0' },
    camel:      { label: 'Camel',       hex: '#B68B5C' },
    gris:       { label: 'Gris perle',  hex: '#9AA09D' },
  };

  // Degraded stand-in for the rare load where color-palette.js is missing: the
  // catalogue must still open, so we answer with the family set it would have.
  const KC_FALLBACK = [
    { id: 'noir', label: 'Noir', hex: '#1A1A1A' }, { id: 'blanc', label: 'Blanc', hex: '#FFFFFF' },
    { id: 'gris', label: 'Gris', hex: '#9AA0A6' }, { id: 'marron', label: 'Marron', hex: '#6B4A2F' },
    { id: 'beige', label: 'Beige', hex: '#E0CFB2' }, { id: 'rouge', label: 'Rouge', hex: '#C62828' },
    { id: 'orange', label: 'Orange', hex: '#E8720C' }, { id: 'jaune', label: 'Jaune', hex: '#F2C230' },
    { id: 'vert', label: 'Vert', hex: '#2E7D46' }, { id: 'bleu', label: 'Bleu', hex: '#1F5FA8' },
    { id: 'violet', label: 'Violet', hex: '#7B4BA8' }, { id: 'rose', label: 'Rose', hex: '#E489AE' },
    { id: 'multi', label: 'Multicolore', hex: '#8A8F8C' },
  ];
  const KC = () => window.KiwiColors || null;
  function COLORS() { const k = KC(); return k ? k.families() : KC_FALLBACK.slice(); }
  function COLOR_BY_ID(id) {
    const k = KC();
    if (k) return k.get(id) || null;
    return KC_FALLBACK.find((c) => c.id === id) || null;
  }

  /* Resolve any colour a variant could carry into the pair we store:
       family  — what every surface DISPLAYS (swatch + name in tooltip/aria)
       source  — the exact words behind it, kept only when they differ, so an
                 import, an old record or a later edit never loses the original.
     `colorId` itself is NEVER touched by this: it is the variant's identity, and
     rewriting it would silently merge "Navy M" into "Blue M". */
  function normColor(id, label, hex) {
    const legacy = LEGACY_SHADES[id];
    const srcLabel = label || (legacy && legacy.label) || '';
    const srcHex = hex || (legacy && legacy.hex) || '';
    const k = KC();
    const fam = k ? k.normalize(id, srcLabel, srcHex)
      : (KC_FALLBACK.find((c) => c.id === id) || KC_FALLBACK[2]);
    const source = srcLabel && String(srcLabel).toLowerCase() !== String(fam.label).toLowerCase() ? srcLabel : '';
    const isCustom = /^custom-[0-9a-f]{6}$/i.test(String(id || '')) && /^#[0-9a-f]{6}$/i.test(String(srcHex || ''));
    return {
      family: fam, source,
      displayLabel: isCustom ? (srcLabel || `Couleur personnalisée ${String(srcHex).toUpperCase()}`) : fam.label,
      displayHex: isCustom ? String(srcHex).toUpperCase() : fam.hex,
      custom: isCustom,
    };
  }

  /* Size presets per garment kind. `taille` = clothing, `pointure` = shoes,
     `tu` = one-size accessory. Products may add custom sizes freely. */
  const SIZE_PRESETS = {
    taille:   ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    pointure: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
    tu:       ['TU'],
  };
  function sizePresets(kind) { return (SIZE_PRESETS[kind] || SIZE_PRESETS.taille).slice(); }

  /* ───────────────── demo seed (mirrors the caisse RAYONS) ─────────────────
     Self-contained so the catalog works in the dashboard too (where the caisse
     module is never loaded). On first run each product fans out into color×size
     variants; the per-size stock is distributed across colours; each variant
     gets a fresh in-store EAN-13, and the product's legacy EAN is kept on its
     first variant as an `imported` alias so old scans still resolve. */
  const SEED = [
    { rayon: 'caftans', rayonLabel: 'Caftans', items: [
      { id: 'caftan_fassi',     name: 'Caftan Fassi',            price: 2400, art: 'caftan',          kind: 'taille', flag: 'brodé main',      ean: '6111120034017', sizes: { S: 2, M: 3, L: 2, XL: 1 }, colors: ['emeraude', 'bordeaux', 'nuit', 'ivoire'] },
      { id: 'caftan_signature', name: 'Caftan Signature Mansour', price: 3500, art: 'caftan_jawhara', kind: 'taille', flag: 'pièce signature', ean: '6111120034024', sizes: { S: 1, M: 0, L: 2, XL: 1 }, colors: ['ivoire', 'dore', 'bordeaux'] },
      { id: 'caftan_velours',   name: 'Caftan Velours',          price: 1850, art: 'caftan_velours',  kind: 'taille',                          ean: '6111120034031', sizes: { S: 2, M: 2, L: 3, XL: 2 }, colors: ['bordeaux', 'nuit', 'emeraude'] },
      { id: 'caftan_ete',       name: 'Caftan Coton Été',        price: 1200, art: 'caftan_ete',      kind: 'taille',                          ean: '6111120034048', sizes: { S: 4, M: 5, L: 3, XL: 2 }, colors: ['ivoire', 'safran', 'terracotta', 'blanc'] },
      { id: 'caftan_perle',     name: 'Caftan Soirée Perlé',     price: 2900, art: 'caftan_perle',    kind: 'taille', flag: 'délicat',         ean: '6111120034055', sizes: { S: 1, M: 2, L: 1, XL: 0 }, colors: ['nuit', 'argent', 'bordeaux'] },
    ] },
    { rayon: 'takchitas', rayonLabel: 'Takchitas', items: [
      { id: 'takchita_sultane', name: 'Takchita Sultane', price: 3200, art: 'takchita',         kind: 'taille',                  ean: '6111120034062', sizes: { S: 1, M: 2, L: 2, XL: 1 }, colors: ['bordeaux', 'dore', 'emeraude'] },
      { id: 'takchita_zellige', name: 'Takchita Zellige', price: 2800, art: 'takchita',         kind: 'taille',                  ean: '6111120034079', sizes: { S: 2, M: 3, L: 1, XL: 1 }, colors: ['emeraude', 'nuit', 'ivoire'] },
      { id: 'takchita_mariage', name: 'Takchita Mariage', price: 4500, art: 'takchita_mariage', kind: 'taille', flag: 'cérémonie', ean: '6111120034086', sizes: { S: 0, M: 1, L: 1, XL: 0 }, colors: ['ivoire', 'dore', 'blanc'] },
      { id: 'takchita_amira',   name: 'Takchita Amira',   price: 2200, art: 'takchita',         kind: 'taille',                  ean: '6111120034093', sizes: { S: 3, M: 3, L: 2, XL: 2 }, colors: ['rose', 'terracotta', 'nuit'] },
    ] },
    { rayon: 'accessoires', rayonLabel: 'Accessoires', items: [
      { id: 'mdamma_doree',  name: 'Mdamma dorée',  price: 650, art: 'mdamma',  kind: 'tu', flag: 'artisanat', ean: '6111120034109', sizes: { TU: 4 },  colors: ['dore', 'argent'] },
      { id: 'foulard_soie',  name: 'Foulard soie',  price: 240, art: 'foulard', kind: 'tu',                    ean: '6111120034116', sizes: { TU: 12 }, colors: ['safran', 'rose', 'nuit', 'ivoire'] },
      { id: 'chale_laine',   name: 'Châle laine',   price: 320, art: 'chale',   kind: 'tu',                    ean: '6111120034123', sizes: { TU: 7 },  colors: ['bordeaux', 'camel', 'gris'] },
      { id: 'broche_perles', name: 'Broche perles', price: 180, art: 'broche',  kind: 'tu',                    ean: '6111120034130', sizes: { TU: 9 },  colors: ['argent', 'dore'] },
    ] },
    { rayon: 'babouches', rayonLabel: 'Babouches', items: [
      { id: 'babouche_homme',  name: 'Babouche cuir homme',   price: 280, art: 'babouche',        kind: 'pointure',                 ean: '6111120034147', sizes: { 40: 2, 41: 3, 42: 4, 43: 2, 44: 1 }, colors: ['camel', 'noir', 'bordeaux'] },
      { id: 'babouche_brodee', name: 'Babouche brodée femme', price: 350, art: 'babouche_brodee', kind: 'pointure',                 ean: '6111120034154', sizes: { 36: 1, 37: 2, 38: 0, 39: 3, 40: 2 }, colors: ['rose', 'ivoire', 'safran'] },
      { id: 'cherbil_perle',   name: 'Cherbil perlé',         price: 450, art: 'cherbil',         kind: 'pointure', flag: 'fait main', ean: '6111120034161', sizes: { 36: 1, 37: 1, 38: 2, 39: 1, 40: 0 }, colors: ['argent', 'rose', 'dore'] },
      { id: 'babouche_enfant', name: 'Babouche enfant',       price: 180, art: 'babouche_enfant', kind: 'pointure',                 ean: '6111120034178', sizes: { 24: 2, 26: 3, 28: 2, 30: 1 }, colors: ['safran', 'rose', 'camel'] },
    ] },
    { rayon: 'sacs', rayonLabel: 'Sacs', items: [
      { id: 'sac_tresse',       name: 'Sac cuir tressé',  price: 780, art: 'sac',      kind: 'tu',                    ean: '6111120034185', sizes: { TU: 3 }, colors: ['camel', 'noir'] },
      { id: 'cabas_berbere',    name: 'Cabas berbère',    price: 420, art: 'cabas',    kind: 'tu', flag: 'artisanat', ean: '6111120034192', sizes: { TU: 6 }, colors: ['terracotta', 'ivoire'] },
      { id: 'pochette_sequins', name: 'Pochette sequins', price: 350, art: 'pochette', kind: 'tu',                    ean: '6111120034208', sizes: { TU: 5 }, colors: ['dore', 'argent', 'noir'] },
    ] },
  ];

  /* ───────────────── seed spécifique Vogue Home (Maison Tanger) ───────────────── */
  const SEED_MAISON = [
    { rayon: 'arts_table', rayonLabel: 'Arts de la table', items: [
      { id: 'mz_fes_bleu_service', name: 'Service 18 pièces Fès Bleu', price: 1450, art: 'assiette', kind: 'tu', format: 'service', servicePieces: 18, piecePriceMAD: 85, marque: 'Vogue Table', motif: 'Fès Bleu', fragile: true, sizes: { TU: 4 }, colors: ['bleu', 'ivoire'] },
      { id: 'mz_fes_bleu_assiette', name: 'Assiette plate 27cm Fès Bleu', price: 85, art: 'assiette', kind: 'tu', format: 'piece', marque: 'Vogue Table', motif: 'Fès Bleu', fragile: true, sizes: { TU: 24 }, colors: ['bleu', 'ivoire'] },
      { id: 'mz_fes_bleu_bol', name: 'Bol à soupe 16cm Fès Bleu', price: 65, art: 'bol', kind: 'tu', format: 'piece', marque: 'Vogue Table', motif: 'Fès Bleu', fragile: true, sizes: { TU: 18 }, colors: ['bleu', 'ivoire'] },
      { id: 'mz_fes_bleu_tasse', name: 'Tasse & soucoupe Fès Bleu', price: 55, art: 'tasse', kind: 'tu', format: 'piece', marque: 'Vogue Table', motif: 'Fès Bleu', fragile: true, sizes: { TU: 16 }, colors: ['bleu', 'ivoire'] },
      { id: 'mz_zellige_service', name: 'Service 12 pièces Zellige Vert', price: 1100, art: 'assiette', kind: 'tu', format: 'service', servicePieces: 12, piecePriceMAD: 95, marque: 'Céramique Majorelle', motif: 'Zellige Vert', fragile: true, sizes: { TU: 3 }, colors: ['emeraude', 'blanc'] },
    ] },
    { rayon: 'verrerie', rayonLabel: 'Verrerie & Cristallerie', items: [
      { id: 'mz_verres_beldi_set', name: 'Verres soufflés Beldi (Set de 6)', price: 140, art: 'verre', kind: 'tu', format: 'service', servicePieces: 6, piecePriceMAD: 25, marque: 'Beldi Glass', motif: 'Classique', fragile: true, sizes: { TU: 8 }, colors: ['emeraude', 'transparent', 'ambre'] },
      { id: 'mz_carafe_beldi', name: 'Carafe soufflée Beldi 1.5L', price: 120, art: 'carafe', kind: 'tu', format: 'piece', marque: 'Beldi Glass', motif: 'Classique', fragile: true, sizes: { TU: 6 }, colors: ['emeraude', 'transparent'] },
      { id: 'mz_coupes_dessert', name: 'Coupes à dessert dorées', price: 75, art: 'coupe', kind: 'tu', format: 'piece', marque: 'Cristal Atlas', motif: 'Sahara Or', fragile: true, sizes: { TU: 12 }, colors: ['dore', 'transparent'] },
    ] },
    { rayon: 'bougies', rayonLabel: 'Bougies & Senteurs', items: [
      { id: 'mz_baobab_feathers', name: 'Bougie Max 24 Totem Feathers', price: 1850, art: 'bougie', kind: 'tu', format: 'piece', marque: 'Baobab Collection', motif: 'Totem', ownership: 'consignment', consignor: 'Baobab Collection', fragile: true, sizes: { TU: 5 }, colors: ['ivoire', 'noir'] },
      { id: 'mz_baobab_aurum', name: 'Bougie Max 16 Aurum Platinum', price: 1250, art: 'bougie', kind: 'tu', format: 'piece', marque: 'Baobab Collection', motif: 'Aurum', ownership: 'consignment', consignor: 'Baobab Collection', fragile: true, sizes: { TU: 4 }, colors: ['dore', 'argent'] },
      { id: 'mz_diffuseur_oranger', name: 'Diffuseur Fleur d’Oranger Tanger', price: 480, art: 'diffuseur', kind: 'tu', format: 'piece', marque: 'Les Senteurs de Tanger', motif: 'Botanique', fragile: true, sizes: { TU: 9 }, colors: ['ambre', 'blanc'] },
    ] },
    { rayon: 'decoration', rayonLabel: 'Décoration & Cadeaux', items: [
      { id: 'mz_vase_majorelle', name: 'Vase céramique émaillée 35cm', price: 650, art: 'vase', kind: 'tu', format: 'piece', marque: 'Céramique Majorelle', motif: 'Zellige Vert', fragile: true, sizes: { TU: 4 }, colors: ['emeraude', 'bleu'] },
      { id: 'mz_plateau_martcle', name: 'Plateau laiton martelé main', price: 420, art: 'plateau', kind: 'tu', format: 'piece', marque: 'Artisanat Fès', motif: 'Sahara Or', fragile: false, sizes: { TU: 6 }, colors: ['dore', 'argent'] },
      { id: 'mz_miroir_soleil', name: 'Miroir soleil laiton 50cm', price: 890, art: 'miroir', kind: 'tu', format: 'piece', marque: 'Vogue Home', motif: 'Sahara Or', fragile: true, sizes: { TU: 3 }, colors: ['dore'] },
    ] }
  ];

  /* ───────────────── in-memory state + persistence ───────────────── */
  let db = null;               // { v, categories[], products[], variants[], seq }
  const subs = new Set();      // change listeners on this page

  function nextId(prefix) { db.seq = (db.seq || 0) + 1; return prefix + '_' + db.seq; }

  /* `removed` : les SUPPRESSIONS, nommées. Voir la note au-dessus de mergeDocs —
     sans cette carte, une absence ne se distingue pas d'une ignorance, et un
     article supprimé revient à chaque synchronisation. */
  function blank() { return { v: 1, categories: [], products: [], variants: [], seq: 0, removed: {}, moves: [] }; }

  /* ── le fichier satellite ───────────────────────────────────────────────────
   * Le journal du stock et les échanges avec le serveur vivent à part, dans
   * assets/boutique-catalog-parts.js, chargé AVANT ce fichier. Il ne fait que
   * déclarer des fabriques : on les appelle ici, chacune à l'endroit où son
   * code se trouvait, si bien que l'ordre de
   * démarrage et des écouteurs reste celui d'un seul fichier. `core` est tout ce
   * qu'ils voient d'ici : le document et le magasin actif, lus et écrits en
   * direct, et les quelques fonctions du noyau qu'ils appellent. */
  const PARTS = window.__kiwiBoutiqueCatalogParts || {};
  function part(name, file) {
    if (typeof PARTS[name] !== 'function') throw new Error('KiwiBoutiqueCatalog : ' + file + ' doit être chargé avant assets/boutique-catalog.js');
    return PARTS[name];
  }
  const core = {
    get db() { return db; },
    set db(next) { db = next; },
    get VENUE() { return VENUE; },
    DEMO_VENUE,
    load, persist, notify, dropIndex, migrate, commit, famOf, COLOR_BY_ID,
    varById: (id) => varById(id),
    catById: (id) => catById(id),
    variantsOf: (pid) => variantsOf(pid),
  };
  const ledger = part('ledger', 'assets/boutique-catalog-parts.js')(core);
  const { MOVE_MAX, now, materialize, journal, setAbsolute, move, compact, tomb, mergeDocs, touch, snap } = ledger;

  const well = part('well', 'assets/boutique-catalog-parts.js')();
  /* À qui appartient une copie de secours : le compte connecté et le magasin
     appairé, deux clés que le catalogue n'écrit pas (lisibles même quand le
     stockage refuse nos écritures) et qui changent quand l'appareil change de
     commerçant. */
  function wellOwner() {
    let acc = '', paired = '';
    try { acc = String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (e) {}
    try { paired = String((JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null') || {}).merchant || ''); } catch (e) {}
    return acc + '|' + paired;
  }
  let loadEpoch = 0, saveEpoch = 0;

  // Airtight backstop: the Maison Mansour demo cast is a LOCAL-pitch affordance
  // only. A real signed-in / hosted merchant or a paired till must never inherit
  // it — not even if the active venue key resolves to the demo store.
  function hostedOrPaired() {
    try {
      return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal())
        || (localStorage.getItem('kiwiPaired') === '1');
    } catch (e) { return false; }
  }
  function load() {
    if (db) return db;
    // Premier accès à ce magasin dans cette page : on va aussi chercher sa copie
    // serveur. Asynchrone — `load()` rend tout de suite ce que le navigateur a,
    // et la page se re-rend via notify() quand la copie arrive.
    setTimeout(cloudBind, 0);
    const key = KEY, epoch = ++loadEpoch;
    localKept = true;
    // La lecture précède toute écriture du document vide de démarrage.
    well.read(key).then(copy => {
      if (epoch !== loadEpoch || key !== KEY || !copy || !copy.doc) return;
      /* Une copie d'un autre locataire (autre compte, caisse ré-appairée : les
         identifiants transitoires comme « own » se réutilisent) n'est jamais
         fusionnée ; elle est effacée. */
      if (copy.owner !== wellOwner()) { well.save(key, null, () => {}); return; }
      db = mergeDocs(db, copy.doc);
      materialize(db); dropIndex(); migrate();
      persist(); notify(); schedulePush();
    }).catch(() => {});
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try { db = JSON.parse(raw); } catch (e) { db = null; }
    }
    if (!db || !db.products) {
      db = blank();
      dropIndex();
      if (DEMO_SEEDS[VENUE] && !hostedOrPaired()) seed();   // demo store pre-fills ONLY on the local pitch demo; a real/paired store starts empty
      // Ne jamais remplacer le secours par le vide avant sa lecture.
      persist(true);
    } else {
      /* Un document d'avant le journal n'a ni socle ni mouvements : on le
         normalise une fois, en place, pour qu'il cesse d'être ambigu. compact()
         replie au passage ce qui a vieilli. */
      const had = JSON.stringify(db.moves || []) + '|' + (db.variants || []).length;
      if (!Array.isArray(db.moves)) db.moves = [];
      compact(db); materialize(db);
      if (migrate() || had !== JSON.stringify(db.moves || []) + '|' + (db.variants || []).length) persist();
    }
    return db;
  }

  // Switch which store's catalogue is active. New venues load their own key
  // (seeded only for the demo store), and all surfaces re-render.
  function use(venueId) {
    const v = venueId || DEMO_VENUE;
    if (v === VENUE && db) return;
    VENUE = v;
    KEY = keyFor(VENUE);
    db = null;
    cloud.dirty = false;
    dropIndex();
    crossReset();  // « l'autre boutique » ne désigne plus les mêmes
    load();
    cloudBind();   // ce magasin-ci a sa propre copie serveur
    notify();
  }

  /* `localKept` : la dernière écriture locale a-t-elle pris ? Quota plein,
     navigation privée, stockage refusé : setItem lève, et avant ce drapeau
     l'exception était avalée pendant que tout le monde croyait le stock
     enregistré. La mémoire garde la modification, la remontée serveur part
     quand même (schedulePush ne lit que la mémoire) ; ce qui manque, c'est
     qu'un rechargement la perdrait. On le DIT : persist() rend vrai ou faux,
     durable() le lit, et l'événement « kiwi:local-save » prévient la surface
     à chaque échec, puis une fois au retour à la normale. */
  let localKept = true;
  function sayKept(ok) {
    const was = localKept;
    localKept = ok;
    if (ok && was) return;
    try {
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('kiwi:local-save', { detail: { store: 'catalog', key: KEY, durable: ok } }));
      }
    } catch (e) {}
  }
  function persist(startingEmpty) {
    let ok = false;
    try { localStorage.setItem(KEY, JSON.stringify(db)); ok = true; } catch (e) {}
    const key = KEY, epoch = ++saveEpoch, load = loadEpoch;
    sayKept(ok);
    if (!ok && !startingEmpty) well.save(key, db, kept => {
      if (key === KEY && epoch === saveEpoch && load === loadEpoch) sayKept(kept);
    }, wellOwner());
    else if (ok && !startingEmpty) well.save(key, null, () => {});
    return ok;
  }

  // Any mutation goes through here: persist + notify same-page subscribers, and
  // mirror the change up so the stock survives this browser (voir LE FILET plus
  // bas). L'écriture locale reste synchrone : la caisse ne doit jamais attendre
  // le réseau pour encaisser. Rend vrai si la copie locale a pris, faux si la
  // modification ne vit qu'en mémoire (et en route vers le serveur).
  function commit() {
    if (batchDepth > 0) { batchDirty = true; return localKept; }
    if (Array.isArray(db.moves) && db.moves.length > MOVE_MAX) { compact(db); materialize(db); }
    markCatalogDirty();      // une mutation locale : nous avons quelque chose à dire
    const ok = persist(); notify(); schedulePush();
    return ok;
  }

  /* ── batch() : un geste métier = une écriture ────────────────────────────────
   * Chaque mutation persiste TOUT le document (JSON.stringify + localStorage).
   * C'est le bon compromis pour un geste isolé, mais enregistrer un article de
   * reprise en enchaîne trois ou quatre — créer le produit, sa déclinaison,
   * rattacher le code, saisir la quantité — donc trois ou quatre sérialisations
   * complètes du catalogue pour UN scan. Sur un import de plusieurs milliers de
   * références, où le document dépasse les 400 Ko, c'est ce qui faisait décrocher
   * la saisie.
   *
   * batch() suspend l'écriture le temps du geste et n'écrit qu'une fois, à la
   * fin. Réentrant, et `finally` garantit que l'écriture a lieu même si le geste
   * échoue en cours de route — on ne perd jamais une modification déjà appliquée
   * en mémoire. */
  let batchDepth = 0, batchDirty = false;
  function batch(fn) {
    batchDepth++;
    try { return fn(); }
    finally {
      batchDepth--;
      if (batchDepth === 0 && batchDirty) {
        batchDirty = false;
        if (Array.isArray(db.moves) && db.moves.length > MOVE_MAX) { compact(db); materialize(db); }
        markCatalogDirty();
        persist(); notify(); schedulePush();
      }
    }
  }
  function notify() { subs.forEach((fn) => { try { fn(); } catch (e) {} }); }

  // Cross-tab: another tab wrote the catalog → reload + notify our listeners.
  window.addEventListener('storage', (e) => {
    if (e.key === DIRTY_KEY(VENUE)) { cloud.dirty = !!e.newValue; return; }
    if (e.key !== KEY) return;
    try { db = e.newValue ? JSON.parse(e.newValue) : blank(); } catch (err) { return; }
    dropIndex();
    migrate();   // the other tab may be an older build, or a cloud copy just landed
    notify();
  });

  /* LE FILET (la copie serveur), les réservations d'un encaissement et « et dans
     l'autre boutique ? » : assets/boutique-catalog-parts.js. */
  const { cloud, DIRTY_KEY, markCatalogDirty, schedulePush, pull, cloudBind,
    reserveSale, confirmSale, releaseSale, crossStock, crossReset } = part('sync', 'assets/boutique-catalog-parts.js')(core, ledger);

  /* ───────────────── seeding ───────────────── */
  function distribute(total, buckets) {
    // Spread `total` across `buckets` slots as evenly as possible (front-loaded).
    const out = new Array(buckets).fill(0);
    if (buckets <= 0) return out;
    const base = Math.floor(total / buckets), rem = total % buckets;
    for (let i = 0; i < buckets; i++) out[i] = base + (i < rem ? 1 : 0);
    return out;
  }

  function genEan() {
    if (window.KiwiBarcode && window.KiwiBarcode.nextInStoreEan) return window.KiwiBarcode.nextInStoreEan();
    return fallbackEan();
  }

  /* Repli dégradé, quand barcode.js (le compteur du magasin) n'est pas chargé.
   * L'ancien repli était « 20 » + les dix derniers chiffres de Date.now() + « 0 » :
   * deux appareils qui étiquetaient un article dans la même milliseconde
   * imprimaient le MÊME code, dans la plage du compteur, avec une clé de
   * contrôle le plus souvent fausse. Désormais :
   *   « 29 » (plage interne GS1 20-29, jamais celle du compteur « 20 »)
   *   + une étiquette de six chiffres tirée au hasard UNE fois par appareil et
   *     gardée (deux appareils diffèrent, à une chance sur un million près)
   *   + un compteur de quatre chiffres propre à l'appareil (amorcé sur l'heure)
   *   + la vraie clé EAN-13.
   * L'heure ne départage donc plus deux appareils : c'est leur étiquette. Et
   * generateBarcode() saute toujours un code déjà connu du catalogue. */
  const FALLBACK_TAG_KEY = 'kiwiBarcodeDevice';
  const FALLBACK_SEQ_KEY = 'kiwiBarcodeFallbackSeq';
  let fallbackMem = null;   // si le stockage est refusé : la session seule
  function randomDigits(n) {
    const out = [];
    const c = window.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    const buf = new Uint32Array(n);
    if (c && c.getRandomValues) c.getRandomValues(buf);
    else for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 4294967296);
    for (let i = 0; i < n; i++) out.push(String(buf[i] % 10));
    return out.join('');
  }
  function fallbackState() {
    let tag = null, seq = null;
    try { tag = localStorage.getItem(FALLBACK_TAG_KEY); seq = localStorage.getItem(FALLBACK_SEQ_KEY); } catch (_) {}
    if (!/^\d{6}$/.test(String(tag || ''))) tag = fallbackMem ? fallbackMem.tag : randomDigits(6);
    const n = parseInt(seq, 10);
    seq = Number.isFinite(n) ? n : (fallbackMem ? fallbackMem.seq : Date.now() % 10000);
    return { tag, seq };
  }
  function fallbackEan() {
    const st = fallbackState();
    const seq = (st.seq + 1) % 10000;
    fallbackMem = { tag: st.tag, seq };
    try { localStorage.setItem(FALLBACK_TAG_KEY, st.tag); localStorage.setItem(FALLBACK_SEQ_KEY, String(seq)); } catch (_) {}
    const body = '29' + st.tag + String(seq).padStart(4, '0');
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (+body[i]) * (i % 2 === 0 ? 1 : 3);
    return body + String((10 - (sum % 10)) % 10);
  }

  function seed() {
    const palette = ['atlas', 'warn', 'riad', 'mint', 'info', 'danger'];
    const currentSeed = (DEMO_SEEDS[VENUE] || DEMO_SEEDS[DEMO_VENUE])();
    currentSeed.forEach((rayon, ri) => {
      const cat = { id: nextId('cat'), name: rayon.rayonLabel, color: palette[ri % palette.length], order: ri, metaAt: now() };
      db.categories.push(cat);
      rayon.items.forEach((it) => {
        const prod = {
          id: nextId('prod'), legacyId: it.id, name: it.name, categoryId: cat.id,
          priceMAD: it.price, cost: Math.round(it.price * 0.55), art: it.art, kind: it.kind || 'tu',
          flag: it.flag || '', grad: null,
          marque: it.marque || '',
          format: (it.format === 'service' || it.format === 'piece') ? it.format : 'piece',
          servicePieces: it.servicePieces != null ? Math.max(1, parseInt(it.servicePieces, 10) || 1) : null,
          piecePriceMAD: it.piecePriceMAD != null ? (+it.piecePriceMAD || 0) : null,
          motif: it.motif || '',
          fragile: !!it.fragile,
          /* PROPRIÉTÉ DU STOCK. 'outright' = la marchandise est au commerce.
           * 'consignment' = dépôt-vente : elle appartient à un tiers (`consignor`),
           * le commerce la vend POUR LUI. La vente est enregistrée normalement —
           * ticket, journal, stock — mais l'argent ne lui appartient pas : il est
           * dû au déposant. Voir le journal dépôt-vente dans assets/pos-maison.js. */
          ownership: it.ownership === 'consignment' ? 'consignment' : 'outright',
          consignor: String(it.consignor || '').trim(),
          createdAt: Date.now(), archived: false, metaAt: now(),
        };
        db.products.push(prod);
        const sizeKeys = Object.keys(it.sizes);
        let firstVariant = null;
        sizeKeys.forEach((size) => {
          const split = distribute(it.sizes[size], it.colors.length);
          it.colors.forEach((colorId, ci) => {
            const v = mkVariant(prod.id, colorId, size, split[ci]);
            v.barcodes.push({ code: genEan(), type: 'ean13', primary: true });
            db.variants.push(v);
            if (!firstVariant) firstVariant = v;
          });
        });
        // Keep the product's legacy EAN resolving — attach to the first variant.
        if (firstVariant && it.ean) firstVariant.barcodes.push({ code: it.ean, type: 'imported', primary: false });
      });
    });
  }

  /* A variant's colour is stored as three things that must never be confused:
       colorId      — IDENTITY. Raw, exactly as created or imported. Two variants
                      that came in as "navy" and "blue" keep two different ids and
                      therefore stay two separate variants, with their own stock
                      and their own barcodes, until someone merges them on purpose.
       colorFamily  — DISPLAY. The general family both of those resolve to (bleu).
       colorSource  — MEMORY. The words originally used, kept when they differ.
     colorLabel / colorHex carry the FAMILY, because every surface already reads
     that pair to draw a swatch and name it. */
  function mkVariant(productId, colorId, size, stock, meta) {
    meta = meta || {};
    const n = normColor(colorId, meta.colorLabel, meta.colorHex);
    const v = {
      id: nextId('var'), productId,
      colorId: String(colorId || n.family.id),
      colorFamily: n.family.id,
      colorLabel: n.displayLabel, colorHex: n.displayHex,
      size: String(size), stock: Math.max(0, stock | 0),
      base: Math.max(0, stock | 0), baseAt: now(),
      sku: '', barcodes: [], barcodeRemoved: {}, metaAt: now(),
    };
    if (n.source) {
      v.colorSource = n.source;
      const legacy = LEGACY_SHADES[v.colorId];
      const srcHex = meta.colorHex || (legacy && legacy.hex) || '';
      if (srcHex) v.colorSourceHex = srcHex;
    }
    return v;
  }

  /* One-way, additive, idempotent. Existing catalogues were written before the
     palette was normalized: their variants carry a shade id and a shade label
     ("nuit" / "Bleu nuit") and no family. This teaches each one its family and
     remembers the original wording — it does NOT touch colorId, stock, sku or
     barcodes, so nothing merges, disappears or loses its scan. */
  function migrate() {
    if (!db || !Array.isArray(db.variants)) return false;
    let touched = 0;
    db.variants.forEach((v) => {
      if (v && v.colorFamily && COLOR_BY_ID(v.colorFamily)) return;
      const n = normColor(v.colorId, v.colorLabel, v.colorHex);
      if (n.source) {
        if (!v.colorSource) v.colorSource = n.source;
        if (!v.colorSourceHex && v.colorHex) v.colorSourceHex = v.colorHex;
      }
      v.colorFamily = n.family.id;
      v.colorLabel = n.displayLabel;
      v.colorHex = n.displayHex;
      touched++;
    });
    if (Array.isArray(db.moves)) {
      db.moves.forEach((m) => {
        if (m && m.actor && typeof m.actor !== 'string') { m.actor = String(m.actor).slice(0, 64); touched++; }
        if (m && m.ref && typeof m.ref !== 'string') { m.ref = String(m.ref).slice(0, 64); touched++; }
      });
    }
    if (touched) db.v = 2;
    return touched > 0;
  }

  /* The family a variant displays as, tolerant of a record written before the
     migration ran (a cloud copy that landed from an older build, say). */
  function famOf(v) {
    if (!v) return 'gris';
    if (v.colorFamily && COLOR_BY_ID(v.colorFamily)) return v.colorFamily;
    return normColor(v.colorId, v.colorSource || v.colorLabel, v.colorSourceHex || v.colorHex).family.id;
  }

  /* ───────────────── lookups / derived ───────────────── */
  const catById  = (id) => db.categories.find((c) => c.id === id) || null;

  /* ═══════════════ L'INDEX — chercher sans balayer tout le magasin ═══════════
   * Ces recherches se faisaient en refiltrant la table entière, à chaque appel.
   * Sans conséquence sur une vitrine de vingt articles ; ruineux dès qu'un
   * commerçant reprend son stock, parce que les appelants sont dans des BOUCLES :
   *   · compat() et stats() demandent les déclinaisons UNE FOIS PAR PRODUIT,
   *   · la liste d'inventaire du tableau de bord appelle getProduct() PAR LIGNE,
   *   · le filtre par couleur, lui, appelait getProduct() par produit filtré.
   * Le coût devenait produits × déclinaisons, et ces fonctions sont rejouées à
   * chaque écriture du catalogue. Mesuré : à 1 200 articles une reconstruction
   * coûtait 36 ms, et un article enregistré en déclenche plusieurs.
   *
   * L'index se reconstruit à la demande, en un passage, et sert ensuite en temps
   * constant. Il tient des RÉFÉRENCES : modifier un stock ou une taille ne
   * l'invalide donc pas — l'objet indexé est le même que l'objet modifié. Seuls
   * l'ajout, la suppression et le remplacement du document le périment, plus les
   * codes-barres, qui changent sans changer le nombre de déclinaisons : d'où
   * dropIndex() dans attachBarcode / removeBarcode / generateBarcode.
   * Le garde-fou `n` rattrape tout chemin d'ajout ou de retrait qu'on aurait
   * oublié d'annoncer. */
  let IX = null;
  function index() {
    if (IX && IX.n === db.variants.length) return IX;
    const byProduct = Object.create(null), byId = Object.create(null);
    const byCode = Object.create(null), byGtin = Object.create(null);
    const KB = window.KiwiBarcode;
    const gtin = KB && KB.gtinKey ? KB.gtinKey : null;
    for (const v of db.variants) {
      if (!v) continue;
      (byProduct[v.productId] || (byProduct[v.productId] = [])).push(v);
      byId[v.id] = v;
      const codes = v.barcodes || [];
      for (const b of codes) {
        if (!b || !b.code) continue;
        // Premier arrivé, premier servi : un doublon hérité d'une fusion ne doit
        // pas faire changer d'article un code déjà attribué.
        if (byCode[b.code] === undefined) byCode[b.code] = v;
        if (gtin) { const k = gtin(b.code); if (k && byGtin[k] === undefined) byGtin[k] = v; }
      }
    }
    const prod = Object.create(null);
    for (const p of db.products) { if (p && p.id) prod[p.id] = p; }
    IX = { n: db.variants.length, byProduct, byId, byCode, byGtin, prod };
    return IX;
  }
  function dropIndex() { IX = null; }

  /* Entretien À CHAUD. Tout jeter à chaque écriture aurait suffi à la
   * correction, mais aurait ramené le défaut par la porte de derrière : pendant
   * une reprise de stock, chaque article écrit puis relit, donc chaque article
   * aurait payé une reconstruction complète — à nouveau du produits × déclinaisons
   * sur la durée de l'import. Les trois ajouts du chemin chaud (produit,
   * déclinaison, code-barres) mettent donc l'index à jour en place, et l'index
   * reste valide d'un bout à l'autre de la session. Les suppressions, rares,
   * se contentent de le périmer. */
  function ixAddProduct(p) { if (IX && p && p.id) IX.prod[p.id] = p; }
  function ixAddVariant(v) {
    if (!IX || !v) return;
    (IX.byProduct[v.productId] || (IX.byProduct[v.productId] = [])).push(v);
    IX.byId[v.id] = v;
    IX.n = db.variants.length;          // rester en phase avec le garde-fou
  }
  function ixAddCode(v, code) {
    if (!IX || !v || !code) return;
    if (IX.byCode[code] === undefined) IX.byCode[code] = v;
    const KB = window.KiwiBarcode;
    if (KB && KB.gtinKey) { const k = KB.gtinKey(code); if (k && IX.byGtin[k] === undefined) IX.byGtin[k] = v; }
  }

  const prodById = (id) => index().prod[id] || null;
  const varById  = (id) => index().byId[id] || null;
  // Rend le tableau VIVANT de l'index : les appelants internes ne font que le
  // lire. Les sorties publiques (listVariants, getProduct) en donnent une copie,
  // pour qu'un appelant qui pousserait dedans ne corrompe pas l'index.
  const variantsOf = (pid) => index().byProduct[pid] || [];
  function groupVariants() { return index().byProduct; }

  function productStock(pid) { return variantsOf(pid).reduce((s, v) => s + (v.stock || 0), 0); }

  /* Stock vendable d'une déclinaison telle que la caisse la présente :
     produit × taille × FAMILLE de couleur. compat() additionne volontairement
     toutes les couleurs dans `sizes` pour les cartes produit ; cette somme ne
     doit jamais servir à autoriser une vente de Noir quand seules les pièces
     Blanches sont encore en rayon. Une couleur personnalisée reste appariée
     par son identifiant exact. */
  function variantStock(pid, size, color) {
    const wantedSize = String(size == null ? '' : size);
    const wantedColor = String(color == null ? '' : color);
    return variantsOf(pid).reduce((sum, v) => {
      if (String(v.size) !== wantedSize) return sum;
      if (String(v.colorId) !== wantedColor && String(famOf(v)) !== wantedColor) return sum;
      return sum + Math.max(0, +v.stock || 0);
    }, 0);
  }

  /* Mouvement atomique sur la même déclinaison vendable. Une vente peut vider
     plusieurs tons d'une même famille (Bleu + Bleu nuit), mais jamais une autre
     couleur. On vérifie le total AVANT la première écriture : insuffisant veut
     dire zéro mouvement, pas un stock à moitié décrémenté. Un retour dont la
     couleur n'existe plus est signalé à rapprocher, jamais crédité sur une autre. */
  function adjustVariantStock(pid, size, color, delta, opts) {
    opts = opts || {};
    if (!wholeQuantity(delta)) return false;
    delta = Number(delta);
    if (!delta) return true;
    const sameSize = variantsOf(pid).filter((v) => String(v.size) === String(size));
    const matched = sameSize.filter((v) => String(v.colorId) === String(color) || String(famOf(v)) === String(color));
    if (delta < 0) {
      let remaining = -delta;
      if (variantStock(pid, size, color) < remaining) return false;
      batch(() => matched
        .slice().sort((a, b) => (String(b.colorId) === String(color) ? 1 : 0) - (String(a.colorId) === String(color) ? 1 : 0))
        .forEach((v) => {
          if (!remaining) return;
          const qty = Math.min(remaining, Math.max(0, +v.stock || 0));
          if (qty) { adjustStock(v.id, -qty, opts.why || 'vente', { ref: opts.ref, actor: opts.actor }); remaining -= qty; }
        }));
      return remaining === 0;
    }
    const v = matched[0];
    if (!v) return false;
    adjustStock(v.id, delta, opts.why || 'retour',
      { ref: opts.ref, actor: opts.actor });
    return true;
  }

  function normCode(s) { return String(s == null ? '' : s).trim(); }

  /* La référence commune, mise à plat avant d'être comparée. Elle est SAISIE À
   * LA MAIN dans deux magasins différents, souvent par deux personnes : « JEAN
   * 501 », « jean-501 » et « Jean501 » sont la même intention et doivent se
   * rapprocher. On replie donc la casse, les accents et tout ce qui n'est ni
   * lettre ni chiffre — ce qui reste est la clé.
   * La forme SAISIE est conservée telle quelle sur la fiche (c'est celle que le
   * propriétaire relit) ; seule la comparaison passe par ici. */
  function skuNorm(s) { return String(s == null ? '' : s).trim().slice(0, 48); }
  function skuKey(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* Qui porte ce code ? En deux temps, et l'ordre compte.
   *
   *  1. Correspondance EXACTE, toujours en premier. Ce que l'employé a scanné est
   *     ce qu'on cherche, caractère pour caractère — zéros de tête compris.
   *  2. À défaut, équivalence GTIN (assets/barcode.js · gtinKey). Une même
   *     étiquette UPC-A est rendue « 036000291452 » par une douchette et
   *     « 0036000291452 » par la suivante ; un EAN-8 arrive parfois complété à 13.
   *     GS1 pondère la clé de contrôle depuis la DROITE : ces chaînes désignent
   *     réellement le même article. Sans ce repli, une boutique enregistre un code
   *     avec sa douchette puis ne retrouve plus rien depuis un second appareil.
   *     Réservé aux codes dont la clé de contrôle est valide — une référence
   *     interne « 0012 » reste opaque et n'est jamais confondue avec « 12 ». */
  function barcodeOwner(code) {
    const c = normCode(code);
    if (!c) return null;
    const ix = index();
    const exact = ix.byCode[c];
    if (exact) return exact;
    const KB = window.KiwiBarcode;
    if (!KB || !KB.gtinKey) return null;
    const key = KB.gtinKey(c);
    if (!key) return null;
    return ix.byGtin[key] || null;
  }

  function findByBarcode(code) {
    const v = barcodeOwner(code);
    if (!v) return null;
    return { variant: v, product: prodById(v.productId) };
  }

  function primaryBarcode(v) {
    if (!v || !v.barcodes || !v.barcodes.length) return null;
    return (v.barcodes.find((b) => b.primary) || v.barcodes[0]).code;
  }

  /* ───────────────── categories ───────────────── */
  function listCategories() { return db.categories.slice().sort((a, b) => (a.order || 0) - (b.order || 0)); }

  function addCategory(name, color) {
    const cat = { id: nextId('cat'), name: String(name || 'Catégorie').trim() || 'Catégorie', color: color || 'atlas', order: db.categories.length, metaAt: now() };
    db.categories.push(cat); commit(); return cat;
  }
  function renameCategory(id, name) { const c = catById(id); if (c) { const b = snap(c); c.name = String(name || c.name).trim() || c.name; touch('categories', c, b); commit(); } return c; }
  function setCategoryColor(id, color) { const c = catById(id); if (c) { const b = snap(c); c.color = color; touch('categories', c, b); commit(); } return c; }
  function deleteCategory(id, opts) {
    opts = opts || {};
    const reassignTo = opts.reassignTo || null; // null → uncategorised
    db.products.forEach((p) => { if (p.categoryId === id) { const b = snap(p); p.categoryId = reassignTo; touch('products', p, b); } });
    db.categories = db.categories.filter((c) => c.id !== id);
    tomb(id);
    commit();
  }
  function categoryCount(id) { return db.products.filter((p) => p.categoryId === id && !p.archived).length; }

  /* ───────────────── products ───────────────── */
  function listProducts(opts) {
    opts = opts || {};
    let list = db.products.filter((p) => opts.includeArchived ? true : !p.archived);
    if (opts.categoryId && opts.categoryId !== 'all') list = list.filter((p) => p.categoryId === opts.categoryId);
    if (opts.marque && opts.marque !== 'all') {
      const m = opts.marque.toLowerCase();
      list = list.filter((p) => (p.marque || '').toLowerCase() === m);
    }
    if (opts.motif && opts.motif !== 'all') {
      const mot = opts.motif.toLowerCase();
      list = list.filter((p) => (p.motif || '').toLowerCase() === mot);
    }
    if (opts.format && opts.format !== 'all') list = list.filter((p) => (p.format || 'piece') === opts.format);
    if (opts.fragile !== undefined) list = list.filter((p) => !!p.fragile === !!opts.fragile);
    if (opts.q) {
      const q = opts.q.toLowerCase();
      const byProd = groupVariants();   // une fois, pas une fois par produit
      list = list.filter((p) => p.name.toLowerCase().includes(q)
        || (p.marque && p.marque.toLowerCase().includes(q))
        || (p.motif && p.motif.toLowerCase().includes(q))
        || (catById(p.categoryId) && catById(p.categoryId).name.toLowerCase().includes(q))
        || (byProd[p.id] || []).some((v) => (v.barcodes || []).some((b) => String(b.code).toLowerCase().includes(q)) || (v.sku || '').toLowerCase().includes(q)));
    }
    return list;
  }

  function addProduct(data) {
    data = data || {};
    const p = {
      id: nextId('prod'), name: String(data.name || 'Nouvel article').trim() || 'Nouvel article',
      categoryId: data.categoryId || null, priceMAD: +data.priceMAD || 0, cost: +data.cost || 0,
      art: data.art || '', artPicked: !!data.artPicked, kind: data.kind || 'taille', flag: data.flag || '', grad: data.grad || null,
      marque: String(data.marque || '').trim(),
      format: (data.format === 'service' || data.format === 'piece') ? data.format : 'piece',
      servicePieces: data.servicePieces != null ? Math.max(1, parseInt(data.servicePieces, 10) || 1) : null,
      piecePriceMAD: data.piecePriceMAD != null ? (+data.piecePriceMAD || 0) : null,
      motif: String(data.motif || '').trim(),
      fragile: !!data.fragile,
      /* Voir le commentaire dans seed() : 'consignment' = dépôt-vente, la
       * marchandise est au déposant nommé par `consignor`. Toute autre valeur
       * retombe sur 'outright' — on ne devine pas une propriété tierce. */
      ownership: data.ownership === 'consignment' ? 'consignment' : 'outright',
      consignor: String(data.consignor || '').trim(),
      supplierId: String(data.supplierId || '').trim().slice(0, 80),
      parLevel: data.parLevel == null ? 0 : Math.max(0, +data.parLevel || 0),
      reorderLevel: data.reorderLevel == null ? 0 : Math.max(0, +data.reorderLevel || 0),
      /* La RÉFÉRENCE COMMUNE — ce qui dit que le jean de Casa et le jean de
       * Rabat sont le même article. Deux magasins d'un même compte tiennent
       * deux catalogues séparés : rien ne les relie sauf le code-barres, et un
       * code-barres imprimé par Kiwi (préfixe 20) ne vaut que dans le magasin
       * qui l'a imprimé. Le propriétaire pose cette référence UNE fois depuis le
       * tableau de bord et les deux fiches se reconnaissent.
       * Vide par défaut : elle ne sert qu'aux comptes multi-magasins, et
       * l'inventer à la place du commerçant ferait de faux rapprochements. */
      sku: skuNorm(data.sku),
      // `photo` / `video` are URLs (uploaded to R2 via KiwiOrderPro.uploadMedia),
      // never bytes — the catalogue lives in localStorage and base64 would eat it.
      // One medium per product: a video supersedes a photo and vice-versa.
      photo: String(data.photo || ''),
      video: String(data.video || ''),
      mediaAt: +data.mediaAt || ((data.photo || data.video) ? now() : 0),
      createdAt: Date.now(), archived: false, metaAt: now(),
    };
    db.products.push(p); ixAddProduct(p); commit(); return p;
  }
  function updateProduct(id, patch) {
    const p = prodById(id); if (!p) return null;
    const before = snap(p);
    const mediaPatch = patch.photo !== undefined || patch.video !== undefined;
    ['name', 'categoryId', 'priceMAD', 'cost', 'art', 'artPicked', 'kind', 'flag', 'grad', 'photo', 'video', 'sku',
     'marque', 'format', 'servicePieces', 'piecePriceMAD', 'motif', 'fragile', 'ownership', 'consignor',
     'supplierId', 'parLevel', 'reorderLevel'].forEach((k) => {
      if (patch[k] !== undefined) {
        if (k === 'priceMAD' || k === 'cost' || k === 'piecePriceMAD' || k === 'parLevel' || k === 'reorderLevel') {
          p[k] = patch[k] == null ? null : (+patch[k] || 0);
        } else if (k === 'servicePieces') {
          p[k] = patch[k] == null ? null : Math.max(1, parseInt(patch[k], 10) || 1);
        } else if (k === 'fragile' || k === 'artPicked') {
          p[k] = !!patch[k];
        } else if (k === 'sku') {
          p[k] = skuNorm(patch[k]);
        } else if (k === 'format') {
          p[k] = (patch[k] === 'service' || patch[k] === 'piece') ? patch[k] : 'piece';
        } else {
          p[k] = patch[k] == null ? '' : String(patch[k]).trim();
        }
      }
    });
    if (mediaPatch) p.mediaAt = now();
    touch('products', p, before);
    commit(); return p;
  }
  function archiveProduct(id, val) { const p = prodById(id); if (p) { const b = snap(p); p.archived = val !== false; touch('products', p, b); commit(); } return p; }
  function deleteProduct(id) {
    /* Les déclinaisons AUSSI, nommément. Le nettoyage par parent absent existe
       plus bas dans mergeDocs, mais il ne peut agir que si le produit reste
       supprimé — et une déclinaison non marquée revient avec son stock, ce qui
       remettrait l'article en vente sous un produit fantôme. */
    const vids = db.variants.filter((v) => v.productId === id).map((v) => v.id);
    tomb(vids.concat([id]));
    if (Array.isArray(db.moves)) db.moves = db.moves.filter((m) => !m || vids.indexOf(m.vid) < 0);
    db.variants = db.variants.filter((v) => v.productId !== id);
    db.products = db.products.filter((p) => p.id !== id);
    dropIndex();
    commit();
  }

  /* full product view for editors: product + variants + matrix helpers.
     `colors` is what the merchant actually chose: preset shades collapse to
     their broad family, but an exact custom hex keeps its own swatch. `families`
     remains the distinct broad set used by filters and reports. */
  function getProduct(id) {
    const p = prodById(id); if (!p) return null;
    const variants = variantsOf(id);
    const colors = []; const families = []; const sizes = [];
    variants.forEach((v) => {
      if (!sizes.includes(v.size)) sizes.push(v.size);
      // La couleur neutre d'un produit créé taille par taille n'est pas une
      // couleur : ni pastille, ni filtre (boutique-sizes.js).
      if (String(v.colorId) === 'unique') return;
      const f = famOf(v);
      if (!families.includes(f)) families.push(f);
      const custom = /^custom-[0-9a-f]{6}$/i.test(String(v.colorId || ''));
      const colorId = custom ? v.colorId : f;
      if (!colors.some((c) => c.id === colorId)) {
        const shown = custom
          ? { id: v.colorId, label: v.colorLabel, hex: v.colorHex, custom: true }
          : (COLOR_BY_ID(f) || { id: f, label: v.colorLabel, hex: v.colorHex });
        colors.push({ id: shown.id, label: shown.label, hex: shown.hex, custom: !!shown.custom });
      }
    });
    return {
      // copie : `variants` vient de l'index, et cet objet sort du module.
      product: p, category: catById(p.categoryId), variants: variants.slice(), colors, sizes, families,
      // le stock se somme sur le tableau qu'on vient de parcourir, pas en
      // redemandant les déclinaisons (getProduct est appelé PAR LIGNE de liste).
      stock: variants.reduce((s, v) => s + (v.stock || 0), 0),
    };
  }

  /* ───────────────── variants ───────────────── */
  function addVariant(data) {
    data = data || {};
    if (!wholeQuantity(data.stock ?? 0)) return null;
    if (!prodById(data.productId)) return null;
    // De-dupe on the RAW colour id, never on the family: a store that already has
    // a "navy" variant must still be able to keep a distinct "blue" one, with its
    // own stock and its own barcode. Merging them is a deliberate act, not a
    // side effect of picking the same swatch.
    const dup = db.variants.find((v) => v.productId === data.productId && v.colorId === data.colorId && v.size === String(data.size));
    if (dup) { if (data.stock != null) { setAbsolute(dup, data.stock); commit(); } return dup; }
    const v = mkVariant(data.productId, data.colorId, data.size, data.stock || 0, {
      colorLabel: data.colorLabel, colorHex: data.colorHex,
    });
    if (data.note) v.note = String(data.note).slice(0, 60);
    db.variants.push(v); ixAddVariant(v);
    /* Une déclinaison créée AVEC du stock fait apparaître de la marchandise. Le
       registre l'apprend comme stock initial, sinon le premier état du magasin
       serait le seul à n'avoir aucune origine. */
    if (v.stock > 0) journal({ id: 'ini-' + v.id, variant: v, at: v.baseAt, delta: v.stock, before: 0, after: v.stock, why: 'initial' });
    commit(); return v;
  }
  function updateVariant(id, patch) {
    if (patch.stock != null && !wholeQuantity(patch.stock)) return null;
    const v = varById(id); if (!v) return null;
    const before = snap(v);
    if (patch.stock != null) setAbsolute(v, patch.stock);   // un champ de formulaire est un état, pas un delta
    if (patch.size != null) v.size = String(patch.size);
    if (patch.sku != null) v.sku = String(patch.sku);
    if (patch.note != null) v.note = String(patch.note).slice(0, 60);
    if (patch.colorId) {
      // Re-colouring is an authorized, deliberate edit: the new choice becomes
      // the whole truth on screen. The value it came in as is filed once under
      // `colorWas` (imports, historical records) instead of trailing the variant
      // around as a subtitle that no longer describes it.
      const n = normColor(patch.colorId, patch.colorLabel, patch.colorHex);
      const had = v.colorSource || '';
      if (had && !v.colorWas) v.colorWas = had;
      v.colorId = String(patch.colorId);
      v.colorFamily = n.family.id;
      v.colorLabel = n.displayLabel;
      v.colorHex = n.displayHex;
      v.colorSource = n.source;
      if (n.source && (patch.colorHex || v.colorSourceHex)) v.colorSourceHex = patch.colorHex || v.colorSourceHex;
      else delete v.colorSourceHex;
      if (!n.source) delete v.colorSource;
    }
    if (patch.size != null || patch.sku != null || patch.note != null || patch.colorId) touch('variants', v, before);
    commit(); return v;
  }
  /* Un nom de couleur personnalisee appartient a la couleur, pas a une taille.
     Le meme `custom-rrggbb` peut etre porte par S, M, L et par plusieurs
     produits : les renommer ensemble evite le catalogue contradictoire vu en
     rayon, sans toucher a l'identite, au stock ni aux codes-barres. */
  function renameColor(colorId, label) {
    const id = String(colorId || '');
    const clean = String(label || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!/^custom-[0-9a-f]{6}$/i.test(id) || !clean) return 0;
    let matched = 0, changed = 0;
    db.variants.forEach((v) => {
      if (!v || String(v.colorId) !== id) return;
      matched++;
      if (v.colorLabel === clean && v.colorSource === clean) return;
      const b = snap(v);
      v.colorLabel = clean;
      v.colorSource = clean;
      touch('variants', v, b);
      changed++;
    });
    if (changed) commit();
    return matched;
  }
  /* TOUT changement de quantité passe par ici et s'horodate. C'est cet
     horodatage, et lui seul, qui permet à la fusion de savoir lequel des deux
     appareils a le compte le plus récent (voir mergeDocs). Une écriture de
     stock qui oublie de le poser est une vente que le stock finira par oublier. */
  /* setStock AFFIRME un état (saisie directe, inventaire physique) : il repose le
     socle. adjustStock RACONTE un événement (vente, retour, ±1 au comptoir) : il
     écrit un mouvement, et c'est ce qui permet à deux ventes simultanées de
     s'additionner au lieu de s'écraser. La distinction n'est pas cosmétique —
     c'est toute la différence entre « il y en a 8 » et « il en est parti 2 ». */
  const wholeQuantity = PARTS.wholeQuantity;
  function setStock(id, n, why) { if (!wholeQuantity(n)) return null; const v = varById(id); if (v) { setAbsolute(v, n, why); commit(); } return v; }
  function adjustStock(id, d, why, extra) { if (!wholeQuantity(d)) return null; const v = varById(id); if (v) { move(v, d, why || 'ajust', extra); commit(); } return v; }
  function deleteVariant(id) {
    db.variants = db.variants.filter((v) => v.id !== id);
    if (Array.isArray(db.moves)) db.moves = db.moves.filter((m) => !m || m.vid !== id);
    tomb(id); dropIndex(); commit();
  }

  /* ─────────── les trois gestes d'inventaire, jamais confondus ───────────
   * Une reprise de stock existant se fait à la douchette, vite, et trois gestes
   * très différents s'y ressemblent à l'écran. Les mélanger, c'est écraser un
   * comptage juste :
   *   · CRÉER un produit au catalogue      → addProduct()
   *   · AJOUTER une déclinaison manquante  → ensureVariant()  (n'écrase aucun stock)
   *   · RECEVOIR de la marchandise         → receiveStock()   (ajoute, n'écrase pas)
   * addVariant() reste tel quel — le dashboard l'appelle — mais il POSE le stock
   * quand la déclinaison existe déjà, ce qui, sur un scan répété, transformerait
   * « j'en reçois 3 » en « il y en a 3 ». D'où ces deux entrées explicites. */
  function findVariant(productId, colorId, size) {
    return db.variants.find((v) => v.productId === productId && v.colorId === colorId && v.size === String(size)) || null;
  }

  // Rend la déclinaison, en la créant si besoin. `created` dit lequel des deux
  // s'est produit, pour que la caisse annonce « déclinaison ajoutée » ou
  // « déclinaison déjà présente » au lieu de mentir dans les deux sens.
  function ensureVariant(data) {
    data = data || {};
    if (!wholeQuantity(data.stock ?? 0)) return { variant: null, created: false, reason: 'quantite' };
    if (!prodById(data.productId)) return { variant: null, created: false, reason: 'produit-introuvable' };
    // Même dédoublonnage que addVariant : sur l'id de couleur BRUT, jamais sur la
    // famille — deux nuances distinctes gardent chacune son stock et son code.
    const found = findVariant(data.productId, data.colorId, data.size);
    if (found) return { variant: found, created: false };
    // La couleur passe par `meta`, comme dans addVariant : c'est mkVariant qui
    // range famille / nuance d'origine (normColor). Écrire colorLabel et colorHex
    // après coup écraserait la famille normalisée par la nuance brute.
    const v = mkVariant(data.productId, data.colorId, data.size, data.stock || 0, {
      colorLabel: data.colorLabel, colorHex: data.colorHex,
    });
    if (data.note) v.note = String(data.note).slice(0, 60);
    db.variants.push(v); ixAddVariant(v);
    if (v.stock > 0) journal({ id: 'ini-' + v.id, variant: v, at: v.baseAt, delta: v.stock, before: 0, after: v.stock, why: 'initial' });
    commit();
    return { variant: v, created: true };
  }

  // Réception de marchandise : n × la même référence, sans scanner chaque pièce.
  function receiveStock(variantId, qty) {
    const v = varById(variantId);
    if (!v) return { ok: false, reason: 'variant-introuvable' };
    if (!wholeQuantity(qty)) return { ok: false, reason: 'quantite' };
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: 'quantite' };
    const before = v.stock || 0;
    move(v, n, 'reception');   // une réception est un événement : elle s'additionne
    commit();
    return { ok: true, added: n, before, stock: v.stock };
  }

  /* ─────────── les déclinaisons qui attendent encore leur code-barres ───────────
   * Le pont entre les deux moitiés d'une reprise de stock. Le fichier du
   * fournisseur s'importe là où il se trouve — sur l'ordinateur, au tableau de
   * bord — et fait entrer les noms, les prix et les coûts, mais aucun code : un
   * tarif Excel n'en porte pas. La douchette, elle, est à la caisse.
   *
   * Ces déclinaisons-là sont donc exactement le travail qui reste : l'employé
   * parcourt le magasin, scanne un article, et Kiwi le rattache à sa fiche déjà
   * remplie au lieu de la lui faire retaper. `q` filtre par nom de produit pour
   * que la liste reste utilisable sur un catalogue de plusieurs milliers de
   * références. */
  function listCodeless(opts) {
    opts = opts || {};
    const q = String(opts.q || '').trim().toLowerCase();
    const byProd = index().byProduct;
    const out = [];
    for (const p of db.products) {
      if (!p || p.archived) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      const vs = byProd[p.id] || [];
      const bare = vs.filter((v) => !(v.barcodes && v.barcodes.length));
      if (!bare.length) continue;
      out.push({ product: p, variants: bare, total: vs.length });
      if (opts.limit && out.length >= opts.limit) break;
    }
    return out;
  }
  function countCodeless() {
    const byProd = index().byProduct;
    let n = 0;
    for (const p of db.products) {
      if (!p || p.archived) continue;
      for (const v of (byProd[p.id] || [])) if (!(v.barcodes && v.barcodes.length)) n++;
    }
    return n;
  }

  /* Les informations COMMUNES d'un produit, pour enchaîner ses déclinaisons.
   * Un fournisseur qui code chaque taille séparément (Jean noir · S = code A,
   * M = code B, bleu M = code C) ne doit pas faire ressaisir le nom, la
   * catégorie, le prix et le coût à chaque scan. */
  function productTemplate(productId) {
    const p = prodById(productId); if (!p) return null;
    return {
      productId: p.id, name: p.name, categoryId: p.categoryId, priceMAD: p.priceMAD,
      cost: p.cost, kind: p.kind, art: p.art, artPicked: !!p.artPicked, flag: p.flag, sku: p.sku || '',
    };
  }

  /* ───────────────── barcodes ───────────────── */
  function generateBarcode(variantId) {
    const v = varById(variantId); if (!v) return null;
    if (v.barcodes.some((b) => b.primary)) return primaryBarcode(v); // already has one
    let code; let guard = 0;
    do { code = genEan(); } while (barcodeOwner(code) && guard++ < 50);
    v.barcodes.push({ code, type: 'ean13', primary: true, at: now() });
    touch('variants', v, snap(v));
    ixAddCode(v, code);
    commit(); return code;
  }

  /* Register an EXISTING barcode (supplier / manufacturer / old POS) VERBATIM onto
   * a variant — never reprinted, never renumbered. This is the spine of onboarding
   * a shop whose stock is already labelled.
   *
   * `type` stays 'imported' (the two surfaces render that badge), and the detected
   * symbology is recorded separately as `sym` — it used to be computed and then
   * thrown away by a ternary whose branches were identical, so an EAN-8 and a
   * Code 128 reference were indistinguishable once stored.
   *
   * Refuses a code already carried by ANOTHER variant, returning its owner so the
   * till can show what it is: one barcode must never point at two unrelated
   * articles in the same établissement. */
  function attachBarcode(variantId, raw, opts) {
    opts = opts || {};
    const v = varById(variantId); if (!v) return { ok: false, reason: 'variant-introuvable' };
    const KB = window.KiwiBarcode;
    const code = normCode(raw);
    if (!code) return { ok: false, reason: 'vide' };
    // Garde-fou de lisibilité : une rafale tronquée ne devient pas une référence.
    if (KB && KB.validate) {
      const val = KB.validate(code);
      if (!val.ok) return { ok: false, reason: val.reason };
    }
    /* Un code réellement porté par l'article l'emporte sur celui que Kiwi a
       fabriqué (`type: 'ean13'`, écrit par generateBarcode) : c'est lui que la
       ligne affiche et que l'étiquette imprime. Il se rangeait en alias caché
       derrière le généré, et le commerçant croyait n'avoir rien enregistré.
       Le généré reste rattaché, en second : une étiquette déjà collée scanne
       encore. Un code existant ne détrône jamais un autre code existant.
       Les deux entrées prennent un `at` neuf — la fusion entre appareils garde,
       code par code, l'entrée la plus récente ; sans cela une copie périmée de
       la caisse ressusciterait le généré comme référence. */
    const outrankGenerated = (entry) => {
      if (!entry || entry.primary || entry.type === 'ean13') return false;
      const cur = v.barcodes.find((b) => b.primary);
      if (!cur || cur.type !== 'ean13') return false;
      const t = now();
      cur.primary = false; cur.at = t;
      entry.primary = true; entry.at = t;
      return true;
    };
    const owner = barcodeOwner(code);
    if (owner && owner.id === v.id) {
      // Fiche enregistrée avant ce correctif : ressaisir le code le remet en tête.
      if (outrankGenerated(v.barcodes.find((b) => b.code === code))) { touch('variants', v, snap(v)); commit(); }
      return { ok: true, code, already: true };
    }
    if (owner) return { ok: false, reason: 'doublon', owner: { variant: owner, product: prodById(owner.productId) } };
    const sym = opts.sym || (KB && KB.detect ? KB.detect(code) : '');
    const isPrimary = !v.barcodes.some((b) => b.primary);
    const entry = { code, type: opts.type || 'imported', sym, primary: isPrimary, at: now() };
    v.barcodes.push(entry);
    outrankGenerated(entry);
    if (v.barcodeRemoved) delete v.barcodeRemoved[code];
    touch('variants', v, snap(v));
    ixAddCode(v, code);
    commit(); return { ok: true, code, sym };
  }
  function removeBarcode(variantId, code) {
    const v = varById(variantId); if (!v) return;
    const c = normCode(code); const wasPrimary = v.barcodes.some((b) => b.code === c && b.primary);
    v.barcodes = v.barcodes.filter((b) => b.code !== c);
    if (wasPrimary && v.barcodes.length) v.barcodes[0].primary = true;
    if (!v.barcodeRemoved) v.barcodeRemoved = {};
    v.barcodeRemoved[c] = now();
    touch('variants', v, snap(v));
    dropIndex();
    commit();
  }
  function barcodeExists(code) { return !!barcodeOwner(code); }

  /* ───────────────── stats / caisse compat ───────────────── */
  function stats() {
    const products = db.products.filter((p) => !p.archived);
    /* Deux bases, jamais confondues :
       - stockCost  : ce que la marchandise a COÛTÉ. C'est le chiffre d'une compta,
                      d'une assurance ou d'un besoin en fonds de roulement.
       - stockValue : ce qu'elle rapporterait vendue au prix affiché (potentiel).
       « Valeur de stock » affichait le potentiel : 9 pièces achetées 1 800 MAD
       étaient présentées à 4 050 MAD, soit 2,25× de trop. Repli sur le prix de
       vente quand aucun coût n'est saisi — mieux vaut trop haut que zéro, et
       `costed` dit au rendu s'il peut se fier à la base coût. */
    let totalStock = 0, stockValue = 0, stockCost = 0, stockCostKnown = 0, ruptures = 0, low = 0, costed = 0;
    const byProd = groupVariants();
    products.forEach((p) => {
      const s = (byProd[p.id] || []).reduce((acc, v) => acc + (v.stock || 0), 0);
      const price = p.priceMAD || 0;
      const cost = +p.cost || 0;
      totalStock += s;
      stockValue += s * price;
      stockCost += s * (cost > 0 ? cost : price);
      /* stockCostKnown : seulement les produits dont le coût est saisi. stockCost
         (repli prix) reste tel quel pour les caisses ; le dashboard, lui, ne mélange
         pas coût réel et prix de vente sous un seul libellé. */
      if (cost > 0) { costed++; stockCostKnown += s * cost; }
      if (s === 0) ruptures++; else if (s <= 5) low++;
    });
    return { products: products.length, variants: db.variants.length, totalStock, stockValue, stockCost, stockCostKnown, costed, ruptures, low, categories: db.categories.length };
  }

  // Reconstruct the caisse's { RAYONS, P, BY_EAN } shape from the DB so
  // pos-boutique.js keeps its existing helpers/render with a one-line data swap.
  function compat() {
    const P = {}, BY_EAN = {};
    const cats = listCategories();
    const RAYONS = cats.map((c) => ({ id: c.id, label: c.name, items: [] }));
    const rayonById = Object.fromEntries(RAYONS.map((r) => [r.id, r]));
    // an "uncategorised" bucket for products with no category
    let uncat = null;
    const byProd = groupVariants();
    db.products.filter((p) => !p.archived).forEach((p) => {
      const vs = byProd[p.id] || [];
      const sizes = {}; const colorSet = [];
      // The till offers FAMILIES, one swatch per colour a person would name —
      // never one per stored shade. Two variants that both read Bleu present a
      // single Bleu swatch here; which of them the sale draws down is decided in
      // pos-boutique.js persistStock(), preferring an exact id then stock on hand.
      vs.forEach((v) => {
        sizes[v.size] = (sizes[v.size] || 0) + (v.stock || 0);
        /* « unique » (boutique-sizes.js) passe tel quel : la caisse le tait, alors
           que sa famille de repli (« gris ») s'écrirait sur le ticket. */
        const f = (/^custom-[0-9a-f]{6}$/i.test(String(v.colorId || '')) || String(v.colorId) === 'unique') ? v.colorId : famOf(v);
        if (!colorSet.includes(f)) colorSet.push(f);
        (v.barcodes || []).forEach((b) => { BY_EAN[b.code] = p.id; });
      });
      const primaryV = vs.find((v) => v.barcodes && v.barcodes.length) || vs[0];
      const item = {
        id: p.id, name: p.name, price: p.priceMAD, art: p.art, artPicked: !!p.artPicked, photo: p.photo || '', video: p.video || '', kind: p.kind, flag: p.flag, sku: p.sku || '',
        marque: p.marque || '',
        format: p.format || 'piece',
        servicePieces: p.servicePieces || null,
        piecePriceMAD: p.piecePriceMAD || null,
        motif: p.motif || '',
        fragile: !!p.fragile,
        ownership: p.ownership === 'consignment' ? 'consignment' : 'outright',
        consignor: p.consignor || '',
        ean: primaryV ? primaryBarcode(primaryV) : '', sizes, colors: colorSet.length ? colorSet : ['gris'],
        rayon: p.categoryId, _variants: vs,
        /* Deux champs que la vente ne dessine pas mais dont les PROMOTIONS ont
           besoin (assets/promos.js) : `createdAt` porte la cible « tout ce qui
           est entré avant telle date » — un déstockage vise l'ancienneté, pas
           le rayon — et `cost` sert à prévenir le commerçant quand une remise
           ferait passer un article sous son prix d'achat. Sans eux, la règle
           « avant » ne viserait rien et l'alerte à perte serait muette. */
        createdAt: p.createdAt || 0, cost: p.cost || 0,
      };
      P[p.id] = item;
      // Alias the seed's legacy id (e.g. 'caftan_ete') so the caisse's demo
      // sales-history / exchange data keeps resolving after the DB migration.
      if (p.legacyId && !P[p.legacyId]) P[p.legacyId] = item;
      let bucket = rayonById[p.categoryId];
      if (!bucket) { if (!uncat) { uncat = { id: '_uncat', label: 'Divers', items: [] }; RAYONS.push(uncat); } bucket = uncat; }
      /* Le rayon « Divers » (id '_uncat') est un seau fabriqué ici : item.rayon garde
         l'id de catégorie d'origine (vide ou orphelin) pour ne pas changer ce que la
         vente enregistre. `uncat` dit au moteur de promotions que l'article y vit,
         sinon une promo « Divers » ne visait aucun article. */
      if (bucket === uncat) item.uncat = true;
      bucket.items.push(item);
    });
    return { RAYONS: RAYONS.filter((r) => r.items.length), P, BY_EAN };
  }

  /* Given a scanned barcode, resolve the exact variant.
     `colorId` is the variant's raw identity (what actually left the shelf);
     `colorFamily` is what the till highlights, since the sheet offers families. */
  function resolveScan(code) {
    const hit = findByBarcode(code);
    if (!hit) return null;
    return {
      pid: hit.product.id, size: hit.variant.size,
      colorId: hit.variant.colorId, colorFamily: famOf(hit.variant),
      variant: hit.variant, product: hit.product,
    };
  }

  /* L'export CSV : assets/boutique-catalog-parts.js. */
  const { exportCsv } = part('csv', 'assets/boutique-catalog-parts.js')(core);
  /* Les fabriques ont servi : la page ne garde que window.KiwiBoutiqueCatalog,
     exactement comme quand tout tenait dans ce fichier. */
  try { delete window.__kiwiBoutiqueCatalogParts; } catch (e) {}

  function reset() { db = blank(); seed(); commit(); }

  /* ───────────────── public API ───────────────── */
  window.KiwiBoutiqueCatalog = {
    // lifecycle
    load, reset, use, currentVenue: () => VENUE, demoVenue: DEMO_VENUE,
    batch: (fn) => (load(), batch(fn)),   // un geste métier = une seule écriture
    subscribe(fn) { load(); subs.add(fn); return () => subs.delete(fn); },
    /* Faux tant que la dernière écriture n'a pas pris sur cet appareil : un
       abonné qui vient d'être prévenu sait si ce qu'il affiche survivra à un
       rechargement. */
    durable: () => localKept,
    // reference data — one palette, the general families, shared with the caisse
    // and the public page. `colorsInUse` is what a filter row should offer: only
    // the families this store actually stocks, which is also how "transparent"
    // stays out of the way until a store has a reason for it.
    colors: (opts) => (window.KiwiColors ? window.KiwiColors.families(opts) : COLORS()),
    colorById: (id) => COLOR_BY_ID(id),
    colorFamily: (v) => (load(), famOf(v)),
    colorsInUse: () => {
      load();
      const seen = [];
      db.variants.forEach((v) => { const f = famOf(v); if (!seen.includes(f)) seen.push(f); });
      return COLORS().concat(window.KiwiColors ? window.KiwiColors.all() : [])
        .filter((c, i, a) => seen.includes(c.id) && a.findIndex((x) => x.id === c.id) === i);
    },
    listMarques: () => {
      load();
      const seen = new Set();
      db.products.filter((p) => !p.archived && p.marque).forEach((p) => seen.add(p.marque));
      return Array.from(seen).sort();
    },
    listMotifs: () => {
      load();
      const seen = new Set();
      db.products.filter((p) => !p.archived && p.motif).forEach((p) => seen.add(p.motif));
      return Array.from(seen).sort();
    },
    sizePresets,
    // categories
    listCategories: () => (load(), listCategories()), addCategory: (...a) => (load(), addCategory(...a)),
    renameCategory: (...a) => (load(), renameCategory(...a)), setCategoryColor: (...a) => (load(), setCategoryColor(...a)),
    deleteCategory: (...a) => (load(), deleteCategory(...a)), categoryCount: (id) => (load(), categoryCount(id)),
    // products
    listProducts: (o) => (load(), listProducts(o)), getProduct: (id) => (load(), getProduct(id)),
    addProduct: (d) => (load(), addProduct(d)), updateProduct: (id, p) => (load(), updateProduct(id, p)),
    /* Exposé pour tools/catalog-merge-test.js. La fusion est la pièce la plus
       dangereuse de ce fichier : elle décide ce qui SURVIT quand deux appareils
       ne sont pas d'accord, et une erreur là-dedans ne lève rien — elle rend
       simplement au commerçant un stock qu'il croyait avoir corrigé. */
    _merge: (mine, theirs) => mergeDocs(mine, theirs),
    _doc: () => (load(), db),
    /* Exposé pour tools/catalog-merge-properties-test.mjs : le repli sans
       barcode.js ne doit jamais imprimer le code d'un autre appareil. */
    _genEan: () => genEan(),
    /* Ce que la dernière fusion a appris, et de qui. Exposé pour que le garde-fou
       puisse vérifier qu'un appareil sans rien à dire ne republie pas — la boucle
       qui a porté le document d'un client à la révision 165. */
    _ahead: () => ({ mine: ledger.ahead.mine, theirs: ledger.ahead.theirs }),
    archiveProduct: (id, v) => (load(), archiveProduct(id, v)), deleteProduct: (id) => (load(), deleteProduct(id)),
    productStock: (id) => (load(), productStock(id)),
    variantStock: (id, size, color) => (load(), variantStock(id, size, color)),
    adjustVariantStock: (id, size, color, delta, opts) => (load(), adjustVariantStock(id, size, color, delta, opts)),
    reserveSale: (ref, lines) => reserveSale(ref, lines),
    confirmSale: (ref, shown) => (load(), confirmSale(ref, shown)),
    releaseSale: (ref) => (load(), releaseSale(ref)),
    // variants
    // .slice() : variantsOf() rend le tableau vivant de l'index (voir index()).
    // À l'intérieur du module on ne fait que le lire ; dehors, une copie, pour
    // qu'un appelant qui pousserait dedans ne fasse pas mentir l'index.
    listVariants: (pid) => (load(), variantsOf(pid).slice()), addVariant: (d) => (load(), addVariant(d)),
    updateVariant: (id, p) => (load(), updateVariant(id, p)), renameColor: (id, label) => (load(), renameColor(id, label)),
    setStock: (id, n, why) => (load(), setStock(id, n, why)),
    // Le MOTIF fait partie de l'appel : sans lui, une vente arrive au journal
    // étiquetée « ajust » et le journal cesse d'être lisible.
    adjustStock: (id, d, why, extra) => (load(), adjustStock(id, d, why, extra)), deleteVariant: (id) => (load(), deleteVariant(id)),
    // intake — les trois gestes distincts (voir le bloc au-dessus de findVariant)
    findVariant: (pid, c, s) => (load(), findVariant(pid, c, s)),
    ensureVariant: (d) => (load(), ensureVariant(d)),
    receiveStock: (id, q) => (load(), receiveStock(id, q)),
    productTemplate: (pid) => (load(), productTemplate(pid)),
    // le reste à faire après un import : ce qui n'a pas encore de code-barres
    listCodeless: (o) => (load(), listCodeless(o)),
    countCodeless: () => (load(), countCodeless()),
    // barcodes
    generateBarcode: (id) => (load(), generateBarcode(id)), attachBarcode: (id, raw, o) => (load(), attachBarcode(id, raw, o)),
    removeBarcode: (id, c) => (load(), removeBarcode(id, c)), findByBarcode: (c) => (load(), findByBarcode(c)),
    resolveScan: (c) => (load(), resolveScan(c)), barcodeExists: (c) => (load(), barcodeExists(c)), primaryBarcode,
    // Le stock du MÊME article dans les autres établissements du compte.
    crossStock, crossReset,
    /* Relire la copie serveur MAINTENANT, sans attendre le retour sur l'onglet.
     * C'est ce que demande le bouton « Rafraîchir » de la caisse : le commerçant
     * vient d'importer depuis le tableau de bord, ou l'autre poste a vendu, et il
     * veut le voir tout de suite. Rend `true` si l'inventaire a bougé.
     * Le cache « autre boutique » repart aussi à zéro : son stock a pu changer
     * autant que le nôtre, et la réponse gardée en mémoire vaut 30 s. */
    sync: () => { crossReset(); load(); return pull(true); },
    cloudRev: () => cloud.rev,   // la révision serveur sur laquelle cette copie repose
    // util
    stats: () => (load(), stats()), compat: () => (load(), compat()), exportCsv: () => (load(), exportCsv()),
    get _key() { return KEY; }, get _venue() { return VENUE; },
  };
})();
