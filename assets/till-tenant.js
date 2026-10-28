/* Kiwi · À QUI APPARTIENT LE SERVICE EN MÉMOIRE — window.KiwiTillTenant
 *
 * Une caisse change de commerce en s'appairant, sans que personne se
 * connecte (CLAUDE.md §6). L'appairage purge le stockage de l'ancien commerce
 * (assets/pairing-commit.js) et un changement de commerce redémarre la page
 * (assets/pos-dispatch.js). Restaient deux trous :
 *   · dépairer en plein service laissait le service de A ouvert en mémoire,
 *     sur une caisse qui n'appartient plus à personne ;
 *   · entre la pose du nouvel appairage et le redémarrage, la page de A
 *     tourne encore, avec kiwiLiveMerchant qui dit déjà B ;
 * et la purge détruisait au passage le service ouvert de A.
 *
 * Ce module tient UNE question, mismatch() : le service ouvert en mémoire
 * appartient-il à un autre commerce que celui auquel la caisse est appairée ?
 * Quand la réponse est oui :
 *   · chaque appel nommé (ventes, remboursements, salle, cuisine, caisse,
 *     impression) le consulte et ne fait rien ;
 *   · un filet attrape tout le reste : fetch, XHR et sendBeacon vers /api/*
 *     échouent comme hors ligne, sauf /api/pair/*, le seul chemin du retour ;
 *   · un écran plein couvre la caisse. Une seule action : réappairer au
 *     commerce d'origine.
 *
 * Avant la purge, assets/caisse-pairing.js met le service de A de côté sous
 * une clé que la purge ne touche pas (kiwiQuarantine:shift:<A>). Réappairer à
 * A le rend, avec ou sans rechargement entre-temps. Douze heures, comme le
 * service lui-même (loadPersistedShift).
 *
 * Chargé SANS defer, en tête de kiwi-caisse.html : le script en ligne lance ses
 * premiers fetch pendant l'analyse, avant tout script différé. */
