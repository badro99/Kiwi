// functions/api/order/_lib.js — ce que les trois moitiés du relais partagent.
//
// Le relais OrderPro a trois portes : /api/order (le téléphone dépose),
// /api/order/session (le téléphone s'assoit et demande s'il est encore le
// bienvenu) et /api/order/queue (le comptoir lit et décide). Elles avaient déjà
// commencé à recopier les mêmes règles — `startOfDay` existait mot pour mot en
// trois endroits, `orderProEnabled` en deux — et une règle recopiée est une
// règle qu'on corrigera une fois sur trois.
//
// Le préfixe « _ » exclut ce fichier du routage Pages : ce n'est pas une URL,
// c'est la bibliothèque des trois autres (même convention que functions/auth/_lib.js).

/* ── Le jour d'ouverture ───────────────────────────────────────────────────
 * Les limites de file repartent à 1 chaque jour. Le Maroc est à UTC+1 toute
 * l'année, donc la frontière se calcule à +1h : une commande de 00h30
 * appartient au jour qui commence, pas aux limites de la veille.
 * (Ce n'est PAS le « jour commercial » du rapport Z, qui suit les horaires
 * saisis par le commerçant — deux notions voisines et volontairement distinctes.) */
export function startOfDay(now) {
  const shifted = now + 3600000;
  return Math.floor(shifted / 86400000) * 86400000 - 3600000;
}

/* Les numéros lisibles des commandes restaurant repartent à 1 chaque lundi
 * à 00:00 (heure Maroc). Cette borne est distincte du jour commercial et ne
 * touche pas aux tickets boutique, dont la séquence sert aux retours. */
export function startOfWeek(now) {
  const day = startOfDay(now);
  const shiftedDay = new Date(day + 3600000).getUTCDay(); // 0 dim. … 6 sam.
  return day - ((shiftedDay + 6) % 7) * 86400000;
}

/* ── L'option est-elle ouverte chez ce commerçant ? ────────────────────────
 * ATTENTION, cette clé inverse la convention de merchant_config : partout
 * ailleurs une clé ABSENTE veut dire « module allumé », parce que ces modules
 * font partie de l'interface déjà payée. Order Pro est une option payante qui
 * transforme le téléphone d'un inconnu en terminal de commande : elle est
 * ÉTEINTE tant qu'un opérateur n'a pas écrit `true`.
 * Ligne absente, clé absente, JSON cassé, base en panne → false. */
export async function orderProEnabled(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT features FROM merchant_config WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row || !row.features) return false;
    return (JSON.parse(row.features) || {}).orderpro === true;
  } catch (_) { return false; }
}

/* ── Le numéro de table ────────────────────────────────────────────────────
 * L'ancienne règle était `replace(/\D/g,'')` : elle ne gardait que les
 * chiffres. Or le plan de salle laisse le patron nommer ses tables librement —
 * « T7 », « Terrasse 2 », « Bar ». Ces trois-là devenaient « 7 », « 2 » et « »
 * (vide), donc une commande de la terrasse 2 se posait sur la table 2 de la
 * salle, et le bar ne se rattachait à rien du tout.
 * On garde donc les lettres, et on borne : c'est une étiquette de table, pas
 * un champ libre. La normalisation (majuscules, espaces resserrés) sert au
 * rapprochement avec le plan, où « t7 » et « T7 » désignent la même table. */
