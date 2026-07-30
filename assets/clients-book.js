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
  function fmt(n) { try { return (Math.round(n) || 0).toLocaleString('fr-FR'); } catch (_) { return String(Math.round(n) || 0); } }
  function paired() { try { return !!(window.KiwiCaissePairing && KiwiCaissePairing.isPaired && KiwiCaissePairing.isPaired()); } catch (_) { return false; } }
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
  }

  var ICON = {
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
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
      '#kcb-root .kcb-head{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid rgba(10,15,13,.08);background:var(--surface);}',
      '#kcb-root .kcb-head h2{margin:0;font-size:1.15rem;font-weight:700;letter-spacing:-.01em;}',
      '#kcb-root .kcb-head .kcb-prog{margin-left:auto;font-size:.78rem;color:var(--atlas,#0B6E4F);background:var(--mint-soft,#E6FbEF);padding:6px 12px;border-radius:999px;font-weight:600;}',
      '#kcb-root .kcb-x{width:38px;height:38px;border-radius:11px;border:1px solid rgba(10,15,13,.1);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--ink,#0A0F0D);}',
      '#kcb-root .kcb-x svg{width:18px;height:18px;}',
      '#kcb-root .kcb-tools{display:flex;gap:10px;padding:16px 22px;align-items:center;}',
      '#kcb-root .kcb-searchwrap{flex:1;position:relative;}',
      '#kcb-root .kcb-searchwrap svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:rgba(10,15,13,.4);}',
      '#kcb-root .kcb-search{width:100%;box-sizing:border-box;padding:13px 14px 13px 40px;border:1px solid rgba(10,15,13,.14);border-radius:12px;font-size:1rem;background:var(--surface);color:var(--ink,#0A0F0D);}',
      '#kcb-root .kcb-search:focus{outline:none;border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 3px rgba(11,110,79,.12);}',
      '#kcb-root .kcb-add{display:inline-flex;align-items:center;gap:8px;background:var(--atlas,#0B6E4F);color:#fff;border:0;border-radius:12px;padding:13px 18px;font:600 .92rem/1 inherit;cursor:pointer;white-space:nowrap;}',
      '#kcb-root .kcb-add svg{width:18px;height:18px;}',
      '#kcb-root .kcb-list{flex:1;overflow-y:auto;padding:4px 22px 22px;}',
      '#kcb-root .kcb-empty{text-align:center;color:rgba(10,15,13,.5);padding:70px 20px;}',
      '#kcb-root .kcb-empty svg{width:44px;height:44px;color:rgba(10,15,13,.22);margin-bottom:14px;}',
      '#kcb-root .kcb-empty b{display:block;font-size:1.05rem;color:var(--ink,#0A0F0D);margin-bottom:6px;font-weight:600;}',
      /* client row */
      '.kcb-row{display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--surface);border:1px solid rgba(10,15,13,.07);border-radius:14px;margin-bottom:9px;cursor:pointer;transition:border-color .12s,box-shadow .12s;}',
      '.kcb-row:hover{border-color:rgba(11,110,79,.4);box-shadow:0 6px 18px -12px rgba(5,59,44,.4);}',
      '.kcb-av{width:44px;height:44px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:700;font-size:1rem;color:#fff;background:var(--atlas,#0B6E4F);}',
      '.kcb-row .kcb-nm{font-weight:600;font-size:.98rem;}',
      '.kcb-row .kcb-ph{font-size:.82rem;color:rgba(10,15,13,.5);margin-top:2px;font-variant-numeric:tabular-nums;}',
      '.kcb-row .kcb-meta{margin-left:auto;text-align:right;}',
      '.kcb-pts{font-weight:700;font-size:1rem;color:var(--atlas,#0B6E4F);}',
      '.kcb-pts small{font-weight:500;color:rgba(10,15,13,.45);font-size:.72rem;}',
      '.kcb-seg{display:inline-block;font-size:.68rem;font-weight:600;padding:2px 9px;border-radius:999px;margin-top:5px;}',
      '.kcb-seg.reg{background:#E6FbEF;color:#075238;}.kcb-seg.vip{background:#FBF0D6;color:#8A6210;}',
      '.kcb-seg.new{background:#E4ECF8;color:#3E78C9;}.kcb-seg.win{background:#FBE3DD;color:#C0492F;}',
      /* sheet (add/edit/detail) */
      '#kcb-sheet{position:fixed;inset:0;z-index:945;background:rgba(5,20,14,.42);display:flex;align-items:flex-end;justify-content:center;animation:kcb-fade .18s ease;}',
      '@media (min-width:640px){#kcb-sheet{align-items:center;}}',
      '#kcb-sheet .kcb-card{width:100%;max-width:520px;max-height:92vh;overflow-y:auto;background:var(--paper,#F7F5F0);border-radius:22px 22px 0 0;padding:22px;animation:kcb-up .24s cubic-bezier(.32,.72,0,1);}',
      '@media (min-width:640px){#kcb-sheet .kcb-card{border-radius:22px;}}',
      '#kcb-sheet h3{margin:0 0 4px;font-size:1.2rem;font-weight:700;}',
      '#kcb-sheet .kcb-sub{color:rgba(10,15,13,.55);font-size:.86rem;margin-bottom:18px;}',
      '.kcb-field{margin-bottom:14px;}',
      '.kcb-field label{display:block;font-size:.78rem;font-weight:600;color:rgba(10,15,13,.6);margin-bottom:6px;}',
      '.kcb-field input{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid rgba(10,15,13,.14);border-radius:12px;font-size:1rem;background:var(--surface);color:var(--ink,#0A0F0D);}',
      '.kcb-field input:focus{outline:none;border-color:var(--atlas,#0B6E4F);box-shadow:0 0 0 3px rgba(11,110,79,.12);}',
      '.kcb-field select.kcb-select{width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid rgba(10,15,13,.14);border-radius:12px;font-size:1rem;background:var(--surface);color:var(--ink,#0A0F0D);}',
      '.kcb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      '@media (max-width:520px){.kcb-grid2{grid-template-columns:1fr;}}',
      '.kcb-info{background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:16px;padding:4px 16px;margin-bottom:14px;}',
      '.kcb-inforow{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid rgba(10,15,13,.06);font-size:.9rem;}',
      '.kcb-inforow:first-child{border-top:0;}',
      '.kcb-inforow .k{color:rgba(10,15,13,.5);font-weight:500;}',
      '.kcb-inforow .v{color:var(--ink,#0A0F0D);font-weight:600;text-align:right;word-break:break-word;}',
      'html[data-theme="dark"] .kcb-info{background:#141d19;border-color:#26302b;}',
      'html[data-theme="dark"] .kcb-inforow .v{color:#eafff3;}',
      'html[data-theme="dark"] .kcb-field select.kcb-select{background:#141d19;border-color:#26302b;color:#eafff3;}',
      '.kcb-consent{display:flex;gap:11px;align-items:flex-start;padding:13px 14px;background:var(--surface);border:1px solid rgba(10,15,13,.1);border-radius:12px;cursor:pointer;}',
      '.kcb-consent input{margin-top:2px;width:18px;height:18px;flex:none;accent-color:var(--atlas,#0B6E4F);}',
      '.kcb-consent span{font-size:.82rem;color:rgba(10,15,13,.7);line-height:1.45;}',
      '.kcb-actions{display:flex;gap:10px;margin-top:20px;}',
      '.kcb-btn{flex:1;padding:14px;border-radius:12px;font:600 .95rem/1 inherit;cursor:pointer;border:1px solid transparent;}',
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
      '.kcb-big{background:var(--atlas,#0B6E4F);color:#fff;border:0;border-radius:12px;padding:14px 20px;font:600 1rem/1 inherit;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;}',
      '.kcb-big svg{width:18px;height:18px;}',
      /* dark */
      'html[data-theme="dark"] #kcb-root{background:#0d1512;color:#eafff3;border-color:rgba(255,255,255,.07);}',
      'html[data-theme="dark"] #kcb-root .kcb-head,html[data-theme="dark"] .kcb-row,html[data-theme="dark"] .kcb-stat,html[data-theme="dark"] .kcb-kpi,html[data-theme="dark"] .kcb-record,html[data-theme="dark"] .kcb-field input,html[data-theme="dark"] #kcb-root .kcb-search{background:#141d19;border-color:#26302b;color:#eafff3;}',
      'html[data-theme="dark"] #kcb-sheet .kcb-card{background:#0d1512;}',
      'html[data-theme="dark"] .kcb-consent,html[data-theme="dark"] .kcb-btn.ghost,html[data-theme="dark"] .kcb-recrow input{background:#141d19;border-color:#26302b;color:#eafff3;}',
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
    b.innerHTML = ICON.users + '<span class="kcb-lbl">Clients</span>' + (n ? '<span class="kcb-badge">' + n + '</span>' : '');
  }

  /* ── root panel ────────────────────────────────────────────────────────── */
  var state = { q: '' };
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
  function positionRoot(root) {
    if (!root) return;
    var b = panelInset();
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
      '<div class="kcb-head"><h2>Carnet clients</h2><span class="kcb-prog">' + esc(progLabel()) + '</span></div>' +
      '<div class="kcb-tools"><div class="kcb-searchwrap">' + ICON.search +
        '<input class="kcb-search" id="kcb-q" inputmode="search" placeholder="Rechercher un nom ou 06…" value="' + esc(state.q) + '"></div>' +
        '<button class="kcb-add" id="kcb-add">' + ICON.userplus + '<span>Nouveau client</span></button></div>' +
      '<div class="kcb-list" id="kcb-list"></div>';
    renderList();
    if (KC.pull) KC.pull(function (ch) { if (ch) { renderList(); ensureChip(); } }); // cross-device refresh
    root.querySelector('#kcb-add').onclick = function () { openForm(null); };
    var q = root.querySelector('#kcb-q');
    q.oninput = function () { state.q = q.value; renderList(); };
    q.focus();
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
  function renderList() {
    var host = document.getElementById('kcb-list'); if (!host) return;
    var all = KC.list().sort(function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0); });
    var rows = all.filter(function (c) { return matches(c, state.q); });
    if (!rows.length) {
      host.innerHTML = '<div class="kcb-empty">' + ICON.users +
        (all.length ? '<b>Aucun résultat</b><div>Essayez un autre nom ou numéro.</div>'
                    : '<b>Aucun client pour l’instant</b><div>Ajoutez votre premier client — il apparaîtra aussitôt sur le tableau de bord.</div>') + '</div>';
      return;
    }
    var cfg = KC.config();
    host.innerHTML = rows.map(function (c) {
      var seg = KC.segment(c);
      var ptsTxt = cfg.model === 'amount' ? (fmt(c.points) + ' <small>pts</small>') : ((c.stamps || 0) + '<small>/' + (cfg.model === 'product' ? cfg.product.target : cfg.visit.target) + '</small>');
      return '<div class="kcb-row" data-id="' + esc(c.id) + '">' +
        '<div class="kcb-av">' + esc(initials(c.name)) + '</div>' +
        '<div><div class="kcb-nm">' + esc(c.name || 'Sans nom') + '</div><div class="kcb-ph">' + esc(c.phone || '—') + '</div></div>' +
        '<div class="kcb-meta"><div class="kcb-pts">' + ptsTxt + '</div><span class="kcb-seg ' + seg + '">' + SEG_LBL[seg] + '</span></div></div>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('.kcb-row'), function (row) {
      row.onclick = function () { openDetail(row.getAttribute('data-id')); };
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
      var lbl = g || '—';
      return '<option value="' + esc(g) + '"' + (v === g ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }).join('');
  }
  function openForm(client) {
    var c = client || {};
    var editing = !!client;
    sheet(
      '<h3>' + (editing ? 'Modifier le client' : 'Nouveau client') + '</h3>' +
      '<div class="kcb-sub">' + (editing ? esc(c.name || '') : 'Renseignez un maximum d’informations — elles nourrissent la fidélité et le marketing.') + '</div>' +
      '<div class="kcb-field"><label>Nom complet</label><input id="kcb-f-name" value="' + esc(c.name || '') + '" placeholder="Prénom Nom" autocomplete="off"></div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label>Téléphone</label><input id="kcb-f-phone" inputmode="tel" value="' + esc(c.phone || '') + '" placeholder="06 12 34 56 78" autocomplete="off"></div>' +
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
      '<div class="kcb-field"><label>Notes</label><input id="kcb-f-notes" value="' + esc(c.notes || '') + '" placeholder="Préférences, tailles, allergies…" autocomplete="off"></div>' +
      '<label class="kcb-consent"><input type="checkbox" id="kcb-f-consent" ' + (editing ? (c.consent ? 'checked' : '') : 'checked') + '>' +
        '<span>Accepte les messages <b>WhatsApp / SMS</b> (offres, fidélité). Consentement requis · CNDP loi 09-08.</span></label>' +
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
      if (!consent) { toast('Le consentement est requis', 'Cochez la case WhatsApp / SMS pour enregistrer.'); return; }
      // dedup on phone when adding
      if (!editing && phone) {
        var dupe = KC.findByPhone(phone);
        if (dupe) { closeSheet(); openDetail(dupe.id); toast('Client déjà enregistré', dupe.name || phone); return; }
      }
      var rec = KC.upsert({
        id: editing ? c.id : '', name: name, phone: phone, email: email,
        birthday: val('#kcb-f-bday'), gender: val('#kcb-f-gender'), city: val('#kcb-f-city'),
        address: val('#kcb-f-address'), notes: val('#kcb-f-notes'),
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
    if (c.email) infoRows.push(['Email', c.email]);
    if (c.city) infoRows.push(['Ville', c.city]);
    if (c.address) infoRows.push(['Adresse', c.address]);
    if (c.birthday) infoRows.push(['Anniversaire', c.birthday]);
    if (c.gender) infoRows.push(['Genre', c.gender]);
    if (c.notes) infoRows.push(['Notes', c.notes]);
    var consentTxt = [c.consent ? 'WhatsApp/SMS' : '', c.consentEmail ? 'Email' : ''].filter(Boolean).join(' · ');
    infoRows.push(['Consentement', consentTxt || 'Aucun']);
    var infoBlock = '<div class="kcb-info">' + infoRows.map(function (r) {
      return '<div class="kcb-inforow"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>';
    }).join('') + '</div>';
    sheet(
      '<div class="kcb-dhead"><div class="kcb-av">' + esc(initials(c.name)) + '</div>' +
        '<div style="flex:1"><h3 style="margin:0">' + esc(c.name || 'Sans nom') + '</h3>' +
        '<div class="kcb-sub" style="margin:2px 0 0">' + esc(c.phone || '—') + ' · <span class="kcb-seg ' + seg + '">' + SEG_LBL[seg] + '</span></div></div>' +
        '<button class="kcb-x" id="kcb-d-close" aria-label="Fermer">' + ICON.close + '</button></div>' +
      /* La phrase fixe dans son propre nœud : la récompense qui suit est le texte
         du commerçant, elle doit traverser telle quelle. */
      (rewardReady ? '<div class="kcb-reward">' + ICON.gift + '<span>Récompense prête</span> — ' + esc((cfg.model === 'amount' ? cfg.amount.reward : (cfg.model === 'product' ? cfg.product.reward : cfg.visit.reward)) || '1 offert') + '</div>' : '') +
      '<div class="kcb-stat"><div class="kcb-progtxt">' + progTxt + '</div>' +
        '<div class="kcb-progwrap"><div class="kcb-progbar" style="width:' + Math.round(prog * 100) + '%"></div></div></div>' +
      '<div class="kcb-kpis">' +
        '<div class="kcb-kpi"><div class="v">' + (c.visits || 0) + '</div><div class="l">Visites</div></div>' +
        '<div class="kcb-kpi"><div class="v">' + fmt(c.spend) + '</div><div class="l">Dépensé (MAD)</div></div>' +
        // « 3 j » et non « 3j » : l'abréviation doit être un mot à part pour se
        // traduire — collée au nombre elle se relisait « j3 » en arabe.
        '<div class="kcb-kpi"><div class="v">' + (KC.daysSince(c.lastSeen) === Infinity ? '—' : KC.daysSince(c.lastSeen) + ' j') + '</div><div class="l">Dernière visite</div></div></div>' +
      infoBlock +
      recordBlock +
      (rewardReady ? '<button class="kcb-btn primary" id="kcb-redeem" style="margin-top:8px">Offrir la récompense · réinitialiser</button>' : '') +
      '<div class="kcb-actions"><button class="kcb-btn ghost" id="kcb-edit">Modifier</button>' +
        '<button class="kcb-btn ghost" id="kcb-d-back">Retour</button></div>'
    );
    var sh = document.getElementById('kcb-sheet');
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
      var buttons = nav.querySelectorAll('button, a');
      if (!buttons.length) return;
      var existing = Array.prototype.filter.call(buttons, function (b) {
        return Array.prototype.some.call(b.attributes, function (a) { return /view$/i.test(a.name) && /client/i.test(a.value); });
      })[0];
      if (existing) {
        if (existing.getAttribute('data-kcb-redirect')) return;
        existing.setAttribute('data-kcb-redirect', '1');
        existing.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); open(existing); }, true);
      } else {
        if (nav.querySelector('[data-kcb-navitem]')) return;
        var sample = buttons[0];
        var cls = sample.className.replace(/\b(on|is-on|active|is-active|sel|selected)\b/g, '').replace(/\s+/g, ' ').trim();
        nav.appendChild(makeItem(sample.tagName.toLowerCase(), cls, 'Clients'));
      }
    });
    // 2) the main café/resto caisse — .act-selector pill.
    Array.prototype.forEach.call(document.querySelectorAll('.act-selector'), function (sel) {
      if (sel.querySelector('[data-kcb-navitem]')) return;
      var sample = sel.querySelector('.act-pill, button'); if (!sample) return;
      sel.appendChild(makeItem('button', sample.className.replace(/\s+/g, ' ').trim(), 'Clients & fidélité'));
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
