/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ORDER PRO, LA PAGE D'ACCUEIL DU CLIENT (assets/orderpro-guest.js)
 * ---------------------------------------------------------------------------
 * Ce que le téléphone du client trouve autour de la carte, une fois assis :
 *   · un écran d'accueil : la carte, le Wi-Fi, un avis, les jeux, les réseaux ;
 *   · l'état de sa table, toujours sous les yeux (« Table 5 · 26 MAD ·
 *     addition ouverte ») ;
 *   · des demandes précises (l'eau, le pain, les serviettes, débarrasser) ;
 *   · « avec ça ? » : le plat que les tickets associent à celui qu'il ajoute ;
 *   · « même tournée » et l'addition envoyée sur WhatsApp ;
 *   · le vrai temps de préparation, mesuré par la cuisine ;
 *   · des filtres « sans gluten, sans lait… » tirés des fiches du restaurant ;
 *   · en Ramadan, l'heure du ftour et « servir au ftour » ;
 *   · des quiz notés par le serveur, un Memory des plats de la maison, un
 *     Sudoku, et le classement du mois.
 *
 * Chargé APRÈS le script de OrderPro.html, dont il lit les fonctions et
 * l'état (t, money, cart, MENU, SESSION, NET, sentOrders…). OrderPro.html ne
 * l'appelle que par des crochets gardés (`globalThis.KiwiGuest && …`) : sans
 * ce fichier, la page reste exactement celle d'avant.
 *
 * Tout ce qui vient du serveur est échappé avant d'entrer dans la page. Le
 * serveur (functions/api/order/guest.js, game.js) ne livre jamais la bonne
 * réponse d'un quiz avant la fin de la partie.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Textes · français, anglais, arabe ─────────────────────────────────── */
  const STRINGS = {
    fr: {
      gx_menu: 'Voir la carte', gx_menu_sub: 'Commandez depuis votre table',
      gx_wifi: 'Wi-Fi', gx_wifi_sub: 'Le mot de passe en un geste',
      gx_review: 'Laisser un avis', gx_review_sub: 'Dites-nous comment c’était',
      gx_games: 'Jouer en attendant', gx_games_sub: 'Quiz, Memory, Sudoku',
      gx_requests: 'Demander', gx_requests_sub: 'L’eau, le pain, les serviettes',
      gx_follow: 'Suivez-nous', gx_home: 'Accueil',
      gx_round_live: 'Partie de la salle en cours', gx_live: 'En direct',
      gx_wifi_title: 'Wi-Fi des clients', gx_wifi_network: 'Réseau', gx_wifi_password: 'Mot de passe',
      gx_wifi_copy: 'Copier le mot de passe', gx_wifi_copied: 'Mot de passe copié', gx_wifi_none: 'Sans mot de passe',
      gx_wifi_hint: 'Ouvrez les réglages Wi-Fi, choisissez le réseau et collez le mot de passe.',
      gx_status_table: 'Table', gx_status_open: 'Addition ouverte', gx_status_asked: 'Addition demandée',
      gx_req_title: 'Que vous faut-il ?', gx_req_sub: 'L’équipe arrive avec, en un seul passage.',
      gx_req_water: 'De l’eau', gx_req_bread: 'Du pain', gx_req_napkins: 'Des serviettes', gx_req_clear: 'Débarrasser',
      gx_req_call: 'Appeler l’équipe', gx_req_sent: 'C’est noté, l’équipe arrive à la table',
      gx_pair_title: 'Souvent pris avec', gx_pair_add: 'Ajouter',
      gx_wait_usual: 'D’habitude prête en {n} min',
      gx_reorder: 'Même tournée', gx_reorder_done_1: 'Un article remis dans votre panier', gx_reorder_done: '{n} articles remis dans votre panier', gx_reorder_none: 'Ces plats ne sont plus disponibles',
      gx_wa: 'Recevoir sur WhatsApp', gx_wa_subtotal: 'Sous-total', gx_wa_scope: 'Commandes envoyées depuis ce téléphone.',
      gx_diet: 'Régime', gx_diet_gluten: 'Sans gluten', gx_diet_lait: 'Sans lait', gx_diet_nuts: 'Sans fruits à coque',
      gx_diet_oeufs: 'Sans œufs', gx_diet_sea: 'Sans poisson ni fruits de mer', gx_diet_sesame: 'Sans sésame',
      gx_diet_hidden_1: 'Un plat sans fiche est masqué', gx_diet_hidden: '{n} plats sans fiche sont masqués',
      gx_diet_note: 'Selon les fiches du restaurant. En cas d’allergie grave, demandez à l’équipe.',
      gx_ftour_at: 'Ftour à {t}', gx_ftour_in: 'dans {d}', gx_ftour_now: 'C’est l’heure du ftour, saha ftourkoum',
      gx_ftour_toggle: 'Servir au ftour ({t})', gx_ftour_toggle_sub: 'La cuisine prépare pour l’heure du ftour.',
      gx_ftour_late: 'Le ftour est trop proche : la commande part tout de suite',
      gx_games_title: 'Jeux', gx_games_lead: 'Pendant que la cuisine s’active',
      gx_quiz: 'Quiz', gx_quiz_sub: 'Seul, contre votre table ou toute la salle',
      gx_memory: 'Memory', gx_memory_sub: 'Retrouvez les paires de la carte',
      gx_sudoku: 'Sudoku', gx_sudoku_sub: 'Facile, moyen ou difficile',
      gx_board: 'Classement du mois', gx_board_empty: 'Personne encore ce mois-ci. À vous !',
      gx_back: 'Retour', gx_house: 'De la maison', gx_questions: '{n} questions',
      gx_nick: 'Votre pseudo', gx_nick_hint: '2 à 14 lettres ou chiffres. Il s’affiche au classement.',
      gx_solo: 'Jouer seul', gx_table: 'Défier ma table', gx_room: 'Rejoindre la partie de la salle',
      gx_q_of: 'Question {i} sur {n}', gx_score: 'Bonnes réponses : {c} sur {n}', gx_points: '{p} points', gx_best_quiz: 'Votre meilleur score : {p} points',
      gx_recap: 'Les bonnes réponses', gx_your_table: 'Votre table', gx_the_room: 'La salle', gx_again: 'Rejouer',
      gx_bad_nick: 'Ce pseudo n’est pas accepté', gx_closed: 'Les jeux reprennent à votre prochaine visite',
      gx_full: 'Huit joueurs au plus par table', gx_ends_in: 'se termine dans {d}', gx_failed: 'Partie non enregistrée, réessayez',
      gx_moves: '{n} coups', gx_mem_done: 'Bravo, en {n} coups', gx_best: 'Record : {n}',
      gx_easy: 'Facile', gx_medium: 'Moyen', gx_hard: 'Difficile', gx_new_grid: 'Nouvelle grille',
      gx_grid_done: 'Grille terminée', gx_erase: 'Effacer',
      gx_min: '{m} min', gx_hmin: '{h} h {m}',
    },
    en: {
      gx_menu: 'View the menu', gx_menu_sub: 'Order from your table',
      gx_wifi: 'Wi-Fi', gx_wifi_sub: 'The password in one tap',
      gx_review: 'Leave a review', gx_review_sub: 'Tell us how it went',
      gx_games: 'Play while you wait', gx_games_sub: 'Quiz, Memory, Sudoku',
      gx_requests: 'Ask for', gx_requests_sub: 'Water, bread, napkins',
      gx_follow: 'Follow us', gx_home: 'Home',
      gx_round_live: 'Room game in progress', gx_live: 'Live',
      gx_wifi_title: 'Guest Wi-Fi', gx_wifi_network: 'Network', gx_wifi_password: 'Password',
      gx_wifi_copy: 'Copy password', gx_wifi_copied: 'Password copied', gx_wifi_none: 'No password',
      gx_wifi_hint: 'Open your Wi-Fi settings, pick the network and paste the password.',
      gx_status_table: 'Table', gx_status_open: 'Tab open', gx_status_asked: 'Bill requested',
      gx_req_title: 'What do you need?', gx_req_sub: 'The team brings it in one trip.',
      gx_req_water: 'Water', gx_req_bread: 'Bread', gx_req_napkins: 'Napkins', gx_req_clear: 'Clear the table',
      gx_req_call: 'Call the team', gx_req_sent: 'Got it, the team is coming to the table',
      gx_pair_title: 'Often ordered with', gx_pair_add: 'Add',
      gx_wait_usual: 'Usually ready in {n} min',
      gx_reorder: 'Same again', gx_reorder_done_1: 'One item back in your basket', gx_reorder_done: '{n} items back in your basket', gx_reorder_none: 'These dishes are no longer available',
      gx_wa: 'Send to WhatsApp', gx_wa_subtotal: 'Subtotal', gx_wa_scope: 'Orders sent from this phone.',
      gx_diet: 'Diet', gx_diet_gluten: 'Gluten-free', gx_diet_lait: 'Dairy-free', gx_diet_nuts: 'Nut-free',
      gx_diet_oeufs: 'Egg-free', gx_diet_sea: 'No fish or seafood', gx_diet_sesame: 'Sesame-free',
      gx_diet_hidden_1: 'One dish without allergen info is hidden', gx_diet_hidden: '{n} dishes without allergen info are hidden',
      gx_diet_note: 'Based on the restaurant’s records. For a severe allergy, ask the team.',
      gx_ftour_at: 'Iftar at {t}', gx_ftour_in: 'in {d}', gx_ftour_now: 'It’s iftar time, enjoy your meal',
      gx_ftour_toggle: 'Serve at iftar ({t})', gx_ftour_toggle_sub: 'The kitchen times it for iftar.',
      gx_ftour_late: 'Iftar is too close: your order goes out now',
      gx_games_title: 'Games', gx_games_lead: 'While the kitchen gets busy',
      gx_quiz: 'Quiz', gx_quiz_sub: 'Alone, against your table or the whole room',
      gx_memory: 'Memory', gx_memory_sub: 'Match the pairs from the menu',
      gx_sudoku: 'Sudoku', gx_sudoku_sub: 'Easy, medium or hard',
      gx_board: 'This month’s leaderboard', gx_board_empty: 'Nobody yet this month. Your turn!',
      gx_back: 'Back', gx_house: 'From the house', gx_questions: '{n} questions',
      gx_nick: 'Your nickname', gx_nick_hint: '2 to 14 letters or digits. It shows on the leaderboard.',
      gx_solo: 'Play alone', gx_table: 'Challenge my table', gx_room: 'Join the room game',
      gx_q_of: 'Question {i} of {n}', gx_score: '{c} correct out of {n}', gx_points: '{p} points', gx_best_quiz: 'Your best score: {p} points',
      gx_recap: 'The right answers', gx_your_table: 'Your table', gx_the_room: 'The room', gx_again: 'Play again',
      gx_bad_nick: 'That nickname isn’t allowed', gx_closed: 'Games resume on your next visit',
      gx_full: 'Eight players per table at most', gx_ends_in: 'ends in {d}', gx_failed: 'Game not saved, try again',
      gx_moves: '{n} moves', gx_mem_done: 'Well done, in {n} moves', gx_best: 'Best: {n}',
      gx_easy: 'Easy', gx_medium: 'Medium', gx_hard: 'Hard', gx_new_grid: 'New grid',
      gx_grid_done: 'Grid complete', gx_erase: 'Erase',
      gx_min: '{m} min', gx_hmin: '{h} h {m} min',
    },
    ar: {
      gx_menu: 'عرض القائمة', gx_menu_sub: 'اطلب من طاولتك',
      gx_wifi: 'الواي فاي', gx_wifi_sub: 'كلمة المرور بلمسة واحدة',
      gx_review: 'اترك تقييمًا', gx_review_sub: 'أخبرنا كيف كانت تجربتك',
      gx_games: 'العب أثناء الانتظار', gx_games_sub: 'ألغاز، ذاكرة، سودوكو',
      gx_requests: 'اطلب', gx_requests_sub: 'الماء، الخبز، المناديل',
      gx_follow: 'تابعونا', gx_home: 'الرئيسية',
      gx_round_live: 'لعبة القاعة جارية', gx_live: 'مباشر',
      gx_wifi_title: 'واي فاي الزبائن', gx_wifi_network: 'الشبكة', gx_wifi_password: 'كلمة المرور',
      gx_wifi_copy: 'نسخ كلمة المرور', gx_wifi_copied: 'تم نسخ كلمة المرور', gx_wifi_none: 'بدون كلمة مرور',
      gx_wifi_hint: 'افتح إعدادات الواي فاي، اختر الشبكة ثم الصق كلمة المرور.',
      gx_status_table: 'طاولة', gx_status_open: 'الحساب مفتوح', gx_status_asked: 'تم طلب الحساب',
      gx_req_title: 'ماذا تحتاج؟', gx_req_sub: 'يحضره الفريق في مرة واحدة.',
      gx_req_water: 'ماء', gx_req_bread: 'خبز', gx_req_napkins: 'مناديل', gx_req_clear: 'رفع الأطباق',
      gx_req_call: 'نادِ الفريق', gx_req_sent: 'تم، الفريق في الطريق إلى الطاولة',
      gx_pair_title: 'غالبًا ما يُطلب مع', gx_pair_add: 'أضف',
      gx_wait_usual: 'تكون جاهزة عادةً خلال {n} دقيقة',
      gx_reorder: 'نفس الطلب', gx_reorder_done_1: 'أُعيد عنصر واحد إلى سلتك', gx_reorder_done: 'أُعيدت {n} عناصر إلى سلتك', gx_reorder_none: 'هذه الأطباق لم تعد متوفرة',
      gx_wa: 'أرسل إلى واتساب', gx_wa_subtotal: 'المجموع الفرعي', gx_wa_scope: 'الطلبات المرسلة من هذا الهاتف.',
      gx_diet: 'النظام الغذائي', gx_diet_gluten: 'بدون غلوتين', gx_diet_lait: 'بدون حليب', gx_diet_nuts: 'بدون مكسرات',
      gx_diet_oeufs: 'بدون بيض', gx_diet_sea: 'بدون سمك أو مأكولات بحرية', gx_diet_sesame: 'بدون سمسم',
      gx_diet_hidden_1: 'تم إخفاء طبق واحد بدون معلومات', gx_diet_hidden: 'تم إخفاء {n} أطباق بدون معلومات',
      gx_diet_note: 'حسب بيانات المطعم. في حالة حساسية شديدة، اسأل الفريق.',
      gx_ftour_at: 'الإفطار على {t}', gx_ftour_in: 'بعد {d}', gx_ftour_now: 'حان وقت الإفطار، صحة فطوركم',
      gx_ftour_toggle: 'التقديم عند الإفطار ({t})', gx_ftour_toggle_sub: 'يحضّر المطبخ الطلب لوقت الإفطار.',
      gx_ftour_late: 'اقترب الإفطار كثيرًا: يُرسل الطلب الآن',
      gx_games_title: 'ألعاب', gx_games_lead: 'بينما ينشغل المطبخ',
      gx_quiz: 'مسابقة', gx_quiz_sub: 'وحدك، ضد طاولتك أو ضد القاعة كلها',
      gx_memory: 'لعبة الذاكرة', gx_memory_sub: 'اعثر على أزواج أطباق القائمة',
      gx_sudoku: 'سودوكو', gx_sudoku_sub: 'سهل، متوسط أو صعب',
      gx_board: 'ترتيب هذا الشهر', gx_board_empty: 'لا أحد بعد هذا الشهر. دورك!',
      gx_back: 'رجوع', gx_house: 'من إعداد المطعم', gx_questions: '{n} أسئلة',
      gx_nick: 'اسمك المستعار', gx_nick_hint: 'من 2 إلى 14 حرفًا أو رقمًا. يظهر في الترتيب.',
      gx_solo: 'العب وحدك', gx_table: 'تحدَّ طاولتي', gx_room: 'انضم إلى لعبة القاعة',
      gx_q_of: 'السؤال {i} من {n}', gx_score: '{c} إجابة صحيحة من {n}', gx_points: '{p} نقطة', gx_best_quiz: 'أفضل نتيجة لك: {p} نقطة',
      gx_recap: 'الإجابات الصحيحة', gx_your_table: 'طاولتك', gx_the_room: 'القاعة', gx_again: 'العب مرة أخرى',
      gx_bad_nick: 'هذا الاسم غير مقبول', gx_closed: 'تعود الألعاب في زيارتك القادمة',
      gx_full: 'ثمانية لاعبين كحد أقصى لكل طاولة', gx_ends_in: 'تنتهي بعد {d}', gx_failed: 'لم تُحفظ اللعبة، حاول مجددًا',
      gx_moves: '{n} محاولة', gx_mem_done: 'أحسنت، في {n} محاولة', gx_best: 'أفضل نتيجة: {n}',
      gx_easy: 'سهل', gx_medium: 'متوسط', gx_hard: 'صعب', gx_new_grid: 'شبكة جديدة',
      gx_grid_done: 'اكتملت الشبكة', gx_erase: 'مسح',
      gx_min: '{m} د', gx_hmin: '{h} س {m} د',
    },
  };
  Object.keys(STRINGS).forEach((l) => { if (I18N[l]) Object.assign(I18N[l], STRINGS[l]); });

  const esc = (v) => escapeHtml(v == null ? '' : String(v));
  const fill = (s, map) => String(s).replace(/\{(\w+)\}/g, (_, k) => (map && map[k] != null ? map[k] : ''));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };
  const icons = () => { try { if (window.lucide) window.lucide.createIcons(); } catch (_) {} };

  const G = {
    data: null,            // la réponse de /api/order/guest
    diet: new Set(),       // filtres actifs
    ftour: false,          // « servir au ftour » coché
    pairTimer: null,
    tick: null,
    loading: null,         // la lecture en cours, que land() attend
  };

  /* ── Réseau ─────────────────────────────────────────────────────────────── */
  async function getJSON(url) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const j = await r.json().catch(() => null);
      return r.ok ? j : Object.assign({ ok: false, status: r.status }, j || {});
    } catch (_) { return null; }
  }
  async function postJSON(url, body) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      return r.ok ? j : Object.assign({ ok: false, status: r.status }, j || {});
    } catch (_) { return { ok: false, error: 'network' }; }
  }
  const slugQ = () => 'merchant=' + encodeURIComponent(NET.slug);

  function load() {
    if (!NET.slug) return Promise.resolve(null);
    G.loading = getJSON('/api/order/guest?' + slugQ() + '&lang=' + encodeURIComponent(currentLang)).then((res) => {
      G.data = res && res.ok ? res : null;
      renderAll();
      return G.data;
    });
    return G.loading;
  }

  /* ── Durées ─────────────────────────────────────────────────────────────── */
  function duration(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? fill(t('gx_hmin'), { h, m: String(m).padStart(2, '0') }) : fill(t('gx_min'), { m });
  }
  function clock(ts) {
    try {
      return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(currentLang === 'en' ? 'en-GB' : 'fr-FR', {
        timeZone: (G.data && G.data.zone) || 'Africa/Casablanca', hour: '2-digit', minute: '2-digit',
      }).format(new Date(ts));
    } catch (_) { return ''; }
  }

  /* ── Styles ─────────────────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('gx-css')) return;
    const s = document.createElement('style');
    s.id = 'gx-css';
    s.textContent = `
      .gx-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(var(--safe-top) + 8px) 20px calc(28px + var(--safe-bottom))}
      .gx-head{margin:6px 0 16px;padding-inline-end:172px;min-height:52px}
      .gx-store{font-size:26px;font-weight:650;letter-spacing:-.025em;color:var(--ink);line-height:1.15}
      .gx-head .gx-status{margin-inline-end:-172px}
      .gx-status{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px;padding:7px 12px;border-radius:999px;background:var(--mint-tint);border:1px solid var(--mint-edge);color:var(--forest);font-size:12.5px;font-weight:600}
      .gx-status b{font-family:var(--mono);font-weight:600}
      .gx-status .gx-dot{width:7px;height:7px;border-radius:50%;background:var(--emerald)}
      .gx-status.is-asked{background:var(--paper-mute);border-color:var(--line);color:var(--ink-2)}
      .gx-status.is-asked .gx-dot{background:var(--ink-3)}
      .gx-primary{width:100%;display:flex;align-items:center;gap:14px;padding:18px;border-radius:20px;background:var(--forest);color:var(--paper-cream);text-align:start;margin-bottom:12px;box-shadow:var(--shadow-card)}
      .gx-primary b{display:block;font-size:17px;font-weight:650;letter-spacing:-.015em}
      .gx-primary small{display:block;font-size:12.5px;opacity:.82;margin-top:2px}
      .gx-primary span{flex:1}
      .gx-primary svg{width:24px;height:24px;flex:none}
      .gx-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .gx-tile{text-decoration:none;display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:15px;border-radius:18px;background:var(--surface);border:1px solid var(--line-soft);box-shadow:var(--shadow-card);text-align:start;min-height:112px;color:var(--ink);position:relative}
      .gx-tile svg{width:22px;height:22px;color:var(--forest)}
      .gx-tile b{font-size:14.5px;font-weight:600;letter-spacing:-.01em}
      .gx-tile small{font-size:11.5px;color:var(--ink-3);line-height:1.35}
      .gx-badge{position:absolute;top:12px;inset-inline-end:12px;font-size:10.5px;font-weight:650;padding:3px 8px;border-radius:999px;background:var(--forest);color:var(--paper-cream)}
      .gx-social{margin-top:18px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-3)}
      .gx-social a{display:inline-flex;align-items:center;gap:5px;padding:8px 12px;border-radius:999px;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:550;background:var(--surface)}
      .gx-social svg{width:14px;height:14px}
      .gx-ftour{display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:12px 14px;border-radius:16px;background:var(--riad,#053B2C);color:var(--paper-cream);font-size:13.5px;font-weight:550}
      .gx-ftour svg{width:20px;height:20px;color:var(--mint)}
      .gx-ftour b{font-family:var(--mono);font-weight:600}
      [id^="gx-"][hidden]{display:none!important}
      .gx-tab-pill{background:var(--mint-tint);border-color:var(--mint-edge);color:var(--forest);font-weight:600}
      .gx-tab-pill b{font-family:var(--mono);font-weight:600}
      .gx-tab-pill.is-asked{background:var(--paper-mute);border-color:var(--line);color:var(--ink-2)}
      .gx-ftour-pill{background:var(--riad,#053B2C);border-color:transparent;color:var(--paper-cream)}
      .gx-ftour-pill svg{color:var(--mint)}
      .service-pill.is-on{background:var(--forest);border-color:var(--forest);color:var(--paper-cream)}
      .service-pill.is-on svg{color:var(--mint)}
      .gx-sheet{position:absolute;inset:0;z-index:240;pointer-events:none}
      .gx-sheet-bg{position:absolute;inset:0;background:rgba(10,10,10,0);transition:background 280ms ease}
      .gx-sheet-panel{position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:22px 22px 0 0;padding:12px 22px calc(22px + var(--safe-bottom));max-height:88%;overflow-y:auto;transform:translateY(100%);transition:transform 420ms cubic-bezier(0.32,0.72,0,1);box-shadow:0 -20px 40px rgba(0,0,0,.18)}
      .gx-sheet.is-open{pointer-events:auto}
      .gx-sheet.is-open .gx-sheet-bg{background:rgba(10,10,10,.55)}
      .gx-sheet.is-open .gx-sheet-panel{transform:translateY(0)}
      .gx-sheet h2{font-size:21px;font-weight:650;letter-spacing:-.02em;margin:6px 0 4px}
      .gx-sheet p{font-size:13px;color:var(--ink-3);margin:0 0 14px;line-height:1.45}
      .gx-kv{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;background:var(--paper-soft);margin-bottom:8px;font-size:13px;color:var(--ink-3)}
      .gx-kv b{font-family:var(--mono);font-size:14px;color:var(--ink);word-break:break-all;text-align:end;user-select:text;-webkit-user-select:text}
      .gx-btn{text-decoration:none;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:15px;border-radius:16px;background:var(--forest);color:var(--paper-cream);font-size:15px;font-weight:600;margin-top:10px}
      .gx-btn.is-ghost{background:var(--paper-mute);color:var(--ink)}
      .gx-btn svg{width:18px;height:18px}
      .gx-btn:disabled{opacity:.5}
      .gx-chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .gx-chip{padding:15px 12px;border-radius:14px;border:1px solid var(--line);background:var(--surface);font-size:14px;font-weight:550;color:var(--ink);text-align:center}
      .gx-chip.is-sent{background:var(--mint-tint);border-color:var(--mint-edge);color:var(--forest)}
      .gx-chip.is-wide{grid-column:1 / -1}
      .gx-pair{position:absolute;left:14px;right:14px;bottom:calc(84px + var(--safe-bottom));z-index:120;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 16px;border-radius:18px;background:var(--surface);border:1px solid var(--line-soft);box-shadow:0 12px 32px rgba(17,17,17,.16);transform:translateY(16px);opacity:0;pointer-events:none;transition:transform 260ms cubic-bezier(0.22,1,0.36,1),opacity 200ms ease}
      .gx-pair.is-visible{transform:none;opacity:1;pointer-events:auto}
      .gx-pair-txt{flex:1;min-width:0}
      .gx-pair-txt small{display:block;font-size:11px;color:var(--ink-3)}
      .gx-pair-txt b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gx-pair-txt span{font-family:var(--mono);font-size:12px;color:var(--ink-2)}
      .gx-pair button{flex:none;padding:10px 14px;border-radius:12px;background:var(--forest);color:var(--paper-cream);font-size:13px;font-weight:600}
      .gx-pair .gx-x{background:none;color:var(--ink-3);padding:8px}
      .gx-pair .gx-x svg{width:16px;height:16px}
      .service-bar{padding-top:8px}
      .gx-diet{display:flex;gap:8px;padding:0 22px 10px;overflow-x:auto;scrollbar-width:none}
      .gx-diet::-webkit-scrollbar{display:none}
      .gx-diet button{flex:none;padding:8px 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:12px;font-weight:550;color:var(--ink-2)}
      .gx-diet button.is-on{background:var(--forest);border-color:var(--forest);color:var(--paper-cream)}
      .gx-diet-note{padding:0 22px 10px;font-size:11.5px;color:var(--ink-3)}
      .gx-wait{margin-top:10px;font-size:13px;color:inherit;opacity:.9;display:flex;align-items:center;justify-content:center;gap:6px}
      .gx-wait svg{width:16px;height:16px;color:var(--mint)}
      .gx-ftour-opt{display:flex;align-items:flex-start;gap:12px;margin:4px 0 12px;padding:12px 14px;border-radius:14px;background:var(--paper-soft);cursor:pointer}
      .gx-ftour-opt input{width:20px;height:20px;margin:2px 0 0;accent-color:var(--forest)}
      .gx-ftour-opt b{display:block;font-size:14px;font-weight:600}
      .gx-ftour-opt small{display:block;font-size:12px;color:var(--ink-3);margin-top:2px}
      .gx-bill-actions{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px}
      .gx-mini{text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:12.5px;font-weight:550;color:var(--ink)}
      .gx-mini svg{width:15px;height:15px;color:var(--forest)}
      .gx-review-cta{margin-top:14px}
      .gx-title{font-size:24px;font-weight:650;letter-spacing:-.025em;margin:8px 0 2px}
      .gx-lead{font-size:13px;color:var(--ink-3);margin:0 0 16px}
      .gx-backbtn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:550;color:var(--ink-2);padding:6px 0;margin-bottom:6px}
      .gx-backbtn svg{width:18px;height:18px}
      [dir="rtl"] .gx-backbtn svg,[dir="rtl"] .gx-primary svg:last-child{transform:scaleX(-1)}
      .gx-list{display:flex;flex-direction:column;gap:8px}
      .gx-row{display:flex;align-items:center;gap:12px;width:100%;padding:14px;border-radius:16px;background:var(--surface);border:1px solid var(--line-soft);text-align:start;color:var(--ink)}
      .gx-row svg{width:22px;height:22px;color:var(--forest);flex:none}
      .gx-row span{flex:1;min-width:0}
      .gx-row b{display:block;font-size:14.5px;font-weight:600}
      .gx-row small{display:block;font-size:11.5px;color:var(--ink-3);margin-top:2px}
      .gx-row.is-live{border-color:var(--forest);background:var(--mint-tint)}
      .gx-section{margin:20px 0 8px;font-size:12px;font-weight:650;color:var(--ink-3);letter-spacing:.02em}
      .gx-board{list-style:none;margin:0;padding:0;border-radius:16px;background:var(--surface);border:1px solid var(--line-soft);overflow:hidden}
      .gx-board li{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--line-soft);font-size:14px}
      .gx-board li:last-child{border-bottom:0}
      .gx-board .gx-rank{width:22px;font-family:var(--mono);font-size:12px;color:var(--ink-3)}
      .gx-board .gx-who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}
      .gx-board .gx-pts{font-family:var(--mono);font-size:13px;color:var(--forest);font-weight:600}
      .gx-board li.is-me{background:var(--mint-tint)}
      .gx-board-empty{padding:16px;font-size:13px;color:var(--ink-3);text-align:center}
      .gx-input{width:100%;padding:14px;border-radius:14px;border:1px solid var(--line);background:var(--surface);font-size:16px;color:var(--ink);user-select:text;-webkit-user-select:text}
      .gx-hint{font-size:11.5px;color:var(--ink-3);margin:6px 0 12px}
      .gx-progress{height:4px;border-radius:2px;background:var(--line-soft);margin:6px 0 18px;overflow:hidden}
      .gx-progress i{display:block;height:100%;background:var(--forest);transition:width 300ms ease}
      .gx-qcount{font-size:12px;color:var(--ink-3);font-family:var(--mono)}
      .gx-q{font-size:20px;font-weight:650;letter-spacing:-.02em;line-height:1.3;margin:6px 0 18px}
      .gx-choice{width:100%;padding:16px;border-radius:16px;border:1px solid var(--line);background:var(--surface);font-size:15px;font-weight:550;color:var(--ink);text-align:start;margin-bottom:8px;transition:background 160ms ease,border-color 160ms ease}
      .gx-choice.is-picked{background:var(--forest);border-color:var(--forest);color:var(--paper-cream)}
      .gx-big{font-size:44px;font-weight:700;letter-spacing:-.03em;color:var(--forest);font-family:var(--mono);margin:10px 0 0}
      .gx-recap{list-style:none;margin:0;padding:0}
      .gx-recap li{padding:10px 0;border-bottom:1px dashed var(--line-soft);font-size:13px}
      .gx-recap li b{display:block;font-weight:600;margin-bottom:3px}
      .gx-recap .is-ok{color:var(--forest)}
      .gx-recap .is-ko{color:var(--ink-3);text-decoration:line-through}
      .gx-mem{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .gx-card{aspect-ratio:3/4;border-radius:14px;position:relative;perspective:600px}
      .gx-card-in{position:absolute;inset:0;transition:transform 380ms cubic-bezier(0.22,1,0.36,1);transform-style:preserve-3d}
      .gx-card.is-up .gx-card-in{transform:rotateY(180deg)}
      .gx-face{position:absolute;inset:0;border-radius:14px;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .gx-face.is-back{background:var(--forest);color:var(--mint)}
      .gx-face.is-back svg{width:28px;height:28px;opacity:.85}
      .gx-face.is-front{transform:rotateY(180deg);background:var(--surface);border:1px solid var(--line);padding:8px;text-align:center;font-size:12px;font-weight:600;color:var(--ink)}
      .gx-face.is-front img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .gx-card.is-done .gx-face.is-front{border-color:var(--emerald);box-shadow:inset 0 0 0 2px var(--emerald)}
      .gx-meta{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-3);margin:0 0 12px;font-family:var(--mono)}
      .gx-seg{display:flex;gap:6px;margin-bottom:12px}
      .gx-seg button{flex:1;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--surface);font-size:13px;font-weight:550;color:var(--ink-2)}
      .gx-seg button.is-on{background:var(--forest);border-color:var(--forest);color:var(--paper-cream)}
      .gx-sudo{display:grid;grid-template-columns:repeat(9,1fr);border:2px solid var(--ink);border-radius:10px;overflow:hidden;background:var(--surface);direction:ltr}
      .gx-cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:17px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);color:var(--forest);font-weight:600}
      .gx-cell.is-given{color:var(--ink);font-weight:700}
      .gx-cell.is-sel{background:var(--mint-tint)}
      .gx-cell.is-peer{background:var(--paper-soft)}
      .gx-cell.is-bad{color:#B3261E}
      .gx-cell:nth-child(9n){border-right:0}
      .gx-cell:nth-child(9n+3),.gx-cell:nth-child(9n+6){border-right:2px solid var(--ink)}
      .gx-sudo .gx-cell:nth-child(n+19):nth-child(-n+27),.gx-sudo .gx-cell:nth-child(n+46):nth-child(-n+54){border-bottom:2px solid var(--ink)}
      .gx-sudo .gx-cell:nth-child(n+73){border-bottom:0}
      .gx-pad{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:12px;direction:ltr}
      .gx-pad button{padding:14px 0;border-radius:12px;background:var(--surface);border:1px solid var(--line);font-family:var(--mono);font-size:18px;font-weight:600;color:var(--ink)}
      .gx-pad button.is-erase{font-family:var(--sans);font-size:12.5px}
      .gx-done{margin-top:12px;padding:12px 14px;border-radius:14px;background:var(--mint-tint);color:var(--forest);font-weight:600;text-align:center;font-size:14px}
      .gx-thanks-review{margin-top:16px}
    `;
    document.head.appendChild(s);
  }

  /* ── Le squelette : un écran d'accueil, un écran de jeux, trois feuilles ── */
  function mount() {
    if (document.getElementById('screen-home')) return;
    css();
    const app = document.getElementById('app');
    app.insertAdjacentHTML('beforeend', `
      <section class="screen screen-home" id="screen-home"><div class="gx-scroll" id="gx-home"></div></section>
      <section class="screen screen-games" id="screen-games"><div class="gx-scroll" id="gx-games"></div></section>
      <div class="gx-sheet" id="gx-wifi" aria-hidden="true"><div class="gx-sheet-bg" data-gx-close></div><div class="gx-sheet-panel">
        <div class="cart-handle" data-gx-close></div><div id="gx-wifi-body"></div></div></div>
      <div class="gx-sheet" id="gx-req" aria-hidden="true"><div class="gx-sheet-bg" data-gx-close></div><div class="gx-sheet-panel">
        <div class="cart-handle" data-gx-close></div>
        <h2 data-i18n="gx_req_title">${esc(t('gx_req_title'))}</h2>
        <p data-i18n="gx_req_sub">${esc(t('gx_req_sub'))}</p>
        <div class="gx-chips">
          <button class="gx-chip" type="button" data-gx-req="water" data-i18n="gx_req_water">${esc(t('gx_req_water'))}</button>
          <button class="gx-chip" type="button" data-gx-req="bread" data-i18n="gx_req_bread">${esc(t('gx_req_bread'))}</button>
          <button class="gx-chip" type="button" data-gx-req="napkins" data-i18n="gx_req_napkins">${esc(t('gx_req_napkins'))}</button>
          <button class="gx-chip" type="button" data-gx-req="clear-table" data-i18n="gx_req_clear">${esc(t('gx_req_clear'))}</button>
          <button class="gx-chip is-wide" type="button" data-gx-req="call-server" data-i18n="gx_req_call">${esc(t('gx_req_call'))}</button>
        </div></div></div>
      <div class="gx-pair" id="gx-pair" role="status" aria-live="polite"></div>
    `);
    /* La barre de service de la carte : « Accueil » devant, « Demander »
       entre l'appel et l'addition. */
    const bar = document.getElementById('service-bar');
    if (bar) {
      bar.insertAdjacentHTML('afterbegin', `<button class="service-pill" type="button" data-gx="home" id="gx-home-pill" hidden><i data-icon="storefront"></i><span data-i18n="gx_home">${esc(t('gx_home'))}</span></button>`);
      const bill = bar.querySelector('[data-service="ask-bill"]');
      if (bill) bill.insertAdjacentHTML('beforebegin', `<button class="service-pill" type="button" data-gx="requests"><i data-icon="room_service"></i><span data-i18n="gx_requests">${esc(t('gx_requests'))}</span></button>`);
      /* L'état de l'addition juste après le numéro de table ; le régime et
         l'heure du ftour au bout de la rangée : la carte garde sa hauteur. */
      const badge = document.getElementById('menu-badge');
      if (badge) badge.insertAdjacentHTML('afterend', '<span class="service-pill gx-tab-pill" id="gx-tab-pill" role="status" hidden></span>');
      bar.insertAdjacentHTML('beforeend', `<button class="service-pill" type="button" data-gx="diet" id="gx-diet-pill" aria-expanded="false" hidden><i data-icon="nutrition"></i><span id="gx-diet-pill-text">${esc(t('gx_diet'))}</span></button><span class="service-pill gx-ftour-pill" id="gx-ftour-pill" hidden></span>`);
      bar.insertAdjacentHTML('afterend', '<div class="gx-diet" id="gx-diet" hidden></div><div class="gx-diet-note" id="gx-diet-note" hidden></div>');
    }
    /* Le panier : « servir au ftour », juste avant le bouton d'envoi. */
    const send = document.getElementById('send-btn');
    if (send) send.insertAdjacentHTML('beforebegin', '<label class="gx-ftour-opt" id="gx-ftour-opt" hidden><input type="checkbox" id="gx-ftour-check" /><span><b id="gx-ftour-label"></b><small data-i18n="gx_ftour_toggle_sub"></small></span></label>');
    /* Le succès : le vrai temps de la cuisine. */
    const recap = document.querySelector('#screen-success .success-eta');
    if (recap) recap.insertAdjacentHTML('afterend', '<div class="gx-wait" id="gx-wait" hidden></div>');
    /* Le merci : l'avis, au moment où il compte. */
    const thanks = document.querySelector('#screen-thanks .ready-sub');
    if (thanks) thanks.insertAdjacentHTML('afterend', '<div class="gx-thanks-review" id="gx-thanks-review" hidden></div>');
    /* L'addition : même tournée, WhatsApp. */
    const orders = document.getElementById('bill-orders');
    if (orders) orders.insertAdjacentHTML('afterend', '<div class="gx-bill-actions" id="gx-bill-actions" hidden></div>');

    const check = document.getElementById('gx-ftour-check');
    if (check) check.addEventListener('change', () => { G.ftour = !!check.checked; });
    document.addEventListener('click', onClick, true);
    applyStaticI18n();
    icons();
  }

  /* ── Rendu ──────────────────────────────────────────────────────────────── */
  const guest = () => (G.data && G.data.guest) || null;
  function hasHub() {
    const g = guest();
    return !!(g && (g.wifi || g.review || g.games || (g.socials && g.socials.length))) || !!(G.data && G.data.ramadan);
  }
  function isTable() { return orderMode === 'table' && !!tableNumber; }

  function statusHtml() {
    if (!isTable()) return '';
    const asked = billAsked();
    const total = typeof sessionTotal === 'number' ? sessionTotal : 0;
    const state = asked ? t('gx_status_asked') : (total > 0 ? t('gx_status_open') : '');
    return `<span class="gx-status${asked ? ' is-asked' : ''}" data-gx-status><span class="gx-dot"></span>${esc(t('gx_status_table'))} ${esc(tableNumber)}`
      + (total > 0 ? ` · <b>${esc(money(total))}</b>` : '') + (state ? ` · ${esc(state)}` : '') + '</span>';
  }

  /* short : la pastille de la carte ne garde que l'heure. */
  function ftourText(short) {
    const r = G.data && G.data.ramadan;
    if (!r) return '';
    const now = Date.now();
    const target = r.today && r.today > now - 30 * 60000 ? r.today : r.tomorrow;
    if (!target) return '';
    if (target <= now) return short ? '' : t('gx_ftour_now');
    const at = fill(t('gx_ftour_at'), { t: clock(target) });
    return short ? at : at + ' · ' + fill(t('gx_ftour_in'), { d: duration(target - now) });
  }
  function ftourHtml() {
    const text = ftourText(false);
    return text ? `<div class="gx-ftour"><i data-icon="dark_mode"></i><span>${esc(text)}</span></div>` : '';
  }

  function renderHome() {
    const el = document.getElementById('gx-home');
    if (!el) return;
    const g = guest() || {};
    const round = g.games && g.games.round;
    const tiles = [];
    if (g.wifi) tiles.push(`<button class="gx-tile" type="button" data-gx="wifi"><i data-icon="key"></i><b>${esc(t('gx_wifi'))}</b><small>${esc(t('gx_wifi_sub'))}</small></button>`);
    if (g.review) tiles.push(`<a class="gx-tile" href="${esc(g.review)}" target="_blank" rel="noopener noreferrer"><i data-icon="star"></i><b>${esc(t('gx_review'))}</b><small>${esc(t('gx_review_sub'))}</small></a>`);
    if (g.games) tiles.push(`<button class="gx-tile" type="button" data-gx="games">${round ? `<span class="gx-badge">${esc(t('gx_live'))}</span>` : ''}<i data-icon="emoji_events"></i><b>${esc(t('gx_games'))}</b><small>${esc(t('gx_games_sub'))}</small></button>`);
    if (isTable()) tiles.push(`<button class="gx-tile" type="button" data-gx="requests"><i data-icon="room_service"></i><b>${esc(t('gx_requests'))}</b><small>${esc(t('gx_requests_sub'))}</small></button>`);
    const socials = (g.socials || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.kind === 'instagram' ? 'Instagram' : s.kind === 'facebook' ? 'Facebook' : 'TikTok')}<i data-icon="open_in_new"></i></a>`).join('');
    el.innerHTML = `
      <div class="gx-head"><div class="gx-store">${esc(STORE.name || '')}</div>${statusHtml()}</div>
      ${ftourHtml()}
      <button class="gx-primary" type="button" data-gx="menu"><i data-icon="menu_book"></i><span><b>${esc(t('gx_menu'))}</b><small>${esc(t('gx_menu_sub'))}</small></span><i data-icon="arrow_forward"></i></button>
      <div class="gx-tiles">${tiles.join('')}</div>
      ${socials ? `<div class="gx-social"><span>${esc(t('gx_follow'))}</span>${socials}</div>` : ''}`;
    icons();
  }

  function renderStrip() {
    const tab = document.getElementById('gx-tab-pill');
    if (tab) {
      const asked = billAsked();
      const total = typeof sessionTotal === 'number' ? sessionTotal : 0;
      const show = isTable() && (total > 0 || asked);
      tab.hidden = !show;
      tab.classList.toggle('is-asked', asked);
      if (show) tab.innerHTML = (total > 0 ? `<b>${esc(money(total))}</b>` : '') + (total > 0 ? ' · ' : '') + esc(asked ? t('gx_status_asked') : t('gx_status_open'));
    }
    const home = document.getElementById('gx-home-pill');
    if (home) home.hidden = !(isTable() && hasHub());
    const fp = document.getElementById('gx-ftour-pill');
    if (fp) { const txt = ftourText(true); fp.innerHTML = txt ? `<i data-icon="dark_mode"></i><span>${esc(txt)}</span>` : ''; fp.hidden = !txt; }
    renderFtourOption();
    icons();
  }

  function renderFtourOption() {
    const opt = document.getElementById('gx-ftour-opt');
    if (!opt) return;
    const at = ftourTarget();
    opt.hidden = !at;
    if (!at) { G.ftour = false; const c = document.getElementById('gx-ftour-check'); if (c) c.checked = false; return; }
    const label = document.getElementById('gx-ftour-label');
    if (label) label.textContent = fill(t('gx_ftour_toggle'), { t: clock(at) });
  }
  /* Le ftour du jour, s'il est encore à plus de deux minutes et à moins de
     huit heures : la même fenêtre que le serveur (functions/api/order/index.js). */
  function ftourTarget() {
    const r = G.data && G.data.ramadan;
    if (!r || !r.today) return null;
    const lead = r.today - Date.now();
    return lead >= 2 * 60000 && lead <= 8 * 3600e3 ? r.today : null;
  }

  function renderAll() {
    mount();
    renderHome();
    renderStrip();
    renderDiet();
    renderThanks();
    if (G.data && G.data.ramadan && !G.tick) G.tick = setInterval(() => { renderStrip(); if (document.getElementById('screen-home').classList.contains('is-active')) renderHome(); }, 30000);
  }

  /* ── Addition demandée : retenue pour la visite ─────────────────────────── */
  const askedKey = () => 'kiwi-op-asked:' + NET.slug + ':' + (SESSION.id || '');
  function billAsked() { return !!SESSION.id && store.get(askedKey()) === '1'; }

  /* ── Feuilles ───────────────────────────────────────────────────────────── */
  function openSheet(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
  }
  function closeSheets() {
    document.querySelectorAll('.gx-sheet.is-open').forEach((el) => { el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); });
  }
  function openWifi() {
    const w = guest() && guest().wifi;
    if (!w) return;
    document.getElementById('gx-wifi-body').innerHTML = `
      <h2>${esc(t('gx_wifi_title'))}</h2>
      <p>${esc(t('gx_wifi_hint'))}</p>
      <div class="gx-kv"><span>${esc(t('gx_wifi_network'))}</span><b>${esc(w.ssid)}</b></div>
      <div class="gx-kv"><span>${esc(t('gx_wifi_password'))}</span><b>${esc(w.password || t('gx_wifi_none'))}</b></div>
      ${w.password ? `<button class="gx-btn" type="button" data-gx="wifi-copy"><i data-icon="content_copy"></i>${esc(t('gx_wifi_copy'))}</button>` : ''}`;
    icons();
    openSheet('gx-wifi');
  }
  async function copyWifi() {
    const w = guest() && guest().wifi;
    if (!w || !w.password) return;
    let done = false;
    try { await navigator.clipboard.writeText(w.password); done = true; } catch (_) {}
    if (!done) {
      try {
        const ta = document.createElement('textarea');
        ta.value = w.password; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); done = document.execCommand('copy'); ta.remove();
      } catch (_) {}
    }
    showToast(done ? t('gx_wifi_copied') : w.password);
  }
  async function request(action, chip) {
    if (chip) chip.classList.add('is-sent');
    if (await sendServiceRequest(action)) {
      showToast(t('gx_req_sent') + ' ' + tableNumber);
      setTimeout(closeSheets, 500);
    }
    if (chip) setTimeout(() => chip.classList.remove('is-sent'), 4000);
  }

  /* ── Avec ça ? ──────────────────────────────────────────────────────────── */
  function onAdded(line) {
    const pairs = G.data && G.data.pairs;
    if (!pairs || !line) return;
    const inCart = new Set([...cart.values()].map((l) => String(l.id)));
    const next = (pairs[String(line.id)] || []).map((id) => itemOf(String(id)))
      .find((m) => m && m.avail !== false && !inCart.has(m.id) && standaloneOk(m.id));
    const box = document.getElementById('gx-pair');
    if (!box || !next) return;
    box.innerHTML = `<div class="gx-pair-txt"><small>${esc(t('gx_pair_title'))} ${esc(nameOf(line.id))}</small><b>${esc(nameOf(next.id))}</b><span>${esc(money(next.price))}</span></div>
      <button type="button" data-gx-pair="${esc(next.id)}">${esc(t('gx_pair_add'))}</button>
      <button type="button" class="gx-x" data-gx="pair-close" aria-label="${esc(t('gx_back'))}"><i data-icon="close"></i></button>`;
    icons();
    box.classList.add('is-visible');
    clearTimeout(G.pairTimer);
    G.pairTimer = setTimeout(hidePair, 10000);
  }
  function standaloneOk(id) {
    const s = MENU_ALL.get(String(id));
    return !(s && (s.archived || s.formulaOnly || s.avail === false));
  }
  function hidePair() { const b = document.getElementById('gx-pair'); if (b) b.classList.remove('is-visible'); }

  /* ── Même tournée ───────────────────────────────────────────────────────── */
  /* Le prix d'une ligne refaite se recalcule sur la carte d'AUJOURD'HUI : le
     serveur reprendra de toute façon les prix publiés. */
  function unitPriceOf(item, options) {
    let p = item.price;
    Object.keys(options || {}).forEach((key) => {
      const group = OPT[key];
      if (!group) return;
      const ids = Array.isArray(options[key]) ? options[key] : [options[key]];
      ids.filter(Boolean).forEach((id) => {
        const c = (group.choices || []).find((x) => x.id === String(id));
        if (c) p += Number(c.delta) || 0;
      });
    });
    return toCents(p) / 100;
  }
  function reorder(orderId) {
    const o = sentOrders.find((x) => x.id === orderId);
    if (!o) return;
    let added = 0;
    (o.lines || []).forEach((l) => {
      const item = itemOf(String(l.id));
      if (!item || item.avail === false || !standaloneOk(item.id)) return;
      const options = JSON.parse(JSON.stringify(l.options || {}));
      const key = lineKey(item.id, options, l.note || '');
      const qty = Math.max(1, Number(l.qty) || 1);
      if (cart.has(key)) cart.get(key).qty += qty;
      else cart.set(key, { id: item.id, options, note: l.note || '', unitPrice: unitPriceOf(item, options), qty });
      added += qty;
    });
    refreshCartUI();
    if (!added) { showToast(t('gx_reorder_none')); return; }
    closeBill();
    showToast(added === 1 ? t('gx_reorder_done_1') : fill(t('gx_reorder_done'), { n: added }));
    gotoScreen('screen-menu');
    openCart();
  }

  /* ── L'addition sur WhatsApp ─────────────────────────────────────────────
     Un lien wa.me sans numéro : WhatsApp demande à qui l'envoyer (soi-même,
     la table). Rien ne part sans que le client choisisse. */
  function whatsappText() {
    const agg = new Map();
    sentLines.forEach((l) => {
      const key = lineKey(l.id, l.options, l.note) + '|' + toCents(l.unitPrice);
      if (agg.has(key)) agg.get(key).qty += l.qty; else agg.set(key, { ...l });
    });
    let when = '';
    try { when = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(currentLang === 'en' ? 'en-GB' : currentLang === 'ar' ? 'ar-MA' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: (G.data && G.data.zone) || undefined }).format(new Date()); } catch (_) {}
    const rows = [...agg.values()].map((l) => `${l.qty}× ${nameOf(l.id)} · ${money(l.qty * l.unitPrice)}`);
    return [`${STORE.name || ''} · ${t('gx_status_table')} ${tableNumber}`, when, '', ...rows, '',
      `${t('gx_wa_subtotal')} · ${money(sessionTotal)}`, t('gx_wa_scope')].join('\n');
  }

  function decorateBill() {
    const box = document.getElementById('gx-bill-actions');
    if (!box) return;
    const live = sentOrders.filter((o) => o.status !== 'rejected' && (o.lines || []).length);
    const bits = live.map((o) => `<button class="gx-mini" type="button" data-gx-reorder="${esc(o.id)}"><i data-icon="repeat"></i>${esc(t('gx_reorder'))}${live.length > 1 ? ' · ' + esc(t('bill_order_label')) + ' ' + esc(o.number || '') : ''}</button>`);
    if (sentLines.length) bits.push(`<a class="gx-mini" href="https://wa.me/?text=${encodeURIComponent(whatsappText())}" target="_blank" rel="noopener noreferrer"><i data-icon="share"></i>${esc(t('gx_wa'))}</a>`);
    box.innerHTML = bits.join('');
    box.hidden = !bits.length;
    icons();
  }

  /* ── Le temps réel de la cuisine ────────────────────────────────────────── */
  function estimate(ids) {
    const w = G.data && G.data.waits;
    if (!w) return null;
    const known = (ids || []).map((id) => w.items && w.items[String(id)]).filter((m) => Number.isFinite(m));
    if (known.length) return Math.max(...known);
    return Number.isFinite(w.overall) ? w.overall : null;
  }
  function onSent(lines, res) {
    const el = document.getElementById('gx-wait');
    const ftour = res && res.ftour;
    G.ftour = false;
    const c = document.getElementById('gx-ftour-check'); if (c) c.checked = false;
    if (!el) return;
    if (ftour) {
      el.innerHTML = `<i data-icon="dark_mode"></i><span>${esc(fill(t('gx_ftour_at'), { t: clock(ftour) }))}</span>`;
      el.hidden = false;
    } else {
      const m = estimate((lines || []).map((l) => l.id));
      el.innerHTML = m ? `<i data-icon="schedule"></i><span>${esc(fill(t('gx_wait_usual'), { n: m }))}</span>` : '';
      el.hidden = !m;
    }
    icons();
    renderStrip();
  }
  function orderExtras() { return G.ftour && ftourTarget() ? { ftour: true } : {}; }
  function ftourRefused() {
    G.ftour = false;
    const c = document.getElementById('gx-ftour-check'); if (c) c.checked = false;
    renderFtourOption();
    showToast(t('gx_ftour_late'));
  }

  /* ── Filtres « sans… » ──────────────────────────────────────────────────
     Les fiches allergènes n'existent que pour les plats que le restaurant a
     renseignés en entier (functions/api/menu.js › withNutrition). Un plat
     sans fiche n'est JAMAIS présenté comme « sans gluten » : quand un filtre
     est actif il est masqué, et la page dit combien. */
  const DIETS = [
    ['gluten', ['gluten']], ['lait', ['lait']], ['nuts', ['fruits_a_coque', 'arachides']],
    ['oeufs', ['oeufs']], ['sea', ['poissons', 'crustaces', 'mollusques']], ['sesame', ['sesame']],
  ];
  function dietKnown() { return MENU.some((m) => Array.isArray(m.allergens)); }
  function dietAllows(m) {
    if (!G.diet.size) return true;
    if (!Array.isArray(m.allergens)) return false;
    const has = new Set(m.allergens);
    return DIETS.every(([k, keys]) => !G.diet.has(k) || !keys.some((x) => has.has(x)));
  }
  function renderDiet() {
    const row = document.getElementById('gx-diet');
    const note = document.getElementById('gx-diet-note');
    if (!row) return;
    const pill = document.getElementById('gx-diet-pill');
    if (!dietKnown()) { row.hidden = true; if (note) note.hidden = true; if (pill) pill.hidden = true; G.diet.clear(); return; }
    const open = G.dietOpen || G.diet.size > 0;
    row.innerHTML = DIETS.map(([k]) => `<button type="button" class="${G.diet.has(k) ? 'is-on' : ''}" data-gx-diet="${k}" aria-pressed="${G.diet.has(k)}">${esc(t('gx_diet_' + k))}</button>`).join('');
    row.hidden = !open;
    if (pill) {
      pill.hidden = false;
      pill.classList.toggle('is-on', G.diet.size > 0);
      pill.setAttribute('aria-expanded', String(open));
      const txt = document.getElementById('gx-diet-pill-text');
      if (txt) txt.textContent = t('gx_diet') + (G.diet.size ? ' · ' + G.diet.size : '');
    }
    afterMenu();
  }
  function afterMenu() {
    const note = document.getElementById('gx-diet-note');
    if (!note) return;
    if (!G.diet.size) { note.hidden = true; return; }
    const unknown = MENU.filter((m) => !Array.isArray(m.allergens)).length;
    note.textContent = (unknown ? (unknown === 1 ? t('gx_diet_hidden_1') : fill(t('gx_diet_hidden'), { n: unknown })) + ' · ' : '') + t('gx_diet_note');
    note.hidden = false;
  }

  /* ── Merci : l'avis ─────────────────────────────────────────────────────── */
  function renderThanks() {
    const el = document.getElementById('gx-thanks-review');
    const url = guest() && guest().review;
    if (!el) return;
    el.innerHTML = url ? `<a class="gx-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><i data-icon="star"></i>${esc(t('gx_review'))}</a>` : '';
    el.hidden = !url;
    icons();
  }

  /* ═══ LES JEUX ═══════════════════════════════════════════════════════════ */
  const NICK_KEY = 'kiwi-op-nick';
  const nickOk = (v) => {
    const s = String(v || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    return s.length >= 2 && s.length <= 14 && /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(s) ? s : '';
  };
  const Q = { quiz: null, mode: 'solo', round: '', answers: [], at: 0, result: null };

  function gamesShell(inner) {
    const el = document.getElementById('gx-games');
    el.innerHTML = `<button class="gx-backbtn" type="button" data-gx="${Q.quiz || MEM.on || SUDO.on ? 'games' : 'home'}"><i data-icon="arrow_back"></i>${esc(t('gx_back'))}</button>${inner}`;
    icons();
    el.scrollTop = 0;
  }
  function boardHtml(rows, me) {
    if (!rows || !rows.length) return `<div class="gx-board gx-board-empty">${esc(t('gx_board_empty'))}</div>`;
    return `<ol class="gx-board">${rows.map((r, i) => `<li class="${me && String(r.nick).toLowerCase() === me.toLowerCase() ? 'is-me' : ''}"><span class="gx-rank">${i + 1}</span><span class="gx-who">${esc(r.nick)}${r.table ? ` · ${esc(t('gx_status_table'))} ${esc(r.table)}` : ''}</span><span class="gx-pts">${esc(r.score)}</span></li>`).join('')}</ol>`;
  }

  async function openGames() {
    Q.quiz = null; MEM.on = false; SUDO.on = false;
    const g = guest();
    if (!g || !g.games) return;
    gotoScreen('screen-games');
    const round = g.games.round;
    const quizzes = g.games.quizzes || [];
    const roundRow = round ? `<button class="gx-row is-live" type="button" data-gx-quiz="${esc(round.quizId)}" data-gx-round="${esc(round.id)}"><i data-icon="groups"></i><span><b>${esc(t('gx_round_live'))} · ${esc(round.title)}</b><small>${esc(fill(t('gx_ends_in'), { d: duration(round.endTs - Date.now()) }))}</small></span><i data-icon="arrow_forward"></i></button>` : '';
    const list = quizzes.map((q) => `<button class="gx-row" type="button" data-gx-quiz="${esc(q.id)}"><i data-icon="lightbulb"></i><span><b>${esc(q.title)}</b><small>${esc(fill(t('gx_questions'), { n: q.count }))}${q.own ? ' · ' + esc(t('gx_house')) : ''}</small></span></button>`).join('');
    gamesShell(`
      <div class="gx-title">${esc(t('gx_games_title'))}</div><p class="gx-lead">${esc(t('gx_games_lead'))}</p>
      <div class="gx-list">${roundRow}
        <button class="gx-row" type="button" data-gx="memory"><i data-icon="layers"></i><span><b>${esc(t('gx_memory'))}</b><small>${esc(t('gx_memory_sub'))}</small></span></button>
        <button class="gx-row" type="button" data-gx="sudoku"><i data-icon="grid_view"></i><span><b>${esc(t('gx_sudoku'))}</b><small>${esc(t('gx_sudoku_sub'))}</small></span></button>
      </div>
      <div class="gx-section">${esc(t('gx_quiz'))} · ${esc(t('gx_quiz_sub'))}</div>
      <div class="gx-list">${list}</div>
      <div class="gx-section">${esc(t('gx_board'))}</div>
      <div id="gx-month">${boardHtml([])}</div>`);
    const b = await getJSON('/api/order/game?' + slugQ() + '&board=month');
    const box = document.getElementById('gx-month');
    if (box && b && b.ok) box.innerHTML = boardHtml(b.board, store.get(NICK_KEY));
  }

  /* Le départ d'une partie : un pseudo, puis seul / ma table / la salle. */
  async function startQuiz(quizId, roundId) {
    const res = await getJSON('/api/order/game?' + slugQ() + '&quiz=' + encodeURIComponent(quizId) + '&lang=' + encodeURIComponent(currentLang));
    if (!res || !res.ok) { showToast(res && res.error === 'games-off' ? t('gx_closed') : t('order_offline')); return; }
    Q.quiz = res.quiz; Q.round = roundId || ''; Q.answers = []; Q.at = 0; Q.result = null;
    const nick = store.get(NICK_KEY) || '';
    gamesShell(`
      <div class="gx-title">${esc(Q.quiz.title)}</div><p class="gx-lead">${esc(fill(t('gx_questions'), { n: Q.quiz.questions.length }))}</p>
      <label class="gx-section" for="gx-nick">${esc(t('gx_nick'))}</label>
      <input class="gx-input" id="gx-nick" maxlength="14" autocomplete="nickname" value="${esc(nick)}" />
      <div class="gx-hint">${esc(t('gx_nick_hint'))}</div>
      ${Q.round ? `<button class="gx-btn" type="button" data-gx-mode="room"><i data-icon="groups"></i>${esc(t('gx_room'))}</button>` : ''}
      <button class="gx-btn${Q.round ? ' is-ghost' : ''}" type="button" data-gx-mode="table"><i data-icon="table_restaurant"></i>${esc(t('gx_table'))}</button>
      <button class="gx-btn is-ghost" type="button" data-gx-mode="solo"><i data-icon="person"></i>${esc(t('gx_solo'))}</button>`);
  }
  function beginQuiz(mode) {
    const input = document.getElementById('gx-nick');
    const nick = nickOk(input && input.value);
    if (!nick) { showToast(t('gx_bad_nick')); if (input) input.focus(); return; }
    store.set(NICK_KEY, nick);
    Q.mode = mode;
    if (mode !== 'room') Q.round = '';
    renderQuestion();
  }
  function renderQuestion() {
    const q = Q.quiz.questions[Q.at];
    const n = Q.quiz.questions.length;
    gamesShell(`
      <div class="gx-qcount">${esc(fill(t('gx_q_of'), { i: Q.at + 1, n }))}</div>
      <div class="gx-progress"><i style="width:${Math.round((Q.at / n) * 100)}%"></i></div>
      <div class="gx-q">${esc(q.q)}</div>
      ${q.choices.map((c, k) => `<button class="gx-choice" type="button" data-gx-pick="${k}">${esc(c)}</button>`).join('')}`);
  }
  let picking = false;
  function pick(k, btn) {
    if (picking) return;
    picking = true;
    Q.answers[Q.at] = k;
    if (btn) btn.classList.add('is-picked');
    setTimeout(() => {
      picking = false;
      Q.at++;
      if (Q.at < Q.quiz.questions.length) renderQuestion(); else finishQuiz();
    }, 320);
  }
  async function finishQuiz() {
    const nick = store.get(NICK_KEY) || '';
    gamesShell(`<div class="gx-title">${esc(Q.quiz.title)}</div><p class="gx-lead">…</p>`);
    const res = await postJSON('/api/order/game', { merchant: NET.slug, session: SESSION.id || '', quiz: Q.quiz.id, answers: Q.answers, nick, round: Q.round || '' });
    if (!res || !res.ok) {
      const e = res && res.error;
      showToast(e === 'session-closed' || e === 'session-required' ? t('gx_closed') : e === 'too-many-players' ? t('gx_full') : e === 'bad-nick' ? t('gx_bad_nick') : t('gx_failed'));
      if (e === 'session-closed') SESSION.markClosed('settle');
      else openGames();
      return;
    }
    Q.result = res;
    const recap = Q.quiz.questions.map((q, i) => {
      const mine = Q.answers[i];
      const good = res.right[i];
      return `<li><b>${esc(q.q)}</b><span class="${mine === good ? 'is-ok' : 'is-ko'}">${esc(mine == null || mine < 0 ? '·' : q.choices[mine])}</span>${mine === good ? '' : ` · <span class="is-ok">${esc(q.choices[good])}</span>`}</li>`;
    }).join('');
    const boardTitle = Q.mode === 'room' ? t('gx_the_room') : Q.mode === 'table' ? t('gx_your_table') : t('gx_board');
    gamesShell(`
      <div class="gx-title">${esc(Q.quiz.title)}</div>
      <div class="gx-big">${esc(fill(t('gx_points'), { p: res.score }))}</div>
      <p class="gx-lead">${esc(fill(t('gx_score'), { c: res.correct, n: res.total }))}</p>
      ${res.best && res.best.score > res.score ? `<p class="gx-lead">${esc(fill(t('gx_best_quiz'), { p: res.best.score }))}</p>` : ''}
      <div class="gx-section">${esc(boardTitle)}</div><div id="gx-after">${boardHtml([])}</div>
      <button class="gx-btn" type="button" data-gx-quiz="${esc(Q.quiz.id)}"${Q.round ? ` data-gx-round="${esc(Q.round)}"` : ''}><i data-icon="refresh"></i>${esc(t('gx_again'))}</button>
      <div class="gx-section">${esc(t('gx_recap'))}</div><ul class="gx-recap">${recap}</ul>`);
    const q = Q.mode === 'room' ? '&board=round&round=' + encodeURIComponent(res.round || Q.round)
      : Q.mode === 'table' ? '&board=table&session=' + encodeURIComponent(SESSION.id) + '&quiz=' + encodeURIComponent(Q.quiz.id)
      : '&board=month';
    const b = await getJSON('/api/order/game?' + slugQ() + q);
    const box = document.getElementById('gx-after');
    if (box && b && b.ok) box.innerHTML = boardHtml(b.board, nick);
  }

  /* ── Memory : les plats de la maison ────────────────────────────────────
     Six paires tirées de la carte du restaurant : sa photo quand il y en a
     une, son nom sinon. Le jeu est local, le record aussi. */
  const MEM = { on: false, cards: [], up: [], moves: 0, done: 0, lock: false };
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function openMemory() {
    const pool = shuffle(MENU.filter((m) => m && m.id).slice());
    const withPhoto = pool.filter((m) => m.photo);
    const chosen = (withPhoto.length >= 6 ? withPhoto : pool).slice(0, 6);
    if (chosen.length < 3) return;
    MEM.on = true; MEM.moves = 0; MEM.done = 0; MEM.up = []; MEM.lock = false;
    MEM.cards = shuffle(chosen.concat(chosen).map((m, i) => ({ id: m.id, k: i })));
    renderMemory();
  }
  function renderMemory() {
    const best = store.get('kiwi-op-mem-best:' + MEM.cards.length);
    gamesShell(`
      <div class="gx-title">${esc(t('gx_memory'))}</div>
      <div class="gx-meta"><span>${esc(fill(t('gx_moves'), { n: MEM.moves }))}</span><span>${best ? esc(fill(t('gx_best'), { n: best })) : ''}</span></div>
      <div class="gx-mem">${MEM.cards.map((c, i) => {
        const m = itemOf(c.id);
        const front = m && m.photo ? `<img src="${esc(m.photo)}" alt="${esc(nameOf(c.id))}" />` : `<span>${esc(nameOf(c.id))}</span>`;
        return `<button class="gx-card${c.up ? ' is-up' : ''}${c.done ? ' is-done' : ''}" type="button" data-gx-card="${i}" aria-label="${c.up ? esc(nameOf(c.id)) : '?'}"><span class="gx-card-in"><span class="gx-face is-back"><i data-icon="restaurant"></i></span><span class="gx-face is-front">${front}</span></span></button>`;
      }).join('')}</div>
      <div id="gx-mem-done"></div>`);
  }
  function flip(i) {
    const c = MEM.cards[i];
    if (!c || c.up || c.done || MEM.lock) return;
    c.up = true;
    MEM.up.push(i);
    const el = document.querySelector(`[data-gx-card="${i}"]`);
    if (el) el.classList.add('is-up');
    if (MEM.up.length < 2) return;
    MEM.moves++;
    const [a, b] = MEM.up.map((x) => MEM.cards[x]);
    MEM.up = [];
    if (a.id === b.id) {
      a.done = b.done = true; MEM.done++;
      renderMemory();
      if (MEM.done * 2 === MEM.cards.length) {
        const key = 'kiwi-op-mem-best:' + MEM.cards.length;
        const best = Number(store.get(key)) || 0;
        if (!best || MEM.moves < best) store.set(key, String(MEM.moves));
        const box = document.getElementById('gx-mem-done');
        if (box) box.innerHTML = `<div class="gx-done">${esc(fill(t('gx_mem_done'), { n: MEM.moves }))}</div><button class="gx-btn" type="button" data-gx="memory"><i data-icon="refresh"></i>${esc(t('gx_again'))}</button>`;
        icons();
      }
      return;
    }
    MEM.lock = true;
    setTimeout(() => { a.up = b.up = false; MEM.lock = false; renderMemory(); }, 850);
    const meta = document.querySelector('.gx-meta span');
    if (meta) meta.textContent = fill(t('gx_moves'), { n: MEM.moves });
  }

  /* ── Sudoku ─────────────────────────────────────────────────────────────
     Une grille pleine tirée au hasard, puis des cases retirées une à une tant
     que la solution reste UNIQUE (on compte jusqu'à deux solutions). */
  const SUDO = { on: false, level: 'easy', given: [], grid: [], solution: [], sel: -1 };
  const SUDO_HOLES = { easy: 38, medium: 47, hard: 54 };
  function okAt(g, i, v) {
    const r = Math.floor(i / 9), c = i % 9, br = r - (r % 3), bc = c - (c % 3);
    for (let k = 0; k < 9; k++) {
      if (g[r * 9 + k] === v || g[k * 9 + c] === v) return false;
      if (g[(br + Math.floor(k / 3)) * 9 + bc + (k % 3)] === v) return false;
    }
    return true;
  }
  function solve(g, count) {
    const i = g.indexOf(0);
    if (i < 0) return 1;
    let n = 0;
    for (const v of count ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (!okAt(g, i, v)) continue;
      g[i] = v;
      n += solve(g, count);
      if (!count && n) return n;
      if (count && n > 1) { g[i] = 0; return n; }
      g[i] = 0;
    }
    return n;
  }
  function makeSudoku(level) {
    const full = Array(81).fill(0);
    solve(full, false);
    const solution = full.slice();
    /* solve(…, false) laisse la grille remplie : on la recopie avant de creuser. */
    const grid = solution.slice();
    let holes = SUDO_HOLES[level] || 38;
    for (const i of shuffle([...Array(81).keys()])) {
      if (!holes) break;
      const keep = grid[i];
      grid[i] = 0;
      if (solve(grid.slice(), true) !== 1) grid[i] = keep; else holes--;
    }
    return { grid, solution };
  }
  function fillSolved(g) { const x = g.slice(); solve(x, false); return x; }
  function openSudoku(level) {
    SUDO.on = true;
    SUDO.level = level || SUDO.level;
    const made = makeSudoku(SUDO.level);
    SUDO.given = made.grid.map((v) => v !== 0);
    SUDO.grid = made.grid.slice();
    SUDO.solution = made.solution.every((v) => v) ? made.solution : fillSolved(made.grid);
    SUDO.sel = -1;
    renderSudoku();
  }
  function renderSudoku() {
    const sel = SUDO.sel;
    const r0 = sel >= 0 ? Math.floor(sel / 9) : -1, c0 = sel >= 0 ? sel % 9 : -1;
    const peer = (i) => sel >= 0 && i !== sel && (Math.floor(i / 9) === r0 || i % 9 === c0
      || (Math.floor(Math.floor(i / 9) / 3) === Math.floor(r0 / 3) && Math.floor((i % 9) / 3) === Math.floor(c0 / 3)));
    const solved = SUDO.grid.every((v, i) => v === SUDO.solution[i]);
    gamesShell(`
      <div class="gx-title">${esc(t('gx_sudoku'))}</div>
      <div class="gx-seg">${['easy', 'medium', 'hard'].map((l) => `<button type="button" class="${SUDO.level === l ? 'is-on' : ''}" data-gx-level="${l}">${esc(t('gx_' + l))}</button>`).join('')}</div>
      <div class="gx-sudo">${SUDO.grid.map((v, i) => {
        const bad = v && !SUDO.given[i] && !okAt(SUDO.grid.map((x, k) => (k === i ? 0 : x)), i, v);
        return `<button type="button" class="gx-cell${SUDO.given[i] ? ' is-given' : ''}${i === sel ? ' is-sel' : peer(i) ? ' is-peer' : ''}${bad ? ' is-bad' : ''}" data-gx-cell="${i}">${v || ''}</button>`;
      }).join('')}</div>
      ${solved ? `<div class="gx-done">${esc(t('gx_grid_done'))}</div><button class="gx-btn" type="button" data-gx-level="${SUDO.level}"><i data-icon="refresh"></i>${esc(t('gx_new_grid'))}</button>`
        : `<div class="gx-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-gx-num="${n}">${n}</button>`).join('')}<button type="button" class="is-erase" data-gx-num="0">${esc(t('gx_erase'))}</button></div>`}`);
  }
  function setCell(n) {
    if (SUDO.sel < 0 || SUDO.given[SUDO.sel]) return;
    SUDO.grid[SUDO.sel] = n;
    renderSudoku();
  }

  /* ── Les clics ──────────────────────────────────────────────────────────── */
  function onClick(e) {
    const el = e.target.closest('[data-gx],[data-gx-req],[data-gx-pair],[data-gx-reorder],[data-gx-diet],[data-gx-quiz],[data-gx-mode],[data-gx-pick],[data-gx-card],[data-gx-level],[data-gx-cell],[data-gx-num],[data-gx-close]');
    if (!el) return;
    const d = el.dataset;
    /* Les liens (avis, réseaux, WhatsApp) partent d'eux-mêmes. */
    if (el.tagName === 'A') return;
    e.stopPropagation();
    e.preventDefault();
    if (d.gxClose !== undefined) { closeSheets(); return; }
    if (d.gx === 'menu') { gotoScreen('screen-menu'); applyMenuMode(); renderStrip(); return; }
    if (d.gx === 'home') { renderHome(); gotoScreen('screen-home'); return; }
    if (d.gx === 'wifi') { openWifi(); return; }
    if (d.gx === 'wifi-copy') { copyWifi(); return; }
    if (d.gx === 'requests') { openSheet('gx-req'); return; }
    if (d.gx === 'games') { openGames(); return; }
    if (d.gx === 'memory') { openMemory(); return; }
    if (d.gx === 'sudoku') { openSudoku(); return; }
    if (d.gx === 'pair-close') { hidePair(); return; }
    if (d.gxReq) { request(d.gxReq, el); return; }
    if (d.gxPair) { hidePair(); handleAddClick(d.gxPair); return; }
    if (d.gxReorder) { reorder(d.gxReorder); return; }
    if (d.gx === 'diet') { G.dietOpen = !G.dietOpen; renderDiet(); return; }
    if (d.gxDiet) {
      if (G.diet.has(d.gxDiet)) G.diet.delete(d.gxDiet); else G.diet.add(d.gxDiet);
      renderDiet();
      renderMenu(activeMenuFilter());
      return;
    }
    if (d.gxQuiz) { startQuiz(d.gxQuiz, d.gxRound || ''); return; }
    if (d.gxMode) { beginQuiz(d.gxMode); return; }
    if (d.gxPick !== undefined) { pick(Number(d.gxPick), el); return; }
    if (d.gxCard !== undefined) { flip(Number(d.gxCard)); return; }
    if (d.gxLevel) { openSudoku(d.gxLevel); return; }
    if (d.gxCell !== undefined) { SUDO.sel = Number(d.gxCell); renderSudoku(); return; }
    if (d.gxNum !== undefined) { setCell(Number(d.gxNum)); return; }
  }

  /* ── Les crochets appelés par OrderPro.html ─────────────────────────────── */
  window.KiwiGuest = {
    load,
    /* Après s'être assis à table : l'accueil quand il y a quelque chose à y
       montrer, la carte sinon. Rend true si l'accueil a été ouvert. */
    async land(pending) {
      const wait = pending || G.loading;
      try { if (wait) await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))]); } catch (_) {}
      mount();
      renderAll();
      if (!isTable() || !hasHub()) return false;
      gotoScreen('screen-home');
      return true;
    },
    onAdded,
    orderExtras,
    ftourRefused,
    onSent,
    decorateBill,
    billAsked() { if (SESSION.id) store.set(askedKey(), '1'); renderStrip(); renderHome(); },
    refreshStatus() { if (document.getElementById('screen-home')) { renderStrip(); if (document.getElementById('screen-home').classList.contains('is-active')) renderHome(); } },
    dietAllows,
    afterMenu,
    onLang() { if (!document.getElementById('screen-home')) return; load(); },
    onClosed() { renderThanks(); },
    _test: { makeSudoku, okAt, solve, unitPriceOf, whatsappText, estimate, dietAllows, nickOk, G, Q, MEM, SUDO },
  };
})();
