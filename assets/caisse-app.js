/* ---------- DAfr days ---------- */
    const dafrDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthsEn = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];tickClock();
    setInterval(tickClock, 1000);
    /* ---------- Server / staff data ---------- */
    /* status: 'on' (3la khidma) | 'pause' (en pause) | 'off' (clocked out) */
    const servers = {
      YA: { id: 'YA', name: 'Yassir A.',  color: '#3FB67A', status: 'on',    breakStart: null, since: '08:12' },
      ME: { id: 'ME', name: 'Mehdi K.',   color: '#1F5D3C', status: 'pause', breakStart: Date.now() - 8 * 60 * 1000, since: '08:00' },
      KA: { id: 'KA', name: 'Karim B.',   color: '#D49F2E', status: 'on',    breakStart: null, since: '08:30' },
      SO: { id: 'SO', name: 'Sofia L.',   color: '#7A5BC9', status: 'on',    breakStart: null, since: '11:00' },
      HA: { id: 'HA', name: 'Hamza T.',   color: '#B85245', status: 'off',   breakStart: null, since: '·' },
    };const ROSTER_PALETTE = ['#3FB67A', '#1F5D3C', '#D49F2E', '#2B5C68', '#7A5BC9', '#B26B0F', '#4F7560', '#B85245'];
    let liveTeamMerchant = '';
    let liveTeamBusy = false;
    let liveTeamTimer = null;/* This poll ran every second, all day, on every till: the largest single
       share of the server bill. Clock-ins made on this till update it
       directly, so the poll only catches other devices: 5 s on screen,
       30 s in the background, and at once when the till comes back. */
    const LIVE_TEAM_VISIBLE_MS = 5000, LIVE_TEAM_HIDDEN_MS = 30000;/* ---------- Table data ---------- */
    /* status:  khawya | a-commander | ka-yaklo | bgha-ykhlass | khlass           */
    /* server:  server id assigned (only meaningful when table is occupied)      */
    /* floor:   0 = rez-de-chaussée, 1 = 1er étage                               */
    /* shape:   'rect' | 'round' | 'square'                                      */
    /* anchor:  'banquette-south' (banquette to the south, chairs north only)   */
    /*          'banquette-ronde' (3/4 leather bench wraps north, chairs south) */
    /*          undefined = chairs all around                                    */
    /* x,y:     top-left position, in % of containing room                       */
    /* w,h:     tabletop size, in % of room (round tables ignore h · square)    */
    const tables = {
      /* ─── Rez-de-chaussée ─────────────────────────────────────────────────
         Intérieur (4) + Terrasse extérieure (5) = 9 tables                     */

      // Inside, by the front window · Mehdi & Karim's tables
      T7:  { floor: 0, zone: 'interieur', shape: 'round',  covers: 2, size: 2, x: 22, y: 12, w: 7,  h: 13, status: 'khlass',       elapsed: 0,  server: 'ME' },
      T8:  { floor: 0, zone: 'interieur', shape: 'round',  covers: 2, size: 2, x: 33, y: 12, w: 7,  h: 13, status: 'khawya',       elapsed: 0,  server: 'ME' },
      T22: { floor: 0, zone: 'interieur', shape: 'round',  covers: 4, size: 4, x: 47, y: 11, w: 11, h: 20, status: 'ka-yaklo',     elapsed: 28, server: 'ME' },
      T9:  { floor: 0, zone: 'interieur', shape: 'round',  covers: 2, size: 2, x: 14, y: 78, w: 7,  h: 13, status: 'ka-yaklo',     elapsed: 14, server: 'KA' },

      // Terrasse · Karim + Sofia
      T12: { floor: 0, zone: 'terrasse',  shape: 'square', covers: 4, size: 4, x: 6,  y: 24, w: 11, h: 52, status: 'khawya',       elapsed: 0,  server: 'KA' },
      T13: { floor: 0, zone: 'terrasse',  shape: 'round',  covers: 4, size: 4, x: 21, y: 24, w: 13, h: 52, status: 'ka-yaklo',     elapsed: 19, server: 'KA' },
      T14: { floor: 0, zone: 'terrasse',  shape: 'square', covers: 4, size: 4, x: 38, y: 24, w: 11, h: 52, status: 'khawya',       elapsed: 0,  server: 'SO' },
      T15: { floor: 0, zone: 'terrasse',  shape: 'square', covers: 4, size: 4, x: 53, y: 24, w: 11, h: 52, status: 'ka-yaklo',     elapsed: 55, server: 'SO' },
      T16: { floor: 0, zone: 'terrasse',  shape: 'round',  covers: 6, size: 6, x: 72, y: 16, w: 18, h: 68, status: 'ka-yaklo',     elapsed: 38, server: 'SO' },

      /* ─── 1er étage ────────────────────────────────────────────────────────
         14 tables : 6 fenêtres, banquette ronde centre + flanc, banquette
         longue sud (4), banquette d'angle ronde groupe                          */

      // Window-side row (north wall) · Yassir's section
      T1:  { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 12, y: 8,  w: 11, h: 11, status: 'ka-yaklo',     elapsed: 45, server: 'YA' },
      T2:  { floor: 1, zone: 'etage', shape: 'round', covers: 2, size: 2, x: 26, y: 7,  w: 8,  h: 14, status: 'bgha-ykhlass', elapsed: 12, server: 'YA' },
      T3:  { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 38, y: 8,  w: 11, h: 11, status: 'khawya',       elapsed: 0,  server: 'YA' },
      T4:  { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 51, y: 8,  w: 11, h: 11, status: 'ka-yaklo',     elapsed: 22, server: 'YA' },
      T19: { floor: 1, zone: 'etage', shape: 'round', covers: 2, size: 2, x: 65, y: 7,  w: 8,  h: 14, status: 'ka-yaklo',     elapsed: 28, server: 'YA' },
      T10: { floor: 1, zone: 'etage', shape: 'round', covers: 2, size: 2, x: 76, y: 7,  w: 8,  h: 14, status: 'khawya',       elapsed: 0,  server: 'KA' },

      // Banquette ronde · centerpiece (Mehdi's table, anchored to the C-arc)
      T5:  { floor: 1, zone: 'etage', shape: 'round', covers: 6, size: 6, x: 44, y: 41, w: 12, h: 19, anchor: 'banquette-ronde', status: 'ka-yaklo', elapsed: 67, server: 'ME' },

      // Mid-room round tables flanking the banquette ronde
      T17: { floor: 1, zone: 'etage', shape: 'round', covers: 4, size: 4, x: 17, y: 44, w: 11, h: 18, status: 'bgha-ykhlass', elapsed: 5,  server: 'SO' },
      T18: { floor: 1, zone: 'etage', shape: 'round', covers: 4, size: 4, x: 70, y: 44, w: 11, h: 18, status: 'khawya',       elapsed: 0,  server: 'SO' },

      // Long banquette against the south wall · 4 tables share the bench
      T6:  { floor: 1, zone: 'etage', shape: 'rect',  covers: 5, size: 6, x: 12, y: 74, w: 16, h: 9,  anchor: 'banquette-south', status: 'bgha-ykhlass', elapsed: 8,  server: 'ME' },
      T11: { floor: 1, zone: 'etage', shape: 'rect',  covers: 3, size: 4, x: 30, y: 74, w: 11, h: 9,  anchor: 'banquette-south', status: 'ka-yaklo',     elapsed: 31, server: 'KA' },
      T20: { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 43, y: 74, w: 11, h: 9,  anchor: 'banquette-south', status: 'khawya',       elapsed: 0,  server: 'YA' },
      T21: { floor: 1, zone: 'etage', shape: 'rect',  covers: 4, size: 4, x: 56, y: 74, w: 11, h: 9,  anchor: 'banquette-south', status: 'khawya',       elapsed: 0,  server: 'YA' },

      // Banquette ronde d'angle · second group table (south-east corner)
      T23: { floor: 1, zone: 'etage', shape: 'round', covers: 6, size: 6, x: 73, y: 71, w: 14, h: 22, anchor: 'banquette-ronde', status: 'khawya', elapsed: 0,  server: 'SO' },
    };
    // A REAL / paired store opens with a BLANK floor · NOT Café Atlas's specific
    // 24-table geometry (its named layout · T7 terrasse, the banquette ronde, the
    // 1er étage rows · is demo data, and rendering one venue's floor inside another
    // is the P7 leak). Delete every seeded table so the plan renders empty
    // ("0 / 0 occupées") until the store builds its own floor; the roster rename in
    // applyStoreIdentity then has no demo tables left to paint a section avatar on.
    // KiwiEnv loads before this script, so isReal() is ready here; the local demo
    // (unpaired localhost, storeIsReal false) keeps its full mid-service floor
    // byte-for-byte. renderSalle() and the occupancy counters tolerate empty tables.
    try { if (storeIsReal()) Object.keys(tables).forEach((k) => delete tables[k]); } catch (_) {}
    /* ── LA FRONTIÈRE DÉMO / RÉEL ────────────────────────────────────────────
     * Café Atlas est une vitrine, pas un client. Tout ce qui est semé plus bas ·
     * la carte, les commandes de table, les recettes cuisine · n'existe que
     * pour lui. Un vrai commerçant appairé qui voit « Tajine kefta 180 MAD »
     * dans sa caisse ne voit pas une démo : il voit un logiciel qui invente des
     * plats qu'il ne vend pas, et il peut les encaisser.
     *
     * Le drapeau est figé au montage (comme assets/pos-boutique.js:457) : un
     * appairage en cours de session ne doit pas réécrire une carte à moitié
     * servie. `storeIsReal()` est une déclaration de fonction, donc hissée ·
     * l'appel est légal ici malgré sa définition plus bas dans l'IIFE. */
    const IS_DEMO = !storeIsReal();
    /* Le drapeau figé a un angle mort : « Ouvrir la caisse sur cet appareil »
       appaire PENDANT l'amorçage (assets/caisse-pairing.js), donc après ce
       calcul. La caisse d'un vrai café s'ouvrait alors sur la carte de démo,
       35 plats à des prix inventés, encaissables. caisse-pairing lit ce
       drapeau et recharge une fois, avant que quoi que ce soit soit servi. */
    window.__kiwiCaisseBootedAsDemo = IS_DEMO;
    if (!IS_DEMO) {
      try {
        const pv = storePaired();
        document.title = 'Kiwi Caisse' + (pv && pv.name ? ' · ' + pv.name : '');
      } catch (_) { document.title = 'Kiwi Caisse'; }
    }
    /* ---------- Mock orders per table ---------- */
    /* T2 hand-spec'd. Others generated from a small menu so the demo doesn't break. */
    const orders = IS_DEMO ? {
      T2: [
        { qty: 2, name: 'Salade marocaine',  total: 90  },
        { qty: 2, name: 'Tajine kefta',      total: 360 },
        { qty: 1, name: 'Thé à la menthe',   total: 30  },
        { qty: 1, name: 'Jus d’avocat', total: 50  },
      ],
    } : {};
    // Live per-table orders built by the cashier (format: {id,name,price,qty}[])
    const tableOrders = {};
    /* For other occupied tables, generate plausible orders (deterministic per table id) */
    const menu = IS_DEMO ? [
      { name: 'Salade marocaine',     unit: 45 },
      { name: 'Briouates',            unit: 60 },
      { name: 'Tajine kefta',         unit: 180 },
      { name: 'Tajine poulet',        unit: 150 },
      { name: 'Couscous royal',       unit: 220 },
      { name: 'Pastilla poulet',      unit: 140 },
      { name: 'Harira',               unit: 35 },
      { name: 'Thé à la menthe',      unit: 30 },
      { name: 'Jus d’orange',    unit: 35 },
      { name: 'Jus d’avocat',    unit: 50 },
      { name: 'Eau Aïn Saïss',        unit: 18 },
      { name: 'Pâtisserie maison',    unit: 45 },
    ] : [];/* ═══════════════════════════════════════════════════════════════════════
       FLOOR PLAN RENDERING · le dessin au trait noir du dashboard, à
       l'identique. Les fonctions pdsNoir* de pages-pro.js ne sont pas
       exportées par floorplan-core (même raison que caisseNoirC plus bas),
       donc elles sont recopiées ici : coches de chaises, plateau fantôme,
       mobilier au trait, sol charbon quadrillé. Une seule table, un seul
       rendu · la démo Café Atlas et le plan du commerçant passent tous les
       deux par caisseNoirCellHTML().
       ═══════════════════════════════════════════════════════════════════════ */
    /* Anneaux d'état, langue caisse. Mêmes valeurs que PDS_STATUS_RING_NOIR
       du dashboard : khawya = free, ka-yaklo = occupied (mint, halo),
       a-commander garde l'ambre de reserved en trait plein, khlass = cleaning.
       bgha-ykhlass est le seul état propre à la caisse · rose, halo rose. */
    const CAISSE_RING_NOIR = {
      'khawya':       { s: 'rgba(255,255,255,0.30)', w: 1.25, dash: '',        fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
      'a-commander':  { s: '#E8C067',                w: 1.25, dash: '',        fill: 'rgba(232,192,103,0.08)', chair: 'rgba(232,192,103,0.50)' },
      'ka-yaklo':     { s: '#00FFAE',                w: 1.25, dash: '',        fill: 'rgba(0,255,174,0.14)',   chair: 'rgba(0,255,174,0.70)' },
      'bgha-ykhlass': { s: '#FF7DA9',                w: 1.25, dash: '',        fill: 'rgba(255,125,169,0.12)', chair: 'rgba(255,125,169,0.60)' },
      'khlass':       { s: 'rgba(255,255,255,0.40)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
    };
    /* Mêmes états, encre du jour · PDS_STATUS_RING_JOUR du dashboard : le mint
       redevient atlas, l'ambre son ton foncé, le rose son ton foncé. */
    const CAISSE_RING_JOUR = {
      'khawya':       { s: 'rgba(10,15,13,0.30)',    w: 1.25, dash: '',        fill: 'rgba(10,15,13,0.015)',   chair: 'rgba(10,15,13,0.22)' },
      'a-commander':  { s: '#C89235',                w: 1.25, dash: '',        fill: 'rgba(200,146,53,0.10)',  chair: 'rgba(200,146,53,0.55)' },
      'ka-yaklo':     { s: '#0B6E4F',                w: 1.25, dash: '',        fill: 'rgba(11,110,79,0.10)',   chair: 'rgba(11,110,79,0.70)' },
      'bgha-ykhlass': { s: '#C2456F',                w: 1.25, dash: '',        fill: 'rgba(194,69,111,0.10)',  chair: 'rgba(194,69,111,0.60)' },
      'khlass':       { s: 'rgba(10,15,13,0.45)',    w: 1.25, dash: '1.5 3.5', fill: 'rgba(10,15,13,0.02)',    chair: 'rgba(10,15,13,0.24)' },
    };
    /* ── Café Atlas, redessiné au trait ──────────────────────────────────
       Les plans démo deviennent des scènes noir identiques au dashboard :
       un plan en px (échelle 800 ≈ largeur dashboard, tables 64–144px comme
       les types round2..rect8), du mobilier au trait, et les tables en %
       converties en px au rendu. */
    const DEMO_PLANES = {
      interieur: { w: 800, h: 400 },
      terrasse:  { w: 800, h: 250 },
      etage:     { w: 800, h: 500 },
    };
    const DEMO_FIXTURES = {
      interieur: [
        { type: 'fenetre',  x: 90,  y: 0,   w: 240, h: 6 },
        { type: 'fenetre',  x: 370, y: 0,   w: 140, h: 6 },
        { type: 'cuisine',  x: 550, y: 20,  w: 230, h: 145, label: 'CUISINE' },
        { type: 'passe',    x: 549, y: 148, w: 30,  h: 20, label: '' },
        { type: 'comptoir', x: 110, y: 175, w: 400, h: 40, label: 'COMPTOIR' },
        { type: 'escalier', x: 620, y: 195, w: 140, h: 185, label: '' },
        { type: 'plante',   x: 525, y: 330, w: 45,  h: 45 },
        { type: 'porte',    x: 4,   y: 250, w: 55,  h: 8, rot: 90, label: '' },
      ],
      terrasse: [
        { type: 'plante', x: 30,  y: 8, w: 30, h: 30 },
        { type: 'plante', x: 110, y: 8, w: 30, h: 30 },
        { type: 'plante', x: 210, y: 8, w: 30, h: 30 },
        { type: 'plante', x: 310, y: 8, w: 30, h: 30 },
        { type: 'plante', x: 450, y: 8, w: 30, h: 30 },
        { type: 'plante', x: 670, y: 8, w: 30, h: 30 },
      ],
      etage: [
        { type: 'fenetre',  x: 100, y: 0,   w: 200, h: 6 },
        { type: 'fenetre',  x: 450, y: 0,   w: 200, h: 6 },
        { type: 'comptoir', x: 10,  y: 190, w: 30,  h: 140, label: 'BAR' },
        { type: 'banquette', x: 90,  y: 430, w: 490, h: 28, label: '' },
        { type: 'banquette', x: 640, y: 350, w: 28,  h: 110, label: '' },
        { type: 'escalier', x: 670, y: 160, w: 120, h: 180, label: '' },
        { type: 'plante',   x: 630, y: 100, w: 40,  h: 40 },
        { type: 'plante',   x: 70,  y: 360, w: 40,  h: 40 },
      ],
    };
    /* Phone-order state must exist before the first floor render: tableHTML()
       asks phoneBadgeHTML() for each table during this initial paint. */
    /* Les tables qu'une commande nomme sans que le plan de salle les connaisse.
       Mémorisées pour n'avertir qu'une fois par table, pas à chaque sondage. */
    const opUnmatchedTables = new Set();
    const phoneSeats = new Map();     // clé table → { session, since }
    const phoneMovedVisits = new Map(); // session → acknowledged destination and superseded close marker
    const phonePending = new Map();   // clé table → nombre de commandes en attente
    const tableClosedAt = Object.create(null); // clé table → horodatage de fermeture/annulation locale
    const recoveredPaidVisits = new Set();
    if (!storeIsReal()) initDemoPlanes();
    renderSalle();
    /* ═══════════════════════════════════════════════════════════════════════
       REAL-STORE FLOOR PLAN · the caisse mirrors the owner's dashboard design
       (Plan de Salle), never the Café Atlas demo. No design yet → a clean
       "à concevoir" empty state. The dashboard mirrors its layout under the
       merchant slug (kiwiPlanDeSalle:slug:<slug>), which is what we read here;
       a server channel will light the same reader up cross-device. Demo store
       (unpaired localhost) is untouched · it keeps its architectural plan.
       ═══════════════════════════════════════════════════════════════════════ */
    let __realZoneOrder = [];
    /* The owner's plan as designed · kept alongside `tables` (which holds live
       service state) so a repaint can position tables without re-reading
       storage or resetting anybody's status. */
    let __realPlan = null;
    /* Fallback only. The dashboard's plan (v2) stores the cover count on each
       TABLE, because the owner can resize a table and change its seating; this
       map is what a v1 plan gets, and it was already wrong · `rect10` was
       missing, so every 10-top on the till read "4p". Read the table first,
       fall back to the type, and only then to 4. */
    const DESIGN_COVERS = { round2: 2, sq2: 2, high: 2, bar: 1, round4: 4, sq4: 4, rect4: 4, round6: 6, rect6: 6, round8: 8, rect8: 8, rect10: 10 };
    /* ═══════════════════════════════════════════════════════════════════════
       UNE table, DEUX formes dans le DOM · et il a longtemps manqué la moitié.
       ---------------------------------------------------------------------
       La démo dessine des `.tbl-cell` ; un vrai commerçant qui a dessiné sa
       salle obtient des `.cplan-tbl` (renderRealGrid, branche spatiale). Or
       CHAQUE interaction du fichier ne cherchait que `.tbl-cell` : le clic, la
       sélection, le chronomètre, le placement d'une file d'attente, le clavier.
       Résultat, sur le plan qu'un client voit vraiment, taper une table ne
       faisait rien du tout · alors que le nœud porte role="button" et un
       tabindex, donc il a toujours eu l'air cliquable.
       Un seul sélecteur pour les deux, désormais, et il est nommé pour qu'on
       n'en oublie plus un. ══════════════════════════════════════════════════ */
    const TBL_SEL = '.tbl-cell, .cplan-tbl';
    /* Repaint from the CURRENT `tables` (live status from the order flow)
       positioned by the OWNER'S plan. This used to be a flat card grid per
       zone, which threw away every coordinate the owner had placed · the
       waiter saw an alphabetical list, not their room. Same geometry and the
       same drawing primitives as the dashboard designer, via KiwiFloorCore. */
    var __activeRealZoneFilter = 'all';
    /* Le plan cuit ses couleurs (matières aplaties, anneaux d'état, dégradés
       de plateau) dans le SVG au moment du rendu · un changement de thème doit
       donc repeindre, le remap CSS ne suffit pas. Plan réel : la grille se
       redessine seule. Scène démo : le sol, le mobilier et les defs sont
       injectés une seule fois derrière `planeInit`, il faut donc les retirer
       avant de relancer l'injection. */
    document.addEventListener('kiwi:caisse-theme', () => {
      if (storeIsReal()) { renderRealGrid(); return; }
      document.querySelectorAll('.view-salle .cplan-room[data-plan-zone] .cplan-scale').forEach(scale => {
        scale.querySelectorAll(':scope > .pds-floor, :scope > .pds-el, :scope > .pds-defs')
             .forEach(node => node.remove());
        delete scale.dataset.planeInit;
      });
      initDemoPlanes();
      renderSalle();
    });
    try { setupRealSalle(); } catch (_) {}
    // A design saved on the dashboard (same browser) → repaint live.
    window.addEventListener('storage', (e) => {
      if (e && e.key && e.key.indexOf('kiwiPlanDeSalle:slug:') === 0) { try { setupRealSalle(); } catch (_) {} }
    });
    // Pairing redeemed after paint (?pair=1 hand-off) → build the real plan.
    document.addEventListener('kiwi-paired', () => { try { setupRealSalle(); } catch (_) {} });
    /* ── Le plan dessiné sur UN AUTRE appareil ──────────────────────────────
       Les deux relances ci-dessus supposent le même navigateur : l'événement
       `storage` ne traverse pas les appareils, et l'appairage ne transporte pas
       le plan. Une caisse installée après coup · le cas normal, le patron
       dessine chez lui et l'iPad arrive au comptoir ensuite · affichait donc
       « Plan de salle pas encore conçu » sur une salle entièrement dessinée.
       On lit la copie serveur, qui atterrit sur le `window.KiwiFloorPlan` que
       caisseFloorPlan() consulte déjà en premier. La caisse ne dessine pas de
       plan, mais elle en porte un quand l'appairage s'est fait dans ce
       navigateur : si le serveur est encore vide, c'est donc elle qui l'y pose
       · le premier des deux à se connecter sème, peu importe lequel. */
    (function () {
      const slugMirror = (slug) => 'kiwiPlanDeSalle:slug:' + slug;
      let doc = null;

      function build() {
        if (doc) return true;
        if (!window.KiwiCloudDoc) return false;
        doc = window.KiwiCloudDoc.attach({
          feature: 'floorplan',
          slug: () => window.KiwiCloudDoc.currentSlug(),
          /* Le pendant de la ligne posée côté tableau de bord : la caisse range
             sa copie sous le slug, lui sous l'ID d'établissement. Le signet doit
             dire laquelle des deux il décrit, sinon l'un des deux appareils se
             croit à jour pour toujours. */
          localKey: () => { const s = window.KiwiCloudDoc.currentSlug(); return s ? slugMirror(s) : ''; },
          read: () => {
            try {
              const s = window.KiwiCloudDoc.currentSlug();
              const raw = s ? localStorage.getItem(slugMirror(s)) : null;
              const d = raw ? JSON.parse(raw) : null;
              if (d && Array.isArray(d.tables)) return d;
            } catch (_) {}
            return { zones: [], tables: [], staff: [] };
          },
          write: (d) => {
            try {
              const s = window.KiwiCloudDoc.currentSlug();
              if (s) localStorage.setItem(slugMirror(s), JSON.stringify(d));
            } catch (_) {}
            window.KiwiFloorPlan = d;
            try { setupRealSalle(); } catch (_) {}
          },
          /* La même fusion que le tableau de bord (floorplan-core.js ›
             pdsMergePlans : époque + pierres tombales). L'union nue de
             cloud-doc.js ignorait l'époque et ne savait pas supprimer : une
             caisse gardant une vieille copie réinjectait des tables étrangères
             dans un plan pourtant réparé depuis le tableau de bord. */
          merge: (mine, theirs) => {
            const M = window.KiwiCloudDoc.mergeDefault;
            const F = window.KiwiFloorCore;
            return (F && typeof F.mergePlans === 'function') ? F.mergePlans(mine, theirs, M) : M(mine, theirs);
          },
          isEmpty: (d) => !d || !(d.tables && d.tables.length),
        });
        // Un appairage noué APRÈS le chargement doit lancer la lecture.
        document.addEventListener('kiwi-paired', () => { try { doc.bind(); } catch (_) {} });
        return true;
      }

      /* ── POURQUOI ON REPASSE ─────────────────────────────────────────────
         Ce script-ci est EN LIGNE dans la page : il s'exécute pendant l'analyse
         du document. `assets/cloud-doc.js` porte `defer`, donc il ne s'exécute
         qu'une fois tout le document analysé · APRÈS ces lignes. Au premier
         passage `window.KiwiCloudDoc` n'existe pas encore, et la version
         précédente se contentait d'un `return` : la caisse n'attachait jamais le
         lecteur du plan, ne demandait donc JAMAIS /api/store?feature=floorplan,
         et « Rafraîchir » n'avait rien à relire non plus (pullAll ne parcourt
         que les documents attachés). Le patron dessinait sa salle, le comptoir
         répondait « pas encore conçu », indéfiniment.

         Seul le MÊME navigateur s'en sortait, par le miroir localStorage : le
         bogue marchait donc chez celui qui le testait sur son portable, et
         jamais sur la tablette du comptoir · le cas normal, et le seul qui
         compte. (C'est exactement pour ce piège que floorplan-core.js est
         chargé sans `defer`, voir l'en-tête du fichier.)

         Le slug peut lui aussi arriver en retard, le temps que l'appairage se
         résolve. On repasse donc jusqu'à ce que les deux soient là · borné, une
         caisse ne doit pas interroger sans fin. */
      let left = 40;                                   // ~10 s, puis on renonce
      (function attempt() {
        if (build() && doc.enabled()) { try { doc.bind(); } catch (_) {} return; }
        if (--left > 0) setTimeout(attempt, 250);
      })();
    })();
    document.querySelectorAll('.floor-pill').forEach(p =>
      p.addEventListener('click', () => setFloor(p.dataset.floor))
    );
    /* ---------- Mode switching (Salle ↔ Vente rapida ↔ Order) ---------- */
    let mode = 'salle';
    document.body.dataset.mode = mode;
    // New-table modal state
    let newTableId = null;
    let newTableCovers = 2;
    document.addEventListener('kiwi-config', () => { syncActiveMode(); });
    $$('.mode-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.feature && isFeatureOff(btn.dataset.feature)) return;
        if (btn.dataset.mode && isFeatureOff(btn.dataset.mode)) return;
        /* QUITTER LE MODE COMMANDE PAR LES PASTILLES.
           Le garde-fou refusait tout, toujours · y compris sur une mesa vide, où
           il n'y a rien à protéger. Or « j'ai ouvert la table par erreur, ils ne
           commandent pas encore » est le cas courant, et le geste naturel est de
           retaper « Salle ». Le lui interdire est exactement ce qui donnait une
           caisse qui ne répond plus. Rien de saisi ⇒ on sort et la mesa
           redevient libre. Une commande commencée, elle, garde son garde-fou :
           elle se valide ou s'annule, jamais par inadvertance. */
        if (mode === 'order') {
          if (orderInProgressCount() > 0) {
            toast('Valide ou annule la commande d\'abord');
            return;
          }
          cancelNewOrder();
          if (btn.dataset.mode && btn.dataset.mode !== 'salle' && !isFeatureOff(btn.dataset.mode)) setMode(btn.dataset.mode);
          return;
        }
        setMode(btn.dataset.mode);
      });
    });
    window.KiwiCaisseToast = toast;
    /* ---------- Right panel state ---------- */
    let selectedId = null;
    let caisseTableLocks = {};
    /* ===========================================================
       Vente rapida · menu + cart
       =========================================================== */
    /* La carte de la démo. Chez un vrai commerçant elle part vide et c'est
       rebuildCarte() qui la remplit avec SA carte, publiée depuis le tableau de
       bord. `let` et non `const` : la carte se remplace quand le patron change
       un prix au bureau. */
    let catLabels = IS_DEMO ? {
      all:        'Tout',
      entrees:    'Entrées',
      tajines:    'Tajines',
      couscous:   'Couscous',
      pastillas:  'Pastillas',
      sandwiches: 'Sandwiches',
      boissons:   'Boissons',
      desserts:   'Desserts',
    } : { all: 'Tout' };
    /* Category colour-coding · a muted Moroccan-earth palette used for the tile
       art chip, category label, in-cart glow and quantity badge. Functional
       colour-coding (à la Loyverse/Square) that reads fast without going loud. */
    let catColor = IS_DEMO ? {
      entrees:    'var(--forest)',
      tajines:    '#B5532A',
      couscous:   '#C9922E',
      pastillas:  '#A8574E',
      sandwiches: '#6E7B3D',
      boissons:   '#2E7D8C',
      desserts:   '#8A5A9E',
    } : {};
    /* L'ordre des pastilles. Il était écrit en dur dans renderCatPills(), ce qui
       rendait les catégories d'un vrai café impossibles à afficher même une fois
       ses plats chargés. */
    let catOrder = IS_DEMO
      ? ['all', 'entrees', 'tajines', 'couscous', 'pastillas', 'sandwiches', 'boissons', 'desserts']
      : ['all'];
    /* La palette reste celle de la maison : on la parcourt dans l'ordre des
       catégories du commerçant plutôt que d'inventer des teintes par hachage. */
    const CAT_PALETTE = ['var(--forest)', '#B5532A', '#C9922E', '#A8574E', '#6E7B3D', '#2E7D8C', '#8A5A9E'];
    let menuItems = IS_DEMO ? [
      // Entrées
      { id: 'm-001', cat: 'entrees',    name: 'Salade marocaine',     price: 45  },
      { id: 'm-002', cat: 'entrees',    name: 'Briouates au fromage', price: 60  },
      { id: 'm-003', cat: 'entrees',    name: 'Harira',               price: 35  },
      { id: 'm-004', cat: 'entrees',    name: 'Zaalouk',              price: 40  },
      { id: 'm-005', cat: 'entrees',    name: 'Taktouka',             price: 40  },
      { id: 'm-006', cat: 'entrees',    name: 'Soupe du jour',        price: 35  },
      // Tajines
      { id: 'm-007', cat: 'tajines',    name: 'Tajine kefta',         price: 180 },
      { id: 'm-008', cat: 'tajines',    name: 'Tajine poulet citron', price: 150 },
      { id: 'm-009', cat: 'tajines',    name: 'Tajine agneau pruneaux', price: 220 },
      { id: 'm-010', cat: 'tajines',    name: 'Tajine 4 légumes',     price: 120 },
      { id: 'm-011', cat: 'tajines',    name: 'Tajine poisson',       price: 200 },
      // Couscous
      { id: 'm-012', cat: 'couscous',   name: 'Couscous royal',       price: 220 },
      { id: 'm-013', cat: 'couscous',   name: 'Couscous tfaya',       price: 180 },
      { id: 'm-014', cat: 'couscous',   name: 'Couscous légumes',     price: 140 },
      // Pastillas
      { id: 'm-015', cat: 'pastillas',  name: 'Pastilla poulet',      price: 140 },
      { id: 'm-016', cat: 'pastillas',  name: 'Pastilla seafood',     price: 180 },
      { id: 'm-017', cat: 'pastillas',  name: 'Pastilla pigeon',      price: 220 },
      // Sandwiches
      { id: 'm-018', cat: 'sandwiches', name: 'Sandwich kefta',       price: 50  },
      { id: 'm-019', cat: 'sandwiches', name: 'Sandwich poulet',      price: 45  },
      { id: 'm-020', cat: 'sandwiches', name: 'Sandwich thon',        price: 40  },
      { id: 'm-021', cat: 'sandwiches', name: 'Bocadillo merguez',    price: 55  },
      { id: 'm-022', cat: 'sandwiches', name: 'Wrap végé',            price: 42  },
      // Boissons
      { id: 'm-023', cat: 'boissons',   name: 'Thé à la menthe',      price: 30  },
      { id: 'm-024', cat: 'boissons',   name: 'Café noir',            price: 15  },
      { id: 'm-025', cat: 'boissons',   name: 'Café au lait',         price: 18  },
      { id: 'm-026', cat: 'boissons',   name: 'Cappuccino',           price: 22  },
      { id: 'm-027', cat: 'boissons',   name: "Jus d'orange",         price: 35  },
      { id: 'm-028', cat: 'boissons',   name: "Jus d'avocat",         price: 50  },
      { id: 'm-029', cat: 'boissons',   name: 'Eau Aïn Saïss',        price: 18  },
      { id: 'm-030', cat: 'boissons',   name: 'Coca-Cola',            price: 25  },
      // Desserts
      { id: 'm-031', cat: 'desserts',   name: 'Crème brûlée',         price: 50  },
      { id: 'm-032', cat: 'desserts',   name: 'Cornes de gazelle',    price: 35  },
      { id: 'm-033', cat: 'desserts',   name: 'Pâtisserie maison',    price: 45  },
      { id: 'm-034', cat: 'desserts',   name: 'Fruit de saison',      price: 30  },
      { id: 'm-035', cat: 'desserts',   name: 'Glace artisanale',     price: 40  },
    ] : [];
    /* ═══════════════════════════════════════════════════════════════════════
     * LA CARTE VIENT DU BUREAU
     * -----------------------------------------------------------------------
     * Le tableau de bord est le cerveau : le patron compose sa carte là-bas
     * (catégories, sous-catégories, plats, prix) et la caisse la reçoit. Elle
     * ne la compose jamais et ne la renvoie jamais · deux miroirs pour une même
     * carte, ce sont deux vérités qui divergent, et c'est la caisse qui perdrait
     * (elle lirait un cache périmé et écraserait le vrai menu du patron).
     *
     * On lit GET /api/menu?merchant=<slug>, publique et sans cookie : elle
     * existe déjà pour la page client QR, qui n'a ni compte ni session. C'est
     * pour cette raison qu'on n'ouvre PAS de document cloud sur le menu, et que
     * assets/menu-catalog.js · module du tableau de bord, qui publie · ne doit
     * pas être chargé ici.
     *
     * Miroir local rangé par slug, comme le plan de salle : hors ligne, la
     * dernière carte connue reste servie. Un comptoir sans réseau doit encore
     * pouvoir encaisser.
     * ═══════════════════════════════════════════════════════════════════════ */
    const CARTE_MIRROR = 'kiwi:menuMirror:v1:';
    /* ══════════ LES POSTES DE PRÉPARATION VIENNENT AUSSI DU BUREAU ══════════
     * Le patron déclare ses postes dans le Menu du tableau de bord (Cuisson,
     * Bar, Pâtisserie…), affecte chaque plat à l'un d'eux, et l'ordre qu'il leur
     * donne EST un réglage : le premier de sa liste reçoit les plats qu'il n'a
     * affectés à rien.
     *
     * Cet état vit ICI, à côté du lecteur de carte, et PAS dans la section écran
     * cuisine · elle est déclarée huit cents lignes plus bas, alors que
     * rebuildCarte() tourne dès l'amorçage. Y toucher d'ici lèverait une
     * ReferenceError avalée par le try/catch de l'amorçage : la carte ne se
     * chargerait jamais et rien ne le dirait. `kdsReady` dit si l'écran cuisine
     * est monté et peut être repeint.
     *
     * Les teintes sont celles que les pastilles de l'écran cuisine utilisent
     * depuis toujours : un poste doit avoir la même couleur au bureau et au
     * comptoir, sinon la pastille ne sert plus de repère. */
    const STATION_PALETTE = ['#1F5D3C', '#3FB67A', '#D99A2B', '#3677A6', '#164A2F', '#C24A2E', '#C97A4A'];
    const carteState = { stations: [], kitchenId: '', opts: [], cats: [], formulaItems: [], kdsReady: false,
      /* Les promotions de la carte (assets/menu-promos.js), posées au bureau.
         La démo en montre une sur les desserts, que les autres suites ne
         facturent jamais : leurs totaux de démo ne bougent pas. */
      promos: IS_DEMO ? [{ id: 'demo-gouter', name: "L'heure du goûter", kind: 'percent', value: 15,
        all: false, cats: ['desserts'], items: [], from: '', to: '', days: [], start: '', end: '', paused: false, createdAt: 1 }] : [] };/* Aller chercher la carte. Silencieux par construction : hors ligne ou
       serveur muet, on garde le miroir · on ne vide jamais une caisse qui
       marchait il y a une minute. */
    let _carteAt = 0;
    /* Le sondage de six secondes reconstruisait toute la grille même quand la
       carte n'avait pas bougé : une reconstruction pendant un appui avale le
       clic (et coupait l'animation d'ajout). On ne repeint que si la carte a
       changé, et jamais sous un doigt posé. */
    let _carteFingerDown = false;
    document.addEventListener('pointerdown', () => { _carteFingerDown = true; }, true);
    ['pointerup', 'pointercancel'].forEach((kind) => document.addEventListener(kind, () => {
      setTimeout(() => { _carteFingerDown = false; }, 0);
    }, true));/* « Rafraîchir » au comptoir doit ramener la carte comme il ramène le reste. */
    window.KiwiCaisseCarte = { fetch: () => fetchCarte(true), rebuild: rebuildCarte, itemCount: () => menuItems.length };
    /* Les relances sont posées au bootstrap du menu, plus bas : rebuildCarte()
       touche `activeCat` et `cart`, déclarés après ce bloc · les appeler ici
       lèverait une ReferenceError que le try/catch avalerait en silence, et la
       carte ne se chargerait jamais sans que rien ne le dise. */
    let activeCat = 'all';
    let activeSub = null;
    let cart = []; // line: { uid, id, name, price, qty, note }
    /* Stable per-line id so the same dish can sit on two lines with
       different kitchen notes (id stays = menu id for menu/station lookups). */
    let lineSeq = 0;/* À emporter · an existing board order can be re-opened in the builder
       for editing. vrapEditingNum holds its number (null = new order).
       vrapDiscount holds a manager-approved réduction on the cart. */
    let vrapEditingNum = null;
    let vrapDiscount   = null;  // { kind, value, amount, reason } | null
    let vrapResumedExpiredId = null; // id d'une commande expirée reprise en cours dans le panier
    const dismissedExpiredIds = new Set((() => {
      try { return JSON.parse(localStorage.getItem('kiwi_dismissed_expired') || '[]'); } catch (_) { return []; }
    })());/* ---- Waitlist (liste d'attente) · walk-in parties at the door ---- */
    let waitlist = [];          // [{ id, name, size, pref, addedAt }]
    let wlSeq = 0;
    let wlDraft = { name: '', size: 2, pref: 'peu-importe' };
    let wlSeating = null;       // party being seated on the Plan de salle (or null)
    /* ---- Stock & approvisionnement (cashier inventory) · resets on reload ---- */
    let stockTab = 'apercu';
    let skSearch = '', skCat = 'all', skStatus = 'all';
    let skOrderSeq = 2843;
    /* suppliers · read-only picklist (cashier picks, doesn't edit).
       A REAL store starts with an empty book (builds its own stock); only the
       local demo seeds this café's suppliers/inventory/orders. */
    const suppliers = storeIsReal() ? [] : [
      { id: 's1', name: 'Marché Central · Port',     cat: 'Frais'    },
      { id: 's2', name: 'Métro Cash & Carry',        cat: 'Épicerie' },
      { id: 's3', name: 'Boissons Atlas',            cat: 'Boissons' },
      { id: 's4', name: 'Laiterie Doukkala',         cat: 'Laitiers' },
      { id: 's5', name: 'Boucherie Zerktouni',       cat: 'Viandes'  },
      { id: 's6', name: 'Café & Torréfaction Riad',  cat: 'Café'     },
    ];
    const stockItems = storeIsReal() ? [] : [
      { id:'i1',  name:'Tomates fraîches', cat:'legumes',     unit:'kg',      supplier:'Marché Central · Port',    stock:8,  par:20, reorder:8,  cost:9 },
      { id:'i2',  name:'Oignons',          cat:'legumes',     unit:'kg',      supplier:'Marché Central · Port',    stock:22, par:25, reorder:10, cost:6 },
      { id:'i3',  name:'Pommes de terre',  cat:'legumes',     unit:'kg',      supplier:'Marché Central · Port',    stock:35, par:30, reorder:12, cost:5 },
      { id:'i4',  name:'Poulet entier',    cat:'viandes',     unit:'kg',      supplier:'Boucherie Zerktouni',      stock:6,  par:18, reorder:8,  cost:38 },
      { id:'i5',  name:'Viande hachée',    cat:'viandes',     unit:'kg',      supplier:'Boucherie Zerktouni',      stock:0,  par:12, reorder:5,  cost:75 },
      { id:'i6',  name:'Agneau épaule',    cat:'viandes',     unit:'kg',      supplier:'Boucherie Zerktouni',      stock:9,  par:10, reorder:4,  cost:90 },
      { id:'i7',  name:'Sardines',         cat:'poissons',    unit:'kg',      supplier:'Marché Central · Port',    stock:4,  par:10, reorder:4,  cost:22 },
      { id:'i8',  name:'Thé vert Gunpowder', cat:'epicerie',  unit:'kg',      supplier:'Métro Cash & Carry',       stock:7,  par:8,  reorder:3,  cost:48 },
      { id:'i9',  name:'Sucre',            cat:'epicerie',    unit:'kg',      supplier:'Métro Cash & Carry',       stock:40, par:30, reorder:12, cost:7 },
      { id:'i10', name:"Huile d'olive",    cat:'epicerie',    unit:'l',       supplier:'Métro Cash & Carry',       stock:14, par:20, reorder:8,  cost:42 },
      { id:'i11', name:'Farine',           cat:'epicerie',    unit:'kg',      supplier:'Métro Cash & Carry',       stock:26, par:25, reorder:10, cost:6 },
      { id:'i12', name:'Lait',             cat:'laitiers',    unit:'l',       supplier:'Laiterie Doukkala',        stock:11, par:24, reorder:10, cost:8 },
      { id:'i13', name:'Beurre',           cat:'laitiers',    unit:'kg',      supplier:'Laiterie Doukkala',        stock:3,  par:8,  reorder:3,  cost:62 },
      { id:'i14', name:'Œufs',             cat:'laitiers',    unit:'plateau', supplier:'Laiterie Doukkala',        stock:5,  par:14, reorder:6,  cost:34 },
      { id:'i15', name:'Café en grains',   cat:'cafe',        unit:'kg',      supplier:'Café & Torréfaction Riad', stock:9,  par:12, reorder:5,  cost:120 },
      { id:'i16', name:'Coca-Cola 33cl',   cat:'boissons',    unit:'casier',  supplier:'Boissons Atlas',           stock:6,  par:15, reorder:6,  cost:90 },
      { id:'i17', name:'Eau minérale 1L',  cat:'boissons',    unit:'casier',  supplier:'Boissons Atlas',           stock:18, par:20, reorder:8,  cost:48 },
      { id:'i18', name:'Gobelets carton',  cat:'consommables',unit:'paquet',  supplier:'Métro Cash & Carry',       stock:12, par:20, reorder:8,  cost:35 },
    ];
    const supplyOrders = storeIsReal() ? [] : [
      { id:'2841', supplier:'Boucherie Zerktouni',   items:[{name:'Poulet entier',qty:18,unit:'kg'},{name:'Viande hachée',qty:12,unit:'kg'}], total:1584, status:'confirmee',  when:'Demain · 06h' },
      { id:'2842', supplier:'Boissons Atlas',        items:[{name:'Coca-Cola 33cl',qty:10,unit:'casier'},{name:'Eau minérale 1L',qty:8,unit:'casier'}], total:1284, status:'en-attente', when:'Jeu. · 08h' },
      { id:'2838', supplier:'Marché Central · Port', items:[{name:'Tomates fraîches',qty:20,unit:'kg'},{name:'Oignons',qty:15,unit:'kg'}], total:270, status:'recue', when:'Reçue hier' },
    ];
    let skSharedStockUnsub = null;if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSharedStock);
    else bindSharedStock();/* ── Les photos des plats (assets/dishes/<clé>.webp) ───────────────────
       Des photos détourées, générées en une seule série pour garder une même
       lumière et une même échelle (25 octobre 2026). Elles remplacent 45
       dessins faits main, aux traits inégaux, que la règle des icônes (Material
       Symbols seulement) n'avait jamais admis. Le nom publié décide d'abord,
       par ses mots (DISH_WORDS, assets/caisse/catalogue.js) : les identifiants
       d'une carte publiée (it_1…) ne sont pas ceux de la démo. */
    const MENU_ART = {
      'm-001': 'salade-marocaine', 'm-002': 'briouates', 'm-003': 'harira', 'm-004': 'zaalouk',
      'm-005': 'taktouka', 'm-006': 'soup', 'm-007': 'tajine-kefta', 'm-008': 'tajine-poulet',
      'm-009': 'tajine-agneau', 'm-010': 'tajine-legumes', 'm-011': 'tajine-poisson',
      'm-012': 'couscous-royal', 'm-013': 'couscous-tfaya', 'm-014': 'couscous-legumes',
      'm-015': 'pastilla-poulet', 'm-016': 'pastilla-seafood', 'm-017': 'pastilla-pigeon',
      'm-018': 'sandwich-kefta', 'm-019': 'sandwich-poulet', 'm-020': 'sandwich-thon',
      'm-021': 'bocadillo', 'm-022': 'wrap', 'm-023': 'mint-tea', 'm-024': 'espresso',
      'm-025': 'cafe-au-lait', 'm-026': 'cappuccino', 'm-027': 'orange-juice', 'm-028': 'avocado-juice',
      'm-029': 'water', 'm-030': 'soda-cola', 'm-031': 'creme-brulee', 'm-032': 'cornes-gazelle',
      'm-033': 'patisserie', 'm-034': 'fruit', 'm-035': 'glace',
    };
    /* Un article entièrement nouveau conserve un repli cohérent avec sa
       catégorie, mais tout produit reconnu reçoit d'abord sa photo. */
    const CAT_GLYPH_RULES = [
      [/pate|pasta/, 'pasta'],
      [/viennois|boulanger/, 'croissant'],
      [/patisser/, 'patisserie'],
      [/dessert|sucre|douceur|sweet/, 'flan'],
      [/chaud|cafe|hot drink/, 'espresso'],
      [/boisson|soda|jus|drink|frais/, 'juice'],
      [/petit dej|breakfast|matin/, 'petit-dejeuner'],
      [/grill|braise/, 'brochettes'],
      [/\bmer\b|poisson|fish|seafood/, 'poisson-grille'],
      [/entree|salade|starter/, 'salad'],
      [/sandwich|pain/, 'sandwich-kefta'],
      [/snack|fast/, 'burger'],
      [/enfant|kids/, 'menu-enfant'],
      [/menu|formule/, 'combo'],
    ];/* The language module loads deferred, after this script: subscribe once it exists. */
    (function subscribeCarteLang() {
      const hook = () => {
        try {
          if (!window.KiwiCaisseLang || !window.KiwiCaisseLang.subscribe) return false;
          window.KiwiCaisseLang.subscribe(function () { try { renderCatPills(); renderMenu(); renderCart(); } catch (_) {} });
          /* The menu translations (menu-i18n.js) are deferred as well: the first
             paint named the categories in French. Repaint once both are here. */
          if (carteLang() !== 'fr') { try { renderCatPills(); renderMenu(); } catch (_) {} }
          return true;
        } catch (_) { return false; }
      };
      if (!hook()) document.addEventListener('DOMContentLoaded', hook, { once: true });
    })();let optVeil = null;(function () {
      const mlToggle = $('#mlibre-toggle');
      const mlPad = $('#mlibre-pad');
      const mlDisplay = $('#mlibre-display');
      const mlAdd = $('#mlibre-add');
      if (!mlToggle || !mlPad) return;
      let buf = '';
      const val = () => parseFloat(buf.replace(',', '.')) || 0;
      function paint() {
        mlDisplay.textContent = buf ? buf.replace('.', ',') : '0';
        mlAdd.disabled = !(val() > 0);
      }
      mlToggle.addEventListener('click', () => {
        const open = mlPad.hidden;
        mlPad.hidden = !open;
        mlToggle.classList.toggle('is-open', open);
        mlToggle.setAttribute('aria-expanded', String(open));
      });
      mlPad.addEventListener('click', (e) => {
        const key = e.target.closest('[data-mk]');
        if (!key) return;
        const k = key.dataset.mk;
        if (k === 'back') buf = buf.slice(0, -1);
        else if (k === '.') { if (!buf.includes('.')) buf = (buf || '0') + '.'; }
        else if (buf.replace('.', '').length < 6) buf += k;
        paint();
      });
      mlAdd.addEventListener('click', () => { addOpenLine(val()); buf = ''; paint(); });
      paint();
    })();/* ── kiwiSkin2027:till · le menu et l'addition sur le kit ──────────────────
       (assets/kit/till-frame.js, étape 4 (1)). Drapeau éteint, le kit n'est pas
       chargé et rien de ceci ne tourne. Allumé : <k-menu-grid> prend la place de
       la grille et <k-bill> celle du volet de l'addition, dessinés depuis le
       MÊME état que les livrés (menuItems, cart, tableOrders, generateOrder) :
       chaque fonction qui repeint la grille ou le volet repeint aussi le kit.
       Chaque geste revient ici par son nom et part dans les fonctions livrées
       (addToCart, changeCartLineQty, changeTableOrderLineQty,
       cancelCaisseLineImmediately, validateOrder). Encaisser, diviser et la
       remise ouvrent encore les fenêtres livrées, jusqu'aux étapes 4 (2) et
       4 (3). Une part de formule se change par sa formule, comme au livré. */
    let tillKit = false;let tillKitOverflowPop = null;/* L'encaissement dans le volet (étape 4 (2)). <k-pay> dessine et rapporte ;
       la vente passe par finalizeTender, la même frontière que les fenêtres
       livrées espèces et carte, avec le pourboire posé dans leur état
       (payTipMode). Carte : enregistrement seul, le terminal est ailleurs
       (§10.25). Autre : la méthode `wallet` (§9.6, pay.other). */
    const TILL_KIT_METHOD = { cash: 'cash', card: 'card', other: 'wallet' };/* La division dans le volet (étape 4 (4), §10.30). <k-split> choisit le
       mode et les parts ; la caisse bâtit le même flux que la fenêtre livrée
       (openSplitModal, gardée fermée, puis launchSplitFlow, avec ses gardes et
       leurs messages), et chaque part passe par le volet d'encaissement pour
       son montant, enregistrée par markSplitPartPaid comme au livré. Une part
       vide par article n'existe pas au livré : tillKitShareMap relie le numéro
       de part du kit à la part livrée. */
    let tillKitShare = null, tillKitShareMap = null;/* La remise dans le volet (étape 4 (4), §10.31). <k-discount> choisit le
       mode, la valeur et le motif ; remiseState reçoit le même état que la
       fenêtre livrée et applyRemise() fait le reste : politique des
       pourcentages, accord du responsable (requireManager), plafond au
       montant de l'addition. Le motif voyage par son libellé livré, que
       discountReasonCode() ramène au code du serveur. */
    const TILL_KIT_REASON = { commercial: 'Geste commercial', 'loyal-customer': 'Client habitué', 'kitchen-error': 'Erreur cuisine', other: 'Autre' };/* Le rail et Plus (étape 4 (10), §18.3). Un élément du rail, une ligne de
       Plus n'existe que si son contrôle livré existe et n'est pas éteint
       (merchant-config pose [hidden] sur une fonction désactivée) : la
       ligne déclenche ce contrôle, rien n'est refait. Plus porte TOUS les
       gestes de l'ancienne barre latérale, rangés comme §18.3 les range
       (le poste, la gestion, cet appareil), en attendant leurs places
       définitives (§12). */
    const TILL_KIT_MORE = [
      ['till.more.shift', [
        ['open_drawer', 'till.more.open_drawer', '[data-action="open-drawer"]'],
        ['cash_in_out', 'till.more.cash_in_out', '[data-action="cash-move"]'],
        ['shift_change', 'till.more.shift_change', '[data-action="passation"]'],
        ['cancel_sale', 'till.more.cancel_sale', '[data-action="cancel-sale"]'],
        ['refund', 'till.more.refund', '[data-action="remboursement"]'],
        ['sales', 'till.more.sales', '#stat-txns-card'],
        ['team', 'till.more.team', '#open-team'],
        ['attendance', 'attendance.show', '#open-attendance-code'],
        ['close', 'till.more.close', '[data-action="fin-service"]'],
      ]],
      ['till.more.manage', [
        ['menu', 'till.more.menu', '#open-menu-availability'],
        ['stock', 'till.more.stock', '#open-stock'],
        ['loyalty', 'till.more.loyalty', '.rail-links [data-kcb-navitem]'],
        ['printer', 'till.more.printer', '#open-kitchen-print'],
      ]],
      ['till.more.device', [
        ['fullscreen', 'till.more.fullscreen', '#fs-toggle'],
        ['reload', 'till.more.reload', null],
        ['device_id', 'till.more.device_id', '#caisse-terminal-id'],
      ]],
    ];
    const TILL_KIT_CLIENTS = '.rail-links [data-kcb-navitem]';/* Plus REMPLACE le rail par la barre latérale livrée (propriétaire,
       2026-10-16) : la feuille rangeait les mêmes gestes sans icônes et sans
       ordre connu, et un second panneau à côté du rail ne faisait que serrer
       l'écran. La barre noire prend la place du rail et porte à sa tête, sous
       le même logo, les mêmes cinq destinations — un <k-sidebar> peint des
       mêmes éléments que le rail, Moins compris. On en sort par Moins, par un
       toucher ailleurs (le voile le prend, aucun geste ne tombe sur une
       tuile) ou par Échap. La feuille reste la route du téléphone (§18.3). */
    let tillKitMoreOpen = false, tillKitMoreNav = null;/* La synchronisation (étape 4 (11), §10.26). tillKitSyncRows() tire de
       l'état livré (KiwiLive, le journal, la dernière sauvegarde du service)
       les lignes 1 à 9, triées, aucune n'en cache une autre. Le rail montre
       l'icône de la première et un seul badge, le compte de la première des
       lignes 3 et 4 ; une seule bannière, la première des lignes 1 et 2 ;
       les lignes 3 et 4 s'annoncent poliment une fois, quand elles
       s'appliquent, jamais sur un changement de compte ; sync.saved_again
       quand la dernière des lignes 1 et 2 tombe. Sous le verrou de magasin,
       tout est calculé, rien n'est dessiné ni annoncé (R7). */
    let tillKitSave = null;            // le dernier oui / non de persistShift()
    let tillKitAllSentUntil = 0, tillKitHadQueue = false, tillKitPrev = {}, tillKitSending = false;/* The indicator's popover: every applicable row, and Send now when sales
       wait on this till only (row 4). Send now replays the journal by the
       same stable ids (reconcileJournalSales), then flushes; nothing goes
       back to recordSale. */
    let tillKitSyncPop = null;/* Peint tout de suite, puis une fois encore à l'image suivante : le
       volet livré se montre souvent JUSTE APRÈS sa fonction de rendu (une
       table ouverte au plan : renderRightPanel, puis #rp-active visible), et
       l'addition du kit lirait un volet encore fermé. Les signatures de
       till-frame.js rendent la seconde peinture gratuite quand rien n'a bougé. */
    let tillKitFramePending = false;if (document.documentElement.getAttribute('data-skin-2027') === 'till') {
      renderMenu = tillKitAfter(renderMenu);
      renderCart = tillKitAfter(renderCart);
      renderOrderPanel = tillKitAfter(renderOrderPanel);
      renderRightPanel = tillKitAfter(renderRightPanel);
      showEmpty = tillKitAfter(showEmpty);
      setMode = tillKitAfter(setMode);
      openKds = tillKitAfter(openKds);
      closeKds = tillKitAfter(closeKds);
      const persistShiftShipped = persistShift;
      persistShift = function () {
        const r = persistShiftShipped.apply(this, arguments);
        if (r === true || r === false) tillKitSave = r;
        try { tillKitSync(); } catch (_) {}
        return r;
      };
      ['kiwi:sale-queue', 'kiwi:money-sync', 'online', 'offline'].forEach((ev) => window.addEventListener(ev, () => { try { tillKitSync(); } catch (_) {} }));
      /* Le kit arrive en scripts différés, après ce script : on peint une
         première fois quand il est là. */
      document.addEventListener('DOMContentLoaded', () => { try { tillKitPaint(); } catch (e) { console.warn('[till-kit]', e); } });
    }/* kiwiSkin2027:till · le fond d'ouverture sur le kit (étape 4 (13), §18.9).
       « Ouvrir la caisse » ouvre <k-cash-count mode="open"> : le fond est ce
       que le caissier COMPTE, rien n'est prérempli ; le dernier fond n'est
       qu'une puce à toucher (count.same_as_last, la même mémoire que les
       puces livrées). Ouvrir pose openingFloat puis reprend openService() :
       contrôle horaire, doOpenService(), l'évènement d'ouverture. Commit
       part sur l'écriture locale, dans doOpenService(). */
    let tillKitFloat = null;/* Event delegation: tables, menu items, cart qty, cat pills */
    document.addEventListener('click', (e) => {
      /* La pastille « commande en attente » ouvre la file, pas la table : ce
         que le caissier veut à cet instant, c'est LIRE ce qui a été commandé
         puis l'accepter · ouvrir l'addition de la table ne le lui montre pas. */
      const opBadge = e.target.closest('.cplan-order');
      if (opBadge) {
        e.stopPropagation();
        try { if (window.KiwiOrderInbox) KiwiOrderInbox.open(); } catch (_) {}
        return;
      }
      // Tables (only in salle mode)
      const tableEl = e.target.closest(TBL_SEL);
      if (tableEl && mode === 'salle') {
        const id = tableEl.dataset.table;
        const t = tables[id];
        if (!t) return;
        /* A plan refresh used to be able to repaint an OrderPro table as
           empty while its canonical bill/pending badge still existed. The
           durable order evidence wins at click time too, so the cashier can
           never be asked to open a second visit over the guest's order. */
        if (t.status === 'khawya' && ((tableOrders[id] || []).length
            || phoneSeats.has(tableKey(id)) || phonePending.has(tableKey(id)))) {
          t.status = 'ka-yaklo';
          refreshTableNode(id);
        }
        if (wlSeating) {  // choosing a table for a waitlist party
          if (t.status === 'khawya') seatPartyAt(id);
          else toast('Table occupée, choisis une table libre');
          return;
        }
        if (t.status === 'khawya')  { openNewTableModal(id); return; }
        if (t.status === 'khlass')  { return; }
        if (t.status === 'a-commander' || (!orders[id]?.length && !tableOrders[id]?.length && t.status !== 'bgha-ykhlass')) {
          resumeTableOrder(id);
          return;
        }
        openTable(id);
        return;
      }

      // Cat pills
      const catBtn = e.target.closest('.cat-pill[data-cat]');
      if (catBtn) {
        activeCat = catBtn.dataset.cat;
        activeSub = null;
        renderCatPills();
        renderMenu();
        return;
      }

      // Stepper buttons inside a menu card (− / +) · check BEFORE the card click
      const stepBtn = e.target.closest('.step-btn');
      if (stepBtn) {
        const card = stepBtn.closest('.menu-item');
        if (card) {
          const mid = card.dataset.menuId, inc = stepBtn.dataset.step === 'inc';
          if (mode === 'order') {
            if (selectedId) {
              inc ? addToTableOrder(selectedId, mid) : tableOrderMinusMenu(selectedId, mid);
            } else {
              toast('Aucune table sélectionnée');
              backToSalle();
            }
          } else {
            inc ? addToCart(mid) : cartMinusMenu(mid);
          }
        }
        return;
      }

      // « Souvent avec… » → même ajout qu'un toucher sur la carte du plat.
      const pairAdd = e.target.closest('[data-pair-add]');
      if (pairAdd) {
        const id = pairAdd.dataset.pairAdd;
        if (mode === 'order') { if (selectedId) addToTableOrder(selectedId, id); }
        else addToCart(id);
        return;
      }
      const pairNo = e.target.closest('[data-pair-dismiss]');
      if (pairNo) {
        const scope = pairNo.closest('[data-pair-scope]')?.dataset.pairScope || 'cart';
        try { KiwiPairs.dismiss(scope, pairNo.dataset.pairDismiss); } catch (_) {}
        if (mode === 'order') { if (selectedId) renderOrderPanel(selectedId); } else renderCart();
        return;
      }

      // Menu card body → add one (to table order or cart depending on mode)
      const menuCard = e.target.closest('.menu-item');
      if (menuCard && menuCard.classList.contains('is-86')) { toast('Plat épuisé · retiré de la vente'); return; }
      if (menuCard) {
        if (mode === 'order') {
          if (selectedId) {
            addToTableOrder(selectedId, menuCard.dataset.menuId);
          } else {
            toast('Aucune table sélectionnée');
            backToSalle();
          }
        } else {
          addToCart(menuCard.dataset.menuId);
        }
        return;
      }

      // One tap on − cancels exactly one sent item. The paired caisse is the
      // authorization; no per-item reason dialog or PIN is required.
      const tableVoidBtn = e.target.closest('[data-table-void]');
      if (tableVoidBtn && selectedId) {
        const line = (tableOrders[selectedId] || []).find(l => l.uid === tableVoidBtn.dataset.tableVoid);
        if (line && line.sent) cancelCaisseLineImmediately(selectedId, line);
        return;
      }

      const holdBtn = e.target.closest('[data-hold-uid]');
      if (holdBtn) {
        if (mode === 'order' && selectedId) toggleLineHold(selectedId, holdBtn.dataset.holdUid);
        return;
      }

      // Cart qty +/- buttons (vente rapida) · one specific line by uid
      const qtyBtn = e.target.closest('.qty-btn');
      if (qtyBtn) {
        const d = qtyBtn.dataset.cartAction === 'inc' ? 1 : -1;
        const row = qtyBtn.closest('[data-cart-uid]');
        if (row) changeCartLineQty(row.dataset.cartUid, d);
        const oRow = qtyBtn.closest('[data-order-uid]');
        if (oRow && mode === 'order' && selectedId) changeTableOrderLineQty(selectedId, oRow.dataset.orderUid, d);
        return;
      }
    });
    /* Per-dish kitchen note typed into a line · persist without re-rendering
       (so focus stays); the note then routes with that dish to its station. */
    document.addEventListener('input', (e) => {
      const inp = e.target.closest('.rp-item-note');
      if (!inp) return;
      const uid = inp.dataset.noteUid;
      const list = (mode === 'order' && selectedId) ? (tableOrders[selectedId] || []) : cart;
      const line = list.find(l => l.uid === uid);
      if (line) {
        line.note = inp.value;
        inp.classList.toggle('has-note', !!inp.value.trim());
      }
    });
    document.addEventListener('keydown', (e) => {
      const a = document.activeElement;
      if ((e.key === 'Enter' || e.key === ' ') && (a?.matches?.(TBL_SEL) || a?.matches?.('.menu-item'))) {
        e.preventDefault();
        a.click();
      }
    });/* Event delegation inside Order Review Modal */
    document.addEventListener('click', (e) => {
      // Open modal triggers
      if (e.target.closest('#rp-expand-btn') || e.target.closest('#rp-head-info')) {
        openOrderReviewModal();
        return;
      }
      // Close modal triggers
      if (e.target.closest('#or-modal-close') || e.target.closest('#or-btn-back')) {
        closeOrderReviewModal();
        return;
      }

      // Action inside review modal: stepper dec / inc
      const stepBtn = e.target.closest('.or-stepper-btn');
      if (stepBtn) {
        const row = stepBtn.closest('[data-review-uid]');
        if (!row) return;
        const uid = row.dataset.reviewUid;
        const d = stepBtn.dataset.reviewAction === 'inc' ? 1 : -1;
        if (mode === 'vrap') {
          changeCartLineQty(uid, d);
        } else if (selectedId) {
          changeTableOrderLineQty(selectedId, uid, d);
        }
        renderOrderReviewContent();
        return;
      }

      // Action inside review modal: edit an unsent formula as one bundle
      const editFormulaBtn = e.target.closest('.or-item-edit-btn');
      if (editFormulaBtn) {
        const row = editFormulaBtn.closest('[data-review-uid]');
        if (row) editFormulaLine(row.dataset.reviewUid);
        return;
      }

      // The full bill follows the same one-tap rule as the compact bill.
      const voidBtn = e.target.closest('.or-item-void-btn[data-review-action="void"]');
      if (voidBtn && selectedId) {
        const row = voidBtn.closest('[data-review-uid]');
        const line = row && (tableOrders[selectedId] || []).find(item => item.uid === row.dataset.reviewUid);
        if (line && line.sent) {
          closeOrderReviewModal();
          cancelCaisseLineImmediately(selectedId, line);
        }
        return;
      }

      // Action inside review modal: delete item line
      const delBtn = e.target.closest('.or-item-del-btn');
      if (delBtn) {
        const row = delBtn.closest('[data-review-uid]');
        if (!row) return;
        const uid = row.dataset.reviewUid;
        if (mode === 'vrap') {
          cart = removeGroupedLine(cart, uid);
          renderMenu();
          renderCart();
        } else if (selectedId && tableOrders[selectedId]) {
          tableOrders[selectedId] = removeGroupedLine(tableOrders[selectedId], uid);
          renderMenu();
          renderOrderPanel(selectedId);
        }
        renderOrderReviewContent();
        return;
      }

      // Kitchen dispatch from review modal
      if (e.target.closest('#or-btn-kitchen')) {
        closeOrderReviewModal();
        if (mode === 'vrap') {
          const btn = $('#rp-send-kitchen');
          if (btn) btn.click();
        } else if (selectedId) {
          validateOrder(selectedId);
        }
        return;
      }

      // Pay button from review modal
      if (e.target.closest('#or-btn-pay')) {
        closeOrderReviewModal();
        if (mode === 'vrap') {
          const btn = $('#pay-charge');
          if (btn) btn.click();
        } else if (selectedId) {
          const btn = mode === 'order' ? $('#pay-charge-order') : $('#pay-charge');
          if (btn) btn.click();
        }
        return;
      }
    });
    // Kitchen note inputs inside review modal
    document.addEventListener('input', (e) => {
      const inp = e.target.closest('.or-note-input');
      if (!inp) return;
      const uid = inp.dataset.reviewNoteUid;
      const list = (mode === 'order' && selectedId) ? (tableOrders[selectedId] || []) : cart;
      const line = list.find(l => l.uid === uid);
      if (line) {
        line.note = inp.value;
        const sideInp = document.querySelector(`.rp-item-note[data-note-uid="${uid}"]`);
        if (sideInp) {
          sideInp.value = inp.value;
          sideInp.classList.toggle('has-note', !!inp.value.trim());
        }
      }
    });
    /* ---------- Right panel actions ---------- */
    $('#rp-close').addEventListener('click', () => {
      if (mode === 'vrap') {
        // Clear the working cart entirely
        clearCart();
        return;
      }
      /* LA CROIX, EN MODE COMMANDE. Elle tombait jusqu'ici dans closeRightPanel()
         · écrit pour la salle · qui efface la table sélectionnée et laisse le
         mode en place : la caisse se bloquait (voir backToSalle). Une mesa
         ouverte par erreur, client pas encore prêt à commander, doit se refermer
         ici : c'est ce que le geste promet. Dès qu'il y a des plats saisis on ne
         les jette pas d'un doigt distrait · le panneau reste, et le serveur
         tranche lui-même entre envoyer et annuler. */
      if (mode === 'order') {
        if (orderInProgressCount() > 0) { toast('Valide ou annule la commande d\'abord'); return; }
        cancelNewOrder();
        return;
      }
      // Salle mode: just close the panel · the table keeps its real status.
      closeRightPanel();
    });
    $('#pay-split').addEventListener('click', () => {
      if (mode === 'vrap') {
        if (!cart.length) { toast('Commande vide'); return; }
        openSplitModal(null);
        return;
      }
      if (selectedId) openSplitModal(selectedId);
    });$$('.meta-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        // 'discount' is handled by the [data-action] delegation listener below.
        if (a === 'print-bill') {
          var _lines = Array.prototype.slice.call(document.querySelectorAll('#rp-items > *')).map(function (row) {
            var q = row.querySelector('.rp-item-qty'); var n = row.querySelector('.rp-item-name'); var p = row.querySelector('.rp-item-price');
            var name = n ? n.textContent.trim() : '';
            return name ? { qty: (q ? q.textContent.replace('×', '').trim() : ''), name: name, price: (p ? p.textContent.trim() : '') } : null;
          }).filter(Boolean);
          var _ticket = {
            title: (document.getElementById('rp-table') ? document.getElementById('rp-table').textContent.trim() : 'Reçu Kiwi'),
            lines: _lines,
            total: (document.getElementById('rp-total') ? document.getElementById('rp-total').textContent.trim() : '')
          };
          window.__lastTicket = _ticket;
          printHardwareTicket(_ticket);
        }
        else if (a === 'reprint-bill') {
          /* Ce bouton rejouait window.__lastTicket · une variable de page. Elle
             ne survit ni au rechargement, ni à la mise à jour du service worker,
             ni à l'onglet que iOS tue en arrière-plan. Après midi, le moment
             exact où l'on réimprime, il répondait « Aucun ticket » sur une
             caisse qui avait encaissé toute la matinée.
             Le journal, lui, est écrit. On y prend la dernière vente et on
             ressort SON ticket : même numéro, même heure, mention de duplicata.
             Repli sur l'ancien chemin si le journal est vide mais qu'un ticket
             vient d'être tiré dans cette page · un service qui vient d'ouvrir. */
          const last = journal.slice().reverse().find((e) => e && e.kind !== 'refund' && e.amount > 0);
          const doc = last ? receiptDocFor(last, { copy: true }) : null;
          if (doc) {
            toast('Impression du reçu…');
            Promise.resolve(window.KiwiReceipt.print(doc)).then(
              (r) => toast(r && r.ok ? 'Duplicata imprimé' : 'Impression échouée'),
              () => toast('Impression échouée')
            );
          }
          else if (window.__lastTicket) printHardwareTicket(window.__lastTicket);
          else toast('Aucun ticket à réimprimer');
        }
        else if (a === 'cancel-table') {
          if (mode === 'order') {
            // Building a new mesa · cancel it properly (drops the order, back to Salle)
            cancelNewOrder();
            return;
          }
          if (mode === 'vrap') {
            /* ── VIDER UNE COMMANDE EST UNE PERTE, PAS UNE NAVIGATION ───────
             * Un seul tap effaçait le panier · et, depuis la reprise d'une
             * expirée, une vente déjà chiffrée · sans demander à personne et
             * sans que rien ne dise QUI l'avait fait. Le bouton est rouge mais
             * il n'était gardé par rien.
             *
             * On passe donc par la même porte que les autres gestes sensibles
             * (requireTillOperator › KiwiCaissePairing.authorizeTill ›
             * POST /api/pin/verify) : le code de l'employé est jugé PAR LE
             * SERVEUR, la caisse ne le compare jamais elle-même, et un serveur
             * injoignable répond non — une autorisation qu'on ne peut pas
             * prouver n'est pas une autorisation.
             *
             * La destruction vit ENTIÈREMENT dans le rappel : code refusé,
             * réseau coupé, pavé fermé au doigt mouillé · le panier est encore
             * là. Et un panier vide ne réclame rien : on ne fait pas frapper un
             * code pour ne rien perdre. */
            const editingOrder = vrapEditingNum != null
              ? kdsOrders.find(x => x && x.num === vrapEditingNum) : null;
            const liveOrder = !!(editingOrder && editingOrder.opId && !editingOrder.paid);
            if (!liveOrder && !cart.length) { clearCart(); return; }
            window.KiwiAuthAct?.(liveOrder ? { kind: 'cancel_order', key: 'act.cancel_order', args: { order: ticketNo(editingOrder) } } : { kind: 'clear_order', key: 'act.clear_order' });
            requireTillOperator(
              liveOrder ? `Annuler la commande ${ticketNo(editingOrder)}` : 'Vider la commande',
              (who) => {
                if (liveOrder) {
                  cancelOrderProTakeaway(editingOrder, who);
                  return;
                }
                clearCart();
                const by = who && who.name ? ` · ${who.name}` : '';
                toast(`Commande vidée${by}`);
              },
              /* Annuler une commande déjà partie est une écriture serveur sans
                 file d'attente : sans connexion, pas de code. Vider un panier
                 local, lui, n'a besoin de personne. */
              liveOrder ? TILL_NEEDS_SERVER : undefined
            );
            return;
          }
          if (selectedId) {
            if (storeIsReal()) {
              const tid = selectedId;
              window.KiwiAuthAct?.({ kind: 'cancel_table', key: 'act.cancel_table', args: { table: tid } });
              requireTillOperator(`Annuler la table ${tid} et prévenir la cuisine`, async (who) => {
                try { await cancelSentTable(tid, who); }
                catch (err) { toast(`Table ${tid} conservée · ${err.message || 'annulation non transmise'}`); }
              }, tableCancelNeedsServer(tid) ? TILL_NEEDS_SERVER : undefined);
              return;
            }
            /* A guest can open a table from the NFC menu, browse, then leave
               without ordering. In that case this button clears the local
               table and closes its OrderPro session after identifying the actor.
               If items have been entered (an unsent order), cancelling is a loss:
               it must pass through requireTillOperator. A meal already sent
               to the kitchen remains protected outright. */
            if (tableSentCount(selectedId) === 0) {
              const hasItems = (tableOrders[selectedId] || []).length > 0;
              if (!hasItems) {
                cancelOpenTable(selectedId);
                return;
              }
              const tid = selectedId;
              window.KiwiAuthAct?.({ kind: 'cancel_table', key: 'act.cancel_table', args: { table: tid } });
              requireTillOperator(`Annuler la table ${tid}`, (who) => {
                cancelOpenTable(tid, who);
                const by = who && who.name ? ` · ${who.name}` : '';
                toast(`Table ${tid} annulée${by}`);
              });
              return;
            }
            const tid = selectedId;
            window.KiwiAuthAct?.({ kind: 'cancel_table', key: 'act.cancel_table', args: { table: tid } });
            requireTillOperator(`Annuler la table ${tid} et prévenir la cuisine`, async (who) => {
              try {
                await cancelSentTable(tid, who);
              } catch (err) {
                toast(`Table ${tid} conservée · ${err.message || 'annulation non transmise'}`);
              }
            }, tableCancelNeedsServer(tid) ? TILL_NEEDS_SERVER : undefined);
          }
        }
      });
    });
    $$('.qa-btn, .act-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        const f = btn.dataset.feature;
        if (f && isFeatureOff(f)) return;
        if (a === 'remboursement' && (isFeatureOff('remboursement') || isFeatureOff('refund'))) return;
        if (a === 'open-drawer' && (isFeatureOff('open-drawer') || isFeatureOff('openDrawer'))) return;
        if (a === 'cash-move' && (isFeatureOff('cash-move') || isFeatureOff('cashMove'))) return;
        if (a === 'passation' && isFeatureOff('passation')) return;
        if (a === 'cancel-sale') {
          window.KiwiPosReprint?.provide?.('restaurant', () => journal.filter(entry => entry
            && entry.kind !== 'refund' && entry.amount > 0).map(entry => ({
              saleId: String(entry.serverSaleId || window.KiwiLive?.saleIdFor?.(entry, currentMerchantSlug()) || entry.id || ''),
              ts: entry.time instanceof Date ? entry.time.getTime() : new Date(entry.time).getTime(),
              total: money(Number(entry.amount || 0) + Number(entry.tip || 0)),
              ref: entry.ref || '', label: entry.label || '', method: entry.method || '',
              lines: entry.lines || [], voided: !!entry.voided,
              reopenSnapshot: entry.reopenSnapshot || null,
            })));
          window.KiwiPosReprint?.open?.('restaurant', { mode: 'cancel' });
        }
        else if (a === 'remboursement')   openRefund();
        else if (a === 'open-drawer') openDrawerNoSale();
        else if (a === 'cash-move')  openCashMove();
        else if (a === 'passation')  openHandover();
        else if (a === 'fin-service') openCloture();
        else if (a === 'attendance-code') openAttendanceCode();
        else if (a === 'stock') openStock();
        else if (a === 'clients') {
          if (window.KiwiClientsBook && typeof window.KiwiClientsBook.open === 'function') {
            window.KiwiClientsBook.open(btn);
          }
        }
      });
    });
    /* ---------- CARD modal ---------- */
    const cardModal = $('#card-modal');
    const reader = {
      disc: $('#reader-disc'),
      status: $('#reader-status'),
      method: $('#reader-method'),
      foot: $('#card-foot'),
      confirm: $('#card-confirm'),
    };
    let cardSuccessTimer = null;
    let cardAttemptSeq = 0;
    let cardPaymentCommitted = false;
    let cashPaymentCommitted = false;
    let tenderInFlight = false;
    /* ---------- Pourboire (tip) on regular card / cash payments ----------
       Split parts keep their own tip (splitState) · this is only applied
       when splitPayCallback is null. currentTotal() stays the base; the tip
       is added on top wherever the customer-facing figure is shown/recorded. */
    let payTipMode = '0';     // '0' | '5' | '10' | '15' | 'autre'
    let payTipCustom = 0;// Tip chip clicks (both modals routed through one delegated listener).
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-pay-tip]');
      if (!chip) return;
      payTipMode = chip.dataset.payTip;
      if (payTipMode === 'autre') {
        const open = $('#card-modal').classList.contains('is-open') ? 'card' : 'cash';
        setTimeout(() => { const inp = $('#' + open + '-tip-input'); if (inp) inp.focus(); }, 60);
      }
      applyPayTipChange();
    });
    // Custom tip % input (both modals share one delegated listener).
    document.addEventListener('input', (e) => {
      if (e.target.id === 'card-tip-input' || e.target.id === 'cash-tip-input') {
        const raw = parseFloat(e.target.value);
        payTipCustom = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
        if (String(e.target.value) !== '' && +e.target.value !== payTipCustom) e.target.value = payTipCustom;
        applyPayTipChange();
      }
    });
    /* Le QR passe par le modal carte mais doit s'enregistrer comme 'qr' au
       journal · sinon chaque paiement mobile compte comme une carte. */
    let cardTenderMethod = 'card';/* Le caissier confirme que le client a payé sur son terminal : c'est cet
       acte, et lui seul, qui écrit la vente carte. */
    if (reader.confirm) reader.confirm.addEventListener('click', () => {
      if (cardPaymentCommitted || tenderInFlight || !cardModal.classList.contains('is-open')) return;
      const hw = window.KiwiHardware;
      if (!hw || !hw.authorizeCard) return;
      const attempt = cardAttemptSeq;
      reader.confirm.disabled = true;
      Promise.resolve(hw.authorizeCard(currentTotal() + payTipAmount(), reader.disc, reader.status, { cashierConfirmed: true }))
        .then((result) => {
          reader.confirm.disabled = false;
          if (attempt !== cardAttemptSeq || !cardModal.classList.contains('is-open')) return;
          if (result && result.approved) triggerCardSuccess(result);
        }, () => { reader.confirm.disabled = false; });
    });
    $('#pay-card').addEventListener('click', openCardModal);
    const payQrButton = $('#pay-qr');
    if (payQrButton) payQrButton.addEventListener('click', function () {
      /* No QR provider/intent exists in the hardware bridge yet. Reusing the card
         authorizer painted a QR icon but charged the card path · a false success. */
      toast('Paiement QR indisponible · configurez un fournisseur QR');
    });
    cardModal.addEventListener('click', (e) => {
      /* Toucher le fond ne valide jamais l'encaissement : seule l'approbation
       * du lecteur déclenche finalizeTender(), puis le reçu et la fermeture. */
      if (e.target === cardModal) closeCardModal();
      const action = e.target.closest('[data-modal-action]')?.dataset.modalAction;
      if (action === 'close') closeCardModal();
    });
    /* ---------- CASH modal ---------- */
    const cashModal = $('#cash-modal');
    const cashInput = $('#cash-received');
    const cashRendu = $('#cash-rendu');
    const cashRenduVal = $('#cash-rendu-val');
    const cashConfirm = $('#cash-confirm');
    const cashStepInput = $('#cash-step-input');
    // When a split part is being paid, this overrides currentTotal()
    let cashAmountOverride = null;const payCashButton = $('#pay-cash');
    if (payCashButton) payCashButton.addEventListener('click', openCashModal);
    cashInput.addEventListener('input', updateRendu);
    /* « Encaisser » · le geste principal (Slice A). En vente rapide il ouvre
       le flux espèces ; en prise de commande il envoie d'abord les lignes en
       cuisine, puis ouvre le même flux. */
    $('#pay-charge').addEventListener('click', () => {
      if (!(currentTotal() > 0)) { toast('Addition vide'); return; }
      openCashModal();
    });
    $('#pay-charge-order').addEventListener('click', () => {
      if (!selectedId) return;
      if (tableHasOpenSplit(selectedId)) { toast('Un split est en cours sur cette table : reprenez-le depuis l\'addition'); return; }
      if (orderInProgressCount() > 0) validateOrder(selectedId);
      if (currentTotal() > 0) openCashModal();
      else toast('Addition vide');
    });
    /* Le total vit dans #rp-total ; on le recopie sur les deux boutons
       Encaisser (observer, pas de deuxième source de vérité). */
    (function () {
      const src = document.getElementById('rp-total');
      const t1 = document.getElementById('pay-charge-total');
      const t2 = document.getElementById('pay-charge-order-total');
      if (!src) return;
      const sync = () => { const v = src.textContent.trim(); if (t1) t1.textContent = v; if (t2) t2.textContent = v; };
      new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
      sync();
    })();
    /* Un tap RÈGLE le montant reçu (façon Loyverse) : « Exact » = le dû,
       un billet = sa valeur. Les presets des autres modales (data-cm-add,
       data-ho-add, data-ho-vadd) gardent leurs propres handlers. */
    $$('.cash-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.set || btn.disabled) return;
        const due = currentTotal() + payTipAmount();
        cashInput.value = btn.dataset.set === 'exact' ? money(due) : parseFloat(btn.dataset.set);
        updateRendu();
      });
    });
    cashConfirm.addEventListener('click', async () => {
      // Customer owes base + pourboire; rendu is the change off that.
      const total = Math.round((currentTotal() + payTipAmount()) * 100) / 100;
      const got = Math.round((parseFloat(String(cashInput.value).replace(',', '.')) || 0) * 100) / 100;
      if (cashPaymentCommitted || got < total) return;
      const change = Math.round((got - total) * 100) / 100;
      cashPaymentCommitted = true;
      cashConfirm.disabled = true;
      tenderInFlight = true;
      let settled;
      try { settled = await finalizeTender('cash'); }
      catch (_) { tenderInFlight = false; toast('Encaissement à vérifier dans le journal avant de réessayer'); return; }
      tenderInFlight = false;
      if (settled === 'split') {
        if (change > 0) toast('Monnaie à rendre : ' + fmtMAD(change));
        closeCashModal();
        return;
      }
      const sale = lastSaleEntry();
      closeCashModal();
      openCashDrawer();
      if (change > 0) toast('Monnaie à rendre : ' + fmtMAD(change));
      printSaleTicket(sale);
    });
    cashModal.addEventListener('click', (e) => {
      if (e.target === cashModal) closeCashModal();
      const action = e.target.closest('[data-modal-action]')?.dataset.modalAction;
      if (action === 'close') closeCashModal();
    });/* Dismiss modal on backdrop tap (click outside the modal window) */
    document.addEventListener('click', (e) => {
      if (!e.target || !e.target.classList) return;
      if (e.target.classList.contains('modal-veil') && e.target.classList.contains('is-open')) {
        dismissModalVeil(e.target);
      } else if (e.target.classList.contains('cloture-veil') && e.target.classList.contains('is-open')) {
        e.target.classList.remove('is-open');
      } else if (e.target.classList.contains('drawer-veil') && e.target.classList.contains('is-open')) {
        dismissModalVeil(e.target);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-veil.is-open, .drawer-veil.is-open, .cloture-veil.is-open');
        if (openModal) dismissModalVeil(openModal);
      }
      if (e.key === 'Enter' && cashModal.classList.contains('is-open') && !cashStepInput.hidden) {
        if (!cashConfirm.disabled) { e.preventDefault(); cashConfirm.click(); }
        return;
      }
      if (!['F2', 'F3', 'F4'].includes(e.key) || e.repeat) return;
      const target = e.target;
      if (target && (target.matches?.('input,textarea,select') || target.isContentEditable)) return;
      if (!document.body.classList.contains('is-unlocked')) return;
      if (document.querySelector('.modal-veil.is-open, .drawer.is-open')) return;
      if (!(currentTotal() > 0)) return;
      e.preventDefault();
      if (e.key === 'F2') openCashModal();
      else if (e.key === 'F3') openCardModal();
      else if (mode === 'vrap' || selectedId) openSplitModal(selectedId);
    });setInterval(updateTableTimers, 60_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTableTimers(); });
    /* ---------- Khlass-fade for T7 (preset) ---------- */
    setTimeout(() => {
      if (tables.T7 && tables.T7.status === 'khlass') {
        tables.T7.status = 'khawya';
        refreshTableNode('T7');
      }
    }, 5000);
    document.getElementById('new-table-modal').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-nt-covers]');
      if (chip) { newTableCovers = parseInt(chip.dataset.ntCovers); renderNewTableChips(); return; }
      if (e.target.closest('#nt-confirm')) { confirmNewTable(); return; }
      if (e.target.closest('#nt-cancel') || e.target === $('#new-table-modal'))
        { $('#new-table-modal').classList.remove('is-open'); return; }
    });
    /* ============================================================
       WAITLIST (liste d'attente) · walk-in parties at the door
       ============================================================ */
    const WL_PREFS = {
      'terrasse':    { label: 'Terrasse',    icon: 'sun'              },
      'interieur':   { label: 'Intérieur',   icon: 'utensils-crossed' },
      'etage':       { label: 'Étage',       icon: 'layers'           },
      'peu-importe': { label: 'Peu importe', icon: 'check'            },
    };
    $('#wl-add-btn') && $('#wl-add-btn').addEventListener('click', openWaitlistModal);
    document.getElementById('waitlist-modal').addEventListener('click', (e) => {
      const sizeChip = e.target.closest('[data-wl-size]');
      if (sizeChip) { wlDraft.size = parseInt(sizeChip.dataset.wlSize); renderWaitlistChips(); return; }
      const prefChip = e.target.closest('[data-wl-pref]');
      if (prefChip) { wlDraft.pref = prefChip.dataset.wlPref; renderWaitlistChips(); return; }
      if (e.target.closest('#wl-confirm')) { confirmWaitlistAdd(); return; }
      if (e.target.closest('#wl-cancel') || e.target === $('#waitlist-modal'))
        { $('#waitlist-modal').classList.remove('is-open'); return; }
    });
    $('#wl-name') && $('#wl-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmWaitlistAdd(); });
    $('#waitlist-list') && $('#waitlist-list').addEventListener('click', (e) => {
      const seat = e.target.closest('[data-wl-seat]');
      if (seat) { startSeating(parseInt(seat.dataset.wlSeat)); return; }
      const rem = e.target.closest('[data-wl-remove]');
      if (rem) { removeWaitlist(parseInt(rem.dataset.wlRemove)); return; }
    });
    $('#wl-seat-banner-cancel') && $('#wl-seat-banner-cancel').addEventListener('click', () => endSeating(true));
    // keep wait times fresh while the waitlist is on screen
    setInterval(() => { if (mode === 'waitlist') renderWaitlist(); }, 30000);
    /* ---------- Caisse Table Transfer & Merge Handlers ---------- */
    let ctrfFromId = null;
    let ctrfSelectedToId = null;
    let cmrgSourceId = null;
    let cmrgSelectedTargetId = null;
    $('#rp-transfer-table') && $('#rp-transfer-table').addEventListener('click', () => {
      if (!hasTables() || isFeatureOff('tableTransfer') || isFeatureOff('table-transfer')) return;
      if (selectedId) openCaisseTransferModal(selectedId);
    });
    $('#rp-merge-table') && $('#rp-merge-table').addEventListener('click', () => {
      if (!hasTables() || isFeatureOff('tableMerge') || isFeatureOff('table-merge')) return;
      if (selectedId) openCaisseMergeModal(selectedId);
    });
    document.getElementById('caisse-transfer-modal').addEventListener('click', (e) => {
      const card = e.target.closest('[data-ctrf-to]');
      if (card) {
        ctrfSelectedToId = card.dataset.ctrfTo;
        renderCaisseTransferGrid();
        const btnText = $('#ctrf-btn-text');
        if (btnText) btnText.textContent = `Déplacer vers ${ctrfSelectedToId}`;
        const confirmBtn = $('#ctrf-confirm');
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }
      if (e.target.closest('#ctrf-confirm')) { confirmCaisseTransfer(); return; }
      if (e.target.closest('#ctrf-cancel') || e.target === $('#caisse-transfer-modal')) {
        $('#caisse-transfer-modal').classList.remove('is-open');
        return;
      }
    });
    document.getElementById('caisse-merge-modal').addEventListener('click', (e) => {
      const card = e.target.closest('[data-cmrg-target]');
      if (card) {
        cmrgSelectedTargetId = card.dataset.cmrgTarget;
        renderCaisseMergeGrid();
        const btnText = $('#cmrg-btn-text');
        if (btnText) btnText.textContent = `Fusionner avec ${cmrgSelectedTargetId}`;
        const confirmBtn = $('#cmrg-confirm');
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }
      if (e.target.closest('#cmrg-confirm')) { confirmCaisseMerge(); return; }
      if (e.target.closest('#cmrg-cancel') || e.target === $('#caisse-merge-modal')) {
        $('#caisse-merge-modal').classList.remove('is-open');
        return;
      }
    });
    /* La reprise de file a fini par obtenir le numéro canonique. C'est le
       même bon — `opId` est son identité — et c'est le seul moment où l'on
       peut encore faire converger le papier, la cuisine et la caisse. */
    window.addEventListener('kiwi:kitchen-relay-number', (e) => {
      const detail = (e && e.detail) || {};
      const order = detail.id ? opTickets.get(String(detail.id)) : null;
      if (!order || detail.number == null || order.opNum != null) return;
      const was = ticketNo(order);
      order.opNum = detail.number;
      order.provisionalNumber = false;
      if (order.table && detail.session && tables[order.table]) {
        order.session = String(detail.session);
        tables[order.table].timerSession = order.session;
      }
      reconcileReceiptOrderNumber(order);
      if (order.table && tables[order.table] && String(tables[order.table].orderNo) === was) {
        tables[order.table].orderNo = ticketNo(order);
      }
      updateKdsCount();
      if (kdsEl.classList.contains('is-open')) kdsPaint();
      try { persistShift(); } catch (_) {}
      /* Le papier, lui, est déjà sorti avec « L64 ». On le dit, une fois : le
         comptoir doit pouvoir rapprocher le ticket posé sur la planche. */
      try { toast(`Bon ${was} · numéro définitif ${ticketNo(order)}`, 'ok'); } catch (_) {}
    });
    document.getElementById('validate-order').addEventListener('click', () => {
      if (mode !== 'order') return;
      if (selectedId) { validateOrder(selectedId); return; }
      /* Mode commande sans mesa : il n'y a rien à envoyer. Se taire laissait le
         serveur devant un bouton qui ne répond pas · on le ramène à la salle et
         on le lui dit. Le panier ramassé par erreur pendant ce temps repart avec
         (il n'appartient à aucune note), sinon il ressortirait tout seul au
         prochain passage en « À emporter ». */
      cart = [];
      backToSalle();
      toast('Aucune table en cours');
    });
    document.getElementById('cancel-new-order').addEventListener('click', cancelNewOrder);
    $('#rp-add-items').addEventListener('click', () => {
      if (mode !== 'salle' || !selectedId) return;
      resumeTableOrder(selectedId);
    });
    /* ===========================================================
       Split Bill
       =========================================================== */
    let splitPayCallback = null;let payBindingsBackup = null;const splitState = {
      tableId: null,
      isVrap: false,       // true when splitting an À emporter cart (no table)
      sourceLabel: null,   // modal label · 'T3' for a mesa, 'À emporter' for vrap
      total: 0,
      sourceLines: [],     // immutable bill snapshot used by audited zero settlement
      itemTotals: {},      // { itemName: { totalQty, unitPrice } }
      splitMode: 'egal',   // 'egal' | 'article'
      numParts: 2,
      tipMode: '0',        // '0','5','10','15','autre'
      customTipPct: 0,
      numConvives: 2,
      perConvive: {},      // { conviveNum: { itemName: qty } }
      activeConvive: 1,
      flow: null,          // { parts:[{amount,label,paid,payMethod}], paidCount }
    };/* ---- events ---- */
    $('#split-modal').addEventListener('click', (e) => {
      // Tab switch
      const tab = e.target.closest('[data-split-tab]');
      if (tab) { splitState.splitMode = tab.dataset.splitTab; renderSplitSetup(); return; }

      // Parts chips
      const partsChip = e.target.closest('[data-parts]');
      if (partsChip) {
        splitState.numParts = parseInt(partsChip.dataset.parts);
        renderPartsChips(); updateSplitSummary(); return;
      }

      // Tip chips
      const tipChip = e.target.closest('[data-tip]');
      if (tipChip) {
        splitState.tipMode = tipChip.dataset.tip;
        renderTipChips(); updateSplitSummary(); return;
      }

      // 1 · Number of convives → reset per-convive assignments
      const convivesChip = e.target.closest('[data-convives]');
      if (convivesChip) {
        splitState.numConvives = parseInt(convivesChip.dataset.convives);
        splitState.perConvive = {};
        splitState.activeConvive = 1;
        renderArticleMode();
        return;
      }

      // 2 · Switch the active convive (tab)
      const convTab = e.target.closest('[data-conv-tab]');
      if (convTab) {
        splitState.activeConvive = parseInt(convTab.dataset.convTab);
        renderArticleMode();
        return;
      }

      // 3 · Tap an item in the pool → assign one unit to active convive
      const poolItem = e.target.closest('[data-pool-item]');
      if (poolItem) {
        assignUnit(poolItem.dataset.poolItem);
        renderArticleMode();
        return;
      }

      // × on an assigned item → remove one unit from active convive
      const removeBtn = e.target.closest('[data-remove-item]');
      if (removeBtn) {
        unassignUnit(removeBtn.dataset.removeItem);
        renderArticleMode();
        return;
      }

      // Launch button
      if (e.target.closest('#split-launch')) { launchSplitFlow(); return; }

      // Cancel link
      if (e.target.closest('#split-cancel')) { closeSplitModal(); return; }

      // Done close
      if (e.target.closest('#split-done-close')) {
        closeSplitModal({ skipRevert: true });
        closeRightPanel();
        return;
      }

      // Pay-part buttons
      const payBtn = e.target.closest('[data-pay-part]');
      if (payBtn) {
        paySplitPart(parseInt(payBtn.dataset.payPart), payBtn.dataset.payMethod);
        return;
      }

      // Reprint paid part button
      const reprintBtn = e.target.closest('[data-reprint-part]');
      if (reprintBtn) {
        const pIdx = parseInt(reprintBtn.dataset.reprintPart);
        const part = splitState.flow && splitState.flow.parts && splitState.flow.parts[pIdx];
        if (part && part.saleId) {
          const sale = journal.find(en => en && en.id === part.saleId);
          if (sale) printSaleTicket(sale, { copy: true });
          else toast('Ticket introuvable');
        } else if (lastSaleEntry()) {
          printSaleTicket(lastSaleEntry(), { copy: true });
        }
        return;
      }

      // Click on veil backdrop (only allowed on setup screen, not mid-flow)
      if (e.target === $('#split-modal') && !$('#split-flow').hidden) return;
      if (e.target === $('#split-modal')) closeSplitModal();
    });
    // Custom tip percentage input
    document.addEventListener('input', (e) => {
      if (e.target.id === 'split-tip-input') {
        splitState.customTipPct = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
        updateSplitSummary();
      }
    });
    // Escape also closes split modal (same handler already closes card/cash)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#split-modal').classList.contains('is-open')) {
        if (!$('#split-flow').hidden) return; // don't accidentally close mid-flow
        closeSplitModal();
      }
    }, { capture: false });
    /* ===========================================================
       PIN LOGIN
       =========================================================== */
    const pinScreen = $('#pin-screen');
    /* Expose the restaurant-caisse boot for the pairing module (caisse-pairing.js),
       which boots a paired store into its matching vertical (restaurant → here). */
    try { window.__kiwiUnlockApp = function () { return unlockApp(); }; } catch (_) {}
    let pinBuffer = '';/* Reset the PIN state and replay the fade-in animation. Exposed on window
       because the pressing mode (PIN 0000, assets/pressing-caisse.js) locks
       the terminal back too, and pinBuffer lives inside this IIFE. */
    window.__kiwiPinReset = function () {
      pinBuffer = '';
      renderPinDots();
      $$('#pin-dots .pin-dot').forEach(d => d.classList.remove('is-success'));
      pinScreen.classList.remove('is-leaving');
      pinScreen.style.display = '';
      pinScreen.style.animation = 'none';
      void pinScreen.offsetWidth; // force reflow so the fade-in keyframe replays
      pinScreen.style.animation = '';
    };
    /* ===========================================================
       === Shift lifecycle ===  (clock-in · live stats · Clôture)
       =========================================================== */
    let   openingFloat   = 0;      // fond d'ouverture · MAD (chosen at clock-in, never preselected)
    const cashMovements  = [];     // [{ id, time, type:'in'|'out', amount, reason }]
    const DAILY_OBJECTIF = 18000;  // objectif d'lyoum · MAD
    /* Non-journal shift counters · the journal below is the ledger of record.
       `discounts` opens at 95 for the pitch demo (a service already under way).
       A real store opens at zero · applyStoreIdentity() clears it, the same way
       it clears the seeded transaction counters. `discountsCount` and `cancels`
       feed the daily report, which counts them as well as sums them: "3 remises
       pour 95 MAD" tells a patron something "95 MAD" alone does not. */
    const shift = { discounts: 95, discountsCount: 2, cancels: 0, refunds: 0, tablesPaid: 0 };
    let shiftOpenedAt = null;
    let shiftOpenedBy = '';        // qui a ouvert la caisse · figé à l'ouverture
    let cashSessionKey = '';
    /* ---- Cashier handover ("passation de caisse") ----
       A business day is split into "postes" · one per cashier. The journal
       keeps growing across the whole day; `posteOpenedAt` marks where the
       CURRENT cashier's accountability starts, `posteOpeningFloat` is the
       drawer they took over. Each handover is logged for the Clôture. */
    const CASHIER_ROSTER = [
      { id: 'othmane', name: 'Othmane N.', role: 'Caissier'  },
      { id: 'yassine', name: 'Yassine M.', role: 'Caissier'  },
      { id: 'salma',   name: 'Salma T.',   role: 'Caissière' },
      { id: 'mehdi',   name: 'Mehdi A.',   role: 'Caissier'  },
    ];
    let   currentCashier    = { id: 'othmane', name: 'Othmane N.', role: 'Caissier' };
    let   posteOpenedAt     = null;  // current cashier's poste start
    let   posteOpeningFloat = 500;   // drawer the current cashier took over
    const handovers         = [];    // [{ id,time,fromName,toName,posteOpenedAt,expected,counted,ecart }]
    /* ---- Journal des ventes · the shift's transaction ledger ---- */
    const journal = [];         // [{ id, time, label, amount, method, ref }]
    let journalSearch = '';
    let journalFilter = 'all';  // all | card | cash | complimentary
    let lastSaleId    = null;
    const activeCloudSaleIds = new Set();
    document.addEventListener('kiwi-sales-voided', (e) => {
      try {
        reconcileVoids(
          (e && e.detail && e.detail.refs) || [],
          (e && e.detail && e.detail.ids) || [],
          (e && e.detail && e.detail.voidEvents) || []
        );
      } catch (_) {}
    });
    /* Le sondage qui a précédé cet écouteur ne se rejouera pas tout seul. */
    try {
      if (window.KiwiLive && window.KiwiLive.voidedRefs) {
        reconcileVoids(
          window.KiwiLive.voidedRefs(),
          window.KiwiLive.voidedSaleIds ? window.KiwiLive.voidedSaleIds() : [],
          window.KiwiLive.voidEvents ? window.KiwiLive.voidEvents() : []
        );
      }
    } catch (_) {}
    /* ── VENDUE ICI, PAS ENCORE DANS LA FILE ─────────────────────────────────
     * Quand le stockage local est plein, Live Link refuse la mise en file
     * (`queue-storage-full`). La vente a pourtant eu lieu : l'argent est dans
     * le tiroir, le ticket est imprimé. Elle reste donc au journal, UNE fois,
     * marquée `saleHeldLocal`, et une copie part sur une étagère à part qui
     * survit au rechargement comme à la clôture : localStorage si une petite
     * écriture y passe encore, IndexedDB (quota bien plus large) dans tous les
     * cas. Le battement de cinq secondes la rejoue jusqu'à ce que la file la
     * prenne ; postSale() dérive le même identifiant à chaque essai, donc un
     * rejeu ne réserve jamais deux fois. Rien à l'écran ne propose de
     * réencaisser : la ligne d'état du rail compte ces ventes jusqu'à leur
     * envoi (caisse-pwa.js, window.KiwiCaisseHeldSales). */
    const HELD_SALES_PREFIX = 'kiwi-caisse-held-sales:';
    let heldSalesCache = null;
    window.KiwiCaisseHeldSales = Object.freeze({
      count: () => heldSaleRows().length,
      retry: retryHeldSales,
    });
    /* IndexedDB took a sale that localStorage refused: release it now rather
       than at the next tick. */
    window.addEventListener('kiwi:money-enqueued', () => { try { retryHeldSales(); } catch (_) {} });
    /* Every completed payment already exists in the SAME cloud sales ledger
       that feeds Dashboard Commandes. Mirror that ledger into the open caisse
       journal too: OrderPro, waiter and another till must all produce the same
       Transactions list after a reload. The server id is not always the local
       id, so the printed reference is the cross-device deduplication key. */
    let employeeSaleFeedStarted = false;
    let employeeSaleFeedMerchant = '';
    /* A restored register exists before deferred scripts run. A fresh register
       does not: doOpenService() below starts the bridge at the exact moment it
       creates shiftOpenedAt. */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (shiftOpenedAt) startEmployeeSaleJournalSync();
      }, { once: true });
    } else if (shiftOpenedAt) startEmployeeSaleJournalSync();
    /* ═══════════ CLIENT & FIDÉLITÉ SUR LA NOTE ══════════════════════════════
     * assets/clients-store.js (le carnet) et assets/clients-book.js (l'écran)
     * étaient chargés sur ce comptoir depuis le début, et RIEN dans cette page
     * ne les appelait : on pouvait inscrire un client depuis le carnet, jamais
     * lui compter un passage en encaissant. Sur la boutique, si ·
     * assets/pos-boutique.js appelle recordPurchase à l'encaissement. Le
     * restaurant, lui, tenait un carnet qui ne bougeait jamais.
     *
     * Le programme de fidélité (points au dirham, ou tampons) est réglé par le
     * patron au tableau de bord ; ici on ne fait que déclarer le passage et
     * laisser KiwiClients appliquer SES règles.
     *
     * Une note = un passage. Une addition partagée en quatre appelle recordSale
     * quatre fois : sans détachement immédiat, la cliente repartirait avec
     * quatre tampons pour un déjeuner. */
    let saleClient = null;
    /* ---- le sélecteur ---- */
    const clientModal = $('#client-modal');
    let clNewMode = false;
    $('#rp-client').addEventListener('click', (e) => {
      if (e.target.closest('#rp-client-clear')) {
        e.stopPropagation();
        saleClient = null; renderSaleClient(); return;
      }
      openClientModal();
    });
    $('#cl-search').addEventListener('input', clPaint);
    $('#cl-list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-cl-pick]');
      if (!row) return;
      try { attachClient(window.KiwiClients.get(row.dataset.clPick)); } catch (_) {}
    });
    $('#cl-cancel').addEventListener('click', () => { if (clNewMode) { clNewMode = false; clPaint(); } else closeClientModal(); });
    $('#cl-confirm').addEventListener('click', () => {
      if (!clNewMode) { clNewMode = true; clPaint(); setTimeout(() => { try { $('#cl-new-name').focus(); } catch (_) {} }, 80); return; }
      const name = ($('#cl-new-name').value || '').trim();
      const phone = ($('#cl-new-phone').value || '').trim();
      /* Un carnet de noms sans numéro ne sert à rien le jour où le patron veut
         rappeler ses habitués · mais on ne bloque pas une inscription au
         comptoir pour ça : le nom suffit, le numéro se complète plus tard. */
      if (!name && !phone) { try { $('#cl-new-name').focus(); } catch (_) {} return; }
      try {
        const rec = window.KiwiClients.upsert({
          name: name || phone, phone: phone,
          consent: !!($('#cl-new-consent') && $('#cl-new-consent').checked),
          source: 'caisse',
        });
        attachClient(rec);
      } catch (_) { toast('Enregistrement impossible'); }
    });
    clientModal.addEventListener('click', (e) => { if (e.target === clientModal) closeClientModal(); });
    /* Le carnet complet (fiches, historique, récompenses) reste celui de
       assets/clients-book.js, qui greffe sa propre entrée dans .act-selector. */
    renderSaleClient();
    if (!hookClientBook()) document.addEventListener('DOMContentLoaded', hookClientBook, { once: true });
    document.addEventListener('kiwi-paired', () => { try { renderSaleClient(); } catch (_) {} });
    /* ============ REÇU / TICKET · receipt preview ============ */
    /* Faux but plausible Moroccan establishment identifiers · DEMO ONLY. */
    const RECEIPT_ICE   = '002176548000071';  /* 15-digit ICE (demo) */
    const RECEIPT_PHONE = '+212 522 27 84 19';
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyStoreIdentity);
    else applyStoreIdentity();
    // This runs at load, BEFORE anyone has entered their code · so re-run it the
    // moment the till learns who is on shift, and again when they hand over.
    document.addEventListener('kiwi-staff', function () { applyStoreIdentity(); startLiveTeam(); });
    // Same for WHICH store: the pairing is redeemed after this file has painted,
    // so a device handed over from a second store's dashboard kept showing the
    // first store's name everywhere until reload.
    document.addEventListener('kiwi-paired', function () {
      liveTeamMerchant = '';
      applyStoreIdentity();
      startLiveTeam();
    });
    // The roster arrives async (/api/config → KiwiConfig.pins → kiwi-config), after
    // this file has painted its demo servers · rebuild the floor team when it lands.
    document.addEventListener('kiwi-config', function () { try { rebuildRealRoster(); startLiveTeam(); syncActiveMode(); if (mode === 'vrap') renderVrapBoard(); } catch (_) {} });
    setTimeout(startLiveTeam, 1000);
    /* L'écriture actuellement à l'écran · c'est ELLE qu'on réimprime, pas une
       nouvelle vente. Une réimpression garde le numéro et le contenu d'origine. */
    let receiptEntry = null;
    $('#receipt-close').addEventListener('click', closeReceipt);
    /* Ce bouton annonçait « Ticket envoyé à l'imprimante » et fermait la fenêtre.
       Il n'imprimait rien. Sur une vraie caisse, la caissière le pressait, le
       client attendait, et il ne sortait jamais de papier · le pire mensonge
       qu'une caisse puisse faire. Il imprime maintenant, et il dit quand il n'a
       pas pu.
       DUPLICATA parce qu'un second exemplaire du même ticket qui circule sans le
       dire est une pièce qu'on ne peut plus rapprocher. Le NUMÉRO, lui, ne
       change pas : c'est le même achat. */
    $('#receipt-print').addEventListener('click', () => {
      const doc = receiptDocFor(receiptEntry, { copy: true });
      if (!doc) { toast('Impression indisponible sur cet appareil'); return; }
      toast('Impression du reçu…');
      Promise.resolve(window.KiwiReceipt.print(doc)).then(
        (r) => toast(r && r.ok ? 'Reçu imprimé' : 'Impression échouée'),
        () => toast('Impression échouée')
      );
      closeReceipt();
    });
    const rcptInv = $('#receipt-invoice');
    if (rcptInv) {
      rcptInv.addEventListener('click', () => {
        if (!receiptEntry) return;
        if (window.KiwiInvoice && typeof window.KiwiInvoice.makeSaleInvoice === 'function') {
          window.KiwiInvoice.makeSaleInvoice(receiptEntry);
        }
      });
    }
    $('#receipt-modal').addEventListener('click', (e) => {
      if (e.target === $('#receipt-modal')) closeReceipt();
    });
    /* ---- Clôture de caisse · end-of-service report ---- */
    let clotureExpected = 0;
    let clotureCardExpected = 0;
    let terminalCardTotal = null;
    // KiwiLive dispatches on window, not document. Listening on document
    // silently lost every server acknowledgement (and refund recovery event).
    window.addEventListener('kiwi:money-sync', (event) => {
      const detail = event && event.detail || {};
      if (detail.kind === 'sale' && detail.id) {
        let changed = false;
        journal.forEach((entry) => {
          if (!entry || entry.kind === 'refund' || entry.origin) return;
          const queuedId = String(entry.serverSaleId || window.KiwiLive?.saleIdFor?.(entry, currentMerchantSlug()) || '');
          if (queuedId !== String(detail.id)) return;
          if (detail.state === 'accepted') {
            entry.serverSaleId = String(detail.serverId || detail.id);
            delete entry.saleSyncPending;
            delete entry.saleSyncError;
            if (entry.saleHeldLocal) { delete entry.saleHeldLocal; releaseHeldSale(entry.id); }
          } else if (detail.state === 'blocked') {
            entry.saleSyncPending = true;
            entry.saleSyncError = 'sale-conflict';
          }
          changed = true;
        });
        if (changed) { try { persistShift(); } catch (_) {} }
        return;
      }
      if (detail.kind !== 'refund' || !detail.id) return;
      let changed = false;
      journal.forEach((entry) => {
        if (!entry || entry.kind !== 'refund') return;
        let serverId = String(entry.serverSaleId || '');
        if (!serverId) {
          try { serverId = String(window.KiwiLive?.moneyId?.(entry) || ''); } catch (_) {}
        }
        if (!serverId || serverId !== String(detail.id)) return;
        if (detail.state === 'accepted') {
          entry.serverSaleId = serverId;
          entry.refundSynced = true;
          entry.refundSyncNeedsApproval = false;
          entry.refundSyncStatus = 'accepted';
          applyAcceptedRefund(entry);
          /* The server has consumed the exact capability. Retain the named
             approver for the local audit, not the bearer token. */
          if (entry.refundActor) entry.refundActor.approval = '';
          changed = true;
        } else if (Number(detail.status) === 403) {
          entry.refundSyncNeedsApproval = true;
          entry.refundSyncStatus = 'manager-required';
          changed = true;
        } else if (detail.state === 'blocked' && Number(detail.status) >= 400) {
          markRejectedRefund(entry, detail.status);
          changed = true;
        }
      });
      if (!changed) return;
      try { persistShift(); } catch (_) {}
      try {
        if ($('#refund-modal') && $('#refund-modal').classList.contains('is-open')) renderRefundRecovery();
      } catch (_) {}
    });
    /* L'instantané provisoire. `reopen:false` : tenir le tableau de bord à jour
       pendant le service n'est pas une clôture et ne doit ni incrémenter le
       compteur de fermetures ni salir l'historique des révisions. */
    let lastProvisional = 0;
    /* ---- L'écran d'après-clôture ----
       Le patron vient de fermer sa caisse. Il lui reste UNE décision : garder ou
       non une trace papier. Les trois choix sont ceux d'une caisse et pas d'un
       logiciel · imprimer, réimprimer si le rouleau a bourré, ou continuer sans.
       La caisse ne se recharge qu'ensuite : recharger d'abord, c'était fermer la
       porte avant d'avoir posé la question. */
    let closedReport = null;
    /* #0164 · Pasta Corner, 2026-10-05. The close was recorded at 01:16 (cash
       event, Z, day report), but the page never finished: four minutes later
       the same service was still on screen, and every new « Fermer la caisse »
       returned silently on `registerClosing`. A close must therefore (1) say
       when it is already running, (2) never wait forever on storage, and (3)
       once durably recorded, always end in finishClose(), even if the paper
       sheet fails to render. */
    let registerClosed = false;
    /* La clôture sur le kit (§18.9) : le motif d'écart et la feuille de comptage
       ouverte. Déclarés ici, dans le même bloc que closeRegisterSteps() qui les
       lit, pour que la clôture reste exécutable seule. */
    let closeGapReason = null;
    let tillKitCount = null;
    const CLOSE_STEP_TIMEOUT_MS = 15000;
    const clockinBtn = document.getElementById('clockin-btn');
    if (clockinBtn) clockinBtn.addEventListener('click', openService);
    /* Imprimer AVANT de fermer · le patron qui veut relire son Z sur papier
       avant de valider le comptage. Le rapport est construit avec le comptage
       saisi à l'instant, pas avec un zéro : un aperçu qui n'a pas le même écart
       que l'écran ne sert à rien. Aucune écriture ici, c'est un tirage. */
    $('#clo-print').addEventListener('click', () => {
      const cardRaw = $('#clo-card-z') ? $('#clo-card-z').value.trim() : '';
      const cardValue = cardRaw === '' ? NaN : Number(cardRaw);
      terminalCardTotal = Number.isFinite(cardValue) && cardValue >= 0 ? money(cardValue) : null;
      const raw = $('#clo-count') ? $('#clo-count').value : '';
      const r = buildDayReport((raw === '' || raw == null) ? null : parseFloat(raw), 0);
      if (!r) { toast('Rapport indisponible'); return; }
      doPrintDayReport(r, 'AVANT CLÔTURE');
    });
    $('#clo-close').addEventListener('click', () => { window.KiwiAuthAct?.({ kind: 'close_till', key: 'act.close_till' }); requireTillOperator('Fermeture de caisse', closeRegister); });
    $('#clo-continue').addEventListener('click', () => $('#cloture-modal').classList.remove('is-open'));
    /* ---- L'écran d'après-clôture : imprimer · réimprimer · continuer ---- */
    (function wirePostClose() {
      const veil = $('#zsheet-modal'); if (!veil) return;
      const print = $('#zs-print'), reprint = $('#zs-reprint'), skip = $('#zs-skip');
      if (print) print.addEventListener('click', () => {
        if (!closedReport) return finishClose();
        print.disabled = true;
        doPrintDayReport(closedReport, '').then((res) => {
          print.disabled = false;
          /* « Réimprimer » n'apparaît qu'APRÈS un premier tirage : proposer de
             réimprimer ce qui n'a jamais été imprimé n'a pas de sens. */
          if (res?.ok) {
            if (reprint) reprint.hidden = false;
            const lbl = print.querySelector('span'); if (lbl) lbl.textContent = 'Imprimer à nouveau';
          }
        });
      });
      if (reprint) reprint.addEventListener('click', () => {
        if (!closedReport) return;
        /* Un double du Z porte la mention DUPLICATA. Deux exemplaires
           indiscernables de la même journée qui circulent, c'est une pièce
           comptable qu'on ne peut plus rapprocher. */
        doPrintDayReport(closedReport, 'DUPLICATA');
      });
      if (skip) skip.addEventListener('click', finishClose);
      /* Pas de fermeture au clic sur le voile : la caisse va se recharger, un
         clic à côté ne doit pas décider ça à la place du commerçant. */
    })();
    $('#cloture-modal').addEventListener('click', (e) => {
      if (e.target === $('#cloture-modal')) $('#cloture-modal').classList.remove('is-open');
    });
    /* ---- Rapport du jour · le tiroir à trois onglets ----
     *
     * Résumé · Ventes par article · Journal. Le troisième est l'ancien tiroir
     * « Journal des ventes » tel quel ; les deux premiers sont ce qui lui
     * manquait. Le rapport se recalcule à chaque rendu depuis le journal en
     * mémoire · c'est la même fonction qui écrit le Z (buildDayReport), donc
     * ce que le comptoir lit en plein service et ce qui s'imprimera à la
     * clôture ne peuvent pas raconter deux journées différentes. */
    let rpTab = 'journal';
    const txnsCard = $('#stat-txns-card');
    if (txnsCard) txnsCard.addEventListener('click', () => openJournal('journal'));
    $('#journal-drawer-close').addEventListener('click', closeJournal);
    $('#rp-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rp-tab]');
      if (!b) return;
      rpTab = b.dataset.rpTab;
      /* La recherche ne traverse pas les onglets : « tajine » tapé dans les
         articles ne doit pas vider le journal en y revenant. */
      journalSearch = '';
      const input = $('#jr-search-input'); if (input) input.value = '';
      $$('#rp-tabs [data-rp-tab]').forEach((c) => {
        const on = c === b;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderJournal();
      const body = $('#journal-body'); if (body) body.scrollTop = 0;
    });
    $('#rp-foot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rp-act]');
      if (!b) return;
      const a = b.dataset.rpAct;
      if (a === 'print-items') printItemSales();
      else if (a === 'print-report') printLiveReport();
      else if (a === 'reprint-last') reprintLastTicket();
    });
    $('#journal-drawer').addEventListener('click', (e) => {
      if (e.target === $('#journal-drawer')) { closeJournal(); return; }
      /* L'icône imprimante AVANT la ligne : elle est dessinée dedans, donc sans
         cette interception elle héritait du clic de la ligne et ouvrait l'aperçu.
         Une imprimante qui ouvre un aperçu n'imprime pas. DUPLICATA, parce qu'un
         second exemplaire qui circule sans le dire ne se rapproche plus. */
      const inv = e.target.closest('[data-jr-invoice]');
      if (inv) {
        e.stopPropagation();
        const entry = journal.find(en => en.id === inv.dataset.jrInvoice);
        if (entry && window.KiwiInvoice && typeof window.KiwiInvoice.makeSaleInvoice === 'function') {
          window.KiwiInvoice.makeSaleInvoice(entry);
        }
        return;
      }
      const pr = e.target.closest('[data-jr-print]');
      if (pr) {
        e.stopPropagation();
        const entry = journal.find(en => en.id === pr.dataset.jrPrint);
        if (entry) printSaleTicket(entry, { copy: true });
        return;
      }
      const row = e.target.closest('[data-jr-id]');
      if (row) {
        const entry = journal.find(en => en.id === row.dataset.jrId);
        if (entry) openReceipt(entry);
      }
    });
    $('#jr-search-input').addEventListener('input', (e) => {
      journalSearch = e.target.value;
      renderJournal();
    });
    $('#jr-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-jr-filter]');
      if (!chip) return;
      journalFilter = chip.dataset.jrFilter;
      $$('#jr-filters .jr-chip').forEach(c => c.classList.toggle('is-active', c === chip));
      renderJournal();
    });
    const CM_REASONS = {
      out: ['Achat fournisseur', 'Dépôt banque', 'Avance personnel', 'Autre'],
      in:  ['Appoint monnaie', 'Correction', 'Autre'],
    };
    let cmType = 'out', cmReason = '';
    const CM_TYPE_LABEL = {
      fr: { out: 'Sortie', in: 'Entrée' },
      en: { out: 'Cash out', in: 'Cash in' },
      ar: { out: 'سحب', in: 'إيداع' },
    };
    let cmLangHooked = false;
    $('#cash-move-modal').addEventListener('click', (e) => {
      if (e.target === $('#cash-move-modal')) { closeCashMove(); return; }
      const typeBtn = e.target.closest('[data-cm-type]');
      if (typeBtn) {
        cmType = typeBtn.dataset.cmType;
        $$('#cm-type .cm-type-btn').forEach(b => b.classList.toggle('is-active', b === typeBtn));
        renderCmReasons();
        return;
      }
      const reasonBtn = e.target.closest('[data-cm-reason]');
      if (reasonBtn) {
        cmReason = reasonBtn.dataset.cmReason;
        $$('#cm-reasons .cm-reason').forEach(b => b.classList.toggle('is-active', b === reasonBtn));
        updateCmCustomVisibility();
        return;
      }
      const preset = e.target.closest('[data-cm-add]');
      if (preset) {
        $('#cm-amount').value = (parseFloat($('#cm-amount').value) || 0) + parseFloat(preset.dataset.cmAdd);
        return;
      }
      if (e.target.closest('#cm-cancel'))  { closeCashMove(); return; }
      if (e.target.closest('#cm-confirm')) { confirmCashMove(); return; }
    });
    const cmAmountInput = $('#cm-amount');
    if (cmAmountInput) {
      cmAmountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmCashMove();
        }
      });
    }
    const cmCustomInput = $('#cm-custom-input');
    if (cmCustomInput) {
      cmCustomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmCashMove();
        }
      });
    }
    const floatChips  = $('#ci-float-chips');
    const floatCustom = $('#ci-float-custom');
    const floatInput  = $('#ci-float-input');
    const floatLast = $('#ci-float-last');
    const floatErr  = $('#ci-float-err');
    /* Le caissier a-t-il dit combien il y a dans le tiroir ? Sur un vrai
       commerce l'ouverture est refusée tant que non : un fond présélectionné
       puis jamais compté devenait l'« attendu » que la clôture rapproche. */
    let floatChosen = false;
    if (floatChips) floatChips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-float]');
      if (!chip) return;
      markFloatChip(chip);
      if (chip.dataset.float === 'custom') {
        showFloatCustom(true, true);
        openingFloat = readFloatInput();
        /* « Autre » n'engage rien tant qu'aucun montant n'est tapé (0 compte) */
        floatChosen = !!(floatInput && floatInput.value !== '');
        syncFloatGate();
        return;
      }
      showFloatCustom(false);
      openingFloat = parseInt(chip.dataset.float, 10) || 500;
      floatChosen = true; syncFloatGate();
      rememberFloat(openingFloat);
    });
    if (floatInput) {
      floatInput.addEventListener('input', () => {
        /* Un signe moins saisi par erreur ne doit pas passer dans le Z : on le
           corrige à la frappe plutôt que de refuser l'ouverture plus tard. */
        if (floatInput.value && parseFloat(floatInput.value) < 0) floatInput.value = floatInput.value.replace('-', '');
        openingFloat = readFloatInput();
        floatChosen = floatInput.value !== '';
        syncFloatGate();
        if (floatChosen) rememberFloat(openingFloat);
      });
      /* Entrée = « j'ai fini de taper », pas « ouvre la caisse » : ouvrir sur une
         touche du clavier tablette ouvrirait des services par accident. */
      floatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); floatInput.blur(); } });
    }
    if (floatLast) floatLast.addEventListener('click', () => {
      const v = parseFloat(floatLast.dataset.value);
      if (!Number.isFinite(v) || v < 0) return;
      const preset = floatChips && floatChips.querySelector(`[data-float="${v}"]`);
      openingFloat = v; floatChosen = true; syncFloatGate();
      if (preset) { markFloatChip(preset); showFloatCustom(false); return; }
      const other = floatChips && floatChips.querySelector('[data-float="custom"]');
      if (other && floatInput) { markFloatChip(other); floatInput.value = String(v); showFloatCustom(true, false); }
    });
    restoreFloat();
    document.addEventListener('kiwi-paired', () => { try { restoreFloat(); } catch (_) {} });
    /* Clôture cash-count écart */
    $('#clo-count').addEventListener('input', updateEcart);
    $('#clo-card-z').addEventListener('input', () => {
      const raw = $('#clo-card-z').value.trim();
      const value = raw === '' ? NaN : Number(raw);
      terminalCardTotal = Number.isFinite(value) && value >= 0 &&
        Math.abs(value * 100 - Math.round(value * 100)) <= 0.000001 ? money(value) : null;
      try { persistShift(); } catch (_) {}
      updateCardEcart();
    });
    const verticalDemoPins = new Set(['0000','0002','0003','0004','0005','0006','0007','0008','0009','0010','0011','0012','0013','0014','0015']);
    let pinRoutePending = false;
    $('#pin-pad').addEventListener('click', (e) => {
      const key = e.target.closest('.pin-key');
      if (!key) return;
      const v = key.dataset.pin;
      if (v === 'back') {
        pinBuffer = pinBuffer.slice(0, -1);
        renderPinDots();
        return;
      }
      if (v === 'forgot') {
        toast('SOS · contacte le manager');
        return;
      }
      if (pinBuffer.length >= 4) return;
      pinBuffer += v;
      renderPinDots();
      if (pinBuffer.length === 4) routeAccessPin(pinBuffer);
    });
    document.addEventListener('keydown', (e) => {
      if (pinScreen.style.display === 'none') return;
      if (/^[0-9]$/.test(e.key) && pinBuffer.length < 4) {
        pinBuffer += e.key;
        renderPinDots();
        if (pinBuffer.length === 4) routeAccessPin(pinBuffer);
      } else if (e.key === 'Backspace') {
        pinBuffer = pinBuffer.slice(0, -1);
        renderPinDots();
      }
    });
    /* ===========================================================
       MANAGER-PIN AUTHORIZATION GATE
       -----------------------------------------------------------
       requireManager(actionLabel, onApprove)
         · actionLabel · string shown in the modal subtitle
                          (e.g. "Remise sur l'addition").
         · onApprove   · callback fired ONLY after a valid 4-digit
                                manager code is entered. Only the unpaired local
                          demo accepts any 4 digits; a paired/hosted till validates
                          a manager-level code from its server-backed roster.
       Cancel / veil-click closes the modal WITHOUT calling onApprove.
       Every approval is logged to the `authorizations` array below.
       Exposed as window.requireManager so later features can gate
       sensitive actions through it.
       =========================================================== */
    const authorizations = [];  // [{ id, time:Date, action }]
    const mgrModal   = $('#manager-modal');
    let   mgrBuffer  = '';
    let   mgrOnApprove = null;
    let   mgrBusy    = false;    // true during the success beat
    let   mgrAccess  = 'manager';
    let   mgrAuthContext = null;
    let   mgrNeedsServer = false;  // the act is a server write with no outbox
    let   mgrValidate = null;      // (who) => refusal text | null, judged on the pad
    let   mgrOnCancel = null;/* Design 2027 (§10.2): the act an approval is for, by its act.* key, set
       by the caller on the line before requireManager / requireTillOperator.
       The 2027 pad writes its sub from it; the shipped modal ignores it.
       Consumed by the next opening in the same tick, never later. */
    let nextAuthAct = null;window.KiwiAuthAct = authAct;window.KiwiAuthorizeTillAction = requireTillOperator;
    const TILL_NEEDS_SERVER = Object.freeze({ needsServer: true });$('#mgr-pad').addEventListener('click', (e) => {
      const key = e.target.closest('.mgr-key');
      if (!key || key.classList.contains('is-spare')) return;
      const v = key.dataset.mgr;
      if (v === 'back') {
        if (mgrBusy) return;
        mgrBuffer = mgrBuffer.slice(0, -1);
        renderMgrDots();
        return;
      }
      mgrPushDigit(v);
    });
    $('#manager-cancel').addEventListener('click', closeManagerModal);
    /* « Réessayer » ne fait qu'une chose : revérifier la connexion, à la demande
       de la personne. Il ne rejoue jamais un code et n'approuve rien ; si le
       réseau est revenu, le pavé reparaît vide, il faut retaper le code. */
    $('#mgr-needs-retry').addEventListener('click', () => {
      if (!tillReachable()) { toast('Toujours sans connexion · rien n’a changé'); return; }
      mgrModal.classList.remove('is-needs-connection');
      $('#mgr-needs').hidden = true;
      mgrBuffer = ''; mgrBusy = false; renderMgrDots();
    });
    mgrModal.addEventListener('click', (e) => {
      if (e.target === mgrModal) closeManagerModal();
    });
    window.addEventListener('keydown', (e) => {
      if (!mgrModal.classList.contains('is-open') || mgrBusy) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        mgrPushDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (mgrBuffer.length > 0) {
          mgrBuffer = mgrBuffer.slice(0, -1);
          renderMgrDots();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeManagerModal();
      }
    });
    window.requireManager = requireManager;
    /* ===========================================================
       ATTENDANCE CODE · short-lived code generated by the caisse
       =========================================================== */
    let attendanceCodeTimer = null;
    let attendanceCodeExpires = 0;const attendanceCodeRailTrigger = $('#open-attendance-code');
    if (attendanceCodeRailTrigger) attendanceCodeRailTrigger.addEventListener('click', openAttendanceCode);
    $('#attendance-code-new').addEventListener('click', generateAttendanceCode);
    $('#attendance-code-close').addEventListener('click', closeAttendanceCode);
    $('#attendance-code-modal').addEventListener('click', (event) => {
      if (event.target === $('#attendance-code-modal')) closeAttendanceCode();
    });$('#open-team').addEventListener('click', openTeamDrawer);
    $('#team-drawer-close').addEventListener('click', closeTeamDrawer);
    $('#team-drawer').addEventListener('click', (e) => {
      if (e.target === $('#team-drawer')) closeTeamDrawer();

      const card = e.target.closest('[data-team-action]');
      if (card) {
        const act = card.dataset.teamAction;
        const sid = card.dataset.server;
        if (act === 'start-pause' || act === 'end-pause') {
          if (card.disabled) return;
          card.disabled = true;
          const pausing = act === 'start-pause';
          const member = servers[sid];
          fetch('/api/team/live', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ merchant: pairedTeamMerchant(), action: pausing ? 'manager-pause' : 'manager-resume', memberId: sid }),
          }).then(async (response) => {
            let data = {}; try { data = await response.json(); } catch (_) {}
            if (!response.ok) throw new Error(data.error || 'pause-write-failed');
            toast(`${member.name} · ${pausing ? 'pause démarrée' : 'fin de pause'}`);
            pollLiveTeam();
          }).catch((error) => {
            toast(error && error.message === 'employee-not-clocked-in'
              ? `${member.name} n'est pas pointé en service`
              : 'Pause non synchronisée · vérifiez la connexion');
          }).finally(() => { card.disabled = false; });
        } else if (act === 'message') {
          openMsgModal(sid);
        }
        return;
      }

      if (e.target.closest('#team-broadcast-all')) {
        openMsgModal('ALL');
      }
    });
    // Live pause-timer ticker
    setInterval(() => {
      if (!$('#team-drawer').classList.contains('is-open')) return;
      $$('[data-team-card]').forEach(card => {
        const s = servers[card.dataset.teamCard];
        if (s && s.status === 'pause') {
          const tick = card.querySelector('.pause-tick');
          if (tick) tick.textContent = `En pause · ${pauseElapsedMn(s)} mn`;
        }
      });
    }, 30000);
    /* ===========================================================
       MESSAGE COMPOSER
       =========================================================== */
    let msgTargetId = null;$('#msg-cancel').addEventListener('click', closeMsgModal);
    $('#msg-modal').addEventListener('click', (e) => {
      if (e.target === $('#msg-modal')) closeMsgModal();
      const quick = e.target.closest('[data-msg]');
      if (quick) {
        $('#msg-input').value = quick.dataset.msg;
        $('#msg-input').focus();
      }
    });
    $('#msg-send').addEventListener('click', async () => {
      const text = $('#msg-input').value.trim();
      if (!text) { toast('Écris un message d\'abord'); return; }
      const sentTo = activeServerCount();
      const target = msgTargetId === 'ALL'
        ? `équipe (${sentTo} serveur${sentTo > 1 ? 's' : ''} en service)`
        : servers[msgTargetId].name;
      const button = $('#msg-send');
      button.disabled = true;
      fetch('/api/team/live', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ merchant: pairedTeamMerchant(), action: 'message', target: msgTargetId, text }),
      }).then(async (response) => {
        let data = {}; try { data = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(data.error || 'message-write-failed');
        toast(`Message envoyé à ${target} ✓`);
        closeMsgModal();
      }).catch(() => { toast('Message non envoyé · vérifiez la connexion'); })
        .finally(() => { button.disabled = false; });
    });
    /* ===========================================================
       REASSIGN SERVER MODAL
       =========================================================== */
    let reassignTableId = null;$('#reassign-cancel').addEventListener('click', closeReassignModal);
    $('#reassign-modal').addEventListener('click', (e) => {
      if (e.target === $('#reassign-modal')) closeReassignModal();
      const opt = e.target.closest('[data-reassign]');
      if (opt && reassignTableId) {
        const newSid = opt.dataset.reassign;
        const t = tables[reassignTableId];
        const oldSid = t.server;
        if (newSid === oldSid) { closeReassignModal(); return; }
        t.server = newSid;
        refreshTableNode(reassignTableId);
        if (selectedId === reassignTableId) renderRightPanel(reassignTableId);
        toast(`Table ${reassignTableId} → ${servers[newSid].name}`);
        closeReassignModal();
      }
    });
    /* ===========================================================
       SPLIT BILL · persistence (background / resume / cancel)
       =========================================================== */
    const tableSplits = new Map(); // tableId → { mode, total, parts, paidCount }
    /* One split per takeaway order (key 'new' = the cart not sent yet, 'n<num>'
       = a numbered order). A single global slot let a second takeaway order's
       split overwrite the first one's paid parts, and resumed the first order's
       split onto whichever cart was open. */
    const vrapSplits = new Map();/* "Plus tard" · background the split */
    $('#split-flow-close').addEventListener('click', () => {
      saveSplitFlow();
      const t = tables[splitState.tableId];
      if (t && t.status !== 'khlass') {
        t.status = 'bgha-ykhlass';  // backgrounded split → mesa shows Addition
        refreshTableNode(splitState.tableId);
      }
      $('#split-modal').classList.remove('is-open');
      toast('Split en pause · reprends quand tu veux');
      if (selectedId === splitState.tableId) renderRightPanel(selectedId);
    });
    // Patch markSplitPartPaid via wrapper · save on every payment, delete on done
    const _origMarkPaid = markSplitPartPaid;
    markSplitPartPaid = function(partIdx, method) {
      _origMarkPaid(partIdx, method);
      if (splitState.flow.paidCount >= splitState.flow.parts.length) {
        if (splitState.isVrap) vrapSplits.delete(vrapSplitKey(vrapEditingNum));
        else tableSplits.delete(splitState.tableId);
        /* The payment journal was persisted before the final part changed the
           flow. Persist the deletion too, otherwise F5 restores a completed
           split and presents an already-paid note as still due. */
        try { persistShift(); } catch (_) {}
      } else {
        saveSplitFlow();
        if (selectedId === splitState.tableId) renderRpSplitCard(selectedId);
      }
    };
    // Patch openSplitModal · if a saved split exists, jump directly to flow screen
    const _origOpenSplit = openSplitModal;
    openSplitModal = function(tableId) {
      if ((mode === 'vrap' && currentVrapSplit()) || (mode !== 'vrap' && tableSplits.has(tableId))) {
        loadSplitFlow(tableId);
        $('#split-table-label').textContent = splitState.sourceLabel || tableId;
        $('#split-setup').hidden = true;
        $('#split-flow').hidden = false;
        $('#split-all-done').hidden = splitState.flow.paidCount < splitState.flow.parts.length;
        renderSplitFlow();
        $('#split-modal').classList.add('is-open');
        lucide.createIcons();
        return;
      }
      _origOpenSplit(tableId);
    };
    /* This bridge is deliberately table-specific. The shared reprint module
     * authorizes the exact receipt; only the restaurant till can restore its
     * bill snapshot and split progress without creating a second kitchen order. */
    window.KiwiRestaurantReopen = {
      originalTable(entry) {
        return String(entry?.reopenSnapshot?.table || '').trim();
      },
      freeTables(original) {
        return Object.keys(tables).filter(id => {
          const t = tables[id];
          return t && (t.status === 'khawya' || t.status === 'khlass')
            && (!t.timerSession || !phoneSeats.has(tableKey(id)));
        }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      },
      apply(result, receipt) {
        const snap = receipt && receipt.reopenSnapshot;
        const target = String(result && result.table || '');
        const table = tables[target];
        if (!snap || !table || !result.sessionId || !Array.isArray(snap.lines)
          || !(table.status === 'khawya' || table.status === 'khlass'
            || table.timerSession === result.sessionId
            || (table.reopenSessionId === result.sessionId
              && !(tableOrders[target] || []).length && !(orders[target] || []).length))) return false;
        const saleId = String(receipt.saleId || '');
        const voided = journal.find(row => row && (
          row.id === saleId || row.serverSaleId === saleId
          || window.KiwiLive?.saleIdFor?.(row, currentMerchantSlug()) === saleId));
        if (voided) { voided.voided = true; voided.voidConfirmed = true; voided.voidAuthority = 'sale-cancel'; }
        table.status = 'bgha-ykhlass';
        table.covers = Math.max(1, Number(snap.covers) || 1);
        table.orderNo = String(snap.orderNo || '').trim();
        table.reopenRef = String(result.ref || snap.ref || '').trim();
        table.timerSession = String(result.sessionId);
        delete table.reopenSessionId;
        table.reopenedBill = saleId;
        delete tableClosedAt[tableKey(target)];
        delete orders[target];
        tableOrders[target] = snap.lines.slice(0, 40).map((line, index) => {
          const qty = Math.max(1, Number(line.qty) || 1);
          return { id: 'reopen-' + index, name: String(line.name || 'Article'), qty,
            price: Number(line.total || 0) / qty, sent: true, reopenedBill: true };
        });
        if (snap.split && Array.isArray(snap.split.parts)) {
          const flowId = String(snap.split.id || result.splitFlowId || '');
          const parts = snap.split.parts.map((part, index) => {
            const live = journal.find(row => row && !row.voided && row.split
              && String(row.split.flowId || '') === flowId && Number(row.split.index) === index);
            return { ...part, paid: !!live, payMethod: live ? (live.method === 'card' ? 'carte' : 'cash') : null,
              saleId: live ? live.id : null };
          });
          tableSplits.set(target, { id: flowId, session: String(result.sessionId),
            mode: snap.split.mode || 'egal', total: Number(snap.split.total) || 0,
            sourceLabel: table.reopenRef || tableSaleLabel(target, table.orderNo),
            parts, paidCount: splitPaidCount({ parts }) });
        } else tableSplits.delete(target);
        refreshTableNode(target);
        persistShift();
        openTable(target);
        return true;
      },
    };
    /* End restaurant reopen bridge */
    // Allow backdrop click to background mid-flow (instead of locking)
    // Replace the lock with a save-and-close on the existing handler
    // (The previous listener returned early on flow screen; we add a global capture)
    document.addEventListener('click', (e) => {
      if (e.target === $('#split-modal') && !$('#split-flow').hidden && $('#split-modal').classList.contains('is-open')) {
        // Background the split rather than block
        saveSplitFlow();
        const t = tables[splitState.tableId];
        if (t && t.status !== 'khlass') {
          t.status = 'bgha-ykhlass';  // backgrounded split → mesa shows Addition
          refreshTableNode(splitState.tableId);
        }
        $('#split-modal').classList.remove('is-open');
        toast('Split en pause · reprends quand tu veux');
        if (selectedId === splitState.tableId) renderRightPanel(selectedId);
      }
    }, true);const remiseModal = $('#remise-modal');
    const remiseState = { target: 'table', tableId: null, gross: 0, kind: 'pct', value: 0, reason: 'Geste commercial' };window.addEventListener('DOMContentLoaded', () => {
      const policy = window.KiwiDiscountPolicy;
      policy?.percentages(); // bind the paired merchant and fetch the owner's server copy
      policy?.subscribe(() => {
        if (!remiseModal.classList.contains('is-open')) return;
        renderRemiseChips();
        $$('#rm-pct-chips .rm-pct-chip').forEach(c => c.classList.toggle('is-active',
          remiseState.kind === 'pct' && Number(c.dataset.rmPct) === remiseState.value));
      });
    });remiseModal.addEventListener('click', (e) => {
      if (e.target === remiseModal) { closeRemiseModal(); return; }
      const typeBtn = e.target.closest('[data-rm-type]');
      if (typeBtn) {
        remiseState.kind = typeBtn.dataset.rmType;
        // Reset the value when switching modes so stale figures don't carry over.
        if (remiseState.kind === 'pct') {
          remiseState.value = 0;
          $$('#rm-pct-chips .rm-pct-chip').forEach(c => c.classList.remove('is-active'));
        } else {
          remiseState.value = parseFloat($('#rm-amount').value) || 0;
        }
        syncRemiseType();
        renderRemisePreview();
        return;
      }
      const pctChip = e.target.closest('[data-rm-pct]');
      if (pctChip) {
        const next = parseFloat(pctChip.dataset.rmPct) || 0;
        if (window.KiwiDiscountPolicy?.configured() && !window.KiwiDiscountPolicy.allowed(next)) {
          toast('Pourcentage non autorisé'); return;
        }
        remiseState.value = next;
        $$('#rm-pct-chips .rm-pct-chip').forEach(c => c.classList.toggle('is-active', c === pctChip));
        renderRemisePreview();
        return;
      }
      const reasonBtn = e.target.closest('[data-rm-reason]');
      if (reasonBtn) {
        remiseState.reason = reasonBtn.dataset.rmReason;
        $$('#rm-reasons .rm-reason').forEach(b => b.classList.toggle('is-active', b === reasonBtn));
        return;
      }
      if (e.target.closest('#rm-cancel'))  { closeRemiseModal(); return; }
      if (e.target.closest('#rm-remove'))  { removeRemise(); return; }
      if (e.target.closest('#rm-confirm')) { applyRemise(); return; }
    });
    $('#rm-amount').addEventListener('input', () => {
      if (remiseState.kind === 'amount') {
        remiseState.value = parseFloat($('#rm-amount').value) || 0;
        renderRemisePreview();
      }
    });
    /* ===========================================================
       REMBOURSEMENT · manager-gated refund of a past transaction
       -----------------------------------------------------------
       The cashier picks a sale from the day's journal and refunds
       it (full or partial) with a reason. The refund is recorded as
       a NEW journal entry with a NEGATIVE amount and kind:'refund' ·
       so journalTotals() (revenue / card / cash) and every reader
       (renderShiftStats, the Clôture report) reflect it for free.
       The original entry is tagged `refunded = true`.
         journal refund entry = {
           id, time, label:'Remboursement · '+orig.label,
           amount: -refundAmount,   // NEGATIVE
           method: orig.method,     // refunded on the same tender
           ref, kind:'refund', refundOf: orig.ref,
         }
       =========================================================== */
    const refundModal = $('#refund-modal');
    const refundState = { search: '', orig: null, amount: 0, reason: 'Erreur de saisie' };refundModal.addEventListener('click', (e) => {
      if (e.target === refundModal) { closeRefund(); return; }
      if (e.target.closest('#rf-cancel') || e.target.closest('#rf-confirm-cancel')) {
        closeRefund(); return;
      }
      if (e.target.closest('#rf-back')) {
        refundState.orig = null;
        renderRefundList();
        showRefundStep('pick');
        if (window.lucide) lucide.createIcons();
        return;
      }
      const reasonBtn = e.target.closest('[data-rf-reason]');
      if (reasonBtn) {
        refundState.reason = reasonBtn.dataset.rfReason;
        $$('#rf-reasons .rf-reason').forEach(b => b.classList.toggle('is-active', b === reasonBtn));
        return;
      }
      const recoveryBtn = e.target.closest('[data-rf-recover]');
      if (recoveryBtn) {
        const refund = journal.find((item) => item && String(item.id || item.ref) === recoveryBtn.dataset.rfRecover);
        if (refund) recoverRefund(refund);
        return;
      }
      if (e.target.closest('#rf-confirm')) { confirmRefund(); return; }
      const entry = e.target.closest('[data-rf-id]');
      if (entry && !entry.disabled) {
        const orig = journal.find(j => j && j.kind !== 'refund' && j.id === entry.dataset.rfId);
        if (orig) openRefundConfirm(orig);
        return;
      }
    });
    $('#rf-search-input').addEventListener('input', (e) => {
      refundState.search = e.target.value;
      renderRefundList();
    });
    $('#rf-amount').addEventListener('input', () => {
      const o = refundState.orig;
      if (!o) return;
      let amt = money(parseFloat($('#rf-amount').value) || 0);
      if (!amt) { refundState.amount = 0; }   // keep preview live while typing
      else      { amt = Math.max(0.01, Math.min(amt, refundableLeft(o))); refundState.amount = money(amt); }
      renderRefundPreview();
    });
    $('#rf-amount').addEventListener('blur', () => {
      if (!refundState.orig) return;
      clampRefundAmount();
      $('#rf-amount').value = String(refundState.amount);
      renderRefundPreview();
    });/* Stable, read-only operational identity for vertical modules. The PIN is
       deliberately absent: a folio charge carries the named roster member,
       open shift and signed terminal id, never the unlock secret. */
    window.KiwiCaisseContext = Object.freeze({
      current: function () {
        let terminalId = '', merchant = '';
        try { terminalId = String(localStorage.getItem('kiwi:caisse:terminal-id:v1') || '').trim(); } catch (_) {}
        try {
          merchant = String(window.KiwiCloudDoc?.currentSlug?.()
            || window.KiwiLive?.merchant?.()
            || window.KiwiPlatform?.pairedVenue?.()?.merchant
            || '').trim();
        } catch (_) {}
        return {
          merchant,
          terminalId,
          cashierId: cashActorId(currentCashier && currentCashier.id),
          cashierName: String(currentCashier && currentCashier.name || '').slice(0, 100),
          shiftId: shiftOpenedAt ? cashSessionId() : '',
          shiftOpenedAt: shiftOpenedAt ? shiftOpenedAt.getTime() : 0,
        };
      },
    });
    const terminalIdButton = document.getElementById('caisse-terminal-id');try {
      syncTerminalIdButton();
      window.addEventListener('storage', syncTerminalIdButton);
      window.addEventListener('focus', syncTerminalIdButton);
    } catch (_) {}
    if (terminalIdButton) terminalIdButton.addEventListener('click', async () => {
      const id = window.KiwiCaisseContext.current().terminalId;
      if (!id) { toast('Cette caisse doit d’abord être appairée'); return; }
      try { await navigator.clipboard.writeText(id); toast('Identifiant de caisse copié'); }
      catch (_) { window.prompt('Identifiant de cette caisse', id); }
    });
    const handoverModal = $('#handover-modal');
    const handoverState = { expected: 0, counted: 0, incoming: null, verifyCount: 0 };/* Operational accounting API exposed for verification and cross-module inspection */
    window.KiwiCaisseAccounting = Object.freeze({
      rollupLedger,
      journalTotals,
      posteRollup,
      handoverGapCents,
      drawerExpected,
      renderHandoverCount,
      confirmHandover,
      renderCloture,
      reconcileVoids,
      refreshOpenReconciliationModals,
    });
    handoverModal.addEventListener('click', (e) => {
      if (e.target === handoverModal)            { closeHandover(); return; }
      if (e.target.closest('#ho-count-cancel'))  { closeHandover(); return; }
      if (e.target.closest('#ho-done-close'))    { closeHandover(); return; }
      /* Le bon de passation est déjà peint dans #ho-slip · c'est la pièce que
         les deux caissiers signent. Il annonçait son envoi à l'imprimante sans
         rien envoyer. Il n'existe pas d'encodeur ESC/POS pour ce format ; on le
         donne donc au pilote du système, qui est de toute façon le bon support
         pour un document qu'on signe à deux. */
      if (e.target.closest('#ho-slip-print')) {
        const slip = document.getElementById('ho-slip');
        const KP = window.KiwiPrinter;
        if (!slip || !KP || !KP.browserPrintHTML) { toast('Impression indisponible sur cet appareil'); return; }
        try {
          Promise.resolve(KP.browserPrintHTML(slip.innerHTML, '80', 'Bon de passation')).then(
            /* Ce chemin est l'impression du système (ou le PDF dans l'app) : rien
               n'est « envoyé à l'imprimante » tant que personne n'a confirmé. */
            (r) => toast(!(r && r.ok) ? 'Impression échouée'
              : r.via === 'pdf' ? 'Bon de passation prêt · imprimer ou partager le PDF'
              : 'Bon de passation ouvert dans l\'impression système'),
            () => toast('Impression échouée')
          );
        } catch (_) { toast('Impression échouée'); }
        return;
      }

      const add = e.target.closest('[data-ho-add]');
      if (add) {
        $('#ho-count').value = (parseFloat($('#ho-count').value) || 0) + parseFloat(add.dataset.hoAdd);
        updateHandoverEcart();
        return;
      }
      const vadd = e.target.closest('[data-ho-vadd]');
      if (vadd) {
        $('#ho-verify').value = (parseFloat($('#ho-verify').value) || 0) + parseFloat(vadd.dataset.hoVadd);
        handoverState.verifyCount = money(parseFloat($('#ho-verify').value) || 0);
        updateHandoverVerdict();
        return;
      }
      if (e.target.closest('#ho-count-next')) {
        if ($('#ho-count').value === '') { toast('Compte le tiroir'); return; }
        updateHandoverEcart();
        renderHandoverVerify();
        showHandoverStep('verify');
        if (window.lucide) lucide.createIcons();
        return;
      }
      if (e.target.closest('#ho-verify-back')) {
        const keep = handoverState.counted;
        renderHandoverCount();
        $('#ho-count').value = keep ? String(keep) : '';
        updateHandoverEcart();
        showHandoverStep('count');
        return;
      }
      if (e.target.closest('#ho-verify-confirm')) {
        const inc = handoverState.incoming;
        if (!inc) { toast('Choisis le caissier entrant'); return; }
        /* Le caissier ENTRANT confirme, personne d'autre : le pavé le dit, et un
           « oui » du serveur pour une autre personne est refusé sur le pavé.
           Sur un vrai commerce la preuve de l'acteur ne vient que du serveur. */
        window.KiwiAuthAct?.({ kind: 'shift_change', key: 'act.shift_change', args: { name: inc.name } });
        requireTillOperator(`Confirmer la passation · code personnel de ${inc.name}`, confirmHandover, {
          needsServer: storeIsReal(),
          incoming: { name: inc.name },
          validate: handoverApprovalRefusal,
          hint: 'Le caissier entrant confirme avec son propre code',
        });
        return;
      }

      const pick = e.target.closest('[data-ho-cashier]');
      if (pick) {
        handoverState.incoming = CASHIER_ROSTER.find(c => c.id === pick.dataset.hoCashier) || null;
        $$('#ho-cashiers .ho-cashier').forEach(b => b.classList.toggle('is-active', b === pick));
        updateHandoverVerdict();
        return;
      }
    });
    $('#ho-count').addEventListener('input', updateHandoverEcart);
    $('#ho-verify').addEventListener('input', () => {
      handoverState.verifyCount = money(parseFloat($('#ho-verify').value) || 0);
      updateHandoverVerdict();
    });
    /* ===========================================================
       RP actions: reassign + split resume/cancel
       =========================================================== */
    document.addEventListener('click', (e) => {
      const act = e.target.closest('[data-action]');
      if (!act) return;
      const name = act.dataset.action;
      if (name === 'reassign-server' && selectedId) {
        openReassignModal(selectedId);
      } else if (name === 'discount') {
        if (mode === 'vrap') {
          openVrapRemise();
        } else if (selectedId) {
          openRemiseModal(selectedId);
        } else {
          toast('Sélectionne une table');
        }
      } else if (name === 'edit-discount') {
        if (mode === 'vrap') {
          openVrapRemise();
        } else if (selectedId) {
          openRemiseModal(selectedId);
        }
      } else if (name === 'remove-table-discount' && selectedId && tables[selectedId]) {
        e.stopPropagation();
        delete tables[selectedId].discount;
        renderRightPanel(selectedId);
        refreshTableNode(selectedId);
        toast('Remise supprimée');
      } else if (name === 'remove-vrap-discount') {
        e.stopPropagation();
        vrapDiscount = null;
        renderCart();
        toast('Remise supprimée');
      } else if (name === 'resume-split' && selectedId) {
        openSplitModal(selectedId);
      } else if (name === 'cancel-split' && selectedId) {
        const pending = tableSplits.get(selectedId);
        if (pending && pending.paidCount > 0) {
          /* Deleting the flow here kept the paid tenders in the ledger but put
             the full bill back on screen, so the remainder could be charged a
             second time. Once money has entered, the split must be completed. */
          toast('Split déjà encaissé en partie · termine les parts restantes');
          return;
        }
        if (!confirm('Annuler le split en cours ?')) return;
        tableSplits.delete(selectedId);
        const t = tables[selectedId];
        if (t && t.status !== 'khlass') {
          t.status = 'bgha-ykhlass';  // split cancelled → mesa stays Addition
          refreshTableNode(selectedId);
        }
        renderRightPanel(selectedId);
        toast('Split annulé');
      }
    });
    /* ---------- Bootstrap menu (vente rapida) ---------- */
    /* La carte du commerçant, avant le premier rendu : le miroir local d'abord
       · instantané, et il marche hors ligne · puis le serveur, qui repeindra si
       le patron a changé quelque chose depuis. */
    try { rebuildCarte(); } catch (_) {}
    renderCatPills();
    renderMenu();
    updateTeamCount();
    renderPinDots();
    /* Trois réveils : maintenant ; à l'appairage, parce que la caisse démarre
       avant de savoir à quel établissement elle appartient ; et au retour sur
       l'onglet, qui est exactement le geste du patron venant de changer un prix
       au bureau et qui repasse au comptoir. */
    try { fetchCarte(true); } catch (_) {}
    window.addEventListener('storage', (e) => {
      if (e && e.key && e.key.indexOf(CARTE_MIRROR) === 0) { try { rebuildCarte(); } catch (_) {} }
    });
    document.addEventListener('kiwi-paired', () => { try { rebuildCarte(); fetchCarte(true); } catch (_) {} });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { try { fetchCarte(false); } catch (_) {} }
    });
    /* Keep an open till aligned with menu edits made on the owner's dashboard
       over the local Wi-Fi. The mirror still serves the last known menu during
       an outage; this poll only replaces it after a successful cloud read. */
    setInterval(() => {
      if (!document.hidden) { try { fetchCarte(false); } catch (_) {} }
    }, 6000);/* cost.js est différé : pendant l'analyse il n'existe pas encore. */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindRecipes);
    else setTimeout(bindRecipes, 0);
    document.addEventListener('kiwi-paired', bindRecipes);
    /* ===========================================================
       ÉCRAN CUISINE · KDS (kitchen display, full-screen)
       -----------------------------------------------------------
       The dashboard's kitchen screen ported faithfully: an order
       board with the accept / ready flow. Orders move nouvelle →
       Accepter → en préparation → Prête → Historique. À emporter
       orders sent from the bill panel land here as new tickets.
       =========================================================== */
    /* Les sept postes de Café Atlas. Ils restent la vérité de la DÉMO, et d'elle
       seule : chez un vrai commerçant, les postes sont ceux qu'il a déclarés au
       tableau de bord (carteState.stations). */
    const KDS_STATIONS_DEMO = [
      { id: 'cuisson',  name: 'Cuisson chaude', raw: '#1F5D3C' },
      { id: 'salade',   name: 'Salade froide',  raw: '#3FB67A' },
      { id: 'pastry',   name: 'Pâtisserie',     raw: '#D99A2B' },
      { id: 'boissons', name: 'Boissons',       raw: '#3677A6' },
      { id: 'bar',      name: 'Bar cocktails',  raw: '#164A2F' },
      { id: 'bbq',      name: 'Barbecue',       raw: '#C24A2E' },
      { id: 'crepes',   name: 'Crêpes bar',     raw: '#C97A4A' },
    ];
    /* Un café qui n'a rien déclaré n'a pas zéro poste : il en a UN, sa cuisine.
       Lui inventer les sept postes de la démo mettrait sept filtres vides dans
       sa barre ; ne rien lui mettre casserait le filtrage. */
    const KDS_STATION_SOLO = { id: 'cuisson', name: 'Cuisine', raw: STATION_PALETTE[0] };
    try { window.kdsStations = kdsStations; window.KiwiCaisseStations = kdsStations; } catch (_) {}
    /* caisse menu category -> kitchen station · la table de la DÉMO, qui ne
       connaît que les catégories de Café Atlas. */
    const KDS_CAT_STATION = { entrees: 'salade', tajines: 'cuisson', couscous: 'cuisson',
      pastillas: 'cuisson', sandwiches: 'cuisson', boissons: 'boissons', desserts: 'pastry' };
    /* Recipe catalog for the KDS recipe popup. Keyed by dish name (the same
     * string the kitchen ticket renders). Each entry has a yield (portions
     * the listed quantities produce), an ingredients list (qty + name), and
     * a prep one-liner. Used to train new cuisiniers · they tap a dish on
     * a ticket and the recipe appears. */
    /* Recettes de la démo, indexées par le nom des plats de Café Atlas. Chez un
       vrai commerçant aucune clé ne peut correspondre · et si par hasard il
       vendait un « Couscous royal », lui afficher NOTRE recette serait pire que
       de n'en afficher aucune. Les siennes viendront du tableau de bord. */
    const KDS_RECIPES = IS_DEMO ? {
      'Couscous royal': { yield: 1, ingredients: [
        { q: '150 g',  n: 'Semoule fine' },
        { q: '400 ml', n: 'Bouillon de légumes' },
        { q: '180 g',  n: 'Agneau épaule' },
        { q: '150 g',  n: 'Poulet entier' },
        { q: '80 g',   n: 'Carottes' },
        { q: '80 g',   n: 'Courgettes' },
        { q: '60 g',   n: 'Navets' },
        { q: '40 g',   n: 'Pois chiches' },
      ], prep: 'Cuisson vapeur 35-40 min · agneau d\'abord, poulet 15 min plus tard, légumes en couscoussier. Beurre + bouillon sur la semoule au service.' },
      'Tajine kefta œuf': { yield: 1, ingredients: [
        { q: '180 g',  n: 'Viande hachée bœuf' },
        { q: '2 u',    n: 'Œufs' },
        { q: '120 g',  n: 'Tomates concassées' },
        { q: '50 g',   n: 'Oignons hachés' },
        { q: '4 g',    n: 'Persil' },
        { q: '3 g',    n: 'Épices kefta' },
        { q: '10 ml',  n: 'Huile d\'olive' },
      ], prep: 'Boulettes de 25 g, mijotage 12 min dans sauce tomate-épices, œufs cassés en surface 3 min avant service. Couvrir cuvette tajine au service.' },
      'Tajine poulet citron': { yield: 1, ingredients: [
        { q: '200 g',  n: 'Poulet entier (cuisses)' },
        { q: '40 g',   n: 'Citrons confits' },
        { q: '15 g',   n: 'Olives violettes' },
        { q: '40 g',   n: 'Oignons émincés' },
        { q: '3 g',    n: 'Safran (pistils)' },
        { q: '3 g',    n: 'Gingembre' },
        { q: '10 ml',  n: 'Huile d\'olive' },
      ], prep: 'Mariner poulet 20 min (safran + gingembre + ail). Mijoter 35 min, ajouter citrons + olives en fin de cuisson. Réduire sauce 5 min.' },
      'Tajine agneau pruneaux': { yield: 1, ingredients: [
        { q: '220 g',  n: 'Agneau épaule' },
        { q: '80 g',   n: 'Pruneaux dénoyautés' },
        { q: '15 g',   n: 'Amandes effilées' },
        { q: '20 g',   n: 'Sucre' },
        { q: '50 g',   n: 'Oignons' },
        { q: '5 g',    n: 'Cannelle' },
      ], prep: 'Sauter agneau, mijoter 50 min avec oignons + épices. Pruneaux trempés ajoutés 15 min avant fin avec sucre. Amandes grillées au moment du service.' },
      'Pastilla poulet': { yield: 1, ingredients: [
        { q: '3 feuilles', n: 'Brick' },
        { q: '180 g',  n: 'Poulet effiloché' },
        { q: '2 u',    n: 'Œufs' },
        { q: '40 g',   n: 'Amandes grillées' },
        { q: '30 g',   n: 'Beurre fondu' },
        { q: '15 g',   n: 'Sucre glace' },
        { q: '2 g',    n: 'Cannelle' },
      ], prep: 'Cuisson poulet (oignons + safran) 25 min. Brouiller œufs dans le jus. Monter pastilla beurre + amandes, four 8-10 min à 200°C. Saupoudrer sucre + cannelle au service.' },
      'Briouates viande': { yield: 4, ingredients: [
        { q: '8 feuilles', n: 'Brick' },
        { q: '240 g',  n: 'Viande hachée bœuf' },
        { q: '40 g',   n: 'Oignons hachés' },
        { q: '6 g',    n: 'Persil' },
        { q: '4 g',    n: 'Cumin' },
        { q: '20 g',   n: 'Beurre fondu' },
      ], prep: 'Farce viande + oignons + épices 8 min. Pliage triangle classique, badigeonner beurre. Friture 2 min par face dans huile chaude. Servir bien chaud.' },
      'Méchoui': { yield: 1, ingredients: [
        { q: '240 g',  n: 'Agneau épaule' },
        { q: '8 g',    n: 'Beurre rance (smen)' },
        { q: '4 g',    n: 'Cumin' },
        { q: '3 g',    n: 'Sel marin' },
        { q: '2 g',    n: 'Paprika' },
      ], prep: 'Frotter agneau au smen + épices, rôtir 18-22 min à 220°C selon cuisson demandée. Reposer 4 min sous papier alu. Servir avec cumin + sel à part.' },
      'Salade marocaine': { yield: 1, ingredients: [
        { q: '120 g',  n: 'Tomates' },
        { q: '80 g',   n: 'Concombre' },
        { q: '40 g',   n: 'Oignon rouge' },
        { q: '8 g',    n: 'Persil' },
        { q: '8 g',    n: 'Coriandre' },
        { q: '10 ml',  n: 'Huile d\'olive' },
        { q: '5 ml',   n: 'Jus de citron' },
      ], prep: 'Couper tomates + concombre en petits dés (5 mm), oignon finement émincé. Herbes ciselées au dernier moment. Assaisonner juste avant service.' },
      'Caviar d\'aubergine': { yield: 1, ingredients: [
        { q: '180 g',  n: 'Aubergines' },
        { q: '15 ml',  n: 'Huile d\'olive' },
        { q: '6 g',    n: 'Ail haché' },
        { q: '8 g',    n: 'Persil' },
        { q: '5 ml',   n: 'Jus de citron' },
        { q: '2 g',    n: 'Cumin' },
      ], prep: 'Aubergines rôties 25 min à 200°C, chair évidée et écrasée fourchette. Mélanger huile + ail + cumin + citron. Servir frais avec pain.' },
      'Msemen beurre & miel': { yield: 2, ingredients: [
        { q: '140 g',  n: 'Farine T55' },
        { q: '20 g',   n: 'Semoule fine' },
        { q: '90 ml',  n: 'Eau tiède' },
        { q: '3 g',    n: 'Sel' },
        { q: '20 g',   n: 'Beurre' },
        { q: '30 ml',  n: 'Miel' },
      ], prep: 'Pétrir pâte 5 min, repos 20 min. Étaler très fin, pliage 4 fois avec beurre fondu. Cuisson plancha 1 min par face. Servir avec beurre + miel séparément.' },
      'Crêpe complète': { yield: 1, ingredients: [
        { q: '90 g',   n: 'Pâte à crêpe blé noir' },
        { q: '1 u',    n: 'Œuf' },
        { q: '40 g',   n: 'Jambon' },
        { q: '50 g',   n: 'Fromage râpé' },
        { q: '10 g',   n: 'Beurre' },
      ], prep: 'Étaler pâte fine sur bilig 220°C. Casser œuf au centre, parsemer jambon + fromage. Plier en 4 quand le fromage fond. Servir aussitôt.' },
      'Cornes de gazelle': { yield: 6, ingredients: [
        { q: '200 g',  n: 'Amandes en poudre' },
        { q: '100 g',  n: 'Sucre glace' },
        { q: '15 ml',  n: 'Eau de fleur d\'oranger' },
        { q: '150 g',  n: 'Farine T55' },
        { q: '60 g',   n: 'Beurre fondu' },
        { q: '50 ml',  n: 'Eau' },
      ], prep: 'Pâte d\'amande : amandes + sucre + fleur d\'oranger. Pâte fine étalée, garniture en cornes, soudure pincée. Cuisson 12 min à 170°C, blanches.' },
      'Sandwich kefta': { yield: 1, ingredients: [
        { q: '1 u',    n: 'Pain rond (kesra)' },
        { q: '150 g',  n: 'Viande hachée bœuf' },
        { q: '40 g',   n: 'Oignons' },
        { q: '30 g',   n: 'Tomates' },
        { q: '5 ml',   n: 'Harissa douce' },
        { q: '4 g',    n: 'Cumin' },
      ], prep: 'Boulettes plates grillées 4 min par face. Pain tiède ouvert, garnir kefta + tomates + oignons. Filet harissa selon goût.' },
      'Thé à la menthe': { yield: 1, ingredients: [
        { q: '4 g',    n: 'Thé vert Gunpowder' },
        { q: '15 g',   n: 'Menthe fraîche' },
        { q: '12 g',   n: 'Sucre' },
        { q: '250 ml', n: 'Eau bouillante' },
      ], prep: 'Rincer thé à l\'eau bouillante 30 s, jeter cette eau. Infuser thé + sucre 3 min, ajouter menthe 2 min. Servir avec hauteur (oxygéner).' },
      'Café noir double': { yield: 1, ingredients: [
        { q: '18 g',   n: 'Café arabica moulu' },
        { q: '60 ml',  n: 'Eau filtrée' },
      ], prep: 'Mouture fine, extraction 25-30 s à 9 bar. Pré-infusion 4 s avant extraction principale. Servir aussitôt en tasse réchauffée.' },
      'Orange pressée': { yield: 1, ingredients: [
        { q: '3 u',    n: 'Oranges fraîches' },
      ], prep: 'Presser à l\'extracteur juste avant service. Ne pas filtrer (pulpe). Servir glacé dans verre 300 ml.' },
      'Limonade traditionnelle': { yield: 1, ingredients: [
        { q: '40 ml',  n: 'Jus de citron frais' },
        { q: '20 g',   n: 'Sucre' },
        { q: '200 ml', n: 'Eau plate fraîche' },
        { q: '3 g',    n: 'Zeste de citron' },
        { q: '4 g',    n: 'Menthe' },
      ], prep: 'Dissoudre sucre dans eau tiède, ajouter jus + zeste. Refroidir avec glaçons. Décorer menthe au service.' },
      'Cocktail mocktail': { yield: 1, ingredients: [
        { q: '60 ml',  n: 'Jus d\'ananas' },
        { q: '40 ml',  n: 'Jus de cranberry' },
        { q: '20 ml',  n: 'Sirop de grenadine' },
        { q: '15 ml',  n: 'Jus de citron vert' },
        { q: '60 ml',  n: 'Eau pétillante' },
      ], prep: 'Shaker tous les jus avec glaçons 12 s. Filtrer dans verre highball glacé. Compléter eau pétillante au sommet. Pailles + rondelle citron.' },
      'Jus d\'orange': { yield: 1, ingredients: [
        { q: '3 u',    n: 'Oranges fraîches' },
      ], prep: 'Presser à l\'extracteur juste avant service. Servir glacé dans verre 300 ml.' },
    } : {};
    const kdsOrders   = [];
    /* La démo reprend sa numérotation là où son board s'arrête. Un vrai café
       ouvert ce matin n'a pas servi 52 commandes : il imprimerait « bon #53 »
       sur son premier ticket. Il commence donc à 1. */
    let   kdsOrderSeq = IS_DEMO ? 52 : 0;
    let   kdsActiveStation = 'all';
    let   kdsHistoryOpen   = false;
    let   kdsTimer = null;
    const kdsEl = $('#kds-screen');
    /* Le board de démonstration. Avant le correctif du passage de main
       (2026-10), une caisse réelle pouvait démarrer en démo puis s'appairer :
       ce board était alors sauvegardé dans le service du VRAI commerçant, et
       sa page « À emporter » proposait d'encaisser une Pastilla à 205 MAD qui
       n'a jamais été commandée. On garde la liste ici pour reconnaître ces
       restes à la reprise du service et les écarter. */
    const KDS_DEMO_SEED = [
      { num: 38, type: 'dineIn', table: '3', status: 'ready', ago: 1880, readyAt: '13:46', items: [
        { q: 2, n: 'Couscous royal', stations: ['cuisson'] }, { q: 2, n: 'Thé à la menthe', stations: ['boissons'] } ] },
      { num: 39, type: 'glovo', code: '2904', status: 'ready', ago: 1645, readyAt: '13:58', items: [
        { q: 1, n: 'Tajine poulet citron', stations: ['cuisson'] }, { q: 1, n: 'Salade marocaine', stations: ['salade'] } ] },
      { num: 40, type: 'dineIn', table: '8', status: 'ready', ago: 1390, readyAt: '14:10', items: [
        { q: 3, n: 'Briouates viande', stations: ['cuisson'] }, { q: 2, n: 'Msemen beurre & miel', stations: ['pastry'] } ] },
      { num: 41, type: 'takeaway', status: 'ready', ago: 1155, readyAt: '14:22', total: 280, items: [
        { q: 2, n: 'Méchoui', p: 120, note: 'bien cuit', stations: ['bbq'] }, { q: 2, n: 'Orange pressée', p: 20, stations: ['boissons'] } ] },
      { num: 42, type: 'dineIn', table: '4', status: 'cooking', ago: 1010, items: [
        { q: 2, n: 'Tajine kefta œuf', note: 'sans coriandre', stations: ['cuisson'] }, { q: 1, n: 'Salade marocaine', stations: ['salade'] }, { q: 3, n: 'Thé à la menthe', stations: ['boissons'] } ] },
      { num: 43, type: 'glovo', code: '3412', status: 'cooking', ago: 742, items: [
        { q: 2, n: 'Tajine poulet citron', stations: ['cuisson'] }, { q: 1, n: 'Cornes de gazelle', stations: ['pastry'] } ] },
      { num: 44, type: 'dineIn', table: '7', status: 'cooking', ago: 620, items: [
        { q: 1, n: 'Couscous royal', stations: ['cuisson'] }, { q: 1, n: 'Pastilla poulet', stations: ['cuisson', 'pastry'] } ] },
      { num: 45, type: 'yassir', code: '8821', status: 'cooking', ago: 388, items: [
        { q: 3, n: 'Tajine kefta œuf', stations: ['cuisson'] }, { q: 2, n: 'Cocktail mocktail', stations: ['bar'] } ] },
      { num: 46, type: 'dineIn', table: '2', status: 'cooking', ago: 256, items: [
        { q: 2, n: 'Crêpe complète', stations: ['crepes'] }, { q: 4, n: 'Café noir double', note: '2 sans sucre', stations: ['boissons'] } ] },
      { num: 47, type: 'dineIn', table: '9', status: 'new', ago: 184, items: [
        { q: 4, n: 'Briouates viande', stations: ['cuisson'] }, { q: 2, n: "Caviar d'aubergine", stations: ['salade'] } ] },
      { num: 48, type: 'glovo', code: '3590', status: 'new', ago: 92, items: [
        { q: 1, n: 'Méchoui', stations: ['bbq'] }, { q: 1, n: 'Limonade traditionnelle', stations: ['boissons'] } ] },
      { num: 49, type: 'dineIn', table: '1', status: 'new', ago: 38, items: [
        { q: 1, n: 'Tajine agneau pruneaux', stations: ['cuisson'] } ] },
      { num: 50, type: 'takeaway', status: 'cooking', ago: 360, total: 130, items: [
        { q: 2, n: 'Sandwich kefta', p: 50, stations: ['cuisson'] }, { q: 2, n: 'Café noir double', p: 15, stations: ['boissons'] } ] },
      { num: 51, type: 'takeaway', status: 'ready', ago: 690, readyAt: '14:30', paid: true, total: 205, items: [
        { q: 1, n: 'Pastilla poulet', p: 145, stations: ['cuisson', 'pastry'] }, { q: 2, n: 'Thé à la menthe', p: 30, note: 'bien chaud svp', stations: ['boissons'] } ] },
      { num: 52, type: 'takeaway', status: 'ready', ago: 1500, readyAt: '14:02', paid: true, pickedUp: true, pickedUpAt: '14:09', total: 230, items: [
        { q: 3, n: 'Briouates viande', p: 65, stations: ['cuisson'] }, { q: 1, n: "Jus d'orange", p: 35, stations: ['boissons'] } ] },
    ];
    const KDS_SVG = {
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>',
      eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
      note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      book: '<svg class="kit-recipe-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
      close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    };
    /* ── kiwiSkin2027:till · le board de la caisse sur les couloirs du kit ──
       (assets/kit/kds-board.js, étape 3b). Drapeau éteint, le kit n'est pas
       chargé et rien de ceci ne tourne. Allumé : Nouvelles et En préparation
       sont deux couloirs, l'historique des bons prêts un troisième, dans son
       volet qui défile. Le board reste à la racine de la caisse (16 px) et
       défile comme avant (fit none) ; chaque geste revient ici par son nom
       (kdsAccept, kdsReady, kdsRecall, kdsOpenRecipe). Pas de « servi » ici :
       la remise se constate ailleurs, et un bon remis ne se rappelle pas. */
    let kdsKit = false;
    $('#open-kds').addEventListener('click', openKds);
    $('#kds-close-btn').addEventListener('click', () => {
      // In kitchen-display mode the close button is "Verrouiller" · back to PIN.
      if (document.body.classList.contains('is-kitchen')) { lockoutKitchen(); return; }
      closeKds();
    });
    kdsEl.addEventListener('click', (e) => {
      const st = e.target.closest('[data-kit-st]');
      if (st) { kdsActiveStation = st.dataset.kitSt; kdsPaint(); return; }
      const ht = e.target.closest('[data-kit-history-toggle]');
      if (ht) {
        kdsHistoryOpen = !kdsHistoryOpen;
        $('#kit-history').classList.toggle('open', kdsHistoryOpen);
        $('#kit-history-toggle').classList.toggle('on', kdsHistoryOpen);
        return;
      }
      const eye = e.target.closest('[data-kit-eye]');
      if (eye) { const o = kdsOrders.find(x => x.num === Number(eye.dataset.kitEye)); if (o) kdsOpenZoom(o); return; }
      const rec = e.target.closest('[data-kit-recipe]');
      if (rec) { kdsOpenRecipe(rec.dataset.kitRecipe); return; }
      const acc = e.target.closest('[data-kit-accept]');
      if (acc) { kdsAccept(Number(acc.dataset.kitAccept)); return; }
      const rdy = e.target.closest('[data-kit-ready]');
      if (rdy) { kdsReady(Number(rdy.dataset.kitReady)); return; }
    });
    /* ============================================================
       STOCK & APPROVISIONNEMENT · cashier inventory + supply orders
       ============================================================ */
    const SK_CATS = { legumes:'Légumes', viandes:'Viandes', poissons:'Poisson', boissons:'Boissons', epicerie:'Épicerie', laitiers:'Laitiers', cafe:'Café', consommables:'Conso' };
    const SK_ORD_STATUS = { 'en-attente':['En attente','pending'], 'confirmee':['Confirmée','ok'], 'recue':['Reçue','done'] };/* ---- Réception · real photo reference or manual entry ---- */
    let skReceptMode = 'photo';  // 'photo' | 'manual'
    let skReceptState = 'idle';  // 'idle' | 'scanning' | 'done'
    let skReceptLines = [];      // [{ name, qty, cost }]
    let skReceptPhoto = null;
    let skReceptSupplier = '';
    let skReceptRef = '';
    let skReceptIntentId = '';
    let skWasteIntentId = '';const stockRailTrigger = $('#open-stock');
    if (stockRailTrigger) stockRailTrigger.addEventListener('click', openStock);
    $('#stock-close-btn').addEventListener('click', closeStock);
    $('#stock-screen').addEventListener('click', (e)=>{
      const tab = e.target.closest('[data-sk-tab]');    if (tab){ stockTab = tab.dataset.skTab; renderStock(); return; }
      const cat = e.target.closest('[data-sk-cat]');    if (cat){ skCat = cat.dataset.skCat; renderStock(); return; }
      const stf = e.target.closest('[data-sk-status]'); if (stf){ skStatus = stf.dataset.skStatus; renderStock(); return; }
      const ed  = e.target.closest('[data-sk-edit]');   if (ed){ openEditItem(ed.dataset.skEdit); return; }
      const ord = e.target.closest('[data-sk-order]');  if (ord){ const it = stockItems.find(i=>i.id===ord.dataset.skOrder); openNewOrder(it && it.supplier, it && it.id); return; }
      if (e.target.closest('[data-sk-additem]'))     { openAddItem(); return; }
      if (e.target.closest('[data-sk-neworder]'))    { openNewOrder(); return; }
      if (e.target.closest('[data-sk-newwaste]') || e.target.id === 'sk-new-waste-btn'){ openWasteModal(); return; }
      if (e.target.closest('[data-sk-waste]')){ openWasteModal(e.target.closest('[data-sk-waste]').dataset.skWaste); return; }
      if (e.target.closest('[data-sk-dlc-waste]')){ const b = e.target.closest('[data-sk-dlc-waste]'); openWasteModal(b.dataset.skDlcWaste, b.dataset.skDlcLot || '', parseFloat(b.dataset.skDlcQty) || null, 'perime'); return; }
      if (e.target.closest('[data-sk-recept-act]') || e.target.id === 'sk-apercu-recept-btn'){ openRecept(); return; }
      if (e.target.closest('[data-sk-blind-count]') || e.target.id === 'sk-start-blind-count'){ if (window.KiwiPosInventoryCount) window.KiwiPosInventoryCount.open({ engine: 'ledger' }); return; }
      const cf = e.target.closest('[data-sk-confirm]'); if (cf){ confirmOrder(cf.dataset.skConfirm); return; }
      const rc = e.target.closest('[data-sk-receive]'); if (rc){ receiveOrder(rc.dataset.skReceive); return; }
      if (e.target.closest('[data-sk-validate-inv]')){ validateInventory(); return; }
    });
    $('#stock-screen').addEventListener('input', (e)=>{ if (e.target.id === 'sk-search-input'){ skSearch = e.target.value; renderSkRows(); } });
    $('#sk-modal').addEventListener('click', (e)=>{
      if (e.target.closest('[data-sk-cancel]') || e.target === $('#sk-modal')){ closeSkModal(); return; }
      const si = e.target.closest('[data-sk-save-item]'); if (si){ saveEditItem(si.dataset.skSaveItem); return; }
      if (e.target.closest('[data-sk-add-save]'))   { saveNewItem(); return; }
      if (e.target.closest('[data-sk-create-order]')){ createOrder(); return; }
      if (e.target.closest('[data-sk-commit-waste]')){ commitWaste(); return; }
      const rm = e.target.closest('[data-sk-rmode]'); if (rm){ skReceptMode = rm.dataset.skRmode; if (skReceptMode==='manual' && !skReceptLines.length) skReceptLines=[{name:'',qty:'',cost:''}]; refreshReceptModal(); return; }
      if (e.target.closest('[data-sk-scan]')){ skScan(); return; }
      if (e.target.closest('[data-sk-rline-add]')){ skReceptLines.push({name:'',qty:'',cost:''}); rerenderReceptBody(); return; }
      const rd = e.target.closest('[data-sk-rl-del]'); if (rd){ skReceptLines.splice(+rd.dataset.skRlDel,1); if (!skReceptLines.length) skReceptLines=[{name:'',qty:'',cost:''}]; rerenderReceptBody(); return; }
      if (e.target.closest('[data-sk-commit-recept]')){ commitRecept(); return; }
    });
    $('#sk-modal').addEventListener('input', (e)=>{
      const nm = e.target.closest('[data-sk-rl-name]'); if (nm){ const i=+nm.dataset.skRlName; if (skReceptLines[i]) skReceptLines[i].name = nm.value; return; }
      const qt = e.target.closest('[data-sk-rl-qty]'); if (qt){ const i=+qt.dataset.skRlQty; if (skReceptLines[i]) skReceptLines[i].qty  = qt.value; return; }
      const cs = e.target.closest('[data-sk-rl-cost]'); if (cs){ const i=+cs.dataset.skRlCost; if (skReceptLines[i]) skReceptLines[i].cost = cs.value; return; }
      if (e.target.id === 'sk-recept-sup') skReceptSupplier = e.target.value;
      if (e.target.id === 'sk-recept-ref') skReceptRef = e.target.value;
    });
    $('#sk-modal').addEventListener('change', (e)=>{ if (e.target.id === 'sk-order-supplier'){ $('#sk-order-lines').innerHTML = skOrderLinesHTML(e.target.value); if (window.lucide) lucide.createIcons(); } });
    $('#sk-recept-btn').addEventListener('click', openRecept);
    updateStockBadge();
    $('#rp-send-kitchen').addEventListener('click', sendToKitchen);
    kdsSeed();
    updateKdsCount();
    /* À partir d'ici l'écran cuisine est monté : une carte qui arrive du bureau
       peut repeindre sa barre de postes (voir rebuildCarte). */
    carteState.kdsReady = true;
    try { kdsRepaintStations(); } catch (_) {}
    /* ===========================================================
       À EMPORTER · orders board (landing) + builder toggle
       -----------------------------------------------------------
       À emporter opens on the orders board: every takeaway order
       sent to the kitchen, with its kitchen status (en préparation
       / prête, synced from the KDS), payment and pickup status.
       "Nouvelle commande" reveals the menu builder. Served orders
       drop into the history.
       =========================================================== */
    let vrapView = 'board';  // 'board' | 'builder'
    let vrapSelectedPaidNum = null;
    $('#vrap-board').addEventListener('click', (e) => {
      if (e.target.closest('#vrap-new-order')) {
        // Start a fresh order · drop any edit state and the working cart
        vrapEditingNum = null;
        clearCart();
        setVrapView('builder');
        if (window.lucide) lucide.createIcons();
        return;
      }
      const rdy = e.target.closest('[data-vrap-ready]');
      if (rdy) { vrapMarkReady(Number(rdy.dataset.vrapReady)); return; }
      const cancel = e.target.closest('[data-vrap-cancel]');
      if (cancel) {
        cancelOrderProTakeaway(kdsOrders.find(x => x && x.num === Number(cancel.dataset.vrapCancel)));
        return;
      }
      const send = e.target.closest('[data-vrap-send]');
      if (send) {
        const order = kdsOrders.find(x => x && x.num === Number(send.dataset.vrapSend));
        if (order && dispatchHeldTakeaway(order, false, true)) {
          renderVrapBoard();
          toast(`Commande ${ticketNo(order)} envoyée en cuisine · paiement en attente`);
        }
        return;
      }
      const ho = e.target.closest('[data-vrap-handover]');
      if (ho) { vrapHandover(Number(ho.dataset.vrapHandover)); return; }
      const archive = e.target.closest('[data-vrap-archive]');
      if (archive) { vrapArchivePaid(Number(archive.dataset.vrapArchive)); return; }
      const exp = e.target.closest('[data-exp-reprendre]');
      if (exp) { reprendreExpired(exp.dataset.expReprendre); return; }
      const dismiss = e.target.closest('[data-exp-dismiss]');
      if (dismiss) {
        dismissExpired(dismiss.dataset.expDismiss);
        renderVrapBoard();
        toast('Commande retirée des expirées');
        return;
      }
      // Any other click on an order card opens it (unpaid → edit + checkout).
      const card = e.target.closest('.vrap-order');
      if (card) {
        const num = Number(card.dataset.vrapNum);
        const order = kdsOrders.find(x => x.num === num);
        if (order && order.paid) {
          vrapSelectedPaidNum = vrapSelectedPaidNum === num ? null : num;
          renderVrapBoard();
        } else openVrapOrder(num);
        return;
      }
    });
    $('#vrap-back-board').addEventListener('click', () => {
      if (vrapEditingNum != null) {
        saveVrapEdits();
        vrapEditingNum = null;
        clearCart();         // empties cart + réduction, panel → empty
      }
      setVrapView('board');
    });
    /* keep "il y a X min" fresh while the board is on screen */
    setInterval(() => {
      if (mode === 'vrap' && vrapView === 'board' && document.body.classList.contains('is-unlocked')) {
        renderVrapBoard();
      }
    }, 25000);
    /* ═══════════════════════════════════════════════════════════════════════
       LE PONT · la commande du téléphone devient un ticket de cette caisse
       ═══════════════════════════════════════════════════════════════════════
       assets/orderpro-inbox.js relève déjà la file du serveur toutes les six
       secondes et sait l'afficher dans son propre panneau. Ce qu'il ne pouvait
       pas faire, c'est ENTRER : `kdsOrders`, `kdsPaint`, `renderVrapBoard` sont
       des déclarations locales de ce script · jamais posées sur `window` · donc
       un fichier séparé n'a aucun moyen de les atteindre. Le bouton
       « Accepter · envoyer en cuisine » POSTait l'état au serveur et s'arrêtait
       là : rien n'apparaissait sur l'écran cuisine, rien sur le tableau À
       emporter. Il disait vrai au serveur et faux au cuisinier.
       Ce pont est la porte manquante, et la SEULE : tout ce qui vient du
       téléphone passe par ici.
       Deux numéros, et il faut les garder distincts. `num` est le compteur
       local (kdsOrderSeq), dont dépendent la recherche par numéro et les clés
       du DOM ; `opNum` est le numéro que le SERVEUR a donné, c'est-à-dire le
       seul que le client connaisse et prononcera au comptoir. On affiche le
       second, on indexe sur le premier · sans quoi une commande client n°7 et
       une vente au comptoir n°7 se seraient écrasées l'une l'autre. */
    const opTickets = new Map();   // id serveur → ticket local
    let expiredOrders = [];        // refus récents du serveur, lecture seule (reprise)
    let archivedTakeawayScope = '';
    let archivedTakeawayIds = new Set();
    /* Ce que orderpro-inbox.js appelle à chaque tour de sondage. */
    window.KiwiCaisseKitchen = {
      /* `delta` = ce qui a changé depuis le dernier sondage (c'est le curseur
         `since` qui le décide) ; `all` = tout ce que la caisse connaît encore.
         La distinction n'est pas cosmétique : compter les commandes en attente
         sur le DELTA aurait éteint la pastille d'une table dès le sondage
         suivant, puisqu'une commande qui n'a pas bougé n'y figure plus · la
         table aurait clignoté six secondes puis se serait tue, avec la commande
         toujours en attente. Les sessions, elles, arrivent en instantané
         complet et se relisent telles quelles. */
      ingest(delta, all, sessions, closedSessions, expired) {
        let touched = false;
        /* ── LES MORTS NE PAIENT PLUS ─────────────────────────────────────
         * Le serveur expose ses refus récents (voir `expired` dans queue.js) :
         * un ticket local encore `held` dont le serveur dit « refusée » est
         * une commande morte que le TTL a tranchée. Sans ce deuil, elle
         * restait payable : on encaissait une commande que le serveur
         * refuserait (409), après avoir imprimé la cuisine en local. On
         * l'enterre donc ici, en le DISANT (numéro + reprise possible), et
         * jamais en silence. Un refus autoritaire retire aussi une commande
         * déjà connue en préparation ; il ne réécrit jamais son paiement. */
        try {
          const dead = new Set((expired || []).map(e => e && String(e.id || '')));
          if (dead.size) {
            for (let i = kdsOrders.length - 1; i >= 0; i--) {
              const t = kdsOrders[i];
              if (!t || !t.opId || !dead.has(String(t.opId))) continue;
              const gone = (expired || []).find(e => e && String(e.id || '') === String(t.opId));
              retireRejectedKitchenTicket(t);
              try { toast(`${ticketNo(t)} refusée ou annulée · retirée de la cuisine`); } catch (_) {}
              void gone;
              touched = true;
            }
            if (touched) { try { persistShift(); } catch (_) {} }
          }
          const freshExpired = (Array.isArray(expired) ? expired.slice(0, 50) : [])
            .filter(e => e && e.id && !dismissedExpiredIds.has(String(e.id)));
          if (JSON.stringify(freshExpired.map(e => e && e.id)) !== JSON.stringify(expiredOrders.map(e => e && e.id))) {
            expiredOrders = freshExpired;
            touched = true;
          }
        } catch (_) {}
        /* Qui est assis, et où une commande attend. Les deux viennent de la
           même réponse, donc le plan de salle ne se contredit jamais avec la
           file. On reconstruit les deux cartes à neuf plutôt que d'y ajouter :
           une table libérée doit s'éteindre, et un « ajout seulement » l'aurait
           laissée allumée pour le reste du service. */
        const seats = new Map();
        (sessions || []).forEach(s => {
          if (s.mode !== 'table' || !s.table) return;
          const k = tableKey(caisseTableId(s.table) || s.table);
          const localId = caisseTableId(s.table);
          if (localId && locallySettledVisit(localId, s.id)) {
            if (!recoveredPaidVisits.has(String(s.id))) {
              recoveredPaidVisits.add(String(s.id));
              document.dispatchEvent(new CustomEvent('kiwi-table-released', {
                detail: { table: localId, session: String(s.id), why: 'settle' },
              }));
            }
            return;
          }
          const closedAt = Number(tableClosedAt[k] || 0);
          const openTs = Number(s.opened_ts || 0);
          const move = phoneMovedVisits.get(String(s.id));
          // An older poll may still report the acknowledged visit at its source.
          if (move && move.from === k && move.to !== k && Number(s.seen_ts || 0) <= move.revision) return;
          const movedHere = move && move.to === k && move.closedAt === closedAt;
          // Si cette session a été ouverte à ou avant la fermeture/annulation locale de la table :
          if (!movedHere && closedAt > 0 && ((openTs > 0 && openTs <= closedAt) || (Date.now() - closedAt < 60000))) {
            if (openTs > 0 && openTs <= closedAt) {
              // The first kitchen relay can populate timerSession before the
              // floor poll supplies a seat. Once this visit is pruned, that
              // fallback must not resurrect it after phoneSeats is rebuilt.
              if (localId && tables[localId] && String(tables[localId].timerSession || '') === String(s.id)) {
                delete tables[localId].timerSession;
              }
              // Clore activement la session zombie côté serveur dans D1
              document.dispatchEvent(new CustomEvent('kiwi-table-released', {
                detail: { table: String(s.table), session: String(s.id || ''), why: 'prune-stale' },
              }));
            }
            return;
          }
          seats.set(k, { session: s.id, since: s.opened_ts, revision: Number(s.seen_ts) });
          /* S'asseoir depuis OrderPro réserve déjà réellement la table. Même
             avant l'acceptation du bon, le prochain tap doit ouvrir cette
             table et surtout pas recommencer par le nombre de couverts. */
          const id = caisseTableId(s.table);
          if (id && tables[id] && tables[id].status === 'khawya') {
            tables[id].status = 'ka-yaklo';
            resetTableTimer(tables[id]);
            touched = true;
          }
        });
        /* Install the current visit map BEFORE ingesting its changed orders.
           attachOrderProTable can then reject a stale order from an earlier
           visit to the same physical table. */
        const seatsChanged = !sameMap(seats, phoneSeats, (a, b) => a.session === b.session);
        phoneSeats.clear(); seats.forEach((v, k) => phoneSeats.set(k, v));
        /* Session closure is the durable settlement fact. It wins even when
           the shared floor document is busy and misses its best-effort close. */
        (closedSessions || []).forEach((closed) => {
          if (!closed || closed.mode !== 'table' || !closed.table) return;
          const id = caisseTableId(closed.table);
          if (!id || !tables[id]) return;
          const current = seats.get(tableKey(id));
          if (current && String(current.session) !== String(closed.id)) return;
          if (mode === 'order' && selectedId === id) return;
          if (billBelongsToOtherVisit(id, closed.id)) return;
          tables[id].status = 'khawya';
          tables[id].covers = 0;
          resetTableTimer(tables[id]);
          delete orders[id];
          delete tableOrders[id];
          delete tables[id].discount;
          delete tables[id].orderNo;
          if (selectedId === id) closeRightPanel();
          refreshTableNode(id);
          touched = true;
        });
        (delta || []).forEach(o => { opIngest(o); touched = true; });

        /* ── LA SECONDE CHANCE ────────────────────────────────────────────
         * `delta` ne présente une commande qu'UNE fois : c'est le curseur
         * `since` qui le décide. Or attachOrderProTable a le droit de refuser
         * · table absente du plan, session qui ne correspond pas, commande
         * antérieure à l'occupation. Un refus valait donc PERTE DÉFINITIVE :
         * la commande ne revenait jamais, et ses lignes n'entraient jamais
         * dans l'addition. Le client partait en ayant payé moins qu'il n'a
         * mangé, et rien ne le signalait.
         *
         * Le refus le plus fréquent n'est même pas un cas tordu : au tout
         * premier sondage après l'ouverture de la caisse, le plan de salle
         * n'est pas encore chargé, donc AUCUNE table ne résout · et tout ce
         * que ce tour-là présentait était perdu pour le service entier.
         *
         * On repasse donc sur `all` (ce que la caisse connaît encore, pas
         * seulement ce qui vient de changer) et on retente ce qui n'est pas
         * attaché. C'est sûr parce que l'attachement est idempotent : chaque
         * ligne porte le marqueur `<id de commande>:<rang>`, et une ligne déjà
         * présente est reconnue puis ignorée. Une commande refusée pour une
         * bonne raison sera refusée à nouveau, sans effet ; une commande
         * refusée pour une raison passagère rentre au tour suivant. */
        (all || []).forEach(o => {
          if (!o || o.mode !== 'table' || !o.table) return;
          if (o.channel === 'caisse' && !canRecoverCaisseTable(o)) return;
          if (o.paid || o.status === 'rejected') return;
          // Retry missing line markers too, not just entirely absent orders.
          /* Le plan de salle ne connaît pas cette table : renommée en plein
             service, ou pas encore chargée. On le DIT une fois · sans quoi
             c'est exactement le genre de perte qui ne se voit qu'au moment de
             l'addition · et on retentera au prochain tour. */
          if (!caisseTableId(o.table)) {
            const key = tableKey(o.table);
            if (!opUnmatchedTables.has(key)) {
              opUnmatchedTables.add(key);
              try { console.warn('[kiwi] commande sans table au plan de salle :', o.table, o.id); } catch (_) {}
              try { toast(`Table « ${o.table} » absente du plan de salle · commande non rattachée`, 6000); } catch (_) {}
            }
            return;
          }
          opUnmatchedTables.delete(tableKey(o.table));
          if (attachOrderProTable(o)) touched = true;
        });

        const pend = new Map();
        (all || []).forEach(o => {
          if (o.mode !== 'table' || o.status !== 'pending' || !o.table) return;
          const k = tableKey(caisseTableId(o.table) || o.table);
          pend.set(k, (pend.get(k) || 0) + 1);
        });

        const changed = seatsChanged || !sameMap(pend, phonePending, (a, b) => a === b);
        phonePending.clear(); pend.forEach((v, k) => phonePending.set(k, v));

        if (changed) { storeIsReal() ? renderRealGrid() : renderSalle(); }
        if (touched) {
          updateKdsCount();
          if (kdsEl.classList.contains('is-open')) kdsPaint();
          if (mode === 'vrap' && vrapView === 'board') renderVrapBoard();
        }
      },
      /* La caisse accepte une commande en salle : elle part en cuisine, au nom
         du serveur de cette table. */
      acceptTable(orderId) {
        const t = opTickets.get(orderId);
        const server = t ? t.server : '';
        try {
          if (window.KiwiOrderInbox && KiwiOrderInbox.setStatus) {
            KiwiOrderInbox.setStatus(orderId, 'accepted', { server });
          }
        } catch (_) {}
      },
      /* orderpro-inbox appelle ce pont uniquement après avoir obtenu la vraie
         transition pending → accepted. opIngest est idempotent sur opId : un
         bon déjà créé localement par le bouton de table ou l'encaissement est
         reconnu, jamais imprimé une seconde fois. */
      confirmAccepted(order) {
        if (!order || !order.id) return;
        /* This callback runs only on the caisse whose operator obtained the
           pending → accepted transition. It is therefore a local print action,
           not a passive remote-poll job requiring the hub lease. */
        opIngest(Object.assign({}, order, { status: 'accepted', localKitchenAction: true }));
      },
      checkoutOrder(orderId) {
        let remote = null;
        try {
          const orders = window.KiwiOrderInbox && KiwiOrderInbox.orders && KiwiOrderInbox.orders();
          remote = orders && orders[orderId];
        } catch (_) {}
        if (remote && (remote.paid || remote.status === 'rejected')) {
          toast('Commande déjà réglée ou annulée'); return false;
        }
        if (remote) opIngest(remote);
        const local = opTickets.get(orderId);
        if (remote && remote.mode === 'table') {
          const tableId = caisseTableId(remote.table);
          /* ── LA TABLE QUE LE PLAN NE CONNAÎT PAS ─────────────────────────
             Le serveur accepte, exprès, une table absente du plan : un QR
             imprimé avant une renumérotation, une étiquette « 2 » pour
             « Terrasse 2 », un restaurant qui n'a jamais dessiné sa salle. La
             commande part en cuisine, le client mange. Ici, on répondait
             « Table introuvable sur le plan » et il ne restait qu'Annuler : un
             repas servi qu'on ne pouvait plus encaisser. On l'encaisse donc au
             comptoir, comme une commande à emporter ; le paiement la clôt et
             ferme la visite de cette table (settleVrapPayment). */
          if (!tableId) {
            if (!local || !kdsOrders.includes(local) || local.paid || !vrapFinancialItems(local).length) {
              toast('Table absente du plan · envoyez d\'abord la commande en cuisine'); return false;
            }
            local.offPlan = true;
            local.type = 'takeaway';
            if (mode !== 'vrap') setMode('vrap');
            openVrapOrder(local.num);
            return vrapEditingNum === local.num && cart.length > 0;
          }
          if (remote.session && phoneSessionOf(tableId) !== String(remote.session)) {
            toast('Cette commande appartient à une autre visite'); return false;
          }
          const bill = generateOrder(tableId, tables[tableId]);
          if (!bill.length || !bill.every(l => Number.isFinite(l.total)) || bill.reduce((s, l) => s + l.total, 0) <= 0) {
            toast('Addition non disponible · actualisez la commande'); return false;
          }
          if (mode !== 'salle') setMode('salle');
          openTable(tableId);
          return true;
        }
        if (local && local.type === 'takeaway') {
          if (!kdsOrders.includes(local) || local.paid || local.pickedUp || !vrapFinancialItems(local).length) {
            toast('Commande indisponible pour encaissement'); return false;
          }
          if (mode !== 'vrap') setMode('vrap');
          openVrapOrder(local.num);
          return vrapEditingNum === local.num && cart.length > 0;
        }
        toast('Commande introuvable dans la caisse');
        return false;
      },
      printOrder(orderId) {
        const local = opTickets.get(orderId);
        if (local) {
          printKitchenTickets(local, local.items || [], { remote: false, force: true });
          toast('Impression du bon envoyée');
          return true;
        }
        let remote = null;
        try {
          const orders = window.KiwiOrderInbox && KiwiOrderInbox.orders && KiwiOrderInbox.orders();
          remote = orders && orders[orderId];
        } catch (_) {}
        if (remote) {
          opIngest(Object.assign({}, remote, { localKitchenAction: true }));
          const created = opTickets.get(orderId);
          if (created) {
            printKitchenTickets(created, created.items || [], { remote: false, force: true });
            toast('Impression du bon envoyée');
            return true;
          }
        }
        toast('Commande introuvable pour impression');
        return false;
      },
      sessionOf: phoneSessionOf,
      serverFor: serverNameFor,
    };const KC_STORE = {
      toString() { return kcStoreKey(); },
      valueOf() { return kcStoreKey(); },
      [Symbol.toPrimitive]() { return kcStoreKey(); },
    };
    let registerClosing = false;/* The caisse owns the live table state. Geometry and assignments come from
       floorplan, but occupied / bill / paid are service facts and must travel
       back to every employee phone. A compact snapshot makes every transition
       observable, including paths (cash, card, split, cancel, waitlist) that do
       not share one click handler. The server diffs snapshots and keeps the
       resulting notification history. */
    let serviceFloorSignature = '';
    let serviceFloorPublishing = false;
    let serviceFloorSince = 0;
    let serviceFloorPolling = false;
    let serviceFloorPollQueued = false;
    const SERVICE_BILL_SYNC_VERSION = 4;
    const ORDER_BRIDGE_SYNC_VERSION = 2;
    const serviceFloorLegacyTables = new Set();
    const serviceFloorLocalVersion = Object.create(null);
    const serviceFloorRemoteVersion = Object.create(null);let shiftMerchant = currentMerchantSlug();
    /* La caisse change de commerce par simple appairage, page ouverte
       (dépairer, le pavé « réappairer », le passage ?pair=1). Le service en
       mémoire reste celui de A pendant que le slug dit déjà autre chose.
       assets/till-tenant.js tient la question et le verrou ; ce crochet lui dit
       à qui appartient le service ouvert, chez qui la caisse est appairée, et
       comment écrire le service avant de le mettre de côté. */
    window.__kiwiTillTenantHook = {
      owner: () => (shiftOpenedAt ? (shiftMerchant || '') : ''),
      here: currentMerchantSlug,
      persist: () => persistShift(),
    };
    /* Les appels passent par window.KiwiTillTenant (mismatch, stamp) plutôt
       que par des fonctions d'ici : sans le module (un banc qui extrait
       quelques fonctions de cette page), ils ne font simplement rien. */
    document.addEventListener('kiwi-paired', () => {
      const here = currentMerchantSlug();
      if (!here) return;
      if (shiftOpenedAt) {
        /* Retour chez le commerce du service : l'autosave reprend, et la copie
           mise de côté n'a plus de raison d'être. */
        if (shiftMerchant === here) {
          persistShift._warned = false;
          try { persistShift(); } catch (_) {}
          try { window.KiwiTillTenant?.drop(here); } catch (_) {}
        }
        return;
      }
      /* Rien d'ouvert en mémoire (la page a été rechargée chez l'autre
         commerce entre-temps) : le service mis de côté pour CE commerce revient
         par la reprise normale, au rechargement. */
      try { if (window.KiwiTillTenant?.hasQuarantine(here)) location.reload(); } catch (_) {}
    });/* On load · if a recent shift was saved, resume straight into the shell */
    (function () {
      // A support URL must first present the explicit opening screen. Keep the
      // merchant's saved shift intact; never replay it merely by inspecting.
      if (operatorCaisseRequested()) return;
      const saved = loadPersistedShift();
      if (!saved) return;
      // A REAL / paired store must never surface DEMO shift data. A device that once
      // ran the pitch demo (or dev residue) persists a shift whose journal carries
      // seeded 'seed-*' entries (cashier "Othmane N.", café tables). On a real store,
      // STRIP every seed-* entry · FILTERING, not all-or-nothing: the earlier guard
      // used `.every(seed)`, so a single genuine 'sale-*' entry let all 47 demo seeds
      // ride along and the demo shift restored (the bug this hardens). Keep only
      // genuine entries; if none survive, discard the shift so the caisse opens clean
      // (0 transactions). When seeds are dropped, also reset the seed-derived
      // aggregates (tablesPaid + tables/orders) so the counters recompute from the
      // real journal. The next 5s autosave then rewrites the stored shift seed-free
      // (self-healing). The demo path (storeIsReal false) is untouched · verbatim.
      /* ── D'ABORD : est-ce le service de CE commerçant ? ────────────────────
         Avant toute autre question. Le filtre `seed-` qui suit protège la démo
         du réel ; il ne dit rien du réel contre le réel. Une caisse appairée
         chez A, puis réappairée chez B, restaurait le service de A · journal,
         tables, additions ouvertes, tickets cuisine · et le rapport de journée
         suivant partait chez B avec l'argent de A dedans, jusque sur le serveur
         (cf. la note dans persistShift).

         Le stockage est désormais compartimenté par commerçant (KC_STORE).
         Si le snapshot rechargé n'appartient pas à cet établissement, on ne le
         restaure pas, mais on ne l'efface surtout pas : ré-appairer la caisse
         ne doit pas détruire le service ouvert de l'autre commerce. */
      try {
        const here = (function () {
          try { return (storePaired() || {}).merchant || ''; } catch (_) { return ''; }
        })();
        /* Non appairée, la caisse n'a pas de commerce : elle n'en reprend le
           service d'aucun. Seul un blob sans commerce (démo, local) passe. */
        if (String(saved.merchant || '') !== here) {
          return;
        }
      } catch (_) {}
      try {
        if (storeIsReal()) {
          const originalJournal = saved.journal || [];
          const genuine = originalJournal.filter((e) => String(e && e.id || '').indexOf('seed-') !== 0);
          const hadDemoSeeds = genuine.length !== originalJournal.length;
          /* Un service réel peut parfaitement n'avoir encore AUCUNE vente : une
             table est ouverte, sa commande est partie en cuisine, mais personne
             n'a encore payé. L'ancien `if (!genuine.length)` supprimait alors
             tout le snapshot au F5 · table, addition et lignes · simplement parce
             que le journal d'encaissement était vide. On ne jette un journal vide
             que lorsqu'il est devenu vide APRÈS retrait de vraies lignes de démo.
             Zéro ligne au départ est un service en cours, pas une contamination. */
          if (hadDemoSeeds && !genuine.length) { localStorage.removeItem(KC_STORE); return; }
          if (hadDemoSeeds) {
            saved.journal = genuine;
            saved.tables = {}; saved.tableOrders = {}; saved.orders = {}; saved.kdsOrders = [];
            if (saved.shift) saved.shift.tablesPaid = 0;
          }
        }
      } catch (_) {}
      if (storeIsReal() && Number(saved.serviceBillSyncVersion || 0) < SERVICE_BILL_SYNC_VERSION) {
        Object.keys(saved.tableOrders || {}).forEach((id) => {
          serviceFloorLegacyTables.add(String(id));
          /* v3 imported the employee snapshot as a second bill. Those rows
             are identifiable by their employee uid; remove them once on
             restore while preserving genuine cashier lines and canonical
             orderPro/employee tickets. */
          saved.tableOrders[id] = (saved.tableOrders[id] || []).filter((line) =>
            !String(line && line.uid || '').startsWith('employee-'));
        });
      }
      if (storeIsReal() && Number(saved.orderBridgeSyncVersion || 0) < ORDER_BRIDGE_SYNC_VERSION) {
        /* Earlier bridge versions persisted every employee/OrderPro row under
           the physical table number, without the visit/session that owned it.
           Drop bridge rows once; the queue immediately reattaches only rows
           belonging to the currently open table session. Cashier-authored
           lines have no orderProLine marker and are deliberately preserved. */
        Object.keys(saved.tableOrders || {}).forEach((id) => {
          saved.tableOrders[id] = (saved.tableOrders[id] || []).filter((line) =>
            !String(line && line.orderProLine || ''));
        });
        saved.orderBridgeSyncVersion = ORDER_BRIDGE_SYNC_VERSION;
      }
      /* ── LA REPRISE NE DOIT PAS POUVOIR TUER LA CAISSE ────────────────────
       * `restoreShift` puis `enterShellDirectly` étaient appelés à nu, au
       * premier niveau du script en ligne. Ces deux fonctions relisent un
       * instantané et PEIGNENT tout de suite avec (renderSalle, setMode,
       * updateKdsCount) : un seul champ inattendu dans le snapshot · une ligne
       * de table sans nom, un ticket cuisine à moitié écrit, un split d'une
       * forme oubliée · et l'exception remontait hors de cette IIFE.
       *
       * Ce qui se trouve EN DESSOUS ne s'exécute alors jamais : l'autosave, le
       * beforeunload, le sondage de salle, tous les écouteurs. La page reste
       * blanche, sans un mot, et la caisse est morte pour de bon — c'est
       * exactement ce qu'a vu Pasta Corner à 00h55 (ticket #0069). Puis on
       * rouvre un service, et le premier autosave écrase l'instantané : les
       * commandes de la soirée disparaissent pour de vrai.
       *
       * Un instantané qu'on ne sait pas relire est un problème de support, pas
       * une raison de perdre le service. On en met donc une copie à l'abri, on
       * note que CE service-là fait tomber la caisse, et on recharge une fois :
       * la mémoire repart propre et le commerçant retrouve au moins une caisse
       * qui fonctionne. Le drapeau est en sessionStorage · s'il ne peut pas
       * s'écrire, on ne recharge pas, pour qu'aucune boucle ne soit possible. */
      const RESTORE_FAIL_FLAG = 'kiwiCaisseRestoreFailed';
      const restoreStamp = String(saved.savedAt || saved.openedAt || '');
      let alreadyFailed = '';
      try { alreadyFailed = sessionStorage.getItem(RESTORE_FAIL_FLAG) || ''; } catch (_) {}
      if (alreadyFailed && alreadyFailed === restoreStamp) {
        setTimeout(() => toast('Service non restauré · il est conservé, préviens le support', 'danger'), 800);
        return;
      }
      try {
        restoreShift(saved);
        try { adoptHeldSalesIntoJournal(); } catch (_) {}
        enterShellDirectly();
        setTimeout(() => toast('Service restauré · ' + journal.length + ' transactions'), 500);
      } catch (err) {
        try { console.error('[kiwi] reprise du service impossible', err); } catch (_) {}
        /* La copie de secours d'abord : elle doit exister AVANT que quoi que ce
           soit puisse réécrire KC_STORE. Elle ne remplace pas l'original, elle
           le double · un service rouvert écrase l'un, jamais l'autre. */
        let stashed = false;
        try {
          const raw = localStorage.getItem(KC_STORE);
          if (raw) { localStorage.setItem(KC_STORE + ':rescue', raw); stashed = true; }
        } catch (_) {}
        let flagged = false;
        try { sessionStorage.setItem(RESTORE_FAIL_FLAG, restoreStamp); flagged = true; } catch (_) {}
        if (flagged) { try { location.reload(); return; } catch (_) {} }
        setTimeout(() => toast(stashed
          ? 'Service non restauré · il est conservé, préviens le support'
          : 'Service non restauré · préviens le support', 'danger'), 800);
      }
    })();
    /* Autosave · covers refresh, tab close and crashes.
       Le rapport provisoire suit le même battement mais à son propre rythme
       (90 s, cf. saveProvisional) : il traverse le réseau, lui, et le pousser
       toutes les cinq secondes n'apprendrait rien de plus au tableau de bord. */
    window.addEventListener('beforeunload', persistShift);
    /* Held sales replay on the same beat, shift open or not: a sale from a
       closed shift still has to reach the queue. */
    setInterval(() => { persistShift(); try { saveProvisional(); } catch (_) {} try { retryHeldSales(); } catch (_) {} }, 5000);
    setTimeout(() => { try { paintHeldSales(); retryHeldSales(); } catch (_) {} }, 1500);
    setInterval(publishServiceFloor, 4000);
    /* Employee actions are interactive caisse state, not background reporting.
       Four seconds left a paid/closed table visibly open long enough for the
       cashier to reuse it or refresh the whole app. Read employee writes every
       second; publishing the full caisse snapshot can stay on its quieter
       cadence. The in-flight guard above prevents overlapping requests.
       La seconde reste la cadence de référence · c'est elle qui tient quand il
       n'y a pas de socket, et c'est le cas partout tant que le concentrateur
       n'est pas déployé. Quand une socket EST ouverte, un serveur qui libère une
       table réveille la caisse tout de suite : le sondage n'est plus la façon
       d'apprendre le changement, seulement le filet de sécurité, et il peut
       s'espacer. Il revient à la seconde de lui-même dès la coupure · la
       cadence se relit à chaque tour, on n'a rien à défaire. */
    const FLOOR_POLL_FAST = 1000;
    const FLOOR_POLL_LIVE = 8000;
    let employeeFloorTimer = null;scheduleEmployeeFloor();
    setTimeout(publishServiceFloor, 800);
    setTimeout(pollEmployeeFloor, 250);
    /* ---------- Démo, dit à l'écran ----------
       Une caisse de démo montre des tables, des serveurs et un chiffre du jour
       plausibles. Le seul « DÉMO LIVE » vivait dans la barre du haut, masquée
       depuis : rien ne disait que ce n'était pas un vrai service. Un badge à
       côté du titre, tant que la caisse n'est ni un vrai compte ni appairée. */
    (function demoBadge() {
      function isDemo() {
        try { return !(window.KiwiEnv?.isReal?.() || window.KiwiCaissePairing?.isPaired?.()); } catch (_) { return false; }
      }
      function words() {
        const lang = String(document.documentElement.lang || 'fr');
        if (lang.startsWith('ar')) return ['تجريبي', 'بيانات نموذجية، ليست خدمة حقيقية'];
        if (lang.startsWith('en')) return ['Demo', 'Sample data, not a real service'];
        return ['Démo', 'Données d’exemple, pas un vrai service'];
      }
      function paint() {
        const demo = isDemo(), [label, hint] = words();
        document.querySelectorAll('.main-head .main-title').forEach((title) => {
          let badge = title.querySelector(':scope > .demo-badge');
          if (!demo) { if (badge) badge.remove(); return; }
          if (!badge) { badge = document.createElement('span'); badge.className = 'demo-badge'; title.appendChild(badge); }
          if (badge.textContent !== label) badge.textContent = label;
          badge.title = hint;
          badge.setAttribute('aria-label', label + ' · ' + hint);
        });
      }
      paint();
      document.addEventListener('kiwi-paired', paint);
      new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    })();
    /* ---------- Lucide first paint ---------- */
    document.addEventListener('DOMContentLoaded', () => {
      if (window.lucide) lucide.createIcons();
    });
    window.addEventListener('load', () => {
      if (window.lucide) lucide.createIcons();
    });
