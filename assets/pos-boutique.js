import { $, colorLabel, isDemoStore, shelf, MIN, clById, fmtMAD, rayonOf, fmtHM, DAYS, icons, renderTicket, camSupported, $$, commitEan, openCamScan, wireSellSearch, renderCats, renderClientes, renderGrid, renderExchNote, renderScan, fmtDT, esc, useKiwiCl, pad2, fmtDay } from './pos-boutique/sales.js?v=62';
import { lineAvailableQty, lineReturnedQty, renderEchanges, renderNet, toggleOffline, syncNetworkState, injectInvCss, installWedgeScanner, renderAcomptes, openPay } from './pos-boutique/checkout.js?v=62';
import { intake, renderInventaire } from './pos-boutique/inventory.js?v=62';
import { ticketOwner } from './pos-boutique/ticket-owner.js?v=2';
import { bqKitRail, bqKitRailPaint, bqKitOpenSheet } from './pos-boutique/kit-2027.js?v=13';

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
  function bqMoney(v, signed = false) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    if (!Number.isFinite(n) || (!signed && n <= 0)) return 0;
    return Math.sign(n) * Math.round(Number(Math.abs(n).toExponential().replace(/e(.+)$/, (_, e) => 'e' + (+e + 2)))) / 100;
  }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  // Product sheet and promotion composer are siblings of mount(), not children.
  // Keep the selected catalogue/policy identity in their shared closure.
  let _bqKey = null;

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
  const stockAdd  = (pid, size, d) => {
    const p = P[pid];
    if (!p || !p.sizes) return false;
    p.sizes[size] = Math.max(0, (p.sizes[size] || 0) + d);
    return true;
  };
  const canonicalPid = (pid) => (P[pid] && P[pid].id) || pid;
  function colorKey(pid, color) {
    const cat = window.KiwiBoutiqueCatalog;
    const p = P[pid];
    const exact = p && (p._variants || []).find((v) => String(v.colorId) === String(color));
    return String(exact && cat && cat.colorFamily ? cat.colorFamily(exact) : color);
  }
  function variantStock(pid, size, color) {
    const cat = window.KiwiBoutiqueCatalog;
    const id = canonicalPid(pid);
    if (cat && cat.variantStock) return cat.variantStock(id, size, color);
    const p = P[pid];
    const vs = (p && p._variants) || [];
    return vs.reduce((sum, v) => {
      const family = cat && cat.colorFamily ? cat.colorFamily(v) : v.colorId;
      return String(v.size) === String(size) && (String(v.colorId) === String(color) || String(family) === String(color))
        ? sum + Math.max(0, +v.stock || 0) : sum;
    }, 0);
  }
  function ticketHeld(pid, size, color, ticket) {
    const id = canonicalPid(pid);
    const wantedColor = colorKey(pid, color);
    const lines = ticket && ticket.lines ? ticket.lines : [];
    return lines.reduce((sum, ln) => canonicalPid(ln.pid) === id
      && String(ln.size) === String(size) && colorKey(ln.pid, ln.color) === wantedColor
      ? sum + (+ln.qty || 0) : sum, 0);
  }
  function availableStock(pid, size, color, ticket) {
    return Math.max(0, variantStock(pid, size, color) - ticketHeld(pid, size, color, ticket || state.ticket));
  }
  function firstFreeFor(p, color, ticket) {
    return sizesOf(p).find((size) => availableStock(p.id, size, color, ticket) > 0) || null;
  }
  function ticketStockIssue(ticket) {
    const seen = new Set();
    for (const ln of ticket.lines || []) {
      const id = canonicalPid(ln.pid);
      const color = colorKey(ln.pid, ln.color);
      const key = JSON.stringify([id, String(ln.size), color]);
      if (seen.has(key)) continue;
      seen.add(key);
      const needed = ticketHeld(id, ln.size, color, ticket);
      const onHand = variantStock(id, ln.size, color);
      if (needed > onHand) return { pid: ln.pid, size: ln.size, color, needed, onHand };
    }
    return null;
  }
  function showStockIssue(issue) {
    const p = P[issue.pid];
    const label = p ? p.name : 'Article';
    toast(`${label} · ${colorLabel(issue.color)} · ${issue.size}, stock insuffisant`,
      `${issue.onHand} disponible${issue.onHand > 1 ? 's' : ''}, ${issue.needed} sur le ticket. Retirez la quantité manquante.`);
  }
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
     laquelle bouge : l'identifiant exact s'il correspond, puis les autres tons
     de cette famille. Une SORTIE ne doit jamais emprunter le stock d'une autre
     couleur. Un retour sans couleur appariable remonte maintenant comme stock à
     rapprocher au lieu de créditer silencieusement une autre couleur. */
  function persistStock(pid, size, color, delta, ref, why) {
    if (!delta || !pvReal()) return true;
    try {
      // Retail stock and its durable movement line are one operation. Without
      // this bridge the catalogue changed but the owner's movement book stayed
      // empty, making a returned item impossible to audit by ticket.
      window.KiwiMaisonStock?.enable('boutique');
      const cat = window.KiwiBoutiqueCatalog;
      if (!cat || !cat.adjustVariantStock) return false;
      const id = canonicalPid(pid);
      return cat.adjustVariantStock(id, size, colorKey(pid, color), delta, {
        ref: ref || '', why: why || (delta < 0 ? 'vente' : 'retour'),
        actor: STAFF && STAFF.caissiere ? STAFF.caissiere.name : '',
      });
    } catch (_) { return false; }
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
        persistStock(ln.pid, ln.size, ln.color, sign * remaining);
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
      const today = $('#bq-today', root);
      if (today) today.textContent = headSubVente();
    } else if (touched) {
      persistDay();
    }
    return touched;
  }

  const sizeWord  = (p) => p.kind === 'pointure' ? 'Pointure' : p.kind === 'tu' ? 'Taille unique' : 'Taille';
  const firstFree = (p) => sizesOf(p).find((k) => p.sizes[k] > 0) || null;

  /* ───────────────────────── équipe & clientes (Casa · Maarif) ───────────── */
  /* A REAL boutique never inherits Maison Mansour's staff — the roster is
     neutralized (« Vendeur N », blank role) while keeping the same shape/length.
     Local demo (pvReal() false) keeps the named cast, byte-identical. */
  const STAFF = pvReal() ? {
    gerante:   { name: 'Vendeur 1', role: '' },
    conseil:   { name: 'Vendeur 2', role: '' },
    caissiere: { name: 'Vendeur 3', role: '' },
  } : {
    gerante:   { name: 'Aicha Benali', role: 'Gérante boutique' },
    conseil:   { name: 'Rania Tazi',   role: 'Conseillère de vente' },
    caissiere: { name: 'Salma',        role: 'Caisse' },
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
    { id: 'c1', name: 'Lalla Khadija El Fassi', phone: '0661 42 18 30', points: 1240, taille: 'M',  achats: 9,  spent: 18400, vip: true,
      prefs: ['Caftans brodés main, jamais de machine', 'Retouches chez Maalem Hassan'],
      history: [{ when: '24 mai', what: 'Caftan Velours · M · bordeaux', amt: 1850 }, { when: '12 avr.', what: 'Takchita Zellige · M · émeraude', amt: 2800 }, { when: '2 mars', what: 'Mdamma dorée', amt: 650 }] },
    { id: 'c2', name: 'Salma Bennis', phone: '0664 77 02 19', points: 480, taille: 'S', achats: 4, spent: 3160,
      prefs: ['Pointure 39, le 38 taille petit'],
      history: [{ when: '10 juin', what: 'Cherbil perlé · 37 · argent (retour avoir)', amt: 450 }, { when: '18 mai', what: 'Caftan Coton Été · S · safran', amt: 1200 }] },
    { id: 'c3', name: 'Yasmina Alaoui', phone: '0667 31 55 08', points: 2130, taille: 'L', achats: 14, spent: 31200, vip: true,
      prefs: ['Takchitas de cérémonie, appeler dès les nouveautés'],
      history: [{ when: '28 mai', what: 'Takchita Mariage · L · ivoire', amt: 4500 }, { when: '6 mai', what: 'Caftan Signature Mansour · L · doré', amt: 3500 }] },
    { id: 'c4', name: 'Imane Cherkaoui', phone: '0650 09 64 12', points: 310, taille: 'S', achats: 3, spent: 2240,
      prefs: [],
      history: [{ when: '30 mai', what: 'Foulard soie · safran', amt: 240 }] },
    { id: 'c5', name: 'Nadia Berrechid', phone: '0668 23 90 41', points: 95, taille: 'XL', achats: 1, spent: 950,
      prefs: ['Première visite via Instagram'],
      history: [{ when: '3 juin', what: 'Cabas berbère · terracotta', amt: 420 }] },
    { id: 'c6', name: 'Houda Mekouar', phone: '0652 84 17 66', points: 720, taille: 'M', achats: 6, spent: 7050,
      prefs: ['Préfère ivoire et doré', 'Emballage cadeau systématique'],
      history: [{ when: '21 mai', what: 'Caftan Fassi · M · ivoire', amt: 2400 }, { when: '2 mai', what: 'Pochette sequins · dorée', amt: 350 }] },
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
    { code: 'AV-2031', amount: 350, balance: 350, holderId: 'c2', holderName: 'Salma Bennis',
      motif: 'Retour cherbil perlé · 37', at: new Date(NOW - 26 * 3600 * 1000), until: new Date(NOW + 182 * 24 * 3600 * 1000), from: '1188' },
  ] : [];
  let avSeq = 2032;
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
      const keep = AVOIRS.filter((a) => a && (a.balance > 0 || (a.until && new Date(a.until) > new Date())));
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

  /* ══════════ LE REGISTRE DES AVOIRS (/api/store-credits) ══════════════════
   * Un avoir de VRAIE boutique ne vivait que dans le localStorage de la caisse
   * qui l'avait émis : la cliente qui revenait à l'autre caisse, ou après un
   * changement de tablette, présentait un bon que Kiwi ne connaissait plus, et
   * le tableau de bord n'en voyait aucun. La caisse maison passe déjà par le
   * registre serveur ; la boutique y passe aussi, avec les mêmes règles :
   *   · l'avoir est ÉMIS au registre avant que le stock ou la vente bougent
   *     (une connexion perdue laisse le retour intact, jamais une pièce en stock
   *     sans dette inscrite) ;
   *   · il est CONSOMMÉ par une seule écriture serveur, qui refuse un solde
   *     qu'une autre caisse vient d'entamer ;
   *   · un identifiant de requête stable rend une réponse perdue rejouable.
   * La démo reste locale, inchangée. */
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
    } catch (_) { /* les bons en cache restent visibles ; la consommation, elle, échoue fermée au serveur */ }
    return AVOIRS;
  }
  /* Émettre un avoir CRÉE UNE DETTE : c'est un remboursement dont la somme reste
     chez nous. Il demande donc le même accord qu'un remboursement. Le responsable
     frappe son code, le serveur le vérifie (/api/pin/verify) et rend une capacité
     liée à CETTE émission (ticket, montant, identifiant, moyen « avoir ») ;
     /api/store-credits la relit et refuse sans elle. Le code, lui, ne voyage pas. */
  function avoirApproval(amount, requestId, originalSaleId, ticketRef) {
    return new Promise((resolve, reject) => {
      const refuse = (code) => { const error = new Error(code); error.code = code; reject(error); };
      if (typeof window.requireManager !== 'function') { refuse('manager-required'); return; }
      try { if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'refund', key: 'act.refund', args: { amount: fmtMAD(amount) } }); } catch (_) {}
      /* Le responsable lit le numéro imprimé sur le ticket (1000), pas
         l'identifiant interne de la vente (sale-ref-9c08…) qui lie l'accord. */
      window.requireManager(`Avoir ${fmtMAD(amount)} · ticket ${ticketRef || originalSaleId}`,
        (manager) => resolve((manager && manager.approval) || ''),
        { kind: 'refund', refundId: requestId, originalSaleId, amountCents: Math.round(amount * 100), refundMethod: 'avoir' },
        { onCancel: () => refuse('manager-cancelled') });
    });
  }

  function creditIntent(prefix) {
    try { if (crypto && crypto.randomUUID) return `${prefix}:${crypto.randomUUID()}`; } catch (_) {}
    return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
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
  function creditErrorDetail(error) {
    const code = error && error.code;
    if (code === 'sale-credit-exceeds-available') {
      return 'Ce ticket n’est pas encore synchronisé, ou il a déjà été remboursé jusqu’à son montant disponible.';
    }
    if (code === 'manager-cancelled') return 'Autorisation du responsable annulée. Rien n’a été remis en stock.';
    if (code === 'manager-required') return 'L’accord d’un responsable est nécessaire pour émettre un avoir. Rien n’a été remis en stock.';
    return 'Connexion au registre des avoirs impossible. Rien n’a été remis en stock.';
  }
  /* Une vente que la file de Live Link refuse est gardée sur la vente et
     renvoyée plus tard, une seule fois (assets/retail-sale-hold.js). */
  let bqHoldKit = null;
  const bqHold = () => bqHoldKit || (bqHoldKit = window.KiwiRetailSaleHold
    ? window.KiwiRetailSaleHold.create({ sales: () => SALES, persist: () => persistDay(), isDemo: IS_DEMO, slug: () => merchantSlug(),
      onLost: () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Vente NON sauvegardée : stockage de la tablette plein et serveur injoignable. Ne rechargez pas la page, notez le ticket.'), 15000, 'warn') })
    : null);
  function bqReplayHeld() { const h = bqHold(); return h ? h.replay() : 0; }
  function bqPost(sale, payload) {
    const h = bqHold();
    if (h) return h.post(sale, payload);
    try { return window.KiwiLive.postSale(payload); } catch (_) { return null; }
  }

  /* Le ticket d'origine, reconstruit depuis la vente figée de la caisse : le
     registre refuse un avoir qui ne s'adosse pas à une vente qu'il connaît. */
  function originalSalePayload(sale) {
    if (!sale) return null;
    const parts = Array.isArray(sale.parts) ? sale.parts : [];
    const received = parts.filter((part) => part && part.m !== 'avoir' && part.m !== 'livraison' && (+part.amount || 0) > 0);
    const methods = received.map((part) => part.m);
    const method = sale.tenderVersion === 2 ? bqPaymentMethod(parts)
      : (methods.includes('carte') ? 'card' : (methods.includes('espèces') ? 'cash' : 'wallet'));
    const creditIn = parts.reduce((sum, part) => sum + (part && part.m === 'avoir' ? (+part.amount || 0) : 0), 0);
    const delivery = parts.some((part) => part && part.m === 'livraison');
    /* Un ticket à 0 (tout offert) reste à 0 : seul un total absent retombe sur les lignes. */
    const total = Math.max(0, sale.total != null && sale.total !== '' && Number.isFinite(+sale.total) ? +sale.total : (sale.lines || []).reduce((sum, line) => sum + (+line.unit || 0) * (+line.qty || 0), 0));
    const cashIn = Math.max(0, received.reduce((sum, part) => sum + (+part.amount || 0), 0));
    const lineTotals = bqLineTotals((sale.lines || []).map((line) => (+line.unit || 0) * Math.max(1, Number(line.qty) || 1)), Number(sale.balanceTotal) || sale.total);
    const lines = bqFoldBasket((sale.lines || []).map((line, i) => ({
      itemId: line.pid || '', variantId: [line.pid || '', line.size || '', line.color || ''].join(':'),
      name: line.name || (P[line.pid] && P[line.pid].name) || 'Article retiré du catalogue',
      qty: Math.max(1, Number(line.qty) || 1), total: lineTotals[i],
      cat: rayonOf(line.pid) || '', unit: 'piece', kind: 'product',
    })));
    const payload = {
      id: sale.serverId || sale.syncId || sale.id,
      merchant: merchantSlug(), amount: cashIn, amountCents: Math.round(cashIn * 100),
      ticketAmountCents: Math.round(total * 100), consignedAmountCents: 0,
      method, channel: delivery ? 'delivery' : 'counter', label: (lines[0] && lines[0].name) || 'Vente',
      ref: sale.id, ts: +new Date(sale.at || Date.now()), lines,
    };
    if (sale.tenderVersion === 2) payload.paymentParts = bqPaymentParts(parts);
    if (cashIn <= 0 && creditIn > 0 && lines.length) {
      payload.settlementKind = 'store-credit'; payload.creditAmountCents = Math.round(creditIn * 100);
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
  function retDayKey(ts) { const R = window.KiwiDayReport, t = +new Date(ts); try { const k = R && R.businessDay && R.businessDay(t); if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k; } catch (_) {} const x = new Date(t - 5 * 3600000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  function retShiftDay(key, delta) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + delta)).toISOString().slice(0, 10); }
  function isToday(d) {
    const t = +new Date(d);
    return !isNaN(t) && businessDayKey(t) === businessDayKey(Date.now());
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
  /* La démo ne tient pas de journal (rien n'est écrit) : Vendus lisait donc
     zéro à côté de « 6 ventes ». On lui prête les ventes de la séance, en
     mémoire seulement ; une vraie caisse continue de lire son journal. */
  if (IS_DEMO) window.KiwiBoutiqueDemoDay = () => SALES.filter((s) => s && !s.voided)
    .map((s) => ({ ...s, lines: (s.lines || []).map((l) => (l.name || !P[l.pid] ? l : { ...l, name: P[l.pid].name })) }));
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
    if (!item) return null;
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
  /* Ce que le serveur a vraiment reçu pour une vente importée. Elle ne portait
     que ses lignes : une livraison à crédit ou un ticket réglé par avoir, reçus
     à 0 au serveur, entraient dans « X MAD aujourd'hui » comme de l'argent
     encaissé dès qu'une autre tablette relisait l'historique. */
  function remoteMoney(row, total) {
    const back = { cash: 'espèces', card: 'carte', transfer: 'virement', cheque: 'chèque', credit: 'avoir', delivery: 'livraison' };
    const parts = (Array.isArray(row.paymentParts) ? row.paymentParts : [])
      .map((p) => ({ m: back[p && p.method] || String((p && p.method) || 'paiement'), amount: Math.max(0, Math.round(Number(p && p.amountCents) || 0)) / 100 }))
      .filter((p) => p.amount > 0);
    const cents = row.amountCents != null && Number.isFinite(Number(row.amountCents)) ? Math.round(Number(row.amountCents)) : Math.round((Number(row.amount) || 0) * 100);
    const received = Math.max(0, Math.min(Math.round(total * 100), cents)) / 100;
    return parts.length ? { parts, received } : { received };
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
        const total = lines.reduce((sum, l) => sum + l.unit * l.qty, 0);
        SALES.push({
          id: ref, serverId: String(row.id || ''), at: new Date(Number(row.ts) || Date.now()),
          clientId: null, by: 'Caisse', kind: 'vente', methods: srvMethod(row.method), lines,
          total, remote: true, ...remoteMoney(row, total),
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
    ticket: null,                /* { num, lines:[], client:id|'passage'|null, remiseAuth } */
    exchange: null,              /* { saleId, idx, qty:1 } pendant le choix du remplacement */
    ret: null,                   /* { saleId, picks:Set, quantities:Map, motif } */
    retQuery: '',
    retDate: retDayKey(Date.now()),
    clQuery: '',
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
    checkoutBusy: false,
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
        qty, amount: bqMoney((Number(ln.unit) || 0) * qty, true),
      };
    }).filter(Boolean);
    const now = Date.now();
    const client = saleClient(sale);
    RETURN_LOG.unshift({
      id: `RET-${sale.id}-${now}`, ts: now, saleRef: sale.id, kind: kind || 'avoir',
      reason: reason || '', amount: bqMoney(Number(amount) || 0, true), reference: reference || '',
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
  let ticketLease = null;
  let ticketLeaseRequest = null;

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

  function readTicketLease() {
    const m = merchantSlug();
    const period = ticketPeriod();
    if (ticketLease && ticketLease.m === m && ticketLease.period === period) return ticketLease;
    ticketLease = null;
    try {
      const x = JSON.parse(localStorage.getItem(TICKET_LEASE_KEY) || 'null');
      if (x && x.m === m && +x.period === period && Number.isInteger(+x.next) && Number.isInteger(+x.end) && +x.next <= +x.end) {
        ticketLease = { m, period, next: +x.next, end: +x.end };
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
    const n = Math.max(+lease.next || 0, saleSeq, 1000);
    if (n > lease.end || n > 99999) return '';
    const previousNext = lease.next;
    const previousSeq = saleSeq;
    lease.next = n + 1;
    saleSeq = n + 1;
    /* The number is not claimed until its successor is durable. Otherwise a
       full/private localStorage can reload the old `next` and print the same
       visible receipt number twice. Losing the whole server-reserved range is
       acceptable; reusing one of its numbers is not. */
    if (!saveTicketLease()) {
      lease.next = previousNext;
      saleSeq = previousSeq;
      return '';
    }
    return String(n);
  }

  function ensureTicketLease() {
    if (IS_DEMO) return Promise.resolve(ticketLease);
    syncTicketPeriod();
    const existing = readTicketLease();
    if (existing && Math.max(existing.next, saleSeq) <= existing.end) return Promise.resolve(existing);
    if (ticketLeaseRequest) return ticketLeaseRequest;
    const m = merchantSlug();
    if (!m || typeof fetch !== 'function') return Promise.reject(new Error('merchant-unavailable'));
    ticketLeaseRequest = fetch('/api/ticket-sequence', {
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
      ticketLease = { m, period: ticketPeriod(), next: start, end };
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
      });
    });
  }

  function assignTicketNumber(ticket) {
    if (!ticket || ticket.num) return Promise.resolve(ticket && ticket.num);
    ticketOwner.numbering(ticket);
    return claimTicketNumber().then((n) => {
      /* The ticket object, not merely state.ticket, is captured. A reset while
         the request is in flight cannot put the old response on the new cart. */
      ticketOwner.numbered(ticket, n, ticketPeriod());
      if (state.ticket === ticket && root) { renderTicket(); icons(); }
      return n;
    }).catch((e) => {
      ticketOwner.numberFailed(ticket);
      /* L'ÉCHEC DOIT SE VOIR TOUT DE SUITE, PAS AU MOMENT DE PAYER.
         Sans marque d'erreur, un ticket sans numéro reste bloqué sur
         « attribution… » : la vendeuse scanne tout le panier, la cliente sort sa
         carte, et c'est seulement là qu'on découvre que la caisse n'a jamais pu
         réserver de série. On distingue donc « en cours » de « échoué », pour
         que la tête du ticket le dise et propose de réessayer. */
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
    };
    ticketOwner.clear(state, ticket);
    if (!IS_DEMO) assignTicketNumber(ticket).catch(() => {
      if (state.ticket !== ticket) return;
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Numéro de ticket indisponible'), state.ticketStorageError
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
      const pr = window.KiwiPromos.priceFor(p, { stock: stockOf(p) });
      return pr ? { ...pr, price: shelf(pr.price), was: shelf(pr.was) } : null;
    } catch (_) { return null; }
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
   *     dessus. Sans ça, deux lignes du même caftan cohabitaient à 2 400 et
   *     2 160 sur le même ticket, et personne n'aurait su expliquer laquelle
   *     était la bonne.
   *
   * Une seule phrase à tenir devant la cliente : « on ne vous facture jamais
   * plus que le prix affiché au moment où l'article a été scanné, ni plus que
   * celui affiché maintenant. » C'est aussi ce qui rend un retour juste trois
   * jours plus tard : la ligne de vente porte le prix réellement payé. */
  /* GENERATED SHARED KiwiPromotionPricing BEGIN */
  /* Copy of functions/api/_rules-promotion-pricing.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiPromotionPricing = (function () {
    const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const toMin = (s) => { var m = HHMM.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
    const money = (v) => { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0; }
    const down = (n) => { return Math.max(0, Math.floor(n * 100 + 1e-6) / 100); }
    const normalize = (p, surface) => {
        var kind = ['percent', 'amount', 'fixed'].indexOf(p.kind) >= 0 ? p.kind : 'percent';
        var value = money(p.value);
        if (kind === 'percent') value = Math.min(100, value); /* kept to the centime (12.5 % stays 12.5 %), like every amount */
        var days = (Array.isArray(p.days) ? p.days : []).map(Number).filter(function (d, i, a) {
          return Number.isInteger(d) && d >= 0 && d <= 6 && a.indexOf(d) === i;
        }).sort(function (a, b) { return a - b; });
        var start = HHMM.test(p.start || '') ? p.start : '';
        var end = HHMM.test(p.end || '') ? p.end : '';
        if (!start || !end || start === end) { start = ''; end = ''; }
        return { kind: kind, value: value, days: days.length === 7 ? [] : days, start: start, end: end };
      }
    const inWindow = (p, b) => {
        if (p.days && p.days.length && p.days.indexOf(b.weekday) < 0) return false;
        var s = toMin(p.start), e = toMin(p.end);
        if (s == null || e == null) return true;
        return s < e ? b.min >= s && b.min < e : b.min >= s || b.min < e;
      }
    const price = (p, unit, surface) => {
        var base = money(unit);
        var out = base;
        if (p.kind === 'percent') out = Math.round(Math.round(base * 100) * (100 - p.value) / 100 + 1e-9) / 100;
        else if (p.kind === 'amount') out = base - p.value;
        else out = p.value;
        return Math.min(base, money(out));
      }
    const statusAt = (p, at, moment) => {
      if (!p) return 'ended';
      if (p.paused) return 'paused';
      if (p.to && at > p.to) return 'ended';
      if (p.from && at < p.from) return 'scheduled';
      if (!p.days?.length && !(p.start && p.end)) return 'active';
      return inWindow(p, moment) ? 'active' : 'waiting';
    }
    const lineDeal = (line, fullPrice, live) => {
      const stamp = (line && line.promo && Number.isFinite(+line.promo.price))
        ? { ...line.promo, price: down(line.promo.price) } : null;
      let best = { price: down(+fullPrice || 0), promo: null };
      if (stamp && stamp.price < best.price) best = { price: stamp.price, promo: stamp };
      if (live && live.price < best.price) best = { price: live.price,
        promo: { price: live.price, badge: live.badge, name: live.promo.name, id: live.promo.id } };
      return best;
    }
    const lineUnit = (base, remise) => { return down(+(base * (100 - remise) / 100) || 0); }
    const appliesMenu = (p, line) => {
      if (!line || line.kind === 'formula' || line.kind === 'formula-part') return false;
      if (p.all) return true;
      if (line.itemId && p.items.indexOf(String(line.itemId)) >= 0) return true;
      return !!line.catId && p.cats.indexOf(String(line.catId)) >= 0;
    }
    const resolveMenu = (promos, line, unit, moment) => {
      const base = money(unit);
      if (!(base > 0) || !Array.isArray(promos) || !promos.length) return null;
      let best = null;
      for (const p of promos) {
        if (!appliesMenu(p, line) || statusAt(p, moment.date, moment) !== 'active') continue;
        const value = price(p, base);
        if (value >= base) continue;
        best = choosePromotion(best, { price: value, promo: p }, true);
      }
      if (!best) return null;
      const p = best.promo;
      const badge = p.kind === 'percent' ? '−' + p.value + ' %' : p.kind === 'amount'
        ? '−' + String(p.value).replace('.', ',') + ' MAD' : String(p.value).replace('.', ',') + ' MAD';
      return { price: best.price, promo: { id: p.id, name: p.name, badge, before: base } };
    }
    const stockOf = (item) => {
        if (!item || !item.sizes) return 0;
        return Object.keys(item.sizes).reduce(function (s, k) { return s + (+item.sizes[k] || 0); }, 0);
      }
    const toTs = (v) => {
        if (!v) return 0;
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        var t = new Date(v).getTime();
        return Number.isFinite(t) ? t : 0;
      }
    const matches = (p, item, stock) => {
        if (!p || !item) return false;
        var sc = p.scope || {};
        if (sc.type === 'tout') return true;
        if (sc.type === 'rayon') return (sc.ids || []).indexOf(item.rayon) >= 0 || (!!item.uncat && (sc.ids || []).indexOf('_uncat') >= 0);
        if (sc.type === 'produits') return (sc.ids || []).indexOf(item.id) >= 0;
        if (sc.type === 'avant') {
          var bef = toTs(sc.before);
          var itAt = toTs(item.createdAt);
          return !!bef && !!itAt && itAt < bef;
        }
        if (sc.type === 'stock') {
          var n = (stock == null) ? stockOf(item) : stock;
          /* Un article épuisé ne porte pas d'affiche « fin de série » : la pastille
             promettrait un prix sur une étagère vide. */
          return n > 0 && n <= (sc.max || 0);
        }
        return false;
      }
    const choosePromotion = (best, candidate, zeroAge = false) => {
      const age = p => zeroAge ? (p.createdAt || 0) : p.createdAt;
      return !best || candidate.price < best.price || (candidate.price === best.price && age(candidate.promo) < age(best.promo)) ? candidate : best;
    }
    return { toMin, money, down, normalize, inWindow, price, statusAt, lineDeal, lineUnit, appliesMenu, resolveMenu, stockOf, toTs, matches, choosePromotion };
  })();
  /* GENERATED SHARED KiwiPromotionPricing END */
  function lineDeal(ln) {
    return KiwiPromotionPricing.lineDeal(ln, P[ln.pid].price, promoFor(ln.pid));
  }
  const linePromo = (ln) => lineDeal(ln).promo;
  const lineBase  = (ln) => lineDeal(ln).price;
  const lineUnit  = (ln) => KiwiPromotionPricing.lineUnit(lineBase(ln), ln.remise);
  const lineTotal = (ln) => Math.round(lineUnit(ln) * 100) * ln.qty / 100;
  /* Remise fidélité au niveau du TICKET (distincte de la remise gérante par ligne).
     Attachée au client via clientId : si on détache/change la cliente, elle cesse
     de s'appliquer d'elle-même, sans avoir à la retirer partout à la main. */
  /* GENERATED SHARED KiwiLoyaltyRules BEGIN */
  /* Copy of functions/api/_rules-loyalty.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiLoyaltyRules = (function () {
    // Loyalty earning, word matching, historical reversals and explicit reward policies.
    const loyaltyOn = (cfg) => !!(cfg && cfg.model && !cfg.auto);
    const pointsFor = (amount, cfg) => Math.max(0,
      Math.floor(amount * Math.max(0, Number(cfg && cfg.amount && cfg.amount.perMad) || 1) + 1e-6));
    const foldName = (v) => String(v || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const qualifyingQty = (cfg, items) => {
      const want = foldName(cfg && cfg.product && cfg.product.item);
      if (!want) return 0;
      return (Array.isArray(items) ? items : []).reduce((n, item) => {
        const name = ' ' + foldName(item && item.name) + ' ';
        return name.includes(' ' + want + ' ') ? n + Math.max(0, Math.round(Number(item && item.qty) || 0)) : n;
      }, 0);
    }
    const stampsFor = (cfg, items) => {
      if (!loyaltyOn(cfg)) return 0;
      if (cfg.model === 'visit') return 1;
      if (cfg.model !== 'product') return 0;
      return Array.isArray(items) && items.length ? qualifyingQty(cfg, items) : 1;
    }
    const refundFor = (sale, amount, cfg, items, client) => {
      const paid = Number(sale && sale.paid || 0), earned = Number(sale && sale.earned || 0);
      const refunded = Number(sale && sale.refunded || 0), clawed = Number(sale && sale.clawed || 0);
      const take = Math.max(0, Math.min(amount, Math.round((paid - refunded) * 100) / 100));
      const claw = paid > 0 && earned > 0
        ? Math.max(0, Math.min(Math.round(earned * (refunded + take) / paid) - clawed, earned - clawed)) : 0;
      const stampsLeft = Math.max(0, Number(sale && sale.stamped || 0) - Number(sale && sale.unstamped || 0));
      const lines = Array.isArray(items) ? items : [];
      const whole = paid > 0 && take >= Math.round((paid - refunded) * 100) / 100 - 0.004;
      const unstamp = cfg.model === 'product' && lines.length
        ? Math.min(stampsLeft, qualifyingQty(cfg, lines)) : (whole ? stampsLeft : 0);
      return { take, claw, unstamp,
        pointsTake: Math.min(claw, Math.max(0, Number(client.points) || 0)),
        stampsTake: Math.min(unstamp, Math.max(0, Number(client.stamps) || 0)) };
    }
    const rewardDiscount = (reward, clientId, base, units) => {
      if (!reward || reward.clientId !== clientId) return 0;
      if (reward.kind !== 'percent') return reward.kind === 'free' && units.length ? Math.min.apply(null, units) : 0;
      const amount = Math.max(0, +base || 0), percent = Math.min(100, Math.max(0, +reward.value || 0));
      return Math.min(amount, Math.round(amount * percent + 1e-9) / 100); // wave Q: nearest centime, every trade
    }
    return { loyaltyOn, pointsFor, foldName, qualifyingQty, stampsFor, refundFor, rewardDiscount };
  })();
  /* GENERATED SHARED KiwiLoyaltyRules END */
  function rewardDiscount(t, base) {
    return KiwiLoyaltyRules.rewardDiscount(t.reward, t.client, base, t.lines.map(lineUnit));
  }
  /* Trois baisses, trois lignes séparées, jamais une seule « remise » fourre-tout :
     la promotion est une décision du magasin, la remise un geste de la gérante,
     la récompense un dû de la cliente. Les confondre au total, c'est rendre le
     rapport de clôture incapable de dire ce que les promotions ont coûté. */
  function ticketTotals(t) {
    const cents = v => Math.round(v * 100);
    const sub = t.lines.reduce((s, ln) => s + cents(shelf(P[ln.pid].price)) * ln.qty, 0);
    const afterPromo = t.lines.reduce((s, ln) => s + cents(lineBase(ln)) * ln.qty, 0);
    const afterLines = t.lines.reduce((s, ln) => s + cents(lineTotal(ln)), 0);
    const reward = cents(rewardDiscount(t, afterLines / 100));
    const total = Math.max(0, afterLines - reward);
    return { sub: sub / 100, promo: (sub - afterPromo) / 100, remise: (afterPromo - afterLines) / 100, reward: reward / 100, total: total / 100 };
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
     jours sous le mot « aujourd'hui ».
     Et l'argent QUI RENTRE, comme le serveur et le tableau de bord : la part
     réglée en avoir consomme une dette née d'une vente déjà comptée. Une robe
     rendue puis réglée avec son avoir affichait 500 MAD pour 250 encaissés.
     Une livraison n'est pas encaissée non plus : le serveur l'enregistre à 0
     (créance) et le Z la range sous « Livraisons · à recevoir ». */
  const notCashedOf = (x) => (Array.isArray(x.parts) ? x.parts : [])
    .reduce((s, p) => s + (p && (p.m === 'avoir' || p.m === 'livraison') ? (+p.amount || 0) : 0), 0);
  const caToday = () => salesToday().reduce((s, x) => s + (x.remote && Number.isFinite(x.received) ? x.received : Math.max(0, (+x.total || 0) - notCashedOf(x))), 0);
  /* Le libellé s'écrit « Vente · MM-1208 » : le mot et le numéro restent deux
     morceaux, que la caisse en arabe et en anglais sait lire séparément. */
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
    const b = root && $('#bq-fs', root); if (!b) return;
    const on = fsIsOn();
    const en = b.querySelector('[data-fs="enter"]'), ex = b.querySelector('[data-fs="exit"]');
    // `hidden` ne suffit pas ici : un reset `svg { display:block }` bat la règle
    // UA `[hidden]{display:none}` — on force donc le display en inline (spécificité max).
    if (en) en.style.display = on ? 'none' : '';
    if (ex) ex.style.display = on ? '' : 'none';
    const lb = b.querySelector('span'); if (lb) lb.textContent = on ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Quitter le plein écran') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Plein écran');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Quitter le plein écran') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Plein écran');
  }
  function setupFullscreenBtn() {
    const b = $('#bq-fs', root); if (!b) return;
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
    syncTillStaff();
    /* A PAIRED caisse shows the real store's name/city (from onboarding); the
       unpaired demo (PIN 0002) keeps the Maison Mansour identity. */
    const _pv = (function () { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } })();
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const _vName = (_pv && _pv.name) ? _esc(_pv.name) : 'Maison Mansour';
    const _vSub = (_pv && _pv.location) ? _esc(_pv.location) : (_pv ? '' : 'Casablanca · Maarif');
    root.innerHTML = `
      <aside class="bq-rail">
        <div class="bq-brand"><img class="kiwi-pos-logo" src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></div>
        <div class="bq-venue">
          <div class="bq-venue-name">${_vName}</div>
          <div class="bq-venue-sub">${_vSub}${_vSub ? '<br>' : ''}Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="bq-nav" id="bq-nav">
          <button class="bq-nav-it on" data-bq-view="vente"><i data-lucide="shopping-bag"></i><span>Vente</span><b class="bq-nav-badge" id="bq-badge-vente"></b></button>
          <button class="bq-nav-it" data-bq-view="scan"><i data-lucide="scan-line"></i><span>Scan</span><b class="bq-nav-badge" id="bq-badge-scan"></b></button>
          <button class="bq-nav-it" data-bq-view="inventaire"><i data-lucide="package"></i><span>Inventaire</span><b class="bq-nav-badge" id="bq-badge-inv"></b></button>
          <button class="bq-nav-it" data-bq-view="echanges"><i data-lucide="arrow-left-right"></i><span>Échanges &amp; avoirs</span><b class="bq-nav-badge" id="bq-badge-ret"></b></button>
          <button class="bq-nav-it" data-bq-view="vendus"><i data-lucide="chart-no-axes-column-increasing"></i><span>Vendus</span></button>
          <button class="bq-nav-it" data-bq-view="clientes"><i data-lucide="users"></i><span>Clientes</span><b class="bq-nav-badge" id="bq-badge-cl"></b></button>
          <button class="bq-nav-it" data-bq-view="acomptes"><i data-lucide="hand-coins"></i><span>Acomptes</span></button>
        </nav>
        <div class="bq-rail-foot">
          <button class="bq-lock" data-action="printer-connect" title="Configurer les imprimantes"><i data-lucide="printer"></i><span>Imprimantes</span></button>
          <button class="bq-net" id="bq-net" title="${IS_DEMO ? 'Simuler une coupure réseau' : 'État de la synchronisation'}">
            <i class="bq-net-dot"></i><span class="bq-net-label">En ligne</span>
          </button>
          <button class="bq-lock" id="bq-fs" title="Plein écran" aria-label="Basculer le plein écran" aria-pressed="false"><svg data-fs="enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><svg data-fs="exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg><span>Plein écran</span></button>
          ${IS_DEMO ? '' : '<button class="bq-lock" id="bq-close-day"><i data-lucide="power"></i><span>Fin de service</span></button>'}
          <button class="bq-lock" id="bq-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="bq-main">
        <div class="bq-offline-note" id="bq-offline-note" hidden>
          Hors-ligne, les ventes sont enregistrées sur la tablette et synchronisées au retour du réseau.
          <b id="bq-queue-count"></b>
        </div>
        <section class="bq-view is-on" data-bq-panel="vente">
          <div class="bq-sell">
            <header class="bq-head">
              <div><h1>Vente</h1><div class="bq-head-sub" id="bq-today"></div></div>
              <div class="bq-head-hint">Scannez un code-barres, ou touchez un article</div>
            </header>
            <div id="bq-exch-slot"></div>
            <div class="bq-sell-scan">
              <i data-lucide="scan-line"></i>
              <input id="bq-sell-ean" placeholder="Scannez un code-barres pour l'ajouter au ticket…" autocomplete="off" />
              <span class="bq-sell-scan-tag">Entrée</span>
              ${pvReal() && camSupported()
                ? `<button class="bq-sell-cam" id="bq-sell-cam" title="Scanner avec la caméra" aria-label="Scanner avec la caméra"><i data-lucide="camera"></i></button>`
                : ''}
            </div>
            <div class="bq-cats" id="bq-cats"></div>
            <div class="bq-grid-scroll" id="bq-gridwrap"></div>
          </div>
          <aside class="bq-ticket" id="bq-ticket"></aside>
        </section>
        <section class="bq-view" data-bq-panel="scan"></section>
        <section class="bq-view" data-bq-panel="inventaire"></section>
        <section class="bq-view" data-bq-panel="echanges"></section>
        <section class="bq-view" data-bq-panel="vendus"></section>
        <section class="bq-view" data-bq-panel="clientes"></section>
        <section class="bq-view" data-bq-panel="acomptes"></section>
      </main>
      <div class="modal-veil" id="bq-sheet-veil"><div class="modal bq-sheet bq-rel" id="bq-sheetm"></div></div>
      <div class="modal-veil" id="bq-approve-veil"><div class="modal bq-approve bq-rel" id="bq-approvem"></div></div>
      <div class="modal-veil" id="bq-client-veil"><div class="modal bq-client bq-rel" id="bq-clientm"></div></div>
      <div class="modal-veil" id="bq-fiche-veil"><div class="modal bq-fiche bq-rel" id="bq-fichem"></div></div>
      <div class="modal-veil" id="bq-exch-veil"><div class="modal bq-exch bq-rel" id="bq-exchm"></div></div>
      <div class="modal-veil" id="bq-pay-veil"><div class="modal bq-pay bq-rel" id="bq-paym"></div></div>
      <div class="modal-veil" id="bq-inv-veil"><div class="modal bq-invm bq-rel" id="bq-invmm"></div></div>
      <div class="modal-veil" id="bq-avoir-veil"><div class="modal bq-avoirm bq-rel" id="bq-avoirmm"></div></div>`;

    $('#bq-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-bq-view]');
      if (b) switchView(b.dataset.bqView);
    });
    $('#bq-lock', root).addEventListener('click', () => {
      /* La feuille de clôture vit au niveau du body (au-dessus du root) : la
         laisser ouverte pendant le verrouillage la poserait sur l'écran PIN. */
      if (bqCloVeil) bqCloVeil.classList.remove('is-open');
      window.KiwiPosDispatch.lock();
    });
    const closeDay = $('#bq-close-day', root);
    if (closeDay) closeDay.addEventListener('click', bqOpenCloture);
    if (window.KiwiShiftNudge) window.KiwiShiftNudge.check({ host: root, scope: 'boutique@' + merchantSlug(),
      openedAt: () => bqShift && bqShift.openedAt, open: bqOpenCloture, isBusy: () => state.checkoutBusy });
    $('#bq-net', root).addEventListener('click', toggleOffline);
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
      v.addEventListener('click', (e) => {
        /* Payment owns a server stock reservation. It may close only through its
           own handlers, which release that reservation when nothing was paid. */
        if (e.target === v && v.id !== 'bq-pay-veil') closeVeil(v);
      });
    });

    /* Vente — scan-to-sell bar : a code scanned or typed here drops the article
       straight onto the ticket, supermarket-style. Commit on Enter only (the USB
       douchette ends every scan with Enter) so a scan is never counted twice. */
    const sellEan = $('#bq-sell-ean', root);
    if (sellEan) sellEan.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = sellEan.value.trim();
      sellEan.value = '';
      if (v) commitEan(v);
    });
    wireSellSearch($('.bq-sell-scan', root), sellEan);   // peau 2027 : la liste qui répond au 1er chiffre
    /* Même barre, sans douchette : la caméra dépose l'article sur le ticket. */
    const sellCam = $('#bq-sell-cam', root);
    if (sellCam) sellCam.onclick = () => openCamScan(commitEan);
    /* La douchette quand le champ n'a pas le focus (vendeuse qui vient de
       toucher une tuile) : assets/scan-wedge.js reconnaît le scan à sa vitesse
       et le dépose ici tant que la barre de vente est à l'écran. */
    if (window.KiwiScanWedge) window.KiwiScanWedge.attach({
      id: 'boutique',
      active: () => { const i = $('#bq-sell-ean', root); return !!(i && i.isConnected && i.offsetParent !== null); },
      onScan: (code) => commitEan(String(code).trim()),
    });

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
        || (pvReal() ? 'boutique-live' : 'maisonMansour');
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
    /* Le stock que la caisse vient de toucher n'a pas pris sur cette tablette
       (stockage plein ou refusé) : la vente continue et la baisse part au
       serveur, mais un rechargement la perdrait. On le dit sans bloquer, à
       chaque échec (au plus une fois par 30 s), puis une fois au retour à la
       normale. Voir sayKept() dans assets/boutique-catalog.js. */
    if (window.KiwiBoutiqueCatalog && !window.__kiwiCatalogSaveWarn) {
      window.__kiwiCatalogSaveWarn = true;
      let lastWarn = 0;
      window.addEventListener('kiwi:local-save', (e) => {
        const d = (e && e.detail) || {};
        if (d.store !== 'catalog') return;
        if (d.durable) {
          if (lastWarn) { lastWarn = 0; toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Stock de nouveau enregistré sur cette caisse'), 3200, 'success'); }
          return;
        }
        const now = Date.now();
        if (lastWarn && now - lastWarn < 30000) return;
        lastWarn = now;
        toast('Stock non enregistré sur cette caisse', 9000, 'warn',
          (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('La vente continue et le stock part au serveur dès que le réseau le permet. Libérez du stockage avant de recharger la page.'));
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
    if (!mount._clientsBound && window.KiwiClients && window.KiwiClients.subscribe) {
      mount._clientsBound = true;
      try {
        window.KiwiClients.subscribe(() => {
          if (!root) return;
          renderBadges();
          if (state.view === 'clientes') renderClientes();
        });
      } catch (_) {}
    }

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

    /* Le cache local ne connaît que les bons émis ici : sans relecture, un bon
       émis par l'autre caisse (ou avant un cache vidé) n'apparaissait jamais
       dans la liste, seul son code tapé le retrouvait. On relit le registre à
       l'ouverture de la caisse, et à chaque ouverture d'Échanges & avoirs. */
    if (!IS_DEMO) void refreshRemoteAvoirs();

    bqKitRail(root, $, icons, bqKitSkin(), (STAFF.caissiere && STAFF.caissiere.name) || '');
    /* Une vraie boutique ouvre son poste comme la caisse restaurant : fond d'ouverture d'abord, la vente ensuite. La démo entre directement. */
    if (!IS_DEMO && !bqShift) bqShowOpenScreen();
  }

  /* Pick the first two in-stock articles from the live catalogue for the mid-day demo ticket (ids are the DB's, not the old hard-coded literals). */
  function seedDemoTicket() {
    const picks = [];
    for (const r of RAYONS) {
      for (const it of r.items) {
        const size = firstFreeFor(it, it.colors[0], { lines: picks });
        if (size) { picks.push({ pid: it.id, size, color: it.colors[0], qty: 1, remise: 0 }); }
        if (picks.length >= 2) break;
      }
      if (picks.length >= 2) break;
    }
    ticketOwner.replaceLines(state.ticket, picks);
    picks.forEach((ln) => stockAdd(ln.pid, ln.size, -ln.qty));
  }
  /* Drop ticket lines whose product vanished from the catalogue. */
  function pruneTicket() { if (state.ticket) ticketOwner.prune(state.ticket, P); }
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
    if (!IS_DEMO && !bqShift) bqShowOpenScreen();                  // re-unlock without a poste open → fond d'ouverture
    const today = $('#bq-today', root);
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
    $$('.bq-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.bqView === view));
    $$('.bq-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.bqPanel === view));
    renderView(view);
    icons();
    /* La destination a bougé : la lentille du rail du kit la suit. */
    bqKitRailPaint();
  }
  function renderView(view) {
    if (view === 'vente') { renderTicket(); renderGrid(); renderExchNote(); }
    if (view === 'scan') renderScan();
    if (view === 'inventaire') renderInventaire();
    if (view === 'echanges') {
      renderEchanges();
      if (!IS_DEMO) void refreshRemoteAvoirs().then(() => { if (state.view === 'echanges') renderEchanges(); });
    }
    if (view === 'vendus') {
      const panel = $('[data-bq-panel="vendus"]', root);
      if (window.KiwiSoldInsights) window.KiwiSoldInsights.renderTill(panel);
      else panel.innerHTML = '<div class="bq-empty" style="margin:40px;">Analyse des ventes indisponible.</div>';
    }
    if (view === 'clientes') renderClientes();
    if (view === 'acomptes') renderAcomptes();
  }
  function renderBadges() {
    const items = state.ticket ? ticketCount(state.ticket) : 0;
    const avs = activeAvoirs().length;
    const set = (id, n) => {
      const el = $(id, root);
      el.textContent = n || '';
      el.style.display = n ? '' : 'none';
    };
    set('#bq-badge-vente', items);
    set('#bq-badge-scan', state.scanLog.length);
    set('#bq-badge-ret', avs);
    set('#bq-badge-cl', (window.KiwiClients && KiwiClients.count && KiwiClients.count()) || CLIENTES.length);
    const invBadge = $('#bq-badge-inv', root);
    if (invBadge) { const st = window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.stats() : null; const n = st ? st.ruptures + st.low : 0; invBadge.textContent = n || ''; invBadge.style.display = n ? '' : 'none'; }
    /* Le rail du kit lit ses compteurs sur ces mêmes pastilles. */
    bqKitRailPaint();
  }
  function headSubVente() {
    // Le compte de ventes suit la même règle que la recette : la journée, pas la
    // semaine conservée pour les retours.
    const n = salesToday().length;
    return `${fmtDT(new Date())} · ${n} vente${n > 1 ? 's' : ''} · ${fmtMAD(caToday())} aujourd'hui`;
  }
  function renderAll() {
    $('#bq-today', root).textContent = headSubVente();
    renderCats();
    renderGrid();
    renderTicket();
    renderExchNote();
    renderBadges();
    renderNet();
    icons();
  }
  function refreshOps() {
    renderBadges();
    renderView(state.view);
    icons();
  }

  async function issueAvoir(amount, cliente, motif, fromSaleId, context) {
    if (!IS_DEMO) {
      if (context && context.originalSale) fromSaleId = await ensureOriginalSale(context.originalSale);
      const requestId = (context && context.requestId) || creditIntent('credit-issue');
      const approval = await avoirApproval(amount, requestId, fromSaleId, context && context.originalRef);
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
    queueIfOffline(`Avoir · ${av.code}`);
    toast(`${av.code} émis, ${fmtMAD(amount)}, pièces remises en stock`);
    renderBadges();
    return av;
  }

  function checkout() {
    const t = state.ticket;
    if (!t.lines.length || state.checkoutBusy) return;
    if (state.syncStorageError || state.ticketStorageError) {
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Vente suspendue'), 'La tablette ne peut plus sécuriser la file hors-ligne. Contactez le support avant de continuer.');
      return;
    }
    /* Le ticket tient une réservation LOCALE, tandis que le catalogue peut être
       corrigé depuis l'inventaire ou un autre onglet pendant qu'il reste ouvert.
       On relit donc les vraies déclinaisons avant même de consommer un numéro de
       ticket. Une taille disponible dans une autre couleur ne compte pas. */
    const stockIssue = ticketStockIssue(t);
    if (stockIssue) { showStockIssue(stockIssue); return; }
    /* A cart left open over New Year's midnight belongs to the new annual
       sequence at payment time. It has not been printed or committed yet, so
       replacing the number is safe and prevents a January sale from consuming
       a number leased for December. */
    if (!IS_DEMO && t.period !== ticketPeriod()) {
      ticketOwner.renewPeriod(t, ticketPeriod());
    }
    if (!t.num) {
      assignTicketNumber(t).then(() => { if (state.ticket === t) checkout(); })
        .catch(() => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Numéro de ticket indisponible'), state.ticketStorageError
          ? 'Le stockage sécurisé de cette tablette est indisponible. Contactez le support.'
          : 'Reconnectez cette caisse pour réserver sa prochaine série.'));
      return;
    }
    const tot = ticketTotals(t);
    const total = tot.total;
    const c = ticketClient();
    /* Everything after this line reads this immutable snapshot. Catalogue pulls,
       barcode scans and ticket pruning may still happen asynchronously, but they
       can no longer change what is charged, printed, journalled or deducted. */
    const frozen = {
      num: t.num, syncId: t.syncId || newSaleId(), clientId: c ? c.id : null,
      reward: t.reward ? Object.assign({}, t.reward) : null,
      remiseAuth: (t.remiseAuth && typeof t.remiseAuth === 'object') ? Object.assign({}, t.remiseAuth) : null,
      lines: t.lines.map((ln) => {
        const p = P[ln.pid] || {};
        return {
          pid: ln.pid, size: ln.size, color: ln.color, qty: ln.qty, remise: ln.remise,
          promo: linePromo(ln), unit: lineUnit(ln), name: p.name || 'Article',
          price: shelf(p.price), barcode: p.barcode || '', rayon: rayonOf(ln.pid) || '',
        };
      }),
    };
    const RS = window.KiwiRepeatSale, repeatSig = RS ? RS.signature(frozen.lines, total) : ''; // même panier qu'il y a < 2 min
    const beginPay = () => openPay({
      amount: total,
      customerId: c ? c.id : null,
      beforePaid: () => window.KiwiLoyaltyReserve.create({ isDemo: IS_DEMO, ticket: t, ticketOwner, client: c, render: renderTicket, close: () => { state.checkoutBusy = false; closeVeil('#bq-pay-veil'); } }).confirm(),
      title: 'Encaissement',
      subtitle: `${frozen.num} · ${c ? esc(c.name) : 'Cliente de passage'}`,
      // Real ticket contents, so the printed receipt itemises the sale instead
      // of showing a single lump sum.
      ref: frozen.num,
      lines: frozen.lines.map((ln) => ({
        qty: ln.qty,
        name: ln.name + (ln.size ? ' ' + ln.size : ''),
        amount: ln.unit * ln.qty,
        ref: ln.pid,
        barcode: ln.barcode,
      })),
      /* Ce qui rend le ticket lisible pour la cliente : ce qu'elle aurait payé,
         ce qu'on lui a retiré, et à quel nom la fidélité est comptée. Sans ça le
         reçu affiche un total qui ne correspond pas à l'addition des lignes et
         personne ne peut vérifier sa remise. */
      subtotal: tot.sub,
      /* Trois baisses, deux lignes distinctes sur le reçu. `promo` porte son
         NOM quand une seule promotion a joué — la cliente retrouve l'affiche
         qu'elle a lue en vitrine. Quand plusieurs se croisent sur le même
         ticket, le mot générique est la seule chose vraie : nommer l'une des
         deux ferait croire que l'autre n'a pas été appliquée. */
      promo: tot.promo ? { amount: tot.promo, label: promoLabelForTicket(t) } : null,
      discount: tot.remise + tot.reward,
      customer: c ? { name: c.name, phone: c.phone, points: c.points, loyalty: (frozen.reward && frozen.reward.clientId === frozen.clientId) ? frozen.reward.label : '' } : null,
      /* Deuxième lecture juste avant que la caissière choisisse son premier mode
         de paiement : elle couvre une correction de stock arrivée pendant que
         la fenêtre d'encaissement était ouverte, sans jamais bloquer un paiement
         déjà commencé. */
      stockCheck: () => ticketStockIssue({ lines: frozen.lines }),
      onStockError: showStockIssue,
      onCancel: () => {
        state.checkoutBusy = false;
      },
      waName: c ? firstName(c.name) : null, waPhone: c ? c.phone : null,
      onPaid: (parts, paymentContext) => {
        state.checkoutBusy = false;
        const isAcompte = !!(paymentContext && paymentContext.partial);
        const receivedNow = isAcompte ? paymentContext.paidNow : total;
        if (isAcompte && (!c || !c.id || !window.KiwiRetailBalances)) {
          toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Attachez une cliente avant de prendre un acompte')); return { error: 'customer-required' };
        }
        // Récompense fidélité effectivement portée sur ce ticket (attachée à cette
        // cliente) — on la débite des points APRÈS avoir enregistré l'achat.
        const rewardUsed = !!(frozen.reward && c && c.id && frozen.reward.clientId === c.id);
        const sale = {
          id: frozen.num, syncId: frozen.syncId, tenderVersion: 2, at: new Date(), clientId: frozen.clientId, by: STAFF.caissiere.name, kind: isAcompte ? 'acompte' : 'vente',
          methods: parts.map((x) => x.m).join(' + '),
          /* Les parts de règlement, figées : c'est elles qui rendent le tiroir
             de la clôture exact quand un ticket est réglé moitié carte moitié
             espèces (voir bqMoneyParts). La remise suit pour le rapport Z. */
          parts: parts.map((x) => ({ m: x.m, amount: Math.round((+x.amount || 0) * 100) / 100 })),
          discount: bqMoney((tot.remise + tot.reward), true),
          /* L'accord responsable suit la vente, pas seulement l'écran : qui a
             autorisé, quand, quel pourcentage, et ce que la remise a coûté au
             magasin. C'est la seule chose relisible le jour d'un contrôle. */
          remiseAuth: frozen.remiseAuth
            ? { by: frozen.remiseAuth.by || '', role: frozen.remiseAuth.role || '', at: frozen.remiseAuth.at, pct: frozen.remiseAuth.pct, amount: bqMoney((tot.remise), true) }
            : null,
          promoOff: bqMoney((tot.promo), true),        // ce que les promotions ont coûté, pour la clôture
          /* `promo` suit la ligne dans le journal. Un retour se rembourse sur
             `unit` (le prix réellement payé), mais un échange ou une réclamation
             trois jours plus tard a besoin de SAVOIR pourquoi le prix était bas —
             sinon la caissière voit un caftan à 700 sur un ticket, 1 000 en rayon,
             et n'a aucun moyen de trancher. */
          lines: frozen.lines.map((ln) => ({ pid: ln.pid, size: ln.size, color: ln.color, qty: ln.qty, remise: ln.remise, promo: ln.promo, unit: ln.unit, name: ln.name, returned: false, note: '' })),
          reward: rewardUsed ? frozen.reward.label : null,
          total: receivedNow,
          balanceTotal: isAcompte ? total : null,
          balanceDue: isAcompte ? Math.round((total - receivedNow) * 100) / 100 : 0,
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
          if (!savedBalance) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Acompte non conservé : stockage local indisponible')); return { error: 'balance-storage-failed' }; }
          bqOutstandingCents = window.KiwiRetailBalances.read(merchantSlug())
            .reduce((sum, row) => sum + window.KiwiRetailBalances.due(row), 0);
        }
        SALES.unshift(sale);
        persistDay();
        bqSaveProvisional(isAcompte);      // le Z provisoire suit la vente (voir day-report.js)
        if (IS_DEMO) saleSeq++;
        // Draw the sold pieces down from the SHARED inventory — a real sale must move
        // stock through to the base (the in-memory ticket holds alone evaporate on the
        // next catalogue sync). Real/paired store only; the local demo stays in-memory.
        sale.lines.forEach((ln) => persistStock(ln.pid, ln.size, ln.color, -ln.qty, sale.id, 'vente'));
        // Mirror the sale to the owner/operator dashboard (Live Link) so the
        // boutique's real sales show up on the "En direct" feed + running total —
        // the main caisse does the same via recordSale(). No-op unless live is on;
        // wrapped so a mirror failure can never break the sale.
        try {
          if (window.KiwiLive && window.KiwiLive.isOn()) {
            const received = (parts || []).filter((x) => x && x.m !== 'avoir' && x.m !== 'livraison' && (+x.amount || 0) > 0);
            const receivedMethods = received.map((x) => x.m);
            const method = bqPaymentMethod(parts);
            const first = frozen.lines[0];
            const pieces = frozen.lines.reduce((n, ln) => n + ln.qty, 0);
            const name = first ? first.name : 'Vente';
            const label = frozen.lines.length > 1 ? (name + ' +' + (pieces - first.qty) + ' art.') : name;
            /* On remonte l'argent QUI RENTRE, pas la valeur du ticket. Un avoir
               n'est pas un encaissement : c'est la consommation d'une dette née
               d'une vente déjà comptée. Remonter le total, c'est compter deux
               fois — un caftan à 1 200 rendu puis réglé avec l'avoir affichait
               2 400 MAD de recette pour 1 200 MAD réellement pris. Réglé
               entièrement en avoir, il ne reste rien à remonter et postSale
               (montant ≤ 0) passe son tour, ce qui est le bon comptage.
               sale.total garde la valeur du ticket : c'est la vente, pas la caisse. */
            const cashIn = received.reduce((s, x) => s + (+x.amount || 0), 0);
            /* LE PANIER, qui ne partait pas. On ne remontait que {montant,
               moyen, libellé}, et le libellé est un RÉSUMÉ de ticket
               (« Caftan +3 art. ») : le tableau de bord ne pouvait donc pas dire
               à la patronne combien de jeans noirs elle avait vendus, alors que
               la caisse le savait ligne par ligne. Le rayon voyage avec chaque
               ligne — c'est lui qui fait tenir le « Catégorie : Jeans » du
               rapport de fin de journée même si le rayon est renommé plus tard.
               Bornes identiques à celles de /api/sale : 40 lignes, 60 signes. */
            const lineTotals = bqLineTotals(frozen.lines.map((ln) => ln.unit * ln.qty), total);
            const basket = bqFoldBasket(frozen.lines.map((ln, i) => ({
              itemId: ln.pid,
              variantId: [ln.pid, ln.size || '', ln.color || ''].join(':'),
              name: ln.name + (ln.size ? ' ' + ln.size : ''),
              qty: ln.qty,
              total: lineTotals[i],
              cat: ln.rayon,
              unit: 'piece',
              kind: 'product',
            })));
            const payload = {
              id: sale.syncId,
              amount: cashIn,
              method: method,
              paymentParts: bqPaymentParts(parts), ticketAmountCents: Math.round(receivedNow * 100),
              discountPercents: [...new Set(frozen.lines.map(ln => Number(ln.remise)).filter(n => n > 0))],
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
            if (cashIn <= 0 && (parts || []).some(x => x.m === 'livraison')) payload.settlementKind = 'receivable';
            else if (cashIn <= 0 && (parts || []).some(x => x.m === 'avoir')) {
              payload.settlementKind = 'store-credit';
              payload.creditAmountCents = Math.round((parts || []).filter(x => x.m === 'avoir')
                .reduce((sum, x) => sum + (+x.amount || 0), 0) * 100);
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
          /* Les points annoncés sont ceux que le carnet a réellement crédités :
             le toast disait « +25 pts » (un point pour 10 MAD, codé en dur) quand
             la boutique donnait un point par dirham, ou aucun sans programme. */
          let pts = 0;
          const ptsBefore = Number(c.points) || 0;
          if (useKiwiCl() && window.KiwiClients && window.KiwiClients.recordPurchase && c.id) {
            try { const res = window.KiwiClients.recordPurchase(c.id, {
              amount: receivedNow, method: sale.methods, saleRef: sale.id, saleId: sale.syncId, eventRef: sale.syncId, createdAt: +sale.at,
              items: sale.lines.map((ln) => ({ name: (P[ln.pid] && P[ln.pid].name) || ln.name || 'Article', qty: ln.qty, total: ln.unit * ln.qty })),
            }); if (res && res.client && !res.replayed) pts = Math.max(0, (Number(res.client.points) || 0) - ptsBefore); } catch (_) {}
            // La récompense est portée : on brûle les points (KiwiClients.redeem
            // retire le seuil / réinitialise la carte). Après recordPurchase, pour
            // que l'achat compte d'abord, la récompense se déduise ensuite.
            if (rewardUsed && window.KiwiClients.redeem) {
              try { window.KiwiClients.redeem(c.id, null, t.reward && t.reward.reservation); } catch (_) {}
            }
          }
          if (!useKiwiCl()) {
            const cfg = window.KiwiClients && window.KiwiClients.config ? window.KiwiClients.config() : null;
            pts = cfg && cfg.model === 'amount' ? Math.floor(receivedNow * ((cfg.amount && cfg.amount.perMad) || 1) + 1e-6) : 0;
          }
          c.points = ptsBefore + pts;
          c.achats += 1;
          ptsLine = (pts ? ` · +${pts} pts pour ${firstName(c.name)}` : '') + (rewardUsed ? ` · récompense ${frozen.reward.label}` : '');
        }
        queueIfOffline(`Vente · ${sale.id}`);
        if (RS) RS.remember('boutique', repeatSig, sale.id);
        freshTicket();
        $('#bq-today', root).textContent = headSubVente();
        renderTicket(); renderGrid(); renderBadges(); icons();
        // #0166 · on a phone the ticket sheet folds back to the sale grid.
        try { root.dispatchEvent(new CustomEvent('vx-ticket-done', { bubbles: true })); } catch (_) {}
        const delivery = parts.some((x) => x.m === 'livraison');
        // The paid moment in the native app. A delivery is still to be collected.
        if (!delivery) { try { window.dispatchEvent(new CustomEvent('kiwi:sale-paid', { detail: { total: total, method: 'boutique' } })); } catch (_) {} }
        return { ref: sale.id, sale, delivery, line: delivery
          ? `Vente ${sale.id} en livraison, ${fmtMAD(total)} à recevoir${ptsLine}`
          : `Vente ${sale.id} encaissée, ${fmtMAD(total)}${ptsLine}` };
      },
    });

    /* Checkout is deliberately local-first. The exact product × colour × size
       is checked above and again when the cashier chooses a payment method; the
       committed movement is then mirrored through the catalogue ledger with the
       sale's idempotency reference. A remote reservation used to sit between
       the Encaisser button and this panel. When that request never settled, a
       stocked shop was trapped forever behind the stock-verification screen. Network
       synchronization must never be a prerequisite for taking payment. */
    if (RS && RS.confirmRepeat({ scope: 'boutique', sig: repeatSig, el: $('#bq-paym', root), open: () => openVeil('#bq-pay-veil'), close: () => closeVeil('#bq-pay-veil'), busy: (b) => { state.checkoutBusy = b; }, go: () => state.ticket === t && beginPay() })) return;
    state.checkoutBusy = true;
    beginPay();
  }
  function payExistingBalance(row) {
    const R = window.KiwiRetailBalances;
    if (!R || row.pendingCents > 0) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Synchronisation de l’acompte en attente')); return; }
    const remaining = R.due(row) / 100;
    if (!(remaining > 0)) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Cette note est déjà réglée')); renderAcomptes(); return; }
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
        if (!saved) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Règlement non conservé : stockage local indisponible')); return { error: 'balance-storage-failed' }; }
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
      /* Un poste ouvert avant que la boutique n'annonce ses postes n'a jamais
         été vu du registre : il s'annonce au premier passage (bqAnnounceOpen). */
      if (s && +s.openedAt > 0) bqShift = { openedAt: +s.openedAt, openedBy: String(s.openedBy || ''), float: +s.float || 0,
        sid: String(s.sid || ''), openSent: !!s.openSent };
    } catch (_) {}
  })();
  /* ── LE RÉCONCILIATEUR DOIT VOIR CE COMPTOIR ───────────────────────────────
   * La caisse boutique tenait son poste entièrement pour elle : aucun
   * événement de session n'était émis (Santos Store, 211 ventes en deux
   * semaines, aucune ouverture ni clôture au registre), donc `cash_session_events` restait vide pour ce
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
    /* Vente importée sans détail : seul ce que le serveur a reçu est de l'argent. */
    const amount = s.remote && Number.isFinite(s.received) ? s.received : +s.total;
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
  /* La journée commerciale d'un service est celle de son OUVERTURE (même règle
     que la caisse restaurant) : une boutique de souk ouverte jusqu'après minuit
     clôture UNE journée, pas deux. */
  function bqBuildReport(counted, closedAt) {
    const DR = window.KiwiDayReport;
    if (!DR) return null;
    const sess = bqReportSession(counted);
    if (closedAt) sess.closedAt = closedAt;
    const pv = pvPaired() || {};
    /* La journée commerciale EN COURS, comme closeRegister() côté restaurant :
       les ventes du rapport sont celles d'aujourd'hui (salesToday). Un poste
       ouvert la veille et jamais clôturé classait les ventes du jour sous la
       date d'ouverture, où le calcul n'en retenait aucune : la veille était
       réécrite à 0 et le jour qui vendait n'avait pas de rapport (Santos Store,
       ouvert le 17 octobre, 318 ventes en 30 jours pour 2 rapports). */
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
     Santos Store a encaissé 211 ventes en deux semaines sans qu'aucune ne soit
     jamais comparée au registre. Chaque vente envoyée est décrite comme le
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
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Imprimante indisponible')); return Promise.resolve({ ok: false });
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
      if (res && res.ok) toast(res.via === 'pdf' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport prêt · imprimer ou partager le PDF') : res.via === 'browser' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport ouvert dans l\'impression système') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport imprimé'));
      else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression impossible · le rapport reste dans le tableau de bord'));
      return res || { ok: false };
    }, () => { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression impossible · le rapport reste dans le tableau de bord')); return { ok: false }; });
  }

  /* ── l'écran d'ouverture (fond de caisse) ── même dessin et mêmes classes que le clock-in restaurant ; seul le conteneur porte .bq-clockin,
     que pos-boutique.css ré-affiche par-dessus body.is-pos. Le fond retenu est mémorisé PAR ÉTABLISSEMENT (clé de la caisse restaurant). */
  function bqFloatMemKey() {
    try { const p = pvPaired(); if (p && p.merchant) return 'kiwi:openingFloat:v1:' + p.merchant; } catch (_) {}
    return 'kiwi:openingFloat:v1:boutique';
  }
  let bqFloat = 0;
  /* kiwiSkin2027:till · le fond d'ouverture compté sur le kit (§18.9, comme caisse/shift.js), seule branche 2027 du métier ; drapeau éteint, l'écran livré. */
  function bqKitSkin() { try { return document.documentElement.getAttribute('data-skin-2027') === 'till' && !!customElements.get('k-cash-count') && !!customElements.get('k-sheet'); } catch (_) { return false; } }
  function bqKitFloat(screen, onCounted) {
    if (!bqKitSkin()) return false;
    const cc = document.createElement('k-cash-count'); cc.setAttribute('mode', 'open');
    return bqKitOpenSheet(screen, cc, onCounted, bqFloatMemKey());
  }
  function bqShowOpenScreen() {
    if (document.getElementById('bq-clockin')) return;
    const pv = pvPaired() || {};
    const who = ((STAFF.caissiere && STAFF.caissiere.name) || '').trim().split(/\s+/)[0] || 'Caissier';
    const role = (STAFF.caissiere && STAFF.caissiere.role) || 'Caissier';
    const DDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const DMONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const el = document.createElement('div');
    el.className = 'clockin-screen bq-clockin';
    el.id = 'bq-clockin';
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
          <!-- Rien n'est présélectionné : le fond est ce que le caissier a COMPTÉ. Le dernier fond n'est qu'un raccourci à toucher. -->
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
    /* Le bouton ne s'enfonce qu'une fois le fond indiqué : jamais de 500 présélectionné qu'un seul toucher enregistrerait tel quel. */
    let chosen = false;
    const btnOpen = el.querySelector('#bqci-btn'), hint = el.querySelector('#bqci-hint'), last = el.querySelector('#bqci-last');
    /* Les pastilles ne s'effacent que si le kit est LÀ (bqKitFloat), pas si la peau
       est seulement demandée : kit absent, elles restent le seul moyen de saisir le fond. */
    const gate = () => { const kit = bqKitSkin(); el.classList.toggle('bq-float-kit', kit); if (btnOpen) btnOpen.disabled = !chosen && !kit; if (hint) hint.hidden = chosen || kit; };

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
    tick(); const timer = setInterval(tick, 10000);

    const doOpen = () => {
      el.querySelector('#bqci-btn').classList.add('is-confirmed'); icons();
      const openedAt = Date.now();
      bqShift = { openedAt, openedBy: (STAFF.caissiere && STAFF.caissiere.name) || '', float: bqFloat, sid: 'bq-' + openedAt, openSent: false };
      bqShiftPersist();
      /* Le fond d'ouverture est le premier chiffre du rapprochement. */
      bqAnnounceOpen(); bqSaveProvisional(true);
      setTimeout(() => el.classList.add('is-leaving'), 420); setTimeout(() => { clearInterval(timer); el.remove(); }, 940);
    };
    el.querySelector('#bqci-btn').addEventListener('click', () => {
      /* Sous la peau, le tiroir se compte dans la feuille du kit ; le montant compté suit le chemin livré. */
      if (!chosen && bqKitFloat(el, (v) => { bqFloat = v; chosen = true; remember(); gate(); doOpen(); })) return;
      if (!chosen) { gate(); return; }
      doOpen();
    });

    requestAnimationFrame(() => { el.classList.add('is-visible'); el.setAttribute('aria-hidden', 'false'); icons(); });
  }

  /* ── la clôture ── */
  let bqCloVeil = null, bqCloExpected = 0, bqClosedReport = null;
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
      bqCloVeil.id = 'bq-cloture';
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
      ['Durée du service', (durMin < 60 ? `${durMin} mn` : `${Math.floor(durMin / 60)}h${pad2(durMin % 60)}`), false, ''],
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
      if (!r) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport indisponible')); return; }
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
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Clôture non enregistrée · poste conservé. Vérifiez le stockage puis réessayez.'));
      return;
    }
    /* Émis AVANT d'effacer le poste : l'événement porte openedAt et sessionId.
       Un comptage laissé vide annonce l'attendu comme compté, écart nul. */
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
    const z = document.getElementById('bq-zsheet');
    if (z) z.classList.remove('is-open');
    toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Caisse fermée · à bientôt'));
    setTimeout(() => location.reload(), 640);
  }
  /* L'écran d'après-clôture : une décision, la trace papier. */
  function bqShowPostClose(report) {
    bqClosedReport = report;
    const L = window.KiwiCaisseLang || { t: s => s };
    const DR = window.KiwiDayReport;
    const V = DR ? DR.vocab() : { items: 'articles', cats: 'rayons', cat: 'rayon' };
    const nCat = (report.categories || []).length;
    const nItems = (report.categories || []).reduce((s, c) => s + (c.qty || 0), 0);
    const bits = [L.t(report.txns > 1 ? '{n} transactions' : '{n} transaction').replace('{n}', report.txns)];
    if (nCat) bits.push(`${nItems} ${V.items} · ${nCat} ${nCat > 1 ? V.cats : V.cat}`);
    if (report.cash && report.cash.ecart != null && Math.abs(report.cash.ecart) > 0.5) {
      bits.push(L.t(report.cash.ecart > 0 ? 'écart + {n} MAD' : 'écart − {n} MAD').replace('{n}', fmtMAD(Math.abs(report.cash.ecart)).replace(/\s*MAD$/, '')));
    }
    const z = document.createElement('div');
    z.className = 'cloture-veil is-open';
    z.id = 'bq-zsheet';
    z.setAttribute('role', 'dialog');
    z.setAttribute('aria-modal', 'true');
    z.innerHTML = `
      <div class="cloture-card zs-card">
        <div class="clo-eyebrow">${esc(L.t('Journée clôturée'))}</div>
        <div class="clo-title">${esc(L.t('Rapport journalier'))}</div>
        <div class="zs-total mono">${fmtMAD(report.net)}</div>
        <div class="clo-meta">${bits.map(bit => esc(bit)).join(' · ')}</div>
        <div class="clo-actions">
          <button class="clo-btn primary" id="bqzs-print"><img src="assets/icons/material/print.svg" width="20" height="20" alt=""><span>${esc(L.t('Imprimer le rapport'))}</span></button>
          <button class="clo-btn secondary" id="bqzs-reprint" hidden><img src="assets/icons/material/content_copy.svg" width="20" height="20" alt=""><span>${esc(L.t('Réimprimer'))}</span></button>
        </div>
        <div class="clo-foot"><button id="bqzs-skip">${esc(L.t('Continuer sans imprimer'))}</button></div>
        <div class="zs-note">${esc(L.t('Le rapport reste disponible dans le tableau de bord, section Rapport journalier · même après un rechargement ou depuis un autre appareil.'))}</div>
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
      window.KiwiPosReprint.provide('boutique', () => salesWeek().map((s) => {
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
    id: 'boutique',
    greet: {
      line1: 'Bonjour Salma,',
      em: 'bienvenue.',
      sub: 'Maison Mansour <em>·</em> boutique ouverte 10h–20h',
    },
    mount,
    onShow,
  });

export { AVOIRS, BY_EAN, CL, CLIENTES, IS_DEMO, P, RAYONS, RETAIN_DAYS, SALES, STAFF, _bqKey, activeAvoirs, assignTicketNumber, availableStock, avoirExpired, bqKitSkin, bqMoney, bqPaymentMethod, bqPaymentParts, bqPost, bqSaveProvisional, checkout, closeVeil, colorKey, creditErrorDetail, creditFromServer, creditIntent, creditRequest, findSale, firstFree, firstFreeFor, firstName, freshTicket, headSubVente, initials, issueAvoir, linePromo, lineUnit, merchantSlug, newSaleId, nextStandaloneTicketNumber, openVeil, payExistingBalance, persistAvoirs, persistDay, persistStock, promoFor, pruneTicket, pvPaired, pvReal, queueIfOffline, rebuildCatalog, recordReturn, refreshOps, refreshRemoteAvoirs, renderAll, renderBadges, retDayKey, retShiftDay, root, saleClient, salesToday, showStockIssue, sizeWord, sizesOf, stableCreditIssueId, state, stockAdd, stockOf, switchView, ticketClient, ticketCount, ticketTotals, toast, variantStock, whenLabel };
