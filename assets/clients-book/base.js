/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CARNET CLIENTS  (assets/clients-book.js) — the CAISSE half of Fidélité.
 * ---------------------------------------------------------------------------
 * A vertical-agnostic "Clients" screen for the till: the employee adds a client
 * (name + phone + consent), looks them up, records a purchase/visit, and watches
 * fidelity points / stamps accrue. Everything it writes lands in the shared
 * KiwiClients book (kiwi:clients:v1:<merchant>), so the owner's dashboard shows
 * the same list live — one brain, zero backend (assets/clients-store.js).
 *
 * Surfaced by a small corner launcher that appears ONLY on a paired terminal, so
 * the pitch demo verticals (PIN 0002-0015, no pairing) stay untouched. Opens a
 * full-screen panel over whatever vertical is running; reuses the shared
 * #toast-stack. Self-injected CSS, inline SVG icons, no dependencies.
 *
 * Load order (kiwi-caisse.html): AFTER venue-store.js + clients-store.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (!window.KiwiClients) { console.warn('clients-book.js: KiwiClients missing (load clients-store.js first)'); return; }
  var KC = window.KiwiClients;
  var redemptionRequests = {};

  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  // Libellés de la caisse : passent par son dictionnaire quand il est chargé.
  function tr(s) { return window.KiwiCaisseLang ? window.KiwiCaisseLang.tr(s) : s; }
  function fmt(n, withUnit) {
    if (withUnit && document.documentElement.hasAttribute('data-k-till') && window.KiwiKit) {
      return window.KiwiKit.numHtml(window.KiwiKit.fmt().money(n, Number.isInteger(Number(n)) ? 0 : 2));
    }
    var v = Math.round((Number(n) || 0) * 100) / 100, d = Number.isInteger(v) ? 0 : 2;
    return window.KiwiNumber?.format ? window.KiwiNumber.format(v, { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\u202f\u00a0]/g, '\u00a0') : window.KiwiClientNumbers.money(v);
  }
  /* Dernière journée commerciale où un avoir reste utilisable : le serveur le
     fait expirer à la bascule (05:00) qui clôt cette journée, dont la date civile
     serait le lendemain. Même lecture que la caisse (pos-boutique et pos-maison, sales.js). */
  function creditLastDay(until) {
    var t = Number(until) || 0, day = '';
    try { if (window.KiwiDayReport && window.KiwiDayReport.businessDay) day = String(window.KiwiDayReport.businessDay(t - 1)); } catch (_) {}
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(t - 5 * 3600000 - 1);
  }
  function paired() { try { return !!(window.KiwiCaissePairing && KiwiCaissePairing.isPaired && KiwiCaissePairing.isPaired()); } catch (_) { return false; } }
  function hospitalityMode() {
    try {
      if (document.body.classList.contains('is-pos-hotel')) return true;
      var p = window.KiwiCaissePairing && KiwiCaissePairing.pairedVenue && KiwiCaissePairing.pairedVenue();
      return !!(p && String(p.type || p.subtype || '').toLowerCase() === 'hotel');
    } catch (_) { return false; }
  }
  // A visible caisse chrome we can hang a NATIVE "Clients" entry off of — every
  // pos vertical + pressing render a <nav class="XX-nav">, the main café/resto
  // caisse a .act-selector. When one is on screen we inject there (wireCaisseEntry)
  // and hide the floating launcher — the chip is only a fallback for the unknown.
  function integrationHost() {
    var hosts = document.querySelectorAll('nav[class$="-nav"], .act-selector');
    for (var i = 0; i < hosts.length; i++) { if (hosts[i].offsetParent !== null) return hosts[i]; }
    return null;
  }
  /* The till's code doors (caisse-pairing.js, assets/kit/till-pin.js): while
     the lock or the pairing pad shows, nobody has entered a code yet, so the
     customer book (names, phones, credit) stays shut. The chip used to float
     over the lock screen and open the book to anyone (owner, 2026-10-23). */
  function tillLocked() {
    return ['cp-pin-screen', 'cp-screen'].some(function (id) {
      var s = document.getElementById(id);
      return !!(s && s.style.display !== 'none' && getComputedStyle(s).display !== 'none');
    });
  }
  /* La caisse 2027 porte le carnet sur son rail (caisse-app.js, tillKitRail). */
  function kitRail() { return document.documentElement.hasAttribute('data-k-till'); }
  function shouldShow() { return !tillLocked() && !integrationHost() && !kitRail() && !!KC.bookId() && (paired() || KC.count() > 0); }

  function toast(msg, desc) {
    if (window.KiwiCaisseLang) { msg = window.KiwiCaisseLang.tr(msg); if (desc) desc = window.KiwiCaisseLang.tr(desc); }
    try {
      var stack = document.getElementById('toast-stack');
      if (stack) {
        var el = document.createElement('div'); el.className = 'toast';
        el.innerHTML = '<div style="font-weight:600">' + esc(msg) + '</div>' + (desc ? '<div style="opacity:.7;font-size:.85em;margin-top:2px">' + esc(desc) + '</div>' : '');
        stack.appendChild(el);
        setTimeout(function () { el.classList.add('fade'); }, 2200);
        setTimeout(function () { el.remove(); }, 2480);
        return;
      }
    } catch (_) {}
    try {
      if (document.body) {
        var fb = document.createElement('div');
        fb.setAttribute('role', 'alert');
        fb.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:8px 16px;border-radius:8px;z-index:99999;font-size:14px;';
        fb.innerHTML = '<div style="font-weight:600">' + esc(msg) + '</div>' + (desc ? '<div style="opacity:.7;font-size:.85em;margin-top:2px">' + esc(desc) + '</div>' : '');
        document.body.appendChild(fb);
        setTimeout(function () { fb.remove(); }, 2500);
      }
    } catch (_) {}
  }

  var ICON = {
    users: '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Zm220 160Zm68 192 112-112q11-11 17.5-26t6.5-32q0-34-24-58t-58-24q-19 0-37.5 11T520-492q-30-28-47-38t-35-10q-34 0-58 24t-24 58q0 17 6.5 32t17.5 26l112 112q12 12 28 12t28-12Z"/></svg>',
    userplus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  };

  var SEG_LBL = { reg: 'Régulier', vip: 'VIP', new: 'Nouveau', win: 'Dormant' };

  /* ── styles ─────────────────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('kcb-style')) return;
    var s = document.createElement('style'); s.id = 'kcb-style';
    s.textContent = [
      /* launcher chip */
      '#kcb-chip{position:fixed;right:18px;bottom:18px;z-index:930;display:inline-flex;align-items:center;gap:9px;',
      'background:var(--riad,#053B2C);color:#fff;border:0;border-radius:999px;padding:12px 18px 12px 15px;',
      'font:600 .9rem/1 "Inter Tight",Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 26px rgba(5,59,44,.34);',
      'transition:transform .15s,box-shadow .15s;}',
      '#kcb-chip:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(5,59,44,.42);}',
      '#kcb-chip svg{width:19px;height:19px;color:var(--mint,#7DF2B0);}',
      '#kcb-chip .kcb-badge{background:var(--mint,#7DF2B0);color:var(--riad,#053B2C);font-size:.72rem;font-weight:700;border-radius:999px;padding:1px 7px;min-width:18px;text-align:center;}',
      '@media (max-width:600px){#kcb-chip{right:12px;bottom:12px;padding:11px 15px 11px 13px;}#kcb-chip .kcb-lbl{display:none;}}',
      /* root overlay */
      /* Inset over the caisse working area (positioned in JS to sit right of the
         nav rail, below the top bar) so the caisse chrome stays visible — like the
         "Plan d'sala" floor-plan view. inset:0 here is the full-bleed fallback. */
      '#kcb-root{position:fixed;inset:0;z-index:940;background:var(--paper,#F7F5F0);display:flex;flex-direction:column;overflow:hidden;',
      'border-inline-start:1px solid rgba(10,15,13,.10);box-shadow:-22px 0 55px -30px rgba(5,20,14,.55);border-start-start-radius:16px;',
      'font-family:"Inter Tight",Inter,system-ui,sans-serif;color:var(--ink,#0A0F0D);animation:kcb-fade .2s ease;}',
      '@keyframes kcb-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes kcb-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
      /* #102 · the Clients page speaks the same language as Vendus / Échanges :
         a titled page, one KPI strip, one toolbar, one list card. */
      '#kcb-root .kcb-scroll{flex:1;overflow-y:auto;}',
      '#kcb-root .kcb-page{padding:24px;max-width:1280px;margin:0 auto;box-sizing:border-box;}',
      '#kcb-root .kcb-top{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:18px;}',
      '#kcb-root .kcb-top h2{margin:0;font-size:28px;font-weight:700;letter-spacing:-.01em;line-height:1.3;}',
      '#kcb-root .kcb-prog{display:block;font-size:12px;color:var(--n-500,#6f6c65);margin-top:5px;}',
      '#kcb-root .kcb-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--n-200,#dedbd5);border:1px solid var(--n-200,#dedbd5);border-radius:18px;overflow:hidden;margin-bottom:18px;box-shadow:0 1px 2px rgba(10,15,13,.04),0 10px 26px -16px rgba(10,15,13,.1);}',
      '#kcb-root .kcb-strip .kx-kpi{background:var(--surface,#fff);padding:15px 18px 16px;min-width:0;}',
      '#kcb-root .kcb-strip .l{font-size:10px;line-height:1.3;font-weight:500;letter-spacing:.075em;color:var(--n-500,#6f6c65);text-transform:uppercase;}',
      '#kcb-root .kcb-strip .v{font-size:29px;line-height:1.02;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.032em;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#kcb-root .kcb-strip .v .u{font-size:12.5px;font-weight:500;letter-spacing:0;color:var(--n-500,#6f6c65);margin-left:4px;}',
      '#kcb-root .kcb-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}',
      '#kcb-root .kcb-searchwrap{flex:1 1 260px;position:relative;min-width:0;}',
      '#kcb-root .kcb-searchwrap svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:var(--n-500,#6f6c65);}',
      '#kcb-root .kcb-search{width:100%;box-sizing:border-box;height:44px;padding:0 14px 0 40px;border:1px solid var(--n-200,#dedbd5);border-radius:12px;font-size:.95rem;background:var(--surface);color:var(--ink,#0A0F0D);}',
      '#kcb-root .kcb-search:focus{outline:none;border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 3px rgba(11,110,79,.12);}',
      '#kcb-root .kx-tabs{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:var(--n-100,#efece3);flex-wrap:wrap;}',
      '#kcb-root .kx-tab{border:0;background:transparent;color:var(--n-600,#55524c);font-family:inherit;font-size:12px;font-weight:600;line-height:1;padding:0 12px;height:36px;border-radius:9px;cursor:pointer;white-space:nowrap;touch-action:manipulation;}',
      '#kcb-root .kx-tab.on{background:var(--surface);color:var(--ink,#0A0F0D);box-shadow:0 1px 2px rgba(0,0,0,.05);}',
      '#kcb-root .kx-tabs[data-kw-lens] .kx-tab.on{background:transparent;box-shadow:none;}',  /* liquid-lens.js carries the fill */
      '#kcb-root .kx-tab b{font-weight:600;color:var(--n-500,#6f6c65);margin-left:5px;font-variant-numeric:tabular-nums;}',
      '#kcb-root .kcb-add{display:inline-flex;align-items:center;gap:8px;background:var(--atlas,#0B6E4F);color:#fff;border:0;border-radius:12px;height:44px;padding:0 18px;font-family:inherit;font-size:.92rem;font-weight:600;line-height:1;cursor:pointer;white-space:nowrap;touch-action:manipulation;}',
      '#kcb-root .kcb-add svg{width:18px;height:18px;}',
      '#kcb-root .kcb-list{background:var(--surface);border:1px solid var(--n-200,#dedbd5);border-radius:18px;overflow:hidden;}',
      '#kcb-root .kcb-list:has(.kcb-empty){background:transparent;border:0;}',
      '#kcb-root .kcb-cols,.kcb-row{display:grid;grid-template-columns:minmax(0,2.2fr) 110px 90px 120px 120px minmax(0,1.3fr);align-items:center;gap:14px;padding:0 18px;}',
      '#kcb-root .kcb-cols{height:38px;font-size:10px;font-weight:600;letter-spacing:.075em;text-transform:uppercase;color:var(--n-500,#6f6c65);border-bottom:1px solid var(--n-200,#dedbd5);background:var(--paper-soft,#f5f3ef);}',
      '#kcb-root .kcb-cols .r,.kcb-row .r{text-align:right;}',
      '#kcb-root .kcb-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:54px 24px 56px;border:1px dashed var(--n-200,#dedbd5);border-radius:18px;background:var(--paper-soft,#f5f3ef);color:var(--n-500,#6f6c65);}',
      '#kcb-root .kcb-empty .ico{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:var(--surface);border:1px solid var(--n-200,#dedbd5);color:var(--atlas,#0B6E4F);margin-bottom:15px;}',
      '#kcb-root .kcb-empty .ico svg{width:22px;height:22px;}',
      '#kcb-root .kcb-empty b{display:block;font-size:16.5px;letter-spacing:-.02em;color:var(--ink,#0A0F0D);margin-bottom:8px;font-weight:600;}',
      '#kcb-root .kcb-empty div{font-size:13.5px;line-height:1.55;max-width:42ch;}',
      /* client row */
      '.kcb-row{min-height:64px;border-top:1px solid var(--n-100,#efece3);cursor:pointer;transition:background .12s;}',
      '.kcb-row:first-of-type{border-top:0;}',
      '.kcb-row:hover{background:color-mix(in srgb,var(--atlas,#0B6E4F) 5%,transparent);}',
      '.kcb-row:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:-2px;}',
      '.kcb-who{display:flex;align-items:center;gap:12px;min-width:0;}',
      '.kcb-av{width:44px;height:44px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:700;font-size:1rem;color:#fff;background:var(--atlas,#0B6E4F);}',
      '.kcb-row .kcb-av{width:36px;height:36px;font-size:.8rem;color:var(--riad,#053B2C);background:color-mix(in srgb,var(--atlas,#0B6E4F) 13%,var(--surface,#fff));}',
      /* Two lines, never cut at seven letters: at 1024 px the one-line ellipsis
         showed « Fatima-Z… » and hid the avoir chip that rides on the name. */
      '.kcb-row .kcb-nm{font-weight:600;font-size:.95rem;line-height:1.25;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;}',
      '.kcb-row .kcb-ph{font-size:.8rem;color:var(--n-500,#6f6c65);margin-top:2px;font-variant-numeric:tabular-nums;}',
      '.kcb-num{font-size:.9rem;font-weight:600;font-variant-numeric:tabular-nums;}',
      '.kcb-num small{font-weight:500;color:var(--n-500,#6f6c65);font-size:.72rem;margin-left:3px;}',
      '.kcb-muted{color:var(--n-500,#6f6c65);font-weight:500;}',
      '.kcb-fid{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:0;}',
      '.kcb-fid .kcb-minibar{width:100%;max-width:140px;height:4px;border-radius:9px;background:var(--n-100,#efece3);overflow:hidden;}',
      '.kcb-fid .kcb-minibar i{display:block;height:100%;background:var(--atlas,#0B6E4F);border-radius:9px;}',
      '.kcb-ready{font-size:.68rem;font-weight:600;color:#075238;background:var(--mint-soft,#E6FbEF);padding:2px 8px;border-radius:999px;}',
      '.kcb-credit{display:inline-block;font-size:.72rem;font-weight:600;color:#8A6210;background:#FBF0D6;padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:1px;}',
      '.kcb-pts{font-weight:700;font-size:1rem;color:var(--atlas,#0B6E4F);}',
      '.kcb-pts small{font-weight:500;color:rgba(10,15,13,.64);font-size:.72rem;}',
      '.kcb-seg{display:inline-block;font-size:.68rem;font-weight:600;padding:2px 9px;border-radius:999px;}',
      '.kcb-seg.reg{background:#E6FbEF;color:#075238;}.kcb-seg.vip{background:#FBF0D6;color:#8A6210;}',
      '.kcb-seg.new{background:#E4ECF8;color:#3E78C9;}.kcb-seg.win{background:#FBE3DD;color:color-mix(in srgb,#C0492F 80%,var(--ink,#0A0F0D));}',
      /* iPad landscape and small laptops: the four fixed columns left the name
         80 px. Profil goes (the segment tabs above carry it); the counts take what they need. */
      '@media (min-width:901px) and (max-width:1180px){#kcb-root .kcb-cols,.kcb-row{grid-template-columns:minmax(0,1fr) 70px 100px 120px 132px;}#kcb-root .kcb-c-seg{display:none;}#kcb-root .kcb-ready{white-space:nowrap;}}',
      '@media (max-width:900px){#kcb-root .kcb-page{padding:16px;}#kcb-root .kcb-top{align-items:flex-start;}#kcb-root .kcb-strip{grid-template-columns:repeat(2,minmax(0,1fr));}',
        '#kcb-root .kcb-cols{display:none;}.kcb-row{grid-template-columns:minmax(0,1fr) auto;padding:10px 14px;}.kcb-row .kcb-c-seg,.kcb-row .kcb-c-visits,.kcb-row .kcb-c-last,.kcb-row .kcb-c-spend{display:none;}.kcb-row .kcb-nm{-webkit-line-clamp:3;}}',
      /* Phone : the carnet is a full page with its own way out. The desk page
         leaves by touching the next rail entry; a phone's rail is a drawer the
         carnet sits on top of, so it carries a close control (hidden on desk). */
      '#kcb-root .kcb-back{display:none;}',
      '@media (max-width:860px),(orientation:landscape) and (max-width:1024px) and (max-height:600px){',
        '#kcb-root{border-inline-start:0;border-start-start-radius:0;box-shadow:none;}',
        '#kcb-root .kcb-page{padding:calc(14px + var(--kiwi-safe-top,env(safe-area-inset-top,0px))) 16px calc(28px + var(--kiwi-safe-bottom,env(safe-area-inset-bottom,0px)));}',
        '#kcb-root .kcb-top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;}',
        '#kcb-root .kcb-top > div:first-child{grid-column:1;grid-row:1;}',
        '#kcb-root .kcb-back{display:grid;grid-column:2;grid-row:1;}',
        '#kcb-root .kcb-add{grid-column:1 / -1;grid-row:2;justify-content:center;}',
      '}',
      /* Beside the 2027 till's rail the book is a page at every width: no
         cross, the title row of the wide layout. */
      '#kcb-root[data-rail] .kcb-back{display:none;}',
      '#kcb-root[data-rail] .kcb-top{display:flex;}',
      '#kcb-root[data-rail] .kcb-add{justify-content:normal;}',
      /* 2027 type: figures' labels in sentence case, not tracked capitals. */
      'html[data-k-till] #kcb-root .kcb-strip .l{text-transform:none;letter-spacing:0;font-size:13px;}',
      /* sheet (add/edit/detail) */
      '#kcb-sheet{position:fixed;inset:0;z-index:945;background:rgba(5,20,14,.42);display:flex;align-items:flex-end;justify-content:center;animation:kcb-fade .18s ease;}',
      '@media (min-width:640px){#kcb-sheet{align-items:center;}}',
      '#kcb-sheet .kcb-card{width:100%;max-width:520px;max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:var(--paper,#F7F5F0);border-radius:22px 22px 0 0;padding:22px 22px calc(22px + env(safe-area-inset-bottom, 0px));animation:kcb-up .24s cubic-bezier(.32,.72,0,1);}',
      '@media (min-width:640px){#kcb-sheet .kcb-card{border-radius:22px;}}',
      '#kcb-sheet h3{margin:0 0 4px;font-size:1.2rem;font-weight:700;}',
      '#kcb-sheet .kcb-sub{color:rgba(10,15,13,.64);font-size:.86rem;margin-bottom:18px;}',
      '.kcb-x{width:44px;height:44px;min-width:44px;border-radius:12px;border:1px solid rgba(10,15,13,.1);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--ink,#0A0F0D);touch-action:manipulation;}',
      '.kcb-x svg{width:20px;height:20px;}',
      '.kcb-ret{display:block;margin-top:5px;font-size:.78rem;font-weight:600;color:#8A6210;}',
      '.kcb-struck{text-decoration:line-through;text-decoration-thickness:1px;color:rgba(10,15,13,.64);}',
      '.kcb-field{margin-bottom:14px;}',
      '.kcb-field label{display:block;font-size:.78rem;font-weight:600;color:rgba(10,15,13,.6);margin-bottom:6px;}',
      '.kcb-field input{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid rgba(10,15,13,.14);border-radius:12px;font-size:1rem;background:var(--surface);color:var(--ink,#0A0F0D);}',
      '.kcb-field input:focus{outline:none;border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 3px rgba(11,110,79,.12);}',
      '.kcb-field select.kcb-select{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid rgba(10,15,13,.14);border-radius:12px;font-size:1rem;background:var(--surface);color:var(--ink,#0A0F0D);}',
      '.kcb-section{margin:18px 0 12px;padding-top:16px;border-top:1px solid rgba(10,15,13,.09);font-size:.72rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--atlas,#0B6E4F);}',
      '.kcb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      '@media (max-width:520px){.kcb-grid2{grid-template-columns:1fr;}}',
      '.kcb-info{background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:16px;padding:4px 16px;margin-bottom:14px;}',
      '.kcb-inforow{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid rgba(10,15,13,.06);font-size:.9rem;}',
      '.kcb-inforow:first-child{border-top:0;}',
      '.kcb-inforow .k{color:rgba(10,15,13,.64);font-weight:500;}',
      '.kcb-inforow .v{color:var(--ink,#0A0F0D);font-weight:600;text-align:right;word-break:break-word;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-info{background:#141d19;border-color:#26302b;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-inforow .v{color:#eafff3;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-inforow .k{color:#9cb1a6;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-field select.kcb-select{background:#141d19;border-color:#26302b;color:#eafff3;}',
      '.kcb-consent{display:flex;gap:11px;align-items:flex-start;padding:13px 14px;background:var(--surface);border:1px solid rgba(10,15,13,.1);border-radius:12px;cursor:pointer;}',
      '.kcb-consent input{margin-top:2px;width:18px;height:18px;flex:none;accent-color:var(--atlas,#0B6E4F);}',
      '.kcb-consent span{font-size:.82rem;color:rgba(10,15,13,.7);line-height:1.45;}',
      '.kcb-actions{display:flex;gap:10px;margin-top:20px;}',
      '.kcb-btn{flex:1;padding:14px;border-radius:12px;font-family:inherit;font-size:.95rem;font-weight:600;line-height:1;cursor:pointer;border:1px solid transparent;}',
      '.kcb-btn.primary{background:var(--atlas,#0B6E4F);color:#fff;}',
      '.kcb-btn.ghost{background:var(--surface);border-color:rgba(10,15,13,.14);color:var(--ink,#0A0F0D);}',
      '.kcb-btn.danger{background:var(--surface);border-color:rgba(192,73,47,.4);color:#C0492F;flex:none;width:52px;display:grid;place-items:center;}',
      '.kcb-btn.danger svg{width:18px;height:18px;}',
      '.kcb-btn:disabled{opacity:.45;cursor:not-allowed;}',
      /* detail card */
      '.kcb-dhead{display:flex;align-items:center;gap:14px;margin-bottom:18px;}',
      '.kcb-dhead .kcb-av{width:54px;height:54px;font-size:1.2rem;}',
      '.kcb-stat{background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:16px;padding:16px 18px;margin-bottom:14px;}',
      '.kcb-progwrap{height:10px;background:rgba(10,15,13,.08);border-radius:999px;overflow:hidden;margin:12px 0 8px;}',
      '.kcb-progbar{height:100%;background:linear-gradient(90deg,var(--atlas,#0B6E4F),var(--mint,#7DF2B0));border-radius:999px;transition:width .4s cubic-bezier(.32,.72,0,1);}',
      '.kcb-progtxt{font-size:.82rem;color:rgba(10,15,13,.6);}',
      '.kcb-reward{display:flex;align-items:center;gap:10px;background:var(--mint-soft,#E6FbEF);border:1px solid var(--atlas,#0B6E4F);border-radius:14px;padding:13px 15px;margin-bottom:14px;color:#075238;font-weight:600;font-size:.9rem;}',
      '.kcb-reward svg{width:20px;height:20px;color:var(--atlas,#0B6E4F);flex:none;}',
      '.kcb-reward .cost{margin-inline-start:auto;flex:none;font-variant-numeric:tabular-nums;font-size:.82rem;padding:3px 9px;border-radius:999px;background:rgba(7,82,56,.1);}',
      '.kcb-reward-where{margin-top:8px;padding:11px 14px;border-radius:14px;border:1px dashed var(--n-300,#D8D3C8);color:var(--n-600,#5B5A53);font-size:.84rem;font-weight:500;}',
      '.kcb-kpis{display:flex;gap:10px;margin-bottom:14px;}',
      '.kcb-kpi{flex:1;background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:14px;padding:13px 14px;text-align:center;}',
      '.kcb-kpi .v{font-size:1.25rem;font-weight:700;}.kcb-kpi .l{font-size:.72rem;color:rgba(10,15,13,.64);margin-top:2px;}',
      '.kcb-record{background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:16px;padding:16px 18px;margin-bottom:8px;}',
      '.kcb-record .rl{font-size:.78rem;font-weight:600;color:rgba(10,15,13,.6);margin-bottom:10px;}',
      '.kcb-recrow{display:flex;gap:10px;align-items:center;}',
      '.kcb-note{background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:16px;padding:12px 16px 14px;margin-bottom:14px;}',
      '.kcb-note .rl{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.78rem;font-weight:600;color:rgba(10,15,13,.64);margin-bottom:4px;}',
      '.kcb-note .txt{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.95rem;line-height:1.4;}.kcb-note .txt.muted{color:rgba(10,15,13,.64);}',
      '.kcb-note textarea{display:block;width:100%;box-sizing:border-box;min-height:84px;margin-top:6px;padding:12px 14px;border:1px solid rgba(10,15,13,.14);border-radius:12px;font:inherit;font-size:.95rem;background:var(--surface);color:inherit;resize:vertical;}',
      '.kcb-note .acts{display:flex;gap:8px;margin-top:10px;}.kcb-note .acts .kcb-btn{flex:1;}',
      '.kcb-link{border:0;background:none;padding:0 2px;min-height:32px;font:inherit;font-size:.82rem;font-weight:600;color:var(--atlas,#0B6E4F);cursor:pointer;}',
      '.kcb-recrow input{flex:1;min-width:0;box-sizing:border-box;padding:13px 14px;border:1px solid rgba(10,15,13,.14);border-radius:12px;font-size:1.05rem;background:var(--surface);font-variant-numeric:tabular-nums;}',
      '.kcb-big{flex:none;background:var(--atlas,#0B6E4F);color:#fff;border:0;border-radius:12px;padding:14px 20px;font-family:inherit;font-size:1rem;font-weight:600;line-height:1;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;}',
      '.kcb-big svg{width:18px;height:18px;}',
      /* dark */
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root{background:#0d1512;color:#eafff3;border-color:rgba(255,255,255,.07);}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-strip .kx-kpi,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-list,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-stat,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-kpi,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-record,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-note,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-note textarea,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-field input,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-search{background:#141d19;border-color:#26302b;color:#eafff3;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-strip,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-cols,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-empty{background:#101915;border-color:#26302b;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kx-tabs{background:#141d19;border:1px solid #26302b;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kx-tab{color:#a3b8ad;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kx-tab b{color:#7DF2B0;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kx-tab.on{background:#1c2420;color:#eafff3;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-row{border-color:#26302b;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-row .kcb-av{background:#1b2a23;color:#7DF2B0;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-row .kcb-ph{color:#a3b8ad;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-sheet .kcb-card{background:#0d1512;color:#eafff3;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-sheet .kcb-sub{color:#a3b8ad;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-field label{color:#c0d1c7;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-section{color:#7DF2B0;border-top-color:#26302b;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-consent span{color:#d2ded7;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-x{background:#141d19;border-color:#26302b;color:#eafff3;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-ret{color:#e6b84d;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-struck{color:#7e9489;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-progtxt{color:#a3b8ad;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-kpi .l{color:#9cb1a6;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-strip .l{color:#9cb1a6;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-strip .v .u{color:#9cb1a6;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-prog{color:#a3b8ad;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-searchwrap svg{color:#7e9489;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-cols{color:#9cb1a6;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-empty{color:#a3b8ad;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-record .rl{color:#c0d1c7;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-pts small{color:#a3b8ad;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-num small{color:#9cb1a6;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-muted{color:#9cb1a6;}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-consent,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-btn.ghost,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-recrow input{background:#141d19;border-color:#26302b;color:#eafff3;}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ── program label for the header ──────────────────────────────────────── */
  function progLabel() {
    /* Sans programme choisi, aucun point ne s'accumule (KC.recordPurchase) :
       afficher la règle par défaut « 1 pt / MAD » promettait des points qu'une
       cliente ne recevait jamais (0 pt après 250 MAD). */
    if (KC.loyaltyOn && !KC.loyaltyOn()) return 'Fidélité non activée';
    var c = KC.config();
    if (c.model === 'amount') return (c.amount.perMad || 1) + ' pt / MAD · palier ' + (c.amount.threshold || 100);
    if (c.model === 'product') return (c.product.target || 10) + ' ' + (c.product.item || 'achats') + ' = ' + (c.product.reward || '1 offert');
    return (c.visit.target || 10) + ' visites = ' + (c.visit.reward || '1 offert');
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }

