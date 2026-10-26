import '../../../assets/promo-rules.js';
import '../../../assets/menu-promos.js';
const MenuPromos = () => globalThis.KiwiMenuPromos;
import { merchantZone } from '../_business-day.js';
// Contrat : catalogue publié et lignes entrantes vers prix canoniques ; lit le catalogue menus, jamais les commandes ni les sessions.
import { resolveMenu } from '../_rules-promotion-pricing.js';
/* ── Le prix, décidé ici et nulle part ailleurs ────────────────────────────
 * Le téléphone envoyait son propre total et ses propres prix unitaires, et on
 * les écrivait tels quels. Une requête modifiée créait donc une commande à
 * 1 MAD pour un plat à 250, avec le nom qu'on voulait — et le ticket cuisine
 * sortait avec le faux prix. C'était le plus gros trou du relais.
 *
 * Désormais le téléphone n'envoie que des IDENTIFIANTS et des quantités. On
 * ouvre la carte publiée par le commerçant, on y lit le nom et le prix, et on
 * recalcule le total. Ce que le téléphone prétendait n'est plus qu'un
 * commentaire qu'on compare pour le journal.
 *
 * ── Ce que le repli « aucune carte publiée » coûtait vraiment ───────────────
 * Il existait un chemin où l'on reprenait le prix ET le nom du téléphone : quand
 * aucun index ne pouvait être construit. Présenté comme le cas du commerçant qui
 * n'a rien publié, c'était en réalité le MÊME trou derrière quatre conditions,
 * dont une vertical entière :
 *   · une BOUTIQUE publie {categories, products, variants, colors} avec
 *     `priceMAD` et AUCUNE clé `items` — donc toute boutique avec Order Pro
 *     allumé se tarifait depuis le téléphone du client ;
 *   · une carte publiée avec des catégories mais zéro plat passe `menuEmpty` ;
 *   · un JSON illisible en base ;
 *   · une simple panne de lecture sur `menus`.
 * Dans les quatre cas, un inconnu tenant le slug fixait le prix ET le libellé
 * imprimé sur le ticket cuisine, sur un point d'entrée non authentifié.
 *
 * Deux corrections, donc. On sait désormais lire les DEUX formes de catalogue —
 * la carte d'un restaurant et le stock d'une boutique. Et quand il n'y a
 * décidément rien contre quoi vérifier, on REFUSE au lieu de croire : Order Pro
 * est une option qu'un opérateur a explicitement allumée, et « allumée sans
 * catalogue » est une erreur de configuration qui se corrige en trente
 * secondes — pas une raison de laisser le client nommer son prix. Le refus est
 * explicite (`menu-not-published`), donc réparable ; l'ancien silence ne
 * l'était pas. */
const MAX_LINE_QTY = 99;

/* Un prix de carte est en dirhams ET centimes. Il était arrondi au dirham
 * entier ici (Math.round) : un café à 14,50 MAD affiché sur la carte et sur le
 * téléphone du client sortait de ce relais à 15 MAD, la ligne « Grand +3 » à
 * 18 au lieu de 17,50, et le ticket de la caisse ne recoupait plus ce que le
 * client avait vu. L'éditeur de carte accepte les centimes (14,5), la caisse et
 * les ventes comptent en centimes : seul ce relais les perdait. On garde donc
 * deux décimales, et on additionne en centimes entiers pour que 3 × 14,55 ne
 * dérive pas en 43,650000000000006. */
const price2 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};

