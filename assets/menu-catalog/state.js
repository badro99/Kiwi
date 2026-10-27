/* Menu state. Exports: store, catById, itemById, itemsIn, stationsOf, stationById, cleanFormula, kitchenIdOf, ensureKitchen, optsOf, optById, OPT_EMOJIS, cleanOptEmoji, saveFormulaTemplate, deleteFormulaTemplate, addStation, renameStation, cycleStationColor, moveStation, deleteStation, setCategoryStation, addOptGroup, updateOptGroup, deleteOptGroup, addOptChoice, updateOptChoice, deleteOptChoice, setItemOpts, addCategory, renameCategory, moveCategory, deleteCategory, addSubcategory, renameSubcategory, deleteSubcategory, addItem, updateItem, setI18n, setI18nEntry, clearI18n, setLanguages, MI, promosOf, savePromo, deletePromo, deleteItem, publish, boot.
 * Reads injected: rules, tr, T, STATION_COLORS, render, registerHandlers, createFormulas. Window reads are declared in split.json. */
(function (parts) {
  parts.state = function (context) {
    'use strict';
    const { rules, tr, T, STATION_COLORS, render, registerHandlers, createFormulas } = context;
  function example() {
    return {
      seq: 20,
      /* Trois postes, parce que c'est la découpe la plus banale d'une cuisine
       * marocaine : le feu, le froid, et la machine à café. La cuisine vient en
       * tête et c'est elle le repli (kitchenId) — les deux autres ne reçoivent
       * que ce qu'une catégorie leur envoie. Le patron renomme, ajoute,
       * supprime : l'exemple n'est qu'un point de départ. */
      kitchenId: 'st_1',
      stations: [
        { id: 'st_1', name: 'Cuisson', color: STATION_COLORS[0] },
        { id: 'st_2', name: 'Froid', color: STATION_COLORS[1] },
        { id: 'st_3', name: 'Bar', color: STATION_COLORS[3] },
      ],
      /* Le routage, en quatre lignes : les entrées au froid, les boissons au
       * bar, le reste en cuisine. C'est exactement le geste qu'on demande au
       * patron — une phrase par catégorie, et plus jamais plat par plat. */
      cats: [
        { id: 'cat_1', name: 'Entrées', station: 'st_2', sub: [] },
        { id: 'cat_2', name: 'Plats', station: '', sub: [{ id: 'sub_1', name: 'Tajines' }, { id: 'sub_2', name: 'Grillades' }] },
        { id: 'cat_3', name: 'Boissons', station: 'st_3', sub: [{ id: 'sub_3', name: 'Chaudes' }, { id: 'sub_4', name: 'Fraîches' }] },
        { id: 'cat_4', name: 'Desserts', station: 'st_2', sub: [] },
      ],
      items: [
        { id: 'it_1', name: 'Salade marocaine', price: 32, catId: 'cat_1', subId: null, desc: 'Tomate, concombre, oignon, huile d\'olive', avail: true },
        { id: 'it_2', name: 'Harira', price: 28, catId: 'cat_1', subId: null, desc: 'Soupe pois chiches & lentilles', avail: true },
        { id: 'it_3', name: 'Tajine poulet citron', price: 95, catId: 'cat_2', subId: 'sub_1', desc: 'Poulet, olives, citron confit', avail: true },
        { id: 'it_4', name: 'Tajine kefta œuf', price: 85, catId: 'cat_2', subId: 'sub_1', desc: 'Viande hachée, œuf, tomate', avail: true },
        { id: 'it_5', name: 'Brochettes mixtes', price: 90, catId: 'cat_2', subId: 'sub_2', desc: 'Bœuf, poulet, merguez, frites', avail: true },
        { id: 'it_6', name: 'Thé à la menthe', price: 12, catId: 'cat_3', subId: 'sub_3', desc: 'Gunpowder, menthe fraîche', avail: true },
        { id: 'it_7', name: 'Café noir', price: 12, catId: 'cat_3', subId: 'sub_3', desc: 'Espresso', avail: true },
        { id: 'it_8', name: 'Orange pressée', price: 18, catId: 'cat_3', subId: 'sub_4', desc: 'Pressée minute', avail: true },
        { id: 'it_9', name: 'Msemen miel', price: 14, catId: 'cat_4', subId: null, desc: 'Crêpe feuilletée, beurre, miel', avail: true },
      ],
    };
  }

  const store = window.KiwiStore.define('menu', {
    blank: () => ({ seq: 0, cats: [], items: [], stations: [], kitchenId: '', opts: [], formulaTemplates: [] }),
    example: example,
    /* Des postes seuls ne font pas une carte : un établissement qui n'a saisi
     * que « Bar » et « Cuisson » n'a toujours rien à vendre, et l'écran d'accueil
     * doit continuer de le lui dire. */
    isEmpty: (d) => !d || (!(d.cats && d.cats.length) && !(d.items && d.items.length)),
  });

  /* ───────────────── data ops ───────────────── */
  function nid(d, prefix) { const next = rules.nextId(d.seq, prefix); d.seq = next.seq; return next.id; }
  const { catById, itemById, itemsIn, stationsOf, stationById } = rules;

  /* Une formule compose des choix parmi des articles existants de la carte.
   * RÈGLE DE LECTURE : un choix qui pointe un article supprimé est retiré dès
   * la lecture (pas de fantôme sélectionnable pour le serveur). */
  /* MÊMES RÈGLES que sanitizeFormula dans functions/api/menu.js, qui relit la
   * formule à la publication : identifiant d'étape, libellé rogné à 60, bornes,
   * supplément arrondi au centime, choix limité aux articles présents et non
   * archivés. tools/menu-properties-test.mjs passe les deux sur les mêmes
   * cartes générées : une règle changée d'un seul côté le fait rougir. */
  const cleanFormula = rules.cleanFormula;





  /* ─── postes de préparation ───
   * LE ROUTAGE VIT SUR LA CATÉGORIE. « Boissons → Bar » se dit une fois et vaut
   * pour les boissons d'aujourd'hui comme pour celles de l'année prochaine ;
   * affecter les plats un par un, c'est un travail qui ne finit jamais et qu'on
   * oublie à chaque ajout.
   *
   * Et il n'y a plus de « premier de la liste = poste par défaut ». Cette règle
   * faisait de l'ORDRE un réglage : monter le Bar d'un cran, et toute la carte
   * non affectée partait au bar sans que rien ne le dise. Le repli est nommé —
   * la cuisine — il existe dès le premier jour, il ne se supprime pas, et
   * l'ordre ne sert plus qu'aux onglets de l'écran cuisine.
   *
   * La couleur est un repère de lecture, pas une décoration : elle se retrouve
   * à l'identique sur la pastille de l'écran cuisine. */

  /* La cuisine, telle qu'elle est. `d.kitchenId` la nomme ; à défaut on retombe
   * sur le premier poste, ce qui redonne EXACTEMENT l'ancien comportement pour
   * une carte écrite avant ce changement — personne ne voit son routage bouger
   * le jour de la mise à jour. */
  const kitchenIdOf = rules.kitchenIdOf;

  /* Appelée dès qu'on touche aux postes ou au routage : la cuisine se crée sans
   * rien demander (le patron n'a pas à déclarer que sa cuisine existe), et le
   * repli implicite d'hier devient explicite.
   *
   * Reprise des affectations par plat : la version précédente les posait sur le
   * plat. On les remonte à leur catégorie quand elles y sont unanimes — le
   * patron qui avait pris le temps d'envoyer ses boissons au bar les retrouve
   * routées, sans avoir rien à refaire. En cas de désaccord dans une même
   * catégorie on ne tranche pas : deviner reviendrait à détourner des plats en
   * silence, et la catégorie part simplement en cuisine. */
  function ensureKitchen(d) {
    d.stations = stationsOf(d);
    if (!d.stations.length) {
      d.stations.push({ id: nid(d, 'st'), name: tr(T.kitchenNm), color: STATION_COLORS[0] });
    }
    d.kitchenId = kitchenIdOf(d);
    const known = (id) => !!id && d.stations.some((s) => s && s.id === id);
    (d.cats || []).forEach((c) => {
      if (!c) return;
      // Un poste supprimé ne doit pas laisser une catégorie pointer dans le vide.
      if (c.station && !known(c.station)) c.station = '';
      // Déjà réglée une fois — « en cuisine » EST un réglage. On n'y revient pas :
      // la reprise ci-dessous ne doit jamais écraser un choix du patron.
      if ('station' in c) return;
      const found = (d.items || []).reduce((acc, it) => {
        if (acc === false || !it || it.catId !== c.id) return acc;
        const s = known(it.station) ? it.station : '';
        if (!s) return acc;
        return acc === null ? s : (acc === s ? acc : false);
      }, null);
      c.station = (found && found !== d.kitchenId) ? found : '';
    });
    return d;
  }
  /* Le seul geste de routage de toute la carte. '' = la cuisine, et c'est un
   * choix qu'on écrit comme les autres — pas une case laissée vide. */
  function setCategoryStation(catId, stationId) {
    return store.update((d) => {
      ensureKitchen(d);
      const c = catById(d, catId); if (!c) return d;
      const ok = stationId && d.stations.some((s) => s && s.id === stationId);
      c.station = (ok && stationId !== d.kitchenId) ? String(stationId) : '';
      return d;
    });
  }
  function addStation(name) {
    return store.update((d) => {
      // Le premier poste ajouté n'est jamais le premier poste tout court : la
      // cuisine naît avant lui, sinon « Bar » deviendrait le repli de la carte.
      ensureKitchen(d);
      const nm = String(name || '').trim() || tr(T.stationNm);
      d.stations.push({ id: nid(d, 'st'), name: nm, color: STATION_COLORS[d.stations.length % STATION_COLORS.length] });
      return d;
    });
  }
  function renameStation(id, name) {
    return store.update((d) => { const s = stationById(d, id); if (s) s.name = String(name || s.name).trim() || s.name; return d; });
  }
  function cycleStationColor(id) {
    return store.update((d) => {
      const s = stationById(d, id); if (!s) return d;
      const i = STATION_COLORS.indexOf(s.color);
      s.color = STATION_COLORS[(i + 1) % STATION_COLORS.length];
      return d;
    });
  }
  function moveStation(id, delta) {
    return store.update((d) => {
      d.stations = stationsOf(d);
      const i = d.stations.findIndex((s) => s && s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.stations.length) return d;
      const [s] = d.stations.splice(i, 1);
      d.stations.splice(j, 0, s);
      return d;
    });
  }
  /* La cuisine ne se supprime pas : c'est le repli, et un repli qu'on peut
   * effacer n'en est pas un. Pour les autres, supprimer ne doit pas laisser une
   * catégorie pointer vers un poste disparu — la caisse l'enverrait dans un
   * filtre que personne ne regarde. Elle rentre en cuisine, en une écriture. */
  function deleteStation(id) {
    return store.update((d) => {
      ensureKitchen(d);
      if (!id || id === d.kitchenId) return d;
      d.stations = d.stations.filter((s) => s && s.id !== id);
      (d.cats || []).forEach((c) => { if (c && c.station === id) c.station = ''; });
      return d;
    });
  }

  /* ─── options et suppléments ───
   * Un GROUPE se définit une fois pour toute la carte (« Type de lait »,
   * « Cuisson ») et s'attache aux produits qui le demandent. C'est la même
   * leçon que le poste sur la catégorie : une phrase dite une fois vaut mieux
   * que la même phrase répétée sur douze cafés, et surtout que la treizième
   * qu'on oubliera.
   *
   * `kind` : 'one' (une seule réponse — la cuisson d'une viande) ou 'many'
   * (autant qu'on veut — les suppléments). `required` dit au comptoir qu'il ne
   * peut pas ajouter le produit sans réponse : une entrecôte sans cuisson n'est
   * pas une commande, c'est une question posée au cuisinier.
   *
   * Un choix peut porter un supplément (`price`, en MAD, 0 = compris). */
  const { optsOf, optById, OPT_EMOJIS, cleanOptEmoji } = rules;

  function addOptGroup(name) {
    return store.update((d) => {
      d.opts = optsOf(d);
      d.opts.push(rules.normalizeGroup(name, nid(d, 'og'), tr(T.optNm)));
      return d;
    });
  }
  function updateOptGroup(id, patch) {
    return store.update((d) => {
      const g = optById(d, id); if (!g) return d;
      Object.assign(g, rules.patchGroup(g, patch));
      return d;
    });
  }
  /* Supprimer un groupe le retire AUSSI des produits qui le portaient : un
   * produit qui pointe un groupe disparu demanderait au comptoir un choix que
   * personne ne peut faire, et bloquerait la vente. */
  function deleteOptGroup(id) {
    return store.update((d) => {
      d.opts = optsOf(d).filter((g) => g && g.id !== id);
      (d.items || []).forEach((it) => {
        if (it && Array.isArray(it.opts)) it.opts = it.opts.filter((x) => x !== id);
      });
      return d;
    });
  }
  function addOptChoice(gid, name, price, emoji) {
    return store.update((d) => {
      const g = optById(d, gid); if (!g) return d;
      g.choices = Array.isArray(g.choices) ? g.choices : [];
      g.choices.push(rules.normalizeChoice(name, price, emoji, nid(d, 'oc'), tr(T.optChNm)));
      return d;
    });
  }
  function updateOptChoice(gid, cid, patch) {
    return store.update((d) => {
      const g = optById(d, gid); if (!g) return d;
      const c = (g.choices || []).find((x) => x && x.id === cid); if (!c) return d;
      if (patch.name != null) c.name = String(patch.name).trim() || c.name;
      if (patch.price != null) c.price = rules.normalizeChoice(c.name, patch.price, c.emoji, c.id, c.name).price;
      if (patch.emoji != null) c.emoji = cleanOptEmoji(patch.emoji);
      return d;
    });
  }
  function deleteOptChoice(gid, cid) {
    return store.update((d) => {
      const g = optById(d, gid); if (!g) return d;
      g.choices = (g.choices || []).filter((c) => c && c.id !== cid);
      return d;
    });
  }
  /* Les groupes portés par un produit, dans l'ordre de la carte — le comptoir
   * les posera dans cet ordre. Un identifiant qui ne correspond plus à rien est
   * écarté ici plutôt que de faire échouer la vente au comptoir. */
  function setItemOpts(itemId, ids) {
    return store.update((d) => {
      const it = itemById(d, itemId); if (!it) return d;
      const want = Array.isArray(ids) ? ids : [];
      it.opts = optsOf(d).filter((g) => want.indexOf(g.id) >= 0).map((g) => g.id);
      return d;
    });
  }

  function addCategory(name) {
    return store.update((d) => {
      // Une catégorie neuve part en cuisine — explicitement, pas par omission.
      const c = rules.normalizeCategory(name, nid(d, 'cat'), tr(T.catName));
      d.cats.push(c);
      return d;
    });
  }
  function renameCategory(id, name) {
    return store.update((d) => { const c = catById(d, id); if (c) c.name = String(name || c.name).trim() || c.name; return d; });
  }
  function moveCategory(id, delta) {
    return store.update((d) => {
      d.cats = Array.isArray(d.cats) ? d.cats : [];
      const i = d.cats.findIndex((c) => c && c.id === id);
      const j = i + (+delta || 0);
      if (i < 0 || j < 0 || j >= d.cats.length) return d;
      const [category] = d.cats.splice(i, 1);
      d.cats.splice(j, 0, category);
      return d;
    });
  }
  function deleteCategory(id) {
    const next = store.update((d) => {
      d.cats = (d.cats || []).filter((c) => c.id !== id);
      d.items = (d.items || []).filter((i) => i.catId !== id);
      return d;
    });
    authorizeExplicitEmpty(next);
    return next;
  }
  function addSubcategory(catId, name) {
    return store.update((d) => {
      const c = catById(d, catId); if (!c) return d;
      c.sub = c.sub || [];
      c.sub.push({ id: nid(d, 'sub'), name: String(name || tr(T.subName)).trim() || tr(T.subName) });
      return d;
    });
  }
  function renameSubcategory(catId, subId, name) {
    return store.update((d) => {
      const c = catById(d, catId); if (!c) return d;
      const s = (c.sub || []).find((x) => x && x.id === subId); if (!s) return d;
      s.name = String(name || s.name).trim() || s.name;
      return d;
    });
  }
  /* Removing a subsection must not remove products. They remain in their section
   * as unclassified items so the merchant can move them or create a new grouping. */
  function deleteSubcategory(catId, subId) {
    return store.update((d) => {
      const c = catById(d, catId); if (!c) return d;
      c.sub = (c.sub || []).filter((s) => s && s.id !== subId);
      (d.items || []).forEach((it) => {
        if (it && it.catId === catId && it.subId === subId) it.subId = null;
      });
      return d;
    });
  }
  function addItem(data) {
    return store.update((d) => {
      const item = rules.normalizeItem(data, d, nid(d, 'it'), tr(T.productDefault));
      d.items.push(item);
      return d;
    });
  }
  function updateItem(id, patch) {
    return store.update((d) => {
      const it = itemById(d, id); if (!it) return d;
      const next = rules.patchItem(it, patch, d.items);
      if (!('formula' in next)) delete it.formula;
      if (!('nutrition' in next)) delete it.nutrition;
      Object.assign(it, next);
      if ('archived' in patch) {
        (d.items || []).forEach((candidate) => {
          if (!candidate || !candidate.formula) return;
          const cleaned = cleanFormula(candidate.formula, d.items);
          if (cleaned) candidate.formula = cleaned;
          else delete candidate.formula;
        });
        (d.formulaTemplates || []).forEach((template) => {
          if (!template || !template.formula) return;
          const cleaned = cleanFormula(template.formula, d.items);
          if (cleaned) template.formula = cleaned;
          else template.formula = { slots: [] };
        });
      }
      return d;
    });
  }
  /* ───────────────── traductions (assets/menu-i18n.js) ─────────────────
   * Les traductions vivent SUR les entités (cat.i18n, item.i18n, …), jamais à
   * la place du libellé canonique. Le store ne traduit rien lui-même : le
   * workspace demande à Kiwi AI ce qui manque (KiwiMenuI18n.needs) et dépose
   * la réponse ici (setI18n) ; une correction du patron passe par setI18nEntry
   * et n'est plus jamais écrasée par la machine. Écrire dans le store suffit à
   * republier la carte (boot() → schedulePublish). */
  const MI = () => window.KiwiMenuI18n || null;
  function setI18n(lang, res, opts) {
    const m = MI(); if (!m) return 0;
    let n = 0;
    store.update((d) => { n = m.apply(d, lang, res, opts || {}); return d; });
    return n;
  }
  function i18nTarget(d, kind, id, subId) {
    if (kind === 'cat') return catById(d, id);
    if (kind === 'sub') { const c = catById(d, id); return c ? (c.sub || []).find((s) => s.id === subId) || null : null; }
    if (kind === 'item') return itemById(d, id);
    if (kind === 'opt') return optById(d, id);
    if (kind === 'choice') { const g = optById(d, id); return g ? (g.choices || []).find((c) => c.id === subId) || null : null; }
    return null;
  }
  function setI18nEntry(kind, id, subId, lang, patch) {
    const m = MI(); if (!m) return false;
    let okFlag = false;
    store.update((d) => {
      const e = i18nTarget(d, kind, id, subId);
      if (!e) return d;
      const cur = (e.i18n && e.i18n[lang]) || {};
      // Une description corrigée sans nom traduit garde le nom du patron : la correction n'est pas perdue.
      const name = patch && patch.name != null ? patch.name : (cur.name || e.name);
      const desc = patch && patch.desc != null ? patch.desc : (cur.desc != null ? cur.desc : null);
      okFlag = m.setManual(e, lang, name, desc);
      return d;
    });
    return okFlag;
  }
  function clearI18n(lang, keepManual) {
    const m = MI(); if (!m) return;
    store.update((d) => { m.clear(d, lang, keepManual); return d; });
  }
  function setLanguages(next) {
    const m = MI();
    store.update((d) => { d.langs = m ? m.langs({ langs: next }) : ['fr', 'ar', 'en']; return d; });
  }
  /* ───────────────── promotions (assets/menu-promos.js) ─────────────────
   * Une promotion est une règle posée sur la carte (« −20 % sur les boissons »).
   * Elle part avec la carte publiée ; le serveur la revalide
   * (functions/api/menu.js) et l'applique lui-même à chaque commande
   * (priceOrder). Ici on ne fait que la ranger, passée au même filtre. */
  const promosOf = (d) => {
    const P = window.KiwiMenuPromos;
    return P ? P.sanitize(d && d.promos, d) : ((d && Array.isArray(d.promos)) ? d.promos : []);
  };
  function savePromo(p) {
    let savedId = '';
    store.update((d) => {
      const list = Array.isArray(d.promos) ? d.promos.slice() : [];
      const id = (p && p.id) || nid(d, 'promo');
      const i = list.findIndex((x) => x && x.id === id);
      const next = Object.assign({}, i >= 0 ? list[i] : { createdAt: Date.now() }, p, { id });
      if (i >= 0) list[i] = next; else list.push(next);
      d.promos = promosOf(Object.assign({}, d, { promos: list }));
      if (d.promos.some((x) => x.id === id)) savedId = id;
      if (!d.promos.length) delete d.promos;
      return d;
    });
    return savedId;
  }
  function deletePromo(id) {
    return store.update((d) => {
      d.promos = (Array.isArray(d.promos) ? d.promos : []).filter((x) => x && x.id !== id);
      if (!d.promos.length) delete d.promos;
      return d;
    });
  }
  function deleteItem(id) {
    const next = store.update((d) => {
      d.items = (d.items || []).filter((i) => i.id !== id);
      (d.items || []).forEach((it) => {
        if (it && it.formula) {
          const cleaned = cleanFormula(it.formula, d.items);
          if (cleaned) it.formula = cleaned;
          else delete it.formula;
        }
      });
      return d;
    });
    authorizeExplicitEmpty(next);
    return next;
  }

  /* ───────────────── styles ───────────────── */


  function isCustom() { const KV = window.KiwiVenue; return !!(KV && KV.isCustom && KV.isCustom()); }

  /* ───────────────── publish to the customer QR page (real merchants only) ───
   * The customer self-order page (kiwi-order.html) runs on the diner's own phone
   * — it can't read this localStorage record. So a real, signed-in merchant
   * mirrors its carte up to the server (POST /api/menu; the server derives the
   * merchant from the session, we only send the data). GET /api/menu?merchant=
   * <slug> then serves it to the customer. Gated to KiwiEnv.isReal() so the local
   * pitch demo never makes a network call and stays byte-identical; fail-soft so
   * a static host (GitHub Pages) or offline just no-ops. Debounced so a burst of
   * edits publishes once. */
  function isRealSession() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; }
  }
  /* A boutique has no carte. It publishes STOCK to the same row, through
   * assets/orderpro-publish.js — so if this published too, its empty
   * { cats:[], items:[] } would land as type='boutique', the server would run
   * the boutique sanitizer over it, and the shop's real products would be
   * overwritten with nothing. The two publishers share one row; this one owns
   * restaurants, the other owns boutiques. Server type wins, same precedence as
   * orderpro-publish.js, so a stale local key can't misroute the decision. */
  const BOUTIQUE_TRADES = ['boutique', 'pret-a-porter', 'pretaporter', 'mode', 'friperie',
                           'chaussures', 'maroquinerie', 'bijouterie', 'concept-store',
                           'sport', 'vetement', 'habillement'];
  function isBoutiqueVenue(vd) {
    let serverType = '';
    try { serverType = (window.KiwiConfig && window.KiwiConfig.type) || ''; } catch (_) {}
    const raw = String(serverType || (vd && (vd.subtype || vd.type)) || '').toLowerCase();
    return !!raw && BOUTIQUE_TRADES.some((t) => raw.indexOf(t) !== -1);
  }

  /* ═══════════════ LA CARTE APPARTIENT AU COMPTE, PAS AU NAVIGATEUR ══════════
   * Ce module ne faisait que POUSSER. La carte de travail vivait dans le seul
   * localStorage du navigateur qui l'avait saisie — donc un commerçant qui
   * ouvrait son tableau de bord sur son téléphone, sur un iPad, ou dans une
   * fenêtre privée trouvait une carte vide. Et pire : il republiait ce vide
   * par-dessus la vraie carte, et le client qui scannait le QR de sa table
   * tombait sur « bientôt disponible ». Une carte n'est pas un réglage
   * d'affichage, c'est le fonds de commerce.
   *
   * Trois règles, dans cet ordre :
   *
   *  1. LIRE AVANT D'ÉCRIRE. Aucune publication tant que le serveur n'a pas
   *     répondu. Un navigateur neuf n'a rien à dire tant qu'il n'a rien lu.
   *  2. NE RIEN PERDRE. Panne, hors ligne, 503, session expirée : on avale, la
   *     copie locale reste la vérité de travail, on retente à la modification
   *     suivante. Le tableau de bord ne bloque jamais sur le réseau.
   *  3. LE SERVEUR FAIT FOI APRÈS LA PREMIÈRE PUBLICATION. Une union par id ne
   *     sait pas distinguer « absent car supprimé » de « absent car pas encore
   *     téléchargé ». Elle ressuscitait donc les sections supprimées dès qu'un
   *     ancien onglet God Mode se réveillait. Une carte déjà publiée est adoptée
   *     telle quelle ; une copie locale n'est conservée que si le serveur n'a
   *     encore aucune carte.
   *
   * Rien ici ne connaît un magasin en particulier : l'identité est
   * slugMerchant(nom de l'établissement) côté serveur, résolue depuis la
   * session. Tout établissement créé aujourd'hui ou dans deux ans passe par le
   * même chemin, sans une ligne de code de plus. */
  /* ── L'état « nuage » appartient au MAGASIN, pas à la session ──────────────
   * Un compte tient plusieurs établissements et on passe de l'un à l'autre sans
   * recharger la page. Un seul objet pour tout le monde, c'était deux pannes
   * bien réelles :
   *   · la boutique n'a pas de carte, donc la lecture se court-circuite pour
   *     elle — et posait `read = true` pour TOUS les magasins. Le restaurant
   *     ouvert juste après n'allait donc jamais chercher la sienne, et sa page
   *     Carte s'affichait vide alors que le serveur la détenait ;
   *   · `merchant` gardait le slug du DERNIER magasin lu et servait ensuite de
   *     cible à la publication : deux restaurants sur un même compte, et la
   *     carte du second partait dans la fiche du premier.
   * Une fiche par slug, donc. */
  const clouds = Object.create(null);
  function cloudFor(slug) {
    const k = slug || '·';
    return clouds[k] || (clouds[k] = {
      read: false, merchant: '', tried: 0, pulling: false,
      updatedTs: 0, explicitEmpty: false,
      /* La dernière carte sur laquelle ce navigateur et le serveur étaient
       * d'accord. Quand un autre appareil publie entre-temps, elle sert de
       * point de départ pour fusionner les deux modifications. */
      base: null,
    });
  }
  /* Ce qui se compare d'une carte : les horaires voyagent avec elle mais
   * appartiennent aux réglages, pas au document que l'on fusionne. */
  function menuSnapshot(menu) {
    const copy = JSON.parse(JSON.stringify(menu || {}));
    delete copy.hours;
    return copy;
  }
  function conflictNames(merged, conflicts) {
    const names = [];
    conflicts.forEach((c) => {
      const list = c.list && Array.isArray(merged[c.list]) ? merged[c.list] : [];
      const hit = list.find((e) => e && String(e.id) === String(c.id));
      const name = hit && typeof hit.name === 'string' && hit.name.trim() ? hit.name.trim() : '';
      if (name && names.indexOf(name) === -1) names.push(name);
    });
    return names;
  }

  /* Une carte vide n'est publiable que si le commerçant vient réellement de
   * supprimer son dernier contenu. Le démarrage, l'hydratation et un nouvel
   * appareil ne passent jamais ici. */
  function authorizeExplicitEmpty(data) {
    if (data && ((data.cats && data.cats.length) || (data.items && data.items.length))) return;
    const c = cloudFor(storeSlug());
    if (c.read && c.updatedTs) c.explicitEmpty = true;
  }

  /* Un même magasin a pu changer d'identifiant local (`v<horloge>` puis
   * `v-<slug>`). Avant d'afficher du vide, recopier sa carte orpheline si le
   * navigateur la possède encore. Copie seulement : aucune preuve de secours
   * n'est détruite. */
  function recoverLocalMenu(vid, slug) {
    try {
      const KCD = window.KiwiCloudDoc;
      if (!KCD || !KCD.carryForward || !vid || !slug) return false;
      const raw = KCD.carryForward('menu', vid, slug, function (value) {
        try {
          const d = JSON.parse(value || 'null');
          return !!(d && ((d.cats && d.cats.length) || (d.items && d.items.length)));
        } catch (_) { return false; }
      });
      return !!raw;
    } catch (_) { return false; }
  }

  function storeSlug() {
    try {
      const C = window.KiwiConfig;
      if (C && C.storeSlug) { const s = C.storeSlug(); if (s) return s; }
    } catch (_) {}
    const KV = window.KiwiVenue;
    let name = '';
    try {
      const vd = KV && KV.isCustom && KV.isCustom() && KV.getCurrentVenueData && KV.getCurrentVenueData();
      if (vd && vd.name) name = String(vd.name).trim();
    } catch (_) {}
    return rules.slug(name);
  }

  // Le compteur d'ids (`seq`) ne voyage pas : le serveur ne stocke que la carte.
  // Sans ce rattrapage, un navigateur neuf repartirait de it_1 et écraserait des
  // produits existants dès le premier ajout.
  function healSeq(d) { d.seq = rules.healSeq(d).seq; return d; }

  // Union par id, cet appareil d'abord. Les sous-catégories fusionnent de même,
  // sinon renommer une catégorie sur un poste effacerait les sous-catégories
  // créées sur l'autre.
  function mergeMenus(mine, theirs) {
    /* kitchenId voyage avec la carte. C'est LE réglage qui dit où part ce que
     * personne n'a routé ; le perdre à la fusion ferait retomber le repli sur
     * « le premier de la liste », c'est-à-dire exactement le piège qu'on vient
     * de retirer. Celui de cet appareil gagne, l'autre sert de secours. */
    const out = {
      seq: Math.max(+(mine && mine.seq) || 0, +(theirs && theirs.seq) || 0),
      kitchenId: (mine && mine.kitchenId) || (theirs && theirs.kitchenId) || '',
      cats: [], items: [], stations: [], opts: [], formulaTemplates: [],
    };
    /* La bibliothèque de groupes d'options, union par id, cet appareil d'abord —
     * comme les postes. Un groupe perdu ici, et le produit qui le porte
     * demanderait au comptoir un choix introuvable. */
    const ogSeen = Object.create(null);
    [((mine && mine.opts) || []), ((theirs && theirs.opts) || [])].forEach((list) => {
      list.forEach((g) => { if (g && g.id && !ogSeen[g.id]) { ogSeen[g.id] = 1; out.opts.push(g); } });
    });
    const ftSeen = Object.create(null);
    [((mine && mine.formulaTemplates) || []), ((theirs && theirs.formulaTemplates) || [])].forEach((list) => {
      list.forEach((t) => { if (t && t.id && !ftSeen[t.id]) { ftSeen[t.id] = 1; out.formulaTemplates.push(t); } });
    });
    /* Les postes fusionnent AVANT le reste et dans l'ordre de cet appareil :
     * cet ordre est celui des onglets de l'écran cuisine, donc celui qu'on a
     * sous les yeux gagne, et les postes créés ailleurs viennent se ranger
     * derrière plutôt que de disparaître. */
    const stSeen = Object.create(null);
    [((mine && mine.stations) || []), ((theirs && theirs.stations) || [])].forEach((list) => {
      list.forEach((s) => { if (s && s.id && !stSeen[s.id]) { stSeen[s.id] = 1; out.stations.push(s); } });
    });
    /* `station` fait partie de la catégorie au même titre que son nom : c'est le
     * routage. L'oublier ici renverrait toute la carte en cuisine au premier
     * rechargement depuis un autre appareil — une panne silencieuse, découverte
     * au coup de feu. Cet appareil gagne ; l'autre comble un trou, jamais plus. */
    const byId = Object.create(null);
    const mkCat = (c) => ({ id: c.id, name: c.name, station: c.station || '', sub: (c.sub || []).slice() });
    ((mine && mine.cats) || []).forEach((c) => {
      if (!c || !c.id || byId[c.id]) return;
      byId[c.id] = mkCat(c);
      out.cats.push(byId[c.id]);
    });
    ((theirs && theirs.cats) || []).forEach((c) => {
      if (!c || !c.id) return;
      if (!byId[c.id]) { byId[c.id] = mkCat(c); out.cats.push(byId[c.id]); return; }
      if (!byId[c.id].station && c.station) byId[c.id].station = c.station;
      const have = Object.create(null);
      byId[c.id].sub.forEach((s) => { if (s && s.id) have[s.id] = 1; });
      (c.sub || []).forEach((s) => { if (s && s.id && !have[s.id]) byId[c.id].sub.push(s); });
    });
    const seen = Object.create(null);
    [((mine && mine.items) || []), ((theirs && theirs.items) || [])].forEach((list) => {
      list.forEach((it) => { if (it && it.id && !seen[it.id]) { seen[it.id] = 1; out.items.push(it); } });
    });
    /* Les promotions, union par id, cet appareil d'abord, comme les postes. */
    const prSeen = Object.create(null), promos = [];
    [((mine && mine.promos) || []), ((theirs && theirs.promos) || [])].forEach((list) => {
      list.forEach((p) => { if (p && p.id && !prSeen[p.id]) { prSeen[p.id] = 1; promos.push(p); } });
    });
    if (promos.length) out.promos = promos;
    return healSeq(out);
  }

  const applyingServer = Object.create(null);
  function adoptServerMenu(raw, vid) {
    const data = healSeq({ seq: 0, langs: Array.isArray(raw.langs) ? raw.langs.slice() : ['fr', 'ar', 'en'], cats: raw.cats || [], items: raw.items || [], stations: raw.stations || [], kitchenId: raw.kitchenId || '', opts: raw.opts || [] });
    /* Les promotions font partie de la carte publiée : la reprendre sans elles
     * les effacerait du serveur à la publication suivante. */
    if (Array.isArray(raw.promos) && raw.promos.length) data.promos = raw.promos.slice();
    applyingServer[vid || '·'] = true;
    try { store.set(data, vid); }
    finally { delete applyingServer[vid || '·']; }
    return data;
  }

  /* Relire la carte du compte. Une carte publiée est adoptée telle quelle ; si
   * le serveur est vide ou indisponible, la copie locale reste intacte. */
  /* Pour DÉCIDER D'ALLER LIRE, c'est le métier de l'établissement affiché qui
   * tranche, pas celui que le serveur a renvoyé pour le magasin précédent : au
   * moment d'un changement d'établissement la config du nouveau n'est pas
   * encore revenue, et prendre le type périmé faisait sauter la lecture du
   * restaurant qu'on venait justement d'ouvrir. Se tromper ici ne coûte rien
   * dans un sens — on interroge une boutique, la réponse ne porte pas de carte,
   * on ne touche à rien — et coûtait une carte vide dans l'autre. publish(),
   * lui, garde la précédence au serveur : c'est là qu'un mauvais aiguillage
   * écrase des données. */
  function isBoutiqueForRead(vd) {
    const own = String((vd && (vd.subtype || vd.type)) || '').toLowerCase();
    if (own) return BOUTIQUE_TRADES.some((t) => own.indexOf(t) !== -1);
    return isBoutiqueVenue(vd);
  }

  function pull() {
    if (!isRealSession()) return Promise.resolve(false);
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    /* Le magasin visé est figé MAINTENANT : la réponse arrive quelques centaines
     * de millisecondes plus tard, et le patron peut très bien avoir changé
     * d'établissement entre-temps. Sans ça, la carte du café atterrit dans la
     * boutique. */
    const vid = vd && vd.id;
    const slug = storeSlug();
    const c = cloudFor(slug);
    if (c.pulling) return Promise.resolve(false);
    if (isBoutiqueForRead(vd)) return Promise.resolve(false);  // le stock passe par orderpro-publish.js
    recoverLocalMenu(vid, slug);
    c.pulling = true;
    return fetch('/api/menu?mine=1' + (slug ? '&merchant=' + encodeURIComponent(slug) : ''),
                 { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        c.pulling = false;
        if (!j || j.error || j.unreachable) return false;   // injoignable → surtout ne pas publier
        c.merchant = j.merchant || '';
        c.updatedTs = +j.updatedTs || 0;
        c.read = true;                                       // à partir d'ici, publier est sûr
        c.base = menuSnapshot(j.menu);
        const theirs = j.menu;
        if (!theirs || !((theirs.items && theirs.items.length) || (theirs.cats && theirs.cats.length))) return false;
        /* A published carte is the canonical document. Do not union it with an
         * older browser copy: an id present only locally may be a section that
         * another manager deliberately deleted. The server-empty case returned
         * above is the only recovery path where local work remains untouched. */
        adoptServerMenu(theirs, vid);
        /* Ne repeindre que si on est TOUJOURS sur ce magasin, sinon la carte du
         * café s'afficherait par-dessus la page de la boutique — ET seulement si
         * le patron regarde DÉJÀ la page Menu. render() passe par
         * KiwiVenue.showMenu(), qui n'est pas un rafraîchissement mais une
         * NAVIGATION : elle pose page-menu, éteint l'Accueil et déplace le
         * curseur de la barre latérale. Or pull() part 1,2 s après le
         * chargement, à chaque retour sur l'onglet et à chaque changement
         * d'établissement : la carte surgissait donc par-dessus l'Accueil à
         * chaque connexion. Quand la page Menu est ouverte, le repaint est
         * déjà assuré par store.subscribe → refreshMenu() dans boot(). */
        try {
          if (isCustom() && storeSlug() === slug &&
              document.body.classList.contains('page-menu')) render();
        } catch (_) {}
        return true;
      })
      .catch(() => { c.pulling = false; return false; });   // hors ligne → local reste la vérité
  }

  /* GENERATED SHARED KiwiMenuMerge BEGIN */
  /* Copy of functions/api/_rules-menu-merge.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiMenuMerge = (function () {
    // Three-way merge of a menu document, item by item.
    //
    // When a device publishes its menu and the server already holds a newer copy,
    // the device keeps three versions: base (the server copy it last synced),
    // mine (its own edit) and theirs (the server copy now). A field changed on one
    // side only takes that side's value; a field changed identically on both sides
    // is kept; a field changed differently on both sides is a conflict, resolved to
    // the server's value and reported so the screen can name the item. Lists keep
    // the server's order, then append what only this device added.

    const MENU_LISTS = ['cats', 'items', 'stations', 'opts', 'formulaTemplates', 'promos'];
    // seq numbers new ids on each device: keep the higher one so ids never collide.
    const MENU_COUNTERS = ['seq'];

    const stable = (value) => {
      if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
      if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
      }
      return JSON.stringify(value === undefined ? null : value);
    };

    const sameValue = (a, b) => stable(a) === stable(b);

    const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

    // One value: base b, mine m, theirs t. Returns { value, conflict }.
    // A missing value is passed as undefined and means "absent".
    const mergeValue = (b, m, t) => {
      if (sameValue(m, b)) return { value: t, conflict: false };
      if (sameValue(t, b)) return { value: m, conflict: false };
      if (sameValue(m, t)) return { value: t, conflict: false };
      return { value: t, conflict: true };
    };

    const isIdList = (v) => v === undefined || (Array.isArray(v) && v.every((e) => e && typeof e === 'object' && e.id != null));

    // Two objects edited on both sides: merge field by field. A field holding a
    // list of objects with ids (a category's subcategories, an option group's
    // choices) is merged entry by entry instead of as one value.
    const mergeFields = (b, m, t) => {
      const base = b || {};
      const keys = new Set([...Object.keys(base), ...Object.keys(m || {}), ...Object.keys(t || {})]);
      const out = {};
      const fields = [];
      for (const key of keys) {
        const bv = has(base, key) ? base[key] : undefined;
        const mv = has(m, key) ? m[key] : undefined;
        const tv = has(t, key) ? t[key] : undefined;
        const r = mergeValue(bv, mv, tv);
        if (r.conflict && Array.isArray(mv) && Array.isArray(tv) && isIdList(bv) && isIdList(mv) && isIdList(tv)) {
          const nested = mergeList(bv, mv, tv);
          out[key] = nested.value;
          for (const c of nested.conflicts) fields.push(key + '.' + c.id);
          continue;
        }
        if (r.conflict) fields.push(key);
        if (r.value !== undefined) out[key] = r.value;
      }
      return { value: out, fields };
    };

    const byId = (list) => {
      const map = new Map();
      for (const entry of Array.isArray(list) ? list : []) {
        const id = entry && entry.id != null ? String(entry.id) : '';
        if (id && !map.has(id)) map.set(id, entry);
      }
      return map;
    };

    // One id-keyed list. Returns { value, conflicts: [{ id, fields }] }.
    const mergeList = (baseList, mineList, theirList) => {
      const B = byId(baseList), M = byId(mineList), T = byId(theirList);
      const decided = new Map();
      const conflicts = [];
      const ids = new Set([...B.keys(), ...M.keys(), ...T.keys()]);
      for (const id of ids) {
        const b = B.get(id), m = M.get(id), t = T.get(id);
        if (sameValue(m, b)) { if (t !== undefined) decided.set(id, t); continue; }
        if (sameValue(t, b)) { if (m !== undefined) decided.set(id, m); continue; }
        if (sameValue(m, t)) { if (t !== undefined) decided.set(id, t); continue; }
        if (m === undefined || t === undefined) {
          // Deleted on one side, changed on the other: keep the surviving edit, report it.
          decided.set(id, m === undefined ? t : m);
          conflicts.push({ id, fields: ['deleted'] });
          continue;
        }
        const r = mergeFields(b, m, t);
        decided.set(id, r.value);
        if (r.fields.length) conflicts.push({ id, fields: r.fields });
      }
      const value = [];
      for (const id of T.keys()) if (decided.has(id)) { value.push(decided.get(id)); decided.delete(id); }
      for (const id of M.keys()) if (decided.has(id)) { value.push(decided.get(id)); decided.delete(id); }
      for (const [, entry] of decided) value.push(entry);
      return { value, conflicts };
    };

    // The whole menu. Lists merge by id, counters keep the higher value, any
    // other field follows mergeValue.
    const mergeMenu = (base, mine, theirs) => {
      const b = base || {}, m = mine || {}, t = theirs || {};
      const out = {};
      const conflicts = [];
      const keys = new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)]);
      for (const key of keys) {
        if (MENU_LISTS.includes(key)) {
          const r = mergeList(b[key], m[key], t[key]);
          out[key] = r.value;
          for (const c of r.conflicts) conflicts.push({ list: key, id: c.id, fields: c.fields });
          continue;
        }
        if (MENU_COUNTERS.includes(key)) {
          const n = Math.max(Number(b[key]) || 0, Number(m[key]) || 0, Number(t[key]) || 0);
          if (has(m, key) || has(t, key)) out[key] = n;
          continue;
        }
        const r = mergeValue(has(b, key) ? b[key] : undefined, has(m, key) ? m[key] : undefined, has(t, key) ? t[key] : undefined);
        if (r.value !== undefined) out[key] = r.value;
        if (r.conflict) conflicts.push({ list: '', id: key, fields: [key] });
      }
      return { value: out, conflicts };
    };
    return { MENU_LISTS, MENU_COUNTERS, sameValue, mergeValue, mergeFields, mergeList, mergeMenu };
  })();
  /* GENERATED SHARED KiwiMenuMerge END */
  let syncTimer = null;
  function publish(vid, merging) {
    if (!isRealSession()) return;                 // local demo → never touch the network
    const KV = window.KiwiVenue;
    const vd = (KV && KV.getVenueData && KV.getVenueData(vid)) ||
               (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    const targetVid = vid || vd.id;
    /* The cloud state below (slug, expected revision) belongs to the store on
     * screen. A change notified for any other venue — another tab, another
     * store of the account — is that venue's own tab's to publish; publishing
     * it here would file its carte under this store's slug. */
    const shown = (KV && KV.getCurrentVenueData && KV.getCurrentVenueData()) || {};
    if (vid && shown.id && vid !== shown.id) return;
    if (isBoutiqueVenue(vd)) return;              // stock is published by orderpro-publish.js
    // RÈGLE 1 — rien ne part tant qu'on n'a pas lu. Sans ce verrou, un navigateur
    // neuf publiait sa carte vide par-dessus la vraie, quinze cents millisecondes
    // après l'ouverture du tableau de bord.
    const c = cloudFor(storeSlug());
    if (!c.read) { if (c.tried++ < 3) pull().then(() => { if (c.read) publish(vid); }); return; }
    const data = store.get(targetVid);
    const slug = c.merchant || storeSlug();
    const empty = !((data.cats && data.cats.length) || (data.items && data.items.length));
    /* Le simple fait d'avoir relu le serveur n'autorise jamais un effacement.
     * Seule la suppression explicite du dernier contenu pose ce jeton. */
    if (empty && !c.explicitEmpty) return;
    /* Les horaires partent AVEC la carte. Le téléphone du client ne peut pas
     * lire les réglages du commerçant : sans ce passager, la page de commande
     * ne saurait pas que le restaurant est fermé et prendrait la commande
     * quand même. Le serveur ne garde que la semaine et les exceptions
     * (functions/api/menu.js) — les dérogations internes ne sortent pas. */
    const sent = menuSnapshot(data);
    const withHours = (() => {
      try {
        const KH = window.KiwiHours;
        if (!KH || !KH.isConfigured(vid)) return data;
        const h = KH.get(vid);
        return Object.assign({}, data, { hours: { v: 1, week: h.week, exceptions: h.exceptions } });
      } catch (_) { return data; }
    })();
    try {
      fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: vd.name || '', type: vd.type || '', data: withHours,
          merchant: slug || undefined,
          // On a relu le serveur : une carte vide ici est une carte vidée exprès,
          // pas un navigateur qui n'a rien trouvé. Le serveur refuse l'inverse.
          allowEmpty: empty && c.explicitEmpty,
          // Every restaurant write is compare-and-swap. An old God Mode tab
          // cannot put back sections after another browser deleted them.
          expectedUpdatedTs: c.updatedTs || 0,
        }),
      }).then(function (r) {
        if (r && r.ok) return r.json();
        return (r && r.json ? r.json().catch(function () { return null; }) : Promise.resolve(null))
          .then(function (err) {
            /* A newer revision won. Replace this stale browser copy instead of
             * merging it and immediately attempting to resurrect old ids. */
            /* foreign-document : cette carte est celle d'un autre établissement
             * (functions/api/_tenant-guard.js). On reprend la carte du serveur. */
            /* stale-menu : un autre appareil a publié depuis notre dernière
             * lecture. On fusionne les deux modifications champ par champ
             * (functions/api/_rules-menu-merge.js) au lieu de jeter celle-ci,
             * puis on republie une fois. Un champ changé des deux côtés garde
             * la version enregistrée ailleurs et le plat est nommé. */
            if (r && r.status === 409 && err && err.error === 'stale-menu' && err.data && c.base && !merging) {
              const theirs = menuSnapshot(err.data);
              const result = KiwiMenuMerge.mergeMenu(c.base, sent, theirs);
              c.updatedTs = +err.updatedTs || c.updatedTs;
              c.base = theirs;
              applyingServer[targetVid || '·'] = true;
              try { store.set(healSeq(result.value), targetVid); }
              finally { delete applyingServer[targetVid || '·']; }
              const names = conflictNames(result.value, result.conflicts);
              if (result.conflicts.length && window.Kiwi?.toast) window.Kiwi.toast(tr({ fr: 'Carte fusionnée avec une version enregistrée ailleurs', en: 'Menu merged with a version saved elsewhere', ar: 'دُمجت القائمة مع نسخة محفوظة في مكان آخر' }), {
                type: 'info', force: true,
                desc: tr({ fr: 'Modifié des deux côtés, la version enregistrée ailleurs est gardée : ', en: 'Changed on both sides, the version saved elsewhere is kept: ', ar: 'عُدّل من الجهتين، احتُفظ بالنسخة المحفوظة في مكان آخر: ' })
                  + (names.length ? names.slice(0, 5).join(', ') : tr({ fr: 'réglages de la carte', en: 'menu settings', ar: 'إعدادات القائمة' })) + '.',
              });
              publish(vid, true);
              return null;
            }
            if (r && r.status === 409 && err && (err.error === 'stale-menu' || err.error === 'foreign-document') && err.data) {
              c.updatedTs = +err.updatedTs || c.updatedTs;
              adoptServerMenu(err.data, targetVid);
            }
            /* Le code du serveur n'est pas une phrase : « subscription-required »
             * s'affichait tel quel sous le titre. Un compte en attente (402) est
             * déjà expliqué par la garde d'activation, au geste qui a provoqué
             * l'écriture ; une synchronisation de fond n'affiche rien. */
            if (r && r.status === 402) return null;
            const adopted = r && r.status === 409 && err && err.data;
            if (window.Kiwi?.toast) window.Kiwi.toast(syncSay('Échec de synchronisation de la carte', 'The menu could not be synced', 'تعذّرت مزامنة القائمة'), {
              type: 'warn', force: true,
              desc: adopted
                ? syncSay('Une version plus récente, enregistrée ailleurs, a été reprise.', 'A newer version, saved elsewhere, was taken instead.', 'تم اعتماد نسخة أحدث محفوظة في مكان آخر.')
                : syncSay('La carte n’a pas été enregistrée sur le serveur. Elle reste sur cet appareil.', 'The menu was not saved on the server. It stays on this device.', 'لم تُحفظ القائمة على الخادم. تبقى على هذا الجهاز.'),
            });
            return null;
          });
      }).then(function (j) {
        if (!j || !j.ok) return;
        c.updatedTs = +j.updatedTs || c.updatedTs;
        c.base = sent;
        if (empty) c.explicitEmpty = false;
      }).catch(function () {
        if (window.Kiwi?.toast) window.Kiwi.toast(syncSay('Échec de synchronisation de la carte', 'The menu could not be synced', 'تعذّرت مزامنة القائمة'), { type: 'warn', force: true, desc: syncSay('Pas de connexion. La carte reste sur cet appareil.', 'No connection. The menu stays on this device.', 'لا اتصال. تبقى القائمة على هذا الجهاز.') });
      });
    } catch (_) {
      if (window.Kiwi?.toast) window.Kiwi.toast(syncSay('Échec de synchronisation de la carte', 'The menu could not be synced', 'تعذّرت مزامنة القائمة'), { type: 'warn', force: true });
    }
  }
  /* La synchronisation de la carte parle la langue de l'écran. */
  function syncSay(fr, en, ar) {
    const l = String(document.documentElement.getAttribute('lang') || 'fr').slice(0, 2);
    return l === 'ar' ? ar : l === 'en' ? en : fr;
  }
  function schedulePublish(vid) {
    if (!isRealSession()) return;
    if (syncTimer) { try { clearTimeout(syncTimer); } catch (_) {} }
    syncTimer = setTimeout(function () { syncTimer = null; publish(vid); }, 800);
  }

  /* ───────────────── boot ───────────────── */
  function boot() {
    registerHandlers();
    // re-render the open menu page live when this venue's menu changes elsewhere
    // (caisse), and — for a real merchant — publish the new carte to the server so
    // the customer QR page picks it up.
    store.subscribe((vid) => {
      if (document.body.classList.contains('page-menu')) {
        try { window.KiwiVenue?.refreshMenu?.(); } catch (_) {}
      }
      if (!applyingServer[vid || '·']) schedulePublish(vid);
    });
    /* Un changement d'horaires doit repartir vers la page client tout de suite :
     * un commerçant qui déclare sa fermeture de l'Aïd le matin ne doit pas voir
     * des commandes arriver l'après-midi parce que la publication attendait la
     * prochaine modification de la carte. */
    try {
      if (window.KiwiHours && window.KiwiHours.subscribe) {
        window.KiwiHours.subscribe(function () { schedulePublish(); });
      }
    } catch (_) {}
    // RELIRE, PUIS publier. Dans cet ordre, et jamais l'inverse : c'est la
    // lecture qui reconstruit la carte dans un navigateur neuf, et c'est elle
    // qui autorise la publication (voir la règle 1 dans publish()).
    if (isRealSession()) {
      setTimeout(function () {
        pull().then(function (serverAdopted) {
          /* A published server menu was only hydrated, so writing it straight
           * back creates a needless new revision. If the server had no menu,
           * publish the local recovery copy as before. */
          if (!serverAdopted) { try { publish(); } catch (_) {} }
        });
      }, 1200);
      // Revenir sur l'onglet après avoir modifié la carte sur un autre appareil
      // doit suffire à la voir arriver — sans marteler le réseau.
      /* CHANGER D'ÉTABLISSEMENT, C'EST CHANGER DE CARTE.
       * La lecture n'avait lieu qu'une fois, 1,2 s après le chargement de la
       * page — donc pour le SECOND magasin d'un compte, jamais. Le patron
       * passait de sa boutique à son café et y trouvait une carte vide alors
       * que le serveur la détenait ; et comme la page Carte vide n'offrait
       * aucun bouton, il n'avait plus non plus par où récupérer ses liens
       * Order Pro. On relit donc à chaque changement. Trois tentatives
       * espacées, parce que la config du nouveau magasin (merchant-config.js,
       * abonné au même évènement) doit être revenue pour que le métier soit
       * connu ; chacune ne coûte rien une fois la carte lue. */
      try {
        if (window.KiwiVenue && window.KiwiVenue.subscribe) {
          window.KiwiVenue.subscribe(function () {
            [200, 900, 2200].forEach(function (ms) {
              setTimeout(function () {
                try { if (!cloudFor(storeSlug()).read) pull(); } catch (_) {}
              }, ms);
            });
          });
        }
      } catch (_) {}
      let lastPull = 0;
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        if (now - lastPull < 20000) return;
        lastPull = now;
        try { pull(); } catch (_) {}
      });
    }
  }


    const { saveFormulaTemplate, deleteFormulaTemplate } = createFormulas({ store, cleanFormula, nid });
    return { store, catById, itemById, itemsIn, stationsOf, stationById, cleanFormula, kitchenIdOf, ensureKitchen, optsOf, optById, OPT_EMOJIS, cleanOptEmoji, saveFormulaTemplate, deleteFormulaTemplate, addStation, renameStation, cycleStationColor, moveStation, deleteStation, setCategoryStation, addOptGroup, updateOptGroup, deleteOptGroup, addOptChoice, updateOptChoice, deleteOptChoice, setItemOpts, addCategory, renameCategory, moveCategory, deleteCategory, addSubcategory, renameSubcategory, deleteSubcategory, addItem, updateItem, setI18n, setI18nEntry, clearI18n, setLanguages, MI, promosOf, savePromo, deletePromo, deleteItem, publish, boot };
  };
})(window.KiwiMenuCatalogParts = window.KiwiMenuCatalogParts || {});