export function normTable(v) {
  return String(v == null ? '' : v)
    .replace(/[^\p{L}\p{N} .\-_]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}
/* La clé de rapprochement, jamais ce qu'on affiche. */
export function tableKey(v) {
  return normTable(v).toUpperCase().replace(/\s+/g, '');
}

/* ── LE CURSEUR REGARDE LÉGÈREMENT EN ARRIÈRE ──────────────────────────────
 * Les sondages avancent avec `since` : le client renvoie le `now` de la réponse
 * précédente, et le serveur ne rend que ce qui a changé DEPUIS. Le piège est
 * d'une milliseconde, et il perd des commandes pour de bon.
 *
 * `now` est pris AVANT la lecture — il faut bien le prendre quelque part — et
 * plusieurs écritures peuvent s'intercaler entre les deux (l'expiration des
 * `pending`, le pointage des sessions). Une commande écrite dans cet intervalle
 * porte un `updated_ts` inférieur ou égal à `now` : la lecture de CE tour ne la
 * voit pas encore, et le tour SUIVANT l'exclut, puisqu'il ne demande que
 * `updated_ts > now`. Elle n'est jamais présentée. Comme la caisse n'attache
 * une commande à l'addition qu'au moment où on la lui présente, elle est perdue
 * pour l'addition — silencieusement.
 *
 * On recule donc le curseur de deux secondes. Le chevauchement re-présente
 * quelques commandes déjà connues, ce qui ne coûte rien : les trois clients
 * sont idempotents (marqueurs de ligne côté caisse, `opId` côté cuisine, `id`
 * côté salle). Un client qui perd une commande coûte de l'argent ; un client
 * qui la revoit ne coûte rien.
 *
 * Reculer le CURSEUR plutôt que corriger chaque client a une conséquence utile :
 * les navigateurs qui tournent encore sur une version en cache reçoivent le
 * correctif sans rien réinstaller. */
export const CURSOR_LAG_MS = 2000;
export function pollCursor(now) {
  return Math.max(0, Number(now) - CURSOR_LAG_MS);
}

/* ── L'identifiant de session ──────────────────────────────────────────────
 * Il EST la capacité : le téléphone n'a pas de compte, pas de mot de passe et
 * pas de cookie garanti (navigation privée, cookies coupés). C'est donc 132
 * bits tirés au sort et non un compteur — un identifiant devinable rendrait la
 * révocation décorative, puisqu'il suffirait de deviner la session suivante. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function newSessionId() {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return 'tsx-' + out;
}
export const SESSION_ID = /^tsx-[A-Za-z0-9]{22}$/;

/* ── La présence du comptoir ───────────────────────────────────────────────
 * C'est la seule protection sérieuse contre « je garde le lien et je commande
 * de chez moi ». Elle ne peut pas venir du téléphone, qui ment ; elle vient de
 * la caisse, qui interroge déjà sa file toutes les six secondes avec une
 * requête authentifiée. On note l'heure de ce passage, et ouvrir une session
 * exige que le comptoir ait donné signe de vie récemment.
 *
 * Commerce fermé ⇒ caisse éteinte ⇒ plus aucune session ne s'ouvre. Une porte
 * qui se ferme toute seule le soir, sans horaire à saisir et sans horloge à
 * régler.
 *
 * Le repli est délibéré et documenté : une base où `order_desk` n'existe pas
 * encore, ou un commerçant dont la caisse n'a JAMAIS sondé, laisse passer. Le
 * serveur ne peut pas distinguer « fermé » de « migration pas encore faite »,
 * et refuser dans le doute couperait la commande chez quelqu'un qui vient
 * d'activer l'option. Dès que la caisse a sondé une seule fois, la règle mord. */
export const DESK_FRESH_MS = 5 * 60 * 1000;   // le comptoir sonde toutes les 6 s

export async function deskTouch(env, merchant) {
  try {
    await env.DB.prepare(
      `INSERT INTO order_desk (merchant, seen_ts) VALUES (?, ?)
         ON CONFLICT(merchant) DO UPDATE SET seen_ts = excluded.seen_ts`
    ).bind(merchant, Date.now()).run();
  } catch (_) { /* table pas encore migrée → la présence reste inconnue, on laisse passer */ }
}

export async function deskOpen(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT seen_ts FROM order_desk WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row) return true;                 // jamais vue ⇒ inconnue, pas « fermée »
    return (Date.now() - (row.seen_ts || 0)) < DESK_FRESH_MS;
  } catch (_) { return true; }             // table absente ⇒ idem
}

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