export async function priceOrder(env, merchant, rawLines, opts = {}) {
  /* The moment the order is priced: a promotion is frozen on the line as of
   * now, like a paper ticket. Tests pass their own clock. */
  const now = Number.isFinite(opts && opts.now) ? opts.now : Date.now();
  let menuRow = null;
  try {
    menuRow = await env.DB.prepare(
      'SELECT data, updated_ts FROM menus WHERE merchant = ?'
    ).bind(merchant).first();
  } catch (_) { menuRow = null; }

  let index = null;
  let optionIndex = new Map();
  let menuRev = null;
  let promos = [];
  if (menuRow && menuRow.data) {
    try {
      const parsed = JSON.parse(menuRow.data);
      const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
      /* Preparation routing belongs to the category, not the item. Keep it
       * on the canonical priced line so every source (OrderPro, employee
       * app and caisse) reaches KDS with the same frozen station decision.
       *
       * Résolu AVANT le choix de la forme de catalogue, parce que les deux en
       * ont besoin : une boutique repartait avec `station: ''`, et la caisse
       * retombait alors sur une recherche PAR NOM. Un article renommé depuis
       * l'envoi ne se rapprochait plus de rien et le bon partait au poste par
       * défaut. Le poste doit être figé sur la ligne à l'instant de l'envoi,
       * comme sur un ticket papier — c'est la règle, et elle ne dépend pas du
       * métier du commerçant. */
      const stationIds = (Array.isArray(parsed && parsed.stations) ? parsed.stations : [])
        .map((station) => String((station && station.id) || '')).filter(Boolean);
      const configuredKitchen = String((parsed && parsed.kitchenId) || '');
      const fallbackStation = stationIds.includes(configuredKitchen)
        ? configuredKitchen : (stationIds[0] || '');
      if (items.length) {
        const categoryStations = new Map();
        for (const category of (Array.isArray(parsed && parsed.cats) ? parsed.cats : [])) {
          if (!category || !category.id) continue;
          const wanted = String(category.station || '').slice(0, 40);
          categoryStations.set(String(category.id), stationIds.includes(wanted) ? wanted : fallbackStation);
        }
        for (const group of (Array.isArray(parsed && parsed.opts) ? parsed.opts : [])) {
          if (!group || !group.id) continue;
          const choices = new Map();
          const choicesById = new Map();
          for (const choice of (Array.isArray(group.choices) ? group.choices : [])) {
            if (!choice) continue;
            const cObj = {
              id: String(choice.id || '').trim(),
              name: String(choice.name || '').trim(),
              price: price2(choice.price),
              emoji: String(choice.emoji || '').trim().slice(0, 16),
            };
            if (cObj.name) {
              choices.set(cObj.name.toLocaleLowerCase('fr'), cObj);
            }
            if (cObj.id) {
              choicesById.set(cObj.id, cObj);
            }
          }
          optionIndex.set(String(group.id), {
            name: String(group.name || '').trim(),
            kind: group.kind === 'many' ? 'many' : 'one',
            required: group.required === true,
            /* Older published menus only carried `required` and `kind`. Keep
             * those menus valid while enforcing richer min/max contracts when
             * the publisher has preserved them. */
            min: Math.max(0, Math.min(40, Math.round(Number(group.min) || (group.required === true ? 1 : 0)))),
            max: Math.max(1, Math.min(40, Math.round(Number(group.max) ||
              (group.kind === 'many' ? Math.max(1, (Array.isArray(group.choices) ? group.choices.length : 1)) : 1)))),
            choices,
            choicesById,
          });
        }
        index = new Map();
        for (const it of items) {
          if (!it || !it.id) continue;
          index.set(String(it.id), {
            name: String(it.name || ''),
            price: price2(it.price),
            avail: it.avail !== false,
            formulaOnly: it.formulaOnly === true,
            archived: it.archived === true,
            opts: new Set((Array.isArray(it.opts) ? it.opts : []).map(String)),
            formula: it.formula && Array.isArray(it.formula.slots) ? {
              slots: it.formula.slots.map((slot) => ({
                id: String((slot && slot.id) || ''),
                label: String((slot && slot.label) || '').trim(),
                min: Math.max(0, Math.round(Number(slot && slot.min) || 0)),
                max: Math.max(1, Math.round(Number(slot && slot.max) || 1)),
                choices: new Map((Array.isArray(slot && slot.choices) ? slot.choices : [])
                  .filter((choice) => choice && choice.itemId)
                  .map((choice) => [String(choice.itemId), price2(choice.extra)])),
              })).filter((slot) => slot.id && slot.choices.size),
            } : null,
            station: categoryStations.get(String(it.catId || '')) || fallbackStation,
            catId: String(it.catId || ''),
          });
        }
        menuRev = menuRow.updated_ts || null;
        /* Re-sanitised on read: a row written before promotions existed has
         * none, and a promotion naming a deleted category simply drops out. */
        try { promos = MenuPromos().sanitize(parsed && parsed.promos, parsed); } catch (_) { promos = []; }
      } else {
        /* La forme BOUTIQUE. `priceMAD` au lieu de `price`, et la disponibilité
         * vient du stock : un article dont toutes les déclinaisons sont à zéro
         * est épuisé, exactement comme un plat marqué indisponible. Un produit
         * SANS déclinaison du tout reste commandable — tous les catalogues ne
         * suivent pas les tailles, et refuser dans le doute fermerait la
         * boutique au lieu de la protéger. */
        const products = Array.isArray(parsed && parsed.products) ? parsed.products : [];
        if (products.length) {
          const stock = new Map();
          const variants = Array.isArray(parsed && parsed.variants) ? parsed.variants : [];
          for (const v of variants) {
            if (!v || !v.productId) continue;
            const k = String(v.productId);
            stock.set(k, (stock.get(k) || 0) + Math.max(0, Number(v.stock) || 0));
          }
          index = new Map();
          for (const p of products) {
            if (!p || !p.id) continue;
            const k = String(p.id);
            index.set(k, {
              name: String(p.name || ''),
              price: price2(p.priceMAD),
              avail: stock.has(k) ? stock.get(k) > 0 : true,
              /* Une boutique n'a pas de catégories de préparation ; elle a
                 néanmoins un poste par défaut dès qu'un écran existe. */
              station: fallbackStation,
            });
          }
          menuRev = menuRow.updated_ts || null;
        }
      }
    } catch (_) { index = null; }
  }

  const lines = [];
  const unknown = [];
  const unavailable = [];
  const formulaOnly = [];
  const archived = [];
  const invalidOptions = [];
  let totalCents = 0;

  /* Rien contre quoi vérifier ⇒ on ne devine pas, on le DIT. L'appelant en fait
   * un 409 explicite ; il n'écrit jamais une commande dont il ne connaît pas le
   * prix. C'est la seule sortie possible ici : lire `l.unitPrice` reviendrait à
   * laisser un inconnu tarifer la marchandise d'un commerçant. */
  if (!index) {
    return { lines: [], total: 0, priced: false, noCatalogue: true, menuRev: null,
             unknown: [], unavailable: [], formulaOnly: [], archived: [] };
  }

  /* A composed menu is one billable parent plus non-billable preparation
   * children. Validate that relationship against the published formula before
   * pricing anything: the device cannot invent a zero-price child, and the
   * canonical repricer must not turn an included drink back into a full-price
   * standalone article. Only each choice's configured `extra` is added to the
   * parent. */
  const formulaContexts = new Map();
  for (const parent of rawLines) {
    const uid = String((parent && parent.formulaUid) || '').slice(0, 40);
    if (!uid || String((parent && parent.kind) || '') !== 'formula') continue;
    const parentRef = index.get(String((parent && parent.id) || ''));
    const slots = parentRef && parentRef.formula && parentRef.formula.slots;
    const children = rawLines.filter((line) => String((line && line.kind) || '') === 'formula-part'
      && String((line && line.formulaUid) || '').slice(0, 40) === uid);
    let valid = !!(slots && slots.length);
    let extra = 0;
    /* Keep the authoritative supplement of EACH selected component. Billing
     * still charges the composed-menu parent once; this map only lets the
     * customer receipt explain which choice contributed 0 MAD and which one
     * contributed (for example) 12 MAD. Never trust a client-supplied amount. */
    const choiceExtras = new Map();
    const assigned = new Set();
    /* Le créneau se comptait en LIGNES. Une seule ligne satisfaisait donc
       « min ≤ 1 ≤ max » tout en portant la quantité de l'appelant — jusqu'à 99 —
       et l'enfant d'une formule est facturé zéro. Une commande passée depuis le
       QR d'une table, sans le moindre identifiant, sortait ainsi 99 boissons
       offertes par menu vendu, imprimées « inclus » sur l'addition.
       On compte donc les quantités, et on les borne à ce que le parent commande :
       deux menus donnent droit à deux boissons, pas à quatre-vingt-dix-neuf. */
    const parentQty = Math.min(MAX_LINE_QTY, Math.max(1, Math.round(Number(parent && parent.qty) || 1)));
    const childQty = (child) => Math.min(MAX_LINE_QTY, Math.max(1, Math.round(Number(child && child.qty) || 1)));
    if (valid) {
      for (const slot of slots) {
        const selected = children.filter((child, childIndex) => {
          if (assigned.has(childIndex)) return false;
          const explicitSlot = String((child && child.formulaSlotId) || '');
          const lineId = String((child && child.lineId) || '');
          const label = String((child && child.slotLabel) || '').trim();
          /* OrderPro appends a choice index to lineId when a slot allows
             multiple selections (…-slot-0, …-slot-1). Match that stable slot
             prefix as well as the legacy exact form; otherwise a perfectly
             configured salle formula is rejected as “options à recueillir”. */
          const slotLinePrefix = `${uid}-${slot.id}`;
          return explicitSlot === slot.id || lineId === slotLinePrefix
            || lineId.startsWith(slotLinePrefix + '-')
            || (!!slot.label && label === slot.label);
        });
        const takenQty = selected.reduce((n, child) => n + childQty(child), 0);
        if (takenQty < slot.min * parentQty || takenQty > slot.max * parentQty) { valid = false; break; }
        for (const child of selected) {
          const childIndex = children.indexOf(child);
          const childId = String((child && child.id) || '');
          if (!slot.choices.has(childId)) { valid = false; break; }
          assigned.add(childIndex);
          const choiceExtra = slot.choices.get(childId) || 0;
          choiceExtras.set(child, choiceExtra);
          extra += choiceExtra;
        }
        if (!valid) break;
      }
      if (assigned.size !== children.length) valid = false;
    }
    /* Deux lignes « menu » qui se disent le même menu : chaque passage
     * écrasait le contexte du précédent, si bien que le sort de la commande
     * dépendait de l'ordre des lignes (refusée dans un ordre, acceptée et
     * facturée autrement dans l'autre, la seconde ligne portant le supplément
     * du vrai menu). Une caisse, l'app serveur et le téléphone tirent un uid par
     * menu ; un uid partagé est ambigu, on refuse la composition entière. */
    formulaContexts.set(uid, formulaContexts.has(uid)
      ? { valid: false, extra: 0, choiceExtras: new Map(), parentId: '' }
      : { valid, extra, choiceExtras, parentId: String((parent && parent.id) || '') });
  }

  for (const l of rawLines) {
    const id = String((l && l.id) || '').slice(0, 40);
    const qty = Math.min(MAX_LINE_QTY, Math.max(1, Math.round(Number(l && l.qty) || 1)));
    let options = String((l && l.options) || '').slice(0, 200);
    const note = String((l && l.note) || '').slice(0, 200);
    const visuals = (Array.isArray(l && l.visuals) ? l.visuals.slice(0, 12) : [])
      .map((v) => ({
        emoji: String((v && (v.emoji || v.e)) || '').trim().slice(0, 16),
        name: String((v && (v.name || v.label || v.cn)) || '').trim().slice(0, 60),
      }))
      .filter((v) => v.name);

    const ref = id && index.get(id);
    if (!ref) { unknown.push(id || '?'); continue; }
    const kind = String((l && l.kind) || '').slice(0, 20);
    const formulaUid = String((l && l.formulaUid) || '').slice(0, 40);
    const formulaContext = formulaUid ? formulaContexts.get(formulaUid) : null;
    if ((kind === 'formula' || kind === 'formula-part') && (!formulaContext || !formulaContext.valid)) {
      invalidOptions.push(ref.name || id || '?');
      continue;
    }
    if (ref.archived) { archived.push(ref.name || id); continue; }
    if (ref.formulaOnly && kind !== 'formula-part') { formulaOnly.push(ref.name || id); continue; }
    if (!ref.avail) { unavailable.push(ref.name || id); continue; }
    let optionExtra = 0;
    let canonicalVisuals = visuals;
    const selected = Array.isArray(l && l.optionChoices) ? l.optionChoices.slice(0, 40) : [];
    /* Formula parents are a legacy composite contract: their required choices
     * are represented by formula-part lines/slots, not by the regular `opts`
     * array. Enforcing the regular group here would reject existing published
     * formulas before their slot children are priced. Explicit optionChoices on
     * a formula parent still go through the normal identity/count validation. */
    /* An included component (formula-part) is the same contract seen from the
     * other side: its choices belong to the formula's slots, and no formula
     * sheet collects the article's own groups. Browse, 2026-10-05: Espresso's
     * required "Hot or Ice" refused every brunch formula from the waiter app
     * as « carte modifiée », while the till (which never applied this rule)
     * sent the same formula. Explicit choices on a component are still
     * validated by identity; only the missing-required count is waived. */
    const includedPart = kind === 'formula-part';
    const hasRequiredOption = kind !== 'formula' && !includedPart && !!(ref.opts && Array.from(ref.opts).some((groupId) => {
      const group = optionIndex.get(groupId);
      return group && group.min > 0;
    }));
    if (selected.length || hasRequiredOption) {
      const labels = [];
      canonicalVisuals = [];
      const oneSeen = new Set();
      const groupCounts = new Map();
      const groupChoices = new Map();
      let valid = true;
      for (const picked of selected) {
        if (!picked) continue;
        const groupId = String((picked && picked.group) || '').slice(0, 40);
        const choiceId = String((picked && (picked.choiceId || picked.id)) || '').trim().slice(0, 40);
        const labelKey = String((picked && picked.label) || '').trim().toLocaleLowerCase('fr');
        if (!choiceId && !labelKey) continue;
        const group = optionIndex.get(groupId);
        const choice = group && (
          (choiceId && group.choicesById && group.choicesById.get(choiceId)) ||
          (labelKey && group.choices && group.choices.get(labelKey))
        );
        if (!group || !ref.opts || !ref.opts.has(groupId) || !choice
            || (group.kind === 'one' && oneSeen.has(groupId))) {
          valid = false;
          break;
        }
        if (group.kind === 'one') oneSeen.add(groupId);
        const pickedChoices = groupChoices.get(groupId) || new Set();
        if (pickedChoices.has(choice.id)) {
          valid = false;
          break;
        }
        pickedChoices.add(choice.id);
        groupChoices.set(groupId, pickedChoices);
        groupCounts.set(groupId, (groupCounts.get(groupId) || 0) + 1);
        labels.push(`${group.name}: ${choice.name}`);
        optionExtra += choice.price;
        canonicalVisuals.push({ emoji: choice.emoji || '', name: choice.name });
      }
      if (valid) {
        for (const groupId of ref.opts) {
          const group = optionIndex.get(groupId);
          if (!group) { valid = false; break; }
          const count = groupCounts.get(groupId) || 0;
          if ((count < group.min && !includedPart) || count > group.max) {
            valid = false;
            break;
          }
        }
      }
      if (!valid) { invalidOptions.push(ref.name || id || '?'); continue; }
      options = labels.join(' · ').slice(0, 200);
    } else if (opts && opts.publicCaller) {
      /* Aucun choix vérifié : le texte d'options et les vignettes venaient
       * tels quels de l'appelant. Sur la porte publique, un « Extras : Fromage,
       * Caviar x10 » tapé à la main sortait sur le bon cuisine au prix du plat
       * nu. Le téléphone envoie toujours ses choix structurés ; sans eux, la
       * ligne part sans options. (La caisse et l'app serveur, authentifiées,
       * gardent leur contrat.) */
      options = '';
      canonicalVisuals = [];
    }
    const formulaExtra = kind === 'formula' && formulaContext ? formulaContext.extra : 0;
    let unitPrice = kind === 'formula-part' ? 0 : price2(ref.price + optionExtra + formulaExtra);
    /* A running promotion lowers the unit price and leaves its stamp on the
     * line ({ id, name, badge, before }): the receipt names it and the report
     * can count what it cost. Composed menus and their parts are never
     * discounted (assets/menu-promos.js). No promotion: nothing changes. */
    let promo = null;
    if (promos.length) {
      const hit = resolveMenu(promos, { itemId: id, catId: ref.catId, kind }, unitPrice, MenuPromos().businessMoment(now));
      if (hit) { unitPrice = hit.price; promo = hit.promo; }
    }
    const line = { id, name: ref.name, qty, unitPrice, options, note, visuals: canonicalVisuals,
                   station: ref.station || '' };
    if (promo) line.promo = promo;
    if (l && l.uid) line.uid = String(l.uid).slice(0, 60);
    if (kind) line.kind = kind;
    if (formulaUid) line.formulaUid = formulaUid;
    if (l && l.formulaName) line.formulaName = String(l.formulaName).slice(0, 80);
    if (l && l.slotLabel) line.slotLabel = String(l.slotLabel).slice(0, 80);
    if (l && l.formulaSlotId) line.formulaSlotId = String(l.formulaSlotId).slice(0, 40);
    if (l && l.lineId) line.lineId = String(l.lineId).slice(0, 60);
    if (kind === 'formula-part') {
      /* `unitPrice` deliberately remains zero: the parent already carries the
       * supplement in the payable total. `formulaExtra` is presentation data
       * for the itemised receipt, computed from the published catalogue. */
      line.formulaExtra = Math.max(0, Number(formulaContext && formulaContext.choiceExtras
        && formulaContext.choiceExtras.get(l)) || 0);
    }
    lines.push(line);
    totalCents += Math.round(unitPrice * 100) * qty;
  }
  const total = totalCents / 100;

  return {
    lines, total,
    priced: true,             // on n'arrive ici qu'avec un catalogue en main
    noCatalogue: false,
    menuRev,
    unknown, unavailable, formulaOnly, archived, invalidOptions,
  };
}
