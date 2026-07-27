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
    return { family: fam, source };
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

  /* ───────────────── in-memory state + persistence ───────────────── */
  let db = null;               // { v, categories[], products[], variants[], seq }
  const subs = new Set();      // change listeners on this page

  function nextId(prefix) { db.seq = (db.seq || 0) + 1; return prefix + '_' + db.seq; }

  function blank() { return { v: 1, categories: [], products: [], variants: [], seq: 0 }; }

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
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try { db = JSON.parse(raw); } catch (e) { db = null; }
    }
    if (!db || !db.products) {
      db = blank();
      if (VENUE === DEMO_VENUE && !hostedOrPaired()) seed();   // demo store pre-fills ONLY on the local pitch demo; a real/paired store starts empty
      persist();
    } else if (migrate()) {
      persist();   // teach older records their colour family, once, in place
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
    load();
    cloudBind();   // ce magasin-ci a sa propre copie serveur
    notify();
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }

  // Any mutation goes through here: persist + notify same-page subscribers, and
  // mirror the change up so the stock survives this browser (voir LE FILET plus
  // bas). L'écriture locale reste synchrone : la caisse ne doit jamais attendre
  // le réseau pour encaisser.
  function commit() {
    if (batchDepth > 0) { batchDirty = true; return; }
    persist(); notify(); schedulePush();
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
      if (batchDepth === 0 && batchDirty) { batchDirty = false; persist(); notify(); schedulePush(); }
    }
  }
  function notify() { subs.forEach((fn) => { try { fn(); } catch (e) {} }); }

  // Cross-tab: another tab wrote the catalog → reload + notify our listeners.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try { db = e.newValue ? JSON.parse(e.newValue) : blank(); } catch (err) { return; }
    migrate();   // the other tab may be an older build, or a cloud copy just landed
    notify();
  });

  /* ═════════════════ LE FILET — une copie serveur sur laquelle retomber ══════
   * Jusqu'ici ce catalogue ne vivait QUE dans le localStorage du navigateur qui
   * l'avait saisi. Une fenêtre privée fermée, un deuxième appareil, un cache
   * vidé, et l'inventaire n'existait plus nulle part : rien n'en gardait copie.
   * Un commerçant ne peut pas ressaisir son stock à chaque fois qu'il change de
   * navigateur — ce n'est pas un réglage d'affichage, c'est son magasin.
   *
   * Le stock est donc miroité vers /api/catalog, qui n'est lisible qu'en
   * prouvant son identité sur CE magasin (session du compte, caisse appairée ou
   * opérateur — jamais public, contrairement à /api/menu). Le tableau de bord et
   * la caisse écrivent déjà sous le même slug de boutique : ils tombent
   * naturellement sur le même document.
   *
   * Trois règles, dans cet ordre de priorité :
   *
   *  1. NE JAMAIS PERDRE DE STOCK. Toute panne — hors ligne, 500, table pas
   *     encore migrée, session expirée — est avalée : la copie locale reste la
   *     vérité de travail et la remontée est retentée au prochain enregistrement.
   *     La caisse continue de vendre dans un sous-sol sans réseau.
   *  2. NE JAMAIS ÉCRASER L'AUTRE APPAREIL. On envoie la révision sur laquelle on
   *     s'est basé ; si le serveur a bougé entre-temps il refuse (409) et renvoie
   *     sa copie. On fusionne et on repropose.
   *  3. NE JAMAIS POUSSER AVANT D'AVOIR LU. Un navigateur neuf a un catalogue
   *     vide ; s'il poussait en premier il effacerait le vrai stock.
   *
   * Fusion : union par id. Ce que CET appareil affiche l'emporte sur un id connu
   * des deux côtés, et tout ce que l'autre a ajouté vient s'ajouter. Deux
   * appareils qui modifient LA MÊME déclinaison en même temps voient donc un des
   * deux comptes gagner — mais rien ne disparaît jamais, ce qui est le seul
   * arbitrage acceptable sur un inventaire. */
  const REV_KEY = (slug) => 'kiwiCatalogRev:v1:' + slug;
  const cloud = { rev: 0, read: Object.create(null), timer: null, busy: false, again: false, tries: 0, last: 0 };

  // La démo (Maison Mansour) ne quitte jamais ce navigateur : elle est semée
  // localement et n'appartient à aucun compte.
  function cloudOn() {
    try {
      if (!VENUE || VENUE === DEMO_VENUE) return false;
      return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
    } catch (e) { return false; }
  }
  function readRev(slug) {
    try { return parseInt(localStorage.getItem(REV_KEY(slug)) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function writeRev(slug, rev) {
    try { localStorage.setItem(REV_KEY(slug), String(rev || 0)); } catch (e) {}
  }

  function mergeDocs(mine, theirs) {
    const out = {
      v: 1, categories: [], products: [], variants: [],
      seq: Math.max(+(mine && mine.seq) || 0, +(theirs && theirs.seq) || 0),
    };
    ['categories', 'products', 'variants'].forEach((k) => {
      const seen = Object.create(null);
      const list = [];
      const take = (e) => { if (e && e.id && !seen[e.id]) { seen[e.id] = 1; list.push(e); } };
      ((mine && mine[k]) || []).forEach(take);     // cet appareil d'abord
      ((theirs && theirs[k]) || []).forEach(take); // puis ce que l'autre a ajouté
      out[k] = list;
    });
    // Une déclinaison dont le produit a été supprimé des deux côtés n'a plus de
    // parent : elle deviendrait un article fantôme, invendable et invisible.
    const alive = Object.create(null);
    out.products.forEach((p) => { alive[p.id] = 1; });
    out.variants = out.variants.filter((v) => alive[v.productId]);
    return out;
  }

  /* Le compteur d'EAN-13 maison vit dans UNE clé locale (assets/barcode.js). Un
   * deuxième appareil qui reçoit le catalogue du premier démarre à zéro et
   * rééditerait exactement les mêmes codes — deux articles différents sous le
   * même code-barres, que la douchette ne pourrait plus départager. On remonte
   * donc le compteur au-dessus du plus grand code maison déjà présent. */
  function healSeq() {
    try {
      let max = 0;
      (db.variants || []).forEach((v) => ((v && v.barcodes) || []).forEach((b) => {
        const m = /^20(\d{10})\d$/.exec(String((b && b.code) || ''));
        if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
      }));
      if (!max) return;
      // barcode.js lit une clé fixe ; pages-pro.js en reporte une par magasin.
      // On remonte les deux, sinon le compteur repart selon la surface ouverte.
      ['kiwiBarcodeSeq:maisonMansour', 'kiwiBarcodeSeq:' + VENUE].forEach((K) => {
        const cur = parseInt(localStorage.getItem(K) || '0', 10) || 0;
        if (max > cur) localStorage.setItem(K, String(max));
      });
    } catch (e) {}
  }

  /* Lit la copie serveur et la réconcilie avec la locale. `first` = tout premier
   * contact pour ce magasin : c'est le seul cas où un catalogue local vide est
   * remplacé en bloc (le navigateur neuf adopte le magasin). Ensuite on fusionne
   * toujours, pour ne pas jeter ce qui vient d'être saisi ici. */
  function pull(first) {
    const slug = VENUE;
    if (!cloudOn()) return Promise.resolve(false);
    return fetch('/api/catalog?merchant=' + encodeURIComponent(slug), {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((res) => {
        cloud.read[slug] = 1;
        cloud.last = Date.now();
        // Le commerçant a changé de magasin pendant l'aller-retour : cette
        // réponse concerne l'inventaire d'une autre boutique, on la jette.
        if (!res || slug !== VENUE) return false;

        const serverRev = +res.rev || 0;
        const theirs = res.data;
        load();
        const mineEmpty = !(db.products && db.products.length);
        const theirsEmpty = !(theirs && theirs.products && theirs.products.length);

        if (theirsEmpty) {
          // Rien en ligne : c'est ce navigateur qui fait référence.
          cloud.rev = serverRev;
          if (!mineEmpty) schedulePush(0);
          return false;
        }
        cloud.rev = serverRev;
        if (!mineEmpty && readRev(slug) === serverRev) { healSeq(); return false; } // déjà à jour

        const adopt = first && mineEmpty;
        db = adopt ? theirs : mergeDocs(db, theirs);
        migrate();   // la copie serveur peut venir d'un build antérieur aux familles
        persist(); writeRev(slug, serverRev); healSeq(); notify();
        if (!adopt) schedulePush(0);   // notre fusion doit remonter
        return true;
      })
      .catch(() => false);   // hors ligne → la copie locale reste la vérité
  }

  function schedulePush(delay) {
    if (!cloudOn()) return;
    if (cloud.timer) clearTimeout(cloud.timer);
    cloud.timer = setTimeout(pushNow, delay == null ? 900 : delay);
  }

  function pushNow(opts) {
    cloud.timer = null;
    if (!cloudOn()) return;
    const slug = VENUE;
    // Règle 3 : jamais pousser avant d'avoir lu, sinon un navigateur neuf efface.
    if (!cloud.read[slug]) { pull(true); return; }
    if (cloud.busy) { cloud.again = true; return; }
    cloud.busy = true;
    fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: slug, baseRev: cloud.rev, data: db }),
      // L'onglet peut se fermer juste après une vente : keepalive laisse la
      // requête partir quand même.
      keepalive: !!(opts && opts.keepalive),
    })
      .then((r) => r.json().then((j) => ({ status: r.status, j })).catch(() => ({ status: r.status, j: null })))
      .then((res) => {
        if (slug !== VENUE) return;
        if (res.status === 200 && res.j && res.j.ok) {
          cloud.rev = +res.j.rev || 0;
          writeRev(slug, cloud.rev);
          cloud.tries = 0;
          return;
        }
        // 409 : le serveur a bougé (ou a refusé un envoi vide). Il nous rend sa
        // copie — on fusionne et on repropose, quelques fois au plus pour ne
        // jamais tourner en rond si l'autre appareil écrit en continu.
        if (res.status === 409 && res.j && res.j.data && cloud.tries < 3) {
          cloud.tries++;
          db = mergeDocs(db, res.j.data);
          migrate();
          cloud.rev = +res.j.rev || 0;
          persist(); writeRev(slug, cloud.rev); healSeq(); notify();
          cloud.again = true;
        }
        // 401 / 503 / 500 → on garde tout en local et on retentera plus tard.
      })
      .catch(() => { /* hors ligne : la vente continue, la remontée attendra */ })
      .then(() => {
        cloud.busy = false;
        if (cloud.again) { cloud.again = false; schedulePush(400); }
      });
  }

  // Le magasin actif vient de changer (ou la page vient de s'ouvrir) : on lit sa
  // copie serveur une fois.
  function cloudBind() {
    const slug = VENUE;
    if (!cloudOn() || cloud.read[slug]) return;
    pull(true);
  }

  /* Revenir sur l'onglet est le moment où l'on veut voir ce que l'AUTRE appareil
   * a fait — la caisse a vendu pendant qu'on regardait ailleurs. On relit, sans
   * marteler le serveur. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!cloudOn() || Date.now() - cloud.last < 20000) return;
    pull(false);
  });

  // Une modification en attente ne doit pas mourir avec l'onglet.
  window.addEventListener('pagehide', () => {
    if (cloud.timer) { clearTimeout(cloud.timer); cloud.timer = null; pushNow({ keepalive: true }); }
  });

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
    return '20' + String(Date.now()).slice(-10) + '0'; // degraded fallback (shouldn't happen)
  }

  function seed() {
    const palette = ['atlas', 'warn', 'riad', 'mint', 'info', 'danger'];
    SEED.forEach((rayon, ri) => {
      const cat = { id: nextId('cat'), name: rayon.rayonLabel, color: palette[ri % palette.length], order: ri };
      db.categories.push(cat);
      rayon.items.forEach((it) => {
        const prod = {
          id: nextId('prod'), legacyId: it.id, name: it.name, categoryId: cat.id,
          priceMAD: it.price, cost: Math.round(it.price * 0.55), art: it.art, kind: it.kind,
          flag: it.flag || '', grad: null, createdAt: Date.now(), archived: false,
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
      colorLabel: n.family.label, colorHex: n.family.hex,
      size: String(size), stock: Math.max(0, stock | 0), sku: '', barcodes: [],
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
      v.colorLabel = n.family.label;
      v.colorHex = n.family.hex;
      touched++;
    });
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
  const prodById = (id) => db.products.find((p) => p.id === id) || null;
  const varById  = (id) => db.variants.find((v) => v.id === id) || null;
  const variantsOf = (pid) => db.variants.filter((v) => v.productId === pid);

  /* Déclinaisons regroupées par produit, en UN passage.
   *
   * variantsOf() refiltre la table entière à chaque appel. C'est sans
   * conséquence sur une vitrine de vingt articles, mais compat() et stats()
   * l'appellent UNE FOIS PAR PRODUIT : le coût devient produits × déclinaisons.
   * Or ces deux fonctions sont rejouées à chaque écriture du catalogue (le
   * subscribe reconstruit la projection de vente). Mesuré sur une reprise de
   * stock réelle : à 1 200 articles, compat() coûtait 22 ms et stats() 14 ms,
   * et comme un article enregistré déclenche plusieurs commits, chaque scan
   * payait près de 100 ms de reconstruction — l'import de plusieurs milliers
   * de références, c'est-à-dire précisément l'usage visé, s'enlisait.
   * Un seul regroupement rend l'ensemble linéaire. */
  function groupVariants() {
    const by = Object.create(null);
    for (const v of db.variants) {
      if (!v) continue;
      (by[v.productId] || (by[v.productId] = [])).push(v);
    }
    return by;
  }

  function productStock(pid) { return variantsOf(pid).reduce((s, v) => s + (v.stock || 0), 0); }

  function normCode(s) { return String(s == null ? '' : s).trim(); }

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
    for (const v of db.variants) {
      if (v.barcodes && v.barcodes.some((b) => b.code === c)) return v;
    }
    const KB = window.KiwiBarcode;
    if (!KB || !KB.gtinKey) return null;
    const key = KB.gtinKey(c);
    if (!key) return null;
    for (const v of db.variants) {
      if (v.barcodes && v.barcodes.some((b) => KB.gtinKey(b.code) === key)) return v;
    }
    return null;
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
    const cat = { id: nextId('cat'), name: String(name || 'Catégorie').trim() || 'Catégorie', color: color || 'atlas', order: db.categories.length };
    db.categories.push(cat); commit(); return cat;
  }
  function renameCategory(id, name) { const c = catById(id); if (c) { c.name = String(name || c.name).trim() || c.name; commit(); } return c; }
  function setCategoryColor(id, color) { const c = catById(id); if (c) { c.color = color; commit(); } return c; }
  function deleteCategory(id, opts) {
    opts = opts || {};
    const reassignTo = opts.reassignTo || null; // null → uncategorised
    db.products.forEach((p) => { if (p.categoryId === id) p.categoryId = reassignTo; });
    db.categories = db.categories.filter((c) => c.id !== id);
    commit();
  }
  function categoryCount(id) { return db.products.filter((p) => p.categoryId === id && !p.archived).length; }

  /* ───────────────── products ───────────────── */
  function listProducts(opts) {
    opts = opts || {};
    let list = db.products.filter((p) => opts.includeArchived ? true : !p.archived);
    if (opts.categoryId && opts.categoryId !== 'all') list = list.filter((p) => p.categoryId === opts.categoryId);
    if (opts.q) {
      const q = opts.q.toLowerCase();
      const byProd = groupVariants();   // une fois, pas une fois par produit
      list = list.filter((p) => p.name.toLowerCase().includes(q)
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
      art: data.art || '', kind: data.kind || 'taille', flag: data.flag || '', grad: data.grad || null,
      // `photo` / `video` are URLs (uploaded to R2 via KiwiOrderPro.uploadMedia),
      // never bytes — the catalogue lives in localStorage and base64 would eat it.
      // One medium per product: a video supersedes a photo and vice-versa.
      photo: String(data.photo || ''),
      video: String(data.video || ''),
      createdAt: Date.now(), archived: false,
    };
    db.products.push(p); commit(); return p;
  }
  function updateProduct(id, patch) {
    const p = prodById(id); if (!p) return null;
    ['name', 'categoryId', 'priceMAD', 'cost', 'art', 'kind', 'flag', 'grad', 'photo', 'video'].forEach((k) => {
      if (patch[k] !== undefined) p[k] = (k === 'priceMAD' || k === 'cost') ? (+patch[k] || 0) : patch[k];
    });
    commit(); return p;
  }
  function archiveProduct(id, val) { const p = prodById(id); if (p) { p.archived = val !== false; commit(); } return p; }
  function deleteProduct(id) {
    db.variants = db.variants.filter((v) => v.productId !== id);
    db.products = db.products.filter((p) => p.id !== id);
    commit();
  }

  /* full product view for editors: product + variants + matrix helpers.
     `colors` is one entry per DISTINCT FAMILY — what a person sees on the card
     ("3 couleurs"). Two variants that both read Bleu count once here while
     staying two separate rows in the matrix, which is exactly the point. */
  function getProduct(id) {
    const p = prodById(id); if (!p) return null;
    const variants = variantsOf(id);
    const colors = []; const sizes = [];
    variants.forEach((v) => {
      const f = famOf(v);
      if (!colors.some((c) => c.id === f)) {
        const fam = COLOR_BY_ID(f) || { id: f, label: v.colorLabel, hex: v.colorHex };
        colors.push({ id: fam.id, label: fam.label, hex: fam.hex });
      }
      if (!sizes.includes(v.size)) sizes.push(v.size);
    });
    return {
      product: p, category: catById(p.categoryId), variants, colors, sizes,
      families: colors.map((c) => c.id), stock: productStock(id),
    };
  }

  /* ───────────────── variants ───────────────── */
  function addVariant(data) {
    data = data || {};
    if (!prodById(data.productId)) return null;
    // De-dupe on the RAW colour id, never on the family: a store that already has
    // a "navy" variant must still be able to keep a distinct "blue" one, with its
    // own stock and its own barcode. Merging them is a deliberate act, not a
    // side effect of picking the same swatch.
    const dup = db.variants.find((v) => v.productId === data.productId && v.colorId === data.colorId && v.size === String(data.size));
    if (dup) { if (data.stock != null) { dup.stock = Math.max(0, data.stock | 0); commit(); } return dup; }
    const v = mkVariant(data.productId, data.colorId, data.size, data.stock || 0, {
      colorLabel: data.colorLabel, colorHex: data.colorHex,
    });
    if (data.note) v.note = String(data.note).slice(0, 60);
    db.variants.push(v); commit(); return v;
  }
  function updateVariant(id, patch) {
    const v = varById(id); if (!v) return null;
    if (patch.stock != null) v.stock = Math.max(0, patch.stock | 0);
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
      v.colorLabel = n.family.label;
      v.colorHex = n.family.hex;
      v.colorSource = n.source;
      if (n.source && (patch.colorHex || v.colorSourceHex)) v.colorSourceHex = patch.colorHex || v.colorSourceHex;
      else delete v.colorSourceHex;
      if (!n.source) delete v.colorSource;
    }
    commit(); return v;
  }
  function setStock(id, n) { const v = varById(id); if (v) { v.stock = Math.max(0, n | 0); commit(); } return v; }
  function adjustStock(id, d) { const v = varById(id); if (v) { v.stock = Math.max(0, (v.stock || 0) + (d | 0)); commit(); } return v; }
  function deleteVariant(id) { db.variants = db.variants.filter((v) => v.id !== id); commit(); }

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
    if (!prodById(data.productId)) return { variant: null, created: false, reason: 'produit-introuvable' };
    const found = findVariant(data.productId, data.colorId, data.size);
    if (found) return { variant: found, created: false };
    const v = mkVariant(data.productId, data.colorId, data.size, data.stock || 0);
    if (data.colorLabel) v.colorLabel = data.colorLabel;
    if (data.colorHex) v.colorHex = data.colorHex;
    db.variants.push(v); commit();
    return { variant: v, created: true };
  }

  // Réception de marchandise : n × la même référence, sans scanner chaque pièce.
  function receiveStock(variantId, qty) {
    const v = varById(variantId);
    if (!v) return { ok: false, reason: 'variant-introuvable' };
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: 'quantite' };
    const before = v.stock || 0;
    v.stock = before + n;
    commit();
    return { ok: true, added: n, before, stock: v.stock };
  }

  /* Les informations COMMUNES d'un produit, pour enchaîner ses déclinaisons.
   * Un fournisseur qui code chaque taille séparément (Jean noir · S = code A,
   * M = code B, bleu M = code C) ne doit pas faire ressaisir le nom, la
   * catégorie, le prix et le coût à chaque scan. */
  function productTemplate(productId) {
    const p = prodById(productId); if (!p) return null;
    return {
      productId: p.id, name: p.name, categoryId: p.categoryId, priceMAD: p.priceMAD,
      cost: p.cost, kind: p.kind, art: p.art, flag: p.flag,
    };
  }

  /* ───────────────── barcodes ───────────────── */
  function generateBarcode(variantId) {
    const v = varById(variantId); if (!v) return null;
    if (v.barcodes.some((b) => b.primary)) return primaryBarcode(v); // already has one
    let code; let guard = 0;
    do { code = genEan(); } while (barcodeOwner(code) && guard++ < 50);
    v.barcodes.push({ code, type: 'ean13', primary: true });
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
    const owner = barcodeOwner(code);
    if (owner && owner.id === v.id) return { ok: true, code, already: true };
    if (owner) return { ok: false, reason: 'doublon', owner: { variant: owner, product: prodById(owner.productId) } };
    const sym = opts.sym || (KB && KB.detect ? KB.detect(code) : '');
    const isPrimary = !v.barcodes.some((b) => b.primary);
    v.barcodes.push({ code, type: opts.type || 'imported', sym, primary: isPrimary });
    commit(); return { ok: true, code, sym };
  }
  function removeBarcode(variantId, code) {
    const v = varById(variantId); if (!v) return;
    const c = normCode(code); const wasPrimary = v.barcodes.some((b) => b.code === c && b.primary);
    v.barcodes = v.barcodes.filter((b) => b.code !== c);
    if (wasPrimary && v.barcodes.length) v.barcodes[0].primary = true;
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
    let totalStock = 0, stockValue = 0, stockCost = 0, ruptures = 0, low = 0, costed = 0;
    const byProd = groupVariants();
    products.forEach((p) => {
      const s = (byProd[p.id] || []).reduce((acc, v) => acc + (v.stock || 0), 0);
      const price = p.priceMAD || 0;
      const cost = +p.cost || 0;
      totalStock += s;
      stockValue += s * price;
      stockCost += s * (cost > 0 ? cost : price);
      if (cost > 0) costed++;
      if (s === 0) ruptures++; else if (s <= 5) low++;
    });
    return { products: products.length, variants: db.variants.length, totalStock, stockValue, stockCost, costed, ruptures, low, categories: db.categories.length };
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
        const f = famOf(v);
        if (!colorSet.includes(f)) colorSet.push(f);
        (v.barcodes || []).forEach((b) => { BY_EAN[b.code] = p.id; });
      });
      const primaryV = vs.find((v) => v.barcodes && v.barcodes.length) || vs[0];
      const item = {
        id: p.id, name: p.name, price: p.priceMAD, art: p.art, kind: p.kind, flag: p.flag,
        ean: primaryV ? primaryBarcode(primaryV) : '', sizes, colors: colorSet.length ? colorSet : ['gris'],
        rayon: p.categoryId, _variants: vs,
      };
      P[p.id] = item;
      // Alias the seed's legacy id (e.g. 'caftan_ete') so the caisse's demo
      // sales-history / exchange data keeps resolving after the DB migration.
      if (p.legacyId && !P[p.legacyId]) P[p.legacyId] = item;
      let bucket = rayonById[p.categoryId];
      if (!bucket) { if (!uncat) { uncat = { id: '_uncat', label: 'Divers', items: [] }; RAYONS.push(uncat); } bucket = uncat; }
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

  /* ───────────────── CSV export (simple) ─────────────────
     `couleur` is the general family, the same word the merchant sees on screen,
     so a report reads like the shop does. `couleur_saisie` carries the original
     shade when there was one — a re-import or an accountant looking at last
     season's records still finds "Bleu nuit" next to its Bleu. */
  function exportCsv() {
    const rows = [['produit', 'categorie', 'couleur', 'couleur_saisie', 'taille', 'prix_mad', 'stock', 'code_barres', 'type']];
    db.products.filter((p) => !p.archived).forEach((p) => {
      const cat = catById(p.categoryId);
      variantsOf(p.id).forEach((v) => {
        const fam = COLOR_BY_ID(famOf(v));
        (v.barcodes.length ? v.barcodes : [{ code: '', type: '' }]).forEach((b) => {
          rows.push([p.name, cat ? cat.name : '', fam ? fam.label : v.colorLabel, v.colorSource || '', v.size, p.priceMAD, v.stock, b.code, b.type]);
        });
      });
    });
    return rows.map((r) => r.map((c) => /[",;\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(',')).join('\n');
  }

  function reset() { db = blank(); seed(); commit(); }

  /* ───────────────── public API ───────────────── */
  window.KiwiBoutiqueCatalog = {
    // lifecycle
    load, reset, use, currentVenue: () => VENUE, demoVenue: DEMO_VENUE,
    batch: (fn) => (load(), batch(fn)),   // un geste métier = une seule écriture
    subscribe(fn) { load(); subs.add(fn); return () => subs.delete(fn); },
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
    sizePresets,
    // categories
    listCategories: () => (load(), listCategories()), addCategory: (...a) => (load(), addCategory(...a)),
    renameCategory: (...a) => (load(), renameCategory(...a)), setCategoryColor: (...a) => (load(), setCategoryColor(...a)),
    deleteCategory: (...a) => (load(), deleteCategory(...a)), categoryCount: (id) => (load(), categoryCount(id)),
    // products
    listProducts: (o) => (load(), listProducts(o)), getProduct: (id) => (load(), getProduct(id)),
    addProduct: (d) => (load(), addProduct(d)), updateProduct: (id, p) => (load(), updateProduct(id, p)),
    archiveProduct: (id, v) => (load(), archiveProduct(id, v)), deleteProduct: (id) => (load(), deleteProduct(id)),
    productStock: (id) => (load(), productStock(id)),
    // variants
    listVariants: (pid) => (load(), variantsOf(pid)), addVariant: (d) => (load(), addVariant(d)),
    updateVariant: (id, p) => (load(), updateVariant(id, p)), setStock: (id, n) => (load(), setStock(id, n)),
    adjustStock: (id, d) => (load(), adjustStock(id, d)), deleteVariant: (id) => (load(), deleteVariant(id)),
    // intake — les trois gestes distincts (voir le bloc au-dessus de findVariant)
    findVariant: (pid, c, s) => (load(), findVariant(pid, c, s)),
    ensureVariant: (d) => (load(), ensureVariant(d)),
    receiveStock: (id, q) => (load(), receiveStock(id, q)),
    productTemplate: (pid) => (load(), productTemplate(pid)),
    // barcodes
    generateBarcode: (id) => (load(), generateBarcode(id)), attachBarcode: (id, raw, o) => (load(), attachBarcode(id, raw, o)),
    removeBarcode: (id, c) => (load(), removeBarcode(id, c)), findByBarcode: (c) => (load(), findByBarcode(c)),
    resolveScan: (c) => (load(), resolveScan(c)), barcodeExists: (c) => (load(), barcodeExists(c)), primaryBarcode,
    // util
    stats: () => (load(), stats()), compat: () => (load(), compat()), exportCsv: () => (load(), exportCsv()),
    get _key() { return KEY; }, get _venue() { return VENUE; },
  };
})();