export async function priceOrder(env, merchant, rawLines) {
  let menuRow = null;
  try {
    menuRow = await env.DB.prepare(
      'SELECT data, updated_ts FROM menus WHERE merchant = ?'
    ).bind(merchant).first();
  } catch (_) { menuRow = null; }

  let index = null;
  let optionIndex = new Map();
  let menuRev = null;
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
          for (const choice of (Array.isArray(group.choices) ? group.choices : [])) {
            if (!choice || !choice.name) continue;
            choices.set(String(choice.name).trim().toLocaleLowerCase('fr'), {
              name: String(choice.name).trim(),
              price: Math.max(0, Math.round(Number(choice.price) || 0)),
              emoji: String(choice.emoji || '').trim().slice(0, 16),
            });
          }
          optionIndex.set(String(group.id), {
            name: String(group.name || '').trim(),
            kind: group.kind === 'many' ? 'many' : 'one',
            choices,
          });
        }
        index = new Map();
        for (const it of items) {
          if (!it || !it.id) continue;
          index.set(String(it.id), {
            name: String(it.name || ''),
            price: Math.max(0, Math.round(Number(it.price) || 0)),
            avail: it.avail !== false,
            opts: new Set((Array.isArray(it.opts) ? it.opts : []).map(String)),
            formula: it.formula && Array.isArray(it.formula.slots) ? {
              slots: it.formula.slots.map((slot) => ({
                id: String((slot && slot.id) || ''),
                label: String((slot && slot.label) || '').trim(),
                min: Math.max(0, Math.round(Number(slot && slot.min) || 0)),
                max: Math.max(1, Math.round(Number(slot && slot.max) || 1)),
                choices: new Map((Array.isArray(slot && slot.choices) ? slot.choices : [])
                  .filter((choice) => choice && choice.itemId)
                  .map((choice) => [String(choice.itemId), Math.max(0, Math.round(Number(choice.extra) || 0))])),
              })).filter((slot) => slot.id && slot.choices.size),
            } : null,
            station: categoryStations.get(String(it.catId || '')) || fallbackStation,
          });
        }
        menuRev = menuRow.updated_ts || null;
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
              price: Math.max(0, Math.round(Number(p.priceMAD) || 0)),
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
  const invalidOptions = [];
  let total = 0;

  /* Rien contre quoi vérifier ⇒ on ne devine pas, on le DIT. L'appelant en fait
   * un 409 explicite ; il n'écrit jamais une commande dont il ne connaît pas le
   * prix. C'est la seule sortie possible ici : lire `l.unitPrice` reviendrait à
   * laisser un inconnu tarifer la marchandise d'un commerçant. */
  if (!index) {
    return { lines: [], total: 0, priced: false, noCatalogue: true, menuRev: null,
             unknown: [], unavailable: [] };
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
    const assigned = new Set();
    if (valid) {
      for (const slot of slots) {
        const selected = children.filter((child, childIndex) => {
          if (assigned.has(childIndex)) return false;
          const explicitSlot = String((child && child.formulaSlotId) || '');
          const lineId = String((child && child.lineId) || '');
          const label = String((child && child.slotLabel) || '').trim();
          return explicitSlot === slot.id || lineId === `${uid}-${slot.id}` || (!!slot.label && label === slot.label);
        });
        if (selected.length < slot.min || selected.length > slot.max) { valid = false; break; }
        for (const child of selected) {
          const childIndex = children.indexOf(child);
          const childId = String((child && child.id) || '');
          if (!slot.choices.has(childId)) { valid = false; break; }
          assigned.add(childIndex);
          extra += slot.choices.get(childId) || 0;
        }
        if (!valid) break;
      }
      if (assigned.size !== children.length) valid = false;
    }
    formulaContexts.set(uid, { valid, extra, parentId: String((parent && parent.id) || '') });
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
    if (!ref.avail) { unavailable.push(ref.name || id); continue; }
    const kind = String((l && l.kind) || '').slice(0, 20);
    const formulaUid = String((l && l.formulaUid) || '').slice(0, 40);
    const formulaContext = formulaUid ? formulaContexts.get(formulaUid) : null;
    if ((kind === 'formula' || kind === 'formula-part') && (!formulaContext || !formulaContext.valid)) {
      invalidOptions.push(ref.name || id);
      continue;
    }
    let optionExtra = 0;
    let canonicalVisuals = visuals;
    const selected = Array.isArray(l && l.optionChoices) ? l.optionChoices.slice(0, 40) : null;
    if (selected) {
      const labels = [];
      canonicalVisuals = [];
      const oneSeen = new Set();
      let valid = true;
      for (const picked of selected) {
        const groupId = String((picked && picked.group) || '').slice(0, 40);
        const labelKey = String((picked && picked.label) || '').trim().toLocaleLowerCase('fr');
        const group = optionIndex.get(groupId);
        const choice = group && group.choices.get(labelKey);
        if (!group || !ref.opts || !ref.opts.has(groupId) || !choice
            || (group.kind === 'one' && oneSeen.has(groupId))) {
          valid = false;
          break;
        }
        if (group.kind === 'one') oneSeen.add(groupId);
        labels.push(`${group.name}: ${choice.name}`);
        optionExtra += choice.price;
        canonicalVisuals.push({ emoji: choice.emoji || '', name: choice.name });
      }
      if (!valid) { invalidOptions.push(ref.name || id); continue; }
      options = labels.join(' · ').slice(0, 200);
    }
    const formulaExtra = kind === 'formula' && formulaContext ? formulaContext.extra : 0;
    const unitPrice = kind === 'formula-part' ? 0 : ref.price + optionExtra + formulaExtra;
    const line = { id, name: ref.name, qty, unitPrice, options, note, visuals: canonicalVisuals,
                   station: ref.station || '' };
    if (kind) line.kind = kind;
    if (formulaUid) line.formulaUid = formulaUid;
    if (l && l.formulaName) line.formulaName = String(l.formulaName).slice(0, 80);
    if (l && l.slotLabel) line.slotLabel = String(l.slotLabel).slice(0, 80);
    if (l && l.formulaSlotId) line.formulaSlotId = String(l.formulaSlotId).slice(0, 40);
    if (l && l.lineId) line.lineId = String(l.lineId).slice(0, 60);
    lines.push(line);
    total += unitPrice * qty;
  }

  return {
    lines, total,
    priced: true,             // on n'arrive ici qu'avec un catalogue en main
    noCatalogue: false,
    menuRev,
    unknown, unavailable, invalidOptions,
  };
}
