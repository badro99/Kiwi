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

  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function fmt(n) { try { return (window.KiwiNumber?.format((Math.round(n) || 0), {}) ?? (Math.round(n) || 0).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})); } catch (_) { return String(Math.round(n) || 0); } }
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
  function shouldShow() { return !integrationHost() && !!KC.bookId() && (paired() || KC.count() > 0); }

  function toast(msg, desc) {
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
      '.kcb-row .kcb-nm{font-weight:600;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
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
      '.kcb-pts small{font-weight:500;color:rgba(10,15,13,.45);font-size:.72rem;}',
      '.kcb-seg{display:inline-block;font-size:.68rem;font-weight:600;padding:2px 9px;border-radius:999px;}',
      '.kcb-seg.reg{background:#E6FbEF;color:#075238;}.kcb-seg.vip{background:#FBF0D6;color:#8A6210;}',
      '.kcb-seg.new{background:#E4ECF8;color:#3E78C9;}.kcb-seg.win{background:#FBE3DD;color:#C0492F;}',
      '@media (max-width:900px){#kcb-root .kcb-page{padding:16px;}#kcb-root .kcb-top{align-items:flex-start;}#kcb-root .kcb-strip{grid-template-columns:repeat(2,minmax(0,1fr));}',
        '#kcb-root .kcb-cols{display:none;}.kcb-row{grid-template-columns:minmax(0,1fr) auto;padding:10px 14px;}.kcb-row .kcb-c-seg,.kcb-row .kcb-c-visits,.kcb-row .kcb-c-last,.kcb-row .kcb-c-spend{display:none;}}',
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
      /* sheet (add/edit/detail) */
      '#kcb-sheet{position:fixed;inset:0;z-index:945;background:rgba(5,20,14,.42);display:flex;align-items:flex-end;justify-content:center;animation:kcb-fade .18s ease;}',
      '@media (min-width:640px){#kcb-sheet{align-items:center;}}',
      '#kcb-sheet .kcb-card{width:100%;max-width:520px;max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:var(--paper,#F7F5F0);border-radius:22px 22px 0 0;padding:22px 22px calc(22px + env(safe-area-inset-bottom, 0px));animation:kcb-up .24s cubic-bezier(.32,.72,0,1);}',
      '@media (min-width:640px){#kcb-sheet .kcb-card{border-radius:22px;}}',
      '#kcb-sheet h3{margin:0 0 4px;font-size:1.2rem;font-weight:700;}',
      '#kcb-sheet .kcb-sub{color:rgba(10,15,13,.55);font-size:.86rem;margin-bottom:18px;}',
      '.kcb-x{width:44px;height:44px;min-width:44px;border-radius:12px;border:1px solid rgba(10,15,13,.1);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--ink,#0A0F0D);touch-action:manipulation;}',
      '.kcb-x svg{width:20px;height:20px;}',
      '.kcb-ret{display:block;margin-top:5px;font-size:.78rem;font-weight:600;color:#8A6210;}',
      '.kcb-struck{text-decoration:line-through;text-decoration-thickness:1px;color:rgba(10,15,13,.45);}',
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
      '.kcb-inforow .k{color:rgba(10,15,13,.5);font-weight:500;}',
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
      '.kcb-kpis{display:flex;gap:10px;margin-bottom:14px;}',
      '.kcb-kpi{flex:1;background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:14px;padding:13px 14px;text-align:center;}',
      '.kcb-kpi .v{font-size:1.25rem;font-weight:700;}.kcb-kpi .l{font-size:.72rem;color:rgba(10,15,13,.5);margin-top:2px;}',
      '.kcb-record{background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:16px;padding:16px 18px;margin-bottom:8px;}',
      '.kcb-record .rl{font-size:.78rem;font-weight:600;color:rgba(10,15,13,.6);margin-bottom:10px;}',
      '.kcb-recrow{display:flex;gap:10px;align-items:center;}',
      '.kcb-recrow input{flex:1;box-sizing:border-box;padding:13px 14px;border:1px solid rgba(10,15,13,.14);border-radius:12px;font-size:1.05rem;background:var(--surface);font-variant-numeric:tabular-nums;}',
      '.kcb-big{background:var(--atlas,#0B6E4F);color:#fff;border:0;border-radius:12px;padding:14px 20px;font-family:inherit;font-size:1rem;font-weight:600;line-height:1;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;}',
      '.kcb-big svg{width:18px;height:18px;}',
      /* dark */
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root{background:#0d1512;color:#eafff3;border-color:rgba(255,255,255,.07);}',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-strip .kx-kpi,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) #kcb-root .kcb-list,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-stat,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-kpi,',
      ':is(html[data-theme="dark"],html[data-caisse-theme="dark"]) .kcb-record,',
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
    var c = KC.config();
    if (c.model === 'amount') return (c.amount.perMad || 1) + ' pt / MAD · palier ' + (c.amount.threshold || 100);
    if (c.model === 'product') return (c.product.target || 10) + ' ' + (c.product.item || 'achats') + ' = ' + (c.product.reward || '1 offert');
    return (c.visit.target || 10) + ' visites = ' + (c.visit.reward || '1 offert');
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }

  function creditMerchant() {
    try {
      var venue = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (venue && (venue.slug || venue.merchant)) return venue.slug || venue.merchant;
    } catch (_) {}
    try { return localStorage.getItem('kiwiLiveMerchant') || ''; } catch (_) { return ''; }
  }

  /* #105 · La boutique garde ses avoirs et son journal des retours sur la caisse
     (kiwi:bqAvoirs, kiwi:bqReturns ; le journal des retours est aussi poussé au
     cloud). La fiche client ne lisait que le registre serveur : un avoir émis
     au comptoir n'y apparaissait pas, et l'achat retourné restait affiché
     comme s'il ne l'avait jamais été. On lit donc aussi ces deux journaux. */
  function localAvoirs() {
    try { var a = JSON.parse(localStorage.getItem('kiwi:bqAvoirs') || '[]'); return Array.isArray(a) ? a.filter(Boolean) : []; }
    catch (_) { return []; }
  }
  function localReturns() {
    try {
      var d = JSON.parse(localStorage.getItem('kiwi:bqReturns') || 'null');
      var m = creditMerchant();
      if (!d || !Array.isArray(d.list) || (d.m && m && d.m !== m)) return [];
      return d.list.filter(Boolean);
    } catch (_) { return []; }
  }
  function localCreditView(a) {
    var at = a.at ? new Date(a.at).getTime() : 0;
    return {
      code: a.code, status: a.status || (a.balance > 0 ? 'active' : 'consumed'),
      amountCents: Math.round((+a.amount || 0) * 100), balanceCents: Math.round((+a.balance || 0) * 100),
      createdAt: at, expiresAt: a.until ? new Date(a.until).getTime() : 0,
      originalRef: a.from || '', reason: a.motif || 'Retour', issuedBy: 'Caisse',
      events: Array.isArray(a.lines) && a.lines.length ? [{ action: 'issue', lines: a.lines }] : [],
    };
  }
  function clientLocalCredits(clientId) {
    return localAvoirs().filter(function (a) { return a.holderId && a.holderId === clientId; }).map(localCreditView);
  }

  function loadClientCredits(clientId, host) {
    if (!host) return;
    var local = clientLocalCredits(clientId);
    function paint(remote) {
      if (!host.isConnected) return;
      var seen = {};
      var credits = (remote || []).concat(local).filter(function (credit) {
        if (!credit || !credit.code || seen[credit.code]) return false;
        seen[credit.code] = 1; return true;
      });
      var active = credits.reduce(function (sum, credit) {
        return sum + (credit.status === 'active' ? Number(credit.balanceCents || 0) : 0);
      }, 0) / 100;
      host.innerHTML = '<div class="kcb-section">Avoirs · solde ' + fmt(active) + ' MAD</div>' + (credits.length
        ? '<div class="kcb-info">' + credits.map(function (credit) {
            var issued = (credit.events || []).filter(function (event) { return event.action === 'issue'; })[0] || {};
            var products = Array.isArray(issued.lines) && issued.lines.length
              ? issued.lines.map(function (line) { return (line.qty || 1) + '× ' + (line.name || 'Article'); }).join(' · ')
              : (credit.reason || 'Retour');
            var movements = (credit.events || []).filter(function (event) { return event.action !== 'issue'; }).map(function (event) {
              return '<small style="display:block;margin-top:4px">' + esc(event.action === 'redeem' ? 'Utilisé' : event.action === 'cancel' ? 'Annulé' : event.action)
                + ' · ' + fmt(Number(event.amountCents || 0) / 100) + ' MAD · ' + esc(event.actor || 'Caisse')
                + ' · solde ' + fmt(Number(event.balanceAfterCents || 0) / 100) + ' MAD</small>';
            }).join('');
            var issuedAt = credit.createdAt ? new Date(credit.createdAt).toLocaleString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Date inconnue';
            var expiry = credit.expiresAt ? new Date(credit.expiresAt).toLocaleDateString('fr-FR') : 'sans échéance';
            var used = credit.status === 'active' ? '' : ' · ' + (credit.status === 'cancelled' ? 'annulé' : 'utilisé');
            return '<div class="kcb-inforow"><span class="k">' + esc(credit.code) + '<small style="display:block;margin-top:3px">' + esc(issuedAt) + ' · expire ' + esc(expiry) + '</small></span>'
              + '<span class="v"><b>' + fmt(Number(credit.amountCents || 0) / 100) + ' MAD · reste ' + fmt(Number(credit.balanceCents || 0) / 100) + ' MAD' + esc(used) + '</b>'
              + '<small style="display:block;margin-top:3px">Vente ' + esc(credit.originalRef || credit.originalSaleId || '·') + ' · ' + esc(products) + ' · ' + esc(issued.actor || credit.issuedBy || 'Caisse') + '</small>' + movements + '</span></div>';
          }).join('') + '</div>'
        : '<div class="kcb-empty" style="min-height:70px"><b>Aucun avoir</b><div>Les crédits boutique émis à ce client apparaîtront ici.</div></div>');
    }
    paint([]);
    var merchant = creditMerchant();
    if (!merchant || typeof fetch !== 'function') return;
    fetch('/api/store-credits?merchant=' + encodeURIComponent(merchant) + '&customerId=' + encodeURIComponent(clientId),
      { headers: { Accept: 'application/json' } })
      .then(function (response) { return response && response.ok ? response.json() : null; })
      .then(function (data) { paint(data && Array.isArray(data.credits) ? data.credits : []); })
      .catch(function () { /* le registre local reste affiché */ });
  }

  /* ── launcher chip ─────────────────────────────────────────────────────── */
  function ensureChip() {
    if (!shouldShow()) { var ex = document.getElementById('kcb-chip'); if (ex) ex.remove(); return; }
    css();
    var b = document.getElementById('kcb-chip');
    if (!b) {
      b = document.createElement('button'); b.id = 'kcb-chip'; b.type = 'button';
      b.addEventListener('click', open);
      document.body.appendChild(b);
    }
    var n = KC.count();
    b.innerHTML = ICON.users + '<span class="kcb-lbl">' + (hospitalityMode() ? 'Hospitality+' : 'Clients') + '</span>' + (n ? '<span class="kcb-badge">' + n + '</span>' : '');
  }

  /* ── root panel ────────────────────────────────────────────────────────── */
  var state = { q: '', seg: 'all' };
  /* Inset the panel to the caisse working area — right of the nav rail, below the
   * top bar — so the caisse sidebar + top bar stay visible (the "Plan d'sala" look
   * the owner asked for) instead of a full-viewport takeover. Café/resto exposes a
   * 280px .sidebar; pos verticals a vertical nav rail. Unknown layouts fall back to
   * full-bleed (inset:0) so nothing is ever hidden. */
  /* La barre latérale, pas la LISTE de boutons qu'elle contient.
   *
   * On mesurait le `<nav>` trouvé par le sélecteur. Dans la caisse boutique ce
   * `<nav class="bq-nav">` est imbriqué dans `<aside class="bq-rail">` sous le
   * logo et le bloc établissement : son bord haut est à ~270 px du sommet. Le
   * carnet héritait donc de ce 270 px et s'ouvrait à mi-hauteur, décalé, en
   * laissant dépasser l'écran de vente au-dessus de lui — alors que toutes les
   * autres pages du métier occupent la zone de travail entière.
   *
   * On remonte donc les ancêtres tant qu'on reste sur une bande verticale de
   * largeur comparable, et on garde la plus haute. Une caisse dont le `<nav>`
   * EST déjà le rail ne bouge pas d'un pixel : son parent est la page, trop
   * large, et la boucle s'arrête tout de suite. */
  function railBox(el) {
    var best = el.getBoundingClientRect();
    var p = el.parentElement;
    while (p && p !== document.body && p.nodeType === 1) {
      var r = p.getBoundingClientRect();
      if (r.width > best.width * 1.6) break;      // ce n'est plus une bande, c'est la page
      if (r.height > best.height) best = r;
      p = p.parentElement;
    }
    return best;
  }

  function panelInset() {
    var res = { left: 0, top: 0, right: 0, bottom: 0 };
    try {
      var rail = null, cands = document.querySelectorAll('.sidebar, nav[class$="-nav"]');
      for (var i = 0; i < cands.length; i++) {
        var el = cands[i]; if (el.offsetParent === null) continue;
        var rr = railBox(el);
        // a vertical rail hugging a screen edge (taller than wide), not a top bar
        if (rr.height > rr.width * 1.4 && (rr.left < 60 || rr.right > window.innerWidth - 60)) { rail = rr; break; }
      }
      if (rail) {
        res.top = Math.max(0, Math.round(rail.top));
        if (rail.left <= window.innerWidth - rail.right) res.left = Math.max(0, Math.round(rail.right)); // rail on the left
        else res.right = Math.max(0, Math.round(window.innerWidth - rail.left));                         // rail on the right (RTL)
        return res;
      }
      var main = document.querySelector('.main');
      if (main && main.offsetParent !== null) {
        var mr = main.getBoundingClientRect();
        if (mr.width > 120 && mr.height > 120) { res.top = Math.max(0, Math.round(mr.top)); res.left = Math.max(0, Math.round(mr.left)); }
      }
    } catch (_) {}
    return res;
  }
  /* The same phone test as assets/pos-mobile.css. On a phone the carnet takes
   * the whole screen: the register's rail is an off-canvas drawer there, so
   * measuring it only ever caught it mid-slide (a 212px gap beside a drawer
   * that was closing) and, with the drawer shut, the carnet covered every
   * control of the register with no way back (ticket #0137). */
  var PHONE_Q = '(max-width: 860px), (orientation: landscape) and (max-width: 1024px) and (max-height: 600px)';
  function isPhone() { try { return !!(window.matchMedia && window.matchMedia(PHONE_Q).matches); } catch (_) { return false; } }
  function positionRoot(root) {
    if (!root) return;
    var b = isPhone() ? { left: 0, top: 0, right: 0, bottom: 0 } : panelInset();
    root.style.left = b.left + 'px'; root.style.top = b.top + 'px';
    root.style.right = b.right + 'px'; root.style.bottom = b.bottom + 'px';
  }
  /* Pas de croix : une page ne se ferme pas, elle se quitte. On sort du carnet
     comme on sort de l'Inventaire — en touchant l'entrée suivante du rail. */
  function open(entry) {
    css();
    var root = document.getElementById('kcb-root');
    if (!root) {
      root = document.createElement('div'); root.id = 'kcb-root';
      root.setAttribute('aria-label', 'Carnet clients');
      document.body.appendChild(root);
    }
    root.style.display = 'flex';
    positionRoot(root);
    markNav(entry);
    root.innerHTML =
      '<div class="kcb-scroll"><div class="kcb-page">' +
        '<div class="kcb-top"><div><h2>' + (hospitalityMode() ? 'Hospitality+' : 'Clients') + '</h2>' +
          '<span class="kcb-prog">' + esc(progLabel()) + '</span></div>' +
          '<button class="kcb-x kcb-back" id="kcb-back" type="button" aria-label="Fermer le carnet clients">' + ICON.close + '</button>' +
          '<button class="kcb-add" id="kcb-add">' + ICON.userplus + '<span>Nouveau client</span></button></div>' +
        '<div class="kcb-strip" id="kcb-strip"></div>' +
        '<div class="kcb-tools"><div class="kcb-searchwrap">' + ICON.search +
          '<input class="kcb-search" id="kcb-q" inputmode="search" placeholder="Rechercher un nom ou 06…" value="' + esc(state.q) + '"></div>' +
          '<div class="kx-tabs" id="kcb-segs" role="tablist" aria-label="Profils"></div></div>' +
        '<div class="kcb-list" id="kcb-list"></div>' +
      '</div></div>';
    renderList();
    if (KC.pull) KC.pull(function (ch) { if (ch) { renderList(); ensureChip(); } }); // cross-device refresh
    root.querySelector('#kcb-add').onclick = function () { openForm(null); };
    root.querySelector('#kcb-back').onclick = close;
    var q = root.querySelector('#kcb-q');
    q.oninput = function () { state.q = q.value; renderList(); };
    // A phone keyboard that rises the moment the page opens hides the list
    // the merchant came to read.
    if (!isPhone()) q.focus();
  }
  function close() {
    // La fiche cliente part avec le carnet : ouverte par-dessus, elle restait
    // sinon posée seule au milieu de l'écran de vente.
    closeSheet();
    var r = document.getElementById('kcb-root'); if (r) r.style.display = 'none';
    clearNav(); ensureChip();
  }

  function matches(c, q) {
    q = q.trim().toLowerCase(); if (!q) return true;
    return (c.name || '').toLowerCase().indexOf(q) >= 0 || KC.normPhone(c.phone).indexOf(KC.normPhone(q)) >= 0;
  }
  var SEG_TABS = [['all', 'Tous'], ['reg', 'Réguliers'], ['vip', 'VIP'], ['new', 'Nouveaux'], ['win', 'Dormants']];
  function lastSeenTxt(c) {
    var d = KC.daysSince(c.lastSeen);
    if (d === Infinity) return '·';
    return d === 0 ? 'Aujourd’hui' : (d === 1 ? 'Hier' : d + ' j');
  }
  function renderStrip(all, cfg) {
    var host = document.getElementById('kcb-strip'); if (!host) return;
    var reachable = 0, ready = 0, spend = 0;
    all.forEach(function (c) {
      if (c.consent || c.consentEmail) reachable++;
      if (KC.progress(c, cfg) >= 1) ready++;
      spend += Number(c.spend) || 0;
    });
    function kpi(label, value, unit) {
      return '<div class="kx-kpi"><div class="l">' + label + '</div><div class="v">' + value + (unit ? '<span class="u">' + unit + '</span>' : '') + '</div></div>';
    }
    host.innerHTML = kpi('Clients', fmt(all.length)) + kpi('Joignables', fmt(reachable)) +
      kpi('Récompenses prêtes', fmt(ready)) + kpi('Dépensé', fmt(spend), 'MAD');
  }
  function renderSegs(all) {
    var host = document.getElementById('kcb-segs'); if (!host) return;
    var counts = { all: all.length, reg: 0, vip: 0, new: 0, win: 0 };
    all.forEach(function (c) { counts[KC.segment(c)]++; });
    if (!host.querySelector('.kx-tab')) {
      host.innerHTML = SEG_TABS.map(function (t) {
        return '<button type="button" class="kx-tab" role="tab" data-seg="' + t[0] + '"><span>' + t[1] + '</span><b></b></button>';
      }).join('');
      Array.prototype.forEach.call(host.querySelectorAll('.kx-tab'), function (b) {
        b.onclick = function () { state.seg = b.getAttribute('data-seg'); renderList(); };
      });
      // liquid-lens only scans the first mutation batch of a frame; ask it to find this row.
      setTimeout(function () { try { if (window.KiwiLens) window.KiwiLens.rescan(); } catch (_) {} }, 0);
    }
    Array.prototype.forEach.call(host.querySelectorAll('.kx-tab'), function (b) {
      var k = b.getAttribute('data-seg');
      b.querySelector('b').textContent = counts[k];
      var on = (state.seg || 'all') === k;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function localCreditsByHolder() {
    var out = {};
    localAvoirs().forEach(function (a) {
      if (!a.holderId || !(a.balance > 0) || a.status === 'cancelled' || a.status === 'consumed') return;
      if (a.until && new Date(a.until).getTime() < Date.now()) return;
      out[a.holderId] = (out[a.holderId] || 0) + Number(a.balance);
    });
    return out;
  }
  function renderList() {
    var host = document.getElementById('kcb-list'); if (!host) return;
    var cfg = KC.config();
    var all = KC.list().sort(function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0); });
    renderStrip(all, cfg);
    renderSegs(all);
    var seg = state.seg || 'all';
    var rows = all.filter(function (c) { return matches(c, state.q) && (seg === 'all' || KC.segment(c) === seg); });
    if (!rows.length) {
      host.innerHTML = '<div class="kcb-empty"><span class="ico">' + ICON.users + '</span>' +
        (all.length ? '<b>Aucun résultat</b><div>Essayez un autre nom, un autre numéro ou un autre segment.</div>'
                    : '<b>Aucun client pour l’instant</b><div>Ajoutez votre premier client · il apparaîtra aussitôt sur le tableau de bord.</div>') + '</div>';
      return;
    }
    var credits = localCreditsByHolder();
    var target = cfg.model === 'product' ? cfg.product.target : cfg.visit.target;
    host.innerHTML = '<div class="kcb-cols"><span>Client</span><span>Profil</span><span class="r">Visites</span><span class="r">Dernière visite</span><span class="r">Dépensé</span><span class="r">Fidélité</span></div>' +
      rows.map(function (c) {
        var s = KC.segment(c);
        var prog = KC.progress(c, cfg);
        var ptsTxt = cfg.model === 'amount' ? (fmt(c.points) + '<small>pts</small>') : ((c.stamps || 0) + '<small>/ ' + target + '</small>');
        return '<div class="kcb-row" data-id="' + esc(c.id) + '" tabindex="0" role="button">' +
          '<div class="kcb-who"><div class="kcb-av">' + esc(initials(c.name)) + '</div>' +
            '<div style="min-width:0"><div class="kcb-nm">' + esc(c.name || 'Sans nom') +
              (credits[c.id] ? '<span class="kcb-credit">avoir ' + fmt(credits[c.id]) + ' MAD</span>' : '') + '</div>' +
            '<div class="kcb-ph">' + esc(c.phone || '·') + '</div></div></div>' +
          '<div class="kcb-c-seg"><span class="kcb-seg ' + s + '">' + SEG_LBL[s] + '</span></div>' +
          '<div class="kcb-c-visits r kcb-num">' + (c.visits || 0) + '</div>' +
          '<div class="kcb-c-last r kcb-num kcb-muted">' + lastSeenTxt(c) + '</div>' +
          '<div class="kcb-c-spend r kcb-num">' + fmt(c.spend) + '<small>MAD</small></div>' +
          '<div class="kcb-fid">' + (prog >= 1 ? '<span class="kcb-ready">Récompense prête</span>' : '<span class="kcb-num">' + ptsTxt + '</span>') +
            '<span class="kcb-minibar"><i style="width:' + Math.round(Math.min(1, prog) * 100) + '%"></i></span></div></div>';
      }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('.kcb-row'), function (row) {
      row.onclick = function () { openDetail(row.getAttribute('data-id')); };
      row.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(row.getAttribute('data-id')); } };
    });
  }

  // The programme (model / targets / rewards) can be changed from the dashboard —
  // refresh the header label + the stamp/points column live when it does.
  function refreshOpen() {
    var r = document.getElementById('kcb-root');
    if (!r || r.style.display === 'none') return;
    var pl = r.querySelector('.kcb-prog'); if (pl) pl.textContent = progLabel();
    renderList();
  }

  /* ── sheet (add / edit / detail) ───────────────────────────────────────── */
  function sheet(html) {
    var sh = document.getElementById('kcb-sheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'kcb-sheet'; document.body.appendChild(sh); }
    sh.innerHTML = '<div class="kcb-card">' + html + '</div>';
    sh.style.display = 'flex';
    sh.onclick = function (e) { if (e.target === sh) closeSheet(); };
    return sh;
  }
  function closeSheet() { var sh = document.getElementById('kcb-sheet'); if (sh) sh.style.display = 'none'; }

  function genderOpts(v) {
    return ['', 'Femme', 'Homme', 'Autre'].map(function (g) {
      var lbl = g || '·';
      return '<option value="' + esc(g) + '"' + (v === g ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }).join('');
  }
  function openForm(client) {
    var c = client || {};
    var editing = !!client;
    var hotel = hospitalityMode();
    var h = c.hospitality || {};
    var hospitalityFields = hotel ?
      '<div class="kcb-section">Profil hôtelier</div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label>Type de pièce</label><select id="kcb-f-doc-type" class="kcb-select">' +
          ['', 'Passeport', 'CIN', 'Carte de séjour', 'Autre'].map(function (v) { return '<option value="' + esc(v) + '"' + (h.documentType === v ? ' selected' : '') + '>' + esc(v || 'Sélectionner') + '</option>'; }).join('') + '</select></div>' +
        '<div class="kcb-field"><label>Numéro passeport / ID</label><input id="kcb-f-doc-number" value="' + esc(h.documentNumber || '') + '" placeholder="N° du document" autocomplete="off"></div>' +
      '</div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label>Nationalité</label><input id="kcb-f-nationality" value="' + esc(h.nationality || '') + '" placeholder="Marocaine, française…" autocomplete="off"></div>' +
        '<div class="kcb-field"><label>Langue préférée</label><input id="kcb-f-language" value="' + esc(h.preferredLanguage || '') + '" placeholder="Français, العربية…" autocomplete="off"></div>' +
      '</div>' +
      '<div class="kcb-field"><label>Préférences de chambre</label><input id="kcb-f-room" value="' + esc(h.roomPreferences || '') + '" placeholder="Étage calme, lit king, loin de l’ascenseur…" autocomplete="off"></div>' +
      '<div class="kcb-field"><label>Préférences de repas</label><input id="kcb-f-food" value="' + esc(h.foodPreferences || '') + '" placeholder="Végétarien, petit-déjeuner salé, thé sans sucre…" autocomplete="off"></div>' +
      '<div class="kcb-field"><label>Allergies</label><input id="kcb-f-allergies" value="' + esc(h.allergies || '') + '" placeholder="Arachides, gluten, aucune connue…" autocomplete="off"></div>' +
      '<div class="kcb-field"><label>Besoins particuliers</label><input id="kcb-f-access" value="' + esc(h.accessibilityNeeds || '') + '" placeholder="Mobilité, lit bébé, accessibilité…" autocomplete="off"></div>' : '';
    sheet(
      '<h3>' + (editing ? (hotel ? 'Modifier le profil' : 'Modifier le client') : (hotel ? 'Nouveau profil client' : 'Nouveau client')) + '</h3>' +
      '<div class="kcb-sub">' + (editing ? esc(c.name || '') : (hotel ? 'Identité, préférences et attentions utiles pour le prochain séjour.' : 'Renseignez un maximum d’informations · elles nourrissent la fidélité et le marketing.')) + '</div>' +
      '<div class="kcb-field"><label>Nom complet</label><input id="kcb-f-name" value="' + esc(c.name || '') + '" placeholder="Prénom Nom" autocomplete="off"></div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label>Téléphone</label><input id="kcb-f-phone" inputmode="tel" autocomplete="tel" value="' + esc(c.phone || '') + '" placeholder="06… / +33… / +49…"></div>' +
        '<div class="kcb-field"><label>Email</label><input id="kcb-f-email" type="email" inputmode="email" value="' + esc(c.email || '') + '" placeholder="nom@email.com" autocomplete="off"></div>' +
      '</div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label>Anniversaire</label><input id="kcb-f-bday" type="date" value="' + esc(c.birthday || '') + '"></div>' +
        '<div class="kcb-field"><label>Genre</label><select id="kcb-f-gender" class="kcb-select">' + genderOpts(c.gender || '') + '</select></div>' +
      '</div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label>Ville</label><input id="kcb-f-city" value="' + esc(c.city || '') + '" placeholder="Casablanca" autocomplete="off"></div>' +
        '<div class="kcb-field"><label>Adresse</label><input id="kcb-f-address" value="' + esc(c.address || '') + '" placeholder="Quartier, rue…" autocomplete="off"></div>' +
      '</div>' +
      hospitalityFields +
      '<div class="kcb-field"><label>Notes internes</label><input id="kcb-f-notes" value="' + esc(c.notes || '') + '" placeholder="Informations utiles à l’équipe…" autocomplete="off"></div>' +
      '<div class="kcb-section">Communication</div>' +
      '<label class="kcb-consent"><input type="checkbox" id="kcb-f-consent" ' + (editing ? (c.consent ? 'checked' : '') : (hotel ? '' : 'checked')) + '>' +
        '<span>Accepte les messages <b>WhatsApp / SMS</b> (offres, fidélité).' + (hotel ? ' Optionnel et distinct de la fiche de séjour.' : ' Consentement requis · CNDP loi 09-08.') + '</span></label>' +
      '<label class="kcb-consent" style="margin-top:8px"><input type="checkbox" id="kcb-f-consent-email" ' + (c.consentEmail ? 'checked' : '') + '>' +
        /* « emails marketing » d'un seul tenant : coupé en deux nœuds, l'anglais
           reconstruisait « Accepts marketing emails marketing ». */
        '<span>Accepte les <b>emails marketing</b>.</span></label>' +
      '<div class="kcb-actions">' +
        (editing ? '<button class="kcb-btn danger" id="kcb-f-del" aria-label="Supprimer">' + ICON.trash + '</button>' : '') +
        '<button class="kcb-btn ghost" id="kcb-f-cancel">Annuler</button>' +
        '<button class="kcb-btn primary" id="kcb-f-save">' + (editing ? 'Enregistrer' : 'Ajouter') + '</button></div>'
    );
    var sh = document.getElementById('kcb-sheet');
    sh.querySelector('#kcb-f-cancel').onclick = closeSheet;
    if (editing) sh.querySelector('#kcb-f-del').onclick = function () {
      if (confirm('Supprimer ' + (c.name || 'ce client') + ' ?')) { KC.remove(c.id); closeSheet(); renderList(); ensureChip(); toast('Client supprimé'); }
    };
    var val = function (sel) { var e = sh.querySelector(sel); return e ? e.value.trim() : ''; };
    sh.querySelector('#kcb-f-save').onclick = function () {
      var name = val('#kcb-f-name'), phone = val('#kcb-f-phone'), email = val('#kcb-f-email');
      var consent = sh.querySelector('#kcb-f-consent').checked;
      if (!name && !phone) { toast('Renseignez au moins un nom ou un numéro'); return; }
      if (phone && window.KiwiPhone && !window.KiwiPhone.valid(phone)) { toast('Numéro invalide', 'Pour l’étranger, ajoutez + et l’indicatif pays.'); return; }
      if (!hotel && !consent) { toast('Le consentement est requis', 'Cochez la case WhatsApp / SMS pour enregistrer.'); return; }
      // dedup on phone when adding
      if (!editing && phone) {
        var dupe = KC.findByPhone(phone);
        if (dupe) { closeSheet(); openDetail(dupe.id); toast('Client déjà enregistré', dupe.name || phone); return; }
      }
      var rec = KC.upsert({
        id: editing ? c.id : '', name: name, phone: phone, email: email,
        birthday: val('#kcb-f-bday'), gender: val('#kcb-f-gender'), city: val('#kcb-f-city'),
        address: val('#kcb-f-address'), notes: val('#kcb-f-notes'),
        hospitality: hotel ? {
          documentType: val('#kcb-f-doc-type'), documentNumber: val('#kcb-f-doc-number'),
          nationality: val('#kcb-f-nationality'), preferredLanguage: val('#kcb-f-language'),
          roomPreferences: val('#kcb-f-room'), foodPreferences: val('#kcb-f-food'),
          allergies: val('#kcb-f-allergies'), accessibilityNeeds: val('#kcb-f-access'),
        } : (c.hospitality || {}),
        consent: consent, consentEmail: sh.querySelector('#kcb-f-consent-email').checked,
      });
      closeSheet(); renderList(); ensureChip();
      toast(editing ? 'Client mis à jour' : 'Client ajouté', rec.name || rec.phone);
      if (!editing) openDetail(rec.id);
    };
    setTimeout(function () { var f = sh.querySelector('#kcb-f-name'); if (f && !editing) f.focus(); }, 60);
  }

  function openDetail(id) {
    var c = KC.get(id); if (!c) { renderList(); return; }
    var cfg = KC.config();
    var seg = KC.segment(c);
    var prog = KC.progress(c, cfg);
    var rewardReady = prog >= 1;
    var progTxt, recordBlock;
    if (cfg.model === 'amount') {
      progTxt = fmt(c.points) + ' / ' + (cfg.amount.threshold || 100) + ' pts · récompense ' + esc(cfg.amount.reward || '');
      recordBlock = '<div class="kcb-record"><div class="rl">Enregistrer un achat</div><div class="kcb-recrow">' +
        '<input id="kcb-amt" inputmode="numeric" placeholder="Montant en MAD" >' +
        '<button class="kcb-big" id="kcb-rec">' + ICON.plus + 'Valider</button></div></div>';
    } else {
      var target = cfg.model === 'product' ? cfg.product.target : cfg.visit.target;
      var unit = cfg.model === 'product' ? (cfg.product.item || 'achat') : 'visite';
      // L'unité dans son propre nœud : « visites » se traduit, « cafés » (mot du
      // commerçant) traverse — le balayage ne voit qu'un mot à la fois.
      progTxt = (c.stamps || 0) + ' / ' + target + ' <span>' + esc(unit) + (target > 1 ? 's' : '') + '</span>';
      recordBlock = '<div class="kcb-record"><div class="rl">Ajouter un tampon</div><div class="kcb-recrow">' +
        '<button class="kcb-big" id="kcb-rec" style="flex:1;justify-content:center">' + ICON.plus + '+ 1 <span>' + esc(unit) + '</span></button></div></div>';
    }
    var infoRows = [];
    var hotel = hospitalityMode();
    var h = c.hospitality || {};
    if (c.email) infoRows.push(['Email', c.email]);
    if (c.city) infoRows.push(['Ville', c.city]);
    if (c.address) infoRows.push(['Adresse', c.address]);
    if (c.birthday) infoRows.push(['Anniversaire', c.birthday]);
    if (c.gender) infoRows.push(['Genre', c.gender]);
    if (hotel && h.nationality) infoRows.push(['Nationalité', h.nationality]);
    if (hotel && (h.documentType || h.documentNumber)) infoRows.push(['Passeport / ID', [h.documentType, h.documentNumber].filter(Boolean).join(' · ')]);
    if (hotel && h.preferredLanguage) infoRows.push(['Langue préférée', h.preferredLanguage]);
    if (hotel && h.roomPreferences) infoRows.push(['Préférences chambre', h.roomPreferences]);
    if (hotel && h.foodPreferences) infoRows.push(['Préférences repas', h.foodPreferences]);
    if (hotel && h.allergies) infoRows.push(['Allergies', h.allergies]);
    if (hotel && h.accessibilityNeeds) infoRows.push(['Besoins particuliers', h.accessibilityNeeds]);
    if (c.notes) infoRows.push(['Notes', c.notes]);
    var consentTxt = [c.consent ? 'WhatsApp/SMS' : '', c.consentEmail ? 'Email' : ''].filter(Boolean).join(' · ');
    infoRows.push(['Consentement', consentTxt || 'Aucun']);
    var infoBlock = '<div class="kcb-info">' + infoRows.map(function (r) {
      return '<div class="kcb-inforow"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>';
    }).join('') + '</div>';
    var purchaseHistory = (Array.isArray(c.history) ? c.history : []).slice(0, 50);
    var returns = localReturns();
    var historyBlock = '<div class="kcb-section">Historique des achats</div>' + (purchaseHistory.length
      ? '<div class="kcb-info">' + purchaseHistory.map(function (row) {
          var when = row.ts ? new Date(row.ts).toLocaleString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Date inconnue';
          var rets = row.ref ? returns.filter(function (r) { return String(r.saleRef) === String(row.ref); }) : [];
          var back = {};
          rets.forEach(function (r) { (r.items || []).forEach(function (it) { back[it.name] = (back[it.name] || 0) + (Number(it.qty) || 1); }); });
          var items = Array.isArray(row.items) && row.items.length
            ? row.items.map(function (it) {
                var qty = it.qty || 1, gone = Math.min(qty, back[it.name] || 0);
                if (gone) back[it.name] -= gone;
                var label = esc(qty + '× ' + (it.name || 'Article'));
                return gone >= qty ? '<span class="kcb-struck">' + label + '</span>' : label;
              }).join(' · ')
            : esc(row.ref || 'Achat enregistré');
          var retLine = rets.map(function (r) {
            var what = (r.items || []).map(function (it) { return (it.qty || 1) + '× ' + (it.name || 'Article'); }).join(' · ');
            var kind = String(r.kind || '');
            var verb = kind === 'echange' ? 'Échangé' : 'Retourné';
            var how = kind.indexOf('avoir') === 0 ? 'avoir ' + (r.reference || '') : (kind.indexOf('refund') === 0 ? 'remboursé' : '');
            return '<span class="kcb-ret">' + verb + ' · ' + esc(what) + (how.trim() ? ' · ' + esc(how.trim()) : '') + ' · ' + fmt(r.amount || 0) + ' MAD</span>';
          }).join('');
          return '<div class="kcb-inforow"><span class="k">' + esc(when) + '<small style="display:block;margin-top:3px">' + esc(row.method || 'Mode non renseigné') + '</small></span><span class="v"><b>' + items + '</b><small style="display:block;margin-top:3px">' + esc(row.ref ? 'Ticket ' + row.ref + ' · ' : '') + fmt(row.amount || 0) + ' MAD</small>' + retLine + '</span></div>';
        }).join('') + '</div>'
      : '<div class="kcb-empty" style="min-height:90px"><b>Aucun détail d’achat enregistré</b><div>Les prochains tickets attachés à ce client apparaîtront ici.</div></div>');
    sheet(
      '<div class="kcb-dhead"><div class="kcb-av">' + esc(initials(c.name)) + '</div>' +
        '<div style="flex:1"><h3 style="margin:0">' + esc(c.name || 'Sans nom') + '</h3>' +
        '<div class="kcb-sub" style="margin:2px 0 0">' + esc(c.phone || '·') + ' · <span class="kcb-seg ' + seg + '">' + SEG_LBL[seg] + '</span></div></div>' +
        '<button class="kcb-x" id="kcb-d-close" aria-label="Fermer">' + ICON.close + '</button></div>' +
      /* La phrase fixe dans son propre nœud : la récompense qui suit est le texte
         du commerçant, elle doit traverser telle quelle. */
      (rewardReady ? '<div class="kcb-reward">' + ICON.gift + '<span>Récompense prête</span> · ' + esc((cfg.model === 'amount' ? cfg.amount.reward : (cfg.model === 'product' ? cfg.product.reward : cfg.visit.reward)) || '1 offert') + '</div>' : '') +
      '<div class="kcb-stat"><div class="kcb-progtxt">' + progTxt + '</div>' +
        '<div class="kcb-progwrap"><div class="kcb-progbar" style="width:' + Math.round(prog * 100) + '%"></div></div></div>' +
      '<div class="kcb-kpis">' +
        '<div class="kcb-kpi"><div class="v">' + (c.visits || 0) + '</div><div class="l">' + (hotel ? 'Séjours' : 'Visites') + '</div></div>' +
        '<div class="kcb-kpi"><div class="v">' + fmt(c.spend) + '</div><div class="l">Dépensé (MAD)</div></div>' +
        // « 3 j » et non « 3j » : l'abréviation doit être un mot à part pour se
        // traduire — collée au nombre elle se relisait « j3 » en arabe.
        '<div class="kcb-kpi"><div class="v">' + (KC.daysSince(c.lastSeen) === Infinity ? '·' : KC.daysSince(c.lastSeen) + ' j') + '</div><div class="l">Dernière visite</div></div></div>' +
      infoBlock +
      historyBlock +
      '<div id="kcb-credit-history"><div class="kcb-section">Avoirs</div><div class="kcb-empty" style="min-height:70px">Chargement du registre…</div></div>' +
      recordBlock +
      (rewardReady ? '<button class="kcb-btn primary" id="kcb-redeem" style="margin-top:8px">Offrir la récompense · réinitialiser</button>' : '') +
      '<div class="kcb-actions"><button class="kcb-btn ghost" id="kcb-edit">Modifier</button>' +
        '<button class="kcb-btn ghost" id="kcb-d-back">Retour</button></div>'
    );
    var sh = document.getElementById('kcb-sheet');
    loadClientCredits(c.id, sh.querySelector('#kcb-credit-history'));
    sh.querySelector('#kcb-d-close').onclick = closeSheet;
    sh.querySelector('#kcb-d-back').onclick = closeSheet;
    sh.querySelector('#kcb-edit').onclick = function () { openForm(c); };
    sh.querySelector('#kcb-rec').onclick = function () {
      var amt = 0;
      if (cfg.model === 'amount') {
        var inp = sh.querySelector('#kcb-amt'); amt = parseInt(String(inp.value).replace(/\D/g, ''), 10) || 0;
        if (amt <= 0) { toast('Saisissez un montant'); inp.focus(); return; }
      }
      var res = KC.recordPurchase(c.id, { amount: amt, visit: 1 });
      renderList(); ensureChip();
      openDetail(c.id); // re-render with new totals
      toast('Achat enregistré', res && res.rewardReady ? '🎁 Récompense atteinte !' : (amt ? fmt(amt) + ' MAD' : '+1 tampon'));
    };
    if (rewardReady) sh.querySelector('#kcb-redeem').onclick = function () {
      KC.redeem(c.id); renderList(); openDetail(c.id); toast('Récompense offerte', 'Carte réinitialisée.');
    };
  }

  /* ── native "Clients" entry, injected into every till's own chrome ───────── */
  // One implementation, every store type: for each vertical rail (<nav class="XX-nav">)
  // we redirect its existing client button to the carnet, or inject a native-looking
  // "Clients" item; for the restaurant caisse we add a "Clients" pill to .act-selector.
  /* ── le rail doit montrer où l'on est ────────────────────────────────────
     Le carnet détourne l'entrée « Clientes » du métier (capture +
     stopImmediatePropagation) : le vertical ne bascule donc jamais son propre
     état sélectionné, et le rail continuait d'éclairer la page précédente
     pendant qu'on lisait le carnet. On pose le marqueur nous-mêmes, avec le
     mot exact que ce rail-là emploie pour ses autres pages — et on le rend en
     partant, pour ne pas laisser deux entrées allumées si on sort par Échap. */
  var ACTIVE = /^(on|is-on|active|is-active|sel|selected)$/;
  var navMark = null;   // { entry, token, prev }
  function markNav(entry) {
    clearNav();
    if (!entry || !entry.parentNode) return;
    var sibs = entry.parentNode.children, token = null, prev = null;
    for (var i = 0; i < sibs.length && !token; i++) {
      if (sibs[i] === entry || !sibs[i].classList) continue;
      for (var j = 0; j < sibs[i].classList.length; j++) {
        if (!ACTIVE.test(sibs[i].classList[j])) continue;
        token = sibs[i].classList[j]; prev = sibs[i]; break;
      }
    }
    if (!token) return;                       // ce rail ne marque rien : on n'invente pas
    prev.classList.remove(token);
    entry.classList.add(token);
    navMark = { entry: entry, token: token, prev: prev };
  }
  function clearNav() {
    if (!navMark) return;
    navMark.entry.classList.remove(navMark.token);
    navMark.prev.classList.add(navMark.token);
    navMark = null;
  }
  function makeItem(tag, cls, label) {
    var el = document.createElement(tag);
    if (tag === 'button') el.type = 'button';
    el.className = cls;
    if (tag === 'a') el.setAttribute('href', '#');
    el.innerHTML = ICON.users + '<span>' + label + '</span>';
    el.setAttribute('data-kcb-navitem', '1');
    el.addEventListener('click', function (e) { e.preventDefault(); open(el); });
    return el;
  }
  function wireCaisseEntry() {
    // 1) vertical rails — pos-* and pressing.
    var navs = document.querySelectorAll('nav[class$="-nav"]');
    Array.prototype.forEach.call(navs, function (nav) {
      var entryLabel = hospitalityMode() ? 'Hospitality+' : 'Clients';
      var buttons = nav.querySelectorAll('button, a');
      if (!buttons.length) return;
      var existing = Array.prototype.filter.call(buttons, function (b) {
        return Array.prototype.some.call(b.attributes, function (a) { return /view$/i.test(a.name) && /client/i.test(a.value); });
      })[0];
      if (existing) {
        // Maison already owns a full Clients destination inside its workspace.
        // Redirecting that button to this legacy fixed panel leaves "Vendus"
        // active underneath and breaks the vertical's shared page shell.
        if (existing.matches('[data-mz-view="clientes"]')) return;
        if (existing.getAttribute('data-kcb-redirect')) return;
        existing.setAttribute('data-kcb-redirect', '1');
        existing.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); open(existing); }, true);
      } else {
        var injected = nav.querySelector('[data-kcb-navitem]');
        if (injected) { var label = injected.querySelector('span'); if (label) label.textContent = entryLabel; return; }
        var sample = buttons[0];
        var cls = sample.className.replace(/\b(on|is-on|active|is-active|sel|selected)\b/g, '').replace(/\s+/g, ' ').trim();
        nav.appendChild(makeItem(sample.tagName.toLowerCase(), cls, entryLabel));
      }
    });
    // 2) the main café/resto caisse — .rail-links.
    Array.prototype.forEach.call(document.querySelectorAll('.rail-links'), function (rail) {
      if (rail.querySelector('[data-kcb-navitem]')) return;
      var sample = rail.querySelector('.team-trigger, button'); if (!sample) return;
      rail.appendChild(makeItem('button', sample.className.replace(/\s+/g, ' ').trim(), 'Clients & fidélité'));
    });
  }

  /* ── boot ──────────────────────────────────────────────────────────────── */
  var wireScheduled = false;
  function scheduleWire() {
    if (wireScheduled) return; wireScheduled = true;
    setTimeout(function () { wireScheduled = false; try { wireCaisseEntry(); ensureChip(); } catch (_) {} }, 120);
  }
  /* ── le carnet est une PAGE, pas une fenêtre ──────────────────────────────
     Il s'ouvre depuis le rail, à côté de Vente, Inventaire et Promotions, et il
     occupe la même zone de travail qu'elles. Il devait donc se comporter comme
     elles : toucher une autre entrée du rail l'emporte. Tant qu'il fallait le
     FERMER d'abord, il se comportait comme une boîte de dialogue — deux gestes
     là où le reste de la caisse en demande un, et la seule page du métier à
     réclamer ça.
     On écoute à la CAPTURE, avant que le métier ne traite son propre clic : la
     page suivante se dessine sur une zone déjà libre, jamais sous le carnet. */
  function isOpen() {
    var r = document.getElementById('kcb-root');
    return r && r.style.display !== 'none' ? r : null;
  }
  function sheetOpen() {
    var s = document.getElementById('kcb-sheet');
    return s && s.style.display !== 'none' ? s : null;
  }
  function wireDismiss() {
    document.addEventListener('click', function (e) {
      var root = isOpen(); if (!root) return;
      var t = e.target;
      if (!t || !t.closest) return;
      if (root.contains(t)) return;                        // clic DANS le carnet
      var sh = sheetOpen(); if (sh && sh.contains(t)) return;
      // Une autre entrée du rail — et seulement le rail : un clic ailleurs sur
      // l'écran ne ferme rien, sinon le carnet deviendrait impossible à garder
      // ouvert pendant qu'on lit.
      if (!t.closest('nav[class$="-nav"], .sidebar, .act-selector')) return;
      if (t.closest('[data-kcb-navitem], [data-kcb-redirect]')) return;  // sa propre entrée
      close();
    }, true);
    // Échap : d'abord la fiche cliente ouverte par-dessus, puis le carnet.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !isOpen()) return;
      if (sheetOpen()) { closeSheet(); return; }
      close();
    });
  }

  function boot() {
    wireDismiss();
    window.addEventListener('resize', function () { var r = document.getElementById('kcb-root'); if (r && r.style.display !== 'none') positionRoot(r); });
    window.addEventListener('storage', function (e) {
      if (!e.key) return;
      if (e.key === 'kiwiPaired' || e.key === 'kiwiLiveMerchant' || e.key.indexOf('kiwi:clients:') === 0) { ensureChip(); refreshOpen(); }
      else if (e.key.indexOf('kiwi:fidelity:') === 0) refreshOpen(); // programme changed on the dashboard (other tab)
    });
    if (KC.subscribe) KC.subscribe(function () { ensureChip(); refreshOpen(); });
    if (KC.subscribeConfig) KC.subscribeConfig(function () { refreshOpen(); }); // same-tab programme edit
    // Verticals mount lazily on unlock → watch the DOM and (re)inject the entry.
    try { new MutationObserver(scheduleWire).observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    scheduleWire();
    setTimeout(scheduleWire, 1400);
    setTimeout(scheduleWire, 3200); // catch a just-completed pairing hand-off
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.KiwiClientsBook = { open: open, close: close, ensureChip: ensureChip };
})();
