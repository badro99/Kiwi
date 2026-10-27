/* Private lazy registry. Classic dependencies execute in their declared order.
 * Only static assets are loaded; the original guest bootstrap waits for readiness. */
(() => {
  const definitions = new Map();
  let started = false;
  const scopes = Object.create(null), extensions = Object.create(null);
  const registry = {
    attach(name, scope) { scopes[name] = Object.freeze(scope); },
    run(name, factory) { extensions[name] = factory(scopes[name]); },
    extension(name, key) { return extensions[name] && extensions[name][key]; },
    owner: null,
    define(name, reads, factory) {
      if (definitions.has(name)) throw new Error('Duplicate OrderPro module: ' + name);
      definitions.set(name, { reads, factory });
      if (definitions.size === 5) registry.start();
    },
    create(name, scope) {
      const definition = definitions.get(name);
      if (Object.keys(scope).sort().join() !== [...definition.reads].sort().join()) throw new Error('Invalid OrderPro interface: ' + name);
      return definition.factory(Object.freeze(scope));
    },
    start() {
      if (started) return;
      started = true;
      Object.freeze(registry);
      start();
    },
  };
  window.KiwiOrderMenu.orderProParts = registry;
  function onReady(callback) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback);
    else callback();
  }
  function start() {
  const owner = KiwiOrderMenu.orderProParts.owner();
  const state = owner.view(["orderMode","tableNumber","orderNumber","cart","sentOrders","sentLines","sessionTotal","tipPercent","splitState","customizerItem","customizerSelections","customizerNote","customizerEditingKey","customizerEditingQty","serviceRequestPending","currentOrderId","pendingRef","lastStatus","guestReady","availabilitySignature","currentLang","OPT","MENU","MENU_ALL","MENU_SUBTABS"]);
  const instances = Object.create(null);
  const bindings = Object.create(state);
  for (const name of ["rebuildSent","saveSent","loadSent","clearSent","SESSION"]) Object.defineProperty(bindings, name, { get: () => instances.session[name] });
  for (const name of ["pressKey","renderTableDisplay","updateContinueState","chooseMode","seatHere","applyMenuMode","guestLand","commitTable"]) Object.defineProperty(bindings, name, { get: () => instances.table[name] });
  for (const name of ["feedMedia","dishMedia","dishTag","renderMenu","renderMenuSubtabs","activeMenuFilter","choiceLabel","groupLabel","choiceEmoji","describeOptions","describeOptionChoices","describeOptionVisuals","standaloneMenuItem","handleAddClick","initialCustomizerSelections","unansweredRequiredOption","syncCustomizerGate","openCustomizer","closeCustomizer","selectCustomizerChoice","customizerUnitPrice","refreshCustomizerPrice","confirmCustomizer","availabilityOf","bootRestaurant"]) Object.defineProperty(bindings, name, { get: () => instances.menu[name] });
  for (const name of ["lineKey","totals","refreshCartUI","addLineToCart","decFromCart","incFromCart","openCart","closeCart"]) Object.defineProperty(bindings, name, { get: () => instances.cart[name] });
  for (const name of ["sendServiceRequest","callServer","openBill","renderBill","closeBill","setTipPercent","confirmBill","openSplit","closeSplit","setSplitMode","setEgalCount","setArticleCount","setSplitPerson","toggleSplitItem","refreshSplitUI","personSubtotal","renderSplitArticle","confirmSplit","sendOrder","onSessionClosed","LIVE","onOrderStatus","applyOrderStatus","watchTableOrder","dropUnavailable","restartMenu","confirmCashierPayment","startPreparing","triggerReady","playChime","refreshPermBanner","askNotificationPermission"]) Object.defineProperty(bindings, name, { get: () => instances.payment[name] });
  with (bindings) {
    registry.attach('guest', {
      get I18N() { return I18N; },
      get MENU() { return MENU; },
      get MENU_ALL() { return MENU_ALL; },
      get NET() { return NET; },
      get OPT() { return OPT; },
      get SESSION() { return SESSION; },
      get STORE() { return STORE; },
      get activeMenuFilter() { return activeMenuFilter; },
      get applyMenuMode() { return applyMenuMode; },
      get applyStaticI18n() { return applyStaticI18n; },
      get cart() { return cart; },
      get closeBill() { return closeBill; },
      get currentLang() { return currentLang; },
      get escapeHtml() { return escapeHtml; },
      get gotoScreen() { return gotoScreen; },
      get handleAddClick() { return handleAddClick; },
      get itemOf() { return itemOf; },
      get lineKey() { return lineKey; },
      get money() { return money; },
      get nameOf() { return nameOf; },
      get openCart() { return openCart; },
      get orderMode() { return orderMode; },
      get refreshCartUI() { return refreshCartUI; },
      get renderMenu() { return renderMenu; },
      get sendServiceRequest() { return sendServiceRequest; },
      get sentLines() { return sentLines; },
      get sentOrders() { return sentOrders; },
      get sessionTotal() { return sessionTotal; },
      get showToast() { return showToast; },
      get t() { return t; },
      get tableNumber() { return tableNumber; },
      get toCents() { return toCents; },
    });

    registry.attach('boutique', {
      get $() { return $; },
      get escapeHtml() { return escapeHtml; },
      get money() { return money; },
      get t() { return t; },
      get toCents() { return toCents; },
    });
    Object.defineProperty(bindings, 'bootBoutique', { get: () => registry.extension('boutique', 'bootBoutique') });
    Object.defineProperty(bindings, 'stockOf', { get: () => registry.extension('boutique', 'stockOf') });
    Object.defineProperty(bindings, 'stockPill', { get: () => registry.extension('boutique', 'stockPill') });
    Object.defineProperty(bindings, 'renderBoutique', { get: () => registry.extension('boutique', 'renderBoutique') });
    Object.defineProperty(bindings, 'openBoutiqueItem', { get: () => registry.extension('boutique', 'openBoutiqueItem') });
    Object.defineProperty(bindings, 'openSheet', { get: () => registry.extension('boutique', 'openSheet') });
    Object.defineProperty(bindings, 'closeSheet', { get: () => registry.extension('boutique', 'closeSheet') });
    Object.defineProperty(bindings, 'openScanner', { get: () => registry.extension('boutique', 'openScanner') });
    Object.defineProperty(bindings, 'closeScanner', { get: () => registry.extension('boutique', 'closeScanner') });
    Object.defineProperty(bindings, 'resolveScan', { get: () => registry.extension('boutique', 'resolveScan') });
    /* ============ helpers ============ */
    const $  = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => [...c.querySelectorAll(s)];

    /* ═══════════════════════════════════════════════════════════════════════
       NET — the only way this app learns anything.
       ───────────────────────────────────────────────────────────────────────
       OrderPro is a guest's phone: no account, no session, no shared storage
       with the till. Every fact it shows (store name, menu, prices, stock) is
       fetched over the network from the merchant's published catalogue, and
       every order it sends goes over the network to the caisse. Deliberately
       NO localStorage read of catalogue/order state — the three brains
       (OrderPro · caisse · dashboard) sync through the backend, not through a
       browser.

       Store identity = the `s` slug in the NFC link. That slug is the same
       merchant key the caisse pairing spine uses, so a phone that tapped the
       tag in store A can only ever see and order from store A.

       Fail-soft contract: when the backend is absent (static host, not yet
       deployed) fetches resolve to null and the UI says so honestly. It never
       invents a menu and never fakes a sent order.
       ═══════════════════════════════════════════════════════════════════════ */
    const NET = (() => {
      const qs = new URLSearchParams(location.search);
      const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
      const slug = clean(qs.get('s') || qs.get('store') || '', 64).toLowerCase();
      const table = clean(qs.get('t') || qs.get('table') || '', 4).replace(/\D/g, '');
      const modeParam = clean(qs.get('m') || qs.get('mode') || '', 12).toLowerCase();

      async function getJSON(url) {
        try {
          const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
          if (!r.ok) return null;
          return await r.json();
        } catch (_) { return null; }        // offline / no backend → caller decides
      }
      async function postJSON(url, body) {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const j = await r.json().catch(() => null);
          if (!r.ok) return Object.assign({ ok: false, status: r.status, error: (j && j.error) || 'http-' + r.status }, j || {});
          return j || { ok: false, error: 'empty' };
        } catch (_) { return { ok: false, error: 'network' }; }
      }

      /* ?s=demo is the pitch demo (assets/orderpro-demo.js): its menu and its
         kitchen answer from the phone, and nothing reaches a server. */
      const demo = () => (slug === 'demo' && globalThis.KiwiOrderDemo) || null;

      return {
        slug, table,
        demo: slug === 'demo',
        mode: modeParam === 'takeout' || modeParam === 'emporter' ? 'takeout'
            : modeParam === 'table' || modeParam === 'sur-place' ? 'table' : '',
        /* The store's published catalogue — the SAME endpoint the QR self-order
           page reads (functions/api/menu.js), so a merchant publishes once and
           both surfaces see it. → { name, type, menu, shop, orderpro } */
        catalog: () => demo() ? demo().catalog() : getJSON('/api/menu?merchant=' + encodeURIComponent(slug)),
        /* Send one order to the caisse queue → { ok, id, number, total, lines } */
        placeOrder: (payload) => demo() ? demo().placeOrder(payload) : postJSON('/api/order', Object.assign({}, payload, { merchant: slug })),
        /* Poll one order's live status → { ok, status, number } */
        orderStatus: (id) => demo() ? demo().orderStatus(id) : getJSON('/api/order?merchant=' + encodeURIComponent(slug) +
                                     '&id=' + encodeURIComponent(id)),
        /* S'asseoir. La session lie CE téléphone à CETTE table, et la caisse
           peut la fermer : encaisser l'addition coupe le robinet, et le client
           qui aurait gardé le lien ne peut plus commander de chez lui.
           → { ok, session, mode, table, status } */
        openSession: (mode, table) => demo() ? demo().openSession(mode, table) : postJSON('/api/order/session',
          { merchant: slug, mode: mode, table: table || '' }),
        /* Suis-je encore le bienvenu ? C'est aussi le battement de cœur qui
           allume la table sur le plan de salle du comptoir.
           → { ok, status, closedBy, table, mode } */
        sessionStatus: (id) => demo() ? demo().sessionStatus(id) : getJSON('/api/order/session?merchant=' + encodeURIComponent(slug) +
                                       '&session=' + encodeURIComponent(id)),
        serviceRequest: (session, action) => demo() ? demo().serviceRequest(session, action) : postJSON('/api/order/session',
          { merchant: slug, session, action }),
      };
    })();

    /* ============ i18n dictionary (Darija / EN / FR) ============ */
    const I18N = {
      fr: {
        greet_line1: "Bonjour,",
        greet_em: "bienvenue.",
        greet_sub_loc: "",
        greet_sub_em: "commandez depuis votre table",
        brand_tag: "",
        mode_ask_pre: "Comment commandez-vous",
        mode_ask_em: "aujourd'hui",
        mode_ask_post: "?",
        mode_sub: "Choisissez votre formule pour démarrer.",
        mode_table_label: "Je suis à table",
        mode_table_desc: "Commande envoyée au serveur · paiement à la table",
        mode_takeout_label: "À emporter",
        mode_takeout_desc: "Paiement à la caisse · on vous prévient quand c'est prêt",
        mode_foot: "Établissement · service self-order",
        mode_foot_service: "service self-order",
        table_ask_pre: "Quel est votre",
        table_ask_em: "numéro de table",
        table_ask_post: "?",
        table_hint: "Le numéro est gravé sur le bois de la table",
        btn_continue: "Continuer",
        menu_loc: "",
        badge_takeout: "À emporter",
        badge_table: "Table",
        tab_all: "Tout",
        dish_out: "Épuisé",
        tab_coffee: "Café",
        tab_pastry: "Pâtisserie",
        tab_savory: "Salé",
        tab_drink: "Boissons",
        tag_new: "Nouveau",
        tag_formula: "Formule",
        service_call: "Appeler l’équipe",
        service_bill: "Addition",
        cart_pill: "Voir ma commande",
        custom_from: "À partir de",
        custom_note_label: "Demande spéciale",
        custom_note_optional: "facultatif",
        custom_note_placeholder: "Ex : peu de glaçons, sans sel, allergie aux noix…",
        custom_price: "Prix",
        btn_add: "Ajouter",
        opt_choose_one: "choisir 1",
        opt_choose_many: "plusieurs possibles",
        opt_required: "obligatoire",
        opt_required_missing: "Choisissez une option pour « {name} ».",
        opt_unavailable: "Option indisponible",
        // Per-option translations go here, keyed opt_label_<key> and opt_<key>_<choiceId>.
        // Missing keys fall back to the OPT definition's own label. Add per client menu.
        opt_retirer_prefix: "Sans ",
        cart_title: "Votre commande",
        cart_empty: "Panier vide, choisissez quelque chose au menu.",
        cart_total: "Total",
        cart_note_table: "Paiement à la table après votre dernière commande.",
        cart_note_takeout_html: "Paiement à la <em>caisse</em> · on vous prévient quand c'est prêt.",
        cart_subtitle_table: "Table {n}",
        cart_subtitle_takeout: "À emporter",
        send_table: "Envoyer en cuisine",
        send_takeout: "Passer commande",
        success_title_a: "Commande envoyée",
        success_title_em: "à l’équipe.",
        success_title_em_kitchen: "en cuisine.",
        success_eta_pre: "Table",
        success_eta_mid: "·",
        success_eta_em: "En attente de la caisse",
        success_recap: "Votre commande",
        success_note: "Le paiement se fait à votre table. Vous pouvez ajouter d'autres articles si vous voulez.",
        success_cta: "Ajouter à ma commande",
        cashier_eyebrow: "à emporter",
        cashier_instr_pre: "Présentez ce numéro à la",
        cashier_instr_em: "caisse",
        cashier_instr_post: "pour régler.",
        cashier_recap: "Votre commande",
        cashier_total: "Total",
        cashier_confirm: "Paiement confirmé à la caisse",
        cashier_hint: "Le caissier valide votre paiement. Une fois validé, vous pouvez sortir, on vous prévient quand c'est prêt.",
        prep_eyebrow_pre: "commande #",
        prep_title_pre: "En préparation",
        prep_title_em: "en cuisine.",
        prep_ready_in: "Prêt dans",
        prep_now: "maintenant",
        prep_perm_default: "Recevez une notification quand c'est prêt, gardez votre téléphone à côté.",
        prep_perm_granted_html: "<strong>Notifications activées.</strong> On vous prévient même si vous quittez la page.",
        prep_perm_denied: "Notifications désactivées. Gardez cette page ouverte : elle sonnera quand votre commande sera prête.",
        prep_perm_unsupported: "Ce navigateur ne gère pas les notifications, gardez la page ouverte, on vous prévient ici.",
        prep_perm_btn: "Activer",
        prep_note_pre: "Vous pouvez attendre",
        prep_note_em: "où vous voulez",
        prep_note_post: ". Une notification vous prévient dès que c'est prêt, avec un son tant que cette page est ouverte.",
        ready_title_a: "Votre commande est",
        ready_title_em: "prête.",
        ready_loc_post: "",
        ready_cta: "Récupérer au comptoir",
        bill_title: "Mes commandes",
        bill_scope: "Commandes envoyées depuis ce téléphone. Demandez l’addition complète à l’équipe.",
        bill_empty: "Aucune commande passée, ajoutez d'abord au menu.",
        bill_subtotal: "Sous-total",
        tip_eyebrow: "Pourboire pour l'équipe",
        tip_level_0: "Pas de pourboire",
        tip_level_1: "Un petit geste, merci",
        tip_level_2: "C'est sympa, merci",
        tip_level_3: "L'équipe vous remercie",
        tip_level_4: "Très généreux, bravo",
        tip_level_5: "Pourboire de chef",
        bill_total: "Total, pourboire compris",
        tip_note: "Indicatif : ce téléphone ne paie rien, le pourboire se remet au serveur et n’est pas ajouté à l’addition.",
        bill_confirm: "Demander l'addition",
        split_open: "Diviser l'addition",
        split_title: "Diviser l'addition",
        split_subtitle_tpl: "Table {n} · {total} {cur} à partager",
        split_mode_egal: "Parts égales",
        split_mode_egal_desc: "Tout le monde paie la même somme",
        split_mode_article: "Par article",
        split_mode_article_desc: "Chacun paie ce qu'il a pris",
        split_people_count: "Nombre de personnes",
        split_subtotal: "Sous-total",
        split_tip: "Pourboire",
        split_per_person: "Par personne",
        split_select_person: "Sélectionnez la personne",
        split_tap_items: "Tapez les articles consommés",
        split_confirm: "Confirmer le partage",
        split_person_pre: "Conv.",
        toast_split_egal: "À annoncer au serveur ·",
        toast_added: "ajouté",
        toast_server_coming_pre: "Demande transmise à l’équipe · Table",
        toast_bill_asked_pre: "Addition demandée ·",
        toast_bill_tip_post: "pourboire",
        notif_ready_title: "Établissement",
        notif_ready_body_pre: "Commande #",
        notif_ready_body_post: "prête à récupérer.",
        currency: "MAD",
        // ── boot / connection states (the honest ones — never a fake menu) ──
        boot_loading: "Connexion à l'établissement…",
        boot_nolink_title: "Lien incomplet",
        boot_nolink_body: "Approchez à nouveau votre téléphone du tag de l'établissement pour ouvrir la carte.",
        boot_offline_title: "Service indisponible",
        boot_offline_body: "Impossible de joindre l'établissement. Vérifiez votre connexion, puis réessayez.",
        boot_unknown_title: "Établissement introuvable",
        boot_unknown_body: "Ce tag ne correspond à aucun établissement actif.",
        boot_off_title: "Commande en ligne désactivée",
        boot_off_body: "Cet établissement ne prend pas les commandes depuis le téléphone pour le moment.",
        boot_empty_title: "Carte pas encore publiée",
        boot_empty_body: "L'établissement n'a pas encore publié sa carte. Adressez-vous au comptoir.",
        boot_retry: "Réessayer",
        // ── order relay ──
        order_sending: "Envoi…",
        order_failed: "Commande non envoyée · réessayez",
        order_offline: "Pas de connexion · commande non envoyée",
        order_unconfirmed: "Envoi non confirmé · réessayez, sans créer une nouvelle commande",
        order_retry_local: "Envoi non confirmé · gardez cette page ouverte et réessayez ici",
        boot_closed_title: "Service fermé",
        boot_closed_body: "L'établissement ne prend pas de commandes en ce moment. Repassez pendant le service.",
        order_closed: "Le service vient de fermer · commande non envoyée",
        order_refused: "Le comptoir n'a pas pu prendre cette commande",
        order_archived: "Cette commande a été retirée du suivi au comptoir. Contactez l’équipe si vous attendez encore votre retrait.",
        order_served: "Servie · bon appétit",
        order_gone: "Plus disponible : {n}",
        order_options_changed: "Options à rechoisir pour {n}",
        order_menu_updated: "La carte a changé · vérifiez votre commande",
        order_item_fallback: "un article",
        thanks_title_a: "Merci de votre",
        thanks_title_em: "visite.",
        thanks_sub: "Votre addition est réglée. À très bientôt.",
        thanks_expired: "Votre session s'est terminée. À très bientôt.",
        thanks_again: "Pour commander à nouveau, approchez votre téléphone du tag.",
        thanks_reorder: "Commander à nouveau",
        prep_waiting: "En attente de la caisse",
        prep_accepted: "Acceptée · en préparation",
        prep_ready: "Prête · elle arrive",
        order_refused_n: "Commande {n} refusée par le comptoir · retirée de votre addition",
        order_busy: "Beaucoup de commandes en attente · appelez l’équipe",
        bill_order_label: "Commande",
        bill_order_refused: "Refusée · non comptée",
        // ── boutique vertical ──
        bq_title: "Nos produits",
        bq_scan: "Scanner un produit",
        bq_scan_hint: "Visez le code-barres de l'étiquette",
        bq_manual: "Saisir le code",
        bq_manual_ph: "Code-barres",
        bq_search_ph: "Rechercher un produit",
        bq_not_found: "Code inconnu dans cette boutique",
        bq_stock: "Stock",
        bq_sizes: "Tailles",
        bq_colors: "Couleurs",
        bq_instock: "En stock",
        bq_lowstock: "Dernières pièces",
        bq_outstock: "Épuisé",
        bq_empty: "Aucun produit publié pour le moment.",
        bq_noresult: "Aucun produit ne correspond.",
        bq_close: "Fermer",
        bq_camera_denied: "Caméra refusée · saisissez le code à la main.",
        bq_camera_none: "Scan caméra indisponible sur cet appareil · saisissez le code.",
        bq_foot: "Consultation uniquement · passez en caisse pour acheter",
      },
      en: {
        greet_line1: "Hello,",
        greet_em: "welcome.",
        greet_sub_loc: "",
        greet_sub_em: "order from your table",
        brand_tag: "",
        mode_ask_pre: "How are you ordering",
        mode_ask_em: "today",
        mode_ask_post: "?",
        mode_sub: "Pick how you want to start.",
        mode_table_label: "I'm at a table",
        mode_table_desc: "Order goes to the waiter · pay at your table",
        mode_takeout_label: "Takeout",
        mode_takeout_desc: "Pay at the counter · we'll notify you when it's ready",
        mode_foot: "Venue · self-order service",
        mode_foot_service: "self-order service",
        table_ask_pre: "What's your",
        table_ask_em: "table number",
        table_ask_post: "?",
        table_hint: "The number is engraved on the table",
        btn_continue: "Continue",
        menu_loc: "",
        badge_takeout: "Takeout",
        badge_table: "Table",
        tab_all: "All",
        dish_out: "Sold out",
        tab_coffee: "Coffee",
        tab_pastry: "Pastries",
        tab_savory: "Savory",
        tab_drink: "Drinks",
        tag_new: "New",
        tag_formula: "Set menu",
        service_call: "Call the team",
        service_bill: "Bill",
        cart_pill: "View my order",
        custom_from: "From",
        custom_note_label: "Special request",
        custom_note_optional: "optional",
        custom_note_placeholder: "Ex: less ice, no salt, nut allergy…",
        custom_price: "Price",
        btn_add: "Add",
        opt_choose_one: "pick 1",
        opt_choose_many: "pick any",
        opt_required: "required",
        opt_required_missing: "Choose an option for “{name}”.",
        opt_unavailable: "Option unavailable",
        // Per-option translations go here, keyed opt_label_<key> and opt_<key>_<choiceId>.
        // Missing keys fall back to the OPT definition's own label. Add per client menu.
        opt_retirer_prefix: "No ",
        cart_title: "Your order",
        cart_empty: "Cart is empty, pick something from the menu.",
        cart_total: "Total",
        cart_note_table: "Payment happens at the table after your last order.",
        cart_note_takeout_html: "Pay at the <em>counter</em> · we'll notify you when it's ready.",
        cart_subtitle_table: "Table {n}",
        cart_subtitle_takeout: "Takeout",
        send_table: "Send to kitchen",
        send_takeout: "Place order",
        success_title_a: "Order sent to",
        success_title_em: "the team.",
        success_title_em_kitchen: "the kitchen.",
        success_eta_pre: "Table",
        success_eta_mid: "·",
        success_eta_em: "Waiting for the till",
        success_recap: "Your order",
        success_note: "You'll pay at your table. Feel free to add more items if you want.",
        success_cta: "Add to my order",
        cashier_eyebrow: "takeout",
        cashier_instr_pre: "Show this number at the",
        cashier_instr_em: "counter",
        cashier_instr_post: "to pay.",
        cashier_recap: "Your order",
        cashier_total: "Total",
        cashier_confirm: "Payment confirmed at counter",
        cashier_hint: "The cashier validates your payment. Once validated, you can step out, we'll notify you when it's ready.",
        prep_eyebrow_pre: "order #",
        prep_title_pre: "Preparing",
        prep_title_em: "in the kitchen.",
        prep_ready_in: "Ready in",
        prep_now: "now",
        prep_perm_default: "Get notified when it's ready, keep your phone nearby.",
        prep_perm_granted_html: "<strong>Notifications on.</strong> We'll alert you even if you leave this page.",
        prep_perm_denied: "Notifications are off. Keep this page open and it will chime when your order is ready.",
        prep_perm_unsupported: "This browser doesn't support notifications, keep the page open, we'll notify you here.",
        prep_perm_btn: "Enable",
        prep_note_pre: "You can wait",
        prep_note_em: "wherever you like",
        prep_note_post: ". A notification tells you the moment it's ready, with a chime while this page is open.",
        ready_title_a: "Your order is",
        ready_title_em: "ready.",
        ready_loc_post: "",
        ready_cta: "Pick up at the counter",
        bill_title: "My orders",
        bill_scope: "Orders sent from this phone. Ask the team for the complete table bill.",
        bill_empty: "No orders placed, add something from the menu first.",
        bill_subtotal: "Subtotal",
        tip_eyebrow: "Tip for the team",
        tip_level_0: "No tip",
        tip_level_1: "A small gesture, thanks",
        tip_level_2: "That's nice, thanks",
        tip_level_3: "The team thanks you",
        tip_level_4: "Very generous, bravo",
        tip_level_5: "A chef's tip",
        bill_total: "Total, tip included",
        tip_note: "For guidance only: this phone pays nothing; hand the tip to your waiter, it is not added to the bill.",
        bill_confirm: "Ask for the bill",
        split_open: "Split the bill",
        split_title: "Split the bill",
        split_subtitle_tpl: "Table {n} · {total} {cur} to split",
        split_mode_egal: "Equal shares",
        split_mode_egal_desc: "Everyone pays the same",
        split_mode_article: "By item",
        split_mode_article_desc: "Pay only what you ordered",
        split_people_count: "Number of people",
        split_subtotal: "Subtotal",
        split_tip: "Tip",
        split_per_person: "Per person",
        split_select_person: "Pick the person",
        split_tap_items: "Tap the items they had",
        split_confirm: "Confirm the split",
        split_person_pre: "Pers.",
        toast_split_egal: "Tell your waiter ·",
        toast_added: "added",
        toast_server_coming_pre: "Request sent to the team · Table",
        toast_bill_asked_pre: "Check requested ·",
        toast_bill_tip_post: "tip",
        notif_ready_title: "Venue",
        notif_ready_body_pre: "Order #",
        notif_ready_body_post: "ready to pick up.",
        currency: "MAD",
        boot_loading: "Connecting to the venue…",
        boot_nolink_title: "Incomplete link",
        boot_nolink_body: "Tap your phone on the venue's tag again to open the menu.",
        boot_offline_title: "Service unavailable",
        boot_offline_body: "Couldn't reach the venue. Check your connection and try again.",
        boot_unknown_title: "Venue not found",
        boot_unknown_body: "This tag doesn't match any active venue.",
        boot_off_title: "Phone ordering is off",
        boot_off_body: "This venue isn't taking orders from the phone right now.",
        boot_empty_title: "Menu not published yet",
        boot_empty_body: "The venue hasn't published its menu yet. Please ask at the counter.",
        boot_retry: "Try again",
        order_sending: "Sending…",
        order_failed: "Order not sent · try again",
        order_offline: "No connection · order not sent",
        order_unconfirmed: "Send unconfirmed · retry without creating a new order",
        order_retry_local: "Send unconfirmed · keep this page open and retry here",
        boot_closed_title: "Closed",
        boot_closed_body: "This venue isn't taking orders right now. Come back during service.",
        order_closed: "Service just closed · order not sent",
        order_refused: "The counter couldn't take this order",
        order_archived: "This order was removed from counter tracking. Please contact the team if you are still waiting to collect it.",
        order_served: "Served · enjoy",
        order_gone: "No longer available: {n}",
        order_options_changed: "Please reselect options for {n}",
        order_menu_updated: "The menu has changed · please review your order",
        order_item_fallback: "an item",
        thanks_title_a: "Thank you for",
        thanks_title_em: "visiting.",
        thanks_sub: "Your bill is settled. See you soon.",
        thanks_expired: "Your session has ended. See you soon.",
        thanks_again: "To order again, tap your phone on the tag.",
        thanks_reorder: "Order again",
        prep_waiting: "Waiting for the till",
        prep_accepted: "Accepted · being prepared",
        prep_ready: "Ready · on its way",
        order_refused_n: "Order {n} refused by the counter · removed from your bill",
        order_busy: "Lots of orders waiting · please call the team",
        bill_order_label: "Order",
        bill_order_refused: "Refused · not counted",
        bq_title: "Our products",
        bq_scan: "Scan a product",
        bq_scan_hint: "Point at the barcode on the tag",
        bq_manual: "Enter the code",
        bq_manual_ph: "Barcode",
        bq_search_ph: "Search a product",
        bq_not_found: "Unknown code in this store",
        bq_stock: "Stock",
        bq_sizes: "Sizes",
        bq_colors: "Colours",
        bq_instock: "In stock",
        bq_lowstock: "Last pieces",
        bq_outstock: "Out of stock",
        bq_empty: "No products published yet.",
        bq_noresult: "No product matches.",
        bq_close: "Close",
        bq_camera_denied: "Camera denied · type the code instead.",
        bq_camera_none: "Camera scanning isn't available on this device · type the code.",
        bq_foot: "Browsing only · pay at the till to buy",
      },
      ar: {
        greet_line1: "السلام،",
        greet_em: "مرحبا بيكم.",
        greet_sub_loc: "",
        greet_sub_em: "اطلب من الطاولة ديالك",
        brand_tag: "",
        mode_ask_pre: "كيفاش بغيتي تطلب",
        mode_ask_em: "اليوم",
        mode_ask_post: "؟",
        mode_sub: "اختار طريقة الطلب باش نبداو.",
        mode_table_label: "أنا فالطاولة",
        mode_table_desc: "الطلب كيوصل للجارسون · الخلاص فالطاولة",
        mode_takeout_label: "للأخذ معايا",
        mode_takeout_desc: "الخلاص فالكيسة · غادي نخبروك ملي يكون واجد",
        mode_foot: "المحل · خدمة الطلب الذاتي",
        mode_foot_service: "خدمة الطلب الذاتي",
        table_ask_pre: "شنو هو",
        table_ask_em: "رقم الطاولة ديالك",
        table_ask_post: "؟",
        table_hint: "الرقم مكتوب على الطاولة",
        btn_continue: "كمل",
        menu_loc: "",
        badge_takeout: "للأخذ",
        badge_table: "طاولة",
        tab_all: "الكل",
        dish_out: "نفد",
        tab_coffee: "قهوة",
        tab_pastry: "حلويات",
        tab_savory: "ساندويتش",
        tab_drink: "مشروبات",
        tag_new: "جديد",
        tag_formula: "منيو كامل",
        service_call: "نادي على الطاقم",
        service_bill: "الحساب",
        cart_pill: "شوف الطلب ديالي",
        custom_from: "إبتدا من",
        custom_note_label: "طلب خاص",
        custom_note_optional: "اختياري",
        custom_note_placeholder: "مثلاً: شوية ديال الجليد، بلا ملح، حساسية…",
        custom_price: "الثمن",
        btn_add: "زيد",
        opt_choose_one: "اختار 1",
        opt_choose_many: "اختار اللي بغيتي",
        opt_required: "ضروري",
        opt_required_missing: "اختار واحد الاختيار فـ «{name}».",
        opt_unavailable: "خيار غير متوفر",
        // Per-option translations go here, keyed opt_label_<key> and opt_<key>_<choiceId>.
        // Missing keys fall back to the OPT definition's own label. Add per client menu.
        opt_retirer_prefix: "بلا ",
        cart_title: "الطلب ديالك",
        cart_empty: "الطلب خاوي، اختار شي حاجة من المنيو.",
        cart_total: "المجموع",
        cart_note_table: "الخلاص فالطاولة من بعد آخر طلب.",
        cart_note_takeout_html: "الخلاص فـ<em>الكيسة</em> · غادي نخبروك ملي يكون واجد.",
        cart_subtitle_table: "طاولة {n}",
        cart_subtitle_takeout: "للأخذ",
        send_table: "صيفط للمطبخ",
        send_takeout: "أكد الطلب",
        success_title_a: "الطلب تصيفط",
        success_title_em: "للفريق.",
        success_title_em_kitchen: "للمطبخ.",
        success_eta_pre: "طاولة",
        success_eta_mid: "·",
        success_eta_em: "كنتسناو الكيس",
        success_recap: "الطلب ديالك",
        success_note: "الخلاص فالطاولة. تقدر تزيد طلبات أخرى إلا بغيتي.",
        success_cta: "زيد لطلبي",
        cashier_eyebrow: "للأخذ",
        cashier_instr_pre: "ورّي هاد الرقم فـ",
        cashier_instr_em: "الكيسة",
        cashier_instr_post: "باش تخلص.",
        cashier_recap: "الطلب ديالك",
        cashier_total: "المجموع",
        cashier_confirm: "الخلاص تأكد فالكيسة",
        cashier_hint: "الكيسة كتصادق على الخلاص ديالك. ملي تصادق، تقدر تخرج، غادي نخبروك ملي يكون واجد.",
        prep_eyebrow_pre: "طلب رقم #",
        prep_title_pre: "فالتحضير",
        prep_title_em: "فالمطبخ.",
        prep_ready_in: "واجد ف",
        prep_now: "دابا",
        prep_perm_default: "خد إشعار ملي يكون واجد، خلي تلفونك معاك.",
        prep_perm_granted_html: "<strong>الإشعارات مفعلة.</strong> غادي نخبروك حتى إلا خرجتي من الصفحة.",
        prep_perm_denied: "الإشعارات مسدودة. خلّي هاد الصفحة محلولة وغادي تصوّت ملي تكون الطلبية واجدة.",
        prep_perm_unsupported: "هاد المتصفح ما كيدعمش الإشعارات، خلي الصفحة محلولة، غادي نخبروك هنا.",
        prep_perm_btn: "فعّل",
        prep_note_pre: "تقدر تستنى",
        prep_note_em: "فين بغيتي",
        prep_note_post: ". غادي يوصلك إشعار ملي يكون واجد، مع صوت إلا كانت هاد الصفحة محلولة.",
        ready_title_a: "الطلب ديالك",
        ready_title_em: "واجد.",
        ready_loc_post: "",
        ready_cta: "خد الطلب من الكونتوار",
        bill_title: "طلباتي",
        bill_scope: "الطلبات المرسلة من هذا الهاتف. اطلب الحساب الكامل للطاولة من الطاقم.",
        bill_empty: "ما عندك حتى طلب، زيد شي حاجة من المنيو أول.",
        bill_subtotal: "المجموع الفرعي",
        tip_eyebrow: "البقشيش للفريق",
        tip_level_0: "بلا بقشيش",
        tip_level_1: "شوية، شكراً",
        tip_level_2: "مزيان، شكراً",
        tip_level_3: "الفريق كيشكروك",
        tip_level_4: "كريم بزاف، برافو",
        tip_level_5: "بقشيش ديال الشيف",
        bill_total: "المجموع، مع البقشيش",
        tip_note: "غير ملزم: هاد التيليفون ما كيخلص والو، البقشيش كيتعطى للجارسون وما كيتزادش فالحساب.",
        bill_confirm: "طلب الحساب",
        split_open: "قسّم الحساب",
        split_title: "قسّم الحساب",
        split_subtitle_tpl: "طاولة {n} · {total} {cur} للتقسيم",
        split_mode_egal: "بالتساوي",
        split_mode_egal_desc: "الجميع كيخلصو نفس الشي",
        split_mode_article: "حسب الطلب",
        split_mode_article_desc: "كل واحد كيخلص اللي كلا",
        split_people_count: "عدد الناس",
        split_subtotal: "المجموع الفرعي",
        split_tip: "البقشيش",
        split_per_person: "للواحد",
        split_select_person: "اختار الشخص",
        split_tap_items: "كبس على الطلبات اللي كلاهم",
        split_confirm: "أكد التقسيم",
        split_person_pre: "ش.",
        toast_split_egal: "قول للجارسون ·",
        toast_added: "تزاد",
        toast_server_coming_pre: "تم إرسال الطلب للطاقم · طاولة",
        toast_bill_asked_pre: "الحساب تطلب ·",
        toast_bill_tip_post: "بقشيش",
        notif_ready_title: "المحل",
        notif_ready_body_pre: "طلب #",
        notif_ready_body_post: "واجد، تقدر تخدو.",
        currency: "درهم",
        boot_loading: "كنتواصلو مع المحل…",
        boot_nolink_title: "الرابط ناقص",
        boot_nolink_body: "قرّب تيليفونك مرة أخرى من التاڭ ديال المحل باش تحل القائمة.",
        boot_offline_title: "الخدمة ماخدامة",
        boot_offline_body: "ماقدرناش نوصلو للمحل. شوف الكونيكسيون وعاود جرّب.",
        boot_unknown_title: "المحل مالقيناهش",
        boot_unknown_body: "هاد التاڭ ماكيوافق حتى محل خدام.",
        boot_off_title: "الطلب من التيليفون مطفي",
        boot_off_body: "هاد المحل دابا ماكياخدش الطلبات من التيليفون.",
        boot_empty_title: "القائمة مازال مانشرات",
        boot_empty_body: "المحل مازال مانشرش القائمة ديالو. سول فالكونطوار.",
        boot_retry: "عاود جرّب",
        order_sending: "كنصيفطو…",
        order_failed: "الطلب ماتصيفطش · عاود جرّب",
        order_offline: "ماكاينش كونيكسيون · الطلب ماتصيفطش",
        order_unconfirmed: "الإرسال ما تأكدش · عاود جرّب بلا ما تنشئ طلب جديد",
        order_retry_local: "الإرسال ما تأكدش · خلي هاد الصفحة محلولة وعاود جرّب هنا",
        boot_closed_title: "الخدمة محلولة ماشي دابا",
        boot_closed_body: "هاد المحل ماكيديش الطلبات دابا. رجع فوقت الخدمة.",
        order_closed: "الخدمة تسدّات · الطلب ماتصيفطش",
        order_refused: "الكونطوار ماقدرش ياخد هاد الطلب",
        order_archived: "تحيدات هاد الطلبية من لائحة المتابعة. تواصل مع الفريق إلا مازال كتسنى تستلمها.",
        order_served: "تقدّم · بالصحة",
        order_gone: "ماكاينش: {n}",
        order_options_changed: "يرجى إعادة اختيار خيارات {n}",
        order_menu_updated: "تبدلات القائمة · عافاك راجع الطلب ديالك",
        order_item_fallback: "أحد الأطباق",
        thanks_title_a: "شكراً على",
        thanks_title_em: "الزيارة.",
        thanks_sub: "الحساب تخلّص. نتلاقاو قريب.",
        thanks_expired: "الجلسة ديالك سالات. نتلاقاو قريب.",
        thanks_again: "باش تطلب من جديد، قرّب تيليفونك من التاڭ.",
        thanks_reorder: "طلب من جديد",
        prep_waiting: "كنتسناو الكيس",
        prep_accepted: "تقبل · كيتوجد",
        prep_ready: "واجد · جاي ليك",
        order_refused_n: "الطلب {n} ماتقبلش من الكونطوار · تحيّد من الحساب ديالك",
        order_busy: "بزاف ديال الطلبات كتسنى · عيّط للفريق",
        bill_order_label: "الطلب",
        bill_order_refused: "ماتقبلش · ماتحسبش",
        bq_title: "المنتوجات ديالنا",
        bq_scan: "سكاني منتوج",
        bq_scan_hint: "وجّه على الكود-بار ديال الإتيكيت",
        bq_manual: "دخّل الكود",
        bq_manual_ph: "كود-بار",
        bq_search_ph: "قلّب على منتوج",
        bq_not_found: "هاد الكود ماكاينش فهاد المحل",
        bq_stock: "المخزون",
        bq_sizes: "القياسات",
        bq_colors: "الألوان",
        bq_instock: "كاين",
        bq_lowstock: "آخر القطع",
        bq_outstock: "سالا",
        bq_empty: "حتى منتوج مانشر دابا.",
        bq_noresult: "حتى منتوج ماتوافق.",
        bq_close: "سد",
        bq_camera_denied: "الكاميرا مرفوضة · دخّل الكود بيدك.",
        bq_camera_none: "السكان بالكاميرا ماكاينش فهاد الجهاز · دخّل الكود.",
        bq_foot: "غير للتصفح · خلّص فالكيس باش تشري",
      },
    };

    /* Stage 3c: the QR page's strings (hours, nutrition, browse-only) and one
       dictionary per language a store may publish, over EN. */
    if (globalThis.KiwiOrderMenu) KiwiOrderMenu.strings(I18N);

    /* ============ menu item translations ============
       Per-item name/desc translations, keyed by the item id used in MENU.
       Empty in the white-label template — add one entry per menu item, e.g.:
         fr: { "mon-plat": { name: "Mon plat", desc: "Description…" } },
       Items with no entry fall back to the `name`/`desc` defined in MENU. */
    /* Traductions portées par la carte publiée (assets/menu-i18n.js) — même
       empreinte qu'au tableau de bord (djb2 → base36 sur « nom␟description ») ;
       une traduction périmée (le patron a renommé) retombe sur son texte. */
    function menuHash(name, desc) {
      const str = String(name == null ? '' : name).trim() + '\u001f' + String(desc == null ? '' : desc).trim();
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
      return (h >>> 0).toString(36);
    }
    function menuTr(e, l) {
      const tr = globalThis.KiwiOrderMenu && KiwiOrderMenu.tr(e, l);
      if (tr) return tr;
      const x = e && e.i18n && e.i18n[l];
      if (!x || !x.name) return null;
      if (!x.m && x.h !== menuHash(e.name, e.desc)) return null;
      return x;
    }
    const MENU_I18N = {
      fr: {},
      en: {},
      ar: {},
    };

    /* ============ i18n state + helpers ============ */
    /* The QR page saved its choice as kiwiOrderLang; a guest it sent here
       keeps it. */
    const savedOrderLang = (() => {
      try { return localStorage.getItem('orderProLang') || localStorage.getItem('kiwiOrderLang') || ''; } catch (_) { return ''; }
    })();
    owner.initialize('currentLang', savedOrderLang || 'fr');
    function t(key) {
      /* A language beyond the three reads English where it has no line of its
         own (the QR page did the same); Arabic keeps French, as shipped. */
      const extra = currentLang !== 'fr' && currentLang !== 'ar' && currentLang !== 'en';
      return (I18N[currentLang] && I18N[currentLang][key]) ?? (extra ? I18N.en[key] : undefined) ?? I18N.fr[key] ?? key;
    }
    function itemI18n(id) {
      return (MENU_I18N[currentLang] && MENU_I18N[currentLang][id]) || MENU_I18N.fr[id] || { name: id, desc: '' };
    }
    function applyStaticI18n() {
      $$('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const val = t(key);
        if (/_html$/.test(key)) el.innerHTML = val;
        else el.textContent = val;
      });
      $$('[data-i18n-placeholder]').forEach(el => {
        el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
      });
      $$('[data-i18n-aria]').forEach(el => {
        el.setAttribute('aria-label', t(el.dataset.i18nAria));
      });
    }
    function applyLang(lang) {
      const OM = globalThis.KiwiOrderMenu;
      if (OM) lang = OM.asLang(lang) || lang;
      if (!I18N[lang] || (OM && !OM.langs().includes(lang))) lang = OM ? OM.pick('') : 'fr';
      if (!I18N[lang]) lang = 'fr';
      currentLang = lang;
      try { localStorage.setItem('orderProLang', lang); } catch (_) {}
      document.documentElement.lang = lang;
      document.documentElement.setAttribute('dir', (OM ? OM.rtl(lang) : lang === 'ar') ? 'rtl' : 'ltr');
      // Picker visual
      $$('.lang-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.lang === lang);
        b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
      });
      // Static
      applyStaticI18n();
      // Dynamic
      if (typeof renderMenu === 'function') {
        renderMenu(activeMenuFilter());
      }
      if (typeof applyMenuMode === 'function' && orderMode) applyMenuMode();
      if (typeof renderBoutique === 'function' && STORE.type === 'boutique') renderBoutique();
      if (typeof refreshCartUI === 'function') refreshCartUI();
      if (typeof refreshPermBanner === 'function') refreshPermBanner();
      if (typeof setTipPercent === 'function' && document.querySelector('#bill-sheet').classList.contains('is-open')) {
        setTipPercent(tipPercent);
      }
      if (typeof refreshSplitUI === 'function' && document.querySelector('#split-sheet')?.classList.contains('is-open')) {
        refreshSplitUI();
      }
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.onLang();
      if (typeof refreshHoursGate === 'function') refreshHoursGate();
    }

    /* ============ option presets — shared across items ============
       Reusable customization groups referenced from a menu item's `options` array.
       Empty in the white-label template. Define per client, e.g.:
         const OPT = {
           sucre: { key:'sucre', label:'Sucre', type:'single', default:'normal',
                    choices:[ {id:'normal', label:'Sucré', delta:0}, … ] },
           extras: { key:'extras', label:'Extras', type:'multi',
                     choices:[ {id:'x', label:'X', delta:2}, … ] },
         };
       type: 'single' (radio) | 'multi' (checkbox); delta is the price add in MAD. */
    owner.initialize('OPT', {});

    /* ============ menu data ============
       One object per item. Empty in the white-label template — add the client's menu:
         { id:'unique-id', cat:'top', name:'Nom', desc:'Description', price:20,
           icon:'coffee', options:[OPT.sucre], video:'path/to/clip.mp4', tag:'new' }
       - cat must match a menu-tab data-tab; icon maps to a style via ICON_CLASS below.
       - options, video and tag are optional. */
    owner.initialize('MENU', []);
    owner.initialize('MENU_ALL', new Map());
    owner.initialize('MENU_SUBTABS', new Map());
    const ICON_CLASS = {
      coffee: 'coffee',
      croissant: 'pastry',
      cookie: 'pastry',
      sandwich: 'savory',
      'glass-water': 'drink',
    };

    /* ============ state ============ */
    owner.initialize('orderMode', null);
       // 'table' | 'takeout'
    owner.initialize('tableNumber', '');
    owner.initialize('orderNumber', '');
       // takeout only — like "047"

    // Cart: lineKey -> { id, options, note, unitPrice, qty }
    owner.initialize('cart', new Map());
    /* Les commandes envoyées depuis ce téléphone, une entrée par commande :
       { id, number, status, total, lines:[{ id, options, note, unitPrice, qty }] }.
       Une simple liste de lignes se trompait de trois façons : une commande
       REFUSÉE par la caisse restait sur l'addition et dans le partage ;
       recharger la page (iPhone qui ferme l'onglet, nouveau scan du tag)
       vidait « Mes commandes » alors que la table était encore ouverte ; et
       seule la DERNIÈRE commande était suivie, donc le refus d'une commande
       précédente n'arrivait jamais. Les prix sont ceux que le SERVEUR a
       calculés, pour que les lignes tombent juste sur son total. La liste est
       gardée pour la session en cours (localStorage), jamais au-delà. */
    owner.initialize('sentOrders', []);
    owner.initialize('sentLines', []);
   // dérivé : les lignes des commandes non refusées
    owner.initialize('sessionTotal', 0);
   // dérivé : leur total, tel que le serveur l'a calculé
    const ORDER_DONE = new Set(['served', 'rejected', 'archived']);
    const sentKey = id => 'kiwi-op-sent:' + NET.slug + ':' + id;
    instances.session = KiwiOrderMenu.orderProParts.create('session', {
      get LIVE() { return LIVE; },
      get NET() { return NET; },
      get bootState() { return bootState; },
      get cart() { return cart; }, set cart(value) { cart = value; },
      get currentOrderId() { return currentOrderId; }, set currentOrderId(value) { currentOrderId = value; },
      get gotoScreen() { return gotoScreen; },
      get onSessionClosed() { return onSessionClosed; },
      get sentKey() { return sentKey; },
      get sentLines() { return sentLines; }, set sentLines(value) { sentLines = value; },
      get sentOrders() { return sentOrders; }, set sentOrders(value) { sentOrders = value; },
      get sessionTotal() { return sessionTotal; }, set sessionTotal(value) { sessionTotal = value; },
      get showToast() { return showToast; },
      get t() { return t; },
      get toCents() { return toCents; },
    });

    // OrderPro session: rebuildSent is supplied by its private factory.
    // OrderPro session: saveSent is supplied by its private factory.
    /* La session vient d'être ouverte ou reprise : on relit SES commandes, et
       on jette celles d'une visite précédente. */
    // OrderPro session: loadSent is supplied by its private factory.
    // OrderPro session: clearSent is supplied by its private factory.
    /* Aucun pourboire présélectionné : un 15 % coché d'office gonflait le « Total »
       d'un montant que le client n'avait pas choisi. */
    owner.initialize('tipPercent', 0);

    // Split state
    owner.initialize('splitState', {
      mode: 'egal',          // 'egal' | 'article'
      egalCount: 3,
      articleCount: 3,
      selectedPerson: 0,
      assignments: {},        // sentLine idx -> person idx
    });

    // Customizer state
    owner.initialize('customizerItem', null);
    owner.initialize('customizerSelections', {});
    owner.initialize('customizerNote', '');
    owner.initialize('customizerEditingKey', null);
    owner.initialize('customizerEditingQty', 1);

    /* ============ greeting flash (ported from kiwi-serveur) ============ */
    function runGreetingFlash() {
      const greetEl = $('[data-kiwi-greet]');
      if (!greetEl) return;

      let emClip = null;
      const greetH1 = greetEl.querySelector('h1');
      const greetEm = greetH1 && greetH1.querySelector('em');
      if (greetEm && !greetEm.parentNode.classList.contains('em-clip')) {
        const naturalW = Math.ceil(greetEm.getBoundingClientRect().width) + 6;
        emClip = document.createElement('span');
        emClip.className = 'em-clip';
        emClip.style.setProperty('--em-w', naturalW + 'px');
        greetEm.parentNode.insertBefore(emClip, greetEm);
        emClip.appendChild(greetEm);
      } else if (greetEm) {
        emClip = greetEm.parentNode;
        emClip.classList.remove('is-revealed', 'is-typing');
        void emClip.offsetWidth;
      }

      greetEl.classList.add('is-visible');
      greetEl.setAttribute('aria-hidden', 'false');

      setTimeout(() => emClip && emClip.classList.add('is-revealed', 'is-typing'), 900);
      setTimeout(() => emClip && emClip.classList.remove('is-typing'), 2000);
      setTimeout(() => {
        greetEl.classList.remove('is-visible');
        greetEl.setAttribute('aria-hidden', 'true');
      }, 2900);
    }

    /* ============ table-number entry ============ */
    instances.table = KiwiOrderMenu.orderProParts.create('table', {
      get $() { return $; },
      get SESSION() { return SESSION; },
      get gotoScreen() { return gotoScreen; },
      get guestReady() { return guestReady; }, set guestReady(value) { guestReady = value; },
      get onSessionClosed() { return onSessionClosed; },
      get orderMode() { return orderMode; }, set orderMode(value) { orderMode = value; },
      get t() { return t; },
      get tableNumber() { return tableNumber; }, set tableNumber(value) { tableNumber = value; },
    });

    // OrderPro table: pressKey is supplied by its private factory.
    // OrderPro table: renderTableDisplay is supplied by its private factory.
    // OrderPro table: updateContinueState is supplied by its private factory.

    /* ============ screen transitions ============ */
    /* ═══════════════════════════════════════════════════════════════════════
       Changer d'écran — et pourquoi c'est plus subtil qu'il n'y paraît.
       ---------------------------------------------------------------------
       L'ancienne version capturait UN écran sortant et armait une minuterie
       pour lui retirer `is-active` 360 ms plus tard. Deux navigations
       rapprochées suffisaient alors à tout éteindre : la minuterie de la
       première finissait par s'appliquer à l'écran que la seconde venait
       d'afficher, et le téléphone du client restait BLANC — tous les écrans en
       display:none, sans erreur, sans rien à quoi se raccrocher.
       Ça ne se produisait pas tant que chaque changement d'écran venait d'un
       doigt. Depuis que l'encaissement au comptoir fait avancer l'écran tout
       seul, deux transitions peuvent se suivre de quelques dizaines de
       millisecondes — et c'est arrivé du premier coup.
       Deux règles suffisent : on annule les minuteries en vol, et on ne retire
       JAMAIS `is-active` à l'écran vers lequel on va.
       ═══════════════════════════════════════════════════════════════════════ */
    let screenTimers = [];
    function gotoScreen(targetId) {
      const next = document.getElementById(targetId);
      if (!next) return;
      screenTimers.forEach(clearTimeout);
      screenTimers = [];
      const leaving = [...document.querySelectorAll('.screen.is-active')].filter(s => s !== next);
      if (!leaving.length && next.classList.contains('is-active')) return;
      next.classList.remove('is-leaving');
      next.classList.add('is-active', 'is-entering');
      screenTimers.push(setTimeout(() => next.classList.remove('is-entering'), 480));
      leaving.forEach(s => s.classList.add('is-leaving'));
      screenTimers.push(setTimeout(() => {
        leaving.forEach(s => s.classList.remove('is-active', 'is-leaving'));
      }, 360));
      /* Quitter la carte doit vraiment arrêter les boucles : un écran caché en
         CSS continue sinon à décoder ses vidéos derrière l'addition. */
      if (targetId === 'screen-menu') setTimeout(() => feedMedia.resume(), 80);
      else feedMedia.pauseAll();
    }

    /* ═══════════════════════════════════════════════════════════════════════
       LE FIL — lecture au défilé.
       ---------------------------------------------------------------------
       Vingt <video autoplay> dans une page, c'est vingt décodeurs ouverts en
       même temps : sur un Android d'entrée de gamme la page devient un
       diaporama, et sur iPhone la batterie s'écroule. Le navigateur ne trie
       pas ça tout seul — nous, si. Une seule règle :
         · une tuile qui APPROCHE de l'écran charge sa vidéo (et pas avant :
           sinon on télécharge toute la carte au premier affichage) ;
         · une tuile VISIBLE joue ; une tuile sortie de l'écran s'arrête.
       La photo du plat sert d'affiche à sa propre vidéo, donc la tuile n'est
       jamais un rectangle noir pendant le chargement.
       ═══════════════════════════════════════════════════════════════════════ */
    instances.menu = KiwiOrderMenu.orderProParts.create('menu', {
      get $() { return $; },
      get $$() { return $$; },
      get I18N() { return I18N; },
      get ICON_CLASS() { return ICON_CLASS; },
      get MENU() { return MENU; },
      get MENU_ALL() { return MENU_ALL; },
      get MENU_I18N() { return MENU_I18N; },
      get MENU_SUBTABS() { return MENU_SUBTABS; },
      get OPT() { return OPT; },
      get addLineToCart() { return addLineToCart; },
      get availabilitySignature() { return availabilitySignature; }, set availabilitySignature(value) { availabilitySignature = value; },
      get cart() { return cart; }, set cart(value) { cart = value; },
      get currentLang() { return currentLang; },
      get customizerEditingKey() { return customizerEditingKey; }, set customizerEditingKey(value) { customizerEditingKey = value; },
      get customizerEditingQty() { return customizerEditingQty; }, set customizerEditingQty(value) { customizerEditingQty = value; },
      get customizerItem() { return customizerItem; }, set customizerItem(value) { customizerItem = value; },
      get customizerNote() { return customizerNote; }, set customizerNote(value) { customizerNote = value; },
      get customizerSelections() { return customizerSelections; }, set customizerSelections(value) { customizerSelections = value; },
      get escapeHtml() { return escapeHtml; },
      get itemI18n() { return itemI18n; },
      get itemOf() { return itemOf; },
      get menuTr() { return menuTr; },
      get money() { return money; },
      get showToast() { return showToast; },
      get t() { return t; },
      get toCents() { return toCents; },
    });

    // OrderPro menu: feedMedia is supplied by its private factory.

    /* Le média d'un plat, dans le cadre commun. L'ordre compte : une vidéo
       l'emporte sur une photo (elle vend mieux), la photo devient son affiche,
       et l'icône ne sert que quand le patron n'a rien mis — jamais comme
       vignette au rabais à côté d'un plat filmé. */
    // OrderPro menu: dishMedia is supplied by its private factory.
    // OrderPro menu: dishTag is supplied by its private factory.

    // OrderPro menu: renderMenu is supplied by its private factory.

    // OrderPro menu: renderMenuSubtabs is supplied by its private factory.

    // OrderPro menu: activeMenuFilter is supplied by its private factory.

    /* ============ cart logic — line keys support variants ============ */
    const itemOf  = id => MENU.find(m => m.id === id);
    const nameOf  = id => itemI18n(id).name || itemOf(id)?.name || '';
    const cur = () => t('currency');
    /* Un prix est en dirhams ET centimes. La carte arrondissait au dirham
       entier (un café à 14,50 s'affichait 15) puis ajoutait l'option telle
       quelle : « Grand +3,50 » donnait 18,5 au lieu de 18, le panier disait
       108,5 et le serveur en facturait 108. On garde les centimes, on compte
       en centimes entiers (3 × 14,55 ne doit pas s'écrire 43,650000000000006)
       et on écrit l'entier sans décimales, les centimes après une virgule. */
    const toCents = v => Math.round((Number(v) || 0) * 100);
    function fmtAmount(v) {
      const c = toCents(v), a = Math.abs(c), frac = a % 100;
      return (c < 0 ? '-' : '') + Math.floor(a / 100)
        + (frac ? (currentLang === 'en' ? '.' : ',') + String(frac).padStart(2, '0') : '');
    }
    const money = v => fmtAmount(v) + ' ' + cur();

    instances.cart = KiwiOrderMenu.orderProParts.create('cart', {
      get $() { return $; },
      get cart() { return cart; }, set cart(value) { cart = value; },
      get describeOptions() { return describeOptions; },
      get escapeHtml() { return escapeHtml; },
      get money() { return money; },
      get nameOf() { return nameOf; },
      get showToast() { return showToast; },
      get t() { return t; },
    });

    // OrderPro cart: lineKey is supplied by its private factory.

    // OrderPro menu: choiceLabel is supplied by its private factory.
    // OrderPro menu: groupLabel is supplied by its private factory.
    // OrderPro menu: choiceEmoji is supplied by its private factory.
    // OrderPro menu: describeOptions is supplied by its private factory.
    // OrderPro menu: describeOptionChoices is supplied by its private factory.
    // OrderPro menu: describeOptionVisuals is supplied by its private factory.

    // OrderPro cart: totals is supplied by its private factory.
    // OrderPro cart: refreshCartUI is supplied by its private factory.
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // OrderPro cart: addLineToCart is supplied by its private factory.
    // OrderPro cart: decFromCart is supplied by its private factory.
    // OrderPro cart: incFromCart is supplied by its private factory.

    /* ============ + button on a menu item ============ */
    // OrderPro menu: standaloneMenuItem is supplied by its private factory.

    // OrderPro menu: handleAddClick is supplied by its private factory.

    /* ============ Customizer ============ */
    // OrderPro menu: initialCustomizerSelections is supplied by its private factory.

    /* Le groupe obligatoire encore vide, ou null. Même règle que le contrôle de
       confirmCustomizer, pour que le bouton « Ajouter » et le refus ne
       divergent jamais. */
    // OrderPro menu: unansweredRequiredOption is supplied by its private factory.
    // OrderPro menu: syncCustomizerGate is supplied by its private factory.

    // OrderPro menu: openCustomizer is supplied by its private factory.
    // OrderPro menu: closeCustomizer is supplied by its private factory.
    // OrderPro menu: selectCustomizerChoice is supplied by its private factory.
    // OrderPro menu: customizerUnitPrice is supplied by its private factory.
    // OrderPro menu: refreshCustomizerPrice is supplied by its private factory.
    // OrderPro menu: confirmCustomizer is supplied by its private factory.

    /* ============ Service bar (table mode) ============ */
    owner.initialize('serviceRequestPending', false);
    instances.payment = KiwiOrderMenu.orderProParts.create('payment', {
      get $() { return $; },
      get $$() { return $$; },
      get MENU() { return MENU; },
      get NET() { return NET; },
      get ORDER_DONE() { return ORDER_DONE; },
      get ORDER_STATE_KEY() { return ORDER_STATE_KEY; },
      get PREP_STAGE() { return PREP_STAGE; },
      get SESSION() { return SESSION; },
      get TIP_LEVELS() { return TIP_LEVELS; },
      get activeMenuFilter() { return activeMenuFilter; },
      get cart() { return cart; }, set cart(value) { cart = value; },
      get closeCart() { return closeCart; },
      get cur() { return cur; },
      get currentOrderId() { return currentOrderId; }, set currentOrderId(value) { currentOrderId = value; },
      get describeOptionChoices() { return describeOptionChoices; },
      get describeOptionVisuals() { return describeOptionVisuals; },
      get describeOptions() { return describeOptions; },
      get escapeHtml() { return escapeHtml; },
      get fmtAmount() { return fmtAmount; },
      get gotoScreen() { return gotoScreen; },
      get groupLabel() { return groupLabel; },
      get itemOf() { return itemOf; },
      get lastStatus() { return lastStatus; }, set lastStatus(value) { lastStatus = value; },
      get lineKey() { return lineKey; },
      get money() { return money; },
      get nameOf() { return nameOf; },
      get openCustomizer() { return openCustomizer; },
      get orderMode() { return orderMode; }, set orderMode(value) { orderMode = value; },
      get orderNumber() { return orderNumber; }, set orderNumber(value) { orderNumber = value; },
      get pendingRef() { return pendingRef; }, set pendingRef(value) { pendingRef = value; },
      get rebuildSent() { return rebuildSent; },
      get refreshCartUI() { return refreshCartUI; },
      get reloadMenu() { return reloadMenu; },
      get renderMenu() { return renderMenu; },
      get renderMenuSubtabs() { return renderMenuSubtabs; },
      get saveSent() { return saveSent; },
      get sentLines() { return sentLines; }, set sentLines(value) { sentLines = value; },
      get sentOrders() { return sentOrders; }, set sentOrders(value) { sentOrders = value; },
      get serviceRequestPending() { return serviceRequestPending; }, set serviceRequestPending(value) { serviceRequestPending = value; },
      get sessionTotal() { return sessionTotal; }, set sessionTotal(value) { sessionTotal = value; },
      get showToast() { return showToast; },
      get splitState() { return splitState; }, set splitState(value) { splitState = value; },
      get t() { return t; },
      get tableNumber() { return tableNumber; }, set tableNumber(value) { tableNumber = value; },
      get tipPercent() { return tipPercent; }, set tipPercent(value) { tipPercent = value; },
      get toCents() { return toCents; },
      get totals() { return totals; },
    });

    // OrderPro payment: sendServiceRequest is supplied by its private factory.
    // OrderPro payment: callServer is supplied by its private factory.

    /* ============ Bill sheet + gamified tip ============ */
    // OrderPro payment: openBill is supplied by its private factory.
    const ORDER_STATE_KEY = { pending: 'prep_waiting', accepted: 'prep_accepted', ready: 'prep_ready',
                              served: 'order_served', rejected: 'bill_order_refused' };
    // OrderPro payment: renderBill is supplied by its private factory.
    // OrderPro payment: closeBill is supplied by its private factory.

    const TIP_LEVELS = [
      { min: 0,  max: 0,   key: 'tip_level_0', empty: true },
      { min: 1,  max: 8,   key: 'tip_level_1' },
      { min: 9,  max: 12,  key: 'tip_level_2' },
      { min: 13, max: 17,  key: 'tip_level_3' },
      { min: 18, max: 22,  key: 'tip_level_4' },
      { min: 23, max: 100, key: 'tip_level_5', celebrated: true },
    ];

    // OrderPro payment: setTipPercent is supplied by its private factory.

    // OrderPro payment: confirmBill is supplied by its private factory.

    /* ============ Split-bill (égal / par article) ============ */
    // OrderPro payment: openSplit is supplied by its private factory.
    // OrderPro payment: closeSplit is supplied by its private factory.
    // OrderPro payment: setSplitMode is supplied by its private factory.
    // OrderPro payment: setEgalCount is supplied by its private factory.
    // OrderPro payment: setArticleCount is supplied by its private factory.
    // OrderPro payment: setSplitPerson is supplied by its private factory.
    // OrderPro payment: toggleSplitItem is supplied by its private factory.

    // OrderPro payment: refreshSplitUI is supplied by its private factory.

    // OrderPro payment: personSubtotal is supplied by its private factory.

    // OrderPro payment: renderSplitArticle is supplied by its private factory.

    // OrderPro payment: confirmSplit is supplied by its private factory.

    /* ============ toast ============ */
    let toastTimer = null;
    function showToast(text) {
      let clean = String(text || '').trim();
      if (!clean) return;
      if (clean.includes('{n}')) clean = clean.replace(/\{n\}/g, '').trim();
      clean = clean.replace(/[:：]\s*$/, '').trim();
      if (!clean) clean = t('order_menu_updated') || 'Menu mis à jour';
      const tEl = $('#toast');
      $('#toast-text').textContent = clean;
      tEl.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => tEl.classList.remove('is-visible'), 1400);
    }

    /* ============ cart sheet ============ */
    // OrderPro cart: openCart is supplied by its private factory.
    // OrderPro cart: closeCart is supplied by its private factory.

    /* ============ send order ============ */
    /* The order leaves the phone over WiFi and lands in the caisse's queue.
       No optimistic UI: if the relay fails the customer is told, because a
       fake "sent to the kitchen" is how a table waits 20 minutes for nothing. */
    owner.initialize('currentOrderId', '');
    /* La clé d'idempotence de l'envoi en cours. Conservée tant que l'envoi n'a
       pas abouti, pour qu'un deuxième tap rejoue la même commande au lieu d'en
       créer une seconde ; effacée dès qu'elle est acceptée, pour que la
       commande SUIVANTE soit bien une nouvelle commande. */
    owner.initialize('pendingRef', '');
    // OrderPro payment: sendOrder is supplied by its private factory.

    /* Table mode gets the same truth as takeout, just quieter: the ETA line
       becomes the ticket's real state at the till, not a decorative fixed delay.
       Stops as soon as the kitchen has it, or when the guest leaves the screen. */
    /* ═══════════════════════════════════════════════════════════════════════
       LA SESSION — ce téléphone, assis à cette table
       ---------------------------------------------------------------------
       Elle s'ouvre quand on sait où le client est assis, et la caisse peut la
       FERMER : encaisser l'addition la coupe, et l'app bascule sur le
       remerciement. C'est ce qui manquait — le lien était éternel, donc
       quelqu'un pouvait le garder et commander de chez lui.

       Le souvenir local sert à deux choses, et la seconde compte autant que la
       première : reprendre la même session après un verrouillage d'écran, ET
       refuser d'en rouvrir une juste après un encaissement. Recharger la page
       n'est pas distinguable d'un nouveau contact avec le tag — mais une
       addition réglée il y a deux minutes, si. Passé la demi-heure la table
       appartient au client suivant, et il n'a de toute façon pas ce souvenir
       dans SON téléphone.
       ═══════════════════════════════════════════════════════════════════════ */
    // OrderPro session: SESSION is supplied by its private factory.

    /* Le service est fini pour ce téléphone : plus de carte, plus de panier,
       plus de commande. On ne se contente pas de masquer le bouton — le panier
       est vidé et la boucle s'arrête, pour qu'aucun écran resté ouvert derrière
       ne puisse encore envoyer quoi que ce soit. */
    // OrderPro payment: onSessionClosed is supplied by its private factory.

    /* ═══════════════════════════════════════════════════════════════════════
       LE DIRECT — une seule boucle, pour la session ET la commande
       ---------------------------------------------------------------------
       « Personne ne va rafraîchir » : c'est vrai, les gens parlent et oublient
       leur téléphone sur la table. Donc rien ici n'attend un geste.
       Trois règles :
         · un rythme SOUTENU tant qu'une commande est en cours, LENT quand on
           ne fait que lire la carte — la batterie d'un client n'est pas à nous ;
         · rien ne tourne pendant que l'écran est verrouillé ou l'onglet caché,
           et on redemande TOUT DE SUITE au retour, sans attendre le tour
           suivant : c'est exactement le moment où le client regarde ;
         · le réseau qui revient relance aussi.
       ═══════════════════════════════════════════════════════════════════════ */
    // OrderPro payment: LIVE is supplied by its private factory.

    /* L'état de la commande, appliqué à l'écran qui est devant les yeux du
       client. Une seule fonction pour les deux parcours : la table et le
       comptoir affichent la même vérité, avec des mots différents. */
    owner.initialize('lastStatus', '');
    // OrderPro payment: onOrderStatus is supplied by its private factory.
    // OrderPro payment: applyOrderStatus is supplied by its private factory.

    // OrderPro payment: watchTableOrder is supplied by its private factory.

    /* La carte a bougé pendant que le client composait. Plutôt que de laisser
       le plat dans le panier — où il ferait échouer chaque nouvelle tentative
       à l'identique — on le retire et on le barre sur le fil, à sa place, dans
       sa tuile. Le fil ne se réordonne pas sous les doigts : c'est la même
       carte, avec un plat en moins de disponible. */
    // OrderPro payment: dropUnavailable is supplied by its private factory.

    /* ============ restart (back to menu after order sent) ============ */
    // OrderPro payment: restartMenu is supplied by its private factory.

    /* ============ mode choice → next screen ============ */
    // OrderPro table: chooseMode is supplied by its private factory.

    /* S'asseoir. Le seul chemin par lequel une session s'ouvre, pour que les
       trois entrées (tag de table, tag de comptoir, choix à la main) passent
       par les mêmes refus et les mêmes messages. */
    // OrderPro table: seatHere is supplied by its private factory.

    // OrderPro table: applyMenuMode is supplied by its private factory.

    /* The guest page lands after a table is seated; its module may still be on
       its way (it loads after the first screen), so wait for it as land()
       waits for its data, never longer than 2.5 s. */
    owner.initialize('guestReady', null);
    // OrderPro table: guestLand is supplied by its private factory.

    /* ============ continue from table-entry to menu ============ */
    // OrderPro table: commitTable is supplied by its private factory.

    /* ============ takeout: cashier → preparing ============ */
    // OrderPro payment: confirmCashierPayment is supplied by its private factory.

    /* ============ takeout: live status from the caisse ============
       The bar is not a countdown — it tracks the ticket's REAL state, polled
       from the store over WiFi: queued at the till → accepted into the kitchen
       → ready. Staff acceptance is what moves it, exactly as decided. If the
       poll can't reach the store we hold the last known state and keep trying
       rather than declaring an order ready that isn't. */
    const PREP_STAGE = { pending: 18, accepted: 62, ready: 100, served: 100 };
    // OrderPro payment: startPreparing is supplied by its private factory.

    /* ============ takeout: ready (chime + system notif) ============ */
    // OrderPro payment: triggerReady is supplied by its private factory.

    /* ============ Web Audio chime (two-note, no asset needed) ============ */
    // OrderPro payment: playChime is supplied by its private factory.

    /* ============ Notification permission flow ============ */
    // OrderPro payment: refreshPermBanner is supplied by its private factory.

    // OrderPro payment: askNotificationPermission is supplied by its private factory.

    /* ═══════════════════════════════════════════════════════════════════════
       STORE — who this phone is talking to, learned from the network.
       ═══════════════════════════════════════════════════════════════════════ */
    const STORE = { slug: NET.slug, name: '', type: '', ready: false };

    /* Every tenant-facing string in the shell, rewritten from the published
       catalogue. This is what makes ONE file white-label: the name never lives
       in the HTML, it arrives with the data. */
    function applyStoreIdentity(name) {
      STORE.name = name || '';
      if (!STORE.name) return;
      $$('.brand-mark').forEach(el => {
        el.textContent = STORE.name;
        el.insertAdjacentHTML('beforeend', '<i aria-hidden="true"></i>');
      });
      const cafeName = $('.menu-cafe .name');
      if (cafeName) cafeName.textContent = STORE.name;
      const bqStore = $('#bq-store');
      if (bqStore) bqStore.textContent = STORE.name;
      const foot = $('.mode-foot');
      if (foot) { foot.textContent = STORE.name + ' · ' + t('mode_foot_service'); foot.removeAttribute('data-i18n'); }
      document.title = STORE.name;
      // The "ready" notification must carry the merchant's own name.
      Object.keys(I18N).forEach(l => { I18N[l].notif_ready_title = STORE.name; });
    }

    /* The opening hours the merchant set, read every minute: a guest who has
       had the page open for twenty minutes sees the kitchen close without a
       reload. */
    function refreshHoursGate() {
      if (!globalThis.KiwiOrderMenu || !STORE.ready || STORE.type === 'boutique') return;
      KiwiOrderMenu.renderClosed(t, currentLang);
      refreshCartUI();
    }
    setInterval(refreshHoursGate, 60000);

    /* ============ boot screen states ============ */
    /* La caisse dort, pas le restaurant : « fermé » est transitoire et doit se
       réveiller seul. Même traitement pour « off », que le commerçant peut
       réactiver à tout moment. Sans réessai, le téléphone restait mort même
       après le réveil du comptoir — rescan compris, qui retombait pareil. */
    let bootRetryId = null;
    function clearBootRetry() {
      if (bootRetryId) { clearTimeout(bootRetryId); bootRetryId = null; }
    }
    function scheduleBootRetry(kind) {
      clearBootRetry();
      if (kind !== 'closed' && kind !== 'off') return;
      bootRetryId = setTimeout(() => {
        bootRetryId = null;
        const boot = document.getElementById('screen-boot');
        if (document.hidden || !boot || !boot.classList.contains('is-active')) return;
        bootFromLink();
      }, 30000);
    }
    function bootState(kind, opts) {
      clearBootRetry();
      if (kind === 'closed' || kind === 'off') {
        opts = Object.assign({ retry: true }, opts || {});
        scheduleBootRetry(kind);
      }
      const spinner = $('#boot-spinner');
      const icon = $('#boot-icon');
      const title = $('#boot-title');
      const body = $('#boot-body');
      const retry = $('#boot-retry');
      const loading = kind === 'loading';
      spinner.hidden = !loading;
      icon.hidden = loading;
      retry.hidden = !(opts && opts.retry);
      if (loading) {
        title.setAttribute('data-i18n', 'boot_loading');
        title.textContent = t('boot_loading');
        body.textContent = '';
        return;
      }
      title.setAttribute('data-i18n', 'boot_' + kind + '_title');
      title.textContent = t('boot_' + kind + '_title');
      body.setAttribute('data-i18n', 'boot_' + kind + '_body');
      body.textContent = t('boot_' + kind + '_body');
      icon.innerHTML = `<i data-lucide="${(opts && opts.icon) || 'nfc'}"></i>`;
      if (window.lucide) window.lucide.createIcons();
    }

    async function reloadMenu() {
      try {
        const res = await NET.catalog();
        if (!res) return;
        if (STORE.type === 'boutique' && res.shop) {
          if (typeof bootBoutique === 'function') bootBoutique(res.shop);
        } else if (res.menu) {
          bootRestaurant(res.menu);
        }
        refreshCartUI();
      } catch (_) {}
    }

    /* ═══════════════════════════════════════════════════════════════════════
       BOOT — one network round-trip decides everything.
       ═══════════════════════════════════════════════════════════════════════ */
    async function bootFromLink() {
      if (!STORE.slug) { bootState('nolink', { icon: 'nfc' }); return; }
      bootState('loading');
      if (NET.demo && globalThis.KiwiOrderMenu) await KiwiOrderMenu.need('demo');

      const res = await NET.catalog();
      if (!res) { bootState('offline', { icon: 'wifi-off', retry: true }); return; }
      // Order Pro is a paid add-on: the server says whether this store has it.
      // Without it, the server refuses every order. A restaurant's menu is
      // still shown to browse: a printed table QR (order-qr.js) opens this
      // page, and the merchant who never bought Order Pro still has a menu.
      const OM = globalThis.KiwiOrderMenu;
      STORE.type = String(res.type || '').toLowerCase();
      const browseOnly = res.orderpro !== true;
      const hasMenu = !!(res.menu && Array.isArray(res.menu.items) && res.menu.items.length);
      if (browseOnly && !(OM && STORE.type !== 'boutique' && hasMenu)) { bootState('off', { icon: 'power-off' }); return; }
      if (OM) {
        await OM.configure(res);
        OM.picker(currentLang);
        applyLang(OM.pick(savedOrderLang || currentLang));
        OM.setOrdering(!browseOnly, t);
      }

      applyStoreIdentity(res.name);
      /* La page d'accueil du client (assets/orderpro-guest.js) se charge en
         parallèle : Wi-Fi, avis, jeux, « avec ça ? », temps réel, ftour. Une
         carte à consulter sans Order Pro n'y mène pas, ni une boutique : le
         module n'arrive qu'ici, après le premier écran (§19, 60 KB). */
      const guestLoad = !browseOnly && STORE.type !== 'boutique' && globalThis.KiwiOrderMenu
        ? (guestReady = KiwiOrderMenu.need('guest').then(() => globalThis.KiwiGuest ? globalThis.KiwiGuest.load() : null, () => null))
        : null;

      if (STORE.type === 'boutique') {
        try { await KiwiOrderMenu.need('boutique'); } catch (_) {}
        if (typeof bootBoutique !== 'function') { bootState('offline', { icon: 'wifi-off', retry: true }); return; }
        if (!bootBoutique(res.shop || {})) { bootState('empty', { icon: 'package-open' }); return; }
        STORE.ready = true;
        gotoScreen('screen-boutique');
        return;
      }

      // Restaurant family (default).
      if (!bootRestaurant(res.menu || {})) { bootState('empty', { icon: 'utensils-crossed' }); return; }
      STORE.ready = true;
      refreshHoursGate();
      if (browseOnly) { gotoScreen('screen-menu'); return; }

      // The NFC tag decides where we land: a table tag skips the numpad
      // entirely, a counter tag goes straight to takeout, a bare link asks.
      if (NET.table) {
        orderMode = 'table';
        tableNumber = NET.table;
        renderTableDisplay();
        updateContinueState();
        /* Le tag porte le numéro de table : le client est assis, on le sait, on
           s'assoit avec lui tout de suite. C'est ce moment précis qui allume sa
           table sur le plan de salle du comptoir. */
        if (!(await seatHere('table', tableNumber))) return;
        applyMenuMode();
        if (!(await guestLand(guestLoad))) gotoScreen('screen-menu');
      } else if (NET.mode === 'takeout') {
        chooseMode('takeout');
      } else if (NET.mode === 'table') {
        chooseMode('table');
      } else {
        gotoScreen('screen-mode');
      }
    }

    /* A cashier can sell out a dish while this page is already open. Refresh
       only when the availability map changes, so browsing is uninterrupted
       while the unavailable card disappears from the public menu. */
    owner.initialize('availabilitySignature', '');
    // OrderPro menu: availabilityOf is supplied by its private factory.
    setInterval(async () => {
      if (!STORE.ready || STORE.type === 'boutique' || !STORE.slug) return;
      const res = await NET.catalog();
      const data = res && res.menu;
      if (!data) return;
      const next = availabilityOf(data);
      if (!availabilitySignature) { availabilitySignature = next; return; }
      if (next === availabilitySignature) return;
      availabilitySignature = next;
      bootRestaurant(data);
      renderMenu(activeMenuFilter());
    }, 15000);

    /* ═══════════════════════════════════════════════════════════════════════
       RESTAURANT — map the dashboard's published carte onto the app's model.
       Published shape (assets/menu-catalog.js):
         { cats:[{id,name,sub:[{id,name}]}],
           items:[{id,name,price,catId,subId,desc,avail,photo,video}] }
       Returns false when there is nothing orderable to show.
       ═══════════════════════════════════════════════════════════════════════ */
    // OrderPro menu: bootRestaurant is supplied by its private factory.

    /* The boutique vertical (product list, barcode lookup) lives in
       assets/orderpro-boutique.js, loaded for a boutique only: a restaurant
       never runs it, and its guests do not download it (§19, 60 KB). */

    /* ============ wire it up ============ */
    onReady(() => {
      // Apply saved language FIRST so the greeting flash measures the right em width
      applyLang(currentLang);
      refreshCartUI();
      if (window.lucide) window.lucide.createIcons();

      // Ask the store who it is and what it sells. Nothing renders before this.
      bootFromLink();

      // Browsers auto-scroll the offset-parent to bring a focused button into view
      // (even with overflow:hidden) — this made the cart-sheet panel peek up from
      // the bottom after numpad taps. preventDefault on mousedown stops focus from
      // moving to the button; the click still fires normally.
      const appEl = document.querySelector('.app');
      appEl.addEventListener('mousedown', e => {
        // Don't preventDefault on the note textarea — we want focus there
        if (e.target.closest('.custom-note-input')) return;
        if (e.target.closest('button, [data-close-cart], [data-close-custom], [data-close-bill]')) e.preventDefault();
      });
      // Snap back if anything else scrolls .app.
      appEl.addEventListener('scroll', () => {
        if (appEl.scrollTop || appEl.scrollLeft) { appEl.scrollTop = 0; appEl.scrollLeft = 0; }
      }, { passive: true });


      // Delegated clicks
      document.addEventListener('click', e => {
        // Language picker
        const langBtn = e.target.closest('.lang-btn');
        if (langBtn) { applyLang(langBtn.dataset.lang); return; }
        // Boot: retry the store lookup
        if (e.target.closest('#boot-retry')) { bootFromLink(); return; }
        // Boutique (assets/orderpro-boutique.js, present for a boutique only)
        if (typeof openBoutiqueItem === 'function') {
          const bqCard = e.target.closest('[data-bq]');
          if (bqCard) { openBoutiqueItem(bqCard.dataset.bq); return; }
          if (e.target.closest('[data-close-bq]')) { closeSheet('#bq-detail'); return; }
          if (e.target.closest('#bq-scan-open')) { openScanner(); return; }
          if (e.target.closest('[data-close-scan]')) { closeScanner(); return; }
          if (e.target.closest('#bq-manual-go')) { resolveScan($('#bq-manual').value); return; }
        }
        // Mode choice (à table / à emporter)
        const modeCard = e.target.closest('[data-mode]');
        if (modeCard) { chooseMode(modeCard.dataset.mode); return; }
        // Back arrows
        const backBtn = e.target.closest('[data-back]');
        if (backBtn) { gotoScreen(backBtn.dataset.back); return; }
        // Numpad
        const key = e.target.closest('[data-key]');
        if (key) { pressKey(key.dataset.key); key.blur(); return; }
        // Continue
        if (e.target.closest('#continue-btn')) { commitTable(); return; }
        // Takeout: cashier → preparing
        if (e.target.closest('#cashier-confirm-btn')) { confirmCashierPayment(); return; }
        // Takeout: ask for notification permission
        if (e.target.closest('#prep-perm-btn')) { askNotificationPermission(); return; }
        // Takeout: ready → restart
        if (e.target.closest('#ready-cta')) { restartMenu(); return; }
        // Thanks screen: reorder button clears dead session and immediately reopens menu
        if (e.target.closest('#thanks-reorder-btn')) {
          SESSION._write(null);
          clearSent();
          SESSION.closed = false;
          SESSION.closedBy = '';
          SESSION.id = '';
          cart.clear();
          refreshCartUI();
          if (orderMode === 'table' && tableNumber) {
            seatHere('table', tableNumber, true).then(async (ok) => {
              if (!ok) return;
              applyMenuMode();
              if (!(await guestLand())) gotoScreen('screen-menu');
            });
          } else {
            restartMenu();
          }
          return;
        }
        // Add to cart — dedicated + button opens customizer if item has options, or adds directly
        const addBtn = e.target.closest('[data-add]');
        if (addBtn) {
          handleAddClick(addBtn.dataset.add);
          addBtn.classList.remove('is-popped');
          void addBtn.offsetWidth;
          addBtn.classList.add('is-popped');
          return;
        }
        // The tile's "i": the dish's sheet, opened at its nutrition facts.
        const infoBtn = e.target.closest('[data-info]');
        if (infoBtn) {
          const item = standaloneMenuItem(infoBtn.dataset.info);
          if (item) {
            openCustomizer(item);
            const facts = $('#custom-nutrition');
            if (facts && !facts.hidden) requestAnimationFrame(() => facts.scrollIntoView({ block: 'start' }));
          }
          return;
        }
        // Dish card tap: ONLY opens customizer if item has customizable options!
        // Never silently add items with no options (e.g. water, drinks) on touch/scroll.
        const cardEl = e.target.closest('[data-card]');
        if (cardEl) {
          const item = standaloneMenuItem(cardEl.dataset.card);
          if (item && item.options && item.options.length > 0) {
            openCustomizer(item);
          }
          return;
        }
        // Cart qty (uses encoded lineKey)
        const incBtn = e.target.closest('[data-inc]');
        if (incBtn) { incFromCart(decodeURIComponent(incBtn.dataset.inc)); return; }
        const decBtn = e.target.closest('[data-dec]');
        if (decBtn) { decFromCart(decodeURIComponent(decBtn.dataset.dec)); return; }

        // Customizer chip
        const optChip = e.target.closest('.option-chip');
        if (optChip) {
          selectCustomizerChoice(optChip.dataset.opt, optChip.dataset.choice, optChip.dataset.type);
          return;
        }
        if (e.target.closest('#custom-add-btn')) { confirmCustomizer(); return; }
        if (e.target.closest('[data-close-custom]')) { closeCustomizer(); return; }

        // Service bar (table mode)
        const serviceBtn = e.target.closest('[data-service]');
        if (serviceBtn) {
          const action = serviceBtn.dataset.service;
          if (action === 'call-server') callServer();
          else if (action === 'ask-bill') openBill();
          return;
        }

        // Bill sheet
        if (e.target.closest('[data-close-bill]')) { closeBill(); return; }
        const tipChip = e.target.closest('.tip-chip');
        if (tipChip) { setTipPercent(parseInt(tipChip.dataset.tip, 10)); return; }
        if (e.target.closest('#bill-confirm-btn')) { confirmBill(); return; }

        // Split-bill sheet
        if (e.target.closest('#open-split-btn')) { openSplit(); return; }
        if (e.target.closest('[data-close-split]')) { closeSplit(); return; }
        const splitModeTab = e.target.closest('[data-split-mode]');
        if (splitModeTab) { setSplitMode(splitModeTab.dataset.splitMode); return; }
        const egalChip = e.target.closest('[data-egal-count]');
        if (egalChip) { setEgalCount(parseInt(egalChip.dataset.egalCount, 10)); return; }
        const artChip = e.target.closest('[data-article-count]');
        if (artChip) { setArticleCount(parseInt(artChip.dataset.articleCount, 10)); return; }
        const personTab = e.target.closest('[data-split-person]');
        if (personTab) { setSplitPerson(parseInt(personTab.dataset.splitPerson, 10)); return; }
        const poolItem = e.target.closest('[data-split-item]');
        if (poolItem) { toggleSplitItem(parseInt(poolItem.dataset.splitItem, 10)); return; }
        if (e.target.closest('#split-confirm-btn')) { confirmSplit(); return; }
        // Tabs
        const tab = e.target.closest('.menu-tab');
        if (tab) {
          if (tab.classList.contains('menu-subtab')) {
            $$('.menu-subtab').forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
            tab.classList.add('is-active');
            tab.setAttribute('aria-selected', 'true');
          } else {
            $$('.menu-tabs .menu-tab').forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
            tab.classList.add('is-active');
            tab.setAttribute('aria-selected', 'true');
            renderMenuSubtabs(tab.dataset.tab);
          }
          renderMenu(tab.dataset.tab);
          return;
        }
        // Cart pill / sheet
        if (e.target.closest('#cart-pill')) { openCart(); return; }
        if (e.target.closest('[data-close-cart]')) { closeCart(); return; }
        // Send
        if (e.target.closest('#send-btn')) { sendOrder(); return; }
        // Restart after success
        if (e.target.closest('#restart-btn')) { restartMenu(); return; }
      });

      // Greeting plays on landing
      requestAnimationFrame(() => setTimeout(runGreetingFlash, 280));
    });

  }
  }
  const scripts = ["assets/orderpro/session.js?v=3","assets/orderpro/table.js?v=3","assets/orderpro/menu.js?v=3","assets/orderpro/cart.js?v=3","assets/orderpro/payment.js?v=3"];
  for (const src of scripts) {
    const script = document.createElement('script');
    script.async = false;
    script.src = src;
    document.head.appendChild(script);
  }
})();
