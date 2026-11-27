/* /carte : la carte de fidélité d'un commerce, côté client.
 *   /carte/<boutique>              s'inscrire (présentoir du comptoir)
 *   /carte/<boutique>?r=<vente>    idem, et le ticket crédite son passage
 *   /carte/<boutique>?t=<jeton>    la caisse remet sa carte à un client connu
 *   /carte/<boutique>/<carte>?t=…  la carte web, vivante (téléphones sans Wallet)
 * Les routes : functions/api/wallet/enroll.js et card.js. Toute écriture visible
 * passe par t(clé) : la page parle français, anglais ou arabe selon le téléphone. */
(function () {
  'use strict';
  var T = {
    fr: {
      title: 'Votre carte fidélité', intro: 'La carte se range dans votre téléphone et se met à jour toute seule.',
      offerVisit: '{reward} au bout de {n} passages.', offerProduct: '{reward} au bout de {n} × {item}.', offerAmount: '{reward} dès {n} points.',
      earn: '{p} point par dirham dépensé.', earnFrac: '1 point tous les {d} dirhams dépensés.', rewardAny: 'Une récompense',
      readyPts: 'Ajoutez-la à votre téléphone : vos points arriveront dessus après chaque achat.',
      receiptOkPts: 'Ce ticket ajoute ses points à votre carte.', creditedPts: 'Points ajoutés. Votre carte se met à jour toute seule.',
      consentReq: 'Cochez la case pour recevoir votre carte.', claimLimit: 'Ce numéro a déjà ajouté deux tickets aujourd’hui. Revenez demain.',
      wa: 'Recevoir le lien sur WhatsApp', waText: 'Ma carte fidélité {shop} : ', mine: 'Votre carte', notMe: 'Ce n’est pas moi',
      first: 'Prénom', phone: 'Téléphone', consent: "J'accepte que {shop} garde mon prénom et mon numéro pour ma carte fidélité.",
      cta: 'Recevoir ma carte', apple: 'Ajouter à Apple Wallet', google: 'Ajouter à Google Wallet', web: 'Garder ma carte ici', open: 'Ouvrir ma carte',
      ready: 'Votre carte est prête', readyP: 'Ajoutez-la à votre téléphone : vos tampons arriveront dessus après chaque passage.',
      exists: 'Ce numéro a déjà une carte chez {shop}. Demandez-la en caisse : on vous la montre en un instant.',
      receiptOk: 'Ce ticket vaut un tampon sur votre carte.', receiptUsed: 'Ce ticket a déjà été ajouté à une carte.',
      receiptBad: "Ce ticket ne peut plus être ajouté (plus de deux jours, ou annulé). Votre carte, elle, vous attend.",
      credited: 'Tampon ajouté. Votre carte se met à jour toute seule.',
      show: 'Montrez ce code en caisse', home: "Pour la garder : bouton Partager, puis « Sur l'écran d'accueil ».",
      client: 'Client', stamps: 'Tampons', points: 'Points', reward: 'Récompense', left: 'Il reste', readyShort: 'Prête', gift: 'Offerte',
      stampsN: '{n} tampons', pointsN: '{n} points', badPhone: 'Entrez un numéro valide, par exemple 06 12 34 56 78.', nameReq: 'Entrez votre prénom.',
      busy: 'Trop d’essais. Réessayez dans un moment.', error: 'Connexion impossible. Réessayez.', none: "Ce commerce n'a pas de carte fidélité ici.",
      expired: 'Ce code a expiré. Demandez-en un nouveau en caisse.', foot: 'Carte gérée par Kiwi', taking: 'Un instant…',
    },
    en: {
      title: 'Your loyalty card', intro: 'The card lives in your phone and updates itself.',
      offerVisit: '{reward} after {n} visits.', offerProduct: '{reward} after {n} × {item}.', offerAmount: '{reward} at {n} points.',
      earn: '{p} point per dirham spent.', earnFrac: '1 point for every {d} dirhams spent.', rewardAny: 'A reward',
      readyPts: 'Add it to your phone: your points land on it after every purchase.',
      receiptOkPts: 'This receipt adds its points to your card.', creditedPts: 'Points added. Your card updates itself.',
      consentReq: 'Tick the box to get your card.', claimLimit: 'This number already added two receipts today. Come back tomorrow.',
      wa: 'Send me the link on WhatsApp', waText: 'My {shop} loyalty card: ', mine: 'Your card', notMe: 'Not me',
      first: 'First name', phone: 'Phone', consent: 'I agree that {shop} keeps my first name and number for my loyalty card.',
      cta: 'Get my card', apple: 'Add to Apple Wallet', google: 'Add to Google Wallet', web: 'Keep my card here', open: 'Open my card',
      ready: 'Your card is ready', readyP: 'Add it to your phone: your stamps land on it after every visit.',
      exists: 'This number already has a card at {shop}. Ask at the till and they will show it to you.',
      receiptOk: 'This receipt is worth one stamp on your card.', receiptUsed: 'This receipt was already added to a card.',
      receiptBad: 'This receipt can no longer be added (over two days old, or cancelled). Your card is still waiting for you.',
      credited: 'Stamp added. Your card updates itself.',
      show: 'Show this code at the till', home: 'To keep it: Share button, then “Add to Home Screen”.',
      client: 'Customer', stamps: 'Stamps', points: 'Points', reward: 'Reward', left: 'To go', readyShort: 'Ready', gift: 'Free',
      stampsN: '{n} stamps', pointsN: '{n} points', badPhone: 'Enter a valid number, for example 06 12 34 56 78.', nameReq: 'Enter your first name.',
      busy: 'Too many tries. Try again in a moment.', error: 'Could not connect. Try again.', none: 'This shop has no loyalty card here.',
      expired: 'This code has expired. Ask for a new one at the till.', foot: 'Card run by Kiwi', taking: 'One moment…',
    },
    ar: {
      title: 'بطاقة الوفاء ديالك', intro: 'البطاقة كتبقى فتيليفونك وكتتجدد بوحدها.',
      offerVisit: '{reward} من بعد {n} زيارات.', offerProduct: '{reward} من بعد {n} × {item}.', offerAmount: '{reward} ملي توصل {n} نقطة.',
      earn: '{p} نقطة على كل درهم.', earnFrac: 'نقطة على كل {d} دراهم.', rewardAny: 'هدية',
      readyPts: 'زيدها لتيليفونك: النقاط غادي توصلها مع كل شرية.',
      receiptOkPts: 'هاد التيكي كيزيد النقاط ديالو فالبطاقة ديالك.', creditedPts: 'تزادو النقاط. البطاقة ديالك كتتجدد بوحدها.',
      consentReq: 'علّم على الخانة باش تاخد البطاقة ديالك.', claimLimit: 'هاد الرقم زاد جوج تيكيات اليوم. رجع غدا.',
      wa: 'صيفط ليا الرابط فواتساب', waText: 'بطاقة الوفاء ديالي عند {shop}: ', mine: 'البطاقة ديالك', notMe: 'ماشي أنا',
      first: 'الاسم', phone: 'رقم الهاتف', consent: 'كنوافق باش {shop} يحتافظ باسمي ورقمي من أجل بطاقة الوفاء.',
      cta: 'خذ البطاقة ديالي', apple: 'زيدها لـ Apple Wallet', google: 'زيدها لـ Google Wallet', web: 'خلّي البطاقة هنا', open: 'حلّ البطاقة ديالي',
      ready: 'البطاقة ديالك واجدة', readyP: 'زيدها لتيليفونك: الأختام غادي توصلها مع كل زيارة.',
      exists: 'هاد الرقم عندو بطاقة من قبل عند {shop}. طلبها فالكاشة، يوريوها ليك فلحظة.',
      receiptOk: 'هاد التيكي كيعطيك ختم فالبطاقة ديالك.', receiptUsed: 'هاد التيكي تزاد لبطاقة من قبل.',
      receiptBad: 'هاد التيكي ما بقاش ممكن يتزاد (فاتو عليه جوج أيام ولا تلغى). ولكن البطاقة ديالك كتسناك.',
      credited: 'تزاد الختم. البطاقة ديالك كتتجدد بوحدها.',
      show: 'وري هاد الرمز فالكاشة', home: 'باش تحتافظ بيها: زر المشاركة، من بعد «إضافة إلى الشاشة الرئيسية».',
      client: 'الزبون', stamps: 'الأختام', points: 'النقاط', reward: 'الهدية', left: 'باقي', readyShort: 'واجدة', gift: 'فابور',
      stampsN: '{n} أختام', pointsN: '{n} نقطة', badPhone: 'دخّل رقم صحيح، بحال 06 12 34 56 78.', nameReq: 'دخّل الاسم ديالك.',
      busy: 'بزاف ديال المحاولات. عاود من بعد شوية.', error: 'ما قدرناش نتاصلو. عاود مرة أخرى.', none: 'هاد المحل ما عندوش بطاقة الوفاء هنا.',
      expired: 'هاد الرمز سالا. طلب واحد جديد فالكاشة.', foot: 'بطاقة كيسيّرها Kiwi', taking: 'لحظة…',
    },
  };
  var qs = new URLSearchParams(location.search);
  var lang = (qs.get('lang') || (navigator.language || 'fr')).slice(0, 2).toLowerCase();
  if (!T[lang]) lang = 'fr';
  document.documentElement.lang = lang;
  if (lang === 'ar') document.documentElement.dir = 'rtl';
  var shopName = '';
  function t(key, vars) {
    var s = T[lang][key] || T.fr[key] || key;
    vars = vars || {};
    if (vars.shop == null) vars.shop = shopName;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? '' : String(vars[k]); });
  }
  /* What the customer wins and how, in one line: the card sells the reward. */
  function offerLine(v) {
    var reward = v.rewardLabel || t('rewardAny');
    if (v.model === 'amount') {
      var per = Number(v.perMad) || 1, earn = per >= 1 ? t('earn', { p: Math.round(per * 100) / 100 }) : t('earnFrac', { d: Math.round(1 / per) });
      return t('offerAmount', { reward: reward, n: v.target }) + ' ' + earn;
    }
    if (v.model === 'product' && v.item) return t('offerProduct', { reward: reward, n: v.target, item: v.item });
    return t('offerVisit', { reward: reward, n: v.target });
  }
  var pts = function (v) { return v && v.model === 'amount'; };
  /* The card the customer just took, kept on this phone: a reload or a second
     visit to the stand shows it again instead of "this number already has a card". */
  var KEY = 'kiwiCarte:';
  function remember(slug, data) { try { localStorage.setItem(KEY + slug, JSON.stringify(data)); } catch (_) {} }
  function recall(slug) { try { return JSON.parse(localStorage.getItem(KEY + slug) || 'null'); } catch (_) { return null; } }
  function forget(slug) { try { localStorage.removeItem(KEY + slug); } catch (_) {} }
  var $ = function (id) { return document.getElementById(id); };
  var parts = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);   /* ['carte', shop, card?] */
  var slug = (parts[1] || qs.get('s') || '').toLowerCase(), serial = parts[2] || qs.get('c') || '';
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);

  /* ── colours: the shop's two, kept readable (same rule as _card.js) ── */
  function rgb(h) { var n = parseInt(String(h || '').slice(1), 16); return isNaN(n) ? [5, 59, 44] : [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function lum(c) { return c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function css(c) { return 'rgb(' + c.join(',') + ')'; }
  function paintColors(m) {
    var bg = rgb(m.bg), brand = rgb(m.color), dark = lum(bg) < 0.4;
    var fg = dark ? [255, 255, 255] : (contrast(brand, bg) >= 4.5 ? brand : [10, 15, 13]);
    var s = $('wc-card').style;
    s.setProperty('--c-bg', css(bg)); s.setProperty('--c-fg', css(fg));
    s.setProperty('--c-label', css(contrast(brand, bg) >= 3 ? brand : fg));
    s.setProperty('--c-ink', css(contrast(brand, bg) >= 2 ? brand : fg));
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', m.bg);
  }

  /* ── the card ── */
  var shown = -1;
  function paintCard(m, v, opts) {
    opts = opts || {};
    shopName = m.name;
    document.title = m.name + ' · ' + t('title');
    $('wc-shopname').textContent = m.name;
    $('wc-card-name').textContent = m.name;
    $('wc-card').setAttribute('aria-label', t('title') + ' · ' + m.name);
    if (m.logo) { $('wc-card-logo').src = m.logo; $('wc-card-logo').hidden = false; $('wc-card-name').hidden = true; $('wc-shoplogo').src = m.logo; $('wc-shoplogo').hidden = false; }
    paintColors(m);
    $('wc-l-client').textContent = t('client');
    $('wc-l-balance').textContent = t(v.model === 'amount' ? 'points' : 'stamps');
    $('wc-l-reward').textContent = t('reward');
    $('wc-l-left').textContent = t('left');
    $('wc-first').textContent = v.firstName || '';
    $('wc-l-client').hidden = !v.firstName;
    var balance = Math.min(v.balance || 0, v.target);
    $('wc-balance').textContent = v.model === 'amount' ? String(v.balance || 0) : balance + ' / ' + v.target;
    $('wc-reward').textContent = v.rewardLabel || t('gift');
    $('wc-left').textContent = v.ready ? t('readyShort') : t(v.model === 'amount' ? 'pointsN' : 'stampsN', { n: Math.max(0, v.target - (v.balance || 0)) });
    var box = $('wc-stamps');
    box.textContent = '';
    if (v.model === 'amount') {
      var bar = document.createElement('div'); bar.className = 'wc-bar';
      var fill = document.createElement('span'); fill.style.setProperty('--fill', Math.min(100, Math.round(100 * (v.balance || 0) / v.target)) + '%');
      bar.appendChild(fill); box.appendChild(bar);
    } else {
      box.style.setProperty('--per-row', v.target <= 6 ? v.target : Math.ceil(v.target / 2));
      for (var i = 0; i < v.target; i++) {
        var d = document.createElement('span');
        d.className = 'wc-stamp' + (i < balance ? ' is-on' : '') + (i === v.target - 1 ? ' is-reward' : '') + (shown >= 0 && i >= shown && i < balance ? ' is-new' : '');
        d.style.setProperty('--i', i - Math.max(0, shown));
        box.appendChild(d);
      }
    }
    if (shown >= 0 && balance > shown) { var c = $('wc-card'); c.classList.remove('is-credited'); void c.offsetWidth; c.classList.add('is-credited'); }
    shown = balance;
    $('wc-card').classList.remove('is-loading');
    if (opts.qr && window.KiwiQR) {
      $('wc-qr').innerHTML = window.KiwiQR.svg(opts.qr, { size: 168, margin: 2, ecl: 'M', dark: '#0A0F0D', light: '#FFFFFF' });
      var cap = document.createElement('div'); cap.className = 'wc-qr-cap'; cap.textContent = t('show');
      $('wc-qr').appendChild(cap); $('wc-qr').hidden = false;
    }
  }

  /* A card you can almost pick up: it leans toward the finger or the tilt. */
  (function tilt() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var card = $('wc-card');
    function lean(x, y) { card.style.setProperty('--ry', (x * 7).toFixed(2) + 'deg'); card.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg'); }
    card.addEventListener('pointermove', function (e) { var r = card.getBoundingClientRect(); lean((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5); });
    card.addEventListener('pointerleave', function () { lean(0, 0); });
    window.addEventListener('deviceorientation', function (e) { if (e.gamma == null) return; lean(Math.max(-1, Math.min(1, e.gamma / 30)) * 0.5, Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * 0.5); });
  })();

  /* ── the panel ── */
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function panel() { var p = $('wc-panel'); p.textContent = ''; p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; return p; }
  function note(p, text, warn) { p.appendChild(el('div', 'wc-note' + (warn ? ' is-warn' : ''), text)); }
  function button(href, label, cls, icon) {
    var a = el('a', 'wc-btn ' + cls); a.href = href;
    if (icon) { var i = el('span', 'wc-ico'); i.style.setProperty('--ico', 'url("/assets/icons/material/' + icon + '.svg")'); a.appendChild(i); }
    a.appendChild(el('span', '', label));
    return a;
  }
  function showOffers(offers, credited, v, restored) {
    var p = panel();
    p.appendChild(el('h1', 'wc-h', restored ? t('mine') : t('ready')));
    if (credited) note(p, t(pts(v) ? 'creditedPts' : 'credited'));
    p.appendChild(el('p', 'wc-p', t(pts(v) ? 'readyPts' : 'readyP')));
    if (!restored) {
      remember(slug, { offers: offers, card: v || null });
      try { if (location.search) history.replaceState(null, '', '/carte/' + slug); } catch (_) {}
    }
    var list = [];
    if (offers.apple) list.push({ at: isIOS ? 0 : 2, node: button(offers.apple, t('apple'), 'wc-btn-main', 'account_balance_wallet') });
    if (offers.google) list.push({ at: isAndroid ? 0 : 3, node: button(offers.google, t('google'), 'wc-btn-main', 'account_balance_wallet') });
    list.push({ at: list.length ? 9 : 0, node: button(offers.web, list.length ? t('web') : t('open'), list.length ? 'wc-btn-alt' : 'wc-btn-main') });
    list.sort(function (a, b) { return a.at - b.at; }).forEach(function (x, i) { if (i > 0 && x.node.classList.contains('wc-btn-main') && list.length > 1) { x.node.classList.replace('wc-btn-main', 'wc-btn-alt'); } p.appendChild(x.node); });
    /* The web card's link sent to the customer themself: free, and it finds the card again on any phone. */
    var wa = button('https://wa.me/?text=' + encodeURIComponent(t('waText') + offers.web), t('wa'), 'wc-btn-alt', 'chat');
    wa.target = '_blank'; wa.rel = 'noopener'; p.appendChild(wa);
    if (restored) {
      var other = el('button', 'wc-link', t('notMe')); other.type = 'button';
      other.addEventListener('click', function () { forget(slug); enroll(true); });
      p.appendChild(other);
    }
  }
  function fail(p, res, body) {
    var e = (body && body.error) || '';
    var key = e === 'claim-limit' ? 'claimLimit' : res && res.status === 429 ? 'busy' : e === 'bad-phone' ? 'badPhone' : e === 'name-required' ? 'nameReq' : e === 'consent-required' ? 'consentReq' : e === 'no-card' ? 'none' : e === 'token-expired' ? 'expired' : e === 'receipt-unusable' ? 'receiptBad' : 'error';
    var box = p.querySelector('.wc-err') || p.appendChild(el('div', 'wc-err'));
    box.textContent = t(key);
  }
  function post(body) {
    return fetch('/api/wallet/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { res: res, body: b }; }); });
  }

  function form(m, program, receipt) {
    var p = panel();
    p.appendChild(el('h1', 'wc-h', t('title')));
    p.appendChild(el('p', 'wc-offer', offerLine(program)));
    p.appendChild(el('p', 'wc-p', t('intro')));
    if (receipt === 'ok') note(p, t(pts(program) ? 'receiptOkPts' : 'receiptOk'));
    else if (receipt === 'used') note(p, t('receiptUsed'), true);
    else if (receipt === 'unusable') note(p, t('receiptBad'), true);
    var f = el('form'); f.className = 'wc-panel'; f.style.animation = 'none'; f.noValidate = true;
    var name = el('input'); name.autocomplete = 'given-name'; name.required = true; name.maxLength = 60;
    var phone = el('input'); phone.type = 'tel'; phone.inputMode = 'tel'; phone.autocomplete = 'tel'; phone.placeholder = '06 12 34 56 78'; phone.maxLength = 20;
    var l1 = el('label', 'wc-field'); l1.appendChild(el('span', '', t('first'))); l1.appendChild(name);
    var l2 = el('label', 'wc-field'); l2.appendChild(el('span', '', t('phone'))); l2.appendChild(phone);
    var l3 = el('label', 'wc-check'); var consent = el('input'); consent.type = 'checkbox'; l3.appendChild(consent); l3.appendChild(el('span', '', t('consent')));
    var go = el('button', 'wc-btn wc-btn-main', t('cta')); go.type = 'submit';
    [l1, l2, l3, go, el('div', 'wc-err')].forEach(function (n) { f.appendChild(n); });
    p.appendChild(f);
    var preview = { model: program.model, balance: 0, target: program.target, rewardLabel: program.rewardLabel, perMad: program.perMad, firstName: '' };
    name.addEventListener('input', function () { preview.firstName = name.value.trim().split(/\s+/)[0] || ''; paintCard(m, preview); });
    /* The button stays live: a tap without the box ticked says why, instead of a grey button that explains nothing. */
    consent.addEventListener('change', function () { var x = f.querySelector('.wc-err'); if (x && consent.checked) x.textContent = ''; });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (go.disabled) return;
      if (!consent.checked) { fail(f, null, { error: 'consent-required' }); return; }
      go.disabled = true; go.textContent = t('taking');
      var body = { merchant: m.slug, name: name.value, phone: phone.value, consent: consent.checked };
      if (receipt === 'ok') body.r = qs.get('r');
      post(body).then(function (r) {
        var b = r.body || {};
        if (r.res.ok && b.offers) { if (b.card) paintCard(m, b.card); return showOffers(b.offers, b.credited, b.card || program); }
        if (r.res.ok && b.exists && b.credited) { var q = panel(); q.appendChild(el('h1', 'wc-h', t(pts(program) ? 'creditedPts' : 'credited'))); return; }
        if (r.res.ok && b.exists) { var x = panel(); x.appendChild(el('h1', 'wc-h', t('title'))); note(x, t('exists')); return; }
        if (r.res.ok && b.already) { receipt = 'used'; form(m, program, 'used'); return; }
        go.disabled = false; go.textContent = t('cta'); fail(f, r.res, b);
      }).catch(function () { go.disabled = false; go.textContent = t('cta'); fail(f, null, null); });
    });
  }

  function enroll(fresh) {
    var q = '/api/wallet/enroll?merchant=' + encodeURIComponent(slug) + (qs.get('r') ? '&r=' + encodeURIComponent(qs.get('r')) : '');
    fetch(q).then(function (res) { return res.json().then(function (b) { return { res: res, body: b }; }); }).then(function (r) {
      if (!r.res.ok) { fail(panel(), r.res, r.body); return; }
      var m = r.body.merchant, program = r.body.program;
      paintCard(m, { model: program.model, balance: 0, target: program.target, rewardLabel: program.rewardLabel, perMad: program.perMad });
      if (qs.get('t') && !fresh) {
        var p = panel(); p.appendChild(el('p', 'wc-p', t('taking')));
        post({ merchant: m.slug, t: qs.get('t') }).then(function (x) {
          if (x.res.ok && x.body.offers) { if (x.body.card) paintCard(m, x.body.card); return showOffers(x.body.offers, false, x.body.card || program); }
          var kept = recall(slug);
          if (kept && kept.offers) { if (kept.card) paintCard(m, kept.card); return showOffers(kept.offers, false, kept.card || program, true); }
          fail(panel(), x.res, x.body);
        });
        return;
      }
      var mine = !fresh && !qs.get('r') && recall(slug);
      if (mine && mine.offers) {
        if (mine.card) paintCard(m, mine.card);
        showOffers(mine.offers, false, mine.card || program, true);
        /* The kept copy is from the day it was taken: the live balance replaces it. */
        try {
          var w = new URL(mine.offers.web, location.origin), sn = w.pathname.split('/').filter(Boolean)[2];
          fetch('/api/wallet/card?s=' + encodeURIComponent(sn) + '&t=' + encodeURIComponent(w.searchParams.get('t') || ''), { cache: 'no-store' })
            .then(function (x) { return x.ok ? x.json() : null; }).then(function (b) { if (b && b.card) paintCard(m, b.card); else if (b === null) { forget(slug); } }).catch(function () {});
        } catch (_) {}
        return;
      }
      form(m, program, fresh ? '' : (r.body.receipt || ''));
    }).catch(function () { fail(panel(), null, null); });
  }

  function webCard() {
    var url = '/api/wallet/card?s=' + encodeURIComponent(serial) + '&t=' + encodeURIComponent(qs.get('t') || '');
    var timer = 0;
    function load(first) {
      fetch(url, { cache: 'no-store' }).then(function (res) { return res.json().then(function (b) { return { res: res, body: b }; }); }).then(function (r) {
        if (!r.res.ok) { if (first) fail(panel(), r.res, r.body); return; }
        paintCard(r.body.merchant, r.body.card, { qr: first ? r.body.card.qr : '' });
        if (first && isIOS && !navigator.standalone) { var p = panel(); note(p, t('home')); }
      }).catch(function () { if (first) fail(panel(), null, null); });
    }
    load(true);
    timer = setInterval(function () { if (document.visibilityState === 'visible') load(false); }, 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(false); });
    void timer;
  }

  $('wc-foot').textContent = t('foot');
  if (!slug) { fail(panel(), { status: 404 }, { error: 'no-card' }); return; }
  if (serial) webCard(); else enroll();
})();
