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
    let currentLang = savedOrderLang || 'fr';
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
    const OPT = {};

    /* ============ menu data ============
       One object per item. Empty in the white-label template — add the client's menu:
         { id:'unique-id', cat:'top', name:'Nom', desc:'Description', price:20,
           icon:'coffee', options:[OPT.sucre], video:'path/to/clip.mp4', tag:'new' }
       - cat must match a menu-tab data-tab; icon maps to a style via ICON_CLASS below.
       - options, video and tag are optional. */
    const MENU = [];
    const MENU_ALL = new Map();
    const MENU_SUBTABS = new Map();
    const ICON_CLASS = {
      coffee: 'coffee',
      croissant: 'pastry',
      cookie: 'pastry',
      sandwich: 'savory',
      'glass-water': 'drink',
    };

    /* ============ state ============ */
    let orderMode = null;       // 'table' | 'takeout'
    let tableNumber = '';
    let orderNumber = '';       // takeout only — like "047"

    // Cart: lineKey -> { id, options, note, unitPrice, qty }
    const cart = new Map();
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
    let sentOrders = [];
    const sentLines = [];   // dérivé : les lignes des commandes non refusées
    let sessionTotal = 0;   // dérivé : leur total, tel que le serveur l'a calculé
    const ORDER_DONE = new Set(['served', 'rejected', 'archived']);
    const sentKey = id => 'kiwi-op-sent:' + NET.slug + ':' + id;
    function rebuildSent() {
      sentLines.length = 0;
      let c = 0;
      for (const o of sentOrders) {
        if (o.status === 'rejected') continue;
        for (const l of o.lines) sentLines.push(l);
        c += toCents(o.total);
      }
      sessionTotal = c / 100;
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.refreshStatus();
    }
    function saveSent() {
      if (!SESSION.id) return;
      try {
        if (sentOrders.length) localStorage.setItem(sentKey(SESSION.id), JSON.stringify(sentOrders));
        else localStorage.removeItem(sentKey(SESSION.id));
      } catch (_) {}
    }
    /* La session vient d'être ouverte ou reprise : on relit SES commandes, et
       on jette celles d'une visite précédente. */
    function loadSent(sessionId) {
      sentOrders = [];
      try {
        const prefix = 'kiwi-op-sent:' + NET.slug + ':';
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix) && k !== sentKey(sessionId)) localStorage.removeItem(k);
        }
        const saved = JSON.parse(localStorage.getItem(sentKey(sessionId)) || '[]');
        if (Array.isArray(saved)) {
          sentOrders = saved.filter(o => o && typeof o.id === 'string' && Array.isArray(o.lines));
        }
      } catch (_) {}
      rebuildSent();
    }
    function clearSent() {
      const id = SESSION.id;
      sentOrders = [];
      rebuildSent();
      if (id) { try { localStorage.removeItem(sentKey(id)); } catch (_) {} }
    }
    /* Aucun pourboire présélectionné : un 15 % coché d'office gonflait le « Total »
       d'un montant que le client n'avait pas choisi. */
    let tipPercent = 0;

    // Split state
    let splitState = {
      mode: 'egal',          // 'egal' | 'article'
      egalCount: 3,
      articleCount: 3,
      selectedPerson: 0,
      assignments: {},        // sentLine idx -> person idx
    };

    // Customizer state
    let customizerItem = null;
    let customizerSelections = {};
    let customizerNote = '';
    let customizerEditingKey = null;
    let customizerEditingQty = 1;

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
    function pressKey(key) {
      if (key === 'back') {
        tableNumber = tableNumber.slice(0, -1);
      } else if (/^\d$/.test(key)) {
        if (tableNumber.length >= 3) return; // cap at 3 digits
        // avoid leading zero
        if (tableNumber === '' && key === '0') return;
        tableNumber += key;
      }
      renderTableDisplay();
      updateContinueState();
    }
    function renderTableDisplay() {
      const disp = $('#table-display');
      if (!tableNumber) {
        disp.innerHTML = `<span class="table-digit is-placeholder">·</span>`;
        return;
      }
      disp.innerHTML = tableNumber.split('').map(d => `<span class="table-digit">${d}</span>`).join('');
    }
    function updateContinueState() {
      const btn = $('#continue-btn');
      btn.classList.toggle('is-ready', tableNumber.length > 0);
    }

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
    const feedMedia = (() => {
      let io = null;
      const calm = () => {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch (_) { return false; }
      };

      function load(v) {
        if (!v.getAttribute('src') && v.dataset.src) v.setAttribute('src', v.dataset.src);
      }
      function play(v) {
        load(v);
        if (calm()) return;                       // affiche fixe, pas de boucle
        const p = v.play();
        if (p && p.catch) p.catch(() => {});      // refus d'autoplay → on n'insiste pas
      }

      function bind() {
        if (io) { io.disconnect(); io = null; }
        const list = $('#menu-list');
        if (!list) return;
        const vids = list.querySelectorAll('video[data-src]');
        if (!vids.length) return;

        if (!('IntersectionObserver' in window)) {
          // Vieux navigateur : on charge tout et on laisse le navigateur faire.
          vids.forEach(play);
          return;
        }
        io = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            const v = e.target;
            if (!e.isIntersecting) { try { v.pause(); } catch (_) {} return; }
            if (e.intersectionRatio >= 0.3) play(v);
            else load(v);                          // en approche : on précharge seulement
          });
        }, { root: list, rootMargin: '300px 0px', threshold: [0, 0.3] });
        vids.forEach(v => io.observe(v));
      }

      /* L'app passe d'un écran à l'autre : quand la carte n'est plus affichée,
         rien ne doit continuer à tourner derrière. Idem quand le téléphone se
         verrouille ou que le client change d'onglet. */
      function pauseAll() {
        const list = $('#menu-list');
        if (!list) return;
        list.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (_) {} });
      }
      function resume() {
        const list = $('#menu-list');
        if (!list || !list.closest('.screen.is-active')) return;
        bind();
      }
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseAll(); else resume();
      });

      return { bind, pauseAll, resume };
    })();

    /* Le média d'un plat, dans le cadre commun. L'ordre compte : une vidéo
       l'emporte sur une photo (elle vend mieux), la photo devient son affiche,
       et l'icône ne sert que quand le patron n'a rien mis — jamais comme
       vignette au rabais à côté d'un plat filmé. */
    function dishMedia(m) {
      if (m.video) {
        /* Une vidéo sans affiche est un rectangle VIDE tant qu'elle ne joue
           pas — et elle ne joue pas toujours : mode économie d'énergie, données
           réduites, « limiter les animations ». Le plat disparaissait alors du
           fil sans que rien ne le dise.
           Donc : avec une photo, elle sert d'affiche et on ne précharge rien ;
           sans photo, on demande les métadonnées, ce qui suffit au navigateur
           pour peindre la première image. Le coût réseau ne tombe que sur les
           plats que le patron n'a pas photographiés. */
        const poster = m.photo ? ` poster="${escapeHtml(m.photo)}"` : '';
        const pre = m.photo ? 'none' : 'metadata';
        return `<div class="dish-media">${dishTag(m)}` +
          `<video data-src="${escapeHtml(m.video)}"${poster} loop muted playsinline ` +
          `preload="${pre}" disablepictureinpicture aria-hidden="true"></video></div>`;
      }
      if (m.photo) {
        return `<div class="dish-media">${dishTag(m)}` +
          `<img src="${escapeHtml(m.photo)}" alt="" loading="lazy" decoding="async" /></div>`;
      }
      return `<div class="dish-media is-plain ${ICON_CLASS[m.icon] || 'coffee'}">${dishTag(m)}` +
        `<i data-lucide="${escapeHtml(m.icon || 'utensils')}"></i></div>`;
    }
    function dishTag(m) {
      return m.tag === 'new' ? `<span class="dish-tag">${escapeHtml(t('tag_new'))}</span>` : '';
    }

    function renderMenu(filter = 'all') {
      const list = $('#menu-list');
      list.classList.add('is-feed');
      const bits = String(filter).split('::'), catFilter = bits[0], subFilter = bits[1] || '';
      const items = MENU.filter(m => catFilter === 'all' || (m.cat === catFilter && (!subFilter || m.subId === subFilter)))
        .filter(m => !globalThis.KiwiGuest || globalThis.KiwiGuest.dietAllows(m));
      list.innerHTML = items.map(m => {
        const i = itemI18n(m.id);
        const out = m.avail === false;
        return `
        <article class="dish-card${out ? ' is-out' : ''}"${out ? '' : ` data-card="${escapeHtml(m.id)}"`}>
          ${dishMedia(m)}${out ? `<div class="dish-out">${escapeHtml(t('dish_out'))}</div>` : ''}
          <div class="dish-meta">
            ${m.formula ? '<div class="dish-tag">FORMULE</div>' : ''}
            <div class="dish-name">${escapeHtml(i.name)}</div>
            <div class="dish-foot">
              <span class="dish-price">${money(m.price)}</span>
              ${globalThis.KiwiOrderMenu ? KiwiOrderMenu.infoButton(m, i.name, t) : ''}
              ${out ? '' : `<button type="button" class="dish-add" data-add="${escapeHtml(m.id)}" aria-label="${escapeHtml(t('btn_add'))} ${escapeHtml(i.name)}">+</button>`}
            </div>
          </div>
        </article>
      `;}).join('');
      if (window.lucide) window.lucide.createIcons();
      feedMedia.bind();
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.afterMenu();
    }

    function renderMenuSubtabs(categoryId) {
      const row = $('.menu-subtabs');
      if (!row) return;
      const subtabs = MENU_SUBTABS.get(String(categoryId)) || [];
      row.innerHTML = subtabs.map(s => `<button class="menu-tab menu-subtab" role="tab" aria-selected="false" data-tab="${escapeHtml(String(categoryId) + '::' + String(s.id))}">${escapeHtml(String(s.name || ''))}</button>`).join('');
      row.classList.toggle('is-visible', subtabs.length > 0);
    }

    function activeMenuFilter() {
      return document.querySelector('.menu-subtab.is-active')?.dataset.tab
        || document.querySelector('.menu-tabs .menu-tab.is-active')?.dataset.tab
        || 'all';
    }

    /* ============ cart logic — line keys support variants ============ */
    const itemOf  = id => MENU.find(m => m.id === id);
    const nameOf  = id => itemI18n(id).name || itemOf(id)?.name || '';
    const descOf  = id => itemI18n(id).desc || itemOf(id)?.desc || '';
    const basePriceOf = id => itemOf(id)?.price || 0;
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

    function lineKey(id, options, note) {
      const parts = [id];
      const keys = Object.keys(options || {}).sort();
      for (const k of keys) {
        const v = options[k];
        if (Array.isArray(v)) {
          if (v.length) parts.push(`${k}=${v.slice().sort().join('+')}`);
        } else if (v != null && v !== '') {
          parts.push(`${k}=${v}`);
        }
      }
      if (note) parts.push(`note=${note}`);
      return parts.join('|');
    }

    function choiceLabel(optKey, choiceId, optChoice, optGroup) {
      const key = `opt_${optKey}_${choiceId}`;
      const staticVal = I18N[currentLang]?.[key] || I18N.fr?.[key];
      if (staticVal) return staticVal;

      const choiceStr = String(choiceId || '');
      const catalogItem = (typeof MENU_ALL !== 'undefined' && MENU_ALL ? MENU_ALL.get(choiceStr) : null)
        || (typeof allItems !== 'undefined' && Array.isArray(allItems) ? allItems.find(x => String(x.id) === choiceStr) : null);
      if (catalogItem) {
        const tr = (MENU_I18N[currentLang] && MENU_I18N[currentLang][choiceStr])
          || (typeof menuTr === 'function' ? menuTr(catalogItem, currentLang) : null);
        if (tr && tr.name) return String(tr.name);
        if (catalogItem.name) return String(catalogItem.name);
      }

      const opt = optGroup || OPT[optKey];
      let choice = optChoice || (opt && opt.choices ? opt.choices.find(c => String(c.id) === choiceStr) : null);
      if (!choice && optKey && String(optKey).startsWith('formula_')) {
        for (const [k, g] of Object.entries(OPT)) {
          if (k.startsWith('formula_') && Array.isArray(g?.choices)) {
            const found = g.choices.find(c => String(c.id) === choiceStr);
            if (found) { choice = found; break; }
          }
        }
      }

      if (choice) {
        if (choice.targetItem) {
          const tr = (MENU_I18N[currentLang] && MENU_I18N[currentLang][choiceStr])
            || (typeof menuTr === 'function' ? menuTr(choice.targetItem, currentLang) : null);
          if (tr && tr.name) return String(tr.name);
          if (choice.targetItem.name) return String(choice.targetItem.name);
        }
        if (choice._src && typeof menuTr === 'function') {
          const tr = menuTr(choice._src, currentLang);
          if (tr && tr.name) return String(tr.name);
        }
        if (choice.label) return String(choice.label);
      }

      if (/^(it|sl|opt)_[A-Za-z0-9_-]+$/i.test(choiceStr)) {
        return t('opt_unavailable');
      }

      return choiceStr;
    }
    function groupLabel(optKey) {
      const key = `opt_label_${optKey}`;
      if (I18N[currentLang]?.[key]) return I18N[currentLang][key];
      if (I18N.fr?.[key]) return I18N.fr[key];
      const opt = OPT[optKey];
      if (opt) {
        if (opt._src && typeof menuTr === 'function') {
          const tr = menuTr(opt._src, currentLang);
          if (tr && tr.name) return String(tr.name);
          if (tr && tr.label) return String(tr.label);
        }
        if (opt.label) return String(opt.label);
      }
      if (/^(it|sl|opt)_[A-Za-z0-9_-]+$/i.test(String(optKey || ''))) {
        return t('opt_unavailable');
      }
      return String(optKey || '');
    }
    function choiceEmoji(optKey, choiceId) {
      return OPT[optKey]?.choices.find(c => c.id === choiceId)?.emoji || '';
    }
    function describeOptions(line) {
      const item = itemOf(line.id);
      if (!item || !item.options) return '';
      const parts = [];
      for (const opt of item.options) {
        const sel = line.options?.[opt.key];
        if (sel == null) continue;
        if (opt.type === 'single') {
          /* Tout choix fait est écrit, y compris celui que la carte appelait
             « par défaut » : une ligne « Espresso » qui cache « Sucré » laisse
             le client recevoir un sucre qu'il n'a jamais lu. Un groupe laissé
             vide n'est pas un choix : rien à écrire. */
          if (!sel) continue;
          parts.push(choiceLabel(opt.key, sel));
        } else if (opt.type === 'multi' && Array.isArray(sel) && sel.length) {
          const labels = sel.map(id => choiceLabel(opt.key, id)).filter(Boolean);
          if (labels.length) {
            const prefix = opt.key === 'retirer' ? t('opt_retirer_prefix') : '';
            parts.push(prefix + labels.join(', ').toLowerCase());
          }
        }
      }
      return parts.join(' · ');
    }
    function describeOptionChoices(line) {
      const item = itemOf(line.id);
      if (!item || !item.options) return [];
      const out = [];
      for (const opt of item.options) {
        if (opt.formulaSlotId) continue;
        const sel = line.options?.[opt.key];
        const ids = opt.type === 'multi' ? (Array.isArray(sel) ? sel : []) : (!sel ? [] : [sel]);
        ids.forEach(id => {
          if (!id) return;
          out.push({ group: opt.key, choiceId: id, label: choiceLabel(opt.key, id) });
        });
      }
      return out;
    }
    function describeOptionVisuals(line, regularOnly = false) {
      const item = itemOf(line.id);
      if (!item || !item.options) return [];
      const out = [];
      for (const opt of item.options) {
        if (regularOnly && opt.formulaSlotId) continue;
        const sel = line.options?.[opt.key];
        const ids = opt.type === 'multi' ? (Array.isArray(sel) ? sel : []) : (!sel ? [] : [sel]);
        ids.forEach(id => {
          if (!id) return;
          const emoji = choiceEmoji(opt.key, id);
          const name = choiceLabel(opt.key, id);
          if (name) out.push({ emoji: emoji || '', name });
        });
      }
      return out;
    }

    function totals() {
      let count = 0, total = 0;
      cart.forEach(line => {
        count += line.qty;
        total += line.qty * line.unitPrice;
      });
      return { count, total };
    }
    function refreshCartUI() {
      const { count, total } = totals();
      const pill = $('#cart-pill');
      $('#cart-count').textContent = count;
      $('#cart-total').textContent = `${money(total)}`;
      $('#cart-grand').textContent = `${money(total)}`;
      pill.classList.toggle('is-visible', count > 0);
      /* Closed hours or no Order Pro: the button says so before the server would. */
      const gate = !!(globalThis.KiwiOrderMenu && KiwiOrderMenu.blocked());
      $('#send-btn').disabled = count === 0 || gate;
      if (gate) $('#send-btn').setAttribute('title', t('closed_why')); else $('#send-btn').removeAttribute('title');

      const itemsEl = $('#cart-items');
      if (count === 0) {
        itemsEl.innerHTML = `<li class="cart-empty">${t('cart_empty')}</li>`;
        return;
      }
      itemsEl.innerHTML = [...cart.entries()].map(([key, line]) => {
        const safe = encodeURIComponent(key);
        const opts = describeOptions(line);
        const note = line.note ? `<div class="cart-item-note">${escapeHtml(line.note)}</div>` : '';
        return `
          <li class="cart-row">
            <div class="info">
              <span class="label">${escapeHtml(nameOf(line.id))}</span>
              ${opts ? `<div class="cart-item-opts">${escapeHtml(opts)}</div>` : ''}
              ${note}
            </div>
            <span class="qty">
              <button type="button" data-dec="${safe}" aria-label="−">−</button>
              <span>${line.qty}</span>
              <button type="button" data-inc="${safe}" aria-label="+">+</button>
            </span>
            <span class="row-price">${money(line.qty * line.unitPrice)}</span>
          </li>
        `;
      }).join('');
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function addLineToCart(line) {
      if (globalThis.KiwiOrderMenu && !KiwiOrderMenu.ordering()) return;
      const key = lineKey(line.id, line.options, line.note);
      const addQty = Math.max(1, Number(line && line.qty) || 1);
      if (cart.has(key)) {
        cart.get(key).qty += addQty;
      } else {
        cart.set(key, { ...line, qty: addQty });
      }
      refreshCartUI();
      showToast(`${nameOf(line.id)} · ${t('toast_added')}`);
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.onAdded(line);
    }
    function decFromCart(key) {
      if (!cart.has(key)) return;
      const line = cart.get(key);
      line.qty -= 1;
      if (line.qty <= 0) cart.delete(key);
      refreshCartUI();
    }
    function incFromCart(key) {
      if (!cart.has(key)) return;
      cart.get(key).qty += 1;
      refreshCartUI();
    }

    /* ============ + button on a menu item ============ */
    function standaloneMenuItem(itemId) {
      const source = MENU_ALL.get(String(itemId));
      if (source && (source.archived || source.formulaOnly || source.avail === false)) { showToast(t('dish_out')); return null; }
      return itemOf(itemId);
    }

    function handleAddClick(itemId) {
      const item = standaloneMenuItem(itemId);
      if (!item) return;
      if (item.options && item.options.length > 0) {
        openCustomizer(item);
      } else {
        addLineToCart({
          id: itemId,
          options: {},
          note: '',
          unitPrice: item.price,
        });
      }
    }

    /* ============ Customizer ============ */
    function initialCustomizerSelections(options) {
      const selections = {};
      for (const opt of options || []) {
        /* A published default is menu configuration, not customer consent.
           Every OrderPro option starts empty and only an explicit tap may
           select it, for ordinary modifiers and formula stages alike. */
        selections[opt.key] = opt.type === 'single' ? '' : [];
      }
      return selections;
    }

    /* Le groupe obligatoire encore vide, ou null. Même règle que le contrôle de
       confirmCustomizer, pour que le bouton « Ajouter » et le refus ne
       divergent jamais. */
    function unansweredRequiredOption(item, selections) {
      return (item && item.options || []).find((opt) => {
        const selected = selections[opt.key];
        const count = Array.isArray(selected) ? selected.length : (selected ? 1 : 0);
        const minimum = opt.formulaSlotId ? Math.max(0, Number(opt.min) || 0) : (opt.required ? 1 : 0);
        return count < minimum;
      }) || null;
    }
    function syncCustomizerGate() {
      const btn = document.getElementById('custom-add-btn');
      if (!btn) return;
      const blocked = !!(customizerItem && unansweredRequiredOption(customizerItem, customizerSelections));
      btn.disabled = blocked;
      btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    }

    function openCustomizer(item, qty, editingKey) {
      customizerItem = item;
      customizerEditingKey = editingKey || null;
      customizerEditingQty = Math.max(1, Number(qty) || 1);
      customizerSelections = initialCustomizerSelections(item.options);
      customizerNote = '';

      // Populate header
      const i = itemI18n(item.id);
      $('#custom-name').textContent = i.name;
      $('#custom-desc').textContent = i.desc;
      $('#custom-base').textContent = `${t('custom_from')} ${money(item.price)}`;
      const nutritionEl = $('#custom-nutrition');
      const nutritionHtml = globalThis.KiwiOrderMenu ? KiwiOrderMenu.nutritionDetail(item, t) : '';
      nutritionEl.innerHTML = nutritionHtml;
      nutritionEl.hidden = !nutritionHtml;
      const imgEl = $('#custom-img');
      imgEl.className = 'custom-img ' + (ICON_CLASS[item.icon] || 'coffee');
      imgEl.innerHTML = `<i data-lucide="${escapeHtml(item.icon)}"></i>`;

      // Render option groups
      const opts = $('#custom-options');
      opts.innerHTML = (item.options || []).map(opt => {
        const showChoiceImages = !!opt.formulaSlotId && opt.choices.some(choice => choice.photo);
        return `
        <div class="option-group${showChoiceImages ? ' has-choice-images' : ''}" data-opt="${escapeHtml(opt.key)}">
          <div class="option-group-label">
            <span>${escapeHtml(groupLabel(opt.key))}</span>
            <span class="opt-type">${(opt.required || (opt.formulaSlotId && Math.max(0, Number(opt.min) || 0) > 0))
              ? `${t('opt_required')} · ${opt.type === 'multi' ? t('opt_choose_many') : t('opt_choose_one')}`
              : (opt.type === 'multi' ? t('opt_choose_many') : t('opt_choose_one'))}</span>
          </div>
          <div class="option-chips">
            ${opt.choices.map(c => `
              <button class="option-chip" type="button"
                      data-opt="${escapeHtml(opt.key)}" data-choice="${escapeHtml(c.id)}" data-type="${escapeHtml(opt.type)}">
                ${showChoiceImages ? `<span class="option-choice-media">${c.photo
                  ? `<img src="${escapeHtml(c.photo)}" alt="" loading="lazy" decoding="async" />`
                  : `<span class="option-choice-fallback" aria-hidden="true">${escapeHtml(choiceLabel(opt.key, c.id, c, opt).slice(0, 1).toUpperCase())}</span>`}</span>` : ''}
                <span class="${showChoiceImages ? 'option-choice-copy' : ''}"><span class="${showChoiceImages ? 'option-choice-name' : ''}">${c.emoji ? `${escapeHtml(c.emoji)} ` : ''}${escapeHtml(choiceLabel(opt.key, c.id, c, opt))}</span>
                ${c.delta ? `<span class="delta">+${money(c.delta)}</span>` : ''}</span>
                ${showChoiceImages ? '<span class="option-choice-check" aria-hidden="true"><i data-lucide="check"></i></span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>
      `; }).join('');

      // Mark defaults as active
      $$('.option-chip', opts).forEach(chip => {
        const k = chip.dataset.opt, c = chip.dataset.choice, t = chip.dataset.type;
        if (t === 'single' && customizerSelections[k] === c) chip.classList.add('is-active');
      });

      // Reset note
      $('#custom-note-input').value = '';

      refreshCustomizerPrice();
      syncCustomizerGate();
      const customScroll = $('.custom-scroll', $('#custom-sheet'));
      if (customScroll) customScroll.scrollTop = 0;
      $('#custom-sheet').classList.add('is-open');
      $('#custom-sheet').setAttribute('aria-hidden', 'false');
      if (window.lucide) window.lucide.createIcons();
    }
    function closeCustomizer() {
      $('#custom-sheet').classList.remove('is-open');
      $('#custom-sheet').setAttribute('aria-hidden', 'true');
      customizerItem = null;
      customizerEditingKey = null;
      customizerEditingQty = 1;
    }
    function selectCustomizerChoice(optKey, choiceId, type) {
      if (type === 'single') {
        const definition = (customizerItem.options || []).find(opt => opt.key === optKey);
        const mayClear = !definition || (!definition.required && !(definition.formulaSlotId && Math.max(0, Number(definition.min) || 0) > 0));
        customizerSelections[optKey] = mayClear && customizerSelections[optKey] === choiceId ? '' : choiceId;
      } else {
        const arr = customizerSelections[optKey] || [];
        const i = arr.indexOf(choiceId);
        const def = (customizerItem.options || []).find(opt => opt.key === optKey);
        if (i >= 0) arr.splice(i, 1);
        else if (!def || !def.formulaSlotId || arr.length < Math.max(1, Number(def.max) || 1)) arr.push(choiceId);
        customizerSelections[optKey] = arr;
      }
      // Update chip visuals
      const group = document.querySelector(`.option-group[data-opt="${CSS.escape(String(optKey))}"]`);
      if (!group) return;
      group.classList.remove('is-invalid');
      group.removeAttribute('aria-invalid');
      if (type === 'single') {
        $$('.option-chip', group).forEach(c => {
          c.classList.toggle('is-active', customizerSelections[optKey] === c.dataset.choice);
        });
      } else {
        $$('.option-chip', group).forEach(c => {
          c.classList.toggle('is-active', customizerSelections[optKey].includes(c.dataset.choice));
        });
      }
      refreshCustomizerPrice();
      syncCustomizerGate();
    }
    function customizerUnitPrice() {
      if (!customizerItem) return 0;
      let p = customizerItem.price;
      for (const opt of customizerItem.options || []) {
        const sel = customizerSelections[opt.key];
        if (opt.type === 'single' && sel) {
          const c = opt.choices.find(c => c.id === sel);
          if (c) p += (c.delta || 0);
        } else if (opt.type === 'multi' && Array.isArray(sel)) {
          for (const id of sel) {
            const c = opt.choices.find(c => c.id === id);
            if (c) p += (c.delta || 0);
          }
        }
      }
      return p;
    }
    function refreshCustomizerPrice() {
      $('#custom-price-value').textContent = `${money(customizerUnitPrice())}`;
    }
    function confirmCustomizer() {
      if (!customizerItem) return;
      const invalidRequiredOption = (customizerItem.options || []).find((opt) => {
        const selected = customizerSelections[opt.key];
        const count = Array.isArray(selected) ? selected.length : (selected ? 1 : 0);
        const minimum = opt.formulaSlotId ? Math.max(0, Number(opt.min) || 0) : (opt.required ? 1 : 0);
        const maximum = opt.formulaSlotId ? Math.max(1, Number(opt.max) || 1) : Infinity;
        return count < minimum || count > maximum;
      });
      if (invalidRequiredOption) {
        const group = Array.from(document.querySelectorAll('.option-group'))
          .find(el => el.dataset.opt === invalidRequiredOption.key);
        if (group) {
          group.classList.add('is-invalid');
          group.setAttribute('aria-invalid', 'true');
          group.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const firstChoice = group.querySelector('.option-chip');
          if (firstChoice) window.setTimeout(() => firstChoice.focus({ preventScroll: true }), 260);
        }
        const optGroupName = groupLabel(invalidRequiredOption.key) || '';
        showToast(t('opt_required_missing').replace('{name}', optGroupName));
        return;
      }
      if (customizerEditingKey && cart.has(customizerEditingKey)) {
        cart.delete(customizerEditingKey);
      }
      const restoreQty = customizerEditingQty || 1;
      customizerEditingKey = null;
      customizerEditingQty = 1;
      customizerNote = $('#custom-note-input').value.trim();
      addLineToCart({
        id: customizerItem.id,
        options: { ...customizerSelections },
        note: customizerNote,
        unitPrice: customizerUnitPrice(),
        qty: restoreQty,
      });
      closeCustomizer();
    }

    /* ============ Service bar (table mode) ============ */
    let serviceRequestPending = false;
    async function sendServiceRequest(action) {
      if (serviceRequestPending || !SESSION.id || SESSION.closed) return false;
      serviceRequestPending = true;
      const res = await NET.serviceRequest(SESSION.id, action);
      serviceRequestPending = false;
      if (res && res.ok) return true;
      if (res && res.error === 'session-closed') SESSION.markClosed('settle');
      else showToast(res && res.error === 'network' ? t('order_offline') : t('order_failed'));
      return false;
    }
    async function callServer() {
      const pill = document.querySelector('[data-service="call-server"]');
      pill.classList.add('is-pulled');
      if (await sendServiceRequest('call-server')) {
        showToast(`${t('toast_server_coming_pre')} ${tableNumber}`);
      }
      setTimeout(() => pill.classList.remove('is-pulled'), 4000);
    }

    /* ============ Bill sheet + gamified tip ============ */
    function openBill() {
      renderBill();
      setTipPercent(0);

      $('#bill-sheet').classList.add('is-open');
      $('#bill-sheet').setAttribute('aria-hidden', 'false');
    }
    const ORDER_STATE_KEY = { pending: 'prep_waiting', accepted: 'prep_accepted', ready: 'prep_ready',
                              served: 'order_served', rejected: 'bill_order_refused' };
    function renderBill() {
      $('#bill-table').textContent = tableNumber;
      const ordersEl = $('#bill-orders');
      if (ordersEl) {
        ordersEl.innerHTML = sentOrders.map(o => `
          <li class="bill-order${o.status === 'rejected' ? ' is-refused' : ''}">
            <span>${escapeHtml(t('bill_order_label'))} ${escapeHtml(o.number || '')}</span>
            <span>${escapeHtml(t(ORDER_STATE_KEY[o.status] || 'prep_accepted'))}</span>
          </li>`).join('');
        ordersEl.hidden = !sentOrders.length;
      }

      // Aggregate sent lines by lineKey
      const agg = new Map();
      for (const l of sentLines) {
        // Same dish at two prices (a promotion that ended) stays two rows.
        const key = lineKey(l.id, l.options, l.note) + '|' + toCents(l.unitPrice);
        if (agg.has(key)) agg.get(key).qty += l.qty;
        else agg.set(key, { ...l });
      }
      const billItems = [...agg.values()];

      const itemsEl = $('#bill-items');
      if (billItems.length === 0) {
        itemsEl.innerHTML = `<li class="bill-empty">${t('bill_empty')}</li>`;
      } else {
        itemsEl.innerHTML = billItems.map(l => {
          const opts = describeOptions(l);
          return `
            <li class="bill-row">
              <div class="bill-row-info">
                <div class="bill-row-name">${l.qty}× ${escapeHtml(nameOf(l.id))}</div>
                ${opts ? `<div class="bill-row-opts">${escapeHtml(opts)}</div>` : ''}
              </div>
              <div class="bill-row-price">${money(l.qty * l.unitPrice)}</div>
            </li>
          `;
        }).join('');
      }

      // Update bill subtitle (e.g. "Table 7")
      const subtitleEl = $('#bill-subtitle');
      if (subtitleEl) subtitleEl.innerHTML = `${t('badge_table')} <span id="bill-table">${tableNumber}</span>`;

      $('#bill-subtotal-value').textContent = `${money(sessionTotal)}`;
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.decorateBill();
    }
    function closeBill() {
      $('#bill-sheet').classList.remove('is-open');
      $('#bill-sheet').setAttribute('aria-hidden', 'true');
    }

    const TIP_LEVELS = [
      { min: 0,  max: 0,   key: 'tip_level_0', empty: true },
      { min: 1,  max: 8,   key: 'tip_level_1' },
      { min: 9,  max: 12,  key: 'tip_level_2' },
      { min: 13, max: 17,  key: 'tip_level_3' },
      { min: 18, max: 22,  key: 'tip_level_4' },
      { min: 23, max: 100, key: 'tip_level_5', celebrated: true },
    ];

    function setTipPercent(pct) {
      tipPercent = pct;
      const tipAmt = Math.round(sessionTotal * pct / 100);
      const total = sessionTotal + tipAmt;

      const tipAmtEl = $('#tip-amount');
      tipAmtEl.textContent = `+${money(pct === 0 ? 0 : tipAmt)}`;
      tipAmtEl.classList.toggle('is-zero', pct === 0);

      // Jar fill — 20% tip fills jar to top, 25%+ overflows
      const fillPct = Math.min(100, pct * 5);
      const offset = 86 * (1 - fillPct / 100);
      const fill = $('#tip-jar-fill');
      const shimmer = $('#tip-jar-shimmer');
      if (fill) fill.style.transform = `translateY(${offset}px)`;
      if (shimmer) shimmer.style.transform = `translateY(${offset}px)`;

      // Level label
      const level = TIP_LEVELS.find(l => pct >= l.min && pct <= l.max) || TIP_LEVELS[0];
      const lbl = $('#tip-level');
      lbl.textContent = t(level.key);
      lbl.classList.toggle('is-empty', !!level.empty);
      lbl.classList.toggle('is-celebrated', !!level.celebrated);

      // Sparkles + shimmer
      const wrap = $('#tip-jar-wrap');
      wrap.classList.toggle('is-overflow', pct >= 20);
      wrap.classList.toggle('is-fancy', pct >= 13);

      // Chip active state
      $$('.tip-chip').forEach(c => {
        c.classList.toggle('is-active', parseInt(c.dataset.tip, 10) === pct);
      });

      // Total
      $('#bill-total-value').textContent = `${money(total)}`;
    }

    async function confirmBill() {
      if (!await sendServiceRequest('ask-bill')) return;
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.billAsked();
      closeBill();
      // This requests the whole table's bill, not this phone's subtotal or an
      // unsaved tip. A successful write is not a promise that staff has arrived.
      showToast(`${t('toast_bill_asked_pre')} ${tableNumber}`);
    }

    /* ============ Split-bill (égal / par article) ============ */
    function openSplit() {
      if (sessionTotal === 0) return; // nothing to split
      // Reset assignments when opening fresh
      splitState.assignments = {};
      splitState.selectedPerson = 0;
      refreshSplitUI();
      setSplitMode(splitState.mode);
      $('#split-sheet').classList.add('is-open');
      $('#split-sheet').setAttribute('aria-hidden', 'false');
    }
    function closeSplit() {
      $('#split-sheet').classList.remove('is-open');
      $('#split-sheet').setAttribute('aria-hidden', 'true');
    }
    function setSplitMode(mode) {
      splitState.mode = mode;
      $$('.split-mode-tab').forEach(tab =>
        tab.classList.toggle('is-active', tab.dataset.splitMode === mode));
      $('#split-egal').hidden = mode !== 'egal';
      $('#split-article').hidden = mode !== 'article';
      refreshSplitUI();
    }
    function setEgalCount(count) {
      splitState.egalCount = count;
      $$('[data-egal-count]').forEach(c =>
        c.classList.toggle('is-active', parseInt(c.dataset.egalCount, 10) === count));
      refreshSplitUI();
    }
    function setArticleCount(count) {
      splitState.articleCount = count;
      if (splitState.selectedPerson >= count) splitState.selectedPerson = 0;
      // Drop any assignment that points to a now-out-of-range person
      Object.keys(splitState.assignments).forEach(k => {
        if (splitState.assignments[k] >= count) delete splitState.assignments[k];
      });
      $$('[data-article-count]').forEach(c =>
        c.classList.toggle('is-active', parseInt(c.dataset.articleCount, 10) === count));
      refreshSplitUI();
    }
    function setSplitPerson(idx) {
      splitState.selectedPerson = idx;
      renderSplitArticle();
    }
    function toggleSplitItem(lineIdx) {
      const cur = splitState.assignments[lineIdx];
      if (cur === splitState.selectedPerson) delete splitState.assignments[lineIdx];
      else splitState.assignments[lineIdx] = splitState.selectedPerson;
      renderSplitArticle();
    }

    function refreshSplitUI() {
      const subtotal = sessionTotal;
      const tipAmt = Math.round(sessionTotal * tipPercent / 100);
      const grand = subtotal + tipAmt;
      // Subtitle
      const subtitleEl = $('#split-subtitle');
      if (subtitleEl) {
        subtitleEl.textContent = t('split_subtitle_tpl')
          .replace('{n}', tableNumber || '—')
          .replace('{total}', fmtAmount(grand))
          .replace('{cur}', cur());
      }
      if (splitState.mode === 'egal') {
        $('#split-egal-subtotal').textContent = `${money(subtotal)}`;
        $('#split-egal-tip').textContent = `${money(tipAmt)}`;
        const per = Math.ceil(toCents(grand) / splitState.egalCount) / 100;
        $('#split-egal-per').textContent = `${money(per)}`;
      } else {
        renderSplitArticle();
      }
    }

    function personSubtotal(personIdx) {
      let sum = 0;
      sentLines.forEach((line, idx) => {
        if (splitState.assignments[idx] === personIdx) {
          sum += line.qty * line.unitPrice;
        }
      });
      return sum;
    }

    function renderSplitArticle() {
      const tabsEl = $('#split-people-tabs');
      const poolEl = $('#split-items-pool');
      if (!tabsEl || !poolEl) return;

      const people = Array.from({ length: splitState.articleCount }, (_, i) => i);
      tabsEl.innerHTML = people.map(i => {
        const total = personSubtotal(i);
        const isActive = splitState.selectedPerson === i;
        return `
          <button class="split-person-tab ${isActive ? 'is-active' : ''}" type="button" data-split-person="${i}">
            <span class="name">${t('split_person_pre')} ${i + 1}</span>
            <span class="val">${money(total)}</span>
          </button>
        `;
      }).join('');

      poolEl.innerHTML = sentLines.map((line, idx) => {
        const owner = splitState.assignments[idx];
        const isMine = owner === splitState.selectedPerson;
        const isOther = owner != null && owner !== splitState.selectedPerson;
        const ownerLabel = isOther ? `${t('split_person_pre')} ${owner + 1}` : '';
        return `
          <div class="split-pool-item ${isMine ? 'is-mine' : ''} ${isOther ? 'is-other' : ''}"
               data-split-item="${idx}" ${isOther ? `data-owner="${escapeHtml(ownerLabel)}"` : ''}>
            <span class="info">
              <span class="qty">${line.qty}×</span>
              <span class="name">${escapeHtml(nameOf(line.id))}</span>
            </span>
            <span class="price">${money(line.qty * line.unitPrice)}</span>
          </div>
        `;
      }).join('');
    }

    function confirmSplit() {
      const subtotal = sessionTotal;
      const tipAmt = Math.round(sessionTotal * tipPercent / 100);
      const grand = subtotal + tipAmt;
      let msg;
      if (splitState.mode === 'egal') {
        const per = Math.ceil(toCents(grand) / splitState.egalCount) / 100;
        msg = `${t('toast_split_egal')} ${splitState.egalCount} × ${money(per)}`;
      } else {
        const totals = [];
        for (let i = 0; i < splitState.articleCount; i++) {
          const sub = personSubtotal(i);
          // Distribute tip proportionally per person
          const tipShare = subtotal > 0 ? Math.round(tipAmt * (sub / subtotal)) : 0;
          totals.push(sub + tipShare);
        }
        msg = `${t('toast_split_egal')} ${totals.map(x => fmtAmount(x)).join(' · ')} ${cur()}`;
      }
      closeSplit();
      closeBill();
      showToast(msg);
    }

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
    function openCart() {
      $('#cart-sheet').classList.add('is-open');
      $('#cart-sheet').setAttribute('aria-hidden', 'false');
    }
    function closeCart() {
      $('#cart-sheet').classList.remove('is-open');
      $('#cart-sheet').setAttribute('aria-hidden', 'true');
    }

    /* ============ send order ============ */
    /* The order leaves the phone over WiFi and lands in the caisse's queue.
       No optimistic UI: if the relay fails the customer is told, because a
       fake "sent to the kitchen" is how a table waits 20 minutes for nothing. */
    let currentOrderId = '';
    /* La clé d'idempotence de l'envoi en cours. Conservée tant que l'envoi n'a
       pas abouti, pour qu'un deuxième tap rejoue la même commande au lieu d'en
       créer une seconde ; effacée dès qu'elle est acceptée, pour que la
       commande SUIVANTE soit bien une nouvelle commande. */
    let pendingRef = '';
    async function sendOrder() {
      if (!cart.size) return;
      if (globalThis.KiwiOrderMenu && KiwiOrderMenu.blocked()) {
        showToast(t(KiwiOrderMenu.ordering() ? 'closed_why' : 'ordering_off_note'));
        return;
      }
      const btn = $('#send-btn');
      if (btn.classList.contains('is-loading')) return;
      if (SESSION.closed) { gotoScreen('screen-thanks'); return; }
      const label = $('#send-label');
      const prevLabel = label ? label.textContent : '';
      const loadingOwner = { scope: SESSION.sendScope() };
      btn.orderProLoadingOwner = loadingOwner;
      const releaseLoading = (restoreLabel = true) => {
        if (btn.orderProLoadingOwner !== loadingOwner) return;
        btn.classList.remove('is-loading');
        if (label && restoreLabel) label.textContent = prevLabel;
        delete btn.orderProLoadingOwner;
      };
      btn.classList.add('is-loading');
      if (label) label.textContent = t('order_sending');

      const summary = [...cart.entries()]
        .map(([, line]) => `${line.qty}× ${nameOf(line.id)}`)
        .join(' · ');
      const totalNow = totals().total;
      // Snapshot current cart into sentLines (for à-table bill aggregation)
      const linesCopy = [...cart.values()].map(l => ({ ...l, options: { ...l.options } }));

      // Resolve the visit BEFORE choosing its retry identity.
      if ((!SESSION.id || SESSION.mode !== orderMode || String(SESSION.table || '') !== String(orderMode === 'table' ? tableNumber : ''))
          && !(await SESSION.open(orderMode, orderMode === 'table' ? tableNumber : ''))) {
        releaseLoading();
        return;
      }
      loadingOwner.scope = SESSION.sendScope();

      /* On n'envoie plus ni les noms ni les prix : rien que des identifiants et
         des quantités. Le serveur ouvre la carte publiée par le commerçant, y
         lit le prix et recalcule le total. Avant, une requête modifiée créait
         une commande à 1 MAD pour un plat à 250 et le ticket cuisine sortait
         avec le faux prix. */
      const makeLinesPayload = ref => linesCopy.flatMap((l, lineIndex) => {
        const item = itemOf(l.id);
        const formulaSlots = (item && item.options || []).filter(opt => opt.formulaSlotId);
        const formulaUid = formulaSlots.length ? `${ref}-${lineIndex}`.slice(0, 40) : '';
        const parent = {
          id: l.id, qty: l.qty,
          options: describeOptionChoices(l).map(p => `${groupLabel(p.group)}: ${p.label}`).join(' · '),
          optionChoices: describeOptionChoices(l),
          visuals: describeOptionVisuals(l, true),
          note: l.note || '',
        };
        if (!formulaUid) return [parent];
        Object.assign(parent, { kind: 'formula', formulaUid, formulaName: nameOf(l.id) });
        const children = [];
        formulaSlots.forEach(slot => {
          const selected = l.options?.[slot.key];
          /* Une étape facultative jamais touchée vaut '' (initialCustomizerSelections),
             pas `undefined` : `== null` la laissait passer et on envoyait un
             composant d'identifiant vide. Le serveur ne le trouvait dans aucun
             choix du créneau et refusait TOUTE la formule — « Options à
             rechoisir » sur un plat pourtant correctement composé. */
          const ids = (slot.type === 'multi' ? (Array.isArray(selected) ? selected : [])
            : (selected == null ? [] : [selected])).filter(Boolean);
          ids.forEach((id, choiceIndex) => children.push({
            id, qty: l.qty, kind: 'formula-part', formulaUid,
            formulaName: nameOf(l.id), slotLabel: slot.label || '',
            formulaSlotId: slot.formulaSlotId,
            lineId: `${formulaUid}-${slot.formulaSlotId}-${choiceIndex}`.slice(0, 60),
          }));
        });
        return [parent].concat(children);
      });

      // Hash the exact payload with neutral formula IDs, then restore its ref
      // before deriving the real formulaUid/lineId values. No basket is stored.
      const neutralPayload = makeLinesPayload('');
      const attempt = await SESSION.prepareSend(neutralPayload);
      if (SESSION.closed || attempt.scope !== SESSION.sendScope()) {
        SESSION.clearPendingSend(attempt);
        pendingRef = '';
        releaseLoading();
        return;
      }
      pendingRef = attempt.ref;
      const linesPayload = neutralPayload.map(line => !line.formulaUid ? line : {
        ...line, formulaUid: (pendingRef + line.formulaUid).slice(0, 40),
        ...(line.lineId ? { lineId: (pendingRef + line.lineId).slice(0, 60) } : {}),
      });

      let res = await NET.placeOrder({
        mode: orderMode,                       // 'table' | 'takeout'
        table: orderMode === 'table' ? tableNumber : '',
        session: SESSION.id || '',
        ref: pendingRef,
        lines: linesPayload,
        ...(globalThis.KiwiGuest ? globalThis.KiwiGuest.orderExtras() : {}),
      });

      const currentVisit = !SESSION.closed && attempt.scope === SESSION.sendScope();
      releaseLoading(currentVisit);
      // A response can outlive payment and an explicit reorder. Retire an
      // acknowledged old attempt, but never apply it to the new visit's UI.
      if (!currentVisit) {
        if (res && res.ok) SESSION.clearPendingSend(attempt);
        if (pendingRef === attempt.ref) pendingRef = '';
        return;
      }

      if (!res || !res.ok) {
        const err = res && res.error;
        /* La session a été fermée pendant qu'on commandait : l'addition vient
           d'être réglée. Le dire franchement vaut mieux qu'un « échec » qui
           inviterait à réessayer indéfiniment. */
        if (err === 'session-closed') {
          SESSION.markClosed('settle');
          return;
        }
        if (err === 'service-closed') { showToast(t('order_closed')); return; }
        /* « Servir au ftour » arrivé trop tard : on décoche, on le dit, le
           client renvoie la même commande pour tout de suite. */
        if (err === 'ftour-unavailable') {
          SESSION.clearPendingSend(attempt);
          pendingRef = '';
          if (globalThis.KiwiGuest) globalThis.KiwiGuest.ftourRefused();
          return;
        }
        /* La file est pleine : renvoyer échouerait pareil. On le dit, et on
           envoie le client vers l'équipe. */
        if (err === 'queue-full' || err === 'table-queue-full') {
          SESSION.clearPendingSend(attempt);
          pendingRef = '';
          showToast(t('order_busy'));
          return;
        }
        /* La carte a bougé sous les doigts du client — un plat épuisé, un plat
           retiré. On le dit avec le nom, et on retire la ligne : réessayer à
           l'identique échouerait exactement pareil. */
        if (err === 'menu-changed') {
          SESSION.clearPendingSend(attempt);
          pendingRef = '';
          const invalidOpts = Array.isArray(res.invalidOptions) ? res.invalidOptions.filter(Boolean) : [];
          const gone = [].concat(res.unavailable || [], res.unknown || []).filter(Boolean);

          if (invalidOpts.length) {
            const targetNames = invalidOpts.join(', ');
            showToast(t('order_options_changed').replace('{n}', targetNames || t('order_item_fallback')));
            let reopened = false;
            for (const [key, line] of [...cart.entries()]) {
              const m = itemOf(line.id);
              const match = invalidOpts.includes(line.id) || (m && invalidOpts.includes(m.name));
              if (match && m) {
                openCustomizer(m, line.qty, key);
                reopened = true;
                break;
              }
            }
            if (!reopened) {
              refreshCartUI();
              reloadMenu();
            }
            return;
          }

          if (gone.length) {
            const targetGone = gone.join(', ');
            showToast(t('order_gone').replace('{n}', targetGone || t('order_item_fallback')));
            dropUnavailable(res.unknown || [], res.unavailable || []);
            return;
          }

          showToast(t('order_menu_updated'));
          reloadMenu();
          return;
        }
        showToast(err === 'network' && !attempt.durable ? t('order_retry_local')
          : err === 'network' ? t('order_unconfirmed') : t('order_failed'));
        return;                                // cart intact — they can retry
      }

      SESSION.clearPendingSend(attempt);
      pendingRef = '';
      currentOrderId = String(res.id || '');
      lastStatus = '';
      /* Le total qui compte est celui que le SERVEUR a calculé. S'il diffère de
         ce que le téléphone affichait (un prix changé au bureau il y a dix
         secondes), c'est le sien qui est vrai, et le client doit voir celui-là
         sur son écran de confirmation. */
      const serverTotal = Number(res.total);
      const shownTotal = isFinite(serverTotal) && serverTotal > 0 ? serverTotal : totalNow;
      closeCart();
      if (orderMode === 'takeout') {
        orderNumber = 'OPD-' + String(res.number || '');
        $('#cashier-number-digits').textContent = orderNumber;
        $('#prep-number').textContent = orderNumber;
        $('#ready-number').textContent = orderNumber;
        $('#cashier-items').textContent = summary || '·';
        $('#cashier-total').textContent = `${money(shownTotal)}`;
        gotoScreen('screen-cashier');
      } else {
        // Table mode — one record per order, priced by the server
        const serverLines = Array.isArray(res.lines)
          ? res.lines.filter(l => l && l.kind !== 'formula-part') : [];
        const sameShape = serverLines.length === linesCopy.length
          && serverLines.every((l, i) => String(l.id) === String(linesCopy[i].id));
        const lines = linesCopy.map((l, i) => ({
          id: l.id, options: l.options, note: l.note || '', qty: l.qty,
          unitPrice: sameShape && isFinite(Number(serverLines[i].unitPrice))
            ? Number(serverLines[i].unitPrice) : l.unitPrice,
        }));
        if (!sentOrders.some(o => o.id === currentOrderId)) {   // a replayed send is the same order
          sentOrders.push({ id: currentOrderId, number: String(res.number || ''), status: 'pending',
                            total: shownTotal, lines });
        }
        rebuildSent();
        saveSent();
        $('#success-table').textContent = tableNumber;
        $('#success-items').textContent = summary || '·';
        gotoScreen('screen-success');
        watchTableOrder();
        if (globalThis.KiwiGuest) globalThis.KiwiGuest.onSent(lines, res);
      }
      cart.clear();
      refreshCartUI();
    }

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
    const SESSION = {
      id: '', mode: '', table: '', closed: false, closedBy: '',
      pendingSend: null,
      retiredSendRefs: new Set(),
      sendKey() { return 'kiwi-op-send:' + NET.slug; },
      sendScope() { return JSON.stringify([NET.slug, this.id, this.mode, String(this.table || '')]); },
      async prepareSend(lines) {
        const key = this.sendKey(), scope = this.sendScope(), payload = JSON.stringify(lines);
        const previous = this.pendingSend;
        let fingerprint = '';
        try {
          const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
          fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) { /* unavailable storage/crypto permits only an in-page retry */ }
        let ref = previous && previous.scope === scope && previous.payload === payload
          && !this.retiredSendRefs.has(key + ':' + previous.ref) ? previous.ref : '';
        if (!ref && fingerprint) {
          try {
            const saved = JSON.parse(localStorage.getItem(key) || 'null');
            if (saved && saved.v === 1 && saved.scope === scope && saved.fingerprint === fingerprint
                && /^r[A-Za-z0-9_-]{6,40}$/.test(saved.ref || '')
                && !this.retiredSendRefs.has(key + ':' + saved.ref)
                && localStorage.getItem(key + ':retired:' + saved.ref) !== '1') ref = saved.ref;
          } catch (_) {}
        }
        if (!ref) ref = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
        const attempt = { key, scope, payload, ref, durable: false };
        if (fingerprint) {
          try {
            const record = JSON.stringify({ v: 1, scope, fingerprint, ref });
            localStorage.setItem(key, record);
            attempt.durable = localStorage.getItem(key) === record;
          } catch (_) {}
        }
        this.pendingSend = attempt;
        return attempt;
      },
      clearPendingSend(attempt = this.pendingSend) {
        const key = attempt ? attempt.key : this.sendKey();
        let retireDurably = !!attempt;
        if (attempt) this.retiredSendRefs.add(key + ':' + attempt.ref);
        try {
          const saved = JSON.parse(localStorage.getItem(key) || 'null');
          if (saved && (attempt ? saved.ref === attempt.ref && saved.scope === attempt.scope
              : saved.scope === this.sendScope())) {
            // Tombstone first: if removeItem fails, a successful write still
            // prevents an acknowledged ref from being restored after navigation.
            try { localStorage.setItem(key, 'null'); } catch (_) {}
            localStorage.removeItem(key);
          }
          retireDurably = false;
        } catch (_) {}
        // If the shared slot cannot be read, do not overwrite a potentially
        // newer attempt. Retire ONLY the captured ref in its own small marker;
        // navigation can then reject the stale record once reads recover.
        if (retireDurably) {
          try { localStorage.setItem(key + ':retired:' + attempt.ref, '1'); } catch (_) {}
        }
        if (!attempt || this.pendingSend === attempt) this.pendingSend = null;
      },
      _key() { return 'kiwi-op-ses:' + NET.slug; },
      _read() {
        try { return JSON.parse(localStorage.getItem(this._key()) || 'null') || null; }
        catch (_) { return null; }
      },
      _write(v) {
        try {
          if (v) localStorage.setItem(this._key(), JSON.stringify(v));
          else localStorage.removeItem(this._key());
        } catch (_) {}
      },
      /* Une addition réglée à l'instant, sur CETTE table. */
      recentlySettled(mode, table, allowReorder = false) {
        if (allowReorder) return false;
        if (cart && cart.size > 0) return false;
        // A counter tag starts a new takeaway purchase each time it is tapped.
        // Keeping its previous closed session here made the promised NFC retry
        // reopen the thank-you screen for 30 minutes instead of the menu.
        if (mode === 'takeout') return false;
        const s = this._read();
        if (!s || !s.closedAt) return false;
        // Seule une vraie addition encaissée en caisse (settle) empêche la réouverture immédiate.
        // Une table annulée sans encaissement ou expirée ne doit pas bloquer le client.
        if (s.closedBy && s.closedBy !== 'settle') return false;
        if (s.hadOrder === false) return false;
        if (s.mode !== mode || String(s.table || '') !== String(table || '')) return false;
        return (Date.now() - s.closedAt) < 30 * 60 * 1000;
      },
      async open(mode, table) {
        if (this.id && this.mode === mode && String(this.table) === String(table || '')) return true;
        const res = await NET.openSession(mode, table);
        if (!res || !res.ok) {
          /* On n'invente rien : « le service n'est pas ouvert » est une réponse
             vraie et utile, et bien meilleure qu'une carte qu'on laisse
             parcourir avant de refuser la commande à la fin.
             Le refus peut tomber depuis le pavé numérique aussi bien qu'au
             démarrage : il faut donc REVENIR sur l'écran d'accueil, sinon le
             message s'écrirait dans un écran que personne ne regarde. */
          const err = res && res.error;
          if (err === 'service-closed' || err === 'orderpro-off') {
            gotoScreen('screen-boot');
            bootState(err === 'service-closed' ? 'closed' : 'off',
              { icon: err === 'service-closed' ? 'moon' : 'power-off' });
          } else {
            showToast(t('order_offline'));
          }
          return false;
        }
        this.id = res.session; this.mode = res.mode; this.table = res.table || '';
        this.closed = false; this.closedBy = '';
        this._write({ id: this.id, mode: this.mode, table: this.table });
        if (this.mode === 'table') loadSent(this.id);
        LIVE.start();
        return true;
      },
      markClosed(why) {
        if (this.closed) return;
        this.clearPendingSend();
        this.closed = true; this.closedBy = why || '';
        this._write({ closedBy: this.closedBy, id: this.id, mode: this.mode, table: this.table, closedAt: Date.now(), hadOrder: !!currentOrderId || (Array.isArray(sentLines) && sentLines.length > 0) });
        clearSent();
        onSessionClosed();
      },
    };

    /* Le service est fini pour ce téléphone : plus de carte, plus de panier,
       plus de commande. On ne se contente pas de masquer le bouton — le panier
       est vidé et la boucle s'arrête, pour qu'aucun écran resté ouvert derrière
       ne puisse encore envoyer quoi que ce soit. */
    function onSessionClosed() {
      LIVE.stop();
      const sendButton = $('#send-btn');
      if (sendButton && sendButton.orderProLoadingOwner?.scope === SESSION.sendScope()) {
        sendButton.classList.remove('is-loading');
        delete sendButton.orderProLoadingOwner;
      }
      pendingRef = '';
      cart.clear();
      refreshCartUI();
      const sub = $('#thanks-sub');
      if (sub) {
        sub.textContent = SESSION.closedBy === 'expiry' ? t('thanks_expired') : t('thanks_sub');
      }
      if (globalThis.KiwiGuest) globalThis.KiwiGuest.onClosed();
      gotoScreen('screen-thanks');
    }

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
    const LIVE = (() => {
      const FAST = 4000;      // une commande est en jeu
      const SLOW = 15000;     // simplement assis, la carte ouverte
      let timer = null, running = false;

      const busy = () => (!!currentOrderId && !ORDER_DONE.has(lastStatus))
        || sentOrders.some(o => !ORDER_DONE.has(o.status));

      async function tick() {
        if (!running || document.hidden) return;

        if (SESSION.id && !SESSION.closed) {
          const s = await NET.sessionStatus(SESSION.id);
          // Injoignable ⇒ on ne conclut RIEN. Déclarer la session fermée sur un
          // réseau qui tousse mettrait le client dehors au milieu du repas.
          if (s && s.ok && s.status !== 'open') {
            // Settlement ends the shared visit for EVERY phone, including
            // phones with a draft. Only the explicit reorder action may reseat.
            SESSION.markClosed(s.closedBy);
            return;
          }
        }

        /* Toutes les commandes encore en jeu, pas seulement la dernière : un
           refus de la première doit arriver même après une deuxième commande. */
        const watched = new Set(sentOrders.filter(o => !ORDER_DONE.has(o.status)).map(o => o.id));
        if (currentOrderId) watched.add(currentOrderId);
        for (const id of watched) {
          const r = await NET.orderStatus(id);
          if (r && r.ok) onOrderStatus(id, String(r.status || 'pending'));
        }
        schedule();
      }

      function schedule() {
        clearTimeout(timer);
        if (!running || document.hidden) return;
        timer = setTimeout(tick, busy() ? FAST : SLOW);
      }
      function start() { running = true; clearTimeout(timer); tick(); }
      function stop() { running = false; clearTimeout(timer); }
      function kick() { if (running) { clearTimeout(timer); tick(); } }

      document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
      window.addEventListener('online', kick);
      window.addEventListener('pageshow', kick);

      return { start, stop, kick };
    })();

    /* L'état de la commande, appliqué à l'écran qui est devant les yeux du
       client. Une seule fonction pour les deux parcours : la table et le
       comptoir affichent la même vérité, avec des mots différents. */
    let lastStatus = '';
    function onOrderStatus(id, status) {
      const o = sentOrders.find(x => x.id === id);
      if (o && o.status !== status) {
        o.status = status;
        rebuildSent();
        saveSent();
        if ($('#bill-sheet').classList.contains('is-open')) { renderBill(); setTipPercent(tipPercent); }
        /* La commande à l'écran a son propre message (applyOrderStatus) ; une
           commande précédente refusée doit être dite, avec son numéro. */
        if (status === 'rejected' && id !== currentOrderId) {
          showToast(t('order_refused_n').replace('{n}', o.number || '?'));
        }
      }
      if (id === currentOrderId) applyOrderStatus(status);
    }
    function applyOrderStatus(status) {
      if (status === lastStatus) return;
      lastStatus = status;

      // Salle — l'écran « c'est parti »
      const em = $('.success-eta em');
      if (em) {
        em.removeAttribute('data-i18n');
        em.textContent = status === 'pending' ? t('prep_waiting')
                       : status === 'ready' ? t('prep_ready')
                       : status === 'served' ? t('order_served')
                       : status === 'rejected' ? t('order_refused')
                       : t('prep_accepted');
      }
      /* « Envoyée en cuisine » n'est vrai qu'une fois la caisse d'accord :
         avant, la commande attend au comptoir. */
      const titleEm = $('.success-title em');
      if (titleEm) {
        titleEm.removeAttribute('data-i18n');
        titleEm.textContent = status === 'pending' || status === 'rejected'
          ? t('success_title_em') : t('success_title_em_kitchen');
      }

      // Comptoir — la barre de préparation
      const bar = $('#prep-bar-fill');
      const eta = $('#prep-eta');
      if (bar) bar.style.width = (PREP_STAGE[status] || PREP_STAGE.pending) + '%';
      if (eta) {
        eta.textContent = status === 'ready' ? t('prep_now')
                        : status === 'accepted' ? t('prep_accepted')
                        : t('prep_waiting');
      }

      if (status === 'rejected') { showToast(t('order_refused')); currentOrderId = ''; return; }
      if (status === 'archived' && orderMode === 'takeout') {
        showToast(t('order_archived'));
        currentOrderId = '';
        SESSION.markClosed('archived');
        return;
      }

      /* À emporter : c'est L'ENCAISSEMENT au comptoir qui fait avancer l'écran,
         pas un bouton que le client devrait penser à taper. Il annonce son
         numéro, il paie, et son téléphone passe tout seul en préparation —
         personne ne surveille un écran en attendant qu'on lui dise de cliquer.
         (Le bouton reste, comme repli, si le client a déjà avancé lui-même.) */
      if (status === 'accepted' && orderMode === 'takeout'
          && $('#screen-cashier').classList.contains('is-active')) {
        /* On ne rappelle PAS startPreparing() ici : cette fonction relance la
           boucle, et nous sommes précisément à l'intérieur d'un de ses tours —
           elle se rappellerait elle-même. L'écran suffit ; la barre a déjà été
           positionnée quelques lignes plus haut. */
        const etaLabel = $('[data-i18n="prep_ready_in"]');
        if (etaLabel) etaLabel.textContent = '';
        gotoScreen('screen-preparing');
        refreshPermBanner();
        return;
      }
      if (status === 'ready' && orderMode === 'takeout') triggerReady();
      /* Remise en main propre : pour un retrait au comptoir c'est le point
         final — il n'y a pas d'addition à encaisser plus tard qui viendrait
         fermer la session à sa place. */
      if (status === 'served' && orderMode === 'takeout') SESSION.markClosed('served');
    }

    function watchTableOrder() {
      const em = $('.success-eta em');
      if (em) { em.removeAttribute('data-i18n'); em.textContent = t('prep_waiting'); }
      const titleEm = $('.success-title em');
      if (titleEm) { titleEm.removeAttribute('data-i18n'); titleEm.textContent = t('success_title_em'); }
      lastStatus = '';
      LIVE.start();
      LIVE.kick();
    }

    /* La carte a bougé pendant que le client composait. Plutôt que de laisser
       le plat dans le panier — où il ferait échouer chaque nouvelle tentative
       à l'identique — on le retire et on le barre sur le fil, à sa place, dans
       sa tuile. Le fil ne se réordonne pas sous les doigts : c'est la même
       carte, avec un plat en moins de disponible. */
    function dropUnavailable(ids, names) {
      const byId = new Set((ids || []).map(String));
      const byName = new Set((names || []).map(n => String(n).toLowerCase()));
      let hit = false;
      for (const m of MENU) {
        const gone = byId.has(m.id) || byName.has(String(m.name || '').toLowerCase());
        if (gone) { m.avail = false; hit = true; }
      }
      for (const [key, line] of [...cart.entries()]) {
        const m = itemOf(line.id);
        if (m && m.avail === false) { cart.delete(key); hit = true; }
      }
      if (!hit) return;
      refreshCartUI();
      renderMenu(activeMenuFilter());
    }

    /* ============ restart (back to menu after order sent) ============ */
    function restartMenu() {
      cart.clear();
      refreshCartUI();
      $$('.menu-tab').forEach(t => { t.classList.toggle('is-active', t.dataset.tab === 'all'); t.setAttribute('aria-selected', String(t.dataset.tab === 'all')); });
      renderMenuSubtabs('all');
      renderMenu('all');
      gotoScreen('screen-menu');
    }

    /* ============ mode choice → next screen ============ */
    async function chooseMode(mode) {
      orderMode = mode;
      if (mode === 'table') {
        tableNumber = '';
        renderTableDisplay();
        updateContinueState();
        gotoScreen('screen-table');
      } else {
        // Un retrait au comptoir s'assoit lui aussi : c'est la session qui
        // porte la révocation quand la commande est remise au client.
        if (!(await seatHere('takeout', ''))) return;
        gotoScreen('screen-menu');
        applyMenuMode();
      }
    }

    /* S'asseoir. Le seul chemin par lequel une session s'ouvre, pour que les
       trois entrées (tag de table, tag de comptoir, choix à la main) passent
       par les mêmes refus et les mêmes messages. */
    async function seatHere(mode, table, allowReorder = false) {
      if (SESSION.recentlySettled(mode, table, allowReorder)) {
        // L'addition vient d'être réglée sur ce téléphone : recharger la page
        // ne rouvre pas le robinet. Le tag de la table servira au client
        // suivant, qui n'a pas ce souvenir dans le sien.
        SESSION.closed = true;
        SESSION.closedBy = 'settle';
        onSessionClosed();
        return false;
      }
      return SESSION.open(mode, table);
    }

    function applyMenuMode() {
      const badge = $('#menu-badge');
      const subtitle = $('#cart-subtitle');
      const note = $('#cart-note');
      const sendLabel = $('#send-label');
      const serviceBar = $('#service-bar');
      if (orderMode === 'takeout') {
        badge.innerHTML = `<i data-lucide="shopping-bag"></i><span id="menu-badge-text">${t('badge_takeout')}</span>`;
        subtitle.textContent = t('cart_subtitle_takeout');
        note.innerHTML = t('cart_note_takeout_html');
        sendLabel.textContent = t('send_takeout');
        serviceBar.classList.add('is-takeout');
        serviceBar.hidden = false;
      } else {
        badge.innerHTML = `<i data-lucide="utensils"></i><span id="menu-badge-text">${t('badge_table')} ${tableNumber}</span>`;
        subtitle.textContent = t('cart_subtitle_table').replace('{n}', tableNumber || '—');
        note.textContent = t('cart_note_table');
        sendLabel.textContent = t('send_table');
        serviceBar.classList.remove('is-takeout');
        serviceBar.hidden = false;
      }
      if (window.lucide) window.lucide.createIcons();
    }

    /* The guest page lands after a table is seated; its module may still be on
       its way (it loads after the first screen), so wait for it as land()
       waits for its data, never longer than 2.5 s. */
    let guestReady = null;
    async function guestLand(pending) {
      const wait = pending || guestReady;
      if (wait) { try { await Promise.race([wait, new Promise(r => setTimeout(r, 2500))]); } catch (_) {} }
      return !!(globalThis.KiwiGuest && await globalThis.KiwiGuest.land(pending));
    }

    /* ============ continue from table-entry to menu ============ */
    async function commitTable() {
      if (!tableNumber) return;
      if (!(await seatHere('table', tableNumber))) return;
      applyMenuMode();
      if (!(await guestLand())) gotoScreen('screen-menu');
    }

    /* ============ takeout: cashier → preparing ============ */
    function confirmCashierPayment() {
      gotoScreen('screen-preparing');
      refreshPermBanner();
      startPreparing();
    }

    /* ============ takeout: live status from the caisse ============
       The bar is not a countdown — it tracks the ticket's REAL state, polled
       from the store over WiFi: queued at the till → accepted into the kitchen
       → ready. Staff acceptance is what moves it, exactly as decided. If the
       poll can't reach the store we hold the last known state and keep trying
       rather than declaring an order ready that isn't. */
    const PREP_STAGE = { pending: 18, accepted: 62, ready: 100, served: 100 };
    function startPreparing() {
      const bar = $('#prep-bar-fill');
      const eta = $('#prep-eta');
      const etaLabel = $('[data-i18n="prep_ready_in"]');
      if (etaLabel) etaLabel.textContent = '';
      if (bar) bar.style.width = PREP_STAGE.pending + '%';
      if (eta) eta.textContent = t('prep_waiting');
      /* Le suivi lui-même est tenu par LIVE : une seule boucle pour la commande
         ET la session, qui se met en veille avec l'écran et repart au réveil.
         Deux minuteries séparées finissaient par se contredire — l'une arrêtée,
         l'autre non — et c'est la commande à emporter qui restait figée. */
      lastStatus = '';
      LIVE.start();
      LIVE.kick();
    }

    /* ============ takeout: ready (chime + system notif) ============ */
    function triggerReady() {
      gotoScreen('screen-ready');
      // Audio chime — works on every modern browser.
      playChime();
      // System notification — only fires if the user previously granted permission.
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(t('notif_ready_title'), {
            body: `${t('notif_ready_body_pre')}${orderNumber} ${t('notif_ready_body_post')}`,
            tag: 'order-ready',
          });
        } catch (_) { /* iOS Safari throws unless installed as PWA */ }
      }
    }

    /* ============ Web Audio chime (two-note, no asset needed) ============ */
    function playChime() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const tone = (freq, startSec, durSec, peak) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const t0 = ctx.currentTime + startSec;
          gain.gain.setValueAtTime(0, t0);
          gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0008, t0 + durSec);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + durSec + 0.05);
        };
        tone(740, 0.00, 0.45, 0.35); // F#5
        tone(988, 0.18, 0.55, 0.35); // B5
      } catch (_) { /* audio unavailable */ }
    }

    /* ============ Notification permission flow ============ */
    function refreshPermBanner() {
      const banner = $('#prep-perm');
      const body = $('#prep-perm-body');
      const btn = $('#prep-perm-btn');
      if (!banner || !('Notification' in window)) {
        if (banner) {
          banner.classList.add('is-denied');
          body.textContent = t('prep_perm_unsupported');
          btn.style.display = 'none';
        }
        return;
      }
      const p = Notification.permission;
      banner.classList.remove('is-granted', 'is-denied');
      if (p === 'granted') {
        banner.classList.add('is-granted');
        body.innerHTML = t('prep_perm_granted_html');
        btn.style.display = 'none';
      } else if (p === 'denied') {
        banner.classList.add('is-denied');
        body.textContent = t('prep_perm_denied');
        btn.style.display = 'none';
      } else {
        body.textContent = t('prep_perm_default');
        btn.style.display = '';
        btn.textContent = t('prep_perm_btn');
      }
    }

    async function askNotificationPermission() {
      if (!('Notification' in window)) return;
      try {
        const result = await Notification.requestPermission();
        // Some browsers don't return a value from the promise; re-read the global.
        if (result === 'granted' || Notification.permission === 'granted') {
          // Show a tiny confirmation chime so the user knows it works
          playChime();
        }
      } catch (_) {}
      refreshPermBanner();
    }

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
    let availabilitySignature = '';
    function availabilityOf(data) {
      return ((Array.isArray(data && data.items) ? data.items : []).concat(Array.isArray(data && data.formulaItems) ? data.formulaItems : []))
        .map((it) => String(it && it.id || '') + ':' + (it && it.avail === false ? '0' : '1')).sort().join('|');
    }
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
    function bootRestaurant(data) {
      const cats = Array.isArray(data.cats) ? data.cats : [];
      const allItems = (Array.isArray(data.items) ? data.items : []).concat(Array.isArray(data.formulaItems) ? data.formulaItems : []);
      availabilitySignature = availabilityOf(data);
      const items = allItems.filter(i => i && i.avail !== false && !i.formulaOnly && !i.archived);
      MENU_ALL.clear();
      MENU.length = 0;
      if (!items.length) return false;
      allItems.forEach((it) => { if (it && it.id) MENU_ALL.set(String(it.id), it); });

      const groups = new Map();
      (Array.isArray(data.opts) ? data.opts : []).forEach(g => {
        if (!g || !g.id || !Array.isArray(g.choices) || !g.choices.length) return;
        const key = String(g.id);
        const mapped = {
          key,
          label: String(g.name || ''),
          type: g.kind === 'many' ? 'multi' : 'single',
          default: '',
          required: !!g.required,
          _src: g,
          choices: g.choices.filter(c => c && c.id && c.name).map(c => ({
            id: String(c.id), label: String(c.name), emoji: String(c.emoji || ''), delta: Math.max(0, Number(c.price) || 0),
            _src: c,
          })),
        };
        OPT[key] = mapped;
        groups.set(key, mapped);
      });

      /* Every language this store publishes, not only the three. */
      const langs = globalThis.KiwiOrderMenu ? KiwiOrderMenu.langs() : ['fr', 'en', 'ar'];
      const names = {}, byLang = {};
      langs.forEach(l => { byLang[l] = {}; });
      const allToTranslate = (Array.isArray(allItems) && allItems.length) ? allItems : items;
      for (const it of allToTranslate) {
        if (!it || !it.id) continue;
        names[String(it.id)] = { name: String(it.name || ''), desc: String(it.desc || '') };
        langs.forEach((l) => {
          const x = menuTr(it, l);
          if (x) byLang[l][String(it.id)] = { name: String(x.name), desc: x.desc != null ? String(x.desc) : String(it.desc || '') };
        });
      }

      for (const it of items) {
        const formulaOptions = it.formula && Array.isArray(it.formula.slots) ? it.formula.slots.map(s => {
          const g = { key: 'formula_' + String(it.id) + '_' + String(s.id), formulaSlotId: String(s.id), label: String(s.label || ''), type: (+s.max || 1) > 1 ? 'multi' : 'single', default: '', required: (+s.min || 0) > 0, min: Math.max(0, +s.min || 0), max: Math.max(1, +s.max || 1), _src: s,
            choices: (Array.isArray(s.choices) ? s.choices : []).map(c => { const target=allItems.find(x=>String(x.id)===String(c.itemId) && !x.archived && x.avail !== false); return target ? {id:String(c.itemId),label:String(target.name),emoji:'',delta:Math.max(0,Number(c.extra)||0),photo:target.showPhotoInFormulas === true ? String(target.photo || '') : '', targetItem: target, _src: target} : null; }).filter(Boolean) };
          OPT[g.key] = g;
          if (!OPT['formula_' + String(s.id)]) OPT['formula_' + String(s.id)] = g;
          return g;
        }).filter(g=>g.choices.length) : [];
        const formulaBroken = it.formula && Array.isArray(it.formula.slots)
          && it.formula.slots.some((slot) => {
            const mapped = formulaOptions.find((opt) => opt.formulaSlotId === String(slot.id));
            return !mapped || mapped.choices.length < Math.max(0, Number(slot.min) || 0);
          });
        if (formulaBroken) continue;
        MENU.push({
          id: String(it.id),
          cat: String(it.catId || ''),
          subId: String(it.subId || ''),
          name: String(it.name || ''),
          desc: String(it.desc || ''),
          price: Math.max(0, toCents(it.price) / 100),
          icon: it.icon || 'utensils',
          photo: it.photo || '',
          video: it.video || '',
          tag: it.tag || '',
          avail: it.avail !== false,
          /* Publiés seulement quand la fiche est complète (functions/api/menu.js) :
             null = « on ne sait pas », jamais « sans allergène ». */
          allergens: Array.isArray(it.allergens) ? it.allergens.slice() : null,
          options: (Array.isArray(it.opts) ? it.opts : []).map(id => groups.get(String(id))).filter(Boolean).concat(formulaOptions),
          formula: formulaOptions.length > 0,
          nutrition: it.nutritionComplete === true && it.nutrition ? { ...it.nutrition } : null,
          allergens: it.nutritionComplete === true && Array.isArray(it.allergens) ? it.allergens.slice() : [],
        });
      }
      // Le patron écrit sa carte une fois ; ses traductions (tableau de bord →
      // Traductions) voyagent avec elle. Une langue non traduite retombe sur
      // son texte (itemI18n → MENU_I18N.fr).
      Object.keys(MENU_I18N).forEach(l => { delete MENU_I18N[l]; });
      langs.forEach(l => { MENU_I18N[l] = byLang[l]; });
      MENU_I18N.fr = Object.assign({}, names, byLang.fr || {});

      /* Les onglets sont ceux du patron, et rien d'autre. L'onglet « Top »
         a été retiré : il ne montrait que les plats filmés, ce qui coupait la
         carte en deux et laissait croire que le reste n'était pas commandable.
         Depuis que chaque plat occupe la même tuile, tout le fil EST le fil
         vidéo — un onglet pour le redire n'aurait plus rien à filtrer. */
      const used = new Set(MENU.map(m => m.cat));
      const tabs = $('.menu-tabs');
      const parts = [];
      MENU_SUBTABS.clear();
      parts.push(`<button class="menu-tab is-active" role="tab" aria-selected="true" data-tab="all" data-i18n="tab_all">${escapeHtml(t('tab_all'))}</button>`);
      for (const c of cats) {
        if (!used.has(String(c.id))) continue;        // empty category → no tab
        parts.push(`<button class="menu-tab" role="tab" aria-selected="false" data-tab="${escapeHtml(String(c.id))}">${escapeHtml(String((menuTr(c, currentLang) || c).name || ''))}</button>`);
        const subtabs = (Array.isArray(c.sub) ? c.sub : []).filter(s =>
          MENU.some(m => m.cat === String(c.id) && m.subId === String(s.id)));
        if (subtabs.length) MENU_SUBTABS.set(String(c.id), subtabs);
      }
      tabs.innerHTML = parts.join('');
      renderMenuSubtabs('all');
      renderMenu('all');
      return true;
    }

    /* The boutique vertical (product list, barcode lookup) lives in
       assets/orderpro-boutique.js, loaded for a boutique only: a restaurant
       never runs it, and its guests do not download it (§19, 60 KB). */

    /* ============ wire it up ============ */
    document.addEventListener('DOMContentLoaded', () => {
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
