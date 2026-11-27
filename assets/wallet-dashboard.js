/* La carte Wallet, côté patron : une section « Carte Wallet » dans la fenêtre
 * Programme de fidélité (assets/features.js › handlers.loyalty).
 *   · l'activer, le nom et les deux couleurs de la carte, avec un aperçu vivant
 *     (les tampons du programme choisi juste au-dessus) ;
 *   · l'adresse et la position de la boutique (la carte remonte sur l'écran
 *     verrouillé du client quand il passe devant) ;
 *   · combien de clients l'ont, par type de téléphone (GET /api/wallet/stats) ;
 *   · le présentoir du comptoir : une page A6 à imprimer, avec le QR de /carte.
 * Le réglage est le document « wallet » du commerce (functions/api/store.js),
 * lu par functions/api/wallet/_merchant.js. Chargé au premier clic par
 * assets/pages/dashboard-loader.js ; la section se pose seule quand la fenêtre
 * s'ouvre, sans appel dans features.js. Toute écriture visible passe par t(). */
(function () {
  'use strict';
  var T = {
    fr: {
      title: 'Carte Wallet', intro: 'Vos clients rangent la carte dans Apple Wallet ou Google Wallet. Chaque achat la met à jour, toute seule.',
      offerVisit: '{reward} au bout de {n} passages', offerProduct: '{reward} au bout de {n} × {item}', offerAmount: '{reward} dès {n} points', rewardAny: 'Une récompense',
      on: 'Proposer la carte à mes clients', name: 'Nom sur la carte', bg: 'Couleur de la carte', ink: 'Couleur des tampons',
      address: 'Adresse (facultatif)', where: 'Position de la boutique', locate: 'Utiliser ma position ici', located: 'Position enregistrée',
      noLocate: 'Position indisponible sur cet appareil', save: 'Enregistrer la carte', saving: 'Enregistrement…', saved: 'Carte enregistrée',
      failed: 'Enregistrement impossible, réessayez', stale: 'Modifiée ailleurs entre-temps : rechargée, refaites la modification',
      stand: 'Imprimer le présentoir du comptoir', count: '{n} clients ont la carte', apple: 'iPhone', inWallet: 'dans Wallet', google: 'Android', web: 'web',
      none: 'Aucun client ne l’a encore.', standLine: 'Votre carte fidélité dans votre téléphone', standSub: 'Scannez avec l’appareil photo.',
      stamps: 'Tampons', reward: 'Récompense', points: 'Points', client: 'Client', you: 'Salma',
    },
    en: {
      title: 'Wallet card', intro: 'Customers keep the card in Apple Wallet or Google Wallet. Every purchase updates it by itself.',
      offerVisit: '{reward} after {n} visits', offerProduct: '{reward} after {n} × {item}', offerAmount: '{reward} at {n} points', rewardAny: 'A reward',
      on: 'Offer the card to my customers', name: 'Name on the card', bg: 'Card colour', ink: 'Stamp colour',
      address: 'Address (optional)', where: 'Shop location', locate: 'Use my location here', located: 'Location saved',
      noLocate: 'Location unavailable on this device', save: 'Save the card', saving: 'Saving…', saved: 'Card saved',
      failed: 'Could not save, try again', stale: 'Changed elsewhere meanwhile: reloaded, make your change again',
      stand: 'Print the counter stand', count: '{n} customers have the card', apple: 'iPhone', inWallet: 'in Wallet', google: 'Android', web: 'web',
      none: 'No customer has it yet.', standLine: 'Your loyalty card on your phone', standSub: 'Scan with the camera.',
      stamps: 'Stamps', reward: 'Reward', points: 'Points', client: 'Customer', you: 'Salma',
    },
    ar: {
      title: 'بطاقة Wallet', intro: 'الزبناء كيخليو البطاقة في Apple Wallet ولا Google Wallet. كل شرية كتجددها بوحدها.',
      offerVisit: '{reward} من بعد {n} زيارات', offerProduct: '{reward} من بعد {n} × {item}', offerAmount: '{reward} ملي توصل {n} نقطة', rewardAny: 'هدية',
      on: 'نقترح البطاقة على الزبناء ديالي', name: 'الاسم على البطاقة', bg: 'لون البطاقة', ink: 'لون الأختام',
      address: 'العنوان (اختياري)', where: 'موقع المحل', locate: 'استعمل الموقع ديالي هنا', located: 'تسجل الموقع',
      noLocate: 'الموقع ما متوفرش في هاد الجهاز', save: 'سجل البطاقة', saving: 'كنسجلو…', saved: 'تسجلات البطاقة',
      failed: 'ما قدرناش نسجلو، عاود', stale: 'تبدلات من جهة أخرى: عاودنا حملناها، دير التعديل مرة أخرى',
      stand: 'طبع اللوحة ديال الكاشة', count: '{n} زبون عندهم البطاقة', apple: 'iPhone', inWallet: 'في Wallet', google: 'Android', web: 'ويب',
      none: 'حتى زبون ما عندو البطاقة باقي.', standLine: 'بطاقة الوفاء ديالك في التيليفون', standSub: 'سكاني بالكاميرا.',
      stamps: 'الأختام', reward: 'الهدية', points: 'النقاط', client: 'الزبون', you: 'سلمى',
    },
  };
  var lang = 'fr';
  function t(k, vars) {
    var s = (T[lang] && T[lang][k]) || T.fr[k] || k;
    return s.replace(/\{(\w+)\}/g, function (_, n) { return vars && vars[n] != null ? String(vars[n]) : ''; });
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function merchant() { try { return (window.KiwiClients && window.KiwiClients.bookId && window.KiwiClients.bookId()) || ''; } catch (_) { return ''; } }
  function program() { try { return (window.KiwiClients && window.KiwiClients.config && window.KiwiClients.config()) || {}; } catch (_) { return {}; } }
  var HEX = /^#[0-9a-fA-F]{6}$/;
  /* The reward, in a line, in one language: what the stand and the panel sell. */
  function offer(cfg, in_lang) {
    var L = T[in_lang] || T.fr, model = cfg.model || 'visit', rule = cfg[model] || {};
    var fill = function (k, v) { return (L[k] || T.fr[k]).replace(/\{(\w+)\}/g, function (_, n) { return v[n] != null ? String(v[n]) : ''; }); };
    var reward = rule.reward || L.rewardAny;
    if (model === 'amount') return fill('offerAmount', { reward: reward, n: Number(rule.threshold) || 100 });
    if (model === 'product' && rule.item) return fill('offerProduct', { reward: reward, n: Number(rule.target) || 10, item: rule.item });
    return fill('offerVisit', { reward: reward, n: Number(rule.target) || 10 });
  }

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var css = [
      '.kw-wd{margin-top:22px;padding-top:18px;border-top:1px solid var(--line,rgba(10,15,13,.1));display:flex;flex-direction:column;gap:12px}',
      '.kw-wd h4{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}.kw-wd p{margin:0;font-size:13px;color:var(--n-500,#5B635F)}',
      '.kw-wd-on{display:flex;gap:10px;align-items:center;font-size:14px;font-weight:500}.kw-wd-on input{width:18px;height:18px;accent-color:var(--atlas,#0B6E4F)}',
      '.kw-wd-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kw-wd-grid .wide{grid-column:1/-1}',
      '.kw-wd label.f{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--n-500,#5B635F)}',
      '.kw-wd input[type=text]{height:40px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.14));padding:0 12px;font:inherit;font-size:14px;background:var(--paper,#F7F5F0);color:inherit}',
      '.kw-wd input[type=color]{width:100%;height:40px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.14));padding:3px;background:transparent}',
      '.kw-wd-card{border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 14px 30px -18px rgba(10,15,13,.55)}',
      '.kw-wd-card .h{display:flex;justify-content:space-between;align-items:flex-start;font-weight:600;font-size:14px}.kw-wd-card .l{display:block;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}',
      '.kw-wd-dots{display:grid;grid-template-columns:repeat(var(--n,5),1fr);gap:6px}.kw-wd-dots i{aspect-ratio:1;border-radius:50%;box-shadow:inset 0 0 0 2px var(--ink-c);opacity:.35}.kw-wd-dots i.on{background:var(--ink-c);opacity:1;box-shadow:none}',
      '.kw-wd-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.kw-wd-btn{height:38px;border-radius:10px;border:0;padding:0 14px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;background:color-mix(in srgb,var(--atlas,#0B6E4F) 12%,transparent);color:var(--atlas,#0B6E4F)}',
      '.kw-wd-btn.main{background:var(--atlas,#0B6E4F);color:#F7F5F0}.kw-wd-btn[disabled]{opacity:.5;cursor:default}',
      '.kw-wd-say{font-size:13px;color:var(--n-500,#5B635F)}.kw-wd-say.bad{color:#B3261E}.kw-wd-stats{font-size:13px;font-weight:500}',
    ].join('');
    var st = el('style'); st.textContent = css; document.head.appendChild(st);
  }

  function preview(card, doc) {
    var cfg = program(), model = cfg.model || 'visit';
    var target = model === 'product' ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target);
    target = Math.max(2, Math.min(12, Number(target) || 10));
    var reward = model === 'amount' ? (cfg.amount && cfg.amount.reward) : model === 'product' ? (cfg.product && cfg.product.reward) : (cfg.visit && cfg.visit.reward);
    card.style.background = 'radial-gradient(ellipse at top left,#0B6E4F,#053B2C 75%) #053B2C'; card.style.color = '#F7F5F0'; card.style.setProperty('--ink-c', '#7DF2B0');
    card.textContent = '';
    var brand = el('img'); brand.src = '/assets/kiwi-newlogo-inverse.svg'; brand.alt = 'Kiwi'; brand.style.cssText = 'width:72px;height:28px;object-fit:contain;object-position:left'; card.appendChild(brand);
    var h = el('div', 'h');
    h.appendChild(el('span', '', 'chez ' + (doc.name || '')));
    var who = el('span'); who.appendChild(el('span', 'l', t('client'))); who.appendChild(document.createTextNode(t('you'))); h.appendChild(who);
    card.appendChild(h);
    if (model === 'amount') {
      var p = el('div'); p.appendChild(el('span', 'l', t('points'))); p.appendChild(document.createTextNode('240')); card.appendChild(p);
      var bar = el('div'); bar.style.cssText = 'height:10px;border-radius:10px;background:rgba(125,242,176,.18);overflow:hidden'; var fill = el('div'); fill.style.cssText = 'width:60%;height:100%;background:#7DF2B0;border-radius:inherit'; bar.appendChild(fill); card.appendChild(bar);
    } else {
      var dots = el('div', 'kw-wd-dots'); dots.style.setProperty('--n', target <= 6 ? target : Math.ceil(target / 2));
      for (var i = 0; i < target; i++) dots.appendChild(el('i', i < 3 ? 'on' : ''));
      card.appendChild(dots);
    }
    var r = el('div'); r.appendChild(el('span', 'l', t('reward'))); r.appendChild(document.createTextNode(reward || '')); card.appendChild(r);
  }

  function printStand(doc, slug) {
    var url = 'https://kiwi-os.com/carte/' + encodeURIComponent(slug);
    var svg = window.KiwiQR ? window.KiwiQR.svg(url, { size: 260, margin: 2, ecl: 'M', dark: '#0A0F0D', light: '#F7F5F0' }) : '';
    var w = window.open('', '_blank');
    if (!w) return;
    var d = w.document;
    d.open();
    d.write('<!doctype html><meta charset="utf-8"><title></title><style>@page{size:A6;margin:8mm}body{margin:0;background:#F7F5F0;font-family:"Inter Tight",system-ui,sans-serif;text-align:center;color:#0A0F0D}' +
      '.s{display:flex;flex-direction:column;align-items:center;gap:4mm}.n{font-size:16pt;font-weight:600}.q svg{width:62mm;height:auto}.a{font-size:13pt;font-weight:600;font-family:"IBM Plex Sans Arabic",system-ui,sans-serif}.o{font-size:12pt;font-weight:600;color:#0B6E4F}.u{font-size:8pt;color:#5B635F}</style><div class="s"></div>');
    d.close();
    var box = d.querySelector('.s');
    var add = function (cls, text) { var n = d.createElement('div'); n.className = cls; n.textContent = text; box.appendChild(n); return n; };
    d.title = doc.name || slug;
    var logo = d.createElement('img'); logo.src = location.origin + '/assets/kiwi-newlogo.svg'; logo.alt = 'Kiwi'; logo.style.cssText = 'width:24mm;height:10mm;object-fit:contain'; box.appendChild(logo);
    add('n', 'chez ' + (doc.name || slug));
    add('l', T.fr.standLine);
    add('o', offer(program(), 'fr'));
    var q = d.createElement('div'); q.className = 'q'; if (svg) q.appendChild(d.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true)); box.appendChild(q);   /* dessin de qrcode.js, sans texte */
    add('a', T.ar.standLine).dir = 'rtl';
    add('o', offer(program(), 'ar')).dir = 'rtl';
    add('u', T.fr.standSub);
    add('u', url.replace('https://', ''));
    setTimeout(function () { try { w.focus(); w.print(); } catch (_) {} }, 250);
  }

  function mount(prev) {
    var body = prev.parentElement;
    if (!body || body.querySelector('.kw-wd')) return;
    lang = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
    if (!T[lang]) lang = 'fr';
    var slug = merchant();
    try { if (!slug || (window.KiwiEnv && window.KiwiEnv.isReal && !window.KiwiEnv.isReal())) return; } catch (_) { return; }   /* une démo n'enregistre rien */
    style();
    var box = el('section', 'kw-wd');
    box.appendChild(el('h4', '', t('title')));
    box.appendChild(el('p', '', t('intro')));
    var onL = el('label', 'kw-wd-on'), on = el('input'); on.type = 'checkbox'; onL.appendChild(on); onL.appendChild(el('span', '', t('on'))); box.appendChild(onL);
    var grid = el('div', 'kw-wd-grid');
    var field = function (label, input, wide) { var l = el('label', 'f' + (wide ? ' wide' : '')); l.appendChild(el('span', '', label)); l.appendChild(input); grid.appendChild(l); return input; };
    var name = field(t('name'), el('input'), true); name.type = 'text'; name.maxLength = 40;
    var address = field(t('address'), el('input'), true); address.type = 'text'; address.maxLength = 120;
    box.appendChild(grid);
    var card = el('div', 'kw-wd-card'); box.appendChild(card);
    var where = el('div', 'kw-wd-row'), locate = el('button', 'kw-wd-btn', t('locate')), whereSay = el('span', 'kw-wd-say');
    locate.type = 'button'; where.appendChild(el('span', 'kw-wd-say', t('where'))); where.appendChild(locate); where.appendChild(whereSay); box.appendChild(where);
    var stats = el('div', 'kw-wd-stats'); box.appendChild(stats);
    var row = el('div', 'kw-wd-row'), save = el('button', 'kw-wd-btn main', t('save')), stand = el('button', 'kw-wd-btn', t('stand')), say = el('span', 'kw-wd-say');
    save.type = 'button'; stand.type = 'button';
    row.appendChild(save); row.appendChild(stand); row.appendChild(say); box.appendChild(row);
    body.appendChild(box);

    var S = { doc: {}, rev: 0 };
    var read = function () {
      var d = Object.assign({}, S.doc);
      d.on = on.checked; d.name = name.value.trim().slice(0, 40); d.address = address.value.trim().slice(0, 120);
      return d;
    };
    var paint = function () { preview(card, read()); stand.disabled = !on.checked; };
    var fill = function (d) {
      S.doc = d || {};
      on.checked = !!S.doc.on; name.value = S.doc.name || ''; address.value = S.doc.address || '';
      whereSay.textContent = S.doc.lat != null && S.doc.lng != null ? t('located') : '';
      paint();
    };
    var load = function () {
      return fetch('/api/store?feature=wallet&merchant=' + encodeURIComponent(slug), { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { S.rev = Number(j && j.rev) || 0; fill((j && j.data) || {}); }, function () { fill({}); });
    };
    [on, name, address].forEach(function (n) { n.addEventListener('input', paint); n.addEventListener('change', paint); });
    /* La fenêtre suit le programme choisi au-dessus : l'aperçu aussi. */
    prev.closest('.kiwi-modal').addEventListener('change', function (e) { if (!box.contains(e.target)) setTimeout(paint, 0); });
    locate.onclick = function () {
      if (!navigator.geolocation) { whereSay.textContent = t('noLocate'); return; }
      navigator.geolocation.getCurrentPosition(function (p) {
        S.doc.lat = Math.round(p.coords.latitude * 1e5) / 1e5; S.doc.lng = Math.round(p.coords.longitude * 1e5) / 1e5;
        whereSay.textContent = t('located');
      }, function () { whereSay.textContent = t('noLocate'); }, { enableHighAccuracy: true, timeout: 10000 });
    };
    save.onclick = function () {
      save.disabled = true; say.className = 'kw-wd-say'; say.textContent = t('saving');
      var out = read();
      fetch('/api/store', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ feature: 'wallet', merchant: slug, data: out, baseRev: S.rev }) })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { r: r, j: j }; }); })
        .then(function (x) {
          save.disabled = false;
          if (x.r.status === 409 && x.j && x.j.error === 'stale') { say.className = 'kw-wd-say bad'; say.textContent = t('stale'); return load(); }
          if (!x.r.ok || !x.j || x.j.ok === false) { say.className = 'kw-wd-say bad'; say.textContent = t('failed'); return; }
          S.rev = Number(x.j.rev) || S.rev + 1; S.doc = out; say.textContent = t('saved');
        }, function () { save.disabled = false; say.className = 'kw-wd-say bad'; say.textContent = t('failed'); });
    };
    stand.onclick = function () { printStand(read(), slug); };
    load();
    fetch('/api/wallet/stats?merchant=' + encodeURIComponent(slug), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        if (!s.clients) { stats.textContent = t('none'); return; }
        stats.textContent = t('count', { n: s.clients }) + ' · ' + s.apple + ' ' + t('apple') + ' (' + s.appleInWallet + ' ' + t('inWallet') + ') · ' + s.google + ' ' + t('google') + ' · ' + s.web + ' ' + t('web');
      }, function () {});
  }

  /* La fenêtre du programme s'ouvre sur un clic : on regarde juste après. */
  function look() { var p = document.querySelector('.kiwi-modal .loy-preview'); if (p) mount(p); }
  window.addEventListener('click', function () { setTimeout(look, 0); }, true);
  look();
})();
