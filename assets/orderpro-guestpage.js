/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ORDER PRO, LA PAGE CLIENT CÔTÉ PROPRIÉTAIRE (assets/orderpro-guestpage.js)
 * ---------------------------------------------------------------------------
 * Ce que le propriétaire règle de la page d'accueil que ses clients trouvent
 * en posant leur téléphone sur le tag de la table (assets/orderpro-guest.js) :
 *   · le Wi-Fi des clients, le lien de sa page d'avis, ses réseaux ;
 *   · les jeux : ses propres quiz, ceux de Kiwi, une manche pour toute la
 *     salle, les pseudos à retirer du classement ;
 *   · le Ramadan : sa ville, et l'écart avec l'heure de sa mosquée ;
 *   · le lien de l'écran de la salle (order-tv.html).
 *
 * Un seul document, `guestpage` dans store_docs (functions/api/store.js),
 * nettoyé par le serveur (functions/api/order/_guest.js › cleanGuestDoc) :
 * ce que ce fichier envoie de travers est retiré là-bas, pas ici.
 *
 * S'ouvre par le gestionnaire `orderpro-guestpage` (onglet « Page client » de
 * la carte, bouton du panneau des tags). Charger APRÈS orderpro-publish.js,
 * qui connaît le slug du commerce.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STR = {
    fr: {
      title: 'Page client', subtitle: 'Ce que vos clients trouvent en posant leur téléphone sur le tag',
      loading: 'Chargement…', load_failed: 'Lecture impossible. Vérifiez la connexion et rouvrez ce panneau.',
      save: 'Enregistrer', saving: 'Enregistrement…', saved: 'Enregistré · vos clients le voient maintenant.',
      save_failed: 'Enregistrement impossible ({e}).', conflict: 'Modifié depuis un autre appareil. Rechargé : refaites votre changement.',
      wifi: 'Wi-Fi des clients', wifi_ssid: 'Nom du réseau', wifi_pw: 'Mot de passe',
      wifi_help: 'Le client le copie d’un geste. Laissez vide pour ne pas l’afficher.',
      review: 'Avis', review_url: 'Lien de votre page d’avis', review_help: 'Google, TripAdvisor… Un lien https. Le bouton apparaît aussi après le paiement.',
      socials: 'Réseaux', socials_help: 'Votre pseudo ou l’adresse de la page.',
      games: 'Jeux', games_on: 'Proposer les jeux aux clients', games_help: 'Quiz, Memory des plats de votre carte, Sudoku. Un score demande une table ouverte.',
      builtin: 'Ajouter les quiz Kiwi (cuisine marocaine, thé et café, le Maroc)',
      own: 'Vos quiz', own_none: 'Pas encore de quiz à vous.', own_add: 'Nouveau quiz',
      quiz_title: 'Titre du quiz', quiz_q: 'Question {n}', quiz_choice: 'Réponse {n}', quiz_right: 'Bonne réponse',
      quiz_add_q: 'Ajouter une question', quiz_del_q: 'Retirer', quiz_del: 'Supprimer ce quiz', quiz_count: '{n} questions', quiz_count_1: '1 question',
      quiz_help: 'Deux à quatre réponses par question. Cochez la bonne. Une question incomplète n’est pas gardée.',
      round: 'Partie de la salle', round_help: 'Tout le monde joue le même quiz en même temps. Le classement passe sur l’écran de la salle.',
      round_quiz: 'Quiz', round_len: 'Durée', round_start: 'Lancer la partie', round_stop: 'Arrêter',
      round_live: 'En cours · {q} · se termine à {t}', round_need: 'Allumez les jeux et enregistrez pour lancer une partie.',
      min: '{n} min',
      board: 'Classement du mois', board_none: 'Personne encore ce mois-ci.', hide: 'Masquer', unhide: 'Réafficher',
      hidden: 'Pseudos masqués', hidden_help: 'Un pseudo masqué disparaît du classement et de l’écran de la salle.',
      ramadan: 'Ramadan', ramadan_on: 'Afficher l’heure du ftour et proposer « servir au ftour »',
      city: 'Ville', offset: 'Écart avec le coucher du soleil (minutes)',
      offset_help: 'Comparez l’heure affichée ci-dessous avec celle de votre mosquée, et ajustez.',
      iftar_today: 'Aujourd’hui, vos clients voient : ftour à {t}.', iftar_after: 'Enregistrez pour voir l’heure calculée.',
      tv: 'Écran de la salle', tv_help: 'Ouvrez ce lien sur une télé ou une tablette : classement du mois, partie en cours, heure du ftour.',
      copy: 'Copier le lien', open: 'Ouvrir', copied: 'Lien copié',
      preview: 'Voir la page d’une table', off: 'Order Pro n’est pas activé pour ce commerce.',
    },
    en: {
      title: 'Guest page', subtitle: 'What guests find when they tap their phone on the tag',
      loading: 'Loading…', load_failed: 'Could not load. Check the connection and reopen this panel.',
      save: 'Save', saving: 'Saving…', saved: 'Saved · guests see it now.',
      save_failed: 'Could not save ({e}).', conflict: 'Changed from another device. Reloaded: please redo your change.',
      wifi: 'Guest Wi-Fi', wifi_ssid: 'Network name', wifi_pw: 'Password',
      wifi_help: 'Guests copy it in one tap. Leave empty to hide it.',
      review: 'Reviews', review_url: 'Link to your review page', review_help: 'Google, TripAdvisor… An https link. The button also shows after payment.',
      socials: 'Social', socials_help: 'Your handle or the page address.',
      games: 'Games', games_on: 'Offer games to guests', games_help: 'Quizzes, a Memory of your own dishes, Sudoku. A score needs an open table.',
      builtin: 'Add the Kiwi quizzes (Moroccan food, tea and coffee, Morocco)',
      own: 'Your quizzes', own_none: 'No quiz of your own yet.', own_add: 'New quiz',
      quiz_title: 'Quiz title', quiz_q: 'Question {n}', quiz_choice: 'Answer {n}', quiz_right: 'Right answer',
      quiz_add_q: 'Add a question', quiz_del_q: 'Remove', quiz_del: 'Delete this quiz', quiz_count: '{n} questions', quiz_count_1: '1 question',
      quiz_help: 'Two to four answers per question. Tick the right one. An incomplete question is dropped.',
      round: 'Room game', round_help: 'Everyone plays the same quiz at the same time. The ranking shows on the room screen.',
      round_quiz: 'Quiz', round_len: 'Length', round_start: 'Start the game', round_stop: 'Stop',
      round_live: 'Live · {q} · ends at {t}', round_need: 'Switch games on and save to start a game.',
      min: '{n} min',
      board: 'This month’s ranking', board_none: 'Nobody yet this month.', hide: 'Hide', unhide: 'Show again',
      hidden: 'Hidden nicknames', hidden_help: 'A hidden nickname leaves the ranking and the room screen.',
      ramadan: 'Ramadan', ramadan_on: 'Show the iftar time and offer “serve at iftar”',
      city: 'City', offset: 'Offset from sunset (minutes)',
      offset_help: 'Compare the time shown below with your mosque’s, and adjust.',
      iftar_today: 'Today, guests see: iftar at {t}.', iftar_after: 'Save to see the computed time.',
      tv: 'Room screen', tv_help: 'Open this link on a TV or tablet: monthly ranking, live game, iftar time.',
      copy: 'Copy link', open: 'Open', copied: 'Link copied',
      preview: 'See a table’s page', off: 'Order Pro is not switched on for this business.',
    },
    ar: {
      title: 'صفحة الزبون', subtitle: 'ما يجده الزبائن عند وضع هاتفهم على البطاقة',
      loading: 'جارٍ التحميل…', load_failed: 'تعذّرت القراءة. تحقق من الاتصال وأعد فتح هذه اللوحة.',
      save: 'حفظ', saving: 'جارٍ الحفظ…', saved: 'تم الحفظ · يراه الزبائن الآن.',
      save_failed: 'تعذّر الحفظ ({e}).', conflict: 'تم التعديل من جهاز آخر. أُعيد التحميل: أعد تعديلك.',
      wifi: 'واي فاي الزبائن', wifi_ssid: 'اسم الشبكة', wifi_pw: 'كلمة المرور',
      wifi_help: 'ينسخها الزبون بلمسة. اتركها فارغة لإخفائها.',
      review: 'التقييمات', review_url: 'رابط صفحة تقييماتك', review_help: 'Google، TripAdvisor… رابط https. يظهر الزر أيضاً بعد الدفع.',
      socials: 'الشبكات', socials_help: 'اسم حسابك أو عنوان الصفحة.',
      games: 'الألعاب', games_on: 'اقتراح الألعاب على الزبائن', games_help: 'مسابقات، لعبة ذاكرة بأطباقك، سودوكو. النتيجة تتطلب طاولة مفتوحة.',
      builtin: 'إضافة مسابقات Kiwi (المطبخ المغربي، الشاي والقهوة، المغرب)',
      own: 'مسابقاتك', own_none: 'لا توجد مسابقة خاصة بك بعد.', own_add: 'مسابقة جديدة',
      quiz_title: 'عنوان المسابقة', quiz_q: 'السؤال {n}', quiz_choice: 'الجواب {n}', quiz_right: 'الجواب الصحيح',
      quiz_add_q: 'إضافة سؤال', quiz_del_q: 'إزالة', quiz_del: 'حذف هذه المسابقة', quiz_count: '{n} أسئلة', quiz_count_1: 'سؤال واحد',
      quiz_help: 'من جوابين إلى أربعة لكل سؤال. حدّد الصحيح. السؤال الناقص لا يُحفظ.',
      round: 'لعبة القاعة', round_help: 'يلعب الجميع نفس المسابقة في نفس الوقت. يظهر الترتيب على شاشة القاعة.',
      round_quiz: 'المسابقة', round_len: 'المدة', round_start: 'بدء اللعبة', round_stop: 'إيقاف',
      round_live: 'جارية · {q} · تنتهي على {t}', round_need: 'فعّل الألعاب واحفظ لبدء لعبة.',
      min: '{n} د',
      board: 'ترتيب هذا الشهر', board_none: 'لا أحد بعد هذا الشهر.', hide: 'إخفاء', unhide: 'إظهار',
      hidden: 'الأسماء المخفية', hidden_help: 'الاسم المخفي يختفي من الترتيب ومن شاشة القاعة.',
      ramadan: 'رمضان', ramadan_on: 'عرض وقت الإفطار واقتراح «التقديم عند الإفطار»',
      city: 'المدينة', offset: 'الفرق مع غروب الشمس (بالدقائق)',
      offset_help: 'قارن الوقت المعروض أدناه بوقت مسجدك، ثم عدّل.',
      iftar_today: 'اليوم، يرى زبائنك: الإفطار على {t}.', iftar_after: 'احفظ لرؤية الوقت المحسوب.',
      tv: 'شاشة القاعة', tv_help: 'افتح هذا الرابط على تلفاز أو لوحة: ترتيب الشهر، اللعبة الجارية، وقت الإفطار.',
      copy: 'نسخ الرابط', open: 'فتح', copied: 'تم نسخ الرابط',
      preview: 'عرض صفحة طاولة', off: 'Order Pro غير مفعّل لهذا المحل.',
    },
  };
  /* Les mêmes clés que le serveur (functions/api/order/_guest.js › CITIES). */
  var CITIES = [['casablanca', 'Casablanca'], ['rabat', 'Rabat'], ['marrakech', 'Marrakech'], ['fes', 'Fès'], ['tanger', 'Tanger'],
    ['agadir', 'Agadir'], ['meknes', 'Meknès'], ['oujda', 'Oujda'], ['kenitra', 'Kénitra'], ['tetouan', 'Tétouan'],
    ['eljadida', 'El Jadida'], ['essaouira', 'Essaouira'], ['safi', 'Safi'], ['benimellal', 'Béni Mellal'], ['nador', 'Nador'],
    ['ouarzazate', 'Ouarzazate'], ['laayoune', 'Laâyoune'], ['dakhla', 'Dakhla']];
  var ROUND_MINUTES = [10, 15, 20, 30, 45];
  var MAX_QUIZZES = 12, MAX_QUESTIONS = 20;

  function lang() { try { var l = localStorage.getItem('kiwiLang'); return STR[l] ? l : 'fr'; } catch (_) { return 'fr'; } }
  function tr(k, map) {
    var s = (STR[lang()] && STR[lang()][k]) || STR.fr[k] || k;
    return String(s).replace(/\{(\w+)\}/g, function (_, x) { return map && map[x] != null ? map[x] : ''; });
  }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function merchant() { try { return (window.KiwiOrderPro && window.KiwiOrderPro.merchant()) || ''; } catch (_) { return ''; } }
  function enabled() { try { return !!(window.KiwiConfig && window.KiwiConfig.features && window.KiwiConfig.features.orderpro === true); } catch (_) { return false; } }
  function q() { return 'merchant=' + encodeURIComponent(merchant()); }
  function tvLink() { return location.origin + '/order-tv.html?s=' + encodeURIComponent(merchant()) + (lang() === 'fr' ? '' : '&lang=' + lang()); }
  /* Le même calcul que le serveur (functions/api/order/_guest.js › nickKey). */
  function nickKey(v) {
    return String(v == null ? '' : v).normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40);
  }
  function clock(ts, zone) {
    try { return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'fr-FR', { timeZone: zone || 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); }
    catch (_) { return ''; }
  }

  async function getJSON(url) {
    try {
      var r = await fetch(url, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      var j = await r.json().catch(function () { return null; });
      return r.ok ? j : Object.assign({ ok: false, status: r.status }, j || {});
    } catch (_) { return null; }
  }

  /* ── L'état du panneau ───────────────────────────────────────────────── */
  function blankDoc() {
    return { wifi: { ssid: '', password: '' }, review: { url: '' }, socials: { instagram: '', facebook: '', tiktok: '' },
      games: { on: false, builtin: true, quizzes: [], hidden: [], round: null }, ramadan: { on: false, city: 'casablanca', offset: 5 } };
  }
  function normalize(d) {
    var b = blankDoc();
    d = d && typeof d === 'object' ? d : {};
    ['wifi', 'review', 'socials', 'ramadan'].forEach(function (k) { if (d[k] && typeof d[k] === 'object') Object.assign(b[k], d[k]); });
    if (d.games && typeof d.games === 'object') Object.assign(b.games, d.games);
    b.games.quizzes = Array.isArray(b.games.quizzes) ? b.games.quizzes.map(function (x) {
      return { id: String(x.id || ''), title: String(x.title || ''), questions: (x.questions || []).map(function (y) {
        return { q: String(y.q || ''), choices: (y.choices || []).slice(0, 4).map(String), answer: Number(y.answer) || 0 };
      }) };
    }) : [];
    b.games.hidden = Array.isArray(b.games.hidden) ? b.games.hidden.slice() : [];
    return b;
  }
  var S = null;   // { doc, rev, pub, board, el, busy, openQuiz }

  async function readAll() {
    var res = await getJSON('/api/store?feature=guestpage&' + q());
    if (!res || res.ok === false) return false;
    S.doc = normalize(res.data);
    S.rev = Number(res.rev) || 0;
    await readPublic();
    return true;
  }
  /* Ce que voit un client, et donc l'heure du ftour réellement affichée. */
  async function readPublic() {
    var g = await getJSON('/api/order/guest?' + q() + '&lang=' + lang());
    S.pub = g && g.ok ? g : null;
    S.board = [];
    if (S.doc.games.on) {
      var b = await getJSON('/api/order/game?' + q() + '&board=month');
      S.board = b && b.ok ? (b.board || []) : [];
    }
  }

  /* Lit le formulaire dans S.doc (le formulaire est la vérité tant qu'il est ouvert). */
  function collect() {
    var el = S.el, d = S.doc;
    var v = function (sel) { var x = el.querySelector(sel); return x ? x.value : ''; };
    var c = function (sel) { var x = el.querySelector(sel); return !!(x && x.checked); };
    d.wifi.ssid = v('[data-g="ssid"]').trim();
    d.wifi.password = v('[data-g="pw"]').trim();
    d.review.url = v('[data-g="review"]').trim();
    d.socials.instagram = v('[data-g="instagram"]').trim();
    d.socials.facebook = v('[data-g="facebook"]').trim();
    d.socials.tiktok = v('[data-g="tiktok"]').trim();
    d.games.on = c('[data-g="games"]');
    d.games.builtin = c('[data-g="builtin"]');
    d.ramadan.on = c('[data-g="ramadan"]');
    d.ramadan.city = v('[data-g="city"]') || 'casablanca';
    var off = Math.round(Number(v('[data-g="offset"]')));
    d.ramadan.offset = Number.isFinite(off) ? Math.max(-30, Math.min(30, off)) : 5;
    el.querySelectorAll('[data-quiz]').forEach(function (box) {
      var quiz = d.games.quizzes[Number(box.dataset.quiz)];
      if (!quiz) return;
      var title = box.querySelector('[data-qt]');
      if (title) quiz.title = title.value.trim();
      box.querySelectorAll('[data-qq]').forEach(function (qb) {
        var qi = Number(qb.dataset.qq), item = quiz.questions[qi];
        if (!item) return;
        item.q = qb.querySelector('[data-qtext]').value.trim();
        item.choices = [].map.call(qb.querySelectorAll('[data-qc]'), function (i) { return i.value.trim(); });
        var right = qb.querySelector('[data-qr]:checked');
        item.answer = right ? Number(right.value) : 0;
      });
    });
  }
  /* Ce qui part au serveur : les réponses vides tombent, la bonne réponse
   * suit sa place. Le serveur refait le tri de toute façon. */
  function outgoing() {
    var d = JSON.parse(JSON.stringify(S.doc));
    d.games.quizzes = d.games.quizzes.map(function (quiz) {
      return { id: quiz.id, title: quiz.title, questions: quiz.questions.map(function (item) {
        var keep = [], answer = -1;
        item.choices.forEach(function (ch, i) { if (ch) { if (i === item.answer) answer = keep.length; keep.push(ch); } });
        return { q: item.q, choices: keep, answer: answer };
      }).filter(function (item) { return item.q && item.choices.length >= 2 && item.answer >= 0; }) };
    }).filter(function (quiz) { return quiz.title && quiz.questions.length; });
    return d;
  }

  async function save(note) {
    if (S.busy) return false;
    S.busy = true;
    say(tr('saving'));
    var out = outgoing();
    var r = null, j = null;
    try {
      r = await fetch('/api/store', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ feature: 'guestpage', merchant: merchant(), data: out, baseRev: S.rev }) });
      j = await r.json().catch(function () { return null; });
    } catch (_) { r = null; }
    S.busy = false;
    if (r && r.status === 409 && j && j.error === 'stale') {
      await readAll();
      render();
      say(tr('conflict'), true);
      return false;
    }
    if (!r || !r.ok || !j || j.ok === false) { say(tr('save_failed', { e: (j && j.error) || (r ? 'http-' + r.status : 'network') }), true); return false; }
    S.rev = Number(j.rev) || S.rev + 1;
    S.doc = normalize(out);
    await readPublic();
    render();
    say(note || tr('saved'));
    return true;
  }

  function say(text, bad) {
    var m = S && S.el && S.el.querySelector('[data-g-msg]');
    if (!m) return;
    m.textContent = text;
    m.classList.toggle('is-bad', !!bad);
  }

  /* ── Le rendu ────────────────────────────────────────────────────────── */
  function field(label, key, value, opts) {
    opts = opts || {};
    return '<div class="kf-group"><label class="kf-label" for="ogp-' + key + '">' + esc(label) + '</label>'
      + '<input class="kf-input" id="ogp-' + key + '" data-g="' + key + '" value="' + esc(value) + '"'
      + (opts.type ? ' type="' + opts.type + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '')
      + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.dir ? ' dir="' + opts.dir + '"' : '') + ' /></div>';
  }
  function check(label, key, on) {
    return '<label class="ogp-check"><input type="checkbox" data-g="' + key + '"' + (on ? ' checked' : '') + ' /><span>' + esc(label) + '</span></label>';
  }
  function section(title, help, inner) {
    return '<section class="ogp-sec"><h4>' + esc(title) + '</h4>' + (help ? '<p class="kf-help">' + esc(help) + '</p>' : '') + inner + '</section>';
  }

  function quizHtml(quiz, i) {
    var n = quiz.questions.length;
    var open = S.openQuiz === i;
    var qs = quiz.questions.map(function (item, qi) {
      var choices = [0, 1, 2, 3].map(function (k) {
        return '<div class="ogp-choice"><input type="radio" name="ogp-r-' + i + '-' + qi + '" data-qr value="' + k + '"' + (item.answer === k ? ' checked' : '')
          + ' aria-label="' + esc(tr('quiz_right')) + '" /><input class="kf-input" data-qc maxlength="80" placeholder="' + esc(tr('quiz_choice', { n: k + 1 })) + '" value="' + esc(item.choices[k] || '') + '" /></div>';
      }).join('');
      return '<div class="ogp-q" data-qq="' + qi + '"><div class="ogp-qhead"><b>' + esc(tr('quiz_q', { n: qi + 1 })) + '</b>'
        + '<button class="kb ghost" type="button" data-g-delq="' + i + ':' + qi + '">' + esc(tr('quiz_del_q')) + '</button></div>'
        + '<input class="kf-input" data-qtext maxlength="200" value="' + esc(item.q) + '" />' + choices + '</div>';
    }).join('');
    return '<details class="ogp-quiz" data-quiz="' + i + '"' + (open ? ' open' : '') + '><summary><b>' + esc(quiz.title || tr('own_add')) + '</b><span>'
      + esc(n === 1 ? tr('quiz_count_1') : tr('quiz_count', { n: n })) + '</span></summary>'
      + '<div class="ogp-quiz-body"><div class="kf-group"><label class="kf-label">' + esc(tr('quiz_title')) + '</label><input class="kf-input" data-qt maxlength="80" value="' + esc(quiz.title) + '" /></div>'
      + '<p class="kf-help">' + esc(tr('quiz_help')) + '</p>' + qs
      + '<div class="ogp-actions">' + (n < MAX_QUESTIONS ? '<button class="kb ghost" type="button" data-g-addq="' + i + '">' + esc(tr('quiz_add_q')) + '</button>' : '')
      + '<button class="kb ghost ogp-danger" type="button" data-g-delquiz="' + i + '">' + esc(tr('quiz_del')) + '</button></div></div></details>';
  }

  function roundHtml() {
    var d = S.doc, pub = S.pub, now = Date.now();
    var games = pub && pub.guest && pub.guest.games;
    if (!d.games.on || !games) return '<p class="kf-help">' + esc(tr('round_need')) + '</p>';
    var r = d.games.round && d.games.round.endTs > now ? d.games.round : null;
    if (r) {
      var qz = (games.quizzes || []).find(function (x) { return x.id === r.quizId; });
      return '<div class="ogp-live"><span>' + esc(tr('round_live', { q: qz ? qz.title : r.quizId, t: clock(r.endTs, pub.zone) })) + '</span>'
        + '<button class="kb ghost" type="button" data-g-stop>' + esc(tr('round_stop')) + '</button></div>';
    }
    return '<div class="kf-row ogp-round"><div class="kf-group"><label class="kf-label">' + esc(tr('round_quiz')) + '</label><select class="kf-input" data-g-rquiz>'
      + (games.quizzes || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.title) + '</option>'; }).join('') + '</select></div>'
      + '<div class="kf-group"><label class="kf-label">' + esc(tr('round_len')) + '</label><select class="kf-input" data-g-rlen>'
      + ROUND_MINUTES.map(function (m) { return '<option value="' + m + '"' + (m === 15 ? ' selected' : '') + '>' + esc(tr('min', { n: m })) + '</option>'; }).join('') + '</select></div></div>'
      + '<button class="kb atlas" type="button" data-g-start' + ((games.quizzes || []).length ? '' : ' disabled') + '>' + esc(tr('round_start')) + '</button>';
  }

  function boardHtml() {
    var rows = S.board.length ? S.board.map(function (r, i) {
      return '<div class="ogp-brow"><span class="ogp-rank">' + (i + 1) + '</span><b>' + esc(r.nick) + '</b><span class="ogp-score">' + esc(r.score) + '</span>'
        + '<button class="kb ghost" type="button" data-g-hide="' + esc(r.nick) + '">' + esc(tr('hide')) + '</button></div>';
    }).join('') : '<p class="kf-help">' + esc(tr('board_none')) + '</p>';
    var chips = S.doc.games.hidden.length ? '<div class="kf-label ogp-sub">' + esc(tr('hidden')) + '</div><div class="ogp-chips">'
      + S.doc.games.hidden.map(function (h, i) { return '<button class="ogp-chip" type="button" data-g-unhide="' + i + '">' + esc(h) + '<span>' + esc(tr('unhide')) + '</span></button>'; }).join('')
      + '</div><p class="kf-help">' + esc(tr('hidden_help')) + '</p>' : '';
    return rows + chips;
  }

  function bodyHtml() {
    var d = S.doc, pub = S.pub;
    var iftar = pub && pub.ramadan && pub.ramadan.today;
    var games = section(tr('games'), tr('games_help'),
      check(tr('games_on'), 'games', d.games.on) + check(tr('builtin'), 'builtin', d.games.builtin)
      + '<div class="kf-label ogp-sub">' + esc(tr('own')) + '</div>'
      + (d.games.quizzes.length ? d.games.quizzes.map(quizHtml).join('') : '<p class="kf-help">' + esc(tr('own_none')) + '</p>')
      + (d.games.quizzes.length < MAX_QUIZZES ? '<button class="kb ghost" type="button" data-g-addquiz>' + esc(tr('own_add')) + '</button>' : ''));
    return '<div class="ogp" dir="' + (lang() === 'ar' ? 'rtl' : 'ltr') + '">'
      + section(tr('wifi'), tr('wifi_help'), '<div class="kf-row">' + field(tr('wifi_ssid'), 'ssid', d.wifi.ssid, { max: 64, dir: 'ltr' }) + field(tr('wifi_pw'), 'pw', d.wifi.password, { max: 64, dir: 'ltr' }) + '</div>')
      + section(tr('review'), tr('review_help'), field(tr('review_url'), 'review', d.review.url, { type: 'url', ph: 'https://g.page/r/…', dir: 'ltr' }))
      + section(tr('socials'), tr('socials_help'), '<div class="kf-row ogp-three">' + field('Instagram', 'instagram', d.socials.instagram, { dir: 'ltr', ph: '@' })
        + field('Facebook', 'facebook', d.socials.facebook, { dir: 'ltr' }) + field('TikTok', 'tiktok', d.socials.tiktok, { dir: 'ltr', ph: '@' }) + '</div>')
      + games
      + section(tr('round'), tr('round_help'), roundHtml())
      + (d.games.on ? section(tr('board'), '', boardHtml()) : '')
      + section(tr('ramadan'), '', check(tr('ramadan_on'), 'ramadan', d.ramadan.on)
        + '<div class="kf-row"><div class="kf-group"><label class="kf-label" for="ogp-city">' + esc(tr('city')) + '</label><select class="kf-input" id="ogp-city" data-g="city">'
        + CITIES.map(function (c) { return '<option value="' + c[0] + '"' + (d.ramadan.city === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select></div>'
        + field(tr('offset'), 'offset', d.ramadan.offset, { type: 'number' }) + '</div>'
        + '<p class="kf-help">' + esc(tr('offset_help')) + '</p>'
        + (d.ramadan.on ? '<p class="ogp-iftar">' + esc(iftar ? tr('iftar_today', { t: clock(iftar, pub.zone) }) : tr('iftar_after')) + '</p>' : ''))
      + section(tr('tv'), tr('tv_help'), '<code class="ogp-code">' + esc(tvLink()) + '</code><div class="ogp-actions">'
        + '<button class="kb ghost" type="button" data-g-copy="' + esc(tvLink()) + '">' + esc(tr('copy')) + '</button>'
        + '<a class="kb ghost" href="' + esc(tvLink()) + '" target="_blank" rel="noopener">' + esc(tr('open')) + '</a></div>')
      + '</div>';
  }

  function render() {
    if (!S || !S.el) return;
    var body = S.el.querySelector('.kiwi-drawer-body');
    if (!body) return;
    var keepScroll = body.scrollTop;
    body.innerHTML = bodyHtml();
    body.scrollTop = keepScroll;
  }

  function css() {
    if (document.getElementById('ogp-css')) return;
    var s = document.createElement('style');
    s.id = 'ogp-css';
    s.textContent = [
      '.ogp-sec{padding:0 0 18px;margin:0 0 18px;border-bottom:1px solid var(--n-200,#e4e0d7)}',
      '.ogp-sec:last-child{border-bottom:0;margin-bottom:0}',
      '.ogp-sec h4{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-.01em}',
      '.ogp-sec>.kf-help{margin:0 0 12px}',
      '.ogp-three{grid-template-columns:repeat(3,minmax(0,1fr))}',
      '.ogp-check{display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;font-size:13.5px;line-height:1.45;cursor:pointer}',
      '.ogp-check input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--atlas,#0B6E4F);flex:none}',
      '.ogp-sub{margin:14px 0 8px}',
      '.ogp-quiz{border:1px solid var(--n-200,#e4e0d7);border-radius:12px;margin:0 0 8px;background:var(--paper-soft,#F7F5F0)}',
      '.ogp-quiz summary{display:flex;justify-content:space-between;gap:10px;padding:11px 13px;cursor:pointer;font-size:13.5px;list-style:none}',
      '.ogp-quiz summary::-webkit-details-marker{display:none}',
      '.ogp-quiz summary span{color:var(--n-500,#6c766e);font-size:12px}',
      '.ogp-quiz-body{padding:0 13px 13px}',
      '.ogp-q{border-top:1px solid var(--n-200,#e4e0d7);padding:10px 0 4px}',
      '.ogp-qhead{display:flex;justify-content:space-between;align-items:center;margin:0 0 6px;font-size:12.5px}',
      '.ogp-qhead .kb{padding:5px 10px;font-size:11.5px}',
      '.ogp-choice{display:flex;gap:8px;align-items:center;margin:6px 0 0}',
      '.ogp-choice input[type=radio]{width:17px;height:17px;flex:none;accent-color:var(--atlas,#0B6E4F)}',
      '.ogp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
      '.ogp-actions .kb{padding:9px 13px;font-size:12.5px;text-decoration:none}',
      '.ogp-danger{color:var(--danger,#B42318)}',
      '.ogp-live{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border-radius:12px;background:var(--paper-soft,#F7F5F0);border:1px solid var(--atlas,#0B6E4F);font-size:13.5px;font-weight:550}',
      '.ogp-round{margin-bottom:10px}',
      '.ogp-brow{display:grid;grid-template-columns:24px 1fr auto auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--n-200,#e4e0d7);font-size:13.5px}',
      '.ogp-brow .kb{padding:5px 10px;font-size:11.5px}',
      '.ogp-rank,.ogp-score{font-family:var(--mono,ui-monospace);font-size:12.5px;color:var(--n-500,#6c766e)}',
      '.ogp-score{color:var(--ink,#0A0F0D)}',
      '.ogp-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.ogp-chip{display:inline-flex;gap:8px;align-items:center;padding:6px 11px;border-radius:999px;border:1px solid var(--n-200,#e4e0d7);background:var(--paper-soft,#F7F5F0);font:inherit;font-size:12.5px;color:inherit;cursor:pointer}',
      '.ogp-chip span{color:var(--atlas,#0B6E4F);font-weight:600}',
      '.ogp-iftar{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:var(--paper-soft,#F7F5F0);font-size:13.5px;font-weight:550}',
      '.ogp-code{display:block;font-family:var(--mono,ui-monospace);font-size:11.5px;color:var(--n-500,#6c766e);word-break:break-all}',
      '.ogp-msg{font-size:12.5px;color:var(--n-500,#6c766e);flex:1;min-width:0}',
      '.ogp-msg.is-bad{color:var(--danger,#B42318)}',
      '.ogp-foot{display:flex;align-items:center;gap:12px;width:100%}',
      '@media (max-width:560px){.ogp-three{grid-template-columns:1fr}}',
    ].join('');
    document.head.appendChild(s);
  }

  function bind() {
    S.el.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-g-save]')) { collect(); save(); return; }
      if (t.closest('[data-g-addquiz]')) {
        collect();
        S.doc.games.quizzes.push({ id: 'q' + Date.now().toString(36), title: '', questions: [{ q: '', choices: ['', '', '', ''], answer: 0 }] });
        S.openQuiz = S.doc.games.quizzes.length - 1;
        render();
        return;
      }
      var addq = t.closest('[data-g-addq]');
      if (addq) {
        collect();
        var qz = S.doc.games.quizzes[Number(addq.dataset.gAddq)];
        if (qz && qz.questions.length < MAX_QUESTIONS) qz.questions.push({ q: '', choices: ['', '', '', ''], answer: 0 });
        S.openQuiz = Number(addq.dataset.gAddq);
        render();
        return;
      }
      var delq = t.closest('[data-g-delq]');
      if (delq) {
        collect();
        var p = delq.dataset.gDelq.split(':').map(Number);
        var qz2 = S.doc.games.quizzes[p[0]];
        if (qz2) qz2.questions.splice(p[1], 1);
        S.openQuiz = p[0];
        render();
        return;
      }
      var delquiz = t.closest('[data-g-delquiz]');
      if (delquiz) {
        collect();
        S.doc.games.quizzes.splice(Number(delquiz.dataset.gDelquiz), 1);
        S.openQuiz = -1;
        render();
        return;
      }
      if (t.closest('[data-g-start]')) {
        collect();
        var quizSel = S.el.querySelector('[data-g-rquiz]'), lenSel = S.el.querySelector('[data-g-rlen]');
        if (!quizSel || !quizSel.value) return;
        var now = Date.now(), len = Math.max(5, Math.min(180, Number(lenSel && lenSel.value) || 15));
        S.doc.games.round = { id: 'r' + now.toString(36), quizId: quizSel.value, startTs: now, endTs: now + len * 60000 };
        save();
        return;
      }
      if (t.closest('[data-g-stop]')) { collect(); S.doc.games.round = null; save(); return; }
      var hide = t.closest('[data-g-hide]');
      if (hide) {
        collect();
        var nick = hide.dataset.gHide;
        if (!S.doc.games.hidden.some(function (h) { return nickKey(h) === nickKey(nick); })) S.doc.games.hidden.push(nick);
        save();
        return;
      }
      var unhide = t.closest('[data-g-unhide]');
      if (unhide) { collect(); S.doc.games.hidden.splice(Number(unhide.dataset.gUnhide), 1); save(); return; }
      var cp = t.closest('[data-g-copy]');
      if (cp) {
        var text = cp.dataset.gCopy;
        try { navigator.clipboard.writeText(text).then(function () { say(tr('copied')); }, function () { say(text); }); }
        catch (_) { say(text); }
      }
    });
    /* La bonne réponse se coche, la question garde sa place : rien à refaire. */
    S.el.addEventListener('toggle', function (e) {
      var box = e.target.closest && e.target.closest('[data-quiz]');
      if (box && box.open) S.openQuiz = Number(box.dataset.quiz);
    }, true);
  }

  async function open() {
    var Kw = window.Kiwi;
    if (!Kw || !Kw.drawer || !merchant()) return;
    css();
    var d = Kw.drawer({
      title: tr('title'), subtitle: tr('subtitle'), width: 600,
      body: '<p class="kf-help">' + esc(enabled() ? tr('loading') : tr('off')) + '</p>',
      foot: '<div class="ogp-foot"><span class="ogp-msg" data-g-msg role="status" aria-live="polite"></span><button class="kb atlas" type="button" data-g-save>' + esc(tr('save')) + '</button></div>',
    });
    S = { doc: blankDoc(), rev: 0, pub: null, board: [], el: d && d.el, busy: false, openQuiz: -1 };
    if (!S.el) return;
    bind();
    if (!(await readAll())) {
      var body = S.el.querySelector('.kiwi-drawer-body');
      if (body) body.innerHTML = '<p class="kf-help">' + esc(tr('load_failed')) + '</p>';
      var btn = S.el.querySelector('[data-g-save]');
      if (btn) btn.disabled = true;
      return;
    }
    render();
  }

  function register() {
    var Kw = window.Kiwi;
    if (!Kw || !Kw.handlers) return;
    Kw.handlers['orderpro-guestpage'] = open;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register);
  else register();

  window.KiwiGuestPageEditor = { open: open, _test: { normalize: normalize, outgoing: function (doc) { var keep = S; S = { doc: normalize(doc) }; var o = outgoing(); S = keep; return o; }, nickKey: nickKey, STR: STR } };
})();
