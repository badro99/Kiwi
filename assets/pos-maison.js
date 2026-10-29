import { $, isDemoStore, shelf, MIN, clById, fmtMAD, rayonOf, pad2, fmtHM, DAYS, icons, renderTicket, looseOf, camSupported, $$, commitEan, openCamScan, renderCats, holdStock, renderGrid, renderExchNote, renderCasse, renderScan, renderSuppliers, renderClientes, fmtDT, esc, updateRegistryContribution, useKiwiCl, fmtDay } from './pos-maison/sales.js?v=30';
import { lineAvailableQty, lineReturnedQty, renderEchanges, renderNet, toggleOffline, syncNetworkState, injectInvCss, installWedgeScanner, renderAcomptes, openPay } from './pos-maison/checkout.js?v=30';
import { intake, renderMovements, renderInventaire } from './pos-maison/inventory.js?v=30';

  'use strict';

  /* ── real-store detection ── a REAL merchant has paired their boutique (or the
     shared KiwiEnv marks the session real). Demo people (staff roster + seeded
     clientes/ventes/avoirs) are neutralized whenever pvReal() is true so a real
     store never inherits the Maison Mansour cast. Local demo ⇒ pvReal() false. */
  function pvPaired() { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }

  /* Prix et coûts saisis par le commerçant. C'était `parseInt(v, 10)`, qui coupe
   * tout ce qui suit la virgule : une chemise à 129,90 était enregistrée à 129 —
   * 0,90 MAD offert à chaque vente, et une marge fausse pour toujours. Le champ
   * est un `type=number` sans `step`, donc il ACCEPTE les décimales : seule la
   * lecture les jetait. On accepte aussi la virgule, que tape un clavier
   * français, et on arrête aux centimes — l'unité réelle du dirham. */
  function bqMoney(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  // Product sheet and promotion composer are siblings of mount(), not children.
  // Keep the selected catalogue/policy identity in their shared closure.
  let _bqKey = null;

  /* ── DEUX MAGASINS NE PARTAGENT PAS UN CATALOGUE ───────────────────────────
   * Une session réelle SANS appairage n'a ni venueId ni slug marchand. L'ancien
   * repli était le littéral 'boutique-live' — exactement celui de pos-boutique.js.
   * Deux verticales, et potentiellement deux commerces, écrivaient donc leur
   * stock et leurs prix dans la MÊME clé localStorage : le prêt-à-porter voyait
   * la vaisselle, et une correction de stock d'un côté effaçait celle de
   * l'autre. On se rabat maintenant sur l'identité du compte, et à défaut sur
   * une clé propre à cette verticale — jamais sur un nom partagé. */
  function realFallbackKey() {
    let who = '';
    try { who = String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) { who = ''; }
    if (!who) { try { who = String((window.KiwiVenues && window.KiwiVenues.currentSlug && window.KiwiVenues.currentSlug()) || '').trim().toLowerCase(); } catch (_) {} }
    const tag = who.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    return tag ? 'maison-' + tag : 'maison-live';
  }

  /* Reprise du catalogue laissé sous l'ancienne clé partagée. Une seule fois, et
     seulement si la nouvelle clé est encore vierge : on ne recouvre jamais un
     catalogue existant, et l'ancienne copie est laissée en place — si la caisse
     revenait à une version antérieure, elle la retrouverait intacte. */
  function adoptLegacySharedCatalogue(key) {
    if (!key || key === 'boutique-live' || !/^maison-/.test(key)) return;
    try {
      const target = 'kiwiBoutiqueCatalog:v1:' + key;
      if (localStorage.getItem(target)) return;
      const legacy = localStorage.getItem('kiwiBoutiqueCatalog:v1:boutique-live');
      if (!legacy) return;
      localStorage.setItem(target, legacy);
    } catch (_) {}
  }

  function toast(msg, ms, kind, desc) {
    if (typeof window.KiwiCaisseToast === 'function') { window.KiwiCaisseToast(msg, ms, kind, desc); return; }
    const stack = $('#toast-stack');
    if (!stack) return;
    const lower = String(msg || '').toLowerCase();
    kind = kind || (/refus|erreur|illisible|impossible|requis/.test(lower) ? 'danger' : /d'abord|attention|déjà|scannez/.test(lower) ? 'warn' : 'success');
    const el = document.createElement('div');
    el.className = `toast is-${kind}`;
    el.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
    const copy = document.createElement('span'); copy.className = 'toast-copy';
    const title = document.createElement('span'); title.className = 'toast-title'; title.textContent = msg;
    copy.appendChild(title);
    if (desc) { const detail = document.createElement('span'); detail.className = 'toast-desc'; detail.textContent = desc; copy.appendChild(detail); }
    el.appendChild(copy);
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), ms || 2200);
    setTimeout(() => el.remove(), (ms || 2200) + 280);
  }

  /* ───────────────────────── catalogue (base partagée) ─────────────────────────
     Le catalogue est désormais la BASE PARTAGÉE (window.KiwiBoutiqueCatalog) —
     la même que le dashboard lit/écrit. compat() reconstruit la forme
     { RAYONS, P, BY_EAN } que ce module rend déjà : la grille de vente, la fiche
     variante et la douchette parlent tous l’inventaire en direct. La baisse de
     stock à la vente reste en mémoire (démo) ; la saisie de stock et la création
     de produits se font dans la vue Inventaire et persistent dans la base. */
  let RAYONS = [], P = {}, BY_EAN = {};
  function rebuildCatalog() {
    if (!window.KiwiBoutiqueCatalog) { RAYONS = []; P = {}; BY_EAN = {}; return; }
    const c = window.KiwiBoutiqueCatalog.compat();
    RAYONS = c.RAYONS; P = c.P; BY_EAN = c.BY_EAN;
  }
  rebuildCatalog();

  const sizesOf   = (p) => Object.keys(p.sizes);
  const stockOf   = (p) => sizesOf(p).reduce((s, k) => s + p.sizes[k], 0);
  const stockAdd  = (pid, size, d) => { P[pid].sizes[size] = Math.max(0, (P[pid].sizes[size] || 0) + d); };
  /* Persist a COMMITTED stock movement (real vente / retour / échange) to the SHARED
     catalogue — the same base the owner's dashboard reads. stockAdd() above only moves
     the in-memory projection (live display + oversell guard for the open ticket); that
     projection is rebuilt from the base on the next catalogue sync, so a real store's
     stock never actually moved on a sale. This writes the net change through so stock
     counts, low-stock / rupture alerts and stock valuation stay truthful across reloads
     and on the dashboard. The local pitch demo (pvReal() false) keeps the legacy
     in-memory-only behaviour, so Maison Mansour still resets to full stock each load.
     Resolves the exact variant (produit × couleur × taille); guarded so a miss can never
     break the sale. adjustStock() commit fires the subscribe → rebuildCatalog, which
     re-sets P from the base, so this never double-counts the in-memory hold. */
  /* La vente choisit une FAMILLE ("Bleu"), l'inventaire garde des variantes
     distinctes ("navy" et "blue" restent deux articles, deux stocks, deux codes
     — on ne fusionne jamais dans le dos du commerçant). Il faut donc décider
     laquelle bouge, dans cet ordre : l'identifiant exact s'il correspond, sinon
     la même famille EN AYANT du stock (une sortie ne doit pas creuser une
     variante déjà vide pendant qu'une autre est pleine), sinon la même famille,
     sinon la taille seule. Un retour (delta > 0) revient de préférence sur une
     variante existante de la même famille. */
  /* Le journal des mouvements (assets/maison-stock-movements.js) ne s'allume
     que s'il reconnaît le métier « maison » — par la fiche du magasin ou le
     métier d'onboarding, deux choses qu'une caisse appairée n'a pas en local.
     Sur la tablette du comptoir il restait donc éteint : chaque vente bougeait
     le stock sans écrire sa ligne, et la page « Mouvements de stock » du
     tableau de bord n'affichait aucune sortie. Ce module n'est chargé QUE pour
     une caisse maison : l'allumer ici est exact par construction. */
  function ensureStockJournal() {
    try { if (pvReal() && window.KiwiMaisonStock) window.KiwiMaisonStock.enable(); } catch (_) {}
  }
  function persistStock(pid, size, color, delta, ctx) {
    if (!delta || !pvReal()) return;
    ensureStockJournal();
    ctx = ctx || {};
    try {
      const cat = window.KiwiBoutiqueCatalog;
      if (!cat || !cat.listVariants || !cat.adjustStock) return;
      const sameSize = (cat.listVariants(pid) || []).filter((x) => String(x.size) === String(size));
      const fam = (x) => (cat.colorFamily ? cat.colorFamily(x) : x.colorId);
      const covers = (x) => (x.stock || 0) >= -delta;
      // Sur une SORTIE, « en avoir » passe avant « porter le même identifiant » :
      // sinon une vente de bleu se déduirait d'une variante bleue déjà vide
      // pendant que la variante marine, elle, est pleine — le magasin perdrait la
      // sortie de son stock. Sur un RETOUR, l'identifiant exact suffit.
      const matched = (delta < 0 && sameSize.find((x) => x.colorId === color && covers(x)))
             || (delta < 0 && sameSize.find((x) => fam(x) === color && covers(x)))
             || sameSize.find((x) => x.colorId === color)
             || sameSize.find((x) => fam(x) === color);
      /* Dernier recours : la couleur vendue n'existe pas du tout dans cette
         taille. Ne rien bouger fausserait le total du magasin — la pièce est
         bien sortie. Mais imputer en silence sur `sameSize[0]` écrivait « vente
         de marine » sur un article que personne n'a pris, et creusait au hasard
         une variante peut-être déjà vide pendant qu'une autre était pleine. On
         retient donc d'abord une variante qui a réellement du stock, et on DIT
         dans le motif que la couleur n'a pas été appariée : l'approximation
         reste lisible dans le journal au lieu d'être maquillée en certitude. */
      const v = matched || sameSize.find((x) => covers(x)) || sameSize[0];
      /* Le MOTIF suit le mouvement. Le stock est désormais un journal
         (assets/boutique-catalog.js) : « vente » et « retour » distinguent une
         sortie au comptoir d'une reprise, ce qui rend le journal lisible le jour
         où quelqu'un demande où sont passées douze pièces. */
      /* La RÉFÉRENCE du ticket suit le mouvement jusqu'au registre : c'est elle
         qui permet, six mois plus tard, de relier une sortie de stock à la vente
         qui l'a causée — et à l'employé qui l'a encaissée. */
      if (v) cat.adjustStock(v.id, delta, (ctx.why || (delta < 0 ? 'vente' : 'retour')) + (matched ? '' : ' · couleur non appariée'), {
        ref: ctx.ref || '', actor: ctx.actor || ((window.KiwiStaff && window.KiwiStaff.name) || ''),
      });
    } catch (_) {}
  }
  /* ══════════ UNE VENTE SORTIE DES LIVRES REND SON STOCK ═══════════════════
   * La console opérateur peut retirer une vente d'essai des livres (« god mode » ,
   * functions/api/admin/sales.js) : `void_ts` est daté, /api/feed cesse de servir
   * la ligne, et le tableau de bord recalcule tout à partir de là — recette,
   * panier, classement produits. Impeccable côté argent.
   *
   * Côté MARCHANDISE, rien ne bougeait. La vente d'essai avait décrémenté le
   * stock partagé au moment de l'encaissement (persistStock ci-dessus), et ce
   * mouvement-là restait : le tableau de bord affichait la bonne recette et un
   * stock faux, et l'article manquait à l'inventaire d'une vente qui, selon
   * Kiwi lui-même, n'avait jamais eu lieu. Sur une installation où l'on passe
   * cinq ou six ventes d'essai, c'est tout le comptage d'ouverture qui est
   * décalé.
   *
   * Ce n'est pas le serveur qui peut le réparer. La ligne qu'il détient ne porte
   * que { nom, quantité, total, rayon } — pas l'identifiant du produit, pas la
   * couleur, pas la taille (voir le panier construit dans onPaid). La caisse qui
   * a encaissé, elle, tient tout cela dans son propre journal. C'est donc elle
   * qui rend le stock, et elle seule : une AUTRE caisse du même magasin ne
   * trouvera pas la vente dans son journal et ne fera rien — ce qui est
   * exactement le comportement voulu, sans avoir à se coordonner.
   *
   * Trois règles :
   *  · EXACTEMENT UNE FOIS. La marque `voided` portée par la vente EST le
   *    registre : on ne rend le stock qu'en la posant. Le serveur renvoyant la
   *    liste complète des retraits à chaque passage, tout compteur séparé aurait
   *    fini par gonfler le stock à chaque sondage.
   *  · DANS LES DEUX SENS. « Remettre » fait disparaître la vente de la liste :
   *    la marque tombe et le stock ressort. Une vente d'essai remise en jeu par
   *    erreur ne laisse donc pas de marchandise fantôme.
   *  · LES LIGNES DÉJÀ RENDUES NE LE SONT PAS DEUX FOIS. Un article retourné au
   *    comptoir (restoreLines) a déjà regagné le stock ; le retrait des livres
   *    ne doit pas l'y remettre une seconde fois.
   *
   * Une vente plus ancienne que le journal (RETAIN_DAYS) n'est plus là : on ne
   * fait rien et on ne prétend rien. Rendre à l'aveugle le stock d'une vente de
   * trois semaines, alors que l'inventaire a été recompté depuis, ferait plus de
   * dégâts que le décalage qu'on prétend corriger. */
  function reconcileVoids(refs) {
    if (IS_DEMO || !pvReal()) return 0;
    const KP = window.KiwiPosSale;
    const hit = (KP && KP.refMatcher) ? KP.refMatcher(refs) : null;
    let touched = 0;
    const move = (sale, sign) => {
      /* Une copie importée du serveur peut venir d'une AUTRE caisse. Seule la
         caisse qui a réellement décrémenté le stock répare un void God mode ;
         celle-ci marque la vente sortie mais ne rend pas la marchandise deux fois. */
      if (sale.remote) return;
      (sale.lines || []).forEach((ln) => {
        if (!ln) return;
        const remaining = lineAvailableQty(ln);
        if (!remaining) return;                  // déjà rendue au comptoir
        persistStock(ln.pid, ln.size, ln.color, sign * remaining, { ref: sale.num || sale.id, why: sign > 0 ? 'remb' : 'vente' });
      });
    };
    SALES.forEach((sale) => {
      if (!sale || !sale.id) return;
      const out = !!(hit && hit(sale.id));
      if (out === !!sale.voided) return;         // rien à faire pour celle-ci
      if (out) { move(sale, +1); sale.voided = true; }   // sortie : la marchandise revient
      else { move(sale, -1); sale.voided = false; }      // remise : elle repart
      touched++;
    });
    if (touched && root) {
      persistDay();
      rebuildCatalog();      /* le stock a bougé : la grille de vente le montre */
      pruneTicket();
      refreshOps();
      /* La ligne d'argent, explicitement : renderView() ne la touche pas, et
         c'est LE chiffre que l'opérateur vient de promettre au commerçant de
         faire disparaître. Le stock corrigé sous un total inchangé aurait juste
         déplacé le mensonge. */
      const today = $('#mz-today', root);
      if (today) today.textContent = headSubVente();
    } else if (touched) {
      persistDay();
    }
    return touched;
  }

  const sizeWord  = (p) => p.kind === 'pointure' ? 'Pointure' : p.kind === 'tu' ? 'Pièce unique' : 'Format';
  const firstFree = (p) => sizesOf(p).find((k) => p.sizes[k] > 0) || null;

  /* ───────────────────────── équipe & clientes (Tanger · Centre) ───────────── */
  /* A REAL boutique never inherits Vogue Home's staff — the roster is
     neutralized (« Vendeur N », blank role) while keeping the same shape/length.
     Local demo (pvReal() false) keeps the named cast, byte-identical. */
  const STAFF = pvReal() ? {
    gerante:   { name: 'Vendeur 1', role: '' },
    conseil:   { name: 'Vendeur 2', role: '' },
    caissiere: { name: 'Vendeur 3', role: '' },
  } : {
    gerante:   { name: 'Soraya Lahlou', role: 'Gérante Vogue Home' },
    conseil:   { name: 'Kenza Tazi',     role: 'Conseillère d’art de table' },
    caissiere: { name: 'Yasmine',        role: 'Caisse' },
  };

  /* The person who entered their code owns this session: their name goes on the
     ticket header and on every sale's `by`, so the day's takings are attributable
     to whoever actually rang them. Mutates the existing object rather than
     replacing it, because the render paths read STAFF.caissiere directly — and it
     re-runs on every unlock, so a handover follows the person, not the module's
     first load. Real stores only; the local demo keeps its named cast. */
  function syncTillStaff() {
    if (!pvReal()) return;
    const me = window.KiwiStaff;
    if (!me || !me.name) return;
    STAFF.caissiere.name = me.name;
    STAFF.caissiere.role = me.role || '';
  }

  /* A REAL boutique starts with an empty client book (its own clientes are read
     from KiwiClients / captured at the till). Only the local demo seeds this cast. */
  const CLIENTES = pvReal() ? [] : [
    { id: 'c1', name: 'Lalla Kenza Alami', phone: '0661 42 18 30', points: 1420, taille: 'TU', achats: 8, spent: 16800, vip: true,
      prefs: ['Service Fès Bleu', 'Emballage cadeau systématique'],
      history: [{ when: '24 mai', what: 'Service 18 pcs Fès Bleu', amt: 1450 }, { when: '12 avr.', what: 'Bougie Max 24 Totem', amt: 1850 }] },
    { id: 'c2', name: 'Mme Ghita Benjelloun', phone: '0664 77 02 19', points: 650, taille: 'TU', achats: 5, spent: 5400,
      prefs: ['Liste de mariage en cours', 'Verres Beldi émeraude'],
      history: [{ when: '10 juin', what: 'Verres soufflés Beldi (Lot 6)', amt: 140 }, { when: '18 mai', what: 'Carafe Beldi 1.5L', amt: 120 }] },
    { id: 'c3', name: 'Lalla Meryem Berrada', phone: '0667 31 55 08', points: 2300, taille: 'TU', achats: 12, spent: 28900, vip: true,
      prefs: ['Céramique Majorelle', 'Livraison fragile Marshan'],
      history: [{ when: '28 mai', what: 'Vase céramique émaillée', amt: 650 }, { when: '6 mai', what: 'Service Zellige Vert', amt: 1100 }] },
    { id: 'c4', name: 'Dr. Nabil El Omari', phone: '0650 09 64 12', points: 310, taille: 'TU', achats: 3, spent: 2600,
      prefs: ['Diffuseurs senteurs Tanger'],
      history: [{ when: '30 mai', what: 'Diffuseur Fleur d’Oranger Tanger', amt: 480 }] },
    { id: 'c5', name: 'Mme Sofia Tazi', phone: '0668 23 90 41', points: 450, taille: 'TU', achats: 2, spent: 1800,
      prefs: ['Cadeaux d’affaires & emballages prestige'],
      history: [{ when: '3 juin', what: 'Plateau laiton martelé', amt: 420 }] },
  ];
  const CL = Object.fromEntries(CLIENTES.map((c) => [c.id, c]));
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const firstName = (name) => name.replace(/^Lalla\s+|^Mme\s+/i, '').split(/\s+/)[0];
  const IS_DEMO = isDemoStore();  // frozen for this session — gates the seeded demo sales/avoirs/ticket

  /* ───────────────────────── ventes du jour (seed, mi-journée) ──────────── */
  const NOW = Date.now();
  const mkLine = (pid, size, color, qty, remise) => {
    const p = P[pid];
    const rem = remise || 0;
    return { pid, size, color, qty, remise: rem, unit: shelf(p.price * (100 - rem) / 100), returned: false, note: '' };
  };
  const SALES = IS_DEMO ? [
    { id: '1207', at: new Date(NOW - 24 * MIN),  clientId: 'c4', by: 'Rania', kind: 'vente', methods: 'espèces',
      lines: [mkLine('caftan_ete', 'S', 'ivoire', 1), mkLine('broche_perles', 'TU', 'argent', 1)] },
    { id: '1206', at: new Date(NOW - 57 * MIN),  clientId: 'c3', by: 'Aicha', kind: 'vente', methods: 'carte',
      lines: [mkLine('takchita_sultane', 'M', 'dore', 1, 10)] },
    { id: '1205', at: new Date(NOW - 96 * MIN),  clientId: null, by: 'Aicha', kind: 'vente', methods: 'espèces',
      lines: [mkLine('cabas_berbere', 'TU', 'terracotta', 1)] },
    { id: '1204', at: new Date(NOW - 135 * MIN), clientId: 'c2', by: 'Salma', kind: 'vente', methods: 'carte',
      lines: [mkLine('babouche_brodee', '38', 'rose', 1), mkLine('foulard_soie', 'TU', 'safran', 1)] },
    { id: '1203', at: new Date(NOW - 170 * MIN), clientId: null, by: 'Rania', kind: 'vente', methods: 'espèces',
      lines: [mkLine('babouche_homme', '42', 'camel', 1)] },
  ] : [];
  SALES.forEach((s) => { s.total = s.lines.reduce((t, l) => t + l.unit * l.qty, 0); });
  /* Jamais une vente sortie des livres : elle a disparu des écrans, mais un
     identifiant retenu dans state.ret / state.exchange peut encore la désigner
     une seconde après le retrait. */
  const findSale = (id) => SALES.find((s) => s.id === id && !s.voided);
  /* Résout la cliente d'une vente. IMPÉRATIF : passer par clById, pas par CL[…].
     Sur une VRAIE boutique, CLIENTES/CL sont vides (le carnet vit dans KiwiClients),
     donc CL[s.clientId] renvoyait toujours undefined et TOUTE vente s'affichait
     « Cliente de passage » à l'écran Échanges & avoirs — alors que checkout() avait
     bien horodaté le bon clientId. clById route vers KiwiClients quand c'est réel et
     garde le comportement démo intact. */
  const saleClient = (s) => (s && s.clientId ? clById(s.clientId) : null);

  /* avoirs actifs — store credit. AV-2031 vient du retour cherbil d'hier. */
  const AVOIRS = IS_DEMO ? [
    { code: 'AV-2031', amount: 350, balance: 350, holderId: 'c2', holderName: 'Mme Ghita Benjelloun',
      motif: 'Retour verres Beldi · lot 6', at: new Date(NOW - 26 * 3600 * 1000), until: new Date(NOW + 182 * 24 * 3600 * 1000), from: '1188' },
  ] : [];
  let avSeq = 2032;
  /* A voucher is spendable only while it has balance and is not expired. Keep
     the rule in one function so list, selection and final deduction agree. */
  const avoirExpired = (a) => !!(a && a.until && new Date(a.until).getTime() < Date.now());
  const activeAvoirs = () => AVOIRS.filter((a) => a.balance > 0 && a.status !== 'cancelled' && a.status !== 'consumed' && !avoirExpired(a));

  /* Les avoirs (bons d'achat) d'une VRAIE boutique doivent survivre à un
     rechargement de la caisse — sinon un bon émis sur un retour disparaît au
     prochain refresh et la cliente ne peut plus le consommer (perte sèche de
     crédit magasin). On les range comme le journal du jour (préfixe `kiwi:`,
     purgé au changement de compte via TENANT_PREFIXES), mais SANS filtre
     « aujourd'hui » : un bon vit jusqu'à sa consommation ou son expiration.
     avSeq repart au-delà du dernier code restauré pour ne pas réémettre un code
     déjà en circulation. La démo reste en mémoire, inchangée. */
  const AVOIR_KEY = 'kiwi:bqAvoirs';
  /* Le cache des avoirs est RANGÉ PAR COMMERCE (`kiwi:bqAvoirs@<slug>`). Une
     seule clé pour tous valait tant qu'un appareil n'avait qu'un commerçant,
     mais une tablette qui change de boutique SANS ré-appairage complet (compte
     multi-établissements, vue opérateur) montrait les bons de la précédente, et
     la caisse proposait de les consommer. On range, on n'efface pas : chaque
     commerce retrouve les siens, personne ne lit ceux d'un autre. L'ancienne
     clé, sans propriétaire connu, n'est plus lue (le registre serveur refait le
     cache au chargement). */
  function avoirKey() { return AVOIR_KEY + '@' + (merchantSlug() || 'local'); }
  function persistAvoirs() {
    if (IS_DEMO) return;
    try {
      const keep = AVOIRS.filter((a) => a && a.balance > 0 && a.status !== 'cancelled'
        && a.status !== 'consumed' && (!a.until || new Date(a.until) > new Date()));
      localStorage.setItem(avoirKey(), JSON.stringify(keep));
    } catch (_) {}
  }
  (function restoreAvoirs() {
    if (IS_DEMO) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(avoirKey()) || '[]'); } catch (_) { return; }
    if (!Array.isArray(saved) || !saved.length) return;
    let maxSeq = avSeq - 1;
    saved.forEach((a) => {
      if (!a || !a.code) return;
      a.at = a.at ? new Date(a.at) : new Date();
      a.until = a.until ? new Date(a.until) : null;
      a.amount = +a.amount || 0;
      a.balance = +a.balance || 0;
      AVOIRS.push(a);
      const n = parseInt(String(a.code).replace(/^\D+/, ''), 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    });
    if (maxSeq >= avSeq) avSeq = maxSeq + 1;   // le prochain bon ne réutilise pas un code déjà restauré
  })();

  function creditFromServer(row) {
    return {
      id: row.id, code: row.code, amount: Number(row.amountCents || 0) / 100,
      balance: Number(row.balanceCents || 0) / 100, holderId: row.customerId || null,
      holderName: row.customerName || 'Porteur du bon', motif: row.reason || 'Retour',
      at: new Date(Number(row.createdAt || Date.now())), until: new Date(Number(row.expiresAt || 0)),
      from: row.originalRef || row.originalSaleId || null, status: row.status || 'active',
      events: Array.isArray(row.events) ? row.events : [],
    };
  }

  async function creditRequest(body, query) {
    const merchant = merchantSlug();
    if (!merchant) throw new Error('merchant-unavailable');
    const url = '/api/store-credits?merchant=' + encodeURIComponent(merchant) + (query || '');
    const response = await fetch(url, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, merchant }),
    } : { headers: { Accept: 'application/json' } });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || !data || data.error) {
      const error = new Error((data && data.error) || `http-${response.status}`);
      error.code = (data && data.error) || `http-${response.status}`;
      throw error;
    }
    return data;
  }

  async function refreshRemoteAvoirs() {
    if (IS_DEMO || typeof fetch !== 'function') return AVOIRS;
    try {
      const data = await creditRequest(null, '');
      AVOIRS.splice(0, AVOIRS.length, ...(data.credits || []).map(creditFromServer));
      persistAvoirs();
      renderBadges();
    } catch (_) { /* cached credits remain visible; redemption still fails closed server-side */ }
    return AVOIRS;
  }

  /* Émettre un avoir CRÉE UNE DETTE : c'est un remboursement dont la somme reste
     chez nous. Il demande donc le même accord qu'un remboursement. Le responsable
     frappe son code, le serveur le vérifie (/api/pin/verify) et rend une capacité
     liée à CETTE émission (ticket, montant, identifiant, moyen « avoir ») ;
     /api/store-credits la relit et refuse sans elle. Le code, lui, ne voyage pas. */
  function avoirApproval(amount, requestId, originalSaleId) {
    return new Promise((resolve, reject) => {
      const refuse = (code) => { const error = new Error(code); error.code = code; reject(error); };
      if (typeof window.requireManager !== 'function') { refuse('manager-required'); return; }
      try { if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'refund', key: 'act.refund', args: { amount: fmtMAD(amount) } }); } catch (_) {}
      window.requireManager(`Avoir ${fmtMAD(amount)} · ticket ${originalSaleId}`,
        (manager) => resolve((manager && manager.approval) || ''),
        { kind: 'refund', refundId: requestId, originalSaleId, amountCents: Math.round(amount * 100), refundMethod: 'avoir' },
        { onCancel: () => refuse('manager-cancelled') });
    });
  }

  function creditIntent(prefix) {
    try { if (crypto && crypto.randomUUID) return `${prefix}:${crypto.randomUUID()}`; } catch (_) {}
    return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
  }

  function creditErrorDetail(error) {
    const code = error && error.code;
    if (code === 'sale-credit-exceeds-available') {
      return 'Ce ticket n’est pas encore synchronisé, ou il a déjà été remboursé jusqu’à son montant disponible.';
    }
    if (code === 'manager-cancelled') return 'Autorisation du responsable annulée. Rien n’a été remis en stock.';
    if (code === 'manager-required') return 'L’accord d’un responsable est nécessaire pour émettre un avoir. Rien n’a été remis en stock.';
    return 'Connexion au registre des avoirs impossible. Rien n’a été remis en stock.';
  }

  function stableCreditIssueId(sale, quantities, amountCents) {
    const original = String((sale && (sale.serverId || sale.syncId || sale.id)) || 'sale')
      .replace(/[^A-Za-z0-9:._-]/g, '').slice(0, 48);
    const revision = Array.from(quantities.entries()).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idx, qty]) => {
      const line = sale && sale.lines && sale.lines[idx];
      return `${idx}-${lineReturnedQty(line) + Number(qty || 0)}`;
    }).join('_');
    return `credit-issue:${original}:${revision}:${Math.round(Number(amountCents) || 0)}`.slice(0, 96);
  }

  function stableRefundId(sale, quantities, amountCents) {
    const original = String((sale && (sale.serverId || sale.syncId || sale.id)) || 'sale')
      .replace(/[^A-Za-z0-9:._-]/g, '').slice(0, 42);
    const revision = Array.from(quantities.entries()).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idx, qty]) => {
      const line = sale && sale.lines && sale.lines[idx];
      return `${idx}-${lineReturnedQty(line) + Number(qty || 0)}`;
    }).join('_');
    return `refund:${original}:${revision}:${Math.round(Number(amountCents) || 0)}`.slice(0, 64);
  }

  /* Une vente que la file de Live Link refuse est gardée sur la vente et
     renvoyée plus tard, une seule fois (assets/retail-sale-hold.js). */
  let bqHoldKit = null;
  const bqHold = () => bqHoldKit || (bqHoldKit = window.KiwiRetailSaleHold
    ? window.KiwiRetailSaleHold.create({ sales: () => SALES, persist: () => persistDay(), isDemo: IS_DEMO, slug: () => merchantSlug(),
      onLost: () => toast('Vente NON sauvegardée : stockage de la tablette plein et serveur injoignable. Ne rechargez pas la page, notez le ticket.', 15000, 'warn') })
    : null);
  function bqReplayHeld() { const h = bqHold(); return h ? h.replay() : 0; }
  function bqPost(sale, payload) {
    const h = bqHold();
    if (h) return h.post(sale, payload);
    try { return window.KiwiLive.postSale(payload); } catch (_) { return null; }
  }

  /* Rebuild the immutable cloud receipt from the frozen local sale. This is
     also the migration path for tickets sold before gross receipt values were
     stored separately from owner revenue. */
  function originalSalePayload(sale) {
    if (!sale) return null;
    const parts = Array.isArray(sale.parts) ? sale.parts : [];
    const received = parts.filter((part) => part && part.m !== 'avoir' && part.m !== 'livraison' && (+part.amount || 0) > 0);
    const methods = received.map((part) => part.m);
    const method = sale.tenderVersion === 2 ? bqPaymentMethod(parts)
      : (methods.includes('carte') ? 'card' : (methods.includes('espèces') ? 'cash' : 'wallet'));
    const creditIn = parts.reduce((sum, part) => sum + (part && part.m === 'avoir' ? (+part.amount || 0) : 0), 0);
    const delivery = parts.some((part) => part && part.m === 'livraison');
    const consigned = Math.max(0, Number(sale.consigned) || (sale.lines || []).reduce((sum, line) => sum + (line && line.consigned ? (+line.unit || 0) * (+line.qty || 0) : 0), 0));
    /* Un ticket à 0 (tout offert) reste à 0 : seul un total absent retombe sur les lignes. */
    const total = Math.max(0, sale.total != null && sale.total !== '' && Number.isFinite(+sale.total) ? +sale.total : (sale.lines || []).reduce((sum, line) => sum + (+line.unit || 0) * (+line.qty || 0), 0));
    const cashIn = sale.remote && sale.receivedAmount != null
      ? Math.max(0, Number(sale.receivedAmount) || 0)
      : Math.max(0, received.reduce((sum, part) => sum + (+part.amount || 0), 0) - consigned);
    const lineTotals = bqLineTotals((sale.lines || []).map((line) => (+line.unit || 0) * Math.max(1, Number(line.qty) || 1)), Number(sale.balanceTotal) || total);
    const lines = bqFoldBasket((sale.lines || []).map((line, i) => ({
      itemId: line.pid || '', variantId: line.variantId || [line.pid || '', line.size || '', line.color || ''].join(':'),
      name: line.name || (P[line.pid] && P[line.pid].name) || 'Article retiré du catalogue',
      qty: Math.max(1, Number(line.qty) || 1), total: lineTotals[i],
      cat: line.category || rayonOf(line.pid) || '', unit: 'piece', kind: 'product',
    })));
    const payload = {
      id: sale.serverId || sale.syncId || sale.id,
      merchant: merchantSlug(), amount: cashIn, amountCents: Math.round(cashIn * 100),
      ticketAmountCents: Math.round(total * 100), consignedAmountCents: Math.round(consigned * 100),
      method, channel: delivery ? 'delivery' : 'counter', label: (lines[0] && lines[0].name) || 'Vente',
      ref: sale.id, ts: +new Date(sale.at || Date.now()), lines,
    };
    if (sale.tenderVersion === 2) payload.paymentParts = bqPaymentParts(parts);
    if (cashIn <= 0 && creditIn > 0 && lines.length) {
      payload.settlementKind = 'store-credit'; payload.creditAmountCents = Math.round(creditIn * 100);
    } else if (cashIn <= 0 && consigned >= total && total > 0 && lines.length) {
      payload.settlementKind = 'consignment';
    } else if (cashIn <= 0 && delivery && lines.length) {
      payload.settlementKind = 'receivable';
    }
    return payload;
  }

  async function ensureOriginalSale(sale) {
    if (IS_DEMO) return sale && (sale.serverId || sale.syncId || sale.id);
    const payload = originalSalePayload(sale);
    if (!payload || !payload.id || !payload.merchant || !payload.lines.length) {
      const error = new Error('sale-unavailable'); error.code = 'sale-unavailable'; throw error;
    }
    const response = await fetch('/api/sale', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    let data = null; try { data = await response.json(); } catch (_) {}
    if (!response.ok || !data || data.error) {
      const error = new Error((data && data.error) || `http-${response.status}`);
      error.code = (data && data.error) || `http-${response.status}`;
      throw error;
    }
    sale.serverId = String(data.id || payload.id);
    persistDay();
    return sale.serverId;
  }

  refreshRemoteAvoirs();

  /* ───────────────────────── state ───────────────────────── */
  /* Le préfixe ne sert plus qu'à reconnaître les anciens journaux locaux lors
     de leur migration. Les nouveaux tickets réels n'affichent que des chiffres. */
  function ticketPrefix() {
    if (IS_DEMO) return 'MM';
    const pv = pvPaired();
    const ini = String((pv && pv.name) || '')
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map((w) => w[0]).join('')
      .normalize('NFD').replace(/[^A-Za-z]/g, '')
      .toUpperCase();
    return ini || 'KW';
  }
  const TK = ticketPrefix();
  /* 1000 : quatre chiffres, qui se disent d'un trait au téléphone. Pour une
     vraie boutique ce n'est qu'un plancher de migration : le serveur réserve les
     plages qui font autorité et saleSeq ne peut que le pousser vers le haut. */
  let saleSeq = IS_DEMO ? 1208 : 1000;
  let saleSeqPeriod = new Date().getFullYear();

  /* ── le journal du jour survit à un rechargement (boutiques réelles) ───────
     SALES ne vivait qu'en mémoire : recharger la caisse remettait son en-tête à
     « 0 vente · 0 MAD aujourd'hui » alors que le dashboard, qui lit le serveur,
     affichait toujours la recette du jour. Une caissière et la gérante ne doivent
     jamais lire deux chiffres différents pour la même journée.
     Rangé sous le préfixe `kiwi:` pour qu'un changement de compte le purge (voir
     TENANT_PREFIXES dans identity.js), et filtré sur aujourd'hui au chargement :
     le compteur bascule donc tout seul à minuit. saleSeq est repris au-delà du
     dernier numéro restauré, sinon le ticket suivant réutiliserait un numéro déjà
     encaissé. La démo garde ses ventes en mémoire, inchangée. */
  const DAY_KEY = 'kiwi:bqDay';
  /* « Aujourd'hui » = la journée commerciale (bascule à 5 h), la même que le
     tableau de bord et le rapport journalier. Minuit coupait en deux un service
     de soirée : à 0 h 30 la caisse affichait une vente, le rapport cinq. */
  function businessDayKey(ts) {
    const R = window.KiwiDayReport;
    try { if (R && R.businessDay) return R.businessDay(ts); } catch (_) {}
    const x = new Date(ts - 5 * 3600000);
    return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate();
  }
  function isToday(d) {
    const t = +new Date(d);
    return !isNaN(t) && businessDayKey(t) === businessDayKey(Date.now());
  }
  /* La même journée, écrite 'YYYY-MM-DD' pour un <input type="date"> : la page
     des retours la compare aux ventes. Elle découpait à minuit, si bien qu'à
     0 h 30 une vente de 23 h quittait « Aujourd'hui » pour « Hier » alors que
     le reste de la caisse la comptait encore dans la journée. */
  function businessDateKey(ts) {
    const t = +new Date(ts);
    const R = window.KiwiDayReport;
    try { if (R && R.businessDay) { const k = R.businessDay(t); if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k; } } catch (_) {}
    const x = new Date(t - 5 * 3600000);
    return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
  }
  function shiftDateKey(key, days) {
    const p = String(key).split('-').map(Number);
    const x = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
    return x.getUTCFullYear() + '-' + pad2(x.getUTCMonth() + 1) + '-' + pad2(x.getUTCDate());
  }

  /* ── « Retour sous 7 jours » — encore faut-il retrouver la vente ────────────
   * L'échange affiche « retour sous 7 jours », mais le journal ne gardait que la
   * journée en cours : une cliente qui revenait le jeudi avec un article acheté
   * le mardi était introuvable, et l'employé n'avait aucun moyen de vérifier le
   * prix payé. La promesse faite au comptoir ne tenait qu'un jour.
   *
   * Le journal garde donc RETAIN_DAYS jours. Deux limites, pour que cet
   * élargissement ne déborde nulle part :
   *
   *  · L'ARGENT RESTE À LA JOURNÉE. caToday() et l'en-tête filtrent
   *    explicitement sur aujourd'hui (voir salesToday) : ils sommaient tout
   *    SALES en se fiant au fait qu'il ne contenait qu'un jour, et garder une
   *    semaine y aurait affiché une recette multipliée par sept sous le mot
   *    « aujourd'hui ». C'est le vrai piège de ce changement.
   *  · LE NUMÉRO DE TICKET NE RECULE JAMAIS. saleSeq repart au-dessus du plus
   *    grand numéro RESTAURÉ, toutes journées confondues — sinon un ticket
   *    d'aujourd'hui réutiliserait le numéro d'hier, et deux ventes
   *    différentes se présenteraient sous la même référence dans les retours.
   *
   * Le rapport journalier n'est pas concerné : build() reçoit « toutes les ventes
   * connues (elles seront filtrées sur la journée) » — voir assets/day-report.js.
   * Le plafond de purge borne aussi la taille du journal ; une boutique très
   * active tient largement dans le quota localStorage sur sept jours. */
  const RETAIN_DAYS = 7;
  function withinRetention(d) {
    const x = new Date(d);
    if (isNaN(x)) return false;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (RETAIN_DAYS - 1));       // aujourd'hui inclus
    return x >= start;
  }
  /* Les ventes du JOUR — la seule base admise pour un chiffre d'affaires. Les
     ventes sorties des livres n'en sont plus (voir reconcileVoids). */
  const salesToday = () => SALES.filter((s) => s && !s.voided && isToday(s.at));

  /* Quand une vente a-t-elle eu lieu ? Le journal couvrant maintenant la semaine,
     un libellé « auj. » écrit en dur mentirait sur une vente de mardi. Sur sept
     jours le nom du jour suffit à lever toute ambiguïté. */
  function whenLabel(d) {
    const x = new Date(d);
    if (isToday(x)) return `auj. ${fmtHM(x)}`;
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()) {
      return `hier ${fmtHM(x)}`;
    }
    return `${DAYS[x.getDay()]} ${fmtHM(x)}`;
  }

  /* ── À QUI EST CE JOURNAL ─────────────────────────────────────────────────
     Il ne le disait pas. Une caisse ré-appairée d'une enseigne à une autre
     relisait donc les ventes de la PREMIÈRE et les servait sous le nom de la
     SECONDE : « Échanges & avoirs » listait les ventes d'un autre commerce,
     « Réimprimer » proposait leurs tickets, et l'en-tête en comptait une dans
     la recette du jour. Constaté le 30/07/2026 sur une caisse en production —
     le journal local disait CM-15-44 pendant que le comptoir tapait des tickets
     SS-16-44 et que le tableau de bord, lui, comptait juste.

     Deux gardes, parce qu'elles ne couvrent pas la même population :

      · LE TAMPON, pour tout ce qui s'écrit désormais. Le blob porte son
        commerçant ; à la relecture, un autre nom et on n'adopte rien.
      · LE PRÉFIXE DE TICKET, pour les blobs déjà sur les appareils, qui n'ont
        aucun tampon. Une référence porte l'initiale de l'enseigne (voir
        ticketPrefix) : « CM- » relu sous une enseigne qui tape « SS- » n'est
        pas d'ici. C'est la seule preuve que porte l'ancien format, et elle
        suffit à réparer les caisses déjà contaminées sans attendre un
        ré-appairage.

     Une enseigne qui se RENOMME perd ainsi sa semaine de journal — sept jours
     de réimpression et de retours. C'est le prix, et il est plus petit que
     l'inverse : montrer à une commerçante les ventes de quelqu'un d'autre. */
  function merchantSlug() {
    try {
      const pv = pvPaired();
      return String((pv && pv.merchant) || localStorage.getItem('kiwiLiveMerchant') || '');
    } catch (_) { return ''; }
  }
  function persistDay() {
    if (IS_DEMO) return;
    try {
      localStorage.setItem(DAY_KEY, JSON.stringify({
        v: 1, m: merchantSlug(), s: SALES.filter((s) => s && withinRetention(s.at)),
      }));
      return true;
    } catch (_) { return false; }
  }
  (function restoreDay() {
    if (IS_DEMO) return;
    let blob = null;
    try { blob = JSON.parse(localStorage.getItem(DAY_KEY) || 'null'); } catch (_) { return; }
    if (!blob) return;

    let saved;
    if (Array.isArray(blob)) {
      /* Ancien format, sans tampon : on juge sur le préfixe des références. Un
         journal dont AUCUNE référence ne commence par le préfixe d'ici vient
         d'ailleurs. On ne juge que sur les références lisibles — un journal sans
         aucune référence exploitable est adopté, faute de preuve du contraire. */
      const refs = blob.map((s) => String((s && s.id) || '')).filter((r) => /^[A-Z]{2,}-/.test(r));
      const mine = refs.filter((r) => r.indexOf(TK + '-') === 0);
      if (refs.length && !mine.length) {
        try { localStorage.removeItem(DAY_KEY); } catch (_) {}
        return;
      }
      saved = blob;
    } else if (blob && Array.isArray(blob.s)) {
      const now = merchantSlug();
      /* Tampon présent et différent : ce journal est celui d'un autre commerce.
         On l'efface plutôt que de le laisser dormir — il ressortirait au
         prochain ré-appairage vers son propriétaire d'origine, avec une semaine
         de retard et des stocks qui ne correspondent plus. */
      if (blob.m && now && blob.m !== now) {
        try { localStorage.removeItem(DAY_KEY); } catch (_) {}
        return;
      }
      saved = blob.s;
    } else return;

    if (!Array.isArray(saved) || !saved.length) return;
    let maxSeq = 0;
    saved.forEach((s) => {
      if (!s || !s.at || !withinRetention(s.at)) return;      // au-delà de la semaine, on oublie
      s.at = new Date(s.at);
      s.lines = Array.isArray(s.lines) ? s.lines : [];
      s.total = +s.total || s.lines.reduce((t, l) => t + (+l.unit || 0) * (+l.qty || 0), 0);
      // Le plus grand numéro TOUTES JOURNÉES CONFONDUES : un numéro déjà encaissé
      // ne doit jamais resservir, même s'il vient d'hier.
      const n = parseInt(String(s.id || '').replace(/^\D+/, ''), 10);
      if (new Date(s.at).getFullYear() === new Date().getFullYear() && n > maxSeq) maxSeq = n;
      SALES.push(s);
    });
    SALES.sort((a, b) => b.at - a.at);                       // le plus récent d'abord, comme unshift
    if (maxSeq >= saleSeq) saleSeq = maxSeq + 1;
    /* Adopté : on le tamponne TOUT DE SUITE. Sinon un journal d'ancien format
       reste jugé sur son préfixe de ticket jusqu'à la prochaine vente — c'est
       la preuve la plus faible dont on dispose, et une enseigne qui se renomme
       la ferait échouer. Une écriture au démarrage, et la garde repose ensuite
       sur le nom du commerçant, qui lui ne se devine pas. */
    if (Array.isArray(blob)) persistDay();
  })();

  /* ── les tickets du magasin, pas seulement ceux de CET écran ─────────────
   * Échanges & avoirs lisait uniquement `kiwi:bqDay`, donc le journal local de
   * cette tablette. Une vente bien présente dans le dashboard (ou encaissée sur
   * la deuxième caisse) restait introuvable au retour client. Le serveur est le
   * registre commun : on relit la journée et on complète SALES. La copie locale
   * gagne toujours, car elle porte la variante exacte et l'état des retours.
   *
   * Les anciennes lignes serveur portent le nom imprimé (« Jean noir M »), pas
   * encore l'id de variante. On les rattache au produit par le plus long nom de
   * catalogue, puis à sa taille. Ce repli rend les ventes déjà faites utilisables
   * immédiatement ; aucune donnée n'est inventée si aucun produit ne correspond. */
  const srvMethod = (m) => ({ cash: 'espèces', card: 'carte', delivery: 'livraison' }[m] || m || 'paiement');
  function remoteLine(line) {
    if (!line) return null;
    const raw = String(line.name || '').trim();
    /* /api/sale garde l'article et la variante exacte (itemId et
       « pid:taille:couleur »). On ne les lisait pas : la ligne était rattachée
       par son nom imprimé, puis au premier modèle de la taille, si bien qu'une
       chemise bleue rendue sur l'autre caisse revenait en stock en blanc. */
    const itemKey = String(line.itemId || line.pid || '');
    let item = itemKey && P[itemKey] ? P[itemKey] : null;
    const vKey = String(line.variantId || '');
    const vRest = item && vKey.indexOf(itemKey + ':') === 0 ? vKey.slice(itemKey.length + 1) : '';
    const vCut = vRest.indexOf(':');
    const vSize = vCut >= 0 ? vRest.slice(0, vCut) : '';
    const vColor = vCut >= 0 ? vRest.slice(vCut + 1) : '';
    if (!item && raw) {
      const low = raw.toLocaleLowerCase('fr');
      const uniq = [];
      Object.keys(P).forEach((k) => { const p = P[k]; if (p && !uniq.includes(p)) uniq.push(p); });
      item = uniq.filter((p) => {
        const n = String(p.name || '').toLocaleLowerCase('fr');
        return low === n || low.indexOf(n + ' ') === 0;
      }).sort((a, b) => String(b.name || '').length - String(a.name || '').length)[0] || null;
    }
    if (!item) {
      const qty = Math.max(1, Number(line.qty) || 1);
      return {
        pid: String(line.itemId || ''), variantId: String(line.variantId || ''), size: String(line.size || 'TU'),
        color: String(line.color || ''), qty, remise: 0,
        unit: Number(line.unit) || ((Number(line.total) || 0) / qty), returned: false, note: '',
        name: raw || 'Article retiré du catalogue', category: String(line.cat || ''), catalogueMissing: true,
      };
    }
    const suffix = raw.slice(String(item.name || '').length).trim();
    const sizes = sizesOf(item);
    const size = String(line.size || vSize || (sizes.includes(suffix) ? suffix : '') || sizes[0] || 'TU');
    const vs = item._variants || [];
    const variant = (vColor && vs.find((v) => String(v.size) === size && String(v.colorId) === vColor))
      || vs.find((v) => String(v.size) === size) || vs[0];
    const qty = Math.max(1, Number(line.qty) || 1);
    return {
      pid: item.id, size, color: String(line.color || vColor || (variant && variant.colorId) || ''), qty,
      remise: 0, unit: Number(line.unit) || ((Number(line.total) || 0) / qty),
      returned: false, note: '', name: item.name,
    };
  }
  function syncReturnSales() {
    if (IS_DEMO || typeof fetch !== 'function') return Promise.resolve(0);
    const merchant = merchantSlug();
    if (!merchant) return Promise.resolve(0);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (RETAIN_DAYS - 1));
    return (window.KiwiPosSale?.feedDay || ((u, o) => fetch(u, o).then((r) => r.ok ? r.json() : null)))('/api/feed?merchant=' + encodeURIComponent(merchant) + '&from=' + start.getTime(), {
      credentials: 'same-origin', headers: { Accept: 'application/json' },
    }).then((data) => {
      let added = 0;
      ((data && data.sales) || []).forEach((row) => {
        const ref = String(row.ref || '');
        if (!ref || SALES.some((s) => s && s.id === ref)) return;
        const lines = (Array.isArray(row.lines) ? row.lines : []).map(remoteLine).filter(Boolean);
        if (!lines.length) return; // sans article identifiable, aucun échange honnête à proposer
        SALES.push({
          id: ref, serverId: String(row.id || ''), at: new Date(Number(row.ts) || Date.now()),
          clientId: null, by: 'Caisse', kind: 'vente', methods: srvMethod(row.method), lines,
          total: lines.reduce((sum, l) => sum + l.unit * l.qty, 0),
          receivedAmount: Number(row.amountCents != null ? row.amountCents / 100 : row.amount) || 0,
          remote: true,
        });
        added++;
      });
      if (added) {
        SALES.sort((a, b) => new Date(b.at) - new Date(a.at));
        persistDay();
        if (root && state.view === 'echanges') { renderEchanges(); renderBadges(); icons(); }
      }
      return added;
    }).catch(() => 0);
  }
  const state = {
    view: 'vente',
    rayon: 'tous',
    filterAxis: 'rayons',        /* 'rayons' | 'marques' | 'motifs' | 'fragile' */
    selectedMarque: 'tous',
    selectedMotif: 'tous',
    ticket: null,                /* { num, lines:[], client:id|'passage'|null, remiseAuth, giftWrap, delivery } */
    exchange: null,              /* { saleId, idx, qty:1 } pendant le choix du remplacement */
    ret: null,                   /* { saleId, picks:Set, quantities:Map, motif } */
    retQuery: '',
    retDate: businessDateKey(Date.now()),
    clQuery: '',
    registriesQuery: '',
    activeRegistry: null,
    movementDays: 0,
    movementType: '',
    movementCategory: '',
    movementQuery: '',
    movementSyncing: false,
    casseQuery: '',
    scanLog: [],                 /* journal des articles VÉRIFIÉS (onglet Scan) */
    lookup: null,                /* { pid, size, color, ean, at } — dernière vérif affichée */
    scanIdx: 0,
    scanBusy: false,
    offline: (typeof navigator !== 'undefined' && navigator.onLine === false),
    simulatedOffline: false,
    queued: 0,
    syncBlocked: false,
    syncStorageError: false,
    ticketStorageError: false,
  };

  /* Journal partagé des retours. Avant ceci, le stock et l'avoir changeaient
     bien à la caisse, mais le dashboard ne recevait aucun retour et continuait
     d'afficher ses exemples. */
  const RETURN_LOG_KEY = 'kiwi:bqReturns';
  let RETURN_LOG = [];
  let returnCloudHandle = null;
  (function restoreReturnLog() {
    if (IS_DEMO) return;
    try {
      const d = JSON.parse(localStorage.getItem(RETURN_LOG_KEY) || 'null');
      if (d && (!d.m || !merchantSlug() || d.m === merchantSlug()) && Array.isArray(d.list)) RETURN_LOG = d.list;
    } catch (_) {}
  })();
  function persistReturnLog() {
    if (IS_DEMO) return;
    try { localStorage.setItem(RETURN_LOG_KEY, JSON.stringify({ m: merchantSlug(), list: RETURN_LOG })); } catch (_) {}
  }
  function ensureReturnCloud() {
    if (IS_DEMO || returnCloudHandle || !window.KiwiCloudDoc) return returnCloudHandle;
    returnCloudHandle = window.KiwiCloudDoc.attach({
      feature: 'returns', slug: merchantSlug,
      read: () => ({ list: RETURN_LOG }),
      write: (doc) => {
        RETURN_LOG = Array.isArray(doc && doc.list) ? doc.list : [];
        persistReturnLog();
      },
      isEmpty: (doc) => !doc || !Array.isArray(doc.list) || !doc.list.length,
    });
    returnCloudHandle.bind();
    return returnCloudHandle;
  }
  function recordReturn(sale, idxs, amount, reason, kind, reference, quantities) {
    if (IS_DEMO || !sale) return;
    const items = idxs.map((i) => {
      const ln = sale.lines[i];
      if (!ln) return null;
      const qty = quantities && quantities.has(i) ? Number(quantities.get(i)) || 1 : 1;
      return {
        name: (P[ln.pid] && P[ln.pid].name) || ln.name || 'Article', size: ln.size || '',
        qty, amount: Math.sign((Number(ln.unit) || 0) * qty) * Math.round(Number(Math.abs((Number(ln.unit) || 0) * qty).toExponential().replace(/e(.+)$/, (_, e) => 'e' + (+e + 2)))) / 100,
      };
    }).filter(Boolean);
    const now = Date.now();
    const client = saleClient(sale);
    RETURN_LOG.unshift({
      id: `RET-${sale.id}-${now}`, ts: now, saleRef: sale.id, kind: kind || 'avoir',
      reason: reason || '', amount: Math.sign(Number(amount) || 0) * Math.round(Number(Math.abs(Number(amount) || 0).toExponential().replace(/e(.+)$/, (_, e) => 'e' + (+e + 2)))) / 100, reference: reference || '',
      actor: (STAFF.caissiere && STAFF.caissiere.name) || 'Caisse',
      client: (client && client.name) || 'Cliente de passage', items,
    });
    RETURN_LOG = RETURN_LOG.slice(0, 500);
    persistReturnLog();
    const cloud = ensureReturnCloud();
    if (cloud) cloud.push();
  }
  /* ── LE NUMÉRO DE TICKET : DES CHIFFRES, ET RIEN D'AUTRE ──────────────────
   * Une référence lisible (1000, 1001…) et un identifiant technique sont deux
   * choses différentes. `syncId` est un UUID : deux ventes ne deviennent jamais
   * le même INSERT OR IGNORE, même si un ancien client nous remet un jour une
   * référence erronée. `num` vient d'une plage atomiquement réservée au serveur :
   * deux comptoirs reçoivent des plages disjointes, puis peuvent les consommer
   * hors ligne. Une plage perdue crée un trou ; elle ne revient jamais en vente. */
  const TICKET_LEASE_KEY = 'kiwi:bqTicketLease';
  /* 500 numbers = several busy offline days for a boutique, while staying well
     below the five-digit annual ceiling. The range is persisted immediately. */
  const TICKET_LEASE_SIZE = 500;
  /* Sous ce seuil de numéros restants on réserve la plage suivante. 120 laisse
     une journée chargée d'avance avant même de toucher la réserve. */
  const TICKET_LEASE_LOW = 120;
  let ticketLease = null;
  let ticketLeaseRequest = null;
  let ticketTopUpRequest = null;

  function ticketPeriod() { return new Date().getFullYear(); }
  function syncTicketPeriod() {
    if (!IS_DEMO && saleSeqPeriod !== ticketPeriod()) {
      saleSeq = 1000;
      saleSeqPeriod = ticketPeriod();
      ticketLease = null;
    }
  }

  function newSaleId() {
    try {
      if (crypto && crypto.randomUUID) return 'sale-' + crypto.randomUUID();
      if (crypto && crypto.getRandomValues) {
        const b = new Uint32Array(2); crypto.getRandomValues(b);
        return 'sale-' + Date.now().toString(36) + '-' + b[0].toString(36) + b[1].toString(36);
      }
    } catch (_) {}
    return 'sale-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  /* Une plage réservée est une provision, pas un jeton à usage unique : tant que
     la caisse est en ligne, on garde toujours une plage d'avance en réserve.
     Sans cela, la première panne de réseau qui tombe sur une plage épuisée
     bloque la vente — alors que le hors-ligne est précisément ce que la plage
     est censée couvrir. */
  function cleanLeaseQueue(q) {
    if (!Array.isArray(q)) return [];
    return q.map((r) => (r && Number.isInteger(+r.start) && Number.isInteger(+r.end) && +r.start >= 1000 && +r.end >= +r.start && +r.end <= 99999
      ? { start: +r.start, end: +r.end } : null)).filter(Boolean).slice(0, 4);
  }

  function leaseRemaining(lease) {
    if (!lease) return 0;
    let n = Math.max(0, lease.end - Math.max(+lease.next || 0, saleSeq, 1000) + 1);
    (lease.queue || []).forEach((r) => { n += r.end - r.start + 1; });
    return n;
  }

  function readTicketLease() {
    const m = merchantSlug();
    const period = ticketPeriod();
    if (ticketLease && ticketLease.m === m && ticketLease.period === period) return ticketLease;
    ticketLease = null;
    try {
      const x = JSON.parse(localStorage.getItem(TICKET_LEASE_KEY) || 'null');
      if (x && x.m === m && +x.period === period && Number.isInteger(+x.next) && Number.isInteger(+x.end) && +x.next <= +x.end) {
        ticketLease = { m, period, next: +x.next, end: +x.end, queue: cleanLeaseQueue(x.queue) };
      }
    } catch (_) {}
    return ticketLease;
  }

  function saveTicketLease() {
    try {
      if (ticketLease) localStorage.setItem(TICKET_LEASE_KEY, JSON.stringify(ticketLease));
      state.ticketStorageError = false;
      return true;
    } catch (_) {
      state.ticketStorageError = true;
      return false;
    }
  }

  function takeTicketNumber() {
    if (IS_DEMO) return String(saleSeq);
    syncTicketPeriod();
    const lease = readTicketLease();
    if (!lease) return '';
    let n = Math.max(+lease.next || 0, saleSeq, 1000);
    const previousNext = lease.next;
    const previousEnd = lease.end;
    const previousQueue = (lease.queue || []).slice();
    const previousSeq = saleSeq;
    /* Plage épuisée : on bascule sur la suivante déjà réservée. C'est ce qui
       permet de vendre hors ligne au-delà des 500 premiers numéros. */
    while (n > lease.end && (lease.queue || []).length) {
      const nextRange = lease.queue.shift();
      lease.end = nextRange.end;
      n = Math.max(nextRange.start, saleSeq, 1000);
    }
    if (n > lease.end || n > 99999) {
      lease.end = previousEnd;
      lease.queue = previousQueue;
      return '';
    }
    lease.next = n + 1;
    saleSeq = n + 1;
    /* The number is not claimed until its successor is durable. Otherwise a
       full/private localStorage can reload the old `next` and print the same
       visible receipt number twice. Losing the whole server-reserved range is
       acceptable; reusing one of its numbers is not. */
    if (!saveTicketLease()) {
      lease.next = previousNext;
      lease.end = previousEnd;
      lease.queue = previousQueue;
      saleSeq = previousSeq;
      return '';
    }
    topUpTicketLease();
    return String(n);
  }

  /* Réserve la plage SUIVANTE pendant qu'on est encore en ligne. Appelée après
     chaque numéro pris et à l'ouverture de la caisse : quand le réseau tombe,
     la réserve est déjà sur la tablette. */
  function topUpTicketLease() {
    if (IS_DEMO) return;
    try { if (navigator && navigator.onLine === false) return; } catch (_) {}
    const lease = readTicketLease();
    if (!lease) {
      /* Aucune plage : on en réserve une tout de suite, sans attendre la
         première cliente — sinon la panne de réseau arrive avant la plage. */
      if (!ticketLeaseRequest) { try { ensureTicketLease().catch(() => {}); } catch (_) {} }
      return;
    }
    if (leaseRemaining(lease) > TICKET_LEASE_LOW) return;
    if ((lease.queue || []).length >= 2) return;
    if (ticketLeaseRequest || ticketTopUpRequest) return;
    ticketTopUpRequest = requestTicketRange().then((range) => {
      const live = readTicketLease();
      if (!live || !range) return;
      live.queue = cleanLeaseQueue((live.queue || []).concat([range]));
      saveTicketLease();
    }).catch(() => {}).finally(() => { ticketTopUpRequest = null; });
  }

  function requestTicketRange() {
    const m = merchantSlug();
    if (!m || typeof fetch !== 'function') return Promise.reject(new Error('merchant-unavailable'));
    return fetch('/api/ticket-sequence', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: m, size: TICKET_LEASE_SIZE, floor: saleSeq, period: ticketPeriod() }),
    }).then((r) => {
      if (!r.ok) throw new Error('ticket-sequence-' + r.status);
      return r.json();
    }).then((j) => {
      const start = +j.start, end = +j.end;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1000 || end < start || end > 99999 || +j.period !== ticketPeriod()) {
        throw new Error('ticket-sequence-invalid');
      }
      return { start, end };
    });
  }

  function ensureTicketLease() {
    if (IS_DEMO) return Promise.resolve(ticketLease);
    syncTicketPeriod();
    const existing = readTicketLease();
    if (existing && Math.max(existing.next, saleSeq) <= existing.end) return Promise.resolve(existing);
    if (ticketLeaseRequest) return ticketLeaseRequest;
    const m = merchantSlug();
    ticketLeaseRequest = requestTicketRange().then(({ start, end }) => {
      const carried = existing && existing.m === m ? cleanLeaseQueue(existing.queue) : [];
      ticketLease = { m, period: ticketPeriod(), next: start, end, queue: carried };
      if (!saveTicketLease()) {
        ticketLease = null;
        throw new Error('ticket-lease-storage');
      }
      return ticketLease;
    }).finally(() => { ticketLeaseRequest = null; });
    return ticketLeaseRequest;
  }

  function withTicketLock(work) {
    /* Two tabs on the SAME till share localStorage. Without a cross-tab lock they
       can both read `next: 1042` before either writes 1043. Web Locks serializes
       that tiny critical section; the fallback still serializes calls in one
       tab, and storage events invalidate the cache in other legacy browsers. */
    try {
      if (navigator && navigator.locks && navigator.locks.request) {
        return navigator.locks.request('kiwi-ticket:' + merchantSlug(), work);
      }
    } catch (_) {}
    return Promise.resolve().then(work);
  }

  function claimTicketNumber() {
    return withTicketLock(() => {
      /* Another tab may have advanced the persisted lease while this tab kept
         its in-memory copy. Always re-read after acquiring the lock. */
      ticketLease = null;
      const ready = takeTicketNumber();
      if (ready) return ready;
      return ensureTicketLease().then(() => {
        ticketLease = null;
        const n = takeTicketNumber();
        if (!n) throw new Error('ticket-sequence-empty');
        return n;
      }).catch((e) => {
        /* LE PANIER N'EST JAMAIS OTAGE DU RÉSEAU.
           Le serveur n'a pas pu réserver de plage : plutôt que d'interdire la
           vente — ce que la bannière hors-ligne promet justement le contraire —
           on émet une référence provisoire dans une bande qui ne peut PAS
           entrer en collision avec une plage serveur (elle n'est pas
           numérique). L'identité technique de la vente reste `syncId`, un UUID,
           donc la synchronisation n'est pas affectée. La vente part au journal
           avec sa marque « hors-ligne » et reste lisible par le comptoir. */
        const fallback = takeOfflineRef();
        if (fallback) return fallback;
        throw e;
      });
    });
  }

  const OFFLINE_REF_KEY = 'kiwi:bqTicketOffline';

  function offlineDeviceTag() {
    /* Deux comptoirs hors ligne ne doivent pas frapper la même référence. */
    try {
      let tag = localStorage.getItem(OFFLINE_REF_KEY + ':tag');
      if (!tag || !/^[A-Z0-9]{3}$/.test(tag)) {
        const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        tag = '';
        for (let i = 0; i < 3; i++) tag += pool[Math.floor(Math.random() * pool.length)];
        localStorage.setItem(OFFLINE_REF_KEY + ':tag', tag);
      }
      return tag;
    } catch (_) { return 'HL0'; }
  }

  function takeOfflineRef() {
    if (IS_DEMO) return '';
    const m = merchantSlug();
    const period = ticketPeriod();
    try {
      let n = 1;
      const raw = JSON.parse(localStorage.getItem(OFFLINE_REF_KEY) || 'null');
      if (raw && raw.m === m && +raw.period === period && Number.isInteger(+raw.n)) n = +raw.n + 1;
      localStorage.setItem(OFFLINE_REF_KEY, JSON.stringify({ m, period, n }));
      return 'HL-' + offlineDeviceTag() + '-' + n;
    } catch (_) {
      state.ticketStorageError = true;
      return '';
    }
  }

  function isOfflineRef(ref) { return /^HL-/.test(String(ref || '')); }

  function assignTicketNumber(ticket) {
    if (!ticket || ticket.num) return Promise.resolve(ticket && ticket.num);
    ticket.numbering = true;
    ticket.numError = false;
    return claimTicketNumber().then((n) => {
      /* The ticket object, not merely state.ticket, is captured. A reset while
         the request is in flight cannot put the old response on the new cart. */
      ticket.num = n;
      ticket.period = ticketPeriod();
      ticket.numbering = false;
      ticket.numError = false;
      if (state.ticket === ticket && root) { renderTicket(); icons(); }
      return n;
    }).catch((e) => {
      ticket.numbering = false;
      /* L'ÉCHEC DOIT SE VOIR TOUT DE SUITE, PAS AU MOMENT DE PAYER.
         Sans marque d'erreur, un ticket sans numéro reste bloqué sur
         « attribution… » : la vendeuse scanne tout le panier, la cliente sort sa
         carte, et c'est seulement là qu'on découvre que la caisse n'a jamais pu
         réserver de série. On distingue donc « en cours » de « échoué », pour
         que la tête du ticket le dise et propose de réessayer. */
      ticket.numError = true;
      if (state.ticket === ticket && root) { renderTicket(); icons(); }
      throw e;
    });
  }

  function nextStandaloneTicketNumber() {
    if (IS_DEMO) return Promise.resolve(String(saleSeq++));
    return claimTicketNumber();
  }

  function freshTicket() {
    const ticket = {
      num: IS_DEMO ? String(saleSeq) : '',
      period: ticketPeriod(),
      syncId: newSaleId(),
      lines: [], client: null, remiseAuth: false, numbering: false, numError: false,
      giftWrap: false, delivery: null,
    };
    state.ticket = ticket;
    if (!IS_DEMO) assignTicketNumber(ticket).catch(() => {
      if (state.ticket !== ticket) return;
      toast('Numéro de ticket indisponible', state.ticketStorageError
        ? 'Le stockage sécurisé de cette tablette est indisponible. Contactez le support.'
        : 'Reconnectez cette caisse pour réserver sa prochaine série.');
    });
  }
  function ticketClient() {
    const t = state.ticket;
    return t.client && t.client !== 'passage' ? clById(t.client) : null;
  }
  /* ── PROMOTIONS ───────────────────────────────────────────────────────────
   * La règle vit dans assets/promos.js ; ici on ne fait que la LIRE, par une
   * seule porte, pour que la grille, la fiche variante, le ticket et le reçu
   * annoncent tous le même prix. Deux lectures indépendantes du même catalogue
   * finissent toujours par diverger d'un arrondi, et c'est l'étiquette en rayon
   * qui contredit alors le ticket, devant la cliente.
   *
   * `stock` compte parce qu'une promotion peut viser « ce qui descend à N
   * pièces » : la projection vivante (celle que le ticket en cours entame) est
   * la bonne référence pour ce que le rayon affiche à cet instant. */
  function promoFor(pid) {
    const p = P[pid];
    if (!p || !window.KiwiPromos) return null;
    try {
      const pr = window.KiwiPromos.priceFor(p, { stock: promoStockOf(p) });
      return pr ? { ...pr, price: shelf(pr.price), was: shelf(pr.was) } : null;
    } catch (_) { return null; }
  }

  /* Promotions are authored against the catalogue unit. A service sold as one
     loose piece has a different unit price, so convert the promotion using its
     own kind instead of comparing a full-service price with a piece price.
     One door for the piece price: the sheet, the ticket and the exchange all
     read it here. `+null` is 0, so a catalogue piece price left empty (null)
     used to read as a free piece on the sheet while the ticket charged the
     set price divided by its pieces. */
  function pieceUnitPrice(p) {
    if (!p) return 0;
    return +p.piecePriceMAD > 0
      ? shelf(p.piecePriceMAD)
      : shelf((+p.price || 0) / Math.max(1, +p.servicePieces || 12));
  }
  function promoForLine(ln) {
    const live = promoFor(ln && ln.pid);
    if (!live || !ln || !ln.isPiece) return live;
    const p = P[ln.pid];
    const base = (ln.customPrice != null && Number.isFinite(+ln.customPrice)) ? shelf(ln.customPrice) : pieceUnitPrice(p);
    const per = Math.max(1, +(ln.servicePieces || (p && p.servicePieces)) || 12);
    const rule = live.promo || {};
    let price;
    if (rule.kind === 'percent') price = base * (100 - (+rule.value || 0)) / 100;
    else if (rule.kind === 'amount') price = base - (+rule.value || 0) / per;
    else if (rule.kind === 'fixed') price = live.price / per;
    else price = base * (live.price / Math.max(1, live.was));
    price = Math.min(base, shelf(price));
    return { ...live, was: base, price, off: base - price };
  }
  function promoStockOf(p) {
    if (!p) return 0;
    return stockOf(p) + sizesOf(p).reduce((sum, size) => sum + looseOf(p.id, size), 0);
  }
  /* ── LE PRIX D'UNE LIGNE : LE MEILLEUR DES DEUX ───────────────────────────
   * Le prix promo est estampillé sur la ligne quand elle entre sur le ticket
   * (voir addToTicket), et la règle est relue à chaque rendu. On retient le PLUS
   * BAS des deux. Les deux moitiés comptent, et pour des raisons opposées :
   *
   *   · la promotion se TERMINE pendant qu'une cliente attend au comptoir —
   *     l'estampille tient, on encaisse le prix annoncé au moment du scan. Une
   *     caisse qui remonte ses prix entre le rayon et le paiement, c'est une
   *     dispute au comptoir, et le magasin a tort.
   *   · la promotion COMMENCE pendant le ticket — la règle du jour prend le
   *     dessus. Sans ça, deux lignes du même article cohabitaient à 2 400 et
   *     2 160 sur le même ticket, et personne n'aurait su expliquer laquelle
   *     était la bonne.
   *
   * Une seule phrase à tenir devant la cliente : « on ne vous facture jamais
   * plus que le prix affiché au moment où l'article a été scanné, ni plus que
   * celui affiché maintenant. » C'est aussi ce qui rend un retour juste trois
   * jours plus tard : la ligne de vente porte le prix réellement payé. */
  function lineDeal(ln) {
    const stamp = (ln && ln.promo && Number.isFinite(+ln.promo.price)) ? { ...ln.promo, price: shelf(ln.promo.price) } : null;
    const live = promoForLine(ln);
    const p = P[ln.pid];
    const full = shelf((ln.customPrice != null && Number.isFinite(+ln.customPrice))
      ? +ln.customPrice
      : (p ? p.price : (ln.unit || 0)));
    let best = { price: full, promo: null };
    if (stamp && stamp.price < best.price) best = { price: stamp.price, promo: stamp };
    if (live && live.price < best.price) best = { price: live.price, promo: { price: live.price, badge: live.badge, name: live.promo.name, id: live.promo.id } };
    return best;
  }
  const linePromo = (ln) => lineDeal(ln).promo;
  const lineBase  = (ln) => lineDeal(ln).price;
  const lineUnit  = (ln) => shelf(lineBase(ln) * (100 - ln.remise) / 100);
  const lineTotal = (ln) => Math.round(lineUnit(ln) * 100) * ln.qty / 100;
  /* Remise fidélité au niveau du TICKET (distincte de la remise gérante par ligne).
     Attachée au client via clientId : si on détache/change la cliente, elle cesse
     de s'appliquer d'elle-même, sans avoir à la retirer partout à la main. */
  function rewardDiscount(t, base) {
    const r = t.reward;
    if (!r || r.clientId !== t.client) return 0;
    /* au centime le plus proche, la même règle que toutes les enseignes
       (décision 2026-10-26, functions/api/_rules-loyalty.js rewardDiscount) */
    if (r.kind === 'percent') return Math.min(base, Math.round(base * Math.min(100, Math.max(0, +r.value || 0)) + 1e-9) / 100);
    if (r.kind === 'free' && t.lines.length) return Math.min.apply(null, t.lines.map(lineUnit));
    return 0;
  }
  /* Trois baisses, trois lignes séparées, jamais une seule « remise » fourre-tout :
     la promotion est une décision du magasin, la remise un geste de la gérante,
     la récompense un dû de la cliente. Les confondre au total, c'est rendre le
     rapport de clôture incapable de dire ce que les promotions ont coûté. */
  /* ═══════════════════════ DÉPÔT-VENTE (catégorie B) ═══════════════════════
   * Une partie du rayon appartient à des TIERS : le commerce la vend pour eux.
   * La vente est enregistrée normalement — ticket, journal des ventes, stock,
   * traçabilité — mais l'argent n'est pas une recette : il est DÛ au déposant.
   * On ne retire donc rien du journal, on ATTRIBUE.
   *
   * Deux vérités cohabitent, et il faut les deux :
   *   · le TIROIR encaisse le montant plein — la cliente paie ici, et la
   *     clôture doit tomber juste ;
   *   · sa RECETTE exclut ces lignes — ce n'est pas son chiffre d'affaires.
   * C'est exactement la discipline des avoirs plus bas : ce qui rentre en
   * caisse et ce qui compte comme vente ne sont pas le même nombre.
   *
   * Ce que la caisse ne fait PAS, volontairement : tenir le compte de ce qui
   * est dû à chaque déposant. Le reversement se règle ailleurs, hors caisse ;
   * un solde tenu ici serait un second livre à maintenir, jamais consulté et
   * faux dès le premier virement fait à côté. La caisse marque l'article,
   * enregistre la vente en entier, et sort le montant de la recette. */
  /* ── L'INTERRUPTEUR ──────────────────────────────────────────────────────
   * Le dépôt-vente est une option posée par l'opérateur Kiwi, commerce par
   * commerce (kiwi-admin.html › Modules → « Dépôt-vente »), et ÉTEINTE partout
   * ailleurs. La comparaison est stricte (`=== true`) pour la même raison
   * qu'Order Pro : une clé absente, un backend injoignable, une réponse vide —
   * tout cela doit répondre NON. Éteinte, la notion n'existe pas : pas de
   * repère B, pas de choix A/B, et un article resté marqué compte comme
   * n'importe quel autre. Les ventes DÉJÀ encaissées gardent, elles, les
   * montants figés sur leur ticket : allumer ou éteindre l'option ne réécrit
   * jamais le passé. */
  function depotOn() {
    try {
      return !!(window.KiwiConfig && window.KiwiConfig.features
        && window.KiwiConfig.features.depotvente === true);
    } catch (_) { return false; }
  }
  const isConsigned = (ln) => { const p = P[ln.pid]; return depotOn() && !!p && p.ownership === 'consignment'; };
  const isConsignedProduct = (p) => depotOn() && !!p && p.ownership === 'consignment';
  const consignedOf = (lines) => (lines || []).reduce((s, ln) => s + (isConsigned(ln) ? Math.round(lineTotal(ln) * 100) : 0), 0) / 100;
  function ticketTotals(t) {
    /* Tout en centimes entiers, puis redivisé : 249,90 + 0,10 fait 250, pas 249,99999. */
    const c = (v) => Math.round(v * 100);
    const sub = t.lines.reduce((s, ln) => {
      const p = P[ln.pid];
      const orig = shelf((ln.customPrice != null) ? ln.customPrice : (p ? p.price : 0));
      return s + c(orig) * ln.qty;
    }, 0) / 100;
    const afterPromo = t.lines.reduce((s, ln) => s + c(lineBase(ln)) * ln.qty, 0) / 100;
    const afterLines = t.lines.reduce((s, ln) => s + c(lineTotal(ln)), 0) / 100;
    const reward = c(rewardDiscount(t, afterLines)) / 100;
    const total = Math.max(0, c(afterLines) - c(reward)) / 100;
    /* `consigned` ≤ `total` : la remise fidélité s'applique au ticket entier,
       donc on borne pour qu'un ticket très remisé ne doive jamais au déposant
       plus que ce que la cliente a réellement payé. */
    const consigned = Math.min(total, consignedOf(t.lines));
    const d = (x, y) => (c(x) - c(y)) / 100;
    return { sub, promo: d(sub, afterPromo), remise: d(afterPromo, afterLines), reward, total, consigned, own: d(total, consigned) };
  }
  /* Le nom à écrire sur le reçu. Une seule promotion en jeu → son nom ; deux ou
     plus → le mot générique, parce qu'en nommer une seule laisserait croire que
     l'autre n'a pas été appliquée. */
  function promoLabelForTicket(t) {
    const names = [];
    t.lines.forEach((ln) => {
      const pr = linePromo(ln);
      if (pr && pr.name && names.indexOf(pr.name) < 0) names.push(pr.name);
    });
    return names.length === 1 ? names[0] : '';
  }
  const ticketCount = (t) => t.lines.reduce((s, ln) => s + ln.qty, 0);
  /* Sur salesToday(), jamais sur SALES : le journal garde une semaine pour les
     retours (voir RETAIN_DAYS), et sommer tout afficherait la recette de sept
     jours sous le mot « aujourd'hui ». */
  /* La recette du jour EXCLUT le dépôt-vente : ces montants sont dans le
     tiroir mais ils appartiennent aux déposants. Les ventes d'avant cette
     fonctionnalité n'ont pas de champ `own` — elles retombent sur `total`,
     ce qui est correct : à l'époque tout le rayon lui appartenait.
     Et l'argent QUI RENTRE, comme le serveur et le tableau de bord
     (originalSalePayload().amount) : la part réglée en avoir consomme une
     dette née d'une vente déjà comptée, et une livraison est une créance que
     le serveur enregistre à 0 (« Livraisons · à recevoir » au Z). Les compter
     ici gonflait l'en-tête « X MAD aujourd'hui ». Une vente relue du serveur
     porte déjà ce qu'il a encaissé. */
  const notCashedOf = (x) => (Array.isArray(x.parts) ? x.parts : [])
    .reduce((s, p) => s + (p && (p.m === 'avoir' || p.m === 'livraison') ? (+p.amount || 0) : 0), 0);
  const cashedOf = (x) => (x.remote && x.receivedAmount != null)
    ? Math.max(0, Number(x.receivedAmount) || 0)
    : Math.max(0, (x.own != null ? +x.own : (+x.total || 0)) - notCashedOf(x));
  const caToday = () => salesToday().reduce((s, x) => s + cashedOf(x), 0);
  function queueIfOffline(label) {
    if (!state.offline) return false;
    try {
      const q = window.KiwiLive && window.KiwiLive.queueStatus && window.KiwiLive.queueStatus();
      if (q) {
        state.queued = +q.pending || 0;
        state.syncStorageError = !!q.storageError;
        state.syncBlocked = state.syncStorageError || (+q.blocked || 0) > 0;
      }
    } catch (_) {}
    renderNet();
    toast(`${label}, enregistré sur cette caisse${state.queued ? ` (${state.queued} vente${state.queued > 1 ? 's' : ''} à synchroniser)` : ''}`);
    return true;
  }

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  let root = null;

  /* Plein écran (mode kiosque) — la caisse resto l'a via le bandeau partagé du
     shell ; la boutique dessine son PROPRE rail, ce bandeau n'y apparaît pas,
     d'où l'absence du bouton signalée en boutique. On repose donc le même geste
     dans le rail boutique. Deux icônes (agrandir / réduire) dont on bascule
     `hidden` — aucun re-rendu lucide nécessaire. L'écouteur `fullscreenchange`
     n'est attaché qu'UNE fois (le rail est reconstruit à chaque montage). */
  function fsIsOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function fsToggle() {
    try {
      const r = fsIsOn()
        ? (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document)
        : (function () { const el = document.documentElement; return (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el); })();
      if (r && r.catch) r.catch(function () {});   // certains contextes (iframe sandbox) rejettent — on ignore
    } catch (_) {}
  }
  function paintFs() {
    const b = root && $('#mz-fs', root); if (!b) return;
    const on = fsIsOn();
    const en = b.querySelector('[data-fs="enter"]'), ex = b.querySelector('[data-fs="exit"]');
    // `hidden` ne suffit pas ici : un reset `svg { display:block }` bat la règle
    // UA `[hidden]{display:none}` — on force donc le display en inline (spécificité max).
    if (en) en.style.display = on ? 'none' : '';
    if (ex) ex.style.display = on ? '' : 'none';
    const lb = b.querySelector('span'); if (lb) lb.textContent = on ? 'Quitter le plein écran' : 'Plein écran';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? 'Quitter le plein écran' : 'Plein écran';
  }
  function setupFullscreenBtn() {
    const b = $('#mz-fs', root); if (!b) return;
    b.addEventListener('click', fsToggle);
    paintFs();
    if (!setupFullscreenBtn._subbed) {
      setupFullscreenBtn._subbed = true;
      document.addEventListener('fullscreenchange', paintFs);
      document.addEventListener('webkitfullscreenchange', paintFs);
    }
  }

  function mount(rootEl) {
    root = rootEl;
    ensureStockJournal();
    syncTillStaff();
    /* On constitue la réserve de numéros DÈS l'ouverture, pendant que le réseau
       est là : c'est ce qui rend la vente hors ligne possible plus tard. */
    try { topUpTicketLease(); } catch (_) {}
    try {
      if (!IS_DEMO && window.addEventListener) window.addEventListener('online', () => { try { topUpTicketLease(); } catch (_) {} });
    } catch (_) {}
    /* A PAIRED caisse shows the real store's name/city (from onboarding); the
       unpaired demo (PIN 0002) keeps the Maison Mansour identity. */
    const _pv = (function () { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } })();
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const _vName = (_pv && _pv.name) ? _esc(_pv.name) : 'Vogue Home';
    const _vSub = (_pv && _pv.location) ? _esc(_pv.location) : (_pv ? '' : 'Tanger · Centre');
    root.innerHTML = `
      <aside class="mz-rail">
        <div class="mz-brand"><img class="kiwi-pos-logo" src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></div>
        <div class="mz-venue">
          <div class="mz-venue-name">${_vName}</div>
          <div class="mz-venue-sub">${_vSub}${_vSub ? '<br>' : ''}Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="mz-nav" id="mz-nav">
          <button class="mz-nav-it on" data-mz-view="vente"><i data-lucide="shopping-bag"></i><span>Vente</span><b class="mz-nav-badge" id="mz-badge-vente"></b></button>
          <button class="mz-nav-it" data-mz-view="mouvements"><i data-lucide="history"></i><span>Mouvements de stock</span></button>
          <button class="mz-nav-it" data-mz-view="casse"><i data-lucide="shield-alert"></i><span>Déclarer Casse</span></button>
          <button class="mz-nav-it" data-mz-view="scan"><i data-lucide="scan-line"></i><span>Scan</span><b class="mz-nav-badge" id="mz-badge-scan"></b></button>
          <button class="mz-nav-it" data-mz-view="inventaire"><i data-lucide="package"></i><span>Inventaire</span><b class="mz-nav-badge" id="mz-badge-inv"></b></button>
          <button class="mz-nav-it" data-mz-view="fournisseurs"><i data-lucide="truck"></i><span>Fournisseurs</span></button>
          <button class="mz-nav-it" data-mz-view="echanges"><i data-lucide="arrow-left-right"></i><span>Échanges &amp; avoirs</span><b class="mz-nav-badge" id="mz-badge-ret"></b></button>
          <button class="mz-nav-it" data-mz-view="vendus"><i data-lucide="chart-no-axes-column-increasing"></i><span>Vendus</span></button>
          <button class="mz-nav-it" data-mz-view="clientes"><i data-lucide="users"></i><span>Clients</span><b class="mz-nav-badge" id="mz-badge-cl"></b></button>
          <button class="mz-nav-it" data-mz-view="acomptes"><i data-lucide="hand-coins"></i><span>Acomptes</span></button>
        </nav>
        <div class="mz-rail-foot">
          <button class="mz-lock" data-action="printer-connect" title="Configurer les imprimantes"><i data-lucide="printer"></i><span>Imprimantes</span></button>
          <button class="mz-net" id="mz-net" title="${IS_DEMO ? 'Simuler une coupure réseau' : 'État de la synchronisation'}">
            <i class="mz-net-dot"></i><span class="mz-net-label">En ligne</span>
          </button>
          <button class="mz-lock" id="mz-fs" title="Plein écran" aria-label="Basculer le plein écran" aria-pressed="false"><svg data-fs="enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><svg data-fs="exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg><span>Plein écran</span></button>
          ${IS_DEMO ? '' : '<button class="mz-lock" id="mz-close-day"><i data-lucide="power"></i><span>Fin de service</span></button>'}
          <button class="mz-lock" id="mz-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="mz-main">
        <div class="mz-offline-note" id="mz-offline-note" hidden>
          Hors-ligne, les ventes sont enregistrées sur la tablette et synchronisées au retour du réseau.
          <b id="mz-queue-count"></b>
        </div>
        <section class="mz-view is-on" data-mz-panel="vente">
          <div class="mz-sell">
            <header class="mz-head">
              <div><h1>Vente</h1><div class="mz-head-sub" id="mz-today"></div></div>
              <div class="mz-head-hint">Scannez un code-barres, ou touchez un article</div>
            </header>
            <div id="mz-exch-slot"></div>
            <div class="mz-sell-scan">
              <i data-lucide="scan-line"></i>
              <input id="mz-sell-ean" placeholder="Scannez un code-barres pour l'ajouter au ticket…" autocomplete="off" />
              <span class="mz-sell-scan-tag">Entrée</span>
              ${pvReal() && camSupported()
                ? `<button class="mz-sell-cam" id="mz-sell-cam" title="Scanner avec la caméra" aria-label="Scanner avec la caméra"><i data-lucide="camera"></i></button>`
                : ''}
            </div>
            <div class="mz-cats" id="mz-cats"></div>
            <div class="mz-grid-scroll" id="mz-gridwrap"></div>
          </div>
          <aside class="mz-ticket" id="mz-ticket"></aside>
        </section>
        <section class="mz-view" data-mz-panel="mouvements"></section>
        <section class="mz-view" data-mz-panel="casse"></section>
        <section class="mz-view" data-mz-panel="scan"></section>
        <section class="mz-view" data-mz-panel="inventaire"></section>
        <section class="mz-view" data-mz-panel="fournisseurs"></section>
        <section class="mz-view" data-mz-panel="echanges"></section>
        <section class="mz-view" data-mz-panel="vendus"></section>
        <section class="mz-view" data-mz-panel="clientes"></section>
        <section class="mz-view" data-mz-panel="acomptes"></section>
      </main>
      <div class="modal-veil" id="mz-sheet-veil"><div class="modal mz-sheet mz-rel" id="mz-sheetm"></div></div>
      <div class="modal-veil" id="mz-approve-veil"><div class="modal mz-approve mz-rel" id="mz-approvem"></div></div>
      <div class="modal-veil" id="mz-client-veil"><div class="modal mz-client mz-rel" id="mz-clientm"></div></div>
      <div class="modal-veil" id="mz-fiche-veil"><div class="modal mz-fiche mz-rel" id="mz-fichem"></div></div>
      <div class="modal-veil" id="mz-exch-veil"><div class="modal mz-exch mz-rel" id="mz-exchm"></div></div>
      <div class="modal-veil" id="mz-pay-veil"><div class="modal mz-pay mz-rel" id="mz-paym"></div></div>
      <div class="modal-veil" id="mz-inv-veil"><div class="modal mz-invm mz-rel" id="mz-invmm"></div></div>
      <div class="modal-veil" id="mz-avoir-veil"><div class="modal mz-avoirm mz-rel" id="mz-avoirmm"></div></div>
      <div class="modal-veil" id="mz-delivery-veil"><div class="modal mz-delivery-modal mz-rel" id="mz-deliverym"></div></div>`;

    $('#mz-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-mz-view]');
      if (b) switchView(b.dataset.mzView);
    });
    $('#mz-lock', root).addEventListener('click', () => {
      /* La feuille de clôture vit au niveau du body (au-dessus du root) : la
         laisser ouverte pendant le verrouillage la poserait sur l'écran PIN. */
      if (bqCloVeil) bqCloVeil.classList.remove('is-open');
      window.KiwiPosDispatch.lock();
    });
    const closeDay = $('#mz-close-day', root);
    if (closeDay) closeDay.addEventListener('click', bqOpenCloture);
    if (window.KiwiShiftNudge) window.KiwiShiftNudge.check({ host: root, scope: 'maison@' + merchantSlug(),
      openedAt: () => bqShift && bqShift.openedAt, open: bqOpenCloture, isBusy: () => state.checkoutBusy });
    $('#mz-net', root).addEventListener('click', toggleOffline);
    if (!mount._netBound) {
      mount._netBound = true;
      const refresh = () => syncNetworkState();
      window.addEventListener('online', () => { refresh(); try { bqReplayHeld(); } catch (_) {} });
      window.addEventListener('offline', refresh);
      window.addEventListener('kiwi:sale-queue', (e) => syncNetworkState(e && e.detail));
      window.addEventListener('storage', (e) => {
        if (!e || e.key === 'kiwiSaleQueue') syncNetworkState();
        if (e && e.key === TICKET_LEASE_KEY) ticketLease = null;
      });
    }
    syncNetworkState();
    setupFullscreenBtn();
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    /* Vente — scan-to-sell bar : a code scanned or typed here drops the article
       straight onto the ticket, supermarket-style. Commit on Enter only (the USB
       douchette ends every scan with Enter) so a scan is never counted twice. */
    const sellEan = $('#mz-sell-ean', root);
    if (sellEan) sellEan.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = sellEan.value.trim();
      sellEan.value = '';
      if (v) commitEan(v);
    });
    /* Même barre, sans douchette : la caméra dépose l'article sur le ticket. */
    const sellCam = $('#mz-sell-cam', root);
    if (sellCam) sellCam.onclick = () => openCamScan(commitEan);

    /* live catalogue → the sale grid, the sheet and the douchette track the DB.
       A PAIRED caisse (assets/caisse-pairing.js sets __kiwiPairedBoutiqueVenue)
       uses the real store's own catalogue — the same per-venue key the dashboard
       writes — so a real boutique shows its real stock. Unpaired demo (PIN 0002)
       stays Maison Mansour. When either side edits the inventory, rebuild. */
    if (window.KiwiBoutiqueCatalog) {
      /* A real/paired store keys its OWN catalogue (venueId, else the merchant slug —
         the identity spine) and NEVER falls back to the Maison Mansour demo, even when
         the pairing record carries no venueId (a non-custom merchant). Only the unpaired
         local demo (PIN 0002) stays on Maison Mansour. */
      var _bqPv = pvPaired();
      _bqKey = (pvReal() && _bqPv && _bqPv.merchant)          /* real → merchant slug — SAME key the dashboard uses (pages-pro.js _bqxVenue) */
        || window.__kiwiPairedBoutiqueVenue
        || (_bqPv && (_bqPv.venueId || _bqPv.merchant))
        || (pvReal() ? realFallbackKey() : 'vogueHome');
      adoptLegacySharedCatalogue(_bqKey);
      window.KiwiBoutiqueCatalog.use(_bqKey);
      /* Les promotions suivent EXACTEMENT la même clé que le catalogue : ce sont
         les prix de ce magasin-là. Une promotion rangée sous une autre clé que
         les articles qu'elle vise remiserait le catalogue du voisin — et,
         au retour d'une démo, brader la vraie boutique. */
      if (window.KiwiPromos) {
        window.KiwiPromos.use(_bqKey);
        /* Remontée serveur : le patron pose la promotion depuis le bureau, le
           comptoir doit la voir sans qu'on aille toucher la tablette. Le slug
           est celui du commerce, pas la clé locale (voir localKey dans
           promos.js) — deux surfaces du même magasin rangent leur copie sous
           des noms différents mais parlent au même document. */
        try {
          if (pvReal() && window.KiwiCloudDoc) {
            window.KiwiPromos.cloud(() => window.KiwiCloudDoc.slugFor(_bqKey));
          }
        } catch (_) {}
        if (!mount._promoSubbed) {
          mount._promoSubbed = true;
          window.KiwiPromos.subscribe(() => {
            /* Une promotion qui change repeint les PRIX : la grille, le rayon
               courant, le badge du rail. Le ticket en cours, lui, garde ses prix
               figés — voir linePromo. */
            if (!root || intake.open) return;
            /* renderCats() aussi : le filtre « En promo » n'existe que s'il a
               quelque chose à montrer, donc il apparaît et disparaît AVEC les
               promotions. Le laisser hors du repeint, c'était un onglet qui ne
               s'affichait qu'au prochain changement de rayon. */
            try { renderCats(); renderView(state.view); renderBadges(); icons(); } catch (_) {}
          });
        }
      }
    }
    rebuildCatalog();
    injectInvCss();
    if (window.KiwiBoutiqueCatalog && !mount._subbed) {
      mount._subbed = true;
      window.KiwiBoutiqueCatalog.subscribe(() => {
        /* Pendant une reprise de stock, la projection de vente (RAYONS / P /
         * BY_EAN) n'est lue par personne : la grille est cachée, et les écrans de
         * saisie interrogent la base directement. La reconstruire à chaque
         * enregistrement — plusieurs fois par article scanné — ne servait qu'à
         * ralentir l'import. On la rebâtit une seule fois, à la fermeture
         * (voir intakeClose), donc la caisse retrouve un catalogue à jour avant
         * la première vente. */
        if (intake.open) return;
        rebuildCatalog();
        if (root) { pruneTicket(); refreshAfterCatalog(); }
      });
    }
    /* Même avertissement que la caisse boutique (assets/pos-boutique.js) : le
       stock n'a pas pris sur cette tablette, la vente continue, la baisse part
       au serveur. Un seul écouteur pour la page, quelle que soit la caisse. */
    if (window.KiwiBoutiqueCatalog && !window.__kiwiCatalogSaveWarn) {
      window.__kiwiCatalogSaveWarn = true;
      let lastWarn = 0;
      window.addEventListener('kiwi:local-save', (e) => {
        const d = (e && e.detail) || {};
        if (d.store !== 'catalog') return;
        if (d.durable) {
          if (lastWarn) { lastWarn = 0; toast('Stock de nouveau enregistré sur cette caisse', 3200, 'success'); }
          return;
        }
        const now = Date.now();
        if (lastWarn && now - lastWarn < 30000) return;
        lastWarn = now;
        toast('Stock non enregistré sur cette caisse', 9000, 'warn',
          'La vente continue et le stock part au serveur dès que le réseau le permet. Libérez du stockage avant de recharger la page.');
      });
    }
    installWedgeScanner();

    /* Les ventes sorties des livres par la console opérateur. On écoute la
       liste, et on la redemande au montage : la caisse peut avoir été rouverte
       longtemps après le retrait, auquel cas l'annonce est passée sans nous mais
       l'état, lui, est toujours là (assets/live-link.js · voidedRefs). */
    if (!mount._voidsBound) {
      mount._voidsBound = true;
      document.addEventListener('kiwi-sales-voided', (e) => {
        try { reconcileVoids((e && e.detail && e.detail.refs) || []); } catch (_) {}
      });
    }
    try {
      if (window.KiwiLive && window.KiwiLive.voidedRefs) reconcileVoids(window.KiwiLive.voidedRefs());
    } catch (_) {}

    /* Pitch demo only: a mid-day sale already in progress. A REAL store starts with
       a truly empty ticket and NO client (attached on demand via « Chercher »). */
    freshTicket();
    if (IS_DEMO) seedDemoTicket();

    renderAll();
    syncReturnSales();
    ensureReturnCloud();
    /* Une vente retenue (voir bqHoldPost) repart dès que le commerce est
       résolu, puis à chaque minute tant qu'il en reste. */
    if (!IS_DEMO && !mount._heldTimer) {
      setTimeout(() => { try { bqReplayHeld(); } catch (_) {} }, 4000);
      mount._heldTimer = setInterval(() => {
        try { if (SALES.some((s) => s && s.pendingPost)) bqReplayHeld(); } catch (_) {}
      }, 60000);
    }

    /* Une vraie boutique ouvre son poste comme la caisse restaurant : fond
       d'ouverture d'abord, la vente ensuite. La démo entre directement. */
    bqMaybeOpenScreen();
  }

  /* Pick the first two in-stock articles from the live catalogue for the
     mid-day demo ticket (ids are the DB's, not the old hard-coded literals). */
  function seedDemoTicket() {
    const picks = [];
    for (const r of RAYONS) {
      for (const it of r.items) {
        const size = firstFree(it);
        if (size) { picks.push({ pid: it.id, size, color: it.colors[0], qty: 1, remise: 0 }); }
        if (picks.length >= 2) break;
      }
      if (picks.length >= 2) break;
    }
    state.ticket.lines = picks;
    picks.forEach((ln) => holdStock(ln.pid, ln.size, ln.qty, ln.isPiece));
  }
  /* Drop ticket lines whose product vanished from the catalogue. */
  function pruneTicket() { if (state.ticket) state.ticket.lines = state.ticket.lines.filter((ln) => P[ln.pid]); }
  function refreshAfterCatalog() {
    if (!root) return;
    /* Pendant une reprise de stock, la liste d'inventaire est CACHÉE derrière le
     * formulaire : la redessiner à chaque enregistrement ne montre rien à
     * personne et coûte cher. invRow() et stats() relisent tous les variants pour
     * chaque produit — du O(produits × variants) — donc sur un import de plusieurs
     * milliers d'articles la caisse ralentissait scan après scan, exactement là où
     * elle doit rester vive. On redessine une fois, à la fermeture. */
    if (intake.open) return;
    try { renderCats(); renderView(state.view); renderBadges(); icons(); } catch (e) {}
  }

  function onShow() {
    if (!root) return;
    syncTillStaff();                      // a new shift may have unlocked the till
    bqMaybeOpenScreen();                  // re-unlock without a poste open → fond d'ouverture
    const today = $('#mz-today', root);
    if (today) today.textContent = headSubVente();
    renderBadges();
    renderView(state.view);
    icons();
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV / SHELL ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.mz-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.mzView === view));
    $$('.mz-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.mzPanel === view));
    renderView(view);
    icons();
    /* Le registre local s'affiche tout de suite, puis se rapproche du serveur.
       Une synchronisation lente ne doit jamais bloquer l'ouverture du rayon. */
    if (view === 'mouvements' && !state.movementSyncing && window.KiwiInventory?.sync) {
      state.movementSyncing = true;
      Promise.resolve(window.KiwiInventory.sync()).catch(() => null).then(() => {
        state.movementSyncing = false;
        if (state.view === 'mouvements') { renderMovements(); icons(); }
      });
    }
  }
  function renderView(view) {
    if (view === 'vente') { renderCats(); renderTicket(); renderGrid(); renderExchNote(); }
    if (view === 'mouvements') renderMovements();
    if (view === 'casse') renderCasse();
    if (view === 'scan') renderScan();
    if (view === 'inventaire') renderInventaire();
    if (view === 'fournisseurs') renderSuppliers();
    if (view === 'echanges') renderEchanges();
    if (view === 'vendus') {
      const panel = $('[data-mz-panel="vendus"]', root);
      if (window.KiwiSoldInsights) window.KiwiSoldInsights.renderTill(panel);
      else panel.innerHTML = '<div class="mz-empty" style="margin:40px;">Analyse des ventes indisponible.</div>';
    }
    if (view === 'clientes') renderClientes();
    if (view === 'acomptes') renderAcomptes();
  }
  function renderBadges() {
    const items = state.ticket ? ticketCount(state.ticket) : 0;
    const avs = activeAvoirs().length;
    const set = (id, n) => {
      const el = $(id, root);
      if (!el) return;
      el.textContent = n || '';
      el.style.display = n ? '' : 'none';
    };
    set('#mz-badge-vente', items);
    set('#mz-badge-scan', state.scanLog.length);
    set('#mz-badge-ret', avs);
    set('#mz-badge-cl', (window.KiwiClients && KiwiClients.count && KiwiClients.count()) || CLIENTES.length);
    const invBadge = $('#mz-badge-inv', root);
    if (invBadge) { const st = window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.stats() : null; const n = st ? st.ruptures + st.low : 0; invBadge.textContent = n || ''; invBadge.style.display = n ? '' : 'none'; }
  }
  function headSubVente() {
    // Le compte de ventes suit la même règle que la recette : la journée, pas la
    // semaine conservée pour les retours.
    const n = salesToday().length;
    return `${fmtDT(new Date())} · ${n} vente${n > 1 ? 's' : ''} · ${fmtMAD(caToday())} aujourd'hui`;
  }
  function renderAll() {
    $('#mz-today', root).textContent = headSubVente();
    renderCats();
    renderGrid();
    renderTicket();
    renderExchNote();
    renderBadges();
    renderNet();
    icons();
  }
  /* merchant-config.js est en `defer` et interroge /api/config : la réponse
     arrive APRÈS le premier rendu. Si l'option s'allume à ce moment-là, la
     caisse redessine — sinon les repères B n'apparaîtraient qu'au prochain
     changement d'écran. */
  let _depotWas = depotOn();
  document.addEventListener('kiwi-config', () => {
    const now = depotOn();
    if (now === _depotWas) return;
    _depotWas = now;
    try { renderAll(); } catch (_) {}
  });

  function refreshOps() {
    renderBadges();
    renderView(state.view);
    icons();
  }

  async function issueAvoir(amount, cliente, motif, fromSaleId, context) {
    if (!IS_DEMO) {
      if (context && context.originalSale) fromSaleId = await ensureOriginalSale(context.originalSale);
      const requestId = (context && context.requestId) || creditIntent('credit-issue');
      const approval = await avoirApproval(amount, requestId, fromSaleId);
      const data = await creditRequest({
        action: 'issue', id: requestId, originalSaleId: fromSaleId, approval,
        originalRef: context && context.originalRef, amountCents: Math.round(amount * 100),
        customerId: cliente && cliente.id, customerName: cliente && cliente.name,
        reason: motif, expiresAt: Date.now() + 182 * 24 * 3600 * 1000,
        resellable: !context || context.resellable !== false,
        lines: context && context.lines,
      });
      const av = creditFromServer(data.credit);
      const old = AVOIRS.findIndex((item) => item.code === av.code);
      if (old >= 0) AVOIRS.splice(old, 1, av); else AVOIRS.unshift(av);
      persistAvoirs(); renderBadges();
      toast(`${av.code} émis, ${fmtMAD(amount)}`);
      return av;
    }
    const av = {
      code: `AV-${avSeq++}`,
      amount, balance: amount,
      holderId: cliente ? cliente.id : null,
      holderName: cliente ? cliente.name : 'Porteur du bon',
      motif, at: new Date(),
      until: new Date(Date.now() + 182 * 24 * 3600 * 1000),
      from: fromSaleId || null,
    };
    AVOIRS.unshift(av);
    persistAvoirs();                          // un bon émis doit survivre au rechargement de la caisse
    queueIfOffline(`Avoir ${av.code}`);
    toast(`${av.code} émis, ${fmtMAD(amount)}, pièces remises en stock`);
    renderBadges();
    return av;
  }

  function checkout() {
    const t = state.ticket;
    if (!t.lines.length) return;
    if (state.syncStorageError || state.ticketStorageError) {
      toast('Vente suspendue', 'La tablette ne peut plus sécuriser la file hors-ligne. Contactez le support avant de continuer.');
      return;
    }
    if (!IS_DEMO && t.period !== ticketPeriod()) {
      t.num = '';
      t.period = ticketPeriod();
    }
    if (!t.num) {
      assignTicketNumber(t).then(() => { if (state.ticket === t) checkout(); })
        .catch(() => toast('Numéro de ticket indisponible', state.ticketStorageError
          ? 'Le stockage sécurisé de cette tablette est indisponible. Contactez le support.'
          : 'Reconnectez cette caisse pour réserver sa prochaine série.'));
      return;
    }
    const tot = ticketTotals(t);
    const total = tot.total;
    const c = ticketClient();
    const RS = window.KiwiRepeatSale, repeatSig = RS ? RS.signature(t.lines.map(ln => Object.assign({}, ln, { unit: lineUnit(ln) })), total) : '';
    const beginPay = () => openPay({
      amount: total,
      customerId: c ? c.id : null,
      beforePaid: () => window.KiwiLoyaltyReserve.create({ isDemo: IS_DEMO, ticket: t, client: c, render: renderTicket, close: () => { state.checkoutBusy = false; closeVeil('#mz-pay-veil'); } }).confirm(),
      title: 'Encaissement',
      subtitle: `${t.num} · ${c ? esc(c.name) : 'Cliente de passage'}`,
      ref: t.num,
      lines: t.lines.map((ln) => ({
        qty: ln.qty,
        name: (P[ln.pid] ? P[ln.pid].name : 'Article') + (ln.size && ln.size !== 'TU' ? ' ' + ln.size : '') + (ln.isPiece ? ' (À la pièce)' : ''),
        amount: lineUnit(ln) * ln.qty,
        ref: ln.pid,
        barcode: (P[ln.pid] && P[ln.pid].barcode) || '',
        marque: ln.marque || (P[ln.pid] && P[ln.pid].marque) || '',
        motif: ln.motif || (P[ln.pid] && P[ln.pid].motif) || '',
        format: ln.format || (P[ln.pid] && P[ln.pid].format) || 'piece',
      })),
      subtotal: t.lines.reduce((s, ln) => {
        const p = P[ln.pid];
        const orig = shelf((ln.customPrice != null) ? ln.customPrice : (p ? p.price : 0));
        return s + orig * ln.qty;
      }, 0),
      promo: tot.promo ? { amount: tot.promo, label: promoLabelForTicket(t) } : null,
      discount: tot.remise + tot.reward,
      customer: c ? { name: c.name, phone: c.phone, points: c.points, loyalty: (t.reward && t.reward.clientId === t.client) ? t.reward.label : '' } : null,
      waName: c ? firstName(c.name) : null, waPhone: c ? c.phone : null,
      onPaid: (parts, paymentContext) => {
        const isAcompte = !!(paymentContext && paymentContext.partial);
        const receivedNow = isAcompte ? paymentContext.paidNow : total;
        if (isAcompte && (!c || !c.id || !window.KiwiRetailBalances || tot.consigned > 0)) {
          toast('Acompte : cliente requise, hors articles en dépôt-vente'); return { error: 'acompte-not-eligible' };
        }
        const rewardUsed = !!(t.reward && c && c.id && t.reward.clientId === c.id);
        const sale = {
          id: t.num, syncId: t.syncId || newSaleId(), tenderVersion: 2, at: new Date(), clientId: c ? c.id : null, by: STAFF.caissiere.name, kind: isAcompte ? 'acompte' : 'vente',
          /* Référence provisoire émise hors ligne : le journal doit le dire, la
             vente elle-même est complète et synchronisable. */
          offlineRef: isOfflineRef(t.num) || undefined,
          methods: parts.map((x) => x.m).join(' + '),
          parts: parts.map((x) => ({ m: x.m, amount: Math.round((+x.amount || 0) * 100) / 100 })),
          discount: bqMoney(tot.remise + tot.reward),
          remiseAuth: (t.remiseAuth && typeof t.remiseAuth === 'object')
            ? { by: t.remiseAuth.by || '', role: t.remiseAuth.role || '', at: t.remiseAuth.at, pct: t.remiseAuth.pct, amount: bqMoney(tot.remise) }
            : null,
          promoOff: bqMoney(tot.promo),
          giftWrap: !!t.giftWrap,
          delivery: t.delivery ? Object.assign({}, t.delivery) : null,
          lines: t.lines.map((ln) => ({
            pid: ln.pid, size: ln.size, color: ln.color, qty: ln.qty, remise: ln.remise, promo: linePromo(ln),
            unit: lineUnit(ln), returned: false, note: '', format: ln.format, isPiece: ln.isPiece,
            marque: ln.marque, motif: ln.motif, fragile: ln.fragile, registryId: ln.registryId,
            name: (P[ln.pid] && P[ln.pid].name) || ln.name || 'Article',
            category: rayonOf(ln.pid) || '',
            variantId: [ln.pid, ln.size || '', ln.color || ''].join(':'),
            /* Figé à l'encaissement : si l'article cesse d'être en dépôt-vente
               demain, le journal d'hier doit rester vrai. */
            consigned: isConsigned(ln)
          })),
          reward: rewardUsed ? t.reward.label : null,
          total: receivedNow,
          balanceTotal: isAcompte ? total : null,
          balanceDue: isAcompte ? Math.round((total - receivedNow) * 100) / 100 : 0,
          /* `total` = ce que la cliente a payé (et ce que le tiroir contient).
             `consigned` = la part qui appartient aux déposants. `own` = la
             recette réelle du commerce. Les trois sont écrites : rien n'est
             retiré du journal, tout est attribué. */
          consigned: bqMoney(tot.consigned),
          own: isAcompte ? receivedNow : bqMoney(tot.own),
        };
        const balanceId = isAcompte ? 'rb-' + sale.syncId : '';
        if (isAcompte) {
          const savedBalance = window.KiwiRetailBalances.record(merchantSlug(), {
            id: balanceId, customerId: c.id, ticketRef: sale.id,
            totalCents: Math.round(total * 100), receipt: {
              id: sale.syncId, amountCents: Math.round(receivedNow * 100),
              method: bqPaymentMethod(parts), ts: +sale.at,
            },
          });
          if (!savedBalance) { toast('Acompte non conservé : stockage local indisponible'); return { error: 'balance-storage-failed' }; }
          bqOutstandingCents = window.KiwiRetailBalances.read(merchantSlug())
            .reduce((sum, row) => sum + window.KiwiRetailBalances.due(row), 0);
        }
        SALES.unshift(sale);
        persistDay();
        bqSaveProvisional(isAcompte);
        if (IS_DEMO) saleSeq++;
        sale.lines.forEach((ln) => persistStock(ln.pid, ln.size, ln.color, -(ln.units != null ? ln.units : ln.qty), { ref: sale.num || sale.id, why: 'vente' }));
        if (typeof updateRegistryContribution === 'function') updateRegistryContribution(sale);
        try {
          if (window.KiwiLive && window.KiwiLive.isOn()) {
            const received = (parts || []).filter((x) => x && x.m !== 'avoir' && x.m !== 'livraison' && (+x.amount || 0) > 0);
            const receivedMethods = received.map((x) => x.m);
            const method = bqPaymentMethod(parts);
            const first = t.lines[0];
            const pieces = t.lines.reduce((n, ln) => n + ln.qty, 0);
            const name = (first && P[first.pid]) ? P[first.pid].name : 'Vente';
            const label = t.lines.length > 1 ? (name + ' +' + (pieces - first.qty) + ' art.') : name;
            /* On remonte l'argent QUI RENTRE, pas la valeur du ticket. Un avoir
               n'est pas un encaissement : c'est la consommation d'une dette née
               d'une vente déjà comptée. Remonter le total, c'est compter deux
               fois — un caftan à 1 200 rendu puis réglé avec l'avoir affichait
               2 400 MAD de recette pour 1 200 MAD réellement pris. Réglé
               entièrement en avoir, il ne reste rien à remonter et postSale
               (montant ≤ 0) passe son tour, ce qui est le bon comptage.
               sale.total garde la valeur du ticket : c'est la vente, pas la caisse. */
            let cashIn = received.reduce((s, x) => s + (+x.amount || 0), 0);
            /* Même raisonnement que l'avoir juste au-dessus, pour une autre
               raison : l'argent du dépôt-vente entre bien dans le tiroir, mais
               il n'est pas à elle. Le remonter gonflerait son chiffre d'affaires
               d'une somme qu'elle doit reverser. La vente reste enregistrée —
               c'est l'ATTRIBUTION qui change, pas l'existence de la vente. */
            cashIn = Math.max(0, bqMoney(cashIn - bqMoney(tot.consigned)));
            /* LE PANIER, qui ne partait pas. On ne remontait que {montant,
               moyen, libellé}, et le libellé est un RÉSUMÉ de ticket
               (« Caftan +3 art. ») : le tableau de bord ne pouvait donc pas dire
               à la patronne combien de jeans noirs elle avait vendus, alors que
               la caisse le savait ligne par ligne. Le rayon voyage avec chaque
               ligne — c'est lui qui fait tenir le « Catégorie : Jeans » du
               rapport de fin de journée même si le rayon est renommé plus tard.
               Bornes identiques à celles de /api/sale : 40 lignes, 60 signes. */
            const lineTotals = bqLineTotals(t.lines.map((ln) => lineUnit(ln) * ln.qty), tot.total);
            const basket = bqFoldBasket(t.lines.map((ln, i) => ({
              itemId: ln.pid,
              variantId: [ln.pid, ln.size || '', ln.color || ''].join(':'),
              name: (P[ln.pid] ? P[ln.pid].name : 'Article') + (ln.size ? ' ' + ln.size : ''),
              qty: ln.qty,
              total: lineTotals[i],
              cat: rayonOf(ln.pid) || '',
              unit: 'piece',
              kind: 'product',
            })));
            /* Réglée entièrement en avoir : aucun argent n'entre, mais la
               marchandise sort. On le DIT, avec le montant d'avoir consommé,
               pour que le panier arrive quand même au serveur — sinon la vente
               n'existe nulle part ailleurs que sur cette tablette. */
            const creditIn = (parts || []).reduce((sum, x) => sum + (x && x.m === 'avoir' ? (+x.amount || 0) : 0), 0);
            const payload = {
              id: sale.syncId,
              amount: cashIn,
              amountCents: Math.round(cashIn * 100),
              ticketAmountCents: Math.round(receivedNow * 100),
              consignedAmountCents: Math.round(tot.consigned * 100),
              method: method,
              paymentParts: bqPaymentParts(parts),
              discountPercents: [...new Set(t.lines.map(ln => Number(ln.remise)).filter(n => n > 0))],
              channel: (parts || []).some((x) => x && x.m === 'livraison') ? 'delivery' : 'counter',
              label: isAcompte ? 'Acompte · ' + label : label,
              ref: sale.id,
              time: sale.at,
              lines: basket,
            };
            if (isAcompte) payload.retailBalance = {
              id: balanceId, customerId: c.id, ticketRef: sale.id,
              totalCents: Math.round(total * 100), stage: 'open',
            };
            if (cashIn <= 0 && creditIn > 0 && basket.length) {
              payload.settlementKind = 'store-credit';
              payload.creditAmountCents = Math.round(creditIn * 100);
            } else if (cashIn <= 0 && tot.consigned >= total && basket.length) {
              payload.settlementKind = 'consignment';
            } else if (cashIn <= 0 && (parts || []).some((x) => x && x.m === 'livraison') && basket.length) {
              payload.settlementKind = 'receivable';
            }
            bqPost(sale, payload);
          }
        } catch (_) {}
        let ptsLine = '';
        if (c) {
          // Persist the purchase to the SHARED client book (spend + points + visit)
          // so the owner's dashboard client directory + loyalty reflect it — a real
          // store's sale must attach to the real client, not a throwaway in-memory
          // object. Real store only; the local demo keeps its in-memory client. F5.
          /* Le toast dit les points réellement crédités, comme la boutique : il
             annonçait un point pour 10 MAD, codé en dur, quel que soit le programme. */
          let pts = 0;
          const ptsBefore = Number(c.points) || 0;
          if (useKiwiCl() && window.KiwiClients && window.KiwiClients.recordPurchase && c.id) {
            try { const res = window.KiwiClients.recordPurchase(c.id, {
              amount: receivedNow, method: sale.methods, saleRef: sale.id, saleId: sale.syncId, eventRef: sale.syncId, createdAt: +sale.at,
              items: sale.lines.map((ln) => ({ name: (P[ln.pid] && P[ln.pid].name) || ln.name || 'Article', qty: ln.qty, total: ln.unit * ln.qty, id: ln.pid || '' })),
            }); if (res && res.client && !res.replayed) pts = Math.max(0, (Number(res.client.points) || 0) - ptsBefore); } catch (_) {}
            // La récompense est portée : on retire le seuil (KiwiClients.redeem),
            // après recordPurchase pour que l'achat compte d'abord. Sans réservation,
            // LA VENTE nomme la remise · assets/loyalty-reward.js
            if (rewardUsed && window.KiwiClients.redeem) {
              try { window.KiwiClients.redeem(c.id, null, (t.reward && t.reward.reservation) || { ref: window.KiwiClients.redemptionRef(c.id, sale.syncId || sale.id) }); } catch (_) {}
            }
          }
          if (!useKiwiCl()) {
            const cfg = window.KiwiClients && window.KiwiClients.config ? window.KiwiClients.config() : null;
            pts = cfg && cfg.model === 'amount' ? Math.floor(receivedNow * ((cfg.amount && cfg.amount.perMad) || 1) + 1e-6) : 0;
          }
          c.points = ptsBefore + pts;
          c.achats += 1;
          ptsLine = (pts ? ` · +${pts} pts pour ${firstName(c.name)}` : '') + (rewardUsed ? ` · récompense ${t.reward.label}` : '');
        }
        if (RS) RS.remember('maison', repeatSig, sale.id);
        queueIfOffline(`Vente ${sale.id}`);
        freshTicket();
        $('#mz-today', root).textContent = headSubVente();
        renderTicket(); renderGrid(); renderBadges(); icons();
        const delivery = parts.some((x) => x.m === 'livraison');
        return { ref: sale.id, sale, delivery, line: delivery
          ? `Vente ${sale.id} en livraison, ${fmtMAD(total)} à recevoir${ptsLine}`
          : `Vente ${sale.id} encaissée, ${fmtMAD(total)}${ptsLine}` };
      },
    });
    if (!(RS && RS.confirmRepeat({ scope: 'maison', sig: repeatSig, el: $('#mz-paym', root), open: () => openVeil('#mz-pay-veil'), close: () => closeVeil('#mz-pay-veil'), busy: () => {}, go: () => state.ticket === t && beginPay(), classes: { x: 'mz-modal-x', foot: 'mz-sheet-foot', no: 'mz-btn secondary', yes: 'cash-confirm' } }))) beginPay();
  }
  function payExistingBalance(row) {
    const R = window.KiwiRetailBalances;
    if (!R || row.pendingCents > 0) { toast('Synchronisation de l’acompte en attente'); return; }
    const remaining = R.due(row) / 100;
    if (!(remaining > 0)) { toast('Cette note est déjà réglée'); renderAcomptes(); return; }
    const client = clById(row.customerId);
    openPay({
      amount: remaining, balanceExisting: true, balanceTotal: row.totalCents / 100,
      balancePaid: row.paidCents / 100, customerId: row.customerId,
      title: 'Régler un acompte', subtitle: `${row.ticketRef} · ${client ? esc(client.name) : 'Cliente'}`,
      ref: row.ticketRef, lines: [], customer: client ? { name: client.name, phone: client.phone } : null,
      waName: client ? firstName(client.name) : '', waPhone: client ? client.phone : '',
      onPaid: (parts, context) => {
        const amount = context.paidNow;
        const at = new Date();
        const syncId = newSaleId();
        const method = bqPaymentMethod(parts);
        const sale = {
          id: row.ticketRef + '-P' + at.getTime(), syncId, tenderVersion: 2, at,
          clientId: row.customerId, by: STAFF.caissiere.name, kind: 'acompte-reglement',
          methods: parts[0].m, parts: [{ m: parts[0].m, amount }], lines: [], total: amount,
          balanceTotal: row.totalCents / 100,
          balanceDue: Math.max(0, (R.due(row) / 100) - amount),
        };
        const saved = R.record(merchantSlug(), {
          id: row.id, customerId: row.customerId, ticketRef: row.ticketRef,
          totalCents: row.totalCents, basePaidCents: row.paidCents,
          receipt: { id: syncId, amountCents: Math.round(amount * 100), method, ts: +at },
        });
        if (!saved) { toast('Règlement non conservé : stockage local indisponible'); return { error: 'balance-storage-failed' }; }
        bqOutstandingCents = R.read(merchantSlug()).reduce((sum, item) => sum + R.due(item), 0);
        SALES.unshift(sale); persistDay(); bqSaveProvisional(true);
        try { if (window.KiwiLive && window.KiwiLive.isOn()) bqPost(sale, {
          id: syncId, amount, amountCents: Math.round(amount * 100), method,
          paymentParts: bqPaymentParts(parts), ticketAmountCents: Math.round(amount * 100),
          label: 'Règlement acompte', ref: row.ticketRef, time: at, channel: 'counter',
          retailBalance: { id: row.id, customerId: row.customerId, ticketRef: row.ticketRef,
            totalCents: row.totalCents, stage: 'payment' },
        }); } catch (_) { /* the local journal remains readable */ }
        renderAcomptes(); renderAll();
        return { sale, line: `Reçu ${fmtMAD(amount)} · reste ${fmtMAD(sale.balanceDue)}` };
      },
    });
  }

  /* ═══════════════════════ FIN DE SERVICE ═══════════════════════
     Le cycle de poste de la caisse restaurant, porté à la boutique : fond
     d'ouverture au déverrouillage, clôture avec tiroir-caisse et comptage,
     rapport Z imprimé et classé (KiwiDayReport) — le MÊME document que le
     tableau de bord rouvre le lendemain, rangé sous le même slug. Réservé aux
     VRAIES boutiques : la démo (PIN 0002) garde son entrée directe — elle n'a
     ni tiroir ni comptabilité, et KiwiDayReport refuse de toute façon
     d'archiver une démo. L'écran d'ouverture et la feuille de clôture
     réutilisent les styles .clockin-* / .clo-* de kiwi-caisse.html : même
     geste, même dessin, zéro CSS dupliqué. */

  const BQ_SHIFT_KEY = 'kiwi:bqShift';
  let bqShift = null;               /* { openedAt: ms, openedBy, float } */
  (function bqShiftRestore() {
    if (IS_DEMO) return;
    try {
      const s = JSON.parse(localStorage.getItem(BQ_SHIFT_KEY) || 'null');
      /* Maison annonce ses postes depuis l'ouverture : un poste plus ancien
         que le drapeau openSent l'a déjà été. */
      if (s && +s.openedAt > 0) bqShift = { openedAt: +s.openedAt, openedBy: String(s.openedBy || ''), float: +s.float || 0,
        sid: String(s.sid || ''), openSent: s.openSent !== false };
    } catch (_) {}
  })();
  /* ── LE RÉCONCILIATEUR DOIT VOIR CE COMPTOIR ───────────────────────────────
   * La caisse maison tenait son poste entièrement pour elle : aucun événement
   * de session n'était émis, donc `cash_session_events` restait vide pour ce
   * commerce et le rapprochement de caisse regardait un terminal qui, pour lui,
   * n'avait jamais ouvert ni fermé. On émet donc les deux bornes du poste —
   * ouverture (fond) et clôture (attendu / compté / écart) — par le MÊME canal
   * durable que les autres verticales (KiwiCashSessions, boîte d'envoi hors
   * ligne comprise). Aucun chiffre n'est recalculé ici : ils viennent du
   * rapport Z, le document qui fait foi. */
  /* L'identifiant est posé à l'ouverture et ne bouge plus : l'ouverture et la
     clôture d'un même poste doivent toujours se retrouver au registre. */
  function bqSessionId() {
    return bqShift && bqShift.sid ? bqShift.sid : 'bq-' + (bqShift && bqShift.openedAt ? bqShift.openedAt : 0);
  }
  /* L'ouverture, annoncée une fois. Sans elle le serveur refuse la clôture
     (session-not-open) et la caisse finit par la mettre de côté. */
  function bqAnnounceOpen() {
    if (!bqShift || bqShift.openSent) return false;
    if (!bqCashEvent('open', { countedCents: bqCents(bqShift.float) })) return false;
    bqShift.openSent = true;
    bqShiftPersist();
    return true;
  }
  function bqActorId() {
    const s = (STAFF && STAFF.caissiere) || {};
    /* Jamais un code : un code de caisse est un secret, pas une identité. */
    return String(s.id || s.name || 'caisse');
  }
  function bqCashEvent(eventType, extra) {
    if (IS_DEMO) return false;
    const CS = window.KiwiCashSessions;
    if (!CS || typeof CS.emit !== 'function' || !bqShift || !bqShift.openedAt) return false;
    try {
      return CS.emit(Object.assign({
        sessionId: bqSessionId(),
        eventType,
        actorId: bqActorId(),
        openedAt: bqShift.openedAt,
        occurredAt: Date.now(),
      }, extra || {}));
    } catch (_) { return false; }
  }
  const bqCents = (v) => Math.round((+v || 0) * 100);

  function bqShiftPersist() {
    try {
      if (bqShift) localStorage.setItem(BQ_SHIFT_KEY, JSON.stringify(bqShift));
      else localStorage.removeItem(BQ_SHIFT_KEY);
    } catch (_) {}
  }

  /* Ce que chaque vente a réellement mis dans le tiroir. Les parts de règlement
     sont figées sur la vente à l'encaissement (sale.parts) ; une vente d'avant
     cette version n'en porte pas, et on retombe sur `methods` — exact pour un
     règlement simple, et pour un mixte le total est posé sur le premier moyen
     monétaire (approximation limitée au jour de la transition). Un avoir n'est
     jamais de l'argent qui rentre : il consomme une dette déjà comptée. */
  function bqMoneyParts(s) {
    if (Array.isArray(s.parts) && s.parts.length) {
      return s.parts.filter((p) => p && p.m !== 'avoir' && +p.amount > 0)
        .map((p) => ({ m: p.m, amount: +p.amount }));
    }
    const names = String(s.methods || '').split(' + ').filter((m) => m && m !== 'avoir');
    /* Vente importée : seul ce que le serveur a reçu est de l'argent. Un ticket
       réglé par avoir arrivait en « credit » à 0 et comptait sa valeur entière. */
    const amount = s.remote && Number.isFinite(+s.receivedAmount) ? Math.min(+s.total || 0, +s.receivedAmount) : +s.total;
    return names.length && amount > 0 && !(s.remote && names[0] === 'livraison') ? [{ m: names[0], amount }] : [];
  }
  const BQ_SRV_METHOD = { 'espèces': 'cash', 'carte': 'card', 'virement': 'transfer', 'chèque': 'cheque', 'avoir': 'credit', 'livraison': 'delivery' };
  function bqPaymentParts(parts) {
    return (parts || []).filter((part) => part && +part.amount > 0).map((part) => ({
      method: BQ_SRV_METHOD[part.m] || 'wallet', amountCents: Math.round((+part.amount || 0) * 100),
    }));
  }
  function bqPaymentMethod(parts) {
    const methods = bqPaymentParts(parts);
    if (methods.length === 1) return methods[0].method;
    if (methods.some((part) => part.method !== 'credit' && part.method !== 'delivery')) return 'split';
    return methods.some((part) => part.method === 'delivery') ? 'delivery' : 'credit';
  }

  function bqDayTotals() {
    const t = { moneyIn: 0, cash: 0, card: 0, transfer: 0, cheque: 0, delivery: 0, other: 0, txns: 0, paidTxns: 0, items: 0, discounts: 0, discountsN: 0, promoOff: 0, avoirUsed: 0, avoirUsedN: 0, avoirIssued: 0, avoirIssuedN: 0, acompteReceived: 0, outstanding: 0 };
    salesToday().forEach((s) => {
      let took = 0;
      /* L'avoir consommé, compté À PART du reste. bqMoneyParts l'écarte — à
         raison, ce n'est pas de l'argent qui rentre — mais l'écarter du total
         ne dispense pas de le dire : la marchandise, elle, est bien sortie du
         magasin. Sans cette ligne, un Z pouvait laisser partir 1 200 MAD de
         stock contre un avoir sans qu'aucun chiffre de la clôture ne bouge. */
      let onAvoir = 0;
      if (Array.isArray(s.parts)) s.parts.forEach((p) => { if (p && p.m === 'avoir') onAvoir += +p.amount || 0; });
      if (onAvoir > 0) { t.avoirUsed += onAvoir; t.avoirUsedN++; }
      bqMoneyParts(s).forEach((p) => {
        if (p.m !== 'livraison') took += p.amount;
        if (p.m === 'espèces') t.cash += p.amount;
        else if (p.m === 'carte') t.card += p.amount;
        else if (p.m === 'virement') t.transfer += p.amount;
        else if (p.m === 'chèque') t.cheque += p.amount;
        else if (p.m === 'livraison') t.delivery += p.amount;
        else t.other += p.amount;
      });
      if (took > 0) { t.moneyIn += took; t.paidTxns++; }
      if (s.kind === 'acompte' || s.kind === 'acompte-reglement') t.acompteReceived += took;
      /* DEUX compteurs, parce qu'il y a deux questions. `paidTxns` ne retient
         que les tickets qui ont fait entrer de l'argent — c'est le diviseur du
         ticket moyen. `txns` compte TOUS les tickets du jour, y compris celui
         réglé entièrement par avoir ou parti en livraison : sans lui, la
         clôture affichait « Transactions 6 · Articles vendus 6 » alors que les
         articles, eux, étaient comptés sur sept tickets. Deux lignes voisines
         qui ne parlaient pas de la même journée. */
      t.txns++;
      (s.lines || []).forEach((ln) => { t.items += lineAvailableQty(ln); });
      const d = +s.discount || 0;
      if (d > 0) { t.discounts += d; t.discountsN++; }
      /* Compté À PART des réductions. Une gérante qui voit « 4 200 MAD de
         réductions accordées » sans savoir que 3 900 viennent de la promotion
         qu'elle a elle-même lancée croit que son équipe brade le magasin. */
      t.promoOff += +s.promoOff || 0;
    });
    /* Les deux sens de l'avoir sur la même journée : ce qui a été ÉMIS (une
       dette que le magasin vient de contracter) et ce qui a été CONSOMMÉ (une
       dette qu'il vient d'éteindre en marchandise). Les additionner serait un
       contresens ; les taire l'était aussi. */
    AVOIRS.forEach((a) => {
      if (!a || !a.at || !isToday(a.at)) return;
      const v = +a.amount || 0;
      if (v > 0) { t.avoirIssued += v; t.avoirIssuedN++; }
    });
    t.outstanding = bqOutstandingCents / 100;
    ['moneyIn', 'cash', 'card', 'transfer', 'cheque', 'delivery', 'other', 'discounts', 'promoOff', 'avoirUsed', 'avoirIssued', 'acompteReceived'].forEach((k) => { t[k] = Math.round(t[k] * 100) / 100; });
    return t;
  }

  /* Le journal du jour, traduit vers la forme que KiwiDayReport.build attend.
     Une entrée PAR PART monétaire — la même écriture que la caisse restaurant,
     où chaque part d'un règlement partagé passe par recordSale : c'est ce qui
     rend le tiroir exact quand un ticket est réglé moitié carte moitié espèces.
     Le panier ne voyage qu'avec la première part, sinon le classement par
     rayon compterait chaque article deux fois. */
  function bqReportSales() {
    const out = [];
    salesToday().forEach((s) => {
      const at = (s.at instanceof Date ? s.at : new Date(s.at)).getTime();
      const lines = (s.lines || []).filter((ln) => lineAvailableQty(ln) > 0).map((ln) => ({
        name: ((P[ln.pid] && P[ln.pid].name) || 'Article') + (ln.size ? ' ' + ln.size : ''),
        qty: lineAvailableQty(ln),
        total: Math.round((+ln.unit || 0) * lineAvailableQty(ln) * 100) / 100,
        cat: rayonOf(ln.pid) || '',
      }));
      const taken = bqMoneyParts(s);
      if (s.syncId && taken.length) {
        out.push({ id: s.syncId, ts: at,
          amount: taken.reduce((sum, part) => sum + part.amount, 0),
          method: bqPaymentMethod(s.parts),
          parts: bqPaymentParts(taken),
          label: s.kind === 'echange' ? 'Différence échange' : s.kind === 'acompte' ? 'Acompte' : s.kind === 'acompte-reglement' ? 'Règlement acompte' : 'Vente',
          ref: s.id, cashier: s.by || '', lines: lines.length ? lines : null });
        return;
      }
      let first = true;
      taken.forEach((p, i) => {
        out.push({
          id: s.id + (i ? '#' + i : ''),
          ts: at,
          amount: p.amount,
          method: BQ_SRV_METHOD[p.m] || 'wallet',
          label: s.kind === 'echange' ? 'Différence échange' : s.kind === 'acompte' ? 'Acompte' : s.kind === 'acompte-reglement' ? 'Règlement acompte' : 'Vente',
          ref: s.id,
          cashier: s.by || '',
          lines: first && lines.length ? lines : null,
        });
        first = false;
      });
    });
    return out;
  }

  function bqReportSession(counted) {
    const t = bqDayTotals();
    return {
      openedAt: bqShift ? bqShift.openedAt : 0,
      openedBy: bqShift ? bqShift.openedBy : '',
      closedBy: (STAFF.caissiere && STAFF.caissiere.name) || '',
      openingFloat: bqShift ? bqShift.float : 0,
      cashMovements: [], handovers: [],
      discounts: t.discounts, discountsCount: t.discountsN, cancels: 0,
      /* L'avoir voyage jusqu'au rapport, sinon il ne sort que sur l'écran de
         clôture et disparaît du Z imprimé — le seul document qui reste. */
      avoirs: { issued: t.avoirIssued, issuedCount: t.avoirIssuedN, used: t.avoirUsed, usedCount: t.avoirUsedN },
      acomptes: { received: t.acompteReceived, outstanding: t.outstanding },
      countedCash: counted,
    };
  }
  /* La journée commerciale EN COURS, comme closeRegister() côté restaurant.
     Une boutique de souk ouverte jusqu'après minuit reste sur UNE journée grâce
     à la coupure de 05:00 (businessDay), pas grâce à la date d'ouverture. Un
     poste resté ouvert depuis la veille classait les ventes du jour (salesToday)
     sous la date d'ouverture, où le calcul n'en gardait aucune : la veille était
     réécrite à 0 et le jour qui vendait n'avait pas de rapport. */
  function bqBuildReport(counted, closedAt) {
    const DR = window.KiwiDayReport;
    if (!DR) return null;
    const sess = bqReportSession(counted);
    if (closedAt) sess.closedAt = closedAt;
    const pv = pvPaired() || {};
    return DR.build({
      day: DR.businessDay(Date.now()),
      sales: bqReportSales(),
      session: sess,
      store: { slug: DR.storeSlug(), name: pv.name || '', location: pv.location || '', type: pv.type || 'boutique' },
      source: 'caisse',
    });
  }
  /* L'instantané provisoire (closed:false) tient le tableau de bord à jour
     pendant le service, sans compter comme une clôture — même contrat que
     saveProvisional() côté restaurant. */
  let bqLastProv = 0;
  /* Le rapprochement des ventes avec le serveur (z-reconciliation.js), que la
     caisse restaurant fait depuis longtemps et que la boutique ne faisait pas :
     les boutiques Santos Store et Maison 121 ont encaissé 224 ventes en deux
     semaines sans qu'aucune ne soit jamais comparée au registre ; la caisse
     maison partage ce code et ce manque. Chaque vente envoyée est décrite comme le
     serveur la range : l'identifiant que postSale() lui donne, l'argent
     réellement reçu (ni l'avoir, ni la livraison encore à encaisser) et le
     moyen de paiement. Une vente réglée sans argent (avoir, livraison en
     compte) n'apporte rien à comparer et reste dehors ; une vente annulée
     part comme marque, pour retirer son identifiant d'un envoi précédent. */
  /* /api/sale garde 40 lignes. Les tickets plus longs perdaient le reste en
     silence : la recette restait entière, mais les lignes ne faisaient plus le
     ticket et les articles du bout n'existaient nulle part. Au-delà de 39, le
     reste part en une seule ligne « N autres articles », au centime près. Elle
     ne porte aucun identifiant d'article : rien n'est rendu au mauvais stock. */
  function bqFoldBasket(lines) {
    if (!Array.isArray(lines) || lines.length <= 40) return lines;
    const rest = lines.slice(39);
    return lines.slice(0, 39).concat([{
      name: rest.length + ' autres articles',
      qty: rest.reduce((n, l) => n + Math.max(0, Number(l && l.qty) || 0), 0),
      total: Math.round(rest.reduce((s, l) => s + Math.round((Number(l && l.total) || 0) * 100), 0)) / 100,
      cat: '', unit: 'piece', kind: 'product',
    }]);
  }
  /* LE PANIER AU CENTIME, ET À LA VALEUR DU TICKET. Deux écarts entre ce que
     la caisse encaissait et ce que ses lignes disaient au serveur. Un : chaque
     ligne était arrondie au dirham (Math.round), donc un caftan à 249,90 partait
     à 250, et le classement des articles comme le rapport par rayon portaient
     des centimes qui n'avaient jamais existé. Deux : la récompense fidélité
     baisse le TICKET, pas une ligne, et les lignes partaient à leur prix d'avant
     la récompense ; vu en production, un ticket encaissé 171,00 portait 190,00
     de lignes, et chaque article semblait avoir rapporté 10 % de plus.
     Ici, chaque ligne part au centime ; quand le ticket vaut moins que ses
     lignes, la baisse se répartit au prorata, le reste en centimes sur les plus
     grosses lignes, si bien que la somme des lignes est exactement le ticket.
     Un ticket inconnu (0, absent) ne touche à rien : mieux vaut des lignes
     pleines que des lignes à zéro. */
  function bqLineTotals(amounts, ticket) {
    const c = (amounts || []).map((x) => Math.max(0, Math.round((+x || 0) * 100)));
    const sum = c.reduce((a, b) => a + b, 0);
    /* Ticket inconnu → lignes telles quelles. Ticket explicitement à 0 (une
       récompense fidélité qui offre tout) → lignes à 0 : elles partaient au
       serveur à leur prix plein sur une vente à 0. */
    if (ticket == null || ticket === '' || !Number.isFinite(+ticket)) return c.map((x) => x / 100);
    const want = Math.max(0, Math.round(+ticket * 100));
    if (want >= sum) return c.map((x) => x / 100);
    if (want === 0) return c.map(() => 0);
    const out = c.map((x) => Math.floor(x * want / sum));
    let rest = want - out.reduce((a, b) => a + b, 0);
    const order = c.map((_, i) => i).sort((a, b) => c[b] - c[a] || a - b);
    for (let k = 0; rest > 0; k = (k + 1) % order.length) { out[order[k]]++; rest--; }
    return out.map((x) => x / 100);
  }
  function bqZJournal(slug) {
    const Live = window.KiwiLive;
    if (!Live || !Live.saleIdFor) return null;
    const out = [];
    SALES.forEach((s) => {
      if (!s || !s.syncId || !isToday(s.at)) return;
      const id = s.serverId ? String(s.serverId) : Live.saleIdFor({ id: s.syncId }, slug);
      if (s.voided) { out.push({ id, origin: true, voided: true }); return; }
      const parts = Array.isArray(s.parts) ? s.parts : [];
      /* La part du dépôt-vente (Maison) n'est pas la recette du commerce :
         postSale() la retire, la comparaison aussi. */
      const received = parts.reduce((sum, p) => sum
        + (p && p.m !== 'avoir' && p.m !== 'livraison' && (+p.amount || 0) > 0 ? +p.amount : 0), 0);
      const cents = Math.round(Math.max(0, received - (+s.consigned || 0)) * 100);
      if (!(cents > 0)) return;
      out.push({ id, origin: true, time: new Date(s.at), amount: cents / 100, method: bqPaymentMethod(parts), kind: 'vente' });
    });
    return out;
  }
  /* Un échec ne bloque jamais la caisse : la vente est déjà au journal et dans
     la file de Live Link. Le rapprochement ne fait que dire si elle est arrivée. */
  function bqZQueue(closed) {
    try {
      const Z = window.KiwiZReconciliation, DR = window.KiwiDayReport;
      if (IS_DEMO || !Z || !DR || !DR.isReal || !DR.isReal()) return Promise.resolve({ ok: false, reason: 'not-real' });
      const slug = DR.storeSlug();
      const journal = bqZJournal(slug);
      if (!slug || !journal) return Promise.resolve({ ok: false, reason: 'unavailable' });
      const day = DR.businessDay(Date.now());
      /* Mêmes bornes que celles du module : une vente comptée ici et écartée
         là ressortirait en « vente sans envoi », une fausse alerte. */
      const bounds = DR.dayBounds(day, slug);
      const sent = journal.filter((e) => !e.voided && +e.time >= bounds.from && +e.time < bounds.to);
      const CS = window.KiwiCashSessions;
      const report = {
        store: { slug }, day, cutoff: DR.cutoff(slug),
        terminalId: (CS && CS.terminalId && CS.terminalId()) || 'boutique',
        txns: sent.length, net: sent.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100,
      };
      return Promise.resolve(closed ? Z.queueClose(report, journal) : Z.queueSnapshot(report, journal))
        .catch(() => ({ ok: false, reason: 'queue-failed' }));
    } catch (_) { return Promise.resolve({ ok: false, reason: 'queue-failed' }); }
  }
  function bqSaveProvisional(force) {
    if (IS_DEMO || !window.KiwiDayReport || !bqShift) return;
    bqAnnounceOpen();
    bqZQueue(false);
    if (!force && Date.now() - bqLastProv < 90000) return;
    bqLastProv = Date.now();
    try {
      const r = bqBuildReport(null, 0);
      if (!r) return;
      r.closed = false;
      window.KiwiDayReport.save(r, { reopen: false, note: 'en cours', by: bqShift.openedBy });
    } catch (_) {}
  }

  function bqPrintReport(report, copyLabel) {
    if (!window.KiwiPrinter || !window.KiwiPrinter.printDayReport) {
      toast('Imprimante indisponible'); return Promise.resolve({ ok: false });
    }
    const DR = window.KiwiDayReport;
    const V = DR ? DR.vocab() : { items: 'articles', item: 'article', cat: 'rayon' };
    const hm = (ms) => { if (!ms) return ''; const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
    const p = String(report.day || '').split('-');
    const pv = pvPaired() || {};
    return window.KiwiPrinter.printDayReport({
      report: report,
      shop: pv.name || 'Kiwi',
      address: pv.location || '',
      title: 'RAPPORT JOURNALIER',
      dateLabel: p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : report.day,
      copy: copyLabel || '',
      openedLabel: hm(report.openedAt),
      closedLabel: hm(report.closedAt || Date.now()),
      detailTitle: 'DÉTAIL PAR ' + String(V.cat || 'rayon').toUpperCase(),
      drawerTitle: 'TIROIR-CAISSE',
      netLabel: 'NET DU JOUR',
      unitWord: V.items || 'articles',
      unitWordOne: V.item || '',
      notCounted: 'non compté',
      handoverWord: 'Passation',
      reopenWord: 'Clôture n°',
      methodLabels: { cash: 'Espèces', card: 'Carte', transfer: 'Virement / Versement', cheque: 'Chèque', wallet: 'Wallet', tap: 'Kiwi Tap', qr: 'QR', delivery: 'Livraison · à recevoir' },
      fmt: (n) => fmtMAD(n).replace(/\s*MAD\s*$/, ''),
    }).then((res) => {
      if (res && res.ok) toast(res.via === 'pdf' ? 'Rapport prêt · imprimer ou partager le PDF' : res.via === 'browser' ? 'Rapport ouvert dans l\'impression système' : 'Rapport imprimé');
      else toast('Impression impossible · le rapport reste dans le tableau de bord');
      return res || { ok: false };
    }, () => { toast('Impression impossible · le rapport reste dans le tableau de bord'); return { ok: false }; });
  }

  /* ── l'écran d'ouverture (fond de caisse) ──
     Même dessin que le clock-in restaurant, mêmes classes ; seul le conteneur
     porte .mz-clockin, que pos-boutique.css ré-affiche par-dessus le masquage
     body.is-pos. Le fond retenu est mémorisé PAR ÉTABLISSEMENT, sous la même
     clé que la caisse restaurant : un appareil qui sert deux commerces retient
     deux montants. */
  function bqFloatMemKey() {
    try { const p = pvPaired(); if (p && p.merchant) return 'kiwi:openingFloat:v1:' + p.merchant; } catch (_) {}
    return 'kiwi:openingFloat:v1:boutique';
  }
  let bqFloat = 0;
  function bqMaybeOpenScreen() {
    if (IS_DEMO || bqShift) return;
    bqShowOpenScreen();
  }
  function bqShowOpenScreen() {
    if (document.getElementById('mz-clockin')) return;
    const pv = pvPaired() || {};
    const who = ((STAFF.caissiere && STAFF.caissiere.name) || '').trim().split(/\s+/)[0] || 'Caissier';
    const role = (STAFF.caissiere && STAFF.caissiere.role) || 'Caissier';
    const DDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const DMONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const el = document.createElement('div');
    el.className = 'clockin-screen mz-clockin';
    el.id = 'mz-clockin';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="clockin-top">
        <div class="clockin-brand" aria-label="Kiwi"><img src="assets/kiwi-newlogo-inverse.svg" alt="" draggable="false"></div>
        <div class="clockin-tagline">version commerçant</div>
      </div>
      <div class="clockin-mid">
        <div class="clockin-greet">Bonjour <em>${esc(who)}</em></div>
        <div class="clockin-role">${esc(role)} · ${esc(pv.name || 'Boutique')}</div>
        <div class="clockin-clock" id="bqci-time">--:--</div>
        <div class="clockin-date" id="bqci-date"></div>
        <div class="clockin-float">
          <span class="clockin-float-label">Fond d'ouverture</span>
          <div class="clockin-float-chips" id="bqci-chips">
            <button class="ci-float-chip" data-float="300">300 MAD</button>
            <button class="ci-float-chip" data-float="500">500 MAD</button>
            <button class="ci-float-chip" data-float="1000">1 000 MAD</button>
            <button class="ci-float-chip" data-float="custom" aria-expanded="false" aria-controls="bqci-custom">Autre</button>
          </div>
          <div class="clockin-float-custom" id="bqci-custom" hidden>
            <input id="bqci-input" class="ci-float-input" type="number"
                   inputmode="decimal" min="0" step="any" placeholder="0"
                   aria-label="Fond d'ouverture, montant libre en dirhams">
            <span class="ci-float-cur" aria-hidden="true">MAD</span>
          </div>
          <!-- Rien n'est présélectionné : le fond est ce que le caissier a COMPTÉ.
               Le dernier fond n'est qu'un raccourci à toucher. -->
          <button type="button" class="ci-float-last" id="bqci-last" hidden></button>
          <div class="ci-float-err" id="bqci-hint" role="status">Comptez le tiroir et indiquez le fond d'ouverture avant d'ouvrir la caisse.</div>
        </div>
      </div>
      <div class="clockin-bottom">
        <button class="clockin-btn" id="bqci-btn" disabled aria-describedby="bqci-hint">
          <i data-lucide="unlock" class="clockin-btn-ic"></i>
          <span class="clockin-btn-label">Ouvrir la caisse</span>
          <span class="clockin-btn-check" aria-hidden="true"><i data-lucide="check"></i></span>
        </button>
        <div class="clockin-foot">${esc(pv.location || '')}</div>
      </div>`;
    document.body.appendChild(el);

    const chips  = el.querySelector('#bqci-chips');
    const custom = el.querySelector('#bqci-custom');
    const input  = el.querySelector('#bqci-input');
    const mark = (chip) => el.querySelectorAll('.ci-float-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    const showCustom = (on, focus) => {
      custom.hidden = !on;
      const b = chips.querySelector('[data-float="custom"]');
      if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on && focus) { input.focus(); input.select(); }
    };
    const remember = () => { try { localStorage.setItem(bqFloatMemKey(), String(bqFloat)); } catch (_) {} };
    /* Le bouton ne s'enfonce qu'une fois le fond indiqué : jamais de 500
       présélectionné qu'un seul toucher enregistrerait tel quel. */
    let chosen = false;
    const btnOpen = el.querySelector('#bqci-btn');
    const hint = el.querySelector('#bqci-hint');
    const last = el.querySelector('#bqci-last');
    const gate = () => { if (btnOpen) btnOpen.disabled = !chosen; if (hint) hint.hidden = chosen; };

    /* Restitution du dernier fond utilisé par CE magasin. */
    let saved = NaN;
    try { saved = parseFloat(localStorage.getItem(bqFloatMemKey())); } catch (_) {}
    bqFloat = 0;
    if (Number.isFinite(saved) && saved >= 0 && last) {
      last.textContent = 'Dernier fond : ' + saved + ' MAD';
      last.dataset.value = String(saved);
      last.hidden = false;
      last.addEventListener('click', () => {
        const v = parseFloat(last.dataset.value);
        if (!Number.isFinite(v) || v < 0) return;
        bqFloat = v; chosen = true; gate();
        const preset = chips.querySelector(`[data-float="${v}"]`);
        if (preset) { mark(preset); showCustom(false); return; }
        mark(chips.querySelector('[data-float="custom"]')); input.value = String(v); showCustom(true, false);
      });
    }
    gate();

    chips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-float]');
      if (!chip) return;
      mark(chip);
      if (chip.dataset.float === 'custom') {
        showCustom(true, true);
        const v = parseFloat(input.value);
        bqFloat = Number.isFinite(v) && v > 0 ? v : 0;
        chosen = input.value !== ''; gate();
        return;
      }
      showCustom(false);
      bqFloat = parseInt(chip.dataset.float, 10) || 0;
      chosen = true; gate();
      remember();
    });
    input.addEventListener('input', () => {
      if (input.value && parseFloat(input.value) < 0) input.value = input.value.replace('-', '');
      const v = parseFloat(input.value);
      bqFloat = Number.isFinite(v) && v > 0 ? v : 0;
      chosen = input.value !== ''; gate();
      if (chosen) remember();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    const tick = () => {
      const n = new Date();
      const tEl = el.querySelector('#bqci-time'), dEl = el.querySelector('#bqci-date');
      if (tEl) tEl.textContent = pad2(n.getHours()) + ':' + pad2(n.getMinutes());
      if (dEl) dEl.textContent = DDAYS[n.getDay()] + ' ' + n.getDate() + ' ' + DMONTHS[n.getMonth()];
    };
    tick();
    const timer = setInterval(tick, 10000);

    el.querySelector('#bqci-btn').addEventListener('click', () => {
      if (!chosen) { gate(); return; }
      el.querySelector('#bqci-btn').classList.add('is-confirmed');
      icons();
      const openedAt = Date.now();
      bqShift = { openedAt, openedBy: (STAFF.caissiere && STAFF.caissiere.name) || '', float: bqFloat, sid: 'bq-' + openedAt, openSent: false };
      bqShiftPersist();
      /* Le fond d'ouverture est le premier chiffre du rapprochement. */
      bqAnnounceOpen();
      bqSaveProvisional(true);
      setTimeout(() => el.classList.add('is-leaving'), 420);
      setTimeout(() => { clearInterval(timer); el.remove(); }, 940);
    });

    requestAnimationFrame(() => { el.classList.add('is-visible'); el.setAttribute('aria-hidden', 'false'); icons(); });
  }

  /* ── la clôture ── */
  let bqCloVeil = null, bqCloExpected = 0, bqClosedReport = null;
  function bqFmtDur(min) {
    if (min < 60) return `${min} mn`;
    return `${Math.floor(min / 60)}h${pad2(min % 60)}`;
  }
  function bqUpdateEcart() {
    const v = bqCloVeil; if (!v) return;
    const line = v.querySelector('#bqclo-ecart-line'), out = v.querySelector('#bqclo-ecart'), inp = v.querySelector('#bqclo-count');
    if (!line || !out) return;
    line.classList.remove('is-ok', 'is-off');
    const raw = inp ? inp.value : '';
    if (raw === '' || raw == null) { out.textContent = '·'; return; }
    const ecart = (parseFloat(raw) || 0) - bqCloExpected;
    out.textContent = (ecart > 0 ? '+ ' : (ecart < 0 ? '− ' : '')) + fmtMAD(Math.abs(ecart));
    line.classList.add(Math.abs(ecart) <= 5 ? 'is-ok' : 'is-off');
  }
  let bqOutstandingCents = 0;
  async function bqOpenCloture() {
    if (window.KiwiRetailBalances) {
      const open = await window.KiwiRetailBalances.list(merchantSlug());
      bqOutstandingCents = open.reduce((sum, row) => sum + window.KiwiRetailBalances.due(row), 0);
    }
    if (!bqCloVeil) {
      bqCloVeil = document.createElement('div');
      bqCloVeil.className = 'cloture-veil';
      bqCloVeil.id = 'mz-cloture';
      bqCloVeil.setAttribute('role', 'dialog');
      bqCloVeil.setAttribute('aria-modal', 'true');
      document.body.appendChild(bqCloVeil);
    }
    const v = bqCloVeil;
    const now = new Date();
    const openedAt = bqShift ? new Date(bqShift.openedAt) : now;
    const durMin = Math.max(0, Math.floor((now - openedAt) / 60000));
    const t = bqDayTotals();
    const pv = pvPaired() || {};
    const DR = window.KiwiDayReport;
    const V = DR ? DR.vocab() : { items: 'articles', cats: 'rayons', cat: 'rayon' };

    const rows = [
      ['Service ouvert à', fmtHM(openedAt), false, ''],
      ['Durée du service', bqFmtDur(durMin), false, ''],
      ['Transactions', String(t.txns), false, ''],
      ['Articles vendus', String(t.items), false, ''],
      ['Total encaissé', fmtMAD(t.moneyIn), true, 'total'],
      ['dont Carte', fmtMAD(t.card), true, 'sub'],
      ['dont Espèces', fmtMAD(t.cash), true, 'sub'],
    ];
    if (t.other > 0) rows.push(['dont Autres', fmtMAD(t.other), true, 'sub']);
    if (t.transfer > 0) rows.push(['dont Virement / Versement', fmtMAD(t.transfer), true, 'sub']);
    if (t.cheque > 0) rows.push(['dont Chèque', fmtMAD(t.cheque), true, 'sub']);
    if (t.acompteReceived > 0) rows.push(['Acomptes reçus', fmtMAD(t.acompteReceived), true, '']);
    if (t.outstanding > 0) rows.push(['Soldes restant à régler', fmtMAD(t.outstanding), true, '']);
    /* HORS du bloc « dont » : une livraison n'est pas encaissée, elle est à
       recevoir. Nichée en sous-ligne du total, elle se lisait comme une de ses
       composantes — alors qu'aucun dirham correspondant n'est dans le tiroir. */
    if (t.delivery > 0) rows.push(['Livraisons · à recevoir', fmtMAD(t.delivery), true, '']);
    if (t.paidTxns > 0) rows.push(['Ticket moyen', fmtMAD(t.moneyIn / t.paidTxns), true, '']);
    if (t.promoOff > 0) rows.push(['Promotions du magasin', fmtMAD(t.promoOff), true, '']);
    rows.push(['Réductions accordées', fmtMAD(t.discounts), true, '']);
    if (t.avoirIssued > 0) rows.push(['Avoirs émis', fmtMAD(t.avoirIssued), true, '']);
    /* Réglé en avoir : la contrepartie du « Total encaissé ». Ces tickets ont
       vidé des rayons sans faire sonner le tiroir — les compter nulle part
       revenait à imprimer un Z où la marchandise partie ne figure pas. */
    if (t.avoirUsed > 0) rows.push([`Réglé en avoir (${t.avoirUsedN})`, fmtMAD(t.avoirUsed), true, '']);

    /* Tiroir : fond + espèces. La boutique n'a ni pourboires ni mouvements de
       caisse — les lignes qui n'existent pas ne s'affichent pas. */
    bqCloExpected = (bqShift ? bqShift.float : 0) + t.cash;
    const dLines = [
      ["Fond d'ouverture", fmtMAD(bqShift ? bqShift.float : 0), ''],
      ['Espèces encaissées', '+ ' + fmtMAD(t.cash), ''],
      ['Attendu en caisse', fmtMAD(bqCloExpected), 'is-total'],
    ];

    const nCats = (() => {
      const seen = {};
      /* Une ligne intégralement reprise n'a rien vendu : compter son rayon
         faisait dire « 3 rayons » à une clôture où deux seulement ont laissé de
         la marchandise chez le client — la phrase contredisait le nombre de
         pièces affiché juste à côté, qui, lui, est net des retours. */
      salesToday().forEach((s) => (s.lines || []).forEach((ln) => {
        if (lineAvailableQty(ln) <= 0) return;
        const r = rayonOf(ln.pid); if (r) seen[r] = 1;
      }));
      return Object.keys(seen).length;
    })();
    const hlText = t.txns
      ? `<em>${t.items}</em> ${V.items} vendus sur ${t.txns} ticket${t.txns > 1 ? 's' : ''}${nCats ? `, ${nCats} ${nCats > 1 ? V.cats : V.cat}` : ''}.`
      : 'Aucune vente sur ce service.';

    v.innerHTML = `
      <div class="cloture-card">
        <div class="clo-eyebrow">Fin de service</div>
        <div class="clo-title">Clôture de caisse</div>
        <div class="clo-meta">${esc(pv.name || 'Boutique')} · ${esc((STAFF.caissiere && STAFF.caissiere.name) || '')} · ${fmtDay(now)}</div>
        <div class="clo-rows">${rows.map((r, i) => {
          const cls = 'clo-row' + (r[3] === 'total' ? ' is-total' : (r[3] === 'sub' ? ' is-sub' : ''));
          const vCls = 'clo-row-value' + (r[2] ? ' mono' : '');
          return `<div class="${cls}" style="animation-delay:${i * 70}ms"><span class="clo-row-label">${r[0]}</span><span class="${vCls}">${r[1]}</span></div>`;
        }).join('')}</div>
        <div class="clo-drawer-box">
          <div class="clo-drawer-title">Tiroir-caisse</div>
          ${dLines.map((l) => `<div class="clo-drawer-line ${l[2]}"><span>${l[0]}</span><span class="mono">${l[1]}</span></div>`).join('')}
          <div class="clo-count-row">
            <label for="bqclo-count">Espèces comptées</label>
            <input class="clo-count-input" id="bqclo-count" type="number" inputmode="numeric" min="0" step="10" placeholder="·" />
          </div>
          <div class="clo-ecart-line" id="bqclo-ecart-line">
            <span>Écart</span><span class="mono" id="bqclo-ecart">·</span>
          </div>
        </div>
        <div class="clo-highlight">
          <div class="clo-highlight-icon"><i data-lucide="shopping-bag"></i></div>
          <div class="clo-highlight-text">${hlText}</div>
        </div>
        <div class="clo-actions">
          <button class="clo-btn secondary" id="bqclo-print"><i data-lucide="printer"></i><span>Imprimer le rapport Z</span></button>
          <button class="clo-btn primary" id="bqclo-close"><i data-lucide="lock"></i><span>Fermer la caisse</span></button>
        </div>
        <div class="clo-foot"><button id="bqclo-continue">Continuer le service</button></div>
      </div>`;
    v.classList.add('is-open');
    icons();

    v.querySelector('#bqclo-count').addEventListener('input', bqUpdateEcart);
    v.querySelector('#bqclo-continue').onclick = () => v.classList.remove('is-open');
    /* Imprimer AVANT de fermer — un tirage avec le comptage saisi à l'instant,
       aucune écriture (même contrat que #clo-print côté restaurant). */
    v.querySelector('#bqclo-print').onclick = () => {
      const raw = v.querySelector('#bqclo-count').value;
      const r = bqBuildReport(raw === '' || raw == null ? null : parseFloat(raw), 0);
      if (!r) { toast('Rapport indisponible'); return; }
      bqPrintReport(r, 'AVANT CLÔTURE');
    };
    v.querySelector('#bqclo-close').onclick = bqCloseRegister;
  }

  /* L'ORDRE COMPTE (cf. closeRegister() restaurant) : le rapport s'écrit AVANT
     d'effacer le poste et avant le rechargement. Les ventes ne sont jamais
     touchées — une clôture produit un document, elle ne modifie pas le registre. */
  function bqCloseRegister() {
    const v = bqCloVeil;
    const raw = v ? v.querySelector('#bqclo-count').value : '';
    const counted = (raw === '' || raw == null) ? null : parseFloat(raw);
    if (v) v.classList.remove('is-open');
    let report = null, reportSaved = false;
    try {
      report = bqBuildReport(counted, Date.now());
      if (report && window.KiwiDayReport) {
        report.closed = true;
        const saved = window.KiwiDayReport.save(report, { by: (STAFF.caissiere && STAFF.caissiere.name) || '' });
        const persisted = window.KiwiDayReport.load(report.day, report.store?.slug);
        reportSaved = !!saved && (!window.KiwiDayReport.isReal() ||
          (persisted?.closedAt === report.closedAt && persisted?.sessionId === report.sessionId));
        /* La page se recharge dans un instant : sans flush(), la remontée
           serveur débattue partirait après la mort de l'onglet — jamais. */
        window.KiwiDayReport.flush();
      }
    } catch (_) {}
    if (!report || !reportSaved) {
      if (v) v.classList.add('is-open');
      toast('Clôture non enregistrée · poste conservé. Vérifiez le stockage puis réessayez.');
      return;
    }
    /* Émis AVANT d'effacer le poste : l'événement porte openedAt et sessionId,
       qui n'existent plus une fois bqShift remis à zéro. Un comptage laissé
       vide reste un poste fermé — on annonce alors l'attendu comme compté, et
       l'écart nul, plutôt que de ne rien dire du tout au rapprochement. */
    const countedCash = counted == null ? bqCloExpected : counted;
    bqCashEvent('close', {
      expectedCents: bqCents(bqCloExpected),
      countedCents: bqCents(countedCash),
      gapCents: bqCents(countedCash) - bqCents(bqCloExpected),
    });
    bqZQueue(true);
    bqShift = null;
    bqShiftPersist();
    if (report) bqShowPostClose(report); else bqFinishClose();
  }
  function bqFinishClose() {
    const z = document.getElementById('mz-zsheet');
    if (z) z.classList.remove('is-open');
    toast('Caisse fermée · à bientôt');
    setTimeout(() => location.reload(), 640);
  }
  /* L'écran d'après-clôture : une décision, la trace papier. */
  function bqShowPostClose(report) {
    bqClosedReport = report;
    const DR = window.KiwiDayReport;
    const V = DR ? DR.vocab() : { items: 'articles', cats: 'rayons', cat: 'rayon' };
    const nCat = (report.categories || []).length;
    const nItems = (report.categories || []).reduce((s, c) => s + (c.qty || 0), 0);
    const bits = [`${report.txns} transaction${report.txns > 1 ? 's' : ''}`];
    if (nCat) bits.push(`${nItems} ${V.items} · ${nCat} ${nCat > 1 ? V.cats : V.cat}`);
    if (report.cash && report.cash.ecart != null && Math.abs(report.cash.ecart) > 0.5) {
      bits.push(`écart ${(report.cash.ecart > 0 ? '+ ' : '− ')}${fmtMAD(Math.abs(report.cash.ecart))}`);
    }
    const z = document.createElement('div');
    z.className = 'cloture-veil is-open';
    z.id = 'mz-zsheet';
    z.setAttribute('role', 'dialog');
    z.setAttribute('aria-modal', 'true');
    z.innerHTML = `
      <div class="cloture-card zs-card">
        <div class="clo-eyebrow">Journée clôturée</div>
        <div class="clo-title">Rapport journalier</div>
        <div class="zs-total mono">${fmtMAD(report.net)}</div>
        <div class="clo-meta">${bits.join(' · ')}</div>
        <div class="clo-actions">
          <button class="clo-btn primary" id="bqzs-print"><i data-lucide="printer"></i><span>Imprimer le rapport</span></button>
          <button class="clo-btn secondary" id="bqzs-reprint" hidden><i data-lucide="copy"></i><span>Réimprimer</span></button>
        </div>
        <div class="clo-foot"><button id="bqzs-skip">Continuer sans imprimer</button></div>
        <div class="zs-note">Le rapport reste disponible dans le tableau de bord, section Rapport journalier · même après un rechargement ou depuis un autre appareil.</div>
      </div>`;
    document.body.appendChild(z);
    icons();
    const print = z.querySelector('#bqzs-print'), reprint = z.querySelector('#bqzs-reprint');
    const doPrint = (btn) => {
      if (!bqClosedReport) return bqFinishClose();
      btn.disabled = true;
      bqPrintReport(bqClosedReport, btn === reprint ? 'DUPLICATA' : '').then((res) => {
        btn.disabled = false;
        if (res?.ok && reprint) { reprint.hidden = false; icons(); }
      });
    };
    print.onclick = () => doPrint(print);
    reprint.onclick = () => doPrint(reprint);
    z.querySelector('#bqzs-skip').onclick = bqFinishClose;
  }

  /* La boutique n'encaisse pas dans le journal partagé (KiwiPosSale) : elle
     tient SALES, qui couvre la semaine et porte le ticket figé de chaque vente.
     Elle s'annonce donc au bouton « Réimprimer », qui sinon lirait un journal
     vide et conclurait qu'aucune vente n'a été prise de la journée.
     Traduit vers la forme commune du journal, et `rc` suit : c'est lui qui fait
     ressortir le VRAI ticket remis plutôt qu'une recomposition. */
  try {
    if (window.KiwiPosReprint) {
      /* Le prix vient de la LIGNE (ln.unit, figé à l'encaissement), jamais du
         catalogue actuel : lineUnit() lit P[ln.pid].price et lève sur un article
         supprimé depuis — le cas qui avait déjà vidé la page des échanges — et
         relirait de toute façon un prix qui a pu changer depuis la vente. */
      const lineName = (ln) => ((P[ln.pid] && P[ln.pid].name) || 'Article') + (ln.size ? ' ' + ln.size : '');
      /* TOUTE la fenêtre du journal, pas seulement aujourd'hui. salesToday()
         est fait pour l'ARGENT — la recette du jour ne doit jamais sommer une
         semaine — et la réimpression n'est pas de l'argent : c'est du papier.
         Une cliente qui revient le lendemain sans son ticket ne trouvait donc
         personne pour le lui ressortir, alors que l'écran des échanges affichait
         sa vente juste à côté et que `rc` en garde le document exact.
         C'est pos-reprint.js qui tranche ensuite : au-delà du jour, il n'accepte
         que les ventes portant ce ticket figé. Lui passer la fenêtre entière
         évite de refaire ici un filtre qui vit là-bas. */
      const salesWeek = () => SALES.filter((s) => s && !s.voided && withinRetention(s.at));
      /* Ticket #0026 · registered under our own vertical id: the dispatcher
       * mounts with id='maison', so 'boutique' here starved our journal AND
       * clobbered the boutique provider on last-mounted-wins. */
      window.KiwiPosReprint.provide('maison', () => salesWeek().map((s) => {
        const lines = (s.lines || []).map((ln) => ({
          name: lineName(ln),
          qty: ln.qty,
          total: Math.round((+ln.unit || 0) * ln.qty * 100) / 100,
        }));
        const pieces = lines.reduce((n, l) => n + l.qty, 0);
        const head = lines[0];
        return {
          ts: (s.at instanceof Date ? s.at : new Date(s.at)).getTime(),
          total: s.total,
          ref: s.id,
          label: !head ? 'Vente'
            : (lines.length > 1 ? head.name + ' +' + (pieces - head.qty) + ' art.' : head.name),
          raw: s.methods,
          rc: s.rc || null,
          lines: lines,
        };
      }));
    }
  } catch (_) {}

  window.KiwiPosDispatch.register({
    id: 'maison',
    greet: {
      line1: 'Bonjour,',
      em: 'bienvenue.',
      sub: 'Vogue Home <em>·</em> art de table & décoration',
    },
    mount,
    onShow,
  });

export { AVOIRS, BY_EAN, CL, CLIENTES, IS_DEMO, P, RAYONS, RETAIN_DAYS, SALES, STAFF, _bqKey, activeAvoirs, assignTicketNumber, avoirExpired, bqMoney, bqPaymentMethod, bqPaymentParts, bqPost, bqSaveProvisional, businessDateKey, checkout, closeVeil, creditErrorDetail, creditFromServer, creditIntent, creditRequest, depotOn, ensureOriginalSale, ensureStockJournal, findSale, firstFree, firstName, freshTicket, headSubVente, initials, isConsignedProduct, isOfflineRef, issueAvoir, lineDeal, linePromo, lineUnit, merchantSlug, newSaleId, nextStandaloneTicketNumber, openVeil, originalSalePayload, payExistingBalance, persistAvoirs, persistDay, persistStock, pieceUnitPrice, promoFor, promoForLine, pruneTicket, pvPaired, pvReal, queueIfOffline, rebuildCatalog, recordReturn, refreshOps, refreshRemoteAvoirs, renderAll, renderBadges, root, saleClient, salesToday, shiftDateKey, sizeWord, sizesOf, stableCreditIssueId, stableRefundId, state, stockAdd, stockOf, switchView, ticketClient, ticketCount, ticketTotals, toast, whenLabel };
