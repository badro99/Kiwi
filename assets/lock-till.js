/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · « Ouvrir la caisse » from the dashboard PIN lock (dashboard.html,
 * .kiwi-lock-caisse).
 *
 * The button was a bare link to kiwi-caisse.html, which names no store, so the
 * till booted whatever this browser had last been paired with, or the demo
 * restaurant: Santos landed on a restaurant and Amira on Pasta Corner (owner
 * report, 30 Oct 2026). It now names the store through the same hand-off as
 * the panel's « Ouvrir la caisse sur cet appareil » (KiwiCaisseLink.handOff)
 * and opens kiwi-caisse.html?pair=1.
 *
 * An account that owns several stores (KiwiMe.stores, from /api/me) is asked
 * which till to open: the lock card turns into a short list of its stores,
 * the brand lens follows the pointer and the arrow keys, a digit picks a row,
 * Escape goes back to the code. The pick prints a little opening ticket, line
 * by line like the thermal printer at the counter, then the till opens.
 *
 * Nothing opens while the store is unknown: identity loads after this click
 * can happen, so it waits up to five seconds, then says so. The local demo
 * (KiwiEnv.isReal() false) keeps the plain link. No global is defined here.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var T = {
    choose: ['Quelle caisse ouvrir ?', 'Which till do you want to open?', 'أي صندوق تريد فتحه؟'],
    count: ['{n} commerces sur ce compte', '{n} businesses on this account', '{n} أنشطة في هذا الحساب'],
    here: ['Ce tableau de bord', 'This dashboard', 'لوحة التحكم هذه'],
    back: ['Retour au code', 'Back to the code', 'العودة إلى الرمز'],
    opening: ['Ouverture de la caisse', 'Opening the till', 'فتح الصندوق'],
    goodDay: ['Bonnes ventes.', 'Good selling.', 'مبيعات موفقة.'],
    noStore: ['Votre commerce se charge encore. Réessayez dans un instant.', 'Your business is still loading. Try again in a moment.', 'نشاطك لا يزال قيد التحميل. أعد المحاولة بعد لحظة.'],
  };
  var TRADES = {
    boutique: ['Boutique', 'Boutique', 'متجر ملابس', 'checkroom'],
    restaurant: ['Restaurant', 'Restaurant', 'مطعم', 'restaurant'],
    cafe: ['Café', 'Café', 'مقهى', 'local_cafe'],
    pressing: ['Pressing', 'Dry cleaner', 'مصبنة', 'local_laundry_service'],
    hotel: ['Hôtel', 'Hotel', 'فندق', 'bed'],
    gym: ['Salle de sport', 'Gym', 'قاعة رياضة', 'fitness_center'],
    sport: ['Salle de sport', 'Gym', 'قاعة رياضة', 'fitness_center'],
    boulangerie: ['Boulangerie', 'Bakery', 'مخبزة', 'bakery_dining'],
    bakery: ['Boulangerie', 'Bakery', 'مخبزة', 'bakery_dining'],
    epicerie: ['Épicerie', 'Grocery', 'بقالة', 'local_grocery_store'],
    coiffure: ['Salon de coiffure', 'Hair salon', 'صالون حلاقة', 'content_cut'],
    spa: ['Spa', 'Spa', 'سبا', 'spa'],
    pharmacie: ['Pharmacie', 'Pharmacy', 'صيدلية', 'local_pharmacy'],
    librairie: ['Librairie', 'Bookshop', 'مكتبة', 'menu_book'],
    fleuriste: ['Fleuriste', 'Florist', 'بائع زهور', 'local_florist'],
    pizzeria: ['Pizzeria', 'Pizzeria', 'بيتزيريا', 'local_pizza'],
    fastfood: ['Restauration rapide', 'Fast food', 'وجبات سريعة', 'lunch_dining'],
    traiteur: ['Traiteur', 'Caterer', 'ممون حفلات', 'restaurant'],
  };

  function lang() {
    var l = '';
    try { l = localStorage.getItem('kiwiLang') || ''; } catch (_) {}
    l = l || (document.documentElement.getAttribute('lang') || 'fr');
    return l === 'en' || l === 'ar' ? l : 'fr';
  }
  function t(key, n) {
    var s = T[key][{ fr: 0, en: 1, ar: 2 }[lang()]];
    return n == null ? s : s.replace('{n}', String(n));
  }
  function trade(type) {
    var row = TRADES[String(type || '').toLowerCase()];
    if (!row) return { label: '', icon: 'storefront' };
    return { label: row[{ fr: 0, en: 1, ar: 2 }[lang()]], icon: row[3] };
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function link() { return window.KiwiCaisseLink || null; }
  function reduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  }

  /* The till record for one of the account's stores. The store this dashboard
   * shows goes through currentBiz() (venue id, trade and city as before); any
   * other comes from the server registry, enriched by this browser's copy of
   * that venue when it has one. The till accepts the exact trade in `type`. */
  function bizFor(store, current) {
    if (current && current.merchant === store.merchant) return current;
    var venue = null;
    try {
      var list = JSON.parse(localStorage.getItem('kiwiCustomVenues') || '[]');
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (v && (v.slug === store.merchant || v.id === 'v-' + store.merchant)) { venue = v; break; }
      }
    } catch (_) {}
    return {
      merchant: store.merchant,
      venueId: (venue && venue.id) || '',
      type: store.type || (venue && venue.subtype) || (venue && venue.type) || '',
      subtype: (venue && venue.subtype) || store.type || '',
      name: store.name || (venue && venue.name) || store.merchant,
      location: store.city || (venue && venue.location) || '',
    };
  }

  /* Every store of the account, the one on screen first. */
  function storesOf(current) {
    var me = window.KiwiMe || null;
    var raw = me && Array.isArray(me.stores) ? me.stores : [];
    var seen = {}, out = [];
    raw.forEach(function (s) {
      var m = s && String(s.merchant || '').trim();
      if (!m || seen[m]) return;
      seen[m] = true;
      out.push({ merchant: m, name: String(s.name || '').trim(), type: String(s.type || ''), city: String(s.city || '').trim() });
    });
    if (current && current.merchant && !seen[current.merchant]) {
      out.push({ merchant: current.merchant, name: current.name, type: current.type || current.subtype, city: current.location });
    }
    out.sort(function (a, b) {
      if (current && a.merchant === current.merchant) return -1;
      if (current && b.merchant === current.merchant) return 1;
      return (a.name || a.merchant).localeCompare(b.name || b.merchant, 'fr');
    });
    return out;
  }

  var CSS = [
    '.kiwi-lock-inner[data-klt] .kiwi-lock-pin,.kiwi-lock-inner[data-klt] .kiwi-lock-help,.kiwi-lock-inner[data-klt] .kiwi-lock-skip,',
    '.kiwi-lock-inner[data-klt] .kiwi-lock-switch{display:none !important;}',
    '.klt-pick{position:relative;display:flex;flex-direction:column;gap:4px;width:100%;margin:-8px 0 6px;text-align:start;}',
    '.klt-row{position:relative;display:grid;grid-template-columns:40px 1fr auto auto;align-items:center;gap:12px;width:100%;',
    '  min-height:60px;padding:8px 12px;border:0;border-radius:14px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:start;',
    '  transition:color .2s ease;}',
    '.klt-row:focus-visible{outline:2px solid var(--atlas);outline-offset:2px;}',
    '.klt-ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;',
    '  background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas);transition:background .2s ease,color .2s ease;}',
    '.klt-ic i{width:22px;height:22px;background:currentColor;-webkit-mask:var(--ic) center/contain no-repeat;mask:var(--ic) center/contain no-repeat;}',
    '.klt-txt{display:flex;flex-direction:column;min-width:0;gap:2px;}',
    '.klt-txt b{font-size:15.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.klt-txt small{font-size:12.5px;color:color-mix(in srgb,currentColor 62%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.klt-here{font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:999px;',
    '  background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas);white-space:nowrap;}',
    '.klt-key{min-width:22px;height:22px;padding:0 6px;border-radius:6px;display:grid;place-items:center;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;',
    '  border:1px solid color-mix(in srgb,currentColor 22%,transparent);color:color-mix(in srgb,currentColor 70%,transparent);}',
    '.klt-row.on .klt-key{border-color:color-mix(in srgb,var(--paper) 40%,transparent);color:var(--paper);}',
    '@media (hover:none){.klt-key{display:none;}}',
    '.klt-pick .klt-lens{border-radius:14px;background:linear-gradient(135deg,var(--atlas) 0%,var(--riad) 100%);',
    '  box-shadow:0 6px 18px -8px rgba(11,110,79,.55),inset 0 1px 0 rgba(255,255,255,.14);z-index:0;}',
    '.klt-pick>.klt-row{z-index:1;}',
    '.klt-row.on{color:var(--paper);}',
    '.klt-pick:not([data-kw-lens]) .klt-row.on{background:linear-gradient(135deg,var(--atlas) 0%,var(--riad) 100%);}',
    '.klt-row.on .klt-ic{background:color-mix(in srgb,var(--paper) 20%,transparent);color:var(--paper);}',
    '.klt-row.on .klt-here{background:color-mix(in srgb,var(--paper) 92%,transparent);color:var(--riad);}',
    '.klt-back{display:inline-flex;align-items:center;gap:6px;margin-top:6px;min-height:40px;padding:0 12px;border:0;border-radius:10px;',
    '  background:transparent;color:inherit;opacity:.72;font:inherit;font-size:13.5px;cursor:pointer;}',
    '.klt-back:hover{opacity:1;}',
    '.klt-back:focus-visible{outline:2px solid var(--atlas);outline-offset:2px;}',
    '.klt-back i{width:18px;height:18px;background:currentColor;-webkit-mask:url(assets/icons/material/arrow_back.svg) center/contain no-repeat;mask:url(assets/icons/material/arrow_back.svg) center/contain no-repeat;}',
    'html[dir="rtl"] .klt-back i{transform:scaleX(-1);}',
    /* The opening ticket: thermal paper fed from a slot, one line at a time. */
    '.klt-slot{width:min(292px,100%);height:9px;margin:8px auto 0;border-radius:9px;background:color-mix(in srgb,var(--ink) 82%,var(--riad));',
    '  box-shadow:inset 0 3px 4px rgba(0,0,0,.6),0 1px 0 rgba(255,255,255,.7);}',
    'html[data-theme="dark"] .klt-slot{background:#000;}',
    '.klt-ticket{width:min(272px,100%);margin:-5px auto 8px;overflow:hidden;max-height:0;',
    '  animation:klt-feed .78s steps(13,end) forwards;filter:drop-shadow(0 10px 16px rgba(10,15,13,.14));}',
    '.klt-paper{padding:16px 18px 22px;background:color-mix(in srgb,var(--paper) 55%,#FFFDFA);color:var(--ink);text-align:center;',
    '  -webkit-mask:linear-gradient(#000 0 0) top/100% calc(100% - 8px) no-repeat,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/12px 8px repeat-x;',
    '          mask:linear-gradient(#000 0 0) top/100% calc(100% - 8px) no-repeat,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/12px 8px repeat-x;}',
    '.klt-paper b{display:block;font-size:17px;font-weight:600;letter-spacing:-.01em;}',
    '.klt-paper small{display:block;margin-top:2px;font-size:12.5px;color:color-mix(in srgb,var(--ink) 60%,transparent);}',
    '.klt-cut{margin:12px 0;border-top:1.5px dashed color-mix(in srgb,var(--ink) 28%,transparent);}',
    '.klt-line{display:flex;justify-content:space-between;gap:10px;font-size:13px;}',
    '.klt-line span{font-variant-numeric:tabular-nums;letter-spacing:.02em;}',
    '.klt-bye{font-size:13px;font-weight:600;color:var(--atlas);}',
    '@keyframes klt-feed{to{max-height:260px;}}',
    'html[data-theme="dark"] .klt-paper{background:var(--paper);color:var(--ink);}',
    '@media (prefers-reduced-motion:reduce){.klt-ticket{animation:none;max-height:none;}.klt-row,.klt-ic{transition:none;}}',
  ].join('\n');
  function css() {
    if (document.getElementById('klt-css')) return;
    var s = document.createElement('style');
    s.id = 'klt-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── the opening ticket, then the till ─────────────────────────────────── */
  var leaving = false;
  function open(biz, inner) {
    if (leaving) return;
    leaving = true;
    var L = link();
    if (L && L.handOff) L.handOff(biz);
    var go = function () { location.href = 'kiwi-caisse.html?pair=1'; };
    if (!inner || reduced()) { go(); return; }
    css();
    inner.style.minHeight = inner.offsetHeight + 'px';
    inner.setAttribute('data-klt', 'open');
    var head = inner.querySelector('.kiwi-lock-title'), sub = inner.querySelector('.kiwi-lock-sub');
    if (head) head.textContent = t('opening');
    if (sub) sub.textContent = '';
    var pick = inner.querySelector('.klt-pick'), back = inner.querySelector('.klt-back');
    if (pick) pick.remove();
    if (back) back.remove();
    var now = new Date();
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var date = p2(now.getDate()) + '/' + p2(now.getMonth() + 1) + '/' + now.getFullYear();
    var time = p2(now.getHours()) + ':' + p2(now.getMinutes());
    var tr = trade(biz.type || biz.subtype);
    var where = [biz.location, tr.label].filter(Boolean).join(' · ');
    var box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.style.width = '100%';
    box.style.marginBlock = 'auto';
    box.innerHTML = '<div class="klt-slot" aria-hidden="true"></div><div class="klt-ticket"><div class="klt-paper">'
      + '<b>' + esc(biz.name) + '</b>' + (where ? '<small>' + esc(where) + '</small>' : '')
      + '<div class="klt-cut"></div>'
      + '<div class="klt-line"><span>' + date + '</span><span>' + time + '</span></div>'
      + '<div class="klt-cut"></div>'
      + '<div class="klt-bye">' + esc(t('goodDay')) + '</div>'
      + '</div></div>';
    inner.appendChild(box);
    var ticket = box.querySelector('.klt-ticket');
    var done = false;
    var finish = function () { if (done) return; done = true; setTimeout(go, 260); };
    ticket.addEventListener('animationend', finish);
    setTimeout(finish, 1200);
    /* A second click means « just open it ». */
    inner.addEventListener('click', function () { done = true; go(); }, { once: true });
  }

  /* ── the picker ────────────────────────────────────────────────────────── */
  function choose(stores, current, a) {
    var inner = a.closest('.kiwi-lock-inner');
    if (!inner) { open(current, null); return; }
    css();
    var title = inner.querySelector('.kiwi-lock-title'), sub = inner.querySelector('.kiwi-lock-sub');
    var was = { title: title ? title.textContent : '', sub: sub ? sub.textContent : '' };
    if (title) title.textContent = t('choose');
    if (sub) sub.textContent = t('count', stores.length);
    inner.setAttribute('data-klt', 'choose');

    var pick = document.createElement('div');
    pick.className = 'klt-pick';
    pick.setAttribute('role', 'listbox');
    pick.setAttribute('aria-label', t('choose'));
    pick.innerHTML = stores.map(function (s, i) {
      var tr = trade(s.type);
      var line = [s.city, tr.label].filter(Boolean).join(' · ');
      var mine = current && s.merchant === current.merchant;
      return '<button type="button" role="option" class="klt-row' + (i === 0 ? ' on' : '') + '" data-lens-item data-i="' + i + '" aria-selected="' + (i === 0) + '">'
        + '<span class="klt-ic" aria-hidden="true"><i style="--ic:url(assets/icons/material/' + tr.icon + '.svg)"></i></span>'
        + '<span class="klt-txt"><b>' + esc(s.name || s.merchant) + '</b>' + (line ? '<small>' + esc(line) + '</small>' : '') + '</span>'
        + (mine ? '<span class="klt-here">' + esc(t('here')) + '</span>' : '<span></span>')
        + (i < 9 ? '<kbd class="klt-key" aria-hidden="true">' + (i + 1) + '</kbd>' : '<span></span>')
        + '</button>';
    }).join('');
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'klt-back';
    back.innerHTML = '<i aria-hidden="true"></i>' + esc(t('back'));
    var anchor = inner.querySelector('.kiwi-lock-pin');
    inner.insertBefore(pick, anchor || null);
    inner.insertBefore(back, anchor || null);
    var rows = Array.prototype.slice.call(pick.querySelectorAll('.klt-row'));
    if (window.KiwiLens && window.KiwiLens.attach) {
      try {
        window.KiwiLens.attach(pick, { item: '.klt-row', axis: 'y', className: 'klt-lens',
          active: function (el) { return el.classList.contains('on'); } });
      } catch (_) {}
    }

    var at = 0;
    function mark(i) {
      if (i < 0 || i >= rows.length || i === at) return;
      rows[at].classList.remove('on'); rows[at].setAttribute('aria-selected', 'false');
      at = i;
      rows[at].classList.add('on'); rows[at].setAttribute('aria-selected', 'true');
    }
    function pickAt(i) {
      var s = stores[i];
      if (!s) return;
      close(false);
      open(bizFor(s, current), inner);
    }
    function close(restore) {
      window.removeEventListener('keydown', onKey, true);
      if (!restore) return;
      pick.remove(); back.remove();
      inner.removeAttribute('data-klt');
      if (title) title.textContent = was.title;
      if (sub) sub.textContent = was.sub;
      a.removeAttribute('aria-busy');
      try { a.focus(); } catch (_) {}
    }
    /* The lock sends every key to the hidden code field; while the list is
     * up the keys are the list's. Window capture runs before that. */
    function onKey(e) {
      if (!pick.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
      var k = e.key;
      if (k === 'Tab') { e.stopPropagation(); return; }
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
      var n = /^[1-9]$/.test(k) ? Number(k) - 1 : -1;
      var rtl = document.documentElement.getAttribute('dir') === 'rtl';
      if (k === 'ArrowDown' || k === (rtl ? 'ArrowLeft' : 'ArrowRight')) { mark(Math.min(rows.length - 1, at + 1)); rows[at].focus(); }
      else if (k === 'ArrowUp' || k === (rtl ? 'ArrowRight' : 'ArrowLeft')) { mark(Math.max(0, at - 1)); rows[at].focus(); }
      else if (k === 'Home') { mark(0); rows[at].focus(); }
      else if (k === 'End') { mark(rows.length - 1); rows[at].focus(); }
      else if (k === 'Enter' || k === ' ') {
        var f = rows.indexOf(document.activeElement);
        if (document.activeElement === back) close(true); else pickAt(f >= 0 ? f : at);
      }
      else if (n >= 0 && n < rows.length) { mark(n); pickAt(n); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener('keydown', onKey, true);
    pick.addEventListener('pointermove', function (e) {
      var r = e.target.closest && e.target.closest('.klt-row');
      if (r) mark(rows.indexOf(r));
    });
    pick.addEventListener('focusin', function (e) {
      var r = e.target.closest && e.target.closest('.klt-row');
      if (r) mark(rows.indexOf(r));
    });
    /* Stop here, or the lock's own click handler hands focus back to the
     * code field under the list. */
    pick.addEventListener('click', function (e) {
      e.stopPropagation();
      var r = e.target.closest && e.target.closest('.klt-row');
      if (r) pickAt(rows.indexOf(r));
    });
    back.addEventListener('click', function (e) { e.stopPropagation(); close(true); });
    setTimeout(function () { try { rows[0].focus(); } catch (_) {} }, 30);
  }

  /* ── the button ────────────────────────────────────────────────────────── */
  function onClick(e) {
    var a = e.target && e.target.closest && e.target.closest('.kiwi-lock-caisse');
    if (!a) return;
    if (window.KiwiEnv && window.KiwiEnv.isReal && !window.KiwiEnv.isReal()) return;
    e.preventDefault();
    e.stopPropagation();
    if (a.getAttribute('aria-busy') === 'true') return;
    a.setAttribute('aria-busy', 'true');
    var tries = 0;
    (function go() {
      var L = link();
      var current = L && L.currentBiz ? L.currentBiz() : null;
      if (current && current.merchant) {
        var stores = storesOf(current);
        if (stores.length > 1) choose(stores, current, a);
        else open(current, a.closest('.kiwi-lock-inner'));
        return;
      }
      if (++tries < 25) { setTimeout(go, 200); return; }
      a.removeAttribute('aria-busy');
      try { window.Kiwi && window.Kiwi.toast && window.Kiwi.toast(t('noStore'), { type: 'warn' }); } catch (_) {}
    })();
  }
  document.addEventListener('click', onClick, true);
})();
