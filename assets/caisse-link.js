/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CAISSE LINK  (assets/caisse-link.js)  — the DASHBOARD half of pairing.
 * ---------------------------------------------------------------------------
 * A merchant creates their business on the dashboard, and this makes the caisse
 * appear: a side panel opens on entry with a 6-digit code, and a small "Caisse"
 * launcher stays in the corner so it is never lost. Enter the code on the Caisse
 * app (or tap "Ouvrir la caisse sur cet appareil") and that terminal becomes THIS
 * store, of the right trade, its sales flowing straight back to this dashboard.
 *
 * The code is the capability that binds a till to one store. It is written to the
 * shared same-origin localStorage map `kiwiPairings`, so the whole loop works in
 * one browser today with zero backend (the caisse redeems it from the same map).
 * It also POSTs /api/pair/create fail-soft: the moment the partner deploys that
 * endpoint, the server issues the authoritative code and cross-device pairing
 * (dashboard on a laptop, caisse on a separate tablet) lights up automatically.
 *
 * Identity spine: merchant = slugMerchant(business name), mirrored byte-for-byte
 * from functions/auth/_lib.js so the dashboard, the caisse (kiwiLiveMerchant), and
 * the D1 roster all line up on one key without a stored mapping.
 *
 * Demo-safe: only ever runs for a REAL business (a custom venue created in
 * onboarding, or a logged-in account via /api/me → window.KiwiMe). The pitch demo
 * (Café Atlas) never sees the panel or the launcher. Vanilla, self-contained.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CODE_TTL = 15 * 60 * 1000;               // a code is live for 15 minutes
  var SS_DISMISS = 'kiwiCaisseLinkDismissed';  // per-session "user closed it"
  var K = {
    pairings: 'kiwiPairings', liveMerchant: 'kiwiLiveMerchant', live: 'kiwiLive',
    bizName: 'kiwiBizName', bizType: 'kiwiBizType', city: 'kiwiCity',
  };

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function readMap() { try { return JSON.parse(ls(K.pairings) || '{}') || {}; } catch (_) { return {}; } }
  function writeMap(m) { try { set(K.pairings, JSON.stringify(m)); } catch (_) {} }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  // Mirror of functions/auth/_lib.js:slugMerchant — one key across dashboard/caisse/D1.
  function slugMerchant(s) {
    var latin = String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (latin) return latin;
    /* Nom sans lettre latine : slug « shop-<hash> » stable, identique octet pour
     * octet à functions/auth/_lib.js › nonLatinSlug. Plus de 'client' partagé. */
    var raw = String(s || '').trim();
    if (!raw) return 'client';
    var basis = raw.normalize('NFKC').toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim() || raw;
    var h1 = 0x811c9dc5, h2 = 0x9747b28c;
    for (var i = 0; i < basis.length; i++) {
      var c = basis.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    }
    function pad(n) { n = n.toString(36); return '0000000'.slice(n.length) + n; }
    return 'shop-' + pad(h1) + pad(h2);
  }

  function venueData() { try { return window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData(); } catch (_) { return null; } }
  function isCustom() { try { return !!(window.KiwiVenue && KiwiVenue.isCustom && KiwiVenue.isCustom()); } catch (_) { return false; } }
  function realMerchant() { return isCustom() || !!(window.KiwiMe && window.KiwiMe.business); }

  /* The real business this dashboard belongs to. A custom venue (created in
   * onboarding) carries type + subtype + id; a logged-in account with no custom
   * venue falls back to its name + the onboarding trade stored in localStorage. */
  function currentBiz() {
    var v = venueData();
    var custom = isCustom() && v && v.custom;
    var me = window.KiwiMe || null;
    var name = String((custom && v.name) || (me && me.business) || ls(K.bizName) || '').trim();
    if (!name) return null;
    return {
      /* Le slug gravé de l'établissement (venues.js › slugOf), pas son nom
       * re-slugifié. Une caisse appairée est liée à UN magasin pour de bon :
       * si le nom change et que le slug suit, la caisse continue de vendre
       * pour un magasin dont le tableau de bord n'écoute plus. */
      merchant: (custom && v.slug) || slugMerchant(name),
      venueId: (custom && v.id) || '',
      type: (custom && v.type) || '',
      subtype: (custom && v.subtype) || ls(K.bizType) || '',
      name: name,
      location: (custom && v.location) || ls(K.city) || '',
    };
  }

  function rand6() {
    try { var a = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(a); return String(100000 + (a[0] % 900000)); }
    catch (_) { return String(100000 + Math.floor(Math.random() * 900000)); }
  }

  function connectedCodeFor(merchant) {
    var m = readMap();
    for (var c in m) { if (m[c] && m[c].merchant === merchant && m[c].status === 'connected') return c; }
    return null;
  }
  function pendingCodeFor(merchant) {
    var m = readMap(), now = Date.now();
    for (var c in m) { var e = m[c]; if (e && e.merchant === merchant && e.status === 'pending' && (!e.exp || e.exp > now)) return c; }
    return null;
  }
  function isPaired() { var b = currentBiz(); return !!(b && connectedCodeFor(b.merchant)); }

  /* Issue (or reuse) a live 6-digit code for this store, and point THIS browser's
   * live feed at the store so the dashboard's "En direct" card shows its sales.
   * force=true always mints a fresh code (the "Nouveau code" button) — otherwise
   * it reuses the current pending code, which is what we want on panel open. */
  function generateCode(force) {
    var biz = currentBiz(); if (!biz) return null;
    var code = force ? null : pendingCodeFor(biz.merchant);
    if (!code) {
      var m = readMap(), now = Date.now();
      Object.keys(m).forEach(function (c) {
        var e = m[c];
        if (!e || (e.exp && e.exp < now) || (e.merchant === biz.merchant && e.status !== 'connected')) delete m[c];
      });
      do { code = rand6(); } while (m[code]);
      m[code] = { merchant: biz.merchant, venueId: biz.venueId, type: biz.type, subtype: biz.subtype, name: biz.name, location: biz.location, exp: now + CODE_TTL, status: 'pending', createdAt: now };
      writeMap(m);
    }
    enableLive(biz);
    backendCreate(biz, code);
    return code;
  }

  /* Point THIS browser's live feed at this store. It used to happen only as a
   * side effect of minting a pairing code; now that the panel no longer mints
   * one, it has to be explicit — otherwise the dashboard would quietly stop
   * polling its own sales feed and "En direct" would never fill. */
  function enableLive(biz) {
    if (!biz) return;
    set(K.liveMerchant, biz.merchant);
    set(K.live, '1');
  }

  /* Cross-device path, fail-soft. Absent endpoint (404/offline) → the localStorage
   * code above stands. Present → adopt the server's authoritative code so a caisse
   * on another device redeems the same value the panel is showing. */
  function backendCreate(biz, localCode) {
    try {
      fetch('/api/pair/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, /* `merchant` dit QUEL magasin de ce compte s'appaire. Le serveur le
           déduisait du nom, et se trompait dès que le nom ne donnait plus le
           slug du magasin : il retombait alors sur l'établissement principal du
           compte. C'est comme ça que la caisse du café d'Amira s'est retrouvée
           appairée sous la boutique. Le serveur vérifie la propriété avant de
           l'accepter — l'envoyer ne donne aucun droit. */
        body: JSON.stringify({ merchant: biz.merchant, type: biz.type, subtype: biz.subtype, name: biz.name, location: biz.location }) })
        .then(function (r) {
          // 401/403 = server is present but won't mint this store's code (caller
          // is neither the signed-in merchant nor an authed operator). The local
          // code can't be redeemed on another device → be honest in the panel.
          if (r.status === 401 || r.status === 403) { remoteState = 'reject'; applyRemoteState(); return null; }
          remoteState = r.ok ? 'ok' : 'absent';    // else: adopted, or fail-soft same-browser
          applyRemoteState();
          return r.ok ? r.json() : null;
        })
        .then(function (j) { if (j && j.ok && j.code && j.code !== localCode) adoptServerCode(localCode, j.code, biz); })
        .catch(function () { remoteState = 'absent'; applyRemoteState(); });   // offline/static host → same-browser demo
    } catch (_) {
      remoteState = 'absent';
      applyRemoteState();
    }
  }
  function adoptServerCode(localCode, serverCode, biz) {
    var m = readMap(), now = Date.now();
    if (m[localCode]) delete m[localCode];
    m[serverCode] = { merchant: biz.merchant, venueId: biz.venueId, type: biz.type, subtype: biz.subtype, name: biz.name, location: biz.location, exp: now + CODE_TTL, status: 'pending', createdAt: now };
    writeMap(m);
    if (panel && panel.setCode) panel.setCode(serverCode);
  }

  function codeExp(code) { var e = readMap()[code]; return (e && e.exp) || 0; }
  function fmtCountdown(ms) {
    if (ms <= 0) return '00:00';
    var s = Math.floor(ms / 1000), mm = Math.floor(s / 60), ss = s % 60;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  /* ── The side panel ─────────────────────────────────────────────────────── */
  var panel = null;
  // Last outcome of /api/pair/create, so the panel can be honest about whether a
  // REMOTE (cross-device) pair is actually possible from here:
  //   null    unknown / in-flight       → default "waiting" state
  //   'ok'    server issued a code       → cross-device works
  //   'reject' server present but 401/403 (not signed in as this store / operator)
  //           → cross-device won't work; only "Ouvrir la caisse sur cet appareil"
  //   'absent' 404/503/offline (static host, pitch demo) → same-browser demo works
  var remoteState = null;
  function applyRemoteState() { if (panel && panel.setRemote) { try { panel.setRemote(remoteState); } catch (_) {} } }
  function css() {
    if (document.getElementById('kcl-style')) return;
    var s = document.createElement('style'); s.id = 'kcl-style';
    s.textContent =
      '.kcl-lead{margin:0 0 16px;color:var(--ink,#0A0F0D);opacity:.72;font-size:.92rem;line-height:1.5;}' +
      '.kcl-codewrap{background:var(--riad,#053B2C);border-radius:16px;padding:20px 18px 16px;text-align:center;color:#fff;position:relative;overflow:hidden;}' +
      '.kcl-codelbl{font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;opacity:.62;margin-bottom:8px;}' +
      '.kcl-code{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:2.35rem;font-weight:700;letter-spacing:.34em;text-indent:.34em;line-height:1;color:var(--mint,#7DF2B0);}' +
      '.kcl-meta{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:12px;font-size:.78rem;opacity:.8;}' +
      '.kcl-meta button{background:none;border:0;color:var(--mint,#7DF2B0);font:inherit;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:0;}' +
      '.kcl-copy{margin-top:14px;width:100%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:10px;padding:9px;font:inherit;font-weight:600;cursor:pointer;transition:background .15s;}' +
      '.kcl-copy:hover{background:rgba(255,255,255,.2);}' +
      /* Pairing confirmation stays inside the drawer. A short terminal-to-dashboard
       * trace replaces the old full-viewport confetti burst: connection is an
       * infrastructure state, not a game reward. Every fill/foreground pairing
       * uses semantic surface tokens so this remains legible in both climates. */
      '.kcl-status{margin:16px 0;padding:16px;border-radius:16px;background:var(--surface,#FFFDFA);border:1px solid var(--n-200,#E8E6E0);box-shadow:0 14px 34px -30px rgba(5,59,44,.45);color:var(--ink,#0A0F0D);overflow:hidden;}' +
      '.kcl-route{display:grid;grid-template-columns:auto minmax(54px,1fr) auto;align-items:center;gap:11px;padding:3px 2px 15px;border-bottom:1px solid var(--n-200,#E8E6E0);}' +
      '.kcl-node{display:grid;justify-items:center;gap:6px;min-width:62px;color:var(--n-500,#6F6C65);font-size:.68rem;font-weight:650;line-height:1;}' +
      '.kcl-node-ico{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:var(--paper-soft,#EFECE3);border:1px solid var(--n-200,#E8E6E0);color:var(--n-500,#6F6C65);transition:color .35s var(--glide,ease),border-color .35s var(--glide,ease),background .35s var(--glide,ease),transform .55s var(--spring,ease);}' +
      '.kcl-node-ico svg{width:19px;height:19px;display:block;}' +
      '.kcl-track{height:2px;position:relative;border-radius:99px;background:var(--n-200,#E8E6E0);overflow:visible;}' +
      '.kcl-track::before{content:"";position:absolute;inset:0;right:100%;border-radius:inherit;background:var(--atlas,#0B6E4F);}' +
      '.kcl-track-dot{position:absolute;z-index:1;left:0;top:50%;width:8px;height:8px;border-radius:50%;background:var(--atlas,#0B6E4F);box-shadow:0 0 0 5px color-mix(in srgb,var(--atlas,#0B6E4F) 14%,transparent);transform:translate(-50%,-50%);}' +
      '.kcl-state{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding-top:13px;}' +
      '.kcl-status .kcl-d{width:8px;height:8px;border-radius:50%;background:var(--warning,#D99A2B);box-shadow:0 0 0 4px color-mix(in srgb,var(--warning,#D99A2B) 16%,transparent);flex:none;}' +
      '.kcl-state-copy{min-width:0;}' +
      '.kcl-state-copy strong{display:block;font-size:.86rem;font-weight:700;line-height:1.25;color:var(--ink,#0A0F0D);}' +
      '.kcl-state-copy small{display:block;margin-top:3px;font-size:.73rem;font-weight:500;line-height:1.35;color:var(--n-500,#6F6C65);}' +
      '.kcl-check{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:var(--paper-soft,#EFECE3);color:var(--n-400,#A8A49A);transform:scale(.86);opacity:.45;transition:opacity .25s var(--glide,ease),transform .55s var(--spring,ease),background .25s var(--glide,ease),color .25s var(--glide,ease);}' +
      '.kcl-check svg{width:15px;height:15px;}' +
      '.kcl-status.on{border-color:color-mix(in srgb,var(--atlas,#0B6E4F) 30%,var(--n-200,#E8E6E0));}' +
      '.kcl-status.on .kcl-d{background:var(--atlas,#0B6E4F);box-shadow:0 0 0 4px color-mix(in srgb,var(--atlas,#0B6E4F) 16%,transparent);}' +
      '.kcl-status.on .kcl-node{color:var(--atlas,#0B6E4F);}' +
      '.kcl-status.on .kcl-node-ico{color:var(--atlas,#0B6E4F);border-color:color-mix(in srgb,var(--atlas,#0B6E4F) 26%,var(--n-200,#E8E6E0));background:color-mix(in srgb,var(--atlas,#0B6E4F) 8%,var(--surface,#FFFDFA));}' +
      '.kcl-status.on .kcl-check{opacity:1;transform:scale(1);background:var(--atlas,#0B6E4F);color:var(--inverse-ink,#F7F5F0);}' +
      '.kcl-status.kcl-arrive .kcl-track::before{animation:kcl-route-fill .8s var(--expo,ease-out) both;}' +
      '.kcl-status.kcl-arrive .kcl-track-dot{animation:kcl-route-travel .8s var(--expo,ease-out) both;}' +
      '.kcl-status.kcl-arrive .kcl-node:last-child .kcl-node-ico{animation:kcl-node-arrive .55s .68s var(--spring,ease) both;}' +
      '.kcl-status.kcl-warn{border-color:color-mix(in srgb,var(--warning,#D99A2B) 35%,var(--n-200,#E8E6E0));line-height:1.4;}' +
      '.kcl-status.kcl-warn .kcl-route{display:none;}' +
      '.kcl-status.kcl-warn .kcl-state{padding-top:0;}' +
      '.kcl-status.kcl-warn .kcl-d{background:var(--warning,#D99A2B);box-shadow:none;}' +
      '.kcl-pulse{animation:kcl-pulse 1.6s ease-in-out infinite;}' +
      '@keyframes kcl-pulse{0%,100%{opacity:1}50%{opacity:.35}}' +
      '@keyframes kcl-route-fill{to{right:0}}' +
      '@keyframes kcl-route-travel{0%{left:0}100%{left:100%}}' +
      '@keyframes kcl-node-arrive{0%{transform:scale(.88)}100%{transform:scale(1)}}' +
      '.kcl-open{width:100%;background:var(--inverse-surface,#053B2C);color:var(--inverse-ink,#F7F5F0);border:1px solid var(--inverse-line,rgba(255,255,255,.18));border-radius:12px;padding:13px;font:inherit;font-weight:700;cursor:pointer;transition:filter .15s;}' +
      '.kcl-open:hover{filter:brightness(1.06);}' +
      '.kcl-open:focus-visible{outline:3px solid var(--mint,#7DF2B0);outline-offset:3px;}' +
      '.kcl-hint{margin:14px 0 0;font-size:.8rem;line-height:1.5;color:var(--ink,#0A0F0D);opacity:.6;}' +
      '.kcl-under-operator .kiwi-drawer{top:var(--kcl-drawer-top,34px);}' +
      '.kcl-devices{margin-top:22px;padding-top:16px;border-top:1px solid var(--n-200,#E8E6E0);}' +
      '.kcl-devices h4{margin:0 0 4px;font-size:.86rem;font-weight:700;color:var(--ink,#0A0F0D);}' +
      '.kcl-devices p{margin:0 0 10px;font-size:.76rem;line-height:1.45;color:var(--n-500,#6F6C65);}' +
      '.kcl-dev{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--n-200,#E8E6E0);}' +
      '.kcl-dev:last-child{border-bottom:0;}' +
      '.kcl-dev b{display:block;font-size:.82rem;font-weight:650;color:var(--ink,#0A0F0D);}' +
      '.kcl-dev small{display:block;margin-top:2px;font-size:.72rem;color:var(--n-500,#6F6C65);}' +
      '.kcl-dev code{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.72rem;}' +
      '.kcl-dev.off b{color:var(--n-500,#6F6C65);}' +
      '.kcl-dev button{background:var(--surface,#FFFDFA);border:1px solid var(--n-200,#E8E6E0);color:var(--ink,#0A0F0D);border-radius:10px;padding:7px 12px;font:inherit;font-size:.76rem;font-weight:650;cursor:pointer;}' +
      '.kcl-dev button.kcl-confirm{border-color:var(--danger,#B3261E);color:var(--danger,#B3261E);}' +
      /* corner launcher */
      '#kcl-chip{position:fixed;left:20px;bottom:20px;z-index:900;display:inline-flex;align-items:center;gap:9px;' +
      'background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);border:1px solid rgba(0,0,0,.1);border-radius:999px;' +
      'padding:10px 16px 10px 13px;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;box-shadow:0 6px 22px rgba(5,59,44,.16);' +
      'transition:transform .15s,box-shadow .15s;}' +
      '#kcl-chip:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(5,59,44,.22);}' +
      '#kcl-chip .kcl-dot{width:9px;height:9px;border-radius:50%;background:#D99A2B;box-shadow:0 0 0 4px rgba(217,154,43,.16);flex:none;}' +
      '#kcl-chip[data-state="on"] .kcl-dot{background:var(--atlas,#0B6E4F);box-shadow:0 0 0 4px rgba(11,110,79,.18);}' +
      '#kcl-chip .kcl-mobile-ico{display:none;}' +
      '@media (max-width:640px){' +
      '#kcl-chip{left:14px;bottom:calc(88px + env(safe-area-inset-bottom,0px));width:48px;height:48px;padding:0;justify-content:center;}' +
      '#kcl-chip .kcl-t{display:none;}' +
      '#kcl-chip .kcl-mobile-ico{display:grid;place-items:center;}' +
      '#kcl-chip .kcl-mobile-ico svg{width:21px;height:21px;display:block;}' +
      '#kcl-chip .kcl-dot{position:absolute;top:5px;right:5px;width:7px;height:7px;box-shadow:0 0 0 2px var(--paper,#F7F5F0);}' +
      '}' +
      /* Docked variant: the chip lives in the sidebar brand row, in the empty
       * strip beside the wordmark. Floating bottom-left, it sat on top of the
       * Ultra upsell card. The sidebar is --ink, so the paper pill and the
       * atlas "on" dot both go invisible-dark here — hence the mint dot and the
       * translucent-white skin. font/letter-spacing are reset because #kcl-chip
       * declares `font:inherit` and .brand is 24px/700/-0.05em. */
      '#kcl-chip[data-docked]{position:static;z-index:auto;align-self:center;margin-inline-start:auto;' +
      'font-size:11px;font-weight:600;letter-spacing:0;white-space:nowrap;gap:7px;padding:5px 10px 5px 8px;' +
      'background:rgba(255,255,255,.06);color:var(--paper,#F7F5F0);border-color:rgba(255,255,255,.12);box-shadow:none;}' +
      '#kcl-chip[data-docked]:hover{transform:none;box-shadow:none;background:rgba(255,255,255,.10);}' +
      '#kcl-chip[data-docked] .kcl-dot{width:7px;height:7px;box-shadow:0 0 0 3px rgba(217,154,43,.16);}' +
      '#kcl-chip[data-docked][data-state="on"] .kcl-dot{background:var(--mint,#7DF2B0);box-shadow:0 0 0 3px rgba(125,242,176,.18);}' +
      '@media (max-width:420px){.kcl-status{padding:13px}.kcl-route{gap:7px}.kcl-node{min-width:50px;font-size:.62rem}.kcl-node-ico{width:34px;height:34px}.kcl-track{min-width:28px}.kcl-state{gap:8px}}' +
      '@media (prefers-reduced-motion:reduce){.kcl-status.kcl-arrive .kcl-track::before{animation:none;right:0}.kcl-status.kcl-arrive .kcl-track-dot{animation:none;left:100%}.kcl-status.kcl-arrive .kcl-node:last-child .kcl-node-ico{animation:none}.kcl-pulse{animation:none}}';
    document.head.appendChild(s);
  }

  /* The 6-digit pairing code is no longer shown. A till reaches this app through
   * the account gate anyway, so signing in on the second device already binds it
   * to this merchant — the code was a second, manual way to say the same thing.
   * The pairing endpoints stay in place: tills already paired in the field hold a
   * kiwiPairedVenue from a code, and removing the backend would unbind them. */
  function panelBody(biz) {
    return '' +
      '<p class="kcl-lead">' + esc(dt('panelLead')) + '</p>' +
      '<section class="kcl-status" id="kcl-status" role="status" aria-live="polite">' +
        '<div class="kcl-route" aria-hidden="true">' +
          '<span class="kcl-node"><span class="kcl-node-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2.75" width="14" height="18.5" rx="2.5"/><path d="M9 6.75h6M9 17.25h6"/></svg></span><span>' + esc(dt('till')) + '</span></span>' +
          '<span class="kcl-track"><span class="kcl-track-dot"></span></span>' +
          '<span class="kcl-node"><span class="kcl-node-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="15" rx="2.5"/><path d="M3 9h18M8 9v10"/></svg></span><span>' + esc(dt('dashboard')) + '</span></span>' +
        '</div>' +
        '<div class="kcl-state"><span class="kcl-d kcl-pulse"></span><span class="kcl-state-copy"><strong id="kcl-status-t">' + esc(dt('waiting')) + '</strong><small id="kcl-status-detail">' + esc(dt('waitingDetail')) + '</small></span><span class="kcl-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6.5 12.5 3.5 3.5 7.5-8"/></svg></span></div>' +
      '</section>' +
      '<button class="kcl-open" type="button" id="kcl-open">' + esc(dt('openHere')) + '</button>' +
      '<p class="kcl-hint">' + esc(dt('hintA')) + '<strong>' + esc(biz.name) + '</strong>' + esc(dt('hintB')) + '</p>' +
      '<section class="kcl-devices" id="kcl-devices" hidden></section>';
  }

  /* ── Caisses appairées : en retirer UNE ─────────────────────────────────────
   * Le jeton de caisse nomme maintenant son appareil (functions/auth/_lib.js ›
   * tillDeviceToken). Une tablette perdue, revendue ou partie avec un employé se
   * retire seule ici ; les autres caisses continuent d'encaisser. Elle ne revient
   * qu'avec un nouveau code. Le retrait demande un second appui. */
  function devLang() { var l = ''; try { l = localStorage.getItem('kiwiLang') || document.documentElement.lang || 'fr'; } catch (_) { l = 'fr'; } return /^ar/.test(l) ? 'ar' : /^en/.test(l) ? 'en' : 'fr'; }
  var DEV_T = {
    title: ['Caisses appairées', 'Paired tills', 'الصناديق المقترنة'],
    lead: ['Retirez un appareil perdu ou revendu : lui seul devra réappairer avec un nouveau code.', 'Remove a lost or sold device: only that one will need a new code to pair again.', 'أزل جهازًا مفقودًا أو مبيعًا: هو وحده سيحتاج إلى رمز جديد للاقتران.'],
    till: ['Caisse', 'Till', 'صندوق'],
    paired: ['appairée le', 'paired on', 'اقترن في'],
    seen: ['vue le', 'last seen', 'آخر ظهور'],
    removed: ['retirée le', 'removed on', 'أزيل في'],
    remove: ['Retirer', 'Remove', 'إزالة'],
    confirm: ['Confirmer le retrait', 'Confirm removal', 'تأكيد الإزالة'],
    none: ['Aucune caisse appairée sous son nom pour l’instant. Une caisse déjà en service apparaît ici à sa prochaine ouverture.', 'No till paired under its own name yet. A till already in use appears here the next time it opens.', 'لا يوجد صندوق مقترن باسمه بعد. يظهر الصندوق المستخدم هنا عند فتحه في المرة القادمة.'],
    failed: ['Retrait impossible pour l’instant. Réessayez.', 'Could not remove the device. Try again.', 'تعذرت الإزالة الآن. أعد المحاولة.'],
    /* The panel and the sidebar chip. */
    panelLead: ['La caisse est là où vos ventes entrent. Reliez votre terminal à ce commerce : chaque encaissement remontera aussitôt sur ce tableau de bord.', 'The till is where your sales come in. Link your terminal to this business: every payment will show up on this dashboard right away.', 'الصندوق هو حيث تدخل مبيعاتك. اربط جهازك بهذا المتجر: ستظهر كل عملية تحصيل فورا على لوحة التحكم هذه.'],
    dashboard: ['Tableau de bord', 'Dashboard', 'لوحة التحكم'],
    waiting: ['Connexion en attente', 'Waiting for the till', 'في انتظار الاتصال'],
    waitingDetail: ['Ouvrez Kiwi Caisse sur votre terminal', 'Open Kiwi Caisse on your terminal', 'افتح Kiwi Caisse على جهازك'],
    openHere: ['Ouvrir la caisse sur cet appareil', 'Open the till on this device', 'فتح الصندوق على هذا الجهاز'],
    hintA: ['Sur un autre appareil (tablette, terminal), ouvrez la caisse avec ce même compte Kiwi. Le terminal deviendra ', 'On another device (tablet, terminal), open the till with this same Kiwi account. The terminal will become ', 'على جهاز آخر (لوحي أو طرفي)، افتح الصندوق بحساب Kiwi نفسه. سيصبح الجهاز '],
    hintB: ['.', '.', '.'],
    drawerTitle: ['Connectez votre caisse', 'Connect your till', 'اربط صندوقك'],
    linked: ['Liaison établie', 'Linked', 'تم الربط'],
    liveFlow: ['flux de ventes actif', 'sales feed live', 'تدفق المبيعات نشط'],
    linkedTitle: ['Votre caisse est reliée', 'Your till is linked', 'صندوقك مرتبط'],
    localOnly: ['Connexion locale uniquement', 'Local connection only', 'اتصال محلي فقط'],
    localOnlyDetail: ['Utilisez « Ouvrir la caisse sur cet appareil » ci-dessous.', 'Use « Open the till on this device » below.', 'استخدم « فتح الصندوق على هذا الجهاز » أدناه.'],
    copied: ['Copié', 'Copied', 'تم النسخ'],
    chipOn: ['Caisse connectée', 'Till connected', 'الصندوق متصل'],
    chipAway: ['Caisse hors ligne', 'Till offline', 'الصندوق غير متصل'],
    chipOff: ['Connecter la caisse', 'Connect the till', 'ربط الصندوق'],
  };
  function dt(key) { var i = { fr: 0, en: 1, ar: 2 }[devLang()]; return DEV_T[key][i]; }
  function devDate(ts) {
    try { return new Intl.DateTimeFormat(devLang() === 'ar' ? 'ar-MA' : devLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); }
    catch (_) { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); }
  }
  function renderDevices(host, merchant, list) {
    if (!host) return;
    var rows = (list || []).map(function (d) {
      var tail = String(d.id).slice(-4);
      var when = d.revokedAt ? dt('removed') + ' ' + devDate(d.revokedAt)
        : (d.lastSeenAt ? dt('seen') + ' ' + devDate(d.lastSeenAt) : (d.pairedAt ? dt('paired') + ' ' + devDate(d.pairedAt) : ''));
      return '<div class="kcl-dev' + (d.revokedAt ? ' off' : '') + '"><span><b>' + esc(d.label || dt('till')) + ' <code>···' + esc(tail) + '</code></b><small>' + esc(when) + '</small></span>' +
        (d.revokedAt ? '' : '<button type="button" data-kcl-revoke="' + esc(d.id) + '">' + esc(dt('remove')) + '</button>') + '</div>';
    }).join('');
    host.innerHTML = '<h4>' + esc(dt('title')) + '</h4><p>' + esc(rows ? dt('lead') : dt('none')) + '</p>' + rows;
    host.hidden = false;
  }
  function loadDevices(host, merchant) {
    if (!host || !merchant || typeof fetch !== 'function') return;
    // Le serveur rend 100 caisses par page et un curseur (nextCursor) tant qu'il
    // en reste : on suit les pages (20 au plus) avant d'afficher la liste entière.
    var all = [], seen = {};
    function page(cursor, n) {
      return fetch('/api/pair/devices?merchant=' + encodeURIComponent(merchant) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
        { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || !j.ok) return n ? all : null;
          (j.devices || []).forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; all.push(d); } });
          return j.nextCursor && n < 19 ? page(j.nextCursor, n + 1) : all;
        });
    }
    page('', 0)
      .then(function (list) { if (list) renderDevices(host, merchant, list); })
      .catch(function () { /* hors ligne, ou hébergement statique : la section reste cachée */ });
  }
  function revokeDevice(host, merchant, button) {
    var id = button.getAttribute('data-kcl-revoke');
    if (!button.classList.contains('kcl-confirm')) { button.classList.add('kcl-confirm'); button.textContent = dt('confirm'); return; }
    button.disabled = true;
    fetch('/api/pair/devices', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant: merchant, deviceId: id }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || 'revoke-failed'); }); })
      .then(function () { loadDevices(host, merchant); })
      .catch(function () {
        button.disabled = false; button.classList.remove('kcl-confirm'); button.textContent = dt('remove');
        try { window.Kiwi && Kiwi.toast && Kiwi.toast(dt('failed'), { type: 'warn' }); } catch (_) {}
      });
  }

  /* Same-device hand-off. "Ouvrir la caisse sur cet appareil" opens the till in
   * THIS browser, so there is nothing to negotiate with a server: name the store
   * outright and let the till read it.
   *
   * This used to ride on the 6-digit code the panel minted on open. That minting
   * was dropped once the code stopped being displayed — sensible, but it left
   * ?pair=1 with nothing to identify the store by, so the till just kept whatever
   * store it was already bound to. On an account with a second shop that meant
   * the restaurant's dashboard opening the boutique's till, which is precisely
   * the confusion this button exists to avoid. */
  var HANDOFF = 'kiwiPairHandoff';
  function handOff(biz) {
    if (!biz) return;
    set(HANDOFF, JSON.stringify({
      merchant: biz.merchant, venueId: biz.venueId, type: biz.type,
      subtype: biz.subtype, name: biz.name, location: biz.location, ts: Date.now(),
    }));
  }

  function openPanel() {
    if (!window.Kiwi || !Kiwi.drawer) return;
    var biz = currentBiz(); if (!biz) return;
    css();
    remoteState = null;                       // fresh panel → re-learn from this open's create call
    enableLive(biz);                       // was a side effect of generateCode()
    var connected = connectedCodeFor(biz.merchant);
    // No code is minted just to open the panel any more — it isn't displayed, so
    // generating one would be a pointless server round-trip every time.
    var code = connected || '';

    var d = Kiwi.drawer({ title: dt('drawerTitle'), subtitle: biz.name, body: panelBody(biz), width: 440 });
    var el = d.el, cur = code, tick = null, connectedPainted = false;
    // Operator support has a fixed ownership banner above every client page.
    // Keep this drawer immediately below its measured height so the confirmation
    // title is never hidden; normal merchant sessions do not receive the class.
    var operatorBanner = document.getElementById('kiwi-op-banner');
    if (operatorBanner) {
      el.classList.add('kcl-under-operator');
      el.style.setProperty('--kcl-drawer-top', Math.ceil(operatorBanner.getBoundingClientRect().height) + 'px');
    }

    function $(sel) { return el.querySelector(sel); }
    function setCode(next) {
      cur = next;
      var c = $('#kcl-code'); if (c) c.textContent = next;
    }
    function markConnected() {
      var st = $('#kcl-status');
      if (st) {
        st.classList.add('on'); st.classList.remove('kcl-warn');
        // refresh() polls every second. Run the route handoff once per drawer,
        // then leave a still, truthful connected state instead of replaying it.
        if (!connectedPainted) { st.classList.add('kcl-arrive'); connectedPainted = true; }
      }
      var dot = st && st.querySelector('.kcl-d'); if (dot) dot.classList.remove('kcl-pulse');
      var t = $('#kcl-status-t'); if (t) t.textContent = dt('linked');
      var detail = $('#kcl-status-detail'); if (detail) detail.textContent = biz.name + ' · ' + dt('liveFlow');
      var heading = $('.kiwi-drawer-head h3'); if (heading) heading.textContent = dt('linkedTitle');
      updateChip();
    }
    // Reflect whether a cross-device pair is actually possible from here. Only the
    // 'reject' case changes anything — 'ok'/'absent'/null keep the default waiting
    // state (both cross-device and the same-browser demo path work in those cases).
    function setRemote(state) {
      if (connectedCodeFor(biz.merchant)) return;         // a live connection wins over any hint
      var st = $('#kcl-status'), t = $('#kcl-status-t'), detail = $('#kcl-status-detail'), hint = $('.kcl-hint'), dot = st && st.querySelector('.kcl-d');
      if (state === 'reject') {
        if (st) st.classList.add('kcl-warn');
        if (dot) dot.classList.remove('kcl-pulse');
        if (t) t.textContent = dt('localOnly');
        if (detail) detail.textContent = dt('localOnlyDetail');
        if (hint) hint.style.display = 'none';            // the "type this code on another device" path won't work
      } else {
        if (st) st.classList.remove('kcl-warn');
        if (dot) dot.classList.add('kcl-pulse');
        if (t) t.textContent = dt('waiting');
        if (detail) detail.textContent = dt('waitingDetail');
        if (hint) hint.style.display = '';
      }
    }
    function refresh() {
      if (!document.body.contains(el)) { if (tick) clearInterval(tick); tick = null; panel = null; return; }
      updateChip();  // keep the corner launcher truthful even if state shifts under us
      // connected?
      if (connectedCodeFor(biz.merchant)) { markConnected(); return; }
      // The countdown and auto-regeneration went with the code display; without a
      // visible code there is nothing to expire and nothing to refresh.
    }
    if (connected) markConnected(); else { refresh(); setRemote(remoteState); }
    tick = setInterval(refresh, 1000);

    loadDevices($('#kcl-devices'), biz.merchant);
    el.addEventListener('click', function (e) {
      var rv = e.target.closest('[data-kcl-revoke]');
      if (rv) { revokeDevice($('#kcl-devices'), biz.merchant, rv); return; }
      if (e.target.closest('#kcl-copy')) {
        try { navigator.clipboard.writeText(cur); } catch (_) {}
        var b = $('#kcl-copy'); if (b) { var o = b.textContent; b.textContent = dt('copied'); setTimeout(function () { b.textContent = o; }, 1400); }
        return;
      }
      if (e.target.closest('#kcl-regen')) { var n = generateCode(true); if (n) { setCode(n); refresh(); } return; }
      if (e.target.closest('#kcl-open')) {
        handOff(biz);   // say WHICH store, explicitly — see handOff()
        /* The app has one window: a second one cannot open, so go there. */
        if (window.KiwiApiBase && window.KiwiApiBase.native) { location.href = 'kiwi-caisse.html?pair=1'; return; }
        try { window.open('kiwi-caisse.html?pair=1', '_blank'); } catch (_) { location.href = 'kiwi-caisse.html?pair=1'; }
        return;
      }
    });

    markDismissed();  // opening then closing shouldn't re-nag this session; the chip stays
    panel = { close: d.close, setCode: setCode, setRemote: setRemote, el: el, onStorage: refresh };
  }

  /* ── Launcher (so the caisse is never "lost" after a dismiss) ───────────── */
  /* Home is the sidebar's brand row, whose right half is empty.
   *
   * Only above 860px, though: below that the sidebar becomes an off-canvas
   * drawer (assets/mobile.css), and a chip parked inside it would be
   * unreachable until the merchant opens the menu. `position:fixed` can't
   * rescue it either — the drawer's own transform becomes the containing block,
   * so the chip would stay off-screen with it. On phones, and on any page with
   * no sidebar, the launcher therefore stays a floating corner button. */
  var DOCK_MQ = '(min-width: 861px)';
  function chipHost() {
    if (!window.matchMedia(DOCK_MQ).matches) return null;
    return document.querySelector('.sidebar .brand');
  }
  function placeChip(b) {
    var host = chipHost();
    if (host) {
      if (b.parentNode !== host) host.appendChild(b);
      b.setAttribute('data-docked', '');
    } else {
      if (b.parentNode !== document.body) document.body.appendChild(b);
      b.removeAttribute('data-docked');
    }
  }
  function ensureChip(force) {
    /* #0147 · the launcher must never sit on an entry, lock or pairing gate
       ("Change role" already does that job there). A chip placed earlier is
       actively removed — e.g. after an idle re-lock. `force` is only for the
       explicit post-onboarding call below, which keeps its historical
       always-surface behavior. */
    var old = document.getElementById('kcl-chip');
    if (!realMerchant() || (!force && !dashReady())) {
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }
    css();
    var b = document.getElementById('kcl-chip');
    if (!b) {
      b = document.createElement('button');
      b.id = 'kcl-chip'; b.type = 'button';
      b.innerHTML = '<span class="kcl-dot"></span>' +
        '<span class="kcl-mobile-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 11h8M9 16h.01M12 16h.01M15 16h.01"/></svg></span>' +
        '<span class="kcl-t">' + esc(dt('chipOff')) + '</span>';
      b.addEventListener('click', openPanel);
    }
    placeChip(b);
    updateChip();
  }
  /* The till's own heartbeat, published by live-link.js from /api/feed.
   * isPaired() only remembers that a till was once paired IN THIS BROWSER: it
   * said "Caisse connectée" with the till switched off, while Plan de salle
   * said "Caisse hors ligne", and "Connecter la caisse" for a till paired from
   * an iPad and ringing right now. A store whose tills never poll the order
   * queue (boutique, spa) has no heartbeat at all, so `seen === 0` means
   * "unknown" and the local memory stays the answer there. */
  function tillPresence() {
    var p = window.KiwiTillPresence, biz = currentBiz();
    return p && biz && p.merchant === biz.merchant ? p : null;
  }
  function updateChip() {
    var b = document.getElementById('kcl-chip'); if (!b) return;
    var p = tillPresence();
    var state = isPaired() ? 'on' : 'off';
    if (p && p.fresh) state = 'on';
    else if (p && p.seen) state = 'away';
    var label = dt(state === 'on' ? 'chipOn' : state === 'away' ? 'chipAway' : 'chipOff');
    b.setAttribute('data-state', state);
    var t = b.querySelector('.kcl-t'); if (t) t.textContent = label;
    b.setAttribute('aria-label', label);
  }

  function dismissed() { try { return sessionStorage.getItem(SS_DISMISS) === '1'; } catch (_) { return false; } }
  function markDismissed() { try { sessionStorage.setItem(SS_DISMISS, '1'); } catch (_) {} }
  /* #0147 · offsetParent is ALWAYS null for position:fixed overlays, so the
     old `lock.offsetParent !== null` test never saw the visible lock and the
     launcher could sit on the PIN screen. Rects + computed style see it. */
  function lockVisible() {
    try {
      var lock = document.querySelector('[data-kiwi-lock]');
      if (!lock || !lock.isConnected) return false;
      var cs = getComputedStyle(lock);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden') return false;
      return lock.getClientRects().length > 0;
    } catch (_) { return false; }
  }
  function dashReady() {
    if (document.querySelector('.kob-root')) return false;                 // onboarding wizard still open
    if (lockVisible()) return false;                                       // login lock still visible
    return true;
  }

  /* Auto-appear on entry for a real, unpaired merchant (once per session);
   * always leave the launcher behind. */
  function maybePrompt() {
    if (!realMerchant()) return;
    ensureChip();
  }
  /* Brand-new business straight out of onboarding — always surface it. */
  function promptNewMerchant() {
    ensureChip(true);
  }

  window.KiwiCaisseLink = {
    slugMerchant: slugMerchant, generateCode: generateCode, openPanel: openPanel,
    maybePrompt: maybePrompt, promptNewMerchant: promptNewMerchant, isPaired: isPaired,
  };

  function boot() {
    // The caisse tab flips a code to status:'connected' → reflect it here live.
    window.addEventListener('storage', function (e) { if (e.key === K.pairings) { updateChip(); if (panel && panel.onStorage) panel.onStorage(); } });
    document.addEventListener('kiwi:till-presence', function () { try { updateChip(); } catch (_) {} });
    // Rotating a tablet across 860px swaps the sidebar for the drawer — follow it.
    try {
      window.matchMedia(DOCK_MQ).addEventListener('change', function () {
        var b = document.getElementById('kcl-chip'); if (b) placeChip(b);
      });
    } catch (_) {}
    setTimeout(function () { try { maybePrompt(); } catch (_) {} }, 1400);
    // The dashboard announces its unlock; a re-lock (idle, account switch)
    // must take the launcher back down. A cheap attribute observer on the
    // lock node beats polling: it only fires when the gate actually moves.
    /* dashboard.html dispatches the unlock on WINDOW. This listened on
       document, so it never fired: after the first code unlock (and every
       idle re-lock, which reloads the page) the chip was gone for good — and
       for a new store, where Terminaux starts switched off, it is the only
       way to pair the till. The lock also fades for ~280 ms before it is
       removed, so check again once it is really gone. */
    var onUnlock = function () {
      try { ensureChip(); } catch (_) {}
      setTimeout(function () { try { ensureChip(); } catch (_) {} }, 400);
    };
    window.addEventListener('kiwi:dashboard-unlocked', onUnlock);
    document.addEventListener('kiwi:dashboard-unlocked', onUnlock);
    try {
      var lockNode = document.querySelector('[data-kiwi-lock]');
      if (lockNode && window.MutationObserver) {
        new MutationObserver(function () { try { ensureChip(); } catch (_) {} })
          .observe(lockNode, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
