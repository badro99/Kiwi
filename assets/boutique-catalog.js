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
     Lifted from the caisse COLORS so both surfaces speak the same colours. */
  const COLORS = [
    { id: 'ivoire',     label: 'Ivoire',      hex: '#EFE7D6' },
    { id: 'blanc',      label: 'Blanc',       hex: '#FFFFFF' },
    { id: 'noir',       label: 'Noir',        hex: '#1F2421' },
    { id: 'dore',       label: 'Doré',        hex: '#C9A227' },
    { id: 'argent',     label: 'Argenté',     hex: '#C8CCD0' },
    { id: 'bordeaux',   label: 'Bordeaux',    hex: '#6E1F2E' },
    { id: 'nuit',       label: 'Bleu nuit',   hex: '#1F3A5C' },
    { id: 'emeraude',   label: 'Émeraude',    hex: '#2E6B4F' },
    { id: 'safran',     label: 'Safran',      hex: '#D99A2B' },
    { id: 'terracotta', label: 'Terracotta',  hex: '#B0613F' },
    { id: 'rose',       label: 'Rose poudré', hex: '#D8A8A0' },
    { id: 'camel',      label: 'Camel',       hex: '#B68B5C' },
    { id: 'gris',       label: 'Gris perle',  hex: '#9AA09D' },
  ];
  const COLOR_BY_ID = Object.fromEntries(COLORS.map((c) => [c.id, c]));

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
  function commit() { persist(); notify(); schedulePush(); }
  function notify() { subs.forEach((fn) => { try { fn(); } catch (e) {} }); }

  // Cross-tab: another tab wrote the catalog → reload + notify our listeners.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try { db = e.newValue ? JSON.parse(e.newValue) : blank(); } catch (err) { return; }
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

  function mkVariant(productId, colorId, size, stock) {
    const c = COLOR_BY_ID[colorId] || { id: colorId, label: colorId, hex: '#999' };
    return {
      id: nextId('var'), productId, colorId: c.id, colorLabel: c.label, colorHex: c.hex,
      size: String(size), stock: Math.max(0, stock | 0), sku: '', barcodes: [],
    };
  }

  /* ───────────────── lookups / derived ───────────────── */
  const catById  = (id) => db.categories.find((c) => c.id === id) || null;
  const prodById = (id) => db.products.find((p) => p.id === id) || null;
  const varById  = (id) => db.variants.find((v) => v.id === id) || null;
  const variantsOf = (pid) => db.variants.filter((v) => v.productId === pid);

  function productStock(pid) { return variantsOf(pid).reduce((s, v) => s + (v.stock || 0), 0); }

  function normCode(s) { return String(s == null ? '' : s).trim(); }

  function barcodeOwner(code) {
    const c = normCode(code);
    if (!c) return null;
    for (const v of db.variants) {
      if (v.barcodes && v.barcodes.some((b) => b.code === c)) return v;
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
      list = list.filter((p) => p.name.toLowerCase().includes(q)
        || (catById(p.categoryId) && catById(p.categoryId).name.toLowerCase().includes(q))
        || variantsOf(p.id).some((v) => (v.barcodes || []).some((b) => b.code.toLowerCase().includes(q)) || (v.sku || '').toLowerCase().includes(q)));
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

  /* full product view for editors: product + variants + matrix helpers */
  function getProduct(id) {
    const p = prodById(id); if (!p) return null;
    const variants = variantsOf(id);
    const colors = []; const sizes = [];
    variants.forEach((v) => {
      if (!colors.some((c) => c.id === v.colorId)) colors.push({ id: v.colorId, label: v.colorLabel, hex: v.colorHex });
      if (!sizes.includes(v.size)) sizes.push(v.size);
    });
    return { product: p, category: catById(p.categoryId), variants, colors, sizes, stock: productStock(id) };
  }

  /* ───────────────── variants ───────────────── */
  function addVariant(data) {
    data = data || {};
    if (!prodById(data.productId)) return null;
    // de-dupe by color+size within a product
    const dup = db.variants.find((v) => v.productId === data.productId && v.colorId === data.colorId && v.size === String(data.size));
    if (dup) { if (data.stock != null) { dup.stock = Math.max(0, data.stock | 0); commit(); } return dup; }
    const v = mkVariant(data.productId, data.colorId, data.size, data.stock || 0);
    if (data.colorLabel) v.colorLabel = data.colorLabel;
    if (data.colorHex) v.colorHex = data.colorHex;
    db.variants.push(v); commit(); return v;
  }
  function updateVariant(id, patch) {
    const v = varById(id); if (!v) return null;
    if (patch.stock != null) v.stock = Math.max(0, patch.stock | 0);
    if (patch.size != null) v.size = String(patch.size);
    if (patch.sku != null) v.sku = String(patch.sku);
    if (patch.colorId) { const c = COLOR_BY_ID[patch.colorId] || { id: patch.colorId, label: patch.colorLabel || patch.colorId, hex: patch.colorHex || '#999' }; v.colorId = c.id; v.colorLabel = c.label; v.colorHex = c.hex; }
    commit(); return v;
  }
  function setStock(id, n) { const v = varById(id); if (v) { v.stock = Math.max(0, n | 0); commit(); } return v; }
  function adjustStock(id, d) { const v = varById(id); if (v) { v.stock = Math.max(0, (v.stock || 0) + (d | 0)); commit(); } return v; }
  function deleteVariant(id) { db.variants = db.variants.filter((v) => v.id !== id); commit(); }

  /* ───────────────── barcodes ───────────────── */
  function generateBarcode(variantId) {
    const v = varById(variantId); if (!v) return null;
    if (v.barcodes.some((b) => b.primary)) return primaryBarcode(v); // already has one
    let code; let guard = 0;
    do { code = genEan(); } while (barcodeOwner(code) && guard++ < 50);
    v.barcodes.push({ code, type: 'ean13', primary: true });
    commit(); return code;
  }

  // Register an EXISTING barcode (old POS) verbatim onto a variant — no reprint.
  function attachBarcode(variantId, raw, opts) {
    opts = opts || {};
    const v = varById(variantId); if (!v) return { ok: false, reason: 'variant-introuvable' };
    const code = normCode(raw);
    if (!code) return { ok: false, reason: 'vide' };
    const owner = barcodeOwner(code);
    if (owner && owner.id === v.id) return { ok: true, code, already: true };
    if (owner) return { ok: false, reason: 'doublon', owner: { variant: owner, product: prodById(owner.productId) } };
    const type = opts.type || (window.KiwiBarcode ? window.KiwiBarcode.detect(code) : 'imported');
    const isPrimary = !v.barcodes.some((b) => b.primary);
    v.barcodes.push({ code, type: type === 'ean13' && window.KiwiBarcode && window.KiwiBarcode.isValidEan13(code) ? 'imported' : 'imported', primary: isPrimary });
    commit(); return { ok: true, code };
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
    products.forEach((p) => {
      const s = productStock(p.id);
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
    db.products.filter((p) => !p.archived).forEach((p) => {
      const vs = variantsOf(p.id);
      const sizes = {}; const colorSet = [];
      vs.forEach((v) => {
        sizes[v.size] = (sizes[v.size] || 0) + (v.stock || 0);
        if (!colorSet.includes(v.colorId)) colorSet.push(v.colorId);
        (v.barcodes || []).forEach((b) => { BY_EAN[b.code] = p.id; });
      });
      const primaryV = vs.find((v) => v.barcodes && v.barcodes.length) || vs[0];
      const item = {
        id: p.id, name: p.name, price: p.priceMAD, art: p.art, kind: p.kind, flag: p.flag,
        ean: primaryV ? primaryBarcode(primaryV) : '', sizes, colors: colorSet.length ? colorSet : ['ivoire'],
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

  /* Given a scanned barcode, resolve the exact variant → { pid, size, colorId }. */
  function resolveScan(code) {
    const hit = findByBarcode(code);
    if (!hit) return null;
    return { pid: hit.product.id, size: hit.variant.size, colorId: hit.variant.colorId, variant: hit.variant, product: hit.product };
  }

  /* ───────────────── CSV export (simple) ───────────────── */
  function exportCsv() {
    const rows = [['produit', 'categorie', 'couleur', 'taille', 'prix_mad', 'stock', 'code_barres', 'type']];
    db.products.filter((p) => !p.archived).forEach((p) => {
      const cat = catById(p.categoryId);
      variantsOf(p.id).forEach((v) => {
        (v.barcodes.length ? v.barcodes : [{ code: '', type: '' }]).forEach((b) => {
          rows.push([p.name, cat ? cat.name : '', v.colorLabel, v.size, p.priceMAD, v.stock, b.code, b.type]);
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
    subscribe(fn) { load(); subs.add(fn); return () => subs.delete(fn); },
    // reference data
    colors: () => COLORS.slice(), colorById: (id) => COLOR_BY_ID[id] || null, sizePresets,
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
    // barcodes
    generateBarcode: (id) => (load(), generateBarcode(id)), attachBarcode: (id, raw, o) => (load(), attachBarcode(id, raw, o)),
    removeBarcode: (id, c) => (load(), removeBarcode(id, c)), findByBarcode: (c) => (load(), findByBarcode(c)),
    resolveScan: (c) => (load(), resolveScan(c)), barcodeExists: (c) => (load(), barcodeExists(c)), primaryBarcode,
    // util
    stats: () => (load(), stats()), compat: () => (load(), compat()), exportCsv: () => (load(), exportCsv()),
    get _key() { return KEY; }, get _venue() { return VENUE; },
  };
})();
