/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/cost.js — window.KiwiCost
 * ---------------------------------------------------------------------------
 * LE COÛT DE REVIENT. Un seul résolveur, pour toute l'application.
 *
 * Avant lui, quatre écrans répondaient à « combien me coûte ce produit » et
 * aucun ne se parlait : le tableau de bord divisait par une constante de métier
 * (69 % en restauration, pour toujours et pour tout le monde), le catalogue
 * boutique lisait son propre champ, la démo portait trois barèmes contradictoires.
 * Ici, une seule question, une seule réponse, une seule façon de dire « je ne
 * sais pas ».
 *
 * ── LA RÈGLE QUI TIENT TOUT LE RESTE ───────────────────────────────────────
 * `of()` rend `null` quand le coût n'est pas connu. JAMAIS zéro, JAMAIS une
 * moyenne de métier, JAMAIS le prix de vente. Un coût inventé ne se voit pas :
 * il se propage dans la marge, dans le bénéfice, dans le rapport du jour, et le
 * commerçant fonde un changement de prix dessus. `null` remonte jusqu'à l'écran
 * et s'y affiche « non chiffré » — ce qui est désagréable, visible, et vrai.
 *
 * ── OÙ VIT LE COÛT, ET POURQUOI PAS SUR L'ARTICLE ──────────────────────────
 * Le premier réflexe est de poser `cost` sur l'article de la carte, à côté du
 * prix. C'est impossible, pour deux raisons vérifiées dans le code :
 *
 *   1. GET /api/menu SANS `?mine=1` est PUBLIC (functions/api/menu.js) — c'est
 *      ce que sert une puce NFC ou un QR de table à n'importe quel passant.
 *      Un `cost` sur l'article publierait les prix d'achat du commerçant, donc
 *      ses marges et ses fournisseurs, sur l'internet ouvert.
 *   2. Même en l'acceptant, il serait effacé. `sanitizeMenu` est une liste
 *      blanche fermée, et `pull()` réécrit la réponse du serveur PAR-DESSUS le
 *      document local (menu-catalog.js). Tout champ hors liste disparaît à la
 *      première synchro entre deux appareils — silencieusement.
 *
 * Le coût vit donc dans SON document, `costs`, privé, par établissement, à côté
 * de la carte et jamais dedans. Le seul chemin serveur est /api/store, qui
 * n'est lisible qu'authentifié.
 *
 * ── LA CHAÎNE DE RÉSOLUTION ────────────────────────────────────────────────
 *   1. une fiche technique complète   → coût du lot / rendement   src:'recipe'
 *   2. un produit boutique avec cost  → ce coût                   src:'variant'
 *   3. un coût forfaitaire saisi      → ce coût                   src:'flat'
 *   4. sinon                          → null                      src:null
 *
 * L'ordre compte : quand un patron construit une fiche technique pour un plat
 * qu'il avait chiffré à la louche, la fiche gagne, sans qu'il ait à effacer
 * l'ancien chiffre. Et AUCUN écran en aval ne change quand il passe de l'un à
 * l'autre — c'est tout l'intérêt d'avoir un résolveur plutôt que deux features.
 * (Les fiches techniques arrivent en phase 6 ; l'étage 1 est déjà là pour que
 * rien n'ait à bouger le jour où elles atterrissent.)
 *
 * ── HT OU TTC : LA QUESTION QUI FAUSSE TOUTES LES MARGES ────────────────────
 * Une vente de 100 MAD sur un coût de 60 MAD n'est PAS 40 % de marge si les
 * 100 MAD contiennent 20 % de TVA : la TVA n'appartient pas au commerçant.
 * La marge réelle est (83,33 − 60) / 83,33 = 28 %. Se tromper là surévalue
 * TOUTES les marges du produit d'environ le taux de TVA, et le commerçant
 * l'apprend de son comptable, pas de nous.
 *
 * On ne devine pas : la fiche reçu de l'établissement porte déjà la réponse
 * (KiwiReceipt.config().vat = { mode:'none'|'rate', rate, included }), et son
 * défaut est `mode:'none'` parce que beaucoup de petits commerces marocains ne
 * facturent pas la TVA. Tant que le patron ne l'a pas activée, on calcule sur
 * le prix tel qu'il est saisi et on le dit. Dès qu'elle est activée en TTC, on
 * ramène le chiffre d'affaires au HT avant de retrancher le coût.
 *
 * Charge me APRÈS venue-store.js et boutique-catalog.js, AVANT dateRange.js et
 * finance.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (!window.KiwiStore || !window.KiwiStore.define) {
    console.warn('cost.js loaded before venue-store.js');
    return;
  }

  /* ─────────────────────────── le document ─────────────────────────── */
  /* `items` est une CARTE id → { cost, at, by } et non un tableau : le coût se
   * lit article par article, des centaines de fois par rendu du tableau de bord,
   * et un tableau imposerait un balayage à chaque ligne de chaque vente.
   *
   * `at` (quand le chiffre a été saisi) n'est pas décoratif : un prix d'achat
   * de farine saisi il y a onze mois n'est plus un prix d'achat, c'est un
   * souvenir. C'est ce qui permettra de dire « ce coût date » au lieu de le
   * présenter comme frais. */
  const blank = () => ({ items: {}, ingredients: [], recipes: {}, charges: [], targets: {}, seq: 0 });

  const store = window.KiwiStore.define('costs', {
    /* Le miroir serveur. Tant que functions/api/store.js n'a pas `costs` dans sa
     * liste blanche, le serveur refuse le document et il reste purement local —
     * c'est le fail-soft documenté dans venue-store.js, et c'est la raison pour
     * laquelle cette phase peut partir sans attendre un déploiement. */
    cloud: 'costs',
    blank,
    isEmpty: (d) => !d || (!Object.keys(d.items || {}).length
                        && !(d.charges || []).length
                        && !Object.keys(d.recipes || {}).length),
    /* Deux appareils qui chiffrent la même carte en même temps : on garde les
     * DEUX jeux de coûts, et pour un article touché des deux côtés, le plus
     * récemment saisi. Écraser par « le mien gagne » ferait perdre une soirée
     * de saisie au patron qui a chiffré sur l'iPad pendant que sa femme
     * chiffrait sur le portable. */
    merge: (mine, theirs) => {
      const out = Object.assign({}, theirs || {}, mine || {});
      const a = (mine && mine.items) || {};
      const b = (theirs && theirs.items) || {};
      const items = Object.assign({}, b);
      Object.keys(a).forEach((id) => {
        const x = a[id]; const y = b[id];
        items[id] = (!y || (+x.at || 0) >= (+y.at || 0)) ? x : y;
      });
      out.items = items;
      const ra = (mine && mine.recipes) || {};
      const rb = (theirs && theirs.recipes) || {};
      const recipes = Object.assign({}, rb);
      Object.keys(ra).forEach((id) => {
        const x = ra[id]; const y = rb[id];
        recipes[id] = (!y || (+x.at || 0) >= (+y.at || 0)) ? x : y;
      });
      out.recipes = recipes;
      return out;
    },
  });

  const subs = new Set();
  function notify() { subs.forEach((fn) => { try { fn(); } catch (_) {} }); }
  store.subscribe(() => notify());

  const num = (v) => { const n = +v; return Number.isFinite(n) && n >= 0 ? n : null; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

  /* ─────────────────────────── la base TVA ─────────────────────────── */
  /* `mode` dit à l'écran quelle phrase écrire sous les chiffres. On ne rend
   * jamais un taux que le commerçant n'a pas activé lui-même. */
  function basis() {
    let v = null;
    try {
      const cfg = window.KiwiReceipt && window.KiwiReceipt.config && window.KiwiReceipt.config();
      v = cfg && cfg.vat;
    } catch (_) { v = null; }
    if (!v || v.mode !== 'rate') return { mode: 'none', rate: 0, included: false };
    const rate = +v.rate || 0;
    if (!(rate > 0)) return { mode: 'none', rate: 0, included: false };
    return { mode: 'rate', rate, included: v.included !== false };
  }
  /* Le chiffre d'affaires sur lequel une marge se calcule. TTC ⇒ on retire la
   * TVA ; HT ou pas de TVA ⇒ le montant est déjà le bon. */
  function netOf(amount, b) {
    const bb = b || basis();
    const a = +amount || 0;
    if (bb.mode !== 'rate' || !bb.included) return a;
    return a / (1 + bb.rate / 100);
  }

  /* ─────────────────────── le catalogue boutique ─────────────────────── */
  /* Relu à chaque appel de coverage(), pas à chaque ligne : le catalogue d'une
   * boutique tient quelques centaines de produits et une vente en touche trois. */
  function shopIndex() {
    const byId = new Map(); const byName = new Map();
    try {
      const cat = window.KiwiBoutiqueCatalog;
      if (!cat) return { byId, byName };
      const key = window.KiwiBoutiqueVenueKey && window.KiwiBoutiqueVenueKey();
      if (key) cat.use(key);
      (cat.listProducts({ includeArchived: true }) || []).forEach((p) => {
        if (!p) return;
        if (p.id) byId.set(String(p.id), p);
        const n = norm(p.name);
        /* Premier arrivé gagne : deux produits homonymes ne peuvent pas être
         * départagés par un nom, et prendre le dernier serait aussi arbitraire
         * que prendre le premier — mais au moins c'est stable d'un rendu à l'autre. */
        if (n && !byName.has(n)) byName.set(n, p);
      });
    } catch (_) {}
    return { byId, byName };
  }

  /* ──────────────────────── le carnet de la carte ──────────────────────── */
  /* `KiwiMenuStore.items()`, pas `.get()` : le module n'expose pas son document
   * brut (voir la fin de menu-catalog.js). Le try/catch qui entoure ça a déjà
   * masqué l'erreur une fois — le repli par nom rendait silencieusement « non
   * chiffré » sur tout l'historique d'un patron qui venait de chiffrer sa
   * carte. Un catch qui avale une faute de frappe d'API ne protège personne. */
  function menuIndex() {
    const byId = new Map(); const byName = new Map();
    try {
      const M = window.KiwiMenuStore;
      const list = (M && typeof M.items === 'function' && M.items()) || [];
      list.forEach((it) => {
        if (!it) return;
        if (it.id) byId.set(String(it.id), it);
        const n = norm(it.name);
        if (n && !byName.has(n)) byName.set(n, it);
      });
    } catch (_) {}
    return { byId, byName };
  }

  /* ═════════════════════════════ of() ═════════════════════════════
   * ref = { kind:'menu'|'shop'|'', id, name }
   * Rend { mad, src, at } — `mad` null quand rien n'est connu. */
  function of(ref, ctx) {
    const r = ref || {};
    const d = ctx && ctx.doc ? ctx.doc : store.get();
    const id = r.id ? String(r.id) : '';

    // 1 · fiche technique (phase 6 — le crochet existe, le moteur viendra)
    const rec = id && d.recipes ? d.recipes[id] : null;
    if (rec && rec.status === 'complete') {
      const c = recipeCost(rec, d);
      if (c != null) return { mad: r2(c), src: 'recipe', at: +rec.at || 0 };
    }

    // 2 · le prix d'achat d'un produit boutique, déjà saisi et déjà synchronisé
    if (r.kind !== 'menu') {
      const shop = (ctx && ctx.shop) || shopIndex();
      const p = (id && shop.byId.get(id)) || (r.name ? shop.byName.get(norm(r.name)) : null);
      const c = p ? num(p.cost) : null;
      if (c != null && c > 0) return { mad: r2(c), src: 'variant', at: 0 };
    }

    // 3 · le coût forfaitaire, tapé par le patron dans sa carte
    let flat = id && d.items ? d.items[id] : null;
    if (!flat && r.name) {
      /* Repli par NOM. Une vente d'avant la phase 5 ne porte pas l'identifiant
       * de l'article — seulement son libellé. Sans ce repli, un commerçant qui
       * a chiffré toute sa carte verrait quand même « non chiffré » sur tout son
       * historique, et conclurait que la saisie n'a servi à rien. */
      const menu = (ctx && ctx.menu) || menuIndex();
      const hit = menu.byName.get(norm(r.name));
      if (hit && hit.id && d.items) flat = d.items[hit.id];
    }
    const fc = flat ? num(flat.cost) : null;
    if (fc != null && fc > 0) return { mad: r2(fc), src: 'flat', at: +flat.at || 0 };

    // 4 · on ne sait pas, et on le dit.
    return { mad: null, src: null, at: 0 };
  }

  /* Coût d'une fiche technique. Rend null dès qu'UN ingrédient manque : une
   * fiche à moitié chiffrée qui rendrait un coût partiel serait pire qu'aucune
   * — elle donnerait une marge trop belle, avec l'air d'être mesurée. */
  function recipeCost(rec, d, depth) {
    if (!rec || !Array.isArray(rec.lines) || !rec.lines.length) return null;
    if ((depth || 0) > 3) return null;              // garde-fou anti-boucle
    const ing = new Map();
    (d.ingredients || []).forEach((x) => { if (x && x.id) ing.set(String(x.id), x); });
    let sum = 0;
    for (const ln of rec.lines) {
      if (!ln) return null;
      if (ln.sub) {
        const sr = d.recipes && d.recipes[String(ln.sub)];
        if (!sr || sr.status !== 'complete') return null;
        const c = recipeCost(sr, d, (depth || 0) + 1);
        if (c == null) return null;
        sum += c * (+ln.qty || 0);
        continue;
      }
      const g = ing.get(String(ln.ing));
      const unit = g ? num(g.useCost) : null;
      if (unit == null) return null;
      sum += unit * (+ln.qty || 0);
    }
    const y = +rec.yield || 1;
    return y > 0 ? sum / y : null;
  }

  /* ═══════════════════════════ coverage() ═══════════════════════════
   * « Sur quelle part de mon chiffre d'affaires cette marge est-elle calculée ? »
   *
   * C'est LA donnée qui rend le reste croyable. Un chiffre partiel que le
   * commerçant sait partiel se lit et se corrige ; un chiffre complet en
   * apparence qui s'avère partiel détruit la confiance dans tout l'écran. Les
   * grandes plateformes échouent exactement là : elles écartent les articles non
   * chiffrés sans le dire, et le patron découvre le trou en constatant que deux
   * rapports se contredisent.
   *
   * Trois montants, jamais un seul :
   *   revenue        — tout ce qui est entré en caisse sur la période
   *   revenueDetailed— la part dont on connaît le détail article
   *   revenueCosted  — la part dont on connaît AUSSI le coût
   * La marge ne se calcule que sur la troisième. */
  function coverage(sales, from, to) {
    const doc = store.get();
    const ctx = { doc, shop: shopIndex(), menu: menuIndex() };
    const b = basis();
    let revenue = 0, revenueDetailed = 0, revenueCosted = 0, cost = 0;
    const missing = new Map();

    (sales || []).forEach((e) => {
      if (!e) return;
      const ts = +e.ts || 0;
      if (from != null && ts < from) return;
      if (to != null && ts >= to) return;
      const amt = Math.max(0, +e.amount || 0);
      if (!amt) return;
      revenue += amt;

      const lines = Array.isArray(e.lines) ? e.lines : null;
      if (!lines || !lines.length) return;          // panier inconnu : compté au CA, pas à la marge

      /* Le total du panier peut différer du montant encaissé : une remise de
       * table baisse le montant sans toucher les lignes. On répartit l'écart au
       * prorata plutôt que d'ignorer la remise — sinon la marge d'une journée
       * de promotions serait systématiquement surévaluée. */
      let gross = 0;
      lines.forEach((l) => { gross += Math.max(0, +(l && l.total) || 0); });
      const ratio = gross > 0 ? Math.min(1, amt / gross) : 1;

      lines.forEach((l) => {
        if (!l) return;
        const qty = Math.max(0, +l.qty || 0);
        const tot = Math.max(0, +l.total || 0) * ratio;
        if (!qty || !tot) return;
        revenueDetailed += tot;

        /* Le coût GELÉ sur la ligne au moment de la vente gagne toujours sur le
         * résolveur : c'est ce qui empêche une correction de prix d'achat de
         * réécrire le bénéfice de mars. Absent (toutes les ventes d'avant la
         * phase 5), on retombe sur le coût d'aujourd'hui. */
        const frozen = num(l.unitCost);
        const hit = frozen != null && frozen > 0
          ? { mad: frozen, src: 'frozen' }
          : of({ kind: l.kind || '', id: l.id || '', name: l.name || '' }, ctx);

        if (hit.mad == null) {
          const key = norm(l.name) || '?';
          const m = missing.get(key) || { name: l.name || '', revenue: 0, units: 0, id: l.id || '' };
          m.revenue += tot; m.units += qty;
          missing.set(key, m);
          return;
        }
        revenueCosted += tot;
        cost += hit.mad * qty;
      });
    });

    const netCosted = netOf(revenueCosted, b);
    return {
      revenue: r2(revenue),
      revenueDetailed: r2(revenueDetailed),
      revenueCosted: r2(revenueCosted),
      /* La marge se dit toujours sur une base HORS TAXE quand la TVA est
       * activée en TTC — sinon elle est surévaluée d'environ le taux. */
      netCosted: r2(netCosted),
      cost: r2(cost),
      profit: r2(netCosted - cost),
      marginPct: netCosted > 0 ? r2(((netCosted - cost) / netCosted) * 100) : null,
      pctDetailed: revenue > 0 ? r2((revenueDetailed / revenue) * 100) : null,
      pctCosted: revenue > 0 ? r2((revenueCosted / revenue) * 100) : null,
      basis: b,
      /* Trié par ce que ça coûte de ne pas le savoir : le patron chiffre ses
       * gros vendeurs d'abord et la couverture bouge tout de suite. Une liste
       * alphabétique le ferait commencer par « Amlou » et abandonner. */
      missing: Array.from(missing.values()).sort((a, c) => c.revenue - a.revenue),
    };
  }

  /* ───────────────────────────── écriture ───────────────────────────── */
  /* mad null ou 0 ⇒ on EFFACE l'entrée. « 0 » ne veut pas dire « gratuit », il
   * veut dire « je ne sais pas encore » — et un 0 conservé rendrait 100 % de
   * marge, exactement le chiffre inventé qu'on cherche à supprimer. */
  function setItemCost(itemId, mad, who) {
    const id = String(itemId || ''); if (!id) return null;
    return store.update((d) => {
      d.items = d.items || {};
      const c = num(mad);
      if (c == null || c <= 0) delete d.items[id];
      else d.items[id] = { cost: r2(c), at: Date.now(), by: String(who || '') };
      return d;
    });
  }
  function itemCost(itemId) {
    const e = store.get().items[String(itemId || '')];
    return e ? num(e.cost) : null;
  }

  /* La marge d'un article, à l'unité. Sert la ligne vivante sous le champ de
   * saisie et la colonne du tableau. Rend null — jamais 0, jamais 100 — dès
   * qu'il manque le prix ou le coût. */
  function marginOf(price, cost) {
    const p = num(price); const c = num(cost);
    if (p == null || c == null || !(p > 0) || !(c > 0)) return null;
    const net = netOf(p, basis());
    if (!(net > 0)) return null;
    return { net: r2(net), profit: r2(net - c), pct: r2(((net - c) / net) * 100) };
  }

  /* Les articles de la carte qui n'ont pas de coût, du plus vendu au moins
   * vendu. C'est la file de travail du patron : finie, ordonnée par impact. */
  function listMissing(sales, from, to) {
    return coverage(sales, from, to).missing;
  }

  window.KiwiCost = {
    of, coverage, marginOf, basis, netOf,
    setItemCost, itemCost, listMissing,
    doc: () => store.get(),
    store,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
})();