(function () {
  'use strict';
  if (window.KiwiTillTenant) return;

  var QKEY = 'kiwiQuarantine:shift:';
  var MAX_AGE = 12 * 3600 * 1000;

  /* Le script de la caisse pose ce crochet : owner() = commerce du service
     ouvert en mémoire ('' si aucun), here() = commerce appairé maintenant,
     persist() = écrire le service tout de suite. */
  function hook() { return window.__kiwiTillTenantHook || null; }
  function owner() { try { var h = hook(); return h ? String(h.owner() || '') : ''; } catch (_) { return ''; } }
  function here() { try { var h = hook(); return h ? String(h.here() || '') : ''; } catch (_) { return ''; } }
  function mismatch() { var o = owner(); return !!o && o !== here(); }
  /* Chaque ligne du journal dit chez qui elle a été encaissée : le commerce du
     service ouvert, à défaut celui de la caisse. postSale (live-link.js)
     refuse ensuite de la poster ailleurs. */
  function stamp(entry) {
    var m = owner() || here();
    if (entry && m && !entry.merchant) entry.merchant = m;
    return entry;
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (_) {} }

  /* ── Le service mis de côté ─────────────────────────────────────────────── */
  var names = Object.create(null);   // slug → nom affiché, appris à l'appairage
  function parseShift(raw, slug) {
    try {
      var d = JSON.parse(raw);
      if (!d || d.v !== 1 || !d.openedAt) return null;
      if (d.merchant && String(d.merchant) !== slug) return null;
      if (Date.now() - (Number(d.savedAt) || 0) > MAX_AGE) return null;
      return d;
    } catch (_) { return null; }
  }
  function quarantine(slug, name) {
    slug = String(slug || '');
    if (!slug) return false;
    if (name) names[slug] = String(name).slice(0, 80);
    /* L'autosave tourne toutes les cinq secondes : la dernière vente peut être
       plus récente que la copie stockée. On écrit d'abord, on copie ensuite. */
    try { var h = hook(); if (h && h.persist && owner() === slug) h.persist(); } catch (_) {}
    var raw = lsGet('kiwi-caisse-shift:' + slug);
    if (!raw || !parseShift(raw, slug)) return false;
    return lsSet(QKEY + slug, raw);
  }
  function hasQuarantine(slug) {
    slug = String(slug || '');
    var raw = slug ? lsGet(QKEY + slug) : null;
    return !!(raw && parseShift(raw, slug));
  }
  /* Rend la copie (et la retire) si elle est encore valable pour CE commerce. */
  function take(slug) {
    slug = String(slug || '');
    if (!slug) return null;
    var raw = lsGet(QKEY + slug);
    if (!raw) return null;
    lsDel(QKEY + slug);
    return parseShift(raw, slug) ? raw : null;
  }
  function drop(slug) { if (slug) lsDel(QKEY + String(slug)); }
  function sweep() {
    try {
      var stale = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(QKEY) === 0 && !parseShift(lsGet(k), k.slice(QKEY.length))) stale.push(k);
      }
      stale.forEach(lsDel);
    } catch (_) {}
  }
  sweep();

  /* ── Le filet réseau ────────────────────────────────────────────────────── */
  var blocked = [];
  function blockedUrl(input) {
    var u;
    try { u = new URL(String(input && input.url ? input.url : input), location.href); } catch (_) { return false; }
    if (u.origin !== location.origin) return false;
    if (u.pathname.indexOf('/api/') !== 0) return false;
    return u.pathname.indexOf('/api/pair/') !== 0;
  }
  function note(input) {
    try {
      var u = new URL(String(input && input.url ? input.url : input), location.href);
      blocked.push(u.pathname);
      if (blocked.length > 50) blocked.shift();
    } catch (_) {}
  }
  var nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input) {
      if (mismatch() && blockedUrl(input)) {
        note(input);
        return Promise.reject(new TypeError('tenant-mismatch'));
      }
      return nativeFetch.apply(this, arguments);
    };
  }
  if (window.XMLHttpRequest && XMLHttpRequest.prototype) {
    var xOpen = XMLHttpRequest.prototype.open;
    var xSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__kiwiTenantUrl = url;
      return xOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (mismatch() && blockedUrl(this.__kiwiTenantUrl)) {
        note(this.__kiwiTenantUrl);
        var xhr = this;
        setTimeout(function () {
          try { xhr.dispatchEvent(new ProgressEvent('error')); } catch (_) {}
          try { xhr.dispatchEvent(new ProgressEvent('loadend')); } catch (_) {}
        }, 0);
        return;
      }
      return xSend.apply(this, arguments);
    };
  }
  if (navigator.sendBeacon) {
    var nativeBeacon = navigator.sendBeacon.bind(navigator);
    try {
      navigator.sendBeacon = function (url) {
        if (mismatch() && blockedUrl(url)) { note(url); return false; }
        return nativeBeacon.apply(null, arguments);
      };
    } catch (_) {}
  }

  /* ── L'écran ────────────────────────────────────────────────────────────── */
  var TEXT = {
    fr: {
      title: 'Caisse verrouillée',
      body: 'Cette caisse a changé de commerce pendant le service de {a}. Les tables, les additions et les ventes de ce service restent sur cet appareil. Rien n’est envoyé à un autre commerce.',
      next: 'Pour reprendre le service, réappairez la caisse à {a} avec un code généré depuis son tableau de bord.',
      reload: 'Recharger la page ouvre la caisse du nouveau commerce sans ce service. Il reste alors mis de côté sur cet appareil pendant 12 heures et revient dès que la caisse est réappairée à {a}.',
      action: 'Réappairer à {a}',
      prompt: 'RÉAPPAIRER À {a} · CODE À 6 CHIFFRES',
      foot: 'Générez un code depuis le tableau de bord de {a} › Caisse',
      fallback: 'l’autre commerce',
      pickTitle: 'Quel établissement est cette caisse ?',
      pickBody: 'Ce compte en a plusieurs. Les ventes de cette caisse et son carnet client iront dans celui que vous choisissez ici.',
      pickFoot: 'Elle y restera : changer d’établissement sur le tableau de bord ne la déplace plus. Pour la changer, réappairez la caisse.',
    },
    en: {
      title: 'Till locked',
      body: 'This till changed store during {a}’s service. The tables, bills and sales from this service stay on this device. Nothing is sent to another store.',
      next: 'To resume the service, pair the till back to {a} with a code generated from its dashboard.',
      reload: 'Reloading the page opens the new store’s till without this service. The service then stays set aside on this device for 12 hours and comes back as soon as the till is paired back to {a}.',
      action: 'Pair back to {a}',
      prompt: 'PAIR BACK TO {a} · 6-DIGIT CODE',
      foot: 'Generate a code from {a}’s dashboard › Till',
      fallback: 'the other store',
      pickTitle: 'Which business is this till?',
      pickBody: 'This account has several. This till’s sales and its client book will go to the one you pick here.',
      pickFoot: 'It stays there: switching business on the dashboard no longer moves it. To change it, pair the till again.',
    },
    ar: {
      title: 'الصندوق مقفل',
      body: 'تم ربط هذا الصندوق بمتجر آخر أثناء خدمة {a}. تبقى الطاولات والفواتير ومبيعات هذه الخدمة على هذا الجهاز، ولا يُرسَل أي شيء إلى متجر آخر.',
      next: 'لاستئناف الخدمة، أعد ربط الصندوق بـ {a} برمز يتم إنشاؤه من لوحة التحكم الخاصة به.',
      reload: 'إعادة تحميل الصفحة تفتح صندوق المتجر الجديد بدون هذه الخدمة. تبقى الخدمة عندها محفوظة جانبًا على هذا الجهاز لمدة 12 ساعة، وتعود بمجرد إعادة ربط الصندوق بـ {a}.',
      action: 'إعادة الربط بـ {a}',
      prompt: 'إعادة الربط بـ {a} · رمز من 6 أرقام',
      foot: 'أنشئ رمزًا من لوحة تحكم {a} › الصندوق',
      fallback: 'المتجر الآخر',
      pickTitle: 'ما هي المؤسسة التي يوجد بها هذا الصندوق؟',
      pickBody: 'هذا الحساب يضم عدة مؤسسات. ستُسجَّل مبيعات هذا الصندوق ودفتر عملائه في المؤسسة التي تختارها هنا.',
      pickFoot: 'وتبقى كذلك: تغيير المؤسسة في لوحة التحكم لم يعد ينقله. لتغييرها، أعد ربط الصندوق.',
    },
  };
  function lang() {
    var l = '';
    try { l = window.KiwiCaisseLang && window.KiwiCaisseLang.get ? window.KiwiCaisseLang.get() : ''; } catch (_) {}
    if (!l) l = lsGet('kiwiCaisseLang') || 'fr';
    l = String(l).slice(0, 2).toLowerCase();
    return TEXT[l] ? l : 'fr';
  }
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function ownerName(o) { return names[o] || o || TEXT[lang()].fallback; }
  function say(key, o) {
    var t = TEXT[lang()];
    return esc(t[key]).split('{a}').join('<b>' + esc(ownerName(o)) + '</b>');
  }
  function sayPlain(key, o) { return TEXT[lang()][key].split('{a}').join(ownerName(o)); }
  function icon(name) {
    try { if (window.KiwiIcon && window.KiwiIcon.svg) return window.KiwiIcon.svg(name, 28, 'tt-ic'); } catch (_) {}
    return '<i data-icon="' + name + '" class="tt-ic"></i>';
  }

  function injectCss() {
    if (document.getElementById('tt-style')) return;
    var s = document.createElement('style');
    s.id = 'tt-style';
    s.textContent =
      '#tt-lock{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;' +
      'background:#04120D;color:#F7F5F0;font-family:"Inter Tight","IBM Plex Sans Arabic",system-ui,sans-serif;font-style:normal;}' +
      '#tt-lock[hidden]{display:none;}' +
      '#tt-lock .tt-card{max-width:520px;width:100%;display:flex;flex-direction:column;gap:14px;}' +
      '#tt-lock .tt-ic{width:28px;height:28px;color:#7DF2B0;}' +
      '#tt-lock h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-0.01em;}' +
      '#tt-lock p{margin:0;font-size:15px;line-height:1.5;color:rgba(247,245,240,0.82);}' +
      '#tt-lock p.tt-small{font-size:13px;color:rgba(247,245,240,0.62);}' +
      '#tt-lock b{font-weight:600;color:#F7F5F0;}' +
      '#tt-lock button{margin-top:8px;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 20px;' +
      'border:0;border-radius:12px;background:#0B6E4F;color:#F7F5F0;font:inherit;font-size:15px;font-weight:600;cursor:pointer;align-self:flex-start;}' +
      '#tt-lock button .tt-ic{width:20px;height:20px;color:inherit;}' +
      '#tt-lock[dir="rtl"] button{align-self:flex-end;}' +
      '#tt-lock .tt-pick{display:flex;flex-direction:column;gap:8px;margin-top:4px;}' +
      '#tt-lock .tt-pick button{margin:0;align-self:stretch;justify-content:flex-start;text-align:start;min-height:56px;flex-direction:column;gap:2px;align-items:flex-start;padding:10px 16px;background:rgba(247,245,240,0.07);}' +
      '#tt-lock .tt-pick b{font-size:15px;}' +
      '#tt-lock .tt-pick span{font-size:13px;font-weight:400;color:rgba(247,245,240,0.62);}';
    (document.head || document.documentElement).appendChild(s);
  }

  var lockEl = null;
  var shownFor = '';
  var relinking = false;
  var inerted = [];
  function padVisible() {
    var p = document.getElementById('cp-screen');
    return !!(p && p.style.display !== 'none' && p.isConnected);
  }
  function setInert(on) {
    if (!document.body) return;
    if (on) {
      Array.prototype.forEach.call(document.body.children, function (el) {
        if (el === lockEl || el.id === 'cp-screen' || el.tagName === 'SCRIPT' || el.inert) return;
        el.inert = true;
        inerted.push(el);
      });
    } else {
      inerted.forEach(function (el) { try { el.inert = false; } catch (_) {} });
      inerted = [];
    }
  }
  function render(o) {
    injectCss();
    if (!lockEl) {
      lockEl = document.createElement('div');
      lockEl.id = 'tt-lock';
      lockEl.setAttribute('role', 'alertdialog');
      lockEl.setAttribute('aria-modal', 'true');
      lockEl.setAttribute('aria-labelledby', 'tt-title');
      lockEl.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('[data-tt-relink]');
        if (b) pairBack();
      });
    }
    var l = lang();
    lockEl.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
    lockEl.setAttribute('lang', l);
    // Tout le texte passe par esc() : rien d'arbitraire n'entre dans le HTML.
    lockEl.innerHTML =
      '<div class="tt-card">' +
        icon('lock') +
        '<h1 id="tt-title">' + esc(TEXT[l].title) + '</h1>' +
        '<p>' + say('body', o) + '</p>' +
        '<p>' + say('next', o) + '</p>' +
        '<p class="tt-small">' + say('reload', o) + '</p>' +
        '<button type="button" data-tt-relink>' + icon('link') + '<span>' + say('action', o) + '</span></button>' +
      '</div>';
    if (lockEl.parentNode !== document.body) document.body.appendChild(lockEl);
    shownFor = o + '|' + l;
  }
  function pairBack() {
    var o = owner();
    var P = window.KiwiCaissePairing;
    if (!o || !P || !P.repairWithCode) return;
    relinking = true;
    if (lockEl) lockEl.hidden = true;
    P.repairWithCode({ venue: { merchant: o, name: ownerName(o) }, prompt: sayPlain('prompt', o), foot: sayPlain('foot', o) });
  }
  function check() {
    if (!document.body) return;
    /* Le tableau de bord réécrit kiwiLiveMerchant quand il change de vue,
       dans cet onglet ou dans un autre. La caisse réaffirme le sien. */
    var mine = store();
    if (mine && lsGet('kiwiLiveMerchant') !== mine) lsSet('kiwiLiveMerchant', mine);
    if (!mine && realEnv() && !pairedSlug() && stores().length > 1) { askStore(); return; }
    var on = mismatch();
    if (!on) {
      relinking = false;
      if (lockEl) { lockEl.hidden = true; lockEl.remove(); }
      shownFor = '';
      setInert(false);
      return;
    }
    if (relinking && padVisible()) return;   // le pavé du retour est ouvert, il passe devant
    relinking = false;
    var o = owner();
    if (!lockEl || !lockEl.isConnected || shownFor !== o + '|' + lang()) render(o);
    lockEl.hidden = false;
    setInert(true);   // idempotent : ne pose inert que sur ce qui ne l'a pas encore
  }
  document.addEventListener('kiwi-paired', function () { setTimeout(check, 0); });
  window.addEventListener('storage', function () { setTimeout(check, 0); });
  setInterval(check, 700);


  /* ═════════════════════════════════════════════════════════════════════════
   * LE MAGASIN DE CETTE CAISSE — une fois, puis plus jamais
   *
   * `kiwiLiveMerchant` désigne le locataire : sous quel commerce la vente
   * part, quel carnet client s'ouvre, quels horaires s'appliquent. Quarante
   * fichiers le lisent. Mais c'est UN global de navigateur, et le tableau de
   * bord le réécrit à chaque changement d'établissement — même dans un autre
   * onglet, même la veille.
   *
   * Sur un compte à un seul établissement, ça ne se voit pas. Sur un compte
   * qui en a deux, la caisse de la boutique, ouverte dans le navigateur où le
   * propriétaire regardait son café, encaissait sous le café : le chiffre
   * d'affaires de la boutique dans les « Encaissé aujourd'hui » du café, et
   * le client crédité dans le mauvais carnet — d'où un client « pas venu
   * depuis 4 jours » dont la vente venait d'être faite.
   *
   * L'appairage répondait déjà à la question. Ce qui manquait, c'est la
   * réponse quand la caisse n'est PAS appairée (ouverte depuis le tableau de
   * bord, sur le même appareil) : il ne restait que le global, donc le dernier
   * magasin regardé.
   *
   * Alors la caisse choisit son établissement UNE fois :
   *   · appairée → c'est celui de l'appairage, sans question ;
   *   · un seul établissement sur le compte → celui-là, sans question ;
   *   · plusieurs → on demande, et tant que personne n'a répondu, la caisse
   *     n'écrit sous AUCUN magasin (le carnet et le journal des ventes le
   *     lisent et s'abstiennent) : pas de carnet vaut mieux que celui du
   *     voisin ;
   *   · on ne sait pas (pas de liste d'établissements ici) → l'ancien chemin,
   *     inchangé.
   * Choisi, il est RÉAFFIRMÉ dans kiwiLiveMerchant à chaque tour de check() :
   * le tableau de bord peut changer de vue, il ne déplace plus la caisse.
   * En démonstration, rien de tout ceci ne se produit.
   * ═════════════════════════════════════════════════════════════════════════ */
  var SKEY = 'kiwiTillStore';
  function realEnv() { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; } }
  function storeRead() {
    try { var d = JSON.parse(lsGet(SKEY) || 'null'); return d && typeof d === 'object' ? d : null; } catch (_) { return null; }
  }
  function pairedSlug() {
    /* Lecture directe : la clé d'appairage n'a qu'un écrivain, et le banc
       tools/pairing-resolver-test.mjs n'autorise ici que getItem. */
    try { var pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); return (pv && String(pv.merchant || '')) || ''; } catch (_) { return ''; }
  }
  /* Les établissements du compte, tels que le tableau de bord les a laissés
     dans ce navigateur (assets/venues.js › kiwiCustomVenues). Le slug gravé,
     jamais le nom re-slugifié : renommer sa boutique ne doit pas la dédoubler. */
  function stores() {
    try {
      var a = JSON.parse(lsGet('kiwiCustomVenues') || '[]'), seen = {}, out = [];
      if (!Array.isArray(a)) return [];
      a.forEach(function (v) {
        var slug = v && String(v.slug || '').trim();
        if (!slug || seen[slug]) return;
        seen[slug] = 1;
        out.push({ slug: slug, name: String((v && v.name) || slug).slice(0, 80), location: String((v && v.location) || '').slice(0, 80) });
      });
      return out;
    } catch (_) { return []; }
  }
  function storePin(slug, name) {
    slug = String(slug || '');
    if (!slug) return false;
    if (name) names[slug] = String(name).slice(0, 80);
    lsSet(SKEY, JSON.stringify({ slug: slug, name: names[slug] || '', at: Date.now() }));
    lsSet('kiwiLiveMerchant', slug);
    return true;
  }
  function store() { var d = storeRead(); return (d && d.slug) || ''; }
  /* Pose la réponse quand elle ne se discute pas, pose la question sinon. */
  function settleStore() {
    if (!realEnv()) return;
    var paired = pairedSlug();
    if (paired) {
      var cur = storeRead();
      if (!cur || cur.slug !== paired) storePin(paired, nameOfStore(paired));
      return;
    }
    if (store()) return;
    var all = stores();
    if (!all.length) return;                       // on ne sait pas : on ne devine pas
    if (all.length === 1) { storePin(all[0].slug, all[0].name); return; }
    lsSet(SKEY, JSON.stringify({ pending: 1, at: Date.now() }));
    askStore();
  }
  function nameOfStore(slug) {
    var all = stores();
    for (var i = 0; i < all.length; i++) if (all[i].slug === slug) return all[i].name;
    return names[slug] || '';
  }
  /* L'écran de la question réutilise la carte du verrou : même surface, même
     carte, une liste de boutons à la place du bouton de réappairage. */
  function askStore() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', askStore); return; }
    if (realEnv() && !store()) lsSet(SKEY, JSON.stringify({ pending: 1, at: Date.now() }));
    var all = stores();
    if (all.length < 2) { settleStore(); return; }
    var l = lang(), T = TEXT[l];
    /* check() repasse toutes les 700 ms : reconstruire l'écran à chaque tour
       avalerait le clic qu'on attend (CLAUDE.md §5). On ne peint qu'une fois. */
    if (lockEl && lockEl.isConnected && !lockEl.hidden && shownFor === 'pick|' + l) return;
    injectCss();
    if (!lockEl) render('');
    lockEl.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
    lockEl.setAttribute('lang', l);
    lockEl.innerHTML =
      '<div class="tt-card">' + icon('storefront') +
        '<h1 id="tt-title">' + esc(T.pickTitle) + '</h1>' +
        '<p>' + esc(T.pickBody) + '</p>' +
        '<div class="tt-pick">' + all.map(function (v) {
          return '<button type="button" data-tt-store="' + esc(v.slug) + '"><b>' + esc(v.name) + '</b>' +
            (v.location ? '<span>' + esc(v.location) + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        '<p class="tt-small">' + esc(T.pickFoot) + '</p>' +
      '</div>';
    shownFor = 'pick|' + l;
    if (lockEl.parentNode !== document.body) document.body.appendChild(lockEl);
    lockEl.hidden = false;
    setInert(true);
  }
  /* Répondre recharge la page : quarante modules ont déjà lu le locataire. */
  function chooseStore(slug) {
    var all = stores(), pick = null;
    for (var i = 0; i < all.length; i++) if (all[i].slug === String(slug)) pick = all[i];
    if (!pick || !storePin(pick.slug, pick.name)) return false;
    try { location.reload(); } catch (_) {}
    return true;
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-tt-store]');
    if (b) { e.preventDefault(); chooseStore(b.getAttribute('data-tt-store')); }
  }, true);
  settleStore();
  document.addEventListener('kiwi-paired', function () { setTimeout(settleStore, 0); });

  window.KiwiTillTenant = {
    mismatch: mismatch,
    store: store,
    stores: stores,
    chooseStore: chooseStore,
    askStore: askStore,
    stamp: stamp,
    owner: owner,
    here: here,
    quarantine: quarantine,
    hasQuarantine: hasQuarantine,
    take: take,
    drop: drop,
    check: check,
    blocked: function () { return blocked.slice(); },
  };
})();
